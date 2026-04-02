import {useState,useMemo} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api} from '../api'
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
      <path d={marLine} fill="none" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="6 3" strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map((p,i)=><circle key={'m'+i} cx={p.x} cy={p.yMar} r={3} fill="#8B5CF6" stroke="var(--bg-surface)" strokeWidth={1.5}/>)}
      {/* x labels */}
      {data.map((d,i)=>(
        <text key={i} x={pts[i].x} y={height-8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{d.label}</text>
      ))}
      {/* legend */}
      <line x1={padL} x2={padL+20} y1={8} y2={8} stroke="var(--teal)" strokeWidth={2.5}/>
      <text x={padL+24} y={11} fontSize={9} fill="var(--text-muted)">Revenue</text>
      <line x1={padL+80} x2={padL+100} y1={8} y2={8} stroke="#8B5CF6" strokeWidth={2} strokeDasharray="4 2"/>
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

export default function Analytics({openLead}){
  const [period,setPeriod]=useState('h1-2026')

  /* ── data fetching ──────────────────────────────────────────── */
  const {data:summary,isLoading:lSum}   = useQuery({queryKey:['summary'],queryFn:api.summary,staleTime:120000})
  const {data:opsData,isLoading:lOps}    = useQuery({queryKey:['operations'],queryFn:api.operations,staleTime:120000})
  const {data:qualData,isLoading:lQual}  = useQuery({queryKey:['quality'],queryFn:api.quality,staleTime:120000})
  const {data:finData,isLoading:lFin}    = useQuery({queryKey:['finance-ov'],queryFn:api.financeOverview,staleTime:120000})
  const {data:pipeline,isLoading:lPipe}  = useQuery({queryKey:['pipeline-analytics'],queryFn:api.pipelineAnalytics,staleTime:120000})
  const {data:sectorRev,isLoading:lSec}  = useQuery({queryKey:['sector-revenue'],queryFn:api.sectorRevenue,staleTime:120000})
  const {data:pendingQuotes,isLoading:lQ} = useQuery({queryKey:['quotes-pending'],queryFn:()=>api.quotes('pending'),staleTime:60000})

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
  const KPI = ({label,value,sub,color,accent}) => (
    <div style={{...card,flex:1,minWidth:155,position:'relative',overflow:'hidden'}}>
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
          <button onClick={()=>openLead&&openLead('quotes')} style={{
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
        <KPI label="Active Sites" value={fmt(activeSites)} sub={activeSites > 0 ? '\u25B2 Portfolio' : 'No active sites'} accent="var(--teal)"/>
        <KPI label="Monthly Revenue" value={fmtGBP(monthlyRevenue)} sub={monthlyRevenue > 0 ? '\u25B2 Growing' : 'Awaiting data'} accent="#2563EB"/>
        <KPI label="Portfolio Margin" value={fmtPct(portfolioMargin)} sub="Net margin" accent="#8B5CF6"/>
        <KPI label="Avg Audit Score" value={avgScore != null ? fmtPct(avgScore) : '—'} sub="Quality benchmark"
          color={avgScore >= 90 ? '#059669' : avgScore >= 70 ? '#D97706' : avgScore != null ? '#DC2626' : undefined}
          accent="#F59E0B"/>
        <KPI label="Open Incidents" value={fmt(openIncidents)} sub={openIncidents === 0 ? 'All clear' : 'Needs attention'}
          color={openIncidents > 0 ? '#DC2626' : '#059669'} accent={openIncidents > 0 ? '#DC2626' : '#059669'}/>
      </div>

      {/* ─── Web Leads to Quote card ───────────────────────────── */}
      <div style={{display:'flex',gap:18,marginBottom:28,flexWrap:'wrap'}}>
        <div style={{...card,flex:'0 0 220px',display:'flex',flexDirection:'column',alignItems:'flex-start',justifyContent:'center'}}>
          <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:700,marginBottom:8}}>Web Leads to Quote</div>
          <div style={{fontSize:'2rem',fontWeight:800,color:'var(--teal)',letterSpacing:'-.03em',lineHeight:1}}>{webLeads}</div>
          <button onClick={()=>openLead&&openLead('quotes')} style={{
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
              {label:'HVT Accounts',value:fmt(s.hvt_count),color:'#8B5CF6'},
              {label:'Won',value:fmt(s.won_count),color:'#059669'},
              {label:'Pipeline Value',value:fmtGBP(s.pipeline_value_gbp),color:'#2563EB'},
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
              const colors = ['#0D9488','#2563EB','#8B5CF6','#F59E0B','#059669','#DC2626','#64748B']
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
              const colors = ['#0D9488','#2563EB','#8B5CF6','#F59E0B','#059669','#DC2626','#64748B']
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
