// ============================================================
// AskMiro Ops — email.js
// Premium text-only Email Centre
// No SVG, no logo dependency, token-resolved subjects
// ============================================================

const Email = (() => {
  // ───────────────────────────────────────────────────────────
  // STATE
  // ───────────────────────────────────────────────────────────
  let _tab = 'sent'; // inbox | sent | compose | templates
  let _emails = [];
  let _inbox = [];
  let _thread = null;
  let _activeTmpl = '';
  let _loading = false;

  const BRAND = {
    company: 'AskMiro Cleaning Services',
    from: 'office@askmiro.com',
    replyTo: 'info@askmiro.com',
    phone: '020 8073 0621',
    website: 'www.askmiro.com',
    senderName: 'Mike Kato',
    senderRole: 'Director — AskMiro Cleaning Services'
  };

  const T = {
    bg: '#F5F7FB',
    card: '#FFFFFF',
    ink: '#0F172A',
    charcoal: '#1F2937',
    slate: '#475569',
    muted: '#94A3B8',
    line: '#E2E8F0',
    soft: '#F8FAFC',
    navy: '#0C1929',
    teal: '#0D9488',
    teal2: '#14B8A6',
    tealGhost: 'rgba(13,148,136,0.08)',
    amber: '#D97706',
    green: '#059669',
    danger: '#DC2626',
    radius: 14
  };

  // ───────────────────────────────────────────────────────────
  // TEMPLATES
  // ───────────────────────────────────────────────────────────
  const TEMPLATES = {
    'Introduction': {
      subject: 'Managed Commercial Cleaning — AskMiro Cleaning Services',
      blurb: 'Premium branded introduction for commercial cleaning outreach.',
      fields: [
        { id: 'name', label: 'Contact Name', ph: 'e.g. Sarah', type: 'text', default: '' },
        { id: 'customIntro', label: 'Opening Message (editable)', ph: 'Optional custom introduction text', type: 'textarea', rows: 7, default: '' }
      ]
    },

    'Proposal / Quote': {
      subject: 'AskMiro Cleaning Proposal — {{name}}',
      blurb: 'Polished proposal email for a quoted service.',
      fields: [
        { id: 'name', label: 'Client Name', ph: 'e.g. Romel', type: 'text', default: '' },
        { id: 'site', label: 'Site', ph: 'e.g. SW11 2BA', type: 'text', default: '' },
        { id: 'amount', label: 'Monthly Amount', ph: 'e.g. 2625', type: 'text', default: '' },
        { id: 'visits', label: 'Visits / Week', ph: 'e.g. 1', type: 'text', default: '' },
        { id: 'days', label: 'Days / Week', ph: 'e.g. Weekly', type: 'text', default: '' },
        { id: 'hours', label: 'Hours / Visit', ph: 'e.g. 24', type: 'text', default: '' },
        { id: 'areas', label: 'Included Areas', ph: 'e.g. reception, washrooms, floors', type: 'text', default: '' }
      ]
    },

    'Follow-up': {
      subject: 'Following Up — AskMiro Cleaning Services',
      blurb: 'Soft follow-up after intro or proposal.',
      fields: [
        { id: 'name', label: 'Contact Name', ph: 'e.g. Sarah', type: 'text', default: '' },
        { id: 'site', label: 'Site', ph: 'e.g. 10 King George’s Gate', type: 'text', default: '' }
      ]
    },

    'Referral / Introduction Follow-Up': {
      subject: 'Great meeting you on {{meeting_date}}',
      blurb: 'For contacts who cannot award work directly but can refer homeowners or buyers.',
      fields: [
        { id: 'contact_name', label: 'Contact Name', ph: 'e.g. Daren', type: 'text', default: '' },
        { id: 'meeting_date', label: 'Meeting Date', ph: 'e.g. 05 March', type: 'text', default: '' },
        { id: 'location', label: 'Location', ph: 'e.g. King George’s Gate', type: 'text', default: '' },
        {
          id: 'body',
          label: 'Opening Message (editable)',
          type: 'textarea',
          rows: 9,
          default:
`Great meeting you on {{meeting_date}} at {{location}}.

Thank you again for offering to share my details with the homeowners — I really appreciate it.

If any of the buyers need help with move-in cleaning, after-builders cleaning, or regular home cleaning once they settle in, we would be very happy to assist.

We’re a local cleaning company based nearby and currently helping homeowners across South West London with reliable and flexible cleaning services.

If helpful, I can also send over a short one-page introduction or flyer that your team can easily share with the buyers.

Thanks again and nice to meet you.`
        }
      ]
    },

    'Welcome Onboard': {
      subject: 'Welcome to AskMiro Cleaning Services',
      blurb: 'Client onboarding / contract start confirmation.',
      fields: [
        { id: 'name', label: 'Client Name', ph: 'e.g. Sarah', type: 'text', default: '' },
        { id: 'site', label: 'Site Address', ph: 'e.g. SW11 2BA', type: 'text', default: '' },
        { id: 'startDate', label: 'Start Date', ph: 'e.g. 14 March 2026', type: 'text', default: '' },
        { id: 'schedule', label: 'Schedule', ph: 'e.g. Weekly', type: 'text', default: '' },
        { id: 'team', label: 'Team Size', ph: 'e.g. 2', type: 'text', default: '' },
        { id: 'amount', label: 'Monthly Fee', ph: 'e.g. 1800', type: 'text', default: '' }
      ]
    },

    'Invoice': {
      subject: 'Invoice {{invNum}} — AskMiro Cleaning Services',
      blurb: 'Premium invoice email.',
      fields: [
        { id: 'name', label: 'Client Name', ph: 'e.g. Accounts Team', type: 'text', default: '' },
        { id: 'site', label: 'Site', ph: 'e.g. Battersea', type: 'text', default: '' },
        { id: 'amount', label: 'Net Amount', ph: 'e.g. 1200', type: 'text', default: '' },
        { id: 'invNum', label: 'Invoice Number', ph: 'e.g. INV-001', type: 'text', default: '' },
        { id: 'period', label: 'Service Period', ph: 'e.g. March 2026', type: 'text', default: '' },
        { id: 'dueDate', label: 'Due Date', ph: 'e.g. 30 March 2026', type: 'text', default: '' },
        { id: 'issueDate', label: 'Issue Date', ph: 'e.g. 07 March 2026', type: 'text', default: '' }
      ]
    },

    'Contract Renewal': {
      subject: 'Renewal — AskMiro Cleaning Services',
      blurb: 'Polished renewal request.',
      fields: [
        { id: 'name', label: 'Client Name', ph: 'e.g. Sarah', type: 'text', default: '' },
        { id: 'site', label: 'Site', ph: 'e.g. SW11 2BA', type: 'text', default: '' },
        { id: 'renewDate', label: 'Renewal Date', ph: 'e.g. 01 April 2026', type: 'text', default: '' },
        { id: 'schedule', label: 'Schedule', ph: 'e.g. Weekly', type: 'text', default: '' },
        { id: 'amount', label: 'Monthly Fee', ph: 'e.g. 1800', type: 'text', default: '' }
      ]
    }
  };

  // ───────────────────────────────────────────────────────────
  // HELPERS
  // ───────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _fmtDate(dt) {
    try {
      return new Date(dt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return dt || '';
    }
  }

  function _sender() {
    const u = (window.Auth && typeof Auth.getUser === 'function' && Auth.getUser()) || {};
    return {
      name: u.name || BRAND.senderName,
      email: BRAND.from,
      role: BRAND.senderRole
    };
  }

  function _resolveTokens(str, fields = {}) {
    return String(str || '')
      .replace(/\{\{contact_name\}\}/g, fields.contact_name || '')
      .replace(/\{\{meeting_date\}\}/g, fields.meeting_date || '')
      .replace(/\{\{location\}\}/g, fields.location || '')
      .replace(/\{\{name\}\}/g, fields.name || '')
      .replace(/\{\{site\}\}/g, fields.site || '')
      .replace(/\{\{invNum\}\}/g, fields.invNum || '')
      .replace(/\{\{period\}\}/g, fields.period || '')
      .trim();
  }

  function _collectFields(tmplName) {
    const t = TEMPLATES[tmplName];
    const out = {};
    if (!t || !t.fields) return out;
    t.fields.forEach(f => {
      const el = document.getElementById(`emf-${f.id}`);
      out[f.id] = el ? el.value : '';
    });
    return out;
  }

  function _p(t) {
    return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.8;color:${T.slate}">${t}</p>`;
  }

  function _h(t) {
    return `<h1 style="margin:0 0 6px;font-family:Georgia,Times New Roman,serif;font-size:22px;line-height:1.15;font-weight:700;color:${T.charcoal};letter-spacing:-0.5px">${t}</h1>`;
  }

  function _sub(t) {
    return `<div style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${T.teal}">${t}</div>`;
  }

  function _gr(name) {
    return `<p style="margin:0 0 18px;font-family:Georgia,Times New Roman,serif;font-size:17px;font-style:italic;color:${T.charcoal}">Dear ${_esc(name || 'there')},</p>`;
  }

  function _divider() {
    return `<div style="height:1px;background:${T.line};margin:20px 0"></div>`;
  }

  function _bullets(items) {
    return `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;background:${T.soft};border:1px solid ${T.line};border-radius:12px">
        <tbody>
          ${items.map(item => `
            <tr>
              <td style="vertical-align:top;padding:12px 0 0 16px;width:28px">
                <div style="width:18px;height:18px;border-radius:50%;background:${T.teal};color:#fff;text-align:center;line-height:18px;font-size:11px;font-weight:800">✓</div>
              </td>
              <td style="padding:10px 16px 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:${T.slate}">
                ${item}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function _cta(label, href) {
    return `
      <table cellpadding="0" cellspacing="0" style="margin:22px 0 18px">
        <tr>
          <td style="background:${T.teal};border-radius:10px">
            <a href="${href}" style="display:block;padding:14px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;color:#fff;text-decoration:none;letter-spacing:0.1px">
              ${label}
            </a>
          </td>
          <td width="10"></td>
          <td style="border:1px solid ${T.line};border-radius:10px;background:#fff">
            <a href="tel:${BRAND.phone.replace(/\s+/g, '')}" style="display:block;padding:13px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:${T.charcoal};text-decoration:none">
              ☎ ${BRAND.phone}
            </a>
          </td>
        </tr>
      </table>
    `;
  }

  function _sig(sender) {
    return `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:30px">
        <tr>
          <td style="border-top:2px solid ${T.teal};padding-top:18px">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:${T.charcoal}">
              ${_esc(sender.name)}
            </div>
            <div style="margin-top:3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:${T.teal}">
              ${_esc(sender.role)}
            </div>
            <div style="margin-top:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${T.slate}">
              ☎ <a href="tel:${BRAND.phone.replace(/\s+/g, '')}" style="color:${T.slate};text-decoration:none">${BRAND.phone}</a>
              &nbsp;|&nbsp;
              ✉ <a href="mailto:${BRAND.replyTo}" style="color:${T.slate};text-decoration:none">${BRAND.replyTo}</a>
              &nbsp;|&nbsp;
              <a href="https://${BRAND.website}" style="color:${T.teal};text-decoration:none;font-weight:700">${BRAND.website}</a>
            </div>
            <div style="margin-top:12px;background:${T.soft};border:1px solid ${T.line};border-radius:10px;padding:9px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;color:${T.muted}">
              ✓ Fully insured &nbsp;&nbsp; ✓ COSHH compliant &nbsp;&nbsp; ✓ Residential & commercial cleaning
            </div>
          </td>
        </tr>
      </table>
    `;
  }

  function _wrap(label, bodyHtml, sender) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${_esc(BRAND.company)}</title>
</head>
<body style="margin:0;padding:0;background:${T.bg}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${T.bg};padding:32px 16px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
          <tr>
            <td style="background:${T.navy};border-radius:16px 16px 0 0;padding:28px 32px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle">
                    <div style="font-family:Georgia,Times New Roman,serif;font-size:26px;font-weight:700;letter-spacing:-0.7px;line-height:1">
                      <span style="color:#FFFFFF">Ask</span><span style="color:${T.teal}">Miro</span>
                    </div>
                    <div style="margin-top:5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:rgba(255,255,255,0.42)">
                      Cleaning Services
                    </div>
                  </td>

                  <td align="right" style="vertical-align:middle">
                    <div style="
                      display:inline-block;
                      max-width:230px;
                      background:rgba(255,255,255,0.06);
                      border:1px solid rgba(255,255,255,0.10);
                      border-radius:999px;
                      padding:10px 18px;
                      text-align:right;
                    ">
                      <span style="
                        display:block;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
                        font-size:10.5px;
                        font-weight:700;
                        color:rgba(255,255,255,0.78);
                        letter-spacing:1.4px;
                        text-transform:uppercase;
                        line-height:1.45;
                        white-space:normal;
                        word-break:keep-all;
                      ">${_esc(label)}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${T.teal},${T.teal2})"></td>
          </tr>

          <tr>
            <td style="background:${T.card};padding:48px 40px 36px;border-left:1px solid ${T.line};border-right:1px solid ${T.line}">
              ${bodyHtml}
              ${_sig(sender)}
            </td>
          </tr>

          <tr>
            <td style="background:${T.navy};border-radius:0 0 16px 16px;padding:18px 28px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;color:rgba(255,255,255,0.82);letter-spacing:-0.2px">${BRAND.company}</div>
                    <div style="margin-top:3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.32)">London & UK · Premium cleaning operations</div>
                  </td>
                  <td align="right">
                    <a href="https://${BRAND.website}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#5EEAD4;text-decoration:none;font-weight:800">${BRAND.website}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

  function _buildEmailTemplate(tmpl, f, rawSubject) {
    const sender = _sender();

    if (tmpl === 'Introduction') {
      const introText = (f.customIntro || '').trim();
      const introBody = introText
        ? introText.split(/\n\s*\n/).map(x => _p(_resolveTokens(_esc(x).replace(/\n/g, '<br>'), f))).join('')
        : (
          _p(`We are <strong>${BRAND.company}</strong> — a managed commercial cleaning company serving offices, warehouses, schools, healthcare facilities, and automotive dealerships across London and the UK.`) +
          _p(`Unlike typical contractors, we don’t just supply staff — we manage the service end-to-end: consistent teams, supervisor oversight, quality checks, and one clear point of contact.`)
        );

      return _wrap(
        'Introduction',
        _h('Professional cleaning. Properly managed.') +
        _sub('London & UK') +
        _gr(f.name || 'there') +
        introBody +
        _bullets([
          '<strong>Consistent, site-trained teams</strong> — the same people at your site',
          '<strong>Supervisor oversight</strong> — quality monitored and accountable',
          '<strong>COSHH-compliant processes</strong> — safe systems and documentation',
          '<strong>Single point of contact</strong> — clear communication throughout'
        ]) +
        _p(`We’d be happy to arrange a <strong>free, no-obligation site visit</strong> and return a proposal within 48 hours.`) +
        _cta('Book a Site Visit', `mailto:${BRAND.replyTo}?subject=Site Visit Request`) +
        _divider() +
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:${T.muted}">This message was sent by ${BRAND.company}. All services are tailored to site requirements.</div>`,
        sender
      );
    }

    if (tmpl === 'Proposal / Quote') {
      return _wrap(
        'Proposal',
        _h('Your cleaning proposal.') +
        _sub('Prepared following our discussion') +
        _gr(f.name || 'there') +
        _p(`Thank you for considering ${BRAND.company} for <strong>${_esc(f.site || 'your premises')}</strong>. Please find our proposed service outline below.`) +
        _bullets([
          `<strong>Monthly investment:</strong> £${_esc(f.amount || 'TBC')}`,
          `<strong>Visits per week:</strong> ${_esc(f.visits || 'TBC')}`,
          `<strong>Hours per visit:</strong> ${_esc(f.hours || 'TBC')}`,
          `<strong>Included areas:</strong> ${_esc(f.areas || 'As agreed')}`
        ]) +
        _p(`If this works for you, simply reply and we can move to mobilisation.`) +
        _cta('Reply to Accept', `mailto:${BRAND.replyTo}?subject=Accepting Proposal`) +
        _divider(),
        sender
      );
    }

    if (tmpl === 'Follow-up') {
      return _wrap(
        'Follow-up',
        _h('Just checking in.') +
        _sub('Following our recent conversation') +
        _gr(f.name || 'there') +
        _p(`I wanted to follow up regarding cleaning support for <strong>${_esc(f.site || 'your site')}</strong>.`) +
        _p(`If useful, I’d be happy to revisit scope, timing, or pricing and send an updated version quickly.`) +
        _cta('Reply to This Email', `mailto:${BRAND.replyTo}`),
        sender
      );
    }

    if (tmpl === 'Referral / Introduction Follow-Up') {
      const bodyText = _resolveTokens(f.body || '', f);
      const bodyHtml = bodyText
        .split(/\n\s*\n/)
        .map(chunk => _p(_esc(chunk).replace(/\n/g, '<br>')))
        .join('');

      return _wrap(
        'Referral / Introduction Follow-Up',
        _h('Great meeting you.') +
        _sub(f.meeting_date ? `Following our meeting on ${_esc(f.meeting_date)}` : 'Thank you for the introduction') +
        _gr(f.contact_name || 'there') +
        bodyHtml +
        _cta('Get in Touch', `mailto:${BRAND.replyTo}`) +
        _divider() +
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:${T.muted}">
          ${BRAND.company} — London & UK. Residential & commercial cleaning. Fully insured.
        </div>`,
        sender
      );
    }

    if (tmpl === 'Welcome Onboard') {
      return _wrap(
        'Welcome',
        _h('Welcome to AskMiro.') +
        _sub('We’re delighted to be working with you') +
        _gr(f.name || 'there') +
        _p(`Your service at <strong>${_esc(f.site || 'your site')}</strong> is now confirmed.`) +
        _bullets([
          `<strong>Service start:</strong> ${_esc(f.startDate || 'TBC')}`,
          `<strong>Schedule:</strong> ${_esc(f.schedule || 'TBC')}`,
          `<strong>Team size:</strong> ${_esc(f.team || 'TBC')}`,
          `<strong>Monthly fee:</strong> £${_esc(f.amount || 'TBC')}`
        ]) +
        _p(`We’ll make sure onboarding is smooth and communication stays clear from day one.`),
        sender
      );
    }

    if (tmpl === 'Invoice') {
      const net = parseFloat(f.amount || 0);
      const vat = isNaN(net) ? '0.00' : (net * 0.2).toFixed(2);
      const total = isNaN(net) ? '0.00' : (net * 1.2).toFixed(2);

      return _wrap(
        'Invoice',
        _h(`Invoice ${_esc(f.invNum || '')}`) +
        _sub(_esc(f.period || 'Service period')) +
        _gr(f.name || 'Client') +
        _p(`Please find below your invoice for services at <strong>${_esc(f.site || 'your site')}</strong>.`) +
        _bullets([
          `<strong>Subtotal:</strong> £${_esc(f.amount || '0.00')}`,
          `<strong>VAT (20%):</strong> £${vat}`,
          `<strong>Total due:</strong> £${total}`,
          `<strong>Due date:</strong> ${_esc(f.dueDate || 'TBC')}`
        ]) +
        _cta('Reply for Payment Query', `mailto:${BRAND.replyTo}?subject=Invoice ${encodeURIComponent(f.invNum || '')}`),
        sender
      );
    }

    if (tmpl === 'Contract Renewal') {
      return _wrap(
        'Renewal',
        _h('Your service agreement is up for renewal.') +
        _sub('We’d love to continue working with you') +
        _gr(f.name || 'there') +
        _p(`Your current service at <strong>${_esc(f.site || 'your site')}</strong> is due for renewal on <strong>${_esc(f.renewDate || 'TBC')}</strong>.`) +
        _bullets([
          `<strong>Schedule:</strong> ${_esc(f.schedule || 'TBC')}`,
          `<strong>Monthly fee:</strong> £${_esc(f.amount || 'TBC')}`
        ]) +
        _p(`If you’re happy to continue, simply reply and we’ll keep everything moving without interruption.`) +
        _cta('Confirm Renewal', `mailto:${BRAND.replyTo}?subject=Renewal Confirmed`),
        sender
      );
    }

    return _wrap(
      'Email',
      _h(_esc(rawSubject || 'Message')) +
      _gr('there') +
      _p('Your message is ready.'),
      sender
    );
  }

  // ───────────────────────────────────────────────────────────
  // DATA
  // ───────────────────────────────────────────────────────────
  async function _loadEmails() {
    try {
      _emails = await API.get('emails');
    } catch (e) {
      _emails = [];
      if (window.UI) UI.toast(e.message || 'Failed to load emails', 'r');
    }
  }

  async function _loadInbox() {
    try {
      _inbox = await API.get('inbox');
    } catch (e) {
      _inbox = [];
      if (window.UI) UI.toast(e.message || 'Failed to load inbox', 'r');
    }
  }

  async function _openThread(id) {
    try {
      _thread = await API.get('email.thread', { id });
      _draw();
    } catch (e) {
      if (window.UI) UI.toast(e.message || 'Failed to open thread', 'r');
    }
  }

  function _closeThread() {
    _thread = null;
    _draw();
  }

  // ───────────────────────────────────────────────────────────
  // PREVIEW / SUBJECT
  // ───────────────────────────────────────────────────────────
  function _refreshSubject() {
    const tmpl = _activeTmpl || (document.getElementById('em-tmpl') || {}).value || '';
    const subjEl = document.getElementById('em-subj');
    if (!tmpl || !subjEl || !TEMPLATES[tmpl]) return;
    const fields = _collectFields(tmpl);
    subjEl.value = _resolveTokens(TEMPLATES[tmpl].subject, fields);
  }

  function _livePreview() {
    const tmpl = _activeTmpl || (document.getElementById('em-tmpl') || {}).value || '';
    const previewWrap = document.getElementById('em-prev-wrap');
    const previewEl = document.getElementById('em-prev');
    const subjEl = document.getElementById('em-subj');

    if (!previewWrap || !previewEl) return;

    if (!tmpl || !TEMPLATES[tmpl]) {
      previewWrap.style.display = 'none';
      previewEl.innerHTML = '';
      return;
    }

    const fields = _collectFields(tmpl);
    _refreshSubject();

    previewWrap.style.display = 'block';
    previewEl.innerHTML = _buildEmailTemplate(tmpl, fields, subjEl ? subjEl.value : '');
  }

  function _pickTmpl(name) {
    _activeTmpl = name;
    const t = TEMPLATES[name];
    const fieldsWrap = document.getElementById('em-fields');
    const fieldsInner = document.getElementById('em-fields-inner');

    if (!t || !fieldsWrap || !fieldsInner) return;

    fieldsInner.innerHTML = t.fields.map(f => {
      if (f.type === 'textarea') {
        return `
          <div style="margin-bottom:12px">
            <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;color:${T.slate}">${_esc(f.label)}</label>
            <textarea
              id="emf-${f.id}"
              placeholder="${_esc(f.ph || '')}"
              rows="${f.rows || 6}"
              oninput="Email._livePreview(); Email._refreshSubject();"
              style="width:100%;box-sizing:border-box;border:1px solid ${T.line};border-radius:10px;padding:12px 14px;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal};background:#fff;resize:vertical"
            >${_esc(f.default || '')}</textarea>
          </div>`;
      }

      return `
        <div style="margin-bottom:12px">
          <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:700;color:${T.slate}">${_esc(f.label)}</label>
          <input
            id="emf-${f.id}"
            value="${_esc(f.default || '')}"
            placeholder="${_esc(f.ph || '')}"
            oninput="Email._livePreview(); Email._refreshSubject();"
            style="width:100%;box-sizing:border-box;border:1px solid ${T.line};border-radius:10px;padding:12px 14px;font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal};background:#fff"
          />
        </div>`;
    }).join('');

    fieldsWrap.style.display = 'block';
    _refreshSubject();
    _livePreview();
  }

  // ───────────────────────────────────────────────────────────
  // SEND
  // ───────────────────────────────────────────────────────────
  async function _send() {
    const toEl = document.getElementById('em-to');
    const subjEl = document.getElementById('em-subj');
    const btn = document.getElementById('em-send-btn');

    const to = (toEl && toEl.value || '').trim();
    const rawSubject = (subjEl && subjEl.value || '').trim();
    const tmpl = _activeTmpl || ((document.getElementById('em-tmpl') || {}).value || '');

    if (!to) {
      if (window.UI) UI.toast('Please enter a recipient email', 'r');
      return;
    }

    if (!rawSubject) {
      if (window.UI) UI.toast('Please enter a subject', 'r');
      return;
    }

    const fields = tmpl ? _collectFields(tmpl) : {};
    const sender = _sender();

    fields.senderName = sender.name;
    fields.senderRole = sender.role;
    fields.senderEmail = BRAND.from;
    fields.replyTo = BRAND.replyTo;

    const subject = _resolveTokens(rawSubject, fields);

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending…';
      }

      await API.post('email.send', {
        to,
        subject,
        template: tmpl || 'Custom',
        fields: JSON.stringify(fields)
      });

      if (window.UI) UI.toast('✓ Email sent', 'g');

      _activeTmpl = '';
      _tab = 'sent';
      _thread = null;

      await _loadEmails();
      _draw();
    } catch (e) {
      if (window.UI) UI.toast('Send failed: ' + (e.message || 'Unknown error'), 'r');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send Branded Email';
      }
    }
  }

  // ───────────────────────────────────────────────────────────
  // RENDERERS
  // ───────────────────────────────────────────────────────────
  function _sentHTML() {
    return `
      <div style="background:${T.card};border:1px solid ${T.line};border-radius:${T.radius}px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:${T.soft}">
              <th style="${_th()}">ID</th>
              <th style="${_th()}">To</th>
              <th style="${_th()}">Subject</th>
              <th style="${_th()}">Template</th>
              <th style="${_th()}">Sent</th>
            </tr>
          </thead>
          <tbody>
            ${(_emails || []).length ? _emails.map(r => `
              <tr style="border-top:1px solid ${T.line}">
                <td style="${_td(true)}">${_esc(r.id || '')}</td>
                <td style="${_td()}">${_esc(r.to || '')}</td>
                <td style="${_td()}">${_esc(r.subject || '')}</td>
                <td style="${_td()}">${_esc(r.template || '')}</td>
                <td style="${_td()}">${_fmtDate(r.sentAt || r.ts || '')}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="5" style="padding:28px;text-align:center;color:${T.muted};font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">No sent emails yet</td></tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  }

  function _inboxHTML() {
    if (_thread) {
      return `
        <div style="background:${T.card};border:1px solid ${T.line};border-radius:${T.radius}px;padding:18px 18px 8px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div>
              <div style="font:800 20px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal}">${_esc(_thread.subject || '(no subject)')}</div>
              <div style="margin-top:4px;font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.muted}">${(_thread.messages || []).length} message(s)</div>
            </div>
            <button onclick="Email._closeThread()" style="${_ghostBtn()}">Close</button>
          </div>
          ${(_thread.messages || []).map(m => `
            <div style="border-top:1px solid ${T.line};padding:14px 0">
              <div style="font:700 13px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal}">${_esc(m.from || '')}</div>
              <div style="margin-top:2px;font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.muted}">${_fmtDate(m.date || '')}</div>
              <div style="margin-top:12px;font:14px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.slate};word-break:break-word">${m.body || ''}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div style="background:${T.card};border:1px solid ${T.line};border-radius:${T.radius}px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:${T.soft}">
              <th style="${_th()}">From</th>
              <th style="${_th()}">Subject</th>
              <th style="${_th()}">Snippet</th>
              <th style="${_th()}">Date</th>
            </tr>
          </thead>
          <tbody>
            ${(_inbox || []).length ? _inbox.map(r => `
              <tr style="border-top:1px solid ${T.line};cursor:pointer" onclick="Email._openThread('${_esc(r.id || '')}')">
                <td style="${_td()}">${_esc(r.from || '')}</td>
                <td style="${_td()}">${_esc(r.subject || '')}</td>
                <td style="${_td()}">${_esc(r.snippet || '')}</td>
                <td style="${_td()}">${_fmtDate(r.date || '')}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="4" style="padding:28px;text-align:center;color:${T.muted};font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">Inbox empty</td></tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  }

  function _templatesHTML() {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
        ${Object.entries(TEMPLATES).map(([name, t]) => `
          <div style="background:${T.card};border:1px solid ${T.line};border-radius:${T.radius}px;padding:18px">
            <div style="font:800 15px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal}">${_esc(name)}</div>
            <div style="margin-top:8px;font:13px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.slate}">${_esc(t.blurb || '')}</div>
            <div style="margin-top:14px;font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.muted}">
              Subject: ${_esc(t.subject)}
            </div>
            <div style="margin-top:16px">
              <button onclick="Email._switchTab('compose'); setTimeout(() => Email._pickTmpl('${_esc(name)}'), 0)" style="${_primaryBtn()}">Use Template</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function _composeHTML() {
    const sender = _sender();

    return `
      <div style="display:grid;grid-template-columns:minmax(340px,420px) minmax(420px,1fr);gap:18px;align-items:start">
        <div style="background:${T.card};border:1px solid ${T.line};border-radius:${T.radius}px;padding:18px">
          <div style="font:800 18px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal};margin-bottom:16px">
            Compose
          </div>

          <div style="margin-bottom:12px">
            <label style="display:block;margin-bottom:6px;font:700 12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.slate}">Template</label>
            <select id="em-tmpl" onchange="Email._pickTmpl(this.value)" style="width:100%;box-sizing:border-box;border:1px solid ${T.line};border-radius:10px;padding:12px 14px;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal};background:#fff">
              <option value="">Select a template</option>
              ${Object.keys(TEMPLATES).map(name => `<option value="${_esc(name)}">${_esc(name)}</option>`).join('')}
            </select>
          </div>

          <div style="margin-bottom:12px">
            <label style="display:block;margin-bottom:6px;font:700 12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.slate}">To</label>
            <input id="em-to" type="email" placeholder="client@company.com" style="width:100%;box-sizing:border-box;border:1px solid ${T.line};border-radius:10px;padding:12px 14px;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal};background:#fff">
          </div>

          <div style="margin-bottom:14px">
            <label style="display:block;margin-bottom:6px;font:700 12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.slate}">Subject</label>
            <input id="em-subj" placeholder="Email subject" oninput="Email._livePreview()" style="width:100%;box-sizing:border-box;border:1px solid ${T.line};border-radius:10px;padding:12px 14px;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal};background:#fff">
          </div>

          <div id="em-fields" style="display:none">
            <div style="font:800 12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.muted};letter-spacing:0.8px;text-transform:uppercase;margin:6px 0 10px">
              Template fields
            </div>
            <div id="em-fields-inner"></div>
          </div>

          <div style="margin-top:16px;padding:14px 14px;border:1px solid ${T.line};border-radius:12px;background:${T.soft}">
            <div style="font:700 12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.muted};margin-bottom:4px">Sending as</div>
            <div style="font:800 15px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal}">${_esc(sender.name)}</div>
            <div style="margin-top:3px;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.teal}">${_esc(sender.email)}</div>
          </div>

          <div style="margin-top:16px;display:flex;gap:10px">
            <button id="em-send-btn" onclick="Email._send()" style="${_primaryBtn()}">Send Branded Email</button>
            <button onclick="Email._switchTab('sent')" style="${_ghostBtn()}">Cancel</button>
          </div>
        </div>

        <div id="em-prev-wrap" style="display:none;background:${T.card};border:1px solid ${T.line};border-radius:${T.radius}px;padding:18px">
          <div style="font:800 18px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal};margin-bottom:14px">
            Live Preview
          </div>
          <div id="em-prev" style="background:${T.bg};border-radius:12px;padding:12px;overflow:auto;max-height:860px"></div>
        </div>
      </div>
    `;
  }

  function _panelNav() {
    return `
      <div style="background:${T.card};border:1px solid ${T.line};border-radius:${T.radius}px;padding:12px">
        <button onclick="Email._switchTab('inbox')" style="${_sideBtn(_tab === 'inbox')}">Inbox</button>
        <button onclick="Email._switchTab('sent')" style="${_sideBtn(_tab === 'sent')}">Sent</button>
        <button onclick="Email._switchTab('compose')" style="${_sideBtn(_tab === 'compose')}">Compose</button>
        <button onclick="Email._switchTab('templates')" style="${_sideBtn(_tab === 'templates')}">Templates</button>
      </div>
    `;
  }

  function _bodyHTML() {
    if (_tab === 'inbox') return _inboxHTML();
    if (_tab === 'compose') return _composeHTML();
    if (_tab === 'templates') return _templatesHTML();
    return _sentHTML();
  }

  // ───────────────────────────────────────────────────────────
  // STYLES
  // ───────────────────────────────────────────────────────────
  function _primaryBtn() {
    return `
      border:0;background:${T.teal};color:#fff;border-radius:10px;
      padding:12px 16px;font:800 13px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      cursor:pointer
    `;
  }

  function _ghostBtn() {
    return `
      border:1px solid ${T.line};background:#fff;color:${T.charcoal};border-radius:10px;
      padding:12px 16px;font:700 13px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      cursor:pointer
    `;
  }

  function _sideBtn(active) {
    return `
      display:block;width:100%;text-align:left;margin:0 0 6px;border:0;border-radius:10px;
      padding:12px 14px;cursor:pointer;
      font:${active ? '800' : '700'} 14px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      color:${active ? '#fff' : T.charcoal};
      background:${active ? T.teal : 'transparent'}
    `;
  }

  function _th() {
    return `
      text-align:left;padding:13px 14px;font:800 11px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      letter-spacing:0.8px;text-transform:uppercase;color:${T.muted}
    `;
  }

  function _td(mono) {
    return `
      padding:14px;font:${mono ? '700 12px ui-monospace,SFMono-Regular,Menlo,monospace' : '14px -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif'};
      color:${mono ? T.slate : T.charcoal};vertical-align:top
    `;
  }

  // ───────────────────────────────────────────────────────────
  // DRAW
  // ───────────────────────────────────────────────────────────
  function _draw() {
    const app = document.getElementById('main-content');
    if (!app) return;

    app.innerHTML = `
      <div style="padding:18px 20px 24px;background:${T.bg};min-height:100%">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div>
            <div style="font:800 24px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.charcoal}">Email Centre</div>
            <div style="margin-top:4px;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.muted}">
              Premium brand-safe email operations
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="display:inline-flex;align-items:center;gap:6px;font:700 12px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${T.green}">
              <span style="width:8px;height:8px;border-radius:50%;background:${T.green};display:inline-block"></span>
              Live
            </span>
            <button onclick="Email._switchTab('compose')" style="${_primaryBtn()}">+ Compose</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:220px minmax(0,1fr);gap:18px;align-items:start">
          ${_panelNav()}
          <div>${_bodyHTML()}</div>
        </div>
      </div>
    `;

    if (_tab === 'compose' && _activeTmpl) {
      const tmplEl = document.getElementById('em-tmpl');
      if (tmplEl) tmplEl.value = _activeTmpl;
      _pickTmpl(_activeTmpl);
    }
  }

  // ───────────────────────────────────────────────────────────
  // PUBLIC
  // ───────────────────────────────────────────────────────────
  async function render() {
    if (_tab === 'inbox') {
      await _loadInbox();
    } else {
      await _loadEmails();
    }
    _draw();
  }

  async function _switchTab(tab) {
    _tab = tab;
    if (tab === 'inbox') await _loadInbox();
    if (tab === 'sent') await _loadEmails();
    _draw();
  }

  return {
    render,
    _switchTab,
    _pickTmpl,
    _livePreview,
    _refreshSubject,
    _send,
    _openThread,
    _closeThread
  };
})();
