// ============================================================
// AskMiro Ops — Finance Module Backend  v1.0
// Founder Finance Operating System
//
// Every invoice, payment and expense writes to Finance_Transactions
// so the data is HMRC-ready for VAT returns and P&L reporting.
//
// Sheets used:
//   Finance_Invoices     — invoice registry
//   Finance_Transactions — all money movements (income, expenses, payments)
//   Finance_Snapshots    — monthly P&L summaries
//   Finance_Settings     — VAT rate, payment terms, bank details
// ============================================================

var FINANCE_INV  = 'Finance_Invoices';
var FINANCE_TXN  = 'Finance_Transactions';
var FINANCE_SNAP = 'Finance_Snapshots';
var FINANCE_SETT = 'Finance_Settings';

// ── Internal helpers ──────────────────────────────────────────

// Sequential invoice counter — stored in GAS Script Properties
// Format: AM-2026-0001, AM-2026-0002 … (HMRC requires no gaps, sequential)
function _nextInvoiceNumber() {
  var props   = PropertiesService.getScriptProperties();
  var year    = new Date().getFullYear().toString();
  var key     = 'INV_SEQ_' + year;
  var current = parseInt(props.getProperty(key) || '0', 10);
  var next    = current + 1;
  props.setProperty(key, next.toString());
  return 'AM-' + year + '-' + String(next).padStart(4, '0');
}

// Non-invoice IDs (payments, transactions, expenses) — timestamp-based is fine
function _finId(prefix) {
  return prefix + '-' + new Date().getTime() + '-' + Math.floor(100 + Math.random() * 900);
}

function _pf(v) { return parseFloat(v || 0) || 0; }

function _finWrite(sheetName, row) {
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error(sheetName + ' sheet not found — run Setup Finance Sheets first (Finance tab → ⚙ Setup)');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var out = headers.map(function(h) { return row[h] !== undefined ? row[h] : ''; });
  sh.appendRow(out);
  invalidateCache();
}

function _finUpdate(sheetName, id, updates) {
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error(sheetName + ' sheet not found');
  var data    = sh.getDataRange().getValues();
  var headers = data[0];
  var idCol   = headers.indexOf('id');
  if (idCol < 0) throw new Error('No id column in ' + sheetName);
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === id) {
      Object.keys(updates).forEach(function(key) {
        var col = headers.indexOf(key);
        if (col >= 0) sh.getRange(i + 1, col + 1).setValue(updates[key]);
      });
      invalidateCache();
      return true;
    }
  }
  return false;
}

function _finRead(sheetName, filters) {
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    headers.forEach(function(h, j) { row[h] = data[i][j]; });
    rows.push(row);
  }
  if (!filters) return rows;
  if (filters.month) {
    var m = filters.month;
    rows = rows.filter(function(r) {
      var d = r.invoiceDate || r.transactionDate || r.expenseDate || '';
      return String(d).slice(0, 7) === m;
    });
  }
  if (filters.status) rows = rows.filter(function(r) { return r.status === filters.status; });
  if (filters.type)   rows = rows.filter(function(r) { return r.type   === filters.type;   });
  return rows;
}

// Write a money movement to Finance_Transactions (the HMRC ledger)
function _writeTxn(txn) { _finWrite(FINANCE_TXN, txn); }

// ── GET: Finance Dashboard ────────────────────────────────────
function getFinanceDashboard(params, auth) {
  requireRole(auth, 'Finance');
  var month = (params && params.month) ? params.month : new Date().toISOString().slice(0, 7);
  var inv  = _finRead(FINANCE_INV,  { month: month });
  var txns = _finRead(FINANCE_TXN,  { month: month });

  var live = inv.filter(function(i) { return i.status !== 'Void'; });
  var revenueNet   = live.reduce(function(s, i) { return s + _pf(i.subtotal);    }, 0);
  var revenueVat   = live.reduce(function(s, i) { return s + _pf(i.vatAmount);   }, 0);
  var revenueGross = live.reduce(function(s, i) { return s + _pf(i.totalAmount); }, 0);

  var exps = txns.filter(function(t) { return t.type === 'expense'; });
  var expensesGross = exps.reduce(function(s, e) { return s + _pf(e.amountGross); }, 0);
  var expensesVat   = exps.reduce(function(s, e) { return s + _pf(e.amountVat);   }, 0);

  var outstanding = live.filter(function(i) { return i.status === 'Draft' || i.status === 'Issued'; });
  var outstandingValue = outstanding.reduce(function(s, i) { return s + _pf(i.totalAmount); }, 0);

  // Overdue: Issued + dueDate in the past
  var today = new Date().toISOString().slice(0, 10);
  var overdue = live.filter(function(i) {
    return i.status === 'Issued' && i.dueDate && String(i.dueDate) < today;
  });

  return {
    ok: true, month: month,
    revenue: { net: revenueNet, vat: revenueVat, gross: revenueGross },
    expenses: { gross: expensesGross, vat: expensesVat },
    profit: { net: revenueNet - expensesGross },
    vatLiability: revenueVat - expensesVat,   // Output VAT - Input VAT (for VAT return)
    invoices: {
      total:           live.length,
      paid:            live.filter(function(i) { return i.status === 'Paid'; }).length,
      outstanding:     outstanding.length,
      outstandingValue: outstandingValue,
      overdue:         overdue.length,
      overdueValue:    overdue.reduce(function(s, i) { return s + _pf(i.totalAmount); }, 0)
    },
    txnCount: txns.length
  };
}

// ── GET: Finance Invoices ─────────────────────────────────────
function getFinanceInvoices(params, auth) {
  requireRole(auth, 'Finance');
  var filters = {};
  if (params && params.month)  filters.month  = params.month;
  if (params && params.status) filters.status = params.status;
  return _finRead(FINANCE_INV, filters);
}

// ── GET: Finance Transactions ─────────────────────────────────
function getFinanceTransactions(params, auth) {
  requireRole(auth, 'Finance');
  var filters = {};
  if (params && params.month) filters.month = params.month;
  if (params && params.type)  filters.type  = params.type;
  return _finRead(FINANCE_TXN, filters);
}

// ── GET: Finance Expenses (transactions of type=expense) ──────
function getFinanceExpenses(params, auth) {
  requireRole(auth, 'Finance');
  var filters = { type: 'expense' };
  if (params && params.month) filters.month = params.month;
  return _finRead(FINANCE_TXN, filters);
}

// ── GET: Finance Snapshots ────────────────────────────────────
function getFinanceSnapshots(params, auth) {
  requireRole(auth, 'Finance');
  var filters = {};
  if (params && params.month) filters.month = params.month;
  return _finRead(FINANCE_SNAP, filters);
}

// ── GET: Finance Settings ─────────────────────────────────────
function getFinanceSettings(params, auth) {
  requireRole(auth, 'Finance');
  var defaults = {
    vatRate: 0, defaultPaymentTerms: 30,
    bankName: 'Miro Partners Ltd', sortCode: '04-06-05',
    accountNumber: '26672911', vatRegistered: 'No',
    companyName: 'AskMiro Cleaning Services'
  };
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sh = ss.getSheetByName(FINANCE_SETT);
  if (!sh) return defaults;
  var data = sh.getDataRange().getValues();
  var out  = Object.assign({}, defaults);
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) out[data[i][0]] = data[i][1];
  }
  return out;
}

// ── POST: Update Finance Setting ─────────────────────────────
// Body: { key: 'vatRate', value: '0' }  or  { settings: { vatRate:0, invoicePrefix:'AM' } }
function updateFinanceSetting(body, auth) {
  requireRole(auth, 'Finance');
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sh = ss.getSheetByName(FINANCE_SETT);
  if (!sh) throw new Error('Finance_Settings sheet not found — run Setup Finance Sheets first');

  // Build map of updates: support single {key,value} or bulk {settings:{}}
  var updates = {};
  if (body.settings && typeof body.settings === 'object') {
    updates = body.settings;
  } else if (body.key !== undefined) {
    updates[body.key] = body.value;
  }

  var data    = sh.getDataRange().getValues();
  var updated = [];

  Object.keys(updates).forEach(function(k) {
    var found = false;
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === k) {
        sh.getRange(i + 1, 2).setValue(updates[k]);   // col B = value
        sh.getRange(i + 1, 3).setValue(new Date().toISOString()); // col C = updatedAt
        updated.push(k);
        found = true;
        break;
      }
    }
    if (!found) {
      // Key doesn't exist yet — append new row
      sh.appendRow([k, updates[k], new Date().toISOString()]);
      updated.push(k + ' (new)');
    }
  });

  invalidateCache();
  return { ok: true, updated: updated };
}

// ── GET: Finance Categories ───────────────────────────────────
function getFinanceCategories(params, auth) {
  requireRole(auth, 'Finance');
  return {
    expense: [
      'Labour', 'Subcontractors', 'Supplies & Consumables', 'Travel & Transport',
      'Equipment', 'Admin & Software', 'Marketing', 'Insurance',
      'Training & Compliance', 'One-off Job Costs', 'Miscellaneous'
    ],
    income: ['Contract Revenue', 'One-off Revenue', 'Other Income'],
    types:  ['income', 'expense', 'invoice', 'payment', 'credit_note', 'adjustment']
  };
}

// ── POST: Create Invoice ──────────────────────────────────────
// HMRC-compliant: sequential number, tax point, client address, VAT breakdown
// Also writes to Finance_Transactions for P&L and VAT return reporting
function createFinanceInvoice(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['customerName', 'invoiceDate', 'dueDate', 'totalAmount'], 'FinanceInvoice');

  var id    = _nextInvoiceNumber();          // Sequential: AM-2026-0001
  var now   = new Date().toISOString();
  var gross = _pf(body.totalAmount);
  var vat   = _pf(body.vatAmount || 0);
  var net   = _pf(body.subtotal) || (gross - vat);

  // Tax point = date of supply (job date if provided, else invoice date)
  var taxPoint = body.taxPoint || body.serviceDate || body.invoiceDate;

  var inv = {
    id:                id,
    status:            'Draft',
    customerName:      body.customerName,
    customerAddress:   body.customerAddress    || '',   // HMRC: buyer address
    customerEmail:     body.customerEmail      || '',
    siteId:            body.siteId             || '',
    contractId:        body.contractId         || '',
    invoiceDate:       body.invoiceDate,
    taxPoint:          taxPoint,               // HMRC: date of supply
    dueDate:           body.dueDate,
    billingPeriodFrom: body.billingPeriodFrom  || '',
    billingPeriodTo:   body.billingPeriodTo    || '',
    subtotal:          net,
    vatAmount:         vat,
    vatRate:           body.vatRate            || 0,
    totalAmount:       gross,
    lineItemsJson:     body.lineItemsJson      || '[]',
    paymentTerms:      body.paymentTerms       || 30,
    notes:             body.notes              || '',
    sentAt: '', paidAt: '', voidedAt: '',
    createdAt:         now,
    createdBy:         auth.userId             || '',
    source:            body.source             || 'manual',
    sourceQuoteId:     body.sourceQuoteId      || ''
  };

  _finWrite(FINANCE_INV, inv);

  // HMRC: income recognition — raised when invoice is created (accrual basis)
  // For cash basis accounting, this can be filtered by paidAt date
  _writeTxn({
    id:                 'TXN-' + id,
    transactionDate:    body.invoiceDate,
    type:               'invoice',
    category:           body.contractId ? 'Contract Revenue' : 'One-off Revenue',
    description:        'Invoice ' + id + ' — ' + body.customerName,
    supplierOrCustomer: body.customerName,
    amountNet:          net,
    amountVat:          vat,
    amountGross:        gross,
    linkedContractId:   body.contractId || '',
    linkedSiteId:       body.siteId     || '',
    source:             'invoice',
    sourceId:           id,
    status:             'active',
    externalRef:        '',
    notes:              body.notes      || '',
    createdAt:          now
  });

  auditLog(auth.userId, 'CREATE', 'FinanceInvoice', id, null, inv);
  return { ok: true, id: id };
}

// ── POST: Mark Invoice Sent ───────────────────────────────────
function markFinanceInvoiceSent(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'MarkInvoiceSent');
  _finUpdate(FINANCE_INV, body.id, { status: 'Issued', sentAt: new Date().toISOString() });
  return { ok: true };
}

// ── POST: Record Payment ──────────────────────────────────────
// Marks invoice paid AND writes a payment transaction to Finance_Transactions
function recordFinancePayment(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['invoiceId', 'amountGross', 'transactionDate'], 'FinancePayment');

  var id    = _finId('PAY');
  var now   = new Date().toISOString();
  var gross = _pf(body.amountGross);

  // Update invoice status
  _finUpdate(FINANCE_INV, body.invoiceId, { status: 'Paid', paidAt: now });

  // HMRC: cash received — separate from invoice raised (useful for cash basis VAT)
  _writeTxn({
    id:                 id,
    transactionDate:    body.transactionDate,
    type:               'payment',
    category:           'One-off Revenue',
    description:        'Payment received — Invoice ' + body.invoiceId,
    supplierOrCustomer: body.customerName  || '',
    amountNet:          gross,
    amountVat:          0,
    amountGross:        gross,
    linkedContractId:   body.linkedContractId || '',
    linkedSiteId:       body.linkedSiteId     || '',
    source:             'payment',
    sourceId:           body.invoiceId,
    status:             'active',
    externalRef:        body.reference         || '',
    notes:              body.paymentMethod      || body.notes || '',
    createdAt:          now
  });

  auditLog(auth.userId, 'PAYMENT', 'FinanceInvoice', body.invoiceId, null, body);
  return { ok: true, id: id };
}

// ── POST: Create Transaction ──────────────────────────────────
function createFinanceTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['transactionDate', 'type', 'category', 'amountGross', 'description'], 'FinanceTransaction');

  var id    = _finId('TXN');
  var now   = new Date().toISOString();
  var gross = _pf(body.amountGross);
  var vat   = _pf(body.amountVat   || 0);
  var net   = _pf(body.amountNet)  || (gross - vat);

  _writeTxn({
    id:                 id,
    transactionDate:    body.transactionDate,
    type:               body.type,
    category:           body.category,
    description:        body.description,
    supplierOrCustomer: body.supplierOrCustomer || '',
    amountNet:          net,
    amountVat:          vat,
    amountGross:        gross,
    linkedContractId:   body.linkedContractId   || '',
    linkedSiteId:       body.linkedSiteId       || '',
    source:             'manual',
    sourceId:           body.externalRef        || '',
    status:             'active',
    externalRef:        body.externalRef        || '',
    notes:              body.notes              || '',
    createdAt:          now
  });

  auditLog(auth.userId, 'CREATE', 'FinanceTransaction', id, null, body);
  return { ok: true, id: id };
}

// ── POST: Update Transaction ──────────────────────────────────
function updateFinanceTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'UpdateFinanceTransaction');
  var allowed = ['transactionDate','type','category','description','supplierOrCustomer',
    'amountNet','amountVat','amountGross','linkedContractId','linkedSiteId','externalRef','notes'];
  var updates = {};
  allowed.forEach(function(k) { if (body[k] !== undefined) updates[k] = body[k]; });
  _finUpdate(FINANCE_TXN, body.id, updates);
  return { ok: true };
}

// ── POST: Void Transaction ────────────────────────────────────
function voidFinanceTransaction(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'VoidFinanceTransaction');
  _finUpdate(FINANCE_TXN, body.id, { status: 'void', voidedAt: new Date().toISOString() });
  auditLog(auth.userId, 'VOID', 'FinanceTransaction', body.id, null, {});
  return { ok: true };
}

// ── POST: Create Expense ──────────────────────────────────────
// Writes to Finance_Transactions as type=expense (HMRC-linked)
function createFinanceExpense(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['expenseDate', 'category', 'amountGross', 'description'], 'FinanceExpense');

  var id    = _finId('EXP');
  var now   = new Date().toISOString();
  var gross = _pf(body.amountGross);
  var vat   = _pf(body.amountVat   || 0);
  var net   = gross - vat;

  _writeTxn({
    id:                 id,
    transactionDate:    body.expenseDate,
    type:               'expense',
    category:           body.category,
    description:        body.description,
    supplierOrCustomer: body.supplier           || '',
    amountNet:          net,
    amountVat:          vat,
    amountGross:        gross,
    linkedContractId:   body.linkedContractId   || '',
    linkedSiteId:       body.linkedSiteId       || '',
    source:             'expense',
    sourceId:           body.receiptRef         || '',
    status:             'active',
    externalRef:        body.receiptRef         || '',
    notes:              body.recurringFlag === 'Yes — Monthly'
                          ? 'Recurring monthly' : (body.notes || ''),
    createdAt:          now
  });

  auditLog(auth.userId, 'CREATE', 'FinanceExpense', id, null, body);
  return { ok: true, id: id };
}

// ── POST: Update Expense ──────────────────────────────────────
function updateFinanceExpense(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['id'], 'UpdateFinanceExpense');
  var allowed = ['category','description','amountGross','amountVat','supplier',
    'linkedSiteId','linkedContractId','receiptRef','notes'];
  var updates = {};
  allowed.forEach(function(k) { if (body[k] !== undefined) updates[k] = body[k]; });
  _finUpdate(FINANCE_TXN, body.id, updates);
  return { ok: true };
}

// ── POST: Generate Recurring Invoices ─────────────────────────
// Creates draft invoices for all active contracts for a given month
function generateFinanceRecurring(body, auth) {
  requireRole(auth, 'Finance');
  validate(body, ['targetMonth'], 'GenerateRecurring');

  var targetMonth = body.targetMonth; // YYYY-MM
  var contracts   = getTableRows('Contracts');
  var active      = contracts.filter(function(c) {
    return c.status === 'Active' && _pf(c.monthlyRevenue) > 0;
  });

  var existing = _finRead(FINANCE_INV, { month: targetMonth });
  var created  = 0;
  var now      = new Date().toISOString();
  var dueDate  = targetMonth + '-28';

  active.forEach(function(c) {
    // Skip if invoice already exists for this contract + month
    var dup = existing.some(function(i) {
      return i.contractId === c.id &&
             String(i.billingPeriodFrom || '').slice(0, 7) === targetMonth;
    });
    if (dup) return;

    var id    = _finId('INV');
    var net   = _pf(c.monthlyRevenue);
    var vat   = net * 0.2;
    var gross = net + vat;

    _finWrite(FINANCE_INV, {
      id:                id,
      status:            'Draft',
      customerName:      c.clientName || c.siteId || '',
      siteId:            c.siteId     || '',
      contractId:        c.id,
      invoiceDate:       targetMonth  + '-01',
      dueDate:           dueDate,
      billingPeriodFrom: targetMonth  + '-01',
      billingPeriodTo:   dueDate,
      subtotal:          net,
      vatAmount:         vat,
      totalAmount:       gross,
      lineItemsJson:     JSON.stringify([{
        description: 'Commercial cleaning services — ' + targetMonth, amountNet: net
      }]),
      paymentTerms:      30,
      notes:             'Auto-generated recurring invoice',
      sentAt: '', paidAt: '', voidedAt: '',
      createdAt:         now,
      createdBy:         auth.userId || 'system',
      source:            'recurring',
      sourceQuoteId:     ''
    });

    _writeTxn({
      id:                 'TXN-' + id,
      transactionDate:    targetMonth + '-01',
      type:               'invoice',
      category:           'Contract Revenue',
      description:        'Recurring invoice ' + id + ' — ' + (c.clientName || c.siteId),
      supplierOrCustomer: c.clientName     || '',
      amountNet:          net,
      amountVat:          vat,
      amountGross:        gross,
      linkedContractId:   c.id,
      linkedSiteId:       c.siteId         || '',
      source:             'recurring',
      sourceId:           id,
      status:             'active',
      externalRef:        '',
      notes:              'Auto-generated',
      createdAt:          now
    });

    created++;
  });

  return { ok: true, count: created, month: targetMonth };
}

// ── POST: Recalculate Snapshots ───────────────────────────────
// Builds a monthly P&L snapshot for HMRC reporting
function recalculateFinanceSnapshots(body, auth) {
  requireRole(auth, 'Finance');
  var month = body.month || new Date().toISOString().slice(0, 7);
  var txns  = _finRead(FINANCE_TXN, { month: month });

  var incTxns  = txns.filter(function(t) { return t.type === 'invoice' || t.type === 'income' || t.type === 'payment'; });
  var expTxns  = txns.filter(function(t) { return t.type === 'expense'; });

  var incNet   = incTxns.reduce(function(s, t) { return s + _pf(t.amountNet);   }, 0);
  var incVat   = incTxns.reduce(function(s, t) { return s + _pf(t.amountVat);   }, 0);
  var incGross = incTxns.reduce(function(s, t) { return s + _pf(t.amountGross); }, 0);
  var expGross = expTxns.reduce(function(s, t) { return s + _pf(t.amountGross); }, 0);
  var expVat   = expTxns.reduce(function(s, t) { return s + _pf(t.amountVat);   }, 0);

  var grossProfit = incNet - expGross;
  var marginPct   = incNet > 0 ? Math.round((grossProfit / incNet) * 100) : 0;
  var vatLiab     = incVat - expVat; // Output VAT - Input VAT

  var snap = {
    id:            'SNAP-' + month,
    month:         month,
    incomeNet:     incNet,
    incomeVat:     incVat,
    incomeGross:   incGross,
    expensesGross: expGross,
    expensesVat:   expVat,
    grossProfit:   grossProfit,
    marginPct:     marginPct,
    vatLiability:  vatLiab,
    txnCount:      txns.length,
    calculatedAt:  new Date().toISOString()
  };

  // Upsert — update if exists, insert if new
  var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  var sh = ss.getSheetByName(FINANCE_SNAP);
  if (sh) {
    var data    = sh.getDataRange().getValues();
    var headers = data[0];
    var idCol   = headers.indexOf('id');
    var found   = false;
    for (var i = 1; i < data.length; i++) {
      if (data[i][idCol] === snap.id) {
        var row = headers.map(function(h) {
          return snap[h] !== undefined ? snap[h] : data[i][headers.indexOf(h)];
        });
        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        found = true;
        break;
      }
    }
    if (!found) _finWrite(FINANCE_SNAP, snap);
  }

  invalidateCache();
  return { ok: true, count: 1, month: month, snapshot: snap };
}

// ── POST: Finance Assistant (Claude AI) ───────────────────────
function financeAssistant(body, auth) {
  requireRole(auth, 'Finance');
  var month   = body.month || new Date().toISOString().slice(0, 7);
  var dash    = getFinanceDashboard({ month: month }, auth);
  var message = body.message || 'Give me a brief financial summary for ' + month;

  var ctx = 'AskMiro Finance — ' + month + ':\n'
    + 'Revenue (net): £' + _pf(dash.revenue.net).toFixed(2)        + '\n'
    + 'VAT collected: £' + _pf(dash.revenue.vat).toFixed(2)        + '\n'
    + 'Expenses:      £' + _pf(dash.expenses.gross).toFixed(2)     + '\n'
    + 'Gross profit:  £' + _pf(dash.profit.net).toFixed(2)         + '\n'
    + 'VAT liability: £' + _pf(dash.vatLiability).toFixed(2)       + '\n'
    + 'Outstanding invoices: ' + dash.invoices.outstanding
    + ' (£' + _pf(dash.invoices.outstandingValue).toFixed(2) + ')\n'
    + 'Overdue: ' + dash.invoices.overdue
    + ' (£' + _pf(dash.invoices.overdueValue).toFixed(2) + ')\n';

  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { ok: true, message: ctx + '\n(AI analysis unavailable — set ANTHROPIC_API_KEY in GAS Script Properties)' };
  }

  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':           apiKey,
        'anthropic-version':   '2023-06-01',
        'content-type':        'application/json'
      },
      payload: JSON.stringify({
        model:      'claude-haiku-20240307',
        max_tokens: 500,
        messages: [{
          role:    'user',
          content: ctx + '\nUser: ' + message
            + '\nBe concise. Use £. Focus on HMRC-relevant insights (VAT liability, outstanding debt, cashflow).'
        }]
      })
    });
    var data = JSON.parse(resp.getContentText());
    return { ok: true, message: data.content[0].text };
  } catch(e) {
    return { ok: true, message: ctx + '\n(AI error: ' + e.message + ')' };
  }
}

// ── POST: Setup Finance Sheets ────────────────────────────────
// Creates the 4 Finance sheets with correct headers if they don't exist.
// Run once from the Finance tab Setup button.
function setupFinanceSheets(body, auth) {
  requireRole(auth, 'Owner');
  var ss      = SpreadsheetApp.openById(CFG.SHEET_ID);
  var created = [];

  var defs = [
    {
      name: FINANCE_INV,
      headers: [
        'id','status','customerName','customerAddress','customerEmail',
        'siteId','contractId',
        'invoiceDate','taxPoint','dueDate',
        'billingPeriodFrom','billingPeriodTo',
        'subtotal','vatAmount','vatRate','totalAmount',
        'lineItemsJson','paymentTerms','notes',
        'sentAt','paidAt','voidedAt',
        'createdAt','createdBy','source','sourceQuoteId'
      ]
    },
    {
      name: FINANCE_TXN,
      headers: [
        'id','transactionDate','type','category','description',
        'supplierOrCustomer','amountNet','amountVat','amountGross',
        'linkedContractId','linkedSiteId','source','sourceId',
        'status','externalRef','notes','createdAt'
      ]
    },
    {
      name: FINANCE_SNAP,
      headers: [
        'id','month','incomeNet','incomeVat','incomeGross',
        'expensesGross','expensesVat','grossProfit','marginPct',
        'vatLiability','txnCount','calculatedAt'
      ]
    },
    {
      name: FINANCE_SETT,
      headers: ['key','value','updatedAt']
    }
  ];

  defs.forEach(function(def) {
    var sh = ss.getSheetByName(def.name);
    if (!sh) {
      sh = ss.insertSheet(def.name);
      sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, def.headers.length)
        .setBackground('#0A1628')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
      created.push(def.name);
    }
  });

  // Seed default Finance_Settings if just created
  if (created.indexOf(FINANCE_SETT) >= 0) {
    var sh2 = ss.getSheetByName(FINANCE_SETT);
    var defaults = [
      ['vatRate',            0,                               new Date().toISOString()],
      ['defaultPaymentTerms',30,                              new Date().toISOString()],
      ['bankName',           'Miro Partners Ltd',             new Date().toISOString()],
      ['sortCode',           '04-06-05',                      new Date().toISOString()],
      ['accountNumber',      '26672911',                      new Date().toISOString()],
      ['companyName',        'AskMiro Cleaning Services',     new Date().toISOString()],
      ['tradingName',        'A trading name of Miro Partners Ltd', new Date().toISOString()],
      ['companyAddress',     'London, United Kingdom',        new Date().toISOString()],
      ['companyPhone',       '020 8073 0621',                 new Date().toISOString()],
      ['companyEmail',       'info@askmiro.com',              new Date().toISOString()],
      ['companyWebsite',     'www.askmiro.com',               new Date().toISOString()],
      ['vatRegistered',      'No',                            new Date().toISOString()],
      ['vatNumber',          '',                              new Date().toISOString()],
      ['companiesHouseNo',   '',                              new Date().toISOString()],
    ];
    defaults.forEach(function(r) { sh2.appendRow(r); });
  }

  invalidateCache();
  return {
    ok:       true,
    created:  created,
    existing: defs.map(function(d) { return d.name; })
              .filter(function(n) { return created.indexOf(n) < 0; })
  };
}
