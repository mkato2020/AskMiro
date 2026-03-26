// ============================================================
// AskMiro — netlify/functions/send-email.js
// Sends a branded email with optional file attachments via Resend.
// Called by email.js when the compose form has attachments.
// Requires env var: RESEND_API_KEY
// ============================================================

const FROM     = 'AskMiro Cleaning Services <office@askmiro.com>';
const REPLY_TO = 'info@askmiro.com';
const BCC      = 'info@askmiro.com';

export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey)
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500, headers });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers }); }

  const { to, subject, htmlBody, replyTo, fromName, attachments = [] } = body;

  if (!to || !to.includes('@'))
    return new Response(JSON.stringify({ error: 'Invalid recipient email' }), { status: 400, headers });
  if (!subject)
    return new Response(JSON.stringify({ error: 'Missing subject' }), { status: 400, headers });
  if (!htmlBody)
    return new Response(JSON.stringify({ error: 'Missing email body' }), { status: 400, headers });

  const payload = {
    from:     fromName ? `${fromName} <office@askmiro.com>` : FROM,
    reply_to: replyTo || REPLY_TO,
    to:       [to],
    bcc:      [BCC],
    subject,
    html:     htmlBody,
  };

  if (attachments.length) {
    // Resend expects: [{ filename, content (base64 string) }]
    payload.attachments = attachments.map(a => ({
      filename: a.name,
      content:  a.data,   // base64-encoded file content
    }));
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[send-email] Resend error:', res.status, err);
      return new Response(JSON.stringify({ error: `Resend ${res.status}: ${err}` }), { status: 502, headers });
    }

    const result = await res.json();
    console.log('[send-email] sent to', to, '| id:', result.id, '| attachments:', attachments.length);
    return new Response(JSON.stringify({ sent: true, id: result.id }), { status: 200, headers });

  } catch (e) {
    console.error('[send-email] fetch error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
};

export const config = { path: '/api/send-email' };
