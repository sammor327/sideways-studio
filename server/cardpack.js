// Card packs: the card library sealed into one read-only file, built on a
// machine that can reach Rift Registry and shipped with the app.
//
// Why this exists: cardstore.js caches what an install downloads from Rift
// Registry, and that only works for someone who can reach Rift Registry. It is
// a private site, so for everyone but its operator the download answers with a
// sign-in page and the app has no cards at all (Sam, 2026-09-17). So the
// library travels with the build instead: the index, every thumbnail and every
// legend cutout inside the exe, the full art as one pack downloaded once from
// the release.
//
// A pack is read-only and identical on every machine, which is what makes it
// shippable and also what separates it from the store: the store names its
// blobs with a per-install salt, and a file built weeks earlier cannot know
// that salt. A pack carries its own sealed directory instead, so the file is
// still opaque to whoever finds it. docs/CARD-STORE.md for what that is worth,
// which is the same here: it stops the casual rip, not a determined one.
//
//   magic "SWPK" | format byte | directory length (uint32 LE)
//   sealed directory: { built, cards, entries: { "thumb/UNL-131": [off, len] } }
//   sealed entries, back to back, offsets relative to the end of the directory
import { createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { open, rename, writeFile } from 'node:fs/promises';
import { CARD_SECRET } from './cardsecret.js';

const MAGIC = Buffer.from('SWPK');
const FORMAT = 1;
const HEADER = 4 + 1 + 4;

// Envelope per sealed piece: nonce, tag, ciphertext. The label goes in as
// additional data, so an entry is bound to the one card and tier it holds and
// a shuffled pack fails to open rather than serving the wrong art.
const NONCE = 12;
const TAG = 16;
const OVERHEAD = NONCE + TAG;

// Fixed, unlike the store's per-install salt: a pack is built once and read by
// every install, so there is nowhere for a random salt to live. A pack is the
// same bytes on every machine by construction; that is the point of it.
const PACK_SALT = Buffer.from('sideways-studio card pack v1');
const keyFor = (secret) => Buffer.from(hkdfSync('sha256', secret, PACK_SALT, 'sideways-studio card pack data v1', 32));

export const sealedSize = (len) => len + OVERHEAD;
export const packLabel = (kind, id) => `${kind}/${id}`;

function seal(key, label, plain) {
  // Nonce derived from the label rather than drawn at random: a pack is
  // written once from a fixed input, and one that rebuilds to identical bytes
  // is one the release script can recognise as unchanged and not re-upload 80
  // MB for. Safe because a label appears once in a pack and the key is per
  // build, so the same nonce never seals two different plaintexts.
  const nonce = Buffer.from(hkdfSync('sha256', key, PACK_SALT, `nonce/${label}`, NONCE));
  const c = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG });
  c.setAAD(Buffer.from(label, 'utf8'));
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([nonce, c.getAuthTag(), body]);
}

// Null for anything that will not open: a pack from a build with another key,
// a truncated download, a file that is not a pack at all. Every caller treats
// null as "not in the pack" and falls through to the next source, which is why
// a bad pack costs a download and never an install.
function unseal(key, label, blob) {
  if (!blob || blob.length < OVERHEAD) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', key, blob.subarray(0, NONCE), { authTagLength: TAG });
    d.setAAD(Buffer.from(label, 'utf8'));
    d.setAuthTag(blob.subarray(NONCE, OVERHEAD));
    return Buffer.concat([d.update(blob.subarray(OVERHEAD)), d.final()]);
  } catch {
    return null;
  }
}

// --- writing ---------------------------------------------------------------

// Entries are sealed in the order given, so the directory is complete before a
// byte goes out and the file is written in one pass. `entries` is an array of
// { kind, id, bytes }; `meta` is whatever the reader should know without
// opening an entry: when it was built, how many cards it covers.
export function buildPack(entries, meta = {}, secret = CARD_SECRET) {
  const key = keyFor(secret);
  const dir = {};
  const sealed = [];
  let offset = 0;
  for (const { kind, id, bytes } of entries) {
    const label = packLabel(kind, id);
    if (dir[label]) continue;
    const blob = seal(key, label, bytes);
    dir[label] = [offset, blob.length];
    offset += blob.length;
    sealed.push(blob);
  }
  const directory = seal(key, 'directory', Buffer.from(JSON.stringify({ ...meta, entries: dir }), 'utf8'));
  const head = Buffer.alloc(HEADER);
  MAGIC.copy(head, 0);
  head[4] = FORMAT;
  head.writeUInt32LE(directory.length, 5);
  return Buffer.concat([head, directory, ...sealed]);
}

export async function writePack(dest, entries, meta = {}, secret = CARD_SECRET) {
  const buf = buildPack(entries, meta, secret);
  // Temp plus rename: a crash mid-write must never leave a short file that
  // opens far enough to be trusted.
  await writeFile(`${dest}.part`, buf);
  await rename(`${dest}.part`, dest);
  return buf.length;
}

// --- reading ---------------------------------------------------------------

// A few unsealed entries kept in hand: a scene can ask for the same card on
// every redraw, and decryption is cheap but not free. Same reasoning as the
// store's hot cache, and the same kind of cap: a count, not a byte budget.
const HOT_MAX = 64;

function makePack({ key, meta, entries, readAt, close, label }) {
  const hot = new Map();
  return {
    label,
    meta,
    count: entries.size,
    has: (kind, id) => entries.has(packLabel(kind, id)),
    ids(kind) {
      const prefix = `${kind}/`;
      const out = [];
      for (const k of entries.keys()) if (k.startsWith(prefix)) out.push(k.slice(prefix.length));
      return out;
    },
    async read(kind, id) {
      const name = packLabel(kind, id);
      const hit = hot.get(name);
      if (hit) return hit;
      const at = entries.get(name);
      if (!at) return null;
      let plain = null;
      try {
        plain = unseal(key, name, await readAt(at[0], at[1]));
      } catch {
        return null;
      }
      if (!plain) return null;
      hot.set(name, plain);
      if (hot.size > HOT_MAX) hot.delete(hot.keys().next().value);
      return plain;
    },
    close,
  };
}

function readDirectory(head, dirBytes, secret) {
  if (head.length < HEADER || !head.subarray(0, 4).equals(MAGIC) || head[4] !== FORMAT) return null;
  const key = keyFor(secret);
  const plain = unseal(key, 'directory', dirBytes);
  if (!plain) return null;
  try {
    const meta = JSON.parse(plain.toString('utf8'));
    if (!meta || typeof meta.entries !== 'object' || !meta.entries) return null;
    const entries = new Map(Object.entries(meta.entries));
    delete meta.entries;
    return { key, meta, entries };
  } catch {
    return null;
  }
}

// A pack already in memory: the one inside the exe, which the runtime hands
// over as a view on the executable's own bytes rather than as a copy.
export function openPackBuffer(buf, label = 'pack', secret = CARD_SECRET) {
  if (!Buffer.isBuffer(buf) || buf.length < HEADER) return null;
  const dirLen = buf.readUInt32LE(5);
  if (dirLen <= 0 || HEADER + dirLen > buf.length) return null;
  const read = readDirectory(buf.subarray(0, HEADER), buf.subarray(HEADER, HEADER + dirLen), secret);
  if (!read) return null;
  const base = HEADER + dirLen;
  return makePack({
    ...read,
    label,
    close: () => {},
    readAt: async (off, len) => {
      if (off < 0 || len <= 0 || base + off + len > buf.length) return null;
      return buf.subarray(base + off, base + off + len);
    },
  });
}

// A pack on disk: the full-art file, ~80 MB, read one card at a time from an
// open handle rather than pulled into memory.
export async function openPackFile(file, label = 'pack', secret = CARD_SECRET) {
  let fh = null;
  try {
    fh = await open(file, 'r');
    const head = Buffer.alloc(HEADER);
    const { bytesRead } = await fh.read(head, 0, HEADER, 0);
    if (bytesRead !== HEADER) throw new Error('not a card pack');
    const dirLen = head.readUInt32LE(5);
    if (dirLen <= 0 || dirLen > 64 * 1024 * 1024) throw new Error('card pack directory out of range');
    const dirBytes = Buffer.alloc(dirLen);
    await fh.read(dirBytes, 0, dirLen, HEADER);
    const read = readDirectory(head, dirBytes, secret);
    if (!read) throw new Error('card pack does not open with this key');
    const base = HEADER + dirLen;
    const handle = fh;
    return makePack({
      ...read,
      label,
      close: () => handle.close().catch(() => {}),
      readAt: async (off, len) => {
        if (off < 0 || len <= 0 || len > 64 * 1024 * 1024) return null;
        const out = Buffer.alloc(len);
        const got = await handle.read(out, 0, len, base + off);
        return got.bytesRead === len ? out : null;
      },
    });
  } catch {
    if (fh) await fh.close().catch(() => {});
    return null;
  }
}
