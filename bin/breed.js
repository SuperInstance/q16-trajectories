#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// breed — grow a Q16 trajectory and print it.
//
//   node bin/breed.js --seed 7 --generations 12 --mutate 3
//   node bin/breed.js --seed 7 --json           # exact n/d serialization
//   node bin/breed.js --seed 7 --rows           # N×16 float matrix (gesture-kit seam)
//
// Pipe the --rows output into @superinstance/gesture-kit's readTrajectory to
// read the path's arc / bending / twist. This tool owns the breeding; the shape
// is read there, once.
// ═══════════════════════════════════════════════════════════════════
import { breed, toFloat, DIMS } from '../src/q16.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, def) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : def; };

if (flag('--help') || flag('-h')) {
  process.stdout.write(
    `breed — grow a Q16 (ℚ¹⁶) trajectory\n\n` +
    `  --seed N          integer seed (determines the path)   [1]\n` +
    `  --generations N   steps after the rest point           [8]\n` +
    `  --mutate N        dial mutations per generation         [3]\n` +
    `  --json            exact numerator/denominator rows\n` +
    `  --rows            N×16 float matrix (the gesture-kit seam)\n`);
  process.exit(0);
}

const seed = Number(opt('--seed', '1'));
const generations = Number(opt('--generations', '8'));
const mutate = Number(opt('--mutate', '3'));
const traj = breed({ seed, generations, mutate });

if (flag('--json')) { process.stdout.write(JSON.stringify(traj.toJSON()) + '\n'); process.exit(0); }
if (flag('--rows')) { process.stdout.write(JSON.stringify(traj.toRows()) + '\n'); process.exit(0); }

// Human summary: how far each dial drifted from rest, and the touched dials.
const rest = traj.at(0), end = traj.at(traj.length - 1);
const moved = [];
for (let i = 0; i < DIMS; i++) {
  const d = toFloat(end[i]) - toFloat(rest[i]);
  if (Math.abs(d) > 1e-12) moved.push(`d${i}:${d >= 0 ? '+' : ''}${d.toFixed(3)}`);
}
process.stdout.write(
  `Q16 trajectory · seed ${seed} · ${traj.length} points · ℚ¹⁶ (16 rational dims)\n` +
  `  dials moved: ${moved.length ? moved.join('  ') : '(none)'}\n` +
  `  read its shape:  node bin/breed.js --seed ${seed} --rows | (gesture-kit) readTrajectory\n`);
