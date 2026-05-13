# Outreach Queue Audit — Empirical Findings

**Date:** 2026-05-13 11:04 AM
**Data source:** live `auditNeedsAttention()` run, deleted after capture
**Population:** 305 rows flagged `needsHumanAction='true'` out of 405 total outbound Leads
**Audit version:** 1
**Status:** READ-ONLY analysis. No mutations performed.

---

## Headline finding

**The 305 queue is not a reply-classification problem. 81% of it is a Gmail send-rate-limit problem.**

| Category | Count | % of queue |
|---|---:|---:|
| `send_error: Service invoked too many times for one day` | **195** | **63.9%** |
| `followup_error: Follow-up send failed: Service invoked too many times…` | **52** | **17.0%** |
| `unclassified_reply` (AI catch-all) | 54 | 17.7% |
| `wrong_contact` | 4 | 1.3% |
| **Total** | **305** | 100% |

**247 rows of 305 (80.9%) are Gmail-quota failures, not human-attention items.** They were never replies. They are sends that never completed.

The actual reply-classification queue — the thing we were debating turning on the readiness layer to fix — is only **54 rows**, not 305.

---

## §1 — What actually happened

Reconstruction from the data:

### 1.1 — A single mass-send burst hit Gmail's daily quota
Age distribution is extremely tight:
- median age: 42 days
- p90: 43 days
- p99: 43 days
- oldest: 43 days
- youngest: 1 day

97%+ of the 305 are clustered at 42–43 days old. **This is not organic queue growth over time. It is a single failed batch from ~April 1.**

When GAS exceeded Gmail's daily send quota that day:
1. `GmailApp.sendEmail()` threw "Service invoked too many times for one day"
2. The catch block at `outreach.gs:289` (for initial sends) and `outreach.gs:315` (for follow-ups) fired
3. Each one called `_flagHumanAction(lead.id, 'send_error', '...')`
4. The row was permanently flagged as needing human review
5. **No retry. No backoff. Just flag and move on.**

### 1.2 — 195 rows are stuck in `LOCKED_FOR_OUTREACH`
The lock is a guard set at `outreach.gs:351` *before* `GmailApp.sendEmail` is called, to prevent double-sends. When the send threw, the catch block flagged human action but **did not reset the lock**.

Result: 195 leads sit in `LOCKED_FOR_OUTREACH` forever, with:
- `threadIdPresent: false` (no email was ever sent → no thread exists)
- `emailSentCount: 0`
- No outreach progress possible from this state — the lock blocks the autosend from picking them up again.

### 1.3 — 52 rows are stuck in `FINAL_FOLLOW_UP` with no recovery
These had received earlier emails successfully (`emailSentCount: 4` in the sample) but the final follow-up hit the same quota wall. They're now in:
- `outreachStatus: FINAL_FOLLOW_UP` (terminal — no further automated action)
- `humanActionReason: followup_error`
- `replyStatus: empty` (so the reply scan still examines them, IF threads exist — which from the samples they don't, `threadIdPresent: false` for many)

### 1.4 — 60% of the queue is generic inboxes
`genericInbox: 183 / 305 = 60%` — leads where the address is `info@`, `admin@`, `contact@`, `enquiries@` etc.

This isn't a queue problem per se. It's an **upstream lead-list quality problem** — the readiness layer's `email_quality_score` was designed precisely to filter these *before* they reach outreach. Confirmation that the original problem statement (entity-level emails vs people-level emails) is real.

### 1.5 — Zero bounces detected
`bounced: 0` across all 305. This is suspicious given:
- 60% of addresses are generic inboxes
- Some addresses are clearly stale (`qehostel@gmail.com` for a hostel/pub — unlikely to be monitored)
- Statistically we'd expect 5–15% hard bounces

**Explanation:** the 195 send-failure rows never produced a real Gmail send → no DSN could come back. Of the 110 rows where a send *did* succeed (54 REPLIED + 52 followup_error + 4 wrong_contact), bounces from the original send would have been classified as REPLIED (catch-all) — which matches the §3 of the forensic audit's bounce-bleed-through hypothesis exactly.

The 0 bounces is therefore **probably an artefact of two failure modes stacking**, not evidence that bounces aren't happening.

### 1.6 — The "real" reply-classification queue is 54 rows
All 54 rows have:
- `replyStatus: REPLIED` (the AI fallback catch-all)
- `humanActionReason: unclassified_reply`
- `outreachStatus: REPLIED`

None matched the `realHumanReplySuspected` heuristic (which looks for `POSITIVE`/`INTERESTED`/`INFO_REQUEST` or `humanActionReason` containing "interested"). This confirms the §1.3 finding in the forensic audit: **the AI's fallback to REPLIED dumps every ambiguous or failed-classification message into the queue with no further signal.**

These 54 are where the original problem we set out to solve actually lives.

### 1.7 — Only 4 explicit WRONG_CONTACT replies in 305
Including all 4 of the `bucketsByReplyStatus.WRONG_CONTACT`. This is a healthy low number — the WRONG_CONTACT rule-based regex is working. The problem isn't the WRONG_CONTACT path.

---

## §2 — Updated category map vs original hypothesis

| Category | Original hypothesis (§2 of forensic audit) | Actual |
|---|---|---|
| Send-rate-limit failures | not even on the list | **247 (81%)** |
| AI catch-all REPLIED floods | "Medium 15–30%" | 54 (17.7%) — within hypothesis |
| Wrong contact | "Small–Medium 10–20%" | 4 (1.3%) — much lower than expected |
| Bounces | "Medium 15–25%" | 0 detected — see §1.5 |
| OOO bleed-through | "Small–Medium 10–20%" | 0 detected — likely buried in the 54 REPLIED |
| Genuine positive replies | "Small 5–15%" | 0 surfaced by heuristic; some may be inside the 54 REPLIED |

The hypothesis was directionally wrong because it assumed the queue was dominated by reply-classification failures. **In fact, classification failures are the minority — the majority is send infrastructure failure.**

---

## §3 — Mechanical analysis

### 3.1 — Why didn't the system self-recover from the quota burst?
Three reasons stack:

1. **The send-error catch block doesn't reset the lock.**
   `outreach.gs:283-291`:
   ```javascript
   _autoSendInitial(lead);    // sets LOCKED_FOR_OUTREACH on entry
   } catch(e) {
     Logger.log('autoSend initial fail for ' + lead.id + ': ' + e.message);
     _flagHumanAction(lead.id, 'send_error', 'Initial send failed: ' + e.message);
     // ⚠️ NO revert of outreachStatus from LOCKED back to READY
   }
   ```
   Result: rows are permanently locked, autosend skips them next time.

2. **No retry logic for transient errors.**
   "Service invoked too many times" is the textbook transient error — it resolves automatically next day. The catch block treats it identically to "Invalid recipient address" (which is permanent). Flag and forget.

3. **Daily quota detection happens AFTER the fact.**
   `DAILY_SEND_CAP = 50` in GAS code, but Gmail's *actual* daily quota for Workspace accounts is typically 1,500/day for Workspace, 100/day for free Gmail. If `_autoSendInitial` is fired in rapid succession at the start of a trigger window, the in-script `_getSentTodayCount()` check at line 254 may say "remaining=45" while Gmail's real-time counter says "you've already sent 1,500 across all triggers/manual sends today, no more." There's no pre-flight check against Gmail's actual quota — only the locally-tracked counter.

### 3.2 — Why is `threadIdPresent: false` so common in the samples?
`outreach.gs:355-368`:
```javascript
GmailApp.sendEmail(lead.email, subject, textBody, { … });   // throws here for the 195
Utilities.sleep(1200);
const sentThread = _findSentThread(lead.email, subject);
const threadId   = sentThread ? sentThread.getId() : '';
```

When the `sendEmail` call itself throws, execution never reaches the `_findSentThread` lookup. So `threadId` is never written. The row stays at whatever it was set to by the LOCK guard, which doesn't write threadId.

For the 195 LOCKED rows: `threadIdPresent: false` is correct — no email was sent, no thread exists.
For the 52 follow-up failures: `threadIdPresent` should be `true` (a thread exists from the initial send), but the sample shows `false` for several. This needs sample inspection — it may indicate `_findSentThread` previously failed (the §4.3 R1 finding in the forensic audit).

### 3.3 — Where are the OOO replies?
The heuristic for `oooSuspected` requires either `replyStatus='OUT_OF_OFFICE'` or OOO regex on `replySummary`. The samples show `replySummary: ''` (empty) for every send_error row — these rows never received a reply, so naturally no OOO content.

For the 54 actual REPLIED rows, the `replySummary` is *also* empty in the visible samples. Either:
- The AI classifier didn't write a summary for these (the fallback at `outreach.gs:836` returns `summary: emailBody.substring(0, 80)` — should be non-empty), OR
- The visible samples happen to be from a subset where summary capture failed.

Inspecting the 54 REPLIED rows specifically (which the current sample doesn't isolate) would clarify. The current samples are all `send_error` rows because those dominate the newest entries.

---

## §4 — Implications for the original rollout plan

### 4.1 — Tier 2.1 (flip `MAIL_DIRECTION_CLASSIFIER_ENABLED = true`) is NOT the highest-priority fix
Reasoning: the classifier addresses the bounce/OOO/machine-mail bleed-through. Empirical evidence shows that pathway represents at most 54 rows — not 247. Flipping the classifier won't reduce the queue.

### 4.2 — The highest-priority fix is send-infrastructure resilience
1. Detect quota-exhaustion errors specifically (`Service invoked too many times`) and DO NOT flag human action. Retry next trigger window.
2. Reset `outreachStatus` from `LOCKED_FOR_OUTREACH` back to `READY_FOR_OUTREACH` in the catch block on quota errors.
3. Add a circuit breaker: if the first send in a trigger window throws quota error, skip the rest of the batch immediately instead of accumulating 100 failures.

### 4.3 — Queue cleanup is now a tractable problem
- 195 LOCKED + send_error → mechanical reset to `READY_FOR_OUTREACH`, clear human action flag. These leads never received an email.
- 52 FINAL_FOLLOW_UP + followup_error → judgment call:
  - If `emailSentCount: 3` (initial + FU1 + FU2 succeeded), accept FINAL_FOLLOW_UP as terminal; clear human action flag.
  - If `emailSentCount: 4` (the catch-all), they're already at the end of the sequence; clear human action flag, close out as `STOPPED` or leave at `FINAL_FOLLOW_UP`.
- 54 unclassified_reply → THIS is the queue that needs the readiness/classifier layer. Manageable size for human review one-by-one.
- 4 wrong_contact → manual research, no change.

### 4.4 — Lead-list quality is the upstream blocker
60% generic inboxes confirms that the underlying lead-acquisition pipeline is producing entity-level addresses, not decision-maker addresses. The readiness layer's `authority_score` was designed precisely to filter these out before outreach. **This validates the readiness-layer work — but applies it at the *list-building* stage, not the queue-cleanup stage.**

---

## §5 — Risks identified by this data

### 5.1 — Silent lead loss
The 195 LOCKED rows are *invisible* to:
- Reply scan (filtered out: not in `OS_FOLLOW_UP_STATES`)
- AutoSend (filtered out: not in `READY_FOR_OUTREACH`)
- Human queue UI (visible only because of `needsHumanAction='true'`)

If a future bug ever cleared `needsHumanAction` without restoring `outreachStatus`, **these 195 leads would disappear from every queue and every report.** Currently safe by accident.

### 5.2 — Quota errors will recur
The same code path is still live in v94. The next time a mass-send burst exceeds Gmail's quota, exactly the same 305 will happen again to a fresh batch. Nothing in the kill-switch deploy fixes this.

### 5.3 — `_findSentThread` race window is masking failures
When the sleep-1200ms-then-search pattern returns null because Gmail hasn't indexed yet, the row gets `threadId: ''` and is permanently invisible to reply scan. This bleeds slowly. Hard to quantify without a separate audit pass on the 405 total outbound leads (not just the 305 flagged).

### 5.4 — The 54 actual REPLIED rows may contain real wins buried by AI fallback
Every one of them is `replyStatus: REPLIED` and `humanActionReason: unclassified_reply`. We don't know how many are:
- Real "yes, send me a quote" replies the AI failed to classify as POSITIVE
- Bounces the AI failed to classify
- Wrong-contact responses the AI didn't catch
- OOO auto-replies the AI labelled REPLIED

**One-by-one human review of these 54 is now the most important manual task.** They contain the actual signal hidden inside the noise.

---

## §6 — Updated recommended rollout order

**Pre-flight (do this first, no flags flipped yet):**
- Manually review the 54 REPLIED rows. Spreadsheet view: filter Leads sheet to `replyStatus='REPLIED' AND needsHumanAction='true'`. For each, open the Gmail thread, read the actual reply, classify by hand into POSITIVE / OOO / BOUNCE / NOT_INTERESTED / WRONG_CONTACT / REAL_REPLIED. **No code changes.** Estimated 30–60 minutes for 54 rows.

**Phase A (queue cleanup, single batch operation):**
- Build a one-shot GAS function `resetQuotaFailures()` that:
  - Filters `humanActionReason LIKE '%send_error%' OR humanActionReason LIKE '%followup_error%' AND error_text contains 'too many times'`
  - For `outreachStatus = LOCKED_FOR_OUTREACH`: reset to `READY_FOR_OUTREACH`, clear `needsHumanAction`, clear `humanActionReason`
  - For `outreachStatus = FINAL_FOLLOW_UP`: clear `needsHumanAction` and `humanActionReason` only; leave at FINAL_FOLLOW_UP (sequence is complete)
  - Returns count of mutations for human approval before applying
  - Runs in dry-run mode by default; mutations only with `{ confirm: true }`
- Expected outcome: queue drops from 305 → ~58 (54 unclassified + 4 wrong_contact).

**Phase B (send-infrastructure fix, NOT a kill-switch flip):**
- Patch `_autoSendInitial` and `_autoSendFollowUp` catch blocks to:
  - Detect quota errors specifically (regex on `e.message`)
  - On quota error: reset `outreachStatus` to `READY_FOR_OUTREACH`, **do not** flag human action
  - On non-quota errors: flag human action as before
- Add circuit breaker: if first send in a batch throws quota error, break the loop immediately
- Deploy as v95; no behavior change to other code paths
- Verify in next autoSend cycle: no new `send_error` rows appear

**Phase C (only after A and B verified for ≥7 days):**
- Now consider `MAIL_DIRECTION_CLASSIFIER_ENABLED = true` (with BOUNCE_HANDLER_ENABLED still false) — this addresses the 54 REPLIED bucket
- Begin the migration / readiness layer sequence per `OUTREACH_READINESS_ARCHITECTURE.md` §11
- The readiness layer's `email_quality_score` filter is now demonstrably necessary because 60% of attempted outreach is to generic inboxes

---

## §7 — What I am NOT recommending

- ❌ Flip any kill switch right now — none of them address the quota-failure root cause
- ❌ Run migration 010 — orthogonal to the 247-row root cause
- ❌ Delete or archive the 305 — they're recoverable
- ❌ Re-trigger sends to recover the 195 LOCKED rows without first patching the catch block, or the same 195 will reappear plus new ones
- ❌ Treat the 54 REPLIED rows as homogeneous — they likely contain heterogeneous real signal (positive replies, bounces, OOO) that human review will tease apart

---

## §8 — Constraints honored

- ✅ Read-only audit (function deleted post-run)
- ❌ No `clasp push`
- ❌ No `clasp deploy`
- ❌ No `git commit`, no `git push`
- ❌ No migration run
- ❌ No queue mutation
- ❌ No production data changes
- ✅ Analysis grounded in actual data, not hypothesis

---

## §9 — Sign-off

| | Name | Date | Reviewed |
|---|---|---|---|
| Author | Claude | 2026-05-13 | ✅ |
| Reviewer | Mike | pending | |
