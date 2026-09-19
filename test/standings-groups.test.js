// Standings by group, in points order, and the ongoing matches (2026-09-19,
// Sam, Convergence #3 day: "make it so the standings can alternate through
// the groups more easily", "a graphic that shows ongoing matches",
// "standings should be sorted by points and if no points available, the
// record. Highest record or points first").
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFromFeed, buildFromApi, feedExtras, standings, standingsPatch, pairingsPatch, pairingsRefresh, pairingsSrc,
} from '../server/platform-model.js';
import { DESIGNED, LOOK_SCENES, SCENE_LABELS } from '../web/shared/look.js';
import { SCENE_SOURCES } from '../web/shared/sources.js';
import { TILES } from '../web/shared/looktiles.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

// --- a made-up event: eight players in two groups, two Swiss rounds ---
const T = (es, wins, extra = {}) => ({ Es: es, Wins: wins, Draws: '0', End: '1', ...extra });
const DOC = {
  Name: 'Test Open',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`E${i}:P1`, `u${i}`])),
  'S1:C:Type': 'POOL',
  'S1:R0:T1': { Es: ['1', '2', '3', '4'] },
  'S1:R0:T2': { Es: ['5', '6', '7', '8'] },
  'S2:C:Type': 'GRP',
  'S2:R1:T1': T(['1', '2'], ['2', '0']),
  'S2:R1:T2': T(['3', '4'], ['2', '1']),
  'S2:R1:T3': T(['5', '6'], ['2', '0']),
  'S2:R1:T4': T(['7', '8'], ['0', '2']),
  'S2:R2:T1': T(['1', '3'], ['2', '1']),
  'S2:R2:T2': T(['2', '4'], ['0', '2']),
  'S2:R2:T3': T(['5', '8'], ['2', '1']),
  'S2:R2:T4': T(['6', '7'], ['1', '0'], { End: undefined }),
};
const PLAYERS = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`u${i}`, { name: `Player ${i}`, leader: '' }]));
const feed = (doc = DOC) => buildFromFeed({ doc: Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined)), players: PLAYERS });
const legendOf = () => ({ legend: '', legendSlug: '', legendCardId: '' });

// The same event from TopDeck's API, its standings as TopDeck serves them.
const P = (i) => ({ name: `Player ${i}`, id: `u${i}` });
const done = (a, b, w, wg, lg, table) => ({ table, players: [P(a), P(b)], winner_id: `u${w}`, winner_games: wg, loser_games: lg, status: 'Completed' });
const API = {
  info: { name: 'Test Open', status: 'Ongoing' },
  rounds: [{ round: 1, tables: [done(1, 2, 1, 2, 0, 1), done(3, 4, 3, 2, 1, 2), done(5, 6, 5, 2, 0, 3), done(7, 8, 8, 2, 0, 4)] }],
};
const STAND = (pts) => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: `u${i}`, name: `Player ${i}`, points: pts[i - 1], opponentWinRate: 0.5, gameWinRate: 0.9, opponentGameWinRate: 0.5 }));

describe('platform: standings while TopDeck\'s own lag behind', () => {
  it('counts the tables when TopDeck\'s standings still stand before the round', () => {
    // Convergence #3, round 1: TopDeck listed every player on 0 points while
    // its tables said 1-0; the standings aired everyone on 0, sorted by name.
    const ev = buildFromApi({ ...API, standings: STAND([0, 0, 0, 0, 0, 0, 0, 0]) }, feedExtras(feed()));
    const rows = standings(ev, { group: 1 }).rows;
    assert.deepEqual(rows.map((r) => [r.name, r.record, r.points]), [
      ['Player 1', '1-0', 3], ['Player 3', '1-0', 3], ['Player 4', '0-1', 0], ['Player 2', '0-1', 0],
    ]);
    assert.notEqual(rows[0].gw, 0.9, 'none of TopDeck\'s stale numbers');
  });

  it('takes TopDeck\'s numbers when they count the same results', () => {
    const ev = buildFromApi({ ...API, standings: STAND([3, 0, 3, 0, 3, 0, 0, 3]) }, feedExtras(feed()));
    const rows = standings(ev, { group: 1 }).rows;
    assert.equal(rows[0].gw, 0.9, 'TopDeck\'s own game win rate');
    assert.deepEqual(rows.map((r) => r.points), [3, 3, 0, 0]);
  });
});

describe('platform: standings for every group', () => {
  it('says a round is in progress while a group still plays it', () => {
    assert.equal(standingsPatch(feed(), legendOf, { group: 1 }).patch.event.standings.label, 'after Round 2');
    assert.equal(standingsPatch(feed(), legendOf, { group: 2 }).patch.event.standings.label, 'Round 2 in progress');
    const playing = (k) => ({ ...DOC[k], End: undefined });
    // Round 2 freshly paired: table 1 playing, player 2 with the bye.
    const paired = { ...DOC, 'S2:R2:T1': playing('S2:R2:T1'), 'S2:R2:T2': undefined, 'S2:R2:TB': { Es: ['2'] } };
    const out = standingsPatch(feed(paired), legendOf, { group: 1 });
    const p2 = (o) => o.patch.event.standings.rows.find((r) => r.name === 'Player 2');
    assert.equal(out.patch.event.standings.label, 'after Round 1', 'nothing of round 2 has finished');
    assert.equal(p2(out).record, '0-1', 'the bye waits for the round, so the numbers match the label');
    const started = standingsPatch(feed({ ...paired, 'S2:R2:T1': DOC['S2:R2:T1'] }), legendOf, { group: 1 });
    assert.equal(started.patch.event.standings.label, 'after Round 2');
    assert.equal(p2(started).record, '1-1', 'with the round\'s first result, the bye counts');
  });

  it('loads every group at once, each row tagged, the first group up', () => {
    const out = standingsPatch(feed(), legendOf, { group: 'all', cut: 4, bank: { scenes: { standings: { group: '', page: 3 } } } });
    const st = out.patch.event.standings;
    assert.deepEqual(st.rows.map((r) => r.group), ['Group 1', 'Group 1', 'Group 1', 'Group 1', 'Group 2', 'Group 2', 'Group 2', 'Group 2']);
    assert.deepEqual(st.rows.slice(0, 2).map((r) => r.name), ['Player 1', 'Player 3']);
    assert.equal(st.label, 'Round 2 in progress', 'the latest round, still being played in group 2');
    assert.deepEqual(out.groups, ['Group 1', 'Group 2']);
    assert.deepEqual(out.patch.scenes, { standings: { group: 'Group 1', page: 1 } });
  });

  it('keeps the group and page that are up when fresh numbers come in', () => {
    const out = standingsPatch(feed(), legendOf, { group: 'all', bank: { scenes: { standings: { group: 'Group 2', page: 2 } } } });
    assert.equal(out.patch.scenes, undefined);
  });

  it('puts every player in one list for group 0, and for "all" in an event without groups', () => {
    const one = standingsPatch(feed(), legendOf, { group: 0 });
    assert.equal(one.patch.event.standings.rows.length, 8);
    assert.ok(one.patch.event.standings.rows.every((r) => r.group === ''));
    const flat = buildFromApi({ ...API, standings: STAND([3, 0, 3, 0, 3, 0, 0, 3]) });
    const all = standingsPatch(flat, legendOf, { group: 'all' });
    assert.ok(all.patch.event.standings.rows.every((r) => r.group === ''));
    assert.deepEqual(all.groups, []);
  });
});

describe('platform: pairings that keep up', () => {
  const bankOf = (patch) => ({ event: { name: 'Test Open', pairings: { ...patch.event.pairings } } });

  it('remembers which event, round and group the tables came from', () => {
    const out = pairingsPatch(feed(), legendOf, { round: 'swiss:2', group: 2, id: 'test-open' });
    assert.equal(out.patch.event.pairings.src, 'test-open|swiss:2|2');
    assert.equal(pairingsSrc('', 'swiss:2', 2), '', 'nothing without an event');
  });

  it('brings in a finished table, and nothing when nothing changed', () => {
    const open = feed();
    const bank = bankOf(pairingsPatch(open, legendOf, { round: 'swiss:2', group: 2, id: 'test-open' }).patch);
    assert.equal(pairingsRefresh(open, legendOf, { id: 'test-open', bank }), null, 'same results');
    const finished = feed({ ...DOC, 'S2:R2:T4': T(['6', '7'], ['2', '0']) });
    const next = pairingsRefresh(finished, legendOf, { id: 'test-open', bank });
    const t4 = next.event.pairings.rows.find((r) => r.table === 4);
    assert.deepEqual([t4.status, t4.score, t4.winner], ['done', [2, 0], 'left']);
    assert.equal(next.scenes, undefined, 'never the page');
    assert.equal(next.event.name, undefined);
  });

  it('leaves typed tables and another event\'s tables alone', () => {
    const bank = bankOf(pairingsPatch(feed(), legendOf, { round: 'swiss:2', group: 2, id: 'test-open' }).patch);
    assert.equal(pairingsRefresh(feed(), legendOf, { id: 'other-event', bank }), null);
    bank.event.pairings.src = '';
    assert.equal(pairingsRefresh(feed(), legendOf, { id: 'test-open', bank }), null);
  });
});

// --- the store ---

let applyUpdate;
let applyFeed;
let getState;
before(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ss-standings-test-'));
  process.env.SIDEWAYS_DATA_DIR = dir;
  await writeFile(path.join(dir, 'event.json'), JSON.stringify({ version: 3, preview: {}, program: {}, theme: {} }));
  const state = await import('../server/state.js');
  await state.initState();
  ({ applyUpdate, applyFeed, getState } = state);
});

const row = (name, extra = {}) => ({ name, ...extra });
const names = () => getState().preview.event.standings.rows.map((r) => r.name);

describe('standings order', () => {
  it('puts the most points first, ties in the order they came', () => {
    applyUpdate({ event: { standings: { rows: [row('C', { points: 3 }), row('A', { points: 9 }), row('B', { points: 3 }), row('D', { points: 0 })] } } });
    assert.deepEqual(names(), ['A', 'C', 'B', 'D']);
  });

  it('sorts by the record when no row has points', () => {
    applyUpdate({ event: { standings: { rows: [
      row('Two-one', { record: '2-1' }), row('Three-oh', { record: '3-0' }), row('Nothing'), row('Two-oh-one', { record: '2-0-1' }),
      row('Three-one', { record: '3-1' }), row('Two-one-b', { record: '2 - 1' }),
    ] } } });
    assert.deepEqual(names(), ['Three-oh', 'Three-one', 'Two-oh-one', 'Two-one', 'Two-one-b', 'Nothing']);
  });

  it('sorts each group on its own and keeps the groups in order', () => {
    applyUpdate({ event: { standings: { rows: [
      row('G2 low', { group: 'Group 2', points: 0, record: '0-2' }), row('G1 low', { group: 'Group 1', points: 3 }),
      row('G2 top', { group: 'Group 2', points: 6 }), row('G1 top', { group: 'Group 1', points: 6 }),
    ] } } });
    assert.deepEqual(names(), ['G2 top', 'G2 low', 'G1 top', 'G1 low']);
    assert.deepEqual(getState().preview.event.standings.rows.map((r) => r.group), ['Group 2', 'Group 2', 'Group 1', 'Group 1']);
  });

  it('keeps 80 rows a group and 320 in all', () => {
    const many = (g, n) => Array.from({ length: n }, (_, i) => row(`${g} ${i}`, { group: g, points: 300 - i }));
    applyUpdate({ event: { standings: { rows: [...many('A', 90), ...many('B', 90), ...many('C', 90), ...many('D', 90), ...many('E', 10)] } } });
    const rows = getState().preview.event.standings.rows;
    assert.equal(rows.length, 320);
    assert.equal(rows.filter((r) => r.group === 'A').length, 80);
    assert.equal(rows.filter((r) => r.group === 'E').length, 0, 'full at four groups of 80');
  });

  it('whitelists the group that is up', () => {
    applyUpdate({ scenes: { standings: { group: 'Group 2 with a very long name indeed', page: 2 } } });
    const sc = getState().preview.scenes.standings;
    assert.equal(sc.group, 'Group 2 with a very ');
    assert.equal(sc.page, 2);
  });
});

describe('the pairings feed', () => {
  const tables = (status) => [{ table: 1, left: { name: 'A' }, right: { name: 'B' }, status, score: status === 'done' ? [2, 0] : [0, 0], winner: status === 'done' ? 'left' : '' }];

  it('lands in the bank it names only, on air included, and carries the tables only', () => {
    applyUpdate({ event: { pairings: { rows: tables('live'), label: 'Round 1', src: 'test-open|swiss:1|0' } } });
    applyUpdate({ action: 'take' });
    const v = getState().version;
    applyFeed({ program: { event: { pairings: { rows: tables('done'), label: 'Round 1', src: 'test-open|swiss:1|0' }, name: 'Hijack' }, scenes: { pairings: { visible: true } } } });
    const s = getState();
    assert.equal(s.program.event.pairings.rows[0].status, 'done');
    assert.equal(s.preview.event.pairings.rows[0].status, 'live', 'preview keeps its own');
    assert.notEqual(s.program.event.name, 'Hijack');
    assert.equal(s.program.scenes.pairings.visible, false);
    assert.equal(s.version, v + 1);
  });

  it('drops the source when tables are typed', () => {
    applyUpdate({ event: { pairings: { rows: tables('live') } } });
    assert.equal(getState().preview.event.pairings.src, '');
  });

  it('whitelists the ongoing matches switches', () => {
    applyUpdate({ scenes: { ongoing: { visible: true, page: 9, legends: false, bogus: 1 } } });
    assert.deepEqual(getState().preview.scenes.ongoing, { visible: true, page: 5, legends: false });
  });
});

describe('the ongoing matches graphic', () => {
  it('is a graphic with a label, a source, a look-builder tile and its files', async () => {
    assert.ok(LOOK_SCENES.includes('ongoing'));
    assert.equal(SCENE_LABELS.ongoing, 'Ongoing matches');
    assert.ok(SCENE_SOURCES.some((s) => s.key === 'ongoing' && s.path === '/scenes/ongoing/?transparent=1'));
    assert.ok(TILES.some((t) => t.scene === 'ongoing'));
    assert.deepEqual(DESIGNED.ongoing, DESIGNED.pairings, 'the pairings\' ground');
    for (const file of ['scenes/ongoing/index.html', 'scenes/ongoing/scene.js', 'scenes/ongoing/scene.css']) {
      assert.ok((await stat(path.join(WEB, file))).size > 0, file);
    }
  });
});
