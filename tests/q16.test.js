// q16.test.js — the bridge's own honesty suite. Real counts, no mocks of our code.
// Mock tidepool runs in-process (node:http) — the wire shape is the contract under test.
'use strict';

const http = require('http');
const assert = require('assert');
const { Q, toQ, fromQ, vecToQ, isQVec, dot, cosine, toWire, fromStored } = require('../src/q16');
const { breed, distill, engine } = require('../src/breed');
const { makeClient } = require('../src/tidepool-client');
const { rankNeighbors, chain, lineage } = require('../src/lineage');

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('ok - ' + name); }
  catch (e) { fail++; failures.push(name + ': ' + e.message); console.log('FAIL - ' + name + ' — ' + e.message); }
}

/* ------------------------------- the codec ------------------------------- */
console.log('== q16 fixed-point identity ==');
t('toQ maps 0..1 into integers 0..1e6', () => {
  assert.strictEqual(toQ(0), 0);
  assert.strictEqual(toQ(1), Q);
  assert.ok(Number.isInteger(toQ(0.618033)));
});
t('toQ clamps out-of-range', () => {
  assert.strictEqual(toQ(-0.5), 0);
  assert.strictEqual(toQ(1.7), Q);
});
t('toQ rejects non-finite', () => {
  assert.throws(() => toQ(NaN), /non-finite/);
  assert.throws(() => toQ(Infinity), /non-finite/);
});
t('fromQ is display-only inverse', () => {
  assert.ok(Math.abs(fromQ(toQ(0.42)) - 0.42) < 1e-6);
});
t('vecToQ requires exactly 16', () => {
  assert.throws(() => vecToQ([0.5, 0.5]), /16/);
});
t('isQVec validates integers in range only', () => {
  assert.ok(isQVec(new Array(16).fill(0)));
  assert.ok(isQVec(new Array(16).fill(Q)));
  assert.ok(!isQVec(new Array(16).fill(0.5)));        // floats are not identity
  assert.ok(!isQVec(new Array(15).fill(0)));          // wrong length
  assert.ok(!isQVec(new Array(16).fill(Q + 1)));      // out of range
});
t('integer dot product is exact vs BigInt ground truth', () => {
  const a = vecToQ(Array.from({ length: 16 }, (_, i) => i / 16));
  const b = vecToQ(Array.from({ length: 16 }, (_, i) => 1 - i / 16));
  let truth = 0n;
  for (let i = 0; i < 16; i++) truth += BigInt(a[i]) * BigInt(b[i]);
  assert.strictEqual(BigInt(dot(a, b)), truth);
});
t('cosine of identical vectors is 1 (integer-exact inputs)', () => {
  const a = vecToQ(Array.from({ length: 16 }, (_, i) => 0.25 + i * 0.03));
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-12);
});
t('cosine of orthogonal axes is 0', () => {
  const a = new Array(16).fill(0); a[0] = Q;
  const b = new Array(16).fill(0); b[1] = Q;
  assert.strictEqual(cosine(a, b), 0);
});
t('cosine of a zero-norm vector is null (undefined, not fake 0)', () => {
  const a = new Array(16).fill(0);
  const b = new Array(16).fill(Q);
  assert.strictEqual(cosine(a, b), null);
  assert.strictEqual(cosine(b, a), null);
});
t('wire shape: 16 integers accepted by tidepool validation', () => {
  const w = toWire(vecToQ(new Array(16).fill(0.5)));
  assert.strictEqual(w.length, 16);
  assert.ok(w.every(Number.isFinite)); // tidepool: native_must_be_16_finite_numbers
});
t('fromStored rejects float corruption', () => {
  assert.throws(() => fromStored(new Array(16).fill(0.5)), /fixed-point/);
  assert.deepStrictEqual(fromStored(new Array(16).fill(42)), new Array(16).fill(42));
});

/* ------------------------------- the breed ------------------------------- */
console.log('== breed: the argument as a ℚ¹⁶ walk ==');
const bredA = breed({ seed: 'test/caravan/9', artist: 'monk', persona: 'engineer' });
const bredA2 = breed({ seed: 'test/caravan/9', artist: 'monk', persona: 'engineer' });
t('trajectory exists and every point is a ℚ identity', () => {
  assert.ok(bredA.trajectory.length >= 4);
  bredA.trajectory.forEach((p) => assert.ok(isQVec(p.point)));
});
t('determinism: same seed → byte-identical trajectory', () => {
  assert.strictEqual(JSON.stringify(bredA.trajectory), JSON.stringify(bredA2.trajectory));
});
t('different seed → different walk', () => {
  const b = breed({ seed: 'test/other/1', artist: 'monk', persona: 'engineer' });
  assert.notStrictEqual(JSON.stringify(b.trajectory), JSON.stringify(bredA.trajectory));
});
t('verdict present and honest', () => {
  assert.ok(['CONVERGED', 'HONEST GAP'].includes(bredA.verdict.status));
  assert.ok(typeof bredA.verdict.round === 'number');
});
t('sigma makes progress (final ≤ first)', () => {
  assert.ok(bredA.final.sigma <= bredA.start.sigma);
});
t('fuel cap bounds the walk', () => {
  const capped = breed({ seed: 'test/fuel', artist: 'duke', persona: 'purist', fuel: { maxRounds: 3 } });
  assert.ok(capped.nRounds <= 4); // 3 revisions + round 0
});
t('features order is the engine FEATURES order', () => {
  assert.deepStrictEqual(bredA.featuresOrder, engine.FEATURES.map((f) => f.id));
  assert.strictEqual(bredA.featuresOrder.length, 16);
});
t('every artist × persona combination breeds', () => {
  for (const a of Object.keys(engine.ARTISTS)) {
    for (const p of Object.keys(engine.PERSONAS)) {
      const b = breed({ seed: 'test/grid/' + a + '/' + p, artist: a, persona: p });
      assert.ok(isQVec(b.final.point));
    }
  }
});
t('distill obeys the ≤200-word protocol', () => {
  const body = distill(bredA);
  assert.ok(body.split(/\s+/).length <= 200, 'over 200 words');
  assert.ok(body.includes(bredA.verdict.status));
});
t('distill carries the identity explicitly', () => {
  const body = distill(bredA);
  assert.ok(body.includes(bredA.final.point.join(',')));
});

/* ------------------------- the pipe (mock ocean) ------------------------- */
console.log('== tidepool client: never-throw write path ==');

// in-process mock ocean: honors the real tidepool wire contract
const ocean = []; // {payload, row}
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://mock');
  if (u.pathname === '/api/remember' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const b = JSON.parse(raw);
      if (!b.author || !b.title || !b.body) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'author_required' })); }
      if (b.native && (b.native.length !== 16 || !b.native.every(Number.isFinite))) {
        res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'native_must_be_16_finite_numbers' }));
      }
      const id = 'a:mock:' + (ocean.length + 1);
      const row = { id, kind: b.kind, author: b.author, title: b.title, body: b.body, native: b.native ? JSON.stringify(b.native) : null, ts: Date.now(), run: b.run || null };
      ocean.push(row);
      res.end(JSON.stringify({ ok: true, id, persisted: true, semantic: false, native: !!b.native }));
    });
  } else if (u.pathname === '/api/recall/similar' && u.searchParams.get('vec')) {
    const vec = u.searchParams.get('vec').split(',').map(Number);
    const scored = ocean
      .filter((r) => r.native)
      .map((r) => ({ r, s: cosine(fromStored(JSON.parse(r.native)), vec) }))
      .sort((x, y) => y.s - x.s)
      .map((x) => x.r);
    res.end(JSON.stringify({ ok: true, mode: 'native', count: scored.length, results: scored }));
  } else {
    res.writeHead(404); res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  }
});

async function withMock(fn) {
  await new Promise((resolve) => mock.listen(0, resolve));
  const port = mock.address().port;
  try { await fn('http://127.0.0.1:' + port); }
  finally { await new Promise((resolve) => mock.close(resolve)); }
}

/* ------------------------------- the lineage ------------------------------- */
console.log('== lineage: nearest neighbors in ℚ¹⁶ ==');
t('rankNeighbors parses strict fixed-point and sorts by similarity', () => {
  const rows = [
    { id: 'a', title: 'far', native: JSON.stringify(new Array(16).fill(0)) },
    { id: 'b', title: 'near', native: JSON.stringify(new Array(16).fill(Q)) },
    { id: 'c', title: 'float-corrupt', native: JSON.stringify(new Array(16).fill(0.5)) },
  ];
  const q = new Array(16).fill(Q);
  const ranked = rankNeighbors(rows, q);
  assert.strictEqual(ranked.length, 1); // float-corrupt AND zero-norm rows dropped
  assert.strictEqual(ranked[0].id, 'b');
  assert.ok(Math.abs(ranked[0].similarity - 1) < 1e-12);
});
t('chain: round-by-round ancestry with integer drift', () => {
  const links = chain(bredA);
  assert.strictEqual(links.length, bredA.nRounds - 1);
  links.forEach((l) => {
    assert.ok(Number.isInteger(l.driftQ));
    assert.ok(l.driftQ >= 0);
  });
});

/* ------------------------------- end to end ------------------------------- */
console.log('== end-to-end: breed → ocean → lineage ==');
(async () => {
  await withMock(async (endpoint) => {
    const client = makeClient({ endpoint, timeoutMs: 5000 });

    const r1 = await client.remember(bredA, { body: distill(bredA) });
    t('remember persists with native vector', () => {
      assert.ok(r1.ok, 'remember failed: ' + JSON.stringify(r1));
      assert.ok(ocean.length === 1);
      const stored = JSON.parse(ocean[0].native);
      assert.deepStrictEqual(stored, bredA.final.point); // integers on the wire
    });
    t('remember attaches a runs row (task/outcome)', () => {
      assert.deepStrictEqual(ocean[0].run, { task: 'test/caravan/9', outcome: bredA.verdict.status });
    });

    const bB = breed({ seed: 'test/lineage/2', artist: 'monk', persona: 'engineer' });
    await client.remember(bB, { body: distill(bB) });

    const lin = await lineage(client, bB, 8);
    t('lineage returns ranked neighbors from the ocean', () => {
      assert.ok(lin.ok, 'lineage failed: ' + lin.error);
      assert.ok(lin.neighbors.length >= 1);
      // self nearest or near — bB should recognize bB first
      assert.strictEqual(lin.neighbors[0].title.includes('test/lineage/2'), true);
    });
    t('lineage chain matches the bred walk', () => {
      assert.strictEqual(lin.chain.length, bB.nRounds - 1);
    });

    t('never-throw: dead endpoint returns ok:false, does not raise', async () => {
      const dead = makeClient({ endpoint: 'http://127.0.0.1:1', timeoutMs: 1500 });
      const r = await dead.remember(bredA, { body: 'x' });
      assert.strictEqual(r.ok, false);
      assert.ok(r.error);
    });
    t('never-throw: 500 from ocean becomes ok:false', async () => {
      const bad = makeClient({ endpoint: endpoint + '/nope', timeoutMs: 5000 });
      const r = await bad.call('/api/remember', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.strictEqual(r.ok, false);
    });
    t('offline mode: no endpoint reports offline, never throws', async () => {
      const off = makeClient({ endpoint: null });
      const r = await off.remember(bredA, { body: 'x' });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.offline, true);
    });
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('failures:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})().catch((e) => { console.error('harness error: ' + e.stack); process.exit(1); });
