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

  // Attempt auto-login
  const ok = await Auth.init();
  if (!ok) return; // Login screen shown by auth.js

  // Navigate to current route
  const route = Router.getRoute();
  await Router.navigate(route, true);
})();
