import struct, sys, os, glob, collections
def s32(b,o): return struct.unpack_from('<i',b,o)[0]
def parse(path):
    b=open(path,'rb').read()
    if b[:4]!=b'SNSS': return None
    o=8; tabs={}; win={}; closed_t=set(); closed_w=set(); sel={}; navs=collections.defaultdict(dict)
    while o+2<=len(b):
        size=struct.unpack_from('<H',b,o)[0]; o+=2
        if size==0 or o+size>len(b): break
        cid=b[o]; p=b[o+1:o+size]; o+=size
        try:
            if cid==0: w,t=s32(p,0),s32(p,4); tabs[t]=w; closed_t.discard(t)
            elif cid==16: closed_t.add(s32(p,0))
            elif cid==17: closed_w.add(s32(p,0))
            elif cid==7: sel[s32(p,0)]=s32(p,4)
            elif cid==6:
                q=4; t=s32(p,q); idx=s32(p,q+4); n=s32(p,q+8); url=p[q+12:q+12+n].decode('utf8','replace')
                q2=q+12+((n+3)&~3); tn=s32(p,q2); title=p[q2+4:q2+4+tn*2].decode('utf-16le','replace')
                navs[t][idx]=(url,title)
        except Exception: pass
    out=[]
    for t,w in tabs.items():
        if t in closed_t or w in closed_w or t not in navs: continue
        i=sel.get(t,max(navs[t])); u=navs[t].get(i) or navs[t][max(navs[t])]
        out.append((w,u[0],u[1]))
    return out
root=os.path.expanduser('~/Library/Application Support/Google/Chrome')
import json; names=json.load(open(root+'/Local State'))['profile']['info_cache']
grand=0; alltabs=[]
for prof in sorted(os.listdir(root)):
    files=sorted(glob.glob(f'{root}/{prof}/Sessions/Session_*'),key=os.path.getmtime)
    if not files: continue
    tabs=parse(files[-1]) or []
    wins=len(set(t[0] for t in tabs)); grand+=len(tabs)
    print(f"{prof:11} {names.get(prof,{}).get('name','?'):10} windows={wins:3} tabs={len(tabs)}")
    alltabs+= [(prof,)+t for t in tabs]
print("TOTAL open tabs:",grand)
json.dump(alltabs,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'data','tabs.json'),'w'),ensure_ascii=False)
