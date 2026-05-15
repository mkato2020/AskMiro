/**
 * AskMiro Carousel Renderer
 * Generates a 6-slide "Did You Know?" carousel about cleaning in the UK
 *
 * Slide structure:
 *   0 — Hook      (dark, attention-capture, makes them swipe)
 *   1–4 — Facts   (light, numbered, fact + explanation)
 *   5 — CTA       (dark, book now)
 *
 * Each slide = 1080×1080 PNG → posted as IG/FB carousel
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require  = createRequire(import.meta.url);

const CNC_MODULES = process.env.CNC_MODULES ||
  '/Users/mike/Desktop/Crown n cradle/06_render/node_modules';
const puppeteer = require(path.join(CNC_MODULES, 'puppeteer'));

// ── Brand tokens (from askmiro-theme.css) ─────────────────────────────────
const B = {
  teal:     '#0A9688',
  tealMid:  '#0DBDAD',
  tealLt:   '#14D4C2',
  dark:     '#0D1C2E',
  base:     '#F7F9FB',
  surface:  '#FFFFFF',
  txt:      '#0D1C2E',
  txtSec:   '#4A6480',
  txtMuted: '#8BA5BE',
};

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;600;700;900&display=swap" rel="stylesheet">`;

const BASE_STYLE = `
* { margin:0; padding:0; box-sizing:border-box; }
body { width:1080px; height:1080px; overflow:hidden; font-family:'Montserrat',sans-serif; }
`;

// ── Slide 0: Hook ──────────────────────────────────────────────────────────
function hookSlide(topic) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${FONTS}
<style>
${BASE_STYLE}
body {
  background: ${B.dark};
  display: flex;
  flex-direction: column;
  position: relative;
}
/* teal depth glow */
body::after {
  content:''; position:absolute;
  bottom:-80px; right:-80px;
  width:520px; height:520px;
  background: radial-gradient(ellipse, rgba(10,150,136,0.18) 0%, transparent 65%);
  pointer-events:none;
}
.top-line {
  height:3px;
  background: linear-gradient(90deg, ${B.teal}, ${B.tealLt}, transparent);
  flex-shrink:0;
}
.main {
  flex:1; display:flex; flex-direction:column;
  justify-content:center; padding:80px 96px 60px;
  position:relative; z-index:1;
}
.label {
  font-size:14px; font-weight:700; letter-spacing:0.22em;
  text-transform:uppercase; color:${B.teal};
  display:flex; align-items:center; gap:10px; margin-bottom:44px;
}
.label::before {
  content:''; display:block; width:28px; height:2px;
  background:${B.teal}; flex-shrink:0;
}
.hook {
  font-family:'Bebas Neue',sans-serif;
  font-size:96px; line-height:1.0; letter-spacing:0.01em;
  color:#fff; margin-bottom:36px;
}
.hook .hl { color:${B.tealLt}; }
.sub {
  font-size:18px; font-weight:500; color:rgba(255,255,255,0.42);
  border-left:2px solid ${B.teal}; padding-left:20px; line-height:1.6;
}
.swipe {
  position:absolute; bottom:100px; right:96px;
  display:flex; align-items:center; gap:10px;
  font-size:13px; font-weight:700; letter-spacing:0.12em;
  text-transform:uppercase; color:rgba(255,255,255,0.35);
}
.swipe-arrow {
  width:36px; height:36px; border-radius:50%;
  border:1px solid rgba(255,255,255,0.18);
  display:flex; align-items:center; justify-content:center;
  font-size:18px; color:rgba(255,255,255,0.55);
}
.footer {
  background:rgba(255,255,255,0.04);
  border-top:1px solid rgba(255,255,255,0.07);
  padding:22px 96px;
  display:flex; align-items:center; justify-content:space-between;
  flex-shrink:0; position:relative; z-index:1;
}
.brand { display:flex; align-items:center; gap:12px; }
.brand-box {
  width:34px; height:34px; background:${B.teal};
  border-radius:6px; display:flex; align-items:center;
  justify-content:center; font-size:17px;
}
.brand-name { font-size:15px; font-weight:900; color:#fff; }
.brand-loc  { font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:0.06em; text-transform:uppercase; margin-top:1px; }
.slide-count { font-size:12px; font-weight:700; color:rgba(255,255,255,0.3); letter-spacing:0.08em; }
</style></head>
<body>
  <div class="top-line"></div>
  <div class="main">
    <div class="label">Did You Know?</div>
    <div class="hook">${topic.hookLine}</div>
    <div class="sub">Swipe to find out what this means for your home →</div>
  </div>
  <div class="swipe"><span>SWIPE</span><div class="swipe-arrow">→</div></div>
  <div class="footer">
    <div class="brand">
      <div class="brand-box">🧹</div>
      <div>
        <div class="brand-name">AskMiro</div>
        <div class="brand-loc">London · Professional Cleaning</div>
      </div>
    </div>
    <div class="slide-count">1 / ${topic.facts.length + 2}</div>
  </div>
</body></html>`;
}

// ── Slides 1–N: Fact cards ─────────────────────────────────────────────────
function factSlide(fact, index, total) {
  const num = String(index).padStart(2, '0');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${FONTS}
<style>
${BASE_STYLE}
body {
  background:${B.base};
  display:flex; flex-direction:column;
  position:relative;
}
/* very faint teal wash */
body::before {
  content:''; position:absolute;
  bottom:0; left:0; width:450px; height:450px;
  background:radial-gradient(ellipse at bottom left, rgba(10,150,136,0.07) 0%, transparent 65%);
  pointer-events:none;
}
.top-line {
  height:3px;
  background:linear-gradient(90deg, ${B.teal}, ${B.tealLt}, transparent);
  flex-shrink:0;
}
.main {
  flex:1; display:flex; flex-direction:column;
  justify-content:center; padding:72px 96px 48px;
  position:relative; z-index:1;
}
.num {
  font-family:'Bebas Neue',sans-serif;
  font-size:140px; line-height:1; color:rgba(10,150,136,0.12);
  position:absolute; top:48px; right:80px;
  user-select:none;
}
.fact-label {
  font-size:12px; font-weight:700; letter-spacing:0.22em;
  text-transform:uppercase; color:${B.teal};
  display:flex; align-items:center; gap:10px; margin-bottom:36px;
}
.fact-label::before {
  content:''; display:block; width:24px; height:2px;
  background:${B.teal}; flex-shrink:0;
}
.fact-title {
  font-family:'Bebas Neue',sans-serif;
  font-size:72px; line-height:1.05; letter-spacing:0.01em;
  color:${B.txt}; margin-bottom:32px; max-width:820px;
}
.fact-title .hl { color:${B.teal}; }
.divider {
  width:40px; height:3px; background:${B.teal};
  border-radius:2px; margin-bottom:32px;
}
.fact-body {
  font-size:22px; font-weight:500; color:${B.txtSec};
  line-height:1.65; max-width:820px;
}
.fact-body strong { color:${B.txt}; font-weight:700; }
.footer {
  background:${B.dark};
  padding:22px 96px;
  display:flex; align-items:center; justify-content:space-between;
  flex-shrink:0; position:relative; z-index:1;
}
.brand { display:flex; align-items:center; gap:12px; }
.brand-box {
  width:34px; height:34px; background:${B.teal};
  border-radius:6px; display:flex; align-items:center;
  justify-content:center; font-size:17px;
}
.brand-name { font-size:15px; font-weight:900; color:#fff; }
.brand-loc  { font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:0.06em; text-transform:uppercase; margin-top:1px; }
.slide-count { font-size:12px; font-weight:700; color:rgba(255,255,255,0.35); letter-spacing:0.08em; }
</style></head>
<body>
  <div class="top-line"></div>
  <div class="main">
    <div class="num">${num}</div>
    <div class="fact-label">Fact #${index}</div>
    <div class="fact-title">${fact.title}</div>
    <div class="divider"></div>
    <div class="fact-body">${fact.body}</div>
  </div>
  <div class="footer">
    <div class="brand">
      <div class="brand-box">🧹</div>
      <div>
        <div class="brand-name">AskMiro</div>
        <div class="brand-loc">London · Professional Cleaning</div>
      </div>
    </div>
    <div class="slide-count">${index + 1} / ${total}</div>
  </div>
</body></html>`;
}

// ── Last slide: CTA ────────────────────────────────────────────────────────
function ctaSlide(topic, total) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${FONTS}
<style>
${BASE_STYLE}
body {
  background:${B.dark};
  display:flex; flex-direction:column;
  position:relative;
}
body::after {
  content:''; position:absolute;
  top:-60px; left:50%; transform:translateX(-50%);
  width:700px; height:500px;
  background:radial-gradient(ellipse, rgba(10,150,136,0.14) 0%, rgba(10,150,136,0.04) 45%, transparent 70%);
  pointer-events:none;
}
.top-line {
  height:3px;
  background:linear-gradient(90deg, ${B.teal}, ${B.tealLt}, transparent);
  flex-shrink:0;
}
.main {
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  padding:80px 96px; text-align:center;
  position:relative; z-index:1;
}
.cta-eyebrow {
  font-size:13px; font-weight:700; letter-spacing:0.22em;
  text-transform:uppercase; color:${B.teal}; margin-bottom:32px;
}
.cta-heading {
  font-family:'Bebas Neue',sans-serif;
  font-size:96px; line-height:1.0; color:#fff;
  margin-bottom:24px; letter-spacing:0.01em;
}
.cta-heading .hl { color:${B.tealLt}; }
.cta-sub {
  font-size:20px; font-weight:500;
  color:rgba(255,255,255,0.45); margin-bottom:56px;
  max-width:600px; line-height:1.6;
}
.cta-btn {
  background:${B.teal}; color:#fff;
  font-size:16px; font-weight:700; letter-spacing:0.08em;
  text-transform:uppercase; padding:20px 52px;
  border-radius:6px; margin-bottom:28px;
  display:inline-block;
}
.cta-url {
  font-size:14px; color:rgba(255,255,255,0.3);
  letter-spacing:0.04em;
}
.footer {
  background:rgba(255,255,255,0.04);
  border-top:1px solid rgba(255,255,255,0.07);
  padding:22px 96px;
  display:flex; align-items:center; justify-content:space-between;
  flex-shrink:0; position:relative; z-index:1;
}
.brand { display:flex; align-items:center; gap:12px; }
.brand-box {
  width:34px; height:34px; background:${B.teal};
  border-radius:6px; display:flex; align-items:center;
  justify-content:center; font-size:17px;
}
.brand-name { font-size:15px; font-weight:900; color:#fff; }
.brand-loc  { font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:0.06em; text-transform:uppercase; margin-top:1px; }
.slide-count { font-size:12px; font-weight:700; color:rgba(255,255,255,0.35); letter-spacing:0.08em; }
</style></head>
<body>
  <div class="top-line"></div>
  <div class="main">
    <div class="cta-eyebrow">Ready for a cleaner space?</div>
    <div class="cta-heading">Book a <span class="hl">Free</span> Quote</div>
    <div class="cta-sub">${topic.ctaLine}</div>
    <div class="cta-btn">Get Your Free Quote →</div>
    <div class="cta-url">askmiro.com</div>
  </div>
  <div class="footer">
    <div class="brand">
      <div class="brand-box">🧹</div>
      <div>
        <div class="brand-name">AskMiro</div>
        <div class="brand-loc">London · Fully Insured · DBS Checked</div>
      </div>
    </div>
    <div class="slide-count">${total} / ${total}</div>
  </div>
</body></html>`;
}

// ── Generate carousel topic via Claude ────────────────────────────────────
export async function generateCarouselTopic() {
  const prompt = `You are writing a "Did You Know?" Instagram/Facebook carousel for AskMiro Cleaning Services, a professional cleaning company in London, UK.

Generate a carousel with 4 surprising, genuinely useful facts about cleaning in the UK context (British homes, UK regulations, UK weather effects on homes, UK letting laws, etc).

Each fact must:
- Be surprising or counterintuitive — something most people don't know
- Tie naturally to a professional cleaning service (end of tenancy, deep clean, office clean, Airbnb clean)
- Be true and specific (use real numbers/stats where possible)
- Be written for a UK audience (use British spelling, reference UK-specific things)

Return JSON:
{
  "hookLine": "A shocking 1-line hook (max 8 words, all caps impact, like a newspaper headline)",
  "facts": [
    {
      "title": "Short punchy title (max 6 words, sentence case, highlight key word with <span class='hl'>word</span>)",
      "body": "2-3 sentences explaining the fact. Include a specific stat or detail. End with why this matters for their home or tenancy."
    }
  ],
  "ctaLine": "1-2 sentences connecting these facts to booking AskMiro. Mention a specific service.",
  "caption": "Full Instagram/Facebook caption for the carousel post. 80-120 words. Engaging, references the facts, ends with CTA and link in bio.",
  "hashtags": "#LondonCleaning #DeepCleanLondon #EndOfTenancy #UKHome #ProfessionalCleaning #CleaningTips #LondonLife #AskMiro #PropertyLondon #LandlordLife"
}

Generate exactly 4 facts. Make the hookLine impossible to scroll past.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');
  return JSON.parse(match[0]);
}

// ── Render a single HTML slide to PNG ────────────────────────────────────
async function renderSlide(html, outputPath, browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: outputPath, type: 'png', clip: { x:0, y:0, width:1080, height:1080 } });
  await page.close();
  return outputPath;
}

// ── Main: generate topic + render all slides ──────────────────────────────
export async function renderCarousel(topic, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const slides = [];
  const total = topic.facts.length + 2; // hook + facts + CTA

  try {
    console.log('  ✦ Rendering slide 1 (hook)...');
    const hookPath = path.join(outputDir, 'slide-00-hook.png');
    await renderSlide(hookSlide(topic), hookPath, browser);
    slides.push(hookPath);

    for (let i = 0; i < topic.facts.length; i++) {
      console.log(`  ✦ Rendering slide ${i + 2} (fact ${i + 1})...`);
      const factPath = path.join(outputDir, `slide-0${i+1}-fact.png`);
      await renderSlide(factSlide(topic.facts[i], i + 1, total), factPath, browser);
      slides.push(factPath);
    }

    console.log(`  ✦ Rendering slide ${total} (CTA)...`);
    const ctaPath = path.join(outputDir, `slide-0${total - 1}-cta.png`);
    await renderSlide(ctaSlide(topic, total), ctaPath, browser);
    slides.push(ctaPath);

  } finally {
    await browser.close();
  }

  console.log(`  ✅ ${slides.length} slides rendered to ${outputDir}`);
  return slides;
}

// ── Standalone runner ─────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Load env
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !m[2].startsWith('#')) process.env[m[1]] = m[2].trim();
    }
  }

  console.log('\n🎠 AskMiro Carousel Generator\n');
  console.log('  ✦ Generating carousel topic via Claude...');
  const topic = await generateCarouselTopic();
  console.log(`  ✅ Hook: "${topic.hookLine}"`);
  console.log(`  ✅ ${topic.facts.length} facts generated\n`);

  const date = new Date().toISOString().split('T')[0];
  const outputDir = path.join(__dirname, 'output', `${date}-carousel`);
  const slides = await renderCarousel(topic, outputDir);

  // Save topic JSON
  fs.writeFileSync(path.join(outputDir, 'topic.json'), JSON.stringify(topic, null, 2));
  fs.writeFileSync(path.join(__dirname, 'output', 'latest-carousel.json'),
    JSON.stringify({ ...topic, slides, outputDir }, null, 2));

  console.log('\n  📋 Caption preview:');
  console.log(`  ${topic.caption}\n`);
  console.log(`  📁 Slides: ${outputDir}`);
  console.log(`  💡 Open with: open "${outputDir}"\n`);

  // Open folder
  const { execSync } = await import('child_process');
  try { execSync(`open "${outputDir}"`); } catch {}
}
