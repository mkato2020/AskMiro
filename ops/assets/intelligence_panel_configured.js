// ============================================================
// ASKMIRO — GET QUOTE FORM PATCH (PRODUCTION)
// - Captures Netlify form submit
// - Sends payload to GAS (JSONP) to create Lead/Quote
// - Shows a success message + link into Ops when quoteId is returned
// ============================================================

(function AskMiroGetQuotePatch() {
  // ── CONFIG ────────────────────────────────────────────────
  const API_URL   = 'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec';
  const API_TOKEN = 'miro_3344ce9888eb4d63935450f0309b626d';

  // Where your Ops SPA lives (update if different)
  // Examples:
  //  - 'https://www.askmiro.com/ops'
  //  - 'https://ops.askmiro.com'
  const OPS_BASE_URL = 'https://www.askmiro.com/ops';

  // Backend action name (update if your GAS uses a different action)
  // Common options might be: 'quote.web_form', 'lead.create', 'quote.createFromWebForm'
  const ACTION_NAME = 'quote.web_form';

  // ── INIT ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const form = findQuoteForm();
    if (!form) {
      console.warn('[AskMiroPatch] Quote form not found on page.');
      return;
    }

    // Avoid double-binding
    if (form.dataset.askmiroBound === '1') return;
    form.dataset.askmiroBound = '1';

    form.addEventListener('submit', async (e) => {
      // Let Netlify validation run first
      if (!form.checkValidity()) return;

      // We intercept submit to also create quote in GAS
      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"], button:not([type])');
      setBusy(submitBtn, true);

      try {
        const payload = collectFormData(form);

        // 1) Create lead/quote in GAS (JSONP)
        const result = await jsonp({
          _token: API_TOKEN,
          action: ACTION_NAME,
          ...payload
        });

        // 2) Continue Netlify submission (so you still get Netlify form entries)
        // If you don't want Netlify entries anymore, remove this block.
        await forwardToNetlify(form);

        // 3) Render success UI + Ops link (if quoteId present)
        renderSuccess(form, result);

      } catch (err) {
        console.error('[AskMiroPatch] Submit failed:', err);
        renderError(form, err.message || 'Something went wrong. Please try again.');
      } finally {
        setBusy(submitBtn, false);
      }
    }, true);
  });

  // ── FIND FORM ──────────────────────────────────────────────
  function findQuoteForm() {
    // Try most likely selectors (Netlify forms often have data-netlify="true" or name attr)
    const candidates = [
      'form[name="quote-request"]',
      'form[data-netlify="true"]',
      'form[action="/get-quote"]',
      'form'
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && hasRequiredFields(el)) return el;
    }
    return null;
  }

  function hasRequiredFields(form) {
    // Match your visible fields from the page
    const name  = form.querySelector('input[type="text"]');
    const email = form.querySelector('input[type="email"]');
    const phone = form.querySelector('input[type="tel"]');
    const msg   = form.querySelector('textarea');
    return !!(name && email && phone && msg);
  }

  // ── COLLECT DATA ───────────────────────────────────────────
  function collectFormData(form) {
    // Grab inputs by label order / type since IDs may vary
    const nameInput  = form.querySelector('input[type="text"]');
    const emailInput = form.querySelector('input[type="email"]');
    const phoneInput = form.querySelector('input[type="tel"]');
    const postcode   = form.querySelector('input[type="text"][name*="post"], input[type="text"][placeholder*="SW"]');

    const selects = form.querySelectorAll('select');
    const premisesType = selects[0] ? selects[0].value : '';
    const frequency    = selects[1] ? selects[1].value : '';

    const sizeInput = form.querySelector('input[type="number"]');
    const message   = form.querySelector('textarea');

    // Unit handling (your page has m²/sq ft toggles + hidden unit input)
    const unitHidden = form.querySelector('input[type="hidden"][value="m2"], input[type="hidden"][name*="unit"], input[type="hidden"][id*="unit"]');
    const unit = unitHidden ? (unitHidden.value || 'm2') : 'm2';

    return {
      source: 'web_form',
      page: location.href,
      name: safeVal(nameInput),
      email: safeVal(emailInput),
      phone: safeVal(phoneInput),
      postcode: safeVal(postcode),
      premisesType,
      frequency,
      size: sizeInput ? (sizeInput.value || '') : '',
      sizeUnit: unit,
      requirements: safeVal(message)
    };
  }

  function safeVal(el) {
    return el && typeof el.value === 'string' ? el.value.trim() : '';
  }

  // ── JSONP (NO CORS) ────────────────────────────────────────
  function jsonp(params) {
    return new Promise((resolve, reject) => {
      const cbName  = '_askmiroCb_' + Date.now() + '_' + Math.random().toString(16).slice(2);
      const script  = document.createElement('script');
      let finished  = false;
      let timeoutId = null;

      function cleanup() {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = null;
        if (window[cbName]) {
          try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
        }
        if (script && script.parentNode) {
          try { script.parentNode.removeChild(script); } catch (_) {}
        }
      }

      window[cbName] = (data) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(data);
      };

      const qs = new URLSearchParams({ ...params, callback: cbName });
      script.src = API_URL + '?' + qs.toString();
      script.async = true;

      script.onerror = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Network error calling backend'));
      };

      document.body.appendChild(script);

      timeoutId = setTimeout(() => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Request timed out'));
      }, 12000);
    });
  }

  // ── STILL SUBMIT TO NETLIFY ────────────────────────────────
  async function forwardToNetlify(form) {
    const formData = new FormData(form);

    // Netlify wants urlencoded
    const body = new URLSearchParams();
    for (const [k, v] of formData.entries()) body.append(k, v);

    const action = form.getAttribute('action') || location.pathname;

    const res = await fetch(action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!res.ok) throw new Error('Form submission failed (Netlify)');
    return true;
  }

  // ── UI STATES ──────────────────────────────────────────────
  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = !!busy;
    if (busy) {
      btn.dataset._txt = btn.textContent;
      btn.textContent = 'Submitting…';
    } else {
      btn.textContent = btn.dataset._txt || 'Request Free Quote';
      delete btn.dataset._txt;
    }
  }

  function renderSuccess(form, result) {
    const wrap = form.parentElement || form;
    const quoteId =
      (result && (result.quoteId || result.id || (result.data && result.data.quoteId))) || '';

    const opsLink = quoteId
      ? `${OPS_BASE_URL}/#quotes/${encodeURIComponent(quoteId)}`
      : `${OPS_BASE_URL}/#quotes`;

    wrap.innerHTML = `
      <div style="background:#0f1923;border:1px solid #1e3040;border-radius:12px;padding:18px;color:#e8f4f3">
        <div style="font-size:18px;font-weight:700;margin-bottom:6px">Quote Request Received ✅</div>
        <div style="color:#8faec4;margin-bottom:14px">
          We’ve received your request and our team has been notified. Mike will be in touch within 24 hours to arrange a site visit.
        </div>

        <div style="background:#141f2c;border:1px solid #1e3040;border-radius:10px;padding:12px;margin-bottom:14px;color:#cbd5e1">
          <div style="font-weight:600;margin-bottom:6px">What happens next?</div>
          <ol style="margin:0;padding-left:18px;color:#8faec4">
            <li>Mike reviews your requirements</li>
            <li>We arrange a free site visit</li>
            <li>You receive a detailed proposal</li>
          </ol>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a href="${opsLink}" style="background:#0D9488;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700">
            View in Ops
          </a>
          <a href="https://www.askmiro.com/" style="border:1px solid #1e3040;color:#8faec4;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:600">
            Back to Homepage
          </a>
        </div>

        ${quoteId ? `<div style="margin-top:10px;color:#6b8fa8;font-size:12px">Quote ID: ${escapeHtml(quoteId)}</div>` : ''}
      </div>
    `;
  }

  function renderError(form, msg) {
    const err = document.createElement('div');
    err.style.cssText = 'margin-top:10px;background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.35);padding:10px 12px;border-radius:10px;color:#fca5a5;font-size:13px';
    err.textContent = '⚠ ' + msg;

    // Avoid stacking duplicates
    const existing = form.querySelector('[data-askmiro-error="1"]');
    if (existing) existing.remove();

    err.dataset.askmiroError = '1';
    form.appendChild(err);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }
})();
