// ============================================================
// AskMiro Ops — Finance Module  v2.0
// Overview | Transactions | Invoices | Reports (HMRC)
// ============================================================
window.Finance = (() => {
  let _finance = [], _invoices = [], _transactions = [];
  let _activeTab = 'overview';
  let _filterMonth = '';

  const EXPENSE_CATS = [
    'Labour (Subcontractors)', 'Wages (PAYE)', 'Materials & Supplies',
    'Travel & Transport', 'Equipment & Tools', 'Premises & Utilities',
    'Software & Subscriptions', 'Professional Services',
    'Marketing & Advertising', 'Insurance', 'Other Expenses'
  ];
  const INCOME_CATS = ['Contract Revenue', 'One-off Job', 'Other Income'];

  // ── ENTRY POINT ───────────────────────────────────────────────
  async function render() {
    const app = document.getElementById('main-content');
    app.innerHTML = `<div style="padding:40px;text-align:center;color:var(--ll)"><div class="spinner" style="margin:0 auto 12px"></div>Loading finance data…</div>`;

    try {
      [_finance, _invoices, _transactions] = await Promise.all([
        API.get('finance'),
        API.get('invoices'),
        API.get('transactions').catch(() => [])
      ]);
    } catch(e) {
      UI.toast('Could not load finance data: ' + e.message, 'a');
      _finance = []; _invoices = []; _transactions = [];
    }

    _renderShell(app);
    _renderTab();
  }

  function _renderShell(app) {
    const months = [...new Set([
      ..._finance.map(r => r.month),
      ..._transactions.map(t => t.month || (t.date ? t.date.slice(0,7) : ''))
    ])].filter(Boolean).sort().reverse();

    const monthOpts = months.map(m =>
      `<option value="${m}"${_filterMonth===m?' selected':''}>${_fmtMonth(m)}</option>`
    ).join('');

    app.innerHTML = `
${UI.secHd('Finance', 'Revenue, Costs & Invoicing')}
<div class="fb" style="margin-bottom:16px;align-items:center;gap:8px;flex-wrap:wrap">
  <div style="display:flex;gap:6px">
    <button id="fin-tab-overview"      class="btn bo btn-xs" onclick="Finance._tab('overview')">Overview</button>
    <button id="fin-tab-transactions"  class="btn bo btn-xs" onclick="Finance._tab('transactions')">Transactions</button>
    <button id="fin-tab-invoices"      class="btn bo btn-xs" onclick="Finance._tab('invoices')">Invoices</button>
    <button id="fin-tab-reports"       class="btn bo btn-xs" onclick="Finance._tab('reports')">Reports</button>
  </div>
  <div class="sp"></div>
  <select class="fin" id="fin-month-filter" style="width:140px;padding:6px 10px;font-size:12px" onchange="Finance._setMonth(this.value)">
    <option value="">All Months</option>
    ${monthOpts}
  </select>
  <button class="btn bo btn-xs" onclick="Finance._exportCSV()" style="white-space:nowrap">&#8595; Export CSV</button>
</div>
<div id="fin-content"></div>`;

    _highlightTab(_activeTab);
  }

  function _tab(name) {
    _activeTab = name;
    _highlightTab(name);
    _renderTab();
  }

  function _highlightTab(name) {
    ['overview','transactions','invoices','reports'].forEach(t => {
      const btn = document.getElementById('fin-tab-' + t);
      if (!btn) return;
      const on = t === name;
      btn.style.background   = on ? 'var(--brand)' : '';
      btn.style.color        = on ? '#fff' : '';
      btn.style.borderColor  = on ? 'var(--brand)' : '';
    });
  }

  function _setMonth(m) { _filterMonth = m; _renderTab(); }

  function _renderTab() {
    const el = document.getElementById('fin-content');
    if (!el) return;
    if      (_activeTab === 'overview')     el.innerHTML = _buildOverview();
    else if (_activeTab === 'transactions') el.innerHTML = _buildTransactions();
    else if (_activeTab === 'invoices')     el.innerHTML = _buildInvoices();
    else if (_activeTab === 'reports')      el.innerHTML = _buildReports();
  }

  // ── KPI BAR ──────────────────────────────────────────────────
  function _kpis() {
    const fm    = _filterMonth;
    const fFin  = fm ? _finance.filter(r => r.month === fm)                                   : _finance;
    const fInv  = fm ? _invoices.filter(i => i.month === fm)                                  : _invoices;
    const fTxns = fm ? _transactions.filter(t => (t.month||(t.date||'').slice(0,7)) === fm)  : _transactions;

    const totRev  = fFin.reduce((s,r) => s + _n(r.revenue), 0)
                  + fTxns.filter(t => t.type === 'Income').reduce((s,t) => s + _n(t.amount), 0);
    const totCost = fFin.reduce((s,r) => s + _n(r.directCost), 0)
                  + fTxns.filter(t => t.type === 'Expense').reduce((s,t) => s + _n(t.amount), 0);
    const net    = totRev - totCost;
    const margin = totRev > 0 ? net / totRev * 100 : 0;
    const outstanding = fInv.filter(i => i.status === 'Sent').reduce((s,i) => s + _n(i.amount), 0);
    const overdue     = fInv.filter(i => i.status === 'Overdue').reduce((s,i) => s + _n(i.amount), 0);

    return `<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
  <div class="kpi kpi-g"><div class="kpi-label">Total Revenue</div><div class="kpi-value">${UI.fmtk(totRev)}</div></div>
  <div class="kpi kpi-${UI.ragCls(margin,45,30)}"><div class="kpi-label">Net Margin</div><div class="kpi-value">${UI.fmtPct(margin)}</div></div>
  <div class="kpi kpi-${net>=0?'g':'r'}"><div class="kpi-label">Net Profit</div><div class="kpi-value">${UI.fmtk(net)}</div></div>
  <div class="kpi kpi-a"><div class="kpi-label">Total Costs</div><div class="kpi-value">${UI.fmtk(totCost)}</div></div>
  <div class="kpi kpi-${outstanding>0?'a':'g'}"><div class="kpi-label">Outstanding</div><div class="kpi-value">${UI.fmtk(outstanding)}</div></div>
  <div class="kpi kpi-${overdue>0?'r':'g'}"><div class="kpi-label">Overdue</div><div class="kpi-value">${UI.fmtk(overdue)}</div></div>
</div>`;
  }

  // ── OVERVIEW TAB ─────────────────────────────────────────────
  function _buildOverview() {
    const fm   = _filterMonth;
    const fFin = fm ? _finance.filter(r => r.month === fm) : _finance;

    // By site
    const siteMap = {};
    fFin.forEach(r => {
      if (!siteMap[r.siteId]) siteMap[r.siteId] = { rev:0, cost:0, months:new Set() };
      siteMap[r.siteId].rev  += _n(r.revenue);
      siteMap[r.siteId].cost += _n(r.directCost);
      siteMap[r.siteId].months.add(r.month);
    });
    const siteRows = Object.entries(siteMap)
      .sort((a,b) => b[1].rev - a[1].rev)
      .map(([site, d]) => {
        const gm = d.rev - d.cost, pct = d.rev > 0 ? gm/d.rev*100 : 0;
        return `<tr>
          <td class="tfw">${_esc(site)}</td>
          <td style="color:var(--ll);font-size:12px">${d.months.size}mo</td>
          <td>${UI.fmt(d.rev)}</td><td>${UI.fmt(d.cost)}</td><td>${UI.fmt(gm)}</td>
          <td>${UI.pill(UI.fmtPct(pct), UI.ragCls(pct,45,30))}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ll);padding:24px">No data — add rows to Finance sheet</td></tr>`;

    // By month
    const mMap = {};
    fFin.forEach(r => {
      if (!mMap[r.month]) mMap[r.month] = { rev:0, cost:0 };
      mMap[r.month].rev  += _n(r.revenue);
      mMap[r.month].cost += _n(r.directCost);
    });
    const monthRows = Object.entries(mMap)
      .sort((a,b) => b[0].localeCompare(a[0]))
      .map(([m, d]) => {
        const gm = d.rev - d.cost, pct = d.rev > 0 ? gm/d.rev*100 : 0;
        return `<tr>
          <td>${_fmtMonth(m)}</td>
          <td>${UI.fmt(d.rev)}</td><td>${UI.fmt(d.cost)}</td><td>${UI.fmt(gm)}</td>
          <td>${UI.pill(UI.fmtPct(pct), UI.ragCls(pct,45,30))}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--ll);padding:24px">No monthly data yet</td></tr>`;

    return `
${_kpis()}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div class="card">
    <div class="card-body" style="padding-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Margin by Site</div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Site</th><th></th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th></tr></thead>
        <tbody>${siteRows}</tbody>
      </table></div>
    </div>
  </div>
  <div class="card">
    <div class="card-body" style="padding-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">P&amp;L by Month</div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Month</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th></tr></thead>
        <tbody>${monthRows}</tbody>
      </table></div>
    </div>
  </div>
</div>`;
  }

  // ── TRANSACTIONS TAB ─────────────────────────────────────────
  function _buildTransactions() {
    const fm    = _filterMonth;
    const fTxns = fm
      ? _transactions.filter(t => (t.month||(t.date||'').slice(0,7)) === fm)
      : _transactions;
    const sorted = [...fTxns].sort((a,b) => (b.date||'').localeCompare(a.date||''));

    const rows = sorted.map(t => `<tr>
      <td style="white-space:nowrap">${t.date||'—'}</td>
      <td>${UI.statusPill(t.type)}</td>
      <td style="font-size:12px">${_esc(t.category||'—')}</td>
      <td>${_esc(t.description||'—')}</td>
      <td style="font-size:12px;color:var(--ll)">${_esc(t.siteId||'')}</td>
      <td style="text-align:right;font-weight:700;color:${t.type==='Income'?'#059669':'#DC2626'}">${t.type==='Income'?'+':'-'}${UI.fmt(t.amount||0)}</td>
      <td style="font-size:11px;color:var(--ll)">${_esc(t.reference||'')}</td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ll);padding:24px">No transactions yet</td></tr>`;

    // Expense breakdown sidebar
    const catMap = {};
    fTxns.filter(t => t.type === 'Expense').forEach(t => {
      const c = t.category || 'Uncategorised';
      catMap[c] = (catMap[c]||0) + _n(t.amount);
    });
    const catRows = Object.entries(catMap).sort((a,b) => b[1]-a[1])
      .map(([c,v]) => `<tr><td style="font-size:12px">${_esc(c)}</td><td style="text-align:right;font-size:12px">${UI.fmt(v)}</td></tr>`)
      .join('') || `<tr><td colspan="2" style="text-align:center;color:var(--ll);padding:16px;font-size:12px">No expenses yet</td></tr>`;

    return `
${_kpis()}
<div class="fb" style="margin-bottom:12px">
  <div class="sp"></div>
  <button class="btn bp" onclick="Finance.openAddTransaction()">+ Add Transaction</button>
</div>
<div style="display:grid;grid-template-columns:1fr 260px;gap:16px">
  <div class="card">
    <div class="card-body" style="padding-top:12px">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Site</th><th style="text-align:right">Amount</th><th>Ref</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>
  </div>
  <div class="card" style="align-self:start">
    <div class="card-body" style="padding-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Expenses by Category</div>
      <table class="tbl"><tbody>${catRows}</tbody></table>
    </div>
  </div>
</div>`;
  }

  // ── INVOICES TAB ─────────────────────────────────────────────
  function _buildInvoices() {
    const fm    = _filterMonth;
    const today = new Date().toISOString().slice(0,10);
    const fInv  = fm ? _invoices.filter(i => i.month === fm) : _invoices;
    const sorted = [...fInv].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));

    const rows = sorted.map(i => {
      const isOverdue = i.status !== 'Paid' && i.dueDate && i.dueDate < today;
      const status    = isOverdue ? 'Overdue' : i.status;
      const aging = (i.dueDate && i.status !== 'Paid') ? (() => {
        const days = Math.round((new Date(today) - new Date(i.dueDate)) / 86400000);
        if (days > 0)  return `<span style="color:#DC2626;font-size:11px;font-weight:700"> ${days}d over</span>`;
        if (days > -7) return `<span style="color:#D97706;font-size:11px"> due ${-days}d</span>`;
        return `<span style="color:var(--ll);font-size:11px"> due ${-days}d</span>`;
      })() : '';
      return `<tr>
        <td style="font-family:monospace;font-size:12px">${i.id}</td>
        <td>${_esc(i.siteId||'')}</td>
        <td>${_fmtMonth(i.month)}</td>
        <td style="font-weight:600">${UI.fmt(i.amount||0)}</td>
        <td>${i.dueDate||'—'}${aging}</td>
        <td>${UI.statusPill(status)}</td>
        <td style="white-space:nowrap">${i.status !== 'Paid'
          ? `<button class="btn bo btn-xs" onclick="Finance.openSendInvoice('${i.id}')" style="margin-right:4px">Send</button><button class="btn bo btn-xs" onclick="Finance.openRecordPayment('${i.id}','${i.amount||0}')" style="border-color:#059669;color:#059669">Paid &#10003;</button>`
          : '<span style="font-size:12px;color:#059669;font-weight:600">&#10003; Paid</span>'}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ll);padding:24px">No invoices yet</td></tr>`;

    return `
${_kpis()}
<div class="fb" style="margin-bottom:12px">
  <div class="sp"></div>
  <button class="btn bp" onclick="Finance.openNewInvoice()">+ Create Invoice</button>
</div>
<div class="card">
  <div class="card-body" style="padding-top:12px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Invoice ID</th><th>Site</th><th>Month</th><th>Amount</th><th>Due Date</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>
</div>`;
  }

  // ── REPORTS TAB ──────────────────────────────────────────────
  function _buildReports() {
    const catMap = {};
    _transactions.filter(t => t.type === 'Expense').forEach(t => {
      const c = t.category || 'Uncategorised';
      catMap[c] = (catMap[c]||0) + _n(t.amount);
    });

    const totalIncome  = _finance.reduce((s,r) => s + _n(r.revenue), 0)
                       + _transactions.filter(t => t.type === 'Income').reduce((s,t) => s + _n(t.amount), 0);
    const totalExpense = _finance.reduce((s,r) => s + _n(r.directCost), 0)
                       + _transactions.filter(t => t.type === 'Expense').reduce((s,t) => s + _n(t.amount), 0);
    const net = totalIncome - totalExpense;

    const catRows = EXPENSE_CATS.map(c => {
      const amt = catMap[c] || 0;
      return `<tr>
        <td style="font-size:13px">${c}</td>
        <td style="text-align:right;font-size:13px;font-weight:${amt>0?'600':'400'};color:${amt>0?'#DC2626':'var(--ll)'}">${UI.fmt(amt)}</td>
      </tr>`;
    }).join('');

    const uncatAmt = Object.entries(catMap)
      .filter(([k]) => !EXPENSE_CATS.includes(k))
      .reduce((s,[,v]) => s+v, 0);

    return `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div class="card">
    <div class="card-body" style="padding-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">HMRC Allowable Expense Categories</div>
      <table class="tbl" style="font-size:13px">
        <thead><tr><th>Category</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>
          ${catRows}
          ${uncatAmt > 0 ? `<tr><td style="color:var(--ll);font-size:12px">Uncategorised</td><td style="text-align:right;color:var(--ll);font-size:12px">${UI.fmt(uncatAmt)}</td></tr>` : ''}
          <tr style="border-top:2px solid var(--brd)">
            <td style="font-weight:700">Total Allowable Expenses</td>
            <td style="text-align:right;font-weight:700;color:#DC2626">${UI.fmt(totalExpense)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="card" style="align-self:start">
    <div class="card-body" style="padding-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--ll);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">Tax Year Summary</div>
      <table class="tbl" style="font-size:14px">
        <tbody>
          <tr><td>Total Income</td><td style="text-align:right;font-weight:600;color:#059669">${UI.fmt(totalIncome)}</td></tr>
          <tr><td>Total Expenses</td><td style="text-align:right;font-weight:600;color:#DC2626">${UI.fmt(totalExpense)}</td></tr>
          <tr style="border-top:2px solid var(--brd)">
            <td style="font-weight:800;font-size:15px">Net Profit (Taxable)</td>
            <td style="text-align:right;font-weight:800;font-size:18px;color:${net>=0?'#059669':'#DC2626'}">${UI.fmt(net)}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:8px">
        <button class="btn bo" onclick="Finance._exportCSV()" style="width:100%">&#8595; Download P&amp;L CSV</button>
        <button class="btn bo" onclick="Finance._exportTransactionsCSV()" style="width:100%">&#8595; Download Transactions CSV</button>
        <button class="btn bo" onclick="Finance._exportInvoicesCSV()" style="width:100%">&#8595; Download Invoices CSV</button>
      </div>
    </div>
  </div>
</div>`;
  }

  // ── CSV EXPORTS ───────────────────────────────────────────────
  function _exportCSV() {
    const rows = [['Site','Month','Revenue','Direct Cost','Gross Profit','Margin %']];
    _finance.forEach(r => {
      const rev = _n(r.revenue), cost = _n(r.directCost), gm = rev - cost;
      rows.push([r.siteId, r.month, rev.toFixed(2), cost.toFixed(2), gm.toFixed(2),
        rev > 0 ? (gm/rev*100).toFixed(1)+'%' : '0%']);
    });
    _dlCSV(rows, 'finance-pl.csv');
  }

  function _exportTransactionsCSV() {
    const rows = [['Date','Type','Category','Description','Site','Amount','Reference']];
    _transactions.forEach(t => {
      rows.push([t.date||'', t.type||'', t.category||'', t.description||'',
        t.siteId||'', _n(t.amount).toFixed(2), t.reference||'']);
    });
    _dlCSV(rows, 'transactions.csv');
  }

  function _exportInvoicesCSV() {
    const rows = [['Invoice ID','Site','Month','Amount','Due Date','Status','Paid At']];
    _invoices.forEach(i => {
      rows.push([i.id, i.siteId, i.month, _n(i.amount).toFixed(2),
        i.dueDate||'', i.status||'', i.paidAt||'']);
    });
    _dlCSV(rows, 'invoices.csv');
  }

  function _dlCSV(rows, filename) {
    const csv = rows.map(r =>
      r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')
    ).join('\n');
    const a   = document.createElement('a');
    a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = filename;
    a.click();
  }

  // ── ADD TRANSACTION MODAL ─────────────────────────────────────
  function openAddTransaction() {
    const today      = new Date().toISOString().slice(0,10);
    const expCatOpts = EXPENSE_CATS.map(c => `<option value="${c}">${c}</option>`).join('');
    const incCatOpts = INCOME_CATS.map(c => `<option value="${c}">${c}</option>`).join('');
    window._txnExpCatOpts = expCatOpts;
    window._txnIncCatOpts = incCatOpts;

    UI.openModal(`<div class="modal-hd"><h2>Add Transaction</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg">
      <label class="fl">Type <span class="req">*</span></label>
      <select class="fin" id="txn-type" onchange="Finance._txnTypeChange()">
        <option value="Expense">Expense</option>
        <option value="Income">Income</option>
      </select>
    </div>
    <div class="fg">
      <label class="fl">Date <span class="req">*</span></label>
      <input class="fin" id="txn-date" type="date" value="${today}">
    </div>
  </div>
  <div class="fr">
    <div class="fg">
      <label class="fl">Category <span class="req">*</span></label>
      <select class="fin" id="txn-cat">${expCatOpts}</select>
    </div>
    <div class="fg">
      <label class="fl">Amount (£) <span class="req">*</span></label>
      <input class="fin" id="txn-amt" type="number" step="0.01" min="0" placeholder="0.00">
    </div>
  </div>
  <div class="fg">
    <label class="fl">Description <span class="req">*</span></label>
    <input class="fin" id="txn-desc" placeholder="What was this for?">
  </div>
  <div class="fr">
    <div class="fg">
      <label class="fl">Site (optional)</label>
      <input class="fin" id="txn-site" placeholder="SITE-000001">
    </div>
    <div class="fg">
      <label class="fl">Reference</label>
      <input class="fin" id="txn-ref" placeholder="Invoice / receipt ref">
    </div>
  </div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Finance.saveTransaction()">Add Transaction</button>
  </div>
</div>`);
  }

  function _txnTypeChange() {
    const type   = document.getElementById('txn-type')?.value;
    const catSel = document.getElementById('txn-cat');
    if (catSel) catSel.innerHTML = type === 'Income'
      ? window._txnIncCatOpts
      : window._txnExpCatOpts;
  }

  async function saveTransaction() {
    if (!UI.rq('txn-date') || !UI.rq('txn-cat') || !UI.rq('txn-amt') || !UI.rq('txn-desc')) return;
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const date = UI.gv('txn-date');
      await API.post('transaction.save', {
        date,
        month:       date.slice(0,7),
        type:        UI.gv('txn-type'),
        category:    UI.gv('txn-cat'),
        amount:      UI.gv('txn-amt'),
        description: UI.gv('txn-desc'),
        siteId:      UI.gv('txn-site'),
        reference:   UI.gv('txn-ref'),
      });
      UI.closeModal();
      UI.toast('Transaction added', 'g');
      await render();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = 'Add Transaction'; }
    }
  }

  // ── INVOICE MODALS ────────────────────────────────────────────
  function openNewInvoice() {
    UI.openModal(`<div class="modal-hd"><h2>Create Invoice</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Site ID <span class="req">*</span></label><input class="fin" id="inv-si" placeholder="SITE-000001"></div>
    <div class="fg"><label class="fl">Month <span class="req">*</span></label><input class="fin" id="inv-mo" placeholder="2025-06"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Amount (£) <span class="req">*</span></label><input class="fin" id="inv-am" type="number" placeholder="5000"></div>
    <div class="fg"><label class="fl">Due Date</label><input class="fin" id="inv-dd" type="date"></div>
  </div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Finance.saveInvoice()">Create Invoice</button>
  </div>
</div>`);
  }

  async function saveInvoice() {
    if (!UI.rq('inv-si') || !UI.rq('inv-mo') || !UI.rq('inv-am')) return;
    try {
      await API.post('invoice.generate', {
        siteId: UI.gv('inv-si'), month: UI.gv('inv-mo'),
        amount: UI.gv('inv-am'), dueDate: UI.gv('inv-dd')
      });
      UI.closeModal(); UI.toast('Invoice created');
      await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function openSendInvoice(id) {
    UI.openModal(`<div class="modal-hd"><h2>Send Invoice</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fg"><label class="fl">Recipient Email <span class="req">*</span></label><input class="fin" id="sinv-em" type="email" placeholder="billing@client.com"></div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Finance.doSendInvoice('${id}')">&#9992; Send</button>
  </div>
</div>`);
  }

  async function doSendInvoice(id) {
    if (!UI.rq('sinv-em')) return;
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      await API.post('invoice.send', { id, toEmail: UI.gv('sinv-em') });
      UI.closeModal(); UI.toast('Invoice sent ✓');
      await render();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = '&#9992; Send'; }
    }
  }

  function openRecordPayment(id, amount) {
    const today = new Date().toISOString().slice(0,10);
    UI.openModal(`<div class="modal-hd"><h2>Record Payment</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Amount Received (£) <span class="req">*</span></label><input class="fin" id="pay-am" type="number" value="${amount}" placeholder="5000"></div>
    <div class="fg"><label class="fl">Date Received <span class="req">*</span></label><input class="fin" id="pay-dt" type="date" value="${today}"></div>
  </div>
  <div class="fg"><label class="fl">Reference / Notes</label><input class="fin" id="pay-ref" placeholder="e.g. BACS transfer, ref 12345"></div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" style="background:#059669" onclick="Finance.doRecordPayment('${id}')">Mark as Paid &#10003;</button>
  </div>
</div>`);
  }

  async function doRecordPayment(id) {
    if (!UI.rq('pay-am') || !UI.rq('pay-dt')) return;
    const btn = document.querySelector('.modal .bp');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await API.post('payment', {
        invoiceId: id, amount: UI.gv('pay-am'),
        date: UI.gv('pay-dt'), reference: UI.gv('pay-ref')
      });
      UI.closeModal(); UI.toast('Payment recorded ✓', 'g');
      await render();
    } catch(e) {
      UI.toast(e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = 'Mark as Paid ✓'; }
    }
  }

  // ── HELPERS ───────────────────────────────────────────────────
  function _n(v) { return parseFloat(v) || 0; }
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function _fmtMonth(m) {
    if (!m) return '—';
    const d = new Date(m + '-01');
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { month:'short', year:'numeric' });
    return m;
  }

  return {
    render, _tab, _setMonth, _highlightTab, _txnTypeChange,
    _exportCSV, _exportTransactionsCSV, _exportInvoicesCSV,
    openAddTransaction, saveTransaction,
    openNewInvoice, saveInvoice, openSendInvoice, doSendInvoice,
    openRecordPayment, doRecordPayment
  };
})();
