# Mind the Station

A station-memorization trainer for the London Underground, built for Studio Espero. Pick a
line (and branch/direction if it has one), then practice recalling station order in
Warm-up, Recall quiz, or Multiple choice mode.

Zero dependencies, no build step: the entire app is the single self-contained
[`index.html`](./index.html) — plain HTML/CSS/JS with the licensed P22 Underground font
base64-embedded. Deployed to [Vercel](https://vercel.com), auto-redeploying on every push
to `main`.

## For anyone (human or Claude) picking this project up

Read **[`CLAUDE.md`](./CLAUDE.md)** first — it's the working rulebook: conventions that
have previously shipped real bugs when violated, how the test suite reaches into the app's
internals, and current roadmap context. **[`PROJECT_HISTORY.md`](./PROJECT_HISTORY.md)** is
the full narrative behind those rules, if you want the "why" in detail.

## Development

The app itself has no dependencies or build step — just open `index.html` in a browser.
Tests are Node-only tooling and don't ship with the app:

```
npm install
npm test
```

`npm test` runs the full regression suite (geometry, gameplay, interchange data, static
security checks — see `CLAUDE.md` for what each one checks) via Node's built-in test
runner against the real `index.html`, driven through `jsdom`. `npm run test:e2e` runs a
separate real-browser suite (Playwright) for CSS-layout-dependent checks jsdom can't do;
`npm run test:all` runs both. All of this runs automatically on every push and pull request
via GitHub Actions (`.github/workflows/test.yml`).

Each unit suite also runs standalone (`npm run test:geometry` / `test:gameplay` /
`test:interchanges` / `test:security`) for a focused re-check while iterating on something
scoped to just that concern — see `CLAUDE.md` for which tests a given change actually needs.
When in doubt, or for anything touching station/branch data or gameplay logic, run the full
suite before committing.

## Deployment

The GitHub repo is linked to Vercel for auto-deploy on push to `main` — no separate build
or deploy step to run manually. [`vercel.json`](./vercel.json) sends the app's CSP as a real
HTTP response header (needed for `frame-ancestors` to actually be enforced, which a `<meta>`
tag alone can't do); `test/security.test.js` keeps it in sync with the `<meta>` tag in
`index.html`.

## License

MIT — see [`LICENSE`](./LICENSE). Note the carve-out: the embedded P22 Underground font is
used under a separate license and isn't covered by the MIT grant.
