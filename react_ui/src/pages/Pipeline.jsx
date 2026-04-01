import {useState,useMemo,useCallback} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import Spinner from '../components/Spinner'

/* ── constants ─────────────────────────────────────────── */
const STAGES=[
  {key:'outreach_queue',label:'Outreach Queue',color:'#94A3B8'},
  {key:'new',label:'New',color:'#3B82F6'},
  {key:'contacted',label:'Contacted',color:'#8B5CF6'},
  {key:'qualified',label:'Qualified',color:'#F59E0B'},
  {key:'quote_sent',label:'Quote Sent',color:'#EC4899'},
  {key:'negotiating',label:'Negotiating',color:'#EF4444'},
]
const WON_STAGE={key:'won',label:'Won',color:'#059669'}
const ALL_STAGES=[...STAGES,WON_STAGE]

const STAGE_FILTERS=['All','New','Qualified','Quote Sent','Negotiating','Won']
const STAGE_FILTER_MAP={'New':'new','Qualified':'qualified','Quote Sent':'quote_sent','Negotiating':'negotiating','Won':'won'}

const TABS=['Pipeline','List','Activity']

const SECTOR_COLORS={
  Office:      {bg:'#EFF6FF',color:'#2563EB'},
  School:      {bg:'#FEF3C7',color:'#D97706'},
  Residential: {bg:'#ECFDF5',color:'#059669'},
  Medical:     {bg:'#FDF2F8',color:'#DB2777'},
  Retail:      {bg:'#F5F3FF',color:'#7C3AED'},
  Industrial:  {bg:'#FFF7ED',color:'#EA580C'},
  Hospitality: {bg:'#F0FDFA',color:'#0D9488'},
  Government:  {bg:'#F1F5F9',color:'#475569'},
}
const DEFAULT_SECTOR={bg:'#F1F5F9',color:'#64748B'}

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
  if(!name)return '??'
  const parts=name.trim().split(/\s+/)
  if(parts.length===1)return parts[0].slice(0,2).toUpperCase()
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase()
}

function fmtCurrency(v){
  if(v==null)return '\u00A30'
  return '\u00A3'+Number(v).toLocaleString('en-GB',{maximumFractionDigits:0})
}

function nextStageLabel(stage){
  const idx=STAGES.findIndex(s=>s.key===stage)
  if(idx<0||idx>=STAGES.length-1)return null
  const next=STAGES[idx+1]||WON_STAGE
  return next.label
}

function nextStageKey(stage){
  const order=ALL_STAGES.map(s=>s.key)
  const idx=order.indexOf(stage)
  if(idx<0||idx>=order.length-1)return null
  return order[idx+1]
}

/* ── styles ────────────────────────────────────────────── */
const kpiCard={flex:1,minWidth:140,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}
const kpiLabel={fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}
const kpiValue={fontSize:'1.4rem',fontWeight:800,letterSpacing:'-.02em'}
const tabBtn=(active)=>({padding:'8px 18px',fontSize:'0.8rem',fontWeight:active?700:500,color:active?'var(--teal)':'var(--text-muted)',background:'none',border:'none',borderBottom:active?'2px solid var(--teal)':'2px solid transparent',cursor:'pointer',transition:'all .15s'})
const filterBtn=(active)=>({padding:'5px 14px',fontSize:'0.75rem',fontWeight:active?700:500,color:active?'#fff':'var(--text-muted)',background:active?'var(--teal)':'var(--bg-surface)',border:'1px solid '+(active?'var(--teal)':'var(--border)'),borderRadius:20,cursor:'pointer',transition:'all .15s'})
const colHeader=(color)=>({fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color,display:'flex',alignItems:'center',gap:8,marginBottom:12})
const cardStyle={background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'14px 16px',cursor:'pointer',transition:'box-shadow .15s, border-color .15s'}
const avatarStyle=(color)=>({width:36,height:36,borderRadius:'50%',background:color||'var(--teal)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:800,flexShrink:0})
const thStyle={padding:'10px 14px',textAlign:'left',fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',borderBottom:'1px solid var(--border)'}
const tdStyle={padding:'10px 14px',fontSize:'0.8rem',borderBottom:'1px solid var(--border)'}

/* ── KPI component ─────────────────────────────────────── */
function KPI({label,value,color}){
  return(
    <div style={kpiCard}>
      <div style={kpiLabel}>{label}</div>
      <div style={{...kpiValue,color:color||'var(--text-1)'}}>{value}</div>
    </div>
  )
}

/* ── Sector badge ──────────────────────────────────────── */
function SectorBadge({sector}){
  if(!sector)return null
  const s=SECTOR_COLORS[sector]||DEFAULT_SECTOR
  return <span style={{background:s.bg,color:s.color,fontSize:'0.65rem',fontWeight:700,padding:'2px 8px',borderRadius:10,whiteSpace:'nowrap'}}>{sector}</span>
}

/* ── Stage pill ────────────────────────────────────────── */
function StagePill({stage}){
  const s=ALL_STAGES.find(st=>st.key===stage)||{label:stage,color:'#64748B'}
  return <span style={{background:s.color+'18',color:s.color,fontSize:'0.65rem',fontWeight:700,padding:'2px 10px',borderRadius:10,whiteSpace:'nowrap'}}>{s.label}</span>
}

/* ── Lead card (Kanban) ────────────────────────────────── */
function LeadCard({lead,onAdvance,onClick,advancing}){
  const stg=STAGES.find(s=>s.key===lead.stage)||STAGES[0]
  const next=nextStageLabel(lead.stage)
  const nextKey=nextStageKey(lead.stage)

  return(
    <div
      style={cardStyle}
      onClick={()=>onClick(lead.entity_id||lead.id)}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--teal)';e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,.08)'}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.boxShadow='none'}}
    >
      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
        <div style={avatarStyle(stg.color)}>{initials(lead.company_name||lead.name)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:'0.82rem',fontWeight:700,color:'var(--text-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.company_name||lead.name||'Unknown'}</div>
          {lead.contact_name&&<div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:2}}>{lead.contact_name}</div>}
          <div style={{display:'flex',gap:6,alignItems:'center',marginTop:6,flexWrap:'wrap'}}>
            <SectorBadge sector={lead.sector}/>
            {lead.value!=null&&lead.value>0&&<span style={{fontSize:'0.65rem',fontWeight:700,color:'var(--teal)'}}>{fmtCurrency(lead.value)}</span>}
          </div>
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}>
        <span style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>{timeAgo(lead.updated_at||lead.created_at)}</span>
        {next&&nextKey&&(
          <button
            onClick={e=>{e.stopPropagation();onAdvance(lead.entity_id||lead.id,nextKey)}}
            disabled={advancing}
            style={{fontSize:'0.65rem',fontWeight:700,color:'var(--teal)',background:'none',border:'1px solid var(--teal)',borderRadius:4,padding:'3px 10px',cursor:advancing?'wait':'pointer',opacity:advancing?0.5:1,transition:'all .15s'}}
          >
            {next} &rarr;
          </button>
        )}
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
  const qc=useQueryClient()

  /* data */
  const {data:pipeData,isLoading:pipeLoading,error:pipeError}=useQuery({queryKey:['pipeline-leads'],queryFn:api.pipelineLeads,staleTime:30000})
  const {data:analytics,isLoading:analyticsLoading}=useQuery({queryKey:['pipeline-analytics'],queryFn:api.pipelineAnalytics,staleTime:60000})

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
        (l.sector||'').toLowerCase().includes(q)
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
        // default unknown stages to outreach_queue
        map.outreach_queue.push(l)
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
    mutationFn:({id,stage})=>api.advanceLead(id,{stage}),
    onMutate:({id})=>setAdvancingId(id),
    onSettled:()=>{setAdvancingId(null);qc.invalidateQueries({queryKey:['pipeline-leads']});qc.invalidateQueries({queryKey:['pipeline-analytics']})},
  })

  const handleAdvance=useCallback((id,stage)=>{
    advanceMut.mutate({id,stage})
  },[advanceMut])

  const handleOpenLead=useCallback((id)=>{
    if(openLead)openLead(id)
  },[openLead])

  /* loading / error */
  if(pipeLoading&&!pipeData)return <div style={{padding:'60px 32px',textAlign:'center'}}><Spinner/><div style={{marginTop:12,color:'var(--text-muted)',fontSize:'0.85rem'}}>Loading pipeline...</div></div>

  if(pipeError)return(
    <div style={{padding:'60px 32px',textAlign:'center'}}>
      <div style={{fontSize:'2rem',marginBottom:8}}>!</div>
      <div style={{color:'#DC2626',fontSize:'0.9rem',fontWeight:600}}>Failed to load pipeline</div>
      <div style={{color:'var(--text-muted)',fontSize:'0.8rem',marginTop:4}}>{pipeError.message}</div>
      <button onClick={()=>qc.invalidateQueries({queryKey:['pipeline-leads']})} style={{marginTop:16,padding:'8px 20px',fontSize:'0.8rem',fontWeight:600,color:'#fff',background:'var(--teal)',border:'none',borderRadius:'var(--r-sm)',cursor:'pointer'}}>Retry</button>
    </div>
  )

  return(
    <div style={{padding:'28px 32px',maxWidth:1400,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-.02em',margin:0}}>Pipeline</h1>
          <p style={{fontSize:'0.875rem',color:'var(--text-muted)',marginTop:4}}>Track and manage leads through your sales pipeline</p>
        </div>
        <button
          style={{padding:'9px 20px',fontSize:'0.8rem',fontWeight:700,color:'#fff',background:'var(--teal)',border:'none',borderRadius:'var(--r-sm)',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}
        >
          <span style={{fontSize:'1rem',lineHeight:1}}>+</span> New Lead
        </button>
      </div>

      {/* KPI Bar */}
      <div style={{display:'flex',gap:14,marginBottom:24,flexWrap:'wrap'}}>
        <KPI label="Total Leads" value={totalLeads} color="var(--teal)"/>
        <KPI label="Active Pipeline" value={activePipeline}/>
        <KPI label="Pipeline Value" value={fmtCurrency(pipelineValue)} color="var(--teal)"/>
        <KPI label="Won Value" value={fmtCurrency(wonValue)} color="#059669"/>
        <KPI label="Win Rate" value={winRate!=null?`${Math.round(winRate)}%`:'--'}/>
        <KPI label="Overdue Actions" value={overdueActions} color={overdueActions>0?'#DC2626':'var(--text-1)'}/>
      </div>

      {/* Tabs + Filters */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--border)',marginBottom:20,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',gap:0}}>
          {TABS.map(t=><button key={t} onClick={()=>setTab(t)} style={tabBtn(tab===t)}>{t}</button>)}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',paddingBottom:8,flexWrap:'wrap'}}>
          {STAGE_FILTERS.map(f=><button key={f} onClick={()=>setStageFilter(f)} style={filterBtn(stageFilter===f)}>{f}</button>)}
          <input
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{padding:'6px 14px',fontSize:'0.78rem',border:'1px solid var(--border)',borderRadius:20,background:'var(--bg-surface)',color:'var(--text-1)',outline:'none',width:180,transition:'border-color .15s'}}
            onFocus={e=>e.target.style.borderColor='var(--teal)'}
            onBlur={e=>e.target.style.borderColor='var(--border)'}
          />
        </div>
      </div>

      {/* Tab content */}
      {tab==='Pipeline'&&<KanbanView leads={leads} grouped={grouped} onAdvance={handleAdvance} onClick={handleOpenLead} advancingId={advancingId}/>}
      {tab==='List'&&<ListView leads={leads} onClick={handleOpenLead}/>}
      {tab==='Activity'&&<ActivityView leads={leads} onClick={handleOpenLead}/>}
    </div>
  )
}

/* ── Kanban view ───────────────────────────────────────── */
function KanbanView({leads,grouped,onAdvance,onClick,advancingId}){
  if(leads.length===0)return <EmptyState message="No leads in pipeline" sub="Add leads to start tracking your sales pipeline"/>

  return(
    <div style={{display:'flex',gap:14,overflowX:'auto',paddingBottom:16,minHeight:400}}>
      {STAGES.map(stage=>{
        const items=grouped[stage.key]||[]
        return(
          <div key={stage.key} style={{minWidth:260,maxWidth:300,flex:'1 0 260px'}}>
            <div style={colHeader(stage.color)}>
              <span style={{width:8,height:8,borderRadius:'50%',background:stage.color,flexShrink:0}}/>
              {stage.label}
              <span style={{fontSize:'0.65rem',fontWeight:800,background:stage.color+'20',color:stage.color,borderRadius:10,padding:'1px 8px',marginLeft:'auto'}}>{items.length}</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {items.length===0&&(
                <div style={{padding:'24px 16px',textAlign:'center',fontSize:'0.75rem',color:'var(--text-muted)',border:'1px dashed var(--border)',borderRadius:'var(--r-sm)'}}>
                  No leads
                </div>
              )}
              {items.map(lead=>(
                <LeadCard
                  key={lead.entity_id||lead.id}
                  lead={lead}
                  onAdvance={onAdvance}
                  onClick={onClick}
                  advancing={advancingId===(lead.entity_id||lead.id)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── List view ─────────────────────────────────────────── */
function ListView({leads,onClick}){
  if(leads.length===0)return <EmptyState message="No leads found" sub="Adjust your filters or add new leads"/>

  return(
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
        <thead>
          <tr>
            <th style={thStyle}>Company</th>
            <th style={thStyle}>Contact</th>
            <th style={thStyle}>Sector</th>
            <th style={thStyle}>Stage</th>
            <th style={thStyle}>Value</th>
            <th style={thStyle}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead=>(
            <tr
              key={lead.entity_id||lead.id}
              onClick={()=>onClick(lead.entity_id||lead.id)}
              style={{cursor:'pointer',transition:'background .12s'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--bg-surface)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            >
              <td style={tdStyle}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={avatarStyle('var(--teal)')}>{initials(lead.company_name||lead.name)}</div>
                  <span style={{fontWeight:600}}>{lead.company_name||lead.name||'Unknown'}</span>
                </div>
              </td>
              <td style={tdStyle}>{lead.contact_name||'--'}</td>
              <td style={tdStyle}><SectorBadge sector={lead.sector}/></td>
              <td style={tdStyle}><StagePill stage={lead.stage}/></td>
              <td style={{...tdStyle,fontWeight:600,color:'var(--teal)'}}>{lead.value?fmtCurrency(lead.value):'--'}</td>
              <td style={{...tdStyle,color:'var(--text-muted)',fontSize:'0.75rem'}}>{timeAgo(lead.updated_at||lead.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Activity view ─────────────────────────────────────── */
function ActivityView({leads,onClick}){
  const recent=useMemo(()=>{
    return [...leads]
      .filter(l=>l.updated_at||l.created_at)
      .sort((a,b)=>new Date(b.updated_at||b.created_at)-new Date(a.updated_at||a.created_at))
      .slice(0,50)
  },[leads])

  if(recent.length===0)return <EmptyState message="No recent activity" sub="Activity will appear here as leads are updated"/>

  return(
    <div style={{display:'flex',flexDirection:'column',gap:0}}>
      {recent.map((lead,i)=>{
        const stg=ALL_STAGES.find(s=>s.key===lead.stage)||{label:lead.stage,color:'#64748B'}
        return(
          <div
            key={lead.entity_id||lead.id||i}
            onClick={()=>onClick(lead.entity_id||lead.id)}
            style={{display:'flex',gap:14,alignItems:'center',padding:'14px 16px',borderBottom:'1px solid var(--border)',cursor:'pointer',transition:'background .12s'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--bg-surface)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={avatarStyle(stg.color)}>{initials(lead.company_name||lead.name)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'0.82rem',fontWeight:600,color:'var(--text-1)'}}>{lead.company_name||lead.name||'Unknown'}</div>
              <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:2}}>
                {lead.contact_name&&<span>{lead.contact_name} &middot; </span>}
                <StagePill stage={lead.stage}/>
                {lead.sector&&<span> &middot; <SectorBadge sector={lead.sector}/></span>}
              </div>
            </div>
            <div style={{fontSize:'0.7rem',color:'var(--text-muted)',whiteSpace:'nowrap',flexShrink:0}}>{timeAgo(lead.updated_at||lead.created_at)}</div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Empty state ───────────────────────────────────────── */
function EmptyState({message,sub}){
  return(
    <div style={{padding:'60px 20px',textAlign:'center'}}>
      <div style={{fontSize:'2.5rem',marginBottom:8,opacity:0.3}}>&#9744;</div>
      <div style={{fontSize:'0.95rem',fontWeight:600,color:'var(--text-1)',marginBottom:4}}>{message}</div>
      {sub&&<div style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>{sub}</div>}
    </div>
  )
}
