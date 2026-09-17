// The card packs that ship with the app: what opens, what refuses to, and the
// one property the release process leans on, which is that baking the same art
// twice produces the same file.
//
// The rule every case here is really checking: anything that will not open
// reads as absent, so a pack from another build, a truncated download or a
// shuffled file costs a download and never an install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPack, openPackBuffer, openPackFile, writePack, sealedSize } from '../server/cardpack.js';

const SECRET = 'a test key, not the shipped one';
const OTHER = 'some other build key entirely';
const INDEX = Buffer.from(JSON.stringify([{ cardId: 'OGN-001', cardName: 'Test Card' }]));
const THUMB = Buffer.from('RIFF    WEBP the-thumb-bytes');
const FULL = Buffer.alloc(4096, 7);
const ICON = Buffer.from('RIFF    WEBP the-icon-bytes');

const entries = [
  { kind: 'index', id: 'cards', bytes: INDEX },
  { kind: 'thumb', id: 'OGN-001', bytes: THUMB },
  { kind: 'full', id: 'OGN-001', bytes: FULL },
  { kind: 'legend', id: 'jinx-loose-cannon', bytes: ICON },
];
const META = { built: '2026-09-17T00:00:00.000Z', cards: 1, id: 'test-content-id' };
const pack = buildPack(entries, META, SECRET);

test('a pack gives back every kind it was built from', async () => {
  const p = openPackBuffer(pack, 'test', SECRET);
  assert.ok(p, 'opens');
  assert.deepEqual(await p.read('index', 'cards'), INDEX);
  assert.deepEqual(await p.read('thumb', 'OGN-001'), THUMB);
  assert.deepEqual(await p.read('full', 'OGN-001'), FULL);
  assert.deepEqual(await p.read('legend', 'jinx-loose-cannon'), ICON);
});

test('metadata rides along, so the app knows what it is carrying without opening a card', () => {
  const p = openPackBuffer(pack, 'test', SECRET);
  assert.equal(p.meta.built, META.built);
  assert.equal(p.meta.cards, 1);
  assert.equal(p.meta.id, 'test-content-id');
  assert.equal(p.count, entries.length, 'and the directory is not part of the count');
});

test('a card that is not in the pack reads as absent, not as an error', async () => {
  const p = openPackBuffer(pack, 'test', SECRET);
  assert.equal(p.has('thumb', 'OGN-999'), false);
  assert.equal(await p.read('thumb', 'OGN-999'), null);
  assert.equal(await p.read('full', 'jinx-loose-cannon'), null, 'the kind is part of the name');
});

test('ids() answers what the pack covers, which is what the panel counts', () => {
  const p = openPackBuffer(pack, 'test', SECRET);
  assert.deepEqual(p.ids('thumb'), ['OGN-001']);
  assert.deepEqual(p.ids('legend'), ['jinx-loose-cannon']);
  assert.deepEqual(p.ids('battlefield'), []);
});

test('a pack from a build with another key does not open at all', () => {
  assert.equal(openPackBuffer(pack, 'test', OTHER), null);
});

test('a truncated pack opens but its cut entries read as absent', async () => {
  // The directory is at the front, so a download that stopped early still
  // opens. Every entry it lost has to come back null rather than short bytes.
  const cut = pack.subarray(0, pack.length - FULL.length);
  const p = openPackBuffer(cut, 'test', SECRET);
  assert.ok(p, 'the directory survived');
  assert.equal(await p.read('legend', 'jinx-loose-cannon'), null, 'the entry past the cut is gone');
  assert.deepEqual(await p.read('thumb', 'OGN-001'), THUMB, 'and the ones before it still read');
});

test('a pack with no directory, or not a pack at all, is refused', () => {
  assert.equal(openPackBuffer(Buffer.from('not a pack'), 'test', SECRET), null);
  assert.equal(openPackBuffer(Buffer.alloc(0), 'test', SECRET), null);
  assert.equal(openPackBuffer(pack.subarray(0, 9), 'test', SECRET), null, 'header without its directory');
});

test('entries are bound to their own card: swapping two makes both fail, never serve the wrong art', async () => {
  // Same length either side so the directory offsets still land on whole
  // entries: the label going in as additional data is what catches this, not
  // a length check.
  const a = Buffer.from('RIFF    WEBP art for card A');
  const b = Buffer.from('RIFF    WEBP art for card B');
  const two = buildPack([{ kind: 'thumb', id: 'A', bytes: a }, { kind: 'thumb', id: 'B', bytes: b }], {}, SECRET);
  const base = two.length - sealedSize(a.length) - sealedSize(b.length);
  const swapped = Buffer.concat([
    two.subarray(0, base),
    two.subarray(base + sealedSize(a.length)),
    two.subarray(base, base + sealedSize(a.length)),
  ]);
  const p = openPackBuffer(swapped, 'test', SECRET);
  assert.equal(await p.read('thumb', 'A'), null);
  assert.equal(await p.read('thumb', 'B'), null);
});

test('the same art bakes to the same bytes, which is what stops a release re-uploading 80 MB', () => {
  assert.equal(Buffer.compare(buildPack(entries, META, SECRET), pack), 0);
  // Different art, different file: the stability must not come from ignoring
  // the input.
  const changed = entries.map((e) => (e.kind === 'full' ? { ...e, bytes: Buffer.alloc(4096, 8) } : e));
  assert.notEqual(Buffer.compare(buildPack(changed, META, SECRET), pack), 0);
});

test('a pack on disk is read a card at a time from the file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sideways-pack-'));
  const file = path.join(dir, 'cards-full.pack');
  const size = await writePack(file, entries, META, SECRET);
  assert.equal(size, pack.length);

  const p = await openPackFile(file, 'full', SECRET);
  assert.ok(p, 'opens');
  assert.deepEqual(await p.read('full', 'OGN-001'), FULL);
  assert.deepEqual(await p.read('full', 'OGN-001'), FULL, 'and again, from the hot cache');
  assert.equal(await p.read('full', 'OGN-002'), null);
  await p.close();

  assert.equal(await openPackFile(file, 'full', OTHER), null, 'the wrong key opens nothing');
  assert.equal(await openPackFile(path.join(dir, 'nothing-here.pack'), 'full', SECRET), null);
  await writeFile(path.join(dir, 'junk.pack'), Buffer.from('not a pack at all'));
  assert.equal(await openPackFile(path.join(dir, 'junk.pack'), 'full', SECRET), null);
});
