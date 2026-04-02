import {useState} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {timeAgo,formatDate} from '../utils'
import Spinner from '../components/Spinner'

const CONNECTOR_LABELS={google_maps:'Google Maps',companies_house:'Companies House',cqc:'CQC',contracts_finder:'Contracts Finder',charity_commission:'Charity Commission',planning_applications:'Planning Applications'}
const CONNECTOR_ICONS={google_maps:'🗺',companies_house:'🏛',cqc:'🏥',contracts_finder:'📋',charity_commission:'💛',planning_applications:'🏗️'}

const pill=(bg,color,text)=>(<span style={{fontSize:'0.65rem',fontWeight:700,padding:'2px 10px',borderRadius:100,background:bg,color,whiteSpace:'nowrap'}}>{text}</span>)

export default function Automation(){
  const [msgs,setMsgs]=useState({})
  const [tab,setTab]=useState('overview')
  const [docCatFilter,setDocCatFilter]=useState('')
  const [docStatusFilter,setDocStatusFilter]=useState('')
  const [editDoc,setEditDoc]=useState(null)
  const [editForm,setEditForm]=useState({})
  const queryClient=useQueryClient()
  const {data:status,isLoading}=useQuery({queryKey:['adminStatus'],queryFn:api.adminStatus,refetchInterval:15000})
  const {data:crm}=useQuery({queryKey:['crmStatus'],queryFn:api.crmStatus,staleTime:30000,retry:false})
  const {data:guard}=useQuery({queryKey:['emailGuardStats'],queryFn:api.emailGuardStats,staleTime:30000,retry:false})
  const {data:health}=useQuery({queryKey:['health'],queryFn:()=>fetch('/api/health').then(r=>r.json()),staleTime:30000,retry:false})

  async function run(key,fn){
    setMsgs(m=>({...m,[key]:'running…'}))
    try{
      const r=await fn()
      const msg=r?.processed??r?.count??r?.rescored??r?.pushed??r?.synced??'done'
      setMsgs(m=>({...m,[key]:'✓ '+msg}))
    }catch(e){setMsgs(m=>({...m,[key]:'✗ '+((e&&e.message)||'Error')}))}
  }

  const connectors=Array.isArray(status)?status:Array.isArray(status?.connectors)?status.connectors:[]
  const tabs=[
    {id:'overview',label:'Overview',icon:'📊'},
    {id:'connectors',label:'Connectors',icon:'🔌'},
    {id:'enrichment',label:'Enrichment',icon:'🧠'},
    {id:'crm',label:'CRM Pipeline',icon:'🔄'},
    {id:'email',label:'Email Guard',icon:'🛡️'},
    {id:'documents',label:'Documents',icon:'📋'},
  ]

  const kpi=(label,value,sub,color)=>(
    <div style={{flex:1,minWidth:130,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'16px 18px'}}>
      <div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:'1.3rem',fontWeight:800,color:color||'var(--text-1)'}}>{value??'—'}</div>
      {sub&&<div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:2}}>{sub}</div>}
    </div>
  )

  // ── Overview Tab ───────────────────────────────────────────────────────
  const renderOverview=()=>{
    const h=(health&&typeof health==='object'&&!Array.isArray(health))?health:{}
    const totalEntities=h.total_entities||h.total||0
    const totalSignals=h.total_signals||0
    const totalOpps=h.total_opportunities||0
    const avgScore=h.avg_score||0
    const crmData=(crm&&typeof crm==='object'&&!Array.isArray(crm))?crm:{}
    const guardData=(guard&&typeof guard==='object'&&!Array.isArray(guard))?guard:{}
    return(<>
      {/* System Health */}
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>System Health</div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          {kpi('Entities',totalEntities.toLocaleString())}
          {kpi('Signals',totalSignals.toLocaleString())}
          {kpi('Opportunities',totalOpps.toLocaleString())}
          {kpi('Avg Score',avgScore?Math.round(avgScore):0)}
          {kpi('DB Status',pill('#ECFDF5','#059669','● Online'))}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>Quick Actions</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
          {[
            {key:'rescore',label:'Re-score All Entities',desc:'Recompute opportunity scores for every entity (~49k). 30-60s.',fn:api.rescore,icon:'↻'},
            {key:'crm_push',label:'Push to CRM',desc:'Push qualified leads to GAS CRM immediately.',fn:api.crmSync,icon:'🚀'},
            {key:'tasks',label:'Generate Daily Tasks',desc:'Build today\'s prioritised call list from signals + renewals.',fn:api.runDailyTasks,icon:'🗓'},
          ].map(a=>(
            <div key={a.key} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'16px 18px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <span style={{fontWeight:700,fontSize:'0.875rem'}}>{a.icon} {a.label}</span>
              </div>
              <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:12}}>{a.desc}</div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                {msgs[a.key]&&<span style={{fontSize:'0.75rem',color:msgs[a.key].startsWith('✓')?'var(--teal)':'#ef4444'}}>{msgs[a.key]}</span>}
                <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={()=>run(a.key,a.fn)}>▶ Run</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline Summary */}
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>Pipeline & CRM Summary</div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          {kpi('CRM Pushed',crmData.total_pushed||0)}
          {kpi('Pending Push',crmData.pending||0,null,crmData.pending>0?'#D97706':undefined)}
          {kpi('Emails Sent (24h)',guardData.sent_24h||0)}
          {kpi('Bounce Rate',guardData.bounce_rate?guardData.bounce_rate+'%':'0%',null,guardData.bounce_rate>5?'#DC2626':undefined)}
          {kpi('Suppressions',guardData.total_suppressed||0,null,guardData.total_suppressed>0?'#D97706':undefined)}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>Connector Status</div>
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Source','Status','Records','Signals','Last Run'].map(h=><th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)'}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(connectors.length>0?connectors:Object.keys(CONNECTOR_LABELS).map(s=>({source:s,status:'IDLE',record_count:0,signal_count:0}))).map(c=>(
                <tr key={c.source} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'10px 16px',fontWeight:600,fontSize:'0.85rem'}}>{CONNECTOR_ICONS[c.source]||'🔌'} {CONNECTOR_LABELS[c.source]||c.source}</td>
                  <td style={{padding:'10px 16px'}}>{c.status==='RUNNING'?pill('rgba(245,158,11,0.15)','#D97706','RUNNING'):pill('var(--bg-raised)','var(--text-muted)',c.status||'IDLE')}</td>
                  <td style={{padding:'10px 16px',fontWeight:700}}>{(c.record_count||0).toLocaleString()}</td>
                  <td style={{padding:'10px 16px',fontWeight:700}}>{(c.signal_count||0).toLocaleString()}</td>
                  <td style={{padding:'10px 16px',fontSize:'0.8rem',color:'var(--text-muted)'}}>{c.last_run?timeAgo(c.last_run):'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>)
  }

  // ── Connectors Tab ─────────────────────────────────────────────────────
  const renderConnectors=()=>(
    <div>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>Data Connectors</div>
      <p style={{fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:16}}>Ingest leads from government databases, Companies House, CQC, and mapping APIs. Each connector pulls new records and generates signals.</p>
      {isLoading?<Spinner/>:(
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
          {(connectors.length>0?connectors:Object.entries(CONNECTOR_LABELS).map(([s,l])=>({source:s,label:l,status:'IDLE',record_count:0,signal_count:0}))).map(c=>(
            <div key={c.source} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:'1.1rem'}}>{CONNECTOR_ICONS[c.source]||'🔌'}</span>
                  <span style={{fontWeight:700,fontSize:'0.9rem'}}>{CONNECTOR_LABELS[c.source]||c.source}</span>
                </div>
                {c.status==='RUNNING'?pill('rgba(245,158,11,0.15)','#D97706','RUNNING'):pill('var(--bg-raised)','var(--text-muted)',c.status||'IDLE')}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                <div><div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Records</div><div style={{fontSize:'1.1rem',fontWeight:800}}>{(c.record_count||0).toLocaleString()}</div></div>
                <div><div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Signals</div><div style={{fontSize:'1.1rem',fontWeight:800}}>{(c.signal_count||0).toLocaleString()}</div></div>
              </div>
              {c.last_run&&<div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginBottom:12}}>Last run: {timeAgo(c.last_run)} ({formatDate(c.last_run)})</div>}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                {msgs[c.source]&&<span style={{fontSize:'0.75rem',color:msgs[c.source].startsWith('✓')?'var(--teal)':'#ef4444',transition:'all 0.3s'}}>{msgs[c.source]}</span>}
                <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={()=>run(c.source,()=>api.runConnector(c.source))} disabled={msgs[c.source]==='running…'}>
                  {msgs[c.source]==='running…'?'⏳':'↻'} Sync
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── Enrichment Tab ─────────────────────────────────────────────────────
  const renderEnrichment=()=>(
    <div>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>Intelligence Enrichment Pipeline</div>
      <p style={{fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:16}}>These jobs enrich raw lead data with scoring, contacts, renewal predictions, and daily task generation. Run in sequence for best results.</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:12}}>
        {[
          {key:'rescore',label:'Re-score All Entities',desc:'Recompute opportunity scores for every entity based on current signals, financials, and sector data. ~49k entities, 30-60s.',fn:api.rescore,icon:'↻',cost:'Free'},
          {key:'planning',label:'Planning Relevance Filter',desc:'Score all planning signals for commercial cleaning relevance. Rules-based, no API cost.',fn:api.runPlanningFilter,icon:'🏗️',cost:'Free'},
          {key:'enrichment',label:'Contact Enrichment',desc:'Extract decision-maker names, roles, and contact details from Companies House + CQC data.',fn:api.runEnrichment,icon:'👤',cost:'Free'},
          {key:'renewals',label:'Renewal Predictions',desc:'Estimate contract renewal windows from CQC registration dates, Companies House filings, and planning permissions.',fn:api.runRenewals,icon:'📅',cost:'Free'},
          {key:'tasks',label:'Generate Daily Tasks',desc:'Build today\'s prioritised call/email list from signals, renewals, pipeline stage, and outreach history.',fn:api.runDailyTasks,icon:'🗓',cost:'Free'},
        ].map((job,i)=>(
          <div key={job.key} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 22px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
            <div style={{display:'flex',alignItems:'center',gap:14,flex:1}}>
              <div style={{width:32,height:32,borderRadius:8,background:'rgba(10,150,136,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',flexShrink:0}}>{job.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:'0.9rem',marginBottom:2}}>{job.label}</div>
                <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{job.desc}</div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
              <span style={{fontSize:'0.65rem',padding:'2px 8px',borderRadius:100,background:'rgba(10,150,136,0.1)',color:'var(--teal)',fontWeight:600}}>{job.cost}</span>
              {msgs[job.key]&&<span style={{fontSize:'0.75rem',fontWeight:600,color:msgs[job.key].startsWith('✓')?'var(--teal)':msgs[job.key]==='running…'?'#D97706':'#ef4444',minWidth:80,textAlign:'right'}}>{msgs[job.key]}</span>}
              <button className="btn btn-ghost btn-sm" onClick={()=>run(job.key,job.fn)} disabled={msgs[job.key]==='running…'} style={{minWidth:70}}>
                {msgs[job.key]==='running…'?'⏳ Running':'▶ Run'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{marginTop:16,padding:'14px 18px',background:'rgba(10,150,136,0.06)',border:'1px solid rgba(10,150,136,0.15)',borderRadius:'var(--r-lg)',fontSize:'0.78rem',color:'var(--text-muted)'}}>
        💡 <strong>Recommended order:</strong> Re-score → Planning Filter → Contact Enrichment → Renewal Predictions → Daily Tasks. Running all 5 takes ~2-3 minutes.
      </div>
    </div>
  )

  // ── CRM Tab ────────────────────────────────────────────────────────────
  const renderCRM=()=>{
    const c=(crm&&typeof crm==='object'&&!Array.isArray(crm))?crm:{}
    const recentPushes=Array.isArray(c.recent_pushes)?c.recent_pushes:Array.isArray(c.recent_errors)?c.recent_errors:[]
    const byStatus=Array.isArray(c.by_status)?c.by_status:[]
    return(<>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>CRM Pipeline Status</div>
      <p style={{fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:16}}>Qualified leads are auto-pushed to GAS CRM every 30 minutes. GAS handles Gmail relay for outreach emails.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}>
        {kpi('Total Pushed',c.total_pushed||0)}
        {kpi('Pending Push',c.pending_push||c.pending||0,null,(c.pending_push||c.pending)>0?'#D97706':undefined)}
        {kpi('Sent Emails',c.sent||0,'via GAS','var(--teal)')}
        {kpi('Replied',c.replied||0,null,'#059669')}
        {kpi('Bounced',c.bounced||0,null,c.bounced>0?'#DC2626':undefined)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
          <div style={{fontWeight:700,marginBottom:8}}>🚀 Push Qualified Leads</div>
          <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginBottom:12}}>Force-push all qualified leads (score ≥70) to GAS CRM now. Normally runs every 30 min.</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {msgs.crm_push&&<span style={{fontSize:'0.75rem',color:msgs.crm_push.startsWith('✓')?'var(--teal)':'#ef4444'}}>{msgs.crm_push}</span>}
            <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={()=>run('crm_push',api.crmSync)}>▶ Push Now</button>
          </div>
        </div>
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
          <div style={{fontWeight:700,marginBottom:8}}>🔄 Sync CRM Status</div>
          <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginBottom:12}}>Pull latest email status (sent, opened, replied, bounced) from GAS back to local DB.</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {msgs.crm_sync&&<span style={{fontSize:'0.75rem',color:msgs.crm_sync.startsWith('✓')?'var(--teal)':'#ef4444'}}>{msgs.crm_sync}</span>}
            <button className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={()=>run('crm_sync',api.crmSync)}>▶ Sync Now</button>
          </div>
        </div>
      </div>
      {recentPushes.length>0&&(
        <div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>Recent Pushes</div>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                {['Entity','Email','Status','Pushed At'].map(h=><th key={h} style={{padding:'8px 14px',textAlign:'left',fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)'}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {recentPushes.slice(0,10).map((p,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'8px 14px',fontWeight:600,fontSize:'0.85rem'}}>{p.name||p.entity_name||p.business_name||'—'}</td>
                    <td style={{padding:'8px 14px',fontSize:'0.8rem',color:'var(--text-muted)'}}>{p.email||'—'}</td>
                    <td style={{padding:'8px 14px'}}>{pill(p.status==='sent'?'#ECFDF5':p.status==='bounced'?'#FEF2F2':'#F1F5F9',p.status==='sent'?'#059669':p.status==='bounced'?'#DC2626':'#64748B',p.status||p.handoff_status||'pending')}</td>
                    <td style={{padding:'8px 14px',fontSize:'0.8rem',color:'var(--text-muted)'}}>{(p.pushed_at||p.handoff_at)?timeAgo(p.pushed_at||p.handoff_at):'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>)
  }

  // ── Email Guard Tab ────────────────────────────────────────────────────
  const renderEmailGuard=()=>{
    const _g=(guard&&typeof guard==='object'&&!Array.isArray(guard))?guard:{}
    // Normalise field names: API returns today_sent/total_bounced, UI expects sent_24h/bounce_rate
    const g={
      ..._g,
      sent_24h:_g.sent_24h||_g.today_sent||0,
      blocked:_g.blocked||_g.today_blocked||0,
      bounced:_g.bounced||_g.total_bounced||0,
      validated:_g.validated||_g.total_delivered||0,
      bounce_rate:_g.bounce_rate!=null?_g.bounce_rate:(_g.today_sent>0?Math.round((_g.total_bounced||0)/(_g.today_sent||1)*100):0),
    }
    return(<>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>Email Deliverability Protection</div>
      <p style={{fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:16}}>Pre-send validation protects your domain reputation. Every email is checked for RFC format, DNS/MX records, role-based addresses, and bounce history before sending.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}>
        {kpi('Sent (24h)',g.sent_24h||0,null,'var(--teal)')}
        {kpi('Validated',g.validated||0)}
        {kpi('Blocked',g.blocked||0,null,g.blocked>0?'#D97706':undefined)}
        {kpi('Bounced',g.bounced||0,null,g.bounced>0?'#DC2626':undefined)}
        {kpi('Bounce Rate',(g.bounce_rate||0)+'%',null,g.bounce_rate>5?'#DC2626':g.bounce_rate>2?'#D97706':'#059669')}
        {kpi('Suppressions',g.total_suppressed||0)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>Validation Checks</div>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'16px 18px'}}>
            {['RFC format check','DNS/MX record verification','Role-based email filter','Bounce suppression list','Daily send throttle','Per-minute rate limit'].map((check,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:i<5?'1px solid var(--border)':'none'}}>
                <span style={{color:'#059669',fontSize:'0.9rem'}}>✓</span>
                <span style={{fontSize:'0.82rem'}}>{check}</span>
                <span style={{marginLeft:'auto',fontSize:'0.65rem',color:'var(--teal)',fontWeight:600}}>ACTIVE</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>Protection Status</div>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'16px 18px'}}>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:4}}>Domain Health</div>
              <div style={{height:8,borderRadius:4,background:'var(--border)',overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:4,width:g.bounce_rate>10?'30%':g.bounce_rate>5?'60%':'95%',background:g.bounce_rate>10?'#DC2626':g.bounce_rate>5?'#D97706':'#059669',transition:'width 0.5s'}}/>
              </div>
              <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:4}}>{g.bounce_rate>10?'At Risk':g.bounce_rate>5?'Watch':'Healthy'} — {g.bounce_rate||0}% bounce rate</div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:4}}>Daily Send Limit</div>
              <div style={{height:8,borderRadius:4,background:'var(--border)',overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:4,width:Math.min((g.sent_24h||0)/200*100,100)+'%',background:'var(--teal)',transition:'width 0.5s'}}/>
              </div>
              <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:4}}>{g.sent_24h||0} / 200 today</div>
            </div>
            <div>
              <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:4}}>Suppression List</div>
              <div style={{fontSize:'1.1rem',fontWeight:800}}>{g.total_suppressed||0} <span style={{fontSize:'0.7rem',fontWeight:400,color:'var(--text-muted)'}}>emails blocked from sending</span></div>
            </div>
          </div>
        </div>
      </div>
    </>)
  }

  // ── Documents Tab ──────────────────────────────────────────────────────
  const renderDocuments=()=>{
    const COMPLIANCE_CATEGORIES=['Company & Legal','Tax & HMRC','Insurance','Health & Safety','COSHH','Employment','Client Contracts','TUPE','Data Protection','Quality & Audit','Waste & Environmental','Vehicles & Equipment']
    const STATUS_COLORS={current:{bg:'#ECFDF5',color:'#059669'},missing:{bg:'#FEF2F2',color:'#DC2626'},expired:{bg:'#FFF7ED',color:'#EA580C'},draft:{bg:'#EFF6FF',color:'#2563EB'},review:{bg:'#FFFBEB',color:'#D97706'},uploaded:{bg:'#F5F3FF',color:'#7C3AED'}}
    const {data:compData,isLoading:compLoading}=useQuery({queryKey:['compliance'],queryFn:api.compliance,staleTime:30000,retry:false})
    const {data:compDocs}=useQuery({queryKey:['complianceDocs',docCatFilter,docStatusFilter],queryFn:()=>api.complianceDocuments(docCatFilter,docStatusFilter),staleTime:15000,retry:false})
    const {data:compExpiring}=useQuery({queryKey:['complianceExpiring'],queryFn:api.complianceExpiring,staleTime:30000,retry:false})

    const generateMut=useMutation({mutationFn:api.generateComplianceDocs,onSuccess:()=>{queryClient.invalidateQueries({queryKey:['compliance']});queryClient.invalidateQueries({queryKey:['complianceDocs']});queryClient.invalidateQueries({queryKey:['complianceExpiring']})}})
    const reviewMut=useMutation({mutationFn:({id})=>api.reviewComplianceDoc(id,{status:'current',reviewed_at:new Date().toISOString()}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:['compliance']});queryClient.invalidateQueries({queryKey:['complianceDocs']});queryClient.invalidateQueries({queryKey:['complianceExpiring']})}})
    const updateStatusMut=useMutation({mutationFn:({id,status})=>api.updateComplianceDoc(id,{status}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:['compliance']});queryClient.invalidateQueries({queryKey:['complianceDocs']});queryClient.invalidateQueries({queryKey:['complianceExpiring']})}})
    const updateDocMut=useMutation({mutationFn:({id,...body})=>api.updateComplianceDoc(id,body),onSuccess:()=>{setEditDoc(null);queryClient.invalidateQueries({queryKey:['compliance']});queryClient.invalidateQueries({queryKey:['complianceDocs']});queryClient.invalidateQueries({queryKey:['complianceExpiring']})}})

    const comp=(compData&&typeof compData==='object'&&!Array.isArray(compData))?compData:{}
    const docs=Array.isArray(compDocs)?compDocs:Array.isArray(compDocs?.documents)?compDocs.documents:[]
    const expiring=Array.isArray(compExpiring)?compExpiring:Array.isArray(compExpiring?.documents)?compExpiring.documents:[]
    const categories=Array.isArray(comp.categories)?comp.categories:[]
    const urgent=Array.isArray(comp.urgent)?comp.urgent:[]

    const s=(comp.summary&&typeof comp.summary==='object')?comp.summary:{}
    const totalRequired=s.total_required||0
    const totalCurrent=s.current||s.total_current||0
    const totalMissing=s.missing||s.total_missing||0
    const totalExpired=s.expired||s.total_expired||0
    const totalExpiringSoon=s.expiring_soon||s.total_expiring_soon||0
    const totalReview=s.review||s.total_review||0

    const hasAlerts=(totalExpired>0||expiring.length>0)

    return(<>
      {/* Alert Banner */}
      {hasAlerts&&(
        <div style={{marginBottom:16,padding:'12px 18px',borderRadius:'var(--r-lg)',background:totalExpired>0?'rgba(220,38,38,0.08)':'rgba(217,119,6,0.08)',border:totalExpired>0?'1px solid rgba(220,38,38,0.2)':'1px solid rgba(217,119,6,0.2)'}}>
          <div style={{fontWeight:700,fontSize:'0.85rem',color:totalExpired>0?'#DC2626':'#D97706',marginBottom:4}}>
            {totalExpired>0?'⚠ '+totalExpired+' document'+(totalExpired!==1?'s':'')+' expired':''}
            {totalExpired>0&&expiring.length>0?' — ':''}
            {expiring.length>0?'⏰ '+expiring.length+' document'+(expiring.length!==1?'s':'')+' expiring within 30 days':''}
          </div>
          <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>Review and update these documents to maintain compliance.</div>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>Compliance Overview</div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          {kpi('Total Required',totalRequired)}
          {kpi('Current',totalCurrent,null,'#059669')}
          {kpi('Missing',totalMissing,null,totalMissing>0?'#DC2626':undefined)}
          {kpi('Expired',totalExpired,null,totalExpired>0?'#EA580C':undefined)}
          {kpi('Expiring Soon',totalExpiringSoon,null,totalExpiringSoon>0?'#D97706':undefined)}
          {kpi('Under Review',totalReview,null,totalReview>0?'#D97706':undefined)}
        </div>
      </div>

      {/* Category Progress */}
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:12}}>Category Progress</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {COMPLIANCE_CATEGORIES.map(catName=>{
            const catData=categories.find(c=>(c.name||c.category)===catName)||{name:catName,total:0,current:0}
            const total=catData.total||0
            const current=catData.current||0
            const pct=total>0?Math.round(current/total*100):0
            const barColor=pct===100?'#059669':pct>=50?'#D97706':'#DC2626'
            return(
              <div key={catName} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'12px 16px'}}>
                <div style={{fontSize:'0.78rem',fontWeight:700,marginBottom:6}}>{catName}</div>
                <div style={{height:6,borderRadius:3,background:'var(--border)',overflow:'hidden',marginBottom:4}}>
                  <div style={{height:'100%',borderRadius:3,width:pct+'%',background:barColor,transition:'width 0.4s'}}/>
                </div>
                <div style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>{current} / {total} compliant ({pct}%)</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions + Filters */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'0.6rem',letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-muted)'}}>Document Register</div>
        <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
          <select value={docCatFilter} onChange={e=>setDocCatFilter(e.target.value)} style={{fontSize:'0.78rem',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-1)'}}>
            <option value="">All Categories</option>
            {COMPLIANCE_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select value={docStatusFilter} onChange={e=>setDocStatusFilter(e.target.value)} style={{fontSize:'0.78rem',padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-1)'}}>
            <option value="">All Statuses</option>
            {['current','missing','expired','draft','review','uploaded'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={()=>generateMut.mutate()} disabled={generateMut.isPending} style={{fontWeight:700}}>
            {generateMut.isPending?'⏳ Generating…':'⚡ Generate All'}
          </button>
        </div>
      </div>

      {/* Document Table */}
      {compLoading?<Spinner/>:(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Document Name','Category','Subcategory','Status','Required','Expiry Date','Last Reviewed','Actions'].map(h=><th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)'}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {docs.length===0?(
                <tr><td colSpan={8} style={{padding:'32px 14px',textAlign:'center',color:'var(--text-muted)',fontSize:'0.85rem'}}>No documents found. Click "Generate All" to create document entries from compliance categories.</td></tr>
              ):docs.map(doc=>{
                const sc=STATUS_COLORS[doc.status]||{bg:'var(--bg-raised)',color:'var(--text-muted)'}
                return(
                  <tr key={doc.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'10px 14px',fontWeight:600,fontSize:'0.82rem'}}>{doc.name||doc.document_name||'—'}</td>
                    <td style={{padding:'10px 14px',fontSize:'0.78rem',color:'var(--text-muted)'}}>{doc.category||'—'}</td>
                    <td style={{padding:'10px 14px',fontSize:'0.78rem',color:'var(--text-muted)'}}>{doc.subcategory||'—'}</td>
                    <td style={{padding:'10px 14px'}}>{pill(sc.bg,sc.color,doc.status||'unknown')}</td>
                    <td style={{padding:'10px 14px',fontSize:'0.78rem'}}>{doc.required?'Yes':'No'}</td>
                    <td style={{padding:'10px 14px',fontSize:'0.78rem',color:doc.expiry_date&&new Date(doc.expiry_date)<new Date()?'#DC2626':'var(--text-muted)'}}>{doc.expiry_date?formatDate(doc.expiry_date):'—'}</td>
                    <td style={{padding:'10px 14px',fontSize:'0.78rem',color:'var(--text-muted)'}}>{doc.reviewed_at?formatDate(doc.reviewed_at):'Never'}</td>
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:4,alignItems:'center'}}>
                        <button className="btn btn-ghost btn-sm" style={{fontSize:'0.7rem',padding:'2px 8px'}} onClick={()=>reviewMut.mutate({id:doc.id})} disabled={reviewMut.isPending} title="Mark as reviewed & current">✓ Review</button>
                        <select value="" onChange={e=>{if(e.target.value)updateStatusMut.mutate({id:doc.id,status:e.target.value})}} style={{fontSize:'0.7rem',padding:'2px 6px',borderRadius:4,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-1)',cursor:'pointer'}} title="Change status">
                          <option value="">Status</option>
                          {['current','missing','expired','draft','review','uploaded'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-sm" style={{fontSize:'0.7rem',padding:'2px 8px'}} onClick={()=>{setEditDoc(doc);setEditForm({name:doc.name||doc.document_name||'',category:doc.category||'',subcategory:doc.subcategory||'',status:doc.status||'draft',required:doc.required??true,expiry_date:doc.expiry_date||'',notes:doc.notes||''})}} title="Edit document details">✎</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editDoc&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}} onClick={()=>setEditDoc(null)}>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'28px 32px',width:520,maxHeight:'80vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:'1.1rem',marginBottom:20}}>Edit Document</div>
            <div style={{display:'grid',gap:14}}>
              <div>
                <label style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:4}}>Document Name</label>
                <input value={editForm.name||''} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-raised)',color:'var(--text-1)',fontSize:'0.85rem'}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:4}}>Category</label>
                  <select value={editForm.category||''} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))} style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-raised)',color:'var(--text-1)',fontSize:'0.85rem'}}>
                    <option value="">Select...</option>
                    {COMPLIANCE_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:4}}>Subcategory</label>
                  <input value={editForm.subcategory||''} onChange={e=>setEditForm(f=>({...f,subcategory:e.target.value}))} style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-raised)',color:'var(--text-1)',fontSize:'0.85rem'}}/>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:4}}>Status</label>
                  <select value={editForm.status||''} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))} style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-raised)',color:'var(--text-1)',fontSize:'0.85rem'}}>
                    {['current','missing','expired','draft','review','uploaded'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:4}}>Expiry Date</label>
                  <input type="date" value={editForm.expiry_date||''} onChange={e=>setEditForm(f=>({...f,expiry_date:e.target.value}))} style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-raised)',color:'var(--text-1)',fontSize:'0.85rem'}}/>
                </div>
              </div>
              <div>
                <label style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:4}}>Required</label>
                <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:'0.85rem'}}>
                  <input type="checkbox" checked={editForm.required??true} onChange={e=>setEditForm(f=>({...f,required:e.target.checked}))}/>
                  This document is required for compliance
                </label>
              </div>
              <div>
                <label style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:4}}>Notes</label>
                <textarea value={editForm.notes||''} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))} rows={3} style={{width:'100%',padding:'8px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-raised)',color:'var(--text-1)',fontSize:'0.85rem',resize:'vertical'}}/>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:20}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setEditDoc(null)}>Cancel</button>
              <button className="btn btn-ghost btn-sm" style={{background:'var(--teal)',color:'#fff',fontWeight:700}} onClick={()=>updateDocMut.mutate({id:editDoc.id,...editForm})} disabled={updateDocMut.isPending}>
                {updateDocMut.isPending?'Saving…':'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>)
  }

  return(
    <div style={{padding:'28px 32px',maxWidth:1200,margin:'0 auto',height:'100%',overflowY:'auto'}}>
      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-0.02em',margin:0}}>Admin Centre</h1>
        <p style={{fontSize:'0.85rem',color:'var(--text-muted)',marginTop:4}}>System health, data connectors, enrichment pipeline, CRM sync & email protection</p>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:4,marginBottom:24,borderBottom:'1px solid var(--border)',paddingBottom:0}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'10px 18px',fontSize:'0.82rem',fontWeight:tab===t.id?700:500,
            color:tab===t.id?'var(--teal)':'var(--text-muted)',
            background:'none',border:'none',borderBottom:tab===t.id?'2px solid var(--teal)':'2px solid transparent',
            cursor:'pointer',display:'flex',alignItems:'center',gap:6,marginBottom:-1,transition:'all 0.15s'
          }}><span style={{fontSize:'0.85rem'}}>{t.icon}</span>{t.label}</button>
        ))}
      </div>

      {isLoading&&tab==='overview'?<div style={{textAlign:'center',padding:60}}><Spinner/></div>:(
        tab==='overview'?renderOverview():
        tab==='connectors'?renderConnectors():
        tab==='enrichment'?renderEnrichment():
        tab==='crm'?renderCRM():
        tab==='email'?renderEmailGuard():
        tab==='documents'?renderDocuments():null
      )}
    </div>
  )
}
