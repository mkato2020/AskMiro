// ============================================================
// AskMiro Ops — Pipeline (quote → chase → close)
// ============================================================
// Ops is the system of record; Gmail is where quotes and replies actually
// happen. This file keeps the two in step:
//
//   pipelineSync()        reads the mailbox for every live lead and derives
//                         the lead's state from it — quote sent, amount,
//                         reply waiting, chase due. Stateless: run it twice,
//                         get the same answer.
//   getPipelineToday()    the worklist Ops shows: reply waiting, unanswered
//                         enquiries, chases due, quotes awaiting an answer.
//   pipelineChaseDraft()  writes the next chase as a Gmail DRAFT. Nothing in
//                         this file sends customer email — Mike presses Send.
//   pipelineRecordQuote() manual / Ops-sent quote → same record as above.
// ============================================================
const PL = {
  CHASE_GAPS_DAYS:   [3, 4, 7],          // chase on day 3, 7 and 14 after the quote
  SCAN_WINDOW_DAYS:  240,
  SYNC_BUDGET_MS:    240000,             // trigger run; UI calls pass a smaller budget
  FRESH_MS:          10 * 60 * 1000,     // skip leads synced in the last 10 minutes
  FLAGGED_EVERY_MS:  20 * 60 * 60 * 1000,// cold leads with a flagged reply: once a day
  ROTATION_PER_RUN:  25,                 // other cold leads with a thread: slow rotation
  STALE_REPLY_DAYS:  30,
  UNANSWERED_DAYS:   45,
  OWN_RE:            /@askmiro\.com$|^mkato\.ug@gmail\.com$/i,
  PLACEHOLDER_RE:    /@(domain|example|email|yourdomain|test)\.(com|co\.uk|org)$|^(youraddress|your\.name|yourname|name|email|user)@|^u003e|^%20/i,
  ACK_SUBJECT_RE:    /^(re:\s*)*(thanks for your quote request|your cleaning enquiry|we.ve received your)/i,
  AUTO_SUBJECT_RE:   /^(re:\s*)*(automatic reply|auto[- ]?reply|autoreply|auto[- ]?response|out of (the )?office|thank you for (your )?(email|message|enquiry|contacting)|thanks for (your )?(email|message|getting in touch|contacting)|we have received|we.ve received|delivery status|undeliverable|mail delivery|failure notice)/i,
  GENERIC_NAME_RE:   /manager|director|owner|officer|administrator|coordinator|team|reception|facilities|practice|branch|office|operations|centre|center|school/i,
  LIVE_STAGES:       ['New', 'Contacted', 'Qualified', 'QuoteSent', 'Negotiating'],
  LEADS_COLS: ['annualValue', 'quoteId', 'quoteSentAt', 'quoteMonthly', 'quoteThreadId', 'quoteFrom',
               'chaseStep', 'nextChaseAt', 'chaseSnoozeUntil', 'chaseDraftAt',
               'lastOutboundAt', 'lastInboundAt', 'replyWaiting', 'pipelineNote', 'pipelineSyncedAt',
               'updatedAt', 'updatedBy'],
  QUOTES_COLS: ['leadId', 'email', 'hoursPerWeek', 'fixedMonthly', 'revenueMonthly', 'labourCost', 'directCost',
                'grossMarginGBP', 'grossMarginPct', 'annualValue', 'sentAt', 'sentBy', 'sentVia', 'sentTo',
                'threadId', 'updatedAt', 'updatedBy']
};

// ── PURE HELPERS (no Google services — unit-tested in tests/pipeline.test.js) ──
function _plAddr(s) {
  var str = String(s || '');
  var m = /<([^>]+)>/.exec(str);
  return (m ? m[1] : str).trim().toLowerCase();
}
function _plIsOwn(addr)         { return PL.OWN_RE.test(_plAddr(addr)); }
function _plIsPlaceholder(addr) { return PL.PLACEHOLDER_RE.test(_plAddr(addr)); }
function _plValidEmail(addr) {
  var a = _plAddr(addr);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a) && !_plIsOwn(a) && !_plIsPlaceholder(a);
}
function _plNum(s)  { return parseFloat(String(s).replace(/,/g, '')) || 0; }
function _plDate(s) {
  if (!s) return null;
  var d = (s instanceof Date) ? s : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function _plIso(d)  { var x = _plDate(d); return x ? x.toISOString() : ''; }
function _plAddDays(d, days) { return new Date(_plDate(d).getTime() + days * 86400000); }
function _plMoney(n) {
  return '£' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function _plShortDate(d) {
  var x = _plDate(d); if (!x) return '';
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return x.getUTCDate() + ' ' + mo[x.getUTCMonth()];
}

// Drop the quoted history under a reply so an old figure is never read as new.
function _plStripQuoted(text) {
  var t = String(text || '').replace(/\r/g, '');
  var cut = [
    /^On .{6,120}wrote:\s*$/m,
    /^-{2,}\s*Original Message\s*-{2,}/mi,
    /^_{8,}\s*$/m,
    /^From: .+\n(Sent|Date): .+/m
  ];
  var end = t.length;
  cut.forEach(function(re) { var m = re.exec(t); if (m && m.index < end) end = m.index; });
  return t.slice(0, end).split('\n').filter(function(l) { return !/^\s*>/.test(l); }).join('\n');
}

// Read the price out of a quote email. Returns zeros when there is none.
function _plParseQuote(text) {
  var t = _plStripQuoted(text).replace(/ /g, ' ').replace(/\*/g, '').replace(/[ \t]+/g, ' ');   // Gmail plain text wraps bold in asterisks
  var AMT = '£\\s?([\\d,]+(?:\\.\\d{1,2})?)';
  var PER = '\\s*(?:\\+\\s*VAT\\s*)?(?:\\/|per|a|each|every)\\s*';
  function all(re) {
    var out = [], m, g = new RegExp(re, 'gi');
    while ((m = g.exec(t)) !== null) { out.push(_plNum(m[1])); if (m.index === g.lastIndex) g.lastIndex++; }
    return out.filter(function(n) { return n > 0; });
  }
  function max(a) { return a.length ? Math.max.apply(null, a) : 0; }
  var monthly = max([].concat(
    all(AMT + PER + '(?:calendar\\s+)?(?:month|mth|mo\\b)'),
    all(AMT + '\\s*(?:pcm|monthly|p\\/m)\\b'),
    all('monthly\\s+(?:service\\s+)?(?:fee|price|cost|total|charge|investment)[^£]{0,60}' + AMT)
  ));
  var annual = max(all(AMT + PER + '(?:year|annum|yr\\b)'));
  var weekly = max(all(AMT + PER + '(?:week|wk\\b)'));
  if (!monthly && annual) monthly = annual / 12;
  if (!monthly && weekly) monthly = weekly * 52 / 12;
  var oneOff = 0;
  if (!monthly) {
    oneOff = max([].concat(
      all(AMT + '[^£\\n]{0,30}(?:per (?:visit|clean)|one[- ]off|fixed price|in total|for the (?:deep |one[- ]off |full )?clean)'),
      all('(?:total|price|quote|fee|cost)[^£\\n]{0,30}' + AMT)
    ));
  }
  // Hours: stated per week, or visits per week x hours per visit. Never guessed.
  var hours = 0;
  var h = /(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\s*(?:\/|per|a|each)\s*(?:week|wk)/i.exec(t);
  if (h) hours = parseFloat(h[1]);
  else {
    var WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
    var v  = /\b(\d+|one|two|three|four|five|six|seven)\s+(?:visits?|cleans?|times)\s*(?:\/|per|a|each)\s*week/i.exec(t);
    var pv = /(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\s*(?:per (?:visit|clean)|a visit|each visit|on site)/i.exec(t);
    if (v && pv) hours = (WORDS[v[1].toLowerCase()] || parseFloat(v[1])) * parseFloat(pv[1]);
  }
  return {
    monthly:      Math.round(monthly * 100) / 100,
    oneOff:       Math.round(oneOff * 100) / 100,
    hoursPerWeek: hours,
    isQuote:      (monthly > 0 || oneOff > 0) && /quot|proposal|estimat|price|fee/i.test(t)
  };
}

// events: [{dir:'out'|'in', at:Date, auto:bool, quote:{monthly,oneOff,hoursPerWeek,isQuote}|null,
//           threadId, from, subject}] — any order. Returns the lead's derived state.
function _plDerive(events, now, snoozeUntil) {
  var ev = events.filter(function(e) { return !e.auto; })
                 .sort(function(a, b) { return a.at.getTime() - b.at.getTime(); });
  var outs = ev.filter(function(e) { return e.dir === 'out'; });
  var ins  = ev.filter(function(e) { return e.dir === 'in'; });
  var lastOut = outs.length ? outs[outs.length - 1] : null;
  var lastIn  = ins.length  ? ins[ins.length - 1]   : null;

  // The quote is the first priced message; a later message only replaces it
  // when the figure changes (a chase that repeats the price is not a re-quote).
  var quote = null;
  outs.forEach(function(e) {
    if (!e.quote || !e.quote.isQuote) return;
    var amt = e.quote.monthly || e.quote.oneOff;
    if (!quote || Math.abs(amt - (quote.quote.monthly || quote.quote.oneOff)) > 0.5) quote = e;
  });

  var replyWaiting = !!(lastIn && (!lastOut || lastIn.at.getTime() > lastOut.at.getTime()));
  var chaseStep = 0, nextChaseAt = null;
  if (quote) {
    chaseStep = Math.min(outs.filter(function(e) { return e.at.getTime() > quote.at.getTime(); }).length, 3);
    if (!replyWaiting && chaseStep < 3) {
      nextChaseAt = _plAddDays(lastOut.at, PL.CHASE_GAPS_DAYS[chaseStep]);
      var snooze = _plDate(snoozeUntil);
      if (snooze && snooze.getTime() > nextChaseAt.getTime()) nextChaseAt = snooze;
    }
  }
  return {
    quote: quote, lastOut: lastOut, lastIn: lastIn,
    replyWaiting: replyWaiting, chaseStep: chaseStep, nextChaseAt: nextChaseAt,
    humanOutCount: outs.length
  };
}

function _plNextStage(current, d) {
  if (d.quote && ['New', 'Contacted', 'Qualified', 'OutreachQueued', ''].indexOf(current || '') !== -1) return 'QuoteSent';
  if (!d.quote && d.humanOutCount > 0 && (current === 'New' || !current)) return 'Contacted';
  return current;
}

function _plNote(d) {
  if (d.replyWaiting) return 'Reply waiting since ' + _plShortDate(d.lastIn.at);
  if (d.quote) {
    var q = d.quote.quote;
    var amt = q.monthly ? _plMoney(q.monthly) + '/mo' : _plMoney(q.oneOff) + ' one-off';
    var s = 'Quote ' + amt + ' sent ' + _plShortDate(d.quote.at);
    if (d.nextChaseAt) return s + ' · chase ' + (d.chaseStep + 1) + ' due ' + _plShortDate(d.nextChaseAt);
    return s + ' · chased ' + d.chaseStep + '×, no reply — call or close';
  }
  if (d.lastOut) return 'Last contact ' + _plShortDate(d.lastOut.at);
  return '';
}

function _plFirstName(lead) {
  var n = String(lead.contactName || '').trim();
  if (!n || PL.GENERIC_NAME_RE.test(n) || /@/.test(n)) return '';
  var first = n.split(/\s+/)[0].replace(/[^A-Za-z'À-ſ-]/g, '');
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

function _plChaseText(lead, step) {
  var hi   = 'Hi ' + (_plFirstName(lead) || 'there') + ',';
  var m    = _plNum(lead.quoteMonthly);
  var amt  = m ? ' of ' + _plMoney(m) + ' a month' : '';
  var sent = _plShortDate(lead.quoteSentAt);
  var sign = '\n\nMike Kato\nAskMiro Cleaning Services\n020 8073 0621';
  if (step <= 0) return hi + '\n\n' +
    'Just checking the cleaning quote' + amt + ' I sent' + (sent ? ' on ' + sent : '') + ' reached you.\n\n' +
    'If the hours or the scope are not quite what you had in mind, tell me and I will adjust it. ' +
    'The price is an estimate until I have seen the site, and a 15 minute visit is all it takes to fix it. ' +
    'I can do early morning or after hours, whichever is easier for you.\n\n' +
    'Is there a day this week or next that would suit?' + sign;
  if (step === 1) return hi + '\n\n' +
    'Following up on the cleaning quote' + amt + (sent ? ' from ' + sent : '') + '.\n\n' +
    'If you have gone another way, or the timing is wrong, just say so and I will close it at my end. ' +
    'If it is still live, the quickest next step is a short site visit so I can confirm the price.\n\n' +
    'Happy to answer any questions in the meantime.' + sign;
  return hi + '\n\n' +
    'I have not heard back on the cleaning quote' + amt + ', so I will assume it is not a priority right now and close it at my end.\n\n' +
    'If that changes, reply to this email and I will pick it straight back up.' + sign;
}

function _plOncost(settings) {
  var pct = parseFloat(settings && settings.oncostsPct);          // Admin → Settings, e.g. 36
  if (pct > 0) return pct > 1 ? pct / 100 : pct;
  var frac = parseFloat(settings && settings.oncostPct);          // intelligence seed, e.g. 0.22
  return frac > 0 ? frac : CFG.ONCOST_PCT;
}

// One on-cost figure for the whole system: the quote builder, the pricing
// engine and the recorded margin all read it from here.
function _plOncostLive() {
  try { return _plOncost(getSettingsObj()); } catch (e) { return CFG.ONCOST_PCT; }
}

function _plIsTestLead(lead) {
  return /^mike kato$/i.test(String(lead.contactName || '').trim()) ||
         /situka/i.test(String(lead.companyName || '')) ||
         _plIsOwn(lead.email);
}
function _plIsOutbound(lead) {
  return lead.leadDirection === 'outbound' || String(lead.source || '').toLowerCase() === 'outbound';
}

// ── SHEET HELPERS ─────────────────────────────────────────────
function _plEnsureCols() {
  var added = {};
  [['Leads', PL.LEADS_COLS], ['Quotes', PL.QUOTES_COLS]].forEach(function(p) {
    var tab     = getTab(p[0]);
    var lastCol = tab.getLastColumn();
    var hdrs    = tab.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
    var missing = p[1].filter(function(c) { return hdrs.indexOf(c) === -1; });
    if (missing.length) {
      var need = lastCol + missing.length - tab.getMaxColumns();
      if (need > 0) tab.insertColumnsAfter(tab.getMaxColumns(), need);
      tab.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
      invalidateCache(p[0]);
    }
    added[p[0]] = missing;
  });
  return added;
}

// One read of the tab, then writes only the cells that changed (as contiguous
// runs). Cells this file does not own — phone numbers, notes, formulas — are
// never rewritten. byId = { rowId: { col: value } }.
function _plBatchUpdate(tabName, byId) {
  var ids = Object.keys(byId);
  if (!ids.length) return 0;
  var tab   = getTab(tabName);
  var data  = tab.getDataRange().getValues();
  var hdrs  = data[0].map(function(h) { return String(h).trim(); });
  var idCol = hdrs.indexOf('id');
  var n = 0;
  for (var i = 1; i < data.length; i++) {
    var u = byId[String(data[i][idCol]).trim()];
    if (!u) continue;
    var cols = [];
    Object.keys(u).forEach(function(k) {
      var c = hdrs.indexOf(k);
      if (c >= 0 && String(data[i][c]) !== String(u[k])) cols.push({ c: c, v: u[k] });
    });
    if (!cols.length) continue;
    cols.sort(function(x, y) { return x.c - y.c; });
    var run = [cols[0]];
    for (var j = 1; j <= cols.length; j++) {
      if (j < cols.length && cols[j].c === run[run.length - 1].c + 1) { run.push(cols[j]); continue; }
      tab.getRange(i + 1, run[0].c + 1, 1, run.length).setValues([run.map(function(x) { return x.v; })]);
      if (j < cols.length) run = [cols[j]];
    }
    n++;
  }
  if (n) invalidateCache(tabName);
  return n;
}

// ── GMAIL → EVENTS ────────────────────────────────────────────
function _plIsAutoInbound(msg, prevOutAt) {
  var subject = msg.getSubject() || '';
  if (PL.AUTO_SUBJECT_RE.test(subject)) return true;
  if (prevOutAt && msg.getDate().getTime() - prevOutAt.getTime() < 90000) return true;   // answered inside 90s = a machine
  try {
    var as = String(msg.getHeader('Auto-Submitted') || '').toLowerCase();
    if (as && as !== 'no') return true;
    if (msg.getHeader('X-Autoreply') || msg.getHeader('X-Autorespond')) return true;
    var prec = String(msg.getHeader('Precedence') || '').toLowerCase();
    if (prec === 'bulk' || prec === 'auto_reply' || prec === 'junk') return true;
  } catch (e) {}
  return false;
}

function _plScanLead(lead) {
  var email   = _plAddr(lead.email);
  var created = _plDate(lead.createdAt);
  var threads = GmailApp.search('{from:' + email + ' to:' + email + '} newer_than:' + PL.SCAN_WINDOW_DAYS + 'd', 0, 8);
  var events  = [];
  threads.forEach(function(t) {
    var lastOutAt = null;
    t.getMessages().forEach(function(m) {
      if (m.isDraft()) return;
      var from = _plAddr(m.getFrom());
      var at   = m.getDate();
      var subj = m.getSubject() || '';
      if (_plIsOwn(from)) {
        var rcpt = ((m.getTo() || '') + ' ' + (m.getCc() || '')).toLowerCase();
        if (rcpt.indexOf(email) === -1) return;               // our own copy, a notification, a self-addressed follow-up
        var sinceLead = created ? at.getTime() - created.getTime() : null;
        var auto = (sinceLead !== null && sinceLead >= -60000 && sinceLead < 5 * 60000) ||
                   (PL.ACK_SUBJECT_RE.test(subj) && (sinceLead === null ? !/^re:/i.test(subj) : sinceLead < 15 * 60000));
        var quote = null;
        if (!auto) { try { quote = _plParseQuote(m.getPlainBody().substring(0, 8000)); } catch (e) {} }
        events.push({ dir: 'out', at: at, auto: auto, quote: quote, threadId: t.getId(), from: from, subject: subj });
        lastOutAt = at;
      } else if (from === email) {
        events.push({ dir: 'in', at: at, auto: _plIsAutoInbound(m, lastOutAt), quote: null, threadId: t.getId(), from: from, subject: subj });
      }
    });
  });
  return events;
}

// ── QUOTE RECORD ──────────────────────────────────────────────
// Writes the sent quote to the Quotes tab so Ops shows what the customer was
// actually told. info: { monthly, oneOff, hoursPerWeek, sentAt, via, to, threadId, by }
function _plRecordQuoteRow(lead, info, quoteId) {
  var quotes = getTableRows('Quotes');
  var row = quoteId ? quotes.filter(function(q) { return q.id === quoteId; })[0] : null;
  if (!row && lead) {
    var mine = quotes.filter(function(q) {
      return (q.leadId && q.leadId === lead.id) ||
             (lead.email && q.email && _plAddr(q.email) === _plAddr(lead.email));
    }).filter(function(q) { return ['Accepted', 'Won', 'Lost', 'Superseded'].indexOf(q.status) === -1; });
    mine.sort(function(a, b) { return String(b.createdAt || '') > String(a.createdAt || '') ? 1 : -1; });
    row = mine[0] || null;
  }
  var settings = getSettingsObj();
  // Hours come from the quote itself. The draft's estimate is not what was sold,
  // so without stated hours the margin is left blank rather than invented.
  var hours    = _plNum(info.hoursPerWeek);
  if (hours > 168) hours = 0;
  var upd = {
    status: 'Sent', sentAt: _plIso(info.sentAt) || new Date().toISOString(),
    sentVia: info.via || 'gmail', sentTo: info.to || (lead && lead.email) || '',
    sentBy: info.by || '', threadId: info.threadId || '',
    updatedAt: new Date().toISOString(), updatedBy: info.by || 'PIPELINE'
  };
  if (info.monthly > 0) {
    upd.fixedMonthly   = info.monthly;
    upd.revenueMonthly = info.monthly;
    upd.annualValue    = r2(info.monthly * 12);
    if (hours > 0) {
      var calc = calculateQuote({
        hoursPerWeek: hours, fixedMonthly: info.monthly,
        llwRate: parseFloat(settings.llwRate) || CFG.LLW_RATE, oncostPct: _plOncostLive(),
        suppliesCost: _plNum(row && row.suppliesCost), otherCosts: _plNum(row && row.otherCosts)
      });
      upd.hoursPerWeek = hours; upd.labourCost = r2(calc.labour); upd.directCost = r2(calc.direct);
      upd.grossMarginGBP = r2(calc.gm); upd.grossMarginPct = r2(calc.gmPct);
    }
  } else if (info.oneOff > 0) {
    upd.annualValue = info.oneOff;
    upd.notes = ((row && row.notes) ? row.notes + ' | ' : '') + 'One-off ' + _plMoney(info.oneOff);
    if (row && /One-off £/.test(row.notes || '')) delete upd.notes;
  }
  if (row) {
    if (row.status === 'Sent' && String(row.sentAt) === String(upd.sentAt) &&
        _plNum(row.revenueMonthly) === _plNum(upd.revenueMonthly || row.revenueMonthly)) return row.id;
    var byId = {}; byId[row.id] = upd;
    _plBatchUpdate('Quotes', byId);
    return row.id;
  }
  var id = genId('QUOTE');
  appendRow('Quotes', Object.assign({
    id: id, leadId: lead ? lead.id : '', version: 1,
    source: lead && !_plIsOutbound(lead) ? 'web_form' : 'manual',
    clientName: lead ? (lead.companyName || lead.contactName || '') : (info.clientName || ''),
    email: lead ? lead.email : (info.to || ''), phone: lead ? lead.phone : '',
    siteAddress: lead ? (lead.postcode || '') : '', postcode: lead ? (lead.postcode || '') : '',
    createdAt: new Date().toISOString(), createdBy: info.by || 'PIPELINE'
  }, upd));
  return id;
}

// ── SYNC ──────────────────────────────────────────────────────
function pipelineSync(opts) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return { ok: false, busy: true };
  try { return _plRunSync(opts || {}); } finally { lock.releaseLock(); }
}
function pipelineSyncTrigger() {
  var r = pipelineSync({ source: 'trigger' });
  Logger.log('pipelineSync: ' + JSON.stringify(r));
}

function _plCandidates(leads, nowMs) {
  var core = [], flagged = [], rotation = [];
  leads.forEach(function(l) {
    if (!_plValidEmail(l.email)) return;
    if (l.status === 'Won' || l.status === 'Lost') return;
    var synced = _plDate(l.pipelineSyncedAt);
    var age    = synced ? nowMs - synced.getTime() : Infinity;
    if (age < PL.FRESH_MS) return;
    var live = ['Qualified', 'QuoteSent', 'Negotiating'].indexOf(l.status) !== -1 ||
               ['QUALIFIED', 'REPLIED'].indexOf(l.outreachStatus) !== -1;
    if (!_plIsOutbound(l) || live) { core.push(l); return; }
    var rs = String(l.replyStatus || '').toUpperCase();
    if (['UNSUBSCRIBE', 'NOT_INTERESTED', 'BOUNCE'].indexOf(rs) !== -1) return;
    if (['UNSUBSCRIBED', 'NOT_INTERESTED', 'BOUNCED'].indexOf(l.outreachStatus) !== -1) return;
    if (rs || String(l.needsHumanAction).toLowerCase() === 'true') {
      if (age >= PL.FLAGGED_EVERY_MS) flagged.push(l);
      return;
    }
    if (l.threadId) rotation.push(l);
  });
  function oldest(a, b) { return String(a.pipelineSyncedAt || '') < String(b.pipelineSyncedAt || '') ? -1 : 1; }
  core.sort(oldest); flagged.sort(oldest); rotation.sort(oldest);
  return { core: core, flagged: flagged, rotation: rotation.slice(0, PL.ROTATION_PER_RUN) };
}

function _plRunSync(opts) {
  var started = Date.now();
  var budget  = Math.min(parseInt(opts.budgetMs, 10) || PL.SYNC_BUDGET_MS, PL.SYNC_BUDGET_MS);
  _plEnsureCols();
  var c    = _plCandidates(getTableRows('Leads'), started);
  var todo = opts.coreOnly ? c.core : c.core.concat(c.flagged, c.rotation);
  var leadUpd = {}, changes = [], errors = 0, done = 0;

  for (var i = 0; i < todo.length; i++) {
    if (Date.now() - started > budget) break;
    var lead = todo[i];
    try {
      var d   = _plDerive(_plScanLead(lead), new Date(), lead.chaseSnoozeUntil);
      var upd = {
        lastOutboundAt: d.lastOut ? _plIso(d.lastOut.at) : '',
        lastInboundAt:  d.lastIn  ? _plIso(d.lastIn.at)  : '',
        replyWaiting:   d.replyWaiting ? 'yes' : '',
        chaseStep:      d.quote ? d.chaseStep : '',
        nextChaseAt:    d.nextChaseAt ? _plIso(d.nextChaseAt) : '',
        pipelineNote:   _plNote(d),
        pipelineSyncedAt: new Date().toISOString()
      };
      if (d.quote) {
        var q = d.quote.quote;
        upd.quoteSentAt   = _plIso(d.quote.at);
        upd.quoteMonthly  = q.monthly || '';
        upd.quoteThreadId = d.quote.threadId;
        upd.quoteFrom     = d.quote.from;
        upd.annualValue   = q.monthly ? r2(q.monthly * 12) : q.oneOff;
        var changedQuote  = String(lead.quoteSentAt || '') !== upd.quoteSentAt ||
                            _plNum(lead.quoteMonthly) !== _plNum(upd.quoteMonthly) || !lead.quoteId;
        if (changedQuote) {
          upd.quoteId = _plRecordQuoteRow(lead, {
            monthly: q.monthly, oneOff: q.oneOff, hoursPerWeek: q.hoursPerWeek,
            sentAt: d.quote.at, via: 'gmail', to: lead.email, threadId: d.quote.threadId
          }, lead.quoteId || '');
        }
      }
      var stage = _plNextStage(lead.status, d);
      if (stage !== lead.status) {
        upd.status = stage; upd.updatedAt = new Date().toISOString(); upd.updatedBy = 'PIPELINE';
        changes.push({ id: lead.id, name: lead.companyName || lead.contactName, from: lead.status, to: stage });
        auditLog('PIPELINE', 'STAGE_CHANGE', 'Lead', lead.id, { status: lead.status }, { status: stage, note: upd.pipelineNote });
      }
      leadUpd[lead.id] = upd;
      done++;
    } catch (e) {
      errors++;
      Logger.log('pipelineSync: ' + lead.id + ' failed — ' + e.message);
      if (/quota|too many|rate limit|service invoked/i.test(e.message)) break;
    }
  }
  var written = _plBatchUpdate('Leads', leadUpd);
  var now = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty('pl_synced_at', now);
  try { CacheService.getScriptCache().remove('pl_today'); } catch (e) {}
  return { ok: true, scanned: done, written: written, errors: errors,
           remaining: Math.max(todo.length - done - errors, 0), stageChanges: changes, syncedAt: now };
}

// ── API: POST pipeline.sync ───────────────────────────────────
function pipelineSyncApi(body, auth) {
  requireRole(auth, 'OpsManager');
  return pipelineSync({ budgetMs: 13000, coreOnly: !(body && body.full), source: 'ui' });
}

// ── API: GET pipeline.today ───────────────────────────────────
function getPipelineToday(params, auth) {
  requireRole(auth, 'OpsManager');
  var now = Date.now();
  var out = { ok: true, reply: [], oldReplies: [], unanswered: [], chase: [], awaiting: [], stalled: [],
              totals: { quotesOut: 0, pipelineMonthly: 0, pipelineAnnual: 0 },
              syncedAt: PropertiesService.getScriptProperties().getProperty('pl_synced_at') || '' };
  getTableRows('Leads').forEach(function(l) {
    if (PL.LIVE_STAGES.indexOf(l.status) === -1) return;
    if (_plIsTestLead(l)) return;
    var item = {
      id: l.id, company: l.companyName || '', contact: l.contactName || '', email: l.email || '', phone: l.phone || '',
      stage: l.status, source: l.source || '', createdAt: _plIso(l.createdAt), service: l.serviceType || '',
      quoteMonthly: _plNum(l.quoteMonthly), annualValue: _plNum(l.annualValue), quoteSentAt: l.quoteSentAt || '',
      quoteId: l.quoteId || '', chaseStep: parseInt(l.chaseStep, 10) || 0, nextChaseAt: l.nextChaseAt || '',
      chaseDraftAt: l.chaseDraftAt || '', lastInboundAt: l.lastInboundAt || '', lastOutboundAt: l.lastOutboundAt || '',
      threadId: l.quoteThreadId || l.threadId || '', note: l.pipelineNote || ''
    };
    if (l.status === 'QuoteSent' || l.status === 'Negotiating') {
      out.totals.quotesOut++;
      out.totals.pipelineMonthly += item.quoteMonthly;
      out.totals.pipelineAnnual  += item.annualValue;
    }
    if (l.replyWaiting === 'yes') {
      var inAt = _plDate(l.lastInboundAt);
      var old  = inAt && now - inAt.getTime() > PL.STALE_REPLY_DAYS * 86400000;
      (old ? out.oldReplies : out.reply).push(item);
      return;
    }
    if (l.status === 'QuoteSent') {
      var due = _plDate(l.nextChaseAt);
      if (!due)                      out.stalled.push(item);
      else if (due.getTime() <= now) out.chase.push(item);
      else                           out.awaiting.push(item);
      return;
    }
    if (l.status === 'New' && !_plIsOutbound(l) && !l.lastOutboundAt) {
      var created = _plDate(l.createdAt);
      if (!created || now - created.getTime() < PL.UNANSWERED_DAYS * 86400000) out.unanswered.push(item);
    }
  });
  function by(field, dir) {
    return function(a, b) { return (String(a[field]) < String(b[field]) ? -1 : 1) * dir; };
  }
  out.reply.sort(by('lastInboundAt', -1));
  out.oldReplies.sort(by('lastInboundAt', -1));
  out.unanswered.sort(by('createdAt', -1));
  out.chase.sort(by('nextChaseAt', 1));
  out.awaiting.sort(by('nextChaseAt', 1));
  out.totals.pipelineMonthly = r2(out.totals.pipelineMonthly);
  out.totals.pipelineAnnual  = r2(out.totals.pipelineAnnual);
  return out;
}

// ── API: POST quote.record ────────────────────────────────────
// A quote that went out by phone, by hand or from the Ops quote builder.
function pipelineRecordQuote(body, auth) {
  requireRole(auth, 'OpsManager');
  _plEnsureCols();
  var monthly = _plNum(body.monthly), oneOff = _plNum(body.oneOff);
  if (!(monthly > 0) && !(oneOff > 0)) throw new Error('Enter the monthly fee or the one-off price');
  var lead = body.leadId ? getRowById('Leads', body.leadId) : null;
  var quote = body.quoteId ? getRowById('Quotes', body.quoteId) : null;
  if (!lead && quote && quote.leadId) lead = getRowById('Leads', quote.leadId);
  if (!lead && quote && quote.email) {
    lead = getTableRows('Leads').filter(function(l) { return _plAddr(l.email) === _plAddr(quote.email); })[0] || null;
  }
  if (!lead && !quote) throw new Error('Lead or quote not found');
  var sentAt = _plDate(body.sentAt) || new Date();
  var quoteId = _plRecordQuoteRow(lead, {
    monthly: monthly, oneOff: oneOff, hoursPerWeek: _plNum(body.hoursPerWeek), sentAt: sentAt,
    via: body.via || 'manual', to: body.toEmail || (lead && lead.email) || '', by: auth.userId,
    clientName: quote ? quote.clientName : ''
  }, quote ? quote.id : '');
  if (lead) {
    var upd = {
      quoteId: quoteId, quoteSentAt: sentAt.toISOString(), quoteMonthly: monthly || '',
      annualValue: monthly ? r2(monthly * 12) : oneOff, chaseStep: 0, replyWaiting: '',
      nextChaseAt: _plAddDays(sentAt, PL.CHASE_GAPS_DAYS[0]).toISOString(),
      lastOutboundAt: sentAt.toISOString(),
      pipelineNote: 'Quote ' + (monthly ? _plMoney(monthly) + '/mo' : _plMoney(oneOff) + ' one-off') + ' sent ' + _plShortDate(sentAt),
      updatedAt: new Date().toISOString(), updatedBy: auth.userId
    };
    if (['New', 'Contacted', 'Qualified', 'OutreachQueued', ''].indexOf(lead.status || '') !== -1) upd.status = 'QuoteSent';
    var byId = {}; byId[lead.id] = upd;
    _plBatchUpdate('Leads', byId);
    auditLog(auth.userId, 'QUOTE_RECORDED', 'Lead', lead.id, { status: lead.status }, upd);
  }
  try { CacheService.getScriptCache().remove('dash_' + auth.userId); } catch (e) {}
  return { ok: true, quoteId: quoteId, leadId: lead ? lead.id : '' };
}

// Called by sendQuote() after Ops itself emails a quote.
function _plOnOpsQuoteSent(q, toEmail, auth) {
  var monthly = _plNum(q.revenueMonthly);
  if (!(monthly > 0)) return;
  pipelineRecordQuote({ quoteId: q.id, leadId: q.leadId || '', monthly: monthly,
                        hoursPerWeek: q.hoursPerWeek, toEmail: toEmail, via: 'ops' }, auth);
}

// ── API: POST pipeline.chaseDraft ─────────────────────────────
// Writes the next chase into Gmail Drafts. Never sends.
function pipelineChaseDraft(body, auth) {
  requireRole(auth, 'OpsManager');
  validate(body, ['leadId'], 'ChaseDraft');
  var lead = getRowById('Leads', body.leadId);
  if (!lead) throw new Error('Lead not found');
  var email = _plAddr(lead.email);
  if (!_plValidEmail(email)) throw new Error('This lead has no usable customer email — chase by phone');

  var step = Math.min(parseInt(lead.chaseStep, 10) || 0, 2);
  // The Ops front-end retries a slow request; never write the same draft twice.
  var lastDraft = _plDate(lead.chaseDraftAt);
  if (lastDraft && Date.now() - lastDraft.getTime() < 10 * 60000)
    return { ok: true, existing: true, step: step + 1, to: email };
  var text = _plChaseText(lead, step);
  var opts = { name: 'Mike Kato' };
  try {
    var aliases = GmailApp.getAliases();
    var want = [_plAddr(lead.quoteFrom), 'office@askmiro.com'].filter(function(a) { return a && aliases.indexOf(a) !== -1; })[0];
    if (want) opts.from = want;
  } catch (e) {}

  var thread = null;
  try { if (lead.quoteThreadId) thread = GmailApp.getThreadById(lead.quoteThreadId); } catch (e) {}
  var subject = 'Your cleaning quote from AskMiro';
  if (thread) {
    var msgs = thread.getMessages();
    if (msgs.some(function(m) { return m.isDraft(); }))
      return { ok: true, existing: true, step: step + 1, message: 'A draft is already waiting in this thread' };
    subject = thread.getFirstMessageSubject() || subject;
    // Reply to the customer's own message when there is one: a reply to our
    // own last message would be addressed to AskMiro, not to them.
    var theirs = msgs.filter(function(m) { return _plAddr(m.getFrom()) === email; });
    if (theirs.length) {
      theirs[theirs.length - 1].createDraftReply(text, opts);
      _plMarkChaseDraft(lead.id);
      return { ok: true, step: step + 1, to: email, inThread: true };
    }
  }
  GmailApp.createDraft(email, /^re:/i.test(subject) ? subject : 'Re: ' + subject, text, opts);
  _plMarkChaseDraft(lead.id);
  return { ok: true, step: step + 1, to: email, inThread: false };
}
function _plMarkChaseDraft(leadId) {
  var byId = {}; byId[leadId] = { chaseDraftAt: new Date().toISOString() };
  _plBatchUpdate('Leads', byId);
}

// ── API: POST pipeline.snooze ─────────────────────────────────
function pipelineSnooze(body, auth) {
  requireRole(auth, 'OpsManager');
  validate(body, ['leadId'], 'Snooze');
  var days  = Math.min(Math.max(parseInt(body.days, 10) || 3, 1), 60);
  var until = _plAddDays(new Date(), days).toISOString();
  var byId  = {}; byId[body.leadId] = { chaseSnoozeUntil: until, nextChaseAt: until };
  _plBatchUpdate('Leads', byId);
  return { ok: true, until: until };
}

// ── API: POST pipeline.setup ──────────────────────────────────
// Adds the columns and installs the two-hourly background sync.
function pipelineSetup(body, auth) {
  requireRole(auth, 'Owner');
  var res = { ok: true, columns: _plEnsureCols(), trigger: '' };
  try {
    ScriptApp.getProjectTriggers()
      .filter(function(t) { return t.getHandlerFunction() === 'pipelineSyncTrigger'; })
      .forEach(function(t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('pipelineSyncTrigger').timeBased().everyHours(2).create();
    res.trigger = 'installed';
  } catch (e) {
    res.trigger = 'not installed: ' + e.message;
  }
  return res;
}
