import json, re, fetchlib, adj
from collections import defaultdict

SUF=[" railway station"," station"," tube station"," Underground station",
     " DLR station"," railway station (London)"," station (London)"]
raw=json.load(open('overground_graphs.json'))

def article(name, line):
    for s in SUF:
        st,w=fetchlib.get(name+s)
        if st=='ok' and w and adj.neighbours(w,'London Overground',line): return w
    return None

typed=defaultdict(lambda: defaultdict(set))   # line -> type -> {(a,b)}
allty=defaultdict(set)
for line,d in raw.items():
    for stn in d['graph']:
        w=article(stn,line)
        if not w: continue
        for nb,ty in adj.neighbours_typed(w,'London Overground',line):
            typed[line][ty].add(frozenset((stn,nb)))
            allty[line].add(ty)

# Which service types make up each modelled service.
SERVICES = {
 'Liberty':     {'Romford - Upminster': None},
 'Lioness':     {'Watford Junction - Euston': None},
 'Suffragette': {'Gospel Oak - Barking Riverside': None},
 'Mildmay':     {'Richmond - Stratford': {'Richmond',''},
                 'Clapham Junction - Stratford': {'Clapham Junction',''}},
 'Weaver':      {'Liverpool Street - Enfield Town': {'Enfield Town','Cheshunt & Enfield Town',''},
                 'Liverpool Street - Cheshunt': {'Cheshunt','Cheshunt & Enfield Town',''},
                 'Liverpool Street - Chingford': {'Chingford',''}},
 'Windrush':    {'Highbury & Islington - New Cross': {'New Cross','Highbury & Islington',''},
                 'Highbury & Islington - Crystal Palace': {'Crystal Palace','Highbury & Islington',''},
                 'Highbury & Islington - West Croydon': {'West Croydon','Highbury & Islington',''},
                 'Highbury & Islington - Clapham Junction': {'Clapham Junction','Highbury & Islington',''},
                 # Battersea Park is a variant terminus of the South London
                 # Line service, so it shares that route's own trunk typing.
                 'Highbury & Islington - Battersea Park': {'Battersea Park','Clapham Junction','Highbury & Islington',''}},
}

def longest_path(edges,a,b):
    """Longest simple path a->b: with parallel routes (Bethnal Green->Hackney
    Downs direct vs. via Cambridge Heath/London Fields) the stopping service
    is the one that calls at every intermediate station."""
    g=defaultdict(set)
    for e in edges:
        x,y=tuple(e); g[x].add(y); g[y].add(x)
    best=[]
    def walk(cur,seen):
        nonlocal best
        if cur==b and len(seen)>len(best): best=list(seen)
        for n in g[cur]:
            if n not in seen: walk(n,seen+[n])
    walk(a,[a]); return best

out={}
for line,svcs in SERVICES.items():
    print(f"\n== {line}   types seen: {sorted(t for t in allty[line] if t)}")
    routes={}
    for label,tys in svcs.items():
        a,b=label.split(' - ')
        edges=set()
        for ty,es in typed[line].items():
            if tys is None or ty in tys: edges|=es
        p=longest_path(edges,a,b)
        routes[label]=p
        print(f"   [{len(p):2}] {label}")
        print(f"        {' > '.join(p)}")
    st=sorted({s for p in routes.values() for s in p})
    out[line]={'routes':routes,'stations':st,'total':len(st),'graph_total':len(raw[line]['graph'])}
    if len(st)!=len(raw[line]['graph']):
        print(f"   !! covers {len(st)} of {len(raw[line]['graph'])} graph nodes:"
              f" {sorted(set(raw[line]['graph'])-set(st))}")
json.dump(out,open('overground_final.json','w'),indent=1)
print("\nwrote overground_final.json")
