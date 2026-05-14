"""
crm_sync.py — AskMiro Lead Intelligence → CRM Bridge
=====================================================
Automation-first pipeline: qualifies leads, pushes to GAS CRM,
and polls for status writeback. No human intervention required
for the normal outbound flow.

Flow:
  Lead Intelligence scores lead
  → push_qualified_leads() called by scheduler every 30 min
  → POSTs to GAS outreach.handoff (with AI-generated email body)
  → GAS auto-sends, follows up, classifies replies
  → sync_status_from_crm() polls GAS every 2 hours for updates
  → local pipeline_leads + crm_handoffs updated

Human only sees the exception queue in AskMiro Ops frontend.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Optional

# Load .env so env vars are available when running standalone or in tests
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env", override=False)
except ImportError:
    pass

import db_pg

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────
# QUALIFIED LEAD QUERY (Postgres normalized schema)
# ──────────────────────────────────────────────────────────────────────
# After the April 1 migration (commit 73e229c), data lives in the new
# normalized tables — entities, opportunity_scores, opportunities,
# contacts, entity_source_links, addresses. The legacy `lead_records`
# table no longer exists. This single SELECT replaces the old query;
# every callsite uses it via _select_qualified_rows().
#
# Maintains identical output column names to the old schema so the
# downstream _push_one() payload mapping continues to work unchanged.
# ──────────────────────────────────────────────────────────────────────
_QUALIFIED_LEAD_SQL = """
SELECT
    e.id                                    AS id,
    e.id                                    AS entity_id,
    esl.source_record_id                    AS place_id,
    e.canonical_name                        AS business_name,
    LOWER(COALESCE(e.sector, ''))           AS normalized_sector,
    a.borough                               AS borough,
    a.line1                                 AS address,
    a.postcode                              AS postcode,
    e.primary_phone                         AS phone,
    e.primary_email                         AS email,
    c.full_name                             AS contact_name,
    os.total_score                          AS priority_score,
    c.job_title                             AS ai_decision_maker_type,
    COALESCE(os.next_best_action, '')       AS trigger_summary,
    ''                                      AS recommended_offer,
    ''                                      AS buying_signal_types,
    COALESCE(o.current_stage::TEXT, 'new')  AS pipeline_status,
    op.cold_email                           AS cold_email,
    op.follow_up_email                      AS follow_up_email
FROM entities e
JOIN entity_source_links esl
    ON esl.entity_id = e.id AND esl.source = 'google_maps'
JOIN opportunity_scores os
    ON os.entity_id = e.id
LEFT JOIN opportunities o
    ON o.entity_id = e.id
LEFT JOIN contacts c
    ON c.entity_id = e.id AND c.is_primary = TRUE
LEFT JOIN entity_locations el
    ON el.entity_id = e.id AND el.is_primary = TRUE
LEFT JOIN addresses a
    ON a.id = el.address_id
LEFT JOIN outreach_packages op
    ON op.entity_id = e.id OR op.place_id = esl.source_record_id
LEFT JOIN crm_handoffs ch
    ON ch.place_id = esl.source_record_id
WHERE os.total_score >= %s
  AND e.active = TRUE
  AND COALESCE(e.primary_email, '') != ''
  AND COALESCE(ch.place_id, '') = ''
  AND COALESCE(o.current_stage::TEXT, 'new') IN
      ('new', 'enriched', 'ready_to_contact')
  AND NOT EXISTS (
      SELECT 1 FROM email_suppressions es
      WHERE es.email = LOWER(e.primary_email) AND es.active = TRUE
  )
ORDER BY os.total_score DESC
LIMIT %s
"""

def _select_qualified_rows(conn, min_score: int, limit: int) -> list[dict]:
    """Return list of dicts matching the legacy lead_records shape."""
    return db_pg.fetchall(conn, _QUALIFIED_LEAD_SQL, (min_score, limit))

# ── CONFIG ────────────────────────────────────────────────────
# Set these in .env:
#   GAS_ENDPOINT=https://script.google.com/macros/s/.../exec
#   GAS_TOKEN=your_ops_token
#   CRM_MIN_SCORE=65
#   CRM_BATCH_SIZE=25
# Read dynamically so .env changes are always picked up at call time
def _cfg():
    return {
        "endpoint":   os.getenv("GAS_ENDPOINT", ""),
        "token":      os.getenv("GAS_TOKEN", ""),
        "min_score":  int(os.getenv("CRM_MIN_SCORE", "65")),
        "batch_size": int(os.getenv("CRM_BATCH_SIZE", "25")),
    }

# Module-level aliases kept for backward compat — resolved lazily via _cfg()
GAS_ENDPOINT    = os.getenv("GAS_ENDPOINT", "")
GAS_TOKEN       = os.getenv("GAS_TOKEN", "")
CRM_MIN_SCORE   = int(os.getenv("CRM_MIN_SCORE", "65"))
CRM_BATCH_SIZE  = int(os.getenv("CRM_BATCH_SIZE", "25"))

# Map Python normalized_sector → GAS segment values
_SECTOR_MAP: dict[str, str] = {
    "offices":             "Office",
    "office":              "Office",
    "coworking":           "Office",
    "serviced_offices":    "Office",
    "property_management": "Office",
    "healthcare":          "Healthcare",
    "medical":             "Healthcare",
    "hospital":            "Healthcare",
    "dental":              "Healthcare",
    "care_home":           "Healthcare",
    "education":           "School",
    "school":              "School",
    "university":          "School",
    "gym":                 "Gym",
    "leisure":             "Gym",
    "fitness":             "Gym",
    "sports":              "Gym",
    "industrial":          "Industrial",
    "warehouse":           "Industrial",
    "manufacturing":       "Industrial",
    "logistics":           "Industrial",
    "automotive":          "Automotive",
    "dealership":          "Automotive",
    "garage":              "Automotive",
    "residential":         "Residential",
    "residential_blocks":  "Residential",
    "property":            "Residential",
    "airbnb":              "Residential",
}

# CRM outreach statuses → Python pipeline statuses
_CRM_TO_PIPELINE: dict[str, str] = {
    "CONTACTED":      "contacted",
    "FOLLOW_UP_1":    "follow_up",
    "FOLLOW_UP_2":    "follow_up",
    "FINAL_FOLLOW_UP":"follow_up",
    "REPLIED":        "replied",
    "QUALIFIED":      "meeting_or_site_visit",
    "UNSUBSCRIBED":   "lost",
    "NOT_INTERESTED": "lost",
    "STOPPED":        "dormant",
    "DISQUALIFIED":   "dormant",
}


# ══════════════════════════════════════════════════════════════
# MAIN PUSH — called by scheduler every 30 minutes
# ══════════════════════════════════════════════════════════════

def push_qualified_leads(
    min_score: int = None,
    limit: int = None,
) -> dict:
    """
    Find leads ready for CRM handoff and push them.
    Criteria:
      - priority_score >= min_score
      - opportunity_scores row exists (entity passed the scoring filter)
      - has email address (required for outreach)
      - not already pushed (no crm_handoffs row)
      - pipeline_status in (new, shortlisted, enriched, ready_to_contact)

    Returns summary dict: {pushed, skipped, failed, total, errors[]}
    """
    cfg = _cfg()
    if min_score is None:
        min_score = cfg["min_score"]
    if limit is None:
        limit = cfg["batch_size"]

    if not cfg["endpoint"] or not cfg["token"]:
        logger.warning("crm_sync: GAS_ENDPOINT or GAS_TOKEN not configured — skipping push")
        return {"pushed": 0, "skipped": 0, "failed": 0, "total": 0, "error": "not_configured"}

    with db_pg.transaction() as conn:
        _ensure_tables(conn)
        rows = _select_qualified_rows(conn, min_score, limit)

    # Generate outreach packages for any leads that don't have one yet
    leads_needing_outreach = [r for r in rows if not r.get("cold_email")]
    if leads_needing_outreach:
        logger.info("crm_sync: generating outreach for %d leads before push", len(leads_needing_outreach))
        try:
            from outreach_generator import generate_outreach
            for r in leads_needing_outreach:
                generate_outreach(dict(r))
        except Exception as exc:
            logger.warning("crm_sync: outreach generation failed — %s", exc)

        # Re-fetch rows with outreach packages now populated
        with db_pg.transaction() as conn:
            rows = _select_qualified_rows(conn, min_score, limit)

    pushed = skipped = failed = 0
    errors: list[str] = []

    for row in rows:
        outcome, err = _push_one(row)
        if outcome == "ok":
            pushed += 1
        elif outcome == "duplicate":
            skipped += 1
        else:
            failed += 1
            if err:
                errors.append(f"{row.get('place_id', '?')}: {err}")

    logger.info(
        "crm_sync.push_qualified_leads: pushed=%d skipped=%d failed=%d",
        pushed, skipped, failed,
    )
    return {"pushed": pushed, "skipped": skipped, "failed": failed,
            "total": len(rows), "errors": errors}


def push_single_lead(place_id: str) -> dict:
    """
    Force-push a single lead by place_id regardless of normal filter rules.
    Used for manual override via /api/crm/push/{place_id}.
    """
    cfg = _cfg()
    if not cfg["endpoint"] or not cfg["token"]:
        return {"ok": False, "error": "not_configured"}

    # Force-push a single lead by place_id (overrides score/status filters)
    # Same column shape as the qualified-leads query so _push_one works unchanged.
    _SINGLE_LEAD_SQL = """
    SELECT
        e.id                                    AS id,
        e.id                                    AS entity_id,
        esl.source_record_id                    AS place_id,
        e.canonical_name                        AS business_name,
        LOWER(COALESCE(e.sector, ''))           AS normalized_sector,
        a.borough                               AS borough,
        a.line1                                 AS address,
        a.postcode                              AS postcode,
        e.primary_phone                         AS phone,
        e.primary_email                         AS email,
        c.full_name                             AS contact_name,
        COALESCE(os.total_score, 0)             AS priority_score,
        c.job_title                             AS ai_decision_maker_type,
        COALESCE(os.next_best_action, '')       AS trigger_summary,
        ''                                      AS recommended_offer,
        ''                                      AS buying_signal_types,
        COALESCE(o.current_stage::TEXT, 'new')  AS pipeline_status,
        op.cold_email                           AS cold_email,
        op.follow_up_email                      AS follow_up_email
    FROM entities e
    JOIN entity_source_links esl
        ON esl.entity_id = e.id AND esl.source = 'google_maps'
    LEFT JOIN opportunity_scores os ON os.entity_id = e.id
    LEFT JOIN opportunities o ON o.entity_id = e.id
    LEFT JOIN contacts c ON c.entity_id = e.id AND c.is_primary = TRUE
    LEFT JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
    LEFT JOIN addresses a ON a.id = el.address_id
    LEFT JOIN outreach_packages op
        ON op.entity_id = e.id OR op.place_id = esl.source_record_id
    WHERE esl.source_record_id = %s
    LIMIT 1
    """
    with db_pg.transaction() as conn:
        _ensure_tables(conn)
        row = db_pg.fetchone(conn, _SINGLE_LEAD_SQL, (place_id,))

    if not row:
        return {"ok": False, "error": "lead_not_found"}

    outcome, err = _push_one(row, force=True)
    return {"ok": outcome in ("ok", "duplicate"), "outcome": outcome, "error": err}


# ══════════════════════════════════════════════════════════════
# STATUS WRITEBACK POLL — called every 2 hours by scheduler
# Reads outbound leads from GAS CRM and syncs status back locally.
# ══════════════════════════════════════════════════════════════

def sync_status_from_crm() -> dict:
    """
    Poll GAS CRM for status changes on outbound leads.
    Updates opportunities.current_stage and crm_handoffs tracking.
    """
    cfg = _cfg()
    if not cfg["endpoint"] or not cfg["token"]:
        return {"synced": 0, "error": "not_configured"}

    try:
        leads = _gas_get("leads")
    except Exception as exc:
        logger.error("crm_sync.sync_status_from_crm: GAS fetch failed — %s", exc)
        return {"synced": 0, "error": str(exc)}

    if not isinstance(leads, list):
        return {"synced": 0, "error": "unexpected_response_type"}

    synced = 0
    with db_pg.transaction() as conn:
        _ensure_tables(conn)
        for lead in leads:
            # Only sync outbound leads we handed off
            if lead.get("leadDirection") != "outbound":
                continue
            source_id = lead.get("sourceLeadId", "")
            if not source_id:
                continue

            outreach_status = lead.get("outreachStatus", "")
            reply_status    = lead.get("replyStatus", "")
            pipeline_status = _CRM_TO_PIPELINE.get(outreach_status, "")

            if pipeline_status:
                # Update the real opportunities table
                db_pg.execute(conn,
                    """UPDATE opportunities SET current_stage = %s::pipeline_stage,
                       updated_at = %s, last_touched_at = %s
                       WHERE entity_id = (
                           SELECT e.id FROM entities e
                           JOIN entity_source_links esl ON esl.entity_id = e.id
                           WHERE esl.source_record_id = %s
                           LIMIT 1
                       )""",
                    (pipeline_status, _now(), _now(), source_id),
                )

            db_pg.execute(conn,
                """
                UPDATE crm_handoffs
                SET last_sync_at=%s, crm_outreach_status=%s, crm_reply_status=%s
                WHERE place_id=%s
                """,
                (_now(), outreach_status, reply_status, source_id),
            )
            synced += 1
        # db_pg.transaction() handles commit/rollback automatically

    logger.info("crm_sync.sync_status_from_crm: synced=%d leads", synced)
    return {"synced": synced}


# ══════════════════════════════════════════════════════════════
# STATUS SUMMARY
# ══════════════════════════════════════════════════════════════

def get_handoff_status() -> dict:
    """Summary of all CRM handoffs — used by /api/crm/status."""
    with db_pg.transaction() as conn:
        _ensure_tables(conn)

        by_status = db_pg.fetchall(conn,
            """
            SELECT handoff_status, COUNT(*) as n, MAX(handoff_at) as last_at
            FROM crm_handoffs
            GROUP BY handoff_status
            """,
        )

        total_pushed = db_pg.fetchone(conn,
            "SELECT COUNT(*) as n FROM crm_handoffs WHERE handoff_status IN ('success','duplicate')"
        )

        # Pending count: entities ready for push, no crm_handoffs row yet.
        # Mirrors the qualified-leads filter logic.
        pending = db_pg.fetchone(conn,
            """
            SELECT COUNT(*) as n
            FROM entities e
            JOIN entity_source_links esl
                ON esl.entity_id = e.id AND esl.source = 'google_maps'
            JOIN opportunity_scores os ON os.entity_id = e.id
            LEFT JOIN crm_handoffs ch ON ch.place_id = esl.source_record_id
            WHERE os.total_score >= %s
              AND e.active = TRUE
              AND COALESCE(e.primary_email, '') != ''
              AND COALESCE(ch.place_id, '') = ''
            """,
            (_cfg()["min_score"],),
        )

        errors = db_pg.fetchall(conn,
            """
            SELECT
                ch.place_id,
                e.canonical_name AS business_name,
                ch.error_message,
                ch.handoff_at
            FROM crm_handoffs ch
            LEFT JOIN entity_source_links esl
                ON esl.source_record_id = ch.place_id
            LEFT JOIN entities e ON e.id = esl.entity_id
            WHERE ch.handoff_status = 'error'
            ORDER BY ch.handoff_at DESC
            LIMIT 10
            """,
        )

    return {
        "total_pushed":  (total_pushed or {}).get("n", 0),
        "pending_push":  (pending or {}).get("n", 0),
        "by_status":     by_status,
        "recent_errors": errors,
        "min_score":     _cfg()["min_score"],
        "configured":    bool(_cfg()["endpoint"] and _cfg()["token"]),
    }


# ══════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════

def _push_one(row: dict, force: bool = False) -> tuple[str, Optional[str]]:
    """
    Push a single lead dict to GAS CRM.
    Returns (outcome, error_msg) where outcome in ('ok','duplicate','error').
    """
    place_id = row.get("place_id", "")

    # Guard: skip if no email
    email = (row.get("email") or "").strip().lower()
    if not email or "@" not in email:
        _record_handoff(place_id, row, "", "skipped_no_email", "")
        return ("error", "no_email")

    # ── Email Guard: validate, check risk, suppression, throttle ──────
    try:
        from email_guard import pre_send_check, log_send, record_send, update_send_status
        allowed, reason = pre_send_check(
            email, place_id=place_id,
            entity_id=row.get("entity_id") or row.get("id"),
            allow_risky=force,          # force=True allows role-based emails
        )
        if not allowed:
            logger.info("crm_sync._push_one: BLOCKED by email_guard for %s — %s", place_id, reason)
            _record_handoff(place_id, row, "", f"blocked:{reason}", reason)
            return ("error", f"email_guard:{reason}")
    except ImportError:
        pass  # email_guard not available — proceed without validation

    sector   = (row.get("normalized_sector") or "").lower().replace(" ", "_")
    segment  = _SECTOR_MAP.get(sector, "Office")

    payload = {
        "companyName":       row.get("business_name", ""),
        "contactName":       (row.get("contact_name") or
                              row.get("ai_decision_maker_type") or ""),
        "email":             email,
        "phone":             row.get("phone", ""),
        "serviceType":       row.get("normalized_sector", ""),
        "segment":           segment,
        "leadScore":         str(row.get("priority_score", "")),
        "sourceLeadId":      place_id,
        "pythonLeadId":      str(row.get("id", "")),
        "triggerSummary":    row.get("trigger_summary", ""),
        "recommendedOffer":  row.get("recommended_offer", ""),
        "buyingSignals":     row.get("buying_signal_types", ""),
        # Pre-generated AI emails — GAS uses these, no additional AI cost
        "outreachEmailBody": row.get("cold_email", ""),
        "followUpEmailBody": row.get("follow_up_email", ""),
        # Sender identity — GAS must use this as the "from" address
        # Requires Gmail "Send as" alias configured for office@askmiro.com
        # Display name is personal (e.g. "Mike Kato") to boost open rates
        "fromEmail":         os.getenv("OUTREACH_FROM_EMAIL", "office@askmiro.com"),
        "fromName":          os.getenv("OUTREACH_FROM_NAME", "Mike Kato"),
    }

    # Log the send attempt
    send_log_id = None
    try:
        from email_guard import log_send, record_send, update_send_status
        send_log_id = log_send(email, place_id,
                               entity_id=row.get("entity_id") or row.get("id"),
                               status="pending")
    except ImportError:
        pass

    try:
        result = _gas_post("outreach.handoff", payload)

        is_dup  = bool(result.get("duplicate"))
        crm_id  = result.get("leadId", "")
        status  = "duplicate" if is_dup else "success"

        _record_handoff(place_id, row, crm_id, status, "")

        # Update send log + throttle counter
        try:
            from email_guard import record_send, update_send_status
            if not is_dup:
                record_send()
                update_send_status(log_id=send_log_id, status="sent")
            else:
                update_send_status(log_id=send_log_id, status="sent", detail="duplicate_in_gas")
        except ImportError:
            pass

        return ("duplicate" if is_dup else "ok", None)

    except Exception as exc:
        err = str(exc)
        logger.error("crm_sync._push_one: failed for %s — %s", place_id, err)
        _record_handoff(place_id, row, "", "error", err)
        try:
            from email_guard import update_send_status
            update_send_status(log_id=send_log_id, status="failed", detail=err)
        except ImportError:
            pass
        return ("error", err)


def _record_handoff(
    place_id: str,
    row: dict,
    crm_id: str,
    status: str,
    error: str,
) -> None:
    """Upsert a crm_handoffs row."""
    with db_pg.transaction() as conn:
        _ensure_tables(conn)
        db_pg.execute(conn,
            """
            INSERT INTO crm_handoffs
                (place_id, crm_id, python_lead_id, handoff_at, handoff_status,
                 last_sync_at, error_message)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (place_id) DO UPDATE SET
                crm_id = EXCLUDED.crm_id,
                python_lead_id = EXCLUDED.python_lead_id,
                handoff_at = EXCLUDED.handoff_at,
                handoff_status = EXCLUDED.handoff_status,
                last_sync_at = EXCLUDED.last_sync_at,
                error_message = EXCLUDED.error_message
            """,
            (
                place_id,
                crm_id,
                str(row.get("id", "")),
                _now(),
                status,
                _now(),
                error or None,
            ),
        )


def _gas_post(action: str, body: dict) -> dict:
    """POST to GAS via the _method=POST + _body pattern used by the frontend."""
    cfg = _cfg()
    body_enc = urllib.parse.quote(json.dumps(body, ensure_ascii=False))
    url = (
        f"{cfg['endpoint']}"
        f"?action={action}"
        f"&_token={urllib.parse.quote(cfg['token'])}"
        f"&_method=POST"
        f"&_body={body_enc}"
    )
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return _parse_response(resp.read().decode("utf-8"))


def _gas_get(action: str, params: Optional[dict] = None) -> object:
    """GET from GAS endpoint."""
    cfg = _cfg()
    qs = (
        f"action={action}"
        f"&_token={urllib.parse.quote(cfg['token'])}"
    )
    if params:
        for k, v in params.items():
            qs += f"&{k}={urllib.parse.quote(str(v))}"
    url = f"{cfg['endpoint']}?{qs}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return _parse_response(resp.read().decode("utf-8"))


def _parse_response(raw: str) -> object:
    """Strip JSONP wrapper if present, then parse JSON."""
    raw = raw.strip()
    if raw and raw[0] != "{" and raw[0] != "[":
        # JSONP: callback({...}) or callback([...])
        start = raw.find("(")
        end   = raw.rfind(")")
        if start != -1 and end != -1:
            raw = raw[start + 1 : end]
    return json.loads(raw)


def _ensure_tables(conn) -> None:
    """Create crm_handoffs table and run any missing column migrations.
    Postgres-only (operates against the Railway/db_pg connection)."""
    db_pg.execute(conn,
        """
        CREATE TABLE IF NOT EXISTS crm_handoffs (
            place_id            TEXT PRIMARY KEY,
            crm_id              TEXT,
            python_lead_id      TEXT,
            handoff_at          TEXT,
            handoff_status      TEXT,
            last_sync_at        TEXT,
            error_message       TEXT,
            crm_outreach_status TEXT,
            crm_reply_status    TEXT
        )
        """
    )
    # Safe column migrations for installs missing later columns
    _add_col_safe(conn, "crm_handoffs", "python_lead_id",      "TEXT")
    _add_col_safe(conn, "crm_handoffs", "last_sync_at",        "TEXT")
    _add_col_safe(conn, "crm_handoffs", "error_message",       "TEXT")
    _add_col_safe(conn, "crm_handoffs", "crm_outreach_status", "TEXT")
    _add_col_safe(conn, "crm_handoffs", "crm_reply_status",    "TEXT")


def _add_col_safe(conn, table: str, col: str, defn: str) -> None:
    """Add a column if it doesn't exist (Postgres). Idempotent."""
    try:
        existing_rows = db_pg.fetchall(conn,
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = %s",
            (table,),
        )
        existing = {r["column_name"] for r in existing_rows}
    except Exception:
        existing = set()
    if col not in existing:
        try:
            db_pg.execute(conn, f"ALTER TABLE {table} ADD COLUMN {col} {defn}")
        except Exception:
            pass


def _now() -> str:
    return datetime.now().isoformat()
