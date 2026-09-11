import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, cardKey, createResolver } from '../server/decklist.js';

const CARDS = [
  { cardId: 'OGN-001', cardName: 'Diana, Scorn of the Moon', type: 'Legend', domains: ['Chaos', 'Mind'], energy: null },
  { cardId: 'UNL-079', cardName: 'Diana, Lunari', type: 'Champion Unit', domains: ['Mind'], energy: 3 },
  { cardId: 'OGN-010', cardName: 'Stupefy', type: 'Spell', domains: ['Mind'], energy: 1 },
  { cardId: 'OGN-011', cardName: "Kha'Zix, Mutating Horror", type: 'Unit', domains: ['Chaos'], energy: 4 },
  { cardId: 'OGN-012', cardName: 'Ahri, Alluring', type: 'Champion Unit', domains: ['Calm'], energy: 3 },
  { cardId: 'OGN-013', cardName: 'Ahri, Nine-Tailed Fox', type: 'Legend', domains: ['Calm', 'Mind'], energy: null },
  { cardId: 'OGN-014', cardName: 'Ravenbloom Conservatory', type: 'Battlefield', domains: [], energy: null },
  { cardId: 'OGN-015', cardName: 'Tideturner', type: 'Unit', domains: ['Calm'], energy: 2 },
  // A reprint of Stupefy: a bare name must still land on the original.
  { cardId: 'SFD-200', cardName: 'Stupefy', type: 'Spell', domains: ['Mind'], energy: 1 },
];

const r = createResolver(CARDS);

describe('cardKey', () => {
  it('ignores case, accents, punctuation, spacing and printing brackets', () => {
    const key = cardKey('Diana, Scorn of the Moon');
    assert.equal(cardKey('diana - scorn of the moon'), key);
    assert.equal(cardKey('DIANA SCORN OF THE MOON (Overnumbered)'), key);
    assert.equal(cardKey('Kha’Zix, Mutating Horror'), cardKey("Kha'Zix, Mutating Horror"));
    assert.equal(cardKey('Pokémon'), 'pokemon');
  });
});

describe('lookup', () => {
  it('matches punctuation-insensitively and keeps the original printing', () => {
    assert.equal(r.lookup('Diana - Scorn of the Moon').cardId, 'OGN-001');
    assert.equal(r.lookup('stupefy').cardId, 'OGN-010');
    assert.equal(r.lookup('Khazix mutating horror').cardId, 'OGN-011');
  });

  it('strips printing qualifiers', () => {
    assert.equal(r.lookup('Stupefy - Starter').cardId, 'OGN-010');
    assert.equal(r.lookup('Tideturner (Alternate Art)').cardId, 'OGN-015');
  });

  it('takes a unique prefix but never guesses between two cards', () => {
    assert.equal(r.lookup('Ravenbloom Cons').cardId, 'OGN-014');
    assert.equal(r.lookup('Ahri'), null);
    assert.equal(r.lookup('Di'), null);
  });

  it('misses cleanly', () => {
    assert.equal(r.lookup('Thermobeam'), null);
    assert.equal(r.lookup(''), null);
  });
});

describe('suggest', () => {
  it('offers the closest names for a typo', () => {
    assert.equal(r.suggest('Stupify')[0], 'Stupefy');
    assert.equal(r.suggest('Ravenbloom Convservatory')[0], 'Ravenbloom Conservatory');
  });

  it('ranks substring hits first', () => {
    const s = r.suggest('Ahri');
    assert.deepEqual(s.slice(0, 2).sort(), ['Ahri, Alluring', 'Ahri, Nine-Tailed Fox']);
  });

  it('returns at most three, and nothing for noise', () => {
    assert.ok(r.suggest('a').length <= 3);
    assert.deepEqual(r.suggest('zzzzzzzzzzzzzzzz'), []);
  });
});

describe('buildDeck', () => {
  it('resolves what it can, names what it cannot, and reports both', () => {
    const d = buildDeck('Legend: Diana - Scorn of the Moon\nChampion: Diana, Lunari\nMain:\n3 Stupify\n2 Tideturner', { resolverOverride: r });
    assert.equal(d.legend.name, 'Diana, Scorn of the Moon');
    assert.equal(d.legend.raw, 'Diana - Scorn of the Moon');
    assert.equal(d.main[0].cardId, null);
    assert.equal(d.main[0].name, 'Stupify');
    assert.equal(d.main[1].cardId, 'OGN-015');
    assert.deepEqual(d.unresolved, ['Stupify']);
    assert.equal(d.suggestions.Stupify[0], 'Stupefy');
    assert.equal(d.counts.unresolved, 1);
    assert.equal(d.counts.main, 5);
    assert.equal(d.resolved['Diana - Scorn of the Moon'].cardId, 'OGN-001');
  });
});
