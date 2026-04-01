"""
scoring_pg.py — Multi-dimensional opportunity scorer (PostgreSQL-backed)
Rescores all entities or a filtered subset.
Run: python run_score_pg.py [--all] [--entity-id 123]
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

import db_pg
import config
from signal_detection import SIGNAL_STRENGTH_BAND


def freshness_score(date_val) -> int:
    """0–5 based on data recency."""
    if not date_val:
        return 1
    try:
        dt = datetime.fromisoformat(str(date_val))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        months_old = (datetime.now(timezone.utc) - dt).days / 30
        if months_old <= 6:  return 5
        if months_old <= 12: return 3
        return 1
    except Exception:
        return 1


def score_entity(entity: dict, scored_at=None) -> dict:
    """
    Compute multi-dimensional score for one entity row.
    entity must have: sector, entity_kind, signals (list of signal_type strings),
                      primary_phone, primary_website, primary_email,
                      review_count (optional), estimated_monthly_value_gbp (optional).
    Returns score dict suitable for db_pg.upsert_score().
    """
    sector   = entity.get('sector') or 'other'
    kind     = entity.get('entity_kind') or config.SECTOR_TO_KIND.get(sector, 'unknown')
    signals  = entity.get('signals') or []
    borough  = entity.get('borough') or ''
    review_count = int(entity.get('review_count') or 0)

    # --- fit_score (0–25): sector priority ---
    priority = config.SECTOR_PRIORITY.get(sector, 4)
    fit_sc = {1: 25, 2: 17, 3: 9, 4: 0}.get(priority, 0)

    # London priority bonus (+3)
    if borough in config.PRIORITY_BOROUGHS:
        fit_sc = min(25, fit_sc + 3)

    # --- facility_score (0–20) ---
    base_fac = 15 if kind in ('facility', 'property_manager') else 8
    fac_sc   = min(20, base_fac + min(5, int(math.log10(review_count + 1) * 4)))

    # --- buyer_signal_score (0–25) ---
    raw_signal = sum(
        config.BUYING_SIGNAL_WEIGHTS.get(s, 5)
        for s in signals
        if s in config.BUYING_SIGNAL_WEIGHTS
    )
    buyer_sc = min(25, int(min(config.BUYING_SIGNAL_CAP, raw_signal) * 0.625))

    # ── Signal-strength modifier (Patch 7) ───────────────────────────────────
    # Uses the 1–5 band for the strongest signal present.
    # Adds up to +5 pts to differentiate leads with identical base signals.
    # confidence is estimated as 75 when not directly available.
    top_band  = max((SIGNAL_STRENGTH_BAND.get(s, 1) for s in signals), default=0)
    strength_bonus   = top_band * 1          # 1–5 pts
    confidence_bonus = int(75 * 0.1)         # flat 7pts if signals present (avoids DB query)
    signal_modifier  = strength_bonus + (confidence_bonus if signals else 0)

    # --- contactability_score (0–15) ---
    contact_sc = 0
    if entity.get('primary_phone') or entity.get('phone'):  contact_sc += 5
    if entity.get('primary_website') or entity.get('website'): contact_sc += 5
    if entity.get('primary_email') or entity.get('email'): contact_sc += 3
    if entity.get('contact_name'):  contact_sc += 2

    # --- scale_score (0–10) ---
    multi_site = 'multi_site_signal' in signals
    scale_sc = min(8, int(math.log10(review_count + 1) * 3.5)) + (2 if multi_site else 0)
    scale_sc = min(10, scale_sc)

    # --- freshness_score (0–5) ---
    fresh_sc = freshness_score(entity.get('scored_at') or entity.get('fetched_at'))

    total = min(100, fit_sc + fac_sc + buyer_sc + contact_sc + scale_sc + fresh_sc + signal_modifier)
    monthly_val = config.SECTOR_CONTRACT_ESTIMATES.get(sector, 1000)

    return {
        'fit_score':               fit_sc,
        'facility_score':          fac_sc,
        'buyer_signal_score':      buyer_sc,
        'contactability_score':    contact_sc,
        'scale_score':             scale_sc,
        'freshness_score':         fresh_sc,
        'total_score':             total,
        'next_best_action':        _next_action(sector, signals, total),
        'estimated_contract_value_gbp':  monthly_val,
        'estimated_monthly_value_gbp':   monthly_val,
    }


def score_band(total: int) -> str:
    if total >= 80: return 'A'
    if total >= 65: return 'B'
    if total >= 50: return 'C'
    return 'D'


def _next_action(sector: str, signals: list, score: int) -> str:
    """Context-aware next-best-action message. Specific over generic."""
    # ── Highest-urgency signals first ────────────────────────────────────────
    if 'public_procurement' in signals:
        return 'Download tender pack + submit EOI within 48h — live gov contract'
    if 'move_signal' in signals:
        return 'Call immediately — they are relocating, cleaning contract up for grabs'
    if 'compliance_signal' in signals:
        return 'Call now — position as compliance solution, CQC/Ofsted risk is live'
    if 'hiring_signal' in signals:
        return 'Call FM decision-maker this week — hiring signals an active cleaning review'
    if 'expansion_signal' in signals:
        return 'Pitch multi-site group contract — expansion in progress, budget being set'
    if 'regulated_healthcare_facility' in signals:
        return 'Reach out to Practice Manager — regulated spec, high contract value'

    # ── Signal context ────────────────────────────────────────────────────────
    if 'refurb_signal' in signals:
        return 'Contact during fit-out phase — ideal time to get first clean agreed'
    if 'multi_site_signal' in signals:
        return 'Pitch group contract with supervisor-led quality across all sites'
    if 'review_signal' in signals:
        return 'Reach out — recent cleanliness complaints, position as step-change solution'
    if 'charity_venue' in signals:
        return 'Contact Operations Manager — charities respond well to social value pitch'

    # ── Sector defaults ───────────────────────────────────────────────────────
    if sector in ('property_management', 'residential_blocks'):
        return 'Book site inspection — quote block contract for communal areas'
    if sector in ('healthcare', 'education'):
        return 'Contact Practice/Business Manager — compliance-led pitch works best'
    if sector in ('offices', 'coworking', 'serviced_offices'):
        return 'Email Facilities Manager with day-porter case study'
    if sector in ('hospitality', 'gyms', 'gym_leisure'):
        return 'Call Operations Manager — high foot-traffic, hygiene is front-of-house'

    # ── Score-based fallback ──────────────────────────────────────────────────
    if score >= 80:
        return 'Priority outreach — top-tier target, act this week'
    if score >= 65:
        return 'Warm outreach — solid fit, add to sequence'
    return 'Keep in long-list — follow up when capacity allows'


def rescore_all(conn, batch_size: int = 500) -> int:
    """Rescore all active entities. Returns count rescored."""
    total_count = db_pg.fetchval(conn, "SELECT COUNT(*) FROM entities WHERE active = TRUE")
    rescored = 0

    for offset in range(0, total_count, batch_size):
        rows = db_pg.fetchall(conn, """
            SELECT
                e.id AS entity_id, e.entity_kind, e.sector,
                e.primary_phone, e.primary_website, e.primary_email,
                a.borough,
                os.scored_at,
                COALESCE(sig_agg.signal_types, '{}') AS signals
            FROM entities e
            LEFT JOIN LATERAL (
                SELECT address_id FROM entity_locations
                WHERE entity_id = e.id AND is_primary = TRUE ORDER BY id LIMIT 1
            ) el ON TRUE
            LEFT JOIN addresses a ON a.id = el.address_id
            LEFT JOIN opportunity_scores os ON os.entity_id = e.id
            LEFT JOIN (
                SELECT entity_id, ARRAY_AGG(DISTINCT signal_type::TEXT) AS signal_types
                FROM signals WHERE active = TRUE GROUP BY entity_id
            ) sig_agg ON sig_agg.entity_id = e.id
            WHERE e.active = TRUE
            ORDER BY e.id
            LIMIT %s OFFSET %s
        """, (batch_size, offset))

        for row in rows:
            scores = score_entity(dict(row))
            db_pg.upsert_score(conn, row['entity_id'], scores)
            rescored += 1

        conn.commit()
        print(f"\r  Rescored {rescored:,}/{total_count:,}", end='')

    print()
    return rescored


def rescore_entity(conn, entity_id: int) -> dict:
    """Rescore a single entity. Returns updated scores dict."""
    row = db_pg.fetchone(conn, """
        SELECT
            e.id AS entity_id, e.entity_kind, e.sector,
            e.primary_phone, e.primary_website, e.primary_email,
            a.borough,
            os.scored_at,
            COALESCE(sig_agg.signal_types, '{}') AS signals
        FROM entities e
        LEFT JOIN LATERAL (
            SELECT address_id FROM entity_locations
            WHERE entity_id = e.id AND is_primary = TRUE ORDER BY id LIMIT 1
        ) el ON TRUE
        LEFT JOIN addresses a ON a.id = el.address_id
        LEFT JOIN opportunity_scores os ON os.entity_id = e.id
        LEFT JOIN (
            SELECT entity_id, ARRAY_AGG(DISTINCT signal_type::TEXT) AS signal_types
            FROM signals WHERE active = TRUE GROUP BY entity_id
        ) sig_agg ON sig_agg.entity_id = e.id
        WHERE e.id = %s
    """, (entity_id,))

    if row is None:
        raise ValueError(f"Entity {entity_id} not found")

    scores = score_entity(dict(row))
    db_pg.upsert_score(conn, entity_id, scores)
    return scores
