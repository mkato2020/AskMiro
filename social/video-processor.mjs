/**
 * AskMiro Video Processor
 *
 * Drop raw footage or before/after photos into inbox/ and run this.
 * It will:
 *   1. Detect what's in inbox/ (video clips or photo pairs)
 *   2. Ask Claude to write a script/caption for the content
 *   3. Generate ElevenLabs voiceover
 *   4. Assemble a branded 9:16 vertical video with ffmpeg:
 *      — AskMiro intro card (0.8s)
 *      — Main footage with text overlay
 *      — CTA outro card (1.5s)
 *   5. Save to output/ ready for posting
 *
 * Inbox structure:
 *   social/inbox/
 *     videos/   ← drop .mp4 / .mov clips here
 *     photos/   ← drop before-*.jpg + after-*.jpg pairs here
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FFMPEG   = process.env.FFMPEG_PATH  || 'ffmpeg';
const FFPROBE  = process.env.FFPROBE_PATH || 'ffprobe';

// ── Brand ──────────────────────────────────────────────────────────────────
const B = {
  teal:  '0x0A9688',   // ffmpeg drawtext colour format
  dark:  '0x0D1C2E',
  white: '0xFFFFFF',
  tealHex: '#0A9688',
  darkHex: '#0D1C2E',
};

// ── Load env ───────────────────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !m[2].startsWith('#')) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const log = {
  step: m => console.log(`  ✦ ${m}`),
  ok:   m => console.log(`  ✅ ${m}`),
  warn: m => console.log(`  ⚠️  ${m}`),
  err:  m => console.log(`  ❌ ${m}`),
};

// ── Discover inbox ─────────────────────────────────────────────────────────
export function scanInbox() {
  const videoDir = path.join(__dirname, 'inbox', 'videos');
  const photoDir = path.join(__dirname, 'inbox', 'photos');

  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(photoDir, { recursive: true });

  const videoExts = ['.mp4', '.mov', '.MP4', '.MOV'];
  const photoExts = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];

  const videos = fs.existsSync(videoDir)
    ? fs.readdirSync(videoDir).filter(f => videoExts.includes(path.extname(f))).map(f => path.join(videoDir, f))
    : [];

  const photos = fs.existsSync(photoDir)
    ? fs.readdirSync(photoDir).filter(f => photoExts.includes(path.extname(f))).map(f => path.join(photoDir, f))
    : [];

  // Pair before/after photos
  const befores = photos.filter(p => path.basename(p).toLowerCase().includes('before'));
  const afters  = photos.filter(p => path.basename(p).toLowerCase().includes('after'));
  const pairs   = befores.map(b => {
    const stem = path.basename(b).toLowerCase().replace('before', '').replace(/[^a-z0-9]/g, '');
    const after = afters.find(a => {
      const as = path.basename(a).toLowerCase().replace('after', '').replace(/[^a-z0-9]/g, '');
      return as === stem || as === '' || stem === '';
    }) || afters[0];
    return after ? { before: b, after } : null;
  }).filter(Boolean);

  // Unpaired singles (not named before/after)
  const singles = photos.filter(p => {
    const name = path.basename(p).toLowerCase();
    return !name.includes('before') && !name.includes('after');
  });

  return { videos, pairs, singles };
}

// ── Generate script via Claude ─────────────────────────────────────────────
async function generateScript(type, context) {
  const prompts = {
    video: `You are writing a 15-25 second voiceover script for a professional cleaning company called AskMiro based in London.

The video clip shows: ${context.description || 'a professional cleaning job in progress'}

Write a punchy voiceover script (max 60 words) that:
- Opens with a hook about cleanliness/hygiene (first 2 seconds must grab attention)
- Briefly describes the transformation happening
- Ends with "AskMiro — book your free quote at askmiro.com"

Also write a social caption (80-120 words) and text overlay (max 8 words for the main screen).

Return JSON: { "voiceover": "...", "textOverlay": "...", "caption": "...", "hashtags": "..." }`,

    before_after: `You are writing content for a before/after transformation post for AskMiro Cleaning Services, London.

Write a voiceover script (max 50 words) that:
- Opens: "Look at this transformation..."
- Describes what changed (dirty → spotless)
- Builds satisfaction/desire
- Ends: "AskMiro — book your free quote at askmiro.com"

Also write a caption (80-120 words) and a text overlay (max 8 words).

Return JSON: { "voiceover": "...", "textOverlay": "...", "caption": "...", "hashtags": "..." }`,

    single_photo: `Write a caption for a professional cleaning photo post for AskMiro Cleaning Services, London.
Return JSON: { "caption": "...", "hashtags": "..." }`,
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompts[type] }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON');
  return JSON.parse(match[0]);
}

// ── ElevenLabs voiceover ──────────────────────────────────────────────────
async function generateVoiceover(script, outputPath) {
  // British female voice — Rachel (warm, professional)
  const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah — can swap
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.45, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true },
    }),
  });

  if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  log.ok(`Voiceover: ${path.basename(outputPath)}`);
}

// ── Get video duration via ffprobe ────────────────────────────────────────
function getVideoDuration(filePath) {
  try {
    const result = spawnSync(FFPROBE, [
      '-v', 'quiet', '-print_format', 'json', '-show_format', filePath
    ], { encoding: 'utf-8' });
    return parseFloat(JSON.parse(result.stdout).format.duration) || 10;
  } catch { return 10; }
}

// ── Build branded video from footage ─────────────────────────────────────
async function processVideo(videoPath, outputDir) {
  log.step(`Processing video: ${path.basename(videoPath)}`);
  const stem = path.basename(videoPath, path.extname(videoPath));
  const tmpDir = path.join(outputDir, `tmp-${stem}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // 1. Generate script
  log.step('Generating script...');
  const script = await generateScript('video', { description: `cleaning job footage: ${stem}` });
  log.ok(`Hook: "${script.textOverlay}"`);

  // 2. Voiceover
  const voPath = path.join(tmpDir, 'vo.mp3');
  log.step('Generating voiceover...');
  await generateVoiceover(script.voiceover, voPath);

  // 3. Get footage duration
  const footageDuration = Math.min(getVideoDuration(videoPath), 25);
  const outputPath = path.join(outputDir, `${stem}-branded.mp4`);

  // 4. Build with ffmpeg:
  //    — Scale & crop footage to 1080x1920 (9:16 vertical)
  //    — Add dark semi-transparent overlay so text reads clearly
  //    — Overlay text (hook + branding)
  //    — Mix in voiceover
  const textOverlay = script.textOverlay.replace(/'/g, "\\'").replace(/:/g, '\\:');
  const ffArgs = [
    '-y',
    '-i', videoPath,
    '-i', voPath,
    '-filter_complex', [
      // Scale to fill 1080x1920, crop to fit
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[scaled]`,
      // Dark overlay for text readability
      `color=${B.dark}@0.45:size=1080x1920[overlay]`,
      `[scaled][overlay]blend=all_mode=overlay[blended]`,
      // Top teal bar
      `color=${B.teal}:size=1080x4[topbar]`,
      `[blended][topbar]overlay=0:0[withbar]`,
      // Main hook text — large, centered, upper third
      `[withbar]drawtext=text='${textOverlay}':fontsize=72:fontcolor=white:` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `x=(w-text_w)/2:y=200:` +
      `box=1:boxcolor=${B.dark}@0.6:boxborderw=20[withhook]`,
      // AskMiro brand — bottom left
      `[withhook]drawtext=text='AskMiro':fontsize=32:fontcolor=white:` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `x=60:y=h-120:` +
      `box=1:boxcolor=${B.dark}@0.7:boxborderw=12[withbrand]`,
      // URL — bottom left, small
      `[withbrand]drawtext=text='askmiro.com':fontsize=22:fontcolor=0xFFFFFF@0.55:` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `x=60:y=h-75[final]`,
    ].join(';'),
    '-map', '[final]',
    '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    '-t', String(footageDuration),
    '-r', '30',
    outputPath,
  ];

  log.step('Rendering branded video with ffmpeg...');
  const result = spawnSync(FFMPEG, ffArgs, { encoding: 'utf-8' });
  if (result.status !== 0) {
    log.warn('ffmpeg stderr: ' + result.stderr?.slice(-500));
    throw new Error('ffmpeg failed');
  }

  log.ok(`Branded video: ${path.basename(outputPath)}`);
  return { outputPath, script };
}

// ── Build before/after slideshow video ───────────────────────────────────
async function processBeforeAfter(pair, outputDir) {
  log.step(`Processing before/after: ${path.basename(pair.before)} → ${path.basename(pair.after)}`);
  const stem = 'before-after-' + Date.now();
  const tmpDir = path.join(outputDir, `tmp-${stem}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Script
  log.step('Generating script...');
  const script = await generateScript('before_after', {});

  // Voiceover
  const voPath = path.join(tmpDir, 'vo.mp3');
  await generateVoiceover(script.voiceover, voPath);

  const outputPath = path.join(outputDir, `${stem}.mp4`);
  const textOverlay = (script.textOverlay || 'Transformation').replace(/'/g, "\\'");

  // Slideshow: before (3s) → zoom transition → after (3s) + voiceover
  const ffArgs = [
    '-y',
    '-loop', '1', '-t', '3.5', '-i', pair.before,
    '-loop', '1', '-t', '3.5', '-i', pair.after,
    '-i', voPath,
    '-filter_complex', [
      // Scale both to 1080x1920
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[before]`,
      `[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[after]`,
      // Fade transition between before and after
      `[before][after]xfade=transition=fade:duration=0.5:offset=3[faded]`,
      // Top teal bar
      `color=${B.teal}:size=1080x4[topbar]`,
      `[faded][topbar]overlay=0:0[withbar]`,
      // "BEFORE" label on first half
      `[withbar]drawtext=text='BEFORE':fontsize=48:fontcolor=white:` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `x=60:y=80:enable='lt(t,3)':` +
      `box=1:boxcolor=${B.dark}@0.7:boxborderw=16[withbefore]`,
      // "AFTER" label on second half
      `[withbefore]drawtext=text='AFTER':fontsize=48:fontcolor=0x14D4C2:` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `x=60:y=80:enable='gte(t,3.5)':` +
      `box=1:boxcolor=${B.dark}@0.7:boxborderw=16[withlabels]`,
      // Hook text
      `[withlabels]drawtext=text='${textOverlay}':fontsize=58:fontcolor=white:` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `x=(w-text_w)/2:y=h-260:` +
      `box=1:boxcolor=${B.dark}@0.75:boxborderw=20[withhook]`,
      // Branding
      `[withhook]drawtext=text='AskMiro · askmiro.com':fontsize=26:fontcolor=white@0.7:` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `x=(w-text_w)/2:y=h-100:` +
      `box=1:boxcolor=${B.dark}@0.6:boxborderw=10[final]`,
    ].join(';'),
    '-map', '[final]',
    '-map', '2:a',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest', '-r', '30',
    outputPath,
  ];

  log.step('Rendering before/after video...');
  const result = spawnSync(FFMPEG, ffArgs, { encoding: 'utf-8' });
  if (result.status !== 0) {
    log.warn('ffmpeg stderr: ' + result.stderr?.slice(-500));
    throw new Error('ffmpeg failed for before/after');
  }

  log.ok(`Before/after video: ${path.basename(outputPath)}`);
  return { outputPath, script };
}

// ── Move processed files to done/ ─────────────────────────────────────────
function archiveInboxFile(filePath) {
  const doneDir = path.join(path.dirname(filePath), '..', 'done');
  fs.mkdirSync(doneDir, { recursive: true });
  const dest = path.join(doneDir, path.basename(filePath));
  fs.renameSync(filePath, dest);
}

// ── Main ───────────────────────────────────────────────────────────────────
export async function processInbox() {
  const inbox = scanInbox();
  const date  = new Date().toISOString().split('T')[0];
  const outputDir = path.join(__dirname, 'output', `${date}-processed`);
  fs.mkdirSync(outputDir, { recursive: true });

  const results = [];

  // Process video clips
  for (const videoPath of inbox.videos) {
    try {
      const result = await processVideo(videoPath, outputDir);
      results.push({ type: 'video', ...result });
      archiveInboxFile(videoPath);
    } catch (err) {
      log.err(`Video failed: ${path.basename(videoPath)} — ${err.message}`);
    }
  }

  // Process before/after pairs
  for (const pair of inbox.pairs) {
    try {
      const result = await processBeforeAfter(pair, outputDir);
      results.push({ type: 'before_after', ...result });
      archiveInboxFile(pair.before);
      archiveInboxFile(pair.after);
    } catch (err) {
      log.err(`Before/after failed — ${err.message}`);
    }
  }

  // Save manifest
  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));

  return results;
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('\n🎬 AskMiro Video Processor\n');

  const inbox = scanInbox();
  const total = inbox.videos.length + inbox.pairs.length;

  if (total === 0) {
    log.warn('Inbox is empty. Drop files here:');
    console.log(`  Videos → ${path.join(__dirname, 'inbox', 'videos')}/`);
    console.log(`  Photos → ${path.join(__dirname, 'inbox', 'photos')}/ (name: before-*.jpg + after-*.jpg)\n`);
    process.exit(0);
  }

  console.log(`  Found: ${inbox.videos.length} video(s), ${inbox.pairs.length} before/after pair(s)\n`);
  const results = await processInbox();
  console.log(`\n  ✅ ${results.length} item(s) processed and ready to post.`);
  console.log(`  📁 Output: ${path.join(__dirname, 'output')}\n`);
}
