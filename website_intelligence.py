"""
website_intelligence.py — AskMiro Lead Intelligence OS
Fetches and analyses business website content.
Adds enrichment signals: business summary, premium status, pain points.
"""

import logging
import re
import time
from typing import Optional, Tuple

import requests
from bs4 import BeautifulSoup

from ai_client import call_ai
from ai_prompts import SYSTEM_WEBSITE, build_website_prompt
from database import update_website_intelligence, db_connection

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; AskMiroBot/1.0; "
        "+https://www.askmiro.com)"
    ),
    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
}
_FETCH_TIMEOUT    = 10
_MAX_TEXT_CHARS   = 3000
_REQUEST_DELAY    = 1.0   # seconds between fetches — respectful crawling


# ── Web fetch ────────────────────────────────────────────────────────────────

def fetch_website_text(url: str) -> Optional[str]:
    """
    Fetch a URL and extract clean text content.
    Returns None on any failure.
    Caps output at _MAX_TEXT_CHARS for token efficiency.
    """
    try:
        resp = requests.get(
            url, headers=_HEADERS, timeout=_FETCH_TIMEOUT,
            allow_redirects=True
        )
        resp.raise_for_status()

        ct = resp.headers.get("content-type", "")
        if "text/html" not in ct and "application/xhtml" not in ct:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove boilerplate noise
        for tag in soup(["script", "style", "nav", "footer",
                          "form", "iframe", "noscript", "header"]):
            tag.decompose()

        # Collect meaningful text blocks
        blocks = []
        for tag in soup.find_all(["h1", "h2", "h3", "p", "li", "span"]):
            text = tag.get_text(separator=" ", strip=True)
            if len(text) > 30:
                blocks.append(text)

        raw_text = " ".join(blocks)
        # Normalise whitespace
        raw_text = re.sub(r'\s+', ' ', raw_text).strip()
        return raw_text[:_MAX_TEXT_CHARS] if raw_text else None

    except requests.exceptions.Timeout:
        logger.debug("Timeout fetching %s", url)
        return None
    except requests.exceptions.SSLError:
        logger.debug("SSL error on %s — retrying without verification", url)
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=_FETCH_TIMEOUT,
                                verify=False, allow_redirects=True)
            soup = BeautifulSoup(resp.text, "html.parser")
            text = soup.get_text(separator=" ", strip=True)
            text = re.sub(r'\s+', ' ', text).strip()
            return text[:_MAX_TEXT_CHARS] if text else None
        except Exception:
            return None
    except Exception as e:
        logger.debug("Fetch error for %s: %s", url, e)
        return None


# ── AI analysis ──────────────────────────────────────────────────────────────

def analyse_website(business_name: str, website_text: str) -> dict:
    """Run AI analysis on extracted website text. Returns enrichment fields."""
    prompt   = build_website_prompt(business_name, website_text)
    response = call_ai(
        system_prompt = SYSTEM_WEBSITE,
        user_prompt   = prompt,
        prompt_type   = "website",
        max_tokens    = 500,
    )

    data = response.as_json()
    if not data:
        return {
            "summary":      "Unable to analyse website.",
            "business_type": None,
            "pain_points":  None,
        }

    return {
        "summary":      data.get("summary", ""),
        "business_type": data.get("business_type"),
        "pain_points":  data.get("pain_points", ""),
    }


# ── Single lead processor ────────────────────────────────────────────────────

def process_website_for_lead(place_id: str, business_name: str, website: str) -> bool:
    """
    Fetch and analyse website for one lead.
    Writes results to DB. Returns True on success.
    """
    text = fetch_website_text(website)
    if not text:
        logger.debug("No usable text from %s", website)
        update_website_intelligence(
            place_id   = place_id,
            summary    = "Website present but content could not be extracted.",
            biz_type   = None,
            pain_points = None,
        )
        return False

    analysis = analyse_website(business_name, text)
    update_website_intelligence(
        place_id    = place_id,
        summary     = analysis["summary"],
        biz_type    = analysis["business_type"],
        pain_points = analysis["pain_points"],
    )
    logger.debug("Website intelligence stored for %s", business_name)
    return True


# ── Batch runner ─────────────────────────────────────────────────────────────

def run_website_intelligence_batch(limit: int = 200) -> int:
    """
    Process website intelligence for leads that have a website but no summary yet.
    Returns count processed.
    """
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT place_id, business_name, website
               FROM lead_records
               WHERE website IS NOT NULL
                 AND website_summary IS NULL
                 AND has_website = 1
               ORDER BY priority_score DESC
               LIMIT ?""",
            (limit,)
        ).fetchall()

    processed = 0
    for row in rows:
        time.sleep(_REQUEST_DELAY)
        process_website_for_lead(
            place_id      = row["place_id"],
            business_name = row["business_name"],
            website       = row["website"],
        )
        processed += 1
        if processed % 25 == 0:
            logger.info("Website intelligence progress: %d/%d", processed, len(rows))

    logger.info("Website intelligence batch complete. %d processed.", processed)
    return processed
