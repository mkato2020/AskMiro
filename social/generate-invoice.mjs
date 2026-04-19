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
  const vatAmt  = (net * vatRate / 100);
  const total   = net + vatAmt;
  const fmtGBP  = n => `£${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const issued  = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const lineItems = [
    { desc: d.service || 'Cleaning Services', detail: d.address || '', amount: net },
  ];

  const rows = lineItems.map(item => `
    <tr>
      <td class="td-desc">
        <div class="item-name">${item.desc}</div>
        ${item.detail ? `<div class="item-detail">${item.detail}</div>` : ''}
      </td>
      <td class="td-qty">1</td>
      <td class="td-rate">${fmtGBP(item.amount)}</td>
      <td class="td-amount">${fmtGBP(item.amount)}</td>
    </tr>`).join('');

  // Only show subtotal + VAT rows when VAT is charged
  const vatRow = vatRate > 0 ? `
    <tr class="total-row">
      <td colspan="3" class="total-label">Subtotal (Net)</td>
      <td class="total-value">${fmtGBP(net)}</td>
    </tr>
    <tr class="total-row">
      <td colspan="3" class="total-label">VAT (${vatRate}%)</td>
      <td class="total-value">${fmtGBP(vatAmt)}</td>
    </tr>` : '';

  const notesHtml = d.notes ? `
  <div class="notes-block">
    <div class="notes-label">Notes</div>
    <div class="notes-text">${d.notes}</div>
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${d.ref} — AskMiro</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#fff; color:#1E293B; line-height:1.5; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    @page { size:A4; margin:0; }
    .page { max-width:794px; margin:0 auto; padding:0; }

    /* ── Header band ── */
    .header { background:#0A1628; padding:40px 52px 32px; display:flex; justify-content:space-between; align-items:flex-start; }
    .brand-name { font-family:'Outfit',sans-serif; font-size:28px; font-weight:900; color:#fff; letter-spacing:-0.5px; }
    .brand-tag { font-size:11px; color:rgba(255,255,255,0.4); letter-spacing:2px; text-transform:uppercase; margin-top:4px; }
    .brand-contact { font-size:12px; color:rgba(255,255,255,0.5); margin-top:8px; line-height:1.8; }
    .brand-contact a { color:#5EEAD4; text-decoration:none; }
    .doc-badge { text-align:right; }
    .doc-type { font-size:11px; font-weight:700; color:#5EEAD4; letter-spacing:2.5px; text-transform:uppercase; }
    .doc-ref { font-family:'Outfit',sans-serif; font-size:30px; font-weight:900; color:#fff; letter-spacing:-1px; margin-top:4px; }
    .doc-issued { font-size:12px; color:rgba(255,255,255,0.45); margin-top:6px; }

    /* ── Accent bar ── */
    .accent-bar { height:4px; background:linear-gradient(90deg,#0D9488,#14B8A6 40%,#0A1628); }

    /* ── Body ── */
    .body { padding:44px 52px; }

    /* ── Client + Service grid ── */
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:36px; }
    .info-card { border-radius:10px; padding:20px 22px; }
    .info-card.client { background:#F8FAFC; border:1px solid #E2E8F0; }
    .info-card.service { background:#F0FDFA; border:1px solid #CCFBF1; }
    .info-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:10px; }
    .info-card.client .info-label { color:#94A3B8; }
    .info-card.service .info-label { color:#0D9488; }
    .info-name { font-size:16px; font-weight:700; color:#1E293B; }
    .info-detail { font-size:13px; color:#64748B; margin-top:5px; line-height:1.7; }

    /* ── Line items table ── */
    .items-table { width:100%; border-collapse:collapse; margin-bottom:0; }
    .items-table thead th { padding:10px 16px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#94A3B8; border-bottom:2px solid #E2E8F0; background:#F8FAFC; text-align:left; }
    .items-table thead th:last-child { text-align:right; }
    .items-table thead th.td-qty,
    .items-table thead th.td-rate { text-align:right; }
    .td-desc { padding:16px; width:55%; }
    .td-qty  { padding:16px; width:10%; text-align:right; font-size:14px; color:#64748B; }
    .td-rate { padding:16px; width:17%; text-align:right; font-size:14px; color:#64748B; }
    .td-amount { padding:16px; width:18%; text-align:right; font-weight:600; font-size:14px; }
    .item-name { font-size:14px; font-weight:600; color:#1E293B; }
    .item-detail { font-size:12px; color:#64748B; margin-top:3px; }
    .items-table tbody tr { border-bottom:1px solid #F1F5F9; }

    /* ── Totals ── */
    .totals-wrap { display:flex; justify-content:flex-end; margin-top:0; }
    .totals-table { width:300px; border-collapse:collapse; }
    .total-row td { padding:9px 16px; font-size:14px; border-bottom:1px solid #F1F5F9; }
    .total-label { color:#64748B; text-align:left; }
    .total-value { font-weight:600; text-align:right; }
    .total-row.grand td { background:#0A1628; font-size:17px; border-bottom:none; padding:14px 16px; }
    .total-row.grand .total-label { color:#fff; font-weight:700; font-family:'Outfit',sans-serif; }
    .total-row.grand .total-value { color:#5EEAD4; font-weight:800; font-family:'Outfit',sans-serif; letter-spacing:-0.5px; }
    .total-row:first-child td { border-top:2px solid #E2E8F0; }

    /* ── Payment callout ── */
    .payment-callout { margin-top:32px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:10px; padding:20px 24px; }
    .payment-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:#D97706; margin-bottom:12px; }
    .payment-grid { display:grid; grid-template-columns:auto 1fr; gap:4px 24px; }
    .payment-key { font-size:13px; color:#92400E; font-weight:500; padding:3px 0; }
    .payment-val { font-size:13px; color:#1E293B; font-weight:700; padding:3px 0; font-family:'Outfit',sans-serif; }

    /* ── Due callout ── */
    .due-callout { margin-top:16px; background:#F0FDFA; border:1px solid #99F6E4; border-radius:10px; padding:16px 20px; display:flex; align-items:center; gap:14px; }
    .due-icon { font-size:22px; }
    .due-text { font-size:13.5px; color:#0F766E; line-height:1.6; }

    /* ── Notes ── */
    .notes-block { margin-top:20px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:16px 20px; }
    .notes-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:#94A3B8; margin-bottom:6px; }
    .notes-text  { font-size:13px; color:#475569; line-height:1.7; }

    /* ── Signature ── */
    .sig { margin-top:36px; padding-top:24px; border-top:2px solid #0D9488; display:flex; align-items:flex-start; gap:16px; }
    .sig-logo { width:40px; height:40px; background:#0D9488; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .sig-name  { font-size:15px; font-weight:700; color:#1E293B; }
    .sig-role  { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:#0D9488; margin-top:3px; }
    .sig-contact { font-size:12px; color:#64748B; margin-top:6px; line-height:1.8; }
    .sig-contact a { color:#0D9488; text-decoration:none; }
    .sig-creds { margin-top:10px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:7px; padding:7px 12px; font-size:10px; color:#94A3B8; }

    /* ── Footer ── */
    .footer { background:#0A1628; padding:20px 52px; display:flex; justify-content:space-between; align-items:center; }
    .footer-left { font-size:12px; color:rgba(255,255,255,0.4); line-height:1.6; }
    .footer-right { font-size:12px; color:#5EEAD4; font-weight:600; }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-name">AskMiro</div>
      <div class="brand-tag">Cleaning Services</div>
      <div class="brand-contact">
        020 8073 0621<br>
        <a href="mailto:info@askmiro.com">info@askmiro.com</a><br>
        www.askmiro.com
      </div>
    </div>
    <div class="doc-badge">
      <div class="doc-type">Invoice</div>
      <div class="doc-ref">${d.ref}</div>
      <div class="doc-issued">Issued ${issued}</div>
    </div>
  </div>
  <div class="accent-bar"></div>

  <!-- Body -->
  <div class="body">

    <!-- Client + Service info -->
    <div class="info-grid">
      <div class="info-card client">
        <div class="info-label">Bill To</div>
        <div class="info-name">${d.name || 'Client'}</div>
        <div class="info-detail">
          ${d.email ? `<a href="mailto:${d.email}" style="color:#0D9488;text-decoration:none">${d.email}</a><br>` : ''}
          ${d.address ? d.address : ''}
        </div>
      </div>
      <div class="info-card service">
        <div class="info-label">Service Details</div>
        <div class="info-name">${d.service || 'Cleaning Services'}</div>
        <div class="info-detail">
          ${d.date ? `Date: <strong>${d.date}</strong><br>` : ''}
          ${d.address ? `Address: ${d.address}` : ''}
        </div>
      </div>
    </div>

    <!-- Line items -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="td-desc">Description</th>
          <th class="td-qty">Qty</th>
          <th class="td-rate">Rate</th>
          <th class="td-amount">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-wrap">
      <table class="totals-table">
        <tbody>
          ${vatRow}
          <tr class="total-row grand">
            <td class="total-label">Total Due</td>
            <td class="total-value">${fmtGBP(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Payment details -->
    <div class="payment-callout">
      <div class="payment-title">🏦 Payment Details</div>
      <div class="payment-grid">
        <span class="payment-key">Account Name</span>  <span class="payment-val">Miro Partners Ltd</span>
        <span class="payment-key">Sort Code</span>     <span class="payment-val">04-06-05</span>
        <span class="payment-key">Account Number</span><span class="payment-val">26672911</span>
        <span class="payment-key">Reference</span>     <span class="payment-val">${d.ref}</span>
      </div>
    </div>

    <!-- Due notice -->
    <div class="due-callout">
      <div class="due-icon">💳</div>
      <div class="due-text">
        Payment is due <strong>${d.due}</strong>. Bank transfer preferred — please use reference <strong>${d.ref}</strong>.
        For any queries call <strong>020 8073 0621</strong> or email <a href="mailto:info@askmiro.com" style="color:#0D9488">info@askmiro.com</a>.
      </div>
    </div>

    ${notesHtml}

    <!-- Signature -->
    <div class="sig">
      <div class="sig-logo">
        <img src="https://www.askmiro.com/favicon-32x32.png" width="28" height="28" alt="AskMiro" style="display:block;border-radius:5px">
      </div>
      <div>
        <div class="sig-name">Mike Kato</div>
        <div class="sig-role">Co-Founder · AskMiro Cleaning Services</div>
        <div class="sig-contact">
          📞 <a href="tel:02080730621">020 8073 0621</a> &nbsp;|&nbsp;
          ✉ <a href="mailto:info@askmiro.com">info@askmiro.com</a> &nbsp;|&nbsp;
          <a href="https://www.askmiro.com">www.askmiro.com</a>
        </div>
        <div class="sig-creds">✓ COSHH Compliant &nbsp;&nbsp; ✓ Fully Insured &nbsp;&nbsp; ✓ ISO Quality Standards &nbsp;&nbsp; ✓ London &amp; UK Coverage${vatRate === 0 ? ' &nbsp;&nbsp; ✓ Not VAT registered — no VAT charged' : ''}</div>
      </div>
    </div>

  </div><!-- /body -->

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      AskMiro Cleaning Services &bull; A trading name of Miro Partners Ltd<br>
      ${vatRate > 0
        ? `VAT Reg: ${d.vatNumber || 'Pending'} &bull; `
        : 'Not VAT registered &bull; '}
      London &amp; UK
    </div>
    <div class="footer-right">www.askmiro.com</div>
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
