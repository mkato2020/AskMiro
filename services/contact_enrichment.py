"""
services/contact_enrichment.py
────────────────────────────────
Enriches the contacts table from data already in the database.
Cost: £0 — no external calls, only processes existing raw_source_records.

Sources (in priority order):
  1. companies_house_profiles.raw_payload → director names
  2. CQC raw_source_records → registered_manager field
  3. Signal evidence text → role hints (heuristic)
  4. Sector-based role inference (last resort)
"""
from __future__ import annotations
import json
import re
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db_pg
from datetime import datetime, timezone

# ── Role category mapping ─────────────────────────────────────────────────────
_TITLE_TO_CATEGORY = {
    # Facilities
    'facilities manager':      'facilities_manager',
    'facility manager':        'facilities_manager',
    'facilities director':     'facilities_manager',
    'head of facilities':      'facilities_manager',
    'estates manager':         'facilities_manager',
    'building manager':        'facilities_manager',
    'property manager':        'facilities_manager',
    # Operations
    'operations manager':      'operations',
    'operations director':     'operations',
    'general manager':         'operations',
    'site manager':            'operations',
    'office manager':          'operations',
    'practice manager':        'practice_manager',
    'business manager':        'operations',
    # Healthcare
    'registered manager':      'registered_manager',
    'care manager':            'registered_manager',
    'home manager':            'registered_manager',
    'clinical manager':        'registered_manager',
    'unit manager':            'registered_manager',
    'service manager':         'registered_manager',
    # Directors
    'director':                'director',
    'managing director':       'director',
    'chief executive':         'director',
    'ceo':                     'director',
    'owner':                   'director',
    'proprietor':              'director',
    'partner':                 'director',
    'company secretary':       'director',
    # Finance / procurement
    'finance manager':         'finance',
    'finance director':        'finance',
    'procurement manager':     'procurement',
    'contracts manager':       'procurement',
}

_ROLE_PRIORITY = {
    'facilities_manager':  1,   # most likely decision-maker for cleaning
    'practice_manager':    1,
    'registered_manager':  1,
    'operations':          2,
    'procurement':         2,
    'director':            3,
    'finance':             4,
    'unknown':             9,
}

_SECTOR_PREFERRED_ROLE = {
    'healthcare':   'registered_manager',
    'education':    'facilities_manager',
    'hospitality':  'operations',
    'offices':      'facilities_manager',
    'office':       'facilities_manager',
    'industrial':   'operations',
    'retail':       'operations',
    'gyms':         'operations',
}


def _classify_role(title: str) -> str:
    """Map a job title string to a role_category."""
    if not title:
        return 'unknown'
    t = title.lower().strip()
    for key, cat in _TITLE_TO_CATEGORY.items():
        if key in t:
            return cat
    return 'unknown'


def _is_decision_maker(role_category: str, sector: str) -> bool:
    """Is this contact likely to make or influence the cleaning contract decision?"""
    primary_roles = {'facilities_manager', 'registered_manager', 'practice_manager', 'operations', 'procurement'}
    return role_category in primary_roles


def _preferred_contact(contacts: list[dict], sector: str) -> dict | None:
    """Pick the best contact for initial outreach from a list."""
    if not contacts:
        return None
    preferred_cat = _SECTOR_PREFERRED_ROLE.get((sector or '').lower(), 'facilities_manager')
    # Sort by: preferred category first, then role priority, then most recent
    def sort_key(c):
        cat = c.get('role_category', 'unknown')
        pref = 0 if cat == preferred_cat else 1
        pri  = _ROLE_PRIORITY.get(cat, 9)
        return (pref, pri)
    return sorted(contacts, key=sort_key)[0]


# ── CH director extraction ────────────────────────────────────────────────────

def _extract_ch_directors(raw_payload: dict) -> list[dict]:
    """Extract directors from Companies House raw payload."""
    contacts = []
    officers = raw_payload.get('officers', [])
    if not officers and isinstance(raw_payload.get('items'), list):
        officers = raw_payload['items']

    for o in officers:
        role = o.get('officer_role', '').lower()
        resigned = o.get('resigned_on') or o.get('date_of_cessation')
        if resigned:
            continue  # skip resigned officers
        name = (o.get('name') or '').strip()
        if not name:
            continue
        # CH names are LAST, FIRST — normalise
        if ',' in name:
            parts = name.split(',', 1)
            name  = f"{parts[1].strip().title()} {parts[0].strip().title()}"
        else:
            name = name.title()

        job_title = o.get('occupation') or role.replace('_', ' ').title()
        cat       = _classify_role(role) if _classify_role(role) != 'unknown' else _classify_role(job_title)

        contacts.append({
            'full_name':      name,
            'job_title':      job_title or role,
            'role_category':  cat,
            'source':         'companies_house',
            'confidence':     0.7,
        })
    return contacts


def _extract_cqc_registered_manager(cqc_payload: dict) -> dict | None:
    """Extract registered manager from CQC raw payload."""
    mgr_name = (
        cqc_payload.get('registeredManager')
        or cqc_payload.get('registered_manager')
        or cqc_payload.get('managedBy')
    )
    if not mgr_name or not isinstance(mgr_name, str):
        # Try nested structure
        mgr = cqc_payload.get('contacts', {})
        if isinstance(mgr, list):
            for c in mgr:
                if 'manager' in (c.get('role') or '').lower():
                    mgr_name = c.get('name', '')
                    break
    if mgr_name and isinstance(mgr_name, str) and len(mgr_name) > 2:
        return {
            'full_name':     mgr_name.strip().title(),
            'job_title':     'Registered Manager',
            'role_category': 'registered_manager',
            'source':        'cqc',
            'confidence':    0.85,
        }
    return None


# ── Sector-based role guess ───────────────────────────────────────────────────

def _sector_role_guess(sector: str) -> dict:
    """Last resort: infer the likely role title for a sector."""
    role_map = {
        'healthcare':  ('Registered Manager / Care Home Manager', 'registered_manager'),
        'education':   ('Facilities / Site Manager', 'facilities_manager'),
        'hospitality': ('General Manager / Operations Manager', 'operations'),
        'offices':     ('Facilities Manager / Office Manager', 'facilities_manager'),
        'office':      ('Facilities Manager / Office Manager', 'facilities_manager'),
        'gyms':        ('Club Manager / Operations Manager', 'operations'),
        'industrial':  ('Site Manager / Operations Manager', 'operations'),
        'retail':      ('Store Manager / Operations Manager', 'operations'),
    }
    title, cat = role_map.get((sector or '').lower(), ('Facilities Manager', 'facilities_manager'))
    return {
        'full_name':     None,          # we don't know the name
        'job_title':     title,
        'role_category': cat,
        'source':        'inferred',
        'confidence':    0.3,
    }


# ── Main enrichment runner ────────────────────────────────────────────────────

def enrich_entity_contacts(conn, entity_id: int) -> list[dict]:
    """
    Enrich contacts for a single entity from existing DB data.
    Returns list of contacts upserted/created.
    """
    entity = db_pg.fetchone(conn, """
        SELECT e.id, e.sector, e.cqc_location_id, e.company_number, e.canonical_name
        FROM entities e WHERE e.id = %s
    """, (entity_id,))
    if not entity:
        return []

    sector     = entity['sector'] or 'other'
    candidates: list[dict] = []

    # ── Source 1: Companies House directors ──────────────────────────────────
    ch_profile = db_pg.fetchone(conn, """
        SELECT raw_payload FROM companies_house_profiles WHERE entity_id = %s
    """, (entity_id,))
    if ch_profile and ch_profile['raw_payload']:
        payload = ch_profile['raw_payload']
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                payload = {}
        candidates.extend(_extract_ch_directors(payload))

    # Also check raw_source_records for CH data
    if not candidates:
        ch_raw = db_pg.fetchone(conn, """
            SELECT rsr.payload FROM raw_source_records rsr
            JOIN entity_source_links esl ON esl.source_record_id = rsr.source_record_id
                AND rsr.source = 'companies_house'
            WHERE esl.entity_id = %s LIMIT 1
        """, (entity_id,))
        if ch_raw and ch_raw['payload']:
            payload = ch_raw['payload']
            if isinstance(payload, str):
                try: payload = json.loads(payload)
                except: payload = {}
            candidates.extend(_extract_ch_directors(payload))

    # ── Source 2: CQC registered manager ────────────────────────────────────
    if entity['cqc_location_id']:
        cqc_raw = db_pg.fetchone(conn, """
            SELECT rsr.payload FROM raw_source_records rsr
            WHERE rsr.source = 'cqc'
              AND rsr.source_record_id = %s
            LIMIT 1
        """, (entity['cqc_location_id'],))
        if cqc_raw and cqc_raw['payload']:
            payload = cqc_raw['payload']
            if isinstance(payload, str):
                try: payload = json.loads(payload)
                except: payload = {}
            mgr = _extract_cqc_registered_manager(payload)
            if mgr:
                candidates.insert(0, mgr)   # CQC manager is highest priority

    # ── Source 3: Sector-based fallback (only if no real contacts found) ─────
    if not candidates:
        candidates.append(_sector_role_guess(sector))

    # ── Upsert contacts into DB ──────────────────────────────────────────────
    upserted = []
    for c in candidates:
        # Skip unnamed inferred roles if we already have real contacts
        if c['source'] == 'inferred' and any(x['full_name'] for x in candidates if x != c):
            continue

        is_dm   = _is_decision_maker(c['role_category'], sector)
        now     = datetime.now(timezone.utc)

        db_pg.execute(conn, """
            INSERT INTO contacts (entity_id, full_name, job_title, role_category,
                                  source, confidence, is_primary, is_decision_maker, enriched_at)
            VALUES (%s, %s, %s, %s, %s, %s, FALSE, %s, %s)
            ON CONFLICT DO NOTHING
        """, (
            entity_id,
            c.get('full_name'),
            c.get('job_title'),
            c['role_category'],
            c['source'],
            c['confidence'],
            is_dm,
            now,
        ))
        upserted.append(c)

    # Mark the best contact as primary
    best = _preferred_contact(upserted, sector)
    if best and best.get('full_name'):
        db_pg.execute(conn, """
            UPDATE contacts SET is_primary = TRUE
            WHERE entity_id = %s AND full_name = %s AND is_primary = FALSE
        """, (entity_id, best['full_name']))

    return upserted


def run_contact_enrichment(conn=None, limit: int = 5000) -> dict:
    """
    Batch enrich contacts for entities that have none yet.
    Returns: {processed, enriched, skipped}
    """
    own_conn = conn is None
    if own_conn:
        conn = db_pg.get_conn()

    try:
        # Entities with no contacts yet, prioritised by score
        rows = db_pg.fetchall(conn, """
            SELECT e.id FROM entities e
            WHERE e.active = TRUE
              AND e.is_canonical = TRUE
              AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.entity_id = e.id)
            ORDER BY (SELECT total_score FROM opportunity_scores os WHERE os.entity_id = e.id) DESC NULLS LAST
            LIMIT %s
        """, (limit,))

        processed = enriched = skipped = 0
        for r in rows:
            processed += 1
            contacts = enrich_entity_contacts(conn, r['id'])
            if contacts:
                enriched += 1
            else:
                skipped += 1

            if processed % 500 == 0:
                conn.commit()
                print(f"  ... {processed}/{len(rows)} entities processed")

        conn.commit()
        return {'processed': processed, 'enriched': enriched, 'skipped': skipped}
    finally:
        if own_conn:
            conn.close()


def get_best_contact(conn, entity_id: int, sector: str = '') -> dict | None:
    """
    Return the best contact for outreach for a given entity.
    Includes a 'ask_for' string suitable for use in call scripts.
    """
    rows = db_pg.fetchall(conn, """
        SELECT full_name, job_title, role_category, phone, email, source, confidence, is_primary, is_decision_maker
        FROM contacts
        WHERE entity_id = %s
        ORDER BY is_primary DESC, confidence DESC
        LIMIT 10
    """, (entity_id,))

    if not rows:
        return None

    best = rows[0]
    name = best['full_name']
    role = best['job_title'] or best['role_category'].replace('_', ' ').title()

    ask_for = f"Ask for {name}" if name else f"Ask for the {role}"

    return {
        'full_name':        name,
        'job_title':        role,
        'role_category':    best['role_category'],
        'phone':            best['phone'],
        'email':            best['email'],
        'source':           best['source'],
        'confidence':       best['confidence'],
        'is_decision_maker': best['is_decision_maker'],
        'ask_for':          ask_for,
        'all_contacts':     [dict(r) for r in rows[:5]],
    }


if __name__ == '__main__':
    print("Running contact enrichment batch...")
    stats = run_contact_enrichment()
    print(f"Processed: {stats['processed']}")
    print(f"Enriched:  {stats['enriched']}")
    print(f"Skipped:   {stats['skipped']}")
