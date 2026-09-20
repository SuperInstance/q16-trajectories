// sigma-loop.js — the σ tuning loop: how low can the walk honestly go?
// Runs a (persona × jitter) grid under fuel caps, then probes the measurement
// noise floor (a take generated AT the effective centroid, jitter ≈ 0).
// Honest by construction: it reports what the medium refuses, instead of
// declaring convergence the single-take noise cannot support.
'use strict';

const { engine } = require('./breed');

const DEFAULT_FUEL = { maxRounds: 7 };

function runCell({ seed, artist, persona, jitter, fuel }) {
  const cap = { ...DEFAULT_FUEL, ...(fuel || {}) };
  const result = engine.runArgument({ seed, artist, persona, maxRounds: cap.maxRounds, jitter });
  const rounds = result.rounds;
  const final = rounds[rounds.length - 1];
  return {
    persona, jitter,
    nRounds: rounds.length,
    startSigma: rounds[0].sigma,
    finalSigma: final.sigma,
    verdict: result.verdict.status,
    curve: rounds.map((r) => r.sigma),
  };
}

function noiseFloor({ seed, artist, persona }) {
  // params start at the effective centroid (jitter 0): round-0 σ is pure
  // take-measurement noise vs the judgeable canon. No honest walk can
  // converge below this without changing how σ is measured (e.g. mean
  // over N takes) — that is an engine-side decision, not a fuel one.
  const probe = engine.runArgument({ seed: seed + '/floor', artist, persona, maxRounds: 0, jitter: 0 });
  return probe.rounds[0].sigma;
}

function sigmaLoop(opts) {
  const {
    seed = 'q16/loop',
    artist = 'monk',
    personas = null,
    jitters = [0.34, 0.1, 0.05],
    fuel = {},
  } = opts || {};
  const ps = personas || Object.keys(engine.PERSONAS);
  const cells = [];
  for (const persona of ps) {
    for (const jitter of jitters) {
      cells.push(runCell({ seed, artist, persona, jitter, fuel }));
    }
  }
  cells.sort((a, b) => a.finalSigma - b.finalSigma);
  const best = cells[0];
  const floors = {};
  ps.forEach((p) => { floors[p] = noiseFloor({ seed, artist, persona: p }); });
  const minFloor = Math.min(...Object.values(floors));
  return {
    seed, artist, fuel: { ...DEFAULT_FUEL, ...fuel },
    cells,
    best: { persona: best.persona, jitter: best.jitter, finalSigma: best.finalSigma, verdict: best.verdict },
    floors,
    noiseFloor: minFloor,
  };
}

// is a target σ honestly reachable right now?
function assess(report, target) {
  return {
    target,
    bestSigma: report.best.finalSigma,
    noiseFloor: report.noiseFloor,
    aboveFloor: target >= report.noiseFloor,
    gapToBest: +(report.best.finalSigma - target).toFixed(4),
    verdict: target >= report.noiseFloor
      ? 'REACHABLE-IN-PRINCIPLE — target is above the measurement floor; loop harder'
      : 'HONEST GAP — target is below single-take measurement noise; reachable only by changing how σ is measured (mean over N takes, engine-side)',
  };
}

module.exports = { sigmaLoop, noiseFloor, assess };
