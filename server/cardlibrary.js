// The card library that ships with the app, in two pieces.
//
// Rift Registry is private and is staying private, so for everyone except its
// operator "Download card database" answers with a sign-in page and the app
// has no cards at all (Sam, 2026-09-17). The library therefore travels with
// the build, baked by scripts/bake-cardpack.mjs on a machine that does have
// access and sealed with the build key (server/cardpack.js):
//
//   bundle pack  index + every thumbnail + every legend cutout, about 19 MB,
//                inside the exe. The app is usable the moment it is opened,
//                with no internet, ever.
//   full pack    the full-resolution art, about 80 MB, published as a release
//                asset and fetched once over GitHub. It lands in the data
//                folder and is kept across every future update, so a daily
//                release is still only the exe.
//
// Read order everywhere is store, then library, then Rift Registry: an
// operator who has downloaded a newer card than the build shipped with still
// gets their own copy, and everyone else gets the baked one instead of a hole.
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { openPackBuffer, openPackFile } from './cardpack.js';
import { CARD_SECRET, usingBuildKey } from './cardsecret.js';
import { APP_ROOT, DATA_DIR, isPackaged, readAsset } from './runtime.js';

// Inside the exe the bundle is an embedded asset; from source it is whatever
// the last bake wrote into packs/, so `npm start` exercises the same path.
const BUNDLE_ASSET = 'cards/bundle.pack';
const BUNDLE_FILE = path.join(APP_ROOT, 'packs', 'cards-bundle.pack');
const FULL_PACK = path.join(DATA_DIR, 'carddb', 'full.pack');

const OWNER = 'sammor327';
const REPO = 'sideways-studio';
// Same shape and the same reasoning as the update channel: a fixed URL that
// always points at the newest release, so there is no API to rate-limit.
export const LIBRARY_URL = process.env.SIDEWAYS_LIBRARY_URL
  || `https://github.com/${OWNER}/${REPO}/releases/latest/download/library.json`;

const DOWNLOAD_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);
try {
  DOWNLOAD_HOSTS.add(new URL(LIBRARY_URL).hostname);
} catch { /* a malformed override just leaves the defaults */ }
const isLoopback = (host) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

let bundle = null;
let full = null;
let packSecret = CARD_SECRET;

// Packs are always sealed with the release key, never the development one:
// they are baked once and read by every installed copy, and a pack sealed with
// the key that only exists on a developer's machine could not be opened by any
// of them. A packaged build carries that key already; a source run reads it
// off .carddb-key beside the repo, which is where the build script keeps it,
// so `npm start` exercises the shipped path rather than a private variant.
async function resolvePackSecret() {
  if (usingBuildKey) return CARD_SECRET;
  const fromFile = (await readFile(path.join(APP_ROOT, '.carddb-key'), 'utf8').catch(() => '')).trim();
  return fromFile || CARD_SECRET;
}

// What the panel polls while the full pack comes down. `phase` is
// idle | checking | downloading | verifying | error.
const fetchState = { phase: 'idle', done: 0, total: 0, lastError: null };

export async function initLibrary() {
  packSecret = await resolvePackSecret();
  const embedded = readAsset(BUNDLE_ASSET);
  if (embedded) {
    bundle = openPackBuffer(embedded, 'bundle', packSecret);
  } else if (!isPackaged) {
    bundle = await openPackFile(BUNDLE_FILE, 'bundle', packSecret);
  }
  full = await openPackFile(FULL_PACK, 'full', packSecret);
  return { bundle: Boolean(bundle), full: Boolean(full) };
}

// The card index as it was when the build was baked. carddb falls back to this
// when the store has nothing, which is every install but the one that can
// reach Rift Registry.
export async function bundledIndex() {
  return bundle ? bundle.read('index', 'cards') : null;
}

export function bundledIndexBuiltAt() {
  return bundle && typeof bundle.meta.built === 'string' ? bundle.meta.built : null;
}

// Art from whichever pack holds it. Thumbs and legend cutouts are in the
// bundle; full art is in the downloaded pack, and in neither case does the
// caller need to know which.
export async function libraryArt(kind, id) {
  if (bundle && bundle.has(kind, id)) {
    const buf = await bundle.read(kind, id);
    if (buf) return buf;
  }
  if (full && full.has(kind, id)) {
    const buf = await full.read(kind, id);
    if (buf) return buf;
  }
  return null;
}

// Which of these ids the library can serve, so the panel never offers to
// download art the build already carries.
export function libraryIds(kind, ids) {
  const out = new Set();
  for (const id of ids) {
    if ((bundle && bundle.has(kind, id)) || (full && full.has(kind, id))) out.add(id);
  }
  return out;
}

export const hasFullPack = () => Boolean(full);

export function libraryStatus() {
  return {
    bundled: bundle
      ? { cards: bundle.meta.cards || 0, thumbs: bundle.ids('thumb').length, built: bundle.meta.built || null }
      : null,
    full: full
      ? { cards: full.ids('full').length, id: full.meta.id || null }
      : null,
    fetch: fetchState,
  };
}

// --- fetching the full pack ------------------------------------------------

// The published manifest, checked before it is trusted: a URL somewhere else
// entirely is treated as broken rather than followed, the same rule the
// updater applies to the exe.
export function validateLibraryManifest(m) {
  if (!m || typeof m !== 'object') return null;
  if (typeof m.url !== 'string' || typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(m.sha256)) return null;
  let url;
  try {
    url = new URL(m.url);
  } catch {
    return null;
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname));
  if (!secure || !DOWNLOAD_HOSTS.has(url.hostname)) return null;
  return {
    url: m.url,
    sha256: m.sha256.toLowerCase(),
    size: Number.isFinite(m.size) ? m.size : 0,
    // The pack's content digest, which is what "do I already have this?" turns
    // on. A rebake of unchanged art produces the same id, so an operator who
    // has the art keeps it across any number of releases.
    id: typeof m.id === 'string' ? m.id : null,
    built: typeof m.built === 'string' ? m.built : null,
    cards: Number.isFinite(m.cards) ? m.cards : 0,
  };
}

async function fetchManifest() {
  const res = await fetch(LIBRARY_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`the release channel answered HTTP ${res.status}`);
  let body;
  try {
    body = JSON.parse(await res.text());
  } catch {
    throw new Error('the release channel answered with something other than the library manifest');
  }
  const manifest = validateLibraryManifest(body);
  if (!manifest) throw new Error('the library manifest is not in the shape this app expects');
  return manifest;
}

// Streamed to disk rather than held in memory: it is ~80 MB, and an operator
// watching a progress bar is the whole reason this reports as it goes.
async function download(manifest) {
  await mkdir(path.dirname(FULL_PACK), { recursive: true });
  const tmp = `${FULL_PACK}.part`;
  const res = await fetch(manifest.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`the download answered HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || manifest.size || 0;
  fetchState.total = total;
  fetchState.done = 0;
  const hash = createHash('sha256');
  const fh = await open(tmp, 'w');
  try {
    for await (const chunk of res.body) {
      const buf = Buffer.from(chunk);
      hash.update(buf);
      await fh.write(buf);
      fetchState.done += buf.length;
    }
  } finally {
    await fh.close();
  }
  const digest = hash.digest('hex');
  if (digest !== manifest.sha256) {
    await rm(tmp, { force: true });
    throw new Error(`the download did not match its checksum (expected ${manifest.sha256.slice(0, 12)}, got ${digest.slice(0, 12)})`);
  }
  return tmp;
}

// Swapped in only once it has been proved to open with this build's key. A
// pack that will not open is a pack from another key, and putting it in place
// would cost the operator every card the old one still served.
async function install(tmp) {
  fetchState.phase = 'verifying';
  const probe = await openPackFile(tmp, 'full', packSecret);
  if (!probe) {
    await rm(tmp, { force: true });
    throw new Error('the downloaded card art does not open with this build; check for an app update');
  }
  await probe.close();
  if (full) await full.close();
  full = null;
  await rename(tmp, FULL_PACK);
  full = await openPackFile(FULL_PACK, 'full', packSecret);
  if (!full) throw new Error('the card art pack could not be opened after it was saved');
  return full.ids('full').length;
}

// "Download all card art for offline use", when the art is a published pack
// rather than 900 separate requests to a site the operator cannot reach.
export async function fetchFullPack() {
  if (fetchState.phase !== 'idle') return { ok: false, error: 'a download is already running' };
  fetchState.phase = 'checking';
  fetchState.lastError = null;
  fetchState.done = 0;
  fetchState.total = 0;
  try {
    const manifest = await fetchManifest();
    if (full && manifest.id && full.meta.id === manifest.id) {
      return { ok: true, already: true, cards: full.ids('full').length };
    }
    fetchState.phase = 'downloading';
    const tmp = await download(manifest);
    const cards = await install(tmp);
    return { ok: true, cards };
  } catch (err) {
    fetchState.lastError = err.message;
    return { ok: false, error: err.message };
  } finally {
    fetchState.phase = 'idle';
  }
}

export async function fullPackSize() {
  try {
    return (await stat(FULL_PACK)).size;
  } catch {
    return 0;
  }
}
