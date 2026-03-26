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
    if (document.getElementById('cp-styles')) return;
    const s = document.createElement('style');
    s.id = 'cp-styles';
    s.textContent = `
/* ─── OVERLAY ─────────────────────────────────────────── */
#cp-overlay{display:none;position:fixed;inset:0;background:#c9ced6;z-index:99999;overflow-y:auto;padding:40px 0 80px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#1f2937}
#cp-overlay *{box-sizing:border-box;margin:0;padding:0}

/* ─── DOCUMENT SHELL ───────────────────────────────────── */
.cp-doc{max-width:794px;margin:0 auto}
.cp-page{background:#fff;margin-bottom:5px;position:relative;overflow:hidden}

/* ─── PRINT TOOLBAR ────────────────────────────────────── */
.cp-bar{max-width:794px;margin:0 auto 20px;display:flex;align-items:center;justify-content:space-between;padding:0 2px}
.cp-bar-left{display:flex;align-items:center;gap:12px}
.cp-bar-icon{width:28px;height:28px;background:#0D9488;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cp-bar-title{font-size:13px;font-weight:700;color:#0f172a}
.cp-bar-sub{font-size:11px;color:#64748b}
.cp-bar-actions{display:flex;gap:8px}
.cp-bar button{border:none;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.01em;padding:9px 20px}
.cp-btn-pdf{background:#0D9488;color:#fff}
.cp-btn-close{background:#e2e8f0;color:#475569}

/* ─── TEAL LEFT RULE — inner pages ─────────────────────── */
.cp-inner-page::before{content:'';position:absolute;top:0;left:0;bottom:0;width:4px;background:#0D9488}

/* ─── PAGE HEADER ───────────────────────────────────────── */
.cp-ph{display:flex;align-items:center;padding:11px 52px 11px 66px;border-bottom:1px solid #e5e7eb;gap:10px}
.cp-ph-logo{display:flex;align-items:center;gap:7px;flex-shrink:0}
.cp-ph-logo-icon{width:18px;height:18px;background:#0D9488;display:flex;align-items:center;justify-content:center}
.cp-ph-brand{font-size:9.5px;font-weight:700;color:#0D1C2E;letter-spacing:.02em;white-space:nowrap}
.cp-ph-brand em{color:#0D9488;font-style:normal}
.cp-ph-rule{flex:1;height:1px;background:#e5e7eb}
.cp-ph-sec{font-size:9px;color:#94a3b8;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}

/* ─── PAGE FOOTER ───────────────────────────────────────── */
.cp-pf{display:flex;align-items:center;justify-content:space-between;padding:10px 52px 10px 66px;border-top:1px solid #e5e7eb}
.cp-pf-legal{font-size:8.5px;color:#94a3b8}
.cp-pf-pg{font-size:8.5px;color:#94a3b8;font-variant-numeric:tabular-nums}

/* ─── SECTION HEADER BAND ───────────────────────────────── */
.cp-sh{background:#0D1C2E;padding:20px 52px 20px 66px;display:flex;align-items:center;gap:0}
.cp-sh-num{font-size:9px;font-weight:800;color:#0D9488;letter-spacing:.18em;text-transform:uppercase;flex-shrink:0;margin-right:16px;padding-top:1px}
.cp-sh-sep{width:1px;height:14px;background:rgba(255,255,255,.12);flex-shrink:0;margin-right:16px}
.cp-sh-title{font-family:'Outfit',Arial,sans-serif;font-size:18px;font-weight:800;color:#fff;letter-spacing:-.025em;line-height:1}

/* ─── INNER CONTENT PAD ─────────────────────────────────── */
.cp-in{padding:28px 52px 32px 66px}

/* ─── BODY TEXT ─────────────────────────────────────────── */
.cp-lead{font-size:13.5px;color:#0D1C2E;font-weight:600;line-height:1.72;margin-bottom:18px}
.cp-body{font-size:12.5px;color:#374151;line-height:1.82}
.cp-body p{margin-bottom:13px}
.cp-body p:last-child{margin-bottom:0}

/* ─── COMPANY FACTS ─────────────────────────────────────── */
.cp-facts{display:grid;grid-template-columns:repeat(3,1fr);margin-top:24px;border-top:2px solid #0D1C2E}
.cp-fact{padding:14px 16px 14px 0;border-bottom:1px solid #e5e7eb}
.cp-fact:nth-child(3n+2){padding-left:18px;border-left:1px solid #e5e7eb}
.cp-fact:nth-child(3n){padding-left:18px;border-left:1px solid #e5e7eb}
.cp-fact-lbl{font-size:8.5px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.12em;margin-bottom:5px}
.cp-fact-val{font-size:12px;font-weight:700;color:#0D1C2E;line-height:1.35}

/* ─── SPECIALISM BLOCK ──────────────────────────────────── */
.cp-spec{background:#0D1C2E;padding:24px 26px 24px 26px;margin-bottom:18px;border-left:4px solid #0D9488}
.cp-spec-eyebrow{font-size:8.5px;font-weight:700;color:#0D9488;letter-spacing:.16em;text-transform:uppercase;margin-bottom:8px}
.cp-spec-title{font-family:'Outfit',Arial,sans-serif;font-size:17px;font-weight:800;color:#fff;margin-bottom:9px;letter-spacing:-.02em}
.cp-spec-body{font-size:12px;color:rgba(255,255,255,.58);line-height:1.78}
.cp-spec-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.cp-spec-tag{padding:3px 10px;background:rgba(13,148,136,.15);color:#5eead4;font-size:9.5px;font-weight:700;letter-spacing:.05em}

/* ─── SERVICE LIST ──────────────────────────────────────── */
.cp-svcs{border-top:1px solid #e5e7eb}
.cp-svc-row{display:grid;grid-template-columns:40px 1fr;gap:0;align-items:flex-start;padding:15px 0;border-bottom:1px solid #f1f5f9}
.cp-svc-row:last-child{border-bottom:none;padding-bottom:0}
.cp-svc-n{font-family:'Outfit',Arial,sans-serif;font-size:16px;font-weight:800;color:#e2e8f0;padding-top:1px;line-height:1}
.cp-svc-name{font-size:12.5px;font-weight:700;color:#0D1C2E;margin-bottom:3px}
.cp-svc-desc{font-size:11.5px;color:#6b7280;line-height:1.65}

/* ─── SECTOR GRID ───────────────────────────────────────── */
.cp-sectors{display:grid;grid-template-columns:1fr 1fr;margin-top:20px;border-top:2px solid #0D1C2E}
.cp-sector{padding:16px 20px 16px 0;border-bottom:1px solid #e5e7eb}
.cp-sector:nth-child(even){padding-left:22px;padding-right:0;border-left:1px solid #e5e7eb}
.cp-sector-num{font-size:8.5px;font-weight:700;color:#0D9488;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
.cp-sector-name{font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:800;color:#0D1C2E;margin-bottom:5px;letter-spacing:-.01em}
.cp-sector-body{font-size:11px;color:#6b7280;line-height:1.68}

/* ─── APPROACH STEPS ────────────────────────────────────── */
.cp-steps{border-top:2px solid #0D1C2E}
.cp-step{display:grid;grid-template-columns:52px 1fr;align-items:flex-start;padding:16px 0;border-bottom:1px solid #f1f5f9}
.cp-step:last-child{border-bottom:none;padding-bottom:0}
.cp-step-num{font-family:'Outfit',Arial,sans-serif;font-size:30px;font-weight:800;color:#e2e8f0;line-height:1;padding-top:1px}
.cp-step-title{font-size:12.5px;font-weight:700;color:#0D1C2E;margin-bottom:4px}
.cp-step-body{font-size:11.5px;color:#6b7280;line-height:1.7}

/* ─── COMPLIANCE TABLE ──────────────────────────────────── */
.cp-comps{border-top:2px solid #0D1C2E}
.cp-comp-row{display:grid;grid-template-columns:130px 1fr;border-bottom:1px solid #e5e7eb}
.cp-comp-row:last-child{border-bottom:none}
.cp-comp-key{padding:14px 16px 14px 0;border-right:1px solid #e5e7eb}
.cp-comp-key-label{font-size:10.5px;font-weight:700;color:#0D1C2E;letter-spacing:-.01em;margin-bottom:6px}
.cp-comp-key-badge{display:inline-block;padding:2px 8px;background:#0D9488;color:#fff;font-size:8.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.cp-comp-val{padding:14px 0 14px 20px;font-size:11.5px;color:#374151;line-height:1.72}

/* ─── INSURANCE ─────────────────────────────────────────── */
.cp-ins-row{display:grid;grid-template-columns:1fr 1fr;border-top:2px solid #0D1C2E;border-bottom:1px solid #e5e7eb;margin-top:16px}
.cp-ins-cell{padding:28px 0 24px 0}
.cp-ins-cell+.cp-ins-cell{padding-left:32px;border-left:1px solid #e5e7eb}
.cp-ins-lbl{font-size:8.5px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px}
.cp-ins-val{font-family:'Outfit',Arial,sans-serif;font-size:38px;font-weight:800;color:#0D1C2E;letter-spacing:-.04em;line-height:1;margin-bottom:8px}
.cp-ins-note{font-size:11px;color:#6b7280;line-height:1.68}
.cp-ins-notice{margin-top:18px;padding:14px 18px;border-top:2px solid #059669;background:#f0fdf4}
.cp-ins-notice-body{font-size:11.5px;color:#065f46;line-height:1.72}

/* ─── WHY GRID ──────────────────────────────────────────── */
.cp-why-grid{display:grid;grid-template-columns:1fr 1fr;border-top:2px solid #0D1C2E}
.cp-why-item{padding:16px 20px 16px 0;border-bottom:1px solid #e5e7eb}
.cp-why-item:nth-child(even){padding-left:22px;padding-right:0;border-left:1px solid #e5e7eb}
.cp-why-n{font-family:'Outfit',Arial,sans-serif;font-size:20px;font-weight:800;color:#e2e8f0;line-height:1;margin-bottom:7px}
.cp-why-title{font-size:12px;font-weight:700;color:#0D1C2E;line-height:1.4;margin-bottom:4px}
.cp-why-desc{font-size:11px;color:#6b7280;line-height:1.65}

/* ─── COVER ─────────────────────────────────────────────── */
.cp-cover{background:#0D1C2E;min-height:640px;display:flex;flex-direction:column;padding:0}
.cp-cover-accent{height:8px;background:#0D9488;flex-shrink:0}
.cp-cover-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:52px 60px 36px;text-align:center}

/* Logo mark */
.cp-mark{display:flex;flex-direction:column;align-items:center;margin-bottom:44px}
.cp-mark-icon-wrap{width:80px;height:80px;border:1px solid rgba(13,148,136,.3);background:rgba(13,148,136,.1);display:flex;align-items:center;justify-content:center;margin-bottom:20px}
.cp-mark-wordmark{font-family:'Outfit',Arial,sans-serif;font-size:46px;font-weight:800;letter-spacing:-.03em;line-height:1;margin-bottom:8px}
.cp-mark-ask{color:rgba(255,255,255,.92)}
.cp-mark-miro{color:#0D9488}
.cp-mark-sub{font-size:10px;color:rgba(255,255,255,.32);letter-spacing:.26em;text-transform:uppercase}

.cp-cover-divider{width:36px;height:2px;background:#0D9488;margin:0 auto 22px}
.cp-cover-doc-label{font-size:10px;font-weight:700;color:rgba(255,255,255,.42);letter-spacing:.22em;text-transform:uppercase}

/* Cover footer */
.cp-cover-foot{border-top:1px solid rgba(255,255,255,.07);padding:22px 52px;display:flex;justify-content:space-between;align-items:flex-end;flex-shrink:0}
.cp-cff-lbl{font-size:8.5px;font-weight:700;color:#0D9488;letter-spacing:.14em;text-transform:uppercase;margin-bottom:5px}
.cp-cff-val{font-size:15px;font-weight:700;color:#fff;line-height:1.25;letter-spacing:-.01em}
.cp-cff-meta{font-size:10px;color:rgba(255,255,255,.28);margin-top:4px}

/* ─── CONTACT PAGE ──────────────────────────────────────── */
.cp-contact-wrap{background:#0D1C2E;position:relative;overflow:hidden}
.cp-contact-wrap::before{content:'';position:absolute;top:0;left:0;bottom:0;width:4px;background:#0D9488}

.cp-contact-top{padding:26px 52px 22px 66px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between}
.cp-contact-mark{display:flex;align-items:center;gap:12px}
.cp-contact-mark-icon{width:38px;height:38px;border:1px solid rgba(13,148,136,.3);background:rgba(13,148,136,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cp-contact-mark-name{font-family:'Outfit',Arial,sans-serif;font-size:17px;font-weight:800;color:#fff;letter-spacing:-.02em}
.cp-contact-mark-name em{color:#0D9488;font-style:normal}
.cp-contact-mark-sub{font-size:9px;color:rgba(255,255,255,.3);letter-spacing:.14em;text-transform:uppercase;margin-top:3px}
.cp-contact-doc-label{font-size:9px;font-weight:700;color:#0D9488;letter-spacing:.14em;text-transform:uppercase}

.cp-contact-grid{display:grid;grid-template-columns:1fr 1fr;padding:0 52px 0 66px}
.cp-contact-cell{padding:20px 20px 20px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.cp-contact-cell:nth-child(even){padding-left:28px;padding-right:0;border-left:1px solid rgba(255,255,255,.06)}
.cp-contact-lbl{font-size:8.5px;font-weight:700;color:#0D9488;letter-spacing:.14em;text-transform:uppercase;margin-bottom:7px}
.cp-contact-val{font-size:13px;color:#fff;font-weight:600;line-height:1.65}

.cp-contact-legal{padding:18px 52px 28px 66px;font-size:9px;color:rgba(255,255,255,.2);line-height:2;border-top:1px solid rgba(255,255,255,.06)}

/* ─── PRINT ─────────────────────────────────────────────── */
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

    const waveIcon = (sz=14) =>
      `<svg width="${sz}" height="${sz}" viewBox="0 0 32 32" fill="none"><path d="M8 20L12 12L16 20L20 12L24 20" stroke="#0D9488" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const ph = (sec) => `
<div class="cp-ph">
  <div class="cp-ph-logo">
    <div class="cp-ph-logo-icon">${waveIcon(11)}</div>
    <div class="cp-ph-brand"><em>Ask</em>Miro Cleaning Services</div>
  </div>
  <div class="cp-ph-rule"></div>
  <div class="cp-ph-sec">${sec}</div>
</div>`;

    const pf = (pg) => `
<div class="cp-pf">
  <div class="cp-pf-legal">Miro Partners Ltd t/a AskMiro Cleaning Services &nbsp;&bull;&nbsp; Confidential &nbsp;&bull;&nbsp; Prepared for ${_esc(data.preparedFor)}</div>
  <div class="cp-pf-pg">${pg} / 08</div>
</div>`;

    const sh = (num, title) => `
<div class="cp-sh">
  <div class="cp-sh-num">${num}</div>
  <div class="cp-sh-sep"></div>
  <div class="cp-sh-title">${title}</div>
</div>`;

    ov.innerHTML = `

<!-- ─── PRINT BAR ────────────────────────────────── -->
<div class="cp-bar no-print">
  <div class="cp-bar-left">
    <div class="cp-bar-icon">${waveIcon(16)}</div>
    <div>
      <div class="cp-bar-title">AskMiro — Company Profile</div>
      <div class="cp-bar-sub">Prepared for ${_esc(data.preparedFor)}</div>
    </div>
  </div>
  <div class="cp-bar-actions">
    <button class="cp-btn-pdf" onclick="window.print()">&#x2913; Save as PDF</button>
    <button class="cp-btn-close" onclick="document.getElementById('cp-overlay').remove()">&#x2715; Close</button>
  </div>
</div>

<div class="cp-doc">

<!-- ════════════════ COVER ════════════════ -->
<div class="cp-page cp-cover">
  <div class="cp-cover-accent"></div>
  <div class="cp-cover-body">

    <div class="cp-mark">
      <div class="cp-mark-icon-wrap">
        <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
          <path d="M8 20L12 12L16 20L20 12L24 20" stroke="#0D9488" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="cp-mark-wordmark">
        <span class="cp-mark-ask">Ask</span><span class="cp-mark-miro">Miro</span>
      </div>
      <div class="cp-mark-sub">Cleaning Services</div>
    </div>

    <div class="cp-cover-divider"></div>
    <div class="cp-cover-doc-label">Company Profile &nbsp;&bull;&nbsp; Capability Statement</div>
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

<!-- ════════════════ 01 — ABOUT ════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('01 &mdash; About')}
  ${sh('01','About AskMiro')}
  <div class="cp-in">
    <div class="cp-lead">AskMiro Cleaning Services is a London-based commercial cleaning contractor delivering precision-led services across construction, commercial and managed property environments.</div>
    <div class="cp-body">
      <p>Operated under Miro Partners Ltd and director-led from inception, we combine operational rigour with responsive on-site management to meet the demands of high-value projects and long-term maintenance contracts. Every engagement is managed directly — with structured communication, documented processes and accountability at every stage.</p>
      <p>Our work spans all stages of construction cleaning, from first fix through to sparkle clean and developer handover, as well as ongoing commercial maintenance contracts across London. We understand site protocols, contractor supply chains and the standards expected at practical completion.</p>
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

<!-- ════════════════ 02 — SERVICES ════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('02 &mdash; Core Services')}
  ${sh('02','Core Services')}
  <div class="cp-in">
    <div class="cp-spec">
      <div class="cp-spec-eyebrow">Primary Specialism</div>
      <div class="cp-spec-title">Builders Cleans</div>
      <div class="cp-spec-body">AskMiro specialises in builders cleans across all stages of construction: first fix, sparkle clean and final handover. We understand site induction requirements, CDM protocols and the precision expected at practical completion — including UPVC wiping, paint splash removal, dust clearance and full surface sanitisation to developer specification.</div>
      <div class="cp-spec-tags">
        ${['First Fix Clean','Sparkle Clean','Handover Clean','UPVC &amp; Glazing','Paint &amp; Plaster Removal','Developer Spec Sign-off']
          .map(t => `<span class="cp-spec-tag">${t}</span>`).join('')}
      </div>
    </div>
    <div class="cp-svcs">
      ${[
        ['02','Commercial Cleaning','Scheduled and reactive cleaning for offices, retail units and commercial premises. Tailored programmes with documented quality checks and consistent reporting.'],
        ['03','Communal Areas','Routine cleaning of communal spaces within residential developments and managed buildings, maintained to lease specification.'],
        ['04','Deep Cleaning','Intensive programmes for end-of-tenancy, pre-occupation and periodic resets. Full degreasing, sanitisation and surface restoration to commercial standard.'],
        ['05','Sector-Specific Services','Specialist cleaning across automotive showrooms, educational facilities and food-safe environments with full COSHH and PPE protocols applied as standard.']
      ].map(([n,name,desc]) => `
      <div class="cp-svc-row">
        <div class="cp-svc-n">${n}</div>
        <div>
          <div class="cp-svc-name">${name}</div>
          <div class="cp-svc-desc">${desc}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('02')}
</div>

<!-- ════════════════ 03 — SECTORS ════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('03 &mdash; Sectors')}
  ${sh('03','Sectors We Serve')}
  <div class="cp-in">
    <div class="cp-lead">We operate across a broad range of environments, applying the same management rigour and compliance standards to every contract regardless of sector or scale.</div>
    <div class="cp-sectors">
      ${[
        ['01','Construction','Active construction sites, new-build residential and commercial developments, phased handovers, practical completion cleans and snagging-phase preparation. Full CDM compliance as standard.'],
        ['02','Commercial','Grade A offices, multi-tenanted buildings, reception areas, washrooms and back-of-house. Daily and periodic maintenance programmes structured to occupier requirements.'],
        ['03','Property Management','Communal areas, lift lobbies, stairwells and car parks within residential and mixed-use developments. Maintained to lease specification and developer standard.'],
        ['04','Education','Schools, academies and further education facilities. Term-time scheduled cleaning programmes and holiday deep-clean contracts.'],
        ['05','Automotive','Showroom preparation, forecourt maintenance and vehicle display area cleaning to manufacturer presentation standards.'],
        ['06','Industrial &amp; Logistics','Warehouses, distribution centres and light industrial units. Hard floor maintenance, high-bay cleaning and ad hoc reactive programmes.']
      ].map(([num,name,body]) => `
      <div class="cp-sector">
        <div class="cp-sector-num">${num}</div>
        <div class="cp-sector-name">${name}</div>
        <div class="cp-sector-body">${body}</div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('03')}
</div>

<!-- ════════════════ 04 — APPROACH ════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('04 &mdash; Our Approach')}
  ${sh('04','Our Approach')}
  <div class="cp-in">
    <div class="cp-steps">
      ${[
        ['Director-Led Operations','Every contract is overseen directly by company directors. There is no layer of unmanaged labour between our directors and the work on site. Accountability sits at the top of the organisation.'],
        ['Precision on Site','We operate to the standard expected on high-value construction and commercial contracts. Pre-clean briefings, sign-off checklists and photographic records are standard on every contract — not an upgrade.'],
        ['Structured Communication','Response times are defined and adhered to. Progress is communicated proactively. Issues are escalated fast. Clients do not need to chase us.'],
        ['Operational Flexibility','Construction programmes change. Handover dates move. We structure our scheduling to absorb these changes without penalty to the client or compromise to output quality.'],
        ['Compliance by Default','RAMS, COSHH assessments and PPE protocols are prepared before mobilisation and maintained throughout. We operate as a professional contractor from day one on every contract.']
      ].map(([title,body],i) => `
      <div class="cp-step">
        <div class="cp-step-num">${String(i+1).padStart(2,'0')}</div>
        <div>
          <div class="cp-step-title">${title}</div>
          <div class="cp-step-body">${body}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('04')}
</div>

<!-- ════════════════ 05 — H&S ════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('05 &mdash; Health, Safety &amp; Compliance')}
  ${sh('05','Health, Safety &amp; Compliance')}
  <div class="cp-in">
    <div class="cp-body" style="margin-bottom:20px">
      <p>AskMiro operates within a full health and safety management framework appropriate for construction and commercial contract environments. All operatives work under documented risk controls. Client-facing sites receive site-specific documentation prior to mobilisation, and records are available for inspection by principal contractors at any time.</p>
    </div>
    <div class="cp-comps">
      ${[
        ['RAMS','Active','Risk Assessments and Method Statements produced for all site operations. Site-specific RAMS issued in advance of mobilisation and updated in response to scope or access changes.'],
        ['COSHH','Active','Full COSHH assessments maintained for all chemicals in use. Product data sheets held on file. All operatives receive product-specific briefings before use on site.'],
        ['PPE','Active','Appropriate PPE issued and enforced across all operatives relative to site and task. Compliance managed directly and documented within site records on every contract.'],
        ['Site Inductions','Active','All operatives complete site inductions as required. Induction records maintained and no operative enters site without completing the required process.'],
        ['Incident Reporting','Active','Documented incident reporting procedure in operation. Near-misses, incidents and observations recorded, reviewed and acted upon. Records available for inspection.'],
        ['UK Standards','Compliant','Operating in full accordance with HASAWA 1974, Management Regulations 1999, CDM 2015 (where applicable) and associated ACOP guidance throughout.']
      ].map(([key,badge,val]) => `
      <div class="cp-comp-row">
        <div class="cp-comp-key">
          <div class="cp-comp-key-label">${key}</div>
          <div class="cp-comp-key-badge">${badge}</div>
        </div>
        <div class="cp-comp-val">${val}</div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('05')}
</div>

<!-- ════════════════ 06 — INSURANCE ════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('06 &mdash; Insurance')}
  ${sh('06','Insurance')}
  <div class="cp-in">
    <div class="cp-body" style="margin-bottom:0">
      <p>AskMiro carries full commercial insurance appropriate for construction site operations and commercial contract environments. Certificates are available on request and provided to principal contractors as part of supply chain pre-qualification.</p>
    </div>
    <div class="cp-ins-row">
      <div class="cp-ins-cell">
        <div class="cp-ins-lbl">Employers&rsquo; Liability Insurance</div>
        <div class="cp-ins-val">£10,000,000</div>
        <div class="cp-ins-note">Per occurrence. As required under the Employers' Liability (Compulsory Insurance) Act 1969. Covers all employed operatives across all active sites.</div>
      </div>
      <div class="cp-ins-cell">
        <div class="cp-ins-lbl">Public Liability Insurance</div>
        <div class="cp-ins-val">£1,000,000</div>
        <div class="cp-ins-note">Per occurrence. Scalable to specific contract requirements. Contact us to discuss project insurance requirements prior to contract award.</div>
      </div>
    </div>
    <div class="cp-ins-notice">
      <div class="cp-ins-notice-body"><strong>Certificates available on request</strong> — provided directly to principal contractors for supply chain pre-qualification or tender submission. Contact <strong>info@askmiro.com</strong>.</div>
    </div>
  </div>
  ${pf('06')}
</div>

<!-- ════════════════ 07 — WHY ASKMIRO ════════════════ -->
<div class="cp-page cp-inner-page">
  ${ph('07 &mdash; Why AskMiro')}
  ${sh('07','Why AskMiro')}
  <div class="cp-in">
    <div class="cp-why-grid">
      ${[
        ['Director involvement on every contract','No account management layers. The person responsible for quality is present, contactable and accountable throughout.'],
        ['Built for construction environments','We understand CDM obligations, site protocols, induction requirements and contractor supply chain expectations.'],
        ['Rapid London mobilisation','London-based operations enable fast deployment across the capital and surrounding areas without delay or additional cost.'],
        ['Documentation before mobilisation','RAMS, COSHH assessments, insurance certificates and method statements in place before the contract starts — not after issues arise.'],
        ['Transparent reporting','Communication is structured and on schedule. Progress is logged, sign-offs documented and concerns escalated immediately.'],
        ['Consistent multi-site standard','The same management, the same processes and the same standard applied whether cleaning one unit or twenty.'],
        ['Technology-enabled operations','Contract management, scheduling and compliance managed through our proprietary platform — full visibility for clients and team.'],
        ['Zero management overhead','Briefed once, we manage our team, programme and compliance independently. No hand-holding required.']
      ].map(([t,b],i) => `
      <div class="cp-why-item">
        <div class="cp-why-n">${String(i+1).padStart(2,'0')}</div>
        <div class="cp-why-title">${t}</div>
        <div class="cp-why-desc">${b}</div>
      </div>`).join('')}
    </div>
  </div>
  ${pf('07')}
</div>

<!-- ════════════════ 08 — CONTACT ════════════════ -->
<div class="cp-page">
  <div class="cp-contact-wrap">
    ${sh('08','Get In Touch')}
    <div class="cp-contact-top">
      <div class="cp-contact-mark">
        <div class="cp-contact-mark-icon">${waveIcon(20)}</div>
        <div>
          <div class="cp-contact-mark-name"><em>Ask</em>Miro Cleaning Services</div>
          <div class="cp-contact-mark-sub">Your Space. Our Responsibility.</div>
        </div>
      </div>
      <div class="cp-contact-doc-label">Company Profile</div>
    </div>
    <div class="cp-contact-grid">
      <div class="cp-contact-cell">
        <div class="cp-contact-lbl">Website</div>
        <div class="cp-contact-val">www.askmiro.com</div>
      </div>
      <div class="cp-contact-cell">
        <div class="cp-contact-lbl">Email</div>
        <div class="cp-contact-val">info@askmiro.com</div>
      </div>
      <div class="cp-contact-cell">
        <div class="cp-contact-lbl">Registered Address</div>
        <div class="cp-contact-val">34 Haldane Place<br>London, SW18 4UH<br>England</div>
      </div>
      <div class="cp-contact-cell">
        <div class="cp-contact-lbl">Legal Entity</div>
        <div class="cp-contact-val">Miro Partners Ltd<br>Private Limited Company<br>Incorporated 14 March 2025</div>
      </div>
    </div>
    <div class="cp-contact-legal">
      AskMiro Cleaning Services is a trading name of Miro Partners Ltd. Registered in England and Wales.
      Registered Office: 34 Haldane Place, London, England, SW18 4UH.
      SIC 81100 &mdash; Combined facilities support activities &nbsp;&bull;&nbsp; SIC 81210 &mdash; General cleaning of buildings.<br>
      This document is confidential and prepared solely for the use of ${_esc(data.preparedFor)}.${data.date ? ` Date: ${_esc(data.date)}.` : ''}
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
