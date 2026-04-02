import {useState,useMemo,useCallback} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {createContract,fetchFeasibility} from '../api'
import Spinner from '../components/Spinner'

/* ── constants ─────────────────────────────────────────── */
const STAGES=[
  {key:'new',label:'New',color:'#3B82F6',icon:'\u2726'},
  {key:'ready_to_contact',label:'Ready',color:'#8B5CF6',icon:'\u2709'},
  {key:'contacted',label:'Contacted',color:'#F59E0B',icon:'\u260E'},
  {key:'qualified',label:'Qualified',color:'#EC4899',icon:'\u2714'},
  {key:'quote_sent',label:'Quote Sent',color:'#14B8A6',icon:'\u00A3'},
  {key:'negotiating',label:'Negotiating',color:'#EF4444',icon:'\u2694'},
]
const WON_STAGE={key:'won',label:'Won',color:'#059669',icon:'\u2605'}
const ALL_STAGES=[...STAGES,WON_STAGE]

const STAGE_FILTERS=['All','New','Ready','Contacted','Qualified','Quote Sent','Negotiating','Won']
const STAGE_FILTER_MAP={'New':'new','Ready':'ready_to_contact','Contacted':'contacted','Qualified':'qualified','Quote Sent':'quote_sent','Negotiating':'negotiating','Won':'won'}

const TABS=['Pipeline','List','Activity']

const SECTOR_COLORS={
  healthcare:  {bg:'#FDF2F8',color:'#DB2777'},
  education:   {bg:'#FEF3C7',color:'#D97706'},
  office:      {bg:'#EFF6FF',color:'#2563EB'},
  offices:     {bg:'#EFF6FF',color:'#2563EB'},
  gyms:        {bg:'#F0FDFA',color:'#0D9488'},
  gym_leisure: {bg:'#F0FDFA',color:'#0D9488'},
  retail:      {bg:'#F5F3FF',color:'#7C3AED'},
  hospitality: {bg:'#FFF7ED',color:'#EA580C'},
  industrial:  {bg:'#FFF7ED',color:'#EA580C'},
  industrial_warehouse:{bg:'#FFF7ED',color:'#EA580C'},
  residential: {bg:'#ECFDF5',color:'#059669'},
  residential_blocks:{bg:'#ECFDF5',color:'#059669'},
  public_sector:{bg:'#F1F5F9',color:'#475569'},
  government:  {bg:'#F1F5F9',color:'#475569'},
  property_management:{bg:'#EFF6FF',color:'#2563EB'},
  charity:     {bg:'#FEF3C7',color:'#92400E'},
  other:       {bg:'#F1F5F9',color:'#64748B'},
}
const DEFAULT_SECTOR={bg:'rgba(100,116,139,.12)',color:'#94A3B8'}

const HEAT_COLORS={hot:{bg:'#FEE2E2',color:'#DC2626',label:'Hot'},warm:{bg:'#FEF3C7',color:'#D97706',label:'Warm'},cold:{bg:'#F1F5F9',color:'#64748B',label:'Cold'}}

/* ── helpers ───────────────────────────────────────────── */
function timeAgo(dateStr){
  if(!dateStr)return ''
  const diff=Date.now()-new Date(dateStr).getTime()
  const mins=Math.floor(diff/60000)
  if(mins<1)return 'just now'
  if(mins<60)return `${mins}m ago`
  const hrs=Math.floor(mins/60)
  if(hrs<24)return `${hrs}h ago`
  const days=Math.floor(hrs/24)
  if(days<30)return `${days}d ago`
  const months=Math.floor(days/30)
  return `${months}mo ago`
}

function initials(name){
  if(!name||name==='Unknown')return '\u2726'
  const parts=name.trim().split(/\s+/).filter(Boolean)
  if(parts.length===1)return parts[0].slice(0,2).toUpperCase()
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase()
}

function fmtCurrency(v){
  if(v==null||v===0)return null
  return '\u00A3'+Number(v).toLocaleString('en-GB',{maximumFractionDigits:0})
}

function nextStageKey(stage){
  const order=ALL_STAGES.map(s=>s.key)
  const idx=order.indexOf(stage)
  if(idx<0||idx>=order.length-1)return null
  return order[idx+1]
}

function nextStageLabel(stage){
  const key=nextStageKey(stage)
  if(!key)return null
  return ALL_STAGES.find(s=>s.key===key)?.label||null
}

function scoreBand(score){
  if(score>=80)return {bg:'#059669',color:'#fff'}
  if(score>=65)return {bg:'#D97706',color:'#fff'}
  if(score>=50)return {bg:'#3B82F6',color:'#fff'}
  return {bg:'rgba(100,116,139,.2)',color:'#94A3B8'}
}

/* ── Intelligence helpers ─────────────────────────────── */
function daysInStage(lead){
  const dt=lead.stage_entered_at||lead.updated_at||lead.last_touched_at
  if(!dt)return null
  return Math.floor((Date.now()-new Date(dt).getTime())/(86400000))
}

function feasibilityDot(lead){
  const score=lead.feasibility_score??lead.feasibility??null
  if(score==null)return '\u26AA'
  if(score>70)return '\uD83D\uDFE2'
  if(score>40)return '\uD83D\uDFE1'
  return '\uD83D\uDD34'
}

const QUOTE_AND_LATER=['quote_sent','quote_prepared','negotiating','won']

function DaysInStageBadge({lead}){
  const days=daysInStage(lead)
  if(days==null)return null
  const stale=days>7
  return <span style={{fontSize:'0.58rem',fontWeight:600,color:stale?'#DC2626':'var(--text-muted)',whiteSpace:'nowrap'}}>{days}d</span>
}

function FeasibilityDot({lead}){
  if(!QUOTE_AND_LATER.includes(lead.stage))return null
  return <span style={{fontSize:'0.62rem',lineHeight:1}} title={`Feasibility: ${lead.feasibility_score??lead.feasibility??'unknown'}`}>{feasibilityDot(lead)}</span>
}

function MonthlyValueBadge({lead}){
  const v=lead.estimated_monthly_value_gbp
  if(v==null||v===0)return null
  return <span style={{fontSize:'0.6rem',fontWeight:700,color:'#8B5CF6',whiteSpace:'nowrap'}}>~{'\u00A3'}{Number(v).toLocaleString('en-GB',{maximumFractionDigits:0})}/mo</span>
}

const CLEANING_FREQ_OPTIONS=['daily','weekly','biweekly','monthly','one_off']

/* ── Won → Contract Modal ─────────────────────────────── */
function ContractModal({opportunity,onClose,onSuccess}){
  const [form,setForm]=useState({
    contract_start:'',
    hours_per_week:opportunity?.hours_per_week||opportunity?.estimated_hours||'',
    monthly_value_gbp:opportunity?.estimated_monthly_value_gbp||opportunity?.value||opportunity?.quote_value_gbp||'',
    cleaning_frequency:opportunity?.cleaning_frequency||'weekly',
    notes:'',
  })
  const [submitting,setSubmitting]=useState(false)
  const [error,setError]=useState(null)
  const [success,setSuccess]=useState(false)

  const handleSubmit=async(e)=>{
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try{
      const payload={
        opportunity_id:opportunity.entity_id||opportunity.id,
        company_name:opportunity.company_name||opportunity.name,
        contact_name:opportunity.contact_name||'',
        postcode:opportunity.postcode||'',
        sector:opportunity.sector||'',
        contract_start:form.contract_start||undefined,
        hours_per_week:form.hours_per_week?Number(form.hours_per_week):undefined,
        monthly_value_gbp:form.monthly_value_gbp?Number(form.monthly_value_gbp):undefined,
        cleaning_frequency:form.cleaning_frequency||undefined,
        notes:form.notes||undefined,
      }
      await createContract(payload)
      setSuccess(true)
      if(onSuccess)onSuccess()
    }catch(err){
      setError(err.message||'Failed to create contract')
    }finally{
      setSubmitting(false)
    }
  }

  const inputStyle={width:'100%',padding:'8px 12px',fontSize:'0.82rem',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg-surface)',color:'var(--text-1)',outline:'none',boxSizing:'border-box'}
  const labelStyle={display:'block',fontSize:'0.7rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}

  return(
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.55)',backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,padding:'28px 32px',width:440,maxWidth:'90vw',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.4)'}} onClick={e=>e.stopPropagation()}>
        {success?(
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:'2rem',marginBottom:12}}>&#9989;</div>
            <div style={{fontSize:'1.1rem',fontWeight:800,color:'var(--text-1)',marginBottom:6}}>Contract Created</div>
            <div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:20}}>
              Contract for {opportunity.company_name||opportunity.name} is ready.
            </div>
            <button onClick={onClose} style={{padding:'10px 28px',fontSize:'0.82rem',fontWeight:700,color:'#fff',background:'var(--teal)',border:'none',borderRadius:8,cursor:'pointer'}}>Done</button>
          </div>
        ):(
          <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <div>
                <div style={{fontSize:'1.1rem',fontWeight:800,color:'var(--text-1)'}}>Create Contract</div>
                <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:2}}>{opportunity.company_name||opportunity.name}</div>
              </div>
              <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'1.2rem',cursor:'pointer',padding:4,lineHeight:1}}>&times;</button>
            </div>

            {error&&<div style={{background:'rgba(220,38,38,.1)',color:'#DC2626',fontSize:'0.78rem',fontWeight:600,padding:'10px 14px',borderRadius:8,marginBottom:16}}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                <div>
                  <label style={labelStyle}>Contract Start</label>
                  <input type="date" value={form.contract_start} onChange={e=>setForm(f=>({...f,contract_start:e.target.value}))} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Hours / Week</label>
                  <input type="number" step="0.5" min="0" value={form.hours_per_week} onChange={e=>setForm(f=>({...f,hours_per_week:e.target.value}))} style={inputStyle} placeholder="e.g. 10"/>
                </div>
                <div>
                  <label style={labelStyle}>Monthly Value (&pound;)</label>
                  <input type="number" step="0.01" min="0" value={form.monthly_value_gbp} onChange={e=>setForm(f=>({...f,monthly_value_gbp:e.target.value}))} style={inputStyle} placeholder="e.g. 1500"/>
                </div>
                <div>
                  <label style={labelStyle}>Cleaning Frequency</label>
                  <select value={form.cleaning_frequency} onChange={e=>setForm(f=>({...f,cleaning_frequency:e.target.value}))} style={inputStyle}>
                    {CLEANING_FREQ_OPTIONS.map(o=><option key={o} value={o}>{o.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
                  </select>
                </div>
              </div>
              <div style={{marginBottom:18}}>
                <label style={labelStyle}>Notes</label>
                <textarea rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{...inputStyle,resize:'vertical'}} placeholder="Any special requirements..."/>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button type="button" onClick={onClose} style={{padding:'9px 20px',fontSize:'0.8rem',fontWeight:600,color:'var(--text-muted)',background:'transparent',border:'1px solid var(--border)',borderRadius:8,cursor:'pointer'}}>Cancel</button>
                <button type="submit" disabled={submitting} style={{padding:'9px 24px',fontSize:'0.8rem',fontWeight:700,color:'#fff',background:'var(--teal)',border:'none',borderRadius:8,cursor:submitting?'wait':'pointer',opacity:submitting?.6:1}}>
                  {submitting?'Creating...':'Create Contract'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Pipeline Velocity Bar ────────────────────────────── */
function VelocityBar({leads}){
  const now=Date.now()
  const activeStages=['new','ready_to_contact','contacted','qualified','quote_sent','quote_prepared','negotiating']
  const active=leads.filter(l=>activeStages.includes(l.stage))
  const stale=active.filter(l=>{
    const dt=l.updated_at||l.last_touched_at
    if(!dt)return true
    return (now-new Date(dt).getTime())>(3*86400000)
  })
  const thisMonth=new Date()
  const wonThisMonth=leads.filter(l=>{
    if(l.stage!=='won')return false
    const dt=l.updated_at||l.won_at||l.last_touched_at
    if(!dt)return false
    const d=new Date(dt)
    return d.getMonth()===thisMonth.getMonth()&&d.getFullYear()===thisMonth.getFullYear()
  })
  if(active.length===0&&wonThisMonth.length===0)return null
  return(
    <div style={{display:'flex',gap:16,alignItems:'center',padding:'10px 18px',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,marginBottom:16,flexWrap:'wrap'}}>
      <span style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-1)'}}>{active.length} active</span>
      {stale.length>0&&<span style={{fontSize:'0.72rem',fontWeight:700,color:'#DC2626'}}>{stale.length} stale (&gt;3d)</span>}
      <span style={{fontSize:'0.72rem',fontWeight:700,color:'#059669'}}>{wonThisMonth.length} won this month</span>
    </div>
  )
}

/* ── Sector badge ──────────────────────────────────────── */
function SectorBadge({sector}){
  if(!sector)return null
  const s=SECTOR_COLORS[sector.toLowerCase()]||SECTOR_COLORS[sector]||DEFAULT_SECTOR
  const label=sector.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
  return <span style={{background:s.bg,color:s.color,fontSize:'0.62rem',fontWeight:700,padding:'2px 8px',borderRadius:10,whiteSpace:'nowrap',letterSpacing:'.01em'}}>{label}</span>
}

/* ── Stage pill ────────────────────────────────────────── */
function StagePill({stage}){
  const s=ALL_STAGES.find(st=>st.key===stage)||{label:stage,color:'#64748B'}
  return <span style={{background:s.color+'18',color:s.color,fontSize:'0.62rem',fontWeight:700,padding:'2px 10px',borderRadius:10,whiteSpace:'nowrap'}}>{s.label}</span>
}

/* ── Score badge ───────────────────────────────────────── */
function ScoreBadge({score}){
  if(score==null)return null
  const s=scoreBand(score)
  return <span style={{background:s.bg,color:s.color,fontSize:'0.6rem',fontWeight:800,padding:'2px 7px',borderRadius:6,minWidth:28,textAlign:'center',display:'inline-block',lineHeight:'16px'}}>{Math.round(score)}</span>
}

/* ── KPI component ─────────────────────────────────────── */
function KPI({label,value,color,sub}){
  return(
    <div style={{flex:1,minWidth:140,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:color||'var(--border)',opacity:.6}}/>
      <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8,fontWeight:600}}>{label}</div>
      <div style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-.03em',color:color||'var(--text-1)',lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:6}}>{sub}</div>}
    </div>
  )
}

/* ── Lead card (Kanban) ────────────────────────────────── */
function LeadCard({lead,onAdvance,onClick,advancing,onCreateContract}){
  const stg=STAGES.find(s=>s.key===lead.stage)||STAGES[0]
  const next=nextStageLabel(lead.stage)
  const nextKey=nextStageKey(lead.stage)
  const heat=HEAT_COLORS[lead.pipeline_heat]||HEAT_COLORS.cold
  const val=fmtCurrency(lead.value||lead.estimated_monthly_value_gbp||lead.quote_value_gbp)
  const isWon=lead.stage==='won'
  const isAdvancingToWon=nextKey==='won'

  return(
    <div
      onClick={()=>onClick(lead.entity_id||lead.id)}
      style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px',cursor:'pointer',transition:'all .2s ease',borderLeft:`3px solid ${stg.color}`}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--teal)';e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,.15)'}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}
    >
      {/* Top row: avatar + name + score + feasibility */}
      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
        <div style={{width:34,height:34,borderRadius:8,background:`${stg.color}18`,color:stg.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.68rem',fontWeight:800,flexShrink:0}}>
          {initials(lead.company_name||lead.name)}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:'0.8rem',fontWeight:700,color:'var(--text-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:'18px'}}>{lead.company_name||lead.name||'Unknown'}</div>
          {(lead.contact_name||lead.borough)&&(
            <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {lead.contact_name&&<span>{lead.contact_name}</span>}
              {lead.contact_name&&lead.borough&&<span> {'\u00B7'} </span>}
              {lead.borough&&<span>{lead.borough}</span>}
            </div>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
          <FeasibilityDot lead={lead}/>
          <ScoreBadge score={lead.total_score}/>
        </div>
      </div>

      {/* Tags row */}
      <div style={{display:'flex',gap:5,alignItems:'center',marginTop:8,flexWrap:'wrap'}}>
        <SectorBadge sector={lead.sector}/>
        {lead.pipeline_heat&&(
          <span style={{background:heat.bg,color:heat.color,fontSize:'0.58rem',fontWeight:800,padding:'1px 7px',borderRadius:8,textTransform:'uppercase',letterSpacing:'.04em'}}>{heat.label}</span>
        )}
        {val&&<span style={{fontSize:'0.62rem',fontWeight:700,color:'var(--teal)'}}>{val}/mo</span>}
        <MonthlyValueBadge lead={lead}/>
        <DaysInStageBadge lead={lead}/>
      </div>

      {/* Bottom row: time + advance / contract button */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10,paddingTop:8,borderTop:'1px solid rgba(255,255,255,.04)'}}>
        <span style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>{timeAgo(lead.updated_at||lead.last_touched_at)||'No activity'}</span>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {isWon&&onCreateContract&&(
            <button
              onClick={e=>{e.stopPropagation();onCreateContract(lead)}}
              style={{fontSize:'0.62rem',fontWeight:700,color:'#059669',background:'rgba(5,150,105,.08)',border:'1px solid rgba(5,150,105,.25)',borderRadius:6,padding:'3px 10px',cursor:'pointer',transition:'all .15s'}}
              onMouseEnter={e=>{e.target.style.background='rgba(5,150,105,.18)'}}
              onMouseLeave={e=>{e.target.style.background='rgba(5,150,105,.08)'}}
            >
              Create Contract
            </button>
          )}
          {next&&nextKey&&!isAdvancingToWon&&(
            <button
              onClick={e=>{e.stopPropagation();onAdvance(lead.entity_id||lead.id,nextKey)}}
              disabled={advancing}
              style={{fontSize:'0.62rem',fontWeight:700,color:'var(--teal)',background:'rgba(20,184,166,.08)',border:'1px solid rgba(20,184,166,.25)',borderRadius:6,padding:'3px 10px',cursor:advancing?'wait':'pointer',opacity:advancing?0.5:1,transition:'all .15s'}}
              onMouseEnter={e=>{if(!advancing){e.target.style.background='rgba(20,184,166,.18)'}}}
              onMouseLeave={e=>{e.target.style.background='rgba(20,184,166,.08)'}}
            >
              {next} {'\u2192'}
            </button>
          )}
          {isAdvancingToWon&&(
            <button
              onClick={e=>{e.stopPropagation();if(onCreateContract){onCreateContract(lead,true)}else{onAdvance(lead.entity_id||lead.id,nextKey)}}}
              disabled={advancing}
              style={{fontSize:'0.62rem',fontWeight:700,color:'#059669',background:'rgba(5,150,105,.08)',border:'1px solid rgba(5,150,105,.25)',borderRadius:6,padding:'3px 10px',cursor:advancing?'wait':'pointer',opacity:advancing?0.5:1,transition:'all .15s'}}
              onMouseEnter={e=>{if(!advancing){e.target.style.background='rgba(5,150,105,.18)'}}}
              onMouseLeave={e=>{e.target.style.background='rgba(5,150,105,.08)'}}
            >
              Won {'\u2192'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main component ────────────────────────────────────── */
export default function Pipeline({openLead}){
  const [tab,setTab]=useState('Pipeline')
  const [stageFilter,setStageFilter]=useState('All')
  const [search,setSearch]=useState('')
  const [advancingId,setAdvancingId]=useState(null)
  const [contractOpp,setContractOpp]=useState(null)
  const [contractAdvanceAfter,setContractAdvanceAfter]=useState(false)
  const qc=useQueryClient()

  /* data */
  const {data:pipeData,isLoading:pipeLoading,error:pipeError}=useQuery({queryKey:['pipeline-leads'],queryFn:api.pipelineLeads,staleTime:30000})
  const {data:analytics}=useQuery({queryKey:['pipeline-analytics'],queryFn:api.pipelineAnalytics,staleTime:60000})

  const leads=useMemo(()=>{
    let list=Array.isArray(pipeData)?pipeData:(pipeData?.leads||[])
    if(stageFilter!=='All'){
      const key=STAGE_FILTER_MAP[stageFilter]
      if(key)list=list.filter(l=>l.stage===key)
    }
    if(search.trim()){
      const q=search.trim().toLowerCase()
      list=list.filter(l=>
        (l.company_name||'').toLowerCase().includes(q)||
        (l.name||'').toLowerCase().includes(q)||
        (l.contact_name||'').toLowerCase().includes(q)||
        (l.sector||'').toLowerCase().includes(q)||
        (l.borough||'').toLowerCase().includes(q)
      )
    }
    return list
  },[pipeData,stageFilter,search])

  const grouped=useMemo(()=>{
    const map={}
    STAGES.forEach(s=>map[s.key]=[])
    leads.forEach(l=>{
      if(map[l.stage])map[l.stage].push(l)
      else if(l.stage!=='won'){
        map.new.push(l)
      }
    })
    return map
  },[leads])

  /* analytics */
  const stats=analytics||{}
  const totalLeads=stats.total_leads??leads.length
  const activePipeline=stats.active_pipeline??leads.filter(l=>l.stage!=='won').length
  const pipelineValue=stats.pipeline_value??leads.reduce((s,l)=>s+(l.value||0),0)
  const wonValue=stats.won_value??0
  const winRate=stats.win_rate??0
  const overdueActions=stats.overdue_actions??0

  /* mutations */
  const advanceMut=useMutation({
    mutationFn:({id,stage})=>api.advanceLead(id,{new_status:stage}),
    onMutate:({id})=>setAdvancingId(id),
    onSuccess:(data,{stage})=>{
      if(stage==='quote_prepared'&&data?.quote_generated){
        // Auto-quote was generated — invalidate quotes too
        qc.invalidateQueries({queryKey:['quotes']})
        alert('Quote auto-generated with AI recommendations. Check the Quotes tab.')
      }
    },
    onSettled:()=>{setAdvancingId(null);qc.invalidateQueries({queryKey:['pipeline-leads']});qc.invalidateQueries({queryKey:['pipeline-analytics']})},
  })

  const handleAdvance=useCallback((id,stage)=>advanceMut.mutate({id,stage}),[advanceMut])
  const handleOpenLead=useCallback((id)=>{if(openLead)openLead(id)},[openLead])
  const handleCreateContract=useCallback((opp,advanceFirst)=>{
    setContractOpp(opp)
    setContractAdvanceAfter(!!advanceFirst)
  },[])
  const handleContractSuccess=useCallback(()=>{
    if(contractAdvanceAfter&&contractOpp){
      advanceMut.mutate({id:contractOpp.entity_id||contractOpp.id,stage:'won'})
    }
    qc.invalidateQueries({queryKey:['pipeline-leads']})
    qc.invalidateQueries({queryKey:['pipeline-analytics']})
  },[contractAdvanceAfter,contractOpp,advanceMut,qc])
  const handleContractClose=useCallback(()=>{setContractOpp(null);setContractAdvanceAfter(false)},[])

  /* loading / error */
  if(pipeLoading&&!pipeData)return(
    <div style={{padding:'80px 32px',textAlign:'center'}}>
      <Spinner/>
      <div style={{marginTop:16,color:'var(--text-muted)',fontSize:'0.85rem',fontWeight:500}}>Loading pipeline...</div>
    </div>
  )

  if(pipeError)return(
    <div style={{padding:'80px 32px',textAlign:'center'}}>
      <div style={{width:48,height:48,borderRadius:12,background:'rgba(220,38,38,.1)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem',marginBottom:12}}>!</div>
      <div style={{color:'#DC2626',fontSize:'0.95rem',fontWeight:700}}>Failed to load pipeline</div>
      <div style={{color:'var(--text-muted)',fontSize:'0.8rem',marginTop:6}}>{pipeError.message}</div>
      <button onClick={()=>qc.invalidateQueries({queryKey:['pipeline-leads']})} style={{marginTop:20,padding:'10px 24px',fontSize:'0.82rem',fontWeight:700,color:'#fff',background:'var(--teal)',border:'none',borderRadius:8,cursor:'pointer'}}>Retry</button>
    </div>
  )

  return(
    <div style={{padding:'28px 32px',maxWidth:1500,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:'1.6rem',fontWeight:800,letterSpacing:'-.03em',margin:0,color:'var(--text-1)'}}>Sales Pipeline</h1>
          <p style={{fontSize:'0.82rem',color:'var(--text-muted)',marginTop:4,fontWeight:500}}>
            {totalLeads.toLocaleString()} leads across {STAGES.length} stages
          </p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button style={{padding:'9px 20px',fontSize:'0.8rem',fontWeight:700,color:'var(--teal)',background:'rgba(20,184,166,.08)',border:'1px solid rgba(20,184,166,.3)',borderRadius:8,cursor:'pointer',transition:'all .15s'}}
            onMouseEnter={e=>e.target.style.background='rgba(20,184,166,.15)'}
            onMouseLeave={e=>e.target.style.background='rgba(20,184,166,.08)'}
          >
            Export
          </button>
          <button style={{padding:'9px 20px',fontSize:'0.8rem',fontWeight:700,color:'#fff',background:'var(--teal)',border:'none',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',gap:6,transition:'all .15s'}}
            onMouseEnter={e=>e.target.style.opacity='0.9'}
            onMouseLeave={e=>e.target.style.opacity='1'}
          >
            <span style={{fontSize:'1.1rem',lineHeight:1}}>+</span> New Lead
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div style={{display:'flex',gap:14,marginBottom:24,flexWrap:'wrap'}}>
        <KPI label="Total Leads" value={totalLeads.toLocaleString()} color="var(--teal)"/>
        <KPI label="Active Pipeline" value={activePipeline.toLocaleString()}/>
        <KPI label="Pipeline Value" value={fmtCurrency(pipelineValue)||'\u00A30'} color="#14B8A6" sub="Monthly potential"/>
        <KPI label="Won Value" value={fmtCurrency(wonValue)||'\u00A30'} color="#059669"/>
        <KPI label="Win Rate" value={winRate!=null?`${Math.round(winRate)}%`:'--'}/>
        <KPI label="Overdue" value={overdueActions} color={overdueActions>0?'#DC2626':'var(--text-1)'}/>
      </div>

      {/* Pipeline Velocity */}
      <VelocityBar leads={leads}/>

      {/* Tabs + Filters */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--border)',marginBottom:20,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',gap:0}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              padding:'10px 20px',fontSize:'0.82rem',fontWeight:tab===t?700:500,
              color:tab===t?'var(--teal)':'var(--text-muted)',background:'none',border:'none',
              borderBottom:tab===t?'2px solid var(--teal)':'2px solid transparent',
              cursor:'pointer',transition:'all .15s',letterSpacing:'-.01em'
            }}>{t}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',paddingBottom:8,flexWrap:'wrap'}}>
          {STAGE_FILTERS.map(f=>(
            <button key={f} onClick={()=>setStageFilter(f)} style={{
              padding:'5px 14px',fontSize:'0.72rem',fontWeight:stageFilter===f?700:500,
              color:stageFilter===f?'#fff':'var(--text-muted)',
              background:stageFilter===f?'var(--teal)':'transparent',
              border:'1px solid '+(stageFilter===f?'var(--teal)':'var(--border)'),
              borderRadius:20,cursor:'pointer',transition:'all .15s'
            }}>{f}</button>
          ))}
          <div style={{position:'relative'}}>
            <input
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={e=>setSearch(e.target.value)}
              style={{padding:'6px 14px 6px 32px',fontSize:'0.78rem',border:'1px solid var(--border)',borderRadius:20,background:'var(--bg-surface)',color:'var(--text-1)',outline:'none',width:180,transition:'border-color .15s'}}
              onFocus={e=>e.target.style.borderColor='var(--teal)'}
              onBlur={e=>e.target.style.borderColor='var(--border)'}
            />
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:'0.72rem',color:'var(--text-muted)',pointerEvents:'none'}}>{'\u{1F50D}'}</span>
          </div>
        </div>
      </div>

      {/* Tab content */}
      {tab==='Pipeline'&&<KanbanView leads={leads} grouped={grouped} onAdvance={handleAdvance} onClick={handleOpenLead} advancingId={advancingId} onCreateContract={handleCreateContract}/>}
      {tab==='List'&&<ListView leads={leads} onClick={handleOpenLead} onCreateContract={handleCreateContract}/>}
      {tab==='Activity'&&<ActivityView leads={leads} onClick={handleOpenLead}/>}

      {/* Won → Contract Modal */}
      {contractOpp&&<ContractModal opportunity={contractOpp} onClose={handleContractClose} onSuccess={handleContractSuccess}/>}
    </div>
  )
}

/* ── Kanban view ───────────────────────────────────────── */
function KanbanView({leads,grouped,onAdvance,onClick,advancingId,onCreateContract}){
  if(leads.length===0)return <EmptyState message="No leads in pipeline" sub="Add leads or run the AI shortlist to populate your pipeline"/>

  return(
    <div style={{display:'flex',gap:14,overflowX:'auto',paddingBottom:16,minHeight:500}}>
      {STAGES.map(stage=>{
        const items=grouped[stage.key]||[]
        const colValue=items.reduce((s,l)=>s+(l.value||l.estimated_monthly_value_gbp||0),0)
        return(
          <div key={stage.key} style={{minWidth:270,maxWidth:310,flex:'1 0 270px'}}>
            {/* Column header */}
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 16px',marginBottom:12,borderTop:`3px solid ${stage.color}`}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:'0.68rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',color:stage.color}}>{stage.label}</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  {colValue>0&&<span style={{fontSize:'0.6rem',fontWeight:600,color:'var(--text-muted)'}}>{fmtCurrency(colValue)}</span>}
                  <span style={{fontSize:'0.68rem',fontWeight:800,background:`${stage.color}15`,color:stage.color,borderRadius:8,padding:'2px 10px'}}>{items.length}</span>
                </div>
              </div>
              {colValue>0&&(
                <div style={{fontSize:'0.62rem',color:'var(--text-muted)',marginTop:4,fontWeight:500}}>{fmtCurrency(colValue)}/mo potential</div>
              )}
            </div>

            {/* Cards */}
            <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:'calc(100vh - 380px)',overflowY:'auto',paddingRight:2}}>
              {items.length===0&&(
                <div style={{padding:'32px 16px',textAlign:'center',fontSize:'0.72rem',color:'var(--text-muted)',border:'1px dashed rgba(100,116,139,.2)',borderRadius:10,background:'rgba(100,116,139,.02)'}}>
                  No leads at this stage
                </div>
              )}
              {items.slice(0,50).map(lead=>(
                <LeadCard
                  key={lead.entity_id||lead.id}
                  lead={lead}
                  onAdvance={onAdvance}
                  onClick={onClick}
                  advancing={advancingId===(lead.entity_id||lead.id)}
                  onCreateContract={onCreateContract}
                />
              ))}
              {items.length>50&&(
                <div style={{padding:'10px 16px',textAlign:'center',fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:600}}>
                  +{items.length-50} more leads
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── List view ─────────────────────────────────────────── */
function ListView({leads,onClick,onCreateContract}){
  if(leads.length===0)return <EmptyState message="No leads found" sub="Adjust your filters or add new leads"/>

  const thStyle={padding:'10px 14px',textAlign:'left',fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',borderBottom:'1px solid var(--border)',background:'var(--bg-surface)'}
  const tdStyle={padding:'12px 14px',fontSize:'0.8rem',borderBottom:'1px solid rgba(255,255,255,.03)'}

  return(
    <div style={{overflowX:'auto',borderRadius:10,border:'1px solid var(--border)'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={thStyle}>Company</th>
            <th style={thStyle}>Borough</th>
            <th style={thStyle}>Sector</th>
            <th style={thStyle}>Stage</th>
            <th style={thStyle}>Score</th>
            <th style={thStyle}>Value</th>
            <th style={thStyle}>Age</th>
            <th style={thStyle}>Updated</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {leads.slice(0,200).map(lead=>(
            <tr
              key={lead.entity_id||lead.id}
              onClick={()=>onClick(lead.entity_id||lead.id)}
              style={{cursor:'pointer',transition:'background .12s'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(20,184,166,.03)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            >
              <td style={tdStyle}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'rgba(20,184,166,.1)',color:'var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:800,flexShrink:0}}>
                    {initials(lead.company_name||lead.name)}
                  </div>
                  <div>
                    <div style={{fontWeight:600,fontSize:'0.82rem'}}>{lead.company_name||lead.name||'Unknown'}</div>
                    {lead.contact_name&&<div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:1}}>{lead.contact_name}</div>}
                  </div>
                </div>
              </td>
              <td style={{...tdStyle,fontSize:'0.75rem',color:'var(--text-muted)'}}>{lead.borough||'--'}</td>
              <td style={tdStyle}><SectorBadge sector={lead.sector}/></td>
              <td style={tdStyle}>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <FeasibilityDot lead={lead}/>
                  <StagePill stage={lead.stage}/>
                </div>
              </td>
              <td style={tdStyle}><ScoreBadge score={lead.total_score}/></td>
              <td style={{...tdStyle,fontWeight:600,color:'var(--teal)',fontSize:'0.8rem'}}>
                {fmtCurrency(lead.value||lead.estimated_monthly_value_gbp)||'--'}
                {lead.estimated_monthly_value_gbp!=null&&lead.estimated_monthly_value_gbp>0&&<div style={{fontSize:'0.6rem',fontWeight:600,color:'#8B5CF6'}}>~{'\u00A3'}{Number(lead.estimated_monthly_value_gbp).toLocaleString('en-GB',{maximumFractionDigits:0})}/mo</div>}
              </td>
              <td style={tdStyle}><DaysInStageBadge lead={lead}/></td>
              <td style={{...tdStyle,color:'var(--text-muted)',fontSize:'0.72rem'}}>{timeAgo(lead.updated_at||lead.last_touched_at)}</td>
              <td style={tdStyle}>
                {lead.stage==='won'&&onCreateContract&&(
                  <button
                    onClick={e=>{e.stopPropagation();onCreateContract(lead)}}
                    style={{fontSize:'0.62rem',fontWeight:700,color:'#059669',background:'rgba(5,150,105,.08)',border:'1px solid rgba(5,150,105,.25)',borderRadius:6,padding:'3px 10px',cursor:'pointer',whiteSpace:'nowrap'}}
                  >
                    Create Contract
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {leads.length>200&&<div style={{padding:'12px',textAlign:'center',fontSize:'0.75rem',color:'var(--text-muted)',borderTop:'1px solid var(--border)'}}>Showing 200 of {leads.length} leads</div>}
    </div>
  )
}

/* ── Activity view ─────────────────────────────────────── */
function ActivityView({leads,onClick}){
  const recent=useMemo(()=>{
    return [...leads]
      .filter(l=>l.updated_at||l.last_touched_at)
      .sort((a,b)=>new Date(b.updated_at||b.last_touched_at)-new Date(a.updated_at||a.last_touched_at))
      .slice(0,50)
  },[leads])

  if(recent.length===0)return <EmptyState message="No recent activity" sub="Activity will appear here as leads are updated"/>

  return(
    <div style={{borderRadius:10,border:'1px solid var(--border)',overflow:'hidden'}}>
      {recent.map((lead,i)=>{
        const stg=ALL_STAGES.find(s=>s.key===lead.stage)||{label:lead.stage,color:'#64748B'}
        return(
          <div
            key={lead.entity_id||lead.id||i}
            onClick={()=>onClick(lead.entity_id||lead.id)}
            style={{display:'flex',gap:14,alignItems:'center',padding:'14px 18px',borderBottom:i<recent.length-1?'1px solid rgba(255,255,255,.03)':'none',cursor:'pointer',transition:'background .12s'}}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(20,184,166,.03)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={{width:36,height:36,borderRadius:8,background:`${stg.color}15`,color:stg.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.68rem',fontWeight:800,flexShrink:0}}>
              {initials(lead.company_name||lead.name)}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'0.82rem',fontWeight:600,color:'var(--text-1)'}}>{lead.company_name||lead.name||'Unknown'}</div>
              <div style={{display:'flex',gap:6,alignItems:'center',marginTop:3,flexWrap:'wrap'}}>
                {lead.contact_name&&<span style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>{lead.contact_name}</span>}
                <StagePill stage={lead.stage}/>
                <SectorBadge sector={lead.sector}/>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:4}}>
                <FeasibilityDot lead={lead}/>
                <ScoreBadge score={lead.total_score}/>
              </div>
              <DaysInStageBadge lead={lead}/>
              <span style={{fontSize:'0.65rem',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{timeAgo(lead.updated_at||lead.last_touched_at)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Empty state ───────────────────────────────────────── */
function EmptyState({message,sub}){
  return(
    <div style={{padding:'80px 20px',textAlign:'center'}}>
      <div style={{width:56,height:56,borderRadius:14,background:'rgba(20,184,166,.08)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem',marginBottom:16,opacity:0.6}}>{'\u{1F4CB}'}</div>
      <div style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)',marginBottom:6}}>{message}</div>
      {sub&&<div style={{fontSize:'0.82rem',color:'var(--text-muted)',maxWidth:320,margin:'0 auto'}}>{sub}</div>}
    </div>
  )
}
