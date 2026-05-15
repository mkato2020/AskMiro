#!/usr/bin/env node
/**
 * AskMiro Daily Post — Master Orchestrator
 *
 * Run this once per day (manually or via cron) to:
 * 1. Generate today's content (Claude API)
 * 2. Render a branded image card (Puppeteer)
 * 3. Post to Facebook + Instagram
 *
 * Usage:
 *   node daily-post.mjs                  → auto content type (by day of week)
 *   node daily-post.mjs did_you_know      → force content type
 *   node daily-post.mjs --preview         → generate + render only, don't post
 *   node daily-post.mjs --setup           → check env & discover IG account ID
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env ───────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && m[2] && !m[2].startsWith('#')) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const log = {
  step: (m) => console.log(`  ✦ ${m}`),
  ok: (m) => console.log(`  ✅ ${m}`),
  warn: (m) => console.log(`  ⚠️  ${m}`),
  error: (m) => console.log(`  ❌ ${m}`),
  info: (m) => console.log(`  📘 ${m}`),
  banner: (m) => console.log(`\n${'═'.repeat(60)}\n  ${m}\n${'═'.repeat(60)}`),
};

// ── Setup check ────────────────────────────────────────────────────────────
function checkSetup() {
  log.banner('AskMiro Social Engine — Setup Check');

  const required = [
    ['ANTHROPIC_API_KEY', 'Claude AI (content generation)'],
    ['ASKMIRO_PAGE_ID', 'Facebook Page ID (1004018059465433)'],
    ['ASKMIRO_PAGE_TOKEN', 'Facebook Page Access Token'],
    ['CNC_MODULES', 'Path to CNC node_modules (for Puppeteer)'],
  ];

  const optional = [
    ['ASKMIRO_IG_ID', 'Instagram Business Account ID (for IG posting)'],
    ['ELEVENLABS_API_KEY', 'ElevenLabs (for future video content)'],
    ['PEXELS_API_KEY', 'Pexels (for future stock photo posts)'],
  ];

  let allGood = true;
  console.log('\n  Required:');
  for (const [key, desc] of required) {
    const val = process.env[key];
    const status = val ? '✅' : '❌';
    if (!val) allGood = false;
    console.log(`  ${status} ${key.padEnd(25)} — ${desc}`);
  }

  console.log('\n  Optional:');
  for (const [key, desc] of optional) {
    const val = process.env[key];
    const status = val ? '✅' : '⚪';
    console.log(`  ${status} ${key.padEnd(25)} — ${desc}`);
  }

  if (!process.env.ASKMIRO_IG_ID) {
    console.log('\n  💡 To get your Instagram Business Account ID, run:');
    console.log('     node daily-post.mjs --get-ig-id\n');
  }

  if (!process.env.ASKMIRO_PAGE_TOKEN) {
    console.log('\n  💡 To get your Page Access Token:');
    console.log('     1. Go to: https://developers.facebook.com/tools/explorer');
    console.log('     2. Select your "crown and cradle" app');
    console.log('     3. Click "Generate Access Token" with pages_manage_posts');
    console.log('     4. Run: curl .../me/accounts to get AskMiro Page Token');
    console.log('     5. Add to social/.env as ASKMIRO_PAGE_TOKEN=...\n');
  }

  return allGood;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  console.log('\n');
  log.banner('🧹 AskMiro Social Engine — Daily Post');

  // Setup check mode
  if (args.includes('--setup')) {
    checkSetup();
    process.exit(0);
  }

  // Get Instagram ID mode
  if (args.includes('--get-ig-id')) {
    const { postContent } = await import('./poster.mjs');
    // Just run the getIgId helper — imported differently here
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${process.env.ASKMIRO_PAGE_ID}?fields=instagram_business_account&access_token=${process.env.ASKMIRO_PAGE_TOKEN}`
    );
    const data = await res.json();
    if (data.instagram_business_account) {
      log.ok(`Instagram Business Account ID: ${data.instagram_business_account.id}`);
      log.info(`Add to social/.env: ASKMIRO_IG_ID=${data.instagram_business_account.id}`);
    } else {
      log.warn('No Instagram linked. Connect via Facebook Page Settings → Instagram.');
    }
    process.exit(0);
  }

  const isPreview = args.includes('--preview');
  const CONTENT_TYPES = ['did_you_know', 'service_spotlight', 'cleaning_hack', 'before_after_tease', 'why_professional'];
  const typeOverride = args.find(a => CONTENT_TYPES.includes(a));

  // ── Step 1: Generate content ─────────────────────────────────────────────
  console.log('\n  STEP 1 — Generate Content');
  log.divider();

  const { default: generateModule } = await import('./content-generator.mjs').catch(() => null) || {};

  // Re-import and run programmatically
  const genScript = path.join(__dirname, 'content-generator.mjs');
  // Run as subprocess to get clean stdout
  const genArgs = typeOverride ? [typeOverride] : [];
  if (isPreview) genArgs.push('--preview');

  try {
    execSync(`node "${genScript}" ${genArgs.join(' ')}`, {
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (err) {
    log.error('Content generation failed');
    process.exit(1);
  }

  const outputDir = path.join(__dirname, 'output');
  const latestContentPath = path.join(outputDir, 'latest.json');
  if (!fs.existsSync(latestContentPath)) {
    log.error('No content generated. Check API keys.');
    process.exit(1);
  }
  const content = JSON.parse(fs.readFileSync(latestContentPath, 'utf-8'));
  log.ok(`Content type: ${content.type}`);

  // ── Step 2: Render card ──────────────────────────────────────────────────
  console.log('\n  STEP 2 — Render Image Card');
  log.divider();

  const { renderCard } = await import('./card-renderer.mjs');
  const date = new Date().toISOString().split('T')[0];
  const cardPath = path.join(outputDir, `${date}-card.png`);
  const latestCardPath = path.join(outputDir, 'latest-card.png');

  await renderCard(content, cardPath);
  fs.copyFileSync(cardPath, latestCardPath);
  log.ok(`Card saved: output/${date}-card.png`);

  if (isPreview) {
    log.banner('Preview mode — NOT posting. Review output/latest-card.png');
    console.log(`  Open with: open "${cardPath}"\n`);
    process.exit(0);
  }

  // ── Step 3: Post to platforms ────────────────────────────────────────────
  console.log('\n  STEP 3 — Post to Platforms');
  log.divider();

  if (!process.env.ASKMIRO_PAGE_TOKEN) {
    log.error('ASKMIRO_PAGE_TOKEN not set. Run: node daily-post.mjs --setup');
    log.info('Run with --preview to test content generation without posting');
    process.exit(1);
  }

  const { postContent } = await import('./poster.mjs');
  await postContent(latestCardPath, content);

  log.banner('✅ Done! AskMiro daily post complete.');
  console.log(`  📅 Date: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);
  console.log(`  📝 Type: ${content.type}`);
  console.log(`  🪝  Hook: ${content.hook}\n`);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
