// ============================================================
// AskMiro Ops — app.js  (bootstrap)
// ============================================================
(async () => {
  // Register all routes
  Router.register('dashboard', Dashboard.render);
  Router.register('crm',       CRM.render);
  Router.register('quotes',    Quotes.render);
  Router.register('contracts', Contracts.render);
  Router.register('ops',       Ops.render);
  Router.register('quality',   Quality.render);
  Router.register('finance',   Finance.render);
  Router.register('email',     Email.render);
  Router.register('admin',     Admin.render);

  // Sidebar navigation — handles <a data-route="..."> clicks
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

  // Attempt auto-login from stored token
  const ok = await Auth.init();
  if (!ok) return; // Auth.init() shows login screen if no valid token

  // Navigate to current hash route (or dashboard by default)
  const route = Router.getRoute();
  await Router.navigate(route, true);
})();
