import {useState,useEffect} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'

export default function LeadModal({lead,onClose}){
  // ALL hooks must be called before any conditional return (React rules of hooks)
  const qc=useQueryClient()
  const id=lead?.entity_id||lead?.place_id||lead?.id||null
  const [tab,setTab]=useState('overview')
  const [noteText,setNoteText]=useState('')

  const {data:activities=[]}=useQuery({queryKey:['activities',id],queryFn:()=>api.activities(id),enabled:!!id&&!!lead&&tab==='activity'})
  const {data:notes=[]}=useQuery({queryKey:['notes',id],queryFn:()=>api.notes(id),enabled:!!id&&!!lead&&tab==='notes'})
  const {data:intel}=useQuery({queryKey:['intel',id],queryFn:()=>api.intelligence(id),enabled:!!id&&!!lead&&tab==='intel',retry:false})

  const addNote=useMutation({mutationFn:()=>api.addNote(id,{content:noteText}),onSuccess:()=>{setNoteText('');qc.invalidateQueries({queryKey:['notes',id]})}})
  const archiveLead=useMutation({mutationFn:()=>api.archiveLead(id),onSuccess:onClose})
  const genOutreach=useMutation({mutationFn:()=>api.generateOutreach(id)})

  // Reset tab when lead changes
  useEffect(()=>{if(lead)setTab('overview')},[lead])

  // Now safe to return null after all hooks are called
  if(!lead)return null

  const scoreBand=lead.score>=80?'A':lead.score>=60?'B':lead.score>=40?'C':'D'
  const scoreColor={A:'#10b981',B:'#3b82f6',C:'#f59e0b',D:'#ef4444'}[scoreBand]

  return(
    <div style={{position:'fixed',inset:0,zIndex:1000,display:'flex',justifyContent:'flex-end'}} onClick={onClose}>
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)'}}/>
      <div style={{
        width:520,maxWidth:'90vw',height:'100vh',background:'var(--bg-surface)',
        boxShadow:'-4px 0 20px rgba(0,0,0,0.3)',
        display:'flex',flexDirection:'column',position:'relative',zIndex:1,
        overflow:'hidden',
      }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                <h2 style={{fontSize:'1.15rem',fontWeight:800,color:'var(--text-1)',margin:0}}>{lead.name||'Unknown'}</h2>
                {lead.score!=null&&<span style={{padding:'2px 8px',borderRadius:4,fontSize:'0.7rem',fontWeight:700,color:scoreColor,background:scoreColor+'18'}}>{scoreBand} ({lead.score})</span>}
              </div>
              <div style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>
                {lead.sector&&<span style={{marginRight:8}}>{lead.sector}</span>}
                {lead.borough&&<span>{lead.borough}</span>}
                {lead.postcode&&<span style={{marginLeft:8}}>{lead.postcode}</span>}
              </div>
              {lead.pipeline_stage&&(
                <span style={{display:'inline-block',marginTop:6,padding:'2px 10px',borderRadius:12,fontSize:'0.7rem',fontWeight:600,color:'var(--teal)',background:'var(--teal)18'}}>{lead.pipeline_stage.replace(/_/g,' ')}</span>
              )}
            </div>
            <button onClick={onClose} style={{border:'none',background:'transparent',fontSize:'1.2rem',cursor:'pointer',color:'var(--text-muted)',padding:4}}>&#10005;</button>
          </div>

          {/* Contact Info */}
          <div style={{display:'flex',gap:16,marginTop:12,flexWrap:'wrap'}}>
            {lead.contact_name&&<InfoChip icon="&#128100;" value={lead.contact_name} sub={lead.contact_role}/>}
            {lead.phone&&<InfoChip icon="&#128222;" value={lead.phone} href={'tel:'+lead.phone}/>}
            {lead.email&&<InfoChip icon="&#128231;" value={lead.email} href={'mailto:'+lead.email}/>}
            {lead.website&&<InfoChip icon="&#127760;" value={lead.website} href={lead.website.startsWith('http')?lead.website:'https://'+lead.website}/>}
          </div>

          {/* Quick Actions */}
          <div style={{display:'flex',gap:6,marginTop:14}}>
            <ActionBtn label="Generate Outreach" color="var(--teal)" loading={genOutreach.isPending} onClick={()=>genOutreach.mutate()}/>
            {lead.phone&&<ActionBtn label="Log Call" color="#3b82f6" onClick={()=>setTab('activity')}/>}
            <ActionBtn label="Archive" color="#ef4444" onClick={()=>{if(confirm('Archive this lead?'))archiveLead.mutate()}}/>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',flexShrink:0,padding:'0 24px'}}>
          {[['overview','Overview'],['activity','Activity'],['notes','Notes'],['intel','Intelligence']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{
              padding:'10px 16px',border:'none',borderBottom:tab===k?'2px solid var(--teal)':'2px solid transparent',
              background:'transparent',color:tab===k?'var(--teal)':'var(--text-muted)',
              fontSize:'0.8rem',fontWeight:600,cursor:'pointer',
            }}>{l}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:'auto',padding:24}}>
          {/* Overview Tab */}
          {tab==='overview'&&(
            <div>
              {lead.address&&<DetailRow label="Address" value={lead.address}/>}
              {lead.formatted_address&&<DetailRow label="Address" value={lead.formatted_address}/>}
              {lead.kind&&<DetailRow label="Type" value={lead.kind}/>}
              {lead.sector&&<DetailRow label="Sector" value={lead.sector}/>}
              {lead.borough&&<DetailRow label="Borough" value={lead.borough}/>}
              {lead.pipeline_stage&&<DetailRow label="Stage" value={lead.pipeline_stage.replace(/_/g,' ')}/>}
              {lead.score!=null&&<DetailRow label="Score" value={`${lead.score} (${scoreBand})`}/>}
              {lead.last_activity_date&&<DetailRow label="Last Activity" value={new Date(lead.last_activity_date).toLocaleDateString()}/>}
              {lead.created_at&&<DetailRow label="Added" value={new Date(lead.created_at).toLocaleDateString()}/>}
              {lead.next_best_action&&<DetailRow label="Next Action" value={lead.next_best_action}/>}

              {genOutreach.data&&(
                <div style={{marginTop:20,padding:16,background:'var(--bg-base)',borderRadius:'var(--r-sm)',border:'1px solid var(--border)'}}>
                  <div style={{fontSize:'0.75rem',fontWeight:700,color:'var(--teal)',marginBottom:8}}>AI-Generated Outreach</div>
                  <div style={{fontSize:'0.82rem',color:'var(--text-1)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{genOutreach.data.subject&&<div style={{fontWeight:600,marginBottom:4}}>Subject: {genOutreach.data.subject}</div>}{genOutreach.data.body||genOutreach.data.content||JSON.stringify(genOutreach.data,null,2)}</div>
                </div>
              )}
            </div>
          )}

          {/* Activity Tab */}
          {tab==='activity'&&(
            <div>
              {activities.length===0?(
                <div style={{textAlign:'center',padding:40,color:'var(--text-muted)',fontSize:'0.85rem'}}>No activities logged yet.</div>
              ):activities.map((a,i)=>(
                <div key={a.id||i} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'0.82rem',fontWeight:600,color:'var(--text-1)'}}>{a.activity_type||a.type||'Activity'}</span>
                    <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{a.created_at?new Date(a.created_at).toLocaleString():'—'}</span>
                  </div>
                  {(a.outcome||a.notes)&&<div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:4}}>{a.outcome||a.notes}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Notes Tab */}
          {tab==='notes'&&(
            <div>
              <div style={{display:'flex',gap:8,marginBottom:16}}>
                <input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Add a note..." style={{flex:1,padding:'10px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',background:'var(--bg-base)',color:'var(--text-1)',fontSize:'0.82rem'}}
                  onKeyDown={e=>{if(e.key==='Enter'&&noteText.trim())addNote.mutate()}}/>
                <button onClick={()=>noteText.trim()&&addNote.mutate()} disabled={addNote.isPending} style={{padding:'10px 16px',border:'none',borderRadius:'var(--r-sm)',background:'var(--teal)',color:'white',fontSize:'0.8rem',fontWeight:600,cursor:'pointer'}}>Add</button>
              </div>
              {notes.length===0?(
                <div style={{textAlign:'center',padding:40,color:'var(--text-muted)',fontSize:'0.85rem'}}>No notes yet.</div>
              ):notes.map((n,i)=>(
                <div key={n.id||i} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontSize:'0.82rem',color:'var(--text-1)',lineHeight:1.5}}>{n.content||n.text||n.notes}</div>
                  <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:4}}>{n.created_at?new Date(n.created_at).toLocaleString():'—'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Intelligence Tab */}
          {tab==='intel'&&(
            <div>
              {!intel?(
                <div style={{textAlign:'center',padding:40,color:'var(--text-muted)',fontSize:'0.85rem'}}>Loading intelligence data...</div>
              ):(
                <div>
                  {intel.summary&&<div style={{fontSize:'0.85rem',color:'var(--text-1)',lineHeight:1.6,marginBottom:16}}>{intel.summary}</div>}
                  {intel.estimated_value&&<DetailRow label="Estimated Value" value={'£'+Number(intel.estimated_value).toLocaleString()+'/yr'}/>}
                  {intel.estimated_sqft&&<DetailRow label="Est. Size" value={intel.estimated_sqft+' sqft'}/>}
                  {intel.competitor_info&&<DetailRow label="Competitor Intel" value={intel.competitor_info}/>}
                  {intel.decision_maker&&<DetailRow label="Decision Maker" value={intel.decision_maker}/>}
                  {intel.cleaning_needs&&<DetailRow label="Cleaning Needs" value={intel.cleaning_needs}/>}
                  {intel.recommended_approach&&(
                    <div style={{marginTop:16,padding:14,background:'var(--teal)08',border:'1px solid var(--teal)30',borderRadius:'var(--r-sm)'}}>
                      <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--teal)',marginBottom:4}}>Recommended Approach</div>
                      <div style={{fontSize:'0.82rem',color:'var(--text-1)',lineHeight:1.5}}>{intel.recommended_approach}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoChip({icon,value,sub,href}){
  const content=(
    <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',background:'var(--bg-base)',borderRadius:'var(--r-sm)',fontSize:'0.75rem'}}>
      <span>{icon}</span>
      <div>
        <div style={{color:href?'var(--teal)':'var(--text-1)',fontWeight:500}}>{value}</div>
        {sub&&<div style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>{sub}</div>}
      </div>
    </div>
  )
  if(href)return <a href={href} target="_blank" rel="noopener noreferrer" style={{textDecoration:'none'}}>{content}</a>
  return content
}

function ActionBtn({label,color,onClick,loading}){
  return(
    <button onClick={onClick} disabled={loading} style={{
      padding:'6px 14px',borderRadius:'var(--r-sm)',border:'none',
      background:color+'18',color,fontSize:'0.75rem',fontWeight:600,cursor:'pointer',
      opacity:loading?0.6:1,
    }}>{loading?'...':label}</button>
  )
}

function DetailRow({label,value}){
  return(
    <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
      <span style={{fontSize:'0.8rem',color:'var(--text-muted)',fontWeight:500}}>{label}</span>
      <span style={{fontSize:'0.8rem',color:'var(--text-1)',fontWeight:500,textAlign:'right',maxWidth:'60%'}}>{value}</span>
    </div>
  )
}
