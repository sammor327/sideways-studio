// The card database on disk, encrypted.
//
// Why this exists: the app downloads Rift Registry's card index and art onto
// every machine it runs on. Left as cards.json plus folders of UNL-131.webp,
// that is a complete, ready-to-import copy of the database handed to anyone
// who installs the app, for no effort at all. Through here it becomes one
// sealed index blob and a pile of opaque AES-256-GCM files with no readable
// names, so copying data/carddb/ out of an install gets you nothing usable.
//
// Be honest about what this is worth. The key ships inside the exe, so anyone
// willing to reverse the binary still gets in: this stops the casual rip, not
// a determined one. And the index is public at riftregistry.com by
// construction, since the website's own front end fetches /data/cards.json in
// the browser. The real gate is server-side, not here. SPEC "Card and legend
// data" and docs/CARD-STORE.md.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './runtime.js';
import { CARD_SECRET } from './cardsecret.js';

const DB_DIR = path.join(DATA_DIR, 'carddb');
const STORE_DIR = path.join(DB_DIR, 'store');
const SALT_FILE = path.join(STORE_DIR, 'store.id');
const INDEX_BLOB = path.join(STORE_DIR, 'index');

// One subdirectory per kind so the status counts stay a cheap readdir. Single
// letters on purpose: a directory listing should not narrate what is in it.
const KIND_DIR = { thumb: 't', full: 'f', legend: 'l' };

// The plaintext layout every build before this one wrote, migrated away from
// on first launch. Card art is keyed by cardId, legend icons by RR slug.
const LEGACY = {
  index: path.join(DB_DIR, 'cards.json'),
  thumb: path.join(DB_DIR, 'thumb'),
  full: path.join(DB_DIR, 'full'),
  legend: path.join(DB_DIR, 'legends'),
};

// The sealing secret lives in cardsecret.js: the packs that ship with the
// app are sealed with the same one, and two copies of that comment drifting
// apart is exactly the kind of mistake that costs every install its cache.
const SECRET = CARD_SECRET;

// Two keys from one secret: one seals file contents, one names the files.
// Split so a name can never be used to say anything about the bytes.
let dataKey = null;
let nameKey = null;

// Per install, so two machines never name the same card's blob the same way:
// no table built from one install says anything about another. The salt is not
// itself a secret and lives beside the blobs it names.
async function loadSalt() {
  try {
    const raw = await readFile(SALT_FILE);
    if (raw.length === 16) return raw;
  } catch { /* first run */ }
  const salt = randomBytes(16);
  await writeFile(SALT_FILE, salt);
  return salt;
}

// Envelope: magic, format byte, nonce, tag, ciphertext. The label goes in as
// additional data, which binds each blob to the one card and tier it holds:
// renaming a file to another card's name makes it fail to open rather than
// quietly serving the wrong art.
const MAGIC = Buffer.from('SWCD');
const FORMAT = 1;
const HEAD = 4 + 1 + 12 + 16;

function seal(label, plain) {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', dataKey, nonce, { authTagLength: 16 });
  c.setAAD(Buffer.from(label, 'utf8'));
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, Buffer.from([FORMAT]), nonce, c.getAuthTag(), body]);
}

// Returns null for anything that will not open: wrong key, wrong label, a
// truncated write, a file from a build with a different secret. Every caller
// treats null as "not cached" and downloads it again, which is why losing
// .carddb-key costs a re-download and not an install.
function unseal(label, blob) {
  if (blob.length < HEAD || !blob.subarray(0, 4).equals(MAGIC) || blob[4] !== FORMAT) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', dataKey, blob.subarray(5, 17), { authTagLength: 16 });
    d.setAAD(Buffer.from(label, 'utf8'));
    d.setAuthTag(blob.subarray(17, HEAD));
    return Buffer.concat([d.update(blob.subarray(HEAD)), d.final()]);
  } catch {
    return null;
  }
}

const labelFor = (kind, id) => `${kind}/${id}`;
const blobName = (kind, id) => createHmac('sha256', nameKey).update(labelFor(kind, id)).digest('hex').slice(0, 32);
const blobPath = (kind, id) => path.join(STORE_DIR, KIND_DIR[kind], blobName(kind, id));

// Temp plus rename, so a crash or a full disk never leaves a half-written blob
// that would then fail to open forever while counting as cached.
async function writeAtomic(dest, buf) {
  const tmp = `${dest}.part`;
  await writeFile(tmp, buf);
  await rename(tmp, dest);
}

// True while plaintext art from an older build may still be the only copy of a
// file. Set at init, cleared when the migration finishes, and checked on every
// art read, so a settled install pays nothing for it.
let legacyPending = false;

export async function initStore() {
  await mkdir(STORE_DIR, { recursive: true });
  for (const d of Object.values(KIND_DIR)) await mkdir(path.join(STORE_DIR, d), { recursive: true });
  const salt = await loadSalt();
  dataKey = Buffer.from(hkdfSync('sha256', SECRET, salt, 'sideways-studio carddb data v1', 32));
  nameKey = Buffer.from(hkdfSync('sha256', SECRET, salt, 'sideways-studio carddb names v1', 32));
  legacyPending = (await legacyArtFiles()).length > 0;
}

// --- the index -------------------------------------------------------------

export async function readIndex() {
  try {
    return unseal('index', await readFile(INDEX_BLOB));
  } catch {
    return null;
  }
}

export async function writeIndex(buf) {
  await writeAtomic(INDEX_BLOB, seal('index', buf));
}

export async function indexWrittenAt() {
  try {
    return (await stat(INDEX_BLOB)).mtime.toISOString();
  } catch {
    return null;
  }
}

// --- art blobs -------------------------------------------------------------

// Decrypting a 90 KB webp is measured in microseconds, but a scene can ask for
// the same card art every time it redraws, so the last few stay unsealed in
// memory. Small enough that the cap is a count, not a byte budget.
const hot = new Map();
const HOT_MAX = 96;

function remember(key, buf) {
  hot.set(key, buf);
  if (hot.size > HOT_MAX) hot.delete(hot.keys().next().value);
  return buf;
}

export async function readBlob(kind, id) {
  const key = labelFor(kind, id);
  const hit = hot.get(key);
  if (hit) return hit;
  try {
    const plain = unseal(key, await readFile(blobPath(kind, id)));
    if (plain) return remember(key, plain);
  } catch { /* not stored: fall through */ }
  // Mid-migration the plaintext file can still be the only copy on disk.
  if (legacyPending) {
    try {
      return remember(key, await readFile(path.join(LEGACY[kind], `${id}.webp`)));
    } catch { /* not there either */ }
  }
  return null;
}

// Deliberately not put in the hot cache: every caller that writes already has
// the bytes in hand and returns them itself, so caching here would only make
// the store harder to reason about.
export async function writeBlob(kind, id, buf) {
  await writeAtomic(blobPath(kind, id), seal(labelFor(kind, id), buf));
}

// A blob name cannot be turned back into a card id, so "what is cached" is
// answered the other way round: the caller passes the ids it knows about and
// gets back the subset that is stored.
export async function storedIds(kind, ids) {
  let names = new Set();
  try {
    names = new Set(await readdir(path.join(STORE_DIR, KIND_DIR[kind])));
  } catch { /* nothing sealed yet */ }
  // Plaintext files an older build left behind read through until the
  // migration moves them, so they count as cached here too. Otherwise the
  // panel would offer to download art that is already sitting on the disk.
  let plain = new Set();
  if (legacyPending) {
    try {
      plain = new Set((await readdir(LEGACY[kind]))
        .filter((f) => f.endsWith('.webp'))
        .map((f) => f.slice(0, -5)));
    } catch { /* that folder was never written */ }
  }
  const out = new Set();
  for (const id of ids) if (names.has(blobName(kind, id)) || plain.has(id)) out.add(id);
  return out;
}

// --- migration from the plaintext layout -----------------------------------

async function legacyArtFiles() {
  const out = [];
  for (const kind of ['thumb', 'full', 'legend']) {
    try {
      for (const f of await readdir(LEGACY[kind])) {
        if (f.endsWith('.webp')) out.push({ kind, id: f.slice(0, -5), file: path.join(LEGACY[kind], f) });
      }
    } catch { /* this build never wrote that folder */ }
  }
  return out;
}

// The index moves first and in the foreground: it is 400 KB, nothing works
// without it, and the sync that would otherwise replace it is the slow path
// this is here to spare the operator. Returns the bytes so the caller can
// index them without reading the file back.
export async function migrateIndex() {
  try {
    const buf = await readFile(LEGACY.index);
    const { mtime } = await stat(LEGACY.index);
    await writeIndex(buf);
    // Carry the old file's date over. The index's age is what decides whether
    // the launch refresh fires, and an install that has been sitting on a
    // three-week-old set list must still get that check on the launch it
    // upgrades: a freshly written blob would look current and skip it.
    await utimes(INDEX_BLOB, mtime, mtime);
    await unlink(LEGACY.index);
    return buf;
  } catch {
    return null;
  }
}

export const legacyArtPending = () => legacyPending;

// The art: ~90 MB on a filled-in install, so it runs in the background after
// the server is up. Reads fall back to the plaintext copy until each file has
// moved, and a file that fails to move is left where it is for the next launch
// to retry rather than being lost.
export async function migrateArt(onProgress) {
  const files = await legacyArtFiles();
  let done = 0;
  let failed = 0;
  for (const { kind, id, file } of files) {
    try {
      await writeBlob(kind, id, await readFile(file));
      await unlink(file);
    } catch {
      failed += 1;
    }
    // Counted outside the callback: an optional call never evaluates its
    // arguments, so ++done inside one would not happen without a listener.
    done += 1;
    onProgress?.(done, files.length);
  }
  if (!failed) {
    for (const kind of ['thumb', 'full', 'legend']) {
      await rm(LEGACY[kind], { recursive: true, force: true });
    }
    legacyPending = false;
  }
  return { total: files.length, moved: done - failed, failed };
}
