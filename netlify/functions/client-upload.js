// ============================================================
// AskMiro — netlify/functions/client-upload.js
// Receives client file uploads from /upload.html
// Stores files in Netlify Blobs (persistent, downloadable URLs)
// Sends notification email to info@askmiro.com via Resend
// and pings GAS to log the upload + file URLs against the lead.
//
// Env vars:
//   RESEND_API_KEY         — required for email
//   RESEND_DOMAIN_VERIFIED — must be "true" to send email
//   GAS_API_URL            — GAS deployment URL
// ============================================================

import { getStore } from '@netlify/blobs';

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

  // ── Store files in Netlify Blobs — generates permanent URLs ─
  const storedFiles = [];
  try {
    const store = getStore('uploads');
    for (const f of files) {
      const key    = `${refId || 'general'}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const buffer = Buffer.from(f.data, 'base64');
      await store.set(key, buffer, {
        metadata: { fileName: f.name, mimeType: f.mimeType || 'application/octet-stream', refId: refId || '', uploadedBy: name }
      });
      storedFiles.push({ name: f.name, key, url: `https://www.askmiro.com/api/files/${encodeURIComponent(key)}` });
      console.log('[client-upload] stored:', f.name, 'key:', key);
    }
  } catch (e) {
    console.error('[CLIENT_UPLOAD] blob storage error:', e.message);
    // Continue without blob URLs — still log to GAS
  }

  // ── Build notification email ────────────────────────────────
  const subject = `📎 Client Upload${refId ? ` — ${refId}` : ''}: ${name}`;
  const fileLinksHtml = storedFiles.length
    ? storedFiles.map(f => `<a href="${f.url}" style="display:block;padding:8px 12px;background:#F0FDF9;border:1px solid #A7F3D0;border-radius:6px;color:#0A9688;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:6px">📎 ${f.name}</a>`).join('')
    : files.map(f => `<div style="padding:8px 12px;background:#F8FAFC;border-radius:6px;font-size:13px;color:#475569;margin-bottom:6px">📎 ${f.name}</div>`).join('');

  const html = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#0DBDAD,#0A9688);padding:24px 28px">
    <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7);margin-bottom:4px">AskMiro Client Portal</div>
    <div style="font-size:22px;font-weight:800;color:#fff">New File Upload</div>
  </div>
  <div style="padding:24px 28px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      ${[
        ['Name',    name],
        ['Email',   email],
        refId   ? ['Lead Ref', refId]   : null,
        refName ? ['Company',  refName] : null,
        note    ? ['Note',     note]    : null,
      ].filter(Boolean).map(([k,v]) => `
        <tr>
          <td style="padding:8px 0;font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;width:80px">${k}</td>
          <td style="padding:8px 0 8px 16px;font-size:14px;color:#1E293B">${v}</td>
        </tr>`).join('')}
    </table>
    <div style="font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Files (${files.length})</div>
    ${fileLinksHtml}
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
      const res     = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const rawText = await res.text();
      if (!res.ok) { console.error('[CLIENT_UPLOAD] Resend error:', res.status, rawText); }
      else {
        let result = {};
        try { result = JSON.parse(rawText); } catch (_) {}
        console.log('[client-upload] ✓ email sent | id:', result.id, '| files:', files.length);
      }
    } catch (e) { console.error('[CLIENT_UPLOAD] email error:', e.message); }
  }

  // ── Ping GAS — include file URLs so they appear in CRM ─────
  if (gasUrl) {
    try {
      const fileLinks = storedFiles.map(f => `${f.name}::${f.url}`).join('|||');
      const gasParams = new URLSearchParams({
        action:      'webhook.upload',
        refId:       refId    || '',
        clientName:  name,
        clientEmail: email,
        fileCount:   String(files.length),
        fileNames:   files.map(f => f.name).join(', '),
        fileLinks,
        note:        note || '',
      });
      await fetch(`${gasUrl}?${gasParams.toString()}`);
    } catch (e) { console.warn('[CLIENT_UPLOAD] GAS ping failed:', e.message); }
  }

  return new Response(JSON.stringify({ ok: true, count: files.length, stored: storedFiles.length }), { status: 200, headers });
};

export const config = { path: '/api/client-upload' };
