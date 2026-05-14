# W3 — Classifier Authority Refactor

**Status:** DESIGN. No code change. No deploy.
**Author:** Claude
**Reviewer:** Mike
**Date:** 2026-05-14
**Depends on:** `QUEUE_SEMANTIC_VALIDATION.md` (ontology baseline), `W2_INGESTION_NORMALIZATION_PLAN.md` (upstream cleanliness)
**Activation gate:** `MAIL_DIRECTION_CLASSIFIER_ENABLED` (already deployed, default `false`)

---

## §1 — The problem in one sentence

The current classifier reads transport-layer signal, performs probabilistic interpretation, and commits business-layer state in a single uninstrumented step — with no notion of authority, confidence, or evidence trail.

Empirical proof: 88.1% of the live human-review queue (52 of 59 rows) was misclassified as REPLIED based on transport activity that was AskMiro's own outbound mail.

## §2 — The replacement architecture: three serial gates

Each gate is authoritative at exactly one layer. Each gate has a different evidence type, a different writer, and a different commit semantics.

```
                  ┌─────────────────────────────────────────┐
                  │  Inbound Gmail thread state             │
                  │  (transport-layer raw observation)      │
                  └────────────────┬────────────────────────┘
                                   │
                                   ▼
        ╔═══════════════════════════════════════════════════════╗
        ║  GATE 1 — TRANSPORT CLASSIFIER (DETERMINISTIC)        ║
        ║                                                        ║
        ║  Inputs:                                              ║
        ║    - thread.getMessages()                             ║
        ║    - latest message's headers (From, Auto-Submitted,  ║
        ║      Content-Type, Final-Recipient)                   ║
        ║                                                        ║
        ║  Decisions (regex/header-based, no AI):               ║
        ║    1. _isOurSender(From) → SELF_FOLLOWUP              ║
        ║       (discard; no further processing)                ║
        ║    2. Content-Type: message/delivery-status           ║
        ║       OR _isBouncePattern(From, Subject)              ║
        ║       → BOUNCED (or DELIVERY_STATUS_NOTIFICATION)     ║
        ║    3. Auto-Submitted: auto-replied                    ║
        ║       OR _isAutoReplyPattern(From, Subject)           ║
        ║       → OUT_OF_OFFICE (or AUTO_REPLY)                 ║
        ║    4. Otherwise → PROCEED_TO_GATE_2                   ║
        ║                                                        ║
        ║  Output: { direction: enum, evidence: JSON }          ║
        ║  Confidence: ALWAYS HIGH (deterministic)              ║
        ║  Authorised to commit: SELF_FOLLOWUP, BOUNCED,        ║
        ║    OUT_OF_OFFICE, AUTO_REPLY directly to terminal     ║
        ║                                                        ║
        ║  AskMiro authoritative senders (configurable in CFG): ║
        ║    - mkato.ug@gmail.com                               ║
        ║    - @askmiro.com (any subdomain)                     ║
        ║    - "Mike Kato" as display name                      ║
        ║    - Future aliases must be added here, NOT inferred  ║
        ╚════════════════════╤══════════════════════════════════╝
                             │
              PROCEED_TO_GATE_2 (transport says "human-looking inbound")
                             │
                             ▼
        ╔═══════════════════════════════════════════════════════╗
        ║  GATE 2 — COMMUNICATION CLASSIFIER (MIXED)            ║
        ║                                                        ║
        ║  Inputs:                                              ║
        ║    - replyText = message.getPlainBody().substring(...)║
        ║    - stripQuotedText(replyText) ← critical fix        ║
        ║      (removes our prior outreach quoted in the reply, ║
        ║       which currently trips false UNSUBSCRIBE matches)║
        ║                                                        ║
        ║  Two sub-steps:                                       ║
        ║    2a. _ruleBasedClassify (existing regex)            ║
        ║        → If regex hit: { intent, confidence: 'rule' } ║
        ║        → Skip 2b                                      ║
        ║                                                        ║
        ║    2b. _classifyReplyAI with confidence stamp          ║
        ║        Prompt asks: { intent, confidence: HIGH/MED/LOW║
        ║                       evidence_snippet, reasoning }   ║
        ║        Valid intents: POSITIVE, NOT_INTERESTED,       ║
        ║          UNSUBSCRIBE, INFO_REQUEST, WRONG_CONTACT,    ║
        ║          REPLIED (catch-all → LOW confidence)         ║
        ║                                                        ║
        ║  Output: { intent, confidence, evidence,              ║
        ║           classifier_version, prompt_version }        ║
        ║                                                        ║
        ║  Authorised to commit: NOTHING directly.              ║
        ║  All decisions emit EVIDENCE for Gate 3.              ║
        ╚════════════════════╤══════════════════════════════════╝
                             │
                             ▼
        ╔═══════════════════════════════════════════════════════╗
        ║  GATE 3 — BUSINESS COMMIT (POLICY-DRIVEN)             ║
        ║                                                        ║
        ║  Inputs: Gate 2 output                                ║
        ║                                                        ║
        ║  Decision matrix:                                     ║
        ║                                                        ║
        ║  intent=POSITIVE                                       ║
        ║    confidence=HIGH    → queue as GENUINE_REPLY        ║
        ║                         (HUMAN COMMIT — operator      ║
        ║                          decides to QUALIFIED)        ║
        ║    confidence=MEDIUM  → queue as GENUINE_REPLY        ║
        ║                         (operator confirms intent)    ║
        ║    confidence=LOW     → queue as CLASSIFIER_UNCERTAIN ║
        ║                                                        ║
        ║  intent=NOT_INTERESTED                                 ║
        ║    confidence=HIGH    → auto-commit NOT_INTERESTED    ║
        ║                         (DETERMINISTIC + audit)       ║
        ║    confidence=MEDIUM/LOW → CLASSIFIER_UNCERTAIN       ║
        ║                                                        ║
        ║  intent=UNSUBSCRIBE                                    ║
        ║    confidence=HIGH (rule)  → auto-suppress + auto-    ║
        ║      commit UNSUBSCRIBED (DETERMINISTIC)              ║
        ║    confidence=AI ANY → queue as GENUINE_REPLY for     ║
        ║      operator confirmation (unsubscribes are high-    ║
        ║      stakes; never auto-commit from AI)               ║
        ║                                                        ║
        ║  intent=INFO_REQUEST                                   ║
        ║    → ALWAYS queue as GENUINE_REPLY (questions need     ║
        ║      a human-written response)                        ║
        ║                                                        ║
        ║  intent=WRONG_CONTACT                                  ║
        ║    confidence=HIGH (rule)  → auto-commit STOPPED with ║
        ║      humanActionReason='wrong_contact'                ║
        ║    confidence=AI ANY → queue as WRONG_CONTACT for     ║
        ║      operator (may have actionable referral)          ║
        ║                                                        ║
        ║  intent=REPLIED (AI fallback)                         ║
        ║    → ALWAYS queue as CLASSIFIER_UNCERTAIN             ║
        ║      (this is the "we don't know" bucket)             ║
        ║                                                        ║
        ║  Authorised to commit: business-layer state.          ║
        ║  Every commit writes one row to outreach_events:      ║
        ║    - decision                                         ║
        ║    - inputs (intent, confidence)                      ║
        ║    - classifier_version                                ║
        ║    - prompt_version                                   ║
        ║    - evidence_snippet                                 ║
        ║    - committed_state                                  ║
        ║    - operator_override (null if auto)                 ║
        ╚═══════════════════════════════════════════════════════╝
```

## §3 — Files affected

| File | Change | Risk |
|---|---|---|
| `gas/readiness.gs` | Already contains `classify_mail_direction()` and `handleNonHumanThread()`. Activate via `MAIL_DIRECTION_CLASSIFIER_ENABLED` flag. Improve sender-identity check to include `mkato.ug@gmail.com` explicitly. | Low — dormant code becomes active |
| `gas/outreach.gs:scanOutreachReplies` | Add `stripQuotedText()` call before classifier sees `replyText`. Wrap existing rule + AI classifiers in confidence-stamping layer. Add Gate 3 decision matrix replacing the current switch statement. | Medium — touches live reply pipeline |
| `gas/outreach.gs:_ruleBasedClassify` | Add `confidence: 'rule'` to return (already present, just formalise). | None |
| `gas/outreach.gs:_classifyReplyAI` | Update prompt to request confidence + evidence_snippet. Parse them from response. Bump prompt_version. | Low — prompt change only |
| `gas/Code.gs` | Add `AUTHORITATIVE_SENDERS` list to CFG (replaces inline regex). | None |
| `api.py` | Already has `/api/outreach/event` endpoint (kill-switched off). Add new event types: TRANSPORT_CLASSIFIED, COMMUNICATION_CLASSIFIED, BUSINESS_COMMITTED. | Low — additive |

## §4 — Activation sequence

Each gate has its own kill switch. They activate in dependency order. Each requires observation before the next.

| Phase | Action | Kill switch | Verification |
|---|---|---|---|
| A | Code change for Gate 1 (sender-identity widening, transport classifier) | `MAIL_DIRECTION_CLASSIFIER_ENABLED` still false | Unit tests pass against committed code |
| B | Deploy Gate 1 code (still kill-switched off) | unchanged | Confirm via marker pattern that v95 method worked — verify deployed code via inspection |
| C | Flip `MAIL_DIRECTION_CLASSIFIER_ENABLED = true` for log-only mode | flag true; bounce handler still false | Observe one full reply-scan cycle. Verify SELF_FOLLOWUP detections log correctly. No mutations to Leads sheet beyond `replyStatus` clearing. |
| D | After 7 days of clean log-only observation: enable bounce/auto-reply auto-commits | `BOUNCE_HANDLER_ENABLED = true` | Bounces now auto-suppress; OOO/auto-reply rows now stay in pre-scan state |
| E | Code change for Gate 2 confidence-stamping (prompt update) | unchanged from D | Unit tests on synthetic ambiguous messages |
| F | Deploy Gate 2; verify confidence values appear in outreach_events | unchanged | Observe 7 days; verify distribution of confidence values matches expectation |
| G | Code change for Gate 3 decision matrix | unchanged from F | Unit tests covering each (intent × confidence) cell |
| H | Deploy Gate 3 | unchanged | Confidence-gated auto-commits now active; operator queue only sees GENUINE_REPLY + CLASSIFIER_UNCERTAIN |

Total elapsed time: ~4–6 weeks minimum from W3 start to Gate 3 active.

## §5 — Rollback per phase

| Phase | Rollback action |
|---|---|
| A–B | Git revert code commit |
| C | Flip `MAIL_DIRECTION_CLASSIFIER_ENABLED` back to false |
| D | Flip `BOUNCE_HANDLER_ENABLED` back to false. Any bounces auto-suppressed during this window remain suppressed — that's correct, they're legitimately bad addresses. |
| E–F | Revert prompt change in `_classifyReplyAI`. Existing AI calls without confidence stamps fall back to default `confidence: 'unknown'` and route through current switch. |
| G–H | Revert Gate 3 decision matrix. Auto-committed state changes from this window are preserved in `outreach_events`; can be reverse-applied if needed. |

## §6 — What this depends on

W3 cannot start before:
- **W2 (ingestion normalization)** is materially complete — otherwise the classifier learns from poisoned input (placeholder emails, transport-encoded addresses, entity-conflict rows). Empirically: 3 of the 4 WRONG_CONTACT rows in today's queue are W2-territory defects, not classifier defects.
- **W1 (queue taxonomy)** schema is migrated — Gate 3 commits to W1 terminal states. Without W1, Gate 3 has nowhere to write.

## §7 — What this prevents recurring

| Current defect | How W3 prevents it |
|---|---|
| SELF_FOLLOWUP misclassified as REPLIED | Gate 1 catches our own sends deterministically via authoritative sender list, before Gate 2 sees them |
| AI fallback to REPLIED floods queue | Gate 3 routes `intent=REPLIED` to CLASSIFIER_UNCERTAIN bucket, not GENUINE_REPLY |
| Bounce DSN classified as reply | Gate 1 detects Content-Type / Final-Recipient header, bypasses Gates 2–3 entirely |
| Quoted-text in reply matching UNSUBSCRIBE regex | `stripQuotedText()` before classification removes our own outreach footer from the inspected body |
| No audit trail for why a row became REPLIED | Every Gate 3 commit writes outreach_events with full evidence chain |
| Probabilistic AI changes meaning of business state over time | Gate 3 confidence floors prevent low-confidence AI outputs from committing business state |

## §8 — Constraints honored

- ❌ No code change (design only)
- ❌ No deploy
- ❌ No mutation
- ❌ No flag flip
- ✅ Documentation only

## §9 — Sign-off

| | Name | Date | Reviewed |
|---|---|---|---|
| Author | Claude | 2026-05-14 | ✅ |
| Reviewer | Mike | pending | |
