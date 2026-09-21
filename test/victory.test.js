// The victory set's one reading of who won (2026-09-20).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gameWinner, gamesToWin, matchWinner, victory } from '../web/shared/victory.js';

const match = (over = {}) => ({
  seriesLength: 3,
  result: { winner: '', note: '' },
  left: { name: 'MARA', gameWins: 0, score: 0 },
  right: { name: 'THEO', gameWins: 0, score: 0 },
  ...over,
});

describe('who the victory graphics name', () => {
  it('counts the games a side has to take', () => {
    assert.equal(gamesToWin({ seriesLength: 3 }), 2);
    assert.equal(gamesToWin({ seriesLength: 5 }), 3);
    assert.equal(gamesToWin({}), 2);
  });

  it('names nobody until a side has won the series', () => {
    assert.equal(matchWinner(match()), '');
    assert.equal(matchWinner(match({ left: { name: 'MARA', gameWins: 1 }, right: { name: 'THEO', gameWins: 1 } })), '');
  });

  it('names the side that reached the games it takes', () => {
    assert.equal(matchWinner(match({ left: { name: 'MARA', gameWins: 2 }, right: { name: 'THEO', gameWins: 1 } })), 'left');
    assert.equal(matchWinner(match({ seriesLength: 5, right: { name: 'THEO', gameWins: 3 }, left: { name: 'MARA', gameWins: 0 } })), 'right');
  });

  it('lets the operator\'s own winner and a graphic\'s pin overrule the count', () => {
    const m = match({ left: { name: 'MARA', gameWins: 2 }, right: { name: 'THEO', gameWins: 0 } });
    assert.equal(matchWinner({ ...m, result: { winner: 'right' } }), 'right');
    assert.equal(matchWinner(m, 'right'), 'right');
    assert.equal(matchWinner(m, 'nonsense'), 'left');
  });

  it('names the game just won from whoever went ahead, and nobody on level games', () => {
    assert.equal(gameWinner(match({ left: { gameWins: 1 }, right: { gameWins: 0 } })), 'left');
    assert.equal(gameWinner(match({ left: { gameWins: 1 }, right: { gameWins: 2 } })), 'right');
    assert.equal(gameWinner(match({ left: { gameWins: 1 }, right: { gameWins: 1 } })), '');
    assert.equal(gameWinner(match({ left: { gameWins: 1 }, right: { gameWins: 1 } }), 'right'), 'right');
  });

  it('prints the winner\'s games first, whichever seat they are in', () => {
    const m = match({ seriesLength: 5, left: { name: 'MARA', gameWins: 1, score: 4 }, right: { name: 'THEO', gameWins: 3, score: 8 } });
    const v = victory(m, matchWinner(m));
    assert.equal(v.won, true);
    assert.equal(v.winner.name, 'THEO');
    assert.equal(v.loser.name, 'MARA');
    assert.equal(v.games, '3 - 1');
    assert.equal(v.points, '8 - 4');
    assert.equal(v.bestOf, 'Best of 5');
  });

  it('says nobody won rather than guessing', () => {
    const v = victory(match(), '');
    assert.equal(v.won, false);
    assert.equal(v.games, '0 - 0');
  });
});
