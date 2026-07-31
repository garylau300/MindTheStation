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
- **Direction is an LED "next train" style destination board (`#directionBoard`/
  `.dest-board`), not two forward/reverse pill buttons — and Branch is a squared 2-column
  grid (`.branch-grid`/`.branch-chip`), not a wrapping pill row.** Setup order is Branch,
  then Direction (this flipped once mid-development and was reverted back by explicit
  instruction — don't re-swap it without checking first). Tapping the whole board reverses
  the practice direction; a short instruction is appended to the section label itself
  (`.direction-hint`, e.g. "Direction (tap the board to change direction)") since the
  board's own clickability isn't otherwise obvious the way two separate buttons were. The
  board is two lines. Line one is `"1  <destination> [via X]"` left-justified and `"Arriving"`
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
  `.led-scroll-viewport` inside `.led-left`, exactly like `"Arriving"` is a fixed sibling of
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
  by sampling `getComputedStyle(...).transform` over time in a real browser) and loops, by
  explicit instruction on both the snap style and the loop shape. The destination line and
  the "Calling at" line tick **independently** (also by explicit instruction) — each is timed
  from its own measured overflow distance and its own speed (`ledTickerCalling` runs faster
  than `ledTickerDest`, since the calling-at list is typically much longer and would
  otherwise feel sluggish), so the two naturally drift in and out of phase with each other
  rather than staying in lockstep, same as a real dual-line indicator would. A line that
  already fits its viewport is left alone entirely — no animation, no transform, just static
  left-aligned text — checked via `scrollWidth` vs the viewport's own `clientWidth`, not any
  fixed text-length threshold, so it stays correct at every branch/direction/viewport-width
  combination rather than just the ones tested by hand. Each keyframes rule is generated
  per-refresh into a dynamically created `<style id="tickerKeyframes">` (not the committed
  stylesheet — animation distances/durations are runtime-measured pixel values, not
  constants) and re-run on every `updateDirectionBoard()` call (line/branch/direction
  change) and on a `ResizeObserver` watching `#directionBoard` itself (guarded with a
  `typeof ResizeObserver !== 'undefined'` check — jsdom, the unit-test harness, has no such
  global; the unit suites don't do real CSS layout anyway, so ticker overflow always
  measures as zero there regardless, and only `e2e/layout.spec.js`'s real Chromium exercises
  actual scrolling).
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
