// The results ticker (2026-09-19, Sam: "an ongoing ticker that fits at the
// bottom of the screen, shows the ongoing results of pairings and matches
// ... name, legend icon, and the result of the game ... rotate and animate
// through them all"). Placement, the tables, the pages and the turn are
// pure (web/shared/ticker.js); the state is scenes.ticker.
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOLD_DEFAULT, LABEL_W, ROLL_MS, SLOT_MIN, STAGGER_MS, TICKER_H, TICKER_HOSTS, TICKER_WINDOWS,
  rollAt, rollTotal, tableDone, tableResult, tablesPerPage, tickerHost, tickerLabel, tickerNote, tickerPages, tickerPlan,
  tickerRows, tickerRun, tickerSlot, tickerSpot,
} from '../web/shared/ticker.js';
import { GAME_WINDOWS } from '../web/shared/gamewindow.js';
import { LT_ANCHORS, LT_FRAME, lowerThirdPlace } from '../web/shared/anchor.js';
import { DESIGNED, LOOK_SCENES, SCENE_LABELS } from '../web/shared/look.js';
import { SCENE_SOURCES } from '../web/shared/sources.js';
import { TILES } from '../web/shared/looktiles.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

// A save from before the ticker: no scenes.ticker anywhere.
const OLD_BANK = {
  event: { name: 'Old Open', roundTitle: 'Round 2' },
  match: { left: { name: 'A' }, right: { name: 'B' } },
  scenes: { pairings: { visible: true } },
};

let applyUpdate;
let getState;
before(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ss-ticker-test-'));
  process.env.SIDEWAYS_DATA_DIR = dir;
  await writeFile(path.join(dir, 'event.json'), JSON.stringify({ version: 3, preview: OLD_BANK, program: OLD_BANK, theme: {} }));
  const state = await import('../server/state.js');
  await state.initState();
  ({ applyUpdate, getState } = state);
});

const row = (table, extra = {}) => ({
  table, left: { name: `Left ${table}` }, right: { name: `Right ${table}` }, status: 'live', score: [0, 0], winner: '', ...extra,
});
const bankWith = (on = [], ticker = {}, rows = []) => ({
  scenes: {
    ...Object.fromEntries(TICKER_HOSTS.map((k) => [k, { visible: on.includes(k) }])),
    ticker: { dock: true, show: 'all', per: 0, hold: HOLD_DEFAULT, ...ticker },
  },
  event: { roundTitle: 'Round 2', pairings: { rows, label: '' } },
});

describe('results ticker: where the bar sits', () => {
  it('runs the full width of the bottom of the frame with no in-game overlay up', () => {
    assert.deepEqual(tickerSpot(bankWith()), { host: '', x: 0, y: 1080 - TICKER_H, w: 1920, h: TICKER_H });
  });

  it('fits along the bottom of the game area an overlay leaves, as wide as it', () => {
    const dual = tickerSpot(bankWith(['igodual']));
    assert.deepEqual(dual, { host: 'igodual', x: 350, y: 1006, w: 1220, h: TICKER_H });
    const rows = tickerSpot(bankWith(['igorows']));
    assert.deepEqual([rows.x, rows.y, rows.w], [330, 75 + 930 - TICKER_H, 1590], 'on the rows overlay, above its bottom bar');
    const bars = tickerSpot(bankWith(['igobars']));
    assert.equal(bars.y + bars.h, 935, 'clear of the 2v2 bars\' bottom cluster');
  });

  it('sits above the arena bug, 16px clear of its pip track', () => {
    const spot = tickerSpot(bankWith(['arenabug']));
    assert.equal(spot.host, 'arenabug');
    assert.equal(spot.y + spot.h, 844);
    assert.equal(spot.w, 1920);
  });

  it('stays inside its window and the frame on every overlay', () => {
    for (const host of TICKER_HOSTS) {
      const spot = tickerSpot(bankWith([host]));
      const win = TICKER_WINDOWS[host];
      assert.equal(spot.host, host);
      assert.ok(spot.x >= 0 && spot.x + spot.w <= 1920 && spot.y >= 0 && spot.y + spot.h <= 1080, host);
      assert.equal(spot.y + spot.h, win.y + win.h, `${host}: along the bottom of its window`);
      if (GAME_WINDOWS[host]) assert.deepEqual(win, GAME_WINDOWS[host], `${host}: the game window the other graphics use`);
    }
  });

  it('prefers the layouts that own the frame over the arena bug, like the sponsor plate', () => {
    assert.equal(tickerHost(bankWith(['arenabug', 'igorows'])), 'igorows');
    assert.equal(tickerHost(bankWith(['arenabug'])), 'arenabug');
  });

  it('keeps to the frame with Fit off, whatever is up', () => {
    assert.deepEqual(tickerSpot(bankWith(['igodual'], { dock: false })), { host: '', x: 0, y: 1006, w: 1920, h: TICKER_H });
  });

  it('gives the tables the bar less its label box', () => {
    assert.equal(tickerRun({ w: 1920 }), 1920 - LABEL_W);
    assert.equal(tickerRun({ w: 100 }), 0);
  });
});

describe('results ticker: the lower third keeps off it', () => {
  // A bank with an overlay (or none) up, the lower third on, and the ticker
  // on or off, with or without tables.
  const lt = (on, { ticker = true, rows = [row(1)] } = {}) => {
    const bank = bankWith(on, { visible: ticker }, rows);
    bank.scenes.lowerthird = { visible: true, dock: true };
    bank.scenes.sponsor = { visible: false, items: [] };
    return lowerThirdPlace(bank, { w: 900 });
  };

  it('rises above the ticker where both run along the same game area', () => {
    assert.equal(lt(['igorows']).bottom, tickerSpot(bankWith(['igorows'])).y - 12);
    assert.equal(lt(['igobars']).bottom, tickerSpot(bankWith(['igobars'])).y - 12);
    assert.equal(lt(['arenabug']).bottom, tickerSpot(bankWith(['arenabug'])).y - 12);
  });

  it('stays put where the two never meet', () => {
    assert.equal(lt([]).bottom, LT_FRAME.bottom, 'the frame: the lower third already sits above the bar');
    assert.equal(lt(['igodual']).bottom, LT_ANCHORS.igodual.bottom);
    assert.equal(lt(['igo1v1']).bottom, LT_ANCHORS.igo1v1.bottom);
  });

  it('only moves for a ticker that is up with tables', () => {
    assert.equal(lt(['igorows'], { ticker: false }).bottom, LT_ANCHORS.igorows.bottom);
    assert.equal(lt(['igorows'], { rows: [] }).bottom, LT_ANCHORS.igorows.bottom, 'a ticker with no tables never airs');
  });
});

describe('results ticker: which tables and what they say', () => {
  const rows = [
    row(1, { status: 'done', score: [2, 1], winner: 'left' }),
    row(2),
    row(3, { status: '', winner: 'right' }),
    { table: 4, left: { name: '' }, right: { name: '' } },
    row(5, { score: [1, 0] }),
  ];

  it('shows every table, the unfinished ones or the finished ones, never a nameless row', () => {
    assert.deepEqual(tickerRows(rows, 'all').map((r) => r.table), [1, 2, 3, 5]);
    assert.deepEqual(tickerRows(rows, 'playing').map((r) => r.table), [2, 5]);
    assert.deepEqual(tickerRows(rows, 'done').map((r) => r.table), [1, 3], 'a typed "= 2-1" sets a winner with no state');
    assert.deepEqual(tickerRows(undefined, 'all'), []);
  });

  it('knows a finished table by its state or its winner', () => {
    assert.equal(tableDone(rows[0]), true);
    assert.equal(tableDone(rows[2]), true);
    assert.equal(tableDone(rows[1]), false);
  });

  it('reads the games, the winner, a draw, a win with no games, a match in progress and VS', () => {
    assert.deepEqual(tableResult(row(1, { status: 'done', score: [2, 1], winner: 'left' })), { kind: 'final', a: '2', b: '1', win: 'left' });
    assert.deepEqual(tableResult(row(1, { status: 'done', score: [0, 2], winner: 'right' })), { kind: 'final', a: '0', b: '2', win: 'right' });
    assert.deepEqual(tableResult(row(1, { status: 'done', score: [1, 1], winner: 'draw' })), { kind: 'draw', a: '1', b: '1', win: '' });
    assert.deepEqual(tableResult(row(1, { status: 'done', winner: 'draw' })), { kind: 'draw', a: '', b: '', win: '' });
    assert.deepEqual(tableResult(row(1, { status: 'done', winner: 'left' })), { kind: 'final', a: 'W', b: 'L', win: 'left' });
    assert.deepEqual(tableResult(row(1, { status: 'done' })), { kind: 'final', a: '', b: '', win: '' });
    assert.deepEqual(tableResult(row(1, { score: [1, 0] })), { kind: 'live', a: '1', b: '0', win: '' });
    assert.deepEqual(tableResult(row(1)), { kind: 'vs', a: '', b: '', win: '' });
    assert.deepEqual(tableResult({ table: 1, left: {}, right: {} }), { kind: 'vs', a: '', b: '', win: '' });
  });
});

describe('results ticker: pages and the turn', () => {
  it('fits as many tables as the run takes, or the operator\'s number, never more than there are', () => {
    assert.equal(tablesPerPage(0, tickerRun({ w: 1920 }), 108), 2, 'two across the full width');
    assert.equal(tablesPerPage(0, tickerRun(tickerSpot(bankWith(['igodual']))), 108), 1, 'one between the dual columns');
    assert.equal(tablesPerPage(0, tickerRun(tickerSpot(bankWith(['igo1v1']))), 108), 2);
    assert.equal(tablesPerPage(0, SLOT_MIN - 1, 108), 1, 'always at least one');
    assert.equal(tablesPerPage(3, 0, 108), 3);
    assert.equal(tablesPerPage(9, 0, 108), 4);
    assert.equal(tablesPerPage(4, 0, 2), 2);
    assert.equal(tablesPerPage(0, 1700, 0), 1);
  });

  it('splits the tables into as few pages as it takes, as even as they go', () => {
    assert.deepEqual(tickerPages(7, 3), [[0, 3], [3, 5], [5, 7]]);
    assert.deepEqual(tickerPages(6, 3), [[0, 3], [3, 6]]);
    assert.deepEqual(tickerPages(1, 2), [[0, 1]]);
    assert.deepEqual(tickerPages(0, 2), []);
    const pages = tickerPages(108, 2);
    assert.equal(pages.length, 54);
    assert.deepEqual(pages.at(-1), [106, 108]);
  });

  it('turns the page every hold on the wall clock, so every copy of the source agrees', () => {
    const period = 6000;
    assert.deepEqual(tickerSlot(5, 6, 0), { index: 0, into: 0, period });
    assert.deepEqual(tickerSlot(5, 6, 6000 * 7 + 1500), { index: 2, into: 1500, period });
    assert.equal(tickerSlot(5, 6, 6000 * 5).index, 0, 'round again after the last page');
    assert.deepEqual(tickerSlot(1, 6, 123456), { index: 0, into: 0, period }, 'one page never turns');
    assert.equal(tickerSlot(3, 1, 0).period, 3000, 'three seconds at least');
    assert.equal(tickerSlot(3, 99, 0).period, 30000, 'thirty at most');
    assert.equal(tickerSlot(3, undefined, 0).period, HOLD_DEFAULT * 1000);
  });

  it('rolls each table over in turn, from the left', () => {
    assert.equal(rollAt(0, 0), 0);
    assert.equal(rollAt(ROLL_MS, 0), 1);
    assert.equal(rollAt(ROLL_MS / 2, 0), 0.5);
    assert.equal(rollAt(STAGGER_MS, 1), 0, 'the second table starts a beat later');
    assert.equal(rollAt(ROLL_MS + STAGGER_MS, 1), 1);
    assert.ok(rollAt(ROLL_MS / 4, 0) < 0.25, 'eased in');
    assert.equal(rollAt(-500, 0), 0, 'a turn timed to start later waits');
    assert.equal(rollTotal(3), ROLL_MS + 2 * STAGGER_MS);
    assert.equal(rollTotal(1), ROLL_MS);
  });
});

describe('results ticker: the label box, the note and the panel\'s plan', () => {
  it('names the round over the word', () => {
    assert.deepEqual(tickerLabel({ show: 'all', title: '' }, { roundTitle: 'Top 8', pairings: { label: 'Round 3 · Group 2' } }), { title: 'Results', round: 'Round 3 · Group 2' });
    assert.deepEqual(tickerLabel({ show: 'playing', title: '' }, { roundTitle: 'Round 4' }), { title: 'Still playing', round: 'Round 4' });
    assert.deepEqual(tickerLabel({ show: 'done', title: 'Around the room' }, {}), { title: 'Around the room', round: '' });
    assert.deepEqual(tickerLabel(undefined, undefined), { title: 'Results', round: '' });
  });

  it('says so when a filter leaves nothing, and only then', () => {
    assert.equal(tickerNote('playing', 8, 0), 'Every table has finished');
    assert.equal(tickerNote('done', 8, 0), 'Results come in as tables finish');
    assert.equal(tickerNote('all', 8, 8), '');
    assert.equal(tickerNote('playing', 0, 0), '', 'no pairings: the bar stays off air instead');
  });

  it('counts what the ticker turns through', () => {
    const rows = [...Array.from({ length: 9 }, (_, i) => row(i + 1)), row(10, { status: 'done', score: [2, 0], winner: 'left' })];
    assert.deepEqual(tickerPlan(bankWith([], { hold: 6 }, rows)), { total: 10, tables: 10, per: 2, pages: 5, cycleMs: 30000, host: '' });
    assert.deepEqual(tickerPlan(bankWith(['igodual'], { show: 'done' }, rows)), { total: 10, tables: 1, per: 1, pages: 1, cycleMs: 6000, host: 'igodual' });
    assert.deepEqual(tickerPlan(bankWith()), { total: 0, tables: 0, per: 1, pages: 0, cycleMs: 0, host: '' });
  });
});

describe('results ticker state', () => {
  it('fills an older save with the ticker off, every table, as many as fit', () => {
    assert.deepEqual(getState().preview.scenes.ticker, { visible: false, show: 'all', per: 0, hold: HOLD_DEFAULT, legends: true, dock: true, title: '' });
    assert.deepEqual(getState().program.scenes.ticker, getState().preview.scenes.ticker);
  });

  it('whitelists its switches and clamps its numbers', () => {
    applyUpdate({ scenes: { ticker: { visible: true, show: 'done', per: 9, hold: 99, legends: 0, dock: false, title: '  Around the room  ', bogus: 1 } } });
    assert.deepEqual(getState().preview.scenes.ticker, { visible: true, show: 'done', per: 4, hold: 30, legends: false, dock: false, title: 'Around the room' });
    applyUpdate({ scenes: { ticker: { title: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' } } });
    assert.equal(getState().preview.scenes.ticker.title, 'ABCDEFGHIJKLMNOPQRSTUVWX', 'twenty-four letters at most');
    applyUpdate({ scenes: { ticker: { show: 'everything', per: -2, hold: 1, title: null } } });
    const tk = getState().preview.scenes.ticker;
    assert.equal(tk.show, 'done', 'an unknown filter is ignored');
    assert.equal(tk.per, 0);
    assert.equal(tk.hold, 3);
    assert.equal(tk.title, '');
  });

  it('airs through TAKE, drops with CLEAR and with its own off', () => {
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.ticker.visible, true);
    assert.equal(getState().program.scenes.ticker.show, 'done');
    applyUpdate({ action: 'clear' });
    assert.equal(getState().program.scenes.ticker.visible, false);
    applyUpdate({ action: 'take' });
    applyUpdate({ action: 'off', scene: 'ticker' });
    assert.equal(getState().program.scenes.ticker.visible, false);
    assert.equal(getState().preview.scenes.ticker.visible, true, 'off drops program only');
  });
});

describe('the results ticker graphic', () => {
  it('is a graphic with a label, a source, a look-builder tile and its files', async () => {
    assert.ok(LOOK_SCENES.includes('ticker'));
    assert.equal(SCENE_LABELS.ticker, 'Results ticker');
    assert.ok(SCENE_SOURCES.some((s) => s.key === 'ticker' && s.path === '/scenes/ticker/?transparent=1'));
    assert.ok(TILES.some((t) => t.key === 'ticker' && t.scene === 'ticker' && t.group === 'parts'));
    for (const file of ['scenes/ticker/index.html', 'scenes/ticker/scene.js', 'scenes/ticker/scene.css', 'shared/ticker.js']) {
      assert.ok((await stat(path.join(WEB, file))).size > 0, file);
    }
  });

  it('wears the slate\'s panel colours on a plate of its own', () => {
    assert.equal(DESIGNED.ticker.colors.plate, DESIGNED.slate.colors.plate);
    assert.equal(DESIGNED.ticker.colors.frame, DESIGNED.slate.colors.frame);
    assert.equal(DESIGNED.ticker.background.kind, 'solid');
  });
});
