// The Tournament platform tab's connection to TopDeck.gg (2026-09-18, Sam:
// "include a match selection menu for the user to choose a match and
// instantly populate all relevant information"). What is read and why is in
// platform-model.js; this module fetches, caches, refreshes and serves.
//
// The event, the API key and the auto-refresh switch live in
// data/platform.json. The key never leaves this process: it is not in the
// bussed state every browser source receives, and the panel only ever sees
// its last four characters.
//
// With a key the official API carries everything, and the public page data
// is read only until it yields the group split (it is written once, when the
// event starts). Without a key, or if the API fails mid-show, the page data
// carries everything; the two were identical on Convergence #2.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './runtime.js';
import { applyUpdate, applyFeed, getState } from './state.js';
import { listLegends } from './legends.js';
import { buildDeck } from './decklist.js';
import {
  parseEventId, decodeFirestore, buildFromFeed, feedExtras, buildFromApi, summarize,
  standingsPatch, bracketPatch, matchPatch, upNextPatch, legendStatsPatch, pairingsPatch, pairingsRefresh, normName,
} from './platform-model.js';

const FILE = path.join(DATA_DIR, 'platform.json');
const API = 'https://topdeck.gg/api/v2/tournaments/';
const SITE = 'https://topdeck.gg';
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/eminence-1b40b/databases/(default)/documents/tournaments/';
// TopDeck allows 100 API requests a minute; a refresh is three.
const AUTO_MS = 30_000;
const MIN_GAP_MS = 4_000;
const TIMEOUT_MS = 20_000;

// follow: every refresh rereads the pairings each bank holds from this event
// (followPairings), so the pairings and the ongoing matches keep up on air.
let config = { event: '', key: '', auto: true, follow: true };
let status = { state: 'idle', error: '', warning: '', fetchedAt: 0, version: 0, source: '' };
let model = null;
let summary = null;
let extras = null;
let firebaseKey = '';
let inflight = null;
let lastRun = 0;
let saveChain = Promise.resolve();

class TopDeckError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function getJson(url, headers = {}) {
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new TopDeckError(`Could not reach TopDeck (${err.name === 'TimeoutError' ? 'timed out' : err.message}).`, 0);
  }
  if (!res.ok) {
    const code = res.status;
    const msg = code === 401 ? 'TopDeck did not accept the API key.'
      : code === 403 ? 'TopDeck keeps this event private.'
        : code === 404 ? `TopDeck has no event called "${config.event}".`
          : code === 429 ? 'TopDeck asked for a pause (too many requests); the next refresh tries again.'
            : `TopDeck answered HTTP ${code}.`;
    throw new TopDeckError(msg, code);
  }
  return res.json();
}

async function fetchApi(tid, key) {
  const h = { Authorization: key };
  const base = API + encodeURIComponent(tid);
  const [info, standings, rounds] = await Promise.all([getJson(`${base}/info`, h), getJson(`${base}/standings`, h), getJson(`${base}/rounds`, h)]);
  return { info, standings, rounds };
}

// The page's own web key, read from the page's script rather than kept here.
async function fetchPage(tid) {
  if (!firebaseKey) {
    let js = '';
    try {
      js = await (await fetch(`${SITE}/js/firebase-init.js`, { signal: AbortSignal.timeout(TIMEOUT_MS) })).text();
    } catch (err) {
      throw new TopDeckError(`Could not reach TopDeck (${err.message}).`, 0);
    }
    const m = js.match(/apiKey:\s*"([^"]+)"/);
    if (!m) throw new TopDeckError('TopDeck changed its page; the public page data cannot be read.', 0);
    firebaseKey = m[1];
  }
  const [doc, players] = await Promise.all([
    getJson(`${FIRESTORE}${encodeURIComponent(tid)}?key=${firebaseKey}`),
    getJson(`${SITE}/PublicPData/${encodeURIComponent(tid)}`),
  ]);
  return buildFromFeed({ doc: decodeFirestore(doc), players });
}

function legendIndex() {
  const by = new Map(listLegends().map((l) => [normName(l.name), l]));
  return (leader) => {
    // Two-legend decks come through as "A / B"; the first names the deck.
    const first = String(leader || '').split(' / ')[0].trim();
    const l = first && by.get(normName(first));
    return l ? { legend: l.name, legendSlug: l.slug, legendCardId: l.cardId || '' } : { legend: first.slice(0, 60), legendSlug: '', legendCardId: '' };
  };
}

export async function refreshPlatform({ force = false } = {}) {
  if (!config.event) return status;
  if (inflight) return inflight;
  if (!force && Date.now() - lastRun < MIN_GAP_MS) return status;
  lastRun = Date.now();
  inflight = (async () => {
    const tid = config.event;
    status = { ...status, state: 'loading' };
    let page = null;
    let pageError = null;
    const readPage = async () => {
      try {
        page = await fetchPage(tid);
        extras = { event: tid, ...feedExtras(page) };
      } catch (err) {
        pageError = err;
      }
    };
    try {
      let ev = null;
      let warning = '';
      if (!config.key || !extras || extras.event !== tid || !extras.groupOf.size) await readPage();
      if (config.key) {
        try {
          ev = buildFromApi(await fetchApi(tid, config.key), extras && extras.event === tid ? extras : {});
        } catch (err) {
          if (!page) await readPage();
          if (!page) throw err;
          ev = page;
          warning = `${err.message} Showing TopDeck's public page data instead.`;
        }
      } else {
        if (!page) throw pageError || new TopDeckError('Could not read the event.', 0);
        ev = page;
      }
      if (!warning && page === null && pageError && !(extras && extras.groupOf.size) && ev.swiss) {
        warning = 'Groups could not be read from TopDeck\'s page; standings cover the whole event.';
      }
      model = ev;
      summary = summarize(ev, legendIndex());
      status = { state: 'ok', error: '', warning, fetchedAt: Date.now(), version: status.version + 1, source: ev.source };
      followPairings();
    } catch (err) {
      status = { ...status, state: 'error', error: err.message || String(err), version: status.version + 1 };
    } finally {
      inflight = null;
    }
    return status;
  })();
  return inflight;
}

// After every refresh: each bank that holds pairings loaded from this event
// gets that round's fresh results, on air too (2026-09-19, the ongoing
// matches: a table that finishes leaves the board without a TAKE). A feed
// like the clock: it changes only the tables, never what is up or which
// round is loaded, so preview and program each keep their own round.
function followPairings() {
  if (!config.follow || !model) return;
  const legendOf = legendIndex();
  const state = getState();
  const patches = {};
  for (const name of ['preview', 'program']) {
    const patch = pairingsRefresh(model, legendOf, { id: config.event, bank: state[name] });
    if (patch) patches[name] = patch;
  }
  if (Object.keys(patches).length) applyFeed(patches);
}

function publicState() {
  return {
    config: {
      event: config.event, hasKey: Boolean(config.key), keyHint: config.key ? config.key.slice(-4) : '',
      auto: config.auto, follow: config.follow,
    },
    status,
    name: summary ? summary.name : '',
  };
}

async function save() {
  saveChain = saveChain.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(config, null, 2));
    await rename(tmp, FILE);
  }).catch(() => { /* the next save tries again */ });
  return saveChain;
}

export async function initPlatform() {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8'));
    config = {
      event: parseEventId(raw.event),
      key: typeof raw.key === 'string' ? raw.key.trim().slice(0, 100) : '',
      auto: raw.auto !== false,
      follow: raw.follow !== false,
    };
  } catch {
    // First run: nothing connected.
  }
  setInterval(() => {
    if (config.auto && config.event) refreshPlatform();
  }, AUTO_MS).unref();
  if (config.event) refreshPlatform({ force: true });
}

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

// Routes under /api/platform. Returns true when it answered.
export async function handlePlatform(req, res, url, { readBody, sendJson }) {
  if (url.pathname !== '/api/platform' && !url.pathname.startsWith('/api/platform/')) return false;
  const p = url.pathname;
  const body = async () => {
    try { return JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')) || {}; } catch { return null; }
  };

  if (p === '/api/platform' && req.method === 'GET') {
    sendJson(res, 200, publicState());
    return true;
  }
  if (p === '/api/platform/data' && req.method === 'GET') {
    sendJson(res, 200, { ...publicState(), summary });
    return true;
  }
  if (p === '/api/platform/config' && req.method === 'POST') {
    const b = await body();
    if (!b) { sendJson(res, 400, { ok: false, error: 'invalid JSON' }); return true; }
    let reconnect = false;
    if (b.event !== undefined) {
      const id = parseEventId(b.event);
      if (b.event && !id) { sendJson(res, 400, { ok: false, error: 'That does not look like a TopDeck event link or id.' }); return true; }
      if (id !== config.event) { reconnect = true; model = null; summary = null; extras = null; }
      config.event = id;
      if (!id) status = { state: 'idle', error: '', warning: '', fetchedAt: 0, version: status.version + 1, source: '' };
    }
    if (b.key !== undefined) {
      const key = String(b.key).trim();
      if (key && !KEY_RE.test(key)) { sendJson(res, 400, { ok: false, error: 'That does not look like a TopDeck API key.' }); return true; }
      if (key !== config.key) reconnect = true;
      config.key = key;
    }
    if (b.auto !== undefined) config.auto = Boolean(b.auto);
    if (b.follow !== undefined) config.follow = Boolean(b.follow);
    await save();
    if (reconnect && config.event) await refreshPlatform({ force: true });
    else if (b.follow) followPairings();
    sendJson(res, 200, { ok: true, ...publicState() });
    return true;
  }
  if (p === '/api/platform/refresh' && req.method === 'POST') {
    if (!config.event) { sendJson(res, 409, { ok: false, error: 'Connect an event first.' }); return true; }
    await refreshPlatform({ force: true });
    sendJson(res, 200, { ok: status.state === 'ok', ...publicState() });
    return true;
  }
  if (p === '/api/platform/load' && req.method === 'POST') {
    const b = await body();
    if (!b) { sendJson(res, 400, { ok: false, error: 'invalid JSON' }); return true; }
    if (!model) { sendJson(res, 409, { ok: false, error: 'No event data yet: connect an event, then refresh.' }); return true; }
    const legendOf = legendIndex();
    const bank = getState().preview;
    let out;
    if (b.kind === 'match') {
      out = matchPatch(model, legendOf, { round: b.round, table: b.table, swap: Boolean(b.swap), bank, deckOf: (text) => buildDeck(text) });
    } else if (b.kind === 'standings') {
      const cut = [0, 4, 8, 16, 32].includes(Number(b.cut)) ? Number(b.cut) : 4;
      const group = b.group === 'all' ? 'all' : Math.max(0, Math.min(16, Math.trunc(Number(b.group) || 0)));
      out = standingsPatch(model, legendOf, { group, cut, bank });
    } else if (b.kind === 'bracket') {
      out = bracketPatch(model, legendOf);
    } else if (b.kind === 'legends') {
      out = legendStatsPatch(model, legendOf, { group: Math.max(0, Math.min(16, Math.trunc(Number(b.group) || 0))) });
    } else if (b.kind === 'upnext') {
      out = upNextPatch(model, legendOf, { round: b.round, table: b.table, bank });
    } else if (b.kind === 'upnext-clear') {
      out = { patch: { event: { tables: [] } } };
    } else if (b.kind === 'pairings') {
      out = pairingsPatch(model, legendOf, { round: b.round, group: Math.max(0, Math.min(16, Math.trunc(Number(b.group) || 0))), bank, id: config.event });
    } else {
      sendJson(res, 400, { ok: false, error: 'unknown kind' });
      return true;
    }
    if (out.error) { sendJson(res, 400, { ok: false, error: out.error }); return true; }
    const { patch, ...detail } = out;
    const result = applyUpdate(patch);
    sendJson(res, result.ok ? 200 : 400, { ...detail, ok: result.ok, error: result.error });
    return true;
  }
  sendJson(res, 404, { ok: false, error: 'not found' });
  return true;
}
