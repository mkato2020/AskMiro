// ============================================================
// AskMiro Ops — outreach.gs  v2.0  (Automation Engine)
// ============================================================
//
// AUTOMATION-FIRST: GAS time triggers run the pipeline hands-off.
//   autoSendOutreach()    — every 4 h   — sends initial emails + follow-ups
//   scanOutreachReplies() — every 2 h   — rule-based → AI reply classification
//
// Human action ONLY required for:
//   • Positive / interested replies  (needsHumanAction = true)
//   • Lead QUALIFIED → quote needed
//   • Errors requiring investigation
//
// COST REDUCTION
//   • Pre-generated AI emails from Python (outreachEmailBody / followUpEmailBody)
//     → zero marginal AI cost for sending
//   • Rule-based reply classifier handles ~70 % of replies free
//   • Claude Haiku only called for truly ambiguous replies
//
// STATUS STATE MACHINE
//   READY_FOR_OUTREACH → LOCKED_FOR_OUTREACH → CONTACTED
//   → FOLLOW_UP_1 → FOLLOW_UP_2 → FINAL_FOLLOW_UP
//   → REPLIED | QUALIFIED | NOT_INTERESTED | UNSUBSCRIBED | STOPPED | DISQUALIFIED
//
// NEW COLUMNS — run setupOutreachColumns() once after deploying
//   outreachEmailBody, followUpEmailBody, pythonLeadId, handoffAt,
//   needsHumanAction, humanActionReason, replyNextAction
//   (plus existing v1 cols: leadDirection, sourceLeadId, leadScore,
//    outreachStatus, outreachTemplate, followUpCount,
//    lastContactedAt, nextFollowUpAt, replyStatus, replySummary,
//    threadId, gmailMessageId)
// ============================================================

// ── STATUS CONSTANTS ──────────────────────────────────────────
const OS = {
  READY_FOR_OUTREACH:  'READY_FOR_OUTREACH',
  LOCKED_FOR_OUTREACH: 'LOCKED_FOR_OUTREACH',  // being processed by autoSend
  CONTACTED:           'CONTACTED',
  FOLLOW_UP_1:         'FOLLOW_UP_1',
  FOLLOW_UP_2:         'FOLLOW_UP_2',
  FINAL_FOLLOW_UP:     'FINAL_FOLLOW_UP',
  REPLIED:             'REPLIED',
  QUALIFIED:           'QUALIFIED',
  NOT_INTERESTED:      'NOT_INTERESTED',
  UNSUBSCRIBED:        'UNSUBSCRIBED',
  PAUSED:              'PAUSED',
  STOPPED:             'STOPPED',
  DISQUALIFIED:        'DISQUALIFIED',
};

// Active follow-up states (still in sequence, awaiting next touch)
const OS_FOLLOW_UP_STATES = [OS.CONTACTED, OS.FOLLOW_UP_1, OS.FOLLOW_UP_2];

// Terminal states — no more automated action
const OS_TERMINAL = [
  OS.REPLIED, OS.QUALIFIED, OS.NOT_INTERESTED,
  OS.UNSUBSCRIBED, OS.STOPPED, OS.DISQUALIFIED,
];

// ── CONFIG ────────────────────────────────────────────────────
const OUTREACH_LOG    = 'Outreach_Log';
const DAILY_SEND_CAP  = 50;   // max outbound emails per day (sender reputation)
const AUTO_BATCH_SIZE = 20;   // emails per autoSendOutreach() run
const FOLLOW_UP_DAYS  = [3, 7, 14];  // days between touches (contact, FU1, FU2)
const MAX_FOLLOW_UPS  = 3;           // CONTACTED + FU1 + FU2 → then FINAL_FOLLOW_UP

// ── FALLBACK EMAIL TEMPLATES (used only if Python email body absent) ──────────
const OUTREACH_TEMPLATES = {
  intro_commercial: {
    label:   'Intro — Commercial',
    subject: 'Professional cleaning for {{companyName}} — AskMiro',
    body:
`Hi {{contactName}},

I hope this finds you well. I'm reaching out because AskMiro Cleaning Services specialises in {{serviceType}} cleaning for businesses across London — and {{companyName}} caught my attention.

Our teams are DBS-checked, fully insured, and we work around your schedule to minimise disruption.

I'd love to put together a no-obligation quote within 24 hours — would that work for you?

Best,
Mike Kato
Co-founder, AskMiro Cleaning Services
T: 020 8073 0621  |  E: info@askmiro.com`
  },

  intro_residential: {
    label:   'Intro — Residential / Airbnb',
    subject: 'Reliable end-of-tenancy cleaning — AskMiro',
    body:
`Hi {{contactName}},

AskMiro specialises in end-of-tenancy and Airbnb turnaround cleaning in London — DBS-checked, fully insured, same-week availability.

Happy to send rates and availability. Would a brief chat work?

Best,
Mike Kato
AskMiro Cleaning Services
T: 020 8073 0621  |  E: info@askmiro.com`
  },

  follow_up_1: {
    label:   'Follow-up #1',
    subject: 'Re: Cleaning services for {{companyName}}',
    body:
`Hi {{contactName}},

Just a quick follow-up on my note about cleaning services for {{companyName}}.

If the timing isn't right, no worries — but if you'd like a quick quote or have any questions I'm happy to help within 24 hours.

Best,
Mike Kato
AskMiro  |  020 8073 0621`
  },

  follow_up_2: {
    label:   'Follow-up #2',
    subject: 'Cleaning for {{companyName}} — one last note',
    body:
`Hi {{contactName}},

One last note before I leave you in peace — if you ever need a reliable cleaning team in London, we're always at info@askmiro.com.

Wishing you all the best,
Mike Kato
AskMiro Cleaning Services`
  },

  final_follow_up: {
    label:   'Final Follow-up',
    subject: 'Still here if you need us — AskMiro for {{companyName}}',
    body:
`Hi {{contactName}},

I won't keep following up — just wanted to leave this here in case the timing is better down the line.

If you ever need a reliable cleaning partner in London, we're at info@askmiro.com or 020 8073 0621.

All the best,
Mike Kato
AskMiro Cleaning Services`
  },
};


// ══════════════════════════════════════════════════════════════
// PART 1 — HANDOFF FROM LEAD INTELLIGENCE
// POST outreach.handoff
// Accepts leads from Python; adds outbound leads to CRM queue.
// Stores pre-generated AI email bodies to avoid re-generating.
// ══════════════════════════════════════════════════════════════

function handoffLead(body, auth) {
  requireRole(auth, 'OpsManager');

  const email   = String(body.email || '').trim().toLowerCase();
  const company = String(body.companyName || body.company || '').trim();

  if (!email || !email.includes('@')) {
    return { error: 'Valid email required' };
  }

  // ── Duplicate guard ─────────────────────────────────────────
  const existing = getTableRows('Leads').find(r =>
    String(r.email || '').toLowerCase() === email
  );
  if (existing) {
    // Upgrade score if new signal is stronger
    const newScore = Number(body.leadScore || 0);
    const oldScore = Number(existing.leadScore || 0);
    const updates  = {};
    if (newScore > oldScore) updates.leadScore = String(newScore);
    // Refresh AI email bodies if Python sends updated ones
    if (body.outreachEmailBody) updates.outreachEmailBody = body.outreachEmailBody;
    if (body.followUpEmailBody)  updates.followUpEmailBody  = body.followUpEmailBody;
    if (Object.keys(updates).length) updateRow('Leads', existing.id, updates);
    return { ok: true, duplicate: true, leadId: existing.id };
  }

  // ── Infer segment + template ────────────────────────────────
  const serviceType = body.serviceType || body.service_type || '';
  const segment     = body.segment || _inferSegment(serviceType);
  const template    = body.outreachTemplate || body.outreach_template ||
    (segment === 'Residential' ? 'intro_residential' : 'intro_commercial');

  // ── Build new outbound lead ─────────────────────────────────
  const leadId = genId('LEAD');
  const now    = new Date().toISOString();

  appendRow('Leads', {
    id:               leadId,
    companyName:      company || body.contactName || 'Unknown',
    contactName:      body.contactName || body.contact_name || '',
    phone:            body.phone || '',
    email:            email,
    serviceType:      serviceType,
    segment:          segment,
    source:           'outbound',
    status:           'OutreachQueued',
    createdAt:        now,
    createdBy:        auth.userId,
    // ── Outreach state ───────────────────────────────────────
    leadDirection:    'outbound',
    sourceLeadId:     String(body.sourceLeadId || body.source_lead_id || ''),
    pythonLeadId:     String(body.pythonLeadId  || body.python_lead_id  || ''),
    leadScore:        String(body.leadScore || body.lead_score || ''),
    outreachStatus:   OS.READY_FOR_OUTREACH,
    outreachTemplate: template,
    followUpCount:    '0',
    lastContactedAt:  '',
    nextFollowUpAt:   '',
    replyStatus:      '',
    replySummary:     '',
    threadId:         '',
    gmailMessageId:   '',
    handoffAt:        now,
    // ── Pre-generated AI email bodies (zero marginal AI cost) ─
    outreachEmailBody: body.outreachEmailBody || body.outreach_email_body || '',
    followUpEmailBody:  body.followUpEmailBody  || body.follow_up_email_body  || '',
    // ── Human action queue ───────────────────────────────────
    needsHumanAction:   'false',
    humanActionReason:  '',
    replyNextAction:    '',
  });

  invalidateCache('Leads');

  return { ok: true, duplicate: false, leadId: leadId };
}


// ══════════════════════════════════════════════════════════════
// PART 2 — AUTOMATION ENGINE
// autoSendOutreach() — time trigger, every 4 hours
// Sends initial outreach and follow-ups automatically.
// Respects daily send cap. Uses LockService to prevent overlap.
// ══════════════════════════════════════════════════════════════

function autoSendOutreach() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log('autoSendOutreach: already running — skipping');
    return;
  }
  try {
    _runAutoSend();
  } finally {
    lock.releaseLock();
  }
}

function _runAutoSend() {
  const sentToday = _getSentTodayCount();
  const remaining = DAILY_SEND_CAP - sentToday;

  Logger.log('autoSendOutreach: sentToday=' + sentToday + ' remaining=' + remaining);

  if (remaining <= 0) {
    Logger.log('autoSendOutreach: daily cap reached — skipping');
    return;
  }

  const batchLimit = Math.min(AUTO_BATCH_SIZE, remaining);
  const now        = new Date();
  const allLeads   = getTableRows('Leads').filter(r => r.leadDirection === 'outbound');

  // ── Phase 1: New leads ready for first contact ───────────────
  const readyQueue = allLeads
    .filter(r => r.outreachStatus === OS.READY_FOR_OUTREACH)
    .sort((a, b) => (Number(b.leadScore) || 0) - (Number(a.leadScore) || 0))
    .slice(0, batchLimit);

  let sent = 0;

  readyQueue.forEach(lead => {
    if (sent >= batchLimit) return;
    try {
      _autoSendInitial(lead);
      sent++;
      _incrementSentToday();
    } catch(e) {
      Logger.log('autoSend initial fail for ' + lead.id + ': ' + e.message);
      _flagHumanAction(lead.id, 'send_error', 'Initial send failed: ' + e.message);
    }
  });

  // ── Phase 2: Follow-ups due ──────────────────────────────────
  const batchLeft = batchLimit - sent;
  if (batchLeft <= 0) return;

  const followUpDue = allLeads
    .filter(r =>
      OS_FOLLOW_UP_STATES.includes(r.outreachStatus) &&
      r.nextFollowUpAt &&
      new Date(r.nextFollowUpAt) <= now &&
      Number(r.followUpCount || 0) < MAX_FOLLOW_UPS
    )
    .sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt))
    .slice(0, batchLeft);

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

  // ── Phase 3: Final follow-ups (exhausted sequence) ──────────
  const batchLeft2 = batchLimit - sent;
  if (batchLeft2 <= 0) { invalidateCache('Leads'); return; }

  const finalDue = allLeads
    .filter(r =>
      r.outreachStatus === OS.FOLLOW_UP_2 &&
      r.nextFollowUpAt &&
      new Date(r.nextFollowUpAt) <= now &&
      Number(r.followUpCount || 0) >= MAX_FOLLOW_UPS - 1
    )
    .slice(0, batchLeft2);

  finalDue.forEach(lead => {
    if (sent >= batchLimit) return;
    try {
      _autoSendFinal(lead);
      sent++;
      _incrementSentToday();
    } catch(e) {
      Logger.log('autoSend final fail for ' + lead.id + ': ' + e.message);
    }
  });

  invalidateCache('Leads');
  Logger.log('autoSendOutreach complete. sent=' + sent + ' total today=' + (_getSentTodayCount()));
}


// ── SEND INITIAL EMAIL ────────────────────────────────────────
function _autoSendInitial(lead) {
  // Mark as locked immediately (prevents double-send if trigger overlaps)
  updateRow('Leads', lead.id, { outreachStatus: OS.LOCKED_FOR_OUTREACH });

  const { subject, textBody, htmlBody } = _buildEmail(lead, 'initial');

  GmailApp.sendEmail(lead.email, subject, textBody, {
    name:     'Mike Kato — AskMiro',
    replyTo:  'info@askmiro.com',
    bcc:      'info@askmiro.com',
    htmlBody: htmlBody,
    headers:  _unsubHeaders(),
  });

  Utilities.sleep(1200);
  const sentThread = _findSentThread(lead.email, subject);
  const threadId   = sentThread ? sentThread.getId() : '';
  const msgId      = sentThread
    ? sentThread.getMessages()[sentThread.getMessages().length - 1].getId()
    : '';

  const now        = new Date().toISOString();
  const nextFU     = _addDays(now, FOLLOW_UP_DAYS[0]);

  updateRow('Leads', lead.id, {
    status:           'Contacted',
    outreachStatus:   OS.CONTACTED,
    followUpCount:    '0',
    lastContactedAt:  now,
    nextFollowUpAt:   nextFU,
    threadId:         threadId,
    gmailMessageId:   msgId,
  });

  _appendLog(lead, 'initial', subject, now, '0', threadId, msgId);
}


// ── SEND FOLLOW-UP ────────────────────────────────────────────
function _autoSendFollowUp(lead) {
  const n = Number(lead.followUpCount || 0);
  const nextStatus = n === 0 ? OS.FOLLOW_UP_1 : OS.FOLLOW_UP_2;

  const { subject, textBody, htmlBody } = _buildEmail(lead, 'followup');

  _sendInThread(lead, subject, textBody, htmlBody);

  const newCount   = n + 1;
  const now        = new Date().toISOString();
  const nextFUDay  = FOLLOW_UP_DAYS[newCount] || FOLLOW_UP_DAYS[FOLLOW_UP_DAYS.length - 1];
  const nextFUAt   = _addDays(now, nextFUDay);

  updateRow('Leads', lead.id, {
    outreachStatus:  nextStatus,
    followUpCount:   String(newCount),
    lastContactedAt: now,
    nextFollowUpAt:  nextFUAt,
  });

  _appendLog(lead, 'follow_up_' + newCount, subject, now, String(newCount), lead.threadId, '');
}


// ── SEND FINAL FOLLOW-UP ─────────────────────────────────────
function _autoSendFinal(lead) {
  const { subject, textBody, htmlBody } = _buildEmail(lead, 'final');

  _sendInThread(lead, subject, textBody, htmlBody);

  const now = new Date().toISOString();
  updateRow('Leads', lead.id, {
    outreachStatus:  OS.FINAL_FOLLOW_UP,
    followUpCount:   String(Number(lead.followUpCount || 0) + 1),
    lastContactedAt: now,
    nextFollowUpAt:  '',  // no more follow-ups
  });

  _appendLog(lead, 'final_follow_up', subject, now, lead.followUpCount, lead.threadId, '');
}


// ── BUILD EMAIL (AI body first, template fallback) ─────────────
function _buildEmail(lead, phase) {
  let textBody;
  let subject;
  let templateKey;

  if (phase === 'initial') {
    // Use Python's pre-generated AI body if available (zero extra cost)
    textBody    = (lead.outreachEmailBody || '').trim();
    templateKey = lead.outreachTemplate || (
      (lead.segment || '').toLowerCase() === 'residential'
        ? 'intro_residential'
        : 'intro_commercial'
    );
    const tmpl = OUTREACH_TEMPLATES[templateKey] || OUTREACH_TEMPLATES.intro_commercial;
    subject    = _merge(tmpl.subject, lead);
    if (!textBody) textBody = _merge(tmpl.body, lead);

  } else if (phase === 'final') {
    textBody    = '';
    templateKey = 'final_follow_up';
    const tmpl  = OUTREACH_TEMPLATES.final_follow_up;
    subject     = _merge(tmpl.subject, lead);
    textBody    = _merge(tmpl.body, lead);

  } else {
    // follow-up: use Python's follow_up body if available
    textBody    = (lead.followUpEmailBody || '').trim();
    const n     = Number(lead.followUpCount || 0);
    templateKey = n === 0 ? 'follow_up_1' : 'follow_up_2';
    const tmpl  = OUTREACH_TEMPLATES[templateKey];
    subject     = _merge(tmpl.subject, lead);
    if (!textBody) textBody = _merge(tmpl.body, lead);
  }

  const htmlBody = _buildHtml(textBody);
  return { subject, textBody, htmlBody, templateKey };
}


// ── SEND IN-THREAD (reply) OR FRESH EMAIL ────────────────────
function _sendInThread(lead, subject, textBody, htmlBody) {
  if (lead.threadId) {
    try {
      const thread = GmailApp.getThreadById(lead.threadId);
      if (thread) {
        thread.reply(textBody, {
          htmlBody: htmlBody,
          name:     'Mike Kato — AskMiro',
          replyTo:  'info@askmiro.com',
        });
        return;
      }
    } catch(_) {}
  }
  GmailApp.sendEmail(lead.email, subject, textBody, {
    htmlBody: htmlBody,
    name:     'Mike Kato — AskMiro',
    replyTo:  'info@askmiro.com',
    bcc:      'info@askmiro.com',
    headers:  _unsubHeaders(),
  });
}


// ── DAILY SEND CAP HELPERS ────────────────────────────────────
function _getSentTodayCount() {
  const today = new Date().toISOString().split('T')[0];
  return parseInt(
    PropertiesService.getScriptProperties().getProperty('sent_' + today) || '0', 10
  );
}

function _incrementSentToday() {
  const today = new Date().toISOString().split('T')[0];
  const key   = 'sent_' + today;
  const props = PropertiesService.getScriptProperties();
  const cur   = parseInt(props.getProperty(key) || '0', 10);
  props.setProperty(key, String(cur + 1));
}

// ── HUMAN ACTION FLAG ─────────────────────────────────────────
function _flagHumanAction(leadId, reason, detail) {
  updateRow('Leads', leadId, {
    needsHumanAction:  'true',
    humanActionReason: reason + (detail ? ': ' + detail.substring(0, 200) : ''),
  });
}


// ══════════════════════════════════════════════════════════════
// PART 3 — REPLY DETECTION  (time trigger: every 2 hours)
// Scans Gmail threads for replies from outbound leads.
// Rule-based first (free, ~70%), AI only for ambiguous replies.
// ══════════════════════════════════════════════════════════════

function scanOutreachReplies() {
  // Check active leads in any post-contact state that haven't replied yet
  const contactedStatuses = [
    OS.CONTACTED, OS.FOLLOW_UP_1, OS.FOLLOW_UP_2, OS.FINAL_FOLLOW_UP
  ];

  const leads = getTableRows('Leads').filter(r =>
    r.leadDirection === 'outbound' &&
    contactedStatuses.includes(r.outreachStatus) &&
    r.threadId &&
    (!r.replyStatus || r.replyStatus === '')
  );

  Logger.log('scanOutreachReplies: checking ' + leads.length + ' threads');

  leads.forEach(lead => {
    try {
      const thread = GmailApp.getThreadById(lead.threadId);
      if (!thread) return;

      const messages = thread.getMessages();
      if (messages.length <= 1) return;

      // Find replies not from us
      const replies = messages.filter(m => {
        const from = m.getFrom().toLowerCase();
        return !from.includes('askmiro.com') && !from.includes('info@askmiro');
      });
      if (!replies.length) return;

      const latestReply = replies[replies.length - 1];
      const replyText   = latestReply.getPlainBody().substring(0, 3000);

      // ── Step 1: Rule-based (free, ~70% of replies) ──────────
      const ruleResult = _ruleBasedClassify(replyText);

      let cls;
      if (ruleResult) {
        cls = ruleResult;
        Logger.log('Reply classified by rules: ' + cls.intent + ' for lead ' + lead.id);
      } else {
        // ── Step 2: AI only for ambiguous replies ───────────────
        Logger.log('Ambiguous reply — calling AI for lead ' + lead.id);
        cls = _classifyReplyAI(replyText, lead);
      }

      const ts = new Date().toISOString();

      // ── Map intent → outreach status ─────────────────────────
      let newOutreachStatus = OS.REPLIED;
      let newLeadStatus     = lead.status;
      let humanAction       = false;
      let humanReason       = '';
      let replyNextAction   = '';

      switch (cls.intent) {
        case 'UNSUBSCRIBE':
          newOutreachStatus = OS.UNSUBSCRIBED;
          replyNextAction   = 'Unsubscribed — no further contact';
          break;
        case 'NOT_INTERESTED':
          newOutreachStatus = OS.NOT_INTERESTED;
          replyNextAction   = 'Not interested — close out';
          break;
        case 'OUT_OF_OFFICE':
          // Don't change status — they're just away, resume follow-ups later
          updateRow('Leads', lead.id, {
            replyStatus:   cls.intent,
            replySummary:  cls.summary,
            replyNextAction: 'OOO — resume follow-up after their return',
          });
          _updateLogReply(lead.id, cls, ts);
          return;  // don't proceed to full update below
        case 'WRONG_CONTACT':
          newOutreachStatus = OS.STOPPED;
          replyNextAction   = 'Wrong contact — research correct person';
          humanAction       = true;
          humanReason       = 'wrong_contact';
          break;
        case 'POSITIVE':
        case 'INTERESTED':
        case 'INFO_REQUEST':
          newOutreachStatus = OS.QUALIFIED;
          newLeadStatus     = 'Qualified';
          humanAction       = true;
          humanReason       = 'interested_reply';
          replyNextAction   = 'Warm reply — follow up personally within 24h';
          break;
        default:
          // Catch-all for anything the classifier produces
          newOutreachStatus = OS.REPLIED;
          humanAction       = true;
          humanReason       = 'unclassified_reply';
          replyNextAction   = 'Review reply manually';
      }

      updateRow('Leads', lead.id, {
        replyStatus:      cls.intent,
        replySummary:     cls.summary,
        outreachStatus:   newOutreachStatus,
        status:           newLeadStatus,
        needsHumanAction: humanAction ? 'true' : 'false',
        humanActionReason: humanAction ? humanReason : '',
        replyNextAction:  replyNextAction,
      });

      _updateLogReply(lead.id, cls, ts);

    } catch(e) {
      Logger.log('Reply scan error for ' + lead.id + ': ' + e.message);
    }
  });

  invalidateCache('Leads');
  Logger.log('scanOutreachReplies complete.');
}


// ── RULE-BASED CLASSIFIER (free, no API cost) ─────────────────
// Returns { intent, summary, confidence:'rule' } or null (needs AI)
function _ruleBasedClassify(text) {
  const t = (text || '').toLowerCase();

  if (/unsubscribe|remove\s+me|stop\s+email|opt[\s-]?out|please\s+remove|take\s+me\s+off/.test(t)) {
    return { intent: 'UNSUBSCRIBE', summary: 'Requested to unsubscribe', confidence: 'rule' };
  }

  if (/out\s+of\s+office|away\s+until|on\s+(annual\s+)?leave|ooo|on\s+holiday|vacation|i\s+am\s+currently\s+away/.test(t)) {
    return { intent: 'OUT_OF_OFFICE', summary: 'Out of office auto-reply', confidence: 'rule' };
  }

  if (/not\s+interested|no\s+thank|don'?t\s+need|happy\s+with\s+(our|the)\s+current|already\s+have\s+a\s+(cleaner|cleaning)|not\s+looking|we\s+don'?t\s+require/.test(t)) {
    return { intent: 'NOT_INTERESTED', summary: 'Not interested in services', confidence: 'rule' };
  }

  if (/wrong\s+(person|email|department)|not\s+my\s+(role|department|area)|you\s+should\s+contact|please\s+contact\s+our/.test(t)) {
    return { intent: 'WRONG_CONTACT', summary: 'Wrong contact — redirected', confidence: 'rule' };
  }

  // Clearly positive signals → send to human queue immediately
  if (/yes\s+(please|i'?d|we'?d|that\s+would)|sounds\s+good|interested|let'?s\s+(chat|talk|discuss|arrange)|send\s+(me|us)\s+(more|a\s+quote)|book\s+(a\s+)?call|happy\s+to\s+chat/.test(t)) {
    return { intent: 'POSITIVE', summary: 'Appears interested — review needed', confidence: 'rule' };
  }

  return null; // ambiguous — call AI
}


// ══════════════════════════════════════════════════════════════
// PART 4 — AI REPLY CLASSIFICATION (Anthropic Claude Haiku)
// Only called when rule-based classifier returns null (~30 % of replies)
// ══════════════════════════════════════════════════════════════

function _classifyReplyAI(emailBody, lead) {
  const fallback = {
    intent: 'REPLIED',
    summary: emailBody.substring(0, 80),
    confidence: 'fallback',
  };

  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) {
      Logger.log('ANTHROPIC_API_KEY not set — flagging for human review');
      return { intent: 'REPLIED', summary: emailBody.substring(0, 80), confidence: 'no_key' };
    }

    const prompt = `You are analysing a reply to a cold outreach email sent by AskMiro Cleaning Services (London).

Classify the reply intent into EXACTLY one of:
- POSITIVE       — interested, wants info, wants a quote, open to a call
- NOT_INTERESTED — not interested, polite decline, bad timing
- UNSUBSCRIBE    — opt out, stop emailing, remove from list
- INFO_REQUEST   — asking a specific question before deciding
- OUT_OF_OFFICE  — automated out of office / away message
- WRONG_CONTACT  — directed to wrong person or department
- REPLIED        — replied but unclear intent (catch-all)

Lead: ${lead.companyName || ''} (${lead.contactName || ''})

Reply:
"""
${emailBody}
"""

Respond with JSON only — no other text:
{"intent":"<one of the seven above>","summary":"<max 80 char summary>"}`;

    const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:             'post',
      muteHttpExceptions: true,
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      payload: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 120,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    const result = JSON.parse(resp.getContentText());
    const text   = (result.content && result.content[0] && result.content[0].text) || '';
    const match  = text.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const valid  = ['POSITIVE','NOT_INTERESTED','UNSUBSCRIBE','INFO_REQUEST',
                      'OUT_OF_OFFICE','WRONG_CONTACT','REPLIED'];
      return {
        intent:     valid.includes(parsed.intent) ? parsed.intent : 'REPLIED',
        summary:    parsed.summary || emailBody.substring(0, 80),
        confidence: 'ai',
      };
    }
    return fallback;

  } catch(e) {
    Logger.log('_classifyReplyAI error: ' + e.message);
    return fallback;
  }
}


// ══════════════════════════════════════════════════════════════
// PART 5 — HUMAN ACTION QUEUE
// GET outreach.human-queue — returns leads needing human attention
// ══════════════════════════════════════════════════════════════

function getHumanActionQueue(params, auth) {
  requireRole(auth, 'OpsManager');

  const leads = getTableRows('Leads').filter(r =>
    r.leadDirection === 'outbound' && String(r.needsHumanAction) === 'true'
  );

  leads.sort((a, b) => {
    // Interested replies first, then by recency
    const aHot = (a.humanActionReason || '').includes('interested') ? 0 : 1;
    const bHot = (b.humanActionReason || '').includes('interested') ? 0 : 1;
    if (aHot !== bHot) return aHot - bHot;
    return new Date(b.lastContactedAt || b.createdAt || 0) -
           new Date(a.lastContactedAt || a.createdAt || 0);
  });

  return {
    ok:    true,
    queue: leads.map(r => ({
      id:               r.id,
      companyName:      r.companyName,
      contactName:      r.contactName,
      email:            r.email,
      phone:            r.phone,
      outreachStatus:   r.outreachStatus,
      replyStatus:      r.replyStatus,
      replySummary:     r.replySummary,
      humanActionReason: r.humanActionReason,
      replyNextAction:  r.replyNextAction,
      lastContactedAt:  r.lastContactedAt,
      leadScore:        r.leadScore,
      segment:          r.segment,
    })),
    total: leads.length,
  };
}

// POST: resolve a human action item
function resolveHumanAction(body, auth) {
  requireRole(auth, 'OpsManager');
  if (!body.leadId) return { error: 'leadId required' };

  const updates = {
    needsHumanAction:  'false',
    humanActionReason: '',
    replyNextAction:   body.nextAction || '',
  };
  if (body.outreachStatus && Object.values(OS).includes(body.outreachStatus)) {
    updates.outreachStatus = body.outreachStatus;
  }
  if (body.leadStatus) {
    updates.status = body.leadStatus;
  }

  updateRow('Leads', body.leadId, updates);
  invalidateCache('Leads');
  return { ok: true };
}


// ══════════════════════════════════════════════════════════════
// PART 6 — OUTREACH QUEUE / STATS API (for frontend)
// ══════════════════════════════════════════════════════════════

function getOutreachQueue(params, auth) {
  requireRole(auth, 'OpsManager');

  const all   = getTableRows('Leads').filter(r => r.leadDirection === 'outbound');
  const queue = all.filter(r =>
    r.outreachStatus === OS.READY_FOR_OUTREACH ||
    r.outreachStatus === OS.CONTACTED ||
    r.outreachStatus === OS.FOLLOW_UP_1 ||
    r.outreachStatus === OS.FOLLOW_UP_2
  );

  queue.sort((a, b) => {
    const sd = (Number(b.leadScore) || 0) - (Number(a.leadScore) || 0);
    if (sd !== 0) return sd;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  return { ok: true, queue: queue.map(_safeLeadFields), total: queue.length };
}

function getOutreachStats(params, auth) {
  requireRole(auth, 'OpsManager');

  const all   = getTableRows('Leads').filter(r => r.leadDirection === 'outbound');
  const today = new Date().toISOString().split('T')[0];
  const sentToday = _getSentTodayCount();

  const byStatus = s => all.filter(r => r.outreachStatus === s).length;

  // Reply rate based on all contacted leads
  const contacted  = all.filter(r =>
    [OS.CONTACTED, OS.FOLLOW_UP_1, OS.FOLLOW_UP_2, OS.FINAL_FOLLOW_UP,
     OS.REPLIED, OS.QUALIFIED, OS.NOT_INTERESTED, OS.UNSUBSCRIBED].includes(r.outreachStatus)
  ).length;
  const replied    = all.filter(r =>
    [OS.REPLIED, OS.QUALIFIED].includes(r.outreachStatus)
  ).length;
  const replyRate  = contacted > 0 ? Math.round((replied / contacted) * 100) : 0;

  return {
    ok:                 true,
    totalOutbound:      all.length,
    readyForOutreach:   byStatus(OS.READY_FOR_OUTREACH),
    contacted:          byStatus(OS.CONTACTED),
    followUp1:          byStatus(OS.FOLLOW_UP_1),
    followUp2:          byStatus(OS.FOLLOW_UP_2),
    finalFollowUp:      byStatus(OS.FINAL_FOLLOW_UP),
    replied:            byStatus(OS.REPLIED),
    qualified:          byStatus(OS.QUALIFIED),
    notInterested:      byStatus(OS.NOT_INTERESTED),
    unsubscribed:       byStatus(OS.UNSUBSCRIBED),
    stopped:            byStatus(OS.STOPPED),
    sentToday:          sentToday,
    dailyCapRemaining:  Math.max(0, DAILY_SEND_CAP - sentToday),
    dailyCap:           DAILY_SEND_CAP,
    replyRatePct:       replyRate,
    needsHumanAction:   all.filter(r => String(r.needsHumanAction) === 'true').length,
    positiveReplies:    all.filter(r => ['POSITIVE', 'QUALIFIED'].includes(r.replyStatus)).length,
  };
}

function getOutreachLog(params, auth) {
  requireRole(auth, 'OpsManager');
  const rows = getTableRows(OUTREACH_LOG);
  return { ok: true, log: rows.slice(-200).reverse() };
}

function getOutreachTemplates(params, auth) {
  requireRole(auth, 'OpsManager');
  return {
    ok: true,
    templates: Object.entries(OUTREACH_TEMPLATES).map(([key, t]) => ({
      key,
      label:   t.label,
      subject: t.subject,
      body:    t.body,
    }))
  };
}

// GET outreach.autorun-status — autopilot status for the dashboard
function getAutorunStatus(params, auth) {
  requireRole(auth, 'OpsManager');
  const today    = new Date().toISOString().split('T')[0];
  const sentToday = _getSentTodayCount();
  return {
    ok:              true,
    sentToday:       sentToday,
    dailyCap:        DAILY_SEND_CAP,
    capRemaining:    Math.max(0, DAILY_SEND_CAP - sentToday),
    capDate:         today,
    batchSize:       AUTO_BATCH_SIZE,
  };
}

// POST outreach.status — manual status override from frontend
function updateOutreachStatus(body, auth) {
  requireRole(auth, 'OpsManager');
  if (!body.leadId || !body.status) return { error: 'leadId and status required' };
  if (!Object.values(OS).includes(body.status)) return { error: 'Invalid status: ' + body.status };
  updateRow('Leads', body.leadId, { outreachStatus: body.status });
  invalidateCache('Leads');
  return { ok: true };
}

// POST outreach.send — manual send from frontend (for overrides)
function sendOutreachEmail(body, auth) {
  requireRole(auth, 'OpsManager');
  if (!body.leadId) return { error: 'leadId required' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch(e) {
    return { error: 'Send in progress — please try again' };
  }

  try {
    const lead = getTableRows('Leads').find(r => r.id === body.leadId);
    if (!lead) return { error: 'Lead not found' };
    if (lead.outreachStatus === OS.UNSUBSCRIBED) return { error: 'Lead has unsubscribed' };

    const phase = body.phase || 'initial';
    const { subject, textBody, htmlBody } = _buildEmail(lead, phase);

    GmailApp.sendEmail(lead.email, subject, textBody, {
      name:     'Mike Kato — AskMiro',
      replyTo:  'info@askmiro.com',
      bcc:      'info@askmiro.com',
      htmlBody: htmlBody,
      headers:  _unsubHeaders(),
    });

    Utilities.sleep(1200);
    const sentThread = _findSentThread(lead.email, subject);
    const threadId   = sentThread ? sentThread.getId() : (lead.threadId || '');
    const msgId      = sentThread
      ? sentThread.getMessages()[sentThread.getMessages().length - 1].getId()
      : '';

    const now    = new Date().toISOString();
    const nextFU = _addDays(now, FOLLOW_UP_DAYS[0]);

    updateRow('Leads', lead.id, {
      status:          'Contacted',
      outreachStatus:  OS.CONTACTED,
      lastContactedAt: now,
      nextFollowUpAt:  nextFU,
      threadId:        threadId || lead.threadId || '',
      gmailMessageId:  msgId,
    });

    _incrementSentToday();
    _appendLog(lead, phase, subject, now, lead.followUpCount || '0', threadId, msgId);
    invalidateCache('Leads');

    return { ok: true, sentTo: lead.email, threadId, nextFollowUp: nextFU };

  } finally {
    lock.releaseLock();
  }
}


// ══════════════════════════════════════════════════════════════
// PART 7 — SHARED HELPERS
// ══════════════════════════════════════════════════════════════

function _safeLeadFields(r) {
  return {
    id:               r.id,
    companyName:      r.companyName,
    contactName:      r.contactName,
    email:            r.email,
    phone:            r.phone,
    serviceType:      r.serviceType,
    segment:          r.segment,
    leadScore:        r.leadScore,
    outreachStatus:   r.outreachStatus,
    outreachTemplate: r.outreachTemplate,
    followUpCount:    r.followUpCount,
    lastContactedAt:  r.lastContactedAt,
    nextFollowUpAt:   r.nextFollowUpAt,
    replyStatus:      r.replyStatus,
    replySummary:     r.replySummary,
    sourceLeadId:     r.sourceLeadId,
    pythonLeadId:     r.pythonLeadId,
    handoffAt:        r.handoffAt,
    needsHumanAction: r.needsHumanAction,
    humanActionReason:r.humanActionReason,
    replyNextAction:  r.replyNextAction,
    createdAt:        r.createdAt,
  };
}

function _merge(str, lead) {
  return (str || '')
    .replace(/\{\{companyName\}\}/g,  lead.companyName  || 'your company')
    .replace(/\{\{contactName\}\}/g,  lead.contactName  || 'there')
    .replace(/\{\{serviceType\}\}/g,  lead.serviceType  || 'cleaning')
    .replace(/\{\{email\}\}/g,        lead.email        || '');
}

function _buildHtml(text) {
  const paras = (text || '').split('\n\n').map(p =>
    '<p style="margin:0 0 16px;line-height:1.75">' +
    (p || '').trim().replace(/\n/g, '<br>') + '</p>'
  ).join('');
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1F2937;font-size:15px;max-width:560px;margin:0 auto;padding:28px 20px">
${paras}
<hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0">
<p style="font-size:11px;color:#9CA3AF;margin:0;line-height:1.6">
  You received this email because your business was identified as potentially needing professional cleaning services in London.<br>
  To stop receiving messages, reply with <em>unsubscribe</em> or email
  <a href="mailto:info@askmiro.com" style="color:#9CA3AF">info@askmiro.com</a>.
</p>
</body></html>`;
}

function _unsubHeaders() {
  return {
    'List-Unsubscribe':      '<mailto:info@askmiro.com?subject=Unsubscribe>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

function _findSentThread(toEmail, subject) {
  try {
    const q = 'in:sent to:' + toEmail + ' subject:"' + subject.substring(0, 40).replace(/"/g, '') + '"';
    const threads = GmailApp.search(q, 0, 1);
    return threads.length ? threads[0] : null;
  } catch(e) { return null; }
}

function _addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function _inferSegment(serviceType) {
  const s = (serviceType || '').toLowerCase();
  if (s.includes('office') || s.includes('cowork'))                      return 'Office';
  if (s.includes('health') || s.includes('medical') || s.includes('care')) return 'Healthcare';
  if (s.includes('school') || s.includes('education') || s.includes('college')) return 'School';
  if (s.includes('gym')    || s.includes('leisure') || s.includes('fitness'))   return 'Gym';
  if (s.includes('warehouse') || s.includes('industrial'))               return 'Industrial';
  if (s.includes('residential') || s.includes('airbnb') || s.includes('tenancy')) return 'Residential';
  return 'Office';
}

function _appendLog(lead, phase, subject, sentAt, followUpN, threadId, msgId) {
  try {
    appendRow(OUTREACH_LOG, {
      logId:          genId('OL'),
      leadId:         lead.id,
      companyName:    lead.companyName,
      contactName:    lead.contactName,
      email:          lead.email,
      templateUsed:   phase,
      subject:        subject,
      sentAt:         sentAt,
      followUpN:      String(followUpN),
      threadId:       threadId || '',
      gmailMessageId: msgId || '',
      status:         phase,
      replyStatus:    '',
      replySummary:   '',
      replyAt:        '',
      autoSent:       'true',
    });
  } catch(e) {
    Logger.log('_appendLog error: ' + e.message);
  }
}

function _updateLogReply(leadId, cls, ts) {
  try {
    const tab  = getTab(OUTREACH_LOG);
    const data = tab.getDataRange().getValues();
    const hdrs = data[0].map(h => String(h).trim());
    const replyStatusCol  = hdrs.indexOf('replyStatus');
    const replySummaryCol = hdrs.indexOf('replySummary');
    const replyAtCol      = hdrs.indexOf('replyAt');
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1]) === String(leadId)) {
        if (replyStatusCol  >= 0) tab.getRange(i+1, replyStatusCol +1).setValue(cls.intent);
        if (replySummaryCol >= 0) tab.getRange(i+1, replySummaryCol+1).setValue(cls.summary);
        if (replyAtCol      >= 0) tab.getRange(i+1, replyAtCol     +1).setValue(ts);
        return;
      }
    }
  } catch(e) { Logger.log('_updateLogReply error: ' + e.message); }
}


// ══════════════════════════════════════════════════════════════
// SETUP HELPERS — run once from GAS editor after deploying
// ══════════════════════════════════════════════════════════════

// Run once: adds all new automation columns to Leads sheet
function setupOutreachColumns() {
  const tab     = getTab('Leads');
  const headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0].map(h => String(h).trim());

  const newCols = [
    // v1 columns
    'leadDirection', 'sourceLeadId', 'leadScore',
    'outreachStatus', 'outreachTemplate', 'followUpCount',
    'lastContactedAt', 'nextFollowUpAt',
    'replyStatus', 'replySummary',
    'threadId', 'gmailMessageId',
    // v2 automation columns
    'outreachEmailBody', 'followUpEmailBody',
    'pythonLeadId', 'handoffAt',
    'needsHumanAction', 'humanActionReason', 'replyNextAction',
  ];

  let added = 0;
  newCols.forEach(col => {
    if (!headers.includes(col)) {
      const idx = tab.getLastColumn() + 1;
      tab.getRange(1, idx).setValue(col);
      tab.getRange(1, idx).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
      added++;
    }
  });

  invalidateCache('Leads');
  return 'setupOutreachColumns: ' + added + ' columns added.';
}

// Run once: creates the Outreach_Log sheet
function setupOutreachLogSheet() {
  const ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  const exist = ss.getSheetByName(OUTREACH_LOG);
  if (exist) return 'Outreach_Log already exists — skipped.';

  const sheet   = ss.insertSheet(OUTREACH_LOG);
  const headers = [
    'logId', 'leadId', 'companyName', 'contactName', 'email',
    'templateUsed', 'subject', 'sentAt', 'followUpN',
    'threadId', 'gmailMessageId', 'status', 'autoSent',
    'replyStatus', 'replySummary', 'replyAt',
  ];
  sheet.appendRow(headers);
  const hdr = sheet.getRange(1, 1, 1, headers.length);
  hdr.setBackground('#0F172A').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setFrozenRows(1);
  return 'Outreach_Log created with ' + headers.length + ' columns.';
}

// Run once: installs all GAS time triggers for automation
function setupOutreachTriggers() {
  const fns = ['autoSendOutreach', 'scanOutreachReplies'];
  ScriptApp.getProjectTriggers()
    .filter(t => fns.includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));

  // autoSendOutreach every 4 hours
  ScriptApp.newTrigger('autoSendOutreach').timeBased().everyHours(4).create();
  // Reply scan every 2 hours
  ScriptApp.newTrigger('scanOutreachReplies').timeBased().everyHours(2).create();

  return 'Triggers installed: autoSendOutreach (every 4h) + scanOutreachReplies (every 2h)';
}

// Migrate existing 'queued' status records to new READY_FOR_OUTREACH
function migrateOutreachStatuses() {
  const tab     = getTab('Leads');
  const data    = tab.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const statusCol = headers.indexOf('outreachStatus');
  if (statusCol < 0) return 'outreachStatus column not found';

  let migrated = 0;
  const oldToNew = {
    'queued':        OS.READY_FOR_OUTREACH,
    'follow_up_due': OS.FOLLOW_UP_1,
    'sent':          OS.CONTACTED,
    'exhausted':     OS.FINAL_FOLLOW_UP,
    'replied':       OS.REPLIED,
    'opted_out':     OS.UNSUBSCRIBED,
    'converted':     OS.QUALIFIED,
  };

  for (let i = 1; i < data.length; i++) {
    const old = String(data[i][statusCol] || '').trim();
    if (oldToNew[old]) {
      tab.getRange(i + 1, statusCol + 1).setValue(oldToNew[old]);
      migrated++;
    }
  }

  invalidateCache('Leads');
  return 'migrateOutreachStatuses: ' + migrated + ' rows updated.';
}

// Store Anthropic API key in Script Properties (not in source)
function setupAnthropicKey(apiKey) {
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', apiKey);
  return 'ANTHROPIC_API_KEY saved to Script Properties.';
}
