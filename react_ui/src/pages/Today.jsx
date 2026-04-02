import {useState} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'

const TYPE_META={
  call:{icon:'📞',label:'Call',color:'#3b82f6'},
  follow_up:{icon:'🔄',label:'Follow Up',color:'#f59e0b'},
  email:{icon:'📧',label:'Email',color:'#10b981'},
  review_signal:{icon:'📡',label:'Review Signal',color:'#8b5cf6'},
  renewal_check:{icon:'🔄',label:'Renewal',color:'#06b6d4'},
  site_visit:{icon:'🏢',label:'Site Visit',color:'#ec4899'},
  quote:{icon:'💰',label:'Quote',color:'#f59e0b'},
  admin:{icon:'📋',label:'Admin',color:'#6b7280'},
}

export default function Today(){
  const qc=useQueryClient()
  const {data,isLoading}=useQuery({queryKey:['tasks-today'],queryFn:api.tasks})
  const complete=useMutation({mutationFn:api.completeTask,onSuccess:()=>qc.invalidateQueries({queryKey:['tasks-today']})})
  const snooze=useMutation({mutationFn:api.snoozeTask,onSuccess:()=>qc.invalidateQueries({queryKey:['tasks-today']})})

  const tasks=Array.isArray(data?.tasks)?data.tasks:Array.isArray(data)?data:[]
  const summary=data?.summary||{}
  const today=new Date()
  const greeting=today.getHours()<12?'Good morning':'Good afternoon'
  const dateStr=today.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

  // Group by priority
  const high=tasks.filter(t=>t.priority==='high'&&!t.completed)
  const medium=tasks.filter(t=>t.priority==='medium'&&!t.completed)
  const low=tasks.filter(t=>(!t.priority||t.priority==='low')&&!t.completed)
  const done=tasks.filter(t=>t.completed)

  return(
    <div style={{padding:'28px 36px',maxWidth:1000,margin:'0 auto'}}>
      {/* Header */}
      <div style={{marginBottom:28}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
          <span style={{background:'var(--teal)',color:'white',fontSize:'0.65rem',fontWeight:700,padding:'3px 10px',borderRadius:4,textTransform:'uppercase'}}>Today</span>
          <h1 style={{fontSize:'1.35rem',fontWeight:800,color:'var(--text-1)',margin:0}}>Today's Priorities</h1>
        </div>
        <div style={{fontSize:'0.85rem',color:'var(--text-muted)'}}>{greeting} · {dateStr}</div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:28}}>
        <KPI label="Tasks Due" value={tasks.filter(t=>!t.completed).length} color="var(--teal)"/>
        <KPI label="Calls to Make" value={summary.calls||tasks.filter(t=>t.type==='call'&&!t.completed).length} color="#3b82f6"/>
        <KPI label="Follow-ups" value={summary.follow_ups||tasks.filter(t=>t.type==='follow_up'&&!t.completed).length} color="#f59e0b"/>
        <KPI label="Completed" value={done.length} color="#10b981"/>
      </div>

      {isLoading?(
        <div style={{textAlign:'center',padding:60,color:'var(--text-muted)'}}>Loading today's tasks...</div>
      ):tasks.length===0?(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:60,textAlign:'center'}}>
          <div style={{fontSize:'2.5rem',marginBottom:12}}>🎯</div>
          <div style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)'}}>All clear for today</div>
          <div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginTop:8}}>No tasks scheduled. The system will generate daily priorities from your pipeline, signals, and renewals.</div>
        </div>
      ):(
        <div>
          {/* High Priority */}
          {high.length>0&&<TaskGroup label="🔴 High Priority" tasks={high} complete={complete} snooze={snooze}/>}
          {/* Medium Priority */}
          {medium.length>0&&<TaskGroup label="🟡 Medium Priority" tasks={medium} complete={complete} snooze={snooze}/>}
          {/* Low / Other */}
          {low.length>0&&<TaskGroup label="🟢 Normal" tasks={low} complete={complete} snooze={snooze}/>}
          {/* Completed */}
          {done.length>0&&(
            <div style={{marginTop:24}}>
              <div style={{fontSize:'0.85rem',fontWeight:700,color:'var(--text-muted)',marginBottom:10}}>✓ Completed ({done.length})</div>
              {done.map((t,i)=>(
                <div key={t.id||i} style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',opacity:0.5}}>
                  <span style={{textDecoration:'line-through',color:'var(--text-muted)',fontSize:'0.82rem'}}>{t.description||t.title||'Task'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskGroup({label,tasks,complete,snooze}){
  return(
    <div style={{marginBottom:20}}>
      <div style={{fontSize:'0.85rem',fontWeight:700,color:'var(--text-1)',marginBottom:10}}>{label}</div>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
        {tasks.map((t,i)=>{
          const meta=TYPE_META[t.type]||{icon:'📌',label:t.type||'Task',color:'#6b7280'}
          return(
            <div key={t.id||i} style={{padding:'14px 18px',borderBottom:i<tasks.length-1?'1px solid var(--border)':'none',display:'flex',alignItems:'center',gap:14}}>
              <span style={{fontSize:'1.2rem'}}>{meta.icon}</span>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{padding:'2px 8px',borderRadius:4,fontSize:'0.65rem',fontWeight:700,color:meta.color,background:meta.color+'18'}}>{meta.label}</span>
                  {t.entity_name&&<span style={{fontSize:'0.82rem',fontWeight:600,color:'var(--teal)'}}>{t.entity_name}</span>}
                </div>
                <div style={{fontSize:'0.85rem',color:'var(--text-1)',marginTop:3}}>{t.description||t.title||'—'}</div>
                {t.due_time&&<div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:2}}>Due: {t.due_time}</div>}
              </div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>complete.mutate(t.id)} style={{padding:'6px 14px',borderRadius:'var(--r-sm)',border:'none',background:'#10b98118',color:'#10b981',fontSize:'0.75rem',fontWeight:600,cursor:'pointer'}}>✓ Done</button>
                <button onClick={()=>snooze.mutate(t.id)} style={{padding:'6px 14px',borderRadius:'var(--r-sm)',border:'none',background:'#f59e0b18',color:'#f59e0b',fontSize:'0.75rem',fontWeight:600,cursor:'pointer'}}>Snooze</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KPI({label,value,color}){
  return(
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
      <div style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:'1.5rem',fontWeight:800,color:color||'var(--text-1)'}}>{value}</div>
    </div>
  )
}
