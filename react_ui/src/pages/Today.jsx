import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {PageHeader, KPICard, Card, Badge, Button, EmptyState, Skeleton, SkeletonKPIs} from '../components/ui'
import {useToast} from '../components/Toast'

const TYPE_META={
  call:{icon:'📞',label:'Call',tone:'info'},
  follow_up:{icon:'🔄',label:'Follow Up',tone:'warning'},
  email:{icon:'📧',label:'Email',tone:'success'},
  review_signal:{icon:'📡',label:'Review Signal',tone:'teal'},
  renewal_check:{icon:'🔄',label:'Renewal',tone:'info'},
  site_visit:{icon:'🏢',label:'Site Visit',tone:'danger'},
  quote:{icon:'💰',label:'Quote',tone:'warning'},
  admin:{icon:'📋',label:'Admin',tone:'neutral'},
}
const PRIORITY=[
  {key:'high',label:'🔴 High Priority',test:t=>t.priority==='high'},
  {key:'medium',label:'🟡 Medium Priority',test:t=>t.priority==='medium'},
  {key:'low',label:'🟢 Normal',test:t=>!t.priority||t.priority==='low'},
]

export default function Today(){
  const qc=useQueryClient()
  const toast=useToast()
  const {data,isLoading}=useQuery({queryKey:['tasks-today'],queryFn:api.tasks})

  // Optimistic complete: remove the task from the cache immediately, roll back on error.
  const complete=useMutation({
    mutationFn:api.completeTask,
    onMutate:async(id)=>{
      await qc.cancelQueries({queryKey:['tasks-today']})
      const prev=qc.getQueryData(['tasks-today'])
      qc.setQueryData(['tasks-today'],old=>{
        const list=Array.isArray(old?.tasks)?old.tasks:Array.isArray(old)?old:[]
        const next=list.map(t=>t.id===id?{...t,completed:true}:t)
        return Array.isArray(old?.tasks)?{...old,tasks:next}:next
      })
      return {prev}
    },
    onError:(e,id,ctx)=>{ if(ctx?.prev) qc.setQueryData(['tasks-today'],ctx.prev); toast.error('Could not complete task — '+(e.message||'try again')) },
    onSuccess:()=>toast.success('Task completed'),
    onSettled:()=>qc.invalidateQueries({queryKey:['tasks-today']}),
  })
  const snooze=useMutation({
    mutationFn:api.snoozeTask,
    onSuccess:()=>{toast.info('Task snoozed to tomorrow');qc.invalidateQueries({queryKey:['tasks-today']})},
    onError:e=>toast.error('Could not snooze — '+(e.message||'try again')),
  })

  const tasks=Array.isArray(data?.tasks)?data.tasks:Array.isArray(data)?data:[]
  const summary=data?.summary||{}
  const open=tasks.filter(t=>!t.completed)
  const done=tasks.filter(t=>t.completed)
  const today=new Date()
  const greeting=today.getHours()<12?'Good morning':today.getHours()<18?'Good afternoon':'Good evening'
  const dateStr=today.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

  return(
    <div style={{padding:'28px 36px',maxWidth:1000,margin:'0 auto'}}>
      <PageHeader badge="Today" title="Today's Priorities" subtitle={`${greeting} · ${dateStr}`}/>

      {isLoading ? <SkeletonKPIs count={4}/> : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          <KPICard label="Tasks Due" value={open.length} color="var(--teal)" icon="🎯"/>
          <KPICard label="Calls to Make" value={summary.calls??open.filter(t=>t.type==='call').length} color="var(--info)" icon="📞"/>
          <KPICard label="Follow-ups" value={summary.follow_ups??open.filter(t=>t.type==='follow_up').length} color="var(--warning)" icon="🔄"/>
          <KPICard label="Completed" value={done.length} color="var(--success)" icon="✓"/>
        </div>
      )}

      <div style={{marginTop:28}}>
        {isLoading ? (
          <Card><div style={{display:'flex',flexDirection:'column',gap:18}}>
            {Array.from({length:4}).map((_,i)=>(
              <div key={i} style={{display:'flex',gap:14,alignItems:'center'}}>
                <Skeleton w={28} h={28} r={8}/>
                <div style={{flex:1}}><Skeleton w="40%" h={11}/><div style={{height:7}}/><Skeleton w="75%" h={13}/></div>
              </div>
            ))}
          </div></Card>
        ) : open.length===0 ? (
          <EmptyState icon="🎯" title="All clear for today"
            message="No tasks scheduled. The system generates daily priorities from your pipeline, signals, and renewals."/>
        ) : (
          <>
            {PRIORITY.map(g=>{
              const items=open.filter(g.test)
              if(!items.length) return null
              return <TaskGroup key={g.key} label={g.label} tasks={items} complete={complete} snooze={snooze}/>
            })}
            {done.length>0 && (
              <div style={{marginTop:24}}>
                <div style={{fontSize:'.85rem',fontWeight:700,color:'var(--text-muted)',marginBottom:10}}>✓ Completed ({done.length})</div>
                <Card padding={0}>
                  {done.map((t,i)=>(
                    <div key={t.id||i} style={{padding:'11px 16px',borderBottom:i<done.length-1?'1px solid var(--border)':'none',opacity:.55}}>
                      <span style={{textDecoration:'line-through',color:'var(--text-muted)',fontSize:'.82rem'}}>{t.description||t.title||'Task'}</span>
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TaskGroup({label,tasks,complete,snooze}){
  return(
    <div style={{marginBottom:20}}>
      <div style={{fontSize:'.85rem',fontWeight:700,color:'var(--text-1)',marginBottom:10}}>{label}</div>
      <Card padding={0}>
        {tasks.map((t,i)=>{
          const meta=TYPE_META[t.type]||{icon:'📌',label:t.type||'Task',tone:'neutral'}
          const busy=complete.isPending&&complete.variables===t.id
          return(
            <div key={t.id||i} style={{padding:'14px 18px',borderBottom:i<tasks.length-1?'1px solid var(--border)':'none',
              display:'flex',alignItems:'center',gap:14}}>
              <span style={{fontSize:'1.2rem'}}>{meta.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {t.entity_name&&<span style={{fontSize:'.82rem',fontWeight:600,color:'var(--teal)'}}>{t.entity_name}</span>}
                </div>
                <div style={{fontSize:'.85rem',color:'var(--text-1)',marginTop:3}}>{t.description||t.title||'—'}</div>
                {t.due_time&&<div style={{fontSize:'.7rem',color:'var(--text-muted)',marginTop:2}}>Due: {t.due_time}</div>}
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <Button variant="success" size="sm" loading={busy} onClick={()=>complete.mutate(t.id)}>✓ Done</Button>
                <Button variant="ghost" size="sm" onClick={()=>snooze.mutate(t.id)}>Snooze</Button>
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
