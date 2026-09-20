import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { q, add, sub, mul, toFloat, eq, point, zero16, Trajectory, breed, DIMS } from '../src/q16.js';

describe('rationals are exact and normalized', () => {
  test('q reduces and puts the sign in the numerator', () => {
    assert.deepEqual(q(2, 4), { n: 1n, d: 2n });
    assert.deepEqual(q(1, -2), { n: -1n, d: 2n });
    assert.deepEqual(q(0, 5), { n: 0n, d: 1n });
  });
  test('arithmetic stays exact (no float drift)', () => {
    // 1/3 + 1/3 + 1/3 === 1 exactly, which floats cannot promise
    const third = q(1, 3);
    assert.ok(eq(add(add(third, third), third), q(1)));
    assert.ok(eq(sub(q(1, 2), q(1, 3)), q(1, 6)));
    assert.ok(eq(mul(q(2, 3), q(3, 4)), q(1, 2)));
  });
  test('zero denominator is refused', () => {
    assert.throws(() => q(1, 0), RangeError);
  });
  test('toFloat is a plain number', () => {
    assert.equal(toFloat(q(3, 4)), 0.75);
  });
});

describe('Q16 points are exactly 16 rational dims', () => {
  test('point pads to DIMS and coerces integers', () => {
    const p = point([1, q(1, 2)]);
    assert.equal(p.length, DIMS);
    assert.ok(eq(p[0], q(1)));
    assert.ok(eq(p[1], q(1, 2)));
    assert.ok(eq(p[2], q(0)));           // padded
  });
  test('extras beyond 16 are truncated', () => {
    assert.equal(point(new Array(40).fill(1)).length, DIMS);
  });
  test('non-integer floats are refused (pass a rational instead)', () => {
    assert.throws(() => point([0.3]), TypeError);
  });
  test('zero16 is sixteen zeros', () => {
    const z = zero16();
    assert.equal(z.length, DIMS);
    assert.ok(z.every((v) => eq(v, q(0))));
  });
});

describe('Trajectory + the gesture-kit seam', () => {
  test('push / length / at', () => {
    const t = new Trajectory().push(point([1])).push(point([2]));
    assert.equal(t.length, 2);
    assert.ok(eq(t.at(1)[0], q(2)));
  });
  test('toRows yields an N×16 float matrix (ready for readTrajectory)', () => {
    const t = new Trajectory([point([q(1, 2)]), point([q(1, 4)])]);
    const rows = t.toRows();
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.length === DIMS));
    assert.equal(rows[0][0], 0.5);
    assert.equal(rows[1][0], 0.25);
  });
  test('toJSON / fromJSON round-trips exactly (no drift)', () => {
    const t = breed({ seed: 12, generations: 6 });
    const back = Trajectory.fromJSON(t.toJSON());
    assert.equal(back.length, t.length);
    for (let i = 0; i < t.length; i++)
      for (let k = 0; k < DIMS; k++) assert.ok(eq(back.at(i)[k], t.at(i)[k]));
  });
});

describe('breed is deterministic and well-formed', () => {
  test('same seed → identical trajectory (bit-for-bit)', () => {
    assert.deepEqual(breed({ seed: 7 }).toJSON(), breed({ seed: 7 }).toJSON());
  });
  test('different seeds → different trajectories', () => {
    assert.notDeepEqual(breed({ seed: 7 }).toJSON(), breed({ seed: 8 }).toJSON());
  });
  test('length is generations + 1, every point is ℚ¹⁶', () => {
    const t = breed({ seed: 3, generations: 10 });
    assert.equal(t.length, 11);
    assert.ok(t.rows.every((p) => p.length === DIMS));
  });
  test('the rest point is the origin; the path actually moves', () => {
    const t = breed({ seed: 5, generations: 8, mutate: 3 });
    assert.ok(t.at(0).every((v) => eq(v, q(0))));
    const end = t.at(t.length - 1);
    assert.ok(end.some((v) => !eq(v, q(0))), 'at least one dial drifted from rest');
  });
});
