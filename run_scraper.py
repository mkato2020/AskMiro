"""
run_scraper.py — AskMiro Lead Intelligence OS
CLI entry point for the scraping engine.
Uses Google Places API v1 (New).
Dual-writes to SQLite + live CSV.
Resumable across crashes.
"""

import argparse
import logging
import sys
from pathlib import Path

from config import GOOGLE_PLACES_API_KEY, EXPORTS_DIR
from database import (
    init_db, register_scraper_jobs, get_pending_scraper_jobs,
    mark_job_running, mark_job_complete, mark_job_failed,
)
from scraper import scrape_query, build_job_matrix, ensure_csv, CSV_PATH
from logger_setup import setup_logging

logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="AskMiro Scraper — Google Places v1 intake engine"
    )
    parser.add_argument("--limit",    type=int,  default=None,  help="Max jobs to run this session")
    parser.add_argument("--borough",  type=str,  default=None,  help="Restrict to one borough name")
    parser.add_argument("--sector",   type=str,  default=None,  help="Restrict to one sector keyword")
    parser.add_argument("--dry-run",  action="store_true",       help="Register jobs but don't scrape")
    parser.add_argument("--status",   action="store_true",       help="Show pending jobs and exit")
    parser.add_argument("--csv",      type=str,  default=str(CSV_PATH), help="CSV output path")
    args = parser.parse_args()

    setup_logging()
    init_db()

    if not GOOGLE_PLACES_API_KEY:
        logger.error("GOOGLE_PLACES_API_KEY not set.")
        logger.error("Run: export GOOGLE_PLACES_API_KEY='AIzaSyBFCYbbli_hpf_gVpriXtoqgFlZF-XUACk'")
        sys.exit(1)

    csv_path = Path(args.csv)

    # Build and register the full job matrix
    all_jobs = build_job_matrix()

    # Apply CLI filters
    if args.borough:
        all_jobs = [(q, b, s) for q, b, s in all_jobs if args.borough.lower() in b.lower()]
    if args.sector:
        all_jobs = [(q, b, s) for q, b, s in all_jobs if args.sector.lower() in s.lower()]

    register_scraper_jobs(all_jobs)
    pending = get_pending_scraper_jobs()

    print(f"\n  AskMiro Scraper — Google Places v1")
    print(f"  ─────────────────────────────────────────")
    print(f"  Pending jobs:    {len(pending)}")
    print(f"  Output CSV:      {csv_path}")
    print(f"  API key:         {GOOGLE_PLACES_API_KEY[:12]}...")
    print()

    if args.status or args.dry_run:
        sys.exit(0)

    if args.limit:
        pending = pending[:args.limit]

    # Initialise CSV — loads existing place_ids for dedup
    csv_seen = ensure_csv(csv_path)

    total_db  = 0
    total_csv = 0
    jobs_done = 0

    for job in pending:
        jid     = job["id"]
        query   = job["query"]
        borough = job["borough"]
        sector  = job["sector"]

        print(f"  [{jobs_done+1}/{len(pending)}] {query}")
        mark_job_running(jid)

        try:
            db_n, csv_n = scrape_query(
                query    = query,
                sector   = sector,
                borough  = borough,
                csv_path = csv_path,
                csv_seen = csv_seen,
            )
            mark_job_complete(jid, db_n)
            total_db  += db_n
            total_csv += csv_n
            jobs_done += 1
            print(f"         → {db_n} new DB records | {csv_n} new CSV rows")

        except Exception as e:
            logger.error("Job %d failed: %s", jid, e)
            mark_job_failed(jid, str(e))

    print(f"\n  ─────────────────────────────────────────")
    print(f"  ✓ Done.  Jobs run: {jobs_done}")
    print(f"  ✓ New DB records:  {total_db}")
    print(f"  ✓ New CSV rows:    {total_csv}")
    print(f"  ✓ CSV saved to:    {csv_path}")
    print()


if __name__ == "__main__":
    main()
