const Quality = (() => {
  let _tab = 'inspections', _inspections = [], _incidents = [];
  async function render() {
    try {
      const d = await API.get('quality');
      _inspections = d.inspections || []; _incidents = d.incidents || [];
    } catch(e) { _inspections = []; _incidents = []; }
    updateBadge(); _draw();
  }
  function updateBadge() {
    const n = _incidents.filter(i => i.status === 'Open').length;
    const el = document.getElementById('badge-quality');
    if (el) { el.textContent = n; el.style.display = n > 0 ? '' : 'none'; }
  }
  function _draw() {
    const iRows = _inspections.map(i => `<tr>
      <td class="tmn">${i.id}</td><td>${i.date||'&#8212;'}</td>
      <td class="tfw">${i.siteId}</td><td>${i.inspector||'&#8212;'}</td>
      <td>${UI.pill(UI.fmtPct(i.score||0), UI.ragCls(parseFloat(i.score||0),90,85))}</td>
      <td style="font-size:12px;color:var(--sl)">${i.notes||'&#8212;'}</td>
    </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ll);padding:24px">No inspections logged</td></tr>`;
    const incRows = _incidents.map(i => `<tr>
      <td class="tmn">${i.id}</td><td>${i.date||'&#8212;'}</td>
      <td class="tfw">${i.siteId}</td><td>${i.type||'&#8212;'}</td>
      <td style="font-size:12px;max-width:200px">${i.description||'&#8212;'}</td>
      <td>${UI.statusPill(i.status)}</td>
      <td>${i.status==='Open'?`<button class="btn bp btn-xs" onclick='Quality.openResolve(${JSON.stringify(JSON.stringify(i))})'>Resolve</button>`:''}</td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ll);padding:24px">No incidents logged</td></tr>`;
    document.getElementById('main-content').innerHTML = `
${UI.secHd('Quality', 'Inspections & Incidents')}
<div class="fb">
  <div class="tg-wrap">
    <button class="tg-btn ${_tab==='inspections'?'active':''}" onclick="Quality._tab='inspections';Quality._draw()">&#10003; Inspections (${_inspections.length})</button>
    <button class="tg-btn ${_tab==='incidents'?'active':''}" onclick="Quality._tab='incidents';Quality._draw()">&#9888; Incidents (${_incidents.filter(i=>i.status==='Open').length} open)</button>
  </div>
  <div class="sp"></div>
  ${_tab==='inspections'?`<button class="btn bp" onclick="Quality.openNewInspection()">+ Log Inspection</button>`:`<button class="btn bp" onclick="Quality.openNewIncident()">+ Raise Incident</button>`}
</div>
${_tab==='inspections'
  ? `<div class="card"><div class="card-body" style="padding-top:12px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Date</th><th>Site</th><th>Inspector</th><th>Score</th><th>Notes</th></tr></thead><tbody>${iRows}</tbody></table></div></div></div>`
  : `<div class="card"><div class="card-body" style="padding-top:12px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Date</th><th>Site</th><th>Type</th><th>Description</th><th>Status</th><th></th></tr></thead><tbody>${incRows}</tbody></table></div></div></div>`}`;
  }
  function openNewInspection() {
    UI.openModal(`<div class="modal-hd"><h2>Log Inspection</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr"><div class="fg"><label class="fl">Site ID <span class="req">*</span></label><input class="fin" id="in-si" placeholder="SITE-..."></div>
  <div class="fg"><label class="fl">Date</label><input class="fin" id="in-dt" type="date" value="${UI.today()}"></div></div>
  <div class="fr"><div class="fg"><label class="fl">Inspector</label><input class="fin" id="in-ins" placeholder="Name"></div>
  <div class="fg"><label class="fl">Score (0-100) <span class="req">*</span></label><input class="fin" id="in-sc" type="number" min="0" max="100" placeholder="e.g. 92"></div></div>
  <div class="fg"><label class="fl">Notes</label><textarea class="fta" id="in-nt" placeholder="Issues found, areas for improvement&#8230;"></textarea></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Quality.saveInspection()">Save</button></div>
</div>`);
  }
  async function saveInspection() {
    if (!UI.rq('in-si') || !UI.rq('in-sc')) return;
    try {
      await API.post('inspection', { siteId: UI.gv('in-si'), date: UI.gv('in-dt'), inspector: UI.gv('in-ins'), score: UI.gv('in-sc'), notes: UI.gv('in-nt') });
      UI.closeModal(); UI.toast('Inspection logged'); await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }
  function openNewIncident() {
    UI.openModal(`<div class="modal-hd"><h2>&#9888; Raise Incident</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr"><div class="fg"><label class="fl">Site ID <span class="req">*</span></label><input class="fin" id="inc-si" placeholder="SITE-..."></div>
  <div class="fg"><label class="fl">Type <span class="req">*</span></label><select class="fse" id="inc-ty"><option>Complaint</option><option>Near Miss</option><option>Accident</option><option>Reclean</option></select></div></div>
  <div class="fg"><label class="fl">Description <span class="req">*</span></label><textarea class="fta" id="inc-ds" placeholder="What happened&#8230;"></textarea></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Quality.saveIncident()">Raise Incident</button></div>
</div>`);
  }
  async function saveIncident() {
    if (!UI.rq('inc-si') || !UI.rq('inc-ds')) return;
    try {
      await API.post('incident', { siteId: UI.gv('inc-si'), type: UI.gv('inc-ty'), description: UI.gv('inc-ds') });
      UI.closeModal(); UI.toast('Incident raised', 'a'); await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }
  function openResolve(jsonStr) {
    const i = JSON.parse(jsonStr);
    UI.openModal(`<div class="modal-hd"><h2>Resolve Incident</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="alert alert-a" style="margin-bottom:14px">&#9888; ${i.id} &#8212; ${i.type} at ${i.siteId}</div>
  <div class="fg"><label class="fl">Resolution <span class="req">*</span></label><textarea class="fta" id="res-notes" placeholder="What action was taken&#8230;"></textarea></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Quality.doResolve('${i.id}')">&#10003; Mark Resolved</button></div>
</div>`);
  }
  async function doResolve(id) {
    if (!UI.rq('res-notes')) return;
    try {
      await API.post('incident.resolve', { id, resolution: UI.gv('res-notes') });
      UI.closeModal(); UI.toast('Incident resolved'); await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }
  return { render, _draw, _tab, openNewInspection, saveInspection, openNewIncident, saveIncident, openResolve, doResolve };
})();
