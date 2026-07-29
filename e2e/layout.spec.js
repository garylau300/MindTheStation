// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('node:path');

// PROJECT_HISTORY.md §13 flags a real category of bug jsdom can't catch:
// CSS-layout-dependent regressions only visible by measuring actual
// rendered pixels in a real browser (the historical example: District's
// diagram dots rendered at less than half the pixel size of a compact
// line's dots — 4.71px vs 10.08px — under an earlier fixed-height sizing
// approach). These tests run in a real Chromium instance for exactly that
// class of bug; test/*.test.js (jsdom) covers everything else.

const FILE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

// The two external, CSP-whitelisted resources (Google Fonts, Vercel
// Analytics) are both optional enhancements the app degrades gracefully
// without (P22 Underground falls back to Cabin; analytics just doesn't
// report). Restricted/proxied network environments (this sandbox included)
// can fail to reach them outright — that's a network artifact of wherever
// the test happens to run, not an app defect, so failures scoped to exactly
// these two hosts are expected and excluded below.
const OPTIONAL_EXTERNAL_HOSTS = ['fonts.googleapis.com', 'cdn.vercel-insights.com'];

test.beforeEach(async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  const failedUrls = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('requestfailed', (req) => failedUrls.push(req.url()));
  page.diagnostics = { pageErrors, consoleErrors, failedUrls }; // read back by tests below
  await page.goto(FILE_URL);
});

test('P22 Underground font actually loads (not silently falling back to Cabin)', async ({ page }) => {
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some(f => f.family.replace(/["']/g, '') === 'P22 Underground');
  });
  expect(loaded).toBe(true);
});

test('page loads with no unexpected console/JS errors', async ({ page }) => {
  await page.waitForTimeout(200); // let any deferred/async script errors surface
  const { pageErrors, consoleErrors, failedUrls } = page.diagnostics;

  expect(pageErrors).toEqual([]); // real JS exceptions must always be zero

  const hadExpectedResourceFailure = failedUrls.some(
    (url) => OPTIONAL_EXTERNAL_HOSTS.some((host) => url.includes(host))
  );
  const unexpectedConsoleErrors = consoleErrors.filter((text) => {
    // CSP delivered via <meta> inherently can't enforce frame-ancestors —
    // this is Chrome telling us so, not a bug in our policy.
    if (text.includes("frame-ancestors' is ignored when delivered via a <meta> element")) return false;
    // A generic "Failed to load resource" is only excused if it lines up
    // with one of the two known-optional external hosts above.
    if (text.includes('Failed to load resource') && hadExpectedResourceFailure) return false;
    return true;
  });
  expect(unexpectedConsoleErrors).toEqual([]);
});

// "no scroll boxes" (CLAUDE.md / PROJECT_HISTORY.md §6) is an explicit,
// deliberate product decision — this is the real-browser check that a
// pure-CSS sizing regression (or a future line with an unusually wide
// viewBox) hasn't reintroduced horizontal overflow.
for (const lineId of ['victoria', 'district', 'central', 'piccadilly']) {
  test('setup route-map preview never overflows horizontally: ' + lineId, async ({ page }) => {
    await page.click('.pill[data-line-id="' + lineId + '"]');
    const overflow = await page.evaluate(() => {
      const card = document.getElementById('routePreviewSvg').closest('.diagram-card');
      return card.scrollWidth - card.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1); // allow 1px of sub-pixel rounding
  });
}

// The .wrap container widens in steps on larger viewports (tablet
// landscape and up) so a laptop/desktop screen isn't left with the
// mobile-era 720px cap and huge dead margins on either side — capped
// short of full-bleed so it doesn't get uncomfortably wide on very large
// monitors either. This locks in both the step values and the "never
// causes overflow at any width" guarantee.
test('page widens responsively on larger viewports without ever overflowing', async ({ page }) => {
  const EXPECTED = [
    { width: 375, wrap: 343 },  // phone: viewport minus body's 16px side padding, well under the 720px base cap
    { width: 768, wrap: 720 },  // tablet: base cap
    { width: 1024, wrap: 960 }, // laptop: first breakpoint (900px+)
    { width: 1440, wrap: 1180 } // desktop: second breakpoint (1300px+)
  ];
  for (const { width, wrap } of EXPECTED) {
    await page.setViewportSize({ width, height: 900 });
    const info = await page.evaluate(() => ({
      wrapWidth: document.querySelector('.wrap').getBoundingClientRect().width,
      overflow: document.body.scrollWidth - document.body.clientWidth
    }));
    expect(info.overflow).toBeLessThanOrEqual(1); // allow 1px of sub-pixel rounding
    expect(Math.round(info.wrapWidth)).toBe(wrap);
  }
});

test('station dot render size stays consistent (within 2x) across a compact and a wide line', async ({ page }) => {
  const diameters = {};
  for (const lineId of ['victoria', 'district']) {
    await page.click('.pill[data-line-id="' + lineId + '"]');
    diameters[lineId] = await page.evaluate(() => {
      const circle = document.querySelector('#routePreviewSvg circle');
      return circle.getBoundingClientRect().width;
    });
  }
  for (const d of Object.values(diameters)) {
    expect(d).toBeGreaterThan(4); // catches a severe squeeze, not just any variation
  }
  const ratio = Math.max(...Object.values(diameters)) / Math.min(...Object.values(diameters));
  expect(ratio).toBeLessThan(2); // the historical bug measured ~2.14x (4.71px vs 10.08px)
});
