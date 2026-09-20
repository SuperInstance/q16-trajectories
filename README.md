# Q16 — ℚ¹⁶ breed trajectories

**v0 seam exploration.** The collision of [SuperInstance/duke-lab](https://github.com/SuperInstance/duke-lab)
(a GAN with words — a generator argues with a 16-feature critic until they converge in
golden ratio) with [SuperInstance/tidepool](https://github.com/SuperInstance/tidepool)
(the fleet's vector context ocean, whose native structural index is exactly 16 dimensions).

Nobody had built the bridge. This repo is the smallest honest first version of it.

## What it does

duke-lab's `runArgument` produces a **walk**: each round, the generator's take is measured
into a 16-feature trace (`features[16]`, FEATURES order) and the critique steps it toward
the canon. duke-lab's own worker keeps only the *final* point. **Here, the walk is the
artifact**: every round becomes an integer point in ℚ¹⁶ (fixed-point ×1e6 — rationals only,
floats never touch identity), the final point is written into tidepool as a `musician`
artifact with its `runs` row attached, and lineage queries ask the ocean who else lives
near a given point.

```
seed → runArgument → features[16] per round → ℚ integer points (trajectory)
     → distill (≤200 words) → tidepool /api/remember {native, run}
     → /api/recall/similar?vec= → exact-integer re-rank → lineage chain
```

## Files

| Path | What |
|---|---|
| `vendor/duke-lab-engine.js` | duke-lab engine, vendored at commit `6004841` (`vendor/DUKE-LAB-PIN`). Zero-dep, deterministic. |
| `src/q16.js` | ℚ fixed-point identity codec. `Q = 1e6`; identity = 16 integers; integer dot products exact (< 2^53, verified vs BigInt in tests). |
| `src/breed.js` | `breed()` — run the argument, record the walk. `distill()` — ≤200-word ocean report. |
| `src/tidepool-client.js` | The pipe. Never throws on the write path; timeout via AbortController; honest offline degrade. |
| `src/lineage.js` | Nearest-neighbor re-rank by exact integer cosine; round-by-round ancestry chain. |
| `src/sigma-loop.js` | The σ tuning loop: (persona × jitter) grid under fuel caps + the measurement noise-floor probe, with an honest verdict on any σ target. |
| `bin/breed.js` | CLI: breed → local JSONL WAL → optional ocean write → lineage summary. |
| `bin/sigma-loop.js` | CLI: print the grid, the floor, and whether a `--target` σ is honestly reachable. |

## Run it

```bash
npm test
# breed one and store locally (no ocean needed):
node bin/breed.js --seed caravan/9 --artist monk --persona engineer --out ./wal
# breed into a live tidepool:
node bin/breed.js --seed caravan/9 --artist monk --endpoint https://tidepool.<sub>.workers.dev --out ./wal
```

## Doctrine carried

- **Numbers verified, not trusted** — integer dot products checked against BigInt; the
  mock ocean in tests honors tidepool's real wire validation
  (`native_must_be_16_finite_numbers`).
- **Floats never touch identity** — one conversion at the engine boundary; storage and
  similarity are integers; derived floats (cosine) rank and leave no trace.
- **Never-throw on the write path** — the ocean is optional; the local WAL (`wal/trajectories.jsonl`)
  carries every record a respawn needs.
- **Fuel caps** — `fuel.maxRounds` bounds every generation loop.
- **Absence is information** — offline mode says so, honestly.

## Verified recon (2026-09-20)

- duke-lab emits `{rounds: [{features[16], sigma, …}], verdict}` — tests: 40 passed (README says 28; docs behind code).
- tidepool stores `artifacts(native JSON[16], …)` + `runs(task, outcome, …)`; `similar?vec=` = native NN — tests: 18 passed (README accurate).
- Stale claim refuted: tidepool has **no** WAL/thread-memory/stall-event tables — the real shapes are `artifacts` + `runs`, and this bridge speaks both.
- Both sides were designed for this collision (tidepool README cites duke centroids); the missing pieces were the pipe, the identity layer, and the trajectory record.

## The σ loop (2026-09-20)

`node bin/sigma-loop.js --seed caravan/9 --artist monk --target 0.08`

Findings, measured not hoped:
- Best honest walk under fuel 7: engineer @ jitter 0.05, σ → **0.1418** (HONEST GAP).
- Measurement noise floor: a take generated *at* the effective centroid (jitter 0)
  still reads σ ≈ **0.12–0.15** — the engine measures σ on ONE take per round.
- **σ 0.08 is below that floor.** It is unreachable by any amount of tuning or fuel;
  it becomes reachable only by changing how σ is measured (mean over N takes) —
  an engine-side (duke-lab) decision, logged here rather than papered over.

## Honest gaps (v0)

- Per-round critique *text* is not carried into the ocean — points only.
- No live Cloudflare integration test — the mock honors the wire contract; a deployed
  tidepool should be exercised before trusting writes in anger.
- duke-lab's own MUSICIANS_NATIVE index and tidepool's TIDEPOOL_NATIVE remain two separate
  16-dim oceans; unifying them is a fleet decision, not this repo's.

MIT LICENSE — the pool belongs to the fleet.
