# Mind the Station

A station-memorization trainer for the London Underground, built for Studio Espero.
Formerly named "Underground Explorer" — renamed 2026-07-30; `PROJECT_HISTORY.md` keeps the
old name throughout as a historical record (see the note at the top of that file). The
GitHub repo itself may still be at the old slug until manually renamed (outside what this
session's tools can do) — see the handoff note for exact steps if that hasn't happened yet.
Zero-dependency, single self-contained `index.html` (plain HTML/CSS/JS, no build step),
deployed to Vercel via GitHub auto-redeploy. `PROJECT_HISTORY.md` in this repo is the full
narrative handoff (architecture, every bug that shipped and how it was fixed, design
iteration history) written at the end of the original chat-based build process — read it
for the "why", this file for quick working rules.

## What it does

Pick a line (and branch/direction if applicable), then practice recalling station order:
**Warm-up** (target shown, type it), **Recall quiz** (previous station shown, type the
next), **Multiple choice** (4 options). A 3-2-1 countdown precedes each run.

### Gamification mechanics

All session-only — `streak`/`bestStreak`/`bestWpm`/`lastRunWpm` are plain in-memory
closure variables in the main `<script>`, not `localStorage`/cookies (see Security below);
they reset on page refresh, not just on a new run. Within a session:
- **Streak celebration** (`streakSuffix()`): appended to the correct-answer feedback text
  in quiz/mc modes only (warmup doesn't display streak). Fires "🏆 New best" from 3 in a
  row once `streak` exceeds the session's prior `bestStreak`, and a smaller "🔥 N in a row"
  ping at fixed milestones (`STREAK_MILESTONES`) otherwise — a beaten record of 1 or 2
  isn't meaningful, so those are excluded. Also flashes a brief pulse animation
  (`flashNewBest()` → `.new-best` on `#statBest`) on an actual new-best moment.
  Warm-up's equivalent is WPM, which isn't known until the run ends — that's a summary
  badge instead, not a live mid-run flash (see below).
- **Journey milestones** (`milestoneNote()`): a quiet "🚩 Halfway there!" / "Final stretch
  — 3 to go!" appended to the same feedback text, based on `idx`/`totalSteps()`. Skipped
  on journeys under 6 stops, where neither would mean much.
- **Summary badges** (`#newBestBadge`, `#perfectBadge`, next to the summary title): the
  perfect badge shows whenever `misses.length === 0` (already what the title text says in
  quiz/mc, and `acc === 100` in warmup) — a visual, not just textual, confirmation. The
  new-best badge is warmup-only (WPM is the thing being recorded there) and deliberately
  requires a **prior nonzero** best — the very first run of a session trivially "beats" a
  starting `bestWpm` of 0, which isn't a real accomplishment to celebrate.
  `finishRun()`'s one call to `updateStats()` was moved from the top of the function to
  the bottom, after `bestWpm`/`bestStreak` are finalized — the stats panel is a sibling of
  `#gameArea`, not a child, so it's still visible next to the summary card, and it used to
  show the stale pre-finish "Best WPM" for a run that just set a new one.
- **Copy result** (`#copyResultBtn`): builds a plain-text one-liner (e.g. "Victoria line ·
  Warm-up · 489 WPM · 100% accuracy — Mind the Station") and writes it via
  `navigator.clipboard.writeText()` — not gated by the CSP (that governs resource origins,
  not this API) or the "no client-side storage" rule (the OS clipboard isn't app-persisted
  state). Button text flips to "Copied!" (or "Copy failed" if the promise rejects) for
  1.6s, then reverts.

## Running tests

```
npm install
npm test
```

`test/*.test.js` uses Node's built-in test runner (`node --test`) plus `jsdom` as the only
dev dependency — no other test framework. Three suites:

- `test/geometry.test.js` — loads the real page, selects every line, and checks the
  *actual computed diagram geometry* (not a reimplementation) for station collisions and,
  for Central's `loopRect` Hainault loop, unwanted diagonals.
- `test/gameplay.test.js` — clicks through Setup, starts a real run, answers every question
  correctly, and asserts it reaches the summary screen having visited exactly the expected
  number of stops. Runs every line × branch × direction × mode (~90 sub-tests, ~40s).
- `test/interchanges.test.js` — cross-references every line's station list against every
  other line's and asserts any shared station carries an interchange badge for both.
- `test/security.test.js` — static checks over the raw HTML source (no browser needed):
  CSP stays deny-by-default and its origin allowances exactly match actual resource usage
  (no gaps, nothing over-permissive), no `eval`/`Function`/`document.write`/`javascript:`
  URIs, no dynamically-created script/iframe/object tags, no client-side storage, and no
  `innerHTML` assignment references raw user input directly. This is the §12 manual audit,
  now automatic instead of something to remember to re-run.

A separate `e2e/layout.spec.js` (Playwright, real Chromium, not jsdom) covers the one class
of bug the suites above structurally can't: CSS-layout-dependent regressions only visible
by measuring actual rendered pixels (the historical example — District's diagram dots
rendering at less than half the pixel size of a compact line's under an earlier
fixed-height sizing approach). Run it with `npm run test:e2e` (or `npm run test:all` for
both suites); it needs a real browser so it isn't part of the default `npm test`. It checks:
the P22 Underground font actually loads (not silently falling back to Cabin), no unexpected
console/JS errors, no horizontal overflow on the diagram card (the "no scroll boxes" rule
above), dot render size stays within 2x between a compact and a wide line, and `.wrap`'s
responsive width breakpoints (720px base / 960px at 900px+ / 1180px at 1300px+, chosen so
larger screens use more space instead of staying capped at the mobile-era 720px) hit their
exact expected values at phone/tablet/laptop/desktop widths with zero overflow at any of
them, that text (not just the container) actually scales up at both breakpoints, and that
the route-map station popup stays compact rather than the oversized bubble it once was, the
active line pill and primary buttons meet WCAG AA contrast for every line in both themes, and
the train progress rail stays capped on wide screens (it once grew in lockstep with .wrap's
own wider breakpoints, up to 1180px, making the train graphic noticeably larger than
designed) while staying unaffected on narrow ones.
Two console messages are deliberately filtered as expected-not-broken: Chrome's notice that
`frame-ancestors` is ignored when delivered via `<meta>` (a real CSP limitation — the
`<meta>` tag in `index.html` is a fallback for when the file is opened directly, e.g.
`file://` or these very e2e tests; `vercel.json` ships the same policy as a real HTTP
`Content-Security-Policy` header on the deployed site, which is what actually enforces
`frame-ancestors`. `test/security.test.js` asserts the two stay byte-identical so they can't
silently drift apart), and resource-load failures scoped to the two optional external hosts
(Google Fonts, Vercel Analytics), which restricted/proxied networks can fail to reach for
reasons that have nothing to do with the app itself.

**How the tests reach internal state**: `index.html` intentionally exposes nothing on
`window` — everything lives inside one closure. `test/test-utils.js` reads the real file,
splices a `window.__TEST__` object of live getters (`getLINES`, `getGeo`, `getIdx`, etc.)
into an **in-memory copy** of the script right before its closing `})();`, and evals that
into a jsdom window. **The committed `index.html` is never modified for this** — if you
change the shape of the code near the end of the main `<script>` block (the line
`setMode('warmup');` immediately followed by `})();`), update `HOOK_MARKER` in
`test/test-utils.js` to match, or the harness will throw immediately with a clear error
telling you to.

Two non-obvious jsdom gotchas baked into `test-utils.js`, worth knowing before touching it:
- All `setTimeout`/`setInterval` delays are collapsed to ~1ms so a full run (countdown +
  every per-answer transition) completes in milliseconds instead of real seconds.
- The app starts a page-lifetime `setInterval` (the live WPM/elapsed-time ticker) that a
  real browser tab would tear down on navigation but that keeps Node's event loop alive
  forever in a test process — every test must call `closePage()` (`dom.window.close()`) in
  an `after` hook.
- Never `assert.deepEqual`/`deepStrictEqual` a value read out of the jsdom realm (arrays
  from `geo.networkEdges`, etc.) against a plain local array/object — cross-realm
  prototype identity makes even two structurally-empty arrays compare unequal. Assert on
  `.length` or primitive fields instead.

When adding a line or changing geometry/interchange data, these three suites are the
"standalone verification script" discipline described in `PROJECT_HISTORY.md` §13, now
persisted and runnable instead of rewritten by hand each time.

### Which tests a change actually needs

Full `npm run test:all` (or at least `npm test`) is for anything that touches station data,
branch/segment definitions, or gameplay/state logic — a new line, a new branch, edited
`STATION_INTERCHANGES`, changes to `buildLineRuntime`/`setMode`/`submitAnswer`/etc. Those are
exactly the changes where a gap is otherwise invisible (a missing interchange badge, a
collided station, a broken journey sequence for one specific branch/direction/mode
combination out of the ~90 this repo covers).

A **narrower, single-suite run is enough** for a change that's genuinely scoped to one
concern, each fast enough to run every time you touch that concern:

- Per-file unit suites (`npm run test:geometry` / `test:gameplay` / `test:interchanges` /
  `test:security`, each well under a second) — run whichever one matches what changed, e.g.
  `test:security` after touching the CSP meta tag or `vercel.json`.
- `npm run test:e2e` (~2-3 min, real Chromium) for anything CSS-only: font sizes, colors,
  spacing, contrast, responsive breakpoints. This is also the one that actually catches a
  contrast or overflow regression — the unit suites don't render anything.

Reach for the full suite by default whenever you're not sure which category a change falls
into, or if it touches more than one of the above — the cost of over-running is a couple of
minutes; the cost of under-running is exactly the kind of invisible gap this suite exists to
catch.

## Hard rules (violating these previously shipped real bugs — see PROJECT_HISTORY.md for each)

- **Never use `element.style.display` for show/hide.** Always `classList.toggle('hidden', bool)`.
- **A media-query override only wins if it comes *after* the base rule it overrides, in source
  order.** Wrapping a rule in a matching `@media` query does not by itself make it take
  priority — CSS resolves ties between equal-specificity rules by source order regardless of
  which are inside a media query, so an override placed earlier in the file (as the responsive
  text-scale-up block briefly was) silently loses to a later base rule even while its media
  condition matches. The fix: put breakpoint overrides last in the stylesheet, after every rule
  they touch — see the block just before `</style>` in `index.html`.
- **A layout's internal viewBox scale (`r` for `spur-loop`, `vbW`/`vbH` for `linear`, segment
  `spacing` for `branch-tree`) has to be picked relative to how wide `.wrap` can actually get, not
  just relative to that one line's own station count.** `.diagram-card svg` stretches to a fixed
  *percentage* of its container (deliberately — see the CSS-only sizing rule below), so a layout
  whose viewBox is small/fixed regardless of container width (Circle's old `r:75`) gets stretched
  disproportionately harder than a layout whose viewBox grows with real content (a long
  branch-tree spine) once `.wrap` is allowed to grow — station dots ended up ~2x bigger on Circle
  than on every other line at the widest breakpoint. The same thing can happen *within*
  branch-tree too, not just between layout types: Metropolitan's spine is much shorter than
  District/Central/Piccadilly's (23 vs 27-37 stations) at the same `spacing:16`/`26` convention,
  so it hit the same ~2x-too-big problem despite using the "grows with content" layout — fixed by
  scaling every one of its segments' `spacing` up by the same ~1.5x factor (24/39 instead of
  16/26), not by changing the layout type. Sanity-check a layout constant by comparing actual
  rendered dot `getBoundingClientRect()` width across several lines at a wide viewport (1440px),
  not just by eyeballing the diagram at default size.
- **Never derive "the true start/end station" from `LINE.stations[0]` / `[N-1]`.** For loop
  lines (Circle), the real journey start/end depends on `journeyIndices` (loop-aware), not
  raw station array position. Always go through `terminusNames()` / `journeyIndices`.
- **Branch-tree geometry (`layout: 'branch-tree'`)**: a new branch arm must never point in a
  direction that could overlap the spine's own extent or another branch. Before editing
  `segments` for District/Metropolitan/Central/Northern, verify with `npm test` (the
  geometry suite now does the pairwise-distance check that used to be a throwaway Node
  script) — don't just eyeball it.
- **A real graph cycle (two spine stations connected by two different paths) can't be a
  plain parent→child segment — use `loopRect` instead**, the same mechanism Central's real
  Hainault loop and Northern's real Bank/Charing Cross divergence both use. If one of the
  two paths shares a named station with the spine itself (Northern's Euston sits on both
  the spine's Bank route and the loop's Charing Cross route), list it in the loop's own
  `stations` array too (at its real position in the sequence) rather than omitting it —
  `setupGeometry()`'s loopRect handling recognizes any loop station that already has a
  computed position as a **pass-through** and reuses that exact single dot instead of
  creating a second one, so it renders once, shared, at its one real position, with edges
  from both routes meeting there. (An earlier version of this omitted the shared station
  entirely to sidestep the double-position problem — reused-position pass-through is the
  more accurate fix once you actually want the shared station visible on the diagram.)
  The pass-through's own position is fixed by wherever it sits on the spine, not free to
  align with its loop neighbors, so the one edge connecting into it from the loop side may
  not be perfectly rectilinear — `loopRect.allowedDiagonals` documents exactly how many
  edges that's expected to affect (Northern: 2; every other loopRect line defaults to 0,
  enforced by the geometry suite). Two further optional fields tune how a pass-through
  sits relative to the loop, both per explicit instruction for Northern's Euston:
  `passThroughDy` nudges it off the spine's own row (mutating its shared position object
  in place, so the spine's own edges on either side of it automatically follow) so it
  visually sits between the spine and the loop rather than flush on the spine;
  `beforeApproachOffset` keeps the station immediately before it (Warren Street) short of
  landing directly underneath it (to its side instead) — folded into the across-phase's
  own spacing target from the start, not patched on afterwards, since patching it on only
  at the last step landed that station exactly on top of the previous one.
- **A pass-through station breaks simple "both endpoints in the branch's station list"
  edge highlighting — check for *consecutive* membership instead.** Northern's Euston is
  a member of every branch's `stations` array (it's a real stop on both the Bank and
  Charing Cross routes), but the spine's Camden Town–Euston edge is only actually
  travelled by Bank-route branches; on a Charing Cross branch, Euston's real neighbours in
  the sequence are Warren Street and Mornington Crescent, not Camden Town. `drawSeg`'s "on"
  check in `drawRoutePreview()` builds a set of *consecutive* name-pairs from the current
  branch's own `stations` array and checks pair membership, not just whether both station
  names individually appear somewhere in it — the latter lit up Camden Town–Euston for
  every branch regardless of which route it actually used.
- **`loopRect`'s closing edge can drift off-axis from float rounding, not just a config
  mistake.** `acrossSpacing = chordX / acrossCount` isn't always an exact float (e.g.
  `160/6`), and accumulating it via repeated subtraction across several stations can leave
  the last "across" station a few `1e-14` units short of the target `x` — enough for the
  geometry suite's strict `a.x !== b.x` diagonal check to fail even though the line is
  visually dead straight. Fixed once in `setupGeometry()` by snapping to the exact target
  `x` on the last across-step rather than trusting the accumulated float; don't reintroduce
  a similar accumulate-by-subtraction pattern for a rectilinear edge without the same snap.
- **New line/station added → run `npm test`.** The interchange suite catches missing
  badges mechanically; this caught real gaps by hand every single time historically (Bank
  had no interchange entry at all; Bond Street/Stratford were missing Jubilee badges).
- **`STATION_INTERCHANGES` entries deliberately include the station's own line's badge.**
  `renderInterchanges()` filters `b.id === LINE.def.id` out at render time — the data
  itself is a shared, viewpoint-independent list. Don't "clean up" self-references; they're
  correct by design (with one documented exception: Bakerloo's "Edgware Road" is a genuinely
  different physical station from the Circle/District/H&C one of the same name, explicitly
  special-cased in `renderInterchanges()`).
- **CSS-only diagram sizing, no scroll boxes.** `.diagram-card svg { width:92%; height:auto }`
  is a deliberate, explicit user preference over the earlier JS-computed-pixel-size approach.
  Don't reintroduce horizontal scroll containers for wide diagrams without checking first.
- **Station name labels on the route map preview were tried repeatedly and abandoned.**
  Don't re-attempt without discussing scope — see PROJECT_HISTORY.md §10 for what was tried
  and why it kept failing on tight branch-tree junctions.

## Roadmap context

- **Piccadilly** (52 stations) — branch-tree, spine is Cockfosters–Acton Town (a
  single, junction-free run per Wikipedia — Cockfosters is a plain terminus). Three
  scoped branches, exactly as requested: Uxbridge–Cockfosters, Heathrow Terminal
  4–Cockfosters, Heathrow Terminal 5–Cockfosters. The Heathrow branch splits again at
  Heathrow Terminals 2 & 3 into Terminal 4 and Terminal 5 — both real terminal stubs
  share T2&3 as their common stop, per explicit instruction that all Heathrow-bound
  trains pass through it. **Simplified from real service pattern**: in reality Terminal 4
  is a one-way loop (Hatton Cross → T4 → T2&3, no reverse-order return through T4) and
  Terminal 5 is a dead-end spur beyond T2&3 requiring a reverse move to leave — this
  trainer models both as simple two-way branch stubs off T2&3 instead, since round-trip
  reversal isn't something any other line's branches model either. Station order and
  branch topology were verified station-by-station against each station's own Wikipedia
  infobox (preceding/following service listing), not assumed from memory or from the
  branch-sharing-track alone — this caught several pre-existing gaps in already-shipped
  lines' own interchange data (Finsbury Park/Piccadilly Circus/Ealing Common/Acton
  Town/Barons Court/Earl's Court/Holborn were all missing their *own* line's self-badge,
  surfaced only once Piccadilly's cross-reference made them into checked pairs).
- **Northern** (52 stations) — `branch-tree` layout, per explicit instruction: the main
  horizontal spine is High Barnet (left) – Morden (right), routed via Bank in the middle
  section. Real topology is a genuine graph cycle — Bank and Charing Cross branches
  diverge at Kennington and reconverge at Camden Town — which a plain parent→child segment
  tree can't represent directly (a station can't have two parents in a tree). Resolved the
  same way Central's real Hainault loop is: the Charing Cross section is a `loopRect`, a
  rectilinear detour connecting the same two named spine stations (Kennington, Camden
  Town) that the Bank section already passes through directly as part of the spine. This
  gets the full "whole network, other branches dimmed" preview like every other
  branch-tree line — verified the loop and every arm highlight/dim correctly per selected
  branch (e.g. selecting a Charing Cross branch lights up the loop and dims the High
  Barnet side of the spine, and vice versa for a Bank branch). Per explicit instruction,
  the loop's `downCount`/`acrossCount` are tuned to `1`/`6` (not the initial `3`/`2`) so it
  drops only one station on the Kennington side, with most of the rest drawn horizontal
  rather than as a squarer box. Don't read `downCount`/`acrossCount`/`(loopStations.length
  - downCount - acrossCount)` as literally "how many stations render on each named side"
  without accounting for the closing-corner overlap: the rectilinear box construction
  always lands the *last* across-station in the same x column as whatever it's closing
  on, so a named "up" station stacks on top of that in the same column — visually more
  crowded there than the raw counts suggest.
  The Edgware and Battersea arms are both drawn as an L rather than a straight vertical
  stub, per explicit instruction — `edgwareDrop`/`batterseaDrop` (one station straight up
  from the spine) then `edgwareLeftArm` (running left) / `batterseaRightArm` (running
  right, since Kennington already sits at the network's right-hand end) — the same
  two-segment pattern as Metropolitan's `uxbridgeDrop`/`uxbridgeArm`.
  `edgwareDrop`'s spacing (40, wider than the arm's own 16) is deliberately oversized: at
  16 it put `edgwareLeftArm`'s row close enough to `millHillEastArm`'s single station
  (both landing on the same x column a grid-spacing convention away) to collide under the
  geometry suite's threshold — a real instance of the "L-shaped branch-tree arm can
  collide with an unrelated arm two rows away" case the Hard Rules above warn about, not
  just a Morden/Charing-Cross-specific risk.
  Morden itself stays a plain continuation of the horizontal trunk (not its own arm) —
  an earlier attempt to pull it into an L off Kennington was reverted since it broke the
  "High Barnet on the left, Morden on the right, one flat trunk" requirement; only the
  Edgware/Battersea arms and the Charing Cross loop shape were meant to change, never the
  trunk itself.
  Euston is listed in the loop's own `stations` array (between Warren Street and
  Mornington Crescent, its real position in the sequence) even though it's already a
  spine station via the Bank route — `setupGeometry()`'s loopRect handling recognizes it
  as a pass-through and reuses the exact same single dot rather than creating a second
  one, per explicit instruction to show it as one stop, not two. Per a follow-up
  instruction, that shared dot is also nudged 10 units down off the spine's own row
  (`loopRect.passThroughDy`) so it visually sits between the spine and the loop rather
  than flush on the spine, with Warren Street pulled 24 units to its right
  (`loopRect.beforeApproachOffset`) rather than sitting directly beneath it — together
  reading as the point where the Bank and Charing Cross routes, both having called there,
  split apart again toward Camden Town. This costs two edges their perfect
  rectilinearity (Warren Street's approach, and Mornington Crescent's; see
  `allowedDiagonals` in the Hard Rules above) — small, deliberate, documented exceptions,
  not a bug. The highlighting had its own related fix: the Camden Town–Euston edge used to
  light up for every branch (Euston is a member of every branch's station list), even
  Charing Cross ones that never actually travel it — `drawRoutePreview()` now checks
  *consecutive* pair membership in the current branch's own sequence instead of simple
  membership (see the Hard Rules bullet above). Gameplay is unaffected by any of this;
  every branch's own stop sequence (built independently of the geometry tree) already
  included Euston correctly on both Bank and Charing Cross branches before it.
  Exactly 8 branches, matching the real service pattern: Battersea Power Station –
  Edgware, Battersea Power Station – High Barnet, and Morden – {Edgware, Mill Hill East,
  High Barnet} × {via Bank, via Charing Cross}. Battersea trains always run via the
  Charing Cross branch in reality (never Bank), hence no "via" qualifier on those two.
  Every station verified against its own Wikipedia infobox, same discipline as every other
  line — including disambiguating a garbled AI-summarized source that briefly suggested
  Mill Hill East was a through-station rather than the genuine dead-end spur off Finchley
  Central it actually is.
- Elizabeth line, DLR, and London Overground are discussed future extensions (see
  PROJECT_HISTORY.md §7) — Elizabeth needs its own (non-red-circle/blue-bar) roundel
  treatment when built; Overground is scoped as its own separate project phase.

## Security

CSP is deny-by-default (`default-src 'none'`) with narrow allowances for Google Fonts, the
Vercel Analytics script, and self. No `localStorage`/cookies/`eval`. A full audit found no
vulnerabilities as of the last pass (PROJECT_HISTORY.md §12) — re-run one after any
significant change, don't assume it stays clean.
