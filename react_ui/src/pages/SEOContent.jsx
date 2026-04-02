import {useState,useCallback} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../api'
import {formatDate} from '../utils'
import Spinner from '../components/Spinner'

const TYPE_STYLE={
  blog:    {bg:'#EFF6FF',color:'#2563EB',label:'Blog'},
  page:    {bg:'#ECFDF5',color:'#059669',label:'Page'},
  social:  {bg:'#F5F3FF',color:'#7C3AED',label:'Social'},
  email:   {bg:'#FFFBEB',color:'#D97706',label:'Email'},
  landing: {bg:'#FFF1F2',color:'#E11D48',label:'Landing'},
}
const STATUS_STYLE={
  draft:     {bg:'#F1F5F9',color:'#64748B',label:'Draft'},
  published: {bg:'#ECFDF5',color:'#059669',label:'Published'},
  scheduled: {bg:'#EFF6FF',color:'#2563EB',label:'Scheduled'},
  review:    {bg:'#FFFBEB',color:'#D97706',label:'Review'},
}
const INTENT_STYLE={
  informational:{bg:'rgba(59,130,246,0.12)',color:'#3B82F6',border:'1px solid rgba(59,130,246,0.25)'},
  commercial:   {bg:'rgba(139,92,246,0.12)',color:'#8B5CF6',border:'1px solid rgba(139,92,246,0.25)'},
  transactional:{bg:'rgba(5,150,105,0.12)',color:'#059669',border:'1px solid rgba(5,150,105,0.25)'},
}

const card={background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'22px 24px'}
const btnBase={border:'none',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:'0.8rem',transition:'opacity .15s'}

export default function SEOContent(){
  const qc=useQueryClient()
  const [search,setSearch]=useState('')
  const [typeFilter,setTypeFilter]=useState('all')
  const [customKw,setCustomKw]=useState('')

  // Generation flow: idle | loading | result | published
  const [genState,setGenState]=useState('idle')
  const [genKeyword,setGenKeyword]=useState('')
  const [genResult,setGenResult]=useState(null)
  const [genError,setGenError]=useState(null)
  const [publishResult,setPublishResult]=useState(null)

  // Keyword suggestions
  const [suggestions,setSuggestions]=useState(null)
  const [sugLoading,setSugLoading]=useState(false)

  const {data,isLoading}=useQuery({queryKey:['seo-content'],queryFn:api.seoContent,staleTime:60000})
  const seo=data||{}

  const content=(Array.isArray(seo.content)?seo.content:[]).filter(c=>{
    if(typeFilter!=='all'&&c.content_type!==typeFilter)return false
    if(!search)return true
    const q=search.toLowerCase()
    return (c.title||'').toLowerCase().includes(q)||(c.target_keyword||'').toLowerCase().includes(q)
  })

  const publishMut=useMutation({
    mutationFn:(id)=>api.publishArticle(id),
    onSuccess:(res)=>{
      setGenState('published')
      setPublishResult(res)
      qc.invalidateQueries({queryKey:['seo-content']})
    }
  })

  const fetchSuggestions=useCallback(async()=>{
    setSugLoading(true)
    try{
      const res=await api.seoGenerate({mode:'suggest'})
      setSuggestions(res.keywords||res.suggestions||[])
    }catch(e){setSuggestions([])}
    finally{setSugLoading(false)}
  },[])

  const generateArticle=useCallback(async(keyword)=>{
    if(!keyword?.trim())return
    setGenState('loading')
    setGenKeyword(keyword.trim())
    setGenResult(null)
    setGenError(null)
    setPublishResult(null)
    try{
      const res=await api.seoGenerate({mode:'article',keyword:keyword.trim()})
      setGenResult(res)
      setGenState('result')
    }catch(e){
      setGenError(e.message||'Generation failed')
      setGenState('idle')
    }
  },[])

  const handlePublish=useCallback(()=>{
    if(!genResult?.id)return
    publishMut.mutate(genResult.id)
  },[genResult,publishMut])

  const downloadHtml=useCallback(()=>{
    if(!genResult?.html)return
    const blob=new Blob([genResult.html],{type:'text/html'})
    const a=document.createElement('a')
    a.href=URL.createObjectURL(blob)
    a.download=genResult.filename||'article.html'
    a.click()
    URL.revokeObjectURL(a.href)
  },[genResult])

  const copyHtml=useCallback(()=>{
    if(!genResult?.html)return
    navigator.clipboard.writeText(genResult.html)
  },[genResult])

  // ---------- RENDER ----------

  return(
    <div style={{padding:'28px 32px',maxWidth:1140,margin:'0 auto'}}>

      {/* Header */}
      <div style={{marginBottom:8}}>
        <h1 style={{fontSize:'1.5rem',fontWeight:800,letterSpacing:'-.02em',margin:0}}>SEO Content Engine</h1>
        <p style={{fontSize:'0.875rem',color:'var(--text-3)',marginTop:4}}>AI-powered content generation &amp; publishing</p>
      </div>

      {/* KPI strip */}
      <div style={{display:'flex',gap:16,marginBottom:28,flexWrap:'wrap'}}>
        {[
          {l:'Published',v:seo.published||0,c:'var(--teal)'},
          {l:'Drafts',v:seo.drafts||0},
          {l:'Keywords Tracked',v:seo.keywords_tracked||0},
          {l:'Avg Position',v:seo.avg_position!=null?seo.avg_position:'--'},
        ].map((k,i)=>(
          <div key={i} style={{flex:1,minWidth:140,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'18px 20px'}}>
            <div style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:'1.4rem',fontWeight:800,color:k.c||'var(--text-1)'}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* ============ SECTION 1: Content Generator ============ */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:28}}>

        {/* Left: Keyword Suggestions */}
        <div style={card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <h3 style={{margin:0,fontSize:'0.95rem',fontWeight:700}}>Keyword Ideas</h3>
            <button onClick={fetchSuggestions} style={{...btnBase,padding:'6px 14px',background:'var(--bg-surface)',border:'1px solid var(--border)',color:'var(--text-2)'}}>
              Refresh
            </button>
          </div>

          {sugLoading&&<div style={{textAlign:'center',padding:32}}><Spinner size={20}/></div>}

          {!sugLoading&&suggestions===null&&(
            <div style={{padding:'24px 0',textAlign:'center',color:'var(--text-muted)',fontSize:'0.82rem'}}>
              Click <strong>Refresh</strong> to get AI-suggested keywords for your cleaning business.
            </div>
          )}

          {!sugLoading&&suggestions!==null&&suggestions.length===0&&(
            <div style={{padding:'24px 0',textAlign:'center',color:'var(--text-muted)',fontSize:'0.82rem'}}>No suggestions returned. Try again.</div>
          )}

          {!sugLoading&&suggestions&&suggestions.length>0&&(
            <>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {suggestions.map((s,i)=>{
                  const kw=typeof s==='string'?s:s.keyword
                  const intent=typeof s==='string'?'informational':(s.intent||'informational')
                  const st=INTENT_STYLE[intent]||INTENT_STYLE.informational
                  return(
                    <button key={i} onClick={()=>generateArticle(kw)} style={{
                      ...btnBase,padding:'6px 14px',fontSize:'0.75rem',fontWeight:600,
                      background:st.bg,color:st.color,border:st.border,borderRadius:20,
                    }}>{kw}</button>
                  )
                })}
              </div>
              <div style={{display:'flex',gap:16,marginTop:14,fontSize:'0.68rem',color:'var(--text-muted)'}}>
                <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#3B82F6',marginRight:4,verticalAlign:'middle'}}/> Informational</span>
                <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#8B5CF6',marginRight:4,verticalAlign:'middle'}}/> Commercial</span>
                <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#059669',marginRight:4,verticalAlign:'middle'}}/> Transactional</span>
              </div>
            </>
          )}
        </div>

        {/* Right column */}
        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* Custom Input Card */}
          <div style={card}>
            <label style={{fontSize:'0.75rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8,display:'block'}}>Custom Keyword</label>
            <div style={{display:'flex',gap:10}}>
              <input
                className="form-input"
                placeholder="e.g. gym cleaning services london"
                value={customKw}
                onChange={e=>setCustomKw(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')generateArticle(customKw)}}
                style={{flex:1}}
              />
              <button onClick={()=>generateArticle(customKw)} disabled={!customKw.trim()} style={{
                ...btnBase,padding:'8px 18px',background:'var(--teal)',color:'#fff',opacity:customKw.trim()?1:0.5,
              }}>Generate Article</button>
            </div>
          </div>

          {/* How It Works */}
          <div style={card}>
            <h3 style={{margin:'0 0 12px',fontSize:'0.9rem',fontWeight:700}}>How It Works</h3>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {[
                'Pick a keyword or type your own',
                'Claude writes the full article (15\u201325s)',
                'Click Publish to Site',
                'GitHub commit is created automatically',
                'Netlify deploys in ~60 seconds',
                'Google is notified to crawl it',
              ].map((step,i)=>(
                <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:'0.8rem',color:'var(--text-2)'}}>
                  <span style={{
                    minWidth:22,height:22,borderRadius:'50%',background:'rgba(13,189,173,0.12)',color:'var(--teal)',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:800,
                  }}>{i+1}</span>
                  <span style={{paddingTop:2}}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ============ Generation Panel ============ */}
      {genState==='loading'&&(
        <div style={{...card,marginBottom:28,textAlign:'center',padding:'40px 24px'}}>
          <Spinner size={28}/>
          <div style={{marginTop:12,fontSize:'0.9rem',fontWeight:600,color:'var(--text-2)'}}>
            Generating article for &lsquo;{genKeyword}&rsquo;&hellip;
          </div>
          <div style={{marginTop:6,fontSize:'0.75rem',color:'var(--text-muted)'}}>This usually takes 15&ndash;25 seconds</div>
        </div>
      )}

      {genState==='result'&&genResult&&(
        <div style={{...card,marginBottom:28,padding:0,overflow:'hidden'}}>
          {/* Success header */}
          <div style={{background:'linear-gradient(135deg,#059669 0%,#0DBDAD 100%)',padding:'18px 24px',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:'1.3rem'}}>&#10003;</span>
            <div>
              <div style={{fontWeight:800,fontSize:'0.95rem',color:'#fff'}}>{genResult.title||'Article Generated'}</div>
              <div style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.8)',marginTop:2}}>Ready to publish</div>
            </div>
          </div>

          <div style={{padding:'20px 24px'}}>
            {/* File info */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,marginBottom:20}}>
              <div>
                <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Filename</div>
                <div style={{fontSize:'0.82rem',fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{genResult.filename||'article.html'}</div>
              </div>
              <div>
                <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>URL Path</div>
                <div style={{fontSize:'0.82rem',fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{genResult.slug||'/'+genKeyword.toLowerCase().replace(/\s+/g,'-')}</div>
              </div>
              <div>
                <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Word Count</div>
                <div style={{fontSize:'0.82rem',fontWeight:600}}>{genResult.word_count||'--'} words</div>
              </div>
            </div>

            {/* Primary action */}
            <button onClick={handlePublish} disabled={publishMut.isPending} style={{
              ...btnBase,width:'100%',padding:'14px 20px',fontSize:'0.9rem',
              background:'#1a1a2e',color:'#fff',marginBottom:10,borderRadius:10,
              opacity:publishMut.isPending?0.6:1,
            }}>
              {publishMut.isPending?'Pushing to GitHub\u2026':'Push to GitHub'}
            </button>
            <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginBottom:18,textAlign:'center'}}>
              Commits the HTML to your repo + updates sitemap.xml. Live in ~60 seconds.
            </div>

            {/* Secondary actions */}
            <div style={{display:'flex',gap:10}}>
              {genResult.preview_url&&(
                <a href={genResult.preview_url} target="_blank" rel="noreferrer" style={{
                  ...btnBase,padding:'8px 16px',background:'var(--bg-surface)',border:'1px solid var(--border)',
                  color:'var(--text-2)',textDecoration:'none',display:'inline-block',
                }}>Preview</a>
              )}
              <button onClick={downloadHtml} style={{...btnBase,padding:'8px 16px',background:'var(--bg-surface)',border:'1px solid var(--border)',color:'var(--text-2)'}}>
                Download HTML
              </button>
              <button onClick={copyHtml} style={{...btnBase,padding:'8px 16px',background:'var(--bg-surface)',border:'1px solid var(--border)',color:'var(--text-2)'}}>
                Copy HTML
              </button>
            </div>

            {/* Info box */}
            <div style={{marginTop:18,padding:'14px 16px',background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.15)',borderRadius:8,fontSize:'0.75rem',color:'var(--text-2)',lineHeight:1.6}}>
              <strong>Google Search Console:</strong> After publishing, submit the URL in Search Console &rarr; URL Inspection &rarr; Request Indexing for fastest crawling.
            </div>
          </div>

          {genError&&<div style={{padding:'12px 24px 20px',color:'#DC2626',fontSize:'0.82rem',fontWeight:600}}>{genError}</div>}
        </div>
      )}

      {genState==='published'&&(
        <div style={{...card,marginBottom:28,padding:0,overflow:'hidden'}}>
          <div style={{background:'linear-gradient(135deg,#059669 0%,#10b981 100%)',padding:'18px 24px'}}>
            <div style={{fontWeight:800,fontSize:'0.95rem',color:'#fff'}}>Page created! Netlify is deploying&hellip;</div>
            <div style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.8)',marginTop:2}}>Your page will be live in ~60 seconds</div>
          </div>

          <div style={{padding:'20px 24px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,marginBottom:20}}>
              <div>
                <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Live URL</div>
                <a href={publishResult?.live_url||genResult?.live_url||'#'} target="_blank" rel="noreferrer" style={{fontSize:'0.82rem',fontWeight:600,color:'var(--teal)',wordBreak:'break-all'}}>
                  {publishResult?.live_url||genResult?.live_url||'--'}
                </a>
              </div>
              <div>
                <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Filename</div>
                <div style={{fontSize:'0.82rem',fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{genResult?.filename||'--'}</div>
              </div>
              <div>
                <div style={{fontSize:'0.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Status</div>
                <span style={{background:'#ECFDF5',color:'#059669',fontSize:'0.72rem',fontWeight:700,padding:'3px 12px',borderRadius:20}}>Published</span>
              </div>
            </div>

            <div style={{display:'flex',gap:10}}>
              <a href={publishResult?.live_url||genResult?.live_url||'#'} target="_blank" rel="noreferrer" style={{
                ...btnBase,padding:'10px 20px',background:'var(--teal)',color:'#fff',textDecoration:'none',display:'inline-block',
              }}>Open Live Page</a>
              {(publishResult?.github_commit_url||genResult?.github_commit_url)&&(
                <a href={publishResult?.github_commit_url||genResult?.github_commit_url} target="_blank" rel="noreferrer" style={{
                  ...btnBase,padding:'10px 20px',background:'var(--bg-surface)',border:'1px solid var(--border)',color:'var(--text-2)',textDecoration:'none',display:'inline-block',
                }}>View Commit</a>
              )}
              <button onClick={downloadHtml} style={{...btnBase,padding:'10px 20px',background:'var(--bg-surface)',border:'1px solid var(--border)',color:'var(--text-2)'}}>
                Download HTML
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ SECTION 2: Content Library ============ */}
      <div style={{marginBottom:16}}>
        <h2 style={{fontSize:'1.1rem',fontWeight:800,margin:'0 0 16px',letterSpacing:'-.01em'}}>Content Library</h2>
        <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:4}}>
            {[{v:'all',l:'All'},{v:'blog',l:'Blog'},{v:'page',l:'Pages'},{v:'social',l:'Social'},{v:'landing',l:'Landing'}].map(f=>(
              <button key={f.v} onClick={()=>setTypeFilter(f.v)} style={{
                padding:'6px 14px',fontSize:'0.75rem',fontWeight:typeFilter===f.v?700:500,
                background:typeFilter===f.v?'var(--teal)':'var(--bg-surface)',
                color:typeFilter===f.v?'white':'var(--text-2)',
                border:'1px solid var(--border)',borderRadius:20,cursor:'pointer',transition:'all .15s',
              }}>{f.l}</button>
            ))}
          </div>
          <input className="form-input" placeholder="Search content\u2026" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:300}}/>
        </div>
      </div>

      {isLoading&&<div style={{textAlign:'center',padding:60}}><Spinner/></div>}

      {!isLoading&&content.length===0&&(
        <div style={{padding:60,textAlign:'center',color:'var(--text-muted)',fontSize:'0.85rem'}}>No content matches your filters.</div>
      )}

      {!isLoading&&content.length>0&&(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)'}}>
                {['Title','Type','Keyword','Status','Words','Published','Actions'].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.map((c,i)=>{
                const tp=TYPE_STYLE[c.content_type]||TYPE_STYLE.blog
                const st=STATUS_STYLE[c.status]||STATUS_STYLE.draft
                return(
                  <tr key={c.id||i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'12px 16px',fontWeight:700,fontSize:'0.85rem',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.title||'\u2014'}</td>
                    <td style={{padding:'12px 16px'}}>
                      <span style={{background:tp.bg,color:tp.color,fontSize:'0.7rem',fontWeight:700,padding:'3px 10px',borderRadius:20}}>{tp.label}</span>
                    </td>
                    <td style={{padding:'12px 16px',fontSize:'0.78rem',color:'var(--text-2)',fontFamily:"'JetBrains Mono',monospace"}}>{c.target_keyword||'\u2014'}</td>
                    <td style={{padding:'12px 16px'}}>
                      <span style={{background:st.bg,color:st.color,fontSize:'0.7rem',fontWeight:700,padding:'3px 10px',borderRadius:20}}>{st.label}</span>
                    </td>
                    <td style={{padding:'12px 16px',fontSize:'0.8rem',color:'var(--text-muted)'}}>{c.word_count||'\u2014'}</td>
                    <td style={{padding:'12px 16px',fontSize:'0.8rem',color:'var(--text-muted)'}}>{formatDate(c.published_at)}</td>
                    <td style={{padding:'12px 16px'}}>
                      <div style={{display:'flex',gap:6}}>
                        {c.status==='draft'&&(
                          <button onClick={()=>publishMut.mutate(c.id)} style={{
                            ...btnBase,padding:'5px 12px',fontSize:'0.72rem',background:'var(--teal)',color:'#fff',
                          }}>Publish</button>
                        )}
                        {c.status==='published'&&c.live_url&&(
                          <a href={c.live_url} target="_blank" rel="noreferrer" style={{
                            ...btnBase,padding:'5px 12px',fontSize:'0.72rem',background:'rgba(5,150,105,0.1)',color:'#059669',
                            textDecoration:'none',display:'inline-block',border:'1px solid rgba(5,150,105,0.2)',
                          }}>View Live</a>
                        )}
                        <button style={{
                          ...btnBase,padding:'5px 12px',fontSize:'0.72rem',background:'var(--bg-surface)',
                          border:'1px solid var(--border)',color:'var(--text-muted)',
                        }}>Edit</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
