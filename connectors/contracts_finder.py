"""
connectors/contracts_finder.py — Contracts Finder connector (V2 API)
Auth: None required for search/read (public API)
      OAuth 2.0 client credentials only needed for posting notices (buyer role)
Search: POST https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json
Docs:   https://www.contractsfinder.service.gov.uk/apidocs
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

import db_pg
import config
from connectors.base import BaseConnector
from entity_resolution import resolve_entity, _postcode_district
from signal_detection import emit_signal

logger = logging.getLogger(__name__)

CF_BASE       = "https://www.contractsfinder.service.gov.uk"
CF_SEARCH_URL = f"{CF_BASE}/api/rest/2/search_notices/json"
CF_NOTICE_URL = f"{CF_BASE}/api/rest/2/get_published_notice/json"

# FM-related keywords to find relevant contracts
# Kept short/specific — broad terms (e.g. "cleaning services" = 276k hits, 26s/page)
# are too slow. Date filter reduces hits dramatically and improves London density.
_FM_KEYWORDS = [
    "cleaning",
    "facilities management",
    "building cleaning",
    "office cleaning",
    "janitorial",
    "property maintenance",
]

# Only fetch contracts published from this date onwards (reduces result sets ~25x)
_PUBLISHED_FROM = "2023-01-01"

# ── Relevance filter ────────────────────────────────────────────────────────
# Titles that must contain at least one of these to be saved & signalled.
# Eliminates playground equipment, IT services, catering, etc.
_RELEVANT_TITLE_KEYWORDS = {
    'cleaning', 'clean', 'facilities', 'facility', 'janitorial',
    'soft services', 'fm ', 'housekeeping', 'caretaking', 'caretaker',
    'washroom', 'hygiene', 'grounds maintenance', 'window cleaning',
    'waste', 'porter', 'concierge',
}

def _is_relevant_contract(title: str) -> bool:
    """Return True only if the contract title is FM/cleaning-relevant."""
    t = title.lower()
    return any(kw in t for kw in _RELEVANT_TITLE_KEYWORDS)


class ContractsFinderConnector(BaseConnector):
    """
    Public read-only access — no credentials required for searching.
    Searches London FM/cleaning contracts and signals matched entities.
    """
    source_name   = 'contracts_finder'
    request_delay = 1.0

    def __init__(self, client_id: str = '', client_secret: str = ''):
        super().__init__()
        # Credentials kept for future buyer-role posting; not used for search
        self.client_id     = client_id
        self.client_secret = client_secret

    def is_configured(self) -> bool:
        return True  # search endpoint is public

    def _search_contracts(self, keyword: str, page: int = 1, size: int = 25) -> Optional[dict]:
        """
        POST search — uses session directly (not base _post) to allow a 30s timeout.
        Date filter (_PUBLISHED_FROM) reduces result sets from 270k → ~10k per keyword,
        cutting response times from 26s → 1-3s.
        """
        import requests as _requests
        body = {
            "SearchCriteria": {
                "keyword": keyword,
                "publishedDateFrom": _PUBLISHED_FROM,
            },
            "Size": size,
            "Page": page,
        }
        try:
            r = self.session.post(CF_SEARCH_URL, json=body, timeout=30)
            r.raise_for_status()
            time.sleep(self.request_delay)
            return r.json()
        except _requests.exceptions.RequestException as e:
            logger.warning(f"CF search({keyword!r} p{page}): {e}")
            return None

    def run(self, conn, limit: int = 500) -> int:
        """
        Search London FM/cleaning contracts via V2 API (no auth required).
        Cycles through FM_KEYWORDS, deduplicates by notice id, matches to entities,
        emits public_procurement signals.
        Returns count of notices processed.
        """
        run_id = db_pg.fetchval(conn, """
            INSERT INTO ingest_runs (source, notes)
            VALUES ('contracts_finder', 'Contracts Finder V2 London FM notices')
            RETURNING id
        """)
        conn.commit()

        seen_ids        = set()
        total_processed = 0
        total_matched   = 0

        for keyword in _FM_KEYWORDS:
            if total_processed >= limit:
                break
            page = 1
            empty_pages = 0        # consecutive pages with zero London results
            kw_london   = 0        # London records found for this keyword

            while total_processed < limit:
                data = self._search_contracts(keyword=keyword, page=page)
                if data is None:
                    break

                # V2: notices are wrapped — noticeList[i].item
                raw_list = data.get('noticeList', [])
                if not raw_list:
                    break

                page_london = 0
                for wrapper in raw_list:
                    if total_processed >= limit:
                        break

                    notice = wrapper.get('item', wrapper)  # unwrap
                    notice_id = str(notice.get('id') or notice.get('noticeIdentifier') or '')
                    if not notice_id or notice_id in seen_ids:
                        continue

                    # Post-filter: London — check postcode OR region field
                    # Many London contracts have empty postcode but region="London"
                    postcode   = (notice.get('postcode') or '').strip()
                    region_txt = (notice.get('regionText') or notice.get('region') or '')
                    is_london  = (
                        config.is_london_postcode(postcode)
                        or 'London' in region_txt
                    )
                    if not is_london:
                        continue

                    seen_ids.add(notice_id)
                    page_london   += 1
                    kw_london     += 1

                    # Store raw
                    db_pg.execute(conn, """
                        INSERT INTO raw_source_records (source, source_record_id, ingest_run_id, payload)
                        VALUES ('contracts_finder', %s, %s, %s)
                        ON CONFLICT (source, source_record_id) DO UPDATE SET
                            payload = EXCLUDED.payload, fetched_at = NOW()
                    """, (notice_id, run_id, json.dumps(notice)))

                    total_processed += 1

                    # V2 field names
                    org_name      = (notice.get('organisationName') or '').strip()
                    awarded_value = notice.get('awardedValue') or 0
                    awarded_sme   = notice.get('awardedToSme', False)
                    title         = notice.get('title') or 'Contract'

                    # ── Relevance filter: skip non-FM contracts (e.g. playground
                    #    equipment, IT, catering) before saving or matching ──
                    if not _is_relevant_contract(title):
                        total_processed -= 1  # don't count filtered noise
                        seen_ids.discard(notice_id)
                        continue

                    if not org_name:
                        continue

                    match = resolve_entity(
                        conn,
                        canonical_name=org_name,
                        normalized_name=org_name.lower(),
                        postcode=postcode,
                    )

                    if match:
                        entity_id, confidence = match
                        sme_tag      = ' (SME)' if awarded_sme else ''
                        contract_len = int(notice.get('contractDuration') or 12)
                        monthly_val  = int(float(awarded_value) / max(1, contract_len)) if awarded_value else 0
                        evidence     = (
                            f"{title}{sme_tag} — "
                            f"£{float(awarded_value):,.0f} total"
                            + (f" (~£{monthly_val:,}/mo over {contract_len}m)" if monthly_val else "")
                            + f" — Published: {notice.get('publishedDate', '')}"
                        )
                        emit_signal(conn, entity_id, 'public_procurement',
                                    strength=95, evidence=evidence, source='contracts_finder')
                        total_matched += 1

                conn.commit()

                # Bail out if London density has dried up (3 consecutive empty pages)
                if page_london == 0:
                    empty_pages += 1
                    if empty_pages >= 3:
                        logger.info(f"CF: {keyword!r} — 3 empty pages, moving to next keyword")
                        break
                else:
                    empty_pages = 0

                if len(raw_list) < 25:
                    break  # last page for this keyword
                page += 1
                time.sleep(self.request_delay)

            logger.info(f"CF keyword {keyword!r}: p{page}, {kw_london} London records, total={total_processed}")

        db_pg.execute(conn, "UPDATE ingest_runs SET finished_at = NOW(), record_count = %s WHERE id = %s",
                      (total_processed, run_id))
        conn.commit()

        logger.info(f"Contracts Finder done: {total_processed} notices, {total_matched} matched")
        return total_processed
