// ============================================================
// AskMiro Ops — modules/cleaners.js
// Reads from Railway Postgres via /api/cleaners
// ============================================================
window.Cleaners = (() => {

  const OS = () => (window.CFG && window.CFG.OS_URL) || 'https://askmiro-api-production.up.railway.app';

  async function _fetch(path) {
    const res = await fetch(OS() + path);
    if (!res.ok) throw new Error('API error ' + res.status);
    return res.json();
  }

  async function render() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = '<div style="padding:40px;text-align:center;color:#94A3B8">Loading cleaners…</div>';

    let data;
    try { data = await _fetch('/api/cleaners'); }
    catch(e) {
      mc.innerHTML = `<div style="padding:40px"><div style="color:#DC2626;font-weight:700">⚠ Could not load cleaners: ${e.message}</div></div>`;
      return;
    }

    const cleaners = data.cleaners || [];

    const statusColour = {
      'Active':   ['#059669','rgba(5,150,105,.1)'],
      'Trial':    ['#7C3AED','rgba(124,58,237,.1)'],
      'Inactive': ['#D97706','rgba(217,119,6,.1)'],
      'Archived': ['#94A3B8','#F1F5F9'],
    };
    const compColour = {
      'Ready':    ['#059669','rgba(5,150,105,.1)'],
      'Pending':  ['#D97706','rgba(217,119,6,.1)'],
      'Expiring': ['#DC2626','rgba(220,38,38,.08)'],
      'Blocked':  ['#DC2626','rgba(220,38,38,.1)'],
    };
    function pill(label, colours) {
      const [c, bg] = colours || ['#64748B','#F1F5F9'];
      return `<span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${bg};color:${c}">${label}</span>`;
    }

    const rows = cleaners.map(c => {
      const sc = statusColour[c.status] || ['#64748B','#F1F5F9'];
      const cc = compColour[c.compliance_status] || ['#64748B','#F1F5F9'];
      const services = (c.services_offered || '').split('|').filter(Boolean).slice(0,2).join(', ') || '—';
      return `<tr style="cursor:pointer" onclick="Cleaners.openDetail(${c.id})">
        <td style="font-weight:600;color:#0F172A">${c.full_name || '—'}</td>
        <td style="color:#64748B;font-size:12px">${c.phone || '—'}</td>
        <td style="color:#64748B;font-size:12px">${c.borough || c.home_postcode || '—'}</td>
        <td>${pill(c.status || '—', sc)}</td>
        <td>${pill(c.compliance_status || '—', cc)}</td>
        <td style="font-size:12px;color:#64748B">${c.cleaner_type || '—'}</td>
        <td style="font-size:12px;color:#64748B">${c.availability_type || '—'}</td>
        <td style="font-size:12px;color:#64748B">${services}</td>
        <td style="font-size:12px;color:#64748B">${c.transport_mode || '—'}</td>
        <td style="font-size:12px">${c.hourly_rate ? '£' + parseFloat(c.hourly_rate).toFixed(2) : '—'}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="10" style="text-align:center;padding:32px;color:#94A3B8">No cleaners found</td></tr>`;

    mc.innerHTML = `
${UI.secHd('Cleaners', 'Workforce Database', `${data.total || cleaners.length} total · ${data.active || 0} active`)}
<div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:20px">
  <div class="kpi kpi-t"><div class="kpi-label">Total</div><div class="kpi-value">${data.total || 0}</div></div>
  <div class="kpi kpi-g"><div class="kpi-label">Active</div><div class="kpi-value">${data.active || 0}</div></div>
  <div class="kpi kpi-g"><div class="kpi-label">Available Today</div><div class="kpi-value">${data.available_today || 0}</div></div>
  <div class="kpi kpi-a"><div class="kpi-label">Emergency Cover</div><div class="kpi-value">${data.emergency_cover || 0}</div></div>
  <div class="kpi kpi-${(data.compliance_ready||0) < (data.active||1) ? 'a' : 'g'}"><div class="kpi-label">Compliance Ready</div><div class="kpi-value">${data.compliance_ready || 0}</div></div>
</div>
<div class="card">
  <div class="card-body" style="padding-top:12px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Name</th><th>Phone</th><th>Area</th><th>Status</th>
        <th>Compliance</th><th>Type</th><th>Availability</th>
        <th>Services</th><th>Transport</th><th>Rate</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>
</div>`;
  }

  function openDetail(id) {
    UI.toast('Full profile: open AskMiro OS → Cleaners', 'g', 2500);
  }

  return { render, openDetail };
})();
