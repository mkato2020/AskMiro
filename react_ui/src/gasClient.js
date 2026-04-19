/**
 * AskMiro — GAS API Client (gasClient.js)
 * ─────────────────────────────────────────────────────────────
 * Single bridge between the React OS frontend and the GAS backend.
 * GAS is the single source of truth for ALL operational data:
 *   Quotes, Finance (HMRC), Cleaners, Jobs, Settings.
 *
 * Railway Python remains responsible for:
 *   Leads, Pipeline, Signals, Analytics, Intelligence (AI scoring).
 *
 * Pattern: every call is a GET to the GAS web app URL.
 * POST actions use ?_method=POST&_body=JSON.stringify(payload).
 * This avoids CORS preflight issues and matches existing Ops behaviour.
 */

const GAS_URL   = import.meta.env.VITE_GAS_URL   || 'https://script.google.com/macros/s/AKfycbyOkdutI4j-blVoJJRw1UQ2YdYD0Os0GTX0ays08-MgkgPpLPfJ65oEVo5uEVcRbzSV/exec'
const GAS_TOKEN = import.meta.env.VITE_GAS_TOKEN  || 'Mike100864'

// ── Core HTTP helpers ────────────────────────────────────────────────────────

async function gasGet(action, params = {}) {
  const clean = Object.fromEntries(
    Object.entries({ action, _token: GAS_TOKEN, ...params })
      .filter(([, v]) => v != null && v !== '' && v !== false)
  )
  const qs  = new URLSearchParams(clean).toString()
  const res = await fetch(`${GAS_URL}?${qs}`, { redirect: 'follow' })
  if (!res.ok) throw new Error(`GAS ${action}: HTTP ${res.status}`)
  const data = await res.json()
  if (data && data.error) throw new Error(`GAS ${action}: ${data.error}`)
  return data
}

async function gasPost(action, body = {}) {
  const url = `${GAS_URL}?action=${encodeURIComponent(action)}&_token=${encodeURIComponent(GAS_TOKEN)}&_method=POST&_body=${encodeURIComponent(JSON.stringify(body))}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`GAS ${action}: HTTP ${res.status}`)
  const data = await res.json()
  if (data && data.error) throw new Error(`GAS ${action}: ${data.error}`)
  return data
}

// ── Shape mappers: GAS camelCase → Finance.jsx snake_case ───────────────────

/**
 * Map a GAS invoice row → shape Finance.jsx expects.
 * GAS: { id, customerName, totalAmount, invoiceDate, dueDate, lineItemsJson, ... }
 * React: { invoice_number, customer_name, total_amount, invoice_date, due_date, line_items, ... }
 */
function mapInvoice(inv) {
  if (!inv) return inv
  let lineItems = []
  try {
    lineItems = typeof inv.lineItemsJson === 'string'
      ? JSON.parse(inv.lineItemsJson)
      : (Array.isArray(inv.lineItemsJson) ? inv.lineItemsJson : [])
  } catch (_) {}

  const total    = parseFloat(inv.totalAmount || inv.total_amount || 0)
  const balDue   = inv.status === 'Paid' ? 0 : parseFloat(inv.balanceDue || total)
  const statusLC = (inv.status || 'draft').toLowerCase()

  return {
    // Keep all original GAS fields
    ...inv,
    // Add Railway-compatible aliases
    invoice_number:  inv.invoiceNumber || inv.id,
    customer_name:   inv.customerName  || inv.customer_name || '',
    site_name:       inv.siteAddress   || inv.customerAddress || inv.siteId || '',
    site_id:         inv.siteId        || '',
    invoice_date:    inv.invoiceDate   || inv.invoice_date || '',
    due_date:        inv.dueDate       || inv.due_date || '',
    tax_point:       inv.taxPoint      || inv.invoice_date || '',
    billing_from:    inv.billingPeriodFrom || '',
    billing_to:      inv.billingPeriodTo   || '',
    status:          statusLC,
    total:           total,
    total_amount:    total,
    balance:         balDue,
    balance_due:     balDue,
    line_items:      lineItems.length
      ? lineItems
      : [{ description: inv.serviceType || inv.siteId || 'Cleaning Services', amount: total }],
    notes:           inv.notes || '',
    payment_terms:   inv.paymentTerms || '',
    sent_at:         inv.sentAt   || null,
    paid_at:         inv.paidAt   || null,
    voided_at:       inv.voidedAt || null,
    created_at:      inv.createdAt || '',
  }
}

/**
 * Map a GAS Finance_Transaction row → Finance.jsx Transactions tab shape.
 */
function mapTransaction(txn) {
  if (!txn) return txn
  return {
    ...txn,
    date:         txn.transactionDate || txn.date || '',
    type:         txn.type || 'expense',
    category:     txn.category || '',
    description:  txn.description || '',
    amount:       parseFloat(txn.amountGross  || txn.amount || 0),
    amount_net:   parseFloat(txn.amountNet    || 0),
    amount_vat:   parseFloat(txn.amountVat    || 0),
    amount_gross: parseFloat(txn.amountGross  || txn.amount || 0),
    status:       (txn.status || 'confirmed').toLowerCase(),
    source_id:    txn.sourceId    || txn.source_id || '',
    contract_id:  txn.linkedContractId || '',
    notes:        txn.notes || '',
  }
}

/**
 * Map a GAS expense (Finance_Transactions type=expense) → Finance.jsx Expenses tab shape.
 */
function mapExpense(exp) {
  if (!exp) return exp
  return {
    ...exp,
    date:         exp.transactionDate || exp.expenseDate || exp.date || '',
    category:     exp.category || '',
    supplier:     exp.supplierOrCustomer || exp.supplier || '',
    description:  exp.description || '',
    amount_net:   parseFloat(exp.amountNet   || 0),
    amount_vat:   parseFloat(exp.amountVat   || 0),
    amount_gross: parseFloat(exp.amountGross || exp.amountNet || 0),
    status:       (exp.approvalStatus || exp.status || 'approved').toLowerCase(),
    recurring:    exp.recurringFlag === 'Yes' || exp.recurring || false,
  }
}

/**
 * Map a GAS finance.dashboard response → Finance.jsx Overview shape.
 */
function mapOverview(dash) {
  if (!dash) return {}
  return {
    // Keep original
    ...dash,
    // Overview tab KPIs
    period:    dash.thisMonth || '',
    revenue: {
      gross:   dash.invoicedRevenue || 0,
      net:     dash.invoicedRevenue || 0,
      vat:     0,
      mom_pct: dash.revenueMoM     || null,
    },
    expenses:  {
      total:   dash.totalExpenses  || 0,
      mom_pct: dash.expensesMoM   || null,
    },
    profit: {
      gross:   dash.grossProfit   || 0,
      margin:  dash.grossMargin   || 0,
    },
    outstanding: {
      count:   dash.outstandingCount  || 0,
      total:   dash.outstandingAmount || 0,
    },
    overdue: {
      count:   dash.overdueCount  || 0,
      total:   dash.overdueAmount || 0,
    },
    cash_in:           dash.cashIn           || 0,
    alerts:            dash.alerts           || [],
    recent_invoices:   (dash.recentInvoices  || []).map(mapInvoice),
    recent_expenses:   (dash.recentExpenses  || []).map(mapExpense),
  }
}

/**
 * Map GAS finance.settings → shape the React Quotes/Finance pages use.
 * GAS uses camelCase keys; React pages use snake_case equivalents.
 */
function mapSettings(sett) {
  if (!sett) return {}
  return {
    ...sett,
    // Finance.jsx and Quotes.jsx setting accessors
    vat_rate:          parseFloat(sett.vatRate          || 0),
    llw_rate:          parseFloat(sett.llwRate          || sett.llw_rate          || 13.85),
    on_costs_pct:      parseFloat(sett.onCostsPct       || sett.on_costs_pct      || 36),
    min_margin_pct:    parseFloat(sett.minMarginPct     || sett.min_margin_pct    || 20),
    payment_terms:     parseInt  (sett.defaultPaymentTerms || 30),
    bank_name:         sett.bankName         || 'Miro Partners Ltd',
    sort_code:         sett.sortCode         || '04-06-05',
    account_number:    sett.accountNumber    || '26672911',
    vat_registered:    sett.vatRegistered    === 'Yes',
    vat_number:        sett.vatNumber        || '',
    company_name:      sett.companyName      || 'AskMiro Cleaning Services',
    company_address:   sett.companyAddress   || 'London, United Kingdom',
    company_phone:     sett.companyPhone     || '020 8073 0621',
    company_email:     sett.companyEmail     || 'info@askmiro.com',
    company_website:   sett.companyWebsite   || 'www.askmiro.com',
  }
}

/**
 * Map a GAS quote row → both camelCase (original) + snake_case aliases.
 * Quotes.jsx loadIntoBuilder reads: q.client_name, q.site_address, q.hours_per_week etc.
 */
function mapQuote(q) {
  if (!q) return q
  return {
    ...q,
    // Add snake_case aliases for React compatibility
    client_name:       q.clientName     || q.client_name     || '',
    site_address:      q.siteAddress    || q.site_address    || '',
    site_postcode:     q.postcode       || q.site_postcode   || '',
    sector:            q.segment        || q.sector          || 'Office',
    mode:              q.mode           || 'hourly',
    hours_per_week:    q.hoursPerWeek   || q.hours_per_week  || 20,
    days_per_week:     q.daysPerWeek    || q.days_per_week   || 5,
    client_rate:       q.hourlyRate     || q.client_rate     || 0,
    llw_rate:          q.llwRate        || q.llw_rate        || 13.85,
    on_costs_pct:      q.onCostsPct     || q.on_costs_pct    || 36,
    supplies_month:    q.suppliesCost   || q.supplies_month  || 0,
    other_costs_month: q.otherCosts     || q.other_costs_month || 0,
    notes:             q.notes          || '',
  }
}

/**
 * Map React form (snake_case) → GAS saveQuote payload (camelCase).
 * Called from Quotes.jsx saveQuote callback.
 */
export function quoteFormToGas(form, calc, llw, onCosts, isOneOff) {
  const base = {
    clientName:  form.client?.trim(),
    siteAddress: form.site?.trim(),
    postcode:    form.postcode?.trim(),
    segment:     form.segment,
    email:       form.clientEmail || '',
    notes:       form.notes       || '',
    status:      'Draft',
  }
  if (isOneOff) {
    const lineItems = form.lineItems
      .filter(li => li.desc && li.amt)
      .map(li => ({ description: li.desc, amount: Number(li.amt) }))
    const total = Number(form.fixedTotal) || lineItems.reduce((s, li) => s + li.amount, 0)
    return {
      ...base,
      mode:         'one_off',
      serviceType:  form.serviceType,
      jobDate:      form.jobDate      || '',
      jobTime:      form.jobTime      || '',
      propDetails:  form.propDetails  || '',
      vatRate:      String(form.vatPct || 0),
      scope:        form.scope        || '',
      paymentLink:  form.paymentLink  || '',
      lineItemsJson: JSON.stringify(lineItems),
      totalAmount:  total,
      revenueMonthly: 0,
      grossMarginPct: 100,
      directCost:   0,
    }
  }
  return {
    ...base,
    mode:           form.mode === 'Hourly Rate' ? 'hourly' : 'fixed',
    hoursPerWeek:   Number(form.hrs),
    daysPerWeek:    Number(form.days),
    hourlyRate:     Number(form.rate),
    llwRate:        llw,
    oncostPct:      onCosts,
    suppliesCost:   Number(form.supplies),
    otherCosts:     Number(form.other),
    revenueMonthly: Math.round((calc.revenue  || 0) * 100) / 100,
    grossMarginPct: Math.round((calc.margin   || 0) * 100) / 100,
    grossMarginGBP: Math.round((calc.grossMargin || 0) * 100) / 100,
    directCost:     Math.round((calc.totalCosts  || 0) * 100) / 100,
  }
}

// ── Profitability mapper (GAS snapshots → Finance.jsx profitability tab) ─────

function mapProfitability(data) {
  const snapshots = Array.isArray(data) ? data : (data?.snapshots || [])
  const sorted    = [...snapshots].sort((a, b) => (b.month || '') > (a.month || '') ? 1 : -1)
  const latest    = sorted[0] || {}
  return {
    snapshots,
    month:           latest.month         || '',
    revenue_net:     parseFloat(latest.revenueNet   || latest.revenue    || 0),
    expenses_total:  parseFloat(latest.expensesTotal || latest.expenses  || 0),
    profit_gross:    parseFloat(latest.grossProfit   || 0),
    margin_pct:      parseFloat(latest.grossMargin   || 0),
    vat_liability:   parseFloat(latest.vatLiability  || 0),
  }
}

// ── Public gasClient API ─────────────────────────────────────────────────────

export const gasClient = {

  // ── Quotes ────────────────────────────────────────────────────────────────
  quotes: {
    list: (status) =>
      gasGet('quotes', status ? { status } : {})
        .then(raw => (Array.isArray(raw) ? raw : raw?.quotes || []).map(mapQuote)),

    get: (id) =>
      gasGet('quote', { id }),

    save: (payload) =>
      gasPost('quote', payload),

    send: (payload) =>
      gasPost('quote.send', payload),

    approve: (payload) =>
      gasPost('quote.approve', payload),

    intel: (id) =>
      gasGet('quote.intel', { id }),
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  finance: {
    overview: () =>
      gasGet('finance.dashboard').then(mapOverview),

    invoices: (status, month) =>
      gasGet('finance.invoices', { status, month }).then(raw =>
        (Array.isArray(raw) ? raw : raw?.invoices || []).map(mapInvoice)
      ),

    createInvoice: (body) =>
      gasPost('finance.createInvoice', body),

    markSent: (id) =>
      gasPost('finance.markInvoiceSent', { id }),

    voidInvoice: (id) =>
      gasPost('finance.voidTransaction', { id, type: 'invoice' }),

    recordPayment: (id, body) =>
      gasPost('finance.recordPayment', { invoiceId: id, ...body }),

    expenses: (cat, month) =>
      gasGet('finance.expenses', { category: cat, month }).then(raw => ({
        expenses:            (Array.isArray(raw) ? raw : raw?.expenses || []).map(mapExpense),
        by_category:         raw?.by_category         || [],
        recurring_templates: raw?.recurring_templates || [],
      })),

    createExpense: (body) =>
      gasPost('finance.createExpense', body),

    transactions: (type, cat, month) =>
      gasGet('finance.transactions', { type, category: cat, month }).then(raw => ({
        transactions: (Array.isArray(raw) ? raw : raw?.transactions || []).map(mapTransaction),
      })),

    createTransaction: (body) =>
      gasPost('finance.createTransaction', body),

    voidTransaction: (id) =>
      gasPost('finance.voidTransaction', { id }),

    profitability: (month) =>
      gasGet('finance.snapshots', month ? { month } : {}).then(mapProfitability),

    recalcSnapshots: (month) =>
      gasPost('finance.recalculateSnapshots', month ? { month } : {}),

    generateRecurring: (month) =>
      gasPost('finance.generateRecurring', { month }),

    settings: () =>
      gasGet('finance.settings').then(mapSettings),

    updateSettings: (body) =>
      gasPost('finance.updateSetting', { settings: body }),
  },

  // ── Settings (HMRC + Company) ─────────────────────────────────────────────
  settings: {
    get: () =>
      gasGet('finance.settings').then(mapSettings),

    update: (key, value) =>
      gasPost('finance.updateSetting', { key, value }),

    bulkUpdate: (obj) =>
      gasPost('finance.updateSetting', { settings: obj }),
  },

  // ── Cleaners ──────────────────────────────────────────────────────────────
  cleaners: {
    list: () =>
      gasGet('cleaners').then(raw => Array.isArray(raw) ? raw : raw?.cleaners || []),

    save: (body) =>
      gasPost('cleaner', body),

    delete: (id) =>
      gasPost('cleaner.delete', { id }),
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    get: () =>
      gasGet('dashboard'),
  },
}
