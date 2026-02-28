// ============================================================
// ASKMIRO PUBLIC FORM PATCH
// File: get_quote_form_patch.js
// Patch your existing get-quote form at askmiro.com/get-quote
// Add ONE new field + update the submit handler.
// Do not rebuild the form — just patch.
// ============================================================


// ============================================================
// STEP 1: INJECT THE PREMISES SIZE FIELD
// Call this after your existing form renders.
// Target: insert after the "Cleaning Frequency" field.
// Adjust selector to match your actual form HTML.
// ============================================================

function injectPremisesSizeField() {
  // Find the frequency field wrapper — adjust selector to match your DOM
  const frequencyField = document.querySelector(
    '[data-field="cleaningFrequency"], #cleaningFrequency, .field-cleaning-frequency'
  );

  if (!frequencyField) {
    console.warn('AskMiro: Could not find cleaningFrequency field to inject after');
    return;
  }

  const wrapper = frequencyField.closest('.form-group, .form-field, .field-wrapper')
               || frequencyField.parentElement;

  // Create new field
  const fieldHTML = `
    <div class="form-group field-premises-size" id="field-premises-size">
      <label for="premisesSize">
        Approximate size of premises
        <span class="field-optional">(optional — helps us quote accurately)</span>
      </label>

      <div class="premises-size-input-group">
        <input
          type="number"
          id="premisesSize"
          name="premisesSize"
          placeholder="e.g. 250"
          min="1"
          step="1"
          autocomplete="off"
        />
        <div class="premises-unit-toggle">
          <button type="button" class="unit-btn active" data-unit="m2"
            onclick="PremisesField.setUnit('m2', this)">m²</button>
          <button type="button" class="unit-btn" data-unit="sqft"
            onclick="PremisesField.setUnit('sqft', this)">sq ft</button>
        </div>
      </div>

      <div class="premises-conversion" id="premises-conversion" style="display:none">
        <!-- Conversion hint shown when user enters a value -->
      </div>

      <input type="hidden" id="premisesSizeM2"   name="premisesSizeM2"   value="">
      <input type="hidden" id="premisesSizeUnit"  name="premisesSizeUnit"  value="m2">
    </div>
  `;

  wrapper.insertAdjacentHTML('afterend', fieldHTML);

  // Bind conversion logic
  const input = document.getElementById('premisesSize');
  if (input) {
    input.addEventListener('input', PremisesField.onInput);
  }

  // Inject field styles
  _injectPremisesStyles();
}


// ============================================================
// PREMISES FIELD CONTROLLER
// ============================================================

const PremisesField = {
  _unit: 'm2',

  setUnit(unit, btn) {
    this._unit = unit;
    document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('premisesSizeUnit').value = unit;
    this.onInput();  // recalculate
  },

  onInput() {
    const raw  = parseFloat(document.getElementById('premisesSize').value) || 0;
    const unit = PremisesField._unit;
    const hint = document.getElementById('premises-conversion');

    if (!raw || raw <= 0) {
      if (hint) hint.style.display = 'none';
      document.getElementById('premisesSizeM2').value = '';
      return;
    }

    let m2, convText;

    if (unit === 'sqft') {
      m2       = +(raw * 0.0929).toFixed(1);
      convText = `≈ ${m2} m²`;
    } else {
      m2       = raw;
      const sqft = +(raw / 0.0929).toFixed(0);
      convText = `≈ ${sqft} sq ft`;
    }

    document.getElementById('premisesSizeM2').value = m2;

    if (hint) {
      hint.textContent    = convText;
      hint.style.display  = 'block';
    }
  }
};


// ============================================================
// STEP 2: PATCH FORM SUBMIT HANDLER
// Find your existing submit handler and add premises fields
// to the payload. Minimal change — just add the 3 lines.
// ============================================================

function patchFormSubmitHandler() {
  const form = document.querySelector(
    '#quote-form, form[data-form="get-quote"], .get-quote-form, form'
  );
  if (!form) return;

  // Listen for submit — extract premises fields and attach to payload
  form.addEventListener('submit', function(e) {
    // Your existing handler runs too — this just enriches payload
    const input    = document.getElementById('premisesSize');
    const m2Hidden = document.getElementById('premisesSizeM2');
    const unitHidden = document.getElementById('premisesSizeUnit');

    if (!input) return;  // field wasn't injected

    // If your form uses a JS payload object, attach directly:
    if (window._quotePayload) {
      window._quotePayload.premisesSize     = input.value;
      window._quotePayload.premisesSizeM2   = m2Hidden?.value || '';
      window._quotePayload.premisesSizeUnit = unitHidden?.value || 'm2';
    }

    // If your form POSTs normally, hidden fields handle it automatically.
    // No other changes needed.
  }, true);  // capture phase so we run before your existing handler
}


// ============================================================
// STEP 3: UPDATED PAYLOAD BUILDER
// Replace/merge with your existing buildPayload() function.
// Only additions marked with NEW.
// ============================================================

function buildQuotePayload() {
  const get = (id) => (document.getElementById(id)?.value || '').trim();

  return {
    // ── Existing fields (unchanged) ──────────────────────────
    action:            'submitWebQuote',
    name:              get('name')              || get('clientName'),
    email:             get('email')             || get('clientEmail'),
    phone:             get('phone')             || get('clientPhone'),
    postcode:          get('postcode'),
    facilityType:      get('facilityType')      || get('facility_type'),
    cleaningFrequency: get('cleaningFrequency') || get('cleaning_frequency'),
    requirements:      get('requirements')      || get('message'),
    source:            'web_form',

    // ── NEW: Premises size fields ─────────────────────────────
    premisesSize:      get('premisesSize'),
    premisesSizeM2:    get('premisesSizeM2'),
    premisesSizeUnit:  get('premisesSizeUnit') || 'm2'
  };
}


// ============================================================
// STEP 4: NOTIFY OPS (fire-and-forget after existing submit)
// Your existing form submits and shows confirmation to client.
// Separately, tell Ops backend to create the draft quote.
// Client sees nothing extra — this is purely internal.
// ============================================================

async function notifyOpsBackend(formPayload) {
  const OPS_URL   = window.ASKMIRO_OPS_URL   || '';
  const OPS_TOKEN = window.ASKMIRO_OPS_TOKEN || '';

  if (!OPS_URL) {
    console.warn('AskMiro: ASKMIRO_OPS_URL not set — skipping Ops notification');
    return;
  }

  try {
    const res = await fetch(OPS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token:   OPS_TOKEN,
        action:  'submitWebQuote',
        payload: formPayload
      })
    });

    const data = await res.json();

    if (data.success) {
      console.log(`AskMiro Ops: Draft quote ${data.quoteId} created from lead ${data.leadId}`);
    } else {
      console.error('AskMiro Ops: Quote creation failed', data.error);
    }

    return data;
  } catch (err) {
    // Silent fail — client experience is not affected
    console.error('AskMiro Ops: notifyOpsBackend error', err.message);
  }
}


// ============================================================
// STEP 5: FIELD STYLES
// ============================================================

function _injectPremisesStyles() {
  if (document.getElementById('premises-field-styles')) return;
  const style = document.createElement('style');
  style.id = 'premises-field-styles';
  style.textContent = `
    .field-premises-size label { display: block; font-size: 14px; margin-bottom: 6px; }
    .field-optional { font-size: 12px; color: #9ca3af; font-weight: 400; margin-left: 4px; }

    .premises-size-input-group {
      display:       flex;
      gap:           0;
      border:        1px solid #d1d5db;
      border-radius: 8px;
      overflow:      hidden;
    }

    .premises-size-input-group input[type="number"] {
      flex:        1;
      border:      none;
      outline:     none;
      padding:     10px 14px;
      font-size:   15px;
      background:  transparent;
    }

    .premises-unit-toggle {
      display:         flex;
      align-items:     stretch;
      border-left:     1px solid #d1d5db;
    }

    .unit-btn {
      padding:     0 14px;
      border:      none;
      background:  #f9fafb;
      cursor:      pointer;
      font-size:   13px;
      color:       #6b7280;
      transition:  all 0.15s;
      border-left: 1px solid #e5e7eb;
    }

    .unit-btn:first-child { border-left: none; }

    .unit-btn.active {
      background:  #0D9488;
      color:       #fff;
      font-weight: 600;
    }

    .premises-conversion {
      font-size:  12px;
      color:      #0D9488;
      margin-top: 5px;
      font-weight: 500;
    }
  `;
  document.head.appendChild(style);
}


// ============================================================
// AUTO-INIT
// Runs when script loads. Safe to call multiple times.
// ============================================================

(function init() {
  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _run);
  } else {
    _run();
  }

  function _run() {
    injectPremisesSizeField();
    patchFormSubmitHandler();
  }
})();
