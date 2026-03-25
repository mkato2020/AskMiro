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
    <p style="font-size:13px;color:var(--ll);line-height:1.6">Pick a keyword idea or type your own. Claude writes a full, publish-ready HTML page matching your site's exact design. Download it and drop it into your repo — Netlify deploys it automatically.</p>
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
          ${['Pick a keyword or type your own', 'Claude writes the full article (15–25s)', 'Download the HTML file', 'Drop it in your repo root', 'Commit &amp; push → Netlify deploys it', 'Add the URL to sitemap.xml'].map((s, i) => `
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
            onclick="SEO.generate(${JSON.stringify(k.keyword)})"
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
      const res = await fetch('/api/seo-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate', keyword }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      _generated = data;
      _renderResult(data, keyword);

    } catch (e) {
      panel.innerHTML = `
        <div class="card" style="padding:24px">
          <div style="color:var(--rd);font-weight:600;font-size:14px;margin-bottom:6px">Generation failed</div>
          <div style="font-size:13px;color:var(--ll);margin-bottom:14px">${_esc(e.message)}</div>
          <button class="btn bp btn-sm" onclick="SEO.generate(${JSON.stringify(keyword)})">Try again</button>
          <button class="btn bo btn-sm" style="margin-left:8px" onclick="document.getElementById('gen-panel').style.display='none'">Dismiss</button>
        </div>`;
    }
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
            <div style="font-weight:700;font-size:14px;color:#064E3B">Article generated successfully</div>
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

          <!-- Actions -->
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
            <button class="btn bp" onclick="SEO.download()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download HTML
            </button>
            <button class="btn bo" onclick="SEO.copyHTML()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy HTML
            </button>
            <button class="btn bo" onclick="SEO.previewHTML()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Preview
            </button>
          </div>

          <!-- Next steps -->
          <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#92400E;margin-bottom:8px">Next steps to publish</div>
            <ol style="margin-left:16px;display:flex;flex-direction:column;gap:5px">
              ${[
                `Save <code style="background:#FEF3C7;padding:1px 5px;border-radius:3px;font-size:11px">${slug}.html</code> to your project root`,
                'Commit and push to GitHub — Netlify auto-deploys',
                `Add <code style="background:#FEF3C7;padding:1px 5px;border-radius:3px;font-size:11px">&lt;url&gt;https://askmiro.co.uk/${slug}&lt;/url&gt;</code> to sitemap.xml`,
                'Submit the URL to Google Search Console',
              ].map(s => `<li style="font-size:12px;color:#78350F;line-height:1.5">${s}</li>`).join('')}
            </ol>
          </div>

        </div>
      </div>`;

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  return { render, generate, download, copyHTML, previewHTML, refreshSuggestions };
})();
