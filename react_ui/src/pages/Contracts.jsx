import {useState,useMemo} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {fetchContracts,fetchContract,fetchCleanerMatch,assignContractCleaner,fetchContractProfitability} from '../api'
import {formatGBP} from '../utils'
import {PageHeader,KPICard,Card,Badge,Button,EmptyState,SkeletonKPIs,SkeletonTable,Input} from '../components/ui'
import Spinner from '../components/Spinner'
import {useToast} from '../components/Toast'

const fmtCur=v=>formatGBP(v)
const fmtPct=v=>v!=null?(Number(v)||0).toFixed(1)+'%':'—'
const safeArr=v=>Array.isArray(v)?v:[]
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const STATUS_TONE={active:'success',expiring:'warning',draft:'neutral',ended:'danger',pending:'info'}
const STAFF_TONE={assigned:'success',partial:'warning',unassigned:'danger'}
const READY_TONE={ready:'success',nearly_ready:'warning',pending:'neutral'}
const cap=t=>(t||'—').replace(/_/g,' ')

function MarginCell({value}){
  const v=Number(value)
  const c=v>=30?'var(--success)':v>=20?'var(--warning)':'var(--danger)'
  return <span style={{fontWeight:600,color:isNaN(v)?'var(--text-muted)':c}}>{isNaN(v)?'—':v.toFixed(1)+'%'}</span>
}

export default function Contracts(){
  const queryClient=useQueryClient()
  const {data:contractsRaw,isLoading}=useQuery({queryKey:['contracts'],queryFn:()=>fetchContracts(),refetchInterval:30000})
  const contracts=useMemo(()=>{
    const raw=contractsRaw
    if(Array.isArray(raw))return raw
    if(raw?.contracts)return safeArr(raw.contracts)
    if(raw?.items)return safeArr(raw.items)
    return []
  },[contractsRaw])

  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')
  const [selectedId,setSelectedId]=useState(null)

  const now=new Date()
  const soon=new Date(now.getTime()+30*86400000)
  const enriched=contracts.map(c=>{
    const end=c.end_date?new Date(c.end_date):null
    const status=c.status||(end&&end<now?'ended':end&&end<soon?'expiring':'active')
    const staffing=c.staffing_status||c.staffing||(safeArr(c.assigned_cleaners).length>0?'assigned':'unassigned')
    const readiness=c.launch_readiness||c.readiness||'pending'
    return{...c,_status:status,_staffing:staffing,_readiness:readiness}
  })

  const active=enriched.filter(c=>c._status==='active')
  const marg=active.filter(c=>c.margin!=null)
  const stats={
    active:active.length,
    revenue:active.reduce((s,c)=>s+(Number(c.monthly_value)||0),0),
    avgMargin:marg.length>0?marg.reduce((s,c)=>s+(Number(c.margin)||0),0)/marg.length:0,
    needStaff:enriched.filter(c=>c._status==='active'&&c._staffing!=='assigned').length,
    expiring:enriched.filter(c=>c._status==='expiring').length,
  }

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

  const cell={padding:'12px 16px',fontSize:'.82rem',verticalAlign:'middle'}

  return(
    <div style={{padding:'28px 36px',maxWidth:1400,margin:'0 auto'}}>
      <PageHeader badge="Contracts" title="Contract Management" subtitle="Recurring contracts, staffing & profitability"/>

      {isLoading?<SkeletonKPIs count={5}/>:(
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14}}>
          <KPICard label="Active Contracts" value={stats.active} color="var(--teal)" icon="📄"/>
          <KPICard label="Monthly Revenue" value={fmtCur(stats.revenue)} color="var(--success)" icon="💷"/>
          <KPICard label="Avg Margin" value={fmtPct(stats.avgMargin)} color="var(--info)"/>
          <KPICard label="Needing Staff" value={stats.needStaff} color={stats.needStaff>0?'var(--danger)':'var(--success)'} icon={stats.needStaff>0?'⚠️':'✓'}/>
          <KPICard label="Expiring Soon" value={stats.expiring} color={stats.expiring>0?'var(--warning)':'var(--success)'}/>
        </div>
      )}

      {/* Filter + search */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'24px 0 16px',gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {[['all','All'],['active','Active'],['expiring','Expiring'],['draft','Draft'],['ended','Ended']].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{padding:'6px 16px',borderRadius:20,
              border:filter===k?'none':'1px solid var(--border-strong)',background:filter===k?'var(--teal)':'transparent',
              color:filter===k?'#fff':'var(--text-muted)',fontSize:'.78rem',fontWeight:600,cursor:'pointer'}}>
              {l}{tabCounts[k]>0?` (${tabCounts[k]})`:''}
            </button>
          ))}
        </div>
        <div style={{width:260}}><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contracts…"/></div>
      </div>

      {/* Table */}
      {isLoading?<SkeletonTable rows={6} cols={7}/>
        :filtered.length===0?(
          <EmptyState icon="📄"
            title={`No contracts${filter!=='all'?` with status "${filter}"`:''}`}
            message={contracts.length===0
              ?'Contracts appear here when quotes are won and signed. Start by winning opportunities in the Pipeline.'
              :'Try adjusting your filters or search term.'}/>
        ):(
          <Card padding={0} style={{overflow:'hidden'}}><div style={{overflowX:'auto'}}>
            <table className="am-table">
              <thead><tr>{['Site Name','Postcode','Monthly Value','Margin %','Status','Staffing','Readiness',''].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map((c,i)=>(
                  <tr key={c.id||i}>
                    <td style={{...cell,fontWeight:600}}>{c.site_name||c.name||'—'}</td>
                    <td style={{...cell,color:'var(--text-muted)',fontSize:'.78rem'}}>{c.site_postcode||c.postcode||'—'}</td>
                    <td style={{...cell,fontWeight:600}}>{fmtCur(c.monthly_value||0)}/mo</td>
                    <td style={cell}><MarginCell value={c.margin}/></td>
                    <td style={cell}><Badge tone={STATUS_TONE[c._status]||'neutral'}>{cap(c._status)}</Badge></td>
                    <td style={cell}><Badge tone={STAFF_TONE[c._staffing]||'neutral'}>{cap(c._staffing)}</Badge></td>
                    <td style={cell}><Badge tone={READY_TONE[c._readiness]||'neutral'}>{cap(c._readiness)}</Badge></td>
                    <td style={cell}><Button variant="secondary" size="sm" onClick={()=>setSelectedId(c.id)}>View</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></Card>
        )}

      {selectedId&&<ContractDrawer contractId={selectedId} onClose={()=>setSelectedId(null)} queryClient={queryClient}/>}
    </div>
  )
}

function ContractDrawer({contractId,onClose,queryClient}){
  const toast=useToast()
  const {data:contract,isLoading}=useQuery({queryKey:['contract',contractId],queryFn:()=>fetchContract(contractId),enabled:!!contractId})
  const {data:profitability}=useQuery({queryKey:['contract-profit',contractId],queryFn:()=>fetchContractProfitability(contractId),enabled:!!contractId})

  const [matchResults,setMatchResults]=useState(null)
  const [matching,setMatching]=useState(false)
  const [assigning,setAssigning]=useState(null)

  const handleMatch=async()=>{
    if(!contract)return
    setMatching(true)
    try{
      const res=await fetchCleanerMatch(contract.site_postcode||contract.postcode||'',contract.hours_per_week||0,contract.sector||'')
      setMatchResults(res)
      const n=safeArr(res?.matches||res?.cleaners||res).length
      toast.info(n>0?`${n} cleaner match${n>1?'es':''} found`:'No suitable cleaners found nearby')
    }catch(e){toast.error('Match failed — '+(e.message||'try again'))}
    setMatching(false)
  }

  const handleAssign=async(cleanerId)=>{
    setAssigning(cleanerId)
    try{
      await assignContractCleaner(contractId,cleanerId,'primary')
      queryClient.invalidateQueries({queryKey:['contract',contractId]})
      queryClient.invalidateQueries({queryKey:['contracts']})
      toast.success('Cleaner assigned to contract')
    }catch(e){toast.error('Assign failed — '+(e.message||'try again'))}
    setAssigning(null)
  }

  const c=contract||{}
  const schedule=safeArr(c.schedule||c.cleaning_schedule)
  const cleaners=safeArr(c.assigned_cleaners||c.cleaners)
  const matches=safeArr(matchResults?.matches||matchResults?.cleaners||matchResults)
  const profit=profitability||c.profitability||{}

  const checklist=[
    {label:'Contract signed',done:!!c.signed_date||c.status==='active'},
    {label:'Cleaners assigned',done:cleaners.length>0},
    {label:'Schedule confirmed',done:schedule.length>0},
    {label:'Keys / access arranged',done:!!c.keys_arranged||!!c.access_confirmed},
    {label:'Start date set',done:!!c.start_date},
  ]

  return(
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.4)',zIndex:900,animation:'am-fade .15s ease'}}/>
      <div style={{position:'fixed',top:0,right:0,width:560,maxWidth:'100vw',height:'100vh',background:'var(--bg-surface)',
        borderLeft:'1px solid var(--border)',zIndex:901,overflowY:'auto',boxShadow:'var(--shadow-lg)'}}>
        <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',
          alignItems:'center',position:'sticky',top:0,background:'var(--bg-surface)',zIndex:1}}>
          <div>
            <div style={{fontSize:'1.1rem',fontWeight:800,color:'var(--text-1)'}}>{c.site_name||c.name||'Contract Details'}</div>
            <div style={{fontSize:'.78rem',color:'var(--text-muted)',marginTop:2}}>{c.site_postcode||c.postcode||''}{c.client?' · '+c.client:''}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{background:'none',border:'none',fontSize:'1.4rem',color:'var(--text-muted)',cursor:'pointer',padding:4}}>×</button>
        </div>

        {isLoading?(
          <div style={{padding:40,display:'flex',justifyContent:'center'}}><Spinner/></div>
        ):(
          <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:20}}>
            <Section title="Contract Overview">
              <InfoGrid items={[
                ['Site',c.site_name||c.name||'—'],['Address',c.site_address||c.address||'—'],
                ['Postcode',c.site_postcode||c.postcode||'—'],['Client',c.client||'—'],
                ['Sector',c.sector||c.segment||'—'],
                ['Start',c.start_date?new Date(c.start_date).toLocaleDateString():'—'],
                ['End',c.end_date?new Date(c.end_date).toLocaleDateString():'Rolling'],
                ['Status',c.status||'—'],['Monthly Value',fmtCur(c.monthly_value||0)],
                ['Hours/Week',c.hours_per_week!=null?c.hours_per_week:'—'],
                ['Margin',c.margin!=null?c.margin.toFixed(1)+'%':'—'],
              ]}/>
            </Section>

            <Section title="Cleaning Schedule">
              {schedule.length>0?(
                <table className="am-table" style={{fontSize:'.78rem'}}>
                  <thead><tr>{['Day','Start','End','Hours'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {schedule.map((s,i)=>(
                      <tr key={i}>
                        <td style={{padding:'8px 12px',fontWeight:600}}>{s.day||DAYS[s.day_of_week]||'—'}</td>
                        <td style={{padding:'8px 12px',color:'var(--text-muted)'}}>{s.start_time||s.start||'—'}</td>
                        <td style={{padding:'8px 12px',color:'var(--text-muted)'}}>{s.end_time||s.end||'—'}</td>
                        <td style={{padding:'8px 12px',color:'var(--text-muted)'}}>{s.hours||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ):<div style={{padding:16,textAlign:'center',color:'var(--text-muted)',fontSize:'.8rem'}}>No schedule set</div>}
            </Section>

            <Section title="Assigned Cleaners">
              {cleaners.length>0?(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {cleaners.map((cl,i)=>(
                    <div key={cl.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',background:'var(--bg-subtle)',borderRadius:8,border:'1px solid var(--border)'}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:'.82rem'}}>{cl.name||cl.cleaner_name||'Cleaner'}</div>
                        <div style={{fontSize:'.72rem',color:'var(--text-muted)',marginTop:2}}>{cl.role||'primary'} · {cl.postcode||''}</div>
                      </div>
                      <Badge tone="success">{cl.status||'active'}</Badge>
                    </div>
                  ))}
                </div>
              ):<div style={{padding:16,textAlign:'center',color:'var(--text-muted)',fontSize:'.8rem'}}>No cleaners assigned yet</div>}

              <div style={{marginTop:12}}>
                <Button variant="primary" loading={matching} onClick={handleMatch} style={{width:'100%'}}>Match Cleaners</Button>
              </div>

              {matches.length>0&&(
                <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{fontSize:'.72rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.04em'}}>Recommended Matches</div>
                  {matches.map((m,i)=>(
                    <div key={m.cleaner_id||m.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',background:'var(--bg-subtle)',borderRadius:8,border:'1px solid var(--border)'}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:'.82rem'}}>{m.name||m.cleaner_name||'Cleaner'}</div>
                        <div style={{fontSize:'.72rem',color:'var(--text-muted)',marginTop:2}}>
                          Score: <span style={{fontWeight:700,color:m.score>=80?'var(--success)':m.score>=60?'var(--warning)':'var(--danger)'}}>{m.score!=null?m.score:'—'}</span>
                          {m.distance!=null&&' · '+m.distance.toFixed(1)+'mi'}
                          {m.available_hours!=null&&' · '+m.available_hours+'h avail'}
                        </div>
                        {m.reason&&<div style={{fontSize:'.7rem',color:'var(--text-muted)',marginTop:2,fontStyle:'italic'}}>{m.reason}</div>}
                      </div>
                      <Button variant="secondary" size="sm" loading={assigning===(m.cleaner_id||m.id)} onClick={()=>handleAssign(m.cleaner_id||m.id)}>Assign</Button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Profitability">
              <InfoGrid items={[
                ['Monthly Revenue',fmtCur(profit.revenue||c.monthly_value||0)],
                ['Monthly Cost',fmtCur(profit.cost||profit.monthly_cost||0)],
                ['Monthly Profit',fmtCur(profit.profit||profit.monthly_profit||0)],
                ['Margin',profit.margin!=null?profit.margin.toFixed(1)+'%':(c.margin!=null?c.margin.toFixed(1)+'%':'—')],
                ['Status',profit.status||profit.health||'—'],
              ]}/>
            </Section>

            <Section title="Launch Readiness">
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {checklist.map((item,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'var(--bg-subtle)',borderRadius:6}}>
                    <span style={{width:20,height:20,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.7rem',fontWeight:700,background:item.done?'var(--success)':'var(--border-strong)',color:'#fff'}}>{item.done?'✓':'—'}</span>
                    <span style={{fontSize:'.82rem',color:item.done?'var(--text-1)':'var(--text-muted)',fontWeight:item.done?600:400}}>{item.label}</span>
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

function Section({title,children}){
  return(
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontSize:'.78rem',fontWeight:700,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'.03em',background:'var(--bg-subtle)'}}>{title}</div>
      <div style={{padding:16}}>{children}</div>
    </div>
  )
}

function InfoGrid({items}){
  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px'}}>
      {safeArr(items).map(([k,v],i)=>(
        <div key={i}>
          <div style={{fontSize:'.68rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.03em',marginBottom:2}}>{k}</div>
          <div style={{fontSize:'.82rem',fontWeight:600,color:'var(--text-1)'}}>{v}</div>
        </div>
      ))}
    </div>
  )
}
