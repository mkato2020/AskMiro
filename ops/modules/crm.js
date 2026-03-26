// ============================================================
// AskMiro Ops — CRM  v2.0  (full sales journey edition)
// ============================================================
window.CRM = (() => {
  let _leads = [];
  let _view = 'pipeline';
  let _filter = 'all';
  let _q = '';
  let _selectedLead = null;

  const STAGES = ['New','Contacted','Qualified','QuoteSent','Negotiating','Won','Lost'];
  const STAGE_META = {
    New:         { color: '#64748B', bg: '#F1F5F9', label: 'New',          icon: '◎' },
    Contacted:   { color: '#0284C7', bg: '#E0F2FE', label: 'Contacted',    icon: '◉' },
    Qualified:   { color: '#7C3AED', bg: '#EDE9FE', label: 'Qualified',    icon: '◈' },
    QuoteSent:   { color: '#0D9488', bg: '#F0FDF9', label: 'Quote Sent',   icon: '◆' },
    Negotiating: { color: '#D97706', bg: '#FFFBEB', label: 'Negotiating',  icon: '◇' },
    Won:         { color: '#059669', bg: '#ECFDF5', label: 'Won',          icon: '★' },
    Lost:        { color: '#DC2626', bg: '#FEF2F2', label: 'Lost',         icon: '✕' },
  };
  const SEGMENT_ICON = { Office:'🏢', Healthcare:'🏥', School:'🏫', Gym:'💪', Industrial:'🏭', Automotive:'🚗', Residential:'🏠' };

  // Qualification fields — all 4 required before stage can move to Qualified
  const QUAL_FIELDS = [
    { id: 'qualPremisesSize',    label: 'Premises size',               ph: 'e.g. 500m² / 2 floors / 8 offices' },
    { id: 'qualCurrentProvider', label: 'Current cleaning provider',   ph: 'e.g. ABC Cleaning, ends March 2026 / No current provider' },
    { id: 'qualDecisionMaker',   label: 'Decision-maker confirmed',    ph: 'e.g. Sarah Collins, Facilities Manager — budget holder' },
    { id: 'qualStartDate',       label: 'Earliest start / TUPE?',      ph: 'e.g. 1 April 2026 / TUPE — 2 cleaners may transfer' },
  ];

  // Onboarding checklist shown on Win
  const ONBOARDING_STEPS = [
    'Schedule site survey within 48 hours',
    'Induct cleaning team — brief to site spec',
    'Collect keyholder / access details',
    'Set cleaning schedule in Ops module',
    'Send insurance & RAMS docs to client',
    'Assess TUPE obligations (existing staff transfer?)',
    'Create contract record in Contracts module',
    'Send Welcome Onboard email via Email module',
  ];

  // ── HELPERS ───────────────────────────────────────────────
  function _esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _isOverdue(lead) {
    if (!lead.nextActionDate) return false;
    return new Date(lead.nextActionDate) < new Date() && lead.status !== 'Won' && lead.status !== 'Lost';
  }

  function _isQualified(lead) {
    return QUAL_FIELDS.every(f => lead[f.id] && String(lead[f.id]).trim().length > 0);
  }

  function _activityLog(lead) {
    try { return JSON.parse(lead.activityLog || '[]'); } catch { return []; }
  }

  function _fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }

  function _timeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr);
    if (diff < 0) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(diff / 86400000);
    if (days === 1) return 'Yesterday';
    return days + 'd ago';
  }

  function _segmentFromService(serviceType) {
    if (!serviceType) return null;
    const s = serviceType.toLowerCase();
    if (s.includes('healthcare') || s.includes('medical')) return 'Healthcare';
    if (s.includes('school') || s.includes('education')) return 'School';
    if (s.includes('gym') || s.includes('leisure') || s.includes('sport')) return 'Gym';
    if (s.includes('warehouse') || s.includes('industrial') || s.includes('factory')) return 'Industrial';
    if (s.includes('automotive') || s.includes('dealership')) return 'Automotive';
    if (s.includes('residential') || s.includes('end of tenancy') || s.includes('airbnb')) return 'Residential';
    if (s.includes('deep clean') || s.includes('one-off')) return 'Residential';
    if (s.includes('oven') || s.includes('kitchen') || s.includes('commercial')) return 'Industrial';
    if (s.includes('office')) return 'Office';
    return null;
  }

  // ── RENDER ────────────────────────────────────────────────
  async function render() {
    const app = document.getElementById('main-content');
    app.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ll)"><div class="spinner" style="margin:0 auto 12px"></div>Loading CRM…</div>`;
    try { _leads = await API.get('leads'); } catch(e) { _leads = []; UI.toast('Could not load leads: ' + e.message, 'a'); }
    updateBadge();
    _draw();
  }

  function updateBadge() {
    const n = _leads.filter(l => l.status === 'New').length;
    const el = document.getElementById('badge-crm');
    if (el) { el.textContent = n; el.style.display = n > 0 ? '' : 'none'; }
  }

  function _filtered() {
    let leads = _leads;
    if (_filter !== 'all') leads = leads.filter(l => l.status === _filter);
    if (_q) leads = leads.filter(l =>
      [l.companyName,l.contactName,l.email,l.segment,l.source,l.status]
        .join(' ').toLowerCase().includes(_q.toLowerCase()));
    return leads;
  }

  function _stats() {
    const active = _leads.filter(l => !['Won','Lost'].includes(l.status));
    const won = _leads.filter(l => l.status === 'Won');
    const overdue = _leads.filter(l => _isOverdue(l));
    const pipeline = active.reduce((s,l) => s + parseFloat(l.annualValue||0), 0);
    const wonVal = won.reduce((s,l) => s + parseFloat(l.annualValue||0), 0);
    const convRate = _leads.length > 0 ? Math.round(won.length / _leads.length * 100) : 0;
    return { total: _leads.length, active: active.length, pipeline, wonVal, convRate, won: won.length, overdue: overdue.length };
  }

  function _draw() {
    const leads = _filtered();
    const s = _stats();

    const statsBar = `
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px">
      ${[
        { label: 'Total Leads',     val: s.total,           sub: 'in CRM',          color: '#0D9488' },
        { label: 'Active Pipeline', val: s.active,          sub: 'in progress',     color: '#7C3AED' },
        { label: 'Pipeline Value',  val: UI.fmtk(s.pipeline), sub: 'annual est.',   color: '#0284C7' },
        { label: 'Won Value',       val: UI.fmtk(s.wonVal), sub: 'closed won',      color: '#059669' },
        { label: 'Win Rate',        val: s.convRate + '%',  sub: s.won + ' won',    color: '#D97706' },
        { label: 'Overdue Actions', val: s.overdue,         sub: 'follow-ups due',  color: s.overdue > 0 ? '#DC2626' : '#94A3B8' },
      ].map(k => `
        <div style="background:#fff;border:1px solid ${k.label==='Overdue Actions'&&k.val>0?'#FECACA':'#E5E7EB'};border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:all .18s ease;cursor:default"
             onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.08)'"
             onmouseleave="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:5px">${k.label}</div>
          <div style="font-family:'Outfit',sans-serif;font-size:24px;font-weight:800;letter-spacing:-1px;color:${k.color};line-height:1">${k.val}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:3px">${k.sub}</div>
        </div>`).join('')}
    </div>`;

    const toolbar = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <div style="display:flex;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:9px;padding:3px;gap:2px">
        ${[['pipeline','Pipeline'],['list','List'],['activity','Activity']].map(([v,l]) => `
          <button onclick="CRM._setView('${v}')" style="font-size:12.5px;font-weight:600;padding:6px 14px;border-radius:7px;cursor:pointer;border:none;transition:all .15s ease;background:${_view===v?'#fff':'transparent'};color:${_view===v?'#0D9488':'#64748B'};box-shadow:${_view===v?'0 1px 4px rgba(0,0,0,.08)':'none'}">${l}</button>
        `).join('')}
      </div>
      <div style="display:flex;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:9px;padding:3px;gap:2px;overflow-x:auto">
        ${[['all','All'],['New','New'],['Qualified','Qualified'],['QuoteSent','Quote Sent'],['Negotiating','Negotiating'],['Won','Won']].map(([v,l]) => `
          <button onclick="CRM._setFilter('${v}')" style="font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:6px;cursor:pointer;border:none;white-space:nowrap;transition:all .15s;background:${_filter===v?'#0D9488':'transparent'};color:${_filter===v?'#fff':'#64748B'}">${l}</button>
        `).join('')}
      </div>
      <div style="position:relative;flex:1;min-width:180px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#94A3B8;font-size:13px">⌕</span>
        <input class="fsearch" placeholder="Search leads, contacts, companies…" value="${_q.replace(/"/g,'&quot;')}"
          oninput="CRM._search(this.value)"
          style="width:100%;padding-left:30px;background:#fff;border:1px solid #E2E8F0;border-radius:9px;font-size:13px">
      </div>
      <div style="flex:1"></div>
      <button onclick="CRM.openNewLead()" style="background:#0D9488;color:#fff;border:none;border-radius:9px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(13,148,136,.3);transition:all .15s"
        onmouseenter="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(13,148,136,.4)'"
        onmouseleave="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(13,148,136,.3)'">
        <span style="font-size:16px;line-height:1">+</span> New Lead
      </button>
    </div>`;

    let viewHTML = '';
    if (_view === 'pipeline') viewHTML = _pipelineView(leads);
    else if (_view === 'list') viewHTML = _listView(leads);
    else viewHTML = _activityView(leads);

    document.getElementById('main-content').innerHTML = statsBar + toolbar + viewHTML;
  }

  // ── PIPELINE (KANBAN) VIEW ────────────────────────────────
  function _pipelineView(leads) {
    const stages = STAGES.filter(s => s !== 'Lost');
    return `
    <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;align-items:flex-start">
      ${stages.map(st => {
        const meta = STAGE_META[st];
        const items = leads.filter(l => l.status === st);
        const stageVal = items.reduce((s,l)=>s+parseFloat(l.annualValue||0),0);
        return `
        <div style="min-width:200px;max-width:220px;flex:1;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
          <div style="padding:12px 14px 10px;border-bottom:1px solid #E5E7EB;background:#fff">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:13px">${meta.icon}</span>
                <span style="font-size:12px;font-weight:700;color:${meta.color}">${meta.label}</span>
              </div>
              <span style="background:${meta.bg};color:${meta.color};font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">${items.length}</span>
            </div>
            ${stageVal > 0 ? `<div style="font-size:10.5px;color:#94A3B8;font-weight:500">${UI.fmtk(stageVal)}/yr est.</div>` : ''}
          </div>
          <div style="padding:8px;display:flex;flex-direction:column;gap:6px;min-height:80px">
            ${items.length === 0
              ? `<div style="text-align:center;padding:20px 8px;font-size:11px;color:#CBD5E1;font-style:italic">No leads here</div>`
              : items.map(l => _pipelineCard(l)).join('')}
          </div>
        </div>`;
      }).join('')}
      <div style="min-width:60px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;cursor:pointer"
           onclick="CRM._setFilter('Lost');CRM._setView('list')">
        <div style="padding:14px 8px;text-align:center">
          <div style="font-size:16px;margin-bottom:4px">✕</div>
          <div style="font-size:10px;font-weight:700;color:#DC2626;writing-mode:vertical-rl;margin:0 auto">${leads.filter(l=>l.status==='Lost').length} Lost</div>
        </div>
      </div>
    </div>`;
  }

  function _pipelineCard(l) {
    const meta = STAGE_META[l.status] || STAGE_META['New'];
    const seg = l.segment || _segmentFromService(l.serviceType) || '';
    const initials = UI.initials(l.companyName || l.contactName || '?');
    const overdue = _isOverdue(l);
    const qualDone = _isQualified(l);
    return `
    <div onclick='CRM.openDetail(${JSON.stringify(JSON.stringify(l))})'
      style="background:#fff;border:1px solid ${overdue?'#FCA5A5':'#E5E7EB'};border-radius:10px;padding:11px 12px;cursor:pointer;transition:all .18s ease;position:relative"
      onmouseenter="this.style.borderColor='${overdue?'#EF4444':'#0D9488'}';this.style.boxShadow='0 4px 14px rgba(13,148,136,.12)';this.style.transform='translateY(-1px)'"
      onmouseleave="this.style.borderColor='${overdue?'#FCA5A5':'#E5E7EB'}';this.style.boxShadow='';this.style.transform=''">
      ${overdue ? `<div style="position:absolute;top:8px;right:8px;width:7px;height:7px;border-radius:50%;background:#EF4444"></div>` : ''}
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
        <div style="width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#0D9488,#0284C7);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="font-size:10px;font-weight:800;color:#fff">${initials}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:700;color:#1F2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.companyName || '—'}</div>
          <div style="font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.contactName || ''}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:6px">
        ${seg ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#F1F5F9;color:#64748B;font-weight:600">${SEGMENT_ICON[seg]||''}${seg}</span>` : ''}
        ${l.status === 'Contacted' && !qualDone ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#FEF3C7;color:#92400E;font-weight:600">Qualify →</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        ${l.annualValue ? `<span style="font-size:11.5px;font-weight:700;color:#0D9488">${UI.fmtk(l.annualValue)}<span style="font-weight:400;color:#94A3B8">/yr</span></span>` : '<span></span>'}
        <span style="font-size:10px;color:${overdue?'#EF4444':'#CBD5E1'}">${overdue ? '⚠ overdue' : _timeAgo(l.createdAt)}</span>
      </div>
      ${l.nextActionDate && !overdue ? `<div style="margin-top:6px;font-size:10px;color:#0D9488;font-weight:600">↗ ${_fmtDate(l.nextActionDate)}</div>` : ''}
    </div>`;
  }

  // ── LIST VIEW ─────────────────────────────────────────────
  function _listView(leads) {
    return `
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04)">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#F8FAFC;border-bottom:1px solid #E5E7EB">
            <th style="text-align:left;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8">Company</th>
            <th style="text-align:left;padding:11px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8">Contact</th>
            <th style="text-align:left;padding:11px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8">Segment</th>
            <th style="text-align:left;padding:11px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8">Stage</th>
            <th style="text-align:right;padding:11px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8">Value/yr</th>
            <th style="text-align:left;padding:11px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8">Next Action</th>
            <th style="text-align:right;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${leads.length === 0
            ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:#94A3B8;font-size:13px">No leads found</td></tr>`
            : leads.map((l) => {
              const meta = STAGE_META[l.status] || STAGE_META['New'];
              const initials = UI.initials(l.companyName || '?');
              const overdue = _isOverdue(l);
              return `
              <tr onclick='CRM.openDetail(${JSON.stringify(JSON.stringify(l))})' style="border-bottom:1px solid #F8FAFC;cursor:pointer;transition:background .12s;background:${overdue?'#FFF5F5':''}"
                onmouseenter="this.style.background='#F0FDF9'" onmouseleave="this.style.background='${overdue?'#FFF5F5':''}'">
                <td style="padding:12px 16px">
                  <div style="display:flex;align-items:center;gap:9px">
                    <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#0D9488,#0284C7);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                      <span style="font-size:11px;font-weight:800;color:#fff">${initials}</span>
                    </div>
                    <div>
                      <div style="font-weight:700;color:#1F2937">${l.companyName || '—'}</div>
                      <div style="font-size:11px;color:#94A3B8;font-family:monospace">${l.id}</div>
                    </div>
                  </div>
                </td>
                <td style="padding:12px"><div style="color:#1F2937;font-weight:500">${l.contactName||'—'}</div><div style="font-size:11px;color:#94A3B8">${l.email||''}</div></td>
                <td style="padding:12px">${(()=>{const s=l.segment||_segmentFromService(l.serviceType)||'';return s?`<span style="font-size:12px">${SEGMENT_ICON[s]||''}</span> <span style="color:#475569">${s}</span>`:'<span style="color:#94A3B8">—</span>'})()}</td>
                <td style="padding:12px"><span style="background:${meta.bg};color:${meta.color};font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px">${meta.icon} ${meta.label}</span></td>
                <td style="padding:12px;text-align:right;font-weight:700;color:#0D9488">${l.annualValue ? UI.fmtk(l.annualValue) : '—'}</td>
                <td style="padding:12px">
                  ${l.nextActionDate ? `<span style="font-size:12px;font-weight:600;color:${overdue?'#DC2626':'#0D9488'}">${overdue?'⚠ ':''}${_fmtDate(l.nextActionDate)}</span>${l.nextActionNote?`<div style="font-size:11px;color:#94A3B8;margin-top:1px">${_esc(l.nextActionNote)}</div>`:''}`
                  : '<span style="color:#CBD5E1;font-size:12px">—</span>'}
                </td>
                <td style="padding:12px 16px;text-align:right">
                  <button onclick='event.stopPropagation();CRM.openDetail(${JSON.stringify(JSON.stringify(l))})' style="background:none;border:1px solid #E2E8F0;border-radius:6px;padding:4px 10px;font-size:11.5px;font-weight:600;color:#64748B;cursor:pointer;transition:all .12s"
                    onmouseenter="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
                    onmouseleave="this.style.borderColor='#E2E8F0';this.style.color='#64748B'">View</button>
                </td>
              </tr>`;
            }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── ACTIVITY VIEW ─────────────────────────────────────────
  function _activityView(leads) {
    const recent = [...leads].sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0)).slice(0, 20);
    return `
    <div style="display:grid;grid-template-columns:1fr 320px;gap:14px;align-items:start">
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04)">
        <div style="padding:14px 18px 10px;border-bottom:1px solid #F1F5F9">
          <div style="font-size:13px;font-weight:700;color:#1F2937">Recent Activity</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:1px">Latest leads and updates</div>
        </div>
        <div style="padding:8px 0">
          ${recent.length === 0
            ? `<div style="text-align:center;padding:32px;color:#94A3B8">No activity yet</div>`
            : recent.map(l => {
              const meta = STAGE_META[l.status] || STAGE_META['New'];
              const age = l.createdAt ? Math.floor((Date.now()-new Date(l.createdAt))/86400000) : 0;
              return `
              <div onclick='CRM.openDetail(${JSON.stringify(JSON.stringify(l))})' style="display:flex;align-items:center;gap:12px;padding:10px 18px;cursor:pointer;transition:background .12s;border-bottom:1px solid #F8FAFC"
                onmouseenter="this.style.background='#F0FDF9'" onmouseleave="this.style.background=''">
                <div style="width:8px;height:8px;border-radius:50%;background:${meta.color};flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:#1F2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.companyName} — <span style="color:${meta.color}">${meta.label}</span></div>
                  <div style="font-size:11px;color:#94A3B8">${l.contactName||''} ${l.email?'· '+l.email:''}</div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                  <div style="font-size:12px;font-weight:700;color:#0D9488">${l.annualValue?UI.fmtk(l.annualValue):''}</div>
                  <div style="font-size:10.5px;color:#CBD5E1">${_timeAgo(l.createdAt)}</div>
                </div>
              </div>`;
            }).join('')}
        </div>
      </div>
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04)">
        <div style="padding:14px 18px 10px;border-bottom:1px solid #F1F5F9">
          <div style="font-size:13px;font-weight:700;color:#1F2937">Pipeline by Stage</div>
        </div>
        <div style="padding:12px 16px">
          ${STAGES.map(st => {
            const meta = STAGE_META[st];
            const count = _leads.filter(l=>l.status===st).length;
            const pct = _leads.length > 0 ? Math.round(count/_leads.length*100) : 0;
            return `
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:12px;font-weight:600;color:${meta.color}">${meta.icon} ${meta.label}</span>
                <span style="font-size:12px;font-weight:700;color:#1F2937">${count}</span>
              </div>
              <div style="height:5px;background:#F1F5F9;border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${meta.color};border-radius:3px;transition:width .6s ease"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
  }

  // ── LEAD DETAIL PANEL ─────────────────────────────────────
  function openDetail(jsonStr) {
    const l = JSON.parse(jsonStr);
    _selectedLead = l;
    const meta = STAGE_META[l.status] || STAGE_META['New'];
    const segment = l.segment || _segmentFromService(l.serviceType) || '';
    const overdue = _isOverdue(l);
    const qualDone = _isQualified(l);
    const log = _activityLog(l);

    const stageButtons = STAGES.map(st => {
      const m = STAGE_META[st];
      const active = st === l.status;
      return `<button onclick="CRM.moveStage('${_esc(l.id)}','${st}')"
        style="flex:1;padding:6px 4px;border:1.5px solid ${active?m.color:'#E2E8F0'};border-radius:7px;background:${active?m.bg:'#fff'};color:${active?m.color:'#94A3B8'};font-size:10.5px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
        onmouseenter="if('${st}'!='${l.status}')this.style.borderColor='${m.color}';this.style.color='${m.color}'"
        onmouseleave="if('${st}'!='${l.status}')this.style.borderColor='#E2E8F0';this.style.color='#94A3B8'"
        >${m.icon} ${m.label}</button>`;
    }).join('');

    // Qualification section
    const qualSection = `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8">Qualification</div>
          ${qualDone
            ? `<span style="font-size:10px;font-weight:700;color:#059669;background:#ECFDF5;padding:2px 8px;border-radius:10px">✓ Complete</span>`
            : `<span style="font-size:10px;font-weight:700;color:#D97706;background:#FFFBEB;padding:2px 8px;border-radius:10px">⚠ Incomplete</span>`}
        </div>
        ${!qualDone ? `<div style="font-size:11px;color:#D97706;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:8px 10px;margin-bottom:8px;line-height:1.5">Complete all 4 fields before moving to <strong>Qualified</strong> stage.</div>` : ''}
        <div style="background:#F8FAFC;border:1px solid #F1F5F9;border-radius:10px;overflow:hidden">
          ${QUAL_FIELDS.map((f, i) => {
            const val = l[f.id] || '';
            const filled = val.trim().length > 0;
            return `
            <div style="${i>0?'border-top:1px solid #F1F5F9':''}">
              <div style="display:flex;align-items:flex-start;padding:9px 12px;gap:8px">
                <span style="font-size:13px;margin-top:1px;flex-shrink:0">${filled?'✅':'⬜'}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:10.5px;font-weight:700;color:#64748B;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px">${f.label}</div>
                  <input id="qual-${f.id}-${_esc(l.id)}" value="${_esc(val)}" placeholder="${_esc(f.ph)}"
                    style="width:100%;font-size:12.5px;color:#1F2937;background:transparent;border:none;outline:none;padding:0;font-family:inherit"
                    onblur="CRM.saveQual('${_esc(l.id)}','${f.id}',this.value)">
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;

    // Follow-up section
    const followUpSection = `
      <div style="margin-bottom:16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:8px">Next Action</div>
        <div style="background:${overdue?'#FFF5F5':'#F8FAFC'};border:1px solid ${overdue?'#FCA5A5':'#F1F5F9'};border-radius:10px;padding:12px">
          ${overdue ? `<div style="font-size:11px;font-weight:700;color:#DC2626;margin-bottom:8px">⚠ Follow-up was due ${_fmtDate(l.nextActionDate)}</div>` : ''}
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:120px">
              <div style="font-size:10px;font-weight:600;color:#94A3B8;margin-bottom:4px">DUE DATE</div>
              <input type="date" id="fu-date-${_esc(l.id)}" value="${_esc(l.nextActionDate||'')}"
                style="width:100%;font-size:12px;border:1px solid #E2E8F0;border-radius:7px;padding:6px 8px;background:#fff;color:#1F2937;font-family:inherit">
            </div>
            <div style="flex:2;min-width:140px">
              <div style="font-size:10px;font-weight:600;color:#94A3B8;margin-bottom:4px">ACTION NOTE</div>
              <input type="text" id="fu-note-${_esc(l.id)}" value="${_esc(l.nextActionNote||'')}" placeholder="e.g. Call to follow up on quote"
                style="width:100%;font-size:12px;border:1px solid #E2E8F0;border-radius:7px;padding:6px 8px;background:#fff;color:#1F2937;font-family:inherit">
            </div>
            <button onclick="CRM.saveFollowUp('${_esc(l.id)}')"
              style="background:#0D9488;color:#fff;border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0">
              Set ↗
            </button>
          </div>
        </div>
      </div>`;

    // Activity log section
    const activitySection = `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8">Activity Log</div>
          <button onclick="CRM.openLogNote('${_esc(l.id)}')"
            style="font-size:10.5px;font-weight:700;color:#0D9488;background:none;border:1px solid #0D9488;border-radius:6px;padding:3px 9px;cursor:pointer">
            + Log Note
          </button>
        </div>
        <div style="background:#F8FAFC;border:1px solid #F1F5F9;border-radius:10px;overflow:hidden;max-height:200px;overflow-y:auto">
          ${log.length === 0
            ? `<div style="text-align:center;padding:20px;font-size:11px;color:#CBD5E1;font-style:italic">No activity logged yet</div>`
            : [...log].reverse().map((entry, i) => `
              <div style="${i>0?'border-top:1px solid #F1F5F9':''}padding:9px 14px;display:flex;gap:10px;align-items:flex-start">
                <div style="width:6px;height:6px;border-radius:50%;background:#0D9488;margin-top:5px;flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;color:#1F2937;font-weight:500;line-height:1.4">${_esc(entry.note)}</div>
                  <div style="font-size:10px;color:#94A3B8;margin-top:2px">${_fmtDate(entry.date)} ${entry.by?'· '+_esc(entry.by):''}</div>
                </div>
              </div>`).join('')}
        </div>
      </div>`;

    UI.openDrawer(l.companyName || 'Lead Detail', `
      <!-- Header -->
      <div style="margin:-18px -20px 18px;background:linear-gradient(135deg,#0F172A,#1E293B);padding:20px 20px 18px">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#0D9488,#0284C7);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="font-size:16px;font-weight:800;color:#fff">${UI.initials(l.companyName||'?')}</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-family:'Outfit',sans-serif;font-size:17px;font-weight:800;color:#fff;letter-spacing:-.3px">${_esc(l.companyName||'—')}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:2px">${_esc(l.contactName||'')} ${l.email?'· '+_esc(l.email):''}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
              <span style="background:${meta.bg};color:${meta.color};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">${meta.icon} ${meta.label}</span>
              ${segment?`<span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.6);font-size:11px;padding:3px 9px;border-radius:20px">${SEGMENT_ICON[segment]||''} ${segment}</span>`:''}
            </div>
          </div>
          <button onclick="CRM._refreshLead('${_esc(l.id)}')" title="Refresh lead data" style="background:rgba(255,255,255,.1);border:none;border-radius:7px;padding:6px 8px;cursor:pointer;color:rgba(255,255,255,.6);font-size:13px;flex-shrink:0" onmouseenter="this.style.background='rgba(255,255,255,.2)'" onmouseleave="this.style.background='rgba(255,255,255,.1)'">↻</button>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center">
          <div>
            ${l.annualValue?`<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.4);margin-bottom:2px">Est. Annual Value</div>
            <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#5EEAD4;letter-spacing:-1px">${UI.fmt(l.annualValue)}</div>`:''}
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.4);margin-bottom:2px">Received</div>
            <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.6)">${_timeAgo(l.createdAt)}</div>
          </div>
        </div>
      </div>

      <!-- Stage mover -->
      <div style="margin-bottom:16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:8px">Move Stage</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${stageButtons}</div>
      </div>

      <!-- Follow-up nudge buttons -->
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:10px 12px;margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:700;color:#166534;flex-shrink:0">⚡ Follow up:</span>
        <button onclick="CRM._quickFollowUp('${_esc(l.email||'')}','${_esc(l.contactName||l.companyName||'')}','followup3')" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;border:1px solid #86EFAC;background:#fff;color:#166534;cursor:pointer;transition:all .15s" onmouseenter="this.style.background='#166534';this.style.color='#fff'" onmouseleave="this.style.background='#fff';this.style.color='#166534'">Day 3 check-in</button>
        <button onclick="CRM._quickFollowUp('${_esc(l.email||'')}','${_esc(l.contactName||l.companyName||'')}','followup7')" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;border:1px solid #86EFAC;background:#fff;color:#166534;cursor:pointer;transition:all .15s" onmouseenter="this.style.background='#166534';this.style.color='#fff'" onmouseleave="this.style.background='#fff';this.style.color='#166534'">Day 7 nudge</button>
        <button onclick="CRM._quickFollowUp('${_esc(l.email||'')}','${_esc(l.contactName||l.companyName||'')}','quote_followup')" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;border:1px solid #86EFAC;background:#fff;color:#166534;cursor:pointer;transition:all .15s" onmouseenter="this.style.background='#166534';this.style.color='#fff'" onmouseleave="this.style.background='#fff';this.style.color='#166534'">Quote chaser</button>
      </div>

      <!-- Quick actions row 1 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px">
        <button onclick="CRM.openEdit('${_esc(l.id)}')" style="border:1px solid #E2E8F0;border-radius:8px;padding:8px 6px;background:#fff;font-size:11px;font-weight:700;color:#475569;cursor:pointer;text-align:center;transition:all .15s"
          onmouseenter="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
          onmouseleave="this.style.borderColor='#E2E8F0';this.style.color='#475569'">✏️ Edit</button>
        <button onclick="Router.navigate('quotes')" style="border:1px solid #E2E8F0;border-radius:8px;padding:8px 6px;background:#fff;font-size:11px;font-weight:700;color:#475569;cursor:pointer;text-align:center;transition:all .15s"
          onmouseenter="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
          onmouseleave="this.style.borderColor='#E2E8F0';this.style.color='#475569'">📋 Quote</button>
        <button onclick="CRM._openEmail('${_esc(l.email||'')}','${_esc(l.contactName||l.companyName||'')}')" style="border:1px solid #E2E8F0;border-radius:8px;padding:8px 6px;background:#fff;font-size:11px;font-weight:700;color:#475569;cursor:pointer;text-align:center;transition:all .15s"
          onmouseenter="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
          onmouseleave="this.style.borderColor='#E2E8F0';this.style.color='#475569'">✉️ Email</button>
      </div>
      <!-- Quick actions row 2 — intentionally separate to avoid overlap -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px">
        <a href="tel:${_esc(l.phone||'')}" style="border:1px solid #E2E8F0;border-radius:8px;padding:8px 6px;background:#fff;font-size:11px;font-weight:700;color:#475569;cursor:pointer;text-align:center;transition:all .15s;text-decoration:none;display:block"
          onmouseenter="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
          onmouseleave="this.style.borderColor='#E2E8F0';this.style.color='#475569'">📞 Call</a>
        <button onclick="CRM._shareUploadLink('${_esc(l.id)}','${_esc(l.companyName||l.contactName||'')}')" style="border:1px solid #E2E8F0;border-radius:8px;padding:8px 6px;background:#fff;font-size:11px;font-weight:700;color:#475569;cursor:pointer;text-align:center;transition:all .15s"
          onmouseenter="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
          onmouseleave="this.style.borderColor='#E2E8F0';this.style.color='#475569'">📎 Upload Link</button>
      </div>

      <!-- Contact details -->
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:10px">Contact Details</div>
      <div style="background:#F8FAFC;border:1px solid #F1F5F9;border-radius:10px;overflow:hidden;margin-bottom:14px">
        ${[
          ['Company', l.companyName],
          ['Contact', l.contactName],
          ['Email', l.email],
          ['Phone', l.phone],
          ['Postcode', l.postcode],
          ['Service', l.serviceType || l['service-type']],
          ['Add-ons', l.additionalServices],
          ['Premises', l.premisesSize ? (l.premisesSize + (l.premisesSizeUnit || 'm²')) : null],
          ['Frequency', l.frequency],
          ['Source', l.source],
          ['Lead ID', l.id],
        ].filter(r=>r[1]).map(([label, val], i, arr) => `
        <div style="display:flex;padding:9px 14px;${i<arr.length-1?'border-bottom:1px solid #F1F5F9':''}">
          <span style="font-size:12px;color:#94A3B8;width:80px;flex-shrink:0;font-weight:500">${label}</span>
          <span style="font-size:12.5px;color:#1F2937;font-weight:600;font-family:${label==='Lead ID'?'monospace':'inherit'}">${_esc(String(val))}</span>
        </div>`).join('')}
      </div>

      ${qualSection}
      ${followUpSection}
      ${activitySection}

      ${(l.message || l.additionalRequirements) ? `
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:8px">Client Message</div>
      <div style="background:#F0FDF9;border:1px solid #A7F3D0;border-radius:10px;padding:12px 14px;font-size:13px;color:#065F46;line-height:1.6;margin-bottom:14px">${_esc(l.message || l.additionalRequirements)}</div>` : ''}

      ${l.notes ? (() => {
        // Split notes into upload entries (📎) and regular notes
        const lines   = l.notes.split('\n');
        const uploads = lines.filter(ln => ln.startsWith('[FILE]') || ln.startsWith('\uD83D\uDCCE'));
        const other   = lines.filter(ln => !ln.startsWith('[FILE]') && !ln.startsWith('\uD83D\uDCCE')).join('\n').trim();
        return `
        ${uploads.length ? `
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:8px">Client Uploads</div>
        ${uploads.map(u => {
          const txt = u.replace(/^\[FILE\]\s*|\uD83D\uDCCE\s*/g, '');
          // Check for URL pattern: "date: filename -> https://..."
          const arrowMatch = txt.match(/^(.+?)\s*->\s*(https?:\/\/\S+)$/);
          const inner = arrowMatch
            ? `<a href="${arrowMatch[2]}" target="_blank" rel="noopener" style="color:#065F46;font-weight:700;text-decoration:underline">${_esc(arrowMatch[1])}</a>`
            : _esc(txt);
          return `<div style="display:flex;align-items:flex-start;gap:8px;background:#F0FDF9;border:1px solid #A7F3D0;border-radius:8px;padding:10px 12px;font-size:12.5px;color:#065F46;line-height:1.5;margin-bottom:6px">
            <span style="font-size:13px;font-weight:700;flex-shrink:0;color:#0D9488">&#128206;</span>
            <span>${inner}</span>
          </div>`;
        }).join('')}` : ''}
        ${other ? `
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:8px;margin-top:${uploads.length?'12px':'0'}">Notes</div>
        <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px 14px;font-size:13px;color:#92400E;line-height:1.6;white-space:pre-wrap;margin-bottom:14px">${_esc(other)}</div>` : ''}`;
      })() : ''}

      <!-- Danger zone -->
      <div style="margin-top:8px;padding-top:14px;border-top:1px solid #F1F5F9">
        <button onclick="CRM.confirmLost('${_esc(l.id)}')" style="width:100%;border:1px solid #FECACA;border-radius:8px;padding:8px;background:#FEF2F2;font-size:12px;font-weight:700;color:#DC2626;cursor:pointer;transition:all .15s"
          onmouseenter="this.style.background='#DC2626';this.style.color='#fff'"
          onmouseleave="this.style.background='#FEF2F2';this.style.color='#DC2626'">Mark as Lost</button>
      </div>
    `);
  }

  // ── NEW / EDIT MODALS ─────────────────────────────────────
  function openNewLead() {
    UI.openModal(`
    <div class="modal-hd"><h2>New Lead</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
    <div class="modal-body">
      <div class="fr">
        <div class="fg"><label class="fl">Company Name <span class="req">*</span></label><input class="fin" id="l-co" placeholder="e.g. Apex Property Group"></div>
        <div class="fg"><label class="fl">Contact Name <span class="req">*</span></label><input class="fin" id="l-cx" placeholder="e.g. Sarah Collins"></div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Email <span class="req">*</span></label><input class="fin" id="l-em" type="email" placeholder="sarah@company.com" oninput="CRM._checkDuplicate(this.value)"></div>
        <div class="fg"><label class="fl">Phone</label><input class="fin" id="l-ph" placeholder="07700 900 123"></div>
      </div>
      <div id="dup-warning" style="display:none;background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:8px 12px;font-size:12px;color:#92400E;margin-bottom:8px"></div>
      <div class="fr">
        <div class="fg"><label class="fl">Postcode</label><input class="fin" id="l-pc" placeholder="e.g. SW1A 1AA"></div>
        <div class="fg"><label class="fl">Segment</label>
          <select class="fse" id="l-sg">
            <option>Office</option><option>Healthcare</option><option>School</option>
            <option>Gym</option><option>Industrial</option><option>Automotive</option><option>Residential</option>
          </select>
        </div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Source</label>
          <select class="fse" id="l-sr"><option>Referral</option><option>Website</option><option>Cold Outreach</option><option>Event</option><option>LinkedIn</option><option>Google</option></select>
        </div>
        <div class="fg"><label class="fl">Est. Annual Value (£)</label><input class="fin" id="l-vl" type="number" placeholder="60000"></div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Follow-up Date</label><input class="fin" id="l-fd" type="date"></div>
        <div class="fg"><label class="fl">Next Action Note</label><input class="fin" id="l-fn" placeholder="e.g. Call to discuss requirements"></div>
      </div>
      <div class="fg"><label class="fl">Notes</label><textarea class="fta" id="l-nt" placeholder="Key context, budget signals, decision timeline…" style="min-height:80px"></textarea></div>
      <div class="modal-foot">
        <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
        <button class="btn bp" onclick="CRM.saveLead()">Create Lead</button>
      </div>
    </div>`);
  }

  function openEdit(id) {
    const l = _leads.find(x => x.id === id);
    if (!l) return;
    UI.closeDrawer();
    UI.openModal(`
    <div class="modal-hd"><h2>Edit Lead</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
    <div class="modal-body">
      <div class="fr">
        <div class="fg"><label class="fl">Company Name</label><input class="fin" id="l-co" value="${_esc(l.companyName||'')}"></div>
        <div class="fg"><label class="fl">Contact Name</label><input class="fin" id="l-cx" value="${_esc(l.contactName||'')}"></div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Email</label><input class="fin" id="l-em" type="email" value="${_esc(l.email||'')}"></div>
        <div class="fg"><label class="fl">Phone</label><input class="fin" id="l-ph" value="${_esc(l.phone||'')}"></div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Postcode</label><input class="fin" id="l-pc" value="${_esc(l.postcode||'')}"></div>
        <div class="fg"><label class="fl">Segment</label>
          <select class="fse" id="l-sg">
            ${(()=>{const derived=l.segment||_segmentFromService(l.serviceType)||'';return['Office','Healthcare','School','Gym','Industrial','Automotive','Residential'].map(s=>`<option ${s===derived?'selected':''}>${s}</option>`).join('');})()}
          </select>
        </div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Annual Value (£)</label><input class="fin" id="l-vl" type="number" value="${_esc(String(l.annualValue||''))}"></div>
        <div class="fg"><label class="fl">Follow-up Date</label><input class="fin" id="l-fd" type="date" value="${_esc(l.nextActionDate||'')}"></div>
      </div>
      <div class="fg"><label class="fl">Next Action Note</label><input class="fin" id="l-fn" value="${_esc(l.nextActionNote||'')}" placeholder="e.g. Call to follow up on quote"></div>
      <div class="fg"><label class="fl">Notes</label><textarea class="fta" id="l-nt" style="min-height:80px">${_esc(l.notes||'')}</textarea></div>
      <div class="modal-foot">
        <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
        <button class="btn bp" onclick="CRM.updateLead('${_esc(l.id)}')">Save Changes</button>
      </div>
    </div>`);
  }

  // ── DUPLICATE CHECK ───────────────────────────────────────
  function _checkDuplicate(email) {
    const w = document.getElementById('dup-warning');
    if (!w) return;
    const match = _leads.find(l => l.email && l.email.toLowerCase() === email.toLowerCase());
    if (match) {
      w.style.display = '';
      w.innerHTML = `⚠ A lead with this email already exists: <strong>${_esc(match.companyName||match.contactName)}</strong> (${_esc(match.status)}). You can still save — check before contacting twice.`;
    } else {
      w.style.display = 'none';
    }
  }

  // ── ACTIONS ───────────────────────────────────────────────
  async function saveLead() {
    if (!UI.rq('l-co') || !UI.rq('l-cx') || !UI.rq('l-em')) return;
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await API.post('lead', {
        companyName: UI.gv('l-co'), contactName: UI.gv('l-cx'),
        email: UI.gv('l-em'), phone: UI.gv('l-ph'),
        postcode: UI.gv('l-pc'), segment: UI.gv('l-sg'), source: UI.gv('l-sr'),
        annualValue: UI.gv('l-vl'), notes: UI.gv('l-nt'),
        nextActionDate: UI.gv('l-fd'), nextActionNote: UI.gv('l-fn'),
      });
      UI.closeModal(); UI.toast('Lead created ✓');
      await render();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = 'Create Lead'; }
    }
  }

  async function updateLead(id) {
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await API.post('lead', {
        id, companyName: UI.gv('l-co'), contactName: UI.gv('l-cx'),
        email: UI.gv('l-em'), phone: UI.gv('l-ph'),
        postcode: UI.gv('l-pc'), segment: UI.gv('l-sg'),
        annualValue: UI.gv('l-vl'), notes: UI.gv('l-nt'),
        nextActionDate: UI.gv('l-fd'), nextActionNote: UI.gv('l-fn'),
      });
      UI.closeModal(); UI.toast('Lead updated ✓');
      await render();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  }

  async function moveStage(id, status) {
    const lead = _leads.find(l => l.id === id);

    // Qualification gate — must fill all 4 fields before Qualified
    if (status === 'Qualified' && lead && !_isQualified(lead)) {
      UI.toast('Complete the 4 qualification fields first (in the Qualification section)', 'a');
      return;
    }

    // Won → show onboarding checklist
    if (status === 'Won') {
      _showOnboardingModal(id, lead);
      return;
    }

    try {
      // Append stage change to activity log
      const log = _activityLog(lead || {});
      log.push({ date: new Date().toISOString(), note: `Stage moved to ${STAGE_META[status].label}` });
      await API.post('lead.stage', { id, status });
      await API.post('lead', { id, activityLog: JSON.stringify(log) });
      UI.toast(`Moved to ${STAGE_META[status].label}`, status === 'Lost' ? 'r' : 'g');
      UI.closeDrawer();
      await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function _showOnboardingModal(id, lead) {
    UI.closeDrawer();
    UI.openModal(`
    <div class="modal-hd" style="background:linear-gradient(135deg,#064E3B,#065F46);margin:-20px -20px 20px;padding:20px 24px;border-radius:12px 12px 0 0">
      <div>
        <div style="font-size:22px;margin-bottom:4px">🎉</div>
        <h2 style="color:#fff;margin:0;font-size:18px">Contract Won!</h2>
        <p style="color:rgba(255,255,255,.65);font-size:13px;margin:4px 0 0">${_esc(lead ? lead.companyName : '')} — ${lead && lead.annualValue ? UI.fmt(lead.annualValue) + '/yr' : ''}</p>
      </div>
      <button class="xbtn" onclick="CRM._confirmWin('${_esc(id)}')" style="color:#fff">&#x2715;</button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px;color:#374151;margin-bottom:14px;line-height:1.6">Before you celebrate — run through the onboarding checklist to make sure delivery starts perfectly.</p>
      <div style="background:#F0FDF9;border:1px solid #A7F3D0;border-radius:10px;overflow:hidden;margin-bottom:16px">
        ${ONBOARDING_STEPS.map((step, i) => `
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;${i>0?'border-top:1px solid #D1FAE5':''}">
          <input type="checkbox" id="ob-${i}" style="width:16px;height:16px;accent-color:#059669;flex-shrink:0">
          <span style="font-size:13px;color:#065F46;font-weight:500">${_esc(step)}</span>
        </label>`).join('')}
      </div>
      <div class="modal-foot">
        <button class="btn bo" onclick="CRM._confirmWin('${_esc(id)}')">Skip checklist</button>
        <button class="btn bp" style="background:#059669" onclick="CRM._confirmWin('${_esc(id)}')">Mark as Won ✓</button>
      </div>
    </div>`);
  }

  async function _confirmWin(id) {
    const lead = _leads.find(l => l.id === id) || {};
    const log = _activityLog(lead);
    log.push({ date: new Date().toISOString(), note: 'Stage moved to Won — onboarding checklist reviewed' });
    try {
      await API.post('lead.stage', { id, status: 'Won' });
      await API.post('lead', { id, activityLog: JSON.stringify(log) });
      UI.closeModal();
      UI.toast('Marked as Won! 🎉', 'g');
      await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  async function saveQual(id, fieldId, value) {
    const lead = _leads.find(l => l.id === id);
    if (!lead) return;
    lead[fieldId] = value; // optimistic local update
    try {
      await API.post('lead', { id, [fieldId]: value });
    } catch(e) { console.warn('saveQual error:', e.message); }
  }

  async function saveFollowUp(id) {
    const dateEl = document.getElementById('fu-date-' + id);
    const noteEl = document.getElementById('fu-note-' + id);
    if (!dateEl) return;
    const date = dateEl.value;
    const note = noteEl ? noteEl.value : '';
    try {
      await API.post('lead', { id, nextActionDate: date, nextActionNote: note });
      const lead = _leads.find(l => l.id === id);
      if (lead) { lead.nextActionDate = date; lead.nextActionNote = note; }
      UI.toast('Follow-up set ✓');
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function openLogNote(id) {
    UI.openModal(`
    <div class="modal-hd"><h2>Log Activity Note</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
    <div class="modal-body">
      <div class="fg">
        <label class="fl">Note</label>
        <textarea class="fta" id="log-note" placeholder="e.g. Called Sarah — she's reviewing with FM team. Follow up Friday." style="min-height:100px"></textarea>
      </div>
      <div class="modal-foot">
        <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
        <button class="btn bp" onclick="CRM.saveLogNote('${_esc(id)}')">Save Note</button>
      </div>
    </div>`);
  }

  async function saveLogNote(id) {
    const note = UI.gv('log-note');
    if (!note.trim()) { UI.toast('Enter a note first', 'a'); return; }
    const lead = _leads.find(l => l.id === id) || {};
    const log = _activityLog(lead);
    const user = (window.Auth && Auth.getUser && Auth.getUser()) || {};
    log.push({ date: new Date().toISOString(), note: note.trim(), by: user.name || 'You' });
    try {
      await API.post('lead', { id, activityLog: JSON.stringify(log) });
      if (lead) lead.activityLog = JSON.stringify(log);
      UI.closeModal();
      UI.toast('Note logged ✓');
      // Refresh drawer
      if (_selectedLead && _selectedLead.id === id) {
        _selectedLead.activityLog = JSON.stringify(log);
        openDetail(JSON.stringify(_selectedLead));
      }
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function confirmLost(id) {
    if (confirm('Mark this lead as Lost? This will move it out of the active pipeline.')) {
      const lead = _leads.find(l => l.id === id) || {};
      const log = _activityLog(lead);
      log.push({ date: new Date().toISOString(), note: 'Marked as Lost' });
      API.post('lead.stage', { id, status: 'Lost' })
        .then(() => API.post('lead', { id, activityLog: JSON.stringify(log) }))
        .then(() => { UI.toast('Marked as Lost', 'r'); UI.closeDrawer(); render(); })
        .catch(e => UI.toast(e.message, 'r'));
    }
  }

  function _setView(v) { _view = v; _draw(); }
  function _setFilter(f) { _filter = f; _draw(); }
  function _search(q) { _q = q; _draw(); }

  function _openEmail(email, name) {
    window._emailPrefill = { to: email, name: name };
    if (window.Router) Router.navigate('email');
  }

  async function _refreshLead(leadId) {
    try {
      API.invalidate('leads');
      _leads = await API.get('leads');
      const fresh = _leads.find(l => l.id === leadId);
      if (fresh) openDetail(JSON.stringify(fresh));
      UI.toast('Lead refreshed ✓');
    } catch(e) { UI.toast('Refresh failed: ' + e.message, 'r'); }
  }

  function _shareUploadLink(leadId, companyName) {
    const base = 'https://askmiro.com/upload.html';
    const url  = base + '?ref=' + encodeURIComponent(leadId) + (companyName ? '&name=' + encodeURIComponent(companyName) : '');
    // Bulletproof copy: textarea trick works in all contexts
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try {
      document.execCommand('copy');
      UI.toast('📎 Upload link copied to clipboard');
    } catch (_) {
      window.prompt('Copy this upload link:', url);
    }
    document.body.removeChild(ta);
  }

  function _quickFollowUp(email, name, template) {
    const templateMap = {
      followup3:     'Follow-up',
      followup7:     'Follow-up',
      quote_followup: 'Follow-up',
    };
    const subjectMap = {
      followup3:     'Following up on your cleaning enquiry',
      followup7:     'Still thinking it over? — AskMiro',
      quote_followup: 'Quick question about your quote — AskMiro',
    };
    window._emailPrefill = {
      to: email,
      name: name,
      template: templateMap[template] || 'Follow-up',
      subject: subjectMap[template] || '',
    };
    if (window.Router) Router.navigate('email');
  }

  return {
    render, openNewLead, openEdit, openDetail, saveLead, updateLead,
    moveStage, confirmLost, saveQual, saveFollowUp, openLogNote, saveLogNote,
    _confirmWin, _setView, _setFilter, _search, _checkDuplicate, _openEmail, _quickFollowUp, _shareUploadLink, _refreshLead,
  };
})();
