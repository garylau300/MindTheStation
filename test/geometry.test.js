'use strict';
// Regression coverage for §13's "geometry verification" practice: before
// this suite existed, collisions between distinct stations (and unwanted
// diagonals in Central's rectilinear Hainault loop) were only caught by a
// throwaway standalone script written fresh for each change. This runs the
// same checks against the real computed geometry (via the window.__TEST__
// hook — see test-utils.js) for every built line, every time.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, closePage } = require('./test-utils');

function dist(a, b){
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Every distinct pair of named points that ends up closer together than
// this fraction of the line's own smallest configured spacing is treated as
// a collision — a real bug of this shape shipped once (Central's Ealing
// Broadway arm landing ~4 units from Greenford, whose own spacing was much
// larger than that).
const COLLISION_FRACTION = 0.55;

test('per-line diagram geometry has no station collisions or bad diagonals', async (t) => {
  const page = loadPage();
  const { $, test: hooks } = page;
  t.after(() => closePage(page));

  const lineIds = Object.keys(hooks.getLINES()).filter(id => id !== 'waterloocity');

  for(const lineId of lineIds){
    await t.test(lineId, () => {
      const btn = page.document.querySelector('.pill[data-line-id="' + lineId + '"]');
      assert.ok(btn, 'expected a setup-page pill for line ' + lineId);
      btn.click();

      const line = hooks.getLine();
      const geo = hooks.getGeo();
      assert.equal(line.def.id, lineId);
      assert.ok(geo, 'setupGeometry() should have populated geo for ' + lineId);

      let points; // [{name, x, y}]
      let minSpacing;

      if(geo.networkStations){
        points = geo.networkStations;
        const spacings = (line.def.segments || []).map(s => s.spacing).filter(n => typeof n === 'number');
        if(line.def.loopRect) spacings.push(line.def.loopRect.downSpacing);
        assert.ok(spacings.length > 0, lineId + ': expected at least one segment spacing to derive a collision threshold from');
        minSpacing = Math.min(...spacings);
      } else {
        points = [];
        for(let i = 0; i < line.N; i++){
          const p = geo.stationPos(i);
          points.push({ name: line.stations[i], x: p.x, y: p.y });
        }
        // linear/spur-loop lines don't expose a spacing constant directly;
        // derive one from the closest *consecutive* pair, which is exactly
        // the line's real station spacing by construction.
        let closestConsecutive = Infinity;
        for(let i = 1; i < points.length; i++){
          closestConsecutive = Math.min(closestConsecutive, dist(points[i-1], points[i]));
        }
        minSpacing = closestConsecutive;
      }

      const threshold = minSpacing * COLLISION_FRACTION;
      const collisions = [];
      for(let i = 0; i < points.length; i++){
        for(let j = i + 1; j < points.length; j++){
          if(points[i].name === points[j].name) continue; // same station, e.g. shared trunk node
          const d = dist(points[i], points[j]);
          if(d < threshold){
            collisions.push(points[i].name + ' <-> ' + points[j].name + ' (' + d.toFixed(2) + ' units, threshold ' + threshold.toFixed(2) + ')');
          }
        }
      }
      // note: collisions/diagonals below are checked by length rather than
      // assert.deepEqual([]) — the arrays are built from objects that live
      // in the jsdom realm, and deepStrictEqual's prototype-identity check
      // fails across realms even for two structurally-empty arrays.
      assert.equal(collisions.length, 0, lineId + ': station collisions detected:\n' + collisions.join('\n'));

      if(line.def.loopRect){
        const loopLen = line.def.loopRect.stations.length + 1; // +1: the final closing edge back to `to`
        const loopEdges = geo.networkEdges.slice(-loopLen);
        const diagonals = loopEdges.filter(([a, b]) => a.x !== b.x && a.y !== b.y);
        // A loop with a "pass-through" station (a real junction reused from
        // elsewhere in the network, e.g. Northern's Euston) can't keep every
        // edge axis-aligned — the pass-through's own position is fixed by
        // where it sits on the spine, not free to align with its loop
        // neighbors. `allowedDiagonals` documents exactly how many edges
        // that affects; every other line defaults to requiring zero.
        const allowedDiagonals = line.def.loopRect.allowedDiagonals || 0;
        assert.equal(diagonals.length, allowedDiagonals, lineId + ': loopRect rectilinear check failed (expected ' + allowedDiagonals + ' diagonal edge(s)), found: ' + JSON.stringify(diagonals));
      }
    });
  }
});

test('waterloocity (hidden egg line) geometry has no collisions', async (t) => {
  const page = loadPage();
  const { document: doc, test: hooks } = page;
  t.after(() => closePage(page));

  doc.getElementById('drainEgg').click();
  const btn = doc.querySelector('.pill[data-line-id="waterloocity"]');
  assert.ok(btn, 'expected the Drain egg to reveal a waterloocity pill');
  btn.click();

  const line = hooks.getLine();
  const geo = hooks.getGeo();
  assert.equal(line.def.id, 'waterloocity');
  const points = [];
  for(let i = 0; i < line.N; i++){
    const p = geo.stationPos(i);
    points.push({ name: line.stations[i], x: p.x, y: p.y });
  }
  assert.equal(points.length, 2);
  assert.ok(dist(points[0], points[1]) > 1, 'Waterloo and Bank should not overlap');
});
