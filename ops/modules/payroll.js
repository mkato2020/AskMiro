// ============================================================
// AskMiro Ops — Payroll Module  v2.0
// Tabs: Entries | Workers | Payroll | Payslips
// Finance-integrated: approved payroll → Finance_Transactions
// ============================================================
window.Payroll = (() => {

  // ── STATE ─────────────────────────────────────────────────────
  const S = {
    entries: [], workers: [], tab: 'entries',
    filter: { month: '', workerId: '', status: '', siteId: '' }
  };

  const ROLES        = ['Cleaner','Supervisor','Team Leader','Driver','Office'];
  const STATUSES     = ['pending','approved','paid'];
  const ENTRY_TYPES  = ['Basic Hours','Overtime x1.5','Overtime x2','Night Shift','Holiday Pay','Training','Other'];
  const PAY_METHODS  = ['BACS','Cash','Cheque'];

  // ── ENTRY POINT ───────────────────────────────────────────────
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

  // ── SHELL ─────────────────────────────────────────────────────
  function _shell(app) {
    const months = [...new Set(S.entries.map(e => (e.date||'').slice(0,7)))]
      .filter(Boolean).sort().reverse();
    const mOpts = months.map(m =>
      `<option value="${m}"${S.filter.month===m?' selected':''}>${_fm(m)}</option>`
    ).join('');
    const wOpts = S.workers.filter(w => w.status !== 'inactive').map(w =>
      `<option value="${w.worker_id}"${S.filter.workerId===w.worker_id?' selected':''}>${_esc(w.name)}</option>`
    ).join('');

    app.innerHTML = `
${UI.secHd('Payroll','Track worker hours, approve payroll and generate payslips')}
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:16px">
  <div style="display:flex;gap:4px">
    ${['entries','workers','payroll','payslips'].map(t =>
      `<button id="lt-${t}" class="btn bo btn-xs" onclick="Payroll._tab('${t}')"
        style="text-transform:capitalize">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`
    ).join('')}
  </div>
  <div class="sp"></div>
  <select class="fin" style="width:138px;padding:5px 10px;font-size:12px" onchange="Payroll._setFilter('month',this.value)">
    <option value="">All Months</option>${mOpts}
  </select>
  <select class="fin" style="width:160px;padding:5px 10px;font-size:12px" onchange="Payroll._setFilter('workerId',this.value)">
    <option value="">All Workers</option>${wOpts}
  </select>
  <button class="btn bo btn-xs" onclick="Payroll._refresh()" title="Refresh">&#8635;</button>
</div>
<div id="lab-body"></div>`;
    _hl(S.tab);
  }

  function _tab(name) { S.tab = name; _hl(name); _renderTab(); }
  function _hl(name) {
    ['entries','workers','payroll','payslips'].forEach(t => {
      const b = document.getElementById('lt-'+t);
      if (!b) return;
      const on = t === name;
      b.style.cssText = on
        ? 'background:var(--brand);color:#fff;border-color:var(--brand);text-transform:capitalize'
        : 'text-transform:capitalize';
    });
  }
  function _setFilter(key, val) { S.filter[key] = val; _renderTab(); }
  async function _refresh() {
    API.invalidate('labour');
    await render();
  }

  function _renderTab() {
    const el = document.getElementById('lab-body');
    if (!el) return;
    if      (S.tab === 'entries')  el.innerHTML = _entries();
    else if (S.tab === 'workers')  el.innerHTML = _workers();
    else if (S.tab === 'payroll')  el.innerHTML = _payroll();
    else if (S.tab === 'payslips') el.innerHTML = _payslips();
  }

  // ── ENTRIES TAB ───────────────────────────────────────────────
  function _entries() {
    const fm = S.filter.month;
    const fw = S.filter.workerId;
    const fs = S.filter.status;
    let rows = fm ? S.entries.filter(e => (e.date||'').slice(0,7)===fm) : [...S.entries];
    if (fw) rows = rows.filter(e => e.worker_id === fw);
    if (fs) rows = rows.filter(e => e.status === fs);
    const sorted = [...rows].sort((a,b) => (b.date||'').localeCompare(a.date||''));

    const totHours = rows.reduce((s,e) => s+_n(e.hours_worked), 0);
    const totPay   = rows.reduce((s,e) => s+_n(e.total_pay), 0);
    const pending  = rows.filter(e => e.status === 'pending').length;

    const stOpts = ['','pending','approved','paid'].map(v =>
      `<option value="${v}"${fs===v?' selected':''}>${v||'All Statuses'}</option>`).join('');

    const eRows = sorted.map(e => {
      const stCls = e.status==='paid'?'pg':e.status==='approved'?'pt':'pa';
      const etColor = e.entry_type==='Overtime x1.5'||e.entry_type==='Overtime x2'?'#7C3AED':e.entry_type==='Night Shift'?'#0369A1':'#0D9488';
      return `<tr>
        <td style="white-space:nowrap;font-size:12px">${e.date||'—'}</td>
        <td style="font-weight:600">${_esc(e.worker_name||'—')}</td>
        <td style="font-size:11px;color:${etColor};font-weight:600">${_esc(e.entry_type||'Basic Hours')}</td>
        <td style="font-size:12px;color:var(--ll)">${_esc(e.site_id||'—')}</td>
        <td style="text-align:right;font-weight:700">${_n(e.hours_worked).toFixed(2)}</td>
        <td style="text-align:right;font-size:12px;color:var(--ll)">${UI.fmt(e.hourly_rate||0)}/h</td>
        <td style="text-align:right;font-weight:700;color:#0D9488">${UI.fmt(e.total_pay||0)}</td>
        <td><span class="pl ${stCls}" style="font-size:10px">${e.status||'—'}</span></td>
        <td style="font-size:11px;color:var(--ll);max-width:100px;overflow:hidden;text-overflow:ellipsis">${_esc(e.notes||'')}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="10" style="padding:0"><div style="padding:8px 0">${_emptyCard({
      icon:'⏱',
      title: fw ? 'No entries for this worker' : fm ? `No payroll entries for ${_fm(fm)}` : 'No payroll entries yet',
      body: 'Log hours worked by each permanent employee. Link entries to sites and contracts to see true labour cost per job.',
      ctas: [{ label:'+ Log Hours', action:'Payroll.openAddEntry()' }],
      hint: 'Tip: Once entries are approved, payroll exports automatically to Finance as a Labour expense.'
    })}</div></td></tr>`;

    return `
<div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
  <select class="fin" style="width:140px;font-size:12px;padding:5px 8px" onchange="Payroll._setFilter('status',this.value)">${stOpts}</select>
  <div class="sp"></div>
  <span style="font-size:12px;color:var(--ll)">
    Hours: <strong>${totHours.toFixed(2)}</strong> &nbsp;
    Gross Pay: <strong style="color:#0D9488">${UI.fmt(totPay)}</strong>
    ${pending ? `&nbsp; <span style="color:#D97706;font-weight:700">${pending} pending</span>` : ''}
  </span>
  <button class="btn bp btn-xs" onclick="Payroll.openAddEntry()">+ Log Hours</button>
  <button class="btn bo btn-xs" onclick="Payroll._exportEntriesCSV()">&#8595; CSV</button>
</div>
<div class="card">
  <div class="card-body" style="padding-top:8px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Worker</th><th>Type</th><th>Site</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">Gross Pay</th><th>Status</th><th>Notes</th></tr></thead>
      <tbody>${eRows}</tbody>
    </table></div>
  </div>
</div>`;
  }

  // ── WORKERS TAB ───────────────────────────────────────────────
  function _workers() {
    const active   = S.workers.filter(w => w.status !== 'inactive');
    const inactive = S.workers.filter(w => w.status === 'inactive');
    const totalPay = S.entries.reduce((s,e) => s+_n(e.total_pay), 0);

    const workerRows = (showInactive = false) => {
      const list = showInactive ? S.workers : active;
      return list.map(w => {
        const wEntries = S.entries.filter(e => e.worker_id === w.worker_id);
        const totalHrs = wEntries.reduce((s,e) => s+_n(e.hours_worked), 0);
        const totalEarned = wEntries.reduce((s,e) => s+_n(e.total_pay), 0);
        return `<tr>
          <td style="font-weight:600">${_esc(w.name||'—')}</td>
          <td style="font-size:12px">${_esc(w.role||'—')}</td>
          <td style="font-size:12px;color:var(--ll)">${w.phone ? `<a href="tel:${_esc(w.phone)}" style="color:inherit">${_esc(w.phone)}</a>` : '—'}</td>
          <td style="font-size:12px;color:var(--ll)">${_esc(w.email||'—')}</td>
          <td style="text-align:right;font-weight:700">${UI.fmt(w.default_hourly_rate||0)}/h</td>
          <td style="text-align:right;font-size:12px;color:var(--ll)">${totalHrs.toFixed(1)}h</td>
          <td style="text-align:right;font-size:12px;color:#0D9488">${UI.fmt(totalEarned)}</td>
          <td>${w.status==='inactive'?'<span class="pl pr" style="font-size:10px">Inactive</span>':'<span class="pl pg" style="font-size:10px">Active</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn bo btn-xs" style="font-size:10px" onclick="Payroll.openEditWorker('${w.worker_id}')">Edit</button>
            <button class="btn bo btn-xs" style="font-size:10px;margin-left:4px" onclick="Payroll._filterWorker('${w.worker_id}')">Entries</button>
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--ll);font-size:13px">No workers yet</td></tr>`;
    };

    return `
<div class="fb" style="margin-bottom:12px;gap:6px">
  <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);flex:1;gap:8px">
    <div class="kpi kpi-g" style="padding:10px 14px"><div class="kpi-label">Active Workers</div><div class="kpi-value" style="font-size:20px">${active.length}</div></div>
    <div class="kpi kpi-g" style="padding:10px 14px"><div class="kpi-label">Total Hours Logged</div><div class="kpi-value" style="font-size:20px">${S.entries.reduce((s,e)=>s+_n(e.hours_worked),0).toFixed(0)}</div></div>
    <div class="kpi kpi-g" style="padding:10px 14px"><div class="kpi-label">Total Labour Cost</div><div class="kpi-value" style="font-size:20px">${UI.fmtk(totalPay)}</div></div>
  </div>
  <button class="btn bp btn-xs" onclick="Payroll.openAddWorker()">+ Add Worker</button>
</div>
<div class="card">
  <div class="card-body" style="padding-top:8px">
    <div class="fb" style="margin-bottom:10px">
      <span style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em">Permanent Employees</span>
      ${inactive.length ? `<span style="font-size:11px;color:var(--ll)">${inactive.length} inactive hidden</span>` : ''}
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th style="text-align:right">Rate</th><th style="text-align:right">Total Hours</th><th style="text-align:right">Total Earned</th><th>Status</th><th></th></tr></thead>
      <tbody>${workerRows()}</tbody>
    </table></div>
  </div>
</div>
${!S.workers.length ? _emptyCard({
  icon:'👥', title:'No payroll workers added yet',
  body:'Add your permanent employees here. Subcontractors and cash-in-hand workers are managed separately in the Cleaners module.',
  ctas:[{ label:'+ Add First Worker', action:'Payroll.openAddWorker()' }],
  hint:'Only PAYE permanent employees should be added to payroll. This data feeds into HMRC reporting.'
}) : ''}`;
  }

  // ── PAYROLL TAB ───────────────────────────────────────────────
  function _payroll() {
    const fm = S.filter.month;
    const fw = S.filter.workerId;
    let rows = fm ? S.entries.filter(e => (e.date||'').slice(0,7)===fm) : [...S.entries];
    if (fw) rows = rows.filter(e => e.worker_id === fw);

    // Group by workerId + period (YYYY-MM)
    const groups = {};
    rows.forEach(e => {
      const period = (e.date||'').slice(0,7);
      if (!period) return;
      const key = `${e.worker_id}||${period}`;
      if (!groups[key]) {
        groups[key] = {
          worker_id: e.worker_id, worker_name: e.worker_name,
          role: e.role, period,
          entries: [], totalHours: 0, grossPay: 0,
          status: 'pending'
        };
      }
      groups[key].entries.push(e);
      groups[key].totalHours += _n(e.hours_worked);
      groups[key].grossPay   += _n(e.total_pay);
    });

    // Determine group status: all approved → approved, any paid → paid
    Object.values(groups).forEach(g => {
      const sts = g.entries.map(e => e.status);
      if (sts.every(s => s === 'paid')) g.status = 'paid';
      else if (sts.every(s => s === 'approved' || s === 'paid')) g.status = 'approved';
      else g.status = 'pending';
    });

    const sorted = Object.values(groups).sort((a,b) =>
      b.period.localeCompare(a.period) || (a.worker_name||'').localeCompare(b.worker_name||'')
    );

    const totGross = sorted.reduce((s,g) => s+g.grossPay, 0);
    const pending  = sorted.filter(g => g.status === 'pending').length;
    const approved = sorted.filter(g => g.status === 'approved').length;

    const pRows = sorted.map(g => {
      const stCls = g.status==='paid'?'pg':g.status==='approved'?'pt':'pa';
      return `<tr>
        <td style="font-size:12px;color:var(--ll)">${_fm(g.period)}</td>
        <td style="font-weight:600">${_esc(g.worker_name||'—')}</td>
        <td style="font-size:12px;color:var(--ll)">${_esc(g.role||'—')}</td>
        <td style="text-align:right;font-weight:700">${g.totalHours.toFixed(2)}</td>
        <td style="text-align:right;font-weight:700;color:#0D9488">${UI.fmt(g.grossPay)}</td>
        <td><span class="pl ${stCls}" style="font-size:10px">${g.status}</span></td>
        <td style="white-space:nowrap">
          ${g.status==='pending'
            ? `<button class="btn bo btn-xs" style="font-size:10px;color:#059669;border-color:#059669"
                onclick="Payroll._approvePayroll('${g.worker_id}','${g.period}','${_esc(g.worker_name||'')}',${g.grossPay.toFixed(2)})">
                &#10003; Approve</button>`
            : g.status==='approved'
            ? `<button class="btn bo btn-xs" style="font-size:10px"
                onclick="Payroll._markPaid('${g.worker_id}','${g.period}')">Mark Paid</button>`
            : '<span style="font-size:11px;color:#059669">&#10003; Paid</span>'}
          <button class="btn bo btn-xs" style="font-size:10px;margin-left:4px"
            onclick="Payroll._openPayslip('${g.worker_id}','${g.period}')">&#128438; Payslip</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" style="padding:0"><div style="padding:8px 0">${_emptyCard({
      icon:'💰',
      title: fm ? `No payroll data for ${_fm(fm)}` : 'No payroll data yet',
      body: 'Payroll is calculated from entries. Log some hours first, then approve them here to export to Finance.',
      ctas:[{ label:'+ Log Hours', action:'Payroll.openAddEntry()' }, { label:'View Entries', action:"Payroll._tab('entries')", style:'bo' }],
      hint:'Approving payroll writes a Labour expense to Finance — feeding directly into your P&L.'
    })}</div></td></tr>`;

    return `
<div style="margin-bottom:12px">
  <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
    <div class="kpi kpi-g" style="padding:10px 14px"><div class="kpi-label">Total Gross Pay</div><div class="kpi-value" style="font-size:18px">${UI.fmtk(totGross)}</div></div>
    <div class="kpi kpi-${pending>0?'a':'g'}" style="padding:10px 14px"><div class="kpi-label">Pending Approval</div><div class="kpi-value" style="font-size:18px">${pending}</div></div>
    <div class="kpi kpi-${approved>0?'t':'g'}" style="padding:10px 14px"><div class="kpi-label">Approved / Unpaid</div><div class="kpi-value" style="font-size:18px">${approved}</div></div>
    <div class="kpi kpi-g" style="padding:10px 14px"><div class="kpi-label">Payroll Groups</div><div class="kpi-value" style="font-size:18px">${sorted.length}</div></div>
  </div>
  ${pending > 0 ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400E;margin-bottom:10px">
    <strong>&#9432; ${pending} payroll group${pending!==1?'s':''} pending approval.</strong> Approve to push labour costs to Finance &amp; P&amp;L.
  </div>` : ''}
</div>
<div class="card">
  <div class="card-body" style="padding-top:8px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Period</th><th>Worker</th><th>Role</th><th style="text-align:right">Total Hours</th><th style="text-align:right">Gross Pay</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${pRows}</tbody>
    </table></div>
  </div>
</div>`;
  }

  // ── PAYSLIPS TAB ──────────────────────────────────────────────
  function _payslips() {
    const fm = S.filter.month;
    const fw = S.filter.workerId;

    // Build same groups as payroll view
    let rows = fm ? S.entries.filter(e => (e.date||'').slice(0,7)===fm) : [...S.entries];
    if (fw) rows = rows.filter(e => e.worker_id === fw);
    const groups = {};
    rows.forEach(e => {
      const period = (e.date||'').slice(0,7);
      if (!period) return;
      const key = `${e.worker_id}||${period}`;
      if (!groups[key]) groups[key] = {
        worker_id: e.worker_id, worker_name: e.worker_name, role: e.role,
        period, entries: [], totalHours: 0, grossPay: 0
      };
      groups[key].entries.push(e);
      groups[key].totalHours += _n(e.hours_worked);
      groups[key].grossPay   += _n(e.total_pay);
    });

    const list = Object.values(groups).sort((a,b) =>
      b.period.localeCompare(a.period) || (a.worker_name||'').localeCompare(b.worker_name||'')
    );

    if (!list.length) return _emptyCard({
      icon:'📑', title:'No payslips yet',
      body:'Payslips are generated from approved payroll entries. Log hours in the Entries tab first.',
      ctas:[
        { label:'+ Log Hours', action:'Payroll.openAddEntry()' },
        { label:'View Payroll', action:"Payroll._tab('payroll')", style:'bo' }
      ],
      hint:'Payslips include: worker name, pay period, total hours, rate and gross pay. Download as branded PDF.'
    });

    const cards = list.map(g => `
<div class="card" style="margin-bottom:10px">
  <div class="card-body" style="padding:14px 18px">
    <div class="fb">
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--txt)">${_esc(g.worker_name||'—')}</div>
        <div style="font-size:12px;color:var(--ll);margin-top:2px">${_esc(g.role||'—')} &middot; ${_fm(g.period)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:800;color:#0D9488">${UI.fmt(g.grossPay)}</div>
        <div style="font-size:11px;color:var(--ll)">${g.totalHours.toFixed(2)} hours</div>
      </div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn bp btn-xs" onclick="Payroll._openPayslip('${g.worker_id}','${g.period}')">
        &#128438; View &amp; Print Payslip
      </button>
    </div>
  </div>
</div>`).join('');

    return `
<div style="margin-bottom:12px">
  <div style="font-size:13px;color:var(--ll);line-height:1.6;padding:10px 14px;background:#f8fafc;border-radius:8px;border:1px solid var(--brd)">
    <strong style="color:var(--txt)">Payslips</strong> are generated from your payroll entry data. Each payslip includes company name, worker details, pay period, hours, rate and gross pay. Click <strong>View &amp; Print</strong> to open the branded document, then save as PDF.
  </div>
</div>
${cards}`;
  }

  // ── PAYSLIP PDF ───────────────────────────────────────────────
  function _openPayslip(workerId, period) {
    const worker  = S.workers.find(w => w.worker_id === workerId) || {};
    const wEntries = S.entries.filter(e => e.worker_id === workerId && (e.date||'').slice(0,7) === period);
    const totalHours = wEntries.reduce((s,e) => s+_n(e.hours_worked), 0);
    const grossPay   = wEntries.reduce((s,e) => s+_n(e.total_pay), 0);
    const workerName = wEntries[0]?.worker_name || worker.name || '—';
    const role       = wEntries[0]?.role || worker.role || '—';
    const generated  = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
    const payRef     = `PAY-${period.replace('-','')}-${workerId.replace(/[^A-Z0-9]/gi,'').slice(0,4).toUpperCase()}`;

    // Build earnings rows by entry type
    const byType = {};
    wEntries.forEach(e => {
      const t = e.entry_type || 'Basic Hours';
      if (!byType[t]) byType[t] = { hours: 0, rate: _n(e.hourly_rate), pay: 0 };
      byType[t].hours += _n(e.hours_worked);
      byType[t].pay   += _n(e.total_pay);
    });
    const earningsRows = Object.entries(byType).map(([type, d]) => `
      <div class="ps-line earn">
        <div class="desc">${_esc(type)}</div>
        <span>${d.hours.toFixed(2)}</span>
        <span>£${d.rate.toFixed(2)}</span>
        <span>£${d.pay.toFixed(2)}</span>
      </div>`).join('');

    _printPayslip({
      payRef, workerName, role,
      address:       worker.address || '',
      niNumber:      worker.ni_number || '',
      taxCode:       worker.tax_code || '1257L',
      paymentMethod: worker.payment_method || 'BACS',
      payrollType:   worker.payroll_type || 'PAYE',
      period, generated,
      totalHours, grossPay, earningsRows
    });
  }

  function _printPayslip({ payRef, workerName, role, address, niNumber, taxCode, paymentMethod, payrollType,
                            period, generated, totalHours, grossPay, earningsRows }) {
    const existing = document.getElementById('lab-print-overlay');
    if (existing) existing.remove();

    if (!document.getElementById('lab-print-styles')) {
      const s = document.createElement('style');
      s.id = 'lab-print-styles';
      s.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        #lab-print-overlay{display:none;position:fixed;inset:0;background:#e8edf2;z-index:99999;overflow-y:auto;padding:40px;font-family:'Inter',system-ui,sans-serif;font-size:12px;color:#1a1f2e}
        #lab-print-overlay *{box-sizing:border-box}

        /* Document shell */
        .ps-doc{max-width:800px;margin:0 auto;background:#fff;border-radius:2px;box-shadow:0 8px 48px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);overflow:hidden}

        /* ── HEADER ── */
        .ps-header{background:#0f172a;position:relative;overflow:hidden}
        .ps-header::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0d9488,#14b8a6,#0d9488)}
        .ps-header-inner{display:flex;align-items:center;justify-content:space-between;padding:22px 32px 20px}
        .ps-brand{display:flex;align-items:center;gap:14px}
        .ps-brand-icon{width:44px;height:44px;background:linear-gradient(135deg,#0d9488,#0f766e);border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(13,148,136,.4)}
        .ps-brand-name{font-size:20px;font-weight:800;color:#fff;letter-spacing:-.3px}
        .ps-brand-legal{font-size:10px;color:rgba(255,255,255,.45);margin-top:2px;letter-spacing:.02em}
        .ps-header-right{text-align:right}
        .ps-doc-title{font-size:22px;font-weight:800;color:#fff;letter-spacing:.05em;text-transform:uppercase}
        .ps-doc-period{font-size:11px;color:rgba(255,255,255,.5);margin-top:3px;letter-spacing:.04em;text-transform:uppercase}
        .ps-confidential{display:inline-block;margin-top:6px;font-size:9px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.12em;text-transform:uppercase;border:1px solid rgba(255,255,255,.15);padding:2px 8px;border-radius:3px}

        /* ── EMPLOYEE IDENTITY BAR ── */
        .ps-identity{display:grid;grid-template-columns:1fr auto;background:#f8fafc;border-bottom:1px solid #e9eef5}
        .ps-identity-left{padding:20px 32px;border-right:1px solid #e9eef5}
        .ps-identity-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:4px}
        .ps-identity-name{font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-.2px}
        .ps-identity-role{font-size:12px;color:#64748b;margin-top:2px}
        .ps-identity-addr{font-size:11px;color:#64748b;line-height:1.7;margin-top:8px}
        .ps-identity-right{padding:20px 32px;display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;align-content:start}
        .ps-meta-item{}
        .ps-meta-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:3px}
        .ps-meta-value{font-size:12px;font-weight:600;color:#0f172a}
        .ps-ref-value{font-size:14px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums;letter-spacing:.02em}

        /* ── PAY DETAILS BAND ── */
        .ps-details-band{display:grid;grid-template-columns:repeat(4,1fr);background:#0f172a;border-top:1px solid #1e293b}
        .ps-detail-cell{padding:12px 20px;border-right:1px solid rgba(255,255,255,.06)}
        .ps-detail-cell:last-child{border-right:none}
        .ps-detail-label{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.35);margin-bottom:4px}
        .ps-detail-value{font-size:12px;font-weight:700;color:#fff}

        /* ── EARNINGS / DEDUCTIONS ── */
        .ps-tables{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e9eef5}
        .ps-table-col{padding:0}
        .ps-table-col:first-child{border-right:1px solid #e9eef5}
        .ps-table-head{display:grid;padding:9px 20px;background:#f1f5f9;border-bottom:1px solid #e9eef5}
        .ps-table-head.earn{grid-template-columns:1fr 50px 58px 62px}
        .ps-table-head.ded{grid-template-columns:1fr 70px}
        .ps-table-head span,.ps-table-head div{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#64748b}
        .ps-table-head span{text-align:right}
        .ps-row{display:grid;padding:8px 20px;border-bottom:1px solid #f8fafc;align-items:center}
        .ps-row.earn{grid-template-columns:1fr 50px 58px 62px}
        .ps-row.ded{grid-template-columns:1fr 70px}
        .ps-row:nth-child(even){background:#fafbfc}
        .ps-row span{text-align:right;font-size:12px;color:#475569;font-variant-numeric:tabular-nums}
        .ps-row .rdesc{font-size:12px;color:#334155;font-weight:500}
        .ps-row .ramt{font-size:12px;font-weight:600;color:#1a1f2e;text-align:right;font-variant-numeric:tabular-nums}
        .ps-totrow{display:grid;padding:10px 20px;background:#f8fafc;border-top:2px solid #0f172a}
        .ps-totrow.earn{grid-template-columns:1fr 50px 58px 62px}
        .ps-totrow.ded{grid-template-columns:1fr 70px}
        .ps-totrow > *{font-size:12px;font-weight:700;color:#0f172a}
        .ps-totrow span{text-align:right;font-variant-numeric:tabular-nums}
        .ps-totrow .tamt{color:#0d9488}
        .ps-totrow .damt{color:#dc2626}
        .ps-est-note{padding:10px 20px 12px;font-size:10px;color:#94a3b8;line-height:1.55;border-top:1px solid #f1f5f9}

        /* ── SUMMARY SECTION ── */
        .ps-summary{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e9eef5}
        .ps-ytd{padding:18px 24px;border-right:1px solid #e9eef5}
        .ps-ytd-title,.ps-breakdown-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f1f5f9}
        .ps-ytd table,.ps-breakdown table{width:100%;border-collapse:collapse;font-size:11px}
        .ps-ytd td,.ps-breakdown td{padding:4px 0;color:#475569;vertical-align:top}
        .ps-ytd td:last-child,.ps-breakdown td:last-child{text-align:right;font-weight:600;color:#1a1f2e;font-variant-numeric:tabular-nums}
        .ps-breakdown{padding:18px 24px}
        .ps-net-row td{font-size:14px;font-weight:800;color:#0d9488!important;padding-top:10px!important;border-top:2px solid #e2faf8}
        .ps-method-row td{font-size:11px;color:#64748b!important;font-weight:400!important;padding-top:8px!important}

        /* ── NET PAY BAR ── */
        .ps-net-bar{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);position:relative;overflow:hidden}
        .ps-net-bar::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#0d9488,#14b8a6)}
        .ps-net-bar-left{}
        .ps-net-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.4);margin-bottom:2px}
        .ps-net-sub{font-size:11px;color:rgba(255,255,255,.35)}
        .ps-net-amount{font-size:32px;font-weight:800;color:#fff;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
        .ps-net-currency{font-size:18px;font-weight:600;vertical-align:super;color:rgba(255,255,255,.6);margin-right:2px}
        .ps-net-badge{background:rgba(13,148,136,.25);border:1px solid rgba(13,148,136,.4);color:#5eead4;font-size:10px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase}

        /* ── FOOTER STRIP ── */
        .ps-footer{display:grid;grid-template-columns:1fr 1fr 1fr;background:#f8fafc;border-top:1px solid #e9eef5}
        .ps-footer-cell{padding:12px 20px;border-right:1px solid #e9eef5}
        .ps-footer-cell:last-child{border-right:none;text-align:right}
        .ps-footer-cell:nth-child(2){text-align:center}
        .ps-footer-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:3px}
        .ps-footer-value{font-size:12px;font-weight:700;color:#1a1f2e}

        /* ── LEGAL FOOTER ── */
        .ps-legal{padding:10px 32px;background:#0f172a;text-align:center}
        .ps-legal p{font-size:9px;color:rgba(255,255,255,.25);line-height:1.6;margin:0}

        @media print{
          body>*:not(#lab-print-overlay){display:none!important}
          #lab-print-overlay{display:block!important;position:static!important;padding:0;background:#fff}
          #lab-print-overlay .no-print{display:none!important}
          .ps-doc{box-shadow:none;border-radius:0}
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        }`;
      document.head.appendChild(s);
    }

    // Tax & NI estimates (basic — for display only)
    const tCode    = taxCode || '1257L';
    const allowance = parseInt(tCode) * 10 || 12570;
    const monthly   = allowance / 12;
    const taxEst    = Math.max(0, (grossPay - monthly/4.33) * 0.20);
    const niEst     = Math.max(0, (grossPay - 242) * 0.12);
    const totalDed  = taxEst + niEst;
    const netPay    = grossPay - totalDed;

    const ytdGross = grossPay;
    const ytdTax   = taxEst;
    const ytdNI    = niEst;

    const addrLines = address
      ? address.split(',').map(l => `<div>${_esc(l.trim())}</div>`).join('')
      : '<div style="color:#94a3b8;font-style:italic">No address on file</div>';

    const overlay = document.createElement('div');
    overlay.id = 'lab-print-overlay';
    overlay.innerHTML = `
<div class="ps-doc">

  <!-- ── HEADER ── -->
  <div class="ps-header">
    <div class="ps-header-inner">
      <div class="ps-brand">
        <div class="ps-brand-icon">
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div>
          <div class="ps-brand-name">AskMiro</div>
          <div class="ps-brand-legal">Miro Partners Ltd &nbsp;·&nbsp; t/a AskMiro Cleaning Services</div>
        </div>
      </div>
      <div class="ps-header-right">
        <div class="ps-doc-title">Payslip</div>
        <div class="ps-doc-period">${_fm(period)}</div>
        <div class="ps-confidential">Private &amp; Confidential</div>
      </div>
    </div>
  </div>

  <!-- ── EMPLOYEE IDENTITY ── -->
  <div class="ps-identity">
    <div class="ps-identity-left">
      <div class="ps-identity-label">Employee</div>
      <div class="ps-identity-name">${_esc(workerName)}</div>
      <div class="ps-identity-role">${_esc(role || 'Staff')}</div>
      <div class="ps-identity-addr">${addrLines}</div>
    </div>
    <div class="ps-identity-right">
      <div class="ps-meta-item">
        <div class="ps-meta-label">Employee Ref</div>
        <div class="ps-ref-value">${payRef}</div>
      </div>
      <div class="ps-meta-item">
        <div class="ps-meta-label">Pay Date</div>
        <div class="ps-meta-value">${generated}</div>
      </div>
      <div class="ps-meta-item">
        <div class="ps-meta-label">Tax Code</div>
        <div class="ps-meta-value">${_esc(tCode)}</div>
      </div>
      <div class="ps-meta-item">
        <div class="ps-meta-label">NI Number</div>
        <div class="ps-meta-value">${niNumber ? _esc(niNumber) : '<span style="color:#94a3b8;font-weight:400">Not on file</span>'}</div>
      </div>
    </div>
  </div>

  <!-- ── PAY DETAILS BAND ── -->
  <div class="ps-details-band">
    <div class="ps-detail-cell">
      <div class="ps-detail-label">Employer</div>
      <div class="ps-detail-value">Miro Partners Ltd</div>
    </div>
    <div class="ps-detail-cell">
      <div class="ps-detail-label">Pay Period</div>
      <div class="ps-detail-value">${_fm(period)}</div>
    </div>
    <div class="ps-detail-cell">
      <div class="ps-detail-label">Pay Type</div>
      <div class="ps-detail-value">${_esc(payrollType||'PAYE')} · Hourly</div>
    </div>
    <div class="ps-detail-cell">
      <div class="ps-detail-label">Payment Method</div>
      <div class="ps-detail-value">${_esc(paymentMethod||'BACS')}</div>
    </div>
  </div>

  <!-- ── EARNINGS / DEDUCTIONS ── -->
  <div class="ps-tables">
    <div class="ps-table-col">
      <div class="ps-table-head earn">
        <div>Earnings</div><span>Hrs</span><span>Rate</span><span>Amount</span>
      </div>
      ${earningsRows}
      <div class="ps-totrow earn">
        <div>Gross Pay</div>
        <span>${totalHours.toFixed(2)}</span>
        <span></span>
        <span class="tamt">£${grossPay.toFixed(2)}</span>
      </div>
    </div>
    <div class="ps-table-col">
      <div class="ps-table-head ded">
        <div>Deductions</div><span>Amount</span>
      </div>
      <div class="ps-row ded">
        <div class="rdesc">Income Tax &nbsp;<span style="font-size:10px;color:#94a3b8">(${_esc(tCode)})</span></div>
        <span class="ramt">${taxEst > 0 ? '£'+taxEst.toFixed(2) : '—'}</span>
      </div>
      <div class="ps-row ded">
        <div class="rdesc">National Insurance &nbsp;<span style="font-size:10px;color:#94a3b8">(Cat A)</span></div>
        <span class="ramt">${niEst > 0 ? '£'+niEst.toFixed(2) : '—'}</span>
      </div>
      <div class="ps-totrow ded">
        <div>Total Deductions</div>
        <span class="damt">£${totalDed.toFixed(2)}</span>
      </div>
      <div class="ps-est-note">&#9432;&nbsp; Tax &amp; NI are indicative estimates. Confirm with your payroll accountant before payment.</div>
    </div>
  </div>

  <!-- ── SUMMARY ── -->
  <div class="ps-summary">
    <div class="ps-ytd">
      <div class="ps-ytd-title">Tax Year to Date — This Employment</div>
      <table>
        <tr><td>Gross Pay</td><td>£${ytdGross.toFixed(2)}</td></tr>
        <tr><td>Taxable Pay</td><td>£${ytdGross.toFixed(2)}</td></tr>
        <tr><td>Income Tax</td><td>£${ytdTax.toFixed(2)}</td></tr>
        <tr><td>Employee NI</td><td>£${ytdNI.toFixed(2)}</td></tr>
        <tr><td>Total Hours</td><td>${totalHours.toFixed(2)} hrs</td></tr>
      </table>
    </div>
    <div class="ps-breakdown">
      <div class="ps-breakdown-title">Pay Breakdown</div>
      <table>
        <tr><td>Gross Earnings</td><td>£${grossPay.toFixed(2)}</td></tr>
        <tr><td>Total Deductions</td><td>£${totalDed.toFixed(2)}</td></tr>
        <tr class="ps-net-row"><td>Net Pay</td><td>£${netPay.toFixed(2)}</td></tr>
        <tr class="ps-method-row"><td>Paid via</td><td>${_esc(paymentMethod||'BACS')}</td></tr>
      </table>
    </div>
  </div>

  <!-- ── NET PAY BAR ── -->
  <div class="ps-net-bar">
    <div class="ps-net-bar-left">
      <div class="ps-net-label">Net Pay This Period</div>
      <div class="ps-net-sub">${_fm(period)} &nbsp;·&nbsp; ${_esc(paymentMethod||'BACS')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      <div class="ps-net-amount"><span class="ps-net-currency">£</span>${netPay.toFixed(2)}</div>
      <div class="ps-net-badge">${_esc(payrollType||'PAYE')}</div>
    </div>
  </div>

  <!-- ── FOOTER STRIP ── -->
  <div class="ps-footer">
    <div class="ps-footer-cell">
      <div class="ps-footer-label">NI Number</div>
      <div class="ps-footer-value">${niNumber ? _esc(niNumber) : '<span style="color:#94a3b8;font-weight:400">Not on file</span>'}</div>
    </div>
    <div class="ps-footer-cell">
      <div class="ps-footer-label">Tax Code</div>
      <div class="ps-footer-value">${_esc(tCode)}</div>
    </div>
    <div class="ps-footer-cell">
      <div class="ps-footer-label">Employer's NI (est.)</div>
      <div class="ps-footer-value">£${(grossPay * 0.138).toFixed(2)}</div>
    </div>
  </div>

  <!-- ── LEGAL FOOTER ── -->
  <div class="ps-legal">
    <p>Miro Partners Ltd &nbsp;·&nbsp; Registered in England &amp; Wales &nbsp;·&nbsp; Trading as AskMiro Cleaning Services &nbsp;·&nbsp; London, UK &nbsp;·&nbsp; info@askmiro.com</p>
    <p style="margin-top:3px">Tax &amp; NI deductions shown are estimates for reference only. This payslip should be retained as a record of pay. Please contact your payroll administrator with any queries.</p>
  </div>

</div>

<div class="no-print" style="text-align:center;margin-top:28px;padding-bottom:56px">
  <button onclick="window.print()" style="background:#0f172a;color:#fff;border:none;padding:13px 36px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:10px;letter-spacing:.02em">&#128438;&nbsp; Save as PDF</button>
  <button onclick="document.getElementById('lab-print-overlay').remove()" style="background:#fff;color:#475569;border:1px solid #e2e8f0;padding:13px 24px;border-radius:8px;font-size:14px;cursor:pointer">&#x2715;&nbsp; Close</button>
</div>`;
    document.body.appendChild(overlay);
    overlay.style.display = 'block';
  }

  // ── ACTIONS ───────────────────────────────────────────────────
  async function _approvePayroll(workerId, period, workerName, grossPay) {
    if (!confirm(`Approve payroll for ${workerName} — ${_fm(period)}?\n\nGross Pay: ${UI.fmt(grossPay)}\n\nThis will mark all entries as Approved and write a Labour expense to Finance.`)) return;
    try {
      await API.post('labour.approvePayroll', { workerId, period, workerName, grossPay });
      UI.toast(`Payroll approved — ${UI.fmt(grossPay)} exported to Finance`, 'g');
      API.invalidate('labour');
      API.invalidate('finance');
      await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  async function _markPaid(workerId, period) {
    try {
      await API.post('labour.markPaid', { workerId, period });
      UI.toast('Marked as paid ✓', 'g');
      API.invalidate('labour');
      S.entries = await API.get('labour.entries', {}, { forceRefresh: true });
      _renderTab();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function _filterWorker(workerId) {
    S.filter.workerId = workerId;
    S.tab = 'entries';
    _shell(document.getElementById('main-content'));
    _renderTab();
  }

  // ── MODALS — ADD ENTRY ────────────────────────────────────────
  function openAddEntry() {
    const today = new Date().toISOString().slice(0,10);
    const wOpts = S.workers.filter(w => w.status !== 'inactive').map(w =>
      `<option value="${w.worker_id}" data-rate="${w.default_hourly_rate||0}">${_esc(w.name)} — ${UI.fmt(w.default_hourly_rate||0)}/h</option>`
    ).join('');
    const etOpts = ENTRY_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

    UI.openModal(`
<div class="modal-hd"><h2>Log Payroll Hours</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Date <span class="req">*</span></label><input class="fin" id="le-date" type="date" value="${today}"></div>
    <div class="fg"><label class="fl">Worker <span class="req">*</span></label>
      <select class="fin" id="le-worker" onchange="Payroll._prefillRate()" ${!wOpts?'disabled':''}>
        <option value="">— Select worker —</option>${wOpts}
      </select>
    </div>
  </div>
  ${!wOpts ? `<div style="padding:8px 0;font-size:12px;color:#D97706">&#9432; No active workers. <a style="color:#0D9488;cursor:pointer" onclick="UI.closeModal();Payroll._tab('workers');Payroll.openAddWorker()">Add a worker first →</a></div>` : ''}
  <div class="fr">
    <div class="fg"><label class="fl">Entry Type <span class="req">*</span></label>
      <select class="fin" id="le-type" onchange="Payroll._applyEntryType()">${etOpts}</select></div>
    <div class="fg"><label class="fl">Hours Worked <span class="req">*</span></label><input class="fin" id="le-hours" type="number" step="0.5" min="0" max="24" placeholder="e.g. 8" oninput="Payroll._calcPay()"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Hourly Rate (£) <span class="req">*</span></label><input class="fin" id="le-rate" type="number" step="0.01" min="0" placeholder="0.00" oninput="Payroll._calcPay()"></div>
  <div class="fr">
    <div class="fg"><label class="fl">Gross Pay (£)</label>
      <input class="fin" id="le-pay" type="number" step="0.01" placeholder="Auto-calculated" style="background:#f8fafc" readonly></div>
    <div class="fg"><label class="fl">Status</label>
      <select class="fin" id="le-status"><option value="pending">Pending</option><option value="approved">Approved</option></select></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Linked Site</label><input class="fin" id="le-site" placeholder="SITE-000001 (optional)"></div>
    <div class="fg"><label class="fl">Linked Contract</label><input class="fin" id="le-cont" placeholder="CON-000001 (optional)"></div>
  </div>
  <div class="fg"><label class="fl">Notes</label><input class="fin" id="le-notes" placeholder="Optional notes"></div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Payroll._saveEntry()">Log Hours</button>
  </div>
</div>`, true);
  }

  function _prefillRate() {
    const sel = document.getElementById('le-worker');
    if (!sel) return;
    const opt = sel.options[sel.selectedIndex];
    const rate = opt ? parseFloat(opt.dataset.rate||0) : 0;
    const rateEl = document.getElementById('le-rate');
    if (rateEl && rate) { rateEl.value = rate.toFixed(2); _calcPay(); }
  }

  function _applyEntryType() {
    const type    = document.getElementById('le-type')?.value || 'Basic Hours';
    const sel     = document.getElementById('le-worker');
    const opt     = sel?.options[sel.selectedIndex];
    const baseRate = opt ? parseFloat(opt.dataset.rate||0) : 0;
    if (!baseRate) return;
    const rateEl = document.getElementById('le-rate');
    if (!rateEl) return;
    const multiplier = type === 'Overtime x1.5' ? 1.5 : type === 'Overtime x2' ? 2 : type === 'Night Shift' ? 1.3 : 1;
    rateEl.value = (baseRate * multiplier).toFixed(2);
    _calcPay();
  }

  function _calcPay() {
    const hours = _n(document.getElementById('le-hours')?.value);
    const rate  = _n(document.getElementById('le-rate')?.value);
    const payEl = document.getElementById('le-pay');
    if (payEl) payEl.value = (hours * rate).toFixed(2);
  }

  async function _saveEntry() {
    if (!UI.rq('le-date') || !UI.rq('le-worker') || !UI.rq('le-hours') || !UI.rq('le-rate')) return;
    const sel = document.getElementById('le-worker');
    const worker = S.workers.find(w => w.worker_id === sel?.value);
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await API.post('labour.createEntry', {
        workerId:    UI.gv('le-worker'),
        workerName:  worker?.name || '',
        role:        worker?.role || '',
        date:        UI.gv('le-date'),
        entryType:   UI.gv('le-type') || 'Basic Hours',
        hoursWorked: UI.gv('le-hours'),
        hourlyRate:  UI.gv('le-rate'),
        totalPay:    UI.gv('le-pay'),
        status:      UI.gv('le-status'),
        siteId:      UI.gv('le-site'),
        contractId:  UI.gv('le-cont'),
        notes:       UI.gv('le-notes')
      });
      UI.closeModal(); UI.toast('Hours logged ✓', 'g');
      await _refresh();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = 'Log Hours'; }
    }
  }

  // ── MODALS — ADD / EDIT WORKER ────────────────────────────────
  function openAddWorker() { _workerModal(); }

  function openEditWorker(workerId) {
    const w = S.workers.find(x => x.worker_id === workerId);
    if (!w) return;
    _workerModal(w);
  }

  // ── ADD WORKER FROM CLEANER (bridge from Cleaners module) ─────
  function openAddWorkerFromCleaner(c) {
    // Pre-fill worker modal from a Permanent cleaner record
    UI.closeDrawer && UI.closeDrawer();
    // Navigate to Payroll page first, then open modal
    if (typeof Router !== 'undefined') {
      Router.navigate('payroll').then(() => {
        setTimeout(() => {
          _workerModal(null, {
            name:              c.fullName || '',
            role:              'Cleaner',
            phone:             c.phone    || '',
            email:             c.email    || '',
            defaultHourlyRate: c.hourlyRate || '',
            payrollType:       'PAYE',
            status:            'active'
          });
        }, 200);
      });
    } else {
      _workerModal(null, {
        name:              c.fullName || '',
        role:              'Cleaner',
        phone:             c.phone    || '',
        email:             c.email    || '',
        defaultHourlyRate: c.hourlyRate || '',
        payrollType:       'PAYE',
        status:            'active'
      });
    }
  }

  function _workerModal(w = null, prefill = null) {
    const editing  = !!w;
    // Merge prefill (from Cleaners) if no existing worker
    const d = w || prefill || {};
    const roleOpts = ROLES.map(r => `<option value="${r}"${(d.role||'Cleaner')===r?' selected':''}>${r}</option>`).join('');
    const pmOpts   = PAY_METHODS.map(m => `<option value="${m}"${(d.payment_method||d.paymentMethod||'BACS')===m?' selected':''}>${m}</option>`).join('');
    UI.openModal(`
<div class="modal-hd"><h2>${editing?'Edit Worker':'Add Payroll Worker'}</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Personal Details</div>
  <div class="fr">
    <div class="fg"><label class="fl">Full Name <span class="req">*</span></label><input class="fin" id="wk-name" value="${_esc(d.name||'')}" placeholder="First and last name"></div>
    <div class="fg"><label class="fl">Role <span class="req">*</span></label><select class="fin" id="wk-role">${roleOpts}</select></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Phone</label><input class="fin" id="wk-phone" value="${_esc(d.phone||'')}" placeholder="07xxx xxxxxx"></div>
    <div class="fg"><label class="fl">Email</label><input class="fin" id="wk-email" value="${_esc(d.email||'')}" placeholder="worker@email.com"></div>
  </div>
  <div class="fg"><label class="fl">Address</label><input class="fin" id="wk-addr" value="${_esc(d.address||'')}" placeholder="e.g. 52 Wallis Close, London, SW11 2BA"></div>
  <div class="fr">
    <div class="fg"><label class="fl">Date of Birth</label><input class="fin" id="wk-dob" type="date" value="${d.date_of_birth||d.dateOfBirth||''}"></div>
    <div class="fg"><label class="fl">Start Date</label><input class="fin" id="wk-start" type="date" value="${d.start_date||d.startDate||''}"></div>
  </div>
  <div style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 10px">Payroll Details</div>
  <div class="fr">
    <div class="fg"><label class="fl">NI Number</label><input class="fin" id="wk-ni" value="${_esc(d.ni_number||d.niNumber||'')}" placeholder="e.g. TK 47 82 28 A" style="font-family:monospace"></div>
    <div class="fg"><label class="fl">Tax Code</label><input class="fin" id="wk-tax" value="${_esc(d.tax_code||d.taxCode||'1257L')}" placeholder="e.g. 1257L" style="font-family:monospace"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Default Hourly Rate (£) <span class="req">*</span></label><input class="fin" id="wk-rate" type="number" step="0.01" value="${d.default_hourly_rate||d.defaultHourlyRate||''}" placeholder="e.g. 15.30"></div>
    <div class="fg"><label class="fl">Payment Method</label><select class="fin" id="wk-pm">${pmOpts}</select></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Status</label>
      <select class="fin" id="wk-status">
        <option value="active"${(!w||d.status==='active')?' selected':''}>Active</option>
        <option value="inactive"${d.status==='inactive'?' selected':''}>Inactive</option>
      </select>
    </div>
    <div class="fg"><label class="fl">Payroll Type</label>
      <select class="fin" id="wk-ptype">
        <option value="PAYE"${(d.payroll_type||d.payrollType||'PAYE')==='PAYE'?' selected':''}>PAYE</option>
        <option value="Self-employed"${(d.payroll_type||d.payrollType)==='Self-employed'?' selected':''}>Self-employed</option>
        <option value="Agency"${(d.payroll_type||d.payrollType)==='Agency'?' selected':''}>Agency</option>
      </select>
    </div>
  </div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Payroll._saveWorker('${w?.worker_id||''}')">${editing?'Save Changes':'Add Worker'}</button>
  </div>
</div>`, true);
  }

  async function _saveWorker(workerId) {
    if (!UI.rq('wk-name') || !UI.rq('wk-rate')) return;
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const action = workerId ? 'labour.updateWorker' : 'labour.createWorker';
      await API.post(action, {
        workerId:          workerId || '',
        name:              UI.gv('wk-name'),
        role:              UI.gv('wk-role'),
        defaultHourlyRate: UI.gv('wk-rate'),
        phone:             UI.gv('wk-phone'),
        email:             UI.gv('wk-email'),
        address:           UI.gv('wk-addr'),
        dateOfBirth:       UI.gv('wk-dob'),
        startDate:         UI.gv('wk-start'),
        niNumber:          UI.gv('wk-ni'),
        taxCode:           UI.gv('wk-tax') || '1257L',
        paymentMethod:     UI.gv('wk-pm')  || 'BACS',
        payrollType:       UI.gv('wk-ptype') || 'PAYE',
        status:            UI.gv('wk-status')
      });
      UI.closeModal(); UI.toast(workerId ? 'Worker updated' : 'Worker added to payroll ✓', 'g');
      await _refresh();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = workerId ? 'Save Changes' : 'Add Worker'; }
    }
  }

  // ── EXPORT ────────────────────────────────────────────────────
  function _exportEntriesCSV() {
    const fm = S.filter.month, fw = S.filter.workerId;
    let rows = fm ? S.entries.filter(e => (e.date||'').slice(0,7)===fm) : [...S.entries];
    if (fw) rows = rows.filter(e => e.worker_id === fw);
    rows = rows.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    const date = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const filters = [fm,fw].filter(Boolean).join(' · ') || 'All Records';
    const meta = [
      ['AskMiro Ltd — Payroll Report','','','','','',''],
      [`Filter: ${filters}`,'','','','','',''],
      [`Generated: ${date}`,'','','','','',''],
      ['','','','','','',''],
      ['Date','Worker','Role','Site','Contract','Hours','Rate (£)','Gross Pay (£)','Status','Notes']
    ];
    const data = rows.map(e => [e.date,e.worker_name,e.role,e.site_id,e.contract_id,e.hours_worked,e.hourly_rate,e.total_pay,e.status,e.notes]);
    const csv = [...meta,...data].map(r => r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `AskMiro_Payroll_${fm||'all'}.csv`;
    a.click();
  }

  // ── HELPERS ───────────────────────────────────────────────────
  function _n(v)   { return parseFloat(v) || 0; }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function _fm(m)  {
    if (!m) return '—';
    const d = new Date(m.length === 7 ? m+'-01' : m);
    return isNaN(d) ? m : d.toLocaleDateString('en-GB', { month:'short', year:'numeric' });
  }
  function _emptyCard({ icon, title, body, ctas = [], hint = '' }) {
    const btns = ctas.map(c => `<button class="btn ${c.style||'bp'} btn-xs" onclick="${c.action}">${c.label}</button>`).join('');
    return `<div style="text-align:center;padding:40px 24px 36px;background:#fafbfc;border-radius:10px;border:1px dashed #e2e8f0">
      <div style="font-size:36px;margin-bottom:12px;line-height:1">${icon}</div>
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:6px">${title}</div>
      <div style="font-size:13px;color:#64748b;max-width:420px;margin:0 auto 18px;line-height:1.6">${body}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${btns}</div>
      ${hint ? `<div style="font-size:11px;color:#94a3b8;margin-top:14px">&#9432; ${hint}</div>` : ''}
    </div>`;
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return {
    render, _tab, _setFilter, _refresh, _hl, _filterWorker,
    _prefillRate, _calcPay, _applyEntryType,
    _approvePayroll, _markPaid,
    _openPayslip,
    openAddEntry, openAddWorker, openEditWorker, openAddWorkerFromCleaner,
    _saveEntry, _saveWorker,
    _exportEntriesCSV
  };
})();
