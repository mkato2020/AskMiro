// ============================================================
// chat-widget.js  v3.0
// AskMiro Website AI Assistant — Premium Dark UI + Lead Capture
// ============================================================
(function () {
  if (window.__AskMiroChat) return;
  window.__AskMiroChat = true;

  const CFG = {
    endpoint:    '/api/chat',
    greeting:    "Hello! I'm Miro, AskMiro's virtual assistant. How can I help you today?",
    placeholder: 'Ask about services, coverage, or a quote…',
    brand:       'AskMiro',
  };

  let _messages    = [];
  let _loading     = false;
  let chatVisible  = false;
  let _leadFired   = false;
  const _sessionId = 'sess_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now();

  // ── Styles ────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap');

    #am-wrap * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Figtree', system-ui, sans-serif; }

    #am-bubble {
      position: fixed; bottom: 28px; right: 28px; z-index: 9998;
      width: 58px; height: 58px; border-radius: 50%; border: none;
      background: linear-gradient(135deg, #0DBDAD, #0A9688);
      box-shadow: 0 4px 24px rgba(10,150,136,.5);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: transform .3s cubic-bezier(0.34,1.3,0.64,1), box-shadow .25s;
    }
    /* GPU-composited pulse ring — uses transform not box-shadow */
    #am-bubble::before {
      content: ''; position: absolute; inset: 0; border-radius: 50%;
      background: rgba(13,189,173,.35);
      transform: scale(1); opacity: 1;
      animation: am-pulse 3s ease-in-out infinite;
      will-change: transform, opacity;
    }
    #am-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 32px rgba(10,150,136,.6);
    }
    #am-bubble:hover::before { animation: none; opacity: 0; }
    @keyframes am-pulse {
      0%,100% { transform: scale(1);   opacity: .35; }
      50%      { transform: scale(1.5); opacity: 0;   }
    }
    #am-bubble svg { pointer-events: none; transition: transform .3s cubic-bezier(0.34,1.3,0.64,1); }
    #am-bubble.open svg.icon-chat  { transform: scale(0) rotate(-90deg); }
    #am-bubble svg.icon-close      { position: absolute; transform: scale(0) rotate(90deg); transition: transform .3s cubic-bezier(0.34,1.3,0.64,1); }
    #am-bubble.open svg.icon-close { transform: scale(1) rotate(0deg); }

    #am-badge {
      position: absolute; top: 0; right: 0;
      width: 16px; height: 16px; background: #ef4444;
      border-radius: 50%; border: 2.5px solid #fff;
      display: none; animation: am-badge-pop .3s cubic-bezier(0.34,1.3,0.64,1);
    }
    @keyframes am-badge-pop { from { transform: scale(0); } to { transform: scale(1); } }

    #am-win {
      position: fixed; bottom: 100px; right: 28px; z-index: 9999;
      width: 380px; max-width: calc(100vw - 32px);
      height: 560px; max-height: calc(100vh - 120px);
      display: flex; flex-direction: column; overflow: hidden;
      border-radius: 20px;
      background: #0D1C2E;
      border: 1px solid rgba(13,189,173,.2);
      box-shadow: 0 24px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.04), inset 0 1px 0 rgba(255,255,255,.06);
      transition: opacity .25s ease, transform .3s cubic-bezier(0.34,1.3,0.64,1);
    }
    #am-win.am-hidden { opacity: 0; transform: translateY(16px) scale(.96); pointer-events: none; }

    #am-header {
      padding: 16px 18px 14px;
      background: linear-gradient(135deg, rgba(13,189,173,.12) 0%, rgba(10,150,136,.06) 100%);
      border-bottom: 1px solid rgba(13,189,173,.15);
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      position: relative; overflow: hidden;
    }
    #am-header::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(13,189,173,.6), transparent);
    }
    .am-avatar {
      width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
      background: linear-gradient(135deg, #0DBDAD, #0A9688);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(10,150,136,.4);
    }
    .am-hinfo { flex: 1; min-width: 0; }
    .am-hname { font-size: 13px; font-weight: 700; color: #fff; letter-spacing: -.01em; }
    .am-hstatus {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px; color: rgba(13,189,173,.8);
      letter-spacing: .06em; text-transform: uppercase;
      display: flex; align-items: center; gap: 5px; margin-top: 2px;
    }
    .am-hstatus::before {
      content: ''; width: 5px; height: 5px; border-radius: 50%;
      background: #0DBDAD; flex-shrink: 0;
      box-shadow: 0 0 6px rgba(13,189,173,.8);
      animation: am-blink 2s ease-in-out infinite;
    }
    @keyframes am-blink { 0%,100%{opacity:1} 50%{opacity:.4} }
    #am-close {
      width: 30px; height: 30px; border-radius: 8px; border: none;
      background: rgba(255,255,255,.06); color: rgba(255,255,255,.5);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s; flex-shrink: 0;
    }
    #am-close:hover { background: rgba(255,255,255,.12); color: #fff; }

    #am-msgs {
      flex: 1; overflow-y: auto; padding: 16px 14px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
      background: radial-gradient(ellipse 80% 40% at 50% 0%, rgba(13,189,173,.04) 0%, transparent 60%);
    }
    #am-msgs::-webkit-scrollbar { width: 3px; }
    #am-msgs::-webkit-scrollbar-track { background: transparent; }
    #am-msgs::-webkit-scrollbar-thumb { background: rgba(13,189,173,.2); border-radius: 3px; }

    .am-msg {
      max-width: 84%; padding: 10px 14px; border-radius: 14px;
      font-size: 13px; line-height: 1.65; word-break: break-word;
      animation: am-msg-in .25s cubic-bezier(0.34,1.3,0.64,1);
    }
    @keyframes am-msg-in { from { opacity:0; transform: translateY(8px) scale(.97); } to { opacity:1; transform: none; } }
    .am-msg.am-bot {
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08);
      color: rgba(255,255,255,.88); align-self: flex-start; border-bottom-left-radius: 4px;
    }
    .am-msg.am-user {
      background: linear-gradient(135deg, #0DBDAD, #0A9688);
      color: #fff; align-self: flex-end; border-bottom-right-radius: 4px;
      box-shadow: 0 4px 16px rgba(10,150,136,.3);
    }
    .am-msg.am-typing {
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08);
      align-self: flex-start; display: flex; align-items: center; gap: 5px;
      padding: 13px 16px; border-bottom-left-radius: 4px;
    }
    .am-dot {
      width: 5px; height: 5px; border-radius: 50%; background: rgba(13,189,173,.7);
      animation: am-bounce .9s infinite;
    }
    .am-dot:nth-child(2) { animation-delay: .18s; }
    .am-dot:nth-child(3) { animation-delay: .36s; }
    @keyframes am-bounce { 0%,60%,100%{transform:translateY(0);opacity:.5} 30%{transform:translateY(-6px);opacity:1} }

    .am-qrs { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 14px 6px; flex-shrink: 0; }
    .am-qr {
      font-size: 11.5px; font-weight: 500; padding: 6px 12px; border-radius: 999px;
      border: 1px solid rgba(13,189,173,.35); color: rgba(13,189,173,.9);
      background: rgba(13,189,173,.07); cursor: pointer; font-family: 'Figtree', sans-serif;
      transition: all .15s; white-space: nowrap;
    }
    .am-qr:hover {
      background: linear-gradient(135deg, #0DBDAD, #0A9688);
      border-color: transparent; color: #fff;
      box-shadow: 0 4px 12px rgba(10,150,136,.35); transform: translateY(-1px);
    }

    #am-footer {
      padding: 10px 12px 12px; border-top: 1px solid rgba(255,255,255,.07);
      background: rgba(0,0,0,.2); display: flex; gap: 8px; flex-shrink: 0; align-items: flex-end;
    }
    #am-input {
      flex: 1; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
      border-radius: 10px; padding: 10px 13px; font-size: 13px; color: #fff;
      font-family: 'Figtree', sans-serif; outline: none; resize: none; line-height: 1.5;
      max-height: 80px; overflow-y: auto; transition: border-color .15s, background .15s;
    }
    #am-input::placeholder { color: rgba(255,255,255,.25); }
    #am-input:focus { border-color: rgba(13,189,173,.5); background: rgba(255,255,255,.08); }
    #am-send {
      width: 38px; height: 38px; border-radius: 10px; border: none;
      background: linear-gradient(135deg, #0DBDAD, #0A9688);
      color: #fff; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 12px rgba(10,150,136,.35);
      transition: transform .2s cubic-bezier(0.34,1.3,0.64,1), box-shadow .2s;
    }
    #am-send:hover:not(:disabled) { transform: scale(1.08) translateY(-1px); box-shadow: 0 6px 20px rgba(10,150,136,.5); }
    #am-send:disabled { background: rgba(255,255,255,.08); box-shadow: none; cursor: not-allowed; }
    #am-send:disabled svg { opacity: .3; }

    #am-powered {
      text-align: center; padding: 0 0 8px;
      font-family: 'JetBrains Mono', monospace; font-size: 9px;
      letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.12); flex-shrink: 0;
    }

    @media (max-width: 480px) {
      #am-win { right: 12px; left: 12px; width: auto; bottom: 90px; }
      #am-bubble { bottom: 20px; right: 20px; }
    }
  `;
  document.head.appendChild(style);

  // ── DOM ───────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.id = 'am-wrap';
  wrap.innerHTML = `
    <button id="am-bubble" aria-label="Open AskMiro chat">
      <span id="am-badge"></span>
      <svg class="icon-chat" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="icon-close" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div id="am-win" class="am-hidden" role="dialog" aria-label="AskMiro chat assistant">
      <div id="am-header">
        <div class="am-avatar">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="am-hinfo">
          <div class="am-hname">AskMiro Assistant</div>
          <div class="am-hstatus">Online · replies instantly</div>
        </div>
        <button id="am-close" aria-label="Close chat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div id="am-msgs"></div>
      <div id="am-footer">
        <textarea id="am-input" placeholder="Ask about services, coverage, or a quote…" rows="1"></textarea>
        <button id="am-send" aria-label="Send" disabled>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div id="am-powered">Powered by AskMiro AI</div>
    </div>`;
  document.body.appendChild(wrap);

  const bubble   = document.getElementById('am-bubble');
  const win      = document.getElementById('am-win');
  const msgsEl   = document.getElementById('am-msgs');
  const inputEl  = document.getElementById('am-input');
  const sendBtn  = document.getElementById('am-send');
  const closeBtn = document.getElementById('am-close');
  const badge    = document.getElementById('am-badge');

  const QUICK_REPLIES = [
    'What areas do you cover?',
    'Can I get a quote?',
    'Do you clean offices?',
    'Book a site visit',
  ];

  // ── Helpers ───────────────────────────────────────────────
  function addMsg(role, content) {
    const d = document.createElement('div');
    d.className = 'am-msg ' + (role === 'user' ? 'am-user' : 'am-bot');
    d.textContent = content;
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function addTyping() {
    const d = document.createElement('div');
    d.className = 'am-msg am-typing'; d.id = 'am-typing';
    d.innerHTML = '<div class="am-dot"></div><div class="am-dot"></div><div class="am-dot"></div>';
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('am-typing');
    if (el) el.remove();
  }

  function addQuickReplies() {
    const existing = document.getElementById('am-qr-wrap');
    if (existing) existing.remove();
    const qrWrap = document.createElement('div');
    qrWrap.className = 'am-qrs'; qrWrap.id = 'am-qr-wrap';
    QUICK_REPLIES.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'am-qr'; btn.textContent = text;
      btn.onclick = () => { qrWrap.remove(); send(text); };
      qrWrap.appendChild(btn);
    });
    // Insert after msgs div, before footer
    win.insertBefore(qrWrap, document.getElementById('am-footer'));
  }

  // ── Open / close ──────────────────────────────────────────
  function openChat() {
    chatVisible = true;
    win.classList.remove('am-hidden');
    bubble.classList.add('open');
    badge.style.display = 'none';
    setTimeout(() => inputEl.focus(), 50);
    if (_messages.length === 0) {
      addMsg('assistant', CFG.greeting);
      _messages.push({ role: 'assistant', content: CFG.greeting });
      setTimeout(addQuickReplies, 500);
    }
  }

  function closeChat() {
    chatVisible = false;
    win.classList.add('am-hidden');
    bubble.classList.remove('open');
  }

  bubble.onclick = () => chatVisible ? closeChat() : openChat();
  closeBtn.onclick = () => closeChat();

  // ── Send ──────────────────────────────────────────────────
  async function send(text) {
    text = (text || inputEl.value).trim();
    if (!text || _loading) return;

    const qr = document.getElementById('am-qr-wrap');
    if (qr) qr.remove();

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;

    addMsg('user', text);
    _messages.push({ role: 'user', content: text });

    _loading = true;
    addTyping();

    try {
      const res = await fetch(CFG.endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages:        _messages,
          sessionId:       _sessionId,
          leadAlreadyFired: _leadFired,
        }),
      });

      removeTyping();
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const data = await res.json();
      const reply = data.message || data.reply || data.error || 'Sorry, something went wrong. Please call 020 8073 0621.';

      // Mark lead as fired if server confirmed it
      if (data.leadFired) _leadFired = true;

      addMsg('assistant', reply);
      _messages.push({ role: 'assistant', content: reply });

      if (!chatVisible) badge.style.display = 'block';

    } catch (err) {
      removeTyping();
      addMsg('assistant', "Sorry, I'm having trouble connecting right now. Please call us on 020 8073 0621 or email office@askmiro.com.");
      console.warn('[AskMiro Chat]', err);
    }

    _loading = false;
    if (inputEl.value.trim()) sendBtn.disabled = false;
  }

  // ── Input handlers ────────────────────────────────────────
  inputEl.addEventListener('input', () => {
    sendBtn.disabled = !inputEl.value.trim() || _loading;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  sendBtn.addEventListener('click', () => send());

  // Badge after 8s to invite engagement
  setTimeout(() => {
    if (!chatVisible && _messages.length === 0) badge.style.display = 'block';
  }, 8000);

})();
