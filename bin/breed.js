#!/usr/bin/env node
// bin/breed.js — CLI: breed an argument, write a local WAL record, pipe to the ocean.
//   node bin/breed.js --seed caravan/9 --artist monk --persona engineer \
//     --endpoint https://tidepool.<sub>.workers.dev --out ./wal --fuel 7
'use strict';

const fs = require('fs');
const path = require('path');
const { breed, distill } = require('../src/breed');
const { makeClient } = require('../src/tidepool-client');
const { lineage } = require('../src/lineage');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const seed = arg('seed', 'q16/' + new Date().toISOString().slice(0, 10));
const artist = arg('artist', 'duke');
const persona = arg('persona', 'purist');
const endpoint = arg('endpoint', null);
const outDir = arg('out', null);
const fuelRounds = parseInt(arg('fuel', '7'), 10);

async function main() {
  const bred = breed({ seed, artist, persona, fuel: { maxRounds: fuelRounds } });
  const body = distill(bred);
  const record = {
    ...bred,
    body,
    writtenAt: new Date().toISOString(),
  };

  // local WAL: JSONL append — a respawn can resume from here even with no ocean.
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const wal = path.join(outDir, 'trajectories.jsonl');
    fs.appendFileSync(wal, JSON.stringify(record) + '\n');
    console.log('wal: ' + wal);
  }

  const client = makeClient({ endpoint, author: 'q16-trajectories' });
  const remembered = await client.remember(bred, { body });
  if (remembered.ok) {
    console.log('ocean: remembered as ' + remembered.id + ' (native stored: ' + !!remembered.native + ')');
    const lin = await lineage(client, bred, 8);
    if (lin.ok) {
      console.log('lineage: ' + lin.neighbors.length + ' neighbors, chain ' + lin.chain.length + ' links');
      lin.neighbors.slice(0, 3).forEach((n, i) =>
        console.log('  #' + (i + 1) + ' [' + n.similarity.toFixed(4) + '] ' + n.title));
    } else {
      console.log('lineage: degraded — ' + lin.error);
    }
  } else {
    console.log('ocean: NOT persisted (' + remembered.error + ') — local WAL carries the record');
  }

  console.log('breed: ' + bred.seed + ' → ' + bred.verdict.status +
    ' @R' + bred.verdict.round + ' · σ ' + bred.start.sigma + ' → ' + bred.final.sigma +
    ' · ' + bred.nRounds + ' ℚ-points');
}

main().catch((e) => { console.error('breed failed: ' + e.message); process.exit(1); });
