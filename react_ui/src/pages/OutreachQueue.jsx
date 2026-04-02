import {useState,useCallback,useMemo} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'

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

/* ── Lead Card ───────────────────────────────────────────── */
function LeadCard({lead,onOpen,onReview,onDone,onSend,onGenerate,busy,mode}){
  const hasReply=lead.reply_status==='needs_review'||lead.reply_status==='replied'
  const score=lead.total_score||lead.score
  const sb=score!=null?scoreBand(score):null
  const action=ACTION_LABELS[lead.action_type]||ACTION_LABELS.standard
  const sec=SECTOR_COLORS[(lead.sector||'').toLowerCase()]||DEFAULT_SECTOR

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
            <span style={{background:action.bg,color:action.color,fontSize:'0.58rem',fontWeight:700,padding:'1px 8px',borderRadius:8}}>{action.label}</span>
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
  const [viewMode,setViewMode]=useState('all') // all, attention, ready

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
  const readyToSend=useMemo(()=>queue.filter(l=>!needsAttention.includes(l)),[queue,needsAttention])
  const displayQueue=viewMode==='attention'?needsAttention:viewMode==='ready'?readyToSend:queue

  /* Autopilot status */
  const autopilotOn=autorun?.running??autorun?.enabled??false
  const sentToday=st.sent_today||0
  const dailyCap=st.daily_cap||50
  const capRemaining=Math.max(0,dailyCap-sentToday)
  const capPct=dailyCap>0?Math.round((sentToday/dailyCap)*100):0

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
            {queueTotal.toLocaleString()} leads in queue \u00B7 AI-powered sales automation
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

      {/* ── View Toggle ───────────────────────────────── */}
      <div style={{display:'flex',gap:0,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
        {[['all','All Queue',queue.length],['attention','Needs Attention',needsAttention.length],['ready','Ready to Send',readyToSend.length]].map(([key,label,count])=>(
          <button key={key} onClick={()=>setViewMode(key)} style={{
            padding:'10px 20px',fontSize:'0.8rem',fontWeight:viewMode===key?700:500,
            color:viewMode===key?'var(--teal)':'var(--text-muted)',background:'none',border:'none',
            borderBottom:viewMode===key?'2px solid var(--teal)':'2px solid transparent',
            cursor:'pointer',transition:'all .15s',display:'flex',alignItems:'center',gap:8
          }}>
            {label}
            <span style={{fontSize:'0.65rem',fontWeight:800,background:viewMode===key?'rgba(20,184,166,.12)':'rgba(100,116,139,.1)',color:viewMode===key?'var(--teal)':'var(--text-muted)',padding:'1px 8px',borderRadius:10}}>{count}</span>
          </button>
        ))}
      </div>

      {/* ── Lead List ─────────────────────────────────── */}
      {displayQueue.length===0?(
        <div style={{padding:'60px 20px',textAlign:'center'}}>
          <div style={{width:56,height:56,borderRadius:14,background:'rgba(20,184,166,.08)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem',marginBottom:16}}>{viewMode==='attention'?'\u2728':'\u{1F680}'}</div>
          <div style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)',marginBottom:6}}>
            {viewMode==='attention'?'All clear':'Queue empty'}
          </div>
          <div style={{fontSize:'0.82rem',color:'var(--text-muted)',maxWidth:320,margin:'0 auto'}}>
            {viewMode==='attention'?'No leads need attention right now. Autopilot is handling everything.':'All outreach has been sent or is being generated.'}
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
