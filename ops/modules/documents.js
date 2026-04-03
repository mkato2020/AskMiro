// ============================================================
// AskMiro Ops — Documents Module  v1.0
// AskMiro Contractor Compliance Pack
// 15-document pack: RAMS | Method Statement | COSHH | H&S |
// Capability Statement | Spec | QC | Environmental | PPE |
// Training | Incident | Toolbox Talk | Subcontractor |
// Mobilisation | Site Comms
// ============================================================
window.Documents = (() => {

  const CO   = 'AskMiro Cleaning Services';
  const LEGAL = 'Miro Partners Ltd';
  const ADDR  = '34 Haldane Place, London, SW18 4UH';
  const EMAIL = 'info@askmiro.com';
  const WEB   = 'www.askmiro.com';

  // ── MODAL ─────────────────────────────────────────────────────
  function openPackModal() {
    const now  = new Date();
    const date = now.toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
    const rev  = now.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
    UI.openModal(`
<div class="modal-hd">
  <h2>Generate Compliance Pack</h2>
  <button class="xbtn" onclick="UI.closeModal()">&#x2715;</button>
</div>
<div class="modal-body">
  <div style="font-size:12px;color:var(--ll);line-height:1.6;margin-bottom:18px;padding:10px 12px;background:#f8fafc;border-left:3px solid #0D9488">
    Generates the full AskMiro Contractor Compliance Pack — 15 documents in one branded PDF.
    Fill in the recipient details to personalise the cover.
  </div>
  <div class="fg">
    <label class="fl">Prepared For — Company Name <span class="req">*</span></label>
    <input class="fin" id="dp-for" placeholder="e.g. St George PLC" autocomplete="off">
  </div>
  <div class="fg">
    <label class="fl">Attention / Contact</label>
    <input class="fin" id="dp-attn" placeholder="e.g. James Thornton, Procurement Manager">
  </div>
  <div class="fr">
    <div class="fg">
      <label class="fl">Document Date</label>
      <input class="fin" id="dp-date" value="${_esc(date)}">
    </div>
    <div class="fg">
      <label class="fl">Project / Site Reference</label>
      <input class="fin" id="dp-ref" placeholder="e.g. Battersea Phase 3">
    </div>
  </div>
  <div class="fg">
    <label class="fl">Document Revision</label>
    <input class="fin" id="dp-rev" value="${_esc(rev)} — Rev 1.0">
  </div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Documents._gen()">Generate Pack &rarr;</button>
  </div>
</div>`);
    setTimeout(() => { const el = document.getElementById('dp-for'); if(el) el.focus(); }, 80);
  }

  function _gen() {
    if (!UI.rq('dp-for')) return;
    const d = {
      for:  UI.gv('dp-for'),
      attn: UI.gv('dp-attn'),
      date: UI.gv('dp-date'),
      ref:  UI.gv('dp-ref'),
      rev:  UI.gv('dp-rev')
    };
    UI.closeModal();
    _build(d);
  }

  // ── STYLES ────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('dp-styles')) return;
    const s = document.createElement('style');
    s.id = 'dp-styles';
    s.textContent = `
/* OVERLAY */
#dp-overlay{display:none;position:fixed;inset:0;background:#c8cdd4;z-index:99999;overflow-y:auto;padding:36px 0 80px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#1f2937}
#dp-overlay *{box-sizing:border-box;margin:0;padding:0}
.dp-doc{max-width:794px;margin:0 auto}

/* PRINT BAR */
.dp-bar{max-width:794px;margin:0 auto 16px;display:flex;align-items:center;justify-content:space-between;padding:0 2px}
.dp-bar-title{font-size:13px;font-weight:700;color:#0f172a}
.dp-bar button{border:none;cursor:pointer;font-size:13px;font-weight:700;padding:9px 22px}
.dp-btn-pdf{background:#0D9488;color:#fff}
.dp-btn-close{background:#f1f5f9;color:#475569;font-weight:400;padding:9px 14px}

/* PAGE */
.dp-page{background:#fff;margin-bottom:6px;position:relative;overflow:hidden}
.dp-page.dp-inner::before{content:'';position:absolute;top:0;left:0;bottom:0;width:4px;background:#0D9488}

/* PAGE HEADER / FOOTER */
.dp-ph{display:flex;align-items:center;padding:14px 54px 14px 66px;border-bottom:1px solid #e5e7eb}
.dp-ph-brand{font-size:10px;font-weight:700;color:#0D9488;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.dp-ph-rule{flex:1;height:1px;background:#e5e7eb;margin:0 14px}
.dp-ph-sec{font-size:10px;color:#9ca3af;white-space:nowrap;letter-spacing:.03em}
.dp-pf{display:flex;align-items:center;justify-content:space-between;padding:10px 54px 10px 66px;border-top:1px solid #e5e7eb}
.dp-pf-legal{font-size:9px;color:#9ca3af}
.dp-pf-pg{font-size:9px;color:#9ca3af}

/* INNER */
.dp-in{padding:44px 54px 48px 66px}

/* TYPE */
.dp-eyebrow{font-size:9.5px;font-weight:700;color:#0D9488;letter-spacing:.16em;text-transform:uppercase;margin-bottom:9px}
.dp-h{font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:800;color:#0D1C2E;letter-spacing:-.02em;line-height:1.15;padding-bottom:14px;border-bottom:2px solid #0D1C2E;margin-bottom:28px}
.dp-h2{font-size:13px;font-weight:800;color:#0D1C2E;letter-spacing:-.01em;margin:24px 0 10px;text-transform:uppercase;font-size:10.5px;letter-spacing:.08em}
.dp-lead{font-size:14px;color:#0D1C2E;font-weight:600;line-height:1.65;margin-bottom:20px}
.dp-body{font-size:12.5px;color:#374151;line-height:1.78}
.dp-body p{margin-bottom:13px}
.dp-body p:last-child{margin-bottom:0}
.dp-body ul{margin:8px 0 13px 18px}
.dp-body li{margin-bottom:5px}

/* SIGNATURE BLOCK */
.dp-sig{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:32px}
.dp-sig-cell{padding-top:40px;border-top:1px solid #1f2937}
.dp-sig-name{font-size:13px;font-weight:700;color:#0D1C2E;margin-bottom:2px}
.dp-sig-role{font-size:11px;color:#9ca3af}

/* RISK TABLE */
.dp-tbl{width:100%;border-collapse:collapse;margin:14px 0;font-size:12px}
.dp-tbl th{background:#0D1C2E;color:#fff;padding:9px 11px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.dp-tbl td{padding:8px 11px;border-bottom:1px solid #f1f5f9;vertical-align:top;color:#374151}
.dp-tbl tr:last-child td{border-bottom:none}
.dp-tbl tr:nth-child(even) td{background:#fafafa}
.dp-risk-h{background:#dc2626;color:#fff;padding:3px 8px;font-size:10px;font-weight:700;display:inline-block}
.dp-risk-m{background:#d97706;color:#fff;padding:3px 8px;font-size:10px;font-weight:700;display:inline-block}
.dp-risk-l{background:#059669;color:#fff;padding:3px 8px;font-size:10px;font-weight:700;display:inline-block}

/* STEP LIST */
.dp-steps{display:flex;flex-direction:column;gap:0;margin:8px 0}
.dp-step{display:flex;gap:18px;padding:13px 0;border-bottom:1px solid #f1f5f9;align-items:flex-start}
.dp-step:last-child{border-bottom:none}
.dp-step-num{width:26px;height:26px;flex-shrink:0;background:#0D1C2E;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;font-family:monospace}
.dp-step-title{font-size:12.5px;font-weight:700;color:#0D1C2E;margin-bottom:4px}
.dp-step-body{font-size:12px;color:#6b7280;line-height:1.65}

/* COSHH CHEMICAL CARD */
.dp-chem{background:#f8fafc;border-left:3px solid #0D9488;padding:16px 18px;margin-bottom:10px}
.dp-chem-name{font-size:13px;font-weight:700;color:#0D1C2E;margin-bottom:8px}
.dp-chem-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dp-chem-field{font-size:11px}
.dp-chem-lbl{font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.06em;font-size:9.5px;margin-bottom:2px}
.dp-chem-val{color:#374151;line-height:1.55}

/* POLICY BOX */
.dp-policy{background:#f0fdf4;border-left:3px solid #059669;padding:16px 18px;margin-bottom:18px}
.dp-policy-title{font-size:11px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.dp-policy-body{font-size:12px;color:#1f2937;line-height:1.7}

/* INFO BOX */
.dp-info{background:#eff6ff;border-left:3px solid #2563eb;padding:14px 16px;margin:14px 0}
.dp-info-body{font-size:12px;color:#1e40af;line-height:1.65}

/* CHECKLIST */
.dp-check{display:flex;flex-direction:column;gap:0}
.dp-check-item{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #f3f4f6;font-size:12.5px;color:#374151}
.dp-check-item:last-child{border-bottom:none}
.dp-check-box{width:16px;height:16px;border:1.5px solid #d1d5db;flex-shrink:0}

/* COVER PAGE */
.dp-cover{background:#0D1C2E;min-height:560px;display:flex;flex-direction:column}
.dp-cover-bar{height:6px;background:#0D9488;flex-shrink:0}
.dp-cover-body{flex:1;display:flex;flex-direction:column;justify-content:center;padding:60px}
.dp-cover-logo-row{display:flex;align-items:center;gap:14px;margin-bottom:40px}
.dp-cover-logo-box{width:50px;height:50px;background:rgba(13,148,136,.14);display:flex;align-items:center;justify-content:center}
.dp-cover-logo-name{font-family:'Outfit',Arial,sans-serif;font-size:18px;font-weight:800;color:#fff;line-height:1.1}
.dp-cover-logo-sub{font-size:10px;color:rgba(255,255,255,.35);letter-spacing:.06em;text-transform:uppercase;margin-top:2px}
.dp-cover-pack-label{font-size:9.5px;font-weight:700;color:#0D9488;letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px}
.dp-cover-pack-title{font-family:'Outfit',Arial,sans-serif;font-size:36px;font-weight:800;color:#fff;letter-spacing:-.02em;line-height:1.1;text-transform:uppercase;margin-bottom:8px}
.dp-cover-pack-sub{font-size:13px;color:rgba(255,255,255,.45);margin-bottom:44px}
.dp-cover-rule{width:38px;height:2px;background:#0D9488;margin-bottom:28px}
.dp-cover-meta{font-size:12px;color:rgba(255,255,255,.4);line-height:1.9}
.dp-cover-meta strong{color:rgba(255,255,255,.75)}
.dp-cover-foot{border-top:1px solid rgba(255,255,255,.08);padding:20px 60px;display:flex;justify-content:space-between;flex-shrink:0}
.dp-cover-foot-lbl{font-size:9px;font-weight:700;color:#0D9488;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
.dp-cover-foot-val{font-size:13px;font-weight:700;color:#fff}
.dp-cover-foot-meta{font-size:10px;color:rgba(255,255,255,.28);margin-top:2px}

/* TOC PAGE */
.dp-toc-item{display:flex;align-items:baseline;gap:0;padding:11px 0;border-bottom:1px solid #f3f4f6}
.dp-toc-item:last-child{border-bottom:none}
.dp-toc-num{font-size:10px;font-weight:700;color:#0D9488;width:28px;flex-shrink:0}
.dp-toc-title{font-size:13px;color:#0D1C2E;font-weight:600;flex:1}
.dp-toc-dots{flex:1;border-bottom:1px dotted #d1d5db;margin:0 10px;position:relative;top:-3px}
.dp-toc-cat{font-size:10px;font-weight:700;padding:2px 7px;margin-left:8px;flex-shrink:0}
.dp-toc-cat.core{background:#fee2e2;color:#dc2626}
.dp-toc-cat.high{background:#fef3c7;color:#d97706}
.dp-toc-cat.site{background:#dbeafe;color:#2563eb}
.dp-toc-section-hd{font-size:9.5px;font-weight:700;color:#9ca3af;letter-spacing:.1em;text-transform:uppercase;padding:16px 0 4px}

/* @MEDIA PRINT */
@media print{
  body>*:not(#dp-overlay){display:none!important}
  #dp-overlay{display:block!important;position:static!important;padding:0;background:#fff;overflow:visible}
  #dp-overlay .no-print{display:none!important}
  .dp-doc{max-width:100%}
  .dp-page{page-break-before:always;margin-bottom:0;overflow:visible}
  .dp-cover{page-break-before:auto}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}`;
    document.head.appendChild(s);
  }

  // ── HELPERS ───────────────────────────────────────────────────
  function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function ph(sec){ return `<div class="dp-ph"><div class="dp-ph-brand">AskMiro Cleaning Services</div><div class="dp-ph-rule"></div><div class="dp-ph-sec">${sec}</div></div>`; }
  function pf(pg,total){ return `<div class="dp-pf"><div class="dp-pf-legal">Miro Partners Ltd trading as AskMiro Cleaning Services &nbsp;&bull;&nbsp; Confidential</div><div class="dp-pf-pg">${pg} / ${total||15}</div></div>`; }
  function page(secLabel,pg,total,content){
    return `<div class="dp-page dp-inner">${ph(secLabel)}<div class="dp-in">${content}</div>${pf(pg,total)}</div>`;
  }
  function risk(l,text){ return `<span class="dp-risk-${l}">${text}</span>`; }

  // ── BUILD ──────────────────────────────────────────────────────
  function _build(d) {
    _injectStyles();
    const ex = document.getElementById('dp-overlay');
    if (ex) ex.remove();
    const ov = document.createElement('div');
    ov.id = 'dp-overlay';
    ov.innerHTML = _html(d);
    document.body.appendChild(ov);
    ov.style.display = 'block';
    ov.scrollTop = 0;
  }

  function _html(d) {
    const total = 16; // cover + toc + 14 docs
    let pg = 0;
    const p = (sec, content) => { pg++; return page(sec, pg, total, content); };

    return `
<!-- PRINT BAR -->
<div class="dp-bar no-print">
  <div class="dp-bar-title">AskMiro Contractor Compliance Pack &mdash; ${_esc(d.for)}</div>
  <div style="display:flex;gap:8px">
    <button class="dp-btn-pdf" onclick="window.print()">Save as PDF</button>
    <button class="dp-btn-close" onclick="document.getElementById('dp-overlay').remove()">&#x2715; Close</button>
  </div>
</div>

<div class="dp-doc">

<!-- ═══════════ COVER ═══════════ -->
<div class="dp-page dp-cover">
  <div class="dp-cover-bar"></div>
  <div class="dp-cover-body">
    <div class="dp-cover-logo-row">
      <div class="dp-cover-logo-box">
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <path d="M8 20L12 12L16 20L20 12L24 20" stroke="#0D9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="dp-cover-logo-name">AskMiro Cleaning Services</div>
        <div class="dp-cover-logo-sub">Miro Partners Ltd &nbsp;&middot;&nbsp; London, England</div>
      </div>
    </div>
    <div class="dp-cover-pack-label">Contractor Documentation</div>
    <div class="dp-cover-pack-title">Compliance<br>Pack</div>
    <div class="dp-cover-pack-sub">Health &amp; Safety &middot; RAMS &middot; COSHH &middot; Method Statements &middot; Supporting Policies</div>
    <div class="dp-cover-rule"></div>
    <div class="dp-cover-meta">
      <strong>Prepared for:</strong> ${_esc(d.for)}<br>
      ${d.attn ? `<strong>Attention:</strong> ${_esc(d.attn)}<br>` : ''}
      ${d.ref ? `<strong>Reference:</strong> ${_esc(d.ref)}<br>` : ''}
      <strong>Date:</strong> ${_esc(d.date)}<br>
      <strong>Revision:</strong> ${_esc(d.rev)}
    </div>
  </div>
  <div class="dp-cover-foot">
    <div>
      <div class="dp-cover-foot-lbl">Prepared By</div>
      <div class="dp-cover-foot-val">AskMiro Cleaning Services</div>
      <div class="dp-cover-foot-meta">${ADDR}</div>
    </div>
    <div style="text-align:right">
      <div class="dp-cover-foot-lbl">Document Status</div>
      <div class="dp-cover-foot-val">Controlled Document</div>
      <div class="dp-cover-foot-meta">Not to be reproduced without authorisation</div>
    </div>
  </div>
</div>

<!-- ═══════════ TABLE OF CONTENTS ═══════════ -->
${p('Table of Contents', `
<div class="dp-eyebrow">Contents</div>
<div class="dp-h">Contractor Compliance Pack</div>
<div class="dp-body" style="margin-bottom:20px"><p>This pack contains all core health and safety, compliance and operational documentation required by AskMiro Cleaning Services for construction site access, contractor pre-qualification and commercial contract commencement.</p></div>
<div class="dp-toc-section-hd">Core Documents — Non-Negotiable</div>
${[
  ['01','Health &amp; Safety Policy','core'],
  ['02','Risk Assessment &amp; Method Statement (RAMS) — Builders Clean','core'],
  ['03','Method Statement — Builders Clean','core'],
  ['04','COSHH Assessment Pack','core'],
].map(([n,t,c]) => `<div class="dp-toc-item"><div class="dp-toc-num">${n}</div><div class="dp-toc-title">${t}</div><div class="dp-toc-dots"></div><div class="dp-toc-cat ${c}">${c==='core'?'Core':c==='high'?'High Value':'Site'}</div></div>`).join('')}
<div class="dp-toc-section-hd">High Value — Strongly Recommended</div>
${[
  ['05','Capability Statement','high'],
  ['06','Cleaning Specification','high'],
  ['07','Quality Control Procedure','high'],
  ['08','Environmental Policy','high'],
].map(([n,t,c]) => `<div class="dp-toc-item"><div class="dp-toc-num">${n}</div><div class="dp-toc-title">${t}</div><div class="dp-toc-dots"></div><div class="dp-toc-cat ${c}">${c==='core'?'Core':c==='high'?'High Value':'Site'}</div></div>`).join('')}
<div class="dp-toc-section-hd">Site Access &amp; Contractor Level</div>
${[
  ['09','PPE Policy','site'],
  ['10','Training &amp; Competency Statement','site'],
  ['11','Accident &amp; Incident Procedure','site'],
  ['12','Toolbox Talk Template','site'],
  ['13','Subcontractor Policy','site'],
  ['14','Mobilisation Plan','site'],
  ['15','Site Communication Plan','site'],
].map(([n,t,c]) => `<div class="dp-toc-item"><div class="dp-toc-num">${n}</div><div class="dp-toc-title">${t}</div><div class="dp-toc-dots"></div><div class="dp-toc-cat ${c}">${c==='core'?'Core':c==='high'?'High Value':'Site'}</div></div>`).join('')}
`)}

<!-- ═══════════ 01 — H&S POLICY ═══════════ -->
${p('01 &mdash; Health &amp; Safety Policy', `
<div class="dp-eyebrow">Document 01 &mdash; Core</div>
<div class="dp-h">Health &amp; Safety Policy</div>
<div class="dp-policy">
  <div class="dp-policy-title">Statement of Intent</div>
  <div class="dp-policy-body">
    AskMiro Cleaning Services (Miro Partners Ltd) is committed to ensuring, so far as is reasonably practicable,
    the health, safety and welfare of all employees, contractors and persons who may be affected by our work
    activities. This policy is reviewed annually and whenever significant changes to the business occur.
  </div>
</div>
<div class="dp-h2">Director Commitment</div>
<div class="dp-body"><p>The Director accepts overall responsibility for health and safety within AskMiro Cleaning Services.
We will provide and maintain safe working conditions, equipment, systems of work and a safe working environment.
We will provide such information, instruction, training and supervision as is necessary to ensure the health and
safety of all staff. This commitment applies to all operations including construction site cleaning, commercial
premises cleaning and all associated activities.</p></div>
<div class="dp-h2">Responsibilities</div>
<div class="dp-steps">
${[
  ['Director','Holds overall responsibility for health and safety. Reviews and signs the policy annually. Ensures adequate resources are available for H&S management. Investigates all incidents.'],
  ['Supervisors / Team Leaders','Conduct pre-start briefings on every site. Enforce PPE compliance. Report hazards and near-misses immediately. Complete site inductions on behalf of operatives.'],
  ['Operatives','Follow all safe working procedures. Use PPE as instructed. Report hazards, accidents and near-misses to their supervisor without delay. Not to commence work if unsatisfied with safety conditions.'],
  ['All Personnel','Cooperate with management on health and safety matters. Not to interfere with or misuse anything provided in the interest of health, safety or welfare.']
].map(([t,b]) => `<div class="dp-step"><div class="dp-step-num" style="width:auto;padding:5px 10px;height:auto;font-size:10px">&bull;</div><div><div class="dp-step-title">${t}</div><div class="dp-step-body">${b}</div></div></div>`).join('')}
</div>
<div class="dp-h2">Risk Management</div>
<div class="dp-body"><p>Risk assessments and method statements (RAMS) are produced for all site operations prior to mobilisation.
COSHH assessments are maintained for all chemicals in use. Site-specific risk assessments are reviewed when the scope
of work changes. All staff are briefed on relevant risk assessments before commencing work.</p></div>
<div class="dp-h2">UK Legislative Compliance</div>
<div class="dp-body"><ul>
<li>Health and Safety at Work Act 1974</li>
<li>Management of Health and Safety at Work Regulations 1999</li>
<li>Control of Substances Hazardous to Health Regulations 2002 (COSHH)</li>
<li>Personal Protective Equipment at Work Regulations 1992</li>
<li>Manual Handling Operations Regulations 1992</li>
<li>Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013 (RIDDOR)</li>
<li>Construction (Design and Management) Regulations 2015 (CDM) — where applicable</li>
</ul></div>
<div class="dp-sig">
  <div class="dp-sig-cell">
    <div class="dp-sig-name">Director, AskMiro Cleaning Services</div>
    <div class="dp-sig-role">Miro Partners Ltd &nbsp;&bull;&nbsp; ${_esc(d.date)}</div>
  </div>
  <div class="dp-sig-cell">
    <div class="dp-sig-name">Review Date</div>
    <div class="dp-sig-role">Annually or on significant change</div>
  </div>
</div>
`)}

<!-- ═══════════ 02 — RAMS ═══════════ -->
${p('02 &mdash; RAMS — Builders Clean', `
<div class="dp-eyebrow">Document 02 &mdash; Core</div>
<div class="dp-h">Risk Assessment &amp; Method Statement<br><span style="font-size:14px;font-weight:600;color:#6b7280">Builders Clean — Construction Site</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px">
${[['Company',CO],['Document Ref','RAMS-BC-01'],['Revision',_esc(d.rev)],['Site / Project',d.ref||'As Contract'],['Date',_esc(d.date)],['Prepared For',_esc(d.for)]].map(([l,v])=>`<div style="background:#fff;padding:12px 14px"><div style="font-size:9px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${l}</div><div style="font-size:12px;font-weight:600;color:#0D1C2E">${v}</div></div>`).join('')}
</div>
<div class="dp-h2">Scope of Works</div>
<div class="dp-body"><p>Post-construction cleaning of residential and/or commercial premises following completion of building works. This includes initial builders clean (first fix/second fix stages), sparkle clean and final handover clean as specified by the principal contractor or developer.</p></div>
<div class="dp-h2">Risk Assessment</div>
<table class="dp-tbl">
<thead><tr><th style="width:22%">Hazard</th><th style="width:28%">Persons at Risk</th><th style="width:14%">Initial Risk</th><th style="width:22%">Control Measures</th><th style="width:14%">Residual Risk</th></tr></thead>
<tbody>
${[
  ['Construction dust and debris','Operatives, site workers',risk('h','HIGH'),'Mandatory FFP2 dust masks. Dampening of surfaces before sweeping. Welfare facilities with washing facilities provided.',risk('l','LOW')],
  ['Slips, trips and falls on wet or uneven surfaces','Operatives, public',risk('h','HIGH'),'Non-slip footwear (S1P or S3 rated). Wet floor signage deployed. Site walkthrough prior to commencement.',risk('l','LOW')],
  ['Exposure to hazardous cleaning chemicals (COSHH)','Operatives',risk('m','MEDIUM'),'COSHH assessments reviewed pre-start. PPE: nitrile gloves, eye protection, chemical-resistant apron. SDS available on site.',risk('l','LOW')],
  ['Manual handling (lifting, carrying equipment)','Operatives',risk('m','MEDIUM'),'Team lifts for items over 10kg. Equipment with integral handles used. Trolleys provided for bulk materials.',risk('l','LOW')],
  ['Working at height (ladders, hop-ups)','Operatives',risk('h','HIGH'),'Maximum ladder height 3m. Three-point contact rule enforced. Hop-ups for all sub-2m work. No working from unsupported ladders.',risk('m','MEDIUM')],
  ['Electrical hazards (live sockets, plant)',  'Operatives',risk('m','MEDIUM'),'Confirm with site manager all electrical supply status prior to start. Do not clean exposed wiring or wet electrical fittings.',risk('l','LOW')],
  ['Lone working','Operatives',risk('m','MEDIUM'),'Minimum two operatives on all construction sites. Lone working sign-in procedure for commercial sites. Check-in call every 2 hours.',risk('l','LOW')],
  ['Waste handling (sharp objects, COSHH waste)','Operatives',risk('h','HIGH'),'Heavy-duty gloves for waste handling. Sharps bin on site. COSHH waste disposed via licensed contractor where required.',risk('l','LOW')],
].map(([h,p,r,c,rr])=>`<tr><td>${h}</td><td>${p}</td><td>${r}</td><td>${c}</td><td>${rr}</td></tr>`).join('')}
</tbody>
</table>
<div class="dp-h2">PPE Requirements — All Operatives</div>
<div class="dp-body"><ul>
<li>Safety footwear — minimum S1P rated, steel toe cap</li>
<li>Hi-visibility vest — worn at all times on active construction sites</li>
<li>Hard hat — worn in all areas designated by the principal contractor</li>
<li>Nitrile gloves — worn when handling all cleaning chemicals</li>
<li>FFP2 dust mask — worn during dry debris clearance and dusty environments</li>
<li>Safety glasses / goggles — worn when using spray chemicals or working overhead</li>
<li>Chemical-resistant apron — worn during concentrated chemical use</li>
</ul></div>
<div class="dp-h2">Emergency Procedures</div>
<div class="dp-body"><ul>
<li><strong>Chemical spill:</strong> Evacuate immediate area. Contain with absorbent material. Ventilate. Refer to SDS. Notify site manager.</li>
<li><strong>Injury:</strong> Administer first aid. Contact site first aider. Call 999 if serious. Report to supervisor. Complete accident record within 24 hours.</li>
<li><strong>Fire:</strong> Follow site evacuation procedure. Proceed to site muster point. Do not re-enter until all-clear given by site manager.</li>
<li><strong>RIDDOR reportable event:</strong> Director to notify HSE within required timeframe. Preserve scene. Complete full investigation report.</li>
</ul></div>
<div class="dp-sig">
  <div class="dp-sig-cell"><div class="dp-sig-name">Assessor — Director, AskMiro</div><div class="dp-sig-role">Date: ${_esc(d.date)}</div></div>
  <div class="dp-sig-cell"><div class="dp-sig-name">Reviewed By</div><div class="dp-sig-role">Date of Next Review: Annually</div></div>
</div>
`)}

<!-- ═══════════ 03 — METHOD STATEMENT ═══════════ -->
${p('03 &mdash; Method Statement', `
<div class="dp-eyebrow">Document 03 &mdash; Core</div>
<div class="dp-h">Method Statement<br><span style="font-size:14px;font-weight:600;color:#6b7280">Builders Clean — Construction Site</span></div>
<div class="dp-info"><div class="dp-info-body"><strong>System:</strong> All cleaning is carried out using a top-down method — ceilings and high-level surfaces first, progressing downwards to floors last. This prevents cross-contamination and minimises rework.</div></div>
<div class="dp-h2">Pre-Start Checks</div>
<div class="dp-steps">
${[
  ['Site Induction','All operatives complete site induction with site manager prior to commencement. Induction cards retained on file.'],
  ['RAMS &amp; COSHH Briefing','Supervisor briefs all operatives on RAMS and relevant COSHH assessments before any work begins. Signature sheet completed.'],
  ['PPE Check','All operative PPE inspected and confirmed as compliant. Any defective PPE replaced before entry to site.'],
  ['Site Walkthrough','Supervisor conducts pre-clean walkthrough with site manager. Hazards, access routes, welfare facilities and waste disposal areas identified and communicated to team.'],
  ['Equipment &amp; Materials Check','All equipment and chemicals confirmed present and in good condition. Chemical SDS sheets available on site.'],
].map(([t,b],i)=>`<div class="dp-step"><div class="dp-step-num">${String(i+1).padStart(2,'0')}</div><div><div class="dp-step-title">${t}</div><div class="dp-step-body">${b}</div></div></div>`).join('')}
</div>
<div class="dp-h2">Equipment List</div>
<div class="dp-body"><ul>
<li>Industrial vacuum cleaner (HEPA filtered)</li><li>Mop, bucket and wringer</li><li>Microfibre cloths (colour-coded)</li>
<li>Squeegee and window cleaning equipment</li><li>Stiff brush and hand brush sets</li><li>Wet floor signs</li>
<li>Chemical spray bottles (labelled)</li><li>Sharps bin</li><li>Heavy-duty waste sacks</li>
<li>Hop-up steps (max 600mm)</li><li>Personal PPE (see RAMS)</li>
</ul></div>
<div class="dp-h2">Cleaning Sequence — Top-Down System</div>
<div class="dp-steps">
${[
  ['Ceilings, coving &amp; cornices','Remove cobwebs and dust from all ceiling surfaces, light fittings (non-electrical), air vents and coving using extension pole and microfibre head.'],
  ['Walls, windows (interior) &amp; frames','Wipe down all wall surfaces. Clean window glass internally using streak-free glass cleaner. Clean UPVC frames, sills and reveals. Remove paint splashes with appropriate solvent where approved.'],
  ['Fixtures &amp; fittings','Clean all fitted kitchen units, bathroom furniture, sanitaryware, radiators, skirting boards and door frames. Remove all stickers, labels and protective film as directed.'],
  ['Sanitary areas','Descale and sanitise WCs, basins, bath and shower units. Clean mirrors, tiling and grout. Sanitise all hard surfaces with antibacterial solution.'],
  ['Hard floors','Vacuum or sweep all hard floors thoroughly. Mop with appropriate pH-neutral cleaner. Remove grout residue, paint splashes and adhesive with appropriate scraper/solvent.'],
  ['Carpets &amp; soft flooring','Vacuum all carpeted areas thoroughly. Spot-treat stains. Report any damage to principal contractor in writing.'],
  ['External areas (where specified)','Clear construction debris from external areas, terraces and entrance routes as specified. Remove tape, stickers and protective coverings from external glazing.'],
  ['Final inspection &amp; sign-off','Supervisor conducts final room-by-room inspection using sign-off checklist. Defects logged and rectified. Sign-off sheet completed by supervisor and countersigned by site manager.'],
].map(([t,b],i)=>`<div class="dp-step"><div class="dp-step-num">${String(i+1).padStart(2,'0')}</div><div><div class="dp-step-title">${t}</div><div class="dp-step-body">${b}</div></div></div>`).join('')}
</div>
<div class="dp-h2">Waste Removal</div>
<div class="dp-body"><p>All construction waste, cleaning waste and COSHH waste is segregated and removed from site in accordance with site waste management requirements. Licensed carriers used for COSHH/hazardous waste where applicable. Waste transfer notes available on request.</p></div>
`)}

<!-- ═══════════ 04 — COSHH ═══════════ -->
${p('04 &mdash; COSHH Pack', `
<div class="dp-eyebrow">Document 04 &mdash; Core</div>
<div class="dp-h">COSHH Assessment Pack<br><span style="font-size:14px;font-weight:600;color:#6b7280">Control of Substances Hazardous to Health</span></div>
<div class="dp-policy"><div class="dp-policy-title">COSHH Policy Statement</div>
<div class="dp-policy-body">AskMiro Cleaning Services is committed to identifying and controlling all substances hazardous to health used in its operations. COSHH assessments are maintained for all chemicals in use, reviewed annually and updated when products change. All operatives receive product-specific briefings before use. Safety Data Sheets (SDS) are held on file and are available on site at all times.</div></div>
<div class="dp-h2">Chemical Handling Procedures</div>
<div class="dp-body"><ul>
<li>All chemicals must be used strictly in accordance with manufacturer instructions and the relevant COSHH assessment</li>
<li>Chemicals must never be mixed unless specifically directed by the manufacturer</li>
<li>All containers must be labelled at all times — decanted chemicals into unlabelled containers is prohibited</li>
<li>PPE (minimum nitrile gloves and eye protection) must be worn when handling all chemicals</li>
<li>Chemicals must not be used in unventilated spaces — ventilate before commencing use</li>
<li>Immediately report any adverse reaction to chemicals to the site supervisor</li>
</ul></div>
<div class="dp-h2">Spill Response Procedure</div>
<div class="dp-body"><ul>
<li>Evacuate immediate area and warn others</li>
<li>Refer to relevant SDS for specific spill response instructions</li>
<li>Use appropriate absorbent material to contain the spill — do not wash chemicals into drains unless SDS confirms this is safe</li>
<li>Ventilate the area</li>
<li>Dispose of contaminated materials in sealed, labelled bags</li>
<li>Report all spills to the site supervisor and log in the incident record</li>
</ul></div>
<div class="dp-h2">Chemical Assessments</div>
${[
  {name:'Multi-Surface Antibacterial Cleaner',desc:'General purpose surface cleaner. Used on hard surfaces, sanitary ware, kitchen worktops and non-porous surfaces.',hazards:'Mild irritant to skin and eyes.',ppe:'Nitrile gloves. Eye protection for concentrated or spray use.',storage:'Store at room temperature, away from direct sunlight. Keep container sealed.',spill:'Dilute with water. Absorb with paper towel. Dispose in general waste.',first:'Skin: rinse with water. Eyes: rinse with clean water for 15 minutes. Seek medical advice if irritation persists.'},
  {name:'Bleach / Sodium Hypochlorite Solution',desc:'Disinfectant and sanitiser. Used in sanitary areas, toilets, sinks and for mould treatment.',hazards:'Corrosive at high concentration. Toxic if mixed with acids or ammonia — releases chlorine gas.',ppe:'Nitrile gloves. Eye protection. Ensure adequate ventilation. Chemical apron for concentrated use.',storage:'Store in cool, dry location. Never store with acids, ammonia or flammables.',spill:'Do not inhale. Ventilate immediately. Contain with absorbent material. Do not wash to drain in quantity.',first:'Skin/eyes: flush immediately with copious water for 15 minutes. Call 999 if inhaled in quantity.'},
  {name:'Glass Cleaner',desc:'Streak-free glass and mirror cleaner. Used on windows, mirrors and glazed surfaces.',hazards:'Flammable. Mild irritant.',ppe:'Nitrile gloves. Eye protection for spray application.',storage:'Store away from heat sources and ignition.',spill:'Ventilate area. Absorb with inert material. Keep away from sources of ignition.',first:'Eyes: rinse with water. Skin: wash with soap and water.'},
  {name:'Descaler / Limescale Remover',desc:'Acid-based descaler. Used on sanitary ware, taps, shower heads and tile grout.',hazards:'Acidic — corrosive. Must not be mixed with bleach or chlorine-based products.',ppe:'Nitrile gloves. Eye protection. Chemical apron. Ensure ventilation.',storage:'Store in original container, sealed, in cool dry location.',spill:'Neutralise with sodium bicarbonate. Absorb with dry sand or earth. Do not wash to drain.',first:'Eyes: flush with water for 15 minutes. Seek medical advice immediately if swallowed.'},
  {name:'Floor Cleaner / pH-Neutral Cleaner',desc:'General floor cleaner for hard floors, including stone, tile and laminate.',hazards:'Low hazard at use dilution. Slipping hazard on wet floors.',ppe:'Nitrile gloves. Non-slip footwear.',storage:'Store in original container.',spill:'Mop up. Deploy wet floor signs.',first:'Eyes: rinse with water. Skin: wash with soap and water.'},
].map(c=>`
<div class="dp-chem">
  <div class="dp-chem-name">${c.name}</div>
  <div class="dp-chem-grid">
    <div class="dp-chem-field"><div class="dp-chem-lbl">Use</div><div class="dp-chem-val">${c.desc}</div></div>
    <div class="dp-chem-field"><div class="dp-chem-lbl">Hazards</div><div class="dp-chem-val">${c.hazards}</div></div>
    <div class="dp-chem-field"><div class="dp-chem-lbl">PPE Required</div><div class="dp-chem-val">${c.ppe}</div></div>
    <div class="dp-chem-field"><div class="dp-chem-lbl">Storage</div><div class="dp-chem-val">${c.storage}</div></div>
    <div class="dp-chem-field"><div class="dp-chem-lbl">Spill Response</div><div class="dp-chem-val">${c.spill}</div></div>
    <div class="dp-chem-field"><div class="dp-chem-lbl">First Aid</div><div class="dp-chem-val">${c.first}</div></div>
  </div>
</div>`).join('')}
`)}

<!-- ═══════════ 05 — CAPABILITY ═══════════ -->
${p('05 &mdash; Capability Statement', `
<div class="dp-eyebrow">Document 05 &mdash; High Value</div>
<div class="dp-h">Capability Statement</div>
<div class="dp-lead">AskMiro Cleaning Services is a London-based commercial cleaning contractor delivering precision-led services across construction, commercial and managed property environments.</div>
<div class="dp-body">
<p>Operated under Miro Partners Ltd and director-led from inception, we combine operational rigour with responsive on-site management. Every engagement is managed directly — with structured communication, documented processes and accountability at every stage.</p>
<p>Our work spans all stages of construction cleaning, from first fix through to sparkle clean and developer handover, as well as ongoing commercial maintenance contracts across London.</p>
</div>
<div class="dp-h2">Core Services</div>
<div class="dp-body"><ul><li><strong>Builders Cleans</strong> — First fix, sparkle clean, handover clean, developer spec sign-off</li><li><strong>Commercial Cleaning</strong> — Offices, retail, managed workspaces</li><li><strong>Communal Areas</strong> — Residential and mixed-use developments</li><li><strong>Deep Cleaning</strong> — End-of-tenancy, pre-occupation, periodic resets</li><li><strong>Sector-Specific</strong> — Automotive showrooms, education, industrial</li></ul></div>
<div class="dp-h2">Sectors</div>
<div class="dp-body"><p>Construction &nbsp;&bull;&nbsp; Commercial &nbsp;&bull;&nbsp; Property Management &nbsp;&bull;&nbsp; Education &nbsp;&bull;&nbsp; Automotive &nbsp;&bull;&nbsp; Industrial &amp; Logistics</p></div>
<div class="dp-h2">Insurance</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;overflow:hidden;margin:10px 0">
  <div style="background:#fff;padding:20px 22px"><div style="font-size:9.5px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Employers' Liability</div><div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#0D1C2E;letter-spacing:-.02em">£10,000,000</div></div>
  <div style="background:#fff;padding:20px 22px;border-left:1px solid #e5e7eb"><div style="font-size:9.5px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Public Liability</div><div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#0D1C2E;letter-spacing:-.02em">£1,000,000</div></div>
</div>
<div class="dp-h2">Contact</div>
<div class="dp-body"><p>${CO} &nbsp;&bull;&nbsp; ${LEGAL}<br>${ADDR}<br>${EMAIL} &nbsp;&bull;&nbsp; ${WEB}</p></div>
`)}

<!-- ═══════════ 06 — CLEANING SPEC ═══════════ -->
${p('06 &mdash; Cleaning Specification', `
<div class="dp-eyebrow">Document 06 &mdash; High Value</div>
<div class="dp-h">Cleaning Specification</div>
<div class="dp-h2">Builders Clean — First Fix</div>
<div class="dp-body"><p>Removal of heavy construction debris, dust and waste from all internal surfaces following structural, mechanical and electrical first fix works. Does not include finishing works, sanitary ware or fixtures that are not yet installed.</p>
<ul><li>Vacuum and sweep all floors to remove plaster dust and construction debris</li><li>Wipe down all wall and ceiling surfaces to remove dust accumulation</li><li>Clear all rubbish from floor areas and remove from site in agreed skip/bags</li><li>Clean window frames (external dust and construction debris only at this stage)</li></ul></div>
<div class="dp-h2">Builders Clean — Second Fix (Sparkle Clean)</div>
<div class="dp-body"><p>Full clean of all installed surfaces, fixtures and fittings following completion of second fix works. This is the primary pre-handover clean.</p>
<ul><li>Clean all windows internally and externally (if accessible) to streak-free standard</li><li>Clean all UPVC door and window frames, sills and reveals</li><li>Remove all paint splashes, adhesive residue, labels and protective film from all surfaces</li><li>Clean and sanitise all sanitaryware — WCs, basins, baths, showers</li><li>Clean all kitchen units internally and externally including worktops and appliances</li><li>Clean all skirting boards, architraves, door frames and door sets</li><li>Vacuum all carpets and hard floors, mop all hard floors to clean standard</li><li>Remove all debris and rubbish from site on completion</li></ul></div>
<div class="dp-h2">Handover Clean — Developer Specification</div>
<div class="dp-body"><p>Final clean immediately prior to legal completion and key release to buyer or tenant. All items are cleaned to developer sign-off standard with photographic record maintained.</p>
<ul><li>All of the above sparkle clean items completed</li><li>Windows cleaned to finger-print free standard</li><li>All sanitaryware polished and dry</li><li>All chrome fittings polished</li><li>All hard floors mopped to streak-free standard</li><li>All carpets freshly vacuumed and presented</li><li>Sign-off sheet completed by AskMiro supervisor and counter-signed by site manager</li></ul></div>
<div class="dp-h2">Commercial Cleaning</div>
<div class="dp-body"><ul><li>Desk and hard surface cleaning (spray and wipe)</li><li>Vacuuming all carpeted areas</li><li>Mopping all hard floor areas</li><li>Toilet and kitchen cleaning and sanitising</li><li>Emptying bins and replacing liners</li><li>Spot-cleaning glass partitions and doors</li><li>Replenishing consumables where specified</li></ul></div>
`)}

<!-- ═══════════ 07 — QUALITY CONTROL ═══════════ -->
${p('07 &mdash; Quality Control', `
<div class="dp-eyebrow">Document 07 &mdash; High Value</div>
<div class="dp-h">Quality Control Procedure</div>
<div class="dp-body" style="margin-bottom:20px"><p>AskMiro Cleaning Services operates a structured quality control process on all contracts. This ensures consistent output, early identification of defects and a clear audit trail for clients.</p></div>
<div class="dp-h2">Site Inspection Process</div>
<div class="dp-steps">
${[
  ['Pre-Clean Inspection','Supervisor documents existing defects and damage prior to cleaning commencement. Photographs taken and shared with site manager. This protects AskMiro and the client.'],
  ['In-Clean Quality Checks','Supervisor conducts rolling checks throughout the clean using the standard checklist. Any areas not meeting standard are rectified before moving to the next zone.'],
  ['Post-Clean Inspection','Supervisor completes a full room-by-room inspection using the QC checklist. Sign-off sheet prepared.'],
  ['Client / Site Manager Sign-Off','Site manager or developer representative conducts walkthrough with AskMiro supervisor. Any snags are logged and rectified within agreed timeframe. Final sign-off obtained.'],
  ['Issue Resolution','Any issues raised post-sign-off are responded to within 24 hours. Remedial works are carried out at no additional cost where the issue falls within the contracted scope.'],
].map(([t,b],i)=>`<div class="dp-step"><div class="dp-step-num">${String(i+1).padStart(2,'0')}</div><div><div class="dp-step-title">${t}</div><div class="dp-step-body">${b}</div></div></div>`).join('')}
</div>
<div class="dp-h2">Site Inspection Checklist</div>
<div class="dp-check">
${['All windows cleaned to streak-free standard','All UPVC frames, sills and reveals wiped clean','Paint splashes and adhesive residue removed from all surfaces','All sanitaryware cleaned and sanitised','All kitchen units and appliances cleaned inside and out','All skirting boards and architraves wiped down','All hard floors vacuumed and mopped','All carpeted areas vacuumed','All debris removed from site','Waste disposal confirmed and documented','No damage to surfaces or fittings caused during cleaning','Chemicals and equipment removed from site','Sign-off sheet completed and photographed'].map(item=>`<div class="dp-check-item"><div class="dp-check-box"></div>${item}</div>`).join('')}
</div>
`)}

<!-- ═══════════ 08 — ENVIRONMENTAL ═══════════ -->
${p('08 &mdash; Environmental Policy', `
<div class="dp-eyebrow">Document 08 &mdash; High Value</div>
<div class="dp-h">Environmental Policy</div>
<div class="dp-policy"><div class="dp-policy-title">Statement of Intent</div><div class="dp-policy-body">AskMiro Cleaning Services is committed to minimising the environmental impact of our operations. We will comply with all applicable environmental legislation and continuously seek to improve our environmental performance.</div></div>
<div class="dp-h2">Waste Management</div>
<div class="dp-body"><ul><li>All waste is segregated at source into general, recyclable and COSHH/hazardous streams</li><li>COSHH and chemical waste is disposed of via licensed waste carriers in accordance with Hazardous Waste Regulations</li><li>Waste transfer notes are retained for all commercial waste removed from site</li><li>Cardboard, plastics and metals from construction waste streams are recycled where facilities are available on site</li><li>Single-use plastic use is minimised — reusable containers and refillable dispensers are used as standard</li></ul></div>
<div class="dp-h2">Chemical Control</div>
<div class="dp-body"><ul><li>All chemicals selected are the minimum hazard necessary for the task</li><li>Chemicals are used at manufacturer-recommended dilution rates — overdosing is prohibited</li><li>Biodegradable and eco-labelled products are preferred where available at equivalent efficacy</li><li>Chemical containers are returned to supplier or disposed of responsibly — no drain disposal unless SDS confirms safety</li></ul></div>
<div class="dp-h2">Sustainability Approach</div>
<div class="dp-body"><ul><li>Microfibre cloths and mops are used in preference to disposable wipes wherever possible</li><li>Water usage is minimised — controlled dispensing and efficient equipment used</li><li>Vehicle routes are planned to minimise unnecessary mileage</li><li>Environmental awareness is included in all operative inductions</li><li>This policy is reviewed annually and when significant operational changes occur</li></ul></div>
<div class="dp-sig"><div class="dp-sig-cell"><div class="dp-sig-name">Director, AskMiro Cleaning Services</div><div class="dp-sig-role">Date: ${_esc(d.date)}</div></div><div class="dp-sig-cell"><div class="dp-sig-name">Review Date</div><div class="dp-sig-role">Annually</div></div></div>
`)}

<!-- ═══════════ 09 — PPE POLICY ═══════════ -->
${p('09 &mdash; PPE Policy', `
<div class="dp-eyebrow">Document 09 &mdash; Site Level</div>
<div class="dp-h">PPE Policy</div>
<div class="dp-body" style="margin-bottom:20px"><p>AskMiro Cleaning Services provides all required personal protective equipment (PPE) to its operatives free of charge. All PPE complies with the requirements of the Personal Protective Equipment at Work Regulations 1992.</p></div>
<table class="dp-tbl">
<thead><tr><th>PPE Item</th><th>Standard / Specification</th><th>When Required</th></tr></thead>
<tbody>
${[
  ['Safety footwear','Minimum S1P rated, steel toe cap and midsole','All construction sites and industrial environments'],
  ['Hi-visibility vest / jacket','EN ISO 20471 Class 2 minimum','All active construction sites at all times'],
  ['Hard hat','EN 397 Industrial Safety Helmet','All areas designated by the principal contractor'],
  ['Nitrile gloves','Chemical resistant, minimum 0.12mm thickness','When handling all cleaning chemicals'],
  ['FFP2 dust mask','EN149:2001+A1:2009','During dry debris clearance and dusty environments'],
  ['Safety glasses / goggles','EN 166 rated impact and chemical splash','When using spray chemicals or working overhead'],
  ['Chemical apron','Polyethylene or PVC coated','When using concentrated acids, bleach or corrosive chemicals'],
  ['Knee pads','Where extended floor-level work is required','Optional — provided on request'],
].map(([a,b,c])=>`<tr><td style="font-weight:600">${a}</td><td>${b}</td><td>${c}</td></tr>`).join('')}
</tbody></table>
<div class="dp-h2">PPE Rules</div>
<div class="dp-body"><ul>
<li>PPE is the last line of defence — engineering controls and safe systems of work are implemented first</li>
<li>No operative may commence work on a construction site without the minimum required PPE</li>
<li>Defective or damaged PPE must be reported immediately and replaced before work continues</li>
<li>PPE must not be shared between operatives without cleaning and inspection</li>
<li>Supervisor is responsible for daily PPE compliance checks</li>
</ul></div>
`)}

<!-- ═══════════ 10 — TRAINING ═══════════ -->
${p('10 &mdash; Training &amp; Competency', `
<div class="dp-eyebrow">Document 10 &mdash; Site Level</div>
<div class="dp-h">Training &amp; Competency Statement</div>
<div class="dp-body" style="margin-bottom:20px"><p>AskMiro Cleaning Services ensures that all operatives are adequately trained and competent to carry out their assigned tasks safely and to the required standard before deployment on any contract.</p></div>
<div class="dp-h2">Operative Onboarding</div>
<div class="dp-steps">
${[
  ['Company Induction','All new operatives receive a company induction covering H&S policy, COSHH procedures, PPE requirements, emergency procedures and conduct expectations before their first assignment.'],
  ['COSHH Awareness Briefing','All operatives receive a COSHH briefing covering all chemicals in use. Chemical awareness is refreshed when new products are introduced or when assessments change.'],
  ['RAMS Briefing','All operatives are briefed on the relevant RAMS before each new contract. Briefing signature sheets are completed and retained on file.'],
  ['On-Site Supervision','All new operatives work under direct supervision of an experienced team leader for their first three assignments. Sign-off on competency is required before solo deployment.'],
  ['Site-Specific Inductions','All operatives complete site-specific inductions as required by the principal contractor. Records are maintained and available for inspection.'],
].map(([t,b],i)=>`<div class="dp-step"><div class="dp-step-num">${String(i+1).padStart(2,'0')}</div><div><div class="dp-step-title">${t}</div><div class="dp-step-body">${b}</div></div></div>`).join('')}
</div>
<div class="dp-h2">Skills Development</div>
<div class="dp-body"><ul>
<li>Annual refresher training on COSHH, manual handling and emergency procedures</li>
<li>Toolbox talks conducted at the start of each new site or contract phase</li>
<li>Any operative identified as underperforming in safety or quality standards is removed from site and subject to retraining before redeployment</li>
<li>Training records are maintained on file for all operatives and available for inspection by principal contractors</li>
</ul></div>
`)}

<!-- ═══════════ 11 — INCIDENT PROCEDURE ═══════════ -->
${p('11 &mdash; Incident Procedure', `
<div class="dp-eyebrow">Document 11 &mdash; Site Level</div>
<div class="dp-h">Accident &amp; Incident Procedure</div>
<div class="dp-h2">Immediate Response</div>
<div class="dp-steps">
${[
  ['Ensure Safety','Remove persons from immediate danger. Call 999 if there is a risk to life. Do not put yourself or others at further risk.'],
  ['First Aid','Contact site first aider immediately. Administer appropriate first aid. Do not move an injured person unless there is immediate danger to life.'],
  ['Notify Supervisor','The site supervisor must be notified of any accident, incident or near-miss immediately, regardless of severity.'],
  ['Preserve the Scene','Where safe to do so, preserve the scene of the incident to support investigation. Take photographs. Do not disturb evidence.'],
  ['Notify Director','The AskMiro Director must be informed of any injury or significant incident within one hour. Contact: info@askmiro.com'],
].map(([t,b],i)=>`<div class="dp-step"><div class="dp-step-num">${String(i+1).padStart(2,'0')}</div><div><div class="dp-step-title">${t}</div><div class="dp-step-body">${b}</div></div></div>`).join('')}
</div>
<div class="dp-h2">Documentation</div>
<div class="dp-body"><ul>
<li>All accidents, incidents and near-misses must be recorded in the incident log within 24 hours</li>
<li>Record must include: date, time, location, persons involved, nature of incident, injuries sustained, first aid given, immediate action taken</li>
<li>Photographs of the scene and any injuries must be taken and attached to the incident record</li>
</ul></div>
<div class="dp-h2">RIDDOR Reporting</div>
<div class="dp-body"><p>The Director is responsible for reporting to the Health and Safety Executive under RIDDOR 2013 where required. Reportable events include: deaths, specified injuries, over-7-day incapacitation injuries, dangerous occurrences and occupational disease. Reports must be made within the required timeframe (immediately for fatalities and specified injuries; within 15 days for over-7-day injuries).</p></div>
`)}

<!-- ═══════════ 12 — TOOLBOX TALK ═══════════ -->
${p('12 &mdash; Toolbox Talk Template', `
<div class="dp-eyebrow">Document 12 &mdash; Site Level</div>
<div class="dp-h">Toolbox Talk Template</div>
<div class="dp-info"><div class="dp-info-body">This template is used by AskMiro supervisors at the start of each new site, at the beginning of each contract phase, and whenever a specific safety topic needs to be addressed. Duration: 5–10 minutes.</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;overflow:hidden;margin:14px 0">
${[['Site / Location',''],['Date',''],['Supervisor',''],['Topic',''],['Attendees (count)',''],['Duration','']].map(([l,v])=>`<div style="background:#fff;padding:12px 14px"><div style="font-size:9px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${l}</div><div style="font-size:12px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;min-height:22px;color:#0D1C2E">${v}</div></div>`).join('')}
</div>
<div class="dp-h2">Structure</div>
<div class="dp-steps">
${[
  ['Introduction — 1 minute','State the topic. Explain why it is being discussed today — reference a recent incident, upcoming task change or seasonal hazard.'],
  ['Key Points — 3–5 minutes','Cover the main safety points relevant to the topic. Keep to 3–5 clear, practical points. Use examples from this site where possible.'],
  ['What To Do If — 1–2 minutes','Cover the action to take if the hazard is encountered or the situation arises. Make it practical and specific to this team.'],
  ['Questions — 1–2 minutes','Ask if there are any questions. Specifically ask if anyone has any concerns about the upcoming work.'],
  ['Sign-Off','All attendees sign the attendance sheet. Supervisor retains the record and submits to AskMiro Director.'],
].map(([t,b],i)=>`<div class="dp-step"><div class="dp-step-num">${String(i+1).padStart(2,'0')}</div><div><div class="dp-step-title">${t}</div><div class="dp-step-body">${b}</div></div></div>`).join('')}
</div>
<div class="dp-h2">Attendance Register</div>
<table class="dp-tbl">
<thead><tr><th>#</th><th>Name</th><th>Role</th><th>Signature</th></tr></thead>
<tbody>${[1,2,3,4,5,6,7,8].map(n=>`<tr><td>${n}</td><td style="min-width:140px">&nbsp;</td><td style="min-width:100px">&nbsp;</td><td style="min-width:140px">&nbsp;</td></tr>`).join('')}</tbody>
</table>
`)}

<!-- ═══════════ 13 — SUBCONTRACTOR POLICY ═══════════ -->
${p('13 &mdash; Subcontractor Policy', `
<div class="dp-eyebrow">Document 13 &mdash; Site Level</div>
<div class="dp-h">Subcontractor Policy</div>
<div class="dp-body" style="margin-bottom:20px"><p>Where AskMiro Cleaning Services engages subcontractors to assist with the delivery of contracted services, those subcontractors are selected, vetted and managed in accordance with this policy. Principal contractors can rely on AskMiro to maintain the same standards across all labour deployed on their sites, whether employed directly or subcontracted.</p></div>
<div class="dp-h2">Selection &amp; Vetting</div>
<div class="dp-body"><ul>
<li>All subcontractors must provide evidence of public liability insurance (minimum £1M) before deployment</li>
<li>All subcontractors must complete a company health and safety questionnaire</li>
<li>All subcontractors must confirm they operate COSHH and PPE procedures consistent with AskMiro standards</li>
<li>References are obtained for all subcontractors used on high-value or regulated contracts</li>
</ul></div>
<div class="dp-h2">On-Site Management</div>
<div class="dp-body"><ul>
<li>Subcontractors work under the direct supervision of an AskMiro supervisor on all construction sites</li>
<li>AskMiro RAMS and COSHH documentation applies to all subcontractors on AskMiro contracts</li>
<li>All subcontractors complete the same site induction process as directly employed operatives</li>
<li>AskMiro retains overall responsibility to the principal contractor for quality and safety regardless of subcontracting arrangement</li>
</ul></div>
`)}

<!-- ═══════════ 14 — MOBILISATION PLAN ═══════════ -->
${p('14 &mdash; Mobilisation Plan', `
<div class="dp-eyebrow">Document 14 &mdash; Site Level</div>
<div class="dp-h">Mobilisation Plan</div>
<div class="dp-body" style="margin-bottom:20px"><p>AskMiro Cleaning Services follows a structured mobilisation process for all new contracts. This ensures that operatives are briefed, equipped and compliant before work commences on site.</p></div>
<div class="dp-h2">Mobilisation Timeline</div>
<table class="dp-tbl">
<thead><tr><th style="width:20%">Stage</th><th style="width:25%">Timeframe</th><th>Actions</th></tr></thead>
<tbody>
${[
  ['Contract Award','Immediately on award','Director acknowledges contract. Site and scope details logged. Resource planning commenced.'],
  ['Pre-Mobilisation','5–7 days before start','RAMS prepared or reviewed. COSHH assessments confirmed. PPE checked and restocked. Operatives allocated and briefed on contract scope.'],
  ['Site Registration','3–5 days before start','Site induction process confirmed with principal contractor. Any site-specific documentation requirements confirmed and completed.'],
  ['T-2 Days','2 days before start','Equipment and materials loaded and checked. Team confirmed. Travel routes and site access confirmed. Emergency contact list updated.'],
  ['Day 1 — Start','On commencement','Pre-start briefing: RAMS, COSHH, PPE check. Site walkthrough with site manager. Commence works per method statement.'],
  ['Ongoing','Throughout contract','Weekly supervisor check-ins. Quality control inspections per QC procedure. Issues logged and escalated within 24 hours.'],
].map(([s,t,a])=>`<tr><td style="font-weight:700">${s}</td><td style="color:#6b7280">${t}</td><td>${a}</td></tr>`).join('')}
</tbody></table>
<div class="dp-h2">Key Contact Structure</div>
<div class="dp-body"><ul>
<li><strong>AskMiro Director</strong> — overall contract responsibility, escalation, sign-off</li>
<li><strong>Site Supervisor</strong> — day-to-day site management, quality control, team coordination</li>
<li><strong>Principal Contractor Contact</strong> — site manager or contracts manager as designated</li>
</ul></div>
`)}

<!-- ═══════════ 15 — SITE COMMS PLAN ═══════════ -->
${p('15 &mdash; Site Communication Plan', `
<div class="dp-eyebrow">Document 15 &mdash; Site Level</div>
<div class="dp-h">Site Communication Plan</div>
<div class="dp-body" style="margin-bottom:20px"><p>Clear communication is fundamental to safe and successful contract delivery. This document defines the reporting structure, communication standards and escalation procedure for all AskMiro site contracts.</p></div>
<div class="dp-h2">Reporting Structure</div>
<div class="dp-steps">
${[
  ['Operative → Supervisor','All operatives report to the AskMiro site supervisor. Safety concerns, quality issues, access problems and near-misses must be reported to the supervisor immediately.'],
  ['Supervisor → AskMiro Director','The supervisor briefs the director at the end of each working day on contract progress, issues and any safety matters. Significant events are escalated immediately by phone.'],
  ['AskMiro Director → Principal Contractor','The director communicates directly with the designated principal contractor contact for all contract-level matters: scope changes, programme updates, quality concerns and access issues.'],
  ['AskMiro Director → Client','For direct client contracts, the director provides end-of-clean sign-off documentation and responds to any concerns within 24 hours.'],
].map(([t,b],i)=>`<div class="dp-step"><div class="dp-step-num">${String(i+1).padStart(2,'0')}</div><div><div class="dp-step-title">${t}</div><div class="dp-step-body">${b}</div></div></div>`).join('')}
</div>
<div class="dp-h2">Communication Standards</div>
<div class="dp-body"><ul>
<li><strong>Response time:</strong> All queries from principal contractors and clients are responded to within 4 business hours</li>
<li><strong>Daily update:</strong> End-of-day email confirming works completed, areas outstanding and any issues — provided on all contracts of 5+ days duration</li>
<li><strong>Sign-off documentation:</strong> Provided within 2 hours of completion of each clean</li>
<li><strong>Incident notification:</strong> Principal contractor notified immediately by phone of any safety incident, followed by written report within 24 hours</li>
<li><strong>Programme changes:</strong> Any inability to meet programme communicated to principal contractor minimum 48 hours in advance</li>
</ul></div>
<div class="dp-h2">Contact Details</div>
<div style="background:#f8fafc;border-left:3px solid #0D9488;padding:16px 18px;margin-top:8px">
  <div style="font-size:12px;color:#374151;line-height:2">${CO} &nbsp;&bull;&nbsp; ${LEGAL}<br>
  ${ADDR}<br>
  ${EMAIL} &nbsp;&bull;&nbsp; ${WEB}</div>
</div>
<div class="dp-sig" style="margin-top:28px">
  <div class="dp-sig-cell"><div class="dp-sig-name">Director, AskMiro Cleaning Services</div><div class="dp-sig-role">Miro Partners Ltd &nbsp;&bull;&nbsp; ${_esc(d.date)}</div></div>
  <div class="dp-sig-cell"><div class="dp-sig-name">Document Reference</div><div class="dp-sig-role">${_esc(d.rev)} &nbsp;&bull;&nbsp; Confidential</div></div>
</div>
`)}

</div>`; /* end dp-doc */
  }

  // ── RENDER ────────────────────────────────────────────────────
  async function render() {
    const osUrl = (window.CFG && window.CFG.OS_URL) || 'https://precious-essence.up.railway.app';
    const mc = document.getElementById('main-content');
    mc.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;padding:40px">
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:40px 48px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.06)">
          <div style="width:48px;height:48px;background:linear-gradient(135deg,#0DBDAD,#0A9688);border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:22px">🚀</div>
          <h2 style="margin:0 0 10px;font-size:1.25rem;font-weight:800;color:#0F172A;letter-spacing:-.02em">This module has moved</h2>
          <p style="margin:0 0 28px;font-size:14px;color:#64748B;line-height:1.65">
            This section is now part of <strong style="color:#0F172A">AskMiro OS</strong> — the unified operations platform on Railway.
            All your data is there.
          </p>
          <a href="${osUrl}" target="_blank" rel="noopener"
            style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff;padding:12px 28px;border-radius:9px;font-size:14px;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(10,150,136,.3)">
            Open AskMiro OS →
          </a>
          <p style="margin:20px 0 0;font-size:12px;color:#94A3B8">
            Outreach &amp; Email remain here in Ops.
          </p>
        </div>
      </div>`;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────
  return { render, openPackModal, _gen };
})();
