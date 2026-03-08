// ============================================================
// AskMiro Ops — modules/reception.js  v1.0.0
// AI Receptionist — full frontend module
// Matches AskMiro Ops SPA style. Requires: UI, API globals.
// ============================================================

window. Reception = (() => {
  // ── State ──────────────────────────────────────────────────
  let _calls  = [];
  let _leads  = [];
  let _filter = 'all';    // all | urgent | callback | qualified
  let _search = '';
  let _sort   = 'newest'; // newest | oldest | urgency

  // ── Design tokens ─────────────────────────────────────────
  const T = {
    teal:      '#0D9488', tealDark: '#0F766E', tealLight: '#CCFBF1', tealGhost: '#F0FDFA',
    navy:      '#0A1628', navyMid:  '#0F2040',
    charcoal:  '#111827', slate:    '#1E293B',  muted:    '#64748B', light:    '#94A3B8',
    border:    '#E2E8F0', offWhite: '#F8FAFC',
    amber:     '#D97706', amberBg:  '#FFFBEB',
    red:       '#DC2626', green:    '#059669',
  };

  // ── SVG Logo (matches email.js LOGO_SM) ───────────────────
  const LOGO_SM = `<svg width="30" height="30" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="44" height="44" rx="10" fill="#0D9488"/>
    <path d="M11 29L16.5 15L22 29L27.5 15L33 29" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // ── Render ─────────────────────────────────────────────────
  async function render() {
    const app = document.getElementById('main-content');
    if (!app) return;
    app.innerHTML = _skeleton();

    try {
      const [callsRes, leadsRes] = await Promise.all([
        API.get('voice.calls').catch(() => ({ rows: [] })),
        API.get('leads').catch(() => [])
      ]);
      _calls = Array.isArray(callsRes) ? callsRes : (callsRes.rows || []);
      _leads = Array.isArray(leadsRes) ? leadsRes : (leadsRes.rows || leadsRes || []);
    } catch (e) {
      _calls = []; _leads = [];
    }

    _drawUI(app);
  }

  function _drawUI(app) {
    const kpis = _getKpis();
    const rows = _getFilteredCalls();
    app.innerHTML = `
      ${_header(kpis)}
      <div class="gql" style="gap:20px">
        <div style="min-width:0">
          ${_kpiStrip(kpis)}
          ${_queuePanel(rows, kpis)}
        </div>
        <div style="min-width:260px;max-width:320px">
          ${_playbook()}
          ${_snapshot(kpis)}
          ${_vapiStatus()}
        </div>
      </div>`;
    _bindSearch(); _bindSort(); _bindTableClicks();
  }

  // ── Header ─────────────────────────────────────────────────
  function _header(kpis) {
    const badge = kpis.urgent > 0
      ? `<span style="display:inline-flex;align-items:center;gap:5px;background:#FEF2F2;border:1px solid #FECACA;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;color:${T.red}">
          <span style="width:6px;height:6px;background:${T.red};border-radius:50%;display:inline-block;animation:rcpulse 1.5s infinite"></span>
          ${kpis.urgent} URGENT
        </span>`
      : `<span style="display:inline-flex;align-items:center;gap:5px;background:${T.tealGhost};border:1px solid ${T.tealLight};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;color:${T.tealDark}">
          <span style="width:6px;height:6px;background:${T.teal};border-radius:50%;display:inline-block"></span>
          Live
        </span>`;
    return `
      <style>@keyframes rcpulse{0%,100%{opacity:1}50%{opacity:.35}}</style>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px">
          ${LOGO_SM}
          <div>
            <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:20px;color:var(--sl,${T.slate});letter-spacing:-0.5px">AI Receptionist</div>
            <div style="font-size:12px;color:var(--ll,${T.muted});margin-top:2px">Phone leads · Transcripts · Callback triage</div>
          </div>
          ${badge}
        </div>
        <button onclick="Reception.refresh()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;border:1px solid var(--bd,${T.border});background:transparent;font-size:12px;font-weight:700;color:var(--sl,${T.slate});cursor:pointer">↻ Refresh</button>
      </div>`;
  }

  // ── KPI Strip ──────────────────────────────────────────────
  function _kpiStrip(k) {
    const cards = [
      { label:'Calls Today',     v:k.callsToday, sub:'inbound voice',       c:T.teal  },
      { label:'Qualified Leads', v:k.qualified,  sub:'ready for follow-up', c:T.green },
      { label:'Needs Callback',  v:k.callback,   sub:'incomplete / escalated', c:T.amber },
      { label:'Urgent',          v:k.urgent,     sub:'call back first',      c:T.red   },
    ];
    return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      ${cards.map(c => `<div class="card" style="border-top:3px solid ${c.c}">
        <div class="card-body" style="padding:12px">
          <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--ll,${T.light});font-weight:800">${c.label}</div>
          <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:30px;color:${c.c};margin-top:6px;line-height:1">${c.v}</div>
          <div style="font-size:11px;color:var(--ll,${T.light});margin-top:6px">${c.sub}</div>
        </div>
      </div>`).join('')}
    </div>`;
  }

  // ── Queue Panel ────────────────────────────────────────────
  function _queuePanel(rows, kpis) {
    return `<div class="card" style="margin-bottom:0">
      <div class="card-body" style="padding-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
          <div>
            <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:15px;color:var(--sl,${T.slate})">Reception Queue</div>
            <div style="font-size:12px;color:var(--ll,${T.muted});margin-top:3px">${rows.length} call${rows.length!==1?'s':''} &middot; click a row to open transcript</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <input id="rc-search" placeholder="Search caller, phone, postcode&hellip;" oninput="Reception._onSearch()"
              style="padding:7px 12px;border:1px solid var(--bd,${T.border});border-radius:8px;font-size:12px;color:var(--sl,${T.slate});background:#fff;width:210px;box-sizing:border-box">
            <select id="rc-sort" onchange="Reception._onSort()" style="padding:7px 10px;border:1px solid var(--bd,${T.border});border-radius:8px;font-size:12px;color:var(--sl,${T.slate});background:#fff;cursor:pointer">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="urgency">Urgency first</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
          ${_filterBtn('all',       'All ('+_calls.length+')')}
          ${_filterBtn('urgent',    '🚨 Urgent ('+kpis.urgent+')')}
          ${_filterBtn('callback',  '↩ Callback ('+kpis.callback+')')}
          ${_filterBtn('qualified', '✓ Qualified ('+kpis.qualified+')')}
        </div>
        <div class="tbl-wrap">
          <table class="tbl" id="reception-table">
            <thead><tr>
              <th>Caller</th><th>Building Type</th><th>Status</th>
              <th>Urgency</th><th>Phone</th><th>Postcode</th><th>When</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.length ? rows.map(_rowHtml).join('') : `<tr><td colspan="8" style="text-align:center;color:var(--ll,${T.light});padding:40px;font-size:13px">No calls in this view</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  // ── Right column ───────────────────────────────────────────
  function _playbook() {
    const steps = [
      ['1', 'Urgent commercial first',  'Call back urgent flagged leads before anything else.'],
      ['2', 'Convert to quote',         'Qualified callers → open quote in CRM within the hour.'],
      ['3', 'Follow up incomplete',     'Send a short email or SMS requesting missing details.'],
      ['4', 'Mark spam quickly',        'Keep the queue clean — bad data slows triage.'],
    ];
    return `<div class="card mb16"><div class="card-body" style="padding-top:14px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:13px;color:var(--sl,${T.slate});margin-bottom:12px">📋 Founder Playbook</div>
      ${steps.map(([n,t,d]) => `<div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="width:22px;height:22px;min-width:22px;background:${T.teal};border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;color:#fff">${n}</div>
        <div><div style="font-size:12px;font-weight:700;color:var(--sl,${T.slate})">${t}</div>
          <div style="font-size:11px;color:var(--ll,${T.light});margin-top:2px;line-height:1.5">${d}</div>
        </div></div>`).join('')}
    </div></div>`;
  }

  function _snapshot(k) {
    const rows = [
      ['Total calls today',  k.callsToday,  T.teal ],
      ['Qualified leads',    k.qualified,   T.green],
      ['Needs callback',     k.callback,    T.amber],
      ['Urgent',             k.urgent,      T.red  ],
      ['Total logged',       _calls.length, T.slate],
      ['Conversion rate',    _calls.length ? Math.round(k.qualified/_calls.length*100)+'%' : '—', T.teal],
    ];
    return `<div class="card mb16"><div class="card-body" style="padding-top:14px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:13px;color:var(--sl,${T.slate});margin-bottom:12px">📊 Live Snapshot</div>
      ${rows.map(([l,v,c]) => `<div class="mp-row">
        <span class="mp-lbl">${l}</span>
        <span style="font-weight:800;font-size:14px;color:${c}">${v}</span>
      </div>`).join('')}
    </div></div>`;
  }

  function _vapiStatus() {
    return `<div class="card"><div class="card-body" style="padding-top:14px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:13px;color:var(--sl,${T.slate});margin-bottom:10px">🤖 Vapi AI Status</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:8px;height:8px;background:${T.green};border-radius:50%;animation:rcpulse 2s infinite"></div>
        <span style="font-size:12px;font-weight:700;color:${T.green}">AI receptionist live</span>
      </div>
      <div style="font-size:11px;color:var(--ll,${T.light});line-height:1.7;margin-bottom:10px">Calls handled 24/7. Transcripts and lead data auto-logged here.</div>
      <div style="background:${T.offWhite};border:1px solid ${T.border};border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${T.light};margin-bottom:6px">Vapi Webhook</div>
        <div style="font-size:11px;font-family:monospace;color:${T.tealDark};word-break:break-all">POST /exec &rarr; doPost()</div>
        <div style="font-size:10px;color:${T.light};margin-top:3px">event: end-of-call-report</div>
      </div>
    </div></div>`;
  }

  // ── Table row ──────────────────────────────────────────────
  function _rowHtml(c) {
    const linked = _matchLead(c);
    return `<tr class="rc-row" data-callid="${_safe(c.id||'')}" style="cursor:pointer">
      <td>
        <div style="font-weight:700;color:var(--sl,${T.slate})">${_safe(c.callerName||c.caller_name||'Unknown caller')}</div>
        <div style="font-size:11px;color:var(--ll,${T.light});margin-top:2px">${_safe(c.email||'No email')}</div>
        ${linked?`<div style="font-size:10px;color:${T.teal};font-weight:700;margin-top:2px">↗ Linked lead</div>`:''}
      </td>
      <td>${_safe(c.buildingType||c.building_type||c.intent||'—')}</td>
      <td>${_statusPill(c)}</td>
      <td>${_urgencyPill(c)}</td>
      <td><a href="tel:${_safe(c.phone||'')}" style="color:${T.teal};font-weight:700;font-size:13px;text-decoration:none" onclick="event.stopPropagation()">${_safe(c.phone||'—')}</a></td>
      <td>${_safe(c.postcode||'—')}</td>
      <td style="white-space:nowrap;font-size:12px">${_fmtDt(c.createdAt||c.date||'')}</td>
      <td><button onclick="event.stopPropagation();Reception._quickAction('${_safe(c.id||'')}',event)" style="padding:3px 8px;border-radius:6px;border:1px solid var(--bd,${T.border});background:transparent;font-size:11px;font-weight:700;color:var(--sl,${T.slate});cursor:pointer">···</button></td>
    </tr>`;
  }

  // ── Full call modal ────────────────────────────────────────
  function openCall(c) {
    const transcript = c.transcript || '';
    const summary    = c.summary    || '';
    const qualified  = _isQualified(c);
    const lead       = _matchLead(c);

    const fields = [
      ['Phone',        c.phone       ||'—'], ['Email',       c.email       ||'—'],
      ['Postcode',     c.postcode    ||'—'], ['Building',    c.buildingType||c.building_type||'—'],
      ['Company',      c.companyName ||'—'], ['Frequency',   c.frequency   ||'—'],
      ['Duration',     c.duration    ||'—'], ['Call ID',     c.id          ||'—'],
    ];

    UI.openModal(`
      <div class="modal-hd">
        <div style="display:flex;align-items:center;gap:8px">
          <h2 style="margin:0">${_safe(c.callerName||c.caller_name||'Unknown caller')}</h2>
          ${qualified?`<span style="background:${T.teal};color:#fff;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase">Qualified</span>`:''}
          ${_urgency(c)==='urgent'?`<span style="background:#FEF2F2;color:${T.red};padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase">Urgent</span>`:''}
        </div>
        <button class="xbtn" onclick="UI.closeModal()">&#x2715;</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px">
          ${fields.map(([l,v])=>`<div style="background:var(--of,${T.offWhite});border:1px solid var(--bd,${T.border});border-radius:8px;padding:10px 12px">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;color:${T.light};margin-bottom:4px">${l}</div>
            <div style="font-size:13px;font-weight:600;color:var(--sl,${T.slate})">${_safe(v)}</div>
          </div>`).join('')}
        </div>

        ${summary?`<div style="background:${T.amberBg};border-left:3px solid ${T.amber};border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:14px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:800;color:${T.amber};margin-bottom:6px">AI Summary</div>
          <div style="font-size:13px;color:#92400E;line-height:1.7">${_safe(summary)}</div>
        </div>`:''}

        ${transcript?`<div style="font-family:Outfit,sans-serif;font-weight:800;font-size:13px;color:var(--sl,${T.slate});margin-bottom:8px">Transcript</div>
        <div style="background:#fff;border:1px solid var(--bd,${T.border});border-radius:8px;padding:14px 16px;font-size:12px;color:var(--sl,${T.slate});line-height:1.9;max-height:260px;overflow:auto;font-family:monospace;white-space:pre-wrap">${_safe(transcript)}</div>`
        :`<div style="text-align:center;padding:20px;color:${T.light};font-size:13px">No transcript available</div>`}

        ${c.recordingUrl?`<div style="margin-top:10px"><a href="${_safe(c.recordingUrl)}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:${T.teal};text-decoration:none">▶ Open Recording</a></div>`:''}

        <div class="modal-foot" style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn bo" onclick="UI.closeModal()">Close</button>
          <button class="btn bo" onclick="Reception.createCallbackTask('${_safe(c.id||'')}')">↩ Callback Task</button>
          ${c.phone?`<a href="tel:${_safe(c.phone.replace(/\s/g,''))}" class="btn bo" style="text-decoration:none">📞 Call Now</a>`:''}
          ${lead
            ?`<button class="btn bp" onclick="Reception.openLead('${_safe(lead.id)}')">Open Lead →</button>`
            :`<button class="btn bp" onclick="Reception.convertToLead('${_safe(c.id||'')}')">Convert to Lead →</button>`}
        </div>
      </div>`);
  }

  // ── Quick action dropdown ──────────────────────────────────
  function _quickAction(callId, evt) {
    const c = _calls.find(x => String(x.id)===String(callId));
    if (!c) return;
    const lead = _matchLead(c);
    const items = [
      { label:'📋 Open Details',         fn:()=>openCall(c) },
      { label:'↩ Create Callback Task',  fn:()=>createCallbackTask(callId) },
      { label:lead?'↗ Open Lead':'✚ Convert to Lead', fn:()=>lead?openLead(lead.id):convertToLead(callId) },
    ];
    if (c.phone) items.push({ label:`📞 Call ${c.phone}`, fn:()=>{window.location.href='tel:'+c.phone.replace(/\s/g,'');} });

    const existing = document.getElementById('rc-dropdown');
    if (existing) existing.remove();
    const rect = evt.target.getBoundingClientRect();
    const dd = document.createElement('div');
    dd.id = 'rc-dropdown';
    dd.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${rect.left}px;background:#fff;border:1px solid ${T.border};border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:9999;min-width:200px;overflow:hidden`;
    dd.innerHTML = items.map((it,i)=>`<div class="rc-dd-item" data-i="${i}" style="padding:10px 14px;font-size:13px;font-weight:600;color:${T.slate};cursor:pointer;border-bottom:${i<items.length-1?'1px solid '+T.border:'none'}">${it.label}</div>`).join('');
    document.body.appendChild(dd);
    dd.querySelectorAll('.rc-dd-item').forEach(el=>{
      el.addEventListener('mouseover',()=>el.style.background=T.offWhite);
      el.addEventListener('mouseout', ()=>el.style.background='');
      el.addEventListener('click',()=>{ dd.remove(); items[+el.dataset.i].fn(); });
    });
    const close = e=>{ if(!dd.contains(e.target)){ dd.remove(); document.removeEventListener('click',close); } };
    setTimeout(()=>document.addEventListener('click',close),0);
  }

  // ── Computed helpers ───────────────────────────────────────
  function _getKpis() {
    const today = new Date().toISOString().slice(0,10);
    return {
      callsToday: _calls.filter(c=>String(c.createdAt||c.date||'').slice(0,10)===today).length,
      qualified:  _calls.filter(_isQualified).length,
      urgent:     _calls.filter(c=>_urgency(c)==='urgent').length,
      callback:   _calls.filter(_needsCallback).length,
    };
  }

  function _getFilteredCalls() {
    let rows = _calls;
    if (_filter==='urgent')    rows=rows.filter(c=>_urgency(c)==='urgent');
    if (_filter==='callback')  rows=rows.filter(_needsCallback);
    if (_filter==='qualified') rows=rows.filter(_isQualified);
    if (_search) {
      const q=_search.toLowerCase();
      rows=rows.filter(c=>
        [c.callerName,c.phone,c.postcode,c.email,c.companyName]
          .some(f=>_safe(f).toLowerCase().includes(q)));
    }
    if (_sort==='oldest') rows=[...rows].sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
    else if (_sort==='urgency') rows=[...rows].sort((a,b)=>(_urgency(b)==='urgent'?1:0)-(_urgency(a)==='urgent'?1:0));
    else rows=[...rows].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    return rows;
  }

  function _isQualified(c) {
    return String(c.qualified||'').toLowerCase()==='true'||c.status==='Qualified'||c.intent==='new_lead';
  }
  function _needsCallback(c) {
    const s=String(c.status||'').toLowerCase();
    return s.includes('callback')||s.includes('incomplete')||String(c.qualified||'').toLowerCase()==='false';
  }
  function _urgency(c) { return String(c.urgency||'normal').toLowerCase(); }
  function _matchLead(c) {
    const phone=String(c.phone||'').trim();
    const email=String(c.email||'').trim().toLowerCase();
    return _leads.find(l=>(phone&&String(l.phone||'').trim()===phone)||(email&&String(l.email||'').trim().toLowerCase()===email));
  }

  // ── Pills ──────────────────────────────────────────────────
  function _pill(t,bg,col){return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${bg};color:${col};font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px">${t}</span>`;}
  function _statusPill(c){
    if(_isQualified(c)) return _pill('Qualified','rgba(5,150,105,.12)',T.green);
    if(c.status==='Converted') return _pill('Converted','rgba(124,58,237,.12)','#7C3AED');
    if(_needsCallback(c)) return _pill('Callback','rgba(217,119,6,.12)','#B45309');
    return _pill(c.status||'Logged','rgba(148,163,184,.14)',T.muted);
  }
  function _urgencyPill(c){
    const u=_urgency(c);
    return u==='urgent'||u==='high'?_pill('Urgent','rgba(220,38,38,.10)',T.red):_pill('Normal','rgba(13,148,136,.10)',T.teal);
  }
  function _filterBtn(key,label){
    const a=_filter===key;
    return `<button onclick="Reception.setFilter('${key}')" style="font-size:11px;padding:5px 12px;border-radius:999px;border:1px solid ${a?T.teal:'var(--bd,'+T.border+')'};background:${a?T.teal:'transparent'};color:${a?'#fff':'var(--sl,'+T.slate+')'};cursor:pointer;font-weight:700;transition:all .15s">${label}</button>`;
  }
  function _skeleton(){
    return `<div style="animation:rcpulse 1.5s infinite">
      <div style="height:60px;background:${T.offWhite};border-radius:12px;margin-bottom:16px"></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">${[...Array(4)].map(()=>`<div style="height:90px;background:${T.offWhite};border-radius:12px"></div>`).join('')}</div>
      <div style="height:400px;background:${T.offWhite};border-radius:12px"></div>
    </div>`;
  }

  // ── Bindings ───────────────────────────────────────────────
  function _bindSearch(){ const el=document.getElementById('rc-search'); if(el) el.value=_search; }
  function _bindSort()  { const el=document.getElementById('rc-sort');   if(el) el.value=_sort; }
  function _bindTableClicks(){
    const t=document.getElementById('reception-table');
    if(!t||t.__bound) return;
    t.__bound=true;
    t.addEventListener('click',e=>{
      const tr=e.target.closest('tr.rc-row');
      if(!tr) return;
      const call=_calls.find(x=>String(x.id)===String(tr.getAttribute('data-callid')));
      if(call) openCall(call);
    });
  }

  // ── Public actions ─────────────────────────────────────────
  async function createCallbackTask(callId){
    try{
      await API.post('voice.callback',{callId});
      UI.toast('Callback task created ↩');
      UI.closeModal&&UI.closeModal();
    }catch(e){ UI.toast(e.message||'Failed','r'); }
  }

  async function convertToLead(callId){
    try{
      const res=await API.post('voice.convert',{callId});
      UI.toast('Lead '+res.leadId+' created ✓');
      UI.closeModal&&UI.closeModal();
      await render();
    }catch(e){ UI.toast(e.message||'Failed','r'); }
  }

  function openLead(id){
    UI.closeModal&&UI.closeModal();
    if(window.CRM&&typeof CRM.openViewById==='function') CRM.openViewById(id);
    else UI.toast('Lead '+id+' — open CRM to view','a');
  }

  function setFilter(f){ _filter=f; _drawUI(document.getElementById('main-content')); }

  function _onSearch(){ const el=document.getElementById('rc-search'); _search=el?el.value:''; _drawUI(document.getElementById('main-content')); }
  function _onSort()  { const el=document.getElementById('rc-sort');   _sort=el?el.value:'newest'; _drawUI(document.getElementById('main-content')); }

  async function refresh(){
    await render();
    if(typeof UI!=='undefined'&&UI.toast) UI.toast('Reception refreshed ↻');
  }

  function _safe(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _fmtDt(v){
    if(!v) return '—';
    try{ return new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
    catch(_){ return v; }
  }

  return { render, refresh, setFilter, openCall, createCallbackTask, convertToLead, openLead, _onSearch, _onSort, _quickAction };
})();

// ============================================================
// NAV INTEGRATION — add to your main shell nav:
//
//   { icon:'📞', label:'Reception', hash:'#/reception', fn:Reception.render }
//
// Router case:
//   case 'reception': Reception.render(); break;
//
// Required CSS class (add if missing):
//   .fr4 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
// ============================================================
