import {useState,useCallback} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {formatDate} from '../utils'
import Spinner from '../components/Spinner'

const TABS=['Today\'s Jobs','Schedule','Issues']
const STATUS_PILL={
  Scheduled:  {bg:'#EFF6FF',color:'#2563EB',label:'Scheduled'},
  InProgress: {bg:'#FFFBEB',color:'#D97706',label:'In Progress'},
  Complete:   {bg:'#ECFDF5',color:'#059669',label:'Complete'},
  Missed:     {bg:'#FEF2F2',color:'#DC2626',label:'Missed'},
  Cancelled:  {bg:'#F1F5F9',color:'#94A3B8',label:'Cancelled'},
}
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const EMPTY_JOB={site_id:'',client_name:'',job_date:new Date().toISOString().slice(0,10),start_time:'06:00',staff_name:'',notes:''}

function elapsed(clockIn){
  if(!clockIn)return '—'
  const mins=Math.round((Date.now()-new Date(clockIn).getTime())/60000)
  const h=Math.floor(mins/60)
  const m=mins%60
  return h>0?`${h}h ${m}m`:`${m}m`
}
function duration(clockIn,clockOut){
  if(!clockIn||!clockOut)return '—'
  const mins=Math.round((new Date(clockOut).getTime()-new Date(clockIn).getTime())/60000)
  const h=Math.floor(mins/60)
  const m=mins%60
  return h>0?`${h}h ${m}m`:`${m}m`
}
function fmtTime(t){
  if(!t)return '—'
  if(t.includes('T'))return new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
  return t
}

const pill=(status)=>{
  const s=STATUS_PILL[status]||STATUS_PILL.Scheduled
  return <span style={{background:s.bg,color:s.color,fontSize:'0.7rem',fontWeight:700,padding:'3px 10px',borderRadius:20,whiteSpace:'nowrap'}}>{s.label}</span>
}
const thStyle={padding:'10px 14px',textAlign:'left',fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)'}
const tdStyle={padding:'10px 14px',fontSize:'0.8rem'}

export default function Operations({openLead}){
  const [tab,setTab]=useState("Today's Jobs")
  const [showModal,setShowModal]=useState(false)
  const [form,setForm]=useState({...EMPTY_JOB})
  const qc=useQueryClient()

  const {data,isLoading}=useQuery({queryKey:['operations'],queryFn:api.operations,staleTime:60000})
  const ops=data||{}
  const todayJobs=Array.isArray(ops.today_jobs)?ops.today_jobs:[]
  const schedule=Array.isArray(ops.schedule)?ops.schedule:[]
  const missedJobs=todayJobs.filter(j=>j.status==='Missed')

  const clockInMut=useMutation({mutationFn:api.clockIn,onSuccess:()=>qc.invalidateQueries({queryKey:['operations']})})
  const clockOutMut=useMutation({mutationFn:api.clockOut,onSuccess:()=>qc.invalidateQueries({queryKey:['operations']})})
  const createMut=useMutation({mutationFn:api.createJob,onSuccess:()=>{qc.invalidateQueries({queryKey:['operations']});setShowModal(false);setForm({...EMPTY_JOB})}})

  const setField=useCallback((k,v)=>setForm(f=>({...f,[k]:v})),[])
  const handleCreate=useCallback(()=>{
    if(!form.site_id||!form.client_name||!form.staff_name)return
    createMut.mutate(form)
  },[form,createMut])

  const KPI=({label,value,sub,color})=>(
    <div style={{flex:1,minWidth:140,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
      <div style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:'1.4rem',fontWeight:800,color:color||'var(--text-1)',letterSpacing:'-.02em'}}>{value}</div>
      {sub&&<div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:4}}>{sub}</div>}
    </div>
  )

  return(
    <div style={{padding:'28px 32px',maxWidth:1100,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-.02em',margin:0}}>Operations</h1>
          <p style={{fontSize:'0.875rem',color:'var(--text-3)',marginTop:4}}>Daily job scheduling, clock tracking & issue management</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display:'flex',gap:16,marginBottom:24,flexWrap:'wrap'}}>
        <KPI label="Active Jobs" value={ops.active_jobs||0} color="var(--teal)"/>
        <KPI label="Total Sites" value={ops.total_sites||0}/>
        <KPI label="Today's Cleans" value={todayJobs.length} sub="scheduled today"/>
        <KPI label="Missed Jobs" value={ops.missed_count||0} color={(ops.missed_count||0)>0?'#DC2626':'var(--text-1)'}/>
      </div>

      {/* Missed Jobs Alert */}
      {(ops.missed_count||0)>0&&(
        <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:'var(--r-lg)',padding:'14px 20px',marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:'0.85rem',color:'#DC2626',marginBottom:missedJobs.length?8:0}}>
            {ops.missed_count} missed job{ops.missed_count>1?'s':''} today — please investigate
          </div>
          {missedJobs.map((j,i)=>(
            <div key={j.id||i} style={{fontSize:'0.8rem',color:'#991B1B',padding:'3px 0',cursor:j.place_id?'pointer':'default'}}
              onClick={()=>j.place_id&&openLead&&openLead(j.place_id)}>
              {j.client_name||'Unknown'} — {fmtTime(j.start_time)} ({j.staff_name||'Unassigned'})
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--border)'}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:'8px 18px',fontSize:'0.8rem',fontWeight:tab===t?700:500,
            border:'none',borderBottom:tab===t?'2px solid var(--teal)':'2px solid transparent',
            background:'transparent',color:tab===t?'var(--text-1)':'var(--text-muted)',cursor:'pointer'
          }}>
            {t}
            {t==='Issues'&&(ops.open_issues||0)>0?<span style={{background:'#DC2626',color:'#fff',fontSize:'0.65rem',fontWeight:700,padding:'1px 6px',borderRadius:10,marginLeft:6}}>{ops.open_issues}</span>:''}
          </button>
        ))}
      </div>

      {isLoading&&<div style={{textAlign:'center',padding:60}}><Spinner/></div>}

      {/* Tab 1: Today's Jobs */}
      {tab==="Today's Jobs"&&!isLoading&&(
        <>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
            <button onClick={()=>setShowModal(true)} style={{
              background:'var(--teal)',color:'#fff',border:'none',borderRadius:8,
              padding:'8px 18px',fontSize:'0.8rem',fontWeight:700,cursor:'pointer'
            }}>+ Schedule Job</button>
          </div>
          {todayJobs.length===0
            ?<div style={{padding:60,textAlign:'center',color:'var(--text-muted)'}}>No jobs scheduled for today.</div>
            :<div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
                <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                  {['ID','Site / Client','Start','Staff','Status','Clock In','Clock Out','Duration','Actions'].map(h=>
                    <th key={h} style={thStyle}>{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {todayJobs.map((j,i)=>(
                    <tr key={j.id||i} style={{borderBottom:'1px solid var(--border)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--bg-raised)'}
                      onMouseLeave={e=>e.currentTarget.style.background=''}>
                      <td style={{...tdStyle,fontWeight:600,color:'var(--text-muted)',fontSize:'0.75rem'}}>#{j.id||i+1}</td>
                      <td style={tdStyle}>
                        <div style={{fontWeight:700,fontSize:'0.85rem',cursor:j.place_id?'pointer':'default'}}
                          onClick={()=>j.place_id&&openLead&&openLead(j.place_id)}>
                          {j.client_name||'—'}
                        </div>
                        <div style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{j.site_id?`Site ${j.site_id}`:''}</div>
                      </td>
                      <td style={tdStyle}>{fmtTime(j.start_time)}</td>
                      <td style={tdStyle}>{j.staff_name||'Unassigned'}</td>
                      <td style={tdStyle}>{pill(j.status)}</td>
                      <td style={tdStyle}>{j.clock_in?fmtTime(j.clock_in):'—'}</td>
                      <td style={tdStyle}>{j.clock_out?fmtTime(j.clock_out):'—'}</td>
                      <td style={tdStyle}>
                        {j.status==='Complete'?duration(j.clock_in,j.clock_out)
                          :j.status==='InProgress'?<span style={{color:'#D97706',fontWeight:600}}>{elapsed(j.clock_in)}</span>
                          :'—'}
                      </td>
                      <td style={tdStyle}>
                        {j.status==='Scheduled'&&(
                          <button onClick={()=>clockInMut.mutate(j.id)} disabled={clockInMut.isPending}
                            style={{background:'#059669',color:'#fff',border:'none',borderRadius:6,padding:'5px 12px',fontSize:'0.75rem',fontWeight:700,cursor:'pointer',opacity:clockInMut.isPending?0.6:1}}>
                            Clock In
                          </button>
                        )}
                        {j.status==='InProgress'&&(
                          <button onClick={()=>clockOutMut.mutate(j.id)} disabled={clockOutMut.isPending}
                            style={{background:'#D97706',color:'#fff',border:'none',borderRadius:6,padding:'5px 12px',fontSize:'0.75rem',fontWeight:700,cursor:'pointer',opacity:clockOutMut.isPending?0.6:1}}>
                            Clock Out
                          </button>
                        )}
                        {j.status==='Missed'&&<span style={{color:'#DC2626',fontWeight:700,fontSize:'0.75rem'}}>Missed</span>}
                        {j.status==='Complete'&&<span style={{color:'#059669',fontSize:'0.75rem'}}>Done</span>}
                        {j.status==='Cancelled'&&<span style={{color:'#94A3B8',fontSize:'0.75rem'}}>Cancelled</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </>
      )}

      {/* Tab 2: Schedule (next 7 days) */}
      {tab==='Schedule'&&!isLoading&&(
        schedule.length===0
          ?<div style={{padding:60,textAlign:'center',color:'var(--text-muted)'}}>No upcoming schedule entries.</div>
          :<div style={{display:'grid',gap:14}}>
            {DAYS.map(day=>{
              const dayJobs=schedule.filter(s=>{
                if(s.day)return s.day.toLowerCase()===day.toLowerCase()
                if(s.job_date){
                  const d=new Date(s.job_date)
                  return DAYS[d.getDay()===0?6:d.getDay()-1]===day
                }
                return false
              })
              if(dayJobs.length===0)return null
              const dateStr=dayJobs[0]?.job_date?formatDate(dayJobs[0].job_date):''
              return(
                <div key={day} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
                  <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontWeight:700,fontSize:'0.9rem',color:'var(--text-1)'}}>{day}</span>
                    {dateStr&&<span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{dateStr}</span>}
                  </div>
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                      {['Client','Site','Time','Staff','Status'].map(h=><th key={h} style={thStyle}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {dayJobs.map((s,i)=>{
                        const st=STATUS_PILL[s.status]||STATUS_PILL.Scheduled
                        return(
                          <tr key={s.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                            <td style={{...tdStyle,fontWeight:600}}>{s.client_name||'—'}</td>
                            <td style={{...tdStyle,color:'var(--text-muted)'}}>{s.site_id?`Site ${s.site_id}`:''}</td>
                            <td style={tdStyle}>{fmtTime(s.start_time)}</td>
                            <td style={tdStyle}>{s.staff_name||'Unassigned'}</td>
                            <td style={tdStyle}><span style={{background:st.bg,color:st.color,fontSize:'0.7rem',fontWeight:700,padding:'3px 10px',borderRadius:20}}>{st.label}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
      )}

      {/* Tab 3: Issues */}
      {tab==='Issues'&&!isLoading&&(
        <div style={{padding:40,textAlign:'center'}}>
          <div style={{fontSize:'2.5rem',marginBottom:12}}>!</div>
          <div style={{fontWeight:700,fontSize:'1rem',marginBottom:8,color:'var(--text-1)'}}>
            {(ops.open_issues||0)>0?`${ops.open_issues} Open Issue${ops.open_issues>1?'s':''}`:'No Open Issues'}
          </div>
          <p style={{fontSize:'0.85rem',color:'var(--text-muted)',maxWidth:400,margin:'0 auto',lineHeight:1.5}}>
            View quality inspections and incidents in the Quality module.
          </p>
        </div>
      )}

      {/* Schedule Job Modal */}
      {showModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}
          onClick={e=>{if(e.target===e.currentTarget){setShowModal(false);setForm({...EMPTY_JOB})}}}>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'28px 32px',width:440,maxHeight:'90vh',overflow:'auto'}}>
            <h2 style={{margin:'0 0 20px',fontSize:'1.1rem',fontWeight:800}}>Schedule Job</h2>
            {[
              {key:'site_id',label:'Site ID',type:'text',placeholder:'e.g. SITE-042'},
              {key:'client_name',label:'Client Name',type:'text',placeholder:'Client name'},
              {key:'job_date',label:'Date',type:'date'},
              {key:'start_time',label:'Start Time',type:'time'},
              {key:'staff_name',label:'Staff Name',type:'text',placeholder:'Assigned cleaner'},
            ].map(f=>(
              <div key={f.key} style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>{f.label}</label>
                <input className="form-input" type={f.type} value={form[f.key]} placeholder={f.placeholder||''}
                  onChange={e=>setField(f.key,e.target.value)}
                  style={{width:'100%',boxSizing:'border-box'}}/>
              </div>
            ))}
            <div style={{marginBottom:20}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>Notes</label>
              <textarea className="form-input" rows={3} value={form.notes} placeholder="Optional notes…"
                onChange={e=>setField('notes',e.target.value)}
                style={{width:'100%',boxSizing:'border-box',resize:'vertical'}}/>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>{setShowModal(false);setForm({...EMPTY_JOB})}} style={{
                background:'transparent',border:'1px solid var(--border)',borderRadius:8,
                padding:'8px 18px',fontSize:'0.8rem',cursor:'pointer',color:'var(--text-muted)'
              }}>Cancel</button>
              <button onClick={handleCreate} disabled={createMut.isPending||!form.site_id||!form.client_name||!form.staff_name}
                style={{
                  background:'var(--teal)',color:'#fff',border:'none',borderRadius:8,
                  padding:'8px 22px',fontSize:'0.8rem',fontWeight:700,cursor:'pointer',
                  opacity:(!form.site_id||!form.client_name||!form.staff_name)?0.5:1
                }}>
                {createMut.isPending?'Scheduling…':'Schedule'}
              </button>
            </div>
            {createMut.isError&&<div style={{color:'#DC2626',fontSize:'0.8rem',marginTop:10}}>Failed to schedule job. Please try again.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
