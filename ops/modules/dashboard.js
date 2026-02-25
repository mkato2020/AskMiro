// ============================================================
// AskMiro Ops — modules/dashboard.js
// ============================================================
const Dashboard = (() => {
  async function render() {
    const app = document.getElementById('main-content');
    let d;
    try { d = await API.get('dashboard'); }
    catch(e) { app.innerHTML = `<div class="alert alert-r">&times; Failed to load dashboard: ${e.message}</div>`; return; }

    const k = d.kpis || {};
    const REV = d.recentFinance ? d.recentFinance.map(r => parseFloat(r.revenue||0)) : [92000,95000,98000,102000,112000,121000];
    const MGN = d.recentFinance ? d.recentFinance.map(r => { const rv=parseFloat(r.revenue||0),dc=parseFloat(r.directCost||0); return rv>0?(rv-dc)/rv*100:0; }) : [43,44,45,45,46,47];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun'];

    const attnRows = (d.attention||[]).map(s => `<tr onclick="UI.openDrawer('${s.name}', Dashboard.siteDrawer(${JSON.stringify(JSON.stringify(s))}))">
      <td class="tfw">${s.name}</td>
      <td>${s.segment||'&#8212;'}</td>
      <td>${UI.pill(UI.fmtPct(s.avgAudit||0), UI.ragCls(s.avgAudit||0, 90, 85))}</td>
      <td style="color:${s.openIncidents>0?'var(--am)':'inherit'};font-weight:${s.openIncidents>0?700:400}">${s.openIncidents||'&#8212;'}</td>
      <td><button class="btn bo btn-xs" onclick="event.stopPropagation();Router.navigate('quality')">Quality &#8594;</button></td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--ll);padding:24px">All sites performing well &#10003;</td></tr>`;

    app.innerHTML = `
${UI.secHd('Overview', 'Executive Dashboard', 'H1 2025')}
<div class="kpi-grid">
  <div class="kpi kpi-t"><div class="kpi-label">Active Sites</div><div class="kpi-value">${k.activeSites||0}</div><div class="kpi-delta delta-g">&#9650; Portfolio</div></div>
  <div class="kpi kpi-g"><div class="kpi-label">Monthly Revenue</div><div class="kpi-value">${UI.fmtk(k.totalRevenue||0)}</div><div class="kpi-delta delta-g">&#9650; Growing</div></div>
  <div class="kpi kpi-${UI.ragCls(k.portfolioMargin||0,45,35)}"><div class="kpi-label">Portfolio Margin</div><div class="kpi-value">${UI.fmtPct(k.portfolioMargin||0)}</div></div>
  <div class="kpi kpi-${UI.ragCls(k.avgAudit||0,90,85)}"><div class="kpi-label">Avg Audit Score</div><div class="kpi-value">${UI.fmtPct(k.avgAudit||0)}</div></div>
  <div class="kpi kpi-${k.openIncidents>2?'r':k.openIncidents>0?'a':'g'}"><div class="kpi-label">Open Incidents</div><div class="kpi-value" style="color:${k.openIncidents>2?'var(--rd)':k.openIncidents>0?'var(--am)':'var(--gn)'}">${k.openIncidents||0}</div></div>
</div>

<div class="gch">
  <div class="card">
    <div class="card-hd"><div class="card-title">&#128200; Revenue &amp; Margin % &#8212; H1</div><span class="card-meta">6 months</span></div>
    <div class="card-body chart-wrap">${UI.barLineChart(MONTHS, REV, MGN)}</div>
  </div>
  <div class="card">
    <div class="card-hd"><div class="card-title">&#10003; Audit Scores by Site</div></div>
    <div class="card-body chart-wrap">${UI.hBarChart((d.attention||[]).map(s=>({label:s.name,v:Math.round(s.avgAudit||0)})))}</div>
  </div>
</div>

${UI.secHd('Attention', 'Sites Needing Review', (d.attention||[]).length + ' sites')}
<div class="card mb16">
  <div class="card-body" style="padding-top:12px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Site</th><th>Segment</th><th>Avg Audit</th><th>Open Incidents</th><th></th></tr></thead>
      <tbody>${attnRows}</tbody>
    </table></div>
  </div>
</div>

<div class="g2">
  <div class="card">
    <div class="card-hd"><div class="card-title">&#128203; Active Contracts</div><span class="card-meta">${k.activeContracts||0} live</span></div>
    <div class="card-body" style="padding-top:10px">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bd);font-size:13px"><span style="color:var(--sl)">Active</span><strong>${k.activeContracts||0}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px"><span style="color:var(--sl)">Annual Portfolio Value</span><strong>${UI.fmt((k.totalRevenue||0)*12)}</strong></div>
    </div>
  </div>
  <div class="card">
    <div class="card-hd"><div class="card-title">&#128176; Outstanding Invoices</div></div>
    <div class="card-body" style="padding-top:10px">
      <div style="font-family:'Outfit',sans-serif;font-size:32px;font-weight:800;letter-spacing:-1px;color:${(k.outstandingInvoices||0)>5000?'var(--am)':'var(--gn)'}">${UI.fmtk(k.outstandingInvoices||0)}</div>
      <button class="btn bo btn-sm mt12" onclick="Router.navigate('finance')">View Finance &#8594;</button>
    </div>
  </div>
</div>`;
  }

  function siteDrawer(jsonStr) {
    try {
      const s = JSON.parse(jsonStr);
      return `<dl class="dl">
        <dt>Status</dt><dd>${UI.statusPill(s.status||'Active')}</dd>
        <dt>Segment</dt><dd>${s.segment||'&#8212;'}</dd>
        <dt>Avg Audit</dt><dd>${UI.pill(UI.fmtPct(s.avgAudit||0), UI.ragCls(s.avgAudit||0,90,85))}</dd>
        <dt>Open Incidents</dt><dd style="color:${s.openIncidents>0?'var(--rd)':'var(--gn)'}"><strong>${s.openIncidents||0}</strong></dd>
      </dl>
      <button class="btn bp btn-sm" onclick="Router.navigate('quality')">View Quality &#8594;</button>`;
    } catch(e) { return '<p>Error loading details</p>'; }
  }

  return { render, siteDrawer };
})();
