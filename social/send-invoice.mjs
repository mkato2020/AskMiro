#!/usr/bin/env node
/**
 * AskMiro — send-invoice.mjs
 * ──────────────────────────────────────────────────────────────
 * One command: generates the PDF invoice, builds a branded cover
 * email, and sends it to the client with the PDF attached.
 *
 * Routes:
 *   PDF attachment → Netlify/Resend  (office@askmiro.com)
 *   Fallback (HTML only) → GAS Gmail (info@askmiro.com)
 *
 * Usage:
 *   node send-invoice.mjs \
 *     --to      "tiana.tasevska94@gmail.com"  \
 *     --name    "Tiana Tasevska"              \
 *     --ref     "AM-2026-0001"                \
 *     --service "End of Tenancy Clean"        \
 *     --date    "20 April 2026"               \
 *     --address "301 Lumiere Apartments, SW11 1AD" \
 *     --amount  220                           \
 *     --due     "on completion"               \
 *     [--notes  "Access via concierge"]       \
 *     [--vat    0]                            \
 *     [--dry-run]   (preview only, no send)   \
 *     [--yes]       (skip confirmation)
 *
 * Env (reads from ./social/.env or ../.env):
 *   NETLIFY_URL        — e.g. https://askmiro-ops.netlify.app
 *   ASKMIRO_GAS_URL    — GAS web app URL (fallback sender)
 *   ASKMIRO_GAS_TOKEN  — GAS auth token
 */

import fs        from 'fs';
import path      from 'path';
import readline  from 'readline';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '../social/.env'),
    path.join(__dirname, '../.env'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
    break;
  }
}
loadEnv();

// ── Logger ────────────────────────────────────────────────────────────────────
const log = {
  step:  (m) => console.log(`  ✦ ${m}`),
  ok:    (m) => console.log(`  ✅ ${m}`),
  warn:  (m) => console.log(`  ⚠️  ${m}`),
  error: (m) => console.log(`  ❌ ${m}`),
  info:  (m) => console.log(`  ℹ️  ${m}`),
  dim:   (m) => console.log(`     \x1b[2m${m}\x1b[0m`),
  bold:  (m) => console.log(`  \x1b[1m${m}\x1b[0m`),
};

// ── Arg parser ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { vat: 0, due: 'on completion' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--to')       { args.to      = argv[++i]; continue; }
    if (a === '--name')     { args.name    = argv[++i]; continue; }
    if (a === '--ref')      { args.ref     = argv[++i]; continue; }
    if (a === '--service')  { args.service = argv[++i]; continue; }
    if (a === '--date')     { args.date    = argv[++i]; continue; }
    if (a === '--address')  { args.address = argv[++i]; continue; }
    if (a === '--amount')   { args.amount  = parseFloat(argv[++i]); continue; }
    if (a === '--vat')      { args.vat     = parseFloat(argv[++i]); continue; }
    if (a === '--due')      { args.due     = argv[++i]; continue; }
    if (a === '--notes')    { args.notes   = argv[++i]; continue; }
    if (a === '--dry-run')  { args.dryRun  = true; continue; }
    if (a === '--yes')      { args.yes     = true; continue; }
  }
  return args;
}

// ── Prompt ─────────────────────────────────────────────────────────────────────
function prompt(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, a => { rl.close(); resolve(a.trim()); });
  });
}

// ── Build cover email HTML ─────────────────────────────────────────────────────
function buildCoverEmail(d) {
  const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const total = d.amount + (d.amount * (d.vat || 0) / 100);
  const fmtGBP = n => '£' + Number(n).toFixed(2);
  const vatNote = (d.vat || 0) === 0
    ? '<tr style="background:#F8FAFC"><td style="padding:10px 16px;font-family:' + F + ';font-size:12px;color:#94A3B8;border-top:1px solid #F1F5F9" colspan="2">Not VAT registered — no VAT charged on this invoice</td></tr>'
    : '';

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Invoice ' + d.ref + ' — AskMiro</title></head>'
    + '<body style="margin:0;padding:0;background:#F1F5F9">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">'

    // Accent bar
    + '<tr><td style="height:4px;background:linear-gradient(90deg,#0D9488,#14B8A6);border-radius:12px 12px 0 0;font-size:4px;line-height:4px">&nbsp;</td></tr>'

    // Header
    + '<tr><td style="background:#0A1628;padding:26px 36px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="vertical-align:middle">'
    + '<div style="font-family:' + F + ';font-size:22px;font-weight:900;color:#FFFFFF;letter-spacing:-0.5px">AskMiro</div>'
    + '<div style="font-family:' + F + ';font-size:10px;color:rgba(255,255,255,0.5);letter-spacing:2px;text-transform:uppercase;margin-top:3px">Cleaning Services</div>'
    + '</td>'
    + '<td align="right" style="vertical-align:middle">'
    + '<div style="font-family:' + F + ';font-size:10px;font-weight:700;color:#5EEAD4;letter-spacing:2px;text-transform:uppercase">Invoice</div>'
    + '<div style="font-family:' + F + ';font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;margin-top:2px">' + d.ref + '</div>'
    + '</td>'
    + '</tr></table></td></tr>'

    // Body
    + '<tr><td style="background:#FFFFFF;padding:40px 36px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">'

    + '<p style="margin:0 0 20px;font-family:' + F + ';font-size:16px;font-weight:600;color:#111827">Hi ' + (d.name ? d.name.split(' ')[0] : 'there') + ',</p>'
    + '<p style="margin:0 0 24px;font-family:' + F + ';font-size:15px;color:#374151;line-height:1.75">'
    + 'Thank you for choosing AskMiro. Please find your invoice attached to this email as a PDF.'
    + '</p>'

    // Invoice summary card
    + '<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">'
    + '<tr style="background:#F8FAFC"><td colspan="2" style="padding:12px 16px;font-family:' + F + ';font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;border-bottom:1px solid #E5E7EB">Invoice Summary</td></tr>'
    + '<tr><td style="padding:12px 16px;font-family:' + F + ';font-size:13px;color:#6B7280;border-bottom:1px solid #F3F4F6">Service</td><td style="padding:12px 16px;font-family:' + F + ';font-size:13px;font-weight:600;color:#111827;text-align:right;border-bottom:1px solid #F3F4F6">' + d.service + '</td></tr>'
    + (d.date ? '<tr style="background:#F9FAFB"><td style="padding:12px 16px;font-family:' + F + ';font-size:13px;color:#6B7280;border-bottom:1px solid #F3F4F6">Date</td><td style="padding:12px 16px;font-family:' + F + ';font-size:13px;font-weight:600;color:#111827;text-align:right;border-bottom:1px solid #F3F4F6">' + d.date + '</td></tr>' : '')
    + (d.address ? '<tr><td style="padding:12px 16px;font-family:' + F + ';font-size:13px;color:#6B7280;border-bottom:1px solid #F3F4F6">Address</td><td style="padding:12px 16px;font-family:' + F + ';font-size:13px;font-weight:600;color:#111827;text-align:right;border-bottom:1px solid #F3F4F6">' + d.address + '</td></tr>' : '')
    + '<tr><td style="padding:12px 16px;font-family:' + F + ';font-size:13px;color:#6B7280;border-bottom:1px solid #F3F4F6">Reference</td><td style="padding:12px 16px;font-family:' + F + ';font-size:13px;font-weight:700;color:#111827;text-align:right;border-bottom:1px solid #F3F4F6;font-variant-numeric:tabular-nums">' + d.ref + '</td></tr>'
    + vatNote
    + '<tr style="background:#F0FDFA"><td style="padding:16px;font-family:' + F + ';font-size:14px;font-weight:700;color:#111827">Total Due</td><td style="padding:16px;font-family:' + F + ';font-size:20px;font-weight:900;color:#0D9488;text-align:right;letter-spacing:-0.5px">' + fmtGBP(total) + '</td></tr>'
    + '</table>'

    // Payment details
    + '<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:18px 20px">'
    + '<tr><td><div style="font-family:' + F + ';font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#D97706;margin-bottom:12px">Bank Transfer Details</div>'
    + '<table cellpadding="0" cellspacing="0"><tr>'
    + '<td style="font-family:' + F + ';font-size:13px;color:#92400E;padding-right:28px;line-height:2.2">Account Name<br>Sort Code<br>Account Number<br>Reference</td>'
    + '<td style="font-family:' + F + ';font-size:13px;font-weight:700;color:#1F2937;line-height:2.2">Miro Partners Ltd<br>04-06-05<br>26672911<br>' + d.ref + '</td>'
    + '</tr></table>'
    + '</td></tr></table>'

    // Payment terms
    + '<p style="margin:0 0 20px;font-family:' + F + ';font-size:14px;color:#374151;line-height:1.75">'
    + 'Payment is due <strong>' + d.due + '</strong>. Please use reference <strong>' + d.ref + '</strong> when making your bank transfer.'
    + '</p>'

    + (d.notes ? '<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:14px 18px"><tr><td><div style="font-family:' + F + ';font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;margin-bottom:6px">Notes</div><div style="font-family:' + F + ';font-size:13px;color:#374151">' + d.notes + '</div></td></tr></table>' : '')

    // Signature
    + '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:32px"><tr><td style="padding-top:24px;border-top:1px solid #E5E7EB">'
    + '<div style="font-family:' + F + ';font-size:15px;font-weight:700;color:#111827">Mike Kato</div>'
    + '<div style="font-family:' + F + ';font-size:12px;color:#0D9488;font-weight:600;margin-top:2px">Co-Founder — AskMiro Cleaning Services</div>'
    + '<table cellpadding="0" cellspacing="0" style="margin-top:12px"><tr>'
    + '<td style="padding-right:20px"><a href="tel:02080730621" style="font-family:' + F + ';font-size:12px;color:#4B5563;text-decoration:none">020 8073 0621</a></td>'
    + '<td style="padding-right:20px"><a href="mailto:info@askmiro.com" style="font-family:' + F + ';font-size:12px;color:#0D9488;text-decoration:none">info@askmiro.com</a></td>'
    + '<td><a href="https://www.askmiro.com" style="font-family:' + F + ';font-size:12px;color:#0D9488;font-weight:600;text-decoration:none">www.askmiro.com</a></td>'
    + '</tr></table>'
    + '</td></tr></table>'

    + '</td></tr>'

    // Footer
    + '<tr><td style="background:#0A1628;padding:20px 36px;border-radius:0 0 12px 12px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td><div style="font-family:' + F + ';font-size:12px;color:rgba(255,255,255,0.45)">AskMiro Cleaning Services &bull; A trading name of Miro Partners Ltd</div>'
    + '<div style="font-family:' + F + ';font-size:11px;color:rgba(255,255,255,0.25);margin-top:3px">Not VAT registered &bull; London &amp; UK &bull; Fully Insured &bull; COSHH Compliant</div></td>'
    + '<td align="right"><a href="https://www.askmiro.com" style="font-family:' + F + ';font-size:12px;color:#5EEAD4;text-decoration:none;font-weight:600">www.askmiro.com</a></td>'
    + '</tr></table></td></tr>'

    + '</table></td></tr></table></body></html>';
}

// ── Send via Netlify/Resend (with PDF attachment) ─────────────────────────────
async function sendViaNetlify(payload) {
  const NETLIFY = (process.env.NETLIFY_URL || 'https://askmiro-ops.netlify.app').replace(/\/$/, '');
  const url = `${NETLIFY}/api/send-email`;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}

  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

// ── Send via GAS (HTML body only — no attachment fallback) ────────────────────
async function sendViaGas(payload) {
  const GAS_URL = process.env.ASKMIRO_GAS_URL
    || 'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec';
  const TOKEN   = process.env.ASKMIRO_GAS_TOKEN || 'Mike100864';

  const url = `${GAS_URL}?action=email.send&_token=${encodeURIComponent(TOKEN)}&_method=POST&_body=${encodeURIComponent(JSON.stringify(payload))}`;
  const res  = await fetch(url);
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (data.error) throw new Error(`GAS: ${data.error}`);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('\n');
  console.log('  ╔═══════════════════════════════════════════════╗');
  console.log('  ║   AskMiro — Invoice Generator & Sender        ║');
  console.log('  ╚═══════════════════════════════════════════════╝');
  console.log('');

  // ── Validate ─────────────────────────────────────────────────────────────────
  const missing = ['to','name','ref','service','amount'].filter(k => !args[k]);
  if (missing.length) {
    missing.forEach(k => log.error(`Missing --${k}`));
    console.log('\n  Usage: node send-invoice.mjs --to EMAIL --name NAME --ref REF --service SERVICE --amount AMOUNT');
    process.exit(1);
  }

  // ── Step 1: Generate PDF ──────────────────────────────────────────────────────
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const slug    = args.ref.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const pdfPath = path.join(outputDir, `invoice-${slug}.pdf`);
  const htmlPath = path.join(outputDir, `invoice-${slug}.html`);

  log.step('Generating PDF invoice…');
  const genArgs = [
    path.join(__dirname, 'generate-invoice.mjs'),
    '--ref',     args.ref,
    '--name',    args.name,
    '--service', args.service,
    '--amount',  String(args.amount),
    '--vat',     String(args.vat || 0),
    '--due',     args.due,
  ];
  if (args.date)    genArgs.push('--date',    args.date);
  if (args.address) genArgs.push('--address', args.address);
  if (args.notes)   genArgs.push('--notes',   args.notes);

  const gen = spawnSync('node', genArgs, { cwd: __dirname, encoding: 'utf-8' });
  if (gen.status !== 0) {
    log.error('PDF generation failed:');
    console.log(gen.stderr || gen.stdout);
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    log.warn('PDF not generated (Puppeteer missing?) — falling back to HTML-only email');
  } else {
    const kb = Math.round(fs.statSync(pdfPath).size / 1024);
    log.ok(`PDF ready: invoice-${slug}.pdf (${kb}KB)`);
  }

  // ── Step 2: Build email ───────────────────────────────────────────────────────
  log.step('Building cover email…');
  const htmlBody  = buildCoverEmail(args);
  const subject   = `Invoice ${args.ref} — ${args.service} — AskMiro`;
  const hasPdf    = fs.existsSync(pdfPath);
  const pdfBase64 = hasPdf ? fs.readFileSync(pdfPath).toString('base64') : null;

  // ── Summary ────────────────────────────────────────────────────────────────────
  const total = args.amount + args.amount * (args.vat || 0) / 100;
  console.log('  ─────────────────────────────────────────────────');
  log.bold(`  To:       ${args.to}`);
  console.log(`  Name:     ${args.name}`);
  console.log(`  Ref:      ${args.ref}`);
  console.log(`  Service:  ${args.service}`);
  console.log(`  Amount:   £${total.toFixed(2)}${args.vat ? ` (inc ${args.vat}% VAT)` : ' (no VAT)'}`);
  console.log(`  Due:      ${args.due}`);
  console.log(`  Route:    ${hasPdf ? 'Netlify/Resend + PDF attachment' : 'GAS Gmail (HTML only)'}`);
  console.log(`  Subject:  ${subject}`);
  console.log('  ─────────────────────────────────────────────────');

  if (args.dryRun) {
    log.warn('Dry run — NOT sending. Remove --dry-run to send for real.');
    log.info(`PDF path:  ${pdfPath}`);
    log.info(`HTML path: ${htmlPath}`);
    console.log('');
    process.exit(0);
  }

  if (!args.yes) {
    const answer = await prompt('\n  Send this invoice? (y/N) → ');
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      log.warn('Aborted — nothing sent.');
      process.exit(0);
    }
  }

  // ── Step 3: Send ───────────────────────────────────────────────────────────────
  console.log('');
  log.step(hasPdf ? 'Sending via Netlify/Resend with PDF attached…' : 'Sending via GAS (no PDF)…');

  try {
    let result;
    if (hasPdf) {
      result = await sendViaNetlify({
        to:          args.to,
        subject,
        htmlBody,
        replyTo:     'info@askmiro.com',
        fromName:    'AskMiro Cleaning Services',
        attachments: [{
          name: `Invoice-${args.ref}.pdf`,
          data: pdfBase64,
        }],
      });
    } else {
      result = await sendViaGas({
        to:       args.to,
        subject,
        htmlBody,
        template: 'Custom',
        replyTo:  'info@askmiro.com',
        fromName: 'AskMiro Cleaning Services',
      });
    }

    log.ok(`Invoice sent! ${result.id ? 'ID: ' + result.id : ''}`);
    log.dim(`To: ${args.to}`);
    log.dim(`Ref: ${args.ref} — £${total.toFixed(2)}`);
    if (hasPdf) log.dim('PDF attached: ✓');
    console.log('');
    log.info('A BCC copy has been sent to info@askmiro.com for your records.');

  } catch (err) {
    log.error(`Send failed: ${err.message}`);

    if (hasPdf) {
      console.log('');
      log.warn('Falling back to GAS (no attachment)…');
      try {
        await sendViaGas({
          to: args.to, subject, htmlBody,
          template: 'Custom',
          replyTo: 'info@askmiro.com',
          fromName: 'AskMiro Cleaning Services',
        });
        log.ok('Sent via GAS (without PDF attachment).');
        log.warn('Send the PDF manually: ' + pdfPath);
      } catch (e2) {
        log.error('Fallback also failed: ' + e2.message);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }

  console.log('');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
