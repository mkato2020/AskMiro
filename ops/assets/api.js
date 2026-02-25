// ============================================================
// AskMiro Ops — api.js
// Uses JSONP to bypass CORS with Google Apps Script Web Apps
// ============================================================
const API = (() => {
  function token() { return localStorage.getItem(CFG.TOKEN_KEY) || ''; }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = '_cb' + Date.now() + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup(); reject(new Error('Request timed out — check Apps Script is deployed'));
      }, 15000);
      function cleanup() {
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
        clearTimeout(timeout);
      }
      window[cb] = (data) => {
        cleanup();
        if (data && data.error) reject(new Error(data.error));
        else resolve(data);
      };
      script.onerror = () => { cleanup(); reject(new Error('Network error — check API_BASE in config.js')); };
      script.src = url + '&callback=' + cb;
      document.head.appendChild(script);
    });
  }

  function buildUrl(action, params) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('_token', token());
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    });
    return url.toString();
  }

  function get(action, params) {
    return jsonp(buildUrl(action, params));
  }

  // POST is tunnelled as GET with _method=POST and _body=JSON
  // Apps Script backend reads e.parameter._body
  function post(action, body) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('_token', token());
    url.searchParams.set('_method', 'POST');
    url.searchParams.set('_body', JSON.stringify(body || {}));
    return jsonp(url.toString());
  }

  return { get, post };
})();
