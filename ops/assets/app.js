// ============================================================
// AskMiro Ops — app.js  v2 (bootstrap)
// ============================================================
(async () => {

  // ── REGISTER ROUTES ───────────────────────────────────────
  Router.register('dashboard', Dashboard.render);
  Router.register('crm',       CRM.render);
  Router.register('quotes',    Quotes.render);
  Router.register('contracts', Contracts.render);
  Router.register('ops',       Ops.render);
  Router.register('quality',   Quality.render);
  Router.register('finance',   Finance.render);
  Router.register('email',     Email.render);
  Router.register('admin',     Admin.render);

  // ── SIDEBAR NAVIGATION ────────────────────────────────────
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-route]');
    if (!el) return;
    e.preventDefault();
    const route = el.getAttribute('data-route');
    if (!route) return;
    const nextHash = '#/' + route;
    if (location.hash !== nextHash) location.hash = nextHash;
    try { await Router.navigate(route); } catch (_) {}
  });

  // ── PREFETCH ON NAV HOVER ─────────────────────────────────
  const HOVER_PREFETCH = {
    crm:      () => API.prefetch('crm'),
    quotes:   () => API.prefetch('quotes'),
    finance:  () => API.prefetch('finance'),
    quality:  () => API.prefetch('quality'),
    dashboard:() => API.prefetch('dashboard'),
  };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-route]');
    if (!el) return;
    const fn = HOVER_PREFETCH[el.getAttribute('data-route')];
    if (fn) fn();
  });

  // ── HEALTH CHECK THEN LOGIN ────────────────────────────────
  // Show app shell immediately (avoids blank screen flash)
  document.getElementById('login-screen').classList.remove('hidden');

  // Run health check in parallel with auth init — don't block on it
  const healthPromise = API.health();

  const ok = await Auth.init();
  if (!ok) return;

  // Check if API is healthy, warn if not
  healthPromise.then(healthy => {
    if (!healthy) {
      UI.toast('API is slow to respond — Apps Script may be warming up', 'w', 5000);
    }
  }).catch(() => {});

  // ── NAVIGATE TO CURRENT ROUTE ─────────────────────────────
  const route = Router.getRoute();
  await Router.navigate(route, true);

})();
