'use strict';
// Regression coverage for §13's "gameplay regression" practice: a JSDOM
// script that clicks through Setup, starts a real run, and answers every
// question correctly, asserting the run reaches the summary screen having
// visited exactly the expected number of stops — for every line, every
// branch, both directions, and all three modes. This used to be rewritten
// from scratch after each change; now it's committed and reusable.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, closePage, waitFor, sleep } = require('./test-utils');

function selectLine(page, lineId){
  const btn = page.document.querySelector('.line-chip[data-line-id="' + lineId + '"]');
  assert.ok(btn, 'expected a setup line chip for ' + lineId);
  btn.click();
}

function selectBranch(page, branchLabel){
  const btns = Array.from(page.document.querySelectorAll('#branchGroup .branch-chip'));
  const btn = btns.find(b => b.textContent === branchLabel);
  assert.ok(btn, 'expected a branch button labelled "' + branchLabel + '"');
  btn.click();
}

async function playThroughRun(page, { mode, reverse }){
  const { $, test: hooks, document: doc } = page;

  $('mode' + mode[0].toUpperCase() + mode.slice(1) + 'Btn').click();
  // the two separate forward/reverse buttons are gone -- a single
  // destination-board toggle now flips reverseDirection, so only click it
  // when the current state doesn't already match what this combo wants
  if(mode !== 'mc' && hooks.getReverseDirection() !== reverse){
    $('directionBoard').click();
  }
  assert.equal(hooks.getMode(), mode);

  const expectedTotal = hooks.getTotalSteps();
  $('startPlayingBtn').click();

  // #countdownOverlay starts with 'hidden' already present (it's only
  // unhidden once the Setup->Play transition lands and beginRun() runs —
  // see showPage()'s onShown callback in index.html), so waiting on it
  // alone can resolve before the page transition even begins. Wait for the
  // play page itself first — same synchronous tick as the overlay
  // unhiding — then wait for the real countdown-to-hidden transition.
  await waitFor(() => $('playPage').classList.contains('hidden') === false, { message: 'play page to show' });
  await waitFor(() => $('countdownOverlay').classList.contains('hidden'), { message: 'countdown to finish' });

  let steps = 0;
  const maxSteps = expectedTotal + 5; // small safety margin against an infinite loop on a real bug
  while($('summaryArea').classList.contains('hidden')){
    if(steps > maxSteps){
      throw new Error('run for mode=' + mode + ' never reached summary after ' + steps + ' steps (expected ' + expectedTotal + ')');
    }
    const idxBefore = hooks.getIdx();

    if(mode === 'mc'){
      const correctIdx = hooks.getMcOrder()[idxBefore];
      const correctName = hooks.getLine().stations[correctIdx];
      const optionBtns = Array.from(doc.querySelectorAll('#mcOptions .mc-option'));
      const correctBtn = optionBtns.find(b => b.textContent === correctName);
      assert.ok(correctBtn, 'expected an MC option matching "' + correctName + '"');
      correctBtn.click();
    } else {
      const expected = hooks.getSeq()[idxBefore];
      const input = $('answerInput');
      input.value = expected;
      $('submitBtn').click();
    }

    await waitFor(
      () => $('summaryArea').classList.contains('hidden') === false || hooks.getIdx() !== idxBefore,
      { message: 'idx to advance past ' + idxBefore }
    );
    steps++;
  }

  assert.equal(steps, expectedTotal, 'mode=' + mode + ': expected exactly ' + expectedTotal + ' answered steps before the summary screen');
  assert.equal(hooks.getMisses().length, 0, 'mode=' + mode + ': every answer submitted was the true next station, so there should be zero misses');
}

function combosFor(line){
  const combos = [];
  for(const mode of ['warmup', 'quiz']){
    combos.push({ mode, reverse: false });
    combos.push({ mode, reverse: true });
  }
  combos.push({ mode: 'mc', reverse: false });
  return combos;
}

test('full run regression: setup -> countdown -> every answer correct -> summary', async (t) => {
  const page = loadPage();
  const { test: hooks } = page;
  t.after(() => closePage(page));

  const LINES = hooks.getLINES();
  const plainLines = Object.keys(LINES).filter(id => id !== 'waterloocity');

  for(const lineId of plainLines){
    selectLine(page, lineId);
    const def = LINES[lineId];
    const branchLabels = def.branches ? Object.values(def.branches).map(b => b.label) : [null];

    for(const branchLabel of branchLabels){
      if(branchLabel) selectBranch(page, branchLabel);
      const branchTag = branchLabel ? (' / ' + branchLabel) : '';

      for(const combo of combosFor(LINES[lineId])){
        await t.test(lineId + branchTag + ' — ' + combo.mode + (combo.mode === 'mc' ? '' : (combo.reverse ? ' reverse' : ' forward')), async () => {
          await playThroughRun(page, combo);
        });
      }
    }
  }
});

test('hidden Waterloo & City egg line plays through', async (t) => {
  const page = loadPage();
  const { document: doc, test: hooks } = page;
  t.after(() => closePage(page));

  doc.getElementById('drainEgg').click();
  selectLine(page, 'waterloocity');
  assert.equal(hooks.getLine().def.id, 'waterloocity');

  await t.test('warmup forward', async () => { await playThroughRun(page, { mode: 'warmup', reverse: false }); });
  await t.test('mc', async () => { await playThroughRun(page, { mode: 'mc', reverse: false }); });
});

test('hidden Kensington (Olympia) District branch plays through', async (t) => {
  const page = loadPage();
  const { document: doc, test: hooks } = page;
  t.after(() => closePage(page));

  selectLine(page, 'district');
  doc.getElementById('olympiaEgg').click(); // unlocks the branch and selects it in one click
  assert.equal(hooks.getLine().branchId, 'kensingtonOlympia');

  await t.test('warmup forward', async () => { await playThroughRun(page, { mode: 'warmup', reverse: false }); });
});
