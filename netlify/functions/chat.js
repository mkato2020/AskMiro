const SYSTEM_PROMPT = `You are the virtual assistant for AskMiro Cleaning Services, a professional commercial and residential cleaning company based in London, UK.

Your role is to help potential clients get answers quickly and — where appropriate — capture their contact details so the team can follow up.

About AskMiro:
- Professional cleaning company operating across London and surrounding areas
- Services: office cleaning, schools, gyms, car dealerships, residential blocks, retail, warehouses, one-off deep cleans
- Typical contract value: £800–£5,000/month
- Turnaround: quotes within 24–48 hours, site visits available within the week
- Contact: info@askmiro.com | 020 8073 0621 | www.askmiro.com
- Director: Mike Kato

Tone: Sharp, warm, professional. British English. Short sentences. No filler phrases like "Certainly!" or "Great question!". Never say you are an AI unless directly asked. If asked, say: "I'm AskMiro's virtual assistant — here to help you get the right information quickly."

Pricing: Never quote specific prices. Say pricing is bespoke. Offer to arrange a quote.

Lead capture: When someone is clearly interested in a quote or service, politely collect their name, email, phone number, and postcode — one question at a time, conversationally.

VALIDATION RULES — before accepting each piece of information, silently check it meets these rules. If it doesn't, politely ask again:
- Name: must be at least two words (first and last name). If they give one word only, ask for their full name.
- Email: must contain @ and a dot after it (e.g. name@domain.com). If it looks wrong, say "Just to make sure I've got that right — could you double-check your email address?"
- Phone: must be a valid UK number — either 11 digits starting with 07 or 01/02/03, or a +44 format. If it contains letters or is too short/long, ask them to confirm it.
- Postcode: must match UK postcode format (e.g. SW1A 1AA, E1 6AN, M1 1AE). If it doesn't look right, ask them to confirm.

Only emit the LEAD_CAPTURED token once ALL FOUR fields have been collected and pass validation. Never emit it if any field is missing or invalid.

Once you have all four confirmed, add this token on a new line at the very end of your reply (never show it to the user, it is invisible metadata):
LEAD_CAPTURED:{"name":"VALUE","email":"VALUE","phone":"VALUE","postcode":"VALUE"}`;

// ── Server-side validation (safety net after Claude) ─────────────────────────
function validateLeadData(d) {
  const errors = [];

  const name = (d.name || '').trim();
  if (name.split(/\s+/).length < 2) errors.push('name must be at least two words');

  const email = (d.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('invalid email');

  const phone = (d.phone || '').replace(/\s/g, '');
  if (!/^(\+44\d{10}|0[1-9]\d{9})$/.test(phone)) errors.push('invalid UK phone');

  const postcode = (d.postcode || '').trim().toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/.test(postcode)) errors.push('invalid UK postcode');

  return errors;
}

export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ message: 'Invalid request' }), { status: 400, headers }); }

  const { sessionId = 'unknown', leadAlreadyFired = false } = body;

  const messages = (body.messages || []).slice(-20).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  if (messages.length === 0) {
    return new Response(JSON.stringify({ message: 'No messages provided' }), { status: 400, headers });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return new Response(JSON.stringify({ message: 'Please call us on 020 8073 0621.' }), { status: 200, headers });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    const text = await res.text();
    console.log('Anthropic status:', res.status);

    if (!res.ok) {
      console.error('Anthropic error:', text);
      return new Response(JSON.stringify({ message: 'Our assistant is unavailable. Please call 020 8073 0621.' }), { status: 200, headers });
    }

    const data = JSON.parse(text);
    const rawReply = data?.content?.[0]?.text || 'Please call us on 020 8073 0621.';

    // Extract LEAD_CAPTURED token if present
    let message = rawReply;
    let leadData = null;
    const leadMatch = rawReply.match(/\nLEAD_CAPTURED:(\{[^\n}]+\})/);
    if (leadMatch) {
      try { leadData = JSON.parse(leadMatch[1]); } catch { leadData = null; }
      message = rawReply.replace(/\nLEAD_CAPTURED:\{[^\n}]+\}/, '').trim();
    }

    // Server-side validation — reject bad data even if Claude missed it
    if (leadData) {
      const errors = validateLeadData(leadData);
      if (errors.length > 0) {
        console.warn('Lead failed server validation:', errors.join(', '), JSON.stringify(leadData));
        leadData = null; // don't fire to GAS
      }
    }

    // Fire lead to GAS (once per session, only if validation passed)
    let leadFired = false;
    if (leadData && !leadAlreadyFired && process.env.GAS_URL && process.env.GAS_TOKEN) {
      try {
        const transcript = messages
          .map(m => `${m.role === 'user' ? 'Visitor' : 'Miro'}: ${m.content}`)
          .concat([`Miro: ${message}`])
          .join('\n');

        const gasRes = await fetch(process.env.GAS_URL + '?action=webhook.chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token:      process.env.GAS_TOKEN,
            action:     'createChatLead',
            name:       leadData.name     || '',
            email:      leadData.email    || '',
            phone:      leadData.phone    || '',
            postcode:   leadData.postcode || '',
            source:     'chat',
            sessionId,
            transcript,
            createdAt:  new Date().toISOString(),
          }),
        });
        if (gasRes.ok) {
          leadFired = true;
          console.log('Chat lead fired to GAS:', leadData.email);
        } else {
          console.error('GAS error:', gasRes.status, await gasRes.text());
        }
      } catch (e) {
        console.error('GAS fetch error:', e.message);
      }
    }

    return new Response(JSON.stringify({ message, leadFired, leadData: leadFired ? leadData : null }), { status: 200, headers });

  } catch (err) {
    console.error('Function error:', err.message);
    return new Response(JSON.stringify({ message: 'Please call us on 020 8073 0621 or email info@askmiro.com.' }), { status: 200, headers });
  }
};

export const config = {
  path: '/api/chat',
};
