# Underground Explorer

A station-memorization trainer for the London Underground, built for Studio Espero.
Zero-dependency, single self-contained `index.html` (plain HTML/CSS/JS, no build step),
deployed to Vercel via GitHub auto-redeploy. `PROJECT_HISTORY.md` in this repo is the full
narrative handoff (architecture, every bug that shipped and how it was fixed, design
iteration history) written at the end of the original chat-based build process — read it
for the "why", this file for quick working rules.

## What it does

Pick a line (and branch/direction if applicable), then practice recalling station order:
**Warm-up** (target shown, type it), **Recall quiz** (previous station shown, type the
next), **Multiple choice** (4 options). A 3-2-1 countdown precedes each run.

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
the route-map station popup stays compact rather than the oversized bubble it once was.
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
persisted and runnable instead of rewritten by hand each time — run `npm test` before
committing any change to `index.html`.

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
  `segments` for District/Metropolitan/Central, verify with `npm test` (the geometry suite
  now does the pairwise-distance check that used to be a throwaway Node script) — don't
  just eyeball it.
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
- **Northern** is not yet built and **needs a real architecture decision first**: its
  Bank/Charing Cross branches diverge at Camden Town and *rejoin* at Kennington — a
  genuine graph cycle the current parent→child `branch-tree` model can't represent.
  Plan this explicitly before implementing.
- Elizabeth line, DLR, and London Overground are discussed future extensions (see
  PROJECT_HISTORY.md §7) — Elizabeth needs its own (non-red-circle/blue-bar) roundel
  treatment when built; Overground is scoped as its own separate project phase.

## Security

CSP is deny-by-default (`default-src 'none'`) with narrow allowances for Google Fonts, the
Vercel Analytics script, and self. No `localStorage`/cookies/`eval`. A full audit found no
vulnerabilities as of the last pass (PROJECT_HISTORY.md §12) — re-run one after any
significant change, don't assume it stays clean.
