window. Ops = (() => {
  let _jobs = [];
  async function render() {
    try { _jobs = await API.get('jobs', { from: UI.today() }); } catch(e) { _jobs = []; }
    const missed = _jobs.filter(j => j.status === 'Missed').length;
    const rows = _jobs.map(j => `<tr>
      <td class="tmn">${j.id}</td><td class="tfw">${j.siteId}</td>
      <td>${j.date||'&#8212;'}</td><td>${j.startTime||'&#8212;'}</td>
      <td>${j.staffName||'&#8212;'}</td>
      <td>${UI.statusPill(j.status)}</td>
      <td>${j.status==='Scheduled'?`<button class="btn bo btn-xs" onclick="Ops.clockIn('${j.id}')">Clock In</button>`:j.status==='InProgress'?`<button class="btn bp btn-xs" onclick="Ops.clockOut('${j.id}')">Clock Out</button>`:''}</td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ll);padding:24px">No jobs today</td></tr>`;
    document.getElementById('main-content').innerHTML = `
${UI.secHd('Ops', "Today's Jobs", _jobs.length + ' scheduled')}
${missed > 0 ? `<div class="alert alert-r">&#9888; ${missed} missed job${missed>1?'s':''} today &#8212; please investigate</div>` : ''}
<div class="fb"><div class="sp"></div><button class="btn bp" onclick="Ops.openNew()">+ Schedule Job</button></div>
<div class="card"><div class="card-body" style="padding-top:12px"><div class="tbl-wrap"><table class="tbl">
  <thead><tr><th>Job ID</th><th>Site</th><th>Date</th><th>Start</th><th>Staff</th><th>Status</th><th></th></tr></thead>
  <tbody>${rows}</tbody>
</table></div></div></div>`;
  }
  async function clockIn(id) {
    try { await API.post('job', { id, status: 'InProgress', clockIn: new Date().toISOString() }); UI.toast('Clocked in'); await render(); }
    catch(e) { UI.toast(e.message, 'r'); }
  }
  async function clockOut(id) {
    try { await API.post('job', { id, status: 'Complete', clockOut: new Date().toISOString() }); UI.toast('Clocked out — job complete'); await render(); }
    catch(e) { UI.toast(e.message, 'r'); }
  }
  function openNew() {
    UI.openModal(`<div class="modal-hd"><h2>Schedule Job</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr"><div class="fg"><label class="fl">Site ID <span class="req">*</span></label><input class="fin" id="j-si" placeholder="SITE-..."></div>
  <div class="fg"><label class="fl">Date <span class="req">*</span></label><input class="fin" id="j-dt" type="date" value="${UI.today()}"></div></div>
  <div class="fr"><div class="fg"><label class="fl">Start Time <span class="req">*</span></label><input class="fin" id="j-st" type="time" value="06:00"></div>
  <div class="fg"><label class="fl">Staff Name</label><input class="fin" id="j-sf" placeholder="Cleaner name"></div></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Ops.saveJob()">Schedule</button></div>
</div>`);
  }
  async function saveJob() {
    if (!UI.rq('j-si') || !UI.rq('j-dt') || !UI.rq('j-st')) return;
    try {
      await API.post('job', { siteId: UI.gv('j-si'), date: UI.gv('j-dt'), startTime: UI.gv('j-st'), staffName: UI.gv('j-sf') });
      UI.closeModal(); UI.toast('Job scheduled'); await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }
  return { render, clockIn, clockOut, openNew, saveJob };
})();
