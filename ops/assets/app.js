// ============================================================
// AskMiro Ops — app.js  (bootstrap)
// ============================================================
import { supabase } from "./supabaseClient.js";

window.supabase = supabase;

// your existing code continues below...
(async () => {
  // Register all routes
  Router.register('dashboard', Dashboard.render);
  Router.register('crm', CRM.render);
  Router.register('quotes', Quotes.render);
  Router.register('contracts', Contracts.render);
  Router.register('ops', Ops.render);
  Router.register('quality', Quality.render);
  Router.register('finance', Finance.render);
  Router.register('email', Email.render);
  Router.register('admin', Admin.render);

  // FIX: Sidebar navigation clicks (your <a data-route="..."> has no href)
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-route]');
    if (!el) return;

    e.preventDefault();
    const route = el.getAttribute('data-route');
    if (!route) return;

    // Keep URL in sync (so refresh/back works)
    const nextHash = '#/' + route;
    if (location.hash !== nextHash) location.hash = nextHash;

    // Navigate
    try {
      await Router.navigate(route);
    } catch (_) {}
  });

  // Attempt auto-login
  const ok = await Auth.init();
  if (!ok) return; // Login screen shown by auth.js

  // Navigate to current route
  const route = Router.getRoute();
  await Router.navigate(route, true);
})();
async function __testSupabase() {
  console.log("Testing Supabase connection...");

  const { data, error } = await window.supabase
    .from("app_users")
    .select("*")
    .limit(1);

  console.log("Supabase result:", data);
  console.log("Supabase error:", error);
}

__testSupabase();
