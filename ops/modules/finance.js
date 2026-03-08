window.Finance = (() => {
  async function render() {
    const app = document.getElementById('main-content');
    app.innerHTML = `<div style="padding:40px;text-align:center;color:var(--ll)"><div class="spinner" style="margin:0 auto 12px"></div>Loading finance data…</div>`;

    let finance = [], invoices = [];
    try {
      // Parallel fetch — both calls at once
      [finance, invoices] = await Promise.all([
        API.get('finance'),
        API.get('invoices')
      ]);
    } catch(e) {
      UI.toast('Could not load finance data: ' + e.message, 'a');
    }

    const totRev = finance.reduce((s,r) => s + parseFloat(r.revenue||0), 0);
    const totCost = finance.reduce((s,r) => s + parseFloat(r.directCost||0), 0);
    const totGM = totRev - totCost;
    const totMgn = totRev > 0 ? totGM/totRev*100 : 0;
    const outstanding = invoices
      .filter(i => i.status==='Sent' || i.status==='Overdue')
      .reduce((s,i) => s + parseFloat(i.amount||0), 0);

    const fRows = finance.map(r => {
      const dc=parseFloat(r.directCost||0), rv=parseFloat(r.revenue||0), gm=rv-dc, gmp=rv>0?gm/rv*100:0;
      return `<tr>
        <td class="tfw">${r.siteId}</td>
        <td>${r.month||'—'}</td>
        <td>${UI.fmt(rv)}</td>
        <td>${UI.fmt(dc)}</td>
        <td>${UI.fmt(gm)}</td>
        <td>${UI.pill(UI.fmtPct(gmp), UI.ragCls(gmp, 45, 30))}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ll);padding:24px">No finance data yet — add rows to the Finance tab in Google Sheets</td></tr>`;

    const invRows = invoices.map(i => `<tr>
      <td class="tmn">${i.id}</td>
      <td>${i.siteId}</td>
      <td>${i.month||'—'}</td>
      <td>${UI.fmt(i.amount||0)}</td>
      <td>${i.dueDate||'—'}</td>
      <td>${UI.statusPill(i.status)}</td>
      <td>${i.status!=='Paid'
        ? `<button class="btn bo btn-xs" onclick="Finance.openSendInvoice('${i.id}')">Send</button>`
        : ''}</td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ll);padding:24px">No invoices yet</td></tr>`;

    app.innerHTML = `
${UI.secHd('Finance', 'Revenue & Invoicing')}
<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px">
  <div class="kpi kpi-g"><div class="kpi-label">Total Revenue</div><div class="kpi-value">${UI.fmtk(totRev)}</div></div>
  <div class="kpi kpi-${UI.ragCls(totMgn,45,30)}"><div class="kpi-label">Portfolio Margin</div><div class="kpi-value">${UI.fmtPct(totMgn)}</div></div>
  <div class="kpi kpi-${outstanding>10000?'r':'a'}"><div class="kpi-label">Outstanding</div><div class="kpi-value">${UI.fmtk(outstanding)}</div></div>
  <div class="kpi kpi-g"><div class="kpi-label">Gross Margin £</div><div class="kpi-value">${UI.fmtk(totGM)}</div></div>
</div>

${UI.secHd('P&L', 'Revenue by Site')}
<div class="card mb16">
  <div class="card-body" style="padding-top:12px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Site</th><th>Month</th><th>Revenue</th><th>Direct Cost</th><th>Gross Margin £</th><th>Margin %</th></tr></thead>
      <tbody>${fRows}</tbody>
    </table></div>
  </div>
</div>

${UI.secHd('Invoices', 'Invoice Tracker')}
<div class="fb"><div class="sp"></div><button class="btn bp" onclick="Finance.openNewInvoice()">+ Create Invoice</button></div>
<div class="card">
  <div class="card-body" style="padding-top:12px">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Invoice ID</th><th>Site</th><th>Month</th><th>Amount</th><th>Due Date</th><th>Status</th><th></th></tr></thead>
      <tbody>${invRows}</tbody>
    </table></div>
  </div>
</div>`;
  }

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
      if (btn) { btn.disabled = false; btn.textContent = '✈ Send'; }
    }
  }

  return { render, openNewInvoice, saveInvoice, openSendInvoice, doSendInvoice };
})();
