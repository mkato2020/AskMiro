"""
enrichment.py — AskMiro Lead Intelligence OS
Layer 2b: AI-powered classification and enrichment.
Runs after cleaning. Adds AI business type, sub-sector, decision maker type.
"""

import logging
import time
from typing import List

from ai_client import call_ai
from ai_prompts import (
    SYSTEM_CLASSIFIER,
    build_classification_prompt,
)
from database import (
    get_leads_for_scoring,
    update_ai_classification,
    get_lead_by_place_id,
)

logger = logging.getLogger(__name__)

# Stay safely under the 50 RPM API rate limit
_MIN_CALL_INTERVAL = 1.25   # seconds → max 48 calls/min


def classify_lead(row: dict) -> dict:
    """
    Run AI classification on a single lead row.
    Returns dict with classification fields, or safe defaults on failure.
    """
    prompt = build_classification_prompt(
        business_name = row.get("business_name", ""),
        raw_sector    = row.get("raw_sector", ""),
        address       = row.get("address", ""),
        borough       = row.get("borough", ""),
        website       = row.get("website"),
        phone         = row.get("phone"),
        rating        = row.get("rating"),
        review_count  = row.get("review_count"),
    )

    response = call_ai(
        system_prompt = SYSTEM_CLASSIFIER,
        user_prompt   = prompt,
        prompt_type   = "classify",
        max_tokens    = 400,
    )

    data = response.as_json()
    if not data:
        logger.warning("Classification parse failed for %s — using defaults", row.get("place_id"))
        return {
            "ai_business_type":       row.get("normalized_sector", "other").title(),
            "ai_sub_sector":          row.get("normalized_sector", "other"),
            "ai_decision_maker_type": "Facilities Manager",
            "ai_is_cleaning_target":  True,
            "ai_classification_note": "Classification unavailable — using defaults.",
        }

    return {
        "ai_business_type":       data.get("business_type", ""),
        "ai_sub_sector":          data.get("sub_sector", "other"),
        "ai_decision_maker_type": data.get("decision_maker_type", ""),
        "ai_is_cleaning_target":  bool(data.get("is_cleaning_target", True)),
        "ai_classification_note": data.get("note", ""),
    }


def run_enrichment_batch(limit: int = 500, force: bool = False, only_other: bool = False) -> int:
    """
    Run AI classification on unclassified leads.
    only_other=True restricts to leads where normalized_sector='other'.
    Returns count of leads processed.
    """
    from database import db_connection

    if force:
        if only_other:
            sql = "SELECT * FROM lead_records WHERE normalized_sector='other' ORDER BY priority_score DESC LIMIT ?"
        else:
            sql = "SELECT * FROM lead_records ORDER BY priority_score DESC LIMIT ?"
    else:
        if only_other:
            sql = """SELECT * FROM lead_records
                     WHERE normalized_sector='other' AND (ai_business_type IS NULL OR ai_business_type='')
                     ORDER BY priority_score DESC LIMIT ?"""
        else:
            sql = """SELECT * FROM lead_records
                     WHERE ai_business_type IS NULL OR ai_business_type=''
                     ORDER BY priority_score DESC LIMIT ?"""

    with db_connection() as conn:
        rows = conn.execute(sql, (limit,)).fetchall()

    processed = 0
    total = len(rows)
    _last_call = 0.0

    for row in rows:
        # Rate-limit: pause if we're ahead of the 48 RPM budget
        elapsed = time.monotonic() - _last_call
        wait = _MIN_CALL_INTERVAL - elapsed
        if wait > 0:
            time.sleep(wait)

        row_dict = dict(row)
        try:
            classification = classify_lead(row_dict)
        except Exception as exc:
            logger.warning("Classification error for %s: %s", row_dict.get("place_id"), exc)
            continue
        finally:
            _last_call = time.monotonic()

        update_ai_classification(
            place_id      = row_dict["place_id"],
            business_type = classification["ai_business_type"],
            sub_sector    = classification["ai_sub_sector"],
            dm_type       = classification["ai_decision_maker_type"],
            is_target     = classification["ai_is_cleaning_target"],
            note          = classification["ai_classification_note"],
        )
        processed += 1
        if processed % 100 == 0 or processed == total:
            logger.info("Enrichment progress: %d/%d (%.1f%%)", processed, total, processed / total * 100)

    logger.info("Enrichment complete. %d leads classified.", processed)
    return processed
