// ============================================================
// AskMiro Ops — modules/reception.js
// Front-end module for AI Receptionist / Call Centre
// Paste-ready, designed to match the current AskMiro Ops SPA style
// ============================================================

const Reception = (() => {
  let _calls = [];
  let _leads = [];
  let _filter = 'all'; // all | urgent | callback | qualified

  async function render() {
    const app = document.getElementById('main-content');
    if (!app) return;

    app.innerHTML = `<div class="card"><div class="card-body">Loading AI Receptionist…</div></div>`;

    try {
      const [callsRes, leadsRes] = await Promise.all([
        API.get('voice.calls').catch(() => []),
        API.get('leads').catch(() => [])
      ]);

      _calls = Array.isArray(callsRes) ? callsRes : (callsRes.rows || []);
      _leads = Array.isArray(leadsRes) ? leadsRes : [];
    } catch (e) {
      _calls = [];
      _leads = [];
    }

    const kpis = _getKpis();
    const rows = _getFilteredCalls();

    app.innerHTML = `
${UI.secHd('AI Receptionist', 'Phone Leads & Call Handling', `${_calls.length} calls logged`)}
<div class="gql">
  <div>
    <div class="fr3" style="margin-bottom:14px">
      ${_kpiCard('Calls Today', kpis.callsToday, 'Inbound voice activity')}
      ${_kpiCard('Qualified Leads', kpis.qualified, 'Ready for sales follow-up')}
      ${_kpiCard('Needs Callback', kpis.callback, 'Incomplete or escalation needed')}
    </div>

    <div class="card mb16">
      <div class="card-body" style="padding-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:15px;color:var(--sl)">Reception Queue</div>
            <div style="font-size:12px;color:var(--ll);margin-top:4px">View transcripts, prioritise callbacks, and convert hot leads into quotes.</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${_filterBtn('all', `All (${_calls.length})`)}
            ${_filterBtn('urgent', `Urgent (${kpis.urgent})`)}
            ${_filterBtn('callback', `Callback (${kpis.callback})`)}
            ${_filterBtn('qualified', `Qualified (${kpis.qualified})`)}
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-body" style="padding-top:12px">
        <div class="tbl-wrap">
          <table class="tbl" id="reception-table">
            <thead>
              <tr>
                <th>Caller</th>
                <th>Type</th>
                <th>Status</th>
                <th>Urgency</th>
                <th>Phone</th>
                <th>Postcode</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(_rowHtml).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ll);padding:26px">No calls in this view</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div>
    ${UI.secHd('Playbook', 'Founder Next Actions')}
    <div class="card mb16">
      <div class="card-body" style="padding-top:14px">
        <div style="font-size:13px;color:var(--sl);line-height:1.75">
          <div><strong>1.</strong> Call back urgent commercial leads first.</div>
          <div><strong>2.</strong> Convert qualified callers into draft quotes within the hour.</div>
          <div><strong>3.</strong> For incomplete calls, send a short follow-up email or SMS asking for missing details.</div>
          <div><strong>4.</strong> Mark spam quickly so the queue stays clean.</div>
        </div>
      </div>
    </div>

    ${UI.secHd('Live Snapshot', 'Today')}
    <div class="card">
      <div class="card-body" style="padding-top:14px">
        ${_snapshotHtml(kpis)}
      </div>
    </div>
  </div>
</div>`;

    _bindTableClicks();
  }

  function _getKpis() {
    const today = new Date().toISOString().slice(0, 10);
    const callsToday = _calls.filter(c => String(c.createdAt || c.date || '').slice(0, 10) === today).length;
    const qualified = _calls.filter(c => _isQualified(c)).length;
    const urgent = _calls.filter(c => _urgency(c) === 'urgent').length;
    const callback = _calls.filter(c => _needsCallback(c)).length;
    return { callsToday, qualified, urgent, callback };
  }

  function _getFilteredCalls() {
    if (_filter === 'urgent') return _calls.filter(c => _urgency(c) === 'urgent');
    if (_filter === 'callback') return _calls.filter(c => _needsCallback(c));
    if (_filter === 'qualified') return _calls.filter(c => _isQualified(c));
    return _calls;
  }

  function _isQualified(c) {
    return String(c.qualified || '').toLowerCase() === 'true' || c.status === 'Qualified' || c.intent === 'new_lead';
  }

  function _needsCallback(c) {
    const status = String(c.status || '').toLowerCase();
    return status.includes('callback') || status.includes('incomplete') || String(c.qualified || '').toLowerCase() === 'false';
  }

  function _urgency(c) {
    return String(c.urgency || 'normal').toLowerCase();
  }

  function _kpiCard(title, value, sub) {
    return `<div class="card"><div class="card-body" style="padding-top:14px">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--ll);font-weight:800">${title}</div>
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:28px;color:var(--sl);margin-top:8px">${value}</div>
      <div style="font-size:12px;color:var(--ll);margin-top:6px">${sub}</div>
    </div></div>`;
  }

  function _filterBtn(key, label) {
    const active = _filter === key;
    return `<button onclick="Reception.setFilter('${key}')" style="font-size:12px;padding:6px 12px;border-radius:999px;border:1px solid ${active ? '#0D9488' : 'var(--bd)'};background:${active ? '#0D9488' : 'transparent'};color:${active ? '#fff' : 'var(--sl)'};cursor:pointer;font-weight:700">${label}</button>`;
  }

  function _pill(text, bg, color) {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${color};font-size:11px;font-weight:800">${text}</span>`;
  }

  function _statusPill(c) {
    if (_isQualified(c)) return _pill('Qualified', 'rgba(16,185,129,.12)', '#059669');
    if (_needsCallback(c)) return _pill('Callback', 'rgba(217,119,6,.12)', '#B45309');
    return _pill(c.status || 'Logged', 'rgba(148,163,184,.14)', '#475569');
  }

  function _urgencyPill(c) {
    const u = _urgency(c);
    if (u === 'urgent' || u === 'high') return _pill('Urgent', 'rgba(220,38,38,.12)', '#DC2626');
    return _pill('Normal', 'rgba(13,148,136,.10)', '#0D9488');
  }

  function _rowHtml(c) {
    return `<tr class="rc-row" data-callid="${c.id || ''}" style="cursor:pointer">
      <td>
        <div style="font-weight:700;color:var(--sl)">${_safe(c.callerName || c.caller_name || 'Unknown caller')}</div>
        <div style="font-size:12px;color:var(--ll);margin-top:3px">${_safe(c.email || 'No email')}</div>
      </td>
      <td>${_safe(c.intent || c.buildingType || c.building_type || 'General enquiry')}</td>
      <td>${_statusPill(c)}</td>
      <td>${_urgencyPill(c)}</td>
      <td>${_safe(c.phone || '—')}</td>
      <td>${_safe(c.postcode || '—')}</td>
      <td>${_fmtDt(c.createdAt || c.date || '')}</td>
    </tr>`;
  }

  function _snapshotHtml(k) {
    return `
      <div class="mp-row"><span class="mp-lbl">Urgent calls</span><span class="mp-val">${k.urgent}</span></div>
      <div class="mp-row"><span class="mp-lbl">Qualified leads</span><span class="mp-val">${k.qualified}</span></div>
      <div class="mp-row"><span class="mp-lbl">Needs callback</span><span class="mp-val">${k.callback}</span></div>
      <div class="mp-row"><span class="mp-lbl">Total calls today</span><span class="mp-val">${k.callsToday}</span></div>
      <div style="margin-top:12px;background:var(--of);padding:10px;border-radius:var(--rs);font-size:12px;color:var(--ll);line-height:1.7">
        Keep this module lean. The aim is fast triage and lead conversion, not a bloated call centre UI.
      </div>`;
  }

  function _bindTableClicks() {
    const table = document.getElementById('reception-table');
    if (!table || table.__bound) return;
    table.__bound = true;

    table.addEventListener('click', e => {
      const tr = e.target.closest('tr.rc-row');
      if (!tr) return;
      const id = tr.getAttribute('data-callid');
      const call = _calls.find(x => String(x.id) === String(id));
      if (!call) return;
      openCall(call);
    });
  }

  function openCall(c) {
    const transcript = c.transcript || c.summary || 'No transcript available.';
    const qualified = _isQualified(c);
    const lead = _matchLead(c);

    UI.openModal(`<div class="modal-hd">
      <h2>${_safe(c.callerName || c.caller_name || 'Call')} ${qualified ? '<span style="font-size:11px;background:#0D9488;color:#fff;padding:2px 8px;border-radius:999px;vertical-align:middle">Qualified</span>' : ''}</h2>
      <button class="xbtn" onclick="UI.closeModal()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div style="border:1px solid var(--bd);border-radius:var(--rs);padding:14px 16px;margin-bottom:14px;background:var(--of)">
        <div class="mp-row"><span class="mp-lbl">Phone</span><span>${_safe(c.phone || '—')}</span></div>
        <div class="mp-row"><span class="mp-lbl">Email</span><span>${_safe(c.email || '—')}</span></div>
        <div class="mp-row"><span class="mp-lbl">Postcode</span><span>${_safe(c.postcode || '—')}</span></div>
        <div class="mp-row"><span class="mp-lbl">Building Type</span><span>${_safe(c.buildingType || c.building_type || '—')}</span></div>
        <div class="mp-row"><span class="mp-lbl">Frequency</span><span>${_safe(c.frequency || '—')}</span></div>
        <div class="mp-row"><span class="mp-lbl">Urgency</span><span>${_urgencyPill(c)}</span></div>
      </div>

      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:14px;color:var(--sl);margin-bottom:8px">Transcript / Summary</div>
      <div style="background:#fff;border:1px solid var(--bd);border-radius:var(--rs);padding:14px 16px;font-size:13px;color:var(--sl);line-height:1.8;max-height:240px;overflow:auto">${_safe(transcript).replace(/\n/g, '<br>')}</div>

      ${c.recordingUrl ? `<div style="margin-top:12px"><a href="${c.recordingUrl}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:#0D9488;text-decoration:none">&#9658; Open recording</a></div>` : ''}

      <div class="modal-foot" style="margin-top:18px">
        <button class="btn bo" onclick="UI.closeModal()">Close</button>
        <button class="btn bo" onclick="Reception.createCallbackTask('${c.id || ''}')">Create Callback Task</button>
        ${lead ? `<button class="btn bp" onclick="Reception.openLead('${lead.id}')">Open Lead</button>` : `<button class="btn bp" onclick="Reception.convertToLead('${c.id || ''}')">Convert to Lead</button>`}
      </div>
    </div>`);
  }

  function _matchLead(c) {
    const phone = String(c.phone || '').trim();
    const email = String(c.email || '').trim().toLowerCase();
    return _leads.find(l => (phone && String(l.phone || '').trim() === phone) || (email && String(l.email || '').trim().toLowerCase() === email));
  }

  async function createCallbackTask(callId) {
    const c = _calls.find(x => String(x.id) === String(callId));
    if (!c) return;

    try {
      await API.post('task', {
        title: `Call back ${c.callerName || c.caller_name || 'new caller'}`,
        status: 'Open',
        priority: _urgency(c) === 'urgent' ? 'High' : 'Normal',
        relatedType: 'VoiceCall',
        relatedId: c.id,
        notes: `Phone: ${c.phone || ''} | Summary: ${c.summary || c.transcript || ''}`
      });
      UI.toast('Callback task created');
      UI.closeModal();
    } catch (e) {
      UI.toast(e.message || 'Failed to create callback task', 'r');
    }
  }

  async function convertToLead(callId) {
    const c = _calls.find(x => String(x.id) === String(callId));
    if (!c) return;

    try {
      const res = await API.post('lead', {
        companyName: c.companyName || c.callerName || c.caller_name || 'Phone Lead',
        contactName: c.callerName || c.caller_name || 'Unknown',
        email: c.email || `unknown-${Date.now()}@placeholder.local`,
        phone: c.phone || '',
        segment: c.buildingType || c.building_type || 'General',
        source: 'AI Receptionist',
        status: 'New',
        notes: `Postcode: ${c.postcode || ''} | Frequency: ${c.frequency || ''} | Summary: ${c.summary || c.transcript || ''}`
      });
      UI.toast(`Lead ${res.id} created`);
      UI.closeModal();
      await render();
    } catch (e) {
      UI.toast(e.message || 'Failed to convert to lead', 'r');
    }
  }

  function openLead(id) {
    UI.closeModal();
    if (window.CRM && typeof CRM.openViewById === 'function') {
      CRM.openViewById(id);
      return;
    }
    UI.toast(`Lead ${id} linked. Open CRM to view.`, 'a');
  }

  function setFilter(f) {
    _filter = f;
    render();
  }

  function _safe(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _fmtDt(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return v; }
  }

  return { render, setFilter, openCall, createCallbackTask, convertToLead, openLead };
})();

// ============================================================
// NAV INTEGRATION NOTES
// ============================================================
// 1. Add a left-nav item for Reception in your main shell.
// 2. Point it to Reception.render().
// 3. Add backend endpoints:
//    GET  voice.calls
//    POST task
//    POST lead
// 4. Recommended route hash: #/reception
// ============================================================
