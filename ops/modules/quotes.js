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
  function _timeAgo(iso) {
    if (!iso) return '';
    var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60)   return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  // ── Auto-refresh every 60s while Quotes page is open ─────────
  let _refreshTimer = null;
  function _startAutoRefresh() {
    _stopAutoRefresh();
    _refreshTimer = setInterval(function() {
      // Only silently refresh — don't flash loader
      API.invalidate && API.invalidate('quotes');
      render();
    }, 60000);
  }
  function _stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }

  async function render() {
    const mc = document.getElementById('main-content');
    UI.setLoading(true);
    _stopAutoRefresh();

    let qs = [];
    try {
      qs = await API.get('quotes');
    } catch(e) {
      mc.innerHTML = '<div class="alert alert-r" style="margin:32px 24px">Failed to load quotes: ' + _escHtml(e.message) + '</div>';
      UI.setLoading(false);
      return;
    }

    _quotes = Array.isArray(qs) ? qs : [];
    _byId   = {};
    _quotes.forEach(function(q) { _byId[q.id] = q; });
    updateBadge();
    _startAutoRefresh();

    // Priority items = web quotes (Draft or NEW LEAD).
    // isWebQuote is set server-side using multiple signals in case the
    // 'source' column doesn't exist in older Quotes sheets.
    const webDrafts   = _quotes.filter(function(q) {
      const isWeb = q.isWebQuote || q.source === 'web_form' || q.createdBy === 'INTEL';
      return isWeb && (q.status === 'Draft' || q.status === 'NEW LEAD');
    });
    const allFiltered = _filter === 'web'  ? webDrafts
                      : _filter === 'all'  ? _quotes
                      : _quotes.filter(function(q) { return (q.status || '') === _filter; });

    // ── PRIORITY BANNER: website requests ─────────────────────
    let webHtml = '';
    if (webDrafts.length) {
      webHtml = '<div style="background:#FFF7ED;border:1.5px solid #FED7AA;border-radius:12px;padding:16px 20px;margin-bottom:24px">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
        + '<span style="background:#F97316;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.04em">&#9889; WEBSITE REQUESTS</span>'
        + '<span style="font-size:12px;color:#9A3412;font-weight:600">'
        + webDrafts.length + ' new request' + (webDrafts.length !== 1 ? 's' : '') + ' — respond within the hour'
        + '</span>'
        + '</div>'
        + webDrafts.map(function(q) {
            const isNewLead = q.status === 'NEW LEAD' || q._isLeadOnly;
            const dc   = parseFloat(q.intel_directCostPM) || 0;
            const balR = dc > 0 ? Math.round(dc / 0.75) : 0;
            const rc   = parseInt(q.intel_riskCount) || 0;
            const rCol = rc >= 2 ? '#DC2626' : rc === 1 ? '#D97706' : '#059669';
            const rBg  = rc >= 2 ? '#FEF2F2' : rc === 1 ? '#FFFBEB' : '#ECFDF5';
            const rLbl = rc >= 2 ? rc + ' risks' : rc === 1 ? '1 risk' : 'Low risk';
            const ageBadge = q.createdAt ? '<span style="font-size:10px;color:#94A3B8;margin-left:8px">' + _timeAgo(q.createdAt) + '</span>' : '';
            const subLine = [
              q.siteAddress ? _escHtml(q.siteAddress) : '',
              q.serviceType ? _escHtml(q.serviceType) : '',
              q.frequency   ? _escHtml(q.frequency)   : '',
              q.intel_hoursPerWeek ? q.intel_hoursPerWeek + 'h/wk' : ''
            ].filter(Boolean).join(' &bull; ');
            const actionBtn = isNewLead
              ? '<button class="btn bp btn-sm" style="background:#F97316;border-color:#F97316" onclick="event.stopPropagation();Quotes.runIntel(\'' + _escHtml(q.id) + '\')">&#9889; Run Intel</button>'
              : '<button class="btn bp btn-sm" onclick="event.stopPropagation();Quotes.openViewById(\'' + _escHtml(q.id) + '\')">Review &#8594;</button>';
            const clickFn = isNewLead ? '' : 'Quotes.openViewById(\'' + _escHtml(q.id) + '\')';
            return '<div ' + (clickFn ? 'onclick="' + clickFn + '"' : '') + ' '
              + 'style="background:#fff;border:1.5px solid ' + (isNewLead ? '#FCA5A5' : '#FED7AA') + ';border-radius:8px;padding:14px 16px;'
              + 'margin-bottom:10px;display:flex;align-items:center;gap:14px;' + (clickFn ? 'cursor:pointer;' : '')
              + 'transition:box-shadow .15s" '
              + (clickFn ? 'onmouseenter="this.style.boxShadow=\'0 4px 16px rgba(249,115,22,.15)\'" onmouseleave="this.style.boxShadow=\'none\'"' : '') + '>'
              + '<div style="flex-shrink:0;width:36px;height:36px;border-radius:8px;background:' + (isNewLead ? '#FEF2F2' : '#FFF7ED') + ';display:flex;align-items:center;justify-content:center;font-size:16px">'
              + (isNewLead ? '&#128274;' : '&#9889;') + '</div>'
              + '<div style="flex:1;min-width:0">'
              + '<div style="font-weight:700;font-size:14px;color:#1E293B;margin-bottom:2px">'
              + _escHtml(_safeText(q.clientName, '(name not provided)'))
              + (isNewLead ? ' <span style="font-size:10px;background:#DC2626;color:#fff;padding:1px 7px;border-radius:10px;font-weight:700;vertical-align:middle">NEW</span>' : '')
              + ageBadge + '</div>'
              + '<div style="font-size:12px;color:#64748B">' + (subLine || 'No details yet') + '</div>'
              + (isNewLead ? '<div style="font-size:11px;color:#DC2626;font-weight:600;margin-top:3px">&#9888; No Intel quote yet — click Run Intel to price this lead</div>' : '')
              + '</div>'
              + (balR && !isNewLead ? '<div style="text-align:right;margin-right:4px;min-width:90px">'
                + '<div style="font-size:10px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Balanced est.</div>'
                + '<div style="font-size:17px;font-weight:800;color:#0D9488;letter-spacing:-.02em">&#163;' + balR + '<span style="font-size:11px;font-weight:500">/mo</span></div>'
                + '</div>' : '')
              + (!isNewLead ? '<div style="min-width:64px;text-align:center"><span style="font-size:11px;font-weight:700;color:' + rCol + ';background:' + rBg + ';padding:3px 9px;border-radius:20px">' + rLbl + '</span></div>' : '')
              + actionBtn
              + '</div>';
          }).join('')
        + '</div>';
    }

    // ── ALL QUOTES TABLE ───────────────────────────────────────
    const statusColors = {
      'Draft':    '#94A3B8', 'Sent':     '#0284C7', 'Approved': '#059669',
      'Accepted': '#0D9488', 'Declined': '#DC2626', 'Expired':  '#F59E0B'
    };
    const filterBtns = ['all','web','Draft','Sent','Accepted'].map(function(f) {
      const active = _filter === f;
      return '<button onclick="Quotes.setFilter(\'' + f + '\')" style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;'
        + 'border:1.5px solid ' + (active ? '#0D9488' : '#E2E8F0') + ';'
        + 'background:' + (active ? '#0D9488' : '#fff') + ';'
        + 'color:' + (active ? '#fff' : '#64748B') + '">'
        + (f === 'all' ? 'All (' + _quotes.length + ')' : f === 'web' ? '&#9889; Website (' + webDrafts.length + ')' : f)
        + '</button>';
    }).join('');

    const rows = allFiltered.length
      ? allFiltered.map(function(q) {
          const m    = parseFloat(q.grossMarginPct) || 0;
          const isW  = q.isWebQuote || q.source === 'web_form' || q.createdBy === 'INTEL';
          const mCol = m >= CFG.MIN_MARGIN_PCT + 5 ? '#059669' : m >= CFG.MIN_MARGIN_PCT ? '#D97706' : '#94A3B8';
          const sBg  = statusColors[q.status] || '#94A3B8';
          const hwDisplay = q.hoursPerWeek || q.intel_hoursPerWeek;
          return '<tr class="q-row" data-qid="' + _escHtml(q.id) + '" style="cursor:pointer">'
            + '<td style="font-family:monospace;font-size:12px;color:#64748B">' + _escHtml(q.id) + '</td>'
            + '<td style="font-weight:600;color:#1E293B">' + _escHtml(_safeText(q.clientName, '—'))
            + (isW ? ' <span style="font-size:10px;background:#FED7AA;color:#9A3412;padding:1px 6px;border-radius:10px;font-weight:700">WEB</span>' : '')
            + '</td>'
            + '<td style="color:#64748B;font-size:13px">' + _escHtml(_safeText(q.siteAddress, '—')) + '</td>'
            + '<td style="font-weight:700;color:#0D9488">' + (q.revenueMonthly ? UI.fmt(q.revenueMonthly) : (isW ? '<span style="font-size:11px;color:#94A3B8">Intel</span>' : '—')) + '</td>'
            + '<td style="font-weight:600;color:' + mCol + '">' + (m > 0 ? m.toFixed(1) + '%' : (isW ? '<span style="font-size:11px;color:#94A3B8">Intel</span>' : '—')) + '</td>'
            + '<td style="color:#475569">' + (hwDisplay ? _escHtml(String(hwDisplay)) + 'h' : '—') + '</td>'
            + '<td><span style="font-size:11px;font-weight:700;color:#fff;background:' + sBg + ';padding:2px 8px;border-radius:10px">' + _escHtml(q.status || '—') + '</span></td>'
            + '<td style="font-size:12px;color:#94A3B8">' + (isW ? 'Website' : 'Manual') + '</td>'
            + '<td style="font-size:12px;color:#94A3B8">' + (q.createdAt ? new Date(q.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '—') + '</td>'
            + '</tr>';
        }).join('')
      : '<tr><td colspan="9" style="text-align:center;padding:40px;color:#94A3B8;font-size:13px">No quotes match this filter</td></tr>';

    const tableHtml = '<div style="margin-bottom:28px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      + '<h3 style="margin:0;font-size:14px;font-weight:700;color:#1E293B">All Quotes</h3>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">' + filterBtns + '</div>'
      + '</div>'
      + '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">'
      + '<table class="tbl" id="quotes-table" style="width:100%">'
      + '<thead><tr><th>ID</th><th>Client</th><th>Site</th><th>Rev/mo</th><th>Margin</th><th>Hrs/wk</th><th>Status</th><th>Source</th><th>Created</th></tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table></div></div>';

    // ── QUOTE BUILDER ──────────────────────────────────────────
    const builderHtml = '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;margin-bottom:24px">'
      + '<h3 style="margin:0 0 18px;font-size:14px;font-weight:700;color:#1E293B">&#9998; Quote Builder <span style="font-size:12px;font-weight:500;color:#94A3B8;margin-left:6px">Manual / follow-up pricing</span></h3>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin-bottom:16px">'
      + '<div class="fg"><label class="fl">Client Name <span class="req">*</span></label><input class="fin" id="q-cl" placeholder="e.g. Soho Media Ltd" oninput="Quotes.calc()"></div>'
      + '<div class="fg"><label class="fl">Site Address</label><input class="fin" id="q-sa" placeholder="e.g. 14 Dean Street, London W1D 3RR"></div>'
      + '<div class="fg"><label class="fl">Segment</label><select class="fin" id="q-sg"><option value="">— select —</option><option>Commercial Office</option><option>Retail</option><option>Medical / Dental</option><option>Education</option><option>Industrial / Warehouse</option><option>Residential Block</option><option>Other</option></select></div>'
      + '<div class="fg"><label class="fl">Pricing Mode</label><select class="fin" id="q-md" onchange="Quotes.toggleMode()"><option value="hourly">Hourly rate</option><option value="fixed">Fixed monthly</option></select></div>'
      + '</div>'
      + '<div id="q-hourly-block" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px 20px;margin-bottom:16px">'
      + '<div class="fg"><label class="fl">Hours / week</label><input class="fin" id="q-hw" type="number" min="0" step="0.5" placeholder="e.g. 15" oninput="Quotes.calc()"></div>'
      + '<div class="fg"><label class="fl">Client rate (&#163;/hr)</label><input class="fin" id="q-cr" type="number" min="0" step="0.5" placeholder="e.g. 22.50" oninput="Quotes.calc()"></div>'
      + '<div class="fg"><label class="fl">LLW rate (&#163;/hr)</label><input class="fin" id="q-lw" type="number" min="0" step="0.01" value="13.85" oninput="Quotes.calc()"></div>'
      + '</div>'
      + '<div id="q-fixed-block" style="display:none;margin-bottom:16px">'
      + '<div class="fg"><label class="fl">Fixed monthly (&#163;)</label><input class="fin" id="q-fm" type="number" min="0" step="10" placeholder="e.g. 1200" oninput="Quotes.calc()"></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin-bottom:16px">'
      + '<div class="fg"><label class="fl">Supplies cost (&#163;/mo)</label><input class="fin" id="q-sp" type="number" min="0" step="1" placeholder="0" oninput="Quotes.calc()"></div>'
      + '<div class="fg"><label class="fl">Other costs (&#163;/mo)</label><input class="fin" id="q-oc" type="number" min="0" step="1" placeholder="0" oninput="Quotes.calc()"></div>'
      + '</div>'
      + '<div class="fg" style="margin-bottom:16px"><label class="fl">Notes</label><textarea class="fta" id="q-nt" placeholder="Any additional context&#8230;" style="height:70px"></textarea></div>'
      + '<div id="q-result" style="margin-bottom:16px"></div>'
      + '<div style="display:flex;gap:10px;justify-content:flex-end">'
      + '<button class="btn bo" onclick="Quotes.calc()">&#9654; Recalculate</button>'
      + '<button class="btn bp" onclick="Quotes.save()">&#10003; Save Quote</button>'
      + '</div>'
      + '</div>';

    mc.innerHTML = webHtml + tableHtml + builderHtml;
    _bindTableClicks();
    UI.setLoading(false);
    calc();
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
    const isWebDraft = (q.source === 'web_form' && q.status === 'Draft');
    // Web drafts haven't had a scenario applied yet — no rate means no margin block
    const blocked = !isWebDraft && (m < CFG.MIN_MARGIN_PCT) && !q.overrideReason;

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
      <div class="mp-row"><span class="mp-lbl">Monthly Revenue</span><span class="mp-val">${q.revenueMonthly ? UI.fmt(q.revenueMonthly) : (isWebDraft ? '<span style="font-size:12px;color:#94A3B8">Pending Intel — apply a scenario below</span>' : UI.fmt(0))}</span></div>
      <div class="mp-row"><span class="mp-lbl">Direct Cost</span><span>${q.directCost ? UI.fmt(q.directCost) : (isWebDraft ? '<span style="font-size:12px;color:#94A3B8">—</span>' : UI.fmt(0))}</span></div>
      <div class="mp-row"><span class="mp-lbl" style="color:${col}">Gross Margin</span><span style="color:${col};font-weight:700">${m > 0 ? UI.fmtPct(m) + ' (' + UI.fmt(q.grossMarginGBP || 0) + '/mo)' : (isWebDraft ? '<span style="font-size:12px;color:#94A3B8">Set by Intel below</span>' : '—')}</span></div>
    </div>
  </div>

  ${blocked ? `<div class="alert alert-r" style="margin-bottom:12px">&#9888; Below ${CFG.MIN_MARGIN_PCT}% floor. Owner must approve before sending.</div>` : ''}
  ${q.notes ? `<div style="font-size:13px;color:var(--sl);background:var(--of);padding:8px 10px;border-radius:6px;margin-bottom:12px">${_escHtml(q.notes)}</div>` : ''}

  <div id="intel-panel-mount" style="margin-top:16px"></div>

  <div class="modal-foot">
    ${blocked ? `<button class="btn bo" onclick="Quotes.openApprove('${_escHtml(q.id)}')">&#9888; Request Approval</button>` : ''}
    <a href="${(window.CFG && window.CFG.OS_URL) || 'https://askmiro-api-production.up.railway.app'}" target="_blank" rel="noopener"
      style="font-size:12px;color:#64748B;text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border:1px solid #E2E8F0;border-radius:7px;transition:all .15s"
      onmouseover="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
      onmouseout="this.style.borderColor='#E2E8F0';this.style.color='#64748B'">
      &#9656; AskMiro OS
    </a>
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

  // ── RUN INTEL — retroactively create a Quote+Intel draft for a raw NEW LEAD ──
  async function runIntel(leadId) {
    const btn = document.querySelector('[onclick*="runIntel(\'' + leadId + '\')"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Running…'; }
    try {
      const res = await API.post('lead.runIntel', { id: leadId });
      if (res.alreadyExists) {
        UI.toast('Quote already exists — refreshing list', 'a');
      } else {
        UI.toast('⚡ Intel complete — quote ' + (res.quoteId || '') + ' created!', 'g');
      }
      await render();
      // Auto-open the new quote in the viewer
      if (res.quoteId && _byId[res.quoteId]) openView(_byId[res.quoteId]);
    } catch(e) {
      UI.toast('Intel failed: ' + e.message, 'r');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ Run Intel'; }
    }
  }

  function updateBadge() {
    const n = _quotes.filter(function(q) {
      const isWeb = q.isWebQuote || q.source === 'web_form' || q.createdBy === 'INTEL';
      return isWeb && (q.status === 'Draft' || q.status === 'NEW LEAD');
    }).length;
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
    setFilter, openViewById, _sendProposal, loadIntoBuilder, runIntel,
  };
})();

// ✅ Make it work in module/bundled environments
try { window.Quotes = Quotes; } catch (e) {}
