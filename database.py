from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "askmiro.db"

# ── Backend selection ──────────────────────────────────────────────────────────
# Set DATABASE_URL in .env (or Render env vars) to use Postgres.
# Leave unset to use local SQLite (default for development).
_DATABASE_URL = os.getenv("DATABASE_URL", "")
_USE_POSTGRES = bool(_DATABASE_URL)

if _USE_POSTGRES:
    try:
        from db_compat import pg_connection as _pg_conn
    except ImportError:
        _USE_POSTGRES = False


def _row_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


@contextmanager
def db_connection():
    """
    Universal DB connection.
    - DATABASE_URL set → Postgres (production / Render)
    - DATABASE_URL unset → SQLite (local development)
    API is identical either way: yields conn, returns dicts, auto-commits.
    """
    if _USE_POSTGRES:
        with _pg_conn() as conn:
            yield conn
    else:
        DATA_DIR.mkdir(exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = _row_factory
        try:
            yield conn
        finally:
            conn.close()


def _add_column_if_missing(conn, table, column, definition):
    if _USE_POSTGRES:
        rows = conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = %s AND column_name = %s",
            (table, column),
        ).fetchall()
        cols = [r['column_name'] for r in rows]
    else:
        cols = [r['name'] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    DATA_DIR.mkdir(exist_ok=True)

    with db_connection() as conn:
        # ── Postgres with normalized schema: skip flat-table creation ─────
        if _USE_POSTGRES:
            _create_pg_schema(conn)
            conn.commit()
            # Ensure uploads directory exists
            uploads_dir = Path(__file__).parent / "uploads"
            uploads_dir.mkdir(exist_ok=True)
            return

        # ── SQLite path: create all flat tables ───────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS raw_leads (
                place_id TEXT,
                name TEXT,
                primary_type TEXT,
                search_term TEXT,
                borough TEXT,
                address TEXT,
                phone TEXT,
                website TEXT,
                google_maps_url TEXT,
                rating REAL,
                user_rating_count REAL,
                business_status TEXT,
                latitude REAL,
                longitude REAL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS lead_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                place_id TEXT UNIQUE,
                business_name TEXT,
                raw_sector TEXT,
                normalized_sector TEXT,
                borough TEXT,
                address TEXT,
                postcode TEXT,
                latitude REAL,
                longitude REAL,
                website TEXT,
                phone TEXT,
                rating REAL,
                review_count INTEGER,
                google_maps_url TEXT,
                source_query TEXT,
                source_system TEXT,
                date_collected TEXT,
                has_phone INTEGER DEFAULT 0,
                has_website INTEGER DEFAULT 0,
                postcode_extracted INTEGER DEFAULT 0,
                ai_business_type TEXT,
                ai_sub_sector TEXT,
                ai_decision_maker_type TEXT,
                ai_is_cleaning_target INTEGER,
                ai_classification_note TEXT,
                priority_score INTEGER DEFAULT 0,
                score_reason TEXT,
                high_value_target INTEGER DEFAULT 0,
                likely_multi_site INTEGER DEFAULT 0,
                next_best_action TEXT,
                website_summary TEXT,
                website_business_type TEXT,
                website_pain_points TEXT,
                website_scraped_at TEXT,
                pipeline_status TEXT DEFAULT 'raw',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                buying_signal_score INTEGER DEFAULT 0,
                buying_signal_types TEXT,
                move_signal INTEGER DEFAULT 0,
                expansion_signal INTEGER DEFAULT 0,
                refurb_signal INTEGER DEFAULT 0,
                hiring_signal INTEGER DEFAULT 0,
                compliance_signal INTEGER DEFAULT 0,
                review_signal INTEGER DEFAULT 0,
                multi_site_signal INTEGER DEFAULT 0,
                trigger_summary TEXT,
                recommended_offer TEXT,
                recommended_channel TEXT,
                timing_urgency TEXT,
                likely_buyer_role TEXT
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS pipeline_leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                place_id TEXT UNIQUE,
                business_name TEXT,
                sector TEXT,
                borough TEXT,
                owner TEXT,
                status TEXT DEFAULT 'new',
                contact_date TEXT,
                contact_channel TEXT,
                outreach_message_id TEXT,
                reply_status TEXT,
                quote_status TEXT,
                last_activity TEXT,
                next_follow_up TEXT,
                notes TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS outreach_packages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                place_id TEXT UNIQUE,
                cold_email TEXT,
                call_opener TEXT,
                full_call_script TEXT,
                linkedin_intro TEXT,
                follow_up_email TEXT,
                site_visit_brief TEXT,
                generated_at TEXT DEFAULT (datetime('now')),
                model_used TEXT
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS contracts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                place_id TEXT,
                client_name TEXT,
                site_address TEXT,
                service_type TEXT,
                cleaning_frequency TEXT,
                contract_value_gbp REAL,
                contract_start_date TEXT,
                contract_end_date TEXT,
                assigned_team TEXT,
                service_notes TEXT,
                operations_notes TEXT,
                qa_schedule TEXT,
                account_status TEXT DEFAULT 'active',
                ai_handoff_summary TEXT,
                ai_first_clean_checklist TEXT,
                ai_risk_flags TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS scraper_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT,
                borough TEXT,
                sector TEXT,
                status TEXT DEFAULT 'pending',
                results_count INTEGER DEFAULT 0,
                error_msg TEXT,
                started_at TEXT,
                completed_at TEXT
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS activities (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                place_id        TEXT NOT NULL,
                activity_type   TEXT NOT NULL,
                channel         TEXT,
                summary         TEXT,
                outcome         TEXT,
                next_action     TEXT,
                logged_by       TEXT DEFAULT 'user',
                created_at      TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (place_id) REFERENCES lead_records(place_id)
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                place_id    TEXT NOT NULL,
                body        TEXT NOT NULL,
                created_at  TEXT DEFAULT (datetime('now')),
                updated_at  TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (place_id) REFERENCES lead_records(place_id)
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS uploaded_documents (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                filename            TEXT NOT NULL,
                original_filename   TEXT NOT NULL,
                file_path           TEXT NOT NULL,
                file_size_bytes     INTEGER,
                place_id            TEXT,
                doc_type            TEXT DEFAULT 'other',
                extracted_text      TEXT,
                extraction_status   TEXT DEFAULT 'pending',
                extraction_error    TEXT,
                parsed_contacts     TEXT,
                parsed_company      TEXT,
                parsed_address      TEXT,
                parsed_dates        TEXT,
                parsed_keywords     TEXT,
                parsed_value_clues  TEXT,
                upload_date         TEXT DEFAULT (datetime('now')),
                extracted_at        TEXT,
                FOREIGN KEY (place_id) REFERENCES lead_records(place_id)
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS email_campaigns (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                name            TEXT NOT NULL,
                template_type   TEXT DEFAULT 'cold_email',
                filter_sector   TEXT,
                filter_borough  TEXT,
                filter_min_score INTEGER DEFAULT 60,
                filter_stage    TEXT,
                lead_count      INTEGER DEFAULT 0,
                export_path     TEXT,
                status          TEXT DEFAULT 'draft',
                created_at      TEXT DEFAULT (datetime('now')),
                exported_at     TEXT,
                notes           TEXT
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS campaign_leads (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id     INTEGER NOT NULL,
                place_id        TEXT NOT NULL,
                included_at     TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id),
                FOREIGN KEY (place_id) REFERENCES lead_records(place_id)
            )
        """)

        # Extend lead_records with new columns
        _add_column_if_missing(conn, "lead_records", "archived_at", "TEXT")
        _add_column_if_missing(conn, "lead_records", "manual_score_override", "INTEGER")
        _add_column_if_missing(conn, "lead_records", "email", "TEXT")
        _add_column_if_missing(conn, "lead_records", "contact_name", "TEXT")
        _add_column_if_missing(conn, "lead_records", "outreach_status", "TEXT DEFAULT 'not_started'")
        _add_column_if_missing(conn, "lead_records", "last_email_sent", "TEXT")
        _add_column_if_missing(conn, "lead_records", "email_sent_count", "INTEGER DEFAULT 0")
        _add_column_if_missing(conn, "lead_records", "email_priority", "TEXT DEFAULT 'normal'")

        # Extend pipeline_leads with new columns
        _add_column_if_missing(conn, "pipeline_leads", "quote_value_gbp", "REAL")
        _add_column_if_missing(conn, "pipeline_leads", "quote_date", "TEXT")
        _add_column_if_missing(conn, "pipeline_leads", "win_date", "TEXT")
        _add_column_if_missing(conn, "pipeline_leads", "loss_reason", "TEXT")
        _add_column_if_missing(conn, "pipeline_leads", "loss_date", "TEXT")
        _add_column_if_missing(conn, "pipeline_leads", "stage_entered_at", "TEXT")
        _add_column_if_missing(conn, "pipeline_leads", "last_touched", "TEXT")
        _add_column_if_missing(conn, "pipeline_leads", "days_in_stage", "INTEGER")

        conn.commit()

        # Ensure uploads directory exists
        uploads_dir = Path(__file__).parent / "uploads"
        uploads_dir.mkdir(exist_ok=True)


def _create_pg_schema(conn):
    """Create Postgres views and auxiliary tables that api.py relies on.

    Detects whether the database uses the NORMALIZED schema (real tables:
    entities, signals, opportunities, addresses, etc.) or the FLAT schema
    (lead_records + pipeline_leads with views on top).

    - Normalized schema (production): creates lead_records / pipeline_leads
      as backward-compat VIEWS on the real tables.
    - Flat schema (legacy): creates entities / signals / etc. as VIEWS on
      lead_records / pipeline_leads.
    """
    # ── Detect schema type ────────────────────────────────────────────────
    _is_normalized = False
    _has_flat = False
    try:
        r = conn.execute("""
            SELECT table_type FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'entities'
        """).fetchone()
        if r and r.get('table_type', '') == 'BASE TABLE':
            _is_normalized = True
    except Exception:
        pass

    if not _is_normalized:
        try:
            r2 = conn.execute("""
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'lead_records'
            """).fetchone()
            if r2:
                _has_flat = True
        except Exception:
            pass

    # ── Fresh DB: no tables at all → bootstrap from pg_schema.sql ──────
    if not _is_normalized and not _has_flat:
        _schema_file = Path(__file__).parent / "pg_schema.sql"
        if _schema_file.exists():
            import logging
            logging.getLogger("database").info("Fresh DB detected — bootstrapping from pg_schema.sql")
            sql = _schema_file.read_text()
            # Use raw psycopg2 cursor to avoid _normalize_sql corrupting DDL
            raw_conn = conn._conn if hasattr(conn, '_conn') else conn
            raw_cur = raw_conn.cursor()
            raw_cur.execute(sql)
            raw_conn.commit()
            raw_cur.close()
            _is_normalized = True

    if _is_normalized:
        _create_normalized_compat(conn)
    elif _has_flat:
        _create_flat_compat(conn)

    # ── Shared: tables that exist in BOTH schemas (IF NOT EXISTS) ─────────
    _create_shared_tables(conn)

    # ── Shared: idempotent column additions ───────────────────────────────
    _add_shared_columns(conn)

    # ── Email deliverability guard tables ─────────────────────────────────
    try:
        from email_guard import ensure_tables, ensure_entity_validation_column
        ensure_tables(conn)
        ensure_entity_validation_column(conn)
    except Exception as exc:
        import logging
        logging.getLogger("database").warning("email_guard table init: %s", exc)

    # ── Operational tables (finance, cleaners, quality, payroll, SEO) ────
    try:
        conn.execute("SAVEPOINT ops_tables_sp")
        from ops_tables import ensure_ops_tables
        ensure_ops_tables(conn)
        conn.execute("RELEASE SAVEPOINT ops_tables_sp")
    except Exception as exc:
        conn.execute("ROLLBACK TO SAVEPOINT ops_tables_sp")
        import logging
        logging.getLogger("database").warning("ops_tables init (rolled back): %s", exc)


def _create_normalized_compat(conn):
    """Normalized DB detected. Create lead_records + pipeline_leads as VIEWS
    so that api.py queries referencing those names still work.
    Also create v_lead_board, v_pipeline_board, v_borough_summary.
    """
    # ── Drop ALL old views/tables first (CREATE OR REPLACE can't change columns) ─
    # lead_records/pipeline_leads may be real tables from a previous flat-schema deploy
    conn.execute("""
        DO $$ BEGIN
            -- Drop views that may have different column lists
            DROP VIEW IF EXISTS v_lead_board CASCADE;
            DROP VIEW IF EXISTS v_pipeline_board CASCADE;
            DROP VIEW IF EXISTS v_borough_summary CASCADE;

            -- lead_records may be a TABLE or a VIEW depending on deploy history
            IF EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_schema='public' AND table_name='lead_records' AND table_type='BASE TABLE') THEN
                DROP TABLE lead_records CASCADE;
            ELSE
                DROP VIEW IF EXISTS lead_records CASCADE;
            END IF;

            -- pipeline_leads may be a TABLE or a VIEW
            IF EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_schema='public' AND table_name='pipeline_leads' AND table_type='BASE TABLE') THEN
                DROP TABLE pipeline_leads CASCADE;
            ELSE
                DROP VIEW IF EXISTS pipeline_leads CASCADE;
            END IF;

        END $$
    """)
    conn.execute("""
        CREATE OR REPLACE VIEW lead_records AS
        SELECT
            e.id,
            esl.source_record_id            AS place_id,
            e.canonical_name                AS business_name,
            e.sector                        AS normalized_sector,
            e.sector                        AS raw_sector,
            e.sub_sector                    AS ai_sub_sector,
            a.borough,
            a.line1                         AS address,
            a.postcode,
            a.latitude,
            a.longitude,
            e.primary_website               AS website,
            e.primary_phone                 AS phone,
            e.primary_email                 AS email,
            NULL::TEXT                       AS contact_name,
            NULL::REAL                       AS rating,
            NULL::INTEGER                    AS review_count,
            esl.source_record_id            AS google_maps_url,
            'google_maps'                   AS source_system,
            e.created_at::TEXT              AS date_collected,
            os.total_score                  AS priority_score,
            os.total_score                  AS score_reason,
            CASE WHEN e.hvt THEN 1 ELSE 0 END AS high_value_target,
            0                               AS likely_multi_site,
            os.next_best_action,
            os.buyer_signal_score           AS buying_signal_score,
            NULL::TEXT                       AS buying_signal_types,
            CASE WHEN EXISTS(SELECT 1 FROM signals s WHERE s.entity_id=e.id AND s.signal_type::TEXT='move_signal' AND s.active) THEN 1 ELSE 0 END AS move_signal,
            CASE WHEN EXISTS(SELECT 1 FROM signals s WHERE s.entity_id=e.id AND s.signal_type::TEXT='expansion_signal' AND s.active) THEN 1 ELSE 0 END AS expansion_signal,
            CASE WHEN EXISTS(SELECT 1 FROM signals s WHERE s.entity_id=e.id AND s.signal_type::TEXT='refurb_signal' AND s.active) THEN 1 ELSE 0 END AS refurb_signal,
            CASE WHEN EXISTS(SELECT 1 FROM signals s WHERE s.entity_id=e.id AND s.signal_type::TEXT='hiring_signal' AND s.active) THEN 1 ELSE 0 END AS hiring_signal,
            CASE WHEN EXISTS(SELECT 1 FROM signals s WHERE s.entity_id=e.id AND s.signal_type::TEXT='compliance_signal' AND s.active) THEN 1 ELSE 0 END AS compliance_signal,
            CASE WHEN EXISTS(SELECT 1 FROM signals s WHERE s.entity_id=e.id AND s.signal_type::TEXT='review_signal' AND s.active) THEN 1 ELSE 0 END AS review_signal,
            CASE WHEN EXISTS(SELECT 1 FROM signals s WHERE s.entity_id=e.id AND s.signal_type::TEXT='multi_site_signal' AND s.active) THEN 1 ELSE 0 END AS multi_site_signal,
            NULL::TEXT                       AS trigger_summary,
            NULL::TEXT                       AS recommended_offer,
            NULL::TEXT                       AS recommended_channel,
            NULL::TEXT                       AS timing_urgency,
            NULL::TEXT                       AS likely_buyer_role,
            NULL::TEXT                       AS outreach_status,
            NULL::TEXT                       AS last_email_sent,
            0                               AS email_sent_count,
            'normal'                        AS email_priority,
            e.archived_at::TEXT             AS archived_at,
            COALESCE(o.current_stage::TEXT, 'raw') AS pipeline_status,
            e.created_at::TEXT              AS created_at,
            e.updated_at::TEXT              AS updated_at,
            e.sector                        AS ai_business_type,
            NULL::TEXT                       AS ai_decision_maker_type,
            CASE WHEN e.hvt THEN 1 ELSE 0 END AS ai_is_cleaning_target,
            1                               AS has_phone,
            1                               AS has_website,
            1                               AS postcode_extracted,
            NULL::TEXT                       AS website_summary,
            NULL::TEXT                       AS website_business_type,
            NULL::TEXT                       AS website_pain_points,
            NULL::TEXT                       AS website_scraped_at,
            NULL::TEXT                       AS source_query,
            NULL::TEXT                       AS ai_classification_note,
            NULL::INTEGER                    AS manual_score_override
        FROM entities e
        LEFT JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
        LEFT JOIN addresses a ON a.id = el.address_id
        LEFT JOIN opportunity_scores os ON os.entity_id = e.id
        LEFT JOIN LATERAL (SELECT source_record_id FROM entity_source_links WHERE entity_id = e.id AND source::TEXT = 'google_maps' LIMIT 1) esl ON TRUE
        LEFT JOIN opportunities o ON o.entity_id = e.id
    """)

    # ── pipeline_leads compatibility view ─────────────────────────────────
    conn.execute("""
        CREATE OR REPLACE VIEW pipeline_leads AS
        SELECT
            o.id,
            esl.source_record_id        AS place_id,
            e.canonical_name            AS business_name,
            e.sector,
            a.borough,
            o.owner,
            o.current_stage::TEXT       AS status,
            NULL::TEXT                   AS contact_date,
            NULL::TEXT                   AS contact_channel,
            NULL::TEXT                   AS outreach_message_id,
            NULL::TEXT                   AS reply_status,
            NULL::TEXT                   AS quote_status,
            o.last_touched_at::TEXT     AS last_activity,
            o.next_followup_at::TEXT    AS next_follow_up,
            o.notes,
            o.created_at::TEXT          AS created_at,
            o.updated_at::TEXT          AS updated_at,
            q.value_gbp                 AS quote_value_gbp,
            NULL::TEXT                   AS quote_date,
            NULL::TEXT                   AS win_date,
            o.loss_reason,
            NULL::TEXT                   AS loss_date,
            NULL::TEXT                   AS stage_entered_at,
            o.last_touched_at::TEXT     AS last_touched,
            NULL::INTEGER               AS days_in_stage
        FROM opportunities o
        JOIN entities e ON e.id = o.entity_id
        LEFT JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
        LEFT JOIN addresses a ON a.id = el.address_id
        LEFT JOIN LATERAL (SELECT source_record_id FROM entity_source_links WHERE entity_id = e.id AND source::TEXT = 'google_maps' LIMIT 1) esl ON TRUE
        LEFT JOIN LATERAL (SELECT quote_value_gbp AS value_gbp FROM quotes WHERE opportunity_id = o.id ORDER BY created_at DESC LIMIT 1) q ON TRUE
    """)

    # ── v_lead_board ──────────────────────────────────────────────────────
    conn.execute("""
        CREATE OR REPLACE VIEW v_lead_board AS
        SELECT
            e.id                           AS entity_id,
            esl.source_record_id           AS place_id,
            e.canonical_name               AS business_name,
            e.canonical_name               AS canonical_name,
            e.sector,
            e.sub_sector,
            a.borough,
            a.line1,
            a.postcode,
            a.latitude,
            a.longitude,
            e.primary_phone,
            e.primary_website,
            e.primary_email,
            NULL::TEXT                      AS contact_name,
            NULL::REAL                      AS rating,
            NULL::INTEGER                   AS review_count,
            os.total_score,
            os.score_band,
            os.buyer_signal_score,
            e.hvt,
            e.active,
            COALESCE(o.current_stage::TEXT, 'raw') AS current_stage,
            e.sector                       AS ai_business_type,
            NULL::TEXT                      AS ai_decision_maker_type,
            os.next_best_action,
            e.created_at::TEXT             AS date_collected,
            e.archived_at,
            NULL::TEXT                      AS outreach_status,
            NULL::TEXT                      AS last_email_sent,
            0                              AS email_sent_count,
            'normal'                       AS email_priority,
            0                              AS move_signal,
            0                              AS expansion_signal,
            0                              AS refurb_signal,
            0                              AS hiring_signal,
            0                              AS compliance_signal,
            0                              AS review_signal,
            0                              AS multi_site_signal,
            o.id                           AS opportunity_id,
            o.current_stage::TEXT          AS opp_stage,
            q.value_gbp                    AS quote_value_gbp,
            o.next_followup_at             AS next_followup_at,
            o.last_touched_at              AS last_touched_at,
            o.owner
        FROM entities e
        LEFT JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
        LEFT JOIN addresses a ON a.id = el.address_id
        LEFT JOIN opportunity_scores os ON os.entity_id = e.id
        LEFT JOIN LATERAL (SELECT source_record_id FROM entity_source_links WHERE entity_id = e.id AND source::TEXT = 'google_maps' LIMIT 1) esl ON TRUE
        LEFT JOIN opportunities o ON o.entity_id = e.id
        LEFT JOIN LATERAL (SELECT quote_value_gbp AS value_gbp FROM quotes WHERE opportunity_id = o.id ORDER BY created_at DESC LIMIT 1) q ON TRUE
    """)

    # ── v_pipeline_board ──────────────────────────────────────────────────
    conn.execute("""
        CREATE OR REPLACE VIEW v_pipeline_board AS
        SELECT
            o.id                           AS opportunity_id,
            o.id,
            esl.source_record_id           AS place_id,
            e.id                           AS entity_id,
            e.canonical_name,
            e.canonical_name               AS business_name,
            e.sector,
            e.sector                       AS normalized_sector,
            a.borough,
            o.current_stage::TEXT          AS current_stage,
            q.value_gbp                    AS quote_value_gbp,
            o.next_followup_at             AS next_followup_at,
            o.last_touched_at              AS last_touched_at,
            o.owner,
            o.loss_reason,
            o.created_at,
            o.updated_at,
            COALESCE(os.total_score, 0)    AS total_score,
            e.primary_phone                AS phone,
            e.primary_phone                AS primary_phone,
            e.primary_website              AS website,
            e.primary_website              AS primary_website,
            e.primary_email,
            a.line1,
            'normal'                       AS email_priority
        FROM opportunities o
        JOIN entities e ON e.id = o.entity_id
        LEFT JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
        LEFT JOIN addresses a ON a.id = el.address_id
        LEFT JOIN opportunity_scores os ON os.entity_id = e.id
        LEFT JOIN LATERAL (SELECT source_record_id FROM entity_source_links WHERE entity_id = e.id AND source::TEXT = 'google_maps' LIMIT 1) esl ON TRUE
        LEFT JOIN LATERAL (SELECT quote_value_gbp AS value_gbp FROM quotes WHERE opportunity_id = o.id ORDER BY created_at DESC LIMIT 1) q ON TRUE
    """)

    # ── v_borough_summary ─────────────────────────────────────────────────
    conn.execute("""
        CREATE OR REPLACE VIEW v_borough_summary AS
        SELECT
            a.borough,
            COUNT(*) AS count,
            ROUND(AVG(os.total_score)::NUMERIC, 1) AS avg_score,
            SUM(CASE WHEN e.hvt THEN 1 ELSE 0 END) AS hvt_count
        FROM entities e
        JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
        JOIN addresses a ON a.id = el.address_id
        LEFT JOIN opportunity_scores os ON os.entity_id = e.id
        WHERE a.borough IS NOT NULL AND a.borough != '' AND e.active = TRUE
        GROUP BY a.borough
        ORDER BY count DESC
    """)


def _create_flat_compat(conn):
    """Flat DB detected (lead_records + pipeline_leads).
    Create entities / signals / etc. as VIEWS on the flat tables.
    """
    # ── Ensure all columns referenced by views exist BEFORE view creation ─
    conn.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='lead_records' AND column_name='outreach_status') THEN
                ALTER TABLE lead_records ADD COLUMN outreach_status TEXT DEFAULT 'not_started';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='lead_records' AND column_name='last_email_sent') THEN
                ALTER TABLE lead_records ADD COLUMN last_email_sent TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='lead_records' AND column_name='email_sent_count') THEN
                ALTER TABLE lead_records ADD COLUMN email_sent_count INTEGER DEFAULT 0;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='lead_records' AND column_name='email_priority') THEN
                ALTER TABLE lead_records ADD COLUMN email_priority TEXT DEFAULT 'normal';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='lead_records' AND column_name='email') THEN
                ALTER TABLE lead_records ADD COLUMN email TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='lead_records' AND column_name='contact_name') THEN
                ALTER TABLE lead_records ADD COLUMN contact_name TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='lead_records' AND column_name='archived_at') THEN
                ALTER TABLE lead_records ADD COLUMN archived_at TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='pipeline_leads' AND column_name='quote_value_gbp') THEN
                ALTER TABLE pipeline_leads ADD COLUMN quote_value_gbp REAL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='pipeline_leads' AND column_name='next_follow_up') THEN
                ALTER TABLE pipeline_leads ADD COLUMN next_follow_up TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='pipeline_leads' AND column_name='last_touched') THEN
                ALTER TABLE pipeline_leads ADD COLUMN last_touched TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='pipeline_leads' AND column_name='loss_reason') THEN
                ALTER TABLE pipeline_leads ADD COLUMN loss_reason TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='pipeline_leads' AND column_name='days_in_stage') THEN
                ALTER TABLE pipeline_leads ADD COLUMN days_in_stage INTEGER;
            END IF;
        END $$
    """)

    # ── v_lead_board ──────────────────────────────────────────────────────
    conn.execute("""
        CREATE OR REPLACE VIEW v_lead_board AS
        SELECT
            lr.id AS entity_id, lr.place_id, lr.business_name,
            lr.business_name AS canonical_name, lr.normalized_sector AS sector,
            lr.ai_sub_sector AS sub_sector, lr.borough, lr.address AS line1,
            lr.postcode, lr.latitude, lr.longitude,
            lr.phone AS primary_phone, lr.website AS primary_website,
            lr.email AS primary_email, lr.contact_name,
            lr.rating, lr.review_count,
            lr.priority_score AS total_score,
            CASE WHEN lr.priority_score >= 80 THEN 'A' WHEN lr.priority_score >= 65 THEN 'B'
                 WHEN lr.priority_score >= 50 THEN 'C' ELSE 'D' END AS score_band,
            lr.buying_signal_score AS buyer_signal_score,
            (lr.high_value_target = 1) AS hvt, (lr.archived_at IS NULL) AS active,
            lr.pipeline_status AS current_stage, lr.ai_business_type,
            lr.ai_decision_maker_type, lr.next_best_action, lr.date_collected,
            lr.archived_at, lr.outreach_status, lr.last_email_sent,
            lr.email_sent_count, lr.email_priority,
            lr.move_signal, lr.expansion_signal, lr.refurb_signal,
            lr.hiring_signal, lr.compliance_signal, lr.review_signal, lr.multi_site_signal,
            pl.id AS opportunity_id, pl.status AS opp_stage, pl.quote_value_gbp,
            pl.next_follow_up AS next_followup_at, pl.last_touched AS last_touched_at, pl.owner
        FROM lead_records lr
        LEFT JOIN pipeline_leads pl ON pl.place_id = lr.place_id
    """)

    # ── v_pipeline_board ──────────────────────────────────────────────────
    conn.execute("""
        CREATE OR REPLACE VIEW v_pipeline_board AS
        SELECT
            pl.id AS opportunity_id, pl.id, pl.place_id, lr.id AS entity_id,
            pl.business_name AS canonical_name, pl.business_name,
            pl.sector, COALESCE(lr.normalized_sector, pl.sector) AS normalized_sector,
            pl.borough, pl.status AS current_stage, pl.quote_value_gbp,
            pl.next_follow_up AS next_followup_at, pl.last_touched AS last_touched_at,
            pl.owner, pl.loss_reason, pl.created_at, pl.updated_at,
            COALESCE(lr.priority_score, 0) AS total_score,
            lr.phone AS phone, lr.phone AS primary_phone,
            lr.website AS website, lr.website AS primary_website,
            lr.email AS primary_email, lr.address AS line1, lr.email_priority
        FROM pipeline_leads pl
        LEFT JOIN lead_records lr ON lr.place_id = pl.place_id
    """)

    # ── entities view ─────────────────────────────────────────────────────
    conn.execute("""
        CREATE OR REPLACE VIEW entities AS
        SELECT id, id AS entity_id, 'facility' AS entity_kind,
            business_name AS canonical_name, LOWER(TRIM(business_name)) AS normalized_name,
            normalized_sector AS sector, ai_sub_sector AS sub_sector,
            website AS primary_website, phone AS primary_phone, email AS primary_email,
            (high_value_target = 1) AS hvt, (archived_at IS NULL) AS active, archived_at,
            date_collected AS created_at, COALESCE(updated_at, date_collected) AS updated_at
        FROM lead_records
    """)

    conn.execute("""
        CREATE OR REPLACE VIEW addresses AS
        SELECT id, address AS line1, borough, postcode, latitude, longitude
        FROM lead_records WHERE address IS NOT NULL
    """)

    conn.execute("""
        CREATE OR REPLACE VIEW opportunity_scores AS
        SELECT id AS entity_id, priority_score AS total_score, priority_score AS fit_score,
            buying_signal_score AS buyer_signal_score,
            CASE WHEN priority_score >= 80 THEN 'A' WHEN priority_score >= 65 THEN 'B'
                 WHEN priority_score >= 50 THEN 'C' ELSE 'D' END AS score_band,
            next_best_action, 1500 AS estimated_monthly_value_gbp,
            18000 AS estimated_contract_value_gbp, NULL::INTEGER AS value_confidence
        FROM lead_records
    """)

    conn.execute("""
        CREATE OR REPLACE VIEW opportunities AS
        SELECT pl.id, lr.id AS entity_id, pl.place_id AS entity_place_id,
            CONCAT('Commercial cleaning — ', pl.business_name) AS title,
            pl.status AS current_stage, pl.owner,
            pl.next_follow_up AS next_followup_at, pl.last_touched AS last_touched_at,
            pl.loss_reason, pl.created_at, pl.updated_at
        FROM pipeline_leads pl LEFT JOIN lead_records lr ON lr.place_id = pl.place_id
    """)

    conn.execute("""
        CREATE OR REPLACE VIEW signals AS
        SELECT id*7+1 AS id, id AS entity_id, place_id, 'move_signal' AS signal_type, 80 AS strength, NULL::TEXT AS evidence, 'google_maps' AS source, date_collected AS detected_at, TRUE AS active, NULL::BOOLEAN AS planning_relevant, NULL::INTEGER AS planning_relevance_score FROM lead_records WHERE move_signal = 1
        UNION ALL SELECT id*7+2,id,place_id,'expansion_signal',75,NULL::TEXT,'google_maps',date_collected,TRUE,NULL::BOOLEAN,NULL::INTEGER FROM lead_records WHERE expansion_signal=1
        UNION ALL SELECT id*7+3,id,place_id,'refurb_signal',70,NULL::TEXT,'google_maps',date_collected,TRUE,NULL::BOOLEAN,NULL::INTEGER FROM lead_records WHERE refurb_signal=1
        UNION ALL SELECT id*7+4,id,place_id,'hiring_signal',65,NULL::TEXT,'google_maps',date_collected,TRUE,NULL::BOOLEAN,NULL::INTEGER FROM lead_records WHERE hiring_signal=1
        UNION ALL SELECT id*7+5,id,place_id,'compliance_signal',60,NULL::TEXT,'google_maps',date_collected,TRUE,NULL::BOOLEAN,NULL::INTEGER FROM lead_records WHERE compliance_signal=1
        UNION ALL SELECT id*7+6,id,place_id,'review_signal',40,NULL::TEXT,'google_maps',date_collected,TRUE,NULL::BOOLEAN,NULL::INTEGER FROM lead_records WHERE review_signal=1
        UNION ALL SELECT id*7+7,id,place_id,'multi_site_signal',85,NULL::TEXT,'google_maps',date_collected,TRUE,NULL::BOOLEAN,NULL::INTEGER FROM lead_records WHERE multi_site_signal=1
    """)

    conn.execute("""
        CREATE OR REPLACE VIEW entity_locations AS
        SELECT id, id AS entity_id, id AS address_id, TRUE AS is_primary FROM lead_records
    """)

    conn.execute("""
        CREATE OR REPLACE VIEW entity_source_links AS
        SELECT id AS entity_id, 'google_maps' AS source, place_id AS source_record_id, 100 AS confidence
        FROM lead_records WHERE place_id IS NOT NULL
    """)

    conn.execute("""
        CREATE OR REPLACE VIEW v_borough_summary AS
        SELECT borough, COUNT(*) AS count, ROUND(AVG(priority_score)::NUMERIC,1) AS avg_score,
            SUM(CASE WHEN high_value_target=1 THEN 1 ELSE 0 END) AS hvt_count
        FROM lead_records WHERE borough IS NOT NULL AND borough!='' AND archived_at IS NULL
        GROUP BY borough ORDER BY count DESC
    """)


def _create_shared_tables(conn):
    """Create auxiliary tables needed by both schema variants (IF NOT EXISTS)."""

    # ── activity_type ENUM ────────────────────────────────────────────────
    conn.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
                CREATE TYPE activity_type AS ENUM (
                    'call','email','note','visit','linkedin','stage_changed','meeting','other'
                );
            END IF;
        END $$
    """)

    for ddl in [
        """CREATE TABLE IF NOT EXISTS daily_tasks (
            id SERIAL PRIMARY KEY, entity_id INTEGER, place_id TEXT,
            task_type TEXT DEFAULT 'call', priority TEXT DEFAULT 'medium',
            title TEXT, description TEXT, status TEXT DEFAULT 'pending',
            outcome TEXT, notes TEXT, due_date DATE DEFAULT CURRENT_DATE,
            snoozed_until DATE, created_at TIMESTAMP DEFAULT NOW(), completed_at TIMESTAMP)""",
        """CREATE TABLE IF NOT EXISTS opportunity_stage_history (
            id SERIAL PRIMARY KEY, opportunity_id INTEGER, from_stage TEXT,
            to_stage TEXT NOT NULL, actor TEXT DEFAULT 'user', changed_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS activity_log (
            id SERIAL PRIMARY KEY, opportunity_id INTEGER, entity_id INTEGER,
            activity_type TEXT NOT NULL, actor TEXT DEFAULT 'user', subject TEXT,
            body TEXT, details JSONB, logged_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS ingest_runs (
            id SERIAL PRIMARY KEY, source TEXT NOT NULL, started_at TIMESTAMP DEFAULT NOW(),
            finished_at TIMESTAMP, record_count INTEGER DEFAULT 0, notes TEXT)""",
        """CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY, entity_id INTEGER, full_name TEXT, job_title TEXT,
            role_category TEXT, phone TEXT, email TEXT, source TEXT DEFAULT 'manual',
            confidence INTEGER DEFAULT 80, created_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS renewal_predictions (
            id SERIAL PRIMARY KEY, entity_id INTEGER UNIQUE, estimated_renewal DATE,
            confidence INTEGER, rationale TEXT, days_until_renewal INTEGER,
            call_now_flag BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS planning_relevance (
            id SERIAL PRIMARY KEY, signal_id INTEGER UNIQUE, score INTEGER,
            rationale TEXT, created_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS outreach_activities (
            id SERIAL PRIMARY KEY, entity_id INTEGER, opportunity_id INTEGER,
            activity_type TEXT DEFAULT 'call', channel TEXT, actor TEXT DEFAULT 'user',
            subject TEXT, body TEXT, outcome TEXT, logged_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS outreach_sequences (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL, signal_type TEXT DEFAULT 'default',
            total_steps INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS outreach_steps (
            id SERIAL PRIMARY KEY, sequence_id INTEGER, step_number INTEGER NOT NULL,
            channel TEXT DEFAULT 'call', day_offset INTEGER DEFAULT 0,
            objective TEXT, action_template TEXT)""",
        """CREATE TABLE IF NOT EXISTS entity_sequences (
            id SERIAL PRIMARY KEY, entity_id INTEGER NOT NULL, sequence_id INTEGER,
            current_step INTEGER DEFAULT 1, status TEXT DEFAULT 'active',
            next_action_due TIMESTAMP, started_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS generated_scripts (
            id SERIAL PRIMARY KEY, entity_id INTEGER UNIQUE, signal_id INTEGER,
            signal_type TEXT DEFAULT 'default', opener TEXT, reason_for_call TEXT,
            pain_hook TEXT, credibility TEXT, qualifying_q TEXT, objection_resp TEXT,
            next_step_ask TEXT, contact_ask TEXT, full_script TEXT,
            model TEXT DEFAULT 'template', tokens_used INTEGER DEFAULT 0,
            input_hash TEXT, is_stale BOOLEAN DEFAULT FALSE,
            generated_at TIMESTAMP DEFAULT NOW(), regenerated_at TIMESTAMP)""",
        """CREATE TABLE IF NOT EXISTS council_supply_lists (
            id SERIAL PRIMARY KEY, entity_id INTEGER, council_name TEXT,
            contract_title TEXT, contract_ref TEXT, service_category TEXT,
            start_date DATE, end_date DATE, annual_value_gbp INTEGER,
            source TEXT DEFAULT 'manual', created_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS quotes (
            id SERIAL PRIMARY KEY, opportunity_id INTEGER, value_gbp REAL,
            description TEXT, valid_until DATE,
            created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS outreach_packages (
            id SERIAL PRIMARY KEY,
            entity_id INTEGER,
            place_id TEXT UNIQUE,
            cold_email TEXT,
            call_opener TEXT,
            full_call_script TEXT,
            linkedin_intro TEXT,
            follow_up_email TEXT,
            site_visit_brief TEXT,
            generated_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            model_used TEXT)""",
    ]:
        try:
            conn.execute(ddl)
        except Exception:
            pass  # table already exists with different schema — fine


def _add_shared_columns(conn):
    """Idempotent column additions for tables in both schemas."""
    conn.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='contacts' AND column_name='is_primary') THEN
                ALTER TABLE contacts ADD COLUMN is_primary BOOLEAN DEFAULT FALSE;
                ALTER TABLE contacts ADD COLUMN is_decision_maker BOOLEAN DEFAULT FALSE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='activity_log' AND column_name='occurred_at') THEN
                ALTER TABLE activity_log ADD COLUMN occurred_at TIMESTAMP DEFAULT NOW();
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='daily_tasks' AND column_name='entity_sequence_id') THEN
                ALTER TABLE daily_tasks ADD COLUMN entity_sequence_id INTEGER;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='daily_tasks' AND column_name='reason') THEN
                ALTER TABLE daily_tasks ADD COLUMN reason TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='daily_tasks' AND column_name='task_date') THEN
                ALTER TABLE daily_tasks ADD COLUMN task_date DATE DEFAULT CURRENT_DATE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='renewal_predictions' AND column_name='evidence_source') THEN
                ALTER TABLE renewal_predictions ADD COLUMN evidence_source TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='renewal_predictions' AND column_name='predicted_at') THEN
                ALTER TABLE renewal_predictions ADD COLUMN predicted_at TIMESTAMP DEFAULT NOW();
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='outreach_activities' AND column_name='entity_sequence_id') THEN
                ALTER TABLE outreach_activities ADD COLUMN entity_sequence_id INTEGER;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='outreach_activities' AND column_name='notes') THEN
                ALTER TABLE outreach_activities ADD COLUMN notes TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='outreach_activities' AND column_name='contacted_name') THEN
                ALTER TABLE outreach_activities ADD COLUMN contacted_name TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='outreach_activities' AND column_name='next_followup_at') THEN
                ALTER TABLE outreach_activities ADD COLUMN next_followup_at TIMESTAMP;
            END IF;
            -- Ensure outreach_packages has entity_id + updated_at (may pre-date schema)
            IF EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_name='outreach_packages') THEN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='outreach_packages' AND column_name='entity_id') THEN
                    ALTER TABLE outreach_packages ADD COLUMN entity_id INTEGER;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='outreach_packages' AND column_name='updated_at') THEN
                    ALTER TABLE outreach_packages ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
                END IF;
            END IF;
        END $$
    """)

    # ── council_supply_lists table (stub — used by /api/boroughs endpoints) ─
    conn.execute("""
        CREATE TABLE IF NOT EXISTS council_supply_lists (
            id              SERIAL PRIMARY KEY,
            entity_id       INTEGER,
            borough         TEXT,
            company_type    TEXT,
            contract_access TEXT,
            priority_score  INTEGER DEFAULT 0,
            priority_reason TEXT,
            pipeline_target BOOLEAN DEFAULT FALSE,
            list_source     TEXT,
            council_name    TEXT,
            contract_title  TEXT,
            contract_value  NUMERIC,
            comp_strength   TEXT,
            comp_weakness   TEXT,
            comp_beat       TEXT,
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)

    # ── quotes table (stub — used by /api/analytics/revenue) ─────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS quotes (
            id              SERIAL PRIMARY KEY,
            opportunity_id  INTEGER,
            entity_id       INTEGER,
            quote_value_gbp NUMERIC,
            status          TEXT DEFAULT 'draft',
            created_at      TIMESTAMP DEFAULT NOW(),
            sent_at         TIMESTAMP,
            accepted_at     TIMESTAMP
        )
    """)


def get_all_raw_leads(limit: Optional[int] = None):
    """Return all raw_leads regardless of whether they've been cleaned already."""
    sql = "SELECT * FROM raw_leads"
    params = []
    if limit:
        sql += " LIMIT ?"
        params.append(limit)
    with db_connection() as conn:
        return conn.execute(sql, params).fetchall()


def get_uncleaned_raw_leads(limit: Optional[int] = None):
    sql = """
        SELECT r.*
        FROM raw_leads r
        LEFT JOIN lead_records l
          ON l.place_id = r.place_id
        WHERE l.place_id IS NULL
    """
    params = []

    if limit:
        sql += " LIMIT ?"
        params.append(limit)

    with db_connection() as conn:
        cur = conn.execute(sql, params)
        return cur.fetchall()


def get_leads_for_signal_detection(limit: int = 500, force: bool = False):
    """Return lead_records for buying signal processing."""
    with db_connection() as conn:
        if force:
            sql = "SELECT * FROM lead_records ORDER BY id ASC LIMIT ?"
        else:
            sql = "SELECT * FROM lead_records WHERE buying_signal_score = 0 ORDER BY id ASC LIMIT ?"
        return conn.execute(sql, (limit,)).fetchall()


def update_buying_signals(place_id: str, payload: dict):
    """Persist buying signal detection results back to lead_records."""
    with db_connection() as conn:
        conn.execute("""
            UPDATE lead_records SET
                buying_signal_score  = ?,
                buying_signal_types  = ?,
                move_signal          = ?,
                expansion_signal     = ?,
                refurb_signal        = ?,
                hiring_signal        = ?,
                compliance_signal    = ?,
                review_signal        = ?,
                multi_site_signal    = ?,
                trigger_summary      = ?,
                recommended_offer    = ?,
                recommended_channel  = ?,
                timing_urgency       = ?,
                likely_buyer_role    = ?,
                updated_at           = datetime('now')
            WHERE place_id = ?
        """, (
            payload.get("buying_signal_score", 0),
            payload.get("buying_signal_types", ""),
            int(bool(payload.get("move_signal"))),
            int(bool(payload.get("expansion_signal"))),
            int(bool(payload.get("refurb_signal"))),
            int(bool(payload.get("hiring_signal"))),
            int(bool(payload.get("compliance_signal"))),
            int(bool(payload.get("review_signal"))),
            int(bool(payload.get("multi_site_signal"))),
            payload.get("trigger_summary", ""),
            payload.get("recommended_offer", ""),
            payload.get("recommended_channel", ""),
            payload.get("timing_urgency", "low"),
            payload.get("likely_buyer_role", ""),
            place_id,
        ))
        conn.commit()


def update_website_intelligence(
    place_id: str,
    summary: str,
    biz_type: str,
    pain_points: str,
):
    """Write website analysis results back to lead_records."""
    with db_connection() as conn:
        conn.execute("""
            UPDATE lead_records SET
                website_summary     = ?,
                website_business_type = ?,
                website_pain_points = ?,
                updated_at          = datetime('now')
            WHERE place_id = ?
        """, (summary, biz_type, pain_points, place_id))
        conn.commit()


def update_ai_classification(
    place_id: str,
    business_type: str,
    sub_sector: str,
    dm_type: str,
    is_target: bool,
    note: str,
):
    """Write AI classification results back to lead_records.
    Also promotes normalized_sector from ai_sub_sector when the AI
    resolves a previously-unclassified 'other' lead."""
    with db_connection() as conn:
        conn.execute("""
            UPDATE lead_records SET
                ai_business_type        = ?,
                ai_sub_sector           = ?,
                ai_decision_maker_type  = ?,
                ai_is_cleaning_target   = ?,
                ai_classification_note  = ?,
                normalized_sector       = CASE
                    WHEN normalized_sector = 'other' AND ? NOT IN ('other', '', 'unknown')
                    THEN ?
                    ELSE normalized_sector
                END,
                updated_at              = datetime('now')
            WHERE place_id = ?
        """, (
            business_type,
            sub_sector,
            dm_type,
            int(bool(is_target)),
            note,
            sub_sector,   # for CASE comparison
            sub_sector,   # for CASE result
            place_id,
        ))
        conn.commit()


def get_leads_for_scoring(limit: int = 1000):
    with db_connection() as conn:
        cur = conn.execute("""
            SELECT *
            FROM lead_records
            ORDER BY id ASC
            LIMIT ?
        """, (limit,))
        return cur.fetchall()


def get_top_leads(limit: int = 100, min_score: int = 20):
    with db_connection() as conn:
        cur = conn.execute("""
            SELECT *
            FROM lead_records
            WHERE priority_score >= ?
            ORDER BY priority_score DESC, review_count DESC
            LIMIT ?
        """, (min_score, limit))
        return cur.fetchall()


def get_lead_by_place_id(place_id: str):
    with db_connection() as conn:
        cur = conn.execute(
            "SELECT * FROM lead_records WHERE place_id = ?",
            (place_id,),
        )
        return cur.fetchone()


def get_pipeline_leads(status: Optional[str] = None):
    with db_connection() as conn:
        if status:
            cur = conn.execute(
                "SELECT * FROM pipeline_leads WHERE status = ? ORDER BY updated_at DESC",
                (status,),
            )
        else:
            cur = conn.execute(
                "SELECT * FROM pipeline_leads ORDER BY updated_at DESC"
            )
        return cur.fetchall()


def get_overdue_followups():
    with db_connection() as conn:
        cur = conn.execute("""
            SELECT *
            FROM pipeline_leads
            WHERE next_follow_up IS NOT NULL
              AND next_follow_up <= date('now')
            ORDER BY next_follow_up ASC
        """)
        return cur.fetchall()


def add_to_pipeline(place_id, business_name=None, sector=None, borough=None,
                    owner=None, status="new", next_follow_up=None):
    if business_name is None and hasattr(place_id, "place_id"):
        lead = place_id
        place_id = lead.place_id
        business_name = lead.business_name
        sector = lead.sector
        borough = lead.borough
        owner = getattr(lead, "owner", owner)
        status = getattr(lead, "status", status)
        next_follow_up = getattr(lead, "next_follow_up", next_follow_up)

    with db_connection() as conn:
        conn.execute("""
            INSERT OR IGNORE INTO pipeline_leads
            (place_id, business_name, sector, borough, owner, status, next_follow_up)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            place_id,
            business_name,
            sector,
            borough,
            owner,
            status,
            next_follow_up.isoformat() if hasattr(next_follow_up, "isoformat") else next_follow_up,
        ))
        conn.commit()


def update_pipeline_status(place_id: str, new_status: str):
    with db_connection() as conn:
        conn.execute("""
            UPDATE pipeline_leads
            SET status = ?, updated_at = datetime('now')
            WHERE place_id = ?
        """, (new_status, place_id))

        conn.execute("""
            UPDATE lead_records
            SET pipeline_status = ?, updated_at = datetime('now')
            WHERE place_id = ?
        """, (new_status, place_id))

        conn.commit()


def save_outreach(place_id=None, cold_email=None, call_opener=None,
                  full_call_script=None, linkedin_intro=None, follow_up_email=None,
                  site_visit_brief=None, model_used=None, generated_at=None):
    if place_id is not None and not isinstance(place_id, str):
        pkg = place_id
        if isinstance(pkg, dict):
            place_id = pkg.get("place_id")
            cold_email = pkg.get("cold_email")
            call_opener = pkg.get("call_opener")
            full_call_script = pkg.get("full_call_script")
            linkedin_intro = pkg.get("linkedin_intro")
            follow_up_email = pkg.get("follow_up_email")
            site_visit_brief = pkg.get("site_visit_brief")
            model_used = pkg.get("model_used")
            generated_at = pkg.get("generated_at")
        else:
            place_id = getattr(pkg, "place_id", None)
            cold_email = getattr(pkg, "cold_email", None)
            call_opener = getattr(pkg, "call_opener", None)
            full_call_script = getattr(pkg, "full_call_script", None)
            linkedin_intro = getattr(pkg, "linkedin_intro", None)
            follow_up_email = getattr(pkg, "follow_up_email", None)
            site_visit_brief = getattr(pkg, "site_visit_brief", None)
            model_used = getattr(pkg, "model_used", None)
            generated_at = getattr(pkg, "generated_at", None)

    with db_connection() as conn:
        # Add full_call_script column if it doesn't exist yet (migration)
        try:
            conn.execute("ALTER TABLE outreach_packages ADD COLUMN full_call_script TEXT")
        except Exception:
            pass

        conn.execute("""
            INSERT INTO outreach_packages
            (place_id, cold_email, call_opener, full_call_script, linkedin_intro,
             follow_up_email, site_visit_brief, generated_at, model_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?)
            ON CONFLICT(place_id) DO UPDATE SET
                cold_email = excluded.cold_email,
                call_opener = excluded.call_opener,
                full_call_script = excluded.full_call_script,
                linkedin_intro = excluded.linkedin_intro,
                follow_up_email = excluded.follow_up_email,
                site_visit_brief = excluded.site_visit_brief,
                generated_at = excluded.generated_at,
                model_used = excluded.model_used
        """, (
            place_id,
            cold_email,
            call_opener,
            full_call_script,
            linkedin_intro,
            follow_up_email,
            site_visit_brief,
            generated_at,
            model_used,
        ))
        conn.commit()


def get_outreach(place_id: str):
    with db_connection() as conn:
        cur = conn.execute("""
            SELECT *
            FROM outreach_packages
            WHERE place_id = ?
        """, (place_id,))
        return cur.fetchone()


def update_lead_score(place_id, priority_score, score_reason,
                      high_value_target, likely_multi_site,
                      next_best_action):
    with db_connection() as conn:
        conn.execute("""
            UPDATE lead_records
            SET priority_score = ?,
                score_reason = ?,
                high_value_target = ?,
                likely_multi_site = ?,
                next_best_action = ?,
                updated_at = datetime('now')
            WHERE place_id = ?
        """, (
            priority_score,
            score_reason,
            int(bool(high_value_target)),
            int(bool(likely_multi_site)),
            next_best_action,
            place_id
        ))
        conn.commit()


def upsert_lead_record(lead):
    sql = """
        INSERT INTO lead_records
        (
            place_id, business_name, raw_sector, normalized_sector, borough,
            address, postcode, latitude, longitude, website, phone, rating,
            review_count, google_maps_url, source_query, source_system,
            date_collected, has_phone, has_website, postcode_extracted,
            ai_business_type, ai_sub_sector, ai_decision_maker_type,
            ai_is_cleaning_target, ai_classification_note,
            priority_score, score_reason, high_value_target, likely_multi_site,
            next_best_action, website_summary, website_business_type,
            website_pain_points, website_scraped_at,
            buying_signal_score, buying_signal_types, move_signal, expansion_signal,
            refurb_signal, hiring_signal, compliance_signal, review_signal,
            multi_site_signal, trigger_summary, recommended_offer,
            recommended_channel, timing_urgency, likely_buyer_role,
            pipeline_status, created_at, updated_at
        )
        VALUES (
            ?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?,?,
            ?
        )
        ON CONFLICT(place_id) DO UPDATE SET
            business_name            = excluded.business_name,
            raw_sector               = excluded.raw_sector,
            normalized_sector        = excluded.normalized_sector,
            borough                  = excluded.borough,
            address                  = excluded.address,
            postcode                 = excluded.postcode,
            latitude                 = excluded.latitude,
            longitude                = excluded.longitude,
            website                  = excluded.website,
            phone                    = excluded.phone,
            rating                   = excluded.rating,
            review_count             = excluded.review_count,
            google_maps_url          = excluded.google_maps_url,
            source_query             = excluded.source_query,
            source_system            = excluded.source_system,
            date_collected           = excluded.date_collected,
            has_phone                = excluded.has_phone,
            has_website              = excluded.has_website,
            postcode_extracted       = excluded.postcode_extracted,
            ai_business_type         = excluded.ai_business_type,
            ai_sub_sector            = excluded.ai_sub_sector,
            ai_decision_maker_type   = excluded.ai_decision_maker_type,
            ai_is_cleaning_target    = excluded.ai_is_cleaning_target,
            ai_classification_note   = excluded.ai_classification_note,
            priority_score           = excluded.priority_score,
            score_reason             = excluded.score_reason,
            high_value_target        = excluded.high_value_target,
            likely_multi_site        = excluded.likely_multi_site,
            next_best_action         = excluded.next_best_action,
            website_summary          = excluded.website_summary,
            website_business_type    = excluded.website_business_type,
            website_pain_points      = excluded.website_pain_points,
            website_scraped_at       = excluded.website_scraped_at,
            buying_signal_score      = excluded.buying_signal_score,
            buying_signal_types      = excluded.buying_signal_types,
            move_signal              = excluded.move_signal,
            expansion_signal         = excluded.expansion_signal,
            refurb_signal            = excluded.refurb_signal,
            hiring_signal            = excluded.hiring_signal,
            compliance_signal        = excluded.compliance_signal,
            review_signal            = excluded.review_signal,
            multi_site_signal        = excluded.multi_site_signal,
            trigger_summary          = excluded.trigger_summary,
            recommended_offer        = excluded.recommended_offer,
            recommended_channel      = excluded.recommended_channel,
            timing_urgency           = excluded.timing_urgency,
            likely_buyer_role        = excluded.likely_buyer_role,
            pipeline_status          = excluded.pipeline_status,
            updated_at               = datetime('now')
    """

    from datetime import datetime as _dt
    now = _dt.utcnow().isoformat()

    with db_connection() as conn:
        conn.execute(sql, (
            lead.place_id,
            lead.business_name,
            lead.raw_sector,
            lead.normalized_sector,
            lead.borough,
            lead.address,
            lead.postcode,
            lead.latitude,
            lead.longitude,
            lead.website,
            lead.phone,
            lead.rating,
            lead.review_count,
            lead.google_maps_url,
            lead.source_query,
            lead.source_system,
            lead.date_collected.isoformat() if isinstance(lead.date_collected, _dt) else lead.date_collected,
            int(lead.has_phone),
            int(lead.has_website),
            int(lead.postcode_extracted),
            lead.ai_business_type,
            lead.ai_sub_sector,
            lead.ai_decision_maker_type,
            int(lead.ai_is_cleaning_target) if lead.ai_is_cleaning_target is not None else None,
            lead.ai_classification_note,
            lead.priority_score,
            lead.score_reason,
            int(lead.high_value_target),
            int(lead.likely_multi_site),
            lead.next_best_action,
            lead.website_summary,
            lead.website_business_type,
            lead.website_pain_points,
            lead.website_scraped_at.isoformat() if isinstance(lead.website_scraped_at, _dt) else lead.website_scraped_at,
            lead.buying_signal_score,
            lead.buying_signal_types,
            int(lead.move_signal),
            int(lead.expansion_signal),
            int(lead.refurb_signal),
            int(lead.hiring_signal),
            int(lead.compliance_signal),
            int(lead.review_signal),
            int(lead.multi_site_signal),
            lead.trigger_summary,
            lead.recommended_offer,
            lead.recommended_channel,
            lead.timing_urgency,
            lead.likely_buyer_role,
            lead.pipeline_status,
            now,
            now,
        ))
        conn.commit()


# ── Activities ────────────────────────────────────────────────────────────────

def log_activity(place_id: str, activity_type: str, summary: str,
                 channel: str = None, outcome: str = None, next_action: str = None):
    with db_connection() as conn:
        conn.execute("""
            INSERT INTO activities (place_id, activity_type, channel, summary, outcome, next_action)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (place_id, activity_type, channel, summary, outcome, next_action))
        conn.execute("UPDATE pipeline_leads SET last_touched=datetime('now') WHERE place_id=?", (place_id,))
        conn.commit()

def get_activities(place_id: str):
    with db_connection() as conn:
        return conn.execute(
            "SELECT * FROM activities WHERE place_id=? ORDER BY created_at DESC", (place_id,)
        ).fetchall()


# ── Notes ─────────────────────────────────────────────────────────────────────

def add_note(place_id: str, body: str) -> int:
    with db_connection() as conn:
        cur = conn.execute("INSERT INTO notes (place_id, body) VALUES (?, ?)", (place_id, body))
        conn.commit()
        return cur.lastrowid

def get_notes(place_id: str):
    with db_connection() as conn:
        return conn.execute(
            "SELECT * FROM notes WHERE place_id=? ORDER BY created_at DESC", (place_id,)
        ).fetchall()

def update_note(note_id: int, body: str):
    with db_connection() as conn:
        conn.execute("UPDATE notes SET body=?, updated_at=datetime('now') WHERE id=?", (body, note_id))
        conn.commit()

def delete_note(note_id: int):
    with db_connection() as conn:
        conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
        conn.commit()


# ── Lead CRUD ─────────────────────────────────────────────────────────────────

def update_lead_fields(place_id: str, fields: dict):
    """Update arbitrary lead_records fields. Allowed fields only."""
    ALLOWED = {
        'business_name', 'phone', 'email', 'website', 'contact_name', 'address', 'borough',
        'normalized_sector', 'manual_score_override', 'high_value_target', 'notes',
        'ai_decision_maker_type', 'ai_business_type', 'ai_classification_note'
    }
    clean = {k: v for k, v in fields.items() if k in ALLOWED}
    if not clean:
        return
    set_clause = ", ".join(f"{k}=?" for k in clean)
    params = list(clean.values()) + [place_id]
    with db_connection() as conn:
        conn.execute(
            f"UPDATE lead_records SET {set_clause}, updated_at=datetime('now') WHERE place_id=?",
            params
        )
        conn.commit()

def archive_lead(place_id: str):
    """Soft-delete: set archived_at timestamp, remove from pipeline."""
    with db_connection() as conn:
        conn.execute("UPDATE lead_records SET archived_at=datetime('now'), updated_at=datetime('now') WHERE place_id=?", (place_id,))
        conn.execute("UPDATE pipeline_leads SET status='lost', updated_at=datetime('now') WHERE place_id=?", (place_id,))
        conn.commit()

def restore_lead(place_id: str):
    """Un-archive a lead."""
    with db_connection() as conn:
        conn.execute("UPDATE lead_records SET archived_at=NULL, updated_at=datetime('now') WHERE place_id=?", (place_id,))
        conn.commit()

def create_manual_lead(data: dict) -> str:
    """Create a new lead from manual entry. Returns place_id."""
    import uuid
    place_id = f"manual_{uuid.uuid4().hex[:12]}"
    with db_connection() as conn:
        conn.execute("""
            INSERT INTO lead_records (
                place_id, business_name, normalized_sector, borough, address,
                phone, email, website, contact_name, source_system, priority_score,
                pipeline_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 50, 'new', datetime('now'), datetime('now'))
        """, (
            place_id,
            data.get('business_name', ''),
            data.get('sector', 'other'),
            data.get('borough', ''),
            data.get('address', ''),
            data.get('phone', ''),
            data.get('email', ''),
            data.get('website', ''),
            data.get('contact_name', ''),
        ))
        # Also add to pipeline
        conn.execute("""
            INSERT OR IGNORE INTO pipeline_leads (place_id, business_name, sector, borough, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'new', datetime('now'), datetime('now'))
        """, (place_id, data.get('business_name', ''), data.get('sector', 'other'), data.get('borough', '')))
        conn.commit()
    return place_id


# ── Pipeline enhancements ─────────────────────────────────────────────────────

def update_pipeline_quote(place_id: str, quote_value_gbp: float, quote_date: str = None):
    with db_connection() as conn:
        conn.execute("""
            UPDATE pipeline_leads SET quote_value_gbp=?, quote_date=COALESCE(?,datetime('now')),
            last_touched=datetime('now'), updated_at=datetime('now') WHERE place_id=?
        """, (quote_value_gbp, quote_date, place_id))
        conn.commit()

def update_pipeline_outcome(place_id: str, outcome: str, reason: str = None, value_gbp: float = None):
    """Record win or loss with reason/value."""
    with db_connection() as conn:
        if outcome == 'won':
            conn.execute("""
                UPDATE pipeline_leads SET status='won', win_date=datetime('now'),
                quote_value_gbp=COALESCE(?,quote_value_gbp), last_touched=datetime('now'),
                updated_at=datetime('now') WHERE place_id=?
            """, (value_gbp, place_id))
            conn.execute("UPDATE lead_records SET pipeline_status='won', updated_at=datetime('now') WHERE place_id=?", (place_id,))
        elif outcome == 'lost':
            conn.execute("""
                UPDATE pipeline_leads SET status='lost', loss_reason=?, loss_date=datetime('now'),
                last_touched=datetime('now'), updated_at=datetime('now') WHERE place_id=?
            """, (reason, place_id))
            conn.execute("UPDATE lead_records SET pipeline_status='lost', updated_at=datetime('now') WHERE place_id=?", (place_id,))
        conn.commit()


# ── Documents ─────────────────────────────────────────────────────────────────

def save_document(filename: str, original_filename: str, file_path: str,
                  file_size_bytes: int, place_id: str = None, doc_type: str = 'other') -> int:
    with db_connection() as conn:
        cur = conn.execute("""
            INSERT INTO uploaded_documents (filename, original_filename, file_path, file_size_bytes, place_id, doc_type)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (filename, original_filename, file_path, file_size_bytes, place_id, doc_type))
        conn.commit()
        return cur.lastrowid

def update_document_extraction(doc_id: int, extracted_text: str, status: str,
                                parsed: dict = None, error: str = None):
    with db_connection() as conn:
        import json
        conn.execute("""
            UPDATE uploaded_documents SET
                extracted_text=?, extraction_status=?, extraction_error=?,
                parsed_contacts=?, parsed_company=?, parsed_address=?,
                parsed_dates=?, parsed_keywords=?, parsed_value_clues=?,
                extracted_at=datetime('now')
            WHERE id=?
        """, (
            extracted_text, status, error,
            json.dumps(parsed.get('contacts', [])) if parsed else None,
            parsed.get('company') if parsed else None,
            parsed.get('address') if parsed else None,
            json.dumps(parsed.get('dates', [])) if parsed else None,
            json.dumps(parsed.get('keywords', [])) if parsed else None,
            json.dumps(parsed.get('value_clues', {})) if parsed else None,
            doc_id
        ))
        conn.commit()

def get_document(doc_id: int):
    with db_connection() as conn:
        return conn.execute("SELECT * FROM uploaded_documents WHERE id=?", (doc_id,)).fetchone()

def get_documents(place_id: str = None, limit: int = 50):
    with db_connection() as conn:
        if place_id:
            return conn.execute(
                "SELECT * FROM uploaded_documents WHERE place_id=? ORDER BY upload_date DESC LIMIT ?",
                (place_id, limit)
            ).fetchall()
        return conn.execute(
            "SELECT * FROM uploaded_documents ORDER BY upload_date DESC LIMIT ?", (limit,)
        ).fetchall()


# ── Email Campaigns ───────────────────────────────────────────────────────────

def create_campaign(name: str, template_type: str = 'cold_email', filter_sector: str = None,
                    filter_borough: str = None, filter_min_score: int = 60,
                    filter_stage: str = None, notes: str = None) -> int:
    with db_connection() as conn:
        cur = conn.execute("""
            INSERT INTO email_campaigns (name, template_type, filter_sector, filter_borough,
                filter_min_score, filter_stage, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (name, template_type, filter_sector, filter_borough, filter_min_score, filter_stage, notes))
        conn.commit()
        return cur.lastrowid

def update_campaign(campaign_id: int, **kwargs):
    allowed = {'status', 'export_path', 'exported_at', 'lead_count', 'notes'}
    clean = {k: v for k, v in kwargs.items() if k in allowed}
    if not clean:
        return
    set_clause = ", ".join(f"{k}=?" for k in clean)
    with db_connection() as conn:
        conn.execute(f"UPDATE email_campaigns SET {set_clause} WHERE id=?", (*clean.values(), campaign_id))
        conn.commit()

def add_campaign_leads(campaign_id: int, place_ids: list):
    with db_connection() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO campaign_leads (campaign_id, place_id) VALUES (?, ?)",
            [(campaign_id, pid) for pid in place_ids]
        )
        conn.execute("UPDATE email_campaigns SET lead_count=? WHERE id=?", (len(place_ids), campaign_id))
        conn.commit()

def get_campaigns(limit: int = 50):
    with db_connection() as conn:
        return conn.execute(
            "SELECT * FROM email_campaigns ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()

def get_campaign(campaign_id: int):
    with db_connection() as conn:
        camp = conn.execute("SELECT * FROM email_campaigns WHERE id=?", (campaign_id,)).fetchone()
        leads = conn.execute("""
            SELECT cl.place_id, lr.business_name, lr.borough, lr.normalized_sector, lr.priority_score
            FROM campaign_leads cl
            JOIN lead_records lr ON cl.place_id = lr.place_id
            WHERE cl.campaign_id=?
        """, (campaign_id,)).fetchall()
        return camp, leads
