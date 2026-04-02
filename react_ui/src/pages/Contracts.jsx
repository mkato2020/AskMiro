import {useState,useMemo} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {fetchContracts,fetchContract,fetchCleanerMatch,assignContractCleaner,updateContract,fetchContractProfitability} from '../api'

const fmtCur=v=>'£'+Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0})
const fmtPct=v=>v!=null?(Number(v)||0).toFixed(1)+'%':'—'
const safeArr=v=>Array.isArray(v)?v:[]
const STATUS_COLORS={active:'#10b981',expiring:'#f59e0b',draft:'#6b7280',ended:'#ef4444',pending:'#3b82f6'}
const STAFFING_COLORS={assigned:'#10b981',partial:'#f59e0b',unassigned:'#ef4444'}
const READINESS_COLORS={ready:'#10b981',nearly_ready:'#f59e0b',pending:'#6b7280'}
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function Badge({text,colorMap,fallback}){
  const c=colorMap[text]||fallback||'#6b7280'
  return <span style={{padding:'3px 10px',borderRadius:12,fontSize:'0.72rem',fontWeight:600,color:c,background:c+'18',textTransform:'capitalize',whiteSpace:'nowrap'}}>{(text||'—').replace(/_/g,' ')}</span>
}

function MarginCell({value}){
  const v=Number(value)
  const c=v>=30?'#10b981':v>=20?'#f59e0b':'#ef4444'
  return <span style={{fontWeight:600,color:isNaN(v)?'var(--text-muted)':c}}>{isNaN(v)?'—':v.toFixed(1)+'%'}</span>
}

export default function Contracts(){
  const queryClient=useQueryClient()
  const {data:contractsRaw,isLoading}=useQuery({queryKey:['contracts'],queryFn:()=>fetchContracts(),refetchInterval:30000})
  const contracts=useMemo(()=>{
    const raw=contractsRaw
    if(Array.isArray(raw)) return raw
    if(raw?.contracts) return safeArr(raw.contracts)
    if(raw?.items) return safeArr(raw.items)
    return []
  },[contractsRaw])

  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')
  const [selectedId,setSelectedId]=useState(null)

  /* ── Enrich with computed status ── */
  const now=new Date()
  const soon=new Date(now.getTime()+30*86400000)
  const enriched=contracts.map(c=>{
    const end=c.end_date?new Date(c.end_date):null
    const status=c.status||(end&&end<now?'ended':end&&end<soon?'expiring':'active')
    const staffing=c.staffing_status||c.staffing||(safeArr(c.assigned_cleaners).length>0?'assigned':'unassigned')
    const readiness=c.launch_readiness||c.readiness||'pending'
    return{...c,_status:status,_staffing:staffing,_readiness:readiness}
  })

  /* ── KPI stats ── */
  const active=enriched.filter(c=>c._status==='active')
  const stats={
    active:active.length,
    revenue:active.reduce((s,c)=>s+(Number(c.monthly_value)||0),0),
    avgMargin:active.filter(c=>c.margin!=null).length>0
      ?active.filter(c=>c.margin!=null).reduce((s,c)=>s+(Number(c.margin)||0),0)/active.filter(c=>c.margin!=null).length:0,
    needStaff:enriched.filter(c=>c._status==='active'&&c._staffing!=='assigned').length,
    expiring:enriched.filter(c=>c._status==='expiring').length,
  }

  /* ── Filter + search ── */
  const filtered=enriched
    .filter(c=>filter==='all'||c._status===filter)
    .filter(c=>!search||[c.site_name,c.client,c.site_postcode,c.segment].some(v=>(v||'').toLowerCase().includes(search.toLowerCase())))

  const tabCounts=useMemo(()=>({
    all:enriched.length,
    active:enriched.filter(c=>c._status==='active').length,
    expiring:enriched.filter(c=>c._status==='expiring').length,
    draft:enriched.filter(c=>c._status==='draft').length,
    ended:enriched.filter(c=>c._status==='ended').length,
  }),[enriched])

  return(
    <div style={{padding:'28px 36px',maxWidth:1400,margin:'0 auto'}}>
      {/* ── Header ── */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{background:'var(--teal)',color:'white',fontSize:'0.65rem',fontWeight:700,padding:'3px 10px',borderRadius:4,textTransform:'uppercase'}}>Contracts</span>
          <h1 style={{fontSize:'1.35rem',fontWeight:800,color:'var(--text-1)',margin:0}}>Contract Management</h1>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14,marginBottom:24}}>
        <KPI label="Active Contracts" value={stats.active} color="var(--teal)"/>
        <KPI label="Monthly Revenue" value={fmtCur(stats.revenue)} color="#10b981"/>
        <KPI label="Avg Margin" value={fmtPct(stats.avgMargin)} color="#3b82f6"/>
        <KPI label="Needing Staff" value={stats.needStaff} color={stats.needStaff>0?'#ef4444':'var(--text-muted)'}/>
        <KPI label="Expiring Soon" value={stats.expiring} color={stats.expiring>0?'#f59e0b':'var(--text-muted)'}/>
      </div>

      {/* ── Filter Tabs ── */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{display:'flex',gap:6}}>
          {[['all','All'],['active','Active'],['expiring','Expiring'],['draft','Draft'],['ended','Ended']].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{padding:'6px 16px',borderRadius:20,border:filter===k?'none':'1px solid var(--border)',background:filter===k?'var(--teal)':'transparent',color:filter===k?'white':'var(--text-muted)',fontSize:'0.78rem',fontWeight:600,cursor:'pointer'}}>
              {l}{tabCounts[k]>0?` (${tabCounts[k]})`:''}
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contracts..." style={{padding:'8px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',background:'var(--bg-base)',color:'var(--text-1)',fontSize:'0.82rem',width:260}}/>
      </div>

      {/* ── Table ── */}
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
        {isLoading?(
          <div style={{textAlign:'center',padding:60,color:'var(--text-muted)'}}>Loading contracts...</div>
        ):filtered.length===0?(
          <div style={{textAlign:'center',padding:60}}>
            <div style={{fontSize:'1.6rem',marginBottom:8,color:'var(--text-muted)'}}>No contracts {filter!=='all'?`with status "${filter}"`:'found'}</div>
            <div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginTop:6,maxWidth:400,margin:'8px auto 0'}}>
              {contracts.length===0
                ?'Contracts appear here when quotes are won and signed. Start by winning opportunities in the Pipeline.'
                :'Try adjusting your filters or search term.'}
            </div>
          </div>
        ):(
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
            <thead>
              <tr style={{borderBottom:'2px solid var(--border)'}}>
                {['Site Name','Postcode','Monthly Value','Margin %','Status','Staffing','Readiness',''].map(h=>(
                  <th key={h} style={{padding:'12px 14px',textAlign:'left',fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c,i)=>(
                <tr key={c.id||i} style={{borderBottom:'1px solid var(--border)',transition:'background 0.1s'}}
                  onMouseOver={e=>e.currentTarget.style.background='var(--bg-base)'}
                  onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'12px 14px',fontWeight:600,color:'var(--text-1)'}}>{c.site_name||c.name||'—'}</td>
                  <td style={{padding:'12px 14px',color:'var(--text-muted)',fontSize:'0.78rem'}}>{c.site_postcode||c.postcode||'—'}</td>
                  <td style={{padding:'12px 14px',fontWeight:600,color:'var(--text-1)'}}>{fmtCur(c.monthly_value||0)}/mo</td>
                  <td style={{padding:'12px 14px'}}><MarginCell value={c.margin}/></td>
                  <td style={{padding:'12px 14px'}}><Badge text={c._status} colorMap={STATUS_COLORS}/></td>
                  <td style={{padding:'12px 14px'}}><Badge text={c._staffing} colorMap={STAFFING_COLORS}/></td>
                  <td style={{padding:'12px 14px'}}><Badge text={c._readiness} colorMap={READINESS_COLORS}/></td>
                  <td style={{padding:'12px 14px'}}>
                    <button onClick={()=>setSelectedId(c.id)} style={{padding:'5px 14px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-base)',color:'var(--text-1)',fontSize:'0.75rem',fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}
                      onMouseOver={e=>{e.currentTarget.style.background='var(--teal)';e.currentTarget.style.color='white';e.currentTarget.style.border='1px solid var(--teal)'}}
                      onMouseOut={e=>{e.currentTarget.style.background='var(--bg-base)';e.currentTarget.style.color='var(--text-1)';e.currentTarget.style.border='1px solid var(--border)'}}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail Drawer ── */}
      {selectedId&&<ContractDrawer contractId={selectedId} onClose={()=>setSelectedId(null)} queryClient={queryClient}/>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   KPI Card
   ═══════════════════════════════════════════════════════ */
function KPI({label,value,color}){
  return(
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
      <div style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:'1.5rem',fontWeight:800,color:color||'var(--text-1)'}}>{value}</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Contract Detail Drawer
   ═══════════════════════════════════════════════════════ */
function ContractDrawer({contractId,onClose,queryClient}){
  const {data:contract,isLoading}=useQuery({queryKey:['contract',contractId],queryFn:()=>fetchContract(contractId),enabled:!!contractId})
  const {data:profitability}=useQuery({queryKey:['contract-profit',contractId],queryFn:()=>fetchContractProfitability(contractId),enabled:!!contractId})

  const [matchResults,setMatchResults]=useState(null)
  const [matching,setMatching]=useState(false)
  const [assigning,setAssigning]=useState(null)

  const handleMatch=async()=>{
    if(!contract) return
    setMatching(true)
    try{
      const res=await fetchCleanerMatch(contract.site_postcode||contract.postcode||'',contract.hours_per_week||0,contract.sector||'')
      setMatchResults(res)
    }catch(e){console.error('Match error',e)}
    setMatching(false)
  }

  const handleAssign=async(cleanerId)=>{
    setAssigning(cleanerId)
    try{
      await assignContractCleaner(contractId,cleanerId,'primary')
      queryClient.invalidateQueries({queryKey:['contract',contractId]})
      queryClient.invalidateQueries({queryKey:['contracts']})
    }catch(e){console.error('Assign error',e)}
    setAssigning(null)
  }

  const c=contract||{}
  const schedule=safeArr(c.schedule||c.cleaning_schedule)
  const cleaners=safeArr(c.assigned_cleaners||c.cleaners)
  const matches=safeArr(matchResults?.matches||matchResults?.cleaners||matchResults)
  const profit=profitability||c.profitability||{}

  /* Readiness checklist */
  const checklist=[
    {label:'Contract signed',done:!!c.signed_date||c.status==='active'},
    {label:'Cleaners assigned',done:cleaners.length>0},
    {label:'Schedule confirmed',done:schedule.length>0},
    {label:'Keys / access arranged',done:!!c.keys_arranged||!!c.access_confirmed},
    {label:'Start date set',done:!!c.start_date},
  ]

  return(
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:900}}/>
      {/* Drawer */}
      <div style={{position:'fixed',top:0,right:0,width:560,height:'100vh',background:'var(--bg-surface)',borderLeft:'1px solid var(--border)',zIndex:901,overflowY:'auto',boxShadow:'-4px 0 24px rgba(0,0,0,0.15)'}}>
        {/* Drawer header */}
        <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:'var(--bg-surface)',zIndex:1}}>
          <div>
            <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--text-1)'}}>{c.site_name||c.name||'Contract Details'}</div>
            <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:2}}>{c.site_postcode||c.postcode||''}{c.client?' · '+c.client:''}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'1.2rem',color:'var(--text-muted)',cursor:'pointer',padding:4}}>✕</button>
        </div>

        {isLoading?(
          <div style={{textAlign:'center',padding:60,color:'var(--text-muted)'}}>Loading...</div>
        ):(
          <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:20}}>

            {/* ── Site Info & Dates ── */}
            <Section title="Contract Overview">
              <InfoGrid items={[
                ['Site',c.site_name||c.name||'—'],
                ['Address',c.site_address||c.address||'—'],
                ['Postcode',c.site_postcode||c.postcode||'—'],
                ['Client',c.client||'—'],
                ['Sector',c.sector||c.segment||'—'],
                ['Start',c.start_date?new Date(c.start_date).toLocaleDateString():'—'],
                ['End',c.end_date?new Date(c.end_date).toLocaleDateString():'Rolling'],
                ['Status',c.status||'—'],
                ['Monthly Value',fmtCur(c.monthly_value||0)],
                ['Hours/Week',c.hours_per_week!=null?c.hours_per_week:'—'],
                ['Margin',c.margin!=null?c.margin.toFixed(1)+'%':'—'],
              ]}/>
            </Section>

            {/* ── Schedule ── */}
            <Section title="Cleaning Schedule">
              {schedule.length>0?(
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.78rem'}}>
                  <thead>
                    <tr>{['Day','Start','End','Hours'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:'0.68rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',borderBottom:'1px solid var(--border)'}}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {schedule.map((s,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'8px 10px',fontWeight:600,color:'var(--text-1)'}}>{s.day||DAYS[s.day_of_week]||'—'}</td>
                        <td style={{padding:'8px 10px',color:'var(--text-muted)'}}>{s.start_time||s.start||'—'}</td>
                        <td style={{padding:'8px 10px',color:'var(--text-muted)'}}>{s.end_time||s.end||'—'}</td>
                        <td style={{padding:'8px 10px',color:'var(--text-muted)'}}>{s.hours||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ):(
                <div style={{padding:16,textAlign:'center',color:'var(--text-muted)',fontSize:'0.8rem'}}>No schedule set</div>
              )}
            </Section>

            {/* ── Assigned Cleaners ── */}
            <Section title="Assigned Cleaners">
              {cleaners.length>0?(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {cleaners.map((cl,i)=>(
                    <div key={cl.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',background:'var(--bg-base)',borderRadius:8,border:'1px solid var(--border)'}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:'0.82rem',color:'var(--text-1)'}}>{cl.name||cl.cleaner_name||'Cleaner'}</div>
                        <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:2}}>{cl.role||'primary'} · {cl.postcode||''}</div>
                      </div>
                      <Badge text={cl.status||'active'} colorMap={STATUS_COLORS} fallback="#10b981"/>
                    </div>
                  ))}
                </div>
              ):(
                <div style={{padding:16,textAlign:'center',color:'var(--text-muted)',fontSize:'0.8rem'}}>No cleaners assigned yet</div>
              )}

              {/* Match button */}
              <button onClick={handleMatch} disabled={matching} style={{marginTop:12,width:'100%',padding:'10px 0',borderRadius:8,border:'none',background:matching?'var(--bg-base)':'var(--teal)',color:matching?'var(--text-muted)':'white',fontSize:'0.82rem',fontWeight:700,cursor:matching?'default':'pointer',transition:'all 0.15s'}}>
                {matching?'Finding matches...':'Match Cleaners'}
              </button>

              {/* Match results */}
              {matches.length>0&&(
                <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{fontSize:'0.72rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em'}}>Recommended Matches</div>
                  {matches.map((m,i)=>(
                    <div key={m.cleaner_id||m.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',background:'var(--bg-base)',borderRadius:8,border:'1px solid var(--border)'}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:'0.82rem',color:'var(--text-1)'}}>{m.name||m.cleaner_name||'Cleaner'}</div>
                        <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:2}}>
                          Score: <span style={{fontWeight:700,color:m.score>=80?'#10b981':m.score>=60?'#f59e0b':'#ef4444'}}>{m.score!=null?m.score:'—'}</span>
                          {m.distance!=null&&' · '+m.distance.toFixed(1)+'mi'}
                          {m.available_hours!=null&&' · '+m.available_hours+'h avail'}
                        </div>
                        {m.reason&&<div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:2,fontStyle:'italic'}}>{m.reason}</div>}
                      </div>
                      <button onClick={()=>handleAssign(m.cleaner_id||m.id)} disabled={assigning===m.cleaner_id||assigning===m.id}
                        style={{padding:'5px 14px',borderRadius:6,border:'1px solid var(--teal)',background:assigning===m.cleaner_id?'var(--bg-base)':'white',color:'var(--teal)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
                        {assigning===(m.cleaner_id||m.id)?'Assigning...':'Assign'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── Profitability ── */}
            <Section title="Profitability">
              <InfoGrid items={[
                ['Monthly Revenue',fmtCur(profit.revenue||c.monthly_value||0)],
                ['Monthly Cost',fmtCur(profit.cost||profit.monthly_cost||0)],
                ['Monthly Profit',fmtCur(profit.profit||profit.monthly_profit||0)],
                ['Margin',profit.margin!=null?profit.margin.toFixed(1)+'%':(c.margin!=null?c.margin.toFixed(1)+'%':'—')],
                ['Status',profit.status||profit.health||'—'],
              ]}/>
            </Section>

            {/* ── Readiness Checklist ── */}
            <Section title="Launch Readiness">
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {checklist.map((item,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'var(--bg-base)',borderRadius:6}}>
                    <span style={{width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:700,background:item.done?'#10b981':'var(--border)',color:item.done?'white':'var(--text-muted)'}}>{item.done?'✓':'—'}</span>
                    <span style={{fontSize:'0.82rem',color:item.done?'var(--text-1)':'var(--text-muted)',fontWeight:item.done?600:400}}>{item.label}</span>
                  </div>
                ))}
              </div>
            </Section>

          </div>
        )}
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════
   Section wrapper
   ═══════════════════════════════════════════════════════ */
function Section({title,children}){
  return(
    <div style={{background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontSize:'0.78rem',fontWeight:700,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'0.03em'}}>{title}</div>
      <div style={{padding:16}}>{children}</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Info Grid (key/value pairs)
   ═══════════════════════════════════════════════════════ */
function InfoGrid({items}){
  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px'}}>
      {safeArr(items).map(([k,v],i)=>(
        <div key={i}>
          <div style={{fontSize:'0.68rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.03em',marginBottom:2}}>{k}</div>
          <div style={{fontSize:'0.82rem',fontWeight:600,color:'var(--text-1)'}}>{v}</div>
        </div>
      ))}
    </div>
  )
}
