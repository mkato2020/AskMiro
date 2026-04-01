"""
run_enrichment.py — AskMiro Lead Intelligence OS
Runs AI classification on unclassified lead records.
"""

import argparse
import logging

from database import init_db
from enrichment import run_enrichment_batch
from website_intelligence import run_website_intelligence_batch
from logger_setup import setup_logging

logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="AskMiro Enrichment — AI classification")
    parser.add_argument("--limit",      type=int,  default=500,  help="Max leads to classify")
    parser.add_argument("--websites",   action="store_true",     help="Also run website intelligence")
    parser.add_argument("--web-limit",  type=int,  default=100,  help="Max websites to analyse")
    parser.add_argument("--force",      action="store_true",     help="Re-run even if already classified")
    parser.add_argument("--only-other", action="store_true",     help="Only classify leads in the 'other' sector")
    args = parser.parse_args()

    setup_logging()
    init_db()

    n = run_enrichment_batch(limit=args.limit, force=args.force, only_other=args.only_other)
    print(f"✓ AI classification complete. {n} leads processed.")

    if args.websites:
        w = run_website_intelligence_batch(limit=args.web_limit)
        print(f"✓ Website intelligence complete. {w} websites analysed.")


if __name__ == "__main__":
    main()
