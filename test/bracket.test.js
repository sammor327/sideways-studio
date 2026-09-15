import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BRACKET_FORMATS, buildBracket, cleanBracketResults, matchLabel } from '../web/shared/bracket.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, seed: String(i + 1) }));

describe('bracket model', () => {
  it('has the right match counts and seeds the first round', () => {
    assert.equal(BRACKET_FORMATS.se8.matches.length, 7);
    assert.equal(BRACKET_FORMATS.se16.matches.length, 15);
    assert.equal(BRACKET_FORMATS.de8.matches.length, 14);
    assert.equal(BRACKET_FORMATS.de16.matches.length, 30);
    const b = buildBracket('se8', players(8), {});
    const w1 = b.matches.find((m) => m.id === 'W1');
    assert.equal(w1.top.player.name, 'P1');
    assert.equal(w1.bottom.player.name, 'P8');
    assert.equal(w1.state, 'ready');
    assert.equal(b.matches.find((m) => m.id === 'W5').top.placeholder, 'Winner W1');
    assert.equal(b.matches.find((m) => m.id === 'W5').state, 'waiting');
  });

  it('advances winners, marks losers out, and names a champion', () => {
    const results = { W1: { top: 2, bottom: 0, winner: 'top' }, W2: { top: 1, bottom: 2, winner: 'bottom' }, W3: { top: 2, bottom: 1, winner: 'top' }, W4: { top: 2, bottom: 0, winner: 'top' },
      W5: { top: 2, bottom: 0, winner: 'top' }, W6: { top: 0, bottom: 2, winner: 'bottom' }, GF: { top: 3, bottom: 1, winner: 'top' } };
    const b = buildBracket('se8', players(8), results);
    const w5 = b.matches.find((m) => m.id === 'W5');
    assert.equal(w5.top.player.name, 'P1');
    assert.equal(w5.bottom.player.name, 'P5', 'the 4 vs 5 winner feeds the second slot');
    assert.equal(b.champion.name, 'P1');
    assert.ok(b.eliminated.has('P8'));
    assert.ok(b.eliminated.has('P5'));
    assert.equal(b.matches.find((m) => m.id === 'GF').state, 'done');
  });

  it('drops winners-bracket losers into the losers bracket, crossed', () => {
    const results = { W1: { top: 2, bottom: 0, winner: 'top' }, W2: { top: 2, bottom: 0, winner: 'top' }, W3: { top: 2, bottom: 0, winner: 'top' }, W4: { top: 2, bottom: 0, winner: 'top' },
      W5: { top: 2, bottom: 1, winner: 'top' }, W6: { top: 0, bottom: 2, winner: 'bottom' } };
    const b = buildBracket('de8', players(8), results);
    const l1 = b.matches.find((m) => m.id === 'L1');
    assert.equal(l1.top.player.name, 'P8');
    assert.equal(l1.bottom.player.name, 'P5');
    assert.equal(b.eliminated.has('P8'), false, 'a first loss in double elimination is not out');
    const l3 = b.matches.find((m) => m.id === 'L3');
    assert.equal(l3.top.player.name, 'P2', 'the loser of W6 drops to L3');
    const l4 = b.matches.find((m) => m.id === 'L4');
    assert.equal(l4.top.player.name, 'P4', 'the loser of W5 drops to L4');
    assert.equal(b.matches.find((m) => m.id === 'GF').top.placeholder, 'Winner W7');
  });

  it('labels rounds and cleans results against the format', () => {
    const f = 'de16';
    const gf = BRACKET_FORMATS[f].matches.find((m) => m.id === 'GF');
    assert.equal(matchLabel(f, gf), 'Grand final');
    const w1 = BRACKET_FORMATS[f].matches[0];
    assert.equal(matchLabel(f, w1), 'Winners round 1 1');
    const cleaned = cleanBracketResults({ W1: { top: '2', bottom: 12, winner: 'top' }, W99: { winner: 'top' }, L1: { winner: 'sideways' }, GF: 'nope' }, 'se8');
    assert.deepEqual(cleaned, { W1: { top: 2, bottom: 9, winner: 'top' } });
  });

  it('refuses a winner for a match whose players are not both known', () => {
    const b = buildBracket('se8', players(8), { W5: { top: 2, bottom: 0, winner: 'top' } });
    assert.equal(b.matches.find((m) => m.id === 'W5').winner, '');
  });
});
