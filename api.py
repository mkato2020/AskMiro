"""
api.py — AskMiro Lead Intelligence OS
FastAPI layer over the existing Python modules.
Run with: python -m uvicorn api:app --reload --port 8000
"""

from fastapi import FastAPI, Query, HTTPException, Body, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
import os
import tempfile
from pathlib import Path
from datetime import datetime, date
import logging
import database as db
import analytics
import crm_sync
from services.email_scraper import enrich_leads_batch, find_email
# Sales execution services
from services.planning_filter   import run_planning_filter, score_planning_description
from services.script_generator  import generate_script
from services.contact_enrichment import get_best_contact, enrich_entity_contacts, run_contact_enrichment
from services.renewal_predictor import run_renewal_predictions
from services.outreach_engine   import (
    get_daily_tasks, generate_daily_tasks, complete_task,
    log_activity as log_outreach_activity,
    start_sequence, advance_sequence_step, get_next_best_action,
)
from services.value_estimator   import estimate as estimate_value
import pipeline as pl
import outreach_generator
import weekly_targets
import pdf_extractor
import db_pg
import json
from ops_tables import ensure_ops_tables, next_invoice_number, mark_overdue_invoices, recalculate_snapshots
from database import (
    init_db,
    log_activity, get_activities,
    add_note, get_notes, update_note, delete_note,
    update_lead_fields, archive_lead, restore_lead, create_manual_lead,
    update_pipeline_quote, update_pipeline_outcome,
    save_document, update_document_extraction, get_document, get_documents,
    create_campaign, update_campaign, add_campaign_leads, get_campaigns, get_campaign,
)
from analytics import activity_summary, pipeline_velocity

app = FastAPI(title="AskMiro Lead Intelligence OS", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Session middleware (needed by authlib for OAuth state parameter)
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SESSION_SECRET", "askmiro-dev-secret-change-me"))

# Auth middleware — sits above CORS so cookies work
from auth import AuthMiddleware, register_auth_routes
app.add_middleware(AuthMiddleware)
register_auth_routes(app)

logger = logging.getLogger(__name__)

# Ensure DB is initialised on startup
@app.on_event("startup")
async def startup():
    try:
        init_db()
    except Exception as e:
        logger.error("init_db failed (non-fatal): %s", e)
    # Create operational tables (finance, cleaners, payroll, quality, SEO, compliance)
    try:
        with db_pg.transaction() as conn:
            ensure_ops_tables(conn)
            logger.info("ops tables ensured OK")
    except Exception as e:
        logger.warning("ops tables init: %s", e)
    # Create deliverability tables
    try:
        from services.email_deliverability import ensure_deliverability_tables
        with db_pg.transaction() as conn:
            ensure_deliverability_tables(conn)
            logger.info("deliverability tables ensured OK")
    except Exception as e:
        logger.warning("deliverability tables init: %s", e)
    _start_scheduler()


def _start_scheduler():
    """Start APScheduler background jobs for the CRM automation pipeline."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.interval import IntervalTrigger

        scheduler = BackgroundScheduler(timezone="Europe/London", daemon=True)

        # Push qualified leads → GAS CRM every 30 minutes
        scheduler.add_job(
            _job_push_leads,
            trigger=IntervalTrigger(minutes=30),
            id="crm_push",
            name="Push qualified leads to CRM",
            max_instances=1,
            replace_existing=True,
        )

        # Sync CRM status back → local DB every 2 hours
        scheduler.add_job(
            _job_sync_status,
            trigger=IntervalTrigger(hours=2),
            id="crm_sync",
            name="Sync CRM status to local DB",
            max_instances=1,
            replace_existing=True,
        )

        scheduler.start()
        logger.info("APScheduler started: crm_push (30min) + crm_sync (2h)")
    except ImportError:
        logger.warning(
            "APScheduler not installed — CRM auto-push disabled. "
            "Run: pip install apscheduler"
        )
    except Exception as exc:
        logger.error("APScheduler failed to start: %s", exc)


def _job_push_leads():
    try:
        result = crm_sync.push_qualified_leads()
        logger.info("Scheduled CRM push: %s", result)
    except Exception as exc:
        logger.error("Scheduled CRM push failed: %s", exc)


def _job_sync_status():
    try:
        result = crm_sync.sync_status_from_crm()
        logger.info("Scheduled CRM sync: %s", result)
    except Exception as exc:
        logger.error("Scheduled CRM sync failed: %s", exc)


# ── Frontend ──────────────────────────────────────────────────────────────────
# Serve the Alpine.js single-file app directly (no build step needed).
# Falls back to the React dist build if the source file doesn't exist.

_SRC_INDEX = os.path.join(os.path.dirname(__file__), "frontend", "index.html")
_DIST      = os.path.join(os.path.dirname(__file__), "frontend", "dist")
_DIST_INDEX = os.path.join(_DIST, "index.html")

# UI_MODE=react → always serve React build; UI_MODE=alpine → always serve Alpine.
# Default: React if dist exists, else Alpine.
_ui_mode = os.getenv("UI_MODE", "react").lower()
if _ui_mode == "alpine":
    _INDEX = _SRC_INDEX
elif _ui_mode == "react":
    _INDEX = _DIST_INDEX if os.path.isfile(_DIST_INDEX) else _SRC_INDEX
else:
    _INDEX = _DIST_INDEX if os.path.isfile(_DIST_INDEX) else _SRC_INDEX

# Mount React dist assets (JS/CSS chunks)
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="static-assets")


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    _version = "2026-04-02-v12-today-fix"
    result = {"_version": _version}
    try:
        with db_pg.transaction() as conn:
            # Check entities
            result["entities"] = db_pg.fetchval(conn, "SELECT COUNT(*) FROM entities") or 0
            # Check which key tables exist
            tables_check = ['entities', 'signals', 'opportunities', 'opportunity_scores',
                           'fin_invoices', 'fin_expenses', 'fin_transactions', 'fin_payments',
                           'ops_cleaners', 'contracts', 'intelligence_alerts', 'quotes',
                           'contract_schedules', 'cleaner_coverage']
            existing = []
            missing = []
            for t in tables_check:
                try:
                    db_pg.fetchval(conn, f"SELECT COUNT(*) FROM {t}")
                    existing.append(t)
                except Exception:
                    missing.append(t)
            result["tables_ok"] = existing
            result["tables_missing"] = missing
            # Check v_lead_board view
            try:
                result["v_lead_board_count"] = db_pg.fetchval(conn, "SELECT COUNT(*) FROM v_lead_board WHERE active = TRUE") or 0
                result["v_lead_board_scored"] = db_pg.fetchval(conn, "SELECT COUNT(*) FROM v_lead_board WHERE active = TRUE AND total_score >= 50") or 0
            except Exception as e:
                result["v_lead_board_error"] = str(e)
            # Check opportunities
            try:
                result["opportunities_count"] = db_pg.fetchval(conn, "SELECT COUNT(*) FROM opportunities") or 0
            except Exception as e:
                result["opportunities_error"] = str(e)
            result["status"] = "ok"
    except Exception as e:
        result["status"] = "error"
        result["detail"] = str(e)
        # Fallback direct connection test
        try:
            from urllib.parse import urlparse as _up
            dsn = os.getenv("DATABASE_URL", "").strip()
            if dsn.startswith("postgres://"):
                dsn = "postgresql://" + dsn[len("postgres://"):]
            p = _up(dsn)
            import psycopg2, psycopg2.extras
            conn = psycopg2.connect(dbname=p.path.lstrip("/"), user=p.username, password=p.password,
                                     host=p.hostname, port=p.port or 5432,
                                     cursor_factory=psycopg2.extras.RealDictCursor, connect_timeout=5)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as cnt FROM entities")
            row = cur.fetchone()
            conn.close()
            result["fallback_ok"] = True
            result["fallback_entities"] = row["cnt"] if row else 0
        except Exception as e2:
            result["fallback_error"] = str(e2)
    return result


@app.post("/api/admin/ensure-tables")
def ensure_tables_endpoint():
    """Create any missing tables (contracts, intelligence_alerts, etc.)"""
    try:
        with db_pg.transaction() as conn:
            ensure_ops_tables(conn)
        return {"ok": True, "message": "Tables ensured"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/admin/db-pg-debug")
def db_pg_debug():
    """Diagnostic: inspect what db_pg.get_conn() actually does."""
    import inspect
    src = inspect.getsource(db_pg.get_conn)
    dsn = db_pg._get_dsn()
    return {
        "get_conn_source": src,
        "dsn_starts": dsn[:40],
        "dsn_len": len(dsn),
        "starts_postgresql": dsn.startswith("postgresql://"),
        "starts_postgres": dsn.startswith("postgres://"),
        "repr_first10": repr(dsn[:10]),
    }


@app.get("/api/admin/db-check")
def db_check():
    """Diagnostic: list all tables and views in the DB."""
    import database
    db_url = os.getenv("DATABASE_URL", "(not set)")
    # Mask password in URL for security
    masked = db_url
    if "@" in masked:
        parts = masked.split("@")
        pre = parts[0]
        if ":" in pre:
            user_part = pre.rsplit(":", 1)[0]
            masked = user_part + ":***@" + parts[1]
    result = {"database_url_set": bool(os.getenv("DATABASE_URL")), "masked_url": masked, "use_postgres": database._USE_POSTGRES}
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT table_name, table_type
                FROM information_schema.tables
                WHERE table_schema = 'public'
                ORDER BY table_type, table_name
            """)
            result["tables"] = [dict(r) for r in rows]
    except Exception as e:
        result["error"] = str(e)
    return result


@app.get("/api/admin/db-test-leads")
def db_test_leads():
    """Diagnostic: test the exact leads query path."""
    from urllib.parse import urlparse as _up
    dsn = os.getenv("DATABASE_URL", "")
    if dsn.startswith("postgres://"):
        dsn = "postgresql://" + dsn[len("postgres://"):]
    try:
        p = _up(dsn)
        import psycopg2, psycopg2.extras
        conn = psycopg2.connect(
            dbname=p.path.lstrip("/"), user=p.username, password=p.password,
            host=p.hostname, port=p.port or 5432,
            cursor_factory=psycopg2.extras.RealDictCursor, connect_timeout=5,
        )
        cur = conn.cursor()
        # Check if v_lead_board exists
        cur.execute("SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema='public' AND table_name='v_lead_board'")
        view_exists = cur.fetchone()["cnt"]
        # Check views
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'v_%' ORDER BY table_name")
        views = [r["table_name"] for r in cur.fetchall()]
        # Try the actual query
        lead_error = None
        lead_count = 0
        try:
            cur.execute("SELECT COUNT(*) as cnt FROM v_lead_board WHERE active = TRUE AND total_score >= 0")
            lead_count = cur.fetchone()["cnt"]
        except Exception as e2:
            lead_error = str(e2)
            conn.rollback()
        conn.close()
        return {"v_lead_board_exists": view_exists, "views": views, "lead_count": lead_count, "lead_error": lead_error}
    except Exception as e:
        return {"error": str(e)}


# ── Leads ─────────────────────────────────────────────────────────────────────

@app.get("/api/leads")
def list_leads(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    limit: Optional[int] = Query(None, ge=1, le=10000),  # legacy: used by export callers
    min_score: int = Query(0, ge=0, le=100),
    max_score: int = Query(100, ge=0, le=100),
    borough: Optional[str] = None,
    sector: Optional[str] = None,
    search: Optional[str] = None,
    q: Optional[str] = None,
    stage: Optional[str] = None,
    has_email: Optional[str] = None,
    has_phone: Optional[str] = None,
    sort: Optional[str] = None,
    order: Optional[str] = None,
    hvt_only: bool = False,
):
    try:
        with db_pg.transaction() as conn:
            return db_pg.list_leads(
                conn,
                page=page,
                per_page=per_page,
                min_score=min_score,
                max_score=max_score,
                borough=borough,
                sector=sector,
                search=search or q,
                stage=stage,
                has_email=has_email,
                has_phone=has_phone,
                sort=sort,
                order=order,
                hvt_only=hvt_only,
                limit=limit,
            )
    except Exception as e:
        logger.error("leads error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/leads/filters")
def leads_filters():
    """Return the distinct boroughs and sectors that actually exist in the DB."""
    with db_pg.transaction() as conn:
        boroughs = [r['borough'] for r in db_pg.fetchall(conn,
            "SELECT borough FROM addresses WHERE borough IS NOT NULL AND borough != '' "
            "GROUP BY borough ORDER BY borough"
        )]
        sectors = [r['sector'] for r in db_pg.fetchall(conn,
            "SELECT sector, COUNT(*) AS n FROM entities "
            "WHERE sector IS NOT NULL AND sector != '' AND active = TRUE "
            "GROUP BY sector ORDER BY n DESC"
        )]
    return {"boroughs": boroughs, "sectors": sectors}


@app.get("/api/leads/{place_id}")
def get_lead(place_id: str):
    with db_pg.transaction() as conn:
        row = db_pg.fetchone(conn,
            "SELECT * FROM v_lead_board WHERE place_id = %s OR entity_id::TEXT = %s",
            (place_id, place_id)
        )
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")
    d = dict(row)
    d['name'] = d.get('business_name') or d.get('canonical_name') or 'Unknown'
    d['company_name'] = d['name']
    if 'current_stage' in d:
        d['stage'] = d['current_stage']
    return d


# ── Analytics ─────────────────────────────────────────────────────────────────

@app.get("/api/analytics/summary")
def analytics_summary():
    def _pct(n, d): return f"{round(n/d*100,1)}%" if d else "0%"
    def _safe(fn):
        try: return fn()
        except Exception: return 0
    try:
        with db_pg.transaction() as conn:
            pg      = db_pg.analytics_summary(conn)
            total   = pg["total_leads"]
            scored  = _safe(lambda: db_pg.fetchval(conn, "SELECT COUNT(*) FROM opportunity_scores WHERE total_score > 0") or 0)
            overdue = _safe(lambda: db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM opportunities
                WHERE next_followup_at < NOW()
                  AND current_stage NOT IN ('won','lost','dormant')
            """) or 0)
            open_q  = _safe(lambda: db_pg.fetchval(conn,
                "SELECT COUNT(*) FROM opportunities WHERE current_stage IN ('quote_prepared','quote_sent')") or 0)
            tasks_today = _safe(lambda: db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM daily_tasks
                WHERE task_date = CURRENT_DATE AND status = 'pending'
            """) or 0)
            won_month = _safe(lambda: db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM opportunity_stage_history
                WHERE to_stage = 'won' AND changed_at >= DATE_TRUNC('month', NOW())
            """) or 0)
            replied = _safe(lambda: db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM opportunities
                WHERE current_stage IN ('replied','meeting_or_site_visit')
            """) or 0)
            active_pipe = pg["active_pipeline"] or 1
        return {
            "total_lead_records": total,
            "scored":             int(scored),
            "scoring_pct":        _pct(scored, total),
            "in_pipeline":        pg["active_pipeline"],
            "won":                pg["won_count"],
            "active_contracts":   pg["won_count"],
            "hvt_count":          pg["hvt_count"],
            "overdue_followups":  int(overdue),
            "open_quotes":        int(open_q),
            "pipeline_value_gbp": pg["pipeline_value_gbp"],
            "avg_score":          pg["avg_score"],
            "total_raw_leads":    total,
            "classification_pct": "100%",
            "tasks_due_today":    int(tasks_today),
            "won_this_month":     int(won_month),
            "reply_rate":         _pct(replied, active_pipe),
            "manual_leads": 0, "archived_leads": 0, "website_enriched": 0,
        }
    except Exception as e:
        logger.error(f"analytics_summary error: {e}")
        return {
            "total_lead_records": 0, "scored": 0, "scoring_pct": "0%",
            "in_pipeline": 0, "won": 0, "active_contracts": 0, "hvt_count": 0,
            "overdue_followups": 0, "open_quotes": 0, "pipeline_value_gbp": 0,
            "avg_score": 0, "total_raw_leads": 0, "classification_pct": "0%",
            "tasks_due_today": 0, "won_this_month": 0, "reply_rate": "0%",
            "manual_leads": 0, "archived_leads": 0, "website_enriched": 0,
        }


@app.get("/api/analytics/market")
def analytics_market():
    try:
        with db_pg.transaction() as conn:
            by_borough = db_pg.analytics_by_borough(conn)
            by_sector  = db_pg.analytics_by_sector(conn)
        return {
            "by_borough": by_borough,
            "by_sector":  by_sector,
            "best_boroughs_to_visit": by_borough[:10],
        }
    except Exception as e:
        logger.error(f"analytics_market error: {e}")
        return {"by_borough": [], "by_sector": [], "best_boroughs_to_visit": []}


@app.get("/api/analytics/pipeline")
def analytics_pipeline():
    def _pct(n, d): return f"{round(n/d*100,1)}%" if d else "0%"
    try:
        with db_pg.transaction() as conn:
            stage_counts = db_pg.pipeline_stage_counts(conn)
            by_sector = db_pg.fetchall(conn, """
                SELECT e.sector, COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE o.current_stage='won') AS won,
                       COUNT(*) FILTER (WHERE o.current_stage IN ('quote_prepared','quote_sent')) AS quoted
                FROM opportunities o JOIN entities e ON e.id = o.entity_id
                GROUP BY e.sector ORDER BY won DESC
            """)
            by_borough = db_pg.fetchall(conn, """
                SELECT a.borough, COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE o.current_stage='won') AS won
                FROM opportunities o
                JOIN entities e ON e.id = o.entity_id
                LEFT JOIN LATERAL (SELECT address_id FROM entity_locations WHERE entity_id=e.id AND is_primary=TRUE ORDER BY id LIMIT 1) el ON TRUE
                LEFT JOIN addresses a ON a.id = el.address_id
                GROUP BY a.borough ORDER BY won DESC, total DESC
            """)
        funnel_dict = dict(stage_counts)
        active = sum(v for k,v in funnel_dict.items() if k not in ('won','lost','dormant'))
        won    = funnel_dict.get('won', 0)
        quoted = funnel_dict.get('quote_sent',0) + funnel_dict.get('quote_prepared',0)
        replied= funnel_dict.get('replied', 0)
        return {
            "funnel": {
                "funnel": funnel_dict,
                "reply_rate": _pct(replied, active),
                "quote_rate": _pct(quoted, active),
                "win_rate_from_quoted": _pct(won, quoted),
                "overall_win_rate": _pct(won, active),
            },
            "by_sector":  [dict(r) for r in by_sector],
            "by_borough": [dict(r) for r in by_borough],
            "by_channel": [],
        }
    except Exception as e:
        logger.error(f"analytics_pipeline error: {e}")
        return {"funnel": {"funnel": {}, "reply_rate": "0%", "quote_rate": "0%", "win_rate_from_quoted": "0%", "overall_win_rate": "0%"}, "by_sector": [], "by_borough": [], "by_channel": []}



# Urgency multipliers per signal type (higher = more time-sensitive)
_SIGNAL_URGENCY: dict[str, float] = {
    'public_procurement':           2.0,
    'move_signal':                  1.8,
    'compliance_signal':            1.6,
    'new_development':              1.5,
    'review_signal':                1.4,
    'expansion_signal':             1.3,
    'refurb_signal':                1.3,
    'regulated_healthcare_facility':1.2,
    'multi_site_signal':            1.2,
    'charity_venue':                1.0,
    'companies_house_match':        0.8,
}

# What to do when you see this signal
_SIGNAL_ACTIONS: dict[str, str] = {
    'public_procurement':           'Request tender pack immediately — time-sensitive bid',
    'move_signal':                  'New premises — no cleaning contract in place yet. Call today.',
    'compliance_signal':            'Compliance pressure creates buying urgency — call now',
    'new_development':              'Contact during fit-out — building not yet occupied, no cleaner contracted',
    'review_signal':                'Poor reviews = unhappy with current cleaner — pitch as the alternative',
    'expansion_signal':             'Expanding space — existing contract may not cover the new area',
    'refurb_signal':                'Post-refurbishment fresh start — good time to re-pitch all suppliers',
    'regulated_healthcare_facility':'CQC registered — hygiene is mandatory, not optional. Inspection due.',
    'multi_site_signal':            'Multiple sites — pitch a group contract for higher value',
    'charity_venue':                'Community venue — budget set in autumn, best to approach Oct–Nov',
    'companies_house_match':        'Verified active company — confirmed legitimate, safe to pursue',
}

def _urgency_score(signal_type: str, strength: int, detected_at, evidence: str = '') -> int:
    """Compute an uncapped urgency score for sorting the feed.
    Scores can exceed 100 — buckets use higher thresholds to differentiate.
    Typical ranges: public_procurement 200+, move 150+, CQC/multi_site 80–130,
    compliance ~60–85, companies_house 40–60.
    """
    import re as _re
    from datetime import timezone, date
    mult  = _SIGNAL_URGENCY.get(signal_type, 1.0)
    score = int(strength * mult)           # NO cap — let scores spread out
    # Recency bonus based on detected_at
    if detected_at:
        now = datetime.now(timezone.utc)
        if hasattr(detected_at, 'tzinfo') and detected_at.tzinfo is None:
            detected_at = detected_at.replace(tzinfo=timezone.utc)
        age_days = (now - detected_at).days
        if age_days <= 7:
            score += 25
        elif age_days <= 30:
            score += 10
    # Penalty for planning signals where the decision is old (building already occupied)
    if signal_type == 'new_development' and evidence:
        m = _re.search(r'decided (\d{4}-\d{2}-\d{2})', evidence)
        if m:
            try:
                decision_age = (date.today() - date.fromisoformat(m.group(1))).days
                if decision_age > 365:   score = max(0, score - 40)
                if decision_age > 730:   score = max(0, score - 60)
            except ValueError:
                pass
    return max(0, score)

def _urgency_bucket(score: int) -> str:
    # Thresholds match the uncapped score ranges above
    if score >= 140: return 'Act Today'    # PP tenders, move signals, very strong recent signals
    if score >= 90:  return 'This Week'    # CQC, multi-site, recent planning
    if score >= 55:  return 'This Month'   # compliance, charity, refurb
    return 'On Radar'                      # companies_house, old signals


@app.get("/api/signals")
def list_signals(signal_type: Optional[str] = None, limit: int = 500):
    """Notification-feed signals with urgency scoring and action guidance."""
    try:
        with db_pg.transaction() as conn:
            base_sql = """
                SELECT s.id, s.signal_type, s.strength, s.evidence, s.source,
                       s.detected_at,
                       e.id as entity_id, e.canonical_name, e.sector, e.entity_kind,
                       e.primary_website, e.primary_phone,
                       a.postcode, a.borough,
                       os.total_score, os.score_band, os.estimated_monthly_value_gbp,
                       os.next_best_action,
                       vl.place_id,
                       o.id as opportunity_id, o.current_stage
                FROM signals s
                JOIN entities e ON e.id = s.entity_id
                LEFT JOIN LATERAL (
                    SELECT addr.postcode, addr.borough
                    FROM entity_locations el JOIN addresses addr ON addr.id = el.address_id
                    WHERE el.entity_id = e.id AND el.is_primary = TRUE LIMIT 1
                ) a ON TRUE
                LEFT JOIN opportunity_scores os ON os.entity_id = e.id
                LEFT JOIN v_lead_board vl ON vl.entity_id = e.id
                LEFT JOIN opportunities o ON o.entity_id = e.id
                WHERE s.active = TRUE AND e.active = TRUE
            """
            _urgency_sql = """
                CAST(s.strength AS FLOAT) * CASE s.signal_type
                    WHEN 'public_procurement'            THEN 2.0
                    WHEN 'move_signal'                   THEN 1.8
                    WHEN 'compliance_signal'             THEN 1.6
                    WHEN 'new_development'               THEN 1.5
                    WHEN 'review_signal'                 THEN 1.4
                    WHEN 'expansion_signal'              THEN 1.3
                    WHEN 'refurb_signal'                 THEN 1.3
                    WHEN 'regulated_healthcare_facility' THEN 1.2
                    WHEN 'multi_site_signal'             THEN 1.2
                    WHEN 'charity_venue'                 THEN 1.0
                    WHEN 'companies_house_match'         THEN 0.8
                    ELSE 1.0 END
            """
            _per_type = 200
            if signal_type:
                rows = db_pg.fetchall(conn,
                    base_sql + f" AND s.signal_type = %s ORDER BY {_urgency_sql} DESC, s.detected_at DESC LIMIT %s",
                    (signal_type, limit))
            else:
                rows = db_pg.fetchall(conn,
                    f"""
                    WITH ranked AS (
                        SELECT s.id,
                               ROW_NUMBER() OVER (
                                   PARTITION BY s.signal_type
                                   ORDER BY {_urgency_sql} DESC, s.detected_at DESC
                               ) AS rn
                        FROM signals s WHERE s.active = TRUE
                    )
                    """ + base_sql.replace(
                        "WHERE s.active = TRUE AND e.active = TRUE",
                        "JOIN ranked r ON r.id = s.id WHERE r.rn <= %s AND e.active = TRUE"
                    ) + f" ORDER BY {_urgency_sql} DESC, s.detected_at DESC",
                    (_per_type,)
                )

            # Fallback: if signals view is empty (all signal flags = 0),
            # synthesise signals from leads with buying_signal_score > 0
            if not rows:
                rows = db_pg.fetchall(conn, """
                    SELECT
                        lr.id * 100          AS id,
                        CASE
                            WHEN lr.move_signal = 1      THEN 'move_signal'
                            WHEN lr.expansion_signal = 1 THEN 'expansion_signal'
                            WHEN lr.hiring_signal = 1    THEN 'hiring_signal'
                            WHEN lr.refurb_signal = 1    THEN 'refurb_signal'
                            WHEN lr.compliance_signal = 1 THEN 'compliance_signal'
                            WHEN lr.review_signal = 1    THEN 'review_signal'
                            WHEN lr.multi_site_signal = 1 THEN 'multi_site_signal'
                            ELSE 'expansion_signal'
                        END                  AS signal_type,
                        lr.buying_signal_score AS strength,
                        lr.trigger_summary   AS evidence,
                        'google_maps'        AS source,
                        lr.date_collected    AS detected_at,
                        lr.id                AS entity_id,
                        lr.business_name     AS canonical_name,
                        lr.normalized_sector AS sector,
                        'facility'           AS entity_kind,
                        lr.website           AS primary_website,
                        lr.phone             AS primary_phone,
                        lr.postcode,
                        lr.borough,
                        lr.priority_score    AS total_score,
                        CASE WHEN lr.priority_score >= 80 THEN 'A'
                             WHEN lr.priority_score >= 65 THEN 'B'
                             WHEN lr.priority_score >= 50 THEN 'C'
                             ELSE 'D' END    AS score_band,
                        1500                 AS estimated_monthly_value_gbp,
                        lr.next_best_action,
                        lr.place_id,
                        NULL::INTEGER        AS opportunity_id,
                        NULL::TEXT           AS current_stage
                    FROM lead_records lr
                    WHERE lr.buying_signal_score > 0
                      AND lr.archived_at IS NULL
                    ORDER BY lr.buying_signal_score DESC, lr.priority_score DESC
                    LIMIT %s
                """, (limit,))

        result = []
        for r in rows:
            d = dict(r)
            urgency = _urgency_score(r['signal_type'], r['strength'] or 50, r['detected_at'], r.get('evidence') or '')
            d['urgency_score']  = urgency
            d['urgency_bucket'] = _urgency_bucket(urgency)
            d['action']         = _SIGNAL_ACTIONS.get(r['signal_type'], 'Review and assess')
            # Frontend aliases
            d['entity_name'] = d.get('canonical_name') or 'Unknown'
            d['name'] = d['entity_name']
            d['title'] = d.get('evidence') or d.get('action') or 'Signal detected'
            d['description'] = d.get('action') or d.get('evidence') or ''
            d['created_at'] = d.get('detected_at')
            d['priority'] = d['urgency_bucket']
            d['score_impact'] = int((d.get('strength') or 0) * 0.1) if d.get('strength') else 0
            result.append(d)

        result.sort(key=lambda x: (-x['urgency_score'], str(x.get('detected_at') or '')), reverse=False)

        from collections import defaultdict as _dd
        _type_cap   = max(30, limit // 3)
        _type_count = _dd(int)
        diverse, overflow = [], []
        for s in result:
            if _type_count[s['signal_type']] < _type_cap:
                diverse.append(s)
                _type_count[s['signal_type']] += 1
            else:
                overflow.append(s)
        needed = limit - len(diverse)
        if needed > 0:
            diverse.extend(overflow[:needed])

        return diverse[:limit]
    except Exception as e:
        logger.error(f"list_signals error: {e}")
        return []


@app.get("/api/admin/status")
def admin_status():
    """Last run info per connector source."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT DISTINCT ON (source)
                    source, started_at, finished_at, record_count, notes
                FROM ingest_runs
                ORDER BY source, started_at DESC
            """)
            counts = db_pg.fetchall(conn, """
                SELECT source, COUNT(*) as total_signals
                FROM signals WHERE active = TRUE AND source IS NOT NULL
                GROUP BY source
            """)
            # Synthetic fallback: if ingest_runs is empty, synthesise from actual data
            if not rows:
                lead_count = db_pg.fetchval(conn, "SELECT COUNT(*) FROM lead_records") or 0
                signal_count = db_pg.fetchval(conn, "SELECT COUNT(*) FROM signals WHERE active=TRUE") or 0
                rows = [{"source": "google_maps", "started_at": None, "finished_at": None,
                         "record_count": lead_count, "notes": "Imported dataset"}]
                counts = [{"source": "google_maps", "total_signals": signal_count}]
        count_map = {r['source']: r['total_signals'] for r in counts}
        result = []
        for r in rows:
            d = dict(r)
            d['signal_count'] = count_map.get(r['source'], 0)
            d['running'] = (r['finished_at'] is None and r['started_at'] is not None)
            result.append(d)
        return result
    except Exception as e:
        logger.error(f"admin_status error: {e}")
        return []


@app.get("/api/analytics/signals")
def analytics_signals():
    with db_pg.transaction() as conn:
        breakdown = db_pg.fetchall(conn, """
            SELECT signal_type, COUNT(DISTINCT entity_id) AS entity_count,
                   ROUND(AVG(strength)::NUMERIC,1) AS avg_strength
            FROM signals WHERE active=TRUE GROUP BY signal_type ORDER BY entity_count DESC
        """)
        by_borough = db_pg.fetchall(conn, """
            SELECT a.borough, COUNT(DISTINCT s.entity_id) AS signal_count,
                   ROUND(AVG(os.total_score)::NUMERIC,1) AS avg_score
            FROM signals s
            JOIN opportunity_scores os ON os.entity_id=s.entity_id
            JOIN entity_locations el ON el.entity_id=s.entity_id AND el.is_primary=TRUE
            JOIN addresses a ON a.id=el.address_id
            WHERE s.active=TRUE GROUP BY a.borough ORDER BY signal_count DESC LIMIT 20
        """)
    return {
        "breakdown": [dict(r) for r in breakdown],
        "high_urgency_by_borough": [dict(r) for r in by_borough],
        "strong_triggers_by_sector": [],
    }


@app.get("/api/targets/weekly")
def targets_weekly():
    try:
        with db_pg.transaction() as conn:
            immediate = db_pg.fetchall(conn, """
                SELECT vl.* FROM v_lead_board vl
                LEFT JOIN opportunities o ON o.entity_id=vl.entity_id
                WHERE vl.active=TRUE AND o.id IS NULL AND vl.buyer_signal_score > 0
                ORDER BY vl.total_score DESC LIMIT 100
            """)
            strategic = db_pg.fetchall(conn, """
                SELECT vl.* FROM v_lead_board vl
                LEFT JOIN opportunities o ON o.entity_id=vl.entity_id
                WHERE vl.active=TRUE AND o.id IS NULL AND vl.multi_site_signal=TRUE
                ORDER BY vl.total_score DESC LIMIT 50
            """)
        return {
            "immediate": [dict(r) for r in immediate],
            "strategic":  [dict(r) for r in strategic],
            "visit": [], "regulated": [],
        }
    except Exception as e:
        logger.warning("targets_weekly: %s", e)
        return {"immediate": [], "strategic": [], "visit": [], "regulated": []}


@app.get("/api/analytics/revenue")
def analytics_revenue():
    try:
        with db_pg.transaction() as conn:
            won_val = db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(q.quote_value_gbp),0)
                FROM opportunities o JOIN quotes q ON q.opportunity_id=o.id
                WHERE o.current_stage='won'
            """) or 0
            sector_vals = db_pg.fetchall(conn, """
                SELECT e.sector,
                       COUNT(*) FILTER (WHERE o.current_stage='won') AS contracts,
                       AVG(os.estimated_monthly_value_gbp) AS avg_monthly_gbp,
                       SUM(os.estimated_monthly_value_gbp) FILTER (WHERE o.current_stage='won') AS total_monthly_gbp
                FROM entities e
                LEFT JOIN opportunities o ON o.entity_id=e.id
                LEFT JOIN opportunity_scores os ON os.entity_id=e.id
                WHERE e.active=TRUE GROUP BY e.sector ORDER BY total_monthly_gbp DESC NULLS LAST
            """)
        return {
            "summary": {"active_contracts": 0, "monthly_recurring": float(won_val), "annual_run_rate": float(won_val)*12},
            "by_sector": [dict(r) for r in sector_vals],
        }
    except Exception as e:
        logger.error(f"analytics_revenue error: {e}")
        return {"summary": {"active_contracts": 0, "monthly_recurring": 0, "annual_run_rate": 0}, "by_sector": []}


@app.get("/api/analytics/borough-drilldown")
def analytics_borough_drilldown(borough: str):
    """Full analytics slice for a single borough."""
    with db_pg.transaction() as conn:
        stats = db_pg.fetchone(conn, """
            SELECT
                COUNT(DISTINCT e.id)                                                      AS total_leads,
                ROUND(AVG(os.total_score)::NUMERIC, 1)                                   AS avg_score,
                COUNT(DISTINCT e.id) FILTER (WHERE e.hvt = TRUE)                         AS hvt_count,
                COALESCE(SUM(os.estimated_monthly_value_gbp), 0)                         AS total_monthly_potential_gbp,
                COUNT(DISTINCT o.id) FILTER (
                    WHERE o.current_stage NOT IN ('won','lost','dormant'))                AS in_pipeline,
                COUNT(DISTINCT o.id) FILTER (WHERE o.current_stage = 'won')              AS won_count,
                COUNT(DISTINCT s.entity_id) FILTER (WHERE s.active = TRUE)               AS signal_count
            FROM entities e
            JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
            JOIN addresses a ON a.id = el.address_id AND a.borough ILIKE %s
            LEFT JOIN opportunity_scores os ON os.entity_id = e.id
            LEFT JOIN opportunities o  ON o.entity_id  = e.id
            LEFT JOIN signals s        ON s.entity_id  = e.id
            WHERE e.active = TRUE
        """, (borough,))

        top_leads = db_pg.fetchall(conn, """
            SELECT
                e.id AS entity_id, e.canonical_name, e.sector, a.borough,
                os.total_score, os.score_band, os.estimated_monthly_value_gbp,
                CASE
                    WHEN EXISTS(SELECT 1 FROM signals WHERE entity_id=e.id
                                AND signal_type='public_procurement' AND active=TRUE) THEN 'Tender'
                    WHEN rp.call_now_flag = TRUE                                    THEN 'Renewal'
                    WHEN EXISTS(SELECT 1 FROM signals WHERE entity_id=e.id
                                AND signal_type='new_development' AND active=TRUE)  THEN 'Planning'
                    ELSE 'Score'
                END AS reason
            FROM entities e
            JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
            JOIN addresses a ON a.id = el.address_id AND a.borough ILIKE %s
            LEFT JOIN opportunity_scores os ON os.entity_id = e.id
            LEFT JOIN renewal_predictions rp ON rp.entity_id = e.id
            WHERE e.active = TRUE AND os.total_score IS NOT NULL
            ORDER BY os.total_score DESC
            LIMIT 15
        """, (borough,))

        sectors = db_pg.fetchall(conn, """
            SELECT
                e.sector,
                COUNT(*)                                                              AS lead_count,
                ROUND(AVG(os.total_score)::NUMERIC, 1)                               AS avg_score,
                SUM(os.estimated_monthly_value_gbp)                                  AS total_monthly_potential_gbp,
                ROUND(AVG(os.estimated_monthly_value_gbp)::NUMERIC, 0)               AS avg_monthly_gbp
            FROM entities e
            JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
            JOIN addresses a ON a.id = el.address_id AND a.borough ILIKE %s
            LEFT JOIN opportunity_scores os ON os.entity_id = e.id
            WHERE e.active = TRUE AND os.estimated_monthly_value_gbp IS NOT NULL
            GROUP BY e.sector
            ORDER BY total_monthly_potential_gbp DESC NULLS LAST
        """, (borough,))

        signal_breakdown = db_pg.fetchall(conn, """
            SELECT s.signal_type, COUNT(*) AS count
            FROM signals s
            JOIN entities e ON e.id = s.entity_id AND e.active = TRUE
            JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
            JOIN addresses a ON a.id = el.address_id AND a.borough ILIKE %s
            WHERE s.active = TRUE
            GROUP BY s.signal_type ORDER BY count DESC
        """, (borough,))

        tasks_today = db_pg.fetchval(conn, """
            SELECT COUNT(*) FROM daily_tasks dt
            JOIN entities e ON e.id = dt.entity_id AND e.active = TRUE
            JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
            JOIN addresses a ON a.id = el.address_id AND a.borough ILIKE %s
            WHERE dt.task_date = CURRENT_DATE AND dt.status = 'pending'
        """, (borough,)) or 0

    return {
        "borough":          borough,
        "stats":            dict(stats) if stats else {},
        "top_leads":        [dict(r) for r in top_leads],
        "sectors":          [dict(r) for r in sectors],
        "signal_breakdown": [dict(r) for r in signal_breakdown],
        "tasks_today":      int(tasks_today),
    }


@app.get("/api/analytics/top-opportunities")
def analytics_top_opportunities():
    """Top 100 leads ranked by score, signal strength, renewal proximity."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT
                    e.id as entity_id,
                    e.canonical_name,
                    e.sector,
                    a.borough,
                    os.total_score,
                    os.score_band,
                    os.estimated_monthly_value_gbp,
                    CASE
                        WHEN EXISTS(SELECT 1 FROM signals WHERE entity_id=e.id
                                    AND signal_type='public_procurement' AND active=TRUE) THEN 'Tender'
                        WHEN rp.call_now_flag = TRUE THEN 'Renewal'
                        WHEN EXISTS(SELECT 1 FROM signals WHERE entity_id=e.id
                                    AND signal_type='new_development' AND active=TRUE) THEN 'Planning'
                        ELSE 'Score'
                    END AS reason,
                    rp.days_until_renewal,
                    COALESCE(
                        (SELECT MAX(strength) FROM signals WHERE entity_id=e.id AND active=TRUE), 0
                    ) AS max_signal_strength
                FROM entities e
                LEFT JOIN opportunity_scores os ON os.entity_id = e.id
                LEFT JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
                LEFT JOIN addresses a ON a.id = el.address_id
                LEFT JOIN renewal_predictions rp ON rp.entity_id = e.id
                WHERE e.active = TRUE AND os.total_score IS NOT NULL
                ORDER BY
                    os.total_score DESC,
                    COALESCE((SELECT MAX(strength) FROM signals
                              WHERE entity_id=e.id AND active=TRUE), 0) DESC,
                    CASE WHEN rp.days_until_renewal IS NOT NULL
                         THEN rp.days_until_renewal ELSE 9999 END ASC
                LIMIT 100
            """)
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"analytics_top_opportunities error: {e}")
        return []


@app.get("/api/analytics/sector-revenue")
def analytics_sector_revenue():
    """Revenue potential by sector — sum of estimated monthly values, top 10."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT
                    e.sector,
                    COUNT(*) AS lead_count,
                    ROUND(AVG(os.total_score)::NUMERIC, 1) AS avg_score,
                    SUM(os.estimated_monthly_value_gbp) AS total_monthly_potential_gbp,
                    ROUND(AVG(os.estimated_monthly_value_gbp)::NUMERIC, 0) AS avg_monthly_gbp
                FROM entities e
                JOIN opportunity_scores os ON os.entity_id = e.id
                WHERE e.active = TRUE AND os.estimated_monthly_value_gbp IS NOT NULL
                GROUP BY e.sector
                ORDER BY total_monthly_potential_gbp DESC NULLS LAST
                LIMIT 10
            """)
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"analytics_sector_revenue error: {e}")
        return []


# ── Pipeline ──────────────────────────────────────────────────────────────────

@app.get("/api/pipeline")
def list_pipeline(status: Optional[str] = None):
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn,
                "SELECT * FROM v_pipeline_board" +
                (" WHERE current_stage = %s" if status else "") +
                " ORDER BY total_score DESC",
                (status,) if status else ()
            )
        result = []
        for r in rows:
            d = dict(r)
            # Normalise field names for frontend compatibility
            d['name'] = d.get('business_name') or d.get('title') or 'Unknown'
            d['company_name'] = d['name']
            d['stage'] = d.get('current_stage') or 'new'
            d['value'] = d.get('quote_value_gbp') or d.get('estimated_monthly_value_gbp') or 0
            d['updated_at'] = d.get('last_touched_at')
            d['id'] = d.get('entity_id') or d.get('opportunity_id')
            score = d.get('total_score') or d.get('priority_score') or 0
            signals = d.get('signals') or []
            has_tender = ('public_procurement' in signals) if isinstance(signals, list) else False
            if score >= 80 or has_tender:
                d['pipeline_heat'] = 'hot'
            elif score >= 65:
                d['pipeline_heat'] = 'warm'
            else:
                d['pipeline_heat'] = 'cold'
            result.append(d)
        heat_order = {'hot': 0, 'warm': 1, 'cold': 2}
        result.sort(key=lambda x: (heat_order.get(x['pipeline_heat'], 3), -(x.get('total_score') or 0)))
        return result
    except Exception as exc:
        logger.error("list_pipeline error: %s", exc)
        return []


@app.get("/api/pipeline/today")
def pipeline_today():
    data = pl.get_todays_actions()
    # Convert sqlite3.Row objects to dicts
    return {
        k: [dict(r) for r in v] if isinstance(v, list) else v
        for k, v in data.items()
    }


class AdvanceBody(BaseModel):
    new_status: str
    contact_channel: Optional[str] = None
    notes: Optional[str] = None
    follow_up_days: int = 5


@app.post("/api/pipeline/{place_id}/advance")
def advance_pipeline(place_id: str, body: AdvanceBody):
    with db_pg.transaction() as conn:
        # Resolve opportunity_id from place_id (Google Maps ID) or entity_id
        row = db_pg.fetchone(conn,
            """SELECT o.id AS opp_id FROM opportunities o
               JOIN entity_source_links esl ON esl.entity_id = o.entity_id
                    AND esl.source = 'google_maps' AND esl.source_record_id = %s
               LIMIT 1""",
            (place_id,)
        )
        if not row:
            # Try treating place_id as entity_id
            row = db_pg.fetchone(conn,
                "SELECT id AS opp_id FROM opportunities WHERE entity_id = %s LIMIT 1",
                (place_id,)
            )
        if not row:
            raise HTTPException(status_code=404, detail="Pipeline entry not found")
        opp_id = row['opp_id']
        try:
            db_pg.advance_opportunity(conn, opp_id, body.new_status)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if body.notes:
            db_pg.log_activity(conn, activity_type='note', opportunity_id=opp_id,
                               body=body.notes)

        # ── AUTO-GENERATE QUOTE when advancing to quote_prepared ──────
        quote_generated = None
        if body.new_status == 'quote_prepared':
            try:
                opp = db_pg.fetchone(conn, """
                    SELECT o.entity_id, e.canonical_name, e.sector, e.primary_phone, e.primary_email,
                           a.line1 as address, a.borough, a.postcode,
                           os.total_score, os.estimated_monthly_value_gbp
                    FROM opportunities o
                    JOIN entities e ON e.id = o.entity_id
                    LEFT JOIN entity_locations el ON el.entity_id = o.entity_id AND el.is_primary = TRUE
                    LEFT JOIN addresses a ON a.id = el.address_id
                    LEFT JOIN opportunity_scores os ON os.entity_id = o.entity_id
                    WHERE o.id = %s
                """, (opp_id,))
                if opp:
                    biz = opp.get('canonical_name') or 'Lead'
                    sector = opp.get('sector') or 'other'
                    postcode = opp.get('postcode') or ''
                    borough = opp.get('borough') or ''
                    entity_id = opp['entity_id']

                    # Estimate hours/rate from sector
                    sector_config = {
                        'healthcare': (20, 22.00), 'education': (15, 17.50), 'offices': (15, 18.50),
                        'office': (15, 18.50), 'gym': (12, 19.00), 'gym_leisure': (12, 19.00),
                        'industrial': (20, 20.00), 'industrial_warehouse': (20, 20.00),
                        'hospitality': (18, 19.50), 'retail': (10, 17.00), 'residential': (8, 16.50),
                    }
                    est_hours, est_rate = sector_config.get(sector.lower().replace(' ', '_').replace('-', '_'), (15, 18.50))
                    est_days = 5 if est_hours >= 20 else 3 if est_hours >= 10 else 2
                    llw_rate = 13.85
                    on_costs_pct = 36
                    supplies = 150

                    monthly_hrs = est_hours * (est_days / 5) * 4.33
                    labour = monthly_hrs * llw_rate * (1 + on_costs_pct / 100)
                    total_cost = labour + supplies
                    revenue = monthly_hrs * est_rate
                    margin = ((revenue - total_cost) / revenue * 100) if revenue > 0 else 0
                    risk = 'critical' if margin < 10 else 'warning' if margin < 20 else ''

                    # Intelligence
                    intel_notes = []
                    try:
                        from services.intelligence_engine import quote_intelligence, compute_feasibility_score
                        if postcode:
                            qi = quote_intelligence('', postcode, sector, est_hours, revenue)
                            if qi.get('benchmark'):
                                intel_notes.append(f"Sector avg margin: {qi['benchmark'].get('avg_margin', '?')}%")
                                if qi['benchmark'].get('note'):
                                    intel_notes.append(qi['benchmark']['note'])
                            fs = compute_feasibility_score(postcode, est_hours, sector)
                            if fs.get('score') is not None:
                                intel_notes.append(f"Feasibility: {fs['score']}/100")
                                for w in (fs.get('warnings') or []):
                                    intel_notes.append(w)
                    except Exception:
                        pass
                    cleaner_matches = []
                    try:
                        from services.cleaner_matcher import match_cleaners
                        if postcode:
                            cm = match_cleaners(postcode, est_hours, sector, limit=5)
                            cleaner_matches = cm.get('matches', [])
                            if cleaner_matches:
                                intel_notes.append(f"\nRecommended Cleaners (by proximity to {postcode}):")
                                for i, c in enumerate(cleaner_matches[:5], 1):
                                    dist = f"{c['distance']:.1f} mi" if isinstance(c.get('distance'), (int, float)) else c.get('distance', '?')
                                    travel = f"{c.get('travel_time', '?')} min"
                                    rate = f"£{float(c.get('pay_rate', 0)):.2f}/hr" if c.get('pay_rate') else '—'
                                    quality = c.get('match_quality', '').upper()
                                    avail = '✓ Available' if c.get('available', True) else '✗ Busy'
                                    hrs_cur = c.get('current_hours', 0) or 0
                                    hrs_max = c.get('max_hours', 40) or 40
                                    capacity = f"{hrs_cur}/{hrs_max}h used"
                                    best = ' ★ BEST MATCH' if i == 1 else ''
                                    intel_notes.append(
                                        f"  {i}. {c.get('name', 'Unknown')} — {dist}, {travel} | {rate} | {avail} | {capacity} | {quality}{best}"
                                    )
                    except Exception:
                        pass

                    # Build 3 scenarios
                    scenarios = []
                    for label, target in [('Aggressive', 15), ('Balanced', 25), ('Protected', 35)]:
                        sc_price = total_cost / (1 - target / 100) if target < 100 else total_cost
                        sc_margin = ((sc_price - total_cost) / sc_price * 100) if sc_price > 0 else 0
                        scenarios.append(f"{label}: £{sc_price:,.0f}/mo ({sc_margin:.1f}% margin)")

                    quote_notes = f"AUTO-GENERATED when pipeline reached Quote Prepared.\n"
                    quote_notes += f"Sector: {sector} | Borough: {borough} | Postcode: {postcode}\n"
                    if scenarios:
                        quote_notes += f"\nPricing Scenarios:\n" + "\n".join(f"• {s}" for s in scenarios)
                    if intel_notes:
                        quote_notes += f"\n\nAI Recommendations:\n" + "\n".join(f"• {n}" for n in intel_notes)

                    qrow = db_pg.fetchone(conn, """
                        INSERT INTO quotes (
                            opportunity_id, entity_id, title, client_name, site_address, site_postcode,
                            sector, mode, hours_per_week, days_per_week,
                            client_rate, llw_rate, on_costs_pct, supplies_month,
                            monthly_revenue, monthly_cost, monthly_value, margin_pct,
                            scenario, risk_flag, notes, quote_value_gbp, status,
                            quote_date, valid_until, created_at, updated_at
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s, %s, 'draft',
                            CURRENT_DATE, CURRENT_DATE + 30, NOW(), NOW()
                        ) RETURNING id
                    """, (
                        opp_id, entity_id, f"Quote — {biz}", biz,
                        opp.get('address') or '', postcode,
                        sector, 'hourly', est_hours, est_days,
                        est_rate, llw_rate, on_costs_pct, supplies,
                        round(revenue, 2), round(total_cost, 2), round(revenue, 2), round(margin, 1),
                        'balanced', risk, quote_notes, round(revenue, 2),
                    ))
                    if qrow:
                        quote_generated = qrow['id'] if isinstance(qrow, dict) else qrow[0]
                        logger.info("advance_pipeline: auto-quote %s for opp %s (margin %.1f%%)", quote_generated, opp_id, margin)
            except Exception as qe:
                logger.warning("advance_pipeline: auto-quote failed — %s", qe)

        # ── AUTO-ASSIGN BEST CLEANER when advancing to won ──────────
        recommended_cleaner = None
        if body.new_status == 'won':
            try:
                opp_won = db_pg.fetchone(conn, """
                    SELECT o.entity_id, e.canonical_name, e.sector,
                           a.postcode, a.borough, a.line1 as address
                    FROM opportunities o
                    JOIN entities e ON e.id = o.entity_id
                    LEFT JOIN entity_locations el ON el.entity_id = o.entity_id AND el.is_primary = TRUE
                    LEFT JOIN addresses a ON a.id = el.address_id
                    WHERE o.id = %s
                """, (opp_id,))
                if opp_won and opp_won.get('postcode'):
                    from services.cleaner_matcher import match_cleaners
                    cm = match_cleaners(opp_won['postcode'], 15, opp_won.get('sector', ''), limit=5)
                    matches = cm.get('matches', [])
                    if matches:
                        best = matches[0]
                        recommended_cleaner = {
                            'id': best.get('id'),
                            'name': best.get('name'),
                            'distance': best.get('distance'),
                            'travel_time': best.get('travel_time'),
                            'match_quality': best.get('match_quality'),
                            'pay_rate': best.get('pay_rate'),
                        }
                        # Log recommendation as activity
                        all_names = ', '.join(f"{m.get('name','?')} ({m.get('distance','?')} mi)" for m in matches[:3])
                        db_pg.execute(conn, """
                            INSERT INTO activity_log (entity_id, activity_type, actor, subject, body)
                            VALUES (%s, 'note', 'system', %s, %s)
                        """, (
                            opp_won['entity_id'],
                            f"Cleaner recommendation for won contract",
                            f"Best match: {best.get('name', '?')} — {best.get('distance', '?')} mi from {opp_won['postcode']}\n"
                            f"Travel: {best.get('travel_time', '?')} min | Rate: £{float(best.get('pay_rate', 0)):.2f}/hr | "
                            f"Quality: {best.get('match_quality', '?')}\n\n"
                            f"All candidates: {all_names}"
                        ))
                        logger.info("advance_pipeline: won — recommended cleaner %s for opp %s", best.get('name'), opp_id)
            except Exception as ce:
                logger.warning("advance_pipeline: cleaner recommendation failed — %s", ce)

    return {"ok": True, "quote_generated": quote_generated, "recommended_cleaner": recommended_cleaner}


class ShortlistBody(BaseModel):
    limit: int = 100
    min_score: int = 60


@app.post("/api/pipeline/shortlist")
def shortlist(body: ShortlistBody):
    """Add top 25 leads to pipeline using improved multi-factor algorithm:
    score > 70, sector priority, borough density, not contacted recently."""
    SECTOR_PRIORITY = {
        'healthcare': 1, 'education': 1, 'offices': 1, 'office': 1,
        'hospitality': 2, 'gyms': 2, 'gym_leisure': 2, 'public_sector': 2,
        'industrial': 3, 'industrial_warehouse': 3, 'retail': 3,
        'residential_blocks': 4, 'residential_block': 4,
        'charity': 4, 'property_management': 4, 'other': 5,
    }
    with db_pg.transaction() as conn:
        candidates = db_pg.fetchall(conn, """
            SELECT os.entity_id, e.canonical_name, e.sector,
                   os.total_score, os.estimated_monthly_value_gbp, a.borough
            FROM opportunity_scores os
            JOIN entities e ON e.id = os.entity_id AND e.active = TRUE
            LEFT JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
            LEFT JOIN addresses a ON a.id = el.address_id
            LEFT JOIN opportunities o ON o.entity_id = os.entity_id
            WHERE o.id IS NULL
              AND os.total_score > 70
              AND NOT EXISTS (
                  SELECT 1 FROM outreach_activities oa
                  WHERE oa.entity_id = os.entity_id
                    AND oa.logged_at > NOW() - INTERVAL '30 days'
              )
            ORDER BY os.total_score DESC
            LIMIT 200
        """)
        # Borough density — weight boroughs with most high-scoring leads
        borough_counts = db_pg.fetchall(conn, """
            SELECT a.borough, COUNT(*) AS cnt
            FROM entities e
            JOIN opportunity_scores os ON os.entity_id = e.id
            JOIN entity_locations el ON el.entity_id = e.id AND el.is_primary = TRUE
            JOIN addresses a ON a.id = el.address_id
            WHERE e.active = TRUE AND os.total_score > 65
            GROUP BY a.borough ORDER BY cnt DESC
        """)
        borough_rank = {r['borough']: i for i, r in enumerate(borough_counts)}

        def rank_key(row):
            score   = row['total_score'] or 0
            tier    = SECTOR_PRIORITY.get((row['sector'] or 'other').lower().replace(' ', '_').replace('-', '_'), 5)
            brank   = borough_rank.get(row['borough'], 50)
            value   = row['estimated_monthly_value_gbp'] or 0
            return (-score, tier, brank, -value)

        top25 = sorted(candidates, key=rank_key)[:25]
        added = 0
        for row in top25:
            eid   = row['entity_id']
            title = f"Commercial cleaning — {row['canonical_name']}"
            opp_id = db_pg.create_opportunity(conn, eid, current_stage='new', title=title)
            db_pg.execute(conn,
                "INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, actor) "
                "VALUES (%s, NULL, 'new', 'shortlist')",
                (opp_id,)
            )
            added += 1
    return {"added": added, "algorithm": "score>70 + sector_priority + borough_density + not_contacted_30d"}


# ── Outreach ──────────────────────────────────────────────────────────────────

def _pg_get_outreach(place_id: str):
    """Fetch outreach package from PostgreSQL by place_id."""
    with db_pg.transaction() as conn:
        return db_pg.fetchone(conn, """
            SELECT * FROM outreach_packages WHERE place_id = %s
            ORDER BY updated_at DESC LIMIT 1
        """, (place_id,))

def _pg_get_lead_for_outreach(place_id: str):
    """Fetch all fields needed to generate an outreach pack from PG."""
    with db_pg.transaction() as conn:
        return db_pg.fetchone(conn, """
            SELECT
                pb.place_id,
                pb.business_name,
                pb.sector,
                pb.normalized_sector,
                pb.borough,
                pb.total_score      AS priority_score,
                pb.website,
                pb.phone,
                e.primary_email,
                e.id                AS entity_id,
                c.full_name         AS contact_name,
                c.job_title         AS contact_role
            FROM v_pipeline_board pb
            JOIN entities e ON e.id = pb.entity_id
            LEFT JOIN contacts c ON c.entity_id = e.id AND c.is_primary = TRUE
            WHERE pb.place_id = %s
            LIMIT 1
        """, (place_id,))

def _pg_save_outreach(entity_id, place_id: str, pkg: dict):
    """Upsert outreach package into PostgreSQL."""
    with db_pg.transaction() as conn:
        if place_id:
            existing = db_pg.fetchone(conn, "SELECT id FROM outreach_packages WHERE place_id = %s", (place_id,))
        elif entity_id:
            existing = db_pg.fetchone(conn, "SELECT id FROM outreach_packages WHERE entity_id = %s", (entity_id,))
        else:
            existing = None

        if existing:
            where_col = "place_id" if place_id else "entity_id"
            where_val = place_id if place_id else entity_id
            db_pg.execute(conn, f"""
                UPDATE outreach_packages
                   SET cold_email=%s, call_opener=%s, full_call_script=%s,
                       linkedin_intro=%s, follow_up_email=%s, site_visit_brief=%s,
                       model_used=%s, entity_id=COALESCE(entity_id,%s),
                       updated_at=NOW()
                 WHERE {where_col}=%s
            """, (pkg.get('cold_email'), pkg.get('call_opener'), pkg.get('full_call_script'),
                  pkg.get('linkedin_intro'), pkg.get('follow_up_email'), pkg.get('site_visit_brief'),
                  pkg.get('model_used'), entity_id,
                  where_val))
        else:
            db_pg.execute(conn, """
                INSERT INTO outreach_packages
                    (entity_id, place_id, cold_email, call_opener, full_call_script,
                     linkedin_intro, follow_up_email, site_visit_brief, model_used)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (entity_id, place_id, pkg.get('cold_email'), pkg.get('call_opener'),
                  pkg.get('full_call_script'), pkg.get('linkedin_intro'),
                  pkg.get('follow_up_email'), pkg.get('site_visit_brief'),
                  pkg.get('model_used')))


@app.get("/api/outreach/{place_id}")
def get_outreach(place_id: str):
    row = _pg_get_outreach(place_id)
    if not row:
        return None
    return dict(row)


@app.post("/api/outreach/{place_id}/generate")
def generate_outreach_endpoint(place_id: str, force: bool = False):
    from ai_client import call_ai
    from ai_prompts import SYSTEM_OUTREACH, build_outreach_prompt

    # Return cached if exists and not forced
    if not force:
        cached = _pg_get_outreach(place_id)
        if cached:
            return dict(cached)

    # Fetch lead data from PG
    row = _pg_get_lead_for_outreach(place_id)
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")

    row = dict(row)
    entity_id = row.get('entity_id')

    prompt = build_outreach_prompt(
        business_name   = row.get("business_name", ""),
        sector          = row.get("normalized_sector") or row.get("sector", ""),
        borough         = row.get("borough", ""),
        business_type   = row.get("normalized_sector") or row.get("sector", ""),
        decision_maker  = row.get("contact_role") or "Facilities Manager",
        score           = row.get("priority_score", 0),
        website_summary = row.get("website"),
        pain_points     = None,
    )

    try:
        response = call_ai(
            system_prompt = SYSTEM_OUTREACH,
            user_prompt   = prompt,
            prompt_type   = "outreach",
            max_tokens    = 1400,
        )
        data = response.as_json()
        if not data:
            raise HTTPException(status_code=500, detail="AI response could not be parsed")
        model_used = response.model
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Outreach generation failed: {e}")

    pkg = {
        "cold_email":       data.get("cold_email", ""),
        "call_opener":      data.get("call_opener", ""),
        "linkedin_intro":   data.get("linkedin_intro", ""),
        "follow_up_email":  data.get("follow_up_email", ""),
        "site_visit_brief": data.get("site_visit_brief", ""),
        "model_used":       model_used,
    }
    _pg_save_outreach(entity_id, place_id, pkg)

    return {"place_id": place_id, **pkg}


@app.post("/api/leads/{place_id}/send-email")
def send_email_endpoint(place_id: str):
    """
    Fully automated email send for a single lead.
    1. Pulls lead + outreach package from DB
    2. Pushes to GAS via outreach.handoff (GAS sends + tracks)
    3. Logs activity locally
    """
    from crm_sync import _push_one

    # Fetch lead from normalized schema
    with db_pg.transaction() as conn:
        lead = db_pg.fetchone(conn, """
            SELECT lr.id, lr.place_id, lr.business_name, lr.normalized_sector,
                   lr.borough, lr.address, lr.postcode, lr.phone, lr.email,
                   lr.contact_name, lr.priority_score, lr.ai_decision_maker_type,
                   lr.trigger_summary, lr.recommended_offer, lr.buying_signal_types,
                   lr.pipeline_status, op.cold_email, op.follow_up_email
            FROM lead_records lr
            LEFT JOIN outreach_packages op ON lr.place_id = op.place_id
            WHERE lr.place_id = %s
            LIMIT 1
        """, (place_id,))

    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    lead = dict(lead)
    email = (lead.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="No email address for this lead")

    if not lead.get("cold_email"):
        raise HTTPException(status_code=400, detail="No outreach package — generate outreach first")

    # Email deliverability guard — validate before sending
    try:
        from email_guard import pre_send_check
        allowed, reason = pre_send_check(email, place_id=place_id)
        if not allowed:
            raise HTTPException(status_code=422, detail=f"Email blocked: {reason}")
    except ImportError:
        pass

    # Push to GAS (GAS handles the actual send)
    outcome, error = _push_one(lead, force=False)

    if outcome == "error":
        raise HTTPException(status_code=500, detail=f"Send failed: {error}")

    # Log activity + update opportunity stage (not the view)
    with db_pg.transaction() as conn:
        # Find entity_id for this place_id
        entity_id = db_pg.fetchval(conn, """
            SELECT e.id FROM entities e
            JOIN entity_source_links esl ON esl.entity_id = e.id
            WHERE esl.source_record_id = %s LIMIT 1
        """, (place_id,))

        if entity_id:
            db_pg.execute(conn, """
                INSERT INTO activity_log (entity_id, activity_type, actor, subject, body)
                VALUES (%s, 'email', 'system', %s, %s)
            """, (entity_id, f"Cold email sent to {email}",
                  "Sent via AskMiro OS autopilot"))

            db_pg.execute(conn, """
                UPDATE opportunities SET current_stage = 'contacted'::pipeline_stage,
                    updated_at = NOW(), last_touched_at = NOW()
                WHERE entity_id = %s
            """, (entity_id,))

    return {"status": "sent", "email": email, "outcome": outcome}


# ── Entity-id-based outreach (for leads without a place_id) ──────────────────

def _pg_get_outreach_by_entity(entity_id: int):
    """Fetch outreach package by entity_id, falling back to place_id via entity_source_links."""
    with db_pg.transaction() as conn:
        # Try direct entity_id match first
        row = db_pg.fetchone(conn, """
            SELECT * FROM outreach_packages WHERE entity_id = %s
            ORDER BY updated_at DESC LIMIT 1
        """, (entity_id,))
        if row:
            return row
        # Fallback: find via place_id through entity_source_links
        return db_pg.fetchone(conn, """
            SELECT op.* FROM outreach_packages op
            JOIN entity_source_links esl ON esl.source_record_id = op.place_id
            WHERE esl.entity_id = %s
            ORDER BY op.updated_at DESC LIMIT 1
        """, (entity_id,))


def _pg_get_lead_for_outreach_by_entity(entity_id: int):
    """Fetch outreach fields for an entity by entity_id, including supply-list intelligence."""
    with db_pg.transaction() as conn:
        return db_pg.fetchone(conn, """
            SELECT
                e.id AS entity_id,
                e.canonical_name AS business_name,
                e.sector,
                e.sector AS normalized_sector,
                e.primary_website AS website,
                e.primary_phone AS phone,
                a.borough,
                os.total_score AS priority_score,
                c.full_name AS contact_name,
                c.job_title AS contact_role,
                csl.company_type,
                csl.contract_access,
                csl.priority_reason,
                csl.comp_strength,
                csl.comp_weakness,
                csl.comp_beat
            FROM entities e
            LEFT JOIN LATERAL (
                SELECT addr.borough FROM entity_locations el
                JOIN addresses addr ON addr.id = el.address_id
                WHERE el.entity_id = e.id AND el.is_primary = TRUE LIMIT 1
            ) a ON TRUE
            LEFT JOIN opportunity_scores os ON os.entity_id = e.id
            LEFT JOIN contacts c ON c.entity_id = e.id AND c.is_primary = TRUE
            LEFT JOIN LATERAL (
                SELECT company_type, contract_access, priority_reason,
                       comp_strength, comp_weakness, comp_beat
                FROM council_supply_lists
                WHERE entity_id = e.id
                ORDER BY priority_score DESC LIMIT 1
            ) csl ON TRUE
            WHERE e.id = %s
        """, (entity_id,))


@app.get("/api/outreach/entity/{entity_id}")
def get_outreach_by_entity(entity_id: int):
    row = _pg_get_outreach_by_entity(entity_id)
    if not row:
        return None
    return dict(row)


@app.post("/api/outreach/entity/{entity_id}/generate")
def generate_outreach_by_entity(entity_id: int, force: bool = False):
    from ai_client import call_ai
    from ai_prompts import SYSTEM_OUTREACH, build_outreach_prompt

    if not force:
        cached = _pg_get_outreach_by_entity(entity_id)
        if cached:
            return dict(cached)

    row = _pg_get_lead_for_outreach_by_entity(entity_id)
    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    row = dict(row)
    prompt = build_outreach_prompt(
        business_name   = row.get("business_name", ""),
        sector          = row.get("normalized_sector") or row.get("sector", ""),
        borough         = row.get("borough", ""),
        business_type   = row.get("normalized_sector") or row.get("sector", ""),
        decision_maker  = row.get("contact_role") or "Facilities Manager",
        score           = row.get("priority_score", 0),
        website_summary = row.get("website"),
        pain_points     = row.get("priority_reason"),
        company_type    = row.get("company_type"),
        contract_access = row.get("contract_access"),
    )

    try:
        response = call_ai(
            system_prompt = SYSTEM_OUTREACH,
            user_prompt   = prompt,
            prompt_type   = "outreach",
            max_tokens    = 1400,
        )
        data = response.as_json()
        if not data:
            raise HTTPException(status_code=500, detail="AI response could not be parsed")
        model_used = response.model
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Outreach generation failed: {e}")

    pkg = {
        "cold_email":       data.get("cold_email", ""),
        "call_opener":      data.get("call_opener", ""),
        "linkedin_intro":   data.get("linkedin_intro", ""),
        "follow_up_email":  data.get("follow_up_email", ""),
        "site_visit_brief": data.get("site_visit_brief", ""),
        "model_used":       model_used,
    }
    _pg_save_outreach(entity_id, None, pkg)
    return {"entity_id": entity_id, **pkg}


# ── Borough Intelligence Endpoints ───────────────────────────────────────────

def _sector_to_company_type(sector: str) -> str:
    """Map normalized_sector → company_type label for Boroughs UI."""
    if not sector:
        return 'Direct Client'
    s = sector.lower()
    if any(k in s for k in ('property', 'estate', 'lettings', 'residential', 'block')):
        return 'Managing Agent'
    if any(k in s for k in ('construct', 'developer', 'housebuilder', 'build')):
        return 'Main Contractor / Developer'
    if any(k in s for k in ('facility', 'facilities', 'fm', 'maintenance')):
        return 'Facilities Management Company'
    return 'Direct Client'


@app.get("/api/boroughs")
def get_boroughs():
    """Return all boroughs with opportunity density counts from lead_records."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT
                    borough,
                    COUNT(*)                                                           AS total,
                    SUM(CASE WHEN normalized_sector ILIKE '%%property%%'
                              OR normalized_sector ILIKE '%%estate%%'
                              OR normalized_sector ILIKE '%%lettings%%'
                              OR normalized_sector ILIKE '%%residential%%'
                             THEN 1 ELSE 0 END)                                        AS agents,
                    SUM(CASE WHEN normalized_sector ILIKE '%%construct%%'
                              OR normalized_sector ILIKE '%%developer%%'
                              OR normalized_sector ILIKE '%%build%%'
                             THEN 1 ELSE 0 END)                                        AS developers,
                    SUM(CASE WHEN normalized_sector ILIKE '%%facilit%%'
                              OR normalized_sector ILIKE '%%maintenance%%'
                             THEN 1 ELSE 0 END)                                        AS fm,
                    SUM(CASE WHEN high_value_target = 1 THEN 1 ELSE 0 END)            AS high_value,
                    0                                                                   AS competitors,
                    SUM(CASE WHEN priority_score >= 80 THEN 1 ELSE 0 END)             AS score5,
                    SUM(CASE WHEN pipeline_status <> 'raw' THEN 1 ELSE 0 END)         AS pipeline
                FROM lead_records
                WHERE borough IS NOT NULL AND borough <> '' AND archived_at IS NULL
                GROUP BY borough
                ORDER BY high_value DESC, total DESC
            """)
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_boroughs error: {e}")
        return []


@app.get("/api/boroughs/{borough}/targets")
def get_borough_targets(
    borough: str,
    company_type: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
):
    """Return ranked targets for a specific borough from lead_records."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT
                    lr.id               AS entity_id,
                    lr.business_name    AS canonical_name,
                    lr.normalized_sector AS sector,
                    lr.email,
                    lr.phone,
                    lr.website,
                    lr.contact_name,
                    lr.priority_score   AS askmiro_score,
                    lr.score_reason     AS priority_reason,
                    lr.next_best_action,
                    lr.high_value_target AS pipeline_target,
                    'google_maps'       AS list_source,
                    NULL                AS contract_access,
                    NULL                AS council_name,
                    NULL                AS contract_title,
                    NULL                AS contract_value,
                    NULL                AS comp_beat,
                    CASE
                        WHEN lr.priority_score >= 80 THEN 5
                        WHEN lr.priority_score >= 65 THEN 4
                        WHEN lr.priority_score >= 50 THEN 3
                        WHEN lr.priority_score >= 35 THEN 2
                        ELSE 1
                    END                 AS priority_score,
                    CASE
                        WHEN lr.normalized_sector ILIKE '%%property%%'
                          OR lr.normalized_sector ILIKE '%%estate%%'
                          OR lr.normalized_sector ILIKE '%%lettings%%'
                             THEN 'Managing Agent'
                        WHEN lr.normalized_sector ILIKE '%%construct%%'
                          OR lr.normalized_sector ILIKE '%%developer%%'
                          OR lr.normalized_sector ILIKE '%%build%%'
                             THEN 'Main Contractor / Developer'
                        WHEN lr.normalized_sector ILIKE '%%facilit%%'
                          OR lr.normalized_sector ILIKE '%%maintenance%%'
                             THEN 'Facilities Management Company'
                        ELSE 'Direct Client'
                    END                 AS company_type,
                    CASE
                        WHEN lr.priority_score >= 80 THEN 'A'
                        WHEN lr.priority_score >= 65 THEN 'B'
                        WHEN lr.priority_score >= 50 THEN 'C'
                        ELSE 'D'
                    END                 AS score_band
                FROM lead_records lr
                WHERE lr.borough ILIKE %s
                  AND lr.archived_at IS NULL
                ORDER BY lr.priority_score DESC, lr.high_value_target DESC
                LIMIT %s
            """, (borough, limit))
        result = [dict(r) for r in rows]
        # Apply company_type filter in Python if requested
        if company_type:
            result = [r for r in result if r['company_type'] == company_type]
        return result
    except Exception as e:
        logger.error(f"get_borough_targets error: {e}")
        return []


@app.get("/api/boroughs/{borough}/summary")
def get_borough_summary(borough: str):
    """Return counts by company_type for a borough."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT
                    CASE
                        WHEN normalized_sector ILIKE '%%property%%'
                          OR normalized_sector ILIKE '%%estate%%'
                          OR normalized_sector ILIKE '%%lettings%%'
                             THEN 'Managing Agent'
                        WHEN normalized_sector ILIKE '%%construct%%'
                          OR normalized_sector ILIKE '%%developer%%'
                          OR normalized_sector ILIKE '%%build%%'
                             THEN 'Main Contractor / Developer'
                        WHEN normalized_sector ILIKE '%%facilit%%'
                          OR normalized_sector ILIKE '%%maintenance%%'
                             THEN 'Facilities Management Company'
                        ELSE 'Direct Client'
                    END AS company_type,
                    COUNT(*) AS count
                FROM lead_records
                WHERE borough ILIKE %s AND archived_at IS NULL
                GROUP BY 1
                ORDER BY count DESC
            """, (borough,))
        return {r['company_type']: int(r['count']) for r in rows}
    except Exception as e:
        logger.error(f"get_borough_summary error: {e}")
        return {}


# ── Mail Merge Excel Export ───────────────────────────────────────────────────

@app.get("/api/export/mail-merge")
def export_mail_merge(
    limit:     int           = Query(20, ge=1, le=50),
    min_score: int           = Query(70, ge=0, le=100),
    sector:    Optional[str] = None,
    borough:   Optional[str] = None,
):
    """Generate and download an Excel mail merge file of the top leads."""
    from export_mail_merge import run_mail_merge_export

    out_dir  = Path(__file__).resolve().parent / "exports"
    out_dir.mkdir(exist_ok=True)
    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = out_dir / f"askmiro_mail_merge_{date_str}.xlsx"

    out_file, exported, _generated = run_mail_merge_export(
        limit     = limit,
        min_score = min_score,
        sector    = sector,
        borough   = borough,
        out_path  = out_path,
    )

    if out_file is None:
        raise HTTPException(status_code=404, detail="No leads found for those filters.")

    filename = f"askmiro_mail_merge_{datetime.now().strftime('%Y-%m-%d')}.xlsx"
    return FileResponse(
        path=str(out_file),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


# ── PDF Export ────────────────────────────────────────────────────────────────

@app.get("/api/export/pdf")
def export_pdf(
    limit:     int            = Query(100, ge=1, le=500),
    min_score: int            = Query(55,  ge=0, le=100),
    sector:    Optional[str]  = None,
    borough:   Optional[str]  = None,
):
    """Generate and download a branded PDF of the top leads."""
    from export_leads_pdf import _fetch_leads, _fetch_stats, build_pdf

    leads = _fetch_leads(limit=limit, min_score=min_score,
                         sector=sector, borough=borough)
    if not leads:
        raise HTTPException(status_code=404, detail="No leads found for those filters.")

    stats    = _fetch_stats()
    filters  = {"sector": sector, "borough": borough}
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"askmiro_leads_{ts}.pdf"

    # Write to the exports directory so it persists, return as download
    from pathlib import Path
    out_dir  = Path(__file__).resolve().parent / "exports"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / filename

    build_pdf(leads, stats, out_path, filters)

    return FileResponse(
        path=str(out_path),
        media_type="application/pdf",
        filename=filename,
    )


# ── Lead CRUD ─────────────────────────────────────────────────────────────────

@app.post("/api/leads")
def create_lead(body: dict = Body(...)):
    """Create a manual lead entry."""
    if not body.get("business_name"):
        raise HTTPException(status_code=400, detail="business_name is required")
    place_id = create_manual_lead(body)
    log_activity(place_id, "system", f"Lead manually created: {body['business_name']}")
    return {"place_id": place_id, "status": "created"}

@app.put("/api/leads/{place_id}")
def update_lead(place_id: str, body: dict = Body(...)):
    """Update lead fields."""
    row = db.get_lead_by_place_id(place_id)
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")
    update_lead_fields(place_id, body)
    log_activity(place_id, "system", f"Lead fields updated: {', '.join(body.keys())}")
    return {"status": "updated"}

@app.post("/api/leads/{place_id}/archive")
def archive_lead_endpoint(place_id: str):
    archive_lead(place_id)
    log_activity(place_id, "system", "Lead archived")
    return {"status": "archived"}

@app.post("/api/leads/{place_id}/restore")
def restore_lead_endpoint(place_id: str):
    restore_lead(place_id)
    log_activity(place_id, "system", "Lead restored from archive")
    return {"status": "restored"}


# ── Activities ────────────────────────────────────────────────────────────────

@app.get("/api/leads/{place_id}/activities")
def get_lead_activities(place_id: str):
    rows = get_activities(place_id)
    return [dict(r) for r in rows]

@app.post("/api/leads/{place_id}/activities")
def log_lead_activity(place_id: str, body: dict = Body(...)):
    log_activity(
        place_id=place_id,
        activity_type=body.get("activity_type", "note"),
        summary=body.get("summary", ""),
        channel=body.get("channel"),
        outcome=body.get("outcome"),
        next_action=body.get("next_action"),
    )
    return {"status": "logged"}


# ── Notes ─────────────────────────────────────────────────────────────────────

@app.get("/api/leads/{place_id}/notes")
def get_lead_notes(place_id: str):
    rows = get_notes(place_id)
    return [dict(r) for r in rows]

@app.post("/api/leads/{place_id}/notes")
def add_lead_note(place_id: str, body: dict = Body(...)):
    if not body.get("body"):
        raise HTTPException(status_code=400, detail="Note body is required")
    note_id = add_note(place_id, body["body"])
    log_activity(place_id, "note", "Note added")
    return {"id": note_id, "status": "created"}

@app.put("/api/notes/{note_id}")
def edit_note(note_id: int, body: dict = Body(...)):
    if not body.get("body"):
        raise HTTPException(status_code=400, detail="Note body is required")
    update_note(note_id, body["body"])
    return {"status": "updated"}

@app.delete("/api/notes/{note_id}")
def remove_note(note_id: int):
    delete_note(note_id)
    return {"status": "deleted"}


# ── Pipeline quote / outcome ──────────────────────────────────────────────────

@app.post("/api/pipeline/{place_id}/quote")
def set_pipeline_quote(place_id: str, body: dict = Body(...)):
    value = body.get("quote_value_gbp")
    if value is None:
        raise HTTPException(status_code=400, detail="quote_value_gbp required")
    update_pipeline_quote(place_id, float(value), body.get("quote_date"))
    log_activity(place_id, "quote_sent", f"Quote sent: £{value}/month")
    return {"status": "updated"}

@app.post("/api/pipeline/{place_id}/outcome")
def set_pipeline_outcome(place_id: str, body: dict = Body(...)):
    outcome = body.get("outcome")
    if outcome not in ("won", "lost"):
        raise HTTPException(status_code=400, detail="outcome must be 'won' or 'lost'")
    update_pipeline_outcome(place_id, outcome, body.get("loss_reason"), body.get("value_gbp"))
    log_activity(place_id, outcome, body.get("loss_reason") or f"Marked as {outcome}")
    return {"status": "updated"}


# ── Quotes listing ───────────────────────────────────────────────────────────

@app.get("/api/quotes")
def list_quotes(status: Optional[str] = None):
    """List all quotes with builder fields + opportunity info."""
    try:
        with db_pg.transaction() as conn:
            conditions = []
            params = []
            if status:
                conditions.append("q.status = %s")
                params.append(status)
            where = (" WHERE " + " AND ".join(conditions)) if conditions else ""
            rows = db_pg.fetchall(conn, f"""
                SELECT q.*,
                       o.title AS opportunity_title, o.current_stage,
                       e.canonical_name AS business_name, e.sector AS entity_sector,
                       a.borough
                FROM quotes q
                LEFT JOIN opportunities o ON o.id = q.opportunity_id
                LEFT JOIN entities e ON e.id = COALESCE(q.entity_id, o.entity_id)
                LEFT JOIN LATERAL (
                    SELECT addr.borough FROM entity_locations el
                    JOIN addresses addr ON addr.id = el.address_id
                    WHERE el.entity_id = COALESCE(q.entity_id, o.entity_id) AND el.is_primary = TRUE LIMIT 1
                ) a ON TRUE
                {where}
                ORDER BY q.created_at DESC
            """, params)
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("list_quotes error: %s", exc)
        return []


@app.post("/api/quotes")
def create_quote(body: dict = Body(...)):
    """Save a quote from the quote builder."""
    try:
        with db_pg.transaction() as conn:
            # Calculate financials
            hrs = float(body.get('hours_per_week') or 0)
            days = int(body.get('days_per_week') or 5)
            rate = float(body.get('client_rate') or 18.50)
            llw = float(body.get('llw_rate') or 13.85)
            on_costs = float(body.get('on_costs_pct') or 36)
            supplies = float(body.get('supplies_month') or 0)
            other = float(body.get('other_costs_month') or 0)

            monthly_hrs = hrs * (days / 5) * 4.33
            labour = monthly_hrs * llw * (1 + on_costs / 100)
            total_cost = labour + supplies + other
            revenue = monthly_hrs * rate
            margin = ((revenue - total_cost) / revenue * 100) if revenue > 0 else 0

            risk = ''
            if margin < 10: risk = 'critical'
            elif margin < 20: risk = 'warning'

            row = db_pg.fetchone(conn, """
                INSERT INTO quotes (
                    opportunity_id, entity_id, title, client_name, site_address,
                    site_postcode, sector, mode, hours_per_week, days_per_week,
                    client_rate, llw_rate, on_costs_pct, supplies_month, other_costs_month,
                    monthly_revenue, monthly_cost, monthly_value, margin_pct,
                    scenario, risk_flag, notes, quote_value_gbp, status,
                    quote_date, valid_until, created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    CURRENT_DATE, CURRENT_DATE + 30, NOW(), NOW()
                ) RETURNING *
            """, (
                body.get('opportunity_id'), body.get('entity_id'),
                body.get('title') or f"Quote for {body.get('client_name', '')}",
                body.get('client_name', ''), body.get('site_address', ''),
                body.get('site_postcode') or body.get('postcode', ''),
                body.get('sector') or body.get('segment', ''),
                body.get('mode', 'hourly'),
                hrs, days, rate, llw, on_costs, supplies, other,
                round(revenue, 2), round(total_cost, 2), round(revenue, 2),
                round(margin, 1),
                body.get('scenario', 'balanced'), risk,
                body.get('notes', ''), round(revenue, 2),
                body.get('status', 'draft'),
            ))
            return dict(row) if row else {"error": "Insert failed"}
    except Exception as exc:
        logger.error("create_quote: %s", exc)
        raise HTTPException(500, str(exc))


@app.put("/api/quotes/{quote_id}")
def update_quote(quote_id: int, body: dict = Body(...)):
    """Update a quote."""
    try:
        with db_pg.transaction() as conn:
            allowed = ['title','client_name','site_address','site_postcode','sector','mode',
                       'hours_per_week','days_per_week','client_rate','llw_rate','on_costs_pct',
                       'supplies_month','other_costs_month','monthly_revenue','monthly_cost',
                       'monthly_value','margin_pct','scenario','risk_flag','notes','status',
                       'valid_until']
            sets = []
            params = []
            for k in allowed:
                if k in body:
                    sets.append(f"{k} = %s")
                    params.append(body[k])
            if not sets:
                return {"ok": False, "error": "No fields to update"}
            sets.append("updated_at = NOW()")
            if body.get('status') == 'sent':
                sets.append("sent_at = NOW()")
            if body.get('status') == 'accepted':
                sets.append("accepted_at = NOW()")
            params.append(quote_id)
            db_pg.execute(conn, f"UPDATE quotes SET {', '.join(sets)} WHERE id = %s", params)
            return db_pg.fetchone(conn, "SELECT * FROM quotes WHERE id = %s", (quote_id,)) or {}
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.get("/api/contracts")
def list_contracts():
    """List contracts (won opportunities with quote values)."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT o.id, o.entity_id, o.title, o.current_stage AS status,
                       o.created_at, o.updated_at,
                       e.canonical_name AS client_name, e.sector,
                       e.primary_phone AS phone, e.primary_email AS email,
                       a.borough, a.line1 AS site_address, a.postcode,
                       q.quote_value_gbp AS contract_value_gbp,
                       q.service_description,
                       lr.place_id
                FROM opportunities o
                JOIN entities e ON e.id = o.entity_id
                LEFT JOIN LATERAL (
                    SELECT addr.borough, addr.line1, addr.postcode
                    FROM entity_locations el
                    JOIN addresses addr ON addr.id = el.address_id
                    WHERE el.entity_id = e.id AND el.is_primary = TRUE LIMIT 1
                ) a ON TRUE
                LEFT JOIN LATERAL (
                    SELECT quote_value_gbp, service_description
                    FROM quotes WHERE opportunity_id = o.id
                    ORDER BY created_at DESC LIMIT 1
                ) q ON TRUE
                LEFT JOIN LATERAL (
                    SELECT source_record_id AS place_id
                    FROM entity_source_links WHERE entity_id = e.id LIMIT 1
                ) lr ON TRUE
                WHERE o.current_stage IN ('won', 'quote_sent', 'negotiating', 'quote_prepared')
                ORDER BY
                    CASE o.current_stage WHEN 'won' THEN 0 ELSE 1 END,
                    o.updated_at DESC
            """)
        return {"contracts": [dict(r) for r in rows]}
    except Exception as exc:
        logger.error("list_contracts error: %s", exc)
        return {"contracts": []}


# ══════════════════════════════════════════════════════════════════════════════
# OPERATIONS MODULES — real CRUD on fin_*, ops_*, pay_*, seo_* tables
# ══════════════════════════════════════════════════════════════════════════════


# ── Finance: Overview ────────────────────────────────────────────────────────

@app.get("/api/finance/overview")
def finance_overview():
    """Full financial dashboard from fin_invoices, fin_expenses, fin_transactions, fin_snapshots."""
    try:
        with db_pg.transaction() as conn:
            mark_overdue_invoices(conn)

            # -- settings --
            settings_rows = db_pg.fetchall(conn, "SELECT key, value FROM fin_settings")
            settings = {r["key"]: r["value"] for r in settings_rows}
            vat_rate = float(settings.get("vat_rate", 20))
            margin_healthy = float(settings.get("target_margin_healthy", 35))
            margin_watch = float(settings.get("target_margin_watch", 20))

            # -- invoiced revenue current month --
            invoiced_revenue = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(total_gross), 0) FROM fin_invoices
                WHERE status NOT IN ('Void','Draft')
                  AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE)
                  AND invoice_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
            """) or 0)

            # -- revenue previous month --
            prev_revenue = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(total_gross), 0) FROM fin_invoices
                WHERE status NOT IN ('Void','Draft')
                  AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                  AND invoice_date < DATE_TRUNC('month', CURRENT_DATE)
            """) or 0)
            revenue_mom = round(((invoiced_revenue - prev_revenue) / prev_revenue * 100) if prev_revenue else 0, 1)

            # -- cash received this month --
            cash_received = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(amount), 0) FROM fin_payments
                WHERE date_received >= DATE_TRUNC('month', CURRENT_DATE)
                  AND date_received < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
            """) or 0)

            # -- gross margin from latest snapshots --
            gross_margin = float(db_pg.fetchval(conn, """
                SELECT COALESCE(AVG(gross_margin_pct), 0)
                FROM fin_snapshots
                WHERE snapshot_month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
            """) or 0)

            # -- expenses this month --
            total_expenses = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(amount_gross), 0) FROM fin_expenses
                WHERE expense_date >= DATE_TRUNC('month', CURRENT_DATE)
                  AND expense_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
            """) or 0)
            prev_expenses = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(amount_gross), 0) FROM fin_expenses
                WHERE expense_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                  AND expense_date < DATE_TRUNC('month', CURRENT_DATE)
            """) or 0)
            expenses_mom = round(((total_expenses - prev_expenses) / prev_expenses * 100) if prev_expenses else 0, 1)

            # -- outstanding & overdue --
            outstanding = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(balance_due), 0) FROM fin_invoices
                WHERE status IN ('Issued','Sent','Overdue')
            """) or 0)
            outstanding_count = int(db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM fin_invoices
                WHERE status IN ('Issued','Sent','Overdue')
            """) or 0)
            overdue_amount = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(balance_due), 0) FROM fin_invoices WHERE status = 'Overdue'
            """) or 0)
            overdue_count = int(db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM fin_invoices WHERE status = 'Overdue'
            """) or 0)

            # -- alerts --
            alerts = []
            if overdue_count > 0:
                alerts.append({"level": "r", "msg": f"{overdue_count} overdue invoice(s) totalling £{overdue_amount:,.2f}"})
            if gross_margin and gross_margin < margin_watch:
                alerts.append({"level": "a", "msg": f"Portfolio margin {gross_margin:.1f}% below {margin_watch}% threshold"})

            # -- expected cash 30d --
            expected_cash_30d = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(balance_due), 0) FROM fin_invoices
                WHERE status NOT IN ('Paid','Void')
                  AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
            """) or 0)

            # -- lifetime & YTD totals --
            total_revenue_alltime = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(total_gross), 0) FROM fin_invoices
                WHERE status NOT IN ('Void','Draft')
            """) or 0)
            total_paid_alltime = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(amount_paid), 0) FROM fin_invoices
                WHERE status NOT IN ('Void','Draft')
            """) or 0)
            total_invoices_count = int(db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM fin_invoices WHERE status NOT IN ('Void')
            """) or 0)
            ytd_revenue = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(total_gross), 0) FROM fin_invoices
                WHERE status NOT IN ('Void','Draft')
                  AND invoice_date >= DATE_TRUNC('year', CURRENT_DATE)
            """) or 0)
            ytd_expenses = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(amount_gross), 0) FROM fin_expenses
                WHERE expense_date >= DATE_TRUNC('year', CURRENT_DATE)
            """) or 0)

            # -- strongest / weakest contract --
            strongest_row = db_pg.fetchone(conn, """
                SELECT site_id, gross_margin_pct FROM fin_snapshots
                WHERE snapshot_month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
                  AND gross_margin_pct IS NOT NULL
                ORDER BY gross_margin_pct DESC LIMIT 1
            """)
            strongest_contract = dict(strongest_row) if strongest_row else None

            weakest_row = db_pg.fetchone(conn, """
                SELECT site_id, gross_margin_pct FROM fin_snapshots
                WHERE snapshot_month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
                  AND gross_margin_pct IS NOT NULL
                ORDER BY gross_margin_pct ASC LIMIT 1
            """)
            weakest_contract = dict(weakest_row) if weakest_row else None

            # -- recent invoices & expenses --
            recent_invoices = db_pg.fetchall(conn, """
                SELECT * FROM fin_invoices ORDER BY created_at DESC LIMIT 5
            """)
            recent_expenses = db_pg.fetchall(conn, """
                SELECT * FROM fin_expenses ORDER BY created_at DESC LIMIT 5
            """)

            # -- overdue invoices for action queue --
            overdue_invoices_list = [dict(r) for r in db_pg.fetchall(conn, """
                SELECT * FROM fin_invoices WHERE status = 'Overdue'
                ORDER BY due_date ASC LIMIT 10
            """)]

        return {
            "total_invoiced": invoiced_revenue,
            "prev_total_invoiced": prev_revenue,
            "revenue_mom": revenue_mom,
            "cash_received": cash_received,
            "gross_margin": round(gross_margin, 1),
            "total_expenses": total_expenses,
            "prev_total_expenses": prev_expenses,
            "expenses_mom": expenses_mom,
            "outstanding": outstanding,
            "outstanding_count": outstanding_count,
            "overdue_total": overdue_amount,
            "overdue_count": overdue_count,
            "overdue_invoices": overdue_invoices_list,
            "alerts": alerts,
            "expected_cash_30d": expected_cash_30d,
            "strongest_contract": strongest_contract.get("site_id") if strongest_contract else None,
            "strongest_margin": strongest_contract.get("gross_margin_pct") if strongest_contract else None,
            "weakest_contract": weakest_contract.get("site_id") if weakest_contract else None,
            "weakest_margin": weakest_contract.get("gross_margin_pct") if weakest_contract else None,
            "recent_invoices": [dict(r) for r in recent_invoices],
            "recent_expenses": [dict(r) for r in recent_expenses],
            "settings": settings,
            "total_revenue_alltime": total_revenue_alltime,
            "total_paid_alltime": total_paid_alltime,
            "total_invoices_count": total_invoices_count,
            "ytd_revenue": ytd_revenue,
            "ytd_expenses": ytd_expenses,
        }
    except Exception as exc:
        logger.error("finance_overview error: %s", exc)
        return {
            "total_invoiced": 0, "prev_total_invoiced": 0, "revenue_mom": 0,
            "cash_received": 0, "gross_margin": 0, "total_expenses": 0,
            "prev_total_expenses": 0, "expenses_mom": 0,
            "outstanding": 0, "outstanding_count": 0, "overdue_total": 0,
            "overdue_count": 0, "overdue_invoices": [], "alerts": [],
            "expected_cash_30d": 0,
            "strongest_contract": None, "strongest_margin": None,
            "weakest_contract": None, "weakest_margin": None,
            "recent_invoices": [], "recent_expenses": [], "settings": {},
            "total_revenue_alltime": 0, "total_paid_alltime": 0,
            "total_invoices_count": 0, "ytd_revenue": 0, "ytd_expenses": 0,
        }


# ── Finance: Invoices ────────────────────────────────────────────────────────

@app.get("/api/finance/invoices")
def finance_invoices(status: str = Query(None), month: str = Query(None)):
    """List invoices with optional status and month filters."""
    try:
        with db_pg.transaction() as conn:
            clauses, params = [], []
            if status:
                clauses.append("status = %s")
                params.append(status)
            if month:
                clauses.append("TO_CHAR(invoice_date, 'YYYY-MM') = %s")
                params.append(month)
            where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
            rows = db_pg.fetchall(conn, f"""
                SELECT * FROM fin_invoices {where} ORDER BY invoice_date DESC
            """, tuple(params))
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("finance_invoices error: %s", exc)
        return []


@app.post("/api/finance/invoices")
def create_invoice(body: dict = Body(...)):
    """Create a new invoice with line items."""
    try:
        with db_pg.transaction() as conn:
            # Read VAT rate from settings
            vat_rate = float(db_pg.fetchval(conn,
                "SELECT value FROM fin_settings WHERE key = 'vat_rate'"
            ) or 20)
            default_terms = int(db_pg.fetchval(conn,
                "SELECT value FROM fin_settings WHERE key = 'default_payment_terms'"
            ) or 30)

            inv_number = next_invoice_number(conn)
            line_items = body.get("line_items", [])
            subtotal_net = sum(float(li.get("amount_net", 0)) for li in line_items)
            vat_amount = round(subtotal_net * vat_rate / 100, 2)
            total_gross = round(subtotal_net + vat_amount, 2)

            inv_date = body.get("invoice_date", str(date.today()))
            payment_terms = body.get("payment_terms", default_terms)
            due_date = body.get("due_date")
            if not due_date:
                from datetime import timedelta
                due_date = str(date.fromisoformat(inv_date) + timedelta(days=int(payment_terms)))

            row = db_pg.fetchone(conn, """
                INSERT INTO fin_invoices
                    (invoice_number, customer_name, site_id, contract_id, entity_id,
                     invoice_date, due_date, billing_period_from, billing_period_to,
                     payment_terms, subtotal_net, vat_amount, total_gross, balance_due,
                     line_items_json, notes, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Draft')
                RETURNING *
            """, (
                inv_number, body["customer_name"],
                body.get("site_id"), body.get("contract_id"), body.get("entity_id"),
                inv_date, due_date,
                body.get("billing_period_from"), body.get("billing_period_to"),
                payment_terms, subtotal_net, vat_amount, total_gross, total_gross,
                json.dumps(line_items), body.get("notes"),
            ))

            # Create matching transaction
            db_pg.execute(conn, """
                INSERT INTO fin_transactions
                    (transaction_date, type, category, description, party,
                     amount_gross, amount_net, amount_vat, linked_invoice_id, site_id, entity_id)
                VALUES (%s, 'invoice', 'Revenue', %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                inv_date, f"Invoice {inv_number}", body["customer_name"],
                total_gross, subtotal_net, vat_amount,
                row["id"], body.get("site_id"), body.get("entity_id"),
            ))

        return dict(row)
    except Exception as exc:
        logger.error("create_invoice error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/finance/invoices/{invoice_id}/mark-sent")
def mark_invoice_sent(invoice_id: int):
    """Mark invoice as Issued (sent to customer)."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                UPDATE fin_invoices SET status = 'Issued', updated_at = NOW()
                WHERE id = %s AND status = 'Draft' RETURNING *
            """, (invoice_id,))
            if not row:
                raise HTTPException(status_code=404, detail="Invoice not found or not in Draft status")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("mark_invoice_sent error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/finance/invoices/{invoice_id}/void")
def void_invoice(invoice_id: int):
    """Void an invoice."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                UPDATE fin_invoices SET status = 'Void', updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (invoice_id,))
            if not row:
                raise HTTPException(status_code=404, detail="Invoice not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("void_invoice error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/finance/invoices/{invoice_id}/payment")
def record_invoice_payment(invoice_id: int, body: dict = Body(...)):
    """Record a payment against an invoice."""
    try:
        with db_pg.transaction() as conn:
            inv = db_pg.fetchone(conn, "SELECT * FROM fin_invoices WHERE id = %s", (invoice_id,))
            if not inv:
                raise HTTPException(status_code=404, detail="Invoice not found")

            amount = float(body["amount"])
            date_received = body.get("date_received", str(date.today()))

            # Insert payment
            db_pg.execute(conn, """
                INSERT INTO fin_payments (invoice_id, amount, date_received, payment_method, reference, notes)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                invoice_id, amount, date_received,
                body.get("payment_method", "BACS"),
                body.get("reference"), body.get("notes"),
            ))

            # Update invoice
            new_paid = float(inv["amount_paid"] or 0) + amount
            new_balance = float(inv["total_gross"] or 0) - new_paid
            if new_balance <= 0:
                new_status = "Paid"
            elif new_balance > 0 and inv["status"] == "Overdue":
                new_status = "Issued"
            else:
                new_status = inv["status"]
            row = db_pg.fetchone(conn, """
                UPDATE fin_invoices
                SET amount_paid = %s, balance_due = %s, status = %s, updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (new_paid, max(new_balance, 0), new_status, invoice_id))

            # Create payment transaction
            db_pg.execute(conn, """
                INSERT INTO fin_transactions
                    (transaction_date, type, category, description, party,
                     amount_gross, linked_invoice_id, site_id, entity_id)
                VALUES (%s, 'payment', 'Revenue', %s, %s, %s, %s, %s, %s)
            """, (
                date_received, f"Payment for {inv['invoice_number']}",
                inv["customer_name"], amount, invoice_id,
                inv.get("site_id"), inv.get("entity_id"),
            ))

        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("record_payment error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Finance: Expenses ────────────────────────────────────────────────────────

@app.get("/api/finance/expenses")
def finance_expenses(category: str = Query(None), month: str = Query(None)):
    """List expenses with optional category and month filters."""
    try:
        with db_pg.transaction() as conn:
            clauses, params = [], []
            if category:
                clauses.append("category = %s")
                params.append(category)
            if month:
                clauses.append("TO_CHAR(expense_date, 'YYYY-MM') = %s")
                params.append(month)
            where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
            rows = db_pg.fetchall(conn, f"""
                SELECT * FROM fin_expenses {where} ORDER BY expense_date DESC
            """, tuple(params))
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("finance_expenses error: %s", exc)
        return []


@app.post("/api/finance/expenses")
def create_expense(body: dict = Body(...)):
    """Create an expense record."""
    try:
        with db_pg.transaction() as conn:
            exp_date = body.get("expense_date", str(date.today()))
            amount_gross = float(body["amount_gross"])
            amount_net = body.get("amount_net")
            amount_vat = body.get("amount_vat")

            # If VAT not provided but gross is, estimate from fin_settings vat_rate
            if amount_vat is None and amount_gross:
                settings_rows = db_pg.fetchall(conn, "SELECT key, value FROM fin_settings")
                settings = {r["key"]: r["value"] for r in settings_rows}
                vat_rate = float(settings.get("vat_rate", 20))
                amount_vat = round(amount_gross * vat_rate / (100 + vat_rate), 2)
                if amount_net is None:
                    amount_net = round(amount_gross - amount_vat, 2)

            if amount_net is not None:
                amount_net = float(amount_net)
            if amount_vat is not None:
                amount_vat = float(amount_vat)

            row = db_pg.fetchone(conn, """
                INSERT INTO fin_expenses
                    (expense_date, category, subcategory, description, supplier, amount_gross,
                     amount_net, amount_vat, entity_id, site_id, contract_id, receipt_ref, recurring)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                exp_date, body["category"], body.get("subcategory"), body["description"],
                body.get("supplier"), amount_gross,
                amount_net, amount_vat, body.get("entity_id"),
                body.get("site_id"), body.get("contract_id"),
                body.get("receipt_ref"), body.get("recurring", "No"),
            ))

            # Create matching transaction
            db_pg.execute(conn, """
                INSERT INTO fin_transactions
                    (transaction_date, type, category, description, party,
                     amount_gross, amount_net, amount_vat, entity_id, site_id)
                VALUES (%s, 'expense', %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                exp_date, body["category"], body["description"],
                body.get("supplier"), amount_gross, amount_net, amount_vat,
                body.get("entity_id"), body.get("site_id"),
            ))

        return dict(row)
    except Exception as exc:
        logger.error("create_expense error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Finance: Transactions ────────────────────────────────────────────────────

@app.get("/api/finance/transactions")
def finance_transactions(type: str = Query(None), category: str = Query(None), month: str = Query(None)):
    """List transactions with optional filters. Includes summary totals."""
    try:
        with db_pg.transaction() as conn:
            clauses, params = ["status = 'active'"], []
            if type:
                clauses.append("type = %s")
                params.append(type)
            if category:
                clauses.append("category = %s")
                params.append(category)
            if month:
                clauses.append("TO_CHAR(transaction_date, 'YYYY-MM') = %s")
                params.append(month)
            where = "WHERE " + " AND ".join(clauses)
            rows = db_pg.fetchall(conn, f"""
                SELECT * FROM fin_transactions {where} ORDER BY transaction_date DESC
            """, tuple(params))

            total_in = sum(float(r["amount_gross"] or 0) for r in rows if r["type"] in ("income", "payment"))
            total_out = sum(float(r["amount_gross"] or 0) for r in rows if r["type"] in ("expense", "credit_note"))

        return {
            "total_in": round(total_in, 2),
            "total_out": round(total_out, 2),
            "net": round(total_in - total_out, 2),
            "transactions": [dict(r) for r in rows],
        }
    except Exception as exc:
        logger.error("finance_transactions error: %s", exc)
        return {"total_in": 0, "total_out": 0, "net": 0, "transactions": []}


@app.post("/api/finance/transactions")
def create_transaction(body: dict = Body(...)):
    """Create a transaction directly."""
    try:
        with db_pg.transaction() as conn:
            txn_date = body.get("transaction_date", str(date.today()))
            row = db_pg.fetchone(conn, """
                INSERT INTO fin_transactions
                    (transaction_date, type, category, description, party,
                     amount_gross, external_ref, site_id, notes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                txn_date, body["type"], body.get("category"),
                body["description"], body.get("party"),
                float(body["amount_gross"]),
                body.get("external_ref"), body.get("site_id"), body.get("notes"),
            ))
        return dict(row)
    except Exception as exc:
        logger.error("create_transaction error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/finance/transactions/{txn_id}/void")
def void_transaction(txn_id: int):
    """Mark a transaction as void."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                UPDATE fin_transactions SET status = 'void'
                WHERE id = %s RETURNING *
            """, (txn_id,))
            if not row:
                raise HTTPException(status_code=404, detail="Transaction not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("void_transaction error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Finance: Profitability & Snapshots ───────────────────────────────────────

@app.get("/api/finance/profitability")
def finance_profitability(month: str = Query(None)):
    """Return profitability snapshots with portfolio KPIs."""
    try:
        with db_pg.transaction() as conn:
            clauses, params = [], []
            if month:
                clauses.append("snapshot_month = %s")
                params.append(month)
            where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
            rows = db_pg.fetchall(conn, f"""
                SELECT * FROM fin_snapshots {where} ORDER BY snapshot_month DESC, site_id
            """, tuple(params))

            # Portfolio KPIs
            total_rev = sum(float(r["invoiced_revenue"] or 0) for r in rows)
            total_cost = sum(float(r["total_cost"] or 0) for r in rows)
            total_profit = total_rev - total_cost
            avg_margin = (total_profit / total_rev * 100) if total_rev else 0

        return {
            "portfolio_revenue": round(total_rev, 2),
            "portfolio_cost": round(total_cost, 2),
            "portfolio_profit": round(total_profit, 2),
            "portfolio_margin": round(avg_margin, 1),
            "snapshots": [dict(r) for r in rows],
        }
    except Exception as exc:
        logger.error("finance_profitability error: %s", exc)
        return {"portfolio_revenue": 0, "portfolio_cost": 0, "portfolio_profit": 0,
                "portfolio_margin": 0, "snapshots": []}


@app.post("/api/finance/recalculate-snapshots")
def recalculate_snapshots_endpoint(body: dict = Body({})):
    """Recalculate profitability snapshots."""
    try:
        with db_pg.transaction() as conn:
            count = recalculate_snapshots(conn, body.get("month"))
        return {"recalculated": count}
    except Exception as exc:
        logger.error("recalculate_snapshots error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Finance: Recurring Expenses ──────────────────────────────────────────────

@app.post("/api/finance/generate-recurring")
def generate_recurring_expenses(body: dict = Body(...)):
    """Generate recurring expenses for a target month."""
    try:
        target_month = body.get("target_month")
        if not target_month:
            raise HTTPException(status_code=400, detail="target_month is required (YYYY-MM)")

        with db_pg.transaction() as conn:
            # Find distinct recurring expense templates
            templates = db_pg.fetchall(conn, """
                SELECT DISTINCT ON (category, description, supplier, site_id)
                    category, description, supplier, site_id, contract_id,
                    amount_gross, receipt_ref
                FROM fin_expenses
                WHERE recurring = 'Yes'
                ORDER BY category, description, supplier, site_id, created_at DESC
            """)

            count = 0
            for t in templates:
                # Check if already generated for this month
                exists = db_pg.fetchval(conn, """
                    SELECT COUNT(*) FROM fin_expenses
                    WHERE category = %s AND description = %s
                      AND COALESCE(supplier,'') = COALESCE(%s,'')
                      AND COALESCE(site_id,'') = COALESCE(%s,'')
                      AND TO_CHAR(expense_date, 'YYYY-MM') = %s
                """, (t["category"], t["description"], t.get("supplier"),
                      t.get("site_id"), target_month))
                if exists and int(exists) > 0:
                    continue

                exp_date = f"{target_month}-01"
                db_pg.execute(conn, """
                    INSERT INTO fin_expenses
                        (expense_date, category, description, supplier, amount_gross,
                         site_id, contract_id, receipt_ref, recurring)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'Yes')
                """, (
                    exp_date, t["category"], t["description"], t.get("supplier"),
                    t["amount_gross"], t.get("site_id"), t.get("contract_id"),
                    t.get("receipt_ref"),
                ))

                db_pg.execute(conn, """
                    INSERT INTO fin_transactions
                        (transaction_date, type, category, description, party, amount_gross, site_id)
                    VALUES (%s, 'expense', %s, %s, %s, %s, %s)
                """, (
                    exp_date, t["category"], t["description"],
                    t.get("supplier"), t["amount_gross"], t.get("site_id"),
                ))
                count += 1

        return {"generated": count, "target_month": target_month}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("generate_recurring error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Finance: Settings ────────────────────────────────────────────────────────

@app.get("/api/finance/settings")
def get_finance_settings():
    """Return all fin_settings as a dict."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, "SELECT key, value FROM fin_settings")
        return {r["key"]: r["value"] for r in rows}
    except Exception as exc:
        logger.error("get_finance_settings error: %s", exc)
        return {}


@app.post("/api/finance/settings")
def update_finance_settings(body: dict = Body(...)):
    """Update finance settings (key-value pairs)."""
    try:
        with db_pg.transaction() as conn:
            for k, v in body.items():
                db_pg.execute(conn, """
                    INSERT INTO fin_settings (key, value, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
                """, (k, str(v)))
        return {"updated": list(body.keys())}
    except Exception as exc:
        logger.error("update_finance_settings error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Finance: HMRC VAT Return ─────────────────────────────────────────────────

@app.get("/api/finance/vat-return")
def finance_vat_return(quarter: Optional[str] = None):
    """
    HMRC MTD-ready VAT return calculation (Boxes 1-9).
    Quarter format: 'Q1-2026' or auto-detect current quarter.
    UK VAT standard rate = 20%. Flat Rate Scheme not assumed.
    """
    try:
        with db_pg.transaction() as conn:
            settings_rows = db_pg.fetchall(conn, "SELECT key, value FROM fin_settings")
            settings = {r["key"]: r["value"] for r in settings_rows}
            vat_rate = float(settings.get("vat_rate", 20))

            # Determine quarter dates
            from datetime import date as dtdate
            today = dtdate.today()
            if quarter:
                parts = quarter.split('-')
                q = int(parts[0].replace('Q',''))
                yr = int(parts[1])
            else:
                q = (today.month - 1) // 3 + 1
                yr = today.year

            q_start_month = (q - 1) * 3 + 1
            q_start = f"{yr}-{q_start_month:02d}-01"
            q_end_month = q * 3
            if q_end_month == 12:
                q_end = f"{yr + 1}-01-01"
            else:
                q_end = f"{yr}-{q_end_month + 1:02d}-01"

            import calendar
            quarter_label = f"Q{q} {yr} ({q_start} to {yr}-{q_end_month:02d}-{calendar.monthrange(yr, q_end_month)[1]})"

            # Box 1: VAT due on sales (output VAT)
            box1 = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(vat_amount), 0) FROM fin_invoices
                WHERE status NOT IN ('Void','Draft')
                  AND invoice_date >= %s AND invoice_date < %s
            """, (q_start, q_end)) or 0)

            # Box 2: VAT due on EU acquisitions (N/A post-Brexit, but keep for completeness)
            box2 = 0.0

            # Box 3: Total VAT due (Box 1 + Box 2)
            box3 = box1 + box2

            # Box 4: VAT reclaimed on purchases (input VAT)
            box4 = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(amount_vat), 0) FROM fin_expenses
                WHERE expense_date >= %s AND expense_date < %s
            """, (q_start, q_end)) or 0)
            # If amount_vat is NULL, estimate from gross at vat_rate
            if box4 == 0:
                total_expenses_gross = float(db_pg.fetchval(conn, """
                    SELECT COALESCE(SUM(amount_gross), 0) FROM fin_expenses
                    WHERE expense_date >= %s AND expense_date < %s
                """, (q_start, q_end)) or 0)
                box4 = round(total_expenses_gross * vat_rate / (100 + vat_rate), 2)

            # Box 5: Net VAT to pay/reclaim (Box 3 - Box 4)
            box5 = round(box3 - box4, 2)

            # Box 6: Total sales exc. VAT
            box6 = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(subtotal_net), 0) FROM fin_invoices
                WHERE status NOT IN ('Void','Draft')
                  AND invoice_date >= %s AND invoice_date < %s
            """, (q_start, q_end)) or 0)

            # Box 7: Total purchases exc. VAT
            box7_raw = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(COALESCE(amount_net, amount_gross * 100 / (100 + %s))), 0)
                FROM fin_expenses
                WHERE expense_date >= %s AND expense_date < %s
            """, (vat_rate, q_start, q_end)) or 0)
            box7 = round(box7_raw, 2)

            # Box 8 & 9: EU supplies/acquisitions (zero post-Brexit)
            box8 = 0.0
            box9 = 0.0

            # Payment deadline: 1 month + 7 days after quarter end
            import calendar
            last_day = calendar.monthrange(yr, q_end_month)[1]
            quarter_end_date = f"{yr}-{q_end_month:02d}-{last_day}"
            deadline_month = q_end_month + 1
            deadline_year = yr
            if deadline_month > 12:
                deadline_month = 1
                deadline_year += 1
            deadline = f"{deadline_year}-{deadline_month:02d}-07"

            # Previous quarters for comparison
            prev_returns = db_pg.fetchall(conn, """
                SELECT TO_CHAR(invoice_date, 'YYYY-"Q"Q') AS qtr,
                       SUM(vat_amount) AS output_vat,
                       SUM(subtotal_net) AS net_sales
                FROM fin_invoices
                WHERE status NOT IN ('Void','Draft')
                  AND invoice_date >= CURRENT_DATE - INTERVAL '12 months'
                GROUP BY TO_CHAR(invoice_date, 'YYYY-"Q"Q')
                ORDER BY qtr DESC LIMIT 4
            """)

        return {
            "quarter": quarter_label,
            "vat_rate": vat_rate,
            "box1_output_vat": round(box1, 2),
            "box2_eu_acquisitions": box2,
            "box3_total_vat_due": round(box3, 2),
            "box4_input_vat": round(box4, 2),
            "box5_net_vat": box5,
            "box5_direction": "pay" if box5 > 0 else "reclaim",
            "box6_net_sales": round(box6, 2),
            "box7_net_purchases": box7,
            "box8_eu_supplies": box8,
            "box9_eu_acquisitions": box9,
            "payment_deadline": deadline,
            "quarter_end": quarter_end_date,
            "previous_quarters": [dict(r) for r in prev_returns],
            "mtd_compliant": True,
            "notes": [
                "Standard VAT rate applied at {}%".format(vat_rate),
                "Post-Brexit: EU acquisition boxes (2, 8, 9) set to zero",
                "Input VAT estimated from gross expenses where VAT breakdown not recorded",
                "File via HMRC Making Tax Digital by {}".format(deadline),
            ],
        }
    except Exception as exc:
        logger.error("finance_vat_return error: %s", exc)
        return {"error": str(exc)}


@app.get("/api/finance/tax-summary")
def finance_tax_summary(year: Optional[int] = None):
    """
    Annual tax summary aligned to HMRC self-assessment categories.
    Covers Corporation Tax estimation, allowable deductions, and P&L.
    """
    try:
        from datetime import date as dtdate
        tax_year = year or dtdate.today().year
        # UK tax year: 6 Apr to 5 Apr
        ty_start = f"{tax_year - 1}-04-06"
        ty_end = f"{tax_year}-04-06"

        with db_pg.transaction() as conn:
            # Turnover (gross revenue)
            turnover = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(total_gross), 0) FROM fin_invoices
                WHERE status NOT IN ('Void','Draft')
                  AND invoice_date >= %s AND invoice_date < %s
            """, (ty_start, ty_end)) or 0)

            # HMRC allowable deductions by category
            deductions = db_pg.fetchall(conn, """
                SELECT category,
                       COUNT(*) AS count,
                       SUM(amount_gross) AS total
                FROM fin_expenses
                WHERE expense_date >= %s AND expense_date < %s
                GROUP BY category ORDER BY SUM(amount_gross) DESC
            """, (ty_start, ty_end))

            total_deductions = sum(float(d.get('total', 0) or 0) for d in deductions)
            taxable_profit = turnover - total_deductions

            # Corporation Tax rate (UK 2024-25: 25% for profits over £250k, 19% small profits)
            if taxable_profit <= 50000:
                ct_rate = 19.0
            elif taxable_profit <= 250000:
                # Marginal relief
                ct_rate = 19.0 + (taxable_profit - 50000) / 200000 * 6.0
            else:
                ct_rate = 25.0
            ct_liability = round(taxable_profit * ct_rate / 100, 2) if taxable_profit > 0 else 0

            # Labour costs (for IR35 / employment cost analysis)
            labour_total = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(amount_gross), 0) FROM fin_expenses
                WHERE category IN ('Labour', 'Subcontractors')
                  AND expense_date >= %s AND expense_date < %s
            """, (ty_start, ty_end)) or 0)

            # Employee-only labour (excluding subcontractors) for NI calculation
            employee_labour_only = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(amount_gross), 0) FROM fin_expenses
                WHERE category = 'Labour'
                  AND expense_date >= %s AND expense_date < %s
            """, (ty_start, ty_end)) or 0)

            # Employer NI estimate (13.8% on earnings above threshold) — employees only
            employer_ni = round(employee_labour_only * 0.138, 2)

            # Monthly P&L
            monthly_pl = db_pg.fetchall(conn, """
                SELECT m.month,
                    COALESCE(rev.total, 0) AS revenue,
                    COALESCE(exp.total, 0) AS expenses,
                    COALESCE(rev.total, 0) - COALESCE(exp.total, 0) AS profit
                FROM (
                    SELECT TO_CHAR(d, 'YYYY-MM') AS month
                    FROM generate_series(%s::date, %s::date - INTERVAL '1 day', '1 month') d
                ) m
                LEFT JOIN (
                    SELECT TO_CHAR(invoice_date, 'YYYY-MM') AS month, SUM(total_gross) AS total
                    FROM fin_invoices WHERE status NOT IN ('Void','Draft')
                      AND invoice_date >= %s AND invoice_date < %s
                    GROUP BY 1
                ) rev ON rev.month = m.month
                LEFT JOIN (
                    SELECT TO_CHAR(expense_date, 'YYYY-MM') AS month, SUM(amount_gross) AS total
                    FROM fin_expenses WHERE expense_date >= %s AND expense_date < %s
                    GROUP BY 1
                ) exp ON exp.month = m.month
                ORDER BY m.month
            """, (ty_start, ty_end, ty_start, ty_end, ty_start, ty_end))

        # HMRC expense category mapping
        hmrc_categories = {
            "Labour": "Staff costs (allowable)",
            "Subcontractors": "Subcontractor costs (check IR35 status)",
            "Supplies & Consumables": "Cost of goods / materials (allowable)",
            "Travel & Transport": "Travel expenses (business use only)",
            "Equipment": "Capital allowances (AIA up to £1m)",
            "Admin & Software": "Office costs / admin (allowable)",
            "Marketing": "Advertising & marketing (allowable)",
            "Insurance": "Business insurance (allowable)",
            "Training & Compliance": "Training costs (allowable)",
            "One-off Job Costs": "Variable project costs (allowable)",
            "Miscellaneous": "Other business expenses (review needed)",
        }

        return {
            "tax_year": f"{tax_year - 1}/{tax_year}",
            "period": f"6 Apr {tax_year - 1} to 5 Apr {tax_year}",
            "turnover": round(turnover, 2),
            "total_deductions": round(total_deductions, 2),
            "taxable_profit": round(taxable_profit, 2),
            "corporation_tax_rate": ct_rate,
            "corporation_tax_liability": ct_liability,
            "labour_costs": round(labour_total, 2),
            "employer_ni_estimate": employer_ni,
            "deductions_by_category": [{
                "category": d["category"],
                "hmrc_classification": hmrc_categories.get(d["category"], "Review needed"),
                "count": d["count"],
                "total": round(float(d["total"] or 0), 2),
            } for d in deductions],
            "monthly_pl": [dict(r) for r in monthly_pl],
            "ir35_warning": labour_total > 0 and any(d["category"] == "Subcontractors" for d in deductions),
            "ir35_note": "Subcontractor payments detected. Ensure IR35 status is assessed for each worker." if any(d["category"] == "Subcontractors" for d in deductions) else None,
            "notes": [
                f"Corporation Tax: {ct_rate}% (small profits rate 19%, main rate 25%)",
                "Employer NI at 13.8% estimated on total labour costs",
                "Annual Investment Allowance (AIA) applies to equipment up to £1m",
                "Keep records for 6 years per HMRC requirements",
                "File Corporation Tax return within 12 months of accounting period end",
                "Pay Corporation Tax within 9 months + 1 day of accounting period end",
            ],
        }
    except Exception as exc:
        logger.error("finance_tax_summary error: %s", exc)
        return {"error": str(exc)}


@app.get("/api/finance/cash-forecast")
def finance_cash_forecast():
    """
    30/60/90 day cash flow forecast based on outstanding invoices,
    recurring expenses, and payment history patterns.
    """
    try:
        with db_pg.transaction() as conn:
            # Current cash position (paid invoices - expenses)
            total_received = float(db_pg.fetchval(conn,
                "SELECT COALESCE(SUM(amount), 0) FROM fin_payments") or 0)
            total_spent = float(db_pg.fetchval(conn,
                "SELECT COALESCE(SUM(amount_gross), 0) FROM fin_expenses") or 0)
            cash_position = total_received - total_spent

            # Expected income: unpaid invoices by due date band
            income_30d = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(balance_due), 0) FROM fin_invoices
                WHERE status IN ('Issued','Sent','Overdue')
                  AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
            """) or 0)
            income_60d = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(balance_due), 0) FROM fin_invoices
                WHERE status IN ('Issued','Sent','Overdue')
                  AND due_date BETWEEN CURRENT_DATE + 31 AND CURRENT_DATE + 60
            """) or 0)
            income_90d = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(balance_due), 0) FROM fin_invoices
                WHERE status IN ('Issued','Sent','Overdue')
                  AND due_date BETWEEN CURRENT_DATE + 61 AND CURRENT_DATE + 90
            """) or 0)

            # Monthly recurring expenses
            monthly_recurring = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(amount_gross), 0) FROM fin_expenses
                WHERE recurring = 'Yes'
            """) or 0)
            # Deduplicate recurring (only count unique templates)
            recurring_templates = db_pg.fetchval(conn, """
                SELECT COUNT(DISTINCT CONCAT(category, '|', LOWER(TRIM(description)), '|', LOWER(TRIM(COALESCE(supplier,'')))))
                FROM fin_expenses WHERE recurring = 'Yes'
            """) or 0

            # Average monthly expense from last 3 months
            avg_monthly_expense = float(db_pg.fetchval(conn, """
                SELECT COALESCE(AVG(monthly_total), 0) FROM (
                    SELECT SUM(amount_gross) AS monthly_total
                    FROM fin_expenses
                    WHERE expense_date >= CURRENT_DATE - INTERVAL '3 months'
                    GROUP BY TO_CHAR(expense_date, 'YYYY-MM')
                ) sub
            """) or 0)

            # Average payment collection time (days from invoice to payment)
            avg_collection_days = db_pg.fetchval(conn, """
                SELECT COALESCE(AVG(p.date_received - i.invoice_date), 30)
                FROM fin_payments p
                JOIN fin_invoices i ON i.id = p.invoice_id
                WHERE p.date_received IS NOT NULL AND i.invoice_date IS NOT NULL
            """) or 30

            # Overdue ageing
            overdue_0_30 = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(balance_due), 0) FROM fin_invoices
                WHERE status = 'Overdue' AND due_date >= CURRENT_DATE - 30
            """) or 0)
            overdue_31_60 = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(balance_due), 0) FROM fin_invoices
                WHERE status = 'Overdue' AND due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31
            """) or 0)
            overdue_60_plus = float(db_pg.fetchval(conn, """
                SELECT COALESCE(SUM(balance_due), 0) FROM fin_invoices
                WHERE status = 'Overdue' AND due_date < CURRENT_DATE - 60
            """) or 0)

        # Forecasted positions
        forecast_30d = cash_position + income_30d - avg_monthly_expense
        forecast_60d = forecast_30d + income_60d - avg_monthly_expense
        forecast_90d = forecast_60d + income_90d - avg_monthly_expense

        # Late payment interest (HMRC: 8% + BoE base rate, currently ~5.25%)
        late_interest_rate = 8.0 + 5.25  # 13.25% annual
        overdue_total = overdue_0_30 + overdue_31_60 + overdue_60_plus
        daily_interest = overdue_total * late_interest_rate / 100 / 365

        # Pre-compute conditional recommendation strings (avoids nested ternary in f-strings for Python <3.12)
        collection_note = "within terms" if avg_collection_days <= 30 else "consider tighter follow-up"
        runway_note = "sustainable" if cash_position > avg_monthly_expense * 3 else "less than 3 months runway, review costs"

        return {
            "current_cash_position": round(cash_position, 2),
            "forecast_30d": round(forecast_30d, 2),
            "forecast_60d": round(forecast_60d, 2),
            "forecast_90d": round(forecast_90d, 2),
            "expected_income": {
                "next_30d": round(income_30d, 2),
                "next_60d": round(income_60d, 2),
                "next_90d": round(income_90d, 2),
            },
            "avg_monthly_expense": round(avg_monthly_expense, 2),
            "monthly_recurring_expense": round(monthly_recurring, 2),
            "recurring_templates": recurring_templates,
            "avg_collection_days": round(float(avg_collection_days), 0),
            "overdue_ageing": {
                "0_30_days": round(overdue_0_30, 2),
                "31_60_days": round(overdue_31_60, 2),
                "60_plus_days": round(overdue_60_plus, 2),
                "total": round(overdue_total, 2),
            },
            "late_payment_interest": {
                "rate_annual_pct": late_interest_rate,
                "daily_interest_accruing": round(daily_interest, 2),
                "note": "UK Late Payment of Commercial Debts Act: 8% + BoE base rate",
            },
            "health": "good" if forecast_30d > 0 and overdue_total < cash_position * 0.3 else "warning" if forecast_30d > 0 else "critical",
            "recommendations": [r for r in [
                f"Average collection is {int(avg_collection_days)} days — {collection_note}",
                f"£{overdue_60_plus:,.2f} overdue 60+ days — escalate collection" if overdue_60_plus > 0 else None,
                f"Monthly burn rate: £{avg_monthly_expense:,.2f} — {runway_note}",
                f"Late payment interest accruing at £{daily_interest:,.2f}/day on £{overdue_total:,.2f} overdue" if overdue_total > 0 else None,
            ] if r],
        }
    except Exception as exc:
        logger.error("finance_cash_forecast error: %s", exc)
        return {"error": str(exc)}


# ── Operations ───────────────────────────────────────────────────────────────

@app.get("/api/operations")
def operations_overview():
    """Operations dashboard from ops_jobs and ops_cleaners."""
    try:
        with db_pg.transaction() as conn:
            # Auto-detect missed jobs (only last 7 days to avoid marking historical jobs)
            db_pg.execute(conn, """
                UPDATE ops_jobs SET status = 'Missed'
                WHERE status = 'Scheduled'
                  AND job_date < CURRENT_DATE
                  AND job_date >= CURRENT_DATE - INTERVAL '7 days'
            """)

            active_jobs = int(db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM ops_jobs WHERE status NOT IN ('Complete','Cancelled')
            """) or 0)
            total_sites = int(db_pg.fetchval(conn, """
                SELECT COUNT(DISTINCT site_id) FROM ops_jobs WHERE site_id IS NOT NULL
            """) or 0)
            missed_count = int(db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM ops_jobs WHERE status = 'Missed'
            """) or 0)

            # Today's jobs with cleaner info
            today_jobs = db_pg.fetchall(conn, """
                SELECT j.*, c.full_name AS cleaner_name, c.phone AS cleaner_phone
                FROM ops_jobs j
                LEFT JOIN ops_cleaners c ON c.id = j.cleaner_id
                WHERE j.job_date = CURRENT_DATE
                ORDER BY j.start_time
            """)

            # Schedule: next 7 days
            schedule = db_pg.fetchall(conn, """
                SELECT j.*, c.full_name AS cleaner_name
                FROM ops_jobs j
                LEFT JOIN ops_cleaners c ON c.id = j.cleaner_id
                WHERE j.job_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
                ORDER BY j.job_date, j.start_time
            """)

        return {
            "active_jobs": active_jobs,
            "total_sites": total_sites,
            "missed_count": missed_count,
            "today_jobs": [dict(r) for r in today_jobs],
            "schedule": [dict(r) for r in schedule],
        }
    except Exception as exc:
        logger.error("operations_overview error: %s", exc)
        return {"active_jobs": 0, "total_sites": 0, "missed_count": 0,
                "today_jobs": [], "schedule": []}


@app.post("/api/operations/jobs")
def create_job(body: dict = Body(...)):
    """Create an operations job."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                INSERT INTO ops_jobs
                    (site_id, client_name, job_date, start_time, staff_name, cleaner_id, notes)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                body["site_id"], body.get("client_name"),
                body.get("job_date", str(date.today())),
                body.get("start_time", "06:00"),
                body.get("staff_name"), body.get("cleaner_id"),
                body.get("notes"),
            ))
        return dict(row)
    except Exception as exc:
        logger.error("create_job error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/operations/jobs/{job_id}/clock-in")
def clock_in_job(job_id: int):
    """Clock in to a job."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                UPDATE ops_jobs SET status = 'InProgress', clock_in = NOW()
                WHERE id = %s RETURNING *
            """, (job_id,))
            if not row:
                raise HTTPException(status_code=404, detail="Job not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("clock_in error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/operations/jobs/{job_id}/clock-out")
def clock_out_job(job_id: int):
    """Clock out of a job. Updates cleaner's last_worked_date."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                UPDATE ops_jobs SET status = 'Complete', clock_out = NOW()
                WHERE id = %s RETURNING *
            """, (job_id,))
            if not row:
                raise HTTPException(status_code=404, detail="Job not found")

            # Update cleaner's last worked date
            if row.get("cleaner_id"):
                db_pg.execute(conn, """
                    UPDATE ops_cleaners SET last_worked_date = CURRENT_DATE, updated_at = NOW()
                    WHERE id = %s
                """, (row["cleaner_id"],))

        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("clock_out error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Cleaners ─────────────────────────────────────────────────────────────────

@app.get("/api/cleaners")
def list_cleaners():
    """Full cleaner database with KPI summary."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, "SELECT * FROM ops_cleaners ORDER BY full_name")

            total = len(rows)
            active = sum(1 for r in rows if r.get("status") == "Active")
            available_today = sum(1 for r in rows if r.get("currently_available") == "Yes" and r.get("status") == "Active")
            emergency_cover = sum(1 for r in rows if r.get("emergency_cover") == "Yes" and r.get("status") == "Active")
            compliance_ready = sum(1 for r in rows if r.get("compliance_status") == "Ready")
            dbs_checked = sum(1 for r in rows if r.get("dbs_status") in ("Enhanced", "Basic"))
            own_vehicle = sum(1 for r in rows if r.get("has_own_vehicle") == "Yes")

        return {
            "total": total,
            "active": active,
            "available_today": available_today,
            "emergency_cover": emergency_cover,
            "compliance_ready": compliance_ready,
            "dbs_checked": dbs_checked,
            "own_vehicle": own_vehicle,
            "cleaners": [dict(r) for r in rows],
        }
    except Exception as exc:
        logger.error("list_cleaners error: %s", exc)
        return {"total": 0, "active": 0, "available_today": 0, "emergency_cover": 0,
                "compliance_ready": 0, "dbs_checked": 0, "own_vehicle": 0, "cleaners": []}


@app.post("/api/cleaners")
def create_cleaner(body: dict = Body(...)):
    """Create a cleaner record."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                INSERT INTO ops_cleaners
                    (full_name, email, phone, home_postcode, borough,
                     cleaner_type, status, hourly_rate, availability_type,
                     currently_available, emergency_cover, transport_mode,
                     has_own_vehicle, services_offered, compliance_status,
                     dbs_status, notes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                body["full_name"], body.get("email"), body.get("phone"),
                body.get("home_postcode"), body.get("borough"),
                body.get("cleaner_type", "Employee"),
                body.get("status", "Active"),
                body.get("hourly_rate", 12.50),
                body.get("availability_type", "Full-time"),
                body.get("currently_available", "Yes"),
                body.get("emergency_cover", "No"),
                body.get("transport_mode", "Public Transport"),
                body.get("has_own_vehicle", "No"),
                body.get("services_offered"),
                body.get("compliance_status", "Pending"),
                body.get("dbs_status", "None"),
                body.get("notes"),
            ))
        return dict(row)
    except Exception as exc:
        logger.error("create_cleaner error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.put("/api/cleaners/{cleaner_id}")
def update_cleaner(cleaner_id: int, body: dict = Body(...)):
    """Update a cleaner record (partial update)."""
    try:
        allowed = [
            "full_name", "email", "phone", "home_postcode", "borough",
            "cleaner_type", "status", "hourly_rate", "availability_type",
            "currently_available", "emergency_cover", "transport_mode",
            "has_own_vehicle", "services_offered", "compliance_status",
            "dbs_status", "notes", "performance_rating",
        ]
        sets, vals = [], []
        for k, v in body.items():
            if k in allowed:
                sets.append(f"{k} = %s")
                vals.append(v)
        if not sets:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        sets.append("updated_at = NOW()")
        vals.append(cleaner_id)

        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, f"""
                UPDATE ops_cleaners SET {', '.join(sets)}
                WHERE id = %s RETURNING *
            """, tuple(vals))
            if not row:
                raise HTTPException(status_code=404, detail="Cleaner not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("update_cleaner error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/cleaners/{cleaner_id}/archive")
def archive_cleaner(cleaner_id: int):
    """Archive a cleaner."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                UPDATE ops_cleaners SET status = 'Archived', updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (cleaner_id,))
            if not row:
                raise HTTPException(status_code=404, detail="Cleaner not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("archive_cleaner error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/cleaners/{cleaner_id}/toggle-available")
def toggle_cleaner_availability(cleaner_id: int):
    """Toggle cleaner availability between Yes and No."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                UPDATE ops_cleaners
                SET currently_available = CASE WHEN currently_available = 'Yes' THEN 'No' ELSE 'Yes' END,
                    updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (cleaner_id,))
            if not row:
                raise HTTPException(status_code=404, detail="Cleaner not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("toggle_cleaner_availability error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Quality ──────────────────────────────────────────────────────────────────

@app.get("/api/quality")
def quality_overview():
    """Quality dashboard from ops_inspections and ops_incidents."""
    try:
        with db_pg.transaction() as conn:
            inspections = db_pg.fetchall(conn, """
                SELECT * FROM ops_inspections ORDER BY inspection_date DESC
            """)
            incidents = db_pg.fetchall(conn, """
                SELECT * FROM ops_incidents ORDER BY incident_date DESC
            """)

            total_inspections = len(inspections)
            avg_score = round(
                sum(float(i.get("score") or 0) for i in inspections) / max(total_inspections, 1), 1
            )
            inspections_this_month = sum(
                1 for i in inspections
                if i.get("inspection_date") and str(i["inspection_date"])[:7] == str(date.today())[:7]
            )
            open_incidents = sum(1 for i in incidents if i.get("status") == "Open")

        return {
            "avg_score": avg_score,
            "inspections_this_month": inspections_this_month,
            "open_incidents": open_incidents,
            "total_inspections": total_inspections,
            "inspections": [dict(r) for r in inspections],
            "incidents": [dict(r) for r in incidents],
        }
    except Exception as exc:
        logger.error("quality_overview error: %s", exc)
        return {"avg_score": 0, "inspections_this_month": 0, "open_incidents": 0,
                "total_inspections": 0, "inspections": [], "incidents": []}


@app.post("/api/quality/inspections")
def create_inspection(body: dict = Body(...)):
    """Create an inspection record."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                INSERT INTO ops_inspections
                    (site_id, client_name, inspection_date, inspector, score, notes)
                VALUES (%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                body.get("site_id"), body.get("client_name"),
                body.get("inspection_date", str(date.today())),
                body["inspector"], body["score"], body.get("notes"),
            ))
        return dict(row)
    except Exception as exc:
        logger.error("create_inspection error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/quality/incidents")
def create_incident(body: dict = Body(...)):
    """Create an incident record."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                INSERT INTO ops_incidents
                    (site_id, client_name, incident_type, description)
                VALUES (%s,%s,%s,%s)
                RETURNING *
            """, (
                body.get("site_id"), body.get("client_name"),
                body["incident_type"], body["description"],
            ))
        return dict(row)
    except Exception as exc:
        logger.error("create_incident error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/quality/incidents/{incident_id}/resolve")
def resolve_incident(incident_id: int, body: dict = Body(...)):
    """Resolve an incident."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                UPDATE ops_incidents
                SET status = 'Resolved', resolution = %s, resolved_at = NOW()
                WHERE id = %s RETURNING *
            """, (body["resolution"], incident_id))
            if not row:
                raise HTTPException(status_code=404, detail="Incident not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("resolve_incident error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Payroll ──────────────────────────────────────────────────────────────────

@app.get("/api/payroll")
def payroll_overview():
    """Payroll dashboard from pay_entries and pay_workers."""
    try:
        with db_pg.transaction() as conn:
            # Entries joined with workers
            entries = db_pg.fetchall(conn, """
                SELECT pe.*, pw.full_name AS worker_full_name, pw.role AS worker_role,
                       pw.default_hourly_rate, pw.payment_method, pw.payroll_type
                FROM pay_entries pe
                JOIN pay_workers pw ON pw.id = pe.worker_id
                ORDER BY pe.entry_date DESC
            """)

            # Workers with aggregated data
            workers = db_pg.fetchall(conn, """
                SELECT pw.*,
                    COALESCE(agg.total_hours, 0) AS total_hours,
                    COALESCE(agg.total_pay, 0) AS total_pay,
                    COALESCE(agg.entry_count, 0) AS entry_count
                FROM pay_workers pw
                LEFT JOIN LATERAL (
                    SELECT SUM(hours_worked) AS total_hours,
                           SUM(total_pay) AS total_pay,
                           COUNT(*) AS entry_count
                    FROM pay_entries WHERE worker_id = pw.id
                ) agg ON TRUE
                ORDER BY pw.full_name
            """)

            # Summary
            total_gross = sum(float(e.get("total_pay") or 0) for e in entries)
            total_hours = sum(float(e.get("hours_worked") or 0) for e in entries)
            pending_count = sum(1 for e in entries if e.get("status") == "pending")
            approved_count = sum(1 for e in entries if e.get("status") == "approved")
            paid_count = sum(1 for e in entries if e.get("status") == "paid")

            # Payroll groups: grouped by worker_id + period (YYYY-MM)
            groups_map = {}
            for e in entries:
                period = str(e.get("entry_date", ""))[:7]
                key = (e["worker_id"], period)
                if key not in groups_map:
                    groups_map[key] = {
                        "worker_id": e["worker_id"],
                        "worker_name": e.get("worker_name") or e.get("worker_full_name", ""),
                        "period": period,
                        "total_hours": 0,
                        "total_pay": 0,
                        "statuses": set(),
                    }
                groups_map[key]["total_hours"] += float(e.get("hours_worked") or 0)
                groups_map[key]["total_pay"] += float(e.get("total_pay") or 0)
                groups_map[key]["statuses"].add(e.get("status", "pending"))

            payroll_groups = []
            for g in groups_map.values():
                statuses = g.pop("statuses")
                if statuses == {"paid"}:
                    g["status"] = "paid"
                elif statuses == {"approved"}:
                    g["status"] = "approved"
                else:
                    g["status"] = "pending"
                g["total_hours"] = round(g["total_hours"], 2)
                g["total_pay"] = round(g["total_pay"], 2)
                payroll_groups.append(g)

        return {
            "summary": {
                "total_gross": round(total_gross, 2),
                "pending_count": pending_count,
                "approved_count": approved_count,
                "paid_count": paid_count,
                "total_hours": round(total_hours, 2),
            },
            "entries": [dict(e) for e in entries],
            "workers": [dict(w) for w in workers],
            "payroll_groups": payroll_groups,
        }
    except Exception as exc:
        logger.error("payroll_overview error: %s", exc)
        return {
            "summary": {"total_gross": 0, "pending_count": 0, "approved_count": 0,
                         "paid_count": 0, "total_hours": 0},
            "entries": [], "workers": [], "payroll_groups": [],
        }


@app.post("/api/payroll/entries")
def create_payroll_entry(body: dict = Body(...)):
    """Create a payroll entry with auto-calculated total_pay."""
    try:
        with db_pg.transaction() as conn:
            worker = db_pg.fetchone(conn, "SELECT * FROM pay_workers WHERE id = %s", (body["worker_id"],))
            if not worker:
                raise HTTPException(status_code=404, detail="Worker not found")

            entry_type = body.get("entry_type", "Basic Hours")
            hours = float(body["hours_worked"])
            hourly_rate = float(body.get("hourly_rate") or worker["default_hourly_rate"] or 12.50)

            # Apply multiplier
            multipliers = {
                "Overtime x1.5": 1.5,
                "Overtime x2": 2.0,
                "Night Shift": 1.3,
            }
            multiplier = multipliers.get(entry_type, 1.0)
            total_pay = round(hours * hourly_rate * multiplier, 2)

            row = db_pg.fetchone(conn, """
                INSERT INTO pay_entries
                    (worker_id, worker_name, role, entry_date, entry_type,
                     hours_worked, hourly_rate, total_pay, site_id, contract_id, notes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                body["worker_id"], worker["full_name"], worker.get("role", "Cleaner"),
                body.get("entry_date", str(date.today())), entry_type,
                hours, hourly_rate, total_pay,
                body.get("site_id"), body.get("contract_id"), body.get("notes"),
            ))
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("create_payroll_entry error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/payroll/workers")
def create_payroll_worker(body: dict = Body(...)):
    """Create a payroll worker."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                INSERT INTO pay_workers
                    (full_name, role, phone, email, address, date_of_birth,
                     start_date, ni_number, tax_code, default_hourly_rate,
                     payment_method, payroll_type)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                body["full_name"], body.get("role", "Cleaner"),
                body.get("phone"), body.get("email"), body.get("address"),
                body.get("date_of_birth"), body.get("start_date"),
                body.get("ni_number"), body.get("tax_code", "1257L"),
                body.get("default_hourly_rate", 12.50),
                body.get("payment_method", "BACS"),
                body.get("payroll_type", "PAYE"),
            ))
        return dict(row)
    except Exception as exc:
        logger.error("create_payroll_worker error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.put("/api/payroll/workers/{worker_id}")
def update_payroll_worker(worker_id: int, body: dict = Body(...)):
    """Update a payroll worker (partial update)."""
    try:
        allowed = [
            "full_name", "role", "phone", "email", "address", "date_of_birth",
            "start_date", "ni_number", "tax_code", "default_hourly_rate",
            "payment_method", "payroll_type", "status",
        ]
        sets, vals = [], []
        for k, v in body.items():
            if k in allowed:
                sets.append(f"{k} = %s")
                vals.append(v)
        if not sets:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        sets.append("updated_at = NOW()")
        vals.append(worker_id)

        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, f"""
                UPDATE pay_workers SET {', '.join(sets)}
                WHERE id = %s RETURNING *
            """, tuple(vals))
            if not row:
                raise HTTPException(status_code=404, detail="Worker not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("update_payroll_worker error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/payroll/approve")
def approve_payroll_group(body: dict = Body(...)):
    """Approve a payroll group (worker + period). Creates a Labour expense and transaction."""
    try:
        worker_id = body["worker_id"]
        period = body["period"]  # YYYY-MM

        with db_pg.transaction() as conn:
            # Update entries to approved
            db_pg.execute(conn, """
                UPDATE pay_entries SET status = 'approved'
                WHERE worker_id = %s
                  AND TO_CHAR(entry_date, 'YYYY-MM') = %s
                  AND status = 'pending'
            """, (worker_id, period))

            # Calculate total for the group
            agg = db_pg.fetchone(conn, """
                SELECT COALESCE(SUM(total_pay), 0) AS total_pay,
                       COALESCE(SUM(hours_worked), 0) AS total_hours
                FROM pay_entries
                WHERE worker_id = %s AND TO_CHAR(entry_date, 'YYYY-MM') = %s
            """, (worker_id, period))

            total_pay = float(agg["total_pay"] or 0)
            worker = db_pg.fetchone(conn, "SELECT * FROM pay_workers WHERE id = %s", (worker_id,))
            worker_name = worker["full_name"] if worker else "Unknown"

            # Create labour expense
            db_pg.execute(conn, """
                INSERT INTO fin_expenses
                    (expense_date, category, description, supplier, amount_gross)
                VALUES (%s, 'Labour', %s, %s, %s)
            """, (
                f"{period}-28", f"Payroll {period} - {worker_name}",
                worker_name, total_pay,
            ))

            # Create transaction
            db_pg.execute(conn, """
                INSERT INTO fin_transactions
                    (transaction_date, type, category, description, party, amount_gross)
                VALUES (%s, 'expense', 'Labour', %s, %s, %s)
            """, (
                f"{period}-28", f"Payroll {period} - {worker_name}",
                worker_name, total_pay,
            ))

        return {"approved": True, "worker_id": worker_id, "period": period, "total_pay": total_pay}
    except Exception as exc:
        logger.error("approve_payroll_group error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/payroll/mark-paid")
def mark_payroll_paid(body: dict = Body(...)):
    """Mark a payroll group as paid."""
    try:
        worker_id = body["worker_id"]
        period = body["period"]

        with db_pg.transaction() as conn:
            db_pg.execute(conn, """
                UPDATE pay_entries SET status = 'paid'
                WHERE worker_id = %s
                  AND TO_CHAR(entry_date, 'YYYY-MM') = %s
                  AND status IN ('pending','approved')
            """, (worker_id, period))

        return {"paid": True, "worker_id": worker_id, "period": period}
    except Exception as exc:
        logger.error("mark_payroll_paid error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── SEO ──────────────────────────────────────────────────────────────────────

import random as _random
import hashlib as _hashlib

def _generate_seo_article(keyword: str, title: str) -> str:
    """Generate a substantial, professional SEO article (800-1200 words) for AskMiro Cleaning Services.

    Uses template-based generation with keyword-aware section selection to produce
    unique, well-structured HTML articles about commercial cleaning topics.
    """
    kw = keyword.lower()
    kw_title = keyword.title()
    # Deterministic seed from keyword so same keyword = same article (idempotent)
    seed = int(_hashlib.md5(kw.encode()).hexdigest()[:8], 16)
    rng = _random.Random(seed)

    # ── Detect topic category ──
    category = "general"
    if any(w in kw for w in ["office", "commercial", "corporate", "workspace"]):
        category = "office"
    elif any(w in kw for w in ["end of tenancy", "move out", "move-out", "tenant"]):
        category = "tenancy"
    elif any(w in kw for w in ["deep clean", "deep-clean", "intensive"]):
        category = "deep"
    elif any(w in kw for w in ["eco", "green", "sustainable", "environment"]):
        category = "eco"
    elif any(w in kw for w in ["kitchen", "restaurant", "food", "catering"]):
        category = "kitchen"
    elif any(w in kw for w in ["school", "education", "university", "college"]):
        category = "school"
    elif any(w in kw for w in ["industrial", "warehouse", "factory", "manufactur"]):
        category = "industrial"
    elif any(w in kw for w in ["contract", "outsourc", "facilities"]):
        category = "contract"
    elif any(w in kw for w in ["carpet", "floor", "window", "upholster"]):
        category = "specialist"
    elif any(w in kw for w in ["gym", "leisure", "fitness", "sport"]):
        category = "gym"
    elif any(w in kw for w in ["medical", "dental", "clinic", "health", "hospital", "surgery"]):
        category = "medical"
    elif any(w in kw for w in ["retail", "shop", "store", "showroom"]):
        category = "retail"
    elif any(w in kw for w in ["checklist", "how to", "guide", "tips"]):
        category = "guide"

    # ── Section pools by category ──
    intro_pool = {
        "office": (
            f"<p>A clean office is not a luxury — it is a business necessity. Studies consistently show that "
            f"employees working in well-maintained environments are more productive, take fewer sick days, and "
            f"report higher job satisfaction. For companies across London and the UK, investing in professional "
            f"<strong>{kw}</strong> is one of the smartest operational decisions you can make.</p>"
            f"<p>At <strong>AskMiro Cleaning Services</strong> (a trading name of Miro Partners Ltd), we have "
            f"built our reputation on delivering reliable, high-standard {kw} that businesses can depend on "
            f"week after week. In this article, we explore why professional cleaning matters, what to look for "
            f"in a provider, and how our approach sets us apart.</p>"
        ),
        "tenancy": (
            f"<p>Moving out of a rental property is stressful enough without worrying about whether you will "
            f"get your deposit back. One of the most common reasons landlords withhold deposits is inadequate "
            f"cleaning. Professional <strong>{kw}</strong> ensures every surface, appliance, and fixture meets "
            f"the strict standards that letting agents and landlords expect.</p>"
            f"<p><strong>AskMiro Cleaning Services</strong> specialises in thorough, deposit-friendly "
            f"end-of-tenancy cleans across London. Our teams follow detailed checklists that cover every room "
            f"from top to bottom, giving you the best possible chance of a full deposit return.</p>"
        ),
        "eco": (
            f"<p>The demand for <strong>{kw}</strong> has surged as businesses recognise their environmental "
            f"responsibilities. From reducing chemical runoff to cutting plastic waste, green cleaning is no "
            f"longer a niche preference — it is becoming the industry standard. Forward-thinking companies "
            f"know that sustainability and cleanliness go hand in hand.</p>"
            f"<p>At <strong>AskMiro Cleaning Services</strong>, we have embraced eco-friendly practices across "
            f"every aspect of our operations. We use biodegradable products, microfibre technology that reduces "
            f"chemical use by up to 90%, and efficient scheduling to minimise our carbon footprint. This guide "
            f"explores why green cleaning matters and how to choose the right provider.</p>"
        ),
        "kitchen": (
            f"<p>Commercial kitchen hygiene is not optional — it is a legal requirement. The Food Standards "
            f"Agency conducts regular inspections, and a poor hygiene rating can devastate a food business "
            f"overnight. Professional <strong>{kw}</strong> is essential to maintaining compliance, protecting "
            f"your reputation, and ensuring the safety of every meal you serve.</p>"
            f"<p><strong>AskMiro Cleaning Services</strong> provides specialist kitchen cleaning to restaurants, "
            f"cafes, catering companies, and commercial kitchens across London. Our teams understand HACCP "
            f"requirements and use food-safe products that meet all regulatory standards.</p>"
        ),
        "school": (
            f"<p>Schools and educational institutions present unique cleaning challenges. High footfall, young "
            f"immune systems, and diverse spaces — from classrooms to sports halls — demand a cleaning partner "
            f"who understands the sector. Professional <strong>{kw}</strong> helps protect students, staff, and "
            f"visitors while maintaining an environment conducive to learning.</p>"
            f"<p><strong>AskMiro Cleaning Services</strong> works with schools, colleges, and nurseries across "
            f"London, providing term-time and holiday cleaning programmes tailored to each institution. Our "
            f"DBS-checked teams use child-safe products and follow strict safeguarding protocols.</p>"
        ),
    }
    default_intro = (
        f"<p>Finding the right cleaning partner can transform the way your business operates. Whether you "
        f"manage an office block, a retail outlet, or a multi-site portfolio, professional "
        f"<strong>{kw}</strong> keeps your premises spotless, your staff healthy, and your brand image sharp. "
        f"In today's competitive market, cleanliness is not just about aesthetics — it directly impacts "
        f"employee productivity, customer perception, and regulatory compliance.</p>"
        f"<p><strong>AskMiro Cleaning Services</strong> (operated by Miro Partners Ltd) provides expert "
        f"cleaning solutions across London and the wider UK. In this comprehensive guide, we cover everything "
        f"you need to know about {kw}, from choosing a provider to understanding what a professional clean "
        f"actually involves.</p>"
    )
    intro = intro_pool.get(category, default_intro)

    # ── Middle sections (pick 4-5 from a pool) ──
    all_sections = [
        (
            f"<h2>Why Professional {kw_title} Matters</h2>"
            f"<p>Keeping your premises clean is about far more than appearances. A properly maintained "
            f"environment reduces the spread of illness, lowers absenteeism, and creates a positive first "
            f"impression for clients and visitors. Research from the British Cleaning Council found that "
            f"businesses investing in professional cleaning see measurable improvements in staff morale and "
            f"customer satisfaction.</p>"
            f"<p>DIY cleaning or relying on untrained staff often leads to inconsistent results, missed areas, "
            f"and potential health and safety issues. A professional team brings the expertise, equipment, and "
            f"accountability that in-house efforts simply cannot match.</p>"
        ),
        (
            f"<h2>What to Look for in a {kw_title} Provider</h2>"
            f"<p>Not all cleaning companies are created equal. When evaluating providers for {kw}, consider "
            f"the following factors:</p>"
            f"<ul>"
            f"<li><strong>Insurance and accreditations</strong> — Look for public liability insurance (minimum "
            f"&pound;5 million), employer's liability cover, and industry certifications such as ISO 9001 or "
            f"BICSc membership.</li>"
            f"<li><strong>Staff vetting</strong> — Ensure all operatives are DBS-checked and have received "
            f"proper training in COSHH (Control of Substances Hazardous to Health) regulations.</li>"
            f"<li><strong>Transparent pricing</strong> — Avoid providers who quote without a site survey. A "
            f"reputable company will visit your premises, understand your requirements, and provide a detailed "
            f"breakdown.</li>"
            f"<li><strong>Flexibility</strong> — Your cleaning schedule should work around your business, not "
            f"the other way round. Look for providers offering early morning, evening, and weekend slots.</li>"
            f"<li><strong>References and reviews</strong> — Ask for case studies or client testimonials. A "
            f"company with a proven track record will be happy to share them.</li>"
            f"</ul>"
        ),
        (
            f"<h2>Our Approach to {kw_title}</h2>"
            f"<p>At AskMiro, we believe exceptional cleaning starts with exceptional planning. Every new "
            f"client engagement begins with a free, no-obligation site assessment where we map out your "
            f"premises, identify high-traffic zones, and discuss any specific requirements — from allergy-"
            f"friendly products to secure-area protocols.</p>"
            f"<p>We then create a bespoke cleaning specification document that details exactly what will be "
            f"done, how often, and to what standard. This document becomes the benchmark for regular quality "
            f"audits carried out by our operations team, ensuring consistency from day one.</p>"
            f"<p>Our cleaners are equipped with colour-coded microfibre systems to prevent cross-contamination, "
            f"commercial-grade vacuums with HEPA filtration, and a full range of eco-certified cleaning agents. "
            f"Every operative receives ongoing training and is supervised by a dedicated account manager who "
            f"serves as your single point of contact.</p>"
        ),
        (
            f"<h2>Health, Safety, and Compliance</h2>"
            f"<p>UK businesses have a legal duty under the Health and Safety at Work Act 1974 to maintain a "
            f"safe and clean working environment. Failure to comply can result in enforcement action from the "
            f"HSE, costly fines, and reputational damage. Professional {kw} helps you meet these obligations "
            f"with confidence.</p>"
            f"<p>AskMiro maintains full compliance with all relevant legislation, including:</p>"
            f"<ul>"
            f"<li>COSHH Regulations 2002 — all products assessed and data sheets available on request</li>"
            f"<li>The Workplace (Health, Safety and Welfare) Regulations 1992</li>"
            f"<li>Fire safety and emergency procedures for cleaning operatives</li>"
            f"<li>GDPR compliance for any client data handled during service delivery</li>"
            f"</ul>"
            f"<p>We carry &pound;10 million public liability insurance and &pound;10 million employer's "
            f"liability insurance, providing complete peace of mind for our clients.</p>"
        ),
        (
            f"<h2>The Cost of {kw_title}: What to Expect</h2>"
            f"<p>Pricing for {kw} varies depending on the size of your premises, the frequency of service, "
            f"and any specialist requirements. As a general guide, regular office cleaning in London typically "
            f"ranges from &pound;12 to &pound;18 per hour, while specialist services such as deep cleans or "
            f"floor restoration are priced on a per-project basis.</p>"
            f"<p>At AskMiro, we provide transparent, all-inclusive quotes with no hidden fees. Our contracts "
            f"are flexible — we offer rolling monthly agreements rather than locking clients into long-term "
            f"commitments. This means you stay because of the quality of our service, not because of a "
            f"contractual obligation.</p>"
            f"<p>We also offer a <strong>free trial clean</strong> for new clients, so you can experience our "
            f"standards first-hand before making any commitment.</p>"
        ),
        (
            f"<h2>Eco-Friendly Cleaning Practices</h2>"
            f"<p>Sustainability is at the heart of our operations. We have invested in green cleaning "
            f"technology that delivers outstanding results while minimising environmental impact:</p>"
            f"<ul>"
            f"<li><strong>Biodegradable products</strong> — all our standard cleaning agents are plant-based "
            f"and free from harsh chemicals</li>"
            f"<li><strong>Microfibre systems</strong> — reduce water and chemical usage by up to 90% compared "
            f"to traditional methods</li>"
            f"<li><strong>Concentrated refills</strong> — minimise plastic waste by using refillable spray "
            f"bottles and bulk concentrates</li>"
            f"<li><strong>Route optimisation</strong> — we plan our team movements to reduce fuel consumption "
            f"and carbon emissions</li>"
            f"</ul>"
            f"<p>For clients seeking formal green credentials, we can provide documentation to support your "
            f"ESG reporting and sustainability targets.</p>"
        ),
        (
            f"<h2>Tailored Cleaning Schedules</h2>"
            f"<p>Every business is different, and a one-size-fits-all approach to {kw} simply does not work. "
            f"A busy call centre with 200 staff needs a very different programme to a boutique design studio "
            f"with a dozen people. That is why every AskMiro contract is built around your specific "
            f"requirements.</p>"
            f"<p>We offer daily, weekly, fortnightly, and one-off cleaning options. Services can be scheduled "
            f"for early mornings (from 5:00 AM), daytime, evenings, or weekends — whatever causes the least "
            f"disruption to your operations. Our real-time scheduling system means you can request additional "
            f"cleans or adjust your programme at any time through your dedicated account manager.</p>"
        ),
        (
            f"<h2>Quality Assurance and Inspections</h2>"
            f"<p>Consistency is what separates a good cleaning company from a great one. AskMiro runs a "
            f"rigorous quality assurance programme that includes:</p>"
            f"<ul>"
            f"<li><strong>Monthly site inspections</strong> scored against your agreed specification</li>"
            f"<li><strong>Photographic audits</strong> documenting the condition of key areas</li>"
            f"<li><strong>Client satisfaction surveys</strong> sent quarterly to facility managers</li>"
            f"<li><strong>Mystery quality checks</strong> carried out by our operations team without prior "
            f"notice to the cleaning crew</li>"
            f"</ul>"
            f"<p>Inspection results are shared with you via a clear report, and any issues are addressed "
            f"within 24 hours. This transparent approach has helped us maintain a client retention rate of "
            f"over 95%.</p>"
        ),
        (
            f"<h2>Specialist Services We Offer</h2>"
            f"<p>Beyond routine cleaning, AskMiro provides a range of specialist services that complement "
            f"your regular programme:</p>"
            f"<ul>"
            f"<li><strong>Deep cleaning</strong> — intensive one-off cleans for kitchens, washrooms, and "
            f"high-use areas</li>"
            f"<li><strong>Carpet and upholstery cleaning</strong> — hot water extraction and dry cleaning "
            f"methods for all fibre types</li>"
            f"<li><strong>Window cleaning</strong> — internal and external, including high-level access</li>"
            f"<li><strong>Floor care</strong> — stripping, sealing, buffing, and restoration for hard floors</li>"
            f"<li><strong>Post-construction cleaning</strong> — builder's cleans and sparkle cleans for new "
            f"or refurbished spaces</li>"
            f"<li><strong>Waste management</strong> — recycling programmes and confidential waste disposal</li>"
            f"</ul>"
        ),
        (
            f"<h2>Serving London and Beyond</h2>"
            f"<p>AskMiro Cleaning Services is headquartered in London, but our operations cover the entire "
            f"Greater London area and parts of the Home Counties. Whether your premises are in the City of "
            f"London, Canary Wharf, West End, or the outer boroughs, we have teams ready to serve you.</p>"
            f"<p>For multi-site businesses, we offer a single-contract solution that ensures consistent "
            f"standards across all your locations. One account manager, one invoice, one set of quality "
            f"benchmarks — simplicity at scale.</p>"
        ),
    ]

    # Shuffle and pick 4-5 sections
    rng.shuffle(all_sections)
    num_sections = rng.choice([4, 5])
    chosen_sections = all_sections[:num_sections]

    # ── CTA / closing section (always included) ──
    cta = (
        f"<h2>Get a Free Quote Today</h2>"
        f"<p>If you are looking for reliable, professional <strong>{kw}</strong>, AskMiro Cleaning Services "
        f"is here to help. We offer free site assessments, transparent pricing, and flexible contracts "
        f"designed around your needs.</p>"
        f"<p>Contact us today to discuss your requirements:</p>"
        f"<ul>"
        f"<li><strong>Email:</strong> office@askmiro.com</li>"
        f"<li><strong>Website:</strong> <a href=\"https://www.askmiro.com\">www.askmiro.com</a></li>"
        f"</ul>"
        f"<p>Let AskMiro take care of the cleaning so you can focus on what matters most — running your "
        f"business.</p>"
    )

    # ── Assemble final HTML ──
    html_parts = [
        f"<h1>{title}</h1>",
        intro,
        *chosen_sections,
        cta,
    ]
    html = "\n".join(html_parts)
    return html


@app.get("/api/seo-content")
def seo_content():
    """SEO dashboard from seo_articles and seo_keywords."""
    try:
        with db_pg.transaction() as conn:
            published = int(db_pg.fetchval(conn,
                "SELECT COUNT(*) FROM seo_articles WHERE status = 'published'"
            ) or 0)
            drafts = int(db_pg.fetchval(conn,
                "SELECT COUNT(*) FROM seo_articles WHERE status = 'draft'"
            ) or 0)
            keywords_tracked = int(db_pg.fetchval(conn,
                "SELECT COUNT(*) FROM seo_keywords WHERE tracked = TRUE"
            ) or 0)
            avg_position = db_pg.fetchval(conn,
                "SELECT ROUND(AVG(position)::NUMERIC, 1) FROM seo_keywords WHERE position IS NOT NULL"
            )
            articles = db_pg.fetchall(conn,
                "SELECT * FROM seo_articles ORDER BY created_at DESC"
            )
        return {
            "published": published,
            "drafts": drafts,
            "keywords_tracked": keywords_tracked,
            "avg_position": float(avg_position) if avg_position else None,
            "content": [dict(r) for r in articles],
        }
    except Exception as exc:
        logger.error("seo_content error: %s", exc)
        return {"published": 0, "drafts": 0, "keywords_tracked": 0,
                "avg_position": None, "content": []}


@app.post("/api/seo/articles")
def create_seo_article(body: dict = Body(...)):
    """Create an SEO article."""
    try:
        title = body["title"]
        slug = body.get("slug") or title.lower().replace(" ", "-").replace("'", "")
        # Strip non-alphanumeric (except hyphens) for a clean slug
        slug = "".join(c for c in slug if c.isalnum() or c == "-")

        html_content = body.get("html_content", "")
        word_count = len(html_content.split()) if html_content else 0

        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                INSERT INTO seo_articles
                    (title, slug, target_keyword, content_type, html_content,
                     meta_description, word_count)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                title, slug, body.get("target_keyword"),
                body.get("content_type", "blog"), html_content,
                body.get("meta_description"), word_count,
            ))
        return dict(row)
    except Exception as exc:
        logger.error("create_seo_article error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.put("/api/seo/articles/{article_id}")
def update_seo_article(article_id: int, body: dict = Body(...)):
    """Update an SEO article (partial update)."""
    try:
        allowed = [
            "title", "slug", "target_keyword", "content_type", "status",
            "html_content", "meta_description", "live_url", "github_commit_url",
        ]
        sets, vals = [], []
        for k, v in body.items():
            if k in allowed:
                sets.append(f"{k} = %s")
                vals.append(v)

        # Recalculate word_count if html_content changed
        if "html_content" in body:
            sets.append("word_count = %s")
            vals.append(len((body["html_content"] or "").split()))

        if not sets:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        sets.append("updated_at = NOW()")
        vals.append(article_id)

        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, f"""
                UPDATE seo_articles SET {', '.join(sets)}
                WHERE id = %s RETURNING *
            """, tuple(vals))
            if not row:
                raise HTTPException(status_code=404, detail="Article not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("update_seo_article error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/seo/articles/{article_id}/publish")
def publish_seo_article(article_id: int):
    """Publish an SEO article."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                UPDATE seo_articles SET status = 'published', published_at = NOW(), updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (article_id,))
            if not row:
                raise HTTPException(status_code=404, detail="Article not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("publish_seo_article error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/seo/keywords")
def add_seo_keyword(body: dict = Body(...)):
    """Add an SEO keyword to track."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                INSERT INTO seo_keywords (keyword, intent, volume, difficulty)
                VALUES (%s,%s,%s,%s)
                RETURNING *
            """, (
                body["keyword"],
                body.get("intent", "informational"),
                body.get("volume"), body.get("difficulty"),
            ))
        return dict(row)
    except Exception as exc:
        logger.error("add_seo_keyword error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/seo/generate")
def seo_generate(body: dict = Body(...)):
    """AI-powered SEO generation: suggest keywords, generate article, or publish."""
    try:
        mode = body.get("mode", "suggest")

        if mode == "suggest":
            # Return AI-generated keyword suggestions for cleaning services
            suggestions = [
                {"keyword": "commercial cleaning services London", "intent": "transactional", "volume": 2400, "difficulty": 45},
                {"keyword": "office cleaning company near me", "intent": "transactional", "volume": 1900, "difficulty": 38},
                {"keyword": "end of tenancy cleaning London", "intent": "transactional", "volume": 3100, "difficulty": 52},
                {"keyword": "professional deep cleaning services", "intent": "commercial", "volume": 1200, "difficulty": 35},
                {"keyword": "how to clean commercial kitchen", "intent": "informational", "volume": 880, "difficulty": 22},
                {"keyword": "commercial cleaning checklist", "intent": "informational", "volume": 720, "difficulty": 18},
                {"keyword": "contract cleaning services UK", "intent": "transactional", "volume": 1600, "difficulty": 41},
                {"keyword": "industrial cleaning company London", "intent": "transactional", "volume": 950, "difficulty": 39},
                {"keyword": "eco friendly cleaning services", "intent": "commercial", "volume": 1100, "difficulty": 28},
                {"keyword": "school cleaning contracts London", "intent": "transactional", "volume": 590, "difficulty": 32},
            ]
            return {"suggestions": suggestions}

        elif mode in ("generate", "article"):
            keyword = body.get("keyword", "commercial cleaning services")
            slug = body.get("slug") or keyword.lower().replace(" ", "-")
            slug = "".join(c for c in slug if c.isalnum() or c == "-")
            title = body.get("title") or keyword.title()
            html = _generate_seo_article(keyword, title)
            # Save as draft so we get an id for publishing
            word_count = len(html.split()) if html else 0
            try:
                with db_pg.transaction() as conn:
                    row = db_pg.fetchone(conn, """
                        INSERT INTO seo_articles
                            (title, slug, target_keyword, content_type, html_content,
                             word_count, status)
                        VALUES (%s,%s,%s,'blog',%s,%s,'draft')
                        RETURNING *
                    """, (title, slug, keyword, html, word_count))
                article = dict(row) if row else {}
            except Exception:
                article = {}
            return {
                "id": article.get("id"),
                "title": title,
                "slug": slug,
                "keyword": keyword,
                "html": html,
                "word_count": word_count,
                "filename": f"{slug}.html",
            }

        elif mode == "publish":
            # Store article and return success
            with db_pg.transaction() as conn:
                title = body.get("title", "Untitled")
                slug = body.get("slug") or title.lower().replace(" ", "-")
                slug = "".join(c for c in slug if c.isalnum() or c == "-")
                html = body.get("html", "")
                word_count = len(html.split()) if html else 0

                row = db_pg.fetchone(conn, """
                    INSERT INTO seo_articles
                        (title, slug, target_keyword, html_content, word_count,
                         status, published_at)
                    VALUES (%s,%s,%s,%s,%s,'published', NOW())
                    RETURNING *
                """, (title, slug, body.get("keyword"), html, word_count))
            return dict(row)

        else:
            raise HTTPException(status_code=400, detail=f"Unknown mode: {mode}")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("seo_generate error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Entity Intelligence ──────────────────────────────────────────────────────

@app.get("/api/leads/{place_id}/intelligence")
def get_lead_intelligence(place_id: str):
    """
    Deep intelligence panel for an entity — signals, council supply list,
    renewal predictions, and contact info.
    """
    try:
        with db_pg.transaction() as conn:
            # Resolve entity_id
            entity_id = db_pg.fetchval(conn, """
                SELECT COALESCE(
                    (SELECT entity_id FROM entity_source_links WHERE source_record_id = %s LIMIT 1),
                    (SELECT id FROM entities WHERE id::TEXT = %s LIMIT 1)
                )
            """, (place_id, place_id))

            if not entity_id:
                raise HTTPException(status_code=404, detail="Entity not found")

            # Signals
            signals = db_pg.fetchall(conn, """
                SELECT signal_type::TEXT, headline, detail, source_url,
                       urgency_score, confidence, detected_at, active
                FROM signals
                WHERE entity_id = %s
                ORDER BY urgency_score DESC NULLS LAST, detected_at DESC
                LIMIT 20
            """, (entity_id,))

            # Council supply list intel
            supply = db_pg.fetchall(conn, """
                SELECT council_name, list_source, company_type, contract_access,
                       priority_score, priority_reason, comp_strength, comp_weakness, comp_beat
                FROM council_supply_lists
                WHERE entity_id = %s
                ORDER BY priority_score DESC
            """, (entity_id,))

            # Contacts
            contacts = db_pg.fetchall(conn, """
                SELECT full_name, job_title, email, phone, linkedin_url,
                       is_primary, confidence_score, source
                FROM contacts
                WHERE entity_id = %s
                ORDER BY is_primary DESC, confidence_score DESC NULLS LAST
            """, (entity_id,))

            # Renewal predictions
            renewals = db_pg.fetchall(conn, """
                SELECT predicted_renewal_date, confidence_score, contract_type,
                       estimated_value_gbp, recommendation
                FROM renewal_predictions
                WHERE entity_id = %s
                ORDER BY predicted_renewal_date ASC
                LIMIT 5
            """, (entity_id,))

            # Quotes
            quotes = db_pg.fetchall(conn, """
                SELECT q.id, q.quote_value_gbp, q.quote_date, q.valid_until,
                       q.service_description, q.status, q.created_at
                FROM quotes q
                JOIN opportunities o ON o.id = q.opportunity_id
                WHERE o.entity_id = %s
                ORDER BY q.created_at DESC
            """, (entity_id,))

        return {
            "entity_id": entity_id,
            "signals": [dict(r) for r in signals],
            "council_supply_lists": [dict(r) for r in supply],
            "contacts": [dict(r) for r in contacts],
            "renewal_predictions": [dict(r) for r in renewals],
            "quotes": [dict(r) for r in quotes],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("get_lead_intelligence error: %s", exc)
        return {"entity_id": None, "signals": [], "council_supply_lists": [],
                "contacts": [], "renewal_predictions": [], "quotes": []}


# ── Documents / PDF ───────────────────────────────────────────────────────────

@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    place_id: Optional[str] = Form(None),
    doc_type: str = Form("other"),
):
    import uuid, shutil
    uploads_dir = Path(__file__).parent / "uploads"
    uploads_dir.mkdir(exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}_{file.filename.replace(' ', '_')}"
    dest = uploads_dir / safe_name

    contents = await file.read()
    with open(dest, "wb") as f:
        f.write(contents)

    doc_id = save_document(
        filename=safe_name,
        original_filename=file.filename,
        file_path=str(dest),
        file_size_bytes=len(contents),
        place_id=place_id or None,
        doc_type=doc_type,
    )

    # Extract immediately for PDFs
    if file.filename.lower().endswith(".pdf"):
        try:
            result = pdf_extractor.extract_and_parse(str(dest))
            update_document_extraction(
                doc_id, result["text"], result["status"], result.get("parsed"), None
            )
        except Exception as e:
            update_document_extraction(doc_id, "", "failed", None, str(e))

    doc = get_document(doc_id)
    return dict(doc)

@app.get("/api/documents")
def list_documents(place_id: Optional[str] = None, limit: int = 50):
    rows = get_documents(place_id, limit)
    return [dict(r) for r in rows]

@app.get("/api/documents/{doc_id}")
def get_document_detail(doc_id: int):
    row = get_document(doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return dict(row)


# ── Email Campaigns ───────────────────────────────────────────────────────────

@app.post("/api/campaigns")
def create_email_campaign(body: dict = Body(...)):
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    campaign_id = create_campaign(
        name=name,
        template_type=body.get("template_type", "cold_email"),
        filter_sector=body.get("filter_sector"),
        filter_borough=body.get("filter_borough"),
        filter_min_score=body.get("filter_min_score", 60),
        filter_stage=body.get("filter_stage"),
        notes=body.get("notes"),
    )
    return {"id": campaign_id, "status": "created"}

@app.get("/api/campaigns")
def list_campaigns(limit: int = 50):
    rows = get_campaigns(limit)
    return [dict(r) for r in rows]

@app.get("/api/campaigns/{campaign_id}")
def get_campaign_detail(campaign_id: int):
    camp, leads = get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"campaign": dict(camp), "leads": [dict(l) for l in leads]}

@app.get("/api/campaigns/{campaign_id}/export")
def export_campaign(campaign_id: int):
    """Generate and download the mail merge Excel for this campaign."""
    camp, leads = get_campaign(campaign_id)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    from export_mail_merge import build_mail_merge_excel

    place_ids = [dict(l)["place_id"] for l in leads]
    if not place_ids:
        raise HTTPException(status_code=400, detail="No leads in this campaign")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = Path(__file__).parent / "exports" / f"campaign_{campaign_id}_{ts}.xlsx"
    out_path.parent.mkdir(exist_ok=True)

    build_mail_merge_excel(place_ids=place_ids, out_path=out_path)
    update_campaign(campaign_id, status="exported", export_path=str(out_path), exported_at=datetime.now().isoformat())

    filename = f"askmiro_campaign_{campaign_id}_{ts}.xlsx"
    return FileResponse(
        path=str(out_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename
    )


# ── Enhanced Analytics ────────────────────────────────────────────────────────

@app.get("/api/analytics/activity")
def analytics_activity(days: int = 7):
    return activity_summary(days)

@app.get("/api/analytics/velocity")
def analytics_velocity():
    return pipeline_velocity()


# ── London Routing ─────────────────────────────────────────────────────────────

@app.get("/api/routing/clusters")
def routing_clusters():
    import london_routing
    with db_pg.transaction() as conn:
        return london_routing.route_clusters_summary(conn)


@app.get("/api/routing/boroughs")
def routing_boroughs():
    import london_routing
    with db_pg.transaction() as conn:
        return london_routing.borough_priority_rank(conn)


@app.get("/api/routing/route")
def routing_route(cluster: str, max_leads: int = 8, min_score: int = 60):
    import london_routing
    with db_pg.transaction() as conn:
        return london_routing.suggest_daily_route(conn, cluster, max_leads=max_leads, min_score=min_score)


@app.get("/api/routing/nearby")
def routing_nearby(lat: float, lon: float, radius_km: float = 2.0, min_score: int = 55, limit: int = 20):
    import london_routing
    with db_pg.transaction() as conn:
        return london_routing.nearest_leads(conn, lat, lon, radius_km=radius_km, min_score=min_score, limit=limit)


@app.get("/api/routing/density")
def routing_density():
    import london_routing
    with db_pg.transaction() as conn:
        return london_routing.get_density_by_district(conn)


# ── Connector runner (admin) ───────────────────────────────────────────────────

@app.post("/api/admin/connectors/{source}")
def run_connector(source: str, limit: Optional[int] = None):
    """Trigger a connector run. Protected by source validation."""
    valid = ['cqc', 'companies_house', 'contracts_finder', 'charity_commission']
    if source not in valid:
        raise HTTPException(status_code=400, detail=f"Unknown source. Use: {valid}")
    try:
        from run_connectors import run_connector as _run
        count = _run(source, limit=limit)
        return {"source": source, "processed": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Rescore ───────────────────────────────────────────────────────────────────

@app.post("/api/admin/rescore")
def rescore_all():
    """Rescore all entities."""
    import scoring_pg
    with db_pg.transaction() as conn:
        n = scoring_pg.rescore_all(conn)
    return {"rescored": n}


@app.post("/api/admin/rescore/{entity_id}")
def rescore_entity(entity_id: int):
    """Rescore a single entity."""
    import scoring_pg
    with db_pg.transaction() as conn:
        scores = scoring_pg.rescore_entity(conn, entity_id)
    return scores

# ════════════════════════════════════════════════════════════════════════════
# SALES EXECUTION ENDPOINTS — v2
# ════════════════════════════════════════════════════════════════════════════

# ── Pydantic models ──────────────────────────────────────────────────────────

class GenerateScriptRequest(BaseModel):
    entity_id: int
    signal_id: Optional[int] = None
    force_regenerate: bool = False

class LogActivityRequest(BaseModel):
    entity_id: int
    activity_type: str                  # 'call','email','linkedin','visit','note'
    outcome: str                        # 'no_answer','spoke','meeting_booked','not_interested','left_voicemail','emailed'
    notes: Optional[str] = ''
    entity_sequence_id: Optional[int] = None
    contacted_name: Optional[str] = None
    next_followup_days: Optional[int] = None

class CompleteTaskRequest(BaseModel):
    outcome: Optional[str] = 'done'
    notes: Optional[str] = ''

class StartSequenceRequest(BaseModel):
    entity_id: int
    signal_type: Optional[str] = 'default'


# ── Script generation ────────────────────────────────────────────────────────

@app.post("/api/sales/generate-script")
def api_generate_script(req: GenerateScriptRequest):
    """
    Generate (or return cached) call script for an entity.
    On-demand only — never called in batch.
    ~£0.001 cost per AI call, cached indefinitely until regenerated.
    """
    with db_pg.transaction() as conn:
        result = generate_script(conn, req.entity_id, req.signal_id, req.force_regenerate)
    return result


# ── Contacts / decision-maker enrichment ────────────────────────────────────

@app.get("/api/sales/contacts/{entity_id}")
def api_get_contacts(entity_id: int):
    """Get enriched contacts for an entity. Auto-enriches if none exist."""
    with db_pg.transaction() as conn:
        # Auto-enrich if empty
        existing = db_pg.fetchval(conn, "SELECT COUNT(*) FROM contacts WHERE entity_id = %s", (entity_id,))
        if existing == 0:
            enrich_entity_contacts(conn, entity_id)
        contacts = db_pg.fetchall(conn, """
            SELECT full_name, job_title, role_category, phone, email,
                   source, confidence, is_primary, is_decision_maker
            FROM contacts WHERE entity_id = %s
            ORDER BY is_primary DESC, confidence DESC
        """, (entity_id,))
        best = get_best_contact(conn, entity_id)
    return {"contacts": [dict(c) for c in contacts], "best": best}


# ── Renewal prediction ───────────────────────────────────────────────────────

@app.get("/api/sales/renewal/{entity_id}")
def api_get_renewal(entity_id: int):
    """Get contract renewal prediction for an entity."""
    with db_pg.transaction() as conn:
        pred = db_pg.fetchone(conn, """
            SELECT entity_id, estimated_renewal, confidence, rationale,
                   evidence_source, days_until_renewal, call_now_flag, predicted_at
            FROM renewal_predictions WHERE entity_id = %s
        """, (entity_id,))
        if not pred:
            from services.renewal_predictor import predict_for_entity
            p = predict_for_entity(conn, entity_id)
            if p:
                db_pg.execute(conn, """
                    INSERT INTO renewal_predictions
                        (entity_id, estimated_renewal, confidence, rationale,
                         evidence_source, days_until_renewal, call_now_flag)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (entity_id) DO NOTHING
                """, (p['entity_id'], p['estimated_renewal'], p['confidence'],
                      p['rationale'], p['evidence_source'],
                      p['days_until_renewal'], p['call_now_flag']))
                pred = p
    return dict(pred) if pred else {"entity_id": entity_id, "confidence": "speculative", "call_now_flag": False}


# ── Daily tasks ──────────────────────────────────────────────────────────────

@app.get("/api/tasks/today")
def api_get_daily_tasks(regenerate: bool = False):
    """Return today's prioritised task list. Auto-generates if empty."""
    try:
        with db_pg.transaction() as conn:
            if regenerate:
                generate_daily_tasks(conn)
            tasks = get_daily_tasks(conn)
        return {"tasks": tasks, "total": len(tasks), "date": str(date.today())}
    except Exception as e:
        logger.warning("tasks/today: %s", e)
        return {"tasks": [], "total": 0, "date": str(date.today())}


@app.post("/api/tasks/{task_id}/complete")
def api_complete_task(task_id: int, req: CompleteTaskRequest = Body(default=CompleteTaskRequest())):
    """Mark a daily task as complete."""
    with db_pg.transaction() as conn:
        ok = complete_task(conn, task_id, req.outcome, req.notes or '')
    return {"ok": ok, "task_id": task_id}


@app.post("/api/tasks/{task_id}/snooze")
def api_snooze_task(task_id: int, days: int = 1):
    """Snooze a task to tomorrow."""
    with db_pg.transaction() as conn:
        db_pg.execute(conn, """
            UPDATE daily_tasks SET status = 'snoozed', snoozed_until = CURRENT_DATE + %s
            WHERE id = %s
        """, (days, task_id))
    return {"ok": True, "snoozed_days": days}


# ── Activity logging ─────────────────────────────────────────────────────────

@app.post("/api/sales/log-activity")
def api_log_activity(req: LogActivityRequest):
    """Log an outreach activity (call, email, etc.) for an entity."""
    with db_pg.transaction() as conn:
        activity_id = log_outreach_activity(
            conn,
            entity_id=req.entity_id,
            activity_type=req.activity_type,
            outcome=req.outcome,
            notes=req.notes or '',
            entity_sequence_id=req.entity_sequence_id,
            contacted_name=req.contacted_name,
            next_followup_days=req.next_followup_days,
        )
        # If spoke/meeting booked, advance sequence
        if req.entity_sequence_id and req.outcome in ('spoke', 'meeting_booked', 'emailed'):
            advance_sequence_step(conn, req.entity_sequence_id)
    return {"ok": True, "activity_id": activity_id}


# ── Next-best-action ─────────────────────────────────────────────────────────

@app.get("/api/sales/next-action/{entity_id}")
def api_next_best_action(entity_id: int):
    """Return the recommended next action for an entity."""
    with db_pg.transaction() as conn:
        action = get_next_best_action(conn, entity_id)
    return action


# ── Start sequence ───────────────────────────────────────────────────────────

@app.post("/api/sales/start-sequence")
def api_start_sequence(req: StartSequenceRequest):
    """Start an outreach sequence for an entity."""
    with db_pg.transaction() as conn:
        seq_id = start_sequence(conn, req.entity_id, req.signal_type or 'default')
    return {"ok": True, "entity_sequence_id": seq_id}


# ── Planning relevance ───────────────────────────────────────────────────────

@app.get("/api/sales/planning-relevance/{signal_id}")
def api_planning_relevance(signal_id: int):
    """Get planning relevance score for a signal."""
    with db_pg.transaction() as conn:
        row = db_pg.fetchone(conn, """
            SELECT * FROM planning_relevance WHERE signal_id = %s
        """, (signal_id,))
        if not row:
            # Score on demand
            sig = db_pg.fetchone(conn, "SELECT evidence FROM signals WHERE id = %s", (signal_id,))
            if sig:
                result = score_planning_description(sig['evidence'] or '')
                return result
    return dict(row) if row else {"is_relevant": False, "relevance_score": 0}


# ── Value estimate ───────────────────────────────────────────────────────────

@app.get("/api/sales/value-estimate/{entity_id}")
def api_value_estimate(entity_id: int):
    """Get improved value estimate for an entity."""
    with db_pg.transaction() as conn:
        entity = db_pg.fetchone(conn, """
            SELECT e.sector, e.entity_kind,
                   COALESCE(os.scale_score * 10, 0) as review_count_proxy,
                   EXISTS(SELECT 1 FROM signals WHERE entity_id = e.id AND signal_type = 'multi_site_signal' AND active = TRUE) as has_multisite,
                   EXISTS(SELECT 1 FROM signals WHERE entity_id = e.id AND signal_type = 'regulated_healthcare_facility' AND active = TRUE) as cqc_regulated,
                   (SELECT evidence FROM signals WHERE entity_id = e.id AND signal_type = 'new_development' LIMIT 1) as planning_evidence
            FROM entities e
            LEFT JOIN opportunity_scores os ON os.entity_id = e.id
            WHERE e.id = %s
        """, (entity_id,))
    if not entity:
        raise HTTPException(404, "Entity not found")
    return estimate_value(
        sector=entity['sector'] or 'other',
        entity_kind=entity['entity_kind'] or 'company',
        review_count=int(entity['review_count_proxy'] or 0),
        has_multisite=bool(entity['has_multisite']),
        evidence_text=entity['planning_evidence'] or '',
        cqc_regulated=bool(entity['cqc_regulated']),
    )


# ── Comprehensive entity detail (used by lead detail panel) ─────────────────

@app.get("/api/sales/entity/{entity_id}/full")
def api_entity_full(entity_id: int):
    """
    Return full sales context for an entity:
    signals, contacts, renewal, script (if cached), value estimate, next action.
    """
    with db_pg.transaction() as conn:
        entity = db_pg.fetchone(conn, """
            SELECT e.*, a.borough, a.postcode,
                   os.total_score, os.score_band, os.estimated_monthly_value_gbp,
                   os.next_best_action, os.value_confidence
            FROM entities e
            LEFT JOIN LATERAL (
                SELECT addr.borough, addr.postcode FROM entity_locations el
                JOIN addresses addr ON addr.id = el.address_id
                WHERE el.entity_id = e.id AND el.is_primary = TRUE LIMIT 1
            ) a ON TRUE
            LEFT JOIN opportunity_scores os ON os.entity_id = e.id
            WHERE e.id = %s
        """, (entity_id,))

        if not entity:
            raise HTTPException(404, "Entity not found")

        signals = db_pg.fetchall(conn, """
            SELECT id, signal_type, strength, evidence, source, detected_at, active,
                   planning_relevant, planning_relevance_score
            FROM signals WHERE entity_id = %s AND active = TRUE
            ORDER BY strength DESC
        """, (entity_id,))

        contacts = db_pg.fetchall(conn, """
            SELECT full_name, job_title, role_category, phone, email, source, confidence,
                   is_primary, is_decision_maker
            FROM contacts WHERE entity_id = %s
            ORDER BY is_primary DESC, confidence DESC
        """, (entity_id,))
        if not contacts:
            enrich_entity_contacts(conn, entity_id)
            contacts = db_pg.fetchall(conn, """
                SELECT full_name, job_title, role_category, phone, email, source, confidence,
                       is_primary, is_decision_maker
                FROM contacts WHERE entity_id = %s
                ORDER BY is_primary DESC, confidence DESC
            """, (entity_id,))

        renewal = db_pg.fetchone(conn, """
            SELECT estimated_renewal, confidence, rationale, days_until_renewal, call_now_flag
            FROM renewal_predictions WHERE entity_id = %s
        """, (entity_id,))

        script = db_pg.fetchone(conn, """
            SELECT opener, reason_for_call, contact_ask, full_script, generated_at,
                   CASE WHEN model = 'template' THEN 'template' ELSE 'ai' END as source
            FROM generated_scripts WHERE entity_id = %s AND is_stale = FALSE
            ORDER BY COALESCE(regenerated_at, generated_at) DESC LIMIT 1
        """, (entity_id,))

        recent_activities = db_pg.fetchall(conn, """
            SELECT activity_type, outcome, notes, logged_at, contacted_name
            FROM outreach_activities WHERE entity_id = %s
            ORDER BY logged_at DESC LIMIT 5
        """, (entity_id,))

        opp = db_pg.fetchone(conn, """
            SELECT current_stage, next_followup_at, last_touched_at
            FROM opportunities WHERE entity_id = %s
        """, (entity_id,))

        next_action = get_next_best_action(conn, entity_id)

    return {
        "entity":       dict(entity),
        "signals":      [dict(s) for s in signals],
        "contacts":     [dict(c) for c in contacts],
        "renewal":      dict(renewal) if renewal else None,
        "script":       dict(script) if script else None,
        "activities":   [dict(a) for a in recent_activities],
        "opportunity":  dict(opp) if opp else None,
        "next_action":  next_action,
    }


# ── Admin: run services ──────────────────────────────────────────────────────

@app.post("/api/admin/run-planning-filter")
def api_run_planning_filter():
    """Score all planning signals for commercial relevance."""
    stats = run_planning_filter()
    return stats

@app.post("/api/admin/run-contact-enrichment")
def api_run_contact_enrichment(limit: int = 2000):
    """Enrich contacts from existing DB data (Companies House + CQC)."""
    with db_pg.transaction() as conn:
        stats = run_contact_enrichment(conn, limit=limit)
    return stats

@app.post("/api/admin/run-renewal-predictions")
def api_run_renewal_predictions(limit: int = 10000):
    """Generate renewal window predictions for all entities."""
    with db_pg.transaction() as conn:
        stats = run_renewal_predictions(conn, limit=limit)
    return stats

@app.post("/api/admin/run-daily-tasks")
def api_run_daily_tasks():
    """Regenerate today's task list."""
    with db_pg.transaction() as conn:
        result = generate_daily_tasks(conn)
    return result


# ── Email Enrichment ─────────────────────────────────────────────────────────

@app.post("/api/email-enrichment/run")
def api_email_enrichment(
    limit:     int  = Query(100,  ge=1,  le=2000, description="Max leads to process"),
    min_score: int  = Query(65,   ge=0,  le=100,  description="Min lead score"),
    min_conf:  str  = Query("low",                description="Min confidence: high|medium|low"),
    overwrite: bool = Query(False,                description="Re-enrich leads that already have an email"),
):
    """
    Scrape websites of leads that have no email address.
    Checks homepage + /contact + /about pages for mailto: links and email patterns.
    Falls back to info@domain.com if nothing found.
    """
    from database import db_connection
    with db_connection() as conn:
        result = enrich_leads_batch(
            conn,
            min_score=min_score,
            limit=limit,
            min_conf=min_conf,
            overwrite=overwrite,
        )
    return result


@app.get("/api/email-enrichment/lookup")
def api_email_lookup(website: str = Query(..., description="Website URL to scrape")):
    """
    One-off email lookup for a single website URL. Useful for testing.
    """
    result = find_email(website)
    return result


@app.get("/api/email-enrichment/stats")
def api_email_enrichment_stats():
    """Coverage stats: how many leads have/don't have emails."""
    from database import db_connection
    with db_connection() as conn:
        r = conn.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN COALESCE(email,'') != '' THEN 1 ELSE 0 END) as has_email,
                SUM(CASE WHEN COALESCE(email,'') = '' AND COALESCE(website,'') != '' THEN 1 ELSE 0 END) as scrape_ready,
                SUM(CASE WHEN COALESCE(email,'') = '' AND COALESCE(website,'') = '' THEN 1 ELSE 0 END) as no_website,
                SUM(CASE WHEN priority_score >= 65 AND ai_is_cleaning_target = 1
                         AND COALESCE(email,'') = '' AND COALESCE(website,'') != '' THEN 1 ELSE 0 END) as priority_scrape_ready
            FROM lead_records
        """).fetchone()
        d = dict(r)
    return {
        "total_leads":          d["total"],
        "have_email":           d["has_email"],
        "scrape_ready":         d["scrape_ready"],        # have website, no email
        "no_website":           d["no_website"],
        "priority_scrape_ready": d["priority_scrape_ready"],  # score>=65, target, no email, has website
        "coverage_pct":         round(d["has_email"] / max(d["total"], 1) * 100, 1),
    }


# ── CRM Sync — Lead Intelligence → GAS CRM pipeline ──────────────────────────

@app.post("/api/crm/push")
def api_crm_push(
    min_score: int = Query(None, ge=0, le=100, description="Override default min score"),
    limit: int = Query(None, ge=1, le=500, description="Max leads to push"),
):
    """
    Trigger an immediate push of qualified leads to the GAS CRM.
    Normally run automatically by the scheduler every 30 min.
    """
    kwargs = {}
    if min_score is not None:
        kwargs["min_score"] = min_score
    if limit is not None:
        kwargs["limit"] = limit
    result = crm_sync.push_qualified_leads(**kwargs)
    return result


@app.post("/api/crm/push/{place_id}")
def api_crm_push_single(place_id: str):
    """
    Force-push a single lead to GAS CRM regardless of score/status filters.
    Useful for manual overrides from the frontend.
    """
    result = crm_sync.push_single_lead(place_id)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "push_failed"))
    return result


@app.get("/api/crm/status")
def api_crm_status():
    """
    Return a summary of the CRM handoff pipeline:
    how many leads pushed, pending, failed, and current config.
    """
    return crm_sync.get_handoff_status()


@app.post("/api/crm/sync")
def api_crm_sync():
    """
    Manually trigger CRM status sync — polls GAS for all outbound lead
    statuses and writes back to local opportunities + crm_handoffs.
    Normally runs every 2 hours via scheduler.
    """
    return crm_sync.sync_status_from_crm()


# ── Email Guard: monitoring & management endpoints ───────────────────────

@app.get("/api/email-guard/stats")
def email_guard_stats():
    """Dashboard stats for email deliverability protection."""
    try:
        with db_pg.transaction() as conn:
            today_sent = db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM email_send_log
                WHERE sent_at >= CURRENT_DATE AND status IN ('sent','delivered')
            """) or 0
            today_blocked = db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM email_send_log
                WHERE sent_at >= CURRENT_DATE AND status IN ('blocked','suppressed')
            """) or 0
            total_bounced = db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM email_send_log WHERE status = 'bounced'
            """) or 0
            total_suppressed = db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM email_suppressions WHERE active = TRUE
            """) or 0
            today_failed = db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM email_send_log
                WHERE sent_at >= CURRENT_DATE AND status = 'failed'
            """) or 0
            total_delivered = db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM email_send_log WHERE status = 'delivered'
            """) or 0
    except Exception as e:
        logger.warning("email-guard/stats: %s", e)
        today_sent = today_blocked = total_bounced = total_suppressed = today_failed = total_delivered = 0

    try:
        from email_guard import DAILY_SEND_LIMIT, PER_MINUTE_LIMIT
    except Exception:
        DAILY_SEND_LIMIT, PER_MINUTE_LIMIT = 50, 5
    return {
        "today_sent": today_sent,
        "today_blocked": today_blocked,
        "today_failed": today_failed,
        "total_bounced": total_bounced,
        "total_delivered": total_delivered,
        "total_suppressed": total_suppressed,
        "daily_limit": DAILY_SEND_LIMIT,
        "daily_remaining": max(0, DAILY_SEND_LIMIT - today_sent),
        "per_minute_limit": PER_MINUTE_LIMIT,
    }


@app.get("/api/email-guard/send-log")
def email_guard_send_log(limit: int = 100, status: str = None):
    """Recent email send log with status tracking."""
    try:
        with db_pg.transaction() as conn:
            sql = """
                SELECT esl.*, e.canonical_name AS business_name
                FROM email_send_log esl
                LEFT JOIN entities e ON e.id = esl.entity_id
            """
            params = []
            if status:
                sql += " WHERE esl.status = %s"
                params.append(status)
            sql += " ORDER BY esl.sent_at DESC LIMIT %s"
            params.append(limit)
            rows = db_pg.fetchall(conn, sql, tuple(params))
        return [dict(r) for r in rows]
    except Exception as e:
        logger.warning("email-guard/send-log: %s", e)
        return []


@app.get("/api/email-guard/suppressions")
def email_guard_suppressions():
    """List all suppressed emails."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT * FROM email_suppressions
                WHERE active = TRUE
                ORDER BY suppressed_at DESC
            """)
        return [dict(r) for r in rows]
    except Exception as e:
        logger.warning("email-guard/suppressions: %s", e)
        return []


@app.post("/api/email-guard/validate/{place_id}")
def email_guard_validate(place_id: str):
    """Validate a specific lead's email and tag the entity."""
    with db_pg.transaction() as conn:
        email = db_pg.fetchval(conn, """
            SELECT e.primary_email FROM entities e
            JOIN entity_source_links esl ON esl.entity_id = e.id
            WHERE esl.source_record_id = %s LIMIT 1
        """, (place_id,))
    if not email:
        raise HTTPException(status_code=404, detail="No email for this lead")

    from email_guard import validate_and_tag_entity
    result = validate_and_tag_entity(email)
    return {"email": email, "validation_status": result}


# ── Unified Outreach Queue ───────────────────────────────────────────────────

@app.get("/api/outreach-queue")
def unified_outreach_queue(limit: int = 50):
    """
    Unified outreach queue — single prioritised list of leads that need action.
    Combines: email-ready leads, overdue follow-ups, high-score uncontacted,
    and leads with hot signals. Ordered by urgency.
    """
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                WITH action_leads AS (
                    SELECT
                        e.id AS entity_id,
                        e.canonical_name AS business_name,
                        e.sector,
                        e.primary_phone AS phone,
                        e.primary_email AS email,
                        a.borough,
                        os.total_score,
                        os.score_band,
                        os.next_best_action,
                        COALESCE(o.current_stage::TEXT, 'raw') AS stage,
                        o.id AS opportunity_id,
                        o.last_touched_at,
                        o.next_followup_at,
                        c.full_name AS contact_name,
                        c.job_title AS contact_role,
                        esl.source_record_id AS place_id,
                        -- Urgency scoring
                        CASE
                            WHEN o.next_followup_at < NOW() THEN 10  -- overdue
                            WHEN o.next_followup_at < NOW() + INTERVAL '1 day' THEN 8  -- due today
                            WHEN o.current_stage = 'new' AND os.total_score >= 75 THEN 7  -- hot uncontacted
                            WHEN o.current_stage IN ('replied', 'meeting_or_site_visit') THEN 6  -- warm active
                            WHEN o.current_stage = 'ready_to_contact' THEN 5
                            WHEN o.current_stage = 'contacted' AND o.last_touched_at < NOW() - INTERVAL '3 days' THEN 4
                            ELSE 2
                        END AS urgency,
                        CASE
                            WHEN o.next_followup_at < NOW() THEN 'overdue_followup'
                            WHEN o.next_followup_at < NOW() + INTERVAL '1 day' THEN 'followup_today'
                            WHEN o.current_stage = 'new' AND os.total_score >= 75 THEN 'hot_uncontacted'
                            WHEN o.current_stage IN ('replied', 'meeting_or_site_visit') THEN 'active_deal'
                            WHEN o.current_stage = 'ready_to_contact' THEN 'ready_to_contact'
                            WHEN e.primary_email IS NOT NULL AND o.current_stage IN ('new','ready_to_contact') THEN 'email_ready'
                            ELSE 'standard'
                        END AS action_type,
                        -- Check if outreach exists
                        EXISTS(SELECT 1 FROM outreach_packages op
                            JOIN entity_source_links esl2 ON esl2.source_record_id = op.place_id
                            WHERE esl2.entity_id = e.id LIMIT 1) AS has_outreach,
                        -- Check if already pushed to CRM
                        EXISTS(SELECT 1 FROM crm_handoffs ch
                            JOIN entity_source_links esl3 ON esl3.source_record_id = ch.place_id
                            WHERE esl3.entity_id = e.id AND ch.handoff_status = 'success' LIMIT 1) AS crm_pushed
                    FROM entities e
                    JOIN opportunities o ON o.entity_id = e.id
                    LEFT JOIN opportunity_scores os ON os.entity_id = e.id
                    LEFT JOIN LATERAL (
                        SELECT addr.borough FROM entity_locations el
                        JOIN addresses addr ON addr.id = el.address_id
                        WHERE el.entity_id = e.id AND el.is_primary = TRUE LIMIT 1
                    ) a ON TRUE
                    LEFT JOIN contacts c ON c.entity_id = e.id AND c.is_primary = TRUE
                    LEFT JOIN LATERAL (
                        SELECT source_record_id FROM entity_source_links
                        WHERE entity_id = e.id LIMIT 1
                    ) esl ON TRUE
                    WHERE o.current_stage NOT IN ('won', 'lost', 'dormant')
                      AND e.active = TRUE
                      -- Exclude suppressed/invalid emails from outreach queue
                      AND NOT EXISTS (
                          SELECT 1 FROM email_suppressions es
                          WHERE es.email = LOWER(e.primary_email) AND es.active = TRUE
                      )
                      AND COALESCE(e.email_validation_status, 'unknown') != 'invalid'
                )
                SELECT * FROM action_leads
                ORDER BY urgency DESC, total_score DESC NULLS LAST
                LIMIT %s
            """, (limit,))

        # Normalise field names for frontend and group by action type
        queue = []
        for r in rows:
            d = dict(r)
            d['name'] = d.get('business_name') or d.get('name') or 'Unknown'
            d['score'] = d.get('total_score')
            d['outreach_count'] = 0  # default; overridden if outreach tracking exists
            d['reply_status'] = None
            queue.append(d)
        action_counts = {}
        for r in queue:
            t = r.get("action_type", "standard")
            action_counts[t] = action_counts.get(t, 0) + 1

        return {
            "queue": queue,
            "total": len(queue),
            "by_action": action_counts,
        }
    except Exception as exc:
        logger.error("unified_outreach_queue error: %s", exc)
        return {"queue": [], "total": 0, "by_action": {}}


@app.get("/api/outreach/auto-queue")
def outreach_auto_queue():
    """Auto-generate outreach queue from pipeline Ready stage + high-score uncontacted leads."""
    try:
        with db_pg.transaction() as conn:
            # Get leads that should be in outreach: high score + not in active pipeline yet
            # OR in pipeline at ready_to_contact/new/enriched stages
            rows = db_pg.fetchall(conn, """
                SELECT DISTINCT ON (vl.entity_id)
                    vl.entity_id, vl.business_name, vl.borough, vl.sector,
                    vl.total_score, vl.score_band, vl.phone, vl.website,
                    vl.estimated_monthly_value_gbp, vl.next_best_action, vl.hvt,
                    o.id as opportunity_id, o.current_stage,
                    CASE
                        WHEN o.current_stage IN ('new','enriched','ready_to_contact') THEN 'pipeline_ready'
                        WHEN o.id IS NULL AND vl.total_score >= 65 THEN 'high_score_uncontacted'
                        ELSE 'standard'
                    END as queue_reason,
                    CASE
                        WHEN vl.phone IS NOT NULL AND vl.phone != '' THEN 'call'
                        WHEN vl.website IS NOT NULL AND vl.website != '' THEN 'email_via_website'
                        ELSE 'research'
                    END as contact_method
                FROM v_lead_board vl
                LEFT JOIN opportunities o ON o.entity_id = vl.entity_id
                    AND o.current_stage NOT IN ('won','lost','dormant')
                WHERE vl.active = TRUE
                  AND vl.total_score >= 50
                  AND (
                      o.current_stage IN ('new','enriched','ready_to_contact')
                      OR (o.id IS NULL AND vl.total_score >= 65)
                  )
                  AND (vl.phone IS NOT NULL AND vl.phone != ''
                       OR vl.website IS NOT NULL AND vl.website != '')
                ORDER BY vl.entity_id, vl.total_score DESC
            """)

            # Sort by priority: HVT first, then by score
            leads = sorted(
                [dict(r) for r in rows],
                key=lambda x: (
                    -(1 if x.get('hvt') else 0),
                    -(x.get('total_score') or 0),
                ),
            )
            return {"queue": leads, "total": len(leads)}
    except Exception as e:
        logger.error("outreach auto-queue: %s", e)
        return {"queue": [], "total": 0}


# ── Website lead webhook (inbound from askmiro.com forms / GAS) ──────────────

@app.post("/api/webhook/lead")
def webhook_lead(body: dict = Body(...)):
    """
    Public webhook — receives leads from:
    - askmiro.com contact / quote forms (via GAS)
    - Any external source posting lead data
    No auth required (public endpoint, same as GAS webhook.lead).

    Inserts into normalized schema: entities + addresses + opportunity_scores.
    Auto-creates opportunity if score >= 65.
    """
    import uuid as _uuid

    # Normalise incoming fields — handles:
    # - askmiro.com/get-quote form (service-type, company, name, email, phone, postcode, frequency, message)
    # - GAS relay format (contactName, companyName, etc.)
    # - Direct POST format (business, address, etc.)
    name    = (body.get("name") or body.get("contactName") or "").strip()
    email   = (body.get("email") or "").strip().lower()
    phone   = (body.get("phone") or "").strip()
    biz     = (body.get("company") or body.get("business") or body.get("companyName") or name or "Website Lead").strip()
    address = (body.get("address") or body.get("location") or "").strip()
    message = (body.get("message") or body.get("notes") or "").strip()
    source  = (body.get("source") or "website_quote").strip()
    sector  = (body.get("service-type") or body.get("serviceType") or body.get("sector") or "other").strip()
    borough = (body.get("borough") or "").strip()
    postcode = (body.get("postcode") or "").strip()
    frequency = (body.get("frequency") or "").strip()
    premises_size = body.get("premisesSizeM2") or body.get("premisesSize") or ""
    # Append extra context to message
    extras = []
    if frequency: extras.append(f"Frequency: {frequency}")
    if premises_size: extras.append(f"Premises size: {premises_size}m²")
    # Equipment from oven cleaning form
    for eq_key in ['eq-standard','eq-combi','eq-deck','eq-range']:
        val = body.get(eq_key)
        if val and str(val) != '0':
            extras.append(f"{eq_key}: {val}")
    if extras:
        message = (message + "\n" + " | ".join(extras)).strip()

    place_id = f"web_{_uuid.uuid4().hex[:12]}"

    # Auto-score: base 50 + bonuses
    score = 50
    if email and "@" in email:
        score += 10
    if phone:
        score += 5
    if sector.lower() in ("offices", "healthcare", "education", "gym", "industrial"):
        score += 10
    if message:
        score += 5  # enquiry = intent
    score = min(score, 100)

    entity_id = None
    try:
        with db_pg.transaction() as conn:
            # 1. Insert entity
            entity_id = db_pg.fetchval(conn, """
                INSERT INTO entities (entity_kind, canonical_name, normalized_name, sector,
                                      primary_website, primary_phone, primary_email, hvt, active)
                VALUES ('facility'::entity_kind, %s, %s, %s, NULL, %s, %s, %s, TRUE)
                RETURNING id
            """, (biz, biz.lower().strip(), sector, phone or None, email or None, score >= 65))

            # 2. Insert address
            if address or borough or postcode:
                addr_id = db_pg.fetchval(conn, """
                    INSERT INTO addresses (line1, borough, postcode)
                    VALUES (%s, %s, %s) RETURNING id
                """, (address or None, borough or None, postcode or None))
                db_pg.execute(conn, """
                    INSERT INTO entity_locations (entity_id, address_id, is_primary)
                    VALUES (%s, %s, TRUE)
                """, (entity_id, addr_id))

            # 3. Insert source link
            db_pg.execute(conn, """
                INSERT INTO entity_source_links (entity_id, source, source_record_id)
                VALUES (%s, 'manual'::source_system, %s)
                ON CONFLICT DO NOTHING
            """, (entity_id, place_id))

            # 4. Insert opportunity score
            db_pg.execute(conn, """
                INSERT INTO opportunity_scores (entity_id, total_score, fit_score,
                    buyer_signal_score, score_band, next_best_action)
                VALUES (%s, %s, %s, 0, %s, %s)
                ON CONFLICT (entity_id) DO NOTHING
            """, (entity_id, score, score,
                  'A' if score >= 80 else 'B' if score >= 65 else 'C' if score >= 50 else 'D',
                  'Website enquiry — call to qualify'))

            # 5. Auto-create opportunity if high score
            if score >= 65:
                db_pg.execute(conn, """
                    INSERT INTO opportunities (entity_id, title, current_stage, owner)
                    VALUES (%s, %s, 'new'::pipeline_stage, 'auto')
                    ON CONFLICT (entity_id) DO NOTHING
                """, (entity_id, f"Website lead — {biz}"))

            # 6. Log activity
            db_pg.execute(conn, """
                INSERT INTO activity_log (entity_id, activity_type, actor, subject, body)
                VALUES (%s, 'note', 'website', %s, %s)
            """, (entity_id,
                  f"Inbound website lead from {source}",
                  f"Contact: {name}, Message: {message[:500]}" if message else f"Contact: {name}"))

    except Exception as exc:
        logger.error("webhook_lead: normalized insert failed — %s", exc)
        return {"status": "error", "error": str(exc)}

    logger.info("webhook_lead: entity_id=%s score=%d — %s <%s>", entity_id, score, biz, email)

    # Auto-generate outreach + auto-push to GAS in background (non-blocking)
    # Full pipeline: score → generate outreach → push to GAS → <30 min end-to-end
    def _auto_outreach_pipeline():
        row = {"place_id": place_id, "id": entity_id,
               "business_name": biz, "normalized_sector": sector,
               "borough": borough, "ai_business_type": sector,
               "ai_decision_maker_type": "Decision Maker",
               "priority_score": score, "email": email, "phone": phone,
               "contact_name": name,
               "website_summary": message or None, "website_pain_points": None}

        # Step 1: Generate outreach package (AI-powered)
        try:
            from outreach_generator import generate_outreach
            generate_outreach(row)
            logger.info("webhook_lead: outreach generated for entity %s", entity_id)
        except Exception as exc:
            logger.warning("webhook_lead: outreach gen failed for entity %s — %s", entity_id, exc)
            return  # can't auto-send without outreach

        # Step 2: Auto-push to GAS if score >= 65 AND has email (full autopilot)
        if score >= 65 and email and "@" in email:
            try:
                # Re-fetch with outreach package from Postgres
                with db_pg.transaction() as conn:
                    lead_row = db_pg.fetchone(conn,
                        """SELECT lr.*, op.cold_email, op.follow_up_email
                           FROM lead_records lr
                           LEFT JOIN outreach_packages op ON lr.place_id = op.place_id
                           WHERE lr.place_id = %s""",
                        (place_id,)
                    )

                if lead_row and lead_row.get("cold_email"):
                    from crm_sync import _push_one
                    outcome, err = _push_one(dict(lead_row), force=True)
                    if outcome == "ok":
                        logger.info("webhook_lead: AUTO-SENT to GAS for entity %s (%s)", entity_id, email)
                        # Update stage to contacted
                        with db_pg.transaction() as conn:
                            db_pg.execute(conn, """
                                UPDATE opportunities SET current_stage = 'contacted'::pipeline_stage,
                                    updated_at = NOW(), last_touched_at = NOW()
                                WHERE entity_id = %s
                            """, (entity_id,))
                            db_pg.execute(conn, """
                                INSERT INTO activity_log (entity_id, activity_type, actor, subject, body)
                                VALUES (%s, 'email', 'autopilot', %s, %s)
                            """, (entity_id,
                                  f"Auto-sent cold email to {email}",
                                  f"Website lead scored {score} — auto-outreach triggered"))
                    else:
                        logger.warning("webhook_lead: auto-push failed for %s — %s", entity_id, err)
                else:
                    logger.info("webhook_lead: no cold_email generated, skipping auto-push for entity %s", entity_id)
            except Exception as exc:
                logger.warning("webhook_lead: auto-push pipeline failed for %s — %s", entity_id, exc)

    import threading
    threading.Thread(target=_auto_outreach_pipeline, daemon=True).start()

    return {"status": "ok", "entity_id": entity_id, "place_id": place_id,
            "score": score, "source": source}


# ── GAS → Python real-time status webhook ────────────────────────────────────

@app.post("/api/webhook/gas-status")
def webhook_gas_status(body: dict = Body(...)):
    """
    Real-time status push FROM GAS.
    GAS calls this whenever an outreach status changes (email sent, reply
    received, follow-up scheduled, etc.) so Python DB stays in sync without
    polling.

    Expected body:
      {
        "sourceLeadId": "ChIJ...",          # place_id we handed off
        "outreachStatus": "CONTACTED",       # GAS status
        "replyStatus": "INTERESTED",         # optional reply classification
        "token": "Mike100864"                # auth token
      }
    """
    from crm_sync import _CRM_TO_PIPELINE, _cfg

    cfg = _cfg()
    token = body.get("token", "")
    if token != cfg["token"]:
        raise HTTPException(status_code=403, detail="Invalid token")

    source_id       = (body.get("sourceLeadId") or "").strip()
    outreach_status = (body.get("outreachStatus") or "").strip()
    reply_status    = (body.get("replyStatus") or "").strip()

    if not source_id:
        raise HTTPException(status_code=400, detail="sourceLeadId is required")

    pipeline_status = _CRM_TO_PIPELINE.get(outreach_status, "")

    updated = False
    try:
        with db_pg.transaction() as conn:
            # Find the entity via source link
            entity_id = db_pg.fetchval(conn, """
                SELECT e.id FROM entities e
                JOIN entity_source_links esl ON esl.entity_id = e.id
                WHERE esl.source_record_id = %s LIMIT 1
            """, (source_id,))

            if entity_id and pipeline_status:
                db_pg.execute(conn, """
                    UPDATE opportunities
                    SET current_stage = %s::pipeline_stage,
                        updated_at = NOW(), last_touched_at = NOW()
                    WHERE entity_id = %s
                """, (pipeline_status, entity_id))
                updated = True

                # Log the status change as activity
                db_pg.execute(conn, """
                    INSERT INTO activity_log (entity_id, activity_type, actor, subject, body)
                    VALUES (%s, 'status_change', 'gas', %s, %s)
                """, (entity_id,
                      f"GAS status → {outreach_status}",
                      f"Outreach: {outreach_status}, Reply: {reply_status}" if reply_status else f"Outreach: {outreach_status}"))

            # Update crm_handoffs tracking
            db_pg.execute(conn, """
                UPDATE crm_handoffs
                SET last_sync_at = %s, crm_outreach_status = %s, crm_reply_status = %s
                WHERE place_id = %s
            """, (datetime.now().isoformat(), outreach_status, reply_status, source_id))

    except Exception as exc:
        logger.error("webhook_gas_status: failed for %s — %s", source_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))

    # ── Bounce / failure detection → suppress email for future sends ──────
    _BOUNCE_STATUSES = {"BOUNCED", "FAILED", "INVALID_EMAIL", "HARD_BOUNCE"}
    _UNSUB_STATUSES  = {"UNSUBSCRIBED", "SPAM_COMPLAINT"}
    try:
        from email_guard import handle_bounce, add_suppression, update_send_status
        if outreach_status.upper() in _BOUNCE_STATUSES:
            # Find the email for this lead
            with db_pg.transaction() as conn:
                lead_email = db_pg.fetchval(conn, """
                    SELECT e.primary_email FROM entities e
                    JOIN entity_source_links esl ON esl.entity_id = e.id
                    WHERE esl.source_record_id = %s LIMIT 1
                """, (source_id,))
            if lead_email:
                handle_bounce(lead_email, place_id=source_id, reason=outreach_status.lower())
                logger.warning("webhook_gas_status: BOUNCE detected for %s (%s) — suppressed", source_id, lead_email)

        elif outreach_status.upper() in _UNSUB_STATUSES:
            with db_pg.transaction() as conn:
                lead_email = db_pg.fetchval(conn, """
                    SELECT e.primary_email FROM entities e
                    JOIN entity_source_links esl ON esl.entity_id = e.id
                    WHERE esl.source_record_id = %s LIMIT 1
                """, (source_id,))
            if lead_email:
                add_suppression(lead_email, outreach_status.lower(), source="gas_webhook")
                logger.info("webhook_gas_status: unsubscribe/complaint for %s — suppressed", lead_email)

        elif outreach_status.upper() in {"CONTACTED", "FOLLOW_UP_1", "FOLLOW_UP_2"}:
            # Mark as delivered in send log
            with db_pg.transaction() as conn:
                lead_email = db_pg.fetchval(conn, """
                    SELECT e.primary_email FROM entities e
                    JOIN entity_source_links esl ON esl.entity_id = e.id
                    WHERE esl.source_record_id = %s LIMIT 1
                """, (source_id,))
            if lead_email:
                update_send_status(email=lead_email, place_id=source_id, status="delivered")
    except ImportError:
        pass  # email_guard not available

    logger.info("webhook_gas_status: %s → %s (pipeline: %s)", source_id, outreach_status, pipeline_status)
    return {"status": "ok", "updated": updated, "pipeline_status": pipeline_status}


# ── Email / Outreach management (proxies to GAS) ────────────────────────────

def _gas_get(action: str, extra_params: dict = None):
    """Generic GET proxy to GAS outreach endpoints."""
    from crm_sync import _cfg
    import urllib.request, urllib.parse, json as _json
    cfg = _cfg()
    if not cfg["endpoint"]:
        return {"error": "GAS_ENDPOINT not configured", "items": [], "leads": [], "stats": {}}
    params = {"action": action, "token": cfg["token"]}
    if extra_params:
        params.update(extra_params)
    url = cfg["endpoint"] + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=12) as r:
            return _json.loads(r.read().decode())
    except Exception as exc:
        logger.warning("_gas_get %s failed: %s", action, exc)
        return {"error": str(exc), "items": [], "leads": [], "stats": {}}

def _gas_post_action(action: str, body: dict) -> tuple:
    """
    Generic POST proxy to GAS outreach endpoints.
    Returns (result_dict, error_string_or_None).
    """
    from crm_sync import _gas_post
    try:
        result = _gas_post(action, body)
        return (result, None)
    except Exception as exc:
        logger.warning("_gas_post_action %s failed: %s", action, exc)
        return (None, str(exc))


@app.get("/api/email/queue")
def email_queue():
    """Leads ready to send — from GAS outreach queue."""
    return _gas_get("outreach.queue")

@app.get("/api/email/stats")
def email_stats():
    """Email performance stats from GAS."""
    return _gas_get("outreach.stats")

@app.get("/api/email/log")
def email_log():
    """Full email send history from GAS."""
    return _gas_get("outreach.log")

@app.get("/api/email/replies")
def email_replies():
    """Reply classifications from GAS reply scanner."""
    return _gas_get("outreach.human-queue")

@app.get("/api/email/autorun")
def email_autorun():
    """Autopilot status from GAS."""
    return _gas_get("outreach.autorun")

@app.post("/api/email/send")
def email_send_one(body: dict = Body(...)):
    """Send a single outreach email via GAS."""
    result, err = _gas_post_action("outreach.send", body)
    if err:
        raise HTTPException(status_code=500, detail=err)
    return result or {"status": "sent"}

@app.post("/api/email/resolve")
def email_resolve(body: dict = Body(...)):
    """Resolve a human action item in GAS."""
    result, err = _gas_post_action("outreach.resolve-action", body)
    if err:
        raise HTTPException(status_code=500, detail=err)
    return result or {"status": "resolved"}


# ── Compliance ────────────────────────────────────────────────────────────────

@app.get("/api/compliance")
def compliance_overview():
    """Summary stats, category breakdown, and urgent items."""
    try:
        with db_pg.transaction() as conn:
            # Summary counts
            summary = db_pg.fetchone(conn, """
                SELECT
                    COUNT(*) FILTER (WHERE required = TRUE)                       AS total_required,
                    COUNT(*) FILTER (WHERE status = 'current')                    AS current,
                    COUNT(*) FILTER (WHERE status = 'missing')                    AS missing,
                    COUNT(*) FILTER (WHERE status = 'expired')                    AS expired,
                    COUNT(*) FILTER (WHERE status = 'draft')                      AS draft,
                    COUNT(*) FILTER (WHERE status = 'review')                     AS review,
                    COUNT(*) FILTER (WHERE status = 'uploaded')                   AS uploaded
                FROM compliance_documents
            """)

            # Category breakdown
            categories = db_pg.fetchall(conn, """
                SELECT category,
                       COUNT(*)                                                   AS total,
                       COUNT(*) FILTER (WHERE status = 'current')                 AS current,
                       COUNT(*) FILTER (WHERE status = 'missing')                 AS missing,
                       COUNT(*) FILTER (WHERE status = 'expired')                 AS expired
                FROM compliance_documents
                GROUP BY category ORDER BY category
            """)

            # Urgent items: expired or required+missing
            urgent = db_pg.fetchall(conn, """
                SELECT * FROM compliance_documents
                WHERE status = 'expired'
                   OR (required = TRUE AND status = 'missing')
                ORDER BY expiry_date ASC NULLS LAST
            """)

        return {
            "summary": dict(summary) if summary else {},
            "categories": [dict(r) for r in categories],
            "urgent": [dict(r) for r in urgent],
        }
    except Exception as exc:
        logger.error("compliance_overview error: %s", exc)
        return {"summary": {}, "categories": [], "urgent": []}


@app.get("/api/compliance/categories")
def compliance_categories():
    """All rows from compliance_categories seed table."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT * FROM compliance_categories ORDER BY priority, category, subcategory
            """)
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("compliance_categories error: %s", exc)
        return []


@app.get("/api/compliance/documents")
def compliance_documents(category: str = Query(None), status: str = Query(None)):
    """All compliance documents with optional category/status filters."""
    try:
        with db_pg.transaction() as conn:
            clauses, params = [], []
            if category:
                clauses.append("category = %s")
                params.append(category)
            if status:
                clauses.append("status = %s")
                params.append(status)
            where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
            rows = db_pg.fetchall(conn, f"""
                SELECT * FROM compliance_documents {where}
                ORDER BY category, subcategory, document_name
            """, tuple(params))
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("compliance_documents error: %s", exc)
        return []


@app.post("/api/compliance/documents")
def create_compliance_document(body: dict = Body(...)):
    """Create a new compliance document."""
    try:
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                INSERT INTO compliance_documents
                    (category, subcategory, document_name, description, status,
                     required, expiry_date, renewal_freq, notes,
                     entity_id, cleaner_id, site_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                body["category"],
                body.get("subcategory"),
                body["document_name"],
                body.get("description"),
                body.get("status", "missing"),
                body.get("required", True),
                body.get("expiry_date"),
                body.get("renewal_freq"),
                body.get("notes"),
                body.get("entity_id"),
                body.get("cleaner_id"),
                body.get("site_id"),
            ))
        return dict(row)
    except Exception as exc:
        logger.error("create_compliance_document error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.put("/api/compliance/documents/{doc_id}")
def update_compliance_document(doc_id: int, body: dict = Body(...)):
    """Update a compliance document."""
    try:
        with db_pg.transaction() as conn:
            existing = db_pg.fetchone(conn, "SELECT * FROM compliance_documents WHERE id = %s", (doc_id,))
            if not existing:
                raise HTTPException(status_code=404, detail="Document not found")

            allowed = [
                "document_name", "description", "status", "expiry_date",
                "last_reviewed", "reviewed_by", "notes",
                "file_path", "file_type", "file_size_bytes",
            ]
            sets, vals = [], []
            for key in allowed:
                if key in body:
                    sets.append(f"{key} = %s")
                    vals.append(body[key])
            if not sets:
                return dict(existing)

            sets.append("updated_at = NOW()")
            vals.append(doc_id)
            row = db_pg.fetchone(conn, f"""
                UPDATE compliance_documents SET {', '.join(sets)}
                WHERE id = %s RETURNING *
            """, tuple(vals))
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("update_compliance_document error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/compliance/documents/{doc_id}/review")
def review_compliance_document(doc_id: int, body: dict = Body(...)):
    """Mark a document as reviewed."""
    try:
        with db_pg.transaction() as conn:
            existing = db_pg.fetchone(conn, "SELECT * FROM compliance_documents WHERE id = %s", (doc_id,))
            if not existing:
                raise HTTPException(status_code=404, detail="Document not found")

            reviewed_by = body.get("reviewed_by", "unknown")
            new_status = "current" if existing["status"] == "review" else existing["status"]

            row = db_pg.fetchone(conn, """
                UPDATE compliance_documents
                SET last_reviewed = NOW(), reviewed_by = %s, status = %s, updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (reviewed_by, new_status, doc_id))
        return dict(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("review_compliance_document error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/api/compliance/documents/{doc_id}")
def delete_compliance_document(doc_id: int):
    """Delete a compliance document."""
    try:
        with db_pg.transaction() as conn:
            existing = db_pg.fetchone(conn, "SELECT * FROM compliance_documents WHERE id = %s", (doc_id,))
            if not existing:
                raise HTTPException(status_code=404, detail="Document not found")
            db_pg.execute(conn, "DELETE FROM compliance_documents WHERE id = %s", (doc_id,))
        return {"status": "deleted", "id": doc_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("delete_compliance_document error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/compliance/generate-from-categories")
def compliance_generate_from_categories():
    """Auto-create compliance_documents from compliance_categories for any not yet represented."""
    try:
        with db_pg.transaction() as conn:
            # Find category rows that don't already have a matching document
            missing = db_pg.fetchall(conn, """
                SELECT cc.* FROM compliance_categories cc
                LEFT JOIN compliance_documents cd
                    ON cd.category = cc.category
                   AND cd.subcategory IS NOT DISTINCT FROM cc.subcategory
                   AND cd.document_name = cc.doc_name
                WHERE cd.id IS NULL
            """)

            count = 0
            for m in missing:
                db_pg.execute(conn, """
                    INSERT INTO compliance_documents
                        (category, subcategory, document_name, description,
                         status, required, renewal_freq)
                    VALUES (%s,%s,%s,%s,'missing',%s,%s)
                """, (
                    m["category"], m.get("subcategory"), m["doc_name"],
                    m.get("description"), m.get("required", True),
                    m.get("renewal_freq"),
                ))
                count += 1

        return {"status": "ok", "generated": count}
    except Exception as exc:
        logger.error("compliance_generate_from_categories error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/compliance/expiring")
def compliance_expiring():
    """Documents expiring within 30 days or already expired."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT * FROM compliance_documents
                WHERE status = 'expired'
                   OR (expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '30 days')
                ORDER BY expiry_date ASC NULLS LAST
            """)
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("compliance_expiring error: %s", exc)
        return []


# ── Public: Join Our Team form ────────────────────────────────────────────────

@app.post("/api/public/join-team")
def public_join_team(body: dict = Body(...)):
    """Public endpoint for the Join Our Team web form.
    Writes cleaner applicants directly to ops_cleaners.
    No auth required — this replaces the Google Sheets form backend.
    """
    # Handle both direct form fields and GAS relay format
    first = (body.get("firstName") or "").strip()
    last = (body.get("lastName") or "").strip()
    name = (body.get("fullName") or f"{first} {last}".strip() or "").strip()
    email = (body.get("email") or "").strip()
    phone = (body.get("phone") or "").strip()

    if not name:
        raise HTTPException(status_code=400, detail="Full name is required")
    if not phone and not email:
        raise HTTPException(status_code=400, detail="Phone or email is required")

    # Map and validate fields
    cleaner_type = (body.get("cleanerType") or "Employee").strip()
    if cleaner_type not in ("Employee", "Subcontractor", "Agency", "Trial"):
        cleaner_type = "Subcontractor" if "sub" in cleaner_type.lower() else "Employee"

    compliance = (body.get("complianceStatus") or "Pending").strip()
    if compliance not in ("Ready", "Pending", "Expiring", "Blocked"):
        compliance = "Pending"

    dbs = (body.get("dbsStatus") or "None").strip()
    if dbs not in ("Enhanced", "Basic", "None", "Expired"):
        dbs = "None"

    try:
        rate = float(body.get("hourlyRate") or 12.50)
    except (ValueError, TypeError):
        rate = 12.50

    try:
        with db_pg.transaction() as conn:
            # Check for duplicate
            existing = db_pg.fetchval(conn, """
                SELECT id FROM ops_cleaners WHERE email = %s AND email != ''
            """, (email,))
            if existing:
                return {"status": "duplicate", "message": "Application already on file",
                        "cleaner_id": existing}

            db_pg.execute(conn, """
                INSERT INTO ops_cleaners (
                    full_name, email, phone, home_postcode, borough,
                    cleaner_type, status, services_offered,
                    availability_type, currently_available,
                    compliance_status, dbs_status, transport_mode,
                    hourly_rate, emergency_cover, notes
                ) VALUES (%s,%s,%s,%s,%s,%s,'Active',%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                name, email, phone,
                (body.get("homePostcode") or body.get("home_postcode") or "").strip(),
                (body.get("borough") or body.get("area") or "").strip(),
                cleaner_type,
                (body.get("servicesOffered") or body.get("services") or "").strip(),
                (body.get("availType") or body.get("availabilityType") or "Full-time").strip(),
                (body.get("currentlyAvailable") or "Yes").strip(),
                compliance, dbs,
                (body.get("transport") or body.get("transportMode") or "Public Transport").strip(),
                rate,
                (body.get("emergencyCover") or "No").strip(),
                (body.get("notes") or f"Applied via Join Our Team form").strip(),
            ))

            new_id = db_pg.fetchval(conn, "SELECT MAX(id) FROM ops_cleaners WHERE email = %s", (email,))

        logger.info("New cleaner application: %s (%s) → id=%s", name, email, new_id)
        return {"status": "ok", "message": "Application received", "cleaner_id": new_id}

    except Exception as exc:
        logger.error("join-team error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save application")


# ── Compliance Templates ─────────────────────────────────────────────────────

@app.get("/api/compliance/templates")
def compliance_template_list():
    """List all available compliance document templates."""
    try:
        from compliance_templates import list_templates
        return list_templates()
    except ImportError:
        return []
    except Exception as exc:
        logger.error("compliance template list error: %s", exc)
        return []

@app.get("/api/compliance/templates/{name}")
def compliance_template_get(name: str):
    """Get a specific compliance document template by name."""
    try:
        from compliance_templates import get_template
        tpl = get_template(name)
        if tpl is None:
            raise HTTPException(status_code=404, detail="Template not found")
        return tpl
    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(status_code=404, detail="Templates module not available")
    except Exception as exc:
        logger.error("compliance template get error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Seed endpoint (temporary — for migrating operational data to Render) ──────
@app.post("/api/admin/seed-ops-data")
def seed_ops_data(payload: dict):
    """Accept JSON with table data and INSERT into Render DB. Skips existing IDs."""
    import db_pg as _db
    ALLOWED = {"ops_cleaners","pay_workers","pay_entries","fin_invoices","fin_expenses","fin_transactions","fin_settings","fin_payments"}
    results = {}
    try:
        for table, rows in payload.items():
            if table not in ALLOWED or not rows:
                continue
            inserted = 0
            for row in rows:
                row.pop("id", None)
                cols = list(row.keys())
                vals = [row[c] for c in cols]
                placeholders = ",".join(["%s"]*len(cols))
                col_names = ",".join(cols)
                try:
                    with _db.transaction() as conn:
                        cur = conn.cursor()
                        cur.execute(f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})", vals)
                        inserted += 1
                except Exception as e:
                    logger.warning("seed %s row error: %s", table, e)
                    if not results.get(table+"_errors"):
                        results[table+"_errors"] = []
                    if len(results.get(table+"_errors",[])) < 3:
                        results[table+"_errors"].append(str(e)[:200])
            results[table] = inserted
        return {"status": "ok", "inserted": results}
    except Exception as exc:
        logger.error("seed error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# EMAIL DELIVERABILITY PROTECTION LAYER
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/email/validate")
def validate_email_endpoint(body: dict = Body(...)):
    """Pre-send validation gate. Check email before sending."""
    try:
        from services.email_deliverability import validate_email, pre_send_check
        email = body.get('email', '')
        sector = body.get('sector', '')
        full_check = body.get('full_check', False)
        if full_check:
            with db_pg.transaction() as conn:
                return pre_send_check(conn, email, sector=sector or None)
        else:
            return validate_email(email, sector=sector or None, check_mx=body.get('check_mx', True))
    except Exception as e:
        logger.error("email validate: %s", e)
        return {"status": "error", "email": body.get('email',''), "error": str(e)}

@app.post("/api/email/validate-batch")
def validate_batch_endpoint(body: dict = Body(...)):
    """Validate multiple emails at once."""
    try:
        from services.email_deliverability import validate_email
        emails = body.get('emails', [])
        sector = body.get('sector', '')
        results = []
        for email in emails[:100]:  # Cap at 100
            results.append(validate_email(email, sector=sector or None, check_mx=True))
        valid = sum(1 for r in results if r['status'] == 'valid')
        risky = sum(1 for r in results if r['status'] == 'risky')
        invalid = sum(1 for r in results if r['status'] == 'invalid')
        return {"results": results, "summary": {"total": len(results), "valid": valid, "risky": risky, "invalid": invalid}}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/email/bounce")
def record_bounce_endpoint(body: dict = Body(...)):
    """Record a bounce event."""
    try:
        from services.email_deliverability import record_bounce
        with db_pg.transaction() as conn:
            return record_bounce(conn, body['email'], body['smtp_code'],
                                body.get('smtp_message', ''), body.get('entity_id'))
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/email/send-stats")
def send_stats_endpoint(hours: int = 24):
    """Get sending stats and rate limit status."""
    try:
        from services.email_deliverability import get_send_stats
        with db_pg.transaction() as conn:
            return get_send_stats(conn, hours)
    except Exception as e:
        return {"total_sent": 0, "bounce_rate_pct": 0, "sending_paused": False, "daily_cap": 50, "remaining_today": 50}

@app.get("/api/email/suppression-list")
def suppression_list_endpoint(limit: int = 100):
    """Get suppression list."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT * FROM email_suppression_list WHERE active = TRUE
                ORDER BY suppressed_at DESC LIMIT %s
            """, (limit,))
            return [dict(r) for r in rows]
    except Exception as e:
        return []

@app.delete("/api/email/suppression/{email}")
def unsuppress_email(email: str):
    """Remove email from suppression list (manual override)."""
    try:
        with db_pg.transaction() as conn:
            db_pg.execute(conn, "UPDATE email_suppression_list SET active = FALSE WHERE email = %s", (email,))
            return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ══════════════════════════════════════════════════════════════════════════════
# INTELLIGENCE ENGINE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/intelligence/alerts")
def get_intelligence_alerts(acknowledged: bool = False, limit: int = 50):
    """Get active intelligence alerts for Dashboard."""
    try:
        with db_pg.transaction() as conn:
            rows = db_pg.fetchall(conn, """
                SELECT * FROM intelligence_alerts
                WHERE acknowledged = %s
                ORDER BY
                    CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                    created_at DESC
                LIMIT %s
            """, (acknowledged, limit))
            return [dict(r) for r in rows]
    except Exception as e:
        logger.error("intelligence alerts: %s", e)
        return []

@app.post("/api/intelligence/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int):
    try:
        with db_pg.transaction() as conn:
            db_pg.execute(conn, "UPDATE intelligence_alerts SET acknowledged = TRUE WHERE id = %s", (alert_id,))
            return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/intelligence/daily-summary")
def daily_summary():
    """The Today Engine — daily intelligence for the Dashboard."""
    try:
        from services.intelligence_engine import daily_intelligence_summary
        with db_pg.transaction() as conn:
            return daily_intelligence_summary(conn)
    except Exception as e:
        logger.error("daily summary: %s", e)
        return {"leads_to_contact_today": 0, "followups_due": 0, "alerts_unacknowledged": 0, "top_opportunities": [], "at_risk_contracts": []}

@app.get("/api/intelligence/feasibility")
def check_feasibility(postcode: str = "", entity_id: int = 0, hours: float = 0, sector: str = ""):
    """Check operational feasibility for a site/postcode."""
    try:
        from services.intelligence_engine import compute_feasibility_score
        with db_pg.transaction() as conn:
            return compute_feasibility_score(conn, entity_id=entity_id or None, postcode=postcode or None, hours_per_week=hours, sector=sector or None)
    except Exception as e:
        logger.error("feasibility: %s", e)
        return {"feasibility_score": 0, "coverage_strength": "unknown", "warnings": [str(e)]}

@app.get("/api/intelligence/sector-costs")
def sector_costs(sector: str = "", borough: str = ""):
    """Sector cost benchmarks for Quotes module."""
    try:
        from services.intelligence_engine import sector_cost_summary
        with db_pg.transaction() as conn:
            return sector_cost_summary(conn, sector=sector, borough=borough or None)
    except Exception as e:
        logger.error("sector costs: %s", e)
        return {"avg_margin_pct": 0, "total_contracts_in_sector": 0}

@app.get("/api/intelligence/quote")
def quote_intel(entity_id: int = 0, postcode: str = "", sector: str = "", hours: float = 0, revenue: float = 0):
    """Full quote intelligence — sector benchmarks + feasibility + cleaner matching + scenarios."""
    try:
        from services.intelligence_engine import quote_intelligence
        with db_pg.transaction() as conn:
            return quote_intelligence(conn, entity_id=entity_id, postcode=postcode, sector=sector, hours_per_week=hours, monthly_revenue=revenue)
    except Exception as e:
        logger.error("quote intelligence: %s", e)
        return {"scenarios": [], "feasibility": {}, "top_cleaners": []}

@app.post("/api/intelligence/generate-alerts")
def trigger_alert_generation():
    """Manually trigger alert generation (also runs daily via scheduler)."""
    try:
        from services.intelligence_engine import generate_alerts
        with db_pg.transaction() as conn:
            count = generate_alerts(conn)
            return {"ok": True, "alerts_generated": count}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ══════════════════════════════════════════════════════════════════════════════
# CLEANER MATCHING ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/intelligence/cleaner-match")
def cleaner_match(postcode: str = "", hours: float = 0, sector: str = "", limit: int = 5):
    """Ranked cleaner matching for a site postcode."""
    try:
        from services.cleaner_matcher import match_cleaners
        with db_pg.transaction() as conn:
            return match_cleaners(conn, site_postcode=postcode, hours_needed=hours, sector=sector or None, limit=limit)
    except Exception as e:
        logger.error("cleaner match: %s", e)
        return []

@app.get("/api/intelligence/coverage")
def coverage_check(postcode: str = ""):
    """Coverage summary for a postcode district."""
    try:
        from services.cleaner_matcher import coverage_summary, extract_district
        with db_pg.transaction() as conn:
            district = extract_district(postcode) if postcode else ""
            return coverage_summary(conn, district)
    except Exception as e:
        logger.error("coverage: %s", e)
        return {"coverage_strength": "unknown", "total_cleaners_nearby": 0}

@app.post("/api/cleaners/{cleaner_id}/compute-coverage")
def compute_cleaner_cov(cleaner_id: int):
    """Compute and store coverage zones for a cleaner."""
    try:
        from services.cleaner_matcher import compute_cleaner_coverage
        with db_pg.transaction() as conn:
            count = compute_cleaner_coverage(conn, cleaner_id)
            return {"ok": True, "zones_computed": count}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ══════════════════════════════════════════════════════════════════════════════
# CONTRACTS LIFECYCLE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/contracts")
def list_contracts(status: str = "", page: int = 1, per_page: int = 50):
    """List contracts with optional status filter."""
    try:
        with db_pg.transaction() as conn:
            conditions = []
            params = []
            if status:
                conditions.append("status = %s")
                params.append(status)
            where = (" WHERE " + " AND ".join(conditions)) if conditions else ""
            total = db_pg.fetchval(conn, f"SELECT COUNT(*) FROM contracts{where}", params)
            offset = (page - 1) * per_page
            rows = db_pg.fetchall(conn, f"""
                SELECT c.*,
                    CASE WHEN c.contract_end IS NOT NULL AND c.contract_end <= CURRENT_DATE + 60 THEN TRUE ELSE FALSE END as expiring_soon
                FROM contracts c
                {where}
                ORDER BY c.created_at DESC
                LIMIT %s OFFSET %s
            """, params + [per_page, offset])
            return {"contracts": [dict(r) for r in rows], "total": total or 0, "page": page, "per_page": per_page}
    except Exception as e:
        logger.error("list contracts: %s", e)
        return {"contracts": [], "total": 0}

@app.get("/api/contracts/{contract_id}")
def get_contract(contract_id: int):
    """Get full contract detail with schedules, health, profitability."""
    try:
        from services.contract_lifecycle import check_launch_readiness, contract_profitability
        with db_pg.transaction() as conn:
            contract = db_pg.fetchone(conn, "SELECT * FROM contracts WHERE id = %s", (contract_id,))
            if not contract:
                raise HTTPException(404, "Contract not found")
            result = dict(contract)
            # Schedules
            result['schedules'] = [dict(r) for r in db_pg.fetchall(conn, "SELECT * FROM contract_schedules WHERE contract_id = %s ORDER BY day_of_week", (contract_id,))]
            # Readiness
            result['readiness'] = check_launch_readiness(conn, contract_id)
            # Profitability
            result['profitability'] = contract_profitability(conn, contract_id)
            # Recent inspections
            try:
                result['inspections'] = [dict(r) for r in db_pg.fetchall(conn, "SELECT * FROM ops_inspections WHERE site_name = %s ORDER BY inspection_date DESC LIMIT 5", (contract.get('site_name', ''),))]
            except Exception:
                result['inspections'] = []
            return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get contract: %s", e)
        raise HTTPException(500, str(e))

@app.post("/api/contracts")
def create_contract(body: dict = Body(...)):
    """Create a contract (directly or from opportunity)."""
    try:
        from services.contract_lifecycle import create_contract_from_opportunity, generate_schedules
        with db_pg.transaction() as conn:
            if body.get('opportunity_id'):
                result = create_contract_from_opportunity(conn, body['opportunity_id'], **body)
            else:
                # Direct creation
                row = db_pg.fetchone(conn, """
                    INSERT INTO contracts (entity_id, site_name, site_address, site_postcode,
                        service_type, cleaning_frequency, hours_per_week,
                        monthly_value_gbp, annual_value_gbp,
                        contract_start, contract_end, margin_pct,
                        status, staffing_status, launch_readiness, notes)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active','unassigned','pending',%s)
                    RETURNING *
                """, (
                    body.get('entity_id'), body.get('site_name', ''), body.get('site_address', ''),
                    body.get('site_postcode', ''), body.get('service_type', 'Regular Cleaning'),
                    body.get('cleaning_frequency', '5 days/week'), body.get('hours_per_week', 0),
                    body.get('monthly_value_gbp', 0), (body.get('monthly_value_gbp', 0) or 0) * 12,
                    body.get('contract_start'), body.get('contract_end'), body.get('margin_pct', 0),
                    body.get('notes', ''),
                ))
                result = dict(row) if row else {"error": "Insert failed"}
            # Auto-generate schedules if contract created
            if result and not result.get('error') and result.get('id'):
                generate_schedules(conn, result['id'])
            return result
    except Exception as e:
        logger.error("create contract: %s", e)
        raise HTTPException(500, str(e))

@app.put("/api/contracts/{contract_id}")
def update_contract(contract_id: int, body: dict = Body(...)):
    """Update contract fields."""
    try:
        with db_pg.transaction() as conn:
            allowed = ['site_name','site_address','site_postcode','service_type','cleaning_frequency',
                       'hours_per_week','monthly_value_gbp','contract_start','contract_end',
                       'renewal_date','notice_period_days','payment_terms','margin_pct',
                       'status','staffing_status','notes','risk_flag']
            sets = []
            params = []
            for k in allowed:
                if k in body:
                    sets.append(f"{k} = %s")
                    params.append(body[k])
            if not sets:
                return {"ok": False, "error": "No fields to update"}
            sets.append("updated_at = NOW()")
            if 'monthly_value_gbp' in body:
                sets.append("annual_value_gbp = %s")
                params.append((body['monthly_value_gbp'] or 0) * 12)
            params.append(contract_id)
            db_pg.execute(conn, f"UPDATE contracts SET {', '.join(sets)} WHERE id = %s", params)
            return db_pg.fetchone(conn, "SELECT * FROM contracts WHERE id = %s", (contract_id,)) or {}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/api/contracts/{contract_id}/assign-cleaner")
def assign_contract_cleaner(contract_id: int, body: dict = Body(...)):
    """Assign a cleaner to a contract."""
    try:
        from services.contract_lifecycle import assign_cleaner
        with db_pg.transaction() as conn:
            result = assign_cleaner(conn, contract_id, body['cleaner_id'], body.get('role', 'primary'))
            return result
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/contracts/{contract_id}/health")
def contract_health(contract_id: int):
    """Get contract health score."""
    try:
        from services.intelligence_engine import contract_health_score
        with db_pg.transaction() as conn:
            return contract_health_score(conn, contract_id)
    except Exception as e:
        return {"health_score": 0, "status_label": "unknown", "issues": [str(e)]}

@app.get("/api/contracts/{contract_id}/profitability")
def contract_profit(contract_id: int):
    """Get contract profitability analysis."""
    try:
        from services.contract_lifecycle import contract_profitability
        with db_pg.transaction() as conn:
            return contract_profitability(conn, contract_id)
    except Exception as e:
        return {"error": str(e)}

# ══════════════════════════════════════════════════════════════════════════════
# TODAY ENGINE ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/today")
def today_engine():
    """The Today Engine — what to do right now."""
    try:
        with db_pg.transaction() as conn:
            result = {}
            # Helper: run query with savepoint so failures don't abort the transaction
            def _safe_query(label, sql, params=None):
                try:
                    db_pg.execute(conn, "SAVEPOINT sp_%s" % label)
                    rows = db_pg.fetchall(conn, sql, params)
                    db_pg.execute(conn, "RELEASE SAVEPOINT sp_%s" % label)
                    return [dict(r) for r in rows]
                except Exception as e:
                    try:
                        db_pg.execute(conn, "ROLLBACK TO SAVEPOINT sp_%s" % label)
                    except Exception:
                        pass
                    logger.error("today %s: %s", label, e)
                    result[f'_debug_{label}_error'] = str(e)
                    return []
            def _safe_val(label, sql):
                try:
                    db_pg.execute(conn, "SAVEPOINT sp_%s" % label)
                    val = db_pg.fetchval(conn, sql) or 0
                    db_pg.execute(conn, "RELEASE SAVEPOINT sp_%s" % label)
                    return val
                except Exception as e:
                    try:
                        db_pg.execute(conn, "ROLLBACK TO SAVEPOINT sp_%s" % label)
                    except Exception:
                        pass
                    logger.error("today count %s: %s", label, e)
                    return 0

            # ── LEADS TO CONTACT TODAY (top 20 by composite score) ──
            # High score + not recently contacted + has contact info
            result['leads_to_contact'] = _safe_query('leads', """
                    SELECT vl.entity_id, vl.business_name, vl.borough, vl.sector,
                           vl.total_score, vl.score_band,
                           vl.primary_phone as phone, vl.primary_website as website,
                           vl.primary_email as email,
                           vl.quote_value_gbp as estimated_monthly_value_gbp,
                           vl.next_best_action,
                           vl.hvt,
                           CASE
                             WHEN vl.hvt = TRUE AND vl.total_score >= 75 THEN 'High-value target with strong score — contact immediately'
                             WHEN vl.total_score >= 80 THEN 'Top-scoring lead — priority outreach'
                             WHEN vl.hvt = TRUE THEN 'High-value target — worth pursuing'
                             WHEN vl.total_score >= 65 THEN 'Strong lead — ready for contact'
                             ELSE 'Good prospect — outreach recommended'
                           END as reason,
                           CASE
                             WHEN vl.primary_phone IS NOT NULL AND vl.primary_phone != '' THEN 'Call directly'
                             WHEN vl.primary_email IS NOT NULL AND vl.primary_email != '' THEN 'Send outreach email'
                             WHEN vl.primary_website IS NOT NULL AND vl.primary_website != '' THEN 'Find contact via website'
                             ELSE 'Research contact details'
                           END as suggested_action
                    FROM v_lead_board vl
                    WHERE vl.active = TRUE
                      AND vl.total_score >= 50
                      AND NOT EXISTS (
                          SELECT 1 FROM opportunities o
                          WHERE o.entity_id = vl.entity_id
                          AND o.current_stage IN ('won','lost')
                      )
                    ORDER BY
                        (CASE WHEN vl.hvt = TRUE THEN 20 ELSE 0 END) + vl.total_score DESC
                    LIMIT 20
                """)

            # ── FOLLOW-UPS DUE (top 10 stale pipeline items) ──
            result['followups_due'] = _safe_query('followups', """
                    SELECT o.id as opportunity_id, o.entity_id, o.title, o.current_stage,
                           o.updated_at, e.canonical_name as business_name,
                           e.sector,
                           a.borough,
                           os.total_score,
                           os.estimated_monthly_value_gbp,
                           EXTRACT(DAY FROM NOW() - o.updated_at)::int as days_stale,
                           CASE
                             WHEN EXTRACT(DAY FROM NOW() - o.updated_at) > 14 THEN 'Critical — ' || EXTRACT(DAY FROM NOW() - o.updated_at)::int || ' days with no activity. Risk of losing opportunity.'
                             WHEN EXTRACT(DAY FROM NOW() - o.updated_at) > 7 THEN 'Overdue — needs follow-up this week'
                             ELSE 'Due for follow-up — keep momentum'
                           END as reason,
                           CASE
                             WHEN o.current_stage = 'contacted' THEN 'Send follow-up email or call'
                             WHEN o.current_stage = 'replied' THEN 'Schedule site visit or send quote'
                             WHEN o.current_stage = 'meeting_or_site_visit' THEN 'Prepare and send quote'
                             WHEN o.current_stage = 'quote_sent' THEN 'Chase quote response'
                             WHEN o.current_stage = 'negotiating' THEN 'Push to close'
                             ELSE 'Review and advance'
                           END as suggested_action
                    FROM opportunities o
                    JOIN entities e ON e.id = o.entity_id
                    LEFT JOIN opportunity_scores os ON os.entity_id = o.entity_id
                    LEFT JOIN entity_locations el ON el.entity_id = o.entity_id AND el.is_primary = TRUE
                    LEFT JOIN addresses a ON a.id = el.address_id
                    WHERE o.current_stage NOT IN ('won','lost','dormant')
                      AND o.updated_at < NOW() - INTERVAL '2 days'
                    ORDER BY
                        EXTRACT(DAY FROM NOW() - o.updated_at) DESC,
                        COALESCE(os.total_score, 0) DESC
                    LIMIT 10
                """)

            # ── PUSH TO SITE VISIT (top 5 qualified leads ready for site visit) ──
            result['push_to_visit'] = _safe_query('push_visit', """
                    SELECT o.id as opportunity_id, o.entity_id, o.title, o.current_stage,
                           e.canonical_name as business_name, e.sector,
                           a.borough, a.postcode,
                           os.total_score, os.estimated_monthly_value_gbp,
                           'Contacted/replied lead with strong score — push to site visit' as reason,
                           'Propose site visit or virtual walkthrough' as suggested_action
                    FROM opportunities o
                    JOIN entities e ON e.id = o.entity_id
                    LEFT JOIN opportunity_scores os ON os.entity_id = o.entity_id
                    LEFT JOIN entity_locations el ON el.entity_id = o.entity_id AND el.is_primary = TRUE
                    LEFT JOIN addresses a ON a.id = el.address_id
                    WHERE o.current_stage IN ('contacted','replied')
                      AND COALESCE(os.total_score, 0) >= 60
                    ORDER BY COALESCE(os.total_score, 0) DESC, o.updated_at ASC
                    LIMIT 5
                """)

            # ── LEADS TO QUOTE (top 3 ready for quote) ──
            result['leads_to_quote'] = _safe_query('leads_quote', """
                    SELECT o.id as opportunity_id, o.entity_id, o.title, o.current_stage,
                           e.canonical_name as business_name, e.sector,
                           a.borough, a.postcode,
                           os.total_score, os.estimated_monthly_value_gbp,
                           'Qualified lead ready for quote — act now before competitor moves' as reason,
                           'Prepare and send quote today' as suggested_action
                    FROM opportunities o
                    JOIN entities e ON e.id = o.entity_id
                    LEFT JOIN opportunity_scores os ON os.entity_id = o.entity_id
                    LEFT JOIN entity_locations el ON el.entity_id = o.entity_id AND el.is_primary = TRUE
                    LEFT JOIN addresses a ON a.id = el.address_id
                    WHERE o.current_stage IN ('meeting_or_site_visit','replied','quote_prepared')
                      AND COALESCE(os.total_score, 0) >= 55
                    ORDER BY COALESCE(os.estimated_monthly_value_gbp, 0) DESC, os.total_score DESC
                    LIMIT 3
                """)

            # ── PIPELINE MOVEMENT RECOMMENDATIONS ──
            try:
                result['pipeline_movement'] = []
                # Ready → Contacted: leads sitting in ready/enriched/new with good scores
                ready_to_contact = db_pg.fetchall(conn, """
                    SELECT o.id as opportunity_id, e.canonical_name as business_name,
                           o.current_stage, os.total_score, e.sector, a.borough,
                           EXTRACT(DAY FROM NOW() - o.updated_at)::int as days_in_stage
                    FROM opportunities o
                    JOIN entities e ON e.id = o.entity_id
                    LEFT JOIN opportunity_scores os ON os.entity_id = o.entity_id
                    LEFT JOIN entity_locations el ON el.entity_id = o.entity_id AND el.is_primary = TRUE
                    LEFT JOIN addresses a ON a.id = el.address_id
                    WHERE o.current_stage IN ('new','enriched','ready_to_contact')
                      AND COALESCE(os.total_score, 0) >= 50
                    ORDER BY os.total_score DESC LIMIT 10
                """)
                for r in ready_to_contact:
                    d = dict(r)
                    d['recommendation'] = 'Move to Contacted — start outreach'
                    d['from_stage'] = d['current_stage']
                    d['to_stage'] = 'contacted'
                    result['pipeline_movement'].append(d)

                # Contacted stale → push forward or flag
                contacted_stale = db_pg.fetchall(conn, """
                    SELECT o.id as opportunity_id, e.canonical_name as business_name,
                           o.current_stage, os.total_score, e.sector, a.borough,
                           EXTRACT(DAY FROM NOW() - o.updated_at)::int as days_in_stage
                    FROM opportunities o
                    JOIN entities e ON e.id = o.entity_id
                    LEFT JOIN opportunity_scores os ON os.entity_id = o.entity_id
                    LEFT JOIN entity_locations el ON el.entity_id = o.entity_id AND el.is_primary = TRUE
                    LEFT JOIN addresses a ON a.id = el.address_id
                    WHERE o.current_stage = 'contacted'
                      AND o.updated_at < NOW() - INTERVAL '5 days'
                    ORDER BY COALESCE(os.total_score, 0) DESC LIMIT 5
                """)
                for r in contacted_stale:
                    d = dict(r)
                    d['recommendation'] = f"Stale {d.get('days_in_stage',0)}d — follow up or move to Replied/Lost"
                    d['from_stage'] = 'contacted'
                    d['to_stage'] = 'replied'
                    result['pipeline_movement'].append(d)

                # Quote sent stale → chase
                quote_stale = db_pg.fetchall(conn, """
                    SELECT o.id as opportunity_id, e.canonical_name as business_name,
                           o.current_stage, os.total_score,
                           os.estimated_monthly_value_gbp,
                           EXTRACT(DAY FROM NOW() - o.updated_at)::int as days_in_stage
                    FROM opportunities o
                    JOIN entities e ON e.id = o.entity_id
                    LEFT JOIN opportunity_scores os ON os.entity_id = o.entity_id
                    WHERE o.current_stage = 'quote_sent'
                      AND o.updated_at < NOW() - INTERVAL '3 days'
                    ORDER BY COALESCE(os.estimated_monthly_value_gbp, 0) DESC LIMIT 5
                """)
                for r in quote_stale:
                    d = dict(r)
                    d['recommendation'] = f"Quote sent {d.get('days_in_stage',0)}d ago — chase for response"
                    d['from_stage'] = 'quote_sent'
                    d['to_stage'] = 'negotiating'
                    result['pipeline_movement'].append(d)
            except Exception as e:
                logger.error("today pipeline_movement: %s", e)
                result['pipeline_movement'] = []

            # ── AT-RISK (commercial) ──
            try:
                result['at_risk'] = [dict(r) for r in db_pg.fetchall(conn, """
                    SELECT id, site_name, monthly_value_gbp, margin_pct, risk_flag, staffing_status
                    FROM contracts
                    WHERE status = 'active' AND (risk_flag IN ('risk','loss') OR margin_pct < 20 OR staffing_status = 'unassigned')
                    ORDER BY COALESCE(margin_pct, 0) ASC LIMIT 10
                """)]
            except Exception:
                result['at_risk'] = []

            # ── OVERDUE INVOICES ──
            try:
                result['overdue_invoices'] = [dict(r) for r in db_pg.fetchall(conn, """
                    SELECT id, client_name, amount, due_date,
                           EXTRACT(DAY FROM NOW() - due_date)::int as days_overdue
                    FROM fin_invoices
                    WHERE status = 'sent' AND due_date < CURRENT_DATE
                    ORDER BY due_date ASC LIMIT 10
                """)]
            except Exception:
                result['overdue_invoices'] = []

            # ── TOP BOROUGHS THIS WEEK ──
            try:
                result['top_boroughs'] = [dict(r) for r in db_pg.fetchall(conn, """
                    SELECT borough, COUNT(*) as lead_count,
                           ROUND(AVG(total_score)::NUMERIC, 1) as avg_score,
                           SUM(CASE WHEN hvt = TRUE THEN 1 ELSE 0 END) as hvt_count,
                           ROUND(SUM(COALESCE(estimated_monthly_value_gbp,0))::NUMERIC, 0) as total_value
                    FROM v_lead_board
                    WHERE active = TRUE AND borough IS NOT NULL AND borough != '' AND total_score >= 50
                    GROUP BY borough
                    HAVING COUNT(*) >= 3
                    ORDER BY AVG(total_score) DESC LIMIT 10
                """)]
            except Exception as e:
                result['top_boroughs'] = []
                result['_debug_boroughs_error'] = str(e)

            # ── COUNTS (each individually guarded with savepoints) ──
            counts = {}
            for key, sql in [
                ('total_leads', "SELECT COUNT(*) FROM v_lead_board WHERE active = TRUE"),
                ('active_pipeline', "SELECT COUNT(*) FROM opportunities WHERE current_stage NOT IN ('won','lost','dormant')"),
                ('won_contracts', "SELECT COUNT(*) FROM contracts WHERE status = 'active'"),
                ('stale_pipeline', "SELECT COUNT(*) FROM opportunities WHERE current_stage NOT IN ('won','lost','dormant') AND updated_at < NOW() - INTERVAL '3 days'"),
                ('pending_quotes', "SELECT COUNT(*) FROM quotes WHERE status IN ('draft','sent')"),
                ('active_cleaners', "SELECT COUNT(*) FROM ops_cleaners WHERE status = 'active'"),
                ('unstaffed_contracts', "SELECT COUNT(*) FROM contracts WHERE staffing_status = 'unassigned' AND status = 'active'"),
            ]:
                counts[key] = _safe_val(key, sql)
            result['counts'] = counts

            return result
    except Exception as e:
        logger.error("today engine: %s", e)
        return {"error": str(e)}


# ── SPA catch-all (must be last) ─────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def root():
    if os.path.isfile(_INDEX):
        return FileResponse(_INDEX)
    return FileResponse(_DIST_INDEX) if os.path.isfile(_DIST_INDEX) else {"status": "AskMiro OS running"}

@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    if os.path.isfile(_INDEX):
        return FileResponse(_INDEX)
    if os.path.isfile(_DIST_INDEX):
        return FileResponse(_DIST_INDEX)
    return {"status": "AskMiro OS running"}
