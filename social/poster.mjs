/**
 * AskMiro Social Poster
 * Posts image cards + captions to Facebook Page and Instagram Business Account
 * Uses the same Meta Graph API approach as the CNC engine
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const GRAPH_API = 'https://graph.facebook.com';
const API_VERSION = 'v22.0';

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
  divider: () => console.log('  ' + '─'.repeat(56)),
};

// ── Upload image to Facebook Page ─────────────────────────────────────────
async function postImageToFacebook(imagePath, caption) {
  const token = process.env.ASKMIRO_PAGE_TOKEN;
  const pageId = process.env.ASKMIRO_PAGE_ID;

  if (!token) throw new Error('ASKMIRO_PAGE_TOKEN not set in .env');
  if (!pageId) throw new Error('ASKMIRO_PAGE_ID not set in .env');

  log.step('Uploading image to Facebook Page...');

  // Use FormData for multipart upload
  const { FormData, File } = await import('undici');
  const imageBuffer = fs.readFileSync(imagePath);
  const fileName = path.basename(imagePath);

  const form = new FormData();
  form.append('source', new File([imageBuffer], fileName, { type: 'image/png' }));
  form.append('caption', caption);
  form.append('access_token', token);

  const res = await fetch(`${GRAPH_API}/${API_VERSION}/${pageId}/photos`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();

  if (data.error) throw new Error(`Facebook post failed: ${data.error.message}`);

  log.ok(`Facebook photo posted! ID: ${data.id}`);
  return data.id;
}

// ── Upload image to Instagram Business Account ────────────────────────────
async function postImageToInstagram(imagePath, caption) {
  const token = process.env.ASKMIRO_PAGE_TOKEN;
  const igId = process.env.ASKMIRO_IG_ID;

  if (!token) throw new Error('ASKMIRO_PAGE_TOKEN not set in .env');
  if (!igId) {
    log.warn('ASKMIRO_IG_ID not set — skipping Instagram. Run: node poster.mjs --get-ig-id');
    return null;
  }

  log.step('Posting to Instagram...');

  // Instagram requires a publicly accessible URL, not a direct file upload
  // We'll use tmpfiles.org as a bridge
  const { FormData: FD2, File: F2 } = await import('undici');
  const imageBuffer = fs.readFileSync(imagePath);
  const fd = new FD2();
  fd.append('file', new F2([imageBuffer], path.basename(imagePath), { type: 'image/png' }));

  const uploadRes = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: fd,
  });
  const uploadData = await uploadRes.json();
  if (!uploadData?.data?.url) throw new Error('tmpfiles upload failed');
  const publicUrl = uploadData.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');

  // Step 1: Create media container
  const containerRes = await fetch(`${GRAPH_API}/${API_VERSION}/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      image_url: publicUrl,
      caption,
      access_token: token,
    }),
  });
  const containerData = await containerRes.json();
  if (containerData.error) throw new Error(`IG container error: ${containerData.error.message}`);

  const containerId = containerData.id;
  log.step(`IG container created: ${containerId}`);

  // Wait for IG to process
  await new Promise(r => setTimeout(r, 5000));

  // Step 2: Publish
  const publishRes = await fetch(`${GRAPH_API}/${API_VERSION}/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: token,
    }),
  });
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(`IG publish error: ${publishData.error.message}`);

  log.ok(`Instagram posted! ID: ${publishData.id}`);
  return publishData.id;
}

// ── Helper: discover IG business account ID ───────────────────────────────
async function getIgId() {
  const token = process.env.ASKMIRO_PAGE_TOKEN;
  const pageId = process.env.ASKMIRO_PAGE_ID;
  if (!token || !pageId) { log.error('Set ASKMIRO_PAGE_TOKEN and ASKMIRO_PAGE_ID first'); return; }

  const res = await fetch(`${GRAPH_API}/${API_VERSION}/${pageId}?fields=instagram_business_account&access_token=${token}`);
  const data = await res.json();
  if (data.error) { log.error(data.error.message); return; }

  if (data.instagram_business_account) {
    log.ok(`AskMiro Instagram Business Account ID: ${data.instagram_business_account.id}`);
    log.info('Add this to social/.env as: ASKMIRO_IG_ID=' + data.instagram_business_account.id);
  } else {
    log.warn('No Instagram Business Account linked to this Facebook Page.');
    log.step('Go to Facebook Page Settings → Instagram → Connect Account');
  }
}

// ── Log post ───────────────────────────────────────────────────────────────
async function logPost(entry) {
  const logPath = path.join(__dirname, 'output', 'post-log.json');
  let posts = [];
  try { posts = JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch { /**/ }
  posts.push(entry);
  fs.writeFileSync(logPath, JSON.stringify(posts, null, 2));
}

// ── Main ───────────────────────────────────────────────────────────────────
export async function postContent(imagePath, content) {
  const caption = `${content.caption}\n\n${content.hashtags}`;

  console.log('\n🌍 AskMiro — Posting to social platforms');
  log.divider();

  const results = {};

  // Facebook
  try {
    results.facebook = await postImageToFacebook(imagePath, caption);
  } catch (err) {
    log.error(`Facebook: ${err.message}`);
    results.facebook = null;
  }

  // Instagram
  try {
    results.instagram = await postImageToInstagram(imagePath, caption);
  } catch (err) {
    log.error(`Instagram: ${err.message}`);
    results.instagram = null;
  }

  log.divider();
  log.ok(`Done! FB: ${results.facebook || 'failed'} | IG: ${results.instagram || 'skipped/failed'}`);

  await logPost({
    date: new Date().toISOString(),
    type: content.type,
    hook: content.hook,
    imagePath,
    ...results,
  });

  return results;
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.includes('--get-ig-id')) {
    await getIgId();
    process.exit(0);
  }

  // Post latest generated content
  const latestContent = path.join(__dirname, 'output', 'latest.json');
  const latestImage = path.join(__dirname, 'output', 'latest-card.png');

  if (!fs.existsSync(latestContent)) {
    log.error('No content found. Run: node content-generator.mjs first');
    process.exit(1);
  }
  if (!fs.existsSync(latestImage)) {
    log.error('No card image found. Run: node card-renderer.mjs first');
    process.exit(1);
  }

  const content = JSON.parse(fs.readFileSync(latestContent, 'utf-8'));
  await postContent(latestImage, content);
}
