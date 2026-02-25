const Contracts = (() => {
  let _contracts = [];
  async function render() {
    try { _contracts = await API.get('contracts'); } catch(e) { _contracts = []; }
    const rows = _contracts.map(c => `<tr onclick='Contracts.openView(${JSON.stringify(JSON.stringify(c))})'>
      <td class="tmn">${c.id}</td><td class="tfw">${c.clientName||c.siteId}</td>
      <td>${UI.fmt(c.revenueMonthly||0)}/mo</td><td>${UI.fmt(c.annualValue||0)}/yr</td>
      <td>${c.startDate||'&#8212;'}</td><td>${UI.statusPill(c.status)}</td>
    </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ll);padding:24px">No contracts yet</td></tr>`;
    document.getElementById('main-content').innerHTML = `
${UI.secHd('Contracts', 'Active Agreements', _contracts.length + ' contracts')}
<div class="card"><div class="card-body" style="padding-top:12px"><div class="tbl-wrap"><table class="tbl">
  <thead><tr><th>Contract ID</th><th>Client / Site</th><th>Revenue/mo</th><th>Annual Value</th><th>Start Date</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div></div></div>`;
  }
  function openView(jsonStr) {
    const c = JSON.parse(jsonStr);
    UI.openDrawer('Contract: ' + c.id, `<dl class="dl">
      <dt>Status</dt><dd>${UI.statusPill(c.status)}</dd>
      <dt>Client</dt><dd>${c.clientName||'&#8212;'}</dd>
      <dt>Site ID</dt><dd>${c.siteId}</dd>
      <dt>Revenue/mo</dt><dd>${UI.fmt(c.revenueMonthly||0)}</dd>
      <dt>Annual Value</dt><dd>${UI.fmt(c.annualValue||0)}</dd>
      <dt>Start Date</dt><dd>${c.startDate||'&#8212;'}</dd>
      <dt>Quote Ref</dt><dd class="tmn">${c.quoteId||'&#8212;'}</dd>
    </dl>`);
  }
  return { render, openView };
})();
