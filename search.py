"""Ask your tabs, v0: instant keyword search over the archive.
   Reads  data/topics.json (topic -> pages) and data/meta.json (url -> page description)
   Writes out/search.html  - one static page, index embedded, search in vanilla JS
Every query word must match somewhere (title, description, topic, domain, paper
abstract); title hits rank above topic hits, which rank above description hits.
"""
import json, os, html

HERE = os.path.dirname(os.path.abspath(__file__))
topics = json.load(open(f"{HERE}/data/topics.json"))
meta = json.load(open(f"{HERE}/data/meta.json"))

docs = []
for t in topics:
    for i in t["items"]:
        desc = meta.get(i["url"], {}).get("desc", "")
        p = i.get("paper")
        docs.append({"u": i["url"], "t": i["title"], "d": "" if desc.strip() == i["title"].strip() else desc, "dom": i["domain"],
                     "a": t["area"], "tp": t["topic"],
                     **({"p": f'{p["authors"]} · {p["year"]} · arXiv {p["id"]}', "ab": p["abstract"]} if p else {})})

# </script> inside a title must not end the data block
data = json.dumps(docs, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
e = html.escape
# "speculative decoding" finds nothing: EAGLE's abstract says "speculative sampling". Keyword search's limit.
examples = ["speculative", "hackathon", "lisbon", "agent", "local-first"]

page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ask your tabs</title><link rel="icon" href="data:,"><style>
:root{{--bg:#faf9f6;--fg:#1d1d1b;--mut:#77756f;--card:#fff;--line:#e7e4dc;--acc:#3b5bdb;--hl:#fff1a8;--sel:#eef1fd}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151514;--fg:#ecebe6;--mut:#9a988f;--card:#1e1e1c;--line:#2e2d2a;--acc:#8ea2ff;--hl:#5b4a12;--sel:#23263a}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,system-ui,sans-serif}}
main{{max-width:820px;margin:0 auto;padding:28px 16px 64px}} h1{{margin:0 0 4px;font-size:24px}}
.sub{{color:var(--mut);margin-bottom:16px}}
input{{width:100%;box-sizing:border-box;padding:12px 14px;font:inherit;font-size:16px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg)}}
input:focus{{outline:2px solid var(--acc);outline-offset:-1px}}
.ex{{margin:10px 0 0;color:var(--mut);font-size:13px}} .ex button{{font:inherit;color:var(--acc);background:none;border:0;padding:0 8px 0 0;cursor:pointer}}
#count{{color:var(--mut);font-size:13px;margin:16px 0 6px}}
ol{{list-style:none;margin:0;padding:0}}
li{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:8px;overflow-wrap:anywhere}}
li.on{{background:var(--sel);border-color:var(--acc)}}
a{{color:var(--fg);text-decoration:none;font-weight:600}} a:hover{{color:var(--acc)}}
.where{{color:var(--mut);font-size:12px;margin-top:2px}} .where b{{font-weight:500;color:var(--fg)}}
.d{{font-size:13px;margin-top:4px;color:var(--mut)}}
mark{{background:var(--hl);color:inherit;border-radius:2px}}
.top{{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;padding:14px 16px;font-size:13px;border-bottom:1px solid var(--line)}}.top a{{color:var(--mut);font-weight:400}}.top a.on{{color:var(--fg);font-weight:600}}
</style></head><body><nav class="top"><a href="actions.html">Action desk</a><a href="reading.html">Reading room</a><a href="index.html">Full archive</a><a href="graph.html">Graph</a><a class="on" href="search.html">Ask your tabs</a></nav><main>
<h1>Ask your tabs</h1>
<div class="sub">Keyword search over {len(docs)} archived pages: titles, descriptions, topics and paper abstracts.</div>
<input id="q" type="search" placeholder="What was that page about…" autofocus autocomplete="off" spellcheck="false">
<div class="ex">Try: {''.join(f'<button>{e(x)}</button>' for x in examples)}</div>
<div id="count" aria-live="polite"></div><ol id="res"></ol>
</main>
<script id="data" type="application/json">{data}</script>
<script src="status.js"></script>
<script>
const DOCS=JSON.parse(document.getElementById('data').textContent);
// case- and accent-insensitive: "montreal" finds "Montréal"
const fold=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
const FIELDS=[['t',8],['tp',4],['a',2],['dom',2],['d',1],['p',1],['ab',.5]];
for(const d of DOCS)d.f=Object.fromEntries(FIELDS.map(([k])=>[k,fold(d[k]||'')]));
const esc=s=>s.replace(/[&<>"]/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);

function score(d,terms){{
  let total=0;
  for(const w of terms){{
    let best=0;
    for(const [k,wt] of FIELDS){{const i=d.f[k].indexOf(w);if(i<0)continue;
      // whole-word or word-start hits count more than mid-word ones
      const start=i==0||!/[\\p{{L}}\\p{{N}}]/u.test(d.f[k][i-1]);best=Math.max(best,wt*(start?1:.5))}}
    if(!best)return 0; total+=best}}
  return total}}

// highlight on the folded text, mapped back onto the original (NFD folding can change length)
function hl(s,terms){{
  if(!s)return'';const map=[];let f='';
  for(let i=0;i<s.length;i++){{const c=fold(s[i]);for(let j=0;j<c.length;j++)map.push(i);f+=c}}
  map.push(s.length);const on=new Uint8Array(s.length);
  for(const w of terms){{let i=f.indexOf(w);while(i>=0){{for(let k=map[i];k<map[i+w.length];k++)on[k]=1;i=f.indexOf(w,i+1)}}}}
  let out='',open=false;for(let i=0;i<s.length;i++){{if(on[i]!=open){{out+=on[i]?'<mark>':'</mark>';open=!open}}out+=esc(s[i])}}
  return out+(open?'</mark>':'')}}

// a window of text around the first hit, so long descriptions and abstracts stay short
function snip(s,terms,n=220){{
  if(!s)return'';const f=fold(s);let at=-1;
  for(const w of terms){{const i=f.indexOf(w);if(i>=0&&(at<0||i<at))at=i}}
  if(s.length<=n)return hl(s,terms);
  let from=Math.max(0,Math.min(at-60,s.length-n));
  const sp=s.indexOf(' ',from);if(from&&sp>=0&&sp<at&&sp-from<25)from=sp+1;  // don't start mid-word
  return(from?'…':'')+hl(s.slice(from,from+n),terms)+(from+n<s.length?'…':'')}}

const q=document.getElementById('q'),res=document.getElementById('res'),count=document.getElementById('count');
let sel=0;
function run(){{
  const terms=fold(q.value).split(/\\s+/).filter(Boolean);
  history.replaceState(null,'',terms.length?'#q='+encodeURIComponent(q.value.trim()):location.pathname);
  if(!terms.length){{res.innerHTML='';count.textContent='';return}}
  const hits=DOCS.map(d=>[score(d,terms),d]).filter(x=>x[0]).sort((a,b)=>b[0]-a[0]).slice(0,100).map(x=>x[1]);
  count.textContent=hits.length?`${{hits.length==100?'100+':hits.length}} page${{hits.length==1?'':'s'}}`:'Nothing matches every word. Try fewer or shorter words.';
  sel=0;
  res.innerHTML=hits.map((d,i)=>{{
    // show whichever of description / abstract explains the hit
    const body=d[['d','ab'].find(k=>terms.some(w=>d.f[k].includes(w)))||(d.d?'d':'ab')]||'';
    return`<li${{i?'':' class="on"'}}><a href="${{esc(d.u)}}" target="_blank" rel="noopener">${{hl(d.t,terms)}}</a>`+
      `<div class="where"><b>${{hl(d.tp,terms)}}</b> · ${{hl(d.a,terms)}} · ${{hl(d.dom,terms)}}${{d.p?' · '+hl(d.p,terms):''}}</div>`+
      (body?`<div class="d">${{snip(body,terms)}}</div>`:'')+'</li>'}}).join('');
  [...res.children].forEach((li,i)=>{{const d=hits[i];TG.attach(li,TG.norm(d.u),{{title:d.t,urls:[d.u],after:li.querySelector('a')}})}})}}
function move(n){{const li=res.children;if(!li.length)return;li[sel].classList.remove('on');
  sel=(sel+n+li.length)%li.length;li[sel].classList.add('on');li[sel].scrollIntoView({{block:'nearest'}})}}
q.addEventListener('input',run);
q.addEventListener('keydown',ev=>{{
  if(ev.key=='ArrowDown'){{ev.preventDefault();move(1)}}
  else if(ev.key=='ArrowUp'){{ev.preventDefault();move(-1)}}
  else if(ev.key=='Enter'&&res.children[sel])window.open(res.children[sel].querySelector('a').href,'_blank','noopener')}});
document.addEventListener('keydown',ev=>{{if(ev.key=='/'&&document.activeElement!=q){{ev.preventDefault();q.focus()}}}});
document.querySelectorAll('.ex button').forEach(b=>b.onclick=()=>{{q.value=b.textContent;run();q.focus()}});
// #q=… links work on load and when only the hash changes (replaceState in run() doesn't fire this)
const fromHash=()=>{{const h=new URLSearchParams(location.hash.slice(1)).get('q');if(h!=null&&h!=q.value.trim()){{q.value=h;run()}}}};
addEventListener('hashchange',fromHash);fromHash();
</script></body></html>"""
open(f"{HERE}/out/search.html", "w").write(page)
print(f"out/search.html: {len(docs)} pages, {sum('ab' in d for d in docs)} with abstracts, "
      f"{sum(bool(d['d']) for d in docs)} with descriptions, {len(page)//1024} KB")
