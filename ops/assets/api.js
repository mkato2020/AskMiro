// ============================================================
// AskMiro Ops — api.js  (all server communication)
// ============================================================
const API = (() => {
  function token() { return localStorage.getItem(CFG.TOKEN_KEY) || ''; }

  async function get(action, params = {}) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('_token', token());
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') url.searchParams.set(k, v); });
    const res = await fetch(url.toString(), { method: 'GET', headers: { 'Accept': 'application/json' } });
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  async function post(action, body = {}) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('_token', token());
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  return { get, post };
})();
