// ════════════════════════════════════════════════════════════════════════════
// AskMiro OS — Toast notifications
// ────────────────────────────────────────────────────────────────────────────
// Accessible (aria-live), auto-dismissing, stacked, animated notifications.
// Wrap the app once in <ToastProvider>; call useToast() anywhere to fire
// success / error / info messages. This closes the "mutations succeed or fail
// silently" gap — every create/update/delete now gives the operator feedback.
// ════════════════════════════════════════════════════════════════════════════
import React, {createContext, useContext, useCallback, useState, useRef} from 'react'

const ToastCtx = createContext(null)

const TONES = {
  success: {bg:'var(--success)', icon:'✓'},
  error:   {bg:'var(--danger)',  icon:'!'},
  info:    {bg:'var(--info)',    icon:'i'},
  warning: {bg:'var(--warning)', icon:'⚠'},
}

let _id = 0

export function ToastProvider({children}){
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id)=>{
    setToasts(t=>t.filter(x=>x.id!==id))
    if(timers.current[id]){ clearTimeout(timers.current[id]); delete timers.current[id] }
  },[])

  const push = useCallback((type, message, opts={})=>{
    const id = ++_id
    const ttl = opts.duration ?? (type==='error'?6000:4000)
    setToasts(t=>[...t, {id, type, message}])
    if(ttl>0) timers.current[id] = setTimeout(()=>dismiss(id), ttl)
    return id
  },[dismiss])

  const api = {
    success:(m,o)=>push('success',m,o),
    error:  (m,o)=>push('error',m,o),
    info:   (m,o)=>push('info',m,o),
    warning:(m,o)=>push('warning',m,o),
    dismiss,
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" style={{position:'fixed',right:20,bottom:20,zIndex:2000,
        display:'flex',flexDirection:'column',gap:10,maxWidth:380,pointerEvents:'none'}}>
        {toasts.map(t=>{
          const tone = TONES[t.type] || TONES.info
          return (
            <div key={t.id} role="status" onClick={()=>dismiss(t.id)}
              style={{pointerEvents:'auto',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:11,
                background:'var(--bg-surface)',border:'1px solid var(--border)',borderLeft:`4px solid ${tone.bg}`,
                borderRadius:'var(--r-md)',boxShadow:'var(--shadow-lg)',padding:'13px 15px',
                animation:'am-toast-in .22s cubic-bezier(.16,1,.3,1)'}}>
              <span style={{flexShrink:0,width:20,height:20,borderRadius:'50%',background:tone.bg,color:'#fff',
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.72rem',fontWeight:800,marginTop:1}}>
                {tone.icon}</span>
              <span style={{fontSize:'.83rem',color:'var(--text-1)',lineHeight:1.45,fontWeight:500}}>{t.message}</span>
            </div>
          )
        })}
        <style>{`@keyframes am-toast-in{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}`}</style>
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(){
  const ctx = useContext(ToastCtx)
  if(!ctx){
    // Fail-safe: never crash a page if provider is missing — log instead.
    return {success:(m)=>console.log('[toast]',m), error:(m)=>console.warn('[toast]',m),
            info:(m)=>console.log('[toast]',m), warning:(m)=>console.warn('[toast]',m), dismiss:()=>{}}
  }
  return ctx
}
