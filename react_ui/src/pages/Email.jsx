import {useState} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'

export default function Email({openLead}){
  const qc=useQueryClient()
  const [tab,setTab]=useState('queue')
  const {data:stats}=useQuery({queryKey:['email-stats'],queryFn:api.emailStats,staleTime:30000})
  const {data:queue=[],isLoading:qLoading}=useQuery({queryKey:['email-queue'],queryFn:api.emailQueue,enabled:tab==='queue'})
  const {data:log=[],isLoading:lLoading}=useQuery({queryKey:['email-log'],queryFn:api.emailLog,enabled:tab==='sent'})
  const {data:replies=[],isLoading:rLoading}=useQuery({queryKey:['email-replies'],queryFn:api.emailReplies,enabled:tab==='replies'})
  const {data:guardStats}=useQuery({queryKey:['guard-stats'],queryFn:api.emailGuardStats,enabled:tab==='guard'})
  const {data:guardLog=[]}=useQuery({queryKey:['guard-log'],queryFn:()=>api.emailGuardLog(100),enabled:tab==='guard'})
  const {data:suppressions=[]}=useQuery({queryKey:['guard-suppressions'],queryFn:api.emailGuardSuppressions,enabled:tab==='guard'})

  const sendOne=useMutation({mutationFn:api.emailSendOne,onSuccess:()=>{qc.invalidateQueries({queryKey:['email-queue']});qc.invalidateQueries({queryKey:['email-stats']})}})
  const resolve=useMutation({mutationFn:api.emailResolve,onSuccess:()=>qc.invalidateQueries({queryKey:['email-replies']})})

  const s=stats||{}
  const tabs=[['queue','Queue'],['sent','Sent Log'],['replies','Replies'],['guard','Email Guard']]

  return(
    <div style={{padding:'28px 36px',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}>
        <span style={{background:'var(--teal)',color:'white',fontSize:'0.65rem',fontWeight:700,padding:'3px 10px',borderRadius:4,textTransform:'uppercase'}}>Email</span>
        <h1 style={{fontSize:'1.35rem',fontWeight:800,color:'var(--text-1)',margin:0}}>Email Management</h1>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14,marginBottom:24}}>
        <KPI label="Sent Today" value={`${s.sent_today||0}/${s.daily_cap||50}`} color="var(--teal)"/>
        <KPI label="Daily Cap" value={s.daily_cap||50} color="#3b82f6"/>
        <KPI label="Bounce Rate" value={(s.bounce_rate||0).toFixed(1)+'%'} color={s.bounce_rate>5?'#ef4444':'#10b981'}/>
        <KPI label="Replies Pending" value={s.replies_pending||0} color={s.replies_pending>0?'#f59e0b':'var(--text-muted)'}/>
        <KPI label="Suppressions" value={s.suppressions_count||0} color="#6b7280"/>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--border)',paddingBottom:0}}>
        {tabs.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:'10px 20px',border:'none',borderBottom:tab===k?'2px solid var(--teal)':'2px solid transparent',background:'transparent',color:tab===k?'var(--teal)':'var(--text-muted)',fontSize:'0.82rem',fontWeight:600,cursor:'pointer'}}>{l}
            {k==='replies'&&(s.replies_pending||0)>0&&<span style={{marginLeft:6,background:'#ef4444',color:'white',borderRadius:10,padding:'1px 6px',fontSize:'0.65rem'}}>{s.replies_pending}</span>}
          </button>
        ))}
      </div>

      {/* Queue Tab */}
      {tab==='queue'&&(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          {qLoading?<Loading/>:queue.length===0?(
            <Empty icon="📧" title="Email queue is empty" sub="New emails will appear here when leads are ready for outreach."/>
          ):(
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
              <thead><tr style={{borderBottom:'2px solid var(--border)'}}>
                {['Recipient','Company','Subject','Score','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {queue.map((e,i)=>(
                  <tr key={e.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={tdStyle}><div style={{fontWeight:600,color:'var(--text-1)'}}>{e.contact_name||e.email}</div><div style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{e.email}</div></td>
                    <td style={{...tdStyle,cursor:'pointer',color:'var(--teal)',fontWeight:600}} onClick={()=>e.entity_id&&openLead(e.entity_id)}>{e.company||e.name||'—'}</td>
                    <td style={tdStyle}>{e.subject||'AI-generated outreach'}</td>
                    <td style={tdStyle}><ScoreBadge score={e.score}/></td>
                    <td style={tdStyle}>
                      <div style={{display:'flex',gap:6}}>
                        <Btn label="Send" color="#10b981" onClick={()=>sendOne.mutate({entity_id:e.entity_id})}/>
                        <Btn label="Preview" color="#3b82f6" onClick={()=>e.entity_id&&openLead(e.entity_id)}/>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Sent Log Tab */}
      {tab==='sent'&&(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          {lLoading?<Loading/>:log.length===0?(
            <Empty icon="📬" title="No emails sent yet" sub="Emails will appear here once they're sent from the queue."/>
          ):(
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
              <thead><tr style={{borderBottom:'2px solid var(--border)'}}>
                {['Date','Recipient','Company','Subject','Status'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {log.map((e,i)=>(
                  <tr key={e.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={tdStyle}>{e.sent_at?new Date(e.sent_at).toLocaleDateString():e.date||'—'}</td>
                    <td style={tdStyle}>{e.recipient||e.email||'—'}</td>
                    <td style={{...tdStyle,cursor:'pointer',color:'var(--teal)',fontWeight:600}} onClick={()=>e.entity_id&&openLead(e.entity_id)}>{e.company||e.name||'—'}</td>
                    <td style={tdStyle}>{e.subject||'—'}</td>
                    <td style={tdStyle}><StatusBadge status={e.status||'sent'}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Replies Tab */}
      {tab==='replies'&&(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          {rLoading?<Loading/>:replies.length===0?(
            <Empty icon="💬" title="No replies yet" sub="Replies from leads will appear here for review."/>
          ):(
            <div style={{padding:16}}>
              {replies.map((r,i)=>(
                <div key={r.id||i} style={{padding:16,borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <span style={{fontWeight:700,color:'var(--text-1)',cursor:'pointer'}} onClick={()=>r.entity_id&&openLead(r.entity_id)}>{r.company||r.name||'Unknown'}</span>
                      <span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{r.email}</span>
                    </div>
                    <div style={{fontSize:'0.82rem',color:'var(--text-1)',lineHeight:1.5}}>{r.body||r.snippet||r.notes||'(no preview)'}</div>
                    <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:4}}>{r.received_at?new Date(r.received_at).toLocaleString():'—'}</div>
                  </div>
                  <div style={{display:'flex',gap:6,marginLeft:16}}>
                    <Btn label="Review Reply" color="var(--teal)" onClick={()=>r.entity_id&&openLead(r.entity_id)}/>
                    <Btn label="✓ Done" color="#10b981" onClick={()=>resolve.mutate({entity_id:r.entity_id,action:'resolved'})}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Email Guard Tab */}
      {tab==='guard'&&(
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
            <KPI label="Validated" value={guardStats?.validated||0} color="#10b981"/>
            <KPI label="Bounced" value={guardStats?.bounced||0} color="#ef4444"/>
            <KPI label="Suppressed" value={suppressions.length} color="#f59e0b"/>
            <KPI label="Risky" value={guardStats?.risky||0} color="#6b7280"/>
          </div>

          {suppressions.length>0&&(
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:20,marginBottom:20}}>
              <h3 style={{fontSize:'0.9rem',fontWeight:700,color:'var(--text-1)',marginBottom:12}}>Suppression List ({suppressions.length})</h3>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {suppressions.map((s,i)=>(
                  <span key={i} style={{padding:'4px 12px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:20,fontSize:'0.75rem',color:'#dc2626'}}>{s.email||s}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
              <thead><tr style={{borderBottom:'2px solid var(--border)'}}>
                {['Date','Email','Status','Reason'].map(h=><th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {guardLog.length===0?(
                  <tr><td colSpan={4} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No guard events logged yet.</td></tr>
                ):guardLog.map((e,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={tdStyle}>{e.created_at?new Date(e.created_at).toLocaleDateString():'—'}</td>
                    <td style={tdStyle}>{e.email||'—'}</td>
                    <td style={tdStyle}><StatusBadge status={e.status||'unknown'}/></td>
                    <td style={tdStyle}>{e.reason||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle={padding:'12px 14px',textAlign:'left',fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em'}
const tdStyle={padding:'12px 14px',color:'var(--text-1)'}

function KPI({label,value,color}){
  return(
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
      <div style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:'1.5rem',fontWeight:800,color:color||'var(--text-1)'}}>{value}</div>
    </div>
  )
}
function ScoreBadge({score}){
  const band=score>=80?'A':score>=60?'B':score>=40?'C':'D'
  const colors={A:'#10b981',B:'#3b82f6',C:'#f59e0b',D:'#ef4444'}
  return <span style={{padding:'2px 8px',borderRadius:4,fontSize:'0.72rem',fontWeight:700,color:colors[band],background:colors[band]+'18'}}>{band} ({score})</span>
}
function StatusBadge({status}){
  const colors={sent:'#10b981',delivered:'#10b981',opened:'#3b82f6',bounced:'#ef4444',failed:'#ef4444',suppressed:'#f59e0b',pending:'#6b7280',validated:'#10b981',risky:'#f59e0b',invalid:'#ef4444'}
  return <span style={{padding:'2px 10px',borderRadius:12,fontSize:'0.72rem',fontWeight:600,color:colors[status]||'#6b7280',background:(colors[status]||'#6b7280')+'18'}}>{status}</span>
}
function Btn({label,color,onClick}){
  return <button onClick={onClick} style={{padding:'5px 12px',borderRadius:'var(--r-sm)',border:'none',background:color+'18',color,fontSize:'0.75rem',fontWeight:600,cursor:'pointer'}}>{label}</button>
}
function Loading(){return <div style={{textAlign:'center',padding:60,color:'var(--text-muted)'}}>Loading...</div>}
function Empty({icon,title,sub}){
  return <div style={{textAlign:'center',padding:60}}><div style={{fontSize:'2rem',marginBottom:8}}>{icon}</div><div style={{fontSize:'0.95rem',fontWeight:600,color:'var(--text-1)'}}>{title}</div><div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:6}}>{sub}</div></div>
}
