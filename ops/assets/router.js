// ============================================================
// AskMiro Ops — router.js
// ============================================================
const Router = (() => {
  const routes = {};
  const PAGE_TITLES = {
    dashboard: 'Executive Dashboard', crm: 'CRM — Leads & Accounts',
    quotes: 'Quote Builder', contracts: 'Contracts',
    ops: 'Operations', quality: 'Quality & Compliance',
    finance: 'Finance & Invoicing', admin: 'Admin & Settings'
  };
  const PAGE_CTA = {
    crm: { label: '+ New Lead', action: () => CRM.openNewLead() },
    quotes: { label: '+ New Quote', action: () => Quotes.openNew() },
    quality: { label: '+ Log Inspection', action: () => Quality.openNewInspection() },
    finance: { label: '+ Create Invoice', action: () => Finance.openNewInvoice() },
    admin: { label: '+ New User', action: () => Admin.openNewUser() },
  };

  function register(name, fn) { routes[name] = fn; }

  function getRoute() {
    const hash = window.location.hash.replace('#/', '').split('?')[0];
    return hash || 'dashboard';
  }

  async function navigate(route, skipHistory = false) {
    if (!skipHistory) window.location.hash = '/' + route;
    const nav = document.querySelectorAll('.ni');
    nav.forEach(el => el.classList.toggle('active', el.dataset.route === route));
    document.getElementById('page-title').textContent = PAGE_TITLES[route] || route;
    const cta = document.getElementById('primary-cta');
    const ctaConf = PAGE_CTA[route];
    if (ctaConf) {
      cta.style.display = '';
      cta.textContent = ctaConf.label;
      cta.onclick = ctaConf.action;
    } else {
      cta.style.display = 'none';
    }
    UI.closeDrawer();
    UI.setLoading(true);
    const fn = routes[route];
    if (fn) {
      try { await fn(); } catch(e) { showError(e); }
    } else {
      document.getElementById('main-content').innerHTML = `<div style="padding:40px;color:var(--ll);font-size:14px">Page not found: ${route}</div>`;
    }
    UI.setLoading(false);
  }

  function showError(e) {
    document.getElementById('main-content').innerHTML = `<div class="alert alert-r" style="margin:20px 0">&times; Error: ${e.message}</div>`;
  }

  window.addEventListener('hashchange', () => navigate(getRoute(), true));

  return { register, navigate, getRoute };
})();
