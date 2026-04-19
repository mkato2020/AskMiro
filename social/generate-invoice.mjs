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

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${d.ref} — AskMiro</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Sora:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#0F172A;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:13px}
    @page{size:A4;margin:0}
    .page{width:794px;min-height:1123px;margin:0 auto;display:flex;flex-direction:column}

    /* HEADER */
    .hd{background:#0A1628;padding:32px 48px 24px;display:flex;justify-content:space-between;align-items:flex-start;flex-shrink:0}
    .hd-brand{color:#fff}
    .hd-name{font-family:'Sora',sans-serif;font-size:26px;font-weight:900;letter-spacing:-0.5px;line-height:1}
    .hd-sub{font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:2.5px;text-transform:uppercase;margin-top:5px}
    .hd-contact{font-size:11.5px;color:rgba(255,255,255,0.45);margin-top:10px;line-height:1.9}
    .hd-contact a{color:#5EEAD4;text-decoration:none}
    .hd-meta{text-align:right}
    .hd-label{font-size:10px;font-weight:700;color:#5EEAD4;letter-spacing:2.5px;text-transform:uppercase}
    .hd-ref{font-family:'Sora',sans-serif;font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;margin-top:3px;line-height:1}
    .hd-date{font-size:11.5px;color:rgba(255,255,255,0.4);margin-top:6px}

    /* ACCENT */
    .bar{height:3px;background:linear-gradient(90deg,#0D9488 0%,#14B8A6 50%,#0A1628 100%);flex-shrink:0}

    /* BODY */
    .body{padding:28px 48px 24px;flex:1}

    /* INFO CARDS */
    .cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px}
    .card{border-radius:8px;padding:14px 16px}
    .card-a{background:#F8FAFC;border:1px solid #E2E8F0}
    .card-b{background:#F0FDFA;border:1px solid #CCFBF1}
    .card-lbl{font-size:9.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px}
    .card-a .card-lbl{color:#94A3B8}
    .card-b .card-lbl{color:#0D9488}
    .card-name{font-size:15px;font-weight:700;color:#0F172A;line-height:1.2}
    .card-detail{font-size:12px;color:#64748B;margin-top:5px;line-height:1.7}
    .card-detail a{color:#0D9488;text-decoration:none}

    /* TABLE */
    .tbl{width:100%;border-collapse:collapse;margin-bottom:0}
    .tbl thead th{padding:8px 14px;font-size:9.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#94A3B8;border-bottom:1.5px solid #E2E8F0;background:#F8FAFC;text-align:left}
    .tbl thead th.th-r{text-align:right}
    .td-desc{padding:14px 14px;width:52%}
    .td-num{padding:14px 14px;width:16%;text-align:right;color:#64748B;font-size:13px}
    .td-amt{padding:14px 14px;width:16%;text-align:right;font-weight:600;font-size:13px}
    .item-name{font-size:13.5px;font-weight:600;color:#0F172A}
    .item-sub{font-size:11.5px;color:#64748B;margin-top:2px}
    .tbl tbody tr{border-bottom:1px solid #F1F5F9}

    /* TOTALS */
    .sub-row td{padding:7px 14px;border-bottom:1px solid #F8FAFC}
    .sub-lbl{color:#64748B;text-align:left;font-size:12.5px}
    .sub-val{text-align:right;font-weight:600;font-size:12.5px}
    .grand-row td{background:#0A1628;padding:12px 14px;border-bottom:none}
    .grand-lbl{color:#fff;font-weight:700;font-family:'Sora',sans-serif;font-size:15px;text-align:left}
    .grand-val{color:#5EEAD4;font-weight:900;font-family:'Sora',sans-serif;font-size:15px;text-align:right;letter-spacing:-0.3px}

    /* PAYMENT */
    .pay-wrap{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}
    .pay-box{border-radius:8px;padding:14px 16px}
    .pay-bank{background:#FAFAF5;border:1px solid #E9E9D8}
    .pay-due{background:#F0FDFA;border:1px solid #CCFBF1}
    .pay-lbl{font-size:9.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94A3B8;margin-bottom:10px}
    .pay-grid{display:grid;grid-template-columns:auto 1fr;gap:3px 16px}
    .pk{font-size:12px;color:#78716C;padding:2px 0;font-weight:500}
    .pv{font-size:12px;color:#0F172A;font-weight:700;padding:2px 0;font-family:'Sora',sans-serif;font-size:12.5px}
    .due-text{font-size:12px;color:#0F766E;line-height:1.7}
    .due-text strong{font-weight:700}

    /* FOOTER */
    .ft{background:#0A1628;padding:14px 48px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;margin-top:auto}
    .ft-l{font-size:10.5px;color:rgba(255,255,255,0.35);line-height:1.7}
    .ft-r{font-size:10.5px;color:#5EEAD4;font-weight:600;text-align:right}
    .ft-creds{font-size:9.5px;color:rgba(255,255,255,0.22);margin-top:2px}
  </style>
</head>
<body>
<div class="page">

  <div class="hd">
    <div class="hd-brand">
      <div class="hd-name">AskMiro</div>
      <div class="hd-sub">Cleaning Services</div>
      <div class="hd-contact">
        020 8073 0621 &nbsp;&bull;&nbsp; <a href="mailto:info@askmiro.com">info@askmiro.com</a> &nbsp;&bull;&nbsp; www.askmiro.com
      </div>
    </div>
    <div class="hd-meta">
      <div class="hd-label">Invoice</div>
      <div class="hd-ref">${d.ref}</div>
      <div class="hd-date">Issued ${issued}</div>
      ${d.due && d.due !== 'on completion'
        ? `<div class="hd-date" style="margin-top:2px;color:rgba(255,255,255,0.5)">Due: ${d.due}</div>`
        : `<div class="hd-date" style="margin-top:2px;color:rgba(255,255,255,0.5)">Due on completion</div>`}
    </div>
  </div>
  <div class="bar"></div>

  <div class="body">

    <div class="cards">
      <div class="card card-a">
        <div class="card-lbl">Billed To</div>
        <div class="card-name">${d.name || 'Client'}</div>
        <div class="card-detail">
          ${d.email ? `<a href="mailto:${d.email}">${d.email}</a><br>` : ''}
          ${d.address || ''}
        </div>
      </div>
      <div class="card card-b">
        <div class="card-lbl">Service</div>
        <div class="card-name">${d.service || 'Cleaning Services'}</div>
        <div class="card-detail">
          ${d.date ? `Date: <strong style="color:#0F172A">${d.date}</strong><br>` : ''}
          ${d.address || ''}
        </div>
      </div>
    </div>

    <table class="tbl">
      <thead>
        <tr>
          <th class="td-desc">Description</th>
          <th class="th-r" style="width:16%">Qty</th>
          <th class="th-r" style="width:16%">Rate</th>
          <th class="th-r" style="width:16%">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${notesHtml}
        ${vatRow}
        <tr class="grand-row">
          <td colspan="3" class="grand-lbl">Total Due</td>
          <td class="grand-val">${fmtGBP(total)}</td>
        </tr>
      </tbody>
    </table>

    <div class="pay-wrap">
      <div class="pay-box pay-bank">
        <div class="pay-lbl">Bank Transfer</div>
        <div class="pay-grid">
          <span class="pk">Account Name</span>  <span class="pv">Miro Partners Ltd</span>
          <span class="pk">Sort Code</span>      <span class="pv">04-06-05</span>
          <span class="pk">Account Number</span> <span class="pv">26672911</span>
          <span class="pk">Reference</span>       <span class="pv">${d.ref}</span>
        </div>
      </div>
      <div class="pay-box pay-due">
        <div class="pay-lbl">Payment Terms</div>
        <div class="due-text">
          Payment is due <strong>${d.due}</strong>.<br>
          Please use reference <strong>${d.ref}</strong> when paying by bank transfer.<br><br>
          Queries: <strong>020 8073 0621</strong> or <a href="mailto:info@askmiro.com" style="color:#0D9488;font-weight:600">info@askmiro.com</a>
        </div>
      </div>
    </div>

  </div>

  <div class="ft">
    <div class="ft-l">
      AskMiro Cleaning Services &bull; A trading name of Miro Partners Ltd &bull; London &amp; UK<br>
      ${vatRate > 0
        ? `VAT Registration No: ${d.vatNumber || 'Pending'}`
        : 'Not VAT registered — below compulsory registration threshold. No VAT charged.'}
    </div>
    <div class="ft-r">
      www.askmiro.com
      <div class="ft-creds">COSHH Compliant &bull; Fully Insured &bull; ISO Standards</div>
    </div>
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
