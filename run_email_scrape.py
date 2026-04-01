"""
run_email_scrape.py — Bulk email enrichment runner
Scrapes contact emails for all priority leads that have websites but no email.

Usage:
  python run_email_scrape.py           # real scraped emails only (medium+ confidence)
  python run_email_scrape.py --fill    # fill remaining leads with info@ fallbacks (low conf)
  python run_email_scrape.py --all     # reprocess everything including already-enriched leads
"""
import sys, time, sqlite3, logging, argparse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

DB_PATH = "data/askmiro.db"

# ── Pull the scraper directly (no FastAPI needed) ─────────────
from services.email_scraper import find_email

BATCH      = 50    # commit every N leads
MIN_SCORE  = 65


def run(min_conf: str = "medium", include_existing: bool = False):
    mode_label = {
        "medium": "real scraped only  (skips info@ fallbacks)",
        "low":    "fill mode          (saves info@ fallbacks for remaining leads)",
        "high":   "high-confidence only",
    }.get(min_conf, min_conf)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # In fill mode only process leads that STILL have no email
    email_filter = "AND COALESCE(email, '') = ''" if not include_existing else ""

    rows = conn.execute(f"""
        SELECT place_id, business_name, website, priority_score
        FROM lead_records
        WHERE priority_score >= ?
          AND ai_is_cleaning_target = 1
          AND COALESCE(website, '') != ''
          {email_filter}
        ORDER BY priority_score DESC
    """, (MIN_SCORE,)).fetchall()

    total    = len(rows)
    enriched = 0
    skipped  = 0
    failed   = 0
    pending  = 0

    log.info("=" * 64)
    log.info(f"AskMiro Email Scraper — {total:,} leads to process")
    log.info(f"Min score: {MIN_SCORE}  |  Mode: {mode_label}")
    log.info("=" * 64)

    conf_rank = {"high": 0, "medium": 1, "low": 2}
    min_rank  = conf_rank.get(min_conf, 1)

    t_start = time.time()

    for i, row in enumerate(rows, 1):
        place_id = row["place_id"]
        website  = row["website"]
        name     = row["business_name"] or ""
        score    = row["priority_score"]

        try:
            result = find_email(website, place_id)
            email  = result["email"]
            src    = result["source"]
            conf   = result["confidence"]

            if not email:
                skipped += 1
                status = "—  no email found"
            elif conf_rank.get(conf, 2) > min_rank:
                skipped += 1
                status = f"—  skipped ({conf}/{src})"
            else:
                conn.execute(
                    "UPDATE lead_records SET email=?, updated_at=datetime('now') WHERE place_id=?",
                    (email, place_id),
                )
                enriched += 1
                pending  += 1
                status = f"✓  {email}  [{conf}/{src}]"

        except Exception as exc:
            failed += 1
            status = f"✗  ERROR: {exc}"

        # Progress line
        elapsed = time.time() - t_start
        rate    = i / elapsed if elapsed > 0 else 0
        eta_s   = (total - i) / rate if rate > 0 else 0
        eta_str = f"{int(eta_s//60)}m{int(eta_s%60):02d}s"

        log.info(
            f"[{i:4d}/{total}] {name[:40]:40s}  {status}"
            f"   (score={score})   ETA {eta_str}"
        )

        # Batch commit
        if pending >= BATCH:
            conn.commit()
            pending = 0

    # Final commit
    conn.commit()
    conn.close()

    elapsed_total = time.time() - t_start
    log.info("=" * 64)
    log.info(f"DONE in {int(elapsed_total//60)}m{int(elapsed_total%60):02d}s")
    log.info(f"  ✓ Enriched : {enriched:,}")
    log.info(f"  — Skipped  : {skipped:,}")
    log.info(f"  ✗ Failed   : {failed:,}")
    log.info(f"  Total      : {total:,}")
    log.info("=" * 64)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AskMiro bulk email enrichment")
    parser.add_argument(
        "--fill",
        action="store_true",
        help="Fill remaining leads (no email yet) with info@ fallbacks (low confidence)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Reprocess ALL leads including ones already enriched",
    )
    args = parser.parse_args()

    if args.fill:
        log.info("FILL MODE — saving info@ fallbacks for leads with no real email found")
        run(min_conf="low", include_existing=False)
    elif args.all:
        log.info("ALL MODE — reprocessing every lead (including already enriched)")
        run(min_conf="medium", include_existing=True)
    else:
        run(min_conf="medium", include_existing=False)
