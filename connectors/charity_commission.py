"""
connectors/charity_commission.py — Charity Commission Register of Charities API connector
Auth: Ocp-Apim-Subscription-Key header (or subscription-key query param)
Base: https://api.charitycommission.gov.uk/register/api

Key endpoints used:
  GET /allcharitydetailsV2/{RegisteredNumber}/{suffix} — full charity details V2 (suffix=0 for main)
  GET /searchCharityName/{charityname}                 — name-based search (array of matches)

Field names (all snake_case per the API spec):
  charity_name, address_post_code, reg_status, reg_charity_number,
  who_what_where[].classification_desc, charity_type,
  charity_co_reg_number  — Companies House registration number (cross-reference)

reg_status values: "R" = Registered, "RM" = Removed (single-letter codes)

V2 note: /allcharitydetails/ is deprecated; use /allcharitydetailsV2/ which adds trustee_id
         to trustee_names and is the current supported endpoint.
"""

from __future__ import annotations

import json
import logging
import re
from urllib.parse import quote

import db_pg
import config
from connectors.base import BaseConnector
from entity_resolution import resolve_entity, _postcode_district
from signal_detection import emit_signal

logger = logging.getLogger(__name__)

CC_BASE = "https://api.charitycommission.gov.uk/register/api"


def _clean_search_name(name: str) -> str:
    """
    Simplify an entity name for CC name search:
    - Remove bracketed suffixes: 'Foo (Bar)' → 'Foo'
    - Replace '&' with 'and'
    - Strip trailing punctuation/noise
    - Cap at 5 words so partial names still match
    """
    s = re.sub(r'\s*[\(\[].*?[\)\]]', '', name)   # remove (...) and [...]
    s = s.replace('&', 'and').replace("'", '')
    s = re.sub(r'[^\w\s]', ' ', s)                # replace remaining punctuation with space
    s = ' '.join(s.split())                        # normalise whitespace
    words = s.split()
    return ' '.join(words[:5]) if len(words) > 5 else s


def _is_registered(reg_status: str) -> bool:
    """Handle both single-letter code ('R') and full string ('Registered')."""
    s = (reg_status or '').strip()
    return s.upper() == 'R' or 'registered' in s.lower()


class CharityCommissionConnector(BaseConnector):
    source_name   = 'charity_commission'
    base_url      = CC_BASE
    request_delay = 0.5

    def __init__(self, api_key: str = ''):
        super().__init__(api_key)
        if api_key:
            self.session.headers['Ocp-Apim-Subscription-Key'] = api_key

    def is_configured(self) -> bool:
        return bool(self.api_key)

    # ── helpers ────────────────────────────────────────────────────────────────

    def charity_details(self, registered_number: str, suffix: int = 0) -> dict | None:
        """
        Fetch full details for a charity by registration number (V2 endpoint).
        404 = charity not found — returns None without retrying.
        """
        import requests as _requests
        url = f"{CC_BASE}/allcharitydetailsV2/{registered_number}/{suffix}"
        try:
            r = self.session.get(url, timeout=15)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            import time; time.sleep(self.request_delay)
            return r.json()
        except _requests.exceptions.RequestException as e:
            logger.debug(f"CC charity_details({registered_number}): {e}")
            return None

    def search_by_name(self, name: str) -> list[dict]:
        """
        Search for charities by name.
        Returns list of {reg_charity_number, charity_name, reg_status, ...} dicts.
        404 means no match found — treated as empty result (not an error).
        """
        import requests as _requests
        encoded = quote(name, safe='')
        url = f"{CC_BASE}/searchCharityName/{encoded}"
        try:
            r = self.session.get(url, timeout=15)
            if r.status_code == 404:
                return []   # no charity found with this name
            r.raise_for_status()
            import time; time.sleep(self.request_delay)
            result = r.json()
            return result if isinstance(result, list) else []
        except _requests.exceptions.RequestException as e:
            logger.debug(f"CC search_by_name({name!r}): {e}")
            return []

    # ── main run ───────────────────────────────────────────────────────────────

    def run(self, conn, limit: int = 10000) -> int:
        """
        Two-pass strategy:
        Pass 1 — Enrich entities with a known charity_number: fetch full details,
                  fix entity_kind, update address, emit charity_venue signal.
        Pass 2 — London religious/community entities WITHOUT a charity_number:
                  use searchCharityName to find candidate matches, then fetch full
                  details and link if postcode and name are a strong match.
        Returns total records fetched/processed.
        """
        if not self.is_configured():
            logger.warning("Charity Commission: no API key — skipping")
            return 0

        run_id = db_pg.fetchval(conn, """
            INSERT INTO ingest_runs (source, notes)
            VALUES ('charity_commission', 'Charity Commission enrichment pass')
            RETURNING id
        """)
        conn.commit()

        total_fetched = 0
        total_enriched = 0

        # ── Pass 1: entities with a known charity_number ───────────────────────
        entities = db_pg.fetchall(conn, """
            SELECT e.id, e.charity_number, e.canonical_name, e.sector
            FROM entities e
            WHERE e.charity_number IS NOT NULL
              AND e.active = TRUE
            LIMIT %s
        """, (limit,))

        for ent in entities:
            if total_fetched >= limit:
                break

            charity_num = str(ent['charity_number'])
            data = self.charity_details(charity_num, suffix=0)
            total_fetched += 1

            if not data:
                continue

            _process_charity_record(conn, ent['id'], charity_num, data, run_id)
            total_enriched += 1

            if total_fetched % 100 == 0:
                conn.commit()
                logger.info(f"Charity Commission pass 1: {total_fetched} processed")

        conn.commit()

        # ── Pass 2: name-search for London charity-type entities without a number
        unmatched_entities = db_pg.fetchall(conn, """
            SELECT e.id, e.canonical_name
            FROM entities e
            WHERE e.sector IN ('religious_centres', 'community_venues')
              AND e.charity_number IS NULL
              AND e.active = TRUE
            LIMIT %s
        """, (max(0, limit - total_fetched),))

        pass2_linked = 0
        for ent in unmatched_entities:
            if total_fetched >= limit:
                break

            name        = ent['canonical_name']
            search_term = _clean_search_name(name)
            results     = self.search_by_name(search_term)
            total_fetched += 1

            if not results:
                continue

            # Take first registered result from the search
            candidate = None
            for r in results:
                if _is_registered(r.get('reg_status', '')):
                    candidate = r
                    break

            if not candidate:
                continue

            charity_num = str(candidate.get('reg_charity_number', ''))
            if not charity_num or charity_num == '0':
                continue

            # Fetch full details to check London postcode before linking
            data = self.charity_details(charity_num, suffix=0)
            if not data:
                continue

            postcode = (data.get('address_post_code') or '').strip()
            if not config.is_london_postcode(postcode):
                continue

            # Store charity_number on the entity — skip if another entity already holds it
            taken_by = db_pg.fetchval(conn,
                "SELECT id FROM entities WHERE charity_number = %s",
                (charity_num,))
            if taken_by and taken_by != ent['id']:
                logger.debug(f"CC: charity {charity_num} already linked to entity {taken_by} — skipping {ent['id']}")
                continue
            db_pg.execute(conn,
                "UPDATE entities SET charity_number = %s, updated_at = NOW() WHERE id = %s",
                (charity_num, ent['id']))

            _process_charity_record(conn, ent['id'], charity_num, data, run_id)
            pass2_linked += 1

            if pass2_linked % 50 == 0:
                conn.commit()
                logger.info(f"Charity Commission pass 2: {pass2_linked} linked via name search")

        conn.commit()

        db_pg.execute(conn,
            "UPDATE ingest_runs SET finished_at = NOW(), record_count = %s WHERE id = %s",
            (total_fetched, run_id))
        conn.commit()

        logger.info(
            f"Charity Commission done: {total_fetched} requests, "
            f"{total_enriched} pass-1 enriched, {pass2_linked} pass-2 linked"
        )
        return total_fetched


def _process_charity_record(conn, entity_id: int, charity_number: str, data: dict, run_id: int):
    """
    Store raw payload, update entity fields, emit signal.
    Field names come from GetAllCharityDetailsV2 schema (snake_case):
      charity_name, address_post_code, reg_status, who_what_where, charity_type,
      charity_co_reg_number (Companies House cross-reference)
    """
    db_pg.execute(conn, """
        INSERT INTO raw_source_records (source, source_record_id, ingest_run_id, payload)
        VALUES ('charity_commission', %s, %s, %s)
        ON CONFLICT (source, source_record_id) DO UPDATE SET
            payload = EXCLUDED.payload, fetched_at = NOW()
    """, (charity_number, run_id, json.dumps(data)))

    name     = (data.get('charity_name') or '').strip()
    postcode = (data.get('address_post_code') or '').strip()
    status   = (data.get('reg_status') or '')

    # Build evidence string from classification descriptions (who_what_where)
    wwh = data.get('who_what_where') or []
    descriptions = [w.get('classification_desc', '') for w in wwh if w.get('classification_desc')]
    activities_str = '; '.join(descriptions[:3])   # cap at 3 for readability

    if name:
        db_pg.execute(conn,
            "UPDATE entities SET entity_kind = 'charity', updated_at = NOW() WHERE id = %s",
            (entity_id,))

    if postcode:
        addr_id = db_pg.upsert_address(conn, postcode=postcode)
        db_pg.link_entity_address(conn, entity_id, addr_id)

    db_pg.link_entity_source(conn, entity_id, 'charity_commission', charity_number, confidence=100)

    # Cross-reference with Companies House via charity_co_reg_number (V2 field)
    co_reg = (data.get('charity_co_reg_number') or '').strip()
    if co_reg and co_reg != '0':
        # Store on entity if not already set; also create a CH source link
        db_pg.execute(conn, """
            UPDATE entities
            SET company_number = %s, updated_at = NOW()
            WHERE id = %s AND company_number IS NULL
        """, (co_reg, entity_id))
        db_pg.link_entity_source(conn, entity_id, 'companies_house', co_reg, confidence=90)
        logger.debug(f"CC entity {entity_id}: linked Companies House {co_reg}")

    if _is_registered(status):
        charity_type = (data.get('charity_type') or '').strip()
        evidence = f"Registered charity ({charity_type})"
        if activities_str:
            evidence += f" — {activities_str[:100]}"
        emit_signal(conn, entity_id, 'charity_venue',
                    strength=40, evidence=evidence, source='charity_commission')
