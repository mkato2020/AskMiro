-- Migration 012 — rollback
-- WARNING: dropping this table loses every opt-out record.
-- Only run if you have an alternative suppression system in place.

DROP FUNCTION IF EXISTS normalize_email(TEXT);
DROP TABLE IF EXISTS email_suppressions;
