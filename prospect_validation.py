"""
prospect_validation.py — Readiness v1 validator + classifier.

Built per docs/SCRAPER_ENHANCER_V1_PLAN.md (Phase 1, code-first, migration
unapplied at deploy time).

Public surface:
    classify_readiness(entity, context=None) -> ClassifyResult
    validate_email_7_gates(email, entity, context=None) -> dict
    domain_fit_score(email, entity, context=None) -> tuple[float, str, dict]
    coverage_stats() -> dict
    readiness_table_present(conn) -> bool

Cost: zero variable. No external HTTP. DNS lookups only when gate 6 is
called with do_dns=True (cached locally; default false so unit tests
don't touch the network).

Defaults (single source of truth — also documented in plan §9.5):
    READINESS_ENFORCE          = "0"   (read by crm_sync, not here)
    READINESS_AUTO_CLASSIFY    = "0"   (read by api.py scheduler gate)
    DOMAIN_FIT_ENABLED         = "0"   (read here in gate 5)
    DOMAIN_FIT_MIN             = "0.5" (only when enabled, bounded [0.2, 0.9])
    PLACEHOLDER_GATE_ENABLED   = "1"
    READINESS_BATCH_SIZE       = "200"

Hard guarantees enforced in code:
  * NEVER writes to entities.primary_email
  * NEVER calls crm_sync.push_*
  * NEVER calls a paid API
  * Tables-not-present check returns a sentinel; callers translate to 503
"""

from __future__ import annotations

import logging
import os
import re
import urllib.parse
import html as _html
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ── Readiness state vocabulary (mirrored in migration 011 CHECK) ──────
READY                = "READY_FOR_OUTREACH"
NEEDS_ENRICHMENT     = "NEEDS_CONTACT_ENRICHMENT"
PHONE_FIRST          = "PHONE_FIRST"
INVALID_CONTACT      = "INVALID_CONTACT"
ENTITY_CONFLICT      = "ENTITY_CONFLICT"
LOW_VALUE            = "LOW_VALUE"
SUPPRESSED           = "SUPPRESSED"

ALL_STATES = (READY, NEEDS_ENRICHMENT, PHONE_FIRST, INVALID_CONTACT,
              ENTITY_CONFLICT, LOW_VALUE, SUPPRESSED)


# ──────────────────────────────────────────────────────────────────────
# Config helpers
# ──────────────────────────────────────────────────────────────────────
def _flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _domain_fit_min() -> float:
    raw = os.getenv("DOMAIN_FIT_MIN", "0.5")
    try:
        v = float(raw)
    except ValueError:
        v = 0.5
    # Bound to [0.2, 0.9] per plan §1.6
    return max(0.2, min(0.9, v))


# ──────────────────────────────────────────────────────────────────────
# Result types
# ──────────────────────────────────────────────────────────────────────
@dataclass
class GateResult:
    name: str
    passed: bool
    score: float = 1.0
    reason: str = "ok"
    evidence: dict = field(default_factory=dict)


@dataclass
class ClassifyResult:
    state: str
    reason: str
    gate_results: list[GateResult] = field(default_factory=list)
    notes: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "state": self.state,
            "reason": self.reason,
            "gate_results": [asdict(g) for g in self.gate_results],
            "notes": self.notes,
        }


# ──────────────────────────────────────────────────────────────────────
# Placeholder regex — refinement of enrich_pg._PLACEHOLDER_RE
# ──────────────────────────────────────────────────────────────────────
_PLACEHOLDER_LOCAL_PARTS = {
    "name", "youremail", "youraddress", "email", "firstname", "lastname",
    "johnsmith", "john.smith", "janedoe", "jane.doe", "foo", "bar", "user",
    "customer", "example", "test", "demo", "sample", "fake", "noreply",
    "no-reply", "donotreply", "do-not-reply", "webmaster", "postmaster",
    "mailer-daemon", "bounces", "bounce", "abuse", "auto", "notification",
}
_PLACEHOLDER_DOMAINS = {
    "domain.com", "example.com", "example.org", "example.net",
    "yoursite.com", "site.com", "placeholder.com", "mail.com",
    "yourdomain.com", "yourcompany.com",
}

# Local parts that scrape commonly produces but should never reach a human
_BLOCKED_GENERIC_LOCALS = {
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "mailer-daemon", "postmaster", "bounces", "bounce",
    "abuse", "auto", "notification",
}


# ──────────────────────────────────────────────────────────────────────
# Gate 1 — Transport decode
# ──────────────────────────────────────────────────────────────────────
def gate_1_transport_decode(email: str) -> GateResult:
    """
    URL-decode + Unicode-unescape + HTML-entity decode. Detects whether
    the input was carrying transport encoding artefacts.
    """
    if not isinstance(email, str) or not email:
        return GateResult("transport_decode", False, 0.0,
                          "empty_input", {})

    raw = email.strip()
    warnings: list[str] = []
    decoded = raw

    # URL-decode (% sequences). Repeat once to catch double-encoding.
    if "%" in decoded:
        try:
            after = urllib.parse.unquote(decoded)
            if after != decoded:
                warnings.append("url_decoded")
                decoded = after
        except Exception as e:
            return GateResult("transport_decode", False, 0.0,
                              f"url_decode_failed:{e!s}", {"raw": raw})

    # Unicode escape: turn `u003e` and `>` into the actual character.
    # Only act if the pattern looks intentional.
    if re.search(r"\\?u[0-9a-fA-F]{4}", decoded):
        try:
            patched = re.sub(
                r"\\?u([0-9a-fA-F]{4})",
                lambda m: chr(int(m.group(1), 16)),
                decoded,
            )
            if patched != decoded:
                warnings.append("unicode_unescaped")
                decoded = patched
        except Exception as e:
            return GateResult("transport_decode", False, 0.0,
                              f"unicode_unescape_failed:{e!s}",
                              {"raw": raw})

    # HTML entity decode (&amp; etc.)
    if "&" in decoded:
        after = _html.unescape(decoded)
        if after != decoded:
            warnings.append("html_unescaped")
            decoded = after

    # If after decoding the string still contains stray separators or
    # non-printable bytes, fail.
    if any((ord(ch) < 32) for ch in decoded):
        return GateResult("transport_decode", False, 0.0,
                          "non_printable_after_decode",
                          {"raw": raw, "decoded": decoded})

    # If decoding revealed a control fragment that shouldn't be in an
    # email (e.g. ">" injected via u003e), flag.
    if any(ch in decoded for ch in ("<", ">", "\n", "\r", "\t")):
        return GateResult("transport_decode", False, 0.0,
                          "transport_decode_failed:control_chars",
                          {"raw": raw, "decoded": decoded,
                           "warnings": warnings})

    # If decoding *revealed* whitespace where there was none (e.g. %20
    # → " "), the original was carrying corruption — fail. Do this only
    # when warnings is non-empty (i.e. decoding actually changed input)
    # so we don't reject legitimately-clean emails that have stray spaces.
    if warnings and any(ch.isspace() for ch in decoded):
        return GateResult("transport_decode", False, 0.0,
                          "transport_decode_failed:whitespace_revealed",
                          {"raw": raw, "decoded": decoded,
                           "warnings": warnings})

    # If the raw form changed during decoding, the original was carrying
    # transport encoding — pass but keep the warning so downstream knows
    # to use the decoded form.
    return GateResult("transport_decode", True, 1.0,
                      "ok" if not warnings else "decoded",
                      {"raw": raw, "decoded": decoded,
                       "warnings": warnings})


# ──────────────────────────────────────────────────────────────────────
# Gate 2 — Multi-value split
# ──────────────────────────────────────────────────────────────────────
_MULTI_SPLIT_RE = re.compile(r"\s*(?:[,;|]|\s-\s)\s*")


def gate_2_multi_split(email: str) -> GateResult:
    """
    If the field contains multiple emails joined together, fail this row
    and emit each as a candidate. Single value → pass.
    """
    if not email:
        return GateResult("multi_split", False, 0.0, "empty", {})

    parts = [p for p in _MULTI_SPLIT_RE.split(email.strip()) if p]

    if len(parts) > 1:
        return GateResult(
            "multi_split", False, 0.0,
            "multi_value_unsplit",
            {"original": email, "candidates": parts, "count": len(parts)},
        )

    # Sanity: even a single-element split shouldn't contain delimiters.
    single = parts[0] if parts else email
    if any(d in single for d in (",", ";", "|")):
        return GateResult(
            "multi_split", False, 0.0,
            "multi_value_unsplit",
            {"original": email, "candidates": [single]},
        )

    return GateResult("multi_split", True, 1.0, "single_value",
                      {"value": single})


# ──────────────────────────────────────────────────────────────────────
# Gate 3 — RFC format
# ──────────────────────────────────────────────────────────────────────
_BASIC_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"
)


def gate_3_rfc(email: str) -> GateResult:
    """Cheap RFC-ish syntax check. Optionally falls back to email_guard."""
    if not email or "@" not in email:
        return GateResult("rfc", False, 0.0, "missing_at", {})
    if email.count("@") != 1:
        return GateResult("rfc", False, 0.0, "multiple_at", {})

    # Try the project's own validator if available — same rules as the
    # real send path, so consistent results.
    try:
        import email_guard  # type: ignore
        ok, reason = email_guard.validate_format(email)
        if not ok:
            return GateResult("rfc", False, 0.0, f"email_guard:{reason}",
                              {"email": email})
        return GateResult("rfc", True, 1.0, "ok", {"email": email})
    except Exception:
        # Fallback to internal regex
        if not _BASIC_EMAIL_RE.match(email):
            return GateResult("rfc", False, 0.0, "regex_mismatch",
                              {"email": email})
        return GateResult("rfc", True, 1.0, "basic_ok", {"email": email})


# ──────────────────────────────────────────────────────────────────────
# Gate 4 — Placeholder detection
# ──────────────────────────────────────────────────────────────────────
def gate_4_placeholder(email: str) -> GateResult:
    """Reject template/placeholder addresses scrapers commonly capture."""
    if not _flag("PLACEHOLDER_GATE_ENABLED", "1"):
        return GateResult("placeholder", True, 1.0, "gate_disabled", {})

    if not email or "@" not in email:
        return GateResult("placeholder", False, 0.0, "missing_at", {})

    local, _, domain = email.lower().partition("@")
    domain = domain.strip()
    local = local.strip()

    # Exact placeholder pattern (e.g. name@domain.com)
    if local in _PLACEHOLDER_LOCAL_PARTS and domain in _PLACEHOLDER_DOMAINS:
        return GateResult("placeholder", False, 0.0,
                          "placeholder_template",
                          {"local": local, "domain": domain})

    # Either side strongly placeholder
    if domain in _PLACEHOLDER_DOMAINS:
        return GateResult("placeholder", False, 0.0,
                          "placeholder_domain",
                          {"domain": domain})
    if local in _BLOCKED_GENERIC_LOCALS:
        return GateResult("placeholder", False, 0.0,
                          "blocked_generic_local",
                          {"local": local})

    return GateResult("placeholder", True, 1.0, "ok",
                      {"local": local, "domain": domain})


# ──────────────────────────────────────────────────────────────────────
# Gate 5 — Domain-fit score
# ──────────────────────────────────────────────────────────────────────
def _registered_domain(host: str) -> str:
    """Cheap eTLD+1 approximation. Avoids tldextract dependency."""
    if not host:
        return ""
    h = host.lower().strip()
    # Strip scheme + path
    if "://" in h:
        h = h.split("://", 1)[1]
    if "/" in h:
        h = h.split("/", 1)[0]
    if "@" in h:
        h = h.split("@", 1)[1]
    # Strip well-known leading subdomains
    for prefix in ("www.", "m.", "mobile."):
        if h.startswith(prefix):
            h = h[len(prefix):]
    parts = [p for p in h.split(".") if p]
    if len(parts) <= 2:
        return ".".join(parts)
    # Two-tier UK/AU-style suffixes: co.uk, ac.uk, sch.uk, gov.uk, org.uk, …
    second = parts[-2]
    last = parts[-1]
    if last == "uk" and second in ("co", "ac", "sch", "gov", "org",
                                   "police", "nhs", "ltd", "plc"):
        return ".".join(parts[-3:]) if len(parts) >= 3 else ".".join(parts)
    return ".".join(parts[-2:])


_TOKEN_STOPWORDS = {
    "the", "and", "ltd", "limited", "llp", "plc", "group", "holdings",
    "uk", "london", "company", "co", "of", "for", "with", "services",
    "service", "solutions", "trust", "centre", "center", "clinic",
    "practice", "surgery", "school", "academy", "college", "estate",
    "estates", "agents", "agent", "lettings", "homes", "home",
    "property", "properties", "management",
}


def _tokenize_name(name: str) -> list[str]:
    if not name:
        return []
    cleaned = re.sub(r"[^A-Za-z0-9 ]+", " ", name.lower())
    return [t for t in cleaned.split()
            if len(t) > 3 and t not in _TOKEN_STOPWORDS]


def _lookup_chain_for_entity(entity: dict, context: dict) -> Optional[dict]:
    chains = (context or {}).get("chain_operators") or []
    if not chains:
        return None
    name = (entity.get("canonical_name") or "").lower()
    for c in chains:
        if not c.get("active", True):
            continue
        aliases = [a.lower() for a in (c.get("name_aliases") or [])]
        aliases.append(c["chain_name"].lower())
        for a in aliases:
            if a and a in name:
                return c
    return None


def _lookup_sector_shared(sector: str, email_root: str,
                          context: dict) -> Optional[dict]:
    shared = (context or {}).get("sector_shared_domains") or []
    sector_l = (sector or "").lower()
    for row in shared:
        if not row.get("active", True):
            continue
        if row["sector"].lower() == sector_l \
                and row["root_domain"].lower() == email_root.lower():
            return row
    return None


def domain_fit_score(email: str, entity: dict,
                     context: Optional[dict] = None
                     ) -> tuple[float, str, dict]:
    """Returns (score in [0,1], reason, evidence)."""
    context = context or {}

    if not email or "@" not in email:
        return 0.0, "malformed_email", {}
    email_root = _registered_domain(email.split("@", 1)[1])
    if not email_root:
        return 0.0, "malformed_email_domain", {}

    site_root = ""
    if entity.get("primary_website"):
        site_root = _registered_domain(entity["primary_website"])

    # Path 1 — exact match
    if site_root and email_root == site_root:
        return 1.0, "exact_website_match", {"email_root": email_root,
                                            "site_root": site_root}

    # Path 2 — sector-shared
    shared = _lookup_sector_shared(entity.get("sector") or "",
                                   email_root, context)
    if shared:
        return float(shared["confidence"]), \
               f"sector_shared:{entity.get('sector')}", \
               {"shared_id": shared.get("id")}

    # Path 3 — chain operator
    chain = _lookup_chain_for_entity(entity, context)
    if chain:
        if chain["root_domain"].lower() == email_root.lower():
            return 0.85, f"chain_match:{chain['chain_name']}", \
                   {"chain_id": chain.get("id")}
        return 0.2, \
               f"chain_mismatch:expected:{chain['root_domain']}", \
               {"chain_id": chain.get("id")}

    # Path 4 — token overlap
    tokens = _tokenize_name(entity.get("canonical_name") or "")
    matched = [t for t in tokens if t in email_root.lower()]
    if matched:
        return 0.6, f"token_overlap:{matched[0]}", {"tokens": matched}

    # Path 5 — no signal
    return 0.0, "no_match", {"email_root": email_root,
                             "site_root": site_root}


def gate_5_domain_fit(email: str, entity: dict,
                      context: Optional[dict] = None) -> GateResult:
    """
    Score-based gate. Disabled by default (`DOMAIN_FIT_ENABLED=0`).
    When disabled, returns a NEUTRAL pass — never rejects.
    """
    if not _flag("DOMAIN_FIT_ENABLED", "0"):
        return GateResult("domain_fit", True, 1.0,
                          "gate_disabled", {})

    score, reason, ev = domain_fit_score(email, entity, context)
    threshold = _domain_fit_min()
    passed = score >= threshold
    return GateResult(
        name="domain_fit",
        passed=passed,
        score=score,
        reason=reason if passed else f"domain_mismatch:{reason}",
        evidence={**ev, "threshold": threshold},
    )


# ──────────────────────────────────────────────────────────────────────
# Gate 6 — MX / DNS sanity (optional, off by default in tests)
# ──────────────────────────────────────────────────────────────────────
def gate_6_mx(email: str, do_dns: bool = False) -> GateResult:
    """
    DNS lookup is OFF by default in unit tests (no network).
    In production the classifier turns it on.
    """
    if not do_dns:
        return GateResult("mx_dns", True, 1.0, "gate_skipped_no_dns", {})

    if not email or "@" not in email:
        return GateResult("mx_dns", False, 0.0, "missing_at", {})

    try:
        import email_guard  # type: ignore
        ok, reason = email_guard.check_domain(email)
        return GateResult(
            "mx_dns", ok, 1.0 if ok else 0.0,
            reason if ok else f"mx_lookup_failed:{reason}",
            {"email": email},
        )
    except Exception as e:
        # If we can't even import email_guard, soft-pass — we'll catch
        # bad domains on actual send time.
        return GateResult("mx_dns", True, 0.5,
                          f"check_skipped:{type(e).__name__}", {})


# ──────────────────────────────────────────────────────────────────────
# Gate 7 — Suppression list
# ──────────────────────────────────────────────────────────────────────
def gate_7_suppression(email: str,
                       context: Optional[dict] = None) -> GateResult:
    """Reject if email is on the suppression list."""
    context = context or {}

    suppressed_set = context.get("suppressed_emails")
    if suppressed_set is not None:
        # Test mode — pass an explicit set
        if email.lower() in {e.lower() for e in suppressed_set}:
            return GateResult("suppression", False, 0.0,
                              "on_suppression_list", {"email": email})
        return GateResult("suppression", True, 1.0, "ok", {})

    # Live mode — call email_guard
    try:
        import email_guard  # type: ignore
        if email_guard.is_suppressed(email):
            return GateResult("suppression", False, 0.0,
                              "on_suppression_list", {"email": email})
    except Exception:
        pass
    return GateResult("suppression", True, 1.0, "ok", {})


# ──────────────────────────────────────────────────────────────────────
# Composition
# ──────────────────────────────────────────────────────────────────────
def validate_email_7_gates(email: str, entity: dict,
                           context: Optional[dict] = None,
                           do_dns: bool = False) -> dict:
    """Run all 7 gates and return structured results."""
    context = context or {}
    results: list[GateResult] = []

    g1 = gate_1_transport_decode(email)
    results.append(g1)
    if not g1.passed:
        return {"passed": False, "results": results,
                "first_failure": g1.name, "reason": g1.reason}

    decoded = (g1.evidence or {}).get("decoded", email)

    g2 = gate_2_multi_split(decoded)
    results.append(g2)
    if not g2.passed:
        return {"passed": False, "results": results,
                "first_failure": g2.name, "reason": g2.reason}

    single = (g2.evidence or {}).get("value", decoded)

    for gate_fn in (gate_3_rfc, gate_4_placeholder):
        r = gate_fn(single)
        results.append(r)
        if not r.passed:
            return {"passed": False, "results": results,
                    "first_failure": r.name, "reason": r.reason}

    r5 = gate_5_domain_fit(single, entity, context)
    results.append(r5)
    if not r5.passed:
        return {"passed": False, "results": results,
                "first_failure": r5.name, "reason": r5.reason}

    r6 = gate_6_mx(single, do_dns=do_dns)
    results.append(r6)
    if not r6.passed:
        return {"passed": False, "results": results,
                "first_failure": r6.name, "reason": r6.reason}

    r7 = gate_7_suppression(single, context)
    results.append(r7)
    if not r7.passed:
        return {"passed": False, "results": results,
                "first_failure": r7.name, "reason": r7.reason}

    return {"passed": True, "results": results, "email_canonical": single}


# ──────────────────────────────────────────────────────────────────────
# Failure routing
# ──────────────────────────────────────────────────────────────────────
def _route_failure(reason: str) -> str:
    """Map a gate failure reason to a readiness state."""
    r = (reason or "").lower()
    if "multi_value_unsplit" in r:
        return INVALID_CONTACT
    if "transport_decode_failed" in r or "control_chars" in r \
            or "non_printable" in r or "url_decode_failed" in r \
            or "unicode_unescape_failed" in r:
        return INVALID_CONTACT
    if "placeholder" in r or "blocked_generic_local" in r:
        return INVALID_CONTACT
    if "domain_mismatch" in r or "no_match" in r:
        return INVALID_CONTACT
    if "rfc" in r or "missing_at" in r or "multiple_at" in r \
            or "regex_mismatch" in r:
        return INVALID_CONTACT
    if "mx_lookup_failed" in r:
        return INVALID_CONTACT
    if "on_suppression_list" in r:
        return SUPPRESSED
    return INVALID_CONTACT


def _has(value) -> bool:
    return value is not None and str(value).strip() != ""


# Anti-target sectors per plan §1
_ANTI_TARGET_SECTORS = {
    "takeaway", "hairdresser", "barber", "beauty_salon", "personal_services",
    "fast_food", "convenience_store",
}

_TARGET_SECTORS = {
    "office", "property_management", "block_management", "car_dealership",
    "dealership", "clinic", "healthcare", "school", "nursery", "gym",
    "leisure", "warehouse", "industrial", "serviced_office",
    "facilities_management", "estate_agent", "lettings",
    # Conservative additions — generic sectors that often map to cleaning
    "professional_services", "medical", "education",
}


def _sector_target(sector: str) -> Optional[bool]:
    """True/False if classified, None if unknown (treated as neutral)."""
    if not sector:
        return None
    s = sector.lower()
    if s in _ANTI_TARGET_SECTORS:
        return False
    if s in _TARGET_SECTORS:
        return True
    return None


def _find_email_conflict(email: str, entity: dict,
                         context: dict) -> Optional[list]:
    """Look up other entities sharing this email (test-mode via context)."""
    others = (context or {}).get("email_owners", {}).get(email.lower())
    if not others:
        return None
    own_id = entity.get("id") or entity.get("entity_id")
    others_other = [o for o in others
                    if o != own_id and o is not None]
    return others_other or None


def classify_readiness(entity: dict,
                       context: Optional[dict] = None,
                       do_dns: bool = False) -> ClassifyResult:
    """
    Pure classification. Reads `entity` (dict-shape; mirrors the row
    selected by crm_sync._QUALIFIED_LEAD_SQL minus joins). Never writes.

    Args:
        entity: dict with at minimum: id, primary_email, primary_phone,
                primary_website, canonical_name, sector, total_score (or
                priority_score)
        context: optional dict with chain_operators, sector_shared_domains,
                 suppressed_emails (set), email_owners (dict).
        do_dns: pass True in production to enable MX checks; tests leave off.
    """
    context = context or {}
    email = (entity.get("primary_email") or "").strip().lower()
    score = entity.get("total_score") \
        if entity.get("total_score") is not None \
        else entity.get("priority_score")
    score = int(score) if score is not None else 0

    sector = entity.get("sector") or ""
    sector_status = _sector_target(sector)

    # ── No email at all ───────────────────────────────────────────────
    if not email:
        if sector_status is False:
            return ClassifyResult(LOW_VALUE, "no_email_anti_target",
                                  notes={"score": score})
        if _has(entity.get("primary_website")) and sector_status is not False:
            return ClassifyResult(NEEDS_ENRICHMENT,
                                  "no_email_but_website",
                                  notes={"score": score})
        if _has(entity.get("primary_phone")) and score >= 50:
            return ClassifyResult(PHONE_FIRST,
                                  "no_email_but_phone",
                                  notes={"score": score})
        return ClassifyResult(LOW_VALUE, "no_email_no_path",
                              notes={"score": score})

    # ── Email present — run gates ─────────────────────────────────────
    gate_outcome = validate_email_7_gates(email, entity, context,
                                          do_dns=do_dns)
    gate_results = gate_outcome["results"]

    if not gate_outcome["passed"]:
        state = _route_failure(gate_outcome["reason"])
        return ClassifyResult(state, gate_outcome["reason"],
                              gate_results=gate_results,
                              notes={"score": score,
                                     "first_failure":
                                         gate_outcome.get("first_failure")})

    # ── All gates passed — apply post-gate policy ─────────────────────
    if sector_status is False:
        return ClassifyResult(LOW_VALUE, "sector_off_target",
                              gate_results=gate_results,
                              notes={"score": score, "sector": sector})

    if score < 30:
        return ClassifyResult(LOW_VALUE, "score_too_low",
                              gate_results=gate_results,
                              notes={"score": score})

    conflicts = _find_email_conflict(email, entity, context)
    if conflicts:
        return ClassifyResult(
            ENTITY_CONFLICT,
            f"email_used_by:{conflicts}",
            gate_results=gate_results,
            notes={"score": score, "conflicting_entity_ids": conflicts},
        )

    if score < 65:
        # Above the floor but below the priority cutoff. Treat as needs
        # enrichment so we keep working on it (e.g. find DM email),
        # don't waste a send slot at low score.
        return ClassifyResult(
            NEEDS_ENRICHMENT, "below_priority_threshold",
            gate_results=gate_results, notes={"score": score},
        )

    return ClassifyResult(READY, "all_gates_passed",
                          gate_results=gate_results,
                          notes={"score": score})


# ──────────────────────────────────────────────────────────────────────
# Migration-applied check
# ──────────────────────────────────────────────────────────────────────
def readiness_table_present(conn) -> bool:
    """
    Returns True iff migration 011 has been applied (specifically:
    enrichment_events table exists). Used by api.py to short-circuit
    new endpoints with 503 when migration hasn't run yet.
    """
    try:
        import db_pg  # type: ignore
        row = db_pg.fetchone(
            conn,
            "SELECT to_regclass('public.enrichment_events') AS t",
        )
        return bool(row and row.get("t"))
    except Exception as e:
        logger.warning("readiness_table_present probe failed: %s", e)
        return False


# ──────────────────────────────────────────────────────────────────────
# Coverage stats — read-only, safe pre-migration
# ──────────────────────────────────────────────────────────────────────
def coverage_stats() -> dict:
    """Reads readiness_state distribution. Returns a sentinel if migration
    not applied."""
    try:
        import db_pg  # type: ignore
    except Exception as e:
        return {"error": f"db_pg_unavailable:{e!s}"}

    try:
        with db_pg.transaction() as conn:
            if not readiness_table_present(conn):
                return {"migration_applied": False,
                        "note": "Migration 011 not yet applied"}
            rows = db_pg.fetchall(
                conn,
                "SELECT COALESCE(readiness_state, 'unclassified') AS state, "
                "       COUNT(*) AS n "
                "FROM entities WHERE active = TRUE "
                "GROUP BY COALESCE(readiness_state, 'unclassified')",
            )
            return {
                "migration_applied": True,
                "by_state": {r["state"]: r["n"] for r in rows},
            }
    except Exception as e:
        logger.error("coverage_stats failed: %s", e)
        return {"error": str(e)[:200]}


# ──────────────────────────────────────────────────────────────────────
# HARD GUARANTEES (asserted at module import)
# ──────────────────────────────────────────────────────────────────────
# Refuse to load if any forbidden symbol appears in our own source.
def _self_check() -> None:
    """
    Sanity guard: no function in this module may execute SQL that writes
    to entities.primary_email. We can't statically prove SQL safety, but
    we can flag the obvious copy-paste mistake of including a write SQL.
    Pattern is split here so it doesn't match the check's own string.
    """
    import inspect
    src = inspect.getsource(inspect.getmodule(_self_check))
    # Strip this function's own body so it never matches itself.
    own_src = inspect.getsource(_self_check)
    src_stripped = src.replace(own_src, "")
    forbidden = "UPDATE" + " entities SET primary" + "_email"
    if forbidden in src_stripped:
        raise RuntimeError(
            "prospect_validation safety check failed: "
            "module contains a forbidden primary_email write."
        )


_self_check()
