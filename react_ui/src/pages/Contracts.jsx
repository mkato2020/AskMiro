import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api} from '../api'

const fmtCur=v=>'£'+Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0})
const STATUS_COLORS={active:'#10b981',ended:'#6b7280',expiring:'#f59e0b',pending:'#3b82f6'}

export default function Contracts({openLead}){
  const {data:contractsRaw,isLoading}=useQuery({queryKey:['contracts'],queryFn:api.contracts})
  const contracts=Array.isArray(contractsRaw)?contractsRaw:(contractsRaw?.contracts||[])
  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')

  const now=new Date()
  const soon=new Date(now.getTime()+30*86400000)
  const enriched=contracts.map(c=>{
    const end=c.end_date?new Date(c.end_date):null
    const status=c.status||(end&&end<now?'ended':end&&end<soon?'expiring':'active')
    return{...c,_status:status}
  })

  const stats={
    active:enriched.filter(c=>c._status==='active').length,
    revenue:enriched.filter(c=>c._status==='active').reduce((s,c)=>s+(c.monthly_value||0),0),
    avgMargin:enriched.filter(c=>c._status==='active'&&c.margin).length>0
      ?enriched.filter(c=>c._status==='active'&&c.margin).reduce((s,c)=>s+c.margin,0)/enriched.filter(c=>c._status==='active'&&c.margin).length:0,
    expiring:enriched.filter(c=>c._status==='expiring').length,
  }

  const filtered=enriched
    .filter(c=>filter==='all'||c._status===filter)
    .filter(c=>!search||[c.site_name,c.client,c.segment].some(v=>(v||'').toLowerCase().includes(search.toLowerCase())))

  return(
    <div style={{padding:'28px 36px',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{background:'var(--teal)',color:'white',fontSize:'0.65rem',fontWeight:700,padding:'3px 10px',borderRadius:4,textTransform:'uppercase'}}>Contracts</span>
          <h1 style={{fontSize:'1.35rem',fontWeight:800,color:'var(--text-1)',margin:0}}>Contract Management</h1>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        <KPI label="Active Contracts" value={stats.active} color="var(--teal)"/>
        <KPI label="Monthly Revenue" value={fmtCur(stats.revenue)} color="#10b981"/>
        <KPI label="Avg Margin" value={stats.avgMargin.toFixed(1)+'%'} color="#3b82f6"/>
        <KPI label="Expiring Soon" value={stats.expiring} color={stats.expiring>0?'#f59e0b':'var(--text-muted)'}/>
      </div>

      {/* Filters */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{display:'flex',gap:6}}>
          {[['all','All'],['active','Active'],['ended','Ended'],['expiring','Expiring']].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{padding:'6px 16px',borderRadius:20,border:filter===k?'none':'1px solid var(--border)',background:filter===k?'var(--teal)':'transparent',color:filter===k?'white':'var(--text-muted)',fontSize:'0.78rem',fontWeight:600,cursor:'pointer'}}>
              {l}
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contracts..." style={{padding:'8px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',background:'var(--bg-base)',color:'var(--text-1)',fontSize:'0.82rem',width:260}}/>
      </div>

      {/* Table */}
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
        {isLoading?(
          <div style={{textAlign:'center',padding:60,color:'var(--text-muted)'}}>Loading contracts...</div>
        ):filtered.length===0?(
          <div style={{textAlign:'center',padding:60}}>
            <div style={{fontSize:'2rem',marginBottom:8}}>📋</div>
            <div style={{fontSize:'0.95rem',fontWeight:600,color:'var(--text-1)'}}>No contracts {filter!=='all'?`with status "${filter}"`:'yet'}</div>
            <div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:6}}>Contracts are created when quotes are won and signed.</div>
          </div>
        ):(
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
            <thead>
              <tr style={{borderBottom:'2px solid var(--border)'}}>
                {['Site','Client','Segment','Monthly Value','Start','End','Status','Margin'].map(h=>(
                  <th key={h} style={{padding:'12px 14px',textAlign:'left',fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c,i)=>(
                <tr key={c.id||i} onClick={()=>c.entity_id&&openLead(c.entity_id)} style={{borderBottom:'1px solid var(--border)',cursor:c.entity_id?'pointer':'default',transition:'background 0.1s'}}
                  onMouseOver={e=>e.currentTarget.style.background='var(--bg-base)'}
                  onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'12px 14px',fontWeight:600,color:'var(--text-1)'}}>{c.site_name||c.name||'—'}</td>
                  <td style={{padding:'12px 14px',color:'var(--text-muted)'}}>{c.client||'—'}</td>
                  <td style={{padding:'12px 14px'}}>{c.segment&&<span style={{padding:'2px 8px',borderRadius:4,fontSize:'0.7rem',fontWeight:600,background:'var(--teal)18',color:'var(--teal)'}}>{c.segment}</span>}</td>
                  <td style={{padding:'12px 14px',fontWeight:600,color:'var(--text-1)'}}>{fmtCur(c.monthly_value||0)}/mo</td>
                  <td style={{padding:'12px 14px',color:'var(--text-muted)',fontSize:'0.78rem'}}>{c.start_date?new Date(c.start_date).toLocaleDateString():'—'}</td>
                  <td style={{padding:'12px 14px',color:'var(--text-muted)',fontSize:'0.78rem'}}>{c.end_date?new Date(c.end_date).toLocaleDateString():'-'}</td>
                  <td style={{padding:'12px 14px'}}>
                    <span style={{padding:'3px 10px',borderRadius:12,fontSize:'0.72rem',fontWeight:600,color:STATUS_COLORS[c._status]||'#6b7280',background:(STATUS_COLORS[c._status]||'#6b7280')+'18'}}>{c._status}</span>
                  </td>
                  <td style={{padding:'12px 14px',fontWeight:600,color:c.margin>20?'#10b981':c.margin>0?'#f59e0b':'var(--text-muted)'}}>{c.margin?c.margin.toFixed(1)+'%':'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
