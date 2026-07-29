# Underground Explorer

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

`npm test` runs the full regression suite (geometry, gameplay, interchange data — see
`CLAUDE.md` for what each one checks) via Node's built-in test runner against the real
`index.html`, driven through `jsdom`. It also runs automatically on every push and pull
request via GitHub Actions (`.github/workflows/test.yml`).

Run `npm test` before committing any change to `index.html`.

## Deployment

The GitHub repo is linked to Vercel for auto-deploy on push to `main` — no separate build
or deploy step to run manually.

## License

MIT — see [`LICENSE`](./LICENSE). Note the carve-out: the embedded P22 Underground font is
used under a separate license and isn't covered by the MIT grant.
