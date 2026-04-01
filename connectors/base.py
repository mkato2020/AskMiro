"""
connectors/base.py — BaseConnector class
All connectors inherit from this.
"""

from __future__ import annotations

import logging
import time
from typing import Generator

import requests

logger = logging.getLogger(__name__)


class BaseConnector:
    """Base class for all external data connectors."""

    source_name: str = 'unknown'
    base_url: str = ''
    request_delay: float = 0.5   # seconds between requests
    max_retries: int = 3

    def __init__(self, api_key: str = ''):
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'AskMiro/1.0 (Commercial Intelligence)'})

    def _get(self, url: str, **kwargs) -> dict | list | None:
        """GET with retry + backoff."""
        for attempt in range(self.max_retries):
            try:
                r = self.session.get(url, timeout=15, **kwargs)
                if r.status_code == 429:
                    wait = 5 * (attempt + 1)
                    logger.warning(f"Rate limited on {url} — waiting {wait}s")
                    time.sleep(wait)
                    continue
                r.raise_for_status()
                time.sleep(self.request_delay)
                return r.json()
            except requests.exceptions.RequestException as e:
                logger.error(f"Request failed ({attempt+1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)
        return None

    def _post(self, url: str, json_body: dict = None, **kwargs) -> dict | None:
        """POST with retry."""
        for attempt in range(self.max_retries):
            try:
                r = self.session.post(url, json=json_body, timeout=15, **kwargs)
                if r.status_code == 401:
                    self._refresh_auth()
                    continue
                r.raise_for_status()
                time.sleep(self.request_delay)
                return r.json()
            except requests.exceptions.RequestException as e:
                logger.error(f"POST failed ({attempt+1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)
        return None

    def _refresh_auth(self):
        """Override in OAuth connectors."""
        pass

    def paginate(self, first_url: str, next_key: str = 'nextPageUri',
                 items_key: str = 'locations') -> Generator[dict, None, None]:
        """Generic paginator: yields individual items across pages."""
        url = first_url
        while url:
            data = self._get(url)
            if data is None:
                break
            items = data.get(items_key, [])
            yield from items
            url = data.get(next_key)

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def run(self, conn, limit: int = None) -> int:
        raise NotImplementedError
