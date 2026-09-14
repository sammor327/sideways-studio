import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The store autosaves into DATA_DIR after every update, so point it at a
// scratch folder before the module reads the environment.
let applyUpdate;
let getState;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-state-test-'));
  ({ applyUpdate, getState } = await import('../server/state.js'));
});

describe('experimental overlay fields', () => {
  it('cleans the identity lines and the hand list on a side', () => {
    applyUpdate({ match: { left: {
      record: ' 8-2-0 ', country: 'kr', pronouns: 'he/him', archetype: 'Yasuo Tempo', handCount: 25, holds: 'Altar to Unity · 3 units',
      hand: [
        { cardId: 'OGN-076', cardName: 'Yasuo, Remorseful', energy: 3, domains: ['Calm', 'Nope'] },
        { cardId: 'bad id!', cardName: '' },
        'not a card',
      ],
    } } });
    const left = getState().preview.match.left;
    assert.equal(left.record, '8-2-0');
    assert.equal(left.country, 'KR');
    assert.equal(left.pronouns, 'he/him');
    assert.equal(left.archetype, 'Yasuo Tempo');
    assert.equal(left.handCount, 20, 'hand count clamps to 20');
    assert.equal(left.holds, 'Altar to Unity · 3 units');
    assert.deepEqual(left.hand, [{ cardId: 'OGN-076', cardName: 'Yasuo, Remorseful', energy: 3, domains: ['Calm'] }]);
  });

  it('refuses a country code that is not two or three letters', () => {
    applyUpdate({ match: { right: { country: 'USA' } } });
    applyUpdate({ match: { right: { country: 'U-S' } } });
    assert.equal(getState().preview.match.right.country, 'USA');
  });

  it('keeps the experimental switch with the theme, not the banks', () => {
    applyUpdate({ theme: { experimental: true } });
    assert.equal(getState().theme.experimental, true);
    applyUpdate({ theme: { experimental: 0 } });
    assert.equal(getState().theme.experimental, false);
  });

  it('whitelists the four scene configs', () => {
    applyUpdate({ scenes: {
      igoportrait: { visible: true, mode: 'webcam', handCam: true, cardWell: false, bogus: true },
      igorows: { visible: true, mode: 'nope', hand: false },
      arenabug: { visible: true, clock: false },
      slate: { visible: true, mode: 'custom', text: 'Back after the break', countdown: false },
    } });
    const sc = getState().preview.scenes;
    assert.deepEqual(sc.igoportrait, { visible: true, mode: 'webcam', topBar: true, handCam: true, cardWell: false });
    assert.deepEqual(sc.igorows, { visible: true, mode: 'legend', hand: false });
    assert.deepEqual(sc.arenabug, { visible: true, clock: false });
    assert.deepEqual(sc.slate, { visible: true, mode: 'custom', text: 'Back after the break', countdown: false });
    applyUpdate({ scenes: { slate: { mode: 'sideways' } } });
    assert.equal(getState().preview.scenes.slate.mode, 'custom', 'an unknown slate mode is ignored');
  });

  it('cleans the up-next tables, casters and seeds on the event', () => {
    applyUpdate({ event: {
      roundsRemaining: 120,
      tables: [
        { label: 'Table 1', left: { name: 'Shoji', country: 'kr', record: '8-2-0', seed: '3rd', legend: 'Yasuo, Unforgiven', legendSlug: 'yasuo-unforgiven', legendCardId: 'OGN-259' }, right: { name: 'Margaux' } },
        'junk', {}, {}, {},
      ],
      casters: [{ name: 'Lena', role: 'Play-by-play' }, { name: '' }, { role: 'no name' }],
      seeds: 'Guubums · 9-1-0 · Irelia\n\x07Dax · 8-2-0',
    } });
    const ev = getState().preview.event;
    assert.equal(ev.roundsRemaining, 99);
    assert.equal(ev.tables.length, 4, 'at most four tables');
    assert.equal(ev.tables[0].left.country, 'KR');
    assert.equal(ev.tables[0].left.legendSlug, 'yasuo-unforgiven');
    assert.equal(ev.tables[0].right.name, 'Margaux');
    assert.equal(ev.tables[1].left.name, '', 'a junk row becomes an empty table, never a crash');
    assert.deepEqual(ev.casters, [{ name: 'Lena', role: 'Play-by-play' }]);
    assert.equal(ev.seeds, 'Guubums · 9-1-0 · Irelia\nDax · 8-2-0');
  });

  it('runs the turn counter and active side as cues on both banks', () => {
    applyUpdate({ action: 'turn', op: 'reset' });
    applyUpdate({ action: 'turn', op: 'next' });
    applyUpdate({ action: 'turn', op: 'next' });
    const s = getState();
    assert.equal(s.preview.match.turn, 2);
    assert.equal(s.program.match.turn, 2);
    assert.equal(s.preview.match.activeSide, 'right', 'turns alternate, left first');
    applyUpdate({ action: 'turn', op: 'side', side: 'left' });
    assert.equal(getState().program.match.activeSide, 'left');
    assert.equal(applyUpdate({ action: 'turn', op: 'spin' }).ok, false);
  });

  it('drives the break clock separately from the round clock', () => {
    applyUpdate({ action: 'timer', op: 'set', minutes: 5 });
    applyUpdate({ action: 'timer', which: 'countdown', op: 'set', minutes: 15 });
    const s = getState();
    assert.equal(s.preview.match.timer.countdown, 5 * 60000);
    assert.equal(s.preview.event.countdown.countdown, 15 * 60000);
    assert.equal(s.program.event.countdown.countdown, 15 * 60000);
    applyUpdate({ action: 'timer', which: 'countdown', op: 'start' });
    assert.equal(getState().preview.event.countdown.running, true);
    assert.equal(getState().preview.match.timer.running, false);
  });

  it('clears the experimental scenes with everything else on CLEAR', () => {
    applyUpdate({ scenes: { slate: { visible: true } } });
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.slate.visible, true);
    applyUpdate({ action: 'clear' });
    assert.equal(getState().program.scenes.slate.visible, false);
  });
});
