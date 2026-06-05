import {useState,useCallback} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {fetchContracts} from '../api'
import {formatDate,formatGBP} from '../utils'
import {PageHeader,KPICard,Card,Badge,Button,EmptyState,SkeletonKPIs,SkeletonTable,
        Modal,FormField,Input,Textarea,SectionTitle} from '../components/ui'
import {useToast} from '../components/Toast'

const TABS=["Today's Jobs",'Schedule','Issues','Capacity']
const STATUS_TONE={Scheduled:'info',InProgress:'warning',Complete:'success',Missed:'danger',Cancelled:'neutral'}
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const EMPTY_JOB={site_id:'',client_name:'',job_date:new Date().toISOString().slice(0,10),start_time:'06:00',staff_name:'',notes:''}
const CAPACITY_HRS=40, OVERLOAD_HRS=38

function elapsed(c){if(!c)return '—';const m=Math.round((Date.now()-new Date(c))/60000);return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`}
function duration(a,b){if(!a||!b)return '—';const m=Math.round((new Date(b)-new Date(a))/60000);return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`}
function fmtTime(t){if(!t)return '—';return t.includes('T')?new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):t}
function utilTone(p){return p>95?'danger':p>=75?'warning':'success'}
const toneVar=(t)=>`var(--${t==='danger'?'danger':t==='warning'?'warning':'success'})`
const statusBadge=(s)=><Badge tone={STATUS_TONE[s]||'neutral'}>{s||'Scheduled'}</Badge>

function UtilBar({pct}){
  const c=toneVar(utilTone(pct))
  return(
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <div style={{flex:1,height:8,background:'var(--bg-subtle)',borderRadius:4,overflow:'hidden',minWidth:60}}>
        <div style={{width:`${Math.min(pct,100)}%`,height:'100%',background:c,borderRadius:4,transition:'width .3s'}}/>
      </div>
      <span style={{fontSize:'.75rem',fontWeight:700,color:c,minWidth:38,textAlign:'right'}}>{pct.toFixed(0)}%</span>
    </div>
  )
}

function contractTag(job,contracts){
  if(!contracts?.length)return null
  let m=job.contract_id&&contracts.find(c=>c.id===job.contract_id)
  if(!m&&job.client_name)m=contracts.find(c=>c.site_name&&c.site_name.toLowerCase()===job.client_name.toLowerCase())
  if(!m)return null
  return <span style={{fontSize:'.65rem',color:'var(--teal)',fontWeight:600,marginLeft:4}}>[{m.site_name||`#${m.id}`}]</span>
}

export default function Operations({openLead}){
  const [tab,setTab]=useState("Today's Jobs")
  const [showModal,setShowModal]=useState(false)
  const [form,setForm]=useState({...EMPTY_JOB})
  const qc=useQueryClient()
  const toast=useToast()

  const {data,isLoading}=useQuery({queryKey:['operations'],queryFn:api.operations,staleTime:60000})
  const ops=data||{}
  const todayJobs=Array.isArray(ops.today_jobs)?ops.today_jobs:[]
  const schedule=Array.isArray(ops.schedule)?ops.schedule:[]
  const missedJobs=todayJobs.filter(j=>j.status==='Missed')

  const {data:cleanersData}=useQuery({queryKey:['cleaners'],queryFn:api.cleaners,staleTime:60000,enabled:tab==='Capacity'})
  const {data:contractsData}=useQuery({queryKey:['contracts-capacity'],queryFn:()=>fetchContracts(),staleTime:60000})
  const allContracts=Array.isArray(contractsData?.contracts)?contractsData.contracts:Array.isArray(contractsData)?contractsData:[]
  const cleanersList=Array.isArray(cleanersData)?cleanersData:Array.isArray(cleanersData?.cleaners)?cleanersData.cleaners:[]

  const cleanerCapacity=cleanersList
    .filter(c=>c.status==='active'||c.is_available||(!c.archived&&!c.is_archived))
    .map(c=>{const a=Number(c.assigned_hours||c.weekly_hours||c.hours_per_week||0)
      return{...c,assigned_hours:a,utilization:CAPACITY_HRS>0?(a/CAPACITY_HRS)*100:0,overloaded:a>OVERLOAD_HRS}})
    .sort((a,b)=>b.utilization-a.utilization)
  const unstaffedContracts=allContracts.filter(c=>(c.staffing_status||'').toLowerCase()==='unassigned')
  const totalActive=cleanerCapacity.length
  const avgUtil=totalActive>0?cleanerCapacity.reduce((s,c)=>s+c.utilization,0)/totalActive:0
  const overloadedCount=cleanerCapacity.filter(c=>c.overloaded).length
  const availableCapacity=cleanerCapacity.reduce((s,c)=>s+Math.max(0,CAPACITY_HRS-c.assigned_hours),0)

  const clockInMut=useMutation({mutationFn:api.clockIn,
    onSuccess:()=>{toast.success('Clocked in');qc.invalidateQueries({queryKey:['operations']})},
    onError:e=>toast.error('Clock-in failed — '+(e.message||'try again'))})
  const clockOutMut=useMutation({mutationFn:api.clockOut,
    onSuccess:()=>{toast.success('Clocked out — job complete');qc.invalidateQueries({queryKey:['operations']})},
    onError:e=>toast.error('Clock-out failed — '+(e.message||'try again'))})
  const createMut=useMutation({mutationFn:api.createJob,
    onSuccess:()=>{toast.success('Job scheduled');qc.invalidateQueries({queryKey:['operations']});setShowModal(false);setForm({...EMPTY_JOB})},
    onError:e=>toast.error('Could not schedule — '+(e.message||'try again'))})

  const setField=useCallback((k,v)=>setForm(f=>({...f,[k]:v})),[])
  const canSubmit=form.site_id&&form.client_name&&form.staff_name
  const handleCreate=useCallback(()=>{if(canSubmit)createMut.mutate(form)},[form,canSubmit,createMut])

  const cell={padding:'12px 16px',fontSize:'.83rem',verticalAlign:'middle'}

  return(
    <div style={{padding:'28px 32px',maxWidth:1100,margin:'0 auto'}}>
      <PageHeader badge="Ops" title="Operations" subtitle="Daily job scheduling, clock tracking & capacity"
        actions={tab==="Today's Jobs"?<Button variant="primary" onClick={()=>setShowModal(true)}>+ Schedule Job</Button>:null}/>

      {isLoading?<SkeletonKPIs count={4}/>:(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          <KPICard label="Active Jobs" value={ops.active_jobs||0} color="var(--teal)" icon="🧹"/>
          <KPICard label="Total Sites" value={ops.total_sites||0} color="var(--info)" icon="🏢"/>
          <KPICard label="Today's Cleans" value={todayJobs.length} color="var(--text-1)" hint="scheduled today"/>
          <KPICard label="Missed Jobs" value={ops.missed_count||0} color={(ops.missed_count||0)>0?'var(--danger)':'var(--success)'} icon={(ops.missed_count||0)>0?'⚠️':'✓'}/>
        </div>
      )}

      {(ops.missed_count||0)>0&&(
        <Card style={{marginTop:18,borderLeft:'3px solid var(--danger)',background:'var(--danger-wash)'}}>
          <div style={{fontWeight:700,fontSize:'.85rem',color:'var(--danger)',marginBottom:missedJobs.length?8:0}}>
            {ops.missed_count} missed job{ops.missed_count>1?'s':''} today — please investigate
          </div>
          {missedJobs.map((j,i)=>(
            <div key={j.id||i} style={{fontSize:'.8rem',color:'#991B1B',padding:'3px 0',cursor:j.place_id?'pointer':'default'}}
              onClick={()=>j.place_id&&openLead&&openLead(j.place_id)}>
              {j.client_name||'Unknown'} — {fmtTime(j.start_time)} ({j.staff_name||'Unassigned'})
            </div>
          ))}
        </Card>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:4,margin:'24px 0 20px',borderBottom:'1px solid var(--border)'}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:'8px 18px',fontSize:'.8rem',fontWeight:tab===t?700:500,border:'none',
            borderBottom:tab===t?'2px solid var(--teal)':'2px solid transparent',background:'transparent',
            color:tab===t?'var(--text-1)':'var(--text-muted)',cursor:'pointer'}}>
            {t}
            {t==='Issues'&&(ops.open_issues||0)>0?<Badge tone="danger" style={{marginLeft:6}}>{ops.open_issues}</Badge>:''}
            {t==='Capacity'&&overloadedCount>0?<Badge tone="danger" style={{marginLeft:6}}>{overloadedCount}</Badge>:''}
          </button>
        ))}
      </div>

      {isLoading?<SkeletonTable rows={5} cols={6}/>:(<>
        {/* Today's Jobs */}
        {tab==="Today's Jobs"&&(
          todayJobs.length===0
            ?<EmptyState icon="🗓️" title="No jobs scheduled for today"
               message="Schedule a clean to start tracking attendance and clock times."
               action={<Button variant="primary" onClick={()=>setShowModal(true)}>+ Schedule Job</Button>}/>
            :<Card padding={0} style={{overflow:'hidden'}}><div style={{overflowX:'auto'}}>
              <table className="am-table" style={{minWidth:900}}>
                <thead><tr>{['ID','Site / Client','Start','Staff','Status','In','Out','Duration','Actions'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {todayJobs.map((j,i)=>(
                    <tr key={j.id||i}>
                      <td style={{...cell,color:'var(--text-muted)',fontWeight:600,fontSize:'.75rem'}}>#{j.id||i+1}</td>
                      <td style={cell}>
                        <div style={{fontWeight:700,cursor:j.place_id?'pointer':'default'}} onClick={()=>j.place_id&&openLead&&openLead(j.place_id)}>
                          {j.client_name||'—'}{contractTag(j,allContracts)}</div>
                        <div style={{fontSize:'.7rem',color:'var(--text-muted)'}}>{j.site_id?`Site ${j.site_id}`:''}</div>
                      </td>
                      <td style={cell}>{fmtTime(j.start_time)}</td>
                      <td style={cell}>{j.staff_name||'Unassigned'}</td>
                      <td style={cell}>{statusBadge(j.status)}</td>
                      <td style={cell}>{j.clock_in?fmtTime(j.clock_in):'—'}</td>
                      <td style={cell}>{j.clock_out?fmtTime(j.clock_out):'—'}</td>
                      <td style={cell}>{j.status==='Complete'?duration(j.clock_in,j.clock_out):j.status==='InProgress'?<span style={{color:'var(--warning)',fontWeight:600}}>{elapsed(j.clock_in)}</span>:'—'}</td>
                      <td style={cell}>
                        {j.status==='Scheduled'&&<Button variant="success" size="sm" loading={clockInMut.isPending&&clockInMut.variables===j.id} onClick={()=>clockInMut.mutate(j.id)}>Clock In</Button>}
                        {j.status==='InProgress'&&<Button variant="secondary" size="sm" loading={clockOutMut.isPending&&clockOutMut.variables===j.id} onClick={()=>clockOutMut.mutate(j.id)}>Clock Out</Button>}
                        {j.status==='Missed'&&<span style={{color:'var(--danger)',fontWeight:700,fontSize:'.75rem'}}>Missed</span>}
                        {j.status==='Complete'&&<span style={{color:'var(--success)',fontSize:'.75rem'}}>Done</span>}
                        {j.status==='Cancelled'&&<span style={{color:'var(--text-muted)',fontSize:'.75rem'}}>Cancelled</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></Card>
        )}

        {/* Schedule */}
        {tab==='Schedule'&&(
          schedule.length===0
            ?<EmptyState icon="📅" title="No upcoming schedule" message="Scheduled jobs for the next 7 days appear here, grouped by day."/>
            :<div style={{display:'grid',gap:14}}>
              {DAYS.map(day=>{
                const dayJobs=schedule.filter(s=>s.day?s.day.toLowerCase()===day.toLowerCase():s.job_date?DAYS[new Date(s.job_date).getDay()===0?6:new Date(s.job_date).getDay()-1]===day:false)
                if(!dayJobs.length)return null
                const dateStr=dayJobs[0]?.job_date?formatDate(dayJobs[0].job_date):''
                return(
                  <Card key={day} padding={0} style={{overflow:'hidden'}}>
                    <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',background:'var(--bg-subtle)'}}>
                      <span style={{fontWeight:700,fontSize:'.9rem'}}>{day}</span>
                      {dateStr&&<span style={{fontSize:'.75rem',color:'var(--text-muted)'}}>{dateStr}</span>}
                    </div>
                    <table className="am-table">
                      <thead><tr>{['Client','Site','Time','Staff','Contract','Status'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {dayJobs.map((s,i)=>(
                          <tr key={s.id||i}>
                            <td style={{...cell,fontWeight:600}}>{s.client_name||'—'}</td>
                            <td style={{...cell,color:'var(--text-muted)'}}>{s.site_id?`Site ${s.site_id}`:''}</td>
                            <td style={cell}>{fmtTime(s.start_time)}</td>
                            <td style={cell}>{s.staff_name||'Unassigned'}</td>
                            <td style={cell}>{contractTag(s,allContracts)||<span style={{color:'var(--text-muted)',fontSize:'.75rem'}}>—</span>}</td>
                            <td style={cell}>{statusBadge(s.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )
              })}
            </div>
        )}

        {/* Issues */}
        {tab==='Issues'&&(
          <EmptyState icon={(ops.open_issues||0)>0?'⚠️':'✓'}
            title={(ops.open_issues||0)>0?`${ops.open_issues} Open Issue${ops.open_issues>1?'s':''}`:'No Open Issues'}
            message="Quality inspections and incidents are managed in the Quality module."/>
        )}

        {/* Capacity */}
        {tab==='Capacity'&&(
          <div style={{display:'grid',gap:20}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
              <KPICard label="Active Cleaners" value={totalActive} color="var(--teal)" icon="👥"/>
              <KPICard label="Avg Utilisation" value={`${avgUtil.toFixed(0)}%`} color={toneVar(utilTone(avgUtil))}/>
              <KPICard label="Overloaded" value={overloadedCount} color={overloadedCount>0?'var(--danger)':'var(--success)'} hint={overloadedCount>0?`>${OVERLOAD_HRS}h/week`:'all within capacity'}/>
              <KPICard label="Spare Capacity" value={`${availableCapacity.toFixed(0)}h`} color="var(--info)" hint="hours/week available"/>
            </div>

            <div>
              <SectionTitle>Cleaner Capacity</SectionTitle>
              {cleanerCapacity.length===0
                ?<EmptyState icon="👤" title="No active cleaners" message="Add cleaners in the Cleaners module to track capacity."/>
                :<Card padding={0} style={{overflow:'hidden'}}><div style={{overflowX:'auto'}}>
                  <table className="am-table" style={{minWidth:700}}>
                    <thead><tr>{['Name','Assigned','Capacity','Utilisation','Status'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {cleanerCapacity.map((c,i)=>(
                        <tr key={c.id||i}>
                          <td style={{...cell,fontWeight:700}}>{c.name||c.full_name||'—'}{c.overloaded&&<Badge tone="danger" style={{marginLeft:8}}>OVERLOADED</Badge>}</td>
                          <td style={cell}>{c.assigned_hours.toFixed(1)}h</td>
                          <td style={cell}>{CAPACITY_HRS}h</td>
                          <td style={{...cell,minWidth:160}}><UtilBar pct={c.utilization}/></td>
                          <td style={cell}><Badge tone={c.overloaded?'danger':c.utilization>=75?'warning':'success'}>{c.overloaded?'Over Capacity':c.utilization>=75?'Near Capacity':'Available'}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></Card>}
            </div>

            <div>
              <SectionTitle action={unstaffedContracts.length>0?<Badge tone="danger">{unstaffedContracts.length}</Badge>:null}>Unstaffed Contracts</SectionTitle>
              {unstaffedContracts.length===0
                ?<EmptyState icon="✓" title="All contracts staffed" message="No unassigned contracts — nothing needs action."/>
                :<Card padding={0} style={{overflow:'hidden'}}><div style={{overflowX:'auto'}}>
                  <table className="am-table" style={{minWidth:600}}>
                    <thead><tr>{['Site','Postcode','Hours/Week','Monthly Value','Status'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {unstaffedContracts.map((c,i)=>(
                        <tr key={c.id||i}>
                          <td style={{...cell,fontWeight:700}}>{c.site_name||c.client_name||'—'}<Badge tone="danger" style={{marginLeft:8}}>Needs Cleaner</Badge></td>
                          <td style={cell}>{c.postcode||c.site_postcode||'—'}</td>
                          <td style={cell}>{c.hours_per_week!=null?`${c.hours_per_week}h`:c.weekly_hours!=null?`${c.weekly_hours}h`:'—'}</td>
                          <td style={cell}>{c.monthly_value!=null?formatGBP(c.monthly_value):c.contract_value!=null?formatGBP(c.contract_value):'—'}</td>
                          <td style={cell}><Badge tone="danger">Unassigned</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></Card>}
            </div>
          </div>
        )}
      </>)}

      {/* Schedule Job Modal */}
      <Modal open={showModal} onClose={()=>{setShowModal(false);setForm({...EMPTY_JOB})}} title="Schedule Job" width={460}
        footer={<>
          <Button variant="ghost" onClick={()=>{setShowModal(false);setForm({...EMPTY_JOB})}}>Cancel</Button>
          <Button variant="primary" loading={createMut.isPending} disabled={!canSubmit} onClick={handleCreate}>Schedule</Button>
        </>}>
        <FormField label="Site ID" required htmlFor="op-site"><Input id="op-site" value={form.site_id} placeholder="e.g. SITE-042" onChange={e=>setField('site_id',e.target.value)}/></FormField>
        <FormField label="Client Name" required htmlFor="op-client"><Input id="op-client" value={form.client_name} placeholder="Client name" onChange={e=>setField('client_name',e.target.value)}/></FormField>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <FormField label="Date" htmlFor="op-date"><Input id="op-date" type="date" value={form.job_date} onChange={e=>setField('job_date',e.target.value)}/></FormField>
          <FormField label="Start Time" htmlFor="op-time"><Input id="op-time" type="time" value={form.start_time} onChange={e=>setField('start_time',e.target.value)}/></FormField>
        </div>
        <FormField label="Staff Name" required htmlFor="op-staff"><Input id="op-staff" value={form.staff_name} placeholder="Assigned cleaner" onChange={e=>setField('staff_name',e.target.value)}/></FormField>
        <FormField label="Notes" htmlFor="op-notes"><Textarea id="op-notes" rows={3} value={form.notes} placeholder="Optional notes…" onChange={e=>setField('notes',e.target.value)}/></FormField>
      </Modal>
    </div>
  )
}
