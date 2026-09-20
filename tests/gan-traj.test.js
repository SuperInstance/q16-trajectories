// tests/gan-traj.test.js — the quilt-gan seam adapter's honesty suite.
// Real counts, no mocks of our code. Same harness style as q16.test.js.
'use strict';

const assert = require('assert');
const { Q, isQVec, toWire, fromStored, cosine } = require('../src/q16');
const {
  DEFAULT_RANGES,
  dialStateToQ16,
  trajToQ16,
  adaptedRowsValidate,
} = require('../src/adapters/quilt-gan-traj');

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('ok - ' + name); }
  catch (e) { fail++; failures.push(name + ': ' + e.message); console.log('FAIL - ' + name + ' — ' + e.message); }
}

// a quilt-gan dial state exactly as app.js builds it (BigInt rationals, den 1 or 32768)
function ganDial({ strategy = 0, palette = 0, seed = 0, cohesionRatio = 0, score = 0 } = {}) {
  const dial = new Array(16).fill(0).map(() => ({ num: 0n, den: 1n }));
  dial[0] = { num: BigInt(strategy), den: 1n };
  dial[1] = { num: BigInt(palette), den: 1n };
  dial[2] = { num: BigInt(seed % 32768), den: 1n };
  dial[3] = { num: BigInt(Math.round(cohesionRatio * 32768)), den: 32768n };
  dial[4] = { num: BigInt(score), den: 1n };
  return dial;
}

console.log('== quilt-gan traj → ℚ¹⁶ identity ==');
t('strategy cells: polar/sextant/anchor → 0, ⅓, ⅔ of 1e6', () => {
  assert.strictEqual(dialStateToQ16(ganDial({ strategy: 0 }))[0], 0);
  assert.strictEqual(dialStateToQ16(ganDial({ strategy: 1 }))[0], Math.round(Q / 3));
  assert.strictEqual(dialStateToQ16(ganDial({ strategy: 2 }))[0], Math.round((2 * Q) / 3));
});
t('palette cells: abyss/paper → 0, ½ of 1e6', () => {
  assert.strictEqual(dialStateToQ16(ganDial({ palette: 0 }))[1], 0);
  assert.strictEqual(dialStateToQ16(ganDial({ palette: 1 }))[1], Q / 2);
});
t('seed dial is excluded even when huge', () => {
  const v = dialStateToQ16(ganDial({ seed: 32767 }));
  assert.strictEqual(v[2], 0);
});
t('cohesion ratio 0.5 (num 16384, den 32768) → 500000', () => {
  assert.strictEqual(dialStateToQ16(ganDial({ cohesionRatio: 0.5 }))[3], 500000);
});
t('score 50/100 → 500000', () => {
  assert.strictEqual(dialStateToQ16(ganDial({ score: 50 }))[4], 500000);
});
t('traj carries PRE-clamp score; adapter clamps at the ceiling', () => {
  assert.strictEqual(dialStateToQ16(ganDial({ score: 150 }))[4], Q);
  assert.strictEqual(dialStateToQ16(ganDial({ score: -20 }))[4], 0);
});
t('dials 5–15 stay zero', () => {
  const v = dialStateToQ16(ganDial({ strategy: 2, palette: 1, cohesionRatio: 1, score: 100 }));
  for (let i = 5; i < 16; i++) assert.strictEqual(v[i], 0);
});

console.log('== malformed input never throws (zero-fill) ==');
t('null / non-array dial → zero vector', () => {
  const v = dialStateToQ16(null);
  assert.ok(isQVec(v));
  assert.ok(v.every((n) => n === 0));
});
t('missing fields zero-fill; den 0 tolerated', () => {
  const v = dialStateToQ16([{ num: 1n, den: 0n }, undefined, { num: 5n }, null]);
  assert.strictEqual(v[0], 0); // den 0 → 0, not a crash
  assert.strictEqual(v[3], 0); // missing
  assert.strictEqual(v[4], 0); // missing
});
t('plain-number dials tolerated (gesture.mjs toFloat parity)', () => {
  const v = dialStateToQ16([3, 1, 0, 0.5, 75]);
  assert.strictEqual(v[0], toQSafe(3 / DEFAULT_RANGES.strategyCount));
  assert.strictEqual(v[4], toQSafe(75 / DEFAULT_RANGES.scoreCeiling));
});
function toQSafe(x) { return Math.round(Math.max(0, Math.min(1, x)) * Q); }

console.log('== codec interop ==');
t('every adapted row isQVec + wire round-trips through fromStored', () => {
  const traj = [
    ganDial({ strategy: 0, palette: 0, seed: 11, cohesionRatio: 0.3, score: 40 }),
    ganDial({ strategy: 1, palette: 1, seed: 9999, cohesionRatio: 0.7, score: 88 }),
    ganDial({ strategy: 2, palette: 0, seed: 5, cohesionRatio: 0.05, score: 12 }),
  ];
  const rows = trajToQ16(traj);
  assert.strictEqual(rows.length, 3);
  for (const row of rows) {
    assert.ok(isQVec(row));
    assert.deepStrictEqual(fromStored(JSON.parse(JSON.stringify(toWire(row)))), row);
  }
  assert.ok(adaptedRowsValidate(traj));
});
t('adapted trajectory distinguishes rounds (cosine non-null, not all identical)', () => {
  const rows = trajToQ16([
    ganDial({ strategy: 0, cohesionRatio: 0.2, score: 30 }),
    ganDial({ strategy: 2, cohesionRatio: 0.9, score: 95 }),
  ]);
  assert.ok(cosine(rows[0], rows[1]) > 0 && cosine(rows[0], rows[1]) < 1);
});
t('empty traj → [] (never throws)', () => {
  assert.deepStrictEqual(trajToQ16([]), []);
  assert.deepStrictEqual(trajToQ16(null), []);
});
t('ranges override is honored (vocabulary growth)', () => {
  const v = dialStateToQ16(ganDial({ strategy: 3, score: 200 }), { strategyCount: 4, scoreCeiling: 200 });
  assert.strictEqual(v[0], Math.round((3 / 4) * Q));
  assert.strictEqual(v[4], Q);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) { console.log(failures.join('\n')); process.exit(1); }
