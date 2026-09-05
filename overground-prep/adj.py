import re

# Some station articles still label London Overground routes by their
# pre-November-2024 route names rather than the six new line names.
ALIASES = {
    'liberty':     {'liberty', 'romford to upminster', 'romford-upminster'},
    'lioness':     {'lioness', 'watford dc', 'watford dc line'},
    'mildmay':     {'mildmay', 'north london', 'west london'},
    'suffragette': {'suffragette', 'gospel oak to barking', 'goblin'},
    'weaver':      {'weaver', 'cheshunt', 'chingford', 'enfield town', 'lea valley'},
    'windrush':    {'windrush', 'east london'},
}

def _decomment(s):
    return re.sub(r'<!--.*?-->', '', s, flags=re.S)

def _split_params(block):
    parts, depth, cur, i = [], 0, [], 0
    while i < len(block):
        if block.startswith('{{', i) or block.startswith('[[', i):
            depth += 1; cur.append(block[i:i+2]); i += 2; continue
        if block.startswith('}}', i) or block.startswith(']]', i):
            depth -= 1; cur.append(block[i:i+2]); i += 2; continue
        if block[i] == '|' and depth == 0:
            parts.append(''.join(cur)); cur = []; i += 1; continue
        cur.append(block[i]); i += 1
    parts.append(''.join(cur))
    return parts

def _template_bodies(wtext, name_re):
    for m in re.finditer(r'\{\{\s*(?:' + name_re + r')\s*(?=[|}])', wtext, re.I):
        start, depth, i = m.end(), 2, m.end()
        while i < len(wtext) and depth > 0:
            if wtext.startswith('{{', i): depth += 2; i += 2; continue
            if wtext.startswith('}}', i): depth -= 2; i += 2; continue
            i += 1
        yield wtext[start:i-2]

def _station_name(v):
    """Pull a station name out of a param value (plain, [[link]] or {{stnlnk}})."""
    v = _decomment(v)
    m = re.search(r'\{\{\s*(?:stnlnk|stn|rws|rint)\s*\|([^|}]+)', v, re.I)
    if m: return m.group(1).strip()
    m = re.search(r'\[\[([^\]|]+)', v)
    if m:
        return re.sub(r'\s+(?:railway |tube |Underground |DLR )?station$', '', m.group(1)).strip()
    v = re.split(r'<br\s*/?>', v)[0]
    v = re.sub(r"''.*?''", '', v)
    return v.strip()

def _matches(value, line):
    v = _decomment(value).strip().lower()
    v = re.sub(r'\s+line$', '', v)
    return v in ALIASES.get(line.lower(), {line.lower()})

def _from_adjacent(wtext, system, line):
    """Parse {{Adjacent stations}} positionally.

    Wikipedia's numbering is not internally consistent: `system1` may govern
    `line1` and `line2` (Gospel Oak); a numbered `line1` may carry bare
    `left`/`right` (Shadwell); and a bare `line` may carry numbered
    `left1`/`right2` (Edmonton Green, Rotherhithe). Matching on the shared
    numeric suffix therefore both misses real neighbours and swallows
    unrelated ones from later rows. Document position is the one consistent
    rule: a `system=` applies until the next `system=`, and a `line=`'s
    left/right params are the ones between it and the next `line=`/`system=`.
    """
    out = set()
    SIDE = re.compile(r'(left|right)\d*[a-z]?$')
    for body in _template_bodies(wtext, r'Adjacent stations'):
        ordered = []
        for p in _split_params(body):
            if '=' not in p: continue
            k, v = p.split('=', 1)
            ordered.append((k.strip().lower(), v))
        cur_sys, collecting = None, False
        for k, v in ordered:
            if re.fullmatch(r'system\d*', k):
                cur_sys = _decomment(v).strip().lower(); collecting = False; continue
            if re.fullmatch(r'line\d*[a-z]?', k):
                collecting = (cur_sys == system.lower()) and _matches(v, line)
                continue
            if collecting and SIDE.fullmatch(k):
                n = _station_name(v)
                if n and n.lower() not in ('none', ''): out.add(n)
    return out

def _from_srail(wtext, system, line):
    """Older succession-box format: {{s-rail|title=SYSTEM}} + {{rail line|...}}."""
    out = set()
    for m in re.finditer(r'\{\{\s*s-rail\s*\|\s*title\s*=\s*([^|}\n]+)', wtext, re.I):
        if m.group(1).strip().lower() != system.lower(): continue
        tail = wtext[m.end(): m.end() + 4000]
        tail = re.split(r'\{\{\s*s-rail\s*\|', tail)[0]
        # Everything after {{Disused Rail Insert}} is a historical service,
        # not a current one (Woodgrange Park's old St Pancras-East Ham run).
        tail = re.split(r'\{\{\s*Disused Rail Insert', tail, flags=re.I)[0]
        for body in _template_bodies(tail, r'rail line|s-line'):
            params = {}
            for p in _split_params(body):
                if '=' not in p: continue
                k, v = p.split('=', 1); params[k.strip().lower()] = v
            if params.get('status','').strip().lower() == 'historical': continue
            route = params.get('route', '') + ' ' + params.get('line', '')
            if not any(_matches(x, line) for x in re.findall(r'\[\[([^\]|]+)', route) + [route]):
                continue
            for side in ('previous', 'next'):
                if side in params:
                    n = _station_name(params[side])
                    if n and n.lower() not in ('none', '', 'terminus'): out.add(n)
    return out

def neighbours(wtext, system, line):
    return _from_adjacent(wtext, system, line) | _from_srail(wtext, system, line)

def is_disambig(wtext):
    return bool(re.search(r'\{\{\s*(station )?disambiguation', wtext, re.I))


def neighbours_typed(wtext, system, line):
    """Like neighbours(), but returns {(neighbour, service_type)}.

    `type=` names the real service pattern (e.g. "Cheshunt & Enfield Town",
    "Chingford"), which is what distinguishes genuine branches from the
    spurious terminus-to-terminus paths a bare adjacency graph allows.
    """
    out = set()
    SIDE = re.compile(r'(left|right)\d*[a-z]?$')
    TYPE = re.compile(r'type\d*[a-z]?$')
    for body in _template_bodies(wtext, r'Adjacent stations'):
        ordered = []
        for p in _split_params(body):
            if '=' not in p: continue
            k, v = p.split('=', 1)
            ordered.append((k.strip().lower(), v))
        cur_sys, collecting, cur_type = None, False, ''
        for k, v in ordered:
            if re.fullmatch(r'system\d*', k):
                cur_sys = _decomment(v).strip().lower(); collecting = False; continue
            if re.fullmatch(r'line\d*[a-z]?', k):
                collecting = (cur_sys == system.lower()) and _matches(v, line)
                cur_type = ''
                continue
            if not collecting: continue
            if TYPE.fullmatch(k):
                cur_type = _decomment(v).strip(); continue
            if SIDE.fullmatch(k):
                n = _station_name(v)
                if n and n.lower() not in ('none', ''): out.add((n, cur_type))
    # Articles still on the older {{s-rail}}/{{rail line}} succession format
    # (Upper Holloway, Crouch Hill, Woodgrange Park) carry no type= at all;
    # fold them in untyped so single-service lines still resolve.
    for n in _from_srail(wtext, system, line):
        if not any(x == n for x, _ in out): out.add((n, ''))
    return out
