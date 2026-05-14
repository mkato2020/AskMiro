# W2 — Ingestion Normalization Plan

**Status:** DESIGN. No code change. No deploy.
**Author:** Claude
**Reviewer:** Mike
**Date:** 2026-05-14
**Depends on:** `QUEUE_SEMANTIC_VALIDATION.md` (defect taxonomy)
**Empirical justification:** 5 ingestion-corruption defect classes proven live in the queue

---

## §1 — Empirical defect catalog

Five classes of ingestion corruption have been observed live in the production data. Each is a distinct failure of the same root cause: **the scraper emits transport artifacts directly into business state**, with no normalization barrier between layers.

| Class | Example | Root cause | Currently handled by |
|---|---|---|---|
| Placeholder contacts | `name@domain.com`, `youraddress@domain.com` | Web extraction grabbed example/template text from a contact page | Nothing — leaks through |
| URL-encoding leakage | `%20info@askmiro.com` | Scraper failed to URL-decode `%20` (encoded space) before storing | Nothing — leaks through |
| Unicode-escape leakage | `u003equeenadelaide@youngs.co.uk` | Scraper failed to unescape `u003e` (encoded `>`) before storing | Nothing — leaks through |
| Multi-address concatenation | `info@x.com - hola@x.com - studentsupport@x.com` | Multiple mailto links on a page joined with `" - "` separators into one cell | Nothing — leaks through |
| Cross-entity contamination | Mayflower Pub assigned `hello@thegeorgeanddragonpub.com` | Two leads share a domain or one lead's email was copy-pasted into another's record at extraction time | Nothing — leaks through, manifests as WRONG_CONTACT replies |
| Truncated/malformed TLDs | `pigearpub.com.com`, `bse.ac` | Regex over-matching during scrape | Nothing — leaks through |

All five reach the outreach pipeline. Each one consumes operator cognition that should have been spent on real business judgment.

## §2 — The five-stage architecture

Ingestion becomes a pipeline with explicit barriers between stages. A row cannot move forward until it passes the current stage's contract.

```
   ┌────────────────────────────────────────────────────────────┐
   │  Stage 1 — RAW SCRAPE                                      │
   │  Purpose: Capture what the source page actually says       │
   │  Output: raw_source_records table (already exists in PG)   │
   │  Contract: stores ANY data, no validation                  │
   │  Authority: scraper.py / connectors                        │
   └────────────────────┬───────────────────────────────────────┘
                        │ (transport state)
                        ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Stage 2 — NORMALIZATION                                   │
   │  Purpose: Decode all transport encodings; strip artefacts  │
   │  Operations:                                               │
   │    - URL-decode (%20, %3A, etc.)                           │
   │    - Unicode-unescape (u003e, &#x..., &amp;)               │
   │    - HTML entity decoding (&nbsp;, &quot;)                  │
   │    - Whitespace collapse                                   │
   │    - Multi-value splitting (e.g. comma/semicolon/dash      │
   │      separators in email fields)                           │
   │  Contract: every field has only canonical bytes            │
   │  Rejection: if decoding fails or yields invalid output,    │
   │              row is flagged DECODE_FAILED                  │
   │  New table: normalized_source_records                      │
   └────────────────────┬───────────────────────────────────────┘
                        │ (canonical bytes)
                        ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Stage 3 — VALIDATION                                      │
   │  Purpose: Enforce schema and format constraints            │
   │  Uses existing libraries:                                  │
   │    - email_guard.py:validate_format (RFC check, blocked    │
   │      prefixes, role-prefix detection)                      │
   │    - email_guard.py:check_domain (DNS/MX lookup)           │
   │    - email_quality.py:run_quality_check (placeholder       │
   │      detection, free-mail flagging, catch-all check)       │
   │  Contract: every email passes RFC + has MX records         │
   │  Rejection: invalid_format → INVALID_CONTACT terminal      │
   │              domain_not_found → SUPPRESSED                  │
   │              placeholder_detected → PLACEHOLDER_CONTACT     │
   │  These libraries already exist server-side. The fix is to  │
   │  CALL THEM HERE, at ingest time, not downstream when       │
   │  Gmail tries to send and bounces.                          │
   └────────────────────┬───────────────────────────────────────┘
                        │ (validated records)
                        ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Stage 4 — ENTITY RESOLUTION                                │
   │  Purpose: Merge duplicates, detect conflicts                │
   │  Operations:                                               │
   │    - Match (canonical_name, postcode) to existing entities │
   │    - Match (primary_email) across entities — flag conflicts│
   │    - Match (companies_house_number) when available         │
   │    - 1:1 enforcement: same email cannot be assigned to     │
   │      two different entities                                │
   │  Contract: every email is uniquely owned by one entity     │
   │  Rejection: cross-entity collision → ENTITY_CONFLICT       │
   │              held for human resolution before promotion    │
   │  Already partial: entity_resolution.py exists; needs       │
   │  hardening + UNIQUE constraint on (primary_email)          │
   │  at the entities table level                               │
   └────────────────────┬───────────────────────────────────────┘
                        │ (resolved entities)
                        ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Stage 5 — CANONICAL LEAD                                  │
   │  Purpose: Promote to business state                        │
   │  Contract: row in `entities` table with primary_email,     │
   │            sector, borough, contact metadata               │
   │            ALL VALIDATED + ENTITY-RESOLVED                 │
   │  Authority: this is the ONLY layer that can produce        │
   │             eligible-for-outreach leads                    │
   │  Output: rows visible in /api/outreach/auto-queue          │
   │  Promotion to GAS: existing crm_push job (every 30 min     │
   │                    via APScheduler) — unchanged interface  │
   └────────────────────────────────────────────────────────────┘
```

## §3 — What this prevents at scale

For each defect class from §1, where it is now caught:

| Defect class | Caught at | Resulting state |
|---|---|---|
| Placeholder contacts (`name@domain.com`) | Stage 3 (email_quality.py:_PLACEHOLDER_RE) | `PLACEHOLDER_CONTACT` — never reaches GAS |
| URL-encoding leakage (`%20info@`) | Stage 2 (URL-decode would either fix or reveal as DECODE_FAILED) | Either normalized to `info@` OR rejected |
| Unicode-escape leakage (`u003e...`) | Stage 2 (Unicode-unescape) | Either normalized or rejected |
| Multi-address concatenation | Stage 2 (multi-value split) | Three separate candidate records, each independently validated |
| Cross-entity contamination | Stage 4 (UNIQUE constraint on primary_email) | `ENTITY_CONFLICT` — held for human review BEFORE reaching outreach |
| Truncated TLDs | Stage 3 (DNS lookup will fail) | `domain_not_found` → INVALID_CONTACT |

Operators never see any of these because the pipeline rejects them upstream. The human-review queue from §1 of the Semantic Validation doc no longer contains 88% infrastructure debt — because that infrastructure debt cannot enter the system in the first place.

## §4 — Files affected

| File | Change | New / Modified |
|---|---|---|
| `scraper.py` | Output now writes to `raw_source_records` only, never directly to `entities` | Modified |
| **`normalization.py`** | New module. Stage 2 operations: decode/unescape/split | **New** |
| `email_guard.py` | Already exists. Wired into Stage 3 as a hard gate (currently called post-enqueue). | Repositioned |
| `email_quality.py` | Already exists. Wired into Stage 3 alongside email_guard. | Repositioned |
| `entity_resolution.py` | Hardened with UNIQUE constraint on `entities.primary_email`. New rejection state `ENTITY_CONFLICT`. | Modified |
| **`ingestion_pipeline.py`** | New orchestrator. Runs Stage 1→2→3→4→5 sequentially per record. Emits events per stage transition. | **New** |
| `pg_schema.sql` / migration NN | Add `normalized_source_records` table. Add `INGESTION_REJECTED` enum on raw_source_records. Add UNIQUE constraint on entities.primary_email. | New migration |
| `run_pipeline.py` | Updated entry point. Replaces direct `scraper → entities` write with full 5-stage flow. | Modified |

## §5 — Backfill strategy for existing dirty data

The Leads sheet currently contains the ingestion debt from the past. Two backfill options:

### Option A — In-place reclassification (recommended)
- Run the 5-stage pipeline retroactively over all existing `entities` rows
- For each defect-class match: flag the entity with the appropriate terminal state in a new `ingestion_status` column
- DO NOT delete or mutate the entities — flag only
- Operators get a one-time view: "187 entities flagged as ingestion-debt; review/dismiss/repair"

### Option B — Fresh entities universe
- Mark the existing `entities` table as legacy
- Re-scrape known sources through the new 5-stage pipeline
- Only promote new clean records to active
- Migrate genuinely-good rows from legacy table by checksum

Option A preserves history and respects work already done. Option B is cleaner but costs re-scraping. Mike's call.

## §6 — Why this is the upstream root cause of W1 and W3

W1 (queue taxonomy) and W3 (classifier refactor) both presume the data flowing into outreach is at least syntactically valid. The queue's current 88% SELF_FOLLOWUP rate is partly a W3 problem (classifier confusing thread activity with engagement) but the **input quality** to W3 is a W2 problem.

Specifically:
- Of the 4 WRONG_CONTACT rows visible today, **3 are W2-territory defects**: Triyoga (bounce — Stage 3 should have caught), Mayflower (entity conflict — Stage 4 should have caught), Queen Adelaide (Unicode leakage — Stage 2 should have caught).
- Only 1 of 4 is a legitimate WRONG_CONTACT response from a real human (The Cavalier — bounced domain, but discovered via real reply).

So 75% of the "WRONG_CONTACT" bucket isn't a classifier problem at all. It's an ingestion problem leaking into the classifier.

**A "better classifier" cannot fix data that was already corrupted before the classifier ran.**

This is why W2 must precede W3.

## §7 — Activation sequence

| Phase | Action | Risk |
|---|---|---|
| A | Build `normalization.py` + unit tests against synthetic + observed defects | None — new code, unused |
| B | Build `ingestion_pipeline.py` orchestrator running stages but with `dry_run=true` default | None |
| C | Run pipeline in `dry_run` mode against existing raw_source_records (the full backfill set) | None — reports rejections without acting |
| D | Review rejection report with Mike — confirm rejection rules don't accidentally drop legitimate leads | Manual review only |
| E | Add migration NN for new tables + UNIQUE constraint via the runner | Low — additive, migration runner handles atomically |
| F | Enable new pipeline for FRESH scrapes only. Legacy entities unaffected. | Medium — new ingest path live |
| G | After 7 days of clean fresh-scrape observation, run backfill on existing entities (Option A flagging) | Medium — operator queue may temporarily inflate with flagged-legacy items |
| H | Operators triage flagged-legacy: dismiss / repair / suppress | Manual workload (one-time) |
| I | Drop UNIQUE-constraint-violation grace period; pipeline rejects new violations hard | Final state |

Total elapsed time: 3–5 weeks.

## §8 — Rollback per phase

| Phase | Rollback |
|---|---|
| A–B | Git revert; no deployed code change |
| C–D | No-op (dry-run only) |
| E | `migrations/runner.py down NN` |
| F | Revert ingestion_pipeline activation; new scrapes resume direct write to entities |
| G | Stop backfill mid-run; partial flags can be cleared via `UPDATE entities SET ingestion_status = NULL WHERE flagged_at > X` |
| H–I | Manual: revert any operator-applied state changes via audit log |

## §9 — Out of scope (deliberately)

- AI scrape improvements (smarter extraction of decision-maker name/role)
- Companies House cross-validation
- LinkedIn enrichment
- Phone number validation

These belong to a separate enrichment workstream. W2 is exclusively about **stopping bad data from reaching business state**, not about producing better-quality leads.

## §10 — Constraints honored

- ❌ No code change (design only)
- ❌ No deploy
- ❌ No mutation
- ❌ No flag flip
- ❌ No scraper modification
- ✅ Documentation only

## §11 — Sign-off

| | Name | Date | Reviewed |
|---|---|---|---|
| Author | Claude | 2026-05-14 | ✅ |
| Reviewer | Mike | pending | |
