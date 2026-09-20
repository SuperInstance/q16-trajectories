#!/usr/bin/env node
// bin/sigma-loop.js — CLI for the σ tuning loop.
//   node bin/sigma-loop.js --seed caravan/9 --artist monk --target 0.08 --fuel 7
// Prints the (persona × jitter) grid, the measurement noise floor, and an
// honest verdict on whether --target is reachable under the current engine.
'use strict';

const { sigmaLoop, assess } = require('../src/sigma-loop');
const { engine } = require('../src/breed');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const seed = arg('seed', 'q16/' + new Date().toISOString().slice(0, 10));
const artist = arg('artist', 'monk');
const target = parseFloat(arg('target', '0.08'));
const fuelRounds = parseInt(arg('fuel', '7'), 10);

if (!engine.ARTISTS[artist]) {
  console.error('sigma-loop: unknown artist ' + artist);
  process.exit(1);
}

const report = sigmaLoop({ seed, artist, fuel: { maxRounds: fuelRounds } });

console.log('σ loop · seed ' + seed + ' · artist ' + artist + ' · fuel ' + fuelRounds + ' rounds');
console.log('persona      jitter  rounds  σ start → final        verdict');
report.cells.forEach((c) => {
  console.log(
    c.persona.padEnd(12) +
    String(c.jitter).padEnd(7) +
    String(c.nRounds).padEnd(7) +
    (c.startSigma.toFixed(4) + ' → ' + c.finalSigma.toFixed(4)).padEnd(21) +
    c.verdict
  );
});
console.log('');
console.log('best: ' + report.best.persona + ' @ jitter ' + report.best.jitter +
  ' → σ ' + report.best.finalSigma.toFixed(4) + ' (' + report.best.verdict + ')');
console.log('measurement noise floor (take at centroid, jitter 0): σ ' + report.noiseFloor.toFixed(4));
const a = assess(report, target);
console.log('target ' + target + ': ' + a.verdict + (a.aboveFloor ? '' : ' (floor gap ' + Math.abs(a.gapToBest).toFixed(4) + ')'));
