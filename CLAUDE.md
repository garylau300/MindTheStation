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

## Branches and deployment

**Live now**: `production` is Vercel's actual Production Branch, bound to the real domain
`mindthestation.com`. `main` stays the always-current dev branch — every regular change
merges into `main` exactly as before, and `production` only moves forward when a change is
explicitly meant to go live, i.e. a deliberate "ship this" step, never an automatic side
effect of routine work. Don't merge into `production` unless asked to promote/ship a change.

`mindthestation.vercel.app` (the project's own default domain, previously tracking
Production automatically) is meant to be manually reassigned in the Vercel dashboard to
track `main` instead, so it works as a stable preview URL for in-progress work, separate
from the live domain.

- **`vercel.json` deliberately differs between `main` and `production` — it is NOT meant to
  be kept identical across the two.** `main`'s copy carries an extra response header,
  `X-Robots-Tag: noindex, nofollow`, that `production`'s copy omits. This exists because of a
  real gap confirmed against Vercel's own docs: Vercel normally adds that header
  automatically to Preview Deployments to keep them out of search results, *but that
  automatic protection stops applying the moment any domain — including the project's own
  default `.vercel.app` one — is manually assigned to a non-Production branch*, which is
  exactly what `mindthestation.vercel.app` now is. Without this explicit header, the
  `main`-tracked URL would be just as indexable as the real site, defeating the entire point
  of keeping it separate. When touching `vercel.json`, always check which branch you're
  actually pushing to — merging `main`'s copy into `production` would silently noindex the
  real site, and merging `production`'s copy into `main` would silently remove the
  protection. Neither should ever happen by accident (see the git-workflow instructions this
  session operates under for how commits are meant to reach each branch).

## What it does

Pick a line (and branch/direction if applicable), then practice recalling station order:
**Warm-up** (target shown, type it), **Recall quiz** (previous station shown, type the
next), **Multiple choice** (4 options), or **Network** (two random stations anywhere in the
system, type the real route between them — see its own section below). A 3-2-1 countdown
precedes each run.

Typed-answer matching (`normalize()`, warm-up/quiz only — MC is button-click, no typing)
lowercases, strips diacritics, and drops all non-alphanumeric characters before comparing —
except `&`, which is converted to `and` first rather than just stripped, so a station like
"Elephant & Castle" accepts either "Elephant & Castle" or "Elephant and Castle" typed in
(both sides of the comparison go through the same normalization either way). Applies to
every station with a real `&` in its name: Chalfont & Latimer, Elephant & Castle, Harrow &
Wealdstone, Highbury & Islington, Totteridge & Whetstone.

### Gamification mechanics

All session-only — `streak`/`bestStreak`/`bestWpm`/`lastRunWpm` are plain in-memory
closure variables in the main `<script>`, not `localStorage`/cookies (see Security below);
they reset on page refresh, not just on a new run. Within a session:
- **Feedback toast** (`showFeedback()`/`hideFeedback()`, `#feedback` → `.feedback-toast`):
  the per-answer message (`✓ Correct — X`, `✕ It was — X`, hints, skips) renders as a small
  card with its own fade-in and a fixed ~1.7s visible window, timed independently of
  `advance()`/`render()`. It used to be plain text cleared by every `render()` call — fine
  in quiz/mc (450-1100ms between questions) but in warmup (200ms) it was wiped almost
  before it could render, making it effectively unreadable. `render()` no longer touches
  `#feedback` at all; only `showFeedback()` (via its own `setTimeout`) and `resetState()`'s
  `hideFeedback()` call (an instant clear with no fade, for a genuinely new run) do.
  Calling `showFeedback()` again while a toast is already showing (e.g. answering fast in
  warmup) restarts the timer and swaps the text without a re-trigger of the fade-in — only
  a `hidden → shown` transition animates, so rapid consecutive answers read as one
  continuously-updating toast rather than a flicker.
- **Streak celebration** (`streakSuffix()`): appended to the correct-answer feedback text
  in quiz/mc modes only (warmup doesn't display streak). Fires "🏆 New best" from 3 in a
  row once `streak` exceeds the session's prior `bestStreak`, and a smaller "🔥 N in a row"
  ping at fixed milestones (`STREAK_MILESTONES`) otherwise — a beaten record of 1 or 2
  isn't meaningful, so those are excluded. Also flashes a brief pulse animation
  (`flashNewBest()` → `.new-best` on `#statBest`) on an actual new-best moment.
  Warm-up's equivalent is WPM, which isn't known until the run ends — that's a summary
  badge instead, not a live mid-run flash (see below). The correct-answer message itself is
  just "✓ Correct" (plus these suffixes) — it deliberately omits the station name, which is
  redundant with what's already on screen (the word just typed, the highlighted MC button,
  or the next question's own "Previous:" line). Wrong-answer and skip messages keep the
  station name, since there it's genuinely new information.
- **Combo score** (`awardPoints()`, `SCORE_BASE`/`speedMultiplier()`): a running per-run
  point total, quiz/mc only (same warmup exclusion as streak — WPM already covers "reward
  speed" there). Rewards fast *and* streaky answers together rather than either alone:
  `points = SCORE_BASE(100) × speedMultiplier(elapsed) × comboMultiplier(streak)`, where
  `speedMultiplier` steps down from 3× (≤2s) to 1× (>8s) based on time since the question
  was shown (`questionStartTime`, stamped in `render()`), and `comboMultiplier` is
  `1 + 0.1×(streak-1)`, capped at 2× so a very long streak doesn't dwarf the speed
  component. Taking a hint (`hintUsedThisQuestion`) zeroes out the speed bonus for that one
  question — the streak multiplier still applies — since part of the answer was given
  away. The point gain is appended right after "✓ Correct" (e.g. "✓ Correct +330"), and the
  live `#statAcc` stat cell — which shows plain Accuracy% in warmup — shows the running
  score in quiz/mc instead (`$('statAccLabel')` toggles the cell's label the same way
  `statMidLabel`/`statBestLabel` already do per mode), with a short scale/color pop
  (`flashScore()` → `.score-pop`) on every increment so the number visibly "ticks up" rather
  than silently changing. `score` resets to 0 in `resetState()` like every other per-run
  counter; it isn't tracked as a cross-run session best (no `bestScore`), so there's no
  score-based summary badge — only `misses`/streak/WPM have that "compare to prior runs
  this session" treatment. Final score is folded into the quiz/mc summary sub-text and the
  copy-result string alongside accuracy and best streak.
- **Streak flame badge** (`updateStreakFlame()`, `#streakFlame` top-right of `#gameCard`):
  unlike `streakSuffix()`'s toast text and the combo score above (both quiz/mc only), this
  one is a purely visual cue and deliberately runs in **all three modes, including
  warmup** — `streak` itself was already tracked there (`submitAnswer()`'s correct/wrong
  branches update it regardless of mode; only the *display* was previously gated), so
  surfacing it needed no new state, just a new element. Appears at the same ≥3 threshold as
  `streakSuffix`'s "New best" celebration — called from the same central `updateStats()`
  every other stat already goes through, so every streak-changing action (correct/wrong
  answer, hint, skip) keeps it in sync for free. When the streak breaks, the badge doesn't
  just vanish: `.extinguishing` (added in `updateStreakFlame()`, tracked via the `flameActive`
  flag so a re-ignition — e.g. an MC hint dropping streak 3→2 immediately followed by a
  correct answer back to 3 — cancels the pending hide via `clearTimeout` instead of racing
  it) plays the flame icon visibly dying out first (`flameDie`: scale/desaturate/dim over
  ~420ms, while the badge itself stays put) and only then, with a matching animation delay,
  collapses and fades the whole badge (`badgeCollapse`, ~250ms) — a `FLAME_EXTINGUISH_MS`
  (650ms) `setTimeout` finally adds `hidden` once both finish. `resetStreakFlame()` (called
  from `resetState()`) is the instant, un-animated reset for a genuinely new run, so starting
  over never plays a leftover extinguish from the previous run. Stacked two-line layout: a
  large flickering flame icon (`.flame-icon`, `flameFlicker` animating scale/rotate/glow on
  top of the emoji) above the streak count (`.flame-count`), which pops (`.bump` →
  `streakBump`) on every increment while active, not just on first appearing. Session-only,
  like every other gamification stat here — no persistence across a page refresh. Since the
  badge is large enough to otherwise sit on top of question text, `#gameCard` gets a
  `.streak-active` class in lockstep with the badge's own visibility, which reserves a
  right-side gutter (`padding-right`) on every top-of-card question element (`.qc` —
  context/prompt/target-word/interchange row/MC context) so the badge never paints over
  live content, on any line length or viewport width. The live streak *count* itself was
  removed from the stats bar (the flame is the one live-streak cue now, across all modes);
  the quiz/mc `#statMid` cell that used to show it now shows the same live accuracy% that
  warmup shows there, since `#statAcc` in those two modes already went to the combo score
  above — `#statBest` still shows best streak, the one cross-run streak stat this repo
  keeps.
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
- **Confetti burst** (`launchConfetti()`, `#confettiLayer`): fires exactly once per run, at
  the same moment either summary badge above would show (new-best WPM or a perfect run) —
  checked via `!newBestBadgeEl.classList.contains('hidden') || !perfectBadgeEl...`, right
  after both are finalized, rather than a separate condition that could drift out of sync
  with what the badges themselves actually show. Pieces reuse the real line colors in
  `LINE_RAINBOW_ORDER` (the same palette as the Setup screen's line ribbon) rather than
  arbitrary confetti colors, so it still reads as belonging to this app. The layer is a
  `position:fixed` full-viewport overlay (not scoped to `.wrap`) so the burst isn't clipped
  by the column's own max-width, with `pointer-events:none` so it never blocks the summary
  card underneath, and `overflow:hidden` so a piece's horizontal drift can't cause page
  overflow. `layer.innerHTML` is cleared at both the start of a new burst and via a
  `confettiCleanupTimer` ~4.2s after (past the longest possible piece duration+delay), so
  a quick "Play again" into another perfect run doesn't pile up leftover pieces from the
  last one.
- **Copy result** (`#copyResultBtn`): builds a plain-text one-liner (e.g. "Victoria line ·
  Warm-up · 489 WPM · 100% accuracy — Mind the Station") and writes it via
  `navigator.clipboard.writeText()` — not gated by the CSP (that governs resource origins,
  not this API) or the "no client-side storage" rule (the OS clipboard isn't app-persisted
  state). Button text flips to "Copied!" (or "Copy failed" if the promise rejects) for
  1.6s, then reverts.

### Network mode

A 4th mode (`#modeNetworkBtn`, alongside Warm-up/Recall quiz/Multiple choice): the app picks
two random stations anywhere in the whole system and the player types every real stop of the
shortest route between them — a genuine "can you actually navigate the Tube" challenge,
rather than one line's own fixed stop order. Reuses Recall quiz's exact "type the next
station from memory" flow end to end (`render()`'s `mode === 'quiz' || mode === 'network'`
branch, including withholding the very first station's name the same way quiz already does)
rather than being a wholly separate UI — the two are functionally identical once a journey
exists, they just differ in *where that journey's station list comes from*.

- **The whole feature reduces to one graph-shortest-path problem, not a new UI paradigm.**
  Every function downstream of the single global `LINE` runtime object (`seq()`, `origIndex()`,
  `totalSteps()`, `submitAnswer()`, `advance()`, `terminusNames()`, `updateDirectionBoard()`)
  only ever reads `LINE.stations`/`journeyNames`/`journeyIndices`/`JOURNEY_LEN` — none of them
  check *where* that data came from. So Network mode never generalizes those functions; it
  just builds a `LINE`-shaped object from a computed path
  (`buildNetworkRuntimeFromPath()`/`generateNetworkJourney()`) and assigns it to the same
  global, the same way `setLine()`/`setBranch()` already do for a real line. The only new
  field is `edgeLines` (which real line each `path[i]→path[i+1]` edge belongs to, for the
  live-theme/badge cue below) — `def.branches` is `null`, `def.layout` is the synthetic
  `'network'`, and MC's `generateMcOptions()` is never even called in this mode (Network only
  ever uses the typing mechanic), so it needed no changes to draw distractors correctly.
- **`buildNetworkGraph()` (index.html) builds one whole-network adjacency graph from the
  existing `LINES` data — no separate interchange dataset needed.** For every line (or every
  branch, for a branching line), each consecutive station pair becomes a graph edge; two
  stations with the exact same name across different lines automatically become the *same*
  graph node. That structural coincidence — same name, same node — **is** the
  interchange-hopping mechanic, entirely for free. Circle's real physical loop closure
  (`def.loopClosure`) also becomes a real edge (`stations[N-1]` → `stations[loopClosure[0]]`),
  not just a gameplay-journey artifact, so a random path can correctly route across the
  spiral's own closing stretch too.
- **`KNOWN_NAME_COLLISIONS` (index.html, promoted out of what was previously
  `test/interchanges.test.js`-only exception data) is what stops the graph from merging a
  same-name-but-different-station pair into a fake interchange** — Bakerloo's own "Edgware
  Road" vs. the Circle/District/H&C one, Piccadilly's own "Heathrow Terminal 4" vs.
  Elizabeth's. Without this, a random shortest path could silently "teleport" through a
  connection that doesn't physically exist. `networkNodeId(name, lineId)` namespaces exactly
  those excepted (name, line) pairs into their own graph node (`"Edgware Road::bakerloo"`,
  distinct from the plain `"Edgware Road"` node every other line's own station still shares)
  — `test/network.test.js` asserts the namespaced and plain nodes are never the same object
  and are never direct graph neighbors of each other. `test/interchanges.test.js` now reads
  this same shared constant via a `getKnownNameCollisions()` test hook rather than keeping its
  own separately-maintained copy.
- **Random pair, deterministic path**: `generateNetworkJourney()` re-rolls a random start/end
  node pair (`pickRandomNetworkPath()`) until the BFS shortest-path length falls in a target
  ~5–15 stop range (roughly matching an average existing line run) — the real network is fully
  connected in practice, so this always resolves in a handful of attempts; a bounded retry
  count falls back to the last rolled pair rather than looping forever on the off chance it
  doesn't. `networkShortestPath()`'s BFS always expands neighbors in a fixed sorted order, so
  the *path* for any given pair is always deterministic even though *which* pair gets picked
  is random each time — this is what makes `test/network.test.js`'s hand-verified-length
  assertions and its "repeated calls agree" check possible.
- **Called fresh on every "Start playing" *and* every "Play again"** (`beginRun()`, guarded on
  `mode === 'network'`) — "randomized each run" means literally that, not a route fixed once
  per session. Both entry points already funnel through `beginRun()`, so this needed no
  separate wiring for the restart path.
- **Live "which real line am I on" cue, both a small badge and the app's own accent theme** —
  `currentRealLineId()` is the one function everything else should read through instead of
  `LINE.def.id` directly (interchange badges, the badge pill, the theme), since
  `LINE.def.id` is the synthetic `'network'` in this mode; it resolves to
  `LINE.edgeLines[idx-1]` (clamped, falling back to the very first edge at question 0, before
  anything's actually been "walked" yet). `updateNetworkLineBadge()` only touches the DOM
  (re-applies `applyLineTheme()` with the new line's real color, mutating `LINE.def.color` in
  place first) on an actual leg change, not on every single question, via
  `currentNetworkBadgeLineId` tracking the last-applied line — the same "don't re-trigger
  unless something really changed" discipline the streak flame's own reignite-vs-bump
  distinction already uses. The badge itself reuses `.interchange-chip`'s exact CSS rather
  than introducing a new chip style.
- **`renderInterchanges()`'s two `LINE.def.id`-keyed checks (the Bakerloo/Edgware Road
  exception and the "don't badge your own current line" filter) both route through
  `currentRealLineId()` too** — reading `LINE.def.id` directly would silently break both once
  it's the synthetic `'network'` value; this fix applies to every mode, not just Network,
  since `currentRealLineId()` is a no-op passthrough (`return LINE.def.id`) whenever
  `LINE.def.layout !== 'network'`.
- **No SVG diagram, no line/branch/direction Setup UI at all.** `setupGeometry()`/
  `drawDiagram()`/`drawRoutePreview()` all guard on `LINE.def.layout === 'network'` and return
  immediately — a path that can cross an arbitrary number of differently-shaped lines has no
  single sane diagram to lay out (see the existing "station name labels on the route map...
  tried repeatedly and abandoned" precedent above; this is the same kind of rabbit hole, not
  attempted). Since Network mode ignores line selection entirely, `setMode('network')` also
  hides the Line ribbon, Branch grid, Direction board, and both diagram cards (Setup's route
  map and Play's "Line progress") outright, collapsing Setup to just Mode row → Start playing
  — extending the same per-mode show/hide pattern MC's own direction-row hiding already
  established, not a new mechanism. The Play page's LED "Calling at" board is the one
  exception that *stays* — `terminusNames()`/`updateDirectionBoard()`/`viaText()` only read
  `LINE.stations`/`journeyNames` and a null-guarded `LINE.def.branches`, all already correctly
  populated by the network runtime object, so it needed no changes at all.
- **Leaving Network mode restores the real line that was active before entering it** —
  `preNetworkLine` (`{ id, branchId }`) is captured once, on entry (the Line ribbon is hidden
  the entire time Network mode is active, so nothing can change this underneath it), and
  `setMode()` rebuilds `LINE = buildLineRuntime(...)` from it on the way back out to any other
  mode, re-running `renderBranchRow()`/`applyLineTheme()`/`updateDirectionBoard()`/
  `setupGeometry()`/`drawRoutePreview()` to resync everything a real line's own Setup state
  depends on. `reverseDirection` is force-reset to `false` on *entering* Network mode too —
  `seq()` reads it regardless of mode, and a leftover reverse toggle from whatever real line
  was active before would otherwise silently quiz the freshly-generated path backwards, out of
  sync with its own forward-built `def.label` framing text (`"Warren Street → Stratford"`).
- **`test/network.test.js`** splits into the same two tiers this repo's other suites use: an
  exhaustive pure-function tier (graph-collision safety, BFS determinism, a handful of
  hand-verified station pairs with known expected path lengths — including one, Bond
  Street/Green Park, that's a trap for assuming the *obvious* interchange when a more direct
  same-line adjacency actually exists) with no jsdom timers/clicks needed, plus a sampled
  UI-regression tier that plays through 8 full real-randomness runs via "Play again" rather
  than one fixed pair — the input space (any 2 of 400+ stations) is too large to exhaustively
  cover, so this samples real end-to-end runs on the theory that a stitching bug would surface
  in essentially any random run, not just a specific one. `test/geometry.test.js` adds one
  guard test confirming Network mode never attempts diagram geometry and keeps both diagram
  containers hidden. Hook-returned path arrays (`window.__TEST__.networkShortestPath()`, etc.)
  are wrapped in `Array.from()` before any `assert.deepEqual` against a plain local array
  literal — the same cross-realm jsdom gotcha this file's own "Running tests" section already
  documents for other hook values, re-encountered here.

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
the route-map station popup stays compact rather than the oversized bubble it once was, every
line-ribbon chip and primary button meets WCAG AA contrast for every line in both themes, and
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
- **`showPage()`'s Setup<->Play transition is a timed two-stage sequence, not an instant
  swap — anything that depends on the target page actually being visible must wait for
  that, not for the click alone.** The outgoing page gets `.page-leaving` (fade + slide out,
  `pageLeave`, 180ms) while the incoming page stays `hidden`; only once that timer fires does
  the outgoing page actually get `hidden` and the incoming page lose it and get
  `.page-entering` (`pageEnter`, 220ms). `showPage(page, onShown)`'s optional `onShown`
  fires at that exact moment — the "start playing" flow passes `beginRun` as `onShown` so
  the countdown still starts right when the play page appears, not stacked after its own
  entering animation too. This turned a real, reproducible bug: both `e2e/layout.spec.js`'s
  progress-rail test and `test/gameplay.test.js`'s `playThroughRun()` used to wait on
  `#countdownOverlay` losing `.hidden` right after clicking "Start playing" — but the overlay
  *starts* with `.hidden` already present, so that wait was true from the very first instant
  and had only ever worked because the old synchronous swap made the race moot. Both now
  wait for `#playPage` to actually lose `.hidden` first, then wait on the overlay for real.
  If you add another flow that acts on the play page right after triggering the switch to
  it, it needs the same two-step wait (or an `onShown` callback), not a bare click-and-go.
- **`runCountdown()` must clear any previous countdown interval before starting a new
  one (`countdownInterval`, a module-level variable) — `beginRun()` itself has no
  debounce.** "Start playing" is implicitly protected against a rapid re-click by
  `showPage()`'s own `pageTransitionTimer`/`clearTimeout` (a second click cancels the first
  click's pending `onShown`/`beginRun()` before it ever fires, so only the latest click's
  countdown ever starts), but "Play again" (`#restartBtn`) calls `beginRun()` directly on
  every click with no equivalent guard. A fast repeat click there — very plausible in MC,
  where getting back into another round is a single click with no typing in between, unlike
  warmup/quiz — used to start a second `setInterval` on top of a still-running first one,
  both ticking down independently and racing to update the same `#countdownOverlay`/
  `#countdownNumber`. Whichever finished first hid the overlay and fired `onComplete()`
  (corrupting `startTime` for the run that was actually still counting down), while the
  other kept ticking invisibly underneath and fired `onComplete()` a second time later. The
  visible symptom was a countdown that looked shortened or skipped a beat — confirmed by
  reproducing it with two `restartBtn` clicks 300-900ms apart and watching the total
  countdown finish in ~3.4-3.7s instead of the correct ~4.2s. Clearing the previous interval
  before assigning a new one makes the newest call always fully supersede any prior one, the
  same "latest click wins outright" behavior `showPage()` already gives "Start playing".
- **A media-query override only wins if it comes *after* the base rule it overrides, in source
  order.** Wrapping a rule in a matching `@media` query does not by itself make it take
  priority — CSS resolves ties between equal-specificity rules by source order regardless of
  which are inside a media query, so an override placed earlier in the file (as the responsive
  text-scale-up block briefly was) silently loses to a later base rule even while its media
  condition matches. The fix: put breakpoint overrides last in the stylesheet, after every rule
  they touch — see the block just before `</style>` in `index.html`.
- **Every `LINES.<id>.color` must be the line's real, current TfL brand hex — and must match
  `LINE_BADGE_COLORS[id]` exactly**, since the two are meant to be the same color used in two
  places (a line's own diagram vs. its interchange badge shown on other lines). Central's own
  `color` drifted to `#DC241F` (an old/retired TfL red) while its badge color was the current
  `#E32017` — a real, silent mismatch, fixed by making them match.
- **The route map (`drawRoutePreview()`) and in-game "Line progress" diagram
  (`drawDiagram()`) always draw a line in its true, undarkened color — in both themes.**
  `darkenForLightMode()` exists for *text/accent* uses (`--accent-ink`, e.g. the active
  mode/direction button's own text) where a vivid color like Circle's yellow would be
  illegible as thin text on white — but a route-map line is a thick stroke with real dots,
  not text, and stays clearly legible at full brightness; darkening it there just makes
  Circle read as a muddy olive instead of actually looking like Circle's line, defeating the
  point of a map. Don't reach for `darkenForLightMode()` for a new diagram/map feature
  without checking whether it's text (needs it) or a drawn line/shape (almost certainly
  doesn't). The line-ribbon chips (see below) are the same call as the route map: a *fill*,
  not text, so they use `bestContrastInk()` against each line's true color rather than
  `darkenForLightMode()`.
- **`--accent-ink` needs its own dark-mode adjustment too, not just light-mode's
  `darkenForLightMode()`.** `applyLineTheme()` used to set dark mode's `--accent-ink`
  straight to the line's true color, unadjusted, on the assumption that any line color is
  bright enough to read as text against the dark `--bg` (#121317) — true for most lines,
  but Northern's true color is pure black, making its own line name in the header, its
  active mode/direction/branch buttons, etc. render as literal black-on-near-black: real,
  reported illegible text. `lightenForDarkMode()` is the dark-mode counterpart:
  progressively lightens a color toward white only as far as needed to clear real WCAG AA
  contrast (4.5:1, `contrastRatio()` against `DARK_MODE_BG`) against the dark background,
  leaving already-legible colors (most lines) at their true, unmodified color — checked for
  all 10 real lines, not just Northern, since a few others (Central, Bakerloo, District,
  Piccadilly, Metropolitan) were also just under the threshold and got a small nudge too.
  Light mode's `darkenForLightMode()` is untouched by this — Northern's black already reads
  fine as text on a light background, it's only ever a dark-mode problem.
- **The Setup screen's line picker (`.line-select`) is a horizontal ribbon of solid line
  colors, not a wrapping row of pills.** Chips run in rainbow (ROYGBIV hue) order —
  `LINE_RAINBOW_ORDER` — not the order their buttons happen to be declared in: Central,
  Bakerloo, Circle, District, Waterloo & City, Victoria, Piccadilly, Metropolitan, H&C,
  then Jubilee's silver and Northern's black (no real hue, so they sit after the spectrum
  rather than arbitrarily mixed into it) last, with Elizabeth's "soon" chip pinned after
  all of them regardless of its own hue, since it isn't a real destination. Waterloo & City
  isn't in the DOM until the Drain egg is found, so its egg-creation code calls
  `insertLineChipInRainbowOrder()` rather than a plain `appendChild()`, walking the already-
  present chips to find the first one whose `LINE_RAINBOW_ORDER` position is greater than
  its own (falling back to just before the Elizabeth chip) — a new hidden/egg line needs the
  same treatment, not an append, or it'll land at the wrong end of the spectrum. Every line
  is always on screen at once, on any viewport, with no horizontal scrolling — `.line-chip`'s
  width is a pure flex-grow ratio
  (`flex: 1 1 0%`, `7 1 0%` for the expanded one, `0.6 1 0%` for the "soon" sliver) that
  always sums to exactly the container's width, rather than a fixed pixel size that could
  overflow a narrow phone. Chips sit flush against each other by explicit instruction — no
  `gap`, no separator background — so the whole thing reads as one continuous strip of
  colour, not a row of separate tiles; per-chip corners are square for the same reason
  (only `:first-child`/`:last-child` round off, so the *ribbon's* two outer ends still read
  as one rounded-rect container while every internal seam between colors stays flush —
  `:first-child`/`:last-child` have higher specificity than the plain `.line-chip` rule, so
  this wins outright regardless of which other state classes are also on that chip). Only
  one chip is ever expanded (showing its name/count) at a time: the selected line stays
  expanded always (so a phone with no hover still always has the current selection's name
  visible), and hovering/focusing any other chip previews it expanded instead, collapsing
  back to the actual selection on mouseleave/blur (`collapseChipsToActive()`) — this is a
  desktop-only bonus, never the only way to identify a line, since simply *being the one
  chip expanded at rest* (when nothing is hovered) is the only "this is selected" signal
  now, by explicit instruction: an earlier version also had a "✓" before the active chip's
  name and a neutral inset ring (`box-shadow`) around it, both removed since the rest-state
  expansion alone was judged sufficient, and selecting a line no longer plays any scale/pop
  animation on the chip either — only the flex-grow width transition. `paintLineChips()`
  sets each chip's `--chip-color`/`--chip-ink` once (colors don't change
  with the light/dark theme toggle, so unlike the old pills' `applyPillColors()` this never
  needs to re-run on theme switch — only once at startup and once more after the Waterloo &
  City egg chip is appended). The class was renamed from `.pill` to `.line-chip` throughout
  — including `test/gameplay.test.js`, `test/geometry.test.js`, and `e2e/layout.spec.js`'s
  selectors — since it's no longer pill-shaped; don't reintroduce `.pill` as a name for
  anything here. **Elizabeth is a real, fully-interactive chip** (`#lineElizabethBtn`, per
  explicit instruction) even though it has no `LINES.elizabeth` to switch to — it's a
  `<button>` wired through the same `wireLineChipHover()` as every real line (so it
  hover/focus-expands identically), but its click handler shows the same `showEggToast()`
  "coming soon" toast the hidden easter eggs use instead of calling `setLine()`. Its `.soon`
  fill is a flat dimmed tint of its own true color (`LINE_BADGE_COLORS.elizabeth`), not the
  diagonal-hatch pattern an earlier version used — the hatch made the expanded label
  half-illegible (white text vanishing over its lighter stripe bands), which only mattered
  once the chip actually became hoverable/readable.
- **Setup order is now Mode, then Line, then Branch, then Direction — Mode moved above the
  Line ribbon by explicit instruction (the second deliberate Setup-order change in this
  repo's history, after Branch-before-Direction below; don't re-swap either without checking
  first).** This required pulling the Line ribbon (`#lineSelectLabel`/`#lineSelectGroup`) out
  of `<header>` entirely — `<header>` used to hold both `.header-row` (pure page chrome: the
  title, theme/sound toggles) and the Line ribbon, an asymmetry that predates this change.
  `<header>` now contains only `.header-row`; Mode, Line, Branch, and Direction are four
  sequential sibling sections below it. The `.setup-divider` that used to sit between
  `<header>` and Mode was removed by explicit instruction (Mode now follows the header
  directly, with only the header's own `margin-bottom` as spacing) — the app's other
  `.setup-divider` (between Direction and "Start playing") also moved, from *above* to
  *below* "Start playing", so it now separates the actionable controls (Mode through the
  Start button) from the read-only route-map preview beneath, rather than sitting
  immediately above the button. No CSS was scoped to `header .line-select`, so the Line
  ribbon's move needed no other fix-up.
- **The four Mode buttons (`#modeWarmupBtn`/`#modeQuizBtn`/`#modeMcBtn`/`#modeNetworkBtn`)
  are round, icon-only circles, not the old rectangular button + `<small>`-subtitle row** —
  the full label/description only shows in a floating `.mode-btn-callout` card on hover,
  keyboard focus, or when actually selected, by explicit instruction. Icons are hand-authored
  inline `<svg>` line-art (`viewBox="0 0 22 22"`, `stroke="currentColor"`, `stroke-width:1.6`,
  round caps/joins, fill only on small solid accent dots/nodes) rather than Unicode glyphs —
  `.theme-toggle`'s `☀`/`♪` work fine for two generic icons, but this codebase has already hit
  Unicode's limits for a precise glyph once (the `.muted` sound-toggle's own combining-
  character tofu-box problem, solved by drawing a CSS shape instead); four *semantically
  distinct* mode concepts need the same "don't trust font-glyph roulette" treatment.
  `stroke="currentColor"` means every icon inherits `.mode-btn`'s own `color` exactly the way
  the theme-toggle's text glyphs already do — works across both themes and the active/inactive
  state with no extra wiring. Warm-up = a bullseye (two concentric circles + a filled center
  dot, literal to "a target station is shown"); Recall quiz = a filled node connected by a
  dashed line and small arrowhead to an open node ("known stop → recall this one"); Multiple
  choice = a 2×2 grid of four outlined squares, one holding a checkmark ("four options, one
  chosen"); Network = three nodes joined by two *angled* segments with the middle
  (interchange) node filled and the two ends open — deliberately not a straight two-node
  line, so it reads distinctly from Recall quiz's icon at a glance.
  `.mode-btn`'s diameter scales at the existing 900px/1300px breakpoints (48→54→60px, a flat
  +6px per step — the same cadence `.line-select{ height:56px→62px→68px }` already uses)
  rather than staying a fixed size like `.theme-toggle` does, since these are primary Setup
  controls, not secondary utility icons. The four sit close together as one clustered group
  (`.mode-select{ justify-content:center; gap:20px }`), not spread edge-to-edge across the
  full row width the way the Line ribbon/Branch grid/Direction board deliberately are — by
  explicit instruction, since these buttons read as one cohesive control rather than a
  full-bleed section.
- **The hover/selected reveal is a floating callout card, not the Line ribbon's flex-grow
  expansion.** `wireModeBtnHover()`/`collapseModeBtnsToActive()` are ported 1:1 from
  `wireLineChipHover()`/`collapseChipsToActive()` (same one-expanded-at-a-time pattern:
  mouseenter/focus previews, mouseleave/blur reverts to the actually-active button), but where
  `.line-chip.expand` grows the chip itself via `flex-grow`, `.mode-btn.expand` instead fades
  in a `.mode-btn-callout` child — a fixed 48-60px circle can't grow to reveal text the way a
  flush, zero-gap flex ribbon chip can. The callout's visual style (rounded panel, border,
  shadow, compact padding) is modeled on `.station-popup`, but its positioning deliberately is
  not: `.station-popup` needs `getBoundingClientRect()`-measured, scroll/zoom-safe JS
  placement because it anchors to an arbitrary, pannable station dot; the Mode row's geometry
  is fixed and known ahead of time (always exactly 4 buttons in one static row), so the
  callout is positioned with plain CSS, always centered under its own button
  (`left:50%; transform:translateX(-50%)`) — an earlier version special-cased the first/last
  buttons to anchor their callout to the button's own outer edge instead of centering (to
  avoid overflowing `.wrap` when the row was spread edge-to-edge via
  `justify-content:space-between`), but that's no longer needed now that the buttons are a
  centered, gapped cluster with real margin on both sides — don't reintroduce it unless the
  row layout goes back to a full-width spread. It opens **downward**, not upward — tried
  upward first (open space above Mode, being the first Setup section now), but the "Mode"
  section label and the banner above left too little clearance and the callout visibly cut
  across that label's own text. Opening downward toward the Line ribbon had the same problem
  in reverse, so `.mode-row`'s own `margin-bottom` is deliberately oversized (64px, vs. every
  other Setup section's 16-18px gap) — real reserved clearance for the callout to fully open
  without cutting across the Line ribbon beneath it, confirmed by screenshot after both
  directions were tried and measured, not assumed. `setMode()` toggles `.expand` in lockstep
  with `.active` on every real mode switch, mirroring `setLine()`'s own paired
  `.active`/`.expand` toggle (not `collapseModeBtnsToActive()`'s hover-revert path, reserved
  for the mouseleave/blur handlers only), so the selected mode's callout always stays visible
  at rest with no hover required.
- **Direction is an LED "next train" style destination board (`#directionBoard`/
  `.dest-board`), not two forward/reverse pill buttons — and Branch is a squared 2-column
  grid (`.branch-grid`/`.branch-chip`), not a wrapping pill row.** Setup order is Branch,
  then Direction (this flipped once mid-development and was reverted back by explicit
  instruction — don't re-swap it without checking first). Tapping the whole board reverses
  the practice direction; a short instruction is appended to the section label itself
  (`.direction-hint`, e.g. "Direction (tap the board to change direction)") since the
  board's own clickability isn't otherwise obvious the way two separate buttons were. The
  board is two lines. Line one is `"1  <destination> [via X]"` left-justified and `"On time"`
  right-justified (`.led-row`/`.led-left`/`.led-num`/`.led-scroll-viewport`/`.led-scroll`/
  `.led-dest`/`.led-via`/`.led-right`) — a real "next train to X"
  board only ever shows the *one* current destination, so `updateDirectionBoard()`
  deliberately only updates `#ledDest` to whichever end of `terminusNames()` the current
  `reverseDirection` is heading toward, rather than keeping a fixed pair of names in place
  the way an earlier two-terminus-board version did (that version's "don't swap the names"
  constraint doesn't apply here — there's only one destination field now, and it changing
  to reflect the current direction is exactly correct, same as a real platform board shows
  a different destination depending on which physical direction you're viewing). `via X`
  (`#ledVia`, `viaText()`) is parsed straight out of the current branch's own label wherever
  one contains "via" (Northern's "via Bank"/"via Charing Cross", Central's "via Woodford" —
  its label had its parentheses deliberately removed, `'West Ruislip – Hainault via
  Woodford'` not `'(via Woodford)'`, so `viaText()`'s regex and the branch chip text read
  identically) rather than as separate per-branch metadata, so the two can never drift
  apart; branches with no "via" in their label show none, and hide `#ledVia` entirely
  (`display:none`, not just empty text, since a lone stray gap would still show in the flex
  row otherwise). Line two is `"Calling at: "` plus every station in the current
  branch/direction's own order (the same `reverseDirection ? LINE.reversedJourneyNames :
  LINE.journeyNames` list everything else in the app already uses), comma-separated
  (`.led-calling-viewport`/`.led-calling-scroll`). The platform number `"1"` is **not** part
  of either line's scrolling content — it's a separate, always-visible flex sibling of
  `.led-scroll-viewport` inside `.led-left`, exactly like `"On time"` is a fixed sibling of
  the whole row — only `.led-scroll` (destination + via) actually scrolls under it. Both
  lines render at the *same* font size (`.led-num`/`.led-dest`/`.led-via`/`.led-right`/
  `.led-calling-scroll` share one selector, at both responsive breakpoints too) — an earlier
  version made line two visibly smaller as a "secondary line" convention, reverted by
  explicit instruction — and sit close together (`.led-calling-viewport{margin-top:2px}`,
  down from an initial 6px, again by explicit instruction) so the two read as one cohesive
  two-line indicator, not a headline-plus-caption. The LED text is a fixed bright amber
  (`#FF9500`) in the embedded `LT Railway` font
  (`@font-face`, a data-URI OTF alongside P22 Underground's — same embedding pattern,
  `format('opentype')` not `format('truetype')`) — **not** a per-line contrast-computed
  colour like the rest of this app's line-tinted elements, since a real LED indicator is
  always amber regardless of which line it's on; verified >4.5:1 against both plate colors
  (8.59:1 dark, 6.51:1 light). No glow/text-shadow on the LED text, by explicit instruction.
  Either line can be wider than the board (a long destination name plus "via X", or a 50+
  station "Calling at" list on a line like Piccadilly/Northern) — rather than truncating
  with an ellipsis, an overflowing line becomes a **ticker** (`refreshTickers()`/
  `applyTicker()`): it holds at its start position, scrolls left (`ease-in-out`) to reveal
  the rest, holds at the fully-scrolled end, then **snaps instantly back** to the start (a
  real jump via a `steps(1, jump-start)` keyframe stop, not a fast reverse-scroll — confirmed
  by sampling `getComputedStyle(...).marginLeft` over time in a real browser) and loops, by
  explicit instruction on both the snap style and the loop shape. The destination line and
  the "Calling at" line tick **independently** (also by explicit instruction) — each is timed
  from its own measured overflow distance and its own speed (`ledTickerCalling` runs faster
  than `ledTickerDest`, since the calling-at list is typically much longer and would
  otherwise feel sluggish), so the two naturally drift in and out of phase with each other
  rather than staying in lockstep, same as a real dual-line indicator would. A line that
  already fits its viewport is left alone entirely — no animation, no transform, just static
  left-aligned text — checked via `scrollWidth` vs the viewport's own `clientWidth`, not any
  fixed text-length threshold, so it stays correct at every branch/direction/viewport-width
  combination rather than just the ones tested by hand. **The scroll itself animates
  `margin-left`, not `transform:translateX()`, by design** — a real side-by-side comparison
  showed the "Calling at" line rendering visibly blurrier than the static destination line,
  and the cause turned out to be `transform` itself: *any* non-`none` transform value (even a
  motionless `translateX(0px)` set with no animation running at all) takes an element onto
  its own composited layer, which several browsers rasterize/antialias text on less crisply
  than ordinary in-flow text — confirmed by forcing the same no-op transform onto the
  (otherwise static and crisp) destination line and watching it turn equally blurry.
  `margin-left` produces the identical horizontal shift through ordinary layout instead, with
  no separate compositing layer, so the ticker text now stays exactly as sharp as the static
  line throughout the whole animation. Each keyframes rule is generated per-refresh into a
  dynamically created `<style id="tickerKeyframes">` (not the committed stylesheet —
  animation distances/durations are runtime-measured pixel values, not constants) and re-run
  on every `updateDirectionBoard()` call (line/branch/direction change) and on a
  `ResizeObserver` watching `#directionBoard` itself (guarded with a `typeof ResizeObserver
  !== 'undefined'` check — jsdom, the unit-test harness, has no such global; the unit suites
  don't do real CSS layout anyway, so ticker overflow always measures as zero there
  regardless, and only `e2e/layout.spec.js`'s real Chromium exercises actual scrolling).
  The board's plate is still a dark colour by design (echoing a real platform departure
  board), but **not the same dark for both app themes** — `--board-bg` is `BOARD_BG_DARK`
  (`#101114`) in dark mode but a softer charcoal `BOARD_BG_LIGHT` (`#2c2a27`) in light mode,
  since the same near-black read fine against the app's own dark background but was a
  jarring slab against the light theme's cream page. The branch grid rounds only its 4 true
  outer corners (`applyBranchGridCorners()`, computed per-chip since the last row can hold 1
  or 2 chips depending on whether the line's branch count is odd or even — 3 to 8 depending
  on the line — which plain CSS `:nth-child` can't express generically) and always keeps its
  2 columns even on an odd count — but the lone leftover chip's empty neighbour is a real,
  non-interactive placeholder cell (`.branch-chip-empty`, `aria-hidden`, `pointer-events:
  none`, styled identically to an inactive chip) that `renderBranchRow()` appends and feeds
  into the same corner-rounding pass, **not** just left as blank grid track space — an
  unfilled track still leaves that corner of the grid looking "bitten" since nothing occupies
  it to carry the rounding. Chips carry their own `border: 1px solid var(--line)` instead of
  a shared grey fill behind the grid gap — the same convention `.mode-btn`/`.mc-option`
  already use for a row of option buttons — since a solid background peeking through the
  gaps read as an unwanted grey wash. Old `.direction-btn`/`.direction-group` (shared by both
  features before this redesign) are gone entirely; don't reintroduce them.
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
- **`test/interchanges.test.js` only catches tube-line-to-tube-line gaps — it can't check
  the London Overground/DLR/Elizabeth/National Rail badges, since those aren't full playable
  `LINES` entries with their own station array to cross-reference against; they're hand-entered
  per station.** A full pass against every Overground line's own Wikipedia article (all six:
  Liberty, Lioness, Mildmay, Suffragette, Weaver, Windrush) plus DLR and the Elizabeth line
  found six real gaps this way: Kensington (Olympia), Kew Gardens, and Gunnersbury were all
  missing Mildmay; Barking was missing Suffragette; Upminster was missing Liberty; Tottenham
  Court Road was missing Elizabeth. Kew Gardens and Gunnersbury's existing `nationalrail`
  badges were also wrong, not just incomplete — both stations are Underground + Overground
  only with no separate National Rail franchise operator (confirmed via each station's own
  infobox), so `nationalrail` there was a stale leftover and got replaced with `mildmay`
  rather than just supplemented. **Same name ≠ same station is the recurring trap here** —
  Bethnal Green (Central) and Camden Town (Northern) both have a same-named/nearby Overground
  station that Wikipedia explicitly describes as a separate building or an OSI (out-of-station
  interchange, a walk between faregates) rather than a real interchange, same as this file's
  existing Bakerloo/Edgware Road and District/Shepherd's Bush exceptions — don't badge those
  without re-checking the specific station's own infobox first, and don't treat an OSI as
  equivalent to a real interchange (Moorgate's Elizabeth line access, itself only an OSI via
  Liverpool Street, was checked and deliberately left unbadged for the same reason). National
  Rail itself (as opposed to the smaller, fully-enumerable Overground lines) is too broad a
  network to exhaustively verify station-by-station in one pass — treat any particular
  `nationalrail` badge as worth double-checking against the station's own infobox if it's
  ever in question, rather than assuming the existing ~40 are all correct.
- **Adding a line that introduces brand-new stations (not shared with any existing line)
  needs its own dedicated interchange pass — badging only the stations it shares with
  existing lines isn't enough.** Elizabeth line's initial `STATION_INTERCHANGES` work only
  added `elizabeth` badges to stations that already had entries (i.e. shared with an
  existing tube line); it silently skipped the ~29 brand-new western (Reading branch) and
  eastern (Shenfield branch) stations that don't appear on any other line at all, so real
  National Rail/DLR/Overground interchanges there (Reading, Slough, Romford, Shenfield,
  Abbey Wood, Custom House, etc.) were missing entirely — caught only by direct user
  review, not by any test, since `test/interchanges.test.js` can't see a station that isn't
  shared with a second `LINES` entry. Verified each one against its own Wikipedia infobox
  rather than assuming a blanket "outer London = National Rail" pattern, since the two
  branches turned out to behave differently: the 2015 TfL Rail takeover left most
  intermediate Anglia-side (Shenfield branch) stations **fully Elizabeth-exclusive** —
  Greater Anglia no longer calls at all (confirmed individually for Maryland, Forest Gate,
  Manor Park, Ilford, Seven Kings, Goodmayes, Chadwell Heath) — while the GWR-side (Reading
  branch) mostly kept at least a residual GWR service even after Elizabeth line took over
  local stopping (Reading, Twyford, Maidenhead, Taplow, Burnham, Slough, Langley, Iver, West
  Drayton, Hayes & Harlington, Southall, West Ealing all keep a `nationalrail` badge; only
  Hanwell and Acton Main Line on that side are genuinely Elizabeth-only, breaking from their
  own branch's pattern). Romford is the one Anglia-side exception (still real Greater Anglia
  service, plus the northern terminus of Overground's Liberty line). Custom House is a
  genuine walkable DLR interchange; Woolwich is the same "same name, different building" trap
  as this file's other exceptions — the real National Rail/DLR interchange there is the
  separate, nearby "Woolwich Arsenal" station, not "Woolwich" itself, so it stays badge-free.
  First pass also missed Ilford outright (no entry at all, not just a wrong badge) since it
  was overlooked while iterating the station list by eye — re-verified by diffing every
  station name in each Elizabeth branch array against `STATION_INTERCHANGES`' own keys
  programmatically rather than trusting a manual pass a second time.
- **CSS-only diagram sizing, no scroll boxes.** `.diagram-card svg { width:92%; height:auto }`
  is a deliberate, explicit user preference over the earlier JS-computed-pixel-size approach.
  Don't reintroduce horizontal scroll containers for wide diagrams without checking first.
- **Station name labels on the route map preview were tried repeatedly and abandoned.**
  Don't re-attempt without discussing scope — see PROJECT_HISTORY.md §10 for what was tried
  and why it kept failing on tight branch-tree junctions.
- **The header (`.page-title`) is plain text in the embedded British Rail font, stacked on
  two lines — "Mind the" / "Station" — and identical on both Setup (`.header-row`) and Play
  (`.play-topbar`), not just Setup.** There is no separate line-name heading or roundel icon;
  the line name is already shown expanded in the line-ribbon chip below on Setup, and in
  `#playInfoLine` on Play. An earlier version used a `.logo-img` PNG for this (a black plate
  with a brand-yellow lockup) — replaced once the British Rail font was embedded, since real
  text scales/recolors for free where a raster image can't; don't reintroduce an image here.
  "Station" (`.pt-line2`) isn't centered under the whole first line — it's shifted right via
  JS to start almost directly under the "t" of "the" (`.pt-the`), nudged a little further
  left of *exactly* under it by explicit instruction (`PAGE_TITLE_LINE2_NUDGE_EM`). That
  offset depends on the rendered width of "Mind " in whichever font is actually active, which
  CSS alone can't express — `alignPageTitleLines()` measures it via `getBoundingClientRect()`
  (the same "measure real geometry" approach as the streak-badge and LED-ticker positioning)
  and sets `.pt-line2`'s `margin-left` to match, re-run via a `ResizeObserver` on each
  `.pt-line1` (not `.pt-the` itself — a font swap can shift "the"'s position by changing how
  wide "Mind " renders without changing "the"'s own box size at all, which `.pt-the`'s own
  ResizeObserver wouldn't catch) so both the responsive font-size breakpoints and the
  embedded font finishing loading after an initial fallback-font paint keep it aligned. The
  whole two-line block is truly centered in its row via `position:absolute; left:50%;
  transform:translate(-50%,-50%)` (not `text-align:center` inside a flex:1 wrapper) since the
  row's other side only has a button on one side (Setup) or two differently-sized buttons
  (Play) — centering within a partial-width flex child would read as off-center relative to
  the row as a whole. This takes the title out of flex flow entirely, which is why
  `.header-row` needs `justify-content:flex-end` (its theme-toggle button is the only flex
  participant left) and why both rows need an explicit `min-height` (bumped alongside
  `.page-title`'s own font-size at the two breakpoints) — a position:absolute element doesn't
  make its container grow to fit it. Font-size is `clamp(22px, 7vw, 32px)` rather than a
  fixed 32px specifically to avoid this: true centering means the title's own width eats
  equally into both sides regardless of the button(s) next to it, and a fixed size overlapped
  the theme-toggle button on a narrow phone. Play's title additionally needs
  `alignPageTitleLines()` called explicitly from `beginRun()` — its `.page-title` sits inside
  a `display:none` container until `showPage()` unhides it right before calling `beginRun()`
  as its `onShown`, and relying on the ResizeObserver alone to catch that hidden→visible
  transition wasn't reliable. Tried Circle line yellow (`#FFD300`) for the dark-mode title
  color and reverted it — too sharp against the dark background — so it stays `var(--ink)` in
  both themes. `document.title` (the actual browser-tab title) is untouched by any of this —
  a separate, plain-text browser API that can't render a custom font.
- **`document.title` is always the plain, fixed `"Mind the Station"` — no line name, by
  explicit instruction.** `setLine()` used to overwrite it with `LINE.def.label + ' Line —
  Mind the Station'` on every line switch; that call (and the matching static `<title>` in
  `<head>`, which used to hardcode the default line's own name) are both gone. Don't
  reintroduce a per-line browser-tab title without checking first.
- **The favicon and the two small icons on the page title's second line are the same
  asset**: "Arrow Upper Right" by kosonicon, from Flaticon, under Flaticon's free "with
  attribution" license — the required credit lives in the Terms modal's own Attribution
  section, not just a code comment, since that's the user-facing surface. Embedded as a
  base64 `data:image/png` URI (a 64×64 PNG, same pattern as the fonts elsewhere in this
  file) in five places: the `<link rel="icon">` tag and two `<img class="pt-icon">`
  copies in each `.page-title` instance (Setup and Play) — by explicit instruction, a
  second identical icon was added right after the first, both still ahead of
  `.pt-line2-text`. Whichever icons are present sit first in `.pt-line2`'s flex row,
  before the text — since that's the very first thing in the row, it lands flush under
  the "M" of "Mind" for free, with no separate JS measurement needed the way "Station"'s
  own the-alignment needs. `alignPageTitleLines()` still has to account for however much
  horizontal space the icon(s) actually take up when computing `.pt-line2-text`'s
  margin-left, though, or they'd push "Station" further right than intended — done by
  temporarily resetting the text's margin-left to 0 and reading its natural post-icon(s)
  position, rather than measuring any one icon's own box directly, so this keeps working
  regardless of how many icons end up in front of the text. `.pt-line2{ align-items:
  flex-end }` (not `center`) lines each icon's bottom edge up with "Station"'s own
  baseline/bottom instead — centering let the icon (no font ascent/descent of its own)
  hang visibly below where the text's real glyph ink ends, something a `getBoundingClientRect()`
  comparison on the text *element* doesn't reveal (its box includes reserved descender
  space below the actual baseline) — confirmed instead by a real zoomed-in screenshot,
  not just coordinates. `.pt-icon`'s own `margin-bottom` is the knob that pulls it up to
  close that gap; re-check with a real screenshot (not just element rects) if this ever
  looks off again. Dark mode inverts the icon(s) via a plain CSS `filter: invert(1)`
  rather than a second embedded image — the source icon is a solid black circle, which
  all but disappears against this app's near-black dark background; `body.light
  .pt-icon{ filter:none }` reverts to the icon's true colors in light mode, where black
  already reads fine. The whole title (`.page-title`) and each icon are `user-select:none`
  (both text and image, since this is a wordmark, not real content worth selecting/
  copying), and each `.pt-icon` additionally has `pointer-events:none` plus a
  `draggable="false"` attribute on the `<img>` itself, by explicit instruction — the
  pointer-events removal means a right-click on the icon no longer offers "Save image as"
  at all (the click falls through to a non-image parent instead), and `draggable="false"`
  blocks the drag-to-desktop save path. Neither is a real security boundary (view-source
  and devtools still show everything), just a reasonable deterrent for a decorative icon.
  `.pt-line2-text` ("Station") also carries a small `position:relative; top:-0.06em`
  nudge upward relative to the icon(s) beside it, by explicit instruction — a pure
  paint-time offset (not a margin change) so it doesn't feed back into
  `alignPageTitleLines()`'s own left-position math or the row's `align-items:flex-end`
  calculation for the icon(s).
- **The "Elapsed" label next to the live run timer (`#statTime`) was removed by explicit
  instruction** — the stopwatch icon/ticking dot already make it obvious what the number is;
  don't re-add a text label there.
- **The streak flame badge's flicker (`.flame-icon`, `flameFlicker`) force-restarts itself on
  every re-ignition, not just relying on the `.extinguishing` class removal.** `flameFlicker`
  is a permanently-declared `infinite alternate` animation on `.flame-icon` — normally the
  `.streak-flame.extinguishing .flame-icon{ animation:flameDie }` override reverting to the
  base rule when `.extinguishing` is removed is enough to bring it back, the same way
  `.bump`'s explicit remove→reflow→add cycle already restarts the pop on every increment.
  But an infinite animation resuming correctly after its element cycles through
  `display:none` is a known cross-browser inconsistency, not something to trust implicitly —
  so `updateStreakFlame()` also does the same `style.animation='none'` → reflow →
  `style.animation=''` reset on `flameIconEl` itself, but *only* when actually reappearing
  from a fully-extinguished state (`reigniting = !flameActive`, captured before any class
  mutation), not on every streak increment while already showing — restarting the flicker's
  keyframe on every correct answer while the badge is already lit would make it visibly
  stutter instead of flickering continuously.
- **Route map station dots have a separate, invisible tap-target circle layered on top,
  sized from the SVG's actual rendered width, not a fixed viewBox-unit radius.** The visible
  dot (`r: 4.8`/`3.6`) renders under 10px across on a phone — nowhere near tappable — but a
  fixed unit radius would render a wildly different pixel size across lines, since every
  layout's own internal viewBox scale is independently tuned (see the viewBox-scale hard
  rule below). `drawRoutePreview()` computes `pxPerUnit` from `svg.getBoundingClientRect().width`
  vs. the viewBox width and derives the hit circle's radius from a fixed `HIT_RADIUS_PX`
  (12, ~24px diameter) so the real on-screen tap target stays consistent across every line.
  Popup positioning (`showStationPopup()`) is still anchored to the true, small visible dot
  — not the padded hit circle — so the card stays snug against what's actually drawn. Both a
  `click` handler and the existing `mouseenter`/`mouseleave` pair are wired to the hit
  circle, since touch "hover" is a sometimes-flaky simulation of a tap, not a real event.
- **`.station-popup` is `position:absolute`, not `fixed`, and deliberately so.** A fixed
  element is positioned relative to the layout viewport, but on a phone that's pinch-zoomed
  in, that reference frame drifts out of sync with what's actually on screen — the classic
  "fixed element ends up somewhere else after zooming" bug. `getBoundingClientRect()` (used
  to measure the anchor dot and size the popup) is also layout-viewport-relative, so an
  absolutely-positioned popup measured the same way and placed with `window.scrollX/scrollY`
  folded in stays correctly anchored to its station dot at any zoom level, since both share
  the same reference frame. Don't revert this to `fixed` without re-solving that problem
  another way.
- **`.station-popup` has no close button** — removed by explicit instruction as genuinely
  redundant: the existing `document.addEventListener('click', ...)` handler already hides the
  popup on any click outside it (or off a station dot), so a dedicated "✕" button added a
  second way to do the same thing without enabling anything a plain outside-click couldn't
  already do. Don't re-add one without checking whether the outside-click dismissal still
  covers the case that prompted it. Removing it also freed up the popup's own right padding
  (previously wider than the other three sides to leave room for the button in that corner),
  now even on all sides.
- **A layout's viewBox padding (`pad` in the spur-loop/branch-tree geometry, `vbH`/`cy` in
  linear) has to leave room for `drawDiagram()`'s ✓/✕ tick marks** (offset 10.5 units outward
  from each dot via `outwardDir()`, plus their own text height) **but no more than that** —
  branch-tree's `pad` was trimmed from 45 to 22 and linear's `vbH` from 200 (station row at
  `cy:115`) to 110 (`cy:55`) after both left far more top/bottom whitespace than the tick
  marks actually need, especially for a wide/flat diagram (branch-tree) or a single flat row
  (linear) where nearly the whole padded height was empty. Both `#routePreviewSvg` (Setup's
  route map) and `#lineSvg` (Play's in-game diagram) share the same `geo.viewBox`, so a
  padding change affects both — check `drawDiagram()`'s tick marks aren't clipped, not just
  the route map's own look, before trimming further.
- **The Olympia egg (`#olympiaEgg`) lives *inside* the branch grid itself, not as a floating
  dot below it.** District already has an odd (5) real branch count, which already left a
  genuine trailing empty placeholder cell (see the branch-grid placeholder-cell rule above)
  — `renderBranchRow()` now fills that exact slot with the egg (styled via `.olympia-egg`'s
  small `::after` flicker dot layered on `.branch-chip`'s own box model) instead of leaving
  the grid at a clean 5 and rendering the egg as a separate element after it. Finding the
  egg adds a genuine 6th branch (`kensingtonOlympia`, an even count — no more placeholder
  needed), which lands in the exact same grid position the egg occupied, so nothing visibly
  reflows across the unlock. Since `renderBranchRow()` wipes `#branchGroup` via `innerHTML =
  ''` on every call, and the egg carries a real click listener attached once at boot (not
  something that can be recreated), the function always parks the actual `#olympiaEgg` node
  back as a plain sibling of the grid *first* — before that wipe — regardless of which line
  was showing it last, then re-appends it into the grid only if the current line/state
  actually calls for it. Never let it be a descendant of `#branchGroup` at the moment
  `innerHTML` gets cleared, or the real node (and its listener) is gone for good.
- **District's Edgware Road branch forks directly at Earl's Court — Gloucester Road is not
  on it.** `edgwareArm`'s station order is `["High Street Kensington","Notting Hill
  Gate","Bayswater","Paddington","Edgware Road"]`, and both the `wimbledonEdgware` branch and
  the hidden `kensingtonOlympia` egg branch insert only `"Earl's Court"` before it, not the
  full `trunk` (`["Earl's Court","Gloucester Road"]`) every *other* District branch correctly
  uses. This was a real, shipped bug — confirmed against both Earl's Court's and Gloucester
  Road's own Wikipedia infoboxes: Earl's Court's Edgware Road-bound platform lists High
  Street Kensington as the next stop, and Gloucester Road's District line entry only ever
  pairs it with Earl's Court/South Kensington on the main trunk. The `edgwareArm` *segment*
  (diagram geometry) forks from the spine at Earl's Court's own index too, in the same
  direction (`dy:-1`, up) as the pre-existing `wimbledonArm` does downward (`dy:1`) from that
  exact point — two arms sharing one junction in opposite cardinal directions, same pattern
  as other lines' multi-way junctions. This is exactly why the Olympia egg's own arm (also
  previously anchored at Earl's Court, also `dy:-1`) needed its own fix once edgwareArm moved
  there too: two segments from the same point in the same direction land their first station
  at the identical (x,y) — Kensington (Olympia) was rendering exactly on top of High Street
  Kensington until the egg's segment was changed to a diagonal off Earl's Court, by explicit
  instruction, reading as a short spur to the left of the Edgware Road branch rather than the
  cardinal-only stubs the rest of this line uses (acceptable here since it's one dot on a
  hidden egg branch, not a main arm). The diagonal's `dx`/`dy`/`spacing` are deliberately
  tuned (`dx:-1, dy:-1, spacing: 26 * Math.SQRT2`, not a plain `spacing:26`) so its *vertical*
  component still comes out to exactly 26 — matching edgwareArm's own rise to High Street
  Kensington unit-for-unit, putting Kensington (Olympia) at that same height per a follow-up
  instruction, while keeping the connecting line itself a true diagonal from Earl's Court
  (an earlier attempt anchored the arm on High Street Kensington's own position instead, going
  purely sideways — matched the height correctly but drew a horizontal line off High Street
  Kensington rather than a diagonal off Earl's Court, which wasn't what was wanted).
  `test/geometry.test.js`'s main collision suite doesn't
  unlock hidden egg branches (only the top-level lines/branches each line boots with), so a
  dedicated `district: hidden Kensington (Olympia) egg branch has no station collisions` test
  (alongside the existing `waterloocity` one) now exercises this specific path — the gap that
  let this collision ship unnoticed in the first place.
- **The streak flame badge is positioned in JS (`positionStreakFlame()`), differently per
  mode — there's no single anchor that works everywhere.** In warmup/quiz it sits just
  above Enter (`#inputRow`), right-aligned with that button's own real edge
  (`cardRect.right - anchorRect.right`) and a small fixed gap above its top — measured off
  the actual rendered rect every time `updateStreakFlame()` shows it (a fixed pixel guess
  doesn't work: the button's position shifts with card width and responsive font-size
  breakpoints), the same "measure real geometry, don't hardcode it" approach as the
  station-popup positioning and the LED ticker's overflow detection.
  MC has no equivalent safe anchor: the mc-context row ("Mile End – ? – Leyton") is the
  first thing in the card, Skip sits below the entire mc-options answer grid, and neither
  worked — anchoring above Skip the way warmup/quiz does floats the badge over whichever
  answer row happens to be there, and an earlier attempt pinning it in-flow to the card's
  own top-right corner put it on the exact same line as the context row's own text, which
  read as overlapping/awkward even without literal pixel collision. MC's badge instead
  peeks in from *outside* the card entirely (`MC_FLAME_PEEK_TOP: -34`,
  `MC_FLAME_PEEK_RIGHT: -12`, fixed offsets, no per-render measurement needed since it
  isn't anchored to any in-card element) — mostly above the card's own top border, dipping
  down only into the card's empty top padding, landing above where the context row's text
  actually starts rather than beside or over it. `#gameCard.streak-active .qc{
  padding-right: 76px; }` still reserves a gutter on question text, but now only in
  warmup/quiz (`updateStreakFlame()`'s `mode !== 'mc'` check on the `streak-active` toggle)
  — on a card with little content above (a short warmup target word) the badge above Enter
  can land right over the last bit of question text rather than clear above it, but MC's
  badge no longer sits over in-card text at all, so it no longer needs (or gets) that gutter.
- **Confetti fires for any run over 79% accuracy, not just a perfect one** — see the
  extra `acc > 79` check alongside the existing new-best-WPM/perfect-run conditions in
  `finishRun()`. A strong run still feels worth celebrating even with a miss or two.
- **Correct/wrong/completion chimes are synthesized via Web Audio (`playCorrectChime()`/
  `playWrongChime()`/`playCompletionChime()`), not a fetched or embedded audio file.** Keeps
  the app's zero-dependency, single-file nature and needs no CSP allowance for an audio
  resource, unlike the embedded fonts/logo which do need `data:` URIs. `AudioContext` is
  created lazily on first use rather than at boot, since browsers block audio starting
  without a user gesture — the first answer submission (a click or Enter keypress) already
  is one, so there's no separate "unlock" step. `playCorrectChime()`/`playWrongChime()` are
  wired into both `submitAnswer()` (warmup/quiz) and `handleMcAnswer()` (MC), all three
  modes, every line; `playCompletionChime()` is wired into `finishRun()` and plays on every
  run's completion regardless of accuracy, deliberately independent of the confetti
  accuracy-gate just below it in the same function (confetti stays conditional on a
  new-best/perfect/>79%-accuracy run; the chime doesn't gate on anything, since finishing a
  run is itself worth marking, win or not). Wrapped in `try/catch` — a chime failing to play
  (or `AudioContext` not existing at all, e.g. under jsdom in the test suite) must never
  block the actual answer-submission or run-completion logic around it.
  All three share one bell timbre (`playBell()`, layered under the plain-oscillator
  `playTone()`): a sine fundamental, a quiet octave-ish overtone (`freq*2.01`) for body, and
  a higher inharmonic partial (`freq*3.76` — real bells ring inharmonic overtones, not clean
  integer multiples) for metallic shimmer, each with its own short exponential decay envelope
  — this reads as an actual chiming bell rather than a plain synth blip, and was tuned (this
  timbre, these gain levels, these note timings) in a standalone "Chime Lab" prototyping
  artifact before being ported here, rather than designed directly in the game code. All
  three chimes are also built from the same underlying two-note "bing-bong" shape (G5→E5),
  so they read as one consistent sound world rather than three unrelated jingles: correct
  ("Bing-Bong-Ding") adds a bright top note (C6) after the bing-bong; wrong ("Chromatic
  Neighbor") replaces the resolving E5 with F#5, a semitone below G5, for a deliberately
  "off" clash instead of a resolution; completion ("Grand Resolve") extends the same shape
  into a full ten-note melodic line that pushes one step higher (G6) before descending back
  down, closing on a G5+C6+E6 chord. Note timings across all three (~0.095s stagger between
  quick notes) are intentionally slower than an early prototyping pass that used a faster
  ~0.07s stagger — the slower spacing gave each note more room to actually ring before the
  next one started, especially noticeable on the completion chime's longer melody.
- **The 3-2-1 countdown and its "Go!" also have sound (`playCountdownTick()` /
  `playTrainWhistle()`), wired into `runCountdown()`'s own `show(text, isGo)` helper** — a
  countdown tick plays for each of 3/2/1, a whistle plays once for "Go!" instead of a fourth
  tick, both fired from the exact same call that already drives the number's pop animation,
  so a repeat/restarted countdown (see the `countdownInterval` hard rule below) can never
  drift out of sync with what's on screen. The three ticks step up in pitch (C6→D6→E6, same
  bell timbre as the game chimes via `playBell()`) to build a little anticipation toward
  "Go!" rather than repeating one flat tone. `playTrainWhistle()` is a genuinely different
  timbre from every other chime in the app — two close triangle-wave tones (2637Hz/2960Hz,
  brighter/more piercing than the bell chimes' sine base) each carrying their own fast LFO
  vibrato (24Hz) on frequency, giving the warble/trill character of a real guard's pea
  whistle rather than a flat synth tone. Deliberately not built from `playBell()` — a
  whistle blast reads as a distinct sonic event marking "the run has actually started", not
  another note in the bell family the other five chimes already share.
- **Every button click gets a short, quiet feedback tick (`playClickSound()`), wired once
  via a single delegated `document.addEventListener('click', ...)` that checks
  `e.target.closest('button')`, not attached per-button.** This is deliberately the plainest
  sound in the app — a single `playTone()` call with no bell overtones at all — so it reads
  as a neutral UI click rather than a sixth musical chime competing with the others (correct/
  wrong/completion/countdown/whistle all use the shared bell or whistle timbres; this one
  doesn't). Firing from a delegated document-level listener means it needs no changes
  whenever a new button is added anywhere in the app, and it naturally still fires alongside
  a button's own more specific chime (e.g. Submit's correct/wrong chime) rather than
  replacing it — the click sound is quiet enough (peak gain 0.07, vs. 0.16-0.24 for the
  other chimes) that the two layer without competing.
- **The theme toggle (`#themeToggle`/`#themeTogglePlay`) is icon-only (`☀`/`☾`, no "Light"/
  "Dark" text label) by explicit instruction, and a same-styled sound toggle
  (`#soundToggle`/`#soundTogglePlay`) sits directly to its right on both Setup
  (`.header-row`) and Play (`.play-topbar`).** The sound button's glyph is always the plain `♪`
  (EIGHTH NOTE, the same pre-emoji Unicode range as `☀`/`☾`/`✓`/`✕`) — not `🔊`/`🔇` (full-color
  emoji pictographs, visually inconsistent with the flat monochrome glyphs everywhere else in
  this app) and not a swapped-in `⊘`/similar "off" character either, since a generic
  prohibition symbol read as disconnected from "sound" specifically once tried. Muted state is
  instead a CSS-drawn diagonal line over the same note glyph (`.muted` class toggled by
  `toggleSound()`, drawn via `#soundToggle.muted::after`/`#soundTogglePlay.muted::after`) —
  crisp and font-independent, rather than gambling on a Unicode combining "enclosing circle
  backslash" mark (designed for exactly this "no-X over a base glyph" purpose) that turned out
  to render as an unsupported tofu box in testing. `.theme-toggle` changed from text-driven
  padding to a fixed `width:38px; height:38px` circle so both buttons stay the same size
  regardless of which glyph they hold. Removing the visible text meant the state cue moved
  entirely to `aria-label` (`toggleTheme()`/`toggleSound()` update it on every click —
  "Switch to dark/light theme", "Mute/Unmute sound" — alongside the glyph itself) rather than
  relying on visible text the way most other toggles in this app do. Play's topbar needed a
  `.topbar-toggles` wrapper `<div>` around both buttons — `.play-topbar` is
  `justify-content:space-between` with exactly two flex participants expected (back button,
  the toggle group), and adding a bare third top-level button would have landed centered
  between them instead of paired with the theme toggle; Setup's `.header-row` needed no
  equivalent wrapper since it's already `justify-content:flex-end` with a single `gap` between
  whatever flex children it has. `toggleSound()` flips a new session-only `soundEnabled` flag
  (resets to on/unmuted on refresh, same as every other piece of state here) — muting doesn't
  gate each of the six chime functions individually; `getAudioCtx()` (the one function every
  `playXChime()`/`playClickSound()` call already routes through, directly or via
  `playTone()`/`playBell()`) throws when `soundEnabled` is false, which every caller's existing
  `try/catch` ("audio is a nice-to-have, never block on it") already silently absorbs — the
  same mechanism a real audio failure already uses, not a new code path. A side effect of this,
  not specially coded for: since the sound button's own click listener runs before the
  document-level delegated `playClickSound()` listener (bubbling from the button up to
  `document`), clicking to mute never plays its own click tick (already muted by the time the
  delegated listener checks), while clicking to unmute does (already unmuted by then) — reads
  as a natural "you just turned sound back on" confirmation rather than an inconsistency.
- **`.mc-options` is a 2-column grid at every width, including narrow phones, by explicit
  instruction** — a long station name wrapping to two lines there is an accepted tradeoff,
  not a bug. The old `@media (max-width: 480px){ .mc-options{ grid-template-columns: 1fr; }
  }` single-column fallback is gone; don't reintroduce it. Every `.mc-option` button shares
  the exact same height regardless of whether its own text actually wraps
  (`min-height: calc(2.9em + 28px)`, sized for the worst case of two real wrapped lines)
  rather than sizing to its own content — CSS Grid only stretches cells to match the
  tallest cell *in that row*, so two independently-sized rows (a short-label row next to a
  long-label row) would otherwise render at two different heights. The `2.9em` multiplier
  is deliberately more than the naive `line-height:1.3 × 2 lines = 2.6em` math suggests —
  measured empirically against real 2-line station names (e.g. "King's Cross St. Pancras",
  "Caledonian Road") at 340px viewport width, since actual rendered line height ran ~4px
  taller than the nominal `line-height` calculation alone predicted. Using `em` (not a fixed
  px value) means this scales automatically with `.mc-option`'s own font-size at the
  900px/1300px breakpoints, without a separate override at each one. Text is centered both
  ways — `display:flex; align-items:center; justify-content:center` for vertical centering
  of the whole (possibly 2-line) text block, plus `text-align:center` so each wrapped line
  centers within that block too (flex centering alone only positions the block itself, not
  the individual lines inside it) — replacing the plain left-aligned block text every other
  `.mc-option` styling used before.

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
- **Elizabeth** (41 stations) — `branch-tree` layout, Reading–Whitechapel as the horizontal
  spine (Reading is the spine's own western end, not a fork — same convention as District's
  Ealing Broadway–Upminster spine), per explicit instruction. Two Y-shaped forks, both per
  explicit instruction on their exact shape:
  - **Heathrow**, off the spine at Hayes & Harlington (the real fork is the unstaffed Airport
    Junction just west of it — simplified to the nearest named station, same simplification
    Piccadilly already makes at Acton Town): drops straight down to Heathrow Terminals 2 & 3,
    then splits into a Y **opening downward** — Terminal 5 to the left, Terminal 4 to the
    right — deliberately "vertically inverted" from Piccadilly's own Heathrow Y, which opens
    sideways off the spine's own end rather than downward off its middle.
  - **Shenfield/Abbey Wood**, off the spine's eastern end at Whitechapel: a Y opening
    rightward, Shenfield's arm forking up and Abbey Wood's arm forking down (placed below
    Shenfield, per explicit instruction), each then continuing as its own flat "parallel
    line" further east — not a loop or a shared pass-through; the two branches diverge
    completely at Whitechapel and never share another station.
  Exactly 9 branches, screenshot-verified against the real TfL branch list rather than
  assumed: the 5 real full through-services (Reading/Heathrow T4/Heathrow T5 crossed with
  Abbey Wood/Shenfield, except Reading×Shenfield, which never runs) plus the 4 real partial
  services that don't cross the central tunnel (Reading/Heathrow T4/Heathrow T5 each
  terminating at Paddington, and Shenfield terminating at Liverpool Street). Every station
  and fork point verified against its own Wikipedia infobox — the eastern split at
  Whitechapel in particular (which stations continue toward Stratford vs which continue
  toward Canary Wharf) needed real per-station verification, since an initial broader-article
  fetch produced two different, self-contradictory station orderings for it (inventing a
  shared "Wanstead Park"/duplicating "Chadwell Heath" across both branches, and inserting
  Abbey Wood-branch stations like Woolwich into the Shenfield list) before the per-station
  infobox pass caught and corrected it.
  Elizabeth's ribbon chip is a real, fully-interactive line now — the `.soon` class and its
  `showEggToast()` "coming soon" click handler are gone, replaced with `setLine('elizabeth')`
  like every other real line, and it moved from being pinned last in `LINE_RAINBOW_ORDER`
  into its actual rainbow position (between Piccadilly's blue and Metropolitan's magenta,
  where violet falls in a real spectrum) — both `paintLineChips()`'s "soon" special case and
  `insertLineChipInRainbowOrder()`'s "soon" fallback were dead-code-removed accordingly.
  **Elizabeth's own "Heathrow Terminal 4" is a separate, adjacent building from Piccadilly's
  same-named station** (confirmed per-station, not assumed) — same "same name, not a real
  interchange" situation as Bakerloo's Edgware Road, documented at that
  `STATION_INTERCHANGES` entry and exempted in `test/interchanges.test.js`'s
  `KNOWN_NAME_COLLISIONS`, though unlike Edgware Road it needs no `renderInterchanges()`
  special case, since neither building has any other real interchange of its own and the
  shared empty `[]` already produces the correct "no badges" result for both. Adding
  Elizabeth as a real line also surfaced a genuine pre-existing gap the interchange test
  hadn't been able to check before (Elizabeth wasn't real, so Canary Wharf was never
  cross-referenced against it): Canary Wharf was missing its own Jubilee badge.
- **Launch announcement banner** (`#announcementBanner`), Setup page only — not Play, which
  stays a focused gameplay screen. Fixed to Elizabeth's own true colour rather than
  `--line-accent`, since switching the currently-selected line shouldn't change what a static
  announcement about a specific other line looks like (the same "always the real brand
  colour" reasoning as the route map/diagram, applied to a new context). Square corners, full
  viewport width (the `calc(50% - 50vw)` breakout trick, independent of `.wrap`'s own
  max-width breakpoints), centred text, and a tight, thin profile (`padding: 5px 36px`) — by
  explicit instruction, deliberately not styled like this app's other rounded, padded cards
  (which would read as a floating toast/popup rather than an integrated, flush-to-the-page
  banner). A negative top margin (`-28px`, cancelling `body`'s own top padding, the only thing
  between this element and the actual page edge) pulls it flush against the very top of the
  page with no gap above it, also by explicit instruction. The whole banner is clickable
  straight into `setLine('elizabeth')` — a one-click way to actually try the thing being
  announced, not just a passive notice. It's a `<div role="button" tabindex="0">`, not a
  real `<button>`, specifically so it can contain a real, separately-focusable `<button
  class="banner-close">` for dismissal (a button can't contain another button) — which needs
  its own `stopPropagation()` so closing it doesn't also trigger `setLine()`, and the outer
  div needs a manual `keydown` handler for Enter/Space since a plain `role="button"` element
  gets no native keyboard activation the way a real `<button>` would. The close button is
  absolutely positioned in the corner rather than a trailing flex child, so its own width
  doesn't skew the centred text off from the bar's true centre — equal left/right padding on
  the bar itself (not extra padding on just the close-button side) is what keeps that
  centering true regardless of the button. Dismissal is session-only like every other piece
  of state in this app (no client-side storage) — it reappears on a fresh page load. This is
  meant as a temporary launch callout, not a permanent fixture — remove it once the Elizabeth
  line has been out long enough that
  announcing it is no longer news, rather than leaving it around indefinitely.
- DLR and London Overground remain discussed future extensions (see PROJECT_HISTORY.md §7),
  scoped as their own separate project phases.

## Security

CSP is deny-by-default (`default-src 'none'`) with narrow allowances for Google Fonts, the
Vercel Analytics script, and self. No `localStorage`/cookies/`eval`. A full audit found no
vulnerabilities as of the last pass (PROJECT_HISTORY.md §12) — re-run one after any
significant change, don't assume it stays clean.

- **`connect-src` is `'self'`, not `https://vitals.vercel-insights.com`.** The CSP originally
  allowed that origin on the (reasonable-looking but wrong) assumption that the Vercel
  Analytics script beacons pageviews there directly. Fetching the actual script
  (`https://cdn.vercel-insights.com/v1/script.js`) and reading its source shows it never
  references that domain at all — it posts to a same-origin relative path
  (`/_vercel/insights/view`, Vercel's edge intercepts that path for projects with Analytics
  enabled) instead. Since the old `connect-src` didn't include `'self'`, those same-origin
  beacon requests were being silently blocked by the page's own CSP the entire time —
  Analytics was never actually collecting data despite the script loading successfully with
  no visible error. If Vercel ever changes the script back to a cross-origin beacon target,
  re-verify by fetching the script directly rather than assuming the old domain is still
  right.

## SEO

- **`<meta name="robots">` is deliberately `index, follow`, not the `noindex, nofollow` it
  shipped with during early development.** This was a real, tested lockdown (see
  `test/security.test.js`'s "referrer stays locked down; robots is deliberately
  index/follow"), not an oversight — don't flip it back without checking first, since it's
  the single setting that determines whether any other SEO work here has any effect at all.
  `referrer` stays `no-referrer` regardless of the indexing decision — no reason for this app
  to leak the referring URL to any destination either way.
- **Meta description, Open Graph, and Twitter Card tags are all static, hand-written text**
  (not derived from `document.title`/per-line state) since the page's actual content is
  gated behind JS interaction (pick a line, click Start) that a crawler or a social-media
  link-preview bot won't perform — the tags describe the app itself, not whatever line
  happens to be selected.
- **`<link rel="canonical">`, `og:url`, `sitemap.xml`'s `<loc>`, and `robots.txt`'s
  `Sitemap:` line all point at `https://www.mindthestation.com/` — the `www` subdomain, not
  the bare apex domain — because that's what Vercel actually serves.** Verified directly
  against the live site (`curl -sD -`, not assumed): `https://mindthestation.com/` returns
  an HTTP 308 to `https://www.mindthestation.com/` for every path (confirmed on `/`,
  `/robots.txt`), and the `www` host is the one serving real 200 content. Pointing the
  canonical/sitemap/robots references at the apex — which was the first pass, before this
  was checked against reality — created a real canonicalization conflict: a page declaring
  itself canonical at a URL that just redirects elsewhere is a known cause of delayed or
  unpredictable Google indexing (confirmed as the likely cause after a "request indexing" in
  Search Console sat unprocessed). **If the apex/`www` redirect direction ever changes in the
  Vercel dashboard, all four of these need to flip together** — they must always agree with
  whichever host is actually the non-redirecting one, checked live, not assumed from the
  domain name alone.
  This matters beyond that specific bug too: the project's own `*.vercel.app` URL
  (`mindthestation.vercel.app`) serves the same `index.html`, and a single static file can't
  serve a different `<meta name="robots">` per hostname — so the canonical tag is also the
  signal that stops the `.vercel.app` host from reading as duplicate content.
  `test/security.test.js`'s CSP-origin-matching test has explicit skips for `rel="canonical"`
  and `property="og:url"` lines, alongside its existing CSP-meta-line and JSON-LD
  `"@context"` skips — the site's own domain named in metadata is never actually fetched by
  the browser, so it's not a real CSP gap. `og:image`/`twitter:image` are still **not**
  included — they need a real hosted 1200×630 image asset, which doesn't exist yet.
- **JSON-LD structured data** (`<script type="application/ld+json">`, `WebApplication`
  schema) needs no CSP allowance — it's inline and `script-src` already has
  `'unsafe-inline'`, and a JSON-LD payload never causes the browser to actually fetch
  `schema.org` (it's a data identifier, not a resource load), which is why
  `test/security.test.js`'s CSP-origin-matching test has an explicit `"@context"` line-skip
  alongside its existing CSP-meta-line skip, rather than treating it as a real missing CSP
  allowance.
- **`test/test-utils.js`'s script-execution loop now filters by `type` before `eval`-ing.**
  It used to grab every `<script>` element without a `src` and eval its contents
  unconditionally — harmless while there was exactly one inline script in the whole file, but
  the JSON-LD `<script type="application/ld+json">` tag added above is *not* JavaScript, and
  jsdom doesn't skip non-JS script types the way a real browser silently does. Rather than
  special-case JSON-LD specifically, the harness now filters to actual executable types
  (empty/`text/javascript`/`application/javascript`) — the same behavior a real browser
  already has, so this is a correctness fix, not a workaround.
- **The page has no visible `<h1>`** — `.page-title` is styled `<span>`s by design (see the
  header hard rule above), not a real heading, and CLAUDE.md's own hard rule against
  changing that layout predates this SEO pass. Real heading structure for
  crawlers/screen-readers instead comes from a `.sr-only` `<h1>` placed right after `<body>`,
  using the standard clip-rect visually-hidden pattern (kept in the accessibility tree,
  unlike `.hidden`'s `display:none`, which would drop it entirely and could read as
  cloaking/hidden text to a search engine). Don't reuse `.hidden` for anything
  crawler/screen-reader-facing that should still visually disappear — they're for two
  different purposes now.
- **`robots.txt`** at the repo root currently just allows all crawling (`Allow: /`), with no
  `Sitemap:` line — there's no real canonical domain yet to point one at. Add the `Sitemap:`
  line (and the `sitemap.xml` it points to) once the domain is live; a single-page app like
  this doesn't strictly need a sitemap to be crawled, but it's a cheap, standard addition
  once there's a real URL to put in it.
- **`<html lang="en-GB">`, not plain `en`** — matches the British-spelling copy
  ("memorise", not "memorize") and `og:locale`'s existing `en_GB`, so the three don't drift
  out of sync with each other.
- **`<meta name="theme-color">` tracks the app's own manual light/dark toggle via JS
  (`themeColorMetaEl.setAttribute('content', ...)` inside `toggleTheme()`), not a static
  `prefers-color-scheme` media-query pair.** This app never actually reads OS color-scheme
  preference at all — it always boots light (`isLight = true`, `<body class="light">`) and
  only changes via the explicit toggle button — so a static `media="(prefers-color-scheme:
  dark)"` variant would tell a device with system dark mode enabled to paint its browser
  chrome dark while the page itself still rendered light-cream underneath, until the person
  happened to click the toggle. A single tag kept in sync with the one real source of truth
  (`isLight`) is correct instead; don't reintroduce the OS-media-query variant without first
  making the app actually honor `prefers-color-scheme` on boot.
- **`apple-touch-icon` (180×180) reuses the same "Arrow Upper Right" Flaticon asset as the
  favicon/title icons**, fetched fresh at a real 512×512 source resolution
  (`cdn-icons-png.flaticon.com`, same icon ID) and downsized with Pillow rather than
  upscaling the existing 64×64 favicon PNG, which would have rendered soft/blurry at Apple's
  minimum recommended size.
- **`favicon.ico` is a real static file at the repo root** (multi-resolution: 16/32/48/64px,
  generated from the same 512×512 source via Pillow), separate from the data-URI
  `<link rel="icon">` in `index.html`'s `<head>`. Found via a live-site check: browsers use
  the `<link>` tag and never needed this, but Google's search-result favicon fetcher and
  some crawlers specifically probe `/favicon.ico` at the domain root regardless of what the
  page's own `<link>` tag says — that path was a real 404 before this was added, which risks
  no favicon (or a stale default) showing next to this site in Google search results even
  though the in-browser tab icon was always correct. No CSP change needed since nothing in
  `index.html` references it — it's picked up purely by external tools probing the
  conventional path directly.
- **JSON-LD's `creator`/`publisher` are both Studio Espero** (an `Organization`, matching the
  footer's copyright line) — free structured-data enrichment that needs no hosted asset or
  domain, unlike `og:image`/canonical/sitemap above.

## Performance (page weight)

`index.html` was 402KB, almost entirely three embedded custom fonts (P22 Underground,
LT Railway, British Rail — 125KB combined binary, ~167KB as base64 text) shipped as their
full, unsubsetted commercial releases: hundreds of glyphs covering Latin Extended, Cyrillic-
adjacent symbols, math operators, and OpenType features this English-only, fixed-vocabulary
app never uses. Subsetted all three down to exactly the characters actually rendered
anywhere in the app — verified by extracting every JS string literal and HTML text node in
the file (not guessed) — and converted them from raw TTF/OTF to WOFF2 (compressed, and the
standard modern web font format; supported by every browser this app already targets, since
it already relies on CSS Grid/custom properties that are just as recent). Combined, this took
the file from 402KB to 267KB (~135KB / 34% smaller), with the fonts themselves shrinking from
125KB to ~24KB combined (P22 Underground 37KB→8KB, LT Railway 52KB→7KB, British Rail
37KB→9KB).

- **The kept Unicode set is `U+0020-007E` (full ASCII printable) plus `©`/`·`/`–`/`—`/`…`**
  (U+00A9, U+00B7, U+2013, U+2014, U+2026) — not a hand-picked minimal set per font. Full
  ASCII is deliberately generous headroom (station names, branch labels, and the LED "Calling
  at" ticker all need the complete alphabet/digits/punctuation anyway) rather than subsetting
  down to each font's exact narrow use — British Rail, for instance, only ever renders "Mind
  the"/"Station", but keeping it at full-ASCII-plus-extras costs almost nothing at these
  sizes and removes any fragility if that wordmark text ever changed. The five extras were
  found by extracting every string literal in the app's own `<script>` and every HTML text
  node, then checking which non-ASCII characters actually survived that extraction and were
  genuinely rendered (not, e.g., merely `–` in the *literal* Ealing–Upminster branch label,
  or `…` in `<input placeholder>` text). `✓`/`✕` (used in feedback messages and SVG tick
  marks) and `°` (only ever appears inside a code *comment*, never rendered) were deliberately
  left out — checked against each font's own cmap and confirmed absent from all three even
  before subsetting, so they were already falling back to Cabin/system-sans-serif regardless;
  subsetting couldn't remove a glyph that was never there.
- **Regenerating a subset if the app's text ever needs a new character**: extract the
  relevant `@font-face` block's base64 payload, decode it, run `pyftsubset <font> --unicodes=
  <set> --flavor=woff2 --output-file=<name>.subset.woff2` (fontTools + the `brotli` package,
  both available in this environment), re-encode to base64, and replace the `src: url(...)
  format(...)` in place — same "placeholder + Python script" embedding discipline as every
  other base64 asset in this file (favicon, title icons), never paste the payload directly
  into an editor/context.
- **`format('truetype')`/`format('opentype')` became `format('woff2')`** (and the `data:`
  MIME type from `font/ttf`/`font/otf` to `font/woff2`) — no CSP change needed, since
  `font-src`'s existing `data:` allowance covers any font MIME subtype, not just the two that
  happened to be in use before.
- Icon duplication (the same 64×64 favicon PNG embedded 5 separate times — once as
  `<link rel="icon">`, four times across the two `.pt-icon` `<img>` pairs on Setup/Play) was
  *not* touched here — it's ~7KB total, small next to the font savings above, and
  de-duplicating it would mean either a dynamic JS-inserted `src` (against this app's
  static-markup icon conventions) or a `<template>`-based reuse pattern not currently used
  anywhere else in the file. Worth revisiting only if page weight becomes a priority again
  beyond this pass.
