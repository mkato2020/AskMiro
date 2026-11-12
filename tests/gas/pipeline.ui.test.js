// Renders ops/modules/pipeline.js with a fake page and a fake API.
// Run: node tests/gas/pipeline.ui.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const els = {};
const el = (id) => (els[id] = els[id] || { id, innerHTML: '', value: '', disabled: false, textContent: '' });
const calls = [];
const toasts = [];
const TODAY = {
  ok: true, syncedAt: new Date().toISOString(),
  reply: [{ id: 'L1', company: 'Berkeley <b>', contact: 'Sam', email: 's@b.example', lastInboundAt: '2026-11-11T11:00:00Z', quoteMonthly: 0, threadId: 'abc123' }],
  oldReplies: [{ id: 'L5', company: 'Old Co', contact: '', email: 'o@old.example', lastInboundAt: '2026-05-01T11:00:00Z', threadId: '' }],
  unanswered: [{ id: 'L2', company: 'Daniel', contact: 'Daniel', email: 'd@x.example', phone: '07000 000000', service: 'Office', createdAt: '2026-11-12T07:00:00Z', threadId: '' }],
  chase: [{ id: 'L3', company: 'Head Gear Films', contact: 'Laura', note: 'Quote £1,255/mo sent 8 Oct · chase 1 due 11 Oct', chaseStep: 0, chaseDraftAt: '', threadId: 't3', phone: '' }],
  stalled: [{ id: 'L6', company: 'Stalled Ltd', contact: 'Jo', note: '', phone: '020 7000 0000', threadId: '' }],
  awaiting: [{ id: 'L4', company: 'Thomas', contact: 'Thomas', note: 'Quote £702/mo sent 12 Nov · chase 1 due 15 Nov', threadId: 't4' }],
  totals: { quotesOut: 2, pipelineMonthly: 1957, pipelineAnnual: 23484 }
};
const win = {
  confirm: () => true, console,
  document: { getElementById: (id) => (id === 'missing' ? null : el(id)) },
  location: { hash: '#/dashboard' },
  UI: {
    fmt: (n) => '£' + Math.round(n).toLocaleString('en-GB'), toast: (m, t) => toasts.push([m, t || 'g']),
    openModal: (h) => { el('modal').innerHTML = h; }, closeModal() {}, gv: (id) => el(id).value
  },
  API: {
    get: async (a) => { calls.push(['get', a]); return JSON.parse(JSON.stringify(TODAY)); },
    post: async (a, b) => { calls.push(['post', a, b]); return a === 'pipeline.sync' ? { ok: true, remaining: 0, stageChanges: [{ name: 'Thomas', to: 'QuoteSent' }] } : { ok: true, step: 1, to: 'laura@x.example' }; },
    invalidate() {}
  }
};
win.window = win;
vm.createContext(win);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../ops/modules/pipeline.js'), 'utf8'), win, { filename: 'pipeline.js' });

(async () => {
  await win.Pipeline.mount('pl-today');
  const h = el('pl-today').innerHTML;
  assert.ok(!/undefined|NaN|\[object/.test(h), 'no undefined/NaN in the panel');
  assert.ok(h.includes('2 quotes out') && h.includes('£1,957/mo') && h.includes('£23,484/yr'));
  ['Reply waiting', 'Enquiries not answered', 'Chase due', 'Chased three times, no reply', 'Waiting on the customer', 'Older replies that were never answered (1)']
    .forEach((s) => assert.ok(h.includes(s), s));
  assert.ok(h.includes('Berkeley &lt;b&gt;') && !h.includes('Berkeley <b>'), 'names are escaped');
  assert.ok(h.includes('https://mail.google.com/mail/#all/abc123'));
  assert.ok(h.includes("Pipeline.draftChase('L3')") && h.includes('Draft chase 1'));
  assert.ok(h.includes('href="tel:02070000000"'));
  assert.ok(!calls.some((c) => c[1] === 'pipeline.sync'), 'fresh data: no automatic mailbox read');

  await win.Pipeline.draftChase('L3');
  assert.strictEqual(JSON.stringify(calls.filter((c) => c[0] === 'post').pop().slice(1)), JSON.stringify(['pipeline.chaseDraft', { leadId: 'L3' }]));
  assert.ok(/Gmail Drafts/.test(toasts.pop()[0]));

  await win.Pipeline.sync(true);
  assert.ok(/Thomas → QuoteSent/.test(toasts.pop()[0]));

  win.Pipeline.openLog('L2', '');
  assert.ok(el('modal').innerHTML.includes('plq-monthly'));
  el('plq-lead').value = 'L2'; el('plq-monthly').value = ''; el('plq-oneoff').value = '';
  await win.Pipeline.saveLog();
  assert.strictEqual(toasts.pop()[1], 'r');                      // nothing entered → refused
  el('plq-monthly').value = '702'; el('plq-hours').value = '6'; el('plq-date').value = '2026-11-12';
  await win.Pipeline.saveLog();
  const rec = calls.filter((c) => c[1] === 'quote.record').pop()[2];
  assert.strictEqual(rec.leadId, 'L2'); assert.strictEqual(rec.monthly, 702); assert.strictEqual(rec.sentAt, '2026-11-12T09:00:00.000Z');

  // backend not deployed yet → dashboard still loads, panel stays empty
  win.API.get = async () => ({ error: 'Unknown action: pipeline.today' });
  await win.Pipeline.mount('pl-empty');
  assert.strictEqual(el('pl-empty').innerHTML, '');

  // empty worklist
  win.API.get = async () => ({ ok: true, syncedAt: new Date().toISOString(), reply: [], oldReplies: [], unanswered: [], chase: [], stalled: [], awaiting: [], totals: { quotesOut: 0, pipelineMonthly: 0, pipelineAnnual: 0 } });
  await win.Pipeline.mount('pl-zero');
  assert.ok(el('pl-zero').innerHTML.includes('Nothing needs you right now'));
  console.log('  ok  worklist renders, escapes, acts and degrades\n\n1 passed');
})().catch((e) => { console.error(e); process.exit(1); });
