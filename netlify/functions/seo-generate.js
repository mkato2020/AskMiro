// ============================================================
// AskMiro — netlify/functions/seo-generate.js
// SEO article generator using Claude API
// POST /api/seo-generate
// Body: { mode: 'suggest' } | { mode: 'generate', keyword: '...' }
// ============================================================

const ASKMIRO_CONTEXT = `
AskMiro Cleaning Services — professional managed cleaning company in London.
- Director: Mike Kato
- Contact: info@askmiro.com | 020 8073 0621 | www.askmiro.co.uk
- Typical contract value: £800–£5,000/month
- Services: Office cleaning, commercial cleaning, end of tenancy, deep cleaning, residential blocks, medical/healthcare, schools, automotive, warehouses, gyms, retail, hospitality
- All staff: DBS-checked, BICSc trained, uniformed, insured
- £10M public liability insurance, COSHH-compliant
- Fixed monthly rates, no hidden charges
- Covers: London and surrounding areas
- Key USPs: quality audits, dedicated account management, out-of-hours available, eco-friendly options, re-clean guarantee
`.trim();

const EXISTING_PAGES = [
  'office-cleaning-cost-london',
  'office-cleaning-checklist-london',
  'deep-cleaning-service-london',
  'end-of-tenancy-cleaning-checklist-london',
  'data-centre-cleaning-london',
  'warehouse-cleaning-london',
  'medical-facility-cleaning-standards',
  'automotive-dealership-showroom-cleaning',
  'commercial-kitchen-cleaning-standards',
  'school-cleaning-standards',
  'how-often-should-office-be-cleaned',
  'what-does-commercial-cleaning-include',
  'green-commercial-cleaning-eco-friendly',
  'high-touch-surfaces-office-disinfection',
  'communal-area-cleaning-residential-blocks',
  'pest-control-commercial-building-cleaning',
  'airbnb-cleaning-service-london',
  'commercial-cleaning-london',
];

export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500, headers });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers }); }

  const { mode, keyword } = body;

  // ── SUGGEST KEYWORDS ──────────────────────────────────────────────────────
  if (mode === 'suggest') {
    const prompt = `You are an SEO expert for AskMiro, a B2B commercial cleaning company in London.

Generate 18 keyword ideas for SEO blog/article pages that would attract potential business customers searching for cleaning services.

Requirements:
- Long-tail keywords (3–7 words)
- Commercially relevant (people who need cleaning services)
- Diverse intents: informational, commercial investigation, transactional
- Mix of service types: offices, retail, medical, schools, end of tenancy, hospitality, etc.
- London/UK focused

Do NOT include keywords already covered by these existing pages: ${EXISTING_PAGES.join(', ')}

Return ONLY a JSON array, no markdown, no explanation:
[
  { "keyword": "the keyword phrase", "intent": "informational|commercial|transactional", "category": "short category label" }
]`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data?.content?.[0]?.text || '[]';
      const match = text.match(/\[[\s\S]*\]/);
      const keywords = match ? JSON.parse(match[0]) : [];
      return new Response(JSON.stringify({ keywords }), { status: 200, headers });
    } catch (e) {
      console.error('suggest error:', e.message);
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  // ── GENERATE ARTICLE ─────────────────────────────────────────────────────
  if (mode === 'generate' && keyword) {
    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();

    const prompt = `You are an SEO content expert writing for AskMiro Cleaning Services, a professional B2B commercial cleaning company in London.

${ASKMIRO_CONTEXT}

Write a comprehensive, genuinely helpful SEO article targeting the keyword: "${keyword}"

Return ONLY a valid JSON object (no markdown fences, no explanation — raw JSON only):
{
  "title": "Full SEO page title with year ${year} | AskMiro",
  "metaDescription": "Compelling 150–160 char meta description naturally including the keyword",
  "metaKeywords": "6–8 comma-separated keyword variations",
  "slug": "url-slug-no-slashes-no-special-chars",
  "ogTitle": "Shorter Open Graph title",
  "schemaHeadline": "Article schema headline",
  "eyebrow": "Short category label · London · ${year} Guide",
  "h1Html": "H1 text — wrap the key phrase in <span class='accent'>...</span>",
  "heroIntro": "2–3 sentence compelling hero intro. No HTML tags. British English.",
  "readTime": "X min read",
  "datePublished": "${today}",
  "trustItems": ["trust point 1", "trust point 2", "trust point 3", "trust point 4", "trust point 5"],
  "sections": [
    {
      "h2": "Section heading",
      "html": "Full HTML for this section. Use <p>, <h3>, <ul><li>, <strong>. For tips: <div class='tip-box'><div class='tip-label'>Pro Tip</div><p>tip text</p></div>. For warnings: <div class='warn-box'><div class='warn-label'>Important</div><p>warning text</p></div>. Aim 150–300 words."
    }
  ],
  "faqItems": [
    { "question": "FAQ question?", "answer": "2–3 sentence answer. British English." }
  ],
  "ctaTitle": "CTA section headline",
  "ctaText": "1–2 sentence CTA body",
  "relatedPages": [
    { "title": "Related article title", "href": "/existing-slug" }
  ]
}

Rules:
- 5–7 detailed sections with genuinely useful content (not fluff)
- 5–7 FAQ items covering real questions people ask
- British English throughout
- Never quote specific prices — direct to free quote instead
- relatedPages: pick 3–4 from: /office-cleaning-cost-london, /deep-cleaning-service-london, /end-of-tenancy-cleaning-checklist-london, /commercial-cleaning-london, /warehouse-cleaning-london, /school-cleaning-standards, /medical-facility-cleaning-standards, /office-cleaning-checklist-london
- Establish AskMiro as the authority; weave in brand naturally but not aggressively`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Anthropic error:', res.status, errText);
        return new Response(JSON.stringify({ error: `AI API error: ${res.status}` }), { status: 500, headers });
      }

      const data = await res.json();
      const text = data?.content?.[0]?.text || '';

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in AI response');

      const article = JSON.parse(jsonMatch[0]);
      const html = buildHTML(article);

      return new Response(JSON.stringify({ html, slug: article.slug, article }), { status: 200, headers });

    } catch (e) {
      console.error('generate error:', e.message);
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  // ── PUBLISH TO GITHUB ────────────────────────────────────────────────────
  if (mode === 'publish') {
    const { slug, html, title } = body;
    if (!slug || !html) {
      return new Response(JSON.stringify({ error: 'Missing slug or html' }), { status: 400, headers });
    }

    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
      return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured in Netlify env vars' }), { status: 500, headers });
    }

    const REPO = 'mkato2020/AskMiro';
    const FILE_PATH = `${slug}.html`;
    const SITEMAP_PATH = 'sitemap.xml';
    const GH_API = 'https://api.github.com';
    const ghHeaders = {
      'Authorization': `Bearer ${ghToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'AskMiro-SEO-Bot',
    };

    try {
      // ── 1. Check if file already exists (need SHA to update) ──
      let existingSha = null;
      const checkRes = await fetch(`${GH_API}/repos/${REPO}/contents/${FILE_PATH}`, { headers: ghHeaders });
      if (checkRes.ok) {
        const existing = await checkRes.json();
        existingSha = existing.sha;
      }

      // ── 2. Push article HTML ──
      const fileBody = {
        message: `feat(seo): add article — ${title || slug}`,
        content: Buffer.from(html).toString('base64'),
        committer: { name: 'AskMiro SEO Bot', email: 'seo@askmiro.co.uk' },
      };
      if (existingSha) fileBody.sha = existingSha;

      const pushRes = await fetch(`${GH_API}/repos/${REPO}/contents/${FILE_PATH}`, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify(fileBody),
      });

      if (!pushRes.ok) {
        const err = await pushRes.text();
        throw new Error(`GitHub API error ${pushRes.status}: ${err}`);
      }

      // ── 3. Update sitemap.xml ──
      let sitemapUpdated = false;
      try {
        const smRes = await fetch(`${GH_API}/repos/${REPO}/contents/${SITEMAP_PATH}`, { headers: ghHeaders });
        if (smRes.ok) {
          const smData = await smRes.json();
          const currentXml = Buffer.from(smData.content, 'base64').toString('utf8');
          const newUrl = `https://askmiro.co.uk/${slug}`;

          if (!currentXml.includes(newUrl)) {
            const today = new Date().toISOString().split('T')[0];
            const newEntry = `\n  <url>\n    <loc>${newUrl}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
            const updatedXml = currentXml.replace('</urlset>', newEntry + '\n</urlset>');

            await fetch(`${GH_API}/repos/${REPO}/contents/${SITEMAP_PATH}`, {
              method: 'PUT',
              headers: ghHeaders,
              body: JSON.stringify({
                message: `feat(seo): add ${slug} to sitemap`,
                content: Buffer.from(updatedXml).toString('base64'),
                sha: smData.sha,
                committer: { name: 'AskMiro SEO Bot', email: 'seo@askmiro.co.uk' },
              }),
            });
            sitemapUpdated = true;
          }
        }
      } catch (smErr) {
        console.warn('Sitemap update failed (non-fatal):', smErr.message);
      }

      // Note: Google Indexing API is not applicable for general pages (job postings/livestreams only).
      // Discovery relies on sitemap.xml update above + Googlebot crawling on next visit.

      const pushData = await pushRes.json();
      return new Response(JSON.stringify({
        success: true,
        url: `https://askmiro.co.uk/${slug}`,
        commitUrl: pushData.commit?.html_url,
        sitemapUpdated,
        updated: !!existingSha,
      }), { status: 200, headers });

    } catch (e) {
      console.error('publish error:', e.message);
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Invalid mode or missing keyword' }), { status: 400, headers });
};


function _b64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── HTML BUILDER ──────────────────────────────────────────────────────────────
function buildHTML(a) {
  const trustItems = (a.trustItems || ['Fully insured', 'DBS checked staff', 'Quote within 24 hours', 'Out-of-hours available', 'No hidden charges'])
    .map(t => `    <div class="trust-item"><div class="trust-dot"></div><div class="trust-text">${escHtml(t)}</div></div>`)
    .join('\n');

  const sections = (a.sections || []).map(s => `
    <h2>${escHtml(s.h2)}</h2>
    ${s.html || ''}`).join('\n');

  const faqItems = (a.faqItems || []).map(f => `
    <div class="faq-item">
      <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
        ${escHtml(f.question)}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="faq-a">${escHtml(f.answer)}</div>
    </div>`).join('\n');

  const relatedLinks = (a.relatedPages || [])
    .map(p => `\n          <li><a href="${escHtml(p.href)}">${escHtml(p.title)}</a></li>`)
    .join('');

  const faqSchema = (a.faqItems || [])
    .map(f => `    { "@type": "Question", "name": ${JSON.stringify(f.question)}, "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(f.answer)} } }`)
    .join(',\n');

  const pubDate = a.datePublished || new Date().toISOString().split('T')[0];
  const pubDateFormatted = (() => {
    try { return new Date(pubDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
    catch { return pubDate; }
  })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>${escHtml(a.title)}</title>
<meta name="description" content="${escAttr(a.metaDescription)}">
<meta name="keywords" content="${escAttr(a.metaKeywords)}">
<link rel="canonical" href="https://askmiro.co.uk/${escAttr(a.slug)}">

<meta property="og:title" content="${escAttr(a.ogTitle)}">
<meta property="og:description" content="${escAttr(a.metaDescription)}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://askmiro.co.uk/${escAttr(a.slug)}">
<meta property="og:site_name" content="AskMiro Cleaning Services">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": ${JSON.stringify(a.schemaHeadline || a.title)},
  "description": ${JSON.stringify(a.metaDescription)},
  "author": { "@type": "Organization", "name": "AskMiro Cleaning Services" },
  "publisher": { "@type": "Organization", "name": "AskMiro Cleaning Services", "url": "https://askmiro.co.uk" },
  "datePublished": "${pubDate}",
  "dateModified": "${pubDate}"
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
${faqSchema}
  ]
}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">

<style>
:root{--teal:#0A9688;--teal-mid:#0DBDAD;--teal-light:#14D4C2;--teal-wash:rgba(13,189,173,0.07);--teal-wash-2:rgba(13,189,173,0.12);--border-teal:rgba(13,189,173,0.28);--bg-base:#F4F8FB;--bg-surface:#FFFFFF;--bg-raised:#EBF2F8;--bg-alt:#F0F7FA;--navy:#0D1C2E;--navy-mid:#0e2438;--text-1:#0D1C2E;--text-2:#3D5A74;--text-3:#7A9BB5;--border:rgba(13,28,46,0.08);--border-md:rgba(13,28,46,0.13);--shadow-sm:0 1px 3px rgba(13,28,46,0.06),0 1px 2px rgba(13,28,46,0.04);--shadow-md:0 4px 20px rgba(13,28,46,0.08),0 2px 6px rgba(13,28,46,0.05);--shadow-lg:0 12px 48px rgba(13,28,46,0.1),0 4px 12px rgba(13,28,46,0.06);--shadow-teal:0 4px 20px rgba(10,150,136,0.22);--r-sm:8px;--r-md:14px;--r-lg:20px;--r-xl:28px;--spring:cubic-bezier(0.34,1.3,0.64,1);}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased;}
body{font-family:'Figtree',system-ui,sans-serif;background:var(--bg-base);color:var(--text-1);overflow-x:hidden;line-height:1.65;}
a{text-decoration:none;color:inherit;}
nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,4vw,48px);height:64px;background:transparent;border-bottom:1px solid transparent;transition:background .3s,box-shadow .3s,border-color .3s;}
nav.scrolled{background:rgba(255,255,255,0.96);border-color:var(--border);box-shadow:var(--shadow-sm);backdrop-filter:blur(12px);}
.nav-logo{font-size:1.25rem;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:10px;color:#fff;transition:color .3s;}
nav.scrolled .nav-logo{color:var(--text-1);}
.nav-logo-mark{width:28px;height:28px;background:linear-gradient(135deg,#0DBDAD,#0A9688);border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nav-logo-mark svg{width:16px;height:16px;}
.nav-links{display:flex;align-items:center;gap:28px;list-style:none;}
.nav-links a{font-size:.875rem;font-weight:500;color:rgba(255,255,255,0.7);transition:color .2s;}
.nav-links a:hover{color:#fff;}
nav.scrolled .nav-links a{color:var(--text-2);}
nav.scrolled .nav-links a:hover{color:var(--text-1);}
.nav-cta{background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff!important;padding:9px 20px;border-radius:var(--r-sm);font-size:.8125rem;font-weight:700;box-shadow:var(--shadow-teal);transition:transform .2s var(--spring),box-shadow .2s;}
.nav-cta:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(10,150,136,.35);}
@media(max-width:768px){.nav-links{display:none;}}
.hero{background:var(--navy);padding:120px clamp(20px,5vw,80px) 72px;position:relative;overflow:hidden;}
.hero-mesh{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 70% 60% at 0% 0%,rgba(13,189,173,.1) 0%,transparent 55%),radial-gradient(ellipse 50% 50% at 100% 100%,rgba(10,150,136,.07) 0%,transparent 55%);}
.hero-inner{max-width:760px;margin:0 auto;position:relative;z-index:1;}
.eyebrow{font-family:'JetBrains Mono',monospace;font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--teal-mid);margin-bottom:18px;display:block;}
.hero h1{font-size:clamp(28px,5vw,46px);font-weight:800;line-height:1.12;letter-spacing:-.03em;color:#fff;margin-bottom:18px;}
.hero h1 .accent{background:linear-gradient(135deg,#0DBDAD,#14D4C2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.hero-meta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:28px;}
.hero-meta span{font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(255,255,255,.4);letter-spacing:.08em;text-transform:uppercase;}
.hero-meta .dot{width:3px;height:3px;background:rgba(255,255,255,.2);border-radius:50%;}
.hero-intro{font-size:17px;color:rgba(255,255,255,.65);line-height:1.75;max-width:620px;margin-bottom:32px;}
.hero-btns{display:flex;gap:12px;flex-wrap:wrap;}
.hero-cta{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff;padding:13px 26px;border-radius:var(--r-sm);font-weight:700;font-size:.875rem;box-shadow:0 4px 20px rgba(10,150,136,.4);transition:transform .2s var(--spring),box-shadow .2s;}
.hero-cta:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(10,150,136,.5);}
.hero-cta-ghost{display:inline-flex;align-items:center;gap:8px;border:1.5px solid rgba(255,255,255,.2);color:rgba(255,255,255,.8);padding:12px 24px;border-radius:var(--r-sm);font-weight:600;font-size:.875rem;transition:border-color .2s,color .2s;}
.hero-cta-ghost:hover{border-color:rgba(255,255,255,.5);color:#fff;}
.trust-strip{background:var(--navy-mid);border-bottom:1px solid rgba(255,255,255,.06);padding:18px clamp(20px,4vw,80px);}
.trust-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:0;flex-wrap:wrap;}
.trust-item{display:flex;align-items:center;gap:8px;padding:6px 24px;border-right:1px solid rgba(255,255,255,.08);}
.trust-item:last-child{border-right:none;}
.trust-dot{width:5px;height:5px;background:var(--teal-mid);border-radius:50%;flex-shrink:0;}
.trust-text{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.4);}
.content-wrap{max-width:1100px;margin:0 auto;padding:64px clamp(20px,4vw,48px);display:grid;grid-template-columns:1fr 300px;gap:48px;align-items:start;}
@media(max-width:900px){.content-wrap{grid-template-columns:1fr;}}
article h2{font-size:clamp(20px,3vw,26px);font-weight:800;letter-spacing:-.02em;color:var(--text-1);margin:48px 0 16px;padding-top:48px;border-top:1px solid var(--border);}
article h2:first-of-type{margin-top:0;padding-top:0;border-top:none;}
article h3{font-size:17px;font-weight:700;color:var(--text-1);margin:28px 0 10px;}
article p{font-size:16px;color:var(--text-2);line-height:1.8;margin-bottom:18px;}
article ul{margin:0 0 18px 20px;}
article ul li{font-size:15px;color:var(--text-2);line-height:1.7;margin-bottom:6px;}
article strong{color:var(--text-1);font-weight:600;}
.tip-box{background:var(--teal-wash);border:1px solid var(--border-teal);border-radius:var(--r-md);padding:18px 20px;margin:24px 0;}
.tip-box .tip-label{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--teal);margin-bottom:8px;}
.tip-box p{font-size:14px;color:var(--text-2);line-height:1.65;margin:0;}
.warn-box{background:#FFF8F0;border:1px solid rgba(234,88,12,.2);border-left:3px solid #EA580C;border-radius:var(--r-md);padding:18px 20px;margin:24px 0;}
.warn-box .warn-label{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#EA580C;margin-bottom:8px;}
.warn-box p{font-size:14px;color:#7C2D12;line-height:1.65;margin:0;}
.faq-item{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:10px;overflow:hidden;}
.faq-q{padding:16px 20px;font-size:15px;font-weight:600;color:var(--text-1);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;transition:background .15s;}
.faq-q:hover{background:var(--bg-alt);}
.faq-q svg{flex-shrink:0;transition:transform .2s;color:var(--teal);}
.faq-item.open .faq-q svg{transform:rotate(180deg);}
.faq-a{display:none;padding:0 20px 18px;font-size:14px;color:var(--text-2);line-height:1.7;}
.faq-item.open .faq-a{display:block;}
.sidebar-sticky{position:sticky;top:84px;}
.sidebar-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-md);margin-bottom:20px;}
.sidebar-card-header{background:var(--navy);padding:18px 22px;}
.sidebar-card-title{font-size:15px;font-weight:700;color:#fff;letter-spacing:-.01em;margin-bottom:3px;}
.sidebar-card-sub{font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(13,189,173,.8);text-transform:uppercase;letter-spacing:.1em;}
.sidebar-card-body{padding:20px 22px;}
.sidebar-card-body p{font-size:13px;color:var(--text-2);line-height:1.65;margin-bottom:16px;}
.sidebar-btn{display:block;text-align:center;background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff;padding:12px 20px;border-radius:var(--r-sm);font-size:13px;font-weight:700;box-shadow:var(--shadow-teal);transition:transform .2s var(--spring),box-shadow .2s;margin-bottom:10px;}
.sidebar-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(10,150,136,.38);}
.sidebar-btn-ghost{display:block;text-align:center;border:1.5px solid var(--border-md);color:var(--text-2);padding:11px 20px;border-radius:var(--r-sm);font-size:13px;font-weight:600;transition:border-color .15s,color .15s;}
.sidebar-btn-ghost:hover{border-color:var(--border-teal);color:var(--teal);}
.sidebar-links{list-style:none;}
.sidebar-links li{border-bottom:1px solid var(--border);}
.sidebar-links li:last-child{border-bottom:none;}
.sidebar-links a{display:flex;align-items:center;gap:8px;padding:11px 22px;font-size:13px;color:var(--text-2);transition:color .15s,background .15s;}
.sidebar-links a:hover{color:var(--teal);background:var(--bg-alt);}
.sidebar-links a::before{content:'→';color:var(--teal);font-size:12px;}
.cta-banner{background:var(--navy);padding:72px clamp(20px,4vw,80px);position:relative;overflow:hidden;}
.cta-mesh{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 50% 50%,rgba(13,189,173,.08) 0%,transparent 65%);}
.cta-inner{max-width:640px;margin:0 auto;text-align:center;position:relative;z-index:1;}
.cta-inner h2{font-size:clamp(24px,4vw,38px);font-weight:800;letter-spacing:-.03em;color:#fff;margin-bottom:14px;}
.cta-inner p{font-size:16px;color:rgba(255,255,255,.55);line-height:1.75;margin-bottom:32px;}
.cta-btns{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;}
.cta-btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#0DBDAD,#0A9688);color:#fff;padding:14px 30px;border-radius:var(--r-sm);font-weight:700;font-size:15px;box-shadow:0 4px 20px rgba(10,150,136,.4);transition:transform .2s var(--spring),box-shadow .2s;}
.cta-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(10,150,136,.5);}
.cta-btn-ghost{display:inline-flex;align-items:center;gap:8px;border:1.5px solid rgba(255,255,255,.2);color:rgba(255,255,255,.8);padding:13px 28px;border-radius:var(--r-sm);font-weight:600;font-size:15px;transition:border-color .2s,color .2s;}
.cta-btn-ghost:hover{border-color:rgba(255,255,255,.5);color:#fff;}
footer{background:var(--navy);color:rgba(255,255,255,.5);padding:48px clamp(20px,4vw,80px);}
.footer-inner{max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px;}
.footer-logo{font-size:16px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;}
.footer-links{display:flex;gap:24px;flex-wrap:wrap;}
.footer-links a{font-size:13px;color:rgba(255,255,255,.4);transition:color .15s;}
.footer-links a:hover{color:rgba(255,255,255,.8);}
.footer-copy{font-size:12px;color:rgba(255,255,255,.25);margin-top:16px;}
</style>
</head>
<body>

<nav id="nav">
  <a href="/" class="nav-logo">
    <div class="nav-logo-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M4 16L8 8L12 16L16 8L20 16" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    Ask<span style="color:#14D4C2">Miro</span>
  </a>
  <ul class="nav-links">
    <li><a href="/#services">Services</a></li>
    <li><a href="/deep-cleaning-service-london">Deep Cleaning</a></li>
    <li><a href="/commercial-cleaning-london">Commercial</a></li>
    <li><a href="/get-quote.html" class="nav-cta">Get a Quote</a></li>
  </ul>
</nav>

<section class="hero">
  <div class="hero-mesh"></div>
  <div class="hero-inner">
    <span class="eyebrow">${escHtml(a.eyebrow)}</span>
    <h1>${a.h1Html}</h1>
    <div class="hero-meta">
      <span>AskMiro Cleaning Services</span>
      <div class="dot"></div>
      <span>Updated ${pubDateFormatted}</span>
      <div class="dot"></div>
      <span>${escHtml(a.readTime)}</span>
    </div>
    <p class="hero-intro">${escHtml(a.heroIntro)}</p>
    <div class="hero-btns">
      <a href="/get-quote.html" class="hero-cta">Get a Free Quote <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a href="tel:02080730621" class="hero-cta-ghost">📞 020 8073 0621</a>
    </div>
  </div>
</section>

<div class="trust-strip">
  <div class="trust-inner">
${trustItems}
  </div>
</div>

<div class="content-wrap">
  <article>
    ${sections}

    <h2>Frequently Asked Questions</h2>
    ${faqItems}
  </article>

  <aside>
    <div class="sidebar-sticky">
      <div class="sidebar-card">
        <div class="sidebar-card-header">
          <div class="sidebar-card-title">Get a Free Quote</div>
          <div class="sidebar-card-sub">Response within 24 hours</div>
        </div>
        <div class="sidebar-card-body">
          <p>Tell us about your premises and we'll provide a tailored quote — no obligation, no hidden charges.</p>
          <a href="/get-quote.html" class="sidebar-btn">Request a Quote →</a>
          <a href="tel:02080730621" class="sidebar-btn-ghost">📞 020 8073 0621</a>
        </div>
      </div>
      ${relatedLinks ? `<div class="sidebar-card">
        <div class="sidebar-card-header">
          <div class="sidebar-card-title">Related Guides</div>
          <div class="sidebar-card-sub">Further reading</div>
        </div>
        <ul class="sidebar-links">${relatedLinks}
        </ul>
      </div>` : ''}
    </div>
  </aside>
</div>

<section class="cta-banner">
  <div class="cta-mesh"></div>
  <div class="cta-inner">
    <h2>${escHtml(a.ctaTitle)}</h2>
    <p>${escHtml(a.ctaText)}</p>
    <div class="cta-btns">
      <a href="/get-quote.html" class="cta-btn">Get a Free Quote <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a href="tel:02080730621" class="cta-btn-ghost">📞 020 8073 0621</a>
    </div>
  </div>
</section>

<footer>
  <div class="footer-inner">
    <div>
      <div class="footer-logo">
        <div class="nav-logo-mark" style="width:22px;height:22px;border-radius:5px"><svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M4 16L8 8L12 16L16 8L20 16" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        AskMiro Cleaning Services
      </div>
      <p class="footer-copy">&copy; ${new Date().getFullYear()} AskMiro Cleaning Services Ltd &middot; London &middot; info@askmiro.com</p>
    </div>
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/get-quote.html">Get a Quote</a>
      <a href="/privacy-policy.html">Privacy Policy</a>
      <a href="/cookie-policy.html">Cookie Policy</a>
    </div>
  </div>
</footer>

<script>
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 20));
</script>
</body>
</html>`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function escAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const config = { path: '/api/seo-generate' };
