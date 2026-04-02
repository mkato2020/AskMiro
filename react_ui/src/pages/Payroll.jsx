import {useState,useCallback,useMemo} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {formatDate} from '../utils'
import Spinner from '../components/Spinner'

/* ─── constants ─── */
const TABS=['Entries','Workers','Payroll','Payslips']
const ENTRY_STATUSES=['All','Pending','Approved','Paid']
const ENTRY_TYPES=[
  {value:'basic',label:'Basic Hours',mult:1},
  {value:'overtime_1_5',label:'Overtime x1.5',mult:1.5},
  {value:'overtime_2',label:'Overtime x2',mult:2},
  {value:'night_shift',label:'Night Shift',mult:1.3},
  {value:'holiday_pay',label:'Holiday Pay',mult:1},
  {value:'training',label:'Training',mult:1},
  {value:'other',label:'Other',mult:1},
]
const ROLES=['Cleaner','Supervisor','Team Leader','Driver','Office']
const PAY_METHODS=['BACS','Cash','Cheque']
const PAY_TYPES=['PAYE','Self-employed','Agency']

const gbp=v=>v!=null?'£'+Number(v).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'

const typePill=(t)=>{
  const map={
    overtime_1_5:{bg:'rgba(139,92,246,0.14)',color:'#8B5CF6',label:'OT x1.5'},
    overtime_2:{bg:'rgba(139,92,246,0.14)',color:'#8B5CF6',label:'OT x2'},
    night_shift:{bg:'rgba(59,130,246,0.14)',color:'#3B82F6',label:'Night Shift'},
    basic:{bg:'rgba(13,189,173,0.12)',color:'#0DBDAD',label:'Basic'},
    holiday_pay:{bg:'rgba(13,189,173,0.12)',color:'#0DBDAD',label:'Holiday'},
    training:{bg:'rgba(13,189,173,0.12)',color:'#0DBDAD',label:'Training'},
    other:{bg:'rgba(13,189,173,0.12)',color:'#0DBDAD',label:'Other'},
  }
  const s=map[t]||map.other
  return <span style={{fontSize:'0.7rem',fontWeight:600,padding:'2px 10px',borderRadius:999,background:s.bg,color:s.color}}>{s.label}</span>
}

const statusPill=(s)=>{
  const map={
    pending:{bg:'rgba(245,158,11,0.14)',color:'#D97706',label:'Pending'},
    approved:{bg:'rgba(13,189,173,0.14)',color:'#0DBDAD',label:'Approved'},
    paid:{bg:'rgba(16,185,129,0.14)',color:'#059669',label:'Paid'},
    active:{bg:'rgba(16,185,129,0.14)',color:'#059669',label:'Active'},
    inactive:{bg:'rgba(107,114,128,0.14)',color:'#6B7280',label:'Inactive'},
  }
  const c=map[(s||'').toLowerCase()]||{bg:'rgba(107,114,128,0.14)',color:'#6B7280',label:s||'—'}
  return <span style={{fontSize:'0.7rem',fontWeight:600,padding:'2px 10px',borderRadius:999,background:c.bg,color:c.color}}>{c.label}</span>
}

/* ─── sub-components ─── */
const KPI=({label,value,sub,color})=>(
  <div style={{flex:1,minWidth:160,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
    <div style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{label}</div>
    <div style={{fontSize:'1.5rem',fontWeight:800,color:color||'var(--text-1)',letterSpacing:'-.02em'}}>{value}</div>
    {sub&&<div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:4}}>{sub}</div>}
  </div>
)

const TH=({children,right})=>(
  <th style={{padding:'10px 16px',textAlign:right?'right':'left',fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)'}}>{children}</th>
)
const TD=({children,right,style:s})=>(
  <td style={{padding:'10px 16px',fontSize:'0.82rem',color:'var(--text-2)',textAlign:right?'right':'left',...s}}>{children}</td>
)

const Btn=({children,onClick,color='var(--teal)',small,outline,disabled,style:extra})=>(
  <button disabled={disabled} onClick={onClick} style={{
    padding:small?'4px 12px':'8px 18px',fontSize:small?'0.72rem':'0.8rem',fontWeight:600,
    border:outline?`1px solid ${color}`:'none',borderRadius:6,cursor:disabled?'not-allowed':'pointer',
    background:outline?'transparent':color,color:outline?color:'#fff',opacity:disabled?0.5:1,
    transition:'all .15s',...extra
  }}>{children}</button>
)

const Modal=({title,onClose,children,width})=>(
  <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
    <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.55)'}}/>
    <div onClick={e=>e.stopPropagation()} style={{position:'relative',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:12,padding:'28px 32px',width:width||520,maxWidth:'92vw',maxHeight:'88vh',overflowY:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <h2 style={{fontSize:'1.1rem',fontWeight:800,margin:0}}>{title}</h2>
        <button onClick={onClose} style={{background:'none',border:'none',fontSize:'1.2rem',cursor:'pointer',color:'var(--text-muted)',padding:4}}>✕</button>
      </div>
      {children}
    </div>
  </div>
)

const Field=({label,children,required})=>(
  <div style={{marginBottom:14}}>
    <label style={{display:'block',fontSize:'0.72rem',fontWeight:600,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}{required&&<span style={{color:'#DC2626'}}> *</span>}</label>
    {children}
  </div>
)

const inputStyle={width:'100%',padding:'8px 12px',fontSize:'0.85rem',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:6,color:'var(--text-1)',outline:'none',boxSizing:'border-box'}
const selectStyle={...inputStyle,appearance:'auto'}

/* ─── payslip print ─── */
function openPayslip(group,entries,workers){
  const w=window.open('','_blank','width=850,height=1100')
  if(!w)return
  const workerEntries=(entries||[]).filter(e=>e.worker_id===group.worker_id&&e.status!=='void')
  const worker=(workers||[]).find(wk=>wk.id===group.worker_id)||{}
  const grossPay=group.gross_pay||0
  const totalHours=group.total_hours||0

  // 2025-26 UK tax thresholds (monthly)
  const personalAllowance=12570/12 // £1,047.50/mo
  const taxable=Math.max(0,grossPay-personalAllowance)
  const tax=Math.round(taxable*0.2*100)/100

  // NI thresholds 2025-26 (monthly)
  const niPT=1048/12 // Primary Threshold ~£87.33/week
  const niable=Math.max(0,grossPay-niPT)
  const employeeNI=Math.round(niable*0.08*100)/100 // 8% from Apr 2024
  const employerNI=Math.round(niable*0.138*100)/100 // 13.8% employer

  const totalDeductions=Math.round((tax+employeeNI)*100)/100
  const netPay=Math.round((grossPay-totalDeductions)*100)/100

  const byType={}
  workerEntries.forEach(e=>{
    const k=e.entry_type||'basic'
    if(!byType[k])byType[k]={hours:0,rate:0,gross:0,count:0}
    byType[k].hours+=(e.hours_worked||0)
    byType[k].gross+=(e.total_pay||0)
    byType[k].rate=(e.hourly_rate||0)
    byType[k].count++
  })
  const typeLabel=t=>ENTRY_TYPES.find(x=>x.value===t)?.label||t
  const taxCode=worker.tax_code||'1257L'
  const niNumber=worker.ni_number||'Not on file'
  const payMethod=worker.payment_method||group.payment_method||'BACS'
  const payType=worker.payroll_type||'PAYE'
  const empRef=`PAY-${(group.period||'').replace(/\s/g,'-').slice(0,7)}-WKR${group.worker_id||1}`
  const payDate=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})
  const periodLabel=group.period||'Current Period'

  w.document.write(`<!DOCTYPE html><html><head><title>Payslip - ${group.worker_name} - ${periodLabel}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#e5e7eb;padding:30px}
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
.slip{max-width:780px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1)}

/* Header */
.header{background:#111827;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:flex-start}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-icon{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#14b8a6,#059669);display:flex;align-items:center;justify-content:center}
.logo-icon svg{width:20px;height:14px}
.brand{font-size:1.15rem;font-weight:800;letter-spacing:-0.02em}
.brand span{color:#14b8a6}
.brand-sub{font-size:0.72rem;color:#9ca3af;margin-top:2px}
.title-block{text-align:right}
.title-block h1{font-size:1.4rem;font-weight:800;letter-spacing:0.03em}
.title-block .period{font-size:0.82rem;color:#14b8a6;font-weight:600;margin-top:2px}
.confidential{display:inline-block;margin-top:8px;font-size:0.6rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:3px 12px;border:1px solid #374151;border-radius:4px;color:#9ca3af}

/* Employee section */
.emp-section{display:flex;padding:24px 32px;gap:0;border-bottom:1px solid #e5e7eb}
.emp-col{flex:1;padding:0 8px}
.emp-col:first-child{padding-left:0}
.emp-col:last-child{padding-right:0}
.lbl{font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#14b8a6;margin-bottom:4px}
.emp-name{font-size:1.1rem;font-weight:800;color:#111827}
.emp-role{font-size:0.82rem;color:#6b7280;margin-top:2px}
.emp-addr{font-size:0.78rem;color:#9ca3af;font-style:italic;margin-top:4px}
.emp-val{font-size:0.88rem;font-weight:700;color:#111827}
.emp-sub{font-size:0.78rem;color:#6b7280;margin-top:2px}
.emp-sub-lbl{font-size:0.6rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-top:8px;margin-bottom:2px}

/* Employer bar */
.employer-bar{display:flex;background:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}
.employer-bar .cell{flex:1;padding:12px 20px}
.employer-bar .cell-lbl{font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#14b8a6;margin-bottom:3px}
.employer-bar .cell-val{font-size:0.85rem;font-weight:700;color:#111827}

/* Two-column earnings/deductions */
.two-col{display:flex;padding:20px 32px;gap:32px}
.two-col .col-half{flex:1}
.col-half h3{font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#14b8a6;margin-bottom:8px}
.earn-table{width:100%;font-size:0.82rem}
.earn-table td{padding:6px 0;color:#374151}
.earn-table td.r{text-align:right;font-weight:500}
.earn-table .total-line{border-top:2px solid #e5e7eb;padding-top:10px;margin-top:4px}
.earn-table .total-line td{font-weight:800;font-size:0.88rem}
.earn-table .total-line td.amount{color:#14b8a6}
.ded-table{width:100%;font-size:0.82rem}
.ded-table td{padding:6px 0;color:#374151}
.ded-table td.r{text-align:right;font-weight:500}
.ded-table .ded-sub{font-size:0.72rem;color:#9ca3af;font-weight:400}
.ded-table .total-line{border-top:2px solid #e5e7eb;padding-top:10px;margin-top:4px}
.ded-table .total-line td{font-weight:800;font-size:0.88rem}
.ded-table .total-line td.amount{color:#ef4444}
.disclaimer{font-size:0.68rem;color:#9ca3af;margin-top:12px;line-height:1.4;display:flex;gap:6px;align-items:flex-start}
.disclaimer .info-icon{flex-shrink:0;width:14px;height:14px;border-radius:50%;border:1px solid #d1d5db;display:flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:700;color:#9ca3af;margin-top:1px}

/* YTD + Pay Breakdown */
.ytd-section{display:flex;padding:20px 32px;gap:32px;border-top:1px solid #e5e7eb}
.ytd-col{flex:1}
.ytd-col h3{font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:8px}
.ytd-row{display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem}
.ytd-row .k{color:#6b7280}
.ytd-row .v{font-weight:600;color:#111827}
.net-pay-row .k{font-weight:800;color:#059669;font-size:0.9rem}
.net-pay-row .v{font-weight:800;color:#059669;font-size:1.05rem}

/* Net Pay Footer */
.net-footer{background:#111827;padding:20px 32px;display:flex;justify-content:space-between;align-items:center}
.net-footer-left{color:#fff}
.net-footer-left .nf-title{font-size:0.82rem;font-weight:700}
.net-footer-left .nf-sub{font-size:0.72rem;color:#9ca3af;margin-top:2px}
.net-footer-right{display:flex;align-items:center;gap:14px}
.net-footer-amount{font-size:2rem;font-weight:800;color:#fff}
.net-footer-amount sup{font-size:0.9rem;font-weight:600;vertical-align:super}
.paye-badge{background:#14b8a6;color:#fff;font-size:0.65rem;font-weight:800;letter-spacing:0.06em;padding:4px 10px;border-radius:4px}

/* Bottom info */
.bottom-info{display:flex;padding:14px 32px;gap:0;border-top:1px solid #e5e7eb}
.bottom-info .bi-col{flex:1}
.bottom-info .bi-lbl{font-size:0.58rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px}
.bottom-info .bi-val{font-size:0.82rem;font-weight:700;color:#374151}

/* Legal footer */
.legal-footer{text-align:center;padding:14px 32px;border-top:1px solid #e5e7eb;font-size:0.65rem;color:#9ca3af;line-height:1.5}

.print-btn{display:block;margin:20px auto;padding:10px 32px;font-size:0.85rem;font-weight:600;background:#14b8a6;color:#fff;border:none;border-radius:6px;cursor:pointer}
.print-btn:hover{background:#0d9488}
@media print{.print-btn{display:none !important}body{padding:0;background:#fff}.slip{box-shadow:none;border-radius:0}}
</style></head><body>
<div class="slip">
  <!-- Header -->
  <div class="header">
    <div class="logo-block">
      <div class="logo-icon">
        <svg viewBox="0 0 18 14" fill="none"><path d="M1 13L4.5 5L8 9L11.5 5L15 13" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div>
        <div class="brand">Ask<span>Miro</span></div>
        <div class="brand-sub">Miro Partners Ltd &middot; t/a AskMiro Cleaning Services</div>
      </div>
    </div>
    <div class="title-block">
      <h1>PAYSLIP</h1>
      <div class="period">${periodLabel.toUpperCase()}</div>
      <div class="confidential">Private &amp; Confidential</div>
    </div>
  </div>

  <!-- Employee Info -->
  <div class="emp-section">
    <div class="emp-col">
      <div class="lbl">Employee</div>
      <div class="emp-name">${group.worker_name||'—'}</div>
      <div class="emp-role">${group.role||worker.role||'Cleaner'}</div>
      <div class="emp-addr">${worker.address||'No address on file'}</div>
    </div>
    <div class="emp-col">
      <div class="lbl">Employee Ref</div>
      <div class="emp-val">${empRef}</div>
      <div class="emp-sub-lbl">Tax Code</div>
      <div class="emp-sub">${taxCode}</div>
    </div>
    <div class="emp-col">
      <div class="lbl">Pay Date</div>
      <div class="emp-val">${payDate}</div>
      <div class="emp-sub-lbl">NI Number</div>
      <div class="emp-sub">${niNumber}</div>
    </div>
  </div>

  <!-- Employer Bar -->
  <div class="employer-bar">
    <div class="cell"><div class="cell-lbl">Employer</div><div class="cell-val">Miro Partners Ltd</div></div>
    <div class="cell"><div class="cell-lbl">Pay Period</div><div class="cell-val">${periodLabel}</div></div>
    <div class="cell"><div class="cell-lbl">Pay Type</div><div class="cell-val">${payType} &middot; Hourly</div></div>
    <div class="cell"><div class="cell-lbl">Payment Method</div><div class="cell-val">${payMethod}</div></div>
  </div>

  <!-- Earnings & Deductions -->
  <div class="two-col">
    <div class="col-half">
      <h3>Earnings</h3>
      <table class="earn-table">
        <thead><tr><td></td><td class="r" style="font-size:0.65rem;color:#9ca3af;font-weight:600">HRS</td><td class="r" style="font-size:0.65rem;color:#9ca3af;font-weight:600">RATE</td><td class="r" style="font-size:0.65rem;color:#9ca3af;font-weight:600">AMOUNT</td></tr></thead>
        <tbody>
          ${Object.entries(byType).map(([k,v])=>`
            <tr><td>${typeLabel(k)}</td><td class="r">${v.hours.toFixed(2)}</td><td class="r">&pound;${v.rate.toFixed(2)}</td><td class="r">&pound;${v.gross.toFixed(2)}</td></tr>
          `).join('')}
          <tr class="total-line"><td colspan="2"><strong>Gross Pay</strong></td><td class="r">${totalHours.toFixed(2)}</td><td class="r amount">&pound;${grossPay.toFixed(2)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="col-half">
      <h3>Deductions</h3>
      <table class="ded-table">
        <thead><tr><td></td><td class="r" style="font-size:0.65rem;color:#9ca3af;font-weight:600">AMOUNT</td></tr></thead>
        <tbody>
          <tr><td>Income Tax <span class="ded-sub">(${taxCode})</span></td><td class="r">&pound;${tax.toFixed(2)}</td></tr>
          <tr><td>National Insurance <span class="ded-sub">(Cat A)</span></td><td class="r">&pound;${employeeNI.toFixed(2)}</td></tr>
          <tr class="total-line"><td><strong>Total Deductions</strong></td><td class="r amount">&pound;${totalDeductions.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <div class="disclaimer">
        <div class="info-icon">i</div>
        <div>Tax &amp; NI are indicative estimates. Confirm with your payroll accountant before payment.</div>
      </div>
    </div>
  </div>

  <!-- YTD + Pay Breakdown -->
  <div class="ytd-section">
    <div class="ytd-col">
      <h3>Tax Year to Date &mdash; This Employment</h3>
      <div class="ytd-row"><span class="k">Gross Pay</span><span class="v">&pound;${grossPay.toFixed(2)}</span></div>
      <div class="ytd-row"><span class="k">Taxable Pay</span><span class="v">&pound;${Math.max(0,taxable).toFixed(2)}</span></div>
      <div class="ytd-row"><span class="k">Income Tax</span><span class="v">&pound;${tax.toFixed(2)}</span></div>
      <div class="ytd-row"><span class="k">Employee NI</span><span class="v">&pound;${employeeNI.toFixed(2)}</span></div>
      <div class="ytd-row"><span class="k">Total Hours</span><span class="v">${totalHours.toFixed(2)} hrs</span></div>
    </div>
    <div class="ytd-col">
      <h3>Pay Breakdown</h3>
      <div class="ytd-row"><span class="k">Gross Earnings</span><span class="v">&pound;${grossPay.toFixed(2)}</span></div>
      <div class="ytd-row"><span class="k">Total Deductions</span><span class="v">&pound;${totalDeductions.toFixed(2)}</span></div>
      <div style="height:1px;background:#e5e7eb;margin:8px 0"></div>
      <div class="ytd-row net-pay-row"><span class="k">Net Pay</span><span class="v">&pound;${netPay.toFixed(2)}</span></div>
      <div class="ytd-row" style="margin-top:4px"><span class="k" style="font-size:0.78rem">Paid via</span><span class="v" style="font-size:0.78rem">${payMethod}</span></div>
    </div>
  </div>

  <!-- Net Pay Footer -->
  <div class="net-footer">
    <div class="net-footer-left">
      <div class="nf-title">NET PAY THIS PERIOD</div>
      <div class="nf-sub">${periodLabel} &middot; ${payMethod}</div>
    </div>
    <div class="net-footer-right">
      <div class="net-footer-amount"><sup>&pound;</sup>${netPay.toFixed(2)}</div>
      <div class="paye-badge">${payType.toUpperCase()}</div>
    </div>
  </div>

  <!-- Bottom Info -->
  <div class="bottom-info">
    <div class="bi-col"><div class="bi-lbl">NI Number</div><div class="bi-val">${niNumber}</div></div>
    <div class="bi-col" style="text-align:center"><div class="bi-lbl">Tax Code</div><div class="bi-val">${taxCode}</div></div>
    <div class="bi-col" style="text-align:right"><div class="bi-lbl">Employer's NI (Est.)</div><div class="bi-val">&pound;${employerNI.toFixed(2)}</div></div>
  </div>

  <!-- Legal Footer -->
  <div class="legal-footer">
    Miro Partners Ltd &middot; Registered in England &amp; Wales &middot; Trading as AskMiro Cleaning Services &middot; London, UK &middot; info@askmiro.com<br/>
    Tax &amp; NI deductions shown are estimates for reference only. This payslip should be retained as a record of pay. Please contact your payroll administrator with any queries.
  </div>
</div>
<button class="print-btn" onclick="window.print()">&#128424; Print Payslip</button>
</body></html>`)
  w.document.close()
}

/* ─── CSV Export ─── */
function exportCSV(entries){
  const headers=['Date','Worker','Role','Site','Contract','Hours','Rate','Gross Pay','Status','Notes']
  const rows=entries.map(e=>[
    e.entry_date||'',e.worker_name||'',e.role||'',e.site_id||'',e.contract_id||'',
    e.hours_worked||0,e.hourly_rate||0,(e.total_pay||0).toFixed(2),e.status||'',
    (e.notes||'').replace(/"/g,'""')
  ])
  const csv=[headers.join(','),...rows.map(r=>r.map(c=>`"${c}"`).join(','))].join('\n')
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  const month=new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}).replace(' ','_')
  a.href=url;a.download=`AskMiro_Payroll_${month}.csv`;a.click()
  URL.revokeObjectURL(url)
}

/* ─── Main Component ─── */
export default function Payroll(){
  const qc=useQueryClient()
  const [tab,setTab]=useState('Entries')
  const [statusFilter,setStatusFilter]=useState('All')
  const [showLogModal,setShowLogModal]=useState(false)
  const [showWorkerModal,setShowWorkerModal]=useState(false)
  const [editWorker,setEditWorker]=useState(null)
  const [workerEntryFilter,setWorkerEntryFilter]=useState(null)
  const [confirmApprove,setConfirmApprove]=useState(null)

  /* queries */
  const {data,isLoading}=useQuery({queryKey:['payroll'],queryFn:api.payroll,staleTime:60000})
  const pr=data||{}
  const summary=pr.summary||{}
  const entries=Array.isArray(pr.entries)?pr.entries:[]
  const workers=Array.isArray(pr.workers)?pr.workers:[]
  const groups=Array.isArray(pr.payroll_groups)?pr.payroll_groups:[]

  /* mutations */
  const createEntry=useMutation({mutationFn:api.createPayEntry,onSuccess:()=>{qc.invalidateQueries({queryKey:['payroll']});setShowLogModal(false)}})
  const createWorker=useMutation({mutationFn:api.createPayWorker,onSuccess:()=>{qc.invalidateQueries({queryKey:['payroll']});setShowWorkerModal(false);setEditWorker(null)}})
  const updateWorker=useMutation({mutationFn:({id,...body})=>api.updatePayWorker(id,body),onSuccess:()=>{qc.invalidateQueries({queryKey:['payroll']});setShowWorkerModal(false);setEditWorker(null)}})
  const approveMut=useMutation({mutationFn:api.approvePayroll,onSuccess:()=>{qc.invalidateQueries({queryKey:['payroll']});setConfirmApprove(null)}})
  const markPaidMut=useMutation({mutationFn:api.markPayrollPaid,onSuccess:()=>qc.invalidateQueries({queryKey:['payroll']})})

  /* filtered entries */
  const filteredEntries=useMemo(()=>{
    let list=entries
    if(workerEntryFilter)list=list.filter(e=>e.worker_id===workerEntryFilter)
    if(statusFilter!=='All')list=list.filter(e=>(e.status||'').toLowerCase()===statusFilter.toLowerCase())
    return list
  },[entries,statusFilter,workerEntryFilter])

  /* log hours form state */
  const [logForm,setLogForm]=useState({entry_date:new Date().toISOString().slice(0,10),worker_id:'',entry_type:'basic',hours_worked:'',hourly_rate:'',status:'pending',site_id:'',contract_id:'',notes:''})
  const logMult=ENTRY_TYPES.find(t=>t.value===logForm.entry_type)?.mult||1
  const logGross=((parseFloat(logForm.hours_worked)||0)*(parseFloat(logForm.hourly_rate)||0)*logMult).toFixed(2)

  const resetLogForm=useCallback(()=>{
    setLogForm({entry_date:new Date().toISOString().slice(0,10),worker_id:'',entry_type:'basic',hours_worked:'',hourly_rate:'',status:'pending',site_id:'',contract_id:'',notes:''})
  },[])

  const handleWorkerSelect=useCallback((wid)=>{
    const w=workers.find(x=>String(x.id)===String(wid))
    setLogForm(f=>({...f,worker_id:wid,hourly_rate:w?w.default_hourly_rate||'':''}))
  },[workers])

  const handleLogSubmit=useCallback(()=>{
    if(!logForm.worker_id||!logForm.hours_worked)return
    createEntry.mutate({...logForm,hours_worked:parseFloat(logForm.hours_worked),hourly_rate:parseFloat(logForm.hourly_rate)||0,total_pay:parseFloat(logGross)})
  },[logForm,logGross,createEntry])

  /* worker form state */
  const defaultWorkerForm={full_name:'',role:'Cleaner',phone:'',email:'',address:'',date_of_birth:'',start_date:'',ni_number:'',tax_code:'1257L',default_hourly_rate:'',payment_method:'BACS',payroll_type:'PAYE',status:'active'}
  const [workerForm,setWorkerForm]=useState(defaultWorkerForm)

  const openAddWorker=useCallback(()=>{setWorkerForm(defaultWorkerForm);setEditWorker(null);setShowWorkerModal(true)},[])
  const openEditWorker=useCallback((w)=>{
    setWorkerForm({full_name:w.full_name||'',role:w.role||'Cleaner',phone:w.phone||'',email:w.email||'',address:w.address||'',date_of_birth:w.date_of_birth||'',start_date:w.start_date||'',ni_number:w.ni_number||'',tax_code:w.tax_code||'1257L',default_hourly_rate:w.default_hourly_rate||'',payment_method:w.payment_method||'BACS',payroll_type:w.payroll_type||'PAYE',status:w.status||'active'})
    setEditWorker(w);setShowWorkerModal(true)
  },[])

  const handleWorkerSubmit=useCallback(()=>{
    if(!workerForm.full_name||!workerForm.default_hourly_rate)return
    const body={...workerForm,default_hourly_rate:parseFloat(workerForm.default_hourly_rate)||0}
    if(editWorker)updateWorker.mutate({id:editWorker.id,...body})
    else createWorker.mutate(body)
  },[workerForm,editWorker,createWorker,updateWorker])

  const handleViewEntries=useCallback((w)=>{
    setWorkerEntryFilter(w.id);setStatusFilter('All');setTab('Entries')
  },[])

  /* active workers count */
  const activeWorkers=useMemo(()=>workers.filter(w=>(w.status||'active')==='active').length,[workers])

  return(
    <div style={{padding:'28px 32px',maxWidth:1200,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-.02em',margin:0}}>Payroll</h1>
          <p style={{fontSize:'0.875rem',color:'var(--text-3)',marginTop:4}}>Staff hours, pay runs & payslips</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--border)',paddingBottom:0}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>{setTab(t);if(t!=='Entries')setWorkerEntryFilter(null)}} style={{
            padding:'8px 18px',fontSize:'0.8rem',fontWeight:tab===t?700:500,
            border:'none',borderBottom:tab===t?'2px solid var(--teal)':'2px solid transparent',
            background:'transparent',color:tab===t?'var(--text-1)':'var(--text-muted)',cursor:'pointer',
            transition:'all .15s'
          }}>{t}</button>
        ))}
      </div>

      {isLoading&&<div style={{textAlign:'center',padding:60}}><Spinner/></div>}

      {/* ════════════════ Tab 1: Entries ════════════════ */}
      {tab==='Entries'&&!isLoading&&(
        <>
          {/* Status filter pills */}
          <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
            {ENTRY_STATUSES.map(s=>(
              <button key={s} onClick={()=>setStatusFilter(s)} style={{
                padding:'5px 16px',fontSize:'0.75rem',fontWeight:600,borderRadius:999,
                border:statusFilter===s?'none':'1px solid var(--border)',cursor:'pointer',
                background:statusFilter===s?'var(--teal)':'transparent',
                color:statusFilter===s?'#fff':'var(--text-muted)',transition:'all .15s'
              }}>{s}</button>
            ))}
            {workerEntryFilter&&(
              <button onClick={()=>setWorkerEntryFilter(null)} style={{padding:'5px 14px',fontSize:'0.72rem',fontWeight:600,borderRadius:999,border:'1px solid rgba(220,38,38,0.3)',background:'rgba(220,38,38,0.08)',color:'#DC2626',cursor:'pointer'}}>
                Clear worker filter ✕
              </button>
            )}
          </div>

          {/* Summary stats */}
          <div style={{display:'flex',gap:16,marginBottom:20,flexWrap:'wrap'}}>
            <KPI label="Total Hours" value={`${summary.total_hours||0}h`}/>
            <KPI label="Total Pay" value={gbp(summary.total_gross||0)} color="var(--teal)"/>
            <KPI label="Pending" value={summary.pending_count||0} color={(summary.pending_count||0)>0?'#D97706':undefined}/>
          </div>

          {/* Actions */}
          <div style={{display:'flex',gap:10,marginBottom:16}}>
            <Btn onClick={()=>{resetLogForm();setShowLogModal(true)}}>+ Add Hours</Btn>
            <Btn outline onClick={()=>exportCSV(filteredEntries)}>Export CSV</Btn>
          </div>

          {/* Entries table */}
          {filteredEntries.length===0?(
            <div style={{padding:60,textAlign:'center',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)'}}>
              <div style={{fontSize:'2rem',marginBottom:8}}>📋</div>
              <div style={{fontSize:'0.9rem',color:'var(--text-muted)',marginBottom:12}}>No entries found for this filter.</div>
              <Btn onClick={()=>{resetLogForm();setShowLogModal(true)}}>Log First Hours</Btn>
            </div>
          ):(
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
                <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                  <TH>Date</TH><TH>Worker</TH><TH>Type</TH><TH>Site</TH><TH right>Hours</TH><TH right>Rate</TH><TH right>Gross Pay</TH><TH>Status</TH><TH>Notes</TH>
                </tr></thead>
                <tbody>
                  {filteredEntries.map((e,i)=>(
                    <tr key={e.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                      <TD>{formatDate(e.entry_date)}</TD>
                      <TD style={{fontWeight:600,color:'var(--text-1)'}}>{e.worker_name||'—'}</TD>
                      <TD>{typePill(e.entry_type)}</TD>
                      <TD>{e.site_id||'—'}</TD>
                      <TD right style={{fontWeight:600}}>{e.hours_worked!=null?e.hours_worked.toFixed(1):'—'}</TD>
                      <TD right>{e.hourly_rate!=null?`£${Number(e.hourly_rate).toFixed(2)}/hr`:'—'}</TD>
                      <TD right style={{fontWeight:700,color:'#059669'}}>{gbp(e.total_pay)}</TD>
                      <TD>{statusPill(e.status)}</TD>
                      <TD style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.notes||'—'}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ════════════════ Tab 2: Workers ════════════════ */}
      {tab==='Workers'&&!isLoading&&(
        <>
          <div style={{display:'flex',gap:16,marginBottom:20,flexWrap:'wrap'}}>
            <KPI label="Active Workers" value={activeWorkers}/>
            <KPI label="Total Hours Logged" value={`${workers.reduce((s,w)=>s+(w.total_hours||0),0).toFixed(0)}h`}/>
            <KPI label="Total Labour Cost" value={gbp(workers.reduce((s,w)=>s+(w.total_earned||0),0))} color="var(--teal)"/>
          </div>

          <div style={{marginBottom:16}}>
            <Btn onClick={openAddWorker}>+ Add Worker</Btn>
          </div>

          {workers.length===0?(
            <div style={{padding:60,textAlign:'center',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)'}}>
              <div style={{fontSize:'2rem',marginBottom:8}}>👷</div>
              <div style={{fontSize:'0.9rem',color:'var(--text-muted)',marginBottom:12}}>No workers on file yet.</div>
              <Btn onClick={openAddWorker}>Add First Worker</Btn>
            </div>
          ):(
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
                <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                  <TH>Name</TH><TH>Role</TH><TH>Phone</TH><TH>Email</TH><TH right>Rate</TH><TH right>Total Hours</TH><TH right>Total Earned</TH><TH>Status</TH><TH>Actions</TH>
                </tr></thead>
                <tbody>
                  {workers.map((w,i)=>(
                    <tr key={w.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                      <TD style={{fontWeight:600,color:'var(--text-1)'}}>{w.full_name||'—'}</TD>
                      <TD>{w.role||'—'}</TD>
                      <TD>{w.phone?<a href={`tel:${w.phone}`} style={{color:'var(--teal)',textDecoration:'none'}}>{w.phone}</a>:'—'}</TD>
                      <TD>{w.email||'—'}</TD>
                      <TD right style={{fontWeight:600}}>{w.default_hourly_rate!=null?`£${Number(w.default_hourly_rate).toFixed(2)}/h`:'—'}</TD>
                      <TD right>{w.total_hours!=null?w.total_hours.toFixed(1):'0'}</TD>
                      <TD right style={{fontWeight:700,color:'#059669'}}>{gbp(w.total_earned||0)}</TD>
                      <TD>{statusPill(w.status||'active')}</TD>
                      <TD>
                        <div style={{display:'flex',gap:6}}>
                          <Btn small outline onClick={()=>openEditWorker(w)}>Edit</Btn>
                          <Btn small outline color="#3B82F6" onClick={()=>handleViewEntries(w)}>View Entries</Btn>
                        </div>
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ════════════════ Tab 3: Payroll ════════════════ */}
      {tab==='Payroll'&&!isLoading&&(
        <>
          <div style={{display:'flex',gap:16,marginBottom:20,flexWrap:'wrap'}}>
            <KPI label="Total Gross Pay" value={gbp(summary.total_gross||0)} color="#059669"/>
            <KPI label="Pending Approval" value={summary.pending_count||0} color={(summary.pending_count||0)>0?'#DC2626':undefined}/>
            <KPI label="Approved / Unpaid" value={summary.approved_count||0} color={(summary.approved_count||0)>0?'#0DBDAD':undefined}/>
            <KPI label="Payroll Groups" value={groups.length}/>
          </div>

          {(summary.pending_count||0)>0&&(
            <div style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.2)',borderRadius:8,padding:'12px 18px',marginBottom:18,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:'1.1rem'}}>⚠️</span>
              <span style={{fontSize:'0.82rem',color:'#DC2626',fontWeight:600}}>
                {summary.pending_count} payroll group(s) pending approval. Approve to push labour costs to Finance & P&L.
              </span>
            </div>
          )}

          {groups.length===0?(
            <div style={{padding:60,textAlign:'center',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)'}}>
              <div style={{fontSize:'2rem',marginBottom:8}}>📊</div>
              <div style={{fontSize:'0.9rem',color:'var(--text-muted)'}}>No payroll groups yet. Log hours and they will appear here.</div>
            </div>
          ):(
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:850}}>
                <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                  <TH>Period</TH><TH>Worker</TH><TH>Role</TH><TH right>Total Hours</TH><TH right>Gross Pay</TH><TH>Status</TH><TH>Actions</TH>
                </tr></thead>
                <tbody>
                  {groups.map((g,i)=>{
                    const st=(g.status||'').toLowerCase()
                    return(
                      <tr key={`${g.worker_id}-${g.period}-${i}`} style={{borderBottom:'1px solid var(--border)'}}>
                        <TD style={{fontWeight:600}}>{g.period||'—'}</TD>
                        <TD style={{color:'var(--text-1)',fontWeight:600}}>{g.worker_name||'—'}</TD>
                        <TD>{g.role||'—'}</TD>
                        <TD right style={{fontWeight:600}}>{g.total_hours!=null?g.total_hours.toFixed(1):'0'}</TD>
                        <TD right style={{fontWeight:700,color:'#059669'}}>{gbp(g.gross_pay)}</TD>
                        <TD>{statusPill(g.status)}</TD>
                        <TD>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                            {st==='pending'&&(
                              <Btn small color="#059669" onClick={()=>setConfirmApprove(g)}>Approve</Btn>
                            )}
                            {st==='approved'&&(
                              <Btn small color="#0DBDAD" onClick={()=>markPaidMut.mutate({worker_id:g.worker_id,period:g.period})}>Mark Paid</Btn>
                            )}
                            {st==='paid'&&(
                              <span style={{fontSize:'0.78rem',fontWeight:600,color:'#059669'}}>✓ Paid</span>
                            )}
                            <Btn small outline color="#6B7280" onClick={()=>openPayslip(g,entries,workers)}>📋 Payslip</Btn>
                          </div>
                        </TD>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ════════════════ Tab 4: Payslips ════════════════ */}
      {tab==='Payslips'&&!isLoading&&(
        <>
          {groups.length===0?(
            <div style={{padding:60,textAlign:'center',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)'}}>
              <div style={{fontSize:'2rem',marginBottom:8}}>🧾</div>
              <div style={{fontSize:'0.9rem',color:'var(--text-muted)'}}>No payslips to display. Run payroll first.</div>
            </div>
          ):(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16}}>
              {groups.map((g,i)=>(
                <div key={`${g.worker_id}-${g.period}-${i}`} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'22px 24px',display:'flex',flexDirection:'column',gap:10}}>
                  <div>
                    <div style={{fontSize:'0.92rem',fontWeight:700,color:'var(--text-1)'}}>{g.worker_name||'—'}</div>
                    <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:2}}>{g.role||'—'} &middot; {g.period||'—'}</div>
                  </div>
                  <div style={{fontSize:'1.8rem',fontWeight:800,color:'#059669',letterSpacing:'-.02em'}}>{gbp(g.gross_pay)}</div>
                  <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{g.total_hours!=null?g.total_hours.toFixed(1):'0'} hours &middot; {g.entry_count||0} entries</div>
                  <div style={{display:'flex',gap:8,marginTop:6}}>
                    {statusPill(g.status)}
                  </div>
                  <Btn onClick={()=>openPayslip(g,entries,workers)} style={{marginTop:8,width:'100%',textAlign:'center'}}>View & Print</Btn>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ════════════════ Log Hours Modal ════════════════ */}
      {showLogModal&&(
        <Modal title="Log Hours" onClose={()=>setShowLogModal(false)} width={540}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
            <Field label="Date" required>
              <input type="date" value={logForm.entry_date} onChange={e=>setLogForm(f=>({...f,entry_date:e.target.value}))} style={inputStyle}/>
            </Field>
            <Field label="Worker" required>
              <select value={logForm.worker_id} onChange={e=>handleWorkerSelect(e.target.value)} style={selectStyle}>
                <option value="">Select worker…</option>
                {workers.map(w=>(
                  <option key={w.id} value={w.id}>{w.full_name} (£{Number(w.default_hourly_rate||0).toFixed(2)}/h)</option>
                ))}
              </select>
            </Field>
            <Field label="Entry Type" required>
              <select value={logForm.entry_type} onChange={e=>setLogForm(f=>({...f,entry_type:e.target.value}))} style={selectStyle}>
                {ENTRY_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Hours Worked" required>
              <input type="number" step="0.5" min="0" max="24" placeholder="0" value={logForm.hours_worked} onChange={e=>setLogForm(f=>({...f,hours_worked:e.target.value}))} style={inputStyle}/>
            </Field>
            <Field label="Hourly Rate (£)">
              <input type="number" step="0.01" min="0" placeholder="0.00" value={logForm.hourly_rate} onChange={e=>setLogForm(f=>({...f,hourly_rate:e.target.value}))} style={inputStyle}/>
            </Field>
            <Field label="Gross Pay (auto)">
              <input readOnly value={`£${logGross}`} style={{...inputStyle,background:'var(--bg-base)',opacity:0.7,fontWeight:700,color:'#059669'}}/>
            </Field>
            <Field label="Status">
              <select value={logForm.status} onChange={e=>setLogForm(f=>({...f,status:e.target.value}))} style={selectStyle}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
            </Field>
            <Field label="Site ID (opt.)">
              <input value={logForm.site_id} onChange={e=>setLogForm(f=>({...f,site_id:e.target.value}))} placeholder="Optional" style={inputStyle}/>
            </Field>
            <Field label="Contract ID (opt.)">
              <input value={logForm.contract_id} onChange={e=>setLogForm(f=>({...f,contract_id:e.target.value}))} placeholder="Optional" style={inputStyle}/>
            </Field>
          </div>
          <Field label="Notes (opt.)">
            <textarea rows={2} value={logForm.notes} onChange={e=>setLogForm(f=>({...f,notes:e.target.value}))} placeholder="Optional notes…" style={{...inputStyle,resize:'vertical'}}/>
          </Field>
          <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:18}}>
            <Btn outline color="var(--text-muted)" onClick={()=>setShowLogModal(false)}>Cancel</Btn>
            <Btn onClick={handleLogSubmit} disabled={!logForm.worker_id||!logForm.hours_worked||createEntry.isPending}>
              {createEntry.isPending?'Saving…':'Log Hours'}
            </Btn>
          </div>
        </Modal>
      )}

      {/* ════════════════ Add/Edit Worker Modal ════════════════ */}
      {showWorkerModal&&(
        <Modal title={editWorker?'Edit Worker':'Add Worker'} onClose={()=>{setShowWorkerModal(false);setEditWorker(null)}} width={600}>
          {/* Personal */}
          <div style={{fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--teal)',marginBottom:10,marginTop:4}}>Personal Details</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
            <Field label="Full Name" required>
              <input value={workerForm.full_name} onChange={e=>setWorkerForm(f=>({...f,full_name:e.target.value}))} placeholder="Full name" style={inputStyle}/>
            </Field>
            <Field label="Role" required>
              <select value={workerForm.role} onChange={e=>setWorkerForm(f=>({...f,role:e.target.value}))} style={selectStyle}>
                {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Phone">
              <input value={workerForm.phone} onChange={e=>setWorkerForm(f=>({...f,phone:e.target.value}))} placeholder="07XXX XXX XXX" style={inputStyle}/>
            </Field>
            <Field label="Email">
              <input type="email" value={workerForm.email} onChange={e=>setWorkerForm(f=>({...f,email:e.target.value}))} placeholder="email@example.com" style={inputStyle}/>
            </Field>
            <Field label="Address">
              <input value={workerForm.address} onChange={e=>setWorkerForm(f=>({...f,address:e.target.value}))} placeholder="Address" style={inputStyle}/>
            </Field>
            <Field label="Date of Birth">
              <input type="date" value={workerForm.date_of_birth} onChange={e=>setWorkerForm(f=>({...f,date_of_birth:e.target.value}))} style={inputStyle}/>
            </Field>
            <Field label="Start Date">
              <input type="date" value={workerForm.start_date} onChange={e=>setWorkerForm(f=>({...f,start_date:e.target.value}))} style={inputStyle}/>
            </Field>
          </div>

          {/* Payroll */}
          <div style={{fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--teal)',marginBottom:10,marginTop:18}}>Payroll Details</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
            <Field label="NI Number">
              <input value={workerForm.ni_number} onChange={e=>setWorkerForm(f=>({...f,ni_number:e.target.value}))} placeholder="AB 12 34 56 C" style={{...inputStyle,fontFamily:'monospace'}}/>
            </Field>
            <Field label="Tax Code">
              <input value={workerForm.tax_code} onChange={e=>setWorkerForm(f=>({...f,tax_code:e.target.value}))} placeholder="1257L" style={inputStyle}/>
            </Field>
            <Field label="Default Hourly Rate (£)" required>
              <input type="number" step="0.01" min="0" value={workerForm.default_hourly_rate} onChange={e=>setWorkerForm(f=>({...f,default_hourly_rate:e.target.value}))} placeholder="12.50" style={inputStyle}/>
            </Field>
            <Field label="Payment Method">
              <select value={workerForm.payment_method} onChange={e=>setWorkerForm(f=>({...f,payment_method:e.target.value}))} style={selectStyle}>
                {PAY_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Payroll Type">
              <select value={workerForm.payroll_type} onChange={e=>setWorkerForm(f=>({...f,payroll_type:e.target.value}))} style={selectStyle}>
                {PAY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={workerForm.status} onChange={e=>setWorkerForm(f=>({...f,status:e.target.value}))} style={selectStyle}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>

          <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:22}}>
            <Btn outline color="var(--text-muted)" onClick={()=>{setShowWorkerModal(false);setEditWorker(null)}}>Cancel</Btn>
            <Btn onClick={handleWorkerSubmit} disabled={!workerForm.full_name||!workerForm.default_hourly_rate||(editWorker?updateWorker.isPending:createWorker.isPending)}>
              {(editWorker?updateWorker.isPending:createWorker.isPending)?'Saving…':(editWorker?'Save Changes':'Add Worker')}
            </Btn>
          </div>
        </Modal>
      )}

      {/* ════════════════ Approve Confirmation Modal ════════════════ */}
      {confirmApprove&&(
        <Modal title="Approve Payroll" onClose={()=>setConfirmApprove(null)} width={440}>
          <div style={{marginBottom:18}}>
            <p style={{fontSize:'0.88rem',color:'var(--text-2)',lineHeight:1.6}}>
              Approve payroll for <strong>{confirmApprove.worker_name}</strong> ({confirmApprove.period})?
            </p>
            <div style={{background:'var(--bg-base)',borderRadius:8,padding:'14px 18px',marginTop:12,display:'flex',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross Pay</div>
                <div style={{fontSize:'1.3rem',fontWeight:800,color:'#059669'}}>{gbp(confirmApprove.gross_pay)}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Hours</div>
                <div style={{fontSize:'1.3rem',fontWeight:800}}>{confirmApprove.total_hours?.toFixed(1)||0}h</div>
              </div>
            </div>
            <p style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:10}}>
              This will push labour costs to Finance & P&L. This action cannot be undone.
            </p>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
            <Btn outline color="var(--text-muted)" onClick={()=>setConfirmApprove(null)}>Cancel</Btn>
            <Btn color="#059669" onClick={()=>approveMut.mutate({worker_id:confirmApprove.worker_id,period:confirmApprove.period})} disabled={approveMut.isPending}>
              {approveMut.isPending?'Approving…':'Confirm Approve'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
