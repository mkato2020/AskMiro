# Outreach State Machine (current, v94)

## Lead `outreachStatus` enum
Source: `gas/outreach.gs:35-50`

```
                    ┌──────────────────────────┐
                    │   READY_FOR_OUTREACH     │ ← set externally (pipeline)
                    └────────────┬─────────────┘
                                 │ autoSendOutreach trigger fires
                                 │ (every 4h, ≤50/day cap)
                                 ▼
                    ┌──────────────────────────┐
                    │   LOCKED_FOR_OUTREACH    │ ← guard against double-send
                    └────────────┬─────────────┘
                                 │ _autoSendInitial → GmailApp.sendEmail
                                 │ writes threadId + msgId
                                 ▼
                    ┌──────────────────────────┐
                    │       CONTACTED          │
                    └──┬───────────┬───────────┘
                       │           │
        send-error in  │           │  3 days pass, autoSend re-enters
        try/catch      │           │  _autoSendFollowUp
                       │           ▼
                       │  ┌──────────────────────────┐
                       │  │     FOLLOW_UP_1          │
                       │  └────────────┬─────────────┘
                       │               │ 7 more days
                       │               ▼
                       │  ┌──────────────────────────┐
                       │  │     FOLLOW_UP_2          │
                       │  └────────────┬─────────────┘
                       │               │ 14 more days, MAX_FOLLOW_UPS=3
                       │               ▼
                       │  ┌──────────────────────────┐
                       │  │   FINAL_FOLLOW_UP        │ ← no further sends
                       │  └────────────┬─────────────┘
                       │               │
                       │               │ scanOutreachReplies still scans these
                       │               │ until a replyStatus is set
                       │               ▼
                       │  [in reply-scan loop]
                       │
                       ▼
            _flagHumanAction
            (does NOT change outreachStatus)


  ═══════════════ FROM REPLY-SCAN LOOP ═══════════════

  Any of {CONTACTED, FOLLOW_UP_1, FOLLOW_UP_2, FINAL_FOLLOW_UP}
  with non-empty threadId and empty replyStatus → reply-scan runs.

  classification.intent
       │
       ├─ UNSUBSCRIBE  ────→  UNSUBSCRIBED  (terminal)
       │
       ├─ NOT_INTERESTED ──→  NOT_INTERESTED (terminal)
       │
       ├─ OUT_OF_OFFICE ───→  (no state change, replyStatus set)
       │                      ⚠️  STICKY — row locked out of future scans
       │
       ├─ WRONG_CONTACT ───→  STOPPED  (terminal) + needsHumanAction
       │
       ├─ POSITIVE       ┐
       ├─ INTERESTED     ├─→ QUALIFIED (terminal-ish) + needsHumanAction
       ├─ INFO_REQUEST   ┘
       │
       └─ default (REPLIED) → REPLIED (terminal-ish) + needsHumanAction
                              ⚠️  AI fallback floods here


  ═══════════════ HUMAN RESOLUTION ═══════════════

  resolveHumanAction (manual UI action)
    ├─ clears needsHumanAction=false
    └─ optionally sets outreachStatus to caller-chosen value
       (must be one of OS values)


  ═══════════════ TERMINAL STATES ═══════════════

  No more automated action from autoSendOutreach OR scanOutreachReplies:
    REPLIED, QUALIFIED, NOT_INTERESTED, UNSUBSCRIBED, STOPPED, DISQUALIFIED

  PAUSED — referenced in enum but no writer found in current code

  BOUNCED — newly added in v94, only writer is the gated bounce path
            (currently unreachable; BOUNCE_HANDLER_ENABLED=false)
```

## Key transition properties

| Transition | Reversible? | Sticky? |
|---|---|---|
| READY_FOR_OUTREACH → LOCKED_FOR_OUTREACH | No automated reverse | Yes |
| LOCKED → CONTACTED | One-way | Yes |
| CONTACTED → FOLLOW_UP_n | Time-driven, monotonic | Yes |
| any → REPLIED | Triggers on first non-askmiro message | **Sticky — no rescan** |
| any → UNSUBSCRIBED | Triggered by regex or AI | Terminal |
| any → NOT_INTERESTED | Regex or AI | Terminal |
| any → STOPPED (via WRONG_CONTACT) | Manual reset only | Terminal |
| any → QUALIFIED | Manual follow-up needed | "Terminal" but expected to advance via pipeline |
| OUT_OF_OFFICE replyStatus set | Same outreachStatus, but `replyStatus` filter excludes from future scan | **Critical sticky bug** |

## Critical bugs visible from the diagram

1. **OUT_OF_OFFICE branch** sets `replyStatus='OUT_OF_OFFICE'` and returns early. The reply-scan filter (`outreach.gs:634`) excludes any row with non-empty `replyStatus`. **Result:** the row is permanently invisible to future reply scans, even after the person comes back from leave and replies properly. The comment at line 733 ("Don't change status — they're just away, resume follow-ups later") is contradicted by the filter.

2. **REPLIED state is a one-shot.** Once written, the row is permanently locked out of the reply-scan loop. A second, substantive reply in the same thread (which is common — first reply is OOO/auto-ack, second is the real human) is never seen.

3. **BOUNCED is a defined enum value but reachable only via gated code.** Currently `BOUNCE_HANDLER_ENABLED=false` so the only writer never runs. The enum exists to prevent `outreachStatus: undefined` bug if a flag is flipped without the others.
