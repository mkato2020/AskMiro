"""
run_email_scrape_fast.py — Parallel email scraper (8x faster)
Uses ThreadPoolExecutor to scrape multiple websites simultaneously.
"""
import sys, time, sqlite3, logging, argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

DB_PATH    = "data/askmiro.db"
BATCH      = 50
MIN_SCORE  = 65
WORKERS    = 10   # parallel scrapers

from services.email_scraper import find_email

db_lock  = Lock()
counters = {"enriched": 0, "skipped": 0, "failed": 0, "done": 0}
pending_writes = []

def scrape_one(row):
    place_id = row["place_id"]
    website  = row["website"]
    name     = row["business_name"] or ""
    score    = row["priority_score"]
    try:
        result = find_email(website, place_id)
        return place_id, name, score, result["email"], result["source"], result["confidence"]
    except Exception as exc:
        return place_id, name, score, None, None, None

def run(workers: int = WORKERS):
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row

    rows = conn.execute(f"""
        SELECT place_id, business_name, website, priority_score
        FROM lead_records
        WHERE priority_score >= ?
          AND ai_is_cleaning_target = 1
          AND COALESCE(website, '') != ''
          AND COALESCE(email, '') = ''
        ORDER BY priority_score DESC
    """, (MIN_SCORE,)).fetchall()
    conn.close()

    rows = list(rows)
    total = len(rows)
    log.info("=" * 64)
    log.info(f"AskMiro Fast Email Scraper — {total:,} leads — {workers} workers")
    log.info("=" * 64)

    t_start   = time.time()
    pending   = []
    done      = 0

    write_conn = sqlite3.connect(DB_PATH, timeout=30)
    write_conn.execute("PRAGMA journal_mode=WAL")

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(scrape_one, r): r for r in rows}
        for fut in as_completed(futures):
            place_id, name, score, email, src, conf = fut.result()
            done += 1

            if email and conf in ("high", "medium"):
                pending.append((email, place_id))
                counters["enriched"] += 1
                status = f"✓  {email}  [{conf}/{src}]"
            elif email:
                counters["skipped"] += 1
                status = f"—  skipped low conf ({email})"
            else:
                counters["skipped"] += 1
                status = "—  no email found"

            elapsed = time.time() - t_start
            rate    = done / elapsed if elapsed > 0 else 0
            eta_s   = (total - done) / rate if rate > 0 else 0
            eta_str = f"{int(eta_s//60)}m{int(eta_s%60):02d}s"

            log.info(f"[{done:5d}/{total}] {name[:40]:40s}  {status}  ETA {eta_str}")

            if len(pending) >= BATCH:
                write_conn.executemany(
                    "UPDATE lead_records SET email=?, updated_at=datetime('now') WHERE place_id=?",
                    pending,
                )
                write_conn.commit()
                pending.clear()

    if pending:
        write_conn.executemany(
            "UPDATE lead_records SET email=?, updated_at=datetime('now') WHERE place_id=?",
            pending,
        )
        write_conn.commit()
    write_conn.close()

    elapsed_total = time.time() - t_start
    log.info("=" * 64)
    log.info(f"DONE in {int(elapsed_total//60)}m{int(elapsed_total%60):02d}s")
    log.info(f"  ✓ Enriched : {counters['enriched']:,}")
    log.info(f"  — Skipped  : {counters['skipped']:,}")
    log.info(f"  Total      : {total:,}")
    log.info("=" * 64)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=WORKERS)
    args = parser.parse_args()
    run(workers=args.workers)
