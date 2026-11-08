"""Serve the Tab League views at http://localhost:8765 and save done / removed marks (stdlib only).
   GET  /...           the pages in out/
   GET  /brain/<name>.js the brain modules, so the pages can import them
   GET  /api/status    data/status.json
   POST /api/status    {"key": "...", "value": {"s": "done" | "removed", ...} or null}
   POST /api/close     {"urls": [...]}: closes the matching tabs in Chrome (AppleScript)

   python3 serve.py              run in this terminal
   python3 serve.py --install    start at login (a launchd agent); --uninstall removes it
Listens on 127.0.0.1 only, and only takes JSON posts from its own pages."""
import json, os, re, sys, subprocess, threading, http.server
import chrome_tabs

HERE = os.path.dirname(os.path.abspath(__file__))
OUT, BRAIN, STATUS, PORT = f"{HERE}/out", f"{HERE}/brain", f"{HERE}/data/status.json", 8765
HOSTS = {f"localhost:{PORT}", f"127.0.0.1:{PORT}"}
PLIST = os.path.expanduser("~/Library/LaunchAgents/local.tableague.serve.plist")
lock = threading.Lock()

def load():
    try:
        with open(STATUS) as f: return json.load(f)
    except FileNotFoundError:
        return {}

def save(status):
    with open(STATUS + ".tmp", "w") as f: json.dump(status, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(STATUS + ".tmp", STATUS)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=OUT, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # rebuilt pages show up on reload
        super().end_headers()

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)

    # Any website open in the browser can send requests to localhost, and DNS rebinding can fake the
    # address, so check Host, Origin and the JSON content type (which a plain cross-site form can't send).
    def trusted(self, posting):
        if self.headers.get("Host") not in HOSTS: return False
        if not posting: return True
        origin = self.headers.get("Origin")
        return (origin is None or origin.removeprefix("http://") in HOSTS) and \
            self.headers.get("Content-Type", "").startswith("application/json")

    def do_GET(self):
        if not self.trusted(False): return self.send_json({"error": "forbidden"}, 403)
        if self.path == "/":
            self.send_response(302); self.send_header("Location", "/actions.html"); return self.end_headers()
        if self.path == "/api/status":
            with lock: return self.send_json(load())
        m = re.fullmatch(r"/brain/([a-z]+\.js)", self.path)
        if m:
            try:
                with open(f"{BRAIN}/{m[1]}", "rb") as f: body = f.read()
            except FileNotFoundError:
                return self.send_json({"error": "not found"}, 404)
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); return self.wfile.write(body)
        super().do_GET()

    def do_POST(self):
        if not self.trusted(True): return self.send_json({"error": "forbidden"}, 403)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        except ValueError:
            return self.send_json({"error": "bad json"}, 400)
        if self.path == "/api/status":
            key, value = body.get("key"), body.get("value")
            if not isinstance(key, str) or not key or \
                    (value is not None and (not isinstance(value, dict) or value.get("s") not in ("done", "removed"))):
                return self.send_json({"error": "bad status"}, 400)
            with lock:
                status = load()
                if value is None: status.pop(key, None)
                else: status[key] = value
                save(status)
            return self.send_json({"ok": True})
        if self.path == "/api/close":
            urls = body.get("urls")
            if not isinstance(urls, list) or not all(isinstance(u, str) for u in urls):
                return self.send_json({"error": "bad urls"}, 400)
            want = {chrome_tabs.key(u) for u in urls}
            try:
                hits = [t for t in chrome_tabs.list_tabs() if chrome_tabs.key(t["url"]) in want]
            except (subprocess.CalledProcessError, OSError):
                return self.send_json({"error": "Chrome not reachable"}, 502)
            return self.send_json({"closed": len(hits), "errors": chrome_tabs.close(hits) if hits else ""})
        self.send_json({"error": "not found"}, 404)

def install():
    os.makedirs(os.path.dirname(PLIST), exist_ok=True)
    with open(PLIST, "w") as f:
        f.write(f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.tableague.serve</string>
  <key>ProgramArguments</key><array><string>{sys.executable}</string><string>{os.path.abspath(__file__)}</string></array>
  <key>WorkingDirectory</key><string>{HERE}</string>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>{HERE}/data/serve.log</string>
</dict></plist>
""")
    subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", PLIST], check=True)
    print(f"installed: starts at login, now running at http://localhost:{PORT}")

def uninstall():
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}", PLIST])
    if os.path.exists(PLIST): os.remove(PLIST)
    print("uninstalled")

if __name__ == "__main__":
    if "--install" in sys.argv: install()
    elif "--uninstall" in sys.argv: uninstall()
    else:
        print(f"Tab League at http://localhost:{PORT}  (Ctrl-C to stop)")
        http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
