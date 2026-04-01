import React from 'react'
import ReactDOM from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import App from './App'

const qc=new QueryClient({defaultOptions:{queries:{staleTime:60000,refetchOnWindowFocus:false,retry:1}}})

// CSS variables & global styles
const style=document.createElement('style')
style.textContent=`
  :root {
    --bg-base: #0f1117;
    --bg-surface: #1a1d27;
    --border: #2a2d3a;
    --teal: #14b8a6;
    --text-1: #f1f5f9;
    --text-muted: #64748b;
    --r-sm: 8px;
    --r-lg: 12px;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg-base);
    color: var(--text-1);
    -webkit-font-smoothing: antialiased;
  }
  #root { display:flex; min-height:100vh; }
  ::-webkit-scrollbar { width:6px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:#2a2d3a; border-radius:3px; }
  ::-webkit-scrollbar-thumb:hover { background:#3a3d4a; }
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
  <QueryClientProvider client={qc}>
    <App/>
  </QueryClientProvider>
)
