"""
contracts.py — AskMiro Lead Intelligence OS
Layer 5: Contract creation and operations handoff.
Bridge between sales pipeline and operational delivery.
"""

import logging
from datetime import date, timedelta
from typing import Optional

from models import Contract
from database import (
    create_contract, get_active_contracts,
    get_lead_by_place_id, update_pipeline_status, db_connection,
)
from outreach_generator import generate_handoff_pack
from pipeline import mark_won

logger = logging.getLogger(__name__)


# ── Contract creation from a won pipeline lead ───────────────────────────────

def convert_lead_to_contract(
    place_id:           str,
    service_type:       str,
    cleaning_frequency: str,
    contract_value_gbp: float,
    assigned_team:      str      = None,
    contract_start_date: date    = None,
    service_notes:      str      = None,
    operations_notes:   str      = None,
    qa_schedule:        str      = "monthly_supervisor_check",
) -> Optional[Contract]:
    """
    Convert a won pipeline lead into a live contract.
    Triggers AI handoff pack generation.
    Returns the Contract object, or None on failure.
    """
    lead = get_lead_by_place_id(place_id)
    if not lead:
        logger.error("Cannot convert: lead %s not found", place_id)
        return None

    lead_dict = dict(lead)
    start     = contract_start_date or (date.today() + timedelta(days=7))

    # Build contract skeleton
    contract = Contract(
        place_id            = place_id,
        client_name         = lead_dict["business_name"],
        site_address        = lead_dict["address"],
        service_type        = service_type,
        cleaning_frequency  = cleaning_frequency,
        contract_value_gbp  = contract_value_gbp,
        contract_start_date = start,
        assigned_team       = assigned_team,
        service_notes       = service_notes,
        operations_notes    = operations_notes,
        qa_schedule         = qa_schedule,
        account_status      = "active",
    )

    # Generate AI handoff pack
    handoff = generate_handoff_pack(contract, lead_dict)
    contract.ai_handoff_summary        = handoff["handoff_summary"]
    contract.ai_first_clean_checklist  = handoff["first_clean_checklist"]
    contract.ai_risk_flags             = handoff["risk_flags"]

    # Update service notes with AI insight if not manually set
    if not service_notes:
        contract.service_notes = handoff["service_notes"]

    # Persist
    create_contract(contract)
    mark_won(place_id, notes=f"Converted to contract. Start: {start}. Value: £{contract_value_gbp}/month")

    logger.info(
        "Contract created: %s | %s | £%.0f/month | start %s",
        contract.client_name, service_type, contract_value_gbp, start
    )
    return contract


# ── Contract overview ────────────────────────────────────────────────────────

def get_contract_summary() -> dict:
    """Return a summary of all active contracts for reporting."""
    contracts = get_active_contracts()
    total_value = sum(
        c["contract_value_gbp"] or 0
        for c in contracts
        if c["contract_value_gbp"]
    )

    sector_breakdown: dict[str, dict] = {}
    for c in contracts:
        # Get sector from lead record
        lead = get_lead_by_place_id(c["place_id"])
        sector = dict(lead).get("normalized_sector", "unknown") if lead else "unknown"
        if sector not in sector_breakdown:
            sector_breakdown[sector] = {"count": 0, "total_value": 0.0}
        sector_breakdown[sector]["count"] += 1
        sector_breakdown[sector]["total_value"] += c["contract_value_gbp"] or 0

    return {
        "active_contracts":   len(contracts),
        "total_monthly_value": total_value,
        "total_annual_value":  total_value * 12,
        "sector_breakdown":   sector_breakdown,
        "contracts":          [dict(c) for c in contracts],
    }


# ── QA reminder (for ops integration) ───────────────────────────────────────

def get_contracts_due_qa() -> list:
    """
    Returns contracts where a QA visit is due based on qa_schedule.
    Currently: monthly = contracts started 30+ days ago with no recent note.
    Placeholder — extend with a proper qa_log table in v2.
    """
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT * FROM contracts
               WHERE account_status = 'active'
                 AND contract_start_date <= date('now', '-30 days')
               ORDER BY contract_start_date ASC"""
        ).fetchall()
    return [dict(r) for r in rows]


# ── Contract pause / terminate ───────────────────────────────────────────────

def pause_contract(place_id: str, reason: str = None) -> None:
    with db_connection() as conn:
        conn.execute(
            "UPDATE contracts SET account_status='paused', operations_notes=COALESCE(?,operations_notes), updated_at=datetime('now') WHERE place_id=?",
            (reason, place_id)
        )
    logger.info("Contract paused: %s", place_id)


def terminate_contract(place_id: str, reason: str = None) -> None:
    with db_connection() as conn:
        conn.execute(
            "UPDATE contracts SET account_status='terminated', operations_notes=COALESCE(?,operations_notes), updated_at=datetime('now') WHERE place_id=?",
            (reason, place_id)
        )
    update_pipeline_status(place_id, "lost", notes=f"Contract terminated: {reason}")
    logger.info("Contract terminated: %s — %s", place_id, reason)
