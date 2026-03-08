// ============================================================
// assets/chat-widget.js  v1.0
// AskMiro Website AI Assistant
// Drop-in widget — add one script tag to any page.
// Calls /api/chat (Netlify Function) — no keys in frontend.
// ============================================================
(function () {
  if (window.__AskMiroChat) return; // prevent double-init
  window.__AskMiroChat = true;

  // ── Config ────────────────────────────────────────────────
  const CFG = {
    endpoint:    '/api/chat',
    greeting:    "Hello! I'm AskMiro's virtual assistant. How can I help you today?",
    placeholder: 'Ask about our services, areas covered, or getting a quote…',
    brand:       'AskMiro',
    accent:      '#0D9488',
    accentDark:  '#0F766E',
  };

  // ── State ─────────────────────────────────────────────────
  let _open     = false;
  let _messages = []; // { role, content }
  let _loading  = false;

  // ── Inject styles ─────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #am-chat-bubble {
      position: fixed; bottom: 24px; right: 24px; z-index: 9998;
      width: 52px; height: 52px; border-radius: 50%;
      background: ${CFG.accent}; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(13,148,136,.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s, background .2s;
    }
    #am-chat-bubble:hover { background: ${CFG.accentDark}; transform: scale(1.07); }
    #am-chat-bubble svg { pointer-events: none; }

    #am-chat-window {
      position: fixed; bottom: 88px; right: 24px; z-index: 9999;
      width: 360px; max-width: calc(100vw - 32px);
      height: 520px; max-height: calc(100vh - 110px);
      background: #fff; border-radius: 16px;
      box-shadow: 0 12px 48px rgba(0,0,0,.16);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: 'DM Sans', system-ui, sans-serif;
      transition: opacity .2s, transform .2s;
    }
    #am-chat-window.am-hidden {
      opacity: 0; transform: translateY(12px) scale(.97); pointer-events: none;
    }

    #am-chat-header {
      background: ${CFG.accent}; color: #fff;
      padding: 14px 16px; display: flex; align-items: center; gap: 10px;
      flex-shrink: 0;
    }
    #am-chat-header .am-logo {
      width: 32px; height: 32px; background: rgba(255,255,255,.2);
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    #am-chat-header .am-title { font-weight: 700; font-size: 14px; line-height: 1.2; }
    #am-chat-header .am-sub { font-size: 11px; opacity: .8; margin-top: 1px; }
    #am-chat-close {
      margin-left: auto; background: none; border: none; color: rgba(255,255,255,.8);
      cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 4px;
    }
    #am-chat-close:hover { color: #fff; }

    #am-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    #am-chat-messages::-webkit-scrollbar { width: 4px; }
    #am-chat-messages::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }

    .am-msg {
      max-width: 82%; padding: 10px 13px; border-radius: 12px;
      font-size: 13px; line-height: 1.6; word-break: break-word;
    }
    .am-msg.am-bot {
      background: #f1f5f9; color: #1e293b; align-self: flex-start;
      border-bottom-left-radius: 3px;
    }
    .am-msg.am-user {
      background: ${CFG.accent}; color: #fff; align-self: flex-end;
      border-bottom-right-radius: 3px;
    }
    .am-msg.am-typing {
      background: #f1f5f9; align-self: flex-start;
      display: flex; align-items: center; gap: 4px; padding: 12px 14px;
    }
    .am-dot {
      width: 6px; height: 6px; background: #94a3b8; border-radius: 50%;
      animation: am-bounce .9s infinite;
    }
    .am-dot:nth-child(2) { animation-delay: .15s; }
    .am-dot:nth-child(3) { animation-delay: .30s; }
    @keyframes am-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

    #am-chat-footer {
      padding: 10px 12px; border-top: 1px solid #e2e8f0;
      display: flex; gap: 8px; flex-shrink: 0; background: #fff;
    }
    #am-chat-input {
      flex: 1; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 9px 12px; font-size: 13px; font-family: inherit;
      outline: none; resize: none; line-height: 1.5;
      max-height: 80px; overflow-y: auto;
      transition: border-color .15s;
    }
    #am-chat-input:focus { border-color: ${CFG.accent}; }
    #am-chat-send {
      width: 36px; height: 36px; border-radius: 8px; border: none;
      background: ${CFG.accent}; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; align-self: flex-end; margin-bottom: 1px;
      transition: background .15s;
    }
    #am-chat-send:hover:not(:disabled) { background: ${CFG.accentDark}; }
    #am-chat-send:disabled { background: #e2e8f0; cursor: not-allowed; }

    .am-quick-replies {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;
    }
    .am-qr {
      font-size: 11px; padding: 5px 10px; border-radius: 999px;
      border: 1px solid ${CFG.accent}; color: ${CFG.accent};
      background: #f0fdfa; cursor: pointer; font-family: inherit;
      transition: all .15s; white-space: nowrap;
    }
    .am-qr:hover { background: ${CFG.accent}; color: #fff; }

    #am-chat-badge {
      position: absolute; top: -4px; right: -4px;
      width: 14px; height: 14px; background: #dc2626;
      border-radius: 50%; border: 2px solid #fff;
      display: none;
    }
  `;
  document.head.appendChild(style);

  // ── Build DOM ─────────────────────────────────────────────
  // Bubble
  const bubble = document.createElement('button');
  bubble.id = 'am-chat-bubble';
  bubble.setAttribute('aria-label', 'Open AskMiro chat');
  bubble.innerHTML = `
    <span id="am-chat-badge"></span>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`;
  document.body.appendChild(bubble);

  // Window
  const win = document.createElement('div');
  win.id = 'am-chat-window';
  win.classList.add('am-hidden');
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'AskMiro chat assistant');
  win.innerHTML = `
    <div id="am-chat-header">
      <div class="am-logo">
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
          <path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <div class="am-title">${CFG.brand}</div>
        <div class="am-sub">Virtual assistant · Usually replies instantly</div>
      </div>
      <button id="am-chat-close" aria-label="Close chat">&#x2715;</button>
    </div>
    <div id="am-chat-messages"></div>
    <div id="am-chat-footer">
      <textarea id="am-chat-input" placeholder="${CFG.placeholder}" rows="1"></textarea>
      <button id="am-chat-send" aria-label="Send message" disabled>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>`;
  document.body.appendChild(win);

  // ── DOM refs ──────────────────────────────────────────────
  const messagesEl = document.getElementById('am-chat-messages');
  const inputEl    = document.getElementById('am-chat-input');
  const sendBtn    = document.getElementById('am-chat-send');
  const closeBtn   = document.getElementById('am-chat-close');
  const badge      = document.getElementById('am-chat-badge');

  // ── Quick replies shown on first open ─────────────────────
  const QUICK_REPLIES = [
    'What areas do you cover?',
    'Can I get a quote?',
    'Do you clean offices?',
    'Book a site visit',
  ];

  // ── Helpers ───────────────────────────────────────────────
  function _addMessage(role, content) {
    const div = document.createElement('div');
    div.className = 'am-msg ' + (role === 'user' ? 'am-user' : 'am-bot');
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function _addTyping() {
    const div = document.createElement('div');
    div.className = 'am-msg am-typing';
    div.id = 'am-typing';
    div.innerHTML = '<div class="am-dot"></div><div class="am-dot"></div><div class="am-dot"></div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function _removeTyping() {
    const el = document.getElementById('am-typing');
    if (el) el.remove();
  }

  function _addQuickReplies() {
    const wrap = document.createElement('div');
    wrap.className = 'am-quick-replies';
    wrap.id = 'am-qr-wrap';
    QUICK_REPLIES.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'am-qr';
      btn.textContent = text;
      btn.onclick = () => {
        wrap.remove();
        _send(text);
      };
      wrap.appendChild(btn);
    });
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Open / close ──────────────────────────────────────────
  function _open() {
    _open = true;
    win.classList.remove('am-hidden');
    badge.style.display = 'none';
    inputEl.focus();

    // Show greeting if first open
    if (_messages.length === 0) {
      _addMessage('assistant', CFG.greeting);
      _messages.push({ role: 'assistant', content: CFG.greeting });
      setTimeout(_addQuickReplies, 400);
    }
  }

  function _close() {
    _open = false;
    win.classList.add('am-hidden');
  }

  bubble.addEventListener('click', () => _open ? _close() : _openFn());
  closeBtn.addEventListener('click', _close);
  const _openFn = _open; // alias

  // Fix: use a proper boolean flag
  let chatVisible = false;
  bubble.onclick = () => {
    chatVisible = !chatVisible;
    chatVisible ? _openChat() : _closeChat();
  };
  closeBtn.onclick = () => { chatVisible = false; _closeChat(); };

  function _openChat() {
    win.classList.remove('am-hidden');
    badge.style.display = 'none';
    inputEl.focus();
    if (_messages.length === 0) {
      _addMessage('assistant', CFG.greeting);
      _messages.push({ role: 'assistant', content: CFG.greeting });
      setTimeout(_addQuickReplies, 500);
    }
  }

  function _closeChat() {
    win.classList.add('am-hidden');
  }

  // ── Send message ──────────────────────────────────────────
  async function _send(text) {
    text = (text || inputEl.value).trim();
    if (!text || _loading) return;

    // Remove quick replies if still visible
    const qr = document.getElementById('am-qr-wrap');
    if (qr) qr.remove();

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;

    _addMessage('user', text);
    _messages.push({ role: 'user', content: text });

    _loading = true;
    _addTyping();

    try {
      const res = await fetch(CFG.endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: _messages }),
      });

      _removeTyping();

      if (!res.ok) throw new Error('HTTP ' + res.status);

      const data = await res.json();
      const reply = data.reply || data.error || 'Sorry, something went wrong. Please call 020 8073 0621.';

      _addMessage('assistant', reply);
      _messages.push({ role: 'assistant', content: reply });

      // Show notification badge if window is closed
      if (!chatVisible) {
        badge.style.display = 'block';
      }

    } catch (err) {
      _removeTyping();
      _addMessage('assistant', 'Sorry, I\'m having trouble connecting right now. Please call us on 020 8073 0621 or email office@askmiro.com.');
      console.warn('[AskMiro Chat]', err);
    }

    _loading = false;
    if (inputEl.value.trim()) sendBtn.disabled = false;
  }

  // ── Input handlers ────────────────────────────────────────
  inputEl.addEventListener('input', () => {
    sendBtn.disabled = !inputEl.value.trim() || _loading;
    // Auto-grow textarea
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _send();
    }
  });

  sendBtn.addEventListener('click', () => _send());

  // ── Show badge after 8 seconds to invite engagement ───────
  setTimeout(() => {
    if (!chatVisible && _messages.length === 0) {
      badge.style.display = 'block';
    }
  }, 8000);

})();
