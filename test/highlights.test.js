// Highlights on the between-games sheets and the legend table's roll
// (2026-09-19, Sam: "highlight and feature specific standings ... highlight
// and enlarge (similar to the card row feature) certain pairings", "show all
// legends (except for the 1 ofs) on the pie chart and make it so the table
// naturally animates down to show the full length", "the operator can
// start, stop/restart, pause the animation", "highlight specific legends in
// the pie chart and that slice grows"). The shared arithmetic
// (web/shared/legendstats.js, web/shared/focus.js) and the store's cues.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  FOCUS_OTHER, OTHER_COLOR, ROLL_HOLD_MS, ROLL_SPEEDS, SLICE_COLORS, TABLE_ROW_PX, TABLE_VIEW_ROWS,
  legendSlices, otherTitle, rollAt, rollElapsed, sliceKey, tableOverflow,
} from '../web/shared/legendstats.js';
import { FOCUS_MAX, nextFocus, pairingsPageOf, playerKey, standingsPlaceOf } from '../web/shared/focus.js';

const row = (legend, players, extra = {}) => ({ legend, legendSlug: legend.toLowerCase(), legendCardId: '', players, share: null, wins: 0, losses: 0, winRate: null, ...extra });
// Twelve legends brought by two or more, then five brought once.
const FIELD = [
  ...Array.from({ length: 12 }, (_, i) => row(`L${String(i).padStart(2, '0')}`, 20 - i)),
  ...Array.from({ length: 5 }, (_, i) => row(`One${i}`, 1)),
];

describe('legend distribution: which legends get a slice', () => {
  it('slices every legend two or more players brought and folds the one-player legends into Other', () => {
    const { slices } = legendSlices({ rows: FIELD }, { slices: 'multi' });
    assert.equal(slices.length, 13);
    assert.deepEqual(slices.slice(0, 12).map((s) => s.legend), FIELD.slice(0, 12).map((r) => r.legend));
    const other = slices[12];
    assert.equal(other.other, true);
    assert.equal(other.legends, 5);
    assert.equal(other.ones, true);
    assert.equal(other.players, 5);
    assert.equal(otherTitle(other), '5 legends with one player each');
  });

  it('colours the first eight and greys the rest, so no colour repeats', () => {
    const { slices } = legendSlices({ rows: FIELD }, { slices: 'multi' });
    assert.deepEqual(slices.slice(0, 8).map((s) => s.color), SLICE_COLORS);
    assert.ok(slices.slice(8).every((s) => s.color === OTHER_COLOR));
  });

  it('slices every legend with all, and keeps the old Top mode', () => {
    assert.equal(legendSlices({ rows: FIELD }, { slices: 'all' }).slices.length, 17);
    const top = legendSlices({ rows: FIELD }, { slices: 'top', top: 6 }).slices;
    assert.equal(top.length, 7);
    assert.equal(top[6].ones, false);
    assert.equal(otherTitle(top[6]), '11 more legends');
    assert.equal(legendSlices({ rows: FIELD }).slices.length, 9, 'no mode given: the Top mode, as before');
  });

  it('slices everything when every legend was brought once, and keeps typed shares', () => {
    const ones = legendSlices({ rows: ['A', 'B', 'C'].map((l) => row(l, 1)) }, { slices: 'multi' });
    assert.deepEqual(ones.slices.map((s) => s.legend), ['A', 'B', 'C']);
    const shares = legendSlices({ rows: [row('A', 0, { share: 40 }), row('B', 1), row('C', 3)] }, { slices: 'multi' });
    assert.deepEqual(shares.slices.map((s) => s.legend).sort(), ['A', 'C', 'Other legends'], 'a share with no count keeps its slice');
    assert.equal(otherTitle(shares.slices.at(-1)), '1 legend with one player each');
    const unlisted = legendSlices({ rows: [row('A', 5), row('B', 1)], total: 10 }, { slices: 'multi' });
    assert.equal(otherTitle(unlisted.slices.at(-1)), '1 legend with one player each, plus players not listed');
  });

  it('names slices by a key that outlives new numbers', () => {
    const { slices } = legendSlices({ rows: [row('Jinx', 4), { ...row('Typed Legend', 2), legendSlug: '' }, row('Solo', 1)] }, { slices: 'multi' });
    assert.deepEqual(slices.map(sliceKey), ['jinx', 'n:typedlegend', FOCUS_OTHER]);
    assert.equal(sliceKey(null), '');
  });
});

describe('legend distribution: the roll', () => {
  const fast = { speed: ROLL_SPEEDS.normal };
  it('does nothing for a table that fits its box', () => {
    assert.equal(tableOverflow(TABLE_VIEW_ROWS), 0);
    assert.equal(tableOverflow(TABLE_VIEW_ROWS + 3), 3 * TABLE_ROW_PX);
    assert.deepEqual(rollAt(99999, 0), { offset: 0, moving: false, next: Infinity, end: false });
  });

  it('holds at the top, rolls down steadily, holds at the bottom', () => {
    const overflow = 960;
    const start = rollAt(1000, overflow, fast);
    assert.deepEqual([start.offset, start.moving, start.next], [0, false, ROLL_HOLD_MS - 1000]);
    // Past the ramp it cruises at the set speed: 60 px a second.
    const a = rollAt(ROLL_HOLD_MS + 3000, overflow, fast).offset;
    const b = rollAt(ROLL_HOLD_MS + 4000, overflow, fast).offset;
    assert.ok(Math.abs(b - a - 60) < 1e-6, `${b - a}`);
    // Down takes the distance at speed plus one ramp.
    const downMs = (overflow / 60) * 1000 + 700;
    assert.ok(rollAt(ROLL_HOLD_MS + downMs - 1, overflow, fast).moving);
    const bottom = rollAt(ROLL_HOLD_MS + downMs + 10, overflow, fast);
    assert.deepEqual([bottom.offset, bottom.moving], [overflow, false]);
    let last = -1;
    for (let t = ROLL_HOLD_MS; t <= ROLL_HOLD_MS + downMs; t += 250) {
      const { offset } = rollAt(t, overflow, fast);
      assert.ok(offset >= last && offset <= overflow, `monotonic at ${t}`);
      last = offset;
    }
  });

  it('goes back up and round again with Loop, and stays down without it', () => {
    const overflow = 480;
    const downMs = (overflow / 60) * 1000 + 700;
    const upStart = 2 * ROLL_HOLD_MS + downMs;
    const up = rollAt(upStart + 500, overflow, fast);
    assert.ok(up.moving && up.offset < overflow);
    // The way back takes at most three seconds, then the next round starts.
    assert.deepEqual(rollAt(upStart + 3000, overflow, fast).offset, 0);
    const again = rollAt(upStart + 3000 + ROLL_HOLD_MS + 2000, overflow, fast);
    assert.ok(again.moving && again.offset > 0);
    const once = rollAt(upStart + 500, overflow, { ...fast, loop: false });
    assert.deepEqual([once.offset, once.end, once.next], [overflow, true, Infinity]);
    const big = 2400;
    const bigUp = 2 * ROLL_HOLD_MS + (big / 60) * 1000 + 700;
    assert.ok(rollAt(bigUp + 2990, big, fast).offset > 0);
    assert.equal(rollAt(bigUp + 3010, big, fast).offset, 0, 'a long table is back up in three seconds');
  });

  it('jumps between the holds with animation off', () => {
    assert.equal(rollAt(ROLL_HOLD_MS + 1, 480, { jump: true }).offset, 480);
    assert.equal(rollAt(2 * ROLL_HOLD_MS + 1, 480, { jump: true }).offset, 0);
  });

  it('counts the time played across pauses', () => {
    assert.equal(rollElapsed({ state: 'play', at: 1000, done: 500 }, 3000), 2500);
    assert.equal(rollElapsed({ state: 'pause', at: 0, done: 500 }, 3000), 500);
    assert.equal(rollElapsed({ state: 'stop', at: 0, done: 0 }, 3000), 0);
    assert.equal(rollElapsed(null), 0);
  });
});

describe('highlight lists', () => {
  it('adds, takes out, flips, makes the only one and clears', () => {
    assert.deepEqual(nextFocus([], 'a'), ['a']);
    assert.deepEqual(nextFocus(['a'], 'a'), [], 'no on: flips');
    assert.deepEqual(nextFocus(['a', 'b'], 'a', { on: true }), ['b', 'a'], 'on again: newest');
    assert.deepEqual(nextFocus(['a', 'b'], 'c', { on: false }), ['a', 'b']);
    assert.deepEqual(nextFocus(['a', 'b'], 'c', { only: true }), ['c']);
    assert.deepEqual(nextFocus(['a', 'b'], '', { clear: true }), []);
    assert.deepEqual(nextFocus(['a'], ''), ['a'], 'no key: nothing changes');
    const many = Array.from({ length: FOCUS_MAX + 2 }, (_, i) => i + 1).reduce((l, k) => nextFocus(l, k, { on: true }), []);
    assert.equal(many.length, FOCUS_MAX);
    assert.equal(many.at(-1), FOCUS_MAX + 2, 'the oldest go first');
  });

  it('knows a player by name alone, in any script', () => {
    assert.equal(playerKey('  Dax   the  Great '), 'dax the great');
    assert.equal(playerKey('张三'), '张三');
    assert.equal(playerKey(null), '');
  });

  it('finds the group and page a player is on, and the page a table is on', () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, i) => ({ name: `A${i}`, group: 'Group 1' })),
      ...Array.from({ length: 45 }, (_, i) => ({ name: `B${i}`, group: 'Group 2' })),
    ];
    assert.deepEqual(standingsPlaceOf({ rows }, playerKey('A3')), { group: 'Group 1', page: 1 });
    assert.deepEqual(standingsPlaceOf({ rows }, playerKey('A24')), { group: 'Group 1', page: 2 });
    assert.deepEqual(standingsPlaceOf({ rows }, playerKey('B44')), { group: 'Group 2', page: 3 });
    assert.equal(standingsPlaceOf({ rows }, 'nobody'), null);
    const tables = Array.from({ length: 70 }, (_, i) => ({ table: i + 1 }));
    assert.equal(pairingsPageOf(tables, 1), 1);
    assert.equal(pairingsPageOf(tables, 33), 2);
    assert.equal(pairingsPageOf(tables, 70), 3);
    assert.equal(pairingsPageOf(tables, 999), null);
  });
});

describe('the highlight and roll cues in the store', () => {
  // A save from before this round, with a hand-edited mess where the new
  // fields go.
  const OLD_BANK = {
    event: { name: 'Old Open' },
    match: { left: { name: 'A' }, right: { name: 'B' } },
    scenes: {
      standings: { visible: false, page: 1, focus: 'Dax' },
      pairings: { visible: false, page: 1, focus: [3, 3, 'x', -1, 7] },
      legendstats: { visible: false, winRate: true, top: 8, focus: ['JINX', '../x', 'n:typed', 'other'], roll: { state: 'play' }, speed: 'warp', slices: 'most' },
    },
  };
  let applyUpdate;
  let getState;
  before(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ss-highlights-test-'));
    process.env.SIDEWAYS_DATA_DIR = dir;
    await writeFile(path.join(dir, 'event.json'), JSON.stringify({ version: 3, preview: OLD_BANK, program: OLD_BANK, theme: {} }));
    const state = await import('../server/state.js');
    await state.initState();
    ({ applyUpdate, getState } = state);
  });
  const banks = () => [getState().preview, getState().program];

  it('cleans an older or hand-edited save into the new shape', () => {
    for (const bank of banks()) {
      assert.deepEqual(bank.scenes.standings.focus, []);
      assert.deepEqual(bank.scenes.pairings.focus, [3, 7]);
      const ls = bank.scenes.legendstats;
      assert.deepEqual(ls.focus, ['jinx', 'n:typed', 'other']);
      assert.deepEqual(ls.roll, { state: 'stop', at: 0, done: 0 }, 'a playing roll with no start time stops');
      assert.deepEqual([ls.speed, ls.slices, ls.autoRoll, ls.loop], ['normal', 'multi', true, true]);
    }
  });

  it('highlights a legend on both banks, and holds and resumes the roll around it', () => {
    applyUpdate({ scenes: { legendstats: { focus: [] } } });
    applyUpdate({ action: 'take' });
    applyUpdate({ action: 'roll', scene: 'legendstats', op: 'start' });
    for (const bank of banks()) assert.equal(bank.scenes.legendstats.roll.state, 'play');
    applyUpdate({ action: 'focus', scene: 'legendstats', legend: 'jinx' });
    for (const bank of banks()) {
      assert.deepEqual(bank.scenes.legendstats.focus, ['jinx']);
      assert.equal(bank.scenes.legendstats.roll.state, 'hold');
    }
    applyUpdate({ action: 'focus', scene: 'legendstats', legend: 'other', on: true });
    assert.deepEqual(getState().program.scenes.legendstats.focus, ['jinx', 'other']);
    applyUpdate({ action: 'focus', scene: 'legendstats', legend: 'kaisa', only: true });
    assert.deepEqual(getState().program.scenes.legendstats.focus, ['kaisa']);
    applyUpdate({ action: 'focus', scene: 'legendstats', clear: true });
    for (const bank of banks()) {
      assert.deepEqual(bank.scenes.legendstats.focus, []);
      assert.equal(bank.scenes.legendstats.roll.state, 'play', 'the roll picks up again');
    }
    applyUpdate({ action: 'focus', scene: 'legendstats', legend: '<b>' });
    assert.deepEqual(getState().program.scenes.legendstats.focus, [], 'a key that is not one changes nothing');
  });

  it('starts, pauses, stops and restarts the roll, and takes its settings', () => {
    applyUpdate({ action: 'roll', scene: 'legendstats', op: 'pause' });
    const paused = getState().program.scenes.legendstats.roll;
    assert.equal(paused.state, 'pause');
    applyUpdate({ action: 'roll', scene: 'legendstats', op: 'start' });
    const resumed = getState().program.scenes.legendstats.roll;
    assert.deepEqual([resumed.state, resumed.done], ['play', paused.done], 'start after pause goes on from there');
    applyUpdate({ action: 'roll', scene: 'legendstats', op: 'stop' });
    assert.deepEqual(getState().program.scenes.legendstats.roll, { state: 'stop', at: 0, done: 0 });
    applyUpdate({ action: 'roll', scene: 'legendstats', op: 'restart', speed: 'fast', loop: false, autoRoll: false });
    for (const bank of banks()) {
      const ls = bank.scenes.legendstats;
      assert.deepEqual([ls.roll.state, ls.roll.done, ls.speed, ls.loop, ls.autoRoll], ['play', 0, 'fast', false, false]);
    }
    applyUpdate({ action: 'roll', scene: 'legendstats', speed: 'warp' });
    assert.equal(getState().program.scenes.legendstats.speed, 'fast');
    assert.equal(applyUpdate({ action: 'roll', scene: 'legendstats', op: 'rewind' }).ok, false);
    assert.equal(applyUpdate({ action: 'roll', scene: 'standings', op: 'start' }).ok, false);
  });

  it('rolls from the top when the graphic comes on air or airs new numbers', () => {
    applyUpdate({ action: 'roll', scene: 'legendstats', autoRoll: true, loop: true, speed: 'normal', op: 'pause' });
    applyUpdate({ action: 'off', scene: 'legendstats' });
    applyUpdate({ scenes: { legendstats: { visible: true } } });
    applyUpdate({ event: { legendStats: { rows: FIELD } } });
    const t0 = Date.now();
    applyUpdate({ action: 'take' });
    for (const bank of banks()) {
      const r = bank.scenes.legendstats.roll;
      assert.equal(r.state, 'play');
      assert.equal(r.done, 0);
      assert.ok(r.at >= t0);
    }
    applyUpdate({ action: 'roll', scene: 'legendstats', op: 'pause' });
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.legendstats.roll.state, 'pause', 'a TAKE of nothing new leaves it alone');
    applyUpdate({ event: { legendStats: { rows: FIELD.slice(0, 10) } } });
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.legendstats.roll.state, 'play', 'new numbers roll from the top');
    applyUpdate({ action: 'roll', scene: 'legendstats', autoRoll: false });
    applyUpdate({ action: 'off', scene: 'legendstats' });
    applyUpdate({ action: 'take' });
    assert.deepEqual(getState().program.scenes.legendstats.roll, { state: 'stop', at: 0, done: 0 }, 'Start on its own off: waits at the top');
    applyUpdate({ action: 'roll', scene: 'legendstats', autoRoll: true });
    applyUpdate({ action: 'focus', scene: 'legendstats', legend: 'l00' });
    applyUpdate({ action: 'off', scene: 'legendstats' });
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.legendstats.roll.state, 'hold', 'on air with a highlight up: held at the top');
  });

  it('highlights standings players and turns to the page and group they are on', () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, i) => ({ name: `Alpha ${i}`, record: `${25 - i}-0`, group: 'Group 1' })),
      ...Array.from({ length: 30 }, (_, i) => ({ name: `Beta ${i}`, record: `${30 - i}-0`, group: 'Group 2' })),
    ];
    applyUpdate({ event: { standings: { rows } }, scenes: { standings: { page: 1, group: 'Group 1' } } });
    applyUpdate({ action: 'take' });
    applyUpdate({ action: 'focus', scene: 'standings', player: 'alpha 3' });
    for (const bank of banks()) assert.deepEqual([bank.scenes.standings.focus, bank.scenes.standings.page, bank.scenes.standings.group], [['alpha 3'], 1, 'Group 1']);
    applyUpdate({ action: 'focus', scene: 'standings', player: 'Beta 27' });
    for (const bank of banks()) assert.deepEqual([bank.scenes.standings.focus, bank.scenes.standings.page, bank.scenes.standings.group], [['alpha 3', 'beta 27'], 2, 'Group 2']);
    applyUpdate({ action: 'focus', scene: 'standings', player: 'Beta 27', on: false });
    assert.deepEqual(getState().program.scenes.standings.focus, ['alpha 3']);
    assert.equal(getState().program.scenes.standings.page, 2, 'taking a highlight off turns nothing');
    applyUpdate({ action: 'focus', scene: 'standings', player: 'Nobody Here' });
    assert.deepEqual(getState().program.scenes.standings.focus, ['alpha 3', 'nobody here'], 'a player not on the sheet can wait for the next standings');
    applyUpdate({ scenes: { standings: { focus: ['  ALPHA 3 ', 'x'.repeat(80)] } } });
    assert.deepEqual(getState().preview.scenes.standings.focus, ['alpha 3', 'x'.repeat(40)]);
  });

  it('highlights pairings tables by number and turns to their page', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ table: i + 1, left: { name: `L${i}` }, right: { name: `R${i}` } }));
    applyUpdate({ event: { pairings: { rows } }, scenes: { pairings: { page: 1 } } });
    applyUpdate({ action: 'take' });
    applyUpdate({ action: 'focus', scene: 'pairings', clear: true });
    applyUpdate({ action: 'focus', scene: 'pairings', table: 5 });
    applyUpdate({ action: 'focus', scene: 'pairings', table: '36' });
    for (const bank of banks()) assert.deepEqual([bank.scenes.pairings.focus, bank.scenes.pairings.page], [[5, 36], 2]);
    applyUpdate({ action: 'focus', scene: 'pairings', table: 5 });
    assert.deepEqual(getState().program.scenes.pairings.focus, [36]);
    applyUpdate({ action: 'focus', scene: 'pairings', table: 0 });
    assert.deepEqual(getState().program.scenes.pairings.focus, [36], 'no table 0');
    applyUpdate({ action: 'focus', scene: 'pairings', clear: true });
    assert.deepEqual(getState().program.scenes.pairings.focus, []);
    assert.equal(applyUpdate({ action: 'focus', scene: 'bracket', player: 'x' }).ok, false);
  });
});
