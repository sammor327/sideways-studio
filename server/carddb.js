// Card database: index + art cache pulled from Rift Registry public surfaces.
// We distribute code, not Riot's assets: everything downloads onto the user's
// machine on demand (SPEC "Card and legend data"). The photo./art. subdomains
// 403 non-browser user agents (broadcast-line-handoff §2), so every fetch
// sends a browser UA + Referer. The local server is the proxy, which also
// makes all art same-origin for the scenes.
import { mkdir, readFile, writeFile, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './runtime.js';

const DB_DIR = path.join(DATA_DIR, 'carddb');
const INDEX_FILE = path.join(DB_DIR, 'cards.json');
const TIER_DIR = {
  thumb: path.join(DB_DIR, 'thumb'),
  full: path.join(DB_DIR, 'full'),
};

const RR_ORIGIN = 'https://riftregistry.com';
const FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  referer: 'https://riftregistry.com/',
};

let cards = [];
const byId = new Map();
let lastSync = null;

// Art cache counts are tracked in memory so the status endpoint can be polled
// cheaply during a sync; seeded from disk once at startup.
const cached = { thumb: new Set(), full: new Set() };

// One shared progress object; the panel polls /api/cards/status while active.
// lastError survives past the run so the panel can say why a download failed.
const progress = { phase: 'idle', done: 0, total: 0, errors: 0, lastError: null };

function normalize(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '');
}

function indexCards(list) {
  // A few uncovered token entries ship with cardId null; without an id a card
  // cannot be staged, cached, or aired, so they are dropped at the door.
  cards = list.filter((c) => typeof c.cardId === 'string' && /^[A-Za-z0-9-]{1,16}$/.test(c.cardId));
  byId.clear();
  for (const c of cards) byId.set(c.cardId, c);
}

export async function initCardDb() {
  for (const dir of Object.values(TIER_DIR)) await mkdir(dir, { recursive: true });
  try {
    indexCards(JSON.parse(await readFile(INDEX_FILE, 'utf8')));
  } catch {
    // No index yet: first-run state, the panel offers the download.
  }
  for (const tier of ['thumb', 'full']) {
    try {
      for (const f of await readdir(TIER_DIR[tier])) {
        if (f.endsWith('.webp')) cached[tier].add(f.slice(0, -5));
      }
    } catch { /* dir just created */ }
  }
}

export function allCards() {
  return cards;
}

export function cardDbStatus() {
  return {
    indexed: cards.length > 0,
    cardCount: cards.length,
    thumbsCached: cached.thumb.size,
    fullCached: cached.full.size,
    lastSync,
    progress,
  };
}

async function rrFetch(url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

// Only Rift Registry origins are fetched: uncovered cards carry TCGPlayer
// hotlinks that 403 server-side fetches anyway, and RR is the sanctioned
// surface (SPEC). No source means the scenes' placeholder chain takes over.
function allowRrUrl(u) {
  return typeof u === 'string'
    && (u.startsWith('https://riftregistry.com/') || u.startsWith('https://art.riftregistry.com/'))
    ? u : null;
}

function artSourceUrl(card, tier) {
  if (tier === 'full') return allowRrUrl(card.imageUrlFull);
  const u = card.imageUrl;
  if (typeof u === 'string' && u.startsWith('/')) return RR_ORIGIN + u;
  return allowRrUrl(u);
}

async function downloadArt(card, tier) {
  const src = artSourceUrl(card, tier);
  if (!src) throw new Error('no source url');
  const buf = await rrFetch(src, 20_000);
  // Write via temp + rename so a crashed download never leaves a truncated
  // file that would then be served forever as "cached".
  const dest = path.join(TIER_DIR[tier], `${card.cardId}.webp`);
  const tmp = dest + '.part';
  await writeFile(tmp, buf);
  await rename(tmp, dest);
  cached[tier].add(card.cardId);
  return dest;
}

async function prefetchTier(tier, phase) {
  const missing = cards.filter((c) => !cached[tier].has(c.cardId) && artSourceUrl(c, tier));
  progress.phase = phase;
  progress.done = 0;
  progress.total = missing.length;
  progress.errors = 0;
  const queue = [...missing];
  const workers = Array.from({ length: 6 }, async () => {
    for (let card = queue.shift(); card; card = queue.shift()) {
      try {
        await downloadArt(card, tier);
      } catch {
        progress.errors += 1;
      }
      progress.done += 1;
    }
  });
  await Promise.all(workers);
}

// First-run download and "check for new sets" are the same operation: refresh
// the index, then fill in whatever thumbs are missing (Sam's call, Loop 1:
// thumbs up front, full art lazy plus an explicit offline prefetch).
export async function syncCardDb() {
  if (progress.phase !== 'idle') return { ok: false, error: 'sync already running' };
  progress.phase = 'index';
  progress.done = 0;
  progress.total = 1;
  progress.errors = 0;
  progress.lastError = null;
  try {
    const buf = await rrFetch(`${RR_ORIGIN}/data/cards.json`, 30_000);
    const list = JSON.parse(buf.toString('utf8'));
    if (!Array.isArray(list) || !list.length || !list[0].cardId) throw new Error('unexpected index shape');
    await mkdir(DB_DIR, { recursive: true });
    await writeFile(INDEX_FILE, buf);
    indexCards(list);
    progress.done = 1;
    await prefetchTier('thumb', 'thumbs');
    lastSync = new Date().toISOString();
    return { ok: true, cardCount: cards.length, errors: progress.errors };
  } catch (err) {
    progress.lastError = err.message;
    return { ok: false, error: err.message };
  } finally {
    progress.phase = 'idle';
  }
}

// "Download everything for offline": every card's full art onto disk.
export async function prefetchFullArt() {
  if (progress.phase !== 'idle') return { ok: false, error: 'sync already running' };
  if (!cards.length) return { ok: false, error: 'download the card database first' };
  progress.lastError = null;
  try {
    await prefetchTier('full', 'full');
    return { ok: true, errors: progress.errors };
  } finally {
    progress.phase = 'idle';
  }
}

// Ranked name search for the operator: prefix beats word-prefix beats
// substring; ties break alphabetically. Returns the fields the panel needs.
export function searchCards(query, limit = 12) {
  const q = normalize(query).trim();
  if (!q || !cards.length) return [];
  const scored = [];
  for (const c of cards) {
    const name = normalize(c.cardName);
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.includes(' ' + q)) score = 1;
    else if (name.includes(q)) score = 2;
    if (score >= 0) scored.push([score, c]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].cardName.localeCompare(b[1].cardName));
  return scored.slice(0, limit).map(([, c]) => ({
    cardId: c.cardId,
    cardName: c.cardName,
    cardType: c.type || '',
    domains: c.domains || [],
    energy: c.energy,
  }));
}

// Serve art from cache, fetching lazily on a miss (full art especially: only
// index + thumbs are prefetched). Unknown ids resolve to null so the route
// 404s: card ids never reach the filesystem unvalidated.
export async function getArtFile(tier, cardId) {
  if (!TIER_DIR[tier]) return null;
  const card = byId.get(cardId);
  if (!card) return null;
  const file = path.join(TIER_DIR[tier], `${card.cardId}.webp`);
  if (cached[tier].has(card.cardId)) return file;
  try {
    return await downloadArt(card, tier);
  } catch {
    return null;
  }
}
