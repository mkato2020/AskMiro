// ============================================================
// AskMiro — netlify/functions/auto-reply.js
// Shared auto-reply email sender via Resend API
// Called internally by chat.js and form-reply.js
// Requires env var: RESEND_API_KEY
// ============================================================

const FROM = 'AskMiro <info@askmiro.com>';
const REPLY_TO = 'info@askmiro.com';
const PHONE = '020 8073 0621';
const SITE = 'https://askmiro.co.uk';

// ── ENTRY POINT (also callable as a standalone function) ──
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

  const result = await sendAutoReply(body.type, body.data);
  return new Response(JSON.stringify(result), { status: result.error ? 500 : 200, headers });
};

export const config = { path: '/api/auto-reply' };

// ── SHARED SENDER (imported by other functions) ───────────
export async function sendAutoReply(type, data) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping auto-reply');
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }

  let email;
  if (type === 'quote') email = buildQuoteReply(data);
  else if (type === 'chat') email = buildChatReply(data);
  else if (type === 'quote-estimate') email = buildQuoteEstimateReply(data);
  else return { sent: false, reason: `Unknown type: ${type}` };

  if (!email.to || !email.to.includes('@')) {
    console.warn('Auto-reply skipped: invalid email address', email.to);
    return { sent: false, reason: 'Invalid recipient email' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: [email.to],
        bcc: [REPLY_TO],
        subject: email.subject,
        html: email.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', res.status, err);
      return { sent: false, reason: `Resend API ${res.status}: ${err}` };
    }

    const result = await res.json();
    console.log('Auto-reply sent to', email.to, '| id:', result.id);
    return { sent: true, id: result.id, to: email.to };

  } catch (e) {
    console.error('Auto-reply fetch error:', e.message);
    return { sent: false, reason: e.message };
  }
}

// ── QUOTE FORM REPLY ─────────────────────────────────────
function buildQuoteReply(d) {
  const name   = d.name   || 'there';
  const first  = name.split(' ')[0];
  const sector = d.sector || d['sector[]'] || 'commercial';
  const postcode = d.postcode || '';

  return {
    to: d.email,
    subject: `Thanks for your quote request, ${first} — we'll be in touch shortly`,
    html: baseTemplate(`
      <p style="font-size:16px;color:#3D5A74;line-height:1.8;margin:0 0 20px">Hi ${esc(first)},</p>

      <p style="font-size:16px;color:#3D5A74;line-height:1.8;margin:0 0 20px">
        Thanks for reaching out to AskMiro. We've received your quote request
        ${sector ? `for <strong style="color:#0D1C2E">${esc(sector)} cleaning</strong>` : ''}
        ${postcode ? ` in <strong style="color:#0D1C2E">${esc(postcode)}</strong>` : ''}
        and one of our team will be in touch within <strong style="color:#0D1C2E">24&ndash;48 hours</strong>.
      </p>

      <p style="font-size:16px;color:#3D5A74;line-height:1.8;margin:0 0 28px">
        In the meantime, if you have any questions or need to speak with someone urgently, please don't hesitate to call us directly.
      </p>

      <div style="background:#F4F8FB;border-left:3px solid #0DBDAD;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px">
        <div style="font-size:13px;font-weight:600;color:#7A9BB5;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">What happens next</div>
        <ul style="margin:0;padding-left:18px;color:#3D5A74;font-size:14px;line-height:1.9">
          <li>Our team reviews your requirements</li>
          <li>We prepare a tailored quote for your premises</li>
          <li>We call or email you to discuss — no obligation</li>
          <li>Site visit arranged if needed, usually within the week</li>
        </ul>
      </div>

      ${ctaButton('View Our Services', SITE + '/#services')}
    `, { name, type: 'quote' }),
  };
}

// ── CHAT LEAD REPLY ──────────────────────────────────────
function buildChatReply(d) {
  const name  = d.name  || 'there';
  const first = name.split(' ')[0];

  return {
    to: d.email,
    subject: `Great talking with you, ${first} — here's what happens next`,
    html: baseTemplate(`
      <p style="font-size:16px;color:#3D5A74;line-height:1.8;margin:0 0 20px">Hi ${esc(first)},</p>

      <p style="font-size:16px;color:#3D5A74;line-height:1.8;margin:0 0 20px">
        Thanks for chatting with Miro on our website. We've logged your enquiry and a member of our team will review your cleaning requirements and be in touch within <strong style="color:#0D1C2E">24&ndash;48 hours</strong>.
      </p>

      <p style="font-size:16px;color:#3D5A74;line-height:1.8;margin:0 0 28px">
        If you'd prefer to speak with someone straight away, give us a call — we're happy to help.
      </p>

      <div style="background:#F4F8FB;border-left:3px solid #0DBDAD;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px">
        <div style="font-size:13px;font-weight:600;color:#7A9BB5;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">A bit about us</div>
        <ul style="margin:0;padding-left:18px;color:#3D5A74;font-size:14px;line-height:1.9">
          <li>Managed commercial cleaning across London</li>
          <li>All staff DBS-checked, BICSc trained &amp; uniformed</li>
          <li>£10M public liability insurance</li>
          <li>Fixed monthly rates — no hidden charges</li>
          <li>Quality audits &amp; dedicated account management included</li>
        </ul>
      </div>

      ${ctaButton('Get a Quote Online', SITE + '/get-quote.html')}
    `, { name, type: 'chat' }),
  };
}

// ── QUOTE ESTIMATE REPLY ─────────────────────────────────
function buildQuoteEstimateReply(d) {
  const name     = d.name     || 'there';
  const first    = name.split(' ')[0];
  const facility = d.facility || d.sector || '';
  const sqft     = d.sqft     || '';
  const frequency = d.frequency || '';
  const level    = d.level    || '';
  const total    = d.total    || '';

  return {
    to: d.email,
    subject: `Your cleaning estimate from AskMiro, ${first} — here's what we found`,
    html: baseTemplate(`
      <p style="font-size:16px;color:#3D5A74;line-height:1.8;margin:0 0 20px">Hi ${esc(first)},</p>

      <p style="font-size:16px;color:#3D5A74;line-height:1.8;margin:0 0 20px">
        Thanks for using our quote calculator. Here's a summary of the estimate based on the details you entered.
      </p>

      <div style="background:#F4F8FB;border-left:3px solid #0DBDAD;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px">
        <div style="font-size:13px;font-weight:600;color:#7A9BB5;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Quote Estimate</div>
        <table cellpadding="0" cellspacing="0" style="width:100%">
          ${facility  ? `<tr><td style="font-size:14px;color:#7A9BB5;padding:4px 0;width:50%">Facility type</td><td style="font-size:14px;color:#0D1C2E;font-weight:600">${esc(facility)}</td></tr>` : ''}
          ${sqft      ? `<tr><td style="font-size:14px;color:#7A9BB5;padding:4px 0">Size</td><td style="font-size:14px;color:#0D1C2E;font-weight:600">${esc(sqft)} sq ft</td></tr>` : ''}
          ${frequency ? `<tr><td style="font-size:14px;color:#7A9BB5;padding:4px 0">Frequency</td><td style="font-size:14px;color:#0D1C2E;font-weight:600">${esc(frequency)}</td></tr>` : ''}
          ${level     ? `<tr><td style="font-size:14px;color:#7A9BB5;padding:4px 0">Service level</td><td style="font-size:14px;color:#0D1C2E;font-weight:600">${esc(level)}</td></tr>` : ''}
          ${total     ? `<tr><td style="font-size:14px;color:#7A9BB5;padding:8px 0 4px;border-top:1px solid #DCE8F0">Estimated monthly cost</td><td style="font-size:16px;color:#0DBDAD;font-weight:800;border-top:1px solid #DCE8F0">${esc(total)}</td></tr>` : ''}
        </table>
      </div>

      <p style="font-size:13px;color:#7A9BB5;line-height:1.7;margin:0 0 20px">
        This is an estimate based on the information provided. Final pricing will be confirmed after a site visit — no obligation.
      </p>

      ${ctaButton('Request a Full Quote', SITE + '/get-quote.html')}
    `, { name, type: 'quote-estimate' }),
  };
}

// ── BASE TEMPLATE ────────────────────────────────────────
function baseTemplate(body, { name, type }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F8FB;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F8FB;padding:32px 16px">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">

      <!-- Header -->
      <tr><td style="background:#0D1C2E;border-radius:12px 12px 0 0;padding:28px 36px;text-align:left">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="width:32px;height:32px;background:linear-gradient(135deg,#0DBDAD,#0A9688);border-radius:8px;text-align:center;vertical-align:middle">
            <span style="color:#fff;font-size:14px;font-weight:800;line-height:32px;display:block">M</span>
          </td>
          <td style="padding-left:10px;vertical-align:middle">
            <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-.02em">Ask<span style="color:#14D4C2">Miro</span></span>
          </td>
        </tr></table>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #E5EDF3;border-right:1px solid #E5EDF3">
        ${body}
      </td></tr>

      <!-- Signature -->
      <tr><td style="background:#ffffff;padding:0 36px 32px;border-left:1px solid #E5EDF3;border-right:1px solid #E5EDF3">
        <div style="border-top:1px solid #EBF2F8;padding-top:24px">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:42px;height:42px;background:linear-gradient(135deg,#0DBDAD,#0A9688);border-radius:50%;text-align:center;vertical-align:middle;flex-shrink:0">
              <span style="color:#fff;font-size:14px;font-weight:700;line-height:42px;display:block">MK</span>
            </td>
            <td style="padding-left:12px;vertical-align:middle">
              <div style="font-size:14px;font-weight:700;color:#0D1C2E;margin-bottom:2px">Mike Kato</div>
              <div style="font-size:12px;color:#7A9BB5">Co-Founder &mdash; AskMiro Cleaning Services</div>
              <div style="font-size:12px;color:#7A9BB5;margin-top:2px">
                <a href="tel:02080730621" style="color:#0A9688;text-decoration:none">${PHONE}</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:info@askmiro.com" style="color:#0A9688;text-decoration:none">info@askmiro.com</a>
              </div>
            </td>
          </tr></table>
        </div>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#EBF2F8;border-radius:0 0 12px 12px;padding:18px 36px;text-align:center">
        <p style="font-size:11px;color:#7A9BB5;margin:0;line-height:1.6">
          AskMiro Cleaning Services Ltd &middot; London, UK<br>
          <a href="${SITE}/privacy-policy.html" style="color:#7A9BB5;text-decoration:underline">Privacy Policy</a>
          &nbsp;&middot;&nbsp;
          <a href="${SITE}" style="color:#7A9BB5;text-decoration:underline">askmiro.co.uk</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function ctaButton(label, href) {
  return `<div style="text-align:center;margin-bottom:8px">
    <a href="${esc(href)}" style="display:inline-block;background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;letter-spacing:-.01em">
      ${esc(label)} &rarr;
    </a>
  </div>`;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
