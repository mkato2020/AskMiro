// ════════════════════════════════════════════════════════════════════════════
// AskMiro OS — Shared UI Design System
// ────────────────────────────────────────────────────────────────────────────
// Best-in-class SaaS primitives built on the CSS-variable token set defined in
// main.jsx. Every module composes these instead of re-implementing inline
// styles, which is what previously bloated each page to 500-1000 lines and gave
// inconsistent hover/focus/empty/loading states.
//
// Why a one-time injected stylesheet: inline styles can't express :hover,
// :focus-visible, :active, transitions, or media queries. We inject a single
// <style> with `.am-*` classes once at module load, then components apply
// className + minimal inline overrides for per-instance colour. This delivers
// real interactive + accessible states while staying token-driven.
// ════════════════════════════════════════════════════════════════════════════
import React, {useEffect, useRef, useState, useMemo} from 'react'

// ── One-time stylesheet injection ───────────────────────────────────────────
const STYLE_ID = 'am-ui-styles'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
  .am-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;
    font-weight:600;border:1px solid transparent;border-radius:var(--r-sm);
    cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s,transform .05s;
    white-space:nowrap;line-height:1;user-select:none;font-family:inherit}
  .am-btn:focus-visible{outline:none;box-shadow:var(--ring)}
  .am-btn:active:not(:disabled){transform:translateY(.5px)}
  .am-btn:disabled{opacity:.5;cursor:not-allowed}
  .am-btn-sm{padding:6px 12px;font-size:.76rem}
  .am-btn-md{padding:9px 16px;font-size:.83rem}
  .am-btn-lg{padding:12px 22px;font-size:.9rem}
  .am-btn-primary{background:var(--teal);color:#fff}
  .am-btn-primary:hover:not(:disabled){background:var(--teal-dark)}
  .am-btn-secondary{background:var(--bg-surface);color:var(--text-1);border-color:var(--border-strong)}
  .am-btn-secondary:hover:not(:disabled){background:var(--bg-subtle)}
  .am-btn-ghost{background:transparent;color:var(--text-2)}
  .am-btn-ghost:hover:not(:disabled){background:var(--bg-subtle)}
  .am-btn-danger{background:var(--danger);color:#fff}
  .am-btn-danger:hover:not(:disabled){background:#DC2626}
  .am-btn-success{background:var(--success);color:#fff}
  .am-btn-success:hover:not(:disabled){background:#059669}

  .am-card{background:var(--bg-surface);border:1px solid var(--border);
    border-radius:var(--r-lg);box-shadow:var(--shadow)}
  .am-card-hover{transition:box-shadow .15s,border-color .15s}
  .am-card-hover:hover{box-shadow:var(--shadow-md);border-color:var(--border-strong)}

  .am-kpi{background:var(--bg-surface);border:1px solid var(--border);
    border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .am-kpi-accent{position:absolute;left:0;top:0;bottom:0;width:3px}

  .am-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;
    border-radius:999px;font-size:.68rem;font-weight:700;line-height:1.5;letter-spacing:.01em}

  .am-table{width:100%;border-collapse:collapse;font-size:.83rem}
  .am-table th{text-align:left;padding:11px 16px;font-size:.68rem;font-weight:700;
    text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);
    background:var(--bg-subtle);border-bottom:1px solid var(--border);white-space:nowrap}
  .am-table th.am-sortable{cursor:pointer;user-select:none}
  .am-table th.am-sortable:hover{color:var(--text-2)}
  .am-table td{padding:12px 16px;border-bottom:1px solid var(--border);color:var(--text-1);vertical-align:middle}
  .am-table tbody tr{transition:background .12s}
  .am-table tbody tr.am-clickable{cursor:pointer}
  .am-table tbody tr.am-clickable:hover{background:var(--bg-subtle)}
  .am-table tbody tr:last-child td{border-bottom:none}

  .am-input,.am-select,.am-textarea{width:100%;padding:9px 12px;font-size:.85rem;
    border:1px solid var(--border-strong);border-radius:var(--r-sm);background:var(--bg-surface);
    color:var(--text-1);transition:border-color .15s,box-shadow .15s;font-family:inherit}
  .am-input:focus,.am-select:focus,.am-textarea:focus{outline:none;border-color:var(--teal);box-shadow:var(--ring)}
  .am-input[aria-invalid="true"],.am-textarea[aria-invalid="true"]{border-color:var(--danger)}
  .am-input::placeholder,.am-textarea::placeholder{color:var(--text-muted)}

  .am-skel{background:linear-gradient(90deg,#EEF2F6 25%,#E2E8F0 37%,#EEF2F6 63%);
    background-size:400% 100%;animation:am-shimmer 1.3s ease-in-out infinite;border-radius:var(--r-sm)}
  @keyframes am-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}

  .am-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);backdrop-filter:blur(2px);
    display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;
    animation:am-fade .15s ease}
  .am-modal{background:var(--bg-surface);border-radius:var(--r-xl);box-shadow:var(--shadow-lg);
    width:100%;max-height:90vh;display:flex;flex-direction:column;animation:am-pop .18s cubic-bezier(.16,1,.3,1)}
  @keyframes am-fade{from{opacity:0}to{opacity:1}}
  @keyframes am-pop{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:none}}
  `
  document.head.appendChild(el)
}

// ── Semantic colour map (badge / kpi tones) ─────────────────────────────────
export const TONE = {
  teal:    {fg:'var(--teal)',    bg:'var(--teal-wash)'},
  success: {fg:'var(--success)', bg:'var(--success-wash)'},
  warning: {fg:'var(--warning)', bg:'var(--warning-wash)'},
  danger:  {fg:'var(--danger)',  bg:'var(--danger-wash)'},
  info:    {fg:'var(--info)',    bg:'var(--info-wash)'},
  neutral: {fg:'var(--text-muted)', bg:'var(--bg-subtle)'},
}

// ── Button ──────────────────────────────────────────────────────────────────
export function Button({variant='secondary', size='md', loading=false, disabled=false,
                        icon=null, children, className='', ...rest}){
  return (
    <button
      className={`am-btn am-btn-${size} am-btn-${variant} ${className}`}
      disabled={disabled||loading}
      aria-busy={loading||undefined}
      {...rest}
    >
      {loading && <InlineSpinner/>}
      {!loading && icon}
      {children}
    </button>
  )
}

function InlineSpinner(){
  return (
    <span style={{width:13,height:13,border:'2px solid currentColor',borderTopColor:'transparent',
      borderRadius:'50%',display:'inline-block',animation:'spin .65s linear infinite'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </span>
  )
}

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({children, padding=20, hover=false, className='', style={}, ...rest}){
  return (
    <div className={`am-card ${hover?'am-card-hover':''} ${className}`} style={{padding, ...style}} {...rest}>
      {children}
    </div>
  )
}

// ── PageHeader ──────────────────────────────────────────────────────────────
export function PageHeader({badge, title, subtitle, actions}){
  return (
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',
      gap:16,marginBottom:24,flexWrap:'wrap'}}>
      <div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:subtitle?6:0}}>
          {badge && <span style={{background:'var(--teal)',color:'#fff',fontSize:'.64rem',fontWeight:700,
            padding:'3px 10px',borderRadius:4,textTransform:'uppercase',letterSpacing:'.04em'}}>{badge}</span>}
          <h1 style={{fontSize:'1.35rem',fontWeight:800,color:'var(--text-1)',margin:0}}>{title}</h1>
        </div>
        {subtitle && <div style={{fontSize:'.85rem',color:'var(--text-muted)'}}>{subtitle}</div>}
      </div>
      {actions && <div style={{display:'flex',gap:8,alignItems:'center'}}>{actions}</div>}
    </div>
  )
}

// ── KPICard ─────────────────────────────────────────────────────────────────
export function KPICard({label, value, color='var(--teal)', hint, icon, trend}){
  return (
    <div className="am-kpi">
      <div className="am-kpi-accent" style={{background:color}}/>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div style={{fontSize:'.68rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',
          letterSpacing:'.04em',marginBottom:8}}>{label}</div>
        {icon && <span style={{fontSize:'1rem',opacity:.8}}>{icon}</span>}
      </div>
      <div style={{fontSize:'1.6rem',fontWeight:800,color:color,lineHeight:1}}>{value}</div>
      {(hint||trend) && (
        <div style={{fontSize:'.72rem',color:'var(--text-muted)',marginTop:6,display:'flex',gap:6,alignItems:'center'}}>
          {trend!=null && <span style={{color:trend>=0?'var(--success)':'var(--danger)',fontWeight:700}}>
            {trend>=0?'▲':'▼'} {Math.abs(trend)}%</span>}
          {hint}
        </div>
      )}
    </div>
  )
}

// ── Badge ───────────────────────────────────────────────────────────────────
export function Badge({tone='neutral', children, dot=false, style={}}){
  const t = TONE[tone] || TONE.neutral
  return (
    <span className="am-badge" style={{color:t.fg, background:t.bg, ...style}}>
      {dot && <span style={{width:6,height:6,borderRadius:'50%',background:t.fg}}/>}
      {children}
    </span>
  )
}

// ── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({icon='📭', title, message, action}){
  return (
    <div style={{background:'var(--bg-surface)',border:'1px dashed var(--border-strong)',
      borderRadius:'var(--r-lg)',padding:'56px 32px',textAlign:'center'}}>
      <div style={{fontSize:'2.5rem',marginBottom:14,opacity:.9}}>{icon}</div>
      <div style={{fontSize:'1rem',fontWeight:700,color:'var(--text-1)'}}>{title}</div>
      {message && <div style={{fontSize:'.83rem',color:'var(--text-muted)',marginTop:8,maxWidth:420,
        margin:'8px auto 0',lineHeight:1.6}}>{message}</div>}
      {action && <div style={{marginTop:20}}>{action}</div>}
    </div>
  )
}

// ── Skeletons ───────────────────────────────────────────────────────────────
export function Skeleton({w='100%', h=14, r=6, style={}}){
  return <div className="am-skel" style={{width:w,height:h,borderRadius:r,...style}}/>
}
export function SkeletonText({lines=3}){
  return (
    <div style={{display:'flex',flexDirection:'column',gap:9}}>
      {Array.from({length:lines}).map((_,i)=>(
        <Skeleton key={i} w={i===lines-1?'60%':'100%'} h={12}/>
      ))}
    </div>
  )
}
export function SkeletonKPIs({count=4}){
  return (
    <div style={{display:'grid',gridTemplateColumns:`repeat(${count},1fr)`,gap:14}}>
      {Array.from({length:count}).map((_,i)=>(
        <div key={i} className="am-kpi"><Skeleton w="50%" h={10}/><div style={{height:12}}/><Skeleton w="40%" h={24}/></div>
      ))}
    </div>
  )
}
export function SkeletonTable({rows=6, cols=4}){
  return (
    <Card padding={0}>
      <table className="am-table">
        <thead><tr>{Array.from({length:cols}).map((_,i)=><th key={i}><Skeleton w="60%" h={9}/></th>)}</tr></thead>
        <tbody>
          {Array.from({length:rows}).map((_,r)=>(
            <tr key={r}>{Array.from({length:cols}).map((_,c)=><td key={c}><Skeleton w={c===0?'80%':'50%'} h={12}/></td>)}</tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ── DataTable ───────────────────────────────────────────────────────────────
// columns: [{ key, header, render?(row), align?, sortable?, width? }]
export function DataTable({columns, rows, loading=false, onRowClick, empty, rowKey=(r,i)=>r.id??i,
                           initialSort=null}){
  const [sort, setSort] = useState(initialSort) // {key, dir:'asc'|'desc'}

  const sorted = useMemo(()=>{
    if(!sort || !Array.isArray(rows)) return rows||[]
    const col = columns.find(c=>c.key===sort.key)
    const accessor = col?.sortValue || (r=>r[sort.key])
    return [...rows].sort((a,b)=>{
      const av=accessor(a), bv=accessor(b)
      if(av==null) return 1; if(bv==null) return -1
      const cmp = (typeof av==='number'&&typeof bv==='number') ? av-bv : String(av).localeCompare(String(bv))
      return sort.dir==='asc'?cmp:-cmp
    })
  },[rows,sort,columns])

  if(loading) return <SkeletonTable cols={columns.length}/>
  if(!sorted || sorted.length===0) {
    return empty || <EmptyState title="Nothing here yet" message="No records to display."/>
  }

  const toggleSort = (key) => setSort(s =>
    s?.key===key ? (s.dir==='asc'?{key,dir:'desc'}:null) : {key,dir:'asc'})

  return (
    <Card padding={0} style={{overflow:'hidden'}}>
      <div style={{overflowX:'auto'}}>
        <table className="am-table">
          <thead>
            <tr>
              {columns.map(col=>(
                <th key={col.key}
                    className={col.sortable?'am-sortable':''}
                    style={{textAlign:col.align||'left',width:col.width}}
                    onClick={col.sortable?()=>toggleSort(col.key):undefined}
                    aria-sort={sort?.key===col.key?(sort.dir==='asc'?'ascending':'descending'):undefined}>
                  {col.header}
                  {col.sortable && <span style={{marginLeft:5,opacity:sort?.key===col.key?1:.3,fontSize:'.6rem'}}>
                    {sort?.key===col.key?(sort.dir==='asc'?'▲':'▼'):'⇅'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row,i)=>(
              <tr key={rowKey(row,i)}
                  className={onRowClick?'am-clickable':''}
                  onClick={onRowClick?()=>onRowClick(row):undefined}>
                {columns.map(col=>(
                  <td key={col.key} style={{textAlign:col.align||'left'}}>
                    {col.render?col.render(row):row[col.key]??'—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── Modal ───────────────────────────────────────────────────────────────────
export function Modal({open, onClose, title, children, footer, width=560}){
  const ref = useRef(null)
  useEffect(()=>{
    if(!open) return
    const onKey = e => { if(e.key==='Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // focus the dialog for screen readers / keyboard
    setTimeout(()=>ref.current?.focus(), 0)
    return ()=>{ document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  },[open,onClose])

  if(!open) return null
  return (
    <div className="am-modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}>
      <div className="am-modal" style={{maxWidth:width}} role="dialog" aria-modal="true"
           aria-label={typeof title==='string'?title:'Dialog'} tabIndex={-1} ref={ref}>
        {title && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,
            padding:'18px 22px',borderBottom:'1px solid var(--border)'}}>
            <div style={{fontSize:'1.02rem',fontWeight:800,color:'var(--text-1)'}}>{title}</div>
            <button onClick={onClose} aria-label="Close" style={{background:'none',border:'none',
              fontSize:'1.4rem',lineHeight:1,color:'var(--text-muted)',cursor:'pointer',padding:'2px 6px',borderRadius:6}}>×</button>
          </div>
        )}
        <div style={{padding:'22px',overflowY:'auto'}}>{children}</div>
        {footer && (
          <div style={{display:'flex',justifyContent:'flex-end',gap:10,padding:'16px 22px',
            borderTop:'1px solid var(--border)',background:'var(--bg-subtle)',borderRadius:'0 0 var(--r-xl) var(--r-xl)'}}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Form primitives ─────────────────────────────────────────────────────────
export function FormField({label, error, help, required, htmlFor, children}){
  return (
    <div style={{marginBottom:16}}>
      {label && <label htmlFor={htmlFor} style={{display:'block',fontSize:'.76rem',fontWeight:600,
        color:'var(--text-2)',marginBottom:6}}>
        {label}{required && <span style={{color:'var(--danger)',marginLeft:3}}>*</span>}
      </label>}
      {children}
      {error && <div style={{fontSize:'.72rem',color:'var(--danger)',marginTop:5}}>{error}</div>}
      {!error && help && <div style={{fontSize:'.72rem',color:'var(--text-muted)',marginTop:5}}>{help}</div>}
    </div>
  )
}
export const Input = React.forwardRef((p,ref)=><input ref={ref} className="am-input" {...p}/>)
export const Select = React.forwardRef(({children,...p},ref)=><select ref={ref} className="am-select" {...p}>{children}</select>)
export const Textarea = React.forwardRef((p,ref)=><textarea ref={ref} className="am-textarea" {...p}/>)

// ── SectionTitle ────────────────────────────────────────────────────────────
export function SectionTitle({children, action}){
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,margin:'4px 0 12px'}}>
      <div style={{fontSize:'.85rem',fontWeight:700,color:'var(--text-1)'}}>{children}</div>
      {action}
    </div>
  )
}
