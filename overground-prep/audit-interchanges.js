// Runs the exact cross-reference test/interchanges.test.js performs, but with
// the six Overground lines added, to see what that suite will report the
// moment they become real LINES entries.
const path = require('path');
const { loadPage, closePage } = require('../test/test-utils');
const OG = require('./overground-stations.json').lines;

const page = loadPage();
const { test: hooks } = page;
const LINES = hooks.getLINES();
const interchanges = hooks.getInterchanges();
const COLL = hooks.getKnownNameCollisions();

const stationsByLine = {};
for (const [id, def] of Object.entries(LINES)) {
  const s = new Set();
  if (def.branches) Object.values(def.branches).forEach(b => b.stations.forEach(n => s.add(n)));
  else def.stations.forEach(n => s.add(n));
  stationsByLine[id] = s;
}
const ogIds = {};
for (const [id, d] of Object.entries(OG)) {
  ogIds[id] = true;
  stationsByLine[id] = new Set(d.allStations);
}

const ids = Object.keys(stationsByLine);
const missing = [];
const noEntry = new Set();
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const A = ids[i], B = ids[j];
    // only report pairs that involve at least one Overground line (the
    // tube-vs-tube pairs already pass today)
    if (!ogIds[A] && !ogIds[B]) continue;
    const shared = [...stationsByLine[A]].filter(n => stationsByLine[B].has(n));
    for (const name of shared) {
      const ex = COLL[name];
      if (ex && (ex.has(A) || ex.has(B))) continue;
      const badges = interchanges[name];
      if (!badges) { noEntry.add(`${name}  (${A} + ${B})`); continue; }
      const bid = badges.map(b => b.id);
      if (!bid.includes(A)) missing.push(`${name}: on ${A}, no "${A}" badge  [shares ${B}]`);
      if (!bid.includes(B)) missing.push(`${name}: on ${B}, no "${B}" badge  [shares ${A}]`);
    }
  }
}
console.log('=== Stations with NO STATION_INTERCHANGES entry at all: ' + noEntry.size);
[...noEntry].sort().forEach(x => console.log('   ' + x));
const uniq = [...new Set(missing)].sort();
console.log('\n=== Existing entries missing a required badge: ' + uniq.length);
uniq.forEach(x => console.log('   ' + x));
closePage(page);
