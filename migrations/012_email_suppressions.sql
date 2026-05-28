-- ============================================================
-- Migration 012 — Email suppressions list
-- ============================================================
-- Purpose: UK PECR Reg 22/23 + UK GDPR compliance. Permanent
-- record of every email address that has unsubscribed, bounced,
-- complained, or been manually suppressed. Checked before every
-- outbound send by the GAS outreach engine.
--
-- Persistence rule: NEVER hard-delete from this table. Even if
-- the underlying lead is purged from `entities` / `contacts`,
-- the suppression must survive — otherwise re-imports re-contact
-- people who have opted out. ICO treats that as a fresh breach.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_suppressions (
    id               BIGSERIAL PRIMARY KEY,
    email            TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    reason           TEXT NOT NULL,
    source           TEXT NOT NULL DEFAULT 'manual',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       TEXT,
    notes            TEXT,
    request_ip       TEXT,
    user_agent       TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_email
    ON email_suppressions(email_normalized);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_created
    ON email_suppressions(created_at DESC);

-- Convenience: lowercase + trim for normalised lookups
CREATE OR REPLACE FUNCTION normalize_email(input TEXT)
RETURNS TEXT AS $$
    SELECT lower(trim(input));
$$ LANGUAGE SQL IMMUTABLE;

COMMENT ON TABLE email_suppressions IS
    'Permanent record of opt-outs. Checked before every outbound send. Do not delete rows.';

COMMENT ON COLUMN email_suppressions.reason IS
    'Free text: unsubscribe_link | unsubscribe_reply | bounce | spam_complaint | manual | gdpr_erasure';

COMMENT ON COLUMN email_suppressions.source IS
    'unsubscribe_endpoint | gas_reply_scanner | bounce_handler | admin_panel | data_subject_request';
