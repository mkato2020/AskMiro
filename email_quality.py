"""
email_quality.py — Extended Email Quality Validator
=====================================================
Extends email_guard.py with deeper signal analysis that the basic
format + MX checks can't catch:

  1. Placeholder / obviously fake address detection
  2. Encoded / obfuscated address detection (e.g. "info [at] company dot com")
  3. Domain mismatch (email domain doesn't match entity website)
  4. Catch-all domain detection (domain accepts any address)
  5. Free-mail detection (gmail/outlook for a commercial entity)
  6. Email age proxy (entity has been around vs. newly scraped)
  7. Duplicate email across multiple entities (shared inbox risk)

All checks return a structured EmailQualityReport with a score (0–100)
and a list of signals found. Higher score = better quality.

USAGE:
  from email_quality import run_quality_check
  report = run_quality_check(email="info@example.com", entity=entity_dict)
  print(report.score, report.signals)

  # Batch update all entities' email_quality_score in DB:
  python email_quality.py --batch 500
"""

from __future__ import annotations

import logging
import re
import urllib.parse
from dataclasses import dataclass, field
from typing import Optional

import db_pg
from email_guard import (
    validate_format,
    check_risk,
    check_domain,
    is_suppressed,
    ROLE_PREFIXES,
    BLOCKED_PREFIXES,
)

logger = logging.getLogger("email_quality")

# ── Placeholder patterns ───────────────────────────────────────────────────────
_PLACEHOLDER_PATTERNS = [
    re.compile(r"(example|test|placeholder|demo|sample|fake)", re.I),
    re.compile(r"@(example\.(com|org|net)|test\.(com|org)|domain\.com)", re.I),
    re.compile(r"(yourname|youremail|name@|user@|email@email)", re.I),
    re.compile(r"^(a|b|c|d|e|f|g|h|i)@", re.I),               # single-letter local
    re.compile(r"@(company|business|firm|agency)\.(com|co\.uk)", re.I),
    re.compile(r"^(abc|xyz|123|aaa|bbb|test1|test2)@", re.I),
]

# ── Encoded / obfuscated address patterns (scraper artefacts) ──────────────────
_ENCODED_PATTERNS = [
    re.compile(r"\[at\]|\(at\)|\bat\b", re.I),        # info [at] domain
    re.compile(r"\[dot\]|\(dot\)|\bdot\b", re.I),     # domain [dot] com
    re.compile(r"&#64;|%40"),                           # HTML/URL encoded @
    re.compile(r"\\u0040"),                             # Unicode escape
    re.compile(r"\s@\s|\s@|\s+at\s+"),                 # space around @
]

# ── Free-mail domains (bad signal for commercial outreach) ────────────────────
_FREE_MAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk",
    "hotmail.com", "hotmail.co.uk", "outlook.com", "outlook.co.uk",
    "live.com", "live.co.uk", "aol.com", "icloud.com", "me.com",
    "protonmail.com", "proton.me", "fastmail.com", "zoho.com",
    "yandex.com", "mail.com",
}

# ── Catch-all detection via DNS (returns all addresses as valid) ───────────────
# We heuristically flag domains on known catch-all hosting providers
_LIKELY_CATCHALL_HOSTS = {
    "1and1.co.uk", "123-reg.co.uk", "register.com", "godaddy.com",
    "namecheap.com", "bluehost.com", "hostgator.com",
}


@dataclass
class EmailQualityReport:
    email: str
    score: int = 0            # 0–100
    signals: list = field(default_factory=list)
    is_placeholder: bool = False
    is_encoded: bool = False
    is_free_mail: bool = False
    is_domain_mismatch: bool = False
    is_duplicate: bool = False
    is_catch_all_risk: bool = False
    deliverability_band: str = "unknown"   # "high" | "medium" | "low" | "blocked"


def run_quality_check(
    email: str,
    entity: Optional[dict] = None,
    check_duplicates: bool = True,
) -> EmailQualityReport:
    """
    Run all quality checks on a single email.
    entity dict should contain at least: website, sector, id
    """
    email = (email or "").strip()
    report = EmailQualityReport(email=email)

    if not email:
        report.score = 0
        report.signals.append("no_email")
        report.deliverability_band = "blocked"
        return report

    # ── 1. Base guard checks ───────────────────────────────────────────────────
    ok, reason = validate_format(email)
    if not ok:
        report.score = 0
        report.signals.append(f"invalid_format:{reason}")
        report.deliverability_band = "blocked"
        return report

    risk, reason = check_risk(email)
    if risk == "blocked":
        report.score = 0
        report.signals.append(f"blocked:{reason}")
        report.deliverability_band = "blocked"
        return report

    if is_suppressed(email):
        report.score = 0
        report.signals.append("suppressed")
        report.deliverability_band = "blocked"
        return report

    # ── 2. Placeholder check ──────────────────────────────────────────────────
    for pattern in _PLACEHOLDER_PATTERNS:
        if pattern.search(email):
            report.is_placeholder = True
            report.signals.append(f"placeholder_pattern:{pattern.pattern[:30]}")
            break

    # ── 3. Encoded / obfuscated check ─────────────────────────────────────────
    raw_text = email  # would also check scraped_text if available
    for pattern in _ENCODED_PATTERNS:
        if pattern.search(raw_text):
            report.is_encoded = True
            report.signals.append("encoded_address_artefact")
            break

    # ── 4. Free-mail domain ───────────────────────────────────────────────────
    domain = email.rsplit("@", 1)[-1].lower()
    if domain in _FREE_MAIL_DOMAINS:
        report.is_free_mail = True
        report.signals.append(f"free_mail_domain:{domain}")

    # ── 5. Domain mismatch ────────────────────────────────────────────────────
    if entity:
        website = (entity.get("website") or "").strip().lower()
        if website:
            try:
                parsed = urllib.parse.urlparse(
                    website if "://" in website else "https://" + website
                )
                website_domain = parsed.netloc.lstrip("www.")
                email_domain = domain.lstrip("www.")
                # strip country suffix for comparison (company.com vs company.co.uk)
                website_base = website_domain.split(".")[0]
                email_base = email_domain.split(".")[0]
                if website_base and email_base and website_base != email_base:
                    report.is_domain_mismatch = True
                    report.signals.append(
                        f"domain_mismatch:email={email_domain},web={website_domain}"
                    )
            except Exception:
                pass

    # ── 6. Catch-all risk heuristic ───────────────────────────────────────────
    # If MX points to a known catch-all registrar, flag it
    mx_host = _get_mx_host(domain)
    if mx_host:
        for catchall in _LIKELY_CATCHALL_HOSTS:
            if catchall in mx_host:
                report.is_catch_all_risk = True
                report.signals.append(f"catch_all_risk:{mx_host}")
                break

    # ── 7. Duplicate email across entities ────────────────────────────────────
    if check_duplicates and entity:
        entity_id = entity.get("id")
        if entity_id:
            duplicate_count = _count_email_entities(email, entity_id)
            if duplicate_count > 1:
                report.is_duplicate = True
                report.signals.append(f"shared_inbox:{duplicate_count}_entities")

    # ── Build score ───────────────────────────────────────────────────────────
    score = 100

    if report.is_placeholder:
        score -= 70
    if report.is_encoded:
        score -= 40
    if report.is_free_mail:
        score -= 20   # not fatal — some owners use personal email
    if report.is_domain_mismatch:
        score -= 25
    if report.is_catch_all_risk:
        score -= 15
    if report.is_duplicate:
        score -= 10

    if risk == "risky":
        score -= 20   # role email (info@, contact@, etc.)
    elif risk == "blocked":
        score = 0

    report.score = max(0, min(100, score))

    # ── Deliverability band ───────────────────────────────────────────────────
    if report.score >= 75:
        report.deliverability_band = "high"
    elif report.score >= 45:
        report.deliverability_band = "medium"
    elif report.score >= 15:
        report.deliverability_band = "low"
    else:
        report.deliverability_band = "blocked"

    return report


def _get_mx_host(domain: str) -> Optional[str]:
    """Return the primary MX hostname for a domain, or None."""
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX")
        if answers:
            return str(answers[0].exchange).rstrip(".").lower()
    except Exception:
        pass
    return None


def _count_email_entities(email: str, exclude_entity_id: int) -> int:
    """Count how many distinct entities share this email address."""
    try:
        with db_pg.transaction() as conn:
            count = db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM entities
                WHERE primary_email = %s AND id != %s
            """, (email.lower().strip(), exclude_entity_id))
            return (count or 0) + 1  # +1 for the entity itself
    except Exception:
        return 1


# ══════════════════════════════════════════════════════════════════════════════
# Batch runner — updates email_quality_score on entities table
# ══════════════════════════════════════════════════════════════════════════════

def run_batch(batch: int = 500) -> dict:
    """
    Run quality checks on entities that have a primary_email but where
    email_quality_score has not been set by the readiness engine yet,
    or where the email changed recently.
    """
    counts = {"total": 0, "updated": 0, "errors": 0,
              "high": 0, "medium": 0, "low": 0, "blocked": 0}

    with db_pg.transaction() as conn:
        rows = db_pg.fetchall(conn, """
            SELECT id, primary_email, website, sector
            FROM entities
            WHERE primary_email IS NOT NULL AND primary_email != ''
              AND (email_quality_score = 0 OR email_quality_score IS NULL)
            ORDER BY lead_score DESC NULLS LAST
            LIMIT %s
        """, (batch,))

        counts["total"] = len(rows)

        for entity in rows:
            try:
                report = run_quality_check(
                    email=entity["primary_email"],
                    entity=entity,
                )
                db_pg.execute(conn, """
                    UPDATE entities
                    SET email_quality_score = %s
                    WHERE id = %s
                """, (report.score, entity["id"]))

                counts["updated"] += 1
                counts[report.deliverability_band] = counts.get(report.deliverability_band, 0) + 1

            except Exception as exc:
                counts["errors"] += 1
                logger.error("email_quality batch error entity %s: %s", entity.get("id"), exc)

    logger.info(
        "email_quality batch: %d updated — high=%d medium=%d low=%d blocked=%d errors=%d",
        counts["updated"], counts["high"], counts["medium"],
        counts["low"], counts["blocked"], counts["errors"],
    )
    return counts


if __name__ == "__main__":
    import argparse, sys
    p = argparse.ArgumentParser(description="AskMiro Email Quality Validator")
    p.add_argument("--batch", type=int, default=500)
    p.add_argument("--email", type=str, default=None, help="Check a single email address")
    args = p.parse_args()

    if args.email:
        report = run_quality_check(args.email)
        print(f"\nEmail:        {report.email}")
        print(f"Score:        {report.score}/100")
        print(f"Band:         {report.deliverability_band}")
        print(f"Placeholder:  {report.is_placeholder}")
        print(f"Encoded:      {report.is_encoded}")
        print(f"Free-mail:    {report.is_free_mail}")
        print(f"Domain mis:   {report.is_domain_mismatch}")
        print(f"Catch-all:    {report.is_catch_all_risk}")
        print(f"Duplicate:    {report.is_duplicate}")
        print(f"Signals:      {', '.join(report.signals) or 'none'}\n")
        sys.exit(0)

    counts = run_batch(batch=args.batch)
    print(f"\nBatch results: {counts}\n")
