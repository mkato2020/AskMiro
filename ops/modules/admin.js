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
      },
      {
        icon:'&#128196;',
        title:'Contractor Compliance Pack',
        sub:'15-document H&amp;S and compliance pack — RAMS, COSHH, Method Statement, H&amp;S Policy and more.',
        tag:'Client-facing · 16 pages',
        tagCls:'pg',
        action:"Documents.openPackModal()"
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
    const old = document.getElementById('cp-styles'); if(old) old.remove();
    const s = document.createElement('style');
    s.id = 'cp-styles';
    s.textContent = `
/* === OVERLAY ============================================= */
#cp-overlay{display:none;position:fixed;inset:0;background:#b8bdc6;z-index:99999;overflow-y:auto;padding:44px 0 88px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#1f2937}
#cp-overlay *{box-sizing:border-box;margin:0;padding:0}
.cp-doc{max-width:794px;margin:0 auto}
.cp-page{background:#fff;margin-bottom:6px;position:relative;overflow:hidden}

/* === PRINT TOOLBAR ======================================= */
.cp-bar{max-width:794px;margin:0 auto 22px;display:flex;align-items:center;justify-content:space-between}
.cp-bar-l{display:flex;align-items:center;gap:10px}
.cp-bar-icon{width:30px;height:30px;background:#0D9488;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.cp-bar-name{font-size:13px;font-weight:700;color:#0f172a}
.cp-bar-for{font-size:11px;color:#64748b}
.cp-bar-r{display:flex;gap:7px}
.cp-bar-r button{border:none;cursor:pointer;font-size:12px;font-weight:700;padding:9px 18px;letter-spacing:.01em}
.cp-bar-pdf{background:#0D9488;color:#fff}
.cp-bar-x{background:#dde1e7;color:#475569}

/* === PAGE STRUCTURE ======================================= */
/* inner pages: flex column — header + body-row + footer */
.cp-ip{display:flex;flex-direction:column;min-height:680px}
.cp-ip-ph{display:flex;align-items:center;height:34px;padding:0 28px 0 0;border-bottom:1px solid #e5e7eb;flex-shrink:0;gap:0}
.cp-ip-ph-panel{width:158px;flex-shrink:0;background:#0D1C2E;height:100%;display:flex;align-items:center;padding-left:24px}
.cp-ip-ph-dot{width:5px;height:5px;background:#0D9488;flex-shrink:0}
.cp-ip-ph-rule{flex:1;height:1px;background:#e5e7eb;margin:0 14px}
.cp-ip-ph-ref{font-size:8.5px;color:#94a3b8;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}

/* body row: left panel + right content */
.cp-ip-body{display:flex;flex:1}

/* left panel */
.cp-lp{width:158px;background:#0D1C2E;flex-shrink:0;position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:22px 18px 24px 24px;overflow:hidden}
.cp-lp::before{content:'';position:absolute;top:0;left:0;bottom:0;width:4px;background:#0D9488}
.cp-lp-ghost{font-family:'Outfit',Arial,sans-serif;font-size:96px;font-weight:800;color:rgba(255,255,255,.07);line-height:1;letter-spacing:-.05em;position:absolute;top:10px;left:14px;pointer-events:none;user-select:none}
.cp-lp-bot{position:relative}
.cp-lp-cat{font-size:7.5px;font-weight:700;color:#0D9488;letter-spacing:.2em;text-transform:uppercase;margin-bottom:5px}
.cp-lp-title{font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:800;color:#fff;line-height:1.4;letter-spacing:-.01em}

/* right content */
.cp-rc{flex:1;min-width:0;padding:24px 30px 26px 26px;display:flex;flex-direction:column}
.cp-rc-hd{margin-bottom:16px;padding-bottom:13px;border-bottom:2px solid #0D1C2E}
.cp-rc-ey{font-size:8px;font-weight:700;color:#0D9488;letter-spacing:.16em;text-transform:uppercase;margin-bottom:4px}
.cp-rc-h{font-family:'Outfit',Arial,sans-serif;font-size:19px;font-weight:800;color:#0D1C2E;letter-spacing:-.025em;line-height:1.1}

/* footer */
.cp-ip-pf{display:flex;align-items:center;height:28px;padding:0 28px 0 0;border-top:1px solid #e5e7eb;flex-shrink:0;gap:0}
.cp-ip-pf-panel{width:158px;flex-shrink:0;background:#0D1C2E;height:100%}
.cp-ip-pf-legal{flex:1;font-size:7.5px;color:#94a3b8;padding-left:14px}
.cp-ip-pf-pg{font-size:7.5px;color:#94a3b8;font-weight:600}

/* === BODY TEXT =========================================== */
.cp-lead{font-size:13px;font-weight:600;color:#0D1C2E;line-height:1.72;margin-bottom:15px}
.cp-bt{font-size:11.5px;color:#374151;line-height:1.82}
.cp-bt p{margin-bottom:12px}
.cp-bt p:last-child{margin-bottom:0}

/* === FACTS GRID (About) ================================== */
.cp-facts{display:grid;grid-template-columns:1fr 1fr 1fr;border-top:2px solid #0D1C2E;margin-top:16px}
.cp-fact{padding:13px 12px 13px 0;border-bottom:1px solid #e5e7eb}
.cp-fact:nth-child(n+2){padding-left:14px;border-left:1px solid #e5e7eb}
.cp-fact:nth-child(3n+1){padding-left:0;border-left:none}
.cp-fact-lbl{font-size:7.5px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px}
.cp-fact-val{font-size:11.5px;font-weight:700;color:#0D1C2E;line-height:1.3}

/* === SPECIALISM BLOCK (Services) ========================= */
.cp-spec{background:#0D1C2E;padding:17px 18px;margin-bottom:13px}
.cp-spec-label{font-size:7.5px;font-weight:700;color:#0D9488;letter-spacing:.18em;text-transform:uppercase;margin-bottom:6px}
.cp-spec-title{font-family:'Outfit',Arial,sans-serif;font-size:15px;font-weight:800;color:#fff;margin-bottom:7px;letter-spacing:-.02em}
.cp-spec-body{font-size:11px;color:rgba(255,255,255,.52);line-height:1.78}
.cp-spec-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:11px}
.cp-spec-tag{padding:2px 9px;background:rgba(13,148,136,.15);color:#5eead4;font-size:8.5px;font-weight:700;letter-spacing:.04em}

/* === SERVICE LIST ======================================== */
.cp-svcs{border-top:1px solid #e5e7eb;margin-top:11px}
.cp-svc{display:grid;grid-template-columns:28px 1fr;padding:11px 0;border-bottom:1px solid #f1f5f9;align-items:flex-start}
.cp-svc:last-child{border-bottom:none;padding-bottom:0}
.cp-svc-n{font-family:'Outfit',Arial,sans-serif;font-size:14px;font-weight:800;color:#e5e7eb;line-height:1;padding-top:1px}
.cp-svc-name{font-size:11.5px;font-weight:700;color:#0D1C2E;margin-bottom:2px}
.cp-svc-desc{font-size:10.5px;color:#6b7280;line-height:1.65}

/* === SECTOR TABLE (Sectors) ============================== */
.cp-sec-tbl{border-top:2px solid #0D1C2E;margin-top:12px}
.cp-sec-row{display:grid;grid-template-columns:110px 1fr;border-bottom:1px solid #e5e7eb}
.cp-sec-row:last-child{border-bottom:none}
.cp-sec-key{padding:11px 12px 11px 0;border-right:1px solid #e5e7eb}
.cp-sec-num{font-size:7.5px;font-weight:700;color:#0D9488;letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px}
.cp-sec-name{font-size:11px;font-weight:700;color:#0D1C2E}
.cp-sec-desc{padding:11px 0 11px 14px;font-size:10.5px;color:#374151;line-height:1.7}

/* === APPROACH STEPS ====================================== */
.cp-steps{border-top:2px solid #0D1C2E;margin-top:4px}
.cp-step{display:grid;grid-template-columns:44px 1fr;padding:13px 0;border-bottom:1px solid #f1f5f9;align-items:flex-start}
.cp-step:last-child{border-bottom:none;padding-bottom:0}
.cp-step-n{font-family:'Outfit',Arial,sans-serif;font-size:26px;font-weight:800;color:#e5e7eb;line-height:1}
.cp-step-title{font-size:11.5px;font-weight:700;color:#0D1C2E;margin-bottom:3px}
.cp-step-body{font-size:10.5px;color:#6b7280;line-height:1.72}

/* === H&S TABLE =========================================== */
.cp-hs-tbl{border-top:2px solid #0D1C2E;margin-top:12px}
.cp-hs-row{display:grid;grid-template-columns:96px 46px 1fr;border-bottom:1px solid #e5e7eb}
.cp-hs-row:last-child{border-bottom:none}
.cp-hs-key{padding:11px 10px 11px 0;border-right:1px solid #e5e7eb;font-size:10.5px;font-weight:700;color:#0D1C2E}
.cp-hs-status{padding:11px 6px;border-right:1px solid #e5e7eb;display:flex;align-items:flex-start;justify-content:center}
.cp-hs-badge{padding:2px 5px;background:#0D9488;color:#fff;font-size:7.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
.cp-hs-val{padding:11px 0 11px 12px;font-size:10.5px;color:#374151;line-height:1.72}

/* === INSURANCE =========================================== */
.cp-ins-pair{display:grid;grid-template-columns:1fr 1fr;border-top:2px solid #0D1C2E;margin-top:14px}
.cp-ins-item{padding:20px 14px 16px 0}
.cp-ins-item+.cp-ins-item{padding-left:20px;padding-right:0;border-left:1px solid #e5e7eb}
.cp-ins-lbl{font-size:7.5px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.12em;margin-bottom:9px}
.cp-ins-fig{font-family:'Outfit',Arial,sans-serif;font-size:34px;font-weight:800;color:#0D1C2E;letter-spacing:-.04em;line-height:1;margin-bottom:7px}
.cp-ins-note{font-size:10px;color:#6b7280;line-height:1.7}
.cp-ins-callout{margin-top:14px;padding:11px 14px;border-top:2px solid #059669;background:#f0fdf4;font-size:10.5px;color:#065f46;line-height:1.72}

/* === WHY GRID ============================================ */
.cp-why-grid{display:grid;grid-template-columns:1fr 1fr;border-top:2px solid #0D1C2E;margin-top:4px}
.cp-why-cell{padding:13px 14px 13px 0;border-bottom:1px solid #e5e7eb}
.cp-why-cell:nth-child(even){padding-left:16px;padding-right:0;border-left:1px solid #e5e7eb}
.cp-why-n{font-family:'Outfit',Arial,sans-serif;font-size:17px;font-weight:800;color:#e5e7eb;line-height:1;margin-bottom:5px}
.cp-why-title{font-size:11px;font-weight:700;color:#0D1C2E;line-height:1.35;margin-bottom:3px}
.cp-why-body{font-size:10px;color:#6b7280;line-height:1.65}

/* === COVER =============================================== */
.cp-cover{background:#0D1C2E;min-height:680px;display:flex;flex-direction:column}
.cp-cover-bar{height:8px;background:#0D9488;flex-shrink:0}
.cp-cover-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 60px 40px;text-align:center}
.cp-logo-wrap{display:flex;flex-direction:column;align-items:center;margin-bottom:44px}
.cp-logo-box{width:84px;height:84px;border:1px solid rgba(13,148,136,.32);background:rgba(13,148,136,.09);display:flex;align-items:center;justify-content:center;margin-bottom:22px}
.cp-logo-wm{font-family:'Outfit',Arial,sans-serif;font-size:48px;font-weight:800;letter-spacing:-.03em;line-height:1;margin-bottom:10px}
.cp-logo-ask{color:rgba(255,255,255,.9)}
.cp-logo-miro{color:#0D9488}
.cp-logo-sub{font-size:9.5px;color:rgba(255,255,255,.28);letter-spacing:.3em;text-transform:uppercase}
.cp-cover-rule{width:34px;height:2px;background:#0D9488;margin:0 auto 20px}
.cp-cover-type{font-size:9.5px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.24em;text-transform:uppercase}
.cp-cover-foot{flex-shrink:0;border-top:1px solid rgba(255,255,255,.07);padding:20px 48px;display:flex;justify-content:space-between;align-items:flex-end}
.cp-cff-lbl{font-size:8px;font-weight:700;color:#0D9488;letter-spacing:.14em;text-transform:uppercase;margin-bottom:5px}
.cp-cff-val{font-size:15px;font-weight:700;color:#fff;line-height:1.2;letter-spacing:-.01em}
.cp-cff-meta{font-size:9.5px;color:rgba(255,255,255,.26);margin-top:4px}

/* === CONTACT PAGE (dark) ================================= */
.cp-ip.cp-dark{background:#0D1C2E}
.cp-dark .cp-ip-ph{border-bottom-color:rgba(255,255,255,.07);background:#0D1C2E}
.cp-dark .cp-ip-ph-panel{background:rgba(0,0,0,.25)}
.cp-dark .cp-ip-ph-rule{background:rgba(255,255,255,.07)}
.cp-dark .cp-ip-ph-ref{color:rgba(255,255,255,.2)}
.cp-dark .cp-lp{background:rgba(0,0,0,.25)}
.cp-dark .cp-rc{background:#0D1C2E}
.cp-dark .cp-ip-pf{border-top-color:rgba(255,255,255,.07)}
.cp-dark .cp-ip-pf-panel{background:rgba(0,0,0,.25)}
.cp-dark .cp-ip-pf-legal,.cp-dark .cp-ip-pf-pg{color:rgba(255,255,255,.18)}
.cp-clogo{display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,.07)}
.cp-clogo-icon{width:40px;height:40px;border:1px solid rgba(13,148,136,.28);background:rgba(13,148,136,.09);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cp-clogo-name{font-family:'Outfit',Arial,sans-serif;font-size:15px;font-weight:800;color:#fff;letter-spacing:-.02em}
.cp-clogo-name em{color:#0D9488;font-style:normal}
.cp-clogo-sub{font-size:8px;color:rgba(255,255,255,.26);letter-spacing:.16em;text-transform:uppercase;margin-top:3px}
.cp-cgrid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid rgba(255,255,255,.07)}
.cp-cgrid-cell{padding:15px 16px 15px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.cp-cgrid-cell:nth-child(even){padding-left:18px;padding-right:0;border-left:1px solid rgba(255,255,255,.06)}
.cp-cgrid-lbl{font-size:7.5px;font-weight:700;color:#0D9488;letter-spacing:.16em;text-transform:uppercase;margin-bottom:5px}
.cp-cgrid-val{font-size:12px;color:#fff;font-weight:600;line-height:1.65}
.cp-clegal{margin-top:auto;padding-top:16px;border-top:1px solid rgba(255,255,255,.06);font-size:8px;color:rgba(255,255,255,.18);line-height:2}

/* === PRINT =============================================== */
@page{size:A4 portrait;margin:0}
@media print{
  body>*:not(#cp-overlay){display:none!important}
  #cp-overlay{display:block!important;position:static!important;padding:0;background:transparent;overflow:visible}
  #cp-overlay .no-print{display:none!important}
  .cp-doc{max-width:100%;margin:0}
  .cp-page{margin:0;overflow:hidden;break-after:page}
  /* Full A4 height so flex children stretch correctly */
  .cp-cover{min-height:0;height:297mm}
  .cp-ip{min-height:0;height:297mm}
  /* Let body row fill remaining height between header and footer bars */
  .cp-ip-body{min-height:0;flex:1}
  /* Force all backgrounds to print — covers left panel, spec blocks, dark pages */
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
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

    const wi = (sz=14) =>
      `<svg width="${sz}" height="${sz}" viewBox="0 0 32 32" fill="none"><path d="M8 20L12 12L16 20L20 12L24 20" stroke="#0D9488" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    // page header bar (spans full width, left panel tinted + rule + section ref)
    const ph = (ref) => `
<div class="cp-ip-ph">
  <div class="cp-ip-ph-panel">${wi(11)}</div>
  <div class="cp-ip-ph-rule"></div>
  <div class="cp-ip-ph-ref">${ref}</div>
</div>`;

    // left panel (ghost number + category label + title at bottom)
    const lp = (num, cat, title) => `
<div class="cp-lp">
  <div class="cp-lp-ghost">${num}</div>
  <div class="cp-lp-bot">
    <div class="cp-lp-cat">${cat}</div>
    <div class="cp-lp-title">${title}</div>
  </div>
</div>`;

    // page footer bar
    const pf = (pg) => `
<div class="cp-ip-pf">
  <div class="cp-ip-pf-panel"></div>
  <div class="cp-ip-pf-legal">Miro Partners Ltd t/a AskMiro Cleaning Services &nbsp;&bull;&nbsp; Confidential &nbsp;&bull;&nbsp; ${_esc(data.preparedFor)}</div>
  <div class="cp-ip-pf-pg">${pg} / 08</div>
</div>`;

    // section heading inside right content
    const rh = (ey, h) => `
<div class="cp-rc-hd">
  <div class="cp-rc-ey">${ey}</div>
  <div class="cp-rc-h">${h}</div>
</div>`;

    ov.innerHTML = `

<!-- PRINT BAR -->
<div class="cp-bar no-print">
  <div class="cp-bar-l">
    <div class="cp-bar-icon">${wi(16)}</div>
    <div>
      <div class="cp-bar-name">AskMiro &mdash; Company Profile</div>
      <div class="cp-bar-for">Prepared for ${_esc(data.preparedFor)}</div>
    </div>
  </div>
  <div class="cp-bar-r">
    <button class="cp-bar-pdf" onclick="window.print()">&#x2913;&nbsp; Save as PDF</button>
    <button class="cp-bar-x" onclick="document.getElementById('cp-overlay').remove()">&#x2715;&nbsp; Close</button>
  </div>
</div>

<div class="cp-doc">

<!-- ═══ COVER ═══════════════════════════════════════════════ -->
<div class="cp-page cp-cover">
  <div class="cp-cover-bar"></div>
  <div class="cp-cover-body">
    <div class="cp-logo-wrap">
      <div class="cp-logo-box">
        <svg width="46" height="46" viewBox="0 0 32 32" fill="none">
          <path d="M8 20L12 12L16 20L20 12L24 20" stroke="#0D9488" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="cp-logo-wm"><span class="cp-logo-ask">Ask</span><span class="cp-logo-miro">Miro</span></div>
      <div class="cp-logo-sub">Cleaning Services</div>
    </div>
    <div class="cp-cover-rule"></div>
    <div class="cp-cover-type">Company Profile &nbsp;&bull;&nbsp; Capability Statement</div>
  </div>
  <div class="cp-cover-foot">
    <div>
      <div class="cp-cff-lbl">Prepared For</div>
      <div class="cp-cff-val">${_esc(data.preparedFor)}</div>
      ${data.attn ? `<div class="cp-cff-meta">Att: ${_esc(data.attn)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="cp-cff-lbl">Date</div>
      <div class="cp-cff-val">${_esc(data.date)}</div>
      <div class="cp-cff-meta">${data.ref ? `Ref: ${_esc(data.ref)}` : 'Company Profile'}</div>
    </div>
  </div>
</div>

<!-- ═══ 01 — ABOUT ══════════════════════════════════════════ -->
<div class="cp-page cp-ip">
  ${ph('01 &mdash; About')}
  <div class="cp-ip-body">
    ${lp('01','Company Overview','About AskMiro')}
    <div class="cp-rc">
      ${rh('About Us','AskMiro Cleaning Services')}
      <div class="cp-lead">A London-based commercial cleaning contractor delivering precision-led services across construction, commercial and managed property environments.</div>
      <div class="cp-bt">
        <p>Operated under Miro Partners Ltd and director-led from inception, we combine operational rigour with responsive on-site management to meet the demands of high-value projects and long-term maintenance contracts. Every engagement is managed directly — with structured communication, documented processes and accountability at every stage.</p>
        <p>Our work spans all stages of construction cleaning — first fix through to sparkle clean and developer handover — as well as ongoing commercial maintenance contracts across London. We understand site protocols, contractor supply chains and the standards expected at practical completion.</p>
      </div>
      <div class="cp-facts">
        ${[
          ['Incorporated','14 March 2025'],
          ['Legal Entity','Miro Partners Ltd'],
          ['SIC Codes','81100 &middot; 81210'],
          ['Location','London, England'],
          ['Structure','Private Limited'],
          ['Operations','Director-Led']
        ].map(([l,v]) => `<div class="cp-fact"><div class="cp-fact-lbl">${l}</div><div class="cp-fact-val">${v}</div></div>`).join('')}
      </div>
    </div>
  </div>
  ${pf('01')}
</div>

<!-- ═══ 02 — SERVICES ═══════════════════════════════════════ -->
<div class="cp-page cp-ip">
  ${ph('02 &mdash; Core Services')}
  <div class="cp-ip-body">
    ${lp('02','What We Do','Core Services')}
    <div class="cp-rc">
      ${rh('02','Core Services')}
      <div class="cp-spec">
        <div class="cp-spec-label">Primary Specialism</div>
        <div class="cp-spec-title">Builders Cleans</div>
        <div class="cp-spec-body">AskMiro specialises in builders cleans across all stages of construction — first fix, sparkle clean and handover. We understand CDM protocols, site induction requirements and the precision expected at practical completion, including UPVC wiping, paint removal, dust clearance and full sanitisation to developer specification.</div>
        <div class="cp-spec-tags">
          ${['First Fix','Sparkle Clean','Handover Clean','UPVC &amp; Glazing','Paint Removal','Developer Sign-off']
            .map(t=>`<span class="cp-spec-tag">${t}</span>`).join('')}
        </div>
      </div>
      <div class="cp-svcs">
        ${[
          ['02','Commercial Cleaning','Scheduled and reactive programmes for offices, retail units and commercial premises — with documented quality checks and consistent reporting.'],
          ['03','Communal Areas','Residential developments, managed buildings and multi-occupancy properties. Maintained to lease specification with reliable scheduling.'],
          ['04','Deep Cleaning','End-of-tenancy, pre-occupation and periodic reset programmes. Full degreasing, sanitisation and surface restoration to commercial standard.'],
          ['05','Sector-Specific','Automotive showrooms, educational facilities and food-safe environments with full COSHH and PPE protocols applied as standard.']
        ].map(([n,name,desc])=>`
        <div class="cp-svc">
          <div class="cp-svc-n">${n}</div>
          <div><div class="cp-svc-name">${name}</div><div class="cp-svc-desc">${desc}</div></div>
        </div>`).join('')}
      </div>
    </div>
  </div>
  ${pf('02')}
</div>

<!-- ═══ 03 — SECTORS ════════════════════════════════════════ -->
<div class="cp-page cp-ip">
  ${ph('03 &mdash; Sectors')}
  <div class="cp-ip-body">
    ${lp('03','Markets','Sectors We Serve')}
    <div class="cp-rc">
      ${rh('03','Sectors We Serve')}
      <div class="cp-lead">We operate across a broad range of environments. The same management framework, compliance standards and quality controls apply to every contract, regardless of sector or scale.</div>
      <div class="cp-sec-tbl">
        ${[
          ['01','Construction','Active sites, new-build residential and commercial developments, phased handovers and snagging-phase preparation. Full CDM compliance as standard on every contract.'],
          ['02','Commercial','Grade A offices, multi-tenanted buildings, reception areas, washrooms and back-of-house. Daily and periodic programmes structured to occupier requirements.'],
          ['03','Property Mgmt','Communal areas, lift lobbies, stairwells and car parks within residential and mixed-use developments. Maintained to lease specification and developer standard.'],
          ['04','Education','Schools, academies and further education facilities. Term-time scheduled programmes and holiday deep-clean contracts with appropriate access management.'],
          ['05','Automotive','Showroom preparation, forecourt maintenance and display area cleaning to manufacturer presentation standards.'],
          ['06','Industrial','Warehouses, distribution centres and light industrial units. Hard floor maintenance, high-bay cleaning and ad hoc reactive programmes.']
        ].map(([num,name,desc])=>`
        <div class="cp-sec-row">
          <div class="cp-sec-key"><div class="cp-sec-num">${num}</div><div class="cp-sec-name">${name}</div></div>
          <div class="cp-sec-desc">${desc}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>
  ${pf('03')}
</div>

<!-- ═══ 04 — APPROACH ═══════════════════════════════════════ -->
<div class="cp-page cp-ip">
  ${ph('04 &mdash; Our Approach')}
  <div class="cp-ip-body">
    ${lp('04','How We Work','Our Approach')}
    <div class="cp-rc">
      ${rh('04','Our Approach')}
      <div class="cp-steps">
        ${[
          ['Director-Led Operations','Every contract is overseen directly by company directors. No unmanaged subcontracted labour sits between our directors and the work on site. Accountability sits at the top.'],
          ['Precision on Site','We operate to the standard expected on high-value construction and commercial contracts. Pre-clean briefings, sign-off checklists and photographic records are standard — not an upgrade.'],
          ['Structured Communication','Response times are defined and adhered to. Progress is communicated proactively. Issues are escalated fast. Clients do not need to chase us.'],
          ['Operational Flexibility','Construction programmes change. Handover dates move. We structure our scheduling to absorb these changes without penalty to the client or compromise to output.'],
          ['Compliance by Default','RAMS, COSHH and PPE protocols are prepared before mobilisation and maintained throughout. We operate as a professional contractor from day one on every contract.']
        ].map(([title,body],i)=>`
        <div class="cp-step">
          <div class="cp-step-n">${String(i+1).padStart(2,'0')}</div>
          <div><div class="cp-step-title">${title}</div><div class="cp-step-body">${body}</div></div>
        </div>`).join('')}
      </div>
    </div>
  </div>
  ${pf('04')}
</div>

<!-- ═══ 05 — H&S ════════════════════════════════════════════ -->
<div class="cp-page cp-ip">
  ${ph('05 &mdash; Health, Safety &amp; Compliance')}
  <div class="cp-ip-body">
    ${lp('05','Compliance','Health, Safety &amp; Compliance')}
    <div class="cp-rc">
      ${rh('05','Health, Safety &amp; Compliance')}
      <div class="cp-bt" style="margin-bottom:12px">
        <p>AskMiro operates within a full health and safety management framework appropriate for construction and commercial contract environments. All operatives work under documented risk controls, and all client-facing sites receive site-specific documentation prior to mobilisation.</p>
      </div>
      <div class="cp-hs-tbl">
        ${[
          ['RAMS','Active','Risk Assessments and Method Statements produced for all site operations. Site-specific RAMS issued in advance of mobilisation and updated for any scope or access changes.'],
          ['COSHH','Active','Full assessments maintained for all chemicals in use. Product data sheets held on file. All operatives receive product-specific briefings before use on site.'],
          ['PPE','Active','Appropriate PPE issued and enforced relative to site and task. Compliance managed directly and documented within site records on every contract.'],
          ['Site Inductions','Active','All operatives complete inductions as required under contractor protocols. Induction records maintained — no operative enters site without completing the process.'],
          ['Incident Reporting','Active','Near-misses, incidents and observations recorded, reviewed and acted upon. RIDDOR-compliant procedures in operation. Records available for inspection at any time.'],
          ['UK Standards','Compliant','Full compliance with HASAWA 1974, Management Regulations 1999 and CDM 2015 (where applicable). ISO-aligned working practices applied throughout.']
        ].map(([key,badge,val])=>`
        <div class="cp-hs-row">
          <div class="cp-hs-key">${key}</div>
          <div class="cp-hs-status"><span class="cp-hs-badge">${badge}</span></div>
          <div class="cp-hs-val">${val}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>
  ${pf('05')}
</div>

<!-- ═══ 06 — INSURANCE ══════════════════════════════════════ -->
<div class="cp-page cp-ip">
  ${ph('06 &mdash; Insurance')}
  <div class="cp-ip-body">
    ${lp('06','Cover','Insurance')}
    <div class="cp-rc">
      ${rh('06','Insurance')}
      <div class="cp-bt">
        <p>AskMiro Cleaning Services carries full commercial insurance appropriate for both construction site operations and commercial contract environments. Certificates are available on request and provided directly to principal contractors as part of supply chain pre-qualification.</p>
      </div>
      <div class="cp-ins-pair">
        <div class="cp-ins-item">
          <div class="cp-ins-lbl">Employers&rsquo; Liability Insurance</div>
          <div class="cp-ins-fig">£10,000,000</div>
          <div class="cp-ins-note">Per occurrence. As required under the Employers' Liability (Compulsory Insurance) Act 1969. Covers all employed operatives across all active sites.</div>
        </div>
        <div class="cp-ins-item">
          <div class="cp-ins-lbl">Public Liability Insurance</div>
          <div class="cp-ins-fig">£1,000,000</div>
          <div class="cp-ins-note">Per occurrence. Scalable to contract requirements. Contact us to discuss project insurance requirements prior to contract award.</div>
        </div>
      </div>
      <div class="cp-ins-callout">
        <strong>Certificates available on request</strong> — provided to principal contractors for supply chain pre-qualification or tender submission. Contact <strong>info@askmiro.com</strong> with specific requirements.
      </div>
    </div>
  </div>
  ${pf('06')}
</div>

<!-- ═══ 07 — WHY ASKMIRO ════════════════════════════════════ -->
<div class="cp-page cp-ip">
  ${ph('07 &mdash; Why AskMiro')}
  <div class="cp-ip-body">
    ${lp('07','Differentiators','Why AskMiro')}
    <div class="cp-rc">
      ${rh('07','Why AskMiro')}
      <div class="cp-why-grid">
        ${[
          ['Director on every contract','No account management layers. The person responsible for quality is present, contactable and accountable throughout the contract.'],
          ['Built for construction','We understand CDM obligations, site protocols, induction requirements and contractor supply chain expectations.'],
          ['Rapid London mobilisation','London-based operations enable fast deployment across the capital without delay or additional cost.'],
          ['Documentation before start','RAMS, COSHH, insurance certificates and method statements in place before mobilisation — not after the first issue arises.'],
          ['Structured reporting','Communication is on schedule. Progress is logged, sign-offs documented and concerns escalated immediately.'],
          ['Consistent multi-site standard','The same management, processes and standard applied whether cleaning one unit or twenty.'],
          ['Technology-enabled','Contracts, scheduling and compliance managed through our proprietary platform — full visibility for clients and team.'],
          ['Zero management overhead','Briefed once, we manage our team, programme and compliance independently. No hand-holding required.']
        ].map(([t,b],i)=>`
        <div class="cp-why-cell">
          <div class="cp-why-n">${String(i+1).padStart(2,'0')}</div>
          <div class="cp-why-title">${t}</div>
          <div class="cp-why-body">${b}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>
  ${pf('07')}
</div>

<!-- ═══ 08 — CONTACT ════════════════════════════════════════ -->
<div class="cp-page cp-ip cp-dark">
  ${ph('08 &mdash; Contact')}
  <div class="cp-ip-body">
    ${lp('08','Contact Us','Get In Touch')}
    <div class="cp-rc">
      <div class="cp-clogo">
        <div class="cp-clogo-icon">${wi(22)}</div>
        <div>
          <div class="cp-clogo-name"><em>Ask</em>Miro Cleaning Services</div>
          <div class="cp-clogo-sub">Your Space. Our Responsibility.</div>
        </div>
      </div>
      <div class="cp-cgrid">
        <div class="cp-cgrid-cell">
          <div class="cp-cgrid-lbl">Website</div>
          <div class="cp-cgrid-val">www.askmiro.com</div>
        </div>
        <div class="cp-cgrid-cell">
          <div class="cp-cgrid-lbl">Email</div>
          <div class="cp-cgrid-val">info@askmiro.com</div>
        </div>
        <div class="cp-cgrid-cell">
          <div class="cp-cgrid-lbl">Registered Address</div>
          <div class="cp-cgrid-val">34 Haldane Place<br>London SW18 4UH<br>England</div>
        </div>
        <div class="cp-cgrid-cell">
          <div class="cp-cgrid-lbl">Legal Entity</div>
          <div class="cp-cgrid-val">Miro Partners Ltd<br>Private Limited Company<br>Incorporated 14 March 2025</div>
        </div>
      </div>
      <div class="cp-clegal">
        AskMiro Cleaning Services is a trading name of Miro Partners Ltd. Registered in England and Wales.
        Registered Office: 34 Haldane Place, London, England, SW18 4UH.
        SIC 81100 &mdash; Combined facilities support activities &nbsp;&bull;&nbsp; SIC 81210 &mdash; General cleaning of buildings.<br>
        This document is confidential and prepared solely for ${_esc(data.preparedFor)}.${data.date ? ` Date: ${_esc(data.date)}.` : ''}
      </div>
    </div>
  </div>
  ${pf('08')}
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
