// ============================================================
// ASKMIRO PUBLIC FORM PATCH — MATCHED TO YOUR ACTUAL FORM
// Tested against get-quote HTML — field IDs confirmed.
// ============================================================

const ASKMIRO_OPS_URL   = 'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec';
const ASKMIRO_OPS_TOKEN = 'miro_3344ce9888eb4d63935450f0309b626d';

// ── Confirmed from your actual form HTML ──────────────────────
// All fields now built directly into the form — no injection needed.
// service-type → facilityType, frequency → cleaningFrequency,
// message → requirements, premisesSize/Unit → areaMq


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
    company:           get('company'),
    email:             get('email'),
    phone:             get('phone'),
    postcode:          get('postcode'),
    facilityType:      get('service-type'),
    cleaningFrequency: get('frequency'),
    requirements:      get('message'),
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchSubmitHandler);
  } else {
    patchSubmitHandler();
  }
})();
