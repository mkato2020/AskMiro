// ============================================================
// AskMiro Ops — modules/email.js  v4.0.0
// Architecture: his clean function-based concept
// Design: Tesla × Microsoft Fluent — obsidian precision
// ============================================================

window. Email = (() => {

  // ── STATE ─────────────────────────────────────────────────
  let _tab        = 'inbox';
  let _emails     = [];
  let _inbox      = [];
  let _thread     = null;
  let _activeTmpl = '';
  let _inboxSearch = '';

  // ── BRAND ─────────────────────────────────────────────────
  const BRAND = {
    company:    'AskMiro Cleaning Services',
    from:       'office@askmiro.com',
    replyTo:    'info@askmiro.com',
    phone:      '020 8073 0621',
    phoneTel:   '02080730621',
    website:    'www.askmiro.com',
    senderName: 'Mike Kato',
    senderRole: 'Director — AskMiro Cleaning Services',
  };

  // ── DESIGN TOKENS — Tesla × Microsoft Fluent ─────────────
  const T = {
    // Core palette
    obsidian:    '#080C10',   // deepest dark — Tesla nav bar level
    navy:        '#0A1628',   // header background
    navyMid:     '#0F2040',   // secondary dark
    charcoal:    '#111827',   // primary text
    body:        '#374151',   // body text
    slate:       '#6B7280',   // secondary text
    muted:       '#9CA3AF',   // placeholder/meta
    border:      '#E5E7EB',   // hairlines
    borderLight: '#F3F4F6',   // zebra rows
    offWhite:    '#F9FAFB',   // panel backgrounds
    white:       '#FFFFFF',

    // Brand accent
    teal:        '#0D9488',
    tealDark:    '#0F766E',
    tealMid:     '#14B8A6',
    tealLight:   '#CCFBF1',
    tealGhost:   '#F0FDFA',

    // Status
    amber:       '#D97706',
    amberBg:     '#FFFBEB',
    amberBorder: '#FDE68A',
    green:       '#059669',
    greenBg:     '#ECFDF5',
    purple:      '#7C3AED',
    purpleBg:    '#F5F3FF',
    red:         '#DC2626',

    radius:      '14',
  };

  // ── SENDER ────────────────────────────────────────────────
  function _sender() {
    const u = (window.Auth && typeof Auth.getUser === 'function' && Auth.getUser()) || {};
    return {
      name:  u.name  || BRAND.senderName,
      email: BRAND.from,
      role:  u.role  || BRAND.senderRole,
    };
  }

  // ── LOGO SVG ──────────────────────────────────────────────
  const LOGO = `<svg width="40" height="40" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="44" height="44" rx="10" fill="#0D9488"/>
    <rect width="44" height="44" rx="10" fill="url(#lg)" opacity="0.25"/>
    <path d="M11 29L16.5 15L22 29L27.5 15L33 29" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <defs><linearGradient id="lg" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
      <stop stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/>
    </linearGradient></defs>
  </svg>`;

  const LOGO_SM = `<svg width="30" height="30" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="44" height="44" rx="10" fill="#0D9488"/>
    <path d="M11 29L16.5 15L22 29L27.5 15L33 29" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // ── ESCAPE ────────────────────────────────────────────────
  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── TOKEN RESOLVER ────────────────────────────────────────
  function _resolveTokens(str, fields = {}) {
    return String(str || '')
      .replace(/\{\{contact_name\}\}/g, fields.contact_name || '')
      .replace(/\{\{meeting_date\}\}/g,  fields.meeting_date  || '')
      .replace(/\{\{location\}\}/g,       fields.location      || '')
      .replace(/\{\{name\}\}/g,           fields.name          || '')
      .replace(/\{\{site\}\}/g,           fields.site          || '')
      .replace(/\{\{invNum\}\}/g,         fields.invNum        || '')
      .replace(/\{\{period\}\}/g,         fields.period        || '')
      .trim();
  }

  // ════════════════════════════════════════════════════════════
  // EMAIL HTML COMPONENT LIBRARY
  // Tesla precision × Microsoft Fluent clarity
  // Every element: system font stack, exact spacing, no decoration
  // ════════════════════════════════════════════════════════════

  // Display headline — heavy, tight, confident
  function _h(t) {
    return `<h1 style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:${T.charcoal};letter-spacing:-0.8px;line-height:1.15">${t}</h1>`;
  }

  // Eyebrow — uppercase tracking, teal
  function _sub(t) {
    return `<p style="margin:0 0 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:${T.teal};letter-spacing:1.5px;text-transform:uppercase">${t}</p>`;
  }

  // Body paragraph
  function _p(t) {
    return `<p style="margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;color:${T.body};line-height:1.8">${t}</p>`;
  }

  // Salutation — personal, warm
  function _gr(name) {
    return `<p style="margin:0 0 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:${T.charcoal}">Hi ${_esc(name || 'there')},</p>`;
  }

  // Section heading — tight uppercase inside body
  function _sh(t) {
    return `<p style="margin:24px 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:${T.charcoal};letter-spacing:0.8px;text-transform:uppercase">${t}</p>`;
  }

  // Small print
  function _sm(t) {
    return `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:${T.muted};line-height:1.7">${t}</p>`;
  }

  // Hairline divider
  function _div() {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0"><tr><td style="height:1px;background:${T.border};font-size:1px;line-height:1px">&nbsp;</td></tr></table>`;
  }

  // ── CHECKLIST — clean enterprise rows ────────────────────
  function _checklist(items) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid ${T.border};border-radius:12px;overflow:hidden">
      ${items.map((item, i) => `
      <tr style="background:${i % 2 === 0 ? T.white : T.offWhite}">
        <td style="width:44px;padding:13px 0 13px 16px;vertical-align:top;border-bottom:${i < items.length - 1 ? '1px solid ' + T.borderLight : 'none'}">
          <div style="width:22px;height:22px;background:${T.tealGhost};border:1.5px solid ${T.tealLight};border-radius:50%;text-align:center;line-height:19px;font-size:12px;color:${T.teal};font-weight:700">&#10003;</div>
        </td>
        <td style="padding:13px 18px 13px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:${T.body};line-height:1.6;border-bottom:${i < items.length - 1 ? '1px solid ' + T.borderLight : 'none'}">${item}</td>
      </tr>`).join('')}
    </table>`;
  }

  // ── STAT BAND — obsidian dark metrics ────────────────────
  function _statBand(stats) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border-radius:12px;overflow:hidden;background:${T.navy}">
      <tr>
        ${stats.map((s, i) => `
        <td align="center" style="padding:22px 18px;${i < stats.length - 1 ? 'border-right:1px solid rgba(255,255,255,0.07)' : ''}">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.35);margin-bottom:6px">${s.label}</div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:#FFFFFF;letter-spacing:-1px;line-height:1">${s.value}</div>
          ${s.sub ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.32);margin-top:5px">${s.sub}</div>` : ''}
        </td>`).join('')}
      </tr>
    </table>`;
  }

  // ── DATA TABLE — Stripe-tier row structure ────────────────
  function _table(rows, total) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid ${T.border};border-radius:12px;overflow:hidden">
      ${rows.map(([l, v, bold, ac], i) => `
      <tr style="background:${i % 2 === 0 ? T.white : T.offWhite}">
        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${T.slate};padding:12px 18px;width:42%;border-bottom:1px solid ${T.borderLight}">${l}</td>
        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${ac ? T.teal : bold ? T.charcoal : T.body};font-weight:${bold ? '700' : '500'};padding:12px 18px;text-align:right;border-bottom:1px solid ${T.borderLight}">${v}</td>
      </tr>`).join('')}
      ${total ? `
      <tr style="background:${T.charcoal}">
        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#FFFFFF;padding:16px 18px">${total[0]}</td>
        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:#FFFFFF;padding:16px 18px;text-align:right;letter-spacing:-0.5px">${total[1]}</td>
      </tr>` : ''}
    </table>`;
  }

  // ── QUOTE BLOCK — editorial left rule ─────────────────────
  function _quote(text) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:22px 0">
      <tr>
        <td style="width:3px;background:${T.teal};border-radius:3px;font-size:1px;line-height:1px">&nbsp;</td>
        <td style="padding:16px 20px;background:${T.offWhite};border:1px solid ${T.border};border-left:none;border-radius:0 10px 10px 0">
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:${T.body};line-height:1.75;font-style:italic">&ldquo;${text}&rdquo;</p>
        </td>
      </tr>
    </table>`;
  }

  // ── AMBER CALLOUT — urgency / action needed ───────────────
  function _amber(html) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px">
      <tr><td style="background:${T.amberBg};border:1px solid ${T.amberBorder};border-radius:10px;padding:16px 20px">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">&#9888;</td>
            <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13.5px;color:#92400E;line-height:1.7">${html}</td>
          </tr>
        </table>
      </td></tr>
    </table>`;
  }

  // ── INFO CALLOUT — teal highlight ─────────────────────────
  function _info(html) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px">
      <tr><td style="background:${T.tealGhost};border:1px solid ${T.tealLight};border-radius:10px;padding:16px 20px">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">&#9432;</td>
            <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13.5px;color:${T.tealDark};line-height:1.7">${html}</td>
          </tr>
        </table>
      </td></tr>
    </table>`;
  }

  // ── HERO PRICE — Stripe payment block ─────────────────────
  function _heroPrice(amount, label, sub) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px">
      <tr><td style="background:linear-gradient(135deg,${T.teal},${T.tealDark});border-radius:12px;padding:28px 32px">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.55);margin-bottom:8px">${label}</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:48px;font-weight:800;color:#FFFFFF;letter-spacing:-2px;line-height:1">${amount}</div>
        ${sub ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.55);margin-top:10px">${sub}</div>` : ''}
      </td></tr>
    </table>`;
  }

  // ── CTA BUTTON — primary action ───────────────────────────
  function _cta(label, href, color) {
    const bg = color || T.teal;
    return `<table cellpadding="0" cellspacing="0" style="margin:28px 0">
      <tr>
        <td style="border-radius:8px;background:${bg}">
          <a href="${href}" style="display:block;padding:15px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;letter-spacing:-0.1px;white-space:nowrap">${label}</a>
        </td>
        <td width="12">&nbsp;</td>
        <td style="border-radius:8px;border:1.5px solid ${T.border}">
          <a href="tel:${BRAND.phoneTel}" style="display:block;padding:14px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${T.body};text-decoration:none;white-space:nowrap">&#9742;&nbsp;${BRAND.phone}</a>
        </td>
      </tr>
    </table>`;
  }

  // ── SIGNATURE — premium branded footer ────────────────────
  function _sig(sender) {
    return `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:40px">
      <tr><td style="padding-top:28px;border-top:1px solid ${T.border}">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="vertical-align:middle;padding-right:14px;width:34px">${LOGO_SM}</td>
            <td style="vertical-align:middle">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${T.charcoal};line-height:1.2">${_esc(sender.name)}</div>
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${T.teal};font-weight:600;margin-top:2px">${_esc(sender.role)}</div>
            </td>
          </tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="margin-top:14px">
          <tr>
            <td style="padding-right:22px">
              <a href="tel:${BRAND.phoneTel}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${T.slate};text-decoration:none"><span style="color:${T.teal};margin-right:4px">&#9742;</span>${BRAND.phone}</a>
            </td>
            <td style="padding-right:22px">
              <a href="mailto:${BRAND.replyTo}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${T.slate};text-decoration:none"><span style="color:${T.teal};margin-right:4px">&#9993;</span>${BRAND.replyTo}</a>
            </td>
            <td>
              <a href="https://${BRAND.website}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${T.teal};font-weight:600;text-decoration:none">${BRAND.website}</a>
            </td>
          </tr>
        </table>
        <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px">
          <tr><td style="padding:10px 16px;background:${T.tealGhost};border:1px solid ${T.tealLight};border-radius:8px">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:${T.teal};font-weight:600">&#10003; Fully Insured</td>
              <td style="padding-right:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:${T.teal};font-weight:600">&#10003; COSHH Compliant</td>
              <td style="padding-right:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:${T.teal};font-weight:600">&#10003; ISO Standards</td>
              <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:${T.teal};font-weight:600">&#10003; London &amp; UK</td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
  }

  // ── EMAIL WRAPPER — Tesla-grade master shell ───────────────
  // Spam-safe: proper Reply-To, unsubscribe footer, professional headers
  function _wrap(label, accentColor, bodyHtml, sender) {
    const ac = accentColor || T.teal;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no">
  <title>${_esc(BRAND.company)}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#F1F5F9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1F5F9;padding:32px 16px">
<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- ACCENT BAR -->
  <tr><td style="height:4px;background:linear-gradient(90deg,${ac},${T.tealMid});border-radius:12px 12px 0 0;font-size:4px;line-height:4px">&nbsp;</td></tr>

  <!-- HEADER -->
  <tr><td style="background:${T.navy};padding:26px 36px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:14px;vertical-align:middle">${LOGO}</td>
            <td style="vertical-align:middle">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">AskMiro</div>
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.38);letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Professional Cleaning Across London</div>
            </td>
          </tr></table>
        </td>
        <td align="right" style="vertical-align:middle">
          <div style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.11);border-radius:20px;padding:6px 16px">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;color:rgba(255,255,255,0.55);letter-spacing:0.6px">${_esc(label)}</span>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#FFFFFF;padding:44px 40px 36px;border-left:1px solid ${T.border};border-right:1px solid ${T.border}">
    ${bodyHtml}
    ${_sig(sender)}
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:${T.charcoal};border-radius:0 0 12px 12px;padding:22px 36px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,0.75)">${_esc(BRAND.company)}</div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.28);margin-top:3px">A trading name of Miro Partners Ltd &nbsp;&bull;&nbsp; London &amp; UK</div>
        </td>
        <td align="right" style="vertical-align:top">
          <a href="https://${BRAND.website}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${T.tealMid};text-decoration:none;font-weight:700">${BRAND.website}</a>
        </td>
      </tr>
      <tr><td colspan="2" style="padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.28)">&#10003; Fully Insured</td>
          <td style="padding-right:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.28)">&#10003; COSHH Compliant</td>
          <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.28)">&#10003; Residential &amp; Commercial</td>
        </tr></table>
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.18);margin:14px 0 0;line-height:1.7">
          Sent by ${_esc(sender.name)} on behalf of ${_esc(BRAND.company)}. Reply to: ${BRAND.replyTo}. If received in error please notify ${BRAND.replyTo}.<br>
          We will never share your details with third parties.
          &nbsp;&nbsp;<a href="mailto:${BRAND.replyTo}?subject=Unsubscribe" style="color:rgba(255,255,255,0.28);text-decoration:underline">Unsubscribe</a>
        </p>
      </td></tr>
    </table>
  </td></tr>

</table>

</td></tr></table>
</body></html>`;
  }

  // ════════════════════════════════════════════════════════════
  // TEMPLATE DEFINITIONS
  // His clean architecture: TEMPLATES object with fields array
  // Our design: full component library per template
  // ════════════════════════════════════════════════════════════
  const TEMPLATES = {

    'Introduction': {
      icon: '👋', badge: 'Outreach',
      blurb: 'First contact — premium commercial cleaning introduction.',
      subject: 'Managed Commercial Cleaning — AskMiro Cleaning Services',
      fields: [
        { id: 'name',        label: 'Contact Name',              ph: 'e.g. Sarah Collins',         type: 'text',     default: '' },
        { id: 'customIntro', label: 'Custom Opening (optional)', ph: 'Leave blank for standard introduction, or type a personalised opening…', type: 'textarea', rows: 5, default: '' },
      ],
    },

    'Proposal / Quote': {
      icon: '📋', badge: 'Proposal',
      blurb: 'Post-site-visit proposal with pricing and inclusions.',
      subject: 'AskMiro — Cleaning Proposal for {{name}}',
      fields: [
        { id: 'name',   label: 'Contact Name',    ph: 'e.g. Sarah Collins',         type: 'text', default: '' },
        { id: 'site',   label: 'Company / Site',  ph: 'e.g. Acme Ltd, 12 High St',  type: 'text', default: '' },
        { id: 'amount', label: 'Monthly Fee (£)', ph: 'e.g. 1200',                  type: 'text', default: '' },
        { id: 'visits', label: 'Visits per Week', ph: 'e.g. 5',                     type: 'text', default: '' },
        { id: 'days',   label: 'Days',            ph: 'e.g. Mon–Fri',               type: 'text', default: '' },
        { id: 'hours',  label: 'Hours per Visit', ph: 'e.g. 3',                     type: 'text', default: '' },
        { id: 'areas',  label: 'Areas Covered',   ph: 'e.g. Offices, Kitchen, WCs', type: 'text', default: '' },
      ],
    },

    'Follow-up': {
      icon: '🔔', badge: 'Follow-up',
      blurb: 'Soft nudge after a proposal or introduction email.',
      subject: 'Following Up — AskMiro Cleaning Services',
      fields: [
        { id: 'name', label: 'Contact Name',   ph: 'e.g. Sarah Collins', type: 'text', default: '' },
        { id: 'site', label: 'Company / Site', ph: 'e.g. Acme Ltd',      type: 'text', default: '' },
      ],
    },

    'Referral / Introduction Follow-Up': {
      icon: '🤝', badge: 'Referral',
      blurb: 'Follow-up after meeting a referral partner such as an estate agent, developer, or site manager.',
      subject: 'Great meeting you on {{meeting_date}}',
      fields: [
        { id: 'contact_name',  label: 'Contact Name',         ph: 'e.g. Daren',                         type: 'text',     default: '' },
        { id: 'meeting_date',  label: 'Meeting Date',         ph: 'e.g. 05 March',                      type: 'text',     default: '' },
        { id: 'location',      label: 'Location',             ph: 'e.g. King George\'s Gate',            type: 'text',     default: '' },
        {
          id:    'body',
          label: 'Opening Message (editable)',
          type:  'textarea',
          rows:   9,
          ph:    'Edit the message body…',
          default: `Great meeting you on {{meeting_date}} at {{location}}.

Thank you again for offering to share my details with the homeowners — I really appreciate it.

If any of the buyers need help with move-in cleaning, after-builders cleaning, or regular home cleaning once they settle in, we would be very happy to assist.

We're a local cleaning company based nearby and currently helping homeowners across South West London with reliable and flexible cleaning services.

If helpful, I can also send over a short one-page introduction or flyer that your team can easily share with the buyers.

Thanks again and nice to meet you.`,
        },
      ],
    },

    'Welcome Onboard': {
      icon: '🎉', badge: 'Welcome',
      blurb: 'New client onboarding with full service details.',
      subject: 'Welcome to AskMiro Cleaning Services',
      fields: [
        { id: 'name',      label: 'Contact Name',    ph: 'e.g. Sarah Collins',     type: 'text', default: '' },
        { id: 'site',      label: 'Site Address',    ph: 'e.g. 12 High St, London',type: 'text', default: '' },
        { id: 'startDate', label: 'Start Date',      ph: 'e.g. 1 March 2026',      type: 'text', default: '' },
        { id: 'schedule',  label: 'Schedule',        ph: 'e.g. Mon–Fri, 6–9am',    type: 'text', default: '' },
        { id: 'team',      label: 'Team Size',       ph: 'e.g. 2',                 type: 'text', default: '' },
        { id: 'amount',    label: 'Monthly Fee (£)', ph: 'e.g. 1200',              type: 'text', default: '' },
      ],
    },

    'Invoice': {
      icon: '💷', badge: 'Invoice',
      blurb: 'Professional invoice email with VAT breakdown and bank details.',
      subject: 'Invoice {{invNum}} — AskMiro Cleaning Services',
      fields: [
        { id: 'name',      label: 'Client Name',     ph: 'e.g. Accounts Team',                              type: 'text', default: '' },
        { id: 'site',      label: 'Company / Site',  ph: 'e.g. Acme Ltd',                                   type: 'text', default: '' },
        { id: 'amount',    label: 'Net Amount (£)',  ph: 'e.g. 1200  (VAT auto-calculated)',                 type: 'text', default: '' },
        { id: 'invNum',    label: 'Invoice Number',  ph: 'e.g. INV-001',                                    type: 'text', default: '' },
        { id: 'period',    label: 'Service Period',  ph: 'e.g. March 2026',                                 type: 'text', default: '' },
        { id: 'dueDate',   label: 'Payment Due',     ph: 'e.g. 30 March 2026',                              type: 'text', default: '' },
        { id: 'issueDate', label: 'Issue Date',      ph: 'e.g. 07 March 2026 (leave blank for today)',      type: 'text', default: '' },
      ],
    },

    'Contract Renewal': {
      icon: '🔄', badge: 'Renewal',
      blurb: 'Renewal notice with current service summary and confirmation request.',
      subject: 'Service Agreement Renewal — AskMiro Cleaning Services',
      fields: [
        { id: 'name',      label: 'Client Name',     ph: 'e.g. Sarah Collins',  type: 'text', default: '' },
        { id: 'site',      label: 'Company / Site',  ph: 'e.g. Acme Ltd',       type: 'text', default: '' },
        { id: 'renewDate', label: 'Renewal Date',    ph: 'e.g. 1 April 2026',   type: 'text', default: '' },
        { id: 'schedule',  label: 'Schedule',        ph: 'e.g. Mon–Fri, 6–9am', type: 'text', default: '' },
        { id: 'amount',    label: 'Monthly Fee (£)', ph: 'e.g. 1200',           type: 'text', default: '' },
      ],
    },

  };

  // ════════════════════════════════════════════════════════════
  // TEMPLATE HTML BUILDER
  // His clean _buildEmailTemplate() concept — one function,
  // each template branch uses our component library
  // ════════════════════════════════════════════════════════════
  function _buildEmailTemplate(tmpl, f, rawSubject) {
    const sender = _sender();

    // ── INTRODUCTION ────────────────────────────────────────
    if (tmpl === 'Introduction') {
      const introText = (f.customIntro || '').trim();
      const introBody = introText
        ? introText.split(/\n\s*\n/).map(block =>
            _p(_resolveTokens(_esc(block).replace(/\n/g, '<br>'), f))
          ).join('')
        : (
          _p(`We are <strong style="color:${T.charcoal}">AskMiro Cleaning Services</strong> — a managed commercial cleaning company serving offices, warehouses, schools, healthcare facilities, and automotive dealerships across London and the UK.`) +
          _p(`Unlike typical contractors, we don't just supply staff — we <strong style="color:${T.charcoal}">manage the entire service end-to-end</strong>: consistent teams, supervisor oversight, quality checklists, and a single point of contact for everything.`)
        );

      return _wrap('Client Introduction', T.teal,
        _h('Professional Cleaning. Properly Managed.') +
        _sub('AskMiro Cleaning Services — London & UK') +
        _gr(f.name || 'there') +
        introBody +
        _sh('What makes us different') +
        _checklist([
          '<strong>Consistent, site-trained teams</strong> — the same people at your site every visit, not rotating agency staff',
          '<strong>Supervisor oversight &amp; quality inspections</strong> — we check the work so you never have to',
          '<strong>COSHH-compliant processes</strong> — full risk assessments and RAMS documentation as standard',
          '<strong>Eco-conscious products</strong> — biodegradable chemicals and dilution control systems',
          '<strong>Absence cover guaranteed</strong> — your schedule is never disrupted',
          '<strong>Single point of contact</strong> — reach our team directly, not a call centre',
        ]) +
        _quote(`We don't just supply cleaners — we manage the service. Our clients don't worry about cleaning because we handle everything, every time.`) +
        _p(`We'd love to arrange a <strong>free, no-obligation site visit</strong>. Most proposals are returned within 48 hours with a fixed monthly rate.`) +
        _cta('&#128197; Book a Free Site Visit', `mailto:${BRAND.replyTo}?subject=Site Visit Request`) +
        _div() +
        _sm('AskMiro Cleaning Services is fully insured, COSHH compliant, and covered by public liability insurance.'),
        sender
      );
    }

    // ── PROPOSAL / QUOTE ────────────────────────────────────
    if (tmpl === 'Proposal / Quote') {
      const net = parseFloat(f.amount || 0);
      return _wrap('Cleaning Proposal', T.tealDark,
        _h('Your Cleaning Proposal.') +
        _sub('Prepared following our site visit — valid for 30 days') +
        _gr(f.name || 'there') +
        _p(`Thank you for your time during our site visit to <strong>${_esc(f.site || 'your site')}</strong>. We're pleased to present our proposal for managed commercial cleaning services.`) +
        (net
          ? _heroPrice(`£${net.toLocaleString()}<span style="font-size:18px;font-weight:500;opacity:0.65">/mo</span>`, 'Monthly Service Investment', `${_esc(f.visits || '—')} visits per week &nbsp;&bull;&nbsp; ${_esc(f.hours || '—')} hrs per visit &nbsp;&bull;&nbsp; Fixed rate, no hidden costs`)
          : _statBand([
              { label: 'Monthly Investment', value: '£TBC',              sub: 'Fixed — no hidden costs' },
              { label: 'Visits per Week',    value: f.visits || 'TBC',   sub: f.days || 'To confirm'   },
              { label: 'Hours per Visit',    value: f.hours ? f.hours + 'hrs' : 'TBC', sub: 'Dedicated team' },
            ])
        ) +
        _sh("What's included in your service") +
        _checklist([
          `<strong>${_esc(f.areas || 'All agreed areas')}</strong>`,
          'Dedicated cleaning team — inducted and briefed to your site specification',
          'All professional equipment, chemicals and consumables supplied',
          'COSHH risk assessments and full RAMS documentation',
          'Monthly supervisor quality inspection with written report',
          'Absence cover — your schedule is never disrupted',
        ]) +
        _amber(`<strong>This proposal is valid for 30 days.</strong> Reply to confirm and we can have your service live within <strong>5–7 working days</strong>. A signed service agreement follows on acceptance.`) +
        _cta('&#10003; Accept This Proposal', `mailto:${BRAND.replyTo}?subject=Accepting Proposal — ${_esc(f.site || '')}`) +
        _div() +
        _sm('All prices quoted exclusive of VAT. Payment terms: 30 days from invoice. Contact us to adjust scope or frequency.'),
        sender
      );
    }

    // ── FOLLOW-UP ───────────────────────────────────────────
    if (tmpl === 'Follow-up') {
      return _wrap('Proposal Follow-up', T.amber,
        _h('Just checking in.') +
        _sub('Regarding our recent proposal') +
        _gr(f.name || 'there') +
        _p(`We hope you're well. We're following up on the proposal we sent for cleaning services at <strong>${_esc(f.site || 'your site')}</strong>.`) +
        _p(`If the proposal works for you, simply reply and we can get things moving. If you'd like anything adjusted — scope, frequency, or pricing — we're happy to revisit.`) +
        _quote(`Every client has our commitment: if something isn't right, we fix it within 24 hours. That's not a policy — it's simply how we operate.`) +
        _sh('A quick reminder') +
        _checklist([
          'No long-term lock-in for initial contracts',
          'Service live within 5–7 working days of confirmation',
          'Dedicated account contact — not a call centre',
          'Consistent teams, not rotating agency staff',
        ]) +
        _p(`If the timing isn't right just now — no problem at all. Simply let us know and we'll follow up when it suits.`) +
        _cta('&#9993; Reply to This Email', `mailto:${BRAND.replyTo}`, T.amber) +
        _div() +
        _sm(`To stop further follow-up emails please reply with "Unsubscribe".`),
        sender
      );
    }

    // ── REFERRAL / INTRODUCTION FOLLOW-UP ───────────────────
    if (tmpl === 'Referral / Introduction Follow-Up') {
      const resolve = str => (str || '')
        .replace(/\{\{contact_name\}\}/g, _esc(f.contact_name || ''))
        .replace(/\{\{meeting_date\}\}/g,  _esc(f.meeting_date  || ''))
        .replace(/\{\{location\}\}/g,       _esc(f.location      || ''));

      const defaultBody = `Great meeting you on {{meeting_date}} at {{location}}.

Thank you again for offering to share my details with the homeowners — I really appreciate it.

If any of the buyers need help with move-in cleaning, after-builders cleaning, or regular home cleaning once they settle in, we would be very happy to assist.

We're a local cleaning company based nearby and currently helping homeowners across South West London with reliable and flexible cleaning services.

If helpful, I can also send over a short one-page introduction or flyer that your team can easily share with the buyers.

Thanks again and nice to meet you.`;

      const bodyRaw  = (f.body && f.body.trim()) ? f.body : defaultBody;
      const bodyHtml = resolve(bodyRaw)
        .split(/\n\n+/)
        .map(chunk => _p(chunk.split('\n').join('<br>')))
        .join('');

      return _wrap('Referral Follow-Up', T.teal,
        _h('Great meeting you.') +
        _sub(f.meeting_date ? `Following our meeting on ${_esc(f.meeting_date)}` : 'Thank you for the introduction') +
        _gr(f.contact_name || 'there') +
        bodyHtml +
        _sh('We can help with') +
        _checklist([
          '<strong>Move-in &amp; move-out cleaning</strong> — thorough clean after key handover, before buyers move in',
          '<strong>End-of-tenancy cleaning</strong> — deep clean to deposit-return standard',
          '<strong>After-builders &amp; post-renovation cleaning</strong> — dust, debris, and builder residue',
          '<strong>Regular home cleaning</strong> — weekly or fortnightly across South West London',
          '<strong>Deep cleaning &amp; sparkle cleans</strong> — one-off intensive clean, any property type',
          '<strong>Office &amp; commercial cleaning</strong> — managed service with consistent teams',
          '<strong>School &amp; education cleaning</strong> — term-time and holiday programmes',
          '<strong>Medical, dental &amp; healthcare</strong> — clinical-grade sanitisation protocols',
          '<strong>Retail &amp; hospitality</strong> — after-hours for shops, restaurants, cafes, pubs',
          '<strong>Gym &amp; leisure facilities</strong> — high-touch sanitisation and daily maintenance',
          '<strong>Automotive &amp; car dealerships</strong> — showroom, workshop, and forecourt',
          '<strong>Warehouses &amp; industrial units</strong> — floor maintenance and welfare facilities',
          '<strong>Residential blocks &amp; communal areas</strong> — entrance halls, stairwells, shared spaces',
        ]) +
        _info('We can also send over a branded one-page introduction your team can share directly with buyers. Just reply and we\u2019ll get it over to you.') +
        _cta('&#9993; Get in Touch', `mailto:${BRAND.replyTo}`) +
        _div() +
        _sm('AskMiro Cleaning Services — London &amp; UK. Residential &amp; commercial cleaning. Fully insured.'),
        sender
      );
    }

    // ── WELCOME ONBOARD ─────────────────────────────────────
    if (tmpl === 'Welcome Onboard') {
      return _wrap('Welcome Onboard', T.green,
        _h('Welcome to AskMiro.') +
        _sub("We're delighted to be working with you") +
        _gr(f.name || 'there') +
        _p(`On behalf of everyone at AskMiro Cleaning Services — <strong>welcome aboard</strong>. Your service is confirmed and our team is ready to get started.`) +
        _sh('Your service details') +
        _table([
          ['Site Address',  _esc(f.site      || '—')],
          ['Service Start', _esc(f.startDate || '—')],
          ['Schedule',      _esc(f.schedule  || '—')],
          ['Team Size',     f.team ? f.team + ' dedicated cleaners' : '—'],
          ['Monthly Fee',   f.amount ? '£' + _esc(f.amount) + ' + VAT' : '—', true, true],
          ['Invoice Day',   'Last working day of each month'],
          ['Contact',       BRAND.phone + ' — ' + BRAND.replyTo],
        ]) +
        _sh('What happens next') +
        _checklist([
          '<strong>Site briefing</strong> — our team visits before the first clean to walk the site',
          '<strong>Schedule confirmation</strong> — your full cleaning schedule sent to you in writing',
          '<strong>Direct contact</strong> — you will have a dedicated contact number for anything urgent',
          '<strong>First invoice</strong> — issued at the end of your first month of service',
        ]) +
        _quote(`We work hard to be the kind of cleaning company you never have to think about. If anything isn't right, contact us and we'll resolve it personally.`) +
        _cta(`&#9742; Call Us — ${BRAND.phone}`, `tel:${BRAND.phoneTel}`, T.green) +
        _div() +
        _sm('Welcome confirmation sent by AskMiro Cleaning Services. Please retain this email for your records.'),
        sender
      );
    }

    // ── INVOICE ─────────────────────────────────────────────
    if (tmpl === 'Invoice') {
      const net    = parseFloat(f.amount || 0);
      const vat    = net ? (net * 0.2).toFixed(2) : '—';
      const total  = net ? (net * 1.2).toFixed(2) : '—';
      const netFmt = net ? net.toFixed(2)          : '—';
      const today  = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

      return _wrap('Invoice', T.navy,
        _h(`Invoice ${_esc(f.invNum || '[INV-XXX]')}.`) +
        _sub(`${_esc(f.period || '[Month Year]')} — ${_esc(f.site || '[Site]')}`) +
        _gr(f.name || 'Client') +
        (net ? _heroPrice('£' + parseFloat(total).toLocaleString(), 'Total Amount Due', `Due by ${_esc(f.dueDate || '—')} &nbsp;&bull;&nbsp; Includes VAT`) : '') +
        _p(`Please find below your invoice for commercial cleaning services at <strong>${_esc(f.site || 'your site')}</strong> for <strong>${_esc(f.period || 'the service period')}</strong>.`) +
        _sh('Invoice breakdown') +
        _table([
          ['Invoice Number', _esc(f.invNum  || '—')],
          ['Service Period', _esc(f.period  || '—')],
          ['Site',           _esc(f.site    || '—')],
          ['Issue Date',     _esc(f.issueDate || today)],
          ['Payment Due',    _esc(f.dueDate  || '—')],
          ['Subtotal',       net ? '£' + netFmt : '—'],
          ['VAT (20%)',      net ? '£' + vat    : '—'],
        ], net ? ['Total Due', '£' + parseFloat(total).toLocaleString(undefined, { minimumFractionDigits: 2 })] : null) +
        _amber(`<strong>Bank Transfer Details</strong><br><br>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#92400E;padding-right:28px;line-height:2.4">Account Name<br>Sort Code<br>Account Number<br>Reference</td>
              <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${T.charcoal};font-weight:700;line-height:2.4">Miro Partners Ltd<br>04-06-05<br>26672911<br>${_esc(f.invNum || '[INV-XXX]')}</td>
            </tr>
          </table>`) +
        _p(`Payment is due within <strong>30 days</strong>. For any queries please reply or call us on ${BRAND.phone}.`) +
        _div() +
        _sm('Late payments may be subject to statutory interest under the Late Payment of Commercial Debts (Interest) Act 1998.'),
        sender
      );
    }

    // ── CONTRACT RENEWAL ────────────────────────────────────
    if (tmpl === 'Contract Renewal') {
      return _wrap('Service Renewal', T.purple,
        _h('Your service agreement is up for renewal.') +
        _sub("We'd love to continue working with you") +
        _gr(f.name || 'there') +
        _p(`Your current service agreement for <strong>${_esc(f.site || 'your site')}</strong> is due for renewal on <strong>${_esc(f.renewDate || '[DATE]')}</strong>. We would love to continue working with you.`) +
        _sh('Current service summary') +
        _table([
          ['Site',          _esc(f.site      || '—')],
          ['Renewal Date',  _esc(f.renewDate || '—')],
          ['Schedule',      _esc(f.schedule  || '—')],
          ['Monthly Fee',   f.amount ? '£' + _esc(f.amount) + ' + VAT' : '—', true, true],
          ['Contract Term', '12 months from renewal date'],
        ]) +
        _p(`If you're happy to continue on the same terms, simply reply with <em>&ldquo;Confirmed&rdquo;</em> and we will keep everything running without interruption.`) +
        _sh('What stays the same') +
        _checklist([
          'No paperwork required — a reply to this email is your confirmation',
          'Same dedicated team, same schedule, same quality standard',
          'Happy to discuss any changes to scope or frequency',
          'Renewed agreement valid for 12 months from renewal date',
        ]) +
        _quote(`It has been a genuine pleasure working with you. We don't take that lightly and will continue working hard to earn your trust.`) +
        _cta('&#10003; Confirm Renewal', `mailto:${BRAND.replyTo}?subject=Renewal Confirmed — ${_esc(f.site || '')}`, T.purple) +
        _div() +
        _sm(`To discuss changes please call us on ${BRAND.phone} or reply to this email.`),
        sender
      );
    }

    // ── FALLBACK ─────────────────────────────────────────────
    return _wrap('Email', T.teal,
      _h(_esc(rawSubject || 'Message')) +
      _gr('there') +
      _p('Your message is ready.'),
      sender
    );
  }

  // ════════════════════════════════════════════════════════════
  // DATA LOADING
  // ════════════════════════════════════════════════════════════
  async function _loadEmails() {
    try {
      const result = await API.get('emails');
      _emails = Array.isArray(result) ? result : [];
    } catch(e) {
      _emails = [];
      console.warn('Email log load failed:', e.message);
    }
  }

  async function _loadInbox(search = '') {
    _inboxSearch = search;
    try {
      const result = await API.get('inbox', { count: 30, search: search || '' });
      _inbox = Array.isArray(result) ? result : [];
    } catch(e) {
      _inbox = [];
      console.warn('Inbox load failed:', e.message);
    }
  }

  // ════════════════════════════════════════════════════════════
  // COMPOSE LOGIC
  // ════════════════════════════════════════════════════════════
  function _collectFields(tmplName) {
    const t = TEMPLATES[tmplName];
    const out = {};
    if (!t || !t.fields) return out;
    t.fields.forEach(field => {
      const el = document.getElementById(`emf-${field.id}`);
      if (el) {
        out[field.id] = field.type === 'textarea' ? el.value : el.value.trim();
      } else {
        out[field.id] = field.default || '';
      }
    });
    return out;
  }

  function _refreshSubject() {
    const tmpl    = _activeTmpl || ((document.getElementById('em-tmpl') || {}).value || '');
    const subjEl  = document.getElementById('em-subj');
    if (!tmpl || !subjEl || !TEMPLATES[tmpl]) return;
    const fields  = _collectFields(tmpl);
    subjEl.value  = _resolveTokens(TEMPLATES[tmpl].subject, fields);
  }

  // Blob URL loader — bypasses Cloudflare's sandbox/srcdoc blocking
  function _setFrameHTML(frameId, html) {
    const frame = document.getElementById(frameId);
    if (!frame) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    if (frame._blobUrl) URL.revokeObjectURL(frame._blobUrl);
    frame._blobUrl = url;
    frame.src = url;
  }

  function _livePreview() {
    const tmpl = _activeTmpl || ((document.getElementById('em-tmpl') || {}).value || '');
    if (!tmpl || !TEMPLATES[tmpl]) return;
    const fields = _collectFields(tmpl);
    const subjEl = document.getElementById('em-subj');
    _setFrameHTML('em-prev', _buildEmailTemplate(tmpl, fields, subjEl ? subjEl.value : ''));
  }

  function _pickTmpl(name) {
    _activeTmpl = name;
    const t        = TEMPLATES[name];
    const fWrap    = document.getElementById('em-fields');
    const fInner   = document.getElementById('em-fields-inner');
    const prevWrap = document.getElementById('em-prev-wrap');
    const subjEl   = document.getElementById('em-subj');

    if (!t || !fWrap || !fInner) return;
    if (subjEl && !subjEl.value) subjEl.value = t.subject;

    fInner.innerHTML = (t.fields || []).map(f => {
      if (f.type === 'textarea') {
        return `
          <div style="margin-bottom:12px">
            <label style="display:block;margin-bottom:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:700;color:${T.slate}">${_esc(f.label)}</label>
            <textarea id="emf-${f.id}" placeholder="${_esc(f.ph || '')}" rows="${f.rows || 6}"
              oninput="Email._livePreview(); Email._refreshSubject();"
              style="width:100%;box-sizing:border-box;border:1px solid ${T.border};border-radius:10px;padding:12px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.6;color:${T.charcoal};background:#fff;resize:vertical"
            >${_esc(f.default || '')}</textarea>
          </div>`;
      }
      return `
        <div style="margin-bottom:12px">
          <label style="display:block;margin-bottom:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:700;color:${T.slate}">${_esc(f.label)}</label>
          <input id="emf-${f.id}" value="${_esc(f.default || '')}" placeholder="${_esc(f.ph || '')}"
            oninput="Email._livePreview(); Email._refreshSubject();"
            style="width:100%;box-sizing:border-box;border:1px solid ${T.border};border-radius:10px;padding:12px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:${T.charcoal};background:#fff">
        </div>`;
    }).join('');

    fWrap.style.display    = t.fields && t.fields.length ? 'block' : 'none';
    if (prevWrap) prevWrap.style.display = 'block';
    _refreshSubject();
    _livePreview();
  }

  function _useTmpl(name) {
    _tab = 'compose';
    _draw();
    setTimeout(() => {
      const sel = document.getElementById('em-tmpl');
      if (sel) { sel.value = name; _pickTmpl(name); }
    }, 60);
  }

  function _prevModal(name) {
    const t = TEMPLATES[name]; if (!t) return;
    const bg    = document.getElementById('em-modal-bg');
    const frame = document.getElementById('em-modal-frame');
    const ttl   = document.getElementById('em-modal-ttl');
    if (bg && frame && ttl) {
      ttl.textContent = `${t.icon}  ${name}`;
      _setFrameHTML('em-modal-frame', _buildEmailTemplate(name, {}, t.subject));
      bg.style.display = 'flex';
    }
  }

  // ── SEND ─────────────────────────────────────────────────
  async function _send() {
    const toEl    = document.getElementById('em-to');
    const subjEl  = document.getElementById('em-subj');
    const tmplEl  = document.getElementById('em-tmpl');
    const btn     = document.getElementById('em-send-btn');

    const to      = ((toEl   && toEl.value)   || '').trim();
    const subject = ((subjEl && subjEl.value) || '').trim();
    const tmpl    = _activeTmpl || ((tmplEl && tmplEl.value) || '');

    if (!to)      { if (window.UI) UI.toast('Please enter a recipient email', 'r'); return; }
    if (!subject) { if (window.UI) UI.toast('Please enter a subject line',   'r'); return; }

    const fields = tmpl ? _collectFields(tmpl) : {};

    // Inject sender identity so GAS signature renders correctly
    const sender = _sender();
    fields.senderName  = sender.name;
    fields.senderRole  = sender.role;
    fields.senderEmail = BRAND.from;
    fields.replyTo     = BRAND.replyTo;   // ← ensures Reply-To is info@askmiro.com not personal Gmail

    const resolvedSubject = _resolveTokens(subject, fields);

    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      await API.post('email.send', {
        to,
        subject:  resolvedSubject,
        template: tmpl || 'Custom',
        fields:   JSON.stringify(fields),
        replyTo:  BRAND.replyTo,    // explicit Reply-To header for GAS
        fromName: BRAND.company,    // display name instead of personal Gmail
      });

      if (window.UI) UI.toast('✓ Email sent to ' + to, 'g');
      _emails.unshift({ id: 'EM-' + Date.now(), to, subject: resolvedSubject, template: tmpl || 'Custom', sentAt: new Date().toLocaleString('en-GB') });
      _tab = 'log';
      _activeTmpl = '';
      _draw();
    } catch(e) {
      if (window.UI) UI.toast('Send failed: ' + (e.message || 'Unknown error'), 'r');
      if (btn) { btn.disabled = false; btn.textContent = '✉ Send Branded Email'; }
    }
  }

  // ════════════════════════════════════════════════════════════
  // UI RENDERERS — Tesla × Fluent app chrome
  // ════════════════════════════════════════════════════════════

  function _fmtDate(dt) {
    try {
      return new Date(dt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch(_) { return dt || ''; }
  }

  // ── SENT LOG ─────────────────────────────────────────────
  function _sentHTML() {
    if (!_emails.length) {
      return `<div style="text-align:center;padding:72px 20px">
        <div style="font-size:3rem;margin-bottom:14px">📭</div>
        <div style="font-weight:700;color:var(--dk);font-size:15px;margin-bottom:6px">No emails sent yet</div>
        <div style="font-size:13px;color:var(--ll)">Switch to Compose to send your first branded email</div>
      </div>`;
    }
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>ID</th><th>To</th><th>Subject</th><th>Template</th><th>Sent</th></tr></thead>
      <tbody>${_emails.map(e => `<tr>
        <td class="tmn">${_esc(e.id || '')}</td>
        <td style="font-size:12px">${_esc(e.to || '')}</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px">${_esc(e.subject || '')}</td>
        <td>${window.UI ? UI.pill(e.template || 'Custom', 'pt') : _esc(e.template || 'Custom')}</td>
        <td style="font-size:12px;color:var(--ll)">${_fmtDate(e.sentAt || e.ts || '')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  // ── COMPOSE ───────────────────────────────────────────────
  function _composeHTML() {
    const s = _sender();
    const names = Object.keys(TEMPLATES);
    return `
      <div style="max-width:660px">
        <!-- Sender identity bar -->
        <div style="background:linear-gradient(135deg,${T.navy},${T.navyMid});border-radius:12px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;background:${T.teal};border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="20" height="20" viewBox="0 0 44 44" fill="none"><path d="M10 29L15.5 15L21 29L26.5 15L32 29" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div style="flex:1">
            <div style="font-weight:700;color:#fff;font-size:13px">${_esc(s.name)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.42);margin-top:1px">Sending from ${_esc(BRAND.from)} &nbsp;&bull;&nbsp; Reply-To: ${_esc(BRAND.replyTo)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${T.tealMid}">
            <span style="width:7px;height:7px;border-radius:50%;background:${T.tealMid};display:inline-block"></span>
            Live
          </div>
        </div>

        <!-- Fields -->
        <div class="fg"><label class="fl">To (Email) <span class="req">*</span></label>
          <input class="fin" id="em-to" type="email" placeholder="client@company.com">
        </div>
        <div class="fg"><label class="fl">Subject <span class="req">*</span></label>
          <input class="fin" id="em-subj" placeholder="Subject line" oninput="Email._livePreview()">
        </div>
        <div class="fg"><label class="fl">Template <span class="req">*</span></label>
          <select class="fse" id="em-tmpl" onchange="Email._pickTmpl(this.value)">
            <option value="">— Select a branded template —</option>
            ${names.map(n => `<option value="${_esc(n)}">${TEMPLATES[n].icon}  ${_esc(n)}</option>`).join('')}
          </select>
        </div>

        <!-- Template fields -->
        <div id="em-fields" style="display:none;background:var(--of);border:1px solid var(--bd);border-radius:12px;padding:16px 18px;margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--ll);margin-bottom:12px">&#9998; Template Details — fill in to personalise</div>
          <div id="em-fields-inner"></div>
        </div>

        <!-- Live preview iframe -->
        <div id="em-prev-wrap" style="display:none;margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--ll);margin-bottom:6px">Live Preview</div>
          <iframe id="em-prev" style="width:100%;height:520px;border:1px solid var(--bd);border-radius:12px;background:#fff"></iframe>
        </div>

        <!-- Send button -->
        <button class="btn bp" style="width:100%;justify-content:center;font-size:14px;padding:15px" id="em-send-btn" onclick="Email._send()">
          &#9993;&nbsp; Send Branded Email
        </button>
        <p style="font-size:11px;color:var(--ll);margin:8px 0 0;text-align:center">
          Sending as <strong>${_esc(BRAND.company)}</strong> via ${_esc(BRAND.from)} &nbsp;&bull;&nbsp; Reply-To: ${_esc(BRAND.replyTo)}
        </p>
      </div>`;
  }

  // ── TEMPLATES GALLERY ─────────────────────────────────────
  function _galHTML() {
    const names = Object.keys(TEMPLATES);
    return `
      <div class="g2">
        ${names.map(n => {
          const t = TEMPLATES[n];
          return `<div class="card">
            <div class="card-hd" style="align-items:flex-start;gap:10px">
              <div style="font-size:26px;line-height:1">${t.icon}</div>
              <div style="flex:1">
                <div class="card-title" style="font-size:14px">${_esc(n)}</div>
                <div style="font-size:12px;color:var(--ll);margin-top:3px;line-height:1.5">${_esc(t.blurb || '')}</div>
              </div>
            </div>
            <div class="card-body" style="padding-top:8px">
              <div style="font-size:11px;color:var(--ll);margin-bottom:10px;font-family:monospace;background:var(--of);padding:6px 10px;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(t.subject)}</div>
              <div style="display:flex;gap:8px">
                <button class="btn bp" style="font-size:12px;padding:6px 14px" onclick="Email._useTmpl('${_esc(n)}')">Use Template →</button>
                <button class="btn bo" style="font-size:12px;padding:6px 14px" onclick="Email._prevModal('${_esc(n)}')">Preview</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <!-- Preview modal -->
      <div id="em-modal-bg" style="display:none;position:fixed;inset:0;background:rgba(8,12,16,.82);backdrop-filter:blur(6px);z-index:400;align-items:center;justify-content:center;padding:20px">
        <div style="background:#fff;border-radius:16px;width:100%;max-width:700px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 40px 100px rgba(0,0,0,.55)">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid var(--bd)">
            <span id="em-modal-ttl" style="font-weight:700;font-size:14px;color:var(--dk)">Preview</span>
            <button class="xbtn" onclick="document.getElementById('em-modal-bg').style.display='none'">&#x2715;</button>
          </div>
          <iframe id="em-modal-frame" style="flex:1;border:none;border-radius:0 0 16px 16px;min-height:560px"></iframe>
        </div>
      </div>`;
  }

  // ── INBOX ─────────────────────────────────────────────────
  function _inboxHTML() {
    if (_thread) return _threadHTML();

    const unread = _inbox.filter(t => t.unread).length;
    const searchBar = `
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input class="fin" id="inbox-search" placeholder="Search inbox…" value="${_esc(_inboxSearch)}"
          style="flex:1;font-size:13px" onkeydown="if(event.key==='Enter')Email._searchInbox()">
        <button class="btn bo" style="font-size:12px;padding:7px 14px" onclick="Email._searchInbox()">Search</button>
        <button class="btn bo" style="font-size:12px;padding:7px 14px" onclick="Email._refreshInbox()">&#8635; Refresh</button>
      </div>`;

    if (!_inbox.length) return searchBar + `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:2.5rem;margin-bottom:14px">📬</div>
        <div style="font-weight:700;color:var(--dk);font-size:15px;margin-bottom:6px">Loading inbox…</div>
        <div style="font-size:13px;color:var(--ll);margin-bottom:16px">Fetching from ${_esc(BRAND.replyTo)}</div>
        <button class="btn bo" style="font-size:12px;padding:7px 16px" onclick="Email._refreshInbox()">&#8635; Retry</button>
      </div>`;

    const rows = _inbox.map(t => {
      const date = new Date(t.date);
      const isToday = date.toDateString() === new Date().toDateString();
      const dateStr = isToday
        ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const fromName = t.from.replace(/<.*>/, '').trim().replace(/"/g, '') || t.from;
      return `
        <div onclick="Email._openThread('${_esc(t.id)}')"
          style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--bd);cursor:pointer;background:${t.unread ? T.tealGhost : 'transparent'};transition:background .12s"
          onmouseover="this.style.background='var(--of)'" onmouseout="this.style.background='${t.unread ? T.tealGhost : 'transparent'}'">
          <div style="width:38px;height:38px;background:${t.unread ? T.teal : '#CBD5E1'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:white;flex-shrink:0">
            ${fromName.charAt(0).toUpperCase()}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
              <span style="font-size:13px;font-weight:${t.unread ? 700 : 500};color:var(--dk);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px">${_esc(fromName)}</span>
              <span style="font-size:11px;color:var(--ll);flex-shrink:0;margin-left:8px">${dateStr}</span>
            </div>
            <div style="font-size:13px;font-weight:${t.unread ? 600 : 400};color:${t.unread ? T.charcoal : 'var(--sl)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px">${_esc(t.subject || '')}</div>
            <div style="font-size:12px;color:var(--ll);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(t.snippet || '')}</div>
          </div>
          ${t.count > 1 ? `<div style="font-size:11px;color:var(--ll);background:var(--bd);border-radius:10px;padding:2px 7px;flex-shrink:0">${t.count}</div>` : ''}
          ${t.unread ? `<div style="width:8px;height:8px;background:${T.teal};border-radius:50%;flex-shrink:0"></div>` : ''}
        </div>`;
    }).join('');

    return searchBar +
      `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:12px;color:var(--ll)">${_inbox.length} conversations${unread ? ` &nbsp;&bull;&nbsp; <strong style="color:${T.teal}">${unread} unread</strong>` : ''}</div>
      </div>
      <div style="border:1px solid var(--bd);border-radius:12px;overflow:hidden">${rows}</div>`;
  }

  // ── THREAD VIEW ───────────────────────────────────────────
  function _threadHTML() {
    if (!_thread) return '';
    const msgs = _thread.messages || [];
    const messagesHTML = msgs.map((m, i) => {
      const date = new Date(m.date).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      const fromName = m.from.replace(/<.*>/, '').trim().replace(/"/g, '') || m.from;
      const isLast = i === msgs.length - 1;
      return `
        <div style="margin-bottom:12px;border:1px solid var(--bd);border-radius:12px;overflow:hidden${isLast ? ';box-shadow:0 2px 8px rgba(0,0,0,.06)' : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--of);border-bottom:1px solid var(--bd)">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:32px;height:32px;background:${T.teal};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white">
                ${fromName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--dk)">${_esc(fromName)}</div>
                <div style="font-size:11px;color:var(--ll)">${_esc(m.from)}</div>
              </div>
            </div>
            <div style="font-size:11px;color:var(--ll)">${date}</div>
          </div>
          <div style="padding:16px;max-height:320px;overflow-y:auto">
            <iframe id="tframe-${i}"
              style="width:100%;border:none;min-height:200px"
              onload="this.style.height=(this.contentDocument.body.scrollHeight+32)+'px'"></iframe>
            <script>
              (function() {
                var b = new Blob([${JSON.stringify(m.body || '')}], {type:'text/html'});
                var u = URL.createObjectURL(b);
                document.getElementById('tframe-${i}').src = u;
              })();
            </script>
          </div>
        </div>`;
    }).join('');

    const lastFrom = msgs.length ? msgs[msgs.length - 1].from : '';
    const replyTo  = lastFrom.match(/<(.+)>/) ? lastFrom.match(/<(.+)>/)[1] : lastFrom;

    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <button class="btn bo" style="font-size:12px;padding:6px 14px" onclick="Email._closeThread()">← Back</button>
        <div style="font-size:15px;font-weight:700;color:var(--dk);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(_thread.subject || '')}</div>
      </div>
      ${messagesHTML}
      <div style="border:1px solid ${T.teal};border-radius:12px;padding:16px;margin-top:8px;background:${T.tealGhost}">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${T.teal};margin-bottom:10px">&#8617; Quick Reply</div>
        <textarea id="thread-reply" class="fta" rows="3" placeholder="Type your reply…" style="font-size:13px;margin-bottom:10px"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn bp" style="font-size:12px;padding:7px 16px" onclick="Email._sendReply('${_esc(replyTo)}','${_esc(_thread.subject || '').replace(/'/g, "\\'")}')">Send Reply</button>
          <button class="btn bo" style="font-size:12px;padding:7px 16px" onclick="Email._replyCompose('${_esc(replyTo)}','${_esc(_thread.subject || '').replace(/'/g, "\\'")}')">Full Compose</button>
        </div>
      </div>`;
  }

  // ── MAIN DRAW ─────────────────────────────────────────────
  function _draw() {
    const s     = _sender();
    const tabs  = [['inbox', 'Inbox'], ['log', 'Sent'], ['compose', 'Compose'], ['templates', 'Templates']];
    const unreadCount = _inbox.filter(t => t.unread).length;

    let bodyContent;
    if      (_tab === 'inbox')     bodyContent = _inboxHTML();
    else if (_tab === 'log')       bodyContent = _sentHTML();
    else if (_tab === 'compose')   bodyContent = _composeHTML();
    else                           bodyContent = _galHTML();

    const el = document.getElementById('main-content');
    if (!el) return;

    el.innerHTML = `
      ${window.UI ? UI.secHd('EMAIL', 'Email Centre', unreadCount > 0 ? unreadCount + ' unread' : '') : '<div><h2>Email Centre</h2></div>'}
      <div class="el-layout">
        <div class="el-sidebar">
          <button class="btn bp" style="width:100%;justify-content:center;margin-bottom:14px" onclick="Email._switchTab('compose')">+ Compose</button>
          ${tabs.map(([k, lbl]) => {
            let badge = '';
            if (k === 'inbox' && unreadCount > 0) {
              badge = `<span style="margin-left:auto;background:${T.teal};color:white;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700">${unreadCount}</span>`;
            } else if (k === 'log') {
              badge = `<span style="margin-left:auto;font-size:11px;color:var(--ll)">${_emails.length}</span>`;
            }
            return `<div class="el-tab ${_tab === k ? 'active' : ''}" onclick="Email._switchTab('${k}')">${lbl}${badge}</div>`;
          }).join('')}
          <div style="flex:1"></div>
          <div style="padding:10px 4px;font-size:11px;color:var(--ll);line-height:1.8;border-top:1px solid var(--bd);margin-top:8px">
            Sending as<br>
            <strong style="color:var(--sl);font-size:12px">${_esc(s.name)}</strong><br>
            <span style="font-size:10.5px">${_esc(BRAND.from)}</span>
          </div>
        </div>
        <div class="el-body" id="el-body">
          ${bodyContent}
        </div>
      </div>`;

    // Restore compose state if returning to compose tab
    if (_tab === 'compose' && _activeTmpl) {
      setTimeout(() => {
        const sel = document.getElementById('em-tmpl');
        if (sel) { sel.value = _activeTmpl; _pickTmpl(_activeTmpl); }
      }, 60);
    }
  }

  // ── TAB SWITCHING ─────────────────────────────────────────
  function _switchTab(tab) {
    _tab = tab;
    if (tab === 'inbox' && _inbox.length === 0) {
      _loadInbox('').then(() => _draw()).catch(() => _draw());
    } else {
      _draw();
    }
  }

  // ── INBOX ACTIONS ─────────────────────────────────────────
  async function _refreshInbox() {
    const bodyEl = document.getElementById('el-body');
    if (bodyEl) bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ll)"><div class="spinner" style="margin:0 auto 12px"></div>Loading inbox…</div>';
    await _loadInbox(_inboxSearch);
    _thread = null;
    _tab = 'inbox';
    _draw();
  }

  function _searchInbox() {
    const q = ((document.getElementById('inbox-search') || {}).value || '');
    _loadInbox(q).then(() => { _thread = null; _draw(); });
  }

  async function _openThread(id) {
    const bodyEl = document.getElementById('el-body');
    if (bodyEl) bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ll)"><div class="spinner" style="margin:0 auto 12px"></div>Loading…</div>';
    try {
      _thread = await API.get('email.thread', { id });
    } catch(e) {
      if (window.UI) UI.toast('Could not load thread: ' + e.message, 'r');
      _thread = null;
    }
    _draw();
  }

  function _closeThread() { _thread = null; _draw(); }

  async function _sendReply(to, subject) {
    const body = ((document.getElementById('thread-reply') || {}).value || '');
    if (!body.trim()) { if (window.UI) UI.toast('Please type a reply first', 'r'); return; }
    const reSubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
    try {
      await API.post('email.send', {
        to, subject: reSubject, notes: body, htmlBody: '', template: 'Reply',
        replyTo: BRAND.replyTo, fromName: BRAND.company,
      });
      if (window.UI) UI.toast('Reply sent', 'g');
      _closeThread();
    } catch(e) {
      if (window.UI) UI.toast('Send failed: ' + e.message, 'r');
    }
  }

  function _replyCompose(to, subject) {
    _tab = 'compose'; _thread = null; _draw();
    setTimeout(() => {
      const toEl   = document.getElementById('em-to');
      const subjEl = document.getElementById('em-subj');
      if (toEl)   toEl.value   = to;
      if (subjEl) subjEl.value = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
    }, 60);
  }

  // ── ENTRY POINT ───────────────────────────────────────────
  async function render() {
    _tab = 'inbox';
    // Load sent log immediately (fast, our own sheet)
    try { await _loadEmails(); } catch(e) { _emails = []; }
    _draw();
    // Load Gmail inbox in background
    _loadInbox('').then(() => _draw()).catch(() => {});
  }

  // ── PUBLIC API ────────────────────────────────────────────
  return {
    render,
    _switchTab,
    _pickTmpl,
    _livePreview,
    _refreshSubject,
    _useTmpl,
    _prevModal,
    _send,
    _searchInbox,
    _openThread,
    _closeThread,
    _sendReply,
    _replyCompose,
    _refreshInbox,
  };

})();
