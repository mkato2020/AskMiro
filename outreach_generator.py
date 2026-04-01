"""
outreach_generator.py — AskMiro Lead Intelligence OS
Generates personalised, AI-crafted outreach packs per lead.
Cold email · Call opener · LinkedIn intro · Follow-up · Site visit brief.
"""

import logging
from typing import Optional

from ai_client import call_ai
from ai_prompts import SYSTEM_OUTREACH, SYSTEM_HANDOFF, build_outreach_prompt, build_handoff_prompt
from database import save_outreach, get_outreach, db_connection
from models import OutreachPackage, Contract

logger = logging.getLogger(__name__)


# ── Outreach generation ──────────────────────────────────────────────────────

def generate_outreach(row: dict, force: bool = False) -> Optional[OutreachPackage]:
    """
    Generate a full outreach pack for a lead row dict.
    Skips if package already exists (unless force=True).
    Returns OutreachPackage or None on failure.
    """
    place_id = row["place_id"]

    # Check cache
    if not force:
        existing = get_outreach(place_id)
        if existing:
            logger.debug("Outreach already exists for %s — skipping", place_id)
            return None

    prompt = build_outreach_prompt(
        business_name   = row.get("business_name", ""),
        sector          = row.get("normalized_sector", ""),
        borough         = row.get("borough", ""),
        business_type   = row.get("ai_business_type") or row.get("normalized_sector", ""),
        decision_maker  = row.get("ai_decision_maker_type", "Facilities Manager"),
        score           = row.get("priority_score", 0),
        website_summary = row.get("website_summary"),
        pain_points     = ' | '.join(filter(None, [row.get("website_pain_points"), row.get("trigger_summary"), row.get("recommended_offer")])) or row.get("website_pain_points"),
    )

    response = call_ai(
        system_prompt = SYSTEM_OUTREACH,
        user_prompt   = prompt,
        prompt_type   = "outreach",
        max_tokens    = 1200,
    )

    data = response.as_json()
    if not data:
        logger.warning("Outreach generation parse failed for %s", place_id)
        return None

    pkg = OutreachPackage(
        place_id         = place_id,
        cold_email       = data.get("cold_email", ""),
        call_opener      = data.get("call_opener", ""),
        full_call_script = data.get("full_call_script", ""),
        linkedin_intro   = data.get("linkedin_intro", ""),
        follow_up_email  = data.get("follow_up_email", ""),
        site_visit_brief = data.get("site_visit_brief", ""),
        model_used       = response.model,
    )
    save_outreach(pkg)
    logger.debug("Outreach package generated for %s", row.get("business_name"))
    return pkg


def generate_outreach_batch(limit: int = 50) -> int:
    """Generate outreach for top scored pipeline leads missing outreach packs."""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT lr.* FROM lead_records lr
               LEFT JOIN outreach_packages op ON lr.place_id = op.place_id
               WHERE lr.pipeline_status NOT IN ('won', 'lost')
                 AND lr.priority_score >= 60
                 AND op.id IS NULL
               ORDER BY lr.priority_score DESC
               LIMIT ?""",
            (limit,)
        ).fetchall()

    processed = 0
    for row in rows:
        result = generate_outreach(dict(row))
        if result:
            processed += 1

    logger.info("Outreach generation complete. %d packages created.", processed)
    return processed


# ── Operations handoff generation ────────────────────────────────────────────

def generate_handoff_pack(contract: Contract, lead_row: dict) -> dict:
    """
    Generate AI operations handoff pack for a newly won contract.
    Returns dict with handoff fields.
    """
    prompt = build_handoff_prompt(
        client_name        = contract.client_name,
        site_address       = contract.site_address,
        service_type       = contract.service_type,
        cleaning_frequency = contract.cleaning_frequency,
        contract_value     = contract.contract_value_gbp,
        sector             = lead_row.get("normalized_sector", ""),
        business_type      = lead_row.get("ai_business_type"),
        website_summary    = lead_row.get("website_summary"),
        pain_points        = lead_row.get("website_pain_points"),
    )

    response = call_ai(
        system_prompt = SYSTEM_HANDOFF,
        user_prompt   = prompt,
        prompt_type   = "handoff",
        max_tokens    = 800,
    )

    data = response.as_json()
    if not data:
        return {
            "client_summary":        "Handoff generation failed — please complete manually.",
            "handoff_summary":       "",
            "service_notes":         "",
            "first_clean_checklist": "",
            "risk_flags":            "",
        }

    return {
        "client_summary":        data.get("client_summary", ""),
        "handoff_summary":       data.get("handoff_summary", ""),
        "service_notes":         data.get("service_notes", ""),
        "first_clean_checklist": data.get("first_clean_checklist", ""),
        "risk_flags":            data.get("risk_flags", ""),
    }
