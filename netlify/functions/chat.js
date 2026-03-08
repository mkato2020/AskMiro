const SYSTEM_PROMPT = `You are the virtual assistant for AskMiro Cleaning Services, a professional commercial and residential cleaning company based in London, UK.

Your role is to help potential clients get answers quickly and feel confident about AskMiro's services.

About AskMiro:
- Professional cleaning company operating across London and surrounding areas
- Services: office cleaning, schools, gyms, car dealerships, residential blocks, retail, warehouses, one-off deep cleans
- Typical contract value: £800–£5,000/month
- Turnaround: quotes within 24–48 hours, site visits available within the week
- Contact: office@askmiro.com | 020 8073 0621 | www.askmiro.com
- Director: Mike Kato

Tone: Sharp, warm, professional. British English. Short sentences. No filler phrases. Never say you are an AI unless directly asked.

Pricing: Never quote specific prices. Say pricing is bespoke. Offer to arrange a quote.

When someone wants a quote, collect name, email, property type, postcode — one question at a time.`;

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
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ message: 'Invalid request' }), { status: 400, headers });
  }

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
    const message = data?.content?.[0]?.text || 'Please call us on 020 8073 0621.';
    return new Response(JSON.stringify({ message }), { status: 200, headers });

  } catch (err) {
    console.error('Function error:', err.message);
    return new Response(JSON.stringify({ message: 'Please call us on 020 8073 0621 or email office@askmiro.com.' }), { status: 200, headers });
  }
};

export const config = {
  path: '/api/chat',
};
