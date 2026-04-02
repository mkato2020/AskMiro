import {useState,useCallback} from 'react'
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
  return `${d}d ago`
}

/* ── styles ──────────────────────────────────────────────── */
const card={background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'20px 24px',marginBottom:16}
const badge=(bg,color)=>({display:'inline-flex',alignItems:'center',gap:6,background:bg,color,fontSize:'0.72rem',fontWeight:700,padding:'4px 12px',borderRadius:20,whiteSpace:'nowrap'})
const btnTeal={background:'var(--teal)',color:'#fff',border:'none',borderRadius:'var(--r-sm)',padding:'7px 16px',fontSize:'0.78rem',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}
const btnOutline={background:'transparent',border:'1px solid var(--border)',color:'var(--text-1)',borderRadius:'var(--r-sm)',padding:'7px 14px',fontSize:'0.78rem',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}
const btnDone={background:'#ECFDF5',color:'#059669',border:'1px solid #A7F3D0',borderRadius:'var(--r-sm)',padding:'7px 14px',fontSize:'0.78rem',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}
const sectionTitle={fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',marginBottom:12}
const countBadge=(n)=>({display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:22,height:22,borderRadius:11,background:n>0?'#FEF2F2':'#F1F5F9',color:n>0?'#DC2626':'var(--text-muted)',fontSize:'0.7rem',fontWeight:800,padding:'0 6px',marginLeft:8})

/* ── Stat Pill for autopilot bar ─────────────────────────── */
function StatPill({label,value,sub}){
  return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:80}}>
      <div style={{fontSize:'1.1rem',fontWeight:800,color:'var(--text-1)',letterSpacing:'-.02em'}}>{value}</div>
      <div style={{fontSize:'0.65rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{label}</div>
      {sub&&<div style={{fontSize:'0.62rem',color:'var(--text-muted)',marginTop:1}}>{sub}</div>}
    </div>
  )
}

/* ── Lead Card ───────────────────────────────────────────── */
function LeadCard({lead,onOpen,onReview,onDone,busy}){
  const hasReply=lead.reply_status==='needs_review'||lead.reply_status==='replied'
  return(
    <div style={{display:'flex',alignItems:'center',gap:16,padding:'14px 18px',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',marginBottom:8}}>
      {/* Icon */}
      <div style={{width:40,height:40,borderRadius:'50%',background:hasReply?'#FEF3C7':'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <span style={{fontSize:'1.1rem'}}>{hasReply?'💬':'?'}</span>
      </div>

      {/* Info */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span
            onClick={()=>onOpen(lead.entity_id)}
            style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)',cursor:'pointer',textDecoration:'none'}}
            onMouseEnter={e=>e.target.style.textDecoration='underline'}
            onMouseLeave={e=>e.target.style.textDecoration='none'}
          >{lead.name||'Unknown'}</span>
          {lead.score!=null&&<span style={badge('#EFF6FF','#2563EB')}>{lead.score}</span>}
          {lead.stage&&<span style={{fontSize:'0.68rem',color:'var(--text-muted)',fontWeight:500}}>{lead.stage}</span>}
        </div>
        <div style={{fontSize:'0.76rem',color:'var(--text-muted)',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {lead.contact_name&&<span style={{fontWeight:600}}>{lead.contact_name}</span>}
          {lead.contact_role&&<span> · {lead.contact_role}</span>}
          {lead.email&&<span> · {lead.email}</span>}
        </div>
        <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:2}}>
          {lead.outreach_count>0&&<span>Sent {lead.outreach_count}x</span>}
          {lead.last_outreach_date&&<span> · Last: {timeAgo(lead.last_outreach_date)}</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:8,flexShrink:0}}>
        {hasReply&&(
          <button style={btnTeal} onClick={()=>onReview(lead)} disabled={busy}>Review Reply</button>
        )}
        <button style={btnDone} onClick={()=>onDone(lead.entity_id)} disabled={busy}>&#10003; Done</button>
      </div>
    </div>
  )
}

/* ── Ready-to-Send Card ──────────────────────────────────── */
function ReadyCard({lead,onOpen,onSend,onGenerate,busy}){
  return(
    <div style={{display:'flex',alignItems:'center',gap:16,padding:'14px 18px',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',marginBottom:8}}>
      <div style={{width:40,height:40,borderRadius:'50%',background:'#EFF6FF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <span style={{fontSize:'1rem'}}>&#9993;</span>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span
            onClick={()=>onOpen(lead.entity_id)}
            style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)',cursor:'pointer'}}
            onMouseEnter={e=>e.target.style.textDecoration='underline'}
            onMouseLeave={e=>e.target.style.textDecoration='none'}
          >{lead.name||'Unknown'}</span>
          {lead.stage&&<span style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>({lead.stage})</span>}
        </div>
        <div style={{fontSize:'0.76rem',color:'var(--text-muted)',marginTop:2}}>
          {lead.contact_name||lead.email||'No contact'}
          {lead.outreach_count>0&&<span> · Attempt #{lead.outreach_count+1}</span>}
        </div>
      </div>
      <div style={{display:'flex',gap:8,flexShrink:0}}>
        <button style={btnOutline} onClick={()=>onGenerate(lead.entity_id)} disabled={busy}>AI Draft</button>
        <button style={btnTeal} onClick={()=>onSend(lead.entity_id)} disabled={busy}>Send</button>
      </div>
    </div>
  )
}

/* ── Reply Review Modal ──────────────────────────────────── */
function ReplyModal({lead,onClose,onResolve}){
  const [action,setAction]=useState('done')
  if(!lead) return null
  return(
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.45)'}}>
      <div style={{background:'var(--bg-surface)',borderRadius:'var(--r-lg)',padding:'28px 32px',width:'100%',maxWidth:520,maxHeight:'80vh',overflow:'auto',boxShadow:'0 24px 48px rgba(0,0,0,.2)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h3 style={{margin:0,fontSize:'1.1rem',fontWeight:800}}>Reply from {lead.name}</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'1.2rem',cursor:'pointer',color:'var(--text-muted)'}}>&#10005;</button>
        </div>

        <div style={{background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'16px 18px',marginBottom:16}}>
          <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginBottom:6}}>
            <strong>{lead.contact_name||lead.name}</strong> &middot; {lead.email} &middot; {timeAgo(lead.last_outreach_date)}
          </div>
          <div style={{fontSize:'0.84rem',color:'var(--text-1)',lineHeight:1.6}}>
            {lead.reply_body||'Reply content will appear here once loaded from the email system.'}
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <div style={sectionTitle}>Resolution</div>
          <div style={{display:'flex',gap:8}}>
            {[['done','Mark Done'],['followup','Follow Up'],['meeting','Book Meeting'],['disqualify','Disqualify']].map(([v,l])=>(
              <button key={v} onClick={()=>setAction(v)} style={{...btnOutline,...(action===v?{background:'var(--teal)',color:'#fff',borderColor:'var(--teal)'}:{})}}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
          <button style={btnOutline} onClick={onClose}>Cancel</button>
          <button style={btnTeal} onClick={()=>onResolve(lead.entity_id,action)}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────── */
export default function OutreachQueue({openLead}){
  const qc=useQueryClient()
  const [reviewLead,setReviewLead]=useState(null)

  /* Data fetching */
  const {data:queueRaw}=useQuery({queryKey:['outreachQueue'],queryFn:()=>api.outreachQueue(200),staleTime:30000})
  const {data:stats}=useQuery({queryKey:['emailStats'],queryFn:api.emailStats,staleTime:30000})
  const {data:autorun}=useQuery({queryKey:['emailAutorun'],queryFn:api.emailAutorun,staleTime:30000})

  const queue=Array.isArray(queueRaw)?queueRaw:(queueRaw?.queue||[])
  const st=stats?.stats||stats||{}

  /* Partition queue */
  const needsAttention=queue.filter(l=>l.reply_status==='needs_review'||l.reply_status==='replied'||l.reply_status==='bounced')
  const readyToSend=queue.filter(l=>!needsAttention.includes(l))

  /* Autopilot status */
  const autopilotOn=autorun?.running??autorun?.enabled??false
  const sentToday=st.sent_today||0
  const dailyCap=st.daily_cap||50
  const capRemaining=Math.max(0,dailyCap-sentToday)
  const capPct=dailyCap>0?Math.round((sentToday/dailyCap)*100):0
  const inSequence=st.in_sequence||queue.length
  const qualified=st.qualified||0

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

  return(
    <div style={{padding:'28px 32px',maxWidth:1100,margin:'0 auto',fontFamily:'Inter,system-ui,sans-serif'}}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-.02em',margin:0}}>Outreach Queue</h1>
          <p style={{color:'var(--text-muted)',fontSize:'0.82rem',margin:'6px 0 0'}}>AI-powered sales engine &mdash; autopilot handles the heavy lifting</p>
        </div>
        <button style={{...btnTeal,padding:'10px 22px',fontSize:'0.84rem'}}>+ Add Lead</button>
      </div>

      {/* ── Autopilot Status Bar ────────────────────────── */}
      <div style={{...card,padding:'18px 24px',marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>

          {/* Status badge */}
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={badge(autopilotOn?'#ECFDF5':'#FEF2F2',autopilotOn?'#059669':'#DC2626')}>
              <span style={{width:8,height:8,borderRadius:'50%',background:autopilotOn?'#059669':'#DC2626',display:'inline-block'}}/>
              {autopilotOn?'Autopilot Running':'Autopilot Paused'}
            </span>
          </div>

          {/* Stats row */}
          <div style={{display:'flex',alignItems:'center',gap:28,flexWrap:'wrap'}}>
            <StatPill label="Sends Today" value={`${sentToday}/${dailyCap}`}/>
            <StatPill label="Cap Remaining" value={capRemaining}/>

            {/* Progress bar */}
            <div style={{minWidth:120}}>
              <div style={{fontSize:'0.65rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Daily Capacity</div>
              <div style={{height:8,background:'var(--border)',borderRadius:4,overflow:'hidden',position:'relative'}}>
                <div style={{height:'100%',width:`${Math.min(capPct,100)}%`,background:capPct>=90?'#DC2626':capPct>=60?'#D97706':'var(--teal)',borderRadius:4,transition:'width .4s ease'}}/>
              </div>
              <div style={{fontSize:'0.62rem',color:'var(--text-muted)',marginTop:2,textAlign:'right'}}>{capPct}%</div>
            </div>

            <StatPill label="In Sequence" value={inSequence}/>
            <StatPill label="Qualified" value={qualified}/>
          </div>
        </div>

        {/* Schedule info */}
        <div style={{marginTop:12,fontSize:'0.72rem',color:'var(--text-muted)',borderTop:'1px solid var(--border)',paddingTop:10}}>
          Sends every 4h &middot; Reply scan every 2h &middot; Fully automated
        </div>
      </div>

      {/* ── Needs Your Attention ────────────────────────── */}
      <div style={{marginBottom:28}}>
        <div style={{display:'flex',alignItems:'center',marginBottom:14}}>
          <h2 style={{fontSize:'1.05rem',fontWeight:800,margin:0,letterSpacing:'-.01em'}}>Needs Your Attention</h2>
          <span style={countBadge(needsAttention.length)}>{needsAttention.length}</span>
        </div>
        <p style={{fontSize:'0.78rem',color:'var(--text-muted)',margin:'-6px 0 14px'}}>These leads need a human touch &mdash; everything else runs automatically</p>

        {needsAttention.length===0?(
          <div style={{...card,textAlign:'center',padding:'32px 24px'}}>
            <div style={{fontSize:'1.5rem',marginBottom:8}}>&#10024;</div>
            <div style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>All clear</div>
            <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:4}}>No leads need attention right now. Autopilot is handling it.</div>
          </div>
        ):(
          needsAttention.map(lead=>(
            <LeadCard
              key={lead.entity_id}
              lead={lead}
              onOpen={openLead}
              onReview={setReviewLead}
              onDone={handleDone}
              busy={busy}
            />
          ))
        )}
      </div>

      {/* ── Ready to Send ───────────────────────────────── */}
      <div style={{marginBottom:28}}>
        <div style={{display:'flex',alignItems:'center',marginBottom:14}}>
          <h2 style={{fontSize:'1.05rem',fontWeight:800,margin:0,letterSpacing:'-.01em'}}>Ready to Send</h2>
          <span style={countBadge(0)}>{readyToSend.length}</span>
        </div>
        <p style={{fontSize:'0.78rem',color:'var(--text-muted)',margin:'-6px 0 14px'}}>AI-generated emails queued up &mdash; review or let autopilot handle them</p>

        {readyToSend.length===0?(
          <div style={{...card,textAlign:'center',padding:'32px 24px'}}>
            <div style={{fontSize:'1.5rem',marginBottom:8}}>&#128640;</div>
            <div style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Queue empty</div>
            <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:4}}>All outreach has been sent or is being generated.</div>
          </div>
        ):(
          readyToSend.map(lead=>(
            <ReadyCard
              key={lead.entity_id}
              lead={lead}
              onOpen={openLead}
              onSend={handleSend}
              onGenerate={handleGenerate}
              busy={busy}
            />
          ))
        )}
      </div>

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
