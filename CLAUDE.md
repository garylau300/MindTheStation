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

- Piccadilly and Northern are not yet built. **Northern needs a real architecture decision
  first**: its Bank/Charing Cross branches diverge at Camden Town and *rejoin* at
  Kennington — a genuine graph cycle the current parent→child `branch-tree` model can't
  represent. Plan this explicitly before implementing.
- Elizabeth line, DLR, and London Overground are discussed future extensions (see
  PROJECT_HISTORY.md §7) — Elizabeth needs its own (non-red-circle/blue-bar) roundel
  treatment when built; Overground is scoped as its own separate project phase.

## Security

CSP is deny-by-default (`default-src 'none'`) with narrow allowances for Google Fonts, the
Vercel Analytics script, and self. No `localStorage`/cookies/`eval`. A full audit found no
vulnerabilities as of the last pass (PROJECT_HISTORY.md §12) — re-run one after any
significant change, don't assume it stays clean.
