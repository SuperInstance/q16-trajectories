# q16-trajectories

**Q16 breed trajectories in a 16-dimensional _rational_ space.** A `Q16` point is a
vector of sixteen exact rationals (ℚ¹⁶); a **trajectory** is an ordered path of
such points — the record of a bred or generated state moving through that space.
duke-lab's generative argument is *bred* here; [`tidepool`](https://github.com/SuperInstance/tidepool)
indexes the same 16-dim rational space; [`quilt-gan`](https://github.com/SuperInstance/quilt-gan)
already records its arena's own breed record as exactly this ℚ¹⁶ shape.

> **v0 seam exploration.** This fills the repo's scaffold (`bin/breed.js`,
> `tests/q16.test.js`) with a minimal, tested implementation and — the point of
> the exercise — wires the **seam to the fleet's canonical path-reader** so the
> layers compose instead of each re-deriving the other's math. Framed as a
> proposal on the `q16` seam; redirect freely.

```js
import { breed } from 'q16-trajectories';
import { readTrajectory } from '@superinstance/gesture-kit';

const traj = breed({ seed: 7, generations: 16 });   // a ℚ¹⁶ path (exact rationals)
const shape = readTrajectory(traj.toRows());          // arc / bending / twist, read once
// shape.arcLength, shape.bendingEnergy (curvature), shape.twistEnergy (torsion)
```

## Why rational

Floats drift. A breed record kept in floats rounds a little at every generation
and rounds *differently* on different machines, so "the same breed" stops being
the same. `Q16` keeps every dial as an exact `{ n, d }` over `BigInt`, so a
trajectory is **reproducible bit-for-bit** — `toJSON()` → `fromJSON()` is exact,
and `breed({ seed })` yields the identical path anywhere.

## The layering (why this repo does *not* read shape)

The SuperInstance fleet reads the geometry of a path — arc (1st order), bending
/ curvature (2nd), twist / torsion (3rd) — in exactly one place:
[`@superinstance/gesture-kit`](https://github.com/SuperInstance/gesture-kit)'s
`readTrajectory`. This package deliberately **does not re-implement that math**
(it had already been re-carved three times across the fleet). It owns the
*format* and the *breeding* — the trajectory layer — and hands the shape layer a
plain number matrix through one seam:

```
q16-trajectories            gesture-kit
  breed()  ──►  Trajectory.toRows()  ──►  readTrajectory(rows, { dims })
  (ℚ¹⁶, exact)     (N×16 floats)            (arc / bending / twist)
```

Slice to the dials that matter with `{ dims: [...] }`; `readTrajectory`
per-column-normalizes so a big-magnitude dial doesn't drown a small one.

## API (`src/q16.js`)

- `q(n, d=1)` · `add · sub · mul · toFloat · eq` — exact rationals over `BigInt`.
- `point(values)` — coerce to a Q16 point (exactly 16 rationals; pads with 0, refuses non-integer floats — pass a rational for a fractional dial).
- `Trajectory` — `push` · `at` · `length` · **`toRows()`** (the gesture-kit seam) · `toJSON()` / `Trajectory.fromJSON()` (exact round-trip).
- `breed({ seed, generations, mutate })` — a deterministic seeded walk through ℚ¹⁶; a v0 stand-in for duke-lab's generative argument. Same seed → identical path.
- `DIMS` = 16.

## CLI

```
node bin/breed.js --seed 7 --generations 12      # human summary (which dials moved)
node bin/breed.js --seed 7 --rows                # N×16 float matrix (the gesture-kit seam)
node bin/breed.js --seed 7 --json                # exact numerator/denominator rows
```

## Test

```
npm test        # node tests/q16.test.js — zero-dependency (15 checks)
```

## License

MIT
