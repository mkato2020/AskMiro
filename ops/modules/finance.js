// ============================================================
// AskMiro Ops — modules/finance.js
// Reads from Railway Postgres via /api/finance/*
// ============================================================
window.Finance = (() => {

  const OS = () => (window.CFG && window.CFG.OS_URL) || 'https://askmiro-api-production.up.railway.app';

  async function _fetch(path) {
    const res = await fetch(OS() + path);
    if (!res.ok) throw new Error('API error ' + res.status);
    return res.json();
  }

  async function render() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = '<div style="padding:40px;text-align:center;color:#94A3B8">Loading finance…</div>';

    let overview, invoices;
    try {
      [overview, invoices] = await Promise.all([
        _fetch('/api/finance/overview'),
        _fetch('/api/finance/invoices'),
      ]);
    } catch(e) {
      mc.innerHTML = `<div style="padding:40px;color:#DC2626;font-weight:700">⚠ Could not load finance: ${e.message}</div>`;
      return;
    }

    const statusColour = {
      'Paid':    ['#059669','rgba(5,150,105,.1)'],
      'Issued':  ['#0A9688','rgba(10,150,136,.1)'],
      'Draft':   ['#64748B','#F1F5F9'],
      'Overdue': ['#DC2626','rgba(220,38,38,.1)'],
      'Void':    ['#94A3B8','#F1F5F9'],
    };
    function pill(label, colours) {
      const [c, bg] = colours || ['#64748B','#F1F5F9'];
      return `<span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${bg};color:${c}">${label}</span>`;
    }

    const totalRevenue   = parseFloat(overview.total_invoiced || 0);
    const cashReceived   = parseFloat(overview.cash_received  || 0);
    const outstanding    = parseFloat(overview.outstanding    || 0);
    const overdue        = parseFloat(overview.overdue_total  || 0);

    const invRows = (invoices || []).map(inv => {
      const sc = statusColour[inv.status] || ['#64748B','#F1F5F9'];
      const items = (inv.line_items_json || []).map(li => li.description).join('; ') || '—';
      return `<tr>
        <td style="font-weight:600;color:#0F172A;font-size:12px">${inv.invoice_number || '—'}</td>
        <td style="font-weight:600">${inv.customer_name || '—'}</td>
        <td style="font-size:12px;color:#64748B;max-width:240px;white-space:normal">${items}</td>
        <td style="font-size:12px;color:#64748B">${inv.invoice_date || '—'}</td>
        <td style="font-weight:700">£${parseFloat(inv.total_gross||0).toFixed(2)}</td>
        <td>${pill(inv.status || '—', sc)}</td>
        <td style="font-size:12px;color:#64748B">${parseFloat(inv.amount_paid||0) > 0 ? '£'+parseFloat(inv.amount_paid).toFixed(2) : '—'}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" style="text-align:center;padding:32px;color:#94A3B8">No invoices yet</td></tr>`;

    mc.innerHTML = `
${UI.secHd('Finance', 'Revenue & Invoices', new Date().getFullYear())}
<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
  <div class="kpi kpi-g"><div class="kpi-label">Total Invoiced</div><div class="kpi-value">${UI.fmtk(totalRevenue)}</div></div>
  <div class="kpi kpi-g"><div class="kpi-label">Cash Received</div><div class="kpi-value">${UI.fmtk(cashReceived)}</div></div>
  <div class="kpi kpi-${outstanding > 0 ? 'a' : 'g'}"><div class="kpi-label">Outstanding</div><div class="kpi-value">${UI.fmtk(outstanding)}</div></div>
  <div class="kpi kpi-${overdue > 0 ? 'r' : 'g'}"><div class="kpi-label">Overdue</div><div class="kpi-value">${UI.fmtk(overdue)}</div></div>
</div>

${UI.secHd('Invoices', 'All Invoices', `${(invoices||[]).length} records`)}
<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
  <button class="btn bp" onclick="Finance.openNewInvoice()">+ New Invoice</button>
</div>
<div class="card">
  <div class="card-body" style="padding-top:12px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Invoice #</th><th>Client</th><th>Description</th>
        <th>Date</th><th>Amount</th><th>Status</th><th>Paid</th>
      </tr></thead>
      <tbody>${invRows}</tbody>
    </table></div>
  </div>
</div>`;
  }

  function openNewInvoice() {
    UI.openModal(`
<div class="modal-hd"><h2>New Invoice</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr">
    <div class="fg"><label class="fl">Client Name <span class="req">*</span></label><input class="fin" id="inv-cn" placeholder="e.g. John Smith"></div>
    <div class="fg"><label class="fl">Invoice Date <span class="req">*</span></label><input class="fin" id="inv-dt" type="date" value="${UI.today()}"></div>
  </div>
  <div class="fg"><label class="fl">Description <span class="req">*</span></label><input class="fin" id="inv-ds" placeholder="e.g. End of Tenancy Cleaning — 3 bed"></div>
  <div class="fr">
    <div class="fg"><label class="fl">Amount (£) <span class="req">*</span></label><input class="fin" id="inv-am" type="number" placeholder="0.00" step="0.01"></div>
    <div class="fg"><label class="fl">Payment Terms (days)</label><input class="fin" id="inv-pt" type="number" placeholder="0" value="0"></div>
  </div>
  <div class="modal-foot">
    <button class="btn bo" onclick="UI.closeModal()">Cancel</button>
    <button class="btn bp" onclick="Finance.saveInvoice()">Create Invoice</button>
  </div>
</div>`);
  }

  async function saveInvoice() {
    const cn = UI.gv('inv-cn'), ds = UI.gv('inv-ds'), am = UI.gv('inv-am'), dt = UI.gv('inv-dt');
    if (!cn || !ds || !am) { UI.toast('Fill in all required fields', 'r'); return; }
    try {
      const res = await fetch(OS() + '/api/finance/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: cn,
          invoice_date: dt,
          payment_terms: parseInt(UI.gv('inv-pt')) || 0,
          line_items: [{ description: ds, amount_net: parseFloat(am) }],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      UI.closeModal();
      UI.toast('Invoice created', 'g');
      await render();
    } catch(e) { UI.toast('Error: ' + e.message, 'r'); }
  }

  return { render, openNewInvoice, saveInvoice };
})();
