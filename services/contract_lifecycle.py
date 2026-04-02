"""
contract_lifecycle.py — Contract lifecycle management for AskMiro OS
Creates contracts from won opportunities, generates schedules, manages assignments.
"""
from __future__ import annotations
import json
import logging
from datetime import date, timedelta
from typing import Optional

import db_pg

logger = logging.getLogger(__name__)


def create_contract_from_opportunity(conn, opportunity_id: int, **kwargs) -> dict:
    """Create a contract when an opportunity is won."""
    try:
        # Look up opportunity
        opp = db_pg.fetchone(conn, """
            SELECT o.id, o.entity_id, o.title, o.current_stage,
                   e.canonical_name, e.sector, e.primary_phone, e.primary_email,
                   os.estimated_monthly_value_gbp, os.estimated_contract_value_gbp,
                   os.total_score
            FROM opportunities o
            JOIN entities e ON e.id = o.entity_id
            LEFT JOIN opportunity_scores os ON os.entity_id = o.entity_id
            WHERE o.id = %s
        """, (opportunity_id,))
        if not opp:
            return {"error": f"Opportunity {opportunity_id} not found"}

        # Try to get address/postcode
        addr = db_pg.fetchone(conn, """
            SELECT a.line1, a.borough, a.postcode
            FROM entity_locations el
            JOIN addresses a ON a.id = el.address_id
            WHERE el.entity_id = %s AND el.is_primary = TRUE
            LIMIT 1
        """, (opp['entity_id'],))

        # Try to get latest quote
        quote = db_pg.fetchone(conn, """
            SELECT monthly_value, hours_per_week, frequency, margin_pct
            FROM quotes WHERE entity_id = %s
            ORDER BY created_at DESC LIMIT 1
        """, (opp['entity_id'],))

        monthly = kwargs.get('monthly_value_gbp') or (quote and quote.get('monthly_value')) or opp.get('estimated_monthly_value_gbp') or 0
        hours = kwargs.get('hours_per_week') or (quote and quote.get('hours_per_week')) or 0
        freq = kwargs.get('cleaning_frequency') or (quote and quote.get('frequency')) or '5 days/week'
        margin = (quote and quote.get('margin_pct')) or 0
        start = kwargs.get('contract_start') or (date.today() + timedelta(days=14))
        end = kwargs.get('contract_end') or (start + timedelta(days=365)) if isinstance(start, date) else None

        row = db_pg.fetchone(conn, """
            INSERT INTO contracts (
                opportunity_id, entity_id, site_name, site_address, site_postcode,
                service_type, cleaning_frequency, hours_per_week,
                monthly_value_gbp, annual_value_gbp,
                contract_start, contract_end, renewal_date,
                status, staffing_status, launch_readiness, margin_pct, notes,
                created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                'active', 'unassigned', 'pending', %s, %s,
                NOW(), NOW()
            ) RETURNING *
        """, (
            opportunity_id, opp['entity_id'],
            opp.get('canonical_name', ''),
            addr['line1'] if addr else kwargs.get('site_address', ''),
            addr['postcode'] if addr else kwargs.get('site_postcode', ''),
            kwargs.get('service_type', 'Regular Cleaning'),
            freq, hours,
            monthly, monthly * 12 if monthly else 0,
            start, end,
            (end - timedelta(days=60)) if isinstance(end, date) else None,
            margin, kwargs.get('notes', ''),
        ))

        # Link back to opportunity
        if row:
            db_pg.execute(conn, "UPDATE opportunities SET contract_id = %s WHERE id = %s", (row['id'], opportunity_id))

        return dict(row) if row else {"error": "Insert failed"}
    except Exception as e:
        logger.exception("create_contract_from_opportunity failed")
        return {"error": str(e)}


def generate_schedules(conn, contract_id: int, days: list = None, start_time: str = '06:00', end_time: str = None) -> list:
    """Generate weekly schedule rows for a contract."""
    try:
        contract = db_pg.fetchone(conn, "SELECT * FROM contracts WHERE id = %s", (contract_id,))
        if not contract:
            return []

        if days is None:
            freq = (contract.get('cleaning_frequency') or '5 days/week').lower()
            if '7' in freq or 'daily' in freq:
                days = [0, 1, 2, 3, 4, 5, 6]
            elif '6' in freq:
                days = [0, 1, 2, 3, 4, 5]
            elif '3' in freq:
                days = [0, 2, 4]
            elif '2' in freq:
                days = [0, 3]
            elif '1' in freq:
                days = [0]
            else:
                days = [0, 1, 2, 3, 4]

        # Calculate end_time from hours if not provided
        if not end_time and contract.get('hours_per_week') and days:
            hours_per_day = float(contract['hours_per_week']) / len(days)
            start_h, start_m = map(int, start_time.split(':'))
            end_h = start_h + int(hours_per_day)
            end_m = start_m + int((hours_per_day % 1) * 60)
            if end_m >= 60:
                end_h += 1
                end_m -= 60
            end_time = f"{end_h:02d}:{end_m:02d}"

        # Clear existing
        db_pg.execute(conn, "DELETE FROM contract_schedules WHERE contract_id = %s", (contract_id,))

        results = []
        for day in days:
            row = db_pg.fetchone(conn, """
                INSERT INTO contract_schedules (contract_id, day_of_week, start_time, end_time, active)
                VALUES (%s, %s, %s, %s, TRUE) RETURNING *
            """, (contract_id, day, start_time, end_time))
            if row:
                results.append(dict(row))
        return results
    except Exception as e:
        logger.exception("generate_schedules failed")
        return []


def assign_cleaner(conn, contract_id: int, cleaner_id: int, role: str = 'primary') -> dict:
    """Assign a cleaner to a contract."""
    try:
        contract = db_pg.fetchone(conn, "SELECT * FROM contracts WHERE id = %s", (contract_id,))
        if not contract:
            return {"error": "Contract not found"}

        cleaner = db_pg.fetchone(conn, "SELECT * FROM ops_cleaners WHERE id = %s", (cleaner_id,))
        if not cleaner:
            return {"error": "Cleaner not found"}

        # Update assigned_cleaners JSONB
        assigned = json.loads(contract.get('assigned_cleaners') or '[]') if isinstance(contract.get('assigned_cleaners'), str) else (contract.get('assigned_cleaners') or [])
        # Remove existing entry for this role
        assigned = [a for a in assigned if a.get('role') != role]
        assigned.append({
            'cleaner_id': cleaner_id,
            'name': cleaner.get('name', ''),
            'role': role,
            'pay_rate': float(cleaner.get('pay_rate') or 0),
        })

        staffing = 'assigned' if any(a['role'] == 'primary' for a in assigned) else 'partial'

        db_pg.execute(conn, """
            UPDATE contracts SET assigned_cleaners = %s, staffing_status = %s, updated_at = NOW()
            WHERE id = %s
        """, (json.dumps(assigned), staffing, contract_id))

        # Update schedules
        db_pg.execute(conn, """
            UPDATE contract_schedules SET cleaner_id = %s
            WHERE contract_id = %s AND active = TRUE AND cleaner_id IS NULL
        """, (cleaner_id, contract_id))

        return db_pg.fetchone(conn, "SELECT * FROM contracts WHERE id = %s", (contract_id,)) or {}
    except Exception as e:
        logger.exception("assign_cleaner failed")
        return {"error": str(e)}


def check_launch_readiness(conn, contract_id: int) -> dict:
    """Check if a contract is ready to launch."""
    try:
        contract = db_pg.fetchone(conn, "SELECT * FROM contracts WHERE id = %s", (contract_id,))
        if not contract:
            return {"readiness_score": 0, "missing_items": ["Contract not found"], "launch_readiness": "not_found"}

        missing = []
        score = 0

        # Cleaner assigned? (30 pts)
        assigned = contract.get('assigned_cleaners') or []
        if isinstance(assigned, str):
            assigned = json.loads(assigned)
        has_primary = any(a.get('role') == 'primary' for a in assigned) if assigned else False
        if has_primary:
            score += 30
        else:
            missing.append("No primary cleaner assigned")

        # Schedule exists? (25 pts)
        sched_count = db_pg.fetchval(conn, "SELECT COUNT(*) FROM contract_schedules WHERE contract_id = %s AND active = TRUE", (contract_id,))
        if sched_count and sched_count > 0:
            score += 25
        else:
            missing.append("No schedule created")

        # Start date set? (20 pts)
        if contract.get('contract_start'):
            score += 20
        else:
            missing.append("No start date")

        # Margin calculated? (15 pts)
        if contract.get('margin_pct') and float(contract['margin_pct']) > 0:
            score += 15
        else:
            missing.append("Margin not calculated")

        # Value set? (10 pts)
        if contract.get('monthly_value_gbp') and float(contract['monthly_value_gbp']) > 0:
            score += 10
        else:
            missing.append("Monthly value not set")

        if score >= 90:
            readiness = 'ready'
        elif score >= 60:
            readiness = 'nearly_ready'
        elif score >= 30:
            readiness = 'in_progress'
        else:
            readiness = 'pending'

        db_pg.execute(conn, "UPDATE contracts SET launch_readiness = %s, updated_at = NOW() WHERE id = %s", (readiness, contract_id))

        return {"readiness_score": score, "missing_items": missing, "launch_readiness": readiness}
    except Exception as e:
        logger.exception("check_launch_readiness failed")
        return {"readiness_score": 0, "missing_items": [str(e)], "launch_readiness": "error"}


def flag_expiring_contracts(conn, days_ahead: int = 60) -> int:
    """Flag contracts expiring soon and create alerts."""
    try:
        rows = db_pg.fetchall(conn, """
            SELECT id, entity_id, site_name, contract_end, renewal_date, monthly_value_gbp
            FROM contracts
            WHERE status = 'active'
              AND (contract_end <= CURRENT_DATE + %s OR renewal_date <= CURRENT_DATE + %s)
        """, (days_ahead, days_ahead))

        count = 0
        for r in rows:
            db_pg.execute(conn, "UPDATE contracts SET status = 'expiring', updated_at = NOW() WHERE id = %s AND status = 'active'", (r['id'],))
            # Create alert
            db_pg.execute(conn, """
                INSERT INTO intelligence_alerts (alert_type, severity, entity_id, contract_id, title, detail, action_url, module)
                VALUES ('contract_expiring', 'warning', %s, %s, %s, %s, %s, 'contracts')
                ON CONFLICT DO NOTHING
            """, (
                r.get('entity_id'), r['id'],
                f"Contract expiring: {r.get('site_name', 'Unknown')}",
                f"Contract ends {r.get('contract_end')}. Monthly value: £{r.get('monthly_value_gbp', 0):,.0f}",
                f"/contracts?id={r['id']}",
            ))
            count += 1
        return count
    except Exception as e:
        logger.exception("flag_expiring_contracts failed")
        return 0


def contract_profitability(conn, contract_id: int) -> dict:
    """Calculate contract profitability."""
    try:
        contract = db_pg.fetchone(conn, "SELECT * FROM contracts WHERE id = %s", (contract_id,))
        if not contract:
            return {"error": "Contract not found"}

        monthly_rev = float(contract.get('monthly_value_gbp') or 0)
        quoted_margin = float(contract.get('margin_pct') or 0)
        hours = float(contract.get('hours_per_week') or 0)

        # Estimate costs from assigned cleaners
        assigned = contract.get('assigned_cleaners') or []
        if isinstance(assigned, str):
            assigned = json.loads(assigned)

        monthly_cost = 0
        if assigned and hours > 0:
            avg_rate = sum(float(a.get('pay_rate', 12.21)) for a in assigned) / len(assigned)
            weekly_cost = hours * avg_rate * 1.138  # NI + pension on-costs
            monthly_cost = weekly_cost * 4.33
        elif hours > 0:
            monthly_cost = hours * 12.21 * 1.138 * 4.33  # Default LLW rate

        actual_margin = ((monthly_rev - monthly_cost) / monthly_rev * 100) if monthly_rev > 0 else 0
        variance = actual_margin - quoted_margin

        if actual_margin >= 30:
            status = 'healthy'
        elif actual_margin >= 20:
            status = 'acceptable'
        elif actual_margin >= 10:
            status = 'watch'
        elif actual_margin >= 0:
            status = 'risk'
        else:
            status = 'loss'

        return {
            "contract_id": contract_id,
            "monthly_revenue": round(monthly_rev, 2),
            "monthly_cost": round(monthly_cost, 2),
            "monthly_profit": round(monthly_rev - monthly_cost, 2),
            "actual_margin_pct": round(actual_margin, 1),
            "quoted_margin_pct": round(quoted_margin, 1),
            "variance_pct": round(variance, 1),
            "status": status,
        }
    except Exception as e:
        logger.exception("contract_profitability failed")
        return {"error": str(e)}
