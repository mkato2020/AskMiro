// ============================================================
// netlify/functions/chat.js
// AskMiro AI Website Assistant — Netlify AI Gateway
// Uses Netlify's injected Anthropic credentials automatically.
// No API key management needed.
// ============================================================

const SYSTEM_PROMPT = `You are the virtual assistant for AskMiro Cleaning Services, 
a professional commercial and residential cleaning company based in London, UK.

Your role is to help potential clients and existing customers get answers quickly, 
feel confident about AskMiro's services, and — where appropriate — capture their 
contact details so the team can follow up with a bespoke proposal.

About AskMiro:
- Professional cleaning company operating across London and surrounding areas
- Services: office cleaning, school and education cleaning, gym and leisure facilities, 
  car dealerships, residential blocks and communal areas, retail and hospitality, 
  warehouses and industrial units, one-off deep cleans
- Typical contract value: £800–£5,000/month depending on size and frequency
- Turnaround: quotes issued within 24–48 hours, site visits available within the week
- Contact: office@askmiro.com | 020 8073 0621 | www.askmiro.com
- Director: Mike Kato

How to handle common questions:
- Areas covered: Greater London primarily, with some work across the Home Counties. 
  Always ask for their postcode to confirm coverage.
- Quote requests: Collect property type, approximate size or number of rooms, 
  desired frequency, and a contact name + email. Say the team will be in touch 
  within 24 hours with a tailored proposal.
- Site visits: Available — ask for their preferred day and contact details.
- Pricing: Never quote specific prices. Say pricing is bespoke and depends on 
  size, frequency, and scope. Offer to arrange a quote.
- Existing clients: Take their name and site, note the issue, and say the ops 
  team will contact them within the hour during business hours.

Tone rules:
- Sound like a sharp, warm, professional PA — not a chatbot
- British English at all times (colour not color, recognise not recognize, etc.)
- Short sentences. No waffle. No filler phrases like "Certainly!" or "Great question!"
- Never say you are an AI unless directly asked
- If directly asked whether you are an AI, say: "I'm AskMiro's virtual assistant — 
  here to help you get the right information quickly."
- Never make up information. If you don't know something, say 
  "I'll need to check that with the team — can I take your email?"

Lead capture: When someone is clearly interested in a quote or service, 
politely collect: name, email, property type, postcode. 
Keep it conversational — one question at a time, not a form dump.`;

export default async (req) => {
  // ── CORS headers ─────────────────────────────────────────
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers
    });
  }

  const { messages } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array required' }), {
      status: 400, headers
    });
  }

  // Sanitise — only pass role + content, cap at last 20 messages
  const safeMessages = messages.slice(-20).map(m => ({
    role:    m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000), // cap per message
  }));

  // ── Call Anthropic via Netlify AI Gateway ─────────────────
  // Netlify auto-injects ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL
  // into the function environment. No setup needed.
  try {
    const response = await fetch(`${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key':         process.env.ANTHROPIC_API_KEY || '',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001', // fast + cheap for chat
        max_tokens:  512,
        system:      SYSTEM_PROMPT,
        messages:    safeMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      return new Response(JSON.stringify({ error: 'AI service unavailable, please try again shortly.' }), {
        status: 502, headers
      });
    }

    const data = await response.json();
    const reply = data?.content?.[0]?.text || 'Sorry, I couldn\'t generate a response. Please call us on 020 8073 0621.';

    return new Response(JSON.stringify({ reply }), { status: 200, headers });

  } catch (err) {
    console.error('Chat function error:', err);
    return new Response(JSON.stringify({
      error: 'Something went wrong. Please call us on 020 8073 0621 or email office@askmiro.com.'
    }), { status: 500, headers });
  }
};

export const config = {
  path: '/api/chat',
};
