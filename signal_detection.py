"""
signal_detection.py — Rule-based buying signal detector (PostgreSQL-backed)
Detects signals from entity data and raw source record payloads.
Re-uses detect_rule_signals() from signal_rules.py.
"""

from __future__ import annotations

import json
from typing import Optional

import db_pg
from signal_rules import detect_rule_signals
import config


# Signal type → raw strength (0–100) used internally by the scorer
SIGNAL_STRENGTHS = {
    'move_signal':       80,
    'expansion_signal':  65,
    'refurb_signal':     55,
    'hiring_signal':     65,
    'compliance_signal': 45,
    'review_signal':     30,
    'multi_site_signal': 75,
    'public_procurement': 95,
    'regulated_healthcare_facility': 70,
    'charity_venue':     40,
    'companies_house_match': 60,
}

# Signal type → 1–5 "signal_strength" band (used in UI + scoring modifier)
SIGNAL_STRENGTH_BAND: dict[str, int] = {
    'public_procurement':            5,   # live tender — drop everything
    'move_signal':                   4,   # actively relocating
    'regulated_healthcare_facility': 4,   # CQC-registered — high spec required
    'multi_site_signal':             4,   # group contract premium
    'hiring_signal':                 3,   # FM hire = cleaning review coming
    'expansion_signal':              3,   # growing, spending more
    'compliance_signal':             3,   # compliance issue → contract at risk
    'refurb_signal':                 2,   # fit-out = window to get in
    'companies_house_match':         2,   # director/company verified
    'charity_venue':                 1,   # worth contacting, lower urgency
    'review_signal':                 1,   # negative review → credibility issue
}


def compute_signal_confidence(entity_data: dict, signal_type: str, detected_at=None) -> int:
    """
    Compute a 0–100 confidence score for a signal.
    Higher when: contact details available, signal detected recently.
    """
    score = 50  # base

    # Contact completeness
    if entity_data.get('primary_phone') or entity_data.get('has_phone'):
        score += 20
    if entity_data.get('primary_email') or entity_data.get('has_email'):
        score += 10
    if entity_data.get('primary_website') or entity_data.get('has_website'):
        score += 5

    # Recency bonus
    if detected_at:
        try:
            from datetime import datetime, timezone
            if hasattr(detected_at, 'tzinfo'):
                age_days = (datetime.now(timezone.utc) - detected_at).days
            else:
                age_days = 999
            if age_days <= 3:   score += 15
            elif age_days <= 7: score += 10
            elif age_days <= 14: score += 5
        except Exception:
            pass

    # High-certainty signal types
    if signal_type == 'public_procurement':
        score = min(100, score + 20)

    return min(100, max(0, score))


def detect_signals_for_entity(conn, entity_id: int) -> list[dict]:
    """
    Run signal detection for a single entity using its raw source payloads.
    Returns list of inserted signal dicts.
    """
    # Get raw payloads for this entity
    raw_rows = db_pg.fetchall(conn, """
        SELECT rsr.payload, rsr.source
        FROM raw_source_records rsr
        JOIN entity_source_links esl ON esl.source = rsr.source
             AND esl.source_record_id = rsr.source_record_id
        WHERE esl.entity_id = %s
    """, (entity_id,))

    detected = []
    for raw_row in raw_rows:
        payload = raw_row['payload'] if isinstance(raw_row['payload'], dict) else json.loads(raw_row['payload'])
        signals = detect_rule_signals(payload)

        for sig_key in config.BUYING_SIGNAL_WEIGHTS:
            if signals.get(sig_key):
                strength       = SIGNAL_STRENGTHS.get(sig_key, 50)
                strength_band  = SIGNAL_STRENGTH_BAND.get(sig_key, 2)
                source         = raw_row['source']
                evidence       = signals.get('trigger_summary', '')
                confidence     = compute_signal_confidence(payload, sig_key)
                try:
                    db_pg.insert_signal(conn, entity_id, sig_key, strength, evidence, source)
                    detected.append({
                        'signal_type':     sig_key,
                        'strength':        strength,
                        'signal_strength': strength_band,   # 1–5
                        'confidence':      confidence,       # 0–100
                    })
                except Exception:
                    pass  # signal_type enum mismatch — skip

    return detected


def detect_signals_batch(conn, entity_ids: list[int] = None, batch_size: int = 500) -> int:
    """
    Run signal detection across all (or specified) entities.
    Returns total signals inserted.
    """
    if entity_ids:
        total = len(entity_ids)
        ids_to_process = entity_ids
    else:
        total = db_pg.fetchval(conn, "SELECT COUNT(*) FROM entities WHERE active = TRUE")
        ids_to_process = None

    total_signals = 0

    for offset in range(0, total, batch_size):
        if ids_to_process:
            batch = ids_to_process[offset:offset + batch_size]
            rows = db_pg.fetchall(conn,
                "SELECT id FROM entities WHERE id = ANY(%s)",
                (batch,)
            )
        else:
            rows = db_pg.fetchall(conn,
                "SELECT id FROM entities WHERE active = TRUE ORDER BY id LIMIT %s OFFSET %s",
                (batch_size, offset)
            )

        for row in rows:
            sigs = detect_signals_for_entity(conn, row['id'])
            total_signals += len(sigs)

        conn.commit()
        print(f"\r  Signals detected: {total_signals:,} ({offset + len(rows):,}/{total:,} entities)", end='')

    print()
    return total_signals


def emit_signal(conn, entity_id: int, signal_type: str, strength: int = 50,
                evidence: str = None, source: str = None) -> None:
    """
    Emit a single signal for an entity. Used by connectors.
    """
    db_pg.insert_signal(conn, entity_id, signal_type, strength, evidence, source)
