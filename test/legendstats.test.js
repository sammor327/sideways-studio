// The legend distribution (2026-09-19): the shared numbers
// (web/shared/legendstats.js), the store's whitelist for its rows and its
// switches, the Tournament platform's count from a TopDeck event, and the
// graphic's registration everywhere a graphic has to be listed.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SLICE_COLORS, OTHER_COLOR, TOP_DEFAULT, legendSlices, sliceColor, winRateOf, splitLegend, slicePath,
  resolveLegend, parseLegendLines, legendsToText, legendsFromStandings,
} from '../web/shared/legendstats.js';
import { DESIGNED, LOOK_SCENES, SCENE_LABELS } from '../web/shared/look.js';
import { SCENE_SOURCES } from '../web/shared/sources.js';
import { TILES } from '../web/shared/looktiles.js';
import { buildFromApi, legendStats, legendStatsPatch } from '../server/platform-model.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} != ${b}`);
const row = (legend, players, extra = {}) => ({ legend, legendSlug: legend.toLowerCase(), legendCardId: '', players, share: null, wins: 0, losses: 0, winRate: null, ...extra });

describe('legend distribution: the numbers', () => {
  it('turns counts into shares, largest first, clockwise from twelve', () => {
    const { slices, total, counted, legends, hasOther } = legendSlices({ rows: [row('B', 30), row('A', 50), row('C', 20)] });
    assert.deepEqual(slices.map((s) => s.legend), ['A', 'B', 'C']);
    assert.deepEqual(slices.map((s) => s.share), [50, 30, 20]);
    assert.equal(total, 100);
    assert.equal(counted, 100);
    assert.equal(legends, 3);
    assert.equal(hasOther, false);
    near(slices[0].start, 0);
    near(slices[1].start, 0.5);
    near(slices[2].start, 0.8);
    assert.equal(slices[2].end, 1, 'the last slice closes the pie exactly');
    assert.deepEqual(slices.map((s) => s.color), SLICE_COLORS.slice(0, 3));
  });

  it('folds the legends past the top into Other with their records added up', () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].map((l, i) => row(l, 10 - i, { wins: 10, losses: 5 + i }));
    const { slices, hasOther } = legendSlices({ rows }, { top: 3 });
    assert.equal(hasOther, true);
    assert.deepEqual(slices.map((s) => s.legend), ['A', 'B', 'C', 'Other legends']);
    const other = slices[3];
    assert.equal(other.other, true);
    assert.equal(other.legends, 2);
    assert.equal(other.players, 7 + 6);
    assert.equal(other.wins, 20);
    assert.equal(other.losses, 8 + 9);
    near(other.winRate, (20 / 37) * 100);
    assert.equal(other.color, OTHER_COLOR);
    near(other.share, (13 / 40) * 100);
  });

  it('draws players the rows do not name as Other, against the typed field size', () => {
    const { slices, total } = legendSlices({ rows: [row('A', 30), row('B', 20)], total: 100 });
    assert.equal(total, 100);
    assert.deepEqual(slices.map((s) => [s.legend, s.share]), [['A', 30], ['B', 20], ['Other legends', 50]]);
    assert.equal(slices[2].legends, 0, 'nothing folded: players the list does not name');
    assert.equal(slices[2].unlisted, true);
    assert.equal(slices[2].winRate, null);
    // A field size smaller than the rows is ignored.
    assert.equal(legendSlices({ rows: [row('A', 30)], total: 10 }).total, 30);
  });

  it('reads a list of percentages, scaling ones that add up past 100', () => {
    const pctRows = [row('A', 0, { share: 40 }), row('B', 0, { share: 35 })];
    const a = legendSlices({ rows: pctRows });
    assert.equal(a.total, 0, 'no counts, so no player total');
    assert.deepEqual(a.slices.map((s) => [s.legend, s.share]), [['A', 40], ['B', 35], ['Other legends', 25]]);
    const b = legendSlices({ rows: [row('A', 0, { share: 60 }), row('B', 0, { share: 60 })] });
    assert.deepEqual(b.slices.map((s) => s.share), [50, 50]);
  });

  it('keeps the seventh slice off blue when it closes the pie', () => {
    assert.equal(sliceColor(6, 7, false), SLICE_COLORS[7], 'violet would touch blue');
    assert.equal(sliceColor(6, 7, true), SLICE_COLORS[6], 'Other sits between them');
    assert.equal(sliceColor(7, 8, false), SLICE_COLORS[7]);
    const seven = legendSlices({ rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l, i) => row(l, 20 - i)) });
    assert.equal(seven.slices[6].color, '#e66767');
    assert.equal(new Set(seven.slices.map((s) => s.color)).size, 7);
  });

  it('never gives more than eight legends a colour of their own', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`L${i}`, 30 - i));
    assert.equal(legendSlices({ rows }, { top: 20 }).slices.length, 9);
    assert.equal(legendSlices({ rows }, { top: 1 }).slices.length, 4, 'at least three');
    assert.equal(legendSlices({ rows }).slices.length, TOP_DEFAULT + 1);
    assert.deepEqual(legendSlices({ rows: [] }).slices, []);
    assert.deepEqual(legendSlices(null).slices, []);
  });

  it('works a win rate out from the record unless one was typed', () => {
    assert.equal(winRateOf({ wins: 3, losses: 1 }), 75);
    assert.equal(winRateOf({ wins: 3, losses: 1, winRate: 50 }), 50);
    assert.equal(winRateOf({ wins: 0, losses: 0 }), null);
    assert.equal(winRateOf({ wins: 0, losses: 0, winRate: 0 }), 0, 'a typed 0% is a win rate');
  });

  it('splits a legend into champion and title', () => {
    assert.deepEqual(splitLegend("Kai'Sa, Daughter of the Void"), { champion: "Kai'Sa", title: 'Daughter of the Void' });
    assert.deepEqual(splitLegend('Viktor'), { champion: 'Viktor', title: '' });
  });

  it('draws slices as SVG paths', () => {
    assert.equal(slicePath(100, 100, 50, 0, 0.25), 'M 100 100 L 100 50 A 50 50 0 0 1 150 100 Z');
    assert.match(slicePath(100, 100, 50, 0, 0.75), / 0 1 1 50 100 Z$/, 'past half a turn takes the large arc');
    const whole = slicePath(100, 100, 50, 0, 1);
    assert.equal((whole.match(/A /g) || []).length, 2, 'a whole pie is two half arcs');
  });
});

describe('legend distribution: the paste', () => {
  const catalog = [
    { name: "Kai'Sa, Daughter of the Void", slug: 'kaisa-daughter-of-the-void', cardId: 'OGN-247' },
    { name: 'Jinx, Loose Cannon', slug: 'jinx-loose-cannon', cardId: 'OGN-251' },
    { name: 'Master Yi, Wuju Bladesman', slug: 'master-yi-wuju-bladesman', cardId: 'OGS-019' },
    { name: 'Master Yi, Wuju Master', slug: 'master-yi-wuju-master', cardId: 'UNL-191' },
  ];
  const resolve = (t) => resolveLegend(catalog, t);

  it('matches legends by full name, champion or a unique part', () => {
    assert.equal(resolve('kaisa').legendSlug, 'kaisa-daughter-of-the-void');
    assert.equal(resolve("Kai'Sa, Daughter of the Void").legendCardId, 'OGN-247');
    assert.equal(resolve('Loose Cannon').legendSlug, 'jinx-loose-cannon');
    assert.equal(resolve('Master Yi'), null, 'two legends: no guess');
    assert.equal(resolve('Wuju Master').legendSlug, 'master-yi-wuju-master');
    assert.equal(resolve('Nobody'), null);
    assert.equal(resolve(''), null);
  });

  it('reads pipes, tabs and plain spaces, counts, shares, records and win rates', () => {
    const { rows, bad, unknown } = parseLegendLines([
      'Kaisa | 42 | 55.1',
      'Jinx\t30\t45-37-2',
      'Wuju Master 12 50%',
      'Nobody | 12.5%',
    ].join('\n'), resolve);
    assert.deepEqual(bad, []);
    assert.deepEqual(unknown, ['Nobody']);
    assert.deepEqual(rows.map((r) => [r.legend, r.players, r.share, r.wins, r.losses, r.winRate]), [
      ["Kai'Sa, Daughter of the Void", 42, null, 0, 0, 55.1],
      ['Jinx, Loose Cannon', 30, null, 45, 37, null],
      ['Master Yi, Wuju Master', 12, null, 0, 0, 50],
      ['Nobody', 0, 12.5, 0, 0, null],
    ]);
  });

  it('counts a column of one legend per player, and merges repeats', () => {
    const { rows } = parseLegendLines('Jinx\nKaisa\njinx\nJinx | 2 | 3-1\n', resolve);
    assert.deepEqual(rows.map((r) => [r.legendSlug, r.players, r.wins, r.losses]), [
      ['jinx-loose-cannon', 4, 3, 1],
      ['kaisa-daughter-of-the-void', 1, 0, 0],
    ]);
  });

  it('reports lines it cannot read', () => {
    const { rows, bad } = parseLegendLines('Jinx | lots\nKaisa | 3 | most\n | 4', resolve);
    assert.equal(rows.length, 0);
    assert.equal(bad.length, 3);
  });

  it('writes rows back in the paste shape', () => {
    const text = legendsToText([
      row("Kai'Sa, Daughter of the Void", 42, { wins: 40, losses: 30 }),
      row('Jinx, Loose Cannon', 30, { winRate: 51.2 }),
      row('Viktor', 0, { share: 12.5 }),
      row('Ahri', 3),
    ]);
    assert.equal(text, "Kai'Sa, Daughter of the Void | 42 | 40-30\nJinx, Loose Cannon | 30 | 51.2\nViktor | 12.5%\nAhri | 3");
    const back = parseLegendLines(text, resolve).rows;
    assert.deepEqual(back.map((r) => [r.players, r.wins, r.losses, r.winRate, r.share]), [[42, 40, 30, null, null], [30, 0, 0, 51.2, null], [0, 0, 0, null, 12.5], [3, 0, 0, null, null]]);
  });

  it('counts standings rows, a player each, with their records', () => {
    const { rows, skipped } = legendsFromStandings([
      { name: 'P1', legend: 'Jinx, Loose Cannon', legendSlug: 'jinx-loose-cannon', record: '5-1-0' },
      { name: 'P2', legend: 'Jinx, Loose Cannon', legendSlug: 'jinx-loose-cannon', record: '3-3' },
      { name: 'P3', legend: 'Typed Only', legendSlug: '', record: '2-4-0' },
      { name: 'P4', legend: '', legendSlug: '', record: '6-0' },
    ]);
    assert.equal(skipped, 1);
    assert.deepEqual(rows.map((r) => [r.legend, r.players, r.wins, r.losses]), [['Jinx, Loose Cannon', 2, 8, 4], ['Typed Only', 1, 2, 4]]);
  });
});

describe('legend distribution: the store', () => {
  let applyUpdate;
  let getState;
  before(async () => {
    process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-legendstats-test-'));
    ({ applyUpdate, getState } = await import('../server/state.js'));
  });

  it('starts empty with the win rate on, every legend but the one-player ones sliced, the table stopped', () => {
    const bank = getState().preview;
    assert.deepEqual(bank.event.legendStats, { rows: [], total: 0, label: '', note: '' });
    assert.deepEqual(bank.scenes.legendstats, {
      visible: false, winRate: true, top: 8, slices: 'multi', focus: [],
      roll: { state: 'stop', at: 0, done: 0 }, autoRoll: true, loop: true, speed: 'normal',
    });
  });

  it('keeps clean rows and drops the rest', () => {
    applyUpdate({ event: { legendStats: {
      rows: [
        { legend: "Kai'Sa, Daughter of the Void", legendSlug: 'kaisa-daughter-of-the-void', legendCardId: 'OGN-247', players: 12, wins: 30, losses: 20, bogus: 1 },
        { legend: 'Percent Only', share: '12.345', winRate: '140' },
        { legend: 'Nothing', players: 0 },
        { legend: '', legendSlug: '' , players: 4 },
        { legend: 'Bad slug', legendSlug: '../../x', legendCardId: '<script>', players: 2, winRate: '' },
        'junk',
      ],
      total: '200', label: 'Group 2 · after Round 3', note: 'x'.repeat(400),
    } } });
    const ls = getState().preview.event.legendStats;
    assert.deepEqual(ls.rows, [
      { legend: "Kai'Sa, Daughter of the Void", legendSlug: 'kaisa-daughter-of-the-void', legendCardId: 'OGN-247', players: 12, share: null, wins: 30, losses: 20, winRate: null },
      { legend: 'Percent Only', legendSlug: '', legendCardId: '', players: 0, share: 12.3, wins: 0, losses: 0, winRate: 100 },
      { legend: 'Bad slug', legendSlug: '', legendCardId: '', players: 2, share: null, wins: 0, losses: 0, winRate: null },
    ]);
    assert.equal(ls.total, 200);
    assert.equal(ls.label, 'Group 2 · after Round 3');
    assert.equal(ls.note.length, 160);
    assert.equal(getState().program.event.legendStats.rows.length, 0, 'edits land in preview');
  });

  it('switches the win rate and clamps the legends shown, and TAKE airs it', () => {
    applyUpdate({ scenes: { legendstats: { visible: true, winRate: false, top: 99, bogus: true, slices: 'most' } } });
    const ls = getState().preview.scenes.legendstats;
    assert.deepEqual([ls.visible, ls.winRate, ls.top, ls.slices, 'bogus' in ls], [true, false, 8, 'multi', false]);
    applyUpdate({ scenes: { legendstats: { top: 1 } } });
    assert.equal(getState().preview.scenes.legendstats.top, 3);
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.legendstats.visible, true);
    assert.equal(getState().program.event.legendStats.rows.length, 3);
    applyUpdate({ action: 'off', scene: 'legendstats' });
    assert.equal(getState().program.scenes.legendstats.visible, false);
  });
});

describe('legend distribution: from a TopDeck event', () => {
  const LEADERS = { u1: 'Leader A', u2: 'Leader A', u3: 'Leader B', u4: 'Leader C', u5: 'Leader B', u6: '' };
  const P = (id) => ({ id, name: `Player ${id.slice(1)}`, ...(LEADERS[id] ? { leader: LEADERS[id] } : {}) });
  const won = (a, b, winner, table) => ({ table, players: [P(a), P(b)], winner_id: winner, winner_games: 2, loser_games: 0, status: 'Completed' });
  const api = {
    info: { name: 'Test Open', status: 'Ongoing' },
    standings: Object.keys(LEADERS).map(P),
    rounds: [
      { round: 1, tables: [won('u1', 'u3', 'u1', 1), { table: 2, players: [P('u2'), P('u4')], winner_id: 'Draw', winner_games: null, loser_games: null, status: 'Completed' }, won('u5', 'u6', 'u5', 3)] },
      { round: 2, tables: [won('u1', 'u2', 'u1', 1), won('u4', 'u3', 'u3', 2), { table: 'Byes', players: [P('u6')] }] },
      { round: 3, tables: [{ table: 1, players: [P('u3'), P('u5')], winner_id: null, winner_games: null, loser_games: null, status: 'Active' }] },
      { round: 'Top 2', tables: [won('u5', 'u1', 'u1', 1)] },
    ],
  };
  const legendOf = (leader) => {
    const first = String(leader || '').split(' / ')[0];
    return first ? { legend: first, legendSlug: first.toLowerCase().replace(/ /g, '-'), legendCardId: '' } : { legend: '', legendSlug: '', legendCardId: '' };
  };

  it('counts players per legend and records against other legends', () => {
    const s = legendStats(buildFromApi(api), legendOf);
    assert.deepEqual(s.rows.map((r) => [r.legend, r.players, r.wins, r.losses]), [
      ['Leader A', 2, 2, 0], ['Leader B', 2, 1, 2], ['Leader C', 1, 0, 1],
    ]);
    assert.equal(s.players, 5);
    assert.equal(s.unknown, 1, 'no legend: left out of the shares');
    assert.equal(s.matches, 3);
    assert.equal(s.mirrors, 1);
    assert.equal(s.draws, 1);
    assert.equal(s.through, 2, 'round 3 is still being played');
    assert.equal(s.cut, true);
  });

  it('counts one group\'s own Swiss', () => {
    const groupOf = new Map([['u1', 1], ['u2', 1], ['u3', 1], ['u4', 2], ['u5', 2], ['u6', 2]]);
    const s = legendStats(buildFromApi(api, { groupOf }), legendOf, { group: 1 });
    assert.deepEqual(s.rows.map((r) => [r.legend, r.players, r.wins, r.losses]), [['Leader A', 2, 1, 0], ['Leader B', 1, 0, 1]]);
    assert.equal(s.cut, false);
  });

  it('becomes a patch the store takes, and says when TopDeck has no legends', () => {
    const out = legendStatsPatch(buildFromApi(api), legendOf);
    assert.equal(out.players, 5);
    assert.equal(out.lead, 'Leader A');
    const ls = out.patch.event.legendStats;
    assert.equal(ls.total, 0);
    assert.equal(ls.label, 'after Round 2 · top cut included');
    assert.match(ls.note, /^Win rate: 3 matches between different legends; mirror matches, draws and byes left out\.$/);
    assert.deepEqual(legendSlices(ls).slices.map((s) => [s.legend, s.share, s.winRate]), [
      ['Leader A', 40, 100], ['Leader B', 40, (1 / 3) * 100], ['Leader C', 20, 0],
    ]);
    const hidden = { ...api, standings: api.standings.map(({ leader, ...p }) => p), rounds: [] };
    assert.match(legendStatsPatch(buildFromApi(hidden), legendOf).error, /no legends for this event yet/);
  });
});

describe('legend distribution: registered as a graphic', () => {
  it('is in the look, the sources, the tiles and both stacks', async () => {
    assert.ok(LOOK_SCENES.includes('legendstats'));
    assert.equal(SCENE_LABELS.legendstats, 'Legend distribution');
    assert.equal(DESIGNED.legendstats.background.kind, 'arrows');
    assert.ok(SCENE_SOURCES.some((s) => s.key === 'legendstats' && s.path === '/scenes/legendstats/?transparent=1'));
    assert.ok(TILES.some((t) => t.scene === 'legendstats'));
    for (const file of ['scenes/legendstats/index.html', 'scenes/legendstats/scene.js', 'scenes/legendstats/scene.css']) {
      assert.ok((await stat(path.join(WEB, file))).size > 500, file);
    }
    assert.match(await readFile(path.join(WEB, 'output', 'index.html'), 'utf8'), /\/scenes\/legendstats\//);
    assert.match(await readFile(path.join(WEB, 'monitor', 'index.html'), 'utf8'), /'legendstats'/);
  });
});
