// Done / remove / undo, shared by every Tab League view.
// Served by serve.py: marks are saved to data/status.json, so every page (and every rebuild) sees them.
// Opened straight from disk: marks fall back to this browser's localStorage.
// status = { key: { s: 'done' | 'removed', at, title } }; key is a page URL without its #fragment,
// or 'act:<id>' for an Action desk task, or 'sec:<page>:<heading>' for a whole section.
(() => {
  const LS = 'tg:status', LIVE = location.protocol.startsWith('http');
  let S = {}, showRemoved = false, loaded = false, toastTimer;
  const subs = [], rows = [], secs = [];
  const norm = u => (u || '').split('#')[0];
  const get = key => S[key] && S[key].s;
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.ok ? r.json() : Promise.reject(r.status));

  const css = document.createElement('style');
  css.textContent = `
.tg-ctl{display:inline-flex;gap:2px;margin-left:8px;vertical-align:middle;opacity:.3;transition:opacity .15s}
.tg-row:hover .tg-ctl,.tg-ctl:focus-within{opacity:1}
.tg-ctl button{font:14px/1 -apple-system,system-ui,sans-serif;color:inherit;background:none;border:1px solid transparent;border-radius:6px;width:24px;height:24px;padding:0;cursor:pointer}
.tg-ctl button:hover{border-color:currentColor}
.tg-done>a,.tg-done>div>a{text-decoration:line-through} .tg-done{opacity:.5} .tg-done .tg-ok{color:#2f9e44;opacity:1}
body:not(.tg-show) .tg-removed,body:not(.tg-show) .tg-gone{display:none!important}
.tg-removed,.tg-gone,.tg-faded{opacity:.3}
.tg-toggle{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;opacity:.75}
.tg-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99;display:flex;gap:16px;align-items:center;max-width:calc(100vw - 32px);
  background:#1d1d1b;color:#fff;font:13px/1.3 -apple-system,system-ui,sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.tg-toast button{font:inherit;font-weight:600;color:#9db4ff;background:none;border:0;padding:0;cursor:pointer}
@media (prefers-color-scheme:dark){.tg-toast{background:#ecebe6;color:#1d1d1b}.tg-toast button{color:#3b5bdb}}`;
  document.head.append(css);

  function toast(msg, actions = []) {
    document.querySelector('.tg-toast')?.remove(); clearTimeout(toastTimer);
    const t = document.createElement('div'); t.className = 'tg-toast'; t.setAttribute('role', 'status');
    t.append(msg);
    for (const [label, fn] of actions) {
      const b = document.createElement('button'); b.textContent = label;
      b.onclick = () => { t.remove(); fn(); }; t.append(b);
    }
    document.body.append(t);
    toastTimer = setTimeout(() => t.remove(), 6000);
  }

  // "Show removed (n)" lives in each page's top nav, and only appears once something is removed
  let toggleBtn;
  function paintToggle() {
    const n = Object.values(S).filter(v => v.s === 'removed').length, nav = document.querySelector('.top');
    if (!nav) return;
    if (!toggleBtn) { toggleBtn = document.createElement('button'); toggleBtn.className = 'tg-toggle'; nav.append(toggleBtn);
      toggleBtn.onclick = () => { showRemoved = !showRemoved; document.body.classList.toggle('tg-show', showRemoved); paintToggle(); }; }
    toggleBtn.hidden = !n && !showRemoved;
    toggleBtn.textContent = showRemoved ? 'Hide removed' : `Show removed (${n})`;
  }

  function paint() {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]; if (!r.row.isConnected) { rows.splice(i, 1); continue; }
      const s = get(r.key);
      if (r.done) r.row.classList.toggle('tg-done', s === 'done');
      r.row.classList.toggle('tg-removed', s === 'removed');
      r.x.textContent = s === 'removed' ? '↺' : '×';
      r.x.title = s === 'removed' ? 'Restore' : 'Remove from the list';
    }
    attachSections();
    for (const e of secs) {
      const gone = secRemoved(e);
      e.sec.classList.toggle('tg-removed', gone);
      e.x.textContent = gone ? '↺' : '×';
      e.x.title = gone ? 'Restore this section' : 'Remove this whole section';
    }
    paintToggle();
    subs.forEach(f => f());
  }

  // ---- whole sections: a × on each section heading removes the section and every row in it; a section whose
  // rows have all been removed hides too. Sections are <section> elements inside <main> with an h2/h3 heading.
  const secRows = e => rows.filter(r => e.sec.contains(r.row) && r.row !== e.h);
  const secRemoved = e => get(e.key) === 'removed' || (secRows(e).length > 0 && secRows(e).every(r => get(r.key) === 'removed'));
  function attachSections() {
    for (const sec of document.querySelectorAll('main section')) {
      if (sec.dataset.tgSec) continue;
      const h = sec.querySelector(':scope > h2, :scope > h3');
      const name = h && [...h.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (!name) continue;
      sec.dataset.tgSec = '1';
      const e = { sec, h, name, key: `sec:${location.pathname.replace(/^\//, '') || 'index.html'}:${name}` };
      const box = document.createElement('span'); box.className = 'tg-ctl';
      e.x = document.createElement('button'); e.x.type = 'button'; e.x.className = 'tg-x';
      e.x.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); toggleSection(e); };
      box.append(e.x); h.append(box); h.classList.add('tg-row');
      secs.push(e);
    }
  }
  async function toggleSection(e) {
    const keys = [e.key, ...secRows(e).map(r => r.key)];
    const before = Object.fromEntries(keys.map(k => [k, S[k]]));
    const value = secRemoved(e) ? null : 'removed', at = new Date().toISOString();
    const apply = state => Promise.all(keys.map(k => {
      if (state[k]) S[k] = state[k]; else delete S[k];
      return LIVE ? post('/api/status', { key: k, value: S[k] || null }) : null;
    })).then(() => { if (!LIVE) localStorage.setItem(LS, JSON.stringify(S)); });
    const titles = Object.fromEntries([[e.key, e.name], ...secRows(e).map(r => [r.key, (r.title || '').trim().slice(0, 200)])]);
    const next = Object.fromEntries(keys.map(k => [k, value ? { s: value, at, ...(titles[k] ? { title: titles[k] } : {}) } : null]));
    try { await apply(next); paint(); }
    catch { await apply(before).catch(() => {}); paint(); return toast(LIVE ? 'Not saved: is serve.py still running?' : 'Not saved: this browser blocks storage.'); }
    toast(value ? `Removed "${e.name}"` : `Restored "${e.name}"`, [['Undo', () => apply(before).then(paint, () => toast('Undo not saved'))]]);
  }

  async function set(key, s, info = {}, quiet = false) {
    const before = S[key];
    if (s) S[key] = { s, at: new Date().toISOString(), ...(info.title ? { title: info.title.trim().slice(0, 200) } : {}) };
    else delete S[key];
    paint();
    try {
      if (LIVE) await post('/api/status', { key, value: S[key] || null });
      else localStorage.setItem(LS, JSON.stringify(S));
    } catch {
      if (before) S[key] = before; else delete S[key];
      paint();
      return toast(LIVE ? 'Not saved: is serve.py still running?' : 'Not saved: this browser blocks storage.');
    }
    if (quiet) return;
    const acts = [['Undo', () => set(key, before ? before.s : null, info, true)]];
    if (s && LIVE && info.urls && info.urls.length) acts.push(['Close its tab', () => closeTabs(info.urls)]);
    toast(s === 'done' ? 'Marked done' : s === 'removed' ? 'Removed' : 'Restored', acts);
  }
  const toggle = (key, s, info) => set(key, get(key) === s ? null : s, info);

  async function closeTabs(urls) {
    try {
      const r = await post('/api/close', { urls });
      toast(r.closed ? `Closed ${r.closed} tab${r.closed > 1 ? 's' : ''} in Chrome` : 'No open tab found for it in Chrome');
    } catch { toast('Could not reach Chrome'); }
  }

  // Adds × (and ✓ unless the page has its own done control) to a row; the row gets .tg-done / .tg-removed.
  // Controls go after `after`, or inside `into` (default: the row itself).
  function attach(row, key, { title = '', urls = [], done = true, after, into } = {}) {
    const box = document.createElement('span'); box.className = 'tg-ctl';
    const btn = (cls, label, tip, s) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.title = tip;
      b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); toggle(key, s, { title, urls }); };
      box.append(b); return b;
    };
    if (done) btn('tg-ok', '✓', 'Mark done', 'done');
    const x = btn('tg-x', '×', 'Remove from the list', 'removed');
    if (after) after.after(box); else (into || row).append(box);
    row.classList.add('tg-row'); rows.push({ row, key, done, x, title });
    if (loaded) paint();
  }

  async function load() {
    try {
      if (LIVE) S = await (await fetch('/api/status', { cache: 'no-store' })).json();
      else S = JSON.parse(localStorage.getItem(LS)) || {};
    } catch { S = {}; }
    loaded = true; paint();
  }

  window.TG = {
    norm, get, set, toggle, attach,
    onChange(fn) { subs.push(fn); if (loaded) fn(); },
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', load) : load();
})();
