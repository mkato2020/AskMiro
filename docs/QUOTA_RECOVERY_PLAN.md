# Quota Failure Recovery — Dry-Run Plan + v95 Patch

**Date:** 2026-05-13
**Status:** PLAN ONLY. No mutation. No deploy. No flag flipped.
**Authors:** Claude — built per guardrails in approval message
**Related:** `AUDIT_FINDINGS_2026-05-13.md`, `OUTREACH_QUEUE_FORENSIC_AUDIT.md`

---

## §0 — Confirmation: the 54 REPLIED rows are NOT touched

The candidate filter in `resetQuotaFailures()` requires **all four** conditions to match:

| # | Condition | Effect on 54 REPLIED rows |
|---|---|---|
| 1 | `leadDirection === 'outbound'` | passes |
| 2 | `needsHumanAction === 'true'` | passes |
| 3 | `replyStatus` is empty | ❌ FAILS — they have `replyStatus = 'REPLIED'` |
| 4 | `humanActionReason` starts with `send_error:` or `followup_error:` AND contains `too many times` | ❌ FAILS — they have `unclassified_reply` |

**Either condition 3 or 4 alone excludes every REPLIED row.** Both conditions together make the exclusion belt-and-braces. The function cannot reach a REPLIED row even if the input data is corrupted.

The dry-run output explicitly **counts and reports** any REPLIED rows it sees during scanning so we can verify the filter held.

---

## §1 — Dry-run function

### Location

`docs/templates/reset-quota-failures.gs.template` (companion file alongside this plan).
Outside `gas/`. Never reachable by `clasp push`.

### Run flow (read-only)

1. Paste into a throwaway `audit-reset.gs` file in GAS editor.
2. Run `resetQuotaFailures()`. Default arguments → dry-run mode.
3. Review chunked JSON output in execution log.
4. Delete the file.
5. **No mutation function is built in this iteration.** A future `applyResetQuotaFailures()` will be designed only after dry-run output is reviewed and approved row-by-row.

### Filter

```javascript
candidates = rows where:
  leadDirection === 'outbound'                                 AND
  String(needsHumanAction) === 'true'                          AND
  (!replyStatus || replyStatus === '')                         AND
  /^(send_error|followup_error):/.test(humanActionReason)      AND
  /(too many times|Service invoked too many)/i.test(humanActionReason)
```

Any row failing any condition is excluded and reported under `excluded_*` counters for audit transparency.

### Classification of matched rows

For each matched row, classify by current `outreachStatus` and `threadId` presence:

| Bucket | Match condition | Proposed transition |
|---|---|---|
| **resetToReady** | `outreachStatus === 'LOCKED_FOR_OUTREACH'` | Lock release: revert to `READY_FOR_OUTREACH`, clear human-action flags, preserve audit note. Lead will be re-attempted by next autoSend trigger. |
| **safeCloseFinal** | `outreachStatus === 'FINAL_FOLLOW_UP'` AND `!threadId` | Keep `FINAL_FOLLOW_UP`. Clear human-action flag only. No new send will ever happen because thread is missing and status is terminal. |
| **safeCloseFinalCompleted** | `outreachStatus === 'FINAL_FOLLOW_UP'` AND threadId present AND `followUpCount >= 3` (MAX_FOLLOW_UPS) | Keep `FINAL_FOLLOW_UP`. Clear flag. Sequence has run to completion; no retry needed. |
| **scheduledRetry** | `outreachStatus === 'FINAL_FOLLOW_UP'` AND threadId present AND `followUpCount < 3` | Revert to `FOLLOW_UP_2`, decrement `followUpCount`, set `nextFollowUpAt = now + 24h` so retry happens AFTER quota window resets. Clear flag. |
| **anomaly** | Matched the filter but `outreachStatus` is none of `LOCKED_FOR_OUTREACH` / `FINAL_FOLLOW_UP` | Reported, not transitioned. Requires human inspection. |

### Output (dry-run)

```jsonc
{
  "generatedAt":        "2026-05-13T...",
  "mode":               "dry_run",
  "leadsScanned":       405,
  "needsAttentionTotal": 305,

  // Filter audit
  "filter": {
    "matched":               247,    // expected ≈ 247
    "excluded_replyStatusSet": <count, must include all 54 REPLIED>,
    "excluded_reasonMismatch": <count>,
    "excluded_quotaTermMissing": <count>,
    "excluded_notOutbound": <count>,
    "excluded_notFlagged": <count>
  },

  // Verification
  "verification": {
    "repliedRowsSeenButNotTouched": 54,   // sanity check
    "filterIntegrityOk":            true  // = (matched + sum(excluded_*) === total scanned outbound)
  },

  // Proposed transitions
  "proposalCounts": {
    "resetToReady":            <expected ≈ 195>,
    "safeCloseFinal":          <count>,
    "safeCloseFinalCompleted": <count>,
    "scheduledRetry":          <count>,
    "anomaly":                 <count>      // expected 0
  },

  // 25 samples per bucket — full before/after preview
  "samples": {
    "resetToReady":            [ /* 25 */ ],
    "safeCloseFinal":          [ /* up to 25 */ ],
    "safeCloseFinalCompleted": [ /* up to 25 */ ],
    "scheduledRetry":          [ /* up to 25 */ ],
    "anomaly":                 [ /* up to 25 */ ]
  },

  // Audit log preview — what would be written to Outreach_AuditLog sheet
  "auditLogRowsPreview": [
    {
      "timestamp": "2026-05-13T...",
      "leadId": "LEAD-...",
      "action": "resetToReady",
      "actor":  "<dry_run_proposal>",
      "before": { /* full original state */ },
      "after":  { /* full proposed state */ },
      "originalReason": "send_error: Service invoked too many times for one day"
    }
    /* first 5 only — for size */
  ]
}
```

### Each row's before/after

#### resetToReady (≈195 rows)
```jsonc
{
  "id": "LEAD-...",
  "company": "...",
  "email": "...",
  "before": {
    "outreachStatus":   "LOCKED_FOR_OUTREACH",
    "needsHumanAction": "true",
    "humanActionReason": "send_error: Service invoked too many times for one day",
    "lastContactedAt":  "<timestamp>",
    "threadId":         "",
    "followUpCount":    "0"
  },
  "after": {
    "outreachStatus":   "READY_FOR_OUTREACH",
    "needsHumanAction": "false",
    "humanActionReason": "",
    "lastAuditNote":    "auto-reset 2026-05-13: send_error quota; lock released",
    // unchanged: lastContactedAt, threadId, followUpCount
  }
}
```

#### safeCloseFinal (FINAL_FOLLOW_UP + no thread)
```jsonc
{
  "before": {
    "outreachStatus":   "FINAL_FOLLOW_UP",
    "needsHumanAction": "true",
    "humanActionReason": "followup_error: Follow-up send failed: ...too many times...",
    "threadId":         ""
  },
  "after": {
    "outreachStatus":   "FINAL_FOLLOW_UP",   // unchanged (already terminal)
    "needsHumanAction": "false",
    "humanActionReason": "",
    "lastAuditNote":    "auto-close 2026-05-13: followup_error quota; thread missing; no retry"
  }
}
```

#### safeCloseFinalCompleted (FINAL_FOLLOW_UP + thread + count≥3)
```jsonc
{
  "before": {
    "outreachStatus":   "FINAL_FOLLOW_UP",
    "needsHumanAction": "true",
    "humanActionReason": "followup_error: ...",
    "threadId":         "<thread>",
    "followUpCount":    "3"      // or 4
  },
  "after": {
    "outreachStatus":   "FINAL_FOLLOW_UP",   // unchanged
    "needsHumanAction": "false",
    "humanActionReason": "",
    "lastAuditNote":    "auto-close 2026-05-13: sequence already complete (count≥3)"
  }
}
```

#### scheduledRetry (FINAL_FOLLOW_UP + thread + count<3)
```jsonc
{
  "before": {
    "outreachStatus":   "FINAL_FOLLOW_UP",
    "needsHumanAction": "true",
    "humanActionReason": "followup_error: ...",
    "threadId":         "<thread>",
    "followUpCount":    "2",
    "nextFollowUpAt":   ""
  },
  "after": {
    "outreachStatus":   "FOLLOW_UP_2",       // reverted one step
    "needsHumanAction": "false",
    "humanActionReason": "",
    "followUpCount":    "1",                 // decremented
    "nextFollowUpAt":   "<now + 24h>",      // outside today's quota window
    "lastAuditNote":    "auto-retry 2026-05-13: reverted FU2; rescheduled +24h"
  }
}
```

---

## §2 — v95 patch plan (catch block + circuit breaker + retry)

### §2.1 — Files to change

| File | Change | Risk |
|---|---|---|
| `gas/Code.gs` | Add `MAX_SEND_RETRIES: 3` and `QUOTA_PAUSE_PROPERTY` constants to `CFG` | None — config only |
| `gas/outreach.gs` | Add quota detector + retry helpers; patch 3 catch blocks; add pause check at `_runAutoSend` entry | Medium — touches the live send loop |

No other files. No new sheet columns required (audit note goes into a single existing/new `lastAuditNote` column; retry counts stored in PropertiesService keyed by leadId).

### §2.2 — New helper functions (gas/outreach.gs)

```javascript
// Quota error detection — regex match on the Gmail error message
function _isQuotaError(err) {
  const msg = (err && err.message ? err.message : String(err)).toLowerCase();
  return /service invoked too many times|too many emails|daily.*(limit|quota)|rate.*exceed/i.test(msg);
}

// Quota pause marker — set when quota tripped; auto-clears next calendar day
function _setQuotaPauseToday() {
  const today = new Date().toISOString().split('T')[0];   // 'YYYY-MM-DD'
  PropertiesService.getScriptProperties().setProperty(
    CFG.QUOTA_PAUSE_PROPERTY, today
  );
}

function _isQuotaPaused() {
  const today = new Date().toISOString().split('T')[0];
  const paused = PropertiesService.getScriptProperties()
                   .getProperty(CFG.QUOTA_PAUSE_PROPERTY) || '';
  return paused === today;       // pause is per-day; auto-expires at midnight UTC
}

// Per-lead retry counter (non-quota transient errors only)
function _getSendRetries(leadId) {
  const k = 'send_retry_' + leadId;
  return parseInt(PropertiesService.getScriptProperties().getProperty(k) || '0', 10);
}
function _incrementSendRetries(leadId) {
  const k = 'send_retry_' + leadId;
  const n = _getSendRetries(leadId) + 1;
  PropertiesService.getScriptProperties().setProperty(k, String(n));
  return n;
}
function _clearSendRetries(leadId) {
  PropertiesService.getScriptProperties().deleteProperty('send_retry_' + leadId);
}
```

### §2.3 — Patched `_runAutoSend()` entry guard

```javascript
function _runAutoSend() {
  // ── Quota pause check (new) ──────────────────────────────────────
  if (_isQuotaPaused()) {
    Logger.log('autoSendOutreach: quota pause active for today — skipping entire batch');
    return;
  }
  // ... existing code ...
}
```

### §2.4 — Patched initial-send loop

Before (current v94, `outreach.gs:281-302`):
```javascript
readyQueue.forEach(lead => {
  if (sent >= batchLimit) return;
  try {
    if (CFG.READINESS_GATE_ENABLED) { /* ... */ }
    _autoSendInitial(lead);
    sent++;
    _incrementSentToday();
  } catch(e) {
    Logger.log('autoSend initial fail for ' + lead.id + ': ' + e.message);
    _flagHumanAction(lead.id, 'send_error', 'Initial send failed: ' + e.message);
  }
});
```

After:
```javascript
let quotaTripped = false;
readyQueue.forEach(lead => {
  if (quotaTripped) return;                  // circuit breaker
  if (sent >= batchLimit) return;
  try {
    if (CFG.READINESS_GATE_ENABLED) { /* ... */ }
    _autoSendInitial(lead);
    sent++;
    _incrementSentToday();
    _clearSendRetries(lead.id);              // success → reset retry counter
  } catch(e) {
    Logger.log('autoSend initial fail for ' + lead.id + ': ' + e.message);

    if (_isQuotaError(e)) {
      // ── Quota exhausted: release the lock, pause, halt the batch ──
      updateRow('Leads', lead.id, {
        outreachStatus: OS.READY_FOR_OUTREACH      // release lock
        // NO _flagHumanAction — this is infrastructure failure, not a lead issue
      });
      _setQuotaPauseToday();
      quotaTripped = true;
      Logger.log('QUOTA TRIPPED — circuit breaker engaged, halting batch. ' +
                 'Pause active until next day. ' + sent + ' sends completed before trip.');
      return;
    }

    // Non-quota transient error: increment retry, only flag if max retries exhausted
    const retries = _incrementSendRetries(lead.id);
    if (retries >= CFG.MAX_SEND_RETRIES) {
      updateRow('Leads', lead.id, {
        outreachStatus: OS.READY_FOR_OUTREACH      // release lock
      });
      _flagHumanAction(lead.id, 'send_error',
        'Initial send failed after ' + retries + ' attempts: ' + e.message);
    } else {
      // Release lock, leave for retry on next trigger
      updateRow('Leads', lead.id, {
        outreachStatus: OS.READY_FOR_OUTREACH
      });
      Logger.log('Will retry lead ' + lead.id + ' (attempt ' + retries +
                 '/' + CFG.MAX_SEND_RETRIES + ')');
    }
  }
});
```

### §2.5 — Patched follow-up loop

Same pattern as §2.4 but acting on `_autoSendFollowUp`. The "release lock" step is unnecessary because follow-ups don't lock — but the quota-pause + circuit-breaker + retry-or-flag logic is identical.

Before (current v94, `outreach.gs:307-317`):
```javascript
followUpDue.forEach(lead => {
  if (sent >= batchLimit) return;
  try {
    _autoSendFollowUp(lead);
    sent++;
    _incrementSentToday();
  } catch(e) {
    Logger.log('autoSend follow-up fail for ' + lead.id + ': ' + e.message);
    _flagHumanAction(lead.id, 'followup_error', 'Follow-up send failed: ' + e.message);
  }
});
```

After:
```javascript
followUpDue.forEach(lead => {
  if (quotaTripped) return;
  if (sent >= batchLimit) return;
  try {
    _autoSendFollowUp(lead);
    sent++;
    _incrementSentToday();
    _clearSendRetries(lead.id);
  } catch(e) {
    Logger.log('autoSend follow-up fail for ' + lead.id + ': ' + e.message);

    if (_isQuotaError(e)) {
      _setQuotaPauseToday();
      quotaTripped = true;
      Logger.log('QUOTA TRIPPED in follow-ups — circuit breaker engaged.');
      return;
    }

    const retries = _incrementSendRetries(lead.id);
    if (retries >= CFG.MAX_SEND_RETRIES) {
      _flagHumanAction(lead.id, 'followup_error',
        'Follow-up send failed after ' + retries + ' attempts: ' + e.message);
    } else {
      Logger.log('Will retry follow-up for lead ' + lead.id + ' (attempt ' +
                 retries + '/' + CFG.MAX_SEND_RETRIES + ')');
    }
  }
});
```

### §2.6 — Patched final-follow-up loop

Already silent on errors (no `_flagHumanAction` in current code). Add quota detection and circuit breaker, but no retry/flag logic needed — final-follow-up is end-of-sequence by definition.

```javascript
finalDue.forEach(lead => {
  if (quotaTripped) return;
  if (sent >= batchLimit) return;
  try {
    _autoSendFinal(lead);
    sent++;
    _incrementSentToday();
    _clearSendRetries(lead.id);
  } catch(e) {
    Logger.log('autoSend final fail for ' + lead.id + ': ' + e.message);
    if (_isQuotaError(e)) {
      _setQuotaPauseToday();
      quotaTripped = true;
      Logger.log('QUOTA TRIPPED in final-follow-ups — circuit breaker engaged.');
    }
    // Non-quota errors: silent (sequence is ending anyway)
  }
});
```

### §2.7 — CFG additions (gas/Code.gs)

```javascript
const CFG = {
  // ... existing entries ...
  MAX_SEND_RETRIES:      3,
  QUOTA_PAUSE_PROPERTY:  'quota_pause_until',  // PropertiesService key
};
```

---

## §3 — State transitions before/after (v94 → v95)

### §3.1 — Initial-send quota error

| Stage | v94 | v95 |
|---|---|---|
| Lead enters | `outreachStatus: READY_FOR_OUTREACH` | same |
| Lock guard | → `LOCKED_FOR_OUTREACH` | same |
| Gmail throws quota | catch block fires | catch block fires |
| Catch action | `_flagHumanAction('send_error', ...)` | `outreachStatus → READY_FOR_OUTREACH`, set quota pause, halt batch |
| Final state | `LOCKED_FOR_OUTREACH` + `needsHumanAction=true` (permanently stuck) | `READY_FOR_OUTREACH` + no flag (next-day retry) |

### §3.2 — Follow-up quota error

| Stage | v94 | v95 |
|---|---|---|
| Lead enters | `outreachStatus: FOLLOW_UP_n` | same |
| Send attempt | `_autoSendFollowUp` runs | same |
| Gmail throws quota | catch fires | catch fires |
| Catch action | `_flagHumanAction('followup_error', ...)` | set quota pause, halt batch, do not flag |
| Final state | `FOLLOW_UP_n` + `needsHumanAction=true` | `FOLLOW_UP_n` unchanged, retry tomorrow |

### §3.3 — Final-follow-up quota error

| Stage | v94 | v95 |
|---|---|---|
| Gmail throws quota | catch fires (silent in v94 already) | catch fires |
| Catch action | log only | set quota pause, halt batch |
| Final state | `FOLLOW_UP_2` + `lastContactedAt` from prior FU2 send | same — no degradation |

### §3.4 — Non-quota transient error (NEW behavior)

| Stage | v94 | v95 |
|---|---|---|
| Gmail throws e.g. "transient API error" | catch fires | catch fires |
| First failure | `_flagHumanAction` immediately | retry counter → 1, release lock, no flag |
| Second failure | already in queue, overwrites reason | retry counter → 2 |
| Third failure | already in queue | retry counter → 3 (MAX), NOW flag with attempt count |
| Recovery | none | counter cleared on next successful send |

---

## §4 — Rollback plan

### §4.1 — Rollback for `resetQuotaFailures()` (dry-run function)

Trivial: dry-run is read-only. Delete the throwaway file from GAS editor. No state to revert.

### §4.2 — Rollback for v95 catch-block patches

Two layers:

**Layer 1 — Code revert (no DB impact):**
- v95 changes are localized to `gas/Code.gs` and `gas/outreach.gs`.
- Git revert the single v95 commit.
- `clasp push` + `clasp deploy` returns the code to v94 behavior.
- Effect: catch blocks return to "flag everything on error" behavior. Quota errors will start flagging human action again on next trigger.

**Layer 2 — Properties cleanup:**
- v95 writes to `PropertiesService`: `quota_pause_until` (single property) and `send_retry_<leadId>` (one per retried lead).
- Rollback: manually clear via the GAS editor → File → Project Properties → Script Properties → delete relevant entries.
- These properties are inert if v95 code is reverted (no reader exists in v94).

**Layer 3 — Sheet data:**
- Any rows the new code mutated (released locks, set retry-state) stay in their new state after revert.
- Released-lock rows (`outreachStatus: READY_FOR_OUTREACH` instead of `LOCKED_FOR_OUTREACH`) are SAFER than the v94 state — they're available for autosend instead of stuck.
- No destructive write occurs in v95 that needs to be undone.

**No data loss in any rollback scenario.** The audit log (§5) makes every mutation traceable.

### §4.3 — Rollback for `applyResetQuotaFailures()` (FUTURE — not in this iteration)

When that mutation function is built, it will:
- Write to `Outreach_AuditLog` sheet (new) BEFORE each mutation
- Each audit row contains the full before-state as JSON
- Rollback = read audit log, apply before-state JSON to each leadId

That function is NOT being built now. Only the dry-run preview is.

---

## §5 — Audit logging design

### §5.1 — New sheet: `Outreach_AuditLog`

Columns:

| Column | Type | Notes |
|---|---|---|
| `id` | string | UUID generated per row |
| `timestamp` | ISO 8601 | when the action was applied |
| `leadId` | string | LEAD-... |
| `actor` | string | `mike` / `auto_reset` / `dry_run_proposal` |
| `action` | string | `resetToReady` / `safeCloseFinal` / `safeCloseFinalCompleted` / `scheduledRetry` / `unflagOnly` |
| `before` | JSON string | full row state before mutation |
| `after` | JSON string | full row state after mutation |
| `originalReason` | string | the original `humanActionReason` text, preserved |
| `notes` | string | human or machine note |

Append-only. Never updated. Never deleted.

### §5.2 — How the dry-run uses it

Dry-run mode generates an `auditLogRowsPreview` array in the output JSON (first 5 rows for size) showing what would be written to the sheet. **No actual sheet writes occur in dry-run.**

When `applyResetQuotaFailures()` is later built, it writes ONE audit row per mutation BEFORE the Leads-sheet mutation. If the Leads write fails, the audit row is still there (with a `notes: "WRITE_FAILED: <err>"`) for forensic analysis.

### §5.3 — `lastAuditNote` column on Leads sheet

A single new column added during the `applyResetQuotaFailures()` step (not now). Holds a one-line human-readable summary of the last automated audit action. Surfaces in the UI without requiring a join.

Format example: `auto-reset 2026-05-13: send_error quota; lock released`

Independent of the full audit log.

---

## §6 — Files to change (summary)

For the dry-run function (no production files touched):
- `docs/templates/reset-quota-failures.gs.template` ← NEW (companion to this plan)

For v95 (when approved later):
- `gas/Code.gs` — add `MAX_SEND_RETRIES`, `QUOTA_PAUSE_PROPERTY` to CFG (1-line additions)
- `gas/outreach.gs` — add helpers (~50 lines), patch 3 catch blocks (~30 lines each), add `_isQuotaPaused()` check at `_runAutoSend` entry (3 lines)

For `applyResetQuotaFailures()` (FUTURE — not in this iteration):
- New sheet `Outreach_AuditLog` (one-time create)
- New column `lastAuditNote` on Leads (one-time add)
- New function in `gas/outreach.gs` mirroring the dry-run preview shape

No Python, no Railway, no Postgres, no migration touched.

---

## §7 — Expected dry-run output counts

Based on the empirical findings in `AUDIT_FINDINGS_2026-05-13.md`:

| Bucket | Expected count |
|---|---:|
| `filter.matched` | ≈ 247 |
| `filter.excluded_replyStatusSet` | exactly 54 (the REPLIED rows) + any others with non-empty replyStatus |
| `filter.excluded_reasonMismatch` | the 4 `wrong_contact` rows |
| `proposalCounts.resetToReady` | ≈ 195 (the LOCKED initial-send failures) |
| `proposalCounts.safeCloseFinal` | varies — FINAL_FOLLOW_UP rows with no threadId |
| `proposalCounts.safeCloseFinalCompleted` | varies — FINAL_FOLLOW_UP with thread + count≥3 |
| `proposalCounts.scheduledRetry` | varies — FINAL_FOLLOW_UP with thread + count<3 |
| `proposalCounts.anomaly` | 0 (any non-zero requires investigation before mutation) |
| `verification.repliedRowsSeenButNotTouched` | exactly 54 |
| `verification.filterIntegrityOk` | true |

**If `proposalCounts.anomaly > 0` OR `verification.repliedRowsSeenButNotTouched ≠ 54`, the mutation step must NOT proceed and the function must be re-examined.**

---

## §8 — What is NOT being done in this iteration

- ❌ No mutation function built
- ❌ No catch-block patches applied
- ❌ No `clasp push`, no `clasp deploy`
- ❌ No git commit, no git push
- ❌ No new sheet created
- ❌ No new sheet column added
- ❌ No kill switch flipped
- ❌ No readiness migration run
- ❌ No production data changes
- ❌ No retry-counter PropertiesService writes
- ❌ No quota-pause property set

This is plan + dry-run only.

---

## §8.5 — ThreadId race-condition fix (v95 addendum)

**Evidence from the dry-run:** all 52 `safeCloseFinal` rows have `threadId: ""`. Even rows with `followUpCount: 4` (multiple successful prior sends) had no captured thread. This is not corner-case behavior — it's systematic loss of thread references. Without `threadId`, reply detection is permanently broken for those leads, independent of the quota issue.

### §8.5.1 — Root cause

Current code at `outreach.gs:355-368`:
```javascript
GmailApp.sendEmail(lead.email, subject, textBody, { … });
Utilities.sleep(1200);
const sentThread = _findSentThread(lead.email, subject);
const threadId   = sentThread ? sentThread.getId() : '';
```

`GmailApp.sendEmail` returns nothing — no message handle, no thread reference. So the code sleeps 1.2 seconds and then searches the Sent folder by `(recipient, subject)`. If Gmail hasn't indexed the message in that window, the search returns null and `threadId` is silently written as empty string. This is a race condition with non-deterministic outcome.

### §8.5.2 — Proposed fix (deterministic, no race)

Replace `sendEmail + sleep + findSentThread` with the draft-and-send pattern:

```javascript
// Before (v94, racy):
GmailApp.sendEmail(lead.email, subject, textBody, options);
Utilities.sleep(1200);
const sentThread = _findSentThread(lead.email, subject);
const threadId   = sentThread ? sentThread.getId() : '';
const msgId      = sentThread ? sentThread.getMessages().slice(-1)[0].getId() : '';

// After (v95, deterministic):
const draft   = GmailApp.createDraft(lead.email, subject, textBody, options);
const message = draft.send();          // returns the GmailMessage
const thread  = message.getThread();
const threadId = thread.getId();
const msgId    = message.getId();
// _findSentThread is no longer needed
```

`draft.send()` is a synchronous round-trip that returns the `GmailMessage` object directly. No sleep. No search. Thread reference is guaranteed.

### §8.5.3 — Fallback if draft.send() fails

The draft API can still throw — e.g. on quota exhaustion (the very error we already handle). The catch block already exists and is being patched in §2.4. The race-fix is independent of the quota fix and the two compose cleanly:

```javascript
try {
  const draft   = GmailApp.createDraft(lead.email, subject, textBody, options);
  const message = draft.send();
  // ... use message.getThread().getId()
} catch (e) {
  // existing quota detection + circuit breaker + retry logic
  // (no change — same catch path)
}
```

If `createDraft` succeeds but `draft.send()` throws partway, the draft remains in the Drafts folder. v95 should add a Drafts-folder cleanup pass at the end of `_runAutoSend()` to delete any AskMiro drafts that didn't successfully send. This prevents draft accumulation.

### §8.5.4 — Constraints honored

- ✅ Fix applies to **NEW sends only**. No backfill of the 52 existing threadId-missing rows.
- ✅ Independent of quota fix. Each can be deployed in isolation.
- ✅ No behavioral change to the reply-scan code (it consumes whatever `threadId` exists on the row, which will now always be populated for newly-sent rows).
- ✅ No `clasp push` / `clasp deploy` until the full v95 patch is approved.

### §8.5.5 — Files affected (no new files)

| File | Change |
|---|---|
| `gas/outreach.gs` | Replace `sendEmail + sleep + _findSentThread` pattern in `_autoSendInitial`. The same pattern likely exists in `_sendInThread` for follow-ups — also replace. Add post-batch drafts cleanup. |
| `gas/outreach.gs` | `_findSentThread` becomes dead code. Mark deprecated, keep for one release in case rollback is needed, then remove in v96. |

### §8.5.6 — Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| `draft.send()` differs from `sendEmail` in headers/options handling | Low (the GAS docs document them as equivalent) | Test on a single send before mass enabling. The v95 patch deployment IS the test — first 4h trigger window will exercise the new path on ≤50 leads. |
| Existing drafts (from interrupted prior sends) confuse the new path | Very low (createDraft makes a new draft each time) | The post-batch cleanup pass removes orphan drafts older than 1 hour. |
| The race-fix masks the quota error timing | Zero | The catch block still fires the same way regardless of which API throws. |

### §8.5.7 — Rollback

Git revert the v95 commit. Code reverts to the racy `sendEmail + sleep + findSentThread` pattern. Existing rows that had `threadId` populated by v95 remain populated (no data loss). The behaviour for new sends reverts to occasionally producing empty threadIds.

---

## §8.6 — Mutation function design (`applyResetQuotaFailures`)

**Status:** Designed in `docs/templates/apply-reset-quota-failures.gs.template`. NOT yet run. Default mode is dry-run. Mutation requires explicit `confirm: true`.

### §8.6.1 — Safety harness (10 layers)

| # | Layer | Effect |
|---|---|---|
| 1 | **dryRun=true by default** | Calling `applyResetQuotaFailures()` with no args returns the proposal without touching Leads. Identical output to the standalone proposal builder. |
| 2 | **confirm=true required** | Mutation only happens with `applyResetQuotaFailures({ confirm: true, … })`. Any other value blocks writes. |
| 3 | **expectedMatched parameter** | Caller must pass the number from the dry-run. Runtime compares against current candidate count; aborts if drift exceeds `MATCH_DRIFT_TOLERANCE` (default ±5 rows). |
| 4 | **Pre-flight: audit sheet must exist** | Function checks for `Outreach_AuditLog` sheet. If missing → returns `{ ok: false, error: 'audit_sheet_missing' }`. Does NOT auto-create the sheet. |
| 5 | **Audit sheet header signature check** | Verifies 9 expected column headers exactly. Mismatch → aborts. |
| 6 | **Per-row re-evaluation** | For each candidate, ALL 5 filters are re-checked against a freshly-read live row immediately before mutation. Rows that no longer match are silently skipped (idempotent). |
| 7 | **Audit row written FIRST** | Audit row appended to `Outreach_AuditLog`. If `appendRow` throws → skip lead, do NOT touch Leads. |
| 8 | **Audit row verification** | After append, the function reads back the last row's id column and confirms it matches the UUID it wrote. Mismatch → treat as audit failure. |
| 9 | **Failure-mode audit row** | If Leads update succeeds-or-fails after audit write, a follow-up audit row is appended with `action='mutation_failed'` and the error message, so the audit log is self-describing even when downstream writes fail. |
| 10 | **Per-run hard limit** | `MAX_MUTATIONS_PER_RUN = 300` prevents runaway mutations. Above this, function aborts before doing anything. |

### §8.6.2 — Invocation contract

```javascript
// Returns proposal only, no writes:
applyResetQuotaFailures()

// Same, plus drift check:
applyResetQuotaFailures({ expectedMatched: 245 })

// MUTATE (requires both confirm and expectedMatched):
applyResetQuotaFailures({ confirm: true, expectedMatched: 245 })

// Optional: override actor (defaults to Session.getActiveUser().getEmail()):
applyResetQuotaFailures({ confirm: true, expectedMatched: 245, actor: 'mike@askmiro.com' })
```

### §8.6.3 — Return envelope

```jsonc
{
  "ok":               true | false,
  "mode":             "dry_run" | "mutate",
  "confirm":          false | true,
  "actor":            "<email>",
  "generatedAt":      "<iso>",
  "expectedMatched":  245,
  "matchedAtRuntime": 245,
  "stats": {
    "candidateCount":     245,
    "attempted":          245,
    "mutated":            <int>,
    "skippedReRunCheck":  <int>,
    "skippedAuditFail":   <int>,
    "skippedAlreadyDone": <int>,
    "errorRows":          [ /* up to 25 row-level errors */ ]
  },
  "actionCounts": {
    "resetToReady":            193,
    "safeCloseFinal":          52,
    "safeCloseFinalCompleted": 0,
    "scheduledRetry":          0
  }
}
```

In dry-run mode, `stats.mutated` is always 0; `actionCounts` shows what *would* be mutated.

### §8.6.4 — Error conditions

The function returns `{ ok: false, error: <code> }` and does NOT proceed when any of:

| `error` code | Meaning | Remedy |
|---|---|---|
| `audit_sheet_missing` | `Outreach_AuditLog` sheet does not exist | Run setup-audit-log.gs.template first |
| `audit_sheet_header_mismatch` | Header column does not match expected | Re-create the sheet correctly |
| `population_drift` | Live candidate count differs from `expectedMatched` beyond tolerance | Re-run dry-run, update `expectedMatched` |
| `too_many_candidates` | Live count exceeds `MAX_MUTATIONS_PER_RUN` | Tighten filter or raise the constant deliberately |

### §8.6.5 — Excluded populations confirmed

The function uses **exactly the same filter** as the dry-run, so the following are guaranteed never to be touched:

| Population | Count | Excluded by |
|---|---:|---|
| 55 REPLIED rows | 55 | `replyStatus !== ''` gate |
| ~4 WRONG_CONTACT rows | 4 | `replyStatus !== ''` gate (their replyStatus is 'WRONG_CONTACT') |
| 2 non-quota send errors | 2 | `QUOTA_RE.test(reason)` gate |
| 92 non-flagged outbound leads | 92 | `needsHumanAction !== 'true'` gate |
| 8 inbound leads | 8 | `leadDirection !== 'outbound'` gate |

The function will never reach those rows even if invoked with `confirm: true`.

### §8.6.6 — Prerequisites checklist (before any `confirm: true`)

1. ✅ Run `reset-quota-failures.gs.template` (the standalone dry-run) — DONE
2. ⏳ Run `inspect-quota-term-missing.gs.template` to review the 2 non-quota errors — PENDING
3. ⏳ Run `setup-audit-log.gs.template` to create the `Outreach_AuditLog` sheet — PENDING (template not yet built)
4. ⏳ Run `applyResetQuotaFailures()` in dry-run mode and verify it produces same counts as the standalone — PENDING
5. ⏳ Run `applyResetQuotaFailures({ expectedMatched: <N> })` with drift check — PENDING
6. ⏳ ONLY THEN: `applyResetQuotaFailures({ confirm: true, expectedMatched: <N> })` — PENDING and explicitly approved
7. Optional but recommended: temporarily pause `autoSendOutreach` and `scanOutreachReplies` triggers during the mutation window to prevent concurrent writes

---

## §8.7 — Audit-log sheet setup (separate one-time function)

A small dedicated template will be needed before `applyResetQuotaFailures({confirm:true})` can run. It is NOT being built in this iteration. Sketch only:

```javascript
function setupAuditLogSheet() {
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var name = 'Outreach_AuditLog';
  if (ss.getSheetByName(name)) {
    return { ok: false, error: 'sheet_already_exists' };
  }
  var sheet = ss.insertSheet(name);
  sheet.appendRow([
    'id', 'timestamp', 'leadId', 'actor', 'action',
    'before', 'after', 'originalReason', 'notes'
  ]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  return { ok: true, name: name };
}
```

This is the one explicit write required before any mutation can happen, and it's its own approval gate. Build + run is deferred.

---

## §9 — Approval gates needed before next step

| Gate | Decision needed | Blocker? |
|---|---|---|
| 1 | Approve `inspectQuotaTermMissing()` for paste-and-run | NO — just an inspection step |
| 2 | Review what the 2 quotaTermMissing rows actually are | YES — before deciding their fate |
| 3 | Approve the v95 catch-block patch design (§2) | YES — before code change |
| 4 | Approve the v95 threadId race-fix (§8.5) | YES — before code change |
| 5 | Approve building `setupAuditLogSheet()` to create `Outreach_AuditLog` | YES — before any mutation |
| 6 | Approve the `applyResetQuotaFailures()` design (§8.6) | YES — before paste-and-run |
| 7 | Run `applyResetQuotaFailures()` in dry-run, verify counts match | YES — before `confirm: true` |
| 8 | Approve `applyResetQuotaFailures({ confirm: true, expectedMatched: 245 })` | YES — the actual mutation gate |
| 9 | Decide on `MAX_SEND_RETRIES` value — default 3, alternative? | NO — easy to tune later |
| 10 | Decide on `scheduledRetry` semantics | MOOT — dry-run shows 0 such rows exist |

---

## §10 — Sign-off

| | Name | Date | Reviewed |
|---|---|---|---|
| Author | Claude | 2026-05-13 | ✅ |
| Reviewer | Mike | pending | |
