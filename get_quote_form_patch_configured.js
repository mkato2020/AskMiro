// ============================================================
// ASKMIRO PUBLIC FORM PATCH — MATCHED TO YOUR ACTUAL FORM
// Tested against get-quote HTML — field IDs confirmed.
// ============================================================

const ASKMIRO_OPS_URL   = 'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec';
const ASKMIRO_OPS_TOKEN = 'miro_3344ce9888eb4d63935450f0309b626d';

// ── Confirmed from your actual form HTML ──────────────────────
// Frequency field:  <select id="frequency" name="frequency">
// Sector field:     <select id="sector" name="sector">
// Form id:          <form id="quoteForm">


// ============================================================
// INJECT PREMISES SIZE FIELD
// Inserts after the frequency-error div to keep form order clean
// ============================================================

function injectPremisesSizeField() {
  if (document.getElementById('field-premises-size')) return;

  const insertAfter = document.getElementById('frequency-error')
                   || document.getElementById('frequency');

  if (!insertAfter) {
    console.warn('AskMiro patch: #frequency not found — premises field not injected');
    return;
  }

  const fieldHTML = `
    <div id="field-premises-size" style="margin-bottom:1.25rem">
      <label for="premisesSize" style="font-weight:600;display:block;margin-bottom:.5rem;color:#1F2937;font-size:.9375rem">
        Approximate size of premises
        <span style="font-size:.8125rem;color:#94A3B8;font-weight:400;margin-left:4px">(optional — helps us quote accurately)</span>
      </label>

      <div style="display:flex;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;transition:all .3s" id="premises-input-wrap">
        <input
          type="number"
          id="premisesSize"
          name="premisesSize"
          placeholder="e.g. 250"
          min="1"
          step="1"
          autocomplete="off"
          style="flex:1;border:none;outline:none;padding:.8rem .875rem;font-size:1rem;font-family:inherit;color:#1F2937;background:transparent;margin-bottom:0"
        />
        <div style="display:flex;align-items:stretch;border-left:1px solid #E5E7EB">
          <button type="button" id="unit-m2"
            style="padding:0 14px;border:none;background:#0D9488;color:#fff;font-weight:600;font-size:.8125rem;cursor:pointer;border-right:1px solid #E5E7EB"
            onclick="PremisesField.setUnit('m2', this)">m&#178;</button>
          <button type="button" id="unit-sqft"
            style="padding:0 14px;border:none;background:#F9FAFB;color:#6B7280;font-size:.8125rem;cursor:pointer"
            onclick="PremisesField.setUnit('sqft', this)">sq ft</button>
        </div>
      </div>

      <div id="premises-conversion" style="display:none;font-size:.8125rem;color:#0D9488;margin-top:4px;font-weight:500"></div>

      <input type="hidden" id="premisesSizeM2"   name="premisesSizeM2"   value="">
      <input type="hidden" id="premisesSizeUnit"  name="premisesSizeUnit"  value="m2">
    </div>
  `;

  insertAfter.insertAdjacentHTML('afterend', fieldHTML);

  const input = document.getElementById('premisesSize');
  if (input) {
    input.addEventListener('input', () => PremisesField.onInput());
    input.addEventListener('focus', () => {
      document.getElementById('premises-input-wrap').style.borderColor = '#0D9488';
      document.getElementById('premises-input-wrap').style.boxShadow = '0 0 0 3px rgba(13,148,136,.1)';
    });
    input.addEventListener('blur', () => {
      document.getElementById('premises-input-wrap').style.borderColor = '#E5E7EB';
      document.getElementById('premises-input-wrap').style.boxShadow = 'none';
    });
  }
}


// ============================================================
// PREMISES FIELD CONTROLLER
// ============================================================

const PremisesField = {
  _unit: 'm2',

  setUnit(unit, btn) {
    this._unit = unit;
    document.getElementById('unit-m2').style.background   = unit === 'm2'   ? '#0D9488' : '#F9FAFB';
    document.getElementById('unit-m2').style.color        = unit === 'm2'   ? '#fff'    : '#6B7280';
    document.getElementById('unit-m2').style.fontWeight   = unit === 'm2'   ? '600'     : '400';
    document.getElementById('unit-sqft').style.background = unit === 'sqft' ? '#0D9488' : '#F9FAFB';
    document.getElementById('unit-sqft').style.color      = unit === 'sqft' ? '#fff'    : '#6B7280';
    document.getElementById('unit-sqft').style.fontWeight = unit === 'sqft' ? '600'     : '400';
    document.getElementById('premisesSizeUnit').value = unit;
    this.onInput();
  },

  onInput() {
    const raw  = parseFloat(document.getElementById('premisesSize')?.value) || 0;
    const hint = document.getElementById('premises-conversion');
    const m2el = document.getElementById('premisesSizeM2');

    if (!raw || raw <= 0) {
      if (hint) hint.style.display = 'none';
      if (m2el) m2el.value = '';
      return;
    }

    let m2, convText;
    if (this._unit === 'sqft') {
      m2       = +(raw * 0.0929).toFixed(1);
      convText = '\u2248 ' + m2 + ' m\u00B2';
    } else {
      m2       = raw;
      convText = '\u2248 ' + Math.round(raw / 0.0929).toLocaleString() + ' sq ft';
    }

    if (m2el) m2el.value = m2;
    if (hint) { hint.textContent = convText; hint.style.display = 'block'; }
  }
};


// ============================================================
// PATCH SUBMIT — piggybacks on existing handler
// Your form already fires webhook.lead to create the CRM lead.
// This fires submitWebQuote which runs the intelligence engine
// and creates a draft quote with pricing scenarios.
// Both are independent — if one fails the other is unaffected.
// ============================================================

function patchSubmitHandler() {
  const form = document.getElementById('quoteForm');
  if (!form) return;

  form.addEventListener('submit', function() {
    setTimeout(() => {
      const payload = _buildPayload();
      if (payload.name && payload.email) {
        _notifyOpsIntel(payload);
      }
    }, 300);
  });
}


// ============================================================
// BUILD PAYLOAD — mapped to your actual field IDs
// ============================================================

function _buildPayload() {
  const get = (id) => (document.getElementById(id)?.value || '').trim();
  return {
    action:            'submitWebQuote',
    name:              get('name'),
    email:             get('email'),
    phone:             get('phone'),
    postcode:          get('postcode'),
    facilityType:      get('sector'),       // your form uses id="sector"
    cleaningFrequency: get('frequency'),    // your form uses id="frequency"
    requirements:      get('message'),      // your form uses id="message"
    premisesSize:      get('premisesSize'),
    premisesSizeM2:    get('premisesSizeM2'),
    premisesSizeUnit:  get('premisesSizeUnit') || 'm2',
    source:            'web_form'
  };
}


// ============================================================
// FIRE TO OPS — uses same Image() pixel technique your
// existing webhook.lead call uses — zero CORS issues
// ============================================================

function _notifyOpsIntel(payload) {
  try {
    const qs = new URLSearchParams({ _token: ASKMIRO_OPS_TOKEN, ...payload });
    const img = new Image();
    img.src = ASKMIRO_OPS_URL + '?' + qs.toString() + '&callback=_noop';
    console.log('AskMiro Intel: submitWebQuote fired');
  } catch (err) {
    console.warn('AskMiro Intel: silent fail', err.message);
  }
}


// ============================================================
// AUTO-INIT
// ============================================================

(function() {
  function _run() {
    injectPremisesSizeField();
    patchSubmitHandler();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _run);
  } else {
    _run();
  }
})();
