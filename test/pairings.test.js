// The pairings graphic and the standings' Legends switch (2026-09-19, Sam:
// "make the standings show the legend portrait next to them and the legend
// name to the right ... as a toggle option in case legend options are not
// available" and "a pairing graphic to review all the current matches for
// the round"). The TopDeck side is tested with the platform fixtures in
// platform.test.js.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGNED, LOOK_SCENES, SCENE_LABELS, emptyLook, emptySceneLook, resolveLook } from '../web/shared/look.js';
import { SCENE_SOURCES } from '../web/shared/sources.js';
import { TILES } from '../web/shared/looktiles.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

// A save from before this round: no pairings anywhere, standings without the
// Legends switch.
const OLD_BANK = {
  event: { name: 'Old Open', roundTitle: 'Round 2', standings: { rows: [{ name: 'Guubums' }], cut: 8 } },
  match: { left: { name: 'A' }, right: { name: 'B' } },
  scenes: { standings: { visible: true, page: 2 } },
};

let applyUpdate;
let getState;
before(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ss-pairings-test-'));
  process.env.SIDEWAYS_DATA_DIR = dir;
  await writeFile(path.join(dir, 'event.json'), JSON.stringify({ version: 7, preview: OLD_BANK, program: OLD_BANK, theme: {} }));
  const state = await import('../server/state.js');
  await state.initState();
  ({ applyUpdate, getState } = state);
});

const side = (name, extra = {}) => ({ name, record: '2-1', legend: 'Irelia, Blade Dancer', legendSlug: 'irelia-blade-dancer', legendCardId: 'OGN-259', ...extra });

describe('pairings and standings state', () => {
  it('fills an older save with the new fields, the Legends switch on', () => {
    const bank = getState().preview;
    assert.deepEqual(bank.event.pairings, { rows: [], label: '', byes: [] });
    assert.deepEqual(bank.scenes.pairings, { visible: false, page: 1, legends: true, results: true });
    assert.deepEqual(bank.scenes.standings, { visible: true, page: 2, legends: true });
    assert.equal(bank.event.standings.rows[0].name, 'Guubums');
  });

  it('cleans pairing rows: names, table numbers, states, games and winners', () => {
    applyUpdate({ event: { pairings: {
      label: 'Round 3 · Group 2',
      byes: ['Nadia Frost', '', 42],
      rows: [
        { table: 12, left: side('Dax', { country: 'us' }), right: side('Shoji'), status: 'done', score: [2, 1], winner: 'left' },
        { table: '7', left: side('Margaux'), right: side('Guubums'), status: 'live' },
        { table: 99999, left: { name: 'Only One' }, right: {}, status: 'finished', score: [12, -3], winner: 'nobody' },
        { left: { name: '' }, right: { name: '' } },
        'not a row',
      ],
    } } });
    const pr = getState().preview.event.pairings;
    assert.equal(pr.label, 'Round 3 · Group 2');
    assert.deepEqual(pr.byes, ['Nadia Frost', '42']);
    assert.equal(pr.rows.length, 3, 'a row with no name and a non-object drop');
    const [a, b, c] = pr.rows;
    assert.equal(a.table, 12);
    assert.equal(a.left.country, 'US');
    assert.equal(a.left.legendSlug, 'irelia-blade-dancer');
    assert.deepEqual([a.status, a.score, a.winner], ['done', [2, 1], 'left']);
    assert.deepEqual([b.table, b.status, b.score, b.winner], [7, 'live', [0, 0], '']);
    assert.deepEqual([c.table, c.status, c.score, c.winner], [9999, '', [9, 0], '']);
    assert.equal(c.right.name, '');
  });

  it('keeps 128 tables at most', () => {
    applyUpdate({ event: { pairings: { rows: Array.from({ length: 140 }, (_, i) => ({ table: i + 1, left: { name: `P${2 * i}` }, right: { name: `P${2 * i + 1}` } })) } } });
    assert.equal(getState().preview.event.pairings.rows.length, 128);
  });

  it('drops the label and byes when rows arrive without them (the typed editor)', () => {
    applyUpdate({ event: { pairings: { rows: [{ table: 1, left: side('A'), right: side('B') }], label: 'Round 4', byes: ['C'] } } });
    applyUpdate({ event: { pairings: { rows: [{ table: 1, left: side('A'), right: side('D') }] } } });
    const pr = getState().preview.event.pairings;
    assert.equal(pr.label, '');
    assert.deepEqual(pr.byes, []);
    applyUpdate({ event: { pairings: { byes: ['E'] } } });
    assert.deepEqual(getState().preview.event.pairings.byes, ['E'], 'byes alone leave the rows');
    assert.equal(getState().preview.event.pairings.rows[0].right.name, 'D');
  });

  it('whitelists the pairings switches and pages, and the standings Legends switch', () => {
    applyUpdate({ scenes: { pairings: { visible: true, page: 9, legends: false, results: 0, bogus: 1 }, standings: { legends: false } } });
    const sc = getState().preview.scenes;
    assert.deepEqual(sc.pairings, { visible: true, page: 4, legends: false, results: false });
    assert.equal(sc.standings.legends, false);
    applyUpdate({ scenes: { pairings: { page: 0 } } });
    assert.equal(getState().preview.scenes.pairings.page, 1);
  });

  it('airs through TAKE and survives CLEAR with its data', () => {
    applyUpdate({ action: 'take' });
    const prog = getState().program;
    assert.equal(prog.scenes.pairings.visible, true);
    assert.equal(prog.event.pairings.rows.length, 1);
    applyUpdate({ action: 'clear' });
    assert.equal(getState().program.scenes.pairings.visible, false);
    assert.equal(getState().program.event.pairings.rows.length, 1);
    applyUpdate({ action: 'off', scene: 'pairings' });
    assert.equal(getState().preview.scenes.pairings.visible, true, 'off drops program only');
  });
});

describe('the pairings graphic', () => {
  it('is a graphic with a label, a source, a look-builder tile and its files', async () => {
    assert.ok(LOOK_SCENES.includes('pairings'));
    assert.equal(SCENE_LABELS.pairings, 'Pairings');
    assert.ok(SCENE_SOURCES.some((s) => s.key === 'pairings' && s.path === '/scenes/pairings/?transparent=1'));
    assert.ok(TILES.some((t) => t.scene === 'pairings'));
    for (const file of ['scenes/pairings/index.html', 'scenes/pairings/scene.js', 'scenes/pairings/scene.css', 'stage/pager.js']) {
      assert.ok((await stat(path.join(WEB, file))).size > 0, file);
    }
  });

  it('stands on the standings\' ground', () => {
    const theme = { accentA: '#11b6fb', accentB: '#1bef19', font: '', logo: '', look: emptyLook(), scenes: Object.fromEntries(LOOK_SCENES.map((k) => [k, emptySceneLook()])) };
    assert.deepEqual(DESIGNED.pairings, DESIGNED.standings);
    assert.equal(resolveLook(theme, 'pairings').background.kind, 'arrows');
  });
});
