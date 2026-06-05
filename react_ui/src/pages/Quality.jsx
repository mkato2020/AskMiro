import {useState,useCallback} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {formatDate} from '../utils'
import {PageHeader,KPICard,Card,Badge,Button,EmptyState,SkeletonKPIs,SkeletonTable,
        Modal,FormField,Input,Select,Textarea} from '../components/ui'
import {useToast} from '../components/Toast'

const scoreTone=s=>s>=90?'success':s>=70?'warning':'danger'
const typeTone=t=>({Complaint:'danger','Near Miss':'warning',Accident:'danger',Reclean:'info'}[t]||'neutral')
const todayISO=()=>new Date().toISOString().split('T')[0]
const cell={padding:'12px 16px',fontSize:'.85rem',verticalAlign:'middle'}

export default function Quality(){
  const qc=useQueryClient()
  const toast=useToast()
  const {data,isLoading}=useQuery({queryKey:['quality'],queryFn:api.quality,staleTime:60000})
  const q=data||{}

  const [tab,setTab]=useState('inspections')
  const [showInspection,setShowInspection]=useState(false)
  const [showIncident,setShowIncident]=useState(false)
  const [resolveTarget,setResolveTarget]=useState(null)

  const emptyInsp={site_id:'',client_name:'',inspection_date:todayISO(),inspector:'',score:'',notes:''}
  const [inspForm,setInspForm]=useState(emptyInsp)
  const updInsp=useCallback((k,v)=>setInspForm(f=>({...f,[k]:v})),[])

  const emptyInc={site_id:'',client_name:'',incident_type:'',description:''}
  const [incForm,setIncForm]=useState(emptyInc)
  const updInc=useCallback((k,v)=>setIncForm(f=>({...f,[k]:v})),[])

  const [resolution,setResolution]=useState('')

  const createInsp=useMutation({mutationFn:b=>api.createInspection(b),
    onSuccess:()=>{toast.success('Inspection logged');qc.invalidateQueries({queryKey:['quality']});setShowInspection(false);setInspForm(emptyInsp)},
    onError:e=>toast.error('Could not log inspection — '+(e.message||'try again'))})
  const createInc=useMutation({mutationFn:b=>api.createIncident(b),
    onSuccess:()=>{toast.warning('Incident raised');qc.invalidateQueries({queryKey:['quality']});setShowIncident(false);setIncForm(emptyInc)},
    onError:e=>toast.error('Could not raise incident — '+(e.message||'try again'))})
  const resolveInc=useMutation({mutationFn:({id,body})=>api.resolveIncident(id,body),
    onSuccess:()=>{toast.success('Incident resolved');qc.invalidateQueries({queryKey:['quality']});setResolveTarget(null);setResolution('')},
    onError:e=>toast.error('Could not resolve — '+(e.message||'try again'))})

  const inspections=Array.isArray(q.inspections)?q.inspections:[]
  const incidents=Array.isArray(q.incidents)?q.incidents:[]
  const openCount=q.open_incidents||0
  const avgScore=q.avg_score

  const handleSaveInspection=e=>{e.preventDefault();if(inspForm.site_id&&inspForm.inspector&&inspForm.score!=='')createInsp.mutate({...inspForm,score:Number(inspForm.score)})}
  const handleRaiseIncident=e=>{e.preventDefault();if(incForm.site_id&&incForm.incident_type&&incForm.description)createInc.mutate(incForm)}
  const handleResolve=e=>{e.preventDefault();if(resolution.trim()&&resolveTarget)resolveInc.mutate({id:resolveTarget.id,body:{resolution}})}

  const scorePreview=inspForm.score!==''&&inspForm.score>=0&&inspForm.score<=100
    ?<Badge tone={scoreTone(Number(inspForm.score))}>{inspForm.score}/100</Badge>:null

  return(
    <div style={{padding:'28px 32px',maxWidth:1100,margin:'0 auto'}}>
      <PageHeader badge="QA" title="Quality" subtitle="Inspections, incidents & QA evidence"
        actions={tab==='inspections'
          ?<Button variant="primary" onClick={()=>setShowInspection(true)}>+ Log Inspection</Button>
          :<Button variant="danger" onClick={()=>setShowIncident(true)}>+ Raise Incident</Button>}/>

      {isLoading?<SkeletonKPIs count={4}/>:(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          <KPICard label="Average Score" value={avgScore!=null?avgScore.toFixed(1):'—'} color={avgScore!=null?`var(--${scoreTone(avgScore)==='danger'?'danger':scoreTone(avgScore)==='warning'?'warning':'success'})`:'var(--text-1)'} icon="⭐"/>
          <KPICard label="Inspections (month)" value={q.inspections_this_month||0} color="var(--info)"/>
          <KPICard label="Open Incidents" value={openCount} color={openCount>0?'var(--danger)':'var(--success)'} icon={openCount>0?'⚠️':'✓'}/>
          <KPICard label="Total Inspections" value={q.total_inspections||0} color="var(--text-1)" hint="all time — your evidence base"/>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:0,margin:'24px 0 20px',borderBottom:'1px solid var(--border)'}}>
        {[{key:'inspections',label:'Inspections'},{key:'incidents',label:'Incidents',badge:openCount}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:'10px 20px',fontSize:'.85rem',fontWeight:tab===t.key?700:500,
            color:tab===t.key?'var(--teal)':'var(--text-muted)',background:'none',border:'none',
            borderBottom:tab===t.key?'2px solid var(--teal)':'2px solid transparent',cursor:'pointer',
            display:'flex',alignItems:'center',gap:8,marginBottom:-1}}>
            {t.label}{t.badge>0&&<Badge tone="danger">{t.badge}</Badge>}
          </button>
        ))}
      </div>

      {isLoading?<SkeletonTable rows={5} cols={6}/>:(<>
        {tab==='inspections'&&(
          inspections.length===0
            ?<EmptyState icon="📋" title="No inspections logged yet"
               message="Every logged inspection builds the QA evidence base buyers ask for in tenders. Log your first one."
               action={<Button variant="primary" onClick={()=>setShowInspection(true)}>+ Log Inspection</Button>}/>
            :<Card padding={0} style={{overflow:'hidden'}}><div style={{overflowX:'auto'}}>
              <table className="am-table">
                <thead><tr>{['ID','Date','Site','Inspector','Score','Notes'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {inspections.map((r,i)=>(
                    <tr key={r.id||i}>
                      <td style={{...cell,color:'var(--text-muted)',fontWeight:600,fontSize:'.8rem'}}>#{r.id}</td>
                      <td style={{...cell,color:'var(--text-2)',fontSize:'.8rem'}}>{formatDate(r.inspection_date)}</td>
                      <td style={cell}><div style={{fontWeight:700}}>{r.client_name||'—'}</div><div style={{fontSize:'.75rem',color:'var(--text-muted)'}}>{r.site_id||''}</div></td>
                      <td style={cell}>{r.inspector||'—'}</td>
                      <td style={cell}><Badge tone={scoreTone(r.score)}>{r.score}/100</Badge></td>
                      <td style={{...cell,color:'var(--text-2)',fontSize:'.8rem',maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.notes||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></Card>
        )}

        {tab==='incidents'&&(
          incidents.length===0
            ?<EmptyState icon="✓" title="No incidents recorded"
               message="Documented issue handling — logged, escalated, resolved — is what wins trust. Raise one if something needs tracking."
               action={<Button variant="danger" onClick={()=>setShowIncident(true)}>+ Raise Incident</Button>}/>
            :<Card padding={0} style={{overflow:'hidden'}}><div style={{overflowX:'auto'}}>
              <table className="am-table">
                <thead><tr>{['ID','Date','Site','Type','Description','Status','Actions'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {incidents.map((r,i)=>(
                    <tr key={r.id||i}>
                      <td style={{...cell,color:'var(--text-muted)',fontWeight:600,fontSize:'.8rem'}}>#{r.id}</td>
                      <td style={{...cell,color:'var(--text-2)',fontSize:'.8rem'}}>{formatDate(r.incident_date)}</td>
                      <td style={cell}><div style={{fontWeight:700}}>{r.client_name||'—'}</div><div style={{fontSize:'.75rem',color:'var(--text-muted)'}}>{r.site_id||''}</div></td>
                      <td style={cell}><Badge tone={typeTone(r.incident_type)}>{r.incident_type}</Badge></td>
                      <td style={{...cell,color:'var(--text-2)',fontSize:'.8rem',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.description||'—'}</td>
                      <td style={cell}><Badge tone={r.status==='Resolved'?'success':'danger'}>{r.status}</Badge></td>
                      <td style={cell}>{r.status==='Open'&&<Button variant="primary" size="sm" onClick={()=>{setResolveTarget(r);setResolution('')}}>Resolve</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></Card>
        )}
      </>)}

      {/* Log Inspection */}
      <Modal open={showInspection} onClose={()=>setShowInspection(false)} title="Log Inspection" width={480}
        footer={<>
          <Button variant="ghost" onClick={()=>setShowInspection(false)}>Cancel</Button>
          <Button variant="primary" loading={createInsp.isPending} disabled={!inspForm.site_id||!inspForm.inspector||inspForm.score===''} onClick={handleSaveInspection}>Save Inspection</Button>
        </>}>
        <FormField label="Site ID" required htmlFor="q-site"><Input id="q-site" placeholder="SITE-…" value={inspForm.site_id} onChange={e=>updInsp('site_id',e.target.value)}/></FormField>
        <FormField label="Client Name" htmlFor="q-client"><Input id="q-client" value={inspForm.client_name} onChange={e=>updInsp('client_name',e.target.value)}/></FormField>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <FormField label="Date" htmlFor="q-date"><Input id="q-date" type="date" value={inspForm.inspection_date} onChange={e=>updInsp('inspection_date',e.target.value)}/></FormField>
          <FormField label="Inspector" required htmlFor="q-insp"><Input id="q-insp" value={inspForm.inspector} onChange={e=>updInsp('inspector',e.target.value)}/></FormField>
        </div>
        <FormField label="Score (0–100)" required htmlFor="q-score">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <Input id="q-score" type="number" min={0} max={100} style={{flex:1}} value={inspForm.score} onChange={e=>updInsp('score',e.target.value)}/>
            {scorePreview}
          </div>
        </FormField>
        <FormField label="Notes" htmlFor="q-notes"><Textarea id="q-notes" rows={3} value={inspForm.notes} onChange={e=>updInsp('notes',e.target.value)}/></FormField>
      </Modal>

      {/* Raise Incident */}
      <Modal open={showIncident} onClose={()=>setShowIncident(false)} title="Raise Incident" width={480}
        footer={<>
          <Button variant="ghost" onClick={()=>setShowIncident(false)}>Cancel</Button>
          <Button variant="danger" loading={createInc.isPending} disabled={!incForm.site_id||!incForm.incident_type||!incForm.description} onClick={handleRaiseIncident}>Raise Incident</Button>
        </>}>
        <FormField label="Site ID" required htmlFor="i-site"><Input id="i-site" placeholder="SITE-…" value={incForm.site_id} onChange={e=>updInc('site_id',e.target.value)}/></FormField>
        <FormField label="Client Name" htmlFor="i-client"><Input id="i-client" value={incForm.client_name} onChange={e=>updInc('client_name',e.target.value)}/></FormField>
        <FormField label="Incident Type" required htmlFor="i-type">
          <Select id="i-type" value={incForm.incident_type} onChange={e=>updInc('incident_type',e.target.value)}>
            <option value="">Select type…</option>
            <option value="Complaint">Complaint</option>
            <option value="Near Miss">Near Miss</option>
            <option value="Accident">Accident</option>
            <option value="Reclean">Reclean</option>
          </Select>
        </FormField>
        <FormField label="Description" required htmlFor="i-desc"><Textarea id="i-desc" rows={4} placeholder="Describe the incident…" value={incForm.description} onChange={e=>updInc('description',e.target.value)}/></FormField>
      </Modal>

      {/* Resolve Incident */}
      <Modal open={!!resolveTarget} onClose={()=>setResolveTarget(null)} title="Resolve Incident" width={480}
        footer={<>
          <Button variant="ghost" onClick={()=>setResolveTarget(null)}>Cancel</Button>
          <Button variant="success" loading={resolveInc.isPending} disabled={!resolution.trim()} onClick={handleResolve}>Mark Resolved</Button>
        </>}>
        {resolveTarget&&<>
          <Card style={{background:'var(--warning-wash)',border:'none',marginBottom:18}} padding={14}>
            <div style={{fontWeight:700,color:'#92400E',marginBottom:4}}>Incident #{resolveTarget.id}</div>
            <div style={{color:'#92400E',fontSize:'.85rem'}}>{resolveTarget.incident_type} at {resolveTarget.client_name||resolveTarget.site_id}</div>
          </Card>
          <FormField label="Resolution" required htmlFor="r-res"><Textarea id="r-res" rows={4} placeholder="What action was taken…" value={resolution} onChange={e=>setResolution(e.target.value)}/></FormField>
        </>}
      </Modal>
    </div>
  )
}
