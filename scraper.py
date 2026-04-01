"""
scraper.py — AskMiro Lead Intelligence OS
Google Places API (New — v1) intake engine.

Uses places.googleapis.com/v1 — the New Places API.
Dual-write: every record saved to BOTH SQLite and live CSV simultaneously.
Crash-safe, resumable, retry-backed.
"""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

import csv
import os
import time
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from config import (
    GOOGLE_PLACES_API_KEY,
    SCRAPER_REQUEST_DELAY_SECONDS,
    SCRAPER_RETRY_BACKOFF_BASE,
    SCRAPER_SECTORS,
    SCRAPER_BOROUGHS,
    EXPORTS_DIR,
)
from models import RawLead
from database import upsert_raw_lead

logger = logging.getLogger(__name__)

# ── API endpoints ────────────────────────────────────────────────────────────
SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
DETAIL_URL = "https://places.googleapis.com/v1/places/{place_id}"

SEARCH_FIELDS = (
    "places.id,places.displayName,places.formattedAddress,places.location,"
    "places.primaryType,places.googleMapsUri,places.rating,"
    "places.userRatingCount,places.businessStatus,nextPageToken"
)

DETAIL_FIELDS = (
    "id,displayName,formattedAddress,location,primaryType,"
    "nationalPhoneNumber,websiteUri,googleMapsUri,rating,"
    "userRatingCount,businessStatus"
)

CSV_HEADERS = [
    "place_id", "name", "primary_type", "search_term", "borough",
    "address", "phone", "website", "google_maps_url",
    "rating", "user_rating_count", "business_status", "latitude", "longitude",
]

CSV_PATH = DATA_DIR / "askmiro_london_leads.csv"


# ── Resilient HTTP session ────────────────────────────────────────────────────

def _build_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=5, connect=5, read=5,
        backoff_factor=SCRAPER_RETRY_BACKOFF_BASE,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s

_session: Optional[requests.Session] = None

def _sess() -> requests.Session:
    global _session
    if _session is None:
        _session = _build_session()
    return _session


# ── CSV helpers ──────────────────────────────────────────────────────────────

def ensure_csv(path: Path = CSV_PATH) -> set:
    """Create CSV if needed; return set of already-saved place_ids."""
    if not path.exists():
        with open(path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(CSV_HEADERS)
        logger.info("Created CSV: %s", path)
        return set()

    seen = set()
    with open(path, "r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pid = row.get("place_id", "").strip()
            if pid:
                seen.add(pid)
    logger.info("CSV ready: %s | existing records: %d", path, len(seen))
    return seen


def _write_csv_row(path: Path, row: list) -> None:
    """Append one row and fsync — live save, crash-safe."""
    with open(path, "a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow(row)
        f.flush()
        os.fsync(f.fileno())


def _build_csv_row(place_id, details, fallback, search_term, borough):
    display = details.get("displayName") or fallback.get("displayName") or {}
    loc     = details.get("location")    or fallback.get("location")    or {}
    return [
        place_id,
        display.get("text", ""),
        details.get("primaryType")      or fallback.get("primaryType",      ""),
        search_term, borough,
        details.get("formattedAddress") or fallback.get("formattedAddress", ""),
        details.get("nationalPhoneNumber", ""),
        details.get("websiteUri",          ""),
        details.get("googleMapsUri")    or fallback.get("googleMapsUri",    ""),
        details.get("rating")           or fallback.get("rating",           ""),
        details.get("userRatingCount")  or fallback.get("userRatingCount",  ""),
        details.get("businessStatus")   or fallback.get("businessStatus",   ""),
        loc.get("latitude",  ""),
        loc.get("longitude", ""),
    ]


# ── API calls ────────────────────────────────────────────────────────────────

def _search(query: str) -> List[dict]:
    """Text search, up to 3 pages × 20 results = max 60 per query."""
    if not GOOGLE_PLACES_API_KEY:
        logger.error("GOOGLE_PLACES_API_KEY not set.")
        return []

    all_places: List[dict] = []
    page_token: Optional[str] = None

    for _ in range(3):
        payload = {"textQuery": query, "maxResultCount": 20}
        if page_token:
            payload["pageToken"] = page_token

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": SEARCH_FIELDS,
        }
        try:
            time.sleep(SCRAPER_REQUEST_DELAY_SECONDS)
            resp = _sess().post(SEARCH_URL, headers=headers, json=payload, timeout=30)
            if resp.status_code == 403:
                logger.error("API key rejected (403). Check billing and key restrictions.")
                return all_places
            if resp.status_code >= 400:
                logger.warning("Search HTTP %d for '%s': %s", resp.status_code, query, resp.text[:300])
                return all_places
            data = resp.json()
            places = data.get("places", [])
            all_places.extend(places)
            page_token = data.get("nextPageToken")
            if not page_token:
                break
            time.sleep(2.0)
        except requests.RequestException as e:
            logger.warning("Search error for '%s': %s", query, e)
            return all_places

    logger.debug("'%s' → %d places", query, len(all_places))
    return all_places


def _detail(place_id: str) -> dict:
    """Fetch full place detail record."""
    url = DETAIL_URL.format(place_id=place_id)
    headers = {
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": DETAIL_FIELDS,
    }
    try:
        time.sleep(0.25)
        resp = _sess().get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        logger.warning("Detail failed for %s: %s", place_id, e)
        return {}


# ── Core scrape ──────────────────────────────────────────────────────────────

def scrape_query(
    query:       str,
    sector:      str,
    borough:     str,
    csv_path:    Path = CSV_PATH,
    csv_seen:    set  = None,
) -> Tuple[int, int]:
    """
    Scrape one query. Dual-writes every new record to SQLite + CSV.
    Returns (db_inserts, csv_rows) counts.
    """
    places = _search(query)
    db_new  = 0
    csv_new = 0

    for place in places:
        place_id = place.get("id", "").strip()
        if not place_id:
            continue

        det = _detail(place_id)

        # ── SQLite write ─────────────────────────────────────────────────────
        display = (det.get("displayName") or place.get("displayName") or {})
        loc     = (det.get("location")    or place.get("location")    or {})
        raw = RawLead(
            place_id        = place_id,
            business_name   = display.get("text", ""),
            raw_sector      = det.get("primaryType") or place.get("primaryType", ""),
            address         = det.get("formattedAddress") or place.get("formattedAddress", ""),
            latitude        = loc.get("latitude"),
            longitude       = loc.get("longitude"),
            website         = det.get("websiteUri"),
            phone           = det.get("nationalPhoneNumber"),
            rating          = det.get("rating") or place.get("rating"),
            review_count    = det.get("userRatingCount") or place.get("userRatingCount"),
            google_maps_url = det.get("googleMapsUri") or place.get("googleMapsUri"),
            source_query    = query,
            source_system   = "google_places_v1",
            date_collected  = datetime.now(timezone.utc),
        )
        was_new_db = upsert_raw_lead(raw)
        if was_new_db:
            db_new += 1

        # ── CSV write (live, fsynced) ─────────────────────────────────────────
        if csv_seen is not None and place_id not in csv_seen:
            row = _build_csv_row(place_id, det, place, sector, borough)
            _write_csv_row(csv_path, row)
            csv_seen.add(place_id)
            csv_new += 1

        logger.info(
            "  %-45s | %-25s | db=%s csv=%s",
            raw.business_name[:45], borough,
            "NEW" if was_new_db else "dup",
            "NEW" if csv_new else "dup",
        )

    return db_new, csv_new


# ── Job matrix ───────────────────────────────────────────────────────────────

def build_job_matrix() -> List[tuple]:
    """Returns all (query, borough, sector) tuples for the full London sweep."""
    jobs = []
    for sector in SCRAPER_SECTORS:
        for borough in SCRAPER_BOROUGHS:
            query = f"{sector} in {borough}"
            jobs.append((query, borough, sector))
    return jobs
