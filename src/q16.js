// ═══════════════════════════════════════════════════════════════════
// q16-trajectories — Q16 breed trajectories in a 16-dim RATIONAL space.
//
// A Q16 point is a vector of sixteen exact rationals (ℚ¹⁶). A trajectory is an
// ordered list of Q16 points — the path a bred/generated state takes through
// that space. duke-lab's generative argument is *bred* here; tidepool indexes
// the same 16-dim rational space; quilt-gan already records its arena's own
// breed record as exactly this ℚ¹⁶ shape.
//
// This package owns the FORMAT and the BREEDING (the trajectory layer). It does
// NOT re-implement the geometry of a path — arc / bending / twist — because the
// fleet already has one canonical reader for that: @superinstance/gesture-kit's
// `readTrajectory`. The seam is `Trajectory.toRows()`, which yields the plain
// number matrix that reader consumes:
//
//     import { readTrajectory } from '@superinstance/gesture-kit';
//     import { breed } from 'q16-trajectories';
//     const g = readTrajectory(breed({ seed: 7 }).toRows());  // arc/bending/twist
//
// Rational, not float, so a bred state is exact and reproducible bit-for-bit —
// no drift across a long breed, no platform-dependent rounding in the record.
//
// Zero dependencies. Pure ES module. v0 seam exploration.
// ═══════════════════════════════════════════════════════════════════

/** The fixed width of the space: sixteen rational dimensions. */
export const DIMS = 16;

// ── exact rationals over BigInt ─────────────────────────────────────
function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) { [a, b] = [b, a % b]; }
  return a || 1n;
}

/** A normalized rational { n, d } with d > 0 and gcd(n,d) = 1. Accepts ints or bigints. */
export function q(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new RangeError('q16: zero denominator');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => q(a.n * b.n, a.d * b.d);
export const toFloat = (a) => Number(a.n) / Number(a.d);
export const eq = (a, b) => a.n === b.n && a.d === b.d; // both normalized

const isRat = (v) => v && typeof v === 'object' && typeof v.n === 'bigint' && typeof v.d === 'bigint';

/** Coerce any entry (rational | integer | number-int) to a normalized rational. */
function toRat(v) {
  if (isRat(v)) return q(v.n, v.d);
  if (typeof v === 'bigint') return q(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return q(0n);
    if (Number.isInteger(v)) return q(BigInt(v));
    // A non-integer float has no canonical small rational; keep the space exact
    // by refusing to guess — callers pass rationals for fractional dials.
    throw new TypeError(`q16: pass a rational for non-integer values (got ${v})`);
  }
  return q(0n);
}

/** A Q16 point: exactly DIMS rationals (pad with 0, truncate extras). */
export function point(values = []) {
  const out = new Array(DIMS);
  for (let i = 0; i < DIMS; i++) out[i] = i < values.length ? toRat(values[i]) : q(0n);
  return out;
}

export const zero16 = () => point([]);

/** An ordered path of Q16 points. */
export class Trajectory {
  constructor(rows = []) {
    this.rows = rows.map((r) => (Array.isArray(r) && r.length === DIMS && r.every(isRat) ? r.map((x) => q(x.n, x.d)) : point(r)));
  }
  get length() { return this.rows.length; }
  at(i) { return this.rows[i]; }
  push(p) { this.rows.push(Array.isArray(p) && p.length === DIMS && p.every(isRat) ? p.map((x) => q(x.n, x.d)) : point(p)); return this; }

  /** The seam to gesture-kit: an N×16 matrix of plain floats, ready for
   *  `readTrajectory(traj.toRows(), { dims })`. Reading happens THERE, once. */
  toRows() { return this.rows.map((pt) => pt.map(toFloat)); }

  /** Exact serialization — numerator/denominator strings, so a trajectory
   *  round-trips bit-for-bit with no float drift. */
  toJSON() { return this.rows.map((pt) => pt.map((v) => [v.n.toString(), v.d.toString()])); }
  static fromJSON(a) { return new Trajectory((a || []).map((pt) => pt.map(([n, d]) => q(BigInt(n), BigInt(d))))); }
}

// ── the breeder: duke-lab's generative argument, v0 ─────────────────
// A deterministic seeded walk through ℚ¹⁶: from a rest point, each generation
// mutates a few dials by exact rational deltas. Same seed → identical trajectory
// (BigInt rationals, so it is reproducible bit-for-bit on any machine). This is
// a v0 stand-in for duke-lab's generative argument: enough to exercise the
// format and the gesture-kit seam with a well-formed, non-trivial path.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DELTAS = [q(1, 8), q(-1, 8), q(1, 4), q(-1, 4), q(1, 2), q(-1, 2)];

/**
 * Breed a Q16 trajectory.
 * @param {object} [o]
 * @param {number} [o.seed=1]         integer seed — fully determines the path.
 * @param {number} [o.generations=8]  number of steps after the rest point.
 * @param {number} [o.mutate=3]       dial mutations per generation.
 * @returns {Trajectory} of length generations+1, starting at the rest point.
 */
export function breed({ seed = 1, generations = 8, mutate = 3 } = {}) {
  const rnd = mulberry32(seed >>> 0);
  let pt = zero16();
  const traj = new Trajectory([pt]);
  for (let g = 0; g < generations; g++) {
    const next = pt.slice();
    for (let m = 0; m < mutate; m++) {
      const dim = Math.floor(rnd() * DIMS);
      const delta = DELTAS[Math.floor(rnd() * DELTAS.length)];
      next[dim] = add(next[dim], delta);
    }
    pt = next;
    traj.push(pt);
  }
  return traj;
}
