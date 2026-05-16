-- ============================================================
-- Migration 011 DOWN — Readiness v1 rollback
-- Drops everything 011 added. Safe even if 011 partially applied.
-- ============================================================

BEGIN;

ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_readiness_state_chk;

DROP INDEX IF EXISTS ix_entities_readiness_state;
DROP INDEX IF EXISTS ix_entities_provenance;

ALTER TABLE entities
    DROP COLUMN IF EXISTS readiness_state,
    DROP COLUMN IF EXISTS readiness_reason,
    DROP COLUMN IF EXISTS readiness_classified_at,
    DROP COLUMN IF EXISTS provenance;

DROP TABLE IF EXISTS enrichment_events;
DROP TABLE IF EXISTS chain_operators;
DROP TABLE IF EXISTS sector_shared_domains;

COMMIT;
