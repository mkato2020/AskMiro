"""
connectors/cqc.py — Care Quality Commission Syndication API connector
Auth: Ocp-Apim-Subscription-Key header (register at api-portal.cqc.org.uk)
Base: https://api.service.cqc.org.uk/public/v1

List endpoint (summary only — locationId, locationName, postalCode):
  GET /locations?region=London&perPage=1000

Detail endpoint (full data — registrationStatus, type, currentRatings, etc.):
  GET /locations/{id}

Incremental updates:
  GET /changes/location?startTimestamp=...&endTimestamp=...&perPage=1000

Two-pass strategy in run():
  Pass 1 — page through the list to collect all London locationIds
  Pass 2 — fetch /locations/{id} for each to get full details, then ingest
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta

import db_pg
import config
from connectors.base import BaseConnector
from entity_resolution import resolve_entity
from signal_detection import emit_signal

logger = logging.getLogger(__name__)

CQC_BASE = "https://api.service.cqc.org.uk/public/v1"


class CQCConnector(BaseConnector):
    source_name   = 'cqc'
    base_url      = CQC_BASE
    request_delay = 0.3

    def __init__(self, api_key: str = ''):
        super().__init__(api_key)
        if api_key:
            self.session.headers['Ocp-Apim-Subscription-Key'] = api_key

    def is_configured(self) -> bool:
        return bool(self.api_key)

    # ── helpers ────────────────────────────────────────────────────────────────

    def _location_detail(self, loc_id: str) -> dict | None:
        """Fetch full details for a single location from /locations/{id}."""
        return self._get(f"{CQC_BASE}/locations/{loc_id}")

    # ── public methods ─────────────────────────────────────────────────────────

    def run(self, conn, limit: int = None) -> int:
        """
        Full sync — two passes:
          1. Page through /locations?region=London to collect London locationIds.
          2. For each, fetch /locations/{id} to get full details (registrationStatus,
             type, currentRatings — NOT present in the list response).
        Returns count of locations fully processed.
        """
        if not self.is_configured():
            logger.warning("CQC: no subscription key — skipping")
            return 0

        logger.info("CQC connector: starting London location sync")

        run_id = db_pg.fetchval(conn, """
            INSERT INTO ingest_runs (source, notes)
            VALUES ('cqc', 'CQC London locations full sync')
            RETURNING id
        """)
        conn.commit()

        # ── Pass 1: collect London location IDs from the paginated list ────────
        london_ids: list[tuple[str, str, str]] = []   # (loc_id, name, postcode)
        url = f"{CQC_BASE}/locations?region=London&perPage=1000"

        while url:
            data = self._get(url)
            if data is None:
                break

            for loc in data.get('locations', []):
                loc_id   = loc.get('locationId', '')
                name     = loc.get('locationName', '').strip()
                postcode = loc.get('postalCode', '').strip()

                if not loc_id:
                    continue
                # List postcode is the only filter available at this stage
                if not config.is_london_postcode(postcode):
                    continue

                london_ids.append((loc_id, name, postcode))

                if limit and len(london_ids) >= limit:
                    break

            logger.info(f"CQC list: {len(london_ids)} London locations collected so far")

            if limit and len(london_ids) >= limit:
                break

            next_uri = data.get('nextPageUri')
            url = f"{CQC_BASE}{next_uri}" if next_uri else None

        logger.info(f"CQC: {len(london_ids)} London locations to process")

        # ── Pass 2: fetch full details and ingest ──────────────────────────────
        total_fetched = 0
        total_matched = 0
        total_created = 0

        for loc_id, list_name, list_postcode in london_ids:
            detail = self._location_detail(loc_id)
            if not detail:
                logger.debug(f"CQC: no detail for {loc_id} — skipping")
                continue

            # Store full detail payload as the raw record
            db_pg.execute(conn, """
                INSERT INTO raw_source_records (source, source_record_id, ingest_run_id, payload)
                VALUES ('cqc', %s, %s, %s)
                ON CONFLICT (source, source_record_id) DO UPDATE SET
                    payload = EXCLUDED.payload, fetched_at = NOW()
            """, (loc_id, run_id, json.dumps(detail)))

            total_fetched += 1

            # Detail endpoint uses 'name' (not 'locationName')
            name     = detail.get('name', list_name).strip()
            postcode = detail.get('postalCode', list_postcode).strip()
            status   = detail.get('registrationStatus', '')

            if not name or status != 'Registered':
                continue
            if not config.is_london_postcode(postcode):
                continue

            norm_name = name.lower().strip()
            match = resolve_entity(conn, canonical_name=name,
                normalized_name=norm_name, postcode=postcode,
                sector='healthcare', entity_kind='facility')

            if match:
                entity_id, confidence = match
                total_matched += 1
            else:
                entity_id = db_pg.upsert_entity(conn, entity_kind='facility',
                    canonical_name=name, normalized_name=norm_name,
                    sector='healthcare', cqc_location_id=loc_id)
                addr_id = db_pg.upsert_address(conn, postcode=postcode)
                db_pg.link_entity_address(conn, entity_id, addr_id)
                total_created += 1

            db_pg.link_entity_source(conn, entity_id, 'cqc', loc_id,
                confidence=90 if match else 100)

            rating   = (detail.get('currentRatings') or {}).get('overall', {}).get('rating', '')
            loc_type = detail.get('type', '')
            evidence = f"CQC {loc_type} — rating: {rating or 'not yet rated'}"
            emit_signal(conn, entity_id, 'regulated_healthcare_facility',
                strength=70, evidence=evidence, source='cqc')

            if total_fetched % 100 == 0:
                conn.commit()
                logger.info(f"CQC: {total_fetched} processed, {total_matched} matched, {total_created} created")

        conn.commit()

        db_pg.execute(conn,
            "UPDATE ingest_runs SET finished_at = NOW(), record_count = %s WHERE id = %s",
            (total_fetched, run_id))
        conn.commit()

        logger.info(f"CQC done: {total_fetched} fetched, {total_matched} matched, {total_created} created")
        return total_fetched

    def sync_changes(self, conn, since_hours: int = 24) -> int:
        """
        Incremental update using the /changes endpoint.
        Fetches location IDs changed in the last `since_hours` hours,
        re-fetches full details for each, and refreshes raw_source_records.
        Handles pagination of the changes list (nextPageUri).
        """
        if not self.is_configured():
            return 0

        now   = datetime.now(timezone.utc)
        start = (now - timedelta(hours=since_hours)).strftime('%Y-%m-%dT%H:%M:%SZ')
        end   = now.strftime('%Y-%m-%dT%H:%M:%SZ')

        logger.info(f"CQC sync_changes: fetching changes {start} → {end}")

        # Collect all changed IDs, paginating through the changes list
        changed_ids: list[str] = []
        url = f"{CQC_BASE}/changes/location?startTimestamp={start}&endTimestamp={end}&perPage=1000"

        while url:
            data = self._get(url)
            if not data:
                break
            changed_ids.extend(data.get('changes', []))
            next_uri = data.get('nextPageUri')
            url = f"{CQC_BASE}{next_uri}" if next_uri else None

        logger.info(f"CQC changes: {len(changed_ids)} locations updated since {start}")

        updated = 0
        for loc_id in changed_ids:
            loc_data = self._location_detail(loc_id)
            if not loc_data:
                continue
            postcode = loc_data.get('postalCode', '')
            if not config.is_london_postcode(postcode):
                continue
            db_pg.execute(conn, """
                INSERT INTO raw_source_records (source, source_record_id, payload)
                VALUES ('cqc', %s, %s)
                ON CONFLICT (source, source_record_id) DO UPDATE SET
                    payload = EXCLUDED.payload, fetched_at = NOW()
            """, (loc_id, json.dumps(loc_data)))
            updated += 1

        conn.commit()
        logger.info(f"CQC sync_changes: {updated} London locations refreshed")
        return updated
