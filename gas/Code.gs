// ============================================================
// AskMiro Ops — Google Apps Script Backend
// Version: 3.0  |  Performance Edition
// ============================================================
// SPEED CHANGES vs v2:
//   1. Two-level row cache: L1 in-memory + L2 CacheService (5min)
//      Sheet reads drop from every-request to once per 5 minutes
//   2. getSheet() caches the Spreadsheet object — no repeated openById
//   3. getDashboard uses Set for O(1) siteId lookups + single-pass math
//   4. getQuotes returns projected columns only (saves ~60% payload)
//   5. updateRow batches all cell writes in one setValues() call
//   6. authenticateRequest reads Users from L2 cache
//   7. All Gmail calls are the same — GAS can't batch those
// ============================================================
const CFG = {
  SHEET_ID:            '1_LahFSqmoiHggt36tgh3-XQEZMfv25GsTuPM4YUZv4Q',
  RATE_LIMIT_MAX:      60,
  CACHE_TTL_DASHBOARD: 600,   // 10 min dashboard cache
  CACHE_TTL_ROWS:      1800,  // 30 min sheet row cache (invalidated on writes)
  MIN_MARGIN_PCT:      20,
  LLW_RATE:            13.85,
  ONCOST_PCT:          0.22,
  SQ_FT_TO_M2:         0.0929,
  VERSION:             '3.1.0'
};
const SHEET_LEADS      = 'Leads';
const SHEET_QUOTES     = 'Quotes';
const SHEET_SETTINGS   = 'Intelligence_Settings';
const SHEET_BENCHMARKS = 'Intelligence_Benchmarks';
const SHEET_LEARNINGS  = 'Intelligence_Learnings';
const ROLES = ['Owner', 'OpsManager', 'Supervisor', 'Cleaner', 'Finance'];
// ── ENTRY POINTS ──────────────────────────────────────────────
function doGet(e) {
  const cb = e.parameter && e.parameter.callback;
  const body = (e.parameter && e.parameter._method === 'POST') ? parseBody(e) : null;
  var action = e.parameter && e.parameter.action;
if (action === 'cleaner.apply') return applyAsCleaner(e.parameter, cb);
  return jsonpResponse(handleRequest(e, body ? 'POST' : 'GET', body), cb);
}
function doPost(e) {
  return jsonResponse(handleRequest(e, 'POST', parseBody(e)));
}
function handleRequest(e, method, body) {
  try {
    const action = e.parameter && e.parameter.action;
    if (action === 'health')        return { ok: true, version: CFG.VERSION, ts: new Date().toISOString() };
    if (action === 'webhook.lead')   return webhookLead(e.parameter);
    if (action === 'webhook.upload') return webhookClientUpload(e.parameter);
    if (action === 'webhook.vapi')   return handleVapiWebhook(e);
    if (action === 'submitWebQuote') return handleWebQuoteSubmission(e.parameter);
    // Public form sends action:'lead' with no token — route to webhookLead
    if (action === 'lead' && method === 'GET' && !(e.parameter && e.parameter._token))
      return webhookLead(e.parameter);
    const auth = authenticateRequest(e);
    if (!auth.ok) return { error: auth.error };
    if (!checkRateLimit(auth.userId)) return { error: 'Rate limit exceeded' };
    return method === 'GET'
      ? routeGet(action, e.parameter, auth)
      : routePost(action, body, auth);
  } catch (err) {
    logError(err);
    return { error: err.message || 'Internal server error' };
  }
}
function jsonpResponse(data, cb) {
  const json = JSON.stringify(data);
  return cb
    ? ContentService.createTextOutput(cb + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
    : ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
// ── ROUTERS ───────────────────────────────────────────────────
function routeGet(action, params, auth) {
  switch (action) {
    case 'me':           return getMe(auth);
    case 'dashboard':    return getDashboard(params, auth);
    case 'leads':        return getLeads(params, auth);
    case 'lead':         return getLead(params.id, auth);
    case 'quotes':       return getQuotes(params, auth);
    case 'quote':        return getQuote(params.id, auth);
    case 'quote.intel':  return getQuoteIntel(params.id, auth);
    case 'contracts':    return getContracts(params, auth);
    case 'contract':     return getContract(params.id, auth);
    case 'jobs':         return getJobs(params, auth);
    case 'quality':      return getQuality(params, auth);
    case 'finance':      return getFinance(params, auth);
    case 'invoices':     return getInvoices(params, auth);
    case 'transactions': return getTransactions(params, auth);
    case 'finance.dashboard':    return getFinanceDashboard(params, auth);
    case 'finance.transactions': return getFinanceTransactions(params, auth);
    case 'finance.invoices':     return getFinanceInvoices(params, auth);
    case 'finance.expenses':     return getFinanceExpenses(params, auth);
    case 'finance.snapshots':    return getFinanceSnapshots(params, auth);
    case 'finance.settings':     return getFinanceSettings(params, auth);
    case 'finance.categories':   return getFinanceCategories(params, auth);
    case 'labour.entries':       return getLabourEntries(params, auth);
    case 'labour.workers':       return getLabourWorkers(params, auth);
    case 'settings':     return getSettings(auth);
    case 'sites':        return getSites(auth);
    case 'emails':       return getEmailLog(params, auth);
    case 'inbox':        return getInbox(params, auth);
    case 'email.thread': return getEmailThread(params, auth);
    case 'voice.calls':  return getVoiceCalls(params, auth);
    case 'voice.call':   return getVoiceCall(params.id, auth);
    case 'cleaners': return getCleaners(params, auth);
    case 'cleaner':  return getCleaner(params.id, auth);
    default:             return { error: 'Unknown action: ' + action };
  }
}
function routePost(action, body, auth) {
  switch (action) {
    case 'lead':              return saveLead(body, auth);
    case 'lead.stage':        return changeLeadStage(body, auth);
    case 'quote':             return saveQuote(body, auth);
    case 'quote.send':        return sendQuote(body, auth);
    case 'quote.approve':     return approveQuote(body, auth);
    case 'quote.intel.apply': return applyIntelToQuote(body, auth);
    case 'contract':          return saveContract(body, auth);
    case 'inspection':        return saveInspection(body, auth);
    case 'incident':          return saveIncident(body, auth);
    case 'incident.resolve':  return resolveIncident(body, auth);
    case 'job':               return saveJob(body, auth);
    case 'timesheet':         return saveTimesheet(body, auth);
    case 'invoice.generate':  return generateInvoice(body, auth);
    case 'invoice.send':      return sendInvoice(body, auth);
    case 'payment':           return savePayment(body, auth);
    case 'transaction.save':  return saveTransaction(body, auth);
    case 'task':              return saveTask(body, auth);
    case 'template':          return saveTemplate(body, auth);
    case 'user':              return saveUser(body, auth);
    case 'settings':          return saveSettings(body, auth);
    case 'email.send':        return sendCustomEmail(body, auth);
    case 'voice.callback':    return saveCallbackTask(body, auth);
    case 'voice.convert':     return convertCallToLead(body, auth);
    case 'cleaner.create':     return createCleaner(body, auth);
    case 'cleaner.update':     return updateCleaner(body, auth);
    case 'cleaner.archive':    return archiveCleaner(body, auth);
    case 'cleaner.delete':     return deleteCleaner(body, auth);
    case 'cleaner.setupSheet':             return setupCleanersSheet(auth);
    case 'finance.createTransaction':      return createFinanceTransaction(body, auth);
    case 'finance.updateTransaction':      return updateFinanceTransaction(body, auth);
    case 'finance.voidTransaction':        return voidFinanceTransaction(body, auth);
    case 'finance.createInvoice':          return createFinanceInvoice(body, auth);
    case 'finance.markInvoiceSent':        return markFinanceInvoiceSent(body, auth);
    case 'finance.recordPayment':          return recordFinancePayment(body, auth);
    case 'finance.createExpense':          return createFinanceExpense(body, auth);
    case 'finance.updateExpense':          return updateFinanceExpense(body, auth);
    case 'finance.generateRecurring':      return generateFinanceRecurring(body, auth);
    case 'finance.recalculateSnapshots':   return recalculateFinanceSnapshots(body, auth);
    case 'finance.assistant':              return financeAssistant(body, auth);
    case 'finance.setupSheets':            return setupFinanceSheets(body, auth);
    case 'labour.createEntry':             return createLabourEntry(body, auth);
    case 'labour.updateEntry':             return updateLabourEntry(body, auth);
    case 'labour.approvePayroll':          return approveLabourPayroll(body, auth);
    case 'labour.markPaid':                return markLabourPaid(body, auth);
    case 'labour.createWorker':            return createLabourWorker(body, auth);
    case 'labour.updateWorker':            return updateLabourWorker(body, auth);
    case 'labour.setupSheets':             return setupLabourSheets(body, auth);
    default:                               return { error: 'Unknown action: ' + action };
  }
}
// ── AUTH + RBAC ───────────────────────────────────────────────
function authenticateRequest(e) {
  const token = (e.parameter && e.parameter._token) || '';
  if (!token) return { ok: false, error: 'Missing token' };
  const users = getTableAsMap('Users', 'token');
  const user  = users[token];
  if (!user)                    return { ok: false, error: 'Invalid token' };
  if (user.status !== 'Active') return { ok: false, error: 'Account inactive' };
  return {
    ok: true,
    userId: user.id,
    email:  user.email,
    role:   user.role,
    name:   user.name,
    sites:  user.allowedSites ? user.allowedSites.split(',').map(s => s.trim()) : []
  };
}
function _formatTimeParam(val) {
  if (!val) return '';
  var s = String(val);
  if (s.indexOf('1899') !== -1 || s.indexOf('GMT') !== -1) {
    try {
      var d = new Date(s);
      if (!isNaN(d)) return ('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2);
    } catch(e) {}
    return '';
  }
  return s;
}
function requireRole(auth, minRole) {
  if (ROLES.indexOf(auth.role) > ROLES.indexOf(minRole))
    throw new Error('Insufficient permissions: requires ' + minRole);
}
function canAccessSite(auth, siteId) {
  if (['Owner','OpsManager','Finance'].includes(auth.role)) return true;
  return auth.sites.includes(siteId) || auth.sites.includes('all');
}
function filterBySite(rows, auth) {
  if (['Owner','OpsManager','Finance'].includes(auth.role)) return rows;
  return rows.filter(r => !r.siteId || canAccessSite(auth, r.siteId));
}
// ── RATE LIMITING ─────────────────────────────────────────────
function checkRateLimit(userId) {
  try {
    const cache = CacheService.getScriptCache();
    const key   = 'rl_' + userId;
    const val   = parseInt(cache.get(key) || '0');
    if (val >= CFG.RATE_LIMIT_MAX) return false;
    cache.put(key, String(val + 1), 60);
    return true;
  } catch(e) { return true; }
}
// ══════════════════════════════════════════════════════════════
// SHEET ACCESS — TWO-LEVEL CACHE
// L1: _memCache  — in-memory, lives for this GAS execution only
// L2: CacheService — survives across executions, 5 min TTL
// Net effect: sheet reads happen at most once per 5 minutes
// ══════════════════════════════════════════════════════════════
var _ss = null;           // cached Spreadsheet object
var _memCache = {};       // L1: { tabName: rows[] }
function getSheet() {
  if (!_ss) _ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  return _ss;
}
function getTab(name) {
  const tab = getSheet().getSheetByName(name);
  if (!tab) throw new Error('Tab not found: ' + name);
  return tab;
}
function getTableRows(tabName) {
  // L1 hit — free (same execution context)
  if (_memCache[tabName]) return _memCache[tabName];
  // L2 hit — ~10ms (survives across executions, 30min TTL)
  try {
    const raw = CacheService.getScriptCache().get('rows_' + tabName);
    if (raw) {
      // Support both gzip-compressed ('gz:') and plain JSON entries
      if (raw.startsWith('gz:')) {
        const bytes = Utilities.base64Decode(raw.slice(3));
        const text  = Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString();
        _memCache[tabName] = JSON.parse(text);
      } else {
        _memCache[tabName] = JSON.parse(raw);
      }
      return _memCache[tabName];
    }
  } catch(e) {}
  // Sheet read — slow path, now happens at most once per 30 min
  const tab  = getTab(tabName);
  const data = tab.getDataRange().getValues();
  if (data.length < 2) { _memCache[tabName] = []; return []; }
  const headers = data[0].map(h => String(h).trim());
  const rows = data.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : ''; });
      return obj;
    })
    .filter(r => r.id && r.id !== '');
  _memCache[tabName] = rows;
  // Write to L2 with gzip — handles sheets > 90KB (old plain-JSON limit)
  try {
    const json = JSON.stringify(rows);
    const blob = Utilities.newBlob(json, 'text/plain');
    const gz   = Utilities.gzip(blob);
    const b64  = Utilities.base64Encode(gz.getBytes());
    // CacheService max value size is 100KB — gzip typically cuts JSON by 70-80%
    CacheService.getScriptCache().put('rows_' + tabName, 'gz:' + b64, CFG.CACHE_TTL_ROWS);
  } catch(e) {
    // Fallback: store plain if gzip fails
    try {
      const json = JSON.stringify(rows);
      if (json.length < 90000)
        CacheService.getScriptCache().put('rows_' + tabName, json, CFG.CACHE_TTL_ROWS);
    } catch(e2) {}
  }
  return rows;
}
function invalidateCache(tabName) {
  delete _memCache[tabName];
  try { CacheService.getScriptCache().remove('rows_' + tabName); } catch(e) {}
}

// ── Keep-alive: prevents GAS cold starts ──────────────────────────────────
// Run installKeepAlive() ONCE from the editor to set up a 5-min trigger.
// This keeps the script warm so first-request latency drops from 2-4s to ~200ms.
function keepAlive() {
  // Lightweight ping — just opens the spreadsheet to keep the execution env warm
  try { SpreadsheetApp.openById(CFG.SHEET_ID); } catch(e) {}
  Logger.log('keepAlive: ' + new Date().toISOString());
}
function installKeepAlive() {
  // Remove any existing keepAlive triggers first (avoid duplicates)
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'keepAlive'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  // Fire every 5 minutes
  ScriptApp.newTrigger('keepAlive').timeBased().everyMinutes(5).create();
  Logger.log('✓ keepAlive trigger installed — cold starts eliminated');
}
function getTableAsMap(tabName, keyField) {
  const map = {};
  getTableRows(tabName).forEach(r => { if (r[keyField]) map[r[keyField]] = r; });
  return map;
}
function appendRow(tabName, obj) {
  const tab     = getTab(tabName);
  const headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0].map(h => String(h).trim());
  tab.appendRow(headers.map(h => obj[h] !== undefined ? obj[h] : ''));
  invalidateCache(tabName);
}
// Batched updateRow — writes all changed cells in one setValues call
function updateRow(tabName, id, updates) {
  const tab  = getTab(tabName);
  const data = tab.getDataRange().getValues();
  const hdrs = data[0].map(h => String(h).trim());
  const idCol = hdrs.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() !== id) continue;
    // Collect all columns that need changing, write in one batch
    const cols = Object.keys(updates)
      .map(k => ({ col: hdrs.indexOf(k), val: updates[k] }))
      .filter(c => c.col >= 0);
    if (cols.length === 0) return true;
    // Group contiguous columns where possible; for simplicity write individually
    // but at least we avoid reading the sheet a second time
    // Batch write: copy existing row, apply changes, write entire row in one call
    const rowData = data[i].map(v => v);
    cols.forEach(c => { rowData[c.col] = c.val; });
    tab.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
    invalidateCache(tabName);
    return true;
  }
  return false;
}
function getRowById(tabName, id) {
  return getTableRows(tabName).find(r => r.id === id) || null;
}
// ── IDs + AUDIT ───────────────────────────────────────────────
function genId(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}
function auditLog(userId, action, entityType, entityId, before, after) {
  try {
    appendRow('AuditLog', {
      id: genId('AUDIT'), ts: new Date().toISOString(),
      userId, action, entityType, entityId,
      before: before ? JSON.stringify(before) : '',
      after:  after  ? JSON.stringify(after)  : ''
    });
  } catch(e) {}
}
function logError(err) {
  try {
    appendRow('AuditLog', {
      id: genId('ERR'), ts: new Date().toISOString(),
      action: 'ERROR', entityType: 'system', entityId: '',
      before: '', after: err.message
    });
  } catch(_) {}
}
// ── SETTINGS ──────────────────────────────────────────────────
function getSettingsObj() {
  const obj = {};
  getTableRows('Settings').forEach(r => { obj[r.key] = r.value; });
  return obj;
}
function getSettings(auth) { requireRole(auth, 'Owner'); return getSettingsObj(); }
function saveSettings(body, auth) {
  requireRole(auth, 'Owner');
  const tab  = getTab('Settings');
  const data = tab.getDataRange().getValues();
  const hdrs = data[0].map(h => String(h).trim());
  const keyCol = hdrs.indexOf('key'), valCol = hdrs.indexOf('value');
  Object.keys(body).forEach(k => {
    if (k.startsWith('_')) return;
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][keyCol] === k) { tab.getRange(i + 1, valCol + 1).setValue(body[k]); found = true; break; }
    }
    if (!found) tab.appendRow([k, body[k], new Date().toISOString()]);
  });
  invalidateCache('Settings');
  auditLog(auth.userId, 'UPDATE', 'Settings', 'settings', null, body);
  return { ok: true };
}
// ── ME + SITES ────────────────────────────────────────────────
function getMe(auth) {
  return { userId: auth.userId, email: auth.email, role: auth.role, name: auth.name, sites: auth.sites };
}
function getSites(auth) { return filterBySite(getTableRows('Sites'), auth); }
// ── DASHBOARD ─────────────────────────────────────────────────
function getDashboard(params, auth) {
  const cacheKey = 'dash_' + auth.userId;
  try {
    const cached = CacheService.getScriptCache().get(cacheKey);
    if (cached && !params.refresh) return JSON.parse(cached);
  } catch(e) {}
  const sites   = filterBySite(getTableRows('Sites'), auth);
  const siteSet = new Set(sites.map(s => s.id));  // O(1) lookups
  const finance     = getTableRows('Finance').filter(r => siteSet.has(r.siteId));
  const inspections = getTableRows('Inspections').filter(r => siteSet.has(r.siteId));
  const incidents   = getTableRows('Incidents').filter(r => siteSet.has(r.siteId));
  const contracts   = getTableRows('Contracts').filter(r => siteSet.has(r.siteId));
  const invoices    = getTableRows('Invoices').filter(r => siteSet.has(r.siteId));
  // Single-pass aggregations
  let totalRevenue = 0, totalCost = 0, auditSum = 0;
  finance.forEach(r => { totalRevenue += parseFloat(r.revenue || 0); totalCost += parseFloat(r.directCost || 0); });
  inspections.forEach(r => { auditSum += parseFloat(r.score || 0); });
  const portfolioMargin = totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue * 100 : 0;
  const avgAudit        = inspections.length ? auditSum / inspections.length : 0;
  const openIncidents   = incidents.filter(r => r.status === 'Open').length;
  const outstanding     = invoices
    .filter(r => r.status === 'Sent' || r.status === 'Overdue')
    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  // Site attention map — single pass each
  const siteMap = {};
  sites.forEach(s => { siteMap[s.id] = Object.assign({}, s, { avgAudit: 0, openIncidents: 0, _scores: [] }); });
  inspections.forEach(r => {
    if (!siteMap[r.siteId]) return;
    siteMap[r.siteId]._scores.push(parseFloat(r.score || 0));
    const sc = siteMap[r.siteId]._scores;
    siteMap[r.siteId].avgAudit = sc.reduce((a, b) => a + b, 0) / sc.length;
  });
  incidents.filter(r => r.status === 'Open').forEach(r => {
    if (siteMap[r.siteId]) siteMap[r.siteId].openIncidents++;
  });
  const draftWebQuotes = getTableRows('Quotes')
    .filter(q => q.status === 'Draft' && q.source === 'web_form').length;
  const result = {
    kpis: {
      activeSites:      sites.filter(s => s.status === 'Active').length,
      totalRevenue,     totalCost,
      portfolioMargin:  Math.round(portfolioMargin * 10) / 10,
      avgAudit:         Math.round(avgAudit * 10) / 10,
      openIncidents,    outstandingInvoices: outstanding,
      activeContracts:  contracts.filter(c => c.status === 'Active').length,
      draftWebQuotes
    },
    attention:    Object.values(siteMap).filter(s => s.avgAudit < 85 || s.openIncidents > 0),
    recentFinance: finance.slice(-6),
    ts:           new Date().toISOString()
  };
  try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), CFG.CACHE_TTL_DASHBOARD); } catch(e) {}
  return result;
}
// ── LEADS ─────────────────────────────────────────────────────
function getLeads(params, auth) {
  requireRole(auth, 'OpsManager');
  return getTableRows('Leads');
}
function getLead(id, auth) {
  requireRole(auth, 'OpsManager');
  const lead = getRowById('Leads', id);
  if (!lead) throw new Error('Lead not found: ' + id);
  return lead;
}
function saveLead(body, auth) {
  requireRole(auth, 'OpsManager');
  validate(body, ['companyName', 'contactName', 'email'], 'Lead');
  const isNew  = !body.id;
  const before = isNew ? null : getRowById('Leads', body.id);
  if (isNew) {
    body.id        = genId('LEAD');
    body.status    = body.status || 'New';
    body.createdAt = new Date().toISOString();
    body.createdBy = auth.userId;
    appendRow('Leads', body);
  } else {
    body.updatedAt = new Date().toISOString();
    body.updatedBy = auth.userId;
    updateRow('Leads', body.id, body);
  }
  auditLog(auth.userId, isNew ? 'CREATE' : 'UPDATE', 'Lead', body.id, before, body);
  return { ok: true, id: body.id };
}
function changeLeadStage(body, auth) {
  requireRole(auth, 'OpsManager');
  validate(body, ['id', 'status'], 'LeadStage');
  const valid = ['New','Contacted','Qualified','QuoteSent','Negotiating','Won','Lost'];
  if (!valid.includes(body.status)) throw new Error('Invalid stage: ' + body.status);
  const before = getRowById('Leads', body.id);
  updateRow('Leads', body.id, { status: body.status, updatedAt: new Date().toISOString(), updatedBy: auth.userId });
  auditLog(auth.userId, 'STAGE_CHANGE', 'Lead', body.id, { status: before && before.status }, { status: body.status });
  return { ok: true };
}
// ── QUOTES ────────────────────────────────────────────────────
// getQuotes returns a projection — only columns the list view needs.
// Full row returned by getQuote(id) when modal opens.
function getQuotes(params, auth) {
  requireRole(auth, 'OpsManager');
  return getTableRows('Quotes').map(q => ({
    id:             q.id,
    version:        q.version,
    clientName:     q.clientName,
    siteAddress:    q.siteAddress,
    revenueMonthly: q.revenueMonthly,
    grossMarginPct: q.grossMarginPct,
    grossMarginGBP: q.grossMarginGBP,
    directCost:     q.directCost,
    status:         q.status,
    source:         q.source,
    createdAt:      q.createdAt,
    hoursPerWeek:   q.hoursPerWeek,
    notes:          q.notes,
    overrideReason: q.overrideReason,
    chosenScenario: q.chosenScenario,
    intel_hoursPerWeek:  q.intel_hoursPerWeek,
    intel_visitsPerWeek: q.intel_visitsPerWeek,
    intel_directCostPM:  q.intel_directCostPM,
    intel_riskCount:     q.intel_riskCount
  }));
}
function getQuote(id, auth) {
  requireRole(auth, 'OpsManager');
  const q = getRowById('Quotes', id);
  if (!q) throw new Error('Quote not found: ' + id);
  return q;
}
function calculateQuote(body) {
  const hrs      = parseFloat(body.hoursPerWeek  || 0);
  const wpm      = 52 / 12;
  const rate     = parseFloat(body.hourlyRate    || 0);
  const llw      = parseFloat(body.llwRate       || CFG.LLW_RATE);
  const oc       = parseFloat(body.oncostPct     || CFG.ONCOST_PCT);
  const supplies = parseFloat(body.suppliesCost  || 0);
  const other    = parseFloat(body.otherCosts    || 0);
  const fixed    = parseFloat(body.fixedMonthly  || 0);
  const labour   = hrs * wpm * llw * (1 + oc);
  const revenue  = fixed > 0 ? fixed : hrs * wpm * rate;
  const direct   = labour + supplies + other;
  const gm       = revenue - direct;
  const gmPct    = revenue > 0 ? gm / revenue * 100 : 0;
  return { labour, revenue, direct, gm, gmPct, annualValue: revenue * 12 };
}
function saveQuote(body, auth) {
  requireRole(auth, 'OpsManager');
  validate(body, ['clientName', 'siteAddress'], 'Quote');
  const calc      = calculateQuote(body);
  const settings  = getSettingsObj();
  const minMargin = parseFloat(settings.minMarginPct || CFG.MIN_MARGIN_PCT);
  const isNew     = !body.id;
  const before    = isNew ? null : getRowById('Quotes', body.id);
  if (isNew) {
    body.id        = genId('QUOTE');
    body.version   = 1;
    body.status    = 'Draft';
    body.createdAt = new Date().toISOString();
    body.createdBy = auth.userId;
  } else {
    body.version   = parseInt((before && before.version) || 1) + 1;
    body.updatedAt = new Date().toISOString();
    body.updatedBy = auth.userId;
  }
  Object.assign(body, {
    labourCost:     r2(calc.labour),
    directCost:     r2(calc.direct),
    revenueMonthly: r2(calc.revenue),
    grossMarginGBP: r2(calc.gm),
    grossMarginPct: r2(calc.gmPct),
    annualValue:    r2(calc.annualValue),
    minMarginPct:   minMargin,
    marginBlocked:  calc.gmPct < minMargin && !body.overrideReason ? 'true' : 'false'
  });
  if (isNew) appendRow('Quotes', body);
  else updateRow('Quotes', body.id, body);
  auditLog(auth.userId, isNew ? 'CREATE' : 'UPDATE', 'Quote', body.id, before, body);
  return { ok: true, id: body.id, calc, marginBlocked: body.marginBlocked === 'true' };
}
function sendQuote(body, auth) {
  requireRole(auth, 'OpsManager');
  validate(body, ['id', 'toEmail'], 'QuoteSend');
  const q        = getRowById('Quotes', body.id);
  if (!q) throw new Error('Quote not found');
  const settings  = getSettingsObj();
  const minMargin = parseFloat(settings.minMarginPct || CFG.MIN_MARGIN_PCT);
  if (parseFloat(q.grossMarginPct) < minMargin && !q.overrideReason)
    throw new Error('Cannot send: margin below ' + minMargin + '%. Add override reason first.');
  const subject = 'AskMiro Cleaning Proposal \u2014 ' + q.clientName;
  GmailApp.sendEmail(body.toEmail, subject, '', {
    from:     'office@askmiro.com',
    name:     settings.companyName || 'AskMiro Cleaning Services',
    htmlBody: buildQuoteEmail(q, settings),
    replyTo:  settings.emailFrom  || 'info@askmiro.com'
  });
  updateRow('Quotes', body.id, { status: 'Sent', sentAt: new Date().toISOString(), sentBy: auth.userId });
  _logEmail({ to: body.toEmail, subject, type: 'QuoteSend', relatedType: 'Quote', relatedId: body.id, sentBy: auth.userId, settings });
  auditLog(auth.userId, 'SEND', 'Quote', body.id, { status: q.status }, { status: 'Sent' });
  return { ok: true };
}
function approveQuote(body, auth) {
  requireRole(auth, 'Owner');
  validate(body, ['id'], 'QuoteApprove');
  const q = getRowById('Quotes', body.id);
  updateRow('Quotes', body.id, { status: 'Approved', approvedBy: auth.userId, approvedAt: new Date().toISOString(), overrideReason: body.overrideReason || '' });
  auditLog(auth.userId, 'APPROVE', 'Quote', body.id, { status: q && q.status }, { status: 'Approved' });
  return { ok: true };
}
// ── CONTRACTS ─────────────────────────────────────────────────
function getContracts(params, auth) {
  requireRole(auth, 'OpsManager');
  return filterBySite(getTableRows('Contracts'), auth);
}
function getContract(id, auth) {
  requireRole(auth, 'OpsManager');
  const c = getRowById('Contracts', id);
  if (!c) throw new Error('Contract not found');
  return c;
}
function saveContract(body, auth) {
  requireRole(auth, 'OpsManager');
  validate(body, ['quoteId', 'siteId', 'startDate'], 'Contract');
  const isNew = !body.id;
  if (isNew) {
    const q = getRowById('Quotes', body.quoteId);
    if (!q) throw new Error('Quote not found');
    body.id             = genId('CON');
    body.status         = 'PendingStart';
    body.revenueMonthly = q.revenueMonthly;
    body.annualValue    = q.annualValue;
    body.createdAt      = new Date().toISOString();
    body.createdBy      = auth.userId;
    appendRow('Contracts', body);
    updateRow('Quotes', body.quoteId, { status: 'Accepted' });
  } else {
    updateRow('Contracts', body.id, body);
  }
  auditLog(auth.userId, isNew ? 'CREATE' : 'UPDATE', 'Contract', body.id, null, body);
  return { ok: true, id: body.id };
}
// ── QUALITY ───────────────────────────────────────────────────
function getQuality(params, auth) {
  const siteIds = new Set(filterBySite(getTableRows('Sites'), auth).map(s => s.id));
  return {
    inspections: getTableRows('Inspections').filter(r => siteIds.has(r.siteId)),
    incidents:   getTableRows('Incidents').filter(r => siteIds.has(r.siteId))
  };
}
function saveInspection(body, auth) {
  requireRole(auth, 'Supervisor');
  validate(body, ['siteId', 'score'], 'Inspection');
  const isNew = !body.id;
  if (isNew) {
    body.id        = genId('INSP');
    body.date      = body.date || today();
    body.createdBy = auth.userId;
    body.createdAt = new Date().toISOString();
    appendRow('Inspections', body);
  } else { updateRow('Inspections', body.id, body); }
  auditLog(auth.userId, isNew ? 'CREATE' : 'UPDATE', 'Inspection', body.id, null, body);
  return { ok: true, id: body.id };
}
function saveIncident(body, auth) {
  requireRole(auth, 'Supervisor');
  validate(body, ['siteId', 'type', 'description'], 'Incident');
  const isNew = !body.id;
  if (isNew) {
    body.id        = genId('INC');
    body.status    = 'Open';
    body.date      = body.date || today();
    body.createdBy = auth.userId;
    body.createdAt = new Date().toISOString();
    appendRow('Incidents', body);
  } else { updateRow('Incidents', body.id, body); }
  auditLog(auth.userId, isNew ? 'CREATE' : 'UPDATE', 'Incident', body.id, null, body);
  return { ok: true, id: body.id };
}
function resolveIncident(body, auth) {
  requireRole(auth, 'Supervisor');
  validate(body, ['id', 'resolution'], 'IncidentResolve');
  updateRow('Incidents', body.id, { status: 'Resolved', resolution: body.resolution, resolvedBy: auth.userId, resolvedAt: new Date().toISOString() });
  auditLog(auth.userId, 'RESOLVE', 'Incident', body.id, { status: 'Open' }, { status: 'Resolved' });
  return { ok: true };
}
// ── JOBS ──────────────────────────────────────────────────────
function getJobs(params, auth) {
  let jobs = filterBySite(getTableRows('Jobs'), auth);
  if (params && params.from) jobs = jobs.filter(j => j.date >= params.from);
  if (params && params.to)   jobs = jobs.filter(j => j.date <= params.to);
  return jobs;
}
function saveJob(body, auth) {
  requireRole(auth, 'OpsManager');
  validate(body, ['siteId', 'date', 'startTime'], 'Job');
  const isNew = !body.id;
  if (isNew) {
    body.id        = genId('JOB');
    body.status    = 'Scheduled';
    body.createdBy = auth.userId;
    body.createdAt = new Date().toISOString();
    appendRow('Jobs', body);
  } else { updateRow('Jobs', body.id, body); }
  auditLog(auth.userId, isNew ? 'CREATE' : 'UPDATE', 'Job', body.id, null, body);
  return { ok: true, id: body.id };
}
function saveTimesheet(body, auth) {
  requireRole(auth, 'Cleaner');
  validate(body, ['jobId', 'clockIn'], 'Timesheet');
  const isNew = !body.id;
  if (isNew) { body.id = genId('TS'); body.createdBy = auth.userId; appendRow('Timesheets', body); }
  else updateRow('Timesheets', body.id, body);
  return { ok: true, id: body.id };
}
// ── FINANCE ───────────────────────────────────────────────────
function getFinance(params, auth) {
  requireRole(auth, 'Finance');
  let rows = filterBySite(getTableRows('Finance'), auth);
  if (params && params.month) rows = rows.filter(r => r.month === params.month);
  return rows;
}
function getInvoices(params, auth) {
  requireRole(auth, 'Finance');
  return filterBySite(getTableRows('Invoices'), auth);
}
function generateInvoice(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['siteId', 'month', 'amount'], 'Invoice');
  const id      = genId('INV');
  const invoice = Object.assign({ id, status: 'Draft', createdAt: new Date().toISOString(), createdBy: auth.userId, dueDate: body.dueDate || getDefaultDueDate() }, body);
  appendRow('Invoices', invoice);
  auditLog(auth.userId, 'CREATE', 'Invoice', id, null, invoice);
  return { ok: true, id };
}
function sendInvoice(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id', 'toEmail'], 'InvoiceSend');
  const inv = getRowById('Invoices', body.id);
  if (!inv) throw new Error('Invoice not found');
  const settings = getSettingsObj();
  const subject  = 'Invoice ' + inv.id + ' \u2014 AskMiro Cleaning Services';
  GmailApp.sendEmail(body.toEmail, subject, '', {
    from:     'office@askmiro.com',
    name:     settings.companyName || 'AskMiro Cleaning Services',
    htmlBody: buildInvoiceEmail(inv, settings),
    replyTo:  settings.emailFrom  || 'info@askmiro.com'
  });
  updateRow('Invoices', body.id, { status: 'Sent', sentAt: new Date().toISOString() });
  _logEmail({ to: body.toEmail, subject, type: 'InvoiceSend', relatedType: 'Invoice', relatedId: body.id, settings });
  return { ok: true };
}
function savePayment(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['invoiceId', 'amount', 'date'], 'Payment');
  const id = genId('PAY');
  appendRow('Payments', Object.assign({ id, createdAt: new Date().toISOString(), createdBy: auth.userId }, body));
  updateRow('Invoices', body.invoiceId, { status: 'Paid', paidAt: new Date().toISOString() });
  return { ok: true, id };
}
function getTransactions(params, auth) {
  requireRole(auth, 'Finance');
  var rows = getTableRows('Transactions');
  if (params && params.month) rows = rows.filter(function(r) { return r.month === params.month; });
  if (params && params.type)  rows = rows.filter(function(r) { return r.type  === params.type; });
  return rows;
}
function saveTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['date', 'type', 'category', 'amount', 'description'], 'Transaction');
  var id = genId('TXN');
  appendRow('Transactions', Object.assign({ id, createdAt: new Date().toISOString(), createdBy: auth.userId }, body));
  auditLog(auth.userId, 'CREATE', 'Transaction', id, null, body);
  return { ok: true, id: id };
}
// ── USERS ─────────────────────────────────────────────────────
function saveUser(body, auth) {
  requireRole(auth, 'Owner');
  validate(body, ['email', 'role', 'name'], 'User');
  const isNew = !body.id;
  if (isNew) {
    body.id        = genId('USER');
    body.token     = genToken();
    body.status    = 'Active';
    body.createdAt = new Date().toISOString();
    appendRow('Users', body);
  } else { updateRow('Users', body.id, body); }
  auditLog(auth.userId, isNew ? 'CREATE' : 'UPDATE', 'User', body.id, null, Object.assign({}, body, { token: '***' }));
  return { ok: true, id: body.id, token: isNew ? body.token : undefined };
}
// ── TASKS + TEMPLATES ─────────────────────────────────────────
function saveTask(body, auth) {
  validate(body, ['title'], 'Task');
  const isNew = !body.id;
  if (isNew) { body.id = genId('TASK'); body.status = 'Open'; body.createdAt = new Date().toISOString(); body.createdBy = auth.userId; appendRow('Tasks', body); }
  else updateRow('Tasks', body.id, body);
  return { ok: true, id: body.id };
}
function saveTemplate(body, auth) {
  requireRole(auth, 'OpsManager');
  const isNew = !body.id;
  if (isNew) { body.id = genId('TMPL'); appendRow('Templates', body); }
  else updateRow('Templates', body.id, body);
  return { ok: true, id: body.id };
}
// ── HELPERS ───────────────────────────────────────────────────
function validate(body, required, name) {
  const missing = required.filter(f => !body[f] || String(body[f]).trim() === '');
  if (missing.length) throw new Error(name + ': missing fields: ' + missing.join(', '));
}
function r2(n) { return Math.round(n * 100) / 100; }  // round to 2dp
function today() { return new Date().toISOString().slice(0, 10); }
function getDefaultDueDate() { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); }
function genToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = 'miro_';
  for (let i = 0; i < 40; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}
function parseBody(e) {
  try {
    if (e.parameter && e.parameter._body) return JSON.parse(e.parameter._body);
    if (e.postData  && e.postData.contents) return JSON.parse(e.postData.contents);
  } catch(_) {}
  return e.parameter || {};
}
function mapSegment(sector) {
  if (!sector) return '';
  const s = sector.toLowerCase();
  if (s.includes('healthcare') || s.includes('medical') || s.includes('dental') || s.includes('clinical')) return 'Healthcare';
  if (s.includes('school') || s.includes('education')) return 'School';
  if (s.includes('gym') || s.includes('leisure') || s.includes('sport')) return 'Gym';
  if (s.includes('warehouse') || s.includes('industrial') || s.includes('factory')) return 'Industrial';
  if (s.includes('oven') || s.includes('kitchen') || s.includes('restaurant') || s.includes('hospitality') || s.includes('commercial')) return 'Industrial';
  if (s.includes('automotive') || s.includes('dealership')) return 'Automotive';
  if (s.includes('residential') || s.includes('end of tenancy') || s.includes('airbnb') || s.includes('deep clean') || s.includes('one-off')) return 'Residential';
  if (s.includes('office')) return 'Office';
  return 'Office';
}
function buildNotes(p) {
  const parts = [];
  const svcType = p.serviceType || p.sector || '';
  if (svcType)              parts.push('Service: '      + svcType);
  if (p.frequency)          parts.push('Frequency: '    + p.frequency);
  if (p.postcode)           parts.push('Postcode: '     + p.postcode);
  if (p.premisesSize)       parts.push('Area: '         + p.premisesSize + (p.premisesSizeUnit || 'm²'));
  if (p.areaMq)             parts.push('Area: '         + p.areaMq);
  if (p.additionalServices) parts.push('Add-ons: '      + p.additionalServices);
  const req = p.message || p.additionalRequirements || p.requirements || '';
  if (req)                  parts.push('Requirements: ' + req);
  return parts.join(' | ');
}
// Shared email log writer — removes duplication from sendQuote/sendInvoice
function _logEmail(opts) {
  appendRow('EmailLog', {
    id:          genId('EMAIL'),
    ts:          new Date().toISOString(),
    from:        (opts.settings && opts.settings.emailFrom) || 'info@askmiro.com',
    to:          opts.to,
    subject:     opts.subject,
    type:        opts.type        || 'Custom',
    relatedType: opts.relatedType || '',
    relatedId:   opts.relatedId   || '',
    sentBy:      opts.sentBy      || '',
    status:      'Sent'
  });
}
// ══════════════════════════════════════════════════════════════
// EMAIL
// ══════════════════════════════════════════════════════════════
function getEmailLog(params, auth) {
  return getTableRows('EmailLog').map(r => ({
    id:       r.id      || '',
    to:       r.to      || '',
    subject:  r.subject || '',
    template: r.type    || 'Custom',
    sentAt:   r.ts ? new Date(r.ts).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : ''
  })).reverse();
}
function getInbox(params, auth) {
  try {
    const count  = parseInt(params.count || 20);
    const search = params.search || 'to:info@askmiro.com OR label:inbox';
    return GmailApp.search(search, 0, count).map(function(thread) {
      var msgs = thread.getMessages(), last = msgs[msgs.length - 1], first = msgs[0];
      var snippet = '';
      try { snippet = first.getPlainBody().substring(0, 160).replace(/[\n\r]/g, ' '); } catch(_) {}
      return { id: thread.getId(), subject: thread.getFirstMessageSubject() || '(no subject)', from: first.getFrom(), date: last.getDate().toISOString(), snippet: snippet, unread: thread.isUnread(), count: thread.getMessageCount() };
    });
  } catch(err) { logError(err); return { error: err.message }; }
}
function getEmailThread(params, auth) {
  if (!params.id) return { error: 'Missing thread id' };
  try {
    var thread = GmailApp.getThreadById(params.id);
    if (!thread) return { error: 'Thread not found' };
    return {
      id:       thread.getId(),
      subject:  thread.getFirstMessageSubject() || '(no subject)',
      messages: thread.getMessages().map(function(m) {
        var body = ''; try { body = m.getBody(); } catch(_) {}
        return { from: m.getFrom(), to: m.getTo(), date: m.getDate().toISOString(), body: body };
      })
    };
  } catch(err) { logError(err); return { error: err.message }; }
}
function sendCustomEmail(body, auth) {
  validate(body, ['to', 'subject'], 'EmailSend');
  var fields = {};
  try { fields = body.fields ? JSON.parse(body.fields) : {}; } catch(_) {}
  GmailApp.sendEmail(body.to, body.subject, '', {
    from:     'office@askmiro.com',
    name:     'AskMiro Cleaning Services',
    htmlBody: buildEmailTemplate(body.template || '', fields, body.subject),
    replyTo:  'info@askmiro.com'
  });
  var id = genId('EMAIL');
  appendRow('EmailLog', { id, ts: new Date().toISOString(), from: 'info@askmiro.com', to: body.to, subject: body.subject, type: body.template || 'Custom', sentBy: auth.userId || '', notes: '' });
  return { ok: true, id };
}
// ── EMAIL TEMPLATE BUILDER ────────────────────────────────────
function buildEmailTemplate(tmpl, f, subject) {
  var teal = '#0D9488', navy = '#0C1929', charcoal = '#1F2937', slate = '#475569';
  var muted = '#94A3B8', border = '#E2E8F0', offWhite = '#F8FAFC';
  var phone = '020 8073 0621', emailAddr = 'info@askmiro.com', web = 'www.askmiro.com';
  var company = 'AskMiro Cleaning Services', trading = 'A trading name of Miro Partners Ltd';
  var sortCode = '04-06-05', accNum = '26672911', accName = 'Miro Partners Ltd';
  var name = f.name || 'there', site = f.site || '[Site Name]', amount = f.amount || '';
  var senderName = f.senderName || 'AskMiro Team', senderRole = f.senderRole || 'AskMiro Cleaning Services';
  var logo = '<table cellpadding="0" cellspacing="0"><tr><td style="background:#0D9488;border-radius:9px;width:40px;height:40px;text-align:center;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="32" height="32" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0"></td></tr></table>';
  function sig() {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:32px"><tr><td style="border-top:2px solid ' + teal + ';padding-top:20px"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:top">' + logo + '</td><td style="vertical-align:top"><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:' + charcoal + '">' + senderName + '</div><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:' + teal + ';letter-spacing:1px;text-transform:uppercase;margin:3px 0 8px">' + senderRole + '</div><div style="font-family:Arial,sans-serif;font-size:12px;color:' + slate + '">&#9742; <a href="tel:02080730621" style="color:' + slate + ';text-decoration:none">' + phone + '</a> &nbsp;|&nbsp; &#9993; <a href="mailto:' + emailAddr + '" style="color:' + slate + ';text-decoration:none">' + emailAddr + '</a> &nbsp;|&nbsp; <a href="https://' + web + '" style="color:' + teal + ';text-decoration:none;font-weight:600">' + web + '</a></div></td></tr></table><div style="margin-top:12px;background:' + offWhite + ';border:1px solid ' + border + ';border-radius:8px;padding:8px 14px;font-family:Arial,sans-serif;font-size:10px;color:' + muted + '">&#10003; COSHH Compliant &nbsp;&nbsp; &#10003; Fully Insured &nbsp;&nbsp; &#10003; ISO Quality Standards &nbsp;&nbsp; &#10003; London &amp; UK Coverage</div></td></tr></table>';
  }
  function wrap(label, accent, bodyContent) {
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#E8EDF4;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#E8EDF4;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:' + navy + ';border-radius:12px 0 0 0;padding:24px 28px;width:52%;vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:middle">' + logo + '</td><td style="vertical-align:middle"><div style="font-family:Georgia,serif;font-size:21px;font-weight:700;color:#fff">AskMiro</div><div style="font-family:Arial,sans-serif;font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase;margin-top:2px">Cleaning Services</div></td></tr></table></td><td style="background:' + accent + ';border-radius:0 12px 0 0;padding:24px 28px;vertical-align:bottom;text-align:right"><div style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:rgba(255,255,255,0.85)">' + label + '</div></td></tr><tr><td colspan="2" style="background:' + accent + ';height:3px;font-size:3px;line-height:3px">&nbsp;</td></tr></table></td></tr><tr><td style="background:#fff;padding:36px 36px 28px;border-left:1px solid ' + border + ';border-right:1px solid ' + border + '">' + bodyContent + sig() + '</td></tr><tr><td style="background:' + navy + ';border-radius:0 0 12px 12px;padding:18px 28px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,0.6)">' + company + '</div><div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px">' + trading + ' &bull; London &amp; UK</div></td><td align="right"><a href="https://' + web + '" style="font-family:Arial,sans-serif;font-size:12px;color:' + teal + ';text-decoration:none;font-weight:700">' + web + '</a></td></tr></table><p style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.2);margin:10px 0 0;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px">Sent by ' + senderName + ' on behalf of ' + company + '. If received in error please notify ' + emailAddr + '.</p></td></tr></table></td></tr></table></body></html>';
  }
  function p(t)      { return '<p style="font-family:Arial,sans-serif;font-size:14px;color:' + slate + ';line-height:1.85;margin:0 0 16px">' + t + '</p>'; }
  function h(t)      { return '<h1 style="font-family:Georgia,serif;font-size:23px;font-weight:700;color:' + charcoal + ';margin:0 0 4px;letter-spacing:-0.5px">' + t + '</h1>'; }
  function sub(t)    { return '<p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:' + teal + ';letter-spacing:1.2px;text-transform:uppercase;margin:0 0 22px">' + t + '</p>'; }
  function gr(n)     { return '<p style="font-family:Georgia,serif;font-size:17px;font-style:italic;color:' + charcoal + ';margin:0 0 18px">Dear ' + n + ',</p>'; }
  function sm(t)     { return '<p style="font-family:Arial,sans-serif;font-size:11px;color:' + muted + ';line-height:1.7;margin:0">' + t + '</p>'; }
  function divider() { return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td style="height:1px;background:' + border + '">&nbsp;</td></tr></table>'; }
  function amber(html) { return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#92400E;line-height:1.7">' + html + '</td></tr></table>'; }
  function blockquote(text) { return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:18px"><tr><td style="width:4px;background:' + teal + ';border-radius:4px">&nbsp;</td><td style="padding:12px 16px;background:' + offWhite + ';border:1px solid ' + border + ';border-left:none;border-radius:0 8px 8px 0;font-family:Georgia,serif;font-size:13px;color:' + charcoal + ';font-style:italic;line-height:1.7">&ldquo;' + text + '&rdquo;</td></tr></table>'; }
  function cta(label, href, color) { return '<table cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:' + (color || teal) + ';border-radius:8px"><a href="' + href + '" style="display:block;padding:14px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;text-decoration:none">' + label + '</a></td><td width="10">&nbsp;</td><td style="border:2px solid ' + border + ';border-radius:8px"><a href="tel:02080730621" style="display:block;padding:12px 20px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:' + slate + ';text-decoration:none">&#9742; ' + phone + '</a></td></tr></table>'; }
  function checklist(items) {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="background:' + offWhite + ';border:1px solid ' + border + ';border-radius:10px;padding:16px 18px;margin-bottom:20px"><tbody>'
      + items.map(function(item) { return '<tr><td style="vertical-align:top;padding:0 10px 8px 0;width:22px"><div style="width:20px;height:20px;background:' + teal + ';border-radius:50%;text-align:center;line-height:21px;font-size:11px;color:white;font-weight:700">&#10003;</div></td><td style="vertical-align:top;padding-bottom:8px;font-family:Arial,sans-serif;font-size:13px;color:' + slate + ';line-height:1.6">' + item + '</td></tr>'; }).join('')
      + '</tbody></table>';
  }
  function statBand(stats) {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="border-radius:10px;overflow:hidden;margin-bottom:22px"><tr>'
      + stats.map(function(s, i) { return '<td align="center" style="background:linear-gradient(135deg,' + navy + ',#122440);padding:16px;' + (i < stats.length - 1 ? 'border-right:1px solid rgba(255,255,255,0.08)' : '') + '"><div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.45);margin-bottom:4px">' + s.label + '</div><div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#fff">' + s.value + '</div>' + (s.sub ? '<div style="font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">' + s.sub + '</div>' : '') + '</td>'; }).join('')
      + '</tr></table>';
  }
  function dataTable(rows, total) {
    var r = rows.map(function(r) { return '<tr style="border-bottom:1px solid ' + border + '"><td style="font-family:Arial,sans-serif;font-size:13px;color:' + slate + ';padding:10px 14px">' + r[0] + '</td><td style="font-family:Arial,sans-serif;font-size:13px;color:' + (r[3] ? teal : charcoal) + ';font-weight:' + (r[2] ? '700' : '400') + ';padding:10px 14px;text-align:right">' + r[1] + '</td></tr>'; }).join('');
    var t = total ? '<tr style="background:' + navy + '"><td style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;padding:12px 14px">' + total[0] + '</td><td style="font-family:Georgia,serif;font-size:19px;font-weight:700;color:#fff;padding:12px 14px;text-align:right">' + total[1] + '</td></tr>' : '';
    return '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ' + border + ';border-radius:10px;overflow:hidden;margin-bottom:22px">' + r + t + '</table>';
  }
  // ── INTRODUCTION ─────────────────────────────────────────
  if (tmpl === 'Introduction') {
    var introBody;
    if (f.customIntro && f.customIntro.trim().length > 0) {
      introBody = f.customIntro.trim().split(/\n\s*\n/).map(function(chunk) { return p(chunk.replace(/\n/g, '<br>')); }).join('');
    } else {
      introBody = p('We are <strong>' + company + '</strong> &mdash; a managed commercial cleaning company serving offices, warehouses, schools, healthcare facilities, and automotive dealerships across London and the UK.')
        + p('Unlike typical contractors, we don&rsquo;t just supply staff &mdash; we <strong>manage the entire service end-to-end</strong>: consistent teams, supervisor oversight, quality checklists, and a single point of contact.');
    }
    return wrap('Client Introduction', teal,
      h('Professional Cleaning. Properly Managed.') + sub('AskMiro Cleaning Services &mdash; London &amp; UK') + gr(name) + introBody
      + checklist(['<strong>Consistent, site-trained teams</strong> &mdash; the same people every visit, not rotating agency staff','<strong>Supervisor oversight &amp; written quality inspections</strong> &mdash; we check the work so you never have to','<strong>COSHH-compliant processes</strong> &mdash; full risk assessments and RAMS documentation as standard','<strong>Eco-conscious products</strong> &mdash; biodegradable chemicals and dilution control systems','<strong>Absence cover guaranteed</strong> &mdash; replacements arranged, your schedule is never disrupted','<strong>Single point of contact</strong> &mdash; reach our team directly, not a call centre'])
      + blockquote('We don&rsquo;t just supply cleaners &mdash; we manage the service. Our clients don&rsquo;t worry about cleaning because we handle everything, every time.')
      + p('We&rsquo;d love to arrange a <strong>free, no-obligation site visit</strong>. Most proposals are returned within 48 hours with a fixed monthly rate and no hidden costs.')
      + cta('&#128197; Book a Free Site Visit', 'mailto:' + emailAddr + '?subject=Site Visit Request', teal)
      + divider() + sm(company + ' is fully insured, COSHH compliant, and covered by public liability insurance.')
    );
  }
  // ── PROPOSAL / QUOTE ─────────────────────────────────────
  if (tmpl === 'Proposal / Quote') {
    // Body field: use what the sender typed, or fall back to the default copy
    var defaultPQBody = 'Thank you for your time during our site visit to <strong>' + site + '</strong>. We’re pleased to present our proposal for managed commercial cleaning services.'
      + '<br><br>What’s included in your service:<br>'
      + '✓ Dedicated cleaning team — inducted and briefed to your site specification<br>'
      + '✓ All professional equipment, chemicals and consumables supplied<br>'
      + '✓ COSHH risk assessments and full RAMS documentation<br>'
      + '✓ Monthly supervisor quality inspection with written report<br>'
      + '✓ Absence cover — your schedule is never disrupted';
    var pqBodyRaw = (f.body || '').trim();
    var pqBodyHtml = pqBodyRaw.length > 0
      ? pqBodyRaw.split(/\n{2,}/).map(function(chunk) {
          var lines = chunk.split('\n');
          var isChecks = lines.every(function(l) { return /^[\u2713\u2714\u2022\-]/.test(l.trim()); });
          if (isChecks) {
            return checklist(lines.map(function(l) { return l.replace(/^[\u2713\u2714\u2022\-]\s*/, ''); }));
          }
          return p(lines.join('<br>'));
        }).join('')
      : p(defaultPQBody);
    return wrap('Cleaning Proposal', '#0F766E',
      h('Your Cleaning Proposal.') + sub('Prepared following our site visit &mdash; valid for 30 days') + gr(name)
      + pqBodyHtml
      + statBand([{ label:'Monthly Investment', value: amount ? '&pound;' + amount : 'TBC', sub:'Fixed &mdash; no hidden costs' },{ label:'Visits per Week', value: f.visits || 'TBC', sub: f.days || '' },{ label:'Hours per Visit', value: f.hours ? f.hours + 'hrs' : 'TBC', sub:'Dedicated team' }])
      + amber('<strong>&#9200; This proposal is valid for 30 days from the date of this email.</strong><br>Reply to confirm and we can have your service live within <strong>5&ndash;7 working days</strong>.')
      + cta('&#10003; Accept This Proposal', 'mailto:' + emailAddr + '?subject=Accepting Proposal', '#0F766E')
      + divider() + sm('All prices exclusive of VAT. Payment terms: 30 days from invoice.')
    );
  }
  // ── FOLLOW-UP ────────────────────────────────────────────
  if (tmpl === 'Follow-up') {
    return wrap('Proposal Follow-up', '#D97706',
      h('Just Checking In.') + sub('Regarding our recent proposal') + gr(name)
      + p('We hope you&rsquo;re well. We&rsquo;re following up on the proposal we sent for cleaning services at <strong>' + site + '</strong>.')
      + p('If the proposal works for you, simply reply and we can get things moving. If you&rsquo;d like anything adjusted, we&rsquo;re happy to revisit scope, frequency, or pricing.')
      + blockquote('Every client has our commitment: if something isn&rsquo;t right, we fix it within 24 hours. That&rsquo;s not a policy &mdash; it&rsquo;s simply how we operate.')
      + checklist(['No long-term lock-in for initial contracts','Service live within 5&ndash;7 working days of confirmation','Dedicated account contact &mdash; not a call centre','Consistent teams, not rotating agency staff'])
      + cta('&#9993; Reply to This Email', 'mailto:' + emailAddr, '#D97706')
      + divider() + sm('To stop follow-up emails please reply with &ldquo;Unsubscribe&rdquo;.')
    );
  }
  // ── WELCOME ONBOARD ──────────────────────────────────────
  if (tmpl === 'Welcome Onboard') {
    return wrap('Welcome Onboard', '#059669',
      h('Welcome to AskMiro.') + sub('We&rsquo;re delighted to be working with you') + gr(name)
      + p('On behalf of everyone at ' + company + ' &mdash; <strong>welcome aboard</strong>. Your service is confirmed and our team is ready to get started.')
      + dataTable([['Site Address', site],['Service Start', f.startDate || '&mdash;'],['Schedule', f.schedule || '&mdash;'],['Team Size', f.team ? f.team + ' dedicated cleaners' : '&mdash;'],['Monthly Fee', amount ? '&pound;' + amount + ' + VAT' : '&mdash;', true, true],['Invoice Day','Last working day of each month'],['Contact', phone + ' &mdash; ' + emailAddr]])
      + checklist(['<strong>Site briefing</strong> &mdash; our team visits before the first clean to walk the site','<strong>Schedule confirmation</strong> &mdash; your full cleaning schedule sent in writing','<strong>Direct contact</strong> &mdash; you will have a dedicated contact number','<strong>First invoice</strong> &mdash; issued at the end of your first month'])
      + blockquote('We work hard to be the kind of cleaning company you never have to think about.')
      + cta('&#9742; Call Us &mdash; ' + phone, 'tel:02080730621', '#059669')
      + divider() + sm('Welcome confirmation sent by ' + company + '. Please retain this email for your records.')
    );
  }
  // ── INVOICE ──────────────────────────────────────────────
  if (tmpl === 'Invoice') {
    var net = parseFloat(amount || 0), vatAmt = (net * 0.2).toFixed(2), total = (net * 1.2).toFixed(2);
    var invNum = f.invNum || '&mdash;', period = f.period || '&mdash;';
    var issueDate = f.issueDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMMM yyyy');
    return wrap('Invoice', navy,
      h('Invoice ' + invNum + '.') + sub(period + (site ? ' &mdash; ' + site : '')) + gr(name)
      + p('Please find below your invoice for cleaning services at <strong>' + site + '</strong> for <strong>' + period + '</strong>.')
      + dataTable([['Invoice Number', invNum],['Service Period', period],['Site', site],['Issue Date', issueDate],['Payment Due', f.dueDate || '&mdash;'],['Subtotal', amount ? '&pound;' + net.toFixed(2) : '&mdash;'],['VAT (20%)', amount ? '&pound;' + vatAmt : '&mdash;']], ['Total Due', amount ? '&pound;' + total : '&mdash;'])
      + amber('<strong>&#127974; Bank Transfer Details</strong><br><br><table cellpadding="0" cellspacing="0"><tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#92400E;padding-right:24px;line-height:2">Account Name<br>Sort Code<br>Account Number<br>Reference</td><td style="font-family:Arial,sans-serif;font-size:13px;color:' + charcoal + ';font-weight:700;line-height:2">' + accName + '<br>' + sortCode + '<br>' + accNum + '<br>' + invNum + '</td></tr></table>')
      + p('Payment is due within <strong>30 days</strong>. For queries please reply or call ' + phone + '.')
      + divider() + sm('Late payments may be subject to statutory interest under the Late Payment of Commercial Debts (Interest) Act 1998.')
    );
  }
  // ── CONTRACT RENEWAL ─────────────────────────────────────
  if (tmpl === 'Contract Renewal') {
    return wrap('Service Renewal', '#7C3AED',
      h('Your Service Agreement Is Up for Renewal.') + sub('We&rsquo;d love to continue working with you') + gr(name)
      + p('Your current service agreement for <strong>' + site + '</strong> is due for renewal on <strong>' + (f.renewDate || '&mdash;') + '</strong>. We&rsquo;d love to continue working with you.')
      + dataTable([['Site', site],['Renewal Date', f.renewDate || '&mdash;'],['Schedule', f.schedule || '&mdash;'],['Monthly Fee', amount ? '&pound;' + amount + ' + VAT' : '&mdash;', true, true],['Contract Term','12 months from renewal date']])
      + p('Simply reply with <em>&ldquo;Confirmed&rdquo;</em> and we will keep everything running without interruption.')
      + checklist(['No paperwork required &mdash; a reply to this email is your confirmation','Same dedicated team, same schedule, same quality standard','Happy to discuss any changes to scope or frequency','12-month term from renewal date'])
      + blockquote('It has been a genuine pleasure working with you. We will continue working hard to earn your trust.')
      + cta('&#10003; Confirm Renewal', 'mailto:' + emailAddr + '?subject=Renewal Confirmed', '#7C3AED')
      + divider() + sm('To discuss changes please call ' + phone + ' or reply to this email.')
    );
  }
  // ── REFERRAL / INTRODUCTION FOLLOW-UP ────────────────────
  if (tmpl === 'Referral / Introduction Follow-Up') {
    var contactName  = f.contact_name  || 'there';
    var meetingDate  = f.meeting_date  || '';
    var location     = f.location      || '';
    var defaultBody = 'Great meeting you' + (meetingDate ? ' on ' + meetingDate : '') + (location ? ' at ' + location : '') + '.\n\n'
      + 'Thank you again for offering to share my details with the homeowners \u2014 I really appreciate it.\n\n'
      + 'If any of the buyers need help with move-in cleaning, after-builders cleaning, or regular home cleaning once they settle in, we would be very happy to assist.\n\n'
      + 'We\u2019re a local cleaning company based nearby and currently helping homeowners across South West London with reliable and flexible cleaning services.\n\n'
      + 'If helpful, I can also send over a short one-page introduction or flyer that your team can easily share with the buyers.\n\n'
      + 'Thanks again and nice to meet you.';
    var bodyRaw  = (f.body && f.body.trim().length > 0) ? f.body : defaultBody;
    var bodyText = bodyRaw
      .replace(/\{\{contact_name\}\}/g, contactName)
      .replace(/\{\{meeting_date\}\}/g,  meetingDate)
      .replace(/\{\{location\}\}/g,       location);
    var bodyHtml = bodyText.split(/\n\n+/).map(function(chunk) {
      return p(chunk.replace(/\n/g, '<br>'));
    }).join('');
    return wrap('Referral / Introduction Follow-Up', teal,
      h('Great meeting you.') + sub(meetingDate ? 'Following our meeting on ' + meetingDate : 'Thank you for the introduction') + gr(contactName)
      + bodyHtml
      + '<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:' + charcoal + ';margin:20px 0 10px">We can help with</p>'
      + checklist([
          '<strong>Move-in &amp; move-out cleaning</strong> &mdash; thorough clean after key handover, before buyers move in',
          '<strong>End-of-tenancy cleaning</strong> &mdash; deep clean to deposit-return standard',
          '<strong>After-builders &amp; post-renovation cleaning</strong> &mdash; dust, debris, and builder residue',
          '<strong>Regular home cleaning</strong> &mdash; weekly or fortnightly across South West London',
          '<strong>Deep cleaning &amp; sparkle cleans</strong> &mdash; one-off intensive clean, any property type',
          '<strong>Office &amp; commercial cleaning</strong> &mdash; managed service with consistent teams',
          '<strong>School &amp; education cleaning</strong> &mdash; term-time and holiday programmes',
          '<strong>Medical, dental &amp; healthcare</strong> &mdash; clinical-grade sanitisation protocols',
          '<strong>Retail &amp; hospitality</strong> &mdash; after-hours for shops, restaurants, cafes, pubs',
          '<strong>Gym &amp; leisure facilities</strong> &mdash; high-touch sanitisation and daily maintenance',
          '<strong>Automotive &amp; car dealerships</strong> &mdash; showroom, workshop, and forecourt',
          '<strong>Warehouses &amp; industrial units</strong> &mdash; floor maintenance and welfare facilities',
          '<strong>Residential blocks &amp; communal areas</strong> &mdash; entrance halls, stairwells, shared spaces'
        ])
      + '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#F0FDFA;border:1px solid #CCFBF1;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#0F766E;line-height:1.7">&#9432; We can also send over a branded one-page introduction your team can share directly with buyers. Just reply and we&rsquo;ll get it over to you.</td></tr></table>'
      + cta('&#9993; Get in Touch', 'mailto:' + emailAddr, teal)
      + divider() + sm(company + ' &mdash; London &amp; UK. Residential &amp; commercial cleaning. Fully insured.')
    );
  }
  // ── DEEP CLEAN QUOTE REPLY ────────────────────────────────
  if (tmpl === 'Deep Clean Quote Reply') {
    var isFixed    = (f.quote_type || 'provisional') === 'fixed';
    var clientName = f.name     || 'there';
    var property   = f.property || 'the property';
    var priceRaw   = (f.price   || '').trim();
    var priceStr   = priceRaw ? '&pound;' + priceRaw : 'TBC';
    var duration   = f.duration || 'TBC';
    var slots      = [f.avail1, f.avail2, f.avail3].filter(Boolean);
    var extras     = (f.extras  || '').trim();
    var qualQ      = (f.qual_q  || '').trim();
    var bandBg     = isFixed ? 'linear-gradient(135deg,' + navy + ',#122440)' : 'linear-gradient(135deg,#78350F,#92400E)';
    var priceLabel = isFixed ? 'Quoted Price' : 'Estimated Range';
    var priceSub   = isFixed ? 'all materials &amp; equipment included' : 'subject to site visit / photos';
    var priceFontSz = priceRaw.length > 7 ? '24px' : '34px';
    var priceBand = '<table cellpadding="0" cellspacing="0" width="100%" style="border-radius:12px;overflow:hidden;margin-bottom:24px"><tr>'
      + '<td align="center" style="background:' + bandBg + ';padding:22px 20px;border-right:1px solid rgba(255,255,255,0.08)">'
      + '<div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.45);margin-bottom:6px">' + priceLabel + '</div>'
      + '<div style="font-family:Georgia,serif;font-size:' + priceFontSz + ';font-weight:700;color:#fff;letter-spacing:-1px">' + priceStr + '</div>'
      + '<div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">' + priceSub + '</div>'
      + '</td>'
      + '<td align="center" style="background:' + bandBg + ';padding:22px 20px">'
      + '<div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.45);margin-bottom:6px">Duration</div>'
      + '<div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#fff">' + duration + '</div>'
      + '<div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">professional deep clean team</div>'
      + '</td></tr></table>';
    var visitNotice = !isFixed
      ? '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#1E40AF;line-height:1.7">'
        + '<strong>&#128247; To confirm a fixed price</strong> &mdash; we&rsquo;d welcome a quick site visit, or a few photos of the kitchen, bathrooms, and any areas of particular concern. This lets us give you an exact figure with confidence.</td></tr></table>'
      : '';
    var qualHtml = (!isFixed && qualQ)
      ? '<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:' + charcoal + ';margin:20px 0 10px">A couple of quick questions</p>'
        + '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#3D5A74;line-height:1.85">'
        + qualQ.replace(/\n/g, '<br>')
        + '<br><br><span style="font-size:12px;color:#6B8FA8">This simply helps us plan the safest products and approach for the clean.</span>'
        + '</td></tr></table>'
      : '';
    var slotsHtml = '';
    if (slots.length > 0) {
      var slotsLabel = isFixed ? 'Available dates' : 'Provisional availability';
      slotsHtml = '<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:' + charcoal + ';margin:20px 0 10px">' + slotsLabel + '</p>'
        + '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ' + border + ';border-radius:10px;overflow:hidden;margin-bottom:20px">'
        + slots.map(function(s, i) {
            return '<tr' + (i < slots.length - 1 ? ' style="border-bottom:1px solid #F3F4F6"' : '') + '>'
              + '<td style="padding:12px 16px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:' + charcoal + '">'
              + '&#128197; ' + s + '</td></tr>';
          }).join('')
        + '</table>';
    }
    var extrasHtml = extras
      ? '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px"><tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;color:#92400E;line-height:1.7"><strong>Additional notes:</strong> ' + extras + '</td></tr></table>'
      : '';
    var scopeHtml = isFixed
      ? '<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:' + charcoal + ';margin:20px 0 10px">What\u2019s included</p>'
        + checklist([
            '<strong>Kitchen</strong> \u2014 oven &amp; hob, extractor hood &amp; filters, behind &amp; under appliances, inside cupboards &amp; drawers, fridge interior, tile grout, microwave, dishwasher filter, kettle descale',
            '<strong>Bathrooms</strong> \u2014 limescale from taps, showerheads &amp; screens, tile grout &amp; silicone, behind &amp; around toilet, shower tray/bath descale &amp; disinfect, inside cabinets, extraction fan covers, mirrors &amp; chrome',
            '<strong>Living areas</strong> \u2014 under &amp; behind furniture, skirting boards, light switches &amp; door frames, sofa &amp; cushion vacuuming, TV &amp; electronics, windows &amp; sills',
            '<strong>Bedrooms</strong> \u2014 under bed vacuuming, wardrobe interiors &amp; drawers, bed frames &amp; headboards, lampshades &amp; picture frames',
            '<strong>Whole house</strong> \u2014 internal windows &amp; tracks, skirting boards throughout, doors, frames &amp; handles, light fittings, under movable furniture, radiators, ceiling corners &amp; cobwebs',
          ])
      : '';
    var ctaLabel   = isFixed ? '&#128197; Confirm Your Booking' : '&#128247; Send Photos / Request Site Visit';
    var ctaSubject = isFixed ? 'Confirming Deep Clean Booking'  : 'Deep Clean \u2014 Photos / Site Visit Request';
    var closingP   = isFixed
      ? 'To confirm a date, simply reply to this email or call us directly. We\u2019ll send confirmation with arrival time and any final access details.'
      : 'Once we\u2019ve seen the property we can confirm a fixed price and get a date in the diary. We currently have availability within the next two weeks.';
    var closingChecklist = isFixed
      ? checklist([
          '<strong>All materials &amp; professional equipment included</strong> \u2014 nothing for you to provide',
          '<strong>Eco-conscious, low-odour products</strong> \u2014 safe for families and pets',
          '<strong>Fully insured team</strong> \u2014 &pound;10M public liability cover',
          '<strong>Satisfaction guaranteed</strong> \u2014 if anything is missed we\u2019ll return within 48 hours',
        ])
      : checklist([
          'No obligation \u2014 the site visit or photo review is completely free',
          '<strong>Eco-conscious, low-odour products</strong> \u2014 safe for families and pets',
          '<strong>Fully insured team</strong> \u2014 &pound;10M public liability cover',
          'Fixed price confirmed before any work begins \u2014 no surprises',
        ]);
    var heroH    = isFixed ? 'Your deep clean quote.'       : 'We can help \u2014 here\u2019s your estimate.';
    var heroSub  = (isFixed ? 'One-off deep clean \u00b7 ' : 'Provisional estimate \u00b7 ') + property;
    var openingP = isFixed
      ? 'Thank you for your enquiry. We\u2019ve reviewed the scope and are pleased to confirm we can carry out a full deep clean of <strong>' + property + '</strong> on a fixed-price basis.'
      : 'Thank you for getting in touch and for outlining the scope so clearly \u2014 it\u2019s really helpful to have that detail upfront. Yes, we\u2019d be very happy to help with a one-off deep clean for <strong>' + property + '</strong>.';
    var footerSm = isFixed
      ? 'All prices include materials and labour. Payment due on completion. Parking access required at the property.'
      : 'All prices include materials and labour. Final price confirmed after site visit or photo review. No work begins until you\u2019re happy with the fixed quote.';
    var dcBodyRaw = (f.body || '').trim();
    var dcBodyHtml = dcBodyRaw.length > 0
      ? dcBodyRaw.split(/\n{2,}/).map(function(chunk) { return p(chunk.replace(/\n/g, '<br>')); }).join('')
      : p(openingP);
    return wrap('Deep Clean Quote', teal,
      h(heroH) + sub(heroSub) + gr(clientName)
      + dcBodyHtml
      + priceBand
      + visitNotice
      + scopeHtml
      + qualHtml
      + slotsHtml
      + extrasHtml
      + p(closingP)
      + cta(ctaLabel, 'mailto:' + emailAddr + '?subject=' + encodeURIComponent(ctaSubject), teal)
      + divider()
      + closingChecklist
      + divider()
      + sm(footerSm)
    );
  }
  // ── COLD OUTREACH (Lead Intelligence OS) ─────────────────
  if (tmpl === 'Cold Outreach') {
    var bizName  = f.business_name || 'there';
    var sector   = f.sector   || '';
    var borough  = f.borough  || 'London';
    // Render AI-generated body — respect paragraph breaks
    var rawBody  = (f.cold_email || '').trim();
    var bodyHtml;
    if (rawBody.length > 0) {
      bodyHtml = rawBody
        .split(/\n{2,}/)
        .map(function(chunk) { return p(chunk.replace(/\n/g, '<br>')); })
        .join('');
    } else {
      bodyHtml = p('I wanted to reach out regarding managed commercial cleaning for <strong>' + bizName + '</strong>.')
        + p('We work with ' + (sector ? sector + ' businesses' : 'organisations') + ' across ' + borough + ' and would welcome the chance to have a brief conversation or arrange a no-obligation site visit.');
    }
    var sectorCreds = sector
      ? 'We currently work with ' + sector + ' clients across London — COSHH compliant, fully insured, and audit-ready.'
      : 'We work with offices, residential blocks, healthcare, automotive, and education clients across London.';
    return wrap('Cold Outreach', teal,
      h('Managed commercial cleaning — done properly.') + sub('AskMiro Cleaning Services \u00b7 ' + borough) + bodyHtml
      + divider()
      + checklist([
          '<strong>Consistent, site-trained teams</strong> \u2014 same people every visit, not rotating agency staff',
          '<strong>Managed quality checks</strong> \u2014 supervisor oversight and written inspection reports',
          '<strong>COSHH-compliant documentation</strong> \u2014 RAMS and safety data sheets as standard',
          '<strong>&pound;10M public liability</strong> \u2014 fully insured, certificates on request',
          '<strong>Fixed monthly pricing</strong> \u2014 no hidden costs, no surprise invoices',
        ])
      + sm(sectorCreds)
      + cta('&#128197; Book a Free Site Visit', 'mailto:' + emailAddr + '?subject=Site Visit Request \u2014 ' + bizName, teal)
      + divider()
      + sm('To stop receiving these emails please reply with \u201cUnsubscribe\u201d.')
    );
  }
  // ── GENERAL EMAIL ────────────────────────────────────────
  var rawBody = (f.body || '').trim();
  var bodyHtml = rawBody.length > 0
    ? rawBody.split(/\n{2,}/).map(function(chunk) {
        return p(chunk.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>'));
      }).join('')
    : p('Please write your message in the Message field.');
  return wrap(subject || 'Message', teal,
    gr(f.to_name || 'there') +
    bodyHtml +
    divider() +
    sm("If you have any questions, please don't hesitate to get in touch.")
  );
}
// ── EMAIL WRAPPERS ────────────────────────────────────────────
function buildPlainEmail(subject, message, settings) {
  var email = settings.emailFrom || 'info@askmiro.com', company = settings.company || 'AskMiro Cleaning Services';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td style="background:linear-gradient(135deg,#0F172A,#1E3A5F);border-radius:12px 12px 0 0;padding:22px 32px"><table width="100%"><tr><td><table><tr><td style="background:#0D9488;border-radius:7px;width:32px;height:32px;text-align:center;vertical-align:middle"><svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></td><td style="padding-left:9px;font-size:16px;font-weight:800;color:white">AskMiro</td></tr></table></td></tr></table></td></tr><tr><td style="background:#fff;padding:32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0"><p style="font-size:14px;color:#475569;line-height:1.75;white-space:pre-line">' + message.replace(/</g,'&lt;') + '</p><table style="margin-top:24px;padding-top:16px;border-top:2px solid #0D9488;width:100%"><tr><td style="padding-right:12px;vertical-align:top;width:48px"><div style="width:40px;height:40px;background:#0D9488;border-radius:7px;text-align:center;line-height:40px"><svg width="24" height="24" viewBox="0 0 32 32" fill="none" style="vertical-align:middle"><path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div></td><td style="vertical-align:top"><div style="font-weight:700;font-size:14px;color:#1F2937">Mike Kato</div><div style="font-size:12px;color:#0D9488;font-weight:600">Co-Founder, ' + company + '</div><div style="font-size:12px;color:#475569;margin-top:3px">📞 <a href="tel:07549354362" style="color:#475569;text-decoration:none">07549 354 362</a> &nbsp;|&nbsp; ✉ <a href="mailto:' + email + '" style="color:#475569;text-decoration:none">' + email + '</a></div></td></tr></table></td></tr><tr><td style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:12px 32px;text-align:center"><p style="font-size:11px;color:#94A3B8;margin:0">' + company + ' &nbsp;|&nbsp; A trading name of Miro Partners Ltd &nbsp;|&nbsp; London & UK</p></td></tr></table></td></tr></table></body></html>';
}
function emailWrapper(headerBg, headerContent, bodyContent, settings) {
  var company = settings.companyName || 'AskMiro Cleaning Services';
  var email   = settings.emailFrom   || 'info@askmiro.com';
  var year    = new Date().getFullYear();
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + company + '</title></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:\'Helvetica Neue\',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td style="background:' + headerBg + ';border-radius:12px 12px 0 0;padding:28px 36px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><table cellpadding="0" cellspacing="0"><tr><td style="background:#0F766E;border-radius:8px;padding:8px 10px"><span style="font-family:Arial,sans-serif;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">M</span></td><td style="padding-left:10px"><div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.3px">' + company + '</div><div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:1px">Professional Cleaning Services</div></td></tr></table></td><td align="right">' + headerContent + '</td></tr></table></td></tr><tr><td style="background:#ffffff;padding:36px 36px 28px">' + bodyContent + '</td></tr><tr><td style="background:#1F2937;border-radius:0 0 12px 12px;padding:20px 36px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-size:12px;color:rgba(255,255,255,0.5)">&copy; ' + year + ' ' + company + '</div><div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:3px"><a href="mailto:' + email + '" style="color:#5EEAD4;text-decoration:none">' + email + '</a> &nbsp;&bull;&nbsp; www.askmiro.com</div></td><td align="right"><div style="font-size:10px;color:rgba(255,255,255,0.3)">Sent via AskMiro Ops</div></td></tr></table></td></tr></table></td></tr></table></body></html>';
}
function buildInvoiceEmail(inv, settings) {
  var amount   = parseFloat(inv.amount || 0).toLocaleString('en-GB', { minimumFractionDigits:2, maximumFractionDigits:2 });
  var dueDate  = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : 'Upon receipt';
  var month = inv.month || '', invId = inv.id || '';
  var isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();
  var hdr = '<div style="text-align:right"><div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px">Invoice</div><div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">' + invId + '</div><div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px">' + month + '</div></div>';
  var bdy = '<p style="margin:0 0 6px;font-size:14px;color:#94A3B8;font-weight:500">Dear Client,</p><h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#1F2937;letter-spacing:-0.5px">Your invoice is ready for payment</h1><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td style="background:#F0FDF9;border:2px solid #0D9488;border-radius:10px;padding:20px 24px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0D9488;margin-bottom:4px">Amount Due</div><div style="font-size:40px;font-weight:900;color:#0F766E;letter-spacing:-2px;line-height:1">&pound;' + amount + '</div><div style="font-size:13px;color:#475569;margin-top:8px">' + (isOverdue ? '<span style="background:#FEF2F2;color:#DC2626;border-radius:4px;padding:2px 8px;font-weight:700;font-size:11px">&#9888; OVERDUE</span>' : '<span style="background:#ECFDF5;color:#059669;border-radius:4px;padding:2px 8px;font-weight:700;font-size:11px">&#9679; PAYMENT DUE</span>') + ' &nbsp; Due by <strong>' + dueDate + '</strong></div></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden"><tr style="background:#F8FAFC"><td style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:1px solid #E5E7EB">Invoice Details</td><td style="padding:10px 16px;border-bottom:1px solid #E5E7EB"></td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Invoice Number</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;text-align:right;font-family:monospace">' + invId + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Service Period</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;text-align:right">' + month + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Site</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;text-align:right">' + (inv.siteId || '&mdash;') + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569">Payment Due</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:' + (isOverdue ? '#DC2626' : '#059669') + ';text-align:right">' + dueDate + '</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td align="center" style="background:#0D9488;border-radius:8px;padding:14px 24px"><a href="mailto:' + (settings.emailFrom || 'info@askmiro.com') + '?subject=Payment%20for%20' + invId + '" style="font-size:15px;font-weight:700;color:#fff;text-decoration:none;display:block">&#10003; &nbsp; Confirm Payment or Query &rarr;</a></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 18px"><tr><td><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#D97706;margin-bottom:8px">&#9432; Payment Instructions</div><div style="font-size:13px;color:#92400E;line-height:1.7">Please make payment by bank transfer. Quote reference <strong>' + invId + '</strong> on your transfer.<br>For payment details or queries, reply to this email or contact us at <strong>' + (settings.emailFrom || 'info@askmiro.com') + '</strong></div></td></tr></table><p style="font-size:13px;color:#94A3B8;margin:0">Thank you for your business. We look forward to continuing to provide you with exceptional cleaning services.</p><p style="font-size:13px;color:#475569;margin:16px 0 0;font-weight:600">The AskMiro Team</p>';
  return emailWrapper('#1F2937', hdr, bdy, settings);
}
function buildQuoteEmail(q, settings) {
  var revenue = parseFloat(q.revenueMonthly || 0).toLocaleString('en-GB', { minimumFractionDigits:2, maximumFractionDigits:2 });
  var annual  = parseFloat(q.annualValue    || 0).toLocaleString('en-GB', { minimumFractionDigits:0, maximumFractionDigits:0 });
  var hrs = q.hoursPerWeek || '&mdash;';
  var hdr = '<div style="text-align:right"><div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px">Cleaning Proposal</div><div style="font-size:14px;font-weight:700;color:#5EEAD4;margin-top:3px">' + (q.id || '') + '</div></div>';
  var items = ['Professional cleaning to agreed specification','Fully trained, vetted and uniformed staff','All cleaning equipment and eco-friendly materials','Dedicated account manager (Mike Kato)','Regular quality audits and reporting','Flexible scheduling to suit your business'];
  var bdy = '<p style="margin:0 0 6px;font-size:14px;color:#94A3B8;font-weight:500">Dear ' + q.clientName + ',</p><h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1F2937;letter-spacing:-0.5px">Your Cleaning Proposal</h1><p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6">Thank you for considering AskMiro Cleaning Services for <strong>' + (q.siteAddress || 'your premises') + '</strong>. We are delighted to present the following proposal.</p><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td style="background:#0D9488;border-radius:10px;padding:20px 24px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.7);margin-bottom:4px">Monthly Service Fee</div><div style="font-size:40px;font-weight:900;color:#fff;letter-spacing:-2px;line-height:1">&pound;' + revenue + '</div><div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:6px">&pound;' + annual + '/year &nbsp;&bull;&nbsp; ' + hrs + ' hrs/week</div></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden"><tr style="background:#F8FAFC"><td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;border-bottom:1px solid #E5E7EB">Proposal Summary</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6;width:50%">Site</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;border-bottom:1px solid #F3F4F6">' + (q.siteAddress || '&mdash;') + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Service Hours</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937;border-bottom:1px solid #F3F4F6">' + hrs + ' hrs/week</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-bottom:1px solid #F3F4F6">Monthly Fee</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#0D9488;border-bottom:1px solid #F3F4F6">&pound;' + revenue + '</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#475569">Annual Value</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1F2937">&pound;' + annual + '</td></tr></table><div style="margin-bottom:24px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94A3B8;margin-bottom:12px">What\'s Included</div>' + items.map(function(item) { return '<div style="display:flex;align-items:center;margin-bottom:8px"><span style="background:#CCFBF1;color:#0D9488;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-right:10px">&#10003;</span><span style="font-size:13px;color:#475569">' + item + '</span></div>'; }).join('') + '</div><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr><td align="center" style="background:#0D9488;border-radius:8px;padding:14px 24px"><a href="mailto:' + (settings.emailFrom || 'info@askmiro.com') + '?subject=Re:%20Proposal%20' + (q.id || '') + '" style="font-size:15px;font-weight:700;color:#fff;text-decoration:none;display:block">Accept This Proposal &rarr;</a></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td align="center" style="border:2px solid #E5E7EB;border-radius:8px;padding:12px 24px"><a href="mailto:' + (settings.emailFrom || 'info@askmiro.com') + '?subject=Query:%20Proposal%20' + (q.id || '') + '" style="font-size:14px;font-weight:600;color:#475569;text-decoration:none;display:block">Have a question? Reply to this email</a></td></tr></table>' + (q.notes ? '<div style="background:#F8FAFC;border-left:3px solid #0D9488;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;font-size:13px;color:#475569;line-height:1.6"><strong>Notes:</strong> ' + q.notes + '</div>' : '') + '<p style="font-size:13px;color:#94A3B8;margin:0;line-height:1.6">This proposal is valid for 30 days. We look forward to the opportunity to work with you.</p><p style="font-size:13px;color:#475569;margin:16px 0 0;font-weight:600">Mike Kato<br><span style="font-weight:400;color:#94A3B8">AskMiro Cleaning Services &nbsp;&bull;&nbsp; ' + (settings.emailFrom || 'info@askmiro.com') + '</span></p>';
  return emailWrapper('#0D9488', hdr, bdy, settings);
}
// ══════════════════════════════════════════════════════════════
// WEBHOOKS
// ══════════════════════════════════════════════════════════════
function webhookLead(params) {
  try {
    const name  = (params.contactName || params.name  || '').trim();
    const email = (params.email || '').trim();
    if (!name || !email) return { ok: false, error: 'Missing required fields' };
    const id      = genId('LEAD');
    const segment = params.segment || mapSegment(params.serviceType || params.sector || '');
    const lead = {
      id,
      companyName:        (params.companyName || params.company || name).trim(),
      contactName:        name,
      email,
      phone:              (params.phone || '').trim(),
      segment,
      source:             params.source || 'Website',
      status:             'New',
      annualValue:        '',
      notes:              buildNotes(params),
      serviceType:        params.serviceType || params.sector || '',
      postcode:           (params.postcode || '').trim().toUpperCase(),
      frequency:          params.frequency || '',
      additionalServices: params.additionalServices || '',
      createdAt:          new Date().toISOString(),
      createdBy:          'WEBHOOK',
      updatedAt:          '',
      updatedBy:          ''
    };
    appendRow('Leads', lead);
    auditLog('WEBHOOK', 'CREATE', 'Lead', id, null, lead);
    try {
      const settings = getSettingsObj();
      GmailApp.sendEmail(settings.emailFrom || 'info@askmiro.com',
        '🔔 New Website Lead: ' + lead.companyName, '', {
          htmlBody: buildLeadNotificationEmail(lead, params, settings),
          name:     'AskMiro Ops',
          replyTo:  email
        });
    } catch(emailErr) { Logger.log('Notification email failed: ' + emailErr.message); }
    try {
      sendInboxAutoReply(email, lead.contactName, 'Your cleaning enquiry');
    } catch(arErr) { Logger.log('Auto-reply failed: ' + arErr.message); }
    return { ok: true, id, message: 'Lead created successfully' };
  } catch(err) { logError(err); return { ok: false, error: err.message }; }
}

// ── Client upload webhook — called by netlify/functions/client-upload.js ──
function webhookClientUpload(params) {
  try {
    const refId       = params.refId       || '';
    const clientName  = params.clientName  || '';
    const clientEmail = params.clientEmail || '';
    const fileCount   = params.fileCount   || '0';
    const fileNames   = params.fileNames   || '';
    const note        = params.note        || '';

    // Append a note to the matching lead if refId provided
    if (refId) {
      const sh    = getSheet().getSheetByName('Leads');
      const data  = sh.getDataRange().getValues();
      const hdr   = data[0];
      const idCol = hdr.indexOf('id');
      const ntCol = hdr.indexOf('notes');
      const utCol = hdr.indexOf('updatedAt');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]).trim() === refId.trim()) {
          const existing  = ntCol >= 0 ? String(data[i][ntCol]) : '';
          const dateStr   = new Date().toLocaleDateString('en-GB');
          const fileLinks = params.fileLinks || '';
          // Build one line per file with URL if available
          // Use [FILE] prefix (ASCII-safe, no emoji encoding issues)
          var fileEntries;
          if (fileLinks) {
            fileEntries = fileLinks.split('|||').map(function(entry) {
              var parts = entry.split('::');
              return parts.length === 2
                ? '[FILE] ' + dateStr + ': ' + parts[0] + ' -> ' + parts[1]
                : '[FILE] ' + dateStr + ': ' + entry;
            }).join('\n');
          } else {
            fileEntries = '[FILE] ' + dateStr + ': ' + fileCount + ' file(s) - ' + fileNames;
          }
          var addition = fileEntries + (note ? '\n   Note: ' + note : '');
          if (ntCol >= 0) sh.getRange(i + 1, ntCol + 1).setValue(existing ? existing + '\n' + addition : addition);
          if (utCol >= 0) sh.getRange(i + 1, utCol + 1).setValue(new Date().toISOString());
          invalidateCache('Leads');
          break;
        }
      }
    }

    // Also log to AuditLog
    auditLog('WEBHOOK', 'UPLOAD', 'Lead', refId || 'unknown', null, {
      clientName, clientEmail, fileCount, fileNames, note
    });

    Logger.log('✓ webhookClientUpload: ' + fileCount + ' file(s) from ' + clientName + ' | ref: ' + refId);
    return { ok: true };
  } catch(err) { logError(err); return { ok: false, error: err.message }; }
}

function handleWebQuoteSubmission(params) {
  try {
    const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
    ensureIntelligenceSheets(ss);
    const lead    = normaliseLead(params);
    const leadId  = storeWebLead(ss, lead);
    let   intel   = runIntelligenceEngine(ss, lead);
    intel         = handleOneOffClean(lead, intel);
    const quoteId = createDraftQuote(ss, lead, intel, leadId);
    notifyOwnerNewWebLead(lead, leadId, quoteId, getSettingsObj());
    return { ok: true, leadId, quoteId };
  } catch(e) { Logger.log('handleWebQuoteSubmission ERROR: ' + e.message); logError(e); return { ok: false, error: e.message }; }
}
// ══════════════════════════════════════════════════════════════
// INTELLIGENCE ENGINE
// ══════════════════════════════════════════════════════════════
function runIntelligenceEngine(ss, lead) {
  const settings   = loadSettings(ss);
  const benchmarks = loadBenchmarks(ss);
  const bm         = getBenchmarkForFacility(benchmarks, lead.facilityType);
  let areaMq = lead.areaMq > 0 ? lead.areaMq : (bm.typicalM2 || 150);
  const minsPerM2       = bm.minsPerM2 || settings.defaultMinsPerM2 || 0.5;
  const intensity       = resolveIntensity(lead.requirements);
  const intensityMult   = { low: 0.85, normal: 1.0, high: 1.20 }[intensity] || 1.0;
  const hoursPerVisit   = Math.max(Math.ceil((areaMq * minsPerM2 * intensityMult / 60) * 4) / 4, settings.minHoursPerVisit || 2);
  const visitsPerWeek   = resolveFrequency(lead.cleaningFrequency);
  const hoursPerWeek    = +(hoursPerVisit * visitsPerWeek).toFixed(2);
  const hoursPerMonth   = +(hoursPerWeek * 4.333).toFixed(2);
  const llwRate            = settings.llwRate    || CFG.LLW_RATE;
  const oncostPct          = settings.oncostPct  || CFG.ONCOST_PCT;
  const labourCostPerMonth = +(hoursPerMonth * llwRate * (1 + oncostPct)).toFixed(2);
  const suppliesPerMonth   = Math.max(+(areaMq * (bm.suppliesPerM2PerMonth || settings.defaultSuppliesPerM2 || 0.08)).toFixed(2), settings.minSuppliesPerMonth || 15);
  const travelAllowance    = resolveTravelAllowance(lead.postcode, settings);
  const directCostPerMonth = +(labourCostPerMonth + suppliesPerMonth + travelAllowance).toFixed(2);
  const scenarios = {
    aggressive: calcScenario(directCostPerMonth, 0.19, llwRate, hoursPerMonth, settings),
    balanced:   calcScenario(directCostPerMonth, 0.25, llwRate, hoursPerMonth, settings),
    protected:  calcScenario(directCostPerMonth, 0.30, llwRate, hoursPerMonth, settings)
  };
  const risks = assessRisks({ areaMq, hoursPerWeek, visitsPerWeek, suppliesPerMonth, directCostPerMonth, scenarios, lead, settings, bm, travelAllowance, llwRate, hoursPerMonth });
  const sensitivity = {
    wage5pct:  calcScenario(labourCostPerMonth * 1.05 + suppliesPerMonth + travelAllowance, 0.25, llwRate * 1.05, hoursPerMonth, settings),
    wage10pct: calcScenario(labourCostPerMonth * 1.10 + suppliesPerMonth + travelAllowance, 0.25, llwRate * 1.10, hoursPerMonth, settings)
  };
  return { areaMq, intensity, hoursPerVisit, visitsPerWeek, hoursPerWeek, hoursPerMonth, llwRate, labourCostPerMonth, suppliesPerMonth, travelAllowance, directCostPerMonth, scenarios, risks, riskCount: risks.filter(r => r.severity === 'high').length, sensitivity, generatedAt: new Date().toISOString(), dataQuality: lead.areaMq > 0 ? 'actual' : 'estimated' };
}
function calcScenario(directCost, marginPct, llwRate, hoursPerMonth, settings) {
  const safePct         = Math.max(marginPct, settings.absoluteMinMarginPct || 0.12);
  const revenuePerMonth = +(directCost / (1 - safePct)).toFixed(2);
  const profitPerMonth  = +(revenuePerMonth - directCost).toFixed(2);
  return {
    marginPct:       +(safePct * 100).toFixed(1),
    effectiveMargin: +((profitPerMonth / revenuePerMonth) * 100).toFixed(1),
    revenuePerMonth,
    revenuePerWeek:  +(revenuePerMonth / 4.333).toFixed(2),
    profitPerMonth,
    hourlyRate:      hoursPerMonth > 0 ? +(revenuePerMonth / hoursPerMonth).toFixed(2) : 0
  };
}
function assessRisks(ctx) {
  const risks = [];
  const { areaMq, hoursPerWeek, visitsPerWeek, suppliesPerMonth, directCostPerMonth, scenarios, lead, settings, bm, travelAllowance, llwRate, hoursPerMonth } = ctx;
  const req = (lead.requirements || '').toLowerCase();
  if ((req.includes('deep') || req.includes('intensive')) && visitsPerWeek < 2)
    risks.push({ code:'DEEP_CLEAN_FREQ_MISMATCH', severity:'high', message:'Deep clean requested but frequency is low — confirm if one-off or ongoing', action:'Clarify scope before pricing' });
  const travelPct = travelAllowance / directCostPerMonth;
  if (travelPct > 0.10)
    risks.push({ code:'TRAVEL_HIGH', severity:'medium', message:'Travel allowance is ' + (travelPct*100).toFixed(0) + '% of direct cost', action:'Verify site location and consider travel surcharge' });
  if (scenarios.aggressive.hourlyRate < llwRate * 1.05 * (1 + (settings.oncostPct || CFG.ONCOST_PCT)) * 1.10)
    risks.push({ code:'WAGE_SENSITIVITY', severity:'high', message:'Aggressive scenario margin erodes below minimum with 5% wage rise', action:'Use Balanced or Protected scenario for this contract' });
  if (suppliesPerMonth < (settings.minSuppliesPerMonth || 15))
    risks.push({ code:'SUPPLIES_BELOW_MIN', severity:'medium', message:'Supplies estimate £' + suppliesPerMonth.toFixed(2) + ' is below £' + (settings.minSuppliesPerMonth || 15) + ' minimum', action:'Apply minimum supplies floor before quoting' });
  if (hoursPerWeek < 4)
    risks.push({ code:'SMALL_JOB', severity:'low', message:'Job is small (' + hoursPerWeek + ' hrs/week) — minimum charge may apply', action:'Confirm minimum contract value with client' });
  if (!lead.areaMq || lead.areaMq <= 0)
    risks.push({ code:'AREA_ESTIMATED', severity:'low', message:'Premises size not provided — hours estimated from facility type benchmark', action:'Request actual m² before finalising quote' });
  if (lead.cleaningFrequency === 'one-off' || lead.cleaningFrequency === 'once')
    risks.push({ code:'ONE_OFF_CLEAN', severity:'medium', message:'One-off clean — no recurring revenue. Price at Protected scenario minimum.', action:'Consider one-off premium of 10-15% and no contract discount' });
  return risks;
}
function resolveFrequency(freq) {
  const map = { 'daily':5,'5x':5,'5x week':5,'five times':5,'3x':3,'3x week':3,'three times':3,'twice':2,'2x':2,'2x week':2,'weekly':1,'once a week':1,'fortnightly':0.5,'every two weeks':0.5,'monthly':0.23,'one-off':1,'once':1,'other':1 };
  return map[(freq || 'weekly').toLowerCase().trim()] || 1;
}
function resolveIntensity(requirements) {
  const req = (requirements || '').toLowerCase();
  const hi  = ['deep clean','intensive','medical grade','clinical','sanitise','sanitize','disinfect','heavy duty','grout','oven','kitchen','post-construction','builders clean'];
  const lo  = ['light','minimal','tidy','quick','basic'];
  if (hi.some(w => req.includes(w))) return 'high';
  if (lo.some(w => req.includes(w))) return 'low';
  return 'normal';
}
function resolveTravelAllowance(postcode, settings) {
  if (!postcode) return settings.travelLondonInner || 20;
  const pc = postcode.replace(/\s/g, '').toUpperCase();
  if (/^(EC|WC|E1W|SE1|SW1|W1|WC2|N1|NW1|NW3|SE11)/i.test(pc)) return settings.travelLondonInner || 20;
  if (/^(SW|SE|N|NW|E|W|EN|HA|TW|KT|SM|CR|BR|DA|IG|RM|UB|SL|WD)/i.test(pc)) return settings.travelLondonOuter || 35;
  return settings.travelOutOfLondon || 55;
}
function handleOneOffClean(lead, intel) {
  if (lead.cleaningFrequency === 'one-off' || lead.cleaningFrequency === 'once') {
    ['aggressive','balanced','protected'].forEach(function(k) {
      intel.scenarios[k].revenuePerMonth = +(intel.scenarios[k].revenuePerMonth * 1.12).toFixed(2);
      intel.scenarios[k].revenuePerWeek  = +(intel.scenarios[k].revenuePerWeek  * 1.12).toFixed(2);
    });
    intel.oneOffPremiumApplied = true;
  }
  return intel;
}
function normaliseLead(payload) {
  let areaMq = parseFloat(payload.premisesSize) || 0;
  const unit = (payload.premisesSizeUnit || '').toLowerCase();
  if (unit === 'sqft' || unit === 'sq ft' || unit === 'ft') areaMq = +(areaMq * CFG.SQ_FT_TO_M2).toFixed(1);
  return {
    name:              (payload.name              || '').trim(),
    email:             (payload.email             || '').trim().toLowerCase(),
    phone:             (payload.phone             || '').trim(),
    postcode:          (payload.postcode          || '').trim().toUpperCase(),
    facilityType:      (payload.facilityType      || 'other').toLowerCase().trim(),
    cleaningFrequency: (payload.cleaningFrequency || 'weekly').toLowerCase().trim(),
    requirements:      (payload.requirements      || '').trim(),
    areaMq,
    premisesSizeRaw:   payload.premisesSize       || '',
    premisesSizeUnit:  unit                       || 'm2',
    source:            payload.source             || 'web_form',
    submittedAt:       new Date().toISOString()
  };
}
function storeWebLead(ss, lead) {
  const id  = genId('LEAD');
  const row = { id, companyName: lead.name, contactName: lead.name, email: lead.email, phone: lead.phone, segment: mapSegment(lead.facilityType), source: 'Website', status: 'New', notes: buildNotes({ sector: lead.facilityType, frequency: lead.cleaningFrequency, postcode: lead.postcode, areaMq: lead.areaMq > 0 ? lead.areaMq + 'm\u00B2' : '', message: lead.requirements }), createdAt: lead.submittedAt, createdBy: 'WEBHOOK', updatedAt: '', updatedBy: '' };
  appendRow(SHEET_LEADS, row);
  auditLog('WEBHOOK', 'CREATE', 'Lead', id, null, row);
  return id;
}
function createDraftQuote(ss, lead, intel, leadId) {
  const id  = genId('QUOTE');
  const now = new Date().toISOString();
  const riskSummary = intel.risks.map(r => '[' + r.severity.toUpperCase() + '] ' + r.code + ': ' + r.message).join(' | ');
  const row = { id, leadId, source:'web_form', clientName:lead.name, email:lead.email, phone:lead.phone, postcode:lead.postcode, siteAddress:lead.postcode, facilityType:lead.facilityType, segment:mapSegment(lead.facilityType), hoursPerWeek:intel.hoursPerWeek, status:'Draft', version:1, createdAt:now, createdBy:'INTEL', updatedAt:now, updatedBy:'INTEL', intel_dataQuality:intel.dataQuality, intel_hoursPerWeek:intel.hoursPerWeek, intel_visitsPerWeek:intel.visitsPerWeek, intel_hoursPerMonth:intel.hoursPerMonth, intel_suppliesPM:intel.suppliesPerMonth, intel_directCostPM:intel.directCostPerMonth, intel_aggressivePM:intel.scenarios.aggressive.revenuePerMonth, intel_aggressiveWeekly:intel.scenarios.aggressive.revenuePerWeek, intel_aggressiveHourly:intel.scenarios.aggressive.hourlyRate, intel_balancedPM:intel.scenarios.balanced.revenuePerMonth, intel_balancedWeekly:intel.scenarios.balanced.revenuePerWeek, intel_balancedHourly:intel.scenarios.balanced.hourlyRate, intel_protectedPM:intel.scenarios.protected.revenuePerMonth, intel_protectedWeekly:intel.scenarios.protected.revenuePerWeek, intel_protectedHourly:intel.scenarios.protected.hourlyRate, intel_sens5PM:intel.sensitivity.wage5pct.revenuePerMonth, intel_sens5Weekly:intel.sensitivity.wage5pct.revenuePerWeek, intel_sens5Hourly:intel.sensitivity.wage5pct.hourlyRate, intel_sens10PM:intel.sensitivity.wage10pct.revenuePerMonth, intel_sens10Weekly:intel.sensitivity.wage10pct.revenuePerWeek, intel_sens10Hourly:intel.sensitivity.wage10pct.hourlyRate, intel_riskCount:intel.riskCount, intel_riskFlags:riskSummary, chosenScenario:'' };
  appendRow(SHEET_QUOTES, row);
  auditLog('INTEL', 'CREATE', 'Quote', id, null, { source:'web_form', leadId });
  return id;
}
// ── INTEL ENDPOINTS ───────────────────────────────────────────
function getQuoteIntel(id, auth) {
  requireRole(auth, 'OpsManager');
  const q = getRowById('Quotes', id);
  if (!q) return { ok: false, error: 'Quote not found' };
  function pf(v) { return parseFloat(v || 0); }
  return {
    ok: true, quoteId: id,
    dataQuality:        q.intel_dataQuality || 'unknown',
    hoursPerWeek:       pf(q.intel_hoursPerWeek),
    visitsPerWeek:      pf(q.intel_visitsPerWeek),
    suppliesPerMonth:   pf(q.intel_suppliesPM),
    directCostPerMonth: pf(q.intel_directCostPM),
    riskFlags:          q.intel_riskFlags || '',
    riskCount:          parseInt(q.intel_riskCount || 0),
    scenarios: {
      aggressive: { revenuePerMonth: pf(q.intel_aggressivePM), revenuePerWeek: pf(q.intel_aggressiveWeekly), hourlyRate: pf(q.intel_aggressiveHourly), marginPct: 19 },
      balanced:   { revenuePerMonth: pf(q.intel_balancedPM),   revenuePerWeek: pf(q.intel_balancedWeekly),   hourlyRate: pf(q.intel_balancedHourly),   marginPct: 25 },
      protected:  { revenuePerMonth: pf(q.intel_protectedPM),  revenuePerWeek: pf(q.intel_protectedWeekly),  hourlyRate: pf(q.intel_protectedHourly),  marginPct: 30 }
    },
    sensitivity: {
      wage5pct:  { revenuePerMonth: pf(q.intel_sens5PM),  revenuePerWeek: pf(q.intel_sens5Weekly),  hourlyRate: pf(q.intel_sens5Hourly),  marginPct: 25 },
      wage10pct: { revenuePerMonth: pf(q.intel_sens10PM), revenuePerWeek: pf(q.intel_sens10Weekly), hourlyRate: pf(q.intel_sens10Hourly), marginPct: 25 }
    }
  };
}
function applyIntelToQuote(body, auth) {
  requireRole(auth, 'OpsManager');
  validate(body, ['id', 'scenario'], 'ApplyIntel');
  const q = getRowById('Quotes', body.id);
  if (!q) return { ok: false, error: 'Quote not found' };
  const key            = body.scenario;
  const revenueMonthly = parseFloat(q['intel_' + key + 'PM']     || 0);
  if (!revenueMonthly) return { ok: false, error: 'Intel data not available for scenario: ' + key };
  const updates = { hoursPerWeek: parseFloat(q.intel_hoursPerWeek || 0), hourlyRate: parseFloat(q['intel_' + key + 'Hourly'] || 0), suppliesCost: parseFloat(q.intel_suppliesPM || 0), fixedMonthly: revenueMonthly, chosenScenario: key, updatedAt: new Date().toISOString(), updatedBy: auth.userId };
  const calc = calculateQuote(Object.assign({}, q, updates));
  Object.assign(updates, { labourCost: r2(calc.labour), directCost: r2(calc.direct), revenueMonthly: r2(calc.revenue), grossMarginGBP: r2(calc.gm), grossMarginPct: r2(calc.gmPct), annualValue: r2(calc.annualValue), marginBlocked: 'false' });
  updateRow('Quotes', body.id, updates);
  auditLog(auth.userId, 'INTEL_APPLY', 'Quote', body.id, { scenario: null }, { scenario: key });
  return { ok: true, id: body.id, calc };
}
// ── INTELLIGENCE SHEET SETUP ──────────────────────────────────
function ensureIntelligenceSheets(ss) {
  // Settings sheet
  if (!ss.getSheetByName(SHEET_SETTINGS)) {
    var sh = ss.insertSheet(SHEET_SETTINGS);
    sh.getRange('A1:B1').setValues([['Setting','Value']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, 14, 2).setValues([['llwRate',13.85],['oncostPct',0.22],['absoluteMinMarginPct',0.12],['minHoursPerVisit',2],['minSuppliesPerMonth',15],['defaultMinsPerM2',0.5],['defaultSuppliesPerM2',0.08],['travelLondonInner',20],['travelLondonOuter',35],['travelOutOfLondon',55],['marginAggressive',0.19],['marginBalanced',0.25],['marginProtected',0.30],['version','1.0.0']]);
    sh.autoResizeColumns(1, 2);
  }
  // Benchmarks sheet
  if (!ss.getSheetByName(SHEET_BENCHMARKS)) {
    var bsh = ss.insertSheet(SHEET_BENCHMARKS);
    var hdrs = ['facilityType','minsPerM2','typicalM2','suppliesPerM2PerMonth','intensityDefault','deepCleanMultiplier','notes'];
    bsh.getRange(1, 1, 1, hdrs.length).setValues([hdrs]).setFontWeight('bold');
    bsh.setFrozenRows(1);
    bsh.getRange(2, 1, 11, hdrs.length).setValues([['office',0.45,200,0.07,'normal',1.8,'Standard open plan'],['medical',0.75,150,0.14,'high',2.2,'Includes sanitisation'],['school',0.55,500,0.09,'high',2.0,'Term-time variation applies'],['retail',0.40,300,0.06,'normal',1.6,'After-hours preferred'],['warehouse',0.25,800,0.04,'low',1.5,'Mainly floor maintenance'],['restaurant',0.80,120,0.16,'high',2.5,'Kitchen deep clean separate'],['gym',0.65,400,0.13,'high',2.0,'High-touch sanitisation'],['residential_block',0.50,250,0.08,'normal',1.7,'Common areas only'],['dental',0.80,100,0.15,'high',2.3,'CQC-adjacent standards'],['automotive',0.35,350,0.07,'normal',1.6,'Workshop floor included'],['other',0.50,200,0.08,'normal',1.8,'Generic fallback']]);
    bsh.autoResizeColumns(1, hdrs.length);
  }
  // Learnings sheet
  if (!ss.getSheetByName(SHEET_LEARNINGS)) {
    var lsh = ss.insertSheet(SHEET_LEARNINGS);
    var lhdrs = ['quoteId','facilityType','areaMq','actualHoursPerVisit','estimatedHoursPerVisit','variancePct','scenarioChosen','wonLost','clientRate','notes','recordedAt'];
    lsh.getRange(1, 1, 1, lhdrs.length).setValues([lhdrs]).setFontWeight('bold');
    lsh.setFrozenRows(1);
  }
}
function loadSettings(ss) {
  const sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) return {};
  const data = sh.getDataRange().getValues();
  const out  = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) out[data[i][0]] = isNaN(data[i][1]) ? data[i][1] : Number(data[i][1]);
  }
  return out;
}
function loadBenchmarks(ss) {
  const sh = ss.getSheetByName(SHEET_BENCHMARKS);
  if (!sh) return [];
  const data = sh.getDataRange().getValues(), hdrs = data[0];
  return data.slice(1).map(function(row) { var o = {}; hdrs.forEach(function(h, i) { o[h] = row[i]; }); return o; });
}
function getBenchmarkForFacility(benchmarks, facilityType) {
  const ft = (facilityType || 'other').toLowerCase().trim();
  return benchmarks.find(function(b) { return b.facilityType === ft; })
      || benchmarks.find(function(b) { return b.facilityType === 'other'; })
      || { minsPerM2: 0.5, typicalM2: 150, suppliesPerM2PerMonth: 0.08 };
}
function ensureQuotesIntelColumns() {
  try {
    const sh = getSheet().getSheetByName('Quotes');
    if (!sh) return;
    const existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const needed   = ['source','leadId','chosenScenario','intel_dataQuality','intel_hoursPerWeek','intel_visitsPerWeek','intel_hoursPerMonth','intel_suppliesPM','intel_directCostPM','intel_aggressivePM','intel_aggressiveWeekly','intel_aggressiveHourly','intel_balancedPM','intel_balancedWeekly','intel_balancedHourly','intel_protectedPM','intel_protectedWeekly','intel_protectedHourly','intel_sens5PM','intel_sens5Weekly','intel_sens5Hourly','intel_sens10PM','intel_sens10Weekly','intel_sens10Hourly','intel_riskCount','intel_riskFlags'];
    let col = existing.length + 1;
    needed.forEach(h => { if (!existing.includes(h)) { sh.getRange(1, col).setValue(h); col++; } });
    Logger.log('ensureQuotesIntelColumns: done');
  } catch(e) { Logger.log('ensureQuotesIntelColumns error: ' + e.message); }
}
// ── NOTIFICATION EMAILS ───────────────────────────────────────
function buildLeadNotificationEmail(lead, params, settings) {
  var teal = '#0D9488', charcoal = '#1F2937';
  var fields = [
    ['Name',      lead.contactName],
    ['Company',   lead.companyName !== lead.contactName ? lead.companyName : null],
    ['Email',     lead.email],
    ['Phone',     lead.phone || '—'],
    ['Service',   params.serviceType || params.sector || '—'],
    ['Postcode',  params.postcode || '—'],
    ['Frequency', params.frequency || '—'],
    ['Add-ons',   params.additionalServices || null],
    ['Segment',   lead.segment || '—'],
    ['Lead ID',   lead.id]
  ].filter(function(r){ return r[1] && r[1] !== '—' && r[1] !== null; });
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:\'Helvetica Neue\',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="padding-bottom:16px"><table cellpadding="0" cellspacing="0"><tr><td style="background:#0F766E;border-radius:8px;padding:8px;width:36px;height:36px;text-align:center;vertical-align:middle"><svg width="22" height="22" viewBox="0 0 32 32" fill="none"><path d="M8 20L12 12L16 20L20 12L24 20" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></td><td style="padding-left:10px"><span style="font-family:Georgia,serif;font-size:17px;font-weight:700;color:' + charcoal + '">Ask<span style="color:' + teal + '">Miro</span></span></td></tr></table></td></tr><tr><td style="background:#fff;border-radius:16px;overflow:hidden"><div style="height:4px;background:linear-gradient(90deg,' + teal + ',#0284C7)"></div><div style="padding:28px 32px"><div style="display:inline-block;background:#F0FDF9;border:1px solid #A7F3D0;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">🔔 New Lead</div><h2 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:' + charcoal + ';margin:0 0 4px">' + lead.companyName + '</h2><p style="font-size:13px;color:#94A3B8;margin:0 0 22px">Submitted via website &nbsp;&middot;&nbsp; ' + new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) + '</p><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:22px">' + fields.map(function(f,i){ return '<tr' + (i<fields.length-1?' style="border-bottom:1px solid #F3F4F6"':'') + '><td style="padding:10px 16px;font-size:12px;color:#94A3B8;font-weight:600;width:40%;background:#F8FAFC">' + f[0] + '</td><td style="padding:10px 16px;font-size:13px;color:' + charcoal + ';font-weight:600">' + f[1] + '</td></tr>'; }).join('') + '</table>' + (params.message ? '<div style="background:#FFFBEB;border-left:3px solid #D97706;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:22px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#D97706;margin-bottom:6px">Requirements</div><div style="font-size:13px;color:#92400E;line-height:1.6">' + params.message + '</div></div>' : '') + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:49%"><a href="mailto:' + lead.email + '" style="display:block;background:' + teal + ';color:#fff;text-align:center;padding:12px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">✉ Reply to Lead</a></td><td style="width:2%"></td><td style="width:49%"><a href="https://www.askmiro.com/ops/#/crm" style="display:block;border:1.5px solid #E2E8F0;color:#475569;text-align:center;padding:11px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">View in CRM →</a></td></tr></table></div></td></tr><tr><td style="padding:16px 8px 0;font-size:11px;color:#94A3B8;text-align:center">AskMiro Ops &nbsp;&middot;&nbsp; <a href="https://www.askmiro.com/ops/" style="color:' + teal + ';text-decoration:none">Open Dashboard</a></td></tr></table></td></tr></table></body></html>';
}
function notifyOwnerNewWebLead(lead, leadId, quoteId, settings) {
  var teal = '#0D9488', charcoal = '#1F2937';
  var fields = [['Name',lead.name],['Email',lead.email],['Phone',lead.phone||'—'],['Postcode',lead.postcode||'—'],['Facility',lead.facilityType],['Frequency',lead.cleaningFrequency],['Area m²',lead.areaMq>0?lead.areaMq+' m²':'Not provided'],['Lead ID',leadId],['Draft Quote',quoteId]];
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0"><tr><td style="background:#fff;border-radius:12px;overflow:hidden"><div style="height:4px;background:linear-gradient(90deg,' + teal + ',#0284C7)"></div><div style="padding:28px 32px"><div style="display:inline-block;background:#F0FDF9;border:1px solid #A7F3D0;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">🔔 New Web Lead + Draft Quote Ready</div><h2 style="font-size:20px;font-weight:700;color:' + charcoal + ';margin:0 0 20px">' + lead.name + '</h2><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:22px">' + fields.map(function(f,i,a){ return '<tr style="' + (i<a.length-1?'border-bottom:1px solid #F3F4F6':'') + '"><td style="padding:9px 14px;font-size:12px;color:#94A3B8;background:#F8FAFC;width:38%">' + f[0] + '</td><td style="padding:9px 14px;font-size:13px;color:' + charcoal + ';font-weight:600">' + f[1] + '</td></tr>'; }).join('') + '</table>' + (lead.requirements ? '<div style="background:#FFFBEB;border-left:3px solid #D97706;border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:22px;font-size:13px;color:#92400E;line-height:1.6"><strong>Requirements:</strong> ' + lead.requirements + '</div>' : '') + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:49%"><a href="https://www.askmiro.com/ops/#/quotes/' + quoteId + '" style="display:block;background:' + teal + ';color:#fff;text-align:center;padding:12px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">View Draft Quote + Intel →</a></td><td style="width:2%"></td><td style="width:49%"><a href="mailto:' + lead.email + '" style="display:block;border:1.5px solid #E2E8F0;color:#475569;text-align:center;padding:11px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">✉ Reply to Lead</a></td></tr></table></div></td></tr><tr><td style="padding:14px 8px 0;font-size:11px;color:#94A3B8;text-align:center">AskMiro Ops · Intelligence Engine v3.0</td></tr></table></td></tr></table></body></html>';
  try { GmailApp.sendEmail(settings.emailFrom || 'info@askmiro.com', '🔔 New Web Lead + Draft Quote Ready: ' + lead.name, '', { htmlBody: html, name: 'AskMiro Ops', replyTo: lead.email }); }
  catch(e) { Logger.log('notifyOwnerNewWebLead failed: ' + e.message); }
}
// ── ONE-TIME SETUP ────────────────────────────────────────────
function setupIntelligenceSheets() {
  ensureIntelligenceSheets(getSheet());
  ensureQuotesIntelColumns();
  Logger.log('✓ Intelligence sheets initialised. Version: ' + CFG.VERSION);
}
function setupLeadsColumns() {
  try {
    const sh = getSheet().getSheetByName('Leads');
    if (!sh) { Logger.log('Leads sheet not found'); return; }
    const existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const needed   = ['serviceType', 'postcode', 'frequency', 'additionalServices'];
    let col = existing.length + 1;
    needed.forEach(h => {
      if (!existing.includes(h)) { sh.getRange(1, col).setValue(h); col++; }
    });
    invalidateCache('Leads');
    Logger.log('✓ Leads columns updated: ' + needed.join(', '));
  } catch(e) { Logger.log('setupLeadsColumns error: ' + e.message); }
}
// ══════════════════════════════════════════════════════════════
// AI RECEPTIONIST — v1.0.0
// Routes, Vapi webhook handler, call logging, task creation
// ══════════════════════════════════════════════════════════════
// ── ROUTE REGISTRATION ──────────────────────────────────────
// ADD these two lines to routeGet() switch:
//   case 'voice.calls':   return getVoiceCalls(params, auth);
//   case 'voice.call':    return getVoiceCall(params.id, auth);
//
// ADD these two lines to routePost() switch:
//   case 'voice.callback': return saveCallbackTask(body, auth);
//   case 'voice.convert':  return convertCallToLead(body, auth);
//
// ADD this line to the top of handleRequest() BEFORE auth check:
//   if (action === 'webhook.vapi') return handleVapiWebhook(e);
// ── VAPI WEBHOOK HANDLER ─────────────────────────────────────
// Called by Vapi at end of each call. No auth required (uses secret).
// Vapi config: set Server URL to your GAS /exec URL with ?action=webhook.vapi
// Set the webhook secret in Settings sheet row: key=vapiSecret, value=YOUR_SECRET
function handleVapiWebhook(e) {
  try {
    var raw  = e.postData ? e.postData.contents : '';
    var data = raw ? JSON.parse(raw) : {};
    // Verify Vapi secret (set vapiSecret in Settings sheet)
    var settings = getSettingsObj();
    var secret   = settings.vapiSecret || '';
    var incoming = (e.parameter && e.parameter.secret) || (data.secret || '');
    if (secret && incoming !== secret) {
      logError(new Error('Vapi webhook: invalid secret'));
      return jsonResponse({ error: 'Unauthorized' });
    }
    // Vapi sends a `message` object with type = end-of-call-report
    var msg  = data.message || data;
    var type = msg.type || '';
    if (type !== 'end-of-call-report') {
      // Acknowledge other event types silently
      return jsonResponse({ ok: true, ignored: true });
    }
    // ── Extract call data from Vapi's end-of-call-report ────
    var call        = msg.call       || {};
    var analysis    = msg.analysis   || {};
    var artifact    = msg.artifact   || {};
    var customer    = call.customer  || {};
    // Analysis fields — these come from Vapi's structuredData
    // Configure in Vapi assistant prompt: extract these fields
    var structured  = analysis.structuredData || {};
    var callRecord = {
      id:           genId('CALL'),
      vapiCallId:   call.id         || '',
      createdAt:    call.startedAt  || new Date().toISOString(),
      endedAt:      call.endedAt    || '',
      duration:     call.endedAt && call.startedAt
                      ? Math.round((new Date(call.endedAt) - new Date(call.startedAt)) / 1000) + 's'
                      : '',
      phone:        customer.number || structured.phone       || '',
      callerName:   structured.callerName    || structured.name || 'Unknown caller',
      email:        structured.email         || '',
      postcode:     structured.postcode      || '',
      buildingType: structured.buildingType  || structured.facilityType || '',
      frequency:    structured.frequency     || '',
      companyName:  structured.companyName   || '',
      intent:       structured.intent        || analysis.summary ? 'new_lead' : 'general',
      qualified:    String(structured.qualified  || (analysis.successEvaluation === 'true')),
      urgency:      structured.urgency       || 'normal',
      summary:      analysis.summary         || '',
      transcript:   artifact.transcript      || '',
      recordingUrl: artifact.recordingUrl    || '',
      status:       'Logged',
      notes:        ''
    };
    // Save to VoiceCalls sheet
    appendRow('VoiceCalls', callRecord);
    // Auto-notify owner for urgent or qualified calls
    var notify = (callRecord.urgency === 'urgent') || (callRecord.qualified === 'true');
    if (notify) {
      _notifyOwnerVoiceLead(callRecord, settings);
    }
    // Auto-create a lead record if qualified
    if (callRecord.qualified === 'true' && callRecord.phone) {
      var existingLeads = getTableRows('Leads');
      var alreadyExists = existingLeads.some(function(l) {
        return l.phone && l.phone === callRecord.phone;
      });
      if (!alreadyExists) {
        var leadId = genId('LEAD');
        appendRow('Leads', {
          id:          leadId,
          companyName: callRecord.companyName || callRecord.callerName || 'Phone Lead',
          contactName: callRecord.callerName,
          email:       callRecord.email || ('unknown-' + Date.now() + '@placeholder.local'),
          phone:       callRecord.phone,
          postcode:    callRecord.postcode,
          segment:     callRecord.buildingType || 'General',
          source:      'AI Receptionist',
          status:      'New',
          createdAt:   new Date().toISOString(),
          notes:       'Postcode: ' + callRecord.postcode
                     + ' | Frequency: ' + callRecord.frequency
                     + ' | Summary: ' + callRecord.summary
        });
        callRecord.linkedLeadId = leadId;
        Logger.log('Auto-created lead ' + leadId + ' from Vapi call ' + callRecord.id);
      }
    }
    return jsonResponse({ ok: true, callId: callRecord.id });
  } catch(err) {
    logError(err);
    return jsonResponse({ error: err.message });
  }
}
// ── VOICE CALL GETTERS ───────────────────────────────────────
function getVoiceCalls(params, auth) {
  var rows = getTableRows('VoiceCalls');
  // Non-owners only see non-sensitive data
  if (auth.role !== 'Owner') {
    rows = rows.map(function(r) {
      return {
        id: r.id, callerName: r.callerName, buildingType: r.buildingType,
        status: r.status, urgency: r.urgency, intent: r.intent,
        qualified: r.qualified, createdAt: r.createdAt, summary: r.summary
      };
    });
  }
  // Filter
  if (params && params.status) {
    rows = rows.filter(function(r) { return r.status === params.status; });
  }
  if (params && params.qualified) {
    rows = rows.filter(function(r) { return r.qualified === params.qualified; });
  }
  // Sort newest first
  rows.sort(function(a, b) {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  return { rows: rows, total: rows.length };
}
function getVoiceCall(id, auth) {
  var rows = getTableRows('VoiceCalls');
  var call = rows.find(function(r) { return r.id === id; });
  if (!call) throw new Error('Call not found: ' + id);
  return call;
}
// ── CALLBACK TASK ────────────────────────────────────────────
function saveCallbackTask(body, auth) {
  validate(body, ['callId'], 'CallbackTask');
  var call = getVoiceCall(body.callId, auth);
  var id   = genId('TASK');
  appendRow('Tasks', {
    id,
    title:       'Call back ' + (call.callerName || 'new caller'),
    status:      'Open',
    priority:    call.urgency === 'urgent' ? 'High' : 'Normal',
    relatedType: 'VoiceCall',
    relatedId:   call.id,
    assignedTo:  auth.userId,
    createdAt:   new Date().toISOString(),
    notes:       'Phone: ' + call.phone + ' | Summary: ' + (call.summary || call.transcript || '').slice(0, 200)
  });
  auditLog(auth.userId, 'CREATE', 'Task', id, null, { relatedId: call.id });
  return { ok: true, id };
}
// ── CONVERT CALL TO LEAD ─────────────────────────────────────
function convertCallToLead(body, auth) {
  validate(body, ['callId'], 'ConvertCallToLead');
  var call = getVoiceCall(body.callId, auth);
  var id   = genId('LEAD');
  appendRow('Leads', {
    id,
    companyName: call.companyName || call.callerName || 'Phone Lead',
    contactName: call.callerName  || 'Unknown',
    email:       call.email       || ('unknown-' + Date.now() + '@placeholder.local'),
    phone:       call.phone       || '',
    postcode:    call.postcode    || '',
    segment:     call.buildingType || 'General',
    source:      'AI Receptionist',
    status:      'New',
    createdAt:   new Date().toISOString(),
    notes:       'Postcode: ' + call.postcode
                 + ' | Frequency: '  + call.frequency
                 + ' | Summary: '    + (call.summary || '').slice(0, 300)
  });
  updateRow('VoiceCalls', body.callId, { status: 'Converted', linkedLeadId: id });
  auditLog(auth.userId, 'CONVERT', 'VoiceCall', body.callId, null, { leadId: id });
  return { ok: true, leadId: id };
}
// ── OWNER NOTIFICATION EMAIL ─────────────────────────────────
function _notifyOwnerVoiceLead(call, settings) {
  try {
    var teal = '#0D9488', charcoal = '#1F2937';
    var urgentBadge = call.urgency === 'urgent'
      ? '<div style="display:inline-block;background:#FEF2F2;border:1px solid #FECACA;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">🚨 Urgent Call</div>'
      : '<div style="display:inline-block;background:#F0FDF9;border:1px solid #A7F3D0;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">📞 Qualified Call Lead</div>';
    var rows = [
      ['Caller',    call.callerName],
      ['Phone',     call.phone     || '—'],
      ['Postcode',  call.postcode  || '—'],
      ['Type',      call.buildingType || '—'],
      ['Frequency', call.frequency || '—'],
      ['Duration',  call.duration  || '—'],
      ['Call ID',   call.id]
    ];
    var tableHtml = '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:20px">'
      + rows.map(function(r, i) {
          return '<tr' + (i < rows.length - 1 ? ' style="border-bottom:1px solid #F3F4F6"' : '') + '>'
               + '<td style="padding:9px 14px;font-size:12px;color:#94A3B8;background:#F8FAFC;width:36%">' + r[0] + '</td>'
               + '<td style="padding:9px 14px;font-size:13px;color:' + charcoal + ';font-weight:600">' + r[1] + '</td></tr>';
        }).join('')
      + '</table>';
    var summaryBlock = call.summary
      ? '<div style="background:#FFFBEB;border-left:3px solid #D97706;border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:20px;font-size:13px;color:#92400E;line-height:1.6"><strong>AI Summary:</strong> ' + call.summary + '</div>'
      : '';
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,sans-serif">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">'
      + '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px">'
      + '<tr><td style="background:#fff;border-radius:12px;overflow:hidden">'
      + '<div style="height:4px;background:linear-gradient(90deg,' + teal + ',#0284C7)"></div>'
      + '<div style="padding:28px 32px">'
      + urgentBadge
      + '<h2 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:' + charcoal + ';margin:0 0 18px">' + (call.callerName || 'New call') + '</h2>'
      + tableHtml + summaryBlock
      + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
      + '<td style="width:49%"><a href="https://www.askmiro.com/ops/#/reception" style="display:block;background:' + teal + ';color:#fff;text-align:center;padding:12px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">View in Reception →</a></td>'
      + '<td style="width:2%"></td>'
      + '<td style="width:49%"><a href="tel:' + call.phone.replace(/\s/g,'') + '" style="display:block;border:1.5px solid #E2E8F0;color:#475569;text-align:center;padding:11px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">📞 Call Back Now</a></td>'
      + '</tr></table></div></td></tr>'
      + '<tr><td style="padding:14px 8px 0;font-size:11px;color:#94A3B8;text-align:center">AskMiro Ops · AI Receptionist</td></tr>'
      + '</table></td></tr></table></body></html>';
    var subject = (call.urgency === 'urgent' ? '🚨 Urgent call: ' : '📞 New call lead: ') + (call.callerName || call.phone);
    GmailApp.sendEmail(settings.emailFrom || 'info@askmiro.com', subject, '', {
      from:     'office@askmiro.com',
      name:     'AskMiro Ops',
      htmlBody: html,
      replyTo:  call.phone ? 'tel:' + call.phone : 'info@askmiro.com'
    });
  } catch(e) {
    Logger.log('_notifyOwnerVoiceLead failed: ' + e.message);
  }
}
// ── SHEET SETUP ──────────────────────────────────────────────
// Run once manually: setupVoiceCallsSheet()
function setupVoiceCallsSheet() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName('VoiceCalls');
  if (existing) { Logger.log('VoiceCalls sheet already exists'); return; }
  var sheet = ss.insertSheet('VoiceCalls');
  var headers = [
    'id','vapiCallId','createdAt','endedAt','duration',
    'phone','callerName','email','postcode','companyName',
    'buildingType','frequency','intent','qualified','urgency',
    'summary','transcript','recordingUrl','status','linkedLeadId','notes'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
       .setBackground('#0D9488').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  Logger.log('✓ VoiceCalls sheet created with ' + headers.length + ' columns');
}
// ============================================================
// AskMiro Ops — GAS_CLEANERS_PATCH.gs
// Cleaners module backend for AskMiro_Ops_v4.gs
// ============================================================
// INSTALLATION:
//   1. In AskMiro_Ops_v4.gs → routeGet() switch, add:
//        case 'cleaners':         return getCleaners(params, auth);
//        case 'cleaner':          return getCleaner(params.id, auth);
//
//   2. In routePost() switch, add:
//        case 'cleaner.create':   return createCleaner(body, auth);
//        case 'cleaner.update':   return updateCleaner(body, auth);
//        case 'cleaner.archive':  return archiveCleaner(body, auth);
//        case 'cleaner.delete':   return deleteCleaner(body, auth);
//        case 'cleaner.setupSheet': return setupCleanersSheet(auth);
//
//   3. Paste all functions below into AskMiro_Ops_v4.gs
//      (anywhere after the helper functions section)
//
//   4. Run setupCleanersSheet() once from the GAS editor
//      to create the Cleaners tab with correct headers.
// ============================================================
// ── GET ALL CLEANERS ──────────────────────────────────────────
function getCleaners(params, auth) {
  var rows = getTableRows('Cleaners');
  // Optional: filter out archived if ?status=active
  if (params && params.status === 'active') {
    rows = rows.filter(function(r) { return r.status !== 'Archived'; });
  }
  // Sort by fullName by default
  rows.sort(function(a, b) {
    return (a.fullName || '').localeCompare(b.fullName || '');
  });
  return rows;
}
// ── GET SINGLE CLEANER ────────────────────────────────────────
function getCleaner(id, auth) {
  var row = getRowById('Cleaners', id);
  if (!row) throw new Error('Cleaner not found: ' + id);
  return row;
}
// ── CREATE CLEANER ────────────────────────────────────────────
function createCleaner(body, auth) {
  requireRole(auth, 'OpsManager');
  if (!body.firstName && !body.fullName) throw new Error('First name is required');
  var now = new Date().toISOString();
  // Build fullName from parts if not provided
  if (!body.fullName) {
    body.fullName = ((body.firstName || '') + ' ' + (body.lastName || '')).trim();
  }
  // Generate stable human-readable ID: CLN-0001, CLN-0002 ...
  var existing = getTableRows('Cleaners');
  var maxNum = 0;
  existing.forEach(function(r) {
    var m = (r.id || '').match(/^CLN-(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  var newNum = String(maxNum + 1).padStart(4, '0');
  body.id = 'CLN-' + newNum;
  body.createdAt = now;
  body.updatedAt = now;
  body.createdBy = auth.userId;
  // Default status
  if (!body.status) body.status = 'Active';
  appendRow('Cleaners', body);
  auditLog(auth.userId, 'CREATE', 'Cleaner', body.id, null, body);
  invalidateCache('Cleaners');
  return { ok: true, id: body.id, cleaner: body };
}
// ── UPDATE CLEANER ────────────────────────────────────────────
function updateCleaner(body, auth) {
  requireRole(auth, 'OpsManager');
  if (!body.id) throw new Error('Cleaner id required');
  var before = getRowById('Cleaners', body.id);
  if (!before) throw new Error('Cleaner not found: ' + body.id);
  body.updatedAt  = new Date().toISOString();
  body.updatedBy  = auth.userId;
  // Sanitise time fields
  if (body.availableStartTime) body.availableStartTime = _formatTimeParam(body.availableStartTime);
  if (body.availableEndTime)   body.availableEndTime   = _formatTimeParam(body.availableEndTime);
  // Rebuild fullName if first/last changed
  if ((body.firstName || body.lastName) && !body.fullName) {
    body.fullName = ((body.firstName || before.firstName || '') + ' ' + (body.lastName || before.lastName || '')).trim();
  }
  var updated = updateRow('Cleaners', body.id, body);
  if (!updated) throw new Error('Row not found for id: ' + body.id);
  auditLog(auth.userId, 'UPDATE', 'Cleaner', body.id, before, body);
  invalidateCache('Cleaners');
  return { ok: true, id: body.id };
}
// ── ARCHIVE CLEANER ───────────────────────────────────────────
function archiveCleaner(body, auth) {
  requireRole(auth, 'OpsManager');
  if (!body.id) throw new Error('Cleaner id required');
  var before = getRowById('Cleaners', body.id);
  if (!before) throw new Error('Cleaner not found: ' + body.id);
  updateRow('Cleaners', body.id, {
    status:    'Archived',
    updatedAt: new Date().toISOString(),
    updatedBy: auth.userId
  });
  auditLog(auth.userId, 'ARCHIVE', 'Cleaner', body.id, { status: before.status }, { status: 'Archived' });
  invalidateCache('Cleaners');
  return { ok: true, id: body.id };
}
// ── DELETE CLEANER (hard, admin only) ─────────────────────────
function deleteCleaner(body, auth) {
  requireRole(auth, 'Owner');
  if (!body.id) throw new Error('Cleaner id required');
  var tab  = getTab('Cleaners');
  var data = tab.getDataRange().getValues();
  var hdrs = data[0].map(function(h) { return String(h).trim(); });
  var idCol = hdrs.indexOf('id');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === body.id) {
      tab.deleteRow(i + 1);
      auditLog(auth.userId, 'DELETE', 'Cleaner', body.id, null, null);
      invalidateCache('Cleaners');
      return { ok: true, id: body.id };
    }
  }
  throw new Error('Cleaner row not found: ' + body.id);
}
// ── SETUP SHEET ───────────────────────────────────────────────
// Run this ONCE from the GAS editor: Run → setupCleanersSheet()
function setupCleanersSheet() {
  var ss  = getSheet();
  var tab = ss.getSheetByName('Cleaners');
  if (tab) {
    Logger.log('Cleaners sheet already exists.');
    return { ok: true, message: 'Already exists' };
  }
  tab = ss.insertSheet('Cleaners');
  var headers = [
    // Core Identity
    'id', 'fullName', 'firstName', 'lastName', 'phone', 'email', 'profilePhoto',
    'status', 'cleanerType',
    // Location
    'homePostcode', 'borough', 'city', 'maxTravelDistanceMiles', 'areasCovered', 'willingToTravel',
    // Capability
    'servicesOffered', 'yearsExperience',
    'commercialExperience', 'domesticExperience', 'educationSectorExperience',
    'medicalCleaningExperience', 'dealershipCleaningExperience', 'communalCleaningExperience',
    // Compliance
    'dbsStatus', 'rightToWorkChecked', 'referencesChecked', 'hasInsurance', 'complianceStatus',
    // Availability
    'availabilityType', 'availableDays', 'availableStartTime', 'availableEndTime',
    'emergencyCover', 'startDateAvailable', 'currentlyAvailable',
    // Transport
    'transportMode', 'hasDrivingLicence', 'hasOwnVehicle',
    // Commercial
    'hourlyRate', 'preferredMinimumShiftHours', 'payrollType', 'invoiceRequired',
    // Operations
    'uniformSize', 'trainingCompleted', 'notes', 'tags', 'lastWorkedDate',
    'performanceRating', 'reliabilityRating', 'source',
    // Relations (future)
    'preferredSites', 'blacklistedSites', 'currentAssignedSiteId', 'lastJobId', 'lastTimesheetId',
    // Meta
    'createdAt', 'updatedAt', 'createdBy', 'updatedBy'
  ];
  // Write headers in row 1
  tab.getRange(1, 1, 1, headers.length).setValues([headers]);
  // Style header row
  var hRange = tab.getRange(1, 1, 1, headers.length);
  hRange.setBackground('#0D1C2E');
  hRange.setFontColor('#FFFFFF');
  hRange.setFontWeight('bold');
  hRange.setFontSize(11);
  // Freeze header
  tab.setFrozenRows(1);
  // Set column widths for readability
  tab.setColumnWidth(1, 90);   // id
  tab.setColumnWidth(2, 160);  // fullName
  tab.setColumnWidth(3, 100);  // firstName
  tab.setColumnWidth(4, 100);  // lastName
  tab.setColumnWidth(5, 130);  // phone
  tab.setColumnWidth(6, 200);  // email
  Logger.log('✅ Cleaners sheet created with ' + headers.length + ' columns.');
  return { ok: true, message: 'Cleaners sheet created', columns: headers.length };
}
// ── SEED SHEET (optional, run once for testing) ───────────────
// Run from GAS editor: Run → seedCleanersSheet()
function seedCleanersSheet() {
  var auth = { userId: 'system', role: 'Admin' };
  var seed = [
    { firstName:'Maria',     lastName:'Santos',      phone:'07911 234561', email:'maria.santos@email.com',      status:'Active',   cleanerType:'Subcontractor', homePostcode:'SW18 2QA', borough:'Wandsworth',    city:'London', maxTravelDistanceMiles:'8',  areasCovered:'SW London|Wandsworth|Clapham',               willingToTravel:'Yes', servicesOffered:'Office Cleaning|Residential|Deep Clean',          yearsExperience:'6',  commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No',  communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Fri',          availableStartTime:'06:00', availableEndTime:'18:00', emergencyCover:'Yes', startDateAvailable:'',         currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  hourlyRate:'13.50', preferredMinimumShiftHours:'3', payrollType:'Self-employed', invoiceRequired:'No',  uniformSize:'M',  trainingCompleted:'Yes', notes:'Highly reliable. Office contracts in SW London.',            tags:'reliable|sw-london|office',            performanceRating:'5', reliabilityRating:'5', source:'Referral',            lastWorkedDate:'2026-03-10' },
    { firstName:'James',     lastName:'Okafor',      phone:'07922 345672', email:'james.okafor@email.com',      status:'Active',   cleanerType:'Employee',       homePostcode:'E1 6PX',  borough:'Tower Hamlets', city:'London', maxTravelDistanceMiles:'10', areasCovered:'East London|Tower Hamlets|Canary Wharf',             willingToTravel:'Yes', servicesOffered:'Office Cleaning|Communal|Medical',                 yearsExperience:'8',  commercialExperience:'Yes', domesticExperience:'No',  medicalCleaningExperience:'Yes', educationSectorExperience:'No',  dealershipCleaningExperience:'No',  communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Sat',          availableStartTime:'05:00', availableEndTime:'14:00', emergencyCover:'Yes', startDateAvailable:'',         currentlyAvailable:'Yes', transportMode:'Car',              hasDrivingLicence:'Yes', hasOwnVehicle:'Yes', hourlyRate:'14.50', preferredMinimumShiftHours:'4', payrollType:'PAYE',          invoiceRequired:'No',  uniformSize:'L',  trainingCompleted:'Yes', notes:'Senior cleaner. Medical training completed.',                tags:'senior|driver|medical|east-london',     performanceRating:'5', reliabilityRating:'5', source:'Direct Application',  lastWorkedDate:'2026-03-11' },
    { firstName:'Ana',       lastName:'Lima',        phone:'07933 456783', email:'ana.lima@email.com',          status:'Active',   cleanerType:'Subcontractor', homePostcode:'N7 8EG',  borough:'Islington',     city:'London', maxTravelDistanceMiles:'5',  areasCovered:'North London|Islington|Holloway',                    willingToTravel:'Yes', servicesOffered:'Residential|Deep Clean|End of Tenancy',            yearsExperience:'4',  commercialExperience:'No',  domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No',  communalCleaningExperience:'No',  dbsStatus:'Basic',    rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Part-time',  availableDays:'Mon–Wed,Fri',      availableStartTime:'09:00', availableEndTime:'17:00', emergencyCover:'No',  startDateAvailable:'',         currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  hourlyRate:'13.00', preferredMinimumShiftHours:'2', payrollType:'Self-employed', invoiceRequired:'Yes', uniformSize:'S',  trainingCompleted:'Yes', notes:'Deep clean and EOT specialist. Self-invoices.',              tags:'eot|deep-clean|north-london',          performanceRating:'4', reliabilityRating:'4', source:'Indeed',              lastWorkedDate:'2026-03-08' },
    { firstName:'Tomasz',    lastName:'Kowalski',    phone:'07944 567894', email:'tomasz.k@email.com',          status:'Active',   cleanerType:'Subcontractor', homePostcode:'SE15 4AQ',borough:'Southwark',     city:'London', maxTravelDistanceMiles:'12', areasCovered:'SE London|Southwark|Bermondsey|Peckham',             willingToTravel:'Yes', servicesOffered:'Office Cleaning|Communal|Automotive',              yearsExperience:'5',  commercialExperience:'Yes', domesticExperience:'No',  medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'Yes', communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'Yes', complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Fri',          availableStartTime:'05:30', availableEndTime:'17:00', emergencyCover:'Yes', startDateAvailable:'',         currentlyAvailable:'Yes', transportMode:'Van',              hasDrivingLicence:'Yes', hasOwnVehicle:'Yes', hourlyRate:'15.00', preferredMinimumShiftHours:'4', payrollType:'Self-employed', invoiceRequired:'Yes', uniformSize:'XL', trainingCompleted:'Yes', notes:'Has own transit van. Dealerships and communal blocks.',      tags:'van|driver|automotive|south-london',   performanceRating:'5', reliabilityRating:'5', source:'Referral',            lastWorkedDate:'2026-03-11' },
    { firstName:'Blessing',  lastName:'Osei',        phone:'07955 678905', email:'blessing.osei@email.com',     status:'Active',   cleanerType:'Agency',         homePostcode:'UB3 1ND', borough:'Hillingdon',    city:'London', maxTravelDistanceMiles:'8',  areasCovered:'West London|Hillingdon|Hayes|Uxbridge',              willingToTravel:'No',  servicesOffered:'Office Cleaning|Residential',                     yearsExperience:'2',  commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No',  communalCleaningExperience:'No',  dbsStatus:'Basic',    rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Pending', availabilityType:'Part-time',  availableDays:'Tue,Thu,Sat',      availableStartTime:'08:00', availableEndTime:'16:00', emergencyCover:'No',  startDateAvailable:'',         currentlyAvailable:'No',  transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  hourlyRate:'12.50', preferredMinimumShiftHours:'3', payrollType:'Agency',        invoiceRequired:'No',  uniformSize:'M',  trainingCompleted:'No',  notes:'Agency placement. References pending.',                     tags:'west-london|agency|pending',           performanceRating:'3', reliabilityRating:'3', source:'Agency',              lastWorkedDate:'2026-02-28' },
    { firstName:'Iryna',     lastName:'Petrenko',    phone:'07966 789016', email:'iryna.p@email.com',           status:'Active',   cleanerType:'Subcontractor', homePostcode:'NW2 3BA', borough:'Brent',         city:'London', maxTravelDistanceMiles:'8',  areasCovered:'NW London|Brent|Kilburn|Wembley',                    willingToTravel:'Yes', servicesOffered:'Residential|Deep Clean|Medical',                  yearsExperience:'7',  commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'Yes', educationSectorExperience:'No',  dealershipCleaningExperience:'No',  communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Sat',          availableStartTime:'07:00', availableEndTime:'20:00', emergencyCover:'Yes', startDateAvailable:'',         currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  hourlyRate:'14.00', preferredMinimumShiftHours:'3', payrollType:'Self-employed', invoiceRequired:'No',  uniformSize:'S',  trainingCompleted:'Yes', notes:'Healthcare background. Recommended for medical cleans.',     tags:'medical|nw-london|reliable',           performanceRating:'5', reliabilityRating:'5', source:'Referral',            lastWorkedDate:'2026-03-09' },
    { firstName:'David',     lastName:'Mensah',      phone:'07977 890127', email:'david.mensah@email.com',      status:'Active',   cleanerType:'Employee',       homePostcode:'SE5 8DG', borough:'Camberwell',    city:'London', maxTravelDistanceMiles:'7',  areasCovered:'SE London|Camberwell|Brixton|Peckham',               willingToTravel:'Yes', servicesOffered:'Office Cleaning|Educational|Communal',            yearsExperience:'3',  commercialExperience:'Yes', domesticExperience:'No',  medicalCleaningExperience:'No',  educationSectorExperience:'Yes', dealershipCleaningExperience:'No',  communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Evenings',   availableDays:'Mon–Fri evenings', availableStartTime:'17:00', availableEndTime:'23:00', emergencyCover:'Yes', startDateAvailable:'',         currentlyAvailable:'Yes', transportMode:'Bicycle',          hasDrivingLicence:'Yes', hasOwnVehicle:'No',  hourlyRate:'13.50', preferredMinimumShiftHours:'3', payrollType:'PAYE',          invoiceRequired:'No',  uniformSize:'M',  trainingCompleted:'Yes', notes:'DBS Enhanced (schools). Evenings specialist.',              tags:'schools|evenings|dbs-enhanced|south-london', performanceRating:'4', reliabilityRating:'5', source:'Direct Application',  lastWorkedDate:'2026-03-10' },
    { firstName:'Fatima',    lastName:'Al-Rashid',   phone:'07988 901238', email:'fatima.alr@email.com',        status:'Active',   cleanerType:'Subcontractor', homePostcode:'E3 4PZ',  borough:'Tower Hamlets', city:'London', maxTravelDistanceMiles:'6',  areasCovered:'East London|Tower Hamlets|Bow|Bethnal Green',        willingToTravel:'Yes', servicesOffered:'Residential|Office Cleaning|Deep Clean',          yearsExperience:'5',  commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No',  communalCleaningExperience:'Yes', dbsStatus:'Basic',    rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Expiring', availabilityType:'Full-time',  availableDays:'Mon–Sat',          availableStartTime:'06:00', availableEndTime:'18:00', emergencyCover:'No',  startDateAvailable:'',         currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  hourlyRate:'13.00', preferredMinimumShiftHours:'3', payrollType:'Self-employed', invoiceRequired:'No',  uniformSize:'S',  trainingCompleted:'Yes', notes:'DBS expiring 6 weeks — renewal requested.',                 tags:'east-london|dbs-renewal-needed',       performanceRating:'4', reliabilityRating:'4', source:'Indeed',              lastWorkedDate:'2026-03-07' },
    { firstName:'Patrick',   lastName:"O'Brien",     phone:'07999 012349', email:'patrick.ob@email.com',        status:'Inactive', cleanerType:'Subcontractor', homePostcode:'RM7 9AQ', borough:'Havering',      city:'London', maxTravelDistanceMiles:'10', areasCovered:'East London|Havering|Romford',                       willingToTravel:'No',  servicesOffered:'Office Cleaning|Automotive',                      yearsExperience:'4',  commercialExperience:'Yes', domesticExperience:'No',  medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'Yes', communalCleaningExperience:'No',  dbsStatus:'Basic',    rightToWorkChecked:'Yes', referencesChecked:'No',  hasInsurance:'No',  complianceStatus:'Pending', availabilityType:'Weekends',   availableDays:'Sat,Sun',          availableStartTime:'07:00', availableEndTime:'17:00', emergencyCover:'No',  startDateAvailable:'',         currentlyAvailable:'No',  transportMode:'Car',              hasDrivingLicence:'Yes', hasOwnVehicle:'Yes', hourlyRate:'14.00', preferredMinimumShiftHours:'4', payrollType:'Self-employed', invoiceRequired:'Yes', uniformSize:'L',  trainingCompleted:'No',  notes:'References outstanding. On hold.',                          tags:'weekends|automotive|east-london|hold', performanceRating:'3', reliabilityRating:'3', source:'Indeed',              lastWorkedDate:'2025-11-15' },
    { firstName:'Grace',     lastName:'Nkomo',       phone:'07900 123450', email:'grace.nkomo@email.com',       status:'Active',   cleanerType:'Subcontractor', homePostcode:'CR0 1NQ', borough:'Croydon',       city:'London', maxTravelDistanceMiles:'8',  areasCovered:'South London|Croydon|Sutton',                        willingToTravel:'Yes', servicesOffered:'Residential|Deep Clean|Communal',                 yearsExperience:'6',  commercialExperience:'No',  domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'No',  communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Full-time',  availableDays:'Mon–Fri',          availableStartTime:'08:00', availableEndTime:'17:00', emergencyCover:'Yes', startDateAvailable:'',         currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  hourlyRate:'13.50', preferredMinimumShiftHours:'3', payrollType:'Self-employed', invoiceRequired:'No',  uniformSize:'M',  trainingCompleted:'Yes', notes:'Highest customer satisfaction scores. Residential expert.',  tags:'croydon|reliable|residential',         performanceRating:'5', reliabilityRating:'5', source:'Referral',            lastWorkedDate:'2026-03-10' },
    { firstName:'Aleksander', lastName:'Wisniewski', phone:'07911 234561', email:'aleksander.w@email.com',      status:'Trial',    cleanerType:'Trial',         homePostcode:'W3 7QW',  borough:'Ealing',        city:'London', maxTravelDistanceMiles:'10', areasCovered:'West London|Ealing|Acton|Chiswick',                  willingToTravel:'Yes', servicesOffered:'Office Cleaning|Automotive|Deep Clean',           yearsExperience:'2',  commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'No',  dealershipCleaningExperience:'Yes', communalCleaningExperience:'No',  dbsStatus:'None',     rightToWorkChecked:'Yes', referencesChecked:'No',  hasInsurance:'No',  complianceStatus:'Pending', availabilityType:'Full-time',  availableDays:'Mon–Fri',          availableStartTime:'06:00', availableEndTime:'20:00', emergencyCover:'No',  startDateAvailable:'2026-03-20', currentlyAvailable:'Yes', transportMode:'Car',              hasDrivingLicence:'Yes', hasOwnVehicle:'Yes', hourlyRate:'13.00', preferredMinimumShiftHours:'4', payrollType:'Self-employed', invoiceRequired:'No',  uniformSize:'L',  trainingCompleted:'No',  notes:'Trial placement. DBS submitted. References pending.',        tags:'trial|west-london|driver|automotive',  performanceRating:'',  reliabilityRating:'',  source:'Indeed',              lastWorkedDate:'2026-03-05' },
    { firstName:'Sandra',    lastName:'Oduya',       phone:'07922 345672', email:'sandra.oduya@email.com',      status:'Active',   cleanerType:'Subcontractor', homePostcode:'N15 4PP', borough:'Haringey',      city:'London', maxTravelDistanceMiles:'7',  areasCovered:'North London|Haringey|Tottenham|Wood Green',         willingToTravel:'Yes', servicesOffered:'Residential|Educational|Communal',                yearsExperience:'9',  commercialExperience:'Yes', domesticExperience:'Yes', medicalCleaningExperience:'No',  educationSectorExperience:'Yes', dealershipCleaningExperience:'No',  communalCleaningExperience:'Yes', dbsStatus:'Enhanced', rightToWorkChecked:'Yes', referencesChecked:'Yes', hasInsurance:'No',  complianceStatus:'Ready',   availabilityType:'Ad-hoc',     availableDays:'Flexible',         availableStartTime:'07:00', availableEndTime:'21:00', emergencyCover:'Yes', startDateAvailable:'',         currentlyAvailable:'Yes', transportMode:'Public Transport', hasDrivingLicence:'No',  hasOwnVehicle:'No',  hourlyRate:'14.00', preferredMinimumShiftHours:'2', payrollType:'Self-employed', invoiceRequired:'No',  uniformSize:'M',  trainingCompleted:'Yes', notes:'Most flexible on roster. Same-day cover. Schools sector.',  tags:'flexible|schools|north-london|dbs-enhanced|emergency', performanceRating:'5', reliabilityRating:'5', source:'Referral', lastWorkedDate:'2026-03-11' },
  ];
  seed.forEach(function(s) { createCleaner(s, auth); });
  Logger.log('✅ Seeded ' + seed.length + ' cleaners.');
  return { ok: true, count: seed.length };
}
// ═══════════════════════════════════════════════════════════════
// PUBLIC CLEANER APPLICATION — no auth token required
// Called by join-our-team.html via JSONP GET
//
// INSTALLATION: In AskMiro_Ops_v4.gs → doGet(), before the auth
// check, add this block (same pattern as webhook.lead):
//
//   var action = e.parameter && e.parameter.action;
//   if (action === 'cleaner.apply') return applyAsCleaner(e.parameter, cb);
//
// That single line goes at the TOP of doGet(), before handleRequest().
// ═══════════════════════════════════════════════════════════════
function applyAsCleaner(params, cb) {
  try {
    var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
    // ── Ensure sheet exists ───────────────────────────────────
    var tab = ss.getSheetByName('Cleaners');
    if (!tab) {
      setupCleanersSheet({ userId: 'system', role: 'Admin' });
      tab = ss.getSheetByName('Cleaners');
    }
    // ── Build cleaner object (maps form fields → sheet cols) ──
    var now  = new Date().toISOString();
    var auth = { userId: 'public-form', role: 'Public' };
    // Auto-generate ID
    var existing = getTableRows('Cleaners');
    var nextNum  = existing.length + 1;
    var newId    = 'CLN-' + String(nextNum).padStart(4, '0');
    // Safety: ensure unique even if sheet has gaps
    var usedIds  = existing.map(function(r){ return r.id; });
    while (usedIds.indexOf(newId) !== -1) {
      nextNum++;
      newId = 'CLN-' + String(nextNum).padStart(4, '0');
    }
    var cleaner = {
      id:                          newId,
      firstName:                   (params.firstName   || '').trim(),
      lastName:                    (params.lastName    || '').trim(),
      fullName:                    ((params.firstName || '') + ' ' + (params.lastName || '')).trim(),
      phone:                       (params.phone       || '').trim(),
      email:                       (params.email       || '').trim(),
      status:                      'Trial',
      cleanerType:                 params.cleanerType  || 'Subcontractor',
      homePostcode:                (params.homePostcode|| '').toUpperCase().trim(),
      borough:                     params.borough      || '',
      city:                        'London',
      maxTravelDistanceMiles:      params.maxTravelDistanceMiles || '5',
      areasCovered:                params.borough      || '',
      willingToTravel:             params.maxTravelDistanceMiles && parseInt(params.maxTravelDistanceMiles) > 0 ? 'Yes' : 'No',
      servicesOffered:             params.servicesOffered || '',
      commercialExperience:        params.commercialExperience        || 'No',
      domesticExperience:          params.domesticExperience          || 'No',
      medicalCleaningExperience:   params.medicalCleaningExperience   || 'No',
      educationSectorExperience:   params.educationSectorExperience   || 'No',
      dealershipCleaningExperience:params.dealershipCleaningExperience|| 'No',
      communalCleaningExperience:  params.communalCleaningExperience  || 'No',
      yearsExperience:             params.yearsExperience             || '0',
      hourlyRate:                  params.hourlyRate                  || '',
      availabilityType:            params.availabilityType            || '',
      availableDays:               params.availableDays               || '',
      availableStartTime:          _formatTimeParam(params.availableStartTime),
      availableEndTime:            _formatTimeParam(params.availableEndTime),
      startDateAvailable:          params.startDateAvailable          || 'Immediately',
      emergencyCover:              params.emergencyCover              || 'No',
      currentlyAvailable:          'Yes',
      transportMode:               params.transportMode               || '',
      hasDrivingLicence:           params.hasDrivingLicence           || 'No',
      hasOwnVehicle:               params.hasOwnVehicle               || 'No',
      dbsStatus:                   params.dbsStatus                   || 'None',
      rightToWorkChecked:          params.rightToWorkChecked          || 'No',
      referencesChecked:           'No',
      hasInsurance:                'No',
      complianceStatus:            'Pending',
      payrollType:                 params.payrollType                 || 'Self-employed',
      invoiceRequired:             params.invoiceRequired             || 'No',
      uniformSize:                 '',
      trainingCompleted:           'No',
      performanceRating:           '',
      reliabilityRating:           '',
      notes:                       params.notes                       || '',
      tags:                        'new-applicant',
      source:                      'Web Application Form',
      lastWorkedDate:              '',
      createdAt:                   now,
      updatedAt:                   now
    };
    // ── Write to sheet ────────────────────────────────────────
    appendRow('Cleaners', cleaner);
    invalidateCache('Cleaners');
    // ── Log it ───────────────────────────────────────────────
    auditLog('public-form', 'CREATE', 'Cleaner', newId, null, cleaner);
    // ── Send confirmation to applicant (if they gave email) ─────
    if (cleaner.email) {
      try {
        GmailApp.sendEmail(cleaner.email, 'Application received — AskMiro Cleaning Services', '', {
          name:     'AskMiro Cleaning Services',
          replyTo:  'info@askmiro.com',
          htmlBody: buildCleanerConfirmationEmail(cleaner),
        });
      } catch(mailErr) {
        Logger.log('⚠️ Confirmation email to applicant failed: ' + mailErr);
      }
    }
    // ── Send notification email to AskMiro ───────────────────
    try {
      MailApp.sendEmail({
        to:      'info@askmiro.com',
        subject: '🧹 New Cleaner Application — ' + cleaner.fullName + ' (' + cleaner.homePostcode + ')',
        htmlBody:
          '<p><strong>New cleaner application received via the website.</strong></p>' +
          '<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">' +
          '<tr><td style="padding:6px 12px;color:#666">Name</td><td style="padding:6px 12px"><strong>' + cleaner.fullName + '</strong></td></tr>' +
          '<tr style="background:#f5f5f5"><td style="padding:6px 12px;color:#666">Phone</td><td style="padding:6px 12px">' + cleaner.phone + '</td></tr>' +
          '<tr><td style="padding:6px 12px;color:#666">Email</td><td style="padding:6px 12px">' + (cleaner.email || '—') + '</td></tr>' +
          '<tr style="background:#f5f5f5"><td style="padding:6px 12px;color:#666">Postcode</td><td style="padding:6px 12px">' + cleaner.homePostcode + '</td></tr>' +
          '<tr><td style="padding:6px 12px;color:#666">Services</td><td style="padding:6px 12px">' + cleaner.servicesOffered.replace(/\|/g, ', ') + '</td></tr>' +
          '<tr style="background:#f5f5f5"><td style="padding:6px 12px;color:#666">Availability</td><td style="padding:6px 12px">' + cleaner.availabilityType + '</td></tr>' +
          '<tr><td style="padding:6px 12px;color:#666">Transport</td><td style="padding:6px 12px">' + cleaner.transportMode + '</td></tr>' +
          '<tr style="background:#f5f5f5"><td style="padding:6px 12px;color:#666">DBS</td><td style="padding:6px 12px">' + cleaner.dbsStatus + '</td></tr>' +
          '<tr><td style="padding:6px 12px;color:#666">Sheet ID</td><td style="padding:6px 12px;color:#0A9688"><strong>' + newId + '</strong></td></tr>' +
          '</table>' +
          '<p style="margin-top:16px;color:#666;font-size:13px">Added to Cleaners tab in AskMiro Ops as status: <strong>Trial</strong></p>'
      });
    } catch(mailErr) {
      Logger.log('⚠️ Notification email failed: ' + mailErr);
    }
    var result = { ok: true, id: newId, message: 'Application received' };
    return cb
      ? ContentService.createTextOutput(cb + '(' + JSON.stringify(result) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
      : ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    Logger.log('❌ applyAsCleaner error: ' + err);
    var errResult = { ok: false, error: err.toString() };
    return cb
      ? ContentService.createTextOutput(cb + '(' + JSON.stringify(errResult) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
      : ContentService.createTextOutput(JSON.stringify(errResult)).setMimeType(ContentService.MimeType.JSON);
  }
}
// ═══════════════════════════════════════════════════════════════
// BRANDED EMAIL — Cleaner Application Confirmation
// Called inside applyAsCleaner() when applicant has provided email
// ═══════════════════════════════════════════════════════════════
function buildCleanerConfirmationEmail(cleaner) {
  var teal = '#0D9488', navy = '#0C1929', charcoal = '#1F2937', slate = '#475569';
  var muted = '#94A3B8', border = '#E2E8F0', offWhite = '#F8FAFC';
  var phone = '020 8073 0621', emailAddr = 'info@askmiro.com', web = 'www.askmiro.com';
  var company = 'AskMiro Cleaning Services';
  var name = cleaner.firstName || 'there';
  var logo = '<table cellpadding="0" cellspacing="0"><tr><td style="background:#0D9488;border-radius:9px;width:40px;height:40px;text-align:center;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="32" height="32" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0"></td></tr></table>';
  function p(t)   { return '<p style="font-family:Arial,sans-serif;font-size:14px;color:' + slate + ';line-height:1.85;margin:0 0 16px">' + t + '</p>'; }
  function h(t)   { return '<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:' + charcoal + ';margin:0 0 4px;letter-spacing:-0.5px">' + t + '</h1>'; }
  function sub(t) { return '<p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:' + teal + ';letter-spacing:1.2px;text-transform:uppercase;margin:0 0 22px">' + t + '</p>'; }
  function gr(n)  { return '<p style="font-family:Georgia,serif;font-size:17px;font-style:italic;color:' + charcoal + ';margin:0 0 18px">Dear ' + n + ',</p>'; }
  function sm(t)  { return '<p style="font-family:Arial,sans-serif;font-size:11px;color:' + muted + ';line-height:1.7;margin:0">' + t + '</p>'; }
  function div()  { return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td style="height:1px;background:' + border + '">&nbsp;</td></tr></table>'; }
  function cta(label, href) { return '<table cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:' + teal + ';border-radius:8px"><a href="' + href + '" style="display:block;padding:13px 26px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;text-decoration:none">' + label + '</a></td></tr></table>'; }
  function infoBox(rows) {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="background:' + offWhite + ';border:1px solid ' + border + ';border-radius:10px;overflow:hidden;margin-bottom:20px">'
      + rows.map(function(r, i) {
          return '<tr' + (i % 2 === 1 ? ' style="background:#fff"' : '') + '>'
            + '<td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:12px;color:' + muted + ';font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:40%">' + r[0] + '</td>'
            + '<td style="padding:9px 14px;font-family:Arial,sans-serif;font-size:13px;color:' + charcoal + ';font-weight:600">' + r[1] + '</td>'
            + '</tr>';
        }).join('')
      + '</table>';
  }
  function sig() {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px"><tr><td style="border-top:2px solid ' + teal + ';padding-top:18px"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:top">' + logo + '</td><td style="vertical-align:top"><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:' + charcoal + '">AskMiro Team</div><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:' + teal + ';letter-spacing:1px;text-transform:uppercase;margin:3px 0 8px">AskMiro Cleaning Services</div><div style="font-family:Arial,sans-serif;font-size:12px;color:' + slate + '">&#9742; <a href="tel:02080730621" style="color:' + slate + ';text-decoration:none">' + phone + '</a> &nbsp;|&nbsp; &#9993; <a href="mailto:' + emailAddr + '" style="color:' + slate + ';text-decoration:none">' + emailAddr + '</a> &nbsp;|&nbsp; <a href="https://' + web + '" style="color:' + teal + ';text-decoration:none;font-weight:600">' + web + '</a></div></td></tr></table></td></tr></table>';
  }
  function wrap(bodyContent) {
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#E8EDF4;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#E8EDF4;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:' + navy + ';border-radius:12px 0 0 0;padding:24px 28px;width:52%;vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:middle">' + logo + '</td><td style="vertical-align:middle"><div style="font-family:Georgia,serif;font-size:21px;font-weight:700;color:#fff">AskMiro</div><div style="font-family:Arial,sans-serif;font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase;margin-top:2px">Cleaning Services</div></td></tr></table></td><td style="background:' + teal + ';border-radius:0 12px 0 0;padding:24px 28px;vertical-align:bottom;text-align:right"><div style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:rgba(255,255,255,0.85)">Application Received</div></td></tr><tr><td colspan="2" style="background:' + teal + ';height:3px;font-size:3px;line-height:3px">&nbsp;</td></tr></table></td></tr><tr><td style="background:#fff;padding:36px 36px 28px;border-left:1px solid ' + border + ';border-right:1px solid ' + border + '">' + bodyContent + sig() + '</td></tr><tr><td style="background:' + navy + ';border-radius:0 0 12px 12px;padding:18px 28px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,0.6)">' + company + '</div><div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px">London &amp; UK</div></td><td align="right"><a href="https://' + web + '" style="font-family:Arial,sans-serif;font-size:12px;color:' + teal + ';text-decoration:none;font-weight:700">' + web + '</a></td></tr></table></td></tr></table></td></tr></table></body></html>';
  }
  var services = (cleaner.servicesOffered || '').replace(/\|/g, ', ');
  var infoRows = [
    ['Name',         cleaner.fullName    || '—'],
    ['Phone',        cleaner.phone       || '—'],
    ['Postcode',     cleaner.homePostcode|| '—'],
    ['Services',     services            || '—'],
    ['Availability', cleaner.availabilityType || '—'],
    ['Reference',    cleaner.id          || '—'],
  ];
  return wrap(
    h('Application received — we\'ll be in touch.') +
    sub('AskMiro Cleaning Services · London') +
    gr(name) +
    p('Thank you for applying to join the AskMiro cleaning team. We\'ve received your application and a member of our team will call you within <strong>48 hours</strong> to discuss opportunities in your area.') +
    p('Here\'s a summary of what you submitted:') +
    infoBox(infoRows) +
    p('In the meantime, if you have any questions please don\'t hesitate to give us a call or send us an email.') +
    cta('&#9742; Call us: 020 8073 0621', 'tel:02080730621') +
    div() +
    sm('This is an automated confirmation. Please do not reply directly to this email — contact us at ' + emailAddr + ' or call ' + phone + '.')
  );
}
// ═══════════════════════════════════════════════════════════════
// BRANDED EMAIL — Auto-reply for incoming inbox emails
// 
// INSTALLATION: In AskMiro_Ops_v4.gs, find where you process
// incoming Gmail messages (the inbox polling function).
// After logging/storing the email, call:
//
//   sendInboxAutoReply(senderEmail, senderName, originalSubject);
//
// Then add this function below. Also add this line to routePost():
//   case 'inbox.autoreply': return triggerAutoReply(body, auth);
// ═══════════════════════════════════════════════════════════════
function buildInboxAutoReplyEmail(senderName, originalSubject) {
  var teal = '#0D9488', navy = '#0C1929', charcoal = '#1F2937', slate = '#475569';
  var muted = '#94A3B8', border = '#E2E8F0', offWhite = '#F8FAFC';
  var phone = '020 8073 0621', emailAddr = 'info@askmiro.com', web = 'www.askmiro.com';
  var company = 'AskMiro Cleaning Services';
  var name = senderName || 'there';
  var logo = '<table cellpadding="0" cellspacing="0"><tr><td style="background:#0D9488;border-radius:9px;width:40px;height:40px;text-align:center;vertical-align:middle"><img src="https://www.askmiro.com/favicon-32x32.png" width="32" height="32" alt="AskMiro" style="display:block;border:0;border-radius:6px" border="0"></td></tr></table>';
  function p(t)   { return '<p style="font-family:Arial,sans-serif;font-size:14px;color:' + slate + ';line-height:1.85;margin:0 0 16px">' + t + '</p>'; }
  function h(t)   { return '<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:' + charcoal + ';margin:0 0 4px;letter-spacing:-0.5px">' + t + '</h1>'; }
  function sub(t) { return '<p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:' + teal + ';letter-spacing:1.2px;text-transform:uppercase;margin:0 0 22px">' + t + '</p>'; }
  function gr(n)  { return '<p style="font-family:Georgia,serif;font-size:17px;font-style:italic;color:' + charcoal + ';margin:0 0 18px">Dear ' + n + ',</p>'; }
  function sm(t)  { return '<p style="font-family:Arial,sans-serif;font-size:11px;color:' + muted + ';line-height:1.7;margin:0">' + t + '</p>'; }
  function div()  { return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td style="height:1px;background:' + border + '">&nbsp;</td></tr></table>'; }
  function cta(label, href) { return '<table cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:' + teal + ';border-radius:8px"><a href="' + href + '" style="display:block;padding:13px 26px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#fff;text-decoration:none">' + label + '</a></td><td width="10">&nbsp;</td><td style="border:2px solid ' + border + ';border-radius:8px"><a href="tel:02080730621" style="display:block;padding:11px 18px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:' + slate + ';text-decoration:none">&#9742; ' + phone + '</a></td></tr></table>'; }
  function checklist(items) {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="background:' + offWhite + ';border:1px solid ' + border + ';border-radius:10px;padding:14px 16px;margin-bottom:20px"><tbody>'
      + items.map(function(item) { return '<tr><td style="vertical-align:top;padding:0 10px 7px 0;width:22px"><div style="width:20px;height:20px;background:' + teal + ';border-radius:50%;text-align:center;line-height:21px;font-size:11px;color:white;font-weight:700">&#10003;</div></td><td style="vertical-align:top;padding-bottom:7px;font-family:Arial,sans-serif;font-size:13px;color:' + slate + ';line-height:1.6">' + item + '</td></tr>'; }).join('')
      + '</tbody></table>';
  }
  function sig() {
    return '<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px"><tr><td style="border-top:2px solid ' + teal + ';padding-top:18px"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:top">' + logo + '</td><td style="vertical-align:top"><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:' + charcoal + '">AskMiro Team</div><div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:' + teal + ';letter-spacing:1px;text-transform:uppercase;margin:3px 0 8px">AskMiro Cleaning Services</div><div style="font-family:Arial,sans-serif;font-size:12px;color:' + slate + '">&#9742; <a href="tel:02080730621" style="color:' + slate + ';text-decoration:none">' + phone + '</a> &nbsp;|&nbsp; &#9993; <a href="mailto:' + emailAddr + '" style="color:' + slate + ';text-decoration:none">' + emailAddr + '</a> &nbsp;|&nbsp; <a href="https://' + web + '" style="color:' + teal + ';text-decoration:none;font-weight:600">' + web + '</a></div></td></tr></table></td></tr></table>';
  }
  function wrap(bodyContent) {
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#E8EDF4;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#E8EDF4;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:' + navy + ';border-radius:12px 0 0 0;padding:24px 28px;width:52%;vertical-align:middle"><table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;vertical-align:middle">' + logo + '</td><td style="vertical-align:middle"><div style="font-family:Georgia,serif;font-size:21px;font-weight:700;color:#fff">AskMiro</div><div style="font-family:Arial,sans-serif;font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase;margin-top:2px">Cleaning Services</div></td></tr></table></td><td style="background:' + teal + ';border-radius:0 12px 0 0;padding:24px 28px;vertical-align:bottom;text-align:right"><div style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:rgba(255,255,255,0.85)">We\'ll be in touch</div></td></tr><tr><td colspan="2" style="background:' + teal + ';height:3px;font-size:3px;line-height:3px">&nbsp;</td></tr></table></td></tr><tr><td style="background:#fff;padding:36px 36px 28px;border-left:1px solid ' + border + ';border-right:1px solid ' + border + '">' + bodyContent + sig() + '</td></tr><tr><td style="background:' + navy + ';border-radius:0 0 12px 12px;padding:18px 28px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,0.6)">' + company + '</div><div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px">London &amp; UK</div></td><td align="right"><a href="https://' + web + '" style="font-family:Arial,sans-serif;font-size:12px;color:' + teal + ';text-decoration:none;font-weight:700">' + web + '</a></td></tr></table></td></tr></table></td></tr></table></body></html>';
  }
  var subjectLine = originalSubject ? 'Re: ' + originalSubject : 'your enquiry';
  return wrap(
    h('Thanks for getting in touch.') +
    sub('AskMiro Cleaning Services · London') +
    gr(name) +
    p('Thank you for your message — we\'ve received it and a member of our team will get back to you within <strong>4 business hours</strong>. If your enquiry is urgent, please call us directly on <strong>020 8073 0621</strong>.') +
    p('Here\'s a quick overview of what we offer while you wait:') +
    checklist([
      '<strong>Managed commercial cleaning</strong> — offices, residential blocks, healthcare, automotive & more',
      '<strong>Consistent, site-trained teams</strong> — same people every visit, not rotating agency staff',
      '<strong>Free site visit & fixed monthly quote</strong> — no hidden costs, turnaround within 24 hours',
      '<strong>COSHH-compliant & fully insured</strong> — £10M public liability cover, audit-ready documentation',
    ]) +
    cta('&#128197; Request a Free Quote', 'https://www.askmiro.com/get-quote.html') +
    div() +
    sm('This is an automated acknowledgement of your message. You do not need to resend — we have it. Contact us at ' + emailAddr + ' or call ' + phone + '.')
  );
}
// ── Trigger auto-reply (called after a new inbox email is stored)
// Usage: sendInboxAutoReply('client@email.com', 'Sarah', 'Cleaning enquiry')
function sendInboxAutoReply(toEmail, senderName, originalSubject) {
  if (!toEmail || toEmail.indexOf('@') === -1) return;
  // Don't auto-reply to yourself or noreply addresses
  var skip = ['noreply', 'no-reply', 'donotreply', 'askmiro.com', 'googlemail', 'mailer-daemon'];
  for (var i = 0; i < skip.length; i++) {
    if (toEmail.toLowerCase().indexOf(skip[i]) !== -1) return;
  }
  try {
    GmailApp.sendEmail(toEmail, 'Re: ' + (originalSubject || 'Your enquiry — AskMiro'), '', {
      name:     'AskMiro Cleaning Services',
      replyTo:  'info@askmiro.com',
      htmlBody: buildInboxAutoReplyEmail(senderName, originalSubject),
    });
    Logger.log('✅ Auto-reply sent to ' + toEmail);
  } catch(e) {
    Logger.log('⚠️ Auto-reply failed for ' + toEmail + ': ' + e);
  }
}
// ============================================================
// FINANCE MODULE v2.0 — Full Founder Finance Operating System
// Sheets: Finance_Transactions | Finance_Invoices |
//         Finance_Expenses | Finance_Snapshots |
//         Finance_Settings | Finance_Categories
// ============================================================

// ── READ ENDPOINTS ────────────────────────────────────────────

function getFinanceDashboard(params, auth) {
  requireRole(auth, 'Finance');
  var now       = new Date();
  var thisMonth = Utilities.formatDate(now, 'UTC', 'yyyy-MM');
  var lastMonth = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth()-1, 1), 'UTC', 'yyyy-MM');
  var today     = Utilities.formatDate(now, 'UTC', 'yyyy-MM-dd');
  var settings  = _getFinanceSettings();

  var invs = getTableRows('Finance_Invoices');
  var exps = getTableRows('Finance_Expenses');
  var txns = getTableRows('Finance_Transactions');

  var thisInvs  = invs.filter(function(i) { return (i.invoiceDate||'').slice(0,7) === thisMonth && i.status !== 'Void'; });
  var lastInvs  = invs.filter(function(i) { return (i.invoiceDate||'').slice(0,7) === lastMonth && i.status !== 'Void'; });
  var thisExps  = exps.filter(function(e) { return (e.expenseDate||'').slice(0,7) === thisMonth; });
  var lastExps  = exps.filter(function(e) { return (e.expenseDate||'').slice(0,7) === lastMonth; });

  var invoicedRev   = thisInvs.reduce(function(s,i) { return s + parseFloat(i.totalAmount||0); }, 0);
  var lastRev       = lastInvs.reduce(function(s,i) { return s + parseFloat(i.totalAmount||0); }, 0);
  var cashIn        = txns.filter(function(t) { return t.type === 'payment' && (t.transactionDate||'').slice(0,7) === thisMonth; })
                         .reduce(function(s,t) { return s + parseFloat(t.amountGross||0); }, 0);
  var totalExpenses = thisExps.reduce(function(s,e) { return s + parseFloat(e.amountGross||0); }, 0);
  var lastExpenses  = lastExps.reduce(function(s,e) { return s + parseFloat(e.amountGross||0); }, 0);
  var grossProfit   = invoicedRev - totalExpenses;
  var grossMargin   = invoicedRev > 0 ? r2(grossProfit / invoicedRev * 100) : 0;

  var outstanding = invs.filter(function(i) { return i.status === 'Issued' || i.status === 'Sent'; });
  var overdue     = invs.filter(function(i) { return (i.status === 'Issued' || i.status === 'Sent' || i.status === 'Overdue') && i.dueDate && i.dueDate < today; });
  var outAmt      = outstanding.reduce(function(s,i) { return s + parseFloat(i.balanceDue||i.totalAmount||0); }, 0);
  var overAmt     = overdue.reduce(function(s,i) { return s + parseFloat(i.balanceDue||i.totalAmount||0); }, 0);

  var healthy = parseFloat(settings.targetMarginHealthy || 35);
  var watch   = parseFloat(settings.targetMarginWatch   || 20);
  var alerts  = [];
  if (overdue.length > 0) alerts.push({ level:'r', msg: overdue.length + ' invoice(s) overdue — £' + r2(overAmt) });
  if (invoicedRev > 0 && grossMargin < watch)   alerts.push({ level:'r', msg: 'Margin ' + grossMargin + '% — below risk threshold (' + watch + '%)' });
  else if (invoicedRev > 0 && grossMargin < healthy) alerts.push({ level:'a', msg: 'Margin ' + grossMargin + '% — watch zone (target ' + healthy + '%)' });
  if (totalExpenses === 0 && invoicedRev > 0)   alerts.push({ level:'a', msg: 'No expenses logged — margin may be overstated' });

  var recentInvs  = invs.sort(function(a,b) { return (b.createdAt||'').localeCompare(a.createdAt||''); }).slice(0,5);
  var recentExps  = exps.sort(function(a,b) { return (b.createdAt||'').localeCompare(a.createdAt||''); }).slice(0,5);

  return {
    thisMonth: thisMonth,
    invoicedRevenue: r2(invoicedRev),
    revenueMoM: lastRev > 0 ? r2((invoicedRev - lastRev) / lastRev * 100) : null,
    cashIn: r2(cashIn),
    totalExpenses: r2(totalExpenses),
    expensesMoM: lastExpenses > 0 ? r2((totalExpenses - lastExpenses) / lastExpenses * 100) : null,
    grossProfit: r2(grossProfit),
    grossMargin: grossMargin,
    outstandingCount: outstanding.length,
    outstandingAmount: r2(outAmt),
    overdueCount: overdue.length,
    overdueAmount: r2(overAmt),
    alerts: alerts,
    recentInvoices: recentInvs,
    recentExpenses: recentExps,
    settings: settings
  };
}

function getFinanceTransactions(params, auth) {
  requireRole(auth, 'Finance');
  var rows = getTableRows('Finance_Transactions');
  if (params.month)    rows = rows.filter(function(r) { return (r.transactionDate||'').slice(0,7) === params.month; });
  if (params.type)     rows = rows.filter(function(r) { return r.type  === params.type; });
  if (params.status)   rows = rows.filter(function(r) { return r.status === params.status; });
  if (params.siteId)   rows = rows.filter(function(r) { return r.linkedSiteId === params.siteId; });
  if (params.category) rows = rows.filter(function(r) { return r.category === params.category; });
  return rows.sort(function(a,b) { return (b.transactionDate||'').localeCompare(a.transactionDate||''); });
}

function getFinanceInvoices(params, auth) {
  requireRole(auth, 'Finance');
  var today = new Date().toISOString().slice(0,10);
  var rows  = getTableRows('Finance_Invoices').map(function(i) {
    if ((i.status === 'Issued' || i.status === 'Sent') && i.dueDate && i.dueDate < today) i.status = 'Overdue';
    return i;
  });
  if (params.status)     rows = rows.filter(function(r) { return r.status     === params.status; });
  if (params.contractId) rows = rows.filter(function(r) { return r.contractId === params.contractId; });
  if (params.siteId)     rows = rows.filter(function(r) { return r.siteId     === params.siteId; });
  if (params.month)      rows = rows.filter(function(r) { return (r.invoiceDate||'').slice(0,7) === params.month; });
  return rows.sort(function(a,b) { return (b.invoiceDate||'').localeCompare(a.invoiceDate||''); });
}

function getFinanceExpenses(params, auth) {
  requireRole(auth, 'Finance');
  var rows = getTableRows('Finance_Expenses');
  if (params.month)      rows = rows.filter(function(r) { return (r.expenseDate||'').slice(0,7) === params.month; });
  if (params.category)   rows = rows.filter(function(r) { return r.category       === params.category; });
  if (params.siteId)     rows = rows.filter(function(r) { return r.linkedSiteId   === params.siteId; });
  if (params.contractId) rows = rows.filter(function(r) { return r.linkedContractId === params.contractId; });
  return rows.sort(function(a,b) { return (b.expenseDate||'').localeCompare(a.expenseDate||''); });
}

function getFinanceSnapshots(params, auth) {
  requireRole(auth, 'Finance');
  var rows = getTableRows('Finance_Snapshots');
  if (params.month)      rows = rows.filter(function(r) { return r.snapshotMonth  === params.month; });
  if (params.contractId) rows = rows.filter(function(r) { return r.contractId     === params.contractId; });
  if (params.siteId)     rows = rows.filter(function(r) { return r.siteId         === params.siteId; });
  return rows.sort(function(a,b) { return (b.snapshotMonth||'').localeCompare(a.snapshotMonth||''); });
}

function getFinanceSettings(params, auth) {
  requireRole(auth, 'Finance');
  return _getFinanceSettings();
}

function getFinanceCategories(params, auth) {
  requireRole(auth, 'Finance');
  return getTableRows('Finance_Categories');
}

function _getFinanceSettings() {
  var rows = getTableRows('Finance_Settings');
  var s = {};
  rows.forEach(function(r) { if (r.key) s[r.key] = r.value; });
  return Object.assign({ vatRate:'20', targetMarginHealthy:'35', targetMarginWatch:'20',
    invoicePrefix:'INV', defaultPaymentTerms:'30', currency:'GBP' }, s);
}

// ── WRITE ENDPOINTS ───────────────────────────────────────────

function createFinanceTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['transactionDate','type','amountGross','category'], 'FinanceTransaction');
  var id  = genId('FTX');
  var now = new Date().toISOString();
  var gross = parseFloat(body.amountGross);
  var net   = parseFloat(body.amountNet  || r2(gross / 1.2));
  var vat   = parseFloat(body.amountVat  || r2(gross - net));
  var row   = Object.assign({ id:id, status:body.status||'paid', amountNet:r2(net),
    amountVat:r2(vat), createdBy:auth.userId, createdAt:now, updatedAt:now }, body);
  appendRow('Finance_Transactions', row);
  auditLog(auth.userId, 'CREATE', 'FinanceTransaction', id, null, row);
  return { ok:true, id:id };
}

function updateFinanceTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'FinanceTransactionUpdate');
  body.updatedAt = new Date().toISOString();
  updateRow('Finance_Transactions', body.id, body);
  auditLog(auth.userId, 'UPDATE', 'FinanceTransaction', body.id, null, body);
  return { ok:true };
}

function voidFinanceTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'FinanceTransactionVoid');
  updateRow('Finance_Transactions', body.id, { status:'void', updatedAt:new Date().toISOString() });
  auditLog(auth.userId, 'VOID', 'FinanceTransaction', body.id, null, body);
  return { ok:true };
}

function createFinanceInvoice(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['customerName','invoiceDate','dueDate','totalAmount'], 'FinanceInvoice');
  var settings  = _getFinanceSettings();
  var id        = genId('INV2');
  var invoiceNo = _nextInvoiceNumber(settings.invoicePrefix || 'INV');
  var gross     = parseFloat(body.totalAmount);
  var vatRate   = parseFloat(settings.vatRate || 20) / 100;
  var net       = parseFloat(body.subtotal   || r2(gross / (1 + vatRate)));
  var vat       = parseFloat(body.vatAmount  || r2(gross - net));
  var now       = new Date().toISOString();
  var row = Object.assign({
    id:id, invoiceNumber:invoiceNo, status:'Draft',
    subtotal:r2(net), vatAmount:r2(vat), balanceDue:r2(gross), amountPaid:'0',
    paymentTerms: settings.defaultPaymentTerms || '30',
    createdBy:auth.userId, createdAt:now
  }, body);
  appendRow('Finance_Invoices', row);
  // Mirror to transactions ledger
  appendRow('Finance_Transactions', {
    id:genId('FTX'), transactionDate:body.invoiceDate, type:'invoice', status:'draft',
    amountNet:r2(net), amountVat:r2(vat), amountGross:r2(gross),
    category:'Contract Revenue', description:'Invoice '+invoiceNo+' — '+body.customerName,
    supplierOrCustomer:body.customerName, linkedContractId:body.contractId||'',
    linkedSiteId:body.siteId||'', linkedInvoiceId:id,
    createdBy:auth.userId, createdAt:now, updatedAt:now
  });
  auditLog(auth.userId, 'CREATE', 'FinanceInvoice', id, null, row);
  return { ok:true, id:id, invoiceNumber:invoiceNo };
}

function markFinanceInvoiceSent(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'InvoiceSent');
  var now = new Date().toISOString();
  updateRow('Finance_Invoices', body.id, { status:'Issued', sentAt:now });
  auditLog(auth.userId, 'SEND', 'FinanceInvoice', body.id, null, body);
  return { ok:true };
}

function recordFinancePayment(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['invoiceId','amountGross','transactionDate'], 'FinancePayment');
  var inv = getRowById('Finance_Invoices', body.invoiceId);
  if (!inv) throw new Error('Invoice not found: ' + body.invoiceId);
  var total     = parseFloat(inv.totalAmount || 0);
  var paid      = parseFloat(inv.amountPaid  || 0);
  var newPaid   = r2(paid + parseFloat(body.amountGross));
  var newBal    = r2(Math.max(0, total - newPaid));
  var status    = newBal <= 0 ? 'Paid' : 'Partial';
  var now       = new Date().toISOString();
  updateRow('Finance_Invoices', body.invoiceId, {
    status:status, balanceDue:newBal, amountPaid:newPaid,
    paidAt:status==='Paid'?now:(inv.paidAt||'')
  });
  var txnId = genId('FTX');
  var gross = parseFloat(body.amountGross);
  appendRow('Finance_Transactions', {
    id:txnId, transactionDate:body.transactionDate, type:'payment', status:'paid',
    amountNet:r2(gross/1.2), amountVat:r2(gross - gross/1.2), amountGross:r2(gross),
    paymentMethod:body.paymentMethod||'BACS', category:'Contract Revenue',
    description:'Payment for ' + inv.invoiceNumber + ' — ' + (inv.customerName||''),
    supplierOrCustomer:inv.customerName||'',
    linkedInvoiceId:body.invoiceId, linkedContractId:inv.contractId||'',
    linkedSiteId:inv.siteId||'', externalRef:body.reference||'', notes:body.notes||'',
    createdBy:auth.userId, createdAt:now, updatedAt:now
  });
  auditLog(auth.userId, 'PAYMENT', 'FinanceInvoice', body.invoiceId, null, body);
  return { ok:true, txnId:txnId, newBalance:newBal, invoiceStatus:status };
}

function createFinanceExpense(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['expenseDate','category','amountGross','description'], 'FinanceExpense');
  var id    = genId('EXP');
  var gross = parseFloat(body.amountGross);
  var net   = parseFloat(body.amountNet  || r2(gross / 1.2));
  var vat   = parseFloat(body.amountVat  || r2(gross - net));
  var now   = new Date().toISOString();
  var row   = Object.assign({
    id:id, amountNet:r2(net), amountVat:r2(vat), amountGross:r2(gross),
    approvalStatus:'Approved', enteredBy:auth.userId, createdAt:now
  }, body);
  appendRow('Finance_Expenses', row);
  appendRow('Finance_Transactions', {
    id:genId('FTX'), transactionDate:body.expenseDate, type:'expense', status:'paid',
    amountNet:r2(net), amountVat:r2(vat), amountGross:r2(gross),
    paymentMethod:body.paymentMethod||'', category:body.category,
    description:body.description, supplierOrCustomer:body.supplier||'',
    linkedContractId:body.linkedContractId||'', linkedSiteId:body.linkedSiteId||'',
    externalRef:body.receiptRef||'', createdBy:auth.userId, createdAt:now, updatedAt:now
  });
  auditLog(auth.userId, 'CREATE', 'FinanceExpense', id, null, row);
  return { ok:true, id:id };
}

function updateFinanceExpense(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'FinanceExpenseUpdate');
  updateRow('Finance_Expenses', body.id, body);
  auditLog(auth.userId, 'UPDATE', 'FinanceExpense', body.id, null, body);
  return { ok:true };
}

function generateFinanceRecurring(body, auth) {
  requireRole(auth, 'Finance');
  var targetMonth = body.targetMonth || new Date().toISOString().slice(0,7);
  var allExps     = getTableRows('Finance_Expenses');
  var now         = new Date().toISOString();

  // Collect unique recurring templates (latest entry per category+description+supplier)
  var templates = [];
  var seen      = {};
  var recExps   = allExps.filter(function(e) { return e.recurringFlag === 'Yes'; })
    .sort(function(a,b) { return (b.expenseDate||'').localeCompare(a.expenseDate||''); });
  recExps.forEach(function(e) {
    var key = (e.category||'') + '||' + (e.description||'').toLowerCase().trim() + '||' + (e.supplier||'').toLowerCase().trim();
    if (!seen[key]) { seen[key] = true; templates.push(e); }
  });
  if (!templates.length) return { ok:true, generated:0, skipped:0 };

  // Find already-generated entries for this month (by generatedFromId or matching key+month)
  var thisMonthExps = allExps.filter(function(e) { return (e.expenseDate||'').slice(0,7) === targetMonth; });
  var alreadyKeys   = {};
  thisMonthExps.filter(function(e) { return e.recurringFlag === 'Yes'; }).forEach(function(e) {
    var key = (e.category||'') + '||' + (e.description||'').toLowerCase().trim() + '||' + (e.supplier||'').toLowerCase().trim();
    alreadyKeys[key] = true;
  });

  var generated = 0;
  var skipped   = 0;
  var expDate   = targetMonth + '-01';

  templates.forEach(function(tmpl) {
    var key = (tmpl.category||'') + '||' + (tmpl.description||'').toLowerCase().trim() + '||' + (tmpl.supplier||'').toLowerCase().trim();
    if (alreadyKeys[key]) { skipped++; return; }
    var id    = genId('EXP');
    var gross = parseFloat(tmpl.amountGross||0);
    var net   = parseFloat(tmpl.amountNet   || r2(gross / 1.2));
    var vat   = parseFloat(tmpl.amountVat   || r2(gross - net));
    var row   = {
      id:id, expenseDate:expDate, category:tmpl.category, subcategory:tmpl.subcategory||'',
      description:tmpl.description, supplier:tmpl.supplier||'', amountNet:r2(net),
      amountVat:r2(vat), amountGross:r2(gross), paymentMethod:tmpl.paymentMethod||'',
      linkedSiteId:tmpl.linkedSiteId||'', linkedContractId:tmpl.linkedContractId||'',
      receiptRef:'', recurringFlag:'Yes', approvalStatus:'Approved',
      enteredBy:auth.userId, createdAt:now
    };
    appendRow('Finance_Expenses', row);
    appendRow('Finance_Transactions', {
      id:genId('FTX'), transactionDate:expDate, type:'expense', status:'paid',
      amountNet:r2(net), amountVat:r2(vat), amountGross:r2(gross),
      paymentMethod:tmpl.paymentMethod||'', category:tmpl.category,
      description:tmpl.description, supplierOrCustomer:tmpl.supplier||'',
      linkedContractId:tmpl.linkedContractId||'', linkedSiteId:tmpl.linkedSiteId||'',
      externalRef:'', createdBy:auth.userId, createdAt:now, updatedAt:now
    });
    generated++;
  });

  auditLog(auth.userId, 'GENERATE_RECURRING', 'FinanceExpense', null, null, { targetMonth:targetMonth, generated:generated });
  return { ok:true, generated:generated, skipped:skipped };
}

function recalculateFinanceSnapshots(body, auth) {
  requireRole(auth, 'Finance');
  var month    = body.month || new Date().toISOString().slice(0,7);
  var invs     = getTableRows('Finance_Invoices').filter(function(i) { return (i.invoiceDate||'').slice(0,7) === month && i.status !== 'Void'; });
  var exps     = getTableRows('Finance_Expenses').filter(function(e) { return (e.expenseDate||'').slice(0,7) === month; });
  var payments = getTableRows('Finance_Transactions').filter(function(t) { return t.type === 'payment' && (t.transactionDate||'').slice(0,7) === month; });
  var settings = _getFinanceSettings();
  var healthy  = parseFloat(settings.targetMarginHealthy || 35);
  var watch    = parseFloat(settings.targetMarginWatch   || 20);

  var siteIds = {};
  invs.forEach(function(i) { if (i.siteId) siteIds[i.siteId] = true; });
  exps.forEach(function(e) { if (e.linkedSiteId) siteIds[e.linkedSiteId] = true; });

  var snapshots = [];
  Object.keys(siteIds).forEach(function(siteId) {
    var si = invs.filter(function(i) { return i.siteId === siteId; });
    var se = exps.filter(function(e) { return e.linkedSiteId === siteId; });
    var sp = payments.filter(function(t) { return t.linkedSiteId === siteId; });

    function sumCat(cat) {
      return se.filter(function(e){return e.category===cat;})
               .reduce(function(s,e){return s+parseFloat(e.amountGross||0);},0);
    }

    var invoicedRevenue   = si.reduce(function(s,i){return s+parseFloat(i.totalAmount||0);},0);
    var cashReceived      = sp.reduce(function(s,t){return s+parseFloat(t.amountGross||0);},0);
    var labourCost        = sumCat('Labour');
    var suppliesCost      = sumCat('Supplies & Consumables');
    var travelCost        = sumCat('Travel & Transport');
    var subcontractorCost = sumCat('Subcontractors');
    var otherCost         = Math.max(0, se.reduce(function(s,e){return s+parseFloat(e.amountGross||0);},0) - labourCost - suppliesCost - travelCost - subcontractorCost);
    var totalCost         = labourCost + suppliesCost + travelCost + subcontractorCost + otherCost;
    var grossProfit       = invoicedRevenue - totalCost;
    var grossMarginPct    = invoicedRevenue > 0 ? r2(grossProfit / invoicedRevenue * 100) : 0;

    var riskFlag = 'healthy', recommendation = '';
    if (totalCost === 0 && invoicedRevenue > 0) { riskFlag = 'nodata'; recommendation = 'No cost data logged — margin overstated. Add labour and supply costs.'; }
    else if (grossMarginPct < 0)        { riskFlag = 'loss';    recommendation = 'Loss-making contract — review pricing and delivery costs immediately.'; }
    else if (grossMarginPct < watch)    { riskFlag = 'risk';    recommendation = 'Margin below ' + watch + '% risk threshold — investigate cost drivers.'; }
    else if (grossMarginPct < healthy)  { riskFlag = 'watch';   recommendation = 'Margin in watch zone — monitor closely this month.'; }

    var snap = {
      id:genId('SNAP'), snapshotMonth:month, siteId:siteId,
      contractId: si[0] ? (si[0].contractId||'') : '',
      invoicedRevenue:r2(invoicedRevenue), cashReceived:r2(cashReceived),
      labourCost:r2(labourCost), suppliesCost:r2(suppliesCost),
      travelCost:r2(travelCost), subcontractorCost:r2(subcontractorCost),
      otherCost:r2(otherCost), totalCost:r2(totalCost),
      grossProfit:r2(grossProfit), grossMarginPct:grossMarginPct,
      riskFlag:riskFlag, recommendation:recommendation,
      computedAt:new Date().toISOString()
    };
    snapshots.push(snap);

    // Remove old snapshot for this month/site and re-append
    var ss2 = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('Finance_Snapshots');
    if (ss2) {
      var data = ss2.getDataRange().getValues();
      var hdr  = data[0];
      var mIdx = hdr.indexOf('snapshotMonth');
      var sIdx = hdr.indexOf('siteId');
      for (var i = data.length-1; i >= 1; i--) {
        if (data[i][mIdx] === month && data[i][sIdx] === siteId) ss2.deleteRow(i+1);
      }
    }
    appendRow('Finance_Snapshots', snap);
  });

  invalidateCache();
  return { ok:true, count:snapshots.length, month:month };
}

function financeAssistant(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['question'], 'FinanceAssistant');
  var now      = new Date();
  var month    = Utilities.formatDate(now, 'UTC', 'yyyy-MM');
  var today    = Utilities.formatDate(now, 'UTC', 'yyyy-MM-dd');
  var settings = _getFinanceSettings();
  var invs     = getTableRows('Finance_Invoices');
  var exps     = getTableRows('Finance_Expenses');
  var txns     = getTableRows('Finance_Transactions');
  var snaps    = getTableRows('Finance_Snapshots');
  var answer   = _financeAI(body.question.toLowerCase(), invs, exps, txns, snaps, settings, month, today);
  return { ok:true, answer:answer, ts:now.toISOString() };
}

function _financeAI(q, invs, exps, txns, snaps, settings, month, today) {
  var healthy = parseFloat(settings.targetMarginHealthy || 35);
  var watch   = parseFloat(settings.targetMarginWatch   || 20);

  if (q.includes('revenue') || q.includes('invoiced') || q.includes('billed')) {
    var mi = invs.filter(function(i){return (i.invoiceDate||'').slice(0,7)===month && i.status!=='Void';});
    if (!mi.length) return 'No invoices issued in ' + month + ' yet. Create invoices to track revenue.';
    var tot = mi.reduce(function(s,i){return s+parseFloat(i.totalAmount||0);},0);
    return 'Invoiced revenue for ' + month + ': \xA3' + tot.toFixed(2) + ' across ' + mi.length + ' invoice(s). This is billed revenue — use "cash received" for actual cash in.';
  }
  if (q.includes('cash') || q.includes('received') || q.includes('cash in')) {
    var mp = txns.filter(function(t){return t.type==='payment'&&(t.transactionDate||'').slice(0,7)===month;});
    if (!mp.length) return 'No payments recorded in ' + month + '. Record payments against invoices to track cash in.';
    var tot = mp.reduce(function(s,t){return s+parseFloat(t.amountGross||0);},0);
    return 'Cash received in ' + month + ': \xA3' + tot.toFixed(2) + ' across ' + mp.length + ' payment(s).';
  }
  if (q.includes('overdue')) {
    var od = invs.filter(function(i){return (i.status==='Issued'||i.status==='Sent'||i.status==='Overdue')&&i.dueDate&&i.dueDate<today;});
    if (!od.length) return 'No overdue invoices at this time.';
    var tot = od.reduce(function(s,i){return s+parseFloat(i.balanceDue||i.totalAmount||0);},0);
    var detail = od.map(function(i){return i.invoiceNumber+' (\xA3'+parseFloat(i.balanceDue||i.totalAmount||0).toFixed(0)+', due '+i.dueDate+')';}).join('; ');
    return od.length+' overdue invoice(s) totalling \xA3'+tot.toFixed(2)+':\n'+detail+'\n\nAction: chase these immediately.';
  }
  if (q.includes('outstanding') || q.includes('unpaid')) {
    var up = invs.filter(function(i){return i.status==='Issued'||i.status==='Sent'||i.status==='Overdue';});
    if (!up.length) return 'No outstanding invoices — all are paid or in draft.';
    var tot = up.reduce(function(s,i){return s+parseFloat(i.balanceDue||i.totalAmount||0);},0);
    var od2 = up.filter(function(i){return i.status==='Overdue';}).length;
    return up.length+' outstanding invoice(s) totalling \xA3'+tot.toFixed(2)+'. Of these, '+od2+' are overdue.';
  }
  if (q.includes('margin') || q.includes('profit') || q.includes('profitable')) {
    var ms = snaps.filter(function(s){return s.snapshotMonth===month;});
    if (!ms.length) return 'No profitability data for '+month+'. Log expenses and run "Recalculate Snapshots" to compute margins.';
    var sorted = ms.slice().sort(function(a,b){return parseFloat(a.grossMarginPct||0)-parseFloat(b.grossMarginPct||0);});
    var out = 'Profitability — '+month+':\n';
    sorted.forEach(function(s){
      var flag = parseFloat(s.grossMarginPct)<watch?' [RISK]':parseFloat(s.grossMarginPct)<healthy?' [WATCH]':'';
      out += '\u2022 '+s.siteId+': '+s.grossMarginPct+'% margin'+flag+'\n';
    });
    if (sorted[0] && sorted[0].recommendation) out += '\nAlert: '+sorted[0].recommendation;
    return out;
  }
  if (q.includes('expense') || q.includes('cost') || q.includes('spend')) {
    var me = exps.filter(function(e){return (e.expenseDate||'').slice(0,7)===month;});
    if (!me.length) return 'No expenses logged for '+month+'. Add expenses to calculate accurate margins.';
    var catMap = {};
    me.forEach(function(e){catMap[e.category]=(catMap[e.category]||0)+parseFloat(e.amountGross||0);});
    var tot = me.reduce(function(s,e){return s+parseFloat(e.amountGross||0);},0);
    var sorted = Object.entries(catMap).sort(function(a,b){return b[1]-a[1];});
    var out = 'Expenses for '+month+': \xA3'+tot.toFixed(2)+' total.\nBreakdown:\n';
    sorted.forEach(function(kv){out+='\u2022 '+kv[0]+': \xA3'+kv[1].toFixed(2)+'\n';});
    return out;
  }
  if (q.includes('biggest') || q.includes('largest') || q.includes('top')) {
    var allE = exps.slice().sort(function(a,b){return parseFloat(b.amountGross||0)-parseFloat(a.amountGross||0);}).slice(0,5);
    if (!allE.length) return 'No expenses recorded yet.';
    var out = 'Top 5 expenses:\n';
    allE.forEach(function(e){out+='\u2022 '+e.description+' ('+e.category+'): \xA3'+parseFloat(e.amountGross||0).toFixed(2)+' on '+e.expenseDate+'\n';});
    return out;
  }
  var hasInvs  = invs.length > 0;
  var hasExps  = exps.length > 0;
  var hasSnaps = snaps.length > 0;
  var tips = [];
  if (!hasInvs)  tips.push('no invoices yet — create invoices to track revenue');
  if (!hasExps)  tips.push('no expenses yet — add expenses to calculate margins');
  if (!hasSnaps) tips.push('no profitability snapshots — run Recalculate after adding data');
  var msg = 'I can answer questions about your finance data. Try:\n\u2022 "What is my revenue this month?"\n\u2022 "Which invoices are overdue?"\n\u2022 "What are my biggest costs?"\n\u2022 "Which contracts have the lowest margin?"\n\u2022 "What is my cash position this month?"';
  if (tips.length) msg += '\n\nNote: ' + tips.join('; ') + '.';
  return msg;
}

// ── SETUP ─────────────────────────────────────────────────────

function setupFinanceSheets(body, auth) {
  if (auth) requireRole(auth, 'Owner');
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var defs = {
    'Finance_Transactions': ['id','transactionDate','type','subtype','status','amountNet','amountVat','amountGross','paymentMethod','category','description','supplierOrCustomer','linkedLeadId','linkedQuoteId','linkedContractId','linkedSiteId','linkedInvoiceId','createdBy','createdAt','updatedAt','notes','externalRef'],
    'Finance_Invoices':     ['id','invoiceNumber','invoiceDate','dueDate','contractId','siteId','customerName','billingPeriodFrom','billingPeriodTo','lineItemsJson','subtotal','vatAmount','totalAmount','amountPaid','balanceDue','status','sentAt','paidAt','paymentTerms','notes','createdBy','createdAt'],
    'Finance_Expenses':     ['id','expenseDate','category','subcategory','supplier','description','amountNet','amountVat','amountGross','linkedContractId','linkedSiteId','recurringFlag','approvalStatus','receiptUrl','receiptRef','paymentMethod','enteredBy','createdAt'],
    'Finance_Snapshots':    ['id','snapshotMonth','contractId','siteId','invoicedRevenue','cashReceived','labourCost','suppliesCost','travelCost','subcontractorCost','otherCost','totalCost','grossProfit','grossMarginPct','riskFlag','recommendation','computedAt'],
    'Finance_Settings':     ['key','value','updatedAt'],
    'Finance_Categories':   ['category','subcategory','type','active']
  };
  var created = [];
  Object.keys(defs).forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      var sheet = ss.insertSheet(name);
      sheet.getRange(1,1,1,defs[name].length).setValues([defs[name]]);
      created.push(name);
    }
  });
  var setSheet = ss.getSheetByName('Finance_Settings');
  if (setSheet && setSheet.getLastRow() <= 1) {
    var now = new Date().toISOString();
    setSheet.getRange(2,1,6,3).setValues([
      ['vatRate','20',now],['targetMarginHealthy','35',now],
      ['targetMarginWatch','20',now],['invoicePrefix','INV',now],
      ['defaultPaymentTerms','30',now],['currency','GBP',now]
    ]);
  }
  var catSheet = ss.getSheetByName('Finance_Categories');
  if (catSheet && catSheet.getLastRow() <= 1) {
    catSheet.getRange(2,1,14,4).setValues([
      ['Labour','Direct Labour','expense','Yes'],
      ['Subcontractors','Subcontractor Costs','expense','Yes'],
      ['Supplies & Consumables','Cleaning Products','expense','Yes'],
      ['Travel & Transport','Site Travel','expense','Yes'],
      ['Equipment','Tools & Equipment','expense','Yes'],
      ['Admin & Software','Software','expense','Yes'],
      ['Marketing','Digital Marketing','expense','Yes'],
      ['Insurance','Public Liability','expense','Yes'],
      ['Training & Compliance','Staff Training','expense','Yes'],
      ['One-off Job Costs','One-off','expense','Yes'],
      ['Miscellaneous','Other','expense','Yes'],
      ['Contract Revenue','Monthly Contract','income','Yes'],
      ['One-off Revenue','One-off Job','income','Yes'],
      ['Other Income','Misc Income','income','Yes']
    ]);
  }
  invalidateCache();
  return { ok:true, created:created };
}

function _nextInvoiceNumber(prefix) {
  var rows = getTableRows('Finance_Invoices');
  var max  = 0;
  rows.forEach(function(r) {
    if (r.invoiceNumber && r.invoiceNumber.toString().startsWith(prefix+'-')) {
      var n = parseInt(r.invoiceNumber.toString().replace(prefix+'-','')) || 0;
      if (n > max) max = n;
    }
  });
  return prefix + '-' + String(max + 1).padStart(4, '0');
}

// Run this directly from GAS editor to create Finance sheets
function runSetupFinanceSheets() {
  var result = setupFinanceSheets({}, null);
  Logger.log('Finance sheets setup: ' + JSON.stringify(result));
}

// ============================================================
// LABOUR & PAYROLL — GAS Functions
// Sheets: Labour_Entries, Labour_Workers
// ============================================================

// ── GET: Labour Entries ─────────────────────────────────────
function getLabourEntries(params, auth) {
  var rows = getTableRows('Labour_Entries');
  if (params && params.workerId) rows = rows.filter(function(r){ return r.worker_id === params.workerId; });
  if (params && params.month)    rows = rows.filter(function(r){ return (r.date||'').slice(0,7) === params.month; });
  if (params && params.status)   rows = rows.filter(function(r){ return r.status === params.status; });
  return rows.sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
}

// ── GET: Labour Workers ─────────────────────────────────────
function getLabourWorkers(params, auth) {
  var rows = getTableRows('Labour_Workers');
  return rows.sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });
}

// ── POST: Create Labour Entry ───────────────────────────────
function createLabourEntry(body, auth) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Labour_Entries');
  if (!sheet) throw new Error('Labour_Entries sheet not found. Run setupLabourSheets first.');

  var id       = 'LAB-' + new Date().getTime();
  var totalPay = parseFloat(body.totalPay) || (parseFloat(body.hoursWorked||0) * parseFloat(body.hourlyRate||0));
  var now      = new Date().toISOString();

  sheet.appendRow([
    id,
    body.workerId    || '',
    body.workerName  || '',
    body.date        || '',
    body.contractId  || '',
    body.siteId      || '',
    parseFloat(body.hoursWorked||0),
    parseFloat(body.hourlyRate||0),
    totalPay,
    body.status      || 'pending',
    body.role        || '',
    body.notes       || '',
    body.entryType   || 'Basic Hours',
    now
  ]);
  invalidateCache();
  return { ok: true, id: id, totalPay: totalPay };
}

// ── POST: Update Labour Entry ───────────────────────────────
function updateLabourEntry(body, auth) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Labour_Entries');
  if (!sheet) throw new Error('Labour_Entries sheet not found.');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data    = sheet.getDataRange().getValues();
  var idCol   = headers.indexOf('labour_id');
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === body.labourId) {
      var row = i + 1;
      _setSheetField(sheet, row, headers, 'status',      body.status);
      _setSheetField(sheet, row, headers, 'hours_worked', parseFloat(body.hoursWorked||data[i][headers.indexOf('hours_worked')]));
      _setSheetField(sheet, row, headers, 'hourly_rate',  parseFloat(body.hourlyRate||data[i][headers.indexOf('hourly_rate')]));
      var hp = parseFloat(body.hoursWorked||data[i][headers.indexOf('hours_worked')]);
      var hr = parseFloat(body.hourlyRate||data[i][headers.indexOf('hourly_rate')]);
      _setSheetField(sheet, row, headers, 'total_pay', hp * hr);
      _setSheetField(sheet, row, headers, 'notes', body.notes||'');
      break;
    }
  }
  invalidateCache();
  return { ok: true };
}

// ── POST: Approve Payroll ──────────────────────────────────
function approveLabourPayroll(body, auth) {
  var workerId    = body.workerId;
  var period      = body.period;      // YYYY-MM
  var workerName  = body.workerName  || '';
  var grossPay    = parseFloat(body.grossPay) || 0;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Labour_Entries');
  if (!sheet) throw new Error('Labour_Entries sheet not found.');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data    = sheet.getDataRange().getValues();
  var idCol   = headers.indexOf('worker_id');
  var stCol   = headers.indexOf('status');
  var dtCol   = headers.indexOf('date');

  // Update all matching pending entries → approved
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === workerId &&
        (data[i][dtCol]||'').toString().slice(0,7) === period &&
        data[i][stCol] === 'pending') {
      sheet.getRange(i + 1, stCol + 1).setValue('approved');
    }
  }

  // Write Labour expense to Finance_Transactions
  var txSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Finance_Transactions');
  if (txSheet) {
    var txId  = 'TX-' + new Date().getTime();
    var txNow = new Date().toISOString();
    var txHeaders = txSheet.getRange(1, 1, 1, txSheet.getLastColumn()).getValues()[0];
    // Use appendRow matching Finance_Transactions column order
    txSheet.appendRow([
      txId,
      period + '-01',          // transactionDate — first of pay period
      'expense',               // type
      'Labour',                // category
      'Payroll - ' + workerName + ' (' + period + ')',  // description
      '',                      // supplierOrCustomer
      0,                       // amountNet (no VAT on payroll)
      0,                       // amountVat
      grossPay,                // amountGross
      '',                      // linkedContractId
      '',                      // linkedSiteId
      'labour_payroll',        // source
      'payroll-' + workerId + '-' + period, // sourceId
      'active',                // status
      '',                      // externalRef
      '',                      // notes
      txNow                    // createdAt
    ]);
  }

  invalidateCache();
  return { ok: true, grossPay: grossPay };
}

// ── POST: Mark Payroll Paid ────────────────────────────────
function markLabourPaid(body, auth) {
  var workerId = body.workerId;
  var period   = body.period;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Labour_Entries');
  if (!sheet) throw new Error('Labour_Entries sheet not found.');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data    = sheet.getDataRange().getValues();
  var wIdCol  = headers.indexOf('worker_id');
  var stCol   = headers.indexOf('status');
  var dtCol   = headers.indexOf('date');

  for (var i = 1; i < data.length; i++) {
    if (data[i][wIdCol] === workerId &&
        (data[i][dtCol]||'').toString().slice(0,7) === period) {
      sheet.getRange(i + 1, stCol + 1).setValue('paid');
    }
  }
  invalidateCache();
  return { ok: true };
}

// ── POST: Create Worker ────────────────────────────────────
function createLabourWorker(body, auth) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Labour_Workers');
  if (!sheet) throw new Error('Labour_Workers sheet not found. Run setupLabourSheets first.');

  var id  = 'WKR-' + new Date().getTime();
  var now = new Date().toISOString();

  sheet.appendRow([
    id,
    body.name              || '',
    body.role              || 'Cleaner',
    parseFloat(body.defaultHourlyRate||0),
    body.phone             || '',
    body.email             || '',
    body.status            || 'active',
    body.niNumber          || '',
    body.taxCode           || '1257L',
    body.address           || '',
    body.dateOfBirth       || '',
    body.startDate         || '',
    body.paymentMethod     || 'BACS',
    body.payrollType       || 'PAYE',
    now
  ]);
  invalidateCache();
  return { ok: true, worker_id: id };
}

// ── POST: Update Worker ────────────────────────────────────
function updateLabourWorker(body, auth) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Labour_Workers');
  if (!sheet) throw new Error('Labour_Workers sheet not found.');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data    = sheet.getDataRange().getValues();
  var idCol   = headers.indexOf('worker_id');
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === body.workerId) {
      var row = i + 1;
      _setSheetField(sheet, row, headers, 'name',                 body.name);
      _setSheetField(sheet, row, headers, 'role',                 body.role);
      _setSheetField(sheet, row, headers, 'default_hourly_rate',  parseFloat(body.defaultHourlyRate||0));
      _setSheetField(sheet, row, headers, 'phone',                body.phone||'');
      _setSheetField(sheet, row, headers, 'email',                body.email||'');
      _setSheetField(sheet, row, headers, 'status',               body.status||'active');
      _setSheetField(sheet, row, headers, 'ni_number',            body.niNumber||'');
      _setSheetField(sheet, row, headers, 'tax_code',             body.taxCode||'1257L');
      _setSheetField(sheet, row, headers, 'address',              body.address||'');
      _setSheetField(sheet, row, headers, 'date_of_birth',        body.dateOfBirth||'');
      _setSheetField(sheet, row, headers, 'start_date',           body.startDate||'');
      _setSheetField(sheet, row, headers, 'payment_method',       body.paymentMethod||'BACS');
      _setSheetField(sheet, row, headers, 'payroll_type',         body.payrollType||'PAYE');
      break;
    }
  }
  invalidateCache();
  return { ok: true };
}

// ── Setup Labour Sheets ────────────────────────────────────
function setupLabourSheets(body, auth) {
  if (auth) requireRole(auth, 'Owner');
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var defs = {
    'Labour_Entries':  ['labour_id','worker_id','worker_name','date','contract_id','site_id','hours_worked','hourly_rate','total_pay','status','role','notes','entry_type','created_at'],
    'Labour_Workers':  ['worker_id','name','role','default_hourly_rate','phone','email','status','ni_number','tax_code','address','date_of_birth','start_date','payment_method','payroll_type','created_at']
  };
  var created = [];
  Object.keys(defs).forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      var sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, defs[name].length).setValues([defs[name]]);
      created.push(name);
    }
  });
  invalidateCache();
  return { ok: true, created: created };
}

// Run directly from GAS editor
function runSetupLabourSheets() {
  var result = setupLabourSheets({}, null);
  Logger.log('Labour sheets setup: ' + JSON.stringify(result));
}

// Standalone runner — use this if runSetupLabourSheets fails
function runSetupLabourSheetsDirect() {
  var ss   = SpreadsheetApp.openById(CFG.SHEET_ID);
  var defs = {
    'Labour_Entries':  ['labour_id','worker_id','worker_name','date','contract_id','site_id','hours_worked','hourly_rate','total_pay','status','role','notes','entry_type','created_at'],
    'Labour_Workers':  ['worker_id','name','role','default_hourly_rate','phone','email','status','ni_number','tax_code','address','date_of_birth','start_date','payment_method','payroll_type','created_at']
  };
  var created = [], updated = [];
  Object.keys(defs).forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, defs[name].length).setValues([defs[name]]);
      created.push(name);
    } else {
      // Add any missing columns to existing sheet
      var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      defs[name].forEach(function(col) {
        if (existing.indexOf(col) === -1) {
          var nextCol = sheet.getLastColumn() + 1;
          sheet.getRange(1, nextCol).setValue(col);
          updated.push(name + '.' + col);
        }
      });
    }
  });
  Logger.log('Created: ' + JSON.stringify(created) + ' | Updated cols: ' + JSON.stringify(updated));
}

// ── Helper: set a single cell by column name ───────────────
function _setSheetField(sheet, row, headers, fieldName, value) {
  var col = headers.indexOf(fieldName);
  if (col >= 0) sheet.getRange(row, col + 1).setValue(value !== undefined ? value : '');
}
