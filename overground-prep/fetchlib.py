import json, os, re, subprocess, time, urllib.parse
CACHE="wtcache2"; os.makedirs(CACHE,exist_ok=True)
API="https://en.wikipedia.org/w/api.php"

def _key(t): return os.path.join(CACHE, re.sub(r'[^A-Za-z0-9]+','_',t)[:120]+".json")

def cached(title):
    k=_key(title)
    if os.path.exists(k):
        return json.load(open(k))
    return None

def _store(title, status, text):
    json.dump({'status':status,'text':text}, open(_key(title),'w'))

def fetch_batch(titles):
    """Fetch up to 50 page contents in one request. Caches results."""
    todo=[t for t in titles if cached(t) is None]
    for i in range(0,len(todo),40):
        chunk=todo[i:i+40]
        params={'action':'query','prop':'revisions','rvprop':'content','rvslots':'main',
                'redirects':'1','format':'json','formatversion':'2','titles':'|'.join(chunk)}
        data=None
        for a in range(5):
            p=subprocess.run(["curl","-s","--max-time","60","-G",API,
                              *sum([["--data-urlencode",f"{k}={v}"] for k,v in params.items()],[])],
                             capture_output=True,text=True)
            if p.returncode==0 and p.stdout.strip():
                try: data=json.loads(p.stdout); break
                except Exception: pass
            time.sleep(2*(a+1))
        if data is None:
            print("  !! batch failed, skipping (will retry next run)"); continue
        q=data.get('query',{})
        # map requested title -> final title through normalization+redirects
        alias={}
        for n in q.get('normalized',[]): alias[n['from']]=n['to']
        for r in q.get('redirects',[]): alias[r['from']]=r['to']
        def final(t):
            seen=set()
            while t in alias and t not in seen:
                seen.add(t); t=alias[t]
            return t
        bytitle={p['title']:p for p in q.get('pages',[])}
        for t in chunk:
            pg=bytitle.get(final(t))
            if pg is None or pg.get('missing'):
                _store(t,'missing',None); continue
            try: txt=pg['revisions'][0]['slots']['main']['content']
            except Exception: txt=None
            _store(t,'ok' if txt else 'missing', txt)
        time.sleep(0.4)

def get(title):
    c=cached(title)
    if c is None: return None,None
    return c['status'], c['text']
