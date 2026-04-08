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
          var isOO = q.mode === 'one_off';
          return '<tr class="q-row" data-qid="' + _escHtml(q.id) + '" style="cursor:pointer">'
            + '<td style="font-family:monospace;font-size:12px;color:#64748B">' + _escHtml(q.id) + '</td>'
            + '<td style="font-weight:600;color:#1E293B">' + _escHtml(_safeText(q.clientName, '—'))
            + (isW ? ' <span style="font-size:10px;background:#FED7AA;color:#9A3412;padding:1px 6px;border-radius:10px;font-weight:700">WEB</span>' : '')
            + (isOO ? ' <span style="font-size:10px;background:#EDE9FE;color:#6D28D9;padding:1px 6px;border-radius:10px;font-weight:700">ONE-OFF</span>' : '')
            + '</td>'
            + '<td style="color:#64748B;font-size:13px">' + _escHtml(_safeText(q.siteAddress, '—')) + '</td>'
            + '<td style="font-weight:700;color:#0D9488">' + (q.revenueMonthly ? UI.fmt(q.revenueMonthly) + (isOO ? '' : '') : (isW ? '<span style="font-size:11px;color:#94A3B8">Intel</span>' : '—')) + '</td>'
            + '<td style="font-weight:600;color:' + mCol + '">' + (isOO ? '<span style="font-size:11px;color:#7C3AED">One-off</span>' : (m > 0 ? m.toFixed(1) + '%' : (isW ? '<span style="font-size:11px;color:#94A3B8">Intel</span>' : '—'))) + '</td>'
            + '<td style="color:#475569">' + (isOO ? '—' : (hwDisplay ? _escHtml(String(hwDisplay)) + 'h' : '—')) + '</td>'
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
      + '<div class="fg"><label class="fl">Pricing Mode</label><select class="fin" id="q-md" onchange="Quotes.toggleMode()"><option value="hourly">Hourly rate</option><option value="fixed">Fixed monthly</option><option value="one_off">One-off job</option></select></div>'
      + '</div>'
      + '<div id="q-hourly-block" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px 20px;margin-bottom:16px">'
      + '<div class="fg"><label class="fl">Hours / week</label><input class="fin" id="q-hw" type="number" min="0" step="0.5" placeholder="e.g. 15" oninput="Quotes.calc()"></div>'
      + '<div class="fg"><label class="fl">Client rate (&#163;/hr)</label><input class="fin" id="q-cr" type="number" min="0" step="0.5" placeholder="e.g. 22.50" oninput="Quotes.calc()"></div>'
      + '<div class="fg"><label class="fl">LLW rate (&#163;/hr)</label><input class="fin" id="q-lw" type="number" min="0" step="0.01" value="13.85" oninput="Quotes.calc()"></div>'
      + '</div>'
      + '<div id="q-fixed-block" style="display:none;margin-bottom:16px">'
      + '<div class="fg"><label class="fl">Fixed monthly (&#163;)</label><input class="fin" id="q-fm" type="number" min="0" step="10" placeholder="e.g. 1200" oninput="Quotes.calc()"></div>'
      + '</div>'
      + '<div id="q-oneoff-block" style="display:none;margin-bottom:16px">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin-bottom:12px">'
      + '<div class="fg"><label class="fl">Service Type</label><select class="fin" id="q-stype"><option value="End of Tenancy Clean">End of Tenancy Clean</option><option value="Deep Clean">Deep Clean</option><option value="Regular Clean">Regular Clean</option><option value="Move-In Clean">Move-In Clean</option><option value="Office Clean">Office Clean</option><option value="One-Off Clean">One-Off Clean</option><option value="Other">Other</option></select></div>'
      + '<div class="fg"><label class="fl">Client Email</label><input class="fin" id="q-email" type="email" placeholder="client@email.com"></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px 20px;margin-bottom:12px">'
      + '<div class="fg"><label class="fl">Job Date</label><input class="fin" id="q-jdate" type="date"></div>'
      + '<div class="fg"><label class="fl">Job Time</label><input class="fin" id="q-jtime" type="time" value="10:00"></div>'
      + '<div class="fg"><label class="fl">VAT</label><select class="fin" id="q-vat" onchange="Quotes.calc()"><option value="0">0% (below threshold)</option><option value="20">20%</option></select></div>'
      + '</div>'
      + '<div class="fg" style="margin-bottom:12px"><label class="fl">Property Details</label><input class="fin" id="q-prop" placeholder="e.g. 1 bed flat, 1 bath, furnished"></div>'
      + '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px;margin-bottom:12px">'
      + '<div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:10px">Line Items</div>'
      + '<div id="q-lines">'
      + '<div class="fr" style="margin-bottom:6px;align-items:center">'
      + '<div class="fg" style="flex:3"><input class="fin" style="font-size:12px" placeholder="e.g. End of tenancy deep clean" data-ql="desc"></div>'
      + '<div class="fg" style="flex:1"><input class="fin" type="number" step="1" style="font-size:12px" placeholder="&#163; Amount" data-ql="amt" oninput="Quotes.calc()"></div>'
      + '<button type="button" onclick="this.closest(\'.fr\').remove();Quotes.calc()" style="padding:0 8px;background:none;border:none;color:#94A3B8;cursor:pointer;font-size:16px">&#x2715;</button>'
      + '</div>'
      + '</div>'
      + '<button class="btn bo btn-xs" type="button" onclick="Quotes._addLine()">+ Add Line</button>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin-bottom:12px">'
      + '<div class="fg"><label class="fl">Fixed total (&#163;, overrides line items)</label><input class="fin" id="q-oo-total" type="number" min="0" step="1" placeholder="Leave blank to use line item total" oninput="Quotes.calc()"></div>'
      + '<div class="fg"><label class="fl">Payment Link (Tide / Stripe)</label><input class="fin" id="q-paylink" placeholder="https://pay.tide.co/..."></div>'
      + '</div>'
      + '<div class="fg" style="margin-bottom:12px"><label class="fl">Scope of Work <span style="font-weight:400;color:#94A3B8">(one item per line)</span></label><textarea class="fta" id="q-scope" placeholder="Cobweb removal from ceilings and walls&#10;Skirting boards, door frames, radiators&#10;Kitchen units deep clean&#10;..." style="height:90px"></textarea></div>'
      + '</div>'
      + '<div id="q-cost-block" style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin-bottom:16px">'
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
    const ob = document.getElementById('q-oneoff-block');
    const cb = document.getElementById('q-cost-block');
    if (hb) hb.style.display = (m === 'hourly') ? '' : 'none';
    if (fb) fb.style.display = (m === 'fixed') ? '' : 'none';
    if (ob) ob.style.display = (m === 'one_off') ? '' : 'none';
    if (cb) cb.style.display = (m === 'one_off') ? 'none' : '';
    calc();
  }

  function _addLine() {
    const c = document.getElementById('q-lines');
    if (!c) return;
    const d = document.createElement('div');
    d.className = 'fr';
    d.style.marginBottom = '6px';
    d.style.alignItems = 'center';
    d.innerHTML = '<div class="fg" style="flex:3"><input class="fin" style="font-size:12px" placeholder="Description" data-ql="desc"></div>'
      + '<div class="fg" style="flex:1"><input class="fin" type="number" step="1" style="font-size:12px" placeholder="&#163; Amount" data-ql="amt" oninput="Quotes.calc()"></div>'
      + '<button type="button" onclick="this.closest(\'.fr\').remove();Quotes.calc()" style="padding:0 8px;background:none;border:none;color:#94A3B8;cursor:pointer;font-size:16px">&#x2715;</button>';
    c.appendChild(d);
  }

  function _getLineItems() {
    const descs = document.querySelectorAll('[data-ql="desc"]');
    const amts  = document.querySelectorAll('[data-ql="amt"]');
    const items = [];
    descs.forEach(function(d, i) {
      const desc = d.value.trim();
      const amt  = parseFloat((amts[i] || {}).value) || 0;
      if (desc || amt > 0) items.push({ description: desc, amount: amt });
    });
    return items;
  }

  function calc() {
    const modeEl = document.getElementById('q-md');
    const mode = modeEl ? modeEl.value : 'hourly';

    const el = document.getElementById('q-result');
    if (!el) return;

    if (mode === 'one_off') {
      const items = _getLineItems();
      const lineTotal = items.reduce(function(s, li) { return s + li.amount; }, 0);
      const overrideTotal = parseFloat((document.getElementById('q-oo-total') || {}).value) || 0;
      const total = overrideTotal > 0 ? overrideTotal : lineTotal;
      const vat = total * 0.2;
      const gross = total + vat;

      var vatPct = parseInt(UI.gv('q-vat') || '0', 10);
      var calcVat = total * (vatPct / 100);
      var calcGross = total + calcVat;
      var vatLabel = vatPct > 0 ? 'VAT (' + vatPct + '%)' : 'VAT (0% — below threshold)';
      el.innerHTML = '<div class="mp">'
        + '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">'
        + '<span style="font-size:24px;font-weight:800;color:#0D9488">&#163;' + calcGross.toFixed(2) + '</span>'
        + '<span style="font-size:12px;color:var(--ll)">one-off total</span>'
        + '</div>'
        + (items.length > 0 ? items.map(function(li) {
            return '<div class="mp-row"><span class="mp-lbl">' + _escHtml(li.description || 'Item') + '</span><span class="mp-val">' + UI.fmt(li.amount) + '</span></div>';
          }).join('') : '')
        + '<div class="mp-row" style="border-top:1px solid #E2E8F0;padding-top:6px;margin-top:4px"><span class="mp-lbl">Subtotal (net)</span><span class="mp-val" style="font-weight:700">' + UI.fmt(total) + '</span></div>'
        + '<div class="mp-row"><span class="mp-lbl">' + vatLabel + '</span><span class="mp-val">' + UI.fmt(calcVat) + '</span></div>'
        + '<div class="mp-row"><span class="mp-lbl" style="font-weight:700">Total</span><span class="mp-val" style="font-weight:700;font-size:15px;color:#0D9488">' + UI.fmt(calcGross) + '</span></div>'
        + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'
        + '<button class="btn bo btn-xs" style="border-color:#0D9488;color:#0D9488" onclick="Quotes.previewClientQuote()">&#128196; Preview Quote PDF</button>'
        + '<button class="btn bo btn-xs" style="border-color:#0D9488;color:#0D9488" onclick="Quotes.previewClientEmail()">&#9993; Preview Email</button>'
        + '<button class="btn bo btn-xs" style="border-color:#7C3AED;color:#7C3AED" onclick="Quotes.convertToInvoice()">&#128203; Create Invoice</button>'
        + '<button class="btn bo btn-xs" onclick="Quotes.downloadClientEmail()">&#11015; Download Email</button>'
        + '</div>'
        + '</div>';
      return;
    }

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

    if (mode === 'one_off') {
      body.lineItems = _getLineItems();
      body.clientEmail = UI.gv('q-email');
      body.jobDate = UI.gv('q-jdate');
      body.jobTime = UI.gv('q-jtime');
      body.serviceType = UI.gv('q-stype');
      body.propDetails = UI.gv('q-prop');
      body.vatRate = UI.gv('q-vat');
      body.scope = UI.gv('q-scope');
      body.paymentLink = UI.gv('q-paylink');
      const overrideTotal = parseFloat((document.getElementById('q-oo-total') || {}).value) || 0;
      const lineTotal = body.lineItems.reduce(function(s, li) { return s + li.amount; }, 0);
      body.oneOffTotal = overrideTotal > 0 ? overrideTotal : lineTotal;
    }

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

    if (q.mode === 'one_off') {
      _loadOneOffIntoBuilder(q);
      var ooEl = document.getElementById('q-cl');
      if (ooEl) ooEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      UI.toast('Loaded ' + q.id + ' into builder — edit and save as new version');
      return;
    }

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
    const isOneOff = q.mode === 'one_off';
    // Web drafts haven't had a scenario applied yet — no rate means no margin block
    const blocked = !isWebDraft && !isOneOff && (m < CFG.MIN_MARGIN_PCT) && !q.overrideReason;

    const hpw = (q.intel_hoursPerWeek !== undefined && q.intel_hoursPerWeek !== null) ? q.intel_hoursPerWeek : q.hoursPerWeek;
    const vpw = (q.intel_visitsPerWeek !== undefined && q.intel_visitsPerWeek !== null) ? q.intel_visitsPerWeek : 1;

    const staffNeeded = isWebDraft ? _staffCount(hpw, vpw) : null;

    const clientNameSafe = _escHtml(_safeText(q.clientName, ''));
    const siteSafe = _escHtml(_safeText(q.siteAddress, ''));

    // Parse line items from notes for one-off quotes
    let lineItems = [];
    let clientEmail = '';
    let jobDate = '';
    let paymentLink = '';
    if (isOneOff && q.notes) {
      const emailMatch = q.notes.match(/CLIENT_EMAIL:\s*(.+)/);
      const dateMatch = q.notes.match(/JOB_DATE:\s*(.+)/);
      const itemsMatch = q.notes.match(/LINE_ITEMS:\s*(\[.+\])/);
      const payMatch = q.notes.match(/PAYMENT_LINK:\s*(.+)/);
      if (emailMatch) clientEmail = emailMatch[1].trim();
      if (dateMatch) jobDate = dateMatch[1].trim();
      if (payMatch) paymentLink = payMatch[1].trim();
      if (itemsMatch) try { lineItems = JSON.parse(itemsMatch[1]); } catch(e) {}
    }

    const oneOffTotal = parseFloat(q.revenueMonthly || q.quoteValueGbp || 0);
    const oneOffVat = oneOffTotal * 0.2;
    const oneOffGross = oneOffTotal + oneOffVat;

    const detailsHtml = isOneOff
      ? '<div style="padding:14px 18px">'
        + (jobDate ? '<div class="mp-row"><span class="mp-lbl">Job Date</span><span style="font-weight:600">' + _escHtml(jobDate) + '</span></div>' : '')
        + (clientEmail ? '<div class="mp-row"><span class="mp-lbl">Email</span><span style="color:#64748B">' + _escHtml(clientEmail) + '</span></div>' : '')
        + lineItems.map(function(li) { return '<div class="mp-row"><span class="mp-lbl">' + _escHtml(li.description || 'Item') + '</span><span class="mp-val">' + UI.fmt(li.amount) + '</span></div>'; }).join('')
        + '<div class="mp-row" style="border-top:1px solid var(--brd);padding-top:6px;margin-top:4px"><span class="mp-lbl" style="font-weight:700">Total (net)</span><span class="mp-val" style="font-weight:700;color:#0D9488">' + UI.fmt(oneOffTotal) + '</span></div>'
        + '<div class="mp-row"><span class="mp-lbl">VAT (20%)</span><span class="mp-val">' + UI.fmt(oneOffVat) + '</span></div>'
        + '<div class="mp-row"><span class="mp-lbl" style="font-weight:700">Total (inc. VAT)</span><span class="mp-val" style="font-weight:800;font-size:15px;color:#0D9488">' + UI.fmt(oneOffGross) + '</span></div>'
        + '</div>'
      : '<div style="padding:14px 18px">'
        + '<div class="mp-row"><span class="mp-lbl">Hours/week</span><span>' + _escHtml(_safeText(q.hoursPerWeek, '&#8212;')) + 'h</span></div>'
        + (staffNeeded ? '<div class="mp-row"><span class="mp-lbl">Staff needed</span><span style="font-weight:600">' + staffNeeded + ' cleaner' + (staffNeeded > 1 ? 's' : '') + '</span></div>' : '')
        + '<div class="mp-row"><span class="mp-lbl">Monthly Revenue</span><span class="mp-val">' + (q.revenueMonthly ? UI.fmt(q.revenueMonthly) : (isWebDraft ? '<span style="font-size:12px;color:#94A3B8">Pending Intel</span>' : UI.fmt(0))) + '</span></div>'
        + '<div class="mp-row"><span class="mp-lbl">Direct Cost</span><span>' + (q.directCost ? UI.fmt(q.directCost) : (isWebDraft ? '<span style="font-size:12px;color:#94A3B8">—</span>' : UI.fmt(0))) + '</span></div>'
        + '<div class="mp-row"><span class="mp-lbl" style="color:' + col + '">Gross Margin</span><span style="color:' + col + ';font-weight:700">' + (m > 0 ? UI.fmtPct(m) + ' (' + UI.fmt(q.grossMarginGBP || 0) + '/mo)' : (isWebDraft ? '<span style="font-size:12px;color:#94A3B8">Set by Intel below</span>' : '—')) + '</span></div>'
        + '</div>';

    // Clean notes for display (strip structured data)
    const displayNotes = (q.notes || '').replace(/CLIENT_EMAIL:.+/g, '').replace(/JOB_DATE:.+/g, '').replace(/LINE_ITEMS:.+/g, '').replace(/PAYMENT_LINK:.+/g, '').trim();

    UI.openModal(`
<div class="modal-hd">
  <h2>${_escHtml(q.id)} v${_escHtml(q.version || 1)}${isOneOff ? ' <span style="font-size:11px;background:#7C3AED;color:#fff;padding:2px 8px;border-radius:10px;vertical-align:middle;font-family:inherit">One-off</span>' : ''}${isWebDraft ? ' <span style="font-size:11px;background:#0D9488;color:#fff;padding:2px 8px;border-radius:10px;vertical-align:middle;font-family:inherit">&#9672; Intel</span>' : ''}</h2>
  <button class="xbtn" onclick="UI.closeModal()">&#x2715;</button>
</div>

<div class="modal-body">
  <div style="border:1px solid var(--bd);border-radius:var(--rs);overflow:hidden;margin-bottom:14px">
    <div style="background:var(--ch);padding:14px 18px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:15px;color:#5EEAD4">AskMiro Cleaning Services</div>
      <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">${isOneOff ? 'Quote' : 'Proposal'} for ${clientNameSafe} &middot; ${siteSafe}</div>
    </div>
    ${detailsHtml}
  </div>

  ${blocked ? '<div class="alert alert-r" style="margin-bottom:12px">&#9888; Below ' + CFG.MIN_MARGIN_PCT + '% floor. Owner must approve before sending.</div>' : ''}
  ${displayNotes ? '<div style="font-size:13px;color:var(--sl);background:var(--of);padding:8px 10px;border-radius:6px;margin-bottom:12px">' + _escHtml(displayNotes) + '</div>' : ''}

  <div id="intel-panel-mount" style="margin-top:16px"></div>

  <div class="modal-foot" style="flex-wrap:wrap;gap:8px">
    ${blocked ? '<button class="btn bo" onclick="Quotes.openApprove(\'' + _escHtml(q.id) + '\')">&#9888; Request Approval</button>' : ''}
    <a href="${(window.CFG && window.CFG.OS_URL) || 'https://askmiro-api-production.up.railway.app'}" target="_blank" rel="noopener"
      style="font-size:12px;color:#64748B;text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border:1px solid #E2E8F0;border-radius:7px;transition:all .15s"
      onmouseover="this.style.borderColor='#0D9488';this.style.color='#0D9488'"
      onmouseout="this.style.borderColor='#E2E8F0';this.style.color='#64748B'">
      &#9656; AskMiro OS
    </a>
    <div style="flex:1"></div>
    <button class="btn bo" onclick="UI.closeModal()">Close</button>
    <button class="btn bo" onclick="Quotes.loadIntoBuilder(${JSON.stringify(JSON.stringify(q))})">&#9998; Edit</button>
    ${isOneOff ? '<button class="btn bo" style="border-color:#7C3AED;color:#7C3AED" onclick="UI.closeModal();Quotes.loadAndPreviewPdf(\'' + _escHtml(q.id) + '\')">&#128196; Client PDF</button>'
      + '<button class="btn bo" style="border-color:#0D9488;color:#0D9488" onclick="UI.closeModal();Quotes.loadAndConvertInvoice(\'' + _escHtml(q.id) + '\')">&#128203; Create Invoice</button>' : ''}
    ${!blocked ? '<button class="btn bo" onclick="Quotes._sendProposal(' + JSON.stringify(JSON.stringify(q)) + ')" style="border-color:#0D9488;color:#0D9488">&#9993; Send Proposal</button>'
      + '<button class="btn bp" onclick="Quotes.openSend(\'' + _escHtml(q.id) + '\',\'' + clientNameSafe + '\')">&#9992; Send Quote</button>' : ''}
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

  // ── CLIENT-FACING QUOTE PDF (print-ready popup) ────────────
  // ── Collect one-off form data into a reusable object ──────
  function _collectOneOffData() {
    var client = UI.gv('q-cl') || 'Client';
    var site   = UI.gv('q-sa') || '';
    var email  = UI.gv('q-email') || '';
    var jobDate = UI.gv('q-jdate') || '';
    var jobTime = UI.gv('q-jtime') || '10:00';
    var serviceType = UI.gv('q-stype') || 'End of Tenancy Clean';
    var propDetails = UI.gv('q-prop') || '';
    var notes  = UI.gv('q-nt') || '';
    var payLink = UI.gv('q-paylink') || '';
    var vatRate = parseInt(UI.gv('q-vat') || '0', 10);
    var scopeRaw = UI.gv('q-scope') || '';
    var scopeItems = scopeRaw.split('\n').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    var items  = _getLineItems();
    var overrideTotal = parseFloat((document.getElementById('q-oo-total') || {}).value) || 0;
    var lineTotal = items.reduce(function(s, li) { return s + li.amount; }, 0);
    var subtotal = overrideTotal > 0 ? overrideTotal : lineTotal;
    var vat = subtotal * (vatRate / 100);
    var gross = subtotal + vat;
    var today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    var validUntil = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    var jobDateFmt = jobDate ? new Date(jobDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var jobDateShort = jobDate ? new Date(jobDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    var jobDay = jobDate ? new Date(jobDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' }) : '';
    var timeFmt = jobTime ? (function() { var p = jobTime.split(':'); var h = parseInt(p[0],10); var m = p[1] || '00'; var ampm = h >= 12 ? 'PM' : 'AM'; return (h > 12 ? h - 12 : h || 12) + (m !== '00' ? ':' + m : '') + ' ' + ampm; })() : '';
    var clientSlug = client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      client: client, site: site, email: email, jobDate: jobDate, jobTime: jobTime,
      serviceType: serviceType, propDetails: propDetails, notes: notes, payLink: payLink,
      vatRate: vatRate, scopeItems: scopeItems, items: items, subtotal: subtotal, vat: vat, gross: gross,
      today: today, validUntil: validUntil, jobDateFmt: jobDateFmt, jobDateShort: jobDateShort,
      jobDay: jobDay, timeFmt: timeFmt, clientSlug: clientSlug
    };
  }

  function previewClientQuote() {
    var d = _collectOneOffData();

    var lineRows = d.items.map(function(li) {
      return '<tr><td style="padding:14px 16px;border-bottom:1px solid #F1F5F9;font-size:14px;color:#1E293B"><div style="font-weight:600">' + _escHtml(li.description) + '</div></td>'
        + '<td style="padding:14px 16px;border-bottom:1px solid #F1F5F9;text-align:right;font-weight:600;color:#1E293B;font-size:14px;white-space:nowrap">&#163;' + li.amount.toFixed(2) + '</td></tr>';
    }).join('');

    var scopeHtml = '';
    if (d.scopeItems.length > 0) {
      scopeHtml = '<div style="background:#F0FDFA;border:1px solid #99F6E4;border-radius:10px;padding:16px 20px;margin-bottom:24px">'
        + '<div style="font-size:11px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Full Scope of Work</div>'
        + '<ul style="font-size:13px;color:#1E293B;line-height:1.8;padding-left:20px">'
        + d.scopeItems.map(function(s) { return '<li style="margin-bottom:2px">' + _escHtml(s) + '</li>'; }).join('')
        + '</ul></div>';
    }

    var bookingHtml = '';
    if (d.jobDateFmt) {
      bookingHtml = '<div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:20px;margin-bottom:24px">'
        + '<div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Booking Confirmation</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px">'
        + '<dt style="color:#64748B;font-weight:500">Date &amp; Time</dt><dd style="color:#1E293B;font-weight:600">' + _escHtml(d.jobDateFmt) + (d.timeFmt ? ', ' + _escHtml(d.timeFmt) : '') + '</dd>'
        + '<dt style="color:#64748B;font-weight:500">Completion</dt><dd style="color:#1E293B;font-weight:600">Same-day, single visit</dd>'
        + '</div></div>';
    }

    var vatLabel = d.vatRate > 0 ? 'VAT (' + d.vatRate + '%)' : 'VAT (0% &mdash; below threshold)';

    var html = '<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Quote &mdash; ' + _escHtml(d.client) + ' | AskMiro Cleaning Services</title>'
      + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
      + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">'
      + '<style>'
      + '* { margin:0; padding:0; box-sizing:border-box; }'
      + 'body { font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#fff; color:#1E293B; line-height:1.6; }'
      + '@page { size:A4; margin:0; }'
      + '@media print { .no-print { display:none !important; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }'
      + '.page { max-width:794px; margin:0 auto; padding:48px 56px; }'
      + '</style></head><body>'
      + '<div class="no-print" style="background:#0D9488;padding:12px 24px;display:flex;gap:12px;align-items:center;justify-content:center">'
      + '<button onclick="window.print()" style="background:#fff;color:#0D9488;border:none;padding:10px 32px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Save as PDF</button>'
      + '<button onclick="window.close()" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:10px 32px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit">Close</button>'
      + '</div>'
      + '<div class="page">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #0D9488">'
      + '<div>'
      + '<div style="font-family:Outfit,sans-serif;font-weight:800;font-size:28px;color:#0D9488;letter-spacing:-0.5px">AskMiro</div>'
      + '<div style="font-size:13px;color:#64748B;margin-top:4px">Managed Cleaning Services</div>'
      + '<div style="font-size:12px;color:#94A3B8;margin-top:2px">020 8073 0621 &bull; info@askmiro.com &bull; www.askmiro.com</div>'
      + '</div>'
      + '<div style="text-align:right">'
      + '<div style="font-family:Outfit,sans-serif;font-weight:700;font-size:22px;color:#1E293B;letter-spacing:-0.3px">QUOTE &amp; BOOKING<br>CONFIRMATION</div>'
      + '<div style="font-size:13px;color:#64748B;margin-top:4px">Date: ' + d.today + '</div>'
      + '<div style="font-size:13px;color:#64748B">Valid until: ' + d.validUntil + '</div>'
      + '</div></div>'
      // Client + Service
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">'
      + '<div style="background:#F8FAFC;border-radius:10px;padding:20px">'
      + '<div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Prepared for</div>'
      + '<div style="font-size:16px;font-weight:700;color:#1E293B">' + _escHtml(d.client) + '</div>'
      + (d.site ? '<div style="font-size:13px;color:#64748B;margin-top:4px">' + _escHtml(d.site) + '</div>' : '')
      + (d.email ? '<div style="font-size:13px;color:#64748B;margin-top:2px">' + _escHtml(d.email) + '</div>' : '')
      + '</div>'
      + '<div style="background:#F0FDFA;border-radius:10px;padding:20px">'
      + '<div style="font-size:10px;font-weight:700;color:#0D9488;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Service Details</div>'
      + '<div style="font-size:16px;font-weight:700;color:#1E293B">' + _escHtml(d.serviceType) + '</div>'
      + (d.jobDateFmt ? '<div style="font-size:13px;font-weight:600;color:#0F766E;margin-top:4px">' + _escHtml(d.jobDateFmt) + (d.timeFmt ? ', ' + _escHtml(d.timeFmt) : '') + '</div>' : '')
      + (d.propDetails ? '<div style="font-size:13px;color:#64748B;margin-top:4px">' + _escHtml(d.propDetails) + '</div>' : '')
      + '</div></div>'
      // Booking confirmation
      + bookingHtml
      // Line items table
      + '<table style="width:100%;border-collapse:collapse;margin-bottom:24px">'
      + '<thead><tr><th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #E2E8F0;background:#F8FAFC">Description</th>'
      + '<th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #E2E8F0;background:#F8FAFC">Amount</th></tr></thead>'
      + '<tbody>' + lineRows + '</tbody></table>'
      // Totals
      + '<div style="display:flex;justify-content:flex-end;margin-bottom:32px">'
      + '<div style="width:300px;background:#F8FAFC;border-radius:10px;padding:16px 20px">'
      + '<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:14px"><span style="color:#64748B">Subtotal (net)</span><span style="font-weight:600">&#163;' + d.subtotal.toFixed(2) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:14px"><span style="color:#64748B">' + vatLabel + '</span><span style="font-weight:600">&#163;' + d.vat.toFixed(2) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;padding:12px 0;margin-top:8px;border-top:2px solid #0D9488;font-size:18px"><span style="font-weight:700;color:#1E293B">Total</span><span style="font-weight:800;color:#0D9488">&#163;' + d.gross.toFixed(2) + '</span></div>'
      + '</div></div>'
      // Scope of work
      + scopeHtml
      // Terms
      + '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:16px 20px;margin-bottom:24px">'
      + '<div style="font-size:11px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Payment Terms</div>'
      + '<div style="font-size:13px;color:#78350F;line-height:1.7">No upfront payment required. Payment of <strong>&#163;' + d.gross.toFixed(2) + '</strong> is due upon completion of the job, once you are satisfied with the standard of work. A full invoice and receipt will be provided on the day for your records.<br><br><strong>Payment methods:</strong> Bank transfer (details on invoice) or card payment via secure link below.</div>'
      + '</div>'
      // Payment button
      + (d.payLink ? '<div style="text-align:center;margin-bottom:32px">'
        + '<a href="' + _escHtml(d.payLink) + '" target="_blank" rel="noopener" style="display:inline-block;background:#0D9488;color:#fff;font-family:Outfit,sans-serif;font-weight:700;font-size:16px;padding:16px 56px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(13,148,136,0.35)">Pay Now &#8212; &#163;' + d.gross.toFixed(2) + '</a>'
        + '<div style="font-size:11px;color:#94A3B8;margin-top:8px">Secure payment via Tide &bull; Card or bank transfer accepted</div>'
        + '</div>' : '')
      // Notes
      + (d.notes ? '<div style="margin-bottom:24px"><div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Notes</div><div style="font-size:13px;color:#64748B;line-height:1.6">' + _escHtml(d.notes).replace(/\n/g, '<br>') + '</div></div>' : '')
      // Footer
      + '<div style="border-top:1px solid #E2E8F0;padding-top:20px;display:flex;justify-content:space-between;align-items:center">'
      + '<div style="font-size:11px;color:#94A3B8;line-height:1.6">AskMiro Cleaning Services<br>SW11, London<br>Company registered in England &amp; Wales</div>'
      + '<div style="font-size:11px;color:#94A3B8;text-align:right;line-height:1.6">Reliable. Thorough. Local.<br>www.askmiro.com<br>020 8073 0621</div>'
      + '</div>'
      + '</div></body></html>';

    var w = window.open('', '_blank', 'width=850,height=1100');
    if (w) { w.document.write(html); w.document.close(); }
    else { UI.toast('Pop-up blocked — allow pop-ups to preview quotes', 'r'); }
  }

  // ── CONVERT QUOTE TO FINANCE INVOICE ──────────────────────
  function convertToInvoice() {
    const client = UI.gv('q-cl') || '';
    const site   = UI.gv('q-sa') || '';
    const items  = _getLineItems();
    const overrideTotal = parseFloat((document.getElementById('q-oo-total') || {}).value) || 0;
    const lineTotal = items.reduce(function(s, li) { return s + li.amount; }, 0);
    const subtotal = overrideTotal > 0 ? overrideTotal : lineTotal;
    const notes  = UI.gv('q-nt') || '';

    if (!client) { UI.toast('Client name required', 'r'); return; }
    if (subtotal <= 0) { UI.toast('Add line items or total first', 'r'); return; }

    // Store data for Finance module to pick up
    window._invoicePrefill = {
      customerName: client,
      siteId: site,
      lineItems: items.length > 0 ? items : [{ description: 'End of tenancy clean', amount: subtotal }],
      subtotal: subtotal,
      notes: notes
    };

    if (window.Router) Router.navigate('finance');

    // Wait for finance page to render, then open create invoice modal with prefill
    setTimeout(function() {
      if (typeof Finance !== 'undefined' && Finance.openCreateInvoice) {
        Finance.openCreateInvoice();
        // Prefill after modal opens
        setTimeout(function() {
          var pf = window._invoicePrefill;
          if (!pf) return;
          var custEl = document.getElementById('ci-cust');
          var siteEl = document.getElementById('ci-site');
          var notesEl = document.getElementById('ci-notes');
          if (custEl) custEl.value = pf.customerName;
          if (siteEl) siteEl.value = pf.siteId;
          if (notesEl) notesEl.value = pf.notes;
          // Add line items
          var linesEl = document.getElementById('ci-lines');
          if (linesEl && pf.lineItems) {
            linesEl.innerHTML = '';
            pf.lineItems.forEach(function(li) {
              var d = document.createElement('div');
              d.className = 'fr';
              d.style.marginBottom = '6px';
              d.innerHTML = '<div class="fg" style="flex:3"><input class="fin" style="font-size:12px" value="' + _escHtml(li.description) + '" data-line="desc"></div>'
                + '<div class="fg" style="flex:1"><input class="fin" type="number" step="0.01" style="font-size:12px" value="' + li.amount.toFixed(2) + '" data-line="net" oninput="Finance._calcLineTotal(this)"></div>'
                + '<button type="button" onclick="this.closest(\'.fr\').remove();Finance._calcInvTotal()" style="padding:0 8px;background:none;border:none;color:var(--ll);cursor:pointer;font-size:16px">&#x2715;</button>';
              linesEl.appendChild(d);
            });
            if (Finance._calcInvTotal) Finance._calcInvTotal();
          }
          window._invoicePrefill = null;
        }, 200);
      }
    }, 300);

    UI.toast('Opening Finance with invoice pre-filled', 'g');
  }

  // ── PREMIUM CLIENT EMAIL GENERATOR (Tesla × Fluent) ───────
  function generateClientEmail(d) {
    if (!d) d = _collectOneOffData();
    var firstName = d.client.split(' ')[0];
    var F = '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';
    var C = { navy:'#0A1628', charcoal:'#111827', body:'#1F2937', slate:'#4B5563',
      border:'#E5E7EB', borderLight:'#F3F4F6', offWhite:'#F9FAFB', teal:'#0D9488',
      tealDark:'#0F766E', tealMid:'#14B8A6', tealLight:'#CCFBF1', tealGhost:'#F0FDFA',
      amberBg:'#FFFBEB', amberBorder:'#FDE68A', amberText:'#92400E' };

    // Line items rows (Stripe-tier zebra)
    var lineRows = d.items.map(function(li, i) {
      var bg = i % 2 === 0 ? '#FFFFFF' : C.offWhite;
      return '<tr style="background:' + bg + '"><td style="font-family:' + F + ';font-size:13px;color:' + C.slate + ';padding:12px 18px;border-bottom:1px solid ' + C.borderLight + '">' + _escHtml(li.description) + '</td>'
        + '<td style="font-family:' + F + ';font-size:13px;color:' + C.charcoal + ';font-weight:500;padding:12px 18px;text-align:right;border-bottom:1px solid ' + C.borderLight + '">&#163;' + li.amount.toFixed(2) + '</td></tr>';
    }).join('');

    // Scope checklist rows
    var scopeRows = d.scopeItems.map(function(s, i) {
      var bg = i % 2 === 0 ? '#FFFFFF' : C.offWhite;
      return '<tr style="background:' + bg + '">'
        + '<td style="width:44px;padding:13px 0 13px 16px;vertical-align:top;border-bottom:1px solid ' + C.borderLight + '">'
        + '<div style="width:22px;height:22px;background:' + C.tealGhost + ';border:1.5px solid ' + C.tealLight + ';border-radius:50%;text-align:center;line-height:19px;font-size:12px;color:' + C.teal + ';font-weight:700">&#10003;</div></td>'
        + '<td style="padding:13px 18px 13px 10px;font-family:' + F + ';font-size:14px;color:' + C.body + ';line-height:1.6;border-bottom:1px solid ' + C.borderLight + '">' + _escHtml(s) + '</td></tr>';
    }).join('');

    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
      + '<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no">'
      + '<title>AskMiro Cleaning Services</title>'
      + '<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->'
      + '</head><body style="margin:0;padding:0;background:#F1F5F9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">'
      + '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center">'
      + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">'
      // Accent bar
      + '<tr><td style="height:4px;background:linear-gradient(90deg,' + C.teal + ',' + C.tealMid + ');border-radius:12px 12px 0 0;font-size:4px;line-height:4px">&nbsp;</td></tr>'
      // Header
      + '<tr><td style="background:' + C.navy + ';padding:26px 36px">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
      + '<td style="vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr>'
      + '<td style="padding-right:14px;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="40" height="40" alt="AskMiro" style="display:block;border:0;border-radius:8px" border="0"></td>'
      + '<td style="vertical-align:middle">'
      + '<div style="font-family:' + F + ';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">AskMiro</div>'
      + '<div style="font-family:' + F + ';font-size:10px;color:rgba(255,255,255,0.38);letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Professional Cleaning Across London</div>'
      + '</td></tr></table></td>'
      + '<td align="right" style="vertical-align:middle"><div style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.11);border-radius:20px;padding:6px 16px">'
      + '<span style="font-family:' + F + ';font-size:11px;font-weight:600;color:rgba(255,255,255,0.55);letter-spacing:0.6px">Booking Confirmation</span></div></td>'
      + '</tr></table></td></tr>'
      // Body
      + '<tr><td style="background:#FFFFFF;padding:44px 40px 36px;border-left:1px solid ' + C.border + ';border-right:1px solid ' + C.border + '">'
      // Greeting
      + '<p style="margin:0 0 22px;font-family:' + F + ';font-size:16px;font-weight:600;color:' + C.charcoal + '">Hi ' + _escHtml(firstName) + ',</p>'
      + '<p style="margin:0 0 6px;font-family:' + F + ';font-size:11px;font-weight:700;color:' + C.teal + ';letter-spacing:1.5px;text-transform:uppercase">Your booking is confirmed</p>'
      + '<h1 style="margin:0 0 6px;font-family:' + F + ';font-size:26px;font-weight:800;color:' + C.charcoal + ';letter-spacing:-0.8px;line-height:1.15">' + _escHtml(d.serviceType) + '</h1>'
      + '<p style="margin:0 0 28px;font-family:' + F + ';font-size:15px;color:' + C.body + ';line-height:1.8">Thank you for choosing AskMiro. Everything is locked in for your ' + _escHtml(d.serviceType.toLowerCase()) + '. Below you\'ll find the full details, scope of work, and your quote breakdown.</p>'
      // Stat band
      + (d.jobDateShort ? '<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border-radius:12px;overflow:hidden;background:' + C.navy + '"><tr>'
        + '<td align="center" style="padding:22px 18px;border-right:1px solid rgba(255,255,255,0.07)">'
        + '<div style="font-family:' + F + ';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.35);margin-bottom:6px">Date</div>'
        + '<div style="font-family:' + F + ';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">' + _escHtml(d.jobDateShort) + '</div>'
        + '<div style="font-family:' + F + ';font-size:11px;color:rgba(255,255,255,0.32);margin-top:5px">' + _escHtml(d.jobDay) + '</div></td>'
        + '<td align="center" style="padding:22px 18px;border-right:1px solid rgba(255,255,255,0.07)">'
        + '<div style="font-family:' + F + ';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.35);margin-bottom:6px">Time</div>'
        + '<div style="font-family:' + F + ';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">' + _escHtml(d.timeFmt) + '</div>'
        + '<div style="font-family:' + F + ';font-size:11px;color:rgba(255,255,255,0.32);margin-top:5px">Start time</div></td>'
        + '<td align="center" style="padding:22px 18px">'
        + '<div style="font-family:' + F + ';font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:rgba(255,255,255,0.35);margin-bottom:6px">Total</div>'
        + '<div style="font-family:' + F + ';font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;line-height:1">&#163;' + Math.round(d.gross) + '</div>'
        + '<div style="font-family:' + F + ';font-size:11px;color:rgba(255,255,255,0.32);margin-top:5px">All-inclusive</div></td>'
        + '</tr></table>' : '')
      // Property callout
      + (d.site || d.propDetails ? '<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px"><tr><td style="background:' + C.tealGhost + ';border:1px solid ' + C.tealLight + ';border-radius:10px;padding:16px 20px">'
        + '<table cellpadding="0" cellspacing="0" width="100%"><tr>'
        + '<td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">&#127968;</td>'
        + '<td style="font-family:' + F + ';font-size:13.5px;color:' + C.tealDark + ';line-height:1.7">'
        + '<strong>' + _escHtml(d.site) + '</strong>'
        + (d.propDetails ? '<br>' + _escHtml(d.propDetails) : '')
        + '</td></tr></table></td></tr></table>' : '')
      // Quote breakdown
      + '<p style="margin:24px 0 12px;font-family:' + F + ';font-size:11px;font-weight:700;color:' + C.charcoal + ';letter-spacing:0.8px;text-transform:uppercase">Quote Breakdown</p>'
      + '<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid ' + C.border + ';border-radius:12px;overflow:hidden">'
      + lineRows
      + '<tr style="background:' + C.charcoal + '"><td style="font-family:' + F + ';font-size:14px;font-weight:700;color:#FFFFFF;padding:16px 18px">Total</td>'
      + '<td style="font-family:' + F + ';font-size:22px;font-weight:800;color:#FFFFFF;padding:16px 18px;text-align:right;letter-spacing:-0.5px">&#163;' + d.gross.toFixed(2) + '</td></tr></table>'
      // Scope checklist
      + (scopeRows ? '<p style="margin:24px 0 12px;font-family:' + F + ';font-size:11px;font-weight:700;color:' + C.charcoal + ';letter-spacing:0.8px;text-transform:uppercase">What\'s included</p>'
        + '<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid ' + C.border + ';border-radius:12px;overflow:hidden">' + scopeRows + '</table>' : '')
      // Payment callout
      + '<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px"><tr><td style="background:' + C.amberBg + ';border:1px solid ' + C.amberBorder + ';border-radius:10px;padding:16px 20px">'
      + '<table cellpadding="0" cellspacing="0" width="100%"><tr>'
      + '<td style="width:28px;vertical-align:top;padding-right:12px;font-size:18px;line-height:1">&#128179;</td>'
      + '<td style="font-family:' + F + ';font-size:13.5px;color:' + C.amberText + ';line-height:1.7">'
      + '<strong>No upfront payment required.</strong> You can settle the &#163;' + d.gross.toFixed(2) + ' once the job is completed and you\'re happy with the standard. A full invoice and receipt will be provided on the day for your records.</td>'
      + '</tr></table></td></tr></table>'
      // CTA buttons
      + (d.payLink ? '<table cellpadding="0" cellspacing="0" style="margin:28px 0" width="100%"><tr><td align="center">'
        + '<table cellpadding="0" cellspacing="0"><tr>'
        + '<td style="border-radius:8px;background:' + C.teal + '"><a href="' + _escHtml(d.payLink) + '" style="display:block;padding:15px 36px;font-family:' + F + ';font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;letter-spacing:-0.1px;white-space:nowrap">Pay &#163;' + d.gross.toFixed(2) + ' &#8212; Secure Payment</a></td>'
        + '<td width="12">&nbsp;</td>'
        + '<td style="border-radius:8px;border:1.5px solid ' + C.border + '"><a href="tel:02080730621" style="display:block;padding:14px 22px;font-family:' + F + ';font-size:13px;font-weight:600;color:' + C.body + ';text-decoration:none;white-space:nowrap">&#9742;&nbsp;020 8073 0621</a></td>'
        + '</tr></table>'
        + '<p style="margin:10px 0 0;font-family:' + F + ';font-size:11px;color:#94A3B8">Payment is optional before the job. You can also pay on the day.</p>'
        + '</td></tr></table>' : '')
      // Closing
      + '<p style="margin:0 0 18px;font-family:' + F + ';font-size:15px;color:' + C.body + ';line-height:1.8">If anything changes or you have any questions at all, just reply to this email or give me a call.</p>'
      + '<p style="margin:0 0 18px;font-family:' + F + ';font-size:15px;color:' + C.body + ';line-height:1.8">Looking forward to getting this done for you.</p>'
      // Signature
      + '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:40px"><tr><td style="padding-top:28px;border-top:1px solid ' + C.border + '">'
      + '<table cellpadding="0" cellspacing="0" width="100%"><tr>'
      + '<td style="vertical-align:middle;padding-right:14px;width:34px"><img src="https://www.askmiro.com/favicon-32x32.png" width="30" height="30" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0"></td>'
      + '<td style="vertical-align:middle"><div style="font-family:' + F + ';font-size:15px;font-weight:700;color:' + C.charcoal + ';line-height:1.2">Mike Kato</div>'
      + '<div style="font-family:' + F + ';font-size:12px;color:' + C.teal + ';font-weight:600;margin-top:2px">Co-founder &#8212; AskMiro Cleaning Services</div></td>'
      + '</tr></table>'
      + '<table cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>'
      + '<td style="padding-right:22px"><a href="tel:02080730621" style="font-family:' + F + ';font-size:12px;color:' + C.slate + ';text-decoration:none"><span style="color:' + C.teal + ';margin-right:4px">&#9742;</span>020 8073 0621</a></td>'
      + '<td style="padding-right:22px"><a href="mailto:info@askmiro.com" style="font-family:' + F + ';font-size:12px;color:' + C.slate + ';text-decoration:none"><span style="color:' + C.teal + ';margin-right:4px">&#9993;</span>info@askmiro.com</a></td>'
      + '<td><a href="https://www.askmiro.com" style="font-family:' + F + ';font-size:12px;color:' + C.teal + ';font-weight:600;text-decoration:none">www.askmiro.com</a></td>'
      + '</tr></table>'
      + '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px"><tr><td style="padding:10px 16px;background:' + C.tealGhost + ';border:1px solid ' + C.tealLight + ';border-radius:8px">'
      + '<table cellpadding="0" cellspacing="0"><tr>'
      + '<td style="padding-right:18px;font-family:' + F + ';font-size:11px;color:' + C.teal + ';font-weight:600">&#10003; Fully Insured</td>'
      + '<td style="padding-right:18px;font-family:' + F + ';font-size:11px;color:' + C.teal + ';font-weight:600">&#10003; COSHH Compliant</td>'
      + '<td style="padding-right:18px;font-family:' + F + ';font-size:11px;color:' + C.teal + ';font-weight:600">&#10003; ISO Standards</td>'
      + '<td style="font-family:' + F + ';font-size:11px;color:' + C.teal + ';font-weight:600">&#10003; London &amp; UK</td>'
      + '</tr></table></td></tr></table>'
      + '</td></tr></table>'
      + '</td></tr>'
      // Footer
      + '<tr><td style="background:' + C.charcoal + ';border-radius:0 0 12px 12px;padding:22px 36px">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
      + '<td><div style="font-family:' + F + ';font-size:13px;font-weight:700;color:rgba(255,255,255,0.75)">AskMiro Cleaning Services</div>'
      + '<div style="font-family:' + F + ';font-size:11px;color:rgba(255,255,255,0.28);margin-top:3px">A trading name of Miro Partners Ltd &nbsp;&bull;&nbsp; London &amp; UK</div></td>'
      + '<td align="right" style="vertical-align:top"><a href="https://www.askmiro.com" style="font-family:' + F + ';font-size:12px;color:' + C.tealMid + ';text-decoration:none;font-weight:700">www.askmiro.com</a></td>'
      + '</tr><tr><td colspan="2" style="padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)">'
      + '<table cellpadding="0" cellspacing="0"><tr>'
      + '<td style="padding-right:18px;font-family:' + F + ';font-size:11px;color:rgba(255,255,255,0.28)">&#10003; Fully Insured</td>'
      + '<td style="padding-right:18px;font-family:' + F + ';font-size:11px;color:rgba(255,255,255,0.28)">&#10003; COSHH Compliant</td>'
      + '<td style="font-family:' + F + ';font-size:11px;color:rgba(255,255,255,0.28)">&#10003; Residential &amp; Commercial</td>'
      + '</tr></table>'
      + '<p style="font-family:' + F + ';font-size:10px;color:rgba(255,255,255,0.18);margin:14px 0 0;line-height:1.7">'
      + 'Sent by Mike Kato on behalf of AskMiro Cleaning Services. Reply to: info@askmiro.com. If received in error please notify info@askmiro.com.<br>'
      + 'We will never share your details with third parties.</p>'
      + '</td></tr></table></td></tr>'
      + '</table></td></tr></table></body></html>';
  }

  // ── Preview client email in new tab ──────────────────────
  function previewClientEmail() {
    var d = _collectOneOffData();
    if (!d.client || d.client === 'Client') { UI.toast('Client name required', 'r'); return; }
    if (d.gross <= 0) { UI.toast('Add line items or total first', 'r'); return; }
    var html = generateClientEmail(d);
    var w = window.open('', '_blank', 'width=700,height=900');
    if (w) { w.document.write(html); w.document.close(); }
    else { UI.toast('Pop-up blocked — allow pop-ups', 'r'); }
  }

  // ── Download email HTML file ─────────────────────────────
  function downloadClientEmail() {
    var d = _collectOneOffData();
    if (!d.client || d.client === 'Client') { UI.toast('Client name required', 'r'); return; }
    if (d.gross <= 0) { UI.toast('Add line items or total first', 'r'); return; }
    var html = generateClientEmail(d);
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'email-' + d.clientSlug + '.html';
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('Email downloaded: email-' + d.clientSlug + '.html', 'g');
  }

  return {
    render, calc, toggleMode, save, openNew,
    openView, openSend, doSend, openApprove, doApprove,
    setFilter, openViewById, _sendProposal, loadIntoBuilder, runIntel,
    previewClientQuote, convertToInvoice, _addLine,
    loadAndPreviewPdf, loadAndConvertInvoice,
    generateClientEmail, previewClientEmail, downloadClientEmail,
  };

  function loadAndPreviewPdf(id) {
    const q = _byId[id];
    if (!q) return;
    _loadOneOffIntoBuilder(q);
    setTimeout(function() { previewClientQuote(); }, 100);
  }

  function loadAndConvertInvoice(id) {
    const q = _byId[id];
    if (!q) return;
    _loadOneOffIntoBuilder(q);
    setTimeout(function() { convertToInvoice(); }, 100);
  }

  function _loadOneOffIntoBuilder(q) {
    var set = function(id, val) { var el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
    set('q-cl', q.clientName);
    set('q-sa', q.siteAddress);
    set('q-sg', q.segment || q.sector);
    set('q-md', 'one_off');
    toggleMode();

    // Parse structured data from notes
    var notes = q.notes || '';
    var emailMatch = notes.match(/CLIENT_EMAIL:\s*(.+)/);
    var dateMatch = notes.match(/JOB_DATE:\s*(.+)/);
    var timeMatch = notes.match(/JOB_TIME:\s*(.+)/);
    var stypeMatch = notes.match(/SERVICE_TYPE:\s*(.+)/);
    var propMatch = notes.match(/PROP_DETAILS:\s*(.+)/);
    var vatMatch = notes.match(/VAT_RATE:\s*(.+)/);
    var scopeMatch = notes.match(/SCOPE:\s*(.+)/);
    var itemsMatch = notes.match(/LINE_ITEMS:\s*(\[.+\])/);
    var payMatch = notes.match(/PAYMENT_LINK:\s*(.+)/);
    if (emailMatch) set('q-email', emailMatch[1].trim());
    if (dateMatch) set('q-jdate', dateMatch[1].trim());
    if (timeMatch) set('q-jtime', timeMatch[1].trim());
    if (stypeMatch) set('q-stype', stypeMatch[1].trim());
    if (propMatch) set('q-prop', propMatch[1].trim());
    if (vatMatch) set('q-vat', vatMatch[1].trim());
    if (payMatch) set('q-paylink', payMatch[1].trim());
    if (scopeMatch) {
      try { var scopeArr = JSON.parse(scopeMatch[1]); set('q-scope', scopeArr.join('\n')); } catch(e) { set('q-scope', scopeMatch[1].trim()); }
    }

    var cleanNotes = notes.replace(/CLIENT_EMAIL:.+/g, '').replace(/JOB_DATE:.+/g, '').replace(/JOB_TIME:.+/g, '').replace(/SERVICE_TYPE:.+/g, '').replace(/PROP_DETAILS:.+/g, '').replace(/VAT_RATE:.+/g, '').replace(/SCOPE:.+/g, '').replace(/LINE_ITEMS:.+/g, '').replace(/PAYMENT_LINK:.+/g, '').trim();
    set('q-nt', cleanNotes);

    if (itemsMatch) {
      try {
        var items = JSON.parse(itemsMatch[1]);
        var linesEl = document.getElementById('q-lines');
        if (linesEl && items.length) {
          linesEl.innerHTML = '';
          items.forEach(function(li) {
            var d = document.createElement('div');
            d.className = 'fr';
            d.style.marginBottom = '6px';
            d.style.alignItems = 'center';
            d.innerHTML = '<div class="fg" style="flex:3"><input class="fin" style="font-size:12px" value="' + _escHtml(li.description || '') + '" data-ql="desc"></div>'
              + '<div class="fg" style="flex:1"><input class="fin" type="number" step="1" style="font-size:12px" value="' + (li.amount || 0) + '" data-ql="amt" oninput="Quotes.calc()"></div>'
              + '<button type="button" onclick="this.closest(\'.fr\').remove();Quotes.calc()" style="padding:0 8px;background:none;border:none;color:#94A3B8;cursor:pointer;font-size:16px">&#x2715;</button>';
            linesEl.appendChild(d);
          });
        }
      } catch(e) {}
    }
    calc();
  }
})();

// ✅ Make it work in module/bundled environments
try { window.Quotes = Quotes; } catch (e) {}
