"""
db_pg.py — AskMiro PostgreSQL connection layer
Psycopg2-based. All queries return dicts. All mutations are transactional.
"""

from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Any, Generator, Optional

import psycopg2
import psycopg2.extras

import config

# ------------------------------------------------------------------
# Valid pipeline stage transitions (enforced in advance_opportunity)
# ------------------------------------------------------------------
VALID_TRANSITIONS: dict[str, list[str]] = {
    'new':                   ['enriched', 'ready_to_contact', 'contacted', 'lost', 'dormant'],
    'enriched':              ['ready_to_contact', 'contacted', 'lost', 'dormant'],
    'ready_to_contact':      ['contacted', 'lost', 'dormant'],
    'contacted':             ['contacted', 'replied', 'meeting_or_site_visit', 'lost', 'dormant'],
    'replied':               ['meeting_or_site_visit', 'quote_prepared', 'contacted', 'lost', 'dormant'],
    'meeting_or_site_visit': ['quote_prepared', 'replied', 'lost', 'dormant'],
    'quote_prepared':        ['quote_sent', 'meeting_or_site_visit', 'lost', 'dormant'],
    'quote_sent':            ['negotiating', 'won', 'lost', 'dormant'],
    'negotiating':           ['won', 'lost', 'dormant'],
    'won':                   [],
    'lost':                  ['new'],
    'dormant':               ['new', 'ready_to_contact'],
}

# ------------------------------------------------------------------
# Connection helpers
# ------------------------------------------------------------------

def _get_dsn() -> str:
    # Prefer DATABASE_URL (set on Render / production) over legacy PG_DSN
    url = os.getenv("DATABASE_URL", "")
    if url:
        # psycopg2 needs postgresql:// not postgres://
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        return url
    dsn = config.PG_DSN
    if dsn and dsn != "dbname=askmiro_warehouse host=localhost":
        return dsn
    return "dbname=askmiro_warehouse host=localhost"


def get_conn() -> psycopg2.extensions.connection:
    """Return a new psycopg2 connection with RealDictCursor as default."""
    conn = psycopg2.connect(
        _get_dsn(),
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    conn.autocommit = False
    return conn


@contextmanager
def transaction() -> Generator[psycopg2.extensions.connection, None, None]:
    """Context manager: yields an open connection, commits on exit, rolls back on error."""
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ------------------------------------------------------------------
# Low-level helpers
# ------------------------------------------------------------------

def execute(conn, sql: str, params=()) -> None:
    with conn.cursor() as cur:
        cur.execute(sql, params)


def fetchone(conn, sql: str, params=()) -> Optional[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def fetchall(conn, sql: str, params=()) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def fetchval(conn, sql: str, params=()):
    row = fetchone(conn, sql, params)
    if row is None:
        return None
    return next(iter(row.values()))


# ------------------------------------------------------------------
# Lead board (replaces SQLite list_leads)
# ------------------------------------------------------------------

def list_leads(
    conn,
    *,
    page: int = 1,
    per_page: int = 50,
    min_score: int = 0,
    borough: Optional[str] = None,
    sector: Optional[str] = None,
    search: Optional[str] = None,
    hvt_only: bool = False,
    limit: Optional[int] = None,
) -> dict:
    conditions = ["vl.active = TRUE", "vl.total_score >= %s"]
    params: list[Any] = [min_score]

    if borough:
        conditions.append("vl.borough = %s")
        params.append(borough)
    if sector:
        conditions.append("vl.sector = %s")
        params.append(sector)
    if hvt_only:
        conditions.append("vl.hvt = TRUE")
    if search:
        s = f"%{search.lower()}%"
        conditions.append("""(
            LOWER(vl.business_name)  LIKE %s OR
            LOWER(vl.address)        LIKE %s OR
            LOWER(vl.borough)        LIKE %s OR
            LOWER(vl.sector)         LIKE %s OR
            LOWER(vl.postcode)       LIKE %s OR
            LOWER(vl.phone)          LIKE %s OR
            LOWER(vl.website)        LIKE %s
        )""")
        params.extend([s, s, s, s, s, s, s])

    where = " AND ".join(conditions)

    base_sql = f"""
        FROM v_lead_board vl
        WHERE {where}
    """

    total = fetchval(conn, f"SELECT COUNT(*) {base_sql}", params)

    if limit is not None:
        rows = fetchall(conn, f"SELECT vl.* {base_sql} ORDER BY vl.total_score DESC LIMIT %s", params + [limit])
        return {"leads": [dict(r) for r in rows], "total": total}

    offset = (page - 1) * per_page
    rows = fetchall(
        conn,
        f"SELECT vl.* {base_sql} ORDER BY vl.total_score DESC LIMIT %s OFFSET %s",
        params + [per_page, offset],
    )
    import math
    return {
        "leads": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if total else 1,
    }


# ------------------------------------------------------------------
# Pipeline board
# ------------------------------------------------------------------

def list_pipeline(conn) -> list[dict]:
    rows = fetchall(conn, "SELECT * FROM v_pipeline_board ORDER BY total_score DESC")
    return [dict(r) for r in rows]


def get_opportunity(conn, opportunity_id: int) -> Optional[dict]:
    return fetchone(conn, "SELECT * FROM v_pipeline_board WHERE opportunity_id = %s", (opportunity_id,))


# ------------------------------------------------------------------
# Pipeline stage advancement (transactional, enforced)
# ------------------------------------------------------------------

def advance_opportunity(conn, opp_id: int, new_stage: str, actor: str = 'user') -> None:
    """
    Advance an opportunity to new_stage. Enforces VALID_TRANSITIONS.
    Writes directly to pipeline_leads (opportunities is a read-only view).
    Caller must commit the connection.
    """
    row = fetchone(
        conn,
        "SELECT status AS current_stage FROM pipeline_leads WHERE id = %s FOR UPDATE",
        (opp_id,),
    )
    if row is None:
        raise ValueError(f"Opportunity {opp_id} not found")

    current = row['current_stage']
    if new_stage not in VALID_TRANSITIONS.get(current, []):
        raise ValueError(f"Transition {current!r} → {new_stage!r} not permitted")

    execute(
        conn,
        "UPDATE opportunities SET current_stage = %s::pipeline_stage, updated_at = NOW(), last_touched_at = NOW() WHERE id = %s",
        (new_stage, opp_id),
    )
    execute(
        conn,
        "INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, actor, changed_at) VALUES (%s, %s, %s, %s, NOW())",
        (opp_id, current, new_stage, actor),
    )
    execute(
        conn,
        "INSERT INTO activity_log (opportunity_id, activity_type, actor, details) VALUES (%s, 'stage_changed', %s, %s)",
        (opp_id, actor, json.dumps({'from': current, 'to': new_stage})),
    )


# ------------------------------------------------------------------
# Entity CRUD
# ------------------------------------------------------------------

def get_entity(conn, entity_id: int) -> Optional[dict]:
    return fetchone(conn, "SELECT * FROM v_lead_board WHERE entity_id = %s", (entity_id,))


def upsert_entity(conn, *, entity_kind: str, canonical_name: str, normalized_name: str,
                  sector: str = None, sub_sector: str = None, company_number: str = None,
                  charity_number: str = None, cqc_location_id: str = None,
                  primary_website: str = None, website_domain: str = None,
                  primary_phone: str = None, primary_email: str = None,
                  hvt: bool = False) -> int:
    """
    Insert entity or return existing id on conflict.
    Returns entity_id.
    """
    sql = """
        INSERT INTO entities (
            entity_kind, canonical_name, normalized_name, sector, sub_sector,
            company_number, charity_number, cqc_location_id,
            primary_website, website_domain, primary_phone, primary_email, hvt
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (entity_kind, normalized_name, COALESCE(company_number, ''))
        DO UPDATE SET
            canonical_name = EXCLUDED.canonical_name,
            primary_phone  = COALESCE(EXCLUDED.primary_phone, entities.primary_phone),
            primary_website = COALESCE(EXCLUDED.primary_website, entities.primary_website),
            updated_at = NOW()
        RETURNING id
    """
    return fetchval(conn, sql, (
        entity_kind, canonical_name, normalized_name, sector, sub_sector,
        company_number, charity_number, cqc_location_id,
        primary_website, website_domain, primary_phone, primary_email, hvt,
    ))


def upsert_address(conn, *, line1: str = None, borough: str = None, postcode: str = None,
                   latitude: float = None, longitude: float = None) -> int:
    sql = """
        INSERT INTO addresses (line1, borough, postcode, latitude, longitude)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
    """
    return fetchval(conn, sql, (line1, borough, postcode, latitude, longitude))


def link_entity_address(conn, entity_id: int, address_id: int, is_primary: bool = True) -> None:
    execute(conn, """
        INSERT INTO entity_locations (entity_id, address_id, is_primary)
        VALUES (%s, %s, %s)
        ON CONFLICT (entity_id, address_id) DO NOTHING
    """, (entity_id, address_id, is_primary))


def link_entity_source(conn, entity_id: int, source: str, source_record_id: str,
                        confidence: int = 100) -> None:
    execute(conn, """
        INSERT INTO entity_source_links (entity_id, source, source_record_id, confidence)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (source, source_record_id) DO NOTHING
    """, (entity_id, source, source_record_id, confidence))


# ------------------------------------------------------------------
# Scores
# ------------------------------------------------------------------

def upsert_score(conn, entity_id: int, scores: dict) -> None:
    total = scores.get('total_score', 0)
    band = 'A' if total >= 80 else 'B' if total >= 65 else 'C' if total >= 50 else 'D'
    execute(conn, """
        INSERT INTO opportunity_scores (
            entity_id, fit_score, facility_score, buyer_signal_score,
            contactability_score, scale_score, freshness_score,
            total_score, score_band, next_best_action,
            estimated_contract_value_gbp, estimated_monthly_value_gbp,
            scored_at
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
        ON CONFLICT (entity_id) DO UPDATE SET
            fit_score              = EXCLUDED.fit_score,
            facility_score         = EXCLUDED.facility_score,
            buyer_signal_score     = EXCLUDED.buyer_signal_score,
            contactability_score   = EXCLUDED.contactability_score,
            scale_score            = EXCLUDED.scale_score,
            freshness_score        = EXCLUDED.freshness_score,
            total_score            = EXCLUDED.total_score,
            score_band             = EXCLUDED.score_band,
            next_best_action       = EXCLUDED.next_best_action,
            estimated_contract_value_gbp  = EXCLUDED.estimated_contract_value_gbp,
            estimated_monthly_value_gbp   = EXCLUDED.estimated_monthly_value_gbp,
            scored_at              = NOW()
    """, (
        entity_id,
        scores.get('fit_score', 0),
        scores.get('facility_score', 0),
        scores.get('buyer_signal_score', 0),
        scores.get('contactability_score', 0),
        scores.get('scale_score', 0),
        scores.get('freshness_score', 0),
        total,
        band,
        scores.get('next_best_action'),
        scores.get('estimated_contract_value_gbp'),
        scores.get('estimated_monthly_value_gbp'),
    ))


# ------------------------------------------------------------------
# Signals
# ------------------------------------------------------------------

def insert_signal(conn, entity_id: int, signal_type: str, strength: int = 50,
                  evidence: str = None, source: str = None) -> None:
    # Unique index uq_signals_entity_type_source enforces dedup at DB level.
    # ON CONFLICT DO UPDATE refreshes strength/evidence so stale data doesn't persist.
    execute(conn, """
        INSERT INTO signals (entity_id, signal_type, strength, evidence, source)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (entity_id, signal_type, source) DO UPDATE SET
            strength   = GREATEST(signals.strength, EXCLUDED.strength),
            evidence   = COALESCE(EXCLUDED.evidence, signals.evidence),
            detected_at = NOW(),
            active     = TRUE
    """, (entity_id, signal_type, strength, evidence, source))


# ------------------------------------------------------------------
# Opportunities
# ------------------------------------------------------------------

def create_opportunity(conn, entity_id: int, current_stage: str = 'new',
                       owner: str = None, title: str = None) -> int:
    """
    Create an opportunity for entity_id.
    Writes directly to the opportunities table.
    """
    row = fetchone(conn, "SELECT canonical_name FROM entities WHERE id = %s", (entity_id,))
    if not row:
        raise ValueError(f"Entity {entity_id} not found")
    biz_name = title or row.get('canonical_name') or f"Lead {entity_id}"
    opp_title = f"Commercial cleaning — {biz_name}"
    return fetchval(conn, """
        INSERT INTO opportunities (entity_id, title, current_stage, owner, created_at, updated_at)
        VALUES (%s, %s, %s::pipeline_stage, %s, NOW(), NOW())
        ON CONFLICT (entity_id) DO UPDATE SET updated_at = NOW()
        RETURNING id
    """, (entity_id, opp_title, current_stage, owner))


# ------------------------------------------------------------------
# Activity log
# ------------------------------------------------------------------

def log_activity(conn, *, activity_type: str, opportunity_id: int = None,
                 entity_id: int = None, actor: str = 'user',
                 subject: str = None, body: str = None, details: dict = None) -> None:
    execute(conn, """
        INSERT INTO activity_log (opportunity_id, entity_id, activity_type, actor, subject, body, details)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (opportunity_id, entity_id, activity_type, actor, subject, body,
          json.dumps(details) if details else None))


# ------------------------------------------------------------------
# Analytics
# ------------------------------------------------------------------

def analytics_summary(conn) -> dict:
    # Use flat lead_records / pipeline_leads — works with both SQLite and Postgres
    try:
        total      = fetchval(conn, "SELECT COUNT(*) FROM lead_records WHERE archived_at IS NULL") or 0
        avg_score  = fetchval(conn, "SELECT ROUND(AVG(priority_score)::NUMERIC, 1) FROM lead_records WHERE archived_at IS NULL") or 0
        pipeline_n = fetchval(conn, "SELECT COUNT(*) FROM pipeline_leads WHERE status NOT IN ('won','lost','dormant')") or 0
        hvt_n      = fetchval(conn, "SELECT COUNT(*) FROM lead_records WHERE high_value_target = 1 AND archived_at IS NULL") or 0
        won_n      = fetchval(conn, "SELECT COUNT(*) FROM pipeline_leads WHERE status = 'won'") or 0
        pipeline_val = fetchval(conn, "SELECT COALESCE(SUM(quote_value_gbp), 0) FROM pipeline_leads WHERE status NOT IN ('lost','dormant')") or 0
        with_phone = fetchval(conn, "SELECT COUNT(*) FROM lead_records WHERE phone IS NOT NULL AND phone != '' AND archived_at IS NULL") or 0
        with_email = fetchval(conn, "SELECT COUNT(*) FROM lead_records WHERE email IS NOT NULL AND email != '' AND archived_at IS NULL") or 0
        return {
            "total_leads": int(total),
            "avg_score": float(avg_score),
            "active_pipeline": int(pipeline_n),
            "hvt_count": int(hvt_n),
            "won_count": int(won_n),
            "pipeline_value_gbp": int(pipeline_val),
            "with_phone": int(with_phone),
            "with_email": int(with_email),
        }
    except Exception:
        return {"total_leads": 0, "avg_score": 0, "active_pipeline": 0, "hvt_count": 0, "won_count": 0, "pipeline_value_gbp": 0}


def analytics_by_borough(conn) -> list[dict]:
    try:
        rows = fetchall(conn, """
            SELECT borough,
                   COUNT(*) AS count,
                   ROUND(AVG(priority_score)::NUMERIC, 1) AS avg_score,
                   SUM(CASE WHEN high_value_target = 1 THEN 1 ELSE 0 END) AS hvt_count
            FROM lead_records
            WHERE borough IS NOT NULL AND borough != '' AND archived_at IS NULL
            GROUP BY borough ORDER BY count DESC LIMIT 33
        """)
        return [dict(r) for r in rows]
    except Exception:
        return []


def analytics_by_sector(conn) -> list[dict]:
    try:
        rows = fetchall(conn, """
            SELECT normalized_sector AS sector,
                   COUNT(*) AS count,
                   ROUND(AVG(priority_score)::NUMERIC, 1) AS avg_score,
                   SUM(CASE WHEN high_value_target = 1 THEN 1 ELSE 0 END) AS hvt_count
            FROM lead_records
            WHERE normalized_sector IS NOT NULL AND archived_at IS NULL
            GROUP BY normalized_sector ORDER BY count DESC
        """)
        return [dict(r) for r in rows]
    except Exception:
        return []


def pipeline_stage_counts(conn) -> dict:
    try:
        rows = fetchall(conn, "SELECT status AS current_stage, COUNT(*) AS n FROM pipeline_leads GROUP BY status")
        return {r['current_stage']: int(r['n']) for r in rows}
    except Exception:
        return {}
