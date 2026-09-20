// lineage.js — nearest-neighbor lineage in ℚ¹⁶ + round-by-round ancestry.
'use strict';

const { fromStored, cosine, isQVec } = require('./q16');

// Re-rank tidepool's neighbors by EXACT integer cosine (float leaves no trace).
// tidepool rows carry `native` as a JSON string; we parse strictly (fixed-point).
function rankNeighbors(rows, qVec) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      let native = null;
      try {
        native = row.native ? fromStored(typeof row.native === 'string' ? JSON.parse(row.native) : row.native) : null;
      } catch { native = null; }
      return {
        id: row.id,
        kind: row.kind,
        author: row.author,
        title: row.title,
        ts: row.ts,
        native,
        similarity: native ? cosine(qVec, native) : null, // derived float, ranking only
      };
    })
    .filter((r) => r.native && r.similarity !== null)
    .sort((a, b) => b.similarity - a.similarity);
}

// The ancestry chain of one bred run: each round's point and its drift from
// the previous round. This is the trajectory the duke-lab worker discards.
function chain(bred) {
  if (!bred || !Array.isArray(bred.trajectory)) throw new Error('lineage: bad bred record');
  const links = [];
  for (let i = 1; i < bred.trajectory.length; i++) {
    const prev = bred.trajectory[i - 1].point;
    const cur = bred.trajectory[i].point;
    let drift = 0;
    for (let j = 0; j < 16; j++) drift += Math.abs(cur[j] - prev[j]);
    links.push({
      from: bred.trajectory[i - 1].round,
      to: bred.trajectory[i].round,
      driftQ: drift, // L1 distance in ℚ units (integer)
      sigmaDrop: bred.trajectory[i - 1].sigma - bred.trajectory[i].sigma,
    });
  }
  return links;
}

// Query the ocean for a point's lineage, then attach local ancestry.
async function lineage(client, bred, limit) {
  if (!isQVec(bred.final.point)) throw new Error('lineage: final point is not a ℚ identity');
  const res = await client.similar(bred.final.point, limit || 8);
  if (!res.ok) return { ok: false, error: res.error, neighbors: [], chain: chain(bred) };
  return {
    ok: true,
    neighbors: rankNeighbors(res.results, bred.final.point),
    chain: chain(bred),
    query: bred.final.point,
  };
}

module.exports = { rankNeighbors, chain, lineage };
