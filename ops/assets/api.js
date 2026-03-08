// ============================================================
// AskMiro Ops — api.js  v2.1
// JSONP transport + smart cache + retry + deduplication
// ============================================================
window.API = (() => {

  // ── CACHE ─────────────────────────────────────────────────
  const _cache   = new Map();
  const _pending = new Map();

  const TTL = {
    default:   30000,
    dashboard: 20000,
    inbox:     60000,
    me:       300000,
    emails:    15000,
  };

  function _ttl(action) {
    return TTL[action] || TTL.default;
  }

  function _cacheKey(action, params) {
    const p = Object.entries(params || {}).sort().map(([k,v]) => k + '=' + v).join('&');
    return action + (p ? '?' + p : '');
  }

  function _cacheGet(key, action) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts < _ttl(action)) return entry.data;
    return null;
  }

  function _cacheSet(key, data) {
    _cache.set(key, { data, ts: Date.now() });
  }

  function invalidate(prefix) {
    for (const key of _cache.keys()) {
      if (!prefix || key.startsWith(prefix)) _cache.delete(key);
    }
  }

  // ── TOKEN ─────────────────────────────────────────────────
  function token() {
    return sessionStorage.getItem(CFG.TOKEN_KEY)
        || localStorage.getItem(CFG.TOKEN_KEY)
        || '';
  }

  // ── JSONP CORE ────────────────────────────────────────────
  function _jsonp(url, timeoutMs) {
    timeoutMs = timeoutMs || 12000;
    return new Promise(function(resolve, reject) {
      const cb     = '_cb' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      const script = document.createElement('script');

      const timer = setTimeout(function() {
        cleanup();
        reject(new Error('Request timed out — Apps Script may be cold-starting, please retry'));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        script.onload = script.onerror = null;
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cb] = function(data) {
        cleanup();
        if (data && data.error) reject(new Error(data.error));
        else resolve(data);
      };

      script.onerror = function() {
        cleanup();
        reject(new Error('Network error — check your connection'));
      };

      url.searchParams.set('callback', cb);
      script.src   = url.toString();
      script.async = true;
      document.head.appendChild(script);
    });
  }

  // ── RETRY WRAPPER ─────────────────────────────────────────
  async function _withRetry(fn, attempts) {
    attempts = attempts || 2;
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch(e) {
        lastErr = e;
        if (e.message && (e.message.includes('Invalid token') || e.message.includes('Unauthorized'))) {
          throw e;
        }
        if (i < attempts - 1) {
          await new Promise(function(r) { setTimeout(r, 800 * Math.pow(2, i)); });
        }
      }
    }
    throw lastErr;
  }

  // ── BUILD URL ─────────────────────────────────────────────
  function _url(action, params) {
    const url = new URL(CFG.API_BASE);
    url.searchParams.set('action', action);
    url.searchParams.set('_token', token());
    if (params) {
      Object.entries(params).forEach(function([k, v]) {
        if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
      });
    }
    return url;
  }

  // ── GET ────────────────────────────────────────────────────
  async function get(action, params, opts) {
    params = params || {};
    opts   = opts   || {};
    const key   = _cacheKey(action, params);
    const fresh = _cacheGet(key, action);

    if (fresh !== null && !opts.forceRefresh) return fresh;
    if (_pending.has(key)) return _pending.get(key);

    const req = _withRetry(function() { return _jsonp(_url(action, params)); })
      .then(function(data) {
        _cacheSet(key, data);
        _pending.delete(key);
        return data;
      })
      .catch(function(err) {
        _pending.delete(key);
        const stale = _cache.get(key);
        if (stale && !opts.strict) {
          console.warn('[API] Returning stale data for', action, '—', err.message);
          return stale.data;
        }
        throw err;
      });

    _pending.set(key, req);
    return req;
  }

  // ── POST ───────────────────────────────────────────────────
  async function post(action, body) {
    body = body || {};
    const url = _url(action);
    url.searchParams.set('_method', 'POST');
    url.searchParams.set('_body', JSON.stringify(body));

    const data = await _withRetry(function() { return _jsonp(url, 20000); });

    const invalidateMap = {
      'quote':              ['quotes', 'dashboard'],
      'quote.send':         ['quotes'],
      'quote.approve':      ['quotes', 'dashboard'],
      'crm.lead':           ['crm', 'dashboard'],
      'email.send':         ['emails'],
      'invoice':            ['finance', 'dashboard'],
      'ops.log':            ['ops'],
      'quality.inspection': ['quality', 'dashboard'],
      'voice.callback':     ['voice'],
      'voice.convert':      ['voice', 'crm'],
    };
    (invalidateMap[action] || []).forEach(function(prefix) { invalidate(prefix); });

    return data;
  }

  // ── PREFETCH ───────────────────────────────────────────────
  function prefetch(action, params) {
    params = params || {};
    const key = _cacheKey(action, params);
    if (!_cache.has(key) && !_pending.has(key)) {
      get(action, params).catch(function() {});
    }
  }

  // ── HEALTH CHECK ──────────────────────────────────────────
  async function health() {
    try {
      const res = await _jsonp(_url('health', {}), 6000);
      return res && res.ok;
    } catch(_) { return false; }
  }

  // ── INIT ───────────────────────────────────────────────────
  function init() {
    health().catch(function() {});
    ['dashboard', 'crm', 'quotes', 'me'].forEach(function(a) { prefetch(a); });
    setInterval(function() { health().catch(function() {}); }, 4 * 60 * 1000);
  }

  return { init, get, post, prefetch, invalidate, health, token };

})();
