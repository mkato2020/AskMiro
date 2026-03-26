// ============================================================
// AskMiro — netlify/functions/client-upload.js
// Receives client file uploads from /upload.html
// Sends notification email to info@askmiro.com via Resend
// and pings GAS to log the upload against the lead reference.
//
// Env vars:
//   RESEND_API_KEY         — required
//   RESEND_DOMAIN_VERIFIED — must be "true" to send
//   GAS_API_URL            — GAS deployment URL
// ============================================================

const FROM_NAME = 'AskMiro Client Portal';
const FROM_ADDR = 'office@askmiro.com';
const NOTIFY_TO = 'info@askmiro.com';
const MAX_FILE  = 10 * 1024 * 1024;  // 10 MB per file
const MAX_TOTAL = 25 * 1024 * 1024;  // 25 MB total

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

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers }); }

  const { name, email, note, refId, refName, files = [] } = body;

  // ── Validate ───────────────────────────────────────────────
  if (!name || !email || !email.includes('@'))
    return new Response(JSON.stringify({ error: 'Missing name or email' }), { status: 400, headers });
  if (!files.length)
    return new Response(JSON.stringify({ error: 'No files provided' }), { status: 400, headers });

  // ── Size check ─────────────────────────────────────────────
  let totalSize = 0;
  for (const f of files) {
    const bytes = Buffer.from(f.data, 'base64').length;
    if (bytes > MAX_FILE)
      return new Response(JSON.stringify({ error: `File "${f.name}" exceeds 10 MB limit` }), { status: 400, headers });
    totalSize += bytes;
  }
  if (totalSize > MAX_TOTAL)
    return new Response(JSON.stringify({ error: 'Total upload size exceeds 25 MB' }), { status: 400, headers });

  const apiKey         = process.env.RESEND_API_KEY;
  const domainVerified = process.env.RESEND_DOMAIN_VERIFIED === 'true';
  const gasUrl = process.env.GAS_API_URL ||
    'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec';

  // ── Build notification email ────────────────────────────────
  const subject = `📎 Client Upload${refId ? ` — ${refId}` : ''}: ${name}`;
  const html = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#0DBDAD,#0A9688);padding:24px 28px">
    <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7);margin-bottom:4px">AskMiro Client Portal</div>
    <div style="font-size:22px;font-weight:800;color:#fff">New File Upload</div>
  </div>
  <div style="padding:24px 28px">
    <table style="width:100%;border-collapse:collapse">
      ${[
        ['Name',      name],
        ['Email',     email],
        refId ? ['Lead Ref', refId] : null,
        refName ? ['Company', refName] : null,
        files.length ? ['Files', files.map(f => f.name).join(', ')] : null,
        note ? ['Notes', note] : null,
      ].filter(Boolean).map(([k,v]) => `
        <tr>
          <td style="padding:8px 0;font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;width:80px">${k}</td>
          <td style="padding:8px 0 8px 16px;font-size:14px;color:#1E293B">${v}</td>
        </tr>`).join('')}
    </table>
    ${note ? `<div style="margin-top:16px;padding:14px;background:#F8FAFC;border-radius:8px;border-left:3px solid #0DBDAD">
      <div style="font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Client Note</div>
      <div style="font-size:14px;color:#334155">${note}</div>
    </div>` : ''}
    <div style="margin-top:20px;padding:12px 16px;background:#F0FDF9;border-radius:8px;font-size:13px;color:#0A9688;font-weight:600">
      ${files.length} file${files.length !== 1 ? 's' : ''} attached to this email.
    </div>
  </div>
  <div style="padding:16px 28px;border-top:1px solid #F1F5F9;font-size:11px;color:#94A3B8">
    Uploaded via askmiro.com/upload.html${refId ? ` · Ref: ${refId}` : ''}
  </div>
</div>`;

  // ── Send via Resend ─────────────────────────────────────────
  if (apiKey && domainVerified) {
    try {
      const payload = {
        from:     `${FROM_NAME} <${FROM_ADDR}>`,
        reply_to: email,
        to:       [NOTIFY_TO],
        subject,
        html,
        attachments: files.map(f => ({ filename: f.name, content: f.data })),
      };

      const res = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const rawText = await res.text();
      if (!res.ok) {
        console.error('[CLIENT_UPLOAD] Resend error:', res.status, rawText);
        // Fall through to GAS-only log below
      } else {
        let result = {};
        try { result = JSON.parse(rawText); } catch (_) {}
        console.log('[client-upload] ✓ email sent | id:', result.id, '| files:', files.length, '| ref:', refId || 'none');
      }
    } catch (e) {
      console.error('[CLIENT_UPLOAD] email send error:', e.message);
    }
  } else {
    console.warn('[CLIENT_UPLOAD] Email not sent — domain not verified or API key missing. Files received from:', name, email);
  }

  // ── Ping GAS to log the upload ─────────────────────────────
  if (gasUrl) {
    try {
      const gasParams = new URLSearchParams({
        action:      'webhook.upload',
        refId:       refId    || '',
        clientName:  name,
        clientEmail: email,
        fileCount:   String(files.length),
        fileNames:   files.map(f => f.name).join(', '),
        note:        note || '',
      });
      await fetch(`${gasUrl}?${gasParams.toString()}`);
    } catch (e) {
      console.warn('[CLIENT_UPLOAD] GAS ping failed:', e.message);
    }
  }

  return new Response(JSON.stringify({ ok: true, count: files.length }), { status: 200, headers });
};

export const config = { path: '/api/client-upload' };
