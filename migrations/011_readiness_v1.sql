-- ============================================================
-- Migration 011 — Readiness v1 (validation gates + audit + chain seed)
-- AskMiro Scraper Enhancer Phase 1
--
-- Author:  Claude
-- Date:    2026-05-15
-- Cost:    £0. Schema-only. No data mutation beyond column defaults.
--
-- Coexistence note:
--   Migration 010 added `entities.outreach_readiness_status` (ENUM).
--   This migration adds `entities.readiness_state` (TEXT + CHECK).
--   They are independent columns; v1 writes only to readiness_state.
--   The existing 010 path continues to function unchanged.
--
-- Rollback: 011_readiness_v1.down.sql
-- ============================================================

BEGIN;

-- 1.1 entities: readiness + provenance columns ------------------------
ALTER TABLE entities
    ADD COLUMN IF NOT EXISTS readiness_state          TEXT,
    ADD COLUMN IF NOT EXISTS readiness_reason         TEXT,
    ADD COLUMN IF NOT EXISTS readiness_classified_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provenance               TEXT NOT NULL DEFAULT 'legacy_pre_v2';

-- CHECK constraint as NOT VALID first so existing rows aren't re-scanned.
-- Validation pass runs separately in §11 phase 2.5.
DO $$ BEGIN
    ALTER TABLE entities
        ADD CONSTRAINT entities_readiness_state_chk
        CHECK (readiness_state IS NULL OR readiness_state IN (
            'READY_FOR_OUTREACH',
            'NEEDS_CONTACT_ENRICHMENT',
            'PHONE_FIRST',
            'INVALID_CONTACT',
            'ENTITY_CONFLICT',
            'LOW_VALUE',
            'SUPPRESSED'
        )) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS ix_entities_readiness_state
    ON entities (readiness_state)
    WHERE readiness_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_entities_provenance
    ON entities (provenance);


-- 1.2 enrichment_events: audit trail of every gate decision ----------
CREATE TABLE IF NOT EXISTS enrichment_events (
    id               BIGSERIAL PRIMARY KEY,
    entity_id        BIGINT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    event_type       TEXT NOT NULL,
    event_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source           TEXT,
    source_url       TEXT,
    result           JSONB,
    confidence       NUMERIC(3,2),
    outcome          TEXT,
    rejection_reason TEXT,
    notes            TEXT
);

CREATE INDEX IF NOT EXISTS ix_enrichment_events_entity_time
    ON enrichment_events (entity_id, event_at DESC);

CREATE INDEX IF NOT EXISTS ix_enrichment_events_outcome
    ON enrichment_events (outcome, event_at DESC)
    WHERE outcome IN ('fail', 'flagged');


-- 1.3 chain_operators: curated allowlist for domain-fit ---------------
CREATE TABLE IF NOT EXISTS chain_operators (
    id            BIGSERIAL PRIMARY KEY,
    sector        TEXT NOT NULL,
    chain_name    TEXT NOT NULL,
    root_domain   TEXT NOT NULL,
    name_aliases  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    notes         TEXT,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (root_domain, chain_name)
);

CREATE INDEX IF NOT EXISTS ix_chain_operators_active_domain
    ON chain_operators (root_domain) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS ix_chain_operators_sector
    ON chain_operators (sector) WHERE active = TRUE;


-- 1.4 sector_shared_domains: NHS-style shared infrastructure ----------
CREATE TABLE IF NOT EXISTS sector_shared_domains (
    id           BIGSERIAL PRIMARY KEY,
    sector       TEXT NOT NULL,
    root_domain  TEXT NOT NULL,
    confidence   NUMERIC(3,2) NOT NULL DEFAULT 0.9,
    notes        TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (sector, root_domain)
);

COMMIT;
