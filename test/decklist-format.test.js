import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkLegality, deckNames, parseDecklist, serializeDecklist,
} from '../web/shared/decklist-format.js';

// FlipDeck's reference list (DecklistTool.tsx EXAMPLE): 39 main plus the
// champion, 12 runes, 3 battlefields.
const DIANA = `Legend: Diana, Scorn of the Moon
Champion: Diana, Lunari

Battlefields:
Rockfall Path
Veiled Temple
Abandoned Hall

Runes:
7 Chaos
5 Mind

Main:
3 Stupefy
3 Ravenbloom Student
3 Ride the Wind
3 Stacked Deck
3 Tideturner
3 Hwei, Brooding Painter
3 Moonfall
3 Patched Porobot
3 Temporal Breach
3 Swain, Visionary
2 Gust
2 Morbid Return
2 Fizz, Trickster
2 Star-Crossed
1 Eclipse

Sideboard:
2 Abandon
2 Kha'Zix, Mutating Horror
2 Ravenbloom Prefect
1 Decree of Insight
1 Vex, Apathetic
`;

describe('parseDecklist', () => {
  it('reads the canonical form', () => {
    const deck = parseDecklist(DIANA);
    assert.equal(deck.legend, 'Diana, Scorn of the Moon');
    assert.equal(deck.champion, 'Diana, Lunari');
    assert.deepEqual(deck.battlefields, ['Rockfall Path', 'Veiled Temple', 'Abandoned Hall']);
    assert.deepEqual(deck.runes, [['Chaos', 7], ['Mind', 5]]);
    assert.equal(deck.main.length, 15);
    assert.deepEqual(deck.main[0], { name: 'Stupefy', qty: 3 });
    assert.equal(deck.sideboard.length, 5);
    assert.deepEqual(deck.warnings, []);
  });

  it('round-trips through serialize', () => {
    const deck = parseDecklist(DIANA);
    assert.deepEqual(parseDecklist(serializeDecklist(deck)), deck);
  });

  it('round-trips a messy paste once it is canonical', () => {
    const messy = parseDecklist('LEGEND\nViktor, Herald of the Arcane\nMAIN DECK (40)\n- 3x Stupefy\n• Gust x2\nx2 Eclipse\nSide:\n1 Abandon');
    const again = parseDecklist(serializeDecklist(messy));
    assert.deepEqual(again, messy);
    assert.equal(serializeDecklist(again), serializeDecklist(messy));
  });

  it('tolerates messy quantity syntax, bullets and casing', () => {
    const deck = parseDecklist([
      'LEGEND',
      'Diana, Scorn of the Moon',
      'MAIN DECK (40)',
      '- 3x Stupefy',
      '• Moonfall x2',
      'x2 Gust',
      '3 × Temporal Breach',
      'Eclipse',
    ].join('\n'));
    assert.equal(deck.legend, 'Diana, Scorn of the Moon');
    assert.deepEqual(deck.main, [
      { name: 'Stupefy', qty: 3 },
      { name: 'Moonfall', qty: 2 },
      { name: 'Gust', qty: 2 },
      { name: 'Temporal Breach', qty: 3 },
      { name: 'Eclipse', qty: 1 },
    ]);
  });

  it('accepts every section alias', () => {
    const deck = parseDecklist('MainDeck:\n1 A\nDeck:\n1 B\nMainboard:\n1 C\nSide:\n1 D\nSide Board:\n1 E\nRune Pool:\n6 Calm\nBattlefield:\nF');
    assert.deepEqual(deck.main.map((e) => e.name), ['A', 'B', 'C']);
    assert.deepEqual(deck.sideboard.map((e) => e.name), ['D', 'E']);
    assert.deepEqual(deck.runes, [['Calm', 6]]);
    assert.deepEqual(deck.battlefields, ['F']);
  });

  it('defaults headerless lines to the main deck', () => {
    assert.deepEqual(parseDecklist('3 Stupefy\n2 Gust').main, [
      { name: 'Stupefy', qty: 3 },
      { name: 'Gust', qty: 2 },
    ]);
  });

  it('merges duplicates with a warning and keeps the first legend', () => {
    const deck = parseDecklist('Legend: A\nLegend: B\nMain:\n2 Gust\n1 Gust');
    assert.equal(deck.legend, 'A');
    assert.deepEqual(deck.main, [{ name: 'Gust', qty: 3 }]);
    assert.equal(deck.warnings.length, 2);
  });

  it('keeps commas inside card names out of the header split', () => {
    assert.deepEqual(parseDecklist('Main:\n3 Hwei, Brooding Painter').main, [{ name: 'Hwei, Brooding Painter', qty: 3 }]);
  });

  it('drops the redundant Rune suffix spreadsheet exports write', () => {
    assert.deepEqual(parseDecklist('Runes:\n6 Mind Rune\n6 Order Rune').runes, [['Mind', 6], ['Order', 6]]);
  });

  it('skips annotation lines that ride along in exports', () => {
    const deck = parseDecklist(['Main:', '3 Stupefy', 'NOTE: share code 9M9C6S', 'Deck name: 派克', '[8 of 10 tiles visible]'].join('\n'));
    assert.deepEqual(deck.main, [{ name: 'Stupefy', qty: 3 }]);
  });

  it('never throws on garbage', () => {
    for (const junk of ['', '\n\n', ':::', '<script>alert(1)</script>', '🃏'.repeat(50), 'x'.repeat(5000)]) {
      assert.doesNotThrow(() => serializeDecklist(parseDecklist(junk)));
    }
  });
});

describe('checkLegality', () => {
  it('passes the Diana list clean', () => {
    assert.deepEqual(checkLegality(parseDecklist(DIANA)), []);
  });

  it('flags size, copy, rune and battlefield problems', () => {
    const warnings = checkLegality(parseDecklist(
      ['Champion: X', 'Battlefields:', 'A', 'B', 'Runes:', '7 Chaos', '6 Lava', 'Main:', '4 Gust'].join('\n'),
    ));
    const has = (s) => warnings.some((w) => w.includes(s));
    assert.ok(has('5 cards'));
    assert.ok(has('4 copies of "Gust"'));
    assert.ok(has('Rune pool is 13'));
    assert.ok(has('"Lava" is not a rune domain'));
    assert.ok(has('2 battlefields'));
  });

  it('counts the champion toward its own copy limit', () => {
    assert.ok(checkLegality(parseDecklist('Champion: Gust\nMain:\n3 Gust')).some((w) => w.includes('4 copies of "Gust"')));
  });

  it('writes no em dashes (house style)', () => {
    const all = [
      ...checkLegality(parseDecklist('Champion: X\nBattlefields:\nA\nRunes:\n7 Lava\nMain:\n4 Gust\nSideboard:\n4 Y')),
      ...parseDecklist('Legend: A\nLegend: B\nMain:\n1 G\n1 G\nBattlefields:\nZ\nZ').warnings,
    ];
    for (const w of all) assert.ok(!w.includes('—'), w);
  });
});

describe('deckNames', () => {
  it('lists every distinct name once, legend first', () => {
    const names = deckNames(parseDecklist('Legend: L\nChampion: C\nBattlefields:\nB\nMain:\n3 M\nSideboard:\n1 M\n1 S'));
    assert.deepEqual(names, ['L', 'C', 'B', 'M', 'S']);
  });
});
