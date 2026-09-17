// The manifest that tells an installed copy where its card art is. It comes
// off the internet, so it is checked before it is followed: the app downloads
// 80 MB on its say-so and then opens the result with the build key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'sideways-library-'));
const { validateLibraryManifest } = await import('../server/cardlibrary.js');

const SHA = 'a'.repeat(64);
const good = {
  url: 'https://github.com/sammor327/sideways-studio/releases/download/v0.19.0/cards-full.pack',
  sha256: SHA,
  size: 81_000_000,
  id: 'b'.repeat(64),
  built: '2026-09-17T00:00:00.000Z',
  cards: 932,
};

test('a manifest from the release channel is taken as it stands', () => {
  const m = validateLibraryManifest(good);
  assert.equal(m.url, good.url);
  assert.equal(m.sha256, SHA);
  assert.equal(m.id, good.id);
  assert.equal(m.cards, 932);
});

test('an uppercase checksum is normalised, because it is compared as a string', () => {
  assert.equal(validateLibraryManifest({ ...good, sha256: SHA.toUpperCase() }).sha256, SHA);
});

test('a download pointed anywhere but the release hosts is refused', () => {
  assert.equal(validateLibraryManifest({ ...good, url: 'https://example.com/cards-full.pack' }), null);
  assert.equal(validateLibraryManifest({ ...good, url: 'http://github.com/x/cards-full.pack' }), null, 'plain http');
  assert.equal(validateLibraryManifest({ ...good, url: 'file:///C:/cards-full.pack' }), null);
  assert.equal(validateLibraryManifest({ ...good, url: 'not a url' }), null);
});

test('a manifest with no usable checksum is refused: it is the only proof the bytes are the right ones', () => {
  assert.equal(validateLibraryManifest({ ...good, sha256: 'short' }), null);
  assert.equal(validateLibraryManifest({ ...good, sha256: undefined }), null);
  assert.equal(validateLibraryManifest({ ...good, sha256: `${SHA}zz` }), null);
});

test('junk in place of a manifest is refused rather than picked over', () => {
  assert.equal(validateLibraryManifest(null), null);
  assert.equal(validateLibraryManifest('a web page, not the manifest'), null);
  assert.equal(validateLibraryManifest({}), null);
});

test('the optional fields are allowed to be missing: they describe, they do not gate', () => {
  const m = validateLibraryManifest({ url: good.url, sha256: SHA });
  assert.ok(m);
  assert.equal(m.id, null);
  assert.equal(m.built, null);
  assert.equal(m.size, 0);
  assert.equal(m.cards, 0);
});
