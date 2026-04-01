const BASE = ''
async function req(path, opts={}) {
  let res
  try {
    res = await fetch(BASE+path,{headers:{'Content-Type':'application/json',...(opts.headers||{})},method:opts.method||'GET',body:opts.body?JSON.stringify(opts.body):undefined})
  } catch(netErr) {
    // Network error (offline, DNS, Render cold start timeout)
    console.warn('[api] network error on', path, netErr.message)
    throw new Error(`Network error: ${netErr.message}`)
  }
  // Auth redirect — only redirect if auth is truly required, don't loop
  if(res.status===401&&!path.startsWith('/auth/')){
    console.warn('[api] 401 on', path)
    // Don't redirect — let the auth guard in App.jsx handle it
    throw new Error('Not authenticated')
  }
  if(!res.ok) {
    // Try to get error detail from response body
    let detail = `${res.status} ${res.statusText}`
    try { const body = await res.json(); detail = body.detail || body.error || detail } catch(e) {}
    throw new Error(detail)
  }
  // Guard against non-JSON responses (Render 502 pages, etc.)
  const ct = res.headers.get('content-type') || ''
  if(!ct.includes('application/json')){
    console.warn('[api] non-JSON response on', path, ct)
    // Try parsing anyway — some endpoints don't set content-type
    try { return await res.json() } catch(e) {
      throw new Error('Server returned non-JSON response')
    }
  }
  return res.json()
}
export const api = {
  summary:()=>req('/api/analytics/summary'),
  market:(b)=>req('/api/analytics/market'+(b?'?borough='+encodeURIComponent(b):'')),
  topOpportunities:(b)=>req('/api/analytics/top-opportunities?limit=100'+(b?'&borough='+encodeURIComponent(b):'')),
  boroughDrilldown:(b)=>req('/api/analytics/borough-drilldown?borough='+encodeURIComponent(b)),
  pipelineAnalytics:()=>req('/api/analytics/pipeline'),
  sectorRevenue:()=>req('/api/analytics/sector-revenue'),
  filters:()=>req('/api/leads/filters'),
  leads:(p)=>req('/api/leads?'+new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,v])=>v!=null&&v!==''&&v!==0&&v!==false))).toString()),
  lead:(id)=>req('/api/leads/'+id),
  activities:(id)=>req('/api/leads/'+id+'/activities'),
  notes:(id)=>req('/api/leads/'+id+'/notes'),
  logActivity:(id,body)=>req('/api/leads/'+id+'/activities',{method:'POST',body}),
  addNote:(id,body)=>req('/api/leads/'+id+'/notes',{method:'POST',body}),
  deleteNote:(id)=>req('/api/notes/'+id,{method:'DELETE'}),
  archiveLead:(id)=>req('/api/leads/'+id+'/archive',{method:'POST'}),
  pipelineLeads:()=>req('/api/pipeline'),
  advanceLead:(id,body)=>req('/api/pipeline/'+id+'/advance',{method:'POST',body}),
  shortlist:(body)=>req('/api/pipeline/shortlist',{method:'POST',body}),
  signals:(t)=>req('/api/signals?limit=500'+(t?'&signal_type='+t:'')),
  tasks:()=>req('/api/tasks/today'),
  completeTask:(id)=>req('/api/tasks/'+id+'/complete',{method:'POST'}),
  snoozeTask:(id)=>req('/api/tasks/'+id+'/snooze',{method:'POST'}),
  outreach:(id)=>req('/api/outreach/'+id),
  generateOutreach:(id)=>req('/api/outreach/'+id+'/generate',{method:'POST'}),
  adminStatus:()=>req('/api/admin/status'),
  rescore:()=>req('/api/admin/rescore',{method:'POST'}),
  runConnector:(src)=>req('/api/admin/connectors/'+src,{method:'POST'}),
  runPlanningFilter:()=>req('/api/admin/run-planning-filter',{method:'POST'}),
  runEnrichment:()=>req('/api/admin/run-contact-enrichment',{method:'POST'}),
  runRenewals:()=>req('/api/admin/run-renewal-predictions',{method:'POST'}),
  runDailyTasks:()=>req('/api/admin/run-daily-tasks',{method:'POST'}),
  generateScript:(body)=>req('/api/sales/generate-script',{method:'POST',body}),
  sendEmail:(id)=>req('/api/leads/'+id+'/send-email',{method:'POST'}),
  contracts:()=>req('/api/contracts'),
  quotes:(status)=>req('/api/quotes'+(status?'?status='+status:'')),
  intelligence:(id)=>req('/api/leads/'+id+'/intelligence'),
  outreachQueue:(limit)=>req('/api/outreach-queue'+(limit?'?limit='+limit:'')),
  authStatus:()=>req('/auth/status'),
  emailQueue:()=>req('/api/email/queue'),
  emailStats:()=>req('/api/email/stats'),
  emailLog:()=>req('/api/email/log'),
  emailReplies:()=>req('/api/email/replies'),
  emailAutorun:()=>req('/api/email/autorun'),
  emailSendOne:(body)=>req('/api/email/send',{method:'POST',body}),
  emailResolve:(body)=>req('/api/email/resolve',{method:'POST',body}),
  crmSync:()=>req('/api/crm/sync',{method:'POST'}),
  crmStatus:()=>req('/api/crm/status'),
  emailGuardStats:()=>req('/api/email-guard/stats'),
  emailGuardLog:(limit,status)=>req('/api/email-guard/send-log?limit='+(limit||100)+(status?'&status='+status:'')),
  emailGuardSuppressions:()=>req('/api/email-guard/suppressions'),
  emailGuardValidate:(id)=>req('/api/email-guard/validate/'+id,{method:'POST'}),
  // Finance
  financeOverview:()=>req('/api/finance/overview'),
  financeInvoices:(s,m)=>req('/api/finance/invoices?'+(s?'status='+s+'&':'')+(m?'month='+m:'')),
  createInvoice:(body)=>req('/api/finance/invoices',{method:'POST',body}),
  markInvoiceSent:(id)=>req('/api/finance/invoices/'+id+'/mark-sent',{method:'POST'}),
  voidInvoice:(id)=>req('/api/finance/invoices/'+id+'/void',{method:'POST'}),
  recordPayment:(id,body)=>req('/api/finance/invoices/'+id+'/payment',{method:'POST',body}),
  financeExpenses:(cat,m)=>req('/api/finance/expenses?'+(cat?'category='+encodeURIComponent(cat)+'&':'')+(m?'month='+m:'')),
  createExpense:(body)=>req('/api/finance/expenses',{method:'POST',body}),
  financeTransactions:(t,cat,m)=>req('/api/finance/transactions?'+(t?'type='+t+'&':'')+(cat?'category='+encodeURIComponent(cat)+'&':'')+(m?'month='+m:'')),
  createTransaction:(body)=>req('/api/finance/transactions',{method:'POST',body}),
  voidTransaction:(id)=>req('/api/finance/transactions/'+id+'/void',{method:'POST'}),
  financeProfitability:(m)=>req('/api/finance/profitability'+(m?'?month='+m:'')),
  recalculateSnapshots:(m)=>req('/api/finance/recalculate-snapshots',{method:'POST',body:m?{month:m}:{}}),
  generateRecurring:(m)=>req('/api/finance/generate-recurring',{method:'POST',body:{target_month:m}}),
  financeSettings:()=>req('/api/finance/settings'),
  updateFinanceSettings:(body)=>req('/api/finance/settings',{method:'POST',body}),
  vatReturn:(q)=>req('/api/finance/vat-return'+(q?'?quarter='+q:'')),
  taxSummary:(y)=>req('/api/finance/tax-summary'+(y?'?year='+y:'')),
  cashForecast:()=>req('/api/finance/cash-forecast'),
  // Operations
  operations:()=>req('/api/operations'),
  createJob:(body)=>req('/api/operations/jobs',{method:'POST',body}),
  clockIn:(id)=>req('/api/operations/jobs/'+id+'/clock-in',{method:'POST'}),
  clockOut:(id)=>req('/api/operations/jobs/'+id+'/clock-out',{method:'POST'}),
  // Cleaners
  cleaners:()=>req('/api/cleaners'),
  createCleaner:(body)=>req('/api/cleaners',{method:'POST',body}),
  updateCleaner:(id,body)=>req('/api/cleaners/'+id,{method:'PUT',body}),
  archiveCleaner:(id)=>req('/api/cleaners/'+id+'/archive',{method:'POST'}),
  toggleCleanerAvailable:(id)=>req('/api/cleaners/'+id+'/toggle-available',{method:'POST'}),
  // Quality
  quality:()=>req('/api/quality'),
  createInspection:(body)=>req('/api/quality/inspections',{method:'POST',body}),
  createIncident:(body)=>req('/api/quality/incidents',{method:'POST',body}),
  resolveIncident:(id,body)=>req('/api/quality/incidents/'+id+'/resolve',{method:'POST',body}),
  // Payroll
  payroll:()=>req('/api/payroll'),
  createPayEntry:(body)=>req('/api/payroll/entries',{method:'POST',body}),
  createPayWorker:(body)=>req('/api/payroll/workers',{method:'POST',body}),
  updatePayWorker:(id,body)=>req('/api/payroll/workers/'+id,{method:'PUT',body}),
  approvePayroll:(body)=>req('/api/payroll/approve',{method:'POST',body}),
  markPayrollPaid:(body)=>req('/api/payroll/mark-paid',{method:'POST',body}),
  // SEO
  seoContent:()=>req('/api/seo-content'),
  createArticle:(body)=>req('/api/seo/articles',{method:'POST',body}),
  updateArticle:(id,body)=>req('/api/seo/articles/'+id,{method:'PUT',body}),
  publishArticle:(id)=>req('/api/seo/articles/'+id+'/publish',{method:'POST'}),
  addKeyword:(body)=>req('/api/seo/keywords',{method:'POST',body}),
  seoGenerate:(body)=>req('/api/seo/generate',{method:'POST',body}),
  // Compliance
  compliance:()=>req('/api/compliance'),
  complianceCategories:()=>req('/api/compliance/categories'),
  complianceDocuments:(cat,status)=>req('/api/compliance/documents?'+(cat?'category='+encodeURIComponent(cat)+'&':'')+(status?'status='+status:'')),
  createComplianceDoc:(body)=>req('/api/compliance/documents',{method:'POST',body}),
  updateComplianceDoc:(id,body)=>req('/api/compliance/documents/'+id,{method:'PUT',body}),
  reviewComplianceDoc:(id,body)=>req('/api/compliance/documents/'+id+'/review',{method:'POST',body}),
  deleteComplianceDoc:(id)=>req('/api/compliance/documents/'+id,{method:'DELETE'}),
  generateComplianceDocs:()=>req('/api/compliance/generate-from-categories',{method:'POST'}),
  complianceExpiring:()=>req('/api/compliance/expiring'),
  // Compliance templates
  complianceTemplates:()=>req('/api/compliance/templates'),
  complianceTemplate:(name)=>req('/api/compliance/templates/'+encodeURIComponent(name)),
  // Public
  joinTeam:(body)=>req('/api/public/join-team',{method:'POST',body}),
}
