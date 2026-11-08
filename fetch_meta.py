"""Fetch each archived page once and keep what the desk pages need:
description (og/meta) and any sentences that look like a deadline or date.
Writes data/meta.json keyed by URL. Stdlib only."""
import json, os, re, html, gzip, concurrent.futures as cf, urllib.request as ur

HERE = os.path.dirname(os.path.abspath(__file__))
SKIP = ("claude.ai", "chatgpt.com", "kimi.com", "x.com", "linkedin.com", "mail.google.com", "accounts.", "chrome:",
        "file:", "grok.com", "deepseek.com", "platform.openai.com", "dashboard.stripe.com", "app.intercom.com",
        "console.alibabacloud", "publish.buffer.com", "localhost")
DATE = r"(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?(?:,? 20\d\d)?|\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* 20\d\d|20\d\d[-/.]\d{1,2}[-/.]\d{1,2}|20\d\d年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日)"
CUE = r"(deadline|due|closes?|closing|apply by|applications? (?:open|close|due)|submission|register by|until|ends?|截止|报名时间|提交)"

def get(url):
    req = ur.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/154 Safari/537.36",
                                   "Accept-Language": "en,zh;q=0.8", "Accept-Encoding": "gzip"})
    with ur.urlopen(req, timeout=12) as r:
        if "html" not in r.headers.get("Content-Type", "html"): return ""
        b = r.read(1_500_000)
        return (gzip.decompress(b) if r.headers.get("Content-Encoding") == "gzip" else b).decode("utf8", "replace")

def meta(url):
    try: doc = get(url)
    except Exception as e: return url, {"error": type(e).__name__}
    m = lambda p: (re.search(p, doc, re.I | re.S) or [None, None])[1]
    desc = m(r'<meta[^>]+(?:property|name)=["\'](?:og:description|description)["\'][^>]+content=["\']([^"\']+)') \
        or m(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:description|description)')
    text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", doc, flags=re.S | re.I))))
    hits = []
    for s in re.split(r"(?<=[.!?。])\s+", text):
        if re.search(CUE, s, re.I) and re.search(DATE, s, re.I) and len(s) < 300: hits.append(s.strip())
        if len(hits) >= 4: break
    return url, {"desc": html.unescape(desc or "")[:300], "dates": hits, "words": len(text.split())}

if __name__ == "__main__":
    topics = json.load(open(f"{HERE}/data/topics.json"))
    urls = [i["url"] for t in topics for i in t["items"] if not any(s in i["url"] for s in SKIP)]
    with cf.ThreadPoolExecutor(16) as ex: out = dict(ex.map(meta, urls))
    json.dump(out, open(f"{HERE}/data/meta.json", "w"), ensure_ascii=False, indent=1)
    print(f"{len(out)} fetched, {sum('error' in v for v in out.values())} failed, {sum(bool(v.get('dates')) for v in out.values())} with date hints")
