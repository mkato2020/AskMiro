// ============================================================
// AskMiro — netlify/functions/form-reply.js
// Netlify Forms submission webhook → auto-reply email
// POST /api/form-reply
//
// Wire up in Netlify UI:
//   Site → Forms → get-quote → Notifications → Outgoing webhook
//   URL: https://askmiro.co.uk/api/form-reply
// ============================================================

export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  // Netlify sends form data under body.data (outgoing webhook format)
  // or directly as fields if called via API
  const data = body.data || body;

  if (!data.email) {
    console.warn('form-reply: no email in payload', JSON.stringify(data).slice(0, 200));
    return new Response(JSON.stringify({ skipped: true, reason: 'no email' }), { status: 200, headers });
  }

  try {
    const { sendAutoReply } = await import('./auto-reply.js');
    const result = await sendAutoReply('quote', data);
    console.log('form-reply result:', result);
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (e) {
    console.error('form-reply error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
};

export const config = { path: '/api/form-reply' };
