import {useState,useCallback} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api} from './api'
import Sidebar from './components/Sidebar'
import LeadModal from './components/LeadModal'
import Login from './pages/Login'
import Analytics from './pages/Analytics'
import Leads from './pages/Leads'
import Pipeline from './pages/Pipeline'
import Signals from './pages/Signals'
import Today from './pages/Today'
import Automation from './pages/Automation'
import Contracts from './pages/Contracts'
import Quotes from './pages/Quotes'
import OutreachQueue from './pages/OutreachQueue'
import Email from './pages/Email'
import Finance from './pages/Finance'
import Operations from './pages/Operations'
import Cleaners from './pages/Cleaners'
import Quality from './pages/Quality'
import Payroll from './pages/Payroll'
import SEOContent from './pages/SEOContent'

export default function App(){
  const [tab,setTab]=useState('analytics')
  const [selectedLead,setSelectedLead]=useState(null)

  // Auth status
  const {data:auth,isLoading:authLoading}=useQuery({queryKey:['auth'],queryFn:api.authStatus,staleTime:300000,retry:false})
  const user=auth?.user

  // Hooks must be called before any conditional returns
  const openLead=useCallback(async(entityId)=>{
    if(!entityId)return
    try{
      const lead=await api.lead(entityId)
      if(lead&&(lead.entity_id||lead.place_id))setSelectedLead(lead)
    }catch(e){console.warn('Lead not found',entityId,e)}
  },[])

  // Auth guard — show login screen if auth is required and user is not authenticated
  if(authLoading){
    return(
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-base)'}}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'1.2rem',fontWeight:800,letterSpacing:'-0.03em',marginBottom:8}}>
            <span style={{color:'var(--text-1)'}}>Ask</span><span style={{color:'var(--teal)'}}>Miro</span>
          </div>
          <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>Loading...</div>
        </div>
      </div>
    )
  }

  if(auth?.auth_required && !auth?.authenticated){
    return <Login/>
  }

  return(
    <>
      <Sidebar tab={tab} setTab={setTab} user={user}/>
      <main style={{flex:1,overflowY:'auto',background:'var(--bg-base)',display:'flex',flexDirection:'column'}}>
        {tab==='analytics'&&<Analytics openLead={openLead} setTab={setTab}/>}
        {tab==='leads'&&<Leads openLead={openLead}/>}
        {tab==='pipeline'&&<Pipeline openLead={openLead}/>}
        {tab==='signals'&&<Signals openLead={openLead}/>}
        {tab==='outreach'&&<OutreachQueue openLead={openLead}/>}
        {tab==='email'&&<Email openLead={openLead}/>}
        {tab==='today'&&<Today/>}
        {tab==='quotes'&&<Quotes openLead={openLead}/>}
        {tab==='contracts'&&<Contracts openLead={openLead}/>}
        {tab==='finance'&&<Finance/>}
        {tab==='operations'&&<Operations openLead={openLead}/>}
        {tab==='cleaners'&&<Cleaners/>}
        {tab==='quality'&&<Quality/>}
        {tab==='payroll'&&<Payroll/>}
        {tab==='seo'&&<SEOContent/>}
        {tab==='automation'&&<Automation/>}
      </main>
      <LeadModal lead={selectedLead} onClose={()=>setSelectedLead(null)}/>
    </>
  )
}
