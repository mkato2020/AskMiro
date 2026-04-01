"""
run_score_pg.py — Rescore all entities in PostgreSQL
Usage:
    python run_score_pg.py [--all] [--entity-id 123]
"""

import argparse
import logging
import sys

import db_pg
import scoring_pg

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Rescore AskMiro entities')
    ap.add_argument('--all', action='store_true', help='Rescore all active entities')
    ap.add_argument('--entity-id', type=int, default=None, help='Rescore a single entity')
    ap.add_argument('--batch-size', type=int, default=500)
    args = ap.parse_args()

    if not args.all and not args.entity_id:
        ap.print_help()
        sys.exit(1)

    with db_pg.transaction() as conn:
        if args.entity_id:
            scores = scoring_pg.rescore_entity(conn, args.entity_id)
            print(f"Entity {args.entity_id} rescored: total={scores['total_score']} band={scoring_pg.score_band(scores['total_score'])}")
        else:
            print("Rescoring all entities...")
            n = scoring_pg.rescore_all(conn, batch_size=args.batch_size)
            print(f"Done: {n:,} entities rescored")
