"""
intelligence_engine.py — Central intelligence engine for AskMiro OS.

Cross-module intelligence calculations: alerts, feasibility scoring,
sector benchmarking, contract health, daily summaries, and quote intelligence.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Optional

import db_pg
from services.cleaner_matcher import match_cleaners, coverage_summary

logger = logging.getLogger(__name__)


# =====================================================================
# 1. generate_alerts
# =====================================================================

def generate_alerts(conn) -> int:
    """
    Scan the system and create/refresh intelligence_alerts.

    Checks contracts, invoices, cleaners, and compliance documents.
    Uses UPSERT logic to avoid duplicates and cleans stale acknowledged
    alerts older than 7 days.

    Returns count of alerts created/updated.
    """
    count = 0
    try:
        # --- Housekeeping: remove stale acknowledged alerts ---
        db_pg.execute(conn, """
            DELETE FROM intelligence_alerts
            WHERE acknowledged = TRUE
              AND created_at < NOW() - INTERVAL '7 days'
        """)

        # --- Expiring contracts (within 60 days) ---
        try:
            rows = db_pg.fetchall(conn, """
                SELECT id, entity_id, business_name, end_date,
                       COALESCE(margin_pct, 0) AS margin_pct
                FROM contracts
                WHERE status = 'active'
                  AND end_date IS NOT NULL
                  AND end_date <= NOW() + INTERVAL '60 days'
                  AND end_date > NOW()
            """)
            for r in rows:
                days_left = (r["end_date"].date() - date.today()).days if hasattr(r["end_date"], "date") else 60
                severity = "critical" if days_left <= 14 else "warning"
                _upsert_alert(conn, {
                    "alert_type": "contract_expiring",
                    "entity_id": r.get("entity_id"),
                    "contract_id": r["id"],
                    "cleaner_id": None,
                    "severity": severity,
                    "title": f"Contract expiring in {days_left} days",
                    "description": f"{r.get('business_name', 'Unknown')} contract ends {r['end_date']}.",
                    "recommended_action": "Review renewal options and contact the client.",
                })
                count += 1
        except Exception:
            logger.exception("Error checking expiring contracts")

        # --- Low margin contracts (below 20%) ---
        try:
            rows = db_pg.fetchall(conn, """
                SELECT id, entity_id, business_name,
                       COALESCE(margin_pct, 0) AS margin_pct
                FROM contracts
                WHERE status = 'active'
                  AND COALESCE(margin_pct, 0) < 20
            """)
            for r in rows:
                margin = float(r["margin_pct"])
                severity = "critical" if margin < 10 else "warning"
                _upsert_alert(conn, {
                    "alert_type": "margin_risk",
                    "entity_id": r.get("entity_id"),
                    "contract_id": r["id"],
                    "cleaner_id": None,
                    "severity": severity,
                    "title": f"Low margin: {margin:.1f}%",
                    "description": f"{r.get('business_name', 'Unknown')} margin is {margin:.1f}%, below 20% target.",
                    "recommended_action": "Review pricing or reduce costs.",
                })
                count += 1
        except Exception:
            logger.exception("Error checking margin risk")

        # --- Unassigned contracts ---
        try:
            rows = db_pg.fetchall(conn, """
                SELECT id, entity_id, business_name
                FROM contracts
                WHERE status = 'active'
                  AND (staffing_status = 'unassigned' OR staffing_status IS NULL)
            """)
            for r in rows:
                _upsert_alert(conn, {
                    "alert_type": "unassigned_contract",
                    "entity_id": r.get("entity_id"),
                    "contract_id": r["id"],
                    "cleaner_id": None,
                    "severity": "warning",
                    "title": "Contract has no assigned cleaner",
                    "description": f"{r.get('business_name', 'Unknown')} needs staff assignment.",
                    "recommended_action": "Use cleaner matcher to assign staff.",
                })
                count += 1
        except Exception:
            logger.exception("Error checking unassigned contracts")

        # --- Contracts with risk flags ---
        try:
            rows = db_pg.fetchall(conn, """
                SELECT id, entity_id, business_name, risk_flags
                FROM contracts
                WHERE status = 'active'
                  AND risk_flags IS NOT NULL
                  AND risk_flags != ''
            """)
            for r in rows:
                _upsert_alert(conn, {
                    "alert_type": "contract_risk_flag",
                    "entity_id": r.get("entity_id"),
                    "contract_id": r["id"],
                    "cleaner_id": None,
                    "severity": "warning",
                    "title": "Contract risk flag",
                    "description": f"{r.get('business_name', 'Unknown')}: {r.get('risk_flags', '')}",
                    "recommended_action": "Review and resolve flagged risks.",
                })
                count += 1
        except Exception:
            logger.exception("Error checking contract risk flags")

        # --- Overdue invoices ---
        try:
            rows = db_pg.fetchall(conn, """
                SELECT id, entity_id, contract_id, invoice_number,
                       due_date, total_amount
                FROM fin_invoices
                WHERE status = 'sent'
                  AND due_date < NOW()
            """)
            for r in rows:
                days_overdue = (date.today() - r["due_date"].date()).days if hasattr(r["due_date"], "date") else 0
                severity = "critical" if days_overdue > 30 else "warning"
                _upsert_alert(conn, {
                    "alert_type": "overdue_invoice",
                    "entity_id": r.get("entity_id"),
                    "contract_id": r.get("contract_id"),
                    "cleaner_id": None,
                    "severity": severity,
                    "title": f"Invoice {r.get('invoice_number', '')} overdue by {days_overdue} days",
                    "description": f"Amount: {r.get('total_amount', 0)}. Due: {r['due_date']}.",
                    "recommended_action": "Send payment reminder or escalate.",
                })
                count += 1
        except Exception:
            logger.exception("Error checking overdue invoices")

        # --- Overloaded cleaners (assigned_hours > 35) ---
        try:
            rows = db_pg.fetchall(conn, """
                SELECT id, full_name, assigned_hours
                FROM ops_cleaners
                WHERE status = 'Active'
                  AND COALESCE(assigned_hours, 0) > 35
            """)
            for r in rows:
                _upsert_alert(conn, {
                    "alert_type": "capacity_warning",
                    "entity_id": None,
                    "contract_id": None,
                    "cleaner_id": r["id"],
                    "severity": "info",
                    "title": f"{r['full_name']} overloaded ({r['assigned_hours']}h/week)",
                    "description": f"Assigned {r['assigned_hours']} hours, exceeding 35h threshold.",
                    "recommended_action": "Redistribute work or hire additional staff.",
                })
                count += 1
        except Exception:
            logger.exception("Error checking overloaded cleaners")

        # --- Expiring compliance documents (within 30 days) ---
        try:
            rows = db_pg.fetchall(conn, """
                SELECT id, cleaner_id, document_type, expiry_date
                FROM compliance_documents
                WHERE expiry_date IS NOT NULL
                  AND expiry_date <= NOW() + INTERVAL '30 days'
                  AND expiry_date > NOW()
            """)
            for r in rows:
                days_left = (r["expiry_date"].date() - date.today()).days if hasattr(r["expiry_date"], "date") else 30
                severity = "critical" if days_left <= 7 else "warning"
                _upsert_alert(conn, {
                    "alert_type": "compliance_expiring",
                    "entity_id": None,
                    "contract_id": None,
                    "cleaner_id": r.get("cleaner_id"),
                    "severity": severity,
                    "title": f"{r.get('document_type', 'Document')} expires in {days_left} days",
                    "description": f"Document expires {r['expiry_date']}. Cleaner ID: {r.get('cleaner_id')}.",
                    "recommended_action": "Request renewal from the cleaner.",
                })
                count += 1
        except Exception:
            logger.exception("Error checking compliance documents")

        conn.commit()
    except Exception:
        logger.exception("generate_alerts failed")
        try:
            conn.rollback()
        except Exception:
            pass
        return 0

    logger.info("generate_alerts completed: %d alerts created/updated", count)
    return count


def _upsert_alert(conn, data: dict) -> None:
    """Insert or update an intelligence alert using composite uniqueness."""
    db_pg.execute(conn, """
        INSERT INTO intelligence_alerts
            (alert_type, entity_id, contract_id, cleaner_id,
             severity, title, description, recommended_action,
             acknowledged, created_at, updated_at)
        VALUES
            (%(alert_type)s, %(entity_id)s, %(contract_id)s, %(cleaner_id)s,
             %(severity)s, %(title)s, %(description)s, %(recommended_action)s,
             FALSE, NOW(), NOW())
        ON CONFLICT (alert_type, COALESCE(entity_id, 0), COALESCE(contract_id, 0), COALESCE(cleaner_id, 0))
        DO UPDATE SET
            severity = EXCLUDED.severity,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            recommended_action = EXCLUDED.recommended_action,
            updated_at = NOW(),
            acknowledged = FALSE
    """, data)


# =====================================================================
# 2. compute_feasibility_score
# =====================================================================

def compute_feasibility_score(
    conn,
    entity_id: int = None,
    postcode: str = None,
    hours_per_week: float = 0,
    sector: str = None,
) -> dict:
    """
    Compute a feasibility score (0-100) for a potential contract/quote.

    Evaluates cleaner availability, coverage strength, capacity risk,
    and travel burden for the given postcode and requirements.
    """
    defaults = {
        "feasibility_score": 0,
        "cleaner_availability": 0,
        "coverage_strength": "none",
        "capacity_risk": False,
        "travel_burden": "high",
        "warnings": [],
        "recommendation": "Insufficient data to assess feasibility.",
    }

    if not postcode:
        defaults["warnings"].append("No postcode provided.")
        return defaults

    try:
        # Extract district from postcode (first part)
        district = postcode.strip().upper().split()[0] if postcode else ""

        cov = coverage_summary(conn, district)
        total_nearby = cov.get("total_cleaners_nearby", 0)
        available = cov.get("available_cleaners", 0)
        avg_dist = cov.get("avg_distance_km")
        strength = cov.get("coverage_strength", "none")

        # Match cleaners for more detail
        matched = match_cleaners(conn, postcode, hours_needed=hours_per_week,
                                 sector=sector, limit=10)

        warnings: list[str] = []

        # --- Capacity risk ---
        capacity_risk = False
        if total_nearby > 0 and available <= 1:
            capacity_risk = True
            warnings.append("Most nearby cleaners are near capacity.")

        # --- Travel burden ---
        if avg_dist is not None:
            if avg_dist <= 5:
                travel_burden = "low"
            elif avg_dist <= 12:
                travel_burden = "moderate"
            else:
                travel_burden = "high"
                warnings.append(f"Average distance to cleaners is {avg_dist:.1f} km.")
        else:
            travel_burden = "high"
            warnings.append("Cannot estimate travel — no nearby cleaners found.")

        # --- Feasibility score ---
        score = 0.0

        # Coverage component (40 points)
        coverage_scores = {"strong": 40, "moderate": 25, "weak": 10, "none": 0}
        score += coverage_scores.get(strength, 0)

        # Availability component (30 points)
        if available >= 5:
            score += 30
        elif available >= 3:
            score += 22
        elif available >= 1:
            score += 12
        else:
            warnings.append("No available cleaners within 30 minutes.")

        # Travel component (20 points)
        travel_scores = {"low": 20, "moderate": 12, "high": 5}
        score += travel_scores.get(travel_burden, 0)

        # Match quality bonus (10 points)
        if matched:
            best_quality = matched[0].get("match_quality", "poor")
            quality_bonus = {"excellent": 10, "good": 7, "fair": 4, "poor": 1}
            score += quality_bonus.get(best_quality, 0)

        score = min(100, max(0, round(score)))

        # --- Recommendation ---
        if score >= 75:
            rec = f"Good coverage in {district} with {available} available cleaner{'s' if available != 1 else ''}."
        elif score >= 50:
            rec = f"Moderate coverage in {district}. {available} cleaner{'s' if available != 1 else ''} available but capacity may be tight."
        elif score >= 25:
            rec = f"Limited coverage in {district}. Consider recruiting before committing."
        else:
            rec = f"Poor coverage in {district}. Significant recruitment needed."

        if travel_burden == "low":
            rec += " Low travel burden."
        elif travel_burden == "moderate":
            rec += " Moderate travel burden."
        else:
            rec += " High travel burden — may affect retention."

        return {
            "feasibility_score": score,
            "cleaner_availability": available,
            "coverage_strength": strength,
            "capacity_risk": capacity_risk,
            "travel_burden": travel_burden,
            "warnings": warnings,
            "recommendation": rec,
        }

    except Exception:
        logger.exception("compute_feasibility_score failed for postcode=%s", postcode)
        defaults["warnings"].append("Error computing feasibility.")
        return defaults


# =====================================================================
# 3. sector_cost_summary
# =====================================================================

def sector_cost_summary(conn, sector: str, borough: str = None) -> dict:
    """
    Return sector-level cost and margin benchmarks.

    Pulls from fin_snapshots and contracts tables.
    Returns safe defaults if no data exists.
    """
    defaults = {
        "avg_margin_pct": None,
        "avg_monthly_revenue": None,
        "avg_labour_cost_per_hour": None,
        "total_contracts_in_sector": 0,
        "margin_trend": "stable",
        "benchmark_note": f"No data available for {sector} sector.",
    }

    if not sector:
        return defaults

    try:
        # --- Contracts aggregate ---
        borough_clause = "AND LOWER(borough) = LOWER(%(borough)s)" if borough else ""
        params: dict = {"sector": sector}
        if borough:
            params["borough"] = borough

        agg = db_pg.fetchone(conn, f"""
            SELECT
                COUNT(*)                              AS total,
                AVG(COALESCE(margin_pct, 0))          AS avg_margin,
                AVG(COALESCE(monthly_revenue, 0))     AS avg_revenue,
                AVG(COALESCE(labour_cost_per_hour, 0)) AS avg_labour_cost
            FROM contracts
            WHERE LOWER(sector) = LOWER(%(sector)s)
              AND status = 'active'
              {borough_clause}
        """, params)

        if not agg or agg["total"] == 0:
            return defaults

        total = int(agg["total"])
        avg_margin = round(float(agg["avg_margin"] or 0), 1)
        avg_revenue = round(float(agg["avg_revenue"] or 0), 2)
        avg_labour = round(float(agg["avg_labour_cost"] or 0), 2)

        # --- Margin trend from fin_snapshots ---
        margin_trend = "stable"
        try:
            snapshots = db_pg.fetchall(conn, """
                SELECT snapshot_date, avg_margin_pct
                FROM fin_snapshots
                WHERE sector = %(sector)s
                ORDER BY snapshot_date DESC
                LIMIT 3
            """, {"sector": sector})

            if len(snapshots) >= 2:
                margins = [float(s["avg_margin_pct"] or 0) for s in snapshots]
                if margins[0] > margins[-1] + 2:
                    margin_trend = "improving"
                elif margins[0] < margins[-1] - 2:
                    margin_trend = "declining"
        except Exception:
            logger.debug("Could not compute margin trend for sector %s", sector)

        # --- Benchmark note ---
        location = f" in {borough}" if borough else ""
        note = (
            f"{sector.replace('_', ' ').title()} cleaning{location} averages "
            f"{avg_margin:.0f}% margin across {total} contract{'s' if total != 1 else ''}."
        )

        return {
            "avg_margin_pct": avg_margin,
            "avg_monthly_revenue": avg_revenue,
            "avg_labour_cost_per_hour": avg_labour,
            "total_contracts_in_sector": total,
            "margin_trend": margin_trend,
            "benchmark_note": note,
        }

    except Exception:
        logger.exception("sector_cost_summary failed for sector=%s", sector)
        return defaults


# =====================================================================
# 4. contract_health_score
# =====================================================================

def contract_health_score(conn, contract_id: int) -> dict:
    """
    Compute a weighted health score (0-100) for a contract.

    Weights: margin 40%, quality 20%, payment 20%, staffing 20%.
    """
    defaults = {
        "health_score": 0,
        "margin_component": 0,
        "quality_component": 0,
        "payment_component": 0,
        "staffing_component": 0,
        "status_label": "critical",
        "issues": ["Contract data not found."],
    }

    try:
        contract = db_pg.fetchone(conn, """
            SELECT id, business_name, margin_pct, margin_target,
                   staffing_status, status
            FROM contracts
            WHERE id = %s
        """, (contract_id,))

        if not contract:
            return defaults

        issues: list[str] = []

        # --- Margin component (40%) ---
        margin = float(contract.get("margin_pct") or 0)
        target = float(contract.get("margin_target") or 25)
        if margin >= target:
            margin_score = 100
        elif margin >= target * 0.8:
            margin_score = 70
        elif margin >= target * 0.5:
            margin_score = 40
            issues.append(f"Margin ({margin:.1f}%) significantly below target ({target:.0f}%).")
        else:
            margin_score = 10
            issues.append(f"Critical: margin ({margin:.1f}%) is dangerously low.")

        # --- Quality component (20%) ---
        quality_score = 70  # default if no inspections
        try:
            insp = db_pg.fetchone(conn, """
                SELECT score FROM ops_inspections
                WHERE contract_id = %s
                ORDER BY inspection_date DESC
                LIMIT 1
            """, (contract_id,))
            if insp and insp.get("score") is not None:
                quality_score = min(100, max(0, int(insp["score"])))
                if quality_score < 60:
                    issues.append(f"Latest inspection score is low ({quality_score}/100).")
        except Exception:
            logger.debug("No inspections data for contract %s", contract_id)

        # --- Payment component (20%) ---
        payment_score = 80  # default if no invoices
        try:
            inv_stats = db_pg.fetchone(conn, """
                SELECT
                    COUNT(*)                                        AS total,
                    COUNT(*) FILTER (WHERE status = 'paid')         AS paid,
                    COUNT(*) FILTER (WHERE status = 'sent'
                                     AND due_date < NOW())          AS overdue
                FROM fin_invoices
                WHERE contract_id = %s
            """, (contract_id,))
            if inv_stats and inv_stats["total"] > 0:
                total_inv = int(inv_stats["total"])
                paid = int(inv_stats["paid"])
                overdue = int(inv_stats["overdue"])
                payment_score = round((paid / total_inv) * 100) if total_inv else 80
                if overdue > 0:
                    payment_score = max(0, payment_score - (overdue * 15))
                    issues.append(f"{overdue} overdue invoice{'s' if overdue != 1 else ''}.")
        except Exception:
            logger.debug("No invoice data for contract %s", contract_id)

        # --- Staffing component (20%) ---
        staffing_status = (contract.get("staffing_status") or "").lower()
        if staffing_status == "fully_staffed" or staffing_status == "assigned":
            staffing_score = 100
        elif staffing_status == "partial":
            staffing_score = 50
            issues.append("Contract is only partially staffed.")
        else:
            staffing_score = 10
            issues.append("No cleaner assigned to this contract.")

        # --- Weighted total ---
        health = round(
            margin_score * 0.40
            + quality_score * 0.20
            + payment_score * 0.20
            + staffing_score * 0.20
        )
        health = min(100, max(0, health))

        # --- Status label ---
        if health >= 85:
            label = "excellent"
        elif health >= 70:
            label = "good"
        elif health >= 55:
            label = "needs_attention"
        elif health >= 35:
            label = "at_risk"
        else:
            label = "critical"

        return {
            "health_score": health,
            "margin_component": margin_score,
            "quality_component": quality_score,
            "payment_component": payment_score,
            "staffing_component": staffing_score,
            "status_label": label,
            "issues": issues,
        }

    except Exception:
        logger.exception("contract_health_score failed for contract_id=%s", contract_id)
        return defaults


# =====================================================================
# 5. daily_intelligence_summary
# =====================================================================

def daily_intelligence_summary(conn) -> dict:
    """
    Build the daily intelligence summary for the Dashboard.

    Returns counts and lists for leads, quotes, contracts, invoices,
    cleaners, alerts, and top opportunities/at-risk contracts.
    """
    summary = {
        "leads_to_contact_today": 0,
        "followups_due": 0,
        "interested_replies": 0,
        "quotes_pending": 0,
        "low_margin_quotes": 0,
        "contracts_needing_staff": 0,
        "expiring_contracts": 0,
        "overdue_invoices": 0,
        "cleaner_capacity_pct": 0.0,
        "alerts_unacknowledged": 0,
        "top_opportunities": [],
        "at_risk_contracts": [],
    }

    def _safe_val(sql, params=(), default=0):
        """Fetch a single value, returning default on any error."""
        try:
            val = db_pg.fetchval(conn, sql, params)
            return val if val is not None else default
        except Exception:
            return default

    try:
        today = date.today()

        # --- Pipeline / outreach counts ---
        summary["leads_to_contact_today"] = _safe_val("""
            SELECT COUNT(*) FROM pipeline
            WHERE current_stage IN ('ready_to_contact', 'new', 'enriched')
              AND (next_action_at IS NULL OR next_action_at::date <= %s)
        """, (today,))

        summary["followups_due"] = _safe_val("""
            SELECT COUNT(*) FROM pipeline
            WHERE next_action_at IS NOT NULL
              AND next_action_at::date <= %s
              AND current_stage NOT IN ('won', 'lost', 'dormant')
        """, (today,))

        summary["interested_replies"] = _safe_val("""
            SELECT COUNT(*) FROM pipeline
            WHERE current_stage = 'replied'
              AND reply_sentiment = 'interested'
        """)

        # --- Quotes ---
        summary["quotes_pending"] = _safe_val("""
            SELECT COUNT(*) FROM quotes
            WHERE status IN ('draft', 'sent')
        """)

        summary["low_margin_quotes"] = _safe_val("""
            SELECT COUNT(*) FROM quotes
            WHERE status IN ('draft', 'sent')
              AND COALESCE(margin_pct, 0) < 20
        """)

        # --- Contracts ---
        summary["contracts_needing_staff"] = _safe_val("""
            SELECT COUNT(*) FROM contracts
            WHERE status = 'active'
              AND (staffing_status = 'unassigned' OR staffing_status IS NULL)
        """)

        summary["expiring_contracts"] = _safe_val("""
            SELECT COUNT(*) FROM contracts
            WHERE status = 'active'
              AND end_date IS NOT NULL
              AND end_date <= NOW() + INTERVAL '60 days'
              AND end_date > NOW()
        """)

        # --- Invoices ---
        summary["overdue_invoices"] = _safe_val("""
            SELECT COUNT(*) FROM fin_invoices
            WHERE status = 'sent'
              AND due_date < NOW()
        """)

        # --- Cleaner capacity ---
        try:
            cap = db_pg.fetchone(conn, """
                SELECT AVG(COALESCE(assigned_hours, 0) / 35.0 * 100) AS avg_pct
                FROM ops_cleaners
                WHERE status = 'Active'
            """)
            if cap and cap.get("avg_pct") is not None:
                summary["cleaner_capacity_pct"] = round(float(cap["avg_pct"]), 1)
        except Exception:
            pass

        # --- Alerts ---
        summary["alerts_unacknowledged"] = _safe_val("""
            SELECT COUNT(*) FROM intelligence_alerts
            WHERE acknowledged = FALSE
        """)

        # --- Top opportunities ---
        try:
            opps = db_pg.fetchall(conn, """
                SELECT id, business_name, current_stage,
                       COALESCE(estimated_value, 0) AS estimated_value,
                       COALESCE(lead_score, 0)       AS lead_score
                FROM pipeline
                WHERE current_stage NOT IN ('won', 'lost', 'dormant')
                ORDER BY lead_score DESC, estimated_value DESC
                LIMIT 5
            """)
            summary["top_opportunities"] = [
                {
                    "id": o["id"],
                    "business_name": o.get("business_name", "Unknown"),
                    "stage": o.get("current_stage"),
                    "lead_score": float(o.get("lead_score", 0)),
                    "estimated_value": float(o.get("estimated_value", 0)),
                }
                for o in opps
            ]
        except Exception:
            logger.debug("Could not fetch top opportunities")

        # --- At-risk contracts ---
        try:
            contracts = db_pg.fetchall(conn, """
                SELECT id, business_name FROM contracts
                WHERE status = 'active'
            """)
            at_risk = []
            for c in contracts:
                health = contract_health_score(conn, c["id"])
                if health["health_score"] < 50:
                    at_risk.append({
                        "contract_id": c["id"],
                        "business_name": c.get("business_name", "Unknown"),
                        "health_score": health["health_score"],
                        "status_label": health["status_label"],
                        "issues": health["issues"],
                    })
            at_risk.sort(key=lambda x: x["health_score"])
            summary["at_risk_contracts"] = at_risk
        except Exception:
            logger.debug("Could not compute at-risk contracts")

    except Exception:
        logger.exception("daily_intelligence_summary failed")

    return summary


# =====================================================================
# 6. quote_intelligence
# =====================================================================

def quote_intelligence(
    conn,
    entity_id: int,
    postcode: str,
    sector: str,
    hours_per_week: float,
    monthly_revenue: float,
) -> dict:
    """
    Provide intelligence for the Quotes module.

    Combines sector benchmarks, feasibility scoring, cleaner matching,
    and scenario modelling into a single response.
    """
    defaults = {
        "sector_avg_margin": None,
        "estimated_margin_pct": None,
        "margin_vs_sector": None,
        "margin_assessment": "unknown",
        "feasibility": {},
        "top_cleaners": [],
        "commercial_recommendation": "Insufficient data for recommendation.",
        "scenarios": [],
    }

    try:
        # --- Sector benchmarks ---
        sector_data = sector_cost_summary(conn, sector)
        sector_avg = sector_data.get("avg_margin_pct")

        # --- Estimated costs and margin ---
        avg_rate = sector_data.get("avg_labour_cost_per_hour") or 13.00
        weekly_labour = hours_per_week * avg_rate
        monthly_labour = weekly_labour * 4.33  # avg weeks/month
        overhead_pct = 0.12  # supplies, insurance, management
        monthly_cost = monthly_labour * (1 + overhead_pct)
        estimated_margin = ((monthly_revenue - monthly_cost) / monthly_revenue * 100) if monthly_revenue > 0 else 0
        estimated_margin = round(estimated_margin, 1)

        margin_vs = round(estimated_margin - (sector_avg or 0), 1) if sector_avg is not None else None

        # --- Margin assessment ---
        if estimated_margin >= 30:
            assessment = "above_average"
        elif estimated_margin >= 20:
            assessment = "on_target"
        elif estimated_margin >= 10:
            assessment = "below_average"
        else:
            assessment = "risky"

        # --- Feasibility ---
        feasibility = compute_feasibility_score(
            conn, entity_id=entity_id, postcode=postcode,
            hours_per_week=hours_per_week, sector=sector,
        )

        # --- Top cleaners ---
        top_cleaners_raw = match_cleaners(
            conn, site_postcode=postcode, hours_needed=hours_per_week,
            sector=sector, limit=3,
        )
        top_cleaners = [
            {
                "cleaner_id": c["cleaner_id"],
                "full_name": c["full_name"],
                "distance_km": c["distance_km"],
                "travel_minutes": c["travel_minutes"],
                "pay_rate": c["pay_rate"],
                "match_quality": c["match_quality"],
            }
            for c in top_cleaners_raw
        ]

        # --- Commercial recommendation ---
        parts = []
        if feasibility.get("feasibility_score", 0) >= 60:
            parts.append(f"Operationally viable in {postcode.split()[0] if postcode else 'area'}.")
        else:
            parts.append(f"Operational risk in {postcode.split()[0] if postcode else 'area'} — limited cleaner availability.")

        if assessment == "above_average":
            parts.append(f"Strong margin at {estimated_margin:.0f}%.")
        elif assessment == "on_target":
            parts.append(f"Margin of {estimated_margin:.0f}% is on target.")
        elif assessment == "below_average":
            parts.append(f"Margin of {estimated_margin:.0f}% is below average — review pricing.")
        else:
            parts.append(f"Margin of {estimated_margin:.0f}% is risky — reconsider pricing or scope.")

        if top_cleaners:
            best = top_cleaners[0]
            parts.append(f"Best match: {best['full_name']} ({best['distance_km']:.1f} km, {best['travel_minutes']} min).")

        recommendation = " ".join(parts)

        # --- Scenarios ---
        scenarios = _build_pricing_scenarios(
            monthly_revenue, monthly_cost, hours_per_week, avg_rate,
        )

        return {
            "sector_avg_margin": sector_avg,
            "estimated_margin_pct": estimated_margin,
            "margin_vs_sector": margin_vs,
            "margin_assessment": assessment,
            "feasibility": feasibility,
            "top_cleaners": top_cleaners,
            "commercial_recommendation": recommendation,
            "scenarios": scenarios,
        }

    except Exception:
        logger.exception("quote_intelligence failed for entity_id=%s", entity_id)
        return defaults


# =====================================================================
# Helpers
# =====================================================================

def _build_pricing_scenarios(
    monthly_revenue: float,
    monthly_cost: float,
    hours_per_week: float,
    avg_rate: float,
) -> list[dict]:
    """
    Build three pricing scenarios: aggressive, balanced, protected.
    """
    scenarios = []
    weeks_per_month = 4.33

    for label, margin_target in [("aggressive", 0.15), ("balanced", 0.25), ("protected", 0.35)]:
        if margin_target >= 1:
            continue
        required_revenue = monthly_cost / (1 - margin_target) if margin_target < 1 else monthly_cost * 2
        hourly_charge = required_revenue / (hours_per_week * weeks_per_month) if hours_per_week > 0 else 0
        actual_margin = ((required_revenue - monthly_cost) / required_revenue * 100) if required_revenue > 0 else 0

        scenarios.append({
            "label": label,
            "target_margin_pct": round(margin_target * 100, 1),
            "monthly_revenue": round(required_revenue, 2),
            "hourly_charge": round(hourly_charge, 2),
            "margin_pct": round(actual_margin, 1),
            "monthly_profit": round(required_revenue - monthly_cost, 2),
        })

    return scenarios
