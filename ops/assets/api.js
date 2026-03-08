// ============================================================
// AskMiro Ops — api.js  v2
// JSONP transport + smart cache + retry + deduplication
// ============================================================
window.API = (() => {

  // ── CACHE ─────────────────────────────────────────────────
  // stale-while-revalidate: show cached data instantly, refresh in background
  const _cache   = new Map();   // key → { data, ts }
  const _pending = new Map();   // key → Promise (dedup in-flight requests)

  const TTL = {
    default:   30_000,   // 30s  — most data
    dashboard: 20_000,   // 20s  — exec summary
    inbox:     60_000,   // 60s  — gmail (slow)
    me:       300_000,   // 5min — user profile
    emails:    15_000,   // 15s  — sent log
  };

  function _ttl(action) {
    return TTL[action] || TTL.default;
  }

  function _cacheKey(action, params) {
    const p = Object.entries(params || {}).sort().map(([k,v])=>k+'='+v).join('&');
    return action + (p ? '?' + p : '');
  }

  function _cacheGet(key, action) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts < _ttl(action)) return entry.data;
    return null; // stale
  }

  function _cacheSet(key, data) {
    _cache.set(key, { data, ts: Date.now() });
  }

  function invalidate(prefix) {
    // Call after any write to clear affected cache entries
    for (const key of _cache.keys()) {
      if (!prefix || key.startsWith(prefix)) _cache.delete(key);
    }
  }

  // ── TOKEN ─────────────────────────────────────────────────
  function token() {
    // sessionStorage is cleared on tab close — safer than localStorage
    return sessionStorage.getItem(CFG.TOKEN_KEY)
        || localStorage.getItem(CFG.TOKEN_KEY)
        || '';
  }

  // ── JSONP CORE ────────────────────────────────────────────
  function _jsonp(url, timeoutMs = 12_000) {
    return new Promise((resolve, reject) => {
      const cb     = '_cb' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      const script = document.createElement('script');

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Request timed out — Apps Script may be cold-starting, please retry'));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        script.onload = script.onerror = null;
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cb] = (data) => {
        cleanup();
        if (data && data.error) reject(new Error(data.error));
        else resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('Network error — check your connection'));
      };

      url.searchParams.set('callback', cb);
      script.src = url.toString();
      // Integrity: nonce not possible with JSONP, but we set async
      script.async = true;
      document.head.appendChild(script);
    });
  }

  // ── RETRY WRAPPER ─────────────────────────────────────────
  async function _withRetry(fn, attempts = 2) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch(e) {
        lastErr = e;
        // Don't retry auth errors
        if (e.message && (e.message.includes('Invalid token') || e.message.includes('Unauthorized'))) {
          throw e;
        }
        if (i < attempts - 1) {
          // Exponential backoff: 800ms, 1600ms
          await new Promise(r => setTimeout(r, 800 * Math.pow(2, i)));
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
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
      });
    }
    return url;
  }

  // ── GET — with cache + dedup ───────────────────────────────
  async function get(action, params = {}, opts = {}) {
    const key   = _cacheKey(action, params);
    const fresh = _cacheGet(key, action);

    // Return fresh cache immediately
    if (fresh !== null && !opts.forceRefresh) return fresh;

    // Deduplicate in-flight requests for same key
    if (_pending.has(key)) return _pending.get(key);

    const req = _withRetry(() => _jsonp(_url(action, params)))
      .then(data => {
        _cacheSet(key, data);
        _pending.delete(key);
        return data;
      })
      .catch(err => {
        _pending.delete(key);
        // Return stale data if available rather than throwing
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

  // ── POST — no cache, invalidates related keys ──────────────
  async function post(action, body = {}) {
    const url = _url(action);
    url.searchParams.set('_method', 'POST');
    url.searchParams.set('_body', JSON.stringify(body));

    const data = await _withRetry(() => _jsonp(url, 20_000));

    // Invalidate cache for affected resources
    const invalidates = {
      'quote':           ['quotes', 'dashboard'],
      'quote.send':      ['quotes'],
      'quote.approve':   ['quotes', 'dashboard'],
      'crm.lead':        ['crm', 'dashboard'],
      'email.send':      ['emails'],
      'invoice':         ['finance', 'dashboard'],
      'ops.log':         ['ops'],
      'quality.inspection': ['quality', 'dashboard'],
    };
    const toInvalidate = invalidates[action] || [];
    toInvalidate.forEach(prefix => invalidate(prefix));

    return data;
  }

  // ── PREFETCH — warm cache in background ───────────────────
  function prefetch(action, params = {}) {
    const key = _cacheKey(action, params);
    if (!_cache.has(key) && !_pending.has(key)) {
      get(action, params).catch(() => {}); // silent — best effort
    }
  }

  // ── HEALTH CHECK ──────────────────────────────────────────
  async function health() {
    try {
      const url = _url('health', {});
      const res = await _jsonp(url, 6_000);
      return res && res.ok;
    } catch(_) { return false; }
  }

  return { get, post, prefetch, invalidate, health, token };
})();
