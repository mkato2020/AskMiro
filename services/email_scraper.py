"""
services/email_scraper.py — AskMiro Lead Email Enrichment
==========================================================
Scrapes business websites to find contact email addresses.

Strategy (in order):
  1. Extract emails from homepage mailto: links
  2. Try /contact, /contact-us, /about, /about-us pages
  3. Regex-scan page text for email patterns
  4. Score and rank found emails (prefer info@, contact@, hello@)
  5. Fallback: construct info@domain.com

Cost: £0 — no external APIs, pure web scraping.
Rate: 0.5s delay between requests, 8s timeout per page.
"""

from __future__ import annotations

import logging
import re
import time
import urllib.parse
from typing import Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── CONFIG ────────────────────────────────────────────────────
REQUEST_DELAY   = 0.4    # seconds between requests (be polite)
TIMEOUT         = 10     # seconds per HTTP request
MAX_PAGES       = 5      # max pages to try per domain

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; AskMiroBot/1.0; +https://www.askmiro.com/bot)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}

# Contact page slugs to try (in priority order)
CONTACT_SLUGS = [
    "/contact",
    "/contact-us",
    "/contact_us",
    "/contactus",
    "/get-in-touch",
    "/reach-us",
    "/enquiries",
    "/enquire",
    "/about",
    "/about-us",
    "/about-us/contact",
    "/company",
    "/our-company",
    "/team",
    "/our-team",
    "/staff",
    "/meet-the-team",
    "/hello",
    "/info",
    "/find-us",
]

# Email prefixes ranked by desirability for B2B outreach
PREFERRED_PREFIXES = [
    "info", "hello", "contact", "enquiries", "enquiry",
    "office", "admin", "sales", "facilities", "fm",
    "management", "manager", "reception", "general",
]

# Emails / domains to discard
BLACKLIST_PATTERNS = re.compile(
    r"(noreply|no-reply|donotreply|example|test@|"
    r"sentry|support@sentry|privacy@|legal@|press@|"
    r"@google|@facebook|@twitter|@instagram|@linkedin|"
    r"@wix|@squarespace|@wordpress|@shopify|"
    r"\.png|\.jpg|\.gif|\.svg|\.webp)",
    re.IGNORECASE,
)

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)


# ══════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════

def find_email(website: str, place_id: str = "") -> dict:
    """
    Find the best contact email for a business given its website URL.

    Returns:
        {
            "email":      str | None,   # best email found (or constructed)
            "source":     str,          # "scraped" | "constructed" | "none"
            "confidence": str,          # "high" | "medium" | "low"
            "all_found":  list[str],    # all emails discovered
        }
    """
    domain = _extract_domain(website)
    if not domain:
        return {"email": None, "source": "none", "confidence": "none", "all_found": []}

    all_emails: list[str] = []
    base_url = _base_url(website)

    # ── Try homepage first ────────────────────────────────────
    homepage_emails = _scrape_page(base_url)
    all_emails.extend(homepage_emails)
    time.sleep(REQUEST_DELAY)

    # ── Try contact/about pages if homepage didn't yield enough ─
    if len(_filter_emails(all_emails, domain)) < 1:
        for slug in CONTACT_SLUGS[:MAX_PAGES]:
            page_emails = _scrape_page(base_url + slug)
            all_emails.extend(page_emails)
            time.sleep(REQUEST_DELAY)
            if _filter_emails(all_emails, domain):
                break  # found one — stop

    # ── Pick the best email ────────────────────────────────────
    domain_emails = _filter_emails(all_emails, domain)
    any_emails    = _filter_emails(all_emails, None)

    if domain_emails:
        best   = _rank_emails(domain_emails)[0]
        source = "scraped"
        conf   = "high"
    elif any_emails:
        best   = _rank_emails(any_emails)[0]
        source = "scraped"
        conf   = "medium"
    else:
        # Construct generic info@ address as last resort
        best   = "info@" + domain
        source = "constructed"
        conf   = "low"

    logger.debug("email_scraper: %s → %s (%s/%s)", place_id or website, best, source, conf)

    return {
        "email":      best,
        "source":     source,
        "confidence": conf,
        "all_found":  list(set(all_emails)),
    }


def enrich_leads_batch(
    conn,
    min_score:  int = 65,
    limit:      int = 100,
    min_conf:   str = "low",    # "high" | "medium" | "low"
    overwrite:  bool = False,
) -> dict:
    """
    Enrich a batch of leads from the DB that have websites but no email.
    Updates lead_records.email in place.

    Args:
        conn:       sqlite3 connection (from db_connection())
        min_score:  only enrich leads above this score
        limit:      max leads to process per run
        min_conf:   minimum confidence level to save ("high"/"medium"/"low")
        overwrite:  if True, re-enrich leads that already have an email

    Returns summary dict.
    """
    where = "COALESCE(lr.email,'') = ''" if not overwrite else "1=1"

    rows = conn.execute(
        f"""
        SELECT lr.place_id, lr.business_name, lr.website, lr.priority_score
        FROM lead_records lr
        LEFT JOIN crm_handoffs ch ON lr.place_id = ch.place_id
        WHERE lr.priority_score >= ?
          AND lr.ai_is_cleaning_target = 1
          AND COALESCE(lr.website, '') != ''
          AND {where}
        ORDER BY lr.priority_score DESC
        LIMIT ?
        """,
        (min_score, limit),
    ).fetchall()

    enriched = skipped = failed = 0
    conf_min_rank = {"high": 0, "medium": 1, "low": 2}.get(min_conf, 2)

    for row in rows:
        place_id = row["place_id"]
        website  = row["website"]
        name     = row["business_name"]

        try:
            result = find_email(website, place_id)

            if result["email"] is None:
                skipped += 1
                continue

            conf_rank = {"high": 0, "medium": 1, "low": 2}.get(result["confidence"], 2)
            if conf_rank > conf_min_rank:
                skipped += 1
                continue

            conn.execute(
                "UPDATE lead_records SET email=?, updated_at=datetime('now') WHERE place_id=?",
                (result["email"], place_id),
            )
            enriched += 1
            logger.info(
                "Enriched %s → %s (%s/%s)",
                name[:40], result["email"], result["source"], result["confidence"],
            )

        except Exception as exc:
            logger.warning("email_scraper failed for %s: %s", place_id, exc)
            failed += 1

    conn.commit()

    logger.info(
        "enrich_leads_batch: enriched=%d skipped=%d failed=%d / %d processed",
        enriched, skipped, failed, len(rows),
    )
    return {
        "processed": len(rows),
        "enriched":  enriched,
        "skipped":   skipped,
        "failed":    failed,
    }


# ══════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════

def _scrape_page(url: str) -> list[str]:
    """Fetch a page and return all email addresses found in it."""
    try:
        resp = requests.get(
            url,
            headers=HEADERS,
            timeout=TIMEOUT,
            verify=False,          # some UK SME sites have dodgy certs
            allow_redirects=True,
        )
        if resp.status_code != 200:
            return []

        # Try BeautifulSoup mailto: links first (most reliable)
        soup  = BeautifulSoup(resp.text, "lxml")
        found = []

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.lower().startswith("mailto:"):
                email = href[7:].split("?")[0].strip().lower()
                if email and "@" in email:
                    found.append(email)

        # Also regex-scan the visible text
        text_emails = EMAIL_RE.findall(resp.text)
        found.extend(e.lower() for e in text_emails)

        return list(set(found))

    except Exception:
        return []


def _filter_emails(emails: list[str], domain: Optional[str]) -> list[str]:
    """Remove blacklisted emails; optionally restrict to a specific domain."""
    out = []
    for e in emails:
        e = e.strip().lower()
        if not e or "@" not in e:
            continue
        if BLACKLIST_PATTERNS.search(e):
            continue
        if domain and not e.endswith("@" + domain) and not e.endswith("." + domain):
            continue
        out.append(e)
    return list(set(out))


def _rank_emails(emails: list[str]) -> list[str]:
    """Sort emails: preferred prefixes first, then alphabetically."""
    def _score(email: str) -> int:
        prefix = email.split("@")[0].lower()
        try:
            return PREFERRED_PREFIXES.index(prefix)
        except ValueError:
            return len(PREFERRED_PREFIXES)

    return sorted(set(emails), key=_score)


def _extract_domain(website: str) -> Optional[str]:
    """Return bare domain (e.g. 'example.co.uk') from any URL."""
    try:
        parsed = urllib.parse.urlparse(website if "://" in website else "https://" + website)
        host = parsed.netloc or parsed.path
        # Strip www. and port
        host = re.sub(r"^www\.", "", host).split(":")[0].split("/")[0].lower().strip()
        if "." not in host or len(host) < 4:
            return None
        # Reject generic platforms
        bad = ("google.", "facebook.", "instagram.", "linkedin.", "rightmove.",
               "zoopla.", "yell.", "yelp.", "trustpilot.", "tripadvisor.")
        if any(b in host for b in bad):
            return None
        return host
    except Exception:
        return None


def _base_url(website: str) -> str:
    """Return scheme + netloc only (e.g. 'https://example.co.uk')."""
    try:
        parsed = urllib.parse.urlparse(website if "://" in website else "https://" + website)
        scheme = parsed.scheme or "https"
        host   = parsed.netloc or parsed.path.split("/")[0]
        return f"{scheme}://{host}"
    except Exception:
        return website


# Silence urllib3 SSL warnings (expected for UK SME sites)
try:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except Exception:
    pass
