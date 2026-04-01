"""
pipeline.py — AskMiro Lead Intelligence OS
Layer 4: Sales pipeline management.
Shortlisting, status transitions, follow-up tracking, copilot.
"""

import logging
from datetime import date, timedelta, datetime
from typing import List, Optional

from config import PIPELINE_STATUSES
from models import PipelineLead
from database import (
    get_top_leads, add_to_pipeline, update_pipeline_status,
    get_pipeline_leads, get_overdue_followups,
    get_lead_by_place_id, db_connection, log_activity,
)
from ai_client import call_ai
from ai_prompts import build_copilot_weekly_plan_prompt

logger = logging.getLogger(__name__)

VALID_TRANSITIONS = {
    "new":              ["shortlisted", "contacted", "lost", "dormant"],
    "shortlisted":      ["contacted", "lost", "dormant"],
    "contacted":        ["follow_up", "replied", "meeting_booked", "lost", "dormant"],
    "follow_up":        ["contacted", "replied", "meeting_booked", "lost", "dormant"],
    "replied":          ["meeting_booked", "quoted", "lost", "dormant"],
    "meeting_booked":   ["quoted", "replied", "lost", "dormant"],
    "quoted":           ["negotiating", "won", "lost", "dormant"],
    "negotiating":      ["won", "lost", "dormant"],
    "won":              [],
    "lost":             ["new"],
    "dormant":          ["new", "shortlisted"],
}


# ── Shortlisting ─────────────────────────────────────────────────────────────

def shortlist_top_leads(
    limit:     int = 100,
    min_score: int = 60,
    owner:     str = None,
) -> int:
    """
    Promote top-scored leads into the pipeline.
    Skips leads already in pipeline.
    Returns count added.
    """
    leads = get_top_leads(limit=limit, min_score=min_score)
    added = 0

    for row in leads:
        existing = get_pipeline_leads_by_place_id(row["place_id"])
        if existing:
            continue  # Already in pipeline

        # Default follow-up: 3 business days from now
        follow_up = _next_business_day(days=3)

        pipeline_lead = PipelineLead(
            place_id   = row["place_id"],
            business_name = row["business_name"],
            sector     = row["normalized_sector"],
            borough    = row["borough"],
            owner      = owner or "unassigned",
            status     = "shortlisted",
            next_follow_up = follow_up,
        )
        add_to_pipeline(pipeline_lead)
        added += 1

    logger.info("Shortlisted %d leads into pipeline.", added)
    return added


def get_pipeline_leads_by_place_id(place_id: str):
    with db_connection() as conn:
        return conn.execute(
            "SELECT * FROM pipeline_leads WHERE place_id = ?", (place_id,)
        ).fetchone()


# ── Status transitions ────────────────────────────────────────────────────────

def advance_lead(
    place_id:        str,
    new_status:      str,
    contact_channel: str = None,
    notes:           str = None,
    follow_up_days:  int = 5,
) -> bool:
    """
    Move a pipeline lead to a new status.
    Validates transition. Updates follow-up date automatically.
    Returns True on success.
    """
    if new_status not in PIPELINE_STATUSES:
        logger.error("Invalid status: %s", new_status)
        return False

    follow_up = _next_business_day(days=follow_up_days)

    sql = """
        UPDATE pipeline_leads SET
            status          = ?,
            contact_channel = COALESCE(?, contact_channel),
            last_activity   = datetime('now'),
            next_follow_up  = ?,
            notes           = COALESCE(?, notes),
            updated_at      = datetime('now')
        WHERE place_id = ?
    """
    with db_connection() as conn:
        conn.execute(sql, (new_status, contact_channel, follow_up.isoformat(), notes, place_id))

    # Sync to master record if terminal status
    if new_status in ("won", "lost", "dormant"):
        update_pipeline_status(place_id, new_status)

    # Log the status change as an activity
    log_activity(place_id, "status_change", f"Status changed to {new_status}",
                 channel=contact_channel, next_action=notes)

    logger.info("Lead %s → %s", place_id, new_status)
    return True


def mark_contacted(
    place_id: str,
    channel:  str,     # email | phone | linkedin | in_person
    notes:    str = None,
) -> bool:
    return advance_lead(
        place_id        = place_id,
        new_status      = "contacted",
        contact_channel = channel,
        notes           = notes,
        follow_up_days  = 5,
    )


def mark_replied(place_id: str, notes: str = None) -> bool:
    return advance_lead(place_id, "replied", notes=notes, follow_up_days=2)


def mark_meeting_booked(place_id: str, notes: str = None) -> bool:
    return advance_lead(place_id, "meeting_booked", notes=notes, follow_up_days=7)


def mark_quoted(place_id: str, notes: str = None) -> bool:
    return advance_lead(place_id, "quoted", notes=notes, follow_up_days=7)


def mark_won(place_id: str, notes: str = None) -> bool:
    return advance_lead(place_id, "won", notes=notes)


def mark_lost(place_id: str, notes: str = None) -> bool:
    return advance_lead(place_id, "lost", notes=notes)


# ── Daily / weekly workflow views ────────────────────────────────────────────

def get_todays_actions() -> dict:
    """
    Return a structured view of today's sales actions.
    Uses PostgreSQL pipeline via db_pg.
    """
    import db_pg
    with db_pg.transaction() as conn:
        overdue = db_pg.fetchall(conn, """
            SELECT * FROM v_pipeline_board
            WHERE next_followup_at < NOW()
              AND current_stage NOT IN ('won', 'lost', 'dormant')
            ORDER BY next_followup_at ASC
        """)
        ready = db_pg.fetchall(conn,
            "SELECT * FROM v_pipeline_board WHERE current_stage = 'ready_to_contact'")
        contacted = db_pg.fetchall(conn,
            "SELECT * FROM v_pipeline_board WHERE current_stage = 'contacted'")
        quoted = db_pg.fetchall(conn,
            "SELECT * FROM v_pipeline_board WHERE current_stage IN ('quote_prepared','quote_sent')")

    return {
        "overdue_followups":  [dict(r) for r in overdue],
        "ready_to_contact":   [dict(r) for r in ready],
        "awaiting_reply":     [dict(r) for r in contacted],
        "active_follow_ups":  [],
        "open_quotes":        [dict(r) for r in quoted],
        "total_active":       len(ready) + len(contacted),
        "total_open_quotes":  len(quoted),
        "total_overdue":      len(overdue),
    }


# ── AI Sales Copilot ─────────────────────────────────────────────────────────

def ai_weekly_plan(limit: int = 100) -> str:
    """
    Use AI to produce a weekly sales plan from top available leads.
    Returns formatted text plan.
    """
    leads = get_top_leads(limit=limit, min_score=55)
    if not leads:
        return "No leads available for weekly planning."

    # Build a compact summary for the prompt
    lines = []
    for r in leads[:50]:  # send top 50 to AI for token efficiency
        lines.append(
            f"- {r['business_name']} | {r['normalized_sector']} | "
            f"{r['borough']} | score={r['priority_score']} | "
            f"phone={'yes' if r['has_phone'] else 'no'} | "
            f"website={'yes' if r['has_website'] else 'no'} | "
            f"urgency={r.get('timing_urgency','low')} | signals={r.get('buying_signal_score',0)}"
        )

    lead_summaries = "\n".join(lines)
    prompt = build_copilot_weekly_plan_prompt(lead_summaries)

    response = call_ai(
        system_prompt = "You are a senior B2B sales director. Give sharp, actionable advice.",
        user_prompt   = prompt,
        prompt_type   = "plan",
        max_tokens    = 800,
    )
    return response.content


def ai_what_to_say(place_id: str) -> str:
    """
    AI copilot: given a lead, what should we say next?
    Returns suggested message / approach.
    """
    from database import get_outreach
    row     = get_lead_by_place_id(place_id)
    outreach = get_outreach(place_id)

    if not row:
        return "Lead not found."

    pipeline = get_pipeline_leads_by_place_id(place_id)
    status   = dict(pipeline).get("status", "new") if pipeline else "new"

    if outreach:
        pkg = dict(outreach)
        if status in ("shortlisted", "new"):
            return f"COLD EMAIL:\n{pkg.get('cold_email','')}\n\nCALL OPENER:\n{pkg.get('call_opener','')}"
        elif status in ("contacted", "follow_up"):
            return f"FOLLOW-UP EMAIL:\n{pkg.get('follow_up_email','')}"
        elif status == "replied":
            return f"SITE VISIT BRIEF:\n{pkg.get('site_visit_brief','')}"

    return (
        f"No outreach pack generated yet for {row['business_name']}. "
        f"Run: python run_pipeline.py --generate-outreach {place_id}"
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _next_business_day(days: int = 1) -> date:
    """Return a date N business days from today, skipping weekends."""
    current = date.today()
    added   = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:  # Mon–Fri
            added += 1
    return current


def immediate_signal_targets(limit: int = 25) -> list[dict]:
    from weekly_targets import immediate_opportunity_leads
    return immediate_opportunity_leads(limit)
