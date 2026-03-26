// ============================================================
// AskMiro Ops — Admin & Settings Module  v2.0
// Tabs: Settings | Users | Documents
// ============================================================
window.Admin = (() => {

  let S = { tab: 'settings', settings: {} };

  // ── RENDER ────────────────────────────────────────────────────
  async function render() {
    try { S.settings = await API.get('settings'); } catch(e) { S.settings = {}; }
    const app = document.getElementById('main-content');
    app.innerHTML = `
${UI.secHd('Admin & Settings','System configuration, users and company documents')}
<div style="display:flex;gap:4px;margin-bottom:20px">
  ${['settings','users','documents'].map(t =>
    `<button id="adm-${t}" class="btn bo btn-xs" onclick="Admin._tab('${t}')"
      style="text-transform:capitalize">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`
  ).join('')}
</div>
<div id="adm-body"></div>`;
    _hl(S.tab);
    _renderTab();
  }

  function _tab(name) { S.tab = name; _hl(name); _renderTab(); }
  function _hl(name) {
    ['settings','users','documents'].forEach(t => {
      const b = document.getElementById('adm-'+t);
      if (!b) return;
      b.style.cssText = t === name
        ? 'background:var(--brand);color:#fff;border-color:var(--brand);text-transform:capitalize'
        : 'text-transform:capitalize';
    });
  }
  function _renderTab() {
    const el = document.getElementById('adm-body');
    if (!el) return;
    if      (S.tab === 'settings')  el.innerHTML = _settingsTab();
    else if (S.tab === 'users')     el.innerHTML = _usersTab();
    else if (S.tab === 'documents') el.innerHTML = _documentsTab();
  }

  // ── SETTINGS TAB ──────────────────────────────────────────────
  function _settingsTab() {
    const st = S.settings;
    return `
<div class="g2">
  <div class="card">
    <div class="card-hd"><div class="card-title">System Settings</div></div>
    <div class="card-body" style="padding-top:14px">
      <div class="fg"><label class="fl">Company Name</label>
        <input class="fin" id="s-co" value="${_esc(st.companyName||'AskMiro Cleaning Services')}"></div>
      <div class="fg"><label class="fl">Outbound Email</label>
        <input class="fin" id="s-em" value="${_esc(st.emailFrom||'info@askmiro.com')}"></div>
      <div class="fg"><label class="fl">Phone</label>
        <input class="fin" id="s-ph" value="${_esc(st.phone||'')}"></div>
      <div class="fg"><label class="fl">Website</label>
        <input class="fin" id="s-web" value="${_esc(st.website||'www.askmiro.com')}"></div>
      <div class="fg"><label class="fl">Min Margin % (quote floor)</label>
        <input class="fin" id="s-mg" type="number" value="${st.minMarginPct||20}"></div>
      <div class="fg"><label class="fl">LLW Rate (£/hr)</label>
        <input class="fin" id="s-lw" type="number" step="0.01" value="${st.llwRate||13.85}"></div>
      <div class="fg"><label class="fl">On-costs % (NI + holiday)</label>
        <input class="fin" id="s-oc" type="number" value="${st.oncostsPct||36}"></div>
      <button class="btn bp" onclick="Admin.saveSettings()">Save Settings</button>
    </div>
  </div>
  <div class="card">
    <div class="card-hd"><div class="card-title">Backend Connection</div></div>
    <div class="card-body">
      <div class="alert alert-${CFG.API_BASE.includes('YOUR_SCRIPT_ID')?'r':'g'}">
        ${CFG.API_BASE.includes('YOUR_SCRIPT_ID')
          ? '&#10007; API not configured. Update API_BASE in config.js'
          : '&#10003; Connected to Google Apps Script backend'}
      </div>
      <p style="font-size:12px;color:var(--ll);margin-top:8px">
        API: <code style="font-family:monospace;font-size:11px">${CFG.API_BASE}</code>
      </p>
    </div>
  </div>
</div>`;
  }

  async function saveSettings() {
    try {
      await API.post('settings', {
        companyName: UI.gv('s-co'), emailFrom: UI.gv('s-em'),
        phone: UI.gv('s-ph'), website: UI.gv('s-web'),
        minMarginPct: UI.gv('s-mg'), llwRate: UI.gv('s-lw'), oncostsPct: UI.gv('s-oc')
      });
      UI.toast('Settings saved ✓', 'g');
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  // ── USERS TAB ─────────────────────────────────────────────────
  function _usersTab() {
    return `
<div class="card">
  <div class="card-hd">
    <div class="card-title">Users</div>
    <button class="btn bp btn-sm" onclick="Admin.openNewUser()">+ New User</button>
  </div>
  <div class="card-body" style="padding-top:12px">
    <div class="alert alert-a">Users are managed via the Users tab in Google Sheets. Add users there and provide them their token.</div>
    <p style="font-size:13px;color:var(--sl);margin-top:12px">
      Roles: <strong>Owner</strong>, <strong>OpsManager</strong>, <strong>Supervisor</strong>, <strong>Cleaner</strong>, <strong>Finance</strong>
    </p>
  </div>
</div>`;
  }

  function openNewUser() {
    UI.openModal(`
<div class="modal-hd"><h2>New User</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Name <span class="req">*</span></label><input class="fin" id="u-nm"></div>
    <div class="fg"><label class="fl">Email <span class="req">*</span></label><input class="fin" id="u-em" type="email"></div>
  </div>
  <div class="fg"><label class="fl">Role <span class="req">*</span></label>
    <select class="fin" id="u-rl">
      <option>OpsManager</option><option>Supervisor</option>
      <option>Cleaner</option><option>Finance</option><option>Owner</option>
    </select>
  </div>
  <div class="fg"><label class="fl">Allowed Sites (comma-separated IDs, or "all")</label>
    <input class="fin" id="u-si" value="all"></div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Admin.saveUser()">Create User</button>
  </div>
</div>`);
  }

  async function saveUser() {
    if (!UI.rq('u-nm') || !UI.rq('u-em')) return;
    try {
      const res = await API.post('user', {
        name: UI.gv('u-nm'), email: UI.gv('u-em'),
        role: UI.gv('u-rl'), allowedSites: UI.gv('u-si')
      });
      UI.closeModal();
      if (res.token) UI.openModal(`
<div class="modal-hd"><h2>User Created</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="alert alert-g">&#10003; User created. Share this token securely — it will not be shown again.</div>
  <div class="fg"><label class="fl">Access Token</label>
    <input class="fin" value="${res.token}" readonly onclick="this.select()">
  </div>
  <div class="modal-foot"><button class="btn bp" onclick="UI.closeModal()">Done</button></div>
</div>`);
      else UI.toast('User updated', 'g');
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  // ── DOCUMENTS TAB ─────────────────────────────────────────────
  function _documentsTab() {
    const docs = [
      {
        icon: '&#127970;',
        title: 'Company Profile',
        desc: 'Premium capability statement. For developers, contractors and commercial managers.',
        tag: 'Client-facing',
        tagCls: 'pg',
        action: 'Admin.printCompanyProfile()'
      },
      {
        icon: '&#128203;',
        title: 'Quote Template',
        desc: 'Branded quote document. Generated from the Quote Builder module.',
        tag: 'Via Quotes',
        tagCls: 'pt',
        action: "Router.navigate('quotes')"
      },
      {
        icon: '&#128196;',
        title: 'Invoice Template',
        desc: 'Branded invoice. Generated from the Finance module.',
        tag: 'Via Finance',
        tagCls: 'pt',
        action: "Router.navigate('finance')"
      },
      {
        icon: '&#128100;',
        title: 'Payslip',
        desc: 'ADP-style payslip with earnings, deductions and NI. Generated from Payroll.',
        tag: 'Via Payroll',
        tagCls: 'pt',
        action: "Router.navigate('payroll')"
      }
    ];

    return `
<div style="margin-bottom:16px;padding:14px 16px;background:#f8fafc;border:1px solid var(--brd);border-radius:8px;font-size:13px;color:var(--ll)">
  <strong style="color:var(--txt)">Company Documents</strong> — branded, print-ready documents for clients, partners and staff.
  All documents export directly to PDF via your browser's print function.
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
  ${docs.map(d => `
  <div class="card" style="cursor:pointer;transition:box-shadow .15s" onmouseenter="this.style.boxShadow='0 4px 20px rgba(13,148,136,.12)'" onmouseleave="this.style.boxShadow=''">
    <div class="card-body" style="padding:20px">
      <div style="font-size:28px;margin-bottom:12px;line-height:1">${d.icon}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="font-size:14px;font-weight:700;color:var(--txt)">${d.title}</div>
        <span class="pl ${d.tagCls}" style="font-size:10px">${d.tag}</span>
      </div>
      <div style="font-size:12px;color:var(--ll);line-height:1.55;margin-bottom:16px">${d.desc}</div>
      <button class="btn bp btn-xs" onclick="${d.action}">Open Document</button>
    </div>
  </div>`).join('')}
</div>`;
  }

  // ── COMPANY PROFILE PRINT ─────────────────────────────────────
  function printCompanyProfile() {
    const existing = document.getElementById('cp-overlay');
    if (existing) existing.remove();

    if (!document.getElementById('cp-styles')) {
      const s = document.createElement('style');
      s.id = 'cp-styles';
      s.textContent = `
        #cp-overlay{display:none;position:fixed;inset:0;background:#e8ecf0;z-index:99999;overflow-y:auto;padding:32px 0 64px;font-family:'DM Sans',Arial,sans-serif}
        #cp-overlay *{box-sizing:border-box;margin:0;padding:0}
        .cp-doc{max-width:794px;margin:0 auto}
        .cp-page{background:#fff;margin-bottom:4px;position:relative;overflow:hidden}

        /* Cover */
        .cp-cover{background:#0D1C2E;min-height:600px;display:flex;flex-direction:column;padding:0}
        .cp-cover-accent{height:4px;background:#0D9488;width:100%}
        .cp-cover-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:72px 60px 48px;text-align:center}
        .cp-cover-logo{width:64px;height:64px;background:rgba(13,148,136,.15);border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:28px}
        .cp-cover-title{font-family:'Outfit',Arial,sans-serif;font-size:38px;font-weight:800;color:#fff;letter-spacing:-.03em;line-height:1.1;margin-bottom:8px}
        .cp-cover-legal{font-size:13px;color:rgba(255,255,255,.45);letter-spacing:.04em;text-transform:uppercase;font-weight:600;margin-bottom:32px}
        .cp-cover-divider{width:40px;height:2px;background:#0D9488;margin:0 auto 28px}
        .cp-cover-tagline{font-size:18px;font-weight:400;color:rgba(255,255,255,.75);letter-spacing:.08em;text-transform:uppercase}
        .cp-cover-footer{border-top:1px solid rgba(255,255,255,.08);padding:20px 60px;display:flex;justify-content:space-between;align-items:center}
        .cp-cover-footer-item{font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.04em;text-transform:uppercase}
        .cp-cover-footer-item strong{color:rgba(255,255,255,.6);display:block;font-size:12px;margin-bottom:2px}

        /* Inner pages */
        .cp-inner{padding:52px 60px}
        .cp-section-num{font-size:11px;font-weight:700;color:#0D9488;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px}
        .cp-section-title{font-family:'Outfit',Arial,sans-serif;font-size:24px;font-weight:800;color:#0D1C2E;letter-spacing:-.02em;padding-bottom:14px;border-bottom:2px solid #0D1C2E;margin-bottom:28px}
        .cp-body{font-size:13px;color:#374151;line-height:1.75}
        .cp-body p{margin-bottom:14px}
        .cp-body p:last-child{margin-bottom:0}
        .cp-lead{font-size:15px;color:#0D1C2E;font-weight:600;line-height:1.65;margin-bottom:20px}

        /* Service cards */
        .cp-service-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;border-radius:2px;overflow:hidden;margin-bottom:24px}
        .cp-service-item{background:#fff;padding:20px 22px}
        .cp-service-num{font-size:11px;font-weight:700;color:#0D9488;letter-spacing:.1em;margin-bottom:8px}
        .cp-service-name{font-size:14px;font-weight:700;color:#0D1C2E;margin-bottom:6px}
        .cp-service-desc{font-size:12px;color:#6b7280;line-height:1.6}

        /* Sector pills */
        .cp-sectors{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}
        .cp-sector{padding:8px 18px;border:1.5px solid #0D1C2E;border-radius:2px;font-size:12px;font-weight:700;color:#0D1C2E;letter-spacing:.04em;text-transform:uppercase}

        /* Approach list */
        .cp-approach-list{display:flex;flex-direction:column;gap:18px;margin-top:8px}
        .cp-approach-item{display:flex;gap:20px;align-items:flex-start;padding-bottom:18px;border-bottom:1px solid #f3f4f6}
        .cp-approach-item:last-child{border-bottom:none;padding-bottom:0}
        .cp-approach-num{width:32px;height:32px;flex-shrink:0;background:#0D1C2E;border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;font-family:monospace}
        .cp-approach-title{font-size:13px;font-weight:700;color:#0D1C2E;margin-bottom:4px}
        .cp-approach-body{font-size:12px;color:#6b7280;line-height:1.65}

        /* Compliance grid */
        .cp-compliance-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
        .cp-compliance-item{padding:16px 18px;background:#f8fafc;border-left:3px solid #0D9488}
        .cp-compliance-title{font-size:12px;font-weight:700;color:#0D1C2E;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
        .cp-compliance-body{font-size:12px;color:#6b7280;line-height:1.6}

        /* Insurance */
        .cp-insurance-row{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;margin-top:8px;overflow:hidden}
        .cp-insurance-cell{background:#fff;padding:24px 26px}
        .cp-insurance-label{font-size:11px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
        .cp-insurance-value{font-size:26px;font-weight:800;color:#0D1C2E;font-family:'Outfit',monospace;letter-spacing:-.02em;margin-bottom:4px}
        .cp-insurance-note{font-size:11px;color:#9ca3af}

        /* Why list */
        .cp-why-list{display:flex;flex-direction:column;gap:0}
        .cp-why-item{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid #f3f4f6}
        .cp-why-item:last-child{border-bottom:none}
        .cp-why-dot{width:6px;height:6px;border-radius:50%;background:#0D9488;flex-shrink:0;margin-top:5px}
        .cp-why-text{font-size:13px;color:#1f2937;line-height:1.6}
        .cp-why-text strong{color:#0D1C2E;font-weight:700}

        /* Contact page */
        .cp-contact{background:#0D1C2E;padding:52px 60px}
        .cp-contact-title{font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:4px}
        .cp-contact-sub{font-size:13px;color:rgba(255,255,255,.4);margin-bottom:36px;letter-spacing:.04em}
        .cp-contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:40px}
        .cp-contact-item{}
        .cp-contact-label{font-size:10px;font-weight:700;color:#0D9488;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}
        .cp-contact-value{font-size:14px;color:#fff;font-weight:600}
        .cp-contact-value.mono{font-family:monospace;font-size:13px}
        .cp-contact-legal{border-top:1px solid rgba(255,255,255,.08);padding-top:24px;font-size:11px;color:rgba(255,255,255,.3);line-height:1.8}

        /* Page header (inner pages) */
        .cp-page-header{display:flex;justify-content:space-between;align-items:center;padding:14px 60px;border-bottom:1px solid #f3f4f6;background:#fff}
        .cp-page-header-brand{font-size:11px;font-weight:700;color:#0D9488;letter-spacing:.06em;text-transform:uppercase}
        .cp-page-header-rule{flex:1;height:1px;background:#f3f4f6;margin:0 16px}

        /* Print */
        @media print{
          body>*:not(#cp-overlay){display:none!important}
          #cp-overlay{display:block!important;position:static!important;padding:0;background:#fff}
          #cp-overlay .no-print{display:none!important}
          .cp-doc{max-width:100%}
          .cp-page{page-break-before:always;margin-bottom:0}
          .cp-cover{page-break-before:auto}
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        }`;
      document.head.appendChild(s);
    }

    const overlay = document.createElement('div');
    overlay.id = 'cp-overlay';
    overlay.innerHTML = `

<!-- ── PRINT BAR ─────────────────────────────────────────── -->
<div class="no-print" style="max-width:794px;margin:0 auto 16px;display:flex;align-items:center;justify-content:space-between;padding:0 4px">
  <div style="font-size:13px;font-weight:700;color:#1e293b">Company Profile — AskMiro Cleaning Services</div>
  <div style="display:flex;gap:8px">
    <button onclick="window.print()" style="background:#0D9488;color:#fff;border:none;padding:9px 22px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">
      Save as PDF
    </button>
    <button onclick="document.getElementById('cp-overlay').remove()" style="background:#f1f5f9;color:#475569;border:none;padding:9px 16px;border-radius:6px;font-size:13px;cursor:pointer">
      &#x2715; Close
    </button>
  </div>
</div>

<div class="cp-doc">

<!-- ══════════════════════════════════════════════════════════
     COVER PAGE
══════════════════════════════════════════════════════════ -->
<div class="cp-page cp-cover">
  <div class="cp-cover-accent"></div>
  <div class="cp-cover-body">
    <div class="cp-cover-logo">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M8 20L12 12L16 20L20 12L24 20" stroke="#0D9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="cp-cover-title">AskMiro<br>Cleaning Services</div>
    <div class="cp-cover-legal">Trading as Miro Partners Ltd &nbsp;·&nbsp; Est. 2025</div>
    <div class="cp-cover-divider"></div>
    <div class="cp-cover-tagline">Your Space. Our Responsibility.</div>
  </div>
  <div class="cp-cover-footer">
    <div class="cp-cover-footer-item">
      <strong>Registered Address</strong>
      34 Haldane Place, London, SW18 4UH
    </div>
    <div class="cp-cover-footer-item" style="text-align:center">
      <strong>Company No.</strong>
      Miro Partners Ltd
    </div>
    <div class="cp-cover-footer-item" style="text-align:right">
      <strong>Website</strong>
      www.askmiro.com
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════
     01 — ABOUT
══════════════════════════════════════════════════════════ -->
<div class="cp-page">
  <div class="cp-page-header">
    <div class="cp-page-header-brand">AskMiro Cleaning Services</div>
    <div class="cp-page-header-rule"></div>
    <div style="font-size:11px;color:#9ca3af">Company Profile</div>
  </div>
  <div class="cp-inner">
    <div class="cp-section-num">01</div>
    <div class="cp-section-title">About AskMiro</div>
    <div class="cp-lead">
      AskMiro Cleaning Services is a London-based commercial cleaning contractor delivering
      precision-led services across construction, commercial and managed property environments.
    </div>
    <div class="cp-body">
      <p>Operated under Miro Partners Ltd and director-led from inception, we combine operational
      rigour with responsive on-site management to meet the demands of high-value projects and long-term
      maintenance contracts. Every engagement is managed directly — with structured communication,
      documented processes, and accountability at every stage.</p>
      <p>Our work spans all stages of construction cleaning, from first fix through to sparkle clean and
      handover, as well as ongoing commercial maintenance contracts across London. We understand site
      protocols, contractor supply chains, and the standards expected at practical completion.</p>
      <p>AskMiro operates with the systems, compliance documentation and professional infrastructure of a
      contractor built for scale — not a start-up finding its feet. Our clients can expect consistent
      output, direct communication and zero surprises.</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;border-radius:2px;overflow:hidden;margin-top:36px">
      ${[
        ['Incorporated','14 March 2025'],
        ['Registered','Miro Partners Ltd'],
        ['SIC Codes','81100 · 81210'],
        ['Location','London, England'],
        ['Structure','Private Limited Company'],
        ['Operations','Director-Led']
      ].map(([label,val]) => `
      <div style="background:#fff;padding:18px 20px">
        <div style="font-size:10px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${label}</div>
        <div style="font-size:13px;font-weight:700;color:#0D1C2E">${val}</div>
      </div>`).join('')}
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════
     02 — CORE SERVICES
══════════════════════════════════════════════════════════ -->
<div class="cp-page">
  <div class="cp-page-header">
    <div class="cp-page-header-brand">AskMiro Cleaning Services</div>
    <div class="cp-page-header-rule"></div>
    <div style="font-size:11px;color:#9ca3af">Company Profile</div>
  </div>
  <div class="cp-inner">
    <div class="cp-section-num">02</div>
    <div class="cp-section-title">Core Services</div>

    <!-- Builders Cleans — featured -->
    <div style="background:#0D1C2E;padding:24px 28px;margin-bottom:20px;border-radius:2px">
      <div style="font-size:10px;font-weight:700;color:#0D9488;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">Primary Specialism</div>
      <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:10px;font-family:'Outfit',Arial,sans-serif">Builders Cleans</div>
      <div style="font-size:13px;color:rgba(255,255,255,.65);line-height:1.7;max-width:580px">
        AskMiro specialises in builders cleans across all stages of construction: first fix clean,
        sparkle clean and final handover clean. We understand site induction requirements, contractor
        CDM protocols and the precision expected at practical completion — including window cleaning,
        UPVC wiping, paint splash removal, dust clearance and sanitisation of all surfaces to
        developer specification.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
        ${['First Fix Clean','Sparkle Clean','Handover Clean','UPVC &amp; Glazing','Paint &amp; Plaster Removal','Developer Spec Sign-off']
          .map(t => `<span style="padding:4px 12px;background:rgba(13,148,136,.15);color:#0D9488;font-size:11px;font-weight:700;border-radius:2px;letter-spacing:.04em">${t}</span>`).join('')}
      </div>
    </div>

    <div class="cp-service-grid">
      ${[
        ['Commercial Cleaning','Scheduled and reactive cleaning for offices, retail units, commercial premises and managed workspaces. Tailored programmes with documented quality checks.'],
        ['Communal Areas','Regular cleaning of communal spaces within residential developments, managed buildings and multi-occupancy properties to maintaining presentation standards.'],
        ['Deep Cleaning','Intensive deep-clean programmes for end-of-tenancy, pre-occupation and periodic resets. Full degreasing, sanitisation and surface restoration.'],
        ['Sector-Specific Services','Specialist cleaning across construction, automotive showrooms, educational facilities and food-safe environments, with appropriate COSHH and PPE protocols applied.']
      ].map(([name,desc],i) => `
      <div class="cp-service-item">
        <div class="cp-service-num">0${i+2}</div>
        <div class="cp-service-name">${name}</div>
        <div class="cp-service-desc">${desc}</div>
      </div>`).join('')}
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════
     03 — SECTORS
══════════════════════════════════════════════════════════ -->
<div class="cp-page">
  <div class="cp-page-header">
    <div class="cp-page-header-brand">AskMiro Cleaning Services</div>
    <div class="cp-page-header-rule"></div>
    <div style="font-size:11px;color:#9ca3af">Company Profile</div>
  </div>
  <div class="cp-inner">
    <div class="cp-section-num">03</div>
    <div class="cp-section-title">Sectors</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${[
        {
          name:'Construction',
          detail:'Active construction sites, new-build residential and commercial developments, phased handovers, practical completion cleans and snagging-phase preparation.'
        },
        {
          name:'Commercial',
          detail:'Grade A offices, multi-tenanted buildings, reception areas, washrooms and back-of-house. Periodic and daily maintenance programmes.'
        },
        {
          name:'Property Management',
          detail:'Communal areas, lift lobbies, stairwells and car parks within residential and mixed-use developments. Managed to lease specification.'
        },
        {
          name:'Education',
          detail:'Schools, academies and further education facilities. Term-time scheduled cleaning and holiday deep-clean programmes.'
        },
        {
          name:'Automotive',
          detail:'Showroom preparation, forecourt maintenance and vehicle display area cleaning to manufacturer presentation standards.'
        },
        {
          name:'Industrial &amp; Logistics',
          detail:'Warehouses, distribution centres and light industrial units. Hard floor maintenance and high-bay cleaning programmes.'
        }
      ].map(s => `
      <div style="padding:20px 22px;background:#f8fafc;border-left:3px solid #0D9488">
        <div style="font-size:13px;font-weight:800;color:#0D1C2E;margin-bottom:8px;font-family:'Outfit',Arial,sans-serif">${s.name}</div>
        <div style="font-size:12px;color:#6b7280;line-height:1.65">${s.detail}</div>
      </div>`).join('')}
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════
     04 — OUR APPROACH
══════════════════════════════════════════════════════════ -->
<div class="cp-page">
  <div class="cp-page-header">
    <div class="cp-page-header-brand">AskMiro Cleaning Services</div>
    <div class="cp-page-header-rule"></div>
    <div style="font-size:11px;color:#9ca3af">Company Profile</div>
  </div>
  <div class="cp-inner">
    <div class="cp-section-num">04</div>
    <div class="cp-section-title">Our Approach</div>
    <div class="cp-approach-list">
      ${[
        ['Director-Led Operations','Every contract is overseen directly by company directors. There is no layer of unmanaged subcontracted labour between our directors and the work. Accountability sits at the top of the organisation, not the bottom.'],
        ['Precision on Site','We operate to the standard expected on high-value construction and commercial contracts. This means proper site documentation, pre-clean briefings, sign-off checklists and photographic records at completion.'],
        ['Structured Communication','Response times are defined. Progress is communicated proactively. Issues are escalated fast. We do not leave clients chasing us — clear and reliable communication is part of the service.'],
        ['Operational Flexibility','Construction programmes change. Handover dates move. We structure our scheduling to absorb these changes without penalty to the client or compromise to output quality. We adapt; we do not make excuses.'],
        ['Compliance by Default','RAMS, COSHH assessments and PPE protocols are not an afterthought. They are prepared before mobilisation and maintained throughout the contract. We operate as a professional contractor from day one.']
      ].map(([title, body], i) => `
      <div class="cp-approach-item">
        <div class="cp-approach-num">${String(i+1).padStart(2,'0')}</div>
        <div>
          <div class="cp-approach-title">${title}</div>
          <div class="cp-approach-body">${body}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════
     05 — HEALTH & SAFETY & COMPLIANCE
══════════════════════════════════════════════════════════ -->
<div class="cp-page">
  <div class="cp-page-header">
    <div class="cp-page-header-brand">AskMiro Cleaning Services</div>
    <div class="cp-page-header-rule"></div>
    <div style="font-size:11px;color:#9ca3af">Company Profile</div>
  </div>
  <div class="cp-inner">
    <div class="cp-section-num">05</div>
    <div class="cp-section-title">Health, Safety &amp; Compliance</div>

    <div class="cp-body" style="margin-bottom:28px">
      <p>AskMiro operates within a full health and safety management framework appropriate for construction
      and commercial contract environments. All operatives work under documented risk controls, and all
      client-facing sites receive site-specific documentation prior to mobilisation.</p>
    </div>

    <div class="cp-compliance-grid">
      ${[
        ['RAMS','Risk Assessments and Method Statements are produced for all site operations. Site-specific RAMS are issued in advance of mobilisation and updated in response to significant scope or site changes.'],
        ['COSHH','Full COSHH assessments are maintained for all cleaning chemicals and agents in use. Product data sheets are held on file and available on request. All operatives receive product-specific briefings.'],
        ['PPE','Appropriate PPE is issued and enforced across all operatives relative to the site and task. Compliance is managed by the supervising director and documented on site records.'],
        ['Site Inductions','All operatives complete site inductions as required under contractor protocols. We maintain induction records and ensure no operative enters a site without completing the required process.'],
        ['Incident Reporting','A documented incident reporting procedure is in operation. Near-misses, incidents and observations are recorded, reviewed and acted upon. Records are available for inspection by principal contractors.'],
        ['UK Compliance Standards','We operate in accordance with the Health and Safety at Work Act 1974, the Management of Health and Safety at Work Regulations 1999, CDM 2015 (where applicable) and associated ACOP guidance.']
      ].map(([title, body]) => `
      <div class="cp-compliance-item">
        <div class="cp-compliance-title">${title}</div>
        <div class="cp-compliance-body">${body}</div>
      </div>`).join('')}
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════
     06 — INSURANCE
══════════════════════════════════════════════════════════ -->
<div class="cp-page">
  <div class="cp-page-header">
    <div class="cp-page-header-brand">AskMiro Cleaning Services</div>
    <div class="cp-page-header-rule"></div>
    <div style="font-size:11px;color:#9ca3af">Company Profile</div>
  </div>
  <div class="cp-inner">
    <div class="cp-section-num">06</div>
    <div class="cp-section-title">Insurance</div>
    <div class="cp-body" style="margin-bottom:24px">
      <p>AskMiro Cleaning Services carries full commercial insurance appropriate for both construction site
      operations and commercial contract environments. Certificates of insurance are available on request.</p>
    </div>
    <div class="cp-insurance-row">
      <div class="cp-insurance-cell">
        <div class="cp-insurance-label">Employers' Liability</div>
        <div class="cp-insurance-value">£10,000,000</div>
        <div class="cp-insurance-note">Per occurrence, as required under the Employers' Liability (Compulsory Insurance) Act 1969</div>
      </div>
      <div class="cp-insurance-cell" style="border-left:1px solid #e5e7eb">
        <div class="cp-insurance-label">Public Liability</div>
        <div class="cp-insurance-value">£1,000,000</div>
        <div class="cp-insurance-note">Per occurrence. Scalable to contract requirements — please contact us to discuss specific project needs</div>
      </div>
    </div>
    <div style="margin-top:20px;padding:16px 20px;background:#f0fdf4;border-left:3px solid #059669">
      <div style="font-size:12px;color:#065f46;line-height:1.7">
        <strong>Insurance documentation</strong> — certificates of insurance are available upon request and can be
        provided directly to principal contractors as part of supply chain pre-qualification. Please contact
        <strong>info@askmiro.com</strong> with specific requirements.
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════
     07 — WHY ASKMIRO
══════════════════════════════════════════════════════════ -->
<div class="cp-page">
  <div class="cp-page-header">
    <div class="cp-page-header-brand">AskMiro Cleaning Services</div>
    <div class="cp-page-header-rule"></div>
    <div style="font-size:11px;color:#9ca3af">Company Profile</div>
  </div>
  <div class="cp-inner">
    <div class="cp-section-num">07</div>
    <div class="cp-section-title">Why AskMiro</div>
    <div class="cp-why-list">
      ${[
        ['Director involvement on every contract','No account management layers. The person responsible for quality is present, contactable and accountable throughout the duration of the contract.'],
        ['Built for construction environments','We understand site protocols, CDM obligations, induction requirements and contractor supply chain expectations. We operate on site — not just around it.'],
        ['Rapid London mobilisation','London-based operations enable fast deployment across the capital and surrounding areas. We respond to programme changes and emergency requirements without delay.'],
        ['Documentation ready from day one','RAMS, COSHH assessments, insurance certificates and method statements are prepared before the contract starts — not after the first issue arises.'],
        ['Transparent reporting and communication','We communicate on a defined schedule. Progress is logged, sign-offs are documented, and concerns are escalated immediately. No chasing, no ambiguity.'],
        ['Consistent standard across multi-site programmes','The same management, the same processes and the same standard are applied whether we are cleaning one unit or twenty. Consistency is designed in, not hoped for.'],
        ['Technology-enabled operations','Contract management, scheduling and compliance records are managed through our in-house operations platform, giving clients visibility and our team operational clarity.']
      ].map(([title, body]) => `
      <div class="cp-why-item">
        <div class="cp-why-dot"></div>
        <div class="cp-why-text"><strong>${title}</strong> — ${body}</div>
      </div>`).join('')}
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════
     08 — CONTACT
══════════════════════════════════════════════════════════ -->
<div class="cp-page cp-contact">
  <div class="cp-section-num" style="color:#0D9488;margin-bottom:8px">08</div>
  <div class="cp-contact-title">Get In Touch</div>
  <div class="cp-contact-sub">Direct contact — no call centres, no delays.</div>

  <div class="cp-contact-grid">
    <div class="cp-contact-item">
      <div class="cp-contact-label">Website</div>
      <div class="cp-contact-value">www.askmiro.com</div>
    </div>
    <div class="cp-contact-item">
      <div class="cp-contact-label">Email</div>
      <div class="cp-contact-value">info@askmiro.com</div>
    </div>
    <div class="cp-contact-item">
      <div class="cp-contact-label">Registered Address</div>
      <div class="cp-contact-value" style="font-size:13px">34 Haldane Place<br>London, SW18 4UH<br>England</div>
    </div>
    <div class="cp-contact-item">
      <div class="cp-contact-label">Legal Entity</div>
      <div class="cp-contact-value" style="font-size:13px">Miro Partners Ltd<br>Private Limited Company<br>Incorporated 14 March 2025</div>
    </div>
  </div>

  <div style="display:flex;align-items:center;gap:14px;margin-bottom:40px">
    <div style="width:44px;height:44px;background:rgba(13,148,136,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
        <path d="M8 20L12 12L16 20L20 12L24 20" stroke="#0D9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div>
      <div style="font-size:16px;font-weight:800;color:#fff;font-family:'Outfit',Arial,sans-serif">AskMiro Cleaning Services</div>
      <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:2px;letter-spacing:.06em;text-transform:uppercase">Your Space. Our Responsibility.</div>
    </div>
  </div>

  <div class="cp-contact-legal">
    AskMiro Cleaning Services is a trading name of Miro Partners Ltd. Registered in England and Wales.
    Registered Office: 34 Haldane Place, London, England, SW18 4UH.
    SIC 81100 — Combined facilities support activities &nbsp;|&nbsp; SIC 81210 — General cleaning of buildings.
  </div>
</div>

</div><!-- end cp-doc -->`;

    document.body.appendChild(overlay);
    overlay.style.display = 'block';
  }

  // ── HELPERS ───────────────────────────────────────────────────
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return { render, _tab, saveSettings, openNewUser, saveUser, printCompanyProfile };
})();
