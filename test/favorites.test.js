import { describe, it, beforeEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { TILES, tileFor } from '../web/shared/looktiles.js';

// web/shared/favorites.js is browser code: it reads localStorage when it
// loads and announces changes on the window. Both are stood up here, before
// the import, so the store itself can be tested without a browser.
const store = new Map();
let heard = [];
let mod;
before(async () => {
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.window = new EventTarget();
  globalThis.window.addEventListener('sideways:favorites', (e) => heard.push(e.detail));
  mod = await import('../web/shared/favorites.js');
});

beforeEach(() => {
  heard = [];
  mod.setFavorites([]);
  heard = [];
});

describe('the starred graphics', () => {
  it('keeps scene keys only, once each, in the order they were starred', () => {
    assert.deepEqual(mod.cleanFavorites(['igodual', 'standings', 'igodual', '', null, 7, 'pov']),
      ['igodual', 'standings', 'pov']);
    assert.deepEqual(mod.cleanFavorites('igodual'), []);
    assert.deepEqual(mod.cleanFavorites(undefined), []);
  });

  it('adds and takes away, and says which it is now', () => {
    assert.equal(mod.isFavorite('standings'), false);
    assert.equal(mod.toggleFavorite('standings'), true);
    assert.equal(mod.isFavorite('standings'), true);
    assert.deepEqual(mod.favorites(), ['standings']);
    assert.equal(mod.toggleFavorite('standings'), false);
    assert.deepEqual(mod.favorites(), []);
  });

  it('hands each caller its own copy, so nothing edits the list behind its back', () => {
    mod.setFavorites(['pov']);
    const list = mod.favorites();
    list.push('bracket');
    assert.deepEqual(mod.favorites(), ['pov']);
  });

  it('writes the list where the panel reads it back', () => {
    mod.setFavorites(['igorows', 'ticker']);
    assert.deepEqual(JSON.parse(store.get(mod.FAVORITES_KEY)), ['igorows', 'ticker']);
  });

  it('tells every listener on each change, and what is starred now', () => {
    mod.toggleFavorite('matrix');
    mod.toggleFavorite('bracket');
    mod.toggleFavorite('matrix');
    assert.deepEqual(heard, [['matrix'], ['matrix', 'bracket'], ['bracket']]);
  });

  it('stars a graphic, not a tile: every variant of it comes along', () => {
    // The stages group by the graphic a tile draws, so starring the lower
    // third brings all four of its tiles.
    mod.setFavorites(['lowerthird']);
    const brought = TILES.filter((t) => mod.isFavorite(t.scene));
    assert.equal(brought.length, 4);
    assert.ok(brought.every((t) => t.scene === 'lowerthird'));
    assert.equal(tileFor('lowerthird-custom').scene, 'lowerthird');
  });
});
