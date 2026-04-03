// ============================================================
// AskMiro Ops — modules/dashboard.js
// ============================================================
window.Dashboard = (() => {
  async function render() {
    const osUrl = (window.CFG && window.CFG.OS_URL) || 'https://precious-essence.up.railway.app';
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
