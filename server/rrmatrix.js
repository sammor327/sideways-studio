// The matchup matrix from Rift Registry (2026-09-19): the panel's list of
// Rift Registry events and the load that tallies one into preview. What is
// read and how it is counted is in rrmatrix-model.js; this module fetches,
// caches and serves.
//
// Nothing is fetched until the operator opens the list or loads an event:
// the app works offline at a venue, and this is an extra. An export is large
// (Singapore's is 15 MB, 0.8 MB over the wire), so only its tally is kept,
// in memory, keyed by the event and the index's `generated` stamp for it, so
// loading the same event again is instant until Rift Registry republishes it.

import { applyUpdate } from './state.js';
import { listLegends } from './legends.js';
import { eventList, eventMatrixPatch } from './rrmatrix-model.js';

// SIDEWAYS_RR_URL points the loads at another copy of the site (a local
// build, a test server); the default is the live one.
const BASE = (process.env.SIDEWAYS_RR_URL || 'https://riftregistry.com').replace(/\/+$/, '');
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  referer: 'https://riftregistry.com/',
};
const TIMEOUT_MS = 45_000;
const INDEX_TTL_MS = 10 * 60_000;

let index = null;
let indexAt = 0;
const loads = new Map();

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new Error(`Could not reach Rift Registry (${err.name === 'TimeoutError' ? 'timed out' : err.message}).`);
  }
  if (res.status === 404) throw new Error('Rift Registry has no such event file.');
  if (!res.ok) throw new Error(`Rift Registry answered HTTP ${res.status}.`);
  try {
    return await res.json();
  } catch {
    throw new Error('Rift Registry sent something that is not JSON.');
  }
}

async function events({ refresh = false } = {}) {
  if (!index || refresh || Date.now() - indexAt > INDEX_TTL_MS) {
    index = eventList(await getJson(`${BASE}/data/events/_index.json`));
    indexAt = Date.now();
  }
  return index;
}

// Rift Registry names legends the way the card index it publishes does, so
// a legend matches the catalog by its name; one the catalog does not know
// keeps its name and draws without a picture.
function legendIndex() {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const by = new Map(listLegends().map((l) => [norm(l.name), l]));
  return (name) => {
    const l = by.get(norm(name));
    return l ? { legend: l.name, legendSlug: l.slug, legendCardId: l.cardId || '' } : { legend: String(name || '').slice(0, 60), legendSlug: '', legendCardId: '' };
  };
}

// One event's patch, from the cache while the index says the file has not
// changed. Two loads of the same event at once share one fetch.
async function eventPatch(id) {
  const list = await events();
  const entry = list.find((e) => e.id === id);
  if (!entry) throw new Error('That event is not on Rift Registry\'s list. Refresh the list and pick again.');
  const cached = loads.get(id);
  if (cached && cached.generated === entry.generated) return cached.out;
  const run = (async () => {
    const doc = await getJson(`${BASE}/data/events/${encodeURIComponent(id)}.json`);
    return eventMatrixPatch(doc, legendIndex());
  })();
  loads.set(id, { generated: entry.generated, out: run });
  try {
    const out = await run;
    if (out.error) loads.delete(id);
    return out;
  } catch (err) {
    loads.delete(id);
    throw err;
  }
}

export async function handleRrMatrix(req, res, url, { readBody, sendJson }) {
  if (!url.pathname.startsWith('/api/rr/')) return false;
  if (url.pathname === '/api/rr/events' && req.method === 'GET') {
    try {
      sendJson(res, 200, { ok: true, events: await events({ refresh: url.searchParams.get('refresh') === '1' }) });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message });
    }
    return true;
  }
  if (url.pathname === '/api/rr/matrix' && req.method === 'POST') {
    let body;
    try { body = JSON.parse((await readBody(req, 4096)).toString('utf8')) || {}; } catch { body = null; }
    const id = body && typeof body.event === 'string' ? body.event.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) { sendJson(res, 400, { ok: false, error: 'Pick a Rift Registry event first.' }); return true; }
    try {
      const out = await eventPatch(id);
      if (out.error) { sendJson(res, 400, { ok: false, error: out.error }); return true; }
      const { patch, ...detail } = out;
      const result = applyUpdate(patch);
      sendJson(res, result.ok ? 200 : 400, { ...detail, ok: result.ok, error: result.error });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: err.message });
    }
    return true;
  }
  sendJson(res, 404, { ok: false, error: 'not found' });
  return true;
}
