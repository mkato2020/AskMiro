// ============================================================
// AskMiro — netlify/functions/form-reply.js
// Netlify Forms submission webhook → auto-reply email
// POST /api/form-reply
//
// Wire up in Netlify UI:
//   Site → Forms → get-quote → Notifications → Outgoing webhook
//   URL: https://www.askmiro.com/api/form-reply
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

  // One acknowledgement per enquiry. The quote form calls this endpoint itself
  // with the full details; Netlify's outgoing form webhook then delivers the
  // same submission a second time (as { data: {...}, form_name, ... }) with no
  // service field. That second copy used to send a second, vaguer email to
  // the customer in the same second, so it is acknowledged and dropped.
  if (body && (body.data || body.form_name || body.form_id)) {
    return new Response(JSON.stringify({ skipped: true, reason: 'duplicate of the form\'s own call' }), { status: 200, headers });
  }
  const data = body;

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
