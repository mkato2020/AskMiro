// ============================================================
// AskMiro Ops — app.js  (bootstrap)
// ============================================================
(async () => {
  // Register all routes
  Router.register('dashboard', Dashboard.render);
  Router.register('crm', CRM.render);
  Router.register('quotes', Quotes.render);
  Router.register('contracts', Contracts.render);
  Router.register('ops', Ops.render);
  Router.register('quality', Quality.render);
  Router.register('finance', Finance.render);
  Router.register('admin', Admin.render);

  // Wire up sidebar nav clicks
  document.querySelectorAll('.ni[data-route]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      Router.navigate(el.dataset.route);
    });
  });

  // Attempt auto-login
  const ok = await Auth.init();
  if (!ok) return;

  // Navigate to current route (or dashboard)
  const route = Router.getRoute();
  await Router.navigate(route, true);
})();
