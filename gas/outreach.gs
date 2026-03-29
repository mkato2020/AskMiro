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
  // Priority = 40% lead score + 35% sector reply rate + 25% template freshness
  const _perfSnapshot = _getPerfData();
  const readyQueue = allLeads
    .filter(r => r.outreachStatus === OS.READY_FOR_OUTREACH)
    .map(r => ({ lead: r, weight: _calcPriorityWeight(r, _perfSnapshot) }))
    .sort((a, b) => b.weight - a.weight)
    .map(x => x.lead)
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


// ── CLEAN PYTHON-GENERATED EMAIL BODY ────────────────────────
// Strips artefacts that Python cold_email injects into the raw text:
//   1. "SUBJECT: ..." header line — extracted separately as subject
//   2. Plain-text signature block ("Best regards, / AskMiro..." etc.)
//   3. Generic "Hi," → personalised "Hi [name],"
// Returns { cleanedBody, extractedSubject }
function _cleanBody(rawText, lead) {
  var text = (rawText || '').trim();

  // 1. Extract & strip leading SUBJECT line
  var extractedSubject = '';
  var subjMatch = text.match(/^SUBJECT:\s*(.+?)(?:\r?\n)/i);
  if (subjMatch) {
    extractedSubject = subjMatch[1].trim();
    // Remove the SUBJECT line + any blank lines immediately after it
    text = text.replace(/^SUBJECT:[^\r\n]*[\r\n]+/i, '').replace(/^[\r\n]+/, '');
  }

  // 2. Strip plain-text signature block from the bottom
  //    Catches: "Best regards,", "Kind regards,", "Best,", "Regards,"
  //    followed by name / company / phone / website lines
  text = text.replace(
    /\n{1,3}(Best regards?|Kind regards?|Regards|Best)[,\s][\s\S]*$/i,
    ''
  ).trim();

  // 3. Personalise greeting — "Hi," → "Hi [First Name],"
  var firstName = ((lead.contactName || lead.businessName || '').split(/[\s,]/)[0] || '').trim();
  if (firstName) {
    // Replace "Hi," or "Hi ," at start of a line
    text = text.replace(/^(Hi)[,\s]*$/im, '$1 ' + firstName + ',');
  }

  return { cleanedBody: text, extractedSubject: extractedSubject };
}


// ── BUILD EMAIL (AI body first, template fallback) ─────────────
function _buildEmail(lead, phase) {
  let textBody;
  let subject;
  let templateKey;

  if (phase === 'initial') {
    // Use Python's pre-generated AI body if available (zero extra cost)
    const raw       = (lead.outreachEmailBody || '').trim();
    templateKey     = lead.outreachTemplate || (
      (lead.segment || '').toLowerCase() === 'residential'
        ? 'intro_residential'
        : 'intro_commercial'
    );
    const tmpl      = OUTREACH_TEMPLATES[templateKey] || OUTREACH_TEMPLATES.intro_commercial;
    subject         = _merge(tmpl.subject, lead);

    if (raw) {
      const cleaned     = _cleanBody(raw, lead);
      textBody          = cleaned.cleanedBody;
      // Prefer subject extracted from Python body over template subject
      if (cleaned.extractedSubject) subject = cleaned.extractedSubject;
    } else {
      textBody = _merge(tmpl.body, lead);
    }

  } else if (phase === 'final') {
    templateKey = 'final_follow_up';
    const tmpl  = OUTREACH_TEMPLATES.final_follow_up;
    subject     = _merge(tmpl.subject, lead);
    textBody    = _merge(tmpl.body, lead);

  } else {
    // follow-up: use Python's follow_up body if available
    const raw   = (lead.followUpEmailBody || '').trim();
    const n     = Number(lead.followUpCount || 0);
    templateKey = n === 0 ? 'follow_up_1' : 'follow_up_2';
    const tmpl  = OUTREACH_TEMPLATES[templateKey];
    subject     = _merge(tmpl.subject, lead);

    if (raw) {
      const cleaned = _cleanBody(raw, lead);
      textBody      = cleaned.cleanedBody;
      if (cleaned.extractedSubject) subject = cleaned.extractedSubject;
    } else {
      textBody = _merge(tmpl.body, lead);
    }
  }

  const labelMap = { initial: 'Introduction', followup: 'Follow-up', final: 'Final Note' };
  const htmlBody = _buildHtml(textBody, labelMap[phase] || 'Outreach');
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

      // Track all replies for reply-rate stats
      _trackPerformance('replied',
        lead.outreachTemplate || 'intro_commercial',
        lead.segment || _inferSegment(lead.serviceType || ''));

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
          // Track performance + notify Mike
          _onPositiveReply(Object.assign({}, lead, { replySummary: cls.summary }));
          _onQualified(lead.outreachTemplate || 'intro_commercial',
                       lead.segment || _inferSegment(lead.serviceType || ''));
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
    let { subject, textBody, htmlBody } = _buildEmail(lead, phase);

    // Apply user edits from the Send Modal (subjectOverride / bodyOverride)
    if (body.subjectOverride && body.subjectOverride.trim()) {
      subject = body.subjectOverride.trim();
    }
    if (body.bodyOverride && body.bodyOverride.trim()) {
      textBody = body.bodyOverride.trim();
      // Re-wrap edited body in branded HTML template
      const labelMap = { initial: 'Introduction', followup: 'Follow-up', final: 'Final Note' };
      htmlBody = _buildHtml(textBody, labelMap[phase] || 'Outreach');
    }

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

// ── BRANDED HTML EMAIL — mirrors email.js Tesla × Fluent design ──────────────
var _T = {
  navy:       '#0A1628',
  charcoal:   '#111827',
  body:       '#1F2937',
  slate:      '#4B5563',
  border:     '#E5E7EB',
  offWhite:   '#F9FAFB',
  teal:       '#0D9488',
  tealDark:   '#0F766E',
  tealMid:    '#14B8A6',
  tealLight:  '#CCFBF1',
  tealGhost:  '#F0FDFA',
};
var _FONT    = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
var _LOGO    = '<img src="https://www.askmiro.com/favicon-32x32.png" width="40" height="40" alt="AskMiro" style="display:block;border:0;border-radius:8px" border="0">';
var _LOGO_SM = '<img src="https://www.askmiro.com/favicon-32x32.png" width="30" height="30" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0">';

function _buildHtml(text, label) {
  label = label || 'Outreach';

  // Plain text → HTML paragraphs
  var paras = (text || '').split('\n\n').map(function(p) {
    return '<p style="margin:0 0 18px;font-family:' + _FONT + ';font-size:15px;color:' + _T.body + ';line-height:1.8">'
      + (p || '').trim().replace(/\n/g, '<br>')
      + '</p>';
  }).join('');

  // Branded signature — matches email.js _sig()
  var sig = '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:40px">'
    + '<tr><td style="padding-top:28px;border-top:1px solid ' + _T.border + '">'
    + '<table cellpadding="0" cellspacing="0" width="100%"><tr>'
    + '<td style="vertical-align:middle;padding-right:14px;width:34px">' + _LOGO_SM + '</td>'
    + '<td style="vertical-align:middle">'
    + '<div style="font-family:' + _FONT + ';font-size:15px;font-weight:700;color:' + _T.charcoal + ';line-height:1.2">Mike Kato</div>'
    + '<div style="font-family:' + _FONT + ';font-size:12px;color:' + _T.teal + ';font-weight:600;margin-top:2px">Co-founder — AskMiro Cleaning Services</div>'
    + '</td></tr></table>'
    + '<table cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>'
    + '<td style="padding-right:22px"><a href="tel:02080730621" style="font-family:' + _FONT + ';font-size:12px;color:' + _T.slate + ';text-decoration:none"><span style="color:' + _T.teal + ';margin-right:4px">&#9742;</span>020 8073 0621</a></td>'
    + '<td style="padding-right:22px"><a href="mailto:info@askmiro.com" style="font-family:' + _FONT + ';font-size:12px;color:' + _T.slate + ';text-decoration:none"><span style="color:' + _T.teal + ';margin-right:4px">&#9993;</span>info@askmiro.com</a></td>'
    + '<td><a href="https://www.askmiro.com" style="font-family:' + _FONT + ';font-size:12px;color:' + _T.teal + ';font-weight:600;text-decoration:none">www.askmiro.com</a></td>'
    + '</tr></table>'
    + '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px"><tr>'
    + '<td style="padding:10px 16px;background:' + _T.tealGhost + ';border:1px solid ' + _T.tealLight + ';border-radius:8px">'
    + '<table cellpadding="0" cellspacing="0"><tr>'
    + '<td style="padding-right:18px;font-family:' + _FONT + ';font-size:11px;color:' + _T.teal + ';font-weight:600">&#10003; Fully Insured</td>'
    + '<td style="padding-right:18px;font-family:' + _FONT + ';font-size:11px;color:' + _T.teal + ';font-weight:600">&#10003; COSHH Compliant</td>'
    + '<td style="padding-right:18px;font-family:' + _FONT + ';font-size:11px;color:' + _T.teal + ';font-weight:600">&#10003; ISO Standards</td>'
    + '<td style="font-family:' + _FONT + ';font-size:11px;color:' + _T.teal + ';font-weight:600">&#10003; London &amp; UK</td>'
    + '</tr></table></td></tr></table>'
    + '</td></tr></table>';

  // Full email shell — matches email.js _wrap()
  return '<!DOCTYPE html>\n'
    + '<html lang="en"><head>\n'
    + '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">\n'
    + '<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no">\n'
    + '<title>AskMiro Cleaning Services</title>\n'
    + '<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->\n'
    + '</head>\n'
    + '<body style="margin:0;padding:0;background:#F1F5F9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">\n'
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center">\n'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">\n'

    // Teal accent bar
    + '<tr><td style="height:4px;background:linear-gradient(90deg,' + _T.teal + ',' + _T.tealMid + ');border-radius:12px 12px 0 0;font-size:4px;line-height:4px">&nbsp;</td></tr>\n'

    // Navy header with logo
    + '<tr><td style="background:' + _T.navy + ';padding:26px 36px">\n'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>\n'
    + '<td style="vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr>\n'
    + '<td style="padding-right:14px;vertical-align:middle">' + _LOGO + '</td>\n'
    + '<td style="vertical-align:middle">\n'
    + '<div style="font-family:' + _FONT + ';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">AskMiro</div>\n'
    + '<div style="font-family:' + _FONT + ';font-size:10px;color:rgba(255,255,255,0.38);letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Professional Cleaning Across London</div>\n'
    + '</td></tr></table></td>\n'
    + '<td align="right" style="vertical-align:middle">\n'
    + '<div style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.11);border-radius:20px;padding:6px 16px">\n'
    + '<span style="font-family:' + _FONT + ';font-size:11px;font-weight:600;color:rgba(255,255,255,0.55);letter-spacing:0.6px">' + label + '</span>\n'
    + '</div></td></tr></table></td></tr>\n'

    // White body
    + '<tr><td style="background:#FFFFFF;padding:44px 40px 36px;border-left:1px solid ' + _T.border + ';border-right:1px solid ' + _T.border + '">\n'
    + paras + '\n'
    + sig + '\n'
    + '</td></tr>\n'

    // Dark footer
    + '<tr><td style="background:' + _T.charcoal + ';border-radius:0 0 12px 12px;padding:22px 36px">\n'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>\n'
    + '<td><div style="font-family:' + _FONT + ';font-size:13px;font-weight:700;color:rgba(255,255,255,0.75)">AskMiro Cleaning Services</div>\n'
    + '<div style="font-family:' + _FONT + ';font-size:11px;color:rgba(255,255,255,0.28);margin-top:3px">A trading name of Miro Partners Ltd &nbsp;&bull;&nbsp; London &amp; UK</div></td>\n'
    + '<td align="right" style="vertical-align:top"><a href="https://www.askmiro.com" style="font-family:' + _FONT + ';font-size:12px;color:' + _T.tealMid + ';text-decoration:none;font-weight:700">www.askmiro.com</a></td>\n'
    + '</tr><tr><td colspan="2" style="padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)">\n'
    + '<table cellpadding="0" cellspacing="0"><tr>\n'
    + '<td style="padding-right:18px;font-family:' + _FONT + ';font-size:11px;color:rgba(255,255,255,0.28)">&#10003; Fully Insured</td>\n'
    + '<td style="padding-right:18px;font-family:' + _FONT + ';font-size:11px;color:rgba(255,255,255,0.28)">&#10003; COSHH Compliant</td>\n'
    + '<td style="font-family:' + _FONT + ';font-size:11px;color:rgba(255,255,255,0.28)">&#10003; Residential &amp; Commercial</td>\n'
    + '</tr></table>\n'
    + '<p style="font-family:' + _FONT + ';font-size:10px;color:rgba(255,255,255,0.18);margin:14px 0 0;line-height:1.7">\n'
    + 'Sent by Mike Kato on behalf of AskMiro Cleaning Services. Reply to: info@askmiro.com.<br>\n'
    + 'We will never share your details with third parties.\n'
    + '&nbsp;&nbsp;<a href="mailto:info@askmiro.com?subject=Unsubscribe" style="color:rgba(255,255,255,0.28);text-decoration:underline">Unsubscribe</a>\n'
    + '</p></td></tr></table></td></tr>\n'

    + '</table></td></tr></table>\n'
    + '</body></html>';
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
    // Track send performance
    _trackSend(lead ? (lead.outreachTemplate || 'intro_commercial') : 'intro_commercial',
               lead ? (lead.segment || _inferSegment(lead.serviceType || '')) : 'unknown');
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
// CONVERSION ENGINE — PARTS 1-6
// Upgrades outreach from "sends emails" to "generates qualified
// conversations". All additive — existing logic untouched.
// ══════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────
// PART 1 — EMAIL QUALITY INTELLIGENCE
// Scores subject + body and predicts reply likelihood.
// Called from GAS route AND replicated client-side (JS) for
// instant feedback in the Send Modal (no extra API call).
// ─────────────────────────────────────────────────────────────

function scoreEmail(params, auth) {
  try {
    const subject = String(params.subject || '');
    const body    = String(params.body    || '');
    const company = String(params.company || '');
    const service = String(params.service || '');
    const score   = Number(params.leadScore) || 50;
    return _scoreEmail(subject, body, company, service, score);
  } catch(e) {
    return { error: e.message };
  }
}

function _scoreEmail(subject, body, company, service, leadScore) {
  const subj = (subject || '').trim();
  const txt  = (body    || '').trim();
  const comp = (company || '').trim().toLowerCase();
  const svc  = (service || '').trim().toLowerCase();

  // ── Subject Score (1-10) ────────────────────────────────
  let ss = 5;
  const subjWords = subj.split(/\s+/).filter(Boolean).length;
  if (subjWords >= 5 && subjWords <= 12) ss += 1;
  else if (subjWords < 3 || subjWords > 16) ss -= 1;
  if (comp && subj.toLowerCase().includes(comp.split(' ')[0].toLowerCase())) ss += 2;
  else if (comp) ss -= 0.5;  // not personalised
  if (svc && subj.toLowerCase().includes(svc.split(' ')[0].toLowerCase())) ss += 0.5;
  if (/free|guarantee|urgent|act now|limited time/i.test(subj)) ss -= 2;  // spam triggers
  if (/[A-Z]{4,}/.test(subj)) ss -= 1;   // SHOUTING
  if (/\d/.test(subj)) ss += 0.5;         // specific number e.g. "24-hour"
  if (/\?$/.test(subj.trim())) ss += 0.5; // question format
  if (subj.length > 80) ss -= 1;          // too long for preview
  const subjectScore = Math.min(10, Math.max(1, Math.round(ss)));

  // ── Body Score (1-10) ───────────────────────────────────
  let bs = 5;
  const bodyWords = txt.split(/\s+/).filter(Boolean).length;
  if (bodyWords >= 80 && bodyWords <= 200) bs += 1.5;
  else if (bodyWords < 40) bs -= 1.5;
  else if (bodyWords > 280) bs -= 1;
  if (comp && txt.toLowerCase().includes(comp.split(' ')[0].toLowerCase())) bs += 2;
  if (svc && txt.toLowerCase().includes(svc.split(' ')[0].toLowerCase())) bs += 0.5;
  // personalised greeting
  if (/^hi\s+[A-Z]/m.test(txt) || /^dear\s+[A-Z]/m.test(txt)) bs += 1;
  // clear CTA
  if (/\?/.test(txt.slice(-300))) bs += 1;
  // paragraph structure
  const paraCount = txt.split(/\n\n/).filter(Boolean).length;
  if (paraCount >= 2 && paraCount <= 4) bs += 0.5;
  // trust signals
  if (/insur|dbs|coshh|iso|compli/i.test(txt)) bs += 0.5;
  // spam words
  if (/click here|buy now|subscribe|free trial/i.test(txt)) bs -= 2;
  const bodyScore = Math.min(10, Math.max(1, Math.round(bs)));

  // ── Predicted Reply Likelihood ──────────────────────────
  // UK B2B cold email baseline ~8-12%, well-targeted ~15-25%
  const leadBoost    = (leadScore  / 100) * 15;  // up to +15%
  const subjBoost    = (subjectScore / 10) * 8;  // up to +8%
  const bodyBoost    = (bodyScore   / 10) * 9;   // up to +9%
  const rawLikelihood = 8 + leadBoost + subjBoost + bodyBoost;
  const replyLikelihood = Math.min(48, Math.round(rawLikelihood));

  // ── Actionable Tips ────────────────────────────────────
  const tips = [];
  if (!comp || !subj.toLowerCase().includes(comp.split(' ')[0].toLowerCase()))
    tips.push({ type: 'subject', msg: 'Add company name to subject for +2 personalisation boost' });
  if (subjWords < 5)
    tips.push({ type: 'subject', msg: 'Subject too short — aim for 6-10 words' });
  if (subjWords > 13)
    tips.push({ type: 'subject', msg: 'Subject too long — cut to under 12 words' });
  if (bodyWords > 220)
    tips.push({ type: 'body', msg: 'Body is too long — shorter emails get 30% more replies' });
  if (bodyWords < 50)
    tips.push({ type: 'body', msg: 'Body too brief — add one value prop paragraph' });
  if (!/\?/.test(txt.slice(-300)))
    tips.push({ type: 'body', msg: 'End with a clear question to drive a response' });
  if (!(/^hi\s+[A-Z]/im.test(txt)))
    tips.push({ type: 'body', msg: 'Personalise greeting — "Hi [Name]," outperforms "Hi,"' });

  return { subjectScore, bodyScore, replyLikelihood, tips };
}


// ─────────────────────────────────────────────────────────────
// PART 2 — SEQUENCE VISIBILITY
// Returns the full 3-touch sequence for a lead, with timing
// and editable windows. Synthesised from live lead data.
// ─────────────────────────────────────────────────────────────

function getSequenceForLead(params, auth) {
  try {
    const leadId = params.id || params.leadId;
    if (!leadId) return { error: 'leadId required' };

    const leads = getTableRows('Leads');
    const lead  = leads.find(r => r.id === leadId);
    if (!lead) return { error: 'Lead not found' };

    const sentAt     = lead.lastContactedAt || lead.handoffAt || null;
    const followUpN  = Number(lead.followUpCount || 0);
    const status     = lead.outreachStatus || OS.READY_FOR_OUTREACH;
    const nextFU     = lead.nextFollowUpAt || null;

    // Build 3-step sequence timeline
    const steps = [
      {
        step:        1,
        phase:       'initial',
        label:       'Email 1 — Introduction',
        status:      sentAt ? 'sent' : (status === OS.READY_FOR_OUTREACH ? 'pending' : 'pending'),
        sentAt:      sentAt || null,
        scheduledAt: null,
        delayDays:   0,
        subject:     lead.outreachEmailBody
          ? _extractSubjectFromBody(lead.outreachEmailBody)
          : null,
        bodyPreview: lead.outreachEmailBody
          ? _cleanBody(lead.outreachEmailBody, lead).cleanedBody.substring(0, 200)
          : null,
      },
      {
        step:        2,
        phase:       'followup1',
        label:       'Follow-up 1',
        status:      followUpN >= 1 ? 'sent'
                   : (status === OS.CONTACTED || status === OS.FOLLOW_UP_1) ? 'scheduled' : 'pending',
        sentAt:      followUpN >= 1 ? nextFU : null,
        scheduledAt: status === OS.CONTACTED ? nextFU : null,
        delayDays:   FOLLOW_UP_DAYS[0],
        subject:     null,
        bodyPreview: lead.followUpEmailBody
          ? _cleanBody(lead.followUpEmailBody, lead).cleanedBody.substring(0, 200)
          : null,
      },
      {
        step:        3,
        phase:       'followup2',
        label:       'Follow-up 2',
        status:      followUpN >= 2 ? 'sent'
                   : status === OS.FOLLOW_UP_1 ? 'scheduled' : 'pending',
        sentAt:      followUpN >= 2 ? null : null,
        scheduledAt: status === OS.FOLLOW_UP_1 ? nextFU : null,
        delayDays:   FOLLOW_UP_DAYS[1],
        subject:     null,
        bodyPreview: null,
      },
      {
        step:        4,
        phase:       'final',
        label:       'Final Follow-up',
        status:      status === OS.FINAL_FOLLOW_UP ? 'sent'
                   : status === OS.FOLLOW_UP_2 ? 'scheduled' : 'pending',
        sentAt:      null,
        scheduledAt: status === OS.FOLLOW_UP_2 ? nextFU : null,
        delayDays:   FOLLOW_UP_DAYS[2],
        subject:     null,
        bodyPreview: null,
      },
    ];

    return {
      leadId:      leadId,
      companyName: lead.companyName,
      email:       lead.email,
      status:      status,
      sequence:    steps,
      timings:     FOLLOW_UP_DAYS,  // [3, 7, 14] — editable
    };
  } catch(e) {
    Logger.log('getSequenceForLead error: ' + e.message);
    return { error: e.message };
  }
}

function _extractSubjectFromBody(raw) {
  const m = (raw || '').match(/^SUBJECT:\s*(.+?)(?:\r?\n)/i);
  return m ? m[1].trim() : null;
}

function updateLeadSequence(body, auth) {
  try {
    const leadId    = body.leadId;
    const timings   = body.timings;  // [days1, days2, days3]
    const newSubject = body.subject || null;
    if (!leadId) return { error: 'leadId required' };

    const updates = {};

    // Re-schedule nextFollowUpAt if timing changed
    if (Array.isArray(timings) && timings.length >= 1) {
      const lead   = (getTableRows('Leads') || []).find(r => r.id === leadId);
      if (lead && lead.lastContactedAt) {
        const fuN = Number(lead.followUpCount || 0);
        const delay = timings[fuN] || timings[0];
        updates.nextFollowUpAt = _addDays(lead.lastContactedAt, delay);
      }
    }

    // Update email body subject if provided
    if (newSubject && body.phase === 'initial') {
      const lead   = (getTableRows('Leads') || []).find(r => r.id === leadId);
      const rawBody = (lead || {}).outreachEmailBody || '';
      const cleaned = rawBody.replace(/^SUBJECT:[^\r\n]*[\r\n]+/i, '').replace(/^[\r\n]+/, '');
      updates.outreachEmailBody = 'SUBJECT: ' + newSubject + '\n\n' + cleaned;
    }

    if (Object.keys(updates).length) {
      updateRow('Leads', leadId, updates);
      invalidateCache('Leads');
    }

    return { ok: true, leadId, updated: Object.keys(updates) };
  } catch(e) {
    return { error: e.message };
  }
}


// ─────────────────────────────────────────────────────────────
// PART 4 — PRIORITISATION ENGINE
// Performance-weighted send order: lead score × sector reply
// rate × template effectiveness. Called by _runAutoSend().
// ─────────────────────────────────────────────────────────────

function _getPerfData() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('outreach_perf_v1');
    return raw ? JSON.parse(raw) : { templates: {}, sectors: {}, total: { sent: 0, replied: 0, qualified: 0 } };
  } catch(e) { return { templates: {}, sectors: {}, total: { sent: 0, replied: 0, qualified: 0 } }; }
}

function _savePerfData(data) {
  try {
    data.updatedAt = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('outreach_perf_v1', JSON.stringify(data));
  } catch(e) { Logger.log('_savePerfData error: ' + e.message); }
}

function _trackPerformance(event, templateKey, sector) {
  try {
    const data = _getPerfData();
    const k    = templateKey || 'unknown';
    const s    = sector      || 'unknown';

    if (!data.templates[k]) data.templates[k] = { sent: 0, replied: 0, qualified: 0 };
    if (!data.sectors[s])   data.sectors[s]   = { sent: 0, replied: 0 };

    if (event === 'sent') {
      data.templates[k].sent++;
      data.sectors[s].sent++;
      data.total.sent = (data.total.sent || 0) + 1;
    } else if (event === 'replied') {
      data.templates[k].replied++;
      data.sectors[s].replied++;
      data.total.replied = (data.total.replied || 0) + 1;
    } else if (event === 'qualified') {
      data.templates[k].qualified = (data.templates[k].qualified || 0) + 1;
      data.total.qualified = (data.total.qualified || 0) + 1;
    }

    _savePerfData(data);
  } catch(e) { Logger.log('_trackPerformance error: ' + e.message); }
}

function _calcPriorityWeight(lead, perfData) {
  // Weight = 40% lead score + 35% sector reply rate + 25% template freshness
  const perfD = perfData || _getPerfData();

  const leadScoreNorm = Math.min(100, Number(lead.leadScore || 50)) / 100;  // 0-1

  const sector         = lead.segment || _inferSegment(lead.serviceType || '');
  const sectorStats    = (perfD.sectors || {})[sector] || {};
  const sectorSent     = sectorStats.sent    || 0;
  const sectorReplied  = sectorStats.replied || 0;
  const sectorRate     = sectorSent > 5 ? (sectorReplied / sectorSent) : 0.12;  // default 12%

  const tmplKey        = lead.outreachTemplate || 'intro_commercial';
  const tmplStats      = ((perfD.templates || {})[tmplKey]) || {};
  const tmplSent       = tmplStats.sent || 0;
  // Slightly favour less-used templates to diversify (prevents over-sending one template)
  const tmplFreshness  = tmplSent < 10 ? 1.0 : tmplSent < 50 ? 0.9 : 0.75;

  return (leadScoreNorm * 0.40) + (sectorRate * 0.35) + (tmplFreshness * 0.25);
}


// ─────────────────────────────────────────────────────────────
// PART 5 — PERFORMANCE DASHBOARD DATA
// Returns template + sector analytics for the Performance tab.
// ─────────────────────────────────────────────────────────────

function getOutreachPerformance(params, auth) {
  try {
    const data = _getPerfData();

    // Enrich templates
    const templates = Object.entries(data.templates || {}).map(([key, s]) => {
      const replyRate = s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0;
      const convRate  = s.sent > 0 ? Math.round((s.qualified / s.sent) * 100) : 0;
      return { key, sent: s.sent, replied: s.replied, qualified: s.qualified || 0,
               replyRate, convRate };
    }).sort((a, b) => b.replyRate - a.replyRate);

    // Enrich sectors
    const sectors = Object.entries(data.sectors || {}).map(([key, s]) => {
      const replyRate = s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0;
      return { key, sent: s.sent, replied: s.replied, replyRate };
    }).sort((a, b) => b.replyRate - a.replyRate);

    const total = data.total || { sent: 0, replied: 0, qualified: 0 };
    const overallReplyRate = total.sent > 0 ? Math.round((total.replied / total.sent) * 100) : 0;
    const convRate         = total.sent > 0 ? Math.round((total.qualified / total.sent) * 100) : 0;

    return {
      total, overallReplyRate, convRate,
      bestTemplate: templates[0]  || null,
      bestSector:   sectors[0]    || null,
      templates, sectors,
      updatedAt: data.updatedAt || null,
    };
  } catch(e) {
    return { error: e.message };
  }
}


// ─────────────────────────────────────────────────────────────
// PART 6 — OUTREACH AI ASSISTANT
// Suggests better subject lines, rewrites body, recommends
// follow-ups and identifies weak emails. Uses Claude Haiku.
// ─────────────────────────────────────────────────────────────

function outreachAssistant(body, auth) {
  const FALLBACK = { error: 'AI assistant unavailable — check ANTHROPIC_API_KEY in Script Properties' };
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) return FALLBACK;

    const task     = body.task   || 'improve';  // improve | subject | rewrite | followup | analyse
    const subject  = body.subject || '';
    const emailBody= body.body    || '';
    const company  = body.company || '';
    const service  = body.service || '';
    const context  = body.context || '';

    let prompt = '';
    switch (task) {
      case 'subject':
        prompt = `You are an expert B2B email copywriter for AskMiro Cleaning Services (London).
Generate 3 high-converting subject line options for a cold outreach email to:
Company: ${company}
Service requested: ${service || 'commercial cleaning'}

Rules:
- Each subject must be under 60 characters
- At least one must contain the company name
- No spam words, no ALL CAPS, no excessive punctuation
- Tone: professional, warm, direct
- Focus on value not features

Current subject: "${subject}"

Reply with JSON only: {"options": ["subject1", "subject2", "subject3"], "reasoning": "brief why"}`;
        break;

      case 'rewrite':
        prompt = `You are an expert B2B cold email writer for AskMiro Cleaning Services (London).
Rewrite this outreach email to maximise reply rate.

Target: ${company} | Service: ${service || 'commercial cleaning'}
Sender: Mike Kato, Co-founder AskMiro Cleaning Services

Current email:
"""
${emailBody.substring(0, 1500)}
"""

Rewrite rules:
- Keep under 180 words
- Personal greeting with contact name if present
- One short value prop paragraph
- Clear single question CTA at end (not multiple asks)
- No fluff, no corporate speak
- British English

Reply with JSON only: {"subject": "improved subject", "body": "rewritten body text", "changes": ["change1", "change2"]}`;
        break;

      case 'followup':
        prompt = `Write a B2B follow-up email for AskMiro Cleaning Services.
Previous email context: "${context.substring(0, 400)}"
Company: ${company}
This is follow-up #${body.followUpN || 1}.

Rules:
- Under 100 words
- Reference that you emailed before without being pushy
- New angle or value prop — don't repeat the first email
- End with a low-friction question
- British English, professional tone

Reply with JSON only: {"subject": "follow-up subject", "body": "follow-up body text"}`;
        break;

      case 'analyse':
        prompt = `Analyse this cold outreach email for AskMiro Cleaning Services and identify weaknesses.

Company: ${company} | Service: ${service}
Subject: "${subject}"
Body:
"""
${emailBody.substring(0, 1000)}
"""

Identify:
1. Top 3 things that will HURT reply rate
2. Top 3 things to improve IMMEDIATELY
3. Overall score 1-10 and why

Reply with JSON only: {"score": 7, "hurts": ["reason1","reason2","reason3"], "improvements": ["fix1","fix2","fix3"], "summary": "one-sentence verdict"}`;
        break;

      case 'direct':
        prompt = `You are a B2B copywriter. Rewrite this cold email to be sharper and more direct.
Company: ${company} | Service: ${service || 'commercial cleaning'}

Subject: "${subject}"
Body:
"""
${emailBody.substring(0, 1200)}
"""

Rules:
- Cut all filler words and vague claims
- Every sentence must earn its place — no fluff
- Lead with the strongest value statement immediately
- CTA must be a single crisp question
- Under 120 words
- British English

Reply with JSON only: {"subject": "sharper subject", "body": "rewritten body", "why": "one-line reason this version converts better"}`;
        break;

      case 'urgent':
        prompt = `You are a B2B copywriter. Add genuine urgency to this cold outreach email without being pushy or fake.
Company: ${company} | Service: ${service || 'commercial cleaning'}

Subject: "${subject}"
Body:
"""
${emailBody.substring(0, 1200)}
"""

Rules:
- Use a real, believable time hook (e.g. limited slots, seasonal demand, pricing review)
- Do NOT use fake scarcity or countdown language
- Urgency should feel natural, not salesy
- Keep under 160 words
- British English

Reply with JSON only: {"subject": "urgent subject line", "body": "email with urgency added", "why": "what urgency hook was used and why it works"}`;
        break;

      case 'conversational':
        prompt = `You are a B2B copywriter. Rewrite this cold email to sound warmer and more human — like a message from a real person, not a marketing template.
Company: ${company} | Service: ${service || 'commercial cleaning'}

Subject: "${subject}"
Body:
"""
${emailBody.substring(0, 1200)}
"""

Rules:
- Write as Mike Kato speaking directly to a peer
- Short sentences, natural rhythm — how you'd actually talk
- Remove all corporate/formal phrases ("I trust this finds you well", "leverage", "synergy")
- Still professional — just human
- Under 150 words, British English

Reply with JSON only: {"subject": "conversational subject", "body": "warmer email body", "why": "what made it feel more human"}`;
        break;

      case 'boost':
        prompt = `You are an expert cold email optimiser. Rewrite this outreach email to maximise reply rate using every proven technique.
Company: ${company} | Service: ${service || 'commercial cleaning'}
${body.perfContext ? 'Performance context: ' + body.perfContext : ''}

Subject: "${subject}"
Body:
"""
${emailBody.substring(0, 1200)}
"""

Optimisation checklist:
- Subject: personalised, curiosity-driven, under 9 words
- Opening: reference something specific about the company (not generic)
- Value prop: one sharp sentence — what problem we solve, not what we do
- Social proof: one credibility signal (insured, COSHH, etc.)
- CTA: single low-friction question that's easy to reply "yes" or "no" to
- Length: 90–150 words
- British English

Reply with JSON only: {"subject": "optimised subject", "body": "maximised body", "changes": ["change1","change2","change3"], "why": "key conversion improvement"}`;
        break;

      default:  // improve — general suggestions
        prompt = `Review this B2B cold outreach email for AskMiro Cleaning Services (London) and suggest the single most impactful improvement.

Company: ${company}
Subject: "${subject}"
Body excerpt: "${emailBody.substring(0, 600)}"

Reply with JSON only: {"suggestion": "specific improvement text", "why": "brief reason", "improvedSubject": "better subject if relevant", "improvedOpening": "better opening line if relevant"}`;
    }

    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      payload: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
      muteHttpExceptions: true,
    });

    const res = JSON.parse(response.getContentText());
    if (res.error) { Logger.log('AI assist error: ' + res.error.message); return FALLBACK; }

    const raw   = res.content[0].text.trim();
    const jsonM = raw.match(/\{[\s\S]*\}/);
    const result = jsonM ? JSON.parse(jsonM[0]) : { raw };

    return { ok: true, task, result };
  } catch(e) {
    Logger.log('outreachAssistant error: ' + e.message);
    return { error: e.message };
  }
}


// ─────────────────────────────────────────────────────────────
// HOOKS — wire performance tracking into existing functions
// ─────────────────────────────────────────────────────────────

// Called after any email is successfully sent (hooks into _appendLog)
function _trackSend(templateKey, sector) {
  _trackPerformance('sent', templateKey, sector);
}

// Called from scanOutreachReplies when a positive reply is detected
// Also fires a Gmail notification for hot leads
function _onPositiveReply(lead) {
  _trackPerformance('replied',    lead.outreachTemplate || 'intro_commercial',
                                  lead.segment          || _inferSegment(lead.serviceType || ''));

  // Notify Mike via Gmail (subject line alert)
  try {
    GmailApp.sendEmail(
      'info@askmiro.com',
      '🔥 Hot Reply: ' + (lead.companyName || 'Unknown') + ' — AskMiro Outreach',
      lead.companyName + ' (' + lead.email + ') has replied positively to your outreach.\n\n' +
      'Reply summary: ' + (lead.replySummary || 'See Gmail') + '\n\n' +
      'Log in to Ops → Outreach → 🎯 Action to follow up.',
      { name: 'AskMiro Autopilot', noReply: false }
    );
  } catch(e) { Logger.log('Hot reply notify error: ' + e.message); }
}

function _onQualified(templateKey, sector) {
  _trackPerformance('qualified', templateKey, sector);
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
