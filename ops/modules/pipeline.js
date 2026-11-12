// ============================================================
// AskMiro Ops — modules/pipeline.js
// Today's worklist: replies to answer, enquiries to quote, quotes to chase.
// Ops reads the mailbox (gas/pipeline.gs), so a quote sent from Gmail shows
// up here without anyone typing it in again. Chases are written to Gmail
// Drafts — nothing on this screen sends email.
// ============================================================
window.Pipeline = (() => {
  let _d = null;
  let _mountId = null;
  let _syncing = false;
  let _autoSyncedAt = 0;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const age = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const h = Math.max(0, (Date.now() - d.getTime()) / 3600000);
    return h < 1 ? 'under an hour' : h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' days';
  };
  const who = (x) => {
    const co = x.company || x.contact || '(no name)';
    const ct = x.contact && x.contact !== x.company ? ' <span style="color:#94A3B8;font-weight:500">&middot; ' + esc(x.contact) + '</span>' : '';
    return '<span style="font-weight:700;color:#0F172A">' + esc(co) + '</span>' + ct;
  };
  const gmail = (x) => x.threadId
    ? `<a class="btn bo" style="font-size:12px;padding:5px 10px;text-decoration:none" target="_blank" rel="noopener" href="https://mail.google.com/mail/#all/${encodeURIComponent(x.threadId)}">Open in Gmail</a>`
    : (x.email ? `<a class="btn bo" style="font-size:12px;padding:5px 10px;text-decoration:none" href="mailto:${esc(x.email)}">Email</a>` : '');
  const btn = (label, js, primary) =>
    `<button class="btn ${primary ? 'bp' : 'bo'}" style="font-size:12px;padding:5px 10px" onclick="${js}">${label}</button>`;
  const lostBtn = (x, label) => btn(label || 'Lost', `Pipeline.lost('${esc(x.id)}')`);

  function row(x, sub, actions) {
    return `
<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #F1F5F9;flex-wrap:wrap">
  <div style="flex:1;min-width:220px">
    <div style="font-size:13.5px">${who(x)}</div>
    <div style="font-size:12px;color:#64748B;margin-top:2px">${sub}</div>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap">${actions}</div>
</div>`;
  }

  function section(title, colour, items, render, hint) {
    if (!items.length) return '';
    return `
<div style="margin-top:14px">
  <div style="display:flex;align-items:baseline;gap:8px">
    <span style="width:8px;height:8px;border-radius:50%;background:${colour};display:inline-block"></span>
    <span style="font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#334155">${title}</span>
    <span style="font-size:12px;color:#94A3B8">${items.length}</span>
    ${hint ? `<span style="font-size:12px;color:#94A3B8">&middot; ${hint}</span>` : ''}
  </div>
  ${items.map(render).join('')}
</div>`;
  }

  function html(d) {
    const t = d.totals || {};
    const nothing = !(d.reply.length + d.unanswered.length + d.chase.length + d.stalled.length);
    const synced = d.syncedAt
      ? 'Mailbox read ' + new Date(d.syncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ', ' + day(d.syncedAt)
      : 'Mailbox not read yet';

    const body =
      section('Reply waiting', '#DC2626', d.reply, (x) => row(x,
        'Replied ' + esc(day(x.lastInboundAt)) + ' (' + age(x.lastInboundAt) + ' ago)' + (x.quoteMonthly ? ' &middot; quote ' + UI.fmt(x.quoteMonthly) + '/mo' : ''),
        gmail(x) + lostBtn(x)), 'answer these first') +
      section('Enquiries not answered', '#D97706', d.unanswered, (x) => row(x,
        esc(x.service || x.source || 'Enquiry') + ' &middot; came in ' + esc(day(x.createdAt)) + ' (' + age(x.createdAt) + ' ago)' + (x.phone ? ' &middot; ' + esc(x.phone) : ''),
        btn('Log quote sent', `Pipeline.openLog('${esc(x.id)}')`, true) + gmail(x) + lostBtn(x, 'Not a lead'))) +
      section('Chase due', '#0D9488', d.chase, (x) => row(x,
        esc(x.note) + (x.chaseDraftAt ? ' &middot; <span style="color:#0D9488">draft written ' + esc(day(x.chaseDraftAt)) + ', waiting in Gmail</span>' : ''),
        btn('Draft chase ' + (x.chaseStep + 1), `Pipeline.draftChase('${esc(x.id)}')`, true) + gmail(x) +
        btn('Snooze 3 days', `Pipeline.snooze('${esc(x.id)}',3)`) + lostBtn(x))) +
      section('Chased three times, no reply', '#64748B', d.stalled, (x) => row(x,
        esc(x.note || 'Quote sent, no reply') + (x.phone ? ' &middot; ' + esc(x.phone) : ''),
        (x.phone ? `<a class="btn bp" style="font-size:12px;padding:5px 10px;text-decoration:none" href="tel:${esc(String(x.phone).replace(/\s/g, ''))}">Call</a>` : '') + gmail(x) + lostBtn(x, 'Close as lost')), 'call or close') +
      section('Waiting on the customer', '#CBD5E1', d.awaiting, (x) => row(x, esc(x.note), gmail(x))) +
      (d.oldReplies.length ? `
<details style="margin-top:14px">
  <summary style="cursor:pointer;font-size:12px;font-weight:700;color:#64748B">Older replies that were never answered (${d.oldReplies.length})</summary>
  ${d.oldReplies.map((x) => row(x, 'Replied ' + esc(day(x.lastInboundAt)) + ' &middot; ' + esc(x.email), gmail(x) + lostBtn(x, 'Close'))).join('')}
</details>` : '');

    return `
<div class="card mb16"><div class="card-body" style="padding-top:14px">
  <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:220px">
      <div style="font-family:Outfit,sans-serif;font-weight:800;font-size:16px;color:#0F172A">Today</div>
      <div style="font-size:12.5px;color:#64748B;margin-top:2px">
        ${t.quotesOut || 0} quote${t.quotesOut === 1 ? '' : 's'} out &middot; ${UI.fmt(t.pipelineMonthly || 0)}/mo &middot; ${UI.fmt(t.pipelineAnnual || 0)}/yr open pipeline
      </div>
    </div>
    <div style="font-size:11.5px;color:#94A3B8" id="pl-synced">${esc(synced)}</div>
    <button class="btn bo" id="pl-sync-btn" style="font-size:12px;padding:5px 10px" onclick="Pipeline.sync(true)">Read mailbox now</button>
  </div>
  ${nothing ? '<div style="font-size:13px;color:#64748B;padding:14px 0 2px">Nothing needs you right now. Every enquiry has an answer and no chase is due.</div>' : ''}
  ${body}
</div></div>`;
  }

  async function load(force) {
    _d = await API.get('pipeline.today', {}, { forceRefresh: !!force, strict: true });
    if (_d && _d.error) throw new Error(_d.error);
    return _d;
  }

  function draw() {
    const el = _mountId && document.getElementById(_mountId);
    if (el && _d) el.innerHTML = html(_d);
  }

  // Called by the dashboard after it renders. Never throws: the dashboard must
  // still load if the pipeline backend is not deployed yet.
  async function mount(id) {
    _mountId = id;
    try {
      await load(false);
      draw();
      const stale = !_d.syncedAt || Date.now() - new Date(_d.syncedAt).getTime() > 30 * 60000;
      if (stale && Date.now() - _autoSyncedAt > 10 * 60000) { _autoSyncedAt = Date.now(); sync(false); }
    } catch (e) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
      console.warn('[Pipeline] not available:', e.message);
    }
  }

  // Each call is a short, bounded slice of the mailbox; loop until it is done.
  async function sync(manual) {
    if (_syncing) return;
    _syncing = true;
    const b = document.getElementById('pl-sync-btn');
    if (b) { b.disabled = true; b.textContent = 'Reading mailbox…'; }
    const moved = [];
    try {
      for (let i = 0; i < 5; i++) {
        const r = await API.post('pipeline.sync', { full: !!manual });
        if (!r || r.error) throw new Error((r && r.error) || 'Sync failed');
        (r.stageChanges || []).forEach((c) => moved.push(c));
        if (r.busy || !(r.remaining > 0)) break;
      }
      API.invalidate('pipeline.today'); API.invalidate('crm'); API.invalidate('quotes'); API.invalidate('leads');
      await load(true);
      draw();
      if (moved.length) UI.toast(moved.map((c) => c.name + ' → ' + c.to).join(', '), 'g', 6000);
      else if (manual) UI.toast('Mailbox read. Nothing new.', 'g');
    } catch (e) {
      if (manual) UI.toast(e.message, 'r');
      const btn2 = document.getElementById('pl-sync-btn');
      if (btn2) { btn2.disabled = false; btn2.textContent = 'Read mailbox now'; }
    } finally {
      _syncing = false;
    }
  }

  async function refresh() {
    API.invalidate('pipeline.today'); API.invalidate('crm'); API.invalidate('quotes'); API.invalidate('leads');
    try { await load(true); draw(); } catch (e) {}
  }

  async function draftChase(id) {
    try {
      const r = await API.post('pipeline.chaseDraft', { leadId: id });
      if (!r || r.error) throw new Error((r && r.error) || 'Could not write the draft');
      UI.toast(r.existing ? 'A chase draft is already waiting in Gmail. Open it, edit, send.'
                          : 'Chase ' + r.step + ' is in Gmail Drafts for ' + r.to + '. Read it, then press Send.', 'g', 7000);
      await refresh();
    } catch (e) { UI.toast(e.message, 'r'); }
  }

  async function snooze(id, days) {
    try {
      const r = await API.post('pipeline.snooze', { leadId: id, days: days });
      if (!r || r.error) throw new Error((r && r.error) || 'Could not snooze');
      UI.toast('Snoozed for ' + days + ' days');
      await refresh();
    } catch (e) { UI.toast(e.message, 'r'); }
  }

  async function lost(id) {
    if (!window.confirm('Close this lead as lost? It leaves the worklist. You can move it back in CRM.')) return;
    try {
      const r = await API.post('lead.stage', { id: id, status: 'Lost' });
      if (r && r.error) throw new Error(r.error);
      UI.toast('Closed as lost');
      await refresh();
    } catch (e) { UI.toast(e.message, 'r'); }
  }

  // Record a quote that went out by phone, by hand, or before Ops could see it.
  function openLog(leadId, quoteId) {
    UI.openModal(`
<div class="modal-hd"><h2>Log a quote that was sent</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div style="font-size:12.5px;color:#64748B;margin-bottom:12px">Quotes emailed from Gmail are picked up automatically. Use this for one given by phone or in person.</div>
  <input type="hidden" id="plq-lead" value="${esc(leadId || '')}"><input type="hidden" id="plq-quote" value="${esc(quoteId || '')}">
  <div class="fr">
    <div class="fg"><label class="fl">Monthly fee (&#163;, ex. VAT)</label><input class="fin" id="plq-monthly" type="number" min="0" step="0.01" placeholder="e.g. 702"></div>
    <div class="fg"><label class="fl">or one-off price (&#163;)</label><input class="fin" id="plq-oneoff" type="number" min="0" step="0.01" placeholder="e.g. 480"></div>
  </div>
  <div class="fr">
    <div class="fg"><label class="fl">Hours per week (for margin)</label><input class="fin" id="plq-hours" type="number" min="0" step="0.25" placeholder="e.g. 6"></div>
    <div class="fg"><label class="fl">Date sent</label><input class="fin" id="plq-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
  </div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Pipeline.saveLog()">Save</button></div>
</div>`.trim());
  }

  async function saveLog() {
    const monthly = parseFloat(UI.gv('plq-monthly')) || 0;
    const oneOff = parseFloat(UI.gv('plq-oneoff')) || 0;
    if (!(monthly > 0) && !(oneOff > 0)) { UI.toast('Enter the monthly fee or the one-off price', 'r'); return; }
    const date = UI.gv('plq-date');
    try {
      const r = await API.post('quote.record', {
        leadId: UI.gv('plq-lead'), quoteId: UI.gv('plq-quote'), monthly: monthly, oneOff: oneOff,
        hoursPerWeek: UI.gv('plq-hours'), sentAt: date ? date + 'T09:00:00.000Z' : ''
      });
      if (!r || r.error) throw new Error((r && r.error) || 'Could not save');
      UI.closeModal();
      UI.toast('Quote logged. First chase is due in 3 days.');
      await refresh();
      if (window.Quotes && location.hash.indexOf('quotes') !== -1) Quotes.render();
    } catch (e) { UI.toast(e.message, 'r'); }
  }

  return { mount, sync, draftChase, snooze, lost, openLog, saveLog };
})();
