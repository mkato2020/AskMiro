window. Ops = (() => {
  let _jobs = [];
  async function render() {
    const osUrl = (window.CFG && window.CFG.OS_URL) || 'https://askmiro-api-production.up.railway.app';
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
