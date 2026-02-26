// ============================================================
// AskMiro Ops — modules/email.js
// Premium branded email centre
// ============================================================
const Email = (() => {

  let _emails     = [];
  let _tab        = 'log';
  let _activeTmpl = '';
  let _inbox       = [];
  let _thread      = null;
  let _inboxSearch = '';
  let _inboxPage   = 0;

  // ── BRAND ────────────────────────────────────────────────
  const T = {
    teal:     '#0D9488',
    tealDark: '#0F766E',
    navy:     '#0C1929',
    navyMid:  '#122440',
    charcoal: '#1F2937',
    slate:    '#475569',
    muted:    '#94A3B8',
    border:   '#E2E8F0',
    offWhite: '#F8FAFC',
  };

  const PHONE   = '020 8073 0621';
  const EMAIL   = 'info@askmiro.com';
  const WEBSITE = 'www.askmiro.com';

  // ── SENDER from Auth ─────────────────────────────────────
  function _sender() {
    const u = Auth.getUser();
    return {
      name:  (u && u.name)  || 'AskMiro Team',
      email: (u && u.email) || EMAIL,
      role:  (u && u.role)  || 'AskMiro Cleaning Services',
    };
  }

  // ── LOGO SVG ─────────────────────────────────────────────
  const LOGO = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="9" fill="#0D9488"/><path d="M10 26L15 14L20 26L25 14L30 26" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // ── SIGNATURE ────────────────────────────────────────────
  function _sig() {
    const s = _sender();
    return `
<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:36px">
  <tr><td style="border-top:2px solid ${T.teal};padding-top:24px">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:14px;vertical-align:top">${LOGO}</td>
        <td style="vertical-align:top">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;color:${T.charcoal};line-height:1.2">${s.name}</div>
          <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:${T.teal};letter-spacing:1.2px;text-transform:uppercase;margin:3px 0 8px">${s.role} &mdash; AskMiro Cleaning Services</div>
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:18px">
              <a href="tel:02039000000" style="font-family:Arial,sans-serif;font-size:12px;color:${T.slate};text-decoration:none">&#9742;&nbsp;${PHONE}</a>
            </td>
            <td style="padding-right:18px">
              <a href="mailto:${EMAIL}" style="font-family:Arial,sans-serif;font-size:12px;color:${T.slate};text-decoration:none">&#9993;&nbsp;${EMAIL}</a>
            </td>
            <td>
              <a href="https://${WEBSITE}" style="font-family:Arial,sans-serif;font-size:12px;color:${T.teal};text-decoration:none;font-weight:600">${WEBSITE}</a>
            </td>
          </tr></table>
        </td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px;background:${T.offWhite};border:1px solid ${T.border};border-radius:8px">
      <tr><td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:10.5px;color:${T.muted};letter-spacing:0.4px">
        &#10003;&nbsp;COSHH Compliant &nbsp;&nbsp;
        &#10003;&nbsp;Fully Insured &nbsp;&nbsp;
        &#10003;&nbsp;ISO Quality Standards &nbsp;&nbsp;
        &#10003;&nbsp;London &amp; UK Coverage
      </td></tr>
    </table>
  </td></tr>
</table>`;
  }

  // ── MASTER WRAPPER ────────────────────────────────────────
  function _wrap(label, accent, preheader, body) {
    const s = _sender();
    const ac = accent || T.teal;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AskMiro Cleaning Services</title>
<style>
  @media only screen and (max-width:600px){
    .ew{width:100%!important} .eb{padding:24px 18px!important} .eh{padding:22px 18px!important}
    .sb td{display:block!important;width:100%!important;border-right:none!important;border-bottom:1px solid rgba(255,255,255,0.08)!important}
    .db td{display:block!important;width:100%!important;padding-bottom:8px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#E8EDF4;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;color:#E8EDF4;font-size:1px">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E8EDF4;padding:32px 16px">
<tr><td align="center">
<table class="ew" role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- HEADER -->
  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td class="eh" style="background:${T.navy};border-radius:12px 0 0 0;padding:26px 28px 22px;vertical-align:middle;width:52%">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:14px">${LOGO}</td>
            <td style="vertical-align:middle">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">AskMiro</div>
              <div style="font-family:Arial,sans-serif;font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:2.5px;text-transform:uppercase;margin-top:3px">Cleaning Services</div>
            </td>
          </tr></table>
        </td>
        <td class="eh" style="background:${ac};border-radius:0 12px 0 0;padding:26px 28px 22px;vertical-align:bottom;text-align:right">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;font-style:italic;color:rgba(255,255,255,0.85)">${label}</div>
          <div style="width:36px;height:2px;background:rgba(255,255,255,0.3);margin:8px 0 0 auto;border-radius:2px"></div>
        </td>
      </tr>
      <tr><td colspan="2" style="background:${ac};height:3px;line-height:3px;font-size:3px">&nbsp;</td></tr>
    </table>
  </td></tr>

  <!-- BODY -->
  <tr><td class="eb" style="background:#ffffff;padding:40px;border-left:1px solid ${T.border};border-right:1px solid ${T.border}">
    ${body}
    ${_sig()}
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:${T.navy};border-radius:0 0 12px 12px;padding:20px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,0.65)">AskMiro Cleaning Services</div>
          <div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px">A trading name of Miro Partners Ltd &nbsp;&bull;&nbsp; London &amp; UK</div>
        </td>
        <td align="right">
          <a href="https://${WEBSITE}" style="font-family:Arial,sans-serif;font-size:12px;color:${T.teal};text-decoration:none;font-weight:700">${WEBSITE}</a>
        </td>
      </tr>
      <tr><td colspan="2" style="padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)">
        <p style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.2);margin:12px 0 0;line-height:1.7">
          This email was sent by AskMiro Cleaning Services on behalf of ${s.name}.
          If received in error please notify us at ${EMAIL}. We will never share your details with third parties.
        </p>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
  }

  // ── COMPONENTS ────────────────────────────────────────────
  const _h   = t => `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:${T.charcoal};margin:0 0 4px;letter-spacing:-0.5px;line-height:1.2">${t}</h1>`;
  const _sub = t => `<p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${T.teal};letter-spacing:1.3px;text-transform:uppercase;margin:0 0 24px">${t}</p>`;
  const _p   = t => `<p style="font-family:Arial,sans-serif;font-size:14px;color:${T.slate};line-height:1.85;margin:0 0 16px">${t}</p>`;
  const _gr  = n => `<p style="font-family:Georgia,'Times New Roman',serif;font-size:17px;font-style:italic;color:${T.charcoal};margin:0 0 20px">Dear ${n || '[Name]'},</p>`;
  const _div = () => `<table cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0"><tr><td style="height:1px;background:${T.border}">&nbsp;</td></tr></table>`;
  const _sm  = t => `<p style="font-family:Arial,sans-serif;font-size:11.5px;color:${T.muted};line-height:1.7;margin:0">${t}</p>`;

  function _checklist(items) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="background:${T.offWhite};border:1px solid ${T.border};border-radius:10px;padding:18px 20px;margin-bottom:22px">
      <tbody>${items.map(item => `<tr>
        <td style="vertical-align:top;padding:0 10px 10px 0;width:22px">
          <div style="width:20px;height:20px;background:${T.teal};border-radius:50%;text-align:center;line-height:21px;font-size:11px;color:white;font-weight:700">&#10003;</div>
        </td>
        <td style="vertical-align:top;padding-bottom:10px;font-family:Arial,sans-serif;font-size:13.5px;color:${T.slate};line-height:1.6">${item}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function _statBand(stats) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="border-radius:10px;overflow:hidden;margin-bottom:24px">
      <tr class="sb">${stats.map((s, i) => `
        <td align="center" style="background:linear-gradient(135deg,${T.navy},${T.navyMid});padding:18px 16px;${i < stats.length - 1 ? 'border-right:1px solid rgba(255,255,255,0.08)' : ''}">
          <div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:rgba(255,255,255,0.45);margin-bottom:5px">${s.label}</div>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#FFFFFF;letter-spacing:-0.5px">${s.value}</div>
          ${s.sub ? `<div style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.4);margin-top:3px">${s.sub}</div>` : ''}
        </td>`).join('')}
      </tr>
    </table>`;
  }

  function _table(rows, total) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${T.border};border-radius:10px;overflow:hidden;margin-bottom:24px">
      ${rows.map(([l, v, bold, ac]) => `<tr style="border-bottom:1px solid ${T.border}">
        <td style="font-family:Arial,sans-serif;font-size:13px;color:${T.slate};padding:11px 16px">${l}</td>
        <td style="font-family:Arial,sans-serif;font-size:13px;color:${ac ? T.teal : T.charcoal};font-weight:${bold ? '700' : '400'};padding:11px 16px;text-align:right">${v}</td>
      </tr>`).join('')}
      ${total ? `<tr style="background:${T.navy}">
        <td style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;padding:14px 16px">${total[0]}</td>
        <td style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#fff;padding:14px 16px;text-align:right">${total[1]}</td>
      </tr>` : ''}
    </table>`;
  }

  function _quote(text) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px">
      <tr>
        <td style="width:4px;background:${T.teal};border-radius:4px">&nbsp;</td>
        <td style="padding:14px 18px;background:${T.offWhite};border:1px solid ${T.border};border-left:none;border-radius:0 8px 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:${T.charcoal};font-style:italic;line-height:1.7">&ldquo;${text}&rdquo;</td>
      </tr>
    </table>`;
  }

  function _amber(html) {
    return `<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px">
      <tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 18px;font-family:Arial,sans-serif;font-size:13px;color:#92400E;line-height:1.7">${html}</td></tr>
    </table>`;
  }

  function _cta(label, href, color) {
    return `<table cellpadding="0" cellspacing="0" class="db" style="margin:24px 0">
      <tr>
        <td style="background:${color || T.teal};border-radius:8px;box-shadow:0 6px 20px rgba(13,148,136,0.25)">
          <a href="${href}" style="display:block;padding:15px 32px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:0.3px">${label}</a>
        </td>
        <td width="12">&nbsp;</td>
        <td style="border:2px solid ${T.border};border-radius:8px">
          <a href="tel:02039000000" style="display:block;padding:13px 22px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:${T.slate};text-decoration:none">&#9742;&nbsp;${PHONE}</a>
        </td>
      </tr>
    </table>`;
  }

  // ── TEMPLATES ─────────────────────────────────────────────
  const TEMPLATES = {

    'Introduction': {
      icon: '👋', badge: 'Outreach',
      desc: 'First contact with a new prospect.',
      subject: 'Managed Commercial Cleaning — AskMiro Cleaning Services',
      fields: [
        { id:'name', label:'Contact Name', ph:'e.g. Sarah Collins' },
      ],
      html: (f={}) => _wrap('Client Introduction', T.teal,
        'Discover managed commercial cleaning that actually works',
        _h('Professional Cleaning. Properly Managed.') +
        _sub('AskMiro Cleaning Services — London &amp; UK') +
        _gr(f.name) +
        _p(`We are <strong style="color:${T.charcoal}">AskMiro Cleaning Services</strong> — a managed commercial cleaning company serving offices, warehouses, schools, healthcare facilities, and automotive dealerships across London and the UK.`) +
        _p(`Unlike typical cleaning contractors, we don't just supply staff — we <strong style="color:${T.charcoal}">manage the entire service end-to-end</strong>: consistent teams, supervisor oversight, quality checklists, and a single point of contact for everything.`) +
        _checklist([
          '<strong>Consistent, site-trained teams</strong> — the same people at your site every visit',
          '<strong>Supervisor oversight &amp; written quality inspections</strong> — we check the work so you never have to',
          '<strong>COSHH-compliant processes</strong> — full risk assessments and RAMS documentation as standard',
          '<strong>Eco-conscious products</strong> — dilution control systems and biodegradable chemicals',
          '<strong>Absence cover guaranteed</strong> — replacements arranged, your schedule is never disrupted',
          '<strong>Single point of contact</strong> — reach our team directly, not a call centre',
        ]) +
        _quote(`We don't just supply cleaners — we manage the service. Our clients don't worry about cleaning because we handle everything, every time.`) +
        _p(`We'd love to arrange a <strong style="color:${T.charcoal}">free, no-obligation site visit</strong>. Most proposals are returned within 48 hours with a fixed monthly rate and no hidden costs.`) +
        _cta('&#128197; Book a Free Site Visit', `mailto:${EMAIL}?subject=Site Visit Request`) +
        _div() +
        _sm('AskMiro Cleaning Services is fully insured, COSHH compliant, and covered by public liability insurance.')
      ),
    },

    'Proposal / Quote': {
      icon: '📋', badge: 'Proposal',
      desc: 'Post-site-visit proposal with pricing and inclusions.',
      subject: 'AskMiro — Cleaning Proposal for [Company]',
      fields: [
        { id:'name',   label:'Contact Name',    ph:'e.g. Sarah Collins'          },
        { id:'site',   label:'Company / Site',  ph:'e.g. Acme Ltd, 12 High St'   },
        { id:'amount', label:'Monthly Fee (£)', ph:'e.g. 1200'                   },
        { id:'visits', label:'Visits per Week', ph:'e.g. 5'                      },
        { id:'days',   label:'Days',            ph:'e.g. Mon–Fri'                },
        { id:'hours',  label:'Hours per Visit', ph:'e.g. 3'                      },
        { id:'areas',  label:'Areas Covered',   ph:'e.g. Offices, Kitchen, WCs'  },
      ],
      html: (f={}) => _wrap('Cleaning Proposal', T.tealDark,
        'Your AskMiro cleaning proposal — fixed monthly rate, no hidden costs',
        _h('Your Cleaning Proposal.') +
        _sub('Prepared following our site visit — valid for 30 days') +
        _gr(f.name) +
        _p(`Thank you for your time during our site visit to <strong style="color:${T.charcoal}">${f.site||'your site'}</strong>. We're pleased to present our proposal for managed commercial cleaning services.`) +
        _statBand([
          { label:'Monthly Investment', value: f.amount ? '£'+f.amount : '£TBC', sub:'Fixed — no hidden costs' },
          { label:'Visits per Week',    value: f.visits||'TBC',                  sub: f.days||'To confirm'     },
          { label:'Hours per Visit',    value: f.hours ? f.hours+'hrs':'TBC',    sub:'Dedicated team'          },
        ]) +
        _p(`<strong style="color:${T.charcoal}">What's included in your service:</strong>`) +
        _checklist([
          `<strong>${f.areas||'All agreed areas'}</strong>`,
          'Dedicated cleaning team — inducted and briefed to your site specification',
          'All professional equipment, chemicals and consumables supplied',
          'COSHH risk assessments and full RAMS documentation',
          'Monthly supervisor quality inspection with written report',
          'Absence cover — your schedule is never disrupted',
        ]) +
        _amber(`<strong>&#9200; This proposal is valid for 30 days from the date of this email.</strong><br>
          Reply to confirm and we can have your service live within <strong>5–7 working days</strong>. A signed service agreement follows on acceptance.`) +
        _cta('&#10003; Accept This Proposal', `mailto:${EMAIL}?subject=Accepting Proposal — ${f.site||''}`) +
        _div() +
        _sm(`All prices quoted exclusive of VAT. Payment terms: 30 days from invoice. Contact us to adjust scope or frequency.`)
      ),
    },

    'Follow-up': {
      icon: '🔔', badge: 'Follow-up',
      desc: 'Gentle nudge after sending a proposal.',
      subject: 'Following Up — Your AskMiro Cleaning Proposal',
      fields: [
        { id:'name', label:'Contact Name',   ph:'e.g. Sarah Collins' },
        { id:'site', label:'Company / Site', ph:'e.g. Acme Ltd'      },
      ],
      html: (f={}) => _wrap('Proposal Follow-up', '#D97706',
        'A quick follow-up regarding your AskMiro cleaning proposal',
        _h('Just Checking In.') +
        _sub('Regarding our recent proposal') +
        _gr(f.name) +
        _p(`We hope you're well. We're following up on the proposal we sent for cleaning services at <strong style="color:${T.charcoal}">${f.site||'your site'}</strong>.`) +
        _p(`If the proposal works for you, simply reply and we can get things moving straight away. If you'd like anything adjusted, we're happy to revisit the scope, frequency, or pricing.`) +
        _quote(`Every client has our commitment: if something isn't right, we fix it within 24 hours. That's not a policy — it's simply how we operate.`) +
        _checklist([
          'No long-term lock-in for initial contracts',
          'Service live within 5–7 working days of confirmation',
          'Dedicated account contact — not a call centre',
          'Consistent teams, not rotating agency staff',
        ]) +
        _p(`If the timing isn't right just now — no problem at all. Simply let us know and we'll follow up when it suits.`) +
        _cta('&#9993; Reply to This Email', `mailto:${EMAIL}`, '#D97706') +
        _div() +
        _sm(`To stop further follow-up emails please reply with "Unsubscribe".`)
      ),
    },

    'Welcome Onboard': {
      icon: '🎉', badge: 'Welcome',
      desc: 'New client onboarding with full service details.',
      subject: 'Welcome to AskMiro — Your Service Starts [DATE]',
      fields: [
        { id:'name',      label:'Contact Name',    ph:'e.g. Sarah Collins'      },
        { id:'site',      label:'Site Address',    ph:'e.g. 12 High St, London' },
        { id:'startDate', label:'Start Date',      ph:'e.g. 1 March 2026'       },
        { id:'schedule',  label:'Schedule',        ph:'e.g. Mon–Fri, 6–9am'     },
        { id:'team',      label:'Team Size',       ph:'e.g. 2'                  },
        { id:'amount',    label:'Monthly Fee (£)', ph:'e.g. 1200'               },
      ],
      html: (f={}) => _wrap('Welcome Onboard', '#059669',
        'Welcome to AskMiro — your service details and what to expect',
        _h('Welcome to AskMiro.') +
        _sub("We're delighted to be working with you") +
        _gr(f.name) +
        _p(`On behalf of everyone at AskMiro Cleaning Services — <strong style="color:${T.charcoal}">welcome aboard</strong>. Your service is confirmed and our team is ready to get started.`) +
        _table([
          ['Site Address',  f.site      || '—'],
          ['Service Start', f.startDate || '—'],
          ['Schedule',      f.schedule  || '—'],
          ['Team Size',     f.team ? f.team+' dedicated cleaners' : '—'],
          ['Monthly Fee',   f.amount ? '£'+f.amount+' + VAT' : '—', true, true],
          ['Invoice Day',   'Last working day of each month'],
          ['Contact',       PHONE+' — '+EMAIL],
        ]) +
        _checklist([
          '<strong>Site briefing</strong> — our team visits before the first clean to walk the site',
          '<strong>Schedule confirmation</strong> — your full cleaning schedule sent to you in writing',
          '<strong>Direct contact</strong> — you will have a dedicated contact number for anything urgent',
          '<strong>First invoice</strong> — issued at the end of your first month of service',
        ]) +
        _quote(`We work hard to be the kind of cleaning company you never have to think about. If anything isn't right, contact us and we'll resolve it personally.`) +
        _cta(`&#9742; Call Us — ${PHONE}`, 'tel:02080730621', '#059669') +
        _div() +
        _sm(`Welcome confirmation sent by AskMiro Cleaning Services. Please retain this email for your records.`)
      ),
    },

    'Invoice': {
      icon: '💷', badge: 'Invoice',
      desc: 'Professional invoice with bank transfer details.',
      subject: '[INV-XXX] Invoice — AskMiro Cleaning Services',
      fields: [
        { id:'name',     label:'Contact Name',    ph:'e.g. Sarah Collins'         },
        { id:'invNum',   label:'Invoice Number',  ph:'e.g. INV-001'               },
        { id:'site',     label:'Company / Site',  ph:'e.g. Acme Ltd'              },
        { id:'period',   label:'Service Period',  ph:'e.g. February 2026'         },
        { id:'amount',   label:'Net Amount (£)',  ph:'e.g. 1200  (VAT auto-calc)' },
        { id:'dueDate',  label:'Payment Due',     ph:'e.g. 31 March 2026'         },
      ],
      html: (f={}) => {
        const net   = parseFloat(f.amount||0);
        const vat   = net ? (net*0.2).toFixed(2)   : '—';
        const total = net ? (net*1.2).toFixed(2)   : '—';
        const netFmt= net ? net.toFixed(2)         : '—';
        return _wrap('Invoice', T.navy,
          'Invoice from AskMiro Cleaning Services — payment details enclosed',
          _h(`Invoice ${f.invNum||'[INV-XXX]'}.`) +
          _sub(`${f.period||'[Month Year]'} — ${f.site||'[Site]'}`) +
          _gr(f.name) +
          _p(`Please find below your invoice for commercial cleaning services at <strong style="color:${T.charcoal}">${f.site||'your site'}</strong> for <strong style="color:${T.charcoal}">${f.period||'the service period'}</strong>.`) +
          _table([
            ['Invoice Number', f.invNum  || '—'],
            ['Service Period', f.period  || '—'],
            ['Site',           f.site    || '—'],
            ['Issue Date',     new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})],
            ['Payment Due',    f.dueDate || '—'],
            ['Subtotal',       net ? '£'+netFmt : '—'],
            ['VAT (20%)',      net ? '£'+vat    : '—'],
          ], ['Total Due', net ? '£'+total : '—']) +
          _amber(`<strong>&#127974; Bank Transfer Details</strong><br><br>
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="font-family:Arial,sans-serif;font-size:13px;color:#92400E;padding-right:28px;line-height:2.2">Account Name<br>Sort Code<br>Account Number<br>Reference</td>
              <td style="font-family:Arial,sans-serif;font-size:13px;color:${T.charcoal};font-weight:700;line-height:2.2">Miro Partners Ltd<br>04-06-05<br>26672911<br>${f.invNum||'[INV-XXX]'}</td>
            </tr></table>`) +
          _p(`Payment is due within <strong style="color:${T.charcoal}">30 days</strong>. For any queries please reply or call us on ${PHONE}.`) +
          _div() +
          _sm('Late payments may be subject to statutory interest under the Late Payment of Commercial Debts (Interest) Act 1998.')
        );
      },
    },

    'Contract Renewal': {
      icon: '🔄', badge: 'Renewal',
      desc: 'Renewal notice with current service summary.',
      subject: 'Service Agreement Renewal — AskMiro Cleaning Services',
      fields: [
        { id:'name',      label:'Contact Name',    ph:'e.g. Sarah Collins'  },
        { id:'site',      label:'Company / Site',  ph:'e.g. Acme Ltd'       },
        { id:'renewDate', label:'Renewal Date',    ph:'e.g. 1 April 2026'   },
        { id:'schedule',  label:'Schedule',        ph:'e.g. Mon–Fri, 6–9am' },
        { id:'amount',    label:'Monthly Fee (£)', ph:'e.g. 1200'           },
      ],
      html: (f={}) => _wrap('Service Renewal', '#7C3AED',
        'Your AskMiro service agreement is due for renewal',
        _h('Your Service Agreement Is Up for Renewal.') +
        _sub("We'd love to continue working with you") +
        _gr(f.name) +
        _p(`Your current service agreement for <strong style="color:${T.charcoal}">${f.site||'your site'}</strong> is due for renewal on <strong style="color:${T.charcoal}">${f.renewDate||'[DATE]'}</strong>. We would love to continue working with you.`) +
        _table([
          ['Site',          f.site      || '—'],
          ['Renewal Date',  f.renewDate || '—'],
          ['Schedule',      f.schedule  || '—'],
          ['Monthly Fee',   f.amount ? '£'+f.amount+' + VAT' : '—', true, true],
          ['Contract Term', '12 months from renewal date'],
        ]) +
        _p(`If you're happy to continue on the same terms, simply reply with <em style="color:${T.charcoal}">&ldquo;Confirmed&rdquo;</em> and we will keep everything running without interruption.`) +
        _checklist([
          'No paperwork required — a reply to this email is your confirmation',
          'Same dedicated team, same schedule, same quality standard',
          'Happy to discuss any changes to scope or frequency',
          'Renewed agreement valid for 12 months from renewal date',
        ]) +
        _quote(`It has been a genuine pleasure working with you. We don't take that lightly and will continue working hard to earn your trust.`) +
        _cta('&#10003; Confirm Renewal', `mailto:${EMAIL}?subject=Renewal Confirmed — ${f.site||''}`, '#7C3AED') +
        _div() +
        _sm(`To discuss changes please call us on ${PHONE} or reply to this email.`)
      ),
    },

  };

  // ── RENDER ────────────────────────────────────────────────
  async function render() {
    UI.setLoading(true);
    // Load sent log first (fast — our own sheet)
    try { _emails = await API.get('emails'); } catch(e) { _emails = []; }
    // Draw immediately — don't wait for Gmail inbox
    _tab = 'inbox';
    _draw();
    UI.setLoading(false);
    // Load inbox in background, redraw when ready
    _loadInbox('').then(() => _draw()).catch(() => {});
  }

  function _draw() {
    const names = Object.keys(TEMPLATES);
    const s = _sender();

    const logHTML = _emails.length === 0
      ? `<div style="text-align:center;padding:72px 20px">
          <div style="font-size:3rem;margin-bottom:14px">📭</div>
          <div style="font-weight:700;color:var(--dk);font-size:15px;margin-bottom:6px">No emails sent yet</div>
          <div style="font-size:13px;color:var(--ll)">Switch to Compose to send your first branded email</div>
        </div>`
      : `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>ID</th><th>To</th><th>Subject</th><th>Template</th><th>Sent</th></tr></thead>
          <tbody>${_emails.map(e => `<tr>
            <td class="tmn">${e.id}</td>
            <td style="font-size:12px">${e.to}</td>
            <td class="tfw" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px">${e.subject}</td>
            <td>${UI.pill(e.template || 'Custom', 'pt')}</td>
            <td style="font-size:12px;color:var(--ll)">${e.sentAt}</td>
          </tr>`).join('')}</tbody>
        </table></div>`;

    const composeHTML = `
      <div style="max-width:640px">
        <div style="background:linear-gradient(135deg,${T.navy},${T.navyMid});border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px">
          <div style="width:34px;height:34px;background:${T.teal};border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="20" height="20" viewBox="0 0 40 40" fill="none"><path d="M10 26L15 14L20 26L25 14L30 26" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div>
            <div style="font-weight:700;color:#fff;font-size:13px">${s.name}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:1px">Sending from ${EMAIL}</div>
          </div>
        </div>
        <div class="fg"><label class="fl">To (Email) <span class="req">*</span></label>
          <input class="fin" id="em-to" type="email" placeholder="client@company.com">
        </div>
        <div class="fg"><label class="fl">Subject <span class="req">*</span></label>
          <input class="fin" id="em-subj" placeholder="Subject line">
        </div>
        <div class="fg"><label class="fl">Template <span class="req">*</span></label>
          <select class="fse" id="em-tmpl" onchange="Email._pickTmpl(this.value)">
            <option value="">— Select a branded template —</option>
            ${names.map(n => `<option value="${n}">${TEMPLATES[n].icon}  ${n}</option>`).join('')}
          </select>
        </div>
        <div id="em-fields" style="display:none;background:var(--of);border:1px solid var(--bd);border-radius:10px;padding:16px 18px;margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--ll);margin-bottom:12px">&#9998; Template Details — fill in to personalise</div>
          <div id="em-fields-inner"></div>
        </div>
        <div id="em-prev-wrap" style="display:none;margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--ll);margin-bottom:6px">Live Preview</div>
          <iframe id="em-prev" style="width:100%;height:500px;border:1px solid var(--bd);border-radius:10px;background:#fff" sandbox="allow-same-origin"></iframe>
        </div>
        <button class="btn bp" style="width:100%;justify-content:center;font-size:14px;padding:14px" id="em-send-btn" onclick="Email._send()">&#9993;&nbsp; Send Branded Email</button>
        <p style="font-size:11px;color:var(--ll);margin-top:8px;text-align:center">Sending as <strong>${s.name}</strong> from ${EMAIL} via Gmail Workspace</p>
      </div>`;

    const galHTML = `
      <div class="g2">
        ${names.map(n => { const t = TEMPLATES[n]; return `<div class="card">
          <div class="card-hd" style="align-items:flex-start;gap:10px">
            <div style="font-size:26px;line-height:1">${t.icon}</div>
            <div style="flex:1">
              <div class="card-title" style="font-size:14px">${n}</div>
              <div style="font-size:12px;color:var(--ll);margin-top:3px;line-height:1.5">${t.desc}</div>
            </div>
          </div>
          <div class="card-body" style="padding-top:8px">
            <div style="font-size:11px;color:var(--ll);margin-bottom:10px;font-family:monospace;background:var(--of);padding:6px 10px;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.subject}</div>
            <div style="display:flex;gap:8px">
              <button class="btn bp" style="font-size:12px;padding:6px 14px" onclick="Email._useTmpl('${n}')">Use Template →</button>
              <button class="btn bo" style="font-size:12px;padding:6px 14px" onclick="Email._prevModal('${n}')">Preview</button>
            </div>
          </div>
        </div>`; }).join('')}
      </div>
      <div id="em-modal-bg" style="display:none;position:fixed;inset:0;background:rgba(12,25,41,.75);backdrop-filter:blur(5px);z-index:400;align-items:center;justify-content:center;padding:20px">
        <div style="background:#fff;border-radius:16px;width:100%;max-width:700px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 40px 100px rgba(0,0,0,.5)">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid var(--bd)">
            <span id="em-modal-ttl" style="font-weight:700;font-size:14px;color:var(--dk)">Preview</span>
            <button class="xbtn" onclick="document.getElementById('em-modal-bg').style.display='none'">&#x2715;</button>
          </div>
          <iframe id="em-modal-frame" style="flex:1;border:none;border-radius:0 0 16px 16px;min-height:560px" sandbox="allow-same-origin"></iframe>
        </div>
      </div>`;

    const tabs = [['inbox','Inbox'],['log', 'Sent'], ['compose', 'Compose'], ['templates', 'Templates']];
    document.getElementById('main-content').innerHTML = `
${UI.secHd('EMAIL', 'Email Centre', _inbox.filter(t=>t.unread).length + ' unread')}
<div class="el-layout">
  <div class="el-sidebar">
    <button class="btn bp" style="width:100%;justify-content:center;margin-bottom:12px" onclick="Email._switchTab('compose')">+ Compose</button>
    ${tabs.map(([k, lbl]) => {
      let badge = '';
      if (k === 'inbox') {
        const u = _inbox.filter(t=>t.unread).length;
        badge = u > 0 ? `<span style="margin-left:auto;background:${T.teal};color:white;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700">${u}</span>` : '';
      } else if (k === 'log') {
        badge = `<span style="margin-left:auto;font-size:11px;color:var(--ll)">${_emails.length}</span>`;
      }
      return `<div class="el-tab ${_tab === k ? 'active' : ''}" onclick="Email._switchTab('${k}')">${lbl}${badge}</div>`;
    }).join('')}
    <div style="flex:1"></div>
    <div style="padding:10px 4px;font-size:11px;color:var(--ll);line-height:1.7;border-top:1px solid var(--bd);margin-top:8px">
      Sending as<br>
      <strong style="color:var(--sl);font-size:12px">${s.name}</strong><br>
      <span style="font-size:10.5px">${s.email}</span>
    </div>
  </div>
  <div class="el-body" id="el-body">
    ${_tab === 'inbox' ? _inboxHTML() : _tab === 'log' ? logHTML : _tab === 'compose' ? composeHTML : galHTML}
  </div>
</div>`;
  }

  // ── ACTIONS ───────────────────────────────────────────────
  function _switchTab(t) {
    _tab = t;
    if (t === 'inbox' && _inbox.length === 0) {
      _loadInbox('').then(() => _draw());
    } else {
      _draw();
    }
  }

  function _pickTmpl(name) {
    _activeTmpl = name;
    const subjEl  = document.getElementById('em-subj');
    const wrap    = document.getElementById('em-prev-wrap');
    const fWrap   = document.getElementById('em-fields');
    const fInner  = document.getElementById('em-fields-inner');
    if (!name) {
      if (wrap)  wrap.style.display  = 'none';
      if (fWrap) fWrap.style.display = 'none';
      return;
    }
    const t = TEMPLATES[name]; if (!t) return;
    if (subjEl && !subjEl.value) subjEl.value = t.subject;
    // Render input fields for this template
    if (fInner && t.fields) {
      fInner.innerHTML = t.fields.map(field => `
        <div class="fg" style="margin-bottom:10px">
          <label class="fl" style="font-size:12px">${field.label}</label>
          <input class="fin" id="emf-${field.id}" placeholder="${field.ph}" oninput="Email._livePreview()" style="font-size:13px">
        </div>`).join('');
    }
    if (fWrap) fWrap.style.display = t.fields && t.fields.length ? 'block' : 'none';
    if (wrap)  wrap.style.display  = 'block';
    _livePreview();
  }

  function _livePreview() {
    const tmpl = _activeTmpl || ((document.getElementById('em-tmpl')||{}).value||'');
    if (!tmpl || !TEMPLATES[tmpl]) return;
    const frame = document.getElementById('em-prev');
    if (frame) frame.srcdoc = TEMPLATES[tmpl].html(_collectFields(tmpl));
  }

  function _collectFields(tmpl) {
    const t = TEMPLATES[tmpl]; if (!t || !t.fields) return {};
    const f = {};
    t.fields.forEach(field => {
      const el = document.getElementById('emf-'+field.id);
      if (el) f[field.id] = el.value.trim();
    });
    return f;
  }

  function _useTmpl(name) {
    _tab = 'compose'; _draw();
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
      ttl.textContent = `${t.icon} ${name} — Preview`;
      frame.srcdoc = t.html({});
      bg.style.display = 'flex';
    }
  }

  async function _send() {
    const to      = (document.getElementById('em-to')||{}).value||'';
    const subject = (document.getElementById('em-subj')||{}).value||'';
    const tmpl    = _activeTmpl || (document.getElementById('em-tmpl')||{}).value||'';
    if (!to)      { UI.toast('Please enter recipient email', 'r'); return; }
    if (!subject) { UI.toast('Please enter a subject', 'r'); return; }

    // Build HTML on frontend, then send via chunked approach
    // to avoid URL length limits in JSONP
    const fields   = tmpl ? _collectFields(tmpl) : {};
    const htmlBody = tmpl && TEMPLATES[tmpl] ? TEMPLATES[tmpl].html(fields) : '';

    const btn = document.getElementById('em-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
      // Encode HTML as base64 to keep it clean in URL params
      const encoded = btoa(unescape(encodeURIComponent(htmlBody)));
      await API.post('email.send', {
        to, subject, template: tmpl || 'Custom',
        htmlBase64: encoded,
        recipientName: fields.name || ''
      });
      _emails.unshift({ id: 'EM-'+Date.now(), to, subject, template: tmpl||'Custom', sentAt: new Date().toLocaleString('en-GB') });
      UI.toast('✓ Email sent to ' + to, 'g');
      _tab = 'log'; _activeTmpl = ''; _draw();
    } catch(e) {
      UI.toast('Send failed: ' + e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = '✉  Send Branded Email'; }
    }
  }


  // ═══════════════════════════════════════════════════════
  // INBOX STATE
  // ═══════════════════════════════════════════════════════

  // ── LOAD INBOX ────────────────────────────────────────
  async function _loadInbox(search = '') {
    _inboxSearch = search;
    try {
      const result = await API.get('inbox', { count: 30, search: search || '' });
      // Apps Script may return {error:...} or an array
      if (Array.isArray(result)) {
        _inbox = result;
      } else if (result && result.error) {
        _inbox = [];
        console.warn('Inbox error:', result.error);
      } else {
        _inbox = [];
      }
    } catch(e) {
      _inbox = [];
      console.warn('Inbox load failed:', e.message);
    }
  }

  // ── INBOX HTML ────────────────────────────────────────
  function _inboxHTML() {
    const unread = _inbox.filter(t => t.unread).length;
    const searchBar = `
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input class="fin" id="inbox-search" placeholder="Search inbox…" value="${_inboxSearch}"
          style="flex:1;font-size:13px"
          onkeydown="if(event.key==='Enter')Email._searchInbox()">
        <button class="btn bo" style="font-size:12px;padding:7px 14px" onclick="Email._searchInbox()">Search</button>
        <button class="btn bo" style="font-size:12px;padding:7px 14px" onclick="Email._refreshInbox()">&#8635; Refresh</button>
      </div>`;

    if (_thread) return _threadHTML();

    if (_inbox.length === 0) return searchBar + `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:2.5rem;margin-bottom:14px">📬</div>
        <div style="font-weight:700;color:var(--dk);font-size:15px;margin-bottom:6px">Loading inbox…</div>
        <div style="font-size:13px;color:var(--ll);margin-bottom:16px">Fetching emails from info@askmiro.com</div>
        <button class="btn bo" style="font-size:12px;padding:7px 16px" onclick="Email._refreshInbox()">&#8635; Retry</button>
      </div>`;

    const rows = _inbox.map(t => {
      const date = new Date(t.date);
      const isToday = date.toDateString() === new Date().toDateString();
      const dateStr = isToday
        ? date.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
        : date.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
      const fromName = t.from.replace(/<.*>/, '').trim().replace(/"/g,'') || t.from;
      return `
        <div onclick="Email._openThread('${t.id}')"
          style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--bd);cursor:pointer;background:${t.unread ? '#F0FDF9' : 'transparent'};transition:background .15s"
          onmouseover="this.style.background='var(--of)'" onmouseout="this.style.background='${t.unread ? '#F0FDF9' : 'transparent'}'">
          <!-- Avatar -->
          <div style="width:38px;height:38px;background:${t.unread ? T.teal : '#CBD5E1'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:white;flex-shrink:0">
            ${fromName.charAt(0).toUpperCase()}
          </div>
          <!-- Content -->
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:13px;font-weight:${t.unread?700:500};color:var(--dk);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px">${fromName}</span>
              <span style="font-size:11px;color:var(--ll);flex-shrink:0;margin-left:8px">${dateStr}</span>
            </div>
            <div style="font-size:13px;font-weight:${t.unread?600:400};color:${t.unread?T.charcoal:'var(--sl)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px">${t.subject}</div>
            <div style="font-size:12px;color:var(--ll);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.snippet}</div>
          </div>
          ${t.count > 1 ? `<div style="font-size:11px;color:var(--ll);background:var(--bd);border-radius:10px;padding:2px 7px;flex-shrink:0">${t.count}</div>` : ''}
          ${t.unread ? `<div style="width:8px;height:8px;background:${T.teal};border-radius:50%;flex-shrink:0"></div>` : ''}
        </div>`;
    }).join('');

    return searchBar +
      `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:12px;color:var(--ll)">${_inbox.length} conversations${unread ? ` &nbsp;&bull;&nbsp; <strong style="color:${T.teal}">${unread} unread</strong>` : ''}</div>
      </div>
      <div style="border:1px solid var(--bd);border-radius:10px;overflow:hidden">${rows}</div>`;
  }

  // ── THREAD VIEW ───────────────────────────────────────
  function _threadHTML() {
    if (!_thread) return '';
    const msgs = _thread.messages || [];
    const messagesHTML = msgs.map((m, i) => {
      const date = new Date(m.date).toLocaleString('en-GB', {
        day:'2-digit', month:'short', year:'numeric',
        hour:'2-digit', minute:'2-digit'
      });
      const fromName = m.from.replace(/<.*>/, '').trim().replace(/"/g,'') || m.from;
      const isLast = i === msgs.length - 1;
      return `
        <div style="margin-bottom:12px;border:1px solid var(--bd);border-radius:10px;overflow:hidden${isLast?`;box-shadow:0 2px 8px rgba(0,0,0,0.06)`:''}">
          <!-- Message header -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--of);border-bottom:1px solid var(--bd)">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:32px;height:32px;background:${T.teal};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white">
                ${fromName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--dk)">${fromName}</div>
                <div style="font-size:11px;color:var(--ll)">${m.from}</div>
              </div>
            </div>
            <div style="font-size:11px;color:var(--ll)">${date}</div>
          </div>
          <!-- Message body -->
          <div style="padding:16px;max-height:320px;overflow-y:auto">
            <iframe srcdoc="${m.body.replace(/"/g,'&quot;').replace(/'/g,'&#39;')}"
              style="width:100%;border:none;min-height:200px" sandbox="allow-same-origin"
              onload="this.style.height=this.contentDocument.body.scrollHeight+32+'px'"></iframe>
          </div>
        </div>`;
    }).join('');

    const lastFrom = msgs.length ? msgs[msgs.length-1].from : '';
    const replyTo  = lastFrom.match(/<(.+)>/) ? lastFrom.match(/<(.+)>/)[1] : lastFrom;

    return `
      <!-- Back button -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <button class="btn bo" style="font-size:12px;padding:6px 14px" onclick="Email._closeThread()">← Back to Inbox</button>
        <div style="font-size:15px;font-weight:700;color:var(--dk);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_thread.subject}</div>
      </div>
      <!-- Messages -->
      ${messagesHTML}
      <!-- Quick reply -->
      <div style="border:1px solid ${T.teal};border-radius:10px;padding:16px;margin-top:8px;background:#F0FDF9">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${T.teal};margin-bottom:10px">&#8617; Quick Reply</div>
        <textarea id="thread-reply" class="fta" rows="3" placeholder="Type your reply…" style="font-size:13px;margin-bottom:10px"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn bp" style="font-size:12px;padding:7px 16px" onclick="Email._sendReply('${replyTo}','${_thread.subject.replace(/'/g,"\\'")}')">Send Reply</button>
          <button class="btn bo" style="font-size:12px;padding:7px 16px" onclick="Email._replyCompose('${replyTo}','${_thread.subject.replace(/'/g,"\\'")}')">Full Compose</button>
        </div>
      </div>`;
  }

  // ── INBOX ACTIONS ─────────────────────────────────────
  async function _refreshInbox() {
    const bodyEl = document.getElementById('el-body');
    if (bodyEl) bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ll)"><div class="spinner" style="margin:0 auto 12px"></div>Loading inbox…</div>';
    await _loadInbox(_inboxSearch);
    _thread = null;
    _tab = 'inbox';
    _draw();
  }

  function _searchInbox() {
    const q = (document.getElementById('inbox-search')||{}).value || '';
    _loadInbox(q).then(() => { _thread = null; _draw(); });
  }

  async function _openThread(id) {
    const bodyEl = document.getElementById('el-body');
    if (bodyEl) bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ll)"><div class="spinner" style="margin:0 auto 12px"></div>Loading…</div>';
    try {
      _thread = await API.get('email.thread', { id });
    } catch(e) {
      UI.toast('Could not load thread: ' + e.message, 'r');
      _thread = null;
    }
    _draw();
  }

  function _closeThread() { _thread = null; _draw(); }

  async function _sendReply(to, subject) {
    const body = (document.getElementById('thread-reply')||{}).value || '';
    if (!body.trim()) { UI.toast('Please type a reply first', 'r'); return; }
    const reSubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
    try {
      await API.post('email.send', { to, subject: reSubject, notes: body, htmlBody: '', template: 'Reply' });
      UI.toast('Reply sent', 'g');
      _closeThread();
    } catch(e) {
      UI.toast('Send failed: ' + e.message, 'r');
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


  return { render, _switchTab, _pickTmpl, _livePreview, _useTmpl, _prevModal, _send, _searchInbox, _openThread, _closeThread, _sendReply, _replyCompose, _refreshInbox };

})();
