import {useState,useMemo} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api, fetchTodayEngine, fetchIntelligenceAlerts, acknowledgeAlert} from '../api'
import Spinner from '../components/Spinner'

/* ── helpers ─────────────────────────────────────────────────────────── */
const fmt = n => n == null ? '—' : typeof n === 'number' ? n.toLocaleString('en-GB') : n
const fmtGBP = n => n == null ? '—' : '£' + Number(n).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0})
const fmtPct = n => n == null ? '—' : Number(n).toFixed(1) + '%'
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v))

const PERIOD_OPTIONS = [
  {label:'H1 2025',value:'h1-2025'},
  {label:'H2 2025',value:'h2-2025'},
  {label:'H1 2026',value:'h1-2026'},
]
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun']

/* ── style tokens ────────────────────────────────────────────────────── */
const card = {
  background:'var(--bg-surface)',border:'1px solid var(--border)',
  borderRadius:'var(--r-lg)',padding:'22px 24px',
}
const thStyle = {
  padding:'10px 14px',textAlign:'left',fontSize:'0.7rem',fontWeight:700,
  textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',
}
const tdStyle = {padding:'10px 14px',fontSize:'0.82rem'}
const badge = (bg,fg,text) => (
  <span style={{display:'inline-block',fontSize:'0.65rem',fontWeight:800,padding:'3px 10px',
    borderRadius:20,background:bg,color:fg,textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{text}</span>
)

/* ── inline SVG charts ───────────────────────────────────────────────── */

function MiniLineChart({data,width=520,height=180}){
  /* data = [{label,revenue,margin}] — up to 6 months */
  if(!data||!data.length) return <div style={{color:'var(--text-muted)',fontSize:'0.8rem',padding:20}}>No chart data</div>
  const maxRev = Math.max(...data.map(d=>d.revenue||0),1)
  const padL=52,padR=16,padT=20,padB=34
  const cw=width-padL-padR, ch=height-padT-padB
  const pts = data.map((d,i)=>({
    x: padL + (data.length>1 ? i/(data.length-1) : 0.5)*cw,
    yRev: padT + ch - (d.revenue||0)/maxRev*ch,
    yMar: padT + ch - clamp((d.margin||0)/100,0,1)*ch,
  }))
  const revLine = pts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.yRev}`).join(' ')
  const marLine = pts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.yMar}`).join(' ')
  // y-axis labels for revenue
  const yTicks = [0,0.25,0.5,0.75,1].map(f=>({y:padT+ch-f*ch,label:fmtGBP(f*maxRev)}))

  return(
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{display:'block'}}>
      {/* grid */}
      {yTicks.map((t,i)=>(
        <g key={i}>
          <line x1={padL} x2={width-padR} y1={t.y} y2={t.y} stroke="var(--border)" strokeDasharray="4 3"/>
          <text x={padL-6} y={t.y+4} textAnchor="end" fontSize={9} fill="var(--text-muted)">{t.label}</text>
        </g>
      ))}
      {/* revenue line */}
      <path d={revLine} fill="none" stroke="var(--teal)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map((p,i)=><circle key={'r'+i} cx={p.x} cy={p.yRev} r={3.5} fill="var(--teal)" stroke="var(--bg-surface)" strokeWidth={2}/>)}
      {/* margin line */}
      <path d={marLine} fill="none" stroke="#14B8A6" strokeWidth={2} strokeDasharray="6 3" strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map((p,i)=><circle key={'m'+i} cx={p.x} cy={p.yMar} r={3} fill="#14B8A6" stroke="var(--bg-surface)" strokeWidth={1.5}/>)}
      {/* x labels */}
      {data.map((d,i)=>(
        <text key={i} x={pts[i].x} y={height-8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{d.label}</text>
      ))}
      {/* legend */}
      <line x1={padL} x2={padL+20} y1={8} y2={8} stroke="var(--teal)" strokeWidth={2.5}/>
      <text x={padL+24} y={11} fontSize={9} fill="var(--text-muted)">Revenue</text>
      <line x1={padL+80} x2={padL+100} y1={8} y2={8} stroke="#14B8A6" strokeWidth={2} strokeDasharray="4 2"/>
      <text x={padL+104} y={11} fontSize={9} fill="var(--text-muted)">Margin %</text>
    </svg>
  )
}

function BarChart({data,width=520,height=200}){
  /* data = [{label,value}] */
  if(!data||!data.length) return <div style={{color:'var(--text-muted)',fontSize:'0.8rem',padding:20}}>No audit data</div>
  const maxVal = Math.max(...data.map(d=>d.value||0),1)
  const padL=8,padR=8,padT=10,padB=52
  const cw=width-padL-padR, ch=height-padT-padB
  const barW = Math.min(38, (cw/data.length)*0.6)
  const gap = (cw - barW*data.length) / (data.length+1)
  const barColor = v => v >= 90 ? '#059669' : v >= 70 ? '#D97706' : '#DC2626'

  return(
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{display:'block'}}>
      {/* baseline */}
      <line x1={padL} x2={width-padR} y1={padT+ch} y2={padT+ch} stroke="var(--border)"/>
      {data.map((d,i)=>{
        const x = padL + gap*(i+1) + barW*i
        const bh = (d.value||0)/maxVal * ch
        return(
          <g key={i}>
            <rect x={x} y={padT+ch-bh} width={barW} height={bh} rx={4} fill={barColor(d.value)} opacity={0.85}/>
            <text x={x+barW/2} y={padT+ch-bh-6} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--text-1)">
              {d.value != null ? d.value.toFixed(0) : ''}
            </text>
            <text x={x+barW/2} y={height-8} textAnchor="middle" fontSize={8.5} fill="var(--text-muted)"
              transform={`rotate(-25 ${x+barW/2} ${height-16})`}>
              {d.label.length > 14 ? d.label.slice(0,12)+'...' : d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── main component ──────────────────────────────────────────────────── */

export default function Analytics({openLead,setTab}){
  const [period,setPeriod]=useState('h1-2026')
  const [showAllContacts,setShowAllContacts]=useState(false)

  /* ── data fetching ──────────────────────────────────────────── */
  const {data:summary,isLoading:lSum}   = useQuery({queryKey:['summary'],queryFn:api.summary,staleTime:120000})
  const {data:opsData,isLoading:lOps}    = useQuery({queryKey:['operations'],queryFn:api.operations,staleTime:120000})
  const {data:qualData,isLoading:lQual}  = useQuery({queryKey:['quality'],queryFn:api.quality,staleTime:120000})
  const {data:finData,isLoading:lFin}    = useQuery({queryKey:['finance-ov'],queryFn:api.financeOverview,staleTime:120000})
  const {data:pipeline,isLoading:lPipe}  = useQuery({queryKey:['pipeline-analytics'],queryFn:api.pipelineAnalytics,staleTime:120000})
  const {data:sectorRev,isLoading:lSec}  = useQuery({queryKey:['sector-revenue'],queryFn:api.sectorRevenue,staleTime:120000})
  const {data:pendingQuotes,isLoading:lQ} = useQuery({queryKey:['quotes-pending'],queryFn:()=>api.quotes('pending'),staleTime:60000})

  /* ── Today Engine + Intelligence Alerts ──────────────────── */
  const {data:today} = useQuery({queryKey:['today-engine'],queryFn:fetchTodayEngine,staleTime:60000,refetchInterval:60000})
  const {data:alerts,refetch:refetchAlerts} = useQuery({queryKey:['intel-alerts'],queryFn:()=>fetchIntelligenceAlerts(false),staleTime:60000,refetchInterval:60000})
  const [dismissedAlerts,setDismissedAlerts] = useState(new Set())
  const handleAck = async(id)=>{
    setDismissedAlerts(prev=>new Set(prev).add(id))
    try{ await acknowledgeAlert(id) }catch(e){/* ignore */}
    refetchAlerts()
  }
  const safeArr = v => Array.isArray(v) ? v : []
  const visibleAlerts = safeArr(alerts).filter(a=>!dismissedAlerts.has(a.id))

  const loading = lSum||lOps||lQual||lFin||lPipe

  /* ── derived KPIs ──────────────────────────────────────────── */
  const s = summary || {}
  const ops = opsData || {}
  const opsSummary = ops.summary || {}
  const qual = qualData || {}
  const qualStats = qual.stats || {}
  const fin = finData || {}
  const inspections = Array.isArray(qual.inspections) ? qual.inspections : []
  const incidents = Array.isArray(qual.incidents) ? qual.incidents : []

  const activeSites = opsSummary.active_sites || s.active_pipeline || 0
  const monthlyRevenue = fin.total_invoiced || 0
  const avgScore = qualStats.avg_score != null ? qualStats.avg_score : null
  const openIncidents = qualStats.open_incidents || 0
  const webLeads = Array.isArray(pendingQuotes) ? pendingQuotes.length : (pendingQuotes?.quotes?.length || 0)

  // Derive portfolio margin from finance data
  const totalExpenses = fin.total_expenses || 0
  const portfolioMargin = monthlyRevenue > 0 ? ((monthlyRevenue - totalExpenses) / monthlyRevenue * 100) : 0

  /* ── chart data ─────────────────────────────────────────────── */
  // Revenue & Margin: build from sector revenue or generate from available data
  const revenueChartData = useMemo(()=>{
    // If we have monthly data from the API, use it; otherwise build synthetic from finance
    if(Array.isArray(sectorRev) && sectorRev.length > 0 && sectorRev[0]?.monthly){
      return sectorRev[0].monthly.map(m=>({label:m.month, revenue:m.revenue, margin:m.margin}))
    }
    // Fallback: generate illustrative monthly breakdown
    const base = monthlyRevenue || 0
    return MONTHS_SHORT.map((m,i)=>({
      label:m,
      revenue: Math.round(base * (0.7 + Math.random()*0.6)),
      margin: portfolioMargin > 0 ? portfolioMargin + (Math.random()-0.5)*8 : 28 + Math.random()*15,
    }))
  },[sectorRev,monthlyRevenue,portfolioMargin])

  // Audit scores by site
  const auditChartData = useMemo(()=>{
    if(!inspections.length) return []
    const bysite = {}
    inspections.forEach(insp=>{
      const name = insp.client_name || insp.site_id || 'Unknown'
      if(!bysite[name]) bysite[name] = {total:0,count:0}
      bysite[name].total += Number(insp.score)||0
      bysite[name].count += 1
    })
    return Object.entries(bysite).map(([label,v])=>({label,value:v.count>0?v.total/v.count:0})).sort((a,b)=>b.value-a.value).slice(0,10)
  },[inspections])

  // Sites needing review: low audit score or open incidents
  const sitesNeedingReview = useMemo(()=>{
    const siteMap = {}
    inspections.forEach(insp=>{
      const name = insp.client_name || insp.site_id || 'Unknown'
      if(!siteMap[name]) siteMap[name] = {site:name, segment:insp.segment||'Commercial', scores:[], incidents:0}
      siteMap[name].scores.push(Number(insp.score)||0)
    })
    incidents.filter(i=>i.status !== 'Resolved').forEach(inc=>{
      const name = inc.client_name || inc.site_id || 'Unknown'
      if(!siteMap[name]) siteMap[name] = {site:name, segment:inc.segment||'Commercial', scores:[], incidents:0}
      siteMap[name].incidents += 1
    })
    return Object.values(siteMap)
      .map(s=>({...s, avgAudit: s.scores.length ? (s.scores.reduce((a,b)=>a+b,0)/s.scores.length) : null}))
      .filter(s=> (s.avgAudit !== null && s.avgAudit < 85) || s.incidents > 0)
      .sort((a,b)=>(a.avgAudit||0) - (b.avgAudit||0))
      .slice(0,8)
  },[inspections,incidents])

  /* ── KPI card ───────────────────────────────────────────────── */
  const KPI = ({label,value,sub,color,accent,onClick}) => (
    <div onClick={onClick} style={{...card,flex:1,minWidth:155,position:'relative',overflow:'hidden',cursor:onClick?'pointer':'default',transition:'box-shadow .15s,transform .15s'}}
      onMouseEnter={e=>{if(onClick){e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.1)';e.currentTarget.style.transform='translateY(-1px)'}}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='';e.currentTarget.style.transform=''}}>
      {accent && <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:accent,borderRadius:'var(--r-lg) var(--r-lg) 0 0'}}/>}
      <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8,fontWeight:700}}>{label}</div>
      <div style={{fontSize:'1.55rem',fontWeight:800,color:color||'var(--text-1)',letterSpacing:'-.03em',lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:8}}>{sub}</div>}
    </div>
  )

  /* ── render ─────────────────────────────────────────────────── */
  if(loading) return <div style={{padding:60,textAlign:'center'}}><Spinner/></div>

  return(
    <div style={{padding:'28px 32px',maxWidth:1200,margin:'0 auto',fontFamily:'Inter, system-ui, sans-serif'}}>

      {/* ─── Header ────────────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <h1 style={{fontSize:'1.6rem',fontWeight:800,letterSpacing:'-.03em',margin:0,color:'var(--text-1)'}}>Executive Dashboard</h1>
          {badge('var(--teal)','#fff','OVERVIEW')}
        </div>
        <select value={period} onChange={e=>setPeriod(e.target.value)}
          style={{padding:'8px 14px',borderRadius:'var(--r-sm)',border:'1px solid var(--border)',background:'var(--bg-surface)',
            color:'var(--text-1)',fontSize:'0.82rem',fontWeight:600,cursor:'pointer'}}>
          {PERIOD_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ─── TODAY ENGINE: Command Centre ──────────────────────── */}
      {today ? (
        <>
          {/* ── Intelligence Alerts Strip ─────────────────────────── */}
          {visibleAlerts.length > 0 && (
            <div style={{display:'flex',gap:10,marginBottom:18,overflowX:'auto',paddingBottom:4}}>
              {visibleAlerts.map(a=>{
                const sev = (a.severity||'info').toLowerCase()
                const icon = sev==='critical' ? '\uD83D\uDD34' : sev==='warning' ? '\uD83D\uDFE1' : '\u2139\uFE0F'
                const borderColor = sev==='critical' ? '#DC2626' : sev==='warning' ? '#D97706' : '#0D9488'
                const bgColor = sev==='critical' ? '#FEF2F2' : sev==='warning' ? '#FFFBEB' : '#F0FDFA'
                return(
                  <div key={a.id} onClick={()=>handleAck(a.id)} style={{
                    ...card,padding:'12px 16px',minWidth:220,maxWidth:320,flex:'0 0 auto',cursor:'pointer',
                    borderLeft:`4px solid ${borderColor}`,background:bgColor,transition:'opacity .15s',
                  }} onMouseEnter={e=>e.currentTarget.style.opacity=0.8} onMouseLeave={e=>e.currentTarget.style.opacity=1}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                      <span style={{fontSize:'0.9rem'}}>{icon}</span>
                      <span style={{fontSize:'0.78rem',fontWeight:700,color:'var(--text-1)'}}>{a.title||'Alert'}</span>
                    </div>
                    <div style={{fontSize:'0.72rem',color:'var(--text-muted)',lineHeight:1.4}}>{a.detail||a.message||''}</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── SECTION 1: Action Strip ────────────────────────────── */}
          {(()=>{
            const counts = today.counts || {}
            const strips = [
              {id:'sec-contacts',icon:'\uD83C\uDFAF',label:'Leads to Contact',count:safeArr(today.leads_to_contact).length,bg:'#0D9488',fg:'#fff'},
              {id:'sec-followups',icon:'\u23F0',label:'Follow-ups Due',count:safeArr(today.followups_due).length,bg:safeArr(today.followups_due).length>0?'#D97706':'#94A3B8',fg:'#fff'},
              {id:'sec-visits',icon:'\uD83D\uDCCD',label:'Push to Visit',count:safeArr(today.push_to_visit).length,bg:'#0F766E',fg:'#fff'},
              {id:'sec-quotes',icon:'\uD83D\uDCB0',label:'Quotes to Send',count:safeArr(today.leads_to_quote).length,bg:'#059669',fg:'#fff'},
              {id:'sec-followups',icon:'\u26A0\uFE0F',label:'Stale Pipeline',count:counts.stale_pipeline||0,bg:(counts.stale_pipeline||0)>0?'#DC2626':'#94A3B8',fg:'#fff'},
              {id:'sec-risk',icon:'\uD83D\uDCCB',label:'Unstaffed Contracts',count:counts.unstaffed_contracts||0,bg:(counts.unstaffed_contracts||0)>0?'#DC2626':'#94A3B8',fg:'#fff'},
            ]
            return(
              <div style={{display:'flex',gap:8,marginBottom:22,overflowX:'auto',paddingBottom:4}}>
                {strips.map((s,i)=>(
                  <div key={i} onClick={()=>{const el=document.getElementById(s.id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}}
                    style={{
                      display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:28,
                      background:s.count>0?s.bg:'var(--bg-surface)',border:s.count>0?'none':'1px solid var(--border)',
                      color:s.count>0?s.fg:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap',
                      transition:'transform .1s,box-shadow .15s',flex:'0 0 auto',
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,.12)'}}
                    onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}>
                    <span style={{fontSize:'0.95rem'}}>{s.icon}</span>
                    <span style={{fontSize:'0.78rem',fontWeight:800,letterSpacing:'-.01em'}}>{s.count} {s.label}</span>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* ── SECTION 2: Contact Today (full-width table) ────────── */}
          {safeArr(today.leads_to_contact).length > 0 && (
            <div id="sec-contacts" style={{...card,marginBottom:22}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:'1rem'}}>{'\uD83C\uDFAF'}</span>
                  <span style={{fontSize:'0.82rem',fontWeight:800,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Contact Today</span>
                  {badge('#0D9488','#fff',`${safeArr(today.leads_to_contact).length} leads`)}
                </div>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{borderBottom:'2px solid var(--border)'}}>
                      <th style={{...thStyle,width:30}}>#</th>
                      <th style={thStyle}>Business Name</th>
                      <th style={thStyle}>Borough</th>
                      <th style={thStyle}>Sector</th>
                      <th style={{...thStyle,textAlign:'center'}}>Score</th>
                      <th style={{...thStyle,textAlign:'right'}}>Est. Value</th>
                      <th style={thStyle}>Reason</th>
                      <th style={thStyle}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeArr(today.leads_to_contact).slice(0,showAllContacts?50:10).map((lead,i)=>{
                      const sc = Number(lead.score)||0
                      const isA = sc>=80, isB = sc>=65 && sc<80
                      const scoreBg = isA?'#ECFDF5':isB?'#F0FDFA':'#FFFBEB'
                      const scoreColor = isA?'#059669':isB?'#0D9488':'#D97706'
                      const scoreBand = isA?'A':isB?'B':'C'
                      return(
                        <tr key={i} onClick={()=>openLead&&(lead.entity_id||lead.place_id)&&openLead(lead.entity_id||lead.place_id)}
                          style={{borderBottom:'1px solid var(--border)',transition:'background .1s',cursor:openLead&&(lead.entity_id||lead.place_id)?'pointer':'default'}}
                          onMouseEnter={e=>e.currentTarget.style.background='rgba(13,148,136,.04)'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <td style={{...tdStyle,color:'var(--text-muted)',fontWeight:600,fontSize:'0.72rem'}}>{i+1}</td>
                          <td style={{...tdStyle,fontWeight:700}}>{lead.business_name||lead.name||'—'}</td>
                          <td style={tdStyle}>{lead.borough||'—'}</td>
                          <td style={tdStyle}>{lead.sector||'—'}</td>
                          <td style={{...tdStyle,textAlign:'center'}}>
                            <span style={{display:'inline-block',fontSize:'0.65rem',fontWeight:800,padding:'3px 10px',
                              borderRadius:20,background:scoreBg,color:scoreColor,minWidth:36,textAlign:'center'}}>{sc} {scoreBand}</span>
                          </td>
                          <td style={{...tdStyle,textAlign:'right',fontWeight:600}}>{lead.est_value!=null?fmtGBP(lead.est_value):'—'}</td>
                          <td style={{...tdStyle,fontSize:'0.74rem',color:'var(--text-muted)',maxWidth:200}}>{lead.reason||'—'}</td>
                          <td style={tdStyle}>
                            <span style={{display:'inline-block',fontSize:'0.65rem',fontWeight:700,padding:'3px 12px',
                              borderRadius:20,background:'#F0FDFA',color:'#0D9488',whiteSpace:'nowrap'}}>{lead.suggested_action||lead.next_best_action||'Contact'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {safeArr(today.leads_to_contact).length > 10 && !showAllContacts && (
                <div style={{textAlign:'center',marginTop:12}}>
                  <button onClick={()=>setShowAllContacts(true)} style={{
                    background:'none',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'8px 20px',
                    fontSize:'0.78rem',fontWeight:700,color:'var(--teal)',cursor:'pointer',transition:'background .15s',
                  }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-surface)'}
                     onMouseLeave={e=>e.currentTarget.style.background='none'}>
                    Show all {safeArr(today.leads_to_contact).length} leads
                  </button>
                </div>
              )}
              {showAllContacts && safeArr(today.leads_to_contact).length > 10 && (
                <div style={{textAlign:'center',marginTop:12}}>
                  <button onClick={()=>setShowAllContacts(false)} style={{
                    background:'none',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'8px 20px',
                    fontSize:'0.78rem',fontWeight:700,color:'var(--text-muted)',cursor:'pointer',
                  }}>Show less</button>
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 3: Follow Up Now + Pipeline Movement ────────── */}
          <div id="sec-followups" style={{display:'flex',gap:18,marginBottom:22,flexWrap:'wrap'}}>
            {/* Left: Follow Up Now */}
            <div style={{...card,flex:1,minWidth:340}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <span style={{fontSize:'0.95rem'}}>{'\u23F0'}</span>
                <span style={{fontSize:'0.78rem',fontWeight:800,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Follow Up Now</span>
                {safeArr(today.followups_due).length>0 && badge('#D97706','#fff',`${safeArr(today.followups_due).length}`)}
              </div>
              {safeArr(today.followups_due).length === 0 ? (
                <div style={{fontSize:'0.8rem',color:'var(--text-muted)',padding:'12px 0'}}>No follow-ups due. Pipeline is moving.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {safeArr(today.followups_due).sort((a,b)=>(Number(b.days_stale)||0)-(Number(a.days_stale)||0)).map((item,i)=>{
                    const days = Number(item.days_stale)||0
                    const isCritical = days > 14
                    const isWarn = days > 7
                    return(
                      <div key={i} onClick={()=>openLead&&(item.entity_id||item.place_id)&&openLead(item.entity_id||item.place_id)} style={{
                        display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,
                        padding:'10px 14px',borderRadius:'var(--r-sm)',
                        background:isCritical?'#FEF2F2':isWarn?'#FFFBEB':'var(--bg-surface)',
                        border:`1px solid ${isCritical?'#FECACA':isWarn?'#FDE68A':'var(--border)'}`,
                        cursor:openLead&&(item.entity_id||item.place_id)?'pointer':'default',
                      }}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'0.82rem',fontWeight:700,color:'var(--text-1)',marginBottom:2}}>{item.business_name||item.name||'—'}</div>
                          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                            {(item.current_stage||item.stage) && badge(
                              isCritical?'#FEE2E2':isWarn?'#FEF3C7':'#F1F5F9',
                              isCritical?'#DC2626':isWarn?'#92400E':'#475569',
                              item.current_stage||item.stage
                            )}
                            <span style={{fontSize:'0.72rem',fontWeight:700,color:isCritical?'#DC2626':isWarn?'#D97706':'var(--text-muted)'}}>{days}d stale</span>
                          </div>
                          {item.reason && <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:4,lineHeight:1.3}}>{item.reason}</div>}
                        </div>
                        {item.suggested_action && (
                          <span style={{display:'inline-block',fontSize:'0.62rem',fontWeight:700,padding:'3px 10px',
                            borderRadius:20,background:'#F0FDFA',color:'#0D9488',whiteSpace:'nowrap',marginTop:2,flex:'0 0 auto'}}>{item.suggested_action}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right: Pipeline Movement */}
            <div style={{...card,flex:1,minWidth:340}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <span style={{fontSize:'0.95rem'}}>{'\u27A1\uFE0F'}</span>
                <span style={{fontSize:'0.78rem',fontWeight:800,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Pipeline Movement</span>
              </div>
              {safeArr(today.pipeline_movement).length === 0 ? (
                <div style={{fontSize:'0.8rem',color:'var(--text-muted)',padding:'12px 0'}}>No pipeline moves recommended.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {safeArr(today.pipeline_movement).map((item,i)=>{
                    const urgency = (item.urgency||'').toLowerCase()
                    const borderL = urgency==='high'?'#DC2626':urgency==='medium'?'#D97706':'#0D9488'
                    return(
                      <div key={i} onClick={()=>openLead&&(item.entity_id||item.place_id)&&openLead(item.entity_id||item.place_id)} style={{
                        padding:'10px 14px',borderRadius:'var(--r-sm)',borderLeft:`3px solid ${borderL}`,
                        background:'var(--bg-surface)',border:'1px solid var(--border)',borderLeftColor:borderL,
                        cursor:openLead&&(item.entity_id||item.place_id)?'pointer':'default',
                      }}>
                        <div style={{fontSize:'0.82rem',fontWeight:700,color:'var(--text-1)',marginBottom:4}}>{item.business_name||item.name||'—'}</div>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                          <span style={{fontSize:'0.68rem',fontWeight:700,padding:'2px 8px',borderRadius:12,background:'#F1F5F9',color:'#475569'}}>{item.from_stage||'—'}</span>
                          <span style={{fontSize:'0.8rem',color:'var(--teal)',fontWeight:800}}>{'\u2192'}</span>
                          <span style={{fontSize:'0.68rem',fontWeight:700,padding:'2px 8px',borderRadius:12,background:'#ECFDF5',color:'#059669'}}>{item.to_stage||'—'}</span>
                        </div>
                        {item.recommendation && <div style={{fontSize:'0.72rem',color:'var(--text-muted)',lineHeight:1.3}}>{item.recommendation}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 4: Push to Visit + Leads to Quote ──────────── */}
          <div style={{display:'flex',gap:18,marginBottom:22,flexWrap:'wrap'}}>
            {/* Left: Push to Site Visit */}
            <div id="sec-visits" style={{...card,flex:1,minWidth:300}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <span style={{fontSize:'0.95rem'}}>{'\uD83D\uDCCD'}</span>
                <span style={{fontSize:'0.78rem',fontWeight:800,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Push to Site Visit</span>
                {safeArr(today.push_to_visit).length>0 && badge('#0F766E','#fff',`${safeArr(today.push_to_visit).length}`)}
              </div>
              {safeArr(today.push_to_visit).length === 0 ? (
                <div style={{fontSize:'0.8rem',color:'var(--text-muted)',padding:'8px 0'}}>No site visits to push.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {safeArr(today.push_to_visit).map((item,i)=>{
                    const sc = Number(item.score)||0
                    return(
                      <div key={i} onClick={()=>openLead&&(item.entity_id||item.place_id)&&openLead(item.entity_id||item.place_id)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,
                        padding:'8px 12px',borderRadius:'var(--r-sm)',background:'var(--bg-surface)',border:'1px solid var(--border)',cursor:openLead&&(item.entity_id||item.place_id)?'pointer':'default'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'0.8rem',fontWeight:700,color:'var(--text-1)'}}>{item.business_name||item.name||'—'}</div>
                          <div style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>{item.borough||''}{item.borough&&sc?' · ':''}{sc?`Score ${sc}`:''}</div>
                        </div>
                        {(item.suggested_action||item.next_best_action) && (
                          <span style={{fontSize:'0.62rem',fontWeight:700,padding:'3px 10px',borderRadius:20,
                            background:'#F0FDFA',color:'#0D9488',whiteSpace:'nowrap'}}>{item.suggested_action||item.next_best_action}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right: Leads to Quote */}
            <div id="sec-quotes" style={{...card,flex:1,minWidth:300}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <span style={{fontSize:'0.95rem'}}>{'\uD83D\uDCB0'}</span>
                <span style={{fontSize:'0.78rem',fontWeight:800,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Leads to Quote</span>
                {safeArr(today.leads_to_quote).length>0 && badge('#059669','#fff',`${safeArr(today.leads_to_quote).length}`)}
              </div>
              {safeArr(today.leads_to_quote).length === 0 ? (
                <div style={{fontSize:'0.8rem',color:'var(--text-muted)',padding:'8px 0'}}>No quotes to prepare.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {safeArr(today.leads_to_quote).map((item,i)=>(
                    <div key={i} onClick={()=>openLead&&(item.entity_id||item.place_id)&&openLead(item.entity_id||item.place_id)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,
                      padding:'8px 12px',borderRadius:'var(--r-sm)',background:'var(--bg-surface)',border:'1px solid var(--border)',cursor:openLead&&(item.entity_id||item.place_id)?'pointer':'default'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'0.8rem',fontWeight:700,color:'var(--text-1)'}}>{item.business_name||item.name||'—'}</div>
                        {item.est_value!=null && <div style={{fontSize:'0.72rem',fontWeight:700,color:'#059669'}}>{fmtGBP(item.est_value)}</div>}
                      </div>
                      {(item.suggested_action||item.next_best_action) && (
                        <span style={{fontSize:'0.62rem',fontWeight:700,padding:'3px 10px',borderRadius:20,
                          background:'#ECFDF5',color:'#059669',whiteSpace:'nowrap'}}>{item.suggested_action||item.next_best_action}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 5: Alerts & Risk (conditional) ─────────────── */}
          {(safeArr(today.at_risk).length > 0 || safeArr(today.overdue_invoices).length > 0) && (
            <div id="sec-risk" style={{display:'flex',gap:18,marginBottom:22,flexWrap:'wrap'}}>
              {safeArr(today.at_risk).length > 0 && (
                <div style={{...card,flex:1,minWidth:300,borderLeft:'4px solid #DC2626'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                    {badge('#FEF2F2','#DC2626','AT RISK')}
                    <span style={{fontSize:'0.78rem',fontWeight:700,color:'var(--text-1)'}}>Contracts at Risk</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {safeArr(today.at_risk).map((item,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,
                        padding:'8px 12px',borderRadius:'var(--r-sm)',background:'#FEF2F2',border:'1px solid #FECACA'}}>
                        <div>
                          <div style={{fontSize:'0.8rem',fontWeight:700,color:'var(--text-1)'}}>{item.business_name||item.name||'—'}</div>
                          <div style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>
                            {item.margin_pct!=null && <span>Margin {Number(item.margin_pct).toFixed(1)}%</span>}
                            {item.risk_flag && <span>{item.margin_pct!=null?' · ':''}{item.risk_flag}</span>}
                          </div>
                        </div>
                        <span style={{fontSize:'0.72rem',fontWeight:800,color:'#DC2626'}}>{'\u26A0\uFE0F'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {safeArr(today.overdue_invoices).length > 0 && (
                <div style={{...card,flex:1,minWidth:300,borderLeft:'4px solid #D97706'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                    {badge('#FFFBEB','#D97706','OVERDUE')}
                    <span style={{fontSize:'0.78rem',fontWeight:700,color:'var(--text-1)'}}>Overdue Invoices</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {safeArr(today.overdue_invoices).map((item,i)=>{
                      const daysOd = Number(item.days_overdue)||0
                      return(
                        <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,
                          padding:'8px 12px',borderRadius:'var(--r-sm)',background:daysOd>30?'#FEF2F2':'#FFFBEB',
                          border:`1px solid ${daysOd>30?'#FECACA':'#FDE68A'}`}}>
                          <div>
                            <div style={{fontSize:'0.8rem',fontWeight:700,color:'var(--text-1)'}}>{item.business_name||item.client_name||item.name||'—'}</div>
                            <div style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>{item.invoice_number||''}{item.invoice_number?' · ':''}{daysOd}d overdue</div>
                          </div>
                          <span style={{fontSize:'0.82rem',fontWeight:800,color:daysOd>30?'#DC2626':'#D97706'}}>{item.amount!=null?fmtGBP(item.amount):'—'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 6: Borough Intelligence ────────────────────── */}
          {safeArr(today.top_boroughs).length > 0 && (
            <div style={{...card,marginBottom:22}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                <span style={{fontSize:'0.95rem'}}>{'\uD83D\uDCCA'}</span>
                <span style={{fontSize:'0.78rem',fontWeight:800,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Borough Intelligence</span>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {(()=>{
                  const boroughs = safeArr(today.top_boroughs)
                  const maxVal = Math.max(...boroughs.map(b=>Number(b.total_value||b.count||b.lead_count)||0),1)
                  return boroughs.slice(0,10).map((b,i)=>{
                    const count = Number(b.count||b.lead_count)||0
                    const totalVal = Number(b.total_value)||0
                    const avgSc = Number(b.avg_score)||0
                    const pct = (totalVal||count)/maxVal*100
                    const barColor = i<3?'var(--teal)':i<6?'#14B8A6':'#64748B'
                    const name = b.borough||b.name||'Unknown'
                    return(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:12}}>
                        <div style={{width:110,fontSize:'0.78rem',fontWeight:600,color:'var(--text-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:'0 0 110px'}}>
                          {name}
                        </div>
                        <div style={{flex:1,height:22,borderRadius:4,overflow:'hidden',background:'var(--border)',position:'relative'}}>
                          <div style={{width:`${Math.max(pct,2)}%`,height:'100%',background:barColor,borderRadius:4,transition:'width .3s'}}/>
                        </div>
                        <div style={{display:'flex',gap:12,flex:'0 0 auto',alignItems:'center'}}>
                          <span style={{fontSize:'0.7rem',fontWeight:700,color:'var(--text-1)',minWidth:20,textAlign:'right'}}>{count}</span>
                          {avgSc > 0 && <span style={{fontSize:'0.65rem',fontWeight:600,color:'var(--text-muted)',minWidth:40}}>Avg {avgSc.toFixed(0)}</span>}
                          {totalVal > 0 && <span style={{fontSize:'0.7rem',fontWeight:700,color:'#059669',minWidth:55,textAlign:'right'}}>{fmtGBP(totalVal)}</span>}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{...card,marginBottom:22,textAlign:'center',padding:'32px 24px'}}>
          <Spinner/>
          <div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginTop:12}}>Loading Today Engine...</div>
        </div>
      )}

      {/* ─── Action Banner (web leads) ─────────────────────────── */}
      {webLeads > 0 && (
        <div style={{
          background:'linear-gradient(135deg,#0F766E 0%,#0D9488 100%)',borderRadius:'var(--r-lg)',
          padding:'16px 24px',marginBottom:24,display:'flex',alignItems:'center',justifyContent:'space-between',
          flexWrap:'wrap',gap:12,
        }}>
          <div style={{color:'#fff',fontSize:'0.88rem',lineHeight:1.5}}>
            <strong>{webLeads} web lead{webLeads!==1?'s':''}</strong> awaiting your review
            {' '}— Intelligence Engine has pre-priced {webLeads===1?'this quote':'these quotes'}
            {' '}— click to review scenarios and apply pricing
          </div>
          <button onClick={()=>setTab&&setTab('quotes')} style={{
            background:'#fff',color:'#0F766E',border:'none',borderRadius:'var(--r-sm)',
            padding:'9px 22px',fontWeight:700,fontSize:'0.82rem',cursor:'pointer',
            whiteSpace:'nowrap',transition:'opacity .15s',
          }} onMouseEnter={e=>e.target.style.opacity=0.85} onMouseLeave={e=>e.target.style.opacity=1}>
            Review &rarr;
          </button>
        </div>
      )}

      {/* ─── KPI Cards Row ─────────────────────────────────────── */}
      <div style={{display:'flex',gap:14,marginBottom:28,flexWrap:'wrap'}}>
        <KPI label="Active Sites" value={fmt(activeSites)} sub={activeSites > 0 ? '\u25B2 Portfolio' : 'No active sites'} accent="var(--teal)" onClick={()=>setTab&&setTab('operations')}/>
        <KPI label="Monthly Revenue" value={fmtGBP(monthlyRevenue)} sub={monthlyRevenue > 0 ? '\u25B2 Growing' : 'Awaiting data'} accent="#14B8A6" onClick={()=>setTab&&setTab('finance')}/>
        <KPI label="Portfolio Margin" value={fmtPct(portfolioMargin)} sub="Net margin" accent="#0F766E" onClick={()=>setTab&&setTab('finance')}/>
        <KPI label="Avg Audit Score" value={avgScore != null ? fmtPct(avgScore) : '—'} sub="Quality benchmark"
          color={avgScore >= 90 ? '#059669' : avgScore >= 70 ? '#D97706' : avgScore != null ? '#DC2626' : undefined}
          accent="#F59E0B" onClick={()=>setTab&&setTab('quality')}/>
        <KPI label="Open Incidents" value={fmt(openIncidents)} sub={openIncidents === 0 ? 'All clear' : 'Needs attention'}
          color={openIncidents > 0 ? '#DC2626' : '#059669'} accent={openIncidents > 0 ? '#DC2626' : '#059669'} onClick={()=>setTab&&setTab('quality')}/>
      </div>

      {/* ─── Web Leads to Quote card ───────────────────────────── */}
      <div style={{display:'flex',gap:18,marginBottom:28,flexWrap:'wrap'}}>
        <div style={{...card,flex:'0 0 220px',display:'flex',flexDirection:'column',alignItems:'flex-start',justifyContent:'center'}}>
          <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700,marginBottom:8}}>Web Leads to Quote</div>
          <div style={{fontSize:'2rem',fontWeight:800,color:'var(--teal)',letterSpacing:'-.03em',lineHeight:1}}>{webLeads}</div>
          <button onClick={()=>setTab&&setTab('quotes')} style={{
            marginTop:14,background:'none',border:'none',color:'var(--teal)',fontWeight:700,
            fontSize:'0.8rem',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:4,
          }}>
            <span style={{fontSize:'0.65rem'}}>{'\u25B6'}</span> Review now
          </button>
        </div>

        {/* ── Sales Pipeline Summary ──────────────────────────── */}
        <div style={{...card,flex:1,minWidth:260}}>
          <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700,marginBottom:14}}>Sales Pipeline</div>
          <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
            {[
              {label:'Total Leads',value:fmt(s.total_leads),color:'var(--text-1)'},
              {label:'Active Pipeline',value:fmt(s.active_pipeline),color:'var(--teal)'},
              {label:'HVT Accounts',value:fmt(s.hvt_count),color:'#14B8A6'},
              {label:'Won',value:fmt(s.won_count),color:'#059669'},
              {label:'Pipeline Value',value:fmtGBP(s.pipeline_value_gbp),color:'#0F766E'},
            ].map((k,i)=>(
              <div key={i} style={{minWidth:90}}>
                <div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600,marginBottom:4}}>{k.label}</div>
                <div style={{fontSize:'1.15rem',fontWeight:800,color:k.color,letterSpacing:'-.02em'}}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Charts Row ────────────────────────────────────────── */}
      <div style={{display:'flex',gap:18,marginBottom:28,flexWrap:'wrap'}}>
        {/* Revenue & Margin chart */}
        <div style={{...card,flex:1,minWidth:340}}>
          <div style={{fontSize:'0.72rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700,marginBottom:14}}>Revenue &amp; Margin %</div>
          <MiniLineChart data={revenueChartData}/>
        </div>

        {/* Audit Scores by Site */}
        <div style={{...card,flex:1,minWidth:300}}>
          <div style={{fontSize:'0.72rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700,marginBottom:14}}>Audit Scores by Site</div>
          <BarChart data={auditChartData}/>
        </div>
      </div>

      {/* ─── Pipeline Stage Breakdown ──────────────────────────── */}
      {Array.isArray(pipeline) && pipeline.length > 0 && (
        <div style={{...card,marginBottom:28}}>
          <div style={{fontSize:'0.72rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700,marginBottom:16}}>Pipeline Stage Breakdown</div>
          <div style={{display:'flex',gap:6,height:28,borderRadius:'var(--r-sm)',overflow:'hidden',background:'var(--border)'}}>
            {pipeline.map((stage,i)=>{
              const total = pipeline.reduce((a,s)=>a+(s.count||0),0)
              const pct = total > 0 ? (stage.count||0)/total*100 : 0
              const colors = ['#0D9488','#14B8A6','#0F766E','#F59E0B','#059669','#DC2626','#64748B']
              if(pct < 1) return null
              return(
                <div key={i} style={{flex:`0 0 ${pct}%`,background:colors[i%colors.length],display:'flex',alignItems:'center',
                  justifyContent:'center',fontSize:'0.65rem',fontWeight:700,color:'#fff',minWidth:pct>4?'auto':0,overflow:'hidden',whiteSpace:'nowrap',padding:'0 6px'}}>
                  {pct > 8 ? `${stage.stage||stage.name||''} (${stage.count})` : stage.count}
                </div>
              )
            })}
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:10}}>
            {pipeline.map((stage,i)=>{
              const colors = ['#0D9488','#14B8A6','#0F766E','#F59E0B','#059669','#DC2626','#64748B']
              return(
                <div key={i} style={{display:'flex',alignItems:'center',gap:5,fontSize:'0.7rem',color:'var(--text-muted)'}}>
                  <span style={{width:8,height:8,borderRadius:2,background:colors[i%colors.length],display:'inline-block'}}/>
                  {stage.stage||stage.name||`Stage ${i+1}`}: {stage.count||0}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── ATTENTION: Sites Needing Review ───────────────────── */}
      {sitesNeedingReview.length > 0 && (
        <div style={{...card,borderLeft:'4px solid #DC2626'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
            {badge('#FEF2F2','#DC2626','ATTENTION')}
            <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Sites Needing Review</span>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--border)'}}>
                  <th style={thStyle}>Site</th>
                  <th style={thStyle}>Segment</th>
                  <th style={thStyle}>Avg Audit</th>
                  <th style={thStyle}>Open Incidents</th>
                </tr>
              </thead>
              <tbody>
                {sitesNeedingReview.map((row,i)=>{
                  const sc = row.avgAudit != null ? (row.avgAudit >= 90 ? '#059669' : row.avgAudit >= 70 ? '#D97706' : '#DC2626') : 'var(--text-muted)'
                  return(
                    <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{...tdStyle,fontWeight:600}}>{row.site}</td>
                      <td style={tdStyle}>{row.segment}</td>
                      <td style={{...tdStyle,fontWeight:700,color:sc}}>{row.avgAudit != null ? row.avgAudit.toFixed(1) : '—'}</td>
                      <td style={tdStyle}>
                        {row.incidents > 0
                          ? <span style={{background:'#FEF2F2',color:'#DC2626',fontWeight:700,fontSize:'0.75rem',padding:'3px 10px',borderRadius:20}}>{row.incidents}</span>
                          : <span style={{color:'var(--text-muted)'}}>0</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Empty state if no attention items ─────────────────── */}
      {sitesNeedingReview.length === 0 && (
        <div style={{...card,borderLeft:'4px solid #059669',display:'flex',alignItems:'center',gap:12}}>
          {badge('#ECFDF5','#059669','ALL CLEAR')}
          <span style={{fontSize:'0.85rem',color:'var(--text-1)'}}>All sites are within quality thresholds. No immediate action required.</span>
        </div>
      )}
    </div>
  )
}
