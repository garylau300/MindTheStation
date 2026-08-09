'use strict';
// Learning mode reduces to one growing/reversing "leg" of an otherwise
// ordinary line/branch journey — seq()/origIndex() get a mode === 'learning'
// branch (learningSeq()/learningOrigIndices()) rather than a whole new
// LINE-shaped runtime the way Network mode needed, since the underlying
// LINE never changes shape mid-run here. The picked station
// (learningStartIndex) is where the ladder BEGINS, not ends — the first
// rung already covers true-start-through-the-pick, and the ladder always
// keeps growing one station at a time all the way to the current
// direction's true end, never stopping early at the pick. This suite
// checks the two things that are genuinely new: the rung/phase state
// machine (advanceLearning(), including that no station is ever typed
// twice in an immediate row) and the start picker (selectLearningStart()),
// via the same two-tier pattern test/network.test.js already established —
// a small exhaustive tier for the pure logic, plus a couple of sampled full
// playthroughs for end-to-end confidence.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, closePage, waitFor } = require('./test-utils');

test('entering Learning mode defaults the start to the 2nd station (learningStartIndex === 1)', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('modeLearningBtn').click();
    assert.equal(hooks.getMode(), 'learning');
    assert.equal(hooks.getLearningStartIndex(), 1);
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

test('selectLearningStart(): the true first station is a no-op, a real pick moves the start, direction change resets it back to the default', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('modeLearningBtn').click();
    const walk = hooks.getLearningBaseSeq();

    hooks.selectLearningLevelByName(walk[0]);
    assert.equal(hooks.getLearningStartIndex(), 1, 'clicking the true first station must not move the start');

    hooks.selectLearningLevelByName(walk[3]);
    assert.equal(hooks.getLearningStartIndex(), 3, 'a real intermediate station should become the new start');

    // a name not on the current walk at all (typo/garbage) must also be a no-op
    hooks.selectLearningLevelByName('Not A Real Station');
    assert.equal(hooks.getLearningStartIndex(), 3);

    $('directionBoard').click(); // flips reverseDirection
    assert.equal(hooks.getLearningStartIndex(), 1, 'flipping direction invalidates the old position and resets to the default');
  } finally {
    closePage(page);
  }
});

test('switching branch (on a branching line) resets the start back to the default', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('lineDistrictBtn').click(); // a branching line
    $('modeLearningBtn').click();
    hooks.selectLearningLevelByName(hooks.getLearningBaseSeq()[3]);
    assert.equal(hooks.getLearningStartIndex(), 3);
    const branchButtons = Array.from($('branchGroup').querySelectorAll('.branch-chip:not(.olympia-egg)'));
    const otherBranch = branchButtons.find(b => !b.classList.contains('active'));
    assert.ok(otherBranch, 'expected at least 2 branch chips for District');
    otherBranch.click();
    assert.equal(hooks.getLearningStartIndex(), 1, 'a different branch invalidates the old position and resets to the default');
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

// For a walk of length N starting at position s: the first rung (size
// s+1) costs 2s+1 recalls (forward is s+1 questions with no skip, since
// nothing precedes it; backward is s questions, skipping the just-typed
// turn-around station). Every later rung of size k costs 2*(k-1) (both
// legs skip their own just-typed duplicate). Summed from the first rung
// through the final rung (size N): N*(N-1) - s*(s-1) + 1 — the same
// formula #learningLevelInfo shows the player before they start.
function expectedRecallCount(n, s){
  return n * (n - 1) - s * (s - 1) + 1;
}

test('a full Learning-mode run from the default start climbs all the way to the line\'s true end, matching the predicted recall count, with no immediate duplicate answers', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('lineVictoriaBtn').click(); // 16 stations — small enough to fully play out quickly
  $('modeLearningBtn').click();
  assert.equal(hooks.getLearningStartIndex(), 1);
  const walk = hooks.getLearningBaseSeq();
  const n = walk.length;

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  const { steps, history } = await playOutCurrentLearningRun(page);
  assert.equal(steps, expectedRecallCount(n, 1), 'total answered steps should match the N*(N-1)-s*(s-1)+1 formula');
  assert.equal(hooks.getMisses().length, 0, 'every answer submitted was correct, so there should be zero misses');

  // the run must actually reach the line's true end at some point (the
  // forward leg of the final rung), not stop at the pick — every run ends
  // on a *backward* leg though, so the very last answer given is always
  // the true first station, not the true end itself
  assert.ok(history.includes(walk[walk.length - 1]), 'the run should recite all the way to the true terminus at some point, not stop at the picked start');
  assert.equal(history[history.length - 1], walk[0], 'every run ends on a backward leg, back down to the true first station');

  for(let i = 1; i < history.length; i++){
    assert.notEqual(history[i], history[i - 1], 'station "' + history[i] + '" was typed twice in an immediate row at step ' + i);
  }
});

test('starting near the end of the line means only a short climb remains, matching the formula', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('lineVictoriaBtn').click();
  $('modeLearningBtn').click();
  const walk = hooks.getLearningBaseSeq();
  const n = walk.length;
  const s = n - 2; // start one short of the true end
  hooks.selectLearningLevelByName(walk[s]);
  assert.equal(hooks.getLearningStartIndex(), s);

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  const { steps, history } = await playOutCurrentLearningRun(page);
  assert.equal(steps, expectedRecallCount(n, s));
  for(let i = 1; i < history.length; i++){
    assert.notEqual(history[i], history[i - 1], 'station "' + history[i] + '" was typed twice in an immediate row at step ' + i);
  }
});

test('picking the true last station as the start means a single rung, immediately complete', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('lineVictoriaBtn').click();
  $('modeLearningBtn').click();
  const walk = hooks.getLearningBaseSeq();
  const n = walk.length;
  const s = n - 1; // the true last station itself
  hooks.selectLearningLevelByName(walk[s]);
  assert.equal(hooks.getLearningStartIndex(), s);

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  const { steps } = await playOutCurrentLearningRun(page);
  assert.equal(steps, expectedRecallCount(n, s));
  assert.equal(steps, 2 * s + 1, 'a single rung of size N costs 2*(N-1)+1 recalls');
});

test('a wrong answer breaks the streak but the ladder still completes correctly', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('lineVictoriaBtn').click();
  $('modeLearningBtn').click();
  const walk = hooks.getLearningBaseSeq();
  const n = walk.length;
  const s = n - 3;
  hooks.selectLearningLevelByName(walk[s]);

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  // answer the very first question wrong on purpose, then play the rest correctly
  const idxBefore = hooks.getIdx();
  $('answerInput').value = 'Definitely Not The Right Station';
  $('submitBtn').click();
  await waitFor(() => hooks.getIdx() !== idxBefore, { message: 'idx to advance past the wrong answer' });

  const { steps } = await playOutCurrentLearningRun(page);
  assert.equal(1 + steps, expectedRecallCount(n, s));
  assert.equal(hooks.getMisses().length, 1);
});
