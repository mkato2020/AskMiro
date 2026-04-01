"""
migrate_sqlite_to_render.py
----------------------------
Copies lead_records + pipeline_leads from local SQLite into Render Postgres.
Uses the SAME schema as database.py — no schema changes needed.
Safe to re-run: ON CONFLICT DO NOTHING on place_id.
"""
import os, sqlite3, sys
from pathlib import Path
import psycopg2
import psycopg2.extras

PG_URL  = os.environ["DATABASE_URL"]
DB_PATH = Path(__file__).parent / "data" / "askmiro.db"
BATCH   = 500

def get_columns(sq_conn, table):
    return [r[1] for r in sq_conn.execute(f"PRAGMA table_info({table})").fetchall()]

def migrate():
    print(f"Source: {DB_PATH}")
    print(f"Target: {PG_URL[:50]}...")

    sq = sqlite3.connect(str(DB_PATH))
    sq.row_factory = sqlite3.Row

    # Fix postgres URL prefix if needed
    pg_url = PG_URL
    if pg_url.startswith("postgres://"):
        pg_url = "postgresql://" + pg_url[len("postgres://"):]

    pg = psycopg2.connect(pg_url)
    pg.autocommit = False

    # ── 1. Init tables ────────────────────────────────────────────────
    print("\nStep 1: Initialising Postgres schema…")
    sys.path.insert(0, str(Path(__file__).parent))
    os.environ["DATABASE_URL"] = PG_URL  # ensure init_db uses PG
    import database
    # reload so _USE_POSTGRES picks up the env var
    import importlib; importlib.reload(database)
    database.init_db()
    print("  Schema ready.")

    # ── 2. lead_records ───────────────────────────────────────────────
    sq_cols = get_columns(sq, "lead_records")
    n = sq.execute("SELECT COUNT(*) FROM lead_records").fetchone()[0]
    print(f"\nStep 2: Migrating {n:,} lead_records…")

    inserted = skipped = 0
    with pg.cursor() as cur:
        for offset in range(0, n, BATCH):
            rows = sq.execute(f"SELECT * FROM lead_records LIMIT {BATCH} OFFSET {offset}").fetchall()
            for r in rows:
                vals = [r[c] for c in sq_cols]
                placeholders = ", ".join(["%s"] * len(sq_cols))
                cols_str = ", ".join(sq_cols)
                try:
                    cur.execute(
                        f"INSERT INTO lead_records ({cols_str}) VALUES ({placeholders}) "
                        f"ON CONFLICT (place_id) DO NOTHING",
                        vals
                    )
                    if cur.rowcount:
                        inserted += 1
                    else:
                        skipped += 1
                except Exception as e:
                    skipped += 1
            pg.commit()
            done = min(offset + BATCH, n)
            print(f"  {done:,}/{n:,} ({int(done/n*100)}%)", end="\r", flush=True)

    print(f"\n  Done: {inserted:,} inserted, {skipped:,} skipped")

    # ── 3. pipeline_leads ─────────────────────────────────────────────
    sq_cols_pl = get_columns(sq, "pipeline_leads")
    pl_rows = sq.execute("SELECT * FROM pipeline_leads").fetchall()
    n_pl = len(pl_rows)
    print(f"\nStep 3: Migrating {n_pl:,} pipeline_leads…")

    ins_pl = skip_pl = 0
    with pg.cursor() as cur:
        for r in pl_rows:
            vals = [r[c] for c in sq_cols_pl]
            placeholders = ", ".join(["%s"] * len(sq_cols_pl))
            cols_str = ", ".join(sq_cols_pl)
            try:
                cur.execute(
                    f"INSERT INTO pipeline_leads ({cols_str}) VALUES ({placeholders}) "
                    f"ON CONFLICT (place_id) DO NOTHING",
                    vals
                )
                if cur.rowcount:
                    ins_pl += 1
                else:
                    skip_pl += 1
            except Exception as e:
                skip_pl += 1
        pg.commit()

    print(f"  Done: {ins_pl:,} inserted, {skip_pl:,} skipped")

    # ── Summary ───────────────────────────────────────────────────────
    with pg.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT COUNT(*) AS cnt FROM lead_records")
        pg_leads = cur.fetchone()["cnt"]
        cur.execute("SELECT COUNT(*) AS cnt FROM pipeline_leads")
        pg_pl = cur.fetchone()["cnt"]

    print(f"\n{'='*40}")
    print(f"Postgres now has:")
    print(f"  lead_records:   {pg_leads:,}")
    print(f"  pipeline_leads: {pg_pl:,}")
    print(f"{'='*40}")
    print("Migration complete ✓")

    sq.close()
    pg.close()

if __name__ == "__main__":
    migrate()
