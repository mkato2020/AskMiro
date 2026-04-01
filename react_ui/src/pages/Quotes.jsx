import {useState,useEffect,useMemo} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'

const fmtCur=v=>'£'+Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0})
const fmtPct=v=>(v||0).toFixed(1)+'%'
const SEGMENTS=['Office','Retail','Medical','Educational','Residential','Industrial','Hospitality','Other']
const STATUS_COLORS={draft:'#f59e0b',sent:'#3b82f6',won:'#10b981',lost:'#ef4444',expired:'#6b7280'}

export default function Quotes({openLead}){
  const qc=useQueryClient()
  const {data:quotes=[],isLoading}=useQuery({queryKey:['quotes'],queryFn:()=>api.quotes()})
  const {data:settings}=useQuery({queryKey:['fin-settings'],queryFn:api.financeSettings,staleTime:300000})
  const [tab,setTab]=useState('all')
  const [showBuilder,setShowBuilder]=useState(true)

  // Settings with defaults
  const llw=settings?.llw_rate||13.85
  const onCosts=settings?.on_costs_pct||36
  const minMargin=settings?.min_margin_pct||20
  const vatRate=settings?.vat_rate||20

  // Form state
  const [form,setForm]=useState({client:'',site:'',segment:'Office',mode:'Hourly Rate',hrs:20,days:5,rate:18.50,supplies:200,other:0,notes:''})
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}))

  // Live calculator
  const calc=useMemo(()=>{
    const monthlyHrs=form.hrs*(form.days/5)*4.33
    const labour=monthlyHrs*llw*(1+onCosts/100)
    const totalCosts=labour+Number(form.supplies)+Number(form.other)
    const revenue=monthlyHrs*Number(form.rate)
    const revenueVat=revenue*(1+vatRate/100)
    const margin=revenue>0?((revenue-totalCosts)/revenue)*100:0
    const grossMargin=revenue-totalCosts
    return{monthlyHrs,labour,totalCosts,revenue,revenueVat,margin,grossMargin}
  },[form,llw,onCosts,vatRate])

  const marginOk=calc.margin>=minMargin
  const marginColor=marginOk?'#10b981':'#ef4444'

  // Filter quotes
  const filtered=tab==='all'?quotes:tab==='web'?quotes.filter(q=>q.source==='web'||q.intel):quotes.filter(q=>q.status===tab)

  return(
    <div style={{padding:'28px 36px',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
            <span style={{background:'var(--teal)',color:'white',fontSize:'0.65rem',fontWeight:700,padding:'3px 10px',borderRadius:4,textTransform:'uppercase'}}>Quotes</span>
            <h1 style={{fontSize:'1.35rem',fontWeight:800,color:'var(--text-1)',margin:0}}>Quote Builder</h1>
          </div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{quotes.length} quotes</span>
          <button onClick={()=>setShowBuilder(!showBuilder)} style={{background:'var(--teal)',color:'white',border:'none',borderRadius:'var(--r-sm)',padding:'8px 16px',fontSize:'0.8rem',fontWeight:600,cursor:'pointer'}}>
            {showBuilder?'Hide Builder':'+ New Quote'}
          </button>
        </div>
      </div>

      {/* Builder */}
      {showBuilder&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 380px',gap:20,marginBottom:28}}>
          {/* Form */}
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:28}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}>
              <span style={{background:'#3b82f6',color:'white',fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase'}}>Builder</span>
              <span style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)'}}>New Quote</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <Field label="Client Name *" value={form.client} onChange={v=>upd('client',v)}/>
              <Field label="Site Address *" value={form.site} onChange={v=>upd('site',v)}/>
              <SelectField label="Segment" value={form.segment} onChange={v=>upd('segment',v)} options={SEGMENTS}/>
              <SelectField label="Mode" value={form.mode} onChange={v=>upd('mode',v)} options={['Hourly Rate','Fixed Price']}/>
              <Field label="Hrs/Week" value={form.hrs} onChange={v=>upd('hrs',Number(v))} type="number"/>
              <SelectField label="Days/Week" value={form.days} onChange={v=>upd('days',Number(v))} options={[1,2,3,4,5,6,7]}/>
              <Field label="Client Rate (£/hr)" value={form.rate} onChange={v=>upd('rate',v)} type="number" step="0.5"/>
              <div/>
              <Field label="Supplies/Month (£)" value={form.supplies} onChange={v=>upd('supplies',v)} type="number"/>
              <Field label="Other Costs/Month (£)" value={form.other} onChange={v=>upd('other',v)} type="number"/>
            </div>
            <div style={{marginTop:16}}>
              <label style={{fontSize:'0.7rem',fontWeight:600,color:'var(--teal)',textTransform:'uppercase',letterSpacing:'0.05em'}}>LLW Rate (£/hr) — Auto from Settings</label>
              <div style={{marginTop:4,padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.85rem',color:'var(--text-muted)'}}>{llw.toFixed(2)}</div>
            </div>
            <div style={{marginTop:16}}>
              <label style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Notes</label>
              <textarea value={form.notes} onChange={e=>upd('notes',e.target.value)} placeholder="Scope, access notes, special requirements..." style={{marginTop:4,width:'100%',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.82rem',color:'var(--text-1)',minHeight:70,resize:'vertical',fontFamily:'inherit'}}/>
            </div>
            <div style={{marginTop:20,textAlign:'center'}}>
              <button style={{background:'var(--teal)',color:'white',border:'none',borderRadius:'var(--r-sm)',padding:'10px 32px',fontSize:'0.85rem',fontWeight:700,cursor:'pointer'}}>Save as Draft</button>
            </div>
          </div>

          {/* Live Calculator */}
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:28}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}>
              <span style={{background:marginOk?'#10b981':'#ef4444',color:'white',fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase'}}>Margin</span>
              <span style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)'}}>Live Calculator</span>
            </div>

            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:'2.8rem',fontWeight:900,color:marginColor,lineHeight:1}}>{fmtPct(calc.margin)}</div>
              <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:4}}>gross margin</div>
              <div style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)',marginTop:2}}>{fmtCur(calc.revenue)}/mo</div>
            </div>

            <div style={{borderTop:'1px solid var(--border)',paddingTop:16}}>
              <CalcRow label="Revenue/month (ex. VAT)" value={fmtCur(calc.revenue)}/>
              <CalcRow label="Revenue/month (inc. VAT)" value={fmtCur(calc.revenueVat)}/>
              <CalcRow label="Labour cost" value={fmtCur(calc.labour)} muted/>
              <CalcRow label="Supplies + Other" value={fmtCur(Number(form.supplies)+Number(form.other))} muted/>
              <CalcRow label="Direct cost total" value={fmtCur(calc.totalCosts)} bold/>
              <div style={{borderTop:'1px solid var(--border)',marginTop:8,paddingTop:8}}>
                <CalcRow label="Gross margin" value={<span style={{color:marginColor,fontWeight:700}}>{calc.grossMargin<0?'£-'+Math.abs(Math.round(calc.grossMargin)).toLocaleString():fmtCur(calc.grossMargin)}</span>}/>
              </div>
            </div>

            {!marginOk&&(
              <div style={{marginTop:16,padding:'10px 14px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'var(--r-sm)',fontSize:'0.78rem',color:'#dc2626',fontWeight:600}}>
                ✗ Below {minMargin}% floor — override required to send
              </div>
            )}

            <div style={{marginTop:20,fontSize:'0.68rem',color:'var(--text-muted)',lineHeight:1.6}}>
              LLW Rate: £{llw.toFixed(2)}/hr · On-costs: {onCosts}% · Min margin: {minMargin}%<br/>
              These drive all calculations. Update in Admin → Settings.
            </div>
          </div>
        </div>
      )}

      {/* Quote History */}
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{background:'#6366f1',color:'white',fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase'}}>History</span>
            <span style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)'}}>Recent Quotes</span>
            <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{filtered.length} shown</span>
          </div>
          <div style={{display:'flex',gap:6}}>
            {[['all','All'],['web','Web Leads']].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{padding:'5px 14px',borderRadius:20,border:tab===k?'none':'1px solid var(--border)',background:tab===k?'var(--teal)':'transparent',color:tab===k?'white':'var(--text-muted)',fontSize:'0.75rem',fontWeight:600,cursor:'pointer'}}>
                {l} ({k==='all'?quotes.length:quotes.filter(q=>q.source==='web'||q.intel).length})
              </button>
            ))}
          </div>
        </div>

        {isLoading?(
          <div style={{textAlign:'center',padding:40,color:'var(--text-muted)',fontSize:'0.85rem'}}>Loading quotes...</div>
        ):filtered.length===0?(
          <div style={{textAlign:'center',padding:40,color:'var(--text-muted)',fontSize:'0.85rem'}}>No quotes yet. Use the builder above to create one.</div>
        ):(
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)'}}>
                {['ID','V','Client','Site','Revenue/Mo','Margin','Status','Date'].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q,i)=>(
                <tr key={q.id||i} style={{borderBottom:'1px solid var(--border)',cursor:'pointer'}} onClick={()=>q.entity_id&&openLead(q.entity_id)}>
                  <td style={{padding:'10px',color:'var(--text-1)',fontWeight:600,fontFamily:'monospace',fontSize:'0.75rem'}}>
                    {q.id?.substring(0,18)||'—'}
                    {(q.source==='web'||q.intel)&&<span style={{marginLeft:6,background:'var(--teal)',color:'white',fontSize:'0.55rem',padding:'1px 5px',borderRadius:3,fontWeight:700}}>Intel</span>}
                  </td>
                  <td style={{padding:'10px',color:'var(--text-muted)'}}>{q.version||'v1'}</td>
                  <td style={{padding:'10px',color:'var(--text-1)',fontWeight:600}}>{q.client||q.customer||'—'}</td>
                  <td style={{padding:'10px',color:'var(--text-muted)'}}>{q.site||q.address||'—'}</td>
                  <td style={{padding:'10px',color:'var(--text-1)'}}>{q.revenue?fmtCur(q.revenue)+'/mo':'£0/mo'}</td>
                  <td style={{padding:'10px',color:q.margin>minMargin?'#10b981':'#ef4444',fontWeight:600}}>{q.margin?fmtPct(q.margin):'0.0%'}</td>
                  <td style={{padding:'10px'}}><span style={{padding:'2px 10px',borderRadius:12,fontSize:'0.72rem',fontWeight:600,color:STATUS_COLORS[q.status]||'#6b7280',background:(STATUS_COLORS[q.status]||'#6b7280')+'18'}}>{q.status||'draft'}</span></td>
                  <td style={{padding:'10px',color:'var(--text-muted)',fontSize:'0.78rem'}}>{q.created_at?new Date(q.created_at).toLocaleDateString():'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Field({label,value,onChange,type='text',step}){
  return(
    <div>
      <label style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
      <input type={type} step={step} value={value} onChange={e=>onChange(e.target.value)} style={{marginTop:4,width:'100%',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.85rem',color:'var(--text-1)',fontFamily:'inherit'}}/>
    </div>
  )
}
function SelectField({label,value,onChange,options}){
  return(
    <div>
      <label style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{marginTop:4,width:'100%',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.85rem',color:'var(--text-1)',fontFamily:'inherit'}}>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
function CalcRow({label,value,bold,muted}){
  return(
    <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:'0.82rem'}}>
      <span style={{color:muted?'var(--text-muted)':'var(--text-1)',fontWeight:bold?700:400}}>{label}</span>
      <span style={{color:'var(--text-1)',fontWeight:bold?700:400}}>{value}</span>
    </div>
  )
}
