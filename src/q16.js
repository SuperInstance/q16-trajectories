// q16.js — ℚ¹⁶ fixed-point identity codec.
// Fleet doctrine: rationals or fixed-point; floats never touch identity.
// Identity here = a vector of 16 integers, each n meaning exactly n/1e6.
// 16-term integer dot products stay ≤ 16·1e12 = 1.6e13 < 2^53 ≈ 9.007e15,
// so plain double arithmetic on these integers is EXACT. No BigInt needed
// (verified in tests against BigInt ground truth).
'use strict';

const Q = 1000000; // the denominator: every coordinate is n/Q, n integer

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// float measured value → integer rational coordinate. ONE conversion, at the
// boundary; everything downstream is integers.
function toQ(x) {
  if (!Number.isFinite(x)) throw new Error('q16: non-finite input');
  return Math.round(clamp01(x) * Q);
}

// integer → display float. NEVER used for identity or comparison.
function fromQ(n) {
  return n / Q;
}

// engine features[16] (0..1 floats, FEATURES order) → identity vector (16 ints)
function vecToQ(features) {
  if (!Array.isArray(features) || features.length !== 16) {
    throw new Error('q16: expected 16 features');
  }
  return features.map(toQ);
}

function isQVec(v) {
  return (
    Array.isArray(v) &&
    v.length === 16 &&
    v.every((n) => Number.isInteger(n) && n >= 0 && n <= Q)
  );
}

// exact integer dot product
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < 16; i++) s += a[i] * b[i];
  return s; // integer, exact (see header bound)
}

// cosine similarity as a DERIVED float — ranking only, never identity.
// Computed from integers; the float leaves no trace in stored rows.
// Zero-norm vectors: cosine is undefined (0/0) — return null, callers drop the row.
function cosine(a, b) {
  const na = dot(a, a), nb = dot(b, b);
  if (na === 0 || nb === 0) return null;
  return dot(a, b) / Math.sqrt(na * nb);
}

// serialize to the wire shape tidepool accepts (16 finite numbers — integers qualify)
function toWire(v) {
  if (!isQVec(v)) throw new Error('q16: invalid identity vector');
  return v.slice();
}

// parse a stored native field (JSON array of numbers) → identity vector.
// Rejects non-integers and out-of-range values: a float in storage is corruption.
function fromStored(arr) {
  if (!Array.isArray(arr) || arr.length !== 16) {
    throw new Error('q16: stored native is not 16 numbers');
  }
  return arr.map((n) => {
    const r = Math.round(Number(n));
    if (!Number.isFinite(n) || Math.abs(Number(n) - r) > 1e-9 || r < 0 || r > Q) {
      throw new Error('q16: stored native is not a fixed-point identity: ' + n);
    }
    return r;
  });
}

module.exports = { Q, toQ, fromQ, vecToQ, isQVec, dot, cosine, toWire, fromStored };
