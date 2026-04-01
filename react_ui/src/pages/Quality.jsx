import {useState,useCallback} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {formatDate} from '../utils'
import Spinner from '../components/Spinner'

const scoreColor=s=>s>=90?{bg:'#ECFDF5',fg:'#059669'}:s>=70?{bg:'#FFFBEB',fg:'#D97706'}:{bg:'#FEF2F2',fg:'#DC2626'}
const statusPill=s=>s==='Resolved'?{bg:'#ECFDF5',fg:'#059669'}:{bg:'#FEF2F2',fg:'#DC2626'}
const typePill=t=>({Complaint:{bg:'#FEF2F2',fg:'#DC2626'},'Near Miss':{bg:'#FFFBEB',fg:'#D97706'},Accident:{bg:'#FEE2E2',fg:'#B91C1C'},Reclean:{bg:'#EFF6FF',fg:'#2563EB'}}[t]||{bg:'#F3F4F6',fg:'#6B7280'})

const pill=(bg,fg,text)=>({display:'inline-block',fontSize:'0.75rem',fontWeight:700,padding:'3px 10px',borderRadius:20,background:bg,color:fg,whiteSpace:'nowrap'})
const thStyle={padding:'10px 16px',textAlign:'left',fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)'}
const tdStyle={padding:'12px 16px',fontSize:'0.85rem'}
const btnBase={border:'none',borderRadius:'var(--r-md)',fontWeight:700,fontSize:'0.8rem',cursor:'pointer',padding:'8px 18px',transition:'opacity .15s'}
const overlay={position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999}
const modal={background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'28px 32px',width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto'}
const labelStyle={display:'block',fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}
const inputStyle={width:'100%',padding:'9px 12px',borderRadius:'var(--r-md)',border:'1px solid var(--border)',background:'var(--bg-input,var(--bg-surface))',color:'var(--text-1)',fontSize:'0.875rem',boxSizing:'border-box'}

function Modal({open,onClose,title,children}){
  if(!open)return null
  return(<div style={overlay} onClick={onClose}><div style={modal} onClick={e=>e.stopPropagation()}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
      <h2 style={{margin:0,fontSize:'1.1rem',fontWeight:800}}>{title}</h2>
      <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'1.2rem',cursor:'pointer',padding:4}}>&times;</button>
    </div>
    {children}
  </div></div>)
}

function Field({label,children}){return(<div style={{marginBottom:16}}><label style={labelStyle}>{label}</label>{children}</div>)}

const todayISO=()=>new Date().toISOString().split('T')[0]

export default function Quality(){
  const qc=useQueryClient()
  const {data,isLoading}=useQuery({queryKey:['quality'],queryFn:api.quality,staleTime:60000})
  const q=data||{}

  const [tab,setTab]=useState('inspections')
  const [showInspection,setShowInspection]=useState(false)
  const [showIncident,setShowIncident]=useState(false)
  const [resolveTarget,setResolveTarget]=useState(null)

  // Inspection form
  const emptyInsp={site_id:'',client_name:'',inspection_date:todayISO(),inspector:'',score:'',notes:''}
  const [inspForm,setInspForm]=useState(emptyInsp)
  const updInsp=useCallback((k,v)=>setInspForm(f=>({...f,[k]:v})),[])

  // Incident form
  const emptyInc={site_id:'',client_name:'',incident_type:'',description:''}
  const [incForm,setIncForm]=useState(emptyInc)
  const updInc=useCallback((k,v)=>setIncForm(f=>({...f,[k]:v})),[])

  // Resolve form
  const [resolution,setResolution]=useState('')

  const createInsp=useMutation({mutationFn:b=>api.createInspection(b),onSuccess:()=>{qc.invalidateQueries({queryKey:['quality']});setShowInspection(false);setInspForm(emptyInsp)}})
  const createInc=useMutation({mutationFn:b=>api.createIncident(b),onSuccess:()=>{qc.invalidateQueries({queryKey:['quality']});setShowIncident(false);setIncForm(emptyInc)}})
  const resolveInc=useMutation({mutationFn:({id,body})=>api.resolveIncident(id,body),onSuccess:()=>{qc.invalidateQueries({queryKey:['quality']});setResolveTarget(null);setResolution('')}})

  const inspections=q.inspections||[]
  const incidents=q.incidents||[]
  const openCount=q.open_incidents||0

  const avgScore=q.avg_score
  const avgColor=avgScore!=null?scoreColor(avgScore):{fg:'var(--text-1)'}

  const handleSaveInspection=e=>{
    e.preventDefault()
    if(!inspForm.site_id||!inspForm.inspector||inspForm.score==='')return
    createInsp.mutate({...inspForm,score:Number(inspForm.score)})
  }
  const handleRaiseIncident=e=>{
    e.preventDefault()
    if(!incForm.site_id||!incForm.incident_type||!incForm.description)return
    createInc.mutate(incForm)
  }
  const handleResolve=e=>{
    e.preventDefault()
    if(!resolution.trim()||!resolveTarget)return
    resolveInc.mutate({id:resolveTarget.id,body:{resolution}})
  }

  return(
    <div style={{padding:'28px 32px',maxWidth:1100,margin:'0 auto'}}>
      {/* Header */}
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-.02em',margin:0}}>Quality</h1>
        <p style={{fontSize:'0.875rem',color:'var(--text-3)',marginTop:4}}>Inspections, incidents & QA tracking</p>
      </div>

      {/* KPI Cards */}
      <div style={{display:'flex',gap:16,marginBottom:24,flexWrap:'wrap'}}>
        {[
          {l:'Average Score',v:avgScore!=null?avgScore.toFixed(1):'--',c:avgColor.fg},
          {l:'Inspections This Month',v:q.inspections_this_month||0},
          {l:'Open Incidents',v:openCount,c:openCount>0?'#DC2626':'var(--text-1)',badge:openCount>0},
          {l:'Total Inspections',v:q.total_inspections||0}
        ].map((k,i)=>(
          <div key={i} style={{flex:1,minWidth:140,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px',position:'relative'}}>
            <div style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:'1.4rem',fontWeight:800,color:k.c||'var(--text-1)'}}>{k.v}</div>
            {k.badge&&<span style={{position:'absolute',top:12,right:14,width:8,height:8,borderRadius:'50%',background:'#DC2626'}}/>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid var(--border)'}}>
        {[{key:'inspections',label:'Inspections'},{key:'incidents',label:'Incidents',badge:openCount}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:'10px 20px',fontSize:'0.85rem',fontWeight:tab===t.key?700:500,
            color:tab===t.key?'var(--teal)':'var(--text-muted)',
            background:'none',border:'none',borderBottom:tab===t.key?'2px solid var(--teal)':'2px solid transparent',
            cursor:'pointer',display:'flex',alignItems:'center',gap:8,marginBottom:-1
          }}>
            {t.label}
            {t.badge>0&&<span style={{fontSize:'0.7rem',fontWeight:700,padding:'1px 7px',borderRadius:10,background:'#FEF2F2',color:'#DC2626'}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {isLoading&&<div style={{textAlign:'center',padding:60}}><Spinner/></div>}

      {/* Inspections Tab */}
      {!isLoading&&tab==='inspections'&&(
        <div>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
            <button onClick={()=>setShowInspection(true)} style={{...btnBase,background:'var(--teal)',color:'#fff'}}>+ Log Inspection</button>
          </div>
          {inspections.length===0
            ?<div style={{padding:60,textAlign:'center',color:'var(--text-muted)'}}>No inspections logged yet</div>
            :<div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                  {['ID','Date','Site','Inspector','Score','Notes'].map(h=><th key={h} style={thStyle}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {inspections.map((r,i)=>{
                    const sc=scoreColor(r.score)
                    return(
                      <tr key={r.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{...tdStyle,fontWeight:600,fontSize:'0.8rem',color:'var(--text-muted)'}}>#{r.id}</td>
                        <td style={{...tdStyle,fontSize:'0.8rem',color:'var(--text-2)'}}>{formatDate(r.inspection_date)}</td>
                        <td style={tdStyle}>
                          <div style={{fontWeight:700,fontSize:'0.875rem'}}>{r.client_name||'--'}</div>
                          <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{r.site_id||''}</div>
                        </td>
                        <td style={{...tdStyle,fontSize:'0.85rem'}}>{r.inspector||'--'}</td>
                        <td style={tdStyle}><span style={pill(sc.bg,sc.fg)}>{r.score}/100</span></td>
                        <td style={{...tdStyle,fontSize:'0.8rem',color:'var(--text-2)',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.notes||'--'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          }
        </div>
      )}

      {/* Incidents Tab */}
      {!isLoading&&tab==='incidents'&&(
        <div>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
            <button onClick={()=>setShowIncident(true)} style={{...btnBase,background:'#DC2626',color:'#fff'}}>+ Raise Incident</button>
          </div>
          {incidents.length===0
            ?<div style={{padding:60,textAlign:'center',color:'var(--text-muted)'}}>No incidents recorded</div>
            :<div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                  {['ID','Date','Site','Type','Description','Status','Actions'].map(h=><th key={h} style={thStyle}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {incidents.map((r,i)=>{
                    const tp=typePill(r.incident_type)
                    const sp=statusPill(r.status)
                    return(
                      <tr key={r.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{...tdStyle,fontWeight:600,fontSize:'0.8rem',color:'var(--text-muted)'}}>#{r.id}</td>
                        <td style={{...tdStyle,fontSize:'0.8rem',color:'var(--text-2)'}}>{formatDate(r.incident_date)}</td>
                        <td style={tdStyle}>
                          <div style={{fontWeight:700,fontSize:'0.875rem'}}>{r.client_name||'--'}</div>
                          <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{r.site_id||''}</div>
                        </td>
                        <td style={tdStyle}><span style={pill(tp.bg,tp.fg)}>{r.incident_type}</span></td>
                        <td style={{...tdStyle,fontSize:'0.8rem',color:'var(--text-2)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.description||'--'}</td>
                        <td style={tdStyle}><span style={pill(sp.bg,sp.fg)}>{r.status}</span></td>
                        <td style={tdStyle}>
                          {r.status==='Open'&&(
                            <button onClick={()=>{setResolveTarget(r);setResolution('')}} style={{...btnBase,background:'var(--teal)',color:'#fff',padding:'5px 14px',fontSize:'0.75rem'}}>Resolve</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          }
        </div>
      )}

      {/* Log Inspection Modal */}
      <Modal open={showInspection} onClose={()=>setShowInspection(false)} title="Log Inspection">
        <form onSubmit={handleSaveInspection}>
          <Field label="Site ID *">
            <input style={inputStyle} placeholder="SITE-..." value={inspForm.site_id} onChange={e=>updInsp('site_id',e.target.value)} required/>
          </Field>
          <Field label="Client Name">
            <input style={inputStyle} value={inspForm.client_name} onChange={e=>updInsp('client_name',e.target.value)}/>
          </Field>
          <Field label="Date">
            <input type="date" style={inputStyle} value={inspForm.inspection_date} onChange={e=>updInsp('inspection_date',e.target.value)}/>
          </Field>
          <Field label="Inspector *">
            <input style={inputStyle} value={inspForm.inspector} onChange={e=>updInsp('inspector',e.target.value)} required/>
          </Field>
          <Field label="Score (0-100) *">
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <input type="number" min={0} max={100} style={{...inputStyle,flex:1}} value={inspForm.score} onChange={e=>updInsp('score',e.target.value)} required/>
              {inspForm.score!==''&&inspForm.score>=0&&inspForm.score<=100&&(
                <span style={{...pill(scoreColor(Number(inspForm.score)).bg,scoreColor(Number(inspForm.score)).fg),fontSize:'0.8rem',padding:'4px 12px'}}>{inspForm.score}/100</span>
              )}
            </div>
          </Field>
          <Field label="Notes">
            <textarea style={{...inputStyle,minHeight:70,resize:'vertical'}} value={inspForm.notes} onChange={e=>updInsp('notes',e.target.value)}/>
          </Field>
          <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
            <button type="button" onClick={()=>setShowInspection(false)} style={{...btnBase,background:'var(--bg-input,var(--bg-surface))',color:'var(--text-2)',border:'1px solid var(--border)'}}>Cancel</button>
            <button type="submit" disabled={createInsp.isPending} style={{...btnBase,background:'var(--teal)',color:'#fff',opacity:createInsp.isPending?.6:1}}>
              {createInsp.isPending?'Saving...':'Save Inspection'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Raise Incident Modal */}
      <Modal open={showIncident} onClose={()=>setShowIncident(false)} title="Raise Incident">
        <form onSubmit={handleRaiseIncident}>
          <Field label="Site ID *">
            <input style={inputStyle} placeholder="SITE-..." value={incForm.site_id} onChange={e=>updInc('site_id',e.target.value)} required/>
          </Field>
          <Field label="Client Name">
            <input style={inputStyle} value={incForm.client_name} onChange={e=>updInc('client_name',e.target.value)}/>
          </Field>
          <Field label="Incident Type *">
            <select style={inputStyle} value={incForm.incident_type} onChange={e=>updInc('incident_type',e.target.value)} required>
              <option value="">Select type...</option>
              <option value="Complaint">Complaint</option>
              <option value="Near Miss">Near Miss</option>
              <option value="Accident">Accident</option>
              <option value="Reclean">Reclean</option>
            </select>
          </Field>
          <Field label="Description *">
            <textarea style={{...inputStyle,minHeight:90,resize:'vertical'}} placeholder="Describe the incident..." value={incForm.description} onChange={e=>updInc('description',e.target.value)} required/>
          </Field>
          <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
            <button type="button" onClick={()=>setShowIncident(false)} style={{...btnBase,background:'var(--bg-input,var(--bg-surface))',color:'var(--text-2)',border:'1px solid var(--border)'}}>Cancel</button>
            <button type="submit" disabled={createInc.isPending} style={{...btnBase,background:'#DC2626',color:'#fff',opacity:createInc.isPending?.6:1}}>
              {createInc.isPending?'Raising...':'Raise Incident'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Resolve Incident Modal */}
      <Modal open={!!resolveTarget} onClose={()=>setResolveTarget(null)} title="Resolve Incident">
        {resolveTarget&&(
          <form onSubmit={handleResolve}>
            <div style={{background:'#FFFBEB',border:'1px solid #F59E0B33',borderRadius:'var(--r-md)',padding:'12px 16px',marginBottom:20,fontSize:'0.85rem'}}>
              <div style={{fontWeight:700,color:'#92400E',marginBottom:4}}>Incident #{resolveTarget.id}</div>
              <div style={{color:'#92400E'}}>
                <span style={{fontWeight:600}}>{resolveTarget.incident_type}</span> at <span style={{fontWeight:600}}>{resolveTarget.client_name||resolveTarget.site_id}</span>
              </div>
            </div>
            <Field label="Resolution *">
              <textarea style={{...inputStyle,minHeight:100,resize:'vertical'}} placeholder="What action was taken..." value={resolution} onChange={e=>setResolution(e.target.value)} required/>
            </Field>
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
              <button type="button" onClick={()=>setResolveTarget(null)} style={{...btnBase,background:'var(--bg-input,var(--bg-surface))',color:'var(--text-2)',border:'1px solid var(--border)'}}>Cancel</button>
              <button type="submit" disabled={resolveInc.isPending} style={{...btnBase,background:'#059669',color:'#fff',opacity:resolveInc.isPending?.6:1}}>
                {resolveInc.isPending?'Resolving...':'Mark Resolved'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
