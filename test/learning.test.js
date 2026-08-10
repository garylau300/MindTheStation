'use strict';
// Learning mode reduces to one growing/reversing "leg" of an otherwise
// ordinary line/branch journey — seq()/origIndex() get a mode === 'learning'
// branch (learningSeq()/learningOrigIndices()) rather than a whole new
// LINE-shaped runtime the way Network mode needed, since the underlying
// LINE never changes shape mid-run here. Two independent picks —
// learningStartIndex ("Initial level", where the ladder BEGINS) and
// learningEndIndex ("Ending level", where it STOPS, defaulting to the
// walk's halfway point rather than the true terminus) — bound the ladder;
// the first rung already covers true-start-through-the-pick, and the
// ladder keeps growing one station at a time up to (and including) the
// Ending pick, never past it. This suite checks the rung/phase state
// machine (advanceLearning(), including that no station is ever typed
// twice in an immediate row), both pickers (selectLearningStart()/
// selectLearningEnd()), the halfway default, and the pick-toggle's
// routing of route-map clicks — via the same two-tier pattern
// test/network.test.js already established: a small exhaustive tier for
// the pure logic, plus a couple of sampled full playthroughs for
// end-to-end confidence.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, closePage, waitFor } = require('./test-utils');

test('entering Learning mode defaults Initial to the 2nd station and Ending to the walk\'s halfway point', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('modeLearningBtn').click();
    assert.equal(hooks.getMode(), 'learning');
    assert.equal(hooks.getLearningStartIndex(), 1);
    const n = hooks.getLearningBaseSeq().length;
    assert.equal(hooks.getLearningEndIndex(), Math.floor((n - 1) / 2));
    assert.equal(hooks.getLearningPickTarget(), 'start', 'the toggle should default to Initial on every fresh entry');
  } finally {
    closePage(page);
  }
});

test('learningBaseSeq() tracks reverseDirection exactly like every other mode\'s seq()', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('modeLearningBtn').click();
    assert.deepEqual(Array.from(hooks.getLearningBaseSeq()), Array.from(hooks.getLine().journeyNames));
    $('directionBoard').click();
    assert.equal(hooks.getReverseDirection(), true);
    assert.deepEqual(Array.from(hooks.getLearningBaseSeq()), Array.from(hooks.getLine().reversedJourneyNames));
  } finally {
    closePage(page);
  }
});

test('selectLearningStart(): true first station and anything at/past Ending are no-ops, a valid pick moves it', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('lineVictoriaBtn').click();
    $('modeLearningBtn').click();
    const walk = hooks.getLearningBaseSeq();
    hooks.setLearningEndIndex(10);

    hooks.selectLearningLevelByName(walk[0]);
    assert.equal(hooks.getLearningStartIndex(), 1, 'clicking the true first station must not move Initial');

    hooks.selectLearningLevelByName(walk[10]);
    assert.equal(hooks.getLearningStartIndex(), 1, 'a position at Ending must be a no-op — Start must stay strictly before End');

    hooks.selectLearningLevelByName(walk[15]);
    assert.equal(hooks.getLearningStartIndex(), 1, 'a position past Ending must also be a no-op');

    hooks.selectLearningLevelByName(walk[5]);
    assert.equal(hooks.getLearningStartIndex(), 5, 'a valid intermediate position should become the new Initial');

    hooks.selectLearningLevelByName('Not A Real Station');
    assert.equal(hooks.getLearningStartIndex(), 5, 'an unrecognized name must be a no-op');
  } finally {
    closePage(page);
  }
});

test('selectLearningEnd(): anything at/before Initial is a no-op, but the true last station is a valid pick', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('lineVictoriaBtn').click();
    $('modeLearningBtn').click();
    const walk = hooks.getLearningBaseSeq();
    hooks.setLearningStartIndex(5);
    const defaultEnd = hooks.getLearningEndIndex();

    hooks.selectLearningEndByName(walk[5]);
    assert.equal(hooks.getLearningEndIndex(), defaultEnd, 'a position equal to Initial must be a no-op — End must stay strictly after Start');

    hooks.selectLearningEndByName(walk[2]);
    assert.equal(hooks.getLearningEndIndex(), defaultEnd, 'a position before Initial must also be a no-op');

    hooks.selectLearningEndByName(walk[walk.length - 1]);
    assert.equal(hooks.getLearningEndIndex(), walk.length - 1, 'the true last station is a fully valid Ending pick — just no longer the default');

    hooks.selectLearningEndByName('Not A Real Station');
    assert.equal(hooks.getLearningEndIndex(), walk.length - 1, 'an unrecognized name must be a no-op');
  } finally {
    closePage(page);
  }
});

test('the halfway default has a safety floor for very short lines/branches', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    // Waterloo & City (the hidden egg line) is the shortest real line —
    // exactly 2 stations. Halfway of a 2-station walk (floor(1/2)=0) would
    // collide with the minimum valid Start (1), so the floor kicks in.
    $('drainEgg').click();
    const wcBtn = page.document.querySelector('.line-chip[data-line-id="waterloocity"]');
    assert.ok(wcBtn, 'expected the Drain egg to reveal a waterloocity line chip');
    wcBtn.click();
    $('modeLearningBtn').click();
    assert.equal(hooks.getLearningBaseSeq().length, 2);
    assert.equal(hooks.getLearningStartIndex(), 1);
    assert.equal(hooks.getLearningEndIndex(), 1, 'with only 2 stations, End can only ever be the last one');
  } finally {
    closePage(page);
  }
});

test('switching branch/direction/line resets both Initial and Ending back to their defaults', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('lineDistrictBtn').click(); // a branching line
    $('modeLearningBtn').click();
    const walk1 = hooks.getLearningBaseSeq();
    const defaultEnd1 = Math.floor((walk1.length - 1) / 2);
    hooks.selectLearningLevelByName(walk1[3]);
    hooks.selectLearningEndByName(walk1[defaultEnd1 + 5]);
    assert.equal(hooks.getLearningStartIndex(), 3);
    assert.notEqual(hooks.getLearningEndIndex(), defaultEnd1);

    const branchButtons = Array.from($('branchGroup').querySelectorAll('.branch-chip:not(.olympia-egg)'));
    const otherBranch = branchButtons.find(b => !b.classList.contains('active'));
    assert.ok(otherBranch, 'expected at least 2 branch chips for District');
    otherBranch.click();
    let n = hooks.getLearningBaseSeq().length;
    assert.equal(hooks.getLearningStartIndex(), 1, 'a different branch invalidates the old Initial pick');
    assert.equal(hooks.getLearningEndIndex(), Math.floor((n - 1) / 2), 'a different branch invalidates the old Ending pick too');

    hooks.selectLearningLevelByName(hooks.getLearningBaseSeq()[3]);
    $('directionBoard').click();
    n = hooks.getLearningBaseSeq().length;
    assert.equal(hooks.getLearningStartIndex(), 1, 'flipping direction invalidates the old Initial pick');
    assert.equal(hooks.getLearningEndIndex(), Math.floor((n - 1) / 2), 'flipping direction invalidates the old Ending pick too');

    hooks.selectLearningLevelByName(hooks.getLearningBaseSeq()[3]);
    $('lineVictoriaBtn').click();
    n = hooks.getLearningBaseSeq().length;
    assert.equal(hooks.getLearningStartIndex(), 1, 'a different line invalidates the old Initial pick');
    assert.equal(hooks.getLearningEndIndex(), Math.floor((n - 1) / 2), 'a different line invalidates the old Ending pick too');
  } finally {
    closePage(page);
  }
});

test('switching lines never changes the active mode, in any mode', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    const modeButtons = {
      warmup: 'modeWarmupBtn',
      learning: 'modeLearningBtn',
      quiz: 'modeQuizBtn',
      mc: 'modeMcBtn',
    };
    for(const [modeName, btnId] of Object.entries(modeButtons)){
      $(btnId).click();
      assert.equal(hooks.getMode(), modeName);
      $('lineVictoriaBtn').click();
      assert.equal(hooks.getMode(), modeName, 'switching lines must preserve mode === "' + modeName + '"');
      $('lineDistrictBtn').click();
      assert.equal(hooks.getMode(), modeName, 'switching lines a second time must still preserve mode === "' + modeName + '"');
    }
  } finally {
    closePage(page);
  }
});

test('the pick toggle routes route-map clicks to whichever pick is currently selected', () => {
  const page = loadPage();
  const { $, document: doc, window, test: hooks } = page;
  try {
    $('modeLearningBtn').click(); // default line (Central, 43 stations), forward direction
    const svg = doc.getElementById('routePreviewSvg');

    // Dot draw order in drawRoutePreview() always matches LINE.stations
    // (fixed geographic order), which equals journeyNames only in the
    // forward direction — kept simple by not flipping direction here.
    function clickStationAt(posIndex){
      const hits = Array.from(svg.querySelectorAll('circle')).filter(c => c.getAttribute('fill') === 'transparent');
      hits[posIndex].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    }

    assert.equal(hooks.getLearningPickTarget(), 'start');
    const startBefore = hooks.getLearningStartIndex();
    const endBefore = hooks.getLearningEndIndex();
    clickStationAt(startBefore + 2);
    assert.equal(hooks.getLearningStartIndex(), startBefore + 2, 'a map click while "Initial" is selected should move Initial');
    assert.equal(hooks.getLearningEndIndex(), endBefore, 'Ending must be untouched by an Initial-mode click');

    $('learningPickEndBtn').click();
    assert.equal(hooks.getLearningPickTarget(), 'end');
    assert.ok($('learningPickEndBtn').classList.contains('active'));
    assert.ok(!$('learningPickStartBtn').classList.contains('active'));
    clickStationAt(endBefore - 1);
    assert.equal(hooks.getLearningEndIndex(), endBefore - 1, 'a map click while "Ending" is selected should move Ending, not Initial');
    assert.equal(hooks.getLearningStartIndex(), startBefore + 2, 'Initial must be untouched by an Ending-mode click');
  } finally {
    closePage(page);
  }
});

// Plays out a full Learning-mode ladder by always submitting the true
// current answer (read straight from the same seq() the app itself uses,
// via the generic getSeq() hook — no Learning-specific reimplementation of
// the sequence needed here). Returns both the step count and the true
// station-name history of every answer given, so callers can check both
// the total recall count and that no station is ever repeated immediately.
async function playOutCurrentLearningRun(page){
  const { $, test: hooks } = page;
  let steps = 0;
  const history = [];
  const maxSteps = 5000;
  while($('summaryArea').classList.contains('hidden')){
    if(steps > maxSteps){
      throw new Error('learning run never reached summary after ' + steps + ' steps');
    }
    const idxBefore = hooks.getIdx();
    const rungBefore = hooks.getLearningRung();
    const phaseBefore = hooks.getLearningPhase();
    const list = hooks.getSeq();
    history.push(list[idxBefore]);
    const input = $('answerInput');
    input.value = list[idxBefore];
    $('submitBtn').click();
    await waitFor(
      () => $('summaryArea').classList.contains('hidden') === false ||
        hooks.getIdx() !== idxBefore || hooks.getLearningRung() !== rungBefore || hooks.getLearningPhase() !== phaseBefore,
      { message: 'learning state to advance past idx=' + idxBefore + ' rung=' + rungBefore + ' phase=' + phaseBefore }
    );
    steps++;
  }
  return { steps, history };
}

// For a walk starting at position s and ending at position e: the first
// rung (size s+1) costs 2s+1 recalls (forward is s+1 questions with no
// skip, since nothing precedes it; backward is s questions, skipping the
// just-typed turn-around station). Every later rung of size k costs
// 2*(k-1) (both legs skip their own just-typed duplicate). Summed from the
// first rung through the final rung (size e+1): (e+1)*e - s*(s-1) + 1 —
// the same formula #learningLevelInfo shows the player before they start.
function expectedRecallCount(s, e){
  return (e + 1) * e - s * (s - 1) + 1;
}

test('a full run with the default (halfway) Ending stops there, not at the true terminus, matching the formula with no immediate duplicates', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('lineVictoriaBtn').click(); // 16 stations — small enough to fully play out quickly
  $('modeLearningBtn').click();
  const walk = hooks.getLearningBaseSeq();
  const s = hooks.getLearningStartIndex();
  const e = hooks.getLearningEndIndex();
  assert.ok(e < walk.length - 1, 'the default Ending should be the halfway point, short of the true terminus, for this to be a meaningful test');

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  const { steps, history } = await playOutCurrentLearningRun(page);
  assert.equal(steps, expectedRecallCount(s, e), 'total answered steps should match the (e+1)*e-s*(s-1)+1 formula');
  assert.equal(hooks.getMisses().length, 0, 'every answer submitted was correct, so there should be zero misses');

  assert.ok(history.includes(walk[e]), 'the run should recite up to the picked Ending station at some point');
  assert.ok(!history.includes(walk[walk.length - 1]), 'the run must stop at the picked Ending, never reaching the true terminus beyond it');
  assert.equal(history[history.length - 1], walk[0], 'every run ends on a backward leg, back down to the true first station');

  for(let i = 1; i < history.length; i++){
    assert.notEqual(history[i], history[i - 1], 'station "' + history[i] + '" was typed twice in an immediate row at step ' + i);
  }
});

test('setting Ending to the true last station recreates the old "climb to the end" behaviour', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('lineVictoriaBtn').click();
  $('modeLearningBtn').click();
  const walk = hooks.getLearningBaseSeq();
  const s = 1;
  const e = walk.length - 1;
  hooks.selectLearningEndByName(walk[e]);
  assert.equal(hooks.getLearningEndIndex(), e);

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  const { steps, history } = await playOutCurrentLearningRun(page);
  assert.equal(steps, expectedRecallCount(s, e));
  assert.ok(history.includes(walk[walk.length - 1]), 'with Ending set to the true terminus, the run should reach it');
  for(let i = 1; i < history.length; i++){
    assert.notEqual(history[i], history[i - 1], 'station "' + history[i] + '" was typed twice in an immediate row at step ' + i);
  }
});

test('a custom Initial/Ending pair (neither default) matches the formula', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('lineVictoriaBtn').click();
  $('modeLearningBtn').click();
  const walk = hooks.getLearningBaseSeq();
  const s = 4, e = 9;
  hooks.selectLearningLevelByName(walk[s]);
  hooks.selectLearningEndByName(walk[e]);
  assert.equal(hooks.getLearningStartIndex(), s);
  assert.equal(hooks.getLearningEndIndex(), e);

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  const { steps } = await playOutCurrentLearningRun(page);
  assert.equal(steps, expectedRecallCount(s, e));
  assert.equal(hooks.getLearningTotalRecalls(), expectedRecallCount(s, e), 'the live formula helper should agree with the played-out count');
});

test('a wrong answer breaks the streak but the ladder still completes correctly', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('lineVictoriaBtn').click();
  $('modeLearningBtn').click();
  const walk = hooks.getLearningBaseSeq();
  const s = 2, e = walk.length - 3;
  hooks.selectLearningLevelByName(walk[s]);
  hooks.selectLearningEndByName(walk[e]);

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  // answer the very first question wrong on purpose, then play the rest correctly
  const idxBefore = hooks.getIdx();
  $('answerInput').value = 'Definitely Not The Right Station';
  $('submitBtn').click();
  await waitFor(() => hooks.getIdx() !== idxBefore, { message: 'idx to advance past the wrong answer' });

  const { steps } = await playOutCurrentLearningRun(page);
  assert.equal(1 + steps, expectedRecallCount(s, e));
  assert.equal(hooks.getMisses().length, 1);
});
