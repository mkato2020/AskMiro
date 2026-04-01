import {useState,useCallback,useMemo} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {formatDate} from '../utils'
import Spinner from '../components/Spinner'

/* ── colour palettes ── */
const AVATAR_COLORS=['#0DBDAD','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#ec4899','#14b8a6','#6366f1']
const STATUS_PILL={Active:{bg:'#ECFDF5',color:'#059669'},Inactive:{bg:'#FFFBEB',color:'#D97706'},Archived:{bg:'#F1F5F9',color:'#64748B'},Trial:{bg:'#F5F3FF',color:'#7C3AED'}}
const COMPLIANCE_PILL={Ready:{bg:'#ECFDF5',color:'#059669',icon:'\u2713'},Pending:{bg:'#FFFBEB',color:'#D97706',icon:'\u23F3'},Expiring:{bg:'#FEF2F2',color:'#DC2626',icon:'\u26A0'},Blocked:{bg:'#FEF2F2',color:'#DC2626',icon:'\u2715'}}
const DBS_PILL={Enhanced:{bg:'#F0FDFA',color:'#0D9488',icon:'\uD83D\uDD12'},Basic:{bg:'#ECFDF5',color:'#059669',icon:'\uD83D\uDD10'},None:{bg:'#F1F5F9',color:'#64748B',icon:''},Expired:{bg:'#FEF2F2',color:'#DC2626',icon:'\u26A0'}}
const TRANSPORT_ICON={Car:'\uD83D\uDE97',Van:'\uD83D\uDE90','Public Transport':'\uD83D\uDE87',Bicycle:'\uD83D\uDEB2'}

const TYPE_OPTIONS=['Employee','Subcontractor','Agency','Trial']
const STATUS_OPTIONS=['Active','Inactive','Archived','Trial']
const AVAILABILITY_OPTIONS=['Full-time','Part-time','Ad-hoc','Weekends','Evenings','Nights']
const COMPLIANCE_OPTIONS=['Ready','Pending','Expiring','Blocked']
const DBS_OPTIONS=['Enhanced','Basic','None','Expired']
const TRANSPORT_OPTIONS=['Car','Van','Public Transport','Bicycle']

/* ── helpers ── */
function nameHash(name){let h=0;for(let i=0;i<(name||'').length;i++)h=((h<<5)-h)+(name.charCodeAt(i)|0);return Math.abs(h)}
function initials(name){const p=(name||'').trim().split(/\s+/);return p.length>=2?(p[0][0]+p[p.length-1][0]).toUpperCase():(p[0]||'?')[0].toUpperCase()}
function avatarColor(name){return AVATAR_COLORS[nameHash(name)%AVATAR_COLORS.length]}
function deployBadge(c){if(c.compliance_status==='Ready'&&c.currently_available==='Yes')return{label:'\u2713 Ready',bg:'#ECFDF5',color:'#059669'};if(c.compliance_status==='Pending'||c.compliance_status==='Expiring')return{label:'\u23F3 Pending',bg:'#FFFBEB',color:'#D97706'};return{label:'\u2014 Hold',bg:'#F1F5F9',color:'#64748B'}}

const pill=(bg,color,text,extra)=>({display:'inline-flex',alignItems:'center',gap:4,background:bg,color,fontSize:'0.7rem',fontWeight:700,padding:'3px 10px',borderRadius:20,whiteSpace:'nowrap',...(extra||{})})
const actionBtn={background:'none',border:'none',fontSize:'0.95rem',cursor:'pointer',padding:'4px 2px',borderRadius:4,lineHeight:1}

/* ── KPI card ── */
const KPI=({label,value,sub,color})=>(
  <div style={{flex:'1 1 130px',minWidth:120,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'16px 18px'}}>
    <div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{label}</div>
    <div style={{fontSize:'1.35rem',fontWeight:800,color:color||'var(--text-1)',letterSpacing:'-.02em'}}>{value}</div>
    {sub&&<div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:4}}>{sub}</div>}
  </div>
)

/* ── Select dropdown component ── */
const Select=({value,onChange,options,label})=>(
  <select value={value} onChange={e=>onChange(e.target.value)} title={label} style={{
    padding:'6px 12px',fontSize:'0.75rem',fontWeight:600,background:'var(--bg-surface)',color:'var(--text-2)',
    border:'1px solid var(--border)',borderRadius:20,cursor:'pointer',outline:'none',appearance:'auto',minWidth:0
  }}>
    {options.map(o=>typeof o==='string'?<option key={o} value={o}>{o}</option>:<option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
)

/* ── Form field helper ── */
const Field=({label,required,children})=>(
  <div style={{marginBottom:14}}>
    <label style={{display:'block',fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>
      {label}{required&&<span style={{color:'#DC2626'}}> *</span>}
    </label>
    {children}
  </div>
)

const inputStyle={width:'100%',padding:'9px 12px',fontSize:'0.85rem',background:'var(--bg-base)',color:'var(--text-1)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box'}
const toggleStyle=(on)=>({width:40,height:22,borderRadius:11,background:on?'var(--teal)':'var(--border)',position:'relative',cursor:'pointer',border:'none',transition:'background 0.2s',flexShrink:0})
const toggleDot=(on)=>({width:16,height:16,borderRadius:8,background:'#fff',position:'absolute',top:3,left:on?21:3,transition:'left 0.2s'})

const EMPTY_FORM={full_name:'',email:'',phone:'',home_postcode:'',borough:'',cleaner_type:'Employee',status:'Active',hourly_rate:'',performance_rating:'',availability_type:'Full-time',currently_available:'Yes',emergency_cover:'No',transport_mode:'Public Transport',has_own_vehicle:'No',services_offered:'',compliance_status:'Ready',dbs_status:'Enhanced',notes:''}

/* ── Overlay backdrop ── */
const Overlay=({show,onClose,children})=>{
  if(!show)return null
  return(
    <div style={{position:'fixed',inset:0,zIndex:9998,display:'flex',justifyContent:'flex-end'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(2px)'}}/>
      <div style={{position:'relative',zIndex:9999,width:520,maxWidth:'90vw',height:'100vh',background:'var(--bg-surface)',borderLeft:'1px solid var(--border)',overflowY:'auto',boxShadow:'-8px 0 30px rgba(0,0,0,0.3)',animation:'slideIn 0.25s ease-out'}}>
        {children}
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </div>
  )
}

/* ── Section header inside drawer ── */
const Section=({title})=>(
  <div style={{fontSize:'0.72rem',fontWeight:800,color:'var(--teal)',textTransform:'uppercase',letterSpacing:'0.08em',marginTop:20,marginBottom:10,paddingBottom:6,borderBottom:'1px solid var(--border)'}}>{title}</div>
)

/* ════════════════ MAIN COMPONENT ════════════════ */
export default function Cleaners(){
  const qc=useQueryClient()
  const {data,isLoading}=useQuery({queryKey:['cleaners'],queryFn:api.cleaners,staleTime:60000})

  /* ── state ── */
  const [search,setSearch]=useState('')
  const [fStatus,setFStatus]=useState('All')
  const [fType,setFType]=useState('All')
  const [fArea,setFArea]=useState('All')
  const [fCompliance,setFCompliance]=useState('All')
  const [fDBS,setFDBS]=useState('All')
  const [fTransport,setFTransport]=useState('All')

  const [drawer,setDrawer]=useState(null)       // null | 'add' | 'edit' | 'view'
  const [selected,setSelected]=useState(null)    // cleaner object for edit/view
  const [form,setForm]=useState({...EMPTY_FORM})

  /* ── mutations ── */
  const invalidate=()=>qc.invalidateQueries({queryKey:['cleaners']})
  const createMut=useMutation({mutationFn:body=>api.createCleaner(body),onSuccess:invalidate})
  const updateMut=useMutation({mutationFn:({id,body})=>api.updateCleaner(id,body),onSuccess:invalidate})
  const archiveMut=useMutation({mutationFn:id=>api.archiveCleaner(id),onSuccess:invalidate})
  const toggleMut=useMutation({mutationFn:id=>api.toggleCleanerAvailable(id),onSuccess:invalidate})

  /* ── derived data ── */
  const raw=data||{}
  const all=raw.cleaners||[]
  const boroughs=useMemo(()=>[...new Set(all.map(c=>c.borough).filter(Boolean))].sort(),[all])

  const filtered=useMemo(()=>all.filter(c=>{
    if(fStatus!=='All'&&c.status!==fStatus)return false
    if(fType!=='All'&&c.cleaner_type!==fType)return false
    if(fArea!=='All'&&c.borough!==fArea)return false
    if(fCompliance!=='All'&&c.compliance_status!==fCompliance)return false
    if(fDBS!=='All'&&c.dbs_status!==fDBS)return false
    if(fTransport!=='All'&&c.transport_mode!==fTransport)return false
    if(!search)return true
    const q=search.toLowerCase()
    return [c.full_name,c.phone,c.home_postcode,c.borough].some(v=>(v||'').toLowerCase().includes(q))
  }),[all,search,fStatus,fType,fArea,fCompliance,fDBS,fTransport])

  /* ── drawer helpers ── */
  const openAdd=useCallback(()=>{setForm({...EMPTY_FORM});setSelected(null);setDrawer('add')},[])
  const openEdit=useCallback(c=>{setForm({full_name:c.full_name||'',email:c.email||'',phone:c.phone||'',home_postcode:c.home_postcode||'',borough:c.borough||'',cleaner_type:c.cleaner_type||'Employee',status:c.status||'Active',hourly_rate:c.hourly_rate||'',performance_rating:c.performance_rating||'',availability_type:c.availability_type||'Full-time',currently_available:c.currently_available||'Yes',emergency_cover:c.emergency_cover||'No',transport_mode:c.transport_mode||'Public Transport',has_own_vehicle:c.has_own_vehicle||'No',services_offered:c.services_offered||'',compliance_status:c.compliance_status||'Ready',dbs_status:c.dbs_status||'Enhanced',notes:c.notes||''});setSelected(c);setDrawer('edit')},[])
  const openView=useCallback(c=>{setSelected(c);setDrawer('view')},[])
  const closeDrawer=useCallback(()=>{setDrawer(null);setSelected(null)},[])

  const setField=useCallback((k,v)=>setForm(f=>({...f,[k]:v})),[])

  const handleSubmit=useCallback(()=>{
    if(!form.full_name||!form.email||!form.cleaner_type)return
    const body={...form,hourly_rate:form.hourly_rate?Number(form.hourly_rate):null,performance_rating:form.performance_rating?Number(form.performance_rating):null}
    if(drawer==='edit'&&selected){
      updateMut.mutate({id:selected.id,body},{ onSuccess:closeDrawer })
    }else{
      createMut.mutate(body,{ onSuccess:closeDrawer })
    }
  },[form,drawer,selected,updateMut,createMut,closeDrawer])

  /* ── render ── */
  const total=raw.total||all.length
  const active=raw.active||all.filter(c=>c.status==='Active').length

  return(
    <div style={{padding:'28px 32px',maxWidth:1320,margin:'0 auto'}}>
      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-.02em',margin:0}}>Cleaners</h1>
          <p style={{fontSize:'0.875rem',color:'var(--text-3)',marginTop:4}}>Workforce database, compliance & availability</p>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div style={{display:'flex',gap:14,marginBottom:24,flexWrap:'wrap'}}>
        <KPI label="Total Cleaners" value={total} sub={`${active} active`}/>
        <KPI label="Active" value={active} sub={total?Math.round(active/total*100)+'% of roster':'—'} color="var(--teal)"/>
        <KPI label="Available Today" value={raw.available_today||0}/>
        <KPI label="Emergency Cover" value={raw.emergency_cover||0} color={(raw.emergency_cover||0)>0?'#059669':'var(--text-1)'}/>
        <KPI label="Compliance Ready" value={raw.compliance_ready||0}/>
        <KPI label="DBS Checked" value={raw.dbs_checked||0}/>
        <KPI label="Own Vehicle" value={raw.own_vehicle||0}/>
      </div>

      {/* ── Toolbar ── */}
      <div style={{display:'flex',gap:10,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
        <input className="form-input" placeholder="Search name, phone, postcode, area\u2026" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:320,flex:'1 1 200px'}}/>
        <Select value={fStatus} onChange={setFStatus} label="Status" options={['All',...STATUS_OPTIONS]}/>
        <Select value={fType} onChange={setFType} label="Type" options={['All',...TYPE_OPTIONS]}/>
        <Select value={fArea} onChange={setFArea} label="Area" options={['All',...boroughs]}/>
        <Select value={fCompliance} onChange={setFCompliance} label="Compliance" options={['All',...COMPLIANCE_OPTIONS]}/>
        <Select value={fDBS} onChange={setFDBS} label="DBS" options={['All',...DBS_OPTIONS]}/>
        <Select value={fTransport} onChange={setFTransport} label="Transport" options={['All',...TRANSPORT_OPTIONS]}/>
        <button onClick={openAdd} style={{padding:'8px 20px',fontSize:'0.8rem',fontWeight:700,color:'#fff',background:'linear-gradient(135deg,#0DBDAD,#0A9688)',border:'none',borderRadius:8,cursor:'pointer',whiteSpace:'nowrap',marginLeft:'auto'}}>+ Add Cleaner</button>
      </div>

      {/* ── Loading ── */}
      {isLoading&&<div style={{textAlign:'center',padding:60}}><Spinner/></div>}

      {/* ── Empty state ── */}
      {!isLoading&&filtered.length===0&&(
        <div style={{padding:60,textAlign:'center',color:'var(--text-muted)'}}>
          {search||fStatus!=='All'||fType!=='All'||fArea!=='All'||fCompliance!=='All'||fDBS!=='All'||fTransport!=='All'?'No cleaners match your filters.':'No cleaners added yet.'}
        </div>
      )}

      {/* ── Table ── */}
      {!isLoading&&filtered.length>0&&(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:1100}}>
            <thead>
              <tr style={{borderBottom:'2px solid var(--border)'}}>
                {['Name','Type','Area','Services','Avail','Compliance','DBS','Transport','Rate','Status','Actions'].map(h=>(
                  <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c,i)=>{
                const st=STATUS_PILL[c.status]||STATUS_PILL.Active
                const co=COMPLIANCE_PILL[c.compliance_status]||COMPLIANCE_PILL.Ready
                const db=DBS_PILL[c.dbs_status]||DBS_PILL.None
                const svcs=(c.services_offered||'').split('|').filter(Boolean)
                const avail=c.currently_available==='Yes'
                return(
                  <tr key={c.id||i} style={{borderBottom:'1px solid var(--border)'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-raised)'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    {/* Name + avatar */}
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:34,height:34,borderRadius:'50%',background:avatarColor(c.full_name),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:800,color:'#fff',flexShrink:0}}>
                          {initials(c.full_name)}
                        </div>
                        <div>
                          <div style={{fontWeight:700,fontSize:'0.85rem',lineHeight:1.2}}>{c.full_name||'\u2014'}</div>
                          <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:2}}>
                            {c.phone&&<span>{c.phone}</span>}
                            {c.phone&&c.email&&<span> &middot; </span>}
                            {c.email&&<span>{c.email}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Type */}
                    <td style={{padding:'10px 14px'}}>
                      <span style={pill('var(--bg-base)','var(--text-2)',c.cleaner_type,{border:'1px solid var(--border)'})}>{c.cleaner_type||'\u2014'}</span>
                    </td>
                    {/* Area */}
                    <td style={{padding:'10px 14px'}}>
                      <div style={{fontSize:'0.82rem',fontWeight:600}}>{c.borough||'\u2014'}</div>
                      {c.home_postcode&&<div style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{c.home_postcode}</div>}
                    </td>
                    {/* Services */}
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        {svcs.slice(0,3).map(s=><span key={s} style={pill('rgba(13,189,173,0.1)','var(--teal)',s)}>{s}</span>)}
                        {svcs.length>3&&<span style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>+{svcs.length-3}</span>}
                      </div>
                    </td>
                    {/* Availability dot */}
                    <td style={{padding:'10px 14px',textAlign:'center'}}>
                      <span style={{display:'inline-block',width:10,height:10,borderRadius:'50%',background:avail?'#059669':'#DC2626',boxShadow:avail?'0 0 6px rgba(5,150,105,0.4)':'none'}} title={avail?'Available':'Unavailable'}/>
                    </td>
                    {/* Compliance */}
                    <td style={{padding:'10px 14px'}}>
                      <span style={pill(co.bg,co.color)}>{co.icon} {c.compliance_status||'Ready'}</span>
                    </td>
                    {/* DBS */}
                    <td style={{padding:'10px 14px'}}>
                      <span style={pill(db.bg,db.color)}>{db.icon&&(db.icon+' ')}{c.dbs_status||'None'}</span>
                    </td>
                    {/* Transport */}
                    <td style={{padding:'10px 14px',fontSize:'1.1rem',textAlign:'center'}}>
                      {TRANSPORT_ICON[c.transport_mode]||'\u2014'}
                    </td>
                    {/* Rate */}
                    <td style={{padding:'10px 14px',fontWeight:700,fontSize:'0.85rem',whiteSpace:'nowrap'}}>
                      {c.hourly_rate?'\u00A3'+Number(c.hourly_rate).toFixed(2)+'/hr':'\u2014'}
                    </td>
                    {/* Status */}
                    <td style={{padding:'10px 14px'}}>
                      <span style={pill(st.bg,st.color)}>{c.status||'Active'}</span>
                    </td>
                    {/* Actions */}
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>openView(c)} title="View" style={actionBtn}>{'\uD83D\uDC41'}</button>
                        <button onClick={()=>openEdit(c)} title="Edit" style={actionBtn}>{'\u270F\uFE0F'}</button>
                        <button onClick={()=>toggleMut.mutate(c.id)} title="Toggle Available" style={actionBtn}>{'\u26A1'}</button>
                        <button onClick={()=>{if(window.confirm('Archive '+c.full_name+'?'))archiveMut.mutate(c.id)}} title="Archive" style={actionBtn}>{'\uD83D\uDCE6'}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Results count ── */}
      {!isLoading&&filtered.length>0&&(
        <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:12,textAlign:'right'}}>
          Showing {filtered.length} of {all.length} cleaners
        </div>
      )}

      {/* ════════ ADD / EDIT DRAWER ════════ */}
      <Overlay show={drawer==='add'||drawer==='edit'} onClose={closeDrawer}>
        <div style={{padding:'28px 28px 40px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h2 style={{margin:0,fontSize:'1.15rem',fontWeight:800}}>{drawer==='edit'?'Edit Cleaner':'Add Cleaner'}</h2>
            <button onClick={closeDrawer} style={{background:'none',border:'none',fontSize:'1.3rem',cursor:'pointer',color:'var(--text-muted)',padding:4}}>&times;</button>
          </div>

          {/* Personal */}
          <Section title="Personal Details"/>
          <Field label="Full Name" required>
            <input style={inputStyle} value={form.full_name} onChange={e=>setField('full_name',e.target.value)} placeholder="Jane Smith"/>
          </Field>
          <Field label="Email" required>
            <input style={inputStyle} type="email" value={form.email} onChange={e=>setField('email',e.target.value)} placeholder="jane@example.com"/>
          </Field>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Field label="Phone">
              <input style={inputStyle} value={form.phone} onChange={e=>setField('phone',e.target.value)} placeholder="07700 900000"/>
            </Field>
            <Field label="Home Postcode">
              <input style={inputStyle} value={form.home_postcode} onChange={e=>setField('home_postcode',e.target.value)} placeholder="SW1A 1AA"/>
            </Field>
          </div>
          <Field label="Borough">
            <input style={inputStyle} value={form.borough} onChange={e=>setField('borough',e.target.value)} placeholder="Westminster"/>
          </Field>

          {/* Employment */}
          <Section title="Employment"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Field label="Cleaner Type" required>
              <select style={inputStyle} value={form.cleaner_type} onChange={e=>setField('cleaner_type',e.target.value)}>
                {TYPE_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select style={inputStyle} value={form.status} onChange={e=>setField('status',e.target.value)}>
                {STATUS_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Field label="Hourly Rate (\u00A3)">
              <input style={inputStyle} type="number" step="0.01" value={form.hourly_rate} onChange={e=>setField('hourly_rate',e.target.value)} placeholder="12.50"/>
            </Field>
            <Field label="Performance Rating">
              <input style={inputStyle} type="number" step="0.1" min="0" max="5" value={form.performance_rating} onChange={e=>setField('performance_rating',e.target.value)} placeholder="4.2"/>
            </Field>
          </div>

          {/* Availability */}
          <Section title="Availability"/>
          <Field label="Availability Type">
            <select style={inputStyle} value={form.availability_type} onChange={e=>setField('availability_type',e.target.value)}>
              {AVAILABILITY_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <div style={{display:'flex',gap:32,marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:'0.8rem',color:'var(--text-2)'}}>Currently Available</span>
              <button type="button" onClick={()=>setField('currently_available',form.currently_available==='Yes'?'No':'Yes')} style={toggleStyle(form.currently_available==='Yes')}>
                <div style={toggleDot(form.currently_available==='Yes')}/>
              </button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:'0.8rem',color:'var(--text-2)'}}>Emergency Cover</span>
              <button type="button" onClick={()=>setField('emergency_cover',form.emergency_cover==='Yes'?'No':'Yes')} style={toggleStyle(form.emergency_cover==='Yes')}>
                <div style={toggleDot(form.emergency_cover==='Yes')}/>
              </button>
            </div>
          </div>

          {/* Transport */}
          <Section title="Transport"/>
          <Field label="Transport Mode">
            <select style={inputStyle} value={form.transport_mode} onChange={e=>setField('transport_mode',e.target.value)}>
              {TRANSPORT_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
            <span style={{fontSize:'0.8rem',color:'var(--text-2)'}}>Has Own Vehicle</span>
            <button type="button" onClick={()=>setField('has_own_vehicle',form.has_own_vehicle==='Yes'?'No':'Yes')} style={toggleStyle(form.has_own_vehicle==='Yes')}>
              <div style={toggleDot(form.has_own_vehicle==='Yes')}/>
            </button>
          </div>

          {/* Services */}
          <Section title="Services"/>
          <Field label="Services Offered (pipe-separated)">
            <input style={inputStyle} value={form.services_offered} onChange={e=>setField('services_offered',e.target.value)} placeholder="Commercial|Residential|Deep Clean"/>
          </Field>

          {/* Compliance */}
          <Section title="Compliance"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Field label="Compliance Status">
              <select style={inputStyle} value={form.compliance_status} onChange={e=>setField('compliance_status',e.target.value)}>
                {COMPLIANCE_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="DBS Status">
              <select style={inputStyle} value={form.dbs_status} onChange={e=>setField('dbs_status',e.target.value)}>
                {DBS_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>

          {/* Notes */}
          <Section title="Notes"/>
          <Field label="Notes">
            <textarea style={{...inputStyle,minHeight:80,resize:'vertical'}} value={form.notes} onChange={e=>setField('notes',e.target.value)} placeholder="Any additional notes\u2026"/>
          </Field>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={createMut.isPending||updateMut.isPending} style={{
            width:'100%',padding:'12px 0',fontSize:'0.9rem',fontWeight:700,color:'#fff',
            background:'linear-gradient(135deg,#0DBDAD,#0A9688)',border:'none',borderRadius:8,cursor:'pointer',
            marginTop:10,opacity:(createMut.isPending||updateMut.isPending)?0.6:1
          }}>
            {(createMut.isPending||updateMut.isPending)?'Saving\u2026':drawer==='edit'?'Save Changes':'Add Cleaner'}
          </button>

          {(createMut.isError||updateMut.isError)&&(
            <div style={{color:'#DC2626',fontSize:'0.8rem',marginTop:10,textAlign:'center'}}>
              {(createMut.error||updateMut.error)?.message||'Something went wrong.'}
            </div>
          )}
        </div>
      </Overlay>

      {/* ════════ VIEW DRAWER ════════ */}
      <Overlay show={drawer==='view'} onClose={closeDrawer}>
        {selected&&(
          <div style={{padding:'28px 28px 40px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <h2 style={{margin:0,fontSize:'1.15rem',fontWeight:800}}>Cleaner Profile</h2>
              <button onClick={closeDrawer} style={{background:'none',border:'none',fontSize:'1.3rem',cursor:'pointer',color:'var(--text-muted)',padding:4}}>&times;</button>
            </div>

            {/* Profile header */}
            <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
              <div style={{width:56,height:56,borderRadius:'50%',background:avatarColor(selected.full_name),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem',fontWeight:800,color:'#fff'}}>
                {initials(selected.full_name)}
              </div>
              <div>
                <div style={{fontWeight:800,fontSize:'1.1rem'}}>{selected.full_name}</div>
                <div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:2}}>{selected.cleaner_type} &middot; {selected.status}</div>
                {(()=>{const d=deployBadge(selected);return <span style={pill(d.bg,d.color,'',{marginTop:6})}>{d.label}</span>})()}
              </div>
            </div>

            {/* Personal */}
            <Section title="Personal Details"/>
            <ViewRow label="Email" value={selected.email}/>
            <ViewRow label="Phone" value={selected.phone}/>
            <ViewRow label="Home Postcode" value={selected.home_postcode}/>
            <ViewRow label="Borough" value={selected.borough}/>

            {/* Employment */}
            <Section title="Employment"/>
            <ViewRow label="Type" value={selected.cleaner_type}/>
            <ViewRow label="Status" value={selected.status} pill={STATUS_PILL[selected.status]}/>
            <ViewRow label="Hourly Rate" value={selected.hourly_rate?'\u00A3'+Number(selected.hourly_rate).toFixed(2)+'/hr':'\u2014'}/>
            <ViewRow label="Performance Rating" value={selected.performance_rating?selected.performance_rating+' / 5.0':'\u2014'}/>

            {/* Availability */}
            <Section title="Availability"/>
            <ViewRow label="Availability Type" value={selected.availability_type}/>
            <ViewRow label="Currently Available" value={selected.currently_available} dot={selected.currently_available==='Yes'?'#059669':'#DC2626'}/>
            <ViewRow label="Emergency Cover" value={selected.emergency_cover}/>

            {/* Transport */}
            <Section title="Transport"/>
            <ViewRow label="Transport Mode" value={(TRANSPORT_ICON[selected.transport_mode]||'')+' '+( selected.transport_mode||'\u2014')}/>
            <ViewRow label="Has Own Vehicle" value={selected.has_own_vehicle}/>

            {/* Services */}
            <Section title="Services"/>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
              {(selected.services_offered||'').split('|').filter(Boolean).map(s=>(
                <span key={s} style={pill('rgba(13,189,173,0.1)','var(--teal)',s)}>{s}</span>
              ))}
              {!(selected.services_offered||'').trim()&&<span style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{'\u2014'}</span>}
            </div>

            {/* Compliance */}
            <Section title="Compliance"/>
            <ViewRow label="Compliance Status" value={selected.compliance_status} pill={COMPLIANCE_PILL[selected.compliance_status]}/>
            <ViewRow label="DBS Status" value={selected.dbs_status} pill={DBS_PILL[selected.dbs_status]}/>

            {/* Notes */}
            <Section title="Notes"/>
            <div style={{fontSize:'0.85rem',color:'var(--text-2)',lineHeight:1.6,whiteSpace:'pre-wrap',padding:'8px 0'}}>
              {selected.notes||'No notes.'}
            </div>

            {/* Meta */}
            {selected.last_worked_date&&(
              <>
                <Section title="Activity"/>
                <ViewRow label="Last Worked" value={formatDate(selected.last_worked_date)}/>
              </>
            )}

            {/* Quick actions */}
            <div style={{display:'flex',gap:10,marginTop:28}}>
              <button onClick={()=>{closeDrawer();setTimeout(()=>openEdit(selected),100)}} style={{flex:1,padding:'10px 0',fontSize:'0.85rem',fontWeight:700,color:'var(--teal)',background:'transparent',border:'1px solid var(--teal)',borderRadius:8,cursor:'pointer'}}>
                Edit Cleaner
              </button>
              <button onClick={()=>toggleMut.mutate(selected.id)} style={{flex:1,padding:'10px 0',fontSize:'0.85rem',fontWeight:700,color:'#fff',background:'linear-gradient(135deg,#0DBDAD,#0A9688)',border:'none',borderRadius:8,cursor:'pointer'}}>
                Toggle Available
              </button>
            </div>
          </div>
        )}
      </Overlay>
    </div>
  )
}

/* ── View row component ── */
function ViewRow({label,value,pill:pillCfg,dot}){
  return(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
      <span style={{fontSize:'0.78rem',color:'var(--text-muted)',fontWeight:600}}>{label}</span>
      <span style={{fontSize:'0.85rem',fontWeight:600,color:'var(--text-1)',display:'flex',alignItems:'center',gap:6}}>
        {dot&&<span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:dot}}/>}
        {pillCfg?<span style={pill(pillCfg.bg,pillCfg.color)}>{pillCfg.icon&&(pillCfg.icon+' ')}{value}</span>:(value||'\u2014')}
      </span>
    </div>
  )
}
