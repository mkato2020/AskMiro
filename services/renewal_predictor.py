"""
services/renewal_predictor.py
───────────────────────────────
Heuristic-based contract renewal window estimator.
Cost: £0 — pure rules, no AI.

Philosophy: Be honest about uncertainty. Use confidence bands.
Never invent precision we don't have.

Inputs (in priority):
  1. CQC registration date → care/medical sector cycle
  2. Company incorporation date → proxy for when they first needed cleaning
  3. Planning application decision date → building occupancy window
  4. Google Maps data collection date → proxy for when business started
  5. Sector-based contract cycle assumptions
"""
from __future__ import annotations
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db_pg
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta

# ── Sector-based cleaning contract renewal cycles ────────────────────────────
# Based on industry norms: most commercial cleaning contracts are 1–3 years
_SECTOR_CYCLE_YEARS: dict[str, tuple[float, str]] = {
    # (cycle_years, confidence)
    'healthcare':        (2.0, 'medium'),    # CQC-regulated; often 2-yr contracts
    'education':         (2.5, 'medium'),    # schools: 3-yr cycles, procurement-heavy
    'hospitality':       (1.5, 'low'),       # restaurants/hotels: shorter cycles
    'offices':           (2.0, 'low'),       # typical office: 2-yr contract
    'office':            (2.0, 'low'),
    'gyms':              (2.0, 'low'),
    'gym_leisure':       (2.0, 'low'),
    'industrial':        (3.0, 'low'),       # industrial: longer contracts
    'retail':            (1.5, 'low'),
    'public_sector':     (3.0, 'medium'),    # public: 3–5yr framework
    'charity':           (2.0, 'low'),
    'other':             (2.0, 'speculative'),
}

_CONFIDENCE_RANK = {'high': 0, 'medium': 1, 'low': 2, 'speculative': 3}

def _better_confidence(a: str, b: str) -> str:
    return a if _CONFIDENCE_RANK.get(a, 9) <= _CONFIDENCE_RANK.get(b, 9) else b


def _call_now_flag(est_renewal: date | None, confidence: str) -> bool:
    """Flag as 'call now' if renewal is within 90 days and confidence is not speculative."""
    if not est_renewal or confidence == 'speculative':
        return False
    days = (est_renewal - date.today()).days
    return 0 <= days <= 90


def predict_for_entity(conn, entity_id: int) -> dict | None:
    """
    Generate a renewal prediction for one entity.
    Returns dict ready to insert into renewal_predictions.
    """
    entity = db_pg.fetchone(conn, """
        SELECT e.id, e.sector, e.cqc_location_id, e.company_number, e.created_at
        FROM entities e WHERE e.id = %s
    """, (entity_id,))
    if not entity:
        return None

    sector = (entity['sector'] or 'other').lower().replace(' ', '_')
    cycle_yrs, base_conf = _SECTOR_CYCLE_YEARS.get(sector, (2.0, 'speculative'))

    candidates: list[tuple[date, str, str, str]] = []
    # Each candidate: (anchor_date, evidence_source, confidence, rationale_fragment)

    # ── Source 1: CQC registration date ──────────────────────────────────────
    if entity['cqc_location_id']:
        cqc = db_pg.fetchone(conn, """
            SELECT rsr.payload
            FROM raw_source_records rsr
            WHERE rsr.source = 'cqc' AND rsr.source_record_id = %s
            LIMIT 1
        """, (entity['cqc_location_id'],))
        if cqc and cqc['payload']:
            import json
            try:
                payload = cqc['payload'] if isinstance(cqc['payload'], dict) else json.loads(cqc['payload'])
                reg_date_str = (
                    payload.get('registrationDate')
                    or payload.get('registration_date')
                    or payload.get('registeredOn')
                )
                if reg_date_str:
                    reg_date = date.fromisoformat(str(reg_date_str)[:10])
                    candidates.append((
                        reg_date, 'cqc_registration', 'medium',
                        f"CQC registered {reg_date} — 2yr healthcare contract cycle assumed"
                    ))
            except Exception:
                pass

    # ── Source 2: Companies House incorporation date ──────────────────────────
    if entity['company_number']:
        ch = db_pg.fetchone(conn, """
            SELECT date_of_creation FROM companies_house_profiles WHERE entity_id = %s
        """, (entity_id,))
        if ch and ch['date_of_creation']:
            inc = ch['date_of_creation']
            if isinstance(inc, str):
                try: inc = date.fromisoformat(inc[:10])
                except: inc = None
            if inc:
                candidates.append((
                    inc, 'company_age', 'low',
                    f"Incorporated {inc} — estimated contract start ~6mo after founding"
                ))

    # ── Source 3: Planning application decision date ──────────────────────────
    planning_sig = db_pg.fetchone(conn, """
        SELECT s.detected_at, s.evidence
        FROM signals s
        WHERE s.entity_id = %s AND s.signal_type = 'new_development' AND s.active = TRUE
        ORDER BY s.detected_at DESC LIMIT 1
    """, (entity_id,))
    if planning_sig:
        import re
        m = re.search(r'decided (\d{4}-\d{2}-\d{2})', planning_sig['evidence'] or '')
        if m:
            try:
                decided = date.fromisoformat(m.group(1))
                # Occupancy typically 6–12 months after decision
                occupancy_est = decided + relativedelta(months=9)
                candidates.append((
                    occupancy_est, 'planning_date', 'medium',
                    f"Planning approved {decided} — occupancy ~9mo later, first contract due for renewal ~{occupancy_est + timedelta(days=365*int(cycle_yrs))}"
                ))
            except Exception:
                pass

    # ── Source 4: Entity creation in our DB (proxy for first data seen) ──────
    if entity['created_at']:
        created = entity['created_at']
        if isinstance(created, datetime):
            created = created.date()
        candidates.append((
            created, 'data_collection', 'speculative',
            f"First seen in AskMiro — sector cycle {cycle_yrs}yr assumed"
        ))

    # ── Pick best candidate ────────────────────────────────────────────────────
    if not candidates:
        return None

    # Sort by confidence then recency
    candidates.sort(key=lambda x: (_CONFIDENCE_RANK.get(x[2], 9), -(x[0] - date(2000, 1, 1)).days))
    anchor_date, evidence_src, confidence, rationale = candidates[0]

    # ── Estimated renewal = anchor + N × cycle ────────────────────────────────
    # We want the NEXT renewal after today
    today     = date.today()
    est_date  = anchor_date + relativedelta(years=int(cycle_yrs))

    # Advance forward through cycles until we find the next upcoming one
    while est_date < today - timedelta(days=90):
        est_date = est_date + relativedelta(years=int(cycle_yrs))

    days_until = (est_date - today).days
    call_now   = _call_now_flag(est_date, confidence)

    return {
        'entity_id':          entity_id,
        'estimated_renewal':  est_date,
        'confidence':         confidence,
        'rationale':          rationale,
        'evidence_source':    evidence_src,
        'days_until_renewal': days_until,
        'call_now_flag':      call_now,
    }


def run_renewal_predictions(conn=None, limit: int = 10000) -> dict:
    """
    Generate renewal predictions for all entities without one.
    Returns: {processed, predicted, skipped}
    """
    own_conn = conn is None
    if own_conn:
        conn = db_pg.get_conn()

    try:
        rows = db_pg.fetchall(conn, """
            SELECT e.id FROM entities e
            WHERE e.active = TRUE
              AND NOT EXISTS (SELECT 1 FROM renewal_predictions rp WHERE rp.entity_id = e.id)
            ORDER BY (SELECT total_score FROM opportunity_scores os WHERE os.entity_id = e.id) DESC NULLS LAST
            LIMIT %s
        """, (limit,))

        processed = predicted = skipped = 0
        for r in rows:
            processed += 1
            pred = predict_for_entity(conn, r['id'])
            if pred:
                db_pg.execute(conn, """
                    INSERT INTO renewal_predictions
                        (entity_id, estimated_renewal, confidence, rationale,
                         evidence_source, days_until_renewal, call_now_flag, predicted_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (entity_id) DO UPDATE SET
                        estimated_renewal  = EXCLUDED.estimated_renewal,
                        confidence         = EXCLUDED.confidence,
                        rationale          = EXCLUDED.rationale,
                        days_until_renewal = EXCLUDED.days_until_renewal,
                        call_now_flag      = EXCLUDED.call_now_flag,
                        predicted_at       = NOW()
                """, (
                    pred['entity_id'], pred['estimated_renewal'],
                    pred['confidence'], pred['rationale'],
                    pred['evidence_source'], pred['days_until_renewal'],
                    pred['call_now_flag'],
                ))
                predicted += 1
            else:
                skipped += 1

            if processed % 1000 == 0:
                conn.commit()

        conn.commit()
        return {'processed': processed, 'predicted': predicted, 'skipped': skipped}
    finally:
        if own_conn:
            conn.close()


if __name__ == '__main__':
    print("Running renewal predictions...")
    stats = run_renewal_predictions()
    print(f"Processed: {stats['processed']}")
    print(f"Predicted: {stats['predicted']}")
    print(f"Skipped:   {stats['skipped']}")
