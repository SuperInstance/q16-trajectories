// tests/gan-distill.test.js — the ledger-seeded GAN's honesty suite.
// Real runs, no mocks of our code. Same harness style as q16.test.js.
'use strict';

const assert = require('assert');
const {
  fnv1a64, witnessRng, coherenceOf, viabilityFloor, distillGan, verifyReceipts,
} = require('../src/gan-distill');
const { breed } = require('../src/breed');

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('ok - ' + name); }
  catch (e) { fail++; failures.push(name + ': ' + e.message); console.log('FAIL - ' + name + ' — ' + e.message); }
}

console.log('== fnv1a-64: the fleet pin, bytes not characters ==');
t('café Δ 日本语 → 0x024a555471370b18d (same pin as python/TS/rust/duke-lab)', () => {
  // NOTE: the jev pin uses 日本語; duke-lab/jev suites pin 日本語. We pin the
  // actual bytes we hash: the canonical vector from JEV-SPEC is café Δ 日本語.
  const h = fnv1a64('café Δ 日本語');
  assert.strictEqual(h, 0x024a555471370b18dn);
});

console.log('== witness rng: ledger-seeded, replay-identical ==');
t('same seed → same stream', () => {
  const a = witnessRng('q16/gan'), b = witnessRng('q16/gan');
  for (let i = 0; i < 50; i++) assert.strictEqual(a.next(), b.next());
});
t('different seed → different stream', () => {
  const a = witnessRng('q16/gan'), b = witnessRng('q16/gan2');
  assert.notStrictEqual(a.next(), b.next());
});
t('values are exact integers below 2^53', () => {
  const a = witnessRng('q16/gan');
  for (let i = 0; i < 100; i++) {
    const v = a.next();
    assert.ok(Number.isInteger(v) && v < 2 ** 53 && v >= 0, 'out of range: ' + v);
  }
});
t('fork is deterministic and independent of interleaving', () => {
  const base = witnessRng('q16/gan');
  const f1 = base.fork('critic');
  const again = witnessRng('q16/gan');
  const f2 = again.fork('critic');
  for (let i = 0; i < 10; i++) assert.strictEqual(f1.next(), f2.next());
});

console.log('== coherence + viability floor ==');
t('coherence is an integer in [0, 1000]', () => {
  const bred = breed({ seed: 'caravan/9', artist: 'monk', persona: 'purist' });
  const c = coherenceOf(bred);
  assert.ok(Number.isInteger(c), 'not an integer: ' + c);
  assert.ok(c >= 0 && c <= 1000, 'out of range: ' + c);
});
// tests use 16-dim stubs — dot() iterates 16 axes; short arrays are NaN, not zero.
function stubVec(fill) { const v = new Array(16).fill(0); fill(v); return v; }
t('floor is multiplicative {0,1}: a 1-round walk is dead regardless of story', () => {
  const stub = { nRounds: 1, verdict: { status: 'CONVERGED', round: 0, sigma: 0 }, start: { point: stubVec(() => {}) }, final: { point: stubVec((v) => { v[0] = 1; }) } };
  assert.strictEqual(viabilityFloor(stub), 0);
});
t('floor kills zero-norm identity even with a full walk', () => {
  const stub = { nRounds: 5, verdict: { status: 'CONVERGED', round: 4, sigma: 0 }, start: { point: stubVec(() => {}) }, final: { point: stubVec((v) => { v[0] = 1; }) } };
  assert.strictEqual(viabilityFloor(stub), 0);
});
t('a real bred walk passes the floor', () => {
  const bred = breed({ seed: 'caravan/9', artist: 'monk', persona: 'purist' });
  assert.strictEqual(viabilityFloor(bred), 1);
});

console.log('== the loop: replay, receipts, honest improvement ==');
const RUN_SEED = 'q16/gan/test';
const run = distillGan({ seed: RUN_SEED, rounds: 12 });
t('same seed → identical ledger (replay-identical)', () => {
  const again = distillGan({ seed: RUN_SEED, rounds: 12 });
  assert.deepStrictEqual(again.ledger, run.ledger);
});
t('every candidate books a receipt; chain verifies', () => {
  assert.strictEqual(run.receipts.length, 12);
  assert.strictEqual(run.receiptsVerified, true);
  assert.strictEqual(verifyReceipts(run.receipts), true);
});
t('a tampered receipt breaks verification at its own row', () => {
  const tampered = run.receipts.map((r, i) => (i === 5 ? { ...r, payload: r.payload.replace('1', '2') } : r));
  assert.strictEqual(verifyReceipts(tampered), false);
});
t('children cite their parent seed in lineage', () => {
  const withKids = run.ledger.filter((e) => e.seed.includes('/g'));
  assert.ok(withKids.length > 0, 'expected children in the ledger');
  for (const k of withKids.slice(1, 6)) {
    const parentSeed = k.seed.slice(0, k.seed.lastIndexOf('/g'));
    assert.ok(
      run.ledger.some((e) => e.seed === parentSeed) || parentSeed.startsWith('q16/gan/gen-'),
      'no parent found for ' + k.seed
    );
  }
});
t('kept count + rejected count = rounds (nothing silently lost)', () => {
  assert.strictEqual(run.kept + run.rejected, 12);
});
t('HONEST MEASURED CLAIM: late-ledger coherence vs first-ledger coherence', () => {
  // pinned from the deterministic run — re-derive, never trust a stale pin.
  const fresh = distillGan({ seed: RUN_SEED, rounds: 12 });
  assert.strictEqual(fresh.coherenceLast, run.coherenceLast);
  console.log(`  measured: first-3 mean ${run.coherenceFirst}, last-3 mean ${run.coherenceLast}, kept ${run.kept}/12, best ${run.best.coherence} (${run.best.seed})`);
  // the claim we SHIP: the generator's self-resampling does not regress.
  // pinned from the deterministic run (rounds=12): 610.67 → 651.33, kept 12/12.
  assert.ok(run.kept >= 3, 'too few kept to say anything honest');
  assert.ok(run.coherenceLast >= run.coherenceFirst, 'self-resampling regressed coherence — the spring is broken');
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
