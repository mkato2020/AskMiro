/**
 * AskMiro Card Renderer
 * Generates branded 1080×1080 image cards using Puppeteer
 * Used for "Did You Know" and "Cleaning Hack" posts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Use puppeteer from CNC node_modules
const CNC_MODULES = process.env.CNC_MODULES || '/Users/mike/Desktop/Crown n cradle/06_render/node_modules';
const puppeteer = require(path.join(CNC_MODULES, 'puppeteer'));

// ── AskMiro brand colours (from askmiro-theme.css) ────────────────────────
const BRAND = {
  teal:        '#0A9688',
  tealMid:     '#0DBDAD',
  tealLight:   '#14D4C2',
  tealDim:     'rgba(10,150,136,0.10)',
  tealBorder:  'rgba(10,150,136,0.22)',
  bgBase:      '#F7F9FB',
  bgSurface:   '#FFFFFF',
  bgDark:      '#0D1C2E',
  textPrimary: '#0D1C2E',
  textSec:     '#4A6480',
  textMuted:   '#8BA5BE',
  borderLight: 'rgba(13,28,46,0.08)',
  borderMed:   'rgba(13,28,46,0.14)',
};

// ── Card HTML template ─────────────────────────────────────────────────────
// Design principle: attention capture science
// — Dark bg triggers contrast sensitivity (brain sees it first)
// — ONE dominant focal point (giant text) — no competing elements
// — Teal highlight on the most emotionally charged word
// — Left-aligned text = natural reading axis = faster processing
// — Curiosity gap: hook statement cuts off at the right moment
// — Minimal bottom strip anchors brand without stealing attention
function buildCardHTML(content) {
  const { type, hook, fact_headline, hack_title, service } = content;

  let label = 'ASKMIRO';
  let headline = hook || fact_headline || hack_title || '';

  if (type === 'did_you_know')       label = 'DID YOU KNOW?';
  else if (type === 'service_spotlight') label = 'OUR SERVICES';
  else if (type === 'cleaning_hack')     label = 'PRO TIP';
  else if (type === 'before_after_tease') label = 'TRANSFORMATION';
  else if (type === 'why_professional')  label = 'THINK ABOUT IT';

  // Split headline into lines — highlight the first punch word in teal
  const words = headline.split(' ');
  // Highlight the most emotionally charged word (first noun/adj after 2nd word)
  // Simple heuristic: highlight word at index 2 if it's a strong word
  const strongWords = ['never','always','every','most','worst','best','hidden','secret','real','truth','wrong','lying','killing','destroying','ruining','doubling','tripling','toxic','silent','invisible'];
  let highlightIdx = -1;
  words.forEach((w, i) => {
    if (highlightIdx === -1 && strongWords.includes(w.toLowerCase().replace(/[^a-z]/g,''))) highlightIdx = i;
  });
  // Fallback: highlight last word for open loop effect
  if (highlightIdx === -1) highlightIdx = words.length - 1;

  const markedText = words.map((w, i) =>
    i === highlightIdx
      ? `<span class="hl">${w}</span>`
      : w
  ).join(' ');

  // Dynamic font size based on length
  const len = headline.length;
  const fs = len > 80 ? '64px' : len > 55 ? '76px' : len > 35 ? '90px' : '108px';
  const lh = len > 80 ? '1.12' : '1.05';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@500;700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1080px;
    height: 1080px;
    background: ${BRAND.bgDark};
    font-family: 'Montserrat', sans-serif;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ── Teal depth field — bottom right corner, subtle ── */
  body::after {
    content: '';
    position: absolute;
    bottom: -80px; right: -80px;
    width: 520px; height: 520px;
    background: radial-gradient(ellipse,
      rgba(10,150,136,0.18) 0%,
      transparent 65%);
    pointer-events: none;
  }

  /* ── Thin teal top line ── */
  .top-line {
    height: 3px;
    background: linear-gradient(90deg,
      ${BRAND.teal} 0%,
      ${BRAND.tealLight} 50%,
      transparent 100%);
    flex-shrink: 0;
  }

  /* ── Main body ── */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 72px 96px 64px;
    position: relative;
    z-index: 1;
  }

  /* ── Label (eyebrow) ── */
  .label {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: ${BRAND.teal};
    margin-bottom: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .label::before {
    content: '';
    display: block;
    width: 28px;
    height: 2px;
    background: ${BRAND.teal};
    flex-shrink: 0;
  }

  /* ── Giant headline — the attention anchor ── */
  .headline {
    font-family: 'Bebas Neue', sans-serif;
    font-size: ${fs};
    line-height: ${lh};
    letter-spacing: 0.01em;
    color: #FFFFFF;
    margin-bottom: 48px;
    word-break: break-word;
  }
  /* Teal highlight — the one word that lodges in memory */
  .headline .hl {
    color: ${BRAND.tealLight};
  }

  /* ── Body pull-quote / sub-line ── */
  .sub {
    font-family: 'Montserrat', sans-serif;
    font-size: 18px;
    font-weight: 500;
    color: rgba(255,255,255,0.45);
    letter-spacing: 0.01em;
    line-height: 1.6;
    max-width: 640px;
    border-left: 2px solid ${BRAND.teal};
    padding-left: 20px;
  }

  /* ── Bottom bar ── */
  .footer {
    background: rgba(255,255,255,0.04);
    border-top: 1px solid rgba(255,255,255,0.07);
    padding: 24px 96px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-icon {
    width: 36px; height: 36px;
    background: ${BRAND.teal};
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .brand-name {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 900;
    letter-spacing: -0.01em;
    color: #fff;
  }
  .brand-loc {
    font-size: 11px;
    color: rgba(255,255,255,0.35);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-top: 1px;
  }

  .cta-pill {
    background: ${BRAND.teal};
    color: #fff;
    font-family: 'Montserrat', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 10px 22px;
    border-radius: 4px;
  }
</style>
</head>
<body>
  <div class="top-line"></div>

  <div class="main">
    <div class="label">${label}</div>
    <div class="headline">${markedText}</div>
    <div class="sub">Professional cleaning services in London · askmiro.com</div>
  </div>

  <div class="footer">
    <div class="brand">
      <div class="brand-icon">🧹</div>
      <div>
        <div class="brand-name">AskMiro</div>
        <div class="brand-loc">London · Fully Insured</div>
      </div>
    </div>
    <div class="cta-pill">Book Free Quote</div>
  </div>
</body>
</html>`;
}

// ── Render card to PNG ────────────────────────────────────────────────────
export async function renderCard(content, outputPath) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 }); // 2x = 2160px retina

    const html = buildCardHTML(content);
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Small wait for fonts
    await new Promise(r => setTimeout(r, 500));

    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1080 } });

    console.log(`✅ Card rendered: ${outputPath}`);
    return outputPath;
  } finally {
    await browser.close();
  }
}

// ── Standalone test ───────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Load .env
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  }

  // Use latest.json if it exists, otherwise use test data
  let content;
  const latestPath = path.join(__dirname, 'output', 'latest.json');
  if (fs.existsSync(latestPath)) {
    content = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
  } else {
    content = {
      type: 'did_you_know',
      hook: 'Your kitchen sponge has more bacteria than your toilet seat',
      fact_headline: 'Your kitchen sponge has more bacteria than your toilet seat',
    };
  }

  const outputDir = path.join(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  await renderCard(content, path.join(outputDir, `${date}-card.png`));
}
