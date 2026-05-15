/**
 * AskMiro Social Content Generator
 * Generates daily cleaning content: tips, facts, service highlights, before/after captions
 * Uses Claude API to write copy, rotates through content types on a weekly schedule
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env manually (no dotenv dep needed) ─────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) process.env[match[1]] = match[2].trim();
  }
}
loadEnv();

// ── Content type rotation (weekly schedule) ────────────────────────────────
// We rotate through 5 types so every week feels fresh
const CONTENT_TYPES = [
  'did_you_know',       // Fascinating cleaning fact
  'service_spotlight',  // Highlight one AskMiro service
  'cleaning_hack',      // Practical tip viewers can use today
  'before_after_tease', // Before/after narrative (even without photos)
  'why_professional',   // Persuasion post: why hire vs DIY
];

// Services AskMiro offers (pulled from the website)
const ASKMIRO_SERVICES = [
  'End of Tenancy Cleaning',
  'Deep Cleaning',
  'Office & Commercial Cleaning',
  'Airbnb & Short-Let Cleaning',
  'Carpet & Upholstery Cleaning',
  'After-Build / Post-Construction Cleaning',
  'Regular Domestic Cleaning',
  'Move-In / Move-Out Cleaning',
];

// Brand voice: professional but warm, London-based, trustworthy
const BRAND_VOICE = `
You are writing social media content for AskMiro Cleaning Services, a professional cleaning company based in London, UK.

Brand voice:
- Confident and professional, but warm and approachable
- Focus on transformation, trust, and peace of mind
- Use "we" and "our team" — never robotic or corporate
- Speak to busy professionals, landlords, Airbnb hosts, and homeowners
- Keep it punchy — short sentences, clear value, strong CTA
- Never use exclamation marks more than once per post
- Emojis: 2-3 max, relevant only

AskMiro facts:
- Based in London, UK
- Fully insured, professional team
- Specialises in: End of Tenancy, Deep Cleaning, Airbnb, Office, Carpet
- Contact: crownandcradleofficial@gmail.com / askmiro.com
- Trusted by landlords, letting agents, Airbnb hosts
`;

// ── Prompts per content type ───────────────────────────────────────────────
const PROMPTS = {
  did_you_know: `${BRAND_VOICE}

Write a "Did You Know?" cleaning fact post for Instagram/Facebook/TikTok.

Requirements:
- Start with "Did you know..." or a surprising statement
- The fact must be genuinely interesting and true (e.g. about bacteria counts, limescale, air quality, allergens, steam cleaning)
- Tie it back to why professional cleaning matters
- End with a soft CTA (e.g. "We handle this for you — link in bio")
- Hashtags: 8-10 relevant London cleaning hashtags
- Caption length: 80-120 words
- Also write a SHORT hook (first line only, max 10 words) for TikTok text overlay

Return JSON: { "hook": "...", "caption": "...", "hashtags": "...", "fact_headline": "..." }`,

  service_spotlight: `${BRAND_VOICE}

Write a service spotlight post highlighting one of these AskMiro services (pick the most shareable one):
${ASKMIRO_SERVICES.map(s => `- ${s}`).join('\n')}

Requirements:
- Lead with a pain point the customer has (e.g. "Losing your deposit because of cleaning?")
- Explain how AskMiro solves it in 2-3 sentences
- Include one specific detail that builds trust (e.g. "We use eco-friendly, landlord-approved products")
- Clear CTA to book
- Hashtags: 8-10
- Caption: 80-120 words

Return JSON: { "service": "...", "hook": "...", "caption": "...", "hashtags": "..." }`,

  cleaning_hack: `${BRAND_VOICE}

Write a cleaning hack/tip post that provides real value.

Requirements:
- The hack must be genuinely useful (e.g. baking soda + vinegar for drains, steam for grout, microfibre vs cotton)
- Frame it as "insider knowledge" from professional cleaners
- Acknowledge that some jobs still need pros (don't undermine the business)
- Conversational, list-friendly format (1-2-3 steps or bullet points)
- End with: "For the jobs that need a professional touch, that's what we're here for"
- Hashtags: 8-10
- Caption: 80-120 words

Return JSON: { "hook": "...", "caption": "...", "hashtags": "...", "hack_title": "..." }`,

  before_after_tease: `${BRAND_VOICE}

Write a before/after transformation post. This may or may not have an actual photo — write it as if describing an amazing transformation.

Requirements:
- Open with the "before" state (grimy oven, limescale-covered bathroom, carpet stains)
- Describe the transformation in vivid, satisfying language
- Make the reader feel the relief of a clean space
- Include how long the job took or how much the client loved the result
- CTA: "Book your transformation — link in bio" or "DM us for a free quote"
- Hashtags: 8-10
- Caption: 80-120 words

Return JSON: { "hook": "...", "caption": "...", "hashtags": "...", "transformation_type": "..." }`,

  why_professional: `${BRAND_VOICE}

Write a persuasion post answering: "Why hire professional cleaners instead of doing it yourself?"

Requirements:
- Don't shame DIY — respect the reader
- Focus on TIME, RESULTS, and PEACE OF MIND as the three pillars
- Use a relatable scenario (e.g. "You spent 4 hours cleaning and it still didn't pass inspection")
- Include one stat or specific detail (e.g. "End of tenancy cleans take our team 3-6 hours on average")
- CTA: "Free quote — no obligation"
- Hashtags: 8-10
- Caption: 80-120 words

Return JSON: { "hook": "...", "caption": "...", "hashtags": "..." }`,
};

// ── Claude API call ────────────────────────────────────────────────────────
async function generateContent(type) {
  const prompt = PROMPTS[type];
  if (!prompt) throw new Error(`Unknown content type: ${type}`);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Claude API error: ${data.error.message}`);

  const text = data.content[0].text;
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text}`);
  return { type, ...JSON.parse(jsonMatch[0]) };
}

// ── Determine today's content type ────────────────────────────────────────
function getTodayType(override = null) {
  if (override) return override;
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon ... 6=Sat
  // Mon–Fri rotate through 5 types, Sat = service_spotlight, Sun = before_after_tease
  const schedule = {
    0: 'before_after_tease',
    1: 'did_you_know',
    2: 'service_spotlight',
    3: 'cleaning_hack',
    4: 'why_professional',
    5: 'did_you_know',
    6: 'before_after_tease',
  };
  return schedule[dayOfWeek];
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isPreview = args.includes('--preview');
  const typeOverride = args.find(a => CONTENT_TYPES.includes(a));

  const type = getTodayType(typeOverride);
  console.log(`\n🧹 AskMiro Content Generator`);
  console.log(`📅 Content type: ${type}\n`);

  const content = await generateContent(type);

  console.log('═'.repeat(60));
  console.log(`🪝 HOOK (TikTok text / first line):`);
  console.log(`   ${content.hook}`);
  console.log('');
  console.log(`📝 CAPTION:`);
  console.log(content.caption);
  console.log('');
  console.log(`#️⃣  HASHTAGS:`);
  console.log(content.hashtags);
  console.log('═'.repeat(60));

  // Save to output file
  const outputDir = path.join(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const date = new Date().toISOString().split('T')[0];
  const outputPath = path.join(outputDir, `${date}-${type}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(content, null, 2));
  console.log(`\n✅ Saved to: output/${date}-${type}.json`);

  if (!isPreview) {
    // Signal to daily-post.mjs that content is ready
    fs.writeFileSync(path.join(outputDir, 'latest.json'), JSON.stringify(content, null, 2));
    console.log('✅ Written to output/latest.json — ready for daily-post.mjs');
  }

  return content;
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
