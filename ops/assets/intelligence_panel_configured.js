// ============================================================
// ASKMIRO OPS — INTELLIGENCE PANEL
// Version: 2.2 — live API wiring, applyScenario POST fix
// ============================================================

const IntelPanel = (() => {

  const API_URL   = 'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec';
  const API_TOKEN = 'miro_3344ce9888eb4d63935450f0309b626d';

  let _state = { quoteId: null, intel: null, chosenScenario: null, wageAdjust: 0 };

  async function init(quoteId, containerId) {
    _state.quoteId = quoteId; _state.intel = null; _state.chosenScenario = null; _state.wageAdjust = 0;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = _renderSkeleton();
    try {
      const intel = await _fetchIntel(quoteId);
      _state.intel = intel;
      container.innerHTML = _renderPanel(intel);
      _bindEvents(container);
    } catch (err) { container.innerHTML = _renderError(err.message); }
  }

  async function _fetchIntel(quoteId) {
    const qs = new URLSearchParams({ _token: API_TOKEN, action: 'quote.intel', id: quoteId });
    const res  = await fetch(API_URL + '?' + qs.toString());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Intel data not available for this quote');
    return data;
  }

  function _renderPanel(intel) {
    const risks = _parseRisks(intel.riskFlags || '');
    return `
      <div class="intel-panel" id="intel-panel">
        <div class="intel-header">
          <div class="intel-title">
            <span class="intel-icon">&#9672;</span>
            <span>AskMiro Intelligence</span>
            <span class="intel-badge ${intel.dataQuality === 'actual' ? 'badge-green' : 'badge-amber'}">
              ${intel.dataQuality === 'actual' ? 'Actual data' : 'Estimated'}
            </span>
          </div>
          <button class="intel-collapse" onclick="IntelPanel._toggleCollapse()">&#9662;</button>
        </div>
        <div class="intel-body" id="intel-body">
          <div class="intel-estimates">
            <div class="intel-stat"><div class="stat-label">Hours / week</div><div class="stat-value">${intel.hoursPerWeek}</div></div>
            <div class="intel-stat"><div class="stat-label">Visits / week</div><div class="stat-value">${intel.visitsPerWeek}</div></div>
            <div class="intel-stat"><div class="stat-label">Supplies / mo</div><div class="stat-value">&#163;${Number(intel.suppliesPerMonth).toFixed(0)}</div></div>
            <div class="intel-stat"><div class="stat-label">Direct cost / mo</div><div class="stat-value">&#163;${Number(intel.directCostPerMonth).toFixed(0)}</div></div>
          </div>
          <div class="intel-sensitivity">
            <label class="sense-label">Wage sensitivity</label>
            <div class="sense-buttons">
              <button class="sense-btn active" onclick="IntelPanel._setWageAdjust(0, this)">Current</button>
              <button class="sense-btn" onclick="IntelPanel._setWageAdjust(5, this)">+5% wage</button>
              <button class="sense-btn" onclick="IntelPanel._setWageAdjust(10, this)">+10% wage</button>
            </div>
          </div>
          <div class="intel-scenarios">
            ${_renderScenario('aggressive', intel.scenarios.aggressive, '&#x1F535; Aggressive', 'Win rate priority')}
            ${_renderScenario('balanced',   intel.scenarios.balanced,   '&#x1F7E2; Balanced',   'Recommended')}
            ${_renderScenario('protected',  intel.scenarios.protected,  '&#x1F7E1; Protected',  'Margin-safe')}
          </div>
          <div class="intel-apply-row">
            <span class="apply-label" id="apply-label">Select a scenario to apply &#8594;</span>
            <button class="btn-apply" id="btn-apply" disabled onclick="IntelPanel._applyScenario()">Apply to Quote</button>
          </div>
          ${risks.length > 0 ? _renderRisks(risks) : ''}
        </div>
      </div>`;
  }

  function _renderScenario(key, scenario, label, subtitle) {
    return `
      <div class="scenario-card" id="scenario-${key}" onclick="IntelPanel._selectScenario('${key}', this)">
        <div class="sc-label">${label}</div>
        <div class="sc-sub">${subtitle}</div>
        <div class="sc-price">&#163;${Number(scenario.revenuePerMonth).toFixed(0)}<span>/mo</span></div>
        <div class="sc-detail">&#163;${Number(scenario.revenuePerWeek).toFixed(0)}/wk &middot; &#163;${Number(scenario.hourlyRate).toFixed(2)}/hr &middot; ${scenario.marginPct || scenario.effectiveMargin}% margin</div>
      </div>`;
  }

  function _renderRisks(risks) {
    if (!risks.length) return '';
    return `<div class="intel-risks"><div class="risks-title">Risk Flags (${risks.length})</div>${risks.map(r => `
      <div class="risk-item risk-${r.severity}">
        <div class="risk-icon">${r.severity === 'high' ? '&#9888;' : r.severity === 'medium' ? '&#9679;' : '&#9675;'}</div>
        <div class="risk-text"><div class="risk-msg">${r.message}</div><div class="risk-action">${r.action}</div></div>
      </div>`).join('')}</div>`;
  }

  function _renderSkeleton() {
    return `<div class="intel-panel intel-loading"><div class="intel-header"><span class="intel-icon">&#9672;</span><span style="color:#6b8fa8;margin-left:4px">AskMiro Intelligence</span><span class="loading-dots" style="color:#6b8fa8;margin-left:6px">&#183;&#183;&#183;</span></div></div>`;
  }

  function _renderError(msg) {
    return `<div class="intel-panel intel-error"><div class="intel-header"><span class="intel-icon">&#9672;</span><span style="margin-left:4px">AskMiro Intelligence</span><span class="badge-red" style="margin-left:8px">Error</span></div><div class="intel-err-msg">Could not load intelligence data: ${msg}</div></div>`;
  }

  function _selectScenario(key, el) {
    document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    _state.chosenScenario = key;
    const btn = document.getElementById('btn-apply');
    const label = document.getElementById('apply-label');
    if (btn) btn.disabled = false;
    if (label) {
      const s = _getActiveScenario(key);
      if (s) label.textContent = '\u00A3' + Number(s.revenuePerMonth).toFixed(0) + '/mo \u00B7 \u00A3' + Number(s.hourlyRate).toFixed(2) + '/hr';
    }
  }

  // ── KEY FIX v2.2: now POSTs to backend before updating DOM ──
  async function _applyScenario() {
    if (!_state.chosenScenario || !_state.intel) return;
    const s = _getActiveScenario(_state.chosenScenario);
    if (!s) return;

    const btn = document.getElementById('btn-apply');
    if (btn) { btn.disabled = true; btn.textContent = 'Applying\u2026'; }

    try {
      const params = new URLSearchParams({
        _token:   API_TOKEN,
        action:   'quote.intel.apply',
        id:       _state.quoteId,
        scenario: _state.chosenScenario
      });

      const res  = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString()
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Apply failed');

      _setField('q-cr', s.hourlyRate.toFixed(2));
      _setField('q-hw', _state.intel.hoursPerWeek);
      _setField('q-sp', Number(_state.intel.suppliesPerMonth).toFixed(2));

      if (btn) {
        btn.textContent = '\u2713 Applied';
        btn.classList.add('applied');
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Apply to Quote'; btn.classList.remove('applied'); }, 2500);
      }

      window.dispatchEvent(new CustomEvent('intelApplied', {
        detail: { quoteId: _state.quoteId, scenario: _state.chosenScenario, values: s, hoursPerWeek: _state.intel.hoursPerWeek, supplies: _state.intel.suppliesPerMonth }
      }));

    } catch (err) {
      if (btn) {
        btn.textContent = '\u2717 Failed \u2014 retry';
        btn.disabled = false;
        btn.style.background = '#dc2626';
        setTimeout(() => { btn.textContent = 'Apply to Quote'; btn.style.background = ''; }, 3000);
      }
      console.error('IntelPanel._applyScenario error:', err.message);
    }
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
    const src = sens || (intel.scenarios && intel.scenarios.balanced);
    if (!src) return;
    balCard.querySelector('.sc-price').innerHTML = '\u00A3' + Number(src.revenuePerMonth).toFixed(0) + '<span>/mo</span>';
    balCard.querySelector('.sc-detail').textContent = '\u00A3' + Number(src.revenuePerWeek).toFixed(0) + '/wk \u00B7 \u00A3' + Number(src.hourlyRate).toFixed(2) + '/hr \u00B7 ' + (src.marginPct || 25) + '% margin';
  }

  function _toggleCollapse() {
    const body = document.getElementById('intel-body');
    const btn  = document.querySelector('.intel-collapse');
    if (!body) return;
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    if (btn) btn.innerHTML = collapsed ? '&#9662;' : '&#9656;';
  }

  function _bindEvents(container) {
    container.querySelectorAll('.scenario-card').forEach(card => {
      card.setAttribute('tabindex', '0');
      card.addEventListener('keydown', e => { if (e.key === 'Enter') card.click(); });
    });
  }

  function _getActiveScenario(key) {
    const intel = _state.intel;
    if (!intel) return null;
    if (_state.wageAdjust === 5  && key === 'balanced' && intel.sensitivity && intel.sensitivity.wage5pct)  return intel.sensitivity.wage5pct;
    if (_state.wageAdjust === 10 && key === 'balanced' && intel.sensitivity && intel.sensitivity.wage10pct) return intel.sensitivity.wage10pct;
    return (intel.scenarios && intel.scenarios[key]) || null;
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
        'AREA_ESTIMATED':           'Request actual m\u00B2 from client',
        'ONE_OFF_CLEAN':            'Price at Protected scenario minimum'
      };
      const code = codeMatch ? codeMatch[1] : '';
      return { severity: (sevMatch ? sevMatch[1] : 'low').toLowerCase(), code, message: msgMatch ? msgMatch[1] : r, action: actionMap[code] || '' };
    });
  }

  function _setField(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return { init, _selectScenario, _applyScenario, _setWageAdjust, _toggleCollapse };

})();


// ============================================================
// CSS — injected once into <head>
// ============================================================
(function injectIntelStyles() {
  if (document.getElementById('intel-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'intel-panel-styles';
  style.textContent = [
    '.intel-panel{background:#0f1923;border:1px solid #1e3040;border-radius:10px;overflow:hidden;font-family:inherit;margin-bottom:20px}',
    '.intel-header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#141f2c;border-bottom:1px solid #1e3040}',
    '.intel-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;color:#e8f4f3;flex:1}',
    '.intel-icon{color:#0D9488;font-size:16px}',
    '.intel-collapse{background:none;border:none;color:#6b8fa8;cursor:pointer;font-size:16px;padding:0 4px}',
    '.intel-badge,.badge-green,.badge-amber,.badge-red{font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px}',
    '.badge-green{background:#0D9488;color:#fff}',
    '.badge-amber{background:#d97706;color:#fff}',
    '.badge-red{background:#dc2626;color:#fff}',
    '.intel-body{padding:16px}',
    '.intel-estimates{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}',
    '.intel-stat{background:#141f2c;border:1px solid #1e3040;border-radius:8px;padding:10px 12px;text-align:center}',
    '.stat-label{font-size:10px;color:#6b8fa8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}',
    '.stat-value{font-size:18px;font-weight:700;color:#e8f4f3}',
    '.intel-sensitivity{display:flex;align-items:center;gap:12px;margin-bottom:16px}',
    '.sense-label{font-size:12px;color:#6b8fa8;white-space:nowrap}',
    '.sense-buttons{display:flex;gap:6px}',
    '.sense-btn{font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid #1e3040;background:#141f2c;color:#8faec4;cursor:pointer;transition:all 0.15s}',
    '.sense-btn:hover,.sense-btn.active{background:#0D9488;border-color:#0D9488;color:#fff}',
    '.intel-scenarios{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}',
    '.scenario-card{background:#141f2c;border:2px solid #1e3040;border-radius:10px;padding:14px;cursor:pointer;transition:all 0.15s;user-select:none}',
    '.scenario-card:hover{border-color:#0D9488;background:#162330}',
    '.scenario-card.selected{border-color:#0D9488;background:#0d2420;box-shadow:0 0 0 1px #0D9488}',
    '.sc-label{font-size:13px;font-weight:600;color:#e8f4f3;margin-bottom:2px}',
    '.sc-sub{font-size:10px;color:#6b8fa8;margin-bottom:10px}',
    '.sc-price{font-size:22px;font-weight:700;color:#0D9488;line-height:1;margin-bottom:6px}',
    '.sc-price span{font-size:12px;font-weight:400;color:#6b8fa8}',
    '.sc-detail{font-size:11px;color:#6b8fa8}',
    '.intel-apply-row{display:flex;align-items:center;gap:12px;margin-bottom:14px}',
    '.apply-label{font-size:12px;color:#6b8fa8;flex:1}',
    '.btn-apply{background:#0D9488;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s}',
    '.btn-apply:disabled{background:#1e3040;color:#4a6a80;cursor:not-allowed}',
    '.btn-apply:hover:not(:disabled){background:#0f766e}',
    '.btn-apply.applied{background:#059669}',
    '.intel-risks{border-top:1px solid #1e3040;padding-top:14px}',
    '.risks-title{font-size:11px;font-weight:600;color:#6b8fa8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}',
    '.risk-item{display:flex;gap:10px;padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:12px}',
    '.risk-high{background:rgba(220,38,38,0.12);border-left:3px solid #dc2626}',
    '.risk-medium{background:rgba(217,119,6,0.12);border-left:3px solid #d97706}',
    '.risk-low{background:rgba(75,85,99,0.15);border-left:3px solid #4b5563}',
    '.risk-icon{flex-shrink:0;margin-top:1px}',
    '.risk-high .risk-icon{color:#f87171}',
    '.risk-medium .risk-icon{color:#fbbf24}',
    '.risk-low .risk-icon{color:#9ca3af}',
    '.risk-msg{color:#cbd5e1;font-weight:500}',
    '.risk-action{color:#6b8fa8;margin-top:2px}',
    '.intel-loading .intel-header{color:#6b8fa8}',
    '.loading-dots{letter-spacing:3px;animation:intel-blink 1.2s infinite}',
    '@keyframes intel-blink{0%,100%{opacity:1}50%{opacity:0.3}}',
    '.intel-err-msg{padding:14px 16px;font-size:13px;color:#f87171}',
    '@media(max-width:700px){.intel-estimates{grid-template-columns:repeat(2,1fr)}.intel-scenarios{grid-template-columns:1fr}}'
  ].join('');
  document.head.appendChild(style);
})();
