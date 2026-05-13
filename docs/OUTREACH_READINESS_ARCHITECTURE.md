# Outreach Readiness Layer — Architecture & Migration Plan

**Status:** PROPOSED — no schema mutation yet
**Author:** Claude (Senior Architect mode)
**Reviewer required:** Mike
**Migration version:** 010
**Last updated:** 2026-05-13

---

## 1. Source-of-truth hierarchy

The current system is split-brain across three stores. This document codifies who owns what going forward.

| Domain | Authoritative store | Mirrored to | Why |
|---|---|---|---|
| Entity master data (name, sector, borough, website, phone) | **Postgres** `entities` | GAS Sheet (read-only on demand) | Scraped + enriched server-side; GAS doesn't write entity facts |
| Outreach readiness (score, status, tier, suppression reason) | **Postgres** `entities` (readiness columns) + `readiness_score_history` | exposed to GAS via `/api/leads/entity/{id}` | Scoring runs in Python; GAS reads but never writes scores |
| Outreach progress (CONTACTED, FOLLOW_UP_n, threadId) | **GAS Sheet `Leads`** | mirrored to Postgres `outreach_events` (event-sourced) | GAS is the live operator UI; Postgres is the audit trail |
| Email content (subject, body, attachments, send result) | **Gmail** | logged to `email_send_log` | Gmail is the actual mail store |
| Reply detection + classification | **Gmail thread state** | mirrored to Postgres `outreach_events` (`REPLY_RECEIVED` / `BOUNCE_DETECTED`) | Read-only from Gmail; written to PG once classified |
| Suppression list | **Postgres** `email_suppressions` | GAS reads via API before every send | Single source of truth; GAS would diverge if it held its own copy |
| Pipeline stage (new → won) | **Postgres** `opportunities` | GAS Sheet (read-only on Sales tab) | Already migrated to PG |

**Hard rule:** any field listed above has **exactly one writer**. If two systems need to mutate the same field, one of them is wrong.

---

## 2. Migration ownership

**Single owner:** `migrations/runner.py` — a controlled Python migration runner.

| What | Rule |
|---|---|
| Schema mutations | ONLY through the runner. No direct `psql -f`, no Railway dashboard SQL pad. |
| Migration files | `migrations/NNN_name.sql` — sequentially numbered, never renamed |
| Versioning table | `schema_migrations(version, name, applied_at, checksum, applied_by)` |
| Re-running an applied migration | Refused by checksum match |
| Re-running a modified migration | Refused with mismatch error (forces a new migration file) |
| Down migrations | `migrations/NNN_name.down.sql` — must exist for every up |
| Access | Two paths: CLI (`python migrate.py up 010 --confirm`) for ops, `POST /api/admin/migrations/run` (token-gated) for emergency |

The runner is itself committed code and reviewed via diff. There is no "ad-hoc DB shell" path.

---

## 3. Rollback strategy

### Per-migration
Every migration is wrapped in a single transaction:
```sql
BEGIN;
-- statements
INSERT INTO schema_migrations (version, name, checksum, applied_by)
  VALUES (10, 'outreach_readiness', '<sha256>', '<actor>');
COMMIT;
```
If any statement fails, PG rolls back the whole migration. The `schema_migrations` row is not written, so the runner sees the migration as unapplied on next run.

### Post-apply rollback (the hard case)
Migration 010 is **purely additive** (ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS). Rollback options:

| Failure mode | Rollback action |
|---|---|
| Migration aborts mid-way | Auto-rollback via wrapping transaction. No manual action needed. |
| Migration applies cleanly but scoring produces bad data | `UPDATE entities SET outreach_readiness_status = NULL, outreach_readiness_score = 0, last_readiness_checked_at = NULL` — data rollback, schema stays. |
| Migration applies cleanly but new tables cause problems | `010_outreach_readiness.down.sql` drops the 6 new tables + drops the 20 added columns. Schema rollback. Existing data on `entities` is untouched. |
| `readiness_gate` causes prod outreach outage | GAS-side kill switch: a `CFG.READINESS_GATE_ENABLED = false` flag in Code.gs flips off the gate without redeploying. Already fail-open on API errors, but this lets us deliberately disable it. |

### Down migration for 010
```sql
BEGIN;
DROP INDEX IF EXISTS idx_entities_readiness, idx_entities_readiness_score,
                     idx_entities_hvt_tier, idx_entities_enrichment;
DROP TABLE IF EXISTS autopilot_safety_events, readiness_score_history,
                     outreach_human_review, outreach_events,
                     contact_enrichment_queue CASCADE;
-- email_suppressions is shared with email_guard — DO NOT DROP, only drop
-- the columns this migration added
ALTER TABLE email_suppressions DROP COLUMN IF EXISTS domain;

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

DROP TYPE IF EXISTS hvt_tier, mail_direction,
                    outreach_event_type, outreach_readiness;

DELETE FROM schema_migrations WHERE version = 10;
COMMIT;
```

Because nothing in the entities table existed before this migration that we're dropping, **no production data is at risk in a down-migration**. The only data lost is whatever the readiness engine has scored — which is regeneratable from a single `python readiness.py --all` run.

---

## 4. Sync architecture — GAS ↔ Postgres

### Read paths (Postgres → GAS)
| GAS function | Endpoint | Cardinality | Failure mode |
|---|---|---|---|
| `readiness_gate(entity)` before each send | `GET /api/leads/entity/{id}` | 1 call per send (~50/day max) | **Fail-open** — send proceeds. Logged. |
| Outreach dashboard "Ready queue" | `GET /api/outreach/readiness/queue?status=READY_FOR_OUTREACH` | 1 call per dashboard load | Falls back to GAS sheet view |
| Suppression check fallback | `GET /api/email/suppression-list?email=X` | 1 call when no entity_id | Fail-open |

### Write paths (GAS → Postgres)
Single bus: `POST /api/outreach/event` — append-only event log.

| GAS event | event_type | Triggers entity-level mutation? |
|---|---|---|
| Initial email sent | `EMAIL_SENT` | Yes — increments `outreach_sent_count`, sets `outreach_last_sent_at` |
| Follow-up sent | `FOLLOW_UP_SENT` | Same |
| Final follow-up sent | `FINAL_FOLLOW_UP_SENT` | Same |
| Human reply detected | `REPLY_RECEIVED` | No — events table only |
| Bounce DSN detected | `BOUNCE_DETECTED` | Yes — sets `bounce_detected=true`, sets `outreach_readiness_status='SUPPRESSED_BAD_EMAIL'`, adds to `email_suppressions` |
| Unsubscribe detected | `UNSUBSCRIBE_DETECTED` | Yes — sets status to SUPPRESSED_BAD_EMAIL |
| OOO / machine reply | `MACHINE_MAIL_DETECTED` | No — events table only |

Event writes are **best-effort, non-blocking**: a Railway outage during a send produces a GAS log entry but doesn't break the send. The event reconciler (out of scope for this commit) can backfill missed events from the Gmail label `AskMiro Outreach`.

### Conflict prevention
Because the writers are partitioned by field (Postgres writes scores; GAS writes outreach_sent_count via events; both never write the same row simultaneously), no row-level conflicts are possible. The one shared mutable field — `outreach_readiness_status` — is written by Postgres on score, but can be force-set to `SUPPRESSED_BAD_EMAIL` by GAS bounce/unsubscribe handlers. This is intentional: GAS-detected bounce is real-time evidence of bad email, and overrides the score.

---

## 5. Event consistency model

The system is **eventually consistent** with the following bounds:

| Event | Detected by | Visible in Postgres within |
|---|---|---|
| Send completed | GAS, synchronously | <2s of GmailApp.sendEmail() returning |
| Reply received | GAS, every 2h trigger | ≤2h after Gmail receives it |
| Bounce DSN | GAS, every 2h trigger | ≤2h, plus the email is suppressed before next send cycle (4h trigger) |
| Readiness rescored | Python, on-demand or scheduled | Within batch runtime (≤5min for 1000 leads) |

**Ordering guarantee:** events table is timestamp-ordered (`event_ts DESC`). If two events arrive out of order due to GAS trigger overlap, the latest applied wins for any entity-column mutation. The events table itself preserves both rows for audit.

**Idempotency:** event writes use `(entity_id, event_type, thread_id, event_ts)` as a logical key. The reconciler dedupes on these four fields. We do not enforce a UNIQUE constraint because legitimate retries within a thread are valid (e.g., two follow-ups in one thread).

---

## 6. Audit preservation

Three layers of audit:

1. **`outreach_events`** — every send, reply, bounce, classification, status change. Append-only. Never updated, never deleted.
2. **`readiness_score_history`** — every time a lead is scored, the score + status + reasons JSON are appended. Lets us answer "why did this lead get suppressed in March?"
3. **Gmail thread itself** — the actual sent message is the ultimate record. Postgres references thread_id and message_id; the bodies are recoverable from Gmail.

No data is destroyed by Migration 010. Existing `outreach_status`, `outreach_status_gas`, `email_validation_status` columns are preserved unchanged.

---

## 7. Dependency graph

```
                  ┌─────────────────┐
                  │  Migration 010  │
                  │  (schema only)  │
                  └────────┬────────┘
                           │
              ┌────────────┴───────────┐
              │                        │
        ┌─────▼──────┐         ┌──────▼────────┐
        │ readiness  │         │ outreach_     │
        │ columns on │         │ events table  │
        │ entities   │         └──────┬────────┘
        └──┬─────────┘                │
           │                          │
   ┌───────▼────────┐         ┌───────▼────────────┐
   │ readiness.py   │         │ POST /api/         │
   │ scoring engine │         │ outreach/event     │
   └───────┬────────┘         └───────▲────────────┘
           │                          │
   ┌───────▼────────┐         ┌───────┴────────────┐
   │ /api/outreach/ │         │ GAS outreach.gs    │
   │ readiness/...  │         │ + readiness.gs     │
   └───────▲────────┘         └───────▲────────────┘
           │                          │
           └──────┐         ┌─────────┘
                  │         │
              ┌───▼─────────▼──┐
              │ React UI / GAS │
              │ dashboards     │
              └────────────────┘
```

**Critical observation:** the migration is a leaf dependency. Code referencing the new columns is non-blocking (fail-open) until the migration runs. No code path requires the schema change to function — it just becomes more accurate after.

---

## 8. Affected-table impact analysis

| Table | Operation | Rows affected at apply time | Lock duration estimate | Existing queries broken? |
|---|---|---|---|---|
| `entities` | ADD 20 nullable columns | 0 (Postgres ≥11 stores DEFAULT in catalog, no rewrite) | ~50ms ACCESS EXCLUSIVE | No — all new columns, no existing query references them |
| `email_suppressions` | ADD COLUMN domain | 0 (already nullable, no rewrite) | ~10ms | No — `domain` is optional in queries |
| `contact_enrichment_queue` | CREATE | n/a (new table) | n/a | No |
| `outreach_events` | CREATE | n/a | n/a | No |
| `outreach_human_review` | CREATE | n/a | n/a | No |
| `readiness_score_history` | CREATE | n/a | n/a | No |
| `autopilot_safety_events` | CREATE | n/a | n/a | No |
| 4 new indexes on entities | CREATE INDEX IF NOT EXISTS | scans 62k rows | ~2-5s SHARE lock — does not block reads/inserts | No — but cannot use CONCURRENTLY inside a transaction (see §10) |

**Estimated total migration time:** under 10 seconds for 62k entities.
**Locks taken on `entities`:** ACCESS EXCLUSIVE for ~50ms (ALTER), SHARE for ~5s (index builds). Reads continue; concurrent INSERTs from the API briefly block.

---

## 9. Idempotent migration behaviour

| Statement form | Idempotent? | Notes |
|---|---|---|
| `CREATE TYPE … EXCEPTION WHEN duplicate_object` | ✅ | DO block catches conflict |
| `ALTER TABLE … ADD COLUMN IF NOT EXISTS` | ✅ | Built-in |
| `CREATE TABLE IF NOT EXISTS` | ✅ | Built-in |
| `CREATE INDEX IF NOT EXISTS` | ✅ | Built-in |
| `INSERT INTO schema_migrations` | ⚠️ | Will conflict on second run — the runner checks BEFORE attempting, so this is by-design |

**Runner-enforced idempotency:**
- Before applying: `SELECT 1 FROM schema_migrations WHERE version = 10` → if exists, refuse with "already applied at X by Y".
- Checksum check: stored checksum must match current file. If file was modified post-apply, refuse with "migration drift — create a new migration number".

---

## 10. How long-running GAS jobs are protected

GAS triggers run on Google's clock, not Railway's. During the migration window:

| GAS trigger | Frequency | What happens during migration |
|---|---|---|
| `autoSendOutreach` | every 4h | If it fires during migration (~10s): `readiness_gate()` fails-open on Railway timeout, sends proceed. Worst case: 1–20 sends bypass the (currently uninstalled) gate. Acceptable. |
| `scanOutreachReplies` | every 2h | Pre-classifier runs locally in GAS, no Railway dependency. The `_log_outreach_event_gas` call may 502 — non-fatal, replies are still classified. |
| Trigger overlap | n/a | Locked via `LockService` in autoSendOutreach (already present at line 244 of outreach.gs). |

**Index creation concurrency:** Migration 010 currently uses `CREATE INDEX IF NOT EXISTS` (not `CONCURRENTLY`). For a 62k-row table this is sub-5-second and acceptable. **If the entities table grows past 1M rows, future migrations should use `CREATE INDEX CONCURRENTLY` outside the transaction.** Note: `CONCURRENTLY` cannot be used inside a `BEGIN/COMMIT` block — so an index-only migration would have to run outside the wrapping transaction. For 010, in-transaction is fine.

---

## 11. Phased migration order

| Step | Action | System affected | Verification | Reversible? |
|---|---|---|---|---|
| **0** | Commit code (Phases 1–5) — DONE | local git | `git log` | Yes — `git reset --soft HEAD~1` |
| **1** | Build migration runner | local files | `python migrate.py list` shows 010 pending | Yes |
| **2** | Code review of architecture doc + runner + migration | n/a | Mike approves | n/a |
| **3** | Push to GitHub → Railway redeploy (Python only, no schema yet) | Railway Python | `curl /api/outreach/readiness/summary` returns JSON not HTML; will error on missing tables but the endpoint exists | Yes — revert commit |
| **4** | Apply Migration 010 via runner `--dry-run` | local | Prints SQL that would run | Yes — no-op |
| **5** | Apply Migration 010 for real | Postgres prod | `\d entities` shows 20 new columns; 6 new tables exist | Yes — down migration |
| **6** | Smoke test: rescore ONE known entity | Postgres prod | Single row in `readiness_score_history` | Yes — UPDATE row back |
| **7** | Dry-run batch of 100 | none (read-only Postgres) | Distribution printed; no writes | Yes |
| **8** | Live batch of 1000 | Postgres prod (writes scores) | Status breakdown matches expectation | Yes — reset 1000 rows |
| **9** | Full batch (62k entities) | Postgres prod | Summary endpoint returns final counts | Yes — full rescore reset |
| **10** | Verify `readiness_gate` is actively gating | end-to-end | Next autoSend cycle logs `outreach_events` rows | n/a — observability only |
| **11** | Tune scoring weights based on initial distribution | local code | Re-deploy → re-run | Yes |

**Gates between steps:** Mike approves explicitly before steps 5, 9, and 11. Steps 4, 6, 7, 8 are read-mostly or single-row writes and proceed automatically once 5 is approved.

---

## 12. Open questions for review

Before applying Migration 010, the following need Mike's explicit answer:

1. **Are the 8 scoring weights right?** Defaults are contact_quality 25% / email_quality 25% / authority 15% / sector_value 15% / location_fit 10% / revenue_potential 10%. Adjust if you weight authority or location higher.
2. **HVT Tier A threshold** — currently score ≥72 and sector_value ≥70. This will compress 99% HVT down to ~5–10%. Want tighter or looser?
3. **Suppression threshold** — currently `sector_value < 20` auto-suppresses ("other" sector). This may catch valid leads in unusual sectors. Want to switch to MANUAL_REVIEW instead?
4. **Re-score cadence** — currently 7 days. Faster (daily) means score reflects fresh enrichment quickly; slower (monthly) means less load. 7 days is the default.

---

## 13. Sign-off

This document is the architecture contract. No schema mutation runs until Mike has reviewed sections 1–12 and signed off on the open questions in §12.

| | Name | Date | Approves §1–§11 | Decides §12 |
|---|---|---|---|---|
| Author | Claude | 2026-05-13 | ✅ | n/a |
| Reviewer | Mike | pending | | |

