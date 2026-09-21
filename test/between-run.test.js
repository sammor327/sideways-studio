// The between-games run (2026-09-20, Sam: "automate the between game
// portion: Game Victory Scene into sideboard and hold on sideboards until
// battlefields for the next game are chosen then game intro for 5 seconds
// then transition out").
//
// The sequence is the point, so this drives it end to end with a clock it
// controls: the two timed steps must not move early, the sideboard must hold
// for as long as the players take, and every step must land in BOTH banks so
// nothing in the middle of it waits on a TAKE.
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-run-'));
const { applyUpdate, getState, advanceRun } = await import('../server/state.js');

const state = () => getState();
const up = (patch) => applyUpdate(patch);
const step = () => state().run.step;
const on = (key) => [state().preview.scenes[key].visible, state().program.scenes[key].visible];

// A match mid series: player 1 has just taken game 2 to lead 2-1, and both
// battlefields are still the ones game 2 was played on.
function seat() {
  up({
    match: {
      seriesLength: 5,
      left: { name: 'MARA', gameWins: 2, battlefield: 'Rockfall Path' },
      right: { name: 'THEO', gameWins: 1, battlefield: 'Veiled Temple' },
    },
    scenes: { igorows: { visible: true } },
  });
  up({ action: 'take' });
}

describe('the between-games run', () => {
  beforeEach(() => {
    up({ action: 'run', op: 'stop' });
    // The holds are settings and outlive a run, so every case starts from
    // the same two.
    up({ action: 'run', op: 'holds', winHold: 6, introHold: 5 });
    seat();
  });

  it('starts on the game victory, in both banks, naming whoever just went ahead', () => {
    up({ action: 'run', op: 'start' });
    assert.equal(step(), 'gamewin');
    assert.equal(state().run.active, true);
    assert.equal(state().run.side, 'left');
    assert.deepEqual(on('gamewin'), [true, true]);
    assert.deepEqual(on('sideboard'), [false, false]);
    assert.deepEqual(on('matchup'), [false, false]);
    // The graphic is told who, so a later game win cannot rewrite the name
    // of the one this run is about.
    assert.equal(state().preview.scenes.gamewin.side, 'left');
  });

  it('holds the game victory for its own seconds, then hands over to the sideboard', () => {
    up({ action: 'run', op: 'start', winHold: 6 });
    const at = state().run.at;
    assert.equal(advanceRun(at + 5_900), false, 'moved early');
    assert.equal(step(), 'gamewin');
    assert.equal(advanceRun(at + 6_000), true);
    assert.equal(step(), 'sideboard');
    assert.deepEqual(on('gamewin'), [false, false]);
    assert.deepEqual(on('sideboard'), [true, true]);
  });

  it('holds the sideboard however long the players take', () => {
    up({ action: 'run', op: 'start', winHold: 0 });
    assert.equal(step(), 'sideboard');
    const at = state().run.at;
    assert.equal(advanceRun(at + 600_000), false, 'the sideboard is on a clock');
    assert.equal(step(), 'sideboard');
  });

  it('moves on when both battlefields for the next game are chosen, not before', () => {
    up({ action: 'run', op: 'start', winHold: 0 });
    assert.equal(step(), 'sideboard');
    // One player picks: still waiting on the other.
    up({ match: { left: { battlefield: 'Sump Tunnel' } } });
    assert.equal(step(), 'sideboard');
    // The second pick moves the run the moment it is typed, without waiting
    // for a tick of the clock.
    up({ match: { right: { battlefield: 'Monolith Plaza' } } });
    assert.equal(step(), 'intro');
    assert.deepEqual(on('sideboard'), [false, false]);
    assert.deepEqual(on('matchup'), [true, true]);
  });

  it('does not take the same two battlefields for a new choice', () => {
    up({ action: 'run', op: 'start', winHold: 0 });
    // Retyping what was already in play is not a choice for the next game.
    up({ match: { left: { battlefield: 'Rockfall Path' }, right: { battlefield: 'Veiled Temple' } } });
    assert.equal(step(), 'sideboard');
  });

  it('carries the two new battlefields on air with it, and nothing else staged', () => {
    up({ action: 'run', op: 'start', winHold: 0 });
    up({ match: { left: { battlefield: 'Sump Tunnel', name: 'TYPO' }, right: { battlefield: 'Monolith Plaza' } } });
    assert.equal(step(), 'intro');
    assert.equal(state().program.match.left.battlefield, 'Sump Tunnel');
    assert.equal(state().program.match.right.battlefield, 'Monolith Plaza');
    // A name half typed in preview while the run was going must not reach
    // air on the back of it.
    assert.equal(state().program.match.left.name, 'MARA');
  });

  it('runs the game intro for its five seconds and then takes everything down', () => {
    up({ action: 'run', op: 'start', winHold: 0, introHold: 5 });
    up({ match: { left: { battlefield: 'Sump Tunnel' }, right: { battlefield: 'Monolith Plaza' } } });
    assert.equal(step(), 'intro');
    const at = state().run.at;
    assert.equal(advanceRun(at + 4_900), false, 'the intro went early');
    assert.equal(advanceRun(at + 5_000), true);
    assert.equal(step(), '');
    assert.equal(state().run.active, false);
    for (const key of ['gamewin', 'sideboard', 'matchup']) assert.deepEqual(on(key), [false, false], `${key} stayed up`);
  });

  it('skips a step on demand and stops dead on demand', () => {
    up({ action: 'run', op: 'start' });
    up({ action: 'run', op: 'next' });
    assert.equal(step(), 'sideboard');
    up({ action: 'run', op: 'next' });
    assert.equal(step(), 'intro');
    up({ action: 'run', op: 'stop' });
    assert.equal(step(), '');
    assert.equal(state().run.active, false);
    for (const key of ['gamewin', 'sideboard', 'matchup']) assert.deepEqual(on(key), [false, false]);
  });

  it('leaves the rest of the show alone', () => {
    up({ action: 'run', op: 'start' });
    up({ action: 'run', op: 'next' });
    assert.deepEqual(on('igorows'), [true, true], 'the run pulled the in-game overlay down');
  });

  it('turns away an op it does not know rather than doing something', () => {
    up({ action: 'run', op: 'start' });
    assert.deepEqual(up({ action: 'run', op: 'rewind' }), { ok: false, error: 'unknown run op' });
    assert.equal(step(), 'gamewin');
  });

  it('does nothing at all while no run is going', () => {
    assert.equal(advanceRun(Date.now() + 999_999), false);
  });
});
