// ============================================================
// AskMiro Ops — Finance Module  v3.0
// Founder Finance Operating System
// Tabs: Overview | Transactions | Invoices | Expenses |
//       Profitability | Assistant
// ============================================================
window.Finance = (() => {

  // ── STATE ─────────────────────────────────────────────────────
  const S = {
    dash: null, txns: [], invoices: [], expenses: [], snaps: [],
    cats: [], settings: {}, tab: 'overview',
    filter: { month:'', type:'', status:'', siteId:'', category:'' },
    chat: []
  };

  const EXPENSE_CATS = [
    'Labour','Subcontractors','Supplies & Consumables','Travel & Transport',
    'Equipment','Admin & Software','Marketing','Insurance',
    'Training & Compliance','One-off Job Costs','Miscellaneous'
  ];
  const INCOME_CATS = ['Contract Revenue','One-off Revenue','Other Income'];
  const TXN_TYPES   = ['income','expense','invoice','payment','credit_note','adjustment'];
  const INV_STATUSES = ['Draft','Issued','Paid','Overdue','Void'];
  const RISK_LABEL  = { healthy:'Healthy', watch:'Watch', risk:'Risk', loss:'Loss', nodata:'No Data' };
  const RISK_CLS    = { healthy:'pg', watch:'pa', risk:'pr', loss:'pr', nodata:'pt' };

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

  function _loading(app) {
    app.innerHTML = `<div style="padding:40px;text-align:center;color:var(--ll)">
      <div class="spinner" style="margin:0 auto 12px"></div>Loading finance data…</div>`;
  }

  // ── SHELL ─────────────────────────────────────────────────────
  function _shell(app) {
    const months = [...new Set([
      ...S.invoices.map(i => (i.invoiceDate||'').slice(0,7)),
      ...S.expenses.map(e => (e.expenseDate||'').slice(0,7)),
      ...S.txns.map(t => (t.transactionDate||'').slice(0,7))
    ])].filter(Boolean).sort().reverse();
    const mOpts = months.map(m =>
      `<option value="${m}"${S.filter.month===m?' selected':''}>${_fm(m)}</option>`
    ).join('');

    app.innerHTML = `
${UI.secHd('Finance','Revenue, Costs & Invoicing')}
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:16px">
  <div style="display:flex;gap:4px">
    ${['overview','transactions','invoices','expenses','profitability','assistant'].map(t =>
      `<button id="ft-${t}" class="btn bo btn-xs" onclick="Finance._tab('${t}')"
        style="text-transform:capitalize">${t==='profitability'?'P&amp;L':t.charAt(0).toUpperCase()+t.slice(1)}</button>`
    ).join('')}
  </div>
  <div class="sp"></div>
  <select class="fin" id="fin-mf" style="width:138px;padding:5px 10px;font-size:12px"
    onchange="Finance._setMonth(this.value)">
    <option value="">All Months</option>${mOpts}
  </select>
  <button class="btn bo btn-xs" onclick="Finance._refresh()" title="Refresh">&#8635;</button>
</div>
<div id="fin-body"></div>`;
    _hl(S.tab);
  }

  function _tab(name) { S.tab = name; _hl(name); _renderTab(); }
  function _hl(name) {
    ['overview','transactions','invoices','expenses','profitability','assistant'].forEach(t => {
      const b = document.getElementById('ft-'+t);
      if (!b) return;
      const on = t === name;
      b.style.cssText = on
        ? 'background:var(--brand);color:#fff;border-color:var(--brand);text-transform:capitalize'
        : 'text-transform:capitalize';
    });
  }
  function _setMonth(m) { S.filter.month = m; _renderTab(); }
  async function _refresh() {
    API.invalidate('finance');
    await render();
  }

  function _renderTab() {
    const el = document.getElementById('fin-body');
    if (!el) return;
    if      (S.tab === 'overview')      el.innerHTML = _overview();
    else if (S.tab === 'transactions')  el.innerHTML = _transactions();
    else if (S.tab === 'invoices')      el.innerHTML = _invoices();
    else if (S.tab === 'expenses')      el.innerHTML = _expenses();
    else if (S.tab === 'profitability') el.innerHTML = _profitability();
    else if (S.tab === 'assistant')     { el.innerHTML = _assistantShell(); _chatScroll(); }
  }

  // ── KPI BAR ───────────────────────────────────────────────────
  function _kpiBar(dash) {
    if (!dash) return '';
    const mom = v => v == null ? '' : `<span style="font-size:11px;color:${v>=0?'#059669':'#DC2626'};margin-left:4px">${v>=0?'↑':'↓'}${Math.abs(v)}%</span>`;
    return `<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
  <div class="kpi kpi-g"><div class="kpi-label">Invoiced Revenue</div><div class="kpi-value">${UI.fmtk(dash.invoicedRevenue)}${mom(dash.revenueMoM)}</div></div>
  <div class="kpi kpi-g"><div class="kpi-label">Cash Received</div><div class="kpi-value">${UI.fmtk(dash.cashIn)}</div></div>
  <div class="kpi kpi-${UI.ragCls(parseFloat(dash.grossMargin),parseFloat(S.settings.targetMarginHealthy||35),parseFloat(S.settings.targetMarginWatch||20))}"><div class="kpi-label">Gross Margin</div><div class="kpi-value">${UI.fmtPct(dash.grossMargin)}</div></div>
  <div class="kpi kpi-a"><div class="kpi-label">Expenses</div><div class="kpi-value">${UI.fmtk(dash.totalExpenses)}${mom(dash.expensesMoM)}</div></div>
  <div class="kpi kpi-${dash.outstandingAmount>0?'a':'g'}"><div class="kpi-label">Outstanding</div><div class="kpi-value">${UI.fmtk(dash.outstandingAmount)}<span style="font-size:11px;color:var(--ll);margin-left:4px">${dash.outstandingCount} inv</span></div></div>
  <div class="kpi kpi-${dash.overdueAmount>0?'r':'g'}"><div class="kpi-label">Overdue</div><div class="kpi-value">${UI.fmtk(dash.overdueAmount)}<span style="font-size:11px;color:var(--ll);margin-left:4px">${dash.overdueCount} inv</span></div></div>
</div>`;
  }

  function _alerts(dash) {
    if (!dash || !dash.alerts || !dash.alerts.length) return '';
    return dash.alerts.map(a =>
      `<div style="padding:10px 14px;border-radius:8px;margin-bottom:8px;font-size:13px;font-weight:600;
        background:${a.level==='r'?'#FEF2F2':'#FFFBEB'};color:${a.level==='r'?'#991B1B':'#92400E'};
        border:1px solid ${a.level==='r'?'#FECACA':'#FDE68A'}">
        ${a.level==='r'?'&#9888;':'&#9432;'} ${_esc(a.msg)}</div>`
    ).join('');
  }

  // ── OVERVIEW TAB ──────────────────────────────────────────────
  function _overview() {
    const d = S.dash;
    const fm = S.filter.month;
    const fInvs = fm ? S.invoices.filter(i => (i.invoiceDate||'').slice(0,7)===fm) : S.invoices;
    const fExps = fm ? S.expenses.filter(e => (e.expenseDate||'').slice(0,7)===fm) : S.expenses;

    const recent5Inv = [...fInvs].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,5);
    const recent5Exp = [...fExps].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,5);
    const today      = new Date().toISOString().slice(0,10);

    const overdueInvs = fInvs.filter(i =>
      (i.status==='Issued'||i.status==='Sent') && i.dueDate && i.dueDate < today
    ).sort((a,b) => a.dueDate.localeCompare(b.dueDate));

    const dueIn30 = fInvs.filter(i => {
      if (i.status==='Paid'||i.status==='Void') return false;
      if (!i.dueDate) return false;
      const days = Math.round((new Date(i.dueDate)-new Date(today))/86400000);
      return days >= 0 && days <= 30;
    });
    const expectedCash = dueIn30.reduce((s,i) => s+_n(i.balanceDue||i.totalAmount), 0);

    // Strongest / weakest from profitability snapshots
    const withData = S.snaps.filter(s => _n(s.invoicedRevenue) > 0);
    const sorted30 = [...withData].sort((a,b) => _n(b.grossMarginPct)-_n(a.grossMarginPct));
    const strongest = sorted30[0];
    const weakest   = sorted30[sorted30.length-1];

    const invRows = recent5Inv.map(i => {
      const overdue = (i.status==='Issued'||i.status==='Sent') && i.dueDate && i.dueDate < today;
      const st = overdue ? 'Overdue' : i.status;
      return `<tr>
        <td style="font-family:monospace;font-size:12px">${i.invoiceNumber||i.id}</td>
        <td>${_esc(i.customerName||'')}</td>
        <td style="font-weight:600">${UI.fmt(i.totalAmount||0)}</td>
        <td>${UI.statusPill(st)}</td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          ${st==='Overdue'||st==='Issued'?`<button class="btn bo btn-xs" style="border-color:#059669;color:#059669;font-size:10px;padding:2px 7px" onclick="Finance.openRecordPayment('${i.id}','${i.balanceDue||i.totalAmount||0}','${i.customerName||''}')">&#10003; Pay</button>`:''}
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" style="padding:0"><div style="padding:20px 16px">${_emptyCard({
      icon:'📄', title:'No invoices yet',
      body:'Create your first invoice to start tracking revenue. Link it to a contract to see profitability per site.',
      ctas:[{ label:'+ Create First Invoice', action:"Finance.openCreateInvoice()" }],
      hint:'Invoices flow through: Draft → Issued → Paid. Each step writes to your transaction ledger.'
    })}</div></td></tr>`;

    const expRows = recent5Exp.map(e =>
      `<tr>
        <td>${e.expenseDate||'—'}</td>
        <td style="font-size:12px">${_esc(e.category||'')}</td>
        <td>${_esc((e.description||'').slice(0,30))}</td>
        <td style="font-weight:600;color:#DC2626">${UI.fmt(e.amountGross||0)}</td>
      </tr>`
    ).join('') || `<tr><td colspan="4" style="padding:0"><div style="padding:20px 16px">${_emptyCard({
      icon:'🧾', title:'No expenses yet',
      body:'Log your costs here. Link expenses to sites and contracts to see where you are making or losing margin.',
      ctas:[{ label:'+ Add First Expense', action:"Finance.openAddExpense()" }],
      hint:'Recurring expenses (insurance, subscriptions) can be auto-generated each month.'
    })}</div></td></tr>`;

    // Overdue action queue
    const overdueBlock = overdueInvs.length ? `
<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;margin-bottom:12px">
  <div class="fb" style="margin-bottom:8px">
    <span style="font-size:12px;font-weight:700;color:#991B1B">&#9888; ${overdueInvs.length} overdue invoice${overdueInvs.length>1?'s':''} — ${UI.fmt(overdueInvs.reduce((s,i)=>s+_n(i.balanceDue||i.totalAmount),0))} outstanding</span>
    <button class="btn btn-xs" style="font-size:10px;background:#DC2626;color:#fff;border:none" onclick="Finance._tab('invoices');Finance._setFilter('status','Overdue')">View all</button>
  </div>
  ${overdueInvs.slice(0,3).map(i => {
    const days = Math.round((new Date(today)-new Date(i.dueDate))/86400000);
    return `<div class="fb" style="font-size:12px;color:#7F1D1D;padding:4px 0;border-top:1px solid #FECACA">
      <span>${_esc(i.customerName||i.invoiceNumber||i.id)} <span style="opacity:.7">${days}d overdue</span></span>
      <span style="font-weight:700">${UI.fmt(i.balanceDue||i.totalAmount||0)}
        <button class="btn bo btn-xs" style="border-color:#DC2626;color:#DC2626;font-size:10px;padding:1px 6px;margin-left:6px" onclick="Finance.openRecordPayment('${i.id}','${i.balanceDue||i.totalAmount||0}','${i.customerName||''}')">Pay</button>
      </span>
    </div>`;
  }).join('')}
</div>` : '';

    // Expected cash + contract insight strip
    const insightStrip = (expectedCash > 0 || strongest) ? `
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:12px">
  ${expectedCash > 0 ? `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 14px">
    <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.06em">Expected Cash (30d)</div>
    <div style="font-size:20px;font-weight:800;color:#166534;margin-top:4px">${UI.fmt(expectedCash)}</div>
    <div style="font-size:11px;color:#4ADE80;margin-top:2px">${dueIn30.length} invoice${dueIn30.length!==1?'s':''} due within 30 days</div>
  </div>` : ''}
  ${strongest ? `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 14px">
    <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.06em">&#9650; Strongest Contract</div>
    <div style="font-size:15px;font-weight:700;color:#166534;margin-top:4px">${_esc(strongest.siteId||'—')}</div>
    <div style="font-size:12px;color:#4ADE80;margin-top:2px">${UI.fmtPct(strongest.grossMarginPct)} margin · ${UI.fmt(strongest.invoicedRevenue)}</div>
  </div>` : ''}
  ${weakest && weakest !== strongest ? `<div style="background:${_n(weakest.grossMarginPct)<0?'#FEF2F2':'#FFFBEB'};border:1px solid ${_n(weakest.grossMarginPct)<0?'#FECACA':'#FDE68A'};border-radius:8px;padding:12px 14px">
    <div style="font-size:11px;font-weight:700;color:${_n(weakest.grossMarginPct)<0?'#991B1B':'#92400E'};text-transform:uppercase;letter-spacing:.06em">&#9660; Weakest Contract</div>
    <div style="font-size:15px;font-weight:700;color:${_n(weakest.grossMarginPct)<0?'#DC2626':'#D97706'};margin-top:4px">${_esc(weakest.siteId||'—')}</div>
    <div style="font-size:12px;color:${_n(weakest.grossMarginPct)<0?'#DC2626':'#D97706'};margin-top:2px">${UI.fmtPct(weakest.grossMarginPct)} margin · ${UI.fmt(weakest.invoicedRevenue)}</div>
  </div>` : ''}
</div>` : '';

    // Full "get started" panel when there's truly no data at all
    const noDataYet = !S.invoices.length && !S.expenses.length && !S.txns.length;
    const getStarted = noDataYet ? `
<div style="background:linear-gradient(135deg,#f0fdfa,#fff);border:1px solid #99f6e4;border-radius:12px;padding:24px 28px;margin-bottom:16px">
  <div style="font-size:15px;font-weight:700;color:#0f766e;margin-bottom:6px">&#128200; Your Finance OS is ready — here's how it works</div>
  <div style="display:flex;gap:0;align-items:flex-start;flex-wrap:wrap;margin-top:16px">
    ${[
      ['1','Create Invoice','Bill a client and link to their contract.','Finance.openCreateInvoice()'],
      ['2','Mark Sent','Change status from Draft → Issued.','Finance._tab(\'invoices\')'],
      ['3','Record Payment','Log cash received → status → Paid.','Finance.openRecordPayment()'],
      ['4','Add Expenses','Log costs linked to sites.','Finance.openAddExpense()'],
      ['5','View P&L','See margin per contract after recalculating.','Finance._tab(\'profitability\')'],
    ].map(([n, title, desc, action], i, arr) => `
      <div style="display:flex;align-items:flex-start;gap:10px;flex:1;min-width:130px;position:relative">
        ${i < arr.length-1 ? `<div style="position:absolute;top:16px;left:26px;right:-10px;height:2px;background:#99f6e4;z-index:0"></div>` : ''}
        <button onclick="${action}" style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:#0D9488;color:#fff;font-size:12px;font-weight:700;border:none;cursor:pointer;position:relative;z-index:1">${n}</button>
        <div style="padding-top:6px">
          <div style="font-size:12px;font-weight:700;color:#0f766e">${title}</div>
          <div style="font-size:11px;color:#64748b;margin-top:1px">${desc}</div>
        </div>
      </div>`).join('')}
  </div>
</div>` : '';

    return `
${_kpiBar(d)}
${_alerts(d)}
${getStarted}
${overdueBlock}
${insightStrip}
<div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
  <button class="btn bp btn-xs" onclick="Finance.openCreateInvoice()">+ Create Invoice</button>
  <button class="btn bo btn-xs" onclick="Finance.openAddExpense()">+ Add Expense</button>
  <button class="btn bo btn-xs" onclick="Finance.openRecordPayment()">&#10003; Record Payment</button>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div class="card">
    <div class="card-body" style="padding-top:12px">
      <div class="fb" style="margin-bottom:10px">
        <span style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em">Recent Invoices</span>
        <button class="btn bo btn-xs" onclick="Finance._tab('invoices')">View all</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Number</th><th>Customer</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>${invRows}</tbody>
      </table></div>
    </div>
  </div>
  <div class="card">
    <div class="card-body" style="padding-top:12px">
      <div class="fb" style="margin-bottom:10px">
        <span style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em">Recent Expenses</span>
        <button class="btn bo btn-xs" onclick="Finance._tab('expenses')">View all</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
        <tbody>${expRows}</tbody>
      </table></div>
    </div>
  </div>
</div>`;
  }

  // ── TRANSACTIONS TAB ──────────────────────────────────────────
  function _transactions() {
    const fm = S.filter.month;
    const ft = S.filter.type;
    const fc = S.filter.category;
    let rows = fm ? S.txns.filter(t => (t.transactionDate||'').slice(0,7)===fm) : S.txns;
    if (ft) rows = rows.filter(t => t.type === ft);
    if (fc) rows = rows.filter(t => t.category === fc);
    const sorted = [...rows].sort((a,b) => (b.transactionDate||'').localeCompare(a.transactionDate||''));

    const totIn  = sorted.filter(t=>t.type==='payment'||t.type==='income').reduce((s,t)=>s+_n(t.amountGross),0);
    const totOut = sorted.filter(t=>t.type==='expense').reduce((s,t)=>s+_n(t.amountGross),0);
    const net    = totIn - totOut;

    const typeOpts = ['','income','expense','invoice','payment','credit_note','adjustment']
      .map(v => `<option value="${v}"${ft===v?' selected':''}>${v||'All Types'}</option>`).join('');
    const catOpts = ['', ...EXPENSE_CATS, ...INCOME_CATS]
      .map(v => `<option value="${v}"${fc===v?' selected':''}>${v||'All Categories'}</option>`).join('');

    const tRows = sorted.map(t => {
      const isIn = t.type==='payment'||t.type==='income';
      const isOut = t.type==='expense';
      const colour = isIn ? '#059669' : isOut ? '#DC2626' : '#475569';
      const prefix = isIn ? '+' : isOut ? '-' : '';
      const voided = t.status === 'void';
      return `<tr style="${voided?'opacity:.45;text-decoration:line-through':''}">
        <td style="white-space:nowrap;font-size:12px">${t.transactionDate||'—'}</td>
        <td>${_typePill(t.type)}</td>
        <td style="font-size:12px">${_esc(t.category||'—')}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(t.description||'—')}</td>
        <td style="font-size:11px;color:var(--ll)">${_esc(t.supplierOrCustomer||'')}</td>
        <td style="text-align:right;font-weight:700;color:${colour}">${prefix}${UI.fmt(t.amountGross||0)}</td>
        <td style="font-size:11px;color:var(--ll)">${_esc(t.externalRef||'')}</td>
        <td>${!voided?`<button class="btn bo btn-xs" style="font-size:10px;padding:2px 6px" onclick="Finance._voidTxn('${t.id}')">Void</button>`:''}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="padding:0"><div style="padding:8px 0">${_emptyCard({
      icon:'📒',
      title:'No transactions yet',
      body:'Transactions are written automatically — every invoice, payment, and expense creates a ledger entry. No manual entry needed.',
      ctas:[
        { label:'+ Create Invoice', action:"Finance.openCreateInvoice()" },
        { label:'+ Add Expense', action:"Finance.openAddExpense()", style:'bo' }
      ],
      hint:'This is your audit trail. Filter by type or category to see exactly where money moved.'
    })}</div></td></tr>`;

    return `
<div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
  <select class="fin" style="width:140px;font-size:12px;padding:5px 8px" onchange="Finance._setFilter('type',this.value)">${typeOpts}</select>
  <select class="fin" style="width:180px;font-size:12px;padding:5px 8px" onchange="Finance._setFilter('category',this.value)">${catOpts}</select>
  <div class="sp"></div>
  <span style="font-size:12px;color:var(--ll)">In: <strong style="color:#059669">${UI.fmt(totIn)}</strong> &nbsp; Out: <strong style="color:#DC2626">${UI.fmt(totOut)}</strong> &nbsp; Net: <strong style="color:${net>=0?'#059669':'#DC2626'}">${UI.fmt(net)}</strong></span>
  <button class="btn bp btn-xs" onclick="Finance.openAddTransaction()">+ Add</button>
  <button class="btn bo btn-xs" onclick="Finance._exportTxnPDF()">&#128438; PDF</button>
  <button class="btn bo btn-xs" onclick="Finance._exportTxnCSV()">&#8595; CSV</button>
</div>
<div class="card">
  <div class="card-body" style="padding-top:8px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Party</th><th style="text-align:right">Amount</th><th>Ref</th><th></th></tr></thead>
      <tbody>${tRows}</tbody>
    </table></div>
  </div>
</div>`;
  }

  // ── INVOICES TAB ──────────────────────────────────────────────
  function _invoices() {
    const fm  = S.filter.month;
    const fs  = S.filter.status;
    const today = new Date().toISOString().slice(0,10);
    let rows  = fm ? S.invoices.filter(i => (i.invoiceDate||'').slice(0,7)===fm) : S.invoices;
    rows = rows.map(i => {
      if ((i.status==='Issued'||i.status==='Sent') && i.dueDate && i.dueDate < today) i = {...i, status:'Overdue'};
      return i;
    });
    if (fs) rows = rows.filter(i => i.status === fs);
    const sorted = [...rows].sort((a,b) => (b.invoiceDate||'').localeCompare(a.invoiceDate||''));

    const statCounts = {};
    INV_STATUSES.forEach(s => { statCounts[s] = S.invoices.filter(i => {
      const st = (i.status==='Issued'||i.status==='Sent') && i.dueDate && i.dueDate < today ? 'Overdue' : i.status;
      return st === s;
    }).length; });

    const statTabs = ['', ...INV_STATUSES].map(s => {
      const cnt = s ? statCounts[s] : S.invoices.length;
      const lbl = s || 'All';
      const on  = fs === s;
      return `<button class="btn btn-xs" onclick="Finance._setFilter('status','${s}')"
        style="border:1px solid ${on?'var(--brand)':'var(--brd)'};background:${on?'var(--brand)':'#fff'};
               color:${on?'#fff':'var(--txt)'}">
        ${lbl} <span style="font-size:10px;opacity:.7">${cnt}</span></button>`;
    }).join('');

    const iRows = sorted.map(i => {
      const aging = (i.status !== 'Paid' && i.dueDate) ? (() => {
        const d = Math.round((new Date(today)-new Date(i.dueDate))/86400000);
        if (d > 0) return `<span style="color:#DC2626;font-size:10px;font-weight:700"> ${d}d over</span>`;
        if (d > -7) return `<span style="color:#D97706;font-size:10px"> due ${-d}d</span>`;
        return `<span style="font-size:10px;color:var(--ll)"> ${-d}d</span>`;
      })() : '';
      const bal = parseFloat(i.balanceDue||i.totalAmount||0);
      return `<tr onclick="Finance._openInvoice('${i.id}')" style="cursor:pointer">
        <td style="font-family:monospace;font-size:12px">${i.invoiceNumber||i.id}</td>
        <td>${_esc(i.customerName||'')}</td>
        <td style="font-size:12px;color:var(--ll)">${_esc(i.siteId||'—')}</td>
        <td>${_fm(i.invoiceDate)}</td>
        <td>${i.dueDate||'—'}${aging}</td>
        <td style="font-weight:700">${UI.fmt(i.totalAmount||0)}</td>
        <td style="color:${bal>0?'#DC2626':'#059669'};font-size:12px">${bal>0?UI.fmt(bal):'Paid'}</td>
        <td>${UI.statusPill(i.status)}</td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          ${i.status==='Draft' ? `<button class="btn bo btn-xs" onclick="Finance._markSent('${i.id}')">Mark Sent</button>` : ''}
          ${i.status!=='Paid'&&i.status!=='Void' ? `<button class="btn bo btn-xs" style="border-color:#059669;color:#059669;margin-left:4px" onclick="Finance.openRecordPayment('${i.id}','${i.balanceDue||i.totalAmount||0}','${i.customerName||''}')">&#10003; Pay</button>` : ''}
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="9" style="padding:0"><div style="padding:8px 0">${_emptyCard({
      icon:'📄',
      title: fs ? `No ${fs.toLowerCase()} invoices` : 'No invoices yet',
      body: fs ? `No invoices with status "${fs}" found. Try a different filter or create a new invoice.`
               : 'Invoices track what you\'ve billed. Create one, link it to a contract, then record payment when cash arrives.',
      ctas: fs
        ? [{ label:'Clear filter', action:"Finance._setFilter('status','')", style:'bo' }, { label:'+ Create Invoice', action:"Finance.openCreateInvoice()" }]
        : [{ label:'+ Create First Invoice', action:"Finance.openCreateInvoice()" }],
      hint: fs ? '' : 'Invoice lifecycle: Draft → Mark Sent → Record Payment → appears in P&L'
    })}</div></td></tr>`;

    const totInvoiced  = sorted.reduce((s,i) => s+_n(i.totalAmount),0);
    const totBalance   = sorted.reduce((s,i) => s+_n(i.balanceDue||i.totalAmount),0);

    return `
<div class="fb" style="margin-bottom:10px;gap:6px;flex-wrap:wrap">
  <div style="display:flex;gap:4px;flex-wrap:wrap">${statTabs}</div>
  <div class="sp"></div>
  <span style="font-size:12px;color:var(--ll)">Total: <strong>${UI.fmt(totInvoiced)}</strong> &nbsp; Balance: <strong style="color:#DC2626">${UI.fmt(totBalance)}</strong></span>
  <button class="btn bp btn-xs" onclick="Finance.openCreateInvoice()">+ Create Invoice</button>
  <button class="btn bo btn-xs" onclick="Finance._exportInvPDF()">&#128438; PDF</button>
  <button class="btn bo btn-xs" onclick="Finance._exportInvCSV()">&#8595; CSV</button>
</div>
<div class="card">
  <div class="card-body" style="padding-top:8px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Number</th><th>Customer</th><th>Site</th><th>Date</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>${iRows}</tbody>
    </table></div>
  </div>
</div>`;
  }

  // ── EXPENSES TAB ──────────────────────────────────────────────
  function _expenses() {
    const fm = S.filter.month;
    const fc = S.filter.category;
    let rows = fm ? S.expenses.filter(e => (e.expenseDate||'').slice(0,7)===fm) : S.expenses;
    if (fc) rows = rows.filter(e => e.category === fc);
    const sorted = [...rows].sort((a,b) => (b.expenseDate||'').localeCompare(a.expenseDate||''));

    const catMap = {};
    rows.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + _n(e.amountGross); });
    const totalExp = rows.reduce((s,e) => s+_n(e.amountGross), 0);

    const catOpts = ['', ...EXPENSE_CATS]
      .map(v => `<option value="${v}"${fc===v?' selected':''}>${v||'All Categories'}</option>`).join('');

    const eRows = sorted.map(e => `<tr>
      <td style="white-space:nowrap;font-size:12px">${e.expenseDate||'—'}</td>
      <td>${_esc(e.category||'—')}</td>
      <td style="font-size:12px;color:var(--ll)">${_esc(e.subcategory||'')}</td>
      <td>${_esc((e.description||'').slice(0,40))}</td>
      <td style="font-size:12px">${_esc(e.supplier||'—')}</td>
      <td style="font-size:11px;color:var(--ll)">${_esc(e.linkedSiteId||'')}</td>
      <td style="text-align:right;font-weight:700;color:#DC2626">${UI.fmt(e.amountGross||0)}</td>
      <td style="font-size:11px">${e.recurringFlag==='Yes'?'<span style="color:#7C3AED;font-size:10px;font-weight:700">&#9654; Recurring</span>':''}</td>
    </tr>`).join('') || `<tr><td colspan="8" style="padding:0"><div style="padding:8px 0">${_emptyCard({
      icon:'🧾',
      title: fc ? `No "${fc}" expenses` : 'No expenses yet',
      body: fc ? `No expenses in this category. Try a different filter or log a new expense.`
               : 'Track all your costs here — labour, supplies, software, insurance. Link to a site to see margin per contract.',
      ctas: fc
        ? [{ label:'Clear filter', action:"Finance._setFilter('category','')", style:'bo' }, { label:'+ Add Expense', action:"Finance.openAddExpense()" }]
        : [{ label:'+ Add First Expense', action:"Finance.openAddExpense()" }],
      hint: fc ? '' : 'Mark fixed costs as Recurring — generate all of them in one click each month.'
    })}</div></td></tr>`;

    const catRows = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([c,v]) =>
      `<tr><td style="font-size:12px">${_esc(c)}</td>
       <td style="text-align:right;font-size:12px;font-weight:600;color:#DC2626">${UI.fmt(v)}</td>
       <td style="font-size:10px;color:var(--ll)">${UI.fmtPct(totalExp>0?v/totalExp*100:0)}</td></tr>`
    ).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--ll);padding:16px;font-size:12px">No data</td></tr>`;

    // ── Recurring panel ─────────────────────────────────────────
    const recurringPanel = _recurringPanel();

    return `
${recurringPanel}
<div class="fb" style="margin-bottom:10px;gap:6px;flex-wrap:wrap">
  <select class="fin" style="width:180px;font-size:12px;padding:5px 8px" onchange="Finance._setFilter('category',this.value)">${catOpts}</select>
  <div class="sp"></div>
  <span style="font-size:12px;color:var(--ll)">Total: <strong style="color:#DC2626">${UI.fmt(totalExp)}</strong></span>
  <button class="btn bp btn-xs" onclick="Finance.openAddExpense()">+ Add Expense</button>
  <button class="btn bo btn-xs" onclick="Finance._exportExpPDF()">&#128438; PDF</button>
  <button class="btn bo btn-xs" onclick="Finance._exportExpCSV()">&#8595; CSV</button>
</div>
<div style="display:grid;grid-template-columns:1fr 240px;gap:16px">
  <div class="card">
    <div class="card-body" style="padding-top:8px">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Category</th><th>Sub</th><th>Description</th><th>Supplier</th><th>Site</th><th style="text-align:right">Amount</th><th></th></tr></thead>
        <tbody>${eRows}</tbody>
      </table></div>
    </div>
  </div>
  <div class="card" style="align-self:start">
    <div class="card-body" style="padding-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">By Category</div>
      <table class="tbl" style="font-size:13px">
        <tbody>${catRows}
          <tr style="border-top:2px solid var(--brd);font-weight:700">
            <td>Total</td>
            <td style="text-align:right;color:#DC2626">${UI.fmt(totalExp)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>`;
  }

  // ── RECURRING EXPENSES PANEL ──────────────────────────────────
  function _recurringPanel() {
    // Deduplicate recurring expenses: keep the most recent entry per (category+description+supplier)
    const templates = [];
    const seen = {};
    const allRec = [...S.expenses].filter(e => e.recurringFlag === 'Yes')
      .sort((a,b) => (b.expenseDate||'').localeCompare(a.expenseDate||''));
    allRec.forEach(e => {
      const key = `${e.category}||${(e.description||'').toLowerCase().trim()}||${(e.supplier||'').toLowerCase().trim()}`;
      if (!seen[key]) { seen[key] = true; templates.push(e); }
    });

    const monthlyTotal = templates.reduce((s,e) => s+_n(e.amountGross), 0);
    const targetMonth = S.filter.month || new Date().toISOString().slice(0,7);

    if (!templates.length) return `
<div class="card" style="margin-bottom:14px;border:1px dashed #e2e8f0;background:#fafafa">
  <div class="card-body" style="padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="font-size:13px;color:var(--ll);flex:1">No recurring expenses set up yet — mark an expense as <strong>Recurring</strong> when adding it (e.g. insurance, subscriptions).</div>
    <button class="btn bp btn-xs" onclick="Finance.openAddExpense()">+ Add Recurring</button>
  </div>
</div>`;

    const tRows = templates.map(e => `
      <tr>
        <td style="font-size:12px;color:var(--ll)">${_esc(e.category||'—')}</td>
        <td>${_esc((e.description||'').slice(0,36))}</td>
        <td style="font-size:12px;color:var(--ll)">${_esc(e.supplier||'—')}</td>
        <td style="text-align:right;font-weight:700;color:#7C3AED">${UI.fmt(e.amountGross||0)}</td>
      </tr>`).join('');

    return `
<div class="card" style="margin-bottom:14px;border-left:3px solid #7C3AED">
  <div class="card-body" style="padding:12px 16px">
    <div class="fb" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
      <div>
        <span style="font-size:12px;font-weight:700;color:var(--txt)">&#9654; Recurring Monthly Expenses</span>
        <span style="font-size:11px;color:var(--ll);margin-left:8px">${templates.length} template${templates.length!==1?'s':''} &middot; <strong style="color:#7C3AED">${UI.fmt(monthlyTotal)}/mo</strong></span>
      </div>
      <div class="sp"></div>
      <button class="btn bo btn-xs" onclick="Finance.openAddExpense()" style="color:#7C3AED;border-color:#7C3AED">+ Add Template</button>
      <button class="btn btn-xs" id="gen-rec-btn"
        style="background:#7C3AED;color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600"
        onclick="Finance._generateRecurring('${targetMonth}')">
        &#9654; Generate for ${_fm(targetMonth)}
      </button>
    </div>
    <div class="tbl-wrap" style="max-height:180px;overflow-y:auto">
      <table class="tbl" style="font-size:13px">
        <thead><tr><th>Category</th><th>Description</th><th>Supplier</th><th style="text-align:right">Monthly (£)</th></tr></thead>
        <tbody>${tRows}</tbody>
      </table>
    </div>
  </div>
</div>`;
  }

  async function _generateRecurring(targetMonth) {
    if (!targetMonth) return;
    const btn = document.getElementById('gen-rec-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    try {
      const res = await API.post('finance.generateRecurring', { targetMonth });
      if (res.generated === 0) {
        UI.toast(`Already generated for ${_fm(targetMonth)} — ${res.skipped} skipped`, 'b');
      } else {
        UI.toast(`Generated ${res.generated} recurring expense${res.generated!==1?'s':''} for ${_fm(targetMonth)}`, 'g');
        await _refresh();
      }
    } catch(e) {
      UI.toast('Error: ' + e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = `▶ Generate for ${_fm(targetMonth)}`; }
    }
  }

  // ── PROFITABILITY TAB ─────────────────────────────────────────
  function _profitability() {
    const fm = S.filter.month;
    const snaps = fm ? S.snaps.filter(s => s.snapshotMonth===fm) : S.snaps;
    const months = [...new Set(S.snaps.map(s=>s.snapshotMonth))].sort().reverse();
    const mOpts2 = months.map(m =>
      `<option value="${m}"${fm===m?' selected':''}>${_fm(m)}</option>`).join('');

    const healthy = parseFloat(S.settings.targetMarginHealthy||35);
    const watch   = parseFloat(S.settings.targetMarginWatch||20);

    const rows = snaps.sort((a,b) => parseFloat(a.grossMarginPct||0)-parseFloat(b.grossMarginPct||0)).map(s => {
      const pct = parseFloat(s.grossMarginPct||0);
      const cls = RISK_CLS[s.riskFlag] || 'pt';
      const lbl = RISK_LABEL[s.riskFlag] || s.riskFlag;
      const barW = Math.min(100, Math.max(0, pct)).toFixed(1);
      return `<tr>
        <td style="font-weight:600">${_esc(s.siteId||'')}</td>
        <td style="font-size:12px;color:var(--ll)">${_fm(s.snapshotMonth)}</td>
        <td style="font-weight:600">${UI.fmt(s.invoicedRevenue||0)}</td>
        <td style="color:#DC2626">${UI.fmt(s.totalCost||0)}</td>
        <td style="font-weight:700;color:${pct<0?'#DC2626':pct<watch?'#DC2626':pct<healthy?'#D97706':'#059669'}">${UI.fmt(s.grossProfit||0)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:6px;border-radius:3px;background:#E5E7EB;overflow:hidden">
              <div style="height:100%;border-radius:3px;background:${pct<0?'#DC2626':pct<watch?'#DC2626':pct<healthy?'#D97706':'#059669'};width:${barW}%"></div>
            </div>
            <span style="font-size:12px;font-weight:700;min-width:40px">${UI.fmtPct(pct)}</span>
          </div>
        </td>
        <td>${UI.pill(lbl, cls)}</td>
        <td style="font-size:11px;color:var(--ll);max-width:200px">${s.recommendation ? `<span title="${_esc(s.recommendation)}">&#9432;</span> ${_esc(s.recommendation.slice(0,50))}${s.recommendation.length>50?'…':''}` : ''}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="padding:0"><div style="padding:8px 0">${_emptyCard({
      icon:'📊',
      title: fm ? `No data for ${_fm(fm)}` : 'No profitability snapshots yet',
      body: fm
        ? `No invoices or expenses are linked to a site for ${_fm(fm)}. Make sure your invoices have a Site ID, then click Recalculate.`
        : 'Profitability is calculated per site. Create invoices with a Site ID, log expenses linked to those sites, then hit Recalculate.',
      ctas: [
        { label:'&#8635; Recalculate Now', action:"Finance._recalc()" },
        { label:'Go to Invoices', action:"Finance._tab('invoices')", style:'bo' },
        { label:'Add Expenses', action:"Finance._tab('expenses')", style:'bo' }
      ],
      hint: 'Healthy ≥ ' + healthy + '% · Watch ' + watch + '–' + (healthy-1) + '% · Risk < ' + watch + '% · Loss < 0%'
    })}</div></td></tr>`;

    const totRevenue   = snaps.reduce((s,r)=>s+_n(r.invoicedRevenue),0);
    const totCost      = snaps.reduce((s,r)=>s+_n(r.totalCost),0);
    const totProfit    = snaps.reduce((s,r)=>s+_n(r.grossProfit),0);
    const portMargin   = totRevenue>0 ? totProfit/totRevenue*100 : 0;
    const riskCount    = snaps.filter(s=>s.riskFlag==='risk'||s.riskFlag==='loss').length;
    const nodataCount  = snaps.filter(s=>s.riskFlag==='nodata').length;

    return `
<div class="fb" style="margin-bottom:10px;gap:6px;flex-wrap:wrap">
  <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);flex:1;gap:8px">
    <div class="kpi kpi-g" style="padding:10px 14px"><div class="kpi-label">Portfolio Revenue</div><div class="kpi-value" style="font-size:18px">${UI.fmtk(totRevenue)}</div></div>
    <div class="kpi kpi-${UI.ragCls(portMargin,healthy,watch)}" style="padding:10px 14px"><div class="kpi-label">Portfolio Margin</div><div class="kpi-value" style="font-size:18px">${UI.fmtPct(portMargin)}</div></div>
    <div class="kpi kpi-${riskCount>0?'r':'g'}" style="padding:10px 14px"><div class="kpi-label">Risk Contracts</div><div class="kpi-value" style="font-size:18px">${riskCount}</div></div>
    <div class="kpi kpi-${nodataCount>0?'a':'g'}" style="padding:10px 14px"><div class="kpi-label">Missing Cost Data</div><div class="kpi-value" style="font-size:18px">${nodataCount}</div></div>
  </div>
</div>
<div class="fb" style="margin-bottom:10px;gap:6px">
  <select class="fin" style="width:140px;font-size:12px;padding:5px 8px" onchange="Finance._setMonth(this.value)">
    <option value="">All Months</option>${mOpts2}
  </select>
  <div class="sp"></div>
  <button class="btn bo btn-xs" onclick="Finance._recalc()" id="recalc-btn">&#8635; Recalculate Snapshots</button>
  <button class="btn bo btn-xs" onclick="Finance._exportSnapPDF()">&#128438; PDF</button>
  <button class="btn bo btn-xs" onclick="Finance._exportSnapCSV()">&#8595; CSV</button>
</div>
<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400E;margin-bottom:12px">
  <strong>&#9432; Thresholds:</strong> Healthy &#8805; ${healthy}% &nbsp;|&nbsp; Watch ${watch}–${healthy-0.01}% &nbsp;|&nbsp; Risk &lt; ${watch}% &nbsp;|&nbsp; Loss &lt; 0%
  &nbsp;&nbsp;<a onclick="Finance._tab('assistant')" style="cursor:pointer;color:#0D9488;text-decoration:underline">Ask Finance Assistant for insights &#8594;</a>
</div>
<div class="card">
  <div class="card-body" style="padding-top:8px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Site</th><th>Month</th><th>Revenue</th><th>Cost</th><th>Gross Profit</th><th>Margin</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>
</div>`;
  }

  // ── ASSISTANT TAB ─────────────────────────────────────────────
  const SUGGESTED = [
    'What is my profit this month?',
    'Which invoices are unpaid?',
    'Which contract is losing money?',
    'What are my biggest expenses?',
    'How much cash is overdue?',
    'What is my gross margin?',
    'Which site has the best margin?',
    'How much have I billed this month?'
  ];

  function _assistantShell() {
    const msgs = S.chat.map(m => _chatBubble(m)).join('');
    const sugg = !S.chat.length ? `
      <div style="padding:0 14px 12px;display:flex;flex-wrap:wrap;gap:6px">
        ${SUGGESTED.map(q => `<button class="am-qr" onclick="Finance._askSuggested('${q.replace(/'/g,'\\\'')}')">${q}</button>`).join('')}
      </div>` : '';

    return `
<style>
.am-msg{max-width:82%;padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.6;word-break:break-word}
.am-bot{background:#f1f5f9;color:#1e293b;align-self:flex-start;border-bottom-left-radius:3px}
.am-user{background:#0D9488;color:#fff;align-self:flex-end;border-bottom-right-radius:3px}
.am-typing{background:#f1f5f9;align-self:flex-start;display:flex;align-items:center;gap:4px;padding:12px 14px;border-radius:12px;border-bottom-left-radius:3px}
.am-dot{width:6px;height:6px;background:#94a3b8;border-radius:50%;animation:am-bounce .9s infinite}
.am-dot:nth-child(2){animation-delay:.15s}
.am-dot:nth-child(3){animation-delay:.3s}
.am-qr{font-size:11px;padding:5px 10px;border-radius:999px;border:1px solid #0D9488;color:#0D9488;background:#f0fdfa;cursor:pointer;transition:background .15s}
.am-qr:hover{background:#ccfbf1}
#fin-chat-send{width:34px;height:34px;border-radius:50%;background:#0D9488;border:none;color:#fff;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background .15s}
#fin-chat-send:hover{background:#0f766e}
#fin-chat-send:disabled{background:#94a3b8;cursor:default}
@keyframes am-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
</style>
<div style="display:flex;gap:16px;height:calc(100vh - 260px);min-height:400px">
  <div style="flex:1;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
    <div style="padding:16px 18px;background:linear-gradient(135deg,#0DBDAD,#0D9488);display:flex;align-items:center;gap:12px">
      <div style="width:34px;height:34px;background:rgba(255,255,255,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none"><path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div>
        <div style="font-weight:700;font-size:14px;color:#fff;line-height:1.2">Finance Assistant</div>
        <div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:1px">Grounded answers from your actual finance data</div>
      </div>
    </div>
    <div id="chat-msgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#fff">
      ${msgs || (() => {
        const invoiceCount  = S.invoices.length;
        const overdueAmt    = S.invoices.filter(i => {
          const t = new Date().toISOString().slice(0,10);
          return (i.status==='Issued'||i.status==='Sent') && i.dueDate && i.dueDate < t;
        }).reduce((s,i)=>s+_n(i.balanceDue||i.totalAmount),0);
        const expenseCount  = S.expenses.length;
        const snapCount     = S.snaps.length;
        const hasData = invoiceCount > 0 || expenseCount > 0;
        const contextLine = hasData
          ? `I can see <strong>${invoiceCount} invoice${invoiceCount!==1?'s':''}</strong>${overdueAmt>0?`, <strong style="color:#DC2626">${UI.fmt(overdueAmt)} overdue</strong>`:''}${expenseCount>0?`, <strong>${expenseCount} expense${expenseCount!==1?'s':''}</strong>`:''}${snapCount>0?`, <strong>${snapCount} profitability snapshot${snapCount!==1?'s':''}</strong>`:''}.`
          : `No finance data yet. Add some invoices and expenses first, then ask me anything.`;
        return `<div style="text-align:center;padding:28px 16px 16px;color:#94a3b8">
          <div style="font-size:28px;margin-bottom:10px">📊</div>
          <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:6px">Finance Assistant</div>
          <div style="font-size:12px;color:#64748b;max-width:380px;margin:0 auto;line-height:1.6">${contextLine}</div>
          ${hasData ? '' : `<div style="margin-top:14px"><button class="btn bp btn-xs" onclick="Finance.openCreateInvoice()">+ Create First Invoice</button></div>`}
        </div>`;
      })()}
    </div>
    ${sugg}
    <div style="padding:10px 14px;border-top:1px solid #e2e8f0;display:flex;align-items:flex-end;gap:8px;background:#fff">
      <textarea id="chat-input" rows="1" placeholder="e.g. What is my margin this month?"
        style="flex:1;resize:none;border:1px solid #e2e8f0;border-radius:20px;padding:8px 14px;font-size:13px;font-family:inherit;outline:none;line-height:1.5;max-height:100px;overflow-y:auto"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();Finance._sendChat();}"
        oninput="document.getElementById('fin-chat-send').disabled=!this.value.trim();this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
      <button id="fin-chat-send" disabled onclick="Finance._sendChat()" aria-label="Send">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  </div>
</div>`;
  }

  function _chatBubble(m) {
    if (m.role === 'user') {
      return `<div class="am-msg am-user">${_esc(m.text)}</div>`;
    }
    if (m.role === 'loading') {
      return `<div class="am-typing" id="chat-loading"><div class="am-dot"></div><div class="am-dot"></div><div class="am-dot"></div></div>`;
    }
    const lines = m.text.split('\n').map(l => `<div>${_esc(l)||'&nbsp;'}</div>`).join('');
    return `<div class="am-msg am-bot">${lines}</div>`;
  }

  function _chatScroll() {
    const el = document.getElementById('chat-msgs');
    if (el) el.scrollTop = el.scrollHeight;
  }

  async function _sendChat() {
    const inp = document.getElementById('chat-input');
    if (!inp || !inp.value.trim()) return;
    const q = inp.value.trim();
    inp.value = '';
    inp.style.height = 'auto';
    const btn = document.getElementById('fin-chat-send');
    if (btn) btn.disabled = true;
    S.chat.push({ role:'user', text:q });
    S.chat.push({ role:'loading' });
    _renderTab();
    try {
      const res = await API.post('finance.assistant', { question: q });
      S.chat = S.chat.filter(m => m.role !== 'loading');
      S.chat.push({ role:'assistant', text: res.answer || 'No response' });
    } catch(e) {
      S.chat = S.chat.filter(m => m.role !== 'loading');
      S.chat.push({ role:'assistant', text: 'Error: ' + e.message });
    }
    _renderTab();
  }

  function _askSuggested(q) {
    S.chat.push({ role:'user', text:q });
    S.chat.push({ role:'loading' });
    _renderTab();
    API.post('finance.assistant', { question: q }).then(res => {
      S.chat = S.chat.filter(m => m.role !== 'loading');
      S.chat.push({ role:'assistant', text: res.answer || 'No response' });
      _renderTab();
    }).catch(e => {
      S.chat = S.chat.filter(m => m.role !== 'loading');
      S.chat.push({ role:'assistant', text: 'Error: ' + e.message });
      _renderTab();
    });
  }

  // ── REPORTS (under profitability) ─────────────────────────────
  function _buildHmrcSummary() {
    const fm = S.filter.month;
    const exps = fm ? S.expenses.filter(e=>(e.expenseDate||'').slice(0,7)===fm) : S.expenses;
    const catMap = {};
    exps.forEach(e => { catMap[e.category]=(catMap[e.category]||0)+_n(e.amountGross); });
    const rows = EXPENSE_CATS.map(c => {
      const v = catMap[c]||0;
      return `<tr><td>${c}</td><td style="text-align:right;font-weight:${v?'600':'400'};color:${v?'#DC2626':'var(--ll)'}">${UI.fmt(v)}</td></tr>`;
    }).join('');
    const tot = exps.reduce((s,e)=>s+_n(e.amountGross),0);
    return rows + `<tr style="border-top:2px solid var(--brd);font-weight:700"><td>Total</td><td style="text-align:right;color:#DC2626">${UI.fmt(tot)}</td></tr>`;
  }

  // ── ACTIONS ───────────────────────────────────────────────────
  async function _recalc() {
    const btn = document.getElementById('recalc-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Recalculating…'; }
    try {
      const month = S.filter.month || new Date().toISOString().slice(0,7);
      const res = await API.post('finance.recalculateSnapshots', { month });
      UI.toast('Recalculated ' + res.count + ' snapshot(s) for ' + month, 'g');
      await _refresh();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = '↺ Recalculate Snapshots'; }
    }
  }

  async function _markSent(id) {
    try {
      await API.post('finance.markInvoiceSent', { id });
      UI.toast('Invoice marked as sent');
      API.invalidate('finance');
      S.invoices = await API.get('finance.invoices', {}, { forceRefresh: true });
      _renderTab();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  async function _voidTxn(id) {
    if (!confirm('Void this transaction? This cannot be undone.')) return;
    try {
      await API.post('finance.voidTransaction', { id });
      UI.toast('Transaction voided');
      API.invalidate('finance');
      S.txns = await API.get('finance.transactions', {}, { forceRefresh: true });
      _renderTab();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function _openInvoice(id) {
    const i = S.invoices.find(x => x.id === id);
    if (!i) return;
    const today = new Date().toISOString().slice(0,10);
    const overdue = (i.status==='Issued'||i.status==='Sent') && i.dueDate && i.dueDate < today;
    const st = overdue ? 'Overdue' : i.status;
    const bal = parseFloat(i.balanceDue||i.totalAmount||0);
    UI.openModal(`
<div class="modal-hd"><h2>Invoice ${_esc(i.invoiceNumber||i.id)}</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <table style="width:100%;font-size:13px;margin-bottom:16px">
    <tr><td style="color:var(--ll);width:120px">Customer</td><td style="font-weight:600">${_esc(i.customerName||'')}</td></tr>
    <tr><td style="color:var(--ll)">Site</td><td>${_esc(i.siteId||'—')}</td></tr>
    <tr><td style="color:var(--ll)">Invoice Date</td><td>${i.invoiceDate||'—'}</td></tr>
    <tr><td style="color:var(--ll)">Due Date</td><td>${i.dueDate||'—'}</td></tr>
    <tr><td style="color:var(--ll)">Total</td><td style="font-weight:700;font-size:15px">${UI.fmt(i.totalAmount||0)}</td></tr>
    <tr><td style="color:var(--ll)">Balance Due</td><td style="font-weight:700;color:${bal>0?'#DC2626':'#059669'}">${bal>0?UI.fmt(bal):'Paid in full'}</td></tr>
    <tr><td style="color:var(--ll)">Status</td><td>${UI.statusPill(st)}</td></tr>
    ${i.notes ? `<tr><td style="color:var(--ll)">Notes</td><td>${_esc(i.notes)}</td></tr>` : ''}
  </table>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Close</button>
    <button class="btn bo" style="border-color:#0D9488;color:#0D9488" onclick="Finance.previewInvoicePdf('${id}')">&#128196; View PDF</button>
    ${st==='Draft'?`<button class="btn bo" onclick="UI.closeModal();Finance._markSent('${id}')">Mark Sent</button>`:''}
    ${st!=='Paid'&&st!=='Void'?`<button class="btn bp" style="background:#059669" onclick="UI.closeModal();Finance.openRecordPayment('${id}','${bal}','${_esc(i.customerName||'')}')">&#10003; Record Payment</button>`:''}
  </div>
</div>`, false);
  }

  // ── MODALS ────────────────────────────────────────────────────
  function openCreateInvoice() {
    const today = new Date().toISOString().slice(0,10);
    const due30 = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    const vatR  = parseFloat(S.settings.vatRate||20);
    UI.openModal(`
<div class="modal-hd"><h2>Create Invoice</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Customer / Company <span class="req">*</span></label><input class="fin" id="ci-cust" placeholder="Company name"></div>
    <div class="fg"><label class="fl">Site ID</label><input class="fin" id="ci-site" placeholder="SITE-000001"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Contract ID</label><input class="fin" id="ci-cont" placeholder="CON-000001"></div>
    <div class="fg"><label class="fl">Payment Terms (days)</label><input class="fin" id="ci-terms" type="number" value="${S.settings.defaultPaymentTerms||30}"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Invoice Date <span class="req">*</span></label><input class="fin" id="ci-date" type="date" value="${today}"></div>
    <div class="fg"><label class="fl">Due Date <span class="req">*</span></label><input class="fin" id="ci-due" type="date" value="${due30}"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Billing Period From</label><input class="fin" id="ci-pfrom" type="date"></div>
    <div class="fg"><label class="fl">Billing Period To</label><input class="fin" id="ci-pto" type="date"></div>
  </div>
  <div style="background:#F8FAFC;border:1px solid var(--brd);border-radius:8px;padding:12px;margin-bottom:14px">
    <div style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;margin-bottom:10px">Line Items</div>
    <div id="ci-lines">
      <div class="fr" style="margin-bottom:6px">
        <div class="fg" style="flex:3"><input class="fin" style="font-size:12px" placeholder="Description" data-line="desc"></div>
        <div class="fg" style="flex:1"><input class="fin" type="number" step="0.01" style="font-size:12px" placeholder="£ Net" data-line="net" oninput="Finance._calcLineTotal(this)"></div>
        <button type="button" onclick="this.closest('.fr').remove();Finance._calcInvTotal()" style="padding:0 8px;background:none;border:none;color:var(--ll);cursor:pointer;font-size:16px">&#x2715;</button>
      </div>
    </div>
    <button class="btn bo btn-xs" type="button" onclick="Finance._addInvLine()">+ Add Line</button>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Subtotal (Net)</label><input class="fin" id="ci-net" type="number" step="0.01" placeholder="0.00" oninput="Finance._calcFromNet()" readonly style="background:#F8FAFC"></div>
    <div class="fg"><label class="fl">VAT (${vatR}%)</label><input class="fin" id="ci-vat" type="number" step="0.01" placeholder="0.00" readonly style="background:#F8FAFC"></div>
    <div class="fg"><label class="fl">Total (Gross) <span class="req">*</span></label><input class="fin" id="ci-total" type="number" step="0.01" placeholder="0.00" oninput="Finance._calcFromGross()"></div>
  </div>
  <div class="fg"><label class="fl">Notes</label><textarea class="fin" id="ci-notes" rows="2" placeholder="Payment instructions, references…"></textarea></div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Finance._saveInvoice()">Create Invoice</button>
  </div>
</div>`, true);
  }

  function _addInvLine() {
    const c = document.getElementById('ci-lines');
    if (!c) return;
    const d = document.createElement('div');
    d.className = 'fr';
    d.style.marginBottom = '6px';
    d.innerHTML = `<div class="fg" style="flex:3"><input class="fin" style="font-size:12px" placeholder="Description" data-line="desc"></div>
      <div class="fg" style="flex:1"><input class="fin" type="number" step="0.01" style="font-size:12px" placeholder="£ Net" data-line="net" oninput="Finance._calcLineTotal(this)"></div>
      <button type="button" onclick="this.closest('.fr').remove();Finance._calcInvTotal()" style="padding:0 8px;background:none;border:none;color:var(--ll);cursor:pointer;font-size:16px">&#x2715;</button>`;
    c.appendChild(d);
  }

  function _calcLineTotal(inp) { _calcInvTotal(); }

  function _calcInvTotal() {
    const lines = document.querySelectorAll('[data-line="net"]');
    const net = [...lines].reduce((s,i) => s+(_n(i.value)), 0);
    const vatR = parseFloat(S.settings.vatRate||20)/100;
    const vat  = net * vatR;
    const tot  = net + vat;
    const netEl  = document.getElementById('ci-net');
    const vatEl  = document.getElementById('ci-vat');
    const totEl  = document.getElementById('ci-total');
    if (netEl) netEl.value = net.toFixed(2);
    if (vatEl) vatEl.value = vat.toFixed(2);
    if (totEl) totEl.value = tot.toFixed(2);
  }

  function _calcFromGross() {
    const gross = _n(document.getElementById('ci-total')?.value);
    const vatR  = parseFloat(S.settings.vatRate||20)/100;
    const net   = gross / (1 + vatR);
    const vat   = gross - net;
    const netEl = document.getElementById('ci-net');
    const vatEl = document.getElementById('ci-vat');
    if (netEl) netEl.value = net.toFixed(2);
    if (vatEl) vatEl.value = vat.toFixed(2);
  }

  async function _saveInvoice() {
    if (!UI.rq('ci-cust') || !UI.rq('ci-date') || !UI.rq('ci-due') || !UI.rq('ci-total')) return;
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
      const lineEls   = [...document.querySelectorAll('#ci-lines .fr')];
      const lineItems = lineEls.map(row => ({
        description: row.querySelector('[data-line="desc"]')?.value||'',
        amountNet: _n(row.querySelector('[data-line="net"]')?.value)
      })).filter(l => l.description || l.amountNet);

      await API.post('finance.createInvoice', {
        customerName: UI.gv('ci-cust'), siteId: UI.gv('ci-site'),
        contractId:   UI.gv('ci-cont'), invoiceDate: UI.gv('ci-date'),
        dueDate:      UI.gv('ci-due'), billingPeriodFrom: UI.gv('ci-pfrom'),
        billingPeriodTo: UI.gv('ci-pto'),
        subtotal:     UI.gv('ci-net'), vatAmount: UI.gv('ci-vat'),
        totalAmount:  UI.gv('ci-total'), notes: UI.gv('ci-notes'),
        lineItemsJson: JSON.stringify(lineItems),
        paymentTerms: UI.gv('ci-terms')
      });
      UI.closeModal(); UI.toast('Invoice created', 'g');
      await _refresh();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = 'Create Invoice'; }
    }
  }

  function openRecordPayment(invoiceId, amount, customer) {
    const today = new Date().toISOString().slice(0,10);
    // If no invoiceId, show invoice picker
    const unpaid = S.invoices.filter(i => i.status!=='Paid'&&i.status!=='Void'&&i.status!=='Draft');
    const invOpts = unpaid.map(i =>
      `<option value="${i.id}"${i.id===invoiceId?' selected':''}>${i.invoiceNumber||i.id} — ${i.customerName||''} (${UI.fmt(i.balanceDue||i.totalAmount||0)})</option>`
    ).join('');
    UI.openModal(`
<div class="modal-hd"><h2>Record Payment</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fg"><label class="fl">Invoice <span class="req">*</span></label>
    <select class="fin" id="rp-inv">${invOpts||'<option value="">No outstanding invoices</option>'}</select></div>
  <div class="fr">
    <div class="fg"><label class="fl">Amount Received (£) <span class="req">*</span></label><input class="fin" id="rp-amt" type="number" step="0.01" value="${amount||''}"></div>
    <div class="fg"><label class="fl">Date Received <span class="req">*</span></label><input class="fin" id="rp-date" type="date" value="${today}"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Payment Method</label>
      <select class="fin" id="rp-method">
        <option>BACS</option><option>Cheque</option><option>Card</option><option>Cash</option><option>Other</option>
      </select>
    </div>
    <div class="fg"><label class="fl">Reference</label><input class="fin" id="rp-ref" placeholder="e.g. BACS ref 12345"></div>
  </div>
  <div class="fg"><label class="fl">Notes</label><input class="fin" id="rp-notes" placeholder="Optional"></div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" style="background:#059669" onclick="Finance._savePayment()">&#10003; Record Payment</button>
  </div>
</div>`);
  }

  async function _savePayment() {
    if (!UI.rq('rp-inv') || !UI.rq('rp-amt') || !UI.rq('rp-date')) return;
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await API.post('finance.recordPayment', {
        invoiceId: UI.gv('rp-inv'), amountGross: UI.gv('rp-amt'),
        transactionDate: UI.gv('rp-date'), paymentMethod: UI.gv('rp-method'),
        reference: UI.gv('rp-ref'), notes: UI.gv('rp-notes')
      });
      UI.closeModal(); UI.toast('Payment recorded ✓', 'g');
      await _refresh();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = '✓ Record Payment'; }
    }
  }

  function openAddExpense() {
    const today = new Date().toISOString().slice(0,10);
    const catOpts = EXPENSE_CATS.map(c => `<option value="${c}">${c}</option>`).join('');
    UI.openModal(`
<div class="modal-hd"><h2>Add Expense</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Date <span class="req">*</span></label><input class="fin" id="ae-date" type="date" value="${today}"></div>
    <div class="fg"><label class="fl">Category <span class="req">*</span></label>
      <select class="fin" id="ae-cat">${catOpts}</select></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Amount (£ Gross, inc VAT) <span class="req">*</span></label>
      <input class="fin" id="ae-gross" type="number" step="0.01" min="0" placeholder="0.00"></div>
    <div class="fg"><label class="fl">Supplier</label><input class="fin" id="ae-sup" placeholder="Supplier name"></div>
  </div>
  <div class="fg"><label class="fl">Description <span class="req">*</span></label><input class="fin" id="ae-desc" placeholder="What was this expense for?"></div>
  <div class="fr">
    <div class="fg"><label class="fl">Linked Site</label><input class="fin" id="ae-site" placeholder="SITE-000001 (optional)"></div>
    <div class="fg"><label class="fl">Linked Contract</label><input class="fin" id="ae-cont" placeholder="CON-000001 (optional)"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Receipt Ref</label><input class="fin" id="ae-ref" placeholder="Receipt or invoice number"></div>
    <div class="fg"><label class="fl">Recurring?</label>
      <select class="fin" id="ae-rec"><option value="No">No</option><option value="Yes">Yes — Monthly</option></select></div>
  </div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Finance._saveExpense()">Add Expense</button>
  </div>
</div>`);
  }

  async function _saveExpense() {
    if (!UI.rq('ae-date') || !UI.rq('ae-cat') || !UI.rq('ae-gross') || !UI.rq('ae-desc')) return;
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await API.post('finance.createExpense', {
        expenseDate: UI.gv('ae-date'), category: UI.gv('ae-cat'),
        amountGross: UI.gv('ae-gross'), supplier: UI.gv('ae-sup'),
        description: UI.gv('ae-desc'), linkedSiteId: UI.gv('ae-site'),
        linkedContractId: UI.gv('ae-cont'), receiptRef: UI.gv('ae-ref'),
        recurringFlag: UI.gv('ae-rec')
      });
      UI.closeModal(); UI.toast('Expense added', 'g');
      await _refresh();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = 'Add Expense'; }
    }
  }

  function openAddTransaction() {
    const today = new Date().toISOString().slice(0,10);
    const typeOpts = TXN_TYPES.map(t => `<option value="${t}">${t.charAt(0).toUpperCase()+t.slice(1).replace('_',' ')}</option>`).join('');
    const catOpts  = ['', ...EXPENSE_CATS, ...INCOME_CATS].map(c => `<option value="${c}">${c||'— Select category —'}</option>`).join('');
    UI.openModal(`
<div class="modal-hd"><h2>Add Transaction</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Type <span class="req">*</span></label><select class="fin" id="at-type">${typeOpts}</select></div>
    <div class="fg"><label class="fl">Date <span class="req">*</span></label><input class="fin" id="at-date" type="date" value="${today}"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Category <span class="req">*</span></label><select class="fin" id="at-cat">${catOpts}</select></div>
    <div class="fg"><label class="fl">Amount (£ Gross) <span class="req">*</span></label><input class="fin" id="at-gross" type="number" step="0.01"></div>
  </div>
  <div class="fg"><label class="fl">Description <span class="req">*</span></label><input class="fin" id="at-desc" placeholder="What is this transaction?"></div>
  <div class="fr">
    <div class="fg"><label class="fl">Party (Supplier / Customer)</label><input class="fin" id="at-party" placeholder="Name"></div>
    <div class="fg"><label class="fl">Reference</label><input class="fin" id="at-ref" placeholder="External ref"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Linked Site</label><input class="fin" id="at-site" placeholder="SITE-000001"></div>
    <div class="fg"><label class="fl">Notes</label><input class="fin" id="at-notes"></div>
  </div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Finance._saveTransaction()">Add Transaction</button>
  </div>
</div>`);
  }

  async function _saveTransaction() {
    if (!UI.rq('at-date') || !UI.rq('at-cat') || !UI.rq('at-gross') || !UI.rq('at-desc')) return;
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await API.post('finance.createTransaction', {
        transactionDate: UI.gv('at-date'), type: UI.gv('at-type'),
        category: UI.gv('at-cat'), amountGross: UI.gv('at-gross'),
        description: UI.gv('at-desc'), supplierOrCustomer: UI.gv('at-party'),
        externalRef: UI.gv('at-ref'), linkedSiteId: UI.gv('at-site'),
        notes: UI.gv('at-notes')
      });
      UI.closeModal(); UI.toast('Transaction added', 'g');
      await _refresh();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = 'Add Transaction'; }
    }
  }

  function openSetupSheets() {
    if (!confirm('Set up Finance sheets in Google Sheets? This will create: Finance_Transactions, Finance_Invoices, Finance_Expenses, Finance_Snapshots, Finance_Settings, Finance_Categories.')) return;
    API.post('finance.setupSheets', {})
      .then(r => { UI.toast('Finance sheets created: ' + (r.created||[]).join(', ') || 'Already exist', 'g'); })
      .catch(e => UI.toast(e.message, 'r'));
  }

  // ── EXPORTS — branded PDF & CSV (filtered view = what you see) ──

  // ── Shared data getters ────────────────────────────────────────
  function _filteredTxns() {
    const fm = S.filter.month, ft = S.filter.type, fc = S.filter.category;
    let r = fm ? S.txns.filter(t => (t.transactionDate||'').slice(0,7)===fm) : [...S.txns];
    if (ft) r = r.filter(t => t.type === ft);
    if (fc) r = r.filter(t => t.category === fc);
    return r.sort((a,b) => (b.transactionDate||'').localeCompare(a.transactionDate||''));
  }
  function _filteredInvs() {
    const fm = S.filter.month, fs = S.filter.status;
    const today = new Date().toISOString().slice(0,10);
    let r = fm ? S.invoices.filter(i => (i.invoiceDate||'').slice(0,7)===fm) : [...S.invoices];
    r = r.map(i => ((i.status==='Issued'||i.status==='Sent') && i.dueDate && i.dueDate < today) ? {...i, status:'Overdue'} : i);
    if (fs) r = r.filter(i => i.status === fs);
    return r.sort((a,b) => (b.invoiceDate||'').localeCompare(a.invoiceDate||''));
  }
  function _filteredExps() {
    const fm = S.filter.month, fc = S.filter.category;
    let r = fm ? S.expenses.filter(e => (e.expenseDate||'').slice(0,7)===fm) : [...S.expenses];
    if (fc) r = r.filter(e => e.category === fc);
    return r.sort((a,b) => (b.expenseDate||'').localeCompare(a.expenseDate||''));
  }
  function _filteredSnaps() {
    const fm = S.filter.month;
    let r = fm ? S.snaps.filter(s => s.snapshotMonth===fm) : [...S.snaps];
    return r.sort((a,b) => (b.snapshotMonth||'').localeCompare(a.snapshotMonth||''));
  }

  // ── CSV ────────────────────────────────────────────────────────
  function _exportTxnCSV() {
    const rows = _filteredTxns();
    const suffix = [S.filter.month,S.filter.type,S.filter.category].filter(Boolean).join('_')||'all';
    _dlCSV('Transaction Ledger', [S.filter.month,S.filter.type,S.filter.category],
      [['Date','Type','Category','Description','Party','Net (£)','VAT (£)','Gross (£)','Ref','Status']],
      rows.map(t => [t.transactionDate,t.type,t.category,t.description,
        t.supplierOrCustomer,t.amountNet,t.amountVat,t.amountGross,t.externalRef,t.status]),
      `AskMiro_Transactions_${suffix}.csv`);
  }
  function _exportInvCSV() {
    const rows = _filteredInvs();
    const suffix = [S.filter.month,S.filter.status].filter(Boolean).join('_')||'all';
    _dlCSV('Invoice Register', [S.filter.month,S.filter.status],
      [['Invoice No.','Customer','Site','Date','Due Date','Subtotal (£)','VAT (£)','Total (£)','Paid (£)','Balance (£)','Status']],
      rows.map(i => [i.invoiceNumber,i.customerName,i.siteId,i.invoiceDate,
        i.dueDate,i.subtotal,i.vatAmount,i.totalAmount,i.amountPaid,i.balanceDue,i.status]),
      `AskMiro_Invoices_${suffix}.csv`);
  }
  function _exportExpCSV() {
    const rows = _filteredExps();
    const suffix = [S.filter.month,S.filter.category].filter(Boolean).join('_')||'all';
    _dlCSV('Expense Register', [S.filter.month,S.filter.category],
      [['Date','Category','Subcategory','Description','Supplier','Site','Net (£)','VAT (£)','Gross (£)','Receipt Ref','Recurring']],
      rows.map(e => [e.expenseDate,e.category,e.subcategory,e.description,
        e.supplier,e.linkedSiteId,e.amountNet,e.amountVat,e.amountGross,e.receiptRef,e.recurringFlag]),
      `AskMiro_Expenses_${suffix}.csv`);
  }
  function _exportSnapCSV() {
    const rows = _filteredSnaps();
    const suffix = S.filter.month||'all';
    _dlCSV('Profitability Report', [S.filter.month],
      [['Month','Site','Contract','Revenue (£)','Cash Received (£)','Labour (£)','Supplies (£)','Travel (£)','Subcontractors (£)','Other (£)','Total Cost (£)','Gross Profit (£)','Margin %','Risk Status']],
      rows.map(s => [s.snapshotMonth,s.siteId,s.contractId,s.invoicedRevenue,
        s.cashReceived,s.labourCost,s.suppliesCost,s.travelCost,s.subcontractorCost,
        s.otherCost,s.totalCost,s.grossProfit,s.grossMarginPct,s.riskFlag]),
      `AskMiro_Profitability_${suffix}.csv`);
  }
  function _dlCSV(reportTitle, filters, header, dataRows, filename) {
    const date = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const activeFilters = filters.filter(Boolean).join(' · ') || 'All records';
    const meta = [
      ['AskMiro Ltd — Confidential Finance Report','','',''],
      [`Report: ${reportTitle}`,'','',''],
      [`Period / Filter: ${activeFilters}`,'','',''],
      [`Generated: ${date}`,'','',''],
      ['','','',''],
    ];
    const rows = [...meta, ...header, ...dataRows];
    const csv  = rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a    = document.createElement('a');
    a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = filename;
    a.click();
  }

  // ── PDF ────────────────────────────────────────────────────────
  function _exportTxnPDF() {
    const rows = _filteredTxns();
    const totIn  = rows.filter(t=>t.type==='payment'||t.type==='income').reduce((s,t)=>s+_n(t.amountGross),0);
    const totOut = rows.filter(t=>t.type==='expense').reduce((s,t)=>s+_n(t.amountGross),0);
    const filters = [S.filter.month,S.filter.type,S.filter.category].filter(Boolean).join(' · ')||'All Records';
    const tableRows = rows.map(t => {
      const isIn = t.type==='payment'||t.type==='income';
      const isOut = t.type==='expense';
      return `<tr>
        <td>${t.transactionDate||'—'}</td>
        <td><span class="badge badge-${t.type==='payment'||t.type==='income'?'green':t.type==='expense'?'red':'blue'}">${t.type||'—'}</span></td>
        <td>${t.category||'—'}</td>
        <td>${t.description||'—'}</td>
        <td>${t.supplierOrCustomer||'—'}</td>
        <td style="text-align:right;color:${isIn?'#166534':isOut?'#991B1B':'#334155'};font-weight:600">${isIn?'+':'isOut'?'-':''}£${Number(t.amountGross||0).toFixed(2)}</td>
        <td><span class="badge badge-${t.status==='void'?'red':'grey'}">${t.status||'—'}</span></td>
      </tr>`;
    }).join('');
    _printDoc('Transaction Ledger', filters, `
      <div class="summary-row">
        <div class="summary-card green"><div class="summary-label">Total In</div><div class="summary-val">£${totIn.toFixed(2)}</div></div>
        <div class="summary-card red"><div class="summary-label">Total Out</div><div class="summary-val">£${totOut.toFixed(2)}</div></div>
        <div class="summary-card ${totIn-totOut>=0?'green':'red'}"><div class="summary-label">Net</div><div class="summary-val">£${(totIn-totOut).toFixed(2)}</div></div>
        <div class="summary-card blue"><div class="summary-label">Entries</div><div class="summary-val">${rows.length}</div></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Party</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${tableRows||'<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">No transactions for this filter</td></tr>'}</tbody>
      </table>`);
  }
  function _exportInvPDF() {
    const rows = _filteredInvs();
    const totInv  = rows.reduce((s,i)=>s+_n(i.totalAmount),0);
    const totBal  = rows.reduce((s,i)=>s+_n(i.balanceDue||i.totalAmount),0);
    const totPaid = rows.reduce((s,i)=>s+_n(i.amountPaid),0);
    const filters = [S.filter.month,S.filter.status].filter(Boolean).join(' · ')||'All Invoices';
    const tableRows = rows.map(i => `<tr>
      <td style="font-family:monospace">${i.invoiceNumber||i.id}</td>
      <td>${i.customerName||'—'}</td>
      <td>${i.siteId||'—'}</td>
      <td>${i.invoiceDate||'—'}</td>
      <td>${i.dueDate||'—'}</td>
      <td style="text-align:right">£${Number(i.totalAmount||0).toFixed(2)}</td>
      <td style="text-align:right;color:#166534">£${Number(i.amountPaid||0).toFixed(2)}</td>
      <td style="text-align:right;color:${_n(i.balanceDue)>0?'#991B1B':'#166534'};font-weight:600">£${Number(i.balanceDue||0).toFixed(2)}</td>
      <td><span class="badge badge-${i.status==='Paid'?'green':i.status==='Overdue'?'red':i.status==='Draft'?'grey':'blue'}">${i.status}</span></td>
    </tr>`).join('');
    _printDoc('Invoice Register', filters, `
      <div class="summary-row">
        <div class="summary-card blue"><div class="summary-label">Total Invoiced</div><div class="summary-val">£${totInv.toFixed(2)}</div></div>
        <div class="summary-card green"><div class="summary-label">Total Received</div><div class="summary-val">£${totPaid.toFixed(2)}</div></div>
        <div class="summary-card red"><div class="summary-label">Outstanding</div><div class="summary-val">£${totBal.toFixed(2)}</div></div>
        <div class="summary-card blue"><div class="summary-label">Invoices</div><div class="summary-val">${rows.length}</div></div>
      </div>
      <table>
        <thead><tr><th>Invoice No.</th><th>Customer</th><th>Site</th><th>Date</th><th>Due</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>${tableRows||'<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:20px">No invoices for this filter</td></tr>'}</tbody>
      </table>`);
  }
  function _exportExpPDF() {
    const rows = _filteredExps();
    const total = rows.reduce((s,e)=>s+_n(e.amountGross),0);
    const catMap = {};
    rows.forEach(e => { catMap[e.category]=(catMap[e.category]||0)+_n(e.amountGross); });
    const filters = [S.filter.month,S.filter.category].filter(Boolean).join(' · ')||'All Expenses';
    const tableRows = rows.map(e => `<tr>
      <td>${e.expenseDate||'—'}</td>
      <td>${e.category||'—'}</td>
      <td>${e.description||'—'}</td>
      <td>${e.supplier||'—'}</td>
      <td>${e.linkedSiteId||'—'}</td>
      <td style="text-align:right;color:#991B1B;font-weight:600">£${Number(e.amountGross||0).toFixed(2)}</td>
      <td>${e.recurringFlag==='Yes'?'<span class="badge badge-purple">Recurring</span>':''}</td>
    </tr>`).join('');
    const catBreakdown = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([c,v]) =>
      `<tr><td>${c}</td><td style="text-align:right;color:#991B1B">£${v.toFixed(2)}</td><td style="text-align:right;color:#64748b">${(v/total*100).toFixed(1)}%</td></tr>`
    ).join('');
    _printDoc('Expense Report', filters, `
      <div class="summary-row">
        <div class="summary-card red"><div class="summary-label">Total Expenses</div><div class="summary-val">£${total.toFixed(2)}</div></div>
        <div class="summary-card blue"><div class="summary-label">Entries</div><div class="summary-val">${rows.length}</div></div>
        <div class="summary-card purple"><div class="summary-label">Categories</div><div class="summary-val">${Object.keys(catMap).length}</div></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Supplier</th><th>Site</th><th>Amount</th><th></th></tr></thead>
        <tbody>${tableRows||'<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">No expenses for this filter</td></tr>'}</tbody>
        <tfoot><tr><td colspan="5" style="font-weight:700;text-align:right">Total</td><td style="font-weight:700;color:#991B1B;text-align:right">£${total.toFixed(2)}</td><td></td></tr></tfoot>
      </table>
      ${catBreakdown ? `<h3 style="margin:24px 0 10px;font-size:13px;color:#0f766e;text-transform:uppercase;letter-spacing:.06em">By Category</h3>
      <table style="max-width:400px"><thead><tr><th>Category</th><th>Amount</th><th>%</th></tr></thead><tbody>${catBreakdown}</tbody></table>` : ''}`);
  }
  function _exportSnapPDF() {
    const rows = _filteredSnaps();
    const totRev  = rows.reduce((s,r)=>s+_n(r.invoicedRevenue),0);
    const totProf = rows.reduce((s,r)=>s+_n(r.grossProfit),0);
    const portMgn = totRev > 0 ? (totProf/totRev*100).toFixed(1) : '—';
    const riskCnt = rows.filter(s=>s.riskFlag==='risk'||s.riskFlag==='loss').length;
    const filters = S.filter.month || 'All Months';
    const tableRows = rows.map(s => {
      const pct = parseFloat(s.grossMarginPct||0);
      const color = pct < 0 ? '#991B1B' : pct < 20 ? '#92400E' : '#166534';
      return `<tr>
        <td>${s.snapshotMonth||'—'}</td>
        <td style="font-weight:600">${s.siteId||'—'}</td>
        <td style="text-align:right">£${Number(s.invoicedRevenue||0).toFixed(2)}</td>
        <td style="text-align:right;color:#991B1B">£${Number(s.totalCost||0).toFixed(2)}</td>
        <td style="text-align:right;color:${color};font-weight:700">£${Number(s.grossProfit||0).toFixed(2)}</td>
        <td style="text-align:right;color:${color};font-weight:700">${pct.toFixed(1)}%</td>
        <td><span class="badge badge-${s.riskFlag==='healthy'?'green':s.riskFlag==='watch'?'yellow':s.riskFlag==='loss'||s.riskFlag==='risk'?'red':'grey'}">${s.riskFlag||'—'}</span></td>
      </tr>`;
    }).join('');
    _printDoc('Profitability Report', filters, `
      <div class="summary-row">
        <div class="summary-card blue"><div class="summary-label">Portfolio Revenue</div><div class="summary-val">£${totRev.toFixed(2)}</div></div>
        <div class="summary-card ${parseFloat(portMgn)>=35?'green':parseFloat(portMgn)>=20?'yellow':'red'}"><div class="summary-label">Portfolio Margin</div><div class="summary-val">${portMgn}%</div></div>
        <div class="summary-card ${riskCnt>0?'red':'green'}"><div class="summary-label">At-Risk Contracts</div><div class="summary-val">${riskCnt}</div></div>
        <div class="summary-card blue"><div class="summary-label">Sites</div><div class="summary-val">${rows.length}</div></div>
      </div>
      <table>
        <thead><tr><th>Month</th><th>Site</th><th>Revenue</th><th>Cost</th><th>Gross Profit</th><th>Margin %</th><th>Status</th></tr></thead>
        <tbody>${tableRows||'<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">No profitability data</td></tr>'}</tbody>
      </table>
      <p style="margin-top:16px;font-size:11px;color:#94a3b8">Thresholds: Healthy ≥ 35% · Watch 20–34% · Risk &lt; 20% · Loss &lt; 0%</p>`);
  }

  function _printDoc(reportTitle, filterLabel, bodyHtml) {
    const date = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });

    // Remove any existing overlay
    const existing = document.getElementById('fin-print-overlay');
    if (existing) existing.remove();

    // Inject print styles once
    if (!document.getElementById('fin-print-styles')) {
      const s = document.createElement('style');
      s.id = 'fin-print-styles';
      s.textContent = `
        #fin-print-overlay{display:none;position:fixed;inset:0;background:#fff;z-index:99999;overflow-y:auto;padding:32px 40px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#1e293b}
        #fin-print-overlay .doc-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid #0D9488;margin-bottom:24px}
        #fin-print-overlay .doc-brand{display:flex;align-items:center;gap:10px}
        #fin-print-overlay .doc-logo{width:36px;height:36px;background:#0D9488;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        #fin-print-overlay .doc-name{font-size:18px;font-weight:800;color:#0D9488}
        #fin-print-overlay .doc-name span{color:#0f172a}
        #fin-print-overlay .doc-meta{text-align:right;font-size:11px;color:#64748b;line-height:1.7}
        #fin-print-overlay .doc-meta strong{color:#1e293b;font-size:13px;display:block}
        #fin-print-overlay .summary-row{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
        #fin-print-overlay .summary-card{flex:1;min-width:140px;padding:12px 16px;border-radius:8px;border:1px solid #e2e8f0}
        #fin-print-overlay .summary-card.green{background:#f0fdf4;border-color:#bbf7d0}
        #fin-print-overlay .summary-card.red{background:#fef2f2;border-color:#fecaca}
        #fin-print-overlay .summary-card.blue{background:#eff6ff;border-color:#bfdbfe}
        #fin-print-overlay .summary-card.yellow{background:#fffbeb;border-color:#fde68a}
        #fin-print-overlay .summary-card.purple{background:#faf5ff;border-color:#e9d5ff}
        #fin-print-overlay .summary-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px}
        #fin-print-overlay .summary-val{font-size:20px;font-weight:800;color:#1e293b}
        #fin-print-overlay table{width:100%;border-collapse:collapse;font-size:11px}
        #fin-print-overlay th{background:#f8fafc;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:2px solid #e2e8f0}
        #fin-print-overlay td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}
        #fin-print-overlay tfoot td{border-top:2px solid #e2e8f0;background:#f8fafc}
        #fin-print-overlay .badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:9px;font-weight:700;text-transform:uppercase}
        #fin-print-overlay .badge-green{background:#dcfce7;color:#166534}
        #fin-print-overlay .badge-red{background:#fee2e2;color:#991B1B}
        #fin-print-overlay .badge-blue{background:#dbeafe;color:#1d4ed8}
        #fin-print-overlay .badge-yellow{background:#fef9c3;color:#92400e}
        #fin-print-overlay .badge-grey{background:#f1f5f9;color:#475569}
        #fin-print-overlay .badge-purple{background:#f3e8ff;color:#6b21a8}
        #fin-print-overlay .doc-footer{margin-top:32px;padding-top:14px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
        #fin-print-overlay h3{font-size:12px;font-weight:700;color:#0f766e;text-transform:uppercase;letter-spacing:.06em;margin:24px 0 10px}
        @media print{
          body > *:not(#fin-print-overlay){display:none!important}
          #fin-print-overlay{display:block!important;position:static!important;padding:20px 28px}
          #fin-print-overlay .no-print{display:none!important}
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        }`;
      document.head.appendChild(s);
    }

    const overlay = document.createElement('div');
    overlay.id = 'fin-print-overlay';
    overlay.innerHTML = `
      <div class="doc-header">
        <div class="doc-brand">
          <div class="doc-logo">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div>
            <div class="doc-name"><span>Ask</span>Miro</div>
            <div style="font-size:10px;color:#64748b">AskMiro Ltd · Finance Department</div>
          </div>
        </div>
        <div class="doc-meta">
          <strong>${reportTitle}</strong>
          Filter: ${filterLabel}<br>
          Generated: ${date}<br>
          <span style="color:#dc2626;font-weight:700">CONFIDENTIAL</span>
        </div>
      </div>
      ${bodyHtml}
      <div class="doc-footer">
        <span>AskMiro Ltd — Confidential. For internal use only.</span>
        <span>Generated ${date} · askmiro.com</span>
      </div>
      <div class="no-print" style="text-align:center;margin-top:28px;padding-bottom:40px">
        <button onclick="window.print()" style="background:#0D9488;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">&#128438; Save as PDF</button>
        <button onclick="document.getElementById('fin-print-overlay').remove()" style="background:#f1f5f9;color:#475569;border:none;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;margin-left:10px">&#x2715; Close</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.style.display = 'block';
  }

  // ── HELPERS ───────────────────────────────────────────────────
  function _n(v)   { return parseFloat(v) || 0; }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Guided empty state card — used across all tabs
  function _emptyCard({ icon, title, body, ctas = [], hint = '' }) {
    const btns = ctas.map(c =>
      `<button class="btn ${c.style||'bp'} btn-xs" onclick="${c.action}">${c.label}</button>`
    ).join('');
    return `<div style="text-align:center;padding:40px 24px 36px;background:#fafbfc;border-radius:10px;border:1px dashed #e2e8f0">
      <div style="font-size:36px;margin-bottom:12px;line-height:1">${icon}</div>
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:6px">${title}</div>
      <div style="font-size:13px;color:#64748b;max-width:420px;margin:0 auto 18px;line-height:1.6">${body}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${btns}</div>
      ${hint ? `<div style="font-size:11px;color:#94a3b8;margin-top:14px">&#9432; ${hint}</div>` : ''}
    </div>`;
  }
  function _fm(m)  {
    if (!m) return '—';
    const d = new Date(m.length === 7 ? m+'-01' : m);
    return isNaN(d) ? m : d.toLocaleDateString('en-GB', { month:'short', year:'numeric' });
  }
  function _typePill(type) {
    const map = { income:'pg', payment:'pg', expense:'pr', invoice:'pt', credit_note:'pa', adjustment:'pa', void:'pr' };
    const cls = map[type] || 'pt';
    return `<span class="pl ${cls}" style="font-size:10px">${type||'—'}</span>`;
  }
  function _setFilter(key, val) {
    S.filter[key] = val;
    _renderTab();
  }

  // ── PREMIUM INVOICE PDF (Tesla × Fluent branding) ─────────
  function previewInvoicePdf(id) {
    var i = S.invoices.find(function(x) { return x.id === id; });
    if (!i) { UI.toast('Invoice not found', 'r'); return; }
    var today = i.invoiceDate || new Date().toISOString().slice(0,10);
    var due = i.dueDate || '';
    var todayFmt = new Date(today + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    var dueFmt = due ? new Date(due + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var net = parseFloat(i.totalAmount || 0);
    var vatR = parseFloat(S.settings.vatRate || 0);
    var vatAmt = net * (vatR / (100 + vatR)); // Extract VAT from gross
    var netAmt = net - vatAmt;
    var bal = parseFloat(i.balanceDue || i.totalAmount || 0);
    var isPaid = bal <= 0 || i.status === 'Paid';

    // Parse line items from notes or use single line
    var lines = [];
    var noteLines = (i.notes || '').match(/LINE_ITEMS:\s*(\[.+\])/);
    if (noteLines) { try { lines = JSON.parse(noteLines[1]); } catch(e) {} }
    if (!lines.length) { lines = [{ description: i.siteId || 'Services rendered', amount: netAmt }]; }

    var lineRows = lines.map(function(li) {
      return '<tr><td style="padding:14px 16px;border-bottom:1px solid #F1F5F9;font-size:14px;color:#1E293B"><div style="font-weight:600">' + _esc(li.description || '') + '</div></td>'
        + '<td style="padding:14px 16px;border-bottom:1px solid #F1F5F9;text-align:right;font-weight:600;color:#1E293B;font-size:14px;white-space:nowrap">&#163;' + parseFloat(li.amount || 0).toFixed(2) + '</td></tr>';
    }).join('');

    var vatLabel = vatR > 0 ? 'VAT (' + vatR + '%)' : 'VAT (0% — below threshold)';
    var statusColor = isPaid ? '#059669' : '#DC2626';
    var statusText = isPaid ? 'PAID' : i.status.toUpperCase();

    var html = '<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
      + '<title>Invoice ' + _esc(i.invoiceNumber || i.id) + ' | AskMiro</title>'
      + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
      + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">'
      + '<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:"DM Sans",-apple-system,sans-serif; background:#fff; color:#1E293B; line-height:1.6; }'
      + '@page { size:A4; margin:0; } @media print { .no-print { display:none !important; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }'
      + '.page { max-width:794px; margin:0 auto; padding:48px 56px; }</style></head><body>'
      + '<div class="no-print" style="background:#0D9488;padding:12px 24px;display:flex;gap:12px;align-items:center;justify-content:center">'
      + '<button onclick="window.print()" style="background:#fff;color:#0D9488;border:none;padding:10px 32px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Save as PDF</button>'
      + '<button onclick="window.close()" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:10px 32px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit">Close</button></div>'
      + '<div class="page">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #0D9488">'
      + '<div><div style="font-family:Outfit,sans-serif;font-weight:800;font-size:28px;color:#0D9488;letter-spacing:-0.5px">AskMiro</div>'
      + '<div style="font-size:13px;color:#64748B;margin-top:4px">Managed Cleaning Services</div>'
      + '<div style="font-size:12px;color:#94A3B8;margin-top:2px">020 8073 0621 &bull; info@askmiro.com &bull; www.askmiro.com</div></div>'
      + '<div style="text-align:right"><div style="font-family:Outfit,sans-serif;font-weight:700;font-size:22px;color:#1E293B;letter-spacing:-0.3px">INVOICE</div>'
      + '<div style="font-size:13px;color:#64748B;margin-top:4px">' + _esc(i.invoiceNumber || i.id) + '</div>'
      + '<div style="font-size:13px;color:#64748B">Date: ' + todayFmt + '</div>'
      + (dueFmt ? '<div style="font-size:13px;color:#64748B">Due: ' + dueFmt + '</div>' : '')
      + '<div style="display:inline-block;margin-top:8px;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;color:#fff;background:' + statusColor + '">' + statusText + '</div>'
      + '</div></div>'
      // Bill To
      + '<div style="background:#F8FAFC;border-radius:10px;padding:20px;margin-bottom:32px">'
      + '<div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Bill To</div>'
      + '<div style="font-size:16px;font-weight:700;color:#1E293B">' + _esc(i.customerName || '') + '</div>'
      + (i.siteId ? '<div style="font-size:13px;color:#64748B;margin-top:4px">' + _esc(i.siteId) + '</div>' : '')
      + '</div>'
      // Line items
      + '<table style="width:100%;border-collapse:collapse;margin-bottom:24px">'
      + '<thead><tr><th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #E2E8F0;background:#F8FAFC">Description</th>'
      + '<th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #E2E8F0;background:#F8FAFC">Amount</th></tr></thead>'
      + '<tbody>' + lineRows + '</tbody></table>'
      // Totals
      + '<div style="display:flex;justify-content:flex-end;margin-bottom:32px">'
      + '<div style="width:300px;background:#F8FAFC;border-radius:10px;padding:16px 20px">'
      + '<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:14px"><span style="color:#64748B">Subtotal (net)</span><span style="font-weight:600">&#163;' + netAmt.toFixed(2) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:14px"><span style="color:#64748B">' + vatLabel + '</span><span style="font-weight:600">&#163;' + vatAmt.toFixed(2) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;padding:12px 0;margin-top:8px;border-top:2px solid #0D9488;font-size:18px"><span style="font-weight:700;color:#1E293B">Total</span><span style="font-weight:800;color:#0D9488">&#163;' + net.toFixed(2) + '</span></div>'
      + (isPaid ? '<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:14px;margin-top:4px"><span style="color:#059669;font-weight:600">Amount Paid</span><span style="font-weight:700;color:#059669">&#163;' + net.toFixed(2) + '</span></div>'
        : '<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:14px;margin-top:4px"><span style="color:#DC2626;font-weight:600">Balance Due</span><span style="font-weight:700;color:#DC2626">&#163;' + bal.toFixed(2) + '</span></div>')
      + '</div></div>'
      // Payment terms
      + '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px 20px;margin-bottom:24px">'
      + '<div style="font-size:11px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Payment Information</div>'
      + '<div style="font-size:13px;color:#78350F;line-height:1.7">'
      + '<strong>Bank Transfer:</strong> Miro Partners Ltd &bull; Tide &bull; Sort Code: available on request<br>'
      + '<strong>Card Payment:</strong> Secure payment link will be provided separately<br>'
      + 'Please reference <strong>' + _esc(i.invoiceNumber || i.id) + '</strong> with your payment.</div></div>'
      // Footer
      + '<div style="border-top:1px solid #E2E8F0;padding-top:20px;display:flex;justify-content:space-between;align-items:center">'
      + '<div style="font-size:11px;color:#94A3B8;line-height:1.6">AskMiro Cleaning Services<br>A trading name of Miro Partners Ltd<br>Company registered in England &amp; Wales</div>'
      + '<div style="font-size:11px;color:#94A3B8;text-align:right;line-height:1.6">Reliable. Thorough. Local.<br>www.askmiro.com<br>020 8073 0621</div></div>'
      + '</div></body></html>';

    var w = window.open('', '_blank', 'width=850,height=1100');
    if (w) { w.document.write(html); w.document.close(); }
    else { UI.toast('Pop-up blocked', 'r'); }
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return {
    render, _tab, _setMonth, _setFilter, _refresh, _hl,
    _recalc, _markSent, _voidTxn, _openInvoice,
    _addInvLine, _calcLineTotal, _calcInvTotal, _calcFromGross,
    _sendChat, _askSuggested,
    openCreateInvoice, openRecordPayment, openAddExpense, openAddTransaction, openSetupSheets,
    _saveInvoice, _savePayment, _saveExpense, _saveTransaction, _generateRecurring,
    _exportTxnCSV, _exportInvCSV, _exportExpCSV, _exportSnapCSV,
    _exportTxnPDF, _exportInvPDF, _exportExpPDF, _exportSnapPDF,
    previewInvoicePdf,
  };
})();
