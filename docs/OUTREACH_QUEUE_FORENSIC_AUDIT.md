# Outreach Queue — Forensic Audit

**Status:** READ-ONLY AUDIT. No mutations performed.
**Author:** Claude (Senior Architect mode)
**Reviewer:** Mike
**Scope:** GAS Outreach reply-classification & "Needs Your Attention" queue
**Date:** 2026-05-13
**Code commit audited:** `d49f6a2` (kill-switches landed; classifier still on legacy path)

---

## Audit boundary & methodology

What this audit DOES verify directly from source:
- Every code path that writes `needsHumanAction`, `replyStatus`, `outreachStatus`, `humanActionReason`.
- The complete classification decision tree (rule-based → AI fallback → switch-map).
- All Gmail-touching operations (read, label, archive).
- All Postgres-touching operations and their failure modes.
- Pre-existing v92/v94 differences and current live behavior.

What this audit CANNOT directly verify without live data access:
- The actual contents of the 305 "Needs Attention" rows (Sheet read requires GAS web-app session auth).
- The empirical distribution of failure categories among those 305.
- Per-thread classification correctness on the sample of 75.

**To close that gap:** Section 6 includes a self-contained read-only GAS function (`auditNeedsAttention`) that Mike can paste into the script editor and run once. It returns a CSV-shaped JSON suitable for spreadsheet analysis. The function writes nothing, sends nothing, labels nothing.

Everything below this line that doesn't reference live data is grounded in `outreach.gs`, `readiness.gs`, `Code.gs`, and `email.gs` at commit `d49f6a2`.

---

## §1 — Why 305 items accumulated

Root causes, ranked by contribution. The numbering does not imply equal weighting; the empirical sample in §6 will quantify the mix.

### 1.1 — There is no automated way OUT of the queue
Verified at `outreach.gs:902 getHumanActionQueue` and `outreach.gs:940 resolveHumanAction`. Items only leave the queue when a human explicitly calls `outreach.resolve-action` via the UI. There is no aging job, no re-classification job, no auto-resolve for OOO that has elapsed, no recovery from transient errors.

**Mechanical consequence:** the queue is strictly monotonically non-decreasing between human resolutions. If 5 false-positive items arrive per day and the human resolves 1 per day, the queue grows by 4/day indefinitely.

### 1.2 — The legacy "is it from us?" filter is too narrow
Verified at `outreach.gs:677-680`:
```javascript
const replies = messages.filter(m => {
  const from = m.getFrom().toLowerCase();
  return !from.includes('askmiro.com') && !from.includes('info@askmiro');
});
```
The filter only excludes mail from the `askmiro.com` domain. Any of the following counts as a "reply":
- A bounce DSN from `mailer-daemon@googlemail.com`
- An out-of-office reply from `noreply@<corporate-mta>.com`
- A vacation auto-reply
- A delivery-status notification
- A "thanks for your enquiry, ticket #1234" automated acknowledgement from the entity's helpdesk
- An email from a forwarding address (the lead replied via Gmail but their `From` says `john@personal.com`, not `john@business.com`) — this is still a real human reply, but the auth path may be confused

This filter is currently active because `MAIL_DIRECTION_CLASSIFIER_ENABLED = false` (v94). So every 2 hours, every non-askmiro message in a contacted thread is fed to the classifier as a "reply candidate".

### 1.3 — The catch-all `default` branch flags everything ambiguous
Verified at `outreach.gs:760-766`:
```javascript
default:
  // Catch-all for anything the classifier produces
  newOutreachStatus = OS.REPLIED;
  humanAction       = true;          // ← writes needsHumanAction='true'
  humanReason       = 'unclassified_reply';
  replyNextAction   = 'Review reply manually';
```
The switch matches `UNSUBSCRIBE`, `NOT_INTERESTED`, `OUT_OF_OFFICE`, `WRONG_CONTACT`, `POSITIVE`, `INTERESTED`, `INFO_REQUEST`. **Anything else** — including the AI's `REPLIED` fallback (line 826-830, 836, 882-887) — falls through and gets flagged.

Because `_classifyReplyAI` itself returns `REPLIED` as its fallback in three places:
- Line 829: when an exception is caught
- Line 836: when `ANTHROPIC_API_KEY` is missing
- Line 883: when the AI returns an intent not in the valid list

…every AI failure deposits another item in the human queue with `humanActionReason='unclassified_reply'`.

### 1.4 — `WRONG_CONTACT` and `POSITIVE` always go to the queue by design
Verified at `outreach.gs:744-745` and `outreach.gs:752-753`. This is correct behavior — these need human action — but every email from a sector with shared inboxes (info@, contact@, hello@) typically triggers a `WRONG_CONTACT` response from a receptionist forwarding it. Each one becomes a queue entry that requires manual research.

### 1.5 — Re-classification is impossible without resetting the row
Verified at `outreach.gs:630-635`. The reply-scan only operates on rows where `(!r.replyStatus || r.replyStatus === '')`. Once any classification is written, the row is forever excluded from future scans, even if the classification was wrong or the row has subsequently received more messages in the same thread.

**Mechanical consequence:** a single false-positive `REPLIED` write sticks until a human clears it.

### 1.6 — Sent-thread capture has a known sleep-and-pray window
Verified at `outreach.gs:355-368`:
```javascript
GmailApp.sendEmail(lead.email, subject, textBody, { … });
Utilities.sleep(1200);
const sentThread = _findSentThread(lead.email, subject);
const threadId   = sentThread ? sentThread.getId() : '';
```
If `_findSentThread` returns null (Gmail not yet indexed the sent message), `threadId` is written as empty string. Replies to that lead will never be scanned because `r.threadId` is falsy at line 633. Lead is silently lost from the reply-scan, but `outreachStatus` is already `CONTACTED` — so it sits forever in CONTACTED with no reply detection.

### 1.7 — `_flagHumanAction` is called on send-error and follow-up-error
Verified at `outreach.gs:289-290` and `315-316`:
```javascript
} catch(e) {
  Logger.log('autoSend initial fail for ' + lead.id + ': ' + e.message);
  _flagHumanAction(lead.id, 'send_error', 'Initial send failed: ' + e.message);
}
```
Every Gmail send exception (rate limit, transient API error, malformed address that slips past `email_guard`) creates a queue entry. There is no retry. There is no de-duplication — if the same lead errors 3 times in 3 trigger windows, three queue entries are not created (it's the same row), but the `humanActionReason` is overwritten each time with the latest error, losing history.

---

## §2 — Quantification framework

Because the live sheet is not reachable from this terminal, I cannot return precise counts. The categories below are the **complete enumeration of states** an item in the 305 can be in, derived from every code path that sets `needsHumanAction='true'`:

| Category | `humanActionReason` value | Source line(s) | Expected fraction (hypothesis) |
|---|---|---|---|
| Genuine human replies — interested | `interested_reply` | `outreach.gs:753` | Small (5–15%) — these are the wins the system catches correctly |
| Genuine human replies — wrong contact (true positive) | `wrong_contact` | `outreach.gs:745` | Small–Medium (10–20%) |
| Genuine human replies — unclear intent | `unclassified_reply` | `outreach.gs:764` | Medium (15–30%) — AI fallback or `REPLIED` from AI |
| Self-follow-ups misclassified as replies | `unclassified_reply` | `outreach.gs:764` via filter at 679 | Likely 0% — own follow-ups go in same thread but `from` matches `askmiro.com` so they're filtered |
| Bounced / invalid addresses | `unclassified_reply` | DSN body contains "could not be delivered" — none of the regex rules at 792–816 catch this, so falls to AI which may classify as `NOT_INTERESTED` or `REPLIED` | Medium (15–25%) — the legacy filter does not exclude bounces |
| Duplicate threads (same lead, multiple rows) | depends on what arrives in each thread | `outreach.gs:_findSentThread` may match the wrong sent message if subjects collide | Small (3–8%) |
| Auto-replies / OOO that should have been recoverable | misclassified as `REPLIED` → `unclassified_reply` | The OOO regex at 799 catches some but not all phrasings | Small–Medium (10–20%) |
| Missing-contact issues (no email, no phone, status='STOPPED') | `wrong_contact` if it came from a reply; otherwise wouldn't be in this queue | n/a — these enter via reply path | n/a |
| Send/parse failures | `send_error` / `followup_error` | `outreach.gs:289, 315` | Small (1–5%) |
| Readiness-gate-blocked (pre-v94 deploy window) | `readiness_gate:...` | `outreach.gs:296` | Should be 0 — gate is `false` and was only deployed for hours before kill-switch landed |
| Unknown / unclassified residue | various | catch-all default at `outreach.gs:760` | The "everything else" bucket |

**The exact distribution cannot be inferred without reading the sheet.** §6 provides the read-only script to capture it.

### 2.1 — Quantification script (read-only)
The function below can be pasted into the GAS script editor and run once. It writes nothing, sends nothing. It returns a JSON blob suitable for `JSON.stringify` and pasting into a spreadsheet for analysis. **This script does not exist in the deployed v94 codebase** — it's audit-only, paste and discard.

```javascript
// READ-ONLY — paste into GAS editor, run once, delete.
function auditNeedsAttention() {
  const rows = getTableRows('Leads').filter(r =>
    r.leadDirection === 'outbound' && String(r.needsHumanAction) === 'true'
  );

  // Bucket by humanActionReason root
  const buckets = {};
  rows.forEach(r => {
    const reason = (r.humanActionReason || '').split(':')[0] || 'empty';
    buckets[reason] = (buckets[reason] || 0) + 1;
  });

  // Bucket by replyStatus
  const byReplyStatus = {};
  rows.forEach(r => {
    const rs = r.replyStatus || 'empty';
    byReplyStatus[rs] = (byReplyStatus[rs] || 0) + 1;
  });

  // Bucket by outreachStatus
  const byOutreachStatus = {};
  rows.forEach(r => {
    const os = r.outreachStatus || 'empty';
    byOutreachStatus[os] = (byOutreachStatus[os] || 0) + 1;
  });

  // Age distribution
  const now = Date.now();
  const ageDays = rows.map(r => {
    const t = new Date(r.lastContactedAt || r.createdAt || now).getTime();
    return Math.floor((now - t) / (1000 * 60 * 60 * 24));
  });
  ageDays.sort((a,b) => a - b);
  const median = ageDays[Math.floor(ageDays.length / 2)] || 0;
  const p90    = ageDays[Math.floor(ageDays.length * 0.9)] || 0;

  return {
    total: rows.length,
    bucketsByReason:    buckets,
    bucketsByReplyStatus: byReplyStatus,
    bucketsByOutreachStatus: byOutreachStatus,
    age: { medianDays: median, p90Days: p90, oldestDays: ageDays[ageDays.length-1] || 0 },
    // Three samples requested in §6 (no email bodies, no PII — just metadata)
    sample25Newest: rows.slice().sort((a,b) =>
      new Date(b.lastContactedAt || 0) - new Date(a.lastContactedAt || 0)
    ).slice(0, 25).map(_summarise),
    sample25Oldest: rows.slice().sort((a,b) =>
      new Date(a.lastContactedAt || 0) - new Date(b.lastContactedAt || 0)
    ).slice(0, 25).map(_summarise),
    sample25Random: _shuffle(rows.slice()).slice(0, 25).map(_summarise),
  };

  function _summarise(r) {
    return {
      id: r.id,
      companyName: r.companyName,
      outreachStatus: r.outreachStatus,
      replyStatus: r.replyStatus,
      humanActionReason: r.humanActionReason,
      replyNextAction: r.replyNextAction,
      replySummary: (r.replySummary || '').substring(0, 80),  // truncated
      lastContactedAt: r.lastContactedAt,
      threadId: r.threadId ? '(present)' : '(empty)',  // do not leak thread id
    };
  }

  function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
```

---

## §3 — Decision tree currently running in GAS (v94, all flags false)

```
┌─────────────────────────────────────────────────────────────────────┐
│ TRIGGER: scanOutreachReplies()   — every 2 hours                    │
│   leads = Leads where leadDirection='outbound'                       │
│             AND outreachStatus ∈ {CONTACTED, FOLLOW_UP_1,           │
│                                    FOLLOW_UP_2, FINAL_FOLLOW_UP}    │
│             AND threadId is not empty                                │
│             AND replyStatus is empty                                 │
└─────────┬───────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ for each lead:                                                       │
│   thread = GmailApp.getThreadById(lead.threadId)                     │
│   if !thread: return                                                 │
│   if thread.messages.length <= 1: return (no replies)                │
└─────────┬───────────────────────────────────────────────────────────┘
          │
          ▼
   ┌──────────────────────────────────────────┐
   │ if CFG.MAIL_DIRECTION_CLASSIFIER_ENABLED │   ← false in v94
   │   ❌ SKIPPED                              │
   │   (would call classify_mail_direction)   │
   └──────────────┬───────────────────────────┘
                  │  flag is false → fall through
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LEGACY PATH — currently active                                       │
│ replies = messages.filter(m =>                                       │
│   !m.from.includes('askmiro.com') &&                                 │
│   !m.from.includes('info@askmiro')                                   │
│ )                                                                    │
│ if replies.length === 0: return                                      │
│ latestReply = replies[replies.length - 1]                            │
│ replyText = latestReply.getPlainBody().substring(0, 3000)            │
└─────────┬───────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ _ruleBasedClassify(replyText)  — regex-only, free                    │
│                                                                      │
│   if matches /unsubscribe|.../        → UNSUBSCRIBE                  │
│   if matches /out of office|.../      → OUT_OF_OFFICE                │
│   if matches /not interested|.../     → NOT_INTERESTED               │
│   if matches /wrong (person|email)|.../ → WRONG_CONTACT              │
│   if matches /yes please|interested|.../ → POSITIVE                  │
│   otherwise                           → null  (escalate to AI)       │
└─────────┬───────────────────────────────────────────────────────────┘
          │
       ┌──┴──┐
       │     │
   rule null   rule hit
       │     │
       ▼     │
┌──────────────────────────────────────┐
│ _classifyReplyAI(emailBody, lead)    │
│   claude-haiku-4-5, 120 tokens       │
│   prompt asks for 1 of 7 intents     │
│                                      │
│   if no API key:                     │
│     return { intent: 'REPLIED' }     │
│   if API exception:                  │
│     return { intent: 'REPLIED' }     │
│   if invalid intent returned:        │
│     return { intent: 'REPLIED' }     │
└───────────┬──────────────────────────┘
            │
            ▼
       ┌──────────┴──────────────────────────────────────────┐
       │ switch (cls.intent) — outreach.gs:723               │
       │                                                      │
       │ UNSUBSCRIBE → UNSUBSCRIBED, no human action          │
       │ NOT_INTERESTED → NOT_INTERESTED, no human action     │
       │ OUT_OF_OFFICE → write replyStatus only, EARLY RETURN │
       │   (no outreachStatus change, will be re-scanned      │
       │    on next trigger because replyStatus is now set,   │
       │    BUT — the filter at line 634 excludes rows with   │
       │    non-empty replyStatus, so OOO rows are LOCKED OUT │
       │    from rescan even after the person returns)         │
       │ WRONG_CONTACT → STOPPED, needsHumanAction=true        │
       │ POSITIVE/INTERESTED/INFO_REQUEST → QUALIFIED, human   │
       │ default → REPLIED, needsHumanAction=true (catch-all)  │
       └─────────────────────────────────────────────────────┘
```

### 3.1 — `handleNonHumanThread` and `classify_mail_direction` are dormant
Both are defined (`gas/readiness.gs:114-220`) but **not invoked** because their parent guards in `outreach.gs` are flag-gated and the flags are `false`. They are dead code from a runtime perspective. Their presence in v94 is safe; their absence from the decision tree is the cause of the bounce/OOO/machine-mail bleed-through.

### 3.2 — Writers of `needsHumanAction='true'`
Exhaustive enumeration (from grep at audit time):
1. `outreach.gs:289` — initial send error (in catch block)
2. `outreach.gs:315` — follow-up send error
3. `outreach.gs:612` — `_flagHumanAction` (generic helper, callable from anywhere)
4. `outreach.gs:665` — bounce-detected write (gated off by `BOUNCE_HANDLER_ENABLED=false`, currently unreachable)
5. `outreach.gs:773` — main reply-classification switch (catch-all + WRONG_CONTACT + POSITIVE branches)

### 3.3 — Writers of `needsHumanAction='false'` (clearers)
Only one in code:
1. `outreach.gs:945` — `resolveHumanAction` (explicit human resolution via UI)

There is **no automated clearer** anywhere in the codebase.

---

## §4 — Failure-mode map

### 4.1 — False positives (item ends up in queue that shouldn't be there)

| # | Failure | Where | How it manifests |
|---|---|---|---|
| F1 | Bounce DSN treated as a reply | filter at `outreach.gs:679` does not check `mailer-daemon` / DSN headers | bounces go to AI → AI either misclassifies as NOT_INTERESTED or returns REPLIED → enters queue with `unclassified_reply` |
| F2 | OOO not caught by rule regex | regex at `outreach.gs:799` misses phrasings like "I'll be back on Monday" or "thank you for your message — we'll respond within 48h" | falls to AI; AI may correctly classify as OUT_OF_OFFICE or may return REPLIED |
| F3 | Helpdesk ticket auto-acknowledgement | nothing detects "your enquiry has been received, ticket #1234" | classified as INFO_REQUEST or REPLIED → flagged as human action with `interested_reply` (false positive) |
| F4 | Forwarding-rule reply | a colleague forwards Mike's email to their boss; the boss replies — `From` is now the boss's email which doesn't match the lead row | reply detected on a thread that no longer "belongs" to the original lead row but the threadId matches, so it gets attributed |
| F5 | Marketing newsletter from the same domain after a contact | if a lead's company sends a marketing email to office@askmiro that lands in the same thread (rare but possible via reply-all loops) | counted as a reply |
| F6 | AI fallback to REPLIED | API key missing, transient API error, malformed AI response | enters queue with `unclassified_reply` even if the underlying message was an OOO or NOT_INTERESTED |
| F7 | Send-error self-flagging | rate-limit or transient Gmail error during `_autoSendInitial` | row flagged with `send_error` but never retried |

### 4.2 — Sticky states (item cannot leave the queue automatically)

| # | Failure | Where |
|---|---|---|
| S1 | Once `needsHumanAction='true'`, only `resolveHumanAction` clears it | `outreach.gs:940` |
| S2 | Once `replyStatus` is set, the row is excluded from `scanOutreachReplies` permanently (line 634) | even if the lead later sends a real interested reply in the same thread, it will never be re-classified |
| S3 | OOO branch writes `replyStatus='OUT_OF_OFFICE'` and returns early without changing outreachStatus | this is intentional ("resume follow-ups later") but the row is now locked out of future reply scans → if the person returns and replies, the system will not see it |
| S4 | `outreachStatus=STOPPED` from `WRONG_CONTACT` | terminal state; row excluded from `OS_FOLLOW_UP_STATES` and from reply-scan filter |

### 4.3 — Threads that cannot recover automatically

| # | Failure | Recovery path |
|---|---|---|
| R1 | `threadId` was empty when initial send happened | none — row sits in CONTACTED forever with no reply detection |
| R2 | `threadId` points to a thread that was later deleted in Gmail | `GmailApp.getThreadById` returns null, scan returns early — silent skip every 2h forever |
| R3 | Misclassified bounce → `outreachStatus=REPLIED`, `needsHumanAction=true` | manual reset only |
| R4 | OOO → `replyStatus='OUT_OF_OFFICE'` (S3) | manual clear of replyStatus, but no UI for this exists |

### 4.4 — Where Gmail thread direction detection breaks

| # | Break | Detail |
|---|---|---|
| D1 | Filter is substring-based, not From-header-based | `from.includes('askmiro.com')` would miss `Mike Kato <mkato.ug@gmail.com>` reply-alls — Mike's own follow-up from his personal Gmail would be counted as an external reply |
| D2 | No handling of "delegated send" senders | if Mike sets up "send-as" from another address, Gmail records the From as that other address |
| D3 | No check for `In-Reply-To` / `References` headers | thread membership is taken on faith from `threadId` lookup |
| D4 | `getPlainBody()` strips HTML; some auto-replies have HTML-only bodies and may return empty string → AI sees empty input → fallback REPLIED |

---

## §5 — Irreversible / high-risk mutations in current outreach logic

Catalog of every mutation the system can perform on Gmail or Sheet state without explicit human approval.

| # | Mutation | Reversible? | Where | Currently active? |
|---|---|---|---|---|
| M1 | `GmailApp.sendEmail` (initial outreach) | No — email is sent | `outreach.gs:355` | YES (every 4h trigger) |
| M2 | `GmailApp.sendEmail` (follow-ups via `_sendInThread`) | No | `outreach.gs:_sendInThread` | YES |
| M3 | `updateRow('Leads', ..., { outreachStatus: ... })` | Yes (rewrite the cell) but no undo log | many places | YES |
| M4 | `updateRow('Leads', ..., { needsHumanAction: 'true', ... })` | Yes | M-points in §3.2 | YES |
| M5 | `thread.moveToArchive()` | Reversible (un-archive in Gmail UI) but no audit | `readiness.gs:262` inside `handleBounce` | **NO** (BOUNCE_HANDLER_ENABLED=false) |
| M6 | `thread.removeLabel(...)` / `thread.addLabel(...)` | Reversible manually | `readiness.gs:261-263` | **NO** (gated off) |
| M7 | `add_suppression(email, ...)` via Postgres API | Reversible by `remove_suppression` but no UI to do so | called from `readiness.gs:_apiPost('.../suppression', ...)` | **NO** (gated off + API endpoint not deployed) |
| M8 | `_logSentEmail` to `SentEmails` sheet | Append-only audit | `email-send.gs:97` | YES (when email-send.gs path is used) |
| M9 | PropertiesService writes for daily-send counter | Reversible by clearing the property | `outreach.gs:602-606` | YES |
| M10 | Postgres `outreach_events` INSERT | Reversible (DELETE) but should never be done | gated by `OUTREACH_EVENT_LOGGING_ENABLED` | **NO** (gated off) |
| M11 | Postgres `entities.outreach_readiness_status` UPDATE | Reversible (set back to null) | only via `readiness.py` | **NO** — readiness.py has never been run against prod |

**Current irreversible mutations from the live system:** M1, M2, M8 (Gmail sends + audit log).
**All readiness-layer mutations:** dormant via kill switches.

---

## §6 — Sample classification simulation

This section cannot be completed without live sheet access. The execution plan is:

1. Mike opens the GAS script editor.
2. Pastes the `auditNeedsAttention()` function from §2.1 into a temporary `.gs` file (e.g. `audit-tmp.gs`).
3. Runs `auditNeedsAttention()` once from the editor.
4. Copies the JSON return value (visible in the execution log) into a separate file.
5. The function file is then deleted, never deployed.

The returned JSON will contain:
- Total queue size (expected ≈ 305)
- Bucket counts by `humanActionReason`, `replyStatus`, `outreachStatus`
- Age distribution (median, p90, oldest)
- 75 sampled rows (25 newest / 25 oldest / 25 random), each with redacted metadata only — no email bodies, no thread IDs, no PII beyond the company name that already exists in the Leads sheet

Once that data is in hand, the audit can be **closed** by completing the table in §2 with empirical numbers. Until then, §2's hypothesis column stands.

---

## §7 — Risk-ranked remediation plan

Each remediation is scored on (impact, effort, reversibility). Items at the top are highest-leverage and lowest-risk to apply first.

### Tier 1 — Pure code, no schema, no behavior change to existing rows

#### T1.1 — Fix the "REPLIED catch-all flags everything" pattern
**Impact:** High. Eliminates the AI-fallback-floods-queue path.
**Effort:** Small. One switch-case change.
**Reversibility:** Full — code-only.
**Risk:** Low.

Change `outreach.gs:760-766` from `default → needsHumanAction=true` to a confidence-gated path:
```javascript
default:
  newOutreachStatus = OS.REPLIED;
  if (cls.confidence === 'ai' && cls.intent === 'REPLIED') {
    // AI explicitly returned REPLIED catch-all — schedule for re-classification, don't flag yet
    humanAction = false;
    replyNextAction = 'Awaiting re-classification';
  } else {
    humanAction = true;
    humanReason = 'unclassified_reply';
    replyNextAction = 'Review reply manually';
  }
```
Plus add a separate "re-classification" job that, after N days, re-runs the AI on REPLIED rows that never received human action.

#### T1.2 — Add a confidence threshold to the AI classifier
**Impact:** Medium.
**Effort:** Small. Change AI prompt to require `confidence: "high"|"medium"|"low"` and only auto-act on `high`.
**Reversibility:** Full.
**Risk:** Low.

#### T1.3 — Detect own follow-ups by checking `from` against the active GAS user, not by substring
**Impact:** Medium.
**Effort:** Small.
**Reversibility:** Full.
**Risk:** Low.
Replace `from.includes('askmiro.com')` with `from === Session.getEffectiveUser().getEmail() || from.endsWith('@askmiro.com')`.

### Tier 2 — Activate dormant code with explicit consent

#### T2.1 — Turn on `MAIL_DIRECTION_CLASSIFIER_ENABLED`, leave `BOUNCE_HANDLER_ENABLED=false`
**Impact:** High. Filters bounce/OOO/machine mail from the AI input, but takes no side-effect action.
**Effort:** One flag flip.
**Reversibility:** Full — flip flag off.
**Risk:** Low. With `BOUNCE_HANDLER_ENABLED=false`, a detected bounce is **logged-only** at `outreach.gs:670` and the row remains unchanged. The classifier prevents bounces from polluting the AI input but does not yet archive or suppress anything.

**This is the highest-impact, lowest-risk change available right now.**

#### T2.2 — Then turn on `BOUNCE_HANDLER_ENABLED` (only after T2.1 has been observed for ≥7 days)
**Impact:** High. Bounces are auto-archived and suppressed. The Leads row gets `outreachStatus=BOUNCED`.
**Effort:** One flag flip.
**Reversibility:** Partially. Archive can be undone manually in Gmail. Suppression can be removed via `remove_suppression`. But every bounce now triggers a write to `email_suppressions` (Postgres) which requires the migration to have run.
**Risk:** Medium. Must be preceded by the migration. Must have observed T2.1's bounce-detection accuracy for ≥7 days.

#### T2.3 — `OUTREACH_EVENT_LOGGING_ENABLED` and `READINESS_GATE_ENABLED` last
These are the deepest integrations. Not yet ready for activation discussion until T2.1 + T2.2 have been observed.

### Tier 3 — Queue cleanup of the existing 305

#### T3.1 — Safe automatic recoveries (low risk)
Items where the classification is provably wrong from metadata alone:
- Any row where `replyStatus='OUT_OF_OFFICE'` AND `lastContactedAt > 30 days ago` → eligible to clear `replyStatus`, unblocking future reply detection (still leaves the row in CONTACTED, no email is sent).
- Any row where `humanActionReason='send_error'` AND the underlying email has since validated successfully → unflag, allow retry.
- Any row where `outreachStatus=BOUNCED` (none currently, but post-T2.2 they'll exist) → already handled.

These should require **explicit batch approval** ("apply 47 OOO clears? y/n") not a background cron.

#### T3.2 — Items that must remain human-reviewed
- All `humanActionReason='interested_reply'` — these are the wins, never auto-resolve
- All `humanActionReason='wrong_contact'` with no enrichment data — need human research
- Anything where the `replySummary` contains numbers/currency/dates (likely substantive business content)

#### T3.3 — Proposed confidence thresholds for auto-acting

| Action | Required confidence |
|---|---|
| Auto-clear OOO | rule-based regex match (deterministic) |
| Auto-clear bounce | DSN header detected (deterministic) |
| Auto-suppress email | bounce confirmed by Postmaster header (NOT body regex) |
| Auto-mark NOT_INTERESTED | rule-based match OR (AI confidence='high' AND human confirms first 5 cases) |
| Auto-mark POSITIVE | NEVER — always human-review |
| Auto-mark WRONG_CONTACT | NEVER — always human-review (alternative contact may exist) |

#### T3.4 — Queue aging strategy
- 0–7 days: normal priority
- 7–30 days: degrade to "stale" bucket; auto-attempt re-classification once
- >30 days: archive to a separate sheet, do not delete; UI hides them by default
- >90 days: eligible for human bulk-archive review

#### T3.5 — Retry logic
- Transient `send_error` should be retried up to 3 times with exponential backoff, NOT immediately flagged
- AI classifier failures (no key, exception) should retry on next trigger, NOT flag the row

#### T3.6 — Bounce handling redesign
Build the redesign **before** flipping `BOUNCE_HANDLER_ENABLED`:
- Detect bounce via DSN header (`Content-Type: message/delivery-status`) not subject regex
- Extract `Final-Recipient:` from RFC 3464 body (already implemented in `_extract_bounced_address`)
- Soft-bounce vs hard-bounce distinction: 4xx codes = retry in 24h, 5xx = suppress immediately
- Idempotent suppression — if email is already suppressed, skip the write
- Log every bounce to `outreach_events` with the DSN headers for audit

#### T3.7 — Observability metrics to add
None of these mutate the system; all are read-only counters:
- `reply_scan_runs_total`, `reply_scan_threads_examined`, `reply_scan_replies_classified`
- `classifier_rule_hit_count`, `classifier_ai_call_count`, `classifier_ai_fallback_count`
- `human_queue_size_gauge` (point-in-time)
- `human_queue_age_seconds_histogram`
- `bounce_detected_count` (post-T2.1)
- `auto_resolved_count` (post-T3.1)
- `send_error_count`
- `mail_direction_distribution` (counts per direction post-T2.1)

Implementation: append to a `Metrics` sheet on each trigger run. No external service required.

#### T3.8 — Anything that could silently lose leads (CRITICAL)
1. **Empty threadId from `_findSentThread` race** (R1). Fix: retry `_findSentThread` up to 5x with 500ms backoff before accepting empty.
2. **OOO branch locks the row from future scans** (S3). Fix: T3.1 OOO clear job, or change line 738 to set `replyStatus` only on a separate column like `lastReplyClassification` that doesn't gate the scan filter.
3. **Deleted Gmail thread silently skipped** (R2). Fix: detect null thread, flag with `humanActionReason='thread_missing'` so it surfaces for human attention rather than disappearing.

#### T3.9 — Anything that could create false suppression (CRITICAL)
1. **Body regex misclassifies a normal email containing the word "delivered" as a bounce.** Mitigation: only suppress on header-based DSN detection, never on body text.
2. **AI hallucination returning NOT_INTERESTED on an ambiguous reply.** Mitigation: T1.2 confidence threshold + T3.3 NEVER auto-suppress on NOT_INTERESTED, only mark intent.
3. **Manual `add_suppression` triggered from an unsubscribe regex match that hit a legitimate quoted-text from a prior email** (i.e. lead quotes our previous email containing "unsubscribe"). Mitigation: quoted-text stripping before regex match.

#### T3.10 — Anything that could incorrectly mark a lead as replied (CRITICAL)
1. **The legacy filter at line 679 treats any non-askmiro From as a reply.** This includes Mike's own personal Gmail forwarding the lead's email back. Fix: T1.3.
2. **A thread containing only an auto-acknowledgement marks the lead as REPLIED with `unclassified_reply` reason.** Fix: T2.1 (machine-mail classifier filters these).
3. **A thread where a colleague accidentally CC'd a third party who replies "remove me" — gets classified UNSUBSCRIBE for the original lead.** Fix: track per-thread which email address the unsubscribe came from; only suppress if it matches `lead.email`.

---

## §8 — Recommended rollout order for the four kill switches

This section is the proposed sequencing only — every flip is gated by an explicit Mike approval.

| Phase | Flag | When | Gate / verification |
|---|---|---|---|
| **0 (already done)** | All four = `false` | v94 deployed | Confirmed |
| **A** | Nothing flipped. Run §6 audit. Apply T1.1, T1.2, T1.3 as code fixes. Push to git, **not yet deployed**. | Now → 1 day | Mike reviews diffs |
| **B** | Deploy T1 fixes as GAS v95 — still all four flags `false` | After A complete | 7 days observation: did the queue-growth rate slow? does the AI fallback rate drop? |
| **C** | `MAIL_DIRECTION_CLASSIFIER_ENABLED = true` only — log-only mode (BOUNCE_HANDLER still false) | After B's 7 days | Observe `mail_direction_distribution` metric for ≥7 days. Confirm bounce/OOO/machine counts match human intuition. |
| **D** | Run Postgres migration 010 (via runner, dry-run first) | After C confirms classification accuracy | Per `OUTREACH_READINESS_ARCHITECTURE.md` §11 — separate go/no-go |
| **E** | `OUTREACH_EVENT_LOGGING_ENABLED = true` | After D | Observe `outreach_events` row writes. Confirm no PII leakage, no schema mismatches. 7 days. |
| **F** | `BOUNCE_HANDLER_ENABLED = true` | After E's 7 days | Real bounces start auto-archiving + suppressing. Watch `email_suppressions` writes. |
| **G** | `READINESS_GATE_ENABLED = true` | After running readiness scoring on full entity set AND human review of distribution | This is the deepest gate — blocks sends. Last to flip. |

**Minimum total elapsed time from now → G: ~6 weeks.** No phase shorter than 7 days of observation.

---

## §9 — Constraints honored by this audit

- ❌ No `clasp push`
- ❌ No `clasp deploy`
- ❌ No `git push`
- ❌ No migration run
- ❌ No queue mutation
- ❌ No Gmail label writes
- ❌ No suppression writes
- ❌ No auto-fixes applied
- ❌ No git commits
- ✅ Read-only file inspection only
- ✅ Pure analysis; all sample-classification deferred to §6 read-only script

---

## §10 — Sign-off

This report is the audit deliverable. No remediation is approved by its existence.

| | Name | Date | Reviewed |
|---|---|---|---|
| Author | Claude | 2026-05-13 | ✅ |
| Reviewer | Mike | pending | |
