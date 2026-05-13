"""
readiness.py — Outreach Readiness Scoring Engine
==================================================
Evaluates every lead in the entities table across 8 dimensions,
assigns an outreach_readiness_status, and gates the GAS outreach
queue so only contactable, valuable, safe-to-email leads get through.

USAGE:
  python readiness.py                          # score all unscored leads
  python readiness.py --batch 500              # score up to 500 leads
  python readiness.py --all                    # rescore everything
  python readiness.py --entity-id 1234         # rescore a single entity
  python readiness.py --dry-run                # score without writing back
  python readiness.py --report                 # print summary stats only

TRIGGERED BY:
  - POST /api/outreach/readiness/run           (api.py endpoint)
  - Cron job / daily scheduler
  - After enrichment batch completes
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import db_pg
import config
from email_guard import (
    validate_format,
    check_risk,
    is_suppressed,
    ROLE_PREFIXES,
    BLOCKED_PREFIXES,
)

logger = logging.getLogger("readiness")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ── Scoring weights (must sum to 1.0) ─────────────────────────────────────────
WEIGHTS = {
    "contact_quality":      0.25,
    "email_quality":        0.25,
    "authority":            0.15,
    "sector_value":         0.15,
    "location_fit":         0.10,
    "revenue_potential":    0.10,
}
# deliverability_risk is subtracted after weighting (up to -30 points penalty)
DELIVERABILITY_RISK_PENALTY_MAX = 30

# ── Sector value table (maps config.SECTOR_PRIORITY + contract estimates) ──────
SECTOR_VALUE_MAP: dict[str, int] = {
    # Priority 1 — highest value
    "offices":              95, "serviced_offices":   95, "coworking":          90,
    "property_management":  95, "residential_blocks": 90,
    "healthcare":           90, "education":          85,
    # Priority 2
    "automotive":           70, "gyms":               65, "hospitality":        65,
    "industrial":           70,
    # Priority 3
    "retail":               45, "salons":             40,
    "community_venues":     40, "religious_centres":  35,
    # Catch-all
    "other":                25,
}

# ── Decision-maker role signals ────────────────────────────────────────────────
_DM_PATTERNS = re.compile(
    r"\b(director|owner|founder|ceo|coo|md|managing director|head of|"
    r"facilities manager|property manager|office manager|operations manager|"
    r"estate manager|general manager|principal|proprietor|partner)\b",
    re.IGNORECASE,
)

# ── Placeholder email patterns ────────────────────────────────────────────────
_PLACEHOLDER_RE = re.compile(
    r"(example\.com|test@|placeholder|yourname|user@|email@email|"
    r"@domain\.com|name@company|abc@|xyz@|123@)",
    re.IGNORECASE,
)

# ── Borough tier maps ─────────────────────────────────────────────────────────
_PRIORITY_BOROUGHS   = set(b.lower() for b in config.PRIORITY_BOROUGHS)
_SECONDARY_BOROUGHS  = set(b.lower() for b in config.SECONDARY_BOROUGHS)


# ══════════════════════════════════════════════════════════════════════════════
# Score result dataclass
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class ReadinessResult:
    entity_id:                  int
    outreach_readiness_score:   int = 0       # 0–100 composite
    contact_quality_score:      int = 0
    email_quality_score:        int = 0
    authority_score:            int = 0
    sector_value_score:         int = 0
    location_fit_score:         int = 0
    revenue_potential_score:    int = 0
    deliverability_risk_score:  int = 0       # higher = worse
    outreach_readiness_status:  str = "MANUAL_REVIEW"
    hvt_tier:                   Optional[str] = None
    enrichment_required:        bool = False
    enrichment_reason:          Optional[str] = None
    suppression_reason:         Optional[str] = None
    recommended_next_action:    Optional[str] = None
    score_notes:                list = field(default_factory=list)


# ══════════════════════════════════════════════════════════════════════════════
# Individual dimension scorers
# ══════════════════════════════════════════════════════════════════════════════

def score_contact_quality(entity: dict) -> tuple[int, list[str]]:
    """
    Does the entity have any real way to reach a human?
    Score 0–100.
    """
    score = 0
    notes = []
    email = (entity.get("primary_email") or "").strip().lower()
    phone = (entity.get("phone") or "").strip()
    website = (entity.get("website") or "").strip()
    contact_name = (entity.get("contact_name") or "").strip()

    if email:
        score += 45
        notes.append("has_email:+45")
        # Deduct if it's a role/blocked address (still has email, just lower confidence)
        local = email.split("@")[0]
        if local in ROLE_PREFIXES:
            score -= 15
            notes.append("role_email:-15")
        elif local in BLOCKED_PREFIXES:
            score -= 35
            notes.append("blocked_prefix:-35")
    else:
        notes.append("no_email")

    if phone:
        score += 25
        notes.append("has_phone:+25")

    if website:
        score += 15
        notes.append("has_website:+15")

    if contact_name:
        score += 15
        notes.append("has_contact_name:+15")

    return max(0, min(100, score)), notes


def score_email_quality(entity: dict) -> tuple[int, list[str]]:
    """
    How trustworthy / reachable is the primary_email specifically?
    Score 0–100. Returns 0 if no email.
    """
    email = (entity.get("primary_email") or "").strip().lower()
    validation_status = (entity.get("email_validation_status") or "unknown")
    notes = []

    if not email:
        return 0, ["no_email"]

    # Suppressed / already bounced = instant 0
    if validation_status == "invalid":
        return 0, ["validation_status:invalid"]
    if is_suppressed(email):
        return 0, ["on_suppression_list"]

    # Placeholder / obviously fake
    if _PLACEHOLDER_RE.search(email):
        return 5, ["placeholder_email"]

    score = 0

    # RFC format check
    ok, reason = validate_format(email)
    if not ok:
        return 0, [f"invalid_format:{reason}"]
    score += 30
    notes.append("valid_format:+30")

    # Risk classification
    risk, reason = check_risk(email)
    if risk == "blocked":
        return 0, [f"blocked:{reason}"]

    if risk == "valid":
        score += 45
        notes.append("not_role_email:+45")
    else:
        # risky (role prefix)
        score += 20
        notes.append("role_email:+20")

    # Validation status bonus
    if validation_status == "valid":
        score += 25
        notes.append("validation_status:valid:+25")
    elif validation_status == "risky":
        score += 10
        notes.append("validation_status:risky:+10")
    elif validation_status == "unknown":
        score += 5  # no info, small neutral bonus
        notes.append("validation_status:unknown:+5")

    return min(100, score), notes


def score_authority(entity: dict) -> tuple[int, list[str]]:
    """
    Are we likely emailing the decision-maker?
    Score 0–100.
    """
    score = 0
    notes = []
    contact_name = (entity.get("contact_name") or "").strip()
    contact_role = (entity.get("contact_role") or "").strip()
    email = (entity.get("primary_email") or "").strip().lower()

    if contact_name:
        score += 25
        notes.append("has_contact_name:+25")

    if contact_role:
        score += 15
        notes.append("has_contact_role:+15")
        # Is the role a decision-maker?
        if _DM_PATTERNS.search(contact_role):
            score += 45
            notes.append("dm_role_detected:+45")
        else:
            score += 10
            notes.append("non_dm_role:+10")

    # If the email local part looks like a personal name (first.last, j.smith, etc.)
    if email:
        local = email.split("@")[0]
        if re.match(r"^[a-z]+\.[a-z]+$", local):
            score += 15
            notes.append("personal_email_pattern:+15")
        elif re.match(r"^[a-z]+[0-9]*$", local) and local not in ROLE_PREFIXES:
            score += 5
            notes.append("likely_personal_email:+5")

    return min(100, score), notes


def score_sector_value(entity: dict) -> tuple[int, list[str]]:
    """
    How attractive is this entity's sector to AskMiro?
    Score 0–100.
    """
    sector = (entity.get("sector") or "").strip().lower().replace(" ", "_")
    value = SECTOR_VALUE_MAP.get(sector, SECTOR_VALUE_MAP.get("other", 25))
    return value, [f"sector:{sector}:{value}"]


def score_location_fit(entity: dict) -> tuple[int, list[str]]:
    """
    Is this entity in AskMiro's primary service area?
    Score 0–100.
    """
    borough = (entity.get("borough") or "").strip().lower()
    postcode = (entity.get("postcode") or "").strip()
    notes = []

    if borough in _PRIORITY_BOROUGHS:
        return 100, [f"priority_borough:{borough}"]
    if borough in _SECONDARY_BOROUGHS:
        return 65, [f"secondary_borough:{borough}"]

    # Fall back to postcode check if no borough
    if postcode and config.is_london_postcode(postcode):
        return 40, [f"london_postcode:{postcode}"]

    if borough:
        return 15, [f"outside_service_area:{borough}"]

    return 20, ["no_location_data"]  # unknown — don't fully penalise


def score_revenue_potential(entity: dict) -> tuple[int, list[str]]:
    """
    What's the estimated revenue upside if this lead converts?
    Score 0–100.
    """
    sector = (entity.get("sector") or "other").strip().lower().replace(" ", "_")
    lead_score = int(entity.get("lead_score") or 0)
    review_count = int(entity.get("review_count") or 0)

    # Base from sector contract estimates
    monthly_est = config.SECTOR_CONTRACT_ESTIMATES.get(sector, 1000)

    # Normalise to 0-100 (£700 → 20, £4500 → 100)
    base = int(min(100, max(10, (monthly_est / 4500) * 100)))

    # Lead quality multiplier (review count is a proxy for business size)
    if review_count >= 50:
        base = min(100, base + 15)
    elif review_count >= 20:
        base = min(100, base + 8)

    # Lead score boost
    if lead_score >= 80:
        base = min(100, base + 10)
    elif lead_score >= 60:
        base = min(100, base + 5)

    return base, [f"monthly_est:£{monthly_est}:score:{base}"]


def score_deliverability_risk(entity: dict) -> tuple[int, list[str]]:
    """
    How likely is an email to bounce or cause complaints?
    Score 0–100. Higher = worse. 100 = never send.
    """
    email = (entity.get("primary_email") or "").strip().lower()
    validation_status = (entity.get("email_validation_status") or "unknown")
    bounce_detected = entity.get("bounce_detected", False)
    notes = []

    # Hard stops
    if not email:
        return 80, ["no_email:risk:80"]

    if bounce_detected:
        return 100, ["bounce_detected:risk:100"]

    if is_suppressed(email):
        return 100, ["suppressed:risk:100"]

    if validation_status == "invalid":
        return 90, ["validation_invalid:risk:90"]

    # Accumulate risk
    risk = 10  # base — everyone starts with a small non-zero risk

    ok, reason = validate_format(email)
    if not ok:
        return 90, [f"invalid_format:{reason}:risk:90"]

    rfk, rreason = check_risk(email)
    if rfk == "blocked":
        return 100, [f"blocked:{rreason}"]
    if rfk == "risky":
        risk += 25
        notes.append(f"role_email:risk:+25")

    if _PLACEHOLDER_RE.search(email):
        risk += 50
        notes.append("placeholder_email:risk:+50")

    if validation_status == "unknown":
        risk += 10
        notes.append("unvalidated:risk:+10")

    return min(100, risk), notes


# ══════════════════════════════════════════════════════════════════════════════
# Composite scorer
# ══════════════════════════════════════════════════════════════════════════════

def score_entity(entity: dict) -> ReadinessResult:
    """
    Run all 8 dimension scorers and produce a ReadinessResult.
    """
    result = ReadinessResult(entity_id=entity["id"])

    cq, cq_notes = score_contact_quality(entity)
    eq, eq_notes = score_email_quality(entity)
    au, au_notes = score_authority(entity)
    sv, sv_notes = score_sector_value(entity)
    lf, lf_notes = score_location_fit(entity)
    rp, rp_notes = score_revenue_potential(entity)
    dr, dr_notes = score_deliverability_risk(entity)

    result.contact_quality_score     = cq
    result.email_quality_score       = eq
    result.authority_score           = au
    result.sector_value_score        = sv
    result.location_fit_score        = lf
    result.revenue_potential_score   = rp
    result.deliverability_risk_score = dr

    result.score_notes = (
        cq_notes + eq_notes + au_notes +
        sv_notes + lf_notes + rp_notes + dr_notes
    )

    # Weighted composite
    composite = (
        cq * WEIGHTS["contact_quality"] +
        eq * WEIGHTS["email_quality"] +
        au * WEIGHTS["authority"] +
        sv * WEIGHTS["sector_value"] +
        lf * WEIGHTS["location_fit"] +
        rp * WEIGHTS["revenue_potential"]
    )

    # Apply deliverability risk penalty (risk 0–100 → penalty 0–30)
    risk_penalty = (dr / 100) * DELIVERABILITY_RISK_PENALTY_MAX
    composite = max(0, composite - risk_penalty)
    result.outreach_readiness_score = int(round(composite))

    # Assign status via decision tree
    result.outreach_readiness_status, result.recommended_next_action = _assign_status(result, entity)

    # Assign HVT tier
    result.hvt_tier = _assign_hvt_tier(result)

    # Flag enrichment need
    result.enrichment_required, result.enrichment_reason = _check_enrichment(result, entity)

    return result


def _assign_status(result: ReadinessResult, entity: dict) -> tuple[str, str]:
    """
    Decision tree — order matters. First match wins.
    Returns (status, recommended_next_action).
    """
    email  = (entity.get("primary_email") or "").strip()
    phone  = (entity.get("phone") or "").strip()
    dr     = result.deliverability_risk_score
    sv     = result.sector_value_score
    cq     = result.contact_quality_score
    eq     = result.email_quality_score
    au     = result.authority_score
    rs     = result.outreach_readiness_score

    # ── Hard suppression gates ────────────────────────────────────────────────
    if dr >= 100:
        result.suppression_reason = "bad_email_or_bounce"
        return ("SUPPRESSED_BAD_EMAIL",
                "Remove from queue. Add to suppression list. Seek alternative contact.")

    # Is this sector we ever serve?
    if sv < 20:
        result.suppression_reason = "wrong_sector"
        return ("SUPPRESSED_WRONG_SECTOR",
                "Do not contact. Sector below AskMiro minimum threshold.")

    # Too low across the board to be worth anything even if contacted
    if rs < 15 and sv < 40:
        result.suppression_reason = "low_value_low_contact"
        return ("SUPPRESSED_LOW_VALUE",
                "Archive lead. Insufficient value and contact quality.")

    # ── No email path ────────────────────────────────────────────────────────
    if not email:
        if phone and sv >= 60:
            return ("PHONE_FIRST",
                    "Call first. High-value lead with no email. Try to capture email on call.")
        if sv >= 70:
            return ("HIGH_VALUE_NOT_CONTACTABLE",
                    "Flag for enrichment. Pull contact from Companies House or LinkedIn.")
        return ("NEEDS_CONTACT_ENRICHMENT",
                "Find email via website scrape, Companies House, or manual research.")

    # ── Email exists but risky / unvalidated ──────────────────────────────────
    if eq < 30:
        return ("NEEDS_EMAIL_VERIFICATION",
                "Run MX check and risk reclassification before sending.")

    # ── Has email and it's decent, but no DM contact ─────────────────────────
    if au < 25 and sv >= 65:
        return ("NEEDS_DECISION_MAKER",
                "Find decision-maker name/role. Current contact is generic. "
                "Try Companies House or website /about page.")

    # ── Ready to go ──────────────────────────────────────────────────────────
    if rs >= 55:
        return ("READY_FOR_OUTREACH",
                "Queue for next outreach batch. Use sector-matched template.")

    # ── Borderline ───────────────────────────────────────────────────────────
    if rs >= 35:
        return ("MANUAL_REVIEW",
                "Borderline lead. Human review needed before committing outreach budget.")

    return ("NEEDS_CONTACT_ENRICHMENT",
            "Insufficient contact or value data. Enrich before outreach.")


def _assign_hvt_tier(result: ReadinessResult) -> Optional[str]:
    """
    Tier A: Top 10-20% — high score, high sector value
    Tier B: Next 20%
    Tier C: Mid-range (worth batching but not priority)
    Tier D: Low priority
    """
    rs = result.outreach_readiness_score
    sv = result.sector_value_score

    if rs >= 72 and sv >= 70:
        return "A"
    if rs >= 52 and sv >= 50:
        return "B"
    if rs >= 32:
        return "C"
    return "D"


def _check_enrichment(result: ReadinessResult, entity: dict) -> tuple[bool, Optional[str]]:
    """Return (needs_enrichment, reason)."""
    status = result.outreach_readiness_status
    enrichment_statuses = {
        "NEEDS_CONTACT_ENRICHMENT", "NEEDS_DECISION_MAKER",
        "HIGH_VALUE_NOT_CONTACTABLE",
    }
    if status in enrichment_statuses:
        return True, result.recommended_next_action
    return False, None


# ══════════════════════════════════════════════════════════════════════════════
# Database I/O
# ══════════════════════════════════════════════════════════════════════════════

def fetch_entities_to_score(
    conn,
    batch: int = 1000,
    rescore_all: bool = False,
    entity_id: Optional[int] = None,
) -> list[dict]:
    """Pull entities that need scoring."""
    if entity_id:
        return db_pg.fetchall(conn, """
            SELECT id, primary_email, phone, website, contact_name, contact_role,
                   sector, borough, postcode, lead_score, review_count,
                   email_validation_status, outreach_readiness_status,
                   bounce_detected, outreach_sent_count,
                   last_readiness_checked_at
            FROM entities
            WHERE id = %s
        """, (entity_id,))

    if rescore_all:
        where = "WHERE TRUE"
        params = ()
    else:
        # Only score leads that have never been scored, or were scored >7 days ago
        where = """
            WHERE (last_readiness_checked_at IS NULL
                   OR last_readiness_checked_at < NOW() - INTERVAL '7 days')
        """
        params = ()

    return db_pg.fetchall(conn, f"""
        SELECT id, primary_email, phone, website, contact_name, contact_role,
               sector, borough, postcode, lead_score, review_count,
               email_validation_status, outreach_readiness_status,
               bounce_detected, outreach_sent_count,
               last_readiness_checked_at
        FROM entities
        {where}
        ORDER BY
            CASE WHEN last_readiness_checked_at IS NULL THEN 0 ELSE 1 END,
            lead_score DESC NULLS LAST
        LIMIT %s
    """, params + (batch,))


def write_result(conn, result: ReadinessResult, dry_run: bool = False) -> None:
    """Write scores back to entities and append to readiness_score_history."""
    if dry_run:
        return

    db_pg.execute(conn, """
        UPDATE entities SET
            outreach_readiness_status  = %s,
            outreach_readiness_score   = %s,
            contact_quality_score      = %s,
            email_quality_score        = %s,
            authority_score            = %s,
            sector_value_score         = %s,
            location_fit_score         = %s,
            revenue_potential_score    = %s,
            deliverability_risk_score  = %s,
            hvt_tier                   = %s,
            enrichment_required        = %s,
            enrichment_reason          = %s,
            suppression_reason         = %s,
            recommended_next_action    = %s,
            last_readiness_checked_at  = NOW()
        WHERE id = %s
    """, (
        result.outreach_readiness_status,
        result.outreach_readiness_score,
        result.contact_quality_score,
        result.email_quality_score,
        result.authority_score,
        result.sector_value_score,
        result.location_fit_score,
        result.revenue_potential_score,
        result.deliverability_risk_score,
        result.hvt_tier,
        result.enrichment_required,
        result.enrichment_reason,
        result.suppression_reason,
        result.recommended_next_action,
        result.entity_id,
    ))

    # History row
    try:
        import json as _json
        db_pg.execute(conn, """
            INSERT INTO readiness_score_history
                (entity_id, readiness_status, readiness_score,
                 contact_quality, email_quality, authority,
                 sector_value, deliverability_risk, reasons)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            result.entity_id,
            result.outreach_readiness_status,
            result.outreach_readiness_score,
            result.contact_quality_score,
            result.email_quality_score,
            result.authority_score,
            result.sector_value_score,
            result.deliverability_risk_score,
            _json.dumps(result.score_notes),
        ))
    except Exception as exc:
        logger.debug("readiness_score_history write skipped: %s", exc)


def queue_for_enrichment(conn, result: ReadinessResult, entity: dict,
                          dry_run: bool = False) -> None:
    """Insert into contact_enrichment_queue if enrichment is needed."""
    if not result.enrichment_required or dry_run:
        return

    priority = 1 if result.sector_value_score >= 70 else (
               2 if result.sector_value_score >= 50 else 3
    )
    name = (entity.get("name") or "").strip()
    website = (entity.get("website") or "").strip()

    try:
        enrichment_type = _enrichment_type(result)
        notes = f"[{enrichment_type}] {result.enrichment_reason or ''}"
        db_pg.execute(conn, """
            INSERT INTO contact_enrichment_queue
                (entity_id, enrichment_status, enrichment_priority, enrichment_notes)
            VALUES (%s, 'pending', %s, %s)
            ON CONFLICT (entity_id) DO UPDATE SET
                enrichment_status   = 'pending',
                enrichment_priority = LEAST(contact_enrichment_queue.enrichment_priority, EXCLUDED.enrichment_priority),
                enrichment_notes    = EXCLUDED.enrichment_notes,
                updated_at          = NOW()
        """, (
            result.entity_id,
            priority,
            notes,
        ))
    except Exception as exc:
        logger.debug("Enrichment queue insert skipped (table may not exist): %s", exc)


def _enrichment_type(result: ReadinessResult) -> str:
    status = result.outreach_readiness_status
    if status == "NEEDS_DECISION_MAKER":
        return "decision_maker"
    if status == "HIGH_VALUE_NOT_CONTACTABLE":
        return "full_contact"
    if status == "NEEDS_EMAIL_VERIFICATION":
        return "email_verify"
    return "contact_search"


# ══════════════════════════════════════════════════════════════════════════════
# Main runner
# ══════════════════════════════════════════════════════════════════════════════

def run(
    batch: int = 1000,
    rescore_all: bool = False,
    entity_id: Optional[int] = None,
    dry_run: bool = False,
    verbose: bool = False,
) -> dict:
    """
    Main entry point. Returns a summary dict.
    Called by CLI and by api.py endpoint.
    """
    started_at = datetime.now(timezone.utc)
    counts = {
        "total": 0, "scored": 0, "errors": 0,
        "READY_FOR_OUTREACH": 0, "NEEDS_CONTACT_ENRICHMENT": 0,
        "NEEDS_EMAIL_VERIFICATION": 0, "NEEDS_DECISION_MAKER": 0,
        "PHONE_FIRST": 0, "HIGH_VALUE_NOT_CONTACTABLE": 0,
        "SUPPRESSED_BAD_EMAIL": 0, "SUPPRESSED_LOW_VALUE": 0,
        "SUPPRESSED_WRONG_SECTOR": 0, "SUPPRESSED_DUPLICATE": 0,
        "MANUAL_REVIEW": 0,
        "tier_A": 0, "tier_B": 0, "tier_C": 0, "tier_D": 0,
    }

    with db_pg.transaction() as conn:
        entities = fetch_entities_to_score(
            conn, batch=batch, rescore_all=rescore_all, entity_id=entity_id
        )
        counts["total"] = len(entities)
        logger.info("readiness: scoring %d entities (dry_run=%s)", len(entities), dry_run)

        for entity in entities:
            try:
                result = score_entity(entity)

                if verbose:
                    logger.info(
                        "  [%d] %s → %s (score=%d tier=%s)",
                        entity["id"],
                        (entity.get("primary_email") or "no-email"),
                        result.outreach_readiness_status,
                        result.outreach_readiness_score,
                        result.hvt_tier,
                    )

                write_result(conn, result, dry_run=dry_run)
                queue_for_enrichment(conn, result, entity, dry_run=dry_run)

                counts["scored"] += 1
                status = result.outreach_readiness_status
                if status in counts:
                    counts[status] += 1
                tier_key = f"tier_{result.hvt_tier}" if result.hvt_tier else "tier_D"
                if tier_key in counts:
                    counts[tier_key] += 1

            except Exception as exc:
                counts["errors"] += 1
                logger.error("readiness: error scoring entity %s: %s", entity.get("id"), exc)

    elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
    counts["elapsed_seconds"] = round(elapsed, 2)
    counts["dry_run"] = dry_run

    logger.info(
        "readiness: done — %d scored, %d ready, %d enrichment, %d suppressed, "
        "%d errors in %.1fs",
        counts["scored"],
        counts["READY_FOR_OUTREACH"],
        counts["NEEDS_CONTACT_ENRICHMENT"] + counts["NEEDS_DECISION_MAKER"]
            + counts["HIGH_VALUE_NOT_CONTACTABLE"],
        counts["SUPPRESSED_BAD_EMAIL"] + counts["SUPPRESSED_LOW_VALUE"]
            + counts["SUPPRESSED_WRONG_SECTOR"],
        counts["errors"],
        elapsed,
    )

    return counts


def print_report(counts: dict) -> None:
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  OUTREACH READINESS REPORT")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  Total scored:            {counts.get('total', 0)}")
    print(f"  ✅ READY_FOR_OUTREACH:   {counts.get('READY_FOR_OUTREACH', 0)}")
    print(f"  📞 PHONE_FIRST:          {counts.get('PHONE_FIRST', 0)}")
    print(f"  🔍 NEEDS_DM_CONTACT:     {counts.get('NEEDS_DECISION_MAKER', 0)}")
    print(f"  📧 EMAIL_VERIFICATION:   {counts.get('NEEDS_EMAIL_VERIFICATION', 0)}")
    print(f"  🔎 CONTACT_ENRICHMENT:   {counts.get('NEEDS_CONTACT_ENRICHMENT', 0)}")
    print(f"  💎 HIGH_VALUE_NO_EMAIL:  {counts.get('HIGH_VALUE_NOT_CONTACTABLE', 0)}")
    print(f"  👁  MANUAL_REVIEW:       {counts.get('MANUAL_REVIEW', 0)}")
    print(f"  🚫 SUPPRESSED (bad):     {counts.get('SUPPRESSED_BAD_EMAIL', 0)}")
    print(f"  🚫 SUPPRESSED (value):   {counts.get('SUPPRESSED_LOW_VALUE', 0)}")
    print(f"  🚫 SUPPRESSED (sector):  {counts.get('SUPPRESSED_WRONG_SECTOR', 0)}")
    print(f"\n  HVT Tiers:")
    print(f"    Tier A (top):  {counts.get('tier_A', 0)}")
    print(f"    Tier B:        {counts.get('tier_B', 0)}")
    print(f"    Tier C:        {counts.get('tier_C', 0)}")
    print(f"    Tier D:        {counts.get('tier_D', 0)}")
    print(f"\n  Errors:     {counts.get('errors', 0)}")
    print(f"  Elapsed:    {counts.get('elapsed_seconds', 0)}s")
    if counts.get("dry_run"):
        print("\n  ⚠  DRY RUN — no data was written.")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")


# ══════════════════════════════════════════════════════════════════════════════
# CLI entry point
# ══════════════════════════════════════════════════════════════════════════════

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="AskMiro Outreach Readiness Scoring Engine"
    )
    p.add_argument("--batch",     type=int, default=1000, help="Max leads per run (default 1000)")
    p.add_argument("--all",       action="store_true",    help="Rescore all entities, not just stale ones")
    p.add_argument("--entity-id", type=int, default=None, help="Score a single entity by ID")
    p.add_argument("--dry-run",   action="store_true",    help="Score without writing back to DB")
    p.add_argument("--report",    action="store_true",    help="Print summary stats and exit")
    p.add_argument("--verbose",   action="store_true",    help="Print each entity's result")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()

    if args.report:
        # Just print current distribution from DB without scoring
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT outreach_readiness_status AS status, COUNT(*) AS cnt
                FROM entities
                GROUP BY outreach_readiness_status
                ORDER BY cnt DESC
            """)
        counts = {r["status"] or "NULL": r["cnt"] for r in rows}
        print_report(counts)
        sys.exit(0)

    counts = run(
        batch=args.batch,
        rescore_all=args.all,
        entity_id=args.entity_id,
        dry_run=args.dry_run,
        verbose=args.verbose,
    )
    print_report(counts)
