# Underground Explorer — Project History & Context

> **Note (2026-07-30):** this project was renamed to **"Mind the Station"**. This document is
> left as a historical record of the original build and intentionally keeps the "Underground
> Explorer" name throughout, since that's what the project was called at the time everything
> below happened. See `CLAUDE.md` for the current name and working rules.

**Purpose of this document:** a comprehensive handoff of everything built, decided, and learned
across the full development history of this project (spanning multiple chat sessions before this
export), written for a fresh Claude Code session to read as project context. It captures
architecture, conventions, research-verified facts, and — importantly — mistakes that were made
and fixed, so they aren't repeated.

The current deliverable is a **single self-contained HTML file** (`index.html`), built for
**Studio Espero**, deployed via **Vercel** (GitHub-linked for auto-redeploy on push).

---

## 1. What this app is

**Underground Explorer** is a station-memorization trainer for the London Underground (and now
one non-Underground line, Elizabeth, TBD). The user picks a line (and branch/direction if
applicable), then practices recalling station order in one of three modes:

1. **Warm-up** — target station shown, type it. Interchange badges shown for that station.
2. **Recall quiz** — previous station shown, type the next one from memory.
3. **Multiple choice** — 4 options (3 distractors), context strip showing ±1 known station.

A 3-2-1 countdown precedes each run; a stopwatch and WPM/streak/accuracy stats run during play.
A small animated train rides a progress rail beneath the stats, reaching the far end exactly on
completion.

## 2. Tech stack & deployment

- Zero dependencies, no build step: plain HTML/CSS/JS in one file, P22 Underground font
  base64-embedded (user holds a license), Cabin as a Google Fonts fallback.
- Deployed to Vercel: rename to `index.html`, drag-and-drop to vercel.com/drop, or connect a
  GitHub repo in the Vercel dashboard for auto-redeploy on push.
- Vercel Analytics wired in (`window.va` stub + deferred `cdn.vercel-insights.com` script),
  CSP updated to allow exactly that script origin and `vitals.vercel-insights.com` for reporting.
- CSP is otherwise deny-by-default (`default-src 'none'`), with narrow allowances for Google
  Fonts, the analytics script, and self. `object-src`, `base-uri`, `form-action`,
  `frame-ancestors` are all `'none'`. `referrer` meta is `no-referrer`; `robots` is
  `noindex, nofollow`.
- A full security audit was performed (see §12) — found no vulnerabilities, but worth re-running
  after significant changes rather than assuming it stays clean.

## 3. Page structure (two-page SPA)

- `#setupPage` — Line picker → route map preview → divider → Mode → Branch (if applicable) →
  Direction → Start Playing button.
- `#playPage` (`main`) — topbar (Back + theme toggle) → line/mode info block → stats bar →
  elapsed time → train progress rail → game card → diagram card → summary screen.
- `showPage(page)` toggles a `.hidden` class on each container. **Never use
  `element.style.display`** for show/hide anywhere in this codebase — always
  `classList.toggle('hidden', bool)`. This was deliberately standardized early on after a real
  bug caused by mixing the two approaches; there's an inline CSS comment documenting why.
- `beginRun()` = `resetState()` + `render()` + `runCountdown()`, called by both "Start playing"
  and "Play again" so every run is guaranteed fresh.

## 4. Core state & sequencing

- `LINE` = the currently active line's runtime object, built by `buildLineRuntime(lineId,
  branchId)`, which selects `def.branches[branchId].stations` if the line has branches, else
  `def.stations`.
- `mode`, `reverseDirection`, `idx`, `attempts`, `correctCount`, `streak`, `bestStreak`,
  `bestWpm`, `misses[]` — the core mutable play state, all reset by `resetState()`.
- **`journeyIndices` / `reversedJourneyIndices`**: the authoritative, loop-aware sequence used for
  actual gameplay traversal. For non-loop lines this is just `[0..N-1]` (identity) and its
  reverse. For Circle (which has `loopClosure`), it's `[0..N-1]` **plus a repeat** of the loop
  closure stations, so the practiced journey correctly revisits the junction stations when going
  around the loop.
  **Critical lesson learned:** any code that needs "the true start/end station of the current
  practiced direction" (e.g. terminus labels, route-map start/end markers) MUST use
  `journeyIndices[0]` / `journeyIndices[JOURNEY_LEN-1]` (or the reversed array), **never** a raw
  `LINE.stations[0]` / `LINE.stations[N-1]` guess. A real bug shipped from this exact mistake:
  Circle's reverse-direction "start" was computed as `stations[N-1]` (Bayswater, geographically
  last) instead of the loop-aware true start (Edgware Road, where the forward journey's repeat
  actually ends). Always reuse `terminusNames()`'s logic/indices rather than re-deriving it.

## 5. Layout/geometry engines

Every line's diagram (used both on the Play screen's small progress diagram and the Setup page's
"Route map" preview) is computed by `setupGeometry()`, which dispatches on `LINE.def.layout`:

### `linear`
Straight left-to-right line. Used by Victoria, Jubilee, Bakerloo, H&C, Waterloo & City (egg).

### `spur-loop`
Used only by Circle: a straight spur (Hammersmith→Paddington-ish) plus a circular loop, with a
`closingPair` connecting the loop back to the spur junction. Station positions computed via
`spurLoopPos(i)` (trig for the loop, linear for the spur). **The viewBox is computed tightly from
actual station bounds** (with a small pad) — it used to be a hardcoded `'0 0 400 260'` that left
the drawn content filling only ~72%/58% of its own canvas (a real bug, made the diagram look
small/adrift on mobile); this was fixed by computing `minX/maxX/minY/maxY` from real positions,
same philosophy as branch-tree below.

### `branch-tree`
Used by District, Metropolitan, Central. A `segments` array, each segment either the root
(`parent: null`, straight `dx`/`dy` direction, fixed spacing) or a child attached to a specific
`parentIndex` on a named parent segment, extending outward in its own `dx`/`dy` direction. This
recursively computes a `globalPositions` map (station name → `{x,y}`) and a `networkEdges` list
(pairs of positions), covering **every station across every branch simultaneously** — this is
what lets the Setup page's route map show the whole network (dimmed except the selected branch)
regardless of which single branch is currently active for gameplay.
ViewBox is `minX/maxX/minY/maxY` from all computed positions ± a fixed pad (currently 45).

**Key lesson:** branch arms must never be positioned in a direction that could overlap the
spine's own extent. A real collision bug: Central's Ealing Broadway arm was first placed going
left from North Acton (the same direction the spine continues, toward West Ruislip) and
literally overlapped Greenford (4 units apart). Fixed by making it a vertical stub instead, like
every other branch arm in this codebase. **Always verify new branch geometry with a standalone
Node script computing all pairwise distances before touching the real file** — this is now the
standard practice (see §13).

### `loopRect` (Central-specific extension to branch-tree)
A true rectilinear (right-angles-only, no diagonals) loop connecting two *named spine stations*
(not just a spur endpoint) — built specifically for Central's Hainault loop, which genuinely
diverges from the spine at Leytonstone and reconverges at Woodford (a real closed loop, not a
dead-end stub). Config: `{ stations, from, to, downCount, acrossCount, downSpacing }` — computes
down the right side, across the bottom, up the left side, back to `to`. `upSpacing` is derived
so both sides reach the same total depth (keeping the bottom level, i.e. no slant). This
required real trial-and-error to get the "which station lands at which corner" requirement right
— see §7 (Central line) for the exact split used and why.

## 6. `sizeDiagramSvg` → later replaced with pure CSS responsive sizing

Went through two iterations:
1. First: JS-computed fixed pixel dimensions with a consistent viewBox-unit-to-CSS-px scale,
   allowing horizontal overflow scroll for very wide diagrams (District/Central). This fixed an
   earlier bug where a fixed-height-only approach squeezed wide lines' dots down to less than
   half the size of compact lines' dots (measured: 4.71px vs 10.08px).
2. **Final, current approach** (per explicit user preference: "no scroll boxes"): pure CSS —
   `.diagram-card svg{ width:92%; max-width:92%; height:auto; margin:0 auto; }`, no JS sizing
   function at all. This guarantees no scrolling and centering, at the cost of smaller dots for
   very spread-out lines (an explicitly accepted tradeoff, not a bug).

## 7. Lines implemented (with sources & branch details)

All station data was verified against real sources (primarily Wikipedia's own per-line station
tables where available, or TfL-adjacent sources like lasttrain.co.uk) — never invented from
memory. Cross-referencing interchange data mechanically (a Python script comparing each line's
own station list against every other line's) repeatedly caught real gaps that manual review
missed — this is now standard practice, not optional (see §13).

- **Circle** (35 stations) — spur-loop layout, Hammersmith spur + loop, `loopClosure` repeats
  Paddington/Edgware Road at the journey's end.
- **Victoria** (16), **Jubilee** (27), **Bakerloo** (25), **Hammersmith & City** (29) — linear,
  no branches.
- **Waterloo & City** (2) — linear, hidden Easter egg only (see §9).
- **District** (59 unique stations, 60 with the hidden Olympia branch) — branch-tree, 4 real
  through-routes (Ealing Broadway–Upminster, Richmond–Upminster, Wimbledon–Barking,
  Wimbledon–Edgware Road) plus a 5th hidden egg branch (Kensington Olympia).
- **Metropolitan** (34 stations) — branch-tree, spine is Aldgate–Amersham (Aldgate rendered on
  the *right* per explicit user preference, spine direction flipped), branches: Aldgate–Uxbridge,
  **Baker Street–Watford** (not Aldgate–Watford — real service pattern confirmed via research;
  an early draft wrongly assumed all branches share the Aldgate end), Aldgate–Chesham. Uxbridge
  branch is drawn as an L-shape (drops one stop to West Harrow, then turns left) per explicit
  request, not a straight stub.
- **Central** (49 stations) — branch-tree + loopRect. Spine is West Ruislip–Epping (the "main
  horizontal line", per explicit instruction). Branches, exactly 4 as scoped:
  - West Ruislip – Epping
  - West Ruislip – Hainault (via Woodford) — short entry, Roding Valley→Chigwell→Grange
    Hill→Hainault, ending at Hainault.
  - Ealing Broadway – Epping
  - Ealing Broadway – Hainault — **this one goes via Redbridge/Newbury Park, the *other* side of
    the loop**, not via Woodford. This was a real routing bug in an early draft (built it via
    Woodford for both Hainault branches) — the real Ealing Broadway↔Hainault service runs via
    Newbury Park. Fixed and verified with a full simulated run:
    `Leytonstone → Wanstead → Redbridge → Gants Hill → Newbury Park → Barkingside → Fairlop →
    Hainault`.
  - The full Hainault loop (10 stations: Roding Valley, Chigwell, Grange Hill, Hainault, Fairlop,
    Barkingside, Newbury Park, Gants Hill, Redbridge, Wanstead) exists in the network/diagram
    even though only 4 of its stations are used by the scoped branches — the other 6
    (Fairlop–Wanstead side) were *missing entirely* in an early draft, making the "loop" render
    as a dead-end stub; this was a real bug, fixed by researching and adding the full loop.
  - Loop geometry: rectilinear, **Hainault sits at the bottom-right corner** and **Newbury Park
    at the bottom-left corner** (both explicit user requirements, arrived at after a couple of
    correction rounds — see the `loopRect` config for the exact `downCount`/`acrossCount` split
    that achieves this without reordering the real station sequence).
  - Explicitly out of scope by user instruction: extending Metropolitan-style "5 stations per
    side" symmetry once Newbury Park's exact corner position was pinned down — the two
    requirements turned out to conflict, and the more specific/recent instruction (Newbury
    Park's position) was prioritized.
- **Not yet built**: Piccadilly, Northern (both still show as "soon" pills). **Northern is
  known in advance to need new architecture** — its Bank/Charing Cross branches diverge at
  Camden Town and *rejoin* at Kennington, a genuine graph cycle that the current segment-tree
  model (strictly parent→child, no rejoining) cannot represent natively. This will need either a
  deliberate visual simplification (fake the rejoin without literally sharing geometry) or a
  more general graph-based renderer. Don't start this without a specific plan turn first.
- **Elizabeth line**: agreed in principle to include (not one of the 11 official Underground
  lines, but branches at both ends like District, and was explicitly deferred until branching
  architecture existed — it now does). Its roundel color scheme is different from the Underground
  standard (purple, not red-circle/blue-bar) and the header roundel should be made line-aware
  when this is built, rather than using the fixed Underground-style roundel for a non-Underground
  line.
- **DLR / London Overground**: discussed as natural future extensions once the 11 lines +
  Elizabeth are complete. DLR fits the existing branch-tree architecture well. Overground (6
  named lines since the 2024 rebrand) is realistically its own separate project in scope — treat
  as a deliberate future phase, not something to fold in casually.

## 8. Interchange badge system

- `STATION_INTERCHANGES`: flat object, station name → array of `badge(id, label)` objects.
- `badge(id, label)` returns `{id, color, label}`, color looked up from a shared palette
  (includes all built Underground lines, Overground's 6 named lines with their official Pantone-
  derived colors, DLR, Elizabeth, National Rail).
- `renderInterchanges(name)` filters out `b.id === LINE.def.id` (don't show a line's own badge on
  its own station) and renders colored pill chips. **Only shown in Warm-up mode** (deliberate —
  showing them in Quiz/MC would leak information).
- `readableTextOn(hex)` computes light/dark text per-badge based on luminance.
- **Verification discipline**: every time a new line was added, a Python cross-reference script
  compared that line's station list against every other line's, flagging any shared station
  missing a badge for either line. This caught real, otherwise-invisible gaps every single time
  a new line was added — including, notably, that **Bank had no interchange entry at all**
  despite being on Waterloo & City since very early in the project, and that Bond Street/
  Stratford were missing Jubilee badges from when Jubilee was originally built. Always run this
  check after adding a line, not just spot-check a few stations by eye.

## 9. Easter eggs

- **"The Drain"** (`#drainEgg`, footer): small dot pattern in the footer. Click unlocks Waterloo &
  City as a real selectable line pill (dynamically created).
- **Kensington (Olympia) "ghost branch"** (`#olympiaEgg`, District's branch row only): click
  injects a 5th District branch at runtime (`kensingtonOlympia`), recomputes geometry. **Bug
  fixed**: this egg button lived in the shared `#branchRow` element (reused by every branching
  line), so it was incorrectly showing up on Metropolitan's branch row too — fixed by explicitly
  hiding it whenever the active line isn't District.

## 10. Route map (Setup page) — "tap/hover a station" preview

Added after the core lines were built, then iterated heavily:
- Reuses the exact same geometry as the Play screen's diagram, recolored uniformly (no
  progress-state coloring, since there's no progress to show here).
- **Branch highlighting**: for branch-tree lines, the currently selected branch renders at full
  opacity/slightly larger dots; every other branch in the network renders at ~32% opacity — same
  color family (not grey), so it reads as "not currently selected" rather than "broken/
  unavailable". An edge only counts as "on" the active branch if *both* its endpoints are
  actual stations on that branch (correctly handles shared trunk sections lighting up for
  whichever branch uses them).
- **Interaction**: originally click-to-show a fixed-position tooltip at the bottom of the
  screen; iterated to **hover** (`mouseenter`/`mouseleave`) with the tooltip **anchored near the
  tapped station** (measured via `getBoundingClientRect()`, clamped to viewport edges, with a
  directional arrow). Also click-outside-to-close as a fallback.
- **Tooltip sizing**: `width: max-content` with a 150px floor and 260px ceiling — shrinks for
  short names with no interchanges, grows (and wraps badges onto multiple rows) for long names
  with many interchanges.
- **Station name labels were attempted and then explicitly abandoned** ("I give up, please
  remove all station labels for now"). Do not re-attempt without discussing scope first — this
  went through several rounds (start-label only, then start+end labels, direction arrows, a
  rigorous "sweep 24 candidate angles and score by real measured clearance from every line
  segment and dot" placement algorithm) and was still producing marginal/cramped results on
  tight branch-tree junctions (e.g. Richmond's short arm) even after real fixes. If revisited,
  start from the multi-candidate clearance-scoring approach documented mid-history rather than
  a simple fixed-offset guess — a fixed offset reliably fails near tight junctions.
- Font color for any future label work: `#0019A8` (explicit brand requirement, not derived from
  line colors).

## 11. Train progress animation

- A small SVG train (body + cab as one unified curved path, window strip, small wheels with a
  continuous spin animation, a subtle continuous idle "shake") rides a horizontal rail below the
  stats bar, from a fixed start x to a fixed end x, moving via a CSS-transitioned
  `transform: translate(x,0)` set from `renderProgressRail()`, hooked into the same `updateStats()`
  call site that already runs after every answer/skip across all three modes.
- Went through many rounds of pure design iteration (duck-like → streamliner curve → matching a
  user-provided reference image exactly → simplified back down) — the current design specifics
  (nose slant direction/steepness, wheel size/position, window/door seam spacing) are all
  explicit, iterated user preferences, not first-principles choices. If asked to adjust again,
  treat it as continuing that iteration, not restarting from scratch.
- **Centering bug fixed**: the train's local coordinate reference point (what the position
  transform moves) was off-center relative to the drawn body, making it look shifted left of its
  true progress position — fixed by shifting every local coordinate so the body is symmetric
  around the reference point.

## 12. Security audit (performed once; re-run after major changes)

Full pass found **no vulnerabilities**. Specifically checked and confirmed clean:
- Every `innerHTML` usage — all either clear content or insert hardcoded developer strings, never
  user input. The one place user-typed text is stored (`misses[]`, for the wrong-answers summary)
  is rendered via `textContent`, which auto-escapes.
- CSP matches actual resource usage exactly (no gaps, nothing over-permissive).
- No `eval`, `Function()`, `document.write`, `javascript:` URIs, dynamically-created
  script/iframe/object tags.
- No `localStorage`/`sessionStorage`/cookies anywhere.
- No external links (no tabnabbing risk); answer input has `maxlength="60"`.

## 13. Testing patterns used (recommend converting to a real test suite)

Every change in this project's history was verified with **actual programmatic checks**, not
visual inspection alone — this discipline should continue in Claude Code, ideally formalized:
- **Geometry verification**: before touching the real file, a standalone Node script computes
  all station positions and checks every pairwise distance for collisions, and checks every line
  segment for unwanted diagonals (`x1!==x2 && y1!==y2`) when right-angles are required.
- **Gameplay regression**: a JSDOM-based script that clicks through Setup, starts a run, and
  answers every question correctly, asserting the final unique-stations-seen count matches the
  expected total — run across every line/branch/direction after any change, not just the one
  being modified.
- **Cross-reference validation**: the Python script described in §8, re-run after any new line
  or station is added.
- **Real-browser checks via Playwright** for anything CSS-layout-dependent (centering, no
  scrollbars/overflow, computed font-family, actual rendered dot/label sizes) — computed-style
  assertions catch things a purely geometric Node script can't (e.g. the responsive-sizing
  bug where District's dots rendered at half size was only visible by measuring actual pixel
  dimensions in a real viewport).
- **Pixel-diff verification** for any change explicitly required to be visually invisible (used
  once for a font-family CSS-variable consolidation refactor — screenshotted before/after and
  diffed, got a `None` bounding box, confirming zero visual change).

## 14. Design system quick reference

- Font: P22 Underground (licensed, base64-embedded `@font-face`) with Cabin (Google Fonts) as
  fallback — consolidated into a single `--font-main` CSS variable (was repeated 34 times
  verbatim before a cleanup pass).
- Colors: each line's own official-ish hex in its `LINES` config; a shared interchange badge
  palette; `darkenForLightMode()` / `readableTextOn()` helpers for theme-aware contrast
  (light mode darkens vivid line colors for readability on white; dark mode uses them raw).
- Pills (`.pill`) are the primary selectable-option UI throughout (lines, modes, directions,
  branches) — consistent styling, active state fills with the line's accent color.
- `.setup-divider` / `.diagram-card` / `.station-popup` etc. are the established shared
  component classes — reuse these rather than inventing new ones for similar purposes.
- Terms of Use exists as a modal (not a separate page, since this is a single-file app) —
  intentionally short/plain, explicitly disclaims official TfL affiliation, doesn't collect data
  (accurately, since there's no backend).

## 15. Migration plan already discussed with the user

The user has been advised to migrate from this chat-based single-file workflow to a real git
repo + Claude Code, specifically because: context cost of re-reading a growing single file,
no version control/diffing, and the ad-hoc verification scripts (§13) not persisting as a real
test suite. Suggested concrete steps already given: `git init`, install Claude Code, generate a
`CLAUDE.md` (this document is written to seed that), decide on keeping one file vs. splitting
into logical source files with a small concatenation build step, connect GitHub→Vercel for
auto-deploy, and use Claude Code's "Remote Control" feature to keep working from mobile.

---

*This document was generated by Claude (Sonnet) at the end of an extended chat-based build
session, synthesizing project history from two prior compacted transcripts plus the full current
conversation, specifically to hand off context to a Claude Code session picking up the same
project.*
