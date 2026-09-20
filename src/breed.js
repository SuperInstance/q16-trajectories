// breed.js — run duke-lab's argument, record the walk through ℚ¹⁶.
// The trajectory is the breeding record: round 0 (wide, uncalibrated) stepped
// toward the canon by golden-section critique, one integer point per round.
'use strict';

const path = require('path');
const engine = require(path.join(__dirname, '..', 'vendor', 'duke-lab-engine.js'));
const { vecToQ, isQVec } = require('./q16');

const DEFAULT_FUEL = { maxRuns: 8, maxRounds: 7 };

function breed(opts) {
  const {
    seed = 'q16/' + 'unspecified',
    artist = 'duke',
    persona = 'purist',
    fuel = {},
  } = opts || {};
  const cap = { ...DEFAULT_FUEL, ...fuel };
  if (!(engine.ARTISTS[artist])) throw new Error('breed: unknown artist ' + artist);
  if (!(engine.PERSONAS[persona])) throw new Error('breed: unknown persona ' + persona);

  // fuel cap: the engine's own maxRounds is bounded by our fuel budget.
  const maxRounds = Math.min(opts.maxRounds || cap.maxRounds, cap.maxRounds);

  const result = engine.runArgument({ seed, artist, persona, maxRounds });

  // the walk: one ℚ point per round, in FEATURES order
  const trajectory = result.rounds.map((r) => ({
    round: r.round,
    point: vecToQ(r.features), // 16 integers — identity
    sigma: r.sigma,
    persona: r.persona,
  }));

  const final = trajectory[trajectory.length - 1];
  return {
    seed: result.seed,
    artist: result.artist,
    persona: result.persona,
    verdict: result.verdict, // {status: CONVERGED|HONEST GAP, round, sigma}
    trajectory,
    final: { round: final.round, point: final.point, sigma: final.sigma },
    start: { round: trajectory[0].round, point: trajectory[0].point, sigma: trajectory[0].sigma },
    nRounds: trajectory.length,
    featuresOrder: engine.FEATURES.map((f) => f.id), // semantics of the 16 axes
  };
}

// tidepool protocol: distill to ≤200 words — what was decided, learned, what gap remains.
function distill(bred) {
  const drift = bred.trajectory.map((t) => t.point);
  const moved = drift.length > 1
    ? drift[0].map((x, i) => Math.abs(x - drift[drift.length - 1][i]))
    : [];
  const topAxes = moved
    .map((d, i) => ({ axis: bred.featuresOrder[i], d }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 4)
    .map((x) => x.axis);
  const pts = [
    `seed ${bred.seed} · ${bred.artist} under ${bred.persona}`,
    `verdict: ${bred.verdict.status} at round ${bred.verdict.round} (σ ${bred.verdict.sigma})`,
    `walk: ${bred.nRounds} points in ℚ¹⁶, σ ${bred.start.sigma} → ${bred.final.sigma}`,
    `most-moved axes: ${topAxes.join(', ')}`,
    `identity: final point [${bred.final.point.join(',')}] (fixed-point ×1e6, FEATURES order)`,
    'gap: per-round critique text is not yet carried into the ocean — points only.',
  ];
  const body = pts.join('\n');
  if (body.split(/\s+/).length > 200) throw new Error('distill: over 200 words');
  return body;
}

module.exports = { breed, distill, engine, isQVec };
