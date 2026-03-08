window.Admin = (() => {
  async function render() {
    let settings = {};
    try { settings = await API.get('settings'); } catch(e) {}
    document.getElementById('main-content').innerHTML = `
${UI.secHd('Admin', 'Settings & Users')}
<div class="g2">
  <div class="card">
    <div class="card-hd"><div class="card-title">&#9881; System Settings</div></div>
    <div class="card-body" style="padding-top:14px">
      <div class="fg"><label class="fl">Company Name</label><input class="fin" id="s-co" value="${settings.companyName||'AskMiro Cleaning Services'}"></div>
      <div class="fg"><label class="fl">Outbound Email</label><input class="fin" id="s-em" value="${settings.emailFrom||'info@askmiro.com'}"></div>
      <div class="fg"><label class="fl">Min Margin % (quote floor)</label><input class="fin" id="s-mg" type="number" value="${settings.minMarginPct||20}"></div>
      <div class="fg"><label class="fl">LLW Rate (&#163;/hr)</label><input class="fin" id="s-lw" type="number" step="0.01" value="${settings.llwRate||13.85}"></div>
      <div class="fg"><label class="fl">On-costs % (NI + holiday)</label><input class="fin" id="s-oc" type="number" value="${settings.oncostsPct||36}"></div>
      <button class="btn bp" onclick="Admin.saveSettings()">Save Settings</button>
    </div>
  </div>
  <div class="card">
    <div class="card-hd"><div class="card-title">&#128101; Users</div><button class="btn bp btn-sm" onclick="Admin.openNewUser()">+ New User</button></div>
    <div class="card-body" style="padding-top:12px">
      <div class="alert alert-a">Users are managed via the Users tab in Google Sheets. Add users there and provide them their token.</div>
      <p style="font-size:13px;color:var(--sl);margin-top:12px">Roles: <strong>Owner</strong>, <strong>OpsManager</strong>, <strong>Supervisor</strong>, <strong>Cleaner</strong>, <strong>Finance</strong></p>
    </div>
  </div>
</div>
<div class="card mt18">
  <div class="card-hd"><div class="card-title">&#128203; Backend Connection</div></div>
  <div class="card-body">
    <div class="alert alert-${CFG.API_BASE.includes('YOUR_SCRIPT_ID')?'r':'g'}">${CFG.API_BASE.includes('YOUR_SCRIPT_ID')?'&#10007; API not configured. Update API_BASE in config.js':'&#10003; Connected to Google Apps Script backend'}</div>
    <p style="font-size:12px;color:var(--ll);margin-top:8px">API: <code style="font-family:monospace;font-size:11px">${CFG.API_BASE}</code></p>
  </div>
</div>`;
  }
  async function saveSettings() {
    try {
      await API.post('settings', {
        companyName: UI.gv('s-co'), emailFrom: UI.gv('s-em'),
        minMarginPct: UI.gv('s-mg'), llwRate: UI.gv('s-lw'), oncostsPct: UI.gv('s-oc')
      });
      UI.toast('Settings saved');
    } catch(e) { UI.toast(e.message, 'r'); }
  }
  function openNewUser() {
    UI.openModal(`<div class="modal-hd"><h2>New User</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body">
  <div class="fr"><div class="fg"><label class="fl">Name <span class="req">*</span></label><input class="fin" id="u-nm"></div>
  <div class="fg"><label class="fl">Email <span class="req">*</span></label><input class="fin" id="u-em" type="email"></div></div>
  <div class="fg"><label class="fl">Role <span class="req">*</span></label><select class="fse" id="u-rl"><option>OpsManager</option><option>Supervisor</option><option>Cleaner</option><option>Finance</option><option>Owner</option></select></div>
  <div class="fg"><label class="fl">Allowed Sites (comma-separated IDs, or "all")</label><input class="fin" id="u-si" value="all"></div>
  <div class="modal-foot"><button class="btn bo" onclick="UI.closeModal()">Cancel</button><button class="btn bp" onclick="Admin.saveUser()">Create User</button></div>
</div>`);
  }
  async function saveUser() {
    if (!UI.rq('u-nm') || !UI.rq('u-em')) return;
    try {
      const res = await API.post('user', { name: UI.gv('u-nm'), email: UI.gv('u-em'), role: UI.gv('u-rl'), allowedSites: UI.gv('u-si') });
      UI.closeModal();
      if (res.token) UI.openModal(`<div class="modal-hd"><h2>User Created</h2><button class="xbtn" onclick="UI.closeModal()">&#x2715;</button></div>
<div class="modal-body"><div class="alert alert-g">&#10003; User created. Share this token securely.</div>
<div class="fg"><label class="fl">Access Token (copy now &#8212; not shown again)</label><input class="fin" value="${res.token}" readonly onclick="this.select()"></div>
<div class="modal-foot"><button class="btn bp" onclick="UI.closeModal()">Done</button></div></div>`);
      else UI.toast('User updated');
    } catch(e) { UI.toast(e.message, 'r'); }
  }
  return { render, saveSettings, openNewUser, saveUser };
})();
