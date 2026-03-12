// ============================================================
// AskMiro Ops — app.js  v3 (performance edition)
// ============================================================
(async () => {

  // ── BOOT API LAYER FIRST ──────────────────────────────────
  // Must happen before any module render is called.
  // Starts the GAS keep-alive ping + fires parallel preload
  // of all critical data so modules render from cache instantly.
  API.init();

  // ── REGISTER ROUTES ───────────────────────────────────────
  Router.register('dashboard', Dashboard.render);
  Router.register('crm',       CRM.render);
  Router.register('quotes',    Quotes.render);
  Router.register('contracts', Contracts.render);
  Router.register('ops',       Ops.render);
  Router.register('quality',   Quality.render);
  Router.register('finance',   Finance.render);
  Router.register('email',      Email.render);
  Router.register('reception',  Reception.render);  // ← AI Receptionist
  Router.register('cleaners', Cleaners.render);
  Router.register('admin',      Admin.render);

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
  // When user hovers a nav item, warm that module's cache.
  // By the time they click (100-300ms later) data is ready.
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-route]');
    if (!el) return;
    const route = el.getAttribute('data-route');
    if (route) API.prefetch(route);
  });

  // ── SHOW LOGIN SHELL IMMEDIATELY ──────────────────────────
  // Avoids blank screen flash while auth + health checks run.
  document.getElementById('login-screen').classList.remove('hidden');

  // ── HEALTH CHECK + AUTH IN PARALLEL ───────────────────────
  // Don't let the health check block login — run both at once.
  const healthPromise = API.health();
  const ok = await Auth.init();
  if (!ok) return;

  // Warn if GAS was slow — tells user why first load might lag
  healthPromise.then(healthy => {
    if (!healthy) {
      UI.toast('API warming up — first load may be slow', 'w', 5000);
    }
  }).catch(() => {});

  // ── NAVIGATE TO CURRENT ROUTE ─────────────────────────────
  const route = Router.getRoute();
  await Router.navigate(route, true);

})();
