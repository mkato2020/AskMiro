// ============================================================
// AskMiro Ops — ui.js  (shared UI helpers)
// ============================================================
const UI = (() => {

  // ── TOAST ──────────────────────────────────────────────────
  function toast(msg, type = 'g', dur = 3200) {
    const w = document.getElementById('toast-wrap');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${type==='g'?'&#10003;':type==='r'?'&#10007;':'&#9888;'}</span>${msg}`;
    w.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 280); }, dur);
  }

  // ── MODAL ──────────────────────────────────────────────────
  function openModal(html, large = false) {
    const m = document.getElementById('modal');
    m.className = 'modal' + (large ? ' modal-lg' : '');
    m.innerHTML = html;
    document.getElementById('ov').classList.remove('hidden');
    const f = m.querySelector('input,select,textarea');
    if (f) setTimeout(() => f.focus(), 60);
  }
  function closeModal() { document.getElementById('ov').classList.add('hidden'); }

  // ── DRAWER ─────────────────────────────────────────────────
  function openDrawer(title, html) {
    document.getElementById('drawer-title').textContent = title;
    document.getElementById('drawer-body').innerHTML = html;
    document.getElementById('drawer').classList.add('open');
  }
  function closeDrawer() { document.getElementById('drawer').classList.remove('open'); }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDrawer(); } });

  // ── PILL ───────────────────────────────────────────────────
  function pill(text, cls) { return `<span class="pl ${cls}">${text}</span>`; }

  function statusPill(status) {
    const map = {
      Active:'pg', Won:'pg', Paid:'pg', Resolved:'pg', Complete:'pg', Accepted:'pg',
      PendingStart:'pt', Sent:'pt', Qualified:'pt', Scheduled:'pt',
      Draft:'pa', Negotiating:'pa', Open:'pa', 'Pending Approval':'pa',
      Lost:'pr', Missed:'pr', Expired:'pr', Overdue:'pr',
      New:'pa', Contacted:'pt', QuoteSent:'pt', Suspended:'pa', Ended:'pr'
    };
    return pill(status, map[status] || 'pt');
  }

  // ── FORMAT ─────────────────────────────────────────────────
  function fmt(n) { return '&#163;' + Math.round(parseFloat(n)||0).toLocaleString('en-GB'); }
  function fmtk(n) { const v = parseFloat(n)||0; return v >= 1000 ? '&#163;' + (v/1000).toFixed(1) + 'k' : fmt(v); }
  function fmtPct(n) { return (parseFloat(n)||0).toFixed(1) + '%'; }
  function ragCls(v, g, a) { return v >= g ? 'pg' : v >= a ? 'pa' : 'pr'; }
  function today() { return new Date().toISOString().slice(0,10); }
  function now() { return new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'}); }
  function initials(name) { return (name||'?').split(' ').map(p=>p[0]).join('').toUpperCase().slice(0,2); }

  // ── LOADER ─────────────────────────────────────────────────
  function setLoading(yes) {
    const el = document.getElementById('page-loader');
    if (el) el.style.display = yes ? 'flex' : 'none';
  }

  // ── REQUIRE FIELD ──────────────────────────────────────────
  function rq(id) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) { if(el) el.classList.add('ei'); return false; }
    el.classList.remove('ei');
    return true;
  }
  function gv(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // ── SECTION HEADER ─────────────────────────────────────────
  function secHd(tag, title, meta = '') {
    return `<div class="sec-hd"><span class="sec-tag">${tag}</span><span class="sec-title">${title}</span><div class="sec-rule"></div>${meta?`<span class="sec-meta">${meta}</span>`:''}</div>`;
  }

  // ── SVG CHARTS ─────────────────────────────────────────────
  function barLineChart(labels, bars, lines, h = 180) {
    const W = 520, H = h, pl = 46, pr = 20, pt = 14, pb = 24;
    const cW = W-pl-pr, cH = H-pt-pb;
    const maxB = Math.max(...bars)*1.1 || 1;
    const minL = Math.min(...lines)*.95 || 0, maxL = Math.max(...lines)*1.08 || 1;
    const n = labels.length;
    const bw = cW/n * 0.52;
    const cx = i => pl + i*(cW/n) + cW/n*0.24;
    const by = v => pt + cH - (v/maxB)*cH;
    const ly = v => pt + cH - ((v-minL)/(maxL-minL))*cH;
    let bars_svg = '', lpath = '', larea = '', dots = '', grid = '', xl = '', yl = '', yr = '';
    bars.forEach((b,i) => {
      const bH = (b/maxB)*cH;
      bars_svg += `<rect x="${cx(i).toFixed(1)}" y="${(pt+cH-bH).toFixed(1)}" width="${bw.toFixed(1)}" height="${bH.toFixed(1)}" fill="#0D9488" rx="2" opacity=".82"/>`;
    });
    lines.forEach((l,i) => {
      const x = cx(i)+bw/2, y = ly(l);
      lpath += (i ? `L${x},${y}` : `M${x},${y}`);
      if (!i) larea += `M${x},${pt+cH}`;
      larea += `L${x},${y}`;
      dots += `<circle cx="${x}" cy="${y}" r="3.5" fill="white" stroke="#0D9488" stroke-width="2"/>`;
    });
    larea += `L${cx(n-1)+bw/2},${pt+cH}Z`;
    [0,.5,1].forEach(p => {
      const y = pt + cH*p;
      grid += `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${(W-pr).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E5E7EB" stroke-dasharray="3,3"/>`;
      yl += `<text x="${pl-5}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#94A3B8">&pound;${((maxB-(maxB)*p)/1000).toFixed(0)}k</text>`;
      yr += `<text x="${(W-pr+5).toFixed(1)}" y="${(y+4).toFixed(1)}" font-size="9.5" fill="#0D9488">${(maxL-(maxL-minL)*p).toFixed(0)}%</text>`;
    });
    labels.forEach((lbl,i) => xl += `<text x="${(cx(i)+bw/2).toFixed(1)}" y="${H-4}" text-anchor="middle" font-size="9.5" fill="#94A3B8">${lbl}</text>`);
    return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0D9488" stop-opacity=".12"/><stop offset="100%" stop-color="#0D9488" stop-opacity="0"/></linearGradient></defs>
      ${grid}${bars_svg}<path d="${larea}" fill="url(#mg)"/><path d="${lpath}" fill="none" stroke="#0D9488" stroke-width="2.2"/>${dots}${yl}${yr}${xl}
    </svg>`;
  }

  function hBarChart(items, W = 360, H = 180) {
    const pb = 28, pt = 12, pl = 4, pr = 4, bh = 14;
    const maxV = Math.max(...items.map(i=>i.v)) || 1;
    const step = (H-pt-pb) / (items.length || 1);
    let out = '';
    items.forEach((it, i) => {
      const bW = (it.v/maxV) * (W-pl-pr-40);
      const y = pt + i*step;
      const col = it.v >= 90 ? '#059669' : it.v >= 85 ? '#D97706' : '#DC2626';
      out += `<rect x="${pl}" y="${y.toFixed(1)}" width="${bW.toFixed(1)}" height="${bh}" fill="${col}" rx="2" opacity=".85"/>`;
      out += `<text x="${(pl+bW+4).toFixed(1)}" y="${(y+bh/2+4).toFixed(1)}" font-size="9" font-weight="700" fill="${col}">${it.v}%</text>`;
      const lbl = it.label.length > 12 ? it.label.slice(0,12)+'&#8230;' : it.label;
      out += `<text x="${pl}" y="${(y+step-4).toFixed(1)}" font-size="8.5" fill="#94A3B8">${lbl}</text>`;
    });
    [85,90].forEach(v => {
      const x = pl + (v/maxV)*(W-pl-pr-40);
      const col = v===90?'#059669':'#D97706';
      out += `<line x1="${x.toFixed(1)}" y1="${pt}" x2="${x.toFixed(1)}" y2="${H-pb}" stroke="${col}" stroke-dasharray="4,3" stroke-width="1.2"/>`;
    });
    return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${out}</svg>`;
  }

  return { toast, openModal, closeModal, openDrawer, closeDrawer, pill, statusPill, fmt, fmtk, fmtPct, ragCls, today, now, initials, setLoading, rq, gv, secHd, barLineChart, hBarChart };
})();
