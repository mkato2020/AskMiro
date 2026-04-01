"""
analytics.py — AskMiro Lead Intelligence OS
Commercial reporting layer. Answers every strategic question.
All queries return clean dicts suitable for display, export, or dashboard consumption.
"""

import logging
from typing import List, Dict, Any

from database import db_connection

logger = logging.getLogger(__name__)


# ── Market intelligence ──────────────────────────────────────────────────────

def leads_by_borough(limit: int = 33) -> List[Dict]:
    """Which boroughs have the most prospects?"""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT borough, COUNT(*) as lead_count,
                      ROUND(AVG(priority_score),1) as avg_score,
                      SUM(high_value_target) as hvt_count
               FROM lead_records
               WHERE borough != 'Unknown'
               GROUP BY borough
               ORDER BY lead_count DESC
               LIMIT ?""",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def leads_by_sector(limit: int = 20) -> List[Dict]:
    """Which sectors have the most leads and highest scores?"""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT normalized_sector as sector,
                      COUNT(*) as lead_count,
                      ROUND(AVG(priority_score),1) as avg_score,
                      SUM(high_value_target) as hvt_count,
                      SUM(has_phone) as with_phone,
                      SUM(has_website) as with_website
               FROM lead_records
               GROUP BY normalized_sector
               ORDER BY avg_score DESC, lead_count DESC
               LIMIT ?""",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def top_leads_this_week(limit: int = 100) -> List[Dict]:
    """Best next N leads for weekly outreach."""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT place_id, business_name, normalized_sector, borough,
                      priority_score, score_reason, high_value_target,
                      likely_multi_site, next_best_action,
                      has_phone, has_website, phone, website,
                      ai_business_type, ai_decision_maker_type,
                      google_maps_url, address
               FROM lead_records
               WHERE ai_is_cleaning_target = 1
                 AND pipeline_status NOT IN ('in_pipeline','won','lost')
                 AND priority_score >= 55
               ORDER BY priority_score DESC, high_value_target DESC
               LIMIT ?""",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def high_value_targets(limit: int = 50) -> List[Dict]:
    """Shortlist of high-value targets — best for priority outreach."""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT * FROM lead_records
               WHERE high_value_target = 1
                 AND ai_is_cleaning_target = 1
                 AND pipeline_status NOT IN ('won','lost')
               ORDER BY priority_score DESC
               LIMIT ?""",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


# ── Pipeline analytics ───────────────────────────────────────────────────────

def pipeline_funnel() -> Dict[str, Any]:
    """Full pipeline funnel breakdown by status."""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT status, COUNT(*) as count
               FROM pipeline_leads
               GROUP BY status
               ORDER BY CASE status
                 WHEN 'new'           THEN 1
                 WHEN 'shortlisted'   THEN 2
                 WHEN 'contacted'     THEN 3
                 WHEN 'follow_up'     THEN 4
                 WHEN 'replied'       THEN 5
                 WHEN 'meeting_booked' THEN 6
                 WHEN 'quoted'        THEN 7
                 WHEN 'won'           THEN 8
                 WHEN 'lost'          THEN 9
                 WHEN 'dormant'       THEN 10
                 ELSE 11 END"""
        ).fetchall()

    funnel = {r["status"]: r["count"] for r in rows}

    # Conversion rates
    shortlisted = funnel.get("shortlisted", 0) + funnel.get("contacted", 0)
    replied     = funnel.get("replied", 0) + funnel.get("meeting_booked", 0)
    quoted      = funnel.get("quoted", 0)
    won         = funnel.get("won", 0)

    return {
        "funnel":           funnel,
        "reply_rate":       _pct(replied, shortlisted),
        "quote_rate":       _pct(quoted, shortlisted),
        "win_rate_from_quoted": _pct(won, quoted),
        "overall_win_rate": _pct(won, shortlisted),
    }


def pipeline_by_sector() -> List[Dict]:
    """Pipeline performance by sector — which converts best?"""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT pl.sector,
                      COUNT(*) as total,
                      SUM(CASE WHEN pl.status='won' THEN 1 ELSE 0 END) as won,
                      SUM(CASE WHEN pl.status='quoted' THEN 1 ELSE 0 END) as quoted,
                      SUM(CASE WHEN pl.reply_status='replied' THEN 1 ELSE 0 END) as replied
               FROM pipeline_leads pl
               GROUP BY pl.sector
               ORDER BY won DESC"""
        ).fetchall()
    return [
        {
            **dict(r),
            "win_rate":   _pct(r["won"], r["total"]),
            "reply_rate": _pct(r["replied"], r["total"]),
        }
        for r in rows
    ]


def pipeline_by_borough() -> List[Dict]:
    """Pipeline performance by borough — which areas convert best?"""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT pl.borough,
                      COUNT(*) as total,
                      SUM(CASE WHEN pl.status='won' THEN 1 ELSE 0 END) as won,
                      SUM(CASE WHEN pl.status='quoted' THEN 1 ELSE 0 END) as quoted
               FROM pipeline_leads pl
               GROUP BY pl.borough
               ORDER BY won DESC, total DESC"""
        ).fetchall()
    return [
        {**dict(r), "win_rate": _pct(r["won"], r["total"])}
        for r in rows
    ]


def reply_rate_by_channel() -> List[Dict]:
    """Which outreach channel gets the best reply rate?"""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT contact_channel,
                      COUNT(*) as total,
                      SUM(CASE WHEN reply_status='replied' THEN 1 ELSE 0 END) as replied
               FROM pipeline_leads
               WHERE contact_channel IS NOT NULL
               GROUP BY contact_channel
               ORDER BY replied DESC"""
        ).fetchall()
    return [
        {**dict(r), "reply_rate": _pct(r["replied"], r["total"])}
        for r in rows
    ]


# ── Contract analytics ───────────────────────────────────────────────────────

def contract_value_by_sector() -> List[Dict]:
    """Average and total contract value by sector."""
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT lr.normalized_sector as sector,
                      COUNT(c.id) as contracts,
                      ROUND(AVG(c.contract_value_gbp),2) as avg_monthly_gbp,
                      ROUND(SUM(c.contract_value_gbp),2) as total_monthly_gbp,
                      ROUND(SUM(c.contract_value_gbp)*12,2) as total_annual_gbp
               FROM contracts c
               JOIN lead_records lr ON c.place_id = lr.place_id
               WHERE c.account_status = 'active'
               GROUP BY lr.normalized_sector
               ORDER BY total_monthly_gbp DESC"""
        ).fetchall()
    return [dict(r) for r in rows]


def revenue_summary() -> Dict[str, Any]:
    """Top-line revenue snapshot."""
    with db_connection() as conn:
        row = conn.execute(
            """SELECT COUNT(*) as active_contracts,
                      ROUND(SUM(contract_value_gbp),2) as monthly_recurring,
                      ROUND(SUM(contract_value_gbp)*12,2) as annual_run_rate
               FROM contracts
               WHERE account_status = 'active'"""
        ).fetchone()
    return dict(row) if row else {}


# ── Borough visit planner ────────────────────────────────────────────────────

def best_borough_to_visit() -> List[Dict]:
    """
    Which borough cluster should AskMiro physically visit next?
    Scores: concentration of high-value targets × avg score.
    """
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT borough,
                      COUNT(*) as total_leads,
                      SUM(high_value_target) as hvt_count,
                      ROUND(AVG(priority_score),1) as avg_score,
                      SUM(has_phone) as contactable
               FROM lead_records
               WHERE ai_is_cleaning_target = 1
                 AND pipeline_status NOT IN ('won','lost')
                 AND borough != 'Unknown'
               GROUP BY borough
               HAVING hvt_count >= 2
               ORDER BY hvt_count DESC, avg_score DESC
               LIMIT 10"""
        ).fetchall()
    return [dict(r) for r in rows]


# ── Database health ──────────────────────────────────────────────────────────

def database_summary() -> Dict[str, Any]:
    """Quick health check / summary of database state."""
    with db_connection() as conn:
        total_raw      = conn.execute("SELECT COUNT(*) AS n FROM raw_leads").fetchone()["n"]
        total_leads    = conn.execute("SELECT COUNT(*) AS n FROM lead_records").fetchone()["n"]
        classified     = conn.execute("SELECT COUNT(*) AS n FROM lead_records WHERE ai_business_type IS NOT NULL").fetchone()["n"]
        scored         = conn.execute("SELECT COUNT(*) AS n FROM lead_records WHERE priority_score > 0").fetchone()["n"]
        with_website   = conn.execute("SELECT COUNT(*) AS n FROM lead_records WHERE website_summary IS NOT NULL").fetchone()["n"]
        in_pipeline    = conn.execute("SELECT COUNT(*) AS n FROM pipeline_leads").fetchone()["n"]
        won            = conn.execute("SELECT COUNT(*) AS n FROM pipeline_leads WHERE status='won'").fetchone()["n"]
        active_contracts = conn.execute("SELECT COUNT(*) AS n FROM contracts WHERE account_status='active'").fetchone()["n"]
        archived_leads = conn.execute("SELECT COUNT(*) AS n FROM lead_records WHERE archived_at IS NOT NULL").fetchone()["n"]
        manual_leads   = conn.execute("SELECT COUNT(*) AS n FROM lead_records WHERE source_system='manual'").fetchone()["n"]
        overdue_followups = conn.execute(
            "SELECT COUNT(*) AS n FROM pipeline_leads WHERE next_follow_up IS NOT NULL AND next_follow_up < date('now') AND status NOT IN ('won','lost','dormant')"
        ).fetchone()["n"]
        open_quotes    = conn.execute("SELECT COUNT(*) AS n FROM pipeline_leads WHERE status='quoted'").fetchone()["n"]
        won_this_month = conn.execute(
            "SELECT COUNT(*) AS n FROM pipeline_leads WHERE status='won' AND win_date >= date('now','start of month')"
        ).fetchone()["n"]

    return {
        "total_raw_leads":    total_raw,
        "total_lead_records": total_leads,
        "classified":         classified,
        "scored":             scored,
        "website_enriched":   with_website,
        "in_pipeline":        in_pipeline,
        "won":                won,
        "active_contracts":   active_contracts,
        "archived_leads":     archived_leads,
        "manual_leads":       manual_leads,
        "overdue_followups":  overdue_followups,
        "open_quotes":        open_quotes,
        "won_this_month":     won_this_month,
        "classification_pct": _pct(classified, total_leads),
        "scoring_pct":        _pct(scored, total_leads),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pct(numerator: int, denominator: int) -> str:
    if not denominator:
        return "0%"
    return f"{round(numerator / denominator * 100, 1)}%"


def buying_signal_breakdown() -> List[Dict]:
    with db_connection() as conn:
        rows = conn.execute("SELECT timing_urgency, COUNT(*) AS total, ROUND(AVG(buying_signal_score),1) AS avg_signal_score FROM lead_records WHERE buying_signal_score > 0 GROUP BY timing_urgency ORDER BY CASE timing_urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END").fetchall()
    return [dict(r) for r in rows]

def high_urgency_by_borough() -> List[Dict]:
    with db_connection() as conn:
        rows = conn.execute("SELECT borough, COUNT(*) AS high_urgency_leads, ROUND(AVG(priority_score),1) AS avg_score FROM lead_records WHERE timing_urgency='high' GROUP BY borough ORDER BY high_urgency_leads DESC, avg_score DESC").fetchall()
    return [dict(r) for r in rows]

def strong_triggers_by_sector() -> List[Dict]:
    with db_connection() as conn:
        rows = conn.execute("SELECT normalized_sector AS sector, COUNT(*) AS total, ROUND(AVG(buying_signal_score),1) AS avg_signal_score, SUM(CASE WHEN multi_site_signal=1 THEN 1 ELSE 0 END) AS multi_site, SUM(CASE WHEN hiring_signal=1 THEN 1 ELSE 0 END) AS hiring, SUM(CASE WHEN compliance_signal=1 THEN 1 ELSE 0 END) AS compliance FROM lead_records WHERE buying_signal_score > 0 GROUP BY normalized_sector ORDER BY avg_signal_score DESC, total DESC").fetchall()
    return [dict(r) for r in rows]


def activity_summary(days: int = 7) -> dict:
    """Real sales activity metrics for the last N days."""
    with db_connection() as conn:
        contacted = conn.execute(
            "SELECT COUNT(*) AS n FROM activities WHERE activity_type IN ('call','email','linkedin','in_person') AND created_at >= datetime('now', ?)",
            (f'-{days} days',)
        ).fetchone()['n']

        notes_added = conn.execute(
            "SELECT COUNT(*) AS n FROM notes WHERE created_at >= datetime('now', ?)",
            (f'-{days} days',)
        ).fetchone()['n']

        status_changes = conn.execute(
            "SELECT COUNT(*) AS n FROM activities WHERE activity_type='status_change' AND created_at >= datetime('now', ?)",
            (f'-{days} days',)
        ).fetchone()['n']

        stage_counts = conn.execute("""
            SELECT pl.status, COUNT(*) AS n FROM pipeline_leads pl
            JOIN lead_records lr ON pl.place_id = lr.place_id
            WHERE pl.status NOT IN ('won','lost','dormant')
            GROUP BY pl.status ORDER BY n DESC
        """).fetchall()

        stale = conn.execute("""
            SELECT COUNT(*) AS n FROM pipeline_leads
            WHERE status NOT IN ('won','lost','dormant')
            AND last_touched IS NOT NULL
            AND last_touched < datetime('now', '-14 days')
        """).fetchone()['n']

        overdue = conn.execute("""
            SELECT COUNT(*) AS n FROM pipeline_leads
            WHERE next_follow_up IS NOT NULL
            AND next_follow_up < date('now')
            AND status NOT IN ('won','lost','dormant')
        """).fetchone()['n']

        quotes_open = conn.execute("""
            SELECT COUNT(*) AS n, COALESCE(SUM(quote_value_gbp), 0) AS total_value
            FROM pipeline_leads WHERE status='quoted'
        """).fetchone()

        won_this_month = conn.execute("""
            SELECT COUNT(*) AS n, COALESCE(SUM(quote_value_gbp), 0) AS value
            FROM pipeline_leads WHERE status='won' AND win_date >= date('now','start of month')
        """).fetchone()

        return {
            "period_days": days,
            "contacted_this_period": contacted,
            "notes_added": notes_added,
            "status_changes": status_changes,
            "stale_leads": stale,
            "overdue_followups": overdue,
            "open_quotes": {"count": quotes_open['n'], "value": quotes_open['total_value']},
            "won_this_month": {"count": won_this_month['n'], "value": won_this_month['value']},
            "pipeline_by_stage": [dict(r) for r in stage_counts],
        }


def pipeline_velocity() -> dict:
    """Average days per stage, conversion rates."""
    with db_connection() as conn:
        # Win rate
        total_pipeline = conn.execute("SELECT COUNT(*) AS n FROM pipeline_leads WHERE status NOT IN ('new')").fetchone()['n']
        won = conn.execute("SELECT COUNT(*) AS n FROM pipeline_leads WHERE status='won'").fetchone()['n']
        lost = conn.execute("SELECT COUNT(*) AS n FROM pipeline_leads WHERE status='lost'").fetchone()['n']
        quoted = conn.execute("SELECT COUNT(*) AS n FROM pipeline_leads WHERE status IN ('quoted','won','lost','negotiating')").fetchone()['n']
        replied = conn.execute("SELECT COUNT(*) AS n FROM pipeline_leads WHERE status NOT IN ('new','shortlisted','contacted','follow_up','dormant')").fetchone()['n']
        contacted_total = conn.execute("SELECT COUNT(*) AS n FROM pipeline_leads WHERE status NOT IN ('new','shortlisted','dormant')").fetchone()['n']

        win_rate = round(won / total_pipeline * 100, 1) if total_pipeline > 0 else 0
        quote_to_win = round(won / quoted * 100, 1) if quoted > 0 else 0
        reply_rate = round(replied / contacted_total * 100, 1) if contacted_total > 0 else 0

        return {
            "total_engaged": total_pipeline,
            "won": won,
            "lost": lost,
            "quoted": quoted,
            "replied": replied,
            "win_rate_pct": win_rate,
            "quote_to_win_pct": quote_to_win,
            "reply_rate_pct": reply_rate,
        }
