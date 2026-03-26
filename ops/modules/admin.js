// ============================================================
// AskMiro Ops — Admin & Settings Module  v3.0
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
        icon:'&#127970;',
        title:'Company Profile',
        sub:'Capability statement for developers &amp; commercial managers.',
        tag:'Client-facing · 9 pages',
        tagCls:'pg',
        action:"Admin.openProfileModal()"
      },
      {
        icon:'&#128203;',
        title:'Quote Template',
        sub:'Branded quote document generated from the Quote Builder.',
        tag:'Via Quotes',
        tagCls:'pt',
        action:"Router.navigate('quotes')"
      },
      {
        icon:'&#128196;',
        title:'Invoice Template',
        sub:'Branded invoice generated from the Finance module.',
        tag:'Via Finance',
        tagCls:'pt',
        action:"Router.navigate('finance')"
      },
      {
        icon:'&#128100;',
        title:'Payslip',
        sub:'PAYE payslip with earnings, deductions and NI.',
        tag:'Via Payroll',
        tagCls:'pt',
        action:"Router.navigate('payroll')"
      }
    ];
    return `
<div style="margin-bottom:18px;padding:13px 16px;background:#f8fafc;border:1px solid var(--brd);border-radius:8px;font-size:13px;color:var(--ll)">
  <strong style="color:var(--txt)">Company Documents</strong> — branded, print-ready documents for clients, partners and staff.
  Each document opens as a full-page overlay. Click <strong>Save as PDF</strong> in the document to export.
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
${docs.map(d => `
  <div class="card" style="transition:box-shadow .15s;cursor:default"
    onmouseenter="this.style.boxShadow='0 4px 20px rgba(13,148,136,.1)'"
    onmouseleave="this.style.boxShadow=''">
    <div class="card-body" style="padding:22px">
      <div style="font-size:26px;margin-bottom:14px;line-height:1">${d.icon}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <div style="font-size:14px;font-weight:700;color:var(--txt)">${d.title}</div>
        <span class="pl ${d.tagCls}" style="font-size:10px;white-space:nowrap">${d.tag}</span>
      </div>
      <div style="font-size:12px;color:var(--ll);line-height:1.55;margin-bottom:18px">${d.sub}</div>
      <button class="btn bp btn-xs" onclick="${d.action}">Open Document</button>
    </div>
  </div>`).join('')}
</div>`;
  }

  // ── TEMPLATE MODAL ────────────────────────────────────────────
  function openProfileModal() {
    const now = new Date();
    const defaultDate = now.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
    UI.openModal(`
<div class="modal-hd">
  <h2>Company Profile</h2>
  <button class="xbtn" onclick="UI.closeModal()">&#x2715;</button>
</div>
<div class="modal-body">
  <div style="font-size:12px;color:var(--ll);line-height:1.6;margin-bottom:18px;padding:10px 12px;background:#f8fafc;border-left:3px solid #0D9488">
    This document will be prepared as a client-facing capability statement.
    Enter the recipient details below — only the company name is required.
  </div>
  <div class="fg">
    <label class="fl">Prepared For — Company Name <span class="req">*</span></label>
    <input class="fin" id="cp-for" placeholder="e.g. St George PLC" autocomplete="off">
  </div>
  <div class="fg">
    <label class="fl">Attention / Contact Name</label>
    <input class="fin" id="cp-attn" placeholder="e.g. James Thornton, Procurement Manager">
  </div>
  <div class="fr">
    <div class="fg">
      <label class="fl">Document Date</label>
      <input class="fin" id="cp-date" value="${_esc(defaultDate)}">
    </div>
    <div class="fg">
      <label class="fl">Project / Site Reference</label>
      <input class="fin" id="cp-ref" placeholder="e.g. Battersea Phase 3">
    </div>
  </div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Admin._genProfile()">Generate Document &rarr;</button>
  </div>
</div>`);
    setTimeout(() => { const el = document.getElementById('cp-for'); if(el) el.focus(); }, 80);
  }

  function _genProfile() {
    if (!UI.rq('cp-for')) return;
    const data = {
      preparedFor: UI.gv('cp-for'),
      attn:        UI.gv('cp-attn'),
      date:        UI.gv('cp-date') || new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}),
      ref:         UI.gv('cp-ref')
    };
    UI.closeModal();
    _buildProfile(data);
  }

  // ── INJECT STYLES (once) ──────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('cp-styles')) return;
    const s = document.createElement('style');
    s.id = 'cp-styles';
    s.textContent = `
/* ── OVERLAY ──────────────────────────────────────────── */
#cp-overlay{display:none;position:fixed;inset:0;background:#d1d5db;z-index:99999;overflow-y:auto;padding:36px 0 72px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#1f2937}
#cp-overlay *{box-sizing:border-box;margin:0;padding:0}

/* ── DOC SHELL ────────────────────────────────────────── */
.cp-doc{max-width:794px;margin:0 auto}
.cp-page{background:#fff;margin-bottom:6px;position:relative;overflow:hidden}

/* ── PRINT BAR ────────────────────────────────────────── */
.cp-bar{max-width:794px;margin:0 auto 16px;display:flex;align-items:center;justify-content:space-between;padding:0 2px}
.cp-bar-title{font-size:13px;font-weight:700;color:#0f172a}
.cp-bar button{border:none;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.01em}
.cp-bar .cp-btn-pdf{background:#0D9488;color:#fff}
.cp-bar .cp-btn-close{background:#f1f5f9;color:#475569;padding:9px 14px;font-weight:400}

/* ── TEAL LEFT BORDER — inner pages ──────────────────── */
.cp-inner-page::before{content:'';position:absolute;top:0;left:0;bottom:0;width:4px;background:#0D9488}

/* ── PAGE HEADER ──────────────────────────────────────── */
.cp-ph{display:flex;align-items:center;padding:15px 56px 15px 68px;border-bottom:1px solid #e5e7eb}
.cp-ph-brand{font-size:10px;font-weight:700;color:#0D9488;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.cp-ph-rule{flex:1;height:1px;background:#e5e7eb;margin:0 16px}
.cp-ph-sec{font-size:10px;color:#9ca3af;letter-spacing:.04em;white-space:nowrap}

/* ── PAGE FOOTER ──────────────────────────────────────── */
.cp-pf{display:flex;align-items:center;justify-content:space-between;padding:11px 56px 11px 68px;border-top:1px solid #e5e7eb}
.cp-pf-legal{font-size:9.5px;color:#9ca3af;letter-spacing:.01em}
.cp-pf-pg{font-size:9.5px;color:#9ca3af}

/* ── INNER CONTENT ────────────────────────────────────── */
.cp-in{padding:46px 56px 50px 68px}

/* ── TYPOGRAPHY ───────────────────────────────────────── */
.cp-eyebrow{font-size:10px;font-weight:700;color:#0D9488;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px}
.cp-h{font-family:'Outfit',Arial,sans-serif;font-size:24px;font-weight:800;color:#0D1C2E;letter-spacing:-.02em;line-height:1.15;padding-bottom:15px;border-bottom:2px solid #0D1C2E;margin-bottom:30px}
.cp-lead{font-size:14.5px;color:#0D1C2E;font-weight:600;line-height:1.65;margin-bottom:22px}
.cp-body{font-size:13px;color:#374151;line-height:1.78}
.cp-body p{margin-bottom:15px}
.cp-body p:last-child{margin-bottom:0}

/* ── FACT GRID ────────────────────────────────────────── */
.cp-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;margin-top:34px;overflow:hidden}
.cp-fact{background:#fff;padding:17px 20px}
.cp-fact-lbl{font-size:9.5px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px}
.cp-fact-val{font-size:13px;font-weight:700;color:#0D1C2E;line-height:1.35}

/* ── FEATURE BLOCK (builders cleans) ─────────────────── */
.cp-feature{background:#0D1C2E;padding:24px 28px;margin-bottom:18px}
.cp-feature-eyebrow{font-size:9.5px;font-weight:700;color:#0D9488;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px}
.cp-feature-title{font-family:'Outfit',Arial,sans-serif;font-size:17px;font-weight:800;color:#fff;margin-bottom:10px}
.cp-feature-body{font-size:12.5px;color:rgba(255,255,255,.62);line-height:1.72;max-width:580px}
.cp-feature-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
.cp-feature-tag{padding:3px 11px;background:rgba(13,148,136,.14);color:#0D9488;font-size:10px;font-weight:700;letter-spacing:.04em}

/* ── SERVICE GRID ─────────────────────────────────────── */
.cp-svc-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;overflow:hidden}
.cp-svc{background:#fff;padding:20px 22px}
.cp-svc-num{font-size:9.5px;font-weight:700;color:#0D9488;letter-spacing:.1em;margin-bottom:9px}
.cp-svc-name{font-size:13.5px;font-weight:700;color:#0D1C2E;margin-bottom:7px}
.cp-svc-desc{font-size:12px;color:#6b7280;line-height:1.65}

/* ── SECTOR CARDS ─────────────────────────────────────── */
.cp-sectors{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.cp-sector{padding:19px 21px;background:#f8fafc;border-left:3px solid #0D9488}
.cp-sector-name{font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:800;color:#0D1C2E;margin-bottom:7px}
.cp-sector-body{font-size:12px;color:#6b7280;line-height:1.65}

/* ── APPROACH LIST ────────────────────────────────────── */
.cp-approach{display:flex;flex-direction:column;gap:18px;margin-top:6px}
.cp-ap-item{display:flex;gap:20px;align-items:flex-start;padding-bottom:18px;border-bottom:1px solid #f3f4f6}
.cp-ap-item:last-child{border-bottom:none;padding-bottom:0}
.cp-ap-num{width:30px;height:30px;flex-shrink:0;background:#0D1C2E;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:800;color:#fff;font-family:monospace}
.cp-ap-title{font-size:13px;font-weight:700;color:#0D1C2E;margin-bottom:4px}
.cp-ap-body{font-size:12px;color:#6b7280;line-height:1.68}

/* ── COMPLIANCE GRID ──────────────────────────────────── */
.cp-comp{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:8px}
.cp-comp-item{padding:17px 19px;background:#f8fafc;border-left:3px solid #0D9488}
.cp-comp-title{font-size:10.5px;font-weight:700;color:#0D1C2E;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.cp-comp-body{font-size:12px;color:#6b7280;line-height:1.65}

/* ── INSURANCE CELLS ──────────────────────────────────── */
.cp-ins{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;margin-top:8px;overflow:hidden}
.cp-ins-cell{background:#fff;padding:26px 28px}
.cp-ins-cell+.cp-ins-cell{border-left:none}
.cp-ins-lbl{font-size:9.5px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
.cp-ins-val{font-family:'Outfit',Arial,sans-serif;font-size:26px;font-weight:800;color:#0D1C2E;letter-spacing:-.03em;margin-bottom:5px}
.cp-ins-note{font-size:11px;color:#9ca3af;line-height:1.6}
.cp-ins-notice{margin-top:18px;padding:15px 18px;background:#f0fdf4;border-left:3px solid #059669}
.cp-ins-notice-body{font-size:12px;color:#065f46;line-height:1.7}

/* ── WHY LIST ─────────────────────────────────────────── */
.cp-why{display:flex;flex-direction:column}
.cp-why-item{display:flex;align-items:flex-start;gap:15px;padding:14px 0;border-bottom:1px solid #f3f4f6}
.cp-why-item:last-child{border-bottom:none}
.cp-why-dot{width:5px;height:5px;border-radius:50%;background:#0D9488;flex-shrink:0;margin-top:6px}
.cp-why-text{font-size:13px;color:#1f2937;line-height:1.65}
.cp-why-text strong{color:#0D1C2E;font-weight:700}

/* ── COVER PAGE ───────────────────────────────────────── */
.cp-cover{background:#0D1C2E;min-height:600px;display:flex;flex-direction:column;padding:0}
.cp-cover-bar{height:6px;background:#0D9488;flex-shrink:0}
.cp-cover-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:64px 60px 44px;text-align:center}
.cp-cover-logo{width:62px;height:62px;background:rgba(13,148,136,.14);display:flex;align-items:center;justify-content:center;margin-bottom:30px}
.cp-cover-name{font-family:'Outfit',Arial,sans-serif;font-size:40px;font-weight:800;color:#fff;letter-spacing:-.02em;line-height:1.05;text-transform:uppercase;margin-bottom:10px}
.cp-cover-trading{font-size:12px;color:rgba(255,255,255,.38);letter-spacing:.06em;text-transform:uppercase;margin-bottom:34px}
.cp-cover-rule{width:38px;height:2px;background:#0D9488;margin:0 auto 26px}
.cp-cover-tagline{font-size:14px;color:rgba(255,255,255,.68);letter-spacing:.1em;text-transform:uppercase}
.cp-cover-foot{border-top:1px solid rgba(255,255,255,.08);padding:22px 56px;display:flex;justify-content:space-between;align-items:flex-end;flex-shrink:0}
.cp-cover-foot-lbl{font-size:9.5px;font-weight:700;color:#0D9488;letter-spacing:.1em;text-transform:uppercase;margin-bottom:5px}
.cp-cover-foot-val{font-size:15px;font-weight:700;color:#fff;line-height:1.3}
.cp-cover-foot-meta{font-size:11px;color:rgba(255,255,255,.32);margin-top:3px}

/* ── CONTACT PAGE ─────────────────────────────────────── */
.cp-contact-page{background:#0D1C2E;padding:50px 56px 50px 68px;position:relative;overflow:hidden}
.cp-contact-page::before{content:'';position:absolute;top:0;left:0;bottom:0;width:4px;background:#0D9488}
.cp-contact-title{font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:4px}
.cp-contact-sub{font-size:12.5px;color:rgba(255,255,255,.38);margin-bottom:38px;letter-spacing:.04em}
.cp-contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:42px}
.cp-contact-lbl{font-size:9.5px;font-weight:700;color:#0D9488;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
.cp-contact-val{font-size:13.5px;color:#fff;font-weight:600;line-height:1.6}
.cp-contact-lock{display:flex;align-items:center;gap:14px;margin-bottom:38px}
.cp-contact-lockup-name{font-family:'Outfit',Arial,sans-serif;font-size:15px;font-weight:800;color:#fff}
.cp-contact-lockup-tag{font-size:10px;color:rgba(255,255,255,.32);margin-top:3px;letter-spacing:.06em;text-transform:uppercase}
.cp-contact-legal{border-top:1px solid rgba(255,255,255,.07);padding-top:22px;font-size:10px;color:rgba(255,255,255,.25);line-height:1.9}

/* ── @MEDIA PRINT ─────────────────────────────────────── */
@media print{
  body>*:not(#cp-overlay){display:none!important}
  #cp-overlay{display:block!important;position:static!important;padding:0;background:#fff;overflow:visible}
  #cp-overlay .no-print{display:none!important}
  .cp-doc{max-width:100%}
  .cp-page{page-break-before:always;page-break-after:auto;margin-bottom:0;overflow:visible}
  .cp-cover{page-break-before:auto}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}`;
    document.head.appendChild(s);
  }

  // ── BUILD OVERLAY ─────────────────────────────────────────────
  function _buildProfile(data) {
    _injectStyles();
    const existing = document.getElementById('cp-overlay');
    if (existing) existing.remove();

    const ov = document.createElement('div');
    ov.id = 'cp-overlay';

    const ph = (sec) =>
      `<div class="cp-ph"><div class="cp-ph-brand">AskMiro Cleaning Services</div><div class="cp-ph-rule"></div><div class="cp-ph-sec">${sec}</div></div>`;
    const pf = (pg) =>
      `<div class="cp-pf"><div class="cp-pf-legal">Miro Partners Ltd trading as AskMiro Cleaning Services &nbsp;&bull;&nbsp; Confidential</div><div class="cp-pf-pg">${pg} / 08</div></div>`;

    ov.innerHTML = `

<!-- ─── PRINT BAR ──────────────────────────────────────── -->
<div class="cp-bar no-print">
  <div class="cp-bar-title">Company Profile &mdash; ${_esc(data.preparedFor)}</div>
  <div style="display:flex;gap:8px">
    <button class="cp-btn-pdf" onclick="window.print()">Save as PDF</button>
    <button class="cp-btn-close" onclick="document.getElementById('cp-overlay').remove()">&#x2715; Close</button>
  </div>
</div>

<div class="cp-doc">

<!-- ═══════════════════════════════════════════════════════
     COVER
═══════════════════════════════════════════════════════ -->
<div class="cp-page cp-cover">
  <div class="cp-cover-bar"></div>
  <div class="cp-cover-body">
    <div class="cp-cover-logo">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
        <path d="M8 20L12 12L16 20L20 12L24 20" stroke="#0D9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="cp-cover-name">AskMiro<br>Cleaning Services</div>
    <div class="cp-cover-trading">Miro Partners Ltd &nbsp;&middot;&nbsp; London, England</div>
    <div class="cp-cover-rule"></div>
    <div class="cp-cover-tagline">Your Space. Our Responsibility.</div>
  </div>
  <div class="cp-cover-foot">
    <div>
      <div class="cp-cover-foot-lbl">Prepared For</div>
      <div class="cp-cover-foot-val">${_esc(data.preparedFor)}</div>
      ${data.attn ? `<div class="cp-cover-foot-meta">Att: ${_esc(data.attn)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="cp-cover-foot-lbl">Date</div>
      <div class="cp-cover-foot-val">${_esc(data.date)}</div>
      ${data.ref
        ? `<div class="cp-cover-foot-meta">Ref: ${_esc(data.ref)}</div>`
        : `<div class="cp-cover-foot-meta">Company Profile</div>`}
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════
     01 — ABOUT
═══════════════════════════════════════════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('01 &mdash; About')}
  <div class="cp-in">
    <div class="cp-eyebrow">01</div>
    <div class="cp-h">About AskMiro</div>
    <div class="cp-lead">
      AskMiro Cleaning Services is a London-based commercial cleaning contractor delivering
      precision-led services across construction, commercial and managed property environments.
    </div>
    <div class="cp-body">
      <p>Operated under Miro Partners Ltd and director-led from inception, we combine operational
      rigour with responsive on-site management to meet the demands of high-value projects and
      long-term maintenance contracts. Every engagement is managed directly — with structured
      communication, documented processes and accountability at every stage.</p>
      <p>Our work spans all stages of construction cleaning, from first fix through to sparkle clean
      and developer handover, as well as ongoing commercial maintenance contracts across London.
      We understand site protocols, contractor supply chains and the standards expected at practical
      completion.</p>
      <p>AskMiro operates with the systems, compliance documentation and professional infrastructure
      of a contractor built for scale. Our clients can expect consistent output, direct communication
      and zero surprises on programme.</p>
    </div>
    <div class="cp-facts">
      ${[
        ['Incorporated','14 March 2025'],
        ['Legal Entity','Miro Partners Ltd'],
        ['SIC Codes','81100 &middot; 81210'],
        ['Location','London, England'],
        ['Structure','Private Limited Company'],
        ['Operations','Director-Led']
      ].map(([l,v]) => `<div class="cp-fact"><div class="cp-fact-lbl">${l}</div><div class="cp-fact-val">${v}</div></div>`).join('')}
    </div>
  </div>
  ${pf('01')}
</div>

<!-- ═══════════════════════════════════════════════════════
     02 — CORE SERVICES
═══════════════════════════════════════════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('02 &mdash; Core Services')}
  <div class="cp-in">
    <div class="cp-eyebrow">02</div>
    <div class="cp-h">Core Services</div>
    <div class="cp-feature">
      <div class="cp-feature-eyebrow">Primary Specialism</div>
      <div class="cp-feature-title">Builders Cleans</div>
      <div class="cp-feature-body">
        AskMiro specialises in builders cleans across all stages of construction: first fix clean,
        sparkle clean and final handover clean. We understand site induction requirements, contractor
        CDM protocols and the precision expected at practical completion — including window cleaning,
        UPVC wiping, paint splash removal, dust clearance and full surface sanitisation to developer
        specification.
      </div>
      <div class="cp-feature-tags">
        ${['First Fix Clean','Sparkle Clean','Handover Clean','UPVC &amp; Glazing','Paint &amp; Plaster Removal','Developer Spec Sign-off']
          .map(t => `<div class="cp-feature-tag">${t}</div>`).join('')}
      </div>
    </div>
    <div class="cp-svc-grid">
      ${[
        ['02','Commercial Cleaning','Scheduled and reactive cleaning for offices, retail units and commercial premises. Tailored programmes with documented quality checks and consistent reporting.'],
        ['03','Communal Areas','Routine cleaning of communal spaces within residential developments, managed buildings and multi-occupancy properties, maintained to lease specification.'],
        ['04','Deep Cleaning','Intensive deep-clean programmes for end-of-tenancy, pre-occupation and periodic resets. Full degreasing, sanitisation and surface restoration to commercial standard.'],
        ['05','Sector-Specific Services','Specialist cleaning across automotive showrooms, educational facilities and food-safe environments, with appropriate COSHH and PPE protocols applied as standard.']
      ].map(([n,name,desc]) => `
      <div class="cp-svc">
        <div class="cp-svc-num">${n}</div>
        <div class="cp-svc-name">${name}</div>
        <div class="cp-svc-desc">${desc}</div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('02')}
</div>

<!-- ═══════════════════════════════════════════════════════
     03 — SECTORS
═══════════════════════════════════════════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('03 &mdash; Sectors')}
  <div class="cp-in">
    <div class="cp-eyebrow">03</div>
    <div class="cp-h">Sectors</div>
    <div class="cp-sectors">
      ${[
        ['Construction','Active construction sites, new-build residential and commercial developments, phased handovers, practical completion cleans and snagging-phase preparation. Full CDM compliance.'],
        ['Commercial','Grade A offices, multi-tenanted buildings, reception areas, washrooms and back-of-house. Daily and periodic maintenance programmes structured to occupier requirements.'],
        ['Property Management','Communal areas, lift lobbies, stairwells and car parks within residential and mixed-use developments. Maintained to lease specification and developer standard.'],
        ['Education','Schools, academies and further education facilities. Term-time scheduled cleaning programmes and holiday deep-clean contracts.'],
        ['Automotive','Showroom preparation, forecourt maintenance and vehicle display area cleaning to manufacturer presentation standards.'],
        ['Industrial &amp; Logistics','Warehouses, distribution centres and light industrial units. Hard floor maintenance, high-bay cleaning and ad hoc reactive programmes.']
      ].map(([name,body]) => `
      <div class="cp-sector">
        <div class="cp-sector-name">${name}</div>
        <div class="cp-sector-body">${body}</div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('03')}
</div>

<!-- ═══════════════════════════════════════════════════════
     04 — OUR APPROACH
═══════════════════════════════════════════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('04 &mdash; Our Approach')}
  <div class="cp-in">
    <div class="cp-eyebrow">04</div>
    <div class="cp-h">Our Approach</div>
    <div class="cp-approach">
      ${[
        ['Director-Led Operations','Every contract is overseen directly by company directors. There is no layer of unmanaged subcontracted labour between our directors and the work on site. Accountability sits at the top of the organisation.'],
        ['Precision on Site','We operate to the standard expected on high-value construction and commercial contracts. Pre-clean briefings, sign-off checklists and photographic records are standard on every contract — not an upgrade.'],
        ['Structured Communication','Response times are defined and adhered to. Progress is communicated proactively. Issues are escalated fast. Clients do not need to chase us — reliable communication is part of what we deliver.'],
        ['Operational Flexibility','Construction programmes change. Handover dates move. We structure our scheduling to absorb these changes without penalty to the client or compromise to output quality.'],
        ['Compliance by Default','RAMS, COSHH assessments and PPE protocols are prepared before mobilisation and maintained throughout the contract. We operate as a professional contractor from day one — on every contract.']
      ].map(([title,body],i) => `
      <div class="cp-ap-item">
        <div class="cp-ap-num">${String(i+1).padStart(2,'0')}</div>
        <div>
          <div class="cp-ap-title">${title}</div>
          <div class="cp-ap-body">${body}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('04')}
</div>

<!-- ═══════════════════════════════════════════════════════
     05 — HEALTH, SAFETY & COMPLIANCE
═══════════════════════════════════════════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('05 &mdash; H&amp;S &amp; Compliance')}
  <div class="cp-in">
    <div class="cp-eyebrow">05</div>
    <div class="cp-h">Health, Safety &amp; Compliance</div>
    <div class="cp-body" style="margin-bottom:26px">
      <p>AskMiro operates within a full health and safety management framework appropriate for
      construction and commercial contract environments. All operatives work under documented risk
      controls, and all client-facing sites receive site-specific documentation prior to mobilisation.
      Records are maintained and available for inspection by principal contractors at any time.</p>
    </div>
    <div class="cp-comp">
      ${[
        ['RAMS','Risk Assessments and Method Statements are produced for all site operations. Site-specific RAMS are issued in advance of mobilisation and updated in response to significant scope or access changes.'],
        ['COSHH','Full COSHH assessments are maintained for all chemicals and agents in use. Product data sheets are held on file. All operatives receive product-specific briefings before use on site.'],
        ['PPE','Appropriate PPE is issued and enforced across all operatives relative to the site and task. Compliance is managed directly and documented within site records on every contract.'],
        ['Site Inductions','All operatives complete site inductions as required under contractor protocols. Induction records are maintained and no operative enters a site without completing the required process.'],
        ['Incident Reporting','A documented incident reporting procedure is in operation. Near-misses, incidents and observations are recorded, reviewed and acted upon. Records are available for inspection.'],
        ['UK Standards','We operate in accordance with HASAWA 1974, Management Regulations 1999, CDM 2015 (where applicable) and associated ACOP guidance. ISO-aligned working practices throughout.']
      ].map(([t,b]) => `
      <div class="cp-comp-item">
        <div class="cp-comp-title">${t}</div>
        <div class="cp-comp-body">${b}</div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('05')}
</div>

<!-- ═══════════════════════════════════════════════════════
     06 — INSURANCE
═══════════════════════════════════════════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('06 &mdash; Insurance')}
  <div class="cp-in">
    <div class="cp-eyebrow">06</div>
    <div class="cp-h">Insurance</div>
    <div class="cp-body" style="margin-bottom:22px">
      <p>AskMiro Cleaning Services carries full commercial insurance appropriate for both construction
      site operations and commercial contract environments. Certificates of insurance are available
      on request and can be provided directly to principal contractors as part of supply chain
      pre-qualification.</p>
    </div>
    <div class="cp-ins">
      <div class="cp-ins-cell">
        <div class="cp-ins-lbl">Employers' Liability</div>
        <div class="cp-ins-val">£10,000,000</div>
        <div class="cp-ins-note">Per occurrence. As required under the Employers' Liability (Compulsory Insurance) Act 1969.</div>
      </div>
      <div class="cp-ins-cell" style="border-left:1px solid #e5e7eb">
        <div class="cp-ins-lbl">Public Liability</div>
        <div class="cp-ins-val">£1,000,000</div>
        <div class="cp-ins-note">Per occurrence. Scalable to contract requirements — contact us to discuss specific project needs.</div>
      </div>
    </div>
    <div class="cp-ins-notice">
      <div class="cp-ins-notice-body">
        <strong>Documentation available on request.</strong> Insurance certificates can be provided to principal contractors
        as part of supply chain pre-qualification or tender submission. Contact
        <strong>info@askmiro.com</strong> with specific requirements.
      </div>
    </div>
  </div>
  ${pf('06')}
</div>

<!-- ═══════════════════════════════════════════════════════
     07 — WHY ASKMIRO
═══════════════════════════════════════════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('07 &mdash; Why AskMiro')}
  <div class="cp-in">
    <div class="cp-eyebrow">07</div>
    <div class="cp-h">Why AskMiro</div>
    <div class="cp-why">
      ${[
        ['Director involvement on every contract','No account management layers. The person responsible for quality is present, contactable and accountable for the duration of the contract.'],
        ['Built for construction environments','We understand site protocols, CDM obligations, induction requirements and contractor supply chain expectations. We operate on site — not just around it.'],
        ['Rapid London mobilisation','London-based operations enable fast deployment across the capital and surrounding areas. We respond to programme changes without delay or additional cost.'],
        ['Documentation prepared before mobilisation','RAMS, COSHH assessments, insurance certificates and method statements are in place before the contract starts — not after the first issue arises.'],
        ['Transparent reporting and communication','Communication is structured and on schedule. Progress is logged, sign-offs are documented and concerns are escalated immediately.'],
        ['Consistent standard across multi-site programmes','The same management, the same processes and the same standard are applied whether we are cleaning one unit or twenty.'],
        ['Technology-enabled operations','Contract management, scheduling and compliance records are managed through our proprietary operations platform, providing clients with visibility and our team with operational clarity.']
      ].map(([t,b]) => `
      <div class="cp-why-item">
        <div class="cp-why-dot"></div>
        <div class="cp-why-text"><strong>${t}</strong> &mdash; ${b}</div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('07')}
</div>

<!-- ═══════════════════════════════════════════════════════
     08 — CONTACT
═══════════════════════════════════════════════════════ -->
<div class="cp-page">
  <div class="cp-contact-page">
    <div class="cp-eyebrow" style="color:#0D9488;margin-bottom:8px">08</div>
    <div class="cp-contact-title">Get In Touch</div>
    <div class="cp-contact-sub">Direct contact. No call centres, no delays.</div>

    <div class="cp-contact-grid">
      <div>
        <div class="cp-contact-lbl">Website</div>
        <div class="cp-contact-val">www.askmiro.com</div>
      </div>
      <div>
        <div class="cp-contact-lbl">Email</div>
        <div class="cp-contact-val">info@askmiro.com</div>
      </div>
      <div>
        <div class="cp-contact-lbl">Registered Address</div>
        <div class="cp-contact-val" style="font-size:13px">34 Haldane Place<br>London, SW18 4UH<br>England</div>
      </div>
      <div>
        <div class="cp-contact-lbl">Legal Entity</div>
        <div class="cp-contact-val" style="font-size:13px">Miro Partners Ltd<br>Private Limited Company<br>Incorporated 14 March 2025</div>
      </div>
    </div>

    <div class="cp-contact-lock">
      <div style="width:44px;height:44px;background:rgba(13,148,136,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <path d="M8 20L12 12L16 20L20 12L24 20" stroke="#0D9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="cp-contact-lockup-name">AskMiro Cleaning Services</div>
        <div class="cp-contact-lockup-tag">Your Space. Our Responsibility.</div>
      </div>
    </div>

    <div class="cp-contact-legal">
      AskMiro Cleaning Services is a trading name of Miro Partners Ltd. Registered in England and Wales.
      Registered Office: 34 Haldane Place, London, England, SW18 4UH.
      SIC 81100 &mdash; Combined facilities support activities &nbsp;&bull;&nbsp; SIC 81210 &mdash; General cleaning of buildings.<br>
      This document is confidential and intended solely for the use of ${_esc(data.preparedFor)}.
      Prepared: ${_esc(data.date)}.
    </div>
  </div>
</div>

</div>`; /* end cp-doc */

    document.body.appendChild(ov);
    ov.style.display = 'block';
    ov.scrollTop = 0;
  }

  // ── HELPERS ───────────────────────────────────────────────────
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return { render, _tab, saveSettings, openNewUser, saveUser, openProfileModal, _genProfile };
})();
