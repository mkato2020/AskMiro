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

    // ── Web leads alert banner (only shown when there are draft web quotes) ──
    const webLeadCount = parseInt(k.draftWebQuotes || 0);
    const webLeadBanner = webLeadCount > 0 ? `
    <div onclick="Router.navigate('quotes')" style="
      display:flex;align-items:center;gap:14px;
      background:linear-gradient(135deg,#0C1929 0%,#0D2420 100%);
      border:1px solid #0D9488;border-radius:10px;
      padding:14px 18px;margin-bottom:20px;cursor:pointer;
      box-shadow:0 0 0 1px rgba(13,148,136,.2),0 4px 16px rgba(13,148,136,.1);
      transition:box-shadow .2s
    " onmouseover="this.style.boxShadow='0 0 0 2px #0D9488,0 4px 20px rgba(13,148,136,.2)'"
       onmouseout="this.style.boxShadow='0 0 0 1px rgba(13,148,136,.2),0 4px 16px rgba(13,148,136,.1)'">
      <div style="width:40px;height:40px;border-radius:50%;background:#0D9488;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">◈</div>
      <div style="flex:1">
        <div style="font-weight:700;color:#e8f4f3;font-size:14px;margin-bottom:2px">
          ${webLeadCount} web ${webLeadCount === 1 ? 'lead' : 'leads'} awaiting your review
        </div>
        <div style="font-size:12px;color:#6b8fa8">
          Intelligence Engine has pre-priced ${webLeadCount === 1 ? 'this quote' : 'these quotes'} — click to review scenarios and apply pricing
        </div>
      </div>
      <div style="font-size:13px;font-weight:700;color:#0D9488;white-space:nowrap">Review &#8594;</div>
    </div>` : '';

    app.innerHTML = `
${UI.secHd('Overview', 'Executive Dashboard', 'H1 2025')}

${webLeadBanner}

<div class="kpi-grid">
  <div class="kpi kpi-t"><div class="kpi-label">Active Sites</div><div class="kpi-value">${k.activeSites||0}</div><div class="kpi-delta delta-g">&#9650; Portfolio</div></div>
  <div class="kpi kpi-g"><div class="kpi-label">Monthly Revenue</div><div class="kpi-value">${UI.fmtk(k.totalRevenue||0)}</div><div class="kpi-delta delta-g">&#9650; Growing</div></div>
  <div class="kpi kpi-${UI.ragCls(k.portfolioMargin||0,45,35)}"><div class="kpi-label">Portfolio Margin</div><div class="kpi-value">${UI.fmtPct(k.portfolioMargin||0)}</div></div>
  <div class="kpi kpi-${UI.ragCls(k.avgAudit||0,90,85)}"><div class="kpi-label">Avg Audit Score</div><div class="kpi-value">${UI.fmtPct(k.avgAudit||0)}</div></div>
  <div class="kpi kpi-${k.openIncidents>2?'r':k.openIncidents>0?'a':'g'}"><div class="kpi-label">Open Incidents</div><div class="kpi-value" style="color:${k.openIncidents>2?'var(--rd)':k.openIncidents>0?'var(--am)':'var(--gn)'}">${k.openIncidents||0}</div></div>
  <div class="kpi kpi-${webLeadCount>0?'t':'g'}" onclick="Router.navigate('quotes')" style="${webLeadCount>0?'cursor:pointer;border-color:#0D9488':''}" title="Click to review web leads">
    <div class="kpi-label">Web Leads to Quote</div>
    <div class="kpi-value" style="color:${webLeadCount>0?'var(--tl)':'var(--gn)'}">${webLeadCount}</div>
    <div class="kpi-delta" style="color:${webLeadCount>0?'#0D9488':'var(--ll)'}">&#9654; ${webLeadCount>0?'Review now':'All clear'}</div>
  </div>
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
