// ============================================================
// AskMiro Ops — api.js
// Tunnels POST through GET to avoid CORS preflight on Apps Script
// ============================================================
const API = (() => {
  function token() { return localStorage.getItem(CFG.TOKEN_KEY) || ''; }

  async function get(action, params = {}) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('_token', token());
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), { method: 'GET' });
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  async function post(action, body = {}) {
    // Tunnel POST via GET (_method=POST) — avoids CORS preflight
    const url = new URL(CFG.API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('_token', token());
    url.searchParams.set('_method', 'POST');
    url.searchParams.set('_body', JSON.stringify(body));
    const res = await fetch(url.toString(), { method: 'GET' });
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  return { get, post };
})();
