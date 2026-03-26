// ============================================================
// AskMiro — netlify/functions/send-email.js
// Sends branded emails with optional attachments via Resend.
// Called by email.js (attachment path only).
//
// Env vars:
//   RESEND_API_KEY            — required for production
//   RESEND_DOMAIN_VERIFIED    — set to "true" once domain is verified
//   EMAIL_DEV_MODE            — set to "true" to log instead of sending
// ============================================================

const FROM     = 'AskMiro Cleaning Services <office@askmiro.com>';
const REPLY_TO = 'info@askmiro.com';
const BCC      = 'info@askmiro.com';

// ── Friendly error messages for known Resend error codes ──
function friendlyResendError(status, raw) {
  if (status === 403) {
    if (raw.includes('domain') || raw.includes('verified') || raw.includes('not verified'))
      return 'Email domain (askmiro.com) is not yet verified in Resend. Please verify the domain in your Resend dashboard before sending with attachments.';
    return 'Resend API access denied (403). Check your API key permissions.';
  }
  if (status === 401) return 'Invalid Resend API key. Check the RESEND_API_KEY environment variable.';
  if (status === 422) return 'Email rejected by Resend — check the recipient address and subject line.';
  if (status === 429) return 'Resend rate limit reached. Please wait a moment and try again.';
  if (status >= 500)  return 'Resend is experiencing an outage. Please try again shortly.';
  return `Email send failed (${status}). Please try again or contact support.`;
}

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

  // ── Dev mode — log to console instead of sending ──────────
  const devMode = process.env.EMAIL_DEV_MODE === 'true';

  // ── Domain verified check ──────────────────────────────────
  const domainVerified = process.env.RESEND_DOMAIN_VERIFIED === 'true';
  if (!devMode && !domainVerified) {
    console.warn('[EMAIL_SEND_FAILED] Domain not verified — RESEND_DOMAIN_VERIFIED is not set to true');
    return new Response(JSON.stringify({
      error: 'Email sending is currently disabled. The domain askmiro.com needs to be verified in Resend before emails with attachments can be sent.',
      code:  'DOMAIN_NOT_VERIFIED',
    }), { status: 503, headers });
  }

  // ── API key check ──────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  if (!devMode && !apiKey) {
    console.error('[EMAIL_SEND_FAILED] RESEND_API_KEY not configured');
    return new Response(JSON.stringify({
      error: 'Email service is not configured. Contact support.',
      code:  'MISSING_API_KEY',
    }), { status: 500, headers });
  }

  // ── Parse body ────────────────────────────────────────────
  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers }); }

  const { to, subject, htmlBody, replyTo, fromName, attachments = [] } = body;

  if (!to || !to.includes('@'))
    return new Response(JSON.stringify({ error: 'Invalid recipient email address' }), { status: 400, headers });
  if (!subject)
    return new Response(JSON.stringify({ error: 'Missing email subject' }), { status: 400, headers });
  if (!htmlBody)
    return new Response(JSON.stringify({ error: 'Missing email body' }), { status: 400, headers });

  // ── Dev mode — skip Resend, log to console ────────────────
  if (devMode) {
    console.log('[send-email] DEV MODE — email not sent');
    console.log('[send-email] To:', to);
    console.log('[send-email] Subject:', subject);
    console.log('[send-email] Attachments:', attachments.map(a => a.name).join(', ') || 'none');
    return new Response(JSON.stringify({ sent: true, id: 'DEV-' + Date.now(), dev: true }), { status: 200, headers });
  }

  // ── Build Resend payload ───────────────────────────────────
  const payload = {
    from:     fromName ? `${fromName} <office@askmiro.com>` : FROM,
    reply_to: replyTo || REPLY_TO,
    to:       [to],
    bcc:      [BCC],
    subject,
    html:     htmlBody,
  };

  if (attachments.length) {
    payload.attachments = attachments.map(a => ({
      filename: a.name,
      content:  a.data,
    }));
  }

  // ── Send via Resend ───────────────────────────────────────
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const rawText = await res.text();

    if (!res.ok) {
      console.error('[EMAIL_SEND_FAILED] Resend', res.status, '|', rawText);
      return new Response(JSON.stringify({
        error: friendlyResendError(res.status, rawText),
        code:  'EMAIL_SEND_FAILED',
        status: res.status,
      }), { status: 502, headers });
    }

    let result = {};
    try { result = JSON.parse(rawText); } catch (_) {}
    console.log('[send-email] ✓ sent to', to, '| id:', result.id, '| attachments:', attachments.length);
    return new Response(JSON.stringify({ sent: true, id: result.id }), { status: 200, headers });

  } catch (e) {
    console.error('[EMAIL_SEND_FAILED] fetch error:', e.message);
    return new Response(JSON.stringify({
      error: 'Could not reach the email service. Check your connection and try again.',
      code:  'EMAIL_SEND_FAILED',
    }), { status: 500, headers });
  }
};

export const config = { path: '/api/send-email' };
