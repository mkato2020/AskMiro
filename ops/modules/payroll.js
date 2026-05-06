// ============================================================
// AskMiro Ops — modules/payroll.js
// Reads from Railway Postgres via /api/payroll
// ============================================================
window.Payroll = (() => {

  const OS = () => (window.CFG && window.CFG.OS_URL) || 'https://askmiro-api-production.up.railway.app';

  async function _fetch(path) {
    const res = await fetch(OS() + path);
    if (!res.ok) throw new Error('API error ' + res.status);
    return res.json();
  }

  async function render() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = '<div style="padding:40px;text-align:center;color:#94A3B8">Loading payroll…</div>';

    let data;
    try { data = await _fetch('/api/payroll'); }
    catch(e) {
      mc.innerHTML = `<div style="padding:40px;color:#DC2626;font-weight:700">⚠ Could not load payroll: ${e.message}</div>`;
      return;
    }

    const entries = data.entries || [];
    const summary = data.summary || {};
    const workers = data.workers || [];

    const statusColour = {
      'pending':  ['#D97706','rgba(217,119,6,.1)'],
      'approved': ['#0A9688','rgba(10,150,136,.1)'],
      'paid':     ['#059669','rgba(5,150,105,.1)'],
      'rejected': ['#DC2626','rgba(220,38,38,.1)'],
    };
    function pill(label, colours) {
      const [c, bg] = colours || ['#64748B','#F1F5F9'];
      return `<span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${bg};color:${c}">${label}</span>`;
    }

    const entryRows = entries.map(e => {
      const sc = statusColour[e.status] || ['#64748B','#F1F5F9'];
      return `<tr>
        <td style="font-weight:600;color:#0F172A">${e.worker_name || '—'}</td>
        <td style="font-size:12px;color:#64748B">${e.worker_role || e.role || '—'}</td>
        <td style="font-size:12px;color:#64748B">${e.entry_date || '—'}</td>
        <td style="font-size:12px;color:#64748B">${e.entry_type || '—'}</td>
        <td style="font-size:12px">${e.hours_worked || 0} hrs</td>
        <td style="font-size:12px">£${parseFloat(e.hourly_rate||0).toFixed(2)}/hr</td>
        <td style="font-weight:700">£${parseFloat(e.total_pay||0).toFixed(2)}</td>
        <td>${pill(e.status || '—', sc)}</td>
        <td style="font-size:12px;color:#64748B">${e.notes || '—'}</td>
        ${e.status === 'pending' ? `<td><button class="btn bo btn-xs" onclick="Payroll.approve(${e.id})">Approve</button></td>` : '<td></td>'}
      </tr>`;
    }).join('') || `<tr><td colspan="10" style="text-align:center;padding:32px;color:#94A3B8">No payroll entries</td></tr>`;

    mc.innerHTML = `
${UI.secHd('Payroll', 'Labour & Pay Records', '')}
<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
  <div class="kpi kpi-t"><div class="kpi-label">Total Gross Pay</div><div class="kpi-value">${UI.fmtk(summary.total_gross||0)}</div></div>
  <div class="kpi kpi-a"><div class="kpi-label">Pending Approval</div><div class="kpi-value">${summary.pending_count||0}</div></div>
  <div class="kpi kpi-g"><div class="kpi-label">Approved</div><div class="kpi-value">${summary.approved_count||0}</div></div>
  <div class="kpi kpi-g"><div class="kpi-label">Total Hours</div><div class="kpi-value">${summary.total_hours||0}h</div></div>
</div>

${UI.secHd('Entries', 'All Pay Entries', `${entries.length} records`)}
<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
  <button class="btn bp" onclick="Payroll.openNewEntry()">+ Log Hours</button>
</div>
<div class="card">
  <div class="card-body" style="padding-top:12px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Worker</th><th>Role</th><th>Date</th><th>Type</th>
        <th>Hours</th><th>Rate</th><th>Pay</th><th>Status</th><th>Notes</th><th></th>
      </tr></thead>
      <tbody>${entryRows}</tbody>
    </table></div>
  </div>
</div>`;
  }

  async function approve(entryId) {
    try {
      const res = await fetch(OS() + '/api/payroll/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entryId }),
      });
      if (!res.ok) throw new Error(await res.text());
      UI.toast('Entry approved', 'g');
      await render();
    } catch(e) { UI.toast('Error: ' + e.message, 'r'); }
  }

  function openNewEntry() {
    UI.openModal(`
<div class="modal-hd"><h2>Log Hours</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Worker Name <span class="req">*</span></label><input class="fin" id="py-wn" placeholder="e.g. Jane Smith"></div>
    <div class="fg"><label class="fl">Date <span class="req">*</span></label><input class="fin" id="py-dt" type="date" value="${UI.today()}"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Hours <span class="req">*</span></label><input class="fin" id="py-hr" type="number" placeholder="8" step="0.5"></div>
    <div class="fg"><label class="fl">Hourly Rate (£) <span class="req">*</span></label><input class="fin" id="py-rt" type="number" placeholder="12.50" step="0.01"></div>
  </div>
  <div class="fg"><label class="fl">Notes</label><input class="fin" id="py-nt" placeholder="Job reference, site, etc."></div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Payroll.saveEntry()">Save Entry</button>
  </div>
</div>`);
  }

  async function saveEntry() {
    const wn = UI.gv('py-wn'), hr = UI.gv('py-hr'), rt = UI.gv('py-rt'), dt = UI.gv('py-dt');
    if (!wn || !hr || !rt) { UI.toast('Fill in all required fields', 'r'); return; }
    try {
      const res = await fetch(OS() + '/api/payroll/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_name: wn,
          entry_date: dt,
          entry_type: 'Basic Hours',
          hours_worked: parseFloat(hr),
          hourly_rate: parseFloat(rt),
          notes: UI.gv('py-nt'),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      UI.closeModal();
      UI.toast('Hours logged', 'g');
      await render();
    } catch(e) { UI.toast('Error: ' + e.message, 'r'); }
  }

  return { render, approve, openNewEntry, saveEntry };
})();
