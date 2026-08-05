'use strict';
// Network mode reduces the whole "random journey across multiple lines"
// feature to one graph-shortest-path problem: buildNetworkGraph() merges
// same-named stations from every line's own data into shared graph nodes
// (that IS the interchange-hopping mechanic, for free), and
// networkShortestPath() runs a deterministic BFS between two node ids.
//
// The input space here (any 2 of ~400+ stations) is far too large to
// exhaustively cover — this suite instead exhaustively checks the graph's
// own correctness (the part that's actually finite and fully checkable:
// every KNOWN_NAME_COLLISIONS exception, a curated set of hand-verifiable
// pairs), then samples real end-to-end runs through the UI a handful of
// times with real randomness, on the theory that a bug in the stitching
// logic would show up in essentially any random run, not just a specific one.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, closePage, waitFor } = require('./test-utils');

test('buildNetworkGraph() never merges a KNOWN_NAME_COLLISIONS station across its excepted lines', () => {
  const page = loadPage();
  const { test: hooks } = page;
  try {
    const graph = hooks.getNetworkGraph();
    const collisions = hooks.getKnownNameCollisions();
    for(const [name, lineIds] of Object.entries(collisions)){
      for(const lineId of lineIds){
        // The excepted line's own station is namespaced off the plain name
        // ("Edgware Road::bakerloo", not "Edgware Road") — see
        // buildNetworkGraph()'s own networkNodeId() convention in index.html.
        const namespacedId = name + '::' + lineId;
        assert.ok(graph.has(namespacedId), name + '/' + lineId + ': expected a namespaced graph node ' + namespacedId);
        const plainNode = graph.get(name);
        const namespacedNode = graph.get(namespacedId);
        assert.notEqual(plainNode, namespacedNode, name + '/' + lineId + ': namespaced node must not be the same object as the plain-name node');
        // The two must never be direct graph neighbors of each other either
        // — that's exactly the "fake interchange" a BFS route could
        // otherwise silently walk through.
        if(plainNode){
          assert.ok(!plainNode.edges.has(namespacedId), name + '/' + lineId + ': plain-name node must not have a direct edge to the namespaced one');
        }
        assert.ok(!namespacedNode.edges.has(name), name + '/' + lineId + ': namespaced node must not have a direct edge to the plain-name one');
      }
    }
  } finally {
    closePage(page);
  }
});

test('networkShortestPath() is deterministic — repeated calls on the same pair agree', () => {
  const page = loadPage();
  const { test: hooks } = page;
  try {
    const pairs = [
      ['Bond Street', 'Green Park'],
      ['West Ruislip', 'Walthamstow Central'],
      ['Harrow & Wealdstone', 'Baker Street']
    ];
    for(const [a, b] of pairs){
      const first = hooks.networkShortestPath(a, b);
      const second = hooks.networkShortestPath(a, b);
      assert.deepEqual(first, second, a + ' -> ' + b + ': BFS must return the identical path on repeated calls');
    }
  } finally {
    closePage(page);
  }
});

test('networkShortestPath() matches hand-verified expected lengths for curated pairs', () => {
  const page = loadPage();
  const { test: hooks } = page;
  try {
    // Path arrays come back from the jsdom realm, so they're wrapped in
    // Array.from() (this outer realm's own Array constructor) before any
    // deepEqual against a plain local array literal — comparing across
    // realms directly fails on prototype identity alone even when the
    // contents genuinely match (see test-utils.js's own documented gotcha).

    // Same line, directly adjacent (Central's own spine order) — 1 stop.
    assert.equal(hooks.networkShortestPath('Bond Street', 'Oxford Circus').length, 2);
    // Also directly adjacent, but on the *Jubilee* line's own order
    // ("...Baker Street","Bond Street","Green Park","Westminster...") —
    // worth its own case since it's easy to assume Bond Street/Green Park
    // only connect via a Central+Victoria interchange at Oxford Circus, when
    // the real shortest route is actually one stop, directly, via Jubilee.
    assert.deepEqual(Array.from(hooks.networkShortestPath('Bond Street', 'Green Park')), ['Bond Street', 'Green Park']);
    // A real single-interchange hop with no shorter alternative: Preston
    // Road only appears on Metropolitan, Kingsbury only on Jubilee, and
    // their sole shared station is Wembley Park (Metropolitan's own
    // "...Wembley Park","Preston Road..." and Jubilee's own
    // "...Kingsbury","Wembley Park..." both place it directly adjacent).
    assert.deepEqual(Array.from(hooks.networkShortestPath('Preston Road', 'Kingsbury')), ['Preston Road', 'Wembley Park', 'Kingsbury']);
    // Same station picked as both ends — a 1-station "path", not a crash.
    assert.deepEqual(Array.from(hooks.networkShortestPath('Baker Street', 'Baker Street')), ['Baker Street']);
  } finally {
    closePage(page);
  }
});

test('buildNetworkJourneyForPair() stitches a valid LINE-shaped runtime with no duplicate consecutive stations', () => {
  const page = loadPage();
  const { test: hooks } = page;
  try {
    const pairs = [
      ['Bond Street', 'Oxford Circus'],
      ['Bond Street', 'Green Park'],
      ['West Ruislip', 'Walthamstow Central'],
      ['Harrow & Wealdstone', 'Baker Street'],
      // a long Circle/District corridor overlap — real track shared by both
      ['Gloucester Road', 'Temple']
    ];
    for(const [a, b] of pairs){
      const runtime = hooks.buildNetworkJourneyForPair(a, b);
      assert.ok(runtime, a + ' -> ' + b + ': expected a runtime, the network is fully connected');
      assert.equal(runtime.def.layout, 'network');
      assert.equal(runtime.stations[0], a);
      assert.equal(runtime.stations[runtime.stations.length - 1], b);
      assert.equal(runtime.N, runtime.stations.length);
      assert.equal(runtime.JOURNEY_LEN, runtime.N);
      assert.equal(runtime.edgeLines.length, runtime.N - 1);
      for(let i = 0; i < runtime.stations.length - 1; i++){
        assert.notEqual(runtime.stations[i], runtime.stations[i + 1], a + ' -> ' + b + ': no two consecutive stops should be the same station');
      }
      // reversal is just the same stations walked backwards
      assert.deepEqual(runtime.reversedJourneyNames, runtime.stations.slice().reverse());
    }
  } finally {
    closePage(page);
  }
});

// Answers out whatever network run is currently mid-countdown-finished on
// the play page — shared by both the very first run (reached via Setup ->
// Start playing) and every subsequent "Play again" (which re-generates a
// fresh random journey via beginRun(), see index.html, without leaving the
// play page at all).
async function playOutCurrentNetworkRun(page){
  const { $, test: hooks } = page;
  const expectedTotal = hooks.getTotalSteps();
  let steps = 0;
  const maxSteps = expectedTotal + 5;
  while($('summaryArea').classList.contains('hidden')){
    if(steps > maxSteps){
      throw new Error('network run never reached summary after ' + steps + ' steps (expected ' + expectedTotal + ')');
    }
    const idxBefore = hooks.getIdx();
    const expected = hooks.getSeq()[idxBefore];
    const input = $('answerInput');
    input.value = expected;
    $('submitBtn').click();
    await waitFor(
      () => $('summaryArea').classList.contains('hidden') === false || hooks.getIdx() !== idxBefore,
      { message: 'idx to advance past ' + idxBefore }
    );
    steps++;
  }
  assert.equal(steps, expectedTotal, 'expected exactly ' + expectedTotal + ' answered steps before the summary screen');
  assert.equal(hooks.getMisses().length, 0, 'every answer submitted was the true next station, so there should be zero misses');
  assert.ok(steps >= 1, 'a real network run should have at least one stop');
}

// Real Math.random() picks a fresh pair each "Play again" — sampled across
// several real runs rather than a single fixed pair, since the point of
// this tier is confidence the stitching logic holds up across whatever
// random start/end the app actually generates, not just one hand-picked case.
test('a full Network mode run — setup -> countdown -> every answer correct -> summary — across several random journeys', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('modeNetworkBtn').click();
  assert.equal(hooks.getMode(), 'network');
  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  const RUNS = 8;
  for(let i = 0; i < RUNS; i++){
    await t.test('random network journey #' + (i + 1), async () => {
      await playOutCurrentNetworkRun(page);
      if(i < RUNS - 1){
        $('restartBtn').click();
        await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish (restart)' });
      }
    });
  }
});
