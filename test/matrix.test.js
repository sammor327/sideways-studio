// The matchup matrix (2026-09-19): the shared numbers (web/shared/matrix.js),
// the store's whitelist for its data, its settings and its highlight cue,
// the Tournament platform's count from a TopDeck event, Rift Registry's
// event exports, and the graphic's registration everywhere a graphic has to
// be listed.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGENDS_MAX, SIZE_MAX, TIERS, TIER_COLORS, cleanFocus, cleanMatrix, cleanPick, focusAt, legendKey, matrixCounts, matrixFoot,
  matrixToText, matrixView, parseMatchupLines, pctRound, tallyMatrix, tierOf, winPct,
} from '../web/shared/matrix.js';
import { resolveLegend } from '../web/shared/legendstats.js';
import { DESIGNED, LOOK_SCENES, SCENE_LABELS } from '../web/shared/look.js';
import { SCENE_SOURCES } from '../web/shared/sources.js';
import { TILES } from '../web/shared/looktiles.js';
import { buildFromApi, legendStats, matrixPatch, matrixStats } from '../server/platform-model.js';
import { eventDate, eventList, eventMatrix, eventMatrixPatch } from '../server/rrmatrix-model.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const L = (name, extra = {}) => ({ legend: name, legendSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), legendCardId: '', players: 0, wins: 0, losses: 0, draws: 0, ...extra });

describe('matchup matrix: the numbers', () => {
  it('puts a cell and its mirror in mirrored tiers, on the number the cell prints', () => {
    assert.deepEqual([60, 59.6, 59.4, 55, 54.4, 50, 45.6, 45.5, 45, 40.4, 40, 12].map(tierOf),
      ['up2', 'up2', 'up1', 'up1', 'even', 'even', 'even', 'dn1', 'dn1', 'dn2', 'dn2', 'dn2']);
    for (let x = 0; x <= 100; x += 0.5) {
      const mirror = { up2: 'dn2', up1: 'dn1', even: 'even', dn1: 'up1', dn2: 'up2' };
      assert.equal(tierOf(100 - x), mirror[tierOf(x)], `${x} and ${100 - x}`);
      assert.equal(pctRound(x) + pctRound(100 - x), 100, `${x} and its mirror print 100 between them`);
    }
    assert.equal(tierOf(null), '');
    assert.equal(pctRound(undefined), null);
    assert.deepEqual(TIERS.map((t) => t.key), ['dn2', 'dn1', 'even', 'up1', 'up2']);
    assert.equal(TIER_COLORS.up2, '#256abf');
  });

  it('works a win rate out of wins and losses only', () => {
    assert.equal(winPct(3, 1), 75);
    assert.equal(winPct(0, 0), null);
    assert.equal(winPct('2', '2'), 50);
  });

  it('keys a legend by its slug, else its squeezed name', () => {
    assert.equal(legendKey({ legend: 'Jinx, Loose Cannon', legendSlug: 'jinx-loose-cannon' }), 'jinx-loose-cannon');
    assert.equal(legendKey({ legend: "Kai'Sa", legendSlug: '' }), 'n:kaisa');
    assert.equal(legendKey({ legend: '', legendSlug: '' }), '');
  });
});

describe('matchup matrix: the store\'s shape', () => {
  it('keeps clean legends and pairs, merging repeats and turning pairs round', () => {
    const out = cleanMatrix({
      legends: [
        L('Alpha', { players: 3, wins: 5, losses: 2 }),
        { legend: 'Bad slug', legendSlug: '../x', legendCardId: '<b>', players: -4, wins: 'lots' },
        L('Alpha', { players: 1, wins: 1 }),
        'junk',
        { legend: '', legendSlug: '' },
        L('Beta'),
      ],
      pairs: [
        { a: 0, b: 1, wins: 2, losses: 1 },
        { a: 1, b: 0, wins: 4, losses: 0, draws: 1 },
        { a: 2, b: 5, wins: 3, losses: 3 },
        { a: 0, b: 2, wins: 9, losses: 9 },
        { a: 0, b: 9, wins: 1 },
        { a: 'x', b: 1, wins: 1 },
        { a: 0, b: 5, wins: 0, losses: 0, draws: 0 },
      ],
    });
    assert.deepEqual(out.legends.map((l) => [l.legend, l.legendSlug, l.legendCardId, l.players, l.wins, l.losses]), [
      ['Alpha', 'alpha', '', 4, 6, 2], ['Bad slug', '', '', 0, 0, 0], ['Beta', 'beta', '', 0, 0, 0],
    ]);
    // 0-1 twice (the second turned round), 2 is Alpha again (a mirror, gone), 5 is Beta.
    assert.deepEqual(out.pairs, [
      { a: 0, b: 1, wins: 2, losses: 5, draws: 1 },
      { a: 0, b: 2, wins: 3, losses: 3, draws: 0 },
    ]);
  });

  it('holds at most forty legends', () => {
    const legends = Array.from({ length: 50 }, (_, i) => L(`L${i}`));
    assert.equal(cleanMatrix({ legends }).legends.length, LEGENDS_MAX);
    assert.deepEqual(cleanMatrix(null), { legends: [], pairs: [] });
  });

  it('cleans the highlight and the legends picked by hand', () => {
    assert.deepEqual(cleanFocus({ row: 'JINX-loose-cannon', col: '<script>' }), { row: 'jinx-loose-cannon', col: '' });
    assert.deepEqual(cleanFocus(null), { row: '', col: '' });
    assert.deepEqual(cleanPick(['a', 'a', 'n:typed', '../x', ...Array.from({ length: 20 }, (_, i) => `k${i}`)]).slice(0, 3), ['a', 'n:typed', 'k0']);
    assert.equal(cleanPick(Array.from({ length: 20 }, (_, i) => `k${i}`)).length, SIZE_MAX);
  });
});

describe('matchup matrix: the view', () => {
  // Five legends, most played first by players: A 30, B 20, C 10, D 5, E 0.
  const data = {
    legends: [
      L('Echo', { players: 0, wins: 1, losses: 1 }),
      L('Alpha', { players: 30, wins: 30, losses: 20 }),
      L('Bravo', { players: 20, wins: 12, losses: 18, draws: 1 }),
      L('Charlie', { players: 10, wins: 8, losses: 8 }),
      L('Delta', { players: 5, wins: 2, losses: 6 }),
    ],
    pairs: [
      { a: 1, b: 2, wins: 12, losses: 8, draws: 1 },
      { a: 1, b: 3, wins: 3, losses: 1 },
      { a: 2, b: 3, wins: 5, losses: 5 },
      { a: 3, b: 4, wins: 4, losses: 2 },
    ],
  };

  it('puts the most played legends on both axes, the diagonal a mirror', () => {
    const v = matrixView(data, { size: 4, minMatches: 5 });
    assert.deepEqual(v.axis.map((l) => l.legend), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
    assert.ok(v.cells.every((row, i) => row[i].self));
    const ab = v.cells[0][1];
    assert.deepEqual([ab.wins, ab.losses, ab.draws, ab.total, ab.pct, ab.shown, ab.tier], [12, 8, 1, 20, 60, true, 'up2']);
    const ba = v.cells[1][0];
    assert.deepEqual([ba.wins, ba.losses, ba.pct, ba.tier], [8, 12, 40, 'dn2']);
    assert.equal(v.legends, 5);
    assert.equal(v.matches, 12 + 8 + 3 + 1 + 5 + 5 + 4 + 2, 'decided matches, each once');
  });

  it('leaves a cell with too few decided matches bare, and counts it', () => {
    const v = matrixView(data, { size: 4, minMatches: 5 });
    const ac = v.cells[0][2];
    assert.deepEqual([ac.total, ac.shown, ac.tier], [4, false, '']);
    assert.equal(v.cells[0][3].total, 0, 'never met');
    // A-C and C-A (4 matches), C-D and D-C (6 of them: shown); A-D never met.
    assert.equal(v.blank, 2);
    assert.equal(matrixView(data, { size: 4, minMatches: 1 }).blank, 0);
    assert.equal(matrixView(data, { size: 4, minMatches: 999 }).minMatches, 50);
  });

  it('reads the Overall column off each legend\'s own record', () => {
    const v = matrixView(data, { size: 4 });
    assert.deepEqual(v.overall.map((o) => [o.wins, o.losses, o.pct, o.tier]), [
      [30, 20, 60, 'up2'], [12, 18, 40, 'dn2'], [8, 8, 50, 'even'], [2, 6, 25, 'dn2'],
    ]);
  });

  it('draws the legends picked by hand, in the most played order, once two are there', () => {
    const v = matrixView(data, { pick: ['delta', 'n:nobody', 'alpha'] });
    assert.deepEqual(v.axis.map((l) => l.legend), ['Alpha', 'Delta']);
    assert.equal(v.picked, true);
    assert.deepEqual(v.missing, ['n:nobody']);
    const one = matrixView(data, { size: 4, pick: ['delta'] });
    assert.equal(one.picked, false, 'one is not a grid');
    assert.equal(one.axis.length, 4);
    assert.equal(matrixView(data, { size: 1 }).axis.length, 4, 'four at least');
  });

  it('finds the highlighted row, column or cell on the axes', () => {
    const v = matrixView(data, { size: 4 });
    assert.deepEqual(focusAt(v, { row: 'bravo', col: 'delta' }), { r: 1, c: 3 });
    assert.deepEqual(focusAt(v, { row: 'echo', col: '' }), { r: -1, c: -1 }, 'not on the grid');
  });

  it('says what it counted', () => {
    const v = matrixView(data, { size: 4 });
    assert.equal(matrixCounts(v), '40 matches · the 4 most played legends');
    assert.equal(matrixCounts(v, { matches: false }), 'the 4 most played legends', 'a note already counts the matches');
    assert.equal(matrixCounts(matrixView(data, { size: 12 })), '40 matches · 5 legends');
    assert.equal(matrixCounts(matrixView(data, { pick: ['alpha', 'bravo'] }), { matches: false }), '2 legends');
    assert.equal(matrixFoot({ note: 'Counted so.', source: 'Rift Registry' }), 'Counted so. · Data: Rift Registry, riftregistry.com');
    assert.equal(matrixFoot({ note: '', source: 'TopDeck.gg' }), 'Data: TopDeck.gg');
    assert.equal(matrixCounts(matrixView({ legends: [], pairs: [] })), '');
  });
});

describe('matchup matrix: tallying games', () => {
  const A = { legend: 'Alpha', legendSlug: 'alpha', legendCardId: 'X-1' };
  const B = { legend: 'Bravo', legendSlug: 'bravo', legendCardId: '' };
  const C = { legend: 'Typed', legendSlug: '', legendCardId: '' };

  it('keeps each pair\'s record and each legend\'s, mirrors and unknowns aside', () => {
    const t = tallyMatrix({
      players: [A, A, B, C, null],
      games: [
        { a: A, b: B, result: 'a' }, { a: B, b: A, result: 'a' }, { a: A, b: B, result: 'd' },
        { a: A, b: A, result: 'a' }, { a: A, b: null, result: 'a' }, { a: C, b: A, result: 'b' }, { a: A, b: B, result: 'x' },
      ],
    });
    assert.deepEqual(t.legends.map((l) => [l.legend, l.players, l.wins, l.losses, l.draws]), [
      ['Alpha', 2, 2, 1, 1], ['Bravo', 1, 1, 1, 1], ['Typed', 1, 0, 1, 0],
    ]);
    assert.deepEqual(t.pairs, [{ a: 0, b: 1, wins: 1, losses: 1, draws: 1 }, { a: 0, b: 2, wins: 1, losses: 0, draws: 0 }]);
    assert.deepEqual([t.matches, t.mirrors, t.draws, t.unknownGames], [3, 1, 1, 2]);
  });

  it('keeps the forty most played and says how many it left out', () => {
    const ids = Array.from({ length: 45 }, (_, i) => ({ legend: `L${i}`, legendSlug: `l${i}`, legendCardId: '' }));
    const t = tallyMatrix({ players: ids.flatMap((id, i) => Array(50 - i).fill(id)), games: [{ a: ids[0], b: ids[44], result: 'a' }] });
    assert.equal(t.legends.length, LEGENDS_MAX);
    assert.equal(t.dropped, 5);
    assert.deepEqual(t.pairs, [], 'the pair with a legend left out goes');
    assert.equal(t.legends[0].wins, 1, 'but the legend kept keeps its record');
  });
});

describe('matchup matrix: the paste', () => {
  const catalog = [
    { name: "Kai'Sa, Daughter of the Void", slug: 'kaisa-daughter-of-the-void', cardId: 'OGN-247' },
    { name: 'Jinx, Loose Cannon', slug: 'jinx-loose-cannon', cardId: 'OGN-251' },
    { name: 'Viktor, Herald of the Arcane', slug: 'viktor-herald-of-the-arcane', cardId: 'OGN-001' },
  ];
  const resolve = (t) => resolveLegend(catalog, t);

  it('reads "vs" lines, pipes, tabs and en dashes, both ways round', () => {
    const out = parseMatchupLines([
      'Kaisa vs Jinx | 12-8',
      'Jinx | Kaisa | 3-1-1',
      'Viktor v. Kaisa 6–9',
      'Jinx\tViktor\t10-10',
      'Nobody versus Jinx: 2-0',
      'Kaisa vs Kaisa 3-3',
      'Jinx vs Viktor | lots',
      'just words',
    ].join('\n'), resolve);
    assert.deepEqual(out.bad, ['Kaisa vs Kaisa 3-3', 'Jinx vs Viktor | lots', 'just words']);
    assert.deepEqual(out.unknown, ['Nobody']);
    const name = (i) => out.legends[i].legend;
    assert.deepEqual(out.pairs.map((p) => [name(p.a), name(p.b), p.wins, p.losses, p.draws]), [
      ["Kai'Sa, Daughter of the Void", 'Jinx, Loose Cannon', 13, 11, 1],
      ["Kai'Sa, Daughter of the Void", 'Viktor, Herald of the Arcane', 9, 6, 0],
      ['Jinx, Loose Cannon', 'Viktor, Herald of the Arcane', 10, 10, 0],
      ['Jinx, Loose Cannon', 'Nobody', 0, 2, 0],
    ]);
    // The Overall column counts the typed matchups.
    const kaisa = out.legends.find((l) => l.legendSlug === 'kaisa-daughter-of-the-void');
    assert.deepEqual([kaisa.wins, kaisa.losses, kaisa.draws], [22, 17, 1]);
  });

  it('writes the matchups back once each, most played first, and reads them again the same', () => {
    const first = parseMatchupLines('Kaisa vs Jinx | 12-8\nViktor vs Kaisa | 9-6\nJinx vs Viktor | 1-3-2', resolve);
    const text = matrixToText(first);
    assert.equal(text, [
      "Kai'Sa, Daughter of the Void vs Jinx, Loose Cannon | 12-8",
      "Kai'Sa, Daughter of the Void vs Viktor, Herald of the Arcane | 6-9",
      'Jinx, Loose Cannon vs Viktor, Herald of the Arcane | 1-3-2',
    ].join('\n'));
    const again = parseMatchupLines(text, resolve);
    assert.deepEqual(matrixView(again).cells, matrixView(first).cells);
  });

  it('reads legend lines: players and an overall record, in either order', () => {
    const out = parseMatchupLines([
      "Kaisa | 42 players | 74-63-2 overall",
      'Jinx | 30-28 overall | 17',
      'Viktor | 9',
      'Kaisa vs Jinx | 12-8',
      'Jinx | 12-8',
      'Viktor | lots',
    ].join('\n'), resolve);
    assert.deepEqual(out.bad, ['Jinx | 12-8', 'Viktor | lots'], 'a record needs an opponent, a count needs digits');
    const by = (slug) => out.legends.find((l) => l.legendSlug === slug);
    assert.deepEqual([by('kaisa-daughter-of-the-void').players, by('kaisa-daughter-of-the-void').wins, by('kaisa-daughter-of-the-void').losses, by('kaisa-daughter-of-the-void').draws], [42, 74, 63, 2], 'its own overall wins over the typed matchup');
    assert.deepEqual([by('jinx-loose-cannon').players, by('jinx-loose-cannon').wins, by('jinx-loose-cannon').losses], [17, 30, 28]);
    assert.deepEqual([by('viktor-herald-of-the-arcane').players, by('viktor-herald-of-the-arcane').wins], [9, 0], 'no matchups, no overall line: 0-0');
    assert.equal(out.pairs.length, 1);
  });

  it('writes a loaded event back with its legend lines, so editing it loses nothing', () => {
    // A loaded lot: players on every legend, and Overall columns that count
    // opponents off the list (so they are more than the matchups add up to).
    const loaded = cleanMatrix({
      legends: [
        { legend: "Kai'Sa, Daughter of the Void", legendSlug: 'kaisa-daughter-of-the-void', players: 42, wins: 30, losses: 20, draws: 1 },
        { legend: 'Jinx, Loose Cannon', legendSlug: 'jinx-loose-cannon', players: 20, wins: 12, losses: 18, draws: 1 },
        { legend: 'Viktor, Herald of the Arcane', legendSlug: 'viktor-herald-of-the-arcane', players: 3, wins: 0, losses: 0, draws: 0 },
      ],
      pairs: [{ a: 0, b: 1, wins: 12, losses: 8, draws: 1 }],
    });
    const text = matrixToText(loaded);
    assert.equal(text.split('\n')[0], "Kai'Sa, Daughter of the Void | 42 players | 30-20-1 overall");
    assert.equal(text.split('\n')[2], 'Viktor, Herald of the Arcane | 3 players', 'its matchups add up to its record: no overall');
    const back = parseMatchupLines(text, resolve);
    assert.deepEqual(back.legends.map((l) => [l.legend, l.players, l.wins, l.losses, l.draws]), loaded.legends.map((l) => [l.legend, l.players, l.wins, l.losses, l.draws]));
    assert.deepEqual(back.pairs, loaded.pairs);
    // One matchup edited: every legend keeps its players, so the grid keeps
    // its most played order.
    const edited = parseMatchupLines(text.replace('| 12-8-1', '| 13-7-1'), resolve);
    assert.deepEqual(edited.legends.map((l) => l.players), [42, 20, 3]);
    assert.deepEqual(edited.pairs[0], { a: 0, b: 1, wins: 13, losses: 7, draws: 1 });
  });
});

describe('matchup matrix: the store', () => {
  let applyUpdate;
  let getState;
  const banks = () => [getState().preview, getState().program];
  before(async () => {
    process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-matrix-test-'));
    ({ applyUpdate, getState } = await import('../server/state.js'));
  });

  it('starts empty with the eight most played, five matches a cell, the Overall column and records on', () => {
    const bank = getState().preview;
    assert.deepEqual(bank.event.matrix, { legends: [], pairs: [], title: '', label: '', note: '', source: '' });
    assert.deepEqual(bank.scenes.matrix, { visible: false, size: 8, pick: [], minMatches: 5, overall: true, records: true, focus: { row: '', col: '' } });
  });

  it('keeps clean data in preview, and new legends without a credit drop the old one', () => {
    applyUpdate({ event: { matrix: {
      legends: [L('Alpha', { players: 2, wins: 3 }), L('Beta', { legendCardId: 'OGN-9' }), { legend: '<script>', legendSlug: 'x/y' }],
      pairs: [{ a: 1, b: 0, wins: 1, losses: 3 }, { a: 0, b: 7, wins: 1 }],
      title: 'Regional Qualifier: Singapore', label: 'Sep 5, 2026 · Vendetta', note: 'n'.repeat(300), source: 'Rift Registry', bogus: 1,
    } } });
    const mx = getState().preview.event.matrix;
    assert.deepEqual(mx.pairs, [{ a: 0, b: 1, wins: 3, losses: 1, draws: 0 }]);
    assert.equal(mx.legends.length, 3);
    assert.equal(mx.legends[2].legendSlug, '');
    assert.deepEqual([mx.title, mx.label, mx.note.length, mx.source, 'bogus' in mx], ['Regional Qualifier: Singapore', 'Sep 5, 2026 · Vendetta', 200, 'Rift Registry', false]);
    assert.equal(getState().program.event.matrix.legends.length, 0, 'edits land in preview');
    applyUpdate({ event: { matrix: { label: 'relabelled' } } });
    assert.equal(getState().preview.event.matrix.source, 'Rift Registry', 'a label alone keeps the credit');
    applyUpdate({ event: { matrix: { legends: [L('Gamma')], pairs: [] } } });
    const typed = getState().preview.event.matrix;
    assert.deepEqual([typed.legends.length, typed.title, typed.source, typed.label, typed.note], [1, '', '', '', ''], 'the loaded lot\'s words go with its credit');
    applyUpdate({ event: { matrix: { label: 'typed label', note: 'typed note' } } });
    applyUpdate({ event: { matrix: { legends: [L('Gamma'), L('Delta')], pairs: [], title: 'Kept' } } });
    const again = getState().preview.event.matrix;
    assert.deepEqual([again.legends.length, again.title, again.label, again.note], [2, 'Kept', 'typed label', 'typed note'], 'words typed for typed matchups stay');
  });

  it('clamps the settings, and TAKE airs them', () => {
    applyUpdate({ scenes: { matrix: { visible: true, size: 99, minMatches: 0, overall: false, records: 0, pick: ['alpha', 'alpha', '../x'], bogus: 1 } } });
    const sc = getState().preview.scenes.matrix;
    assert.deepEqual([sc.visible, sc.size, sc.minMatches, sc.overall, sc.records, sc.pick, 'bogus' in sc], [true, 12, 1, false, false, ['alpha'], false]);
    applyUpdate({ scenes: { matrix: { size: 2, minMatches: 70 } } });
    assert.deepEqual([getState().preview.scenes.matrix.size, getState().preview.scenes.matrix.minMatches], [4, 50]);
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.matrix.visible, true);
    applyUpdate({ action: 'off', scene: 'matrix' });
    assert.equal(getState().program.scenes.matrix.visible, false);
  });

  it('highlights a row, a column or a cell on both banks at once', () => {
    applyUpdate({ action: 'focus', scene: 'matrix', row: 'alpha' });
    for (const bank of banks()) assert.deepEqual(bank.scenes.matrix.focus, { row: 'alpha', col: '' });
    applyUpdate({ action: 'focus', scene: 'matrix', col: 'BETA' });
    for (const bank of banks()) assert.deepEqual(bank.scenes.matrix.focus, { row: 'alpha', col: 'beta' });
    applyUpdate({ action: 'focus', scene: 'matrix', row: '', col: '<b>' });
    assert.deepEqual(getState().program.scenes.matrix.focus, { row: '', col: '' });
    applyUpdate({ action: 'focus', scene: 'matrix', row: 'alpha', col: 'beta' });
    applyUpdate({ action: 'focus', scene: 'matrix', clear: true, row: 'alpha' });
    for (const bank of banks()) assert.deepEqual(bank.scenes.matrix.focus, { row: '', col: '' });
  });
});

describe('matchup matrix: from a TopDeck event', () => {
  // The legend distribution's fixture: a mirror (u1-u2), a draw, a bye, a
  // table still being played and a top 2.
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

  it('counts every legend against every other, and agrees with the legend distribution', () => {
    const ev = buildFromApi(api);
    const s = matrixStats(ev, legendOf);
    assert.deepEqual(s.legends.map((l) => [l.legend, l.players, l.wins, l.losses, l.draws]), [
      ['Leader A', 2, 2, 0, 1], ['Leader B', 2, 1, 2, 0], ['Leader C', 1, 0, 1, 1],
    ]);
    const name = (i) => s.legends[i].legend;
    assert.deepEqual(s.pairs.map((p) => [name(p.a), name(p.b), p.wins, p.losses, p.draws]), [
      ['Leader A', 'Leader B', 2, 0, 0], ['Leader A', 'Leader C', 0, 0, 1], ['Leader B', 'Leader C', 1, 0, 0],
    ]);
    assert.deepEqual([s.matches, s.mirrors, s.draws, s.through, s.cut, s.unknown], [3, 1, 1, 2, true, 1]);
    // The Overall column is the legend distribution's win rate.
    const dist = legendStats(ev, legendOf).rows;
    for (const l of s.legends) {
      const d = dist.find((r) => r.legend === l.legend);
      assert.deepEqual([l.wins, l.losses], [d.wins, d.losses], l.legend);
    }
  });

  it('becomes a patch the store takes, and says when TopDeck has no legends', () => {
    const out = matrixPatch(buildFromApi(api), legendOf);
    const mx = out.patch.event.matrix;
    assert.deepEqual([mx.title, mx.label, mx.source], ['', 'after Round 2 · top cut included', 'TopDeck.gg']);
    assert.match(mx.note, /^Win rate across the row: 3 matches between different legends; mirror matches, draws and byes left out\.$/);
    assert.deepEqual([out.legends, out.matches, out.players, out.unknown, out.dropped], [3, 3, 5, 1, 0]);
    assert.deepEqual(cleanMatrix(mx), { legends: mx.legends, pairs: mx.pairs }, 'already clean');
    // Like the pairings: an event with no name takes TopDeck's.
    assert.equal(out.patch.event.name, undefined);
    assert.equal(matrixPatch(buildFromApi(api), legendOf, { bank: { event: { name: '' } } }).patch.event.name, 'Test Open');
    assert.equal(matrixPatch(buildFromApi(api), legendOf, { bank: { event: { name: 'Mine' } } }).patch.event.name, undefined);
    const groupOf = new Map([['u1', 1], ['u2', 1], ['u3', 1], ['u4', 2], ['u5', 2], ['u6', 2]]);
    const g1 = matrixPatch(buildFromApi(api, { groupOf }), legendOf, { group: 1 });
    assert.equal(g1.patch.event.matrix.label, 'Group 1 · after Round 2');
    const hidden = { ...api, standings: api.standings.map(({ leader, ...p }) => p), rounds: [] };
    assert.match(matrixPatch(buildFromApi(hidden), legendOf).error, /no legends for this event yet/);
    const unplayed = { ...api, rounds: [] };
    assert.match(matrixPatch(buildFromApi(unplayed), legendOf).error, /No finished match between two different legends/);
  });
});

describe('matchup matrix: from a Rift Registry event', () => {
  const doc = {
    event: { id: 'RQ-TST-2026', name: 'Regional Qualifier: Test', start_date: '2026-09-05', set_format: 'Vendetta' },
    results: { rows: [
      { player_id: 1, legend: 'Kennen, Heart of the Tempest' },
      { player_id: 2, legend: 'Kennen, Heart of the Tempest' },
      { player_id: 3, legend: 'Irelia, Blade Dancer' },
      { player_id: 4, legend: 'Unknown Legend' },
      { player_id: 5, legend: '' },
      { player_id: 6, legend: null },
    ] },
    rounds: { pairings_per_round: [
      { matches: [
        { winner: { player_id: 1 }, loser: { player_id: 3 }, result: 'win' },
        { winner: { player_id: 4 }, loser: { player_id: 2 }, result: 'win' },
        { winner: { player_id: 5 }, loser: { player_id: 6 }, result: 'win' },
      ] },
      { matches: [
        { winner: { player_id: 1 }, loser: { player_id: 2 }, result: 'win' },
        { player_a: { player_id: 3 }, player_b: { player_id: 4 }, result: 'draw' },
        { winner: { player_id: 3 }, loser: { player_id: 99 }, result: 'win' },
        'junk',
      ] },
    ] },
  };
  const known = { kennenheartofthetempest: 'kennen-heart-of-the-tempest', ireliabladedancer: 'irelia-blade-dancer' };
  const legendOf = (name) => {
    const slug = known[String(name).toLowerCase().replace(/[^a-z0-9]/g, '')];
    return { legend: String(name), legendSlug: slug || '', legendCardId: '' };
  };

  it('lists the events that have happened, newest first', () => {
    const list = eventList({ events: [
      { id: 'RQ-LAX-2026', name: 'Regional Qualifier: Los Angeles', start_date: '2026-09-25' },
      { id: 'RQ-BAR-2026', name: 'Barcelona', start_date: '2026-08-22', generated: 'g1' },
      { id: 'RQ-SIN-2026', name: 'Singapore', start_date: '2026-09-05' },
      { id: '../etc', name: 'bad id', start_date: '2026-01-01' },
    ] }, '2026-09-19');
    assert.deepEqual(list.map((e) => e.id), ['RQ-SIN-2026', 'RQ-BAR-2026']);
    assert.equal(list[1].generated, 'g1');
    assert.deepEqual(eventList(null), []);
    assert.equal(eventDate('2026-09-05'), 'Sep 5, 2026');
  });

  it('tallies the export: legends from the results, matches from the pairings', () => {
    const s = eventMatrix(doc, legendOf);
    assert.deepEqual(s.legends.map((l) => [l.legend, l.players, l.wins, l.losses, l.draws]), [
      ['Kennen, Heart of the Tempest', 2, 1, 1, 0], ['Irelia, Blade Dancer', 1, 0, 1, 1], ['Unknown Legend', 1, 1, 0, 1],
    ]);
    assert.deepEqual([s.players, s.unknown, s.mirrors, s.matches, s.draws, s.unknownGames, s.rounds], [4, 2, 1, 2, 1, 2, 2]);
    assert.deepEqual([s.name, s.date, s.set], ['Regional Qualifier: Test', '2026-09-05', 'Vendetta']);
  });

  it('becomes a patch naming the event and crediting Rift Registry', () => {
    const out = eventMatrixPatch(doc, legendOf);
    const mx = out.patch.event.matrix;
    assert.deepEqual([mx.title, mx.label, mx.source], ['Regional Qualifier: Test', 'Sep 5, 2026 · Vendetta', 'Rift Registry']);
    assert.match(mx.note, /^Win rate across the row: 2 matches between different legends/);
    assert.match(eventMatrixPatch({ ...doc, rounds: {} }, legendOf).error, /no round by round pairings/);
    assert.match(eventMatrixPatch({ ...doc, results: { rows: [] } }, legendOf).error, /lists no legends/);
  });
});

describe('matchup matrix: registered as a graphic', () => {
  it('is in the look, the sources, the tiles and both stacks', async () => {
    assert.ok(LOOK_SCENES.includes('matrix'));
    assert.equal(SCENE_LABELS.matrix, 'Matchup matrix');
    assert.equal(DESIGNED.matrix.background.kind, 'arrows');
    assert.ok(SCENE_SOURCES.some((s) => s.key === 'matrix' && s.path === '/scenes/matrix/?transparent=1'));
    assert.ok(TILES.some((t) => t.scene === 'matrix'));
    for (const file of ['scenes/matrix/index.html', 'scenes/matrix/scene.js', 'scenes/matrix/scene.css']) {
      assert.ok((await stat(path.join(WEB, file))).size > 500, file);
    }
    assert.match(await readFile(path.join(WEB, 'output', 'index.html'), 'utf8'), /\/scenes\/matrix\//);
    assert.match(await readFile(path.join(WEB, 'monitor', 'index.html'), 'utf8'), /'matrix'/);
  });
});
