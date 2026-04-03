// ============================================================
// AskMiro Ops — modules/quotes.js  (PRODUCTION-HARDENED)
// - No double JSON stringify hacks
// - Delegated row click
// - IntelPanel init is robust + GLOBAL-safe (window.IntelPanel only)
// - Avoids ?? / optional chaining to prevent "Unexpected token" in older parsers
// - Exposes Quotes to window for module environments
// ============================================================
window.Quotes = (() => {
  let _quotes = [];
  let _filter = 'all'; // 'all' | 'web'
  let _byId = {};      // id -> quote

  // --- tiny helpers ---
  function _escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function _safeText(s, fallback) {
    return (s === null || s === undefined || s === '') ? (fallback || '') : String(s);
  }

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

  function _bindTableClicks() {
    const table = document.getElementById('quotes-table');
    if (!table) return;
    if (table.__bound) return;
    table.__bound = true;

    table.addEventListener('click', (e) => {
      const tr = e.target && e.target.closest ? e.target.closest('tr.q-row') : null;
      if (!tr) return;
      const id = tr.getAttribute('data-qid');
      if (!id) return;
      openViewById(id);
    });
  }

  function setFilter(f) { _filter = f; render(); }

  function toggleMode() {
    const mEl = document.getElementById('q-md');
    const m = mEl ? mEl.value : 'hourly';
    const hb = document.getElementById('q-hourly-block');
    const fb = document.getElementById('q-fixed-block');
    if (hb) hb.style.display = (m === 'fixed') ? 'none' : '';
    if (fb) fb.style.display = (m === 'fixed') ? '' : 'none';
    calc();
  }

  function calc() {
    const modeEl = document.getElementById('q-md');
    const mode = modeEl ? modeEl.value : 'hourly';

    const hrs = parseFloat((document.getElementById('q-hw') || {}).value) || 0;
    const rate = parseFloat((document.getElementById('q-cr') || {}).value) || 0;
    const llw = parseFloat((document.getElementById('q-lw') || {}).value) || 13.85;
    const supplies = parseFloat((document.getElementById('q-sp') || {}).value) || 0;
    const other = parseFloat((document.getElementById('q-oc') || {}).value) || 0;
    const fixedMonthly = parseFloat((document.getElementById('q-fm') || {}).value) || 0;

    const wpm = 52 / 12;
    const labour = hrs * wpm * llw * 1.36;
    const rev = (mode === 'fixed') ? fixedMonthly : (hrs * wpm * rate);
    const direct = labour + supplies + other;

    const gm = rev - direct;
    const gmPct = rev > 0 ? (gm / rev * 100) : 0;

    const col = (gmPct >= CFG.MIN_MARGIN_PCT + 5) ? 'var(--gn)'
      : (gmPct >= CFG.MIN_MARGIN_PCT) ? 'var(--am)' : 'var(--rd)';

    const blocked = gmPct < CFG.MIN_MARGIN_PCT;
    const el = document.getElementById('q-result');
    if (!el) return;

    el.innerHTML = `
<div class="mp">
  <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
    <span class="mp-pct" style="color:${col}">${gmPct.toFixed(1)}%</span>
    <span style="font-size:12px;color:var(--ll)">gross margin</span>
    <span style="margin-left:auto;font-weight:700">${UI.fmt(rev)}/mo</span>
  </div>

  <div class="mp-bar-wrap">
    <div class="mp-bar" style="width:${Math.min(Math.max(gmPct / 60 * 100, 0), 100).toFixed(1)}%;background:${col}"></div>
  </div>

  <div class="mp-row"><span class="mp-lbl">Revenue/month (ex. VAT)</span><span class="mp-val">${UI.fmt(rev)}</span></div>
  <div class="mp-row"><span class="mp-lbl">Revenue/month (inc. VAT)</span><span class="mp-val" style="color:#64748B">${UI.fmt(rev * 1.2)}</span></div>
  <div class="mp-row"><span class="mp-lbl">Labour cost</span><span class="mp-val">${UI.fmt(labour)}</span></div>
  <div class="mp-row"><span class="mp-lbl">Supplies + Other</span><span class="mp-val">${UI.fmt(supplies + other)}</span></div>
  <div class="mp-row"><span class="mp-lbl">Direct cost total</span><span class="mp-val">${UI.fmt(direct)}</span></div>
  <div class="mp-row"><span class="mp-lbl" style="color:${col}">Gross margin</span><span class="mp-val" style="color:${col}">${UI.fmt(gm)}</span></div>

  <div style="margin-top:10px">
    ${blocked
      ? `<div class="alert alert-r" style="margin:0">&#10007; Below ${CFG.MIN_MARGIN_PCT}% floor &#8212; override required to send</div>`
      : `<div class="alert alert-g" style="margin:0">&#10003; Above minimum margin &#8212; ready to send</div>`}
  </div>
</div>`.trim();
  }

  async function save() {
    if (!UI.rq('q-cl')) return;
    const modeEl = document.getElementById('q-md');
    const mode = modeEl ? modeEl.value : 'hourly';

    const body = {
      clientName: UI.gv('q-cl'),
      siteAddress: UI.gv('q-sa'),
      segment: UI.gv('q-sg'),
      mode: mode,
      hoursPerWeek: UI.gv('q-hw'),
      hourlyRate: UI.gv('q-cr'),
      fixedMonthly: UI.gv('q-fm'),
      suppliesCost: UI.gv('q-sp'),
      otherCosts: UI.gv('q-oc'),
      llwRate: UI.gv('q-lw'),
      oncostPct: 0.36,
      notes: UI.gv('q-nt')
    };

    try {
      const res = await API.post('quote', body);
      UI.toast(`Quote ${res.id} saved${res.marginBlocked ? ' — margin below floor' : ''}`);
      await render();
    } catch (e) {
      UI.toast(e.message, 'r');
    }
  }

  function openNew() {
    const el = document.getElementById('q-cl');
    if (el) el.focus();
  }

  function loadIntoBuilder(qJson) {
    const q = typeof qJson === 'string' ? JSON.parse(qJson) : qJson;
    UI.closeModal();
    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
    set('q-cl', q.clientName);
    set('q-sa', q.siteAddress);
    set('q-sg', q.segment);
    set('q-md', q.mode || 'hourly');
    set('q-hw', q.hoursPerWeek);
    set('q-cr', q.hourlyRate);
    set('q-fm', q.fixedMonthly);
    set('q-sp', q.suppliesCost);
    set('q-oc', q.otherCosts);
    set('q-lw', q.llwRate || 13.85);
    set('q-nt', q.notes);
    toggleMode();
    calc();
    // Scroll builder into view
    const builder = document.getElementById('q-cl');
    if (builder) builder.scrollIntoView({ behavior: 'smooth', block: 'center' });
    UI.toast(`Loaded ${q.id} into builder — edit and save as new version`);
  }

  // --- staff helper ---
  function _staffCount(hoursPerWeek, visitsPerWeek) {
    const h = parseFloat(hoursPerWeek) || 0;
    const v = parseFloat(visitsPerWeek) || 1;
    if (h <= 0) return 1;
    const hrsPerVisit = h / (v || 1);
    return Math.max(1, Math.ceil(hrsPerVisit / 8));
  }

  // --- IntelPanel init (GLOBAL-safe) ---
  function _initIntelPanel(quoteId) {
    let attempts = 0;
    const poll = setInterval(function () {
      attempts++;

      const mount = document.getElementById('intel-panel-mount');
      const panel = window.IntelPanel; // ONLY global access
      const panelReady = !!panel && typeof panel.init === 'function';

      if (mount && panelReady) {
        clearInterval(poll);
        try {
          panel.init(quoteId, 'intel-panel-mount');
        } catch (e) {
          console.error('IntelPanel.init failed:', e);
          mount.innerHTML = `<div class="alert alert-r">IntelPanel error: ${_escHtml(e.message || e)}</div>`;
        }
        return;
      }

      if (attempts === 20) {
        if (!mount) console.warn('IntelPanel: mount missing (#intel-panel-mount)');
        if (!panelReady) console.warn('IntelPanel: window.IntelPanel not ready');
      }

      if (attempts >= 120) {
        clearInterval(poll);
      }
    }, 50);
  }

  function openViewById(id) {
    const q = _byId[id];
    if (!q) {
      UI.toast('Quote not found (stale list). Refreshing…', 'a');
      return render();
    }
    openView(q);
  }

  function openView(q) {
    const m = parseFloat(q.grossMarginPct || 0);
    const col = (m >= CFG.MIN_MARGIN_PCT + 5) ? 'var(--gn)' : (m >= CFG.MIN_MARGIN_PCT) ? 'var(--am)' : 'var(--rd)';
    const blocked = (m < CFG.MIN_MARGIN_PCT) && !q.overrideReason;
    const isWebDraft = (q.source === 'web_form' && q.status === 'Draft');

    const hpw = (q.intel_hoursPerWeek !== undefined && q.intel_hoursPerWeek !== null) ? q.intel_hoursPerWeek : q.hoursPerWeek;
    const vpw = (q.intel_visitsPerWeek !== undefined && q.intel_visitsPerWeek !== null) ? q.intel_visitsPerWeek : 1;

    const staffNeeded = isWebDraft ? _staffCount(hpw, vpw) : null;

    const clientNameSafe = _escHtml(_safeText(q.clientName, ''));
    const siteSafe = _escHtml(_safeText(q.siteAddress, ''));

    UI.openModal(`
<div class="modal-hd">
  <h2>${_escHtml(q.id)} v${_escHtml(q.version || 1)}${isWebDraft ? ' <span style="font-size:11px;background:#0D9488;color:#fff;padding:2px 8px;border-radius:10px;vertical-align:middle;font-family:inherit">&#9672; Intel</span>' : ''}</h2>
  <button class="xbtn" onclick="UI.closeModal()">&#x2715;</button>
</div>

<div class="modal-body">
  <div style="border:1px solid var(--bd);border-radius:var(--rs);overflow:hidden;margin-bottom:14px">
    <div style="background:var(--ch);padding:14px 18px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:15px;color:#5EEAD4">AskMiro Cleaning Services</div>
      <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">Proposal for ${clientNameSafe} &middot; ${siteSafe}</div>
    </div>
    <div style="padding:14px 18px">
      <div class="mp-row"><span class="mp-lbl">Hours/week</span><span>${_escHtml(_safeText(q.hoursPerWeek, '&#8212;'))}h</span></div>
      ${staffNeeded ? `<div class="mp-row"><span class="mp-lbl">Staff needed</span><span style="font-weight:600">${staffNeeded} cleaner${staffNeeded > 1 ? 's' : ''}</span></div>` : ''}
      <div class="mp-row"><span class="mp-lbl">Monthly Revenue</span><span class="mp-val">${UI.fmt(q.revenueMonthly || 0)}</span></div>
      <div class="mp-row"><span class="mp-lbl">Direct Cost</span><span>${UI.fmt(q.directCost || 0)}</span></div>
      <div class="mp-row"><span class="mp-lbl" style="color:${col}">Gross Margin</span><span style="color:${col};font-weight:700">${UI.fmtPct(m)} (${UI.fmt(q.grossMarginGBP || 0)}/mo)</span></div>
    </div>
  </div>

  ${blocked ? `<div class="alert alert-r" style="margin-bottom:12px">&#9888; Below ${CFG.MIN_MARGIN_PCT}% floor. Owner must approve before sending.</div>` : ''}
  ${q.notes ? `<div style="font-size:13px;color:var(--sl);background:var(--of);padding:8px 10px;border-radius:6px;margin-bottom:12px">${_escHtml(q.notes)}</div>` : ''}

  <div id="intel-panel-mount" style="margin-top:16px"></div>

  <div class="modal-foot">
    ${blocked ? `<button class="btn bo" onclick="Quotes.openApprove('${_escHtml(q.id)}')">&#9888; Request Approval</button>` : ''}
    <div style="flex:1"></div>
    <button class="btn bo" onclick="UI.closeModal()">Close</button>
    <button class="btn bo" onclick="Quotes.loadIntoBuilder(${JSON.stringify(JSON.stringify(q))})">&#9998; Edit</button>
    ${!blocked ? `
    <button class="btn bo" onclick="Quotes._sendProposal(${JSON.stringify(JSON.stringify(q))})" style="border-color:#0D9488;color:#0D9488">&#9993; Send Proposal</button>
    <button class="btn bp" onclick="Quotes.openSend('${_escHtml(q.id)}','${clientNameSafe}')">&#9992; Send Quote</button>` : ''}
  </div>
</div>`.trim());

    if (isWebDraft) _initIntelPanel(q.id);
  }

  function openSend(id, clientName) {
    UI.openModal(`
<div class="modal-hd"><h2>Send Quote</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fg"><label class="fl">Recipient Email <span class="req">*</span></label><input class="fin" id="sq-email" type="email" placeholder="client@company.com"></div>
  <div class="fg"><label class="fl">Message (optional)</label><textarea class="fta" id="sq-msg" placeholder="Additional notes to include&#8230;"></textarea></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Quotes.doSend('${_escHtml(id)}')">&#9992; Send</button></div>
</div>`.trim());
  }

  async function doSend(id) {
    if (!UI.rq('sq-email')) return;
    try {
      await API.post('quote.send', { id: id, toEmail: UI.gv('sq-email'), message: UI.gv('sq-msg') });
      UI.closeModal();
      UI.toast('Quote sent successfully');
      await render();
    } catch (e) {
      UI.toast(e.message, 'r');
    }
  }

  function openApprove(id) {
    UI.openModal(`
<div class="modal-hd"><h2>Request Margin Override</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="alert alert-a">&#9888; This quote is below the ${CFG.MIN_MARGIN_PCT}% margin floor. Provide a business reason to override.</div>
  <div class="fg"><label class="fl">Override Reason <span class="req">*</span></label><textarea class="fta" id="ov-reason" placeholder="e.g. Strategic client, loss-leader for portfolio expansion&#8230;"></textarea></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Quotes.doApprove('${_escHtml(id)}')">Submit for Approval</button></div>
</div>`.trim());
  }

  async function doApprove(id) {
    if (!UI.rq('ov-reason')) return;
    try {
      await API.post('quote.approve', { id: id, overrideReason: UI.gv('ov-reason') });
      UI.closeModal();
      UI.toast('Approval submitted');
      await render();
    } catch (e) {
      UI.toast(e.message, 'r');
    }
  }

  function updateBadge() {
    const n = _quotes.filter(q => q.source === 'web_form' && q.status === 'Draft').length;
    const el = document.getElementById('badge-quotes');
    if (el) {
      el.textContent = n;
      el.style.display = n > 0 ? '' : 'none';
    }
  }

  // ── SEND PROPOSAL — routes to Email module with pre-filled data ───
  function _sendProposal(jsonStr) {
    const q = JSON.parse(jsonStr);
    UI.closeModal();
    // Store prefill data for Email module to pick up
    window._emailPrefill = {
      to:       q.email || q.contactEmail || '',
      name:     q.clientName || '',
      template: 'Proposal / Quote',
      fields: {
        name:   q.clientName || '',
        site:   q.siteAddress || '',
        amount: String(Math.round(q.revenueMonthly || 0)),
        visits: q.visitsPerWeek || '',
        days:   '',
        hours:  q.hoursPerWeek || '',
        areas:  '',
      }
    };
    if (window.Router) Router.navigate('email');
    UI.toast('Opening Email → Proposal / Quote template', 'g');
  }

  return {
    render, calc, toggleMode, save, openNew,
    openView, openSend, doSend, openApprove, doApprove,
    setFilter, openViewById, _sendProposal, loadIntoBuilder,
  };
})();

// ✅ Make it work in module/bundled environments
try { window.Quotes = Quotes; } catch (e) {}
