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

// ── Colours ──────────────────────────────────────────────────
const C = {
  navy:    rgb(10/255,  22/255,  40/255),
  navy2:   rgb(15/255,  32/255,  56/255),
  teal:    rgb(13/255, 148/255, 136/255),
  teal2:   rgb(20/255, 184/255, 166/255),
  tealBg:  rgb(240/255, 253/255, 250/255),
  tealBd:  rgb(153/255, 246/255, 228/255),
  white:   rgb(1, 1, 1),
  dark:    rgb(15/255,  23/255,  42/255),
  slate:   rgb(71/255,  85/255, 105/255),
  muted:   rgb(148/255, 163/255, 184/255),
  light:   rgb(248/255, 250/255, 252/255),
  border:  rgb(226/255, 232/255, 240/255),
  amber:   rgb(254/255, 251/255, 235/255),
  amberBd: rgb(253/255, 230/255, 138/255),
  amberTx: rgb(146/255,  64/255,  14/255),
};

// ── Generate premium A4 PDF ──────────────────────────────────
async function generateQuotePdf(d) {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const { width: W, height: H } = page.getSize();
  const M = 40; // margin

  const R  = await doc.embedFont(StandardFonts.Helvetica);
  const B  = await doc.embedFont(StandardFonts.HelveticaBold);

  const fmtDate = () => {
    if (!d.jobDate) return '';
    return new Date(d.jobDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const fmtDay = () => {
    if (!d.jobDate) return '';
    return new Date(d.jobDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
  };
  const fmtTime = () => {
    if (!d.jobTime) return '';
    const [hStr, mStr] = d.jobTime.split(':');
    const hr = parseInt(hStr, 10), min = mStr || '00';
    return (hr > 12 ? hr - 12 : hr || 12) + (min !== '00' ? ':' + min : '') + ' ' + (hr >= 12 ? 'PM' : 'AM');
  };

  const today   = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateStr = fmtDate();
  const dayStr  = fmtDay();
  const timeStr = fmtTime();
  const ref = 'AM-' + new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getDate()).padStart(2,'0');

  // ── Drawing helpers ──────────────────────────────────────────
  const rect  = (x, y, w, h, color, opacity) => page.drawRectangle({ x, y, width: w, height: h, color, opacity });
  const line  = (x1, y1, x2, y2, color, t=0.5) => page.drawLine({ start:{x:x1,y:y1}, end:{x:x2,y:y2}, thickness:t, color });
  const tL    = (text, x, y, sz, color, font=R) => page.drawText(String(text), { x, y, size:sz, font, color });
  const tR    = (text, x, y, sz, color, font=R) => { const tw=font.widthOfTextAtSize(String(text),sz); page.drawText(String(text),{x:x-tw,y,size:sz,font,color}); };
  const tC    = (text, x, y, sz, color, font=R) => { const tw=font.widthOfTextAtSize(String(text),sz); page.drawText(String(text),{x:x-tw/2,y,size:sz,font,color}); };
  const trunc = (str, maxW, sz, font=R) => { let s=String(str); while(font.widthOfTextAtSize(s,sz)>maxW && s.length>3) s=s.slice(0,-4)+'...'; return s; };

  // ── HEADER (navy, full-width) ────────────────────────────────
  const hdrH = 110;
  rect(0, H - hdrH, W, hdrH, C.navy);

  // Brand left
  tL('AskMiro', M, H - 48, 28, C.white, B);
  tL('CLEANING SERVICES', M, H - 64, 8, C.teal2, R);
  tL('office@askmiro.com  |  www.askmiro.com  |  020 8073 0621', M, H - 80, 7.5, C.muted, R);

  // Badge right: "BOOKING CONFIRMATION"
  const badgeW = 168, badgeH = 24, badgeX = W - M - badgeW, badgeY = H - 56;
  rect(badgeX, badgeY, badgeW, badgeH, C.teal);
  tC('BOOKING CONFIRMATION', badgeX + badgeW/2, badgeY + 7, 8, C.white, B);

  // Issued date right
  tR('Issued: ' + today, W - M, H - 86, 7.5, C.muted, R);
  tR('Ref: ' + ref, W - M, H - 96, 7.5, C.muted, R);

  // Teal accent stripe
  rect(0, H - hdrH, W, 5, C.teal);
  rect(0, H - hdrH + 5, W, 1.5, C.teal2);

  // ── STAT BAND (date / time / total) ─────────────────────────
  const sbY = H - hdrH - 70, sbH = 68, colW = (W - 2*M) / 3;
  rect(M, sbY, W - 2*M, sbH, C.navy2);

  const statCols = [
    { label: 'DATE',  val: dateStr || '—',  sub: dayStr  || '' },
    { label: 'TIME',  val: timeStr || 'Morning', sub: 'Start time' },
    { label: 'TOTAL', val: '\u00A3' + (d.gross||0).toFixed(2), sub: 'All-inclusive' },
  ];
  statCols.forEach((s, i) => {
    const cx = M + i * colW + colW / 2;
    if (i > 0) line(M + i*colW, sbY+8, M + i*colW, sbY+sbH-8, rgb(1,1,1), 0.5);
    tC(s.label, cx, sbY + sbH - 18, 7, C.muted, B);
    tC(s.val,   cx, sbY + sbH - 38, 14, C.white, B);
    tC(s.sub,   cx, sbY + 10,        7.5, C.muted, R);
  });

  let y = sbY - 24;

  // ── PROPERTY CALLOUT ─────────────────────────────────────────
  if (d.site || d.propDetails) {
    const propLines = [];
    if (d.site) propLines.push(d.site);
    if (d.propDetails) {
      const words = d.propDetails.split(' '), maxW2 = W - 2*M - 100;
      let line2 = '';
      for (const w2 of words) {
        const test = line2 ? line2+' '+w2 : w2;
        if (R.widthOfTextAtSize(test, 8.5) > maxW2) { propLines.push(line2); line2 = w2; }
        else line2 = test;
      }
      if (line2) propLines.push(line2);
    }
    const propH = 20 + propLines.length * 13;
    rect(M, y - propH, W - 2*M, propH, C.tealBg);
    rect(M, y - propH, 4, propH, C.teal);
    tL(propLines[0] || '', M + 14, y - 14, 9.5, C.dark, B);
    for (let i = 1; i < propLines.length; i++) {
      tL(propLines[i], M + 14, y - 14 - i*13, 8.5, C.slate, R);
    }
    y -= propH + 16;
  }

  // ── CLIENT DETAILS ───────────────────────────────────────────
  // Section header bar
  rect(M, y - 20, W - 2*M, 20, C.navy);
  tL('CLIENT DETAILS', M + 10, y - 13, 8, C.white, B);
  y -= 20;

  const clientFields = [
    ['Name',    d.client     || ''],
    ['Email',   d.email      || ''],
    ['Address', d.site       || ''],
    ['Service', d.serviceType|| ''],
  ].filter(f => f[1]);

  const cfRowH = 16;
  const cfBg   = [C.light, C.white];
  clientFields.forEach((f, i) => {
    rect(M, y - cfRowH, W - 2*M, cfRowH, cfBg[i % 2]);
    tL(f[0], M + 10, y - 11, 8, C.muted, R);
    tL(trunc(f[1], W - 2*M - 100, 8.5, R), M + 90, y - 11, 8.5,
       f[0]==='Service' ? C.teal : C.dark,
       f[0]==='Service' ? B : R);
    y -= cfRowH;
  });
  y -= 20;

  // ── QUOTE BREAKDOWN ──────────────────────────────────────────
  rect(M, y - 20, W - 2*M, 20, C.navy);
  tL('QUOTE BREAKDOWN', M + 10, y - 13, 8, C.white, B);
  tR('QTY', W - M - 90, y - 13, 8, C.muted, R);
  tR('AMOUNT', W - M - 10, y - 13, 8, C.muted, R);
  y -= 20;

  const items = d.items || [];
  items.forEach((item, i) => {
    rect(M, y - 20, W - 2*M, 20, i%2===0 ? C.light : C.white);
    const desc = trunc(item.description||'', W - 2*M - 130, 8.5, R);
    tL(desc, M + 10, y - 13, 8.5, C.dark, R);
    tR('1', W - M - 90, y - 13, 8.5, C.muted, R);
    tR('\u00A3' + Number(item.amount).toFixed(2), W - M - 10, y - 13, 8.5, C.dark, R);
    y -= 20;
  });

  if (d.vatRate > 0) {
    rect(M, y - 18, W - 2*M, 18, C.white);
    tL('Subtotal', M + 10, y - 12, 8.5, C.dark, B);
    tR('\u00A3' + Number(d.subtotal||0).toFixed(2), W - M - 10, y - 12, 8.5, C.dark, B);
    y -= 18;
    rect(M, y - 18, W - 2*M, 18, C.white);
    tL('VAT (' + d.vatRate + '%)', M + 10, y - 12, 8.5, C.muted, R);
    tR('\u00A3' + Number(d.vat||0).toFixed(2), W - M - 10, y - 12, 8.5, C.muted, R);
    y -= 18;
  }

  // Total row — prominent
  rect(M, y - 26, W - 2*M, 26, C.navy);
  tL('TOTAL  \u2014  ALL INCLUSIVE', M + 10, y - 17, 9, C.white, B);
  tR('\u00A3' + Number(d.gross||0).toFixed(2), W - M - 10, y - 17, 13, C.teal2, B);
  y -= 40;

  // ── HOW TO PAY ───────────────────────────────────────────────
  const payH = 52;
  rect(M, y - payH, W - 2*M, payH, C.amber);
  rect(M, y - payH, 4, payH, C.amberBd);
  tL('HOW TO PAY', M + 14, y - 14, 8, C.amberTx, B);
  tL('No upfront payment required. Settle on completion once you\'re happy.', M + 14, y - 26, 7.5, C.amberTx, R);
  tL('Accepted: Cash  |  Bank Transfer  |  Card', M + 14, y - 38, 7.5, C.amberTx, B);
  tL('Questions? Call 020 8073 0621 or email office@askmiro.com', M + 14, y - 50, 7, C.amberTx, R);
  y -= payH + 16;

  // ── SCOPE OF WORK ────────────────────────────────────────────
  const scopeItems = (d.scopeItems || []).map(s => s.replace(/^[-\u2022]\s*/, '').trim()).filter(Boolean);
  if (scopeItems.length > 0) {
    rect(M, y - 20, W - 2*M, 20, C.teal);
    tL('WHAT\u2019S INCLUDED', M + 10, y - 13, 8, C.white, B);
    y -= 20;

    scopeItems.forEach((item, i) => {
      rect(M, y - 15, W - 2*M, 15, i%2===0 ? C.tealBg : C.white);
      // checkmark circle — drawn with lines (Helvetica/WinAnsi can't encode U+2713)
      rect(M + 8, y - 12, 10, 10, C.teal);
      const ckX = M + 10, ckY = y - 7;
      page.drawLine({ start:{x:ckX,y:ckY-3}, end:{x:ckX+2.5,y:ckY-5.5}, thickness:1.3, color:C.white });
      page.drawLine({ start:{x:ckX+2.5,y:ckY-5.5}, end:{x:ckX+7,y:ckY+1}, thickness:1.3, color:C.white });
      tL(trunc(item, W - 2*M - 40, 8.5, R), M + 24, y - 11, 8.5, C.dark, R);
      y -= 15;
      if (y < 180) return;
    });
    y -= 12;
  }

  // ── IMPORTANT NOTES ──────────────────────────────────────────
  const notes = [
    'Access to the property, electricity and water must be available at the agreed time.',
    'All professional cleaning supplies and equipment are provided by AskMiro.',
    'Cancellations must be made at least 24 hours in advance.',
    'No upfront payment required \u2014 payment due upon satisfactory completion.',
    'A full VAT invoice and receipt will be issued on the day for your records.',
  ];
  if (y > 140) {
    const notesH = 20 + notes.length * 14;
    rect(M, y - notesH, W - 2*M, notesH, C.amber);
    rect(M, y - notesH, 4, notesH, C.amberBd);
    tL('IMPORTANT NOTES', M + 14, y - 14, 8, C.amberTx, B);
    notes.forEach((n, i) => {
      tL('\u2022 ' + trunc(n, W - 2*M - 30, 7.5, R), M + 14, y - 26 - i*13, 7.5, C.amberTx, R);
    });
    y -= notesH + 12;
  }

  // ── CERTIFICATIONS STRIP ─────────────────────────────────────
  if (y > 80) {
    const certs = ['Fully Insured', 'COSHH Compliant', 'ISO Quality Standards', 'London & UK'];
    const stripH = 26;
    rect(M, y - stripH, W - 2*M, stripH, C.tealBg);
    rect(M, y - stripH, W - 2*M, 1, C.tealBd);
    rect(M, y - 1, W - 2*M, 1, C.tealBd);
    const certW = (W - 2*M) / certs.length;
    certs.forEach((c, i) => tC(c, M + i*certW + certW/2, y - 17, 7.5, C.teal, B));
    y -= stripH + 10;
  }

  // ── FOOTER ───────────────────────────────────────────────────
  rect(0, 0, W, 48, C.navy);
  rect(0, 48, W, 2, C.teal);
  tC('AskMiro Cleaning Services  \u00B7  office@askmiro.com  \u00B7  www.askmiro.com  \u00B7  020 8073 0621', W/2, 28, 8, C.teal2, B);
  tC('A trading name of Miro Partners Ltd  \u00B7  Professional Cleaning Across London', W/2, 14, 7, C.muted, R);

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
      from: RESEND_FROM,
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
