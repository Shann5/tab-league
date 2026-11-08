"""Try tab-league on the fictional snapshot in demo/: copies it into data/ and builds every view.

    python3 demo.py && python3 serve.py      # then open http://localhost:8765

It refuses to overwrite a data/tabs.json that isn't the demo's, so your own snapshot is safe.
"""
import filecmp, json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA, DEMO = os.path.join(HERE, "data"), os.path.join(HERE, "demo")

mine = os.path.join(DATA, "tabs.json")
if os.path.exists(mine) and not filecmp.cmp(mine, os.path.join(DEMO, "tabs.json"), shallow=False) and "--force" not in sys.argv:
    sys.exit("data/tabs.json is not the demo snapshot; move it away first (or pass --force to overwrite it)")
os.makedirs(DATA, exist_ok=True)
for f in ("tabs.json", "arxiv.json", "meta.json"):
    shutil.copy(os.path.join(DEMO, f), os.path.join(DATA, f))
for script in ("organize.py", "desk.py", "graph.py", "search.py"):
    subprocess.run([sys.executable, os.path.join(HERE, script)], check=True)
# the extension seeds its store from the same topics
topics = json.load(open(os.path.join(DATA, "topics.json")))
seed = [{"area": t["area"], "topic": t["topic"], "items": [{"url": i["url"], "title": i["title"]} for i in t["items"]]}
        for t in topics]
json.dump(seed, open(os.path.join(HERE, "extension", "seed", "topics.json"), "w"), ensure_ascii=False)
print("demo ready: python3 serve.py, then open http://localhost:8765")
