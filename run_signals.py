"""run_signals.py — detect buying signals."""
import argparse, logging
from logger_setup import setup_logging
from database import init_db
from buying_signals import run_buying_signals_batch
logger=logging.getLogger(__name__)

def main():
    p=argparse.ArgumentParser(description='AskMiro Buying Signals')
    p.add_argument('--limit', type=int, default=500)
    p.add_argument('--no-ai', action='store_true')
    p.add_argument('--force', action='store_true')
    args=p.parse_args(); setup_logging(); init_db()
    n=run_buying_signals_batch(limit=args.limit, use_ai=not args.no_ai, force=args.force)
    print(f"✓ Buying signals complete. {n} leads processed.")

if __name__=='__main__': main()
