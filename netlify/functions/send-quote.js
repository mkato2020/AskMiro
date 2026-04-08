// ============================================================
// AskMiro — netlify/functions/send-quote.js
// Server-side quote email sender with branded PDF attachment.
// Generates PDF (pdf-lib), builds HTML email, sends via Resend.
//
// POST /api/send-quote
// Body: { client, email, site, serviceType, jobDate, jobTime,
//         propDetails, notes, payLink, vatRate, scopeItems[],
//         items[{description, amount}], subtotal, vat, gross }
// ============================================================

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const RESEND_FROM     = 'AskMiro Cleaning Services <office@askmiro.com>';
const RESEND_REPLY_TO = 'info@askmiro.com';
const RESEND_BCC      = 'info@askmiro.com';

// ── Colours (RGB 0-1 for pdf-lib) ───────────────────────────
const NAVY_RGB  = rgb(10/255, 22/255, 40/255);
const TEAL_RGB  = rgb(13/255, 148/255, 136/255);
const WHITE_RGB = rgb(1, 1, 1);
const DARK_RGB  = rgb(30/255, 41/255, 59/255);
const GREY_RGB  = rgb(100/255, 116/255, 139/255);
const LIGHT_RGB = rgb(240/255, 253/255, 250/255);
const SLATE_RGB = rgb(148/255, 163/255, 184/255);

// ── Generate branded A4 PDF ─────────────────────────────────
async function generateQuotePdf(d) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width: w, height: h } = page.getSize();

  const fontR = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);

  // Helper: draw text
  const txt = (text, x, y, { font = fontR, size = 10, color = DARK_RGB } = {}) => {
    page.drawText(text, { x, y, size, font, color });
  };
  const txtR = (text, x, y, { font = fontR, size = 10, color = DARK_RGB } = {}) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: x - tw, y, size, font, color });
  };
  const txtC = (text, x, y, { font = fontR, size = 10, color = DARK_RGB } = {}) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: x - tw / 2, y, size, font, color });
  };

  const fmtDate = () => {
    if (!d.jobDate) return '';
    const dt = new Date(d.jobDate + 'T00:00:00');
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const fmtTime = () => {
    if (!d.jobTime) return '';
    const p = d.jobTime.split(':');
    const hr = parseInt(p[0], 10);
    const min = p[1] || '00';
    const ap = hr >= 12 ? 'PM' : 'AM';
    return (hr > 12 ? hr - 12 : hr || 12) + (min !== '00' ? ':' + min : '') + ' ' + ap;
  };

  const dateStr = fmtDate();
  const timeStr = fmtTime();
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const validUntil = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const ref = 'AM-' + new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + String(new Date().getDate()).padStart(2, '0');

  // ── Header band ──
  page.drawRectangle({ x: 0, y: h - 100, width: w, height: 100, color: NAVY_RGB });
  txt('AskMiro', 40, h - 45, { font: fontB, size: 22, color: WHITE_RGB });
  txt('Cleaning Services', 40, h - 62, { font: fontR, size: 10, color: TEAL_RGB });
  txtR('QUOTE & BOOKING CONFIRMATION', w - 40, h - 45, { font: fontB, size: 12, color: WHITE_RGB });
  txtR('Date: ' + today, w - 40, h - 62, { font: fontR, size: 9, color: WHITE_RGB });
  txtR('Valid until: ' + validUntil, w - 40, h - 74, { font: fontR, size: 9, color: WHITE_RGB });
  txtR('Ref: ' + ref, w - 40, h - 86, { font: fontR, size: 9, color: SLATE_RGB });

  // Teal accent
  page.drawRectangle({ x: 0, y: h - 104, width: w, height: 4, color: TEAL_RGB });

  let y = h - 140;

  // ── Client details ──
  txt('CLIENT DETAILS', 40, y, { font: fontB, size: 11, color: DARK_RGB });
  y -= 20;
  const fields = [
    ['Name:', d.client],
    ['Email:', d.email],
    d.site ? ['Address:', d.site] : null,
    ['Service:', d.serviceType],
    dateStr ? ['Date:', dateStr + (timeStr ? ' at ' + timeStr : '')] : null,
    d.propDetails ? ['Property:', d.propDetails] : null,
  ].filter(Boolean);

  for (const [label, value] of fields) {
    txt(label, 40, y, { size: 10, color: GREY_RGB });
    const isService = label === 'Service:';
    txt(value, 120, y, { font: isService ? fontB : fontR, size: 10, color: isService ? TEAL_RGB : DARK_RGB });
    y -= 16;
  }

  y -= 24;

  // ── Line items table ──
  const colDesc = 50;
  const colQty = 410;
  const colAmt = w - 50;

  // Header row
  page.drawRectangle({ x: 40, y: y - 4, width: w - 80, height: 22, color: NAVY_RGB });
  txt('SERVICE', colDesc, y + 2, { font: fontB, size: 9, color: WHITE_RGB });
  txtC('QTY', colQty, y + 2, { font: fontB, size: 9, color: WHITE_RGB });
  txtR('AMOUNT', colAmt, y + 2, { font: fontB, size: 9, color: WHITE_RGB });
  y -= 22;

  // Item rows
  const items = d.items || [];
  for (let i = 0; i < items.length; i++) {
    const bg = i % 2 === 0 ? LIGHT_RGB : WHITE_RGB;
    page.drawRectangle({ x: 40, y: y - 4, width: w - 80, height: 22, color: bg });

    // Truncate long descriptions
    let desc = items[i].description || '';
    const maxWidth = 320;
    while (fontR.widthOfTextAtSize(desc, 9) > maxWidth && desc.length > 3) {
      desc = desc.slice(0, -4) + '...';
    }

    txt(desc, colDesc, y + 2, { size: 9, color: DARK_RGB });
    txtC('1', colQty, y + 2, { size: 9, color: GREY_RGB });
    txtR('\u00A3' + items[i].amount.toFixed(2), colAmt, y + 2, { size: 9, color: DARK_RGB });
    y -= 22;
  }

  // Subtotal / VAT / Total
  if (d.vatRate > 0) {
    page.drawRectangle({ x: 40, y: y - 4, width: w - 80, height: 22, color: WHITE_RGB });
    txt('Subtotal', colDesc, y + 2, { font: fontB, size: 10, color: DARK_RGB });
    txtR('\u00A3' + d.subtotal.toFixed(2), colAmt, y + 2, { font: fontB, size: 10, color: DARK_RGB });
    y -= 22;

    page.drawRectangle({ x: 40, y: y - 4, width: w - 80, height: 22, color: WHITE_RGB });
    txt('VAT (' + d.vatRate + '%)', colDesc, y + 2, { size: 10, color: GREY_RGB });
    txtR('\u00A3' + d.vat.toFixed(2), colAmt, y + 2, { size: 10, color: GREY_RGB });
    y -= 22;
  }

  // Total row
  page.drawRectangle({ x: 40, y: y - 6, width: w - 80, height: 28, color: TEAL_RGB });
  txt('TOTAL (ALL INCLUSIVE)', colDesc, y + 2, { font: fontB, size: 12, color: WHITE_RGB });
  txtR('\u00A3' + d.gross.toFixed(2), colAmt, y + 2, { font: fontB, size: 12, color: WHITE_RGB });
  y -= 44;

  // ── Scope of work (if provided) ──
  const scopeItems = d.scopeItems || [];
  if (scopeItems.length > 0) {
    txt('SCOPE OF WORK', 40, y, { font: fontB, size: 11, color: DARK_RGB });
    y -= 18;
    for (const item of scopeItems) {
      txt('\u2022 ' + item, 50, y, { size: 9, color: GREY_RGB });
      y -= 14;
      if (y < 100) break; // safety
    }
    y -= 10;
  }

  // ── Notes ──
  txt('IMPORTANT NOTES', 40, y, { font: fontB, size: 11, color: DARK_RGB });
  y -= 18;
  const notes = [
    'Please ensure access to the property at the scheduled time.',
    'All cleaning supplies and equipment are provided by AskMiro.',
    'Cancellations must be made at least 24 hours in advance.',
    'No upfront payment required \u2014 payment due upon completion.',
    'A full invoice and receipt will be provided on the day.',
  ];
  for (const n of notes) {
    txt('\u2022 ' + n, 50, y, { size: 9, color: GREY_RGB });
    y -= 14;
  }

  // ── Footer ──
  page.drawRectangle({ x: 0, y: 0, width: w, height: 50, color: NAVY_RGB });
  txtC('AskMiro Cleaning Services  |  office@askmiro.com  |  www.askmiro.com  |  020 8073 0621', w / 2, 30, { size: 8, color: TEAL_RGB });
  txtC('Professional cleaning services across London', w / 2, 18, { size: 8, color: SLATE_RGB });

  return await doc.save();
}

// ── Build branded HTML email ────────────────────────────────
function buildEmailHtml(d) {
  const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const firstName = (d.client || '').split(' ')[0];

  const fmtDate = () => {
    if (!d.jobDate) return '';
    return new Date(d.jobDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const fmtDay = () => {
    if (!d.jobDate) return '';
    return new Date(d.jobDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
  };
  const fmtTime = () => {
    if (!d.jobTime) return '';
    const p = d.jobTime.split(':');
    const hr = parseInt(p[0], 10);
    const min = p[1] || '00';
    const ap = hr >= 12 ? 'PM' : 'AM';
    return (hr > 12 ? hr - 12 : hr || 12) + (min !== '00' ? ':' + min : '') + ' ' + ap;
  };

  const dateShort = fmtDate();
  const dayName = fmtDay();
  const timeStr = fmtTime();
  const items = d.items || [];

  // Line item rows
  const lineRows = items.map((li, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
    return `<tr style="background:${bg}"><td style="font-family:${F};font-size:13px;color:#4B5563;padding:12px 18px;border-bottom:1px solid #F3F4F6">${esc(li.description)}</td><td style="font-family:${F};font-size:13px;color:#111827;font-weight:500;padding:12px 18px;text-align:right;border-bottom:1px solid #F3F4F6">&#163;${li.amount.toFixed(2)}</td></tr>`;
  }).join('');

  // Scope checklist
  const scopeRows = (d.scopeItems || []).map((s, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
    return `<tr style="background:${bg}"><td style="width:44px;padding:13px 0 13px 16px;vertical-align:top;border-bottom:1px solid #F3F4F6"><div style="width:22px;height:22px;background:#F0FDFA;border:1.5px solid #CCFBF1;border-radius:50%;text-align:center;line-height:19px;font-size:12px;color:#0D9488;font-weight:700">&#10003;</div></td><td style="padding:13px 18px 13px 10px;font-family:${F};font-size:14px;color:#1F2937;line-height:1.6;border-bottom:1px solid #F3F4F6">${esc(s)}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="x-apple-disable-message-reformatting"><title>AskMiro Cleaning Services</title></head><body style="margin:0;padding:0;background:#F1F5F9;-webkit-text-size-adjust:100%"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">`
    // Accent bar
    + `<tr><td style="height:4px;background:linear-gradient(90deg,#0D9488,#14B8A6);border-radius:12px 12px 0 0;font-size:4px;line-height:4px">&nbsp;</td></tr>`
    // Header
    + `<tr><td style="background:#0A1628;padding:26px 36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:14px;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="40" height="40" alt="AskMiro" style="display:block;border:0;border-radius:8px" border="0"></td><td style="vertical-align:middle"><div style="font-family:${F};font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">AskMiro</div><div style="font-family:${F};font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Professional Cleaning Across London</div></td></tr></table></td><td align="right" style="vertical-align:middle"><div style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.11);border-radius:20px;padding:6px 16px"><span style="font-family:${F};font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.6px">Booking Confirmation</span></div></td></tr></table></td></tr>`
    // Body
    + `<tr><td style="background:#FFFFFF;padding:44px 40px 36px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">`
    + `<p style="margin:0 0 22px;font-family:${F};font-size:16px;font-weight:600;color:#111827">Hi ${esc(firstName)},</p>`
    + `<p style="margin:0 0 6px;font-family:${F};font-size:11px;font-weight:700;color:#0D9488;letter-spacing:1.5px;text-transform:uppercase">Your booking is confirmed</p>`
    + `<h1 style="margin:0 0 6px;font-family:${F};font-size:26px;font-weight:800;color:#111827;letter-spacing:-0.8px;line-height:1.15">${esc(d.serviceType)}</h1>`
    + `<p style="margin:0 0 28px;font-family:${F};font-size:15px;color:#1F2937;line-height:1.8">Thank you for choosing AskMiro. Everything is locked in for your ${esc((d.serviceType || '').toLowerCase())}. Below you'll find the full details and quote breakdown. A detailed PDF is attached for your records.</p>`
    // Stat band
    + (dateShort ? `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border-radius:12px;overflow:hidden;background:#0A1628"><tr><td align="center" style="padding:22px 18px;border-right:1px solid rgba(255,255,255,0.07)"><div style="font-family:${F};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Date</div><div style="font-family:${F};font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">${esc(dateShort)}</div><div style="font-family:${F};font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px">${esc(dayName)}</div></td><td align="center" style="padding:22px 18px;border-right:1px solid rgba(255,255,255,0.07)"><div style="font-family:${F};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Time</div><div style="font-family:${F};font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">${esc(timeStr)}</div><div style="font-family:${F};font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px">Start time</div></td><td align="center" style="padding:22px 18px"><div style="font-family:${F};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.7);margin-bottom:6px">Total</div><div style="font-family:${F};font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">&#163;${Math.round(d.gross)}</div><div style="font-family:${F};font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px">All-inclusive</div></td></tr></table>` : '')
    // Property callout
    + (d.site || d.propDetails ? `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px"><tr><td style="background:#F0FDFA;border:1px solid #CCFBF1;border-radius:10px;padding:16px 20px"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">&#127968;</td><td style="font-family:${F};font-size:13.5px;color:#0F766E;line-height:1.7"><strong>${esc(d.site)}</strong>${d.propDetails ? '<br>' + esc(d.propDetails) : ''}</td></tr></table></td></tr></table>` : '')
    // Quote breakdown
    + `<p style="margin:24px 0 12px;font-family:${F};font-size:11px;font-weight:700;color:#111827;letter-spacing:0.8px;text-transform:uppercase">Quote Breakdown</p>`
    + `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">`
    + lineRows
    + `<tr style="background:#111827"><td style="font-family:${F};font-size:14px;font-weight:700;color:#FFFFFF;padding:16px 18px">Total</td><td style="font-family:${F};font-size:22px;font-weight:800;color:#FFFFFF;padding:16px 18px;text-align:right;letter-spacing:-0.5px">&#163;${d.gross.toFixed(2)}</td></tr></table>`
    // Scope
    + (scopeRows ? `<p style="margin:24px 0 12px;font-family:${F};font-size:11px;font-weight:700;color:#111827;letter-spacing:0.8px;text-transform:uppercase">What's included</p><table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">${scopeRows}</table>` : '')
    // Payment
    + `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px"><tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px 20px"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">&#128179;</td><td style="font-family:${F};font-size:13.5px;color:#92400E;line-height:1.7"><strong>No upfront payment required.</strong> You can settle the &#163;${d.gross.toFixed(2)} once the job is completed and you're happy with the standard. A full invoice and receipt will be provided on the day for your records.</td></tr></table></td></tr></table>`
    // Pay link (optional)
    + (d.payLink ? `<table cellpadding="0" cellspacing="0" style="margin:28px 0" width="100%"><tr><td align="center"><table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#0D9488"><a href="${esc(d.payLink)}" style="display:block;padding:15px 36px;font-family:${F};font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;white-space:nowrap">Pay &#163;${d.gross.toFixed(2)} &#8212; Secure Payment</a></td><td width="12">&nbsp;</td><td style="border-radius:8px;border:1.5px solid #E5E7EB"><a href="tel:02080730621" style="display:block;padding:14px 22px;font-family:${F};font-size:13px;font-weight:600;color:#1F2937;text-decoration:none;white-space:nowrap">&#9742;&nbsp;020 8073 0621</a></td></tr></table><p style="margin:10px 0 0;font-family:${F};font-size:11px;color:#94A3B8">Payment is optional before the job. You can also pay on the day.</p></td></tr></table>` : '')
    // Closing
    + `<p style="margin:0 0 18px;font-family:${F};font-size:15px;color:#1F2937;line-height:1.8">If anything changes or you have any questions at all, just reply to this email or give me a call.</p>`
    + `<p style="margin:0 0 18px;font-family:${F};font-size:15px;color:#1F2937;line-height:1.8">Looking forward to getting this done for you.</p>`
    // Signature
    + `<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:40px"><tr><td style="padding-top:28px;border-top:1px solid #E5E7EB"><table cellpadding="0" cellspacing="0" width="100%"><tr><td style="vertical-align:middle;padding-right:14px;width:34px"><img src="https://www.askmiro.com/favicon-32x32.png" width="30" height="30" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0"></td><td style="vertical-align:middle"><div style="font-family:${F};font-size:15px;font-weight:700;color:#111827;line-height:1.2">Mike Kato</div><div style="font-family:${F};font-size:12px;color:#0D9488;font-weight:600;margin-top:2px">Co-founder &#8212; AskMiro Cleaning Services</div></td></tr></table><table cellpadding="0" cellspacing="0" style="margin-top:14px"><tr><td style="padding-right:22px"><a href="tel:02080730621" style="font-family:${F};font-size:12px;color:#4B5563;text-decoration:none"><span style="color:#0D9488;margin-right:4px">&#9742;</span>020 8073 0621</a></td><td style="padding-right:22px"><a href="mailto:info@askmiro.com" style="font-family:${F};font-size:12px;color:#4B5563;text-decoration:none"><span style="color:#0D9488;margin-right:4px">&#9993;</span>info@askmiro.com</a></td><td><a href="https://www.askmiro.com" style="font-family:${F};font-size:12px;color:#0D9488;font-weight:600;text-decoration:none">www.askmiro.com</a></td></tr></table><table cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px"><tr><td style="padding:10px 16px;background:#F0FDFA;border:1px solid #CCFBF1;border-radius:8px"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:18px;font-family:${F};font-size:11px;color:#0D9488;font-weight:600">&#10003; Fully Insured</td><td style="padding-right:18px;font-family:${F};font-size:11px;color:#0D9488;font-weight:600">&#10003; COSHH Compliant</td><td style="padding-right:18px;font-family:${F};font-size:11px;color:#0D9488;font-weight:600">&#10003; ISO Standards</td><td style="font-family:${F};font-size:11px;color:#0D9488;font-weight:600">&#10003; London &amp; UK</td></tr></table></td></tr></table></td></tr></table>`
    + `</td></tr>`
    // Footer
    + `<tr><td style="background:#111827;border-radius:0 0 12px 12px;padding:22px 36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-family:${F};font-size:13px;font-weight:700;color:rgba(255,255,255,0.75)">AskMiro Cleaning Services</div><div style="font-family:${F};font-size:11px;color:rgba(255,255,255,0.28);margin-top:3px">A trading name of Miro Partners Ltd &nbsp;&bull;&nbsp; London &amp; UK</div></td><td align="right" style="vertical-align:top"><a href="https://www.askmiro.com" style="font-family:${F};font-size:12px;color:#14B8A6;text-decoration:none;font-weight:700">www.askmiro.com</a></td></tr><tr><td colspan="2" style="padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:18px;font-family:${F};font-size:11px;color:rgba(255,255,255,0.28)">&#10003; Fully Insured</td><td style="padding-right:18px;font-family:${F};font-size:11px;color:rgba(255,255,255,0.28)">&#10003; COSHH Compliant</td><td style="font-family:${F};font-size:11px;color:rgba(255,255,255,0.28)">&#10003; Residential &amp; Commercial</td></tr></table><p style="font-family:${F};font-size:10px;color:rgba(255,255,255,0.18);margin:14px 0 0;line-height:1.7">Sent by Mike Kato on behalf of AskMiro Cleaning Services. Reply to: info@askmiro.com.<br>We will never share your details with third parties.</p></td></tr></table></td></tr></table></td></tr></table></body></html>`;
}

// ── Handler ─────────────────────────────────────────────────
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
  const domainVerified = process.env.RESEND_DOMAIN_VERIFIED === 'true';

  if (!domainVerified)
    return new Response(JSON.stringify({ error: 'Email domain not verified', code: 'DOMAIN_NOT_VERIFIED' }), { status: 503, headers });
  if (!apiKey)
    return new Response(JSON.stringify({ error: 'Email service not configured', code: 'MISSING_API_KEY' }), { status: 500, headers });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers }); }

  const { client, email, site, serviceType, jobDate, jobTime, propDetails, notes, payLink, vatRate, scopeItems, items, subtotal, vat, gross } = body;

  if (!email || !email.includes('@'))
    return new Response(JSON.stringify({ error: 'Invalid recipient email' }), { status: 400, headers });
  if (!client)
    return new Response(JSON.stringify({ error: 'Client name required' }), { status: 400, headers });
  if (!items || !items.length)
    return new Response(JSON.stringify({ error: 'At least one line item required' }), { status: 400, headers });

  const d = { client, email, site, serviceType, jobDate, jobTime, propDetails, notes, payLink, vatRate: vatRate || 0, scopeItems: scopeItems || [], items, subtotal: subtotal || 0, vat: vat || 0, gross: gross || 0 };

  try {
    // Generate PDF
    const pdfBytes = await generateQuotePdf(d);
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

    // Build HTML email
    const htmlBody = buildEmailHtml(d);
    const subject = `${serviceType || 'Cleaning Service'} \u2014 Booking Confirmation | AskMiro`;
    const clientSlug = client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Send via Resend
    const payload = {
      from: body.fromName ? `${body.fromName} <office@askmiro.com>` : RESEND_FROM,
      reply_to: RESEND_REPLY_TO,
      to: [email],
      bcc: [RESEND_BCC],
      subject,
      html: htmlBody,
      attachments: [{
        filename: `AskMiro_Quote_${clientSlug}.pdf`,
        content: pdfBase64,
      }],
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const rawText = await res.text();

    if (!res.ok) {
      console.error('[SEND_QUOTE_FAILED] Resend', res.status, '|', rawText);
      return new Response(JSON.stringify({ error: `Email send failed (${res.status})`, code: 'EMAIL_SEND_FAILED' }), { status: 502, headers });
    }

    let result = {};
    try { result = JSON.parse(rawText); } catch (_) {}
    console.log('[send-quote] sent to', email, '| id:', result.id, '| pdf attached');
    return new Response(JSON.stringify({ sent: true, id: result.id }), { status: 200, headers });

  } catch (e) {
    console.error('[SEND_QUOTE_FAILED] error:', e.message);
    return new Response(JSON.stringify({ error: 'Failed to generate quote: ' + e.message, code: 'GENERATE_FAILED' }), { status: 500, headers });
  }
};

export const config = { path: '/api/send-quote' };
