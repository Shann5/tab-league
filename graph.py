"""Build the graph view from data/topics.json:
   out/graph.html - topics as clusters, pages as nodes, laid out by a small
                    hand-rolled SVG force simulation (no d3, no libraries).
Each topic is a hub node; its pages hang off it. Each area has an anchor point on a
ring that pulls its hubs in, so topics from the same area sit together."""
import json, os, html
HERE = os.path.dirname(os.path.abspath(__file__))
topics = json.load(open(f"{HERE}/data/topics.json"))
import time
SNAP = time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(f"{HERE}/data/tabs.json")))
e = html.escape

AREAS = list(dict.fromkeys(t["area"] for t in topics))   # first-seen order = colour order
nodes, links = [], []
for ti, t in enumerate(topics):
    hub = len(nodes)
    nodes.append({"k": "t", "a": AREAS.index(t["area"]), "ti": ti, "label": t["topic"], "n": len(t["items"])})
    for it in t["items"]:
        p = it.get("paper")
        nodes.append({"k": "p", "a": AREAS.index(t["area"]), "ti": ti, "label": it["title"], "url": it["url"],
                      "dom": it["domain"], "c": it["copies"], "prof": it["profile"],
                      **({"paper": f'{p["authors"]} · {p["year"]}'} if p else {})})
        links.append([hub, len(nodes) - 1])
pages = len(nodes) - len(topics)
data = json.dumps({"areas": AREAS, "topics": [t["topic"] for t in topics], "nodes": nodes, "links": links},
                  ensure_ascii=False).replace("</", "<\\/")

# Categorical slots 1-6 in fixed order; "Close" (dead pages) is deliberately neutral gray.
LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
def area_vars(pal, gray):
    out, slot = [], 0
    for i, a in enumerate(AREAS):
        out.append(f"--a{i}:{gray if a == 'Close' else pal[slot]}")
        slot += a != "Close"
    return ";".join(out)
DARK_VARS = f"--bg:#151514;--fg:#ecebe6;--mut:#9a988f;--card:#1e1e1c;--line:#2e2d2a;--edge:#3a3936;--acc:#8ea2ff;{area_vars(DARK, '#77756f')}"
legend = "".join(f'<button class="chip" data-a="{i}" aria-pressed="true"><i style="background:var(--a{i})"></i>{e(a)}'
                 f'<span class="n">{sum(len(t["items"]) for t in topics if t["area"] == a)}</span></button>' for i, a in enumerate(AREAS))

CSS = f"""
:root{{--bg:#faf9f6;--fg:#1d1d1b;--mut:#77756f;--card:#fff;--line:#e7e4dc;--edge:#d9d5ca;--acc:#3b5bdb;{area_vars(LIGHT, '#a8a59c')}}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{color-scheme:dark;{DARK_VARS}}}}}
:root[data-theme="dark"]{{color-scheme:dark;{DARK_VARS}}}
html,body{{height:100%}} body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,system-ui,sans-serif;display:flex;flex-direction:column;overflow:hidden}}
.top{{display:flex;gap:18px;justify-content:center;padding:14px 16px;font-size:13px;border-bottom:1px solid var(--line);flex-wrap:wrap}}.top a{{color:var(--mut);text-decoration:none}}.top a.on{{color:var(--fg);font-weight:600}}
header{{padding:14px 16px 10px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;border-bottom:1px solid var(--line)}}
h1{{margin:0;font-size:20px}} .sub{{color:var(--mut);font-size:12px;flex:1 1 220px}}
input{{flex:1 1 220px;max-width:340px;box-sizing:border-box;padding:7px 10px;font:inherit;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg)}}
.legend{{display:flex;flex-wrap:wrap;gap:6px;width:100%}}
.chip{{display:inline-flex;align-items:center;gap:6px;font:12px/1 inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 10px;cursor:pointer}}
.chip i{{width:9px;height:9px;border-radius:50%}} .chip .n{{color:var(--mut)}} .chip[aria-pressed=false]{{opacity:.45}} .chip[aria-pressed=false] i{{background:transparent!important;outline:1.5px solid var(--mut)}}
.stage{{position:relative;flex:1;min-height:0}}
svg{{display:block;width:100%;height:100%;touch-action:none;cursor:grab;user-select:none}} svg.panning{{cursor:grabbing}}
.edge{{stroke:var(--edge);stroke-width:1}}
.node{{stroke:var(--bg);stroke-width:1.5;cursor:pointer}} .node.hub{{stroke-width:2.5}} .node.paper{{stroke:var(--fg);stroke-width:1.5}}
.node.person{{fill:var(--bg);stroke:var(--fg);stroke-width:2}} .edge.pedge{{stroke-dasharray:3 3}}
.lbls{{font-weight:600;fill:var(--fg);paint-order:stroke;stroke:var(--bg);stroke-linejoin:round;pointer-events:none}}
.dim{{opacity:.12}} .off{{display:none}} .lbls .hide{{visibility:hidden}} .hot{{stroke:var(--fg);stroke-width:2.5}} .edge.hot{{stroke:var(--mut);stroke-width:1.5}}
.tip{{position:absolute;pointer-events:none;max-width:300px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);overflow-wrap:anywhere;display:none}}
.tip b{{display:block;font-size:13px;margin-bottom:2px}} .tip span{{display:block;color:var(--mut)}}
.tools{{position:absolute;right:12px;bottom:12px;display:flex;gap:6px}}
.tools button{{font:13px/1 inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 10px;cursor:pointer}}
"""

JS = r"""
(async () => {
const D = JSON.parse(document.getElementById('data').textContent);
// People as first-class nodes: brain/people.js recognises profile pages (X, LinkedIn, GitHub, Scholar) and merges
// one person's profiles; each person hangs off their pages. Opened as a file, the import fails and the graph is as before.
try {
  const { groupPeople } = await import('/brain/people.js');
  const pageIdx = D.nodes.map((n, i) => i).filter(i => D.nodes[i].k === 'p');
  for (const p of groupPeople(pageIdx.map(i => ({ url: D.nodes[i].url, title: D.nodes[i].label })))) {
    const first = D.nodes[pageIdx[p.pages[0]]], h = D.nodes.length;
    D.nodes.push({ k: 'h', a: first.a, ti: first.ti, label: p.name, n: p.pages.length,
                   sites: p.pages.map(j => D.nodes[pageIdx[j]].dom).join(', ') });
    for (const j of p.pages) D.links.push([h, pageIdx[j]]);
  }
} catch (err) { console.info('brain/people.js not loaded; graph without people', err); }
const NS = 'http://www.w3.org/2000/svg', svg = document.querySelector('svg'), vp = svg.querySelector('#vp');
const tip = document.querySelector('.tip'), q = document.getElementById('q');
const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // deterministic first layout

// ---- model
const N = D.nodes, A = D.areas.length;
N.forEach(n => { n.r = n.k === 't' ? 7 + Math.sqrt(n.n) * 1.6 : n.k === 'h' ? 5 + n.n : 4 + Math.min(n.c - 1, 3) * 1.5; n.vx = n.vy = 0; n.nb = []; });
const L = D.links.map(([s, t]) => ({ s: N[s], t: N[t], len: N[s].k === 'h' ? 26 : 22 + Math.sqrt(N[s].n) * 4, k: 0.5 }));
L.forEach(l => { l.s.nb.push(l.t); l.t.nb.push(l.s); });
// one anchor per area on an ellipse shaped like the viewport; hubs start at their anchor, pages next to their hub
const box = svg.getBoundingClientRect(), aspect = Math.max(0.6, Math.min(2, box.width / Math.max(box.height, 1)));
const anchor = D.areas.map((_, i) => { const t = i / A * 2 * Math.PI - Math.PI / 2; return [Math.cos(t) * 340 * aspect, Math.sin(t) * 340]; });
const hubs = N.filter(n => n.k === 't');
hubs.forEach(h => { h.x = anchor[h.a][0] + (rand() - .5) * 80; h.y = anchor[h.a][1] + (rand() - .5) * 80; });
N.forEach(n => { if (n.k === 'p') { const h = n.nb[0]; n.x = h.x + (rand() - .5) * 60; n.y = h.y + (rand() - .5) * 60; } });
N.forEach(n => { if (n.k === 'h') { const p = n.nb[0]; n.x = p.x + (rand() - .5) * 30; n.y = p.y + (rand() - .5) * 30; } });

// ---- simulation: pairwise repulsion + collision, springs, weak gravity, velocity decay
let alpha = 1, alphaTarget = 0, running = false;
function tick() {
  alpha += (alphaTarget - alpha) * 0.0228;
  for (let i = 0; i < N.length; i++) {
    const a = N[i];
    for (let j = i + 1; j < N.length; j++) {
      const b = N[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 === 0) { dx = rand() - .5; dy = rand() - .5; d2 = dx * dx + dy * dy; }
      if (d2 > 160000) continue;                                   // ignore pairs > 400px apart
      const qa = a.k === 't' ? 6 : 1, qb = b.k === 't' ? 6 : 1;
      let f = -30 * alpha / d2;
      const d = Math.sqrt(d2), min = a.r + b.r + 2;
      if (d < min) f -= (min - d) / d * 0.5;                       // collision: push overlapping nodes apart
      a.vx += dx * f * qb; a.vy += dy * f * qb; b.vx -= dx * f * qa; b.vy -= dy * f * qa;
    }
  }
  for (const l of L) {
    const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - l.len) / d * alpha * l.k, fx = dx * f / 2, fy = dy * f / 2;
    l.s.vx += fx; l.s.vy += fy; l.t.vx -= fx; l.t.vy -= fy;
  }
  for (const n of N) {
    if (n.k === 't') { n.vx += (anchor[n.a][0] - n.x) * 0.02 * alpha; n.vy += (anchor[n.a][1] - n.y) * 0.02 * alpha; }
    else { n.vx -= n.x * 0.002 * alpha; n.vy -= n.y * 0.002 * alpha; }
    if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; continue; }
    n.vx *= 0.6; n.vy *= 0.6; n.x += n.vx; n.y += n.vy;
  }
}

// ---- view
const gE = el('g', {}, vp), gN = el('g', {}, vp), gL = el('g', { class: 'lbls' }, vp);
L.forEach(l => l.el = el('line', { class: 'edge' + (l.s.k === 'h' ? ' pedge' : '') }, gE));
N.forEach((n, i) => {
  n.el = el('circle', { r: n.r, fill: `var(--a${n.a})`, class: 'node' + (n.k === 't' ? ' hub' : n.k === 'h' ? ' person' : '') + (n.paper ? ' paper' : ''), 'data-i': i }, gN);
  if (n.k === 't') {                                             // "Papers — LLM inference" wraps onto two lines at the dash
    n.lbl = el('text', { 'text-anchor': 'middle' }, gL);
    n.lines = n.label.split(' — ').map((s, j) => Object.assign(el('tspan', j ? { dy: '1.15em' } : {}, n.lbl), { textContent: s }));
  }
});
function draw() {
  for (const l of L) { l.el.setAttribute('x1', l.s.x); l.el.setAttribute('y1', l.s.y); l.el.setAttribute('x2', l.t.x); l.el.setAttribute('y2', l.t.y); }
  for (const n of N) {
    n.el.setAttribute('cx', n.x); n.el.setAttribute('cy', n.y);
    if (n.lbl) { n.lbl.setAttribute('y', n.y - n.r - (5 + (n.lines.length - 1) * 14) / view.k); n.lines.forEach(t => t.setAttribute('x', n.x)); }
  }
}
// hide topic labels that would overlap a bigger topic's label; zooming in brings them back
const bySize = hubs.slice().sort((a, b) => b.n - a.n);
function declutter() {
  const kept = [], pad = 3 / view.k;
  for (const h of bySize) {
    if (h.el.classList.contains('off')) continue;
    const b = h.lbl.getBBox(), clash = kept.some(k => b.x < k.x + k.width + pad && k.x < b.x + b.width + pad && b.y < k.y + k.height && k.y < b.y + b.height);
    h.lbl.classList.toggle('hide', clash && h !== hot);
    if (!clash || h === hot) kept.push(b);
  }
}
let frames = 0;
function frame() {
  tick(); tick(); draw();
  if (++frames % 8 === 0) declutter();
  if (alpha > 0.003 || alphaTarget > 0) requestAnimationFrame(frame);
  else { running = false; if (!touched) fit(); declutter(); }  // refit once the first layout settles
}
function heat(target, kick = 0) { alphaTarget = target; alpha = Math.max(alpha, kick); if (!running) { running = true; requestAnimationFrame(frame); } }

// ---- pan / zoom
let view = { x: 0, y: 0, k: 1 };
let touched = false;                                             // set once the user pans, zooms or drags
const apply = () => {
  vp.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  gL.style.fontSize = 12 / view.k + 'px'; gL.style.strokeWidth = 4 / view.k + 'px';   // labels keep a fixed on-screen size
};
const toGraph = (cx, cy) => { const r = svg.getBoundingClientRect(); return [(cx - r.left - view.x) / view.k, (cy - r.top - view.y) / view.k]; };
function fit() {
  const vis = N.filter(n => !n.el.classList.contains('off')); if (!vis.length) return;
  const r = svg.getBoundingClientRect(), pad = 16;
  for (let pass = 0; pass < 2; pass++) {                         // labels are sized by zoom, so measure, fit, measure again
    const xs = vis.map(n => n.x), ys = vis.map(n => n.y);
    vis.forEach(n => { if (n.lbl) { const b = n.lbl.getBBox(); xs.push(b.x, b.x + b.width); ys.push(b.y); } });
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    view.k = Math.min((r.width - 2 * pad) / (x1 - x0), (r.height - 2 * pad) / (y1 - y0), 2);
    view.x = r.width / 2 - (x0 + x1) / 2 * view.k; view.y = r.height / 2 - (y0 + y1) / 2 * view.k; apply(); draw();
  }
  declutter();
}
function zoomAt(cx, cy, f) {
  const r = svg.getBoundingClientRect(), px = cx - r.left, py = cy - r.top, k = Math.max(0.15, Math.min(6, view.k * f));
  view.x = px - (px - view.x) * k / view.k; view.y = py - (py - view.y) * k / view.k; view.k = k; apply(); declutter();
}
svg.addEventListener('wheel', ev => { ev.preventDefault(); touched = true; zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015)); }, { passive: false });

// ---- drag nodes (click without moving opens the page), drag background to pan
let drag = null;
svg.addEventListener('pointerdown', ev => {
  const i = ev.target.dataset && ev.target.dataset.i;
  svg.setPointerCapture(ev.pointerId); touched = true;
  if (i != null) { const n = N[+i]; drag = { n, sx: ev.clientX, sy: ev.clientY, moved: false }; n.fx = n.x; n.fy = n.y; heat(0.3, 0.3); }
  else { drag = { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }; svg.classList.add('panning'); }
  hideTip();
});
svg.addEventListener('pointermove', ev => {
  if (!drag) return hover(ev);
  if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 4) drag.moved = true;
  if (drag.pan) { view.x = drag.vx + ev.clientX - drag.sx; view.y = drag.vy + ev.clientY - drag.sy; apply(); }
  else { [drag.n.fx, drag.n.fy] = toGraph(ev.clientX, ev.clientY); }
});
function endDrag(ev) {
  if (!drag) return;
  if (drag.n) { const n = drag.n; n.fx = n.fy = null; heat(0); if (!drag.moved && n.url && ev.type === 'pointerup') window.open(n.url, '_blank', 'noopener'); }
  svg.classList.remove('panning'); drag = null;
}
svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);

// ---- hover: tooltip + highlight neighbourhood
let hot = null;
function hover(ev) {
  const i = ev.target.dataset && ev.target.dataset.i, n = i != null ? N[+i] : null;
  if (n !== hot) { setHot(n); }
  if (!n) return hideTip();
  const t = n.k === 't', h = n.k === 'h';
  tip.innerHTML = `<b></b><span></span><span></span>`;
  tip.children[0].textContent = n.label;
  tip.children[1].textContent = h ? `Person · ${n.n} profile${n.n > 1 ? 's' : ''}: ${n.sites}` : t ? `${D.areas[n.a]} · ${n.n} pages` : [n.dom, n.c > 1 ? `open ×${n.c}` : '', n.prof].filter(Boolean).join(' · ');
  tip.children[2].textContent = h ? 'Profiles merged by brain/people.js' : t ? 'Drag to move the cluster' : (n.paper ? n.paper + ' · ' : '') + D.topics[n.ti] + ' · D done · X remove';
  const r = svg.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  tip.style.display = 'block';
  tip.style.left = Math.min(x + 14, r.width - tip.offsetWidth - 8) + 'px';
  tip.style.top = (y + 14 + tip.offsetHeight > r.height ? y - tip.offsetHeight - 10 : y + 14) + 'px';
}
function hideTip() { tip.style.display = 'none'; }
function setHot(n) {
  if (hot) { hot.el.classList.remove('hot'); L.forEach(l => l.el.classList.remove('hot')); }
  const was = hot; hot = n;
  if (n) { n.el.classList.add('hot'); L.forEach(l => { if (l.s === n || l.t === n) l.el.classList.add('hot'); }); }
  if ((was && was.lbl) || (n && n.lbl)) declutter();          // a hovered topic always shows its label
}
svg.addEventListener('pointerleave', () => { if (!drag) { setHot(null); hideTip(); } });

// ---- filters: search dims non-matches, legend chips hide whole areas
const hidden = new Set();
function filter() {
  const s = q.value.trim().toLowerCase();
  const match = n => !s || (n.label + ' ' + (n.dom || '') + ' ' + D.topics[n.ti]).toLowerCase().includes(s);
  N.forEach(n => { const off = hidden.has(n.a); n.el.classList.toggle('off', off); n.el.classList.toggle('dim', !off && !match(n)); if (n.lbl) { n.lbl.classList.toggle('off', off); n.lbl.classList.toggle('dim', !off && !match(n)); } });
  L.forEach(l => { l.el.classList.toggle('off', hidden.has(l.s.a)); l.el.classList.toggle('dim', !!s && !(match(l.s) && match(l.t))); });
  declutter();
}
q.addEventListener('input', filter);
document.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
  const a = +b.dataset.a; hidden.has(a) ? hidden.delete(a) : hidden.add(a);
  b.setAttribute('aria-pressed', !hidden.has(a)); filter();
}));
document.getElementById('fit').onclick = fit;
document.getElementById('zin').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.3); };
document.getElementById('zout').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.3); };

// settle most of the layout before first paint, then let it finish live
for (let i = 0; i < 220; i++) tick();
draw(); fit(); heat(0);
// ---- done / removed marks (status.js): done pages fade, removed pages disappear; D / X on a hovered page
function applyStatus() {
  N.forEach(n => { if (!n.url) return; const s = TG.get(TG.norm(n.url)); n.el.classList.toggle('tg-faded', s === 'done'); n.el.classList.toggle('tg-gone', s === 'removed'); });
  L.forEach(l => l.el.classList.toggle('tg-gone', TG.get(TG.norm(l.t.url)) === 'removed'));
}
TG.onChange(applyStatus);
document.addEventListener('keydown', ev => {
  const s = { d: 'done', x: 'removed' }[ev.key.toLowerCase()];
  if (!s || !hot || !hot.url || ev.target === q || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  TG.toggle(TG.norm(hot.url), s, { title: hot.label, urls: [hot.url] });
});
window.graph = { nodes: N, get alpha() { return alpha; }, get view() { return view; } };
})();
"""

page = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>Tab League</title><style>{CSS}</style></head><body>'
        f'<nav class="top"><a href="actions.html">Action desk</a><a href="reading.html">Reading room</a><a href="index.html">Full archive</a><a class="on" href="graph.html">Graph</a><a href="search.html">Ask your tabs</a></nav>'
        f'<header><h1>Tab League · {SNAP}</h1><div class="sub">{pages} pages in {len(topics)} topics · drag a node to move it, '
        f'drag the background to pan, scroll to zoom, click a page to open it · hover a page and press D (done) or X (remove) · outlined dots are papers, rings are people</div>'
        f'<input id="q" placeholder="Search titles, domains, topics…" autocomplete="off"><div class="legend">{legend}</div></header>'
        f'<div class="stage"><svg aria-label="Graph of {pages} archived pages in {len(topics)} topics"><g id="vp"></g></svg><div class="tip"></div>'
        f'<div class="tools"><button id="zout" aria-label="Zoom out">−</button><button id="zin" aria-label="Zoom in">+</button><button id="fit">Fit</button></div></div>'
        f'<script type="application/json" id="data">{data}</script><script src="status.js"></script><script>{JS}</script></body></html>')
open(f"{HERE}/out/graph.html", "w").write(page)
print(f"wrote out/graph.html: {pages} pages, {len(topics)} topics")
