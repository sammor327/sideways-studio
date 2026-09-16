// The art a card can fetch, and the counts the panel measures "saved"
// against, out of an index that is not uniform: most cards carry a Rift
// Registry thumb path and an art. full URL, a couple of tokens carry only
// TCGPlayer hotlinks (which 403 server-side), and one has no id at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artSourceUrl, artAvailability, fullArtComplete } from '../server/carddb.js';

const rr = { cardId: 'UNL-131', imageUrl: '/data/cards/thumb/UNL-131.webp', imageUrlFull: 'https://art.riftregistry.com/full/UNL-131.webp' };
const token = { cardId: 'SFD-T01', imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/678186_200w.jpg', imageUrlFull: null };
const bare = { cardId: 'X-1' };

test('a relative thumb path resolves onto riftregistry.com; full art is taken from art. as given', () => {
  assert.equal(artSourceUrl(rr, 'thumb'), 'https://riftregistry.com/data/cards/thumb/UNL-131.webp');
  assert.equal(artSourceUrl(rr, 'full'), 'https://art.riftregistry.com/full/UNL-131.webp');
});

test('a TCGPlayer hotlink is not a source, and neither is nothing', () => {
  assert.equal(artSourceUrl(token, 'thumb'), null);
  assert.equal(artSourceUrl(token, 'full'), null);
  assert.equal(artSourceUrl(bare, 'thumb'), null);
  assert.equal(artSourceUrl(bare, 'full'), null);
});

test('availability counts only cards with a source, so "saved" is measured against what can be fetched', () => {
  assert.deepEqual(artAvailability([rr, rr, token, bare]), { thumb: 2, full: 2 });
  assert.deepEqual(artAvailability([]), { thumb: 0, full: 0 });
});

test('with no index there is nothing to call complete: the button must still offer the download', () => {
  assert.equal(fullArtComplete(), false);
});
