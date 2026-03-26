// ============================================================
// AskMiro Ops — Labour & Payroll Module  v1.0
// Tabs: Labour Entries | Workers | Payroll | Payslips
// Finance-integrated: approved payroll → Finance_Transactions
// ============================================================
window.Labour = (() => {

  // ── STATE ─────────────────────────────────────────────────────
  const S = {
    entries: [], workers: [], tab: 'entries',
    filter: { month: '', workerId: '', status: '', siteId: '' }
  };

  const ROLES   = ['Cleaner','Supervisor','Team Leader','Driver','Office'];
  const STATUSES = ['pending','approved','paid'];

  // ── ENTRY POINT ───────────────────────────────────────────────
  async function render() {
    const app = document.getElementById('main-content');
    app.innerHTML = `<div style="padding:40px;text-align:center;color:var(--ll)">
      <div class="spinner" style="margin:0 auto 12px"></div>Loading labour data…</div>`;
    try {
      const [entries, workers] = await Promise.all([
        API.get('labour.entries').catch(() => []),
        API.get('labour.workers').catch(() => [])
      ]);
      S.entries = entries || [];
      S.workers = workers || [];
    } catch(e) {
      UI.toast('Labour data unavailable: ' + e.message, 'a');
      S.entries = []; S.workers = [];
    }
    _shell(app);
    _renderTab();
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
${UI.secHd('Labour & Payroll','Track worker hours, approve payroll and generate payslips')}
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:16px">
  <div style="display:flex;gap:4px">
    ${['entries','workers','payroll','payslips'].map(t =>
      `<button id="lt-${t}" class="btn bo btn-xs" onclick="Labour._tab('${t}')"
        style="text-transform:capitalize">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`
    ).join('')}
  </div>
  <div class="sp"></div>
  <select class="fin" style="width:138px;padding:5px 10px;font-size:12px" onchange="Labour._setFilter('month',this.value)">
    <option value="">All Months</option>${mOpts}
  </select>
  <select class="fin" style="width:160px;padding:5px 10px;font-size:12px" onchange="Labour._setFilter('workerId',this.value)">
    <option value="">All Workers</option>${wOpts}
  </select>
  <button class="btn bo btn-xs" onclick="Labour._refresh()" title="Refresh">&#8635;</button>
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

  // ── LABOUR ENTRIES TAB ────────────────────────────────────────
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
      return `<tr>
        <td style="white-space:nowrap;font-size:12px">${e.date||'—'}</td>
        <td style="font-weight:600">${_esc(e.worker_name||'—')}</td>
        <td style="font-size:11px;color:var(--ll)">${_esc(e.role||'—')}</td>
        <td style="font-size:12px;color:var(--ll)">${_esc(e.site_id||'—')}</td>
        <td style="font-size:12px;color:var(--ll)">${_esc(e.contract_id||'—')}</td>
        <td style="text-align:right;font-weight:700">${_n(e.hours_worked).toFixed(2)}</td>
        <td style="text-align:right;font-size:12px;color:var(--ll)">${UI.fmt(e.hourly_rate||0)}/h</td>
        <td style="text-align:right;font-weight:700;color:#0D9488">${UI.fmt(e.total_pay||0)}</td>
        <td><span class="pl ${stCls}" style="font-size:10px">${e.status||'—'}</span></td>
        <td style="font-size:11px;color:var(--ll);max-width:120px;overflow:hidden;text-overflow:ellipsis">${_esc(e.notes||'')}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="10" style="padding:0"><div style="padding:8px 0">${_emptyCard({
      icon:'⏱',
      title: fw ? 'No entries for this worker' : fm ? `No labour entries for ${_fm(fm)}` : 'No labour entries yet',
      body: 'Log hours worked by each cleaner. Link entries to sites and contracts to see true labour cost per job.',
      ctas: [{ label:'+ Log Hours', action:'Labour.openAddEntry()' }],
      hint: 'Tip: Once entries are approved, payroll exports automatically to Finance as a Labour expense.'
    })}</div></td></tr>`;

    return `
<div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
  <select class="fin" style="width:140px;font-size:12px;padding:5px 8px" onchange="Labour._setFilter('status',this.value)">${stOpts}</select>
  <div class="sp"></div>
  <span style="font-size:12px;color:var(--ll)">
    Hours: <strong>${totHours.toFixed(2)}</strong> &nbsp;
    Gross Pay: <strong style="color:#0D9488">${UI.fmt(totPay)}</strong>
    ${pending ? `&nbsp; <span style="color:#D97706;font-weight:700">${pending} pending</span>` : ''}
  </span>
  <button class="btn bp btn-xs" onclick="Labour.openAddEntry()">+ Log Hours</button>
  <button class="btn bo btn-xs" onclick="Labour._exportEntriesCSV()">&#8595; CSV</button>
</div>
<div class="card">
  <div class="card-body" style="padding-top:8px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Worker</th><th>Role</th><th>Site</th><th>Contract</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">Gross Pay</th><th>Status</th><th>Notes</th></tr></thead>
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
            <button class="btn bo btn-xs" style="font-size:10px" onclick="Labour.openEditWorker('${w.worker_id}')">Edit</button>
            <button class="btn bo btn-xs" style="font-size:10px;margin-left:4px" onclick="Labour._filterWorker('${w.worker_id}')">Entries</button>
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
  <button class="btn bp btn-xs" onclick="Labour.openAddWorker()">+ Add Worker</button>
</div>
<div class="card">
  <div class="card-body" style="padding-top:8px">
    <div class="fb" style="margin-bottom:10px">
      <span style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em">Workers</span>
      ${inactive.length ? `<span style="font-size:11px;color:var(--ll)">${inactive.length} inactive hidden</span>` : ''}
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th style="text-align:right">Rate</th><th style="text-align:right">Total Hours</th><th style="text-align:right">Total Earned</th><th>Status</th><th></th></tr></thead>
      <tbody>${workerRows()}</tbody>
    </table></div>
  </div>
</div>
${!S.workers.length ? _emptyCard({
  icon:'👥', title:'No workers added yet',
  body:'Add your cleaners and supervisors here. Set their default hourly rate so it auto-fills when logging hours.',
  ctas:[{ label:'+ Add First Worker', action:'Labour.openAddWorker()' }],
  hint:'Workers are linked to labour entries. This gives you true cost per site and contract.'
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
                onclick="Labour._approvePayroll('${g.worker_id}','${g.period}','${_esc(g.worker_name||'')}',${g.grossPay.toFixed(2)})">
                &#10003; Approve</button>`
            : g.status==='approved'
            ? `<button class="btn bo btn-xs" style="font-size:10px"
                onclick="Labour._markPaid('${g.worker_id}','${g.period}')">Mark Paid</button>`
            : '<span style="font-size:11px;color:#059669">&#10003; Paid</span>'}
          <button class="btn bo btn-xs" style="font-size:10px;margin-left:4px"
            onclick="Labour._openPayslip('${g.worker_id}','${g.period}')">&#128438; Payslip</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" style="padding:0"><div style="padding:8px 0">${_emptyCard({
      icon:'💰',
      title: fm ? `No payroll data for ${_fm(fm)}` : 'No payroll data yet',
      body: 'Payroll is calculated from labour entries. Log some hours first, then approve them here to export to Finance.',
      ctas:[{ label:'+ Log Hours', action:'Labour.openAddEntry()' }, { label:'View Entries', action:"Labour._tab('entries')", style:'bo' }],
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
      body:'Payslips are generated from approved labour entries. Log hours in the Entries tab first.',
      ctas:[
        { label:'+ Log Hours', action:'Labour.openAddEntry()' },
        { label:'View Payroll', action:"Labour._tab('payroll')", style:'bo' }
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
      <button class="btn bp btn-xs" onclick="Labour._openPayslip('${g.worker_id}','${g.period}')">
        &#128438; View &amp; Print Payslip
      </button>
    </div>
  </div>
</div>`).join('');

    return `
<div style="margin-bottom:12px">
  <div style="font-size:13px;color:var(--ll);line-height:1.6;padding:10px 14px;background:#f8fafc;border-radius:8px;border:1px solid var(--brd)">
    <strong style="color:var(--txt)">Payslips</strong> are generated from your labour entry data. Each payslip includes company name, worker details, pay period, hours, rate and gross pay. Click <strong>View &amp; Print</strong> to open the branded document, then save as PDF.
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
    const avgRate    = totalHours > 0 ? grossPay / totalHours : _n(worker.default_hourly_rate);
    const workerName = wEntries[0]?.worker_name || worker.name || '—';
    const role       = wEntries[0]?.role || worker.role || '—';
    const generated  = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
    const payRef     = `PAY-${period.replace('-','')}-${workerId.replace(/[^A-Z0-9]/gi,'').slice(0,4).toUpperCase()}`;

    const entryRows = wEntries.sort((a,b) => (a.date||'').localeCompare(b.date||'')).map(e => `
      <tr>
        <td>${e.date||'—'}</td>
        <td>${_esc(e.site_id||'—')}</td>
        <td style="text-align:right">${_n(e.hours_worked).toFixed(2)}</td>
        <td style="text-align:right">£${_n(e.hourly_rate).toFixed(2)}</td>
        <td style="text-align:right;font-weight:600">£${_n(e.total_pay).toFixed(2)}</td>
      </tr>`).join('');

    _printPayslip({
      payRef, workerName, role, period, generated,
      totalHours, avgRate, grossPay, entryRows,
      phone: worker.phone||'', email: worker.email||''
    });
  }

  function _printPayslip({ payRef, workerName, role, period, generated, totalHours, avgRate, grossPay, entryRows, phone, email }) {
    const existing = document.getElementById('lab-print-overlay');
    if (existing) existing.remove();

    if (!document.getElementById('lab-print-styles')) {
      const s = document.createElement('style');
      s.id = 'lab-print-styles';
      s.textContent = `
        #lab-print-overlay{display:none;position:fixed;inset:0;background:#fff;z-index:99999;overflow-y:auto;padding:32px 40px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1e293b}
        #lab-print-overlay .ps-header{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid #0D9488;margin-bottom:28px}
        #lab-print-overlay .ps-brand{display:flex;align-items:center;gap:10px}
        #lab-print-overlay .ps-logo{width:44px;height:44px;background:#0D9488;border-radius:10px;display:flex;align-items:center;justify-content:center}
        #lab-print-overlay .ps-co-name{font-size:20px;font-weight:800;color:#0D9488}
        #lab-print-overlay .ps-co-name span{color:#0f172a}
        #lab-print-overlay .ps-co-sub{font-size:11px;color:#64748b;margin-top:2px}
        #lab-print-overlay .ps-title{text-align:right}
        #lab-print-overlay .ps-title h2{font-size:22px;font-weight:800;color:#1e293b;margin:0 0 4px}
        #lab-print-overlay .ps-title p{font-size:12px;color:#64748b;margin:0}
        #lab-print-overlay .ps-body{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
        #lab-print-overlay .ps-section{background:#f8fafc;border-radius:10px;padding:16px 18px;border:1px solid #e2e8f0}
        #lab-print-overlay .ps-section h4{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 12px}
        #lab-print-overlay .ps-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
        #lab-print-overlay .ps-row:last-child{border-bottom:none}
        #lab-print-overlay .ps-row.total{font-weight:800;font-size:15px;border-top:2px solid #0D9488;border-bottom:none;padding-top:10px;margin-top:4px;color:#0D9488}
        #lab-print-overlay table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}
        #lab-print-overlay th{background:#f8fafc;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:2px solid #e2e8f0}
        #lab-print-overlay td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
        #lab-print-overlay .ps-notice{background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:12px 14px;font-size:11px;color:#0f766e;margin-bottom:20px}
        #lab-print-overlay .ps-footer{margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
        @media print{
          body > *:not(#lab-print-overlay){display:none!important}
          #lab-print-overlay{display:block!important;position:static!important;padding:20px 28px}
          #lab-print-overlay .no-print{display:none!important}
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        }`;
      document.head.appendChild(s);
    }

    const overlay = document.createElement('div');
    overlay.id = 'lab-print-overlay';
    overlay.innerHTML = `
      <div class="ps-header">
        <div class="ps-brand">
          <div class="ps-logo">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div>
            <div class="ps-co-name"><span>Ask</span>Miro</div>
            <div class="ps-co-sub">AskMiro Cleaning Services Ltd</div>
            <div class="ps-co-sub">info@askmiro.com &middot; askmiro.com</div>
          </div>
        </div>
        <div class="ps-title">
          <h2>Payslip</h2>
          <p>Ref: ${payRef}</p>
          <p>Pay Period: ${_fm(period)}</p>
          <p>Issued: ${generated}</p>
        </div>
      </div>

      <div class="ps-body">
        <div class="ps-section">
          <h4>Employee Details</h4>
          <div class="ps-row"><span>Name</span><strong>${_esc(workerName)}</strong></div>
          <div class="ps-row"><span>Role</span><span>${_esc(role)}</span></div>
          ${phone ? `<div class="ps-row"><span>Phone</span><span>${_esc(phone)}</span></div>` : ''}
          ${email ? `<div class="ps-row"><span>Email</span><span>${_esc(email)}</span></div>` : ''}
        </div>
        <div class="ps-section">
          <h4>Pay Summary</h4>
          <div class="ps-row"><span>Pay Period</span><span>${_fm(period)}</span></div>
          <div class="ps-row"><span>Total Hours</span><strong>${totalHours.toFixed(2)}</strong></div>
          <div class="ps-row"><span>Average Rate</span><span>£${avgRate.toFixed(2)}/hr</span></div>
          <div class="ps-row"><span>Gross Pay</span><strong>£${grossPay.toFixed(2)}</strong></div>
          <div class="ps-row"><span>Deductions (PAYE)</span><span style="color:#94a3b8">N/A — v1</span></div>
          <div class="ps-row total"><span>Net Pay</span><span>£${grossPay.toFixed(2)}</span></div>
        </div>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--ll,#64748b);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Hours Breakdown</div>
      <table>
        <thead><tr><th>Date</th><th>Site</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">Pay</th></tr></thead>
        <tbody>${entryRows}</tbody>
        <tfoot><tr>
          <td colspan="2" style="font-weight:700;text-align:right">Total</td>
          <td style="font-weight:700;text-align:right">${totalHours.toFixed(2)}</td>
          <td></td>
          <td style="font-weight:800;color:#0D9488;text-align:right">£${grossPay.toFixed(2)}</td>
        </tr></tfoot>
      </table>

      <div class="ps-notice">
        &#9432; This payslip is for internal reference only. PAYE tax and National Insurance calculations are not included in this version. Please consult your accountant for official payroll submissions.
      </div>

      <div class="ps-footer">
        <span>AskMiro Cleaning Services Ltd — Confidential. For payee use only.</span>
        <span>Generated ${generated} · askmiro.com</span>
      </div>

      <div class="no-print" style="text-align:center;margin-top:28px;padding-bottom:40px">
        <button onclick="window.print()" style="background:#0D9488;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">&#128438; Save as PDF</button>
        <button onclick="document.getElementById('lab-print-overlay').remove()" style="background:#f1f5f9;color:#475569;border:none;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;margin-left:10px">&#x2715; Close</button>
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

    UI.openModal(`
<div class="modal-hd"><h2>Log Labour Hours</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Date <span class="req">*</span></label><input class="fin" id="le-date" type="date" value="${today}"></div>
    <div class="fg"><label class="fl">Worker <span class="req">*</span></label>
      <select class="fin" id="le-worker" onchange="Labour._prefillRate()" ${!wOpts?'disabled':''}>
        <option value="">— Select worker —</option>${wOpts}
      </select>
    </div>
  </div>
  ${!wOpts ? `<div style="padding:8px 0;font-size:12px;color:#D97706">&#9432; No active workers. <a style="color:#0D9488;cursor:pointer" onclick="UI.closeModal();Labour._tab('workers');Labour.openAddWorker()">Add a worker first →</a></div>` : ''}
  <div class="fr">
    <div class="fg"><label class="fl">Hours Worked <span class="req">*</span></label><input class="fin" id="le-hours" type="number" step="0.5" min="0" max="24" placeholder="e.g. 8" oninput="Labour._calcPay()"></div>
    <div class="fg"><label class="fl">Hourly Rate (£) <span class="req">*</span></label><input class="fin" id="le-rate" type="number" step="0.01" min="0" placeholder="0.00" oninput="Labour._calcPay()"></div>
  </div>
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
    <button class="btn bp" onclick="Labour._saveEntry()">Log Hours</button>
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

  function _workerModal(w = null) {
    const editing = !!w;
    const roleOpts = ROLES.map(r => `<option value="${r}"${w?.role===r?' selected':''}>${r}</option>`).join('');
    UI.openModal(`
<div class="modal-hd"><h2>${editing?'Edit Worker':'Add Worker'}</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Full Name <span class="req">*</span></label><input class="fin" id="wk-name" value="${_esc(w?.name||'')}" placeholder="Worker name"></div>
    <div class="fg"><label class="fl">Role <span class="req">*</span></label>
      <select class="fin" id="wk-role">${roleOpts}</select></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Default Hourly Rate (£) <span class="req">*</span></label><input class="fin" id="wk-rate" type="number" step="0.01" value="${w?.default_hourly_rate||''}" placeholder="e.g. 12.50"></div>
    <div class="fg"><label class="fl">Status</label>
      <select class="fin" id="wk-status">
        <option value="active"${(!w||w.status==='active')?' selected':''}>Active</option>
        <option value="inactive"${w?.status==='inactive'?' selected':''}>Inactive</option>
      </select>
    </div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Phone</label><input class="fin" id="wk-phone" value="${_esc(w?.phone||'')}" placeholder="07xxx xxxxxx"></div>
    <div class="fg"><label class="fl">Email</label><input class="fin" id="wk-email" value="${_esc(w?.email||'')}" placeholder="worker@email.com"></div>
  </div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Labour._saveWorker('${w?.worker_id||''}')">${editing?'Save Changes':'Add Worker'}</button>
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
        status:            UI.gv('wk-status')
      });
      UI.closeModal(); UI.toast(workerId ? 'Worker updated' : 'Worker added ✓', 'g');
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
      ['AskMiro Ltd — Labour & Payroll Report','','','','','',''],
      [`Filter: ${filters}`,'','','','','',''],
      [`Generated: ${date}`,'','','','','',''],
      ['','','','','','',''],
      ['Date','Worker','Role','Site','Contract','Hours','Rate (£)','Gross Pay (£)','Status','Notes']
    ];
    const data = rows.map(e => [e.date,e.worker_name,e.role,e.site_id,e.contract_id,e.hours_worked,e.hourly_rate,e.total_pay,e.status,e.notes]);
    const csv = [...meta,...data].map(r => r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `AskMiro_Labour_${fm||'all'}.csv`;
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
    _prefillRate, _calcPay, _calcPay,
    _approvePayroll, _markPaid,
    _openPayslip,
    openAddEntry, openAddWorker, openEditWorker,
    _saveEntry, _saveWorker,
    _exportEntriesCSV
  };
})();
