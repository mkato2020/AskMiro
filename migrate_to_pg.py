"""
migrate_to_pg.py — One-shot migration: SQLite → PostgreSQL
Migrates lead_records (46,918 rows) and pipeline_leads (203 rows).
Idempotent: safe to re-run (uses ON CONFLICT DO NOTHING / DO UPDATE).
Run: python migrate_to_pg.py [--dry-run] [--batch-size 500]
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras

# Add project root to path so we can import config, cleaning, etc.
sys.path.insert(0, str(Path(__file__).parent))
import config
import db_pg
from cleaning import extract_postcode, normalize_borough, normalize_sector


# ------------------------------------------------------------------
# Stage mapping: old SQLite status → new pipeline_stage enum
# ------------------------------------------------------------------
STAGE_MAP = {
    'new':           'new',
    'shortlisted':   'ready_to_contact',
    'contacted':     'contacted',
    'follow_up':     'contacted',
    'replied':       'replied',
    'meeting_booked':'meeting_or_site_visit',
    'quoted':        'quote_sent',
    'negotiating':   'negotiating',
    'won':           'won',
    'lost':          'lost',
    'dormant':       'dormant',
}


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def is_london_postcode(pc: str) -> bool:
    if not pc:
        return True  # assume London if no postcode
    return pc.strip().upper().startswith(config.LONDON_POSTCODE_PREFIXES)


def extract_domain(website: str) -> str | None:
    if not website:
        return None
    try:
        parsed = urlparse(website if '://' in website else 'https://' + website)
        return parsed.netloc.lstrip('www.') or None
    except Exception:
        return None


def score_band(total: int) -> str:
    if total >= 80: return 'A'
    if total >= 65: return 'B'
    if total >= 50: return 'C'
    return 'D'


def freshness_score(date_str: str | None) -> int:
    """0-5 based on how recently collected."""
    if not date_str:
        return 1
    try:
        collected = datetime.fromisoformat(str(date_str))
        if collected.tzinfo is None:
            collected = collected.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        months_old = (now - collected).days / 30
        if months_old <= 6:  return 5
        if months_old <= 12: return 3
        return 1
    except Exception:
        return 1


def compute_scores(row: dict) -> dict:
    """
    Multi-dimensional scorer from lead_records fields.
    Returns dict with individual scores + total.
    """
    sector = row.get('normalized_sector') or 'other'

    # fit_score (0-25): sector priority
    priority = config.SECTOR_PRIORITY.get(sector, 4)
    fit_sc = {1: 25, 2: 17, 3: 9, 4: 0}.get(priority, 0)

    # facility_score (0-20): entity kind + review count
    kind = config.SECTOR_TO_KIND.get(sector, 'unknown')
    review_count = int(row.get('review_count') or 0)
    base_fac = 15 if kind in ('facility', 'property_manager') else 8
    fac_sc = min(20, base_fac + min(5, int(math.log10(review_count + 1) * 4)))

    # buyer_signal_score (0-25): rescale from cap=40 to cap=25
    raw_buying = int(row.get('buying_signal_score') or 0)
    buyer_sc = min(25, int(raw_buying * 0.625))

    # contactability_score (0-15)
    contact_sc = 0
    if row.get('phone'):    contact_sc += 5
    if row.get('website'):  contact_sc += 5
    if row.get('email'):    contact_sc += 3
    if row.get('contact_name'): contact_sc += 2

    # scale_score (0-10)
    multi_site = bool(row.get('likely_multi_site') or row.get('multi_site_signal'))
    scale_sc = min(8, int(math.log10(review_count + 1) * 3.5)) + (2 if multi_site else 0)
    scale_sc = min(10, scale_sc)

    # freshness_score (0-5)
    fresh_sc = freshness_score(row.get('date_collected'))

    total = fit_sc + fac_sc + buyer_sc + contact_sc + scale_sc + fresh_sc
    total = min(100, total)

    monthly_val = config.SECTOR_CONTRACT_ESTIMATES.get(sector, 1000)

    return {
        'fit_score':               fit_sc,
        'facility_score':          fac_sc,
        'buyer_signal_score':      buyer_sc,
        'contactability_score':    contact_sc,
        'scale_score':             scale_sc,
        'freshness_score':         fresh_sc,
        'total_score':             total,
        'next_best_action':        row.get('next_best_action'),
        'estimated_contract_value_gbp':  monthly_val,
        'estimated_monthly_value_gbp':   monthly_val,
    }


# ------------------------------------------------------------------
# Migration
# ------------------------------------------------------------------

def migrate(dry_run: bool = False, batch_size: int = 500):
    sqlite_path = str(config.DB_PATH)
    print(f"Source: {sqlite_path}")
    print(f"Target: {config.PG_DSN}")
    print(f"Mode:   {'DRY RUN' if dry_run else 'LIVE'}")
    print()

    sq = sqlite3.connect(sqlite_path)
    sq.row_factory = sqlite3.Row

    # Count source rows
    n_leads    = sq.execute("SELECT COUNT(*) FROM lead_records").fetchone()[0]
    n_pipeline = sq.execute("SELECT COUNT(*) FROM pipeline_leads").fetchone()[0]
    n_raw      = sq.execute("SELECT COUNT(*) FROM raw_leads").fetchone()[0]
    print(f"Source rows: {n_leads:,} lead_records | {n_pipeline:,} pipeline_leads | {n_raw:,} raw_leads")

    if dry_run:
        print("\n[DRY RUN] No changes made.")
        sq.close()
        return

    pg = db_pg.get_conn()

    # ----------------------------------------------------------------
    # Step 1: Create a single ingest_run for this migration
    # ----------------------------------------------------------------
    t0 = time.time()
    print("\nStep 1: Creating ingest run…")
    with pg.cursor() as cur:
        cur.execute("""
            INSERT INTO ingest_runs (source, started_at, notes)
            VALUES ('google_maps', NOW(), 'Initial migration from SQLite')
            RETURNING id
        """)
        ingest_run_id = cur.fetchone()['id']
    pg.commit()
    print(f"  ingest_run_id = {ingest_run_id}")

    # ----------------------------------------------------------------
    # Step 2: Migrate raw_leads → raw_source_records
    # ----------------------------------------------------------------
    print(f"\nStep 2: Migrating {n_raw:,} raw_leads → raw_source_records…")
    inserted_raw = 0
    skipped_raw = 0
    for offset in range(0, n_raw, batch_size):
        rows = sq.execute(f"SELECT * FROM raw_leads LIMIT {batch_size} OFFSET {offset}").fetchall()
        with pg.cursor() as cur:
            for r in rows:
                r = dict(r)
                try:
                    cur.execute("""
                        INSERT INTO raw_source_records (source, source_record_id, ingest_run_id, payload, fetched_at)
                        VALUES ('google_maps', %s, %s, %s, NOW())
                        ON CONFLICT (source, source_record_id) DO NOTHING
                    """, (r['place_id'], ingest_run_id, json.dumps(r)))
                    inserted_raw += cur.rowcount
                except Exception:
                    skipped_raw += 1
        pg.commit()
        pct = min(100, int((offset + batch_size) / n_raw * 100))
        print(f"  raw_leads: {pct}% ({offset+len(rows):,}/{n_raw:,})", end='\r')
    print(f"\n  Done: {inserted_raw:,} inserted, {skipped_raw:,} skipped")

    # ----------------------------------------------------------------
    # Step 3: Migrate lead_records → addresses + entities + opportunity_scores + signals
    # ----------------------------------------------------------------
    print(f"\nStep 3: Migrating {n_leads:,} lead_records → entities…")
    inserted_entities = 0
    skipped_entities  = 0
    # Build place_id → entity_id map for pipeline step
    place_id_to_entity: dict[str, int] = {}

    for offset in range(0, n_leads, batch_size):
        rows = sq.execute(f"SELECT * FROM lead_records LIMIT {batch_size} OFFSET {offset}").fetchall()
        with pg.cursor() as cur:
            for r in rows:
                r = dict(r)
                place_id = r.get('place_id') or ''
                sector   = r.get('normalized_sector') or 'other'
                kind     = config.SECTOR_TO_KIND.get(sector, 'unknown')

                # ---- address ----
                postcode = r.get('postcode') or ''
                if not postcode:
                    postcode = extract_postcode(r.get('address') or '') or ''
                cur.execute("""
                    INSERT INTO addresses (line1, borough, postcode, latitude, longitude)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    r.get('address'),
                    r.get('borough'),
                    postcode or None,
                    r.get('latitude'),
                    r.get('longitude'),
                ))
                address_id = cur.fetchone()['id']

                # ---- entity ----
                name     = r.get('business_name') or ''
                norm_name = name.lower().strip()
                website  = r.get('website') or None
                domain   = extract_domain(website)
                phone    = r.get('phone') or None
                hvt      = bool(r.get('high_value_target') or r.get('hvt'))
                archived = r.get('archived_at')

                cur.execute("""
                    INSERT INTO entities (
                        entity_kind, canonical_name, normalized_name, sector, sub_sector,
                        primary_website, website_domain, primary_phone, primary_email,
                        hvt, active, archived_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (entity_kind, normalized_name, COALESCE(company_number, ''))
                    DO UPDATE SET
                        primary_phone  = COALESCE(EXCLUDED.primary_phone, entities.primary_phone),
                        primary_website= COALESCE(EXCLUDED.primary_website, entities.primary_website),
                        updated_at = NOW()
                    RETURNING id
                """, (
                    kind, name, norm_name, sector,
                    r.get('ai_sub_sector'),
                    website, domain, phone,
                    r.get('email') or None,
                    hvt,
                    archived is None,
                    archived,
                ))
                entity_id = cur.fetchone()['id']

                # ---- entity_location ----
                cur.execute("""
                    INSERT INTO entity_locations (entity_id, address_id, is_primary)
                    VALUES (%s, %s, TRUE)
                    ON CONFLICT (entity_id, address_id) DO NOTHING
                """, (entity_id, address_id))

                # ---- entity_source_links ----
                if place_id:
                    cur.execute("""
                        INSERT INTO entity_source_links (entity_id, source, source_record_id, confidence)
                        VALUES (%s, 'google_maps', %s, 100)
                        ON CONFLICT (source, source_record_id) DO NOTHING
                    """, (entity_id, place_id))
                    place_id_to_entity[place_id] = entity_id

                # ---- opportunity_scores ----
                scores = compute_scores(r)
                band   = score_band(scores['total_score'])
                cur.execute("""
                    INSERT INTO opportunity_scores (
                        entity_id, fit_score, facility_score, buyer_signal_score,
                        contactability_score, scale_score, freshness_score,
                        total_score, score_band, next_best_action,
                        estimated_contract_value_gbp, estimated_monthly_value_gbp,
                        scored_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                    ON CONFLICT (entity_id) DO UPDATE SET
                        total_score = EXCLUDED.total_score,
                        score_band  = EXCLUDED.score_band,
                        scored_at   = NOW()
                """, (
                    entity_id,
                    scores['fit_score'], scores['facility_score'],
                    scores['buyer_signal_score'], scores['contactability_score'],
                    scores['scale_score'], scores['freshness_score'],
                    scores['total_score'], band,
                    scores['next_best_action'],
                    scores['estimated_contract_value_gbp'],
                    scores['estimated_monthly_value_gbp'],
                ))

                # ---- signals (from buying signal columns) ----
                signal_cols = [
                    'move_signal', 'expansion_signal', 'refurb_signal',
                    'hiring_signal', 'compliance_signal', 'review_signal', 'multi_site_signal',
                ]
                for sig in signal_cols:
                    if r.get(sig):
                        weight = config.BUYING_SIGNAL_WEIGHTS.get(sig, 10)
                        strength = min(100, int(weight * 4))
                        try:
                            cur.execute("""
                                INSERT INTO signals (entity_id, signal_type, strength, source)
                                VALUES (%s, %s, %s, 'google_maps')
                                ON CONFLICT DO NOTHING
                            """, (entity_id, sig, strength))
                        except psycopg2.errors.InvalidTextRepresentation:
                            pass  # signal_type not in enum — skip gracefully

                inserted_entities += 1

        pg.commit()
        pct = min(100, int((offset + batch_size) / n_leads * 100))
        print(f"  lead_records: {pct}% ({offset+len(rows):,}/{n_leads:,})", end='\r')

    print(f"\n  Done: {inserted_entities:,} entities processed")

    # ----------------------------------------------------------------
    # Step 4: Migrate pipeline_leads → opportunities + stage_history
    # ----------------------------------------------------------------
    print(f"\nStep 4: Migrating {n_pipeline:,} pipeline_leads → opportunities…")
    pipeline_rows = sq.execute("SELECT * FROM pipeline_leads").fetchall()
    inserted_opps = 0

    with pg.cursor() as cur:
        for r in pipeline_rows:
            r = dict(r)
            place_id = r.get('place_id') or ''
            entity_id = place_id_to_entity.get(place_id)

            if entity_id is None:
                # Try looking up by source link
                cur.execute("""
                    SELECT entity_id FROM entity_source_links
                    WHERE source = 'google_maps' AND source_record_id = %s
                """, (place_id,))
                row = cur.fetchone()
                if row:
                    entity_id = row['entity_id']

            if entity_id is None:
                print(f"  WARNING: no entity for place_id={place_id!r} — skipping")
                continue

            old_status = r.get('status') or 'new'
            new_stage  = STAGE_MAP.get(old_status, 'new')
            title      = f"Commercial cleaning — {r.get('business_name') or 'Unknown'}"

            # next_follow_up may be date string
            followup = r.get('next_follow_up') or r.get('next_followup')
            if followup:
                try:
                    followup = datetime.fromisoformat(str(followup))
                except Exception:
                    followup = None

            last_touched = r.get('last_touched') or r.get('last_touched_at')
            if last_touched:
                try:
                    last_touched = datetime.fromisoformat(str(last_touched))
                except Exception:
                    last_touched = None

            cur.execute("""
                INSERT INTO opportunities (entity_id, title, current_stage, owner, next_followup_at, last_touched_at, loss_reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (entity_id) DO UPDATE SET
                    current_stage = EXCLUDED.current_stage,
                    updated_at = NOW()
                RETURNING id
            """, (
                entity_id, title, new_stage,
                r.get('owner'),
                followup, last_touched,
                r.get('loss_reason'),
            ))
            opp_id = cur.fetchone()['id']

            # stage history — one initial entry
            stage_entered = r.get('stage_entered_at') or r.get('created_at')
            if stage_entered:
                try:
                    stage_entered = datetime.fromisoformat(str(stage_entered))
                except Exception:
                    stage_entered = datetime.now(timezone.utc)
            else:
                stage_entered = datetime.now(timezone.utc)

            cur.execute("""
                INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, actor, changed_at)
                VALUES (%s, NULL, %s, 'migration', %s)
                ON CONFLICT DO NOTHING
            """, (opp_id, new_stage, stage_entered))

            # quote if present
            qv = r.get('quote_value_gbp')
            if qv:
                cur.execute("""
                    INSERT INTO quotes (opportunity_id, quote_value_gbp, quote_date)
                    VALUES (%s, %s, NOW())
                """, (opp_id, qv))

            # outcome if won/lost
            if new_stage == 'won' and r.get('win_date'):
                cur.execute("""
                    INSERT INTO outcomes (opportunity_id, outcome, recorded_at)
                    VALUES (%s, 'won', %s)
                """, (opp_id, r['win_date']))
            elif new_stage == 'lost' and r.get('loss_date'):
                cur.execute("""
                    INSERT INTO outcomes (opportunity_id, outcome, recorded_at)
                    VALUES (%s, 'lost', %s)
                """, (opp_id, r['loss_date']))

            inserted_opps += 1

    pg.commit()
    print(f"  Done: {inserted_opps:,} opportunities migrated")

    # ----------------------------------------------------------------
    # Step 5: Update ingest_run with final counts
    # ----------------------------------------------------------------
    with pg.cursor() as cur:
        cur.execute("""
            UPDATE ingest_runs
            SET finished_at = NOW(), record_count = %s
            WHERE id = %s
        """, (inserted_entities, ingest_run_id))
    pg.commit()

    elapsed = time.time() - t0
    print(f"\n{'='*50}")
    print(f"Migration complete in {elapsed:.1f}s")
    print(f"  Entities:     {inserted_entities:,}")
    print(f"  Opportunities:{inserted_opps:,}")
    print(f"  Raw records:  {inserted_raw:,}")
    print(f"{'='*50}")

    sq.close()
    pg.close()


# ------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Migrate SQLite → PostgreSQL')
    ap.add_argument('--dry-run', action='store_true', help='Count rows only, make no changes')
    ap.add_argument('--batch-size', type=int, default=500)
    args = ap.parse_args()
    migrate(dry_run=args.dry_run, batch_size=args.batch_size)
