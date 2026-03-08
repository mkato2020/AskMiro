// ============================================================
// AskMiro Ops — CRM  (Salesforce-lite, premium edition)
// ============================================================
window. CRM = (() => {
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
    const pipeline = active.reduce((s,l) => s + parseFloat(l.annualValue||0), 0);
    const wonVal = won.reduce((s,l) => s + parseFloat(l.annualValue||0), 0);
    const convRate = _leads.length > 0 ? Math.round(won.length / _leads.length * 100) : 0;
    return { total: _leads.length, active: active.length, pipeline, wonVal, convRate, won: won.length };
  }

  function _draw() {
    const leads = _filtered();
    const s = _stats();

    const statsBar = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px">
      ${[
        { label: 'Total Leads',     val: s.total,                     sub: 'in CRM',             color: '#0D9488' },
        { label: 'Active Pipeline', val: s.active,                    sub: 'in progress',        color: '#7C3AED' },
        { label: 'Pipeline Value',  val: UI.fmtk(s.pipeline),         sub: 'annual est.',        color: '#0284C7' },
        { label: 'Won Value',       val: UI.fmtk(s.wonVal),           sub: 'closed won',         color: '#059669' },
        { label: 'Win Rate',        val: s.convRate + '%',             sub: s.won + ' won',       color: '#D97706' },
      ].map(k => `
        <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:all .18s ease;cursor:default"
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
          <!-- Column header -->
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
          <!-- Cards -->
          <div style="padding:8px;display:flex;flex-direction:column;gap:6px;min-height:80px">
            ${items.length === 0
              ? `<div style="text-align:center;padding:20px 8px;font-size:11px;color:#CBD5E1;font-style:italic">No leads here</div>`
              : items.map(l => _pipelineCard(l)).join('')}
          </div>
        </div>`;
      }).join('')}
      <!-- Lost column (collapsed) -->
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
    const seg = l.segment || '';
    const initials = UI.initials(l.companyName || l.contactName || '?');
    const age = l.createdAt ? Math.floor((Date.now() - new Date(l.createdAt)) / 86400000) : 0;
    return `
    <div onclick='CRM.openDetail(${JSON.stringify(JSON.stringify(l))})'
      style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:11px 12px;cursor:pointer;transition:all .18s ease;position:relative"
      onmouseenter="this.style.borderColor='#0D9488';this.style.boxShadow='0 4px 14px rgba(13,148,136,.12)';this.style.transform='translateY(-1px)'"
      onmouseleave="this.style.borderColor='#E5E7EB';this.style.boxShadow='';this.style.transform=''">
      <!-- Top row -->
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
        <div style="width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#0D9488,#0284C7);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="font-size:10px;font-weight:800;color:#fff">${initials}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:700;color:#1F2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.companyName || '—'}</div>
          <div style="font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.contactName || ''}</div>
        </div>
      </div>
      <!-- Tags row -->
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:6px">
        ${seg ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#F1F5F9;color:#64748B;font-weight:600">${SEGMENT_ICON[seg]||''}${seg}</span>` : ''}
        ${l.source ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#F1F5F9;color:#64748B">${l.source}</span>` : ''}
      </div>
      <!-- Footer -->
      <div style="display:flex;align-items:center;justify-content:space-between">
        ${l.annualValue ? `<span style="font-size:11.5px;font-weight:700;color:#0D9488">${UI.fmtk(l.annualValue)}<span style="font-weight:400;color:#94A3B8">/yr</span></span>` : '<span></span>'}
        <span style="font-size:10px;color:#CBD5E1">${age}d ago</span>
      </div>
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
            <th style="text-align:left;padding:11px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8">Source</th>
            <th style="text-align:right;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${leads.length === 0
            ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:#94A3B8;font-size:13px">No leads found</td></tr>`
            : leads.map((l, i) => {
              const meta = STAGE_META[l.status] || STAGE_META['New'];
              const initials = UI.initials(l.companyName || '?');
              return `
              <tr onclick='CRM.openDetail(${JSON.stringify(JSON.stringify(l))})' style="border-bottom:1px solid #F8FAFC;cursor:pointer;transition:background .12s"
                onmouseenter="this.style.background='#F0FDF9'" onmouseleave="this.style.background=''">
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
                <td style="padding:12px"><span style="font-size:12px">${SEGMENT_ICON[l.segment]||''}</span> <span style="color:#475569">${l.segment||'—'}</span></td>
                <td style="padding:12px"><span style="background:${meta.bg};color:${meta.color};font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px">${meta.icon} ${meta.label}</span></td>
                <td style="padding:12px;text-align:right;font-weight:700;color:#0D9488">${l.annualValue ? UI.fmtk(l.annualValue) : '—'}</td>
                <td style="padding:12px;color:#64748B;font-size:12px">${l.source||'—'}</td>
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
                  <div style="font-size:10.5px;color:#CBD5E1">${age === 0 ? 'Today' : age + 'd ago'}</div>
                </div>
              </div>`;
            }).join('')}
        </div>
      </div>
      <!-- Stage breakdown -->
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

  // ── LEAD DETAIL PANEL (Salesforce record view) ────────────
  function openDetail(jsonStr) {
    const l = JSON.parse(jsonStr);
    _selectedLead = l;
    const meta = STAGE_META[l.status] || STAGE_META['New'];
    const age = l.createdAt ? Math.floor((Date.now()-new Date(l.createdAt))/86400000) : 0;

    const stageButtons = STAGES.map(st => {
      const m = STAGE_META[st];
      const active = st === l.status;
      return `<button onclick="CRM.moveStage('${l.id}','${st}')"
        style="flex:1;padding:6px 4px;border:1.5px solid ${active?m.color:'#E2E8F0'};border-radius:7px;background:${active?m.bg:'#fff'};color:${active?m.color:'#94A3B8'};font-size:10.5px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
        onmouseenter="if('${st}'!='${l.status}')this.style.borderColor='${m.color}';this.style.color='${m.color}'"
        onmouseleave="if('${st}'!='${l.status}')this.style.borderColor='#E2E8F0';this.style.color='#94A3B8'"
        >${m.icon} ${m.label}</button>`;
    }).join('');

    UI.openDrawer(l.companyName || 'Lead Detail', `
      <!-- Header -->
      <div style="margin:-18px -20px 18px;background:linear-gradient(135deg,#0F172A,#1E293B);padding:20px 20px 18px">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#0D9488,#0284C7);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="font-size:16px;font-weight:800;color:#fff">${UI.initials(l.companyName||'?')}</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-family:'Outfit',sans-serif;font-size:17px;font-weight:800;color:#fff;letter-spacing:-.3px">${l.companyName||'—'}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:2px">${l.contactName||''} ${l.email?'· '+l.email:''}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
              <span style="background:${meta.bg};color:${meta.color};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">${meta.icon} ${meta.label}</span>
              ${l.segment?`<span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.6);font-size:11px;padding:3px 9px;border-radius:20px">${SEGMENT_ICON[l.segment]||''} ${l.segment}</span>`:''}
            </div>
          </div>
        </div>
        ${l.annualValue?`<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.4);margin-bottom:2px">Est. Annual Value</div>
            <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:#5EEAD4;letter-spacing:-1px">${UI.fmt(l.annualValue)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.4);margin-bottom:2px">Added</div>
            <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.6)">${age === 0 ? 'Today' : age + ' days ago'}</div>
          </div>
        </div>`:''}
      </div>

      <!-- Stage mover -->
      <div style="margin-bottom:16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:8px">Move Stage</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${stageButtons}</div>
      </div>

      <!-- Quick actions -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:16px">
        <button onclick="CRM.openEdit('${l.id}')" style="border:1px solid #E2E8F0;border-radius:8px;padding:8px 6px;background:#fff;font-size:11px;font-weight:700;color:#475569;cursor:pointer;text-align:center;transition:all .15s"
          onmouseenter="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
          onmouseleave="this.style.borderColor='#E2E8F0';this.style.color='#475569'">✏️ Edit</button>
        <button onclick="Router.navigate('quotes')" style="border:1px solid #E2E8F0;border-radius:8px;padding:8px 6px;background:#fff;font-size:11px;font-weight:700;color:#475569;cursor:pointer;text-align:center;transition:all .15s"
          onmouseenter="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
          onmouseleave="this.style.borderColor='#E2E8F0';this.style.color='#475569'">📋 Quote</button>
        <a href="mailto:${l.email||''}" style="border:1px solid #E2E8F0;border-radius:8px;padding:8px 6px;background:#fff;font-size:11px;font-weight:700;color:#475569;cursor:pointer;text-align:center;transition:all .15s;text-decoration:none;display:block"
          onmouseenter="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
          onmouseleave="this.style.borderColor='#E2E8F0';this.style.color='#475569'">✉️ Email</button>
      </div>

      <!-- Details -->
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:10px">Contact Details</div>
      <div style="background:#F8FAFC;border:1px solid #F1F5F9;border-radius:10px;overflow:hidden;margin-bottom:14px">
        ${[
          ['Company', l.companyName],
          ['Contact', l.contactName],
          ['Email', l.email],
          ['Phone', l.phone],
          ['Source', l.source],
          ['Lead ID', l.id],
        ].filter(r=>r[1]).map(([label, val], i, arr) => `
        <div style="display:flex;padding:9px 14px;${i<arr.length-1?'border-bottom:1px solid #F1F5F9':''}">
          <span style="font-size:12px;color:#94A3B8;width:80px;flex-shrink:0;font-weight:500">${label}</span>
          <span style="font-size:12.5px;color:#1F2937;font-weight:600;font-family:${label==='Lead ID'?'monospace':'inherit'}">${val}</span>
        </div>`).join('')}
      </div>

      ${l.notes ? `
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:8px">Notes</div>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px 14px;font-size:13px;color:#92400E;line-height:1.6;margin-bottom:14px">${l.notes}</div>` : ''}

      <!-- Danger zone -->
      <div style="margin-top:8px;padding-top:14px;border-top:1px solid #F1F5F9">
        <button onclick="CRM.confirmLost('${l.id}')" style="width:100%;border:1px solid #FECACA;border-radius:8px;padding:8px;background:#FEF2F2;font-size:12px;font-weight:700;color:#DC2626;cursor:pointer;transition:all .15s"
          onmouseenter="this.style.background='#DC2626';this.style.color='#fff'"
          onmouseleave="this.style.background='#FEF2F2';this.style.color='#DC2626'">Mark as Lost</button>
      </div>
    `);
  }

  // ── MODALS ────────────────────────────────────────────────
  function openNewLead() {
    UI.openModal(`
    <div class="modal-hd"><h2>New Lead</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
    <div class="modal-body">
      <div class="fr">
        <div class="fg"><label class="fl">Company Name <span class="req">*</span></label><input class="fin" id="l-co" placeholder="e.g. Apex Property Group"></div>
        <div class="fg"><label class="fl">Contact Name <span class="req">*</span></label><input class="fin" id="l-cx" placeholder="e.g. Sarah Collins"></div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Email <span class="req">*</span></label><input class="fin" id="l-em" type="email" placeholder="sarah@company.com"></div>
        <div class="fg"><label class="fl">Phone</label><input class="fin" id="l-ph" placeholder="07700 900 123"></div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Segment</label>
          <select class="fse" id="l-sg">
            <option>Office</option><option>Healthcare</option><option>School</option>
            <option>Gym</option><option>Industrial</option><option>Automotive</option><option>Residential</option>
          </select>
        </div>
        <div class="fg"><label class="fl">Source</label>
          <select class="fse" id="l-sr"><option>Referral</option><option>Website</option><option>Cold Outreach</option><option>Event</option><option>LinkedIn</option></select>
        </div>
      </div>
      <div class="fg"><label class="fl">Est. Annual Value (£)</label><input class="fin" id="l-vl" type="number" placeholder="60000"></div>
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
        <div class="fg"><label class="fl">Company Name</label><input class="fin" id="l-co" value="${(l.companyName||'').replace(/"/g,'&quot;')}"></div>
        <div class="fg"><label class="fl">Contact Name</label><input class="fin" id="l-cx" value="${(l.contactName||'').replace(/"/g,'&quot;')}"></div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Email</label><input class="fin" id="l-em" type="email" value="${l.email||''}"></div>
        <div class="fg"><label class="fl">Phone</label><input class="fin" id="l-ph" value="${l.phone||''}"></div>
      </div>
      <div class="fr">
        <div class="fg"><label class="fl">Segment</label>
          <select class="fse" id="l-sg">
            ${['Office','Healthcare','School','Gym','Industrial','Automotive','Residential'].map(s=>`<option ${s===l.segment?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label class="fl">Annual Value (£)</label><input class="fin" id="l-vl" type="number" value="${l.annualValue||''}"></div>
      </div>
      <div class="fg"><label class="fl">Notes</label><textarea class="fta" id="l-nt" style="min-height:80px">${l.notes||''}</textarea></div>
      <div class="modal-foot">
        <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
        <button class="btn bp" onclick="CRM.updateLead('${l.id}')">Save Changes</button>
      </div>
    </div>`);
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
        segment: UI.gv('l-sg'), source: UI.gv('l-sr'),
        annualValue: UI.gv('l-vl'), notes: UI.gv('l-nt')
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
        segment: UI.gv('l-sg'), annualValue: UI.gv('l-vl'), notes: UI.gv('l-nt')
      });
      UI.closeModal(); UI.toast('Lead updated ✓');
      await render();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  }

  async function moveStage(id, status) {
    try {
      await API.post('lead.stage', { id, status });
      UI.toast(`Moved to ${STAGE_META[status].label}`, status === 'Won' ? 'g' : status === 'Lost' ? 'r' : 'g');
      UI.closeDrawer();
      await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function confirmLost(id) {
    if (confirm('Mark this lead as Lost? This will move it out of the active pipeline.')) {
      moveStage(id, 'Lost');
    }
  }

  function _setView(v) { _view = v; _draw(); }
  function _setFilter(f) { _filter = f; _draw(); }
  function _search(q) { _q = q; _draw(); }

  return {
    render, openNewLead, openEdit, openDetail, saveLead, updateLead,
    moveStage, confirmLost, _setView, _setFilter, _search
  };
})();
