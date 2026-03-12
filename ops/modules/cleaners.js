// ============================================================
// AskMiro Ops — modules/cleaners.js  v1.0
// Cleaner Database — Workforce & Availability
// ============================================================
// Architecture: IIFE module, same pattern as quotes.js / reception.js
// Data layer:   Google Sheets via GAS API (swap-ready for Supabase)
// ============================================================

window.Cleaners = (() => {

  // ── STATE ─────────────────────────────────────────────────
  let _cleaners  = [];
  let _filtered  = [];
  let _search    = '';
  let _filters   = {
    status:         'all',
    type:           'all',
    area:           'all',
    service:        'all',
    availability:   'all',
    compliance:     'all',
    dbs:            'all',
    transport:      'all',
    emergency:      'all',
  };
  let _sort      = 'fullName';
  let _activeDrawer = null;  // 'add' | 'edit' | 'view'
  let _editTarget   = null;  // cleaner being edited

  // ── DESIGN TOKENS (inline — matches askmiro-theme.css) ───
  const T = {
    teal:    '#0A9688',
    tealMid: '#0DBDAD',
    navy:    '#0D1C2E',
    bg:      '#F7F9FB',
    surface: '#FFFFFF',
    raised:  '#EEF2F6',
    border:  'rgba(13,28,46,0.08)',
    borderM: 'rgba(13,28,46,0.14)',
    text1:   '#0D1C2E',
    text2:   '#4A6480',
    text3:   '#8BA5BE',
    green:   '#059669',
    amber:   '#D97706',
    red:     '#DC2626',
    purple:  '#7C3AED',
  };

  // ── STATUS + BADGE HELPERS ────────────────────────────────
  function _pill(label, color, bg) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.3px;background:${bg};color:${color}">${label}</span>`;
  }

  function _statusPill(status) {
    const map = {
      'Active':   [T.green,  'rgba(5,150,105,.1)'],
      'Inactive': [T.amber,  'rgba(217,119,6,.1)'],
      'Archived': [T.text3,  T.raised],
      'Trial':    [T.purple, 'rgba(124,58,237,.1)'],
    };
    const [c, bg] = map[status] || [T.text2, T.raised];
    return _pill(status, c, bg);
  }

  function _compliancePill(status) {
    const map = {
      'Ready':    [T.green,  'rgba(5,150,105,.1)',   '✓'],
      'Pending':  [T.amber,  'rgba(217,119,6,.1)',   '⏳'],
      'Expiring': [T.red,    'rgba(220,38,38,.08)',  '⚠'],
      'Blocked':  [T.red,    'rgba(220,38,38,.1)',   '✕'],
    };
    const [c, bg, icon] = map[status] || [T.text2, T.raised, '—'];
    return _pill(icon + ' ' + (status || '—'), c, bg);
  }

  function _dbsPill(status) {
    const map = {
      'Enhanced': [T.teal,  'rgba(10,150,136,.1)', '🔒'],
      'Basic':    [T.green, 'rgba(5,150,105,.08)', '🔐'],
      'None':     [T.text3, T.raised,              '—'],
      'Expired':  [T.red,   'rgba(220,38,38,.08)', '⚠'],
    };
    const [c, bg, icon] = map[status] || [T.text3, T.raised, '—'];
    return _pill(icon + ' ' + (status || 'None'), c, bg);
  }

  function _availPill(status) {
    if (status === 'Yes' || status === 'true') return _pill('● Available', T.green, 'rgba(5,150,105,.1)');
    return _pill('○ Unavailable', T.text3, T.raised);
  }

  function _transportIcon(mode) {
    const map = { 'Car': '🚗', 'Van': '🚐', 'Public Transport': '🚇', 'Bicycle': '🚲', 'Walking': '🚶' };
    return (map[mode] || '—') + ' ' + (mode || '—');
  }

  function _deployBadge(c) {
    const compliance = c.complianceStatus;
    const avail = c.currentlyAvailable;
    if (compliance === 'Ready' && (avail === 'Yes' || avail === 'true'))
      return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:rgba(5,150,105,.1);color:${T.green};border:1px solid rgba(5,150,105,.2)">✓ Ready</span>`;
    if (compliance === 'Pending' || compliance === 'Expiring')
      return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:rgba(217,119,6,.08);color:${T.amber};border:1px solid rgba(217,119,6,.2)">⏳ Pending</span>`;
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:${T.raised};color:${T.text3}">— Hold</span>`;
  }

  // ── AVATAR INITIALS ───────────────────────────────────────
  function _avatar(name, size) {
    size = size || 36;
    const initials = (name || 'CL').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const colors   = ['#0A9688','#0D9488','#059669','#7C3AED','#D97706','#0891B2'];
    const col      = colors[name.charCodeAt(0) % colors.length];
    return `<div style="width:${size}px;height:${size}px;border-radius:${size/2}px;background:${col};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size/2.8)}px;font-weight:700;color:#fff;flex-shrink:0;letter-spacing:.5px">${initials}</div>`;
  }

  // ── KPI CARDS ─────────────────────────────────────────────
  function _kpiCards() {
    const active         = _cleaners.filter(c => c.status === 'Active').length;
    const availToday     = _cleaners.filter(c => c.status === 'Active' && (c.currentlyAvailable === 'Yes' || c.currentlyAvailable === 'true')).length;
    const emergency      = _cleaners.filter(c => c.emergencyCover === 'Yes' || c.emergencyCover === 'true').length;
    const compReady      = _cleaners.filter(c => c.complianceStatus === 'Ready').length;
    const dbsChecked     = _cleaners.filter(c => c.dbsStatus === 'Enhanced' || c.dbsStatus === 'Basic').length;
    const drivers        = _cleaners.filter(c => c.hasOwnVehicle === 'Yes' || c.hasOwnVehicle === 'true').length;

    const card = (icon, label, val, sub, accent) =>
      `<div style="background:${T.surface};border:1px solid ${T.border};border-radius:14px;padding:20px 20px 16px;display:flex;flex-direction:column;gap:6px;box-shadow:0 1px 4px rgba(13,28,46,.05);min-width:0">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:18px">${icon}</span>
          <div style="width:6px;height:6px;border-radius:50%;background:${accent || T.teal}"></div>
        </div>
        <div style="font-size:28px;font-weight:800;color:${T.navy};letter-spacing:-.03em;line-height:1">${val}</div>
        <div style="font-size:12px;font-weight:600;color:${T.text2}">${label}</div>
        ${sub ? `<div style="font-size:11px;color:${T.text3};margin-top:2px">${sub}</div>` : ''}
      </div>`;

    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px;margin-bottom:24px">
      ${card('👥', 'Total Cleaners',    _cleaners.filter(c => c.status !== 'Archived').length, `${active} active`, T.teal)}
      ${card('✅', 'Active',            active,       `${Math.round((active/_cleaners.length||1)*100)}% of roster`, T.green)}
      ${card('🟢', 'Available Today',   availToday,   'Currently available', T.green)}
      ${card('⚡', 'Emergency Cover',   emergency,    'On-call available', T.amber)}
      ${card('🛡️', 'Compliance Ready',  compReady,    'Docs + DBS clear', T.teal)}
      ${card('🔒', 'DBS Checked',       dbsChecked,   'Basic or Enhanced', T.purple)}
      ${card('🚗', 'Own Vehicle',       drivers,      'Car or van owners', T.text2)}
    </div>`;
  }

  // ── TOOLBAR ───────────────────────────────────────────────
  function _toolbar() {
    const areas  = [...new Set(_cleaners.map(c => c.borough).filter(Boolean))].sort();
    const types  = ['Employee','Subcontractor','Agency','Trial'];
    const svcSet = new Set();
    _cleaners.forEach(c => (c.servicesOffered || '').split('|').forEach(s => { if (s.trim()) svcSet.add(s.trim()); }));
    const services = [...svcSet].sort();

    const sel = (id, label, opts, key) =>
      `<select id="clf-${id}" onchange="Cleaners._applyFilter('${key}',this.value)"
        style="height:36px;padding:0 10px;border:1px solid ${T.borderM};border-radius:8px;font-size:13px;color:${T.text1};background:${T.surface};cursor:pointer;min-width:120px">
        <option value="all">${label}</option>
        ${opts.map(o => `<option value="${o}" ${_filters[key]===o?'selected':''}>${o}</option>`).join('')}
      </select>`;

    const sortBtn = (val, label) =>
      `<button onclick="Cleaners._setSort('${val}')"
        style="padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${_sort===val?T.teal:T.borderM};background:${_sort===val?'rgba(10,150,136,.1)':'transparent'};color:${_sort===val?T.teal:T.text2}">${label}</button>`;

    return `
    <div style="background:${T.surface};border:1px solid ${T.border};border-radius:12px;padding:14px 16px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">

      <div style="position:relative;flex:1;min-width:220px">
        <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${T.text3}" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input id="clf-search" type="text" placeholder="Search name, phone, postcode, area…" value="${_search}"
          oninput="Cleaners._onSearch(this.value)"
          style="width:100%;height:36px;padding:0 10px 0 32px;border:1px solid ${T.borderM};border-radius:8px;font-size:13px;color:${T.text1};background:${T.surface}">
      </div>

      ${sel('status', 'All Status',       ['Active','Inactive','Archived','Trial'],          'status')}
      ${sel('type',   'All Types',         types,                                             'type')}
      ${sel('area',   'All Areas',         areas,                                             'area')}
      ${sel('svc',    'All Services',      services,                                          'service')}
      ${sel('avail',  'Availability',      ['Full-time','Part-time','Ad-hoc','Weekends','Evenings','Nights'], 'availability')}
      ${sel('comp',   'Compliance',        ['Ready','Pending','Expiring','Blocked'],          'compliance')}
      ${sel('dbs',    'DBS Status',        ['Enhanced','Basic','None','Expired'],             'dbs')}
      ${sel('trans',  'Transport',         ['Car','Van','Public Transport','Bicycle'],        'transport')}
      ${sel('emrg',   'Emergency',         ['Yes','No'],                                      'emergency')}

      <div style="display:flex;gap:6px;margin-left:auto;flex-wrap:wrap">
        ${sortBtn('fullName',       'Name')}
        ${sortBtn('lastWorkedDate', 'Last Worked')}
        ${sortBtn('performanceRating','Rating')}
        ${sortBtn('hourlyRate',     'Rate')}
      </div>

      <button onclick="Cleaners.openAdd()"
        style="height:36px;padding:0 16px;background:linear-gradient(135deg,${T.tealMid},${T.teal});color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(10,150,136,.25)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        Add Cleaner
      </button>
    </div>`;
  }

  // ── MAIN TABLE ────────────────────────────────────────────
  function _table() {
    const rows = _filtered.length ? _filtered.map(c => `
      <tr style="cursor:pointer;transition:background .15s" onmouseenter="this.style.background='rgba(10,150,136,.03)'" onmouseleave="this.style.background=''" onclick="Cleaners.openView('${c.id}')">
        <td style="padding:12px 16px">
          <div style="display:flex;align-items:center;gap:10px">
            ${_avatar(c.fullName)}
            <div>
              <div style="font-size:13px;font-weight:700;color:${T.navy}">${_esc(c.fullName)}</div>
              <div style="font-size:11px;color:${T.text3};margin-top:1px">${_esc(c.phone || '')} ${c.email ? '· '+_esc(c.email) : ''}</div>
            </div>
          </div>
        </td>
        <td style="padding:12px 8px"><span style="font-size:12px;color:${T.text2};font-weight:600">${_esc(c.cleanerType||'—')}</span></td>
        <td style="padding:12px 8px">
          <div style="font-size:12px;font-weight:600;color:${T.text1}">${_esc(c.borough||'—')}</div>
          <div style="font-size:11px;color:${T.text3}">${_esc(c.homePostcode||'')}</div>
        </td>
        <td style="padding:12px 8px;max-width:180px">
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${(c.servicesOffered||'').split('|').filter(Boolean).slice(0,3).map(s =>
              `<span style="padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;background:rgba(10,150,136,.08);color:${T.teal};border:1px solid rgba(10,150,136,.15)">${_esc(s.trim())}</span>`
            ).join('')}
          </div>
        </td>
        <td style="padding:12px 8px">
          <div style="font-size:12px;color:${T.text2}">${_esc(c.availabilityType||'—')}</div>
          ${_availPill(c.currentlyAvailable)}
        </td>
        <td style="padding:12px 8px">${_compliancePill(c.complianceStatus)}</td>
        <td style="padding:12px 8px">${_dbsPill(c.dbsStatus)}</td>
        <td style="padding:12px 8px;font-size:12px;color:${T.text2}">${_transportIcon(c.transportMode)}</td>
        <td style="padding:12px 8px">
          <div style="font-size:13px;font-weight:700;color:${T.navy}">£${parseFloat(c.hourlyRate||0).toFixed(2)}</div>
          <div style="font-size:10px;color:${T.text3}">per hour</div>
        </td>
        <td style="padding:12px 8px">${_statusPill(c.status)}</td>
        <td style="padding:12px 8px" onclick="event.stopPropagation()">
          <div style="display:flex;gap:4px">
            <button onclick="Cleaners.openView('${c.id}')" title="View" style="${_actBtn(T.teal)}">👁</button>
            <button onclick="Cleaners.openEdit('${c.id}')" title="Edit" style="${_actBtn(T.navy)}">✏️</button>
            <button onclick="Cleaners.toggleAvailable('${c.id}')" title="Toggle available" style="${_actBtn(T.amber)}">⚡</button>
            <button onclick="Cleaners.archive('${c.id}')" title="Archive" style="${_actBtn(T.text3)}">📦</button>
          </div>
        </td>
      </tr>`).join('') :
      `<tr><td colspan="11" style="text-align:center;padding:48px;color:${T.text3};font-size:14px">
        No cleaners match your current filters.<br>
        <span style="font-size:12px">Try adjusting the search or filter criteria above.</span>
      </td></tr>`;

    return `
    <div style="background:${T.surface};border:1px solid ${T.border};border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(13,28,46,.05)">
      <div style="padding:14px 20px;border-bottom:1px solid ${T.border};display:flex;align-items:center;justify-content:space-between">
        <div>
          <span style="font-size:14px;font-weight:700;color:${T.navy}">Cleaner Roster</span>
          <span style="margin-left:8px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(10,150,136,.1);color:${T.teal}">${_filtered.length} shown</span>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="Cleaners._exportCSV()" style="${_ghostBtn()}">⬇ Export CSV</button>
          <button onclick="Cleaners._bulkArchive()" style="${_ghostBtn()}">📦 Bulk Archive</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;min-width:900px">
          <thead>
            <tr style="background:${T.raised}">
              ${['Cleaner','Type','Area','Services','Availability','Compliance','DBS','Transport','Rate','Status','Actions'].map(h =>
                `<th style="padding:10px ${h==='Cleaner'?'16px':'8px'};text-align:left;font-size:11px;font-weight:700;color:${T.text3};letter-spacing:.5px;text-transform:uppercase;white-space:nowrap">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody id="cleaners-tbody">${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  function _actBtn(col) {
    return `width:28px;height:28px;border-radius:6px;border:1px solid ${T.border};background:${T.surface};cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;transition:background .15s;`;
  }

  function _ghostBtn() {
    return `padding:6px 12px;border-radius:7px;border:1px solid ${T.borderM};background:transparent;color:${T.text2};font-size:12px;font-weight:600;cursor:pointer`;
  }

  // ── MAIN RENDER ───────────────────────────────────────────
  async function render() {
    const app = document.getElementById('main-content');
    if (!app) return;

    // Render shell immediately
    app.innerHTML = _shell('Loading workforce data…');

    // Load data
    try { _cleaners = await API.get('cleaners'); } catch(e) { _cleaners = _seed(); }
    if (!Array.isArray(_cleaners)) _cleaners = _seed();

    _applyFiltersAndSort();
    app.innerHTML = _shell();

    // Background refresh
    API.get('cleaners', {}, { forceRefresh: false }).then(fresh => {
      if (Array.isArray(fresh) && JSON.stringify(fresh) !== JSON.stringify(_cleaners)) {
        _cleaners = fresh;
        _applyFiltersAndSort();
        _patchTable();
        _patchKPIs();
      }
    }).catch(() => {});
  }

  function _shell(loading) {
    if (loading) return `<div style="padding:40px;color:${T.text3};font-size:14px">${loading}</div>`;
    return `
    <div style="padding:28px 32px;max-width:1600px">

      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${T.teal};margin-bottom:6px">Workforce</div>
          <h1 style="font-size:26px;font-weight:800;color:${T.navy};letter-spacing:-.03em;margin-bottom:4px">Cleaner Database</h1>
          <p style="font-size:14px;color:${T.text2}">Manage cleaners, subcontractors, availability, compliance and deployment readiness.</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button onclick="Cleaners._setupSheet()"
            style="padding:8px 14px;border-radius:8px;border:1px solid ${T.borderM};background:${T.surface};color:${T.text2};font-size:12px;font-weight:600;cursor:pointer">
            🔧 Setup Sheet
          </button>
          <button onclick="Cleaners.openAdd()"
            style="padding:10px 20px;background:linear-gradient(135deg,${T.tealMid},${T.teal});color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px;box-shadow:0 3px 12px rgba(10,150,136,.3)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Add Cleaner
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div id="cleaners-kpis">${_kpiCards()}</div>

      <!-- Toolbar -->
      ${_toolbar()}

      <!-- Table -->
      <div id="cleaners-table">${_table()}</div>

    </div>

    <!-- Side drawer -->
    <div id="cleaners-drawer-overlay" onclick="Cleaners.closeDrawer()"
      style="display:none;position:fixed;inset:0;background:rgba(13,28,46,.35);z-index:900;backdrop-filter:blur(2px)"></div>
    <div id="cleaners-drawer"
      style="display:none;position:fixed;top:0;right:0;bottom:0;width:560px;max-width:100vw;background:${T.surface};z-index:901;overflow-y:auto;box-shadow:-8px 0 40px rgba(13,28,46,.12);transition:transform .3s cubic-bezier(.25,.46,.45,.94)">
    </div>`;
  }

  function _patchTable() {
    const tbody = document.getElementById('cleaners-tbody');
    if (!tbody) return;
    const rows = _filtered.length ? _filtered.map(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="11">loading</td>`;
      return tr;
    }) : null;
    // Re-render full table section for simplicity
    const tbl = document.getElementById('cleaners-table');
    if (tbl) tbl.innerHTML = _table();
  }

  function _patchKPIs() {
    const el = document.getElementById('cleaners-kpis');
    if (el) el.innerHTML = _kpiCards();
  }

  // ── FILTERS + SORT ────────────────────────────────────────
  function _applyFiltersAndSort() {
    let list = [..._cleaners];

    // Search
    if (_search) {
      const q = _search.toLowerCase();
      list = list.filter(c =>
        (c.fullName||'').toLowerCase().includes(q) ||
        (c.phone||'').includes(q) ||
        (c.email||'').toLowerCase().includes(q) ||
        (c.homePostcode||'').toLowerCase().includes(q) ||
        (c.borough||'').toLowerCase().includes(q) ||
        (c.areasCovered||'').toLowerCase().includes(q)
      );
    }

    // Filters
    if (_filters.status     !== 'all') list = list.filter(c => c.status           === _filters.status);
    if (_filters.type       !== 'all') list = list.filter(c => c.cleanerType      === _filters.type);
    if (_filters.area       !== 'all') list = list.filter(c => c.borough          === _filters.area);
    if (_filters.service    !== 'all') list = list.filter(c => (c.servicesOffered||'').includes(_filters.service));
    if (_filters.availability !== 'all') list = list.filter(c => c.availabilityType === _filters.availability);
    if (_filters.compliance !== 'all') list = list.filter(c => c.complianceStatus === _filters.compliance);
    if (_filters.dbs        !== 'all') list = list.filter(c => c.dbsStatus        === _filters.dbs);
    if (_filters.transport  !== 'all') list = list.filter(c => c.transportMode    === _filters.transport);
    if (_filters.emergency  !== 'all') {
      const val = _filters.emergency === 'Yes' ? 'Yes' : 'No';
      list = list.filter(c => (c.emergencyCover === val) || (val === 'Yes' && c.emergencyCover === 'true'));
    }

    // Sort
    list.sort((a, b) => {
      if (_sort === 'fullName')         return (a.fullName||'').localeCompare(b.fullName||'');
      if (_sort === 'lastWorkedDate')   return (b.lastWorkedDate||'') > (a.lastWorkedDate||'') ? 1 : -1;
      if (_sort === 'performanceRating') return parseFloat(b.performanceRating||0) - parseFloat(a.performanceRating||0);
      if (_sort === 'hourlyRate')       return parseFloat(a.hourlyRate||0) - parseFloat(b.hourlyRate||0);
      return 0;
    });

    _filtered = list;
  }

  function _onSearch(val) {
    _search = val;
    _applyFiltersAndSort();
    _patchTable();
    _patchKPIs();
  }

  function _applyFilter(key, val) {
    _filters[key] = val;
    _applyFiltersAndSort();
    const tbl = document.getElementById('cleaners-table');
    if (tbl) tbl.innerHTML = _table();
  }

  function _setSort(val) {
    _sort = val;
    _applyFiltersAndSort();
    const tbl = document.getElementById('cleaners-table');
    if (tbl) tbl.innerHTML = _table();
    // Rerender toolbar sort buttons
    const tb = document.querySelector('#cleaners-table')?.previousElementSibling?.previousElementSibling;
    // simpler: just re-render whole shell on sort (data already loaded)
    const app = document.getElementById('main-content');
    if (app) app.innerHTML = _shell();
  }

  // ── DRAWER HELPERS ────────────────────────────────────────
  function _openDrawer(html) {
    const overlay = document.getElementById('cleaners-drawer-overlay');
    const drawer  = document.getElementById('cleaners-drawer');
    if (!overlay || !drawer) return;
    drawer.innerHTML = html;
    overlay.style.display = 'block';
    drawer.style.display  = 'block';
    requestAnimationFrame(() => { drawer.style.transform = 'translateX(0)'; });
  }

  function closeDrawer() {
    const overlay = document.getElementById('cleaners-drawer-overlay');
    const drawer  = document.getElementById('cleaners-drawer');
    if (overlay) overlay.style.display = 'none';
    if (drawer)  drawer.style.display  = 'none';
    _activeDrawer = null;
    _editTarget   = null;
  }

  // ── DRAWER HEADER ─────────────────────────────────────────
  function _drawerHd(title, sub) {
    return `
    <div style="padding:24px 24px 0;border-bottom:1px solid ${T.border};padding-bottom:18px;margin-bottom:0">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${T.teal};margin-bottom:4px">Workforce</div>
          <h2 style="font-size:20px;font-weight:800;color:${T.navy};letter-spacing:-.02em">${title}</h2>
          ${sub ? `<p style="font-size:13px;color:${T.text2};margin-top:3px">${sub}</p>` : ''}
        </div>
        <button onclick="Cleaners.closeDrawer()"
          style="width:32px;height:32px;border-radius:8px;border:1px solid ${T.borderM};background:${T.surface};color:${T.text2};cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
    </div>`;
  }

  // ── SECTION LABEL ─────────────────────────────────────────
  function _secLabel(label) {
    return `<div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${T.teal};padding:20px 24px 8px;border-top:1px solid ${T.border};margin-top:8px">${label}</div>`;
  }

  // ── FORM FIELD HELPERS ────────────────────────────────────
  function _fi(id, label, ph, val, type) {
    type = type || 'text';
    return `<div style="display:flex;flex-direction:column;gap:5px">
      <label style="font-size:12px;font-weight:600;color:${T.text2}">${label}</label>
      <input type="${type}" id="cln-${id}" placeholder="${ph}" value="${_esc(val||'')}"
        style="height:36px;padding:0 10px;border:1px solid ${T.borderM};border-radius:8px;font-size:13px;color:${T.text1};background:${T.surface};outline:none"
        onfocus="this.style.borderColor='${T.teal}'" onblur="this.style.borderColor='${T.borderM}'">
    </div>`;
  }

  function _fsel(id, label, opts, val) {
    return `<div style="display:flex;flex-direction:column;gap:5px">
      <label style="font-size:12px;font-weight:600;color:${T.text2}">${label}</label>
      <select id="cln-${id}"
        style="height:36px;padding:0 10px;border:1px solid ${T.borderM};border-radius:8px;font-size:13px;color:${T.text1};background:${T.surface}">
        ${opts.map(o => {
          const [v, l] = Array.isArray(o) ? o : [o, o];
          return `<option value="${v}" ${val===v?'selected':''}>${l}</option>`;
        }).join('')}
      </select>
    </div>`;
  }

  function _fta(id, label, ph, val) {
    return `<div style="display:flex;flex-direction:column;gap:5px">
      <label style="font-size:12px;font-weight:600;color:${T.text2}">${label}</label>
      <textarea id="cln-${id}" placeholder="${ph}" rows="3"
        style="padding:8px 10px;border:1px solid ${T.borderM};border-radius:8px;font-size:13px;color:${T.text1};background:${T.surface};resize:vertical;font-family:inherit"
        onfocus="this.style.borderColor='${T.teal}'" onblur="this.style.borderColor='${T.borderM}'">${_esc(val||'')}</textarea>
    </div>`;
  }

  function _frow(...fields) {
    return `<div style="display:grid;grid-template-columns:${fields.map(()=>'1fr').join(' ')};gap:12px;padding:0 24px;margin-bottom:12px">${fields.join('')}</div>`;
  }

  function _fcb(id, label, val) {
    return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:${T.text1}">
      <input type="checkbox" id="cln-${id}" ${val==='Yes'||val==='true'?'checked':''} style="width:15px;height:15px;accent-color:${T.teal}">
      ${label}
    </label>`;
  }

  // ── ADD / EDIT FORM ───────────────────────────────────────
  function openAdd() {
    _activeDrawer = 'add';
    _editTarget   = null;
    _openDrawer(_formDrawer(null));
  }

  function openEdit(id) {
    _activeDrawer = 'edit';
    _editTarget   = _cleaners.find(c => c.id === id) || null;
    _openDrawer(_formDrawer(_editTarget));
  }

  function _formDrawer(c) {
    const v = f => (c && c[f]) ? c[f] : '';
    const isEdit = !!c;

    return `
    ${_drawerHd(isEdit ? 'Edit Cleaner' : 'Add Cleaner', isEdit ? v('fullName') : 'New workforce record')}
    <div style="padding-bottom:80px">

      ${_secLabel('Personal Details')}
      ${_frow(_fi('firstName',  'First Name',     'e.g. Maria',                v('firstName')),
              _fi('lastName',   'Last Name',      'e.g. Santos',               v('lastName')))}
      ${_frow(_fi('phone',      'Phone',          'e.g. 07911 123456',         v('phone')),
              _fi('email',      'Email',          'e.g. maria@email.com',      v('email'), 'email'))}
      ${_frow(
        _fsel('status', 'Status', ['Active','Inactive','Trial','Archived'], v('status') || 'Active'),
        _fsel('cleanerType', 'Cleaner Type', ['Employee','Subcontractor','Agency','Trial'], v('cleanerType') || 'Subcontractor')
      )}

      ${_secLabel('Location & Coverage')}
      ${_frow(_fi('homePostcode', 'Home Postcode', 'e.g. SW18 1AA', v('homePostcode')),
              _fi('borough',      'Borough / Area','e.g. Wandsworth', v('borough')))}
      ${_frow(_fi('maxTravelDistanceMiles','Max Travel (miles)','e.g. 10', v('maxTravelDistanceMiles'),'number'),
              _fi('areasCovered','Areas Covered','e.g. South West London|Wandsworth', v('areasCovered')))}

      ${_secLabel('Services & Experience')}
      <div style="padding:0 24px;margin-bottom:12px">
        <label style="font-size:12px;font-weight:600;color:${T.text2};display:block;margin-bottom:6px">Services Offered <span style="font-weight:400;color:${T.text3}">(pipe-separated)</span></label>
        <input id="cln-servicesOffered" type="text" value="${_esc(v('servicesOffered'))}"
          placeholder="Office Cleaning|Residential|Deep Clean|Medical|Automotive"
          style="width:100%;height:36px;padding:0 10px;border:1px solid ${T.borderM};border-radius:8px;font-size:13px;color:${T.text1};background:${T.surface}">
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
          ${['Office Cleaning','Residential','Deep Clean','Medical','Automotive','Educational','Communal'].map(s =>
            `<button type="button" onclick="Cleaners._toggleService('${s}')"
              style="padding:3px 9px;border-radius:5px;border:1px solid rgba(10,150,136,.2);background:rgba(10,150,136,.06);color:${T.teal};font-size:11px;font-weight:600;cursor:pointer">+${s}</button>`
          ).join('')}
        </div>
      </div>
      ${_frow(_fi('yearsExperience','Years Experience','e.g. 4', v('yearsExperience'),'number'),
              _fi('hourlyRate',    'Hourly Rate (£)',  'e.g. 14.50', v('hourlyRate'),'number'))}
      <div style="padding:0 24px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:14px">
        ${_fcb('commercialExperience',  'Commercial',  v('commercialExperience'))}
        ${_fcb('domesticExperience',    'Domestic',    v('domesticExperience'))}
        ${_fcb('medicalCleaningExperience', 'Medical', v('medicalCleaningExperience'))}
        ${_fcb('educationSectorExperience','Education',v('educationSectorExperience'))}
        ${_fcb('dealershipCleaningExperience','Automotive',v('dealershipCleaningExperience'))}
        ${_fcb('communalCleaningExperience','Communal', v('communalCleaningExperience'))}
      </div>

      ${_secLabel('Availability')}
      ${_frow(
        _fsel('availabilityType','Availability Type',['Full-time','Part-time','Ad-hoc','Weekends','Evenings','Nights'], v('availabilityType')||'Full-time'),
        _fsel('currentlyAvailable','Currently Available',['Yes','No'], v('currentlyAvailable')||'Yes')
      )}
      ${_frow(_fi('availableDays','Available Days','e.g. Mon–Fri', v('availableDays')),
              _fi('startDateAvailable','Start Date','e.g. 2026-03-01', v('startDateAvailable')))}
      ${_frow(_fi('availableStartTime','Start Time','e.g. 06:00', v('availableStartTime')),
              _fi('availableEndTime',  'End Time',  'e.g. 22:00', v('availableEndTime')))}
      <div style="padding:0 24px;margin-bottom:12px">
        ${_fcb('emergencyCover','Available for emergency cover (short notice)', v('emergencyCover'))}
      </div>

      ${_secLabel('Compliance')}
      ${_frow(
        _fsel('dbsStatus','DBS Status',['None','Basic','Enhanced','Expired'], v('dbsStatus')||'None'),
        _fsel('complianceStatus','Compliance Status',['Ready','Pending','Expiring','Blocked'], v('complianceStatus')||'Pending')
      )}
      <div style="padding:0 24px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:14px">
        ${_fcb('rightToWorkChecked','Right to Work Checked', v('rightToWorkChecked'))}
        ${_fcb('referencesChecked', 'References Checked',   v('referencesChecked'))}
        ${_fcb('hasInsurance',      'Has Own Insurance',     v('hasInsurance'))}
      </div>

      ${_secLabel('Transport')}
      ${_frow(
        _fsel('transportMode','Transport Mode',['Car','Van','Public Transport','Bicycle','Walking'], v('transportMode')||'Public Transport'),
        _fsel('payrollType','Payroll Type',['Self-employed','PAYE','Agency'], v('payrollType')||'Self-employed')
      )}
      <div style="padding:0 24px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:14px">
        ${_fcb('hasDrivingLicence','Has Driving Licence', v('hasDrivingLicence'))}
        ${_fcb('hasOwnVehicle',    'Has Own Vehicle',     v('hasOwnVehicle'))}
        ${_fcb('invoiceRequired',  'Invoice Required',    v('invoiceRequired'))}
      </div>

      ${_secLabel('Notes & Tags')}
      <div style="padding:0 24px;margin-bottom:12px">
        ${_fta('notes','Internal Notes','Any relevant context, special requirements, notes from previous jobs…', v('notes'))}
      </div>
      ${_frow(_fi('tags','Tags','e.g. reliable|night-shift|driver', v('tags')),
              _fi('source','Source','e.g. Referral, Indeed', v('source')))}
      ${_frow(_fi('uniformSize','Uniform Size','e.g. M', v('uniformSize')),
              _fi('preferredMinimumShiftHours','Min Shift Hours','e.g. 3', v('preferredMinimumShiftHours'),'number'))}

    </div>

    <!-- Sticky footer -->
    <div style="position:sticky;bottom:0;background:${T.surface};border-top:1px solid ${T.border};padding:14px 24px;display:flex;gap:10px;justify-content:flex-end">
      <button onclick="Cleaners.closeDrawer()"
        style="padding:9px 18px;border-radius:8px;border:1px solid ${T.borderM};background:transparent;color:${T.text2};font-size:13px;font-weight:600;cursor:pointer">Cancel</button>
      <button onclick="Cleaners.${isEdit?'saveEdit':'saveAdd'}('${isEdit?c.id:''}')"
        style="padding:9px 22px;border-radius:8px;background:linear-gradient(135deg,${T.tealMid},${T.teal});color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(10,150,136,.25)">
        ${isEdit?'Save Changes':'Add Cleaner'}
      </button>
    </div>`;
  }

  // ── COLLECT FORM DATA ─────────────────────────────────────
  function _collectForm() {
    const gv  = id => { const el = document.getElementById('cln-' + id); return el ? el.value.trim() : ''; };
    const gcb = id => { const el = document.getElementById('cln-' + id); return el && el.checked ? 'Yes' : 'No'; };
    const first = gv('firstName'), last = gv('lastName');
    return {
      firstName:                    first,
      lastName:                     last,
      fullName:                     (first + ' ' + last).trim(),
      phone:                        gv('phone'),
      email:                        gv('email'),
      status:                       gv('status'),
      cleanerType:                  gv('cleanerType'),
      homePostcode:                 gv('homePostcode'),
      borough:                      gv('borough'),
      maxTravelDistanceMiles:       gv('maxTravelDistanceMiles'),
      areasCovered:                 gv('areasCovered'),
      servicesOffered:              gv('servicesOffered'),
      yearsExperience:              gv('yearsExperience'),
      hourlyRate:                   gv('hourlyRate'),
      commercialExperience:         gcb('commercialExperience'),
      domesticExperience:           gcb('domesticExperience'),
      medicalCleaningExperience:    gcb('medicalCleaningExperience'),
      educationSectorExperience:    gcb('educationSectorExperience'),
      dealershipCleaningExperience: gcb('dealershipCleaningExperience'),
      communalCleaningExperience:   gcb('communalCleaningExperience'),
      availabilityType:             gv('availabilityType'),
      currentlyAvailable:           gv('currentlyAvailable'),
      availableDays:                gv('availableDays'),
      startDateAvailable:           gv('startDateAvailable'),
      availableStartTime:           gv('availableStartTime'),
      availableEndTime:             gv('availableEndTime'),
      emergencyCover:               gcb('emergencyCover'),
      dbsStatus:                    gv('dbsStatus'),
      complianceStatus:             gv('complianceStatus'),
      rightToWorkChecked:           gcb('rightToWorkChecked'),
      referencesChecked:            gcb('referencesChecked'),
      hasInsurance:                 gcb('hasInsurance'),
      transportMode:                gv('transportMode'),
      hasDrivingLicence:            gcb('hasDrivingLicence'),
      hasOwnVehicle:                gcb('hasOwnVehicle'),
      payrollType:                  gv('payrollType'),
      invoiceRequired:              gcb('invoiceRequired'),
      notes:                        gv('notes'),
      tags:                         gv('tags'),
      source:                       gv('source'),
      uniformSize:                  gv('uniformSize'),
      preferredMinimumShiftHours:   gv('preferredMinimumShiftHours'),
    };
  }

  // ── SAVE ADD ──────────────────────────────────────────────
  async function saveAdd() {
    const data = _collectForm();
    if (!data.fullName || data.fullName === ' ') { UI.toast('First name required', 'e'); return; }
    const btn = document.querySelector('#cleaners-drawer button:last-child');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const res = await API.post('cleaner.create', data);
      if (res && res.ok) {
        UI.toast('Cleaner added ✓', 's');
        API.invalidate('cleaners');
        closeDrawer();
        await render();
      } else {
        throw new Error(res && res.error || 'Unknown error');
      }
    } catch(e) {
      UI.toast('Error: ' + e.message, 'e');
      if (btn) { btn.disabled = false; btn.textContent = 'Add Cleaner'; }
    }
  }

  // ── SAVE EDIT ─────────────────────────────────────────────
  async function saveEdit(id) {
    const data = _collectForm();
    data.id = id;
    const btn = document.querySelector('#cleaners-drawer button:last-child');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const res = await API.post('cleaner.update', data);
      if (res && res.ok) {
        UI.toast('Cleaner updated ✓', 's');
        API.invalidate('cleaners');
        closeDrawer();
        await render();
      } else {
        throw new Error(res && res.error || 'Unknown error');
      }
    } catch(e) {
      UI.toast('Error: ' + e.message, 'e');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  }

  // ── ARCHIVE ───────────────────────────────────────────────
  async function archive(id) {
    const c = _cleaners.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Archive ${c.fullName}? They will be removed from active rosters.`)) return;
    try {
      const res = await API.post('cleaner.archive', { id });
      if (res && res.ok) {
        UI.toast('Cleaner archived', 's');
        API.invalidate('cleaners');
        await render();
      } else throw new Error(res && res.error || 'Error');
    } catch(e) { UI.toast('Error: ' + e.message, 'e'); }
  }

  // ── TOGGLE AVAILABLE ──────────────────────────────────────
  async function toggleAvailable(id) {
    const c = _cleaners.find(x => x.id === id);
    if (!c) return;
    const newVal = (c.currentlyAvailable === 'Yes' || c.currentlyAvailable === 'true') ? 'No' : 'Yes';
    try {
      const res = await API.post('cleaner.update', { id, currentlyAvailable: newVal, updatedAt: new Date().toISOString() });
      if (res && res.ok) {
        UI.toast(`${c.fullName} marked ${newVal === 'Yes' ? 'available' : 'unavailable'}`, 's');
        API.invalidate('cleaners');
        await render();
      } else throw new Error(res && res.error || 'Error');
    } catch(e) { UI.toast('Error: ' + e.message, 'e'); }
  }

  // ── VIEW PROFILE DRAWER ───────────────────────────────────
  function openView(id) {
    const c = _cleaners.find(x => x.id === id);
    if (!c) return;
    _activeDrawer = 'view';
    _openDrawer(_profileDrawer(c));
  }

  function _profileDrawer(c) {
    const bool = v => v === 'Yes' || v === 'true';
    const yesNo = v => bool(v) ? `<span style="color:${T.green};font-weight:700">✓ Yes</span>` : `<span style="color:${T.text3}">— No</span>`;
    const row = (label, val) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${T.border};font-size:13px">
      <span style="color:${T.text2};font-weight:600">${label}</span>
      <span style="color:${T.navy};font-weight:600;text-align:right;max-width:60%">${val || '—'}</span>
    </div>`;

    const services = (c.servicesOffered || '').split('|').filter(Boolean);
    const tags     = (c.tags || '').split('|').filter(Boolean);

    return `
    ${_drawerHd('Cleaner Profile', c.id)}

    <!-- Profile summary card -->
    <div style="padding:20px 24px">
      <div style="display:flex;align-items:center;gap:16px;background:${T.raised};border-radius:12px;padding:16px">
        ${_avatar(c.fullName, 52)}
        <div style="flex:1;min-width:0">
          <div style="font-size:18px;font-weight:800;color:${T.navy};letter-spacing:-.02em">${_esc(c.fullName)}</div>
          <div style="font-size:13px;color:${T.text2};margin-top:2px">${_esc(c.cleanerType || '')} · ${_esc(c.borough || '')} ${_esc(c.homePostcode || '')}</div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            ${_statusPill(c.status)}
            ${_deployBadge(c)}
            ${bool(c.emergencyCover) ? _pill('⚡ Emergency Cover', T.amber, 'rgba(217,119,6,.1)') : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Snapshot bands -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:${T.border};margin:0 24px;border-radius:10px;overflow:hidden;margin-bottom:20px">
      ${[
        ['Compliance', _compliancePill(c.complianceStatus)],
        ['DBS', _dbsPill(c.dbsStatus)],
        ['Available', _availPill(c.currentlyAvailable)],
      ].map(([label, val]) =>
        `<div style="background:${T.surface};padding:12px;text-align:center">
          <div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${T.text3};margin-bottom:6px">${label}</div>
          ${val}
        </div>`
      ).join('')}
    </div>

    <!-- Contact -->
    <div style="padding:0 24px">
      ${row('Phone',       `<a href="tel:${c.phone}" style="color:${T.teal}">${_esc(c.phone)}</a>`)}
      ${row('Email',       `<a href="mailto:${c.email}" style="color:${T.teal}">${_esc(c.email)}</a>`)}
      ${row('Hourly Rate', c.hourlyRate ? `£${parseFloat(c.hourlyRate).toFixed(2)}/hr` : '—')}
      ${row('Payroll',     c.payrollType || '—')}
      ${row('Last Worked', c.lastWorkedDate || 'Not recorded')}
      ${c.performanceRating ? row('Performance', '⭐'.repeat(Math.round(c.performanceRating)) + ` (${c.performanceRating}/5)`) : ''}
    </div>

    <!-- Services -->
    <div style="padding:16px 24px 0">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${T.text3};margin-bottom:10px">Services</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${services.length ? services.map(s =>
          `<span style="padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;background:rgba(10,150,136,.08);color:${T.teal};border:1px solid rgba(10,150,136,.15)">${_esc(s.trim())}</span>`
        ).join('') : `<span style="color:${T.text3};font-size:13px">None recorded</span>`}
      </div>
    </div>

    <!-- Availability -->
    <div style="padding:16px 24px 0">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${T.text3};margin-bottom:10px">Availability</div>
      <div style="padding:0">
        ${row('Type',         c.availabilityType || '—')}
        ${row('Days',         c.availableDays || '—')}
        ${row('Hours',        (c.availableStartTime && c.availableEndTime) ? c.availableStartTime + ' – ' + c.availableEndTime : '—')}
        ${row('Emergency',    yesNo(c.emergencyCover))}
        ${row('Start Date',   c.startDateAvailable || '—')}
        ${row('Transport',    _transportIcon(c.transportMode))}
        ${row('Own Vehicle',  yesNo(c.hasOwnVehicle))}
      </div>
    </div>

    <!-- Compliance snapshot -->
    <div style="padding:16px 24px 0">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${T.text3};margin-bottom:10px">Compliance</div>
      <div>
        ${row('Right to Work', yesNo(c.rightToWorkChecked))}
        ${row('References',    yesNo(c.referencesChecked))}
        ${row('Insurance',     yesNo(c.hasInsurance))}
      </div>
    </div>

    <!-- Notes + Tags -->
    ${c.notes ? `<div style="padding:16px 24px 0">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${T.text3};margin-bottom:8px">Notes</div>
      <p style="font-size:13px;color:${T.text2};line-height:1.65;background:${T.raised};border-radius:8px;padding:12px">${_esc(c.notes)}</p>
    </div>` : ''}

    ${tags.length ? `<div style="padding:16px 24px 0">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${T.text3};margin-bottom:8px">Tags</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${tags.map(t => `<span style="padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${T.raised};color:${T.text2};border:1px solid ${T.border}">#${_esc(t.trim())}</span>`).join('')}
      </div>
    </div>` : ''}

    <!-- Actions -->
    <div style="padding:24px;display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
      <button onclick="Cleaners.openEdit('${c.id}')"
        style="flex:1;padding:10px;border-radius:8px;background:linear-gradient(135deg,${T.tealMid},${T.teal});color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer">
        ✏️ Edit Record
      </button>
      <button onclick="Cleaners.toggleAvailable('${c.id}')"
        style="padding:10px 16px;border-radius:8px;border:1px solid ${T.borderM};background:${T.surface};color:${T.text2};font-size:13px;font-weight:600;cursor:pointer">
        ⚡ Toggle Available
      </button>
      <button onclick="Cleaners.archive('${c.id}')"
        style="padding:10px 16px;border-radius:8px;border:1px solid rgba(220,38,38,.2);background:rgba(220,38,38,.04);color:${T.red};font-size:13px;font-weight:600;cursor:pointer">
        📦 Archive
      </button>
    </div>`;
  }

  // ── SERVICE TOGGLE HELPER ─────────────────────────────────
  function _toggleService(svc) {
    const el = document.getElementById('cln-servicesOffered');
    if (!el) return;
    const existing = el.value.split('|').map(s => s.trim()).filter(Boolean);
    const idx = existing.indexOf(svc);
    if (idx >= 0) existing.splice(idx, 1);
    else existing.push(svc);
    el.value = existing.join('|');
  }

  // ── EXPORT CSV ────────────────────────────────────────────
  function _exportCSV() {
    const cols = ['id','fullName','phone','email','borough','homePostcode','cleanerType','status','servicesOffered','availabilityType','currentlyAvailable','complianceStatus','dbsStatus','transportMode','hourlyRate','emergencyCover','notes'];
    const header = cols.join(',');
    const rows = _filtered.map(c => cols.map(k => '"' + (c[k]||'').replace(/"/g,'""') + '"').join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'askmiro-cleaners-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── BULK ARCHIVE ──────────────────────────────────────────
  async function _bulkArchive() {
    const inactive = _cleaners.filter(c => c.status === 'Inactive');
    if (!inactive.length) { UI.toast('No inactive cleaners to archive', 'w'); return; }
    if (!confirm(`Archive ${inactive.length} inactive cleaners?`)) return;
    try {
      await Promise.all(inactive.map(c => API.post('cleaner.archive', { id: c.id })));
      UI.toast(`${inactive.length} cleaners archived`, 's');
      API.invalidate('cleaners');
      await render();
    } catch(e) { UI.toast('Error: ' + e.message, 'e'); }
  }

  // ── SHEET SETUP HELPER ────────────────────────────────────
  async function _setupSheet() {
    if (!confirm('Run setupCleanersSheet() in Apps Script to create the Cleaners tab with correct headers?')) return;
    try {
      const res = await API.post('cleaner.setupSheet', {});
      UI.toast(res && res.ok ? 'Cleaners sheet created ✓' : (res && res.error || 'Error'), res && res.ok ? 's' : 'e');
    } catch(e) { UI.toast('Error: ' + e.message, 'e'); }
  }

  // ── ESCAPE HELPER ─────────────────────────────────────────
  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── SEED DATA (12 realistic London cleaners) ─────────────
  function _seed() {
    return [
      { id:'CLN-0001', fullName:'Maria Santos',     firstName:'Maria',    lastName:'Santos',    phone:'07911 234561', email:'maria.santos@email.com',     status:'Active',   cleanerType:'Subcontractor', homePostcode:'SW18 2QA', borough:'Wandsworth',          areasCovered:'SW London|Wandsworth|Clapham',               servicesOffered:'Office Cleaning|Residential|Deep Clean', yearsExperience:'6', commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No', communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Fri',   availableStartTime:'06:00', availableEndTime:'18:00', emergencyCover:'Yes', currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  payrollType:'Self-employed', invoiceRequired:'No',  hourlyRate:'13.50', preferredMinimumShiftHours:'3', performanceRating:'5', reliabilityRating:'5', notes:'Highly reliable. Preferred for office contracts in SW London.', tags:'reliable|sw-london|office', source:'Referral', createdAt:'2024-06-01', updatedAt:'2025-12-01', lastWorkedDate:'2026-03-10' },
      { id:'CLN-0002', fullName:'James Okafor',     firstName:'James',    lastName:'Okafor',    phone:'07922 345672', email:'james.okafor@email.com',     status:'Active',   cleanerType:'Employee',       homePostcode:'E1 6PX',  borough:'Tower Hamlets',       areasCovered:'East London|Tower Hamlets|Canary Wharf',     servicesOffered:'Office Cleaning|Communal|Medical',       yearsExperience:'8', commercialExperience:'Yes', domesticExperience:'No',  medicalCleaningExperience:'Yes', educationSectorExperience:'No',  dealershipCleaningExperience:'No', communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Sat',   availableStartTime:'05:00', availableEndTime:'14:00', emergencyCover:'Yes', currentlyAvailable:'Yes', transportMode:'Car',              hasDrivingLicence:'Yes', hasOwnVehicle:'Yes', payrollType:'PAYE',          invoiceRequired:'No',  hourlyRate:'14.50', preferredMinimumShiftHours:'4', performanceRating:'5', reliabilityRating:'5', notes:'Senior cleaner. Manages shift teams well. Medical training completed.', tags:'senior|driver|medical|east-london', source:'Direct Application', createdAt:'2024-03-15', updatedAt:'2026-01-10', lastWorkedDate:'2026-03-11' },
      { id:'CLN-0003', fullName:'Ana Lima',         firstName:'Ana',      lastName:'Lima',      phone:'07933 456783', email:'ana.lima@email.com',         status:'Active',   cleanerType:'Subcontractor', homePostcode:'N7 8EG',  borough:'Islington',           areasCovered:'North London|Islington|Holloway',            servicesOffered:'Residential|Deep Clean|End of Tenancy',  yearsExperience:'4', commercialExperience:'No',  domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No', communalCleaningExperience:'No',  dbsStatus:'Basic',    rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Part-time',  availableDays:'Mon–Wed,Fri', availableStartTime:'09:00', availableEndTime:'17:00', emergencyCover:'No',  currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  payrollType:'Self-employed', invoiceRequired:'Yes', hourlyRate:'13.00', preferredMinimumShiftHours:'2', performanceRating:'4', reliabilityRating:'4', notes:'Specialises in deep cleans and EOT. Self-invoices fortnightly.', tags:'eot|deep-clean|north-london', source:'Indeed', createdAt:'2024-09-01', updatedAt:'2025-11-20', lastWorkedDate:'2026-03-08' },
      { id:'CLN-0004', fullName:'Tomasz Kowalski',  firstName:'Tomasz',   lastName:'Kowalski',  phone:'07944 567894', email:'tomasz.k@email.com',         status:'Active',   cleanerType:'Subcontractor', homePostcode:'SE15 4AQ',borough:'Southwark',           areasCovered:'SE London|Southwark|Bermondsey|Peckham',     servicesOffered:'Office Cleaning|Communal|Automotive',    yearsExperience:'5', commercialExperience:'Yes', domesticExperience:'No',  medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'Yes','communalCleaningExperience':'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'Yes', complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Fri',   availableStartTime:'05:30', availableEndTime:'17:00', emergencyCover:'Yes', currentlyAvailable:'Yes', transportMode:'Van',              hasDrivingLicence:'Yes', hasOwnVehicle:'Yes', payrollType:'Self-employed', invoiceRequired:'Yes', hourlyRate:'15.00', preferredMinimumShiftHours:'4', performanceRating:'5', reliabilityRating:'5', notes:'Has own transit van. Excellent for dealership and communal block contracts.', tags:'van|driver|automotive|south-london', source:'Referral', createdAt:'2024-04-10', updatedAt:'2026-02-01', lastWorkedDate:'2026-03-11' },
      { id:'CLN-0005', fullName:'Blessing Osei',   firstName:'Blessing', lastName:'Osei',      phone:'07955 678905', email:'blessing.osei@email.com',    status:'Active',   cleanerType:'Agency',         homePostcode:'UB3 1ND', borough:'Hillingdon',          areasCovered:'West London|Hillingdon|Hayes|Uxbridge',      servicesOffered:'Office Cleaning|Residential',            yearsExperience:'2', commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No', communalCleaningExperience:'No',  dbsStatus:'Basic',    rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Pending', availabilityType:'Part-time',  availableDays:'Tue,Thu,Sat', availableStartTime:'08:00', availableEndTime:'16:00', emergencyCover:'No',  currentlyAvailable:'No',  transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  payrollType:'Agency',        invoiceRequired:'No',  hourlyRate:'12.50', preferredMinimumShiftHours:'3', performanceRating:'3', reliabilityRating:'3', notes:'Agency placement. References pending verification.', tags:'west-london|agency|pending', source:'Agency', createdAt:'2025-01-15', updatedAt:'2025-12-05', lastWorkedDate:'2026-02-28' },
      { id:'CLN-0006', fullName:'Iryna Petrenko',  firstName:'Iryna',    lastName:'Petrenko',  phone:'07966 789016', email:'iryna.p@email.com',          status:'Active',   cleanerType:'Subcontractor', homePostcode:'NW2 3BA', borough:'Brent',               areasCovered:'NW London|Brent|Kilburn|Wembley',            servicesOffered:'Residential|Deep Clean|Medical',         yearsExperience:'7', commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'Yes', educationSectorExperience:'No',  dealershipCleaningExperience:'No', communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Sat',   availableStartTime:'07:00', availableEndTime:'20:00', emergencyCover:'Yes', currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  payrollType:'Self-employed', invoiceRequired:'No',  hourlyRate:'14.00', preferredMinimumShiftHours:'3', performanceRating:'5', reliabilityRating:'5', notes:'Healthcare background. Highly recommended for clinic and medical facility cleans.', tags:'medical|nw-london|reliable', source:'Referral', createdAt:'2024-05-20', updatedAt:'2025-10-01', lastWorkedDate:'2026-03-09' },
      { id:'CLN-0007', fullName:'David Mensah',    firstName:'David',    lastName:'Mensah',    phone:'07977 890127', email:'david.mensah@email.com',     status:'Active',   cleanerType:'Employee',       homePostcode:'SE5 8DG', borough:'Camberwell',          areasCovered:'SE London|Camberwell|Brixton|Peckham',       servicesOffered:'Office Cleaning|Educational|Communal',   yearsExperience:'3', commercialExperience:'Yes', domesticExperience:'No',  medicalCleaningExperience:'No',  educationSectorExperience:'Yes', dealershipCleaningExperience:'No', communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Evenings',   availableDays:'Mon–Fri evenings', availableStartTime:'17:00', availableEndTime:'23:00', emergencyCover:'Yes', currentlyAvailable:'Yes', transportMode:'Bicycle',          hasDrivingLicence:'Yes', hasOwnVehicle:'No',  payrollType:'PAYE',          invoiceRequired:'No',  hourlyRate:'13.50', preferredMinimumShiftHours:'3', performanceRating:'4', reliabilityRating:'5', notes:'DBS Enhanced (schools). Evenings and school contract specialist.', tags:'schools|evenings|dbs-enhanced|south-london', source:'Direct Application', createdAt:'2025-02-01', updatedAt:'2026-01-20', lastWorkedDate:'2026-03-10' },
      { id:'CLN-0008', fullName:'Fatima Al-Rashid',firstName:'Fatima',   lastName:'Al-Rashid', phone:'07988 901238', email:'fatima.alr@email.com',       status:'Active',   cleanerType:'Subcontractor', homePostcode:'E3 4PZ',  borough:'Tower Hamlets',       areasCovered:'East London|Tower Hamlets|Bow|Bethnal Green', servicesOffered:'Residential|Office Cleaning|Deep Clean', yearsExperience:'5', commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No', communalCleaningExperience:'Yes', dbsStatus:'Basic',    rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Expiring', availabilityType:'Full-time',  availableDays:'Mon–Sat',   availableStartTime:'06:00', availableEndTime:'18:00', emergencyCover:'No',  currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  payrollType:'Self-employed', invoiceRequired:'No',  hourlyRate:'13.00', preferredMinimumShiftHours:'3', performanceRating:'4', reliabilityRating:'4', notes:'DBS expiring in 6 weeks — renewal requested. Otherwise fully compliant.', tags:'east-london|dbs-renewal-needed', source:'Indeed', createdAt:'2024-08-12', updatedAt:'2026-01-15', lastWorkedDate:'2026-03-07' },
      { id:'CLN-0009', fullName:'Patrick O\'Brien', firstName:'Patrick',  lastName:"O'Brien",   phone:'07999 012349', email:'patrick.ob@email.com',       status:'Inactive', cleanerType:'Subcontractor', homePostcode:'RM7 9AQ', borough:'Havering',            areasCovered:'East London|Havering|Romford',               servicesOffered:'Office Cleaning|Automotive',             yearsExperience:'4', commercialExperience:'Yes', domesticExperience:'No',  medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'Yes','communalCleaningExperience':'No',  dbsStatus:'Basic',    rightToWorkChecked:'Yes', referencesChecked:'No',  hasInsurance:'No',  complianceStatus:'Pending', availabilityType:'Weekends',   availableDays:'Sat,Sun',   availableStartTime:'07:00', availableEndTime:'17:00', emergencyCover:'No',  currentlyAvailable:'No',  transportMode:'Car',              hasDrivingLicence:'Yes', hasOwnVehicle:'Yes', payrollType:'Self-employed', invoiceRequired:'Yes', hourlyRate:'14.00', preferredMinimumShiftHours:'4', performanceRating:'3', reliabilityRating:'3', notes:'References not yet received. On hold pending compliance completion.', tags:'weekends|automotive|east-london|hold', source:'Indeed', createdAt:'2025-03-01', updatedAt:'2025-12-20', lastWorkedDate:'2025-11-15' },
      { id:'CLN-0010', fullName:'Grace Nkomo',     firstName:'Grace',    lastName:'Nkomo',     phone:'07900 123450', email:'grace.nkomo@email.com',      status:'Active',   cleanerType:'Subcontractor', homePostcode:'CR0 1NQ', borough:'Croydon',             areasCovered:'South London|Croydon|Sutton',                servicesOffered:'Residential|Deep Clean|Communal',        yearsExperience:'6', commercialExperience:'No',  domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No', communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Fri',   availableStartTime:'08:00', availableEndTime:'17:00', emergencyCover:'Yes', currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  payrollType:'Self-employed', invoiceRequired:'No',  hourlyRate:'13.50', preferredMinimumShiftHours:'3', performanceRating:'5', reliabilityRating:'5', notes:'Outstanding residential cleaner. Highest customer satisfaction scores.', tags:'croydon|reliable|residential|dbs-enhanced', source:'Referral', createdAt:'2024-07-10', updatedAt:'2026-02-15', lastWorkedDate:'2026-03-10' },
      { id:'CLN-0011', fullName:'Aleksander Wiśniewski', firstName:'Aleksander', lastName:'Wiśniewski', phone:'07911 234561', email:'aleksander.w@email.com', status:'Trial',   cleanerType:'Trial',         homePostcode:'W3 7QW',  borough:'Ealing',              areasCovered:'West London|Ealing|Acton|Chiswick',          servicesOffered:'Office Cleaning|Automotive|Deep Clean',  yearsExperience:'2', commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'Yes','communalCleaningExperience':'No',  dbsStatus:'None',     rightToWorkChecked:'Yes', referencesChecked:'No',  hasInsurance:'No',  complianceStatus:'Pending', availabilityType:'Full-time',  availableDays:'Mon–Fri',   availableStartTime:'06:00', availableEndTime:'20:00', emergencyCover:'No',  currentlyAvailable:'Yes', transportMode:'Car',              hasDrivingLicence:'Yes', hasOwnVehicle:'Yes', payrollType:'Self-employed', invoiceRequired:'No',  hourlyRate:'13.00', preferredMinimumShiftHours:'4', performanceRating:'',  reliabilityRating:'',  notes:'Currently on trial placement. DBS application submitted. References pending.', tags:'trial|west-london|driver|automotive', source:'Indeed', createdAt:'2026-02-15', updatedAt:'2026-03-01', lastWorkedDate:'2026-03-05' },
      { id:'CLN-0012', fullName:'Sandra Oduya',    firstName:'Sandra',   lastName:'Oduya',     phone:'07922 345672', email:'sandra.oduya@email.com',     status:'Active',   cleanerType:'Subcontractor', homePostcode:'N15 4PP', borough:'Haringey',            areasCovered:'North London|Haringey|Tottenham|Wood Green', servicesOffered:'Residential|Educational|Communal',       yearsExperience:'9', commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'Yes', dealershipCleaningExperience:'No', communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Ad-hoc',     availableDays:'Flexible',  availableStartTime:'07:00', availableEndTime:'21:00', emergencyCover:'Yes', currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  payrollType:'Self-employed', invoiceRequired:'No',  hourlyRate:'14.00', preferredMinimumShiftHours:'2', performanceRating:'5', reliabilityRating:'5', notes:'Most flexible on roster. Available same-day for cover. Excellent school sector experience.', tags:'flexible|schools|north-london|dbs-enhanced|emergency', source:'Referral', createdAt:'2023-11-01', updatedAt:'2026-01-05', lastWorkedDate:'2026-03-11' },
    ];
  }

  // ── BADGE COUNT FOR NAV ───────────────────────────────────
  function getBadge() {
    const pending = _cleaners.filter(c => c.complianceStatus === 'Expiring' || c.complianceStatus === 'Blocked').length;
    return pending > 0 ? pending : null;
  }

  // ── PUBLIC API ────────────────────────────────────────────
  return {
    render,
    closeDrawer,
    openAdd,
    openEdit,
    openView,
    saveAdd,
    saveEdit,
    archive,
    toggleAvailable,
    getBadge,
    // exposed for inline handlers
    _onSearch,
    _applyFilter,
    _setSort,
    _toggleService,
    _exportCSV,
    _bulkArchive,
    _setupSheet,
  };

})();
