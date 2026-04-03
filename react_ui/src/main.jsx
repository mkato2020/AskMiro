import React from 'react'
import ReactDOM from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import App from './App'

const qc=new QueryClient({defaultOptions:{queries:{staleTime:60000,refetchOnWindowFocus:false,retry:1}}})

// ── Error Boundary — prevents blank screen on ANY uncaught error ──────────
class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={hasError:false,error:null,errorInfo:null}}
  static getDerivedStateFromError(error){return{hasError:true,error}}
  componentDidCatch(error,errorInfo){
    this.setState({errorInfo})
    console.error('[AskMiro ErrorBoundary]',error,errorInfo)
  }
  render(){
    if(this.state.hasError){
      return(
        <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#F8FAFC',padding:40}}>
          <div style={{maxWidth:500,textAlign:'center'}}>
            <div style={{fontSize:'2rem',marginBottom:16}}>&#9888;&#65039;</div>
            <div style={{fontSize:'1.1rem',fontWeight:800,color:'#1F2937',marginBottom:8}}>
              <span>Ask</span><span style={{color:'#0D9488'}}>Miro</span> — Something went wrong
            </div>
            <div style={{fontSize:'0.85rem',color:'#6B7280',lineHeight:1.6,marginBottom:20}}>
              The app encountered an error. This has been logged. Try refreshing the page.
            </div>
            <div style={{padding:16,background:'#FFFFFF',borderRadius:8,border:'1px solid #E5E7EB',textAlign:'left',marginBottom:20}}>
              <div style={{fontSize:'0.72rem',color:'#ef4444',fontFamily:'monospace',wordBreak:'break-all'}}>
                {this.state.error?.message||'Unknown error'}
              </div>
              {this.state.errorInfo?.componentStack&&(
                <details style={{marginTop:8}}>
                  <summary style={{fontSize:'0.7rem',color:'#64748b',cursor:'pointer'}}>Component stack</summary>
                  <pre style={{fontSize:'0.65rem',color:'#64748b',whiteSpace:'pre-wrap',marginTop:8,maxHeight:200,overflow:'auto'}}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
            <button onClick={()=>{this.setState({hasError:false,error:null,errorInfo:null})}} style={{
              padding:'10px 24px',borderRadius:8,border:'none',
              background:'#14b8a6',color:'white',fontSize:'0.85rem',fontWeight:600,cursor:'pointer',marginRight:8,
            }}>Try Again</button>
            <button onClick={()=>window.location.reload()} style={{
              padding:'10px 24px',borderRadius:8,border:'1px solid #2a2d3a',
              background:'transparent',color:'#f1f5f9',fontSize:'0.85rem',fontWeight:600,cursor:'pointer',
            }}>Reload Page</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// CSS variables & global styles
const style=document.createElement('style')
style.textContent=`
  :root {
    --bg-base: #F8FAFC;
    --bg-surface: #FFFFFF;
    --border: #E5E7EB;
    --teal: #0D9488;
    --text-1: #1F2937;
    --text-2: #374151;
    --text-muted: #6B7280;
    --r-sm: 8px;
    --r-lg: 12px;
    --shadow: 0 1px 3px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.04);
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg-base);
    color: var(--text-1);
    -webkit-font-smoothing: antialiased;
  }
  #root { display:flex; height:100vh; overflow:hidden; }
  ::-webkit-scrollbar { width:6px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:#CBD5E1; border-radius:3px; }
  ::-webkit-scrollbar-thumb:hover { background:#94A3B8; }
  input, select, textarea, button { font-family: inherit; }
  a { color: var(--teal); text-decoration: none; }
`
document.head.appendChild(style)

// Load Inter font
const link=document.createElement('link')
link.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
link.rel='stylesheet'
document.head.appendChild(link)

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <QueryClientProvider client={qc}>
      <App/>
    </QueryClientProvider>
  </ErrorBoundary>
)
