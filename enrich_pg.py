"""
enrich_pg.py — Postgres-native email enrichment for the entities table.

Replaces services.email_scraper.enrich_leads_batch which targets the legacy
SQLite lead_records table. Same scraper engine (find_email) but writes back
to entities.primary_email so the rest of the pipeline (crm_push → GAS) can
pick them up.

Designed to run on a schedule (APScheduler) draining a batch every 2h.
"""
from __future__ import annotations
import logging
import os
from typing import Optional

import db_pg
from services.email_scraper import find_email

logger = logging.getLogger(__name__)

CONF_RANK = {"high": 0, "medium": 1, "low": 2}


_CANDIDATE_SQL = """
SELECT  e.id              AS entity_id,
        e.place_id        AS place_id,
        e.canonical_name  AS name,
        e.primary_website AS website,
        os.score          AS score
FROM    entities          e
JOIN    opportunity_scores os ON os.entity_id = e.id
LEFT JOIN crm_handoffs    ch ON ch.entity_id = e.id
WHERE   e.active = TRUE
  AND   e.primary_website IS NOT NULL
  AND   e.primary_website <> ''
  AND   (e.primary_email IS NULL OR e.primary_email = '')
  AND   os.score >= %s
  AND   ch.id IS NULL                  -- skip leads already handed off
ORDER BY os.score DESC
LIMIT %s
"""


def _validate_email(email: str) -> tuple[bool, str]:
    """Soft validation: prefer email_guard if available, otherwise basic check."""
    try:
        import email_guard
        ok, reason = email_guard.validate_format(email)
        if not ok:
            return False, f"format:{reason}"
        # Skip DNS check here — it's expensive and we'll catch bad domains downstream
        return True, "ok"
    except Exception:
        return ("@" in email and "." in email.split("@", 1)[-1]), "basic"


def enrich_batch_pg(
    min_score: int = 65,
    limit:     int = 50,
    min_conf:  str = "medium",   # high|medium|low
    dry_run:   bool = False,
) -> dict:
    """
    Process up to `limit` entities that have a website but no email.
    Updates entities.primary_email in place.

    Returns: {processed, enriched, skipped_no_email, skipped_low_conf,
              skipped_invalid, failed, examples}
    """
    conf_min_rank = CONF_RANK.get(min_conf, 2)

    with db_pg.transaction() as conn:
        rows = db_pg.fetchall(conn, _CANDIDATE_SQL, (min_score, limit))

    if not rows:
        return {"processed": 0, "enriched": 0, "skipped_no_email": 0,
                "skipped_low_conf": 0, "skipped_invalid": 0, "failed": 0,
                "examples": [], "note": "no candidates"}

    enriched = skipped_no_email = skipped_low_conf = skipped_invalid = failed = 0
    examples: list[dict] = []

    for row in rows:
        entity_id = row["entity_id"]
        website   = row["website"]
        name      = row["name"] or ""

        try:
            result = find_email(website, row.get("place_id") or "")

            if not result or not result.get("email"):
                skipped_no_email += 1
                continue

            email = result["email"].strip().lower()
            confidence = result.get("confidence", "low")

            if CONF_RANK.get(confidence, 2) > conf_min_rank:
                skipped_low_conf += 1
                continue

            ok, reason = _validate_email(email)
            if not ok:
                skipped_invalid += 1
                logger.info("skip invalid: %s (%s) %s", email, reason, name[:30])
                continue

            if dry_run:
                examples.append({
                    "entity_id": entity_id,
                    "name":      name[:40],
                    "website":   website[:60],
                    "email":     email,
                    "conf":      confidence,
                    "source":    result.get("source"),
                })
                enriched += 1
                continue

            # Write back to entities — single short transaction per row to
            # avoid long-lived locks across the scrape loop.
            with db_pg.transaction() as wconn:
                db_pg.execute(
                    wconn,
                    "UPDATE entities "
                    "SET primary_email = %s, updated_at = NOW() "
                    "WHERE id = %s AND (primary_email IS NULL OR primary_email = '')",
                    (email, entity_id),
                )
            enriched += 1
            if len(examples) < 10:
                examples.append({
                    "entity_id": entity_id, "name": name[:40], "email": email,
                    "conf": confidence, "source": result.get("source"),
                })
            logger.info("enriched entity_id=%s %s → %s (%s/%s)",
                        entity_id, name[:30], email,
                        result.get("source"), confidence)

        except Exception as exc:
            failed += 1
            logger.warning("enrich failed for entity_id=%s (%s): %s",
                           entity_id, website, exc)

    summary = {
        "processed":          len(rows),
        "enriched":           enriched,
        "skipped_no_email":   skipped_no_email,
        "skipped_low_conf":   skipped_low_conf,
        "skipped_invalid":    skipped_invalid,
        "failed":             failed,
        "dry_run":            dry_run,
        "examples":           examples,
    }
    logger.info("enrich_batch_pg summary: %s", summary)
    return summary


def coverage_stats_pg() -> dict:
    """Return current email-coverage numbers from the entities table."""
    out = {}
    queries = {
        "total":               "SELECT COUNT(*) AS c FROM entities WHERE active = TRUE",
        "with_email":          "SELECT COUNT(*) AS c FROM entities "
                               "WHERE active = TRUE "
                               "  AND primary_email IS NOT NULL AND primary_email <> ''",
        "scrape_ready":        "SELECT COUNT(*) AS c FROM entities "
                               "WHERE active = TRUE "
                               "  AND primary_website IS NOT NULL AND primary_website <> '' "
                               "  AND (primary_email IS NULL OR primary_email = '')",
        "scrape_ready_score65":
                               "SELECT COUNT(*) AS c FROM entities e "
                               "JOIN opportunity_scores os ON os.entity_id = e.id "
                               "WHERE e.active = TRUE "
                               "  AND e.primary_website IS NOT NULL AND e.primary_website <> '' "
                               "  AND (e.primary_email IS NULL OR e.primary_email = '') "
                               "  AND os.score >= 65",
        "no_website":          "SELECT COUNT(*) AS c FROM entities "
                               "WHERE active = TRUE "
                               "  AND (primary_website IS NULL OR primary_website = '')",
    }
    for key, sql in queries.items():
        try:
            with db_pg.transaction() as conn:
                out[key] = db_pg.fetchone(conn, sql)["c"]
        except Exception as exc:
            out[key] = f"err: {str(exc)[:120]}"

    total = out.get("total") if isinstance(out.get("total"), int) else 0
    have  = out.get("with_email") if isinstance(out.get("with_email"), int) else 0
    out["coverage_pct"] = round(have * 100.0 / max(total, 1), 2)
    return out
