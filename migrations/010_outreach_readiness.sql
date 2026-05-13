-- ============================================================
-- Migration 010 — Outreach Readiness Layer
-- AskMiro: separates contact-ready leads from the rest
-- ============================================================

-- ── ENUMS ──────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE outreach_readiness AS ENUM (
        'READY_FOR_OUTREACH',
        'NEEDS_CONTACT_ENRICHMENT',
        'NEEDS_EMAIL_VERIFICATION',
        'NEEDS_DECISION_MAKER',
        'PHONE_FIRST',
        'HIGH_VALUE_NOT_CONTACTABLE',
        'SUPPRESSED_BAD_EMAIL',
        'SUPPRESSED_LOW_VALUE',
        'SUPPRESSED_WRONG_SECTOR',
        'SUPPRESSED_DUPLICATE',
        'MANUAL_REVIEW'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE outreach_event_type AS ENUM (
        'OUTREACH_READY',
        'EMAIL_SENT',
        'FOLLOW_UP_SENT',
        'FINAL_FOLLOW_UP_SENT',
        'REPLY_RECEIVED',
        'MACHINE_MAIL_DETECTED',
        'BOUNCE_DETECTED',
        'UNSUBSCRIBE_DETECTED',
        'LEAD_SUPPRESSED',
        'LEAD_QUALIFIED',
        'HUMAN_REVIEW_REQUIRED',
        'SEQUENCE_COMPLETED',
        'CONTACT_ENRICHED',
        'READINESS_SCORED',
        'OWN_EMAIL_DETECTED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE mail_direction AS ENUM (
        'OUTBOUND_ASKMIRO',
        'INBOUND_HUMAN',
        'INBOUND_MACHINE',
        'BOUNCE',
        'OUT_OF_OFFICE',
        'AUTO_REPLY',
        'UNSUBSCRIBE',
        'FORWARDING_NOTICE',
        'DELIVERY_STATUS_NOTIFICATION',
        'UNKNOWN'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hvt_tier AS ENUM ('A', 'B', 'C', 'D');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── READINESS COLUMNS ON ENTITIES ───────────────────────────────────────

ALTER TABLE entities ADD COLUMN IF NOT EXISTS outreach_readiness_status outreach_readiness;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS outreach_readiness_score   SMALLINT DEFAULT 0;  -- 0–100
ALTER TABLE entities ADD COLUMN IF NOT EXISTS contact_quality_score      SMALLINT DEFAULT 0;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS email_quality_score        SMALLINT DEFAULT 0;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS authority_score            SMALLINT DEFAULT 0;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS sector_value_score         SMALLINT DEFAULT 0;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS location_fit_score         SMALLINT DEFAULT 0;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS revenue_potential_score    SMALLINT DEFAULT 0;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS deliverability_risk_score  SMALLINT DEFAULT 0;  -- higher = worse
ALTER TABLE entities ADD COLUMN IF NOT EXISTS enrichment_required        BOOLEAN DEFAULT FALSE;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS enrichment_reason          TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS suppression_reason         TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS recommended_next_action    TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS last_readiness_checked_at  TIMESTAMPTZ;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS hvt_tier                   hvt_tier;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS outreach_sent_count        INT DEFAULT 0;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS outreach_last_sent_at      TIMESTAMPTZ;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS outreach_status_gas        TEXT;   -- mirrors GAS sheet status
ALTER TABLE entities ADD COLUMN IF NOT EXISTS bounce_detected            BOOLEAN DEFAULT FALSE;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS bounce_detected_at         TIMESTAMPTZ;

-- ── CONTACT ENRICHMENT QUEUE ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_enrichment_queue (
    id                      SERIAL PRIMARY KEY,
    entity_id               BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    enrichment_status       TEXT NOT NULL DEFAULT 'pending',  -- pending|in_progress|done|failed|skipped
    enrichment_attempts     INT DEFAULT 0,
    enriched_contact_name   TEXT,
    enriched_contact_role   TEXT,
    enriched_contact_email  TEXT,
    enriched_contact_phone  TEXT,
    enriched_contact_source TEXT,   -- companies_house|linkedin|website|google_maps|manual
    enrichment_confidence   FLOAT DEFAULT 0,
    enrichment_notes        TEXT,
    enrichment_priority     SMALLINT DEFAULT 5,  -- 1=urgent, 10=low
    last_enriched_at        TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id)
);

CREATE INDEX IF NOT EXISTS idx_enrich_queue_status   ON contact_enrichment_queue(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_enrich_queue_priority ON contact_enrichment_queue(enrichment_priority, entity_id)
    WHERE enrichment_status IN ('pending', 'failed');

-- ── OUTREACH EVENT LOG (GAS → Postgres sync) ────────────────────────────

CREATE TABLE IF NOT EXISTS outreach_events (
    id              BIGSERIAL PRIMARY KEY,
    entity_id       BIGINT REFERENCES entities(id) ON DELETE SET NULL,
    lead_email      TEXT,
    company_name    TEXT,
    event_type      outreach_event_type NOT NULL,
    event_ts        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_system   TEXT DEFAULT 'gas',   -- gas|python|manual
    thread_id       TEXT,
    message_id      TEXT,
    mail_direction  mail_direction,
    confidence      TEXT,                 -- rule|ai|fallback|manual
    notes           TEXT,
    old_status      TEXT,
    new_status      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_entity     ON outreach_events(entity_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_type       ON outreach_events(event_type, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_email      ON outreach_events(lead_email, event_ts DESC);

-- ── HUMAN REVIEW QUEUE (replaces GAS needsHumanAction flag) ─────────────

CREATE TABLE IF NOT EXISTS outreach_human_review (
    id                  SERIAL PRIMARY KEY,
    entity_id           BIGINT REFERENCES entities(id) ON DELETE SET NULL,
    gas_lead_id         TEXT,           -- row id in GAS Leads sheet
    company_name        TEXT,
    contact_email       TEXT,
    review_category     TEXT NOT NULL,  -- see categories below
    /*
        TRUE_HUMAN_REVIEW        — genuine human reply, needs Mike
        HOT_REPLY                — positive/interested reply
        QUOTE_REQUEST            — asked for a quote
        CALL_REQUEST             — asked to call them
        AUTO_RESOLVED_OWN_FOLLOWUP — was AskMiro's own email, auto-dismissed
        AUTO_RESOLVED_MACHINE_MAIL  — bounce/OOO/DSN, auto-dismissed
        AUTO_RESOLVED_BOUNCE        — hard bounce, sequence stopped
        AUTO_RESOLVED_NO_REPLY      — no actual inbound found
        WRONG_CONTACT               — redirected to different person
        NEEDS_CONTACT_ENRICHMENT    — no named contact, needs research
        SUPPRESSED_BAD_EMAIL        — bad email found, suppressed
        SUPPRESSED_LOW_VALUE        — low value, removed from queue
    */
    reply_summary       TEXT,
    recommended_action  TEXT,
    thread_id           TEXT,
    message_preview     TEXT,          -- first 200 chars of reply
    is_resolved         BOOLEAN DEFAULT FALSE,
    resolved_by         TEXT,
    resolved_at         TIMESTAMPTZ,
    resolution_note     TEXT,
    needs_mike_action   BOOLEAN DEFAULT FALSE,
    gas_human_reason    TEXT,          -- original humanActionReason from GAS
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_human_review_unresolved ON outreach_human_review(is_resolved, needs_mike_action)
    WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_human_review_category   ON outreach_human_review(review_category, is_resolved);

-- ── SUPPRESSION LIST (extended from email_guard.py) ─────────────────────

-- email_suppressions may already be created by email_guard.ensure_tables().
-- Create if missing, then ALTER ADD COLUMN IF NOT EXISTS to add new columns
-- without conflicting with the pre-existing schema.
CREATE TABLE IF NOT EXISTS email_suppressions (
    id              SERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    reason          TEXT NOT NULL DEFAULT 'unknown',
    source          TEXT NOT NULL DEFAULT 'system',
    active          BOOLEAN DEFAULT TRUE,
    suppressed_at   TIMESTAMP DEFAULT NOW()
);
ALTER TABLE email_suppressions ADD COLUMN IF NOT EXISTS domain TEXT;

CREATE INDEX IF NOT EXISTS idx_suppression_email  ON email_suppressions(email) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_suppression_domain ON email_suppressions(domain) WHERE active = TRUE;

-- ── READINESS SCORE HISTORY (audit trail) ───────────────────────────────

CREATE TABLE IF NOT EXISTS readiness_score_history (
    id              BIGSERIAL PRIMARY KEY,
    entity_id       BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    scored_at       TIMESTAMPTZ DEFAULT NOW(),
    readiness_status outreach_readiness,
    readiness_score SMALLINT,
    contact_quality SMALLINT,
    email_quality   SMALLINT,
    authority       SMALLINT,
    sector_value    SMALLINT,
    deliverability_risk SMALLINT,
    reasons         JSONB
);

CREATE INDEX IF NOT EXISTS idx_readiness_history_entity ON readiness_score_history(entity_id, scored_at DESC);

-- ── AUTOPILOT SAFETY LOG ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS autopilot_safety_events (
    id              SERIAL PRIMARY KEY,
    triggered_at    TIMESTAMPTZ DEFAULT NOW(),
    event_type      TEXT NOT NULL,  -- PAUSED|BLOCKED|RESUMED|THRESHOLD_BREACH
    trigger_reason  TEXT,
    metric_name     TEXT,
    metric_value    FLOAT,
    threshold       FLOAT,
    resolved        BOOLEAN DEFAULT FALSE,
    resolved_at     TIMESTAMPTZ,
    notes           TEXT
);

-- ── INDEXES ON ENTITIES FOR READINESS QUERIES ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_entities_readiness      ON entities(outreach_readiness_status);
CREATE INDEX IF NOT EXISTS idx_entities_readiness_score ON entities(outreach_readiness_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_entities_hvt_tier       ON entities(hvt_tier) WHERE hvt_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_enrichment     ON entities(enrichment_required) WHERE enrichment_required = TRUE;
