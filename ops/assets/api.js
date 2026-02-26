// ============================================================
// AskMiro Ops — api.js
// Uses JSONP for all calls — bypasses CORS entirely
// Apps Script is designed for JSONP via callback param
// ============================================================
const API = (() => {
  function token() { return localStorage.getItem(CFG.TOKEN_KEY) || ''; }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = 'cb_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Request timed out'));
      }, 15000);

      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cb] = (data) => {
        cleanup();
        if (data && data.error) reject(new Error(data.error));
        else resolve(data);
      };

      script.onerror = () => { cleanup(); reject(new Error('Failed to fetch')); };
      url.searchParams.set('callback', cb);
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  async function get(action, params = {}) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('_token', token());
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    });
    return jsonp(url);
  }

  async function post(action, body = {}) {
    // Tunnel POST through GET with _method=POST + _body param
    const url = new URL(CFG.API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('_token', token());
    url.searchParams.set('_method', 'POST');
    url.searchParams.set('_body', JSON.stringify(body));
    return jsonp(url);
  }

  return { get, post };
})();
