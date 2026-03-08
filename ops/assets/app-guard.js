// app-guard.js — defensive shim
// Ensures all module globals exist before app.js runs.
// If a module failed to load, this creates a safe stub so app.js
// doesn't crash with "X is not defined".
// Deploy to: assets/app-guard.js
// Add BEFORE assets/app.js in index.html

(function() {
  const modules = [
    'Dashboard','CRM','Quotes','Contracts',
    'Ops','Quality','Finance','Email','Reception','Admin'
  ];
  modules.forEach(function(name) {
    if (typeof window[name] === 'undefined') {
      console.warn('[AskMiro] Module not loaded: ' + name + ' — using stub');
      window[name] = {
        render: function() {
          const el = document.getElementById('main-content');
          if (el) el.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:300px;flex-direction:column;gap:12px">
              <div style="font-size:32px">⚠️</div>
              <div style="font-weight:700;color:#1E293B">${name} module failed to load</div>
              <div style="font-size:13px;color:#64748B">Check the browser console for script errors</div>
              <button onclick="location.reload()" style="margin-top:8px;padding:8px 20px;border-radius:8px;border:1px solid #E2E8F0;background:#fff;font-weight:700;cursor:pointer">↻ Reload</button>
            </div>`;
        }
      };
    }
  });
})();
