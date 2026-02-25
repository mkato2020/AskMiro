// ============================================================
// AskMiro Ops — auth.js
// ============================================================
const Auth = (() => {
  let _user = null;

  function getToken() { return localStorage.getItem(CFG.TOKEN_KEY) || ''; }
  function getUser() { return _user; }

  async function login() {
    const inp = document.getElementById('token-input');
    const err = document.getElementById('login-err');
    const btn = document.getElementById('login-btn');
    const token = (inp.value || '').trim();
    if (!token) { showErr('Please enter your access token'); return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      localStorage.setItem(CFG.TOKEN_KEY, token);
      const user = await API.get('me');
      _user = user;
      localStorage.setItem(CFG.USER_KEY, JSON.stringify(user));
      showApp(user);
    } catch(e) {
      localStorage.removeItem(CFG.TOKEN_KEY);
      showErr(e.message || 'Invalid token. Please try again.');
      btn.disabled = false; btn.textContent = 'Sign In →';
    }
  }

  function showErr(msg) {
    const el = document.getElementById('login-err');
    el.textContent = msg; el.classList.remove('hidden');
  }

  function showApp(user) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('user-name').textContent = user.name || user.email;
    document.getElementById('user-role').textContent = user.role;
    document.getElementById('user-av').textContent = UI.initials(user.name || user.email);
    document.getElementById('login-err') && document.getElementById('login-err').classList.add('hidden');
  }

  function logout() {
    localStorage.removeItem(CFG.TOKEN_KEY);
    localStorage.removeItem(CFG.USER_KEY);
    _user = null;
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    const inp = document.getElementById('token-input');
    if (inp) { inp.value = ''; }
  }

  async function init() {
    const token = getToken();
    if (!token) { showLogin(); return false; }
    try {
      const cached = localStorage.getItem(CFG.USER_KEY);
      if (cached) { _user = JSON.parse(cached); showApp(_user); return true; }
      const user = await API.get('me');
      _user = user;
      localStorage.setItem(CFG.USER_KEY, JSON.stringify(user));
      showApp(user);
      return true;
    } catch(e) {
      localStorage.removeItem(CFG.TOKEN_KEY);
      localStorage.removeItem(CFG.USER_KEY);
      showLogin();
      return false;
    }
  }

  function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  }

  function hasRole(minRole) {
    const order = ['Owner','OpsManager','Supervisor','Cleaner','Finance'];
    const userIdx = order.indexOf(_user && _user.role);
    const minIdx = order.indexOf(minRole);
    return userIdx <= minIdx;
  }

  return { login, logout, init, getUser, getToken, hasRole };
})();
