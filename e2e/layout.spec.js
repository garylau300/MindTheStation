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
    await page.click('.line-chip[data-line-id="' + lineId + '"]');
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

// Text was sized for the old 720px-max layout and looked small and lost
// once .wrap could grow — see the big comment block at the end of
// index.html's <style> for why the override has to come after every base
// rule it touches (not just be wrapped in a matching @media query) to
// actually take effect. This pins down that it really does, at both
// breakpoints, rather than silently no-op'ing the way it did once already.
test('text scales up at both width breakpoints, not just the container', async ({ page }) => {
  await page.click('.line-chip[data-line-id="district"]');
  const sizeAt = async (width) => {
    await page.setViewportSize({ width, height: 900 });
    return page.evaluate(() => ({
      chip: parseFloat(getComputedStyle(document.querySelector('.line-chip')).fontSize),
      logo: parseFloat(getComputedStyle(document.querySelector('.page-title')).fontSize)
    }));
  };
  const base = await sizeAt(800);   // below the 900px breakpoint
  const mid = await sizeAt(1024);   // between the two breakpoints
  const wide = await sizeAt(1440);  // above the 1300px breakpoint

  expect(base.chip).toBe(12);
  expect(mid.chip).toBeGreaterThan(base.chip);
  expect(wide.chip).toBeGreaterThan(mid.chip);

  expect(mid.logo).toBeGreaterThan(base.logo);
  expect(wide.logo).toBeGreaterThan(mid.logo);
});

// The route-map "bubble" popup was sized too large relative to the tiny
// diagram dots it points at — this pins it to a deliberately tight size so
// it can't silently creep back up.
test('station popup stays compact, not a large bubble', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('.line-chip[data-line-id="district"]');
  // station dots have a separate, larger invisible hit-area circle layered
  // on top (see drawRoutePreview()) — that's the one that actually
  // receives clicks now, not the tiny visible dot underneath it
  await page.click('#routePreviewSvg circle[fill="transparent"]');
  const box = await page.locator('#stationPopup').boundingBox();
  expect(box.width).toBeLessThan(320); // capped at 300px + a margin, even at the widest breakpoint
  expect(box.height).toBeLessThan(160); // generous margin above a many-badge station like King's Cross (~105px)
});

// Widest real viewport this matters at: .wrap hits its largest breakpoint
// (1180px) at 1300px+, which is exactly where a fixed/small-scale viewBox
// (like Circle's spur-loop, or a short branch-tree spine like
// Metropolitan's) gets stretched hardest relative to a big auto-computed
// viewBox (like District's, which has many more stations at the same
// per-station spacing).
test('station dot render size stays consistent (within 2x) across compact, wide, and loop lines', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const diameters = {};
  for (const lineId of ['victoria', 'district', 'circle', 'metropolitan']) {
    await page.click('.line-chip[data-line-id="' + lineId + '"]');
    diameters[lineId] = await page.evaluate(() => {
      const circle = document.querySelector('#routePreviewSvg circle');
      return circle.getBoundingClientRect().width;
    });
  }
  for (const d of Object.values(diameters)) {
    expect(d).toBeGreaterThan(4); // catches a severe squeeze, not just any variation
  }
  const ratio = Math.max(...Object.values(diameters)) / Math.min(...Object.values(diameters));
  expect(ratio).toBeLessThan(2); // Circle's spur-loop once measured ~2x bigger than other lines here
});

// Every line-ribbon chip (not just the active one — the ribbon shows all
// line colours at once) and the primary buttons (Start playing, Enter) fill
// solid with that line's own true colour. A fixed near-black text color was
// unreadable on several lines (Victoria, District, Bakerloo, Metropolitan,
// Piccadilly, Central) — real WCAG contrast ratio, computed independently
// here (not just re-running the app's own bestContrastInk() helper),
// against every line in both themes, since a line's own colour doesn't
// change between themes but this is exactly the kind of thing worth
// checking in both anyway.
function relativeLuminance(hex){
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const linearize = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}
function contrastRatio(hexA, hexB){
  const lA = relativeLuminance(hexA), lB = relativeLuminance(hexB);
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}
function rgbStringToHex(rgb){
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

for (const theme of ['light', 'dark']) {
  test('every line chip and primary button text meet WCAG AA contrast (' + theme + ' mode)', async ({ page }) => {
    if (theme === 'dark') {
      await page.click('#themeToggle');
      await page.waitForTimeout(300); // let the background-color transition settle
    }
    const lineIds = await page.evaluate(() => Array.from(document.querySelectorAll('.line-select .line-chip[data-line-id]')).map(el => el.dataset.lineId));
    const failures = [];
    for (const lineId of lineIds) {
      // every chip always shows its own true colour regardless of selection
      // (that's the point of a ribbon palette), but #startPlayingBtn's fill
      // tracks whichever line is currently selected, so it still needs a
      // click per line to check the button for every line in turn
      await page.click('.line-chip[data-line-id="' + lineId + '"]');
      const { chipBg, chipColor, btnBg, btnColor } = await page.evaluate((id) => {
        const chip = document.querySelector('.line-chip[data-line-id="' + id + '"]');
        const btn = document.getElementById('startPlayingBtn');
        const chipCs = getComputedStyle(chip), btnCs = getComputedStyle(btn);
        return { chipBg: chipCs.backgroundColor, chipColor: chipCs.color, btnBg: btnCs.backgroundColor, btnColor: btnCs.color };
      }, lineId);
      const chipRatio = contrastRatio(rgbStringToHex(chipBg), rgbStringToHex(chipColor));
      const btnRatio = contrastRatio(rgbStringToHex(btnBg), rgbStringToHex(btnColor));
      // 3:1 is WCAG AA's minimum for large/bold text, which this is (chip
      // labels ~12-15px bold-weight, button text ~15-17px)
      if (chipRatio < 3) failures.push(lineId + ' chip: ' + chipRatio.toFixed(2) + ':1');
      if (btnRatio < 3) failures.push(lineId + ' button: ' + btnRatio.toFixed(2) + ':1');
    }
    expect(failures).toEqual([]);
  });
}

// The train progress rail's SVG used width:100% with no cap, so it grew in
// lockstep with .wrap's own wider breakpoints (up to 1180px) — the train
// graphic ended up noticeably larger than it was designed to look.
test('train progress rail stays capped on wide screens, unaffected on narrow ones', async ({ page }) => {
  await page.click('#startPlayingBtn');
  // #countdownOverlay starts with the 'hidden' class already present (it's
  // only unhidden once the Setup->Play transition actually lands and
  // beginRun() runs — see showPage()'s onShown callback), so waiting on it
  // alone is true from the very start and would resolve before the page
  // transition even begins. Wait for the play page itself to be showing
  // first — same synchronous tick as the overlay unhiding, since both
  // happen inside showPage()'s onShown callback — then wait for the
  // overlay's real countdown-to-hidden transition.
  await page.waitForFunction(() => !document.getElementById('playPage').classList.contains('hidden'), { timeout: 8000 });
  // not waitForSelector('#countdownOverlay.hidden') — its default "visible"
  // state can never be satisfied by an element that's hidden by definition
  await page.waitForFunction(() => document.getElementById('countdownOverlay').classList.contains('hidden'), { timeout: 8000 });

  await page.setViewportSize({ width: 1440, height: 900 });
  const wide = await page.locator('#progressRailSvg').boundingBox();
  expect(wide.width).toBeLessThanOrEqual(640);

  await page.setViewportSize({ width: 390, height: 900 });
  const narrow = await page.locator('#progressRailSvg').boundingBox();
  expect(narrow.width).toBeGreaterThan(300); // still ~full-width on a real phone, cap shouldn't bind here
  expect(narrow.width).toBeLessThanOrEqual(640);
});
