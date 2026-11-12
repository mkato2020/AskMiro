// End-to-end test of gas/pipeline.gs against the real gas/Code.gs sheet helpers,
// with Google's services replaced by in-memory fakes.
// Run: node tests/gas/pipeline.sync.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ── fake Sheets ────────────────────────────────────────────────
class Tab {
  constructor(headers, rows) { this.grid = [headers.slice()].concat(rows.map((r) => headers.map((h) => r[h] === undefined ? '' : r[h]))); this.maxCols = headers.length; }
  getLastColumn() { return this.grid[0].length; }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(_after, n) { this.maxCols += n; }
  getDataRange() { return this.getRange(1, 1, this.grid.length, this.grid[0].length); }
  appendRow(vals) { this.grid.push(vals.slice()); }
  getRange(r, c, nr, nc) {
    const tab = this; nr = nr || 1; nc = nc || 1;
    return {
      getValues() { return tab.grid.slice(r - 1, r - 1 + nr).map((row) => { const o = []; for (let i = 0; i < nc; i++) o.push(row[c - 1 + i] === undefined ? '' : row[c - 1 + i]); return o; }); },
      setValues(v) {
        if (c - 1 + nc > tab.maxCols) throw new Error('range outside sheet dimensions');
        v.forEach((vals, i) => { const row = tab.grid[r - 1 + i]; vals.forEach((x, j) => { row[c - 1 + j] = x; }); });
        const w = Math.max.apply(null, tab.grid.map((x) => x.length));
        tab.grid.forEach((x) => { while (x.length < w) x.push(''); });
      }
    };
  }
  rows() { const h = this.grid[0]; return this.grid.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); }
  row(id) { return this.rows().find((r) => r.id === id); }
}

// ── fake Gmail ─────────────────────────────────────────────────
const drafts = [];
function msg(o) {
  return {
    getFrom: () => o.from, getTo: () => o.to || '', getCc: () => o.cc || '', getDate: () => new Date(o.at),
    getSubject: () => o.subject || '', getPlainBody: () => o.body || '', isDraft: () => !!o.draft,
    getHeader: (h) => (o.headers || {})[h] || '',
    createDraftReply: (text, opts) => { drafts.push({ kind: 'reply', to: o.from, text, opts }); }
  };
}
function thread(id, subject, msgs) {
  return { getId: () => id, getMessages: () => msgs.map(msg), getFirstMessageSubject: () => subject, _msgs: msgs };
}
let searches = 0;
function buildCtx(tabs, threads, nowIso) {
  const props = {};
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(nowIso); }
    static now() { return new RealDate(nowIso).getTime(); }
  }
  const ctx = {
    console, Date: FakeDate,
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => tabs[n] || null }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { newBlob() { throw new Error('no gzip in tests'); } },
    Logger: { log() {} },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create() {} }) }) }), deleteTrigger() {} },
    GmailApp: {
      search: (q) => { searches++; const m = /from:(\S+)/.exec(q); const e = m[1]; return threads.filter((t) => t._msgs.some((x) => (x.from + ' ' + (x.to || '')).toLowerCase().includes(e))); },
      getThreadById: (id) => threads.find((t) => t.getId() === id) || null,
      getAliases: () => ['office@askmiro.com', 'mike@askmiro.com', 'info@askmiro.com'],
      createDraft: (to, subject, text, opts) => { drafts.push({ kind: 'new', to, subject, text, opts }); }
    }
  };
  vm.createContext(ctx);
  ['Code.gs', 'pipeline.gs'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../../gas', f), 'utf8'), ctx, { filename: f }));
  return ctx;
}

const LEAD_H = ['id', 'contactName', 'companyName', 'email', 'phone', 'postcode', 'source', 'leadDirection', 'serviceType', 'status',
  'annualValue', 'notes', 'createdAt', 'threadId', 'outreachStatus', 'replyStatus', 'needsHumanAction', 'updatedAt', 'updatedBy'];
const QUOTE_H = ['id', 'leadId', 'source', 'clientName', 'email', 'hoursPerWeek', 'status', 'version', 'notes', 'revenueMonthly',
  'grossMarginPct', 'grossMarginGBP', 'directCost', 'createdAt', 'createdBy', 'intel_hoursPerWeek'];
const web = { source: 'Website Quote Form', status: 'New' };
const cold = { source: 'outbound', leadDirection: 'outbound', status: 'Contacted' };

function fixture() {
  const tabs = {
    Leads: new Tab(LEAD_H, [
      { id: 'L-THOMAS', contactName: 'Thomas', companyName: 'Thomas', email: 'nthomas1692@gmail.com', createdAt: '2026-11-11T02:58:20.000Z', ...web },
      { id: 'L-LAURA', contactName: 'Laura', companyName: 'Head Gear Films', email: 'laura@headgearfilms.com', createdAt: '2026-10-06T15:27:50.000Z', ...web },
      { id: 'L-DANIEL', contactName: 'Daniel Chaaban', companyName: 'Daniel Chaaban', email: 'daniel@chaaban.example', createdAt: '2026-10-07T10:00:00.000Z', ...web },
      { id: 'L-TEST', contactName: 'mike kato', companyName: 'Situka Media', email: 'someone@situka.com', createdAt: '2026-11-01T10:00:00.000Z', ...web },
      { id: 'L-BERK', contactName: 'Facilities Manager', companyName: 'Berkeley', email: 'fm@berkeley.example', createdAt: '2026-05-10T10:00:00.000Z', threadId: 'T-BERK', outreachStatus: 'FINAL_FOLLOW_UP', needsHumanAction: 'true', ...cold },
      { id: 'L-ALPACA', contactName: 'Office Manager', companyName: 'Alpaca', email: 'hello@alpaca.example', createdAt: '2026-05-10T10:00:00.000Z', threadId: 'T-ALP', outreachStatus: 'FINAL_FOLLOW_UP', replyStatus: 'UNCLASSIFIED_REPLY', ...cold },
      { id: 'L-QUIET', contactName: 'Branch Manager', companyName: 'Quiet Estates', email: 'info@quiet.example', createdAt: '2026-05-10T10:00:00.000Z', threadId: 'T-QUIET', outreachStatus: 'FINAL_FOLLOW_UP', ...cold },
      { id: 'L-KAPLAN', contactName: 'Facilities Manager', companyName: 'Kaplan', email: 'your.name@domain.com', threadId: 'T-K', outreachStatus: 'FINAL_FOLLOW_UP', ...cold },
      { id: 'L-WON', contactName: 'Ann', companyName: 'Won Ltd', email: 'ann@won.example', source: 'Website', status: 'Won' }
    ]),
    Quotes: new Tab(QUOTE_H, [
      { id: 'Q-THOMAS', leadId: 'L-THOMAS', source: 'web_form', clientName: 'Thomas', email: 'nthomas1692@gmail.com', hoursPerWeek: '2', status: 'Draft', version: 1, createdAt: '2026-11-11T02:58:21.000Z', createdBy: 'INTEL', intel_hoursPerWeek: '2' },
      { id: 'Q-LAURA', leadId: 'L-LAURA', source: 'web_form', clientName: 'Laura', email: 'laura@headgearfilms.com', hoursPerWeek: '67.5', status: 'Draft', version: 1, createdAt: '2026-10-06T15:27:51.000Z', createdBy: 'INTEL', intel_hoursPerWeek: '67.5' }
    ]),
    Settings: new Tab(['key', 'value'], [{ key: 'minMarginPct', value: '20' }, { key: 'llwRate', value: '13.85' }]),
    AuditLog: new Tab(['id', 'ts', 'userId', 'action', 'entityType', 'entityId', 'before', 'after'], [])
  };
  const threads = [
    thread('T-THOMAS', "Thanks for your quote request, Thomas — we'll be in touch shortly", [
      { from: 'AskMiro <info@askmiro.com>', to: 'nthomas1692@gmail.com', at: '2026-11-11T02:58:21Z', subject: "Thanks for your quote request, Thomas — we'll be in touch shortly", body: 'We have received your quote request.' },
      { from: 'KATO MIKE <mike@askmiro.com>', to: 'nthomas1692@gmail.com', at: '2026-11-12T08:00:00Z', subject: 'Re: Your quote request — price per visit, EC2M 7PY', body: 'Price per visit\n£54.00\n2 hours on site\nAt three visits per week: *£162.00* per week · *£702.00* per month · *£8,424.00* per year\nThis is an estimated price.' }
    ]),
    thread('T-LAURA-SELF', 'AskMiro Cleaning Proposal — Head Gear Films', [
      { from: 'office@askmiro.com', to: 'mkato.ug@gmail.com', at: '2026-10-07T23:11:47Z', subject: 'AskMiro Cleaning Proposal — Head Gear Films', body: 'Dear Head Gear Films laura@headgearfilms.com Monthly Fee £1,255.00' }
    ]),
    thread('T-LAURA', 'AskMiro Cleaning Proposal — Head Gear Films', [
      { from: 'AskMiro Cleaning Services <office@askmiro.com>', to: 'laura@headgearfilms.com', at: '2026-10-08T07:00:00Z', subject: 'AskMiro Cleaning Proposal — Head Gear Films', body: 'Cleaning Proposal\nMonthly Service Fee\n£1,255.00\n£15,060/year • 10 hrs/week\n£1,170/month\n£85/month' },
      { from: 'office@askmiro.com', to: 'laura@headgearfilms.com', at: '2026-11-11T12:00:00Z', subject: 'Re: AskMiro Cleaning Proposal', body: 'Hi Laura, following up on the quote of £1,255 a month', draft: true }
    ]),
    thread('T-BERK', 'Commercial cleaning for Berkeley', [
      { from: 'Mike Kato <mkato.ug@gmail.com>', to: 'fm@berkeley.example', at: '2026-05-14T09:00:00Z', subject: 'Commercial cleaning for Berkeley', body: 'Hello, we clean offices.' },
      { from: 'mkato.ug@gmail.com', to: 'info@askmiro.com', at: '2026-05-21T09:00:00Z', subject: 'Re: Commercial cleaning for Berkeley', body: 'Following up' },
      { from: 'Sam <fm@berkeley.example>', to: 'mike@askmiro.com', at: '2026-09-17T11:00:00Z', subject: 'RE: Commercial cleaning for Berkeley', body: 'Happy to introduce you to our FM lead.' }
    ]),
    thread('T-ALP', 'Commercial cleaning for Alpaca', [
      { from: 'mkato.ug@gmail.com', to: 'hello@alpaca.example', at: '2026-05-14T09:00:00Z', subject: 'Commercial cleaning for Alpaca', body: 'Hello' },
      { from: 'hello@alpaca.example', to: 'mike@askmiro.com', at: '2026-05-14T09:00:03Z', subject: 'Re: Commercial cleaning for Alpaca', body: 'Thanks, we will reply soon.' },
      { from: 'hello@alpaca.example', to: 'mike@askmiro.com', at: '2026-05-20T09:00:00Z', subject: 'We got your message', body: 'canned', headers: { 'Auto-Submitted': 'auto-replied' } }
    ]),
    thread('T-QUIET', 'Commercial cleaning for Quiet', [
      { from: 'mkato.ug@gmail.com', to: 'info@quiet.example', at: '2026-05-14T09:00:00Z', subject: 'Commercial cleaning for Quiet', body: 'Hello' },
      { from: 'mike@askmiro.com', to: 'mike@askmiro.com', at: '2026-06-01T09:00:00Z', subject: 'Re: Commercial cleaning for Quiet', body: 'Following up' }
    ])
  ];
  return { tabs, threads };
}

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ok  ' + name); }
const AUTH = { ok: true, userId: 'USER-1', role: 'Owner', sites: [] };

const { tabs, threads } = fixture();
const ctx = buildCtx(tabs, threads, '2026-11-12T09:00:00.000Z');

t('setup adds the missing columns, growing the sheet first', () => {
  const r = ctx.pipelineSetup({}, AUTH);
  assert.strictEqual(r.trigger, 'installed');
  assert.ok(r.columns.Leads.includes('nextChaseAt') && r.columns.Quotes.includes('sentAt'));
  assert.ok(tabs.Leads.grid[0].includes('pipelineSyncedAt'));
  assert.strictEqual(ctx.pipelineSetup({}, AUTH).columns.Leads.length, 0);   // idempotent
});

let first;
t('sync scans the live leads and skips placeholders, won deals and nothing else', () => {
  first = ctx.pipelineSync({});
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.errors, 0);
  assert.strictEqual(first.scanned, 7);       // Thomas, Laura, Daniel, test lead, Berkeley, Alpaca, Quiet
  assert.ok(!tabs.Leads.row('L-KAPLAN').pipelineSyncedAt);
  assert.ok(!tabs.Leads.row('L-WON').pipelineSyncedAt);
});

t('Thomas: quote found in Gmail → lead Quote Sent, quote row Sent with real figures', () => {
  const l = tabs.Leads.row('L-THOMAS');
  assert.strictEqual(l.status, 'QuoteSent');
  assert.strictEqual(l.quoteMonthly, 702);
  assert.strictEqual(l.annualValue, 8424);
  assert.strictEqual(l.quoteSentAt, '2026-11-12T08:00:00.000Z');
  assert.strictEqual(l.nextChaseAt, '2026-11-15T08:00:00.000Z');
  assert.strictEqual(l.quoteThreadId, 'T-THOMAS');
  assert.strictEqual(l.quoteFrom, 'mike@askmiro.com');
  assert.strictEqual(l.quoteId, 'Q-THOMAS');
  const q = tabs.Quotes.row('Q-THOMAS');
  assert.strictEqual(q.status, 'Sent');
  assert.strictEqual(q.revenueMonthly, 702);
  assert.strictEqual(q.hoursPerWeek, 6);
  // 6 h x 52/12 x 13.85 x 1.36 = 489.74 labour → 30.24% margin
  assert.strictEqual(q.directCost, 489.74);
  assert.strictEqual(q.grossMarginPct, 30.24);
  assert.strictEqual(q.sentVia, 'gmail');
});

t('Head Gear: quote found, self-addressed copy ignored, pending draft not counted as a chase', () => {
  const l = tabs.Leads.row('L-LAURA');
  assert.strictEqual(l.status, 'QuoteSent');
  assert.strictEqual(l.quoteMonthly, 1255);
  assert.strictEqual(l.annualValue, 15060);
  assert.strictEqual(l.chaseStep, 0);
  assert.strictEqual(l.nextChaseAt, '2026-10-11T07:00:00.000Z');
  const q = tabs.Quotes.row('Q-LAURA');
  assert.strictEqual(q.revenueMonthly, 1255);
  assert.strictEqual(q.hoursPerWeek, 10);
});

t('cold leads: a real reply waits, an auto-responder does not, self-addressed follow-ups do not count', () => {
  assert.strictEqual(tabs.Leads.row('L-BERK').replyWaiting, 'yes');
  assert.strictEqual(tabs.Leads.row('L-BERK').lastInboundAt, '2026-09-17T11:00:00.000Z');
  assert.strictEqual(tabs.Leads.row('L-BERK').status, 'Contacted');
  assert.strictEqual(tabs.Leads.row('L-ALPACA').replyWaiting, '');
  assert.strictEqual(tabs.Leads.row('L-QUIET').lastOutboundAt, '2026-05-14T09:00:00.000Z');
});

t('stage changes are reported and audited', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(first.stageChanges)).map((c) => c.id + ':' + c.to).sort(), ['L-LAURA:QuoteSent', 'L-THOMAS:QuoteSent']);
  assert.strictEqual(tabs.AuditLog.rows().filter((r) => r.action === 'STAGE_CHANGE').length, 2);
});

t('a second sync straight after does no Gmail work and changes nothing', () => {
  const before = JSON.stringify(tabs.Leads.grid) + JSON.stringify(tabs.Quotes.grid);
  const s = searches;
  const r = ctx.pipelineSync({});
  assert.strictEqual(r.scanned, 0);
  assert.strictEqual(searches, s);
  assert.strictEqual(JSON.stringify(tabs.Leads.grid) + JSON.stringify(tabs.Quotes.grid), before);
});

let today;
t('today: the worklist', () => {
  today = JSON.parse(JSON.stringify(ctx.getPipelineToday({}, AUTH)));
  assert.deepStrictEqual(today.chase.map((x) => x.id), ['L-LAURA']);
  assert.deepStrictEqual(today.awaiting.map((x) => x.id), ['L-THOMAS']);
  assert.deepStrictEqual(today.unanswered.map((x) => x.id), ['L-DANIEL']);   // test lead filtered out
  assert.deepStrictEqual(today.oldReplies.map((x) => x.id), ['L-BERK']);     // Sep reply, never answered
  assert.deepStrictEqual(today.reply, []);
  assert.strictEqual(today.totals.quotesOut, 2);
  assert.strictEqual(today.totals.pipelineMonthly, 1957);
  assert.strictEqual(today.totals.pipelineAnnual, 23484);
});

t('chase draft: explicit recipient when the customer has not written in the thread; never sends', () => {
  drafts.length = 0;
  let r = ctx.pipelineChaseDraft({ leadId: 'L-LAURA' }, AUTH);
  assert.strictEqual(r.existing, true);                 // the leads session's draft is already in the thread
  assert.strictEqual(drafts.length, 0);
  r = ctx.pipelineChaseDraft({ leadId: 'L-THOMAS' }, AUTH);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(drafts.length, 1);
  assert.strictEqual(drafts[0].kind, 'new');
  assert.strictEqual(drafts[0].to, 'nthomas1692@gmail.com');
  assert.ok(/^Re: /.test(drafts[0].subject));
  assert.strictEqual(drafts[0].opts.from, 'mike@askmiro.com');   // same address the quote came from
  assert.ok(drafts[0].text.startsWith('Hi Thomas,') && drafts[0].text.includes('£702 a month'));
  assert.ok(tabs.Leads.row('L-THOMAS').chaseDraftAt);
  assert.throws(() => ctx.pipelineChaseDraft({ leadId: 'L-KAPLAN' }, AUTH), /no usable customer email/);
});

t('quote logged by hand moves the lead and starts the clock', () => {
  const r = ctx.pipelineRecordQuote({ leadId: 'L-DANIEL', monthly: '450', hoursPerWeek: '4', sentAt: '2026-11-12T09:00:00.000Z' }, AUTH);
  const l = tabs.Leads.row('L-DANIEL');
  assert.strictEqual(l.status, 'QuoteSent');
  assert.strictEqual(l.annualValue, 5400);
  assert.strictEqual(l.nextChaseAt, '2026-11-15T09:00:00.000Z');
  const q = tabs.Quotes.row(r.quoteId);
  assert.strictEqual(q.status, 'Sent');
  assert.strictEqual(q.revenueMonthly, 450);
  assert.strictEqual(q.clientName, 'Daniel Chaaban');
  assert.throws(() => ctx.pipelineRecordQuote({ leadId: 'L-DANIEL' }, AUTH), /monthly fee/);
});

t('sending from the Ops quote builder records the same way', () => {
  tabs.Quotes.appendRow(tabs.Quotes.grid[0].map((h) => ({ id: 'Q-OPS', leadId: 'L-BERK', clientName: 'Berkeley', email: 'fm@berkeley.example', status: 'Draft', revenueMonthly: 900, hoursPerWeek: 8 })[h] ?? ''));
  ctx.invalidateCache('Quotes');
  ctx._plOnOpsQuoteSent(ctx.getRowById('Quotes', 'Q-OPS'), 'fm@berkeley.example', AUTH);
  assert.strictEqual(tabs.Leads.row('L-BERK').status, 'QuoteSent');
  assert.strictEqual(tabs.Leads.row('L-BERK').replyWaiting, '');
  assert.strictEqual(tabs.Quotes.row('Q-OPS').sentVia, 'ops');
});

t('snooze, and roles', () => {
  ctx.pipelineSnooze({ leadId: 'L-LAURA', days: 5 }, AUTH);
  assert.strictEqual(tabs.Leads.row('L-LAURA').nextChaseAt, '2026-11-17T09:00:00.000Z');
  assert.throws(() => ctx.getPipelineToday({}, { role: 'Cleaner', sites: [] }), /Insufficient permissions/);
  assert.throws(() => ctx.pipelineSetup({}, { role: 'OpsManager', sites: [] }), /Insufficient permissions/);
});

t('router knows the new actions', () => {
  assert.strictEqual(ctx.routeGet('pipeline.today', {}, AUTH).ok, true);
  assert.strictEqual(ctx.routePost('pipeline.sync', {}, AUTH).ok, true);
  assert.ok(/Unknown action/.test(ctx.routePost('pipeline.nope', {}, AUTH).error));
});

console.log('\n' + n + ' passed');
