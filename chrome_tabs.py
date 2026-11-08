"""List / close tabs in the running Chrome via AppleScript (stdlib only)."""
import subprocess, json, re, urllib.parse as up, sys

LIST = '''
set out to ""
set TB to character id 9
tell application "Google Chrome"
  repeat with w in windows
    set wid to id of w
    repeat with t in tabs of w
      set out to out & wid & TB & (id of t) & TB & (URL of t) & TB & (title of t) & linefeed
    end repeat
  end repeat
end tell
return out'''

def list_tabs():
    r = subprocess.run(['osascript', '-e', LIST], capture_output=True, text=True, check=True)
    rows = []
    for line in r.stdout.splitlines():
        p = line.split('\t', 3)
        if len(p) == 4: rows.append({'win': int(p[0]), 'id': int(p[1]), 'url': p[2], 'title': p[3]})
    return rows

DROP = re.compile(r'^(utm_|gclid$|fbclid$|spm$|_gl$|twclid$|mc_cid$|mc_eid$|ref_src$|si$)')
def key(url):
    try:
        u = up.urlsplit(url)
        if u.scheme not in ('http', 'https'): return url
        q = up.urlencode([(k, v) for k, v in up.parse_qsl(u.query, keep_blank_values=True) if not DROP.match(k)])
        frag = u.fragment if '/' in u.fragment else ''
        return f"{u.scheme}://{u.netloc.removeprefix('www.')}{u.path.rstrip('/')}{'?' + q if q else ''}{'#' + frag if frag else ''}"
    except ValueError:
        return url

def close(tabs):
    """Close tabs by (window id, tab id). Returns AppleScript errors, if any."""
    script = 'set errs to ""\ntell application "Google Chrome"\n' + ''.join(
        f'  try\n    close tab id {t["id"]} of window id {t["win"]}\n  on error m\n    set errs to errs & m & linefeed\n  end try\n'
        for t in tabs) + 'end tell\nreturn errs'
    r = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()
