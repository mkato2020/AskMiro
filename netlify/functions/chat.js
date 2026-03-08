/**
 * AskMiro Chat Function  v2.0.0
 * ─────────────────────────────────────────────────────────────────
 * Netlify Function: /api/chat
 *
 * What's new in v2:
 *  - Miro proactively collects name / email / phone / postcode
 *  - Once all 4 are detected, fires a lead to GAS (createChatLead)
 *  - GAS sends email notification + creates CRM lead row
 *  - Full transcript saved with every lead
 *  - Duplicate-safe: client passes leadAlreadyFired flag
 *
 * ENV VARS (set in Netlify → Site Settings → Environment Variables):
 *   ANTHROPIC_API_KEY   — your Claude API key
 *   GAS_URL             — your GAS deployment URL
 *   GAS_TOKEN           — your GAS secret token
 * ─────────────────────────────────────────────────────────────────
 */

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    messages = [],
    sessionId = null,
    leadAlreadyFired = false,
  } = body;

  // ── SYSTEM PROMPT ──────────────────────────────────────────────
  const SYSTEM = `You are Miro, the friendly AI receptionist for AskMiro Cleaning Services — a managed commercial cleaning company based in London.

Your job:
1. Answer questions about AskMiro's services warmly and helpfully
2. Qualify the visitor (type of premises, cleaning frequency, location)
3. Collect contact details so a human can follow up with a tailored quote

SERVICES: Office & commercial cleaning, residential blocks, automotive dealerships, medical & healthcare, retail & hospitality, educational institutions. COSHH-compliant, DBS-checked teams, £10M public liability, eco-conscious methods, fixed monthly rates, 24h quote turnaround.

CONTACT COLLECTION:
- Only ask for contact details AFTER understanding what they need (at least 1-2 exchanges)
- Ask naturally — not like a form. E.g. "I'd love to get someone to put a proper quote together for you — could I grab your name and best email?"
- Collect in order over natural conversation: full name → email → phone number → postcode
- Once you have all four, confirm them back warmly and say the team will be in touch within 24 hours
- If they decline, offer: 020 8073 0621 and info@askmiro.com

TONE: Professional but warm. Concise. Write in natural sentences — no bullet lists in chat. Never say "As an AI". You ARE Miro.

CRITICAL: When you have successfully collected AND confirmed all four details (name, email, phone, postcode), append this JSON token on its own line at the very end of your message — nothing after it:
LEAD_CAPTURED:{"name":"VALUE","email":"VALUE","phone":"VALUE","postcode":"VALUE"}

Only include LEAD_CAPTURED when you genuinely have all four values confirmed by the user.`;

  // ── CALL CLAUDE ────────────────────────────────────────────────
  let assistantMessage = '';
  let leadData = null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        system: SYSTEM,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error — status:', response.status, '— body:', errText);
      console.error('API key present:', !!process.env.ANTHROPIC_API_KEY);
      console.error('API key prefix:', (process.env.ANTHROPIC_API_KEY || '').slice(0, 12));
      throw new Error('Claude API error: ' + response.status);
    }

    const data = await response.json();
    assistantMessage = data.content?.[0]?.text
      || "I'm sorry, I had a hiccup! Please call us on 020 8073 0621 or email info@askmiro.com.";

    // ── EXTRACT LEAD TOKEN ───────────────────────────────────────
    const leadMatch = assistantMessage.match(/LEAD_CAPTURED:(\{[^\n}]+\})/);
    if (leadMatch) {
      try {
        leadData = JSON.parse(leadMatch[1]);
      } catch (parseErr) {
        console.error('Lead JSON parse error:', parseErr, leadMatch[1]);
        leadData = null;
      }
      // Remove token from the visible reply
      assistantMessage = assistantMessage
        .replace(/\n?LEAD_CAPTURED:\{[^\n}]+\}/, '')
        .trim();
    }

  } catch (err) {
    console.error('Chat function error:', err);
    assistantMessage = "Sorry, I'm having a moment! Please call us on 020 8073 0621 or email info@askmiro.com and we'll get right back to you.";
  }

  // ── FIRE LEAD TO GAS ──────────────────────────────────────────
  let leadFired = false;

  if (leadData && !leadAlreadyFired && process.env.GAS_URL && process.env.GAS_TOKEN) {
    // Build readable transcript
    const transcript = [
      ...messages.map(m =>
        `${m.role === 'user' ? 'Visitor' : 'Miro'}: ${m.content}`
      ),
      `Miro: ${assistantMessage}`,
    ].join('\n');

    const gasPayload = {
      token:      process.env.GAS_TOKEN,
      action:     'createChatLead',
      name:       leadData.name      || '',
      email:      leadData.email     || '',
      phone:      leadData.phone     || '',
      postcode:   leadData.postcode  || '',
      source:     'chat',
      sessionId:  sessionId          || 'unknown',
      transcript: transcript,
      createdAt:  new Date().toISOString(),
    };

    try {
      const gasRes = await fetch(process.env.GAS_URL + '?action=webhook.chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gasPayload),
      });

      if (gasRes.ok) {
        leadFired = true;
        console.log('✅ Chat lead saved:', leadData.email);
      } else {
        const errBody = await gasRes.text();
        console.error('GAS lead failed:', errBody);
      }
    } catch (gasErr) {
      console.error('GAS fetch error:', gasErr);
      // Non-fatal — chat still works fine
    }
  }

  // ── RESPOND ───────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      message:   assistantMessage,
      leadFired: leadFired,
      leadData:  leadFired ? leadData : null,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
};

export const config = { path: '/api/chat' };
