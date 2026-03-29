// ============================================================
// AskMiro Ops — Outreach Queue  v1.0
// Outbound lead management: queue → send → follow-up → reply
// ============================================================
window.Outreach = (() => {

  let _queue     = [];
  let _log       = [];
  let _stats     = {};
  let _templates = [];
  let _view      = 'queue';   // queue | sent | replies
  let _q         = '';
  let _sending   = new Set(); // lead IDs currently being sent

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
    positive:     { color: '#059669', bg: '#ECFDF5', label: 'Interested'    },
    negative:     { color: '#DC2626', bg: '#FEF2F2', label: 'Not interested' },
    unsubscribe:  { color: '#7C3AED', bg: '#EDE9FE', label: 'Opt-out'       },
    info_request: { color: '#0284C7', bg: '#E0F2FE', label: 'Wants info'    },
    auto_reply:   { color: '#64748B', bg: '#F1F5F9', label: 'Auto-reply'    },
  };

  const STATUS_META = {
    queued:      { color: '#6366F1', label: 'Queued'      },
    sent:        { color: '#0284C7', label: 'Sent'        },
    replied:     { color: '#059669', label: 'Replied'     },
    opted_out:   { color: '#DC2626', label: 'Opted out'   },
    exhausted:   { color: '#94A3B8', label: 'Exhausted'   },
    converted:   { color: '#0D9488', label: 'Converted'   },
    follow_up_due: { color: '#D97706', label: 'Follow-up due' },
  };

  // ── RENDER ─────────────────────────────────────────────────
  async function render() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ll)">
      <div class="spinner" style="margin:0 auto 12px"></div>Loading Outreach Queue…</div>`;

    try {
      [_queue, _stats, _log, _templates] = await Promise.all([
        API.get('outreach.queue'),
        API.get('outreach.stats'),
        API.get('outreach.log'),
        API.get('outreach.templates'),
      ]);
      // Normalise — API returns { queue:[...] } etc.
      if (_queue && _queue.queue) _queue = _queue.queue;
      if (_stats && _stats.ok)   _stats = _stats;
      if (_log   && _log.log)    _log   = _log.log;
      if (_templates && _templates.templates) _templates = _templates.templates;
    } catch(e) {
      mc.innerHTML = `<div style="padding:40px;color:#DC2626">Failed to load: ${_esc(e.message)}</div>`;
      return;
    }

    _draw();
  }

  function _draw() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = _renderStats() + _renderToolbar() + _renderBody();
  }

  // ── STATS BAR ─────────────────────────────────────────────
  function _renderStats() {
    const s = _stats || {};
    const cards = [
      { label: 'In Queue',       val: s.queued        || 0, sub: 'awaiting contact',  color: '#6366F1' },
      { label: 'Sent',           val: s.sent          || 0, sub: 'contacted',          color: '#0284C7' },
      { label: 'Replied',        val: s.replied       || 0, sub: 'responded',          color: '#059669' },
      { label: 'Positive',       val: s.positiveReplies|| 0, sub: 'interested',        color: '#0D9488' },
      { label: 'Reply Rate',     val: (s.replyRatePct || 0) + '%', sub: 'of contacted', color: '#D97706' },
      { label: 'Sent Today',     val: s.sentToday     || 0, sub: 'today\'s sends',     color: '#7C3AED' },
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
        ${[['queue','Queue'],['sent','Sent'],['replies','Replies']].map(([v,l]) => `
          <button onclick="Outreach._setView('${v}')"
            style="font-size:12.5px;font-weight:600;padding:6px 14px;border-radius:7px;cursor:pointer;border:none;transition:all .15s ease;
                   background:${_view===v?'#fff':'transparent'};color:${_view===v?'#6366F1':'#64748B'};
                   box-shadow:${_view===v?'0 1px 4px rgba(0,0,0,.08)':'none'}">${l}</button>`).join('')}
      </div>
      <div style="position:relative;flex:1;min-width:180px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#94A3B8;font-size:13px">⌕</span>
        <input class="fsearch" placeholder="Search company, contact, email…" value="${_esc(_q)}"
          oninput="Outreach._search(this.value)"
          style="width:100%;padding-left:30px;background:#fff;border:1px solid #E2E8F0;border-radius:9px;font-size:13px">
      </div>
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
        <div style="font-size:13px;margin-top:6px">Outbound leads from Lead Intelligence will appear here</div>
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

  // ── SEND MODAL ─────────────────────────────────────────────
  function openSendModal(leadId) {
    const lead = _queue.find(r => r.id === leadId);
    if (!lead) return;

    const currentTmpl = _templates.find(t => t.key === lead.outreachTemplate) || _templates[0];

    UI.openModal(`
      <div style="padding:24px 28px">
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0F172A">Send Outreach Email</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#64748B">${_esc(lead.companyName)} · ${_esc(lead.contactName)} · ${_esc(lead.email)}</p>

        <div style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px">TEMPLATE</label>
          <select id="tmpl-select" onchange="Outreach._previewTemplate(this.value, '${leadId}')"
            style="width:100%;padding:9px 12px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;background:#fff;cursor:pointer">
            ${_templates.map(t => `<option value="${_esc(t.key)}" ${t.key === lead.outreachTemplate ? 'selected' : ''}>${_esc(t.label)}</option>`).join('')}
          </select>
        </div>

        <div style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px">SUBJECT PREVIEW</label>
          <div id="tmpl-subject" style="padding:9px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;color:#374151">
            ${_esc(_mergePreview(currentTmpl ? currentTmpl.subject : '', lead))}
          </div>
        </div>

        <div style="margin-bottom:20px">
          <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px">BODY PREVIEW</label>
          <div id="tmpl-body" style="padding:12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:12.5px;color:#374151;line-height:1.7;white-space:pre-wrap;max-height:220px;overflow-y:auto">
            ${_esc(_mergePreview(currentTmpl ? currentTmpl.body : '', lead))}
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

  // ── MARK OPT OUT ───────────────────────────────────────────
  async function _markOptOut(leadId) {
    if (!confirm('Mark this lead as opted out? They won\'t be contacted again.')) return;
    try {
      await API.post('outreach.status', { leadId, status: 'opted_out' });
      _queue = _queue.filter(r => r.id !== leadId);
      UI.toast('Lead marked as opted out', 'w');
      _draw();
    } catch(e) { UI.toast('Error: ' + e.message, 'a'); }
  }

  // ── CONVERT TO CRM PIPELINE ────────────────────────────────
  async function _convertToCRM(leadId) {
    try {
      await API.post('outreach.status', { leadId, status: 'converted' });
      // Also update the CRM stage to Qualified (they replied positively)
      await API.post('lead.stage', { id: leadId, status: 'Qualified' });
      UI.toast('Lead moved to CRM pipeline as Qualified', 's');
      // Navigate to CRM
      setTimeout(() => Router.navigate('crm'), 800);
    } catch(e) { UI.toast('Error: ' + e.message, 'a'); }
  }

  // ── STATE SETTERS ──────────────────────────────────────────
  function _setView(v) { _view = v; _draw(); }
  function _search(q)  { _q = q; _draw(); }

  return {
    render,
    openSendModal,
    sendBatch,
    _setView,
    _search,
    _previewTemplate,
    _doSend,
    _doBatch,
    _markOptOut,
    _convertToCRM,
  };
})();
