// ============================================================
// AskMiro Ops — Outreach Queue  v1.0
// Outbound lead management: queue → send → follow-up → reply
// ============================================================
window.Outreach = (() => {

  let _queue       = [];
  let _log         = [];
  let _stats       = {};
  let _templates   = [];
  let _humanQueue  = [];   // leads needing human action
  let _autorun     = {};   // autopilot status (sent today, cap remaining)
  let _perf        = {};   // performance dashboard data (Part 5)
  let _view        = 'queue';   // queue | sent | replies | human | perf
  let _q           = '';
  let _sending     = new Set(); // lead IDs currently being sent

  // ── HELPERS ────────────────────────────────────────────────
  function _esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }

  function _timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso);
    if (diff < 0) return 'Just now';
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(diff / 3600000);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(diff / 86400000);
    return d === 1 ? 'Yesterday' : d + 'd ago';
  }

  const SCORE_COLOR = s => {
    const n = Number(s || 0);
    if (n >= 8) return '#059669';
    if (n >= 5) return '#D97706';
    return '#94A3B8';
  };

  const INTENT_META = {
    POSITIVE:      { color: '#059669', bg: '#ECFDF5', label: 'Interested'    },
    positive:      { color: '#059669', bg: '#ECFDF5', label: 'Interested'    },
    INTERESTED:    { color: '#059669', bg: '#ECFDF5', label: 'Interested'    },
    NOT_INTERESTED:{ color: '#DC2626', bg: '#FEF2F2', label: 'Not interested' },
    negative:      { color: '#DC2626', bg: '#FEF2F2', label: 'Not interested' },
    UNSUBSCRIBE:   { color: '#7C3AED', bg: '#EDE9FE', label: 'Opt-out'       },
    unsubscribe:   { color: '#7C3AED', bg: '#EDE9FE', label: 'Opt-out'       },
    INFO_REQUEST:  { color: '#0284C7', bg: '#E0F2FE', label: 'Wants info'    },
    info_request:  { color: '#0284C7', bg: '#E0F2FE', label: 'Wants info'    },
    OUT_OF_OFFICE: { color: '#64748B', bg: '#F1F5F9', label: 'Out of office' },
    auto_reply:    { color: '#64748B', bg: '#F1F5F9', label: 'Auto-reply'    },
    WRONG_CONTACT: { color: '#F59E0B', bg: '#FFFBEB', label: 'Wrong contact' },
    REPLIED:       { color: '#0284C7', bg: '#E0F2FE', label: 'Replied'       },
  };

  const STATUS_META = {
    // New automation statuses
    READY_FOR_OUTREACH:  { color: '#6366F1', label: 'Ready to send'    },
    LOCKED_FOR_OUTREACH: { color: '#7C3AED', label: 'Sending…'         },
    CONTACTED:           { color: '#0284C7', label: 'Contacted'        },
    FOLLOW_UP_1:         { color: '#0891B2', label: 'Follow-up 1'      },
    FOLLOW_UP_2:         { color: '#0369A1', label: 'Follow-up 2'      },
    FINAL_FOLLOW_UP:     { color: '#94A3B8', label: 'Final follow-up'  },
    REPLIED:             { color: '#059669', label: 'Replied'           },
    QUALIFIED:           { color: '#0D9488', label: 'Qualified ✓'      },
    NOT_INTERESTED:      { color: '#DC2626', label: 'Not interested'    },
    UNSUBSCRIBED:        { color: '#7C3AED', label: 'Unsubscribed'      },
    PAUSED:              { color: '#F59E0B', label: 'Paused'            },
    STOPPED:             { color: '#94A3B8', label: 'Stopped'           },
    DISQUALIFIED:        { color: '#DC2626', label: 'Disqualified'      },
    // Legacy statuses (v1 compat)
    queued:              { color: '#6366F1', label: 'Queued'            },
    sent:                { color: '#0284C7', label: 'Sent'              },
    replied:             { color: '#059669', label: 'Replied'           },
    opted_out:           { color: '#DC2626', label: 'Opted out'         },
    exhausted:           { color: '#94A3B8', label: 'Exhausted'         },
    converted:           { color: '#0D9488', label: 'Converted'         },
    follow_up_due:       { color: '#D97706', label: 'Follow-up due'     },
  };

  // ── RENDER ─────────────────────────────────────────────────
  async function render() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ll)">
      <div class="spinner" style="margin:0 auto 12px"></div>Loading Outreach Queue…</div>`;

    try {
      const [queueRes, statsRes, logRes, tmplRes, humanRes, autorunRes, perfRes] = await Promise.all([
        API.get('outreach.queue'),
        API.get('outreach.stats'),
        API.get('outreach.log'),
        API.get('outreach.templates'),
        API.get('outreach.human-queue').catch(() => ({ queue: [] })),
        API.get('outreach.autorun').catch(() => ({})),
        API.get('outreach.performance').catch(() => ({})),
      ]);
      _queue      = (queueRes  && queueRes.queue)       ? queueRes.queue      : [];
      _stats      = statsRes   || {};
      _log        = (logRes    && logRes.log)            ? logRes.log          : [];
      _templates  = (tmplRes   && tmplRes.templates)     ? tmplRes.templates   : [];
      _humanQueue = (humanRes  && humanRes.queue)        ? humanRes.queue      : [];
      _autorun    = autorunRes || {};
      _perf       = perfRes    || {};
    } catch(e) {
      mc.innerHTML = `<div style="padding:40px;color:#DC2626">Failed to load: ${_esc(e.message)}</div>`;
      return;
    }

    _draw();
  }

  function _draw() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = _renderAutopilot() + _renderHumanQueue() + _renderStats() + _renderToolbar() + _renderBody();
  }

  // ── AUTOPILOT STATUS BAR ──────────────────────────────────
  function _renderAutopilot() {
    const a   = _autorun || {};
    const s   = _stats   || {};
    const cap = a.dailyCap || 50;
    const rem = typeof a.capRemaining === 'number' ? a.capRemaining : (cap - (a.sentToday || 0));
    const sent= a.sentToday || s.sentToday || 0;
    const pct = Math.round((sent / cap) * 100);
    const capColor = rem < 10 ? '#DC2626' : rem < 20 ? '#D97706' : '#059669';

    return `
    <div style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);border-radius:14px;padding:16px 20px;margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div style="width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 0 3px rgba(34,197,94,.25);animation:pulse-dot 2s infinite"></div>
        <span style="color:#fff;font-weight:700;font-size:13.5px">Autopilot</span>
        <span style="color:#64748B;font-size:12px;margin-left:2px">Running</span>
      </div>

      <div style="display:flex;gap:24px;flex:1;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column;gap:2px">
          <span style="color:#94A3B8;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">Sends Today</span>
          <span style="color:#fff;font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;letter-spacing:-1px">${sent}<span style="font-size:12px;color:#64748B;font-weight:500;letter-spacing:0"> / ${cap}</span></span>
        </div>

        <div style="display:flex;flex-direction:column;gap:2px">
          <span style="color:#94A3B8;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">Cap Remaining</span>
          <span style="color:${capColor};font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;letter-spacing:-1px">${rem}</span>
        </div>

        <div style="display:flex;flex-direction:column;gap:2px;min-width:120px">
          <span style="color:#94A3B8;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">Daily Capacity</span>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
            <div style="flex:1;height:5px;background:#1E293B;border-radius:3px;overflow:hidden;border:1px solid #334155">
              <div style="height:100%;width:${pct}%;background:${pct>80?'#DC2626':pct>50?'#D97706':'#22C55E'};border-radius:3px;transition:width .4s ease"></div>
            </div>
            <span style="color:#64748B;font-size:11px">${pct}%</span>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:2px">
          <span style="color:#94A3B8;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">In Sequence</span>
          <span style="color:#fff;font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;letter-spacing:-1px">
            ${(s.contacted||0) + (s.followUp1||0) + (s.followUp2||0)}
          </span>
        </div>

        <div style="display:flex;flex-direction:column;gap:2px">
          <span style="color:#94A3B8;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px">Qualified</span>
          <span style="color:#0D9488;font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;letter-spacing:-1px">${s.qualified||0}</span>
        </div>
      </div>

      <div style="flex-shrink:0;display:flex;gap:8px;align-items:center">
        <div style="font-size:11px;color:#475569;text-align:right;line-height:1.5">
          Sends every 4h · Reply scan every 2h<br>
          <span style="color:#22C55E">●</span> Fully automated
        </div>
      </div>
    </div>`;
  }

  // ── HUMAN ACTION QUEUE ────────────────────────────────────
  function _renderHumanQueue() {
    if (!_humanQueue || !_humanQueue.length) return '';

    const ACTION_META = {
      interested_reply:   { icon: '🔥', color: '#059669', bg: '#ECFDF5', label: 'Hot Reply',       cta: 'Follow Up Now →' },
      wrong_contact:      { icon: '↪️', color: '#D97706', bg: '#FFFBEB', label: 'Wrong Contact',   cta: 'Find Contact' },
      unclassified_reply: { icon: '❓', color: '#6366F1', bg: '#EEF2FF', label: 'Review Reply',    cta: 'Review' },
      send_error:         { icon: '⚠️', color: '#DC2626', bg: '#FEF2F2', label: 'Send Error',      cta: 'Retry' },
      followup_error:     { icon: '⚠️', color: '#DC2626', bg: '#FEF2F2', label: 'Follow-up Error', cta: 'Retry' },
    };

    const hotCount = _humanQueue.filter(r =>
      (r.humanActionReason || '').includes('interested')
    ).length;

    return `
    <div style="background:#fff;border:1.5px solid #F59E0B;border-radius:14px;padding:16px 20px;margin-bottom:16px;box-shadow:0 2px 12px rgba(245,158,11,.12)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;background:#FEF3C7;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">🎯</div>
          <div>
            <div style="font-weight:700;color:#0F172A;font-size:14px">
              Needs Your Attention
              <span style="background:#F59E0B;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:8px">${_humanQueue.length}</span>
              ${hotCount ? `<span style="background:#059669;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:4px">${hotCount} hot 🔥</span>` : ''}
            </div>
            <div style="font-size:12px;color:#94A3B8;margin-top:1px">These leads need a human touch — everything else runs automatically</div>
          </div>
        </div>
      </div>

      <div style="display:grid;gap:10px">
        ${_humanQueue.slice(0, 10).map(r => {
          const reason = r.humanActionReason || 'review';
          const meta   = ACTION_META[reason] || ACTION_META.unclassified_reply;
          const intM   = INTENT_META[r.replyStatus] || null;
          return `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:${meta.bg};border-radius:10px;border:1px solid ${meta.color}30">
            <div style="font-size:18px;flex-shrink:0">${meta.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;color:#0F172A;font-size:13px">${_esc(r.companyName)}</div>
              <div style="font-size:11.5px;color:#64748B;margin-top:1px">${_esc(r.contactName)} · ${_esc(r.email)}</div>
              ${r.replySummary ? `<div style="margin-top:5px;font-size:12px;color:#374151;font-style:italic">"${_esc(r.replySummary.substring(0,100))}"</div>` : ''}
              ${r.replyNextAction ? `<div style="margin-top:4px;font-size:11.5px;color:${meta.color};font-weight:600">→ ${_esc(r.replyNextAction)}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;gap:6px;align-items:flex-end">
              <span style="background:${meta.color};color:#fff;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px">${meta.label}</span>
              ${intM ? `<span style="background:${intM.bg};color:${intM.color};font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:4px">${intM.label}</span>` : ''}
              <div style="display:flex;gap:6px;margin-top:2px">
                ${(reason === 'interested_reply' || reason === 'unclassified_reply') ? `
                <button onclick="Outreach._convertToCRM('${_esc(r.id)}')"
                  style="background:#0D9488;color:#fff;border:none;border-radius:7px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer">
                  ${meta.cta}
                </button>` : ''}
                <button onclick="Outreach._resolveAction('${_esc(r.id)}')"
                  style="background:#fff;color:#94A3B8;border:1px solid #E5E7EB;border-radius:7px;padding:5px 10px;font-size:11px;cursor:pointer"
                  title="Mark as resolved">
                  ✓ Done
                </button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
      ${_humanQueue.length > 10 ? `<div style="text-align:center;margin-top:10px;font-size:12px;color:#94A3B8">+${_humanQueue.length-10} more — switch to <button onclick="Outreach._setView('human')" style="background:none;border:none;color:#6366F1;font-weight:600;cursor:pointer;font-size:12px">Human Queue view</button></div>` : ''}
    </div>`;
  }

  // ── STATS BAR ─────────────────────────────────────────────
  function _renderStats() {
    const s = _stats || {};
    const totalActive = (s.readyForOutreach||0) + (s.contacted||0) + (s.followUp1||0) + (s.followUp2||0);
    const cards = [
      { label: 'Ready to Send',  val: s.readyForOutreach || s.queued || 0, sub: 'awaiting auto-send', color: '#6366F1' },
      { label: 'In Sequence',    val: totalActive,                           sub: 'contacted + follow-ups', color: '#0284C7' },
      { label: 'Qualified',      val: s.qualified      || 0, sub: 'hot leads',          color: '#0D9488' },
      { label: 'Replied',        val: (s.replied||0) + (s.qualified||0), sub: 'responded', color: '#059669' },
      { label: 'Reply Rate',     val: (s.replyRatePct || 0) + '%', sub: 'of contacted', color: '#D97706' },
      { label: 'Needs Action',   val: s.needsHumanAction || _humanQueue.length || 0, sub: 'human required', color: '#F59E0B' },
    ];
    return `
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px">
      ${cards.map(k => `
        <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:all .18s ease"
             onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.08)'"
             onmouseleave="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:5px">${k.label}</div>
          <div style="font-family:'Outfit',sans-serif;font-size:24px;font-weight:800;letter-spacing:-1px;color:${k.color};line-height:1">${k.val}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:3px">${k.sub}</div>
        </div>`).join('')}
    </div>`;
  }

  // ── TOOLBAR ────────────────────────────────────────────────
  function _renderToolbar() {
    return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <div style="display:flex;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:9px;padding:3px;gap:2px">
        ${[
          ['queue',   'Queue'],
          ['sent',    'Sent'],
          ['replies', 'Replies'],
          ['human',   '🎯 Action' + (_humanQueue.length ? ` (${_humanQueue.length})` : '')],
          ['perf',    '📊 Performance'],
        ].map(([v,l]) => `
          <button onclick="Outreach._setView('${v}')"
            style="font-size:12.5px;font-weight:600;padding:6px 14px;border-radius:7px;cursor:pointer;border:none;transition:all .15s ease;
                   background:${_view===v?'#fff':'transparent'};color:${_view===v?(v==='human'?'#F59E0B':v==='perf'?'#0D9488':'#6366F1'):'#64748B'};
                   box-shadow:${_view===v?'0 1px 4px rgba(0,0,0,.08)':'none'}">${l}</button>`).join('')}
      </div>
      <div style="position:relative;flex:1;min-width:180px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#94A3B8;font-size:13px">⌕</span>
        <input class="fsearch" placeholder="Search company, contact, email…" value="${_esc(_q)}"
          oninput="Outreach._search(this.value)"
          style="width:100%;padding-left:30px;background:#fff;border:1px solid #E2E8F0;border-radius:9px;font-size:13px">
      </div>
      <button onclick="Outreach.openAddLead()"
        style="background:#fff;color:#6366F1;border:1.5px solid #6366F1;border-radius:9px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;
               display:flex;align-items:center;gap:6px;transition:all .15s"
        onmouseenter="this.style.background='#EEF2FF'"
        onmouseleave="this.style.background='#fff'">
        + Add Lead
      </button>
      <button onclick="Outreach.sendBatch()"
        style="background:#6366F1;color:#fff;border:none;border-radius:9px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;
               display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(99,102,241,.3);transition:all .15s"
        onmouseenter="this.style.transform='translateY(-1px)'"
        onmouseleave="this.style.transform=''">
        ⚡ Send All Queued
      </button>
    </div>`;
  }

  // ── BODY ───────────────────────────────────────────────────
  function _renderBody() {
    if (_view === 'queue')   return _renderQueue();
    if (_view === 'sent')    return _renderSent();
    if (_view === 'replies') return _renderReplies();
    if (_view === 'human')   return _renderFullHumanQueue();
    if (_view === 'perf')    return _renderPerf();
    return '';
  }

  // ── QUEUE VIEW ─────────────────────────────────────────────
  function _renderQueue() {
    let rows = _queue;
    if (_q) rows = rows.filter(r =>
      [r.companyName, r.contactName, r.email, r.segment, r.serviceType]
        .join(' ').toLowerCase().includes(_q.toLowerCase())
    );

    if (!rows.length) {
      return `<div style="text-align:center;padding:80px 20px;color:#94A3B8">
        <div style="font-size:40px;margin-bottom:12px">📭</div>
        <div style="font-size:15px;font-weight:600;color:#64748B">Queue is empty</div>
        <div style="font-size:13px;margin-top:6px;margin-bottom:20px">Leads flow in automatically from Lead Intelligence — or add manually</div>
        <button onclick="Outreach.openAddLead()"
          style="background:#6366F1;color:#fff;border:none;border-radius:9px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(99,102,241,.3)">
          + Add Lead Manually
        </button>
      </div>`;
    }

    return `
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.05)">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#F8FAFC;border-bottom:1px solid #E5E7EB">
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Company / Contact</th>
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Service</th>
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Score</th>
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Template</th>
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Sequence</th>
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Added</th>
            <th style="padding:11px 16px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
          <tr style="border-bottom:1px solid #F1F5F9;transition:background .12s" onmouseenter="this.style.background='#FAFAFA'" onmouseleave="this.style.background=''">
            <td style="padding:12px 16px">
              <div style="font-weight:600;color:#0F172A">${_esc(r.companyName)}</div>
              <div style="font-size:12px;color:#64748B;margin-top:2px">${_esc(r.contactName)} · ${_esc(r.email)}</div>
            </td>
            <td style="padding:12px 16px">
              <div style="font-size:12px;color:#475569">${_esc(r.serviceType || '—')}</div>
              ${r.segment ? `<div style="display:inline-block;font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:4px;background:#F1F5F9;color:#64748B;margin-top:3px">${_esc(r.segment)}</div>` : ''}
            </td>
            <td style="padding:12px 16px">
              <span style="font-family:'Outfit',sans-serif;font-size:18px;font-weight:800;color:${SCORE_COLOR(r.leadScore)}">
                ${r.leadScore || '—'}
              </span>
            </td>
            <td style="padding:12px 16px;font-size:12px;color:#64748B">
              ${_templateLabel(r.outreachTemplate)}
            </td>
            <td style="padding:12px 16px">
              <button onclick="Outreach.openSequenceModal('${_esc(r.id)}')"
                title="View & edit email sequence"
                style="background:#F0FDFA;color:#0D9488;border:1px solid #99F6E4;border-radius:6px;padding:4px 10px;font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap">
                ⚡ 4-step
              </button>
            </td>
            <td style="padding:12px 16px;font-size:12px;color:#94A3B8">
              ${_timeAgo(r.createdAt)}
            </td>
            <td style="padding:12px 16px;text-align:center">
              <div style="display:flex;gap:6px;justify-content:center">
                <button onclick="Outreach.openSendModal('${_esc(r.id)}')"
                  style="background:#6366F1;color:#fff;border:none;border-radius:7px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:all .12s"
                  onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">
                  Send →
                </button>
                <button onclick="Outreach._markOptOut('${_esc(r.id)}')"
                  title="Mark as opted out"
                  style="background:#F1F5F9;color:#94A3B8;border:1px solid #E5E7EB;border-radius:7px;padding:6px 10px;font-size:11px;cursor:pointer">
                  ✕
                </button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="font-size:12px;color:#94A3B8;margin-top:10px;padding:0 4px">${rows.length} lead${rows.length===1?'':'s'} in queue</div>`;
  }

  function _templateLabel(key) {
    const tmpl = _templates.find(t => t.key === key);
    return tmpl ? `<span style="background:#EEF2FF;color:#6366F1;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:4px">${_esc(tmpl.label)}</span>` : _esc(key || '—');
  }

  // ── SENT VIEW ─────────────────────────────────────────────
  function _renderSent() {
    const sent = _log.filter(r => !_q ||
      [r.companyName, r.contactName, r.email].join(' ').toLowerCase().includes(_q.toLowerCase())
    );

    if (!sent.length) {
      return `<div style="text-align:center;padding:80px 20px;color:#94A3B8">
        <div style="font-size:40px;margin-bottom:12px">📤</div>
        <div style="font-size:15px;font-weight:600;color:#64748B">No emails sent yet</div>
      </div>`;
    }

    return `
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.05)">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#F8FAFC;border-bottom:1px solid #E5E7EB">
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Company / Contact</th>
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Template</th>
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Sent</th>
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Follow-up #</th>
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8">Reply</th>
          </tr>
        </thead>
        <tbody>
          ${sent.slice(0, 100).map(r => {
            const intentM = INTENT_META[r.replyStatus] || null;
            return `
            <tr style="border-bottom:1px solid #F1F5F9;transition:background .12s" onmouseenter="this.style.background='#FAFAFA'" onmouseleave="this.style.background=''">
              <td style="padding:12px 16px">
                <div style="font-weight:600;color:#0F172A">${_esc(r.companyName)}</div>
                <div style="font-size:12px;color:#64748B;margin-top:2px">${_esc(r.contactName)} · ${_esc(r.email)}</div>
              </td>
              <td style="padding:12px 16px">${_templateLabel(r.templateUsed)}</td>
              <td style="padding:12px 16px;font-size:12px;color:#64748B">${_timeAgo(r.sentAt)}</td>
              <td style="padding:12px 16px;font-size:12px;color:#64748B;text-align:center">${r.followUpN || '0'}</td>
              <td style="padding:12px 16px">
                ${intentM
                  ? `<span style="background:${intentM.bg};color:${intentM.color};font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px">${intentM.label}</span>`
                  : '<span style="color:#94A3B8;font-size:12px">—</span>'}
                ${r.replySummary ? `<div style="font-size:11px;color:#64748B;margin-top:3px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(r.replySummary)}">${_esc(r.replySummary)}</div>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── REPLIES VIEW ───────────────────────────────────────────
  function _renderReplies() {
    const replied = (_queue.concat ? _queue : [])
      .concat(_log || [])
      .filter(r => r.replyStatus && r.replyStatus !== '');

    // Deduplicate by leadId
    const seen = new Set();
    const unique = replied.filter(r => {
      const k = r.leadId || r.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (!unique.length) {
      return `<div style="text-align:center;padding:80px 20px;color:#94A3B8">
        <div style="font-size:40px;margin-bottom:12px">💬</div>
        <div style="font-size:15px;font-weight:600;color:#64748B">No replies detected yet</div>
        <div style="font-size:13px;margin-top:6px">Reply detection runs every 2 hours via GAS trigger</div>
      </div>`;
    }

    return `
    <div style="display:grid;gap:12px">
      ${unique.map(r => {
        const m = INTENT_META[r.replyStatus] || INTENT_META.positive;
        return `
        <div style="background:#fff;border:1px solid ${m.color}40;border-radius:12px;padding:16px 20px;box-shadow:0 1px 4px rgba(0,0,0,.04)">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div style="flex:1">
              <div style="font-weight:700;color:#0F172A;font-size:14px">${_esc(r.companyName || r.company)}</div>
              <div style="font-size:12px;color:#64748B;margin-top:2px">${_esc(r.contactName)} · ${_esc(r.email)}</div>
              ${r.replySummary ? `<div style="margin-top:8px;font-size:13px;color:#374151;line-height:1.5;padding:8px 12px;background:#F8FAFC;border-radius:8px;border-left:3px solid ${m.color}">${_esc(r.replySummary)}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0">
              <span style="background:${m.bg};color:${m.color};font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:6px;display:block;margin-bottom:6px">${m.label}</span>
              <div style="font-size:11px;color:#94A3B8">${_timeAgo(r.replyAt || r.sentAt)}</div>
            </div>
          </div>
          ${r.replyStatus === 'positive' || r.replyStatus === 'info_request' ? `
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid #F1F5F9;display:flex;gap:8px">
            <button onclick="Outreach._convertToCRM('${_esc(r.leadId||r.id)}')"
              style="background:#0D9488;color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:12.5px;font-weight:600;cursor:pointer">
              Move to CRM Pipeline →
            </button>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── ADD LEAD MODAL ─────────────────────────────────────────
  function openAddLead() {
    const segments    = ['Office','Healthcare','School','Gym','Industrial','Residential','Automotive'];
    const templateOpts = _templates.map(t =>
      `<option value="${_esc(t.key)}">${_esc(t.label)}</option>`
    ).join('');

    UI.openModal(`
      <div style="padding:24px 28px;min-width:460px">
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0F172A">Add Outbound Lead</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#64748B">Lead will be added to the outreach queue ready to send</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
          <div>
            <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:5px">COMPANY NAME *</label>
            <input id="al-company" type="text" placeholder="e.g. Acme Ltd"
              style="width:100%;padding:9px 11px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:5px">CONTACT NAME *</label>
            <input id="al-contact" type="text" placeholder="e.g. Sarah Collins"
              style="width:100%;padding:9px 11px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:5px">EMAIL ADDRESS *</label>
            <input id="al-email" type="email" placeholder="e.g. sarah@acme.com"
              style="width:100%;padding:9px 11px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:5px">PHONE</label>
            <input id="al-phone" type="text" placeholder="e.g. 07700 900000"
              style="width:100%;padding:9px 11px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:5px">SERVICE TYPE</label>
            <input id="al-service" type="text" placeholder="e.g. Office cleaning"
              style="width:100%;padding:9px 11px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:5px">SEGMENT</label>
            <select id="al-segment" style="width:100%;padding:9px 11px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;background:#fff;box-sizing:border-box">
              <option value="">— select —</option>
              ${segments.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:5px">LEAD SCORE (1–10)</label>
            <input id="al-score" type="number" min="1" max="10" placeholder="e.g. 7"
              style="width:100%;padding:9px 11px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:5px">OUTREACH TEMPLATE</label>
            <select id="al-template" style="width:100%;padding:9px 11px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;background:#fff;box-sizing:border-box">
              ${templateOpts}
            </select>
          </div>
        </div>

        <div id="al-err" style="display:none;padding:8px 12px;background:#FEF2F2;color:#DC2626;border-radius:7px;font-size:12.5px;margin-bottom:14px"></div>

        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button onclick="UI.closeModal()" style="background:#F1F5F9;color:#475569;border:1px solid #E2E8F0;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer">Cancel</button>
          <button id="al-submit" onclick="Outreach._doAddLead()"
            style="background:#6366F1;color:#fff;border:none;border-radius:9px;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(99,102,241,.3)">
            Add to Queue →
          </button>
        </div>
      </div>
    `);

    // Focus first field
    setTimeout(() => { const el = document.getElementById('al-company'); if (el) el.focus(); }, 80);
  }

  async function _doAddLead() {
    const btn     = document.getElementById('al-submit');
    const errEl   = document.getElementById('al-err');
    const company = (document.getElementById('al-company')  || {}).value || '';
    const contact = (document.getElementById('al-contact')  || {}).value || '';
    const email   = (document.getElementById('al-email')    || {}).value || '';
    const phone   = (document.getElementById('al-phone')    || {}).value || '';
    const service = (document.getElementById('al-service')  || {}).value || '';
    const segment = (document.getElementById('al-segment')  || {}).value || '';
    const score   = (document.getElementById('al-score')    || {}).value || '';
    const template= (document.getElementById('al-template') || {}).value || '';

    // Validate
    if (!company.trim()) { _alErr('Company name is required'); return; }
    if (!contact.trim()) { _alErr('Contact name is required'); return; }
    if (!email.trim() || !email.includes('@')) { _alErr('Valid email address is required'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    if (errEl) errEl.style.display = 'none';

    try {
      const result = await API.post('outreach.handoff', {
        companyName:      company.trim(),
        contactName:      contact.trim(),
        email:            email.trim().toLowerCase(),
        phone:            phone.trim(),
        serviceType:      service.trim(),
        segment:          segment,
        leadScore:        score,
        outreachTemplate: template,
      });

      if (result.error) throw new Error(result.error);

      UI.closeModal();

      if (result.duplicate) {
        UI.toast('Lead already exists in CRM — score updated if improved', 'w');
      } else {
        UI.toast('✓ ' + company.trim() + ' added to outreach queue', 's');
        // Reload queue
        await render();
      }
    } catch(e) {
      _alErr(e.message || 'Failed to add lead');
      if (btn) { btn.disabled = false; btn.textContent = 'Add to Queue →'; }
    }
  }

  function _alErr(msg) {
    const el = document.getElementById('al-err');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  // ── SEND MODAL ─────────────────────────────────────────────
  // ── CLIENT-SIDE EMAIL QUALITY SCORER ────────────────────────
  // Mirror of GAS _scoreEmail() — runs instantly, no API call.
  function _scoreEmailLocal(subject, body, lead) {
    const subj = (subject || '').trim();
    const txt  = (body    || '').trim();
    const comp = ((lead.companyName || '')).toLowerCase();
    const svc  = ((lead.serviceType || '')).toLowerCase();

    // Subject score
    let ss = 5;
    const sw = subj.split(/\s+/).filter(Boolean).length;
    if (sw >= 5 && sw <= 12) ss += 1; else if (sw < 3 || sw > 16) ss -= 1;
    if (comp && subj.toLowerCase().includes(comp.split(' ')[0])) ss += 2;
    else if (comp) ss -= 0.5;
    if (svc && subj.toLowerCase().includes(svc.split(' ')[0])) ss += 0.5;
    if (/free|guarantee|urgent|act now/i.test(subj)) ss -= 2;
    if (/[A-Z]{4,}/.test(subj)) ss -= 1;
    if (/\d/.test(subj)) ss += 0.5;
    if (/\?$/.test(subj)) ss += 0.5;
    if (subj.length > 80) ss -= 1;
    const subjectScore = Math.min(10, Math.max(1, Math.round(ss)));

    // Body score
    let bs = 5;
    const bw = txt.split(/\s+/).filter(Boolean).length;
    if (bw >= 80 && bw <= 200) bs += 1.5;
    else if (bw < 40) bs -= 1.5;
    else if (bw > 280) bs -= 1;
    if (comp && txt.toLowerCase().includes(comp.split(' ')[0])) bs += 2;
    if (svc  && txt.toLowerCase().includes(svc.split(' ')[0]))  bs += 0.5;
    if (/^hi\s+[A-Z]/m.test(txt) || /^dear\s+[A-Z]/m.test(txt)) bs += 1;
    if (/\?/.test(txt.slice(-300))) bs += 1;
    const pc = txt.split(/\n\n/).filter(Boolean).length;
    if (pc >= 2 && pc <= 4) bs += 0.5;
    if (/insur|dbs|coshh|iso|compli/i.test(txt)) bs += 0.5;
    const bodyScore = Math.min(10, Math.max(1, Math.round(bs)));

    const lsN = Math.min(100, Number(lead.leadScore || 50)) / 100;
    const replyLikelihood = Math.min(48, Math.round(8 + (lsN * 15) + (subjectScore / 10 * 8) + (bodyScore / 10 * 9)));

    const tips = [];
    if (!comp || !subj.toLowerCase().includes(comp.split(' ')[0]))
      tips.push('Add company name to subject');
    if (sw < 5) tips.push('Subject too short — aim for 6-10 words');
    if (sw > 13) tips.push('Subject too long — cut to under 12 words');
    if (bw > 220) tips.push('Body too long — shorter emails get more replies');
    if (bw < 50)  tips.push('Body too brief — add a value prop paragraph');
    if (!/\?/.test(txt.slice(-300))) tips.push('End with a question to prompt a reply');
    if (!/^hi\s+[A-Z]/im.test(txt))  tips.push('Personalise greeting with contact name');

    return { subjectScore, bodyScore, replyLikelihood, tips };
  }

  function _scoreGauge(score) {
    const c = score >= 8 ? '#059669' : score >= 6 ? '#D97706' : '#DC2626';
    const bg = score >= 8 ? '#ECFDF5' : score >= 6 ? '#FFFBEB' : '#FEF2F2';
    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;font-weight:800;font-size:15px;font-family:'Outfit',sans-serif;background:${bg};color:${c}">${score}</span>`;
  }

  function _renderQualityPanel(sc) {
    const likC = sc.replyLikelihood >= 25 ? '#059669' : sc.replyLikelihood >= 15 ? '#D97706' : '#DC2626';
    const tips = (sc.tips || []).slice(0, 3);
    return `
    <div id="quality-panel" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:11.5px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.6px">Email Quality</span>
        <button onclick="Outreach._openAssistFromModal()" title="AI rewrite & subject suggestions"
          style="background:#6366F1;color:#fff;border:none;border-radius:7px;padding:5px 12px;font-size:11.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px">
          ✨ AI Assist
        </button>
      </div>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:${tips.length ? '10px' : '0'}">
        <div style="text-align:center">
          ${_scoreGauge(sc.subjectScore)}
          <div style="font-size:10px;color:#94A3B8;margin-top:3px">Subject</div>
        </div>
        <div style="text-align:center">
          ${_scoreGauge(sc.bodyScore)}
          <div style="font-size:10px;color:#94A3B8;margin-top:3px">Body</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px;background:#fff;border-radius:8px;border:1px solid #E5E7EB">
          <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:${likC};letter-spacing:-1px;line-height:1">${sc.replyLikelihood}%</div>
          <div style="font-size:10.5px;color:#94A3B8;margin-top:2px">Est. reply rate</div>
        </div>
      </div>
      ${tips.length ? `<div style="display:flex;flex-direction:column;gap:4px">
        ${tips.map(t => `<div style="display:flex;align-items:flex-start;gap:6px;font-size:11.5px;color:#92400E;background:#FFFBEB;padding:5px 8px;border-radius:6px">
          <span style="flex-shrink:0;margin-top:1px">⚠</span><span>${_esc(t)}</span>
        </div>`).join('')}
      </div>` : `<div style="font-size:12px;color:#059669;font-weight:600">✓ Email quality looks good</div>`}
    </div>`;
  }

  function openSendModal(leadId) {
    const lead = _queue.find(r => r.id === leadId);
    if (!lead) return;

    const currentTmpl = _templates.find(t => t.key === lead.outreachTemplate) || _templates[0] || {};
    const previewSubj = lead.outreachEmailBody
      ? (lead.outreachEmailBody.match(/^SUBJECT:\s*(.+?)(?:\r?\n)/i) || [])[1] || _mergePreview(currentTmpl.subject || '', lead)
      : _mergePreview(currentTmpl.subject || '', lead);
    const previewBody = lead.outreachEmailBody
      ? lead.outreachEmailBody.replace(/^SUBJECT:[^\r\n]*[\r\n]+/i, '').replace(/^[\r\n]+/, '').replace(/\n{1,3}(Best regards?|Kind regards?|Regards|Best)[,\s][\s\S]*$/i, '').trim()
      : _mergePreview(currentTmpl.body || '', lead);

    // Score inline (instant, no API)
    const scoreData = _scoreEmailLocal(previewSubj, previewBody, lead);

    // Store for AI assist button
    window._outreachModalCtx = { leadId, lead, previewSubj, previewBody };

    UI.openModal(`
      <div style="padding:24px 28px;min-width:540px;max-width:640px">
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0F172A">Send Outreach Email</h2>
        <p style="margin:0 0 16px;font-size:13px;color:#64748B">${_esc(lead.companyName)} · ${_esc(lead.contactName)} · ${_esc(lead.email)}</p>

        ${_renderQualityPanel(scoreData)}

        <div style="margin-bottom:14px">
          <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px">TEMPLATE</label>
          <select id="tmpl-select" onchange="Outreach._previewTemplate(this.value, '${leadId}')"
            style="width:100%;padding:9px 12px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;background:#fff;cursor:pointer">
            ${_templates.map(t => `<option value="${_esc(t.key)}" ${t.key === lead.outreachTemplate ? 'selected' : ''}>${_esc(t.label)}</option>`).join('')}
          </select>
        </div>

        <div style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px">SUBJECT</label>
          <div id="tmpl-subject" style="padding:9px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;color:#374151">
            ${_esc(previewSubj)}
          </div>
        </div>

        <div style="margin-bottom:20px">
          <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px">BODY PREVIEW</label>
          <div id="tmpl-body" style="padding:12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:12.5px;color:#374151;line-height:1.7;white-space:pre-wrap;max-height:200px;overflow-y:auto">
            ${_esc(previewBody)}
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button onclick="UI.closeModal()" style="background:#F1F5F9;color:#475569;border:1px solid #E2E8F0;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer">Cancel</button>
          <button id="confirm-send-btn" onclick="Outreach._doSend('${leadId}')"
            style="background:#6366F1;color:#fff;border:none;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(99,102,241,.3)">
            Send Email →
          </button>
        </div>
      </div>
    `);
  }

  // Called when "AI Assist" button clicked from send modal
  function _openAssistFromModal() {
    const ctx = window._outreachModalCtx || {};
    if (!ctx.leadId) return;
    openAssistModal(ctx.leadId, ctx.lead, ctx.previewSubj, ctx.previewBody);
  }

  function _mergePreview(str, lead) {
    return (str || '')
      .replace(/\{\{companyName\}\}/g,  lead.companyName  || 'Company')
      .replace(/\{\{contactName\}\}/g,  lead.contactName  || 'there')
      .replace(/\{\{serviceType\}\}/g,  lead.serviceType  || 'cleaning');
  }

  function _previewTemplate(key, leadId) {
    const lead = _queue.find(r => r.id === leadId);
    const tmpl = _templates.find(t => t.key === key);
    if (!lead || !tmpl) return;
    const subEl  = document.getElementById('tmpl-subject');
    const bodyEl = document.getElementById('tmpl-body');
    if (subEl)  subEl.textContent  = _mergePreview(tmpl.subject, lead);
    if (bodyEl) bodyEl.textContent = _mergePreview(tmpl.body, lead);
  }

  async function _doSend(leadId) {
    if (_sending.has(leadId)) return;
    _sending.add(leadId);

    const btn = document.getElementById('confirm-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    const selectEl  = document.getElementById('tmpl-select');
    const template  = selectEl ? selectEl.value : null;

    try {
      const result = await API.post('outreach.send', { leadId, template });
      if (result.error) throw new Error(result.error);

      UI.closeModal();
      UI.toast('✓ Email sent to ' + (result.sentTo || leadId), 's');

      // Remove from queue, refresh stats
      _queue = _queue.filter(r => r.id !== leadId);
      _stats.queued  = Math.max(0, (_stats.queued  || 1) - 1);
      _stats.sent    = (_stats.sent    || 0) + 1;
      _stats.sentToday = (_stats.sentToday || 0) + 1;
      _draw();
    } catch(e) {
      UI.toast('Send failed: ' + e.message, 'a');
      if (btn) { btn.disabled = false; btn.textContent = 'Send Email →'; }
    } finally {
      _sending.delete(leadId);
    }
  }

  // ── BATCH SEND ─────────────────────────────────────────────
  async function sendBatch() {
    const toSend = _queue.filter(r => !_sending.has(r.id));
    if (!toSend.length) { UI.toast('Queue is empty', 'w'); return; }

    UI.openModal(`
      <div style="padding:24px 28px">
        <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0F172A">Send All Queued</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#64748B">
          This will send ${toSend.length} outreach email${toSend.length>1?'s':''} using each lead's assigned template.<br>
          <strong>This cannot be undone.</strong>
        </p>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button onclick="UI.closeModal()" style="background:#F1F5F9;color:#475569;border:1px solid #E2E8F0;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer">Cancel</button>
          <button id="batch-send-btn" onclick="Outreach._doBatch()"
            style="background:#6366F1;color:#fff;border:none;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">
            ⚡ Send ${toSend.length} emails
          </button>
        </div>
      </div>
    `);
  }

  async function _doBatch() {
    const btn = document.getElementById('batch-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    UI.closeModal();
    UI.toast('Sending batch — this may take a minute…', 'i', 8000);

    let sent = 0, failed = 0;
    for (const lead of _queue.slice()) {
      if (_sending.has(lead.id)) continue;
      _sending.add(lead.id);
      try {
        const r = await API.post('outreach.send', { leadId: lead.id });
        if (r.error) { failed++; } else {
          sent++;
          _queue = _queue.filter(q => q.id !== lead.id);
        }
      } catch(e) { failed++; }
      _sending.delete(lead.id);
    }

    UI.toast(`Batch complete: ${sent} sent, ${failed} failed`, sent > 0 ? 's' : 'a');
    await render();
  }

  // ── FULL HUMAN ACTION QUEUE VIEW ─────────────────────────
  function _renderFullHumanQueue() {
    if (!_humanQueue.length) {
      return `<div style="text-align:center;padding:80px 20px;color:#94A3B8">
        <div style="font-size:40px;margin-bottom:12px">✅</div>
        <div style="font-size:15px;font-weight:600;color:#64748B">All clear — no action needed</div>
        <div style="font-size:13px;margin-top:6px">The automation is handling everything. You'll be notified when a lead needs your attention.</div>
      </div>`;
    }

    const ACTION_META = {
      interested_reply:   { icon: '🔥', color: '#059669', bg: '#ECFDF5', label: 'Hot Reply',       priority: 1 },
      wrong_contact:      { icon: '↪️', color: '#D97706', bg: '#FFFBEB', label: 'Wrong Contact',   priority: 2 },
      unclassified_reply: { icon: '❓', color: '#6366F1', bg: '#EEF2FF', label: 'Needs Review',    priority: 3 },
      send_error:         { icon: '⚠️', color: '#DC2626', bg: '#FEF2F2', label: 'Send Error',      priority: 4 },
      followup_error:     { icon: '⚠️', color: '#DC2626', bg: '#FEF2F2', label: 'Follow-up Error', priority: 4 },
    };

    return `
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.05)">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#FFFBEB;border-bottom:2px solid #FDE68A">
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#92400E">Priority / Company</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#92400E">Reply</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#92400E">Next Action</th>
            <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#92400E">Last Contact</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#92400E">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${_humanQueue.map(r => {
            const reason = r.humanActionReason || 'unclassified_reply';
            const meta   = ACTION_META[reason] || ACTION_META.unclassified_reply;
            const intM   = INTENT_META[r.replyStatus] || null;
            return `
            <tr style="border-bottom:1px solid #FEF3C7;transition:background .12s" onmouseenter="this.style.background='#FFFBEB'" onmouseleave="this.style.background=''">
              <td style="padding:12px 16px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:16px">${meta.icon}</span>
                  <div>
                    <div style="font-weight:600;color:#0F172A">${_esc(r.companyName)}</div>
                    <div style="font-size:12px;color:#64748B">${_esc(r.contactName)} · ${_esc(r.email)}</div>
                  </div>
                </div>
              </td>
              <td style="padding:12px 16px">
                ${intM ? `<span style="background:${intM.bg};color:${intM.color};font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px">${intM.label}</span>` : '<span style="color:#94A3B8">—</span>'}
                ${r.replySummary ? `<div style="font-size:11.5px;color:#64748B;margin-top:4px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(r.replySummary)}">"${_esc(r.replySummary.substring(0,80))}"</div>` : ''}
              </td>
              <td style="padding:12px 16px">
                ${r.replyNextAction
                  ? `<div style="font-size:12.5px;color:${meta.color};font-weight:600">${_esc(r.replyNextAction)}</div>`
                  : `<span style="background:${meta.bg};color:${meta.color};font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px">${meta.label}</span>`}
              </td>
              <td style="padding:12px 16px;font-size:12px;color:#94A3B8">${_timeAgo(r.lastContactedAt)}</td>
              <td style="padding:12px 16px;text-align:center">
                <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
                  ${reason === 'interested_reply' ? `
                  <button onclick="Outreach._convertToCRM('${_esc(r.id)}')"
                    style="background:#0D9488;color:#fff;border:none;border-radius:7px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer">
                    Qualify →
                  </button>` : ''}
                  <button onclick="Outreach._resolveAction('${_esc(r.id)}')"
                    style="background:#F1F5F9;color:#475569;border:1px solid #E5E7EB;border-radius:7px;padding:5px 10px;font-size:11px;cursor:pointer">
                    ✓ Done
                  </button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="font-size:12px;color:#94A3B8;margin-top:10px;padding:0 4px">${_humanQueue.length} item${_humanQueue.length===1?'':'s'} need attention</div>`;
  }

  // ── MARK OPT OUT ───────────────────────────────────────────
  async function _markOptOut(leadId) {
    if (!confirm('Mark this lead as opted out? They won\'t be contacted again.')) return;
    try {
      await API.post('outreach.status', { leadId, status: 'UNSUBSCRIBED' });
      _queue = _queue.filter(r => r.id !== leadId);
      UI.toast('Lead marked as unsubscribed', 'w');
      _draw();
    } catch(e) { UI.toast('Error: ' + e.message, 'a'); }
  }

  // ── RESOLVE HUMAN ACTION ───────────────────────────────────
  async function _resolveAction(leadId) {
    try {
      await API.post('outreach.resolve-action', { leadId });
      _humanQueue = _humanQueue.filter(r => r.id !== leadId);
      if (_stats) _stats.needsHumanAction = Math.max(0, (_stats.needsHumanAction || 1) - 1);
      UI.toast('✓ Resolved — lead returned to automation', 's');
      _draw();
    } catch(e) { UI.toast('Error: ' + e.message, 'a'); }
  }

  // ── CONVERT TO CRM PIPELINE ────────────────────────────────
  async function _convertToCRM(leadId) {
    try {
      // Mark as QUALIFIED in outreach, clear human action flag
      await API.post('outreach.status', { leadId, status: 'QUALIFIED' });
      await API.post('outreach.resolve-action', { leadId, outreachStatus: 'QUALIFIED', leadStatus: 'Qualified' });
      // Update CRM stage
      await API.post('lead.stage', { id: leadId, status: 'Qualified' }).catch(() => {});
      // Remove from human queue
      _humanQueue = _humanQueue.filter(r => r.id !== leadId);
      UI.toast('🔥 Lead qualified — moved to CRM pipeline', 's');
      setTimeout(() => Router.navigate('crm'), 1000);
    } catch(e) { UI.toast('Error: ' + e.message, 'a'); }
  }

  // ── PART 2: SEQUENCE TIMELINE MODAL ─────────────────────────
  async function openSequenceModal(leadId) {
    const lead = _queue.find(r => r.id === leadId) || _log.find(r => r.id === leadId);
    if (!lead) return;

    UI.openModal(`<div style="padding:24px 28px;min-width:500px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0F172A">Email Sequence</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#64748B">${_esc(lead.companyName || lead.company)}</p>
      <div id="seq-loading" style="text-align:center;padding:40px;color:#94A3B8">
        <div class="spinner" style="margin:0 auto 10px"></div>Loading sequence…
      </div>
    </div>`);

    try {
      const res = await API.get('outreach.sequence', { id: leadId });
      if (res.error) throw new Error(res.error);

      const seq     = res.sequence || [];
      const timings = res.timings  || [3, 7, 14];

      const STEP_ICONS  = { initial: '📧', followup1: '📩', followup2: '📬', final: '📮' };
      const STATUS_META_SEQ = {
        sent:      { color: '#059669', bg: '#ECFDF5', label: '✓ Sent' },
        scheduled: { color: '#0284C7', bg: '#EFF6FF', label: '⏱ Scheduled' },
        pending:   { color: '#94A3B8', bg: '#F8FAFC', label: '○ Pending'   },
      };

      const seqHtml = seq.map((step, i) => {
        const sm = STATUS_META_SEQ[step.status] || STATUS_META_SEQ.pending;
        return `
        <div style="display:flex;gap:14px;margin-bottom:${i < seq.length-1 ? '0' : '0'}">
          <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
            <div style="width:36px;height:36px;border-radius:50%;background:${sm.bg};border:2px solid ${sm.color}30;
                        display:flex;align-items:center;justify-content:center;font-size:16px">${STEP_ICONS[step.phase] || '📧'}</div>
            ${i < seq.length-1 ? `<div style="width:2px;flex:1;min-height:24px;background:#E5E7EB;margin:4px 0"></div>` : ''}
          </div>
          <div style="flex:1;padding-bottom:${i < seq.length-1 ? '16px' : '0'}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-weight:700;font-size:13.5px;color:#0F172A">${_esc(step.label)}</span>
              <span style="background:${sm.bg};color:${sm.color};font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:4px">${sm.label}</span>
              ${step.delayDays > 0 ? `<span style="font-size:11px;color:#94A3B8">+${step.delayDays} days</span>` : ''}
            </div>
            ${step.sentAt    ? `<div style="font-size:12px;color:#64748B;margin-bottom:4px">Sent: ${_fmtDate(step.sentAt)}</div>` : ''}
            ${step.scheduledAt ? `<div style="font-size:12px;color:#0284C7;margin-bottom:4px;font-weight:600">Due: ${_fmtDate(step.scheduledAt)}</div>` : ''}
            ${step.subject   ? `<div style="font-size:12px;color:#374151;margin-bottom:4px"><strong>Subject:</strong> ${_esc(step.subject)}</div>` : ''}
            ${step.bodyPreview ? `<div style="font-size:12px;color:#64748B;background:#F8FAFC;padding:8px 10px;border-radius:6px;border-left:3px solid #E2E8F0;line-height:1.6;max-height:80px;overflow:hidden">${_esc(step.bodyPreview)}…</div>` : ''}
          </div>
        </div>`;
      }).join('');

      const container = document.querySelector('#seq-loading')
        ? document.querySelector('#seq-loading').parentElement
        : null;
      if (container) container.innerHTML = `
        <div style="padding:24px 28px;min-width:500px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <h2 style="margin:0;font-size:18px;font-weight:700;color:#0F172A">Email Sequence</h2>
            <span style="font-size:12px;color:#94A3B8">4 touches · auto-sent</span>
          </div>
          <p style="margin:0 0 20px;font-size:13px;color:#64748B">${_esc(res.companyName)} · ${_esc(res.email)}</p>

          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px 18px;margin-bottom:16px">
            <div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Timing (days from previous touch)</div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:12px;color:#475569">Email 1 → FU1:</span>
                <input id="seq-t0" type="number" min="1" max="21" value="${timings[0]}"
                  style="width:52px;padding:5px 8px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;font-weight:700;text-align:center">
                <span style="font-size:12px;color:#94A3B8">days</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:12px;color:#475569">FU1 → FU2:</span>
                <input id="seq-t1" type="number" min="1" max="21" value="${timings[1]}"
                  style="width:52px;padding:5px 8px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;font-weight:700;text-align:center">
                <span style="font-size:12px;color:#94A3B8">days</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:12px;color:#475569">FU2 → Final:</span>
                <input id="seq-t2" type="number" min="1" max="30" value="${timings[2]}"
                  style="width:52px;padding:5px 8px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;font-weight:700;text-align:center">
                <span style="font-size:12px;color:#94A3B8">days</span>
              </div>
              <button id="seq-save-btn" onclick="Outreach._saveSequence('${leadId}')"
                style="background:#0D9488;color:#fff;border:none;border-radius:7px;padding:6px 14px;font-size:12.5px;font-weight:700;cursor:pointer;margin-left:auto">
                Save Timing
              </button>
            </div>
          </div>

          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:18px 16px;margin-bottom:20px">
            ${seqHtml}
          </div>

          <div style="display:flex;justify-content:flex-end">
            <button onclick="UI.closeModal()" style="background:#F1F5F9;color:#475569;border:1px solid #E2E8F0;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer">Close</button>
          </div>
        </div>`;
    } catch(e) {
      UI.toast('Failed to load sequence: ' + e.message, 'a');
      UI.closeModal();
    }
  }

  async function _saveSequence(leadId) {
    const btn = document.getElementById('seq-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const t0 = parseInt((document.getElementById('seq-t0') || {}).value) || 3;
      const t1 = parseInt((document.getElementById('seq-t1') || {}).value) || 7;
      const t2 = parseInt((document.getElementById('seq-t2') || {}).value) || 14;
      await API.post('outreach.sequence.update', { leadId, timings: [t0, t1, t2] });
      UI.toast('✓ Sequence timing updated', 's');
      UI.closeModal();
    } catch(e) {
      UI.toast('Error: ' + e.message, 'a');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Timing'; }
    }
  }


  // ── PART 5: PERFORMANCE DASHBOARD ───────────────────────────
  function _renderPerf() {
    const p = _perf || {};
    if (!p.total && !p.templates) {
      return `<div style="text-align:center;padding:80px 20px;color:#94A3B8">
        <div style="font-size:40px;margin-bottom:12px">📊</div>
        <div style="font-size:15px;font-weight:600;color:#64748B">No performance data yet</div>
        <div style="font-size:13px;margin-top:6px">Stats will appear once emails have been sent and replies tracked.</div>
      </div>`;
    }

    const t     = p.total   || {};
    const tmpl  = p.templates || [];
    const sect  = p.sectors   || [];
    const rr    = p.overallReplyRate || 0;
    const cr    = p.convRate || 0;
    const best  = p.bestTemplate  || {};
    const bestS = p.bestSector    || {};

    const scoreColor = v => v >= 20 ? '#059669' : v >= 10 ? '#D97706' : '#DC2626';

    return `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      ${[
        { l:'Total Sent',    v: t.sent      || 0, sub: 'all-time', c:'#6366F1' },
        { l:'Total Replies', v: t.replied   || 0, sub: 'received',  c:'#0284C7' },
        { l:'Reply Rate',    v: rr + '%',          sub: 'sent → reply', c: scoreColor(rr) },
        { l:'Qualified',     v: t.qualified || 0, sub: 'hot leads', c:'#0D9488' },
      ].map(k => `
        <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#94A3B8;margin-bottom:6px">${k.l}</div>
          <div style="font-family:'Outfit',sans-serif;font-size:28px;font-weight:800;letter-spacing:-1px;color:${k.c};line-height:1">${k.v}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:4px">${k.sub}</div>
        </div>`).join('')}
    </div>

    ${best.key ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:linear-gradient(135deg,#0F172A,#1E293B);border-radius:12px;padding:16px 20px;color:#fff">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:8px">🏆 Best Template</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">${_esc(best.key)}</div>
        <div style="display:flex;gap:16px;margin-top:8px">
          <div><div style="font-size:18px;font-weight:800;color:#0D9488">${best.replyRate}%</div><div style="font-size:10px;color:#94A3B8">Reply rate</div></div>
          <div><div style="font-size:18px;font-weight:800;color:#6366F1">${best.sent}</div><div style="font-size:10px;color:#94A3B8">Sent</div></div>
          <div><div style="font-size:18px;font-weight:800;color:#059669">${best.qualified || 0}</div><div style="font-size:10px;color:#94A3B8">Qualified</div></div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#064E3B,#065F46);border-radius:12px;padding:16px 20px;color:#fff">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6EE7B7;margin-bottom:8px">📍 Best Sector</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">${_esc(bestS.key || '—')}</div>
        <div style="display:flex;gap:16px;margin-top:8px">
          <div><div style="font-size:18px;font-weight:800;color:#34D399">${bestS.replyRate || 0}%</div><div style="font-size:10px;color:#6EE7B7">Reply rate</div></div>
          <div><div style="font-size:18px;font-weight:800;color:#fff">${bestS.sent || 0}</div><div style="font-size:10px;color:#6EE7B7">Sent</div></div>
        </div>
      </div>
    </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04)">
        <div style="padding:14px 16px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;color:#0F172A">Reply Rate by Template</div>
        ${tmpl.length ? `<table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:#F8FAFC">
            <th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8">Template</th>
            <th style="padding:8px 14px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8">Sent</th>
            <th style="padding:8px 14px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8">Reply %</th>
            <th style="padding:8px 14px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8">Conv %</th>
          </tr></thead>
          <tbody>
            ${tmpl.map((t, i) => `
            <tr style="border-top:1px solid #F1F5F9;background:${i===0?'#F0FDFA':''}">
              <td style="padding:10px 14px;color:#0F172A;font-weight:${i===0?'700':'500'}">${_esc(t.key)}${i===0?' 🏆':''}</td>
              <td style="padding:10px 14px;text-align:right;color:#64748B">${t.sent}</td>
              <td style="padding:10px 14px;text-align:right;font-weight:700;color:${scoreColor(t.replyRate)}">${t.replyRate}%</td>
              <td style="padding:10px 14px;text-align:right;color:${t.convRate>0?'#0D9488':'#94A3B8'}">${t.convRate}%</td>
            </tr>`).join('')}
          </tbody>
        </table>`
        : `<div style="padding:20px;text-align:center;color:#94A3B8;font-size:13px">No template data yet</div>`}
      </div>

      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04)">
        <div style="padding:14px 16px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;color:#0F172A">Reply Rate by Sector</div>
        ${sect.length ? `<table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:#F8FAFC">
            <th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8">Sector</th>
            <th style="padding:8px 14px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8">Sent</th>
            <th style="padding:8px 14px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8">Replies</th>
            <th style="padding:8px 14px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8">Rate</th>
          </tr></thead>
          <tbody>
            ${sect.map((s, i) => `
            <tr style="border-top:1px solid #F1F5F9;background:${i===0?'#F0FDFA':''}">
              <td style="padding:10px 14px;color:#0F172A;font-weight:${i===0?'700':'500'}">${_esc(s.key)}${i===0?' 📍':''}</td>
              <td style="padding:10px 14px;text-align:right;color:#64748B">${s.sent}</td>
              <td style="padding:10px 14px;text-align:right;color:#64748B">${s.replied}</td>
              <td style="padding:10px 14px;text-align:right;font-weight:700;color:${scoreColor(s.replyRate)}">${s.replyRate}%</td>
            </tr>`).join('')}
          </tbody>
        </table>`
        : `<div style="padding:20px;text-align:center;color:#94A3B8;font-size:13px">No sector data yet</div>`}
      </div>
    </div>

    ${p.updatedAt ? `<div style="text-align:center;margin-top:12px;font-size:11px;color:#94A3B8">Last updated: ${_fmtDate(p.updatedAt)}</div>` : ''}`;
  }


  // ── PART 6: AI ASSISTANT MODAL ───────────────────────────────
  function openAssistModal(leadId, lead, subject, body) {
    lead = lead || _queue.find(r => r.id === leadId) || {};
    subject = subject || '';
    body    = body    || '';

    UI.openModal(`
      <div style="padding:24px 28px;min-width:540px;max-width:640px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366F1,#8B5CF6);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">✨</div>
          <div>
            <h2 style="margin:0;font-size:18px;font-weight:700;color:#0F172A">AI Email Assistant</h2>
            <p style="margin:0;font-size:12px;color:#64748B">${_esc(lead.companyName || 'Lead')}</p>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          ${[
            ['subject',  '💡 Subject Ideas',   'Suggest 3 better subject lines'],
            ['rewrite',  '✍️ Rewrite Email',    'Rewrite body for higher reply rate'],
            ['followup', '📩 Write Follow-up', 'Generate follow-up email copy'],
            ['analyse',  '🔍 Analyse Email',    'Find weaknesses & scoring'],
          ].map(([task, label, desc]) => `
          <button onclick="Outreach._runAssist('${leadId}','${task}')"
            style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:14px;text-align:left;cursor:pointer;transition:all .15s"
            onmouseenter="this.style.borderColor='#6366F1';this.style.background='#EEF2FF'"
            onmouseleave="this.style.borderColor='#E2E8F0';this.style.background='#F8FAFC'">
            <div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:4px">${label}</div>
            <div style="font-size:12px;color:#64748B">${desc}</div>
          </button>`).join('')}
        </div>

        <div id="assist-result" style="display:none;background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:16px;margin-bottom:16px;font-size:13px;color:#166534;line-height:1.7">
        </div>

        <div id="assist-loading" style="display:none;text-align:center;padding:30px;color:#64748B">
          <div class="spinner" style="margin:0 auto 10px"></div>
          Thinking…
        </div>

        <div style="display:flex;justify-content:flex-end">
          <button onclick="UI.closeModal()" style="background:#F1F5F9;color:#475569;border:1px solid #E2E8F0;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer">Close</button>
        </div>
      </div>
    `);

    // Store context for _runAssist
    window._assistCtx = { leadId, lead, subject, body };
  }

  async function _runAssist(leadId, task) {
    const ctx = window._assistCtx || {};
    const lead = ctx.lead || {};

    const loadEl   = document.getElementById('assist-loading');
    const resultEl = document.getElementById('assist-result');
    if (loadEl)   { loadEl.style.display = 'block'; }
    if (resultEl) { resultEl.style.display = 'none'; }

    try {
      const res = await API.post('outreach.assist', {
        task,
        subject:     ctx.subject || '',
        body:        ctx.body    || '',
        company:     lead.companyName  || '',
        service:     lead.serviceType  || '',
        context:     lead.outreachEmailBody || '',
        followUpN:   lead.followUpCount || 1,
      });

      if (loadEl) loadEl.style.display = 'none';

      if (res.error) {
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.style.background = '#FEF2F2';
          resultEl.style.borderColor = '#FECACA';
          resultEl.style.color = '#991B1B';
          resultEl.innerHTML = '⚠ ' + _esc(res.error);
        }
        return;
      }

      const r = res.result || {};
      let html = '';

      if (task === 'subject' && r.options) {
        html = `<div style="font-weight:700;margin-bottom:10px">Suggested Subject Lines:</div>
          ${(r.options || []).map((o, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border:1px solid #86EFAC;border-radius:7px;margin-bottom:6px;cursor:pointer"
               onclick="navigator.clipboard.writeText('${o.replace(/'/g, "\\'")}').then(() => UI.toast('Copied!','s'))"
               title="Click to copy">
            <span style="font-size:12px;color:#94A3B8;font-weight:700">${i+1}</span>
            <span style="flex:1;font-weight:600;color:#0F172A">${_esc(o)}</span>
            <span style="font-size:11px;color:#059669">Copy</span>
          </div>`).join('')}
          ${r.reasoning ? `<div style="margin-top:8px;font-size:12px;color:#64748B">${_esc(r.reasoning)}</div>` : ''}`;

      } else if (task === 'rewrite' && r.body) {
        html = `<div style="font-weight:700;margin-bottom:6px">Rewritten Email:</div>
          ${r.improvedSubject || r.subject ? `<div style="background:#EEF2FF;padding:8px 10px;border-radius:6px;font-weight:600;color:#4338CA;margin-bottom:8px;font-size:12.5px">Subject: ${_esc(r.improvedSubject || r.subject)}</div>` : ''}
          <div style="background:#fff;padding:10px 12px;border-radius:7px;border:1px solid #86EFAC;white-space:pre-wrap;font-size:12.5px;color:#166534;line-height:1.7;max-height:200px;overflow-y:auto">${_esc(r.body)}</div>
          ${(r.changes || []).length ? `<div style="margin-top:8px;font-size:12px;color:#64748B"><strong>Changes:</strong> ${r.changes.join(' · ')}</div>` : ''}`;

      } else if (task === 'followup' && r.body) {
        html = `<div style="font-weight:700;margin-bottom:6px">Follow-up Email:</div>
          <div style="background:#EEF2FF;padding:8px 10px;border-radius:6px;font-weight:600;color:#4338CA;margin-bottom:8px;font-size:12.5px">Subject: ${_esc(r.subject || '')}</div>
          <div style="background:#fff;padding:10px 12px;border-radius:7px;border:1px solid #86EFAC;white-space:pre-wrap;font-size:12.5px;color:#166534;line-height:1.7;max-height:180px;overflow-y:auto">${_esc(r.body)}</div>`;

      } else if (task === 'analyse') {
        const scoreC = (r.score || 5) >= 7 ? '#059669' : (r.score || 5) >= 5 ? '#D97706' : '#DC2626';
        html = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="font-family:'Outfit',sans-serif;font-size:36px;font-weight:800;color:${scoreC}">${r.score || '—'}<span style="font-size:16px;color:#94A3B8">/10</span></div>
          <div style="font-size:13px;color:#374151">${_esc(r.summary || '')}</div>
        </div>
        ${(r.hurts||[]).length ? `<div style="margin-bottom:8px"><div style="font-weight:700;font-size:12px;color:#DC2626;margin-bottom:5px">⚠ Hurting your reply rate:</div>${r.hurts.map(h => `<div style="font-size:12.5px;padding:4px 0;border-bottom:1px solid #FEE2E2;color:#7F1D1D">• ${_esc(h)}</div>`).join('')}</div>` : ''}
        ${(r.improvements||[]).length ? `<div><div style="font-weight:700;font-size:12px;color:#059669;margin-bottom:5px">✓ Fix immediately:</div>${r.improvements.map(i => `<div style="font-size:12.5px;padding:4px 0;border-bottom:1px solid #D1FAE5;color:#064E3B">→ ${_esc(i)}</div>`).join('')}</div>` : ''}`;

      } else {
        // Generic improvement suggestion
        html = `${r.suggestion ? `<div style="font-weight:700;margin-bottom:6px">Top suggestion:</div><div style="background:#fff;padding:10px 12px;border-radius:7px;border:1px solid #86EFAC;font-size:13px;color:#166534;line-height:1.7;margin-bottom:10px">${_esc(r.suggestion)}</div>` : ''}
          ${r.why ? `<div style="font-size:12px;color:#64748B"><strong>Why:</strong> ${_esc(r.why)}</div>` : ''}
          ${r.improvedSubject ? `<div style="margin-top:8px;font-size:12.5px;background:#EEF2FF;padding:8px 10px;border-radius:6px;color:#4338CA;font-weight:600">Better subject: ${_esc(r.improvedSubject)}</div>` : ''}
          ${r.improvedOpening ? `<div style="margin-top:6px;font-size:12.5px;color:#166534"><strong>Better opening:</strong> ${_esc(r.improvedOpening)}</div>` : ''}`;
      }

      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.style.background = '#F0FDF4';
        resultEl.style.borderColor = '#86EFAC';
        resultEl.style.color = '#166534';
        resultEl.innerHTML = html;
      }

    } catch(e) {
      if (loadEl)   loadEl.style.display = 'none';
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.style.background = '#FEF2F2';
        resultEl.style.borderColor = '#FECACA';
        resultEl.style.color = '#991B1B';
        resultEl.innerHTML = '⚠ Request failed: ' + _esc(e.message);
      }
    }
  }


  // ── STATE SETTERS ──────────────────────────────────────────
  function _setView(v) { _view = v; _draw(); }
  function _search(q)  { _q = q; _draw(); }

  return {
    render,
    openAddLead,
    _doAddLead,
    openSendModal,
    sendBatch,
    _setView,
    _search,
    _previewTemplate,
    _doSend,
    _doBatch,
    _markOptOut,
    _convertToCRM,
    _resolveAction,
    openSequenceModal,
    _saveSequence,
    openAssistModal,
    _runAssist,
    _openAssistFromModal,
  };
})();
