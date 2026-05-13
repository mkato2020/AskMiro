# Reply Classification Decision Graph (current, v94)

## Inputs
- Lead row from Sheets where `outreachStatus ∈ {CONTACTED, FOLLOW_UP_1, FOLLOW_UP_2, FINAL_FOLLOW_UP}` and `threadId ≠ ''` and `replyStatus = ''`
- Gmail thread fetched via `GmailApp.getThreadById(lead.threadId)`

## Graph

```
                  Gmail thread (>=2 messages)
                              │
                              ▼
   ┌────────────────────────────────────────────────────────────┐
   │ CFG.MAIL_DIRECTION_CLASSIFIER_ENABLED                       │
   │       false (v94)              │       true                 │
   └──────────┬─────────────────────┴──────┬─────────────────────┘
              │                            │
              ▼                            ▼
   ╔════════════════════╗     classify_mail_direction(thread)
   ║   LEGACY PATH       ║      returns one of:
   ║                     ║        OUTBOUND_ASKMIRO
   ║ filter messages by  ║        INBOUND_HUMAN
   ║ from.includes       ║        INBOUND_MACHINE
   ║ ('askmiro.com')     ║        BOUNCE
   ║                     ║        OUT_OF_OFFICE
   ║ ⚠️  treats bounces  ║        AUTO_REPLY
   ║    & OOO & DSN      ║        UNSUBSCRIBE
   ║    as "replies"     ║        DELIVERY_STATUS_NOTIFICATION
   ╚══════════╤══════════╝        UNKNOWN
              │                            │
              │                            ▼
              │           ┌──────────────────────────────┐
              │           │ direction === 'INBOUND_HUMAN'│
              │           │   no  │  yes                 │
              │           └───┬───┴───┬──────────────────┘
              │               │       │
              │               ▼       ▼
              │      handleNonHumanThread   continue with
              │      (gated by             rule + AI classifier
              │       BOUNCE_HANDLER_      below
              │       ENABLED)
              │       false → log-only
              │       true  → archive +
              │               suppress
              │
              ▼
   ┌────────────────────────────────────────────────┐
   │ _ruleBasedClassify(replyText)  — regex only    │
   │                                                 │
   │ regex order is FIRST MATCH WINS:               │
   │                                                 │
   │   /unsubscribe|remove me|stop email|opt[-]?out │
   │    /please remove|take me off/                 │
   │      → UNSUBSCRIBE                              │
   │                                                 │
   │   /out of office|away until|on (annual )?leave │
   │    /ooo|on holiday|vacation|                   │
   │    /i am currently away/                       │
   │      → OUT_OF_OFFICE                            │
   │                                                 │
   │   /not interested|no thank|don'?t need         │
   │    /happy with (our|the) current|              │
   │    /already have a (cleaner|cleaning)|         │
   │    /not looking|we don'?t require/             │
   │      → NOT_INTERESTED                           │
   │                                                 │
   │   /wrong (person|email|department)|            │
   │    /not my (role|department|area)|             │
   │    /you should contact|please contact our/     │
   │      → WRONG_CONTACT                            │
   │                                                 │
   │   /yes (please|i'?d|we'?d|that would)|         │
   │    /sounds good|interested|                    │
   │    /let'?s (chat|talk|discuss|arrange)|        │
   │    /send (me|us) (more|a quote)|               │
   │    /book (a )?call|happy to chat/              │
   │      → POSITIVE                                 │
   │                                                 │
   │   otherwise → null (escalate to AI)            │
   └─────────────────────┬───────────────────────────┘
                         │
              ┌──────────┴───────────┐
              │                      │
          rule hit                rule null
              │                      │
              │                      ▼
              │       ┌───────────────────────────────────────────┐
              │       │ _classifyReplyAI(emailBody, lead)         │
              │       │   model: claude-haiku-4-5                 │
              │       │   max_tokens: 120                          │
              │       │                                            │
              │       │   asks for intent ∈ {POSITIVE,             │
              │       │     NOT_INTERESTED, UNSUBSCRIBE,           │
              │       │     INFO_REQUEST, OUT_OF_OFFICE,           │
              │       │     WRONG_CONTACT, REPLIED}                │
              │       │                                            │
              │       │   FALLBACKS (all return REPLIED):          │
              │       │     ANTHROPIC_API_KEY unset                │
              │       │     UrlFetchApp exception                  │
              │       │     intent not in valid list               │
              │       │     malformed JSON                         │
              │       │                                            │
              │       │   ⚠️  every fallback floods queue          │
              │       │     with 'unclassified_reply'              │
              │       └─────────────────────┬─────────────────────┘
              │                             │
              ▼                             ▼
        ┌─────────────────────────────────────────┐
        │ switch (cls.intent)                      │
        │                                           │
        │  UNSUBSCRIBE                              │
        │    → outreachStatus=UNSUBSCRIBED          │
        │    → needsHumanAction=false               │
        │    → terminal                             │
        │                                           │
        │  NOT_INTERESTED                           │
        │    → outreachStatus=NOT_INTERESTED        │
        │    → needsHumanAction=false               │
        │    → terminal                             │
        │                                           │
        │  OUT_OF_OFFICE                            │
        │    → replyStatus only (no status change)  │
        │    → ⚠️ early return, no further updates  │
        │    → ⚠️ STICKY (row locked from rescan)   │
        │                                           │
        │  WRONG_CONTACT                            │
        │    → outreachStatus=STOPPED               │
        │    → needsHumanAction=true                │
        │    → humanReason='wrong_contact'          │
        │                                           │
        │  POSITIVE | INTERESTED | INFO_REQUEST     │
        │    → outreachStatus=QUALIFIED             │
        │    → needsHumanAction=true                │
        │    → humanReason='interested_reply'       │
        │    → trigger _onPositiveReply notification│
        │                                           │
        │  default (catch-all)                      │
        │    → outreachStatus=REPLIED               │
        │    → needsHumanAction=true                │
        │    → humanReason='unclassified_reply'     │
        │    → ⚠️ ALL AI FALLBACKS LAND HERE        │
        └───────────────────────────────────────────┘
```

## Confidence semantics (current)

| Source | `cls.confidence` value | Auto-act? |
|---|---|---|
| rule-based regex hit | `'rule'` | Yes |
| AI returned valid intent | `'ai'` | Yes |
| AI returned REPLIED fallback | `'ai'` | Yes — but goes to default branch |
| AI exception | `'fallback'` | Yes — REPLIED → queue |
| AI no API key | `'no_key'` | Yes — REPLIED → queue |

**There is no high/medium/low confidence distinction.** The AI is asked for an intent only, not a confidence level. Every AI output is treated as equally trustworthy.

## Quoted-text vulnerability

`replyText = latestReply.getPlainBody().substring(0, 3000)` at `outreach.gs:684`.

`getPlainBody()` returns the message body **including** quoted text from prior messages in the thread. So if our original outreach contained the word "unsubscribe" (it does — in the `List-Unsubscribe` footer), every reply that quotes that footer will trip the UNSUBSCRIBE regex on the FIRST 3000 chars, regardless of what the human actually wrote.

**This is a likely contributor to false UNSUBSCRIBE classifications.**

Mitigation (proposed, not implemented): strip quoted-text via `replyText.split(/^>|^On .* wrote:/m)[0]` before classification.
