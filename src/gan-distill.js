// gan-distill.js — the ledger-seeded GAN over the ocean distill.
// Springs carried from the fleet's substrate mining (jev-quilt witness_rng,
// substrate-gan): the RNG is seeded FROM the ledger (replay-identical), and
// the generator resamples its own kept ledger — kept IS the genotype.
// Anti-dada floor is multiplicative {0,1}: novelty proposes, viability
// disposes; a candidate under floor dies no matter how different it is.
'use strict';

const { breed } = require('./breed');
const { dot } = require('./q16');

// fnv1a-64 over UTF-8 bytes — same rule as jev-quilt / twist-engine / duke-lab.
function fnv1a64(str) {
  const buf = Buffer.from(str, 'utf8');
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const b of buf) {
    h ^= BigInt(b);
    h = (h * prime) & mask;
  }
  return h;
}

// ledger-seeded exact RNG: state is a 64-bit hash, advanced by hashing
// (state ‖ counter). Same seed → same stream → replay-identical runs.
function witnessRng(seed) {
  let state = fnv1a64('witness:' + seed);
  let counter = 0;
  return {
    next() { // exact integer in [0, 2^53) — safe for all JS integer math
      counter++;
      state = fnv1a64('witness:' + state.toString(16) + ':' + counter);
      return Number(state & 0x001fffffffffffffn);
    },
    nextInt(n) { return n <= 0 ? 0 : this.next() % n; },
    fork(tag) { return witnessRng(seed + '/' + tag + ':' + state.toString(16)); },
  };
}

// the critic's coherence score: an INTEGER read of the walk, never a float.
// progress: fraction of rounds that did not re-widen σ, ×600.
// activity: how many of the 16 axes actually moved start→final, ×25 (cap 400).
function coherenceOf(bred) {
  const tr = bred.trajectory;
  let progress = 0;
  for (let i = 1; i < tr.length; i++) if (tr[i].sigma <= tr[i - 1].sigma) progress++;
  const frac = tr.length > 1 ? progress / (tr.length - 1) : 0;
  const moved = tr[0].point
    .map((x, i) => Math.abs(x - tr[tr.length - 1].point[i]))
    .filter((d) => d > 0).length;
  return Math.round(frac * 600) + Math.min(400, moved * 25);
}

// viability floor: multiplicative {0,1}. Below floor the candidate is dead
// regardless of coherence — pure difference collapses into dada noise.
function viabilityFloor(bred) {
  if (bred.nRounds < 3) return 0; // no walk, no organism
  if (!(bred.verdict && bred.verdict.status)) return 0; // engine refused
  const s = dot(bred.start.point, bred.start.point);
  const f = dot(bred.final.point, bred.final.point);
  if (s === 0 || f === 0) return 0; // zero-norm: no identity to keep
  return 1;
}

const GENESIS = [
  { artist: 'monk', persona: 'purist' },
  { artist: 'monk', persona: 'engineer' },
  { artist: 'duke', persona: 'historian' },
];

// generator: resample the kept ledger (or genesis pool when barren).
// parents chosen by coherence-weighted draw; child seed = lineage citation.
function propose(rng, ledger, gen) {
  if (ledger.length === 0) {
    const g = GENESIS[rng.nextInt(GENESIS.length)];
    return { seed: `q16/gan/gen-${gen}`, artist: g.artist, persona: g.persona };
  }
  let total = 0;
  for (const e of ledger) total += e.coherence;
  let pick = rng.nextInt(total);
  let parent = ledger[0];
  for (const e of ledger) { if (pick < e.coherence) { parent = e; break; } pick -= e.coherence; }
  const mutate = rng.nextInt(4) === 0; // ¼ of the time, borrow a genesis dial
  const g = GENESIS[rng.nextInt(GENESIS.length)];
  return {
    seed: parent.seed + '/g' + gen, // lineage: child cites its parent's seed
    artist: mutate ? g.artist : parent.artist,
    persona: mutate ? g.persona : parent.persona,
  };
}

// run the loop. every candidate — kept or rejected — books a hash-chained
// receipt, so the GAN's own ledger is auditable like any fleet WAL.
function distillGan(opts) {
  const { seed = 'q16/gan', rounds = 20, fuel } = opts || {};
  const rng = witnessRng(seed);
  const ledger = [];
  const rejected = [];
  const receipts = [];
  let prev = '0'.repeat(16);

  for (let gen = 0; gen < rounds; gen++) {
    const cand = propose(rng, ledger, gen);
    const bred = breed({ ...cand, fuel });
    const coherence = coherenceOf(bred);
    const floor = viabilityFloor(bred);
    const kept = floor === 1 && coherence > 0;
    const entry = {
      gen, seed: bred.seed, artist: bred.artist, persona: bred.persona,
      coherence, floor, verdict: bred.verdict.status,
    };
    const payload = JSON.stringify(entry);
    const hash = fnv1a64(prev + payload).toString(16).padStart(16, '0');
    receipts.push({ hash, prev, payload });
    prev = hash;
    (kept ? ledger : rejected).push(entry);
  }

  const coherences = ledger.map((e) => e.coherence);
  const first3 = coherences.slice(0, 3);
  const last3 = coherences.slice(-3);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    seed, rounds,
    kept: ledger.length,
    rejected: rejected.length,
    ledger, rejectedEntries: rejected,
    receipts,
    coherenceFirst: mean(first3),
    coherenceLast: mean(last3),
    best: ledger.reduce((a, e) => (e.coherence > (a ? a.coherence : -1) ? e : a), null),
    receiptsVerified: verifyReceipts(receipts),
  };
}

// re-derive the chain — a tampered payload breaks at its own row.
function verifyReceipts(receipts) {
  let prev = '0'.repeat(16);
  for (const r of receipts) {
    if (r.prev !== prev) return false;
    if (fnv1a64(prev + r.payload).toString(16).padStart(16, '0') !== r.hash) return false;
    prev = r.hash;
  }
  return true;
}

module.exports = { fnv1a64, witnessRng, coherenceOf, viabilityFloor, propose, distillGan, verifyReceipts };
