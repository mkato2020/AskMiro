import {useState,useEffect,useMemo,useCallback,useRef} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {fetchQuoteIntelligence,fetchCleanerMatch,fetchFeasibility} from '../api'

const fmtCur=v=>'£'+Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0})
const fmtPct=v=>(v||0).toFixed(1)+'%'
const SEGMENTS=['Office','Retail','Medical','Educational','Residential','Industrial','Hospitality','Other']
const STATUS_COLORS={draft:'#f59e0b',sent:'#3b82f6',won:'#10b981',lost:'#ef4444',expired:'#6b7280'}

// ── Helpers ──────────────────────────────────────────────────
function scoreColor(v){return v>=70?'#10b981':v>=40?'#f59e0b':'#ef4444'}
function marginBadgeColor(yours,avg){return yours>=avg?'#10b981':'#ef4444'}
function riskLabel(margin){return margin>=30?'Low':margin>=20?'Medium':'High'}
function riskColor(margin){return margin>=30?'#10b981':margin>=20?'#f59e0b':'#ef4444'}

export default function Quotes({openLead}){
  const qc=useQueryClient()
  const {data:quotesRaw,isLoading}=useQuery({queryKey:['quotes'],queryFn:()=>api.quotes()})
  const quotes=Array.isArray(quotesRaw)?quotesRaw:(quotesRaw?.quotes||[])
  const {data:settings}=useQuery({queryKey:['fin-settings'],queryFn:api.financeSettings,staleTime:300000})
  const [tab,setTab]=useState('all')
  const [showBuilder,setShowBuilder]=useState(true)
  const [saving,setSaving]=useState(false)
  const [saveMsg,setSaveMsg]=useState(null)

  // Settings with defaults
  const llw=settings?.llw_rate||13.85
  const onCosts=settings?.on_costs_pct||36
  const minMargin=settings?.min_margin_pct||20
  const vatRate=settings?.vat_rate||20

  // Form state
  const [form,setForm]=useState({client:'',site:'',postcode:'',segment:'Office',mode:'Hourly Rate',hrs:20,days:5,rate:18.50,supplies:200,other:0,notes:''})
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}))

  // Intelligence state
  const [intel,setIntel]=useState(null)
  const [intelLoading,setIntelLoading]=useState(false)
  const [intelError,setIntelError]=useState(null)
  const [showIntel,setShowIntel]=useState(true)

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

  // ── Intelligence fetch ─────────────────────────────────────
  const fetchIntel=useCallback(async()=>{
    const pc=form.postcode?.trim()
    if(!pc||!form.hrs) return
    setIntelLoading(true)
    setIntelError(null)
    try{
      const [quoteIntel,feasibility,cleanerMatch]=await Promise.allSettled([
        fetchQuoteIntelligence('',pc,form.segment,form.hrs,calc.revenue),
        fetchFeasibility(pc,form.hrs,form.segment),
        fetchCleanerMatch(pc,form.hrs,form.segment,3)
      ])
      setIntel({
        quote:quoteIntel.status==='fulfilled'?quoteIntel.value:null,
        feasibility:feasibility.status==='fulfilled'?feasibility.value:null,
        cleaners:cleanerMatch.status==='fulfilled'?cleanerMatch.value:null,
      })
    }catch(err){
      setIntelError(err.message||'Intelligence lookup failed')
      setIntel(null)
    }finally{
      setIntelLoading(false)
    }
  },[form.postcode,form.segment,form.hrs,calc.revenue])

  // Debounced auto-fetch when key fields change
  const debounceRef=useRef(null)
  useEffect(()=>{
    if(!form.postcode?.trim()||!form.hrs) return
    if(debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current=setTimeout(()=>fetchIntel(),900)
    return()=>{if(debounceRef.current) clearTimeout(debounceRef.current)}
  },[form.postcode,form.segment,form.hrs,form.rate,fetchIntel])

  // Scenario cards
  const scenarios=useMemo(()=>{
    if(!calc.totalCosts) return null
    const cost=calc.totalCosts
    const buildScenario=(label,targetMargin)=>{
      const price=cost/(1-targetMargin/100)
      const margin=price>0?((price-cost)/price)*100:0
      return{label,price,margin,risk:riskLabel(margin)}
    }
    return[buildScenario('Aggressive',15),buildScenario('Balanced',25),buildScenario('Protected',35)]
  },[calc.totalCosts])

  // ── Save as Draft ────────────────────────────────────────
  const saveQuote=useCallback(async()=>{
    if(!form.client?.trim()){setSaveMsg({type:'error',text:'Client name is required'});return}
    setSaving(true);setSaveMsg(null)
    try{
      const res=await fetch('/api/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        client_name:form.client,site_address:form.site,site_postcode:form.postcode,
        sector:form.segment,mode:form.mode==='Hourly Rate'?'hourly':'fixed',
        hours_per_week:form.hrs,days_per_week:form.days,client_rate:Number(form.rate),
        llw_rate:llw,on_costs_pct:onCosts,supplies_month:Number(form.supplies),
        other_costs_month:Number(form.other),notes:form.notes,status:'draft'
      })})
      const data=await res.json()
      if(!res.ok) throw new Error(data.detail||data.error||'Save failed')
      setSaveMsg({type:'success',text:`Quote ${(data.id||'').substring(0,8)} saved`})
      qc.invalidateQueries({queryKey:['quotes']})
      // Reset form
      setForm({client:'',site:'',postcode:'',segment:'Office',mode:'Hourly Rate',hrs:20,days:5,rate:18.50,supplies:200,other:0,notes:''})
      setIntel(null)
    }catch(err){
      setSaveMsg({type:'error',text:err.message||'Save failed'})
    }finally{setSaving(false)}
  },[form,llw,onCosts,qc])

  const canShowIntel=!!form.postcode?.trim()&&form.hrs>0

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
              <Field label="Postcode *" value={form.postcode} onChange={v=>upd('postcode',v)} placeholder="e.g. SW1A 1AA"/>
              <SelectField label="Segment" value={form.segment} onChange={v=>upd('segment',v)} options={SEGMENTS}/>
              <SelectField label="Mode" value={form.mode} onChange={v=>upd('mode',v)} options={['Hourly Rate','Fixed Price']}/>
              <Field label="Hrs/Week" value={form.hrs} onChange={v=>upd('hrs',Number(v))} type="number"/>
              <SelectField label="Days/Week" value={form.days} onChange={v=>upd('days',Number(v))} options={[1,2,3,4,5,6,7]}/>
              <Field label="Client Rate (£/hr)" value={form.rate} onChange={v=>upd('rate',v)} type="number" step="0.5"/>
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
              <button onClick={saveQuote} disabled={saving} style={{background:'var(--teal)',color:'white',border:'none',borderRadius:'var(--r-sm)',padding:'10px 32px',fontSize:'0.85rem',fontWeight:700,cursor:saving?'wait':'pointer',opacity:saving?0.7:1}}>
                {saving?'Saving…':'Save as Draft'}
              </button>
              {saveMsg&&<div style={{marginTop:8,fontSize:'0.78rem',fontWeight:600,color:saveMsg.type==='success'?'#10b981':'#ef4444'}}>{saveMsg.text}</div>}
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

            {/* ── Margin Guard ── */}
            {calc.margin<10&&calc.revenue>0&&(
              <div style={{marginTop:16,padding:'10px 14px',background:'#450a0a',border:'1px solid #dc2626',borderRadius:'var(--r-sm)',fontSize:'0.78rem',color:'#fca5a5',fontWeight:700}}>
                Critical: This quote has dangerously low margin ({fmtPct(calc.margin)}). Approval required.
              </div>
            )}
            {calc.margin>=10&&calc.margin<20&&calc.revenue>0&&(
              <div style={{marginTop:16,padding:'10px 14px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'var(--r-sm)',fontSize:'0.78rem',color:'#dc2626',fontWeight:600}}>
                Warning: This quote is below the minimum margin threshold (20%). Review before sending.
              </div>
            )}
            {calc.margin>=20&&!marginOk&&(
              <div style={{marginTop:16,padding:'10px 14px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'var(--r-sm)',fontSize:'0.78rem',color:'#dc2626',fontWeight:600}}>
                Below {minMargin}% floor — override required to send
              </div>
            )}

            <div style={{marginTop:20,fontSize:'0.68rem',color:'var(--text-muted)',lineHeight:1.6}}>
              LLW Rate: £{llw.toFixed(2)}/hr · On-costs: {onCosts}% · Min margin: {minMargin}%<br/>
              These drive all calculations. Update in Admin → Settings.
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          INTELLIGENCE PANEL
         ══════════════════════════════════════════════════════════ */}
      {showBuilder&&canShowIntel&&(
        <div style={{marginBottom:28}}>
          {/* Toggle header */}
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:showIntel?16:0,cursor:'pointer'}} onClick={()=>setShowIntel(!showIntel)}>
            <span style={{background:'#8b5cf6',color:'white',fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase'}}>Intelligence</span>
            <span style={{fontSize:'0.95rem',fontWeight:700,color:'var(--text-1)'}}>Commercial Intelligence</span>
            <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{showIntel?'▼':'▶'}</span>
            {intelLoading&&<span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>Loading...</span>}
            {!intel&&!intelLoading&&(
              <button onClick={e=>{e.stopPropagation();fetchIntel()}} style={{marginLeft:'auto',background:'#8b5cf6',color:'white',border:'none',borderRadius:'var(--r-sm)',padding:'5px 14px',fontSize:'0.72rem',fontWeight:600,cursor:'pointer'}}>
                Check Intelligence
              </button>
            )}
          </div>

          {showIntel&&intelError&&(
            <div style={{padding:'10px 14px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'var(--r-sm)',fontSize:'0.78rem',color:'#dc2626',marginBottom:16}}>
              Intelligence error: {intelError}
            </div>
          )}

          {showIntel&&intel&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

              {/* ── Sector Benchmark Card ── */}
              <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:22}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                  <span style={{background:'#6366f1',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase'}}>Benchmark</span>
                  <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Sector Benchmark</span>
                </div>
                {intel.quote?.benchmark?(
                  <>
                    <div style={{fontSize:'0.82rem',color:'var(--text-1)',marginBottom:8}}>
                      Avg margin for <strong>{form.segment}</strong> in <strong>{intel.quote.benchmark.borough||'area'}</strong>: <strong>{fmtPct(intel.quote.benchmark.avg_margin)}</strong>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <span style={{fontSize:'0.82rem',color:'var(--text-1)'}}>Your quote margin:</span>
                      <span style={{fontSize:'1.1rem',fontWeight:800,color:marginBadgeColor(calc.margin,intel.quote.benchmark.avg_margin||20)}}>{fmtPct(calc.margin)}</span>
                      {calc.margin>=(intel.quote.benchmark.avg_margin||20)
                        ?<span style={{fontSize:'0.65rem',background:'#10b98118',color:'#10b981',padding:'2px 8px',borderRadius:10,fontWeight:600}}>Above avg</span>
                        :<span style={{fontSize:'0.65rem',background:'#ef444418',color:'#ef4444',padding:'2px 8px',borderRadius:10,fontWeight:600}}>Below avg</span>
                      }
                    </div>
                    {intel.quote.benchmark.note&&(
                      <div style={{fontSize:'0.72rem',color:'var(--text-muted)',fontStyle:'italic',lineHeight:1.5}}>{intel.quote.benchmark.note}</div>
                    )}
                  </>
                ):(
                  <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>No benchmark data available for this sector/area.</div>
                )}
              </div>

              {/* ── Feasibility Score Card ── */}
              <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:22}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                  <span style={{background:'#0ea5e9',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase'}}>Feasibility</span>
                  <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Feasibility Score</span>
                </div>
                {intel.feasibility?.score!=null?(
                  <>
                    <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:12}}>
                      <div style={{width:56,height:56,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:scoreColor(intel.feasibility.score)+'20',border:`3px solid ${scoreColor(intel.feasibility.score)}`}}>
                        <span style={{fontSize:'1.2rem',fontWeight:900,color:scoreColor(intel.feasibility.score)}}>{Math.round(intel.feasibility.score)}</span>
                      </div>
                      <div>
                        {intel.feasibility.coverage_label&&<div style={{fontSize:'0.82rem',fontWeight:600,color:'var(--text-1)'}}>{intel.feasibility.coverage_label}</div>}
                        {intel.feasibility.cleaners_nearby!=null&&<div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{intel.feasibility.cleaners_nearby} cleaners nearby</div>}
                        {intel.feasibility.travel_burden&&<div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>Travel: {intel.feasibility.travel_burden}</div>}
                      </div>
                    </div>
                    {intel.feasibility.warnings?.length>0&&(
                      <div style={{marginTop:4}}>
                        {intel.feasibility.warnings.map((w,i)=>(
                          <div key={i} style={{fontSize:'0.72rem',color:'#f59e0b',marginBottom:3}}>• {w}</div>
                        ))}
                      </div>
                    )}
                  </>
                ):(
                  <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>No feasibility data available.</div>
                )}
              </div>

              {/* ── Scenario Cards ── */}
              {scenarios&&(
                <div style={{gridColumn:'1 / -1',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:22}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                    <span style={{background:'#f59e0b',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase'}}>Scenarios</span>
                    <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Pricing Scenarios</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
                    {scenarios.map((s,i)=>{
                      const isBalanced=i===1
                      return(
                        <div key={s.label} style={{
                          background:isBalanced?'#8b5cf610':'var(--bg-base)',
                          border:isBalanced?'2px solid #8b5cf6':'1px solid var(--border)',
                          borderRadius:'var(--r-lg)',padding:18,textAlign:'center',position:'relative'
                        }}>
                          {isBalanced&&<div style={{position:'absolute',top:-9,left:'50%',transform:'translateX(-50%)',background:'#8b5cf6',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 10px',borderRadius:10,textTransform:'uppercase'}}>Recommended</div>}
                          <div style={{fontSize:'0.78rem',fontWeight:700,color:'var(--text-1)',marginBottom:6,marginTop:isBalanced?4:0}}>{s.label}</div>
                          <div style={{fontSize:'1.5rem',fontWeight:900,color:'var(--text-1)',lineHeight:1}}>{fmtCur(s.price)}</div>
                          <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginBottom:8}}>/month</div>
                          <div style={{display:'flex',justifyContent:'center',gap:10}}>
                            <span style={{fontSize:'0.72rem',color:riskColor(s.margin),fontWeight:700}}>{fmtPct(s.margin)} margin</span>
                            <span style={{fontSize:'0.65rem',background:riskColor(s.margin)+'18',color:riskColor(s.margin),padding:'2px 8px',borderRadius:10,fontWeight:600}}>{s.risk} risk</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Top Matched Cleaners ── */}
              <div style={{gridColumn:'1 / -1',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:22}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                  <span style={{background:'#10b981',color:'white',fontSize:'0.55rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase'}}>Match</span>
                  <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--text-1)'}}>Top Matched Cleaners</span>
                </div>
                {intel.cleaners?.matches?.length>0?(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                    {intel.cleaners.matches.slice(0,3).map((c,i)=>(
                      <div key={c.id||i} style={{background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                          <span style={{fontSize:'0.85rem',fontWeight:700,color:'var(--text-1)'}}>{c.name||'Unnamed'}</span>
                          {c.match_quality&&(
                            <span style={{fontSize:'0.6rem',fontWeight:700,padding:'2px 8px',borderRadius:10,
                              background:c.match_quality==='strong'?'#10b98118':c.match_quality==='good'?'#f59e0b18':'#ef444418',
                              color:c.match_quality==='strong'?'#10b981':c.match_quality==='good'?'#f59e0b':'#ef4444',
                              textTransform:'uppercase'
                            }}>{c.match_quality}</span>
                          )}
                        </div>
                        <div style={{fontSize:'0.72rem',color:'var(--text-muted)',lineHeight:1.7}}>
                          {c.distance!=null&&<div>Distance: {typeof c.distance==='number'?c.distance.toFixed(1)+' mi':c.distance}</div>}
                          {c.travel_time!=null&&<div>Travel: {c.travel_time} min</div>}
                          {c.pay_rate!=null&&<div>Pay rate: £{Number(c.pay_rate).toFixed(2)}/hr</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ):(
                  <div style={{padding:'12px 14px',background:'#fef3c718',border:'1px solid #fef3c7',borderRadius:'var(--r-sm)',fontSize:'0.78rem',color:'#f59e0b',fontWeight:600}}>
                    No strong cleaner matches for this postcode/hours combination. Consider expanding the search or recruiting in this area.
                  </div>
                )}
              </div>

            </div>
          )}
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

function Field({label,value,onChange,type='text',step,placeholder}){
  return(
    <div>
      <label style={{fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
      <input type={type} step={step} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{marginTop:4,width:'100%',padding:'10px 14px',background:'var(--bg-base)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'0.85rem',color:'var(--text-1)',fontFamily:'inherit'}}/>
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
