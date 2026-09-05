# London Overground expansion — preparatory findings

Prep work for adding the six named London Overground lines (Liberty, Lioness, Mildmay,
Suffragette, Weaver, Windrush) as real `LINES` entries. **No app code has been changed** —
this folder is research output plus the scripts that produced it, so implementation doesn't
have to re-derive any of it.

`overground-stations.json` is the machine-readable dataset: verified station sequences,
branch/service structure, junctions, and termini for all six lines.

---

## 1. Station data — how it was verified

CLAUDE.md requires station order be checked against each station's *own* Wikipedia infobox
rather than assumed (the Elizabeth-line pass found a self-contradictory summary source doing
exactly that damage). That check was automated here rather than done by eye:

1. Start from each line's known termini.
2. Fetch each station article and parse its own `{{Adjacent stations}}` / `{{s-rail}}`
   succession data for that line — the machine-readable form of the "preceding/following
   station" infobox row.
3. Walk the resulting adjacency graph outward until closed.
4. Cross-check the totals against a **second** independent source (each line article's
   infobox `stations` count) and the sequences against a **third** (the line article's own
   service table "calling at" lists).

| Line | Stations | Infobox says | Services | Graph shape |
|---|---|---|---|---|
| Liberty | 3 | 3 ✓ | 1 | linear |
| Lioness | 19 | 19 ✓ | 1 | linear |
| Suffragette | 13 | 13 ✓ | 1 | linear |
| Mildmay | 28 | *(no count field)* | 2 | tree, 1 junction |
| Weaver | 25 | 25 ✓ | 3 | **not a tree — 1 cycle** |
| Windrush | 30 | 30 ✓ | 5 | tree, 3 junctions |

**113 unique stations**, of which **83 are brand new to the app** (not on any current line
and with no `STATION_INTERCHANGES` entry).

Mildmay's article uses `Infobox rail service`, which carries no station count. Its 28 is
structurally consistent instead: 5 Richmond-side + 5 Clapham Junction-side + 18 shared trunk,
and both its 23-station routes match the article's calling-at lists exactly.

### Upstream data error found and corrected

**Hackney Downs (Weaver).** Its own article lists Stoke Newington as its next
Cheshunt/Enfield Town station, skipping Rectory Road. Both Rectory Road's and Stoke
Newington's articles place Rectory Road between them, and the Weaver line article's
calling-at list reads `Hackney Downs > Rectory Road > Stoke Newington`. Two independent
articles plus the service table outvote the single outlier; the dataset uses the corrected
order. This is recorded in the JSON's `_meta.corrections` so it isn't silently re-broken if
the crawl is ever re-run.

### Two naming traps

- `Queens Road Peckham` (Windrush) has **no apostrophe**, while `Walthamstow Queen's Road`
  (Suffragette) **does**. Both are correct as written.
- `St. James Street` (Weaver) is written with the app's existing `St.` house style
  (`St. Paul's`, `St. James's Park`, `St. John's Wood`), not Wikipedia's unpunctuated title.

---

## 2. Topology → layout per line

Three lines are plain `linear` and can be dropped in essentially as-is (skeletons are in the
JSON's `services`):

- **Liberty** — Romford / Emerson Park / Upminster.
- **Lioness** — Watford Junction → Euston.
- **Suffragette** — Gospel Oak → Barking Riverside.

Two are ordinary `branch-tree` lines:

- **Mildmay** — spine Richmond → Stratford (23); the Clapham Junction arm (Clapham Junction,
  Imperial Wharf, West Brompton, Kensington (Olympia), Shepherd's Bush) forks at
  **Willesden Junction**.
- **Windrush** — spine Highbury & Islington → West Croydon (21); forks at **Surrey Quays**
  (New Cross, and the South London Line arm), **Sydenham** (Crystal Palace), and
  **Wandsworth Road** (Clapham Junction vs Battersea Park).

### Weaver needs `loopRect`, not a parent→child segment

Weaver is the one line whose graph is **not a tree**: it has 25 nodes and 25 edges. The extra
edge closes a real cycle — Bethnal Green and Hackney Downs are joined by **two physical
alignments**:

- direct (the Chingford services), and
- via Cambridge Heath and London Fields (the Enfield Town / Cheshunt services).

CLAUDE.md's hard rule covers this exact shape: *"A real graph cycle (two spine stations
connected by two different paths) can't be a plain parent→child segment — use `loopRect`
instead"*, the same mechanism as Central's Hainault loop and Northern's Bank / Charing Cross
divergence.

This also matters for **gameplay, not just the diagram**: a naive shortest-path over the
adjacency graph silently routes Enfield Town and Cheshunt services straight from Bethnal
Green to Hackney Downs, dropping Cambridge Heath and London Fields from two of Weaver's three
branches. The dataset here is built from the per-service `type=` data specifically to avoid
that, and its sequences match the article's calling-at lists.

### One geometry risk to watch

Liberty has only 3 stations. The nearest precedent is Waterloo & City (2 stations, `linear`),
which is excluded from `test/geometry.test.js`'s main collision loop and has its own
dedicated test. Per CLAUDE.md's viewBox-scale rule, a very short line stretches its viewBox
hardest and can render dots far larger than other lines — worth checking Liberty against
`e2e/layout.spec.js`'s "dot render size stays consistent (within 2x)" test rather than
assuming.

---

## 3. Interchange data — what will break

`test/interchanges.test.js` cross-references every pair of real `LINES`. The moment these six
become real, it starts checking 6×11 new line-pairs. Running that exact check with the new
data (script: `audit.js` approach described below) reports **30 failures**:

**3 stations with no `STATION_INTERCHANGES` entry at all** — all Overground-only, so nothing
in the app has ever needed them before:

`Canonbury` (Mildmay+Windrush), `Clapham Junction` (Mildmay+Windrush), `Gospel Oak`
(Mildmay+Suffragette)

**27 existing entries missing a required badge.** Almost all are the *tube* line's own
**self-badge**, which is exactly the class of gap CLAUDE.md records from the Piccadilly pass
("Finsbury Park/Piccadilly Circus/… were all missing their *own* line's self-badge, surfaced
only once Piccadilly's cross-reference made them into checked pairs"). Since
`STATION_INTERCHANGES` deliberately stores self-badges and `renderInterchanges()` filters them
at render time, these are data gaps rather than a design change:

- **Bakerloo self-badge** (shares Lioness): Harlesden, Harrow & Wealdstone, Kensal Green,
  Kenton, North Wembley, Queen's Park, South Kenton, Stonebridge Park, Wembley Central,
  Willesden Junction
- **District self-badge** (shares Mildmay/Liberty): Gunnersbury, Kew Gardens, Richmond,
  West Brompton, Upminster
- **Victoria self-badge**: Blackhorse Road, Highbury & Islington, Seven Sisters,
  Walthamstow Central
- **Others**: Central at Shepherd's Bush; Jubilee at Canada Water and West Hampstead;
  Elizabeth at Romford; plus the matching Overground-side badges at Bethnal Green.

Separately — and **not caught by any test** — the 83 brand-new stations need their own
National Rail / DLR / Overground-to-Overground badge pass. CLAUDE.md's Elizabeth-line lesson
applies directly: *"Adding a line that introduces brand-new stations needs its own dedicated
interchange pass — badging only the stations it shares with existing lines isn't enough."*
`test/interchanges.test.js` structurally cannot see a station that isn't shared with a second
`LINES` entry.

---

## 4. Same-name-different-station collisions

These are correctness-critical: `KNOWN_NAME_COLLISIONS` is what stops Network mode's graph
from merging two same-named stations into an interchange that doesn't physically exist. Of
the 29 Overground stations sharing a name with a tube station, each was checked against both
articles' own text:

| Station | Ruling | Evidence |
|---|---|---|
| **Bethnal Green** | **Collision — add entry** | Two entirely separate stations (Weaver rail station in southern Bethnal Green; Central line tube station). Neither article claims an interchange. Matches CLAUDE.md's existing note. |
| **West Hampstead** | **Collision — add entry** | *"Two **out-of-station interchanges** exist with West Hampstead Overground station. One of these is with West Hampstead tube station on the Jubilee line."* CLAUDE.md's rule: don't treat an OSI as a real interchange (the Moorgate/Elizabeth precedent). |
| **Shepherd's Bush** | **Not a collision** | Both articles: *"shares a surface-level interchange"* with the Central line station. The existing `mildmay` badge is correct. The current code comment calling it an OSI is imprecise and worth tightening. It only needs its missing `central` self-badge. |
| Other 26 | Real interchanges | Bakerloo/Lioness pairs share platforms on the Watford DC line; the rest (Euston, Liverpool Street, Stratford, Barking, Richmond, Canada Water, Whitechapel, Highbury & Islington, Willesden Junction, …) are single stations. |

Two OSIs surfaced that need **no** action, because the stations have **different names** and
therefore never merge in the graph anyway: Walthamstow Central ↔ Walthamstow Queen's Road,
and Seven Sisters ↔ South Tottenham.

---

## 5. Line ribbon — a real UX decision, measured

The ribbon is a no-scroll flex strip that must fit every line at any viewport
(`flex: 1 1 0%`, `7 1 0%` for the expanded chip). Going from 11 rendered chips to 17
was measured in real Chromium at 320–1440px:

| | collapsed chip @320px | expanded chip @320px | page overflow |
|---|---|---|---|
| today (11) | 16.9px | 118.6px | 0 at every width |
| with Overground (17) | 12.5px | 87.7px | **0 at every width** |

**The good news:** the flex-ratio system holds — there is still zero horizontal overflow at
any width, so the "every line on screen, no scrolling" rule survives structurally.

**The problem:** the expanded chip's label truncates. "Hammersmith & City" needs ~110px and
gets ~88px. Confirmed by screenshot at 375px, not just coordinates:

- today: `Hammersmith & City` / `29 stations`
- with Overground: `Hammersmith & C` — clipped mid-word

Collapsed chips also drop to 12.5px wide on a 320px phone, which is a thin tap target (they
remain 56–68px tall, so the target is narrow rather than small).

**This needs a product decision before implementation.** Options, roughly in order of how
well they fit existing conventions:

1. **Split into two ribbons** — Underground and Overground as separate strips. Preserves the
   ribbon metaphor and every chip's label; costs vertical space and a new section label.
2. **Group Overground behind one chip** that expands into the six, reusing the existing
   branch-grid pattern. Keeps one ribbon; adds a click and arguably misrepresents six
   separate lines as one.
3. **Keep one 17-chip ribbon** and accept a smaller expanded font / shorter labels. Cheapest;
   degrades the current design on phones.
4. **A Tube/Overground toggle** above the ribbon. Clean, but adds a mode-like control to a
   Setup page that already has a mode row.

I'd recommend (1): it keeps every existing rule intact and reads naturally, since TfL itself
presents these as a separate network. But it's a visual-design call, so it's flagged rather
than assumed.

---

## 6. Other integration points (checked, low-risk)

- **`LINE_BADGE_COLORS`** already contains all six Overground colours, and ~30
  `STATION_INTERCHANGES` entries already carry Overground badges — so badge rendering needs
  no new plumbing, only the data gaps in §3.
- **`LINE_RAINBOW_ORDER`** needs the six inserting at their hue positions; note Liberty's
  grey (`#5D6061`) has no real hue, so it belongs with Jubilee's silver and Northern's black
  after the spectrum, per that constant's existing convention.
- **Chip markup** is static HTML — six new `.line-chip` buttons, and
  `insertLineChipInRainbowOrder()` only matters for dynamically-added (egg) lines.
- **`normalize()`** already maps `&`→`and`, which covers `Caledonian Road & Barnsbury`,
  `Finchley Road & Frognal`, and `Harrow & Wealdstone`.
- **Network mode** gains a large amount of new graph connectivity (the Overground is an
  orbital network), which is a feature — but its journey-length targeting and the
  `KNOWN_NAME_COLLISIONS` entries in §4 should be re-checked once the lines are real.

---

## 7. Reproducing / extending this

```
cd overground-prep
python3 crawl4.py        # walk each line's adjacency graph (caches article wikitext)
python3 typed_build.py   # derive per-service ordered sequences -> overground-stations.json
```

`adj.py` holds the parser. It handles three real-world markup variants that all appear in
these articles and each of which silently produced wrong or empty results at first:

- `{{Adjacent stations}}` parameter groups are **not** consistently numbered — `system1` may
  govern `line1` *and* `line2`; a numbered `line1` may carry bare `left`/`right`; a bare
  `line` may carry `left1`/`right2`. It is parsed **positionally** rather than by matching
  numeric suffixes (suffix matching both missed real neighbours and swallowed unrelated rows
  from later groups, e.g. group `1` absorbing `left14`).
- Older articles use `{{s-rail}}` / `{{rail line}}` succession boxes with no `type=` at all.
- Everything after `{{Disused Rail Insert}}` is a historical service and must be ignored.

A handful of articles still label routes by their pre-2024 names (e.g. `line=Cheshunt` for
Weaver); `adj.ALIASES` maps those.
