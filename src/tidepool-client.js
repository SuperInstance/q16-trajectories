// tidepool-client.js — the pipe into the ocean. NEVER THROWS on the write path.
// fleet doctrine: degrade honest, never 502. Absence is information.
'use strict';

const { toWire } = require('./q16');

function makeClient(opts) {
  const {
    endpoint = null,      // e.g. https://tidepool.<sub>.workers.dev
    fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
    timeoutMs = 8000,
    author = 'q16-trajectories',
  } = opts || {};

  async function call(pathname, init) {
    if (!endpoint || !fetchImpl) {
      return { ok: false, error: 'no_endpoint', offline: true, persisted: false };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(endpoint + pathname, { ...init, signal: ctrl.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, status: res.status, error: data?.error || ('http_' + res.status), persisted: false };
      return { ok: true, status: res.status, ...data };
    } catch (e) {
      return { ok: false, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e), persisted: false };
    } finally {
      clearTimeout(timer);
    }
  }

  // Write a bred argument into the ocean: artifact (musician) + runs row.
  async function remember(bred, extra) {
    const body = (extra && extra.body) || '';
    const title = `breed ${bred.seed} — ${bred.artist} × ${bred.persona} → ${bred.verdict.status}`;
    const payload = {
      kind: 'musician',
      author,
      repo: 'SuperInstance/q16-trajectories',
      title: title.slice(0, 120),
      body,
      native: toWire(bred.final.point),
      run: { task: String(bred.seed).slice(0, 200), outcome: bred.verdict.status },
    };
    return call('/api/remember', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // Nearest neighbors in ℚ¹⁶ (native index).
  async function similar(qVec, limit) {
    const vec = toWire(qVec).join(',');
    const lim = limit ? ('&limit=' + encodeURIComponent(limit)) : '';
    return call('/api/recall/similar?vec=' + vec + lim);
  }

  return { endpoint, remember, similar, call };
}

module.exports = { makeClient };
