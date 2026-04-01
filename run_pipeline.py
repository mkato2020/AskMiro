"""
run_pipeline.py — AskMiro Lead Intelligence OS
Pipeline management, outreach generation, and AI sales copilot CLI.
"""

import argparse
import logging
import json

from database import init_db
from pipeline import (
    shortlist_top_leads, get_todays_actions,
    advance_lead, ai_weekly_plan, ai_what_to_say,
)
from outreach_generator import generate_outreach_batch
from logger_setup import setup_logging

logger = logging.getLogger(__name__)


def cmd_shortlist(args):
    n = shortlist_top_leads(limit=args.limit, min_score=args.min_score, owner=args.owner)
    print(f"✓ {n} leads shortlisted into pipeline.")


def cmd_today(args):
    actions = get_todays_actions()
    print("\n═══════════════════════════════════════════")
    print("  AskMiro Sales — Today's Actions")
    print("═══════════════════════════════════════════")
    print(f"  Ready to contact:    {len(actions['ready_to_contact'])}")
    print(f"  Awaiting reply:      {len(actions['awaiting_reply'])}")
    print(f"  Active follow-ups:   {len(actions['active_follow_ups'])}")
    print(f"  Open quotes:         {actions['total_open_quotes']}")
    print(f"  ⚠ Overdue:           {actions['total_overdue']}")

    if actions["overdue_followups"]:
        print("\n  OVERDUE FOLLOW-UPS:")
        for r in actions["overdue_followups"][:5]:
            print(f"    · {r['business_name']} ({r['borough']}) — due {r['next_follow_up']}")


def cmd_advance(args):
    ok = advance_lead(
        place_id        = args.place_id,
        new_status      = args.status,
        contact_channel = args.channel,
        notes           = args.notes,
    )
    if ok:
        print(f"✓ Lead {args.place_id} → {args.status}")
    else:
        print(f"✗ Could not advance lead {args.place_id}")


def cmd_outreach(args):
    if args.place_id:
        from database import get_lead_by_place_id
        row = get_lead_by_place_id(args.place_id)
        if not row:
            print(f"Lead {args.place_id} not found.")
            return
        pkg = generate_outreach(dict(row), force=args.force)
        if pkg:
            print(f"\n✓ Outreach pack generated for {row['business_name']}")
            print(f"\n── COLD EMAIL ──\n{pkg.cold_email}")
            print(f"\n── CALL OPENER ──\n{pkg.call_opener}")
        else:
            print("Outreach already exists. Use --force to regenerate.")
    else:
        n = generate_outreach_batch(limit=args.batch_limit)
        print(f"✓ {n} outreach packages generated.")


def cmd_weekly_plan(args):
    print("\n  Generating AI weekly sales plan…\n")
    plan = ai_weekly_plan(limit=100)
    print("═══════════════════════════════════════════")
    print("  AskMiro — AI Weekly Sales Plan")
    print("═══════════════════════════════════════════")
    print(plan)


def cmd_what_to_say(args):
    result = ai_what_to_say(args.place_id)
    print(f"\n── AI SALES COPILOT: What to say to {args.place_id} ──\n")
    print(result)


def main():
    parser = argparse.ArgumentParser(description="AskMiro Pipeline — sales management CLI")
    sub = parser.add_subparsers(dest="command")

    # shortlist
    p_short = sub.add_parser("shortlist", help="Shortlist top leads into pipeline")
    p_short.add_argument("--limit",     type=int, default=100)
    p_short.add_argument("--min-score", type=int, default=60)
    p_short.add_argument("--owner",     type=str, default=None)

    # today
    sub.add_parser("today", help="Today's sales actions")

    # advance
    p_adv = sub.add_parser("advance", help="Move a lead to a new status")
    p_adv.add_argument("place_id")
    p_adv.add_argument("status")
    p_adv.add_argument("--channel", type=str, default=None)
    p_adv.add_argument("--notes",   type=str, default=None)

    # outreach
    p_out = sub.add_parser("outreach", help="Generate outreach packs")
    p_out.add_argument("--place-id",    type=str, default=None)
    p_out.add_argument("--batch-limit", type=int, default=50)
    p_out.add_argument("--force",       action="store_true")

    # weekly-plan
    sub.add_parser("weekly-plan", help="AI weekly sales plan")

    # what-to-say
    p_wts = sub.add_parser("what-to-say", help="AI: what to say to a specific lead")
    p_wts.add_argument("place_id")

    args = parser.parse_args()
    setup_logging()
    init_db()

    dispatch = {
        "shortlist":    cmd_shortlist,
        "today":        cmd_today,
        "advance":      cmd_advance,
        "outreach":     cmd_outreach,
        "weekly-plan":  cmd_weekly_plan,
        "what-to-say":  cmd_what_to_say,
    }

    if args.command in dispatch:
        dispatch[args.command](args)
    else:
        parser.print_help()


# Fix missing import in cmd_outreach
from outreach_generator import generate_outreach


if __name__ == "__main__":
    main()
