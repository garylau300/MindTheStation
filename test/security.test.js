'use strict';
// Regression coverage for the manual pass described in PROJECT_HISTORY.md §12
// ("re-run after significant changes rather than assuming it stays clean").
// These are static checks over the raw index.html source — no browser needed
// — so they run in milliseconds and can't be skipped by accident the way a
// manual audit can.

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const VERCEL_JSON_PATH = path.join(__dirname, '..', 'vercel.json');
const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');

function extractCsp(){
  const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  assert.ok(match, 'expected a CSP meta tag');
  return match[1];
}

test('CSP is present with the deny-by-default directives intact', () => {
  const csp = extractCsp();
  assert.match(csp, /default-src\s+'none'/, "default-src must stay deny-by-default ('none')");
  for(const directive of ["object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"]){
    assert.ok(csp.includes(directive), 'CSP must include: ' + directive);
  }
});

test('CSP origin allowances exactly match actual resource usage (no gaps, nothing over-permissive)', () => {
  const csp = extractCsp();

  // Origins referenced directly in our own markup/script — every one of
  // these MUST be covered by the CSP or the resource would be blocked.
  const directOriginPattern = /https:\/\/([a-z0-9.-]+)/gi;
  const directOrigins = new Set();
  for(const line of html.split('\n')){
    if(line.includes('Content-Security-Policy')) continue; // the policy itself lists origins; not a "usage"
    let m;
    while((m = directOriginPattern.exec(line))) directOrigins.add(m[1]);
  }

  // Origins that are only ever contacted *indirectly* — by a third-party
  // script we do load directly — and so can never appear as a literal
  // `https://...` in our own source, but are still real, necessary CSP
  // allowances. If this list changes, it should be a deliberate edit, not
  // silent drift.
  const INDIRECT_KNOWN_ORIGINS = new Set([
    'fonts.gstatic.com',      // the Google Fonts CSS we @import resolves its font files here
    'vitals.vercel-insights.com', // the Vercel Analytics script (cdn.vercel-insights.com) beacons here
    'va.vercel-scripts.com'   // Vercel Web Analytics (@vercel/analytics package) script source
  ]);

  const allExpectedOrigins = new Set([...directOrigins, ...INDIRECT_KNOWN_ORIGINS]);

  const cspOriginPattern = /https:\/\/([a-z0-9.-]+)/gi;
  const cspOrigins = new Set();
  let m;
  while((m = cspOriginPattern.exec(csp))) cspOrigins.add(m[1]);

  const missingFromCsp = [...directOrigins].filter(o => !cspOrigins.has(o));
  const unexpectedInCsp = [...cspOrigins].filter(o => !allExpectedOrigins.has(o));

  assert.equal(missingFromCsp.length, 0, 'Origins used in the page but not allowed by CSP: ' + missingFromCsp.join(', '));
  assert.equal(unexpectedInCsp.length, 0, 'CSP allows origin(s) with no known justification (over-permissive, or update INDIRECT_KNOWN_ORIGINS if newly intentional): ' + unexpectedInCsp.join(', '));
});

test('vercel.json ships the same CSP as an HTTP header, byte-for-byte', () => {
  // frame-ancestors (and CSP delivery generally) is only actually enforced
  // via an HTTP response header — a <meta> tag is ignored for that one
  // directive. The <meta> tag stays in index.html as a fallback for when
  // the file is opened directly (e.g. file://, or our own e2e tests), but
  // it's the header that does the real enforcing on the deployed site.
  // Two copies of the same policy is only safe if they can never drift
  // apart silently, hence this check.
  const metaCsp = extractCsp();
  const vercelConfig = JSON.parse(fs.readFileSync(VERCEL_JSON_PATH, 'utf8'));
  const rule = vercelConfig.headers.find(h => h.source === '/(.*)');
  assert.ok(rule, 'expected a catch-all header rule in vercel.json');
  const header = rule.headers.find(h => h.key === 'Content-Security-Policy');
  assert.ok(header, 'expected a Content-Security-Policy header in vercel.json');
  assert.equal(header.value, metaCsp, 'vercel.json CSP header must exactly match the <meta> tag CSP in index.html');
});

test('referrer and robots meta tags stay locked down', () => {
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

test('no eval/Function-constructor/document.write/javascript: URIs', () => {
  assert.doesNotMatch(html, /\beval\s*\(/, 'eval() must never be used');
  assert.doesNotMatch(html, /new\s+Function\s*\(/, 'the Function constructor must never be used');
  assert.doesNotMatch(html, /document\.write\s*\(/, 'document.write() must never be used');
  assert.doesNotMatch(html, /javascript:/i, 'javascript: URIs must never be used');
});

test('no dynamically-created script/iframe/object elements', () => {
  assert.doesNotMatch(html, /createElement\(\s*['"]script['"]/i);
  assert.doesNotMatch(html, /createElement\(\s*['"]iframe['"]/i);
  assert.doesNotMatch(html, /createElement\(\s*['"]object['"]/i);
});

test('no client-side storage (matches "no data collected" claim in the Terms modal)', () => {
  assert.doesNotMatch(html, /\blocalStorage\b/);
  assert.doesNotMatch(html, /\bsessionStorage\b/);
  assert.doesNotMatch(html, /document\.cookie/);
});

test('answer input keeps its maxlength guard', () => {
  const match = html.match(/<input[^>]*id="answerInput"[^>]*>/);
  assert.ok(match, 'expected to find the #answerInput element');
  assert.match(match[0], /maxlength="60"/);
});

test('every non-clearing innerHTML assignment stays free of raw user input', () => {
  // Every `.innerHTML = <expr>;` in the file, one match per assignment.
  const assignments = [...html.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map(m => m[1].trim());
  assert.ok(assignments.length > 0, 'expected to find at least one innerHTML assignment to check');

  // The one place user-typed text is stored (misses[]) is rendered via
  // textContent elsewhere, which auto-escapes — so an innerHTML assignment
  // referencing any of these identifiers directly would be a real regression.
  const UNSAFE_IDENTIFIERS = ['answerInput.value', 'e.target', 'misses', '.you', '.correct', 'val'];

  const unsafe = assignments.filter(expr => expr !== "''" && UNSAFE_IDENTIFIERS.some(id => expr.includes(id)));
  assert.equal(unsafe.length, 0, 'innerHTML assignment(s) that appear to reference user input directly:\n' + unsafe.join('\n'));
});
