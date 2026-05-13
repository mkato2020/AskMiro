-- ============================================================
-- Migration 010 — Outreach Readiness Layer (DOWN)
-- Reverts the additive changes from 010_outreach_readiness.sql
--
-- SAFETY:
--   - Drops only the tables and columns this migration added.
--   - email_suppressions is shared with email_guard.py — we only
--     drop the column WE added (`domain`), never the table.
--   - Schema-migrations row is deleted last.
--   - Wrapped in transaction by the runner.
-- ============================================================

-- ── Drop indexes on entities ────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_entities_readiness;
DROP INDEX IF EXISTS idx_entities_readiness_score;
DROP INDEX IF EXISTS idx_entities_hvt_tier;
DROP INDEX IF EXISTS idx_entities_enrichment;

-- ── Drop tables created by 010 ──────────────────────────────────────────────
DROP TABLE IF EXISTS autopilot_safety_events    CASCADE;
DROP TABLE IF EXISTS readiness_score_history    CASCADE;
DROP TABLE IF EXISTS outreach_human_review      CASCADE;
DROP TABLE IF EXISTS outreach_events            CASCADE;
DROP TABLE IF EXISTS contact_enrichment_queue   CASCADE;

-- ── email_suppressions: only drop the column WE added ──────────────────────
-- (email_guard.ensure_tables() may have created the rest of the table)
ALTER TABLE email_suppressions DROP COLUMN IF EXISTS domain;

-- ── Drop columns added to entities (all 20) ────────────────────────────────
ALTER TABLE entities
    DROP COLUMN IF EXISTS outreach_readiness_status,
    DROP COLUMN IF EXISTS outreach_readiness_score,
    DROP COLUMN IF EXISTS contact_quality_score,
    DROP COLUMN IF EXISTS email_quality_score,
    DROP COLUMN IF EXISTS authority_score,
    DROP COLUMN IF EXISTS sector_value_score,
    DROP COLUMN IF EXISTS location_fit_score,
    DROP COLUMN IF EXISTS revenue_potential_score,
    DROP COLUMN IF EXISTS deliverability_risk_score,
    DROP COLUMN IF EXISTS enrichment_required,
    DROP COLUMN IF EXISTS enrichment_reason,
    DROP COLUMN IF EXISTS suppression_reason,
    DROP COLUMN IF EXISTS recommended_next_action,
    DROP COLUMN IF EXISTS last_readiness_checked_at,
    DROP COLUMN IF EXISTS hvt_tier,
    DROP COLUMN IF EXISTS outreach_sent_count,
    DROP COLUMN IF EXISTS outreach_last_sent_at,
    DROP COLUMN IF EXISTS outreach_status_gas,
    DROP COLUMN IF EXISTS bounce_detected,
    DROP COLUMN IF EXISTS bounce_detected_at;

-- ── Drop ENUMs last (after all dependents are gone) ────────────────────────
DROP TYPE IF EXISTS hvt_tier;
DROP TYPE IF EXISTS mail_direction;
DROP TYPE IF EXISTS outreach_event_type;
DROP TYPE IF EXISTS outreach_readiness;

-- ── Remove the schema_migrations record ────────────────────────────────────
DELETE FROM schema_migrations WHERE version = 10;
