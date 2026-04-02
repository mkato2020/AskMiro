import {useState,useCallback,useMemo} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api,fetchFeasibility,fetchSectorCosts} from '../api'

/* ── helpers ─────────────────────────────────────────────── */
function timeAgo(dateStr){
  if(!dateStr) return 'Never'
  const mins=Math.round((Date.now()-new Date(dateStr).getTime())/60000)
  if(mins<1) return 'Just now'
  if(mins<60) return `${mins}m ago`
  const h=Math.floor(mins/60)
  if(h<24) return `${h}h ago`
  const d=Math.floor(h/24)
  if(d<30) return `${d}d ago`
  return `${Math.floor(d/30)}mo ago`
}

function daysSince(dateStr){
  if(!dateStr) return null
  const d=Math.floor((Date.now()-new Date(dateStr).getTime())/(1000*60*60*24))
  return d
}

function initials(name){
  if(!name||name==='Unknown') return '\u2726'
  const parts=name.trim().split(/\s+/).filter(Boolean)
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase()
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase()
}

function scoreBand(score){
  if(score>=80) return {bg:'#059669',color:'#fff',label:'Hot'}
  if(score>=65) return {bg:'#D97706',color:'#fff',label:'Warm'}
  if(score>=50) return {bg:'#3B82F6',color:'#fff',label:'Ready'}
  return {bg:'rgba(100,116,139,.2)',color:'#94A3B8',label:'Cold'}
}

function tempIndicator(score){
  if(score==null) return null
  if(score>80) return {icon:'\uD83D\uDD25',label:'hot'}
  if(score>60) return {icon:'\uD83D\uDFE1',label:'warm'}
  if(score>40) return {icon:'\uD83D\uDD35',label:'cool'}
  return {icon:'\u26AA',label:'cold'}
}

const SECTOR_COLORS={
  healthcare:{bg:'#FDF2F8',color:'#DB2777'},education:{bg:'#FEF3C7',color:'#D97706'},
  office:{bg:'#EFF6FF',color:'#2563EB'},offices:{bg:'#EFF6FF',color:'#2563EB'},
  gyms:{bg:'#F0FDFA',color:'#0D9488'},gym_leisure:{bg:'#F0FDFA',color:'#0D9488'},
  retail:{bg:'#F5F3FF',color:'#7C3AED'},hospitality:{bg:'#FFF7ED',color:'#EA580C'},
  industrial:{bg:'#FFF7ED',color:'#EA580C'},property_management:{bg:'#EFF6FF',color:'#2563EB'},
}
const DEFAULT_SECTOR={bg:'rgba(100,116,139,.12)',color:'#94A3B8'}

const ACTION_LABELS={
  overdue_followup:{label:'Overdue',color:'#DC2626',bg:'#FEE2E2'},
  followup_today:{label:'Follow Up Today',color:'#D97706',bg:'#FEF3C7'},
  hot_uncontacted:{label:'Hot Lead',color:'#DC2626',bg:'#FEE2E2'},
  active_deal:{label:'Active Deal',color:'#059669',bg:'#ECFDF5'},
  ready_to_contact:{label:'Ready',color:'#3B82F6',bg:'#EFF6FF'},
  email_ready:{label:'Email Ready',color:'#8B5CF6',bg:'#F5F3FF'},
  standard:{label:'Standard',color:'#64748B',bg:'#F1F5F9'},
}

const SECTOR_CONVERSION={
  healthcare:14,education:11,office:18,offices:18,gyms:16,gym_leisure:16,
  retail:12,hospitality:15,industrial:13,property_management:17,
}

const FILTER_PILLS=[
  {key:'all',label:'All'},
  {key:'attention',label:'Needs Attention'},
  {key:'ready',label:'Ready to Send'},
  {key:'awaiting',label:'Awaiting Reply'},
  {key:'highvalue',label:'High Value'},
  {key:'hot',label:'Hot Leads'},
]

/* ── KPI Card ────────────────────────────────────────────── */
function KPI({label,value,color,icon}){
  return(
    <div style={{flex:1,minWidth:130,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:'16px 18px',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:color||'var(--border)',opacity:.5}}/>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        {icon&&<span style={{fontSize:'0.85rem',opacity:.7}}>{icon}</span>}
        <span style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600}}>{label}</span>
      </div>
      <div style={{fontSize:'1.4rem',fontWeight:800,letterSpacing:'-.03em',color:color||'var(--text-1)',lineHeight:1}}>{value}</div>
    </div>
  )
}

/* ── Send Controls Bar ───────────────────────────────────── */
function SendControlsBar({dailyCap,sentToday,capRemaining,capPct}){
  return(
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 20px',marginBottom:16,display:'flex',alignItems:'center',gap:24,flexWrap:'wrap'}}>
      <div style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-muted)'}}>Send Controls</div>
      <div style={{display:'flex',alignItems:'center',gap:16,flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'baseline',gap:4}}>
          <span style={{fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:500}}>Daily Cap:</span>
          <span style={{fontSize:'0.85rem',fontWeight:800,color:'var(--text-1)'}}>{dailyCap}</span>
        </div>
        <div style={{display:'flex',alignItems:'baseline',gap:4}}>
          <span style={{fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:500}}>Sent:</span>
          <span style={{fontSize:'0.85rem',fontWeight:800,color:capPct>=90?'#DC2626':capPct>=60?'#D97706':'var(--teal)'}}>{sentToday}</span>
        </div>
        <div style={{display:'flex',alignItems:'baseline',gap:4}}>
          <span style={{fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:500}}>Remaining:</span>
          <span style={{fontSize:'0.85rem',fontWeight:800,color:capRemaining<=5?'#DC2626':'#059669'}}>{capRemaining}</span>
        </div>
        <div style={{flex:1,minWidth:80,maxWidth:200}}>
          <div style={{height:6,background:'rgba(100,116,139,.12)',borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${Math.min(capPct,100)}%`,background:capPct>=90?'#DC2626':capPct>=60?'#D97706':'var(--teal)',borderRadius:3,transition:'width .4s ease'}}/>
          </div>
        </div>
        <span style={{fontSize:'0.62rem',fontWeight:600,color:'var(--text-muted)'}}>{capPct}%</span>
      </div>
    </div>
  )
}

/* ── Outreach Stats Bar ──────────────────────────────────── */
function OutreachStatsBar({inQueue,sentToday,replies,interested}){
  return(
    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:16,fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:500,flexWrap:'wrap'}}>
      <span style={{fontWeight:700,color:'var(--text-1)'}}>{inQueue}</span> in queue
      <span style={{color:'var(--border)'}}>|</span>
      <span style={{fontWeight:700,color:'var(--teal)'}}>{sentToday}</span> sent today
      <span style={{color:'var(--border)'}}>|</span>
      <span style={{fontWeight:700,color:'#D97706'}}>{replies}</span> replies
      <span style={{color:'var(--border)'}}>|</span>
      <span style={{fontWeight:700,color:'#059669'}}>{interested}</span> interested
    </div>
  )
}

/* ── Lead Intelligence Panel ─────────────────────────────── */
function LeadIntelligence({lead,allLeads}){
  const score=lead.total_score||lead.score
  const fitScore=lead.fit_score||lead.score_fit||null
  const facilityScore=lead.facility_score||lead.score_facility||null
  const signalScore=lead.signal_score||lead.score_signals||null
  const sector=(lead.sector||'').toLowerCase()
  const borough=lead.borough||null
  const convRate=SECTOR_CONVERSION[sector]||null

  /* Borough intelligence */
  const boroughLeads=borough?allLeads.filter(l=>l.borough===borough):[]
  const boroughAvgScore=boroughLeads.length>0?Math.round(boroughLeads.reduce((s,l)=>(s+(l.total_score||l.score||0)),0)/boroughLeads.length):null

  const nba=lead.next_best_action||lead.recommended_action||null

  return(
    <div style={{background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 16px',marginTop:10,fontSize:'0.72rem',color:'var(--text-muted)',display:'flex',flexDirection:'column',gap:8}}>
      {/* Score breakdown */}
      {score!=null&&(
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontWeight:700,color:'var(--text-1)'}}>Score: {Math.round(score)}</span>
          {fitScore!=null&&<span>\u2014 Fit: {Math.round(fitScore)}</span>}
          {facilityScore!=null&&<span>Facility: {Math.round(facilityScore)}</span>}
          {signalScore!=null&&<span>Signals: {Math.round(signalScore)}</span>}
        </div>
      )}
      {/* Borough intelligence */}
      {borough&&boroughLeads.length>1&&(
        <div>{boroughLeads.length} leads in {borough}{boroughAvgScore!=null?`, avg score ${boroughAvgScore}`:''}</div>
      )}
      {/* Sector conversion */}
      {sector&&sector!=='unknown'&&convRate&&(
        <div>{sector.replace(/_/g,' ')} sector typically converts at ~{convRate}%</div>
      )}
      {/* Recommended approach */}
      {nba&&(
        <div style={{fontWeight:600,color:'var(--teal)'}}>Recommended: {nba}</div>
      )}
      {/* Estimated value detail */}
      {lead.estimated_monthly_value_gbp!=null&&(
        <div>Estimated monthly value: \u00A3{Number(lead.estimated_monthly_value_gbp).toLocaleString()}</div>
      )}
    </div>
  )
}

/* ── Lead Card ───────────────────────────────────────────── */
function LeadCard({lead,onOpen,onReview,onDone,onSend,onGenerate,busy,mode,allLeads}){
  const [expanded,setExpanded]=useState(false)
  const hasReply=lead.reply_status==='needs_review'||lead.reply_status==='replied'
  const score=lead.total_score||lead.score
  const sb=score!=null?scoreBand(score):null
  const action=ACTION_LABELS[lead.action_type]||ACTION_LABELS.standard
  const sec=SECTOR_COLORS[(lead.sector||'').toLowerCase()]||DEFAULT_SECTOR
  const temp=tempIndicator(score)
  const daysAgo=daysSince(lead.last_contacted_at||lead.last_outreach_date)
  const estValue=lead.estimated_monthly_value_gbp
  const step=lead.outreach_step||lead.sequence_step||null
  const totalSteps=lead.sequence_total||4

  return(
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:'16px 18px',transition:'all .2s ease',borderLeft:hasReply?'3px solid #D97706':mode==='attention'?'3px solid #DC2626':'3px solid var(--border)'}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--teal)';e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,.15)'}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none'}}
    >
      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
        {/* Avatar */}
        <div
          onClick={()=>onOpen(lead.entity_id)}
          style={{width:38,height:38,borderRadius:10,background:hasReply?'rgba(217,119,6,.12)':'rgba(20,184,166,.1)',color:hasReply?'#D97706':'var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:800,flexShrink:0,cursor:'pointer'}}
        >
          {hasReply?'\u{1F4AC}':initials(lead.name)}
        </div>

        {/* Info */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span
              onClick={()=>onOpen(lead.entity_id)}
              style={{fontSize:'0.85rem',fontWeight:700,color:'var(--text-1)',cursor:'pointer',lineHeight:'18px'}}
              onMouseEnter={e=>e.target.style.color='var(--teal)'}
              onMouseLeave={e=>e.target.style.color='var(--text-1)'}
            >{lead.name||'Unknown'}</span>
            {sb&&<span style={{background:sb.bg,color:sb.color,fontSize:'0.58rem',fontWeight:800,padding:'1px 7px',borderRadius:6,lineHeight:'16px'}}>{Math.round(score)}</span>}
            {temp&&<span style={{fontSize:'0.7rem',lineHeight:1}} title={`${temp.label} lead`}>{temp.icon}</span>}
            <span style={{background:action.bg,color:action.color,fontSize:'0.58rem',fontWeight:700,padding:'1px 8px',borderRadius:8}}>{action.label}</span>

            {/* Estimated Value badge */}
            {estValue!=null&&(
              <span style={{background:'rgba(13,148,136,.1)',color:'#0D9488',fontSize:'0.58rem',fontWeight:700,padding:'1px 8px',borderRadius:8}}>
                ~\u00A3{Number(estValue).toLocaleString()}/mo
              </span>
            )}

            {/* Sequence progress */}
            {step!=null&&(
              <span style={{fontSize:'0.58rem',fontWeight:600,color:'var(--text-muted)',background:'rgba(100,116,139,.1)',padding:'1px 7px',borderRadius:6}}>
                Step {step}/{totalSteps}
              </span>
            )}

            {/* Days since last contact */}
            {daysAgo!=null&&(
              <span style={{fontSize:'0.58rem',fontWeight:600,color:daysAgo>7?'#DC2626':'var(--text-muted)'}}>
                {daysAgo}d ago
              </span>
            )}
          </div>

          <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:4,display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            {lead.contact_name&&<span style={{fontWeight:600}}>{lead.contact_name}</span>}
            {lead.contact_role&&<span>{lead.contact_role}</span>}
            {lead.email&&<span style={{color:'var(--teal)',fontWeight:500}}>{lead.email}</span>}
          </div>

          <div style={{display:'flex',gap:6,alignItems:'center',marginTop:6,flexWrap:'wrap'}}>
            <span style={{background:sec.bg,color:sec.color,fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:8}}>{(lead.sector||'unknown').replace(/_/g,' ')}</span>
            {lead.borough&&<span style={{fontSize:'0.62rem',color:'var(--text-muted)',fontWeight:500}}>{lead.borough}</span>}
            {lead.stage&&lead.stage!=='new'&&<span style={{fontSize:'0.6rem',color:'var(--text-muted)',background:'rgba(100,116,139,.1)',padding:'1px 7px',borderRadius:6}}>{lead.stage.replace(/_/g,' ')}</span>}
          </div>

          {/* Expand toggle for intelligence */}
          <button
            onClick={()=>setExpanded(!expanded)}
            style={{fontSize:'0.62rem',fontWeight:600,color:'var(--teal)',background:'none',border:'none',cursor:'pointer',padding:'4px 0 0',opacity:.8}}
            onMouseEnter={e=>e.target.style.opacity='1'}
            onMouseLeave={e=>e.target.style.opacity='.8'}
          >
            {expanded?'\u25B4 Hide Intel':'\u25BE Show Intel'}
          </button>

          {expanded&&<LeadIntelligence lead={lead} allLeads={allLeads}/>}
        </div>

        {/* Actions */}
        <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'flex-start'}}>
          {hasReply&&onReview&&(
            <button onClick={()=>onReview(lead)} disabled={busy} style={{fontSize:'0.72rem',fontWeight:700,color:'#fff',background:'#D97706',border:'none',borderRadius:8,padding:'7px 14px',cursor:busy?'wait':'pointer',opacity:busy?.5:1,transition:'all .15s'}}>
              Review
            </button>
          )}
          {!hasReply&&onSend&&(
            <button onClick={()=>onSend(lead.entity_id)} disabled={busy} style={{fontSize:'0.72rem',fontWeight:700,color:'#fff',background:'var(--teal)',border:'none',borderRadius:8,padding:'7px 14px',cursor:busy?'wait':'pointer',opacity:busy?.5:1,transition:'all .15s'}}>
              Send
            </button>
          )}
          {!hasReply&&onGenerate&&(
            <button onClick={()=>onGenerate(lead.entity_id)} disabled={busy} style={{fontSize:'0.72rem',fontWeight:700,color:'var(--teal)',background:'rgba(20,184,166,.08)',border:'1px solid rgba(20,184,166,.25)',borderRadius:8,padding:'6px 12px',cursor:busy?'wait':'pointer',opacity:busy?.5:1,transition:'all .15s'}}>
              AI Draft
            </button>
          )}
          {onDone&&(
            <button onClick={()=>onDone(lead.entity_id)} disabled={busy} style={{fontSize:'0.72rem',fontWeight:700,color:'#059669',background:'rgba(5,150,105,.08)',border:'1px solid rgba(5,150,105,.2)',borderRadius:8,padding:'6px 12px',cursor:busy?'wait':'pointer',opacity:busy?.5:1,transition:'all .15s'}}>
              {'\u2713'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Reply Review Modal ──────────────────────────────────── */
function ReplyModal({lead,onClose,onResolve}){
  const [action,setAction]=useState('done')
  if(!lead) return null
  const actions=[['done','Mark Done','#059669'],['followup','Follow Up','#3B82F6'],['meeting','Book Meeting','#8B5CF6'],['disqualify','Disqualify','#DC2626']]
  return(
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.55)',backdropFilter:'blur(4px)'}}>
      <div style={{background:'var(--bg-surface)',borderRadius:14,padding:'28px 32px',width:'100%',maxWidth:540,maxHeight:'80vh',overflow:'auto',boxShadow:'0 24px 64px rgba(0,0,0,.35)',border:'1px solid var(--border)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <h3 style={{margin:0,fontSize:'1.15rem',fontWeight:800,letterSpacing:'-.02em'}}>Reply from {lead.name}</h3>
          <button onClick={onClose} style={{background:'rgba(100,116,139,.1)',border:'none',width:32,height:32,borderRadius:8,fontSize:'1rem',cursor:'pointer',color:'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'center'}}>{'\u2715'}</button>
        </div>

        <div style={{background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:10,padding:'18px 20px',marginBottom:20}}>
          <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginBottom:8,display:'flex',gap:8,alignItems:'center'}}>
            <strong style={{color:'var(--text-1)'}}>{lead.contact_name||lead.name}</strong>
            <span>{lead.email}</span>
            <span>{timeAgo(lead.last_outreach_date)}</span>
          </div>
          <div style={{fontSize:'0.85rem',color:'var(--text-1)',lineHeight:1.7}}>
            {lead.reply_body||'Reply content will appear here once loaded from the email system.'}
          </div>
        </div>

        <div style={{marginBottom:20}}>
          <div style={{fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-muted)',marginBottom:10}}>Resolution</div>
          <div style={{display:'flex',gap:8}}>
            {actions.map(([v,l,c])=>(
              <button key={v} onClick={()=>setAction(v)} style={{
                padding:'8px 16px',fontSize:'0.75rem',fontWeight:action===v?700:500,
                color:action===v?'#fff':c,
                background:action===v?c:`${c}10`,
                border:`1px solid ${action===v?c:`${c}30`}`,
                borderRadius:8,cursor:'pointer',transition:'all .15s'
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{display:'flex',justifyContent:'flex-end',gap:10,paddingTop:16,borderTop:'1px solid var(--border)'}}>
          <button style={{padding:'9px 20px',fontSize:'0.8rem',fontWeight:600,color:'var(--text-muted)',background:'transparent',border:'1px solid var(--border)',borderRadius:8,cursor:'pointer'}} onClick={onClose}>Cancel</button>
          <button style={{padding:'9px 24px',fontSize:'0.8rem',fontWeight:700,color:'#fff',background:'var(--teal)',border:'none',borderRadius:8,cursor:'pointer'}} onClick={()=>onResolve(lead.entity_id,action)}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────── */
export default function OutreachQueue({openLead}){
  const qc=useQueryClient()
  const [reviewLead,setReviewLead]=useState(null)
  const [viewMode,setViewMode]=useState('all')

  /* Data fetching */
  const {data:queueRaw,isLoading}=useQuery({queryKey:['outreachQueue'],queryFn:()=>api.outreachQueue(200),staleTime:30000})
  const {data:stats}=useQuery({queryKey:['emailStats'],queryFn:api.emailStats,staleTime:30000})
  const {data:autorun}=useQuery({queryKey:['emailAutorun'],queryFn:api.emailAutorun,staleTime:30000})

  const queue=Array.isArray(queueRaw)?queueRaw:(queueRaw?.queue||[])
  const queueTotal=queueRaw?.total||queue.length
  const st=stats?.stats||stats||{}
  const actionCounts=queueRaw?.by_action||{}

  /* Partition queue */
  const needsAttention=useMemo(()=>queue.filter(l=>l.reply_status==='needs_review'||l.reply_status==='replied'||l.reply_status==='bounced'||l.action_type==='overdue_followup'),[queue])
  const readyToSend=useMemo(()=>queue.filter(l=>!needsAttention.includes(l)&&!l.last_outreach_date),[queue,needsAttention])
  const awaitingReply=useMemo(()=>queue.filter(l=>l.last_outreach_date&&l.reply_status!=='needs_review'&&l.reply_status!=='replied'&&l.reply_status!=='bounced'&&l.action_type!=='overdue_followup'),[queue])
  const highValue=useMemo(()=>queue.filter(l=>(l.estimated_monthly_value_gbp||0)>=500),[queue])
  const hotLeads=useMemo(()=>queue.filter(l=>(l.total_score||l.score||0)>80),[queue])

  const displayQueue=useMemo(()=>{
    switch(viewMode){
      case 'attention': return needsAttention
      case 'ready': return readyToSend
      case 'awaiting': return awaitingReply
      case 'highvalue': return highValue
      case 'hot': return hotLeads
      default: return queue
    }
  },[viewMode,queue,needsAttention,readyToSend,awaitingReply,highValue,hotLeads])

  const filterCounts={all:queue.length,attention:needsAttention.length,ready:readyToSend.length,awaiting:awaitingReply.length,highvalue:highValue.length,hot:hotLeads.length}

  /* Autopilot status */
  const autopilotOn=autorun?.running??autorun?.enabled??false
  const sentToday=st.sent_today||0
  const dailyCap=st.daily_cap||50
  const capRemaining=Math.max(0,dailyCap-sentToday)
  const capPct=dailyCap>0?Math.round((sentToday/dailyCap)*100):0

  /* Stats bar counts */
  const repliesCount=useMemo(()=>queue.filter(l=>l.reply_status==='needs_review'||l.reply_status==='replied').length,[queue])
  const interestedCount=useMemo(()=>queue.filter(l=>l.stage==='interested'||l.stage==='meeting_booked'||l.action_type==='active_deal').length,[queue])

  /* Mutations */
  const invalidate=()=>{qc.invalidateQueries({queryKey:['outreachQueue']});qc.invalidateQueries({queryKey:['emailStats']})}
  const resolveMut=useMutation({mutationFn:({entity_id,action})=>api.emailResolve({entity_id,action}),onSuccess:invalidate})
  const sendMut=useMutation({mutationFn:api.sendEmail,onSuccess:invalidate})
  const genMut=useMutation({mutationFn:api.generateOutreach,onSuccess:invalidate})

  const handleDone=useCallback((id)=>resolveMut.mutate({entity_id:id,action:'done'}),[resolveMut])
  const handleResolve=useCallback((id,action)=>{resolveMut.mutate({entity_id:id,action});setReviewLead(null)},[resolveMut])
  const handleSend=useCallback((id)=>sendMut.mutate(id),[sendMut])
  const handleGenerate=useCallback((id)=>genMut.mutate(id),[genMut])
  const busy=resolveMut.isPending||sendMut.isPending||genMut.isPending

  if(isLoading&&!queueRaw)return(
    <div style={{padding:'80px 32px',textAlign:'center'}}>
      <div style={{width:40,height:40,border:'3px solid var(--border)',borderTopColor:'var(--teal)',borderRadius:'50%',animation:'spin .7s linear infinite',margin:'0 auto'}}/>
      <div style={{marginTop:16,color:'var(--text-muted)',fontSize:'0.85rem'}}>Loading outreach queue...</div>
    </div>
  )

  return(
    <div style={{padding:'28px 32px',maxWidth:1200,margin:'0 auto'}}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:'1.6rem',fontWeight:800,letterSpacing:'-.03em',margin:0,color:'var(--text-1)'}}>Outreach Engine</h1>
          <p style={{color:'var(--text-muted)',fontSize:'0.82rem',margin:'6px 0 0',fontWeight:500}}>
            {queueTotal.toLocaleString()} leads in queue &middot; AI-powered sales automation
          </p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button style={{padding:'9px 20px',fontSize:'0.8rem',fontWeight:700,color:'var(--teal)',background:'rgba(20,184,166,.08)',border:'1px solid rgba(20,184,166,.3)',borderRadius:8,cursor:'pointer'}}>
            Settings
          </button>
          <button style={{padding:'9px 20px',fontSize:'0.8rem',fontWeight:700,color:'#fff',background:'var(--teal)',border:'none',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:'1.1rem',lineHeight:1}}>+</span> Add Lead
          </button>
        </div>
      </div>

      {/* ── Send Controls Section ────────────────────────── */}
      <SendControlsBar dailyCap={dailyCap} sentToday={sentToday} capRemaining={capRemaining} capPct={capPct}/>

      {/* ── Outreach Stats Bar ───────────────────────────── */}
      <OutreachStatsBar inQueue={queueTotal} sentToday={sentToday} replies={repliesCount} interested={interestedCount}/>

      {/* ── Autopilot Status Bar ────────────────────────── */}
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 24px',marginBottom:20,borderTop:autopilotOn?'3px solid #059669':'3px solid #DC2626'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>

          {/* Status */}
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{display:'flex',alignItems:'center',gap:8,background:autopilotOn?'rgba(5,150,105,.1)':'rgba(220,38,38,.1)',padding:'6px 14px',borderRadius:20}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:autopilotOn?'#059669':'#DC2626',display:'inline-block',boxShadow:autopilotOn?'0 0 8px rgba(5,150,105,.4)':'none'}}/>
              <span style={{fontSize:'0.72rem',fontWeight:700,color:autopilotOn?'#059669':'#DC2626'}}>{autopilotOn?'Autopilot Active':'Autopilot Paused'}</span>
            </div>
          </div>

          {/* Stats */}
          <div style={{display:'flex',alignItems:'center',gap:24,flexWrap:'wrap'}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'1.2rem',fontWeight:800,color:'var(--text-1)',lineHeight:1}}>{sentToday}<span style={{fontSize:'0.7rem',color:'var(--text-muted)',fontWeight:500}}>/{dailyCap}</span></div>
              <div style={{fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginTop:2,fontWeight:600}}>Sent Today</div>
            </div>

            <div style={{width:120}}>
              <div style={{height:6,background:'rgba(100,116,139,.15)',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${Math.min(capPct,100)}%`,background:capPct>=90?'#DC2626':capPct>=60?'#D97706':'var(--teal)',borderRadius:3,transition:'width .4s ease'}}/>
              </div>
              <div style={{fontSize:'0.58rem',color:'var(--text-muted)',marginTop:3,textAlign:'right',fontWeight:600}}>{capRemaining} remaining</div>
            </div>

            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'1.2rem',fontWeight:800,color:'var(--text-1)',lineHeight:1}}>{needsAttention.length}</div>
              <div style={{fontSize:'0.6rem',color:needsAttention.length>0?'#D97706':'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginTop:2,fontWeight:600}}>Need Attention</div>
            </div>

            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'1.2rem',fontWeight:800,color:'var(--text-1)',lineHeight:1}}>{readyToSend.length}</div>
              <div style={{fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginTop:2,fontWeight:600}}>Ready to Send</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Type Breakdown ─────────────────────── */}
      {Object.keys(actionCounts).length>0&&(
        <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap'}}>
          {Object.entries(actionCounts).sort((a,b)=>b[1]-a[1]).map(([type,count])=>{
            const a=ACTION_LABELS[type]||ACTION_LABELS.standard
            return(
              <div key={type} style={{background:a.bg+'20',border:`1px solid ${a.color}25`,borderRadius:8,padding:'8px 14px',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:'1rem',fontWeight:800,color:a.color,lineHeight:1}}>{count}</span>
                <span style={{fontSize:'0.65rem',fontWeight:600,color:a.color,textTransform:'uppercase',letterSpacing:'.04em'}}>{a.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Queue View Filters (pill row) ────────────── */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {FILTER_PILLS.map(({key,label})=>{
          const active=viewMode===key
          const count=filterCounts[key]||0
          return(
            <button key={key} onClick={()=>setViewMode(key)} style={{
              padding:'7px 16px',fontSize:'0.72rem',fontWeight:active?700:500,
              color:active?'#fff':key==='hot'?'#DC2626':key==='highvalue'?'#059669':key==='attention'?'#D97706':'var(--text-muted)',
              background:active?'var(--teal)':key==='hot'?'rgba(220,38,38,.06)':key==='highvalue'?'rgba(5,150,105,.06)':key==='attention'?'rgba(217,119,6,.06)':'rgba(100,116,139,.08)',
              border:active?'1px solid var(--teal)':`1px solid ${key==='hot'?'rgba(220,38,38,.2)':key==='highvalue'?'rgba(5,150,105,.2)':key==='attention'?'rgba(217,119,6,.2)':'var(--border)'}`,
              borderRadius:20,cursor:'pointer',transition:'all .15s',display:'flex',alignItems:'center',gap:6
            }}>
              {label}
              <span style={{fontSize:'0.6rem',fontWeight:800,background:active?'rgba(255,255,255,.2)':'rgba(100,116,139,.12)',color:active?'#fff':'var(--text-muted)',padding:'0 6px',borderRadius:10,lineHeight:'16px'}}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* ── Lead List ─────────────────────────────────── */}
      {displayQueue.length===0?(
        <div style={{padding:'60px 20px',textAlign:'center'}}>
          <div style={{width:56,height:56,borderRadius:14,background:'rgba(20,184,166,.08)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem',marginBottom:16}}>{viewMode==='attention'?'\u2728':'\u{1F680}'}</div>
          <div style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)',marginBottom:6}}>
            {viewMode==='attention'?'All clear':viewMode==='hot'?'No hot leads':viewMode==='highvalue'?'No high-value leads':'Queue empty'}
          </div>
          <div style={{fontSize:'0.82rem',color:'var(--text-muted)',maxWidth:320,margin:'0 auto'}}>
            {viewMode==='attention'?'No leads need attention right now. Autopilot is handling everything.':viewMode==='hot'?'No leads scoring above 80 in the current queue.':viewMode==='highvalue'?'No leads with estimated monthly value above the threshold.':'All outreach has been sent or is being generated.'}
          </div>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {displayQueue.slice(0,100).map(lead=>(
            <LeadCard
              key={lead.entity_id}
              lead={lead}
              onOpen={openLead}
              onReview={setReviewLead}
              onDone={handleDone}
              onSend={handleSend}
              onGenerate={handleGenerate}
              busy={busy}
              mode={needsAttention.includes(lead)?'attention':'ready'}
              allLeads={queue}
            />
          ))}
          {displayQueue.length>100&&(
            <div style={{padding:'16px',textAlign:'center',fontSize:'0.78rem',color:'var(--text-muted)',fontWeight:600}}>
              Showing 100 of {displayQueue.length} leads
            </div>
          )}
        </div>
      )}

      {/* ── Reply Review Modal ──────────────────────────── */}
      {reviewLead&&(
        <ReplyModal
          lead={reviewLead}
          onClose={()=>setReviewLead(null)}
          onResolve={handleResolve}
        />
      )}
    </div>
  )
}
