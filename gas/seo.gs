// ============================================================
// SEO ARTICLE GENERATOR
// Runs in GAS (no 10s timeout) — calls Anthropic, builds HTML
// ============================================================
function seoGenerate(body, auth) {
  var keyword = (body.keyword || '').trim();
  if (!keyword) return { error: 'Missing keyword' };

  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not set in GAS Script Properties. Go to Project Settings → Script Properties and add it.' };

  var today = new Date().toISOString().split('T')[0];
  var year  = new Date().getFullYear();

  var prompt = 'You are an expert SEO content writer for AskMiro Cleaning Services, a professional B2B commercial cleaning company in London.\n\n' +
    'Company facts:\n' +
    '- Director: Mike Kato | info@askmiro.com | 020 8073 0621 | www.askmiro.co.uk\n' +
    '- Typical contract: £800–£5,000/month\n' +
    '- Services: office, commercial, end of tenancy, deep cleaning, residential blocks, medical/healthcare, schools, automotive, warehouses, gyms, retail, hospitality\n' +
    '- All staff: DBS-checked, BICSc trained, uniformed, insured\n' +
    '- £10M public liability insurance, COSHH-compliant\n' +
    '- Fixed monthly rates, no hidden charges\n' +
    '- Covers: London and surrounding areas\n' +
    '- USPs: quality audits, dedicated account management, out-of-hours available, eco-friendly options, re-clean guarantee\n\n' +
    'Write a comprehensive, publish-ready SEO article for keyword: "' + keyword + '"\n\n' +
    'Requirements:\n' +
    '- British English throughout\n' +
    '- At least 1,200 words of body content\n' +
    '- 5–7 content sections with clear H2 headings\n' +
    '- Each section: 150–200 words of substantive expert content\n' +
    '- At least one tip box: <div class="tip-box"><div class="tip-label">Pro Tip</div><p>tip text</p></div>\n' +
    '- At least one bulleted list <ul><li>...</li></ul>\n' +
    '- 5–7 FAQ items with detailed helpful answers (2–3 sentences each)\n' +
    '- Target B2B buyers: facilities managers, office managers, business owners\n' +
    '- Naturally weave in AskMiro USPs\n' +
    '- Meta description: 145–160 characters\n\n' +
    'Return ONLY valid raw JSON (no markdown, no code fences):\n' +
    '{\n' +
    '  "title": "Full page title | AskMiro ' + year + '",\n' +
    '  "metaDescription": "145-160 char meta description",\n' +
    '  "metaKeywords": "keyword1, keyword2, keyword3, keyword4, keyword5",\n' +
    '  "slug": "url-friendly-slug-no-trailing-slash",\n' +
    '  "ogTitle": "Open Graph title 50-60 chars",\n' +
    '  "schemaHeadline": "Schema.org article headline",\n' +
    '  "eyebrow": "Category · London · ' + year + '",\n' +
    '  "h1Html": "H1 with <span class=\'accent\'>keyword</span> highlighted",\n' +
    '  "heroIntro": "2-3 compelling sentences. British English.",\n' +
    '  "readTime": "X min read",\n' +
    '  "datePublished": "' + today + '",\n' +
    '  "trustItems": ["point1","point2","point3","point4","point5"],\n' +
    '  "sections": [\n' +
    '    { "h2": "Section heading", "html": "<p>150-200 word paragraph with <strong>bold terms</strong>.</p>" }\n' +
    '  ],\n' +
    '  "faqItems": [\n' +
    '    { "question": "Detailed question?", "answer": "Comprehensive 2-3 sentence answer." }\n' +
    '  ],\n' +
    '  "ctaTitle": "Get a Free Cleaning Quote",\n' +
    '  "ctaText": "Contact AskMiro for a free no-obligation quote covering all of London.",\n' +
    '  "relatedPages": [\n' +
    '    { "title": "Related page title", "href": "/related-slug" }\n' +
    '  ]\n' +
    '}';

  try {
    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey
      },
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });

    var data = JSON.parse(response.getContentText());
    if (!data.content || !data.content[0]) {
      return { error: 'AI API error: ' + (data.error ? data.error.message : 'no content') };
    }

    var text = data.content[0].text || '';
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: 'AI did not return valid JSON' };

    var article = JSON.parse(jsonMatch[0]);
    var html = _buildArticleHTML(article);
    return { html: html, slug: article.slug, article: article };

  } catch (err) {
    return { error: 'seoGenerate error: ' + err.message };
  }
}

function _escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _escAttr(str) {
  return String(str || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _buildArticleHTML(a) {
  var trustItems = (a.trustItems || ['Fully insured','DBS checked staff','Quote within 24 hours','Out-of-hours available','No hidden charges'])
    .map(function(t){ return '    <div class="trust-item"><div class="trust-dot"></div><div class="trust-text">' + _escHtml(t) + '</div></div>'; })
    .join('\n');

  var sections = (a.sections || []).map(function(s){
    return '\n    <h2>' + _escHtml(s.h2) + '</h2>\n    ' + (s.html || '');
  }).join('\n');

  var faqItems = (a.faqItems || []).map(function(f){
    return '\n    <div class="faq-item">\n      <div class="faq-q" onclick="this.parentElement.classList.toggle(\'open\')">\n        ' +
      _escHtml(f.question) + '\n        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>\n      </div>\n      <div class="faq-a">' +
      _escHtml(f.answer) + '</div>\n    </div>';
  }).join('\n');

  var relatedLinks = (a.relatedPages || [])
    .map(function(p){ return '\n          <li><a href="' + _escAttr(p.href) + '">' + _escHtml(p.title) + '</a></li>'; })
    .join('');

  var faqSchema = (a.faqItems || [])
    .map(function(f){ return '    { "@type": "Question", "name": ' + JSON.stringify(f.question) + ', "acceptedAnswer": { "@type": "Answer", "text": ' + JSON.stringify(f.answer) + ' } }'; })
    .join(',\n');

  var pubDate = a.datePublished || new Date().toISOString().split('T')[0];
  var pubDateFormatted = (function(){
    try { return new Date(pubDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); } catch(e) { return pubDate; }
  })();
  var currentYear = new Date().getFullYear();

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\n' +
    '<title>' + _escHtml(a.title) + '</title>\n' +
    '<meta name="description" content="' + _escAttr(a.metaDescription) + '">\n' +
    '<meta name="keywords" content="' + _escAttr(a.metaKeywords) + '">\n' +
    '<link rel="canonical" href="https://askmiro.co.uk/' + _escAttr(a.slug) + '">\n\n' +
    '<meta property="og:title" content="' + _escAttr(a.ogTitle) + '">\n' +
    '<meta property="og:description" content="' + _escAttr(a.metaDescription) + '">\n' +
    '<meta property="og:type" content="article">\n' +
    '<meta property="og:url" content="https://askmiro.co.uk/' + _escAttr(a.slug) + '">\n' +
    '<meta property="og:site_name" content="AskMiro Cleaning Services">\n\n' +
    '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Article",\n' +
    '  "headline": ' + JSON.stringify(a.schemaHeadline || a.title) + ',\n' +
    '  "description": ' + JSON.stringify(a.metaDescription) + ',\n' +
    '  "author": { "@type": "Organization", "name": "AskMiro Cleaning Services" },\n' +
    '  "publisher": { "@type": "Organization", "name": "AskMiro Cleaning Services", "url": "https://askmiro.co.uk" },\n' +
    '  "datePublished": "' + pubDate + '",\n  "dateModified": "' + pubDate + '"\n}\n</script>\n' +
    '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [\n' +
    faqSchema + '\n  ]\n}\n</script>\n\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">\n\n' +
    '<style>\n:root{--teal:#0A9688;--teal-mid:#0DBDAD;--teal-light:#14D4C2;--teal-wash:rgba(13,189,173,0.07);--teal-wash-2:rgba(13,189,173,0.12);--border-teal:rgba(13,189,173,0.28);--bg-base:#F4F8FB;--bg-surface:#FFFFFF;--bg-raised:#EBF2F8;--bg-alt:#F0F7FA;--navy:#0D1C2E;--navy-mid:#0e2438;--text-1:#0D1C2E;--text-2:#3D5A74;--text-3:#7A9BB5;--border:rgba(13,28,46,0.08);--border-md:rgba(13,28,46,0.13);--shadow-sm:0 1px 3px rgba(13,28,46,0.06),0 1px 2px rgba(13,28,46,0.04);--shadow-md:0 4px 20px rgba(13,28,46,0.08),0 2px 6px rgba(13,28,46,0.05);--shadow-lg:0 12px 48px rgba(13,28,46,0.1),0 4px 12px rgba(13,28,46,0.06);--shadow-teal:0 4px 20px rgba(10,150,136,0.22);--r-sm:8px;--r-md:14px;--r-lg:20px;--r-xl:28px;--spring:cubic-bezier(0.34,1.3,0.64,1);}\n' +
    '*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}\nhtml{scroll-behavior:smooth;-webkit-font-smoothing:antialiased;}\nbody{font-family:\'Figtree\',system-ui,sans-serif;background:var(--bg-base);color:var(--text-1);overflow-x:hidden;line-height:1.65;}\na{text-decoration:none;color:inherit;}\nnav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,4vw,48px);height:64px;background:transparent;border-bottom:1px solid transparent;transition:background .3s,box-shadow .3s,border-color .3s;}\nnav.scrolled{background:rgba(255,255,255,0.96);border-color:var(--border);box-shadow:var(--shadow-sm);backdrop-filter:blur(12px);}\n.nav-logo{font-size:1.25rem;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:10px;color:#fff;transition:color .3s;}\nnav.scrolled .nav-logo{color:var(--text-1);}\n.nav-logo-mark{width:28px;height:28px;background:linear-gradient(135deg,#0DBDAD,#0A9688);border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}\n.nav-logo-mark svg{width:16px;height:16px;}\n.nav-links{display:flex;align-items:center;gap:28px;list-style:none;}\n.nav-links a{font-size:.875rem;font-weight:500;color:rgba(255,255,255,0.7);transition:color .2s;}\n.nav-links a:hover{color:#fff;}\nnav.scrolled .nav-links a{color:var(--text-2);}\nnav.scrolled .nav-links a:hover{color:var(--text-1);}\n.nav-cta{background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff!important;padding:9px 20px;border-radius:var(--r-sm);font-size:.8125rem;font-weight:700;box-shadow:var(--shadow-teal);transition:transform .2s var(--spring),box-shadow .2s;}\n.nav-cta:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(10,150,136,.35);}\n@media(max-width:768px){.nav-links{display:none;}}\n.hero{background:var(--navy);padding:120px clamp(20px,5vw,80px) 72px;position:relative;overflow:hidden;}\n.hero-mesh{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 70% 60% at 0% 0%,rgba(13,189,173,.1) 0%,transparent 55%),radial-gradient(ellipse 50% 50% at 100% 100%,rgba(10,150,136,.07) 0%,transparent 55%);}\n.hero-inner{max-width:760px;margin:0 auto;position:relative;z-index:1;}\n.eyebrow{font-family:\'JetBrains Mono\',monospace;font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--teal-mid);margin-bottom:18px;display:block;}\n.hero h1{font-size:clamp(28px,5vw,46px);font-weight:800;line-height:1.12;letter-spacing:-.03em;color:#fff;margin-bottom:18px;}\n.hero h1 .accent{background:linear-gradient(135deg,#0DBDAD,#14D4C2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}\n.hero-meta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:28px;}\n.hero-meta span{font-family:\'JetBrains Mono\',monospace;font-size:10px;color:rgba(255,255,255,.4);letter-spacing:.08em;text-transform:uppercase;}\n.hero-meta .dot{width:3px;height:3px;background:rgba(255,255,255,.2);border-radius:50%;}\n.hero-intro{font-size:17px;color:rgba(255,255,255,.65);line-height:1.75;max-width:620px;margin-bottom:32px;}\n.hero-btns{display:flex;gap:12px;flex-wrap:wrap;}\n.hero-cta{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff;padding:13px 26px;border-radius:var(--r-sm);font-weight:700;font-size:.875rem;box-shadow:0 4px 20px rgba(10,150,136,.4);transition:transform .2s var(--spring),box-shadow .2s;}\n.hero-cta:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(10,150,136,.5);}\n.hero-cta-ghost{display:inline-flex;align-items:center;gap:8px;border:1.5px solid rgba(255,255,255,.2);color:rgba(255,255,255,.8);padding:12px 24px;border-radius:var(--r-sm);font-weight:600;font-size:.875rem;transition:border-color .2s,color .2s;}\n.hero-cta-ghost:hover{border-color:rgba(255,255,255,.5);color:#fff;}\n.trust-strip{background:var(--navy-mid);border-bottom:1px solid rgba(255,255,255,.06);padding:18px clamp(20px,4vw,80px);}\n.trust-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:0;flex-wrap:wrap;}\n.trust-item{display:flex;align-items:center;gap:8px;padding:6px 24px;border-right:1px solid rgba(255,255,255,.08);}\n.trust-item:last-child{border-right:none;}\n.trust-dot{width:5px;height:5px;background:var(--teal-mid);border-radius:50%;flex-shrink:0;}\n.trust-text{font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.4);}\n.content-wrap{max-width:1100px;margin:0 auto;padding:64px clamp(20px,4vw,48px);display:grid;grid-template-columns:1fr 300px;gap:48px;align-items:start;}\n@media(max-width:900px){.content-wrap{grid-template-columns:1fr;}}\narticle h2{font-size:clamp(20px,3vw,26px);font-weight:800;letter-spacing:-.02em;color:var(--text-1);margin:48px 0 16px;padding-top:48px;border-top:1px solid var(--border);}\narticle h2:first-of-type{margin-top:0;padding-top:0;border-top:none;}\narticle h3{font-size:17px;font-weight:700;color:var(--text-1);margin:28px 0 10px;}\narticle p{font-size:16px;color:var(--text-2);line-height:1.8;margin-bottom:18px;}\narticle ul{margin:0 0 18px 20px;}\narticle ul li{font-size:15px;color:var(--text-2);line-height:1.7;margin-bottom:6px;}\narticle strong{color:var(--text-1);font-weight:600;}\n.tip-box{background:var(--teal-wash);border:1px solid var(--border-teal);border-radius:var(--r-md);padding:18px 20px;margin:24px 0;}\n.tip-box .tip-label{font-family:\'JetBrains Mono\',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--teal);margin-bottom:8px;}\n.tip-box p{font-size:14px;color:var(--text-2);line-height:1.65;margin:0;}\n.warn-box{background:#FFF8F0;border:1px solid rgba(234,88,12,.2);border-left:3px solid #EA580C;border-radius:var(--r-md);padding:18px 20px;margin:24px 0;}\n.warn-box .warn-label{font-family:\'JetBrains Mono\',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#EA580C;margin-bottom:8px;}\n.warn-box p{font-size:14px;color:#7C2D12;line-height:1.65;margin:0;}\n.faq-item{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:10px;overflow:hidden;}\n.faq-q{padding:16px 20px;font-size:15px;font-weight:600;color:var(--text-1);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;transition:background .15s;}\n.faq-q:hover{background:var(--bg-alt);}\n.faq-q svg{flex-shrink:0;transition:transform .2s;color:var(--teal);}\n.faq-item.open .faq-q svg{transform:rotate(180deg);}\n.faq-a{display:none;padding:0 20px 18px;font-size:14px;color:var(--text-2);line-height:1.7;}\n.faq-item.open .faq-a{display:block;}\n.sidebar-sticky{position:sticky;top:84px;}\n.sidebar-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-md);margin-bottom:20px;}\n.sidebar-card-header{background:var(--navy);padding:18px 22px;}\n.sidebar-card-title{font-size:15px;font-weight:700;color:#fff;letter-spacing:-.01em;margin-bottom:3px;}\n.sidebar-card-sub{font-family:\'JetBrains Mono\',monospace;font-size:9px;color:rgba(13,189,173,.8);text-transform:uppercase;letter-spacing:.1em;}\n.sidebar-card-body{padding:20px 22px;}\n.sidebar-card-body p{font-size:13px;color:var(--text-2);line-height:1.65;margin-bottom:16px;}\n.sidebar-btn{display:block;text-align:center;background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff;padding:12px 20px;border-radius:var(--r-sm);font-size:13px;font-weight:700;box-shadow:var(--shadow-teal);transition:transform .2s var(--spring),box-shadow .2s;margin-bottom:10px;}\n.sidebar-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(10,150,136,.38);}\n.sidebar-btn-ghost{display:block;text-align:center;border:1.5px solid var(--border-md);color:var(--text-2);padding:11px 20px;border-radius:var(--r-sm);font-size:13px;font-weight:600;transition:border-color .15s,color .15s;}\n.sidebar-btn-ghost:hover{border-color:var(--border-teal);color:var(--teal);}\n.sidebar-links{list-style:none;}\n.sidebar-links li{border-bottom:1px solid var(--border);}\n.sidebar-links li:last-child{border-bottom:none;}\n.sidebar-links a{display:flex;align-items:center;gap:8px;padding:11px 22px;font-size:13px;color:var(--text-2);transition:color .15s,background .15s;}\n.sidebar-links a:hover{color:var(--teal);background:var(--bg-alt);}\n.sidebar-links a::before{content:\'→\';color:var(--teal);font-size:12px;}\n.cta-banner{background:var(--navy);padding:72px clamp(20px,4vw,80px);position:relative;overflow:hidden;}\n.cta-mesh{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 50% 50%,rgba(13,189,173,.08) 0%,transparent 65%);}\n.cta-inner{max-width:640px;margin:0 auto;text-align:center;position:relative;z-index:1;}\n.cta-inner h2{font-size:clamp(24px,4vw,38px);font-weight:800;letter-spacing:-.03em;color:#fff;margin-bottom:14px;}\n.cta-inner p{font-size:16px;color:rgba(255,255,255,.55);line-height:1.75;margin-bottom:32px;}\n.cta-btns{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;}\n.cta-btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff;padding:14px 30px;border-radius:var(--r-sm);font-weight:700;font-size:15px;box-shadow:0 4px 20px rgba(10,150,136,.4);transition:transform .2s var(--spring),box-shadow .2s;}\n.cta-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(10,150,136,.5);}\n.cta-btn-ghost{display:inline-flex;align-items:center;gap:8px;border:1.5px solid rgba(255,255,255,.2);color:rgba(255,255,255,.8);padding:13px 28px;border-radius:var(--r-sm);font-weight:600;font-size:15px;transition:border-color .2s,color .2s;}\n.cta-btn-ghost:hover{border-color:rgba(255,255,255,.5);color:#fff;}\nfooter{background:var(--navy);color:rgba(255,255,255,.5);padding:48px clamp(20px,4vw,80px);}\n.footer-inner{max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px;}\n.footer-logo{font-size:16px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;}\n.footer-links{display:flex;gap:24px;flex-wrap:wrap;}\n.footer-links a{font-size:13px;color:rgba(255,255,255,.4);transition:color .15s;}\n.footer-links a:hover{color:rgba(255,255,255,.8);}\n.footer-copy{font-size:12px;color:rgba(255,255,255,.25);margin-top:16px;}\n</style>\n</head>\n<body>\n\n' +
    '<nav id="nav">\n  <a href="/" class="nav-logo">\n    <div class="nav-logo-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M4 16L8 8L12 16L16 8L20 16" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>\n    Ask<span style="color:#14D4C2">Miro</span>\n  </a>\n  <ul class="nav-links">\n    <li><a href="/#services">Services</a></li>\n    <li><a href="/deep-cleaning-service-london">Deep Cleaning</a></li>\n    <li><a href="/commercial-cleaning-london">Commercial</a></li>\n    <li><a href="/get-quote.html" class="nav-cta">Get a Quote</a></li>\n  </ul>\n</nav>\n\n' +
    '<section class="hero">\n  <div class="hero-mesh"></div>\n  <div class="hero-inner">\n    <span class="eyebrow">' + _escHtml(a.eyebrow) + '</span>\n    <h1>' + (a.h1Html || '') + '</h1>\n    <div class="hero-meta">\n      <span>AskMiro Cleaning Services</span>\n      <div class="dot"></div>\n      <span>Updated ' + pubDateFormatted + '</span>\n      <div class="dot"></div>\n      <span>' + _escHtml(a.readTime) + '</span>\n    </div>\n    <p class="hero-intro">' + _escHtml(a.heroIntro) + '</p>\n    <div class="hero-btns">\n      <a href="/get-quote.html" class="hero-cta">Get a Free Quote <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>\n      <a href="tel:02080730621" class="hero-cta-ghost">\uD83D\uDCDE 020 8073 0621</a>\n    </div>\n  </div>\n</section>\n\n' +
    '<div class="trust-strip">\n  <div class="trust-inner">\n' + trustItems + '\n  </div>\n</div>\n\n' +
    '<div class="content-wrap">\n  <article>\n    ' + sections + '\n\n    <h2>Frequently Asked Questions</h2>\n    ' + faqItems + '\n  </article>\n\n  <aside>\n    <div class="sidebar-sticky">\n      <div class="sidebar-card">\n        <div class="sidebar-card-header">\n          <div class="sidebar-card-title">Get a Free Quote</div>\n          <div class="sidebar-card-sub">Response within 24 hours</div>\n        </div>\n        <div class="sidebar-card-body">\n          <p>Tell us about your premises and we\'ll provide a tailored quote \u2014 no obligation, no hidden charges.</p>\n          <a href="/get-quote.html" class="sidebar-btn">Request a Quote \u2192</a>\n          <a href="tel:02080730621" class="sidebar-btn-ghost">\uD83D\uDCDE 020 8073 0621</a>\n        </div>\n      </div>\n      ' + (relatedLinks ? '<div class="sidebar-card">\n        <div class="sidebar-card-header">\n          <div class="sidebar-card-title">Related Guides</div>\n          <div class="sidebar-card-sub">Further reading</div>\n        </div>\n        <ul class="sidebar-links">' + relatedLinks + '\n        </ul>\n      </div>' : '') + '\n    </div>\n  </aside>\n</div>\n\n' +
    '<section class="cta-banner">\n  <div class="cta-mesh"></div>\n  <div class="cta-inner">\n    <h2>' + _escHtml(a.ctaTitle) + '</h2>\n    <p>' + _escHtml(a.ctaText) + '</p>\n    <div class="cta-btns">\n      <a href="/get-quote.html" class="cta-btn">Get a Free Quote <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>\n      <a href="tel:02080730621" class="cta-btn-ghost">\uD83D\uDCDE 020 8073 0621</a>\n    </div>\n  </div>\n</section>\n\n' +
    '<footer>\n  <div class="footer-inner">\n    <div>\n      <div class="footer-logo">\n        <div class="nav-logo-mark" style="width:22px;height:22px;border-radius:5px"><svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M4 16L8 8L12 16L16 8L20 16" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>\n        AskMiro Cleaning Services\n      </div>\n      <p class="footer-copy">&copy; ' + currentYear + ' AskMiro Cleaning Services Ltd &middot; London &middot; info@askmiro.com</p>\n    </div>\n    <div class="footer-links">\n      <a href="/">Home</a>\n      <a href="/get-quote.html">Get a Quote</a>\n      <a href="/privacy-policy.html">Privacy Policy</a>\n      <a href="/cookie-policy.html">Cookie Policy</a>\n    </div>\n  </div>\n</footer>\n\n' +
    '<script>\nconst nav = document.getElementById(\'nav\');\nwindow.addEventListener(\'scroll\', () => nav.classList.toggle(\'scrolled\', window.scrollY > 20));\n</script>\n</body>\n</html>';
}
