// ============================================================
// assets/chat-widget.js  v3.0  — AskMiro modern chat
// Drop-in. No keys in frontend. Calls /api/chat
// ============================================================
(function () {
  if (window.__AskMiroChat) return;
  window.__AskMiroChat = true;

  const CFG = {
    endpoint:    '/api/chat',
    greeting:    "Hi 👋 I'm Miro. Ask me anything about our cleaning services — pricing, coverage, booking.",
    placeholder: 'Message Miro…',
    accent:      '#0A9688',
    accentMid:   '#0DBDAD',
  };

  let _msgs = [], _busy = false;

  // ── FONTS ─────────────────────────────────────────────
  const fl = document.createElement('link');
  fl.rel = 'stylesheet';
  fl.href = 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap';
  document.head.appendChild(fl);

  // ── STYLES ────────────────────────────────────────────
  const S = document.createElement('style');
  S.textContent = `
    /* ─── BUBBLE ─────────────────────────────────────── */
    #am-btn {
      position: fixed; bottom: 28px; right: 28px; z-index: 9998;
      width: 56px; height: 56px;
      border-radius: 18px;
      border: none; cursor: pointer;
      background: linear-gradient(135deg, ${CFG.accentMid} 0%, ${CFG.accent} 100%);
      box-shadow:
        0 0 0 1px rgba(10,150,136,.2),
        0 4px 12px rgba(10,150,136,.35),
        0 12px 32px rgba(10,150,136,.2),
        inset 0 1px 0 rgba(255,255,255,.25);
      display: flex; align-items: center; justify-content: center;
      transition:
        transform .3s cubic-bezier(.34,1.4,.64,1),
        box-shadow .25s ease,
        border-radius .35s cubic-bezier(.34,1.2,.64,1);
      overflow: hidden;
    }
    #am-btn::before {
      content: '';
      position: absolute; inset: 0;
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.25) 0%, transparent 65%);
      pointer-events: none;
    }
    #am-btn:hover {
      transform: translateY(-3px) scale(1.04);
      box-shadow:
        0 0 0 1px rgba(10,150,136,.25),
        0 6px 20px rgba(10,150,136,.45),
        0 20px 48px rgba(10,150,136,.25),
        inset 0 1px 0 rgba(255,255,255,.25);
    }
    #am-btn.open { border-radius: 14px; transform: rotate(0deg); }
    #am-btn-ico, #am-btn-x {
      position: absolute; transition: opacity .22s ease, transform .22s cubic-bezier(.34,1.3,.64,1);
    }
    #am-btn-x { opacity: 0; transform: rotate(-90deg) scale(.6); }
    #am-btn.open #am-btn-ico { opacity: 0; transform: rotate(90deg) scale(.6); }
    #am-btn.open #am-btn-x   { opacity: 1; transform: rotate(0deg) scale(1); }

    #am-notif {
      position: absolute; top: -5px; right: -5px;
      width: 17px; height: 17px;
      background: #FF4757; border-radius: 50%;
      border: 2.5px solid #fff;
      font-family: 'Figtree', sans-serif;
      font-size: 9px; font-weight: 700; color: #fff;
      display: none; align-items: center; justify-content: center;
      animation: am-notif-in .35s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes am-notif-in { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }

    /* ─── PANEL ───────────────────────────────────────── */
    #am-panel {
      position: fixed; bottom: 96px; right: 28px; z-index: 9999;
      width: 370px; max-width: calc(100vw - 32px);
      height: 560px; max-height: calc(100vh - 120px);
      border-radius: 24px;
      background: #ffffff;
      border: 1px solid rgba(10,150,136,.1);
      box-shadow:
        0 0 0 1px rgba(0,0,0,.04),
        0 8px 24px rgba(13,28,46,.1),
        0 32px 80px rgba(13,28,46,.14);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: 'Figtree', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      transform-origin: bottom right;
      transition:
        opacity .25s ease,
        transform .3s cubic-bezier(.34,1.15,.64,1);
    }
    #am-panel.am-hidden {
      opacity: 0;
      transform: scale(.92) translateY(16px);
      pointer-events: none;
    }

    /* ─── HEADER ──────────────────────────────────────── */
    #am-hd {
      flex-shrink: 0;
      padding: 18px 18px 16px;
      position: relative; overflow: hidden;
      background:
        radial-gradient(ellipse at 0% 0%,   rgba(20,212,194,.45) 0%, transparent 55%),
        radial-gradient(ellipse at 100% 100%, rgba(10,150,136,.6) 0%, transparent 55%),
        linear-gradient(160deg, #0e2438 0%, #0d1c2e 100%);
    }
    #am-hd::after {
      content: '';
      position: absolute; inset: 0;
      background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.025'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
      pointer-events: none;
    }
    #am-hd-inner {
      position: relative; z-index: 1;
      display: flex; align-items: center; gap: 12px;
    }
    #am-ava {
      width: 42px; height: 42px; flex-shrink: 0;
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(20,212,194,.3) 0%, rgba(10,150,136,.4) 100%);
      border: 1px solid rgba(255,255,255,.15);
      backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.15);
    }
    #am-hd-copy { flex: 1; min-width: 0; }
    #am-hd-name {
      font-size: 15px; font-weight: 700; color: #fff;
      letter-spacing: -.02em; line-height: 1.2;
    }
    #am-hd-sub {
      margin-top: 3px;
      display: flex; align-items: center; gap: 5px;
      font-size: 11.5px; color: rgba(255,255,255,.55); font-weight: 500;
    }
    #am-live {
      width: 6px; height: 6px; border-radius: 50%; background: #2EE89A; flex-shrink: 0;
      box-shadow: 0 0 0 2px rgba(46,232,154,.25);
      animation: am-live 2.8s ease-in-out infinite;
    }
    @keyframes am-live {
      0%,100%{box-shadow:0 0 0 2px rgba(46,232,154,.25)}
      50%{box-shadow:0 0 0 5px rgba(46,232,154,.08)}
    }
    #am-close {
      width: 30px; height: 30px; flex-shrink: 0;
      background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1);
      border-radius: 9px; color: rgba(255,255,255,.65);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s, transform .15s;
    }
    #am-close:hover { background: rgba(255,255,255,.16); color: #fff; transform: scale(1.05); }

    /* ─── MESSAGES ────────────────────────────────────── */
    #am-feed {
      flex: 1; overflow-y: auto; padding: 14px 14px 6px;
      display: flex; flex-direction: column; gap: 6px;
      scroll-behavior: smooth;
    }
    #am-feed::-webkit-scrollbar { width: 0; }

    .am-ts {
      text-align: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9.5px; color: #b0bec8; letter-spacing: .08em;
      text-transform: uppercase; margin: 4px 0 2px;
      user-select: none;
    }

    .am-row { display: flex; align-items: flex-end; gap: 7px; }
    .am-row.am-r { flex-direction: row-reverse; }

    .am-ava-s {
      width: 26px; height: 26px; flex-shrink: 0;
      border-radius: 9px;
      background: linear-gradient(135deg, ${CFG.accentMid} 0%, ${CFG.accent} 100%);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(10,150,136,.3);
    }

    .am-bubble {
      max-width: 80%; padding: 10px 14px;
      font-size: 13.5px; line-height: 1.65; word-break: break-word;
      animation: am-in .2s cubic-bezier(.34,1.2,.64,1);
    }
    @keyframes am-in { from{opacity:0;transform:scale(.94) translateY(6px)} to{opacity:1;transform:none} }

    .am-bubble.bot {
      background: #F4F7FA;
      color: #1a2a3a;
      border-radius: 16px 16px 16px 4px;
      border: 1px solid rgba(13,28,46,.06);
    }
    .am-bubble.usr {
      background: linear-gradient(135deg, ${CFG.accentMid} 0%, ${CFG.accent} 100%);
      color: #fff;
      border-radius: 16px 16px 4px 16px;
      box-shadow: 0 2px 12px rgba(10,150,136,.28);
    }
    .am-bubble.typ {
      background: #F4F7FA;
      border-radius: 16px 16px 16px 4px;
      border: 1px solid rgba(13,28,46,.06);
      display: flex; align-items: center; gap: 5px;
      padding: 13px 16px;
    }
    .am-dot {
      width: 7px; height: 7px;
      border-radius: 50%; background: #aab4be;
      animation: am-dot 1.1s ease-in-out infinite;
    }
    .am-dot:nth-child(2){animation-delay:.15s}
    .am-dot:nth-child(3){animation-delay:.3s}
    @keyframes am-dot {
      0%,60%,100%{transform:translateY(0);background:#aab4be}
      30%{transform:translateY(-5px);background:${CFG.accentMid}}
    }

    /* ─── QUICK REPLIES ───────────────────────────────── */
    #am-qr {
      padding: 8px 14px 4px;
      display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0;
      border-top: 1px solid #EEF2F6;
      animation: am-in .25s ease;
    }
    .am-q {
      font-family: 'Figtree', sans-serif;
      font-size: 12px; font-weight: 600;
      padding: 6px 13px; border-radius: 999px;
      border: 1.5px solid rgba(10,150,136,.25);
      color: ${CFG.accent};
      background: rgba(10,150,136,.04);
      cursor: pointer;
      transition: all .17s cubic-bezier(.34,1.3,.64,1);
      white-space: nowrap; line-height: 1.3;
    }
    .am-q:hover {
      background: ${CFG.accent}; color: #fff;
      border-color: ${CFG.accent};
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(10,150,136,.3);
    }

    /* ─── INPUT AREA ──────────────────────────────────── */
    #am-bar {
      padding: 10px 12px 13px;
      border-top: 1px solid #EEF2F6;
      display: flex; align-items: flex-end; gap: 8px;
      flex-shrink: 0; background: #fff;
    }
    #am-inp {
      flex: 1;
      border: 1.5px solid #E4ECF2;
      border-radius: 14px;
      padding: 10px 14px;
      font-size: 13.5px; font-family: 'Figtree', sans-serif; font-weight: 400;
      color: #1a2a3a; line-height: 1.5;
      background: #F8FBFC;
      outline: none; resize: none;
      max-height: 84px; overflow-y: auto;
      transition: border-color .18s, background .18s, box-shadow .18s;
    }
    #am-inp::placeholder { color: #a8b5c0; }
    #am-inp:focus {
      border-color: ${CFG.accentMid};
      background: #fff;
      box-shadow: 0 0 0 3.5px rgba(13,189,173,.12);
    }
    #am-go {
      width: 40px; height: 40px; flex-shrink: 0;
      border-radius: 13px; border: none;
      background: linear-gradient(135deg, ${CFG.accentMid} 0%, ${CFG.accent} 100%);
      color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(10,150,136,.3), inset 0 1px 0 rgba(255,255,255,.2);
      transition: transform .2s cubic-bezier(.34,1.4,.64,1), box-shadow .2s, opacity .15s;
    }
    #am-go:hover:not(:disabled) {
      transform: scale(1.08);
      box-shadow: 0 4px 16px rgba(10,150,136,.4), inset 0 1px 0 rgba(255,255,255,.2);
    }
    #am-go:active:not(:disabled) { transform: scale(.96); }
    #am-go:disabled { background: #E4ECF2; box-shadow: none; cursor: not-allowed; opacity: .6; }

    #am-foot {
      text-align: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px; color: #c4cdd5; letter-spacing: .06em;
      padding: 0 14px 10px; flex-shrink: 0;
    }

    /* ─── RESPONSIVE ──────────────────────────────────── */
    @media (max-width: 480px) {
      #am-panel { bottom: 84px; right: 10px; left: 10px; width: auto; border-radius: 20px; }
      #am-btn   { right: 18px; bottom: 20px; }
    }
  `;
  document.head.appendChild(S);

  // ── BUILD DOM ──────────────────────────────────────────

  // Launcher button
  const btn = document.createElement('button');
  btn.id = 'am-btn'; btn.setAttribute('aria-label', 'Open AskMiro chat');
  btn.innerHTML = `
    <span id="am-notif"></span>
    <span id="am-btn-ico">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </span>
    <span id="am-btn-x">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round">
        <line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/>
      </svg>
    </span>`;
  document.body.appendChild(btn);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'am-panel'; panel.classList.add('am-hidden');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'AskMiro chat');
  panel.innerHTML = `
    <div id="am-hd">
      <div id="am-hd-inner">
        <div id="am-ava">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <path d="M7 21L11 12L16 21L21 12L25 21" stroke="white" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div id="am-hd-copy">
          <div id="am-hd-name">AskMiro Assistant</div>
          <div id="am-hd-sub">
            <span id="am-live"></span> Online &mdash; replies instantly
          </div>
        </div>
        <button id="am-close" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
          </svg>
        </button>
      </div>
    </div>
    <div id="am-feed"></div>
    <div id="am-bar">
      <textarea id="am-inp" placeholder="${CFG.placeholder}" rows="1"></textarea>
      <button id="am-go" aria-label="Send" disabled>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2" fill="white" stroke="none"/>
        </svg>
      </button>
    </div>
    <div id="am-foot">POWERED BY ASKMIRO AI</div>`;
  document.body.appendChild(panel);

  const feed  = document.getElementById('am-feed');
  const inp   = document.getElementById('am-inp');
  const goBtn = document.getElementById('am-go');
  const notif = document.getElementById('am-notif');

  const QR = ['What areas do you cover?','Can I get a quote?','Do you clean offices?','Book a site visit'];

  function _ts() {
    return new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  }

  function _addMsg(role, text) {
    const row = document.createElement('div');
    row.className = 'am-row' + (role === 'user' ? ' am-r' : '');
    if (role !== 'user') {
      const av = document.createElement('div'); av.className = 'am-ava-s';
      av.innerHTML = `<svg width="12" height="12" viewBox="0 0 32 32" fill="none"><path d="M7 21L11 12L16 21L21 12L25 21" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      row.appendChild(av);
    }
    const b = document.createElement('div');
    b.className = 'am-bubble ' + (role === 'user' ? 'usr' : 'bot');
    b.textContent = text;
    row.appendChild(b);
    feed.appendChild(row);
    feed.scrollTop = feed.scrollHeight;
  }

  function _typing() {
    const row = document.createElement('div'); row.className = 'am-row'; row.id = 'am-typ';
    const av = document.createElement('div'); av.className = 'am-ava-s';
    av.innerHTML = `<svg width="12" height="12" viewBox="0 0 32 32" fill="none"><path d="M7 21L11 12L16 21L21 12L25 21" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    row.appendChild(av);
    const b = document.createElement('div'); b.className = 'am-bubble typ';
    b.innerHTML = '<div class="am-dot"></div><div class="am-dot"></div><div class="am-dot"></div>';
    row.appendChild(b); feed.appendChild(row); feed.scrollTop = feed.scrollHeight;
  }
  function _rmTyping() { const el = document.getElementById('am-typ'); if (el) el.remove(); }

  function _qr() {
    const w = document.createElement('div'); w.id = 'am-qr';
    QR.forEach(t => {
      const b = document.createElement('button'); b.className = 'am-q'; b.textContent = t;
      b.onclick = () => { w.remove(); _send(t); };
      w.appendChild(b);
    });
    panel.insertBefore(w, document.getElementById('am-bar'));
  }

  let _isOpen = false;

  function _open() {
    _isOpen = true;
    panel.classList.remove('am-hidden');
    btn.classList.add('open');
    notif.style.display = 'none';
    setTimeout(() => inp.focus(), 280);
    if (_msgs.length === 0) {
      const tl = document.createElement('div'); tl.className = 'am-ts'; tl.textContent = _ts();
      feed.appendChild(tl);
      _addMsg('assistant', CFG.greeting);
      _msgs.push({ role: 'assistant', content: CFG.greeting });
      setTimeout(_qr, 450);
    }
  }

  function _close() {
    _isOpen = false;
    panel.classList.add('am-hidden');
    btn.classList.remove('open');
  }

  btn.onclick = () => _isOpen ? _close() : _open();
  document.getElementById('am-close').onclick = _close;

  async function _send(text) {
    text = (text || inp.value).trim();
    if (!text || _busy) return;
    const qr = document.getElementById('am-qr'); if (qr) qr.remove();
    inp.value = ''; inp.style.height = 'auto'; goBtn.disabled = true;
    _addMsg('user', text); _msgs.push({ role: 'user', content: text });
    _busy = true; _typing();
    try {
      const res = await fetch(CFG.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: _msgs })
      });
      _rmTyping();
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      const reply = d.reply || d.error || 'Sorry, something went wrong. Please call 020 8073 0621.';
      _addMsg('assistant', reply); _msgs.push({ role: 'assistant', content: reply });
      if (!_isOpen) { notif.style.display = 'flex'; }
    } catch (err) {
      _rmTyping();
      _addMsg('assistant', "Sorry, having trouble connecting. Call us on 020 8073 0621 or email info@askmiro.com.");
      console.warn('[AskMiro]', err);
    }
    _busy = false;
    if (inp.value.trim()) goBtn.disabled = false;
  }

  inp.addEventListener('input', () => {
    goBtn.disabled = !inp.value.trim() || _busy;
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 84) + 'px';
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
  });
  goBtn.addEventListener('click', () => _send());

  // Invite badge after 12s
  setTimeout(() => { if (!_isOpen && _msgs.length === 0) notif.style.display = 'flex'; }, 12000);

})();
