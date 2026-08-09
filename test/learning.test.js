'use strict';
// Learning mode reduces to one growing/reversing "leg" of an otherwise
// ordinary line/branch journey — seq()/origIndex() get a mode === 'learning'
// branch (learningSeq()/learningOrigIndices()) rather than a whole new
// LINE-shaped runtime the way Network mode needed, since the underlying
// LINE never changes shape mid-run here. This suite checks the two things
// that are genuinely new: the rung/phase state machine (advance()'s own
// mode === 'learning' branch) and the level-picker (selectLearningLevel()),
// via the same two-tier pattern test/network.test.js already established —
// a small exhaustive tier for the pure logic, plus a couple of sampled full
// playthroughs for end-to-end confidence.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, closePage, waitFor } = require('./test-utils');

test('entering Learning mode defaults the level to the 2nd station (learningEndIndex === 1)', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('modeLearningBtn').click();
    assert.equal(hooks.getMode(), 'learning');
    assert.equal(hooks.getLearningEndIndex(), 1);
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

test('selectLearningLevel(): the true first station is a no-op, a real pick moves the level, direction change resets it back to the default', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('modeLearningBtn').click();
    const walk = hooks.getLearningBaseSeq();

    hooks.selectLearningLevelByName(walk[0]);
    assert.equal(hooks.getLearningEndIndex(), 1, 'clicking the true first station must not move the level');

    hooks.selectLearningLevelByName(walk[3]);
    assert.equal(hooks.getLearningEndIndex(), 3, 'a real intermediate station should become the new level');

    // a name not on the current walk at all (typo/garbage) must also be a no-op
    hooks.selectLearningLevelByName('Not A Real Station');
    assert.equal(hooks.getLearningEndIndex(), 3);

    $('directionBoard').click(); // flips reverseDirection
    assert.equal(hooks.getLearningEndIndex(), 1, 'flipping direction invalidates the old position and resets to the default');
  } finally {
    closePage(page);
  }
});

test('switching branch (on a branching line) resets the level back to the default', () => {
  const page = loadPage();
  const { $, test: hooks } = page;
  try {
    $('lineDistrictBtn').click(); // a branching line
    $('modeLearningBtn').click();
    hooks.selectLearningLevelByName(hooks.getLearningBaseSeq()[3]);
    assert.equal(hooks.getLearningEndIndex(), 3);
    const branchButtons = Array.from($('branchGroup').querySelectorAll('.branch-chip:not(.olympia-egg)'));
    const otherBranch = branchButtons.find(b => !b.classList.contains('active'));
    assert.ok(otherBranch, 'expected at least 2 branch chips for District');
    otherBranch.click();
    assert.equal(hooks.getLearningEndIndex(), 1, 'a different branch invalidates the old position and resets to the default');
  } finally {
    closePage(page);
  }
});

// Plays out a full Learning-mode ladder by always submitting the true
// current answer (read straight from the same seq() the app itself uses,
// via the generic getSeq() hook — no Learning-specific reimplementation of
// the sequence needed here), counting every answered step.
async function playOutCurrentLearningRun(page){
  const { $, test: hooks } = page;
  let steps = 0;
  const maxSteps = 2000;
  while($('summaryArea').classList.contains('hidden')){
    if(steps > maxSteps){
      throw new Error('learning run never reached summary after ' + steps + ' steps');
    }
    const idxBefore = hooks.getIdx();
    const rungBefore = hooks.getLearningRung();
    const phaseBefore = hooks.getLearningPhase();
    const list = hooks.getSeq();
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
  return steps;
}

// A rung of size k costs 2*(k-1) recalls (forward + backward); summed over
// every rung from size 2 up to k = learningEndIndex+1 is k*(k+1)-2 — the
// exact formula #learningLevelInfo shows the player before they start.
function expectedRecallCount(learningEndIndex){
  const k = learningEndIndex + 1;
  return k * (k + 1) - 2;
}

test('a full Learning-mode run reaches the picked level after exactly the predicted total recall count, with zero misses', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('modeLearningBtn').click();
  hooks.selectLearningLevelByName(hooks.getLearningBaseSeq()[4]); // a short, fast-to-test ladder
  assert.equal(hooks.getLearningEndIndex(), 4);

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  const steps = await playOutCurrentLearningRun(page);
  assert.equal(steps, expectedRecallCount(4), 'total answered steps should match the k*(k+1)-2 formula');
  assert.equal(hooks.getMisses().length, 0, 'every answer submitted was correct, so there should be zero misses');
});

test('the minimum ladder (default level, the 2nd station) is exactly one rung — 4 total recalls', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('modeLearningBtn').click();
  assert.equal(hooks.getLearningEndIndex(), 1);

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  const steps = await playOutCurrentLearningRun(page);
  assert.equal(steps, expectedRecallCount(1));
  assert.equal(steps, 4);
});

test('a wrong answer breaks the streak but the ladder still completes (backward phase re-asks correctly)', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  $('modeLearningBtn').click();
  hooks.selectLearningLevelByName(hooks.getLearningBaseSeq()[3]);

  $('startPlayingBtn').click();
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  // answer the very first question wrong on purpose, then play the rest correctly
  const idxBefore = hooks.getIdx();
  $('answerInput').value = 'Definitely Not The Right Station';
  $('submitBtn').click();
  await waitFor(() => hooks.getIdx() !== idxBefore, { message: 'idx to advance past the wrong answer' });

  const steps = 1 + await playOutCurrentLearningRun(page);
  assert.equal(steps, expectedRecallCount(3));
  assert.equal(hooks.getMisses().length, 1);
});
