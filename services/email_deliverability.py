"""
email_deliverability.py — Deliverability Protection Layer for AskMiro OS
Pre-send validation, bounce intelligence, suppression, and rate limiting.
No email should ever be sent "blind".
"""
from __future__ import annotations
import re
import logging
import dns.resolver
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════
# 1. EMAIL FORMAT VALIDATION
# ══════════════════════════════════════════════════════════════

# Strict RFC-compliant email regex
_EMAIL_RE = re.compile(
    r'^[a-zA-Z0-9.!#$%&\'*+/=?^_`{|}~-]+@'
    r'[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?'
    r'(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'
)

# Role-based email prefixes (risky but not always invalid)
ROLE_PREFIXES = {
    'admin', 'info', 'hello', 'contact', 'office', 'reception',
    'enquiries', 'enquiry', 'sales', 'support', 'help', 'webmaster',
    'postmaster', 'noreply', 'no-reply', 'donotreply', 'billing',
    'accounts', 'team', 'general', 'mail', 'email',
}

# Sector exceptions — some SMEs commonly use role-based emails
SECTOR_ROLE_EXCEPTIONS = {
    'healthcare': {'reception', 'enquiries', 'admin', 'office'},
    'education': {'office', 'admin', 'reception', 'enquiries'},
    'property_management': {'info', 'enquiries', 'office', 'admin'},
    'hospitality': {'reception', 'info', 'hello'},
    'retail': {'info', 'hello', 'contact'},
}

# Known disposable/temporary email domains
DISPOSABLE_DOMAINS = {
    'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
    'yopmail.com', 'sharklasers.com', 'trashmail.com', 'temp-mail.org',
    'fakeinbox.com', 'guerrillamailblock.com', 'dispostable.com',
}


def validate_email_format(email: str) -> dict:
    """Validate email format strictly."""
    if not email or not isinstance(email, str):
        return {'valid': False, 'reason': 'Empty or invalid input'}

    email = email.strip().lower()

    if not _EMAIL_RE.match(email):
        return {'valid': False, 'reason': 'Invalid email format'}

    if len(email) > 254:
        return {'valid': False, 'reason': 'Email exceeds max length'}

    local, domain = email.rsplit('@', 1)

    if len(local) > 64:
        return {'valid': False, 'reason': 'Local part too long'}

    if domain in DISPOSABLE_DOMAINS:
        return {'valid': False, 'reason': 'Disposable email domain'}

    if '..' in email:
        return {'valid': False, 'reason': 'Consecutive dots'}

    return {'valid': True, 'email': email, 'local': local, 'domain': domain}


# ══════════════════════════════════════════════════════════════
# 2. DOMAIN & MX RECORD VALIDATION
# ══════════════════════════════════════════════════════════════

_mx_cache: dict[str, dict] = {}  # domain -> {result, expires_at}

def validate_domain_mx(domain: str) -> dict:
    """Check if domain has valid MX records."""
    # Check cache
    cached = _mx_cache.get(domain)
    if cached and cached['expires_at'] > datetime.utcnow():
        return cached['result']

    result = {'domain': domain}
    try:
        mx_records = dns.resolver.resolve(domain, 'MX')
        result['has_mx'] = True
        result['mx_records'] = [str(r.exchange).rstrip('.') for r in mx_records]
        result['valid'] = True
    except dns.resolver.NoAnswer:
        # No MX but might have A record
        try:
            dns.resolver.resolve(domain, 'A')
            result['has_mx'] = False
            result['has_a'] = True
            result['valid'] = True  # Can still receive mail via A record
            result['note'] = 'No MX records but A record exists'
        except Exception:
            result['valid'] = False
            result['reason'] = 'No MX or A records'
    except dns.resolver.NXDOMAIN:
        result['valid'] = False
        result['reason'] = 'Domain does not exist'
    except dns.resolver.Timeout:
        result['valid'] = False
        result['reason'] = 'DNS timeout'
    except Exception as e:
        result['valid'] = False
        result['reason'] = f'DNS error: {str(e)}'

    # Cache for 1 hour
    _mx_cache[domain] = {'result': result, 'expires_at': datetime.utcnow() + timedelta(hours=1)}
    return result


# ══════════════════════════════════════════════════════════════
# 3. COMPREHENSIVE EMAIL VALIDATION (PRE-SEND GATE)
# ══════════════════════════════════════════════════════════════

def validate_email(email: str, sector: str = None, check_mx: bool = True) -> dict:
    """
    Full pre-send validation. Returns:
    {
        status: 'valid' | 'risky' | 'invalid',
        email: str,
        reasons: list[str],
        risk_factors: list[str],
        can_send: bool,
        requires_approval: bool,
    }
    """
    result = {
        'email': (email or '').strip().lower(),
        'status': 'invalid',
        'reasons': [],
        'risk_factors': [],
        'can_send': False,
        'requires_approval': False,
    }

    # Step 1: Format validation
    fmt = validate_email_format(email)
    if not fmt.get('valid'):
        result['reasons'].append(fmt.get('reason', 'Invalid format'))
        return result

    result['email'] = fmt['email']
    local = fmt['local']
    domain = fmt['domain']

    # Step 2: MX record validation
    if check_mx:
        mx = validate_domain_mx(domain)
        if not mx.get('valid'):
            result['reasons'].append(f"Domain issue: {mx.get('reason', 'unknown')}")
            return result
        if mx.get('note'):
            result['risk_factors'].append(mx['note'])

    # Step 3: Role-based detection
    prefix = local.split('.')[0] if '.' in local else local
    is_role = prefix in ROLE_PREFIXES

    if is_role:
        # Check sector exceptions
        sector_exceptions = SECTOR_ROLE_EXCEPTIONS.get(sector, set()) if sector else set()
        if prefix in sector_exceptions:
            result['risk_factors'].append(f'Role-based ({prefix}@) but acceptable for {sector} sector')
        else:
            result['risk_factors'].append(f'Role-based email ({prefix}@) — higher bounce risk')
            result['requires_approval'] = True

    # Step 4: Determine final status
    if result['risk_factors']:
        result['status'] = 'risky'
        result['can_send'] = not result['requires_approval']
    else:
        result['status'] = 'valid'
        result['can_send'] = True

    return result


# ══════════════════════════════════════════════════════════════
# 4. BOUNCE INTELLIGENCE
# ══════════════════════════════════════════════════════════════

# SMTP bounce code classification
HARD_BOUNCE_CODES = {
    '550', '551', '552', '553', '554',  # Permanent failures
    '5.1.1', '5.1.2', '5.1.3', '5.1.6',  # Address/mailbox errors
    '5.2.1',  # Mailbox disabled
    '5.4.1',  # No answer from host
}

SOFT_BOUNCE_CODES = {
    '421', '450', '451', '452',  # Temporary failures
    '4.2.1', '4.2.2',  # Mailbox full / over quota
    '4.7.1',  # Rate limited
}


def classify_bounce(smtp_code: str, smtp_message: str = '') -> dict:
    """Classify a bounce by SMTP response."""
    code_str = str(smtp_code).strip()
    msg_lower = (smtp_message or '').lower()

    # Check for hard bounce indicators
    is_hard = (
        code_str in HARD_BOUNCE_CODES or
        code_str.startswith('5.1.') or
        'does not exist' in msg_lower or
        'user unknown' in msg_lower or
        'no such user' in msg_lower or
        'address rejected' in msg_lower or
        'recipient rejected' in msg_lower or
        'mailbox not found' in msg_lower or
        'invalid recipient' in msg_lower or
        'undeliverable' in msg_lower
    )

    if is_hard:
        return {
            'type': 'hard',
            'action': 'suppress_permanently',
            'retry': False,
            'max_retries': 0,
        }

    # Check for soft bounce
    is_soft = (
        code_str in SOFT_BOUNCE_CODES or
        code_str.startswith('4.') or
        'temporarily' in msg_lower or
        'try again' in msg_lower or
        'over quota' in msg_lower or
        'rate limit' in msg_lower or
        'too many' in msg_lower
    )

    if is_soft:
        return {
            'type': 'soft',
            'action': 'retry_with_backoff',
            'retry': True,
            'max_retries': 3,
        }

    # Unknown — treat as soft but flag for review
    return {
        'type': 'unknown',
        'action': 'flag_for_review',
        'retry': True,
        'max_retries': 1,
    }


# ══════════════════════════════════════════════════════════════
# 5. DATABASE OPERATIONS (suppression, tracking, rate limiting)
# ══════════════════════════════════════════════════════════════

def check_suppression(conn, email: str) -> bool:
    """Check if email is on the global suppression list."""
    try:
        import db_pg
        count = db_pg.fetchval(conn, """
            SELECT COUNT(*) FROM email_suppression_list
            WHERE email = %s AND active = TRUE
        """, (email.strip().lower(),))
        return (count or 0) > 0
    except Exception:
        return False  # Table might not exist yet


def add_to_suppression(conn, email: str, reason: str, smtp_code: str = None) -> bool:
    """Add email to global suppression list."""
    try:
        import db_pg
        db_pg.execute(conn, """
            INSERT INTO email_suppression_list (email, reason, smtp_code, suppressed_at, active)
            VALUES (%s, %s, %s, NOW(), TRUE)
            ON CONFLICT (email) DO UPDATE SET
                reason = EXCLUDED.reason, smtp_code = EXCLUDED.smtp_code,
                suppressed_at = NOW(), active = TRUE
        """, (email.strip().lower(), reason, smtp_code))
        return True
    except Exception as e:
        logger.error("add_to_suppression: %s", e)
        return False


def record_bounce(conn, email: str, smtp_code: str, smtp_message: str = '',
                  entity_id: int = None) -> dict:
    """Record a bounce event and take action."""
    classification = classify_bounce(smtp_code, smtp_message)

    try:
        import db_pg
        # Record the bounce event
        db_pg.execute(conn, """
            INSERT INTO email_bounce_log (email, entity_id, smtp_code, smtp_message,
                                          bounce_type, action_taken, recorded_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
        """, (email, entity_id, smtp_code, smtp_message,
              classification['type'], classification['action']))

        if classification['type'] == 'hard':
            # Permanent suppression
            add_to_suppression(conn, email, f"Hard bounce: {smtp_code}", smtp_code)

            # Update entity email_status if entity_id given
            if entity_id:
                db_pg.execute(conn, """
                    UPDATE entities SET primary_email = NULL
                    WHERE id = %s
                """, (entity_id,))
                # Also update the entity_emails table
                db_pg.execute(conn, """
                    UPDATE entity_emails SET bounced = TRUE, bounce_count = COALESCE(bounce_count, 0) + 1
                    WHERE entity_id = %s AND LOWER(email) = %s
                """, (entity_id, email.strip().lower()))

        elif classification['type'] == 'soft':
            # Check if this is a repeat soft bounce (becomes hard after 3)
            bounce_count = db_pg.fetchval(conn, """
                SELECT COUNT(*) FROM email_bounce_log
                WHERE email = %s AND bounce_type = 'soft'
                AND recorded_at > NOW() - INTERVAL '30 days'
            """, (email,)) or 0

            if bounce_count >= 3:
                add_to_suppression(conn, email, f"Repeated soft bounces ({bounce_count})", smtp_code)
                classification['escalated_to_hard'] = True

        classification['email'] = email
        return classification
    except Exception as e:
        logger.error("record_bounce: %s", e)
        return classification


def get_send_stats(conn, hours: int = 24) -> dict:
    """Get sending stats for rate limiting decisions."""
    try:
        import db_pg
        since = datetime.utcnow() - timedelta(hours=hours)

        total_sent = db_pg.fetchval(conn, """
            SELECT COUNT(*) FROM email_send_log
            WHERE sent_at > %s
        """, (since,)) or 0

        total_bounced = db_pg.fetchval(conn, """
            SELECT COUNT(*) FROM email_bounce_log
            WHERE recorded_at > %s
        """, (since,)) or 0

        bounce_rate = (total_bounced / total_sent * 100) if total_sent > 0 else 0

        suppression_count = db_pg.fetchval(conn, """
            SELECT COUNT(*) FROM email_suppression_list WHERE active = TRUE
        """) or 0

        return {
            'period_hours': hours,
            'total_sent': total_sent,
            'total_bounced': total_bounced,
            'bounce_rate_pct': round(bounce_rate, 2),
            'suppression_list_size': suppression_count,
            'sending_paused': bounce_rate > 3.0,
            'daily_cap': 50,
            'remaining_today': max(0, 50 - total_sent),
        }
    except Exception as e:
        logger.error("get_send_stats: %s", e)
        return {'total_sent': 0, 'bounce_rate_pct': 0, 'sending_paused': False,
                'daily_cap': 50, 'remaining_today': 50}


def pre_send_check(conn, email: str, sector: str = None) -> dict:
    """
    Complete pre-send gate. Must pass before any email is sent.
    Returns: {approved: bool, reason: str, ...}
    """
    result = {'email': email, 'approved': False}

    # 1. Check suppression list
    if check_suppression(conn, email):
        result['reason'] = 'Email is on suppression list (previous bounce)'
        result['status'] = 'suppressed'
        return result

    # 2. Validate email
    validation = validate_email(email, sector=sector, check_mx=True)
    result['validation'] = validation

    if validation['status'] == 'invalid':
        result['reason'] = f"Invalid email: {', '.join(validation['reasons'])}"
        result['status'] = 'invalid'
        return result

    # 3. Check rate limits
    stats = get_send_stats(conn)
    result['send_stats'] = stats

    if stats.get('sending_paused'):
        result['reason'] = f"Sending paused — bounce rate {stats['bounce_rate_pct']}% exceeds 3% threshold"
        result['status'] = 'rate_limited'
        return result

    if stats.get('remaining_today', 0) <= 0:
        result['reason'] = f"Daily cap reached ({stats['daily_cap']} emails)"
        result['status'] = 'rate_limited'
        return result

    # 4. Determine approval
    if validation['status'] == 'risky' and validation.get('requires_approval'):
        result['approved'] = False
        result['reason'] = f"Requires approval: {', '.join(validation['risk_factors'])}"
        result['status'] = 'needs_approval'
    else:
        result['approved'] = True
        result['status'] = validation['status']

    return result


# ══════════════════════════════════════════════════════════════
# 6. TABLE CREATION
# ══════════════════════════════════════════════════════════════

def ensure_deliverability_tables(conn):
    """Create deliverability tracking tables if they don't exist."""
    import db_pg

    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS email_suppression_list (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            reason TEXT,
            smtp_code TEXT,
            suppressed_at TIMESTAMPTZ DEFAULT NOW(),
            active BOOLEAN DEFAULT TRUE
        )
    """)

    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS email_bounce_log (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            entity_id INTEGER,
            smtp_code TEXT,
            smtp_message TEXT,
            bounce_type TEXT,
            action_taken TEXT,
            recorded_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    db_pg.execute(conn, """
        CREATE TABLE IF NOT EXISTS email_send_log (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            entity_id INTEGER,
            template_type TEXT,
            subject TEXT,
            sent_at TIMESTAMPTZ DEFAULT NOW(),
            delivery_status TEXT DEFAULT 'sent',
            smtp_response TEXT
        )
    """)

    # Add email_status to entity_emails if not present
    try:
        db_pg.execute(conn, """
            ALTER TABLE entity_emails ADD COLUMN IF NOT EXISTS bounced BOOLEAN DEFAULT FALSE
        """)
        db_pg.execute(conn, """
            ALTER TABLE entity_emails ADD COLUMN IF NOT EXISTS bounce_count INTEGER DEFAULT 0
        """)
        db_pg.execute(conn, """
            ALTER TABLE entity_emails ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'unknown'
        """)
        db_pg.execute(conn, """
            ALTER TABLE entity_emails ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ
        """)
    except Exception as e:
        logger.warning("entity_emails columns: %s", e)

    logger.info("Deliverability tables ensured")
