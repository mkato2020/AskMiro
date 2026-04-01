"""
services/outreach_engine.py
─────────────────────────────
Sales execution engine: daily tasks, next-best-action, sequence management.
Cost: £0 — pure logic, no AI.

Responsibilities:
  1. Generate today's task list (called once per day, or on-demand)
  2. Determine next-best-action for any entity
  3. Start/advance outreach sequences
  4. Log activities + advance sequence steps
  5. Flag overdue leads
  6. Reactivate stale leads
"""
from __future__ import annotations
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db_pg
from datetime import date, datetime, timedelta, timezone
from typing import Optional

# ── Decision-maker role mapping by sector ────────────────────────────────────
# Shown as "ASK FOR" in the Today tab. Falls back to 'Facilities Manager'.
_DECISION_MAKER_BY_SECTOR: dict[str, str] = {
    'education':            'School Business Manager',
    'healthcare':           'Practice Manager',
    'offices':              'Facilities Manager',
    'office':               'Facilities Manager',
    'serviced_offices':     'Building Manager',
    'coworking':            'Operations Manager',
    'property_management':  'Property Manager',
    'residential_blocks':   'Estate Manager',
    'hospitality':          'General Manager',
    'gyms':                 'Club Manager',
    'gym_leisure':          'Club Manager',
    'industrial':           'Site Manager',
    'industrial_warehouse': 'Site Manager',
    'retail':               'Store Manager',
    'automotive':           'Dealership Manager',
    'charity':              'Operations Manager',
    'community_venues':     'Centre Manager',
    'religious_centres':    'Administrator',
    'public_sector':        'Procurement Officer',
    'other':                'Facilities Manager',
}

def _default_decision_maker(sector: str) -> str:
    """Return the most likely decision-maker title for a sector."""
    return _DECISION_MAKER_BY_SECTOR.get(
        (sector or 'other').lower().replace(' ', '_').replace('-', '_'),
        'Facilities Manager',
    )

# ── Task generation config ────────────────────────────────────────────────────
MAX_TASKS_PER_DAY     = 15    # don't overwhelm the salesperson
CALL_NOW_LIMIT        = 5     # max "call now" renewal tasks
NEW_SIGNAL_LIMIT      = 5     # max new signal tasks
FOLLOW_UP_LIMIT       = 5     # max follow-up tasks
REACTIVATION_LIMIT    = 3     # max reactivation tasks

# ── Priority weights by task type ────────────────────────────────────────────
_PRIORITY = {
    'public_procurement': 1,
    'move_signal':        2,
    'renewal_call_now':   2,
    'compliance_signal':  3,
    'regulated_healthcare_facility': 3,
    'new_development':    4,
    'review_signal':      4,
    'multi_site_signal':  4,
    'follow_up':          3,
    'reactivate':         6,
    'new_lead':           5,
    'default':            7,
}

# ── Sequence matching logic ───────────────────────────────────────────────────
def _best_sequence_id(conn, signal_type: str) -> Optional[int]:
    """Find the best sequence template for a given signal type."""
    row = db_pg.fetchone(conn, """
        SELECT id FROM outreach_sequences
        WHERE signal_type = %s AND is_active = TRUE
        LIMIT 1
    """, (signal_type,))
    if row:
        return row['id']
    # Fallback to generic
    row = db_pg.fetchone(conn, """
        SELECT id FROM outreach_sequences
        WHERE name = 'Cold Outreach — Generic' AND is_active = TRUE
        LIMIT 1
    """)
    return row['id'] if row else None


def start_sequence(conn, entity_id: int, signal_type: str) -> Optional[int]:
    """
    Start an outreach sequence for an entity if one isn't already active.
    Returns entity_sequence_id or None.
    """
    # Don't duplicate active sequences
    existing = db_pg.fetchone(conn, """
        SELECT id FROM entity_sequences
        WHERE entity_id = %s AND status = 'active'
        LIMIT 1
    """, (entity_id,))
    if existing:
        return existing['id']

    seq_id = _best_sequence_id(conn, signal_type)
    if not seq_id:
        return None

    # Find day_offset for step 1
    step1 = db_pg.fetchone(conn, """
        SELECT day_offset FROM outreach_steps
        WHERE sequence_id = %s AND step_number = 1
    """, (seq_id,))
    offset = step1['day_offset'] if step1 else 0

    next_due = datetime.now(timezone.utc) + timedelta(days=offset)

    seq_row_id = db_pg.fetchval(conn, """
        INSERT INTO entity_sequences (entity_id, sequence_id, current_step, status, next_action_due)
        VALUES (%s, %s, 1, 'active', %s)
        ON CONFLICT (entity_id, sequence_id) DO UPDATE
            SET status = 'active', next_action_due = EXCLUDED.next_action_due
        RETURNING id
    """, (entity_id, seq_id, next_due))

    conn.commit()
    return seq_row_id


def advance_sequence_step(conn, entity_sequence_id: int) -> Optional[dict]:
    """
    Advance to next step after completing current one.
    Returns the new step info, or None if sequence is complete.
    """
    seq = db_pg.fetchone(conn, """
        SELECT es.*, os.total_steps, os.id as seq_template_id
        FROM entity_sequences es
        JOIN outreach_sequences os ON os.id = es.sequence_id
        WHERE es.id = %s
    """, (entity_sequence_id,))
    if not seq:
        return None

    next_step = seq['current_step'] + 1
    if next_step > seq['total_steps']:
        # Sequence complete
        db_pg.execute(conn, """
            UPDATE entity_sequences SET status = 'completed' WHERE id = %s
        """, (entity_sequence_id,))
        conn.commit()
        return None

    # Get day offset for next step
    step = db_pg.fetchone(conn, """
        SELECT day_offset, channel, objective, action_template
        FROM outreach_steps
        WHERE sequence_id = %s AND step_number = %s
    """, (seq['seq_template_id'], next_step))

    if not step:
        return None

    next_due = datetime.now(timezone.utc) + timedelta(days=step['day_offset'])

    db_pg.execute(conn, """
        UPDATE entity_sequences SET current_step = %s, next_action_due = %s
        WHERE id = %s
    """, (next_step, next_due, entity_sequence_id))
    conn.commit()

    return {
        'step_number':    next_step,
        'channel':        step['channel'],
        'objective':      step['objective'],
        'action_template': step['action_template'],
        'due_at':         next_due.isoformat(),
    }


def log_activity(conn, entity_id: int, activity_type: str, outcome: str,
                 notes: str = '', entity_sequence_id: Optional[int] = None,
                 contacted_name: Optional[str] = None,
                 next_followup_days: Optional[int] = None) -> int:
    """Log an outreach activity. Returns activity_id."""
    next_followup = None
    if next_followup_days:
        next_followup = datetime.now(timezone.utc) + timedelta(days=next_followup_days)

    activity_id = db_pg.fetchval(conn, """
        INSERT INTO outreach_activities
            (entity_id, entity_sequence_id, activity_type, outcome, notes,
             contacted_name, next_followup_at, logged_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        RETURNING id
    """, (entity_id, entity_sequence_id, activity_type, outcome, notes,
          contacted_name, next_followup))

    # Also log to existing activity_log for pipeline integration
    db_pg.execute(conn, """
        INSERT INTO activity_log (entity_id, activity_type, actor, subject, body, occurred_at)
        VALUES (%s, %s::activity_type, 'user', %s, %s, NOW())
        ON CONFLICT DO NOTHING
    """, (entity_id, 'call' if activity_type == 'call' else 'note',
          f"{activity_type}: {outcome}", notes))

    # Touch the opportunity last_touched
    db_pg.execute(conn, """
        UPDATE opportunities SET last_touched_at = NOW(), updated_at = NOW()
        WHERE entity_id = %s
    """, (entity_id,))

    conn.commit()
    return activity_id


# ── Daily task generation ─────────────────────────────────────────────────────

def generate_daily_tasks(conn=None, task_date: Optional[date] = None) -> dict:
    """
    Generate the daily task list.
    Called once per day (or on-demand).
    Returns: {total, by_type}
    """
    own_conn = conn is None
    if own_conn:
        conn = db_pg.get_conn()

    today = task_date or date.today()

    try:
        # Clear previous pending tasks for today (regeneration)
        db_pg.execute(conn, """
            DELETE FROM daily_tasks WHERE task_date = %s AND status = 'pending'
        """, (today,))

        tasks_inserted = 0
        by_type: dict[str, int] = {}

        def _add_task(entity_id, task_type, priority, reason, entity_sequence_id=None):
            nonlocal tasks_inserted
            db_pg.execute(conn, """
                INSERT INTO daily_tasks
                    (task_date, entity_id, entity_sequence_id, task_type, priority, reason)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (today, entity_id, entity_sequence_id, task_type, priority, reason))
            tasks_inserted += 1
            by_type[task_type] = by_type.get(task_type, 0) + 1

        # ── Block 1: Gov contract / public procurement (highest priority) ────
        pp_leads = db_pg.fetchall(conn, """
            SELECT s.entity_id, MAX(s.strength) AS max_strength
            FROM signals s
            WHERE s.signal_type = 'public_procurement'
              AND s.active = TRUE
              AND NOT EXISTS (
                  SELECT 1 FROM outreach_activities oa
                  WHERE oa.entity_id = s.entity_id
                    AND oa.logged_at > NOW() - INTERVAL '7 days'
              )
            GROUP BY s.entity_id
            ORDER BY max_strength DESC
            LIMIT 5
        """)
        for r in pp_leads:
            _add_task(r['entity_id'], 'call', _PRIORITY['public_procurement'],
                      'Download tender pack + submit EOI within 48h — live gov contract')

        # ── Block 2: Sequence steps due today ────────────────────────────────
        due_steps = db_pg.fetchall(conn, """
            SELECT es.id, es.entity_id, os.name as seq_name,
                   st.channel, st.objective, st.step_number
            FROM entity_sequences es
            JOIN outreach_sequences os ON os.id = es.sequence_id
            JOIN outreach_steps st ON st.sequence_id = es.sequence_id
                AND st.step_number = es.current_step
            WHERE es.status = 'active'
              AND es.next_action_due::date <= %s
            ORDER BY es.next_action_due ASC
            LIMIT 8
        """, (today,))
        for r in due_steps:
            task_type = r['channel'] if r['channel'] in ('call', 'email', 'linkedin', 'visit') else 'follow_up'
            _add_task(r['entity_id'], task_type, _PRIORITY['follow_up'],
                      f"{r['seq_name']} step {r['step_number']}: {r['objective']}",
                      entity_sequence_id=r['id'])

        # ── Block 3: Renewal window — call now ───────────────────────────────
        renewal_now = db_pg.fetchall(conn, """
            SELECT rp.entity_id
            FROM renewal_predictions rp
            WHERE rp.call_now_flag = TRUE
              AND NOT EXISTS (
                  SELECT 1 FROM outreach_activities oa
                  WHERE oa.entity_id = rp.entity_id
                    AND oa.logged_at > NOW() - INTERVAL '14 days'
              )
            ORDER BY rp.days_until_renewal ASC
            LIMIT %s
        """, (CALL_NOW_LIMIT,))
        for r in renewal_now:
            _add_task(r['entity_id'], 'call', _PRIORITY['renewal_call_now'],
                      'Call before renewal window closes — current supplier contract expiring')

        # ── Block 4: New high-urgency signals (Act Today leads not yet contacted) ──
        new_signals = db_pg.fetchall(conn, """
            SELECT DISTINCT s.entity_id, s.signal_type, s.strength
            FROM signals s
            WHERE s.active = TRUE
              AND s.detected_at > NOW() - INTERVAL '7 days'
              AND s.signal_type IN ('move_signal','regulated_healthcare_facility','compliance_signal','new_development')
              AND NOT EXISTS (
                  SELECT 1 FROM outreach_activities oa WHERE oa.entity_id = s.entity_id
              )
              AND NOT EXISTS (
                  SELECT 1 FROM daily_tasks dt
                  WHERE dt.entity_id = s.entity_id AND dt.task_date = %s
              )
            ORDER BY s.strength DESC
            LIMIT %s
        """, (today, NEW_SIGNAL_LIMIT))
        _SIGNAL_REASONS: dict[str, str] = {
            'move_signal':                   'Call immediately — actively relocating, cleaning contract up for grabs',
            'compliance_signal':             'Call now — position as compliance solution, risk is live',
            'regulated_healthcare_facility': 'Reach out to Practice Manager — regulated spec, high-value contract',
            'new_development':               'Contact developer during fit-out phase — ideal window to get agreed',
        }
        for r in new_signals:
            reason = _SIGNAL_REASONS.get(
                r['signal_type'],
                f"New {r['signal_type'].replace('_', ' ')} signal — first contact"
            )
            _add_task(r['entity_id'], 'call', _PRIORITY.get(r['signal_type'], 5), reason)

        # ── Block 5: Follow-ups from pipeline (overdue or due today) ─────────
        followups = db_pg.fetchall(conn, """
            SELECT o.entity_id, o.current_stage
            FROM opportunities o
            WHERE o.current_stage IN ('contacted','replied')
              AND (o.next_followup_at IS NULL OR o.next_followup_at::date <= %s)
              AND o.last_touched_at < NOW() - INTERVAL '3 days'
              AND NOT EXISTS (
                  SELECT 1 FROM daily_tasks dt
                  WHERE dt.entity_id = o.entity_id AND dt.task_date = %s
              )
            ORDER BY o.next_followup_at ASC NULLS LAST
            LIMIT %s
        """, (today, today, FOLLOW_UP_LIMIT))
        for r in followups:
            stage = r['current_stage'].replace('_', ' ').title()
            _add_task(r['entity_id'], 'follow_up', _PRIORITY['follow_up'],
                      f"Pipeline follow-up — currently at: {stage}")

        # ── Block 6: Stale lead reactivation ─────────────────────────────────
        stale = db_pg.fetchall(conn, """
            SELECT o.entity_id
            FROM opportunities o
            WHERE o.current_stage = 'dormant'
              AND o.last_touched_at < NOW() - INTERVAL '30 days'
              AND NOT EXISTS (
                  SELECT 1 FROM daily_tasks dt
                  WHERE dt.entity_id = o.entity_id AND dt.task_date = %s
              )
            ORDER BY (
                SELECT total_score FROM opportunity_scores os WHERE os.entity_id = o.entity_id
            ) DESC NULLS LAST
            LIMIT %s
        """, (today, REACTIVATION_LIMIT))
        for r in stale:
            _add_task(r['entity_id'], 'reactivate', _PRIORITY['reactivate'],
                      'Dormant lead — re-engage after 30+ days of silence')

        # ── Block 7: Cold-call fallback — top-scored leads never yet contacted ──
        # Always runs; ensures Today always has calls even with no sequences or signals.
        COLD_CALL_TARGET = max(0, 20 - tasks_inserted)
        if COLD_CALL_TARGET > 0:
            cold = db_pg.fetchall(conn, """
                SELECT lr.id AS entity_id, lr.priority_score
                FROM lead_records lr
                WHERE lr.archived_at IS NULL
                  AND lr.priority_score >= 60
                  AND NOT EXISTS (
                      SELECT 1 FROM outreach_activities oa WHERE oa.entity_id = lr.id
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM daily_tasks dt
                      WHERE dt.entity_id = lr.id AND dt.task_date = %s
                  )
                ORDER BY lr.priority_score DESC, lr.high_value_target DESC
                LIMIT %s
            """, (today, COLD_CALL_TARGET))
            for r in cold:
                _add_task(r['entity_id'], 'call', 8,
                          'High-score lead — first cold call, no previous outreach on record')

        conn.commit()
        return {'total': tasks_inserted, 'by_type': by_type, 'date': str(today)}

    finally:
        if own_conn:
            conn.close()


def get_daily_tasks(conn, task_date: Optional[date] = None) -> list[dict]:
    """
    Return today's task list, enriched with entity details.
    Auto-generates if none exist for today.
    """
    today = task_date or date.today()

    # Check if we have tasks for today
    count = db_pg.fetchval(conn, """
        SELECT COUNT(*) FROM daily_tasks WHERE task_date = %s AND status = 'pending'
    """, (today,))

    if count == 0:
        generate_daily_tasks(conn, today)

    rows = db_pg.fetchall(conn, """
        SELECT
            dt.id,
            dt.task_type,
            dt.priority,
            dt.reason,
            dt.status,
            dt.entity_sequence_id,
            e.id as entity_id,
            e.canonical_name,
            e.sector,
            e.primary_phone,
            a.borough,
            os.total_score,
            os.score_band,
            os.estimated_monthly_value_gbp,
            gs.opener,
            gs.reason_for_call,
            rp.estimated_renewal,
            rp.call_now_flag,
            c.full_name as contact_name,
            c.job_title as contact_role
        FROM daily_tasks dt
        JOIN entities e ON e.id = dt.entity_id
        LEFT JOIN LATERAL (
            SELECT addr.borough FROM entity_locations el
            JOIN addresses addr ON addr.id = el.address_id
            WHERE el.entity_id = e.id AND el.is_primary = TRUE LIMIT 1
        ) a ON TRUE
        LEFT JOIN opportunity_scores os ON os.entity_id = e.id
        LEFT JOIN generated_scripts gs ON gs.entity_id = e.id AND gs.is_stale = FALSE
        LEFT JOIN renewal_predictions rp ON rp.entity_id = e.id
        LEFT JOIN contacts c ON c.entity_id = e.id AND c.is_primary = TRUE
        WHERE dt.task_date = %s AND dt.status IN ('pending','snoozed')
        ORDER BY dt.priority ASC, dt.id ASC
    """, (today,))

    result = []
    for r in rows:
        row = dict(r)
        # ── Patch 4: fill "ASK FOR" role from sector when no contact on file ─
        if not row.get('contact_role'):
            row['contact_role'] = _default_decision_maker(row.get('sector', ''))
        result.append(row)
    return result


def complete_task(conn, task_id: int, outcome: str = 'done', notes: str = '') -> bool:
    """Mark a daily task as complete."""
    db_pg.execute(conn, """
        UPDATE daily_tasks
        SET status = 'done', completed_at = NOW()
        WHERE id = %s
    """, (task_id,))
    conn.commit()
    return True


def get_next_best_action(conn, entity_id: int) -> dict:
    """
    Return the recommended next action for a specific entity.
    Used in lead detail panel.
    """
    # Check active sequence
    seq = db_pg.fetchone(conn, """
        SELECT es.id, es.current_step, es.next_action_due,
               os.name as seq_name,
               st.channel, st.objective, st.action_template
        FROM entity_sequences es
        JOIN outreach_sequences os ON os.id = es.sequence_id
        JOIN outreach_steps st ON st.sequence_id = es.sequence_id
            AND st.step_number = es.current_step
        WHERE es.entity_id = %s AND es.status = 'active'
        LIMIT 1
    """, (entity_id,))

    if seq:
        return {
            'action_type':   seq['channel'],
            'objective':     seq['objective'],
            'suggestion':    seq['action_template'],
            'source':        'sequence',
            'sequence_name': seq['seq_name'],
            'step':          seq['current_step'],
            'due_at':        seq['next_action_due'].isoformat() if seq['next_action_due'] else None,
        }

    # Check renewal window
    renewal = db_pg.fetchone(conn, """
        SELECT estimated_renewal, call_now_flag, rationale
        FROM renewal_predictions WHERE entity_id = %s
    """, (entity_id,))
    if renewal and renewal['call_now_flag']:
        return {
            'action_type': 'call',
            'objective':   'Contract renewal approaching — call before they re-sign',
            'suggestion':  renewal['rationale'],
            'source':      'renewal',
            'due_at':      None,
        }

    # Check strongest signal
    signal = db_pg.fetchone(conn, """
        SELECT signal_type, strength, evidence
        FROM signals WHERE entity_id = %s AND active = TRUE
        ORDER BY strength DESC LIMIT 1
    """, (entity_id,))
    if signal:
        from api import _SIGNAL_ACTIONS
        action_text = _SIGNAL_ACTIONS.get(signal['signal_type'], 'Review and assess')
        return {
            'action_type': 'call',
            'objective':   action_text,
            'suggestion':  signal['evidence'] or '',
            'source':      'signal',
            'due_at':      None,
        }

    return {
        'action_type': 'note',
        'objective':   'No active signals — add to long-list',
        'suggestion':  'Low priority. Re-check in 30 days.',
        'source':      'default',
        'due_at':      None,
    }


if __name__ == '__main__':
    import db_pg
    conn = db_pg.get_conn()
    result = generate_daily_tasks(conn)
    print(f"Tasks generated: {result['total']}")
    print(f"By type: {result['by_type']}")
    conn.close()
