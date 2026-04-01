"""
connectors/companies_house.py — Companies House API connector
Auth: HTTP Basic Auth (API key as username, empty password)
Rate: 600 requests/5 min → 0.5s delay

Environments:
  test (sandbox) → api-sandbox.company-information.service.gov.uk
                   no real company data; use to verify key works
  live           → api.company-information.service.gov.uk
                   real data; requires a live-environment key

To get a live key: developer.company-information.service.gov.uk
  → Manage application → change environment from "test" to "live"
  → or create a new application with environment = live
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

import requests

import db_pg
import config
from connectors.base import BaseConnector
from entity_resolution import resolve_entity, _name_similarity
from signal_detection import emit_signal

logger = logging.getLogger(__name__)

# Switch via COMPANIES_HOUSE_ENV=live in .env (default: sandbox while key is test-only)
_CH_ENV  = config.COMPANIES_HOUSE_ENV
CH_BASE  = (
    "https://api.company-information.service.gov.uk"
    if _CH_ENV == "live"
    else "https://api-sandbox.company-information.service.gov.uk"
)


class CompaniesHouseConnector(BaseConnector):
    source_name   = 'companies_house'
    base_url      = CH_BASE
    request_delay = 0.55  # 600 req/5min = 2/s; 0.55s gives comfortable margin

    def __init__(self, api_key: str = ''):
        super().__init__(api_key)
        if api_key:
            self.session.auth = (api_key, '')  # Basic Auth: key as username, empty password

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _search(self, name: str) -> list[dict]:
        """Search for company by name. Returns up to 5 candidates."""
        url = f"{CH_BASE}/search/companies?q={requests.utils.quote(name)}&items_per_page=5"
        data = self._get(url)
        if data is None:
            return []
        return data.get('items', [])

    def _profile(self, company_number: str) -> Optional[dict]:
        """Get full company profile."""
        url = f"{CH_BASE}/company/{company_number}"
        return self._get(url)

    def _is_london_company(self, profile: dict) -> bool:
        """Check if registered address is in London."""
        postcode = (
            profile.get('registered_office_address', {}).get('postal_code') or ''
        ).strip().upper()
        return postcode.startswith(config.LONDON_POSTCODE_PREFIXES)

    def run(self, conn, limit: int = 2000) -> int:
        """
        Enrich top entities that have no company_number yet.
        Returns count of entities enriched.
        """
        if not self.is_configured():
            logger.warning("Companies House: no API key — skipping")
            return 0

        logger.info(f"Companies House: enriching top {limit} unmatched entities")

        # Get top entities without company number
        entities = db_pg.fetchall(conn, """
            SELECT e.id, e.canonical_name, e.normalized_name, e.sector, e.entity_kind,
                   a.postcode, a.borough
            FROM entities e
            LEFT JOIN LATERAL (
                SELECT address_id FROM entity_locations
                WHERE entity_id = e.id AND is_primary = TRUE ORDER BY id LIMIT 1
            ) el ON TRUE
            LEFT JOIN addresses a ON a.id = el.address_id
            LEFT JOIN opportunity_scores os ON os.entity_id = e.id
            WHERE e.active = TRUE AND e.company_number IS NULL
            ORDER BY COALESCE(os.total_score, 0) DESC
            LIMIT %s
        """, (limit,))

        enriched = 0

        run_id = db_pg.fetchval(conn, """
            INSERT INTO ingest_runs (source, notes)
            VALUES ('companies_house', 'Companies House entity enrichment')
            RETURNING id
        """)
        conn.commit()

        for entity in entities:
            name     = entity['canonical_name']
            postcode = entity.get('postcode') or ''

            candidates = self._search(name)
            best       = None
            best_score = 0.0

            for c in candidates:
                c_name = c.get('title', '')
                sim    = _name_similarity(name, c_name)
                c_postcode = (c.get('address', {}).get('postal_code') or '').upper()

                # Postcode bonus: full match or prefix match
                postcode_match = (
                    postcode.upper() == c_postcode or
                    (postcode[:4] and c_postcode.startswith(postcode[:4]))
                )

                combined = sim + (20 if postcode_match else 0)
                if combined > best_score:
                    best_score = combined
                    best = c

            if best and best_score >= 80:
                company_number = best.get('company_number', '')

                # Get full profile
                profile = self._profile(company_number)
                if profile is None:
                    continue

                if not self._is_london_company(profile):
                    continue

                # Store raw record
                db_pg.execute(conn, """
                    INSERT INTO raw_source_records (source, source_record_id, ingest_run_id, payload)
                    VALUES ('companies_house', %s, %s, %s)
                    ON CONFLICT (source, source_record_id) DO UPDATE SET
                        payload = EXCLUDED.payload, fetched_at = NOW()
                """, (company_number, run_id, json.dumps(profile)))

                # Update entity with company number — skip if another entity already holds it
                taken_by = db_pg.fetchval(conn,
                    "SELECT id FROM entities WHERE company_number = %s",
                    (company_number,))
                if taken_by and taken_by != entity['id']:
                    logger.debug(f"CH: company {company_number} already linked to entity {taken_by} — skipping {entity['id']}")
                    continue
                db_pg.execute(conn,
                    "UPDATE entities SET company_number = %s, updated_at = NOW() WHERE id = %s",
                    (company_number, entity['id'])
                )

                # Insert Companies House profile
                db_pg.execute(conn, """
                    INSERT INTO companies_house_profiles (
                        entity_id, company_number, company_name, company_status,
                        company_type, date_of_creation, date_of_cessation,
                        sic_codes, registered_postcode, raw_payload
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (company_number) DO UPDATE SET
                        company_status = EXCLUDED.company_status,
                        raw_payload = EXCLUDED.raw_payload,
                        fetched_at = NOW()
                """, (
                    entity['id'],
                    company_number,
                    profile.get('company_name'),
                    profile.get('company_status'),
                    profile.get('type'),
                    profile.get('date_of_creation'),
                    profile.get('date_of_cessation'),
                    profile.get('sic_codes', []),
                    profile.get('registered_office_address', {}).get('postal_code'),
                    json.dumps(profile),
                ))

                # Link source
                db_pg.link_entity_source(conn, entity['id'], 'companies_house', company_number, confidence=85)

                # Emit signal
                emit_signal(conn, entity['id'], 'companies_house_match',
                            strength=60, evidence=f"CH: {profile.get('company_name')} ({company_number})",
                            source='companies_house')

                enriched += 1
                if enriched % 50 == 0:
                    logger.info(f"Companies House: {enriched} enriched so far")

            conn.commit()

        db_pg.execute(conn, "UPDATE ingest_runs SET finished_at = NOW(), record_count = %s WHERE id = %s",
                      (enriched, run_id))
        conn.commit()

        logger.info(f"Companies House done: {enriched}/{len(entities)} entities enriched")
        return enriched
