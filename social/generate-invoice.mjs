#!/usr/bin/env node
/**
 * AskMiro — generate-invoice.mjs
 * Generate a branded HTML + PDF invoice, then print the send command.
 *
 * Usage:
 *   node generate-invoice.mjs \
 *     --ref       AM-EOT-0408        \  invoice reference
 *     --name      "Tiana Tasevska"   \  client name
 *     --email     "tiana@example.com"\  client email (for send command)
 *     --service   "End of Tenancy Clean" \
 *     --date      "20 April 2026"    \  service date
 *     --address   "301 Lumiere Apartments, SW11 1AD" \
 *     --amount    220                \  NET amount £ (no VAT for residential)
 *     --vat       0                  \  VAT % (default 0 for residential one-off)
 *     --due       "on completion"    \  payment due (default: on completion)
 *     --notes     "Access via concierge" \  optional notes
 *     --open                         \  open HTML in browser when done
 *
 *  Outputs:
 *    output/invoice-{ref}.html
 *    output/invoice-{ref}.pdf   (requires Puppeteer via CNC_MODULES env var)
 *
 *  After generation, the script prints the exact send command to run.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env ─────────────────────────────────────────────────────────────────
function loadEnv() {
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '../social/.env'),
    path.join(__dirname, '../.env'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
    break;
  }
}
loadEnv();

const log = {
  step:  (m) => console.log(`  ✦ ${m}`),
  ok:    (m) => console.log(`  ✅ ${m}`),
  warn:  (m) => console.log(`  ⚠️  ${m}`),
  error: (m) => console.log(`  ❌ ${m}`),
  info:  (m) => console.log(`  ℹ️  ${m}`),
  cmd:   (m) => console.log(`\n  📋 ${m}`),
  code:  (m) => console.log(`     \x1b[36m${m}\x1b[0m`),
};

// ── Arg parser ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { vat: 0, due: 'on completion' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ref')     { args.ref     = argv[++i]; continue; }
    if (a === '--name')    { args.name    = argv[++i]; continue; }
    if (a === '--email')   { args.email   = argv[++i]; continue; }
    if (a === '--service') { args.service = argv[++i]; continue; }
    if (a === '--date')    { args.date    = argv[++i]; continue; }
    if (a === '--address') { args.address = argv[++i]; continue; }
    if (a === '--amount')  { args.amount  = parseFloat(argv[++i]); continue; }
    if (a === '--vat')     { args.vat     = parseFloat(argv[++i]); continue; }
    if (a === '--due')     { args.due     = argv[++i]; continue; }
    if (a === '--notes')     { args.notes     = argv[++i]; continue; }
    if (a === '--open')      { args.open      = true; continue; }
    if (a === '--output')    { args.outputDir = argv[++i]; continue; }
    if (a === '--vatNumber') { args.vatNumber = argv[++i]; continue; }
    if (a === '--paymentLink') { args.paymentLink = argv[++i]; continue; }
    if (a === '--jobRef')      { args.jobRef      = argv[++i]; continue; }
    if (a === '--clientCity')  { args.clientCity  = argv[++i]; continue; }
  }
  return args;
}

// ── Invoice HTML builder ──────────────────────────────────────────────────────
function buildInvoiceHtml(d) {
  const net     = d.amount || 0;
  const vatRate = d.vat    || 0;
  const vatAmt  = net * vatRate / 100;
  const total   = net + vatAmt;
  const fmtGBP  = n => `£${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const issued  = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const lineItems = [{ desc: d.service || 'Cleaning Services', detail: d.address || '', amount: net }];

  const rows = lineItems.map(item => `
    <tr>
      <td class="td-desc">
        <div class="item-name">${item.desc}</div>
        ${item.detail ? `<div class="item-sub">${item.detail}</div>` : ''}
      </td>
      <td class="td-num">1</td>
      <td class="td-num">${fmtGBP(item.amount)}</td>
      <td class="td-amt">${fmtGBP(item.amount)}</td>
    </tr>`).join('');

  const vatRow = vatRate > 0 ? `
    <tr class="sub-row"><td colspan="3" class="sub-lbl">Subtotal</td><td class="sub-val">${fmtGBP(net)}</td></tr>
    <tr class="sub-row"><td colspan="3" class="sub-lbl">VAT (${vatRate}%)</td><td class="sub-val">${fmtGBP(vatAmt)}</td></tr>` : `
    <tr class="sub-row"><td colspan="3" class="sub-lbl" style="color:#94A3B8;font-size:11px">Not VAT registered — exempt below threshold</td><td class="sub-val" style="color:#94A3B8;font-size:11px">£0.00</td></tr>`;

  const notesHtml = d.notes ? `
  <tr><td colspan="4" style="padding:0 0 0 0">
    <div style="background:#F8FAFC;border-top:1px solid #F1F5F9;padding:10px 16px">
      <span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#94A3B8">Notes: </span>
      <span style="font-size:12px;color:#475569">${d.notes}</span>
    </div>
  </td></tr>` : '';

  // Escape helper for safe URL display
  const payLink   = d.paymentLink || '';
  const payHost   = payLink ? payLink.replace(/^https?:\/\//i, '').replace(/\/$/, '') : '';
  const jobRef    = d.jobRef || d.ref;
  const clientCity= d.clientCity || 'London, United Kingdom';
  const dueLabel  = (d.due || 'on completion');
  const dueDisplay= /completion/i.test(dueLabel) ? 'Upon Completion' : dueLabel;

  const itemRowsHtml = lineItems.map(item => `
      <div class="line-item">
        <div>
          <div class="item-name">${item.desc}</div>
          ${item.detail ? `<div class="item-desc">${item.detail}</div>` : ''}
        </div>
        <div class="item-qty">1</div>
        <div class="item-rate">${net.toFixed(2)}</div>
        <div class="item-total">${net.toFixed(2)}</div>
      </div>`).join('');

  const payCtaHtml = payLink ? `
  <!-- PAY NOW CTA -->
  <div class="pay-cta">
    <span class="pay-cta-label">Pay Securely Online</span>
    <div class="pay-cta-amount">${fmtGBP(total)}</div>
    <a href="${payLink}" class="pay-btn" target="_blank" rel="noopener">Pay Now via Tide</a>
    <div class="pay-cta-note">
      Secure card payment processed via Tide.<br>
      Link: <a href="${payLink}" target="_blank" rel="noopener">${payHost}</a>
    </div>
  </div>` : '';

  const notesBlock = d.notes ? `
  <!-- NOTES -->
  <div class="notes">
    <strong>Notes</strong>
    ${d.notes}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AskMiro — Invoice ${d.ref}${d.name ? ` — ${d.name}` : ''}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    background: #060D1A;
    padding: 28px 20px;
    min-height: 100vh;
    color: #0A1628;
  }

  .page {
    background: #FFFFFF;
    max-width: 760px;
    margin: 0 auto;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 20px 80px rgba(0,0,0,0.5);
  }

  /* HEADER */
  .header {
    background: #0A1628;
    padding: 28px 36px 24px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #14B8A6;
  }
  .brand h1 {
    font-size: 24px;
    font-weight: 900;
    color: #FFFFFF;
    letter-spacing: -0.4px;
  }
  .brand h1 span { color: #14B8A6; }
  .brand p {
    font-size: 10px;
    color: rgba(255,255,255,0.5);
    margin-top: 4px;
    line-height: 1.6;
  }
  .inv-meta { text-align: right; }
  .inv-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: rgba(20,184,166,0.8);
    display: block;
    margin-bottom: 4px;
  }
  .inv-number {
    font-size: 24px;
    font-weight: 900;
    color: #FFFFFF;
    letter-spacing: -0.5px;
  }
  .inv-date {
    font-size: 10px;
    color: rgba(255,255,255,0.5);
    margin-top: 4px;
    line-height: 1.6;
  }

  /* PARTIES */
  .parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border-bottom: 1px solid #EEF3F5;
  }
  .party { padding: 22px 36px; }
  .party:first-child { border-right: 1px solid #EEF3F5; }
  .party-label {
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #14B8A6;
    margin-bottom: 10px;
    display: block;
  }
  .party h3 {
    font-size: 15px;
    font-weight: 800;
    color: #0A1628;
    margin-bottom: 5px;
  }
  .party p {
    font-size: 11px;
    color: #555;
    line-height: 1.7;
  }

  /* STATUS STRIP */
  .status-strip {
    padding: 12px 36px;
    background: #F5FEFF;
    border-bottom: 1px solid #D4EEE9;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: rgba(20,184,166,0.12);
    border: 1px solid rgba(20,184,166,0.35);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 10px;
    font-weight: 700;
    color: #0D9182;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .status-badge::before {
    content: '';
    width: 7px;
    height: 7px;
    background: #14B8A6;
    border-radius: 50%;
  }
  .status-strip .inv-ref { font-size: 10px; color: #888; }
  .status-strip .inv-ref strong { color: #0A1628; }

  /* LINE ITEMS */
  .items { padding: 24px 36px 0; }
  .items-header {
    display: grid;
    grid-template-columns: 1fr 60px 90px 90px;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 2px solid #0A1628;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #0A1628;
  }
  .items-header .ta-right { text-align: right; }
  .line-item {
    display: grid;
    grid-template-columns: 1fr 60px 90px 90px;
    gap: 8px;
    padding: 12px 0;
    border-bottom: 1px solid #EEF3F5;
    align-items: start;
  }
  .line-item:last-child { border-bottom: none; }
  .item-name { font-size: 13px; font-weight: 600; color: #0A1628; }
  .item-desc { font-size: 10px; color: #888; margin-top: 3px; line-height: 1.5; }
  .item-qty, .item-rate, .item-total { font-size: 13px; text-align: right; padding-top: 1px; }
  .item-qty { color: #444; }
  .item-rate { color: #444; }
  .item-total { color: #0A1628; font-weight: 700; }

  /* TOTALS */
  .totals { padding: 16px 36px 24px; }
  .totals-inner { margin-left: auto; width: 280px; }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 12px;
    color: #555;
    border-bottom: 1px solid #EEF3F5;
  }
  .totals-row:last-child { border-bottom: none; }
  .totals-row.total {
    font-size: 18px;
    font-weight: 800;
    color: #0A1628;
    padding: 12px 0 6px;
    border-top: 2px solid #0A1628;
    border-bottom: none;
    margin-top: 4px;
  }
  .totals-row.total .amount { color: #14B8A6; }

  /* PAY NOW CTA */
  .pay-cta {
    background: linear-gradient(135deg, #14B8A6 0%, #0D9182 100%);
    padding: 28px 36px;
    text-align: center;
  }
  .pay-cta-label {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.75);
    margin-bottom: 8px;
    display: block;
  }
  .pay-cta-amount {
    font-size: 36px;
    font-weight: 900;
    color: #FFFFFF;
    letter-spacing: -1px;
    margin-bottom: 14px;
  }
  .pay-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #FFFFFF;
    color: #0A1628;
    font-size: 15px;
    font-weight: 800;
    padding: 14px 36px;
    border-radius: 10px;
    text-decoration: none;
    letter-spacing: 0.3px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.2);
  }
  .pay-btn::after { content: '→'; font-size: 18px; font-weight: 700; }
  .pay-cta-note {
    font-size: 10px;
    color: rgba(255,255,255,0.7);
    margin-top: 10px;
    line-height: 1.5;
  }
  .pay-cta-note a { color: #FFFFFF; text-decoration: underline; }

  /* PAYMENT INFO */
  .payment {
    background: #F8FFFE;
    border-top: 1px solid #D4EEE9;
    padding: 20px 36px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  .pay-block-label {
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #14B8A6;
    margin-bottom: 10px;
    display: block;
  }
  .pay-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #444;
    margin-bottom: 5px;
    line-height: 1.5;
    gap: 10px;
  }
  .pay-row strong { color: #0A1628; font-weight: 700; text-align: right; }
  .due-date-box {
    background: rgba(20,184,166,0.08);
    border: 1px solid rgba(20,184,166,0.3);
    border-radius: 8px;
    padding: 12px 14px;
  }
  .due-date-box .ddb-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #0D9182;
    margin-bottom: 4px;
    display: block;
  }
  .due-date-box .ddb-date {
    font-size: 16px;
    font-weight: 800;
    color: #0A1628;
  }
  .due-date-box .ddb-note {
    font-size: 9px;
    color: #666;
    margin-top: 4px;
    line-height: 1.5;
  }

  /* NOTES */
  .notes {
    padding: 16px 36px;
    border-top: 1px solid #EEF3F5;
    font-size: 10px;
    color: #888;
    line-height: 1.7;
  }
  .notes strong { color: #0A1628; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 4px; }

  /* FOOTER */
  .footer-bar {
    background: #0A1628;
    padding: 14px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .footer-bar span { font-size: 9px; color: rgba(255,255,255,0.4); }
  .footer-bar .teal { color: #14B8A6; font-weight: 600; }

  @media print {
    body { background: white; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { box-shadow: none; border-radius: 0; max-width: 100%; }
    .header, .footer-bar, .payment, .pay-cta, .status-strip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @media (max-width: 560px) {
    .parties, .payment { grid-template-columns: 1fr; }
    .party:first-child { border-right: none; border-bottom: 1px solid #EEF3F5; }
    .header, .status-strip, .items, .totals, .pay-cta, .payment, .notes, .footer-bar { padding-left: 20px; padding-right: 20px; }
    .items-header, .line-item { grid-template-columns: 1fr 50px 70px 80px; gap: 6px; font-size: 11px; }
    .item-name { font-size: 12px; }
    .pay-cta-amount { font-size: 30px; }
    .pay-btn { padding: 12px 24px; font-size: 14px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="brand">
      <h1>Ask<span>Miro</span></h1>
      <p>
        Managed Cleaning Services<br>
        020 8073 0621 &nbsp;&middot;&nbsp; info@askmiro.com &nbsp;&middot;&nbsp; askmiro.com
      </p>
    </div>
    <div class="inv-meta">
      <span class="inv-label">Invoice</span>
      <div class="inv-number">${d.ref}</div>
      <div class="inv-date">
        Issued: ${issued}<br>
        Tax Point: ${d.date || issued}<br>
        Due: ${dueDisplay}
      </div>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="parties">
    <div class="party">
      <span class="party-label">From</span>
      <h3>AskMiro Cleaning Services</h3>
      <p>
        SW11, London, United Kingdom<br>
        020 8073 0621<br>
        info@askmiro.com &nbsp;&middot;&nbsp; askmiro.com<br>
        <em style="font-size:10px;color:#888;">A trading name of Miro Partners Ltd &mdash; registered in England &amp; Wales</em>
      </p>
    </div>
    <div class="party">
      <span class="party-label">Bill To</span>
      <h3>${d.name || 'Client'}</h3>
      <p>
        ${d.address ? `${d.address}<br>` : ''}
        ${clientCity}<br>
        ${d.email ? `<a href="mailto:${d.email}" style="color:#0D9182;text-decoration:none">${d.email}</a>` : ''}
      </p>
    </div>
  </div>

  <!-- STATUS -->
  <div class="status-strip">
    <span class="status-badge">${dueDisplay}</span>
    <span class="inv-ref">Job Ref: <strong>${jobRef}</strong></span>
  </div>

  <!-- LINE ITEMS -->
  <div class="items">
    <div class="items-header">
      <span>Description</span>
      <span class="ta-right">Qty</span>
      <span class="ta-right">Rate (&pound;)</span>
      <span class="ta-right">Amount (&pound;)</span>
    </div>
${itemRowsHtml}
  </div>

  <!-- TOTALS -->
  <div class="totals">
    <div class="totals-inner">
      <div class="totals-row">
        <span>Subtotal (net)</span>
        <span>${fmtGBP(net)}</span>
      </div>
      <div class="totals-row">
        <span>VAT (${vatRate > 0 ? `${vatRate}%` : '0% &mdash; below threshold'})</span>
        <span>${fmtGBP(vatAmt)}</span>
      </div>
      <div class="totals-row total">
        <span>Total</span>
        <span class="amount">${fmtGBP(total)}</span>
      </div>
    </div>
  </div>
${payCtaHtml}
  <!-- PAYMENT INFO -->
  <div class="payment">
    <div>
      <span class="pay-block-label">Payment Terms</span>
      <p style="font-size:11px;color:#444;line-height:1.7;">
        Payment of <strong>${fmtGBP(total)}</strong> is due <strong>${dueLabel}</strong>.
        <br><br>
        <strong>Methods:</strong> ${payLink ? 'Card payment via the Tide link above, or bank transfer.' : 'Bank transfer (details below).'}
        <br><br>
        <strong>Bank Transfer:</strong><br>
        Miro Partners Ltd &middot; Sort 04-06-05 &middot; Acc 26672911<br>
        Reference: <strong>${d.ref}</strong>
      </p>
    </div>
    <div>
      <span class="pay-block-label">Payment Due</span>
      <div class="due-date-box">
        <span class="ddb-label">Due Date</span>
        <div class="ddb-date">${dueDisplay}</div>
        <div class="ddb-note">Queries: 020 8073 0621 or info@askmiro.com. Receipt issued upon payment.</div>
      </div>
    </div>
  </div>
${notesBlock}
  <!-- FOOTER -->
  <div class="footer-bar">
    <span>AskMiro Cleaning Services &nbsp;&middot;&nbsp; SW11, London &nbsp;&middot;&nbsp; <span class="teal">askmiro.com</span></span>
    <span>${vatRate > 0 ? `VAT Reg: ${d.vatNumber || 'Pending'}` : 'Not VAT registered &mdash; below threshold'} &nbsp;&middot;&nbsp; Invoice ${d.ref} &nbsp;&middot;&nbsp; ${issued}</span>
  </div>

</div>
</body>
</html>`;
}

// ── PDF renderer ─────────────────────────────────────────────────────────────
async function renderPdf(htmlPath, pdfPath) {
  // Find Puppeteer — check CNC_MODULES, local node_modules, and parent node_modules
  const cncMods = process.env.CNC_MODULES || '';
  const candidates = [
    cncMods && path.join(cncMods, 'puppeteer'),
    path.join(__dirname, 'node_modules/puppeteer'),
    path.join(__dirname, '../node_modules/puppeteer'),
  ].filter(Boolean);

  let puppeteer = null;
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const pkg  = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf-8'));
      const main = pkg.exports?.['.']?.import || pkg.module || pkg.main || 'index.js';
      const mod  = await import(`file://${path.join(p, main)}`);
      puppeteer  = mod.default || mod;
      if (puppeteer && puppeteer.launch) break;
      puppeteer = null;
    } catch (_) {}
  }

  if (!puppeteer) {
    // Fallback: try system chromium via child_process
    log.warn('Puppeteer not found — attempting wkhtmltopdf fallback');
    try {
      execSync(`wkhtmltopdf --page-size A4 --margin-top 0 --margin-right 0 --margin-bottom 0 --margin-left 0 "${htmlPath}" "${pdfPath}"`, { stdio: 'inherit' });
      return true;
    } catch (_) {
      log.warn('PDF generation skipped — install Puppeteer: cd social && npm install puppeteer');
      return false;
    }
  }

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page    = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  await browser.close();
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('\n');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║   AskMiro — Invoice Generator             ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');

  // ── Defaults + validation ───────────────────────────────────────────────────
  if (!args.ref) {
    // Auto-generate ref: AM-XXXX-MMDD
    const d  = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    args.ref = `AM-${Math.floor(1000 + Math.random() * 9000)}-${mm}${dd}`;
    log.warn(`No --ref provided. Using auto-generated: ${args.ref}`);
  }
  if (!args.amount) {
    log.error('Missing --amount (e.g. --amount 220)');
    process.exit(1);
  }

  // ── Output paths ────────────────────────────────────────────────────────────
  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.join(__dirname, 'output');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const slug     = args.ref.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const htmlPath = path.join(outputDir, `invoice-${slug}.html`);
  const pdfPath  = path.join(outputDir, `invoice-${slug}.pdf`);

  // ── Build HTML ───────────────────────────────────────────────────────────────
  log.step(`Building invoice ${args.ref}…`);
  const html = buildInvoiceHtml(args);
  fs.writeFileSync(htmlPath, html, 'utf-8');
  log.ok(`HTML: ${path.relative(process.cwd(), htmlPath)}`);

  // ── Render PDF ───────────────────────────────────────────────────────────────
  log.step('Rendering PDF…');
  const pdfOk = await renderPdf(htmlPath, pdfPath);
  if (pdfOk && fs.existsSync(pdfPath)) {
    const kb = Math.round(fs.statSync(pdfPath).size / 1024);
    log.ok(`PDF: ${path.relative(process.cwd(), pdfPath)} (${kb}KB)`);
  }

  // ── Open preview ─────────────────────────────────────────────────────────────
  if (args.open) {
    try { execSync(`open "${htmlPath}"`); } catch (_) {}
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const fmtGBP = n => `£${Number(n).toFixed(2)}`;
  const vatAmt = (args.amount * (args.vat || 0) / 100);
  const total  = args.amount + vatAmt;

  console.log('');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  Ref:      ${args.ref}`);
  console.log(`  Client:   ${args.name || '(no name)'}`);
  console.log(`  Service:  ${args.service || 'Cleaning Services'}`);
  console.log(`  Date:     ${args.date || '(not set)'}`);
  console.log(`  Total:    ${fmtGBP(total)}${args.vat ? ` (inc ${args.vat}% VAT)` : ' (no VAT)'}`);
  console.log(`  Due:      ${args.due}`);
  console.log('  ─────────────────────────────────────────────');

  // ── Print send command ────────────────────────────────────────────────────────
  if (args.email) {
    const subject = `Invoice ${args.ref} — ${args.service || 'AskMiro Cleaning Services'}`;
    const relHtml = path.relative(path.join(__dirname), htmlPath);

    log.cmd('To send this invoice, run:');
    log.code(`node send-email.mjs \\`);
    log.code(`  --to "${args.email}" \\`);
    log.code(`  --subject "${subject}" \\`);
    log.code(`  --html "${htmlPath}"`);

    console.log('');
    log.info('Or copy the HTML path and pass it to send-email.mjs manually.');
  } else {
    log.cmd('No --email provided. To send, run:');
    log.code(`node ops/send-email.mjs --to "CLIENT_EMAIL" --subject "Invoice ${args.ref}" --html "${htmlPath}"`);
  }

  console.log('');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
