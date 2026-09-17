// Card database: index + art cache pulled from Rift Registry public surfaces.
// We distribute code, not Riot's assets: everything downloads onto the user's
// machine on demand (SPEC "Card and legend data"). The photo./art. subdomains
// 403 non-browser user agents (broadcast-line-handoff §2), so every fetch
// sends a browser UA + Referer. The local server is the proxy, which also
// makes all art same-origin for the scenes.
//
// Nothing here touches the disk directly: cardstore.js owns the on-disk form,
// which is encrypted, so an install is not a free copy of the database for
// whoever runs it. Read that file's header for what that is and is not worth.
import {
  initStore, readIndex, writeIndex, indexWrittenAt, readBlob, writeBlob,
  storedIds, migrateIndex, migrateArt, legacyArtPending,
} from './cardstore.js';
import {
  initLibrary, bundledIndex, bundledIndexBuiltAt, libraryArt, libraryIds,
  libraryStatus, fetchFullPack, hasFullPack,
} from './cardlibrary.js';

const TIERS = ['thumb', 'full'];

const RR_ORIGIN = 'https://riftregistry.com';
const FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  referer: 'https://riftregistry.com/',
};

let cards = [];
const byId = new Map();
let lastSync = null;
// True when the card list in memory is the one baked into this build rather
// than one this machine downloaded. The panel says so, because "checked today"
// would be a lie about a list that only moves when the app updates.
let fromBundledIndex = false;
// When the index file on disk was last written: the age the auto-refresh
// and the panel reason about. Survives restarts, unlike lastSync.
let indexUpdatedAt = null;

// Art cache counts are tracked in memory so the status endpoint can be polled
// cheaply during a sync; seeded from disk once at startup.
const cached = { thumb: new Set(), full: new Set() };
// How many cards have art to fetch at all, per tier: the number "saved" is
// measured against. Two SFD tokens carry only TCGPlayer hotlinks, so it is
// 932 against 934 cards, and the panel would otherwise read that as two
// files that never download.
const available = { thumb: 0, full: 0 };

// One shared progress object; the panel polls /api/cards/status while active.
// lastError survives past the run so the panel can say why a download failed.
const progress = { phase: 'idle', done: 0, total: 0, errors: 0, lastError: null };

// The one-off re-encryption of art an older build left in the clear, tracked
// on its own rather than in a slot of `progress`: the launch refresh and this
// can both be running on the same launch, and neither should hold up or
// silently cancel the other.
const migration = { active: false, done: 0, total: 0, errors: 0 };

function normalize(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '');
}

function indexCards(list) {
  // A few uncovered token entries ship with cardId null; without an id a card
  // cannot be staged, cached, or aired, so they are dropped at the door.
  cards = list.filter((c) => typeof c.cardId === 'string' && /^[A-Za-z0-9-]{1,16}$/.test(c.cardId));
  byId.clear();
  for (const c of cards) byId.set(c.cardId, c);
  Object.assign(available, artAvailability(cards));
}

// Cards with a fetchable source per tier, counted once per index.
export function artAvailability(list) {
  const out = {};
  for (const tier of TIERS) out[tier] = list.filter((c) => artSourceUrl(c, tier)).length;
  return out;
}

export async function initCardDb() {
  await initStore();
  await initLibrary();
  // An install from a build before the store existed has a plaintext
  // cards.json. Move it in rather than making the operator download the index
  // again because the format changed under them.
  let raw = (await readIndex()) || (await migrateIndex());
  let writtenAt = raw ? await indexWrittenAt() : null;
  // Whichever list is newer wins. For everyone who cannot reach Rift Registry
  // that is always the one baked into the build, and it is how a new set
  // reaches them at all: it arrives with the app update. For the one operator
  // who can, a list they synced after this build was baked stays theirs.
  const bakedAt = bundledIndexBuiltAt();
  if (!raw || (bakedAt && writtenAt && Date.parse(bakedAt) > Date.parse(writtenAt))) {
    const baked = await bundledIndex();
    if (baked) {
      raw = baked;
      writtenAt = bakedAt;
      fromBundledIndex = true;
    }
  }
  if (raw) {
    try {
      indexCards(JSON.parse(raw.toString('utf8')));
      indexUpdatedAt = writtenAt;
    } catch {
      // Unreadable index: same as not having one. The panel offers the
      // download and the sync writes over it.
    }
  }
  const ids = cards.map((c) => c.cardId);
  for (const tier of TIERS) {
    for (const id of await storedIds(tier, ids)) cached[tier].add(id);
    // Art the build carries counts as saved: it is on this machine, it works
    // offline, and the panel must never offer to download it again.
    for (const id of libraryIds(tier, ids)) cached[tier].add(id);
  }
}

// The art an older build left in the clear, sealed and the originals removed.
// Runs in the background once the server is up: it is ~90 MB on a filled-in
// install, and holding the graphics up for it would be the wrong trade at a
// venue. Reads fall through to the plaintext copy until each file has moved,
// so nothing goes missing while this runs.
export function migrateLegacyArt() {
  if (!legacyArtPending() || migration.active) return false;
  migration.active = true;
  migration.done = 0;
  migration.total = 0;
  migration.errors = 0;
  migrateArt((done, total) => {
    migration.done = done;
    migration.total = total;
  }).then(({ moved, failed }) => {
    migration.errors = failed;
    console.log(`  Card art store: ${moved} files encrypted.`);
    if (failed) console.log(`  ${failed} could not be, and stay as they are; the next launch retries them.`);
  }).catch((err) => {
    console.warn('  Could not encrypt the card art already on disk:', err.message);
  }).finally(() => {
    migration.active = false;
  });
  return true;
}

export function allCards() {
  return cards;
}

// One question for every caller that must not start a second download on top
// of a first: the per-card runs and the pack fetch are tracked separately, and
// either one busy means busy.
export function cardDbBusy() {
  return progress.phase !== 'idle' || libraryStatus().fetch.phase !== 'idle';
}

export function cardDbStatus() {
  return {
    indexed: cards.length > 0,
    cardCount: cards.length,
    thumbsCached: cached.thumb.size,
    fullCached: cached.full.size,
    thumbsAvailable: available.thumb,
    fullAvailable: available.full,
    lastSync,
    indexUpdatedAt,
    fromBundledIndex,
    progress,
    migration,
    library: libraryStatus(),
  };
}

// A new set reaches Rift Registry's index without anyone pressing "Check for
// new sets", and an install that never presses it stays on the set list from
// its first download (a packaged copy sat on 767 cards with no Vendetta
// while the live index had 936). So: once the index exists, refresh it on
// launch when it is more than a day old, in the background, silently when
// offline. The first download stays the operator's call: it is the big one.
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
export function autoRefreshCardDb() {
  if (!cards.length || !indexUpdatedAt) return false;
  if (Date.now() - Date.parse(indexUpdatedAt) < REFRESH_AFTER_MS) return false;
  syncCardDb().then((r) => {
    if (r.ok) console.log(`  Card database refreshed: ${r.cardCount} cards.`);
  }).catch(() => { /* offline at the venue: the index we have still works */ });
  return true;
}

async function rrFetchWithType(url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { buf: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}
const rrFetch = async (url, timeoutMs) => (await rrFetchWithType(url, timeoutMs)).buf;

// What came back for the card index, before it is trusted as JSON. A host
// in trouble (a maintenance page, a bot check, a captive portal on the venue
// wifi) answers HTTP 200 with an HTML page, and JSON.parse on that surfaced
// as "Unexpected token '<', "<!DOCTYPE"... Is the internet up?" while the
// internet was up (Sam, 2026-09-16). Returns the problem in plain words, or
// null when the body reads as JSON. Exported for the tests.
export function indexBodyProblem(buf, contentType = '') {
  const head = buf.subarray(0, 512).toString('utf8').replace(/^﻿/, '').trimStart();
  const type = String(contentType || '').toLowerCase();
  if (head.startsWith('[') || head.startsWith('{')) return null;
  if (/^<!doctype|^<html|^<\?xml|^</i.test(head) || type.includes('text/html')) {
    return 'Rift Registry answered with a web page instead of the card list (the site may be busy, under maintenance, or this network is showing a sign-in page); try again in a minute';
  }
  if (!head) return 'Rift Registry answered with an empty card list';
  return `Rift Registry answered with something other than the card list (${type || 'unknown content type'})`;
}

// The index, checked before it is parsed. A page instead of the list gets
// one more try after a pause, since a busy host or a bot check often clears
// on the second request; the same answer twice is reported as it is.
async function fetchIndex() {
  let problem = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 2500));
    const { buf, contentType } = await rrFetchWithType(`${RR_ORIGIN}/data/cards.json`, 30_000);
    problem = indexBodyProblem(buf, contentType);
    if (!problem) return buf;
  }
  throw new Error(problem);
}

// Only Rift Registry origins are fetched: uncovered cards carry TCGPlayer
// hotlinks that 403 server-side fetches anyway, and RR is the sanctioned
// surface (SPEC). No source means the scenes' placeholder chain takes over.
function allowRrUrl(u) {
  return typeof u === 'string'
    && (u.startsWith('https://riftregistry.com/') || u.startsWith('https://art.riftregistry.com/'))
    ? u : null;
}

export function artSourceUrl(card, tier) {
  if (tier === 'full') return allowRrUrl(card.imageUrlFull);
  const u = card.imageUrl;
  if (typeof u === 'string' && u.startsWith('/')) return RR_ORIGIN + u;
  return allowRrUrl(u);
}

// One download per file at a time: the decklist warms art in the background
// while a scene may be asking for the same card, and two writers sharing one
// .part file could leave a corrupt image behind.
const inflight = new Map();

function downloadArt(card, tier) {
  const key = `${tier}/${card.cardId}`;
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const src = artSourceUrl(card, tier);
    if (!src) throw new Error('no source url');
    const buf = await rrFetch(src, 20_000);
    // Sealed and written atomically by the store, so a crashed download never
    // leaves a truncated file that would then be served forever as "cached".
    await writeBlob(tier, card.cardId, buf);
    cached[tier].add(card.cardId);
    return buf;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

// Background fetch of full art for cards about to be shown (a pasted
// decklist), a few at a time so a 40-card paste does not open 40 sockets.
// Failures are silent: the scene's fallback chain still renders the card.
const warmQueue = [];
let warmActive = 0;
export function warmFullArt(cardIds) {
  for (const id of cardIds) {
    const card = byId.get(id);
    if (!card || cached.full.has(id) || inflight.has(`full/${id}`) || warmQueue.includes(id)) continue;
    if (!artSourceUrl(card, 'full')) continue;
    warmQueue.push(id);
  }
  while (warmActive < 4 && warmQueue.length) {
    const card = byId.get(warmQueue.shift());
    if (!card || cached.full.has(card.cardId)) continue;
    warmActive += 1;
    downloadArt(card, 'full')
      .catch(() => {})
      .finally(() => { warmActive -= 1; warmFullArt([]); });
  }
}

// What a prefetch of this tier would fetch: every card with a source that
// is not on disk yet.
const missingArt = (tier) => cards.filter((c) => !cached[tier].has(c.cardId) && artSourceUrl(c, tier));

// True when the offline button has nothing left to fetch. The route answers
// with that instead of starting a run, because a run over nothing shows an
// empty progress bar for one poll and ends with no visible change, which an
// operator reads as the button being broken (Sam, 2026-09-16).
export function fullArtComplete() {
  return cards.length > 0 && missingArt('full').length === 0;
}

async function prefetchTier(tier, phase) {
  const missing = missingArt(tier);
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
    const buf = await fetchIndex();
    let list;
    try {
      list = JSON.parse(buf.toString('utf8'));
    } catch {
      throw new Error('the card list from Rift Registry could not be read (it was cut short or malformed); try again in a minute');
    }
    if (!Array.isArray(list) || !list.length || !list[0].cardId) throw new Error('the card list from Rift Registry is not in the shape this app expects');
    await writeIndex(buf);
    indexCards(list);
    indexUpdatedAt = new Date().toISOString();
    fromBundledIndex = false;
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

// "Download everything for offline". Two ways to get there, tried in the
// order that works for the most people: the published pack, which is one
// request to GitHub and the only route open to anyone who cannot reach Rift
// Registry, then card by card from Rift Registry for the operator who can and
// who wants art newer than the last bake.
export async function fillFullArt() {
  if (!cards.length) return { ok: false, error: 'download the card database first' };
  if (cardDbBusy()) return { ok: false, error: 'a download is already running' };
  if (!hasFullPack()) {
    const pack = await fetchFullPack();
    if (pack.ok) {
      for (const id of libraryIds('full', cards.map((c) => c.cardId))) cached.full.add(id);
      return { ok: true, source: 'pack', cards: pack.cards };
    }
    // No pack to be had: that is normal running from source, and it is what an
    // operator with a card the build predates sees too. Rift Registry is the
    // other way, and it works for exactly one person.
    if (missingArt('full').length === 0) return { ok: true, source: 'pack', already: true };
    const direct = await prefetchFullArt();
    if (direct.ok) return { ok: true, source: 'rift-registry', errors: direct.errors };
    return { ok: false, error: `${pack.error}, and fetching the art card by card failed too (${direct.error})` };
  }
  const direct = await prefetchFullArt();
  return direct.ok ? { ok: true, source: 'rift-registry', errors: direct.errors } : direct;
}

// Every card's full art onto disk, one request per card, from Rift Registry.
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
// What a card can do, read off its rules text and type: every Reaction's
// text opens with [REACTION] and every Action's with [ACTION]; the rest is
// the card type. The hand overlays badge cards with it.
export function cardKind(c) {
  if (!c) return '';
  const text = String(c.text || '');
  if (/\[REACTION\]/i.test(text)) return 'reaction';
  if (/\[ACTION\]/i.test(text)) return 'action';
  const type = String(c.type || '');
  if (type === 'Champion Unit') return 'champion';
  if (type.includes('Unit')) return 'unit';
  if (type.includes('Gear')) return 'gear';
  if (type.includes('Spell')) return 'spell';
  return '';
}

export function kindOf(cardId) {
  return cardKind(byId.get(cardId));
}

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
    kind: cardKind(c),
  }));
}

// Art bytes for the route, from the store on a hit and fetched lazily on a
// miss (full art especially: only index + thumbs are prefetched). Unknown ids
// resolve to null so the route 404s, and an id never reaches the filesystem:
// it is hashed into a blob name, so there is nothing there to traverse with.
export async function getArtBytes(tier, cardId) {
  if (!TIERS.includes(tier)) return null;
  const card = byId.get(cardId);
  if (!card) return null;
  if (cached[tier].has(card.cardId)) {
    const buf = await readBlob(tier, card.cardId);
    if (buf) return buf;
    // Not in this machine's own cache: the build's library is the other place
    // it can be, and for everyone who cannot reach Rift Registry it is the
    // only one.
    const packed = await libraryArt(tier, card.cardId);
    if (packed) return packed;
    // Counted as cached but in neither place: a blob from a build with a
    // different key, or one that lost its bytes. Drop the claim and fetch it.
    cached[tier].delete(card.cardId);
  }
  try {
    return await downloadArt(card, tier);
  } catch {
    return null;
  }
}
