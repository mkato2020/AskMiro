"""
run_scoring.py — AskMiro Lead Intelligence OS
Scores lead records. Hybrid rule-based + AI signals.
"""

import argparse
import logging

from database import init_db
from scoring import run_scoring_batch
from logger_setup import setup_logging

logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="AskMiro Scoring — lead prioritisation")
    parser.add_argument("--limit",    type=int,  default=1000, help="Max leads to score")
    parser.add_argument("--no-ai",    action="store_true",     help="Use rule-based scoring only (fast)")
    args = parser.parse_args()

    setup_logging()
    init_db()

    use_ai = not args.no_ai
    n = run_scoring_batch(limit=args.limit, use_ai=use_ai)
    mode = "hybrid AI+rules" if use_ai else "rules-only (fast)"
    print(f"✓ Scoring complete ({mode}). {n} leads scored.")


if __name__ == "__main__":
    main()
