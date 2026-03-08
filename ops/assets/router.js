// ============================================================
// AskMiro Ops — router.js  v2
// Instant navigation + prefetch + error boundaries
// ============================================================
window. Router = (() => {
  const routes   = {};
  let _current   = null;
  let _navigating = false;

  const PAGE_TITLES = {
    dashboard: 'Executive Dashboard',
    crm:       'CRM — Leads & Accounts',
    quotes:    'Quote Builder',
    contracts: 'Contracts',
    ops:       'Operations',
    quality:   'Quality & Compliance',
    finance:   'Finance & Invoicing',
    admin:     'Admin & Settings',
    email:     'Email Centre',
  };

  const PAGE_CTA = {
    crm:     { label: '+ New Lead',        action: () => CRM.openNewLead()              },
    quotes:  { label: '+ New Quote',       action: () => Quotes.openNew()               },
    quality: { label: '+ Log Inspection',  action: () => Quality.openNewInspection()    },
    finance: { label: '+ Create Invoice',  action: () => Finance.openNewInvoice()       },
    admin:   { label: '+ New User',        action: () => Admin.openNewUser()            },
    email:   { label: '+ Compose',         action: () => Email._switchTab('compose')    },
  };

  // Routes that should prefetch their neighbours on hover
  const PREFETCH_MAP = {
    dashboard: ['crm', 'finance', 'quality'],
    crm:       ['quotes'],
    quotes:    ['contracts'],
  };

  function register(name, fn) { routes[name] = fn; }

  function getRoute() {
    const hash = window.location.hash.replace('#/', '').split('?')[0];
    return (hash && routes[hash]) ? hash : 'dashboard';
  }

  // ── NAVIGATE ──────────────────────────────────────────────
  async function navigate(route, skipHistory = false) {
    // Prevent double-navigation
    if (_navigating && route === _current) return;
    _navigating = true;

    if (!skipHistory) window.location.hash = '/' + route;

    // Update nav active state immediately (feels instant)
    document.querySelectorAll('.ni').forEach(el =>
      el.classList.toggle('active', el.dataset.route === route)
    );
    document.getElementById('page-title').textContent = PAGE_TITLES[route] || route;

    // Update CTA button
    const cta     = document.getElementById('primary-cta');
    const ctaConf = PAGE_CTA[route];
    if (ctaConf) {
      cta.style.display = '';
      cta.textContent   = ctaConf.label;
      cta.onclick       = ctaConf.action;
    } else {
      cta.style.display = 'none';
    }

    UI.closeDrawer();
    UI.setLoading(true);

    const fn = routes[route];
    if (fn) {
      try {
        await fn();
      } catch(e) {
        console.error('[Router] Error in', route, e);
        _showError(route, e);
      }
    } else {
      document.getElementById('main-content').innerHTML =
        `<div style="padding:40px;color:var(--ll);font-size:14px">Page not found: ${route}</div>`;
    }

    UI.setLoading(false);
    _current   = route;
    _navigating = false;

    // Prefetch adjacent routes in background
    const toFetch = PREFETCH_MAP[route] || [];
    toFetch.forEach(r => {
      // Just warm the API cache — don't render
      const prefetchActions = {
        crm:      () => API.prefetch('crm'),
        quotes:   () => API.prefetch('quotes'),
        finance:  () => API.prefetch('finance'),
        quality:  () => API.prefetch('quality'),
        dashboard:() => API.prefetch('dashboard'),
      };
      if (prefetchActions[r]) {
        setTimeout(() => prefetchActions[r](), 500);
      }
    });
  }

  // ── ERROR BOUNDARY ────────────────────────────────────────
  function _showError(route, e) {
    const isTimeout = e.message && e.message.includes('timed out');
    document.getElementById('main-content').innerHTML = `
      <div style="padding:40px 20px;max-width:480px">
        <div style="font-size:2rem;margin-bottom:12px">${isTimeout ? '⏱' : '⚠️'}</div>
        <div style="font-weight:700;color:var(--dk);font-size:15px;margin-bottom:6px">
          ${isTimeout ? 'Apps Script is warming up…' : 'Something went wrong'}
        </div>
        <div style="font-size:13px;color:var(--ll);margin-bottom:20px;line-height:1.6">
          ${isTimeout
            ? 'The API takes a few seconds to cold-start. Please try again — it will be instant after the first load.'
            : e.message || 'An unexpected error occurred.'}
        </div>
        <button class="btn bp" style="font-size:13px" onclick="Router.navigate('${route}')">
          ↻ Try Again
        </button>
        <button class="btn bo" style="font-size:13px;margin-left:8px" onclick="Router.navigate('dashboard')">
          ← Dashboard
        </button>
      </div>`;
  }

  // ── OFFLINE BANNER ────────────────────────────────────────
  function _updateOnlineBanner() {
    const env = document.getElementById('tb-env');
    if (!env) return;
    if (!navigator.onLine) {
      env.innerHTML = '&#9679; Offline';
      env.style.color = '#DC2626';
    } else {
      env.innerHTML = '&#9679; Live';
      env.style.color = '';
    }
  }
  window.addEventListener('online',  _updateOnlineBanner);
  window.addEventListener('offline', _updateOnlineBanner);

  // ── HASH CHANGE ───────────────────────────────────────────
  window.addEventListener('hashchange', () => {
    if (!_navigating) navigate(getRoute(), true);
  });

  return { register, navigate, getRoute };
})();
