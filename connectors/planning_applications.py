"""
connectors/planning_applications.py — London Planning Applications
Source: planning.data.gov.uk (DLUHC) — free, no API key required
Covers: All 33 London Local Planning Authorities

Why this matters:
  Every approved commercial planning application = a future cleaning contract.
  New office → cleaning contract in 6–18 months (build time).
  Change of use / fit-out → cleaning contract in 1–3 months.
  You see it before the building opens. Everyone else pitches after.

Signal emitted: new_development
  strength=80  change of use / fit-out (short lead time)
  strength=70  new commercial build (medium lead time)
  strength=60  extension / refurbishment (existing premises expanding)

Run incrementally: tracks last-run date in ingest_runs, only fetches
applications added to the platform since the previous run.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Optional

import db_pg
import config
from connectors.base import BaseConnector
from entity_resolution import resolve_entity
from signal_detection import emit_signal

logger = logging.getLogger(__name__)

PA_BASE = "https://www.planning.data.gov.uk"
PA_ENTITY_URL = f"{PA_BASE}/entity.json"

# ── London LPA entity IDs on planning.data.gov.uk ──────────────────────────
LONDON_LPA_ENTITIES: dict[int, str] = {
    41:  'Barking and Dagenham',
    42:  'Brent',
    43:  'Bexley',
    48:  'Barnet',
    65:  'Bromley',
    90:  'Camden',
    100: 'Croydon',
    115: 'Ealing',
    126: 'Enfield',
    150: 'Greenwich',
    162: 'Havering',
    163: 'Hackney',
    167: 'Hillingdon',
    169: 'Hammersmith and Fulham',
    170: 'Hounslow',
    174: 'Harrow',
    175: 'Haringey',
    181: 'Islington',
    182: 'Kensington and Chelsea',
    188: 'Kingston upon Thames',
    192: 'Lambeth',
    198: 'Lewisham',
    203: 'City of London',
    217: 'Merton',
    246: 'Newham',
    261: 'Redbridge',
    266: 'Richmond upon Thames',
    319: 'Sutton',
    329: 'Southwark',
    350: 'Tower Hamlets',
    366: 'Waltham Forest',
    376: 'Wandsworth',
    387: 'Westminster',
}

# ── Commercial keywords: include if ANY match ────────────────────────────────
# These indicate premises that need professional cleaning
_COMMERCIAL_INCLUDE = re.compile(
    r'\b('
    r'office|offices|commercial|retail|shop|restaurant|cafe|hotel|hostel|pub|bar|'
    r'gym|fitness|leisure|sports.?centre|swimming.?pool|'
    r'school|college|university|educational|nursery|academy|'
    r'healthcare|medical|clinic|hospital|care.?home|nursing.?home|'
    r'warehouse|industrial|storage|distribution|'
    r'residential.?block|apartment.?block|flats|student.?accommodation|'
    r'change.?of.?use|fit.?out|mixed.?use|'
    r'community.?centre|library|place.?of.?worship|church|mosque|temple|'
    r'co.?working|serviced.?office|business.?centre|'
    r'supermarket|department.?store|shopping'
    r')\b',
    re.IGNORECASE,
)

# Domestic keywords: exclude if description is purely residential/domestic
_DOMESTIC_EXCLUDE = re.compile(
    r'\b('
    r'dwellinghouse|dwelling house|single.?storey extension|two.?storey extension|'
    r'rear extension|side extension|front extension|loft conversion|'
    r'outbuilding|garden room|garage|conservatory|porch|'
    r'to existing dwelling|to the dwelling|to the house|'
    r'listed building consent|advertisement consent'
    r')\b',
    re.IGNORECASE,
)

# Keywords that suggest higher signal strength (imminent contract)
_HIGH_STRENGTH = re.compile(
    r'\b(change.?of.?use|fit.?out|conversion|refurbishment|refurb|'
    r'new build|erection of|demolition.+erection)\b',
    re.IGNORECASE,
)

# ── Sector inference from description ────────────────────────────────────────
def _infer_sector(description: str) -> str:
    desc = description.lower()
    if any(k in desc for k in ['school', 'college', 'university', 'nursery', 'academy', 'educational']):
        return 'education'
    if any(k in desc for k in ['hospital', 'clinic', 'care home', 'nursing home', 'healthcare', 'medical']):
        return 'healthcare'
    if any(k in desc for k in ['office', 'co-working', 'coworking', 'serviced office', 'business centre']):
        return 'offices'
    if any(k in desc for k in ['gym', 'fitness', 'leisure', 'sports centre', 'swimming pool']):
        return 'gyms'
    if any(k in desc for k in ['hotel', 'hostel', 'pub', 'bar', 'restaurant', 'cafe']):
        return 'hospitality'
    if any(k in desc for k in ['warehouse', 'industrial', 'storage', 'distribution']):
        return 'industrial'
    if any(k in desc for k in ['residential block', 'apartment', 'flats', 'student accommodation']):
        return 'residential_blocks'
    if any(k in desc for k in ['church', 'mosque', 'temple', 'place of worship']):
        return 'religious_centres'
    if any(k in desc for k in ['community centre', 'library', 'conference']):
        return 'community_venues'
    if any(k in desc for k in ['shop', 'retail', 'supermarket', 'department store', 'shopping']):
        return 'retail'
    return 'other'


def _signal_strength(description: str) -> int:
    """Higher strength = sooner to be a live contract."""
    if _HIGH_STRENGTH.search(description):
        return 80
    return 65


def _is_commercial(description: str) -> bool:
    """Return True if the application is for commercial/institutional premises."""
    if not description:
        return False
    if _DOMESTIC_EXCLUDE.search(description):
        return False
    return bool(_COMMERCIAL_INCLUDE.search(description))


class PlanningApplicationsConnector(BaseConnector):
    """
    Fetches London planning applications and emits new_development signals.
    No API key required — fully public data.
    """
    source_name   = 'planning_applications'
    request_delay = 0.3   # polite delay; no documented rate limit

    def __init__(self):
        super().__init__()

    def is_configured(self) -> bool:
        return True  # no credentials needed

    def _get_last_run_date(self, conn) -> str:
        """Return ISO date string of last successful run, or 12 months ago."""
        row = db_pg.fetchone(conn, """
            SELECT finished_at FROM ingest_runs
            WHERE source = 'planning_applications' AND finished_at IS NOT NULL
            ORDER BY finished_at DESC LIMIT 1
        """)
        if row and row['finished_at']:
            # Go back 2 days extra to catch any late additions
            d = row['finished_at'].date() - timedelta(days=2)
            return d.isoformat()
        # First run: go back 12 months
        return (datetime.now() - timedelta(days=365)).date().isoformat()

    def _fetch_borough(self, org_entity: int, entry_date_after: str,
                       limit_per_borough: int) -> list[dict]:
        """Fetch planning applications for one borough."""
        results = []
        offset  = 0
        page_sz = 100

        while len(results) < limit_per_borough:
            url = (
                f"{PA_ENTITY_URL}"
                f"?dataset=planning-application"
                f"&organisation_entity={org_entity}"
                f"&entry_date_after={entry_date_after}"
                f"&limit={page_sz}"
                f"&offset={offset}"
            )
            data = self._get(url)
            if data is None:
                break

            entities = data.get('entities', [])
            if not entities:
                break

            results.extend(entities)
            offset += len(entities)

            # No more pages?
            if len(entities) < page_sz:
                break

        return results

    def run(self, conn, limit: int = 2000) -> int:
        """
        Fetch commercial planning applications from all 33 London LPAs.
        limit: max total applications to process across all boroughs.
        Returns count of applications stored.
        """
        run_id = db_pg.fetchval(conn, """
            INSERT INTO ingest_runs (source, notes)
            VALUES ('planning_applications', 'London commercial planning applications')
            RETURNING id
        """)
        conn.commit()

        entry_date_after = self._get_last_run_date(conn)
        logger.info(f"Planning Applications: fetching since {entry_date_after}")

        seen_ids     = set()
        total_stored = 0
        total_matched = 0

        # Note: planning.data.gov.uk coverage varies by LPA.
        # Camden (90) is fully published. Others will auto-activate as they join the platform.
        # We query all known London LPAs; empty responses are skipped automatically.
        per_borough = max(100, limit // len(LONDON_LPA_ENTITIES))

        for org_entity, borough in LONDON_LPA_ENTITIES.items():
            if total_stored >= limit:
                break

            applications = self._fetch_borough(org_entity, entry_date_after, per_borough)
            if not applications:
                continue  # No data from this LPA yet — skip silently
            borough_commercial = 0

            for app in applications:
                if total_stored >= limit:
                    break

                ref  = app.get('reference', '')
                uid  = f"{org_entity}:{ref}"
                if not ref or uid in seen_ids:
                    continue

                description = (app.get('description') or '').strip()
                if not _is_commercial(description):
                    continue

                seen_ids.add(uid)

                # Status filter — only granted/approved/pending, not refused
                decision = (app.get('planning-decision-type') or '').lower()
                status   = (app.get('planning-application-status') or '').lower()
                if 'refus' in decision or 'refus' in status:
                    continue

                # Age filter — skip applications decided more than 3 years ago
                # (those buildings are already occupied and don't need a first cleaner)
                decision_date = app.get('decision-date') or ''
                if decision_date:
                    try:
                        from datetime import date
                        dd = date.fromisoformat(decision_date)
                        if (datetime.now().date() - dd).days > 3 * 365:
                            continue
                    except ValueError:
                        pass

                address_text = (app.get('address-text') or '').strip()
                point        = app.get('point') or ''  # "POINT(lon lat)"
                decision_date = app.get('decision-date') or ''

                # Parse coordinates from WKT point
                lat = lon = None
                if point:
                    m = re.match(r'POINT\s*\(([0-9.\-]+)\s+([0-9.\-]+)\)', point)
                    if m:
                        lon, lat = float(m.group(1)), float(m.group(2))

                # Extract postcode from address text
                postcode = ''
                pc_match = re.search(
                    r'([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})', address_text, re.IGNORECASE
                )
                if pc_match:
                    postcode = pc_match.group(1).upper().strip()

                # Store raw record
                db_pg.execute(conn, """
                    INSERT INTO raw_source_records (source, source_record_id, ingest_run_id, payload)
                    VALUES ('planning_applications', %s, %s, %s)
                    ON CONFLICT (source, source_record_id) DO UPDATE SET
                        payload = EXCLUDED.payload, fetched_at = NOW()
                """, (uid, run_id, json.dumps(app)))

                total_stored += 1
                borough_commercial += 1

                # Infer sector and entity name from description + address
                sector      = _infer_sector(description)
                strength    = _signal_strength(description)
                entity_name = address_text or f"Planning Application {ref}"
                norm_name   = entity_name.lower().strip()

                # Try to match existing entity
                match = resolve_entity(
                    conn,
                    canonical_name=entity_name,
                    normalized_name=norm_name,
                    postcode=postcode,
                )

                if match:
                    entity_id, confidence = match
                    total_matched += 1
                else:
                    # Create new entity for this development site
                    # First create address
                    addr_id = db_pg.fetchval(conn, """
                        INSERT INTO addresses (line1, postcode, borough, country, latitude, longitude)
                        VALUES (%s, %s, %s, 'United Kingdom', %s, %s)
                        RETURNING id
                    """, (address_text[:200] if address_text else ref,
                          postcode or None, borough,
                          lat, lon))

                    entity_id = db_pg.fetchval(conn, """
                        INSERT INTO entities (
                            canonical_name, normalized_name, sector, entity_kind,
                            hvt, active
                        ) VALUES (%s, %s, %s, %s, %s, TRUE)
                        ON CONFLICT DO NOTHING
                        RETURNING id
                    """, (
                        entity_name[:200],
                        norm_name[:200],
                        sector,
                        'facility' if sector in ('education','healthcare','gyms','hospitality','community_venues') else 'company',
                        sector in ('offices', 'healthcare', 'education', 'property_management'),
                    ))

                    if entity_id is None:
                        # Conflict — look it up
                        entity_id = db_pg.fetchval(conn,
                            "SELECT id FROM entities WHERE normalized_name = %s LIMIT 1",
                            (norm_name[:200],))

                    if entity_id and addr_id:
                        db_pg.execute(conn, """
                            INSERT INTO entity_locations (entity_id, address_id, is_primary)
                            VALUES (%s, %s, TRUE) ON CONFLICT DO NOTHING
                        """, (entity_id, addr_id))

                if entity_id:
                    # Link source
                    db_pg.link_entity_source(
                        conn, entity_id, 'planning_applications', uid, confidence=90
                    )

                    # Build evidence string
                    evidence = (
                        f"{description[:120]}{'…' if len(description) > 120 else ''} "
                        f"— {borough}"
                        + (f" — decided {decision_date}" if decision_date else "")
                        + (f" — ref {ref}" if ref else "")
                    )

                    emit_signal(conn, entity_id, 'new_development',
                                strength=strength, evidence=evidence,
                                source='planning_applications')

            conn.commit()

            if borough_commercial > 0:
                logger.info(
                    f"Planning: {borough} — {borough_commercial} commercial "
                    f"applications (total={total_stored})"
                )

        db_pg.execute(conn,
            "UPDATE ingest_runs SET finished_at = NOW(), record_count = %s WHERE id = %s",
            (total_stored, run_id))
        conn.commit()

        logger.info(
            f"Planning Applications done: {total_stored} stored, "
            f"{total_matched} matched to existing entities"
        )
        return total_stored
