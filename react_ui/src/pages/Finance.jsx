import {useState,useCallback,useMemo} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {formatGBP,formatDate} from '../utils'
import Spinner from '../components/Spinner'

/* ── constants ────────────────────────────────────────────────────── */
const TABS=['Overview','Transactions','Invoices','Expenses','Profitability','Tax & HMRC','Assistant']
const INV_STATUS={
  draft:   {bg:'#1e293b',color:'#94a3b8',label:'Draft'},
  issued:  {bg:'rgba(59,130,246,0.12)',color:'#60a5fa',label:'Issued'},
  sent:    {bg:'rgba(59,130,246,0.12)',color:'#60a5fa',label:'Sent'},
  paid:    {bg:'rgba(16,185,129,0.12)',color:'#34d399',label:'Paid'},
  overdue: {bg:'rgba(239,68,68,0.12)',color:'#f87171',label:'Overdue'},
  partial: {bg:'rgba(245,158,11,0.12)',color:'#fbbf24',label:'Partial'},
  void:    {bg:'rgba(100,116,139,0.1)',color:'#64748b',label:'Void'},
}
const TXN_TYPE={
  income:  {bg:'rgba(16,185,129,0.12)',color:'#34d399',label:'Income'},
  expense: {bg:'rgba(239,68,68,0.12)',color:'#f87171',label:'Expense'},
  journal: {bg:'rgba(139,92,246,0.12)',color:'#a78bfa',label:'Journal'},
  transfer:{bg:'rgba(59,130,246,0.12)',color:'#60a5fa',label:'Transfer'},
}
const EXPENSE_CATS=['Labour','Subcontractors','Supplies & Consumables','Travel & Transport','Equipment','Admin & Software','Marketing','Insurance','Training & Compliance','One-off Job Costs','Miscellaneous']
const PAY_METHODS=['BACS','Cheque','Card','Cash','Other']
const RAG={green:{bg:'rgba(16,185,129,0.12)',color:'#34d399'},amber:{bg:'rgba(245,158,11,0.12)',color:'#fbbf24'},red:{bg:'rgba(239,68,68,0.12)',color:'#f87171'}}
const INV_SUBTABS=['All','Draft','Issued','Paid','Overdue','Void']

const curMonth=()=>{const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')}
const fmtCur=v=>{const n=Number(v)||0;return (n<0?'-':'')+'\u00a3'+Math.abs(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}
const pct=(a,b)=>b?((a/b)*100).toFixed(1)+'%':'--'
const ragColor=m=>m>=40?'green':m>=25?'amber':'red'
const momPct=(cur,prev)=>{if(!prev)return null;const d=((cur-prev)/prev)*100;return d>0?`+${d.toFixed(1)}%`:`${d.toFixed(1)}%`}

/* ── shared sub-components ────────────────────────────────────────── */
const Pill=({style:s,children,...p})=><span style={{fontSize:'0.7rem',fontWeight:700,padding:'3px 10px',borderRadius:20,whiteSpace:'nowrap',...s}} {...p}>{children}</span>
const StatusPill=({status})=>{const s=INV_STATUS[status]||INV_STATUS.draft;return <Pill style={{background:s.bg,color:s.color}}>{s.label}</Pill>}
const TypePill=({type})=>{const s=TXN_TYPE[type]||TXN_TYPE.journal;return <Pill style={{background:s.bg,color:s.color}}>{s.label}</Pill>}
const RagPill=({level,label})=>{const r=RAG[level]||RAG.amber;return <Pill style={{background:r.bg,color:r.color}}>{label||level}</Pill>}

const Btn=({children,variant,small,disabled,...p})=>{
  const bg=variant==='danger'?'rgba(239,68,68,0.15)':variant==='success'?'rgba(16,185,129,0.15)':variant==='ghost'?'transparent':'var(--teal)'
  const col=variant==='danger'?'#f87171':variant==='success'?'#34d399':variant==='ghost'?'var(--text-2)':'#fff'
  const border=variant==='ghost'?'1px solid var(--border)':'none'
  return <button disabled={disabled} style={{padding:small?'5px 12px':'8px 18px',fontSize:small?'0.72rem':'0.8rem',fontWeight:700,borderRadius:'var(--r-sm)',background:bg,color:col,border,cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.5:1,whiteSpace:'nowrap'}} {...p}>{children}</button>
}

const TH=({children,sortKey,sort,setSort})=>{
  const active=sort?.key===sortKey
  return <th onClick={sortKey?()=>setSort(s=>s?.key===sortKey?{key:sortKey,dir:s.dir==='asc'?'desc':'asc'}:{key:sortKey,dir:'asc'}):undefined} style={{padding:'10px 14px',textAlign:'left',fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',cursor:sortKey?'pointer':'default',userSelect:'none',whiteSpace:'nowrap'}}>{children}{active?(sort.dir==='asc'?' \u25B2':' \u25BC'):''}</th>
}

const Modal=({open,onClose,title,children,width})=>{
  if(!open)return null
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',width:width||560,maxHeight:'85vh',overflow:'auto',padding:'28px 32px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h2 style={{margin:0,fontSize:'1.15rem',fontWeight:800}}>{title}</h2>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'1.2rem',cursor:'pointer'}}>&times;</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const Field=({label,children,style:s})=>(
  <div style={{marginBottom:14,...s}}>
    <label style={{display:'block',fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>{label}</label>
    {children}
  </div>
)

const inp={width:'100%',padding:'8px 12px',fontSize:'0.85rem',background:'var(--bg-raised)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',color:'var(--text-1)',outline:'none'}
const sel={...inp,appearance:'auto'}

function useSorter(data,sort){
  return useMemo(()=>{
    if(!sort?.key||!data)return data||[]
    const arr=[...data]
    arr.sort((a,b)=>{
      let av=a[sort.key],bv=b[sort.key]
      if(typeof av==='string')av=av.toLowerCase()
      if(typeof bv==='string')bv=bv.toLowerCase()
      if(av<bv)return sort.dir==='asc'?-1:1
      if(av>bv)return sort.dir==='asc'?1:-1
      return 0
    })
    return arr
  },[data,sort])
}

/* ── KPI card ─────────────────────────────────────────────────────── */
function KPI({label,value,sub,color,alert}){
  return(
    <div style={{flex:1,minWidth:145,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
      <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6,fontFamily:"'JetBrains Mono',monospace"}}>{label}</div>
      <div style={{fontSize:'1.35rem',fontWeight:800,color:alert?'#f87171':color||'var(--text-1)',letterSpacing:'-.02em'}}>{value}</div>
      {sub&&<div style={{fontSize:'0.72rem',color:typeof sub==='string'&&sub.startsWith('-')?'#f87171':typeof sub==='string'&&sub.startsWith('+')?'#34d399':'var(--text-muted)',marginTop:4}}>{sub}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                    */
/* ═══════════════════════════════════════════════════════════════════ */
export default function Finance(){
  const qc=useQueryClient()
  const [tab,setTab]=useState('Overview')
  const [modal,setModal]=useState(null)

  /* filters */
  const [invSubTab,setInvSubTab]=useState('All')
  const [invMonth,setInvMonth]=useState('')
  const [txnType,setTxnType]=useState('')
  const [txnCat,setTxnCat]=useState('')
  const [txnMonth,setTxnMonth]=useState('')
  const [expCat,setExpCat]=useState('')
  const [expMonth,setExpMonth]=useState('')
  const [profMonth,setProfMonth]=useState('')

  /* sorts */
  const [invSort,setInvSort]=useState(null)
  const [txnSort,setTxnSort]=useState(null)
  const [expSort,setExpSort]=useState(null)
  const [profSort,setProfSort]=useState(null)

  /* chat state */
  const [chatMsgs,setChatMsgs]=useState([{role:'assistant',text:'Hello! I can help you understand your financial data. Ask me about invoices, expenses, profitability, or cash flow.'}])
  const [chatInput,setChatInput]=useState('')

  /* queries */
  const {data:overview,isLoading:ovLoading}=useQuery({queryKey:['financeOverview'],queryFn:api.financeOverview,staleTime:60000})
  const invStatusQ=invSubTab==='All'?'':invSubTab.toLowerCase()
  const {data:invoicesData}=useQuery({queryKey:['financeInvoices',invStatusQ,invMonth],queryFn:()=>api.financeInvoices(invStatusQ,invMonth),staleTime:60000})
  const {data:txnData}=useQuery({queryKey:['financeTxn',txnType,txnCat,txnMonth],queryFn:()=>api.financeTransactions(txnType,txnCat,txnMonth),staleTime:60000})
  const {data:expData}=useQuery({queryKey:['financeExp',expCat,expMonth],queryFn:()=>api.financeExpenses(expCat,expMonth),staleTime:60000})
  const {data:profData}=useQuery({queryKey:['financeProf',profMonth],queryFn:()=>api.financeProfitability(profMonth),staleTime:60000})

  const ov=overview||{}
  const invoices=invoicesData?.invoices||invoicesData||[]
  const transactions=txnData?.transactions||txnData||[]
  const expenses=expData?.expenses||expData||[]
  const profSnapshots=profData?.snapshots||profData||[]
  const profSummary=profData?.summary||{}
  const recurring=expData?.recurring_templates||[]
  const categoryBreakdown=expData?.by_category||[]

  /* mutations */
  const invalidate=()=>{qc.invalidateQueries({queryKey:['financeOverview']});qc.invalidateQueries({queryKey:['financeInvoices']});qc.invalidateQueries({queryKey:['financeTxn']});qc.invalidateQueries({queryKey:['financeExp']});qc.invalidateQueries({queryKey:['financeProf']})}

  const createInvM=useMutation({mutationFn:api.createInvoice,onSuccess:()=>{invalidate();setModal(null)}})
  const markSentM=useMutation({mutationFn:id=>api.markInvoiceSent(id),onSuccess:invalidate})
  const voidInvM=useMutation({mutationFn:id=>api.voidInvoice(id),onSuccess:invalidate})
  const recordPayM=useMutation({mutationFn:({id,body})=>api.recordPayment(id,body),onSuccess:()=>{invalidate();setModal(null)}})
  const createExpM=useMutation({mutationFn:api.createExpense,onSuccess:()=>{invalidate();setModal(null)}})
  const createTxnM=useMutation({mutationFn:api.createTransaction,onSuccess:()=>{invalidate();setModal(null)}})
  const voidTxnM=useMutation({mutationFn:id=>api.voidTransaction(id),onSuccess:invalidate})
  const recalcM=useMutation({mutationFn:m=>api.recalculateSnapshots(m),onSuccess:invalidate})
  const genRecurM=useMutation({mutationFn:m=>api.generateRecurring(m),onSuccess:invalidate})

  /* sorted data */
  const sortedInv=useSorter(invoices,invSort)
  const sortedTxn=useSorter(transactions,txnSort)
  const sortedExp=useSorter(expenses,expSort)
  const sortedProf=useSorter(profSnapshots,profSort)

  /* invoice counts for sub-tabs */
  const allInv=invoicesData?.invoices||invoicesData||[]
  const invCounts=useMemo(()=>{
    const c={All:0,Draft:0,Issued:0,Paid:0,Overdue:0,Void:0}
    ;(Array.isArray(allInv)?allInv:[]).forEach(i=>{
      c.All++
      const s=(i.status||'').toLowerCase()
      if(s==='draft')c.Draft++
      else if(s==='issued'||s==='sent')c.Issued++
      else if(s==='paid')c.Paid++
      else if(s==='overdue')c.Overdue++
      else if(s==='void')c.Void++
    })
    return c
  },[allInv])

  /* overview derived */
  const overdueInvoices=useMemo(()=>(ov.overdue_invoices||[]).slice(0,3),[ov])
  const recentInvoices=useMemo(()=>(ov.recent_invoices||[]).slice(0,5),[ov])
  const recentExpenses=useMemo(()=>(ov.recent_expenses||[]).slice(0,5),[ov])

  /* txn summary */
  const txnSummary=useMemo(()=>{
    let tin=0,tout=0
    ;(transactions||[]).forEach(t=>{
      if(t.voided)return
      const a=Number(t.amount_gross)||0
      if(t.type==='income')tin+=a; else if(t.type==='expense')tout+=a
    })
    return {in:tin,out:tout,net:tin-tout}
  },[transactions])

  /* chat handler */
  const sendChat=useCallback(()=>{
    if(!chatInput.trim())return
    const q=chatInput.trim()
    setChatMsgs(p=>[...p,{role:'user',text:q}])
    setChatInput('')
    setTimeout(()=>{
      setChatMsgs(p=>[...p,{role:'assistant',text:`I've noted your question about "${q}". The AI assistant integration is being connected to your finance data. In the meantime, you can explore the Overview, Invoices, Expenses, and Profitability tabs for detailed financial insights.`}])
    },600)
  },[chatInput])

  /* ── Tab: Overview ──────────────────────────────────────────────── */
  const renderOverview=()=>(
    <>
      {/* KPI bar */}
      <div style={{display:'flex',gap:14,marginBottom:20,flexWrap:'wrap'}}>
        <KPI label="Invoiced Revenue" value={fmtCur(ov.total_invoiced)} sub={momPct(ov.total_invoiced,ov.prev_total_invoiced)} color="var(--teal)"/>
        <KPI label="Cash Received" value={fmtCur(ov.cash_received)} color="#34d399"/>
        <KPI label="Gross Margin" value={ov.gross_margin!=null?ov.gross_margin.toFixed(1)+'%':'--'} color={RAG[ragColor(ov.gross_margin||0)].color}/>
        <KPI label="Total Expenses" value={fmtCur(ov.total_expenses)} sub={momPct(ov.total_expenses,ov.prev_total_expenses)} color="#f87171"/>
        <KPI label="Outstanding" value={fmtCur(ov.outstanding)}/>
        <KPI label="Overdue" value={fmtCur(ov.overdue_total)} alert={ov.overdue_total>0}/>
      </div>

      {/* All-time summary bar */}
      {(ov.total_revenue_alltime>0||ov.total_invoices_count>0)&&(
        <div style={{display:'flex',gap:14,marginBottom:14,flexWrap:'wrap'}}>
          <KPI label="All-Time Revenue" value={fmtCur(ov.total_revenue_alltime)} sub={`${ov.total_invoices_count||0} invoices total`} color="var(--teal)"/>
          <KPI label="All-Time Collected" value={fmtCur(ov.total_paid_alltime)} color="#34d399"/>
          <KPI label="YTD Revenue" value={fmtCur(ov.ytd_revenue)} color="var(--teal)"/>
          <KPI label="YTD Expenses" value={fmtCur(ov.ytd_expenses)} color="#f87171"/>
          <KPI label="YTD Net" value={fmtCur((ov.ytd_revenue||0)-(ov.ytd_expenses||0))} color={(ov.ytd_revenue||0)-(ov.ytd_expenses||0)>=0?'#34d399':'#f87171'}/>
        </div>
      )}

      {/* Alert banners */}
      {ov.overdue_total>0&&(
        <div style={{background:'rgba(239,68,68,0.08)',border:'1.5px solid rgba(239,68,68,0.3)',borderRadius:'var(--r-sm)',padding:'12px 18px',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontWeight:800,color:'#f87171',fontSize:'1.1rem'}}>!</span>
          <span style={{fontSize:'0.82rem',color:'#fca5a5'}}>{fmtCur(ov.overdue_total)} overdue across {ov.overdue_count||overdueInvoices.length} invoice(s) &mdash; action required</span>
        </div>
      )}
      {ov.gross_margin!=null&&ov.gross_margin<25&&(
        <div style={{background:'rgba(245,158,11,0.08)',border:'1.5px solid rgba(245,158,11,0.3)',borderRadius:'var(--r-sm)',padding:'12px 18px',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontWeight:800,color:'#fbbf24',fontSize:'1.1rem'}}>!</span>
          <span style={{fontSize:'0.82rem',color:'#fcd34d'}}>Gross margin at {ov.gross_margin.toFixed(1)}% &mdash; below 25% threshold</span>
        </div>
      )}

      {/* Overdue action queue */}
      {overdueInvoices.length>0&&(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 22px',marginBottom:20}}>
          <div style={{fontSize:'0.78rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.06em',color:'#f87171',marginBottom:12}}>Overdue &mdash; Action Required</div>
          {overdueInvoices.map((inv,i)=>(
            <div key={inv.id||i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:i<overdueInvoices.length-1?'1px solid var(--border)':'none'}}>
              <div>
                <span style={{fontWeight:700,fontSize:'0.85rem'}}>{inv.invoice_number||inv.id}</span>
                <span style={{color:'var(--text-2)',fontSize:'0.8rem',marginLeft:10}}>{inv.customer_name}</span>
                <span style={{color:'var(--text-muted)',fontSize:'0.75rem',marginLeft:10}}>Due {formatDate(inv.due_date)}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontWeight:800,color:'#f87171'}}>{fmtCur(inv.balance||inv.total)}</span>
                <Btn small variant="success" onClick={()=>setModal({type:'payment',invoice:inv})}>Record Payment</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Insight strip */}
      <div style={{display:'flex',gap:14,marginBottom:20,flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:200,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'16px 20px'}}>
          <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:6}}>Expected Cash (30d)</div>
          <div style={{fontSize:'1.1rem',fontWeight:800,color:'var(--teal)'}}>{fmtCur(ov.expected_cash_30d||ov.outstanding)}</div>
        </div>
        <div style={{flex:1,minWidth:200,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'16px 20px'}}>
          <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:6}}>Strongest Contract</div>
          <div style={{fontSize:'0.9rem',fontWeight:700}}>{ov.strongest_contract||'--'}</div>
          {ov.strongest_margin!=null&&<div style={{fontSize:'0.72rem',color:'#34d399'}}>{ov.strongest_margin.toFixed(1)}% margin</div>}
        </div>
        <div style={{flex:1,minWidth:200,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'16px 20px'}}>
          <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:6}}>Weakest Contract</div>
          <div style={{fontSize:'0.9rem',fontWeight:700}}>{ov.weakest_contract||'--'}</div>
          {ov.weakest_margin!=null&&<div style={{fontSize:'0.72rem',color:'#f87171'}}>{ov.weakest_margin.toFixed(1)}% margin</div>}
        </div>
      </div>

      {/* Recent tables side by side */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginBottom:20}}>
        {/* Recent invoices */}
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',fontSize:'0.78rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-muted)'}}>Recent Invoices</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Invoice','Customer','Total','Status'].map(h=><th key={h} style={{padding:'8px 14px',textAlign:'left',fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)'}}>{h}</th>)}
            </tr></thead>
            <tbody>{recentInvoices.map((inv,i)=>(
              <tr key={inv.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'10px 14px',fontSize:'0.82rem',fontWeight:600}}>{inv.invoice_number||inv.id}</td>
                <td style={{padding:'10px 14px',fontSize:'0.8rem',color:'var(--text-2)'}}>{inv.customer_name||'--'}</td>
                <td style={{padding:'10px 14px',fontSize:'0.82rem',fontWeight:700}}>{fmtCur(inv.total)}</td>
                <td style={{padding:'10px 14px'}}><StatusPill status={inv.status}/></td>
              </tr>
            ))}</tbody>
          </table>
          {recentInvoices.length===0&&<div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:'0.8rem'}}>No recent invoices</div>}
        </div>

        {/* Recent expenses */}
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',fontSize:'0.78rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-muted)'}}>Recent Expenses</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Date','Category','Amount','Supplier'].map(h=><th key={h} style={{padding:'8px 14px',textAlign:'left',fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)'}}>{h}</th>)}
            </tr></thead>
            <tbody>{recentExpenses.map((exp,i)=>(
              <tr key={exp.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'10px 14px',fontSize:'0.8rem',color:'var(--text-2)'}}>{formatDate(exp.date)}</td>
                <td style={{padding:'10px 14px'}}><Pill style={{background:'rgba(139,92,246,0.12)',color:'#a78bfa'}}>{exp.category||'--'}</Pill></td>
                <td style={{padding:'10px 14px',fontSize:'0.82rem',fontWeight:700,color:'#f87171'}}>{fmtCur(exp.amount_gross)}</td>
                <td style={{padding:'10px 14px',fontSize:'0.8rem',color:'var(--text-2)'}}>{exp.supplier||'--'}</td>
              </tr>
            ))}</tbody>
          </table>
          {recentExpenses.length===0&&<div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:'0.8rem'}}>No recent expenses</div>}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{display:'flex',gap:10}}>
        <Btn onClick={()=>setModal({type:'invoice'})}>Create Invoice</Btn>
        <Btn variant="ghost" onClick={()=>setModal({type:'expense'})}>Add Expense</Btn>
        <Btn variant="ghost" onClick={()=>setModal({type:'payment'})}>Record Payment</Btn>
      </div>
    </>
  )

  /* ── Tab: Transactions ─────────────────────────────────────────── */
  const renderTransactions=()=>(
    <>
      <div style={{display:'flex',gap:12,marginBottom:18,flexWrap:'wrap',alignItems:'center'}}>
        <select style={{...sel,width:160}} value={txnType} onChange={e=>setTxnType(e.target.value)}>
          <option value="">All Types</option>
          {Object.entries(TXN_TYPE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <select style={{...sel,width:200}} value={txnCat} onChange={e=>setTxnCat(e.target.value)}>
          <option value="">All Categories</option>
          {EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input type="month" style={{...inp,width:170}} value={txnMonth} onChange={e=>setTxnMonth(e.target.value)}/>
        <div style={{flex:1}}/>
        <Btn onClick={()=>setModal({type:'transaction'})}>Add Transaction</Btn>
      </div>

      {/* Summary bar */}
      <div style={{display:'flex',gap:14,marginBottom:18}}>
        <div style={{flex:1,background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:'var(--r-lg)',padding:'14px 18px',textAlign:'center'}}>
          <div style={{fontSize:'0.68rem',color:'#34d399',textTransform:'uppercase',marginBottom:4}}>Total In</div>
          <div style={{fontSize:'1.2rem',fontWeight:800,color:'#34d399'}}>{fmtCur(txnSummary.in)}</div>
        </div>
        <div style={{flex:1,background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'var(--r-lg)',padding:'14px 18px',textAlign:'center'}}>
          <div style={{fontSize:'0.68rem',color:'#f87171',textTransform:'uppercase',marginBottom:4}}>Total Out</div>
          <div style={{fontSize:'1.2rem',fontWeight:800,color:'#f87171'}}>{fmtCur(txnSummary.out)}</div>
        </div>
        <div style={{flex:1,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'14px 18px',textAlign:'center'}}>
          <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',marginBottom:4}}>Net</div>
          <div style={{fontSize:'1.2rem',fontWeight:800,color:txnSummary.net>=0?'#34d399':'#f87171'}}>{fmtCur(txnSummary.net)}</div>
        </div>
      </div>

      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
            <TH sortKey="date" sort={txnSort} setSort={setTxnSort}>Date</TH>
            <TH>Type</TH>
            <TH sortKey="category" sort={txnSort} setSort={setTxnSort}>Category</TH>
            <TH>Description</TH>
            <TH>Party</TH>
            <TH sortKey="amount_gross" sort={txnSort} setSort={setTxnSort}>Amount</TH>
            <TH>Ref</TH>
            <TH>Actions</TH>
          </tr></thead>
          <tbody>{sortedTxn.map((t,i)=>{
            const voided=t.voided||t.status==='void'
            return(
              <tr key={t.id||i} style={{borderBottom:'1px solid var(--border)',opacity:voided?0.45:1,textDecoration:voided?'line-through':'none'}}>
                <td style={{padding:'10px 14px',fontSize:'0.8rem'}}>{formatDate(t.date)}</td>
                <td style={{padding:'10px 14px'}}><TypePill type={t.type}/></td>
                <td style={{padding:'10px 14px',fontSize:'0.8rem',color:'var(--text-2)'}}>{t.category||'--'}</td>
                <td style={{padding:'10px 14px',fontSize:'0.8rem',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.description||'--'}</td>
                <td style={{padding:'10px 14px',fontSize:'0.8rem',color:'var(--text-2)'}}>{t.party||'--'}</td>
                <td style={{padding:'10px 14px',fontSize:'0.85rem',fontWeight:700,color:t.type==='income'?'#34d399':'#f87171'}}>{fmtCur(t.amount_gross)}</td>
                <td style={{padding:'10px 14px',fontSize:'0.75rem',color:'var(--text-muted)'}}>{t.reference||'--'}</td>
                <td style={{padding:'10px 14px'}}>{!voided&&<Btn small variant="danger" onClick={()=>voidTxnM.mutate(t.id)}>Void</Btn>}</td>
              </tr>
            )
          })}</tbody>
        </table>
        {sortedTxn.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>No transactions found</div>}
      </div>
    </>
  )

  /* ── Tab: Invoices ─────────────────────────────────────────────── */
  const renderInvoices=()=>{
    const invTotal=sortedInv.reduce((s,i)=>s+(Number(i.total)||0),0)
    const invBalance=sortedInv.reduce((s,i)=>s+(Number(i.balance)||Number(i.total)||0),0)
    return(
      <>
        {/* Sub-tabs */}
        <div style={{display:'flex',gap:4,marginBottom:18,borderBottom:'1px solid var(--border)'}}>
          {INV_SUBTABS.map(st=>(
            <button key={st} onClick={()=>setInvSubTab(st)} style={{padding:'10px 16px',fontSize:'0.78rem',fontWeight:invSubTab===st?700:500,color:invSubTab===st?'var(--teal)':'var(--text-muted)',background:'none',border:'none',borderBottom:invSubTab===st?'2px solid var(--teal)':'2px solid transparent',cursor:'pointer',marginBottom:-1}}>
              {st}{invCounts[st]>0?` (${invCounts[st]})`:''}
            </button>
          ))}
        </div>

        <div style={{display:'flex',gap:12,marginBottom:18,alignItems:'center'}}>
          <input type="month" style={{...inp,width:170}} value={invMonth} onChange={e=>setInvMonth(e.target.value)}/>
          <div style={{flex:1}}/>
          <div style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>Invoiced: <strong style={{color:'var(--text-1)'}}>{fmtCur(invTotal)}</strong> &nbsp;|&nbsp; Balance: <strong style={{color:invBalance>0?'#f87171':'var(--text-1)'}}>{fmtCur(invBalance)}</strong></div>
          <Btn onClick={()=>setModal({type:'invoice'})}>Create Invoice</Btn>
        </div>

        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
              <TH sortKey="invoice_number" sort={invSort} setSort={setInvSort}>Number</TH>
              <TH sortKey="customer_name" sort={invSort} setSort={setInvSort}>Customer</TH>
              <TH>Site</TH>
              <TH sortKey="invoice_date" sort={invSort} setSort={setInvSort}>Date</TH>
              <TH sortKey="due_date" sort={invSort} setSort={setInvSort}>Due</TH>
              <TH sortKey="total" sort={invSort} setSort={setInvSort}>Total</TH>
              <TH sortKey="balance" sort={invSort} setSort={setInvSort}>Balance</TH>
              <TH>Status</TH>
              <TH>Actions</TH>
            </tr></thead>
            <tbody>{sortedInv.map((inv,i)=>{
              const st=(inv.status||'').toLowerCase()
              const dueDate=inv.due_date?new Date(inv.due_date):null
              const now=new Date()
              const daysUntil=dueDate?Math.ceil((dueDate-now)/(1000*60*60*24)):999
              const dueColor=st==='overdue'||daysUntil<0?'#f87171':daysUntil<7?'#fbbf24':'var(--text-2)'
              const isVoid=st==='void'
              return(
                <tr key={inv.id||i} style={{borderBottom:'1px solid var(--border)',opacity:isVoid?0.45:1}}>
                  <td style={{padding:'10px 14px',fontWeight:700,fontSize:'0.85rem'}}>{inv.invoice_number||inv.id}</td>
                  <td style={{padding:'10px 14px',fontSize:'0.82rem'}}>{inv.customer_name||'--'}</td>
                  <td style={{padding:'10px 14px',fontSize:'0.78rem',color:'var(--text-muted)'}}>{inv.site_name||inv.site_id||'--'}</td>
                  <td style={{padding:'10px 14px',fontSize:'0.8rem'}}>{formatDate(inv.invoice_date)}</td>
                  <td style={{padding:'10px 14px',fontSize:'0.8rem',color:dueColor,fontWeight:daysUntil<7?700:400}}>{formatDate(inv.due_date)}{daysUntil<0&&!isVoid&&st!=='paid'?` (${Math.abs(daysUntil)}d late)`:daysUntil>=0&&daysUntil<7&&!isVoid&&st!=='paid'?` (${daysUntil}d)`:''}</td>
                  <td style={{padding:'10px 14px',fontWeight:700,fontSize:'0.85rem'}}>{fmtCur(inv.total)}</td>
                  <td style={{padding:'10px 14px',fontWeight:700,color:(Number(inv.balance)||0)>0?'#f87171':'var(--text-1)'}}>{fmtCur(inv.balance!=null?inv.balance:inv.total)}</td>
                  <td style={{padding:'10px 14px'}}><StatusPill status={st}/></td>
                  <td style={{padding:'10px 14px'}}>
                    <div style={{display:'flex',gap:6}}>
                      {st==='draft'&&<Btn small variant="ghost" onClick={()=>markSentM.mutate(inv.id)}>Mark Sent</Btn>}
                      {st!=='paid'&&st!=='void'&&<Btn small variant="success" onClick={()=>setModal({type:'payment',invoice:inv})}>Payment</Btn>}
                      {st!=='void'&&st!=='paid'&&<Btn small variant="danger" onClick={()=>voidInvM.mutate(inv.id)}>Void</Btn>}
                    </div>
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
          {sortedInv.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>No invoices found</div>}
        </div>
      </>
    )
  }

  /* ── Tab: Expenses ─────────────────────────────────────────────── */
  const renderExpenses=()=>(
    <>
      <div style={{display:'flex',gap:12,marginBottom:18,flexWrap:'wrap',alignItems:'center'}}>
        <select style={{...sel,width:220}} value={expCat} onChange={e=>setExpCat(e.target.value)}>
          <option value="">All Categories</option>
          {EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input type="month" style={{...inp,width:170}} value={expMonth} onChange={e=>setExpMonth(e.target.value)}/>
        <div style={{flex:1}}/>
        <Btn onClick={()=>setModal({type:'expense'})}>Add Expense</Btn>
      </div>

      {/* Recurring panel */}
      {recurring.length>0&&(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 22px',marginBottom:18}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:'0.78rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-muted)'}}>Recurring Expenses ({recurring.length})</div>
            <Btn small variant="ghost" onClick={()=>genRecurM.mutate(expMonth||curMonth())} disabled={genRecurM.isPending}>Generate for {expMonth||curMonth()}</Btn>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {recurring.map((r,i)=>(
              <div key={r.id||i} style={{background:'var(--bg-raised)',borderRadius:'var(--r-sm)',padding:'10px 14px',fontSize:'0.8rem'}}>
                <div style={{fontWeight:700}}>{r.description||r.category}</div>
                <div style={{color:'var(--text-muted)',fontSize:'0.72rem'}}>{r.supplier||'--'} &middot; {fmtCur(r.amount_gross)}/mo</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {categoryBreakdown.length>0&&(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 22px',marginBottom:18}}>
          <div style={{fontSize:'0.78rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-muted)',marginBottom:12}}>By Category</div>
          {categoryBreakdown.map((c,i)=>{
            const totalExp=categoryBreakdown.reduce((s,x)=>s+(Number(x.total)||0),0)
            const pctVal=totalExp>0?((Number(c.total)||0)/totalExp*100):0
            return(
              <div key={c.category||i} style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                <div style={{width:160,fontSize:'0.78rem',color:'var(--text-2)',flexShrink:0}}>{c.category}</div>
                <div style={{flex:1,background:'var(--bg-raised)',borderRadius:4,height:18,overflow:'hidden'}}>
                  <div style={{width:`${pctVal}%`,height:'100%',background:'linear-gradient(90deg,#f87171,#ef4444)',borderRadius:4,transition:'width 0.5s ease'}}/>
                </div>
                <div style={{width:90,textAlign:'right',fontSize:'0.8rem',fontWeight:700,color:'#f87171'}}>{fmtCur(c.total)}</div>
                <div style={{width:50,textAlign:'right',fontSize:'0.72rem',color:'var(--text-muted)'}}>{pctVal.toFixed(1)}%</div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
            <TH sortKey="date" sort={expSort} setSort={setExpSort}>Date</TH>
            <TH sortKey="category" sort={expSort} setSort={setExpSort}>Category</TH>
            <TH>Description</TH>
            <TH sortKey="supplier" sort={expSort} setSort={setExpSort}>Supplier</TH>
            <TH>Site</TH>
            <TH sortKey="amount_gross" sort={expSort} setSort={setExpSort}>Amount</TH>
            <TH>Recurring</TH>
          </tr></thead>
          <tbody>{sortedExp.map((exp,i)=>(
            <tr key={exp.id||i} style={{borderBottom:'1px solid var(--border)'}}>
              <td style={{padding:'10px 14px',fontSize:'0.8rem'}}>{formatDate(exp.date)}</td>
              <td style={{padding:'10px 14px'}}><Pill style={{background:'rgba(139,92,246,0.12)',color:'#a78bfa'}}>{exp.category||'--'}</Pill></td>
              <td style={{padding:'10px 14px',fontSize:'0.82rem',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{exp.description||'--'}</td>
              <td style={{padding:'10px 14px',fontSize:'0.8rem',color:'var(--text-2)'}}>{exp.supplier||'--'}</td>
              <td style={{padding:'10px 14px',fontSize:'0.78rem',color:'var(--text-muted)'}}>{exp.site_name||exp.site_id||'--'}</td>
              <td style={{padding:'10px 14px',fontWeight:700,color:'#f87171'}}>{fmtCur(exp.amount_gross)}</td>
              <td style={{padding:'10px 14px',fontSize:'0.78rem'}}>{exp.recurring?<Pill style={{background:'rgba(59,130,246,0.12)',color:'#60a5fa'}}>Yes</Pill>:<span style={{color:'var(--text-muted)'}}>No</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        {sortedExp.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>No expenses found</div>}
      </div>
    </>
  )

  /* ── Tab: Profitability ────────────────────────────────────────── */
  const renderProfitability=()=>(
    <>
      <div style={{display:'flex',gap:14,marginBottom:18,flexWrap:'wrap'}}>
        <KPI label="Portfolio Revenue" value={fmtCur(profSummary.total_revenue)} color="var(--teal)"/>
        <KPI label="Portfolio Margin" value={profSummary.avg_margin!=null?profSummary.avg_margin.toFixed(1)+'%':'--'} color={RAG[ragColor(profSummary.avg_margin||0)].color}/>
        <KPI label="Risk Contracts" value={profSummary.risk_count||0} alert={(profSummary.risk_count||0)>0}/>
        <KPI label="Missing Data" value={profSummary.missing_data||0} color="var(--text-muted)"/>
      </div>

      <div style={{display:'flex',gap:12,marginBottom:18,alignItems:'center'}}>
        <input type="month" style={{...inp,width:170}} value={profMonth} onChange={e=>setProfMonth(e.target.value)}/>
        <Btn variant="ghost" onClick={()=>recalcM.mutate(profMonth)} disabled={recalcM.isPending}>{recalcM.isPending?'Recalculating...':'Recalculate Snapshots'}</Btn>
        <div style={{flex:1}}/>
      </div>

      {/* Threshold legend */}
      <div style={{display:'flex',gap:16,marginBottom:18,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'14px 20px',alignItems:'center'}}>
        <span style={{fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)'}}>Thresholds:</span>
        <span style={{fontSize:'0.75rem'}}><span style={{display:'inline-block',width:10,height:10,borderRadius:3,background:'#34d399',marginRight:5,verticalAlign:'middle'}}/>Green &ge; 40%</span>
        <span style={{fontSize:'0.75rem'}}><span style={{display:'inline-block',width:10,height:10,borderRadius:3,background:'#fbbf24',marginRight:5,verticalAlign:'middle'}}/>Amber 25-39%</span>
        <span style={{fontSize:'0.75rem'}}><span style={{display:'inline-block',width:10,height:10,borderRadius:3,background:'#f87171',marginRight:5,verticalAlign:'middle'}}/>Red &lt; 25%</span>
      </div>

      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
            <TH sortKey="site_name" sort={profSort} setSort={setProfSort}>Site</TH>
            <TH sortKey="month" sort={profSort} setSort={setProfSort}>Month</TH>
            <TH sortKey="revenue" sort={profSort} setSort={setProfSort}>Revenue</TH>
            <TH sortKey="cost" sort={profSort} setSort={setProfSort}>Cost</TH>
            <TH sortKey="gross_profit" sort={profSort} setSort={setProfSort}>Gross Profit</TH>
            <TH sortKey="margin" sort={profSort} setSort={setProfSort}>Margin</TH>
            <TH>Risk</TH>
            <TH>Recommendation</TH>
          </tr></thead>
          <tbody>{sortedProf.map((s,i)=>{
            const margin=Number(s.margin)||0
            const rag=ragColor(margin)
            return(
              <tr key={s.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'10px 14px',fontWeight:700,fontSize:'0.85rem'}}>{s.site_name||s.site_id||'--'}</td>
                <td style={{padding:'10px 14px',fontSize:'0.8rem',color:'var(--text-2)'}}>{s.month||'--'}</td>
                <td style={{padding:'10px 14px',fontSize:'0.82rem',fontWeight:600,color:'var(--teal)'}}>{fmtCur(s.revenue)}</td>
                <td style={{padding:'10px 14px',fontSize:'0.82rem',color:'#f87171'}}>{fmtCur(s.cost)}</td>
                <td style={{padding:'10px 14px',fontWeight:700}}>{fmtCur(s.gross_profit)}</td>
                <td style={{padding:'10px 14px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:60,height:8,background:'var(--bg-raised)',borderRadius:4,overflow:'hidden'}}>
                      <div style={{width:`${Math.min(margin,100)}%`,height:'100%',background:RAG[rag].color,borderRadius:4}}/>
                    </div>
                    <span style={{fontSize:'0.8rem',fontWeight:700,color:RAG[rag].color}}>{margin.toFixed(1)}%</span>
                  </div>
                </td>
                <td style={{padding:'10px 14px'}}><RagPill level={rag} label={s.risk_status||rag}/></td>
                <td style={{padding:'10px 14px',fontSize:'0.78rem',color:'var(--text-2)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.recommendation||'--'}</td>
              </tr>
            )
          })}</tbody>
        </table>
        {sortedProf.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>No profitability data. Run Recalculate Snapshots to generate.</div>}
      </div>
    </>
  )

  /* ── Tab: Tax & HMRC ──────────────────────────────────────────────── */
  const {data:vatData}=useQuery({queryKey:['vat-return'],queryFn:()=>api.vatReturn(),staleTime:60000,enabled:tab==='Tax & HMRC'})
  const {data:taxData}=useQuery({queryKey:['tax-summary'],queryFn:()=>api.taxSummary(),staleTime:60000,enabled:tab==='Tax & HMRC'})
  const {data:cashData}=useQuery({queryKey:['cash-forecast'],queryFn:()=>api.cashForecast(),staleTime:60000,enabled:tab==='Tax & HMRC'})

  const renderTaxHMRC=()=>{
    const vat=vatData||{}
    const tax=taxData||{}
    const cash=cashData||{}
    const healthColor=cash.health==='good'?'#34d399':cash.health==='warning'?'#fbbf24':'#f87171'
    return(
      <div style={{display:'flex',flexDirection:'column',gap:20}}>
        {/* Cash Flow Forecast */}
        <div>
          <div style={{fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',marginBottom:10}}>Cash Flow Forecast</div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:12}}>
            {[
              {l:'Cash Position',v:fmtCur(cash.current_cash_position),c:healthColor},
              {l:'30-Day Forecast',v:fmtCur(cash.forecast_30d),c:cash.forecast_30d>=0?'#34d399':'#f87171'},
              {l:'60-Day Forecast',v:fmtCur(cash.forecast_60d),c:cash.forecast_60d>=0?'#34d399':'#f87171'},
              {l:'90-Day Forecast',v:fmtCur(cash.forecast_90d),c:cash.forecast_90d>=0?'#34d399':'#f87171'},
              {l:'Avg Collection',v:(cash.avg_collection_days||30)+'d'},
              {l:'Monthly Burn',v:fmtCur(cash.avg_monthly_expense)},
            ].map((k,i)=>(
              <div key={i} style={{flex:1,minWidth:130,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'14px 16px'}}>
                <div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{k.l}</div>
                <div style={{fontSize:'1.15rem',fontWeight:800,color:k.c||'var(--text-1)'}}>{k.v||'—'}</div>
              </div>
            ))}
          </div>
          {/* Overdue Ageing */}
          {cash.overdue_ageing&&cash.overdue_ageing.total>0&&(
            <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:'var(--r-sm)',padding:'14px 18px',marginBottom:8}}>
              <div style={{fontWeight:700,fontSize:'0.85rem',color:'#f87171',marginBottom:6}}>⚠ Overdue Ageing: {fmtCur(cash.overdue_ageing.total)}</div>
              <div style={{display:'flex',gap:20,fontSize:'0.78rem',color:'var(--text-2)'}}>
                <span>0-30d: {fmtCur(cash.overdue_ageing['0_30_days'])}</span>
                <span>31-60d: {fmtCur(cash.overdue_ageing['31_60_days'])}</span>
                <span>60+d: <strong style={{color:'#f87171'}}>{fmtCur(cash.overdue_ageing['60_plus_days'])}</strong></span>
              </div>
              {cash.late_payment_interest&&cash.late_payment_interest.daily_interest_accruing>0&&(
                <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:4}}>Late payment interest accruing: {fmtCur(cash.late_payment_interest.daily_interest_accruing)}/day ({cash.late_payment_interest.rate_annual_pct}% p.a. per Late Payment Act)</div>
              )}
            </div>
          )}
          {/* Recommendations */}
          {cash.recommendations&&(
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {cash.recommendations.filter(Boolean).map((r,i)=>(
                <div key={i} style={{fontSize:'0.78rem',color:'var(--text-2)',padding:'6px 12px',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)'}}>💡 {r}</div>
              ))}
            </div>
          )}
        </div>

        {/* VAT Return (MTD Ready) */}
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)'}}>VAT Return (MTD Ready)</div>
            <Pill style={{background:'rgba(59,130,246,0.1)',color:'#60a5fa'}}>Not Yet Registered — Books Ready</Pill>
          </div>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',overflow:'hidden'}}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',fontSize:'0.82rem',fontWeight:600}}>{vat.quarter||'Current Quarter'}</div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <tbody>
                {[
                  {box:'Box 1',label:'VAT due on sales (output VAT)',value:fmtCur(vat.box1_output_vat)},
                  {box:'Box 2',label:'VAT due on EU acquisitions',value:fmtCur(vat.box2_eu_acquisitions||0)},
                  {box:'Box 3',label:'Total VAT due',value:fmtCur(vat.box3_total_vat_due),bold:true},
                  {box:'Box 4',label:'VAT reclaimed on purchases (input VAT)',value:fmtCur(vat.box4_input_vat)},
                  {box:'Box 5',label:vat.box5_direction==='pay'?'Net VAT to pay HMRC':'Net VAT to reclaim',value:fmtCur(Math.abs(vat.box5_net_vat||0)),bold:true,color:vat.box5_direction==='pay'?'#f87171':'#34d399'},
                  {box:'Box 6',label:'Total sales exc. VAT',value:fmtCur(vat.box6_net_sales)},
                  {box:'Box 7',label:'Total purchases exc. VAT',value:fmtCur(vat.box7_net_purchases)},
                  {box:'Box 8',label:'Total EU supplies exc. VAT',value:fmtCur(0)},
                  {box:'Box 9',label:'Total EU acquisitions exc. VAT',value:fmtCur(0)},
                ].map((r,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 18px',fontSize:'0.72rem',fontWeight:700,color:'var(--teal)',width:60}}>{r.box}</td>
                    <td style={{padding:'10px 14px',fontSize:'0.82rem',color:'var(--text-2)'}}>{r.label}</td>
                    <td style={{padding:'10px 18px',fontSize:'0.88rem',fontWeight:r.bold?800:600,color:r.color||'var(--text-1)',textAlign:'right'}}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vat.payment_deadline&&(
              <div style={{padding:'12px 18px',fontSize:'0.75rem',color:'var(--text-muted)',borderTop:'1px solid var(--border)'}}>
                📅 Filing deadline: <strong>{vat.payment_deadline}</strong> (1 month + 7 days after quarter end)
              </div>
            )}
          </div>
        </div>

        {/* Corporation Tax / Annual Summary */}
        <div>
          <div style={{fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',marginBottom:10}}>Tax Year Summary ({tax.tax_year||'Current'})</div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:12}}>
            {[
              {l:'Turnover',v:fmtCur(tax.turnover)},
              {l:'Allowable Deductions',v:fmtCur(tax.total_deductions)},
              {l:'Taxable Profit',v:fmtCur(tax.taxable_profit),c:tax.taxable_profit>0?'#34d399':'#f87171'},
              {l:'Corp Tax Rate',v:(tax.corporation_tax_rate||19)+'%'},
              {l:'Est. Corp Tax',v:fmtCur(tax.corporation_tax_liability),c:'#f87171'},
              {l:'Employer NI Est.',v:fmtCur(tax.employer_ni_estimate)},
            ].map((k,i)=>(
              <div key={i} style={{flex:1,minWidth:130,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'14px 16px'}}>
                <div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{k.l}</div>
                <div style={{fontSize:'1.15rem',fontWeight:800,color:k.c||'var(--text-1)'}}>{k.v||'—'}</div>
              </div>
            ))}
          </div>
          {/* Deductions by HMRC category */}
          {tax.deductions_by_category&&tax.deductions_by_category.length>0&&(
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',overflow:'hidden',marginBottom:12}}>
              <div style={{padding:'12px 18px',fontSize:'0.78rem',fontWeight:700,borderBottom:'1px solid var(--border)'}}>Allowable Deductions by HMRC Category</div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                  {['Category','HMRC Classification','Count','Amount'].map(h=><th key={h} style={{padding:'8px 14px',textAlign:h==='Amount'?'right':'left',fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)'}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {tax.deductions_by_category.map((d,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'8px 14px',fontWeight:600,fontSize:'0.82rem'}}>{d.category}</td>
                      <td style={{padding:'8px 14px',fontSize:'0.78rem',color:'var(--text-muted)'}}>{d.hmrc_classification}</td>
                      <td style={{padding:'8px 14px',fontSize:'0.82rem'}}>{d.count}</td>
                      <td style={{padding:'8px 14px',fontSize:'0.88rem',fontWeight:700,color:'#f87171',textAlign:'right'}}>{fmtCur(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* IR35 Warning */}
          {tax.ir35_warning&&(
            <div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'var(--r-sm)',padding:'14px 18px',marginBottom:8}}>
              <div style={{fontWeight:700,fontSize:'0.85rem',color:'#fbbf24',marginBottom:4}}>⚠ IR35 Review Required</div>
              <div style={{fontSize:'0.78rem',color:'var(--text-2)'}}>{tax.ir35_note}</div>
            </div>
          )}
          {/* HMRC Notes */}
          {tax.notes&&(
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'14px 18px'}}>
              <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',marginBottom:8}}>HMRC Compliance Notes</div>
              {tax.notes.map((n,i)=><div key={i} style={{fontSize:'0.78rem',color:'var(--text-2)',padding:'4px 0',borderBottom:i<tax.notes.length-1?'1px solid var(--border)':'none'}}>📋 {n}</div>)}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── Tab: Assistant ─────────────────────────────────────────────── */
  const renderAssistant=()=>(
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 200px)',maxWidth:700,margin:'0 auto',width:'100%'}}>
      <div style={{flex:1,overflowY:'auto',padding:'10px 0',display:'flex',flexDirection:'column',gap:12}}>
        {chatMsgs.map((m,i)=>(
          <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'80%',padding:'12px 18px',borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',background:m.role==='user'?'var(--teal)':'var(--bg-surface)',color:m.role==='user'?'#fff':'var(--text-1)',border:m.role==='user'?'none':'1px solid var(--border)',fontSize:'0.88rem',lineHeight:1.5}}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Suggested questions */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
        {['What are my overdue invoices?','Show me this month\'s P&L','Which contracts have the lowest margin?','What is my cash position?'].map(q=>(
          <button key={q} onClick={()=>{setChatInput(q);}} style={{padding:'6px 14px',fontSize:'0.75rem',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:20,color:'var(--text-2)',cursor:'pointer'}}>{q}</button>
        ))}
      </div>

      <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
        <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}}} placeholder="Ask about invoices, expenses, cash flow..." rows={2} style={{flex:1,padding:'10px 14px',fontSize:'0.85rem',background:'var(--bg-raised)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',color:'var(--text-1)',resize:'none',outline:'none',fontFamily:'inherit'}}/>
        <Btn onClick={sendChat} disabled={!chatInput.trim()}>Send</Btn>
      </div>
      <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:8,textAlign:'center'}}>
        Context: {(invoices||[]).length} invoices, {(expenses||[]).length} expenses, {(sortedProf||[]).length} profitability snapshots
      </div>
    </div>
  )

  /* ── Modals ─────────────────────────────────────────────────────── */

  /* Create Invoice Modal */
  const InvoiceModal=()=>{
    const [f,setF]=useState({customer_name:'',site_id:'',contract_id:'',payment_terms:30,invoice_date:new Date().toISOString().slice(0,10),due_date:'',billing_period_from:'',billing_period_to:'',notes:'',lines:[{description:'',amount_net:0}]})
    const set=(k,v)=>setF(p=>({...p,[k]:v}))
    const setLine=(idx,k,v)=>setF(p=>{const l=[...p.lines];l[idx]={...l[idx],[k]:v};return{...p,lines:l}})
    const addLine=()=>setF(p=>({...p,lines:[...p.lines,{description:'',amount_net:0}]}))
    const rmLine=idx=>setF(p=>({...p,lines:p.lines.filter((_,i)=>i!==idx)}))
    const subtotal=f.lines.reduce((s,l)=>s+(Number(l.amount_net)||0),0)
    const vat=subtotal*0.2
    const total=subtotal+vat
    const valid=f.customer_name&&f.invoice_date&&f.lines.length>0&&f.lines.every(l=>l.description&&Number(l.amount_net)>0)
    return(
      <Modal open title="Create Invoice" onClose={()=>setModal(null)} width={640}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <Field label="Customer Name"><input style={inp} value={f.customer_name} onChange={e=>set('customer_name',e.target.value)} required/></Field>
          <Field label="Site ID"><input style={inp} value={f.site_id} onChange={e=>set('site_id',e.target.value)}/></Field>
          <Field label="Contract ID"><input style={inp} value={f.contract_id} onChange={e=>set('contract_id',e.target.value)}/></Field>
          <Field label="Payment Terms (days)"><input type="number" style={inp} value={f.payment_terms} onChange={e=>set('payment_terms',Number(e.target.value))}/></Field>
          <Field label="Invoice Date"><input type="date" style={inp} value={f.invoice_date} onChange={e=>set('invoice_date',e.target.value)} required/></Field>
          <Field label="Due Date"><input type="date" style={inp} value={f.due_date} onChange={e=>set('due_date',e.target.value)}/></Field>
          <Field label="Billing From"><input type="date" style={inp} value={f.billing_period_from} onChange={e=>set('billing_period_from',e.target.value)}/></Field>
          <Field label="Billing To"><input type="date" style={inp} value={f.billing_period_to} onChange={e=>set('billing_period_to',e.target.value)}/></Field>
        </div>

        <div style={{marginTop:6,marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <label style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Line Items</label>
            <Btn small variant="ghost" onClick={addLine}>+ Add Line</Btn>
          </div>
          {f.lines.map((l,i)=>(
            <div key={i} style={{display:'flex',gap:10,marginBottom:8,alignItems:'center'}}>
              <input style={{...inp,flex:1}} placeholder="Description" value={l.description} onChange={e=>setLine(i,'description',e.target.value)}/>
              <input type="number" step="0.01" style={{...inp,width:120}} placeholder="Amount (net)" value={l.amount_net||''} onChange={e=>setLine(i,'amount_net',e.target.value)}/>
              {f.lines.length>1&&<button onClick={()=>rmLine(i)} style={{background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:'1.1rem',padding:'0 4px'}}>&times;</button>}
            </div>
          ))}
        </div>

        <div style={{background:'var(--bg-raised)',borderRadius:'var(--r-sm)',padding:'14px 18px',marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.82rem',marginBottom:4}}>
            <span style={{color:'var(--text-muted)'}}>Subtotal (Net)</span><span style={{fontWeight:700}}>{fmtCur(subtotal)}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.82rem',marginBottom:4}}>
            <span style={{color:'var(--text-muted)'}}>VAT (20%)</span><span>{fmtCur(vat)}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.95rem',fontWeight:800,borderTop:'1px solid var(--border)',paddingTop:8,marginTop:4}}>
            <span>Total</span><span style={{color:'var(--teal)'}}>{fmtCur(total)}</span>
          </div>
        </div>

        <Field label="Notes"><textarea style={{...inp,minHeight:60}} value={f.notes} onChange={e=>set('notes',e.target.value)}/></Field>

        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
          <Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn>
          <Btn disabled={!valid||createInvM.isPending} onClick={()=>createInvM.mutate({...f,subtotal,vat_amount:vat,total,line_items:f.lines})}>{createInvM.isPending?'Creating...':'Create Invoice'}</Btn>
        </div>
      </Modal>
    )
  }

  /* Record Payment Modal */
  const PaymentModal=()=>{
    const preInv=modal?.invoice
    const unpaid=(invoices||[]).filter(i=>{const s=(i.status||'').toLowerCase();return s!=='paid'&&s!=='void'})
    const [f,setF]=useState({invoice_id:preInv?.id||'',amount:preInv?.balance||preInv?.total||'',date_received:new Date().toISOString().slice(0,10),payment_method:'BACS',reference:'',notes:''})
    const set=(k,v)=>setF(p=>({...p,[k]:v}))
    const valid=f.invoice_id&&Number(f.amount)>0&&f.date_received
    return(
      <Modal open title="Record Payment" onClose={()=>setModal(null)}>
        <Field label="Invoice">
          <select style={sel} value={f.invoice_id} onChange={e=>{
            set('invoice_id',e.target.value)
            const inv=unpaid.find(i=>String(i.id)===e.target.value)
            if(inv)set('amount',inv.balance||inv.total)
          }}>
            <option value="">Select invoice...</option>
            {unpaid.map(i=><option key={i.id} value={i.id}>{i.invoice_number||i.id} &mdash; {i.customer_name} ({fmtCur(i.balance||i.total)})</option>)}
          </select>
        </Field>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <Field label="Amount"><input type="number" step="0.01" style={inp} value={f.amount} onChange={e=>set('amount',e.target.value)}/></Field>
          <Field label="Date Received"><input type="date" style={inp} value={f.date_received} onChange={e=>set('date_received',e.target.value)}/></Field>
          <Field label="Payment Method">
            <select style={sel} value={f.payment_method} onChange={e=>set('payment_method',e.target.value)}>
              {PAY_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Reference"><input style={inp} value={f.reference} onChange={e=>set('reference',e.target.value)}/></Field>
        </div>
        <Field label="Notes"><textarea style={{...inp,minHeight:50}} value={f.notes} onChange={e=>set('notes',e.target.value)}/></Field>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
          <Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn>
          <Btn variant="success" disabled={!valid||recordPayM.isPending} onClick={()=>recordPayM.mutate({id:f.invoice_id,body:{amount:Number(f.amount),date_received:f.date_received,payment_method:f.payment_method,reference:f.reference,notes:f.notes}})}>{recordPayM.isPending?'Recording...':'Record Payment'}</Btn>
        </div>
      </Modal>
    )
  }

  /* Add Expense Modal */
  const ExpenseModal=()=>{
    const [f,setF]=useState({date:new Date().toISOString().slice(0,10),category:'Labour',amount_gross:'',supplier:'',description:'',site_id:'',contract_id:'',receipt_ref:'',recurring:'No'})
    const set=(k,v)=>setF(p=>({...p,[k]:v}))
    const valid=f.date&&f.category&&Number(f.amount_gross)>0&&f.description
    return(
      <Modal open title="Add Expense" onClose={()=>setModal(null)}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <Field label="Date"><input type="date" style={inp} value={f.date} onChange={e=>set('date',e.target.value)} required/></Field>
          <Field label="Category">
            <select style={sel} value={f.category} onChange={e=>set('category',e.target.value)}>
              {EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount (Gross)"><input type="number" step="0.01" style={inp} value={f.amount_gross} onChange={e=>set('amount_gross',e.target.value)} required/></Field>
          <Field label="Supplier"><input style={inp} value={f.supplier} onChange={e=>set('supplier',e.target.value)}/></Field>
        </div>
        <Field label="Description"><input style={inp} value={f.description} onChange={e=>set('description',e.target.value)} required/></Field>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <Field label="Site ID"><input style={inp} value={f.site_id} onChange={e=>set('site_id',e.target.value)}/></Field>
          <Field label="Contract ID"><input style={inp} value={f.contract_id} onChange={e=>set('contract_id',e.target.value)}/></Field>
          <Field label="Receipt Ref"><input style={inp} value={f.receipt_ref} onChange={e=>set('receipt_ref',e.target.value)}/></Field>
          <Field label="Recurring">
            <select style={sel} value={f.recurring} onChange={e=>set('recurring',e.target.value)}>
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </Field>
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
          <Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn>
          <Btn disabled={!valid||createExpM.isPending} onClick={()=>createExpM.mutate({...f,amount_gross:Number(f.amount_gross),recurring:f.recurring==='Yes'})}>{createExpM.isPending?'Adding...':'Add Expense'}</Btn>
        </div>
      </Modal>
    )
  }

  /* Add Transaction Modal */
  const TransactionModal=()=>{
    const [f,setF]=useState({type:'income',date:new Date().toISOString().slice(0,10),category:'',amount_gross:'',description:'',party:'',reference:'',site_id:'',notes:''})
    const set=(k,v)=>setF(p=>({...p,[k]:v}))
    const valid=f.type&&f.date&&Number(f.amount_gross)>0&&f.description
    return(
      <Modal open title="Add Transaction" onClose={()=>setModal(null)}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <Field label="Type">
            <select style={sel} value={f.type} onChange={e=>set('type',e.target.value)}>
              {Object.entries(TXN_TYPE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Date"><input type="date" style={inp} value={f.date} onChange={e=>set('date',e.target.value)} required/></Field>
          <Field label="Category">
            <select style={sel} value={f.category} onChange={e=>set('category',e.target.value)}>
              <option value="">Select...</option>
              {EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount (Gross)"><input type="number" step="0.01" style={inp} value={f.amount_gross} onChange={e=>set('amount_gross',e.target.value)} required/></Field>
        </div>
        <Field label="Description"><input style={inp} value={f.description} onChange={e=>set('description',e.target.value)} required/></Field>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <Field label="Party"><input style={inp} value={f.party} onChange={e=>set('party',e.target.value)}/></Field>
          <Field label="Reference"><input style={inp} value={f.reference} onChange={e=>set('reference',e.target.value)}/></Field>
          <Field label="Site ID"><input style={inp} value={f.site_id} onChange={e=>set('site_id',e.target.value)}/></Field>
        </div>
        <Field label="Notes"><textarea style={{...inp,minHeight:50}} value={f.notes} onChange={e=>set('notes',e.target.value)}/></Field>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
          <Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn>
          <Btn disabled={!valid||createTxnM.isPending} onClick={()=>createTxnM.mutate({...f,amount_gross:Number(f.amount_gross)})}>{createTxnM.isPending?'Adding...':'Add Transaction'}</Btn>
        </div>
      </Modal>
    )
  }

  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDER                                                        */
  /* ═══════════════════════════════════════════════════════════════ */
  return(
    <div style={{padding:'28px 32px',maxWidth:1200,margin:'0 auto',display:'flex',flexDirection:'column',gap:0,overflowY:'auto',height:'100%'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:22}}>
        <div>
          <h1 style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-.02em',margin:0}}>Finance</h1>
          <p style={{fontSize:'0.875rem',color:'var(--text-3)',marginTop:4}}>Invoicing, expenses, transactions & profitability</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:22,borderBottom:'1px solid var(--border)'}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'10px 18px',fontSize:'0.82rem',fontWeight:tab===t?700:500,color:tab===t?'var(--teal)':'var(--text-muted)',background:'none',border:'none',borderBottom:tab===t?'2px solid var(--teal)':'2px solid transparent',cursor:'pointer',marginBottom:-1,transition:'color 0.15s'}}>
            {t}
          </button>
        ))}
      </div>

      {/* Loading */}
      {ovLoading&&tab==='Overview'&&<Spinner/>}

      {/* Tab content */}
      {tab==='Overview'&&!ovLoading&&renderOverview()}
      {tab==='Transactions'&&renderTransactions()}
      {tab==='Invoices'&&renderInvoices()}
      {tab==='Expenses'&&renderExpenses()}
      {tab==='Profitability'&&renderProfitability()}
      {tab==='Tax & HMRC'&&renderTaxHMRC()}
      {tab==='Assistant'&&renderAssistant()}

      {/* Modals */}
      {modal?.type==='invoice'&&<InvoiceModal/>}
      {modal?.type==='payment'&&<PaymentModal/>}
      {modal?.type==='expense'&&<ExpenseModal/>}
      {modal?.type==='transaction'&&<TransactionModal/>}
    </div>
  )
}
