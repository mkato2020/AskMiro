// ============================================================
// AskMiro Ops — modules/crm.js
// ============================================================
const CRM = (() => {
  let _leads = [];
  const STAGES = ['New','Contacted','Qualified','QuoteSent','Negotiating','Won','Lost'];
  const STAGE_COLOR = {New:'var(--am)',Contacted:'var(--t)',Qualified:'var(--t)',QuoteSent:'var(--td)',Negotiating:'var(--ch)',Won:'var(--gn)',Lost:'var(--ll)'};
  let _view = 'kanban', _q = '';

  async function render() {
    const app = document.getElementById('main-content');
    try { _leads = await API.get('leads'); } catch(e) { _leads = []; UI.toast('Could not load leads: ' + e.message, 'a'); }
    updateBadge();
    _draw();
  }

  function updateBadge() {
    const n = _leads.filter(l=>l.status==='New').length;
    const el = document.getElementById('badge-crm');
    if (el) { el.textContent = n; el.style.display = n > 0 ? '' : 'none'; }
  }

  function _draw() {
    const filtered = _q ? _leads.filter(l => [l.companyName,l.contactName,l.email,l.status,l.segment].join(' ').toLowerCase().includes(_q.toLowerCase())) : _leads;
    const kanbanHTML = STAGES.map(st => {
      const items = filtered.filter(l => l.status === st);
      return `<div class="kb-col">
        <div class="kb-col-hd"><span>${st}</span><span style="background:${STAGE_COLOR[st]}22;color:${STAGE_COLOR[st]};border-radius:10px;padding:1px 7px;font-weight:700">${items.length}</span></div>
        ${items.length === 0 ? '<div class="kb-empty">No leads</div>' : ''}
        ${items.map(l => `<div class="kb-card" onclick='CRM.openEdit(${JSON.stringify(JSON.stringify(l))})'>
          <div style="font-weight:600;font-size:13px;margin-bottom:3px">${l.companyName}</div>
          <div style="font-size:11px;color:var(--ll)">${l.contactName} &middot; ${l.segment||'&#8212;'}</div>
          ${l.annualValue ? `<div style="margin-top:5px;font-size:12px;font-weight:700;color:var(--t)">${UI.fmtk(l.annualValue)}/yr</div>` : ''}
        </div>`).join('')}
      </div>`;
    }).join('');

    const listHTML = `<div class="card"><div class="card-body" style="padding-top:12px"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Lead ID</th><th>Company</th><th>Contact</th><th>Email</th><th>Segment</th><th>Status</th><th>Value/yr</th></tr></thead>
      <tbody>${filtered.map(l => `<tr onclick='CRM.openEdit(${JSON.stringify(JSON.stringify(l))})'>
        <td class="tmn">${l.id}</td><td class="tfw">${l.companyName}</td><td>${l.contactName}</td>
        <td style="font-size:12px">${l.email}</td><td>${l.segment||'&#8212;'}</td>
        <td>${UI.statusPill(l.status)}</td><td>${l.annualValue?UI.fmtk(l.annualValue):'&#8212;'}</td>
      </tr>`).join('')}</tbody>
    </table></div></div></div>`;

    document.getElementById('main-content').innerHTML = `
${UI.secHd('CRM', 'Leads & Accounts', filtered.length + ' leads')}
<div class="fb">
  <div class="tg-wrap">
    <button class="tg-btn ${_view==='kanban'?'active':''}" onclick="CRM._setView('kanban')">Kanban</button>
    <button class="tg-btn ${_view==='list'?'active':''}" onclick="CRM._setView('list')">List</button>
  </div>
  <input class="fsearch" placeholder="Search leads&#8230;" value="${_q.replace(/"/g,'&quot;')}" oninput="CRM._search(this.value)">
  <div class="sp"></div>
  <button class="btn bp" onclick="CRM.openNewLead()">+ New Lead</button>
</div>
${_view === 'kanban' ? `<div class="kb-wrap">${kanbanHTML}</div>` : listHTML}`;
  }

  function _setView(v) { _view = v; _draw(); }
  function _search(q) { _q = q; _draw(); }

  function openNewLead() {
    UI.openModal(`<div class="modal-hd"><h2>New Lead</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr"><div class="fg"><label class="fl">Company <span class="req">*</span></label><input class="fin" id="l-co" placeholder="Company name"></div>
  <div class="fg"><label class="fl">Contact <span class="req">*</span></label><input class="fin" id="l-cx" placeholder="Full name"></div></div>
  <div class="fr"><div class="fg"><label class="fl">Email <span class="req">*</span></label><input class="fin" id="l-em" type="email"></div>
  <div class="fg"><label class="fl">Phone</label><input class="fin" id="l-ph"></div></div>
  <div class="fr"><div class="fg"><label class="fl">Segment</label><select class="fse" id="l-sg"><option>Office</option><option>Residential</option><option>Healthcare</option><option>School</option><option>Gym</option><option>Industrial</option></select></div>
  <div class="fg"><label class="fl">Source</label><select class="fse" id="l-sr"><option>Referral</option><option>Website</option><option>Cold</option><option>Event</option></select></div></div>
  <div class="fg"><label class="fl">Est. Annual Value (&#163;)</label><input class="fin" id="l-vl" type="number" placeholder="60000"></div>
  <div class="fg"><label class="fl">Notes</label><textarea class="fta" id="l-nt"></textarea></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="CRM.saveLead()">Save Lead</button></div>
</div>`);
  }

  function openEdit(jsonStr) {
    const l = JSON.parse(jsonStr);
    UI.openModal(`<div class="modal-hd"><h2>Edit Lead</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr"><div class="fg"><label class="fl">Company</label><input class="fin" id="l-co" value="${(l.companyName||'').replace(/"/g,'&quot;')}"></div>
  <div class="fg"><label class="fl">Contact</label><input class="fin" id="l-cx" value="${(l.contactName||'').replace(/"/g,'&quot;')}"></div></div>
  <div class="fr"><div class="fg"><label class="fl">Email</label><input class="fin" id="l-em" type="email" value="${l.email||''}"></div>
  <div class="fg"><label class="fl">Phone</label><input class="fin" id="l-ph" value="${l.phone||''}"></div></div>
  <div class="fr"><div class="fg"><label class="fl">Status</label><select class="fse" id="l-st">${STAGES.map(s=>`<option ${s===l.status?'selected':''}>${s}</option>`).join('')}</select></div>
  <div class="fg"><label class="fl">Value/yr (&#163;)</label><input class="fin" id="l-vl" type="number" value="${l.annualValue||''}"></div></div>
  <div class="fg"><label class="fl">Notes</label><textarea class="fta" id="l-nt">${l.notes||''}</textarea></div>
  <div class="modal-foot"><div style="flex:1"></div><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="CRM.updateLead('${l.id}')">Update</button></div>
</div>`);
  }

  async function saveLead() {
    if (!UI.rq('l-co') || !UI.rq('l-cx') || !UI.rq('l-em')) return;
    try {
      await API.post('lead', { companyName: UI.gv('l-co'), contactName: UI.gv('l-cx'), email: UI.gv('l-em'), phone: UI.gv('l-ph'), segment: UI.gv('l-sg'), source: UI.gv('l-sr'), annualValue: UI.gv('l-vl'), notes: UI.gv('l-nt') });
      UI.closeModal(); UI.toast('Lead saved'); await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  async function updateLead(id) {
    try {
      const st = UI.gv('l-st');
      await API.post('lead', { id, companyName: UI.gv('l-co'), contactName: UI.gv('l-cx'), email: UI.gv('l-em'), phone: UI.gv('l-ph'), annualValue: UI.gv('l-vl'), notes: UI.gv('l-nt') });
      await API.post('lead.stage', { id, status: st });
      UI.closeModal(); UI.toast('Lead updated'); await render();
    } catch(e) { UI.toast(e.message, 'r'); }
  }

  return { render, openNewLead, openEdit, saveLead, updateLead, _setView, _search };
})();
