"""Build the two working views from the archive:
   out/actions.html - forms to submit and deadlines, on a timeline
   out/reading.html - a calm reading room, grouped by category
Curation is by index into data/tabs.json: replace the lists below with your own."""
import json, os, re, html
HERE = os.path.dirname(os.path.abspath(__file__))
tabs = json.load(open(f"{HERE}/data/tabs.json"))
arxiv = json.load(open(f"{HERE}/data/arxiv.json"))
def norm(u): return u.split("#")[0]
def arxiv_id(u):
    m = re.search(r"(\d{4}\.\d{4,5})", u)
    return m.group(1) if m and ("arxiv" in u or "huggingface.co/papers" in u) else None
meta = json.load(open(f"{HERE}/data/meta.json"))
e = html.escape
PT = "-07:00"

# ---------------------------------------------------------------- actions
# Curated by hand (or by your agent) for YOUR snapshot, by index into data/tabs.json; these entries match the
# demo snapshot in demo/. Check deadlines on the live pages before you rely on them.
# (indices, title, due ISO or None, note)
DATED = [
  ([10], "Local-First Conf 2031 — talk proposal", "2031-01-20T23:59-08:00", "Demo entry: a call for talks."),
  ([9], "Open Agents Hackathon 2031 — register", "2031-02-15T23:59-08:00", "Demo entry: two weeks, online."),
  ([8], "Indie AI Builders Fund — application", "2031-03-31T23:59-07:00", "Demo entry: reviewed monthly."),
]
TRIP_NAME = "Lisbon — this trip"
TRIP = [
  ([14], "Hotel Alfama — confirm the booking", "Demo entry: check-in date is on the booking page."),
  ([15], "National Tile Museum — tickets", ""),
]
ROLLING = [
  ([31], "Beta feedback form", "Demo entry: left half filled in."),
]
JOBS = [27, 28]
DONE = [([7], "Ask HN thread — replied", "Demo entry.")]
NOT_ELIGIBLE = []   # tab indices: programs you can't apply to
PASSED = [30]       # tab indices: events and deadlines already gone
def links(idxs):
    seen, out = set(), []
    for i in idxs:
        u = tabs[i][2]
        if norm(u) in seen: continue
        seen.add(norm(u))
        out.append(f'<a href="{e(u)}" target="_blank">{e((tabs[i][3] or u)[:70])}</a>')
    return " · ".join(out)

def due_label(due):
    from datetime import datetime
    d = datetime.fromisoformat(due)
    tz = {"-07:00": "PT", "-08:00": "PT", "-04:00": "ET", "+04:00": "GST"}.get(due[-6:], "")
    return f"{d:%b} {d.day}, {d:%-I:%M%p}".replace(":00", "").lower().capitalize() + f" {tz}"

def act_row(key, title, note, idxs, due=None):
    d = f' data-due="{due}" data-label="{due_label(due)}"' if due else ""
    return (f'<li class="act" data-key="{e(key)}"{d}><label><input type="checkbox"><span class="t">{e(title)}</span></label>'
            f'<span class="when"></span><div class="note">{e(note)}</div><div class="lk">{links(idxs)}</div></li>')

def actions_page():
    dated = "".join(act_row(f"d{i[0]}", t, n, i, due) for i, t, due, n in DATED)
    trip = "".join(act_row(f"t{i[0]}", t, n, i) for i, t, n in TRIP)
    roll = "".join(act_row(f"r{i[0]}", t, n, i) for i, t, n in ROLLING)
    jobs = "".join(act_row(f"j{i}", re.sub(r"\s*[|@—-]\s*(Career Opportunities|LinkedIn)$", "", tabs[i][3] or tabs[i][2])[:90],
                           "", [i]) for i in JOBS)
    done = "".join(act_row(f"x{i[0]}", t, n, i).replace('<input type="checkbox">', '<input type="checkbox" checked disabled>').replace('class="act"', 'class="act done"') for i, t, n in DONE)
    inelig = " · ".join(f'<a href="{e(tabs[i][2])}" target="_blank">{e((tabs[i][3] or tabs[i][2])[:48])}</a>' for i in NOT_ELIGIBLE)
    passed = " · ".join(f'<a href="{e(tabs[i][2])}" target="_blank">{e((tabs[i][3] or tabs[i][2])[:48])}</a>' for i in PASSED)
    body = f"""
<header><p class="kicker">Action desk</p><h1>What needs you, in order</h1>
<p class="lede">Forms waiting to be sent and dates that will not wait. Tick things off; it remembers.</p></header>
<section><h2>Deadlines</h2><ol class="acts timeline">{dated}</ol></section>
<section><h2>{e(TRIP_NAME)}</h2><ul class="acts">{trip}</ul></section>
<section><h2>Forms to finish <span class="sub">no hard deadline found</span></h2><ul class="acts">{roll}</ul></section>
<section><h2>Job applications <span class="sub">{len(JOBS)} roles, rolling</span></h2><ul class="acts compact">{jobs}</ul></section>
<section><h2>Done</h2><ul class="acts">{done}</ul></section>
<section><h2>Not eligible</h2><p class="passed">{inelig}</p></section>
<section><h2>Already passed <span class="sub">safe to close</span></h2><p class="passed">{passed}</p></section>
<section id="found" hidden><h2>Dates found in your archive <span class="sub">read from page titles and descriptions</span></h2>
<p class="intro" id="found-intro"></p>
<h3 class="found-h">Coming up</h3><ul class="acts compact" id="found-up"></ul>
<h3 class="found-h">Already happened <span class="sub">safe to close</span></h3><ul class="acts compact" id="found-past"></ul></section>
<script type="application/json" id="archive">{archive_json()}</script>"""
    script = """
const now=Date.now(), DAY=864e5;
document.querySelectorAll('.act[data-due]').forEach(li=>{
  const left=(new Date(li.dataset.due)-now)/DAY, w=li.querySelector('.when'), date=li.dataset.label;
  w.textContent = left<0 ? `${date} · passed` : left<1 ? `${date} · ${Math.max(1,Math.round(left*24))}h left` : `${date} · ${Math.floor(left)}d left`;
  li.classList.add(left<0?'past':left<3?'hot':left<14?'soon':'later');
});
document.querySelectorAll('.act').forEach(li=>{
  const key='act:'+li.dataset.key, cb=li.querySelector('input'),
    info={title:li.querySelector('.t').textContent, urls:[...li.querySelectorAll('.lk a')].map(a=>a.getAttribute('href'))};
  TG.attach(li,key,{...info,done:false,into:li.querySelector('.when')});
  if(cb.disabled)return;
  cb.onchange=()=>TG.set(key,cb.checked?'done':null,info);
  TG.onChange(()=>{cb.checked=TG.get(key)==='done';li.classList.toggle('done',cb.checked)});
});"""
    module = """
// Dates found in the archive: brain/dates.js runs here, against today's date, so "past" stays true without a rebuild.
let dates;
try { dates = await import('/brain/dates.js'); } catch { dates = null; }   // opened as a file: the section stays hidden
if (dates) {
  const today = new Date().toLocaleDateString('en-CA');                   // YYYY-MM-DD in local time
  const onDesk = new Set([...document.querySelectorAll('main a[href]')].map(a => TG.norm(a.getAttribute('href'))));
  const pages = JSON.parse(document.getElementById('archive').textContent).filter(p => !onDesk.has(TG.norm(p.u)));
  const found = pages.map(p => ({ ...p, ds: dates.findDates(p.t + ' · ' + p.d, today) })).filter(p => p.ds.length)
    .map(p => ({ ...p, st: dates.eventStatus(p.ds, today), last: p.ds.at(-1) }));
  const fmt = iso => new Date(iso + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const row = p => {
    const li = document.createElement('li'); li.className = 'act' + (p.st === 'past' ? ' past' : '');
    li.innerHTML = '<span class="t"><a target="_blank"></a></span><span class="when"></span><div class="note"></div>';
    const a = li.querySelector('a'); a.href = p.u; a.textContent = p.t.slice(0, 90);
    li.querySelector('.when').textContent = p.st === 'past' ? fmt(p.last) : p.st === 'today' ? 'today' : fmt(p.ds.find(d => d >= today));
    li.querySelector('.note').textContent = p.tp;
    TG.attach(li, TG.norm(p.u), { title: a.textContent, urls: [p.u], after: li.querySelector('.when') });
    return li;
  };
  const up = found.filter(p => p.st !== 'past').sort((a, b) => a.last < b.last ? -1 : 1);
  const past = found.filter(p => p.st === 'past').sort((a, b) => a.last > b.last ? -1 : 1);
  document.getElementById('found-up').replaceChildren(...up.map(row));
  document.getElementById('found-past').replaceChildren(...past.map(row));
  document.getElementById('found-intro').textContent =
    `${found.length} of ${pages.length} archived pages mention a date: ${up.length} coming up, ${past.length} already happened.`;
  document.getElementById('found').hidden = found.length === 0;
}"""
    return page("Action Desk", "actions", body, script, module)

# ---------------------------------------------------------------- reading
READING = [   # (shelf, intro, tab indices)
  ("Making models fast", "Inference & serving: the systems side of LLMs.", [0, 1]),
  ("Agents", "How models plan, act and use tools.", [3, 4]),
  ("A slow evening", "Longer reads and a talk.", [21, 22, 20]),
]

def read_item(i, seen):
    p, w, u, title = tabs[i]
    if norm(u) in seen: return ""
    seen.add(norm(u))
    m = meta.get(u, {})
    aid = arxiv_id(u); pm = arxiv.get(aid) if aid else None
    dom = re.sub(r"^www\.", "", re.sub(r"^https?://([^/]+).*", r"\1", u))
    if pm:
        sents = re.split(r"(?<=\.)\s", pm["abstract"])
        title = pm["title"]
        desc = next((x for x in sents if re.search(r"\b(we|this (paper|work|experiment)|all)\b.{0,20}\b(propose|introduce|present|show|study|develop|find|design|provide|test|exceed)", x, re.I)), sents[0])
        kind = f'{e(pm["authors"])} · {pm["year"]} · paper · ~40 min'
    else:
        desc = m.get("desc", "")
        if "youtube.com" in u or "bilibili.com" in u: kind = f"{dom} · video"
        elif u.endswith(".pdf") or "pdf" in u.split("/")[-1]: kind = f"{dom} · PDF"
        elif m.get("words"): kind = f"{dom} · ~{max(2, min(25, m['words'] // 250))} min"
        else: kind = dom
    title = re.sub(r"^\(\d+\)\s*|\s*[-|]\s*(YouTube|USENIX)$", "", title or u)
    d = f'<p class="desc">{e(desc[:220])}</p>' if desc else ""
    return (f'<li class="item" data-key="{e(norm(u))}"><button class="mark" title="Mark as read" aria-label="Mark as read"></button>'
            f'<div><a href="{e(u)}" target="_blank">{e(title)}</a><div class="kind">{kind}</div>{d}</div></li>')

def reading_page():
    seen, secs, chips = set(), [], []
    for n, (name, intro, idxs) in enumerate(READING):
        items = "".join(read_item(i, seen) for i in idxs)
        secs.append(f'<section class="shelf" id="s{n}"><h2>{e(name)}</h2><p class="intro">{e(intro)}</p><ol class="items">{items}</ol></section>')
        chips.append(f'<a href="#s{n}">{e(name)}</a>')
    body = f"""
<header><p class="kicker">Reading room</p><h1>One thing at a time</h1>
<p class="lede">{len(seen)} pieces you saved, sorted into shelves. Pick one, close the rest.</p>
<div class="pick"><button id="pick">Pick one for me</button><span id="picked"></span></div>
<nav class="chips">{''.join(chips)}</nav></header>
{''.join(secs)}"""
    script = """
const items=[...document.querySelectorAll('.item')];
items.forEach(li=>{const key=li.dataset.key, a=li.querySelector('a'), info={title:a.textContent, urls:[a.getAttribute('href')]};
  TG.attach(li,key,{...info,done:false,after:a});
  li.querySelector('.mark').onclick=()=>TG.toggle(key,'done',info);
  TG.onChange(()=>li.classList.toggle('read',TG.get(key)==='done'));});
pick.onclick=()=>{const left=items.filter(li=>!li.matches('.read,.tg-removed'));if(!left.length)return;
  items.forEach(li=>li.classList.remove('spot'));const li=left[Math.floor(Math.random()*left.length)];
  li.classList.add('spot');li.scrollIntoView({behavior:'smooth',block:'center'});
  picked.textContent='→ '+li.querySelector('a').textContent;};"""
    return page("Reading Room", "reading", body, script)

# ---------------------------------------------------------------- shared shell
CSS = """
:root{--bg:#f5f0e6;--paper:#fbf8f2;--ink:#2a2824;--mut:#7c766b;--line:#e4dccd;--acc:#8a5a2b;--hot:#b4361c;--soon:#a36a00;--ok:#4d7a4a;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Songti SC",Georgia,serif;--sans:-apple-system,system-ui,"PingFang SC",sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1916;--paper:#221f1b;--ink:#e9e3d6;--mut:#a39b8c;--line:#363129;--acc:#d4a373;--hot:#f08a6c;--soon:#e0b354;--ok:#8fbf86}}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 var(--serif);-webkit-font-smoothing:antialiased}
.top{display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:center;padding:14px 16px;font:13px var(--sans);letter-spacing:.04em;border-bottom:1px solid var(--line)}
.top a{color:var(--mut);text-decoration:none} .top a.on{color:var(--ink);font-weight:600}
main{max-width:720px;margin:0 auto;padding:48px 16px 96px}
.kicker{font:12px var(--sans);text-transform:uppercase;letter-spacing:.14em;color:var(--acc);margin:0}
h1{font-weight:400;font-size:40px;line-height:1.15;margin:6px 0 10px} .lede{color:var(--mut);font-style:italic;margin:0 0 20px}
h2{font-weight:400;font-size:24px;margin:56px 0 4px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h2 .sub{font:13px var(--sans);color:var(--mut);margin-left:8px}
a{color:var(--ink);text-decoration-color:var(--line);text-underline-offset:3px} a:hover{color:var(--acc);text-decoration-color:var(--acc)}
ol,ul{list-style:none;margin:0;padding:0}
.intro{color:var(--mut);font-style:italic;margin:4px 0 14px;font-size:16px}
.item{display:grid;grid-template-columns:28px 1fr;gap:6px;padding:14px 0;border-bottom:1px dotted var(--line)}
.item a{font-size:18px;text-decoration:none} .kind{font:12px var(--sans);color:var(--mut);margin-top:2px}
.desc{margin:6px 0 0;font-size:15px;color:var(--mut);line-height:1.5}
.mark{width:18px;height:18px;margin-top:5px;border:1.5px solid var(--mut);border-radius:50%;background:none;cursor:pointer;padding:0}
.item.read .mark{background:var(--ok);border-color:var(--ok)} .item.read a,.item.read .desc{opacity:.45}
.item.spot{background:var(--paper);box-shadow:0 0 0 10px var(--paper);border-radius:2px}
.pick{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:8px 0 18px;font:14px var(--sans)}
.pick button{font:14px var(--sans);padding:8px 14px;border-radius:999px;border:1px solid var(--acc);background:none;color:var(--acc);cursor:pointer}
#picked{color:var(--mut)}
.chips{display:flex;flex-wrap:wrap;gap:6px 14px;font:13px var(--sans)} .chips a{color:var(--mut);text-decoration:none} .chips a:hover{color:var(--acc)}
.act{padding:14px 0;border-bottom:1px dotted var(--line);display:grid;grid-template-columns:1fr auto;gap:2px 12px}
.act label{display:flex;gap:10px;align-items:baseline;cursor:pointer} .act input{accent-color:var(--ok);transform:translateY(1px)}
.act .t{font-size:18px} .when{font:13px var(--sans);color:var(--mut);white-space:nowrap;align-self:baseline}
.note{grid-column:1/-1;font-size:15px;color:var(--mut);padding-left:24px} .note:empty{display:none}
.lk{grid-column:1/-1;font:12px var(--sans);padding-left:24px;color:var(--mut);overflow-wrap:anywhere} .lk a{color:var(--mut)}
.compact .act{padding:8px 0} .compact .t{font-size:16px}
.hot .when{color:var(--hot);font-weight:600} .soon .when{color:var(--soon)} .past{opacity:.5}
.done .t{text-decoration:line-through;color:var(--mut)} .done{opacity:.55}
.passed{font:13px/1.9 var(--sans);color:var(--mut)} .passed a{color:var(--mut)}
.found-h{font-weight:400;font-size:18px;margin:22px 0 2px;color:var(--mut)} .found-h .sub{font:13px var(--sans);margin-left:6px}
.act .t a{text-decoration:none}
@media (max-width:520px){h1{font-size:32px}.act{grid-template-columns:1fr}.when{padding-left:24px}}
"""

def archive_json():
    """Every archived page with its description, for the in-page date finder."""
    topics = json.load(open(f"{HERE}/data/topics.json"))
    rows = [{"u": i["url"], "t": i["title"], "d": meta.get(i["url"], {}).get("desc", ""), "tp": t["topic"]}
            for t in topics if t["area"] != "Close" for i in t["items"]]
    return json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")
def page(title, on, body, script, module=""):
    nav = "".join(f'<a href="{f}" class="{"on" if k == on else ""}">{n}</a>' for k, f, n in
                  [("actions", "actions.html", "Action desk"), ("reading", "reading.html", "Reading room"), ("archive", "index.html", "Full archive"), ("graph", "graph.html", "Graph"), ("search", "search.html", "Ask your tabs")])
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{title}</title><style>{CSS}</style></head><body><nav class="top">{nav}</nav><main>{body}</main>'
            f'<script src="status.js"></script><script>{script}</script>'
            + (f'<script type="module">{module}</script>' if module else '') + '</body></html>')

if __name__ == "__main__":
    open(f"{HERE}/out/actions.html", "w").write(actions_page())
    open(f"{HERE}/out/reading.html", "w").write(reading_page())
    print("wrote out/actions.html, out/reading.html")
