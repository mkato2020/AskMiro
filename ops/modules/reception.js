// ============================================================
// AskMiro Ops — modules/reception.js  v3.0.0
// AI Receptionist — fully aligned with GAS backend v4
//
// Schema contract (mirrors VoiceCalls sheet exactly):
//   id, vapiCallId, createdAt, endedAt, duration,
//   phone, callerName, email, postcode, companyName,
//   buildingType, frequency, intent, qualified, urgency,
//   summary, transcript, recordingUrl, status,
//   linkedLeadId, notes
// ============================================================

window.Reception = (() => {

  // ── State ───────────────────────────────────────────────────
  let _calls   = [];
  let _leads   = [];
  let _filter  = 'all';      // all | urgent | callback | qualified | reviewed
  let _search  = '';
  let _sort    = 'priority'; // priority | newest | oldest
  let _health  = null;       // null=unknown | true=live | false=degraded
  let _error   = null;

  // ── Design tokens ───────────────────────────────────────────
  const T = {
    teal:'#0D9488', tealDark:'#0F766E', tealLight:'#CCFBF1', tealGhost:'#F0FDFA',
    navy:'#0A1628', slate:'#1E293B', muted:'#64748B', light:'#94A3B8',
    border:'#E2E8F0', offWhite:'#F8FAFC',
    amber:'#D97706', amberBg:'#FFFBEB',
    red:'#DC2626',   redBg:'#FEF2F2',
    green:'#059669', greenBg:'#F0FDF4',
  };

  const LOGO = `<svg width="30" height="30" viewBox="0 0 44 44" fill="none">
    <rect width="44" height="44" rx="10" fill="#0D9488"/>
    <path d="M11 29L16.5 15L22 29L27.5 15L33 29" stroke="white" stroke-width="3"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // ── Field normalisation ─────────────────────────────────────
  // Memoised. Single source of truth for all field access.
  // Handles both camelCase (sheet) and legacy snake_case gracefully.
  function _norm(c) {
    if (c.__norm) return c.__norm;
    const phone = _normPhone(
      c.phone || c.phoneNumber || c.phone_number || ''
    );
    const email = String(c.email || '').trim().toLowerCase();
    const n = {
      id:           String(c.id || c.callId || c.call_id || ''),
      vapiCallId:   String(c.vapiCallId || c.vapi_call_id || ''),
      callerName:   String(c.callerName  || c.caller_name  || c.name || '').trim() || 'Unknown caller',
      phone,
      email,
      postcode:     String(c.postcode    || c.post_code    || '').trim().toUpperCase(),
      buildingType: String(c.buildingType|| c.building_type|| '').trim(),
      frequency:    String(c.frequency   || '').trim(),
      companyName:  String(c.companyName || c.company_name || '').trim(),
      intent:       String(c.intent      || '').trim().toLowerCase(),
      qualified:    _parseQualified(c),
      urgency:      _parseUrgency(c),
      status:       String(c.status      || 'Logged').trim(),
      summary:      String(c.summary     || '').trim(),
      transcript:   String(c.transcript  || '').trim(),
      recordingUrl: String(c.recordingUrl|| c.recording_url|| '').trim(),
      duration:     String(c.duration    || '').trim(),
      createdAt:    c.createdAt || c.created_at || c.date || '',
      endedAt:      c.endedAt   || c.ended_at   || '',
      notes:        String(c.notes       || '').trim(),
      linkedLeadId: String(c.linkedLeadId|| c.linked_lead_id || '').trim(),
      reviewed:     String(c.status || '').toLowerCase() === 'reviewed',
      spam:         String(c.status || '').toLowerCase() === 'spam' ||
                    String(c.intent || '').toLowerCase() === 'spam',
    };
    n.priority = _score(n);
    c.__norm = n;
    return n;
  }

  // ── Phone normalisation (UK) ────────────────────────────────
  // Strips spaces/dashes/brackets. Normalises +44 → 0.
  // 07700900123 === 07700 900123 === +447700900123
  function _normPhone(raw) {
    if (!raw) return '';
    let p = String(raw).replace(/[\s\-\(\)\+]/g, '');
    if (p.startsWith('44') && p.length >= 11) p = '0' + p.slice(2);
    return p;
  }

  // ── Qualification detection ─────────────────────────────────
  // Returns: true | false | null (null = not determined)
  function _parseQualified(c) {
    const q = String(c.qualified || '').toLowerCase();
    if (q === 'true'  || q === '1' || q === 'yes') return true;
    if (q === 'false' || q === '0' || q === 'no')  return false;
    const s = String(c.status || '').toLowerCase();
    if (s === 'qualified' || s === 'converted')     return true;
    return null;
  }

  // ── Urgency parsing ─────────────────────────────────────────
  // Returns: 'urgent' | 'high' | 'normal' | 'low'
  function _parseUrgency(c) {
    const u = String(c.urgency || c.priority || '').toLowerCase().trim();
    if (u === 'urgent' || u === 'critical') return 'urgent';
    if (u === 'high')  return 'high';
    if (u === 'low')   return 'low';
    return 'normal';
  }

  // ── Priority score (0–100) ──────────────────────────────────
  function _score(n) {
    let s = 50;
    if (n.urgency === 'urgent') s += 40;
    else if (n.urgency === 'high') s += 25;
    else if (n.urgency === 'low')  s -= 15;
    if (n.qualified === true)  s += 15;
    if (n.qualified === false) s -= 10;
    if (n.spam)                s  = 0;
    if (n.reviewed)            s -= 20;
    if (!n.email && !n.phone)  s -= 10;
    return Math.max(0, Math.min(100, s));
  }

  // ── Callback detection ──────────────────────────────────────
  // Aligns with backend status lifecycle:
  // Logged → Callback | Converted | Reviewed | Spam
  function _needsCallback(c) {
    const n = _norm(c);
    if (n.spam || n.reviewed) return false;
    const s = n.status.toLowerCase();
    return s === 'callback' || s === 'logged' && n.qualified === false;
  }

  // ── Render ───────────────────────────────────────────────────
  async function render() {
    const app = document.getElementById('main-content');
    if (!app) return;
    app.innerHTML = _skeleton();
    _error = null;

    try {
      const [callsRes, leadsRes] = await Promise.all([
        API.get('voice.calls').catch(e => { _error = e.message; return { rows: [] }; }),
        API.get('leads').catch(() => []),
      ]);
      _calls = _toArray(callsRes);
      _leads = _toArray(leadsRes);
    } catch(e) {
      _error = e.message || 'Failed to load';
      _calls = []; _leads = [];
    }

    // Non-blocking health check
    if (typeof API.health === 'function') {
      API.health().then(ok => { _health = ok; }).catch(() => { _health = false; });
    }

    _draw(app);
  }

  function _toArray(res) {
    if (Array.isArray(res))         return res;
    if (Array.isArray(res?.rows))   return res.rows;
    if (Array.isArray(res?.data))   return res.data;
    if (Array.isArray(res?.calls))  return res.calls;
    if (Array.isArray(res?.leads))  return res.leads;
    return [];
  }

  // ── Draw ─────────────────────────────────────────────────────
  function _draw(app) {
    app = app || document.getElementById('main-content');
    if (!app) return;
    const kpis = _kpis();
    const rows = _filtered();
    app.innerHTML = `
      <style>@keyframes rcpulse{0%,100%{opacity:1}50%{opacity:.35}}</style>
      ${_header(kpis)}
      <div class="gql" style="gap:20px">
        <div style="min-width:0">
          ${_kpiStrip(kpis)}
          ${_error ? _errorBanner() : ''}
          ${_queue(rows, kpis)}
        </div>
        <div style="min-width:260px;max-width:320px">
          ${_playbook()}
          ${_snapshot(kpis)}
          ${_statusCard()}
        </div>
      </div>`;
    _bindEvents();
  }

  // ── Header ───────────────────────────────────────────────────
  function _header(kpis) {
    const urgent = kpis.urgent > 0;
    const badge = urgent
      ? `<span style="display:inline-flex;align-items:center;gap:5px;background:${T.redBg};border:1px solid #FECACA;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;color:${T.red}">
           <span style="width:6px;height:6px;background:${T.red};border-radius:50%;display:inline-block;animation:rcpulse 1.5s infinite"></span>
           ${kpis.urgent} URGENT
         </span>`
      : `<span style="display:inline-flex;align-items:center;gap:5px;background:${T.tealGhost};border:1px solid ${T.tealLight};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;color:${T.tealDark}">
           <span style="width:6px;height:6px;background:${T.teal};border-radius:50%;display:inline-block"></span>
           Live
         </span>`;
    return `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px">
        ${LOGO}
        <div>
          <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:20px;color:var(--sl,${T.slate});letter-spacing:-.5px">AI Receptionist</div>
          <div style="font-size:12px;color:var(--ll,${T.muted});margin-top:2px">Phone leads · Transcripts · Callback triage</div>
        </div>
        ${badge}
      </div>
      <button onclick="Reception.refresh()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;border:1px solid var(--bd,${T.border});background:transparent;font-size:12px;font-weight:700;color:var(--sl,${T.slate});cursor:pointer">↻ Refresh</button>
    </div>`;
  }

  // ── Error banner ─────────────────────────────────────────────
  function _errorBanner() {
    return `<div style="background:${T.redBg};border:1px solid #FECACA;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">⚠️</span>
      <div>
        <div style="font-size:13px;font-weight:700;color:${T.red}">Could not load all data</div>
        <div style="font-size:12px;color:#991B1B;margin-top:2px">${_safe(_error)} — showing cached or partial results</div>
      </div>
    </div>`;
  }

  // ── KPI strip ────────────────────────────────────────────────
  function _kpiStrip(k) {
    const cards = [
      { label:'Calls Today',    v:k.callsToday, sub:'inbound voice',          c:T.teal  },
      { label:'Qualified',      v:k.qualified,  sub:'ready for follow-up',    c:T.green },
      { label:'Needs Callback', v:k.callback,   sub:'incomplete / escalated', c:T.amber },
      { label:'Urgent',         v:k.urgent,     sub:'call back first',        c:T.red   },
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

  // ── Queue panel ──────────────────────────────────────────────
  function _queue(rows, kpis) {
    return `<div class="card">
      <div class="card-body" style="padding-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
          <div>
            <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:15px;color:var(--sl,${T.slate})">Reception Queue</div>
            <div style="font-size:12px;color:var(--ll,${T.muted});margin-top:3px">${rows.length} call${rows.length!==1?'s':''} &middot; click a row to open</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <input id="rc-search" placeholder="Search caller, phone, postcode, transcript…"
              style="padding:7px 12px;border:1px solid var(--bd,${T.border});border-radius:8px;font-size:12px;color:var(--sl,${T.slate});background:#fff;width:240px;box-sizing:border-box">
            <select id="rc-sort" style="padding:7px 10px;border:1px solid var(--bd,${T.border});border-radius:8px;font-size:12px;color:var(--sl,${T.slate});background:#fff;cursor:pointer">
              <option value="priority">Priority first</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
          ${_fb('all',      'All ('+_calls.length+')')}
          ${_fb('urgent',   '🚨 Urgent ('+kpis.urgent+')')}
          ${_fb('callback', '↩ Callback ('+kpis.callback+')')}
          ${_fb('qualified','✓ Qualified ('+kpis.qualified+')')}
          ${_fb('reviewed', 'Reviewed ('+kpis.reviewed+')')}
        </div>
        <div class="tbl-wrap">
          <table class="tbl" id="rc-table">
            <thead><tr>
              <th>Caller</th><th>Building / Intent</th><th>Status</th>
              <th>Urgency</th><th>Phone</th><th>Postcode</th><th>When</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.length
                ? rows.map(_row).join('')
                : `<tr><td colspan="8">${_empty()}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  // ── Empty state ──────────────────────────────────────────────
  function _empty() {
    const filtered = _filter !== 'all' || _search;
    return `<div style="text-align:center;padding:48px 20px">
      <div style="font-size:28px;margin-bottom:10px">${filtered ? '🔍' : '📞'}</div>
      <div style="font-size:14px;font-weight:700;color:var(--sl,${T.slate});margin-bottom:6px">
        ${filtered ? 'No calls match this filter' : 'No calls logged yet'}
      </div>
      <div style="font-size:12px;color:var(--ll,${T.light})">
        ${filtered
          ? 'Try a different filter or clear the search'
          : 'Calls appear here automatically once Vapi is configured and live'}
      </div>
      ${filtered ? `<button onclick="Reception._clearSearch()" style="margin-top:14px;padding:7px 16px;border-radius:8px;border:1px solid var(--bd,${T.border});background:transparent;font-size:12px;font-weight:700;color:var(--sl,${T.slate});cursor:pointer">Clear filters</button>` : ''}
    </div>`;
  }

  // ── Table row ────────────────────────────────────────────────
  function _row(c) {
    const n = _norm(c);
    const hasLead = !!(n.linkedLeadId || _matchLead(n));
    const dim = n.spam || n.reviewed ? 'opacity:.55;' : '';
    return `<tr class="rc-row" data-id="${_safe(n.id)}" style="cursor:pointer;${dim}">
      <td>
        <div style="font-weight:700;color:var(--sl,${T.slate})">${_safe(n.callerName)}</div>
        <div style="font-size:11px;color:var(--ll,${T.light});margin-top:2px">${_safe(n.email || 'No email')}</div>
        ${hasLead  ? `<div style="font-size:10px;color:${T.teal};font-weight:700;margin-top:2px">↗ Linked lead</div>` : ''}
        ${n.spam   ? `<div style="font-size:10px;color:${T.red};font-weight:700;margin-top:2px">⛔ Spam</div>` : ''}
      </td>
      <td>${_safe(n.buildingType || n.intent || '—')}</td>
      <td>${_statusPill(n)}</td>
      <td>${_urgencyPill(n)}</td>
      <td>
        <a href="tel:${_safe(n.phone)}" onclick="event.stopPropagation()"
           style="color:${T.teal};font-weight:700;font-size:13px;text-decoration:none">
          ${_safe(n.phone || '—')}
        </a>
      </td>
      <td>${_safe(n.postcode || '—')}</td>
      <td style="white-space:nowrap;font-size:12px">${_fmtDt(n.createdAt)}</td>
      <td>
        <button onclick="event.stopPropagation();Reception._menu('${_safe(n.id)}',event)"
          style="padding:3px 8px;border-radius:6px;border:1px solid var(--bd,${T.border});background:transparent;font-size:11px;font-weight:700;color:var(--sl,${T.slate});cursor:pointer">···</button>
      </td>
    </tr>`;
  }

  // ── Call modal ───────────────────────────────────────────────
  function openCall(c) {
    const n    = _norm(c);
    const lead = n.linkedLeadId ? { id: n.linkedLeadId } : _matchLead(n);

    const fields = [
      ['Phone',     n.phone        || '—'], ['Email',    n.email         || '—'],
      ['Postcode',  n.postcode     || '—'], ['Building', n.buildingType  || '—'],
      ['Company',   n.companyName  || '—'], ['Frequency',n.frequency     || '—'],
      ['Duration',  n.duration     || '—'], ['Intent',   n.intent        || '—'],
      ['Call ID',   n.id],                  ['Score',    n.priority+'/100'],
    ];

    const badges = [
      n.qualified === true  && `<span style="background:${T.teal};color:#fff;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase">Qualified</span>`,
      n.urgency === 'urgent'&& `<span style="background:${T.redBg};color:${T.red};padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase">Urgent</span>`,
      n.urgency === 'high'  && `<span style="background:#FFF7ED;color:#C2410C;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase">High</span>`,
      n.spam                && `<span style="background:${T.redBg};color:${T.red};padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase">Spam</span>`,
      n.reviewed            && `<span style="background:#F1F5F9;color:${T.muted};padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase">Reviewed</span>`,
    ].filter(Boolean).join(' ');

    UI.openModal(`
      <div class="modal-hd">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <h2 style="margin:0">${_safe(n.callerName)}</h2>${badges}
        </div>
        <button class="xbtn" onclick="UI.closeModal()">&#x2715;</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px">
          ${fields.map(([l,v]) => `<div style="background:var(--of,${T.offWhite});border:1px solid var(--bd,${T.border});border-radius:8px;padding:10px 12px">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;font-weight:700;color:${T.light};margin-bottom:4px">${l}</div>
            <div style="font-size:13px;font-weight:600;color:var(--sl,${T.slate})">${_safe(v)}</div>
          </div>`).join('')}
        </div>

        ${n.summary ? `<div style="background:${T.amberBg};border-left:3px solid ${T.amber};border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:14px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:800;color:${T.amber};margin-bottom:6px">AI Summary</div>
          <div style="font-size:13px;color:#92400E;line-height:1.7">${_safe(n.summary)}</div>
        </div>` : ''}

        ${n.notes ? `<div style="background:${T.offWhite};border:1px solid var(--bd,${T.border});border-radius:8px;padding:10px 14px;margin-bottom:14px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${T.light};margin-bottom:4px">Notes</div>
          <div style="font-size:13px;color:var(--sl,${T.slate});line-height:1.6">${_safe(n.notes)}</div>
        </div>` : ''}

        ${n.transcript
          ? `<div style="font-family:Outfit,sans-serif;font-weight:800;font-size:13px;color:var(--sl,${T.slate});margin-bottom:8px">Transcript</div>
             <div style="background:#fff;border:1px solid var(--bd,${T.border});border-radius:8px;padding:14px 16px;font-size:12px;color:var(--sl,${T.slate});line-height:1.9;max-height:260px;overflow:auto;font-family:monospace;white-space:pre-wrap">${_safe(n.transcript)}</div>`
          : `<div style="text-align:center;padding:20px;color:${T.light};font-size:13px;background:${T.offWhite};border-radius:8px">No transcript available for this call</div>`}

        ${n.recordingUrl ? `<div style="margin-top:10px"><a href="${_safe(n.recordingUrl)}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:${T.teal};text-decoration:none">▶ Open Recording</a></div>` : ''}

        <div class="modal-foot" style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn bo" onclick="UI.closeModal()">Close</button>
          ${!n.reviewed && !n.spam
            ? `<button class="btn bo" onclick="Reception.markReviewed('${_safe(n.id)}')">✓ Mark Reviewed</button>` : ''}
          ${!n.spam
            ? `<button class="btn bo" onclick="Reception.markSpam('${_safe(n.id)}')">⛔ Spam</button>` : ''}
          <button class="btn bo" onclick="Reception.createCallbackTask('${_safe(n.id)}')">↩ Callback Task</button>
          ${n.phone ? `<a href="tel:${_safe(_normPhone(n.phone))}" class="btn bo" style="text-decoration:none">📞 Call Now</a>` : ''}
          ${lead
            ? `<button class="btn bp" onclick="Reception._openLead('${_safe(lead.id||'')}')">Open Lead →</button>`
            : `<button class="btn bp" onclick="Reception.convertToLead('${_safe(n.id)}')">Convert to Lead →</button>`}
        </div>
      </div>`);
  }

  // ── Context menu ─────────────────────────────────────────────
  function _menu(callId, evt) {
    const c = _calls.find(x => _norm(x).id === callId);
    if (!c) return;
    const n    = _norm(c);
    const lead = n.linkedLeadId ? { id: n.linkedLeadId } : _matchLead(n);

    const items = [
      { label:'📋 Open Details',           fn:() => openCall(c) },
      { label:'↩ Callback Task',           fn:() => createCallbackTask(callId) },
      { label: lead ? '↗ Open Lead' : '✚ Convert to Lead',
                                           fn:() => lead ? _openLead(lead.id) : convertToLead(callId) },
    ];
    if (n.phone) items.push({ label:`📞 Call ${n.phone}`, fn:() => { location.href='tel:'+n.phone; }});
    if (!n.reviewed && !n.spam)  items.push({ label:'✓ Mark Reviewed', fn:() => markReviewed(callId) });
    if (!n.spam)                 items.push({ label:'⛔ Mark Spam',     fn:() => markSpam(callId) });
    if (_needsCallback(c))       items.push({ label:'✅ Callback Done', fn:() => markCallbackDone(callId) });

    const old = document.getElementById('rc-dd');
    if (old) old.remove();

    const r  = evt.target.getBoundingClientRect();
    const dd = document.createElement('div');
    dd.id    = 'rc-dd';
    dd.style.cssText = `position:fixed;top:${r.bottom+4}px;left:${r.left}px;background:#fff;border:1px solid ${T.border};border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:9999;min-width:200px;overflow:hidden`;
    dd.innerHTML = items.map((it,i) =>
      `<div class="rc-ddi" data-i="${i}" style="padding:10px 14px;font-size:13px;font-weight:600;color:${T.slate};cursor:pointer;${i<items.length-1?'border-bottom:1px solid '+T.border:''}">${it.label}</div>`
    ).join('');
    document.body.appendChild(dd);

    dd.querySelectorAll('.rc-ddi').forEach(el => {
      el.onmouseover = () => el.style.background = T.offWhite;
      el.onmouseout  = () => el.style.background = '';
      el.onclick     = () => { dd.remove(); items[+el.dataset.i].fn(); };
    });
    const close = e => { if (!dd.contains(e.target)) { dd.remove(); document.removeEventListener('click', close); }};
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  // ── Right column ─────────────────────────────────────────────
  function _playbook() {
    const steps = [
      ['1','Urgent commercial first',   'Call back urgent flagged leads before anything else.'],
      ['2','Convert to quote',          'Qualified callers → open quote in CRM within the hour.'],
      ['3','Follow up incomplete',      'Send a short email or SMS requesting missing details.'],
      ['4','Mark spam quickly',         'Keep the queue clean — bad data slows triage.'],
    ];
    return `<div class="card mb16"><div class="card-body" style="padding-top:14px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:13px;color:var(--sl,${T.slate});margin-bottom:12px">📋 Founder Playbook</div>
      ${steps.map(([n,t,d]) => `<div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="width:22px;height:22px;min-width:22px;background:${T.teal};border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;color:#fff">${n}</div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--sl,${T.slate})">${t}</div>
          <div style="font-size:11px;color:var(--ll,${T.light});margin-top:2px;line-height:1.5">${d}</div>
        </div>
      </div>`).join('')}
    </div></div>`;
  }

  function _snapshot(k) {
    const rate = _calls.length ? Math.round(k.qualified/_calls.length*100)+'%' : '—';
    const rows = [
      ['Total calls today',  k.callsToday, T.teal ],
      ['Qualified leads',    k.qualified,  T.green],
      ['Needs callback',     k.callback,   T.amber],
      ['Urgent',             k.urgent,     T.red  ],
      ['Reviewed',           k.reviewed,   T.muted],
      ['Total logged',       _calls.length,T.slate],
      ['Conversion rate',    rate,         T.teal ],
    ];
    return `<div class="card mb16"><div class="card-body" style="padding-top:14px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:13px;color:var(--sl,${T.slate});margin-bottom:12px">📊 Live Snapshot</div>
      ${rows.map(([l,v,c]) => `<div class="mp-row">
        <span class="mp-lbl">${l}</span>
        <span style="font-weight:800;font-size:14px;color:${c}">${v}</span>
      </div>`).join('')}
    </div></div>`;
  }

  function _statusCard() {
    // _health: null=unknown, true=live, false=degraded
    const dot   = _health === false ? T.amber : _health === true ? T.green : T.light;
    const label = _health === false ? 'Degraded — check Vapi'
                : _health === true  ? 'AI receptionist live'
                : 'Status unknown';
    const pulse = _health === true ? 'animation:rcpulse 2s infinite' : '';
    return `<div class="card"><div class="card-body" style="padding-top:14px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:13px;color:var(--sl,${T.slate});margin-bottom:10px">🤖 Vapi AI Status</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:8px;height:8px;background:${dot};border-radius:50%;${pulse}"></div>
        <span style="font-size:12px;font-weight:700;color:${dot}">${label}</span>
      </div>
      <div style="font-size:11px;color:var(--ll,${T.light});line-height:1.7;margin-bottom:10px">Calls handled 24/7. Transcripts and lead data auto-logged here.</div>
      <div style="background:${T.offWhite};border:1px solid ${T.border};border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:${T.light};margin-bottom:6px">Vapi Webhook</div>
        <div style="font-size:11px;font-family:monospace;color:${T.tealDark};word-break:break-all">POST /exec?action=webhook.vapi</div>
        <div style="font-size:10px;color:${T.light};margin-top:3px">event: end-of-call-report</div>
      </div>
    </div></div>`;
  }

  // ── KPI computation ──────────────────────────────────────────
  function _kpis() {
    const today = new Date().toISOString().slice(0,10);
    return {
      callsToday: _calls.filter(c => String(_norm(c).createdAt).slice(0,10) === today).length,
      qualified:  _calls.filter(c => _norm(c).qualified === true).length,
      urgent:     _calls.filter(c => _norm(c).urgency === 'urgent').length,
      callback:   _calls.filter(c => _needsCallback(c)).length,
      reviewed:   _calls.filter(c => _norm(c).reviewed).length,
    };
  }

  // ── Filter + sort ────────────────────────────────────────────
  function _filtered() {
    let rows = _calls;
    if (_filter === 'urgent')    rows = rows.filter(c => _norm(c).urgency === 'urgent');
    if (_filter === 'callback')  rows = rows.filter(c => _needsCallback(c));
    if (_filter === 'qualified') rows = rows.filter(c => _norm(c).qualified === true);
    if (_filter === 'reviewed')  rows = rows.filter(c => _norm(c).reviewed);

    if (_search) {
      const q = _search.toLowerCase();
      rows = rows.filter(c => {
        const n = _norm(c);
        return [n.callerName, n.phone, n.postcode, n.email, n.companyName,
                n.buildingType, n.intent, n.summary, n.transcript]
          .some(f => f && f.toLowerCase().includes(q));
      });
    }

    const out = [...rows];
    if (_sort === 'oldest') {
      out.sort((a,b) => new Date(_norm(a).createdAt||0) - new Date(_norm(b).createdAt||0));
    } else if (_sort === 'newest') {
      out.sort((a,b) => new Date(_norm(b).createdAt||0) - new Date(_norm(a).createdAt||0));
    } else {
      out.sort((a,b) => {
        const d = _norm(b).priority - _norm(a).priority;
        return d !== 0 ? d : new Date(_norm(b).createdAt||0) - new Date(_norm(a).createdAt||0);
      });
    }
    return out;
  }

  // ── Lead matching ────────────────────────────────────────────
  // Normalised phone + email. Mirrors backend normPhone logic.
  function _matchLead(n) {
    return _leads.find(l => {
      const lp = _normPhone(l.phone || l.phoneNumber || '');
      const le = String(l.email || '').trim().toLowerCase();
      return (n.phone && lp && n.phone === lp) ||
             (n.email && le && n.email === le);
    }) || null;
  }

  // ── Pill helpers ─────────────────────────────────────────────
  function _pill(t, bg, col) {
    return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${bg};color:${col};font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px">${t}</span>`;
  }

  function _statusPill(n) {
    if (n.spam)              return _pill('Spam',     'rgba(220,38,38,.1)',   T.red);
    if (n.reviewed)          return _pill('Reviewed', 'rgba(100,116,139,.1)',T.muted);
    if (n.status==='Converted') return _pill('Converted','rgba(124,58,237,.12)','#7C3AED');
    if (n.qualified===true)  return _pill('Qualified','rgba(5,150,105,.12)', T.green);
    if (n.status==='Callback') return _pill('Callback','rgba(217,119,6,.12)','#B45309');
    if (_needsCallback({__norm:n,status:n.status})) return _pill('Callback','rgba(217,119,6,.12)','#B45309');
    return _pill(n.status||'Logged','rgba(148,163,184,.14)',T.muted);
  }

  function _urgencyPill(n) {
    if (n.urgency==='urgent') return _pill('Urgent','rgba(220,38,38,.10)',  T.red);
    if (n.urgency==='high')   return _pill('High',  'rgba(234,88,12,.10)', '#EA580C');
    if (n.urgency==='low')    return _pill('Low',   'rgba(148,163,184,.14)',T.light);
    return _pill('Normal','rgba(13,148,136,.10)',T.teal);
  }

  function _fb(key, label) {
    const a = _filter === key;
    return `<button onclick="Reception.setFilter('${key}')"
      style="font-size:11px;padding:5px 12px;border-radius:999px;border:1px solid ${a?T.teal:'var(--bd,'+T.border+')'};background:${a?T.teal:'transparent'};color:${a?'#fff':'var(--sl,'+T.slate+')'};cursor:pointer;font-weight:700;transition:all .15s">${label}</button>`;
  }

  function _skeleton() {
    return `<div style="animation:rcpulse 1.5s infinite">
      <div style="height:60px;background:${T.offWhite};border-radius:12px;margin-bottom:16px"></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">${[...Array(4)].map(()=>`<div style="height:90px;background:${T.offWhite};border-radius:12px"></div>`).join('')}</div>
      <div style="height:400px;background:${T.offWhite};border-radius:12px"></div>
    </div>`;
  }

  // ── Event binding ────────────────────────────────────────────
  function _bindEvents() {
    const search = document.getElementById('rc-search');
    const sort   = document.getElementById('rc-sort');
    if (search) { search.value = _search; search.oninput = () => { _search = search.value; _draw(); }; }
    if (sort)   { sort.value = _sort;     sort.onchange  = () => { _sort   = sort.value;   _draw(); }; }

    const table = document.getElementById('rc-table');
    if (table && !table.__bound) {
      table.__bound = true;
      table.addEventListener('click', e => {
        const tr = e.target.closest('tr.rc-row');
        if (!tr) return;
        const c = _calls.find(x => _norm(x).id === tr.dataset.id);
        if (c) openCall(c);
      });
    }
  }

  // ── Actions ───────────────────────────────────────────────────
  async function createCallbackTask(callId) {
    try {
      await API.post('voice.callback', { callId });
      // Update local status
      _updateLocal(callId, { status: 'Callback' });
      UI.toast('Callback task created ↩');
      if (typeof UI.closeModal === 'function') UI.closeModal();
      _draw();
    } catch(e) { UI.toast(e.message || 'Failed', 'r'); }
  }

  async function convertToLead(callId) {
    try {
      const res = await API.post('voice.convert', { callId });
      _updateLocal(callId, { status: 'Converted', linkedLeadId: res.leadId || '' });
      UI.toast('Lead created ✓');
      if (typeof UI.closeModal === 'function') UI.closeModal();
      _draw();
    } catch(e) { UI.toast(e.message || 'Failed', 'r'); }
  }

  async function markReviewed(callId) {
    try { await API.post('voice.reviewed', { callId }); } catch(_) { /* optimistic */ }
    _updateLocal(callId, { status: 'Reviewed' });
    UI.toast('Marked as reviewed ✓');
    if (typeof UI.closeModal === 'function') UI.closeModal();
    _draw();
  }

  async function markSpam(callId) {
    try { await API.post('voice.spam', { callId }); } catch(_) { /* optimistic */ }
    _updateLocal(callId, { status: 'Spam' });
    UI.toast('Marked as spam ⛔');
    if (typeof UI.closeModal === 'function') UI.closeModal();
    _draw();
  }

  async function markCallbackDone(callId) {
    try { await API.post('voice.callback.done', { callId }); } catch(_) { /* optimistic */ }
    _updateLocal(callId, { status: 'Reviewed' });
    UI.toast('Callback complete ✓');
    _draw();
  }

  // ── Optimistic local update ───────────────────────────────────
  // Updates the local _calls array and clears the norm memo.
  function _updateLocal(callId, updates) {
    const c = _calls.find(x => _norm(x).id === callId);
    if (!c) return;
    Object.assign(c, updates);
    delete c.__norm; // clear memoised norm so it recomputes
  }

  function _openLead(id) {
    if (typeof UI.closeModal === 'function') UI.closeModal();
    if (window.CRM && typeof CRM.openViewById === 'function') CRM.openViewById(id);
    else UI.toast('Lead ' + id + ' — open CRM to view', 'a');
  }

  async function refresh() {
    await render();
    UI.toast('Reception refreshed ↻');
  }

  function setFilter(f) {
    _filter = f;
    _draw();
  }

  function _clearSearch() {
    _search = ''; _filter = 'all';
    _draw();
  }

  // ── Utilities ────────────────────────────────────────────────
  function _safe(v) {
    return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _fmtDt(v) {
    if (!v) return '—';
    try { return new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
    catch(_) { return String(v); }
  }

  // ── Public API ───────────────────────────────────────────────
  return {
    render, refresh, setFilter, openCall,
    createCallbackTask, convertToLead,
    markReviewed, markSpam, markCallbackDone,
    _openLead, _menu, _clearSearch,
  };

})();
