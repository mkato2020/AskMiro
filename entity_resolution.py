"""
entity_resolution.py — Deterministic entity matching engine
Matches incoming records against existing entities using a confidence ladder:
  1. company_number  → 100% match
  2. phone (E.164)   →  95% match
  3. website domain  →  90% match
  4. name trigram + postcode (rapidfuzz token_sort ≥ 85, same postcode) → 88%
  5. name trigram + district (rapidfuzz token_sort ≥ 75, same postcode district) → 70%

Usage:
    result = resolve_entity(conn, candidate)
    if result:
        entity_id, confidence = result
        link_entity_source(conn, entity_id, source, record_id, confidence)
    else:
        entity_id = upsert_entity(conn, **candidate)
"""

from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from rapidfuzz import fuzz

import db_pg


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _extract_domain(website: str) -> Optional[str]:
    if not website:
        return None
    try:
        url = website if '://' in website else 'https://' + website
        return urlparse(url).netloc.lstrip('www.') or None
    except Exception:
        return None


def _postcode_district(postcode: str) -> Optional[str]:
    """Extract postcode area+district: 'SW1A 1AA' → 'SW1A'."""
    if not postcode:
        return None
    return postcode.strip().split()[0].upper() if postcode.strip() else None


def _name_similarity(a: str, b: str) -> float:
    """rapidfuzz token_sort_ratio, 0–100."""
    if not a or not b:
        return 0.0
    return fuzz.token_sort_ratio(a.lower(), b.lower())


# ------------------------------------------------------------------
# Core resolution function
# ------------------------------------------------------------------

def resolve_entity(
    conn,
    *,
    canonical_name: str,
    normalized_name: str,
    company_number: str = None,
    primary_phone: str = None,
    website_domain: str = None,
    postcode: str = None,
    entity_kind: str = 'unknown',
    sector: str = None,
) -> Optional[tuple[int, int]]:
    """
    Try to match against an existing entity.
    Returns (entity_id, confidence) or None if no match.
    """

    # 1. Company number — exact, deterministic
    if company_number:
        row = db_pg.fetchone(conn,
            "SELECT id FROM entities WHERE company_number = %s",
            (company_number,)
        )
        if row:
            return row['id'], 100

    # 2. Phone — normalised E.164 match
    if primary_phone and len(primary_phone) >= 10:
        row = db_pg.fetchone(conn,
            "SELECT id FROM entities WHERE primary_phone = %s AND active = TRUE LIMIT 1",
            (primary_phone,)
        )
        if row:
            return row['id'], 95

    # 3. Website domain match
    if website_domain:
        row = db_pg.fetchone(conn,
            "SELECT id FROM entities WHERE website_domain = %s AND active = TRUE LIMIT 1",
            (website_domain,)
        )
        if row:
            return row['id'], 90

    # 4 & 5. Name-based fuzzy match — fetch candidates by sector/kind first
    if not normalized_name:
        return None

    district = _postcode_district(postcode)

    # Fetch candidate entities in same sector (or all if sector unknown)
    if sector:
        candidates = db_pg.fetchall(conn, """
            SELECT e.id, e.normalized_name, a.postcode
            FROM entities e
            LEFT JOIN LATERAL (
                SELECT address_id FROM entity_locations
                WHERE entity_id = e.id AND is_primary = TRUE ORDER BY id LIMIT 1
            ) el ON TRUE
            LEFT JOIN addresses a ON a.id = el.address_id
            WHERE e.active = TRUE AND e.sector = %s
        """, (sector,))
    else:
        candidates = db_pg.fetchall(conn, """
            SELECT e.id, e.normalized_name, a.postcode
            FROM entities e
            LEFT JOIN LATERAL (
                SELECT address_id FROM entity_locations
                WHERE entity_id = e.id AND is_primary = TRUE ORDER BY id LIMIT 1
            ) el ON TRUE
            LEFT JOIN addresses a ON a.id = el.address_id
            WHERE e.active = TRUE
        """)

    best_id    = None
    best_score = 0.0
    best_conf  = 0

    for c in candidates:
        sim = _name_similarity(normalized_name, c['normalized_name'] or '')
        cand_district = _postcode_district(c.get('postcode') or '')

        if sim >= 85 and district and cand_district and district == cand_district:
            # Rule 4: strong name match + same postcode
            if sim > best_score:
                best_score = sim
                best_id    = c['id']
                best_conf  = 88
        elif sim >= 75 and district and cand_district and district == cand_district:
            # Rule 5: moderate name match + same district
            if sim > best_score and best_conf < 88:
                best_score = sim
                best_id    = c['id']
                best_conf  = 70

    if best_id:
        return best_id, best_conf

    return None


# ------------------------------------------------------------------
# Self-dedup: find and merge duplicate entities within the DB
# ------------------------------------------------------------------

def self_dedup_pass(conn, sector: str = None, dry_run: bool = False) -> int:
    """
    Find entities where normalized_name + postcode district are identical
    and merge the lower-id into the higher-id (keep lower id as canonical).
    Returns count of merges performed.
    """
    if sector:
        candidates = db_pg.fetchall(conn, """
            SELECT e.id, e.normalized_name, SPLIT_PART(COALESCE(a.postcode, ''), ' ', 1) AS district
            FROM entities e
            LEFT JOIN LATERAL (
                SELECT address_id FROM entity_locations
                WHERE entity_id = e.id AND is_primary = TRUE ORDER BY id LIMIT 1
            ) el ON TRUE
            LEFT JOIN addresses a ON a.id = el.address_id
            WHERE e.active = TRUE AND e.sector = %s
            ORDER BY e.id
        """, (sector,))
    else:
        candidates = db_pg.fetchall(conn, """
            SELECT e.id, e.normalized_name, SPLIT_PART(COALESCE(a.postcode, ''), ' ', 1) AS district
            FROM entities e
            LEFT JOIN LATERAL (
                SELECT address_id FROM entity_locations
                WHERE entity_id = e.id AND is_primary = TRUE ORDER BY id LIMIT 1
            ) el ON TRUE
            LEFT JOIN addresses a ON a.id = el.address_id
            WHERE e.active = TRUE
            ORDER BY e.id
        """)

    merges = 0
    seen: dict[tuple, int] = {}  # (normalized_name, district) → entity_id

    for row in candidates:
        key = (row['normalized_name'], row['district'] or '')
        if key in seen:
            canonical_id = seen[key]
            duplicate_id = row['id']
            if not dry_run:
                # Repoint source links and opportunities to canonical entity
                db_pg.execute(conn,
                    "UPDATE entity_source_links SET entity_id = %s WHERE entity_id = %s",
                    (canonical_id, duplicate_id)
                )
                db_pg.execute(conn,
                    "UPDATE opportunities SET entity_id = %s WHERE entity_id = %s",
                    (canonical_id, duplicate_id)
                )
                db_pg.execute(conn,
                    "UPDATE signals SET entity_id = %s WHERE entity_id = %s",
                    (canonical_id, duplicate_id)
                )
                # Archive duplicate
                db_pg.execute(conn,
                    "UPDATE entities SET active = FALSE, archived_at = NOW() WHERE id = %s",
                    (duplicate_id,)
                )
            merges += 1
        else:
            seen[key] = row['id']

    if not dry_run:
        conn.commit()

    return merges
