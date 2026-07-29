'use strict';
// Shared harness for driving the real index.html inside jsdom.
//
// The app is a single self-contained HTML file with all state trapped inside
// one top-level IIFE (`(function(){ ... })();`) — nothing is exposed on
// `window` by design. To let these tests observe real internal state (which
// station is currently the answer, which line is active, the computed
// diagram geometry, ...) without changing the shipped file, we splice a
// `window.__TEST__` hook of live getters into an in-memory copy of the
// script right before its closing `})();`, then eval that copy into a jsdom
// window. The committed index.html itself is never touched.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');

const HOOK_MARKER = "  setMode('warmup');\n})();\n</script>";
const HOOK_INJECTION = "  setMode('warmup');\n" +
  "  window.__TEST__ = {\n" +
  "    getLINES: () => LINES,\n" +
  "    getInterchanges: () => STATION_INTERCHANGES,\n" +
  "    getLine: () => LINE,\n" +
  "    getMode: () => mode,\n" +
  "    getIdx: () => idx,\n" +
  "    getMcOrder: () => mcOrder,\n" +
  "    getMisses: () => misses,\n" +
  "    getReverseDirection: () => reverseDirection,\n" +
  "    getSeq: () => seq(),\n" +
  "    getTotalSteps: () => totalSteps(),\n" +
  "    getGeo: () => geo\n" +
  "  };\n" +
  "})();\n</script>";

function readInstrumentedHtml(){
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const count = html.split(HOOK_MARKER).length - 1;
  if(count !== 1){
    throw new Error(
      'test-utils: expected exactly one occurrence of the end-of-script marker in index.html, found ' + count +
      '. The app file has likely changed shape — update HOOK_MARKER in test/test-utils.js to match.'
    );
  }
  return html.replace(HOOK_MARKER, HOOK_INJECTION);
}

// Loads the real app into a jsdom window with every setTimeout/setInterval
// delay collapsed to ~1ms, so a full run (including the 3-2-1 countdown and
// every per-answer transition delay) completes in real time almost instantly
// instead of taking the many real seconds a human would.
function loadPage(){
  const html = readInstrumentedHtml();
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://example.invalid/'
  });
  const { window } = dom;

  const realSetTimeout = window.setTimeout.bind(window);
  const realSetInterval = window.setInterval.bind(window);
  window.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 1, ...args);
  window.setInterval = (fn, _ms, ...args) => realSetInterval(fn, 1, ...args);

  const scripts = Array.from(window.document.querySelectorAll('script')).filter(s => !s.src);
  scripts.forEach(s => window.eval(s.textContent));

  if(!window.__TEST__){
    throw new Error('test-utils: window.__TEST__ hook did not get installed — instrumentation failed silently.');
  }

  return { dom, window, document: window.document, $: id => window.document.getElementById(id), test: window.__TEST__ };
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Polls `predicate` until it returns truthy or `timeoutMs` elapses (real
// wall-clock time), yielding to the event loop between checks so pending
// jsdom timers (already sped up by loadPage) get a chance to fire.
async function waitFor(predicate, { timeoutMs = 8000, intervalMs = 4, message = 'condition' } = {}){
  const start = Date.now();
  while(true){
    if(predicate()) return;
    if(Date.now() - start > timeoutMs){
      throw new Error('waitFor timed out after ' + timeoutMs + 'ms waiting for: ' + message);
    }
    await sleep(intervalMs);
  }
}

// The app starts a page-lifetime `setInterval` (the live WPM/elapsed-time
// ticker) that a real browser tab tears down on navigation but which would
// otherwise keep Node's event loop alive forever. Callers must close the
// jsdom window once done with a page.
function closePage({ dom }){
  dom.window.close();
}

module.exports = { loadPage, closePage, sleep, waitFor };
