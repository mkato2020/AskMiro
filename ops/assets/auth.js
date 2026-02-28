// ============================================================
// AskMiro Ops — auth.js  v2
// Secure token handling + session management + rate limiting
// ============================================================
const Auth = (() => {
  let _user       = null;
  let _loginTries = 0;
  let _lockUntil  = 0;

  // ── TOKEN: sessionStorage (cleared on tab close) ──────────
  // Falls back to localStorage only if user explicitly chose "remember"
  function getToken() {
    return sessionStorage.getItem(CFG.TOKEN_KEY)
        || localStorage.getItem(CFG.TOKEN_KEY)
        || '';
  }

  function _saveToken(token, remember = false) {
    sessionStorage.setItem(CFG.TOKEN_KEY, token);
    if (remember) localStorage.setItem(CFG.TOKEN_KEY, token);
  }

  function _clearToken() {
    sessionStorage.removeItem(CFG.TOKEN_KEY);
    localStorage.removeItem(CFG.TOKEN_KEY);
    sessionStorage.removeItem(CFG.USER_KEY);
    localStorage.removeItem(CFG.USER_KEY);
  }

  function getUser() { return _user; }

  // ── TOKEN VALIDATION ──────────────────────────────────────
  function _validateTokenFormat(token) {
    // Tokens must start with miro_ and be 20–120 chars, alphanumeric + underscore/dash
    return /^miro_[A-Za-z0-9_\-]{8,100}$/.test(token);
  }

  // ── LOGIN ─────────────────────────────────────────────────
  async function login() {
    const inp = document.getElementById('token-input');
    const btn = document.getElementById('login-btn');
    const token = (inp.value || '').trim();

    // Rate limiting: max 5 attempts, then 60s lockout
    if (Date.now() < _lockUntil) {
      const secs = Math.ceil((_lockUntil - Date.now()) / 1000);
      showErr(`Too many attempts. Please wait ${secs}s.`);
      return;
    }

    if (!token) { showErr('Please enter your access token'); return; }

    if (!_validateTokenFormat(token)) {
      showErr('Invalid token format. Tokens start with miro_');
      return;
    }

    btn.disabled = true; btn.textContent = 'Signing in…';

    try {
      _saveToken(token);
      const user = await API.get('me', {}, { strict: true });
      _user = user;
      // Store minimal user info — never store sensitive fields
      const safeUser = {
        name:  user.name  || '',
        email: user.email || '',
        role:  user.role  || '',
        id:    user.id    || '',
      };
      sessionStorage.setItem(CFG.USER_KEY, JSON.stringify(safeUser));
      _loginTries = 0;
      showApp(safeUser);
      // Prefetch dashboard data while login animates
      API.prefetch('dashboard');
      API.prefetch('crm');
    } catch(e) {
      _clearToken();
      _loginTries++;
      if (_loginTries >= 5) {
        _lockUntil = Date.now() + 60_000;
        _loginTries = 0;
        showErr('Too many failed attempts. Locked for 60 seconds.');
      } else {
        showErr(e.message || 'Invalid token. Please try again.');
      }
      btn.disabled = false;
      btn.textContent = 'Sign In →';
    }
  }

  // ── LOGOUT ────────────────────────────────────────────────
  function logout() {
    _clearToken();
    API.invalidate(); // clear all cached data
    _user = null;
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    const inp = document.getElementById('token-input');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  // ── INIT ──────────────────────────────────────────────────
  async function init() {
    const token = getToken();
    if (!token) { showLogin(); return false; }
    if (!_validateTokenFormat(token)) {
      _clearToken();
      showLogin();
      return false;
    }
    try {
      // Show app instantly from cache, revalidate in background
      const cached = sessionStorage.getItem(CFG.USER_KEY)
                  || localStorage.getItem(CFG.USER_KEY);
      if (cached) {
        _user = JSON.parse(cached);
        showApp(_user);
        // Silently revalidate token in background
        API.get('me', {}, { forceRefresh: true })
          .then(user => {
            _user = user;
            sessionStorage.setItem(CFG.USER_KEY, JSON.stringify({
              name: user.name, email: user.email, role: user.role, id: user.id
            }));
            // Update display name if changed
            document.getElementById('user-name').textContent = user.name || user.email;
          })
          .catch(() => {}); // silent — cached session still valid
        return true;
      }
      const user = await API.get('me', {}, { strict: true });
      _user = user;
      sessionStorage.setItem(CFG.USER_KEY, JSON.stringify({
        name: user.name, email: user.email, role: user.role, id: user.id
      }));
      showApp(user);
      return true;
    } catch(e) {
      _clearToken();
      showLogin();
      return false;
    }
  }

  // ── AUTO-LOGOUT on page hide (optional — comment out if unwanted) ──
  // document.addEventListener('visibilitychange', () => {
  //   if (document.visibilityState === 'hidden') logout();
  // });

  // ── UI HELPERS ────────────────────────────────────────────
  function showErr(msg) {
  const el = document.getElementById('login-err');
  if (!el) {
    console.warn('login-err element not found');
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}
  function showApp(user) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('user-name').textContent = user.name || user.email;
    document.getElementById('user-role').textContent = user.role;
    document.getElementById('user-av').textContent = UI.initials(user.name || user.email);
    const errEl = document.getElementById('login-err');
    if (errEl) errEl.classList.add('hidden');
  }

  function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  }

  function hasRole(minRole) {
    const order = ['Owner','OpsManager','Supervisor','Cleaner','Finance'];
    const userIdx = order.indexOf(_user && _user.role);
    const minIdx  = order.indexOf(minRole);
    return userIdx !== -1 && userIdx <= minIdx;
  }

  return { login, logout, init, getUser, getToken, hasRole };
})();
