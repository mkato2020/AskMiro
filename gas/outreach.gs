// ============================================================
// AskMiro Ops — outreach.gs  v1.0
// Lead Intelligence → CRM → Outreach Queue → Follow-ups → Reply Detection
//
// New Leads sheet columns required (run setupOutreachColumns() once):
//   leadDirection, sourceLeadId, leadScore, outreachStatus,
//   outreachTemplate, followUpCount, lastContactedAt,
//   nextFollowUpAt, replyStatus, replySummary, threadId, gmailMessageId
//
// New sheet: Outreach_Log (run setupOutreachLogSheet() once)
// New triggers: run setupOutreachTriggers() once from GAS editor
// ============================================================

const OUTREACH_LOG  = 'Outreach_Log';
const FOLLOW_UP_DAYS = [3, 7, 14];   // days between each follow-up
const MAX_FOLLOW_UPS = 3;

// ── EMAIL TEMPLATES ────────────────────────────────────────────
const OUTREACH_TEMPLATES = {
  intro_commercial: {
    label:   'Intro — Commercial',
    subject: 'Professional cleaning for {{companyName}} — AskMiro',
    body:
`Hi {{contactName}},

I hope this finds you well. I'm reaching out because AskMiro Cleaning Services specialises in {{serviceType}} cleaning for businesses across London — and {{companyName}} caught my attention.

Our teams are DBS-checked, fully insured, and we work around your schedule to minimise disruption. We currently serve offices in EC1, a healthcare facility in SW1, and warehouse units across East London.

I'd love to put together a no-obligation quote within 24 hours, or jump on a quick 10-minute call if that's easier.

Would either work for you this week?

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

I'm reaching out because AskMiro specialises in end-of-tenancy and Airbnb turnaround cleaning in London, and I thought we might be a good fit for you.

Our teams are DBS-checked, fully insured, and we offer same-week availability with a quality guarantee. Most clients are booked and confirmed within 24 hours.

Happy to send our rates and availability — would a brief chat work?

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

Just following up on my earlier message about cleaning services for {{companyName}}.

If the timing isn't right, no worries at all — but if you'd like a quick quote or have any questions, I'm happy to help within 24 hours.

Best,
Mike Kato
AskMiro  |  020 8073 0621`
  },

  follow_up_2: {
    label:   'Follow-up #2 (Final)',
    subject: 'Last note — AskMiro for {{companyName}}',
    body:
`Hi {{contactName}},

I won't keep following up — just wanted to leave this here in case the timing is better down the line.

If you ever need a reliable cleaning team in London, we're always at info@askmiro.com or 020 8073 0621.

Wishing you all the best,
Mike Kato
AskMiro Cleaning Services`
  }
};

// ══════════════════════════════════════════════════════════════
// PART 2 — HANDOFF FROM LEAD INTELLIGENCE
// POST outreach.handoff
// Accepts leads from an external Lead Intelligence system.
// Duplicate-checks by email; adds new outbound leads to CRM queue.
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
    const newScore = Number(body.leadScore || body.lead_score || 0);
    const oldScore = Number(existing.leadScore || 0);
    if (newScore > oldScore) {
      updateRow('Leads', existing.id, { leadScore: String(newScore) });
    }
    return { ok: true, duplicate: true, leadId: existing.id };
  }

  // ── Infer segment + template ────────────────────────────────
  const serviceType = body.serviceType || body.service_type || '';
  const segment     = body.segment || _inferSegment(serviceType);
  const template    = body.outreachTemplate || body.outreach_template ||
    (segment === 'Residential' ? 'intro_residential' : 'intro_commercial');

  // ── Build new outbound lead ─────────────────────────────────
  const leadId  = genId('LEAD');
  const now     = new Date().toISOString();

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
    // ── Outreach fields ──────────────────────────────
    leadDirection:    'outbound',
    sourceLeadId:     String(body.sourceLeadId || body.source_lead_id || ''),
    leadScore:        String(body.leadScore || body.lead_score || ''),
    outreachStatus:   'queued',
    outreachTemplate: template,
    followUpCount:    '0',
    lastContactedAt:  '',
    nextFollowUpAt:   '',
    replyStatus:      '',
    replySummary:     '',
    threadId:         '',
    gmailMessageId:   '',
  });

  return { ok: true, duplicate: false, leadId: leadId };
}

// ══════════════════════════════════════════════════════════════
// PART 3 — OUTREACH QUEUE
// GET outreach.queue  — leads waiting to be contacted
// GET outreach.stats  — summary counts
// ══════════════════════════════════════════════════════════════
function getOutreachQueue(params, auth) {
  requireRole(auth, 'OpsManager');

  const all = getTableRows('Leads').filter(r => r.leadDirection === 'outbound');

  const queue = all.filter(r =>
    r.outreachStatus === 'queued' || r.outreachStatus === 'follow_up_due'
  );

  // Sort: highest score first, then oldest first
  queue.sort((a, b) => {
    const sd = (Number(b.leadScore) || 0) - (Number(a.leadScore) || 0);
    if (sd !== 0) return sd;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });

  return {
    ok:    true,
    queue: queue.map(_safeLeadFields),
    total: queue.length
  };
}

function getOutreachStats(params, auth) {
  requireRole(auth, 'OpsManager');

  const all      = getTableRows('Leads').filter(r => r.leadDirection === 'outbound');
  const today    = new Date().toISOString().split('T')[0];
  const sentLogs = getTableRows(OUTREACH_LOG).filter(r =>
    r.sentAt && String(r.sentAt).startsWith(today)
  );

  const byStatus = s => all.filter(r => r.outreachStatus === s).length;

  return {
    ok:              true,
    totalOutbound:   all.length,
    queued:          byStatus('queued') + byStatus('follow_up_due'),
    sent:            byStatus('sent'),
    replied:         byStatus('replied'),
    optedOut:        byStatus('opted_out'),
    exhausted:       byStatus('exhausted'),
    converted:       byStatus('converted'),
    sentToday:       sentLogs.length,
    positiveReplies: all.filter(r => r.replyStatus === 'positive').length,
    replyRatePct:    _replyRate(all),
  };
}

function _replyRate(leads) {
  const contactable = leads.filter(r =>
    ['sent','replied','exhausted'].includes(r.outreachStatus)
  ).length;
  const replied = leads.filter(r => r.outreachStatus === 'replied').length;
  return contactable > 0 ? Math.round((replied / contactable) * 100) : 0;
}

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
    createdAt:        r.createdAt,
  };
}

// ── GET OUTREACH LOG ──────────────────────────────────────────
function getOutreachLog(params, auth) {
  requireRole(auth, 'OpsManager');
  const rows = getTableRows(OUTREACH_LOG);
  // Return latest 200 rows, newest first
  return { ok: true, log: rows.slice(-200).reverse() };
}

// ── UPDATE OUTREACH STATUS ────────────────────────────────────
function updateOutreachStatus(body, auth) {
  requireRole(auth, 'OpsManager');
  const allowed = ['queued','sent','replied','opted_out','converted','exhausted'];
  if (!body.leadId || !body.status) return { error: 'leadId and status required' };
  if (!allowed.includes(body.status)) return { error: 'Invalid status: ' + body.status };
  updateRow('Leads', body.leadId, { outreachStatus: body.status });
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════
// PART 4 — SEND OUTREACH EMAIL
// POST outreach.send
// Sends the initial outreach or a follow-up for a given lead.
// Uses LockService to prevent concurrent sends to same lead.
// ══════════════════════════════════════════════════════════════
function sendOutreachEmail(body, auth) {
  requireRole(auth, 'OpsManager');

  if (!body.leadId) return { error: 'leadId required' };

  // ── Per-lead lock — 5 second timeout ───────────────────────
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch(e) {
    return { error: 'Send in progress — please try again in a moment' };
  }

  try {
    const lead = getTableRows('Leads').find(r => r.id === body.leadId);
    if (!lead)                              return { error: 'Lead not found' };
    if (lead.outreachStatus === 'opted_out') return { error: 'Lead has opted out of communications' };

    const templateKey = body.template || lead.outreachTemplate || 'intro_commercial';
    const tmpl = OUTREACH_TEMPLATES[templateKey];
    if (!tmpl) return { error: 'Unknown template: ' + templateKey };

    const subject  = _merge(tmpl.subject, lead);
    const textBody = _merge(tmpl.body,    lead);
    const htmlBody = _buildHtml(textBody);

    // ── Send ──────────────────────────────────────────────────
    GmailApp.sendEmail(lead.email, subject, textBody, {
      name:     'Mike Kato — AskMiro',
      replyTo:  'info@askmiro.com',
      bcc:      'info@askmiro.com',
      htmlBody: htmlBody,
      headers: {
        'List-Unsubscribe':      '<mailto:info@askmiro.com?subject=Unsubscribe>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    // ── Find sent thread for reply tracking ──────────────────
    Utilities.sleep(1500); // short pause so Gmail indexes the send
    const sentThread = _findSentThread(lead.email, subject);
    const threadId   = sentThread ? sentThread.getId() : '';
    const msgId      = sentThread ? sentThread.getMessages()[sentThread.getMessages().length - 1].getId() : '';

    const now           = new Date().toISOString();
    const followUpN     = Number(lead.followUpCount || 0);
    const nextIdx       = followUpN < FOLLOW_UP_DAYS.length ? followUpN : FOLLOW_UP_DAYS.length - 1;
    const nextFollowUp  = _addDays(now, FOLLOW_UP_DAYS[nextIdx]);

    // ── Update lead ───────────────────────────────────────────
    updateRow('Leads', lead.id, {
      status:           'Contacted',
      outreachStatus:   'sent',
      followUpCount:    String(followUpN),
      lastContactedAt:  now,
      nextFollowUpAt:   nextFollowUp,
      threadId:         threadId,
      gmailMessageId:   msgId,
    });

    // ── Log ───────────────────────────────────────────────────
    appendRow(OUTREACH_LOG, {
      logId:          genId('OL'),
      leadId:         lead.id,
      companyName:    lead.companyName,
      contactName:    lead.contactName,
      email:          lead.email,
      templateUsed:   templateKey,
      subject:        subject,
      sentAt:         now,
      followUpN:      String(followUpN),
      threadId:       threadId,
      gmailMessageId: msgId,
      status:         'sent',
      replyStatus:    '',
      replySummary:   '',
      replyAt:        '',
    });

    invalidateCache('Leads');

    return {
      ok:        true,
      sentTo:    lead.email,
      template:  templateKey,
      threadId:  threadId,
      nextFollowUp: nextFollowUp,
    };

  } finally {
    lock.releaseLock();
  }
}

// ── TEMPLATE MERGE ────────────────────────────────────────────
function _merge(str, lead) {
  return str
    .replace(/\{\{companyName\}\}/g,  lead.companyName  || 'your company')
    .replace(/\{\{contactName\}\}/g,  lead.contactName  || 'there')
    .replace(/\{\{serviceType\}\}/g,  lead.serviceType  || 'cleaning')
    .replace(/\{\{email\}\}/g,        lead.email        || '');
}

function _buildHtml(text) {
  const paras = text.split('\n\n').map(p =>
    '<p style="margin:0 0 16px;line-height:1.75">' +
    p.trim().replace(/\n/g, '<br>') + '</p>'
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
  if (s.includes('office'))                                       return 'Office';
  if (s.includes('healthcare') || s.includes('medical'))         return 'Healthcare';
  if (s.includes('school')     || s.includes('education'))       return 'School';
  if (s.includes('gym')        || s.includes('leisure'))         return 'Gym';
  if (s.includes('warehouse')  || s.includes('industrial'))      return 'Industrial';
  if (s.includes('residential')|| s.includes('airbnb') || s.includes('tenancy')) return 'Residential';
  return 'Office';
}

// ══════════════════════════════════════════════════════════════
// PART 5 — FOLLOW-UP ENGINE  (time trigger: daily 08:00)
// ══════════════════════════════════════════════════════════════
function runFollowUps() {
  const now = new Date();
  const due = getTableRows('Leads').filter(r =>
    r.leadDirection   === 'outbound' &&
    r.outreachStatus  === 'sent' &&
    r.nextFollowUpAt  &&
    new Date(r.nextFollowUpAt) <= now &&
    Number(r.followUpCount || 0) < MAX_FOLLOW_UPS
  );

  Logger.log('runFollowUps: ' + due.length + ' leads due for follow-up');

  due.forEach(lead => {
    try {
      const n           = Number(lead.followUpCount || 0);
      const templateKey = n === 0 ? 'follow_up_1' : 'follow_up_2';
      const tmpl        = OUTREACH_TEMPLATES[templateKey];
      const subject     = _merge(tmpl.subject, lead);
      const text        = _merge(tmpl.body, lead);
      const html        = _buildHtml(text);

      // Reply in-thread if we have a thread ID, else fresh email
      if (lead.threadId) {
        try {
          const thread = GmailApp.getThreadById(lead.threadId);
          if (thread) {
            thread.reply(text, {
              htmlBody: html,
              name:     'Mike Kato — AskMiro',
              replyTo:  'info@askmiro.com',
            });
          } else {
            GmailApp.sendEmail(lead.email, subject, text, { htmlBody: html, name: 'Mike Kato — AskMiro', replyTo: 'info@askmiro.com' });
          }
        } catch(te) {
          GmailApp.sendEmail(lead.email, subject, text, { htmlBody: html, name: 'Mike Kato — AskMiro', replyTo: 'info@askmiro.com' });
        }
      } else {
        GmailApp.sendEmail(lead.email, subject, text, { htmlBody: html, name: 'Mike Kato — AskMiro', replyTo: 'info@askmiro.com' });
      }

      const newCount     = n + 1;
      const exhausted    = newCount >= MAX_FOLLOW_UPS;
      const nextFollowUp = exhausted ? '' : _addDays(new Date().toISOString(), FOLLOW_UP_DAYS[newCount] || 14);
      const ts           = new Date().toISOString();

      updateRow('Leads', lead.id, {
        followUpCount:   String(newCount),
        lastContactedAt: ts,
        nextFollowUpAt:  nextFollowUp,
        outreachStatus:  exhausted ? 'exhausted' : 'sent',
      });

      appendRow(OUTREACH_LOG, {
        logId:          genId('OL'),
        leadId:         lead.id,
        companyName:    lead.companyName,
        contactName:    lead.contactName,
        email:          lead.email,
        templateUsed:   templateKey,
        subject:        subject,
        sentAt:         ts,
        followUpN:      String(newCount),
        threadId:       lead.threadId,
        gmailMessageId: '',
        status:         'follow_up',
        replyStatus:    '',
        replySummary:   '',
        replyAt:        '',
      });

    } catch(e) {
      Logger.log('Follow-up failed for ' + lead.id + ': ' + e.message);
    }
  });

  invalidateCache('Leads');
  Logger.log('runFollowUps complete.');
}

// ══════════════════════════════════════════════════════════════
// PART 6 — REPLY DETECTION  (time trigger: every 2 hours)
// Scans Gmail threads for replies from outbound leads.
// ══════════════════════════════════════════════════════════════
function scanOutreachReplies() {
  const leads = getTableRows('Leads').filter(r =>
    r.leadDirection === 'outbound' &&
    r.outreachStatus === 'sent' &&
    r.threadId &&
    (!r.replyStatus || r.replyStatus === '')
  );

  Logger.log('scanOutreachReplies: checking ' + leads.length + ' threads');

  leads.forEach(lead => {
    try {
      const thread = GmailApp.getThreadById(lead.threadId);
      if (!thread) return;

      const messages = thread.getMessages();
      if (messages.length <= 1) return; // No reply yet

      // Find replies not from us
      const replies = messages.filter(m => {
        const from = m.getFrom().toLowerCase();
        return !from.includes('askmiro.com') && !from.includes('info@askmiro');
      });
      if (!replies.length) return;

      const latestReply = replies[replies.length - 1];
      const replyText   = latestReply.getPlainBody().substring(0, 2000);

      // ── PART 7: AI classification ─────────────────────────
      const cls = _classifyReplyAI(replyText, lead);
      const ts  = new Date().toISOString();

      updateRow('Leads', lead.id, {
        replyStatus:    cls.intent,
        replySummary:   cls.summary,
        outreachStatus: cls.intent === 'unsubscribe' ? 'opted_out' : 'replied',
        status:         cls.intent === 'positive' ? 'Contacted' : lead.status,
      });

      _updateLogReply(lead.id, cls, ts);
      invalidateCache('Leads');

    } catch(e) {
      Logger.log('Reply scan error for ' + lead.id + ': ' + e.message);
    }
  });

  Logger.log('scanOutreachReplies complete.');
}

function _updateLogReply(leadId, cls, ts) {
  try {
    const tab  = getTab(OUTREACH_LOG);
    const data = tab.getDataRange().getValues();
    const hdrs = data[0].map(h => String(h).trim());
    const replyStatusCol  = hdrs.indexOf('replyStatus');
    const replySummaryCol = hdrs.indexOf('replySummary');
    const replyAtCol      = hdrs.indexOf('replyAt');
    // Find the most recent log row for this lead
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1]) === String(leadId)) {
        if (replyStatusCol  >= 0) tab.getRange(i + 1, replyStatusCol  + 1).setValue(cls.intent);
        if (replySummaryCol >= 0) tab.getRange(i + 1, replySummaryCol + 1).setValue(cls.summary);
        if (replyAtCol      >= 0) tab.getRange(i + 1, replyAtCol      + 1).setValue(ts);
        return;
      }
    }
  } catch(e) { Logger.log('_updateLogReply error: ' + e.message); }
}

// ══════════════════════════════════════════════════════════════
// PART 7 — AI REPLY CLASSIFICATION (Anthropic Claude)
// ══════════════════════════════════════════════════════════════
function _classifyReplyAI(emailBody, lead) {
  const fallback = { intent: 'positive', summary: emailBody.substring(0, 80) };

  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) {
      Logger.log('ANTHROPIC_API_KEY not set in Script Properties — skipping AI classification');
      return fallback;
    }

    const prompt = `You are analysing a reply to a cold outreach email sent by AskMiro Cleaning Services (London).

Classify the reply intent into EXACTLY one of:
- positive       — interested, wants info, wants a quote, open to a call
- negative       — not interested, wrong person, bad timing (polite decline)
- unsubscribe    — opt out, stop emailing, remove from list
- info_request   — asking a specific question before deciding
- auto_reply     — out of office, automated response

Lead: ${lead.companyName || ''} (${lead.contactName || ''})

Reply:
"""
${emailBody}
"""

Respond with JSON only, no other text:
{"intent":"<one of the five above>","summary":"<max 80 char one-sentence summary>"}`;

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
      const valid  = ['positive','negative','unsubscribe','info_request','auto_reply'];
      return {
        intent:  valid.includes(parsed.intent) ? parsed.intent : 'positive',
        summary: parsed.summary || emailBody.substring(0, 80),
      };
    }
    return fallback;

  } catch(e) {
    Logger.log('_classifyReplyAI error: ' + e.message);
    return fallback;
  }
}

// GET outreach.templates — return all available template definitions
function getOutreachTemplates(params, auth) {
  requireRole(auth, 'OpsManager');
  return {
    ok: true,
    templates: Object.entries(OUTREACH_TEMPLATES).map(([key, t]) => ({
      key:     key,
      label:   t.label,
      subject: t.subject,
      body:    t.body,
    }))
  };
}

// ══════════════════════════════════════════════════════════════
// SETUP HELPERS — run once from GAS editor
// ══════════════════════════════════════════════════════════════

// Run once to add outreach columns to the Leads sheet
function setupOutreachColumns() {
  const tab     = getTab('Leads');
  const headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0].map(h => String(h).trim());

  const newCols = [
    'leadDirection','sourceLeadId','leadScore',
    'outreachStatus','outreachTemplate','followUpCount',
    'lastContactedAt','nextFollowUpAt',
    'replyStatus','replySummary',
    'threadId','gmailMessageId'
  ];

  let added = 0;
  newCols.forEach(col => {
    if (!headers.includes(col)) {
      const colIdx = tab.getLastColumn() + 1;
      tab.getRange(1, colIdx).setValue(col);
      // Format header cell to match existing style
      tab.getRange(1, colIdx).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
      added++;
    }
  });

  invalidateCache('Leads');
  return 'setupOutreachColumns: ' + added + ' columns added.';
}

// Run once to create the Outreach_Log sheet
function setupOutreachLogSheet() {
  const ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
  const exist = ss.getSheetByName(OUTREACH_LOG);
  if (exist) return 'Outreach_Log already exists — skipped.';

  const sheet = ss.insertSheet(OUTREACH_LOG);
  const headers = [
    'logId','leadId','companyName','contactName','email',
    'templateUsed','subject','sentAt','followUpN',
    'threadId','gmailMessageId','status',
    'replyStatus','replySummary','replyAt'
  ];
  sheet.appendRow(headers);

  const hdr = sheet.getRange(1, 1, 1, headers.length);
  hdr.setBackground('#0F172A').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setFrozenRows(1);

  return 'Outreach_Log sheet created with ' + headers.length + ' columns.';
}

// Run once to install daily follow-up + 2-hourly reply scan triggers
function setupOutreachTriggers() {
  const fns = ['runFollowUps', 'scanOutreachReplies'];
  ScriptApp.getProjectTriggers()
    .filter(t => fns.includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('runFollowUps').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('scanOutreachReplies').timeBased().everyHours(2).create();

  return 'Triggers installed: runFollowUps (daily 08:00) + scanOutreachReplies (every 2h)';
}

// Store your Anthropic API key in GAS Script Properties (not in source code)
function setupAnthropicKey(apiKey) {
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', apiKey);
  return 'ANTHROPIC_API_KEY saved to Script Properties.';
}
