'use strict';
// Regression coverage for §8's cross-reference discipline: every time a new
// line was added by hand, a one-off Python script compared its station list
// against every other line's to find shared stations missing a badge on
// either side. That check caught real gaps (Bank had no interchange entry
// at all; Bond Street/Stratford were missing Jubilee badges) every time it
// was run — but it never persisted as a reusable test until now.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, closePage } = require('./test-utils');

// Same station *name*, genuinely different physical station — not a real
// interchange, so it's correctly excluded from badge data. renderInterchanges()
// has an explicit special case for this exact one (Bakerloo's Edgware Road is
// not the Circle/District/H&C station of the same name nearby).
const KNOWN_NAME_COLLISIONS = {
  'Edgware Road': new Set(['bakerloo'])
};

test('every station shared by two lines carries an interchange badge for both', () => {
  const page = loadPage();
  const { test: hooks } = page;
  try {
    const LINES = hooks.getLINES();
    const interchanges = hooks.getInterchanges();

    // Build lineId -> Set(station names actually served by that line),
    // covering every branch for branch-tree lines so a station only on one
    // branch (e.g. Chesham, Uxbridge) still counts as "on" Metropolitan.
    const stationsByLine = {};
    for(const [lineId, def] of Object.entries(LINES)){
      const names = new Set();
      if(def.branches){
        Object.values(def.branches).forEach(branch => branch.stations.forEach(n => names.add(n)));
      } else {
        def.stations.forEach(n => names.add(n));
      }
      stationsByLine[lineId] = names;
    }

    const lineIds = Object.keys(stationsByLine);
    const missing = [];

    for(let i = 0; i < lineIds.length; i++){
      for(let j = i + 1; j < lineIds.length; j++){
        const [lineA, lineB] = [lineIds[i], lineIds[j]];
        const shared = [...stationsByLine[lineA]].filter(n => stationsByLine[lineB].has(n));
        for(const name of shared){
          const exception = KNOWN_NAME_COLLISIONS[name];
          if(exception && (exception.has(lineA) || exception.has(lineB))) continue;
          const badges = interchanges[name];
          if(!badges){
            missing.push(name + ': shared by ' + lineA + '/' + lineB + ' but has no STATION_INTERCHANGES entry at all');
            continue;
          }
          const ids = badges.map(b => b.id);
          if(!ids.includes(lineA)) missing.push(name + ': served by ' + lineA + ' but missing a "' + lineA + '" badge (shares with ' + lineB + ')');
          if(!ids.includes(lineB)) missing.push(name + ': served by ' + lineB + ' but missing a "' + lineB + '" badge (shares with ' + lineA + ')');
        }
      }
    }

    assert.equal(missing.length, 0, 'Missing interchange badges:\n' + [...new Set(missing)].join('\n'));
  } finally {
    closePage(page);
  }
});
