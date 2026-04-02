import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api} from '../api'

const TYPES={
  new_business:{label:'New Business',color:'#10b981',icon:'🏢'},
  expansion:{label:'Expansion',color:'#3b82f6',icon:'📈'},
  risk:{label:'Risk',color:'#ef4444',icon:'⚠️'},
  renewal:{label:'Renewal',color:'#f59e0b',icon:'🔄'},
  competitor:{label:'Competitor',color:'#8b5cf6',icon:'🎯'},
  planning:{label:'Planning',color:'#06b6d4',icon:'🏗️'},
  contract:{label:'Contract',color:'#10b981',icon:'📋'},
  news:{label:'News',color:'#6366f1',icon:'📰'},
}

export default function Signals({openLead}){
  const [filter,setFilter]=useState('')
  const {data:signalsRaw,isLoading}=useQuery({queryKey:['signals',filter],queryFn:()=>api.signals(filter||undefined)})
  const signals=Array.isArray(signalsRaw)?signalsRaw:(signalsRaw?.signals||[])

  const now=new Date()
  const weekAgo=new Date(now.getTime()-7*86400000)
  const thisWeek=signals.filter(s=>s.created_at&&new Date(s.created_at)>weekAgo)
  const highPriority=signals.filter(s=>(s.score_impact||0)>=10||(s.priority==='high'))
  const acted=signals.filter(s=>s.acted||s.resolved)

  const types=Object.keys(TYPES)

  return(
    <div style={{padding:'28px 36px',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}>
        <span style={{background:'#6366f1',color:'white',fontSize:'0.65rem',fontWeight:700,padding:'3px 10px',borderRadius:4,textTransform:'uppercase'}}>Intelligence</span>
        <h1 style={{fontSize:'1.35rem',fontWeight:800,color:'var(--text-1)',margin:0}}>Market Signals</h1>
        <span style={{fontSize:'0.75rem',color:'var(--text-muted)',marginLeft:8}}>AI-detected business intelligence</span>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        <KPI label="Total Signals" value={signals.length} color="var(--teal)"/>
        <KPI label="This Week" value={thisWeek.length} color="#3b82f6"/>
        <KPI label="High Priority" value={highPriority.length} color={highPriority.length>0?'#ef4444':'var(--text-muted)'}/>
        <KPI label="Acted On" value={acted.length} color="#10b981"/>
      </div>

      {/* Type Filters */}
      <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
        <button onClick={()=>setFilter('')} style={pillStyle(filter==='')}>All ({signals.length})</button>
        {types.map(t=>{
          const count=signals.filter(s=>(s.signal_type||s.type)===t).length
          return <button key={t} onClick={()=>setFilter(t)} style={{...pillStyle(filter===t),borderColor:filter===t?TYPES[t].color:'var(--border)',color:filter===t?'white':'var(--text-muted)',background:filter===t?TYPES[t].color:'transparent'}}>
            {TYPES[t].icon} {TYPES[t].label} {count>0&&`(${count})`}
          </button>
        })}
      </div>

      {/* Signals */}
      {isLoading?(
        <div style={{textAlign:'center',padding:60,color:'var(--text-muted)'}}>Loading signals...</div>
      ):signals.length===0?(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:60,textAlign:'center'}}>
          <div style={{fontSize:'2.5rem',marginBottom:12}}>📡</div>
          <div style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)'}}>No signals detected</div>
          <div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginTop:8}}>The AI engine continuously scans for business opportunities, risks, and market changes. Signals will appear here as they're detected.</div>
        </div>
      ):(
        <div style={{display:'grid',gap:12}}>
          {signals.map((s,i)=>{
            const type=TYPES[s.signal_type||s.type]||{label:s.signal_type||'Signal',color:'#6b7280',icon:'📌'}
            return(
              <div key={s.id||i} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 22px',display:'flex',justifyContent:'space-between',alignItems:'flex-start',transition:'border-color 0.15s',cursor:'pointer'}}
                onClick={()=>s.entity_id&&openLead(s.entity_id)}
                onMouseOver={e=>e.currentTarget.style.borderColor=type.color}
                onMouseOut={e=>e.currentTarget.style.borderColor='var(--border)'}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <span style={{padding:'3px 10px',borderRadius:12,fontSize:'0.7rem',fontWeight:700,color:type.color,background:type.color+'18'}}>{type.icon} {type.label}</span>
                    {s.score_impact>0&&<span style={{fontSize:'0.7rem',color:'#10b981',fontWeight:600}}>+{s.score_impact} score impact</span>}
                    {s.acted&&<span style={{fontSize:'0.65rem',color:'#10b981',fontWeight:600}}>✓ Acted</span>}
                  </div>
                  <div style={{fontSize:'0.95rem',fontWeight:700,color:'var(--text-1)',marginBottom:4}}>{s.entity_name||s.name||'Unknown Entity'}</div>
                  <div style={{fontSize:'0.82rem',color:'var(--text-muted)',lineHeight:1.5}}>{s.title||s.description||'Signal detected'}</div>
                  {s.description&&s.title&&<div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:4,opacity:0.8}}>{s.description}</div>}
                </div>
                <div style={{textAlign:'right',marginLeft:16,flexShrink:0}}>
                  <div style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{s.created_at?timeAgo(new Date(s.created_at)):'—'}</div>
                  {s.entity_id&&<div style={{marginTop:8,fontSize:'0.75rem',color:'var(--teal)',fontWeight:600}}>View Lead →</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function timeAgo(d){
  const s=Math.floor((Date.now()-d)/1000)
  if(s<60)return 'just now'
  if(s<3600)return Math.floor(s/60)+'m ago'
  if(s<86400)return Math.floor(s/3600)+'h ago'
  if(s<604800)return Math.floor(s/86400)+'d ago'
  return d.toLocaleDateString()
}

function KPI({label,value,color}){
  return(
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
      <div style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:'1.5rem',fontWeight:800,color:color||'var(--text-1)'}}>{value}</div>
    </div>
  )
}

function pillStyle(active){
  return{padding:'6px 14px',borderRadius:20,border:active?'none':'1px solid var(--border)',background:active?'var(--teal)':'transparent',color:active?'white':'var(--text-muted)',fontSize:'0.78rem',fontWeight:600,cursor:'pointer'}
}
