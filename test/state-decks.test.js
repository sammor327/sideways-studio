import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FULL_FRAME, GAME_HOSTS, GAME_WINDOWS, fitInto, gameNumber, gameWindow } from '../web/shared/gamewindow.js';

let applyUpdate;
let getState;
let buildBank;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-decks-test-'));
  ({ applyUpdate, getState, buildBank } = await import('../server/state.js'));
});

describe('players\' decks and battlefields', () => {
  it('keeps a side\'s own list and the deck it came from', () => {
    applyUpdate({ match: { left: { deckList: 'Legend: Diana\r\nMain:\n3 Stupefy', deckName: '  Diana  ' } } });
    const left = getState().preview.match.left;
    assert.equal(left.deckList, 'Legend: Diana\nMain:\n3 Stupefy');
    assert.equal(left.deckName, 'Diana');
  });

  it('keeps three battlefields at most, drops nameless ones and bad card ids', () => {
    applyUpdate({ match: { right: { battlefields: [
      { name: 'Veiled Temple', cardId: 'SFD-221', played: 1 },
      { name: '' },
      null,
      { name: 'Rockfall Path', cardId: '../etc' },
      { name: 'Abandoned Hall' },
      { name: 'Fourth' },
    ] } } });
    assert.deepEqual(getState().preview.match.right.battlefields, [
      { name: 'Veiled Temple', cardId: 'SFD-221', played: true },
      { name: 'Rockfall Path', cardId: '', played: false },
      { name: 'Abandoned Hall', cardId: '', played: false },
    ]);
  });

  it('marks a battlefield played when it becomes the one in play, matching any case', () => {
    applyUpdate({ match: { right: { battlefield: 'abandoned hall' } } });
    const pool = getState().preview.match.right.battlefields;
    assert.equal(pool[2].played, true);
    assert.equal(pool[1].played, false);
  });

  it('lets a reset clear the marks without the battlefield in play marking itself again', () => {
    const pool = getState().preview.match.right.battlefields.map((b) => ({ ...b, played: false }));
    applyUpdate({ match: { right: { battlefields: pool } } });
    assert.ok(getState().preview.match.right.battlefields.every((b) => !b.played));
    assert.equal(getState().preview.match.right.battlefield, 'abandoned hall');
  });

  it('gives an older save the new fields', () => {
    const bank = buildBank({});
    assert.deepEqual(bank.match.left.battlefields, []);
    assert.equal(bank.match.left.deckList, '');
    assert.equal(bank.scenes.igorows.battlefields, 'off');
    assert.equal(bank.scenes.sideboard.side, 'both');
  });
});

describe('the decks-round graphics', () => {
  it('whitelists the sideboard, the side by side lists, the game intro and the rows battlefields', () => {
    applyUpdate({ scenes: {
      sideboard: { visible: true, side: 'right', extra: 1 },
      decklists: { visible: true, sideboards: false },
      matchup: { visible: true, game: 9 },
      igorows: { battlefields: 'all' },
    } });
    const sc = getState().preview.scenes;
    assert.deepEqual(sc.sideboard, { visible: true, side: 'right' });
    assert.deepEqual(sc.decklists, { visible: true, sideboards: false });
    assert.deepEqual(sc.matchup, { visible: true, game: 5 });
    assert.equal(sc.igorows.battlefields, 'all');
    applyUpdate({ scenes: { sideboard: { side: 'both' } } });
    assert.equal(getState().preview.scenes.sideboard.side, 'both');
    applyUpdate({ scenes: { sideboard: { side: 'right' } } });
    applyUpdate({ scenes: { sideboard: { side: 'middle' }, igorows: { battlefields: 'some' }, matchup: { game: -2 } } });
    assert.equal(getState().preview.scenes.sideboard.side, 'right');
    assert.equal(getState().preview.scenes.igorows.battlefields, 'all');
    assert.equal(getState().preview.scenes.matchup.game, 0);
  });
});

describe('game window', () => {
  const bank = (on) => ({ scenes: Object.fromEntries(GAME_HOSTS.map((k) => [k, { visible: on.includes(k) }])) });

  it('is the whole frame with no in-game overlay up', () => {
    assert.deepEqual(gameWindow(bank([])), { ...FULL_FRAME, host: '' });
  });

  it('is the host overlay\'s table area, the frame-owning layout first', () => {
    assert.deepEqual(gameWindow(bank(['igorows'])), { ...GAME_WINDOWS.igorows, host: 'igorows' });
    assert.equal(gameWindow(bank(['igo1v1', 'igodual'])).host, 'igodual');
  });

  it('fits a design inside, centred, never scaled up past the cap', () => {
    const fit = fitInto({ x: 330, y: 75, w: 1590, h: 930 }, 1600, 900, { margin: 20, max: 1.1 });
    assert.ok(fit.scale < 1);
    assert.ok(fit.x >= 330 && fit.x + 1600 * fit.scale <= 1920);
    assert.ok(fit.y >= 75 && fit.y + 900 * fit.scale <= 1005);
    assert.equal(fitInto(FULL_FRAME, 100, 100, { max: 1 }).scale, 1);
  });
});

describe('game number', () => {
  const match = (l, r, len = 3) => ({ seriesLength: len, left: { gameWins: l }, right: { gameWins: r } });
  it('counts from the game wins and holds to the series length', () => {
    assert.equal(gameNumber(match(0, 0)), 1);
    assert.equal(gameNumber(match(1, 0)), 2);
    assert.equal(gameNumber(match(1, 1)), 3);
    assert.equal(gameNumber(match(2, 1)), 3);
    assert.equal(gameNumber(match(0, 0, 1)), 1);
  });
  it('takes a pinned game over the count', () => {
    assert.equal(gameNumber(match(1, 0), 4), 4);
  });
});
