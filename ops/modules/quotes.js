// ============================================================
// AskMiro Ops — modules/quotes.js
// ============================================================
const Quotes = (() => {
  let _quotes = [];
  let _filter = 'all'; // 'all' | 'web'

  async function render() {
    const app = document.getElementById('main-content');
    try { _quotes = await API.get('quotes'); } catch(e) { _quotes = []; }
    updateBadge();

    const webDrafts = _quotes.filter(q => q.source === 'web_form' && q.status === 'Draft');
    const filtered  = _filter === 'web' ? webDrafts : _quotes;

    const rows = filtered.map(q => {
      const m = parseFloat(q.grossMarginPct||0);
      const isWebDraft = q.source === 'web_form' && q.status === 'Draft';
      return `<tr onclick='Quotes.openView(${JSON.stringify(JSON.stringify(q))})' style="${isWebDraft?'background:rgba(13,148,136,.04);':''}">
        <td class="tmn">${q.id}${isWebDraft ? ' <span style="font-size:10px;background:#0D9488;color:#fff;padding:1px 6px;border-radius:10px;vertical-align:middle">Intel</span>' : ''}</td>
        <td>v${q.version||1}</td>
        <td class="tfw">${q.clientName}</td>
        <td style="font-size:12px">${q.siteAddress||'&#8212;'}</td>
        <td>${UI.fmt(q.revenueMonthly||0)}/mo</td>
        <td>${UI.pill(UI.fmtPct(m), UI.ragCls(m, CFG.MIN_MARGIN_PCT+5, CFG.MIN_MARGIN_PCT))}</td>
        <td>${UI.statusPill(q.status)}</td>
        <td>${q.createdAt?q.createdAt.slice(0,10):'&#8212;'}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--ll);padding:24px">No quotes${_filter==='web'?' from web form':''} yet</td></tr>`;

    // Filter tabs
    const tabAll = `<button onclick="Quotes.setFilter('all')" style="font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid ${_filter==='all'?'#0D9488':'var(--bd)'};background:${_filter==='all'?'#0D9488':'transparent'};color:${_filter==='all'?'#fff':'var(--sl)'};cursor:pointer;font-weight:600">All (${_quotes.length})</button>`;
    const tabWeb  = `<button onclick="Quotes.setFilter('web')" style="font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid ${_filter==='web'?'#0D9488':'var(--bd)'};background:${_filter==='web'?'#0D9488':'transparent'};color:${_filter==='web'?'#fff':'var(--sl)'};cursor:pointer;font-weight:600">&#9656; Web Leads${webDrafts.length>0?' ('+webDrafts.length+')':''}</button>`;

    app.innerHTML = `
${UI.secHd('Quotes', 'Quote Builder', _quotes.length + ' quotes')}
<div class="gql">
  <div>
    ${UI.secHd('Builder', 'New Quote')}
    <div class="card mb16"><div class="card-body" style="padding-top:14px">
      <div class="fr"><div class="fg"><label class="fl">Client Name <span class="req">*</span></label><input class="fin" id="q-cl" placeholder="Company name" oninput="Quotes.calc()"></div>
      <div class="fg"><label class="fl">Site Address <span class="req">*</span></label><input class="fin" id="q-sa" placeholder="Building, area" oninput="Quotes.calc()"></div></div>
      <div class="fr"><div class="fg"><label class="fl">Segment</label><select class="fse" id="q-sg"><option>Office</option><option>Healthcare</option><option>School</option><option>Gym</option><option>Industrial</option></select></div>
      <div class="fg"><label class="fl">Mode</label><select class="fse" id="q-md" onchange="Quotes.toggleMode()"><option value="hourly">Hourly Rate</option><option value="fixed">Fixed Monthly</option></select></div></div>
      <div id="q-hourly-block"><div class="fr3">
        <div class="fg"><label class="fl">Hrs/week</label><input class="fin" id="q-hw" type="number" value="20" min="1" oninput="Quotes.calc()"></div>
        <div class="fg"><label class="fl">Days/week</label><select class="fse" id="q-dw" onchange="Quotes.calc()"><option value="5">5</option><option value="3">3</option><option value="7">7</option><option value="2">2</option></select></div>
        <div class="fg"><label class="fl">Client Rate (&#163;/hr)</label><input class="fin" id="q-cr" type="number" value="18.50" step="0.50" oninput="Quotes.calc()"></div>
      </div></div>
      <div id="q-fixed-block" style="display:none"><div class="fg"><label class="fl">Fixed Monthly Fee (&#163;)</label><input class="fin" id="q-fm" type="number" placeholder="5000" oninput="Quotes.calc()"></div></div>
      <div class="fr"><div class="fg"><label class="fl">Supplies/month (&#163;)</label><input class="fin" id="q-sp" type="number" value="200" oninput="Quotes.calc()"></div>
      <div class="fg"><label class="fl">Other Costs/month (&#163;)</label><input class="fin" id="q-oc" type="number" value="0" oninput="Quotes.calc()"></div></div>
      <div class="fg"><label class="fl">LLW Rate (&#163;/hr) — auto from settings</label><input class="fin" id="q-lw" type="number" value="13.85" step="0.01" oninput="Quotes.calc()"></div>
      <div class="fg"><label class="fl">Notes</label><textarea class="fta" id="q-nt" placeholder="Scope, access notes, special requirements&#8230;"></textarea></div>
      <div class="modal-foot" style="margin-top:0"><button class="btn bp" onclick="Quotes.save()">Save as Draft</button></div>
    </div></div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      ${UI.secHd('History', 'Recent Quotes', filtered.length + ' shown')}
      <div style="display:flex;gap:6px;flex-shrink:0">${tabAll}${tabWeb}</div>
    </div>

    <div class="card"><div class="card-body" style="padding-top:12px"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>ID</th><th>v</th><th>Client</th><th>Site</th><th>Revenue/mo</th><th>Margin</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div></div>
  </div>
  <div>
    ${UI.secHd('Margin', 'Live Calculator')}
    <div id="q-result"></div>
    <div style="margin-top:14px;font-size:12px;color:var(--ll);background:var(--of);padding:10px;border-radius:var(--rs);line-height:1.7">
      <strong>LLW Rate:</strong> &#163;13.85/hr &nbsp;&middot;&nbsp; <strong>On-costs:</strong> 36% &nbsp;&middot;&nbsp; <strong>Min margin:</strong> ${CFG.MIN_MARGIN_PCT}%<br>
      <span style="font-size:10.5px">These drive all calculations. Update in Admin &#8594; Settings.</span>
    </div>
  </div>
</div>`;
    setTimeout(() => calc(), 50);
  }

  function setFilter(f) {
    _filter = f;
    render();
  }

  function toggleMode() {
    const m = document.getElementById('q-md')?.value;
    const hb = document.getElementById('q-hourly-block');
    const fb = document.getElementById('q-fixed-block');
    if (hb) hb.style.display = m === 'fixed' ? 'none' : '';
    if (fb) fb.style.display = m === 'fixed' ? '' : 'none';
    calc();
  }

  function calc() {
    const mode = document.getElementById('q-md')?.value || 'hourly';
    const hrs = parseFloat(document.getElementById('q-hw')?.value) || 0;
    const rate = parseFloat(document.getElementById('q-cr')?.value) || 0;
    const llw = parseFloat(document.getElementById('q-lw')?.value) || 13.85;
    const supplies = parseFloat(document.getElementById('q-sp')?.value) || 0;
    const other = parseFloat(document.getElementById('q-oc')?.value) || 0;
    const fixedMonthly = parseFloat(document.getElementById('q-fm')?.value) || 0;
    const wpm = 52/12;
    const labour = hrs * wpm * llw * 1.36;
    const rev = mode === 'fixed' ? fixedMonthly : hrs * wpm * rate;
    const direct = labour + supplies + other;
    const gm = rev - direct;
    const gmPct = rev > 0 ? gm / rev * 100 : 0;
    const col = gmPct >= CFG.MIN_MARGIN_PCT + 5 ? 'var(--gn)' : gmPct >= CFG.MIN_MARGIN_PCT ? 'var(--am)' : 'var(--rd)';
    const blocked = gmPct < CFG.MIN_MARGIN_PCT;
    const el = document.getElementById('q-result');
    if (!el) return;
    el.innerHTML = `<div class="mp">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
        <span class="mp-pct" style="color:${col}">${gmPct.toFixed(1)}%</span>
        <span style="font-size:12px;color:var(--ll)">gross margin</span>
        <span style="margin-left:auto;font-weight:700">${UI.fmt(rev)}/mo</span>
      </div>
      <div class="mp-bar-wrap"><div class="mp-bar" style="width:${Math.min(Math.max(gmPct/60*100,0),100).toFixed(1)}%;background:${col}"></div></div>
      <div class="mp-row"><span class="mp-lbl">Revenue/month</span><span class="mp-val">${UI.fmt(rev)}</span></div>
      <div class="mp-row"><span class="mp-lbl">Labour cost</span><span class="mp-val">${UI.fmt(labour)}</span></div>
      <div class="mp-row"><span class="mp-lbl">Supplies + Other</span><span class="mp-val">${UI.fmt(supplies+other)}</span></div>
      <div class="mp-row"><span class="mp-lbl">Direct cost total</span><span class="mp-val">${UI.fmt(direct)}</span></div>
      <div class="mp-row"><span class="mp-lbl" style="color:${col}">Gross margin</span><span class="mp-val" style="color:${col}">${UI.fmt(gm)}</span></div>
      <div style="margin-top:10px">
        ${blocked
          ? `<div class="alert alert-r" style="margin:0">&#10007; Below ${CFG.MIN_MARGIN_PCT}% floor &#8212; override required to send</div>`
          : `<div class="alert alert-g" style="margin:0">&#10003; Above minimum margin &#8212; ready to send</div>`}
      </div>
    </div>`;
  }

  async function save() {
    if (!UI.rq('q-cl')) return;
    const mode = document.getElementById('q-md')?.value || 'hourly';
    const body = {
      clientName: UI.gv('q-cl'), siteAddress: UI.gv('q-sa'), segment: UI.gv('q-sg'),
      mode, hoursPerWeek: UI.gv('q-hw'), hourlyRate: UI.gv('q-cr'),
      fixedMonthly: UI.gv('q-fm'), suppliesCost: UI.gv('q-sp'),
      otherCosts: UI.gv('q-oc'), llwRate: UI.gv('q-lw'), notes: UI.gv('q-nt')
    };
    try {
      const res = await API.post('quote', body);
      UI.toast(`Quote ${res.id} saved${res.marginBlocked ? ' — margin below floor' : ''}`);
      await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function openNew() { document.getElementById('q-cl')?.focus(); }

  function openView(jsonStr) {
    const q = JSON.parse(jsonStr);
    const m = parseFloat(q.grossMarginPct||0);
    const col = m >= CFG.MIN_MARGIN_PCT + 5 ? 'var(--gn)' : m >= CFG.MIN_MARGIN_PCT ? 'var(--am)' : 'var(--rd)';
    const blocked = m < CFG.MIN_MARGIN_PCT && !q.overrideReason;
    const isWebDraft = q.source === 'web_form' && q.status === 'Draft';

    UI.openModal(`<div class="modal-hd">
      <h2>${q.id} v${q.version||1}${isWebDraft ? ' <span style="font-size:11px;background:#0D9488;color:#fff;padding:2px 8px;border-radius:10px;vertical-align:middle;font-family:inherit">◈ Intel</span>' : ''}</h2>
      <button class="xbtn" onclick="UI.closeModal()">&#x2715;</button>
    </div>
<div class="modal-body">
  <div style="border:1px solid var(--bd);border-radius:var(--rs);overflow:hidden;margin-bottom:14px">
    <div style="background:var(--ch);padding:14px 18px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:15px;color:#5EEAD4">AskMiro Cleaning Services</div>
      <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">Proposal for ${q.clientName} &middot; ${q.siteAddress||''}</div>
    </div>
    <div style="padding:14px 18px">
      <div class="mp-row"><span class="mp-lbl">Hours/week</span><span>${q.hoursPerWeek||'&#8212;'}h</span></div>
      <div class="mp-row"><span class="mp-lbl">Monthly Revenue</span><span class="mp-val">${UI.fmt(q.revenueMonthly||0)}</span></div>
      <div class="mp-row"><span class="mp-lbl">Direct Cost</span><span>${UI.fmt(q.directCost||0)}</span></div>
      <div class="mp-row"><span class="mp-lbl" style="color:${col}">Gross Margin</span><span style="color:${col};font-weight:700">${UI.fmtPct(m)} (${UI.fmt(q.grossMarginGBP||0)}/mo)</span></div>
    </div>
  </div>
  ${blocked ? `<div class="alert alert-r" style="margin-bottom:12px">&#9888; Below ${CFG.MIN_MARGIN_PCT}% floor. Owner must approve before sending.</div>` : ''}
  ${q.notes ? `<div style="font-size:13px;color:var(--sl);background:var(--of);padding:8px 10px;border-radius:6px;margin-bottom:12px">${q.notes}</div>` : ''}

  <div id="intel-panel-mount" style="margin-top:16px"></div>

  <div class="modal-foot">
    ${blocked ? `<button class="btn bo" onclick="Quotes.openApprove('${q.id}')">&#9888; Request Approval</button>` : ''}
    <div style="flex:1"></div>
    <button class="btn bo" onclick="UI.closeModal()">Close</button>
    ${!blocked ? `<button class="btn bp" onclick="Quotes.openSend('${q.id}','${q.clientName}')">&#9992; Send Quote</button>` : ''}
  </div>
</div>`);

    // Init Intel Panel for web_form draft quotes
    if (isWebDraft && window.IntelPanel && typeof IntelPanel.init === 'function') {
  const quoteId = q.id;
  const observer = new MutationObserver((mutations, obs) => {
    const mount = document.getElementById('intel-panel-mount');
    if (mount) {
      obs.disconnect();
      IntelPanel.init(quoteId, 'intel-panel-mount');
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Safety timeout — disconnect observer after 5s if mount never appears
  setTimeout(() => observer.disconnect(), 5000);
}

  function openSend(id, clientName) {
    UI.openModal(`<div class="modal-hd"><h2>Send Quote</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fg"><label class="fl">Recipient Email <span class="req">*</span></label><input class="fin" id="sq-email" type="email" placeholder="client@company.com"></div>
  <div class="fg"><label class="fl">Message (optional)</label><textarea class="fta" id="sq-msg" placeholder="Additional notes to include&#8230;"></textarea></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Quotes.doSend('${id}')">&#9992; Send</button></div>
</div>`);
  }

  async function doSend(id) {
    if (!UI.rq('sq-email')) return;
    try {
      await API.post('quote.send', { id, toEmail: UI.gv('sq-email'), message: UI.gv('sq-msg') });
      UI.closeModal(); UI.toast('Quote sent successfully');
      await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function openApprove(id) {
    UI.openModal(`<div class="modal-hd"><h2>Request Margin Override</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="alert alert-a">&#9888; This quote is below the ${CFG.MIN_MARGIN_PCT}% margin floor. Provide a business reason to override.</div>
  <div class="fg"><label class="fl">Override Reason <span class="req">*</span></label><textarea class="fta" id="ov-reason" placeholder="e.g. Strategic client, loss-leader for portfolio expansion&#8230;"></textarea></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Quotes.doApprove('${id}')">Submit for Approval</button></div>
</div>`);
  }

  async function doApprove(id) {
    if (!UI.rq('ov-reason')) return;
    try {
      await API.post('quote.approve', { id, overrideReason: UI.gv('ov-reason') });
      UI.closeModal(); UI.toast('Approval submitted');
      await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  function updateBadge() {
    // Badge shows web_form drafts specifically — these need action
    const n = _quotes.filter(q => q.source === 'web_form' && q.status === 'Draft').length;
    const el = document.getElementById('badge-quotes');
    if (el) { el.textContent = n; el.style.display = n > 0 ? '' : 'none'; }
  }

  return { render, calc, toggleMode, save, openNew, openView, openSend, doSend, openApprove, doApprove, setFilter };
})();
