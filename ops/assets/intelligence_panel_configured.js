// ============================================================
// ASKMIRO INTELLIGENCE PANEL — CONFIGURED FOR PRODUCTION
// Your GAS URL + token are already set below.
// ============================================================
//
// HOW TO ADD THIS TO YOUR OPS SPA:
// ─────────────────────────────────────────────────────────────
// 1. Add this script tag to your Ops HTML page (before </body>):
//
//      <script src="intelligence_panel_configured.js"></script>
//
// 2. In your Quotes view, add an empty div where you want the
//    panel to appear. Give it an id, e.g.:
//
//      <div id="intel-panel-container"></div>
//
// 3. When admin opens a draft quote, call ONE line:
//
//      IntelPanel.init('QUOTE-ID-HERE', 'intel-panel-container');
//
//    The panel will load, show the 3 pricing scenarios, risk
//    flags, and the Apply button automatically.
//
// 4. When admin clicks Apply, the panel fires a custom event
//    you can listen to if you need to react in your SPA:
//
//      window.addEventListener('intelApplied', function(e) {
//        console.log(e.detail); // { quoteId, scenario, values }
//        // e.g. refresh your quote form fields
//      });
//
// ─────────────────────────────────────────────────────────────
// THAT'S IT. Nothing else needed for the panel itself.
// ─────────────────────────────────────────────────────────────

const IntelPanel = (() => {

  // ── YOUR CREDENTIALS — already configured ────────────────
  const API_URL   = 'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec';
  const API_TOKEN = 'miro_3344ce9888eb4d63935450f0309b626d';

  // ── STATE ────────────────────────────────────────────────
  let _state = {
    quoteId:        null,
    intel:          null,
    chosenScenario: null,
    wageAdjust:     0     // 0 / 5 / 10
  };

  // ============================================================
  // PUBLIC: Initialise panel for a quote
  // Call this when admin opens a draft quote from web lead.
  //
  // Usage:
  //   IntelPanel.init('QUOTE-ABC123', 'intel-panel-container');
  // ============================================================
  async function init(quoteId, containerId) {
    _state.quoteId = quoteId;
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('IntelPanel: container #' + containerId + ' not found in DOM');
      return;
    }

    container.innerHTML = _renderSkeleton();

    try {
      const data = await _fetchIntel(quoteId);
      if (!data.ok) throw new Error(data.error || 'Backend returned ok:false');
      _state.intel = data;
      container.innerHTML = _renderPanel(data);
      _bindEvents(container);
    } catch (err) {
      console.error('IntelPanel error:', err);
      container.innerHTML = _renderError(err.message);
    }
  }

  // ============================================================
  // FETCH INTEL FROM BACKEND
  // Uses your GAS doGet with JSONP to avoid CORS issues
  // ============================================================
  function _fetchIntel(quoteId) {
    return new Promise((resolve, reject) => {
      const cbName = '_intelCb_' + Date.now();
      const script = document.createElement('script');

      window[cbName] = function(data) {
        delete window[cbName];
        document.body.removeChild(script);
        resolve(data);
      };

      const params = new URLSearchParams({
        _token:   API_TOKEN,
        action:   'quote.intel',
        id:       quoteId,
        callback: cbName
      });

      script.src = API_URL + '?' + params.toString();
      script.onerror = () => reject(new Error('Network error fetching intel'));
      document.body.appendChild(script);

      // Timeout after 10s
      setTimeout(() => {
        if (window[cbName]) {
          delete window[cbName];
          reject(new Error('Request timed out'));
        }
      }, 10000);
    });
  }

  // ============================================================
  // RENDER — MAIN PANEL
  // ============================================================
  function _renderPanel(intel) {
    const risks = _parseRisks(intel.riskFlags || '');
    return `
      <div class="intel-panel" id="intel-panel">

        <!-- Header -->
        <div class="intel-header">
          <div class="intel-title">
            <span class="intel-icon">◈</span>
            <span>AskMiro Intelligence</span>
            <span class="intel-badge ${intel.dataQuality === 'actual' ? 'badge-green' : 'badge-amber'}">
              ${intel.dataQuality === 'actual' ? '✓ Actual data' : '~ Estimated'}
            </span>
          </div>
          <button class="intel-collapse" onclick="IntelPanel._toggleCollapse()">▾</button>
        </div>

        <!-- Body -->
        <div class="intel-body" id="intel-body">

          <!-- Key estimates row -->
          <div class="intel-estimates">
            <div class="intel-stat">
              <div class="stat-label">Hours / week</div>
              <div class="stat-value">${intel.hoursPerWeek}</div>
            </div>
            <div class="intel-stat">
              <div class="stat-label">Visits / week</div>
              <div class="stat-value">${intel.visitsPerWeek}</div>
            </div>
            <div class="intel-stat">
              <div class="stat-label">Supplies / mo</div>
              <div class="stat-value">£${Number(intel.suppliesPerMonth).toFixed(0)}</div>
            </div>
            <div class="intel-stat">
              <div class="stat-label">Direct cost / mo</div>
              <div class="stat-value">£${Number(intel.directCostPerMonth).toFixed(0)}</div>
            </div>
          </div>

          <!-- Wage sensitivity toggle -->
          <div class="intel-sensitivity">
            <label class="sense-label">Wage sensitivity</label>
            <div class="sense-buttons">
              <button class="sense-btn active" data-adjust="0"
                onclick="IntelPanel._setWageAdjust(0, this)">Current</button>
              <button class="sense-btn" data-adjust="5"
                onclick="IntelPanel._setWageAdjust(5, this)">+5% wage</button>
              <button class="sense-btn" data-adjust="10"
                onclick="IntelPanel._setWageAdjust(10, this)">+10% wage</button>
            </div>
          </div>

          <!-- Pricing scenarios — click one then hit Apply -->
          <div class="intel-scenarios">
            ${_renderScenario('aggressive', intel.scenarios.aggressive, '🔵 Aggressive', 'Win rate priority')}
            ${_renderScenario('balanced',   intel.scenarios.balanced,   '🟢 Balanced',   'Recommended')}
            ${_renderScenario('protected',  intel.scenarios.protected,  '🟡 Protected',  'Margin-safe')}
          </div>

          <!-- Apply button -->
          <div class="intel-apply-row">
            <span class="apply-label" id="apply-label">Select a scenario above, then apply →</span>
            <button class="btn-apply" id="btn-apply" disabled
              onclick="IntelPanel._applyScenario()">
              Apply to Quote
            </button>
          </div>

          <!-- Risk flags (only shown if any exist) -->
          ${risks.length > 0 ? _renderRisks(risks) : ''}

        </div>
      </div>
    `;
  }

  function _renderScenario(key, scenario, label, subtitle) {
    return `
      <div class="scenario-card" id="scenario-${key}"
           onclick="IntelPanel._selectScenario('${key}', this)">
        <div class="sc-label">${label}</div>
        <div class="sc-sub">${subtitle}</div>
        <div class="sc-price">£${Number(scenario.revenuePerMonth).toFixed(0)}<span>/mo</span></div>
        <div class="sc-detail">
          £${Number(scenario.revenuePerWeek).toFixed(0)}/wk
          · £${Number(scenario.hourlyRate).toFixed(2)}/hr
          · ${scenario.marginPct || scenario.effectiveMargin}% margin
        </div>
      </div>
    `;
  }

  function _renderRisks(risks) {
    if (!risks.length) return '';
    const items = risks.map(r => `
      <div class="risk-item risk-${r.severity}">
        <div class="risk-icon">${r.severity === 'high' ? '⚠' : r.severity === 'medium' ? '●' : '○'}</div>
        <div class="risk-text">
          <div class="risk-msg">${r.message}</div>
          <div class="risk-action">${r.action}</div>
        </div>
      </div>
    `).join('');
    return `
      <div class="intel-risks">
        <div class="risks-title">Risk Flags (${risks.length})</div>
        ${items}
      </div>
    `;
  }

  function _renderSkeleton() {
    return `
      <div class="intel-panel intel-loading">
        <div class="intel-header">
          <span class="intel-icon">◈</span>
          <span style="color:#6b8fa8;margin-left:8px">AskMiro Intelligence — loading</span>
          <span class="loading-dots">···</span>
        </div>
      </div>
    `;
  }

  function _renderError(msg) {
    return `
      <div class="intel-panel intel-error">
        <div class="intel-header">
          <span class="intel-icon">◈</span>
          <span style="margin-left:8px">AskMiro Intelligence</span>
          <span class="badge-red" style="margin-left:8px">Error</span>
        </div>
        <div class="intel-err-msg">⚠ Could not load: ${msg}</div>
      </div>
    `;
  }

  // ============================================================
  // INTERACTIONS
  // ============================================================

  function _selectScenario(key, el) {
    document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    _state.chosenScenario = key;

    const btn   = document.getElementById('btn-apply');
    const label = document.getElementById('apply-label');
    if (btn) btn.disabled = false;
    if (label) {
      const s = _getActiveScenario(key);
      if (s) label.textContent = `${key.charAt(0).toUpperCase() + key.slice(1)}: £${Number(s.revenuePerMonth).toFixed(0)}/mo · £${Number(s.hourlyRate).toFixed(2)}/hr`;
    }
  }

  function _applyScenario() {
    if (!_state.chosenScenario || !_state.intel) return;
    const s = _getActiveScenario(_state.chosenScenario);
    if (!s) return;

    // ── Populate existing quote form fields ──────────────────
    // These IDs match the standard Ops quote form.
    // If your field IDs differ, update the left-hand values.
    _setField('quoteRatePerMonth',     s.revenuePerMonth.toFixed(2));
    _setField('quoteRatePerWeek',      s.revenuePerWeek.toFixed(2));
    _setField('quoteHourlyRate',       s.hourlyRate.toFixed(2));
    _setField('quoteHoursPerWeek',     _state.intel.hoursPerWeek);
    _setField('quoteSuppliesPerMonth', Number(_state.intel.suppliesPerMonth).toFixed(2));
    _setField('quoteChosenScenario',   _state.chosenScenario);

    // Visual confirmation on button
    const btn = document.getElementById('btn-apply');
    if (btn) {
      btn.textContent = '✓ Applied';
      btn.classList.add('applied');
      setTimeout(() => {
        btn.textContent = 'Apply to Quote';
        btn.classList.remove('applied');
      }, 2500);
    }

    // Fire custom event — your SPA can listen to this
    // window.addEventListener('intelApplied', e => { ... })
    window.dispatchEvent(new CustomEvent('intelApplied', {
      detail: {
        quoteId:      _state.quoteId,
        scenario:     _state.chosenScenario,
        values:       s,
        hoursPerWeek: _state.intel.hoursPerWeek,
        supplies:     _state.intel.suppliesPerMonth
      }
    }));
  }

  function _setWageAdjust(pct, btn) {
    _state.wageAdjust = pct;
    document.querySelectorAll('.sense-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const intel = _state.intel;
    if (!intel) return;

    let sens = null;
    if (pct === 5  && intel.sensitivity) sens = intel.sensitivity.wage5pct;
    if (pct === 10 && intel.sensitivity) sens = intel.sensitivity.wage10pct;

    const balCard = document.getElementById('scenario-balanced');
    if (!balCard) return;

    const src = sens || intel.scenarios?.balanced;
    if (!src) return;

    balCard.querySelector('.sc-price').innerHTML =
      `£${Number(src.revenuePerMonth).toFixed(0)}<span>/mo</span>`;
    balCard.querySelector('.sc-detail').textContent =
      `£${Number(src.revenuePerWeek).toFixed(0)}/wk`
      + ` · £${Number(src.hourlyRate).toFixed(2)}/hr`
      + ` · ${src.marginPct || 25}% margin`;
  }

  function _toggleCollapse() {
    const body = document.getElementById('intel-body');
    const btn  = document.querySelector('.intel-collapse');
    if (!body) return;
    const isCollapsed = body.style.display === 'none';
    body.style.display = isCollapsed ? 'block' : 'none';
    if (btn) btn.textContent = isCollapsed ? '▾' : '▸';
  }

  function _bindEvents(container) {
    container.querySelectorAll('.scenario-card').forEach(card => {
      card.setAttribute('tabindex', '0');
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter') card.click();
      });
    });
  }

  // ── HELPERS ───────────────────────────────────────────────

  function _getActiveScenario(key) {
    const intel = _state.intel;
    if (!intel) return null;
    if (_state.wageAdjust === 5  && key === 'balanced' && intel.sensitivity?.wage5pct)
      return intel.sensitivity.wage5pct;
    if (_state.wageAdjust === 10 && key === 'balanced' && intel.sensitivity?.wage10pct)
      return intel.sensitivity.wage10pct;
    return intel.scenarios?.[key] || null;
  }

  function _parseRisks(riskString) {
    if (!riskString) return [];
    return riskString.split(' | ').filter(Boolean).map(r => {
      const sevMatch  = r.match(/\[(HIGH|MEDIUM|LOW)\]/);
      const codeMatch = r.match(/\] ([A-Z_]+):/);
      const msgMatch  = r.match(/: (.+)$/);
      const actionMap = {
        'DEEP_CLEAN_FREQ_MISMATCH': 'Clarify scope before pricing',
        'TRAVEL_HIGH':              'Consider travel surcharge',
        'WAGE_SENSITIVITY':         'Use Balanced or Protected scenario',
        'SUPPLIES_BELOW_MIN':       'Apply minimum supplies floor',
        'SMALL_JOB':                'Confirm minimum contract value',
        'AREA_ESTIMATED':           'Request actual m² from client',
        'ONE_OFF_CLEAN':            'Price at Protected scenario minimum'
      };
      const code = codeMatch?.[1] || '';
      return {
        severity: (sevMatch?.[1] || 'low').toLowerCase(),
        code:     code,
        message:  msgMatch?.[1] || r,
        action:   actionMap[code] || ''
      };
    });
  }

  function _setField(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── EXPOSE PUBLIC API ─────────────────────────────────────
  return {
    init,
    _selectScenario,
    _applyScenario,
    _setWageAdjust,
    _toggleCollapse
  };

})();


// ============================================================
// CSS — auto-injected when script loads
// ============================================================
(function injectIntelStyles() {
  if (document.getElementById('intel-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'intel-panel-styles';
  style.textContent = `
    .intel-panel {
      background:    #0f1923;
      border:        1px solid #1e3040;
      border-radius: 10px;
      overflow:      hidden;
      font-family:   inherit;
      margin-bottom: 20px;
    }
    .intel-header {
      display:       flex;
      align-items:   center;
      gap:           10px;
      padding:       12px 16px;
      background:    #141f2c;
      border-bottom: 1px solid #1e3040;
    }
    .intel-title {
      display:     flex;
      align-items: center;
      gap:         8px;
      font-weight: 600;
      font-size:   14px;
      color:       #e8f4f3;
      flex:        1;
    }
    .intel-icon   { color: #0D9488; font-size: 16px; }
    .intel-collapse {
      background: none; border: none; color: #6b8fa8;
      cursor: pointer; font-size: 16px; padding: 0 4px;
    }
    .intel-badge, .badge-green, .badge-amber, .badge-red {
      font-size: 10px; font-weight: 600; padding: 2px 8px;
      border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .badge-green { background: #0D9488; color: #fff; }
    .badge-amber { background: #d97706; color: #fff; }
    .badge-red   { background: #dc2626; color: #fff; }
    .intel-body  { padding: 16px; }
    .intel-estimates {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 10px; margin-bottom: 16px;
    }
    .intel-stat {
      background: #141f2c; border: 1px solid #1e3040;
      border-radius: 8px; padding: 10px 12px; text-align: center;
    }
    .stat-label {
      font-size: 10px; color: #6b8fa8; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 4px;
    }
    .stat-value { font-size: 18px; font-weight: 700; color: #e8f4f3; }
    .intel-sensitivity {
      display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
    }
    .sense-label { font-size: 12px; color: #6b8fa8; white-space: nowrap; }
    .sense-buttons { display: flex; gap: 6px; }
    .sense-btn {
      font-size: 12px; padding: 4px 12px; border-radius: 20px;
      border: 1px solid #1e3040; background: #141f2c;
      color: #8faec4; cursor: pointer; transition: all 0.15s;
    }
    .sense-btn:hover, .sense-btn.active {
      background: #0D9488; border-color: #0D9488; color: #fff;
    }
    .intel-scenarios {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px; margin-bottom: 14px;
    }
    .scenario-card {
      background: #141f2c; border: 2px solid #1e3040;
      border-radius: 10px; padding: 14px;
      cursor: pointer; transition: all 0.15s; user-select: none;
    }
    .scenario-card:hover  { border-color: #0D9488; background: #162330; }
    .scenario-card.selected {
      border-color: #0D9488; background: #0d2420;
      box-shadow: 0 0 0 1px #0D9488;
    }
    .sc-label  { font-size: 13px; font-weight: 600; color: #e8f4f3; margin-bottom: 2px; }
    .sc-sub    { font-size: 10px; color: #6b8fa8; margin-bottom: 10px; }
    .sc-price  { font-size: 22px; font-weight: 700; color: #0D9488; line-height: 1; margin-bottom: 6px; }
    .sc-price span { font-size: 12px; font-weight: 400; color: #6b8fa8; }
    .sc-detail { font-size: 11px; color: #6b8fa8; }
    .intel-apply-row {
      display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
    }
    .apply-label { font-size: 12px; color: #6b8fa8; flex: 1; }
    .btn-apply {
      background: #0D9488; color: #fff; border: none;
      border-radius: 8px; padding: 8px 20px;
      font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
    }
    .btn-apply:disabled { background: #1e3040; color: #4a6a80; cursor: not-allowed; }
    .btn-apply:hover:not(:disabled) { background: #0f766e; }
    .btn-apply.applied { background: #059669; }
    .intel-risks { border-top: 1px solid #1e3040; padding-top: 14px; }
    .risks-title {
      font-size: 11px; font-weight: 600; color: #6b8fa8;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
    }
    .risk-item {
      display: flex; gap: 10px; padding: 8px 10px;
      border-radius: 6px; margin-bottom: 6px; font-size: 12px;
    }
    .risk-high   { background: rgba(220,38,38,0.12); border-left: 3px solid #dc2626; }
    .risk-medium { background: rgba(217,119,6,0.12);  border-left: 3px solid #d97706; }
    .risk-low    { background: rgba(75,85,99,0.15);   border-left: 3px solid #4b5563; }
    .risk-high   .risk-icon { color: #f87171; }
    .risk-medium .risk-icon { color: #fbbf24; }
    .risk-low    .risk-icon { color: #9ca3af; }
    .risk-msg    { color: #cbd5e1; font-weight: 500; }
    .risk-action { color: #6b8fa8; margin-top: 2px; }
    .intel-loading .intel-header { color: #6b8fa8; }
    .loading-dots { letter-spacing: 3px; animation: blink 1.2s infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .intel-err-msg { padding: 14px 16px; font-size: 13px; color: #f87171; }
    @media (max-width: 700px) {
      .intel-estimates { grid-template-columns: repeat(2, 1fr); }
      .intel-scenarios { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
})();
