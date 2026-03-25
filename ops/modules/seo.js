// ============================================================
// AskMiro Ops — modules/seo.js
// SEO Content Generator
// ============================================================
window.SEO = (() => {

  let _suggestions = [];
  let _generated = null;

  // ── RENDER ───────────────────────────────────────────────
  async function render() {
    const app = document.getElementById('main-content');
    app.innerHTML = _shell();
    _bindCustomInput();
    _loadSuggestions();
  }

  // ── SHELL HTML ───────────────────────────────────────────
  function _shell() {
    return `
<div style="max-width:1100px">

  <!-- Header -->
  <div style="margin-bottom:24px">
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--t);margin-bottom:6px">SEO Content Engine</div>
    <h2 style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:var(--ch);margin-bottom:6px">Generate SEO Articles</h2>
    <p style="font-size:13px;color:var(--ll);line-height:1.6">Pick a keyword idea or type your own. Claude writes a full, publish-ready HTML page matching your site's exact design. Click <strong style="color:var(--sl)">Publish to Site</strong> — it commits to GitHub, Netlify deploys, and sitemap.xml is updated for Google to discover.</p>
  </div>

  <!-- Two-column layout -->
  <div style="display:grid;grid-template-columns:1fr 340px;gap:20px;align-items:start">

    <!-- Left: keyword suggestions -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 18px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--ch)">Keyword Ideas</div>
          <div style="font-size:12px;color:var(--ll);margin-top:1px">AI-suggested topics for your niche</div>
        </div>
        <button class="btn bo btn-sm" onclick="SEO.refreshSuggestions()" id="refresh-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </div>
      <div id="suggestions-wrap" style="padding:16px 18px;min-height:200px">
        <div style="display:flex;align-items:center;gap:10px;color:var(--ll);font-size:13px;padding:20px 0">
          <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
          Loading keyword ideas…
        </div>
      </div>
    </div>

    <!-- Right: custom input + generate -->
    <div style="display:flex;flex-direction:column;gap:16px">

      <!-- Custom keyword input -->
      <div class="card" style="padding:18px">
        <div style="font-weight:700;font-size:13px;color:var(--ch);margin-bottom:4px">Custom Keyword</div>
        <div style="font-size:12px;color:var(--ll);margin-bottom:12px">Type any keyword to generate an article</div>
        <input
          type="text"
          id="custom-keyword"
          class="fin"
          placeholder="e.g. gym cleaning services london"
          style="width:100%;padding:9px 12px;border:1px solid var(--bd);border-radius:8px;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .15s"
          onfocus="this.style.borderColor='var(--t)'"
          onblur="this.style.borderColor='var(--bd)'"
          onkeydown="if(event.key==='Enter')SEO.generate(this.value)"
        >
        <button class="btn bp" style="width:100%;margin-top:10px;justify-content:center" onclick="SEO.generate(document.getElementById('custom-keyword').value)">
          Generate Article
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>

      <!-- How it works -->
      <div class="card" style="padding:18px">
        <div style="font-weight:700;font-size:13px;color:var(--ch);margin-bottom:12px">How it works</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${['Pick a keyword or type your own', 'Claude writes the full article (15–25s)', 'Click <strong>Publish to Site</strong>', 'GitHub commit is created automatically', 'Netlify deploys in ~60 seconds', 'Google is notified to crawl it'].map((s, i) => `
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:20px;height:20px;border-radius:50%;background:var(--t);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">${i + 1}</div>
            <div style="font-size:12px;color:var(--sl);line-height:1.5">${s}</div>
          </div>`).join('')}
        </div>
      </div>

    </div>
  </div>

  <!-- Generation panel (hidden until triggered) -->
  <div id="gen-panel" style="display:none;margin-top:20px"></div>

</div>`;
  }

  // ── LOAD SUGGESTIONS ─────────────────────────────────────
  async function _loadSuggestions() {
    document.getElementById('refresh-btn').disabled = true;
    try {
      const res = await fetch('/api/seo-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'suggest' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      _suggestions = data.keywords || [];
      _renderSuggestions();
    } catch (e) {
      document.getElementById('suggestions-wrap').innerHTML = `
        <div style="color:var(--rd);font-size:13px;padding:8px 0">
          Failed to load suggestions: ${e.message}
          <br><button class="btn bo btn-sm" style="margin-top:8px" onclick="SEO.refreshSuggestions()">Try again</button>
        </div>`;
    } finally {
      const btn = document.getElementById('refresh-btn');
      if (btn) btn.disabled = false;
    }
  }

  function _renderSuggestions() {
    const wrap = document.getElementById('suggestions-wrap');
    if (!wrap) return;
    if (!_suggestions.length) {
      wrap.innerHTML = `<div style="color:var(--ll);font-size:13px">No suggestions available. Try refreshing.</div>`;
      return;
    }

    const intentColor = { informational: '#3B82F6', commercial: '#8B5CF6', transactional: '#059669' };
    const intentBg    = { informational: '#EFF6FF', commercial: '#F5F3FF', transactional: '#ECFDF5' };

    wrap.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${_suggestions.map((k, i) => `
          <button
            onclick="SEO.generate(${_esc(JSON.stringify(k.keyword))})"
            style="
              display:inline-flex;align-items:center;gap:6px;
              padding:7px 12px;border-radius:20px;
              background:${intentBg[k.intent] || '#F8FAFC'};
              border:1px solid ${intentColor[k.intent] || '#94A3B8'}33;
              color:var(--ch);font-size:12px;font-weight:500;
              cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif;
              text-align:left;line-height:1.4
            "
            onmouseover="this.style.borderColor='var(--t)';this.style.background='#F0FDF9'"
            onmouseout="this.style.borderColor='${intentColor[k.intent] || '#94A3B8'}33';this.style.background='${intentBg[k.intent] || '#F8FAFC'}'"
            title="Intent: ${k.intent}${k.category ? ' · ' + k.category : ''}"
          >
            <span style="width:6px;height:6px;border-radius:50%;background:${intentColor[k.intent] || '#94A3B8'};flex-shrink:0"></span>
            ${_esc(k.keyword)}
          </button>`).join('')}
      </div>
      <div style="margin-top:12px;font-size:11px;color:var(--ll);display:flex;gap:14px;flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:#3B82F6;display:inline-block"></span> Informational</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:#8B5CF6;display:inline-block"></span> Commercial</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:#059669;display:inline-block"></span> Transactional</span>
      </div>`;
  }

  // ── GENERATE ARTICLE ────────────────────────────────────
  async function generate(keyword) {
    keyword = (keyword || '').trim();
    if (!keyword) { UI.toast('Please enter a keyword', 'w'); return; }

    const panel = document.getElementById('gen-panel');
    if (!panel) return;

    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="card" style="padding:28px;text-align:center">
        <div class="spinner" style="width:28px;height:28px;margin:0 auto 14px"></div>
        <div style="font-weight:700;font-size:14px;color:var(--ch);margin-bottom:4px">Generating article…</div>
        <div style="font-size:12px;color:var(--ll)">Writing a full SEO article for "<strong>${_esc(keyword)}</strong>" — usually takes 15–25 seconds</div>
      </div>`;

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      // Step 1 — generate article
      const genRes = await fetch('/api/seo-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate', keyword }),
      });
      const data = await genRes.json();
      if (data.error) throw new Error(data.error);

      _generated = data;

      // Step 2 — auto-publish to GitHub
      panel.innerHTML = `
        <div class="card" style="padding:28px;text-align:center">
          <div class="spinner" style="width:28px;height:28px;margin:0 auto 14px"></div>
          <div style="font-weight:700;font-size:14px;color:var(--ch);margin-bottom:4px">Creating page…</div>
          <div style="font-size:12px;color:var(--ll)">Committing <strong>${_esc(data.slug)}.html</strong> to GitHub — Netlify deploys automatically</div>
        </div>`;

      const pubRes = await fetch('/api/seo-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'publish',
          slug: data.slug,
          html: data.html,
          title: data.article && data.article.title ? data.article.title : data.slug,
        }),
      });
      const pubData = await pubRes.json();
      if (pubData.error) throw new Error(pubData.error);

      _renderSuccess(data, pubData, keyword);

    } catch (e) {
      // If we have the article HTML but publish failed, show the result with manual publish button
      if (_generated && _generated.html) {
        _renderResult(_generated, keyword);
        if (typeof UI !== 'undefined') UI.toast('Article ready — publish failed: ' + e.message + '. Click "Publish to Site" to retry.', 'w', 8000);
        return;
      }
      panel.innerHTML = `
        <div class="card" style="padding:24px">
          <div style="color:var(--rd);font-weight:600;font-size:14px;margin-bottom:6px">Failed to create page</div>
          <div style="font-size:13px;color:var(--ll);margin-bottom:14px">${_esc(e.message)}</div>
          <button class="btn bp btn-sm" onclick="SEO.generate(${_esc(JSON.stringify(keyword))})">Try again</button>
          <button class="btn bo btn-sm" style="margin-left:8px" onclick="document.getElementById('gen-panel').style.display='none'">Dismiss</button>
        </div>`;
    }
  }

  function _renderSuccess(data, pubData, keyword) {
    const panel = document.getElementById('gen-panel');
    const slug  = data.slug || 'generated-article';
    const title = (data.article && data.article.title) ? data.article.title : keyword;
    const liveUrl = pubData.url || ('https://askmiro.co.uk/' + slug);

    panel.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;border-color:#059669">
        <div style="background:linear-gradient(135deg,#052e16,#064E3B);padding:20px 24px;display:flex;align-items:center;gap:14px">
          <div style="width:40px;height:40px;border-radius:50%;background:#059669;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div style="flex:1">
            <div style="font-weight:700;color:#ECFDF5;font-size:15px;margin-bottom:3px">Page created! Netlify is deploying…</div>
            <div style="font-size:12px;color:#6EE7B7">${_esc(title)}</div>
          </div>
          <button class="btn bo btn-sm" style="border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.7)" onclick="document.getElementById('gen-panel').style.display='none';document.getElementById('custom-keyword').value=''">✕ Clear</button>
        </div>
        <div style="padding:20px">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
            ${[
              ['Live URL', liveUrl],
              ['Filename', slug + '.html'],
              ['Status', pubData.sitemapUpdated ? 'sitemap.xml updated' : 'Deploying…'],
            ].map(([label, val]) => `
            <div style="background:var(--of);border:1px solid var(--bd);border-radius:8px;padding:12px 14px">
              <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ll);margin-bottom:4px">${label}</div>
              <div style="font-size:12px;font-weight:600;color:var(--ch);word-break:break-all">${_esc(val)}</div>
            </div>`).join('')}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
            <a href="${liveUrl}" target="_blank" class="btn bp btn-sm">Open live page →</a>
            ${pubData.commitUrl ? `<a href="${_esc(pubData.commitUrl)}" target="_blank" class="btn bo btn-sm">View commit</a>` : ''}
            <button class="btn bo btn-sm" onclick="SEO.download()">Download HTML</button>
          </div>
          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:12px 14px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#0369A1;margin-bottom:5px">Speed up indexing</div>
            <div style="font-size:12px;color:#0C4A6E;line-height:1.6">Submit <code style="background:#E0F2FE;padding:1px 4px;border-radius:3px">${_esc(liveUrl)}</code> to <strong>Google Search Console</strong> to get it indexed faster.</div>
          </div>
        </div>
      </div>`;

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof UI !== 'undefined') UI.toast('Page created and deploying!', 's', 5000);
  }

  function _renderResult(data, keyword) {
    const panel = document.getElementById('gen-panel');
    const slug  = data.slug || 'generated-article';
    const title = data.article?.title || keyword;
    const lines = (data.html || '').split('\n').length;

    panel.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;border-color:#059669">

        <!-- Success header -->
        <div style="background:var(--gb);border-bottom:1px solid #A7F3D0;padding:16px 20px;display:flex;align-items:center;gap:12px">
          <div style="width:32px;height:32px;border-radius:50%;background:#059669;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:14px;color:#064E3B">Article generated — ready to publish</div>
            <div style="font-size:12px;color:#047857;margin-top:1px">${_esc(title)}</div>
          </div>
          <button class="btn bo btn-sm" onclick="document.getElementById('gen-panel').style.display='none';document.getElementById('custom-keyword').value=''">
            ✕ Clear
          </button>
        </div>

        <div style="padding:20px">

          <!-- File info -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
            ${[
              ['Filename', slug + '.html'],
              ['URL path', '/' + slug],
              ['File size', '~' + Math.round(lines * 0.065) + ' KB'],
            ].map(([label, val]) => `
            <div style="background:var(--of);border:1px solid var(--bd);border-radius:8px;padding:12px 14px">
              <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ll);margin-bottom:4px">${label}</div>
              <div style="font-size:13px;font-weight:600;color:var(--ch);word-break:break-all">${_esc(val)}</div>
            </div>`).join('')}
          </div>

          <!-- Publish CTA -->
          <div style="background:linear-gradient(135deg,#0C1929 0%,#0D2420 100%);border:1px solid #0D9488;border-radius:10px;padding:18px 20px;margin-bottom:16px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
              <div>
                <div style="font-weight:700;color:#e8f4f3;font-size:14px;margin-bottom:3px">Push to GitHub → Netlify deploys automatically</div>
                <div style="font-size:12px;color:#6b8fa8">Commits the HTML to your repo + updates sitemap.xml. Live in ~60 seconds.</div>
              </div>
              <button id="publish-btn" class="btn bp" style="background:linear-gradient(135deg,#0DBDAD,#0D9488);white-space:nowrap" onclick="SEO.publish()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                Publish to Site
              </button>
            </div>
          </div>

          <!-- Secondary actions -->
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
            <button class="btn bo btn-sm" onclick="SEO.previewHTML()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Preview
            </button>
            <button class="btn bo btn-sm" onclick="SEO.download()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download HTML
            </button>
            <button class="btn bo btn-sm" onclick="SEO.copyHTML()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy HTML
            </button>
          </div>

          <!-- After publish: submit to Search Console reminder -->
          <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:12px 14px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#0369A1;margin-bottom:5px">After publishing</div>
            <div style="font-size:12px;color:#0C4A6E;line-height:1.6">Submit <code style="background:#E0F2FE;padding:1px 4px;border-radius:3px">https://askmiro.co.uk/${_esc(slug)}</code> to <strong>Google Search Console</strong> to get it indexed faster.</div>
          </div>

        </div>
      </div>`;

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── PUBLISH TO GITHUB ────────────────────────────────────
  async function publish() {
    if (!_generated?.html) return;

    const btn = document.getElementById('publish-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div> Publishing…';
    }

    try {
      const res = await fetch('/api/seo-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'publish',
          slug: _generated.slug,
          html: _generated.html,
          title: _generated.article?.title || _generated.slug,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Replace publish button area with success state
      const publishArea = btn?.closest('div[style*="gradient"]');
      if (publishArea) {
        publishArea.style.background = 'linear-gradient(135deg,#052e16 0%,#064E3B 100%)';
        publishArea.style.borderColor = '#059669';
        publishArea.innerHTML = `
          <div style="display:flex;align-items:center;gap:14px;width:100%">
            <div style="width:36px;height:36px;border-radius:50%;background:#059669;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <div style="flex:1">
              <div style="font-weight:700;color:#ECFDF5;font-size:14px;margin-bottom:2px">Published! Netlify is deploying now…</div>
              <div style="font-size:12px;color:#6EE7B7;line-height:1.7">
                Live in ~60s at <a href="${data.url}" target="_blank" style="color:#34D399;text-decoration:underline">${data.url}</a><br>
                ${data.sitemapUpdated ? '✓ sitemap.xml updated · ' : ''}
                ${data.commitUrl ? `<a href="${data.commitUrl}" target="_blank" style="color:#34D399;text-decoration:underline">view commit →</a>` : ''}
              </div>
            </div>
          </div>`;
      }

      UI.toast('Published to GitHub — deploying now', 's', 5000);

    } catch (e) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> Publish to Site';
      }

      const errMsg = e.message.includes('GITHUB_TOKEN')
        ? 'Add GITHUB_TOKEN to your Netlify environment variables first — see instructions below'
        : e.message;

      UI.toast('Publish failed: ' + errMsg, 'e', 7000);

      // Show setup instructions if token is missing
      if (e.message.includes('GITHUB_TOKEN')) {
        const panel = document.getElementById('gen-panel');
        const existing = panel?.querySelector('.github-token-instructions');
        if (!existing && panel) {
          const div = document.createElement('div');
          div.className = 'github-token-instructions';
          div.style.cssText = 'margin-top:14px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 16px';
          div.innerHTML = `
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#991B1B;margin-bottom:8px">One-time setup: add GITHUB_TOKEN</div>
            <ol style="margin-left:16px;display:flex;flex-direction:column;gap:6px">
              <li style="font-size:12px;color:#7F1D1D;line-height:1.5">Go to <strong>GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens</strong></li>
              <li style="font-size:12px;color:#7F1D1D;line-height:1.5">Create token with <strong>Contents: Read and write</strong> permission on the AskMiro repo</li>
              <li style="font-size:12px;color:#7F1D1D;line-height:1.5">Go to <strong>Netlify → Site → Environment variables</strong> → add <code style="background:#FEE2E2;padding:1px 4px;border-radius:3px">GITHUB_TOKEN</code> = your token</li>
              <li style="font-size:12px;color:#7F1D1D;line-height:1.5">Trigger a Netlify redeploy, then click Publish again</li>
            </ol>`;
          panel.appendChild(div);
        }
      }
    }
  }

  // ── ACTIONS ──────────────────────────────────────────────
  function download() {
    if (!_generated?.html) return;
    const slug = _generated.slug || 'article';
    const blob = new Blob([_generated.html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = slug + '.html';
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('Downloaded ' + slug + '.html', 's');
  }

  function copyHTML() {
    if (!_generated?.html) return;
    navigator.clipboard.writeText(_generated.html).then(() => {
      UI.toast('HTML copied to clipboard', 's');
    }).catch(() => {
      UI.toast('Copy failed — try Download instead', 'w');
    });
  }

  function previewHTML() {
    if (!_generated?.html) return;
    const win = window.open('', '_blank');
    if (!win) { UI.toast('Pop-up blocked — use Download instead', 'w'); return; }
    win.document.write(_generated.html);
    win.document.close();
  }

  function refreshSuggestions() {
    const wrap = document.getElementById('suggestions-wrap');
    if (wrap) wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;color:var(--ll);font-size:13px;padding:20px 0">
        <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
        Loading keyword ideas…
      </div>`;
    _loadSuggestions();
  }

  function _bindCustomInput() {
    // focus custom input when the module loads
    setTimeout(() => {
      const el = document.getElementById('custom-keyword');
      if (el) el.focus();
    }, 100);
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render, generate, publish, download, copyHTML, previewHTML, refreshSuggestions };
})();
