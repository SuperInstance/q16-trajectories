// adapters/quilt-gan-traj.js — read quilt-gan's arena breed record into ℚ¹⁶ identity space.
//
// quilt-gan (SuperInstance/quilt-gan, app.js ~line 319) appends every round's
// arena config to `state.traj` as 16 rational dials { num: BigInt, den: BigInt }
// with HETEROGENEOUS denominators (1 or 32768):
//
//   dial 0  strategy index   ∈ {0,1,2}            (polar, sextant, anchor), den 1
//   dial 1  palette index    ∈ {0,1}              (abyss, paper),          den 1
//   dial 2  seed % 32768     per-round entropy    — MEANINGLESS as a direction,
//                                                    excluded (quilt-gan gesture.mjs
//                                                    SEMANTIC_DIALS excludes it too)
//   dial 3  cohesion ratio   already ∈ [0,1]       num = round(ratio·32768), den 32768
//   dial 4  score            pre-clamp verdict.score — can exceed the round
//                                                    entry's [0,100] clamp; we clamp
//   dials 5–15               structurally zero
//
// The q16 codec is a FIXED-POINT space: 16 integers, each exactly n/1e6, each
// normalized to [0,1]. So the adapter performs the documented per-dial
// normalization into [0,1] with FIXED cross-run ranges (not per-run min-max —
// lineage and nearest-neighbor search must compare runs, and gesture.mjs's
// per-run normalization is run-relative by design there).
//
// Normalization choice: index / COUNT (cell-preserving), not index / (COUNT-1)
// (endpoint-stretching). Two strategies are not "opposite poles"; they are two
// cells. Cross-run identity density stays uniform.
//
// Conversion discipline (q16.js header): rationals → float happens ONCE, at
// this boundary; everything downstream is integers.
//
// Pure, zero-dependency, never throws on missing/malformed dials (zero-fill).
'use strict';

const { Q, toQ, isQVec } = require('../q16');

// Fixed semantic ranges, grounded in quilt-gan app.js/engine.js HEAD.
// Overridable per-call if quilt-gan's vocabularies grow.
const DEFAULT_RANGES = Object.freeze({
  strategyCount: 3, // strats = ['polar', 'sextant', 'anchor']
  paletteCount: 2, // Object.keys(E.PALETTES) = ['abyss', 'paper']
  scoreCeiling: 100, // round entries clamp to [0,100]; traj dial may be pre-clamp
});

// tolerate plain numbers / BigInt rationals / missing fields; den 0 or missing → 0
function rationalToFloat(q) {
  if (q == null) return 0;
  if (typeof q === 'number') return Number.isFinite(q) ? q : 0;
  const num = q.num === undefined ? 0 : Number(q.num);
  const den = q.den === undefined ? 1 : Number(q.den);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
}

/** one quilt-gan dial state → one ℚ¹⁶ identity vector (16 integers). */
function dialStateToQ16(dial, ranges = DEFAULT_RANGES) {
  const r = { ...DEFAULT_RANGES, ...(ranges || {}) };
  const v = new Array(16).fill(0);
  if (!Array.isArray(dial)) return v; // zero vector, no throw

  // dial 0: strategy index / strategyCount
  if (dial[0] != null) v[0] = toQ(rationalToFloat(dial[0]) / r.strategyCount);
  // dial 1: palette index / paletteCount
  if (dial[1] != null) v[1] = toQ(rationalToFloat(dial[1]) / r.paletteCount);
  // dial 2 (seed): deliberately excluded → stays 0
  // dial 3: cohesion, already [0,1]; toQ clamps any drift
  if (dial[3] != null) v[3] = toQ(rationalToFloat(dial[3]));
  // dial 4: score / scoreCeiling; toQ clamps the pre-clamp overshoot
  if (dial[4] != null) v[4] = toQ(rationalToFloat(dial[4]) / r.scoreCeiling);
  return v;
}

/** a whole traj (array of dial states) → array of identity vectors, dropping nothing. */
function trajToQ16(traj, ranges = DEFAULT_RANGES) {
  if (!Array.isArray(traj)) return [];
  return traj.map((d) => dialStateToQ16(d, ranges));
}

/** round-trip honesty: does an adapted row pass the codec's own validator + storage parse? */
function adaptedRowsValidate(traj, ranges = DEFAULT_RANGES) {
  return trajToQ16(traj, ranges).every((v) => isQVec(v));
}

module.exports = { DEFAULT_RANGES, dialStateToQ16, trajToQ16, adaptedRowsValidate, Q };
