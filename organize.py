"""Group the snapshot in data/tabs.json into topics and emit:
   data/topics.json   - topic -> tabs (seed for the knowledge graph)
   out/bookmarks.html - Chrome-importable bookmarks (Bookmarks > Import)
   out/index.html     - browsable index, papers enriched from arXiv
"""
import json, os, re, html, time, collections, urllib.parse as up

HERE = os.path.dirname(os.path.abspath(__file__))
tabs = json.load(open(f"{HERE}/data/tabs.json"))      # [profile, window, url, title]
SNAP = time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(f"{HERE}/data/tabs.json")))
arxiv = json.load(open(f"{HERE}/data/arxiv.json"))

# (area, topic, tab indices into data/tabs.json). Curated by hand (or by your agent) for YOUR snapshot: these
# entries match the demo snapshot in demo/. Tabs not listed land in "Unsorted". An area named "Close" holds dead
# pages and logins; it is left out of the bookmarks and the Action desk.
TOPICS = [
  ("Research", "Papers — fast inference", [0, 1, 2]),
  ("Research", "Papers — agents", [3]),
  ("Build", "Agent infra & dev tools", [4, 29, 5, 6, 7]),
  ("Career", "Grants, hackathons & calls", [8, 9, 10, 30, 31]),
  ("Career", "Job search", [27, 28]),
  ("Career", "People to follow up", [16, 17, 18, 19]),
  ("Events & travel", "Events", [11, 12, 13]),
  ("Events & travel", "Lisbon trip", [14, 15]),
  ("Personal", "Read & watch later", [20, 21, 22]),
  ("Personal", "Live apps (inbox, calendar)", [23, 24]),
  ("Close", "Dead pages & logins — safe to close", [25, 26]),
]

def norm(u): return u.split('#')[0]
def arxiv_id(u):
    m = re.search(r'(\d{4}\.\d{4,5})', u)
    return m.group(1) if m and ('arxiv' in u or 'huggingface.co/papers' in u) else None

# collapse duplicates; remember how many copies each URL had
first, copies = {}, collections.Counter()
for i, t in enumerate(tabs):
    k = norm(t[2]); copies[k] += 1; first.setdefault(k, i)

assigned, topics = set(), []
for area, name, idxs in TOPICS:
    items = []
    for i in idxs:
        k = norm(tabs[i][2])
        if k in assigned: continue
        assigned.add(k)
        p, w, u, title = tabs[i]
        aid = arxiv_id(u)
        meta = arxiv.get(aid) if aid else None
        items.append({"url": u, "title": (meta["title"] if meta else title) or u, "profile": p,
                      "domain": up.urlparse(u).netloc.replace("www.", ""), "copies": copies[k],
                      **({"paper": meta | {"id": aid}} if meta else {})})
    topics.append({"area": area, "topic": name, "items": items})
left = [tabs[first[k]] for k in first if k not in assigned]
if left:
    topics.append({"area": "Unsorted", "topic": "Unsorted", "items": [
        {"url": t[2], "title": t[3] or t[2], "profile": t[0], "domain": up.urlparse(t[2]).netloc, "copies": copies[norm(t[2])]} for t in left]})

json.dump(topics, open(f"{HERE}/data/topics.json", "w"), ensure_ascii=False, indent=1)

# --- Chrome bookmarks (Netscape format) ---
e = html.escape
bm = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>Bookmarks</TITLE><H1>Bookmarks</H1><DL><p>', f'<DT><H3>Tab Archive {SNAP}</H3><DL><p>']
for area in dict.fromkeys(t["area"] for t in topics):
    if area == "Close": continue
    bm.append(f'<DT><H3>{e(area)}</H3><DL><p>')
    for t in (t for t in topics if t["area"] == area):
        bm.append(f'<DT><H3>{e(t["topic"])}</H3><DL><p>')
        bm += [f'<DT><A HREF="{e(i["url"])}">{e(i["title"])}</A>' for i in t["items"]]
        bm.append('</DL><p>')
    bm.append('</DL><p>')
bm.append('</DL><p></DL><p>')
open(f"{HERE}/out/bookmarks.html", "w").write("\n".join(bm))

# --- browsable index ---
total = sum(len(t["items"]) for t in topics)
dups = sum(c - 1 for c in copies.values() if c > 1)
sections = []
for area in dict.fromkeys(t["area"] for t in topics):
    cards = []
    for t in (t for t in topics if t["area"] == area):
        rows = []
        for i in t["items"]:
            badge = f'<span class="dup">×{i["copies"]}</span>' if i["copies"] > 1 else ""
            if "paper" in i:
                pm = i["paper"]
                rows.append(f'<li class="paper"><a href="{e(i["url"])}" target="_blank">{e(i["title"])}</a>{badge}'
                            f'<div class="meta">{e(pm["authors"])} · {pm["year"]} · arXiv {pm["id"]}</div>'
                            f'<details><summary>abstract</summary><p>{e(pm["abstract"])}…</p></details></li>')
            else:
                rows.append(f'<li><a href="{e(i["url"])}" target="_blank">{e(i["title"])}</a>{badge}<span class="dom">{e(i["domain"])}</span></li>')
        cards.append(f'<section class="card"><h3>{e(t["topic"])} <span class="n">{len(t["items"])}</span></h3><ul>{"".join(rows)}</ul></section>')
    sections.append(f'<h2>{e(area)}</h2><div class="grid">{"".join(cards)}</div>')

page = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tab Archive</title><style>
:root{{--bg:#faf9f6;--fg:#1d1d1b;--mut:#77756f;--card:#fff;--line:#e7e4dc;--acc:#3b5bdb;--warn:#c2410c}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151514;--fg:#ecebe6;--mut:#9a988f;--card:#1e1e1c;--line:#2e2d2a;--acc:#8ea2ff;--warn:#fb923c}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,system-ui,sans-serif}}
main{{max-width:1200px;margin:0 auto;padding:24px 16px 64px}} h1{{margin:0 0 4px;font-size:24px}}
.sub{{color:var(--mut);margin-bottom:16px}} input{{width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg)}}
h2{{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:28px 0 10px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}}
.card h3{{margin:0 0 8px;font-size:15px}} .n{{color:var(--mut);font-weight:400}}
ul{{list-style:none;margin:0;padding:0}} li{{padding:4px 0;border-top:1px solid var(--line);overflow-wrap:anywhere}} li:first-child{{border-top:0}}
a{{color:var(--fg);text-decoration:none}} a:hover{{color:var(--acc)}}
.dom,.meta{{display:block;color:var(--mut);font-size:12px}} .dup{{color:var(--warn);font-size:12px;margin-left:6px}}
details{{font-size:12px;color:var(--mut)}} summary{{cursor:pointer}} .hide{{display:none}}
.top{{display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:center;padding:14px 16px;font-size:13px;border-bottom:1px solid var(--line)}}.top a{{color:var(--mut)}}.top a.on{{color:var(--fg);font-weight:600}}
</style></head><body><nav class="top"><a href="actions.html">Action desk</a><a href="reading.html">Reading room</a><a class="on" href="index.html">Full archive</a><a href="graph.html">Graph</a><a href="search.html">Ask your tabs</a></nav><main>
<h1>Tab Archive · {SNAP}</h1>
<div class="sub">{total} unique pages from {len(tabs)} open tabs ({dups} duplicates collapsed) · {len(topics)} topics</div>
<input id="q" placeholder="Filter… (title, domain, topic)" autofocus>
{''.join(sections)}
</main><script src="status.js"></script><script>
q.oninput=()=>{{const s=q.value.toLowerCase();document.querySelectorAll('.card').forEach(c=>{{let any=false;const t=c.querySelector('h3').textContent.toLowerCase();
c.querySelectorAll('li').forEach(li=>{{const m=!s||t.includes(s)||li.textContent.toLowerCase().includes(s);li.classList.toggle('hide',!m);any||=m}});c.classList.toggle('hide',!any)}})}}
document.querySelectorAll('.card li').forEach(li=>{{const a=li.querySelector('a'),u=a.getAttribute('href');TG.attach(li,TG.norm(u),{{title:a.textContent,urls:[u],after:a}})}});
</script></body></html>"""
open(f"{HERE}/out/index.html", "w").write(page)

print(f"{total} unique pages, {dups} duplicate tabs, {len(topics)} topics, unsorted={len(left)}")
for t in topics: print(f"  {len(t['items']):3}  {t['area']:15} {t['topic']}")
