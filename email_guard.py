"""
email_guard.py — Email Deliverability Protection System
========================================================
Protects domain reputation by validating every outbound email before
it reaches GAS/Gmail.  All send paths MUST call `pre_send_check(email)`
before pushing to GAS.

Layers:
  1. RFC format validation
  2. DNS domain + MX record lookup
  3. Role-based / high-risk pattern filtering
  4. Bounce suppression list
  5. Throttle gate (daily limit + per-minute pacing)
  6. Per-email status tracking (pending → sent → delivered → bounced → failed)
"""
from __future__ import annotations

import logging
import os
import re
import socket
import time
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger("email_guard")

# ── Configuration ──────────────────────────────────────────────────────────
DAILY_SEND_LIMIT   = int(os.getenv("EMAIL_DAILY_LIMIT", "50"))
PER_MINUTE_LIMIT   = int(os.getenv("EMAIL_PER_MINUTE_LIMIT", "5"))
ROLE_EMAIL_ACTION   = os.getenv("EMAIL_ROLE_ACTION", "flag")     # "block" or "flag"

# ── High-risk generic addresses (never send) ──────────────────────────────
BLOCKED_PREFIXES = {
    "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply",
    "do_not_reply", "webmaster", "postmaster", "mailer-daemon",
    "daemon", "bounce", "abuse", "unsubscribe", "root", "devnull",
    "null", "test", "nobody",
}

# ── Role-based addresses (configurable: block or flag) ────────────────────
ROLE_PREFIXES = {
    "info", "admin", "office", "contact", "hello", "enquiries",
    "enquiry", "sales", "support", "help", "general", "reception",
    "accounts", "billing", "finance", "hr", "jobs", "careers",
    "marketing", "press", "media", "legal", "compliance",
    "feedback", "team", "staff", "management",
}

# ── RFC 5322 email regex (practical) ──────────────────────────────────────
_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+"
    r"@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)

# ── Disposable / problematic domain suffixes ──────────────────────────────
_DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "tempmail.com",
    "throwaway.email", "yopmail.com", "trashmail.com",
    "sharklasers.com", "grr.la", "guerrillamail.info",
    "guerrillamail.net", "10minutemail.com",
}

# In-memory throttle state (reset on restart, which is fine for single-process)
_throttle_state = {
    "minute_window_start": 0.0,
    "minute_count": 0,
    "day_key": "",
    "day_count": 0,
}


# ══════════════════════════════════════════════════════════════════════════
# 1. FORMAT VALIDATION
# ══════════════════════════════════════════════════════════════════════════

def validate_format(email: str) -> tuple[bool, str]:
    """Check RFC-compliant email format. Returns (valid, reason)."""
    if not email or not isinstance(email, str):
        return False, "empty_email"
    email = email.strip().lower()
    if len(email) > 254:
        return False, "too_long"
    if not _EMAIL_RE.match(email):
        return False, "invalid_format"
    local, domain = email.rsplit("@", 1)
    if len(local) > 64:
        return False, "local_part_too_long"
    if domain in _DISPOSABLE_DOMAINS:
        return False, "disposable_domain"
    return True, "ok"


# ══════════════════════════════════════════════════════════════════════════
# 2. DNS / MX VALIDATION
# ══════════════════════════════════════════════════════════════════════════

def check_domain(email: str) -> tuple[bool, str]:
    """Verify domain exists and has MX records."""
    try:
        import dns.resolver
    except ImportError:
        # dnspython not installed — skip DNS checks gracefully
        logger.debug("dnspython not installed — skipping MX check for %s", email)
        return True, "dns_skip_no_lib"

    domain = email.rsplit("@", 1)[-1].lower()

    # Step 1: Domain exists (A or AAAA record)?
    try:
        dns.resolver.resolve(domain, "A")
    except dns.resolver.NXDOMAIN:
        return False, "domain_not_found"
    except dns.resolver.NoAnswer:
        # No A record — try AAAA
        try:
            dns.resolver.resolve(domain, "AAAA")
        except Exception:
            pass  # fall through to MX check
    except dns.resolver.Timeout:
        return False, "domain_dns_timeout"
    except Exception:
        pass  # non-fatal, try MX

    # Step 2: MX records exist?
    try:
        mx = dns.resolver.resolve(domain, "MX")
        if len(mx) == 0:
            return False, "no_mx_records"
        return True, "ok"
    except dns.resolver.NXDOMAIN:
        return False, "domain_not_found"
    except dns.resolver.NoAnswer:
        # No MX but domain exists — some domains use A-record fallback
        return True, "no_mx_a_fallback"
    except dns.resolver.Timeout:
        return False, "mx_dns_timeout"
    except Exception as exc:
        logger.debug("MX check failed for %s: %s", domain, exc)
        return True, "mx_check_error_passthrough"


# ══════════════════════════════════════════════════════════════════════════
# 3. RISK FILTERING
# ══════════════════════════════════════════════════════════════════════════

def check_risk(email: str) -> tuple[str, str]:
    """
    Classify email risk.
    Returns (status, reason) where status in ('valid', 'risky', 'blocked').
    """
    local = email.split("@")[0].lower()

    if local in BLOCKED_PREFIXES:
        return "blocked", f"blocked_prefix:{local}"

    if local in ROLE_PREFIXES:
        action = ROLE_EMAIL_ACTION.lower()
        if action == "block":
            return "blocked", f"role_email_blocked:{local}"
        return "risky", f"role_email:{local}"

    return "valid", "ok"


# ══════════════════════════════════════════════════════════════════════════
# 4. BOUNCE SUPPRESSION LIST (Database-backed)
# ══════════════════════════════════════════════════════════════════════════

def is_suppressed(email: str) -> bool:
    """Check if email is on the suppression list."""
    try:
        import db_pg
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn,
                "SELECT id FROM email_suppressions WHERE email = %s AND active = TRUE",
                (email.lower().strip(),))
            return row is not None
    except Exception as exc:
        logger.debug("Suppression check failed (table may not exist): %s", exc)
        return False


def add_suppression(email: str, reason: str, source: str = "system") -> None:
    """Add email to suppression list."""
    try:
        import db_pg
        with db_pg.transaction() as conn:
            db_pg.execute(conn, """
                INSERT INTO email_suppressions (email, reason, source)
                VALUES (%s, %s, %s)
                ON CONFLICT (email) DO UPDATE SET
                    reason = EXCLUDED.reason,
                    source = EXCLUDED.source,
                    suppressed_at = NOW(),
                    active = TRUE
            """, (email.lower().strip(), reason, source))
    except Exception as exc:
        logger.warning("Failed to add suppression for %s: %s", email, exc)


def remove_suppression(email: str) -> None:
    """Remove email from suppression list (soft delete)."""
    try:
        import db_pg
        with db_pg.transaction() as conn:
            db_pg.execute(conn, """
                UPDATE email_suppressions SET active = FALSE WHERE email = %s
            """, (email.lower().strip(),))
    except Exception as exc:
        logger.warning("Failed to remove suppression for %s: %s", email, exc)


# ══════════════════════════════════════════════════════════════════════════
# 5. THROTTLE GATE
# ══════════════════════════════════════════════════════════════════════════

def check_throttle() -> tuple[bool, str]:
    """
    Check if we're within send rate limits.
    Returns (allowed, reason).
    """
    now = time.time()
    today = datetime.utcnow().strftime("%Y-%m-%d")

    # Per-minute check
    if now - _throttle_state["minute_window_start"] > 60:
        _throttle_state["minute_window_start"] = now
        _throttle_state["minute_count"] = 0

    if _throttle_state["minute_count"] >= PER_MINUTE_LIMIT:
        return False, f"per_minute_limit:{PER_MINUTE_LIMIT}"

    # Daily check
    if _throttle_state["day_key"] != today:
        _throttle_state["day_key"] = today
        _throttle_state["day_count"] = _get_today_send_count()

    if _throttle_state["day_count"] >= DAILY_SEND_LIMIT:
        return False, f"daily_limit:{DAILY_SEND_LIMIT}"

    return True, "ok"


def record_send():
    """Increment throttle counters after a successful send."""
    _throttle_state["minute_count"] += 1
    _throttle_state["day_count"] += 1


def _get_today_send_count() -> int:
    """Get today's send count from the database for accurate tracking across restarts."""
    try:
        import db_pg
        with db_pg.transaction() as conn:
            count = db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM email_send_log
                WHERE sent_at >= CURRENT_DATE
                  AND status IN ('sent', 'delivered', 'pending')
            """)
            return count or 0
    except Exception:
        return 0


# ══════════════════════════════════════════════════════════════════════════
# 6. EMAIL STATUS TRACKING
# ══════════════════════════════════════════════════════════════════════════

def log_send(email: str, place_id: str, entity_id: int = None,
             status: str = "pending", detail: str = "") -> Optional[int]:
    """
    Log an email send attempt.
    Status: pending | sent | delivered | bounced | failed | blocked | suppressed
    Returns the log row id.
    """
    try:
        import db_pg
        with db_pg.transaction() as conn:
            row = db_pg.fetchone(conn, """
                INSERT INTO email_send_log
                    (email, place_id, entity_id, status, detail)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (email.lower().strip(), place_id, entity_id, status, detail))
            return row["id"] if row else None
    except Exception as exc:
        logger.warning("Failed to log email send: %s", exc)
        return None


def update_send_status(log_id: int = None, email: str = None,
                       place_id: str = None, status: str = "sent",
                       detail: str = "") -> None:
    """Update status of a previously logged send."""
    try:
        import db_pg
        with db_pg.transaction() as conn:
            if log_id:
                db_pg.execute(conn, """
                    UPDATE email_send_log
                    SET status = %s, detail = %s,
                        delivered_at = CASE WHEN %s = 'delivered' THEN NOW() ELSE delivered_at END,
                        bounced_at = CASE WHEN %s = 'bounced' THEN NOW() ELSE bounced_at END,
                        updated_at = NOW()
                    WHERE id = %s
                """, (status, detail, status, status, log_id))
            elif email and place_id:
                # Update most recent log for this email+place_id combo
                db_pg.execute(conn, """
                    UPDATE email_send_log
                    SET status = %s, detail = %s,
                        delivered_at = CASE WHEN %s = 'delivered' THEN NOW() ELSE delivered_at END,
                        bounced_at = CASE WHEN %s = 'bounced' THEN NOW() ELSE bounced_at END,
                        updated_at = NOW()
                    WHERE id = (
                        SELECT id FROM email_send_log
                        WHERE email = %s AND place_id = %s
                        ORDER BY sent_at DESC LIMIT 1
                    )
                """, (status, detail, status, status, email.lower().strip(), place_id))
    except Exception as exc:
        logger.warning("Failed to update send status: %s", exc)


def handle_bounce(email: str, place_id: str = "", reason: str = "bounce") -> None:
    """Process a bounced email: update log + add to suppression list."""
    add_suppression(email, reason, source="bounce")
    update_send_status(email=email, place_id=place_id, status="bounced", detail=reason)
    _update_entity_validation_status(email, "invalid")
    logger.info("email_guard: bounced → suppressed: %s (reason: %s)", email, reason)


# ══════════════════════════════════════════════════════════════════════════
# 7. ENTITY VALIDATION STATUS
# ══════════════════════════════════════════════════════════════════════════

def _update_entity_validation_status(email: str, status: str) -> None:
    """Update the validation status on the entity that owns this email."""
    try:
        import db_pg
        with db_pg.transaction() as conn:
            db_pg.execute(conn, """
                UPDATE entities SET email_validation_status = %s
                WHERE primary_email = %s
            """, (status, email.lower().strip()))
    except Exception as exc:
        logger.debug("Could not update entity validation status: %s", exc)


def validate_and_tag_entity(email: str) -> str:
    """
    Run full validation on an email and update the entity's validation status.
    Returns: 'valid' | 'risky' | 'invalid'
    """
    email = (email or "").strip().lower()
    if not email:
        return "invalid"

    # Format check
    ok, reason = validate_format(email)
    if not ok:
        _update_entity_validation_status(email, "invalid")
        return "invalid"

    # Domain / MX check
    ok, reason = check_domain(email)
    if not ok:
        _update_entity_validation_status(email, "invalid")
        return "invalid"

    # Risk classification
    risk, reason = check_risk(email)
    if risk == "blocked":
        _update_entity_validation_status(email, "invalid")
        return "invalid"

    _update_entity_validation_status(email, risk)  # "valid" or "risky"
    return risk


# ══════════════════════════════════════════════════════════════════════════
# 8. PRE-SEND CHECK (main entry point)
# ══════════════════════════════════════════════════════════════════════════

def pre_send_check(email: str, place_id: str = "", entity_id: int = None,
                   allow_risky: bool = False) -> tuple[bool, str]:
    """
    Master gate — every send path calls this before pushing to GAS.
    Returns (allowed, reason).

    If blocked, also logs the attempt with 'blocked' or 'suppressed' status.
    """
    email = (email or "").strip().lower()

    # 1. Format
    ok, reason = validate_format(email)
    if not ok:
        log_send(email, place_id, entity_id, "blocked", f"format:{reason}")
        return False, f"format:{reason}"

    # 2. Risk filter
    risk, reason = check_risk(email)
    if risk == "blocked":
        log_send(email, place_id, entity_id, "blocked", reason)
        return False, reason
    if risk == "risky" and not allow_risky:
        log_send(email, place_id, entity_id, "blocked", f"risky_not_allowed:{reason}")
        return False, f"risky_not_allowed:{reason}"

    # 3. Suppression list
    if is_suppressed(email):
        log_send(email, place_id, entity_id, "suppressed", "on_suppression_list")
        return False, "suppressed"

    # 4. Domain / MX
    ok, reason = check_domain(email)
    if not ok:
        log_send(email, place_id, entity_id, "blocked", f"domain:{reason}")
        add_suppression(email, f"domain:{reason}", source="validation")
        return False, f"domain:{reason}"

    # 5. Throttle
    ok, reason = check_throttle()
    if not ok:
        log_send(email, place_id, entity_id, "blocked", f"throttle:{reason}")
        return False, f"throttle:{reason}"

    return True, "ok"


# ══════════════════════════════════════════════════════════════════════════
# 9. DATABASE SCHEMA (called during init_db)
# ══════════════════════════════════════════════════════════════════════════

def ensure_tables(conn) -> None:
    """Create email_guard tables. Called from database._create_shared_tables()."""
    import db_pg
    for ddl in [
        """CREATE TABLE IF NOT EXISTS email_suppressions (
            id          SERIAL PRIMARY KEY,
            email       TEXT NOT NULL UNIQUE,
            reason      TEXT NOT NULL DEFAULT 'unknown',
            source      TEXT NOT NULL DEFAULT 'system',
            active      BOOLEAN DEFAULT TRUE,
            suppressed_at TIMESTAMP DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS email_send_log (
            id          SERIAL PRIMARY KEY,
            email       TEXT NOT NULL,
            place_id    TEXT,
            entity_id   INTEGER,
            status      TEXT NOT NULL DEFAULT 'pending',
            detail      TEXT,
            sent_at     TIMESTAMP DEFAULT NOW(),
            delivered_at TIMESTAMP,
            bounced_at  TIMESTAMP,
            updated_at  TIMESTAMP DEFAULT NOW()
        )""",
    ]:
        try:
            db_pg.execute(conn, ddl)
        except Exception:
            pass  # table already exists


def ensure_entity_validation_column(conn) -> None:
    """Add email_validation_status column to entities if missing."""
    import db_pg
    try:
        db_pg.execute(conn, """
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='entities' AND column_name='email_validation_status') THEN
                    ALTER TABLE entities ADD COLUMN email_validation_status TEXT DEFAULT 'unknown';
                END IF;
            END $$
        """)
    except Exception:
        pass
