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
function openPayslip(group,entries){
  const w=window.open('','_blank','width=800,height=1000')
  if(!w)return
  const workerEntries=(entries||[]).filter(e=>e.worker_id===group.worker_id&&e.status!=='void')
  const grossPay=group.gross_pay||0
  const taxable=Math.max(0,grossPay-(1048/12))
  const tax=Math.round(taxable*0.2*100)/100
  const niThreshold=797/12
  const niable=Math.max(0,grossPay-niThreshold)
  const ni=Math.round(niable*0.12*100)/100
  const netPay=Math.round((grossPay-tax-ni)*100)/100

  const byType={}
  workerEntries.forEach(e=>{
    const k=e.entry_type||'basic'
    if(!byType[k])byType[k]={hours:0,gross:0}
    byType[k].hours+=(e.hours_worked||0)
    byType[k].gross+=(e.total_pay||0)
  })

  const typeLabel=t=>ENTRY_TYPES.find(x=>x.value===t)?.label||t

  w.document.write(`<!DOCTYPE html><html><head><title>Payslip - ${group.worker_name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;padding:40px}
.slip{max-width:700px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
.header{background:#1a1a2e;color:#fff;padding:28px 32px;position:relative}
.header::after{content:'';position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#0DBDAD,#0A9688)}
.header h1{font-size:1.3rem;font-weight:800;letter-spacing:-.01em}
.header p{font-size:0.8rem;opacity:0.7;margin-top:4px}
.body{padding:28px 32px}
.row{display:flex;gap:32px;margin-bottom:20px}
.col{flex:1}
.label{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:2px}
.val{font-size:0.88rem;font-weight:600;color:#222}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{text-align:left;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;color:#888;padding:8px 12px;border-bottom:2px solid #eee}
th.r,td.r{text-align:right}
td{padding:8px 12px;font-size:0.85rem;color:#333;border-bottom:1px solid #f0f0f0}
.total-row td{font-weight:700;border-top:2px solid #ddd;border-bottom:none}
.net{background:#f0fdf4;padding:16px 20px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin:20px 0}
.net-label{font-size:0.85rem;font-weight:700;color:#333}
.net-val{font-size:1.6rem;font-weight:800;color:#059669}
.footer{text-align:center;padding:16px;font-size:0.7rem;color:#aaa;border-top:1px solid #eee}
.print-btn{display:block;margin:20px auto;padding:10px 32px;font-size:0.85rem;font-weight:600;background:#0DBDAD;color:#fff;border:none;border-radius:6px;cursor:pointer}
@media print{.print-btn{display:none !important}body{padding:0;background:#fff}.slip{box-shadow:none}}
</style></head><body>
<div class="slip">
  <div class="header">
    <h1>AskMiro Cleaning Services</h1>
    <p>Payslip &mdash; ${group.period||'Current Period'}</p>
  </div>
  <div class="body">
    <div class="row">
      <div class="col">
        <div class="label">Employee</div>
        <div class="val">${group.worker_name||'—'}</div>
        <div style="font-size:0.78rem;color:#666;margin-top:2px">${group.role||'—'}</div>
      </div>
      <div class="col">
        <div class="label">NI Number</div>
        <div class="val" style="font-family:monospace">AB 12 34 56 C</div>
      </div>
      <div class="col">
        <div class="label">Tax Code</div>
        <div class="val">1257L</div>
      </div>
    </div>
    <div class="row">
      <div class="col">
        <div class="label">Employer</div>
        <div class="val">Miro Partners Ltd</div>
        <div style="font-size:0.78rem;color:#666;margin-top:2px">t/a AskMiro Cleaning Services</div>
      </div>
      <div class="col">
        <div class="label">Period</div>
        <div class="val">${group.period||'—'}</div>
      </div>
      <div class="col">
        <div class="label">Pay Date</div>
        <div class="val">${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
      </div>
    </div>

    <h3 style="font-size:0.85rem;font-weight:700;margin-top:24px;margin-bottom:4px">Earnings</h3>
    <table>
      <thead><tr><th>Type</th><th class="r">Hours</th><th class="r">Amount</th></tr></thead>
      <tbody>
        ${Object.entries(byType).map(([k,v])=>`<tr><td>${typeLabel(k)}</td><td class="r">${v.hours.toFixed(1)}</td><td class="r">&pound;${v.gross.toFixed(2)}</td></tr>`).join('')}
        <tr class="total-row"><td>Total Gross</td><td class="r">${(group.total_hours||0).toFixed(1)}</td><td class="r">&pound;${grossPay.toFixed(2)}</td></tr>
      </tbody>
    </table>

    <h3 style="font-size:0.85rem;font-weight:700;margin-top:24px;margin-bottom:4px">Estimated Deductions</h3>
    <table>
      <thead><tr><th>Deduction</th><th class="r">Amount</th></tr></thead>
      <tbody>
        <tr><td>Income Tax (est. 20%)</td><td class="r">&pound;${tax.toFixed(2)}</td></tr>
        <tr><td>National Insurance (est. 12%)</td><td class="r">&pound;${ni.toFixed(2)}</td></tr>
        <tr class="total-row"><td>Total Deductions</td><td class="r">&pound;${(tax+ni).toFixed(2)}</td></tr>
      </tbody>
    </table>

    <div class="net">
      <span class="net-label">Net Pay</span>
      <span class="net-val">&pound;${netPay.toFixed(2)}</span>
    </div>
  </div>
  <div class="footer">This is a computer-generated payslip. Miro Partners Ltd &middot; t/a AskMiro Cleaning Services</div>
</div>
<button class="print-btn" onclick="window.print()">Print Payslip</button>
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
  const entries=pr.entries||[]
  const workers=pr.workers||[]
  const groups=pr.payroll_groups||[]

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
                            <Btn small outline color="#6B7280" onClick={()=>openPayslip(g,entries)}>📋 Payslip</Btn>
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
                  <Btn onClick={()=>openPayslip(g,entries)} style={{marginTop:8,width:'100%',textAlign:'center'}}>View & Print</Btn>
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
