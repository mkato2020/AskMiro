"""
run_reports.py — AskMiro Lead Intelligence OS
Analytics and reporting CLI.
"""

import argparse
import json
import logging
import csv
import sys
from pathlib import Path
from datetime import datetime

from database import init_db
from analytics import (
    database_summary, leads_by_borough, leads_by_sector,
    top_leads_this_week, pipeline_funnel, pipeline_by_sector,
    pipeline_by_borough, contract_value_by_sector, revenue_summary,
    best_borough_to_visit, high_value_targets, reply_rate_by_channel,
    buying_signal_breakdown, high_urgency_by_borough, strong_triggers_by_sector,
)
from config import EXPORTS_DIR
from logger_setup import setup_logging

logger = logging.getLogger(__name__)


def _table(rows: list, cols: list = None):
    """Print a simple ASCII table."""
    if not rows:
        print("  (no data)")
        return
    if cols is None:
        cols = list(rows[0].keys())
    widths = {c: max(len(str(c)), max(len(str(r.get(c, ""))) for r in rows)) for c in cols}
    header = "  " + " │ ".join(str(c).ljust(widths[c]) for c in cols)
    sep    = "  " + "─┼─".join("─" * widths[c] for c in cols)
    print(header)
    print(sep)
    for r in rows:
        print("  " + " │ ".join(str(r.get(c, "")).ljust(widths[c]) for c in cols))


def cmd_status(args):
    s = database_summary()
    print("\n═══════════════════════════════════════════")
    print("  AskMiro OS — Database Status")
    print("═══════════════════════════════════════════")
    for k, v in s.items():
        print(f"  {k:<25} {v}")


def cmd_market(args):
    print("\n── Leads by Borough ──")
    _table(leads_by_borough(), ["borough", "lead_count", "avg_score", "hvt_count"])
    print("\n── Leads by Sector ──")
    _table(leads_by_sector(), ["sector", "lead_count", "avg_score", "hvt_count", "with_phone", "with_website"])


def cmd_pipeline(args):
    funnel = pipeline_funnel()
    print("\n── Pipeline Funnel ──")
    for status, count in funnel["funnel"].items():
        print(f"  {status:<20} {count}")
    print(f"\n  Reply rate:      {funnel['reply_rate']}")
    print(f"  Quote rate:      {funnel['quote_rate']}")
    print(f"  Win rate (quoted): {funnel['win_rate_from_quoted']}")
    print(f"  Overall win rate:  {funnel['overall_win_rate']}")

    print("\n── By Sector ──")
    _table(pipeline_by_sector(), ["sector", "total", "replied", "quoted", "won", "win_rate", "reply_rate"])

    print("\n── By Borough ──")
    _table(pipeline_by_borough(), ["borough", "total", "quoted", "won", "win_rate"])

    print("\n── By Channel ──")
    _table(reply_rate_by_channel(), ["contact_channel", "total", "replied", "reply_rate"])


def cmd_revenue(args):
    rev = revenue_summary()
    print("\n── Revenue Summary ──")
    for k, v in rev.items():
        print(f"  {k:<25} {v}")

    print("\n── Contract Value by Sector ──")
    _table(contract_value_by_sector(), ["sector", "contracts", "avg_monthly_gbp", "total_monthly_gbp", "total_annual_gbp"])


def cmd_top_leads(args):
    leads = top_leads_this_week(limit=args.limit)
    print(f"\n── Top {len(leads)} Leads for Outreach This Week ──\n")
    _table(leads, ["business_name", "normalized_sector", "borough",
                   "priority_score", "high_value_target", "next_best_action",
                   "has_phone", "has_website"])


def cmd_visit(args):
    boroughs = best_borough_to_visit()
    print("\n── Best Borough Clusters to Visit ──")
    _table(boroughs, ["borough", "hvt_count", "avg_score", "contactable", "total_leads"])


def cmd_signals(args):
    print("\n── Buying Signal Breakdown ──")
    _table(buying_signal_breakdown(), ["timing_urgency", "total", "avg_signal_score"])
    print("\n── High-Urgency Leads by Borough ──")
    _table(high_urgency_by_borough(), ["borough", "high_urgency_leads", "avg_score"])
    print("\n── Strong Triggers by Sector ──")
    _table(strong_triggers_by_sector(), ["sector", "total", "avg_signal_score", "multi_site", "hiring", "compliance"])


def cmd_export(args):
    leads = top_leads_this_week(limit=args.limit)
    ts    = datetime.now().strftime("%Y%m%d_%H%M%S")
    path  = EXPORTS_DIR / f"top_leads_{ts}.csv"
    if not leads:
        print("No leads to export.")
        return
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=leads[0].keys())
        writer.writeheader()
        writer.writerows(leads)
    print(f"✓ Exported {len(leads)} leads to {path}")


def cmd_full_report(args):
    cmd_status(args)
    cmd_market(args)
    cmd_signals(args)
    cmd_pipeline(args)
    cmd_revenue(args)
    cmd_visit(args)


def main():
    parser = argparse.ArgumentParser(description="AskMiro Reports — analytics CLI")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status",      help="Database health summary")
    sub.add_parser("market",      help="Market intelligence: boroughs + sectors")
    sub.add_parser("pipeline",    help="Pipeline funnel analytics")
    sub.add_parser("revenue",     help="Revenue and contract analytics")
    sub.add_parser("visit",       help="Best boroughs for field visits")
    sub.add_parser("signals",     help="Buying signal analytics")
    sub.add_parser("full",        help="Full report")

    p_top = sub.add_parser("top-leads", help="Top leads for outreach")
    p_top.add_argument("--limit", type=int, default=100)

    p_exp = sub.add_parser("export", help="Export top leads to CSV")
    p_exp.add_argument("--limit", type=int, default=100)

    args = parser.parse_args()
    setup_logging()
    init_db()

    dispatch = {
        "status":    cmd_status,
        "market":    cmd_market,
        "pipeline":  cmd_pipeline,
        "revenue":   cmd_revenue,
        "top-leads": cmd_top_leads,
        "visit":     cmd_visit,
        "signals":   cmd_signals,
        "export":    cmd_export,
        "full":      cmd_full_report,
    }

    if args.command in dispatch:
        dispatch[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
