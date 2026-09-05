import json, re, sys
import adj, fetchlib

SYSTEM='London Overground'
SUF=[" railway station"," station"," tube station"," Underground station"," DLR station"]
# Some bare names are disambiguation pages (Sydenham), so the London-qualified
# article titles have to be tried too.
SUF += [" railway station (London)", " station (London)"]

def variants(name): return [name+s for s in SUF]

def resolve(name, line):
    """Pick the article that actually carries THIS line's adjacency.

    Several names have separate articles per operator (West Hampstead,
    Bethnal Green, Shadwell) - picking by title suffix alone silently grabs
    the wrong building, so prefer whichever variant yields real adjacency
    for the line we're walking.
    """
    station_arts=[]
    for t in variants(name):
        st,w=fetchlib.get(t)
        if st!='ok' or not w: continue
        if adj.neighbours(w,SYSTEM,line):
            return t,w
        if adj.is_disambig(w): continue
        if re.search(r'\{\{\s*Infobox (London|GB|UK) station',w,re.I) or 'Adjacent stations' in w:
            station_arts.append((t,w))
    return station_arts[0] if station_arts else (None,None)

def crawl(line, seeds, limit=300):
    graph={}; titles={}; unresolved=[]; frontier=list(seeds); seen=set()
    while frontier and len(seen)<limit:
        fetchlib.fetch_batch([v for n in frontier for v in variants(n)])
        nxt=[]
        for name in frontier:
            if name in seen: continue
            seen.add(name)
            t,w=resolve(name,line)
            if not w: unresolved.append(name); continue
            titles[name]=t
            nb=sorted(adj.neighbours(w,SYSTEM,line))
            graph[name]=nb
            for n in nb:
                if n not in seen: nxt.append(n)
        frontier=list(dict.fromkeys(nxt))
    return graph,titles,unresolved

LINES={
 'Liberty':     ['Romford','Upminster'],
 'Lioness':     ['Watford Junction','Euston'],
 'Mildmay':     ['Richmond','Stratford','Clapham Junction'],
 'Suffragette': ['Gospel Oak','Barking Riverside'],
 'Weaver':      ['Liverpool Street','Cheshunt','Chingford','Enfield Town'],
 'Windrush':    ['Highbury & Islington','New Cross','Crystal Palace','West Croydon','Clapham Junction'],
}
res={}
for ln,seeds in LINES.items():
    g,t,u=crawl(ln,seeds)
    deg={k:len(v) for k,v in g.items()}
    res[ln]={'graph':g,'titles':t,'unresolved':u}
    print(f"{ln}: {len(g)} stations")
    print(f"   termini(deg1)={sorted(k for k,v in deg.items() if v==1)}")
    print(f"   junctions(deg>2)={sorted(k for k,v in deg.items() if v>2)}")
    bad=sorted(k for k,v in deg.items() if v==0)
    if bad: print(f"   !! deg0={bad}")
    if u: print(f"   !! unresolved={u}")
json.dump(res,open('overground_graphs.json','w'),indent=1)
print("\nwritten overground_graphs.json")
