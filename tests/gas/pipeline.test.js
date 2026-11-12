// Unit tests for the pure helpers in gas/pipeline.gs.
// Run: node tests/gas/pipeline.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = { CFG: { ONCOST_PCT: 0.36, LLW_RATE: 13.85 }, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../gas/pipeline.gs'), 'utf8') +
  '\nthis.PL = PL;', ctx, { filename: 'pipeline.gs' });

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ok  ' + name); }
const D = (s) => new Date(s);

// Text of the two real quotes, as Gmail's plain-text part carries them.
const HEAD_GEAR = `Cleaning Proposal
QUOTE-MUYPRL0WPDQ4

Dear Head Gear Films,
Monthly Service Fee
£1,255.00
£15,060/year • 10 hrs/week
Proposal Summary
Service Hours 10 hrs/week
Monthly Fee £1,255.00
Annual Value £15,060
*Estimated price breakdown (excluding VAT)*
Daily office cleaning, Monday to Friday, 2 hours per visit — £1,170/month
Internal window and glass cleaning, monthly — £85/month
The £85 covers internal glass; external ground-floor glass would be priced separately.
Invoiced monthly in advance, 14-day payment terms.`;

const THOMAS = `Hi Thomas,

Below is a written price per visit and exactly what is included.
Price per visit
£54.00
2 hours on site · one cleaner · evenings after 6pm · excluding VAT
At three visits per week: *£162.00* per week · *£702.00* per month ·
*£8,424.00* per year
If you would prefer us to supply everything, add £25.00 per month.
This is an *estimated price* based on your enquiry.

On Wed, Nov 11, 2026 02:58 AM, AskMiro <info@askmiro.com> wrote:

> We've received your quote request. A previous price of £9,999 per month.
`;

t('reads the Head Gear monthly fee as the total, not a line item', () => {
  const q = ctx._plParseQuote(HEAD_GEAR);
  assert.strictEqual(q.monthly, 1255);
  assert.strictEqual(q.hoursPerWeek, 10);
  assert.strictEqual(q.isQuote, true);
});

t('reads the Thomas quote through bold asterisks and ignores quoted history', () => {
  const q = ctx._plParseQuote(THOMAS);
  assert.strictEqual(q.monthly, 702);
  assert.strictEqual(q.hoursPerWeek, 6);   // three visits x 2 hours on site
  assert.strictEqual(q.isQuote, true);
});

t('one-off price when there is no monthly figure', () => {
  const q = ctx._plParseQuote('Thanks for the photos. Our quote for the deep clean: total price £480 for the full clean, done in one day.');
  assert.strictEqual(q.monthly, 0);
  assert.strictEqual(q.oneOff, 480);
  assert.strictEqual(q.isQuote, true);
});

t('weekly and annual figures convert to monthly', () => {
  assert.strictEqual(ctx._plParseQuote('Our price is £120 per week for the quote.').monthly, 520);
  assert.strictEqual(ctx._plParseQuote('Proposal: £12,000 per year.').monthly, 1000);
});

t('an hourly rate or a plain message is not a quote', () => {
  assert.strictEqual(ctx._plParseQuote('We charge £27.00/hr. When can I visit?').isQuote, false);
  assert.strictEqual(ctx._plParseQuote('Just checking you got my email. Mike').isQuote, false);
});

t('addresses: own, placeholder, valid', () => {
  assert.strictEqual(ctx._plAddr('Laura <Laura@HeadGearFilms.com>'), 'laura@headgearfilms.com');
  assert.strictEqual(ctx._plIsOwn('AskMiro Ops <mkato.ug@gmail.com>'), true);
  assert.strictEqual(ctx._plIsOwn('mike@askmiro.com'), true);
  assert.strictEqual(ctx._plIsOwn('mike@askmiro.com.evil.io'), false);
  assert.strictEqual(ctx._plValidEmail('your.name@domain.com'), false);
  assert.strictEqual(ctx._plValidEmail('youraddress@domain.com'), false);
  assert.strictEqual(ctx._plValidEmail('info@askmiro.com'), false);
  assert.strictEqual(ctx._plValidEmail('nthomas1692@gmail.com'), true);
});

const quote = (at, monthly) => ({ dir: 'out', at: D(at), auto: false, threadId: 'T1', from: 'mike@askmiro.com',
  quote: { monthly, oneOff: 0, hoursPerWeek: 0, isQuote: true } });
const out = (at) => ({ dir: 'out', at: D(at), auto: false, quote: { monthly: 0, oneOff: 0, isQuote: false } });
const inb = (at, auto) => ({ dir: 'in', at: D(at), auto: !!auto, quote: null });
const ack = (at) => ({ dir: 'out', at: D(at), auto: true, quote: null });

t('Thomas: auto-ack then quote → QuoteSent, first chase due on day 3', () => {
  const d = ctx._plDerive([ack('2026-11-11T02:58:21Z'), quote('2026-11-12T08:00:00Z', 702)], D('2026-11-12T09:00:00Z'));
  assert.strictEqual(d.quote.quote.monthly, 702);
  assert.strictEqual(d.chaseStep, 0);
  assert.strictEqual(d.replyWaiting, false);
  assert.strictEqual(d.nextChaseAt.toISOString(), '2026-11-15T08:00:00.000Z');
  assert.strictEqual(ctx._plNextStage('New', d), 'QuoteSent');
  assert.strictEqual(ctx._plNote(d), 'Quote £702/mo sent 12 Nov · chase 1 due 15 Nov');
});

t('an auto-ack alone leaves the lead New and unanswered', () => {
  const d = ctx._plDerive([ack('2026-11-11T02:58:21Z')], D('2026-11-12T09:00:00Z'));
  assert.strictEqual(d.lastOut, null);
  assert.strictEqual(ctx._plNextStage('New', d), 'New');
});

t('chases land on day 3, 7 and 14, then stop', () => {
  const q = quote('2026-10-08T07:00:00Z', 1255);
  let d = ctx._plDerive([q, out('2026-10-11T09:00:00Z')], D('2026-10-12T00:00:00Z'));
  assert.strictEqual(d.chaseStep, 1);
  assert.strictEqual(d.nextChaseAt.toISOString(), '2026-10-15T09:00:00.000Z');
  d = ctx._plDerive([q, out('2026-10-11T09:00:00Z'), out('2026-10-15T09:00:00Z')], D('2026-10-16T00:00:00Z'));
  assert.strictEqual(d.chaseStep, 2);
  assert.strictEqual(d.nextChaseAt.toISOString(), '2026-10-22T09:00:00.000Z');
  d = ctx._plDerive([q, out('2026-10-11T09:00:00Z'), out('2026-10-15T09:00:00Z'), out('2026-10-22T09:00:00Z')], D('2026-10-23T00:00:00Z'));
  assert.strictEqual(d.chaseStep, 3);
  assert.strictEqual(d.nextChaseAt, null);
  assert.ok(/call or close/.test(ctx._plNote(d)));
});

t('a chase that repeats the price is not a new quote; a changed price is', () => {
  let d = ctx._plDerive([quote('2026-10-08T07:00:00Z', 1255), quote('2026-10-11T09:00:00Z', 1255)], D('2026-10-12T00:00:00Z'));
  assert.strictEqual(d.quote.at.toISOString(), '2026-10-08T07:00:00.000Z');
  assert.strictEqual(d.chaseStep, 1);
  d = ctx._plDerive([quote('2026-10-08T07:00:00Z', 1255), quote('2026-10-11T09:00:00Z', 1100)], D('2026-10-12T00:00:00Z'));
  assert.strictEqual(d.quote.quote.monthly, 1100);
  assert.strictEqual(d.chaseStep, 0);
});

t('a customer reply stops the chase; an auto-responder does not', () => {
  const q = quote('2026-10-08T07:00:00Z', 1255);
  let d = ctx._plDerive([q, inb('2026-10-09T10:00:00Z')], D('2026-10-12T00:00:00Z'));
  assert.strictEqual(d.replyWaiting, true);
  assert.strictEqual(d.nextChaseAt, null);
  assert.strictEqual(ctx._plNote(d), 'Reply waiting since 9 Oct');
  d = ctx._plDerive([q, inb('2026-10-08T07:00:03Z', true)], D('2026-10-12T00:00:00Z'));
  assert.strictEqual(d.replyWaiting, false);
  assert.ok(d.nextChaseAt);
  // answered → no longer waiting, and the answer counts as contact
  d = ctx._plDerive([q, inb('2026-10-09T10:00:00Z'), out('2026-10-09T12:00:00Z')], D('2026-10-12T00:00:00Z'));
  assert.strictEqual(d.replyWaiting, false);
});

t('stage never moves backwards', () => {
  const d = ctx._plDerive([quote('2026-10-08T07:00:00Z', 1255)], D('2026-10-12T00:00:00Z'));
  ['Negotiating', 'Won', 'Lost'].forEach((s) => assert.strictEqual(ctx._plNextStage(s, d), s));
  const c = ctx._plDerive([out('2026-10-08T07:00:00Z')], D('2026-10-12T00:00:00Z'));
  assert.strictEqual(ctx._plNextStage('New', c), 'Contacted');
  assert.strictEqual(ctx._plNextStage('Qualified', c), 'Qualified');
});

t('snooze pushes the next chase out', () => {
  const d = ctx._plDerive([quote('2026-10-08T07:00:00Z', 1255)], D('2026-10-09T00:00:00Z'), '2026-10-20T00:00:00.000Z');
  assert.strictEqual(d.nextChaseAt.toISOString(), '2026-10-20T00:00:00.000Z');
});

t('chase text: real first name, never a job title; price included', () => {
  const a = ctx._plChaseText({ contactName: 'laura smith', quoteMonthly: '1255', quoteSentAt: '2026-10-08T07:00:00Z' }, 0);
  assert.ok(a.startsWith('Hi Laura,'));
  assert.ok(a.includes('£1,255 a month') && a.includes('8 Oct'));
  const b = ctx._plChaseText({ contactName: 'Facilities Manager or Office Manager', quoteMonthly: '' }, 2);
  assert.ok(b.startsWith('Hi there,'));
  assert.ok(!/£/.test(b));
  [0, 1, 2].forEach((s) => assert.ok(!/public liability|£\d+M/i.test(ctx._plChaseText({ contactName: 'Tom' }, s))));
});

t('on-costs follow the live Admin setting', () => {
  assert.strictEqual(ctx._plOncost({ oncostsPct: '36', oncostPct: '0.22' }), 0.36);
  assert.strictEqual(ctx._plOncost({ oncostPct: '0.22' }), 0.22);
  assert.strictEqual(ctx._plOncost({}), 0.36);
});

t('auto-reply subjects', () => {
  ['Automatic reply: Cleaning', 'Out of Office', 'Thank you for your email', 'RE: Auto-Reply', 'Undeliverable: hello']
    .forEach((s) => assert.ok(ctx.PL.AUTO_SUBJECT_RE.test(s), s));
  ['Re: Your quote request — price per visit, EC2M 7PY', 'Cleaning quote', 'Thanks Mike, Tuesday works']
    .forEach((s) => assert.ok(!ctx.PL.AUTO_SUBJECT_RE.test(s), s));
  assert.ok(!ctx.PL.ACK_SUBJECT_RE.test('Re: Your quote request — price per visit, EC2M 7PY'));
  assert.ok(ctx.PL.ACK_SUBJECT_RE.test("Thanks for your quote request, Thomas — we'll be in touch shortly"));
});

console.log('\n' + n + ' passed');
