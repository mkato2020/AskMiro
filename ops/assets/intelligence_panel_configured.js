// ============================================================
// ✅ IntelPanel — READY TO PASTE (NO HARDCODED TOKEN)
// FIXES:
// 1) Uses CFG.API_BASE (single source of truth)
// 2) Pulls token from localStorage(CFG.TOKEN_KEY) at runtime
// 3) Emits intelApplied with revenue/direct/margin so your modal updates
// 4) Handles Apps Script returning text instead of JSON
// ============================================================
const IntelPanel = (() => {

  const API_URL = (window.CFG && CFG.API_BASE) || '';
  const getToken = () => {
    try { return localStorage.getItem(CFG.TOKEN_KEY) || ''; } catch (_) { return ''; }
  };

  let _state = { quoteId: null, intel: null, chosenScenario: null, wageAdjust: 0 };

  async function init(quoteId, containerId) {
    _state = { quoteId, intel: null, chosenScenario: null, wageAdjust: 0 };
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = _renderSkeleton();

    try {
      const intel = await _fetchIntel(quoteId);
      _state.intel = intel;
      container.innerHTML = _renderPanel(intel);
      _bindEvents(container);
    } catch (err) {
      container.innerHTML = _renderError(err.message);
    }
  }

  async function _fetchIntel(quoteId) {
    const token = getToken();
    if (!token) throw new Error('Missing access token. Please sign in again.');

    const qs = new URLSearchParams({ _token: token, action: 'quote.intel', id: quoteId });
    const res = await fetch(API_URL + '?' + qs.toString(), { method: 'GET' });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { throw new Error('Intel API returned non-JSON'); }

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
            <div class="intel-stat"><div class="stat-label">Supplies / mo</div><div class="stat-value">&#163;${Number(intel.suppliesPerMonth||0).toFixed(0)}</div></div>
            <div class="intel-stat"><div class="stat-label">Direct cost / mo</div><div class="stat-value">&#163;${Number(intel.directCostPerMonth||0).toFixed(0)}</div></div>
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

          ${risks.length ? _renderRisks(risks) : ''}
        </div>
      </div>`;
  }

  function _renderScenario(key, scenario, label, subtitle) {
    const m = (scenario.marginPct ?? scenario.effectiveMargin ?? 0);
    return `
      <div class="scenario-card" id="scenario-${key}" onclick="IntelPanel._selectScenario('${key}', this)">
        <div class="sc-label">${label}</div>
        <div class="sc-sub">${subtitle}</div>
        <div class="sc-price">&#163;${Number(scenario.revenuePerMonth||0).toFixed(0)}<span>/mo</span></div>
        <div class="sc-detail">&#163;${Number(scenario.revenuePerWeek||0).toFixed(0)}/wk &middot; &#163;${Number(scenario.hourlyRate||0).toFixed(2)}/hr &middot; ${m}% margin</div>
      </div>`;
  }

  function _renderRisks(risks) {
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
    if (btn) btn.disabled = false;

    const s = _getActiveScenario(key);
    const label = document.getElementById('apply-label');
    if (label && s) label.textContent = `£${Number(s.revenuePerMonth||0).toFixed(0)}/mo · £${Number(s.hourlyRate||0).toFixed(2)}/hr`;
  }

  // ✅ Apply -> POST + emit intelApplied numbers for Quotes modal header
  async function _applyScenario() {
    if (!_state.chosenScenario || !_state.intel) return;

    const token = getToken();
    if (!token) { console.error('Missing token'); return; }

    const s = _getActiveScenario(_state.chosenScenario);
    if (!s) return;

    const btn = document.getElementById('btn-apply');
    if (btn) { btn.disabled = true; btn.textContent = 'Applying…'; }

    try {
      const body = new URLSearchParams({
        _token: token,
        action: 'quote.intel.apply',
        id: _state.quoteId,
        scenario: _state.chosenScenario
      });

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString()
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (_) { throw new Error('Apply returned non-JSON'); }
      if (!data.ok) throw new Error(data.error || 'Apply failed');

      // Update builder fields (if present)
      _setField('q-cr', Number(s.hourlyRate||0).toFixed(2));
      _setField('q-hw', _state.intel.hoursPerWeek);
      _setField('q-sp', Number(_state.intel.suppliesPerMonth||0).toFixed(2));

      // Compute header KPIs NOW (this is what fixes the £0 issue immediately)
      const revenueMonthly    = Number(s.revenuePerMonth || 0);
      const directCostMonthly = Number(_state.intel.directCostPerMonth || 0);
      const grossMarginGBP    = revenueMonthly - directCostMonthly;
      const grossMarginPct    = revenueMonthly > 0 ? (grossMarginGBP / revenueMonthly) * 100 : 0;

      window.dispatchEvent(new CustomEvent('intelApplied', {
        detail: {
          quoteId: _state.quoteId,
          scenario: _state.chosenScenario,
          revenueMonthly,
          directCostMonthly,
          grossMarginGBP,
          grossMarginPct,
          hourlyRate: Number(s.hourlyRate||0),
          hoursPerWeek: Number(_state.intel.hoursPerWeek||0),
          supplies: Number(_state.intel.suppliesPerMonth||0)
        }
      }));

      if (btn) {
        btn.textContent = '✓ Applied';
        btn.classList.add('applied');
        btn.disabled = false;
        setTimeout(() => { btn.textContent = 'Apply to Quote'; btn.classList.remove('applied'); }, 2000);
      }

    } catch (err) {
      console.error('IntelPanel._applyScenario error:', err);
      if (btn) {
        btn.textContent = '✗ Failed — retry';
        btn.disabled = false;
        btn.style.background = '#dc2626';
        setTimeout(() => { btn.textContent = 'Apply to Quote'; btn.style.background = ''; }, 2500);
      }
    }
  }

  function _setWageAdjust(pct, btn) {
    _state.wageAdjust = pct;
    document.querySelectorAll('.sense-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const intel = _state.intel;
    if (!intel) return;

    let src = intel.scenarios?.balanced;
    if (pct === 5 && intel.sensitivity?.wage5pct) src = intel.sensitivity.wage5pct;
    if (pct === 10 && intel.sensitivity?.wage10pct) src = intel.sensitivity.wage10pct;

    const balCard = document.getElementById('scenario-balanced');
    if (!balCard || !src) return;

    const priceEl = balCard.querySelector('.sc-price');
    const detailEl = balCard.querySelector('.sc-detail');
    if (priceEl) priceEl.innerHTML = `£${Number(src.revenuePerMonth||0).toFixed(0)}<span>/mo</span>`;
    if (detailEl) detailEl.textContent = `£${Number(src.revenuePerWeek||0).toFixed(0)}/wk · £${Number(src.hourlyRate||0).toFixed(2)}/hr · ${(src.marginPct ?? 0)}% margin`;
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
    if (_state.wageAdjust === 5 && key === 'balanced' && intel.sensitivity?.wage5pct) return intel.sensitivity.wage5pct;
    if (_state.wageAdjust === 10 && key === 'balanced' && intel.sensitivity?.wage10pct) return intel.sensitivity.wage10pct;
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
      const code = codeMatch ? codeMatch[1] : '';
      return {
        severity: (sevMatch ? sevMatch[1] : 'low').toLowerCase(),
        code,
        message: msgMatch ? msgMatch[1] : r,
        action: actionMap[code] || ''
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

  return { init, _selectScenario, _applyScenario, _setWageAdjust, _toggleCollapse };

})();
// ✅ expose globally (critical)
try { window.IntelPanel = IntelPanel; } catch (e) {}
