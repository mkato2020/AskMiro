#!/usr/bin/env node
/**
 * AskMiro — send-email.mjs
 * Send a branded email via the AskMiro GAS backend.
 *
 * Usage:
 *   # Send a pre-built HTML file (e.g. a reminder you designed):
 *   node send-email.mjs --to "tiana@example.com" --subject "Your clean is tomorrow" --html ./output/tiana-reminder.html
 *
 *   # Send using a GAS template with field substitution:
 *   node send-email.mjs --to "client@example.com" --subject "Your Quote" --template "Proposal / Quote" \
 *     --field name="John Smith" --field site="Office Park" --field amount="350"
 *
 *   # Preview without sending:
 *   node send-email.mjs ... --dry-run
 *
 *   # Skip confirmation prompt:
 *   node send-email.mjs ... --yes
 *
 * Templates available (match GAS email.gs):
 *   Introduction | Proposal / Quote | Follow-up | Welcome Onboard |
 *   Invoice | Contract Renewal | Deep Clean Quote Reply | Cold Outreach
 *
 * Env (reads from ./social/.env or ./ops/.env or process.env):
 *   ASKMIRO_GAS_URL    — GAS web app URL
 *   ASKMIRO_USER_TOKEN — auth token (e.g. Mike100864)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

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

// ── Logger ────────────────────────────────────────────────────────────────────
const log = {
  step:  (m) => console.log(`  ✦ ${m}`),
  ok:    (m) => console.log(`  ✅ ${m}`),
  warn:  (m) => console.log(`  ⚠️  ${m}`),
  error: (m) => console.log(`  ❌ ${m}`),
  info:  (m) => console.log(`  ℹ️  ${m}`),
  dim:   (m) => console.log(`     ${m}`),
};

// ── Arg parser ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { fields: {}, field: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--to')        { args.to       = argv[++i]; continue; }
    if (a === '--subject')   { args.subject  = argv[++i]; continue; }
    if (a === '--html')      { args.html     = argv[++i]; continue; }
    if (a === '--template')  { args.template = argv[++i]; continue; }
    if (a === '--reply-to')  { args.replyTo  = argv[++i]; continue; }
    if (a === '--from-name') { args.fromName = argv[++i]; continue; }
    if (a === '--field') {
      const kv = argv[++i];
      const eq = kv.indexOf('=');
      if (eq > 0) args.fields[kv.slice(0, eq)] = kv.slice(eq + 1);
      continue;
    }
    if (a === '--dry-run') { args.dryRun = true; continue; }
    if (a === '--yes')     { args.yes    = true; continue; }
  }
  return args;
}

// ── Prompt helper ─────────────────────────────────────────────────────────────
function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

// ── GAS sender ────────────────────────────────────────────────────────────────
async function sendViaGas(payload) {
  const GAS_URL = process.env.ASKMIRO_GAS_URL
    || 'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec';
  const TOKEN = process.env.ASKMIRO_GAS_TOKEN;
  if (!TOKEN) throw new Error('ASKMIRO_GAS_TOKEN not set. Add it to ops/.env or social/.env (your GAS auth token)');

  // Build GET URL — GAS reads body from _body param when _method=POST
  const bodyJson = JSON.stringify(payload);
  const url = `${GAS_URL}?action=email.send&_token=${encodeURIComponent(TOKEN)}&_method=POST&_body=${encodeURIComponent(bodyJson)}`;

  const res  = await fetch(url);
  const text = await res.text();

  let data;
  try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

  if (data.error) throw new Error(`GAS error: ${data.error}`);
  if (!data.ok && !data.id && !data.raw) {
    log.warn(`Unexpected GAS response: ${text.slice(0, 200)}`);
  }
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('\n');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║   AskMiro — Email Sender              ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');

  // ── Validate required args ──────────────────────────────────────────────────
  if (!args.to) {
    log.error('Missing --to (recipient email)');
    console.log('\n  Usage: node send-email.mjs --to EMAIL --subject "TEXT" --html file.html');
    console.log('         node send-email.mjs --to EMAIL --subject "TEXT" --template "Invoice" --field name="John"');
    process.exit(1);
  }
  if (!args.subject) {
    log.error('Missing --subject');
    process.exit(1);
  }
  if (!args.html && !args.template) {
    log.error('Provide either --html <file> or --template <name>');
    process.exit(1);
  }

  // ── Load HTML ───────────────────────────────────────────────────────────────
  let htmlBody = null;
  if (args.html) {
    const htmlPath = path.resolve(args.html);
    if (!fs.existsSync(htmlPath)) {
      log.error(`HTML file not found: ${htmlPath}`);
      process.exit(1);
    }
    htmlBody = fs.readFileSync(htmlPath, 'utf-8');
    log.step(`Loaded HTML: ${path.basename(htmlPath)} (${Math.round(htmlBody.length / 1024)}KB)`);
  }

  // ── Build payload ───────────────────────────────────────────────────────────
  const payload = {
    to:       args.to,
    subject:  args.subject,
    template: args.template || 'Custom',
    replyTo:  args.replyTo  || 'info@askmiro.com',
    fromName: args.fromName || 'AskMiro Cleaning Services',
  };
  if (htmlBody)                     payload.htmlBody = htmlBody;
  if (Object.keys(args.fields).length) payload.fields = JSON.stringify(args.fields);

  // ── Preview ─────────────────────────────────────────────────────────────────
  console.log('  ─────────────────────────────────────────');
  console.log(`  To:       ${payload.to}`);
  console.log(`  Subject:  ${payload.subject}`);
  console.log(`  Template: ${payload.template}`);
  if (args.html) {
    console.log(`  HTML:     ${args.html}`);
    // Show first 3 text lines of HTML as preview
    const preview = htmlBody
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    console.log(`  Preview:  ${preview}…`);
  }
  if (Object.keys(args.fields).length) {
    console.log(`  Fields:`);
    for (const [k, v] of Object.entries(args.fields)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  console.log('  ─────────────────────────────────────────');

  if (args.dryRun) {
    log.warn('Dry run — NOT sending. Remove --dry-run to send.');
    console.log('');
    process.exit(0);
  }

  // ── Confirmation ─────────────────────────────────────────────────────────────
  if (!args.yes) {
    const answer = await prompt('\n  Send this email? (y/N) → ');
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      log.warn('Aborted — nothing sent.');
      console.log('');
      process.exit(0);
    }
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  console.log('');
  log.step('Sending via GAS…');
  try {
    const result = await sendViaGas(payload);
    log.ok(`Email sent! ID: ${result.id || 'n/a'}`);
    log.dim(`To: ${payload.to}`);
    log.dim(`Subject: ${payload.subject}`);
  } catch (err) {
    log.error(`Send failed: ${err.message}`);
    process.exit(1);
  }
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
