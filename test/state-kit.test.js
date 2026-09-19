import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let applyUpdate;
let getState;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-kit-test-'));
  ({ applyUpdate, getState } = await import('../server/state.js'));
});

describe('starter kit fields', () => {
  it('cleans the profile lines on a side and who chose first', () => {
    applyUpdate({ match: { left: { team: ' Team KDX ', store: 'Rift Cave', seasonRecord: '41-9', bestFinish: 'RQ Shenyang champion', finishes: 'RQ Shenyang · Champion\nRO Wuhan · Top 4\n' }, choseFirst: 'left', result: { winner: 'right', note: 'Advances to Semifinal 1' } } });
    const m = getState().preview.match;
    assert.equal(m.left.team, 'Team KDX');
    assert.equal(m.left.store, 'Rift Cave');
    assert.equal(m.left.seasonRecord, '41-9');
    assert.equal(m.left.bestFinish, 'RQ Shenyang champion');
    assert.equal(m.left.finishes, 'RQ Shenyang · Champion\nRO Wuhan · Top 4\n');
    assert.equal(m.choseFirst, 'left');
    assert.deepEqual(m.result, { winner: 'right', note: 'Advances to Semifinal 1' });
    applyUpdate({ match: { choseFirst: 'middle', result: { winner: 'nobody' } } });
    assert.equal(getState().preview.match.choseFirst, 'left');
    assert.equal(getState().preview.match.result.winner, 'right');
  });

  it('cleans the event schedule, format, commands, sponsors, next event and champion', () => {
    applyUpdate({ event: {
      schedule: [{ time: '10:00', title: 'Swiss round 9' }, { title: '' }, 'nope', { time: '', title: 'Grand final' }],
      scheduleNow: 9, format: 'First to 8.\nTop 4 advance.', commands: '!bracket !decks', sponsors: 'A, B', nextName: 'TES Open Chengdu', nextWhen: '3 October', champion: 'left',
      casters: [{ name: 'Lena', role: 'Play-by-play', handle: '@lenacasts' }],
    } });
    const ev = getState().preview.event;
    assert.deepEqual(ev.schedule, [{ time: '10:00', title: 'Swiss round 9' }, { time: '', title: 'Grand final' }]);
    assert.equal(ev.scheduleNow, 7, 'the current block clamps to the schedule length');
    assert.equal(ev.format, 'First to 8.\nTop 4 advance.');
    assert.equal(ev.commands, '!bracket !decks');
    assert.equal(ev.sponsors, 'A, B');
    assert.equal(ev.nextName, 'TES Open Chengdu');
    assert.equal(ev.champion, 'left');
    assert.deepEqual(ev.casters, [{ name: 'Lena', role: 'Play-by-play', handle: '@lenacasts' }]);
  });

  it('keeps bracket players, cleans results against the format and drops them on a format change', () => {
    applyUpdate({ event: { bracket: { format: 'de8', players: Array.from({ length: 20 }, (_, i) => ({ name: `P${i + 1}`, country: 'us' })), results: { W1: { top: 2, bottom: 0, winner: 'top' }, L1: { top: 1, bottom: 2, winner: 'bottom' }, W99: { winner: 'top' } } } } });
    let b = getState().preview.event.bracket;
    assert.equal(b.format, 'de8');
    assert.equal(b.players.length, 16);
    assert.equal(b.players[0].country, 'US');
    assert.deepEqual(Object.keys(b.results).sort(), ['L1', 'W1']);
    applyUpdate({ event: { bracket: { format: 'se8' } } });
    b = getState().preview.event.bracket;
    assert.deepEqual(Object.keys(b.results), ['W1'], 'losers-bracket results leave with the format');
    applyUpdate({ event: { bracket: { format: 'triple' } } });
    assert.equal(getState().preview.event.bracket.format, 'se8');
  });

  it('cleans standings rows and the cut', () => {
    applyUpdate({ event: { standings: { rows: [{ name: 'Guubums', country: 'cn', legend: 'Irelia, Blade Dancer', record: '9-1-0', points: 27, omw: '68.44', gw: 72.1, ogw: 61 }, { name: '' }, { name: 'Dax', points: 999999 }], cut: 16 } } });
    const st = getState().preview.event.standings;
    assert.equal(st.rows.length, 2);
    assert.equal(st.rows[0].points, 999, 'the most points first');
    assert.equal(st.rows[1].country, 'CN');
    assert.equal(st.rows[1].omw, 68.4);
    assert.equal(st.cut, 16);
    applyUpdate({ event: { standings: { cut: 7 } } });
    assert.equal(getState().preview.event.standings.cut, 16, 'only the usual cut sizes are accepted');
  });

  it('whitelists the seven new scene configs and the slate flags', () => {
    applyUpdate({ scenes: {
      cornertag: { visible: true, mode: 'custom', text: 'Back in five', bogus: 1 },
      lowerthird: { visible: true, mode: 'interview', side: 'right', credential: '2019 champion' },
      headtohead: { visible: true, status: 'Shuffling' },
      profile: { visible: true, side: 'right' },
      bracket: { visible: true },
      standings: { visible: true, page: 9 },
      result: { visible: true },
      slate: { schedule: false, ticker: false, camera: false },
    } });
    const sc = getState().preview.scenes;
    assert.deepEqual(sc.cornertag, { visible: true, mode: 'custom', text: 'Back in five', sub: '', label: '', showLabel: true, clock: true, dock: true });
    assert.deepEqual(sc.lowerthird, { visible: true, mode: 'interview', side: 'right', credential: '2019 champion', text: '', sub: '', label: '', showLabel: true, dock: true });
    assert.deepEqual(sc.headtohead, { visible: true, status: 'Shuffling' });
    assert.deepEqual(sc.profile, { visible: true, side: 'right', camera: true, decklist: false });
    assert.deepEqual(sc.bracket, { visible: true });
    assert.deepEqual(sc.standings, { visible: true, page: 4, legends: true, group: '', focus: [] });
    assert.deepEqual(sc.result, { visible: true });
    assert.equal(sc.slate.schedule, false);
    assert.equal(sc.slate.camera, false);
    applyUpdate({ scenes: { cornertag: { mode: 'sideways' }, lowerthird: { mode: 'desk', side: 'middle' } } });
    assert.equal(getState().preview.scenes.cornertag.mode, 'custom');
    assert.equal(getState().preview.scenes.lowerthird.mode, 'interview');
    assert.equal(getState().preview.scenes.lowerthird.side, 'right');
  });

  it('takes custom text, the label box, the clock and the anchor switch on the corner tag and the lower third', () => {
    applyUpdate({ scenes: {
      cornertag: { text: '  Top 8 at 4 PM ', sub: 'Stay tuned', label: ' Next ', showLabel: false, clock: 0, dock: false },
      lowerthird: { mode: 'custom', text: 'Sam Morris', sub: 'Tournament organizer', label: 'Host', showLabel: 0, dock: '' },
    } });
    let sc = getState().preview.scenes;
    assert.deepEqual(
      { text: sc.cornertag.text, sub: sc.cornertag.sub, label: sc.cornertag.label, showLabel: sc.cornertag.showLabel, clock: sc.cornertag.clock, dock: sc.cornertag.dock },
      { text: 'Top 8 at 4 PM', sub: 'Stay tuned', label: 'Next', showLabel: false, clock: false, dock: false },
    );
    assert.deepEqual(
      { mode: sc.lowerthird.mode, text: sc.lowerthird.text, sub: sc.lowerthird.sub, label: sc.lowerthird.label, showLabel: sc.lowerthird.showLabel, dock: sc.lowerthird.dock },
      { mode: 'custom', text: 'Sam Morris', sub: 'Tournament organizer', label: 'Host', showLabel: false, dock: false },
    );
    // Lengths are capped: a label is a word or two, a main line one line.
    applyUpdate({ scenes: { cornertag: { label: 'x'.repeat(40), sub: 'y'.repeat(90) }, lowerthird: { text: 'z'.repeat(80), sub: 'w'.repeat(200) } } });
    sc = getState().preview.scenes;
    assert.equal(sc.cornertag.label.length, 24);
    assert.equal(sc.cornertag.sub.length, 60);
    assert.equal(sc.lowerthird.text.length, 60);
    assert.equal(sc.lowerthird.sub.length, 120);
    // Leaving a field out of a patch leaves it alone; switches come back on.
    applyUpdate({ scenes: { cornertag: { showLabel: true, clock: true, dock: true }, lowerthird: { showLabel: true, dock: true, mode: 'interview' } } });
    sc = getState().preview.scenes;
    assert.equal(sc.cornertag.showLabel && sc.cornertag.clock && sc.cornertag.dock, true);
    assert.equal(sc.cornertag.text, 'Top 8 at 4 PM');
    assert.equal(sc.lowerthird.showLabel && sc.lowerthird.dock, true);
    assert.equal(sc.lowerthird.label, 'Host');
  });

  it('carries the new fields through TAKE and leaves them alone on CLEAR', () => {
    applyUpdate({ action: 'take' });
    const prog = getState().program;
    assert.equal(prog.match.left.team, 'Team KDX');
    assert.equal(prog.event.bracket.format, 'se8');
    assert.equal(prog.scenes.bracket.visible, true);
    applyUpdate({ action: 'clear' });
    assert.equal(getState().program.scenes.bracket.visible, false);
    assert.equal(getState().program.event.standings.rows.length, 2);
  });
});
