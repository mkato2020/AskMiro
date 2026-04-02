import {useState} from 'react'

const NAV=[
  {id:'analytics',label:'Dashboard',icon:'📊'},
  {id:'pipeline',label:'CRM',icon:'🎯'},
  {id:'outreach',label:'Outreach',icon:'🚀'},
  {id:'quotes',label:'Quotes',icon:'💰'},
  {id:'contracts',label:'Contracts',icon:'📋'},
  {sep:true},
  {id:'operations',label:'Operations',icon:'🏢'},
  {id:'quality',label:'Quality',icon:'✅'},
  {id:'finance',label:'Finance',icon:'💷'},
  {id:'email',label:'Email',icon:'📧'},
  {id:'payroll',label:'Payroll',icon:'👤'},
  {id:'cleaners',label:'Cleaners',icon:'🧹'},
  {sep:true},
  {id:'seo',label:'SEO Content',icon:'📝'},
  {id:'automation',label:'Admin',icon:'⚙️'},
]

export default function Sidebar({tab,setTab,user}){
  const [collapsed,setCollapsed]=useState(false)

  return(
    <aside style={{
      width:collapsed?68:200,
      minHeight:'100vh',
      background:'#161a28',
      display:'flex',
      flexDirection:'column',
      transition:'width 0.2s ease',
      flexShrink:0,
      overflow:'hidden',
    }}>
      {/* Logo */}
      <div style={{padding:collapsed?'20px 14px':'20px 20px',display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}
        onClick={()=>setCollapsed(!collapsed)}>
        <div style={{
          width:32,height:32,borderRadius:8,flexShrink:0,
          background:'linear-gradient(135deg, var(--teal), #059669)',
          display:'flex',alignItems:'center',justifyContent:'center',
        }}>
          <svg width="16" height="12" viewBox="0 0 18 14" fill="none">
            <path d="M1 13L4.5 5L8 9L11.5 5L15 13" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        {!collapsed&&(
          <div>
            <div style={{fontSize:'1rem',fontWeight:800,letterSpacing:'-0.03em',lineHeight:1.1}}>
              <span style={{color:'white'}}>Ask</span>
              <span style={{color:'var(--teal)'}}>Miro</span>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{flex:1,padding:'8px 8px',display:'flex',flexDirection:'column',gap:2}}>
        {NAV.map((item,i)=>{
          if(item.sep)return <div key={i} style={{height:1,background:'#232840',margin:'8px 0'}}/>
          const active=tab===item.id||(item.id==='pipeline'&&(tab==='leads'||tab==='signals'||tab==='today'))
          return(
            <button key={item.id} onClick={()=>setTab(item.id)} style={{
              display:'flex',alignItems:'center',gap:10,
              padding:collapsed?'10px 0':'10px 12px',
              justifyContent:collapsed?'center':'flex-start',
              border:'none',borderRadius:8,cursor:'pointer',
              background:active?'var(--teal)':'transparent',
              color:active?'white':'#9ca3af',
              fontSize:'0.82rem',fontWeight:active?700:500,
              transition:'all 0.15s',
              width:'100%',
            }}
              onMouseOver={e=>{if(!active)e.currentTarget.style.background='#232840'}}
              onMouseOut={e=>{if(!active)e.currentTarget.style.background='transparent'}}
            >
              <span style={{fontSize:'1rem',width:20,textAlign:'center'}}>{item.icon}</span>
              {!collapsed&&<span>{item.label}</span>}
              {item.id==='quotes'&&!collapsed&&<span style={{marginLeft:'auto',background:'#ef4444',color:'white',borderRadius:10,padding:'1px 6px',fontSize:'0.6rem',fontWeight:700}}>1</span>}
            </button>
          )
        })}
      </nav>

      {/* Sub-nav for CRM */}
      {!collapsed&&(tab==='pipeline'||tab==='leads'||tab==='signals'||tab==='today')&&(
        <div style={{padding:'0 8px 8px'}}>
          <div style={{fontSize:'0.65rem',fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.08em',padding:'4px 12px',marginBottom:4}}>CRM Views</div>
          {[
            {id:'pipeline',label:'Pipeline'},
            {id:'leads',label:'Lead List'},
            {id:'signals',label:'Signals'},
            {id:'today',label:'Today'},
          ].map(s=>(
            <button key={s.id} onClick={()=>setTab(s.id)} style={{
              display:'block',width:'100%',textAlign:'left',
              padding:'7px 12px 7px 28px',border:'none',borderRadius:6,cursor:'pointer',
              background:tab===s.id?'#232840':'transparent',
              color:tab===s.id?'white':'#6b7280',
              fontSize:'0.78rem',fontWeight:tab===s.id?600:400,
            }}>{s.label}</button>
          ))}
        </div>
      )}

      {/* User */}
      {user&&(
        <div style={{padding:collapsed?'16px 8px':'16px 16px',borderTop:'1px solid #232840',display:'flex',alignItems:'center',gap:10}}>
          {user.picture?(
            <img src={user.picture} alt="" style={{width:28,height:28,borderRadius:14}}/>
          ):(
            <div style={{width:28,height:28,borderRadius:14,background:'var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:'0.7rem',fontWeight:700,flexShrink:0}}>
              {(user.name||user.email||'U').charAt(0).toUpperCase()}
            </div>
          )}
          {!collapsed&&(
            <div style={{overflow:'hidden'}}>
              <div style={{fontSize:'0.78rem',fontWeight:600,color:'white',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{user.name||'User'}</div>
              <div style={{fontSize:'0.65rem',color:'#6b7280',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{user.email||''}</div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
