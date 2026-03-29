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
    case 'cache.invalidate':     invalidateCache(params.tab); return { ok: true };
    case 'settings':     return getSettings(auth);
    case 'sites':        return getSites(auth);
    case 'emails':       return getEmailLog(params, auth);
    case 'inbox':        return getInbox(params, auth);
    case 'email.thread': return getEmailThread(params, auth);
    case 'voice.calls':  return getVoiceCalls(params, auth);
    case 'voice.call':   return getVoiceCall(params.id, auth);
    case 'cleaners': return getCleaners(params, auth);
    case 'cleaner':  return getCleaner(params.id, auth);
    case 'outreach.queue':        return getOutreachQueue(params, auth);
    case 'outreach.stats':        return getOutreachStats(params, auth);
    case 'outreach.log':          return getOutreachLog(params, auth);
    case 'outreach.templates':    return getOutreachTemplates(params, auth);
    case 'outreach.human-queue':  return getHumanActionQueue(params, auth);
    case 'outreach.autorun':      return getAutorunStatus(params, auth);
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
    case 'seo.generate':                   return seoGenerate(body, auth);
    case 'outreach.handoff':               return handoffLead(body, auth);
    case 'outreach.send':                  return sendOutreachEmail(body, auth);
    case 'outreach.status':                return updateOutreachStatus(body, auth);
    case 'outreach.resolve-action':        return resolveHumanAction(body, auth);
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
    .filter(r => { const k = headers[0]; return r[k] && r[k] !== ''; });
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
  var ss      = SpreadsheetApp.openById(CFG.SHEET_ID);
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
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
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
  var sheet = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('Labour_Entries');
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

  var sheet = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('Labour_Entries');
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
  var txSheet = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('Finance_Transactions');
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

  var sheet = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('Labour_Entries');
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
  var ss    = SpreadsheetApp.openById(CFG.SHEET_ID);
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
  var sheet = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('Labour_Workers');
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
  var ss   = SpreadsheetApp.openById(CFG.SHEET_ID);
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
