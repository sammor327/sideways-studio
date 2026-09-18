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
        { cardId: 'OGN-076', cardName: 'Yasuo, Remorseful', energy: 3, domains: ['Calm', 'Nope'], kind: 'reaction', played: 1 },
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
    assert.deepEqual(left.hand, [{ cardId: 'OGN-076', cardName: 'Yasuo, Remorseful', energy: 3, domains: ['Calm'], kind: 'reaction', played: true }]);
    // A kind the panel did not send resolves from the card index (empty in
    // tests, where no index is loaded) rather than being trusted from anywhere.
    applyUpdate({ match: { left: { hand: [{ cardId: 'OGN-076', cardName: 'Yasuo, Remorseful', kind: 'wizard' }], handUnknown: 30 } } });
    assert.equal(getState().preview.match.left.hand[0].kind, '');
    assert.equal(getState().preview.match.left.hand[0].played, false);
    assert.equal(getState().preview.match.left.handUnknown, 20);
    const many = Array.from({ length: 25 }, (_, i) => ({ cardId: 'OGN-076', cardName: `Card ${i + 1}` }));
    applyUpdate({ match: { left: { hand: many } } });
    const kept = getState().preview.match.left.hand;
    assert.equal(kept.length, 20, 'a hand lists up to 20 cards');
    assert.equal(kept[19].cardName, 'Card 20', 'the first twenty, in order');
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
      slate: { visible: true, mode: 'custom', text: 'Back after the break', countdown: false, schedule: true, ticker: true, camera: true },
    } });
    const sc = getState().preview.scenes;
    assert.deepEqual(sc.igoportrait, { visible: true, mode: 'webcam', topBar: true, handCam: true, cardWell: false });
    assert.deepEqual(sc.igorows, { visible: true, mode: 'legend', hand: false, handStyle: 'list', handArt: true, showdown: false, activeTurn: true, points: true, turnCounter: true, eventLogo: true, clock: true });
    applyUpdate({ scenes: { igorows: { handStyle: 'lanes', showdown: true }, handfan: { visible: true, side: 'right', opponent: false, showdown: true } } });
    assert.equal(getState().preview.scenes.igorows.handStyle, 'lanes');
    assert.deepEqual(getState().preview.scenes.handfan, { visible: true, side: 'right', opponent: false, showdown: true, identity: true, clock: true });
    applyUpdate({ scenes: { igorows: { handStyle: 'pile' }, handfan: { side: 'middle' } } });
    assert.equal(getState().preview.scenes.igorows.handStyle, 'lanes');
    assert.equal(getState().preview.scenes.handfan.side, 'right');
    assert.deepEqual(sc.arenabug, { visible: true, clock: false });
    assert.deepEqual(sc.slate, { visible: true, mode: 'custom', text: 'Back after the break', countdown: false, schedule: true, ticker: true, camera: true });
    applyUpdate({ scenes: { slate: { mode: 'sideways' } } });
    assert.equal(getState().preview.scenes.slate.mode, 'custom', 'an unknown slate mode is ignored');
  });

  it('gives the dual columns the same hand switches as the rows', () => {
    applyUpdate({ scenes: { igodual: { visible: true, hand: true, handStyle: 'lanes', bogus: true } } });
    const dual = getState().preview.scenes.igodual;
    assert.deepEqual(dual, {
      visible: true, mode: 'legend', track: true, clock: true, eventBlock: true, cardSlot: true,
      hand: true, handStyle: 'lanes', handArt: true,
    });
    applyUpdate({ scenes: { igodual: { handStyle: 'fan' } } });
    assert.equal(getState().preview.scenes.igodual.handStyle, 'lanes', 'an unknown hand style is ignored');
    applyUpdate({ scenes: { igodual: { hand: 0 } } });
    assert.equal(getState().preview.scenes.igodual.hand, false);
    applyUpdate({ scenes: { igodual: { handArt: 0 }, igorows: { handArt: false } } });
    assert.equal(getState().preview.scenes.igodual.handArt, false);
    assert.equal(getState().preview.scenes.igorows.handArt, false);
  });

  it('cleans the up-next tables, casters and seeds on the event', () => {
    applyUpdate({ event: {
      roundsRemaining: 120,
      tables: [
        { label: 'Table 1', left: { name: 'Shoji', country: 'kr', record: '8-2-0', seed: '3rd', legend: 'Yasuo, Unforgiven', legendSlug: 'yasuo-unforgiven', legendCardId: 'OGN-259' }, right: { name: 'Margaux' } },
        'junk', {}, {}, {},
      ],
      casters: [{ name: 'Lena', role: 'Play-by-play', handle: '' }, { name: '' }, { role: 'no name' }],
      seeds: 'Guubums · 9-1-0 · Irelia\n\x07Dax · 8-2-0',
    } });
    const ev = getState().preview.event;
    assert.equal(ev.roundsRemaining, 99);
    assert.equal(ev.tables.length, 4, 'at most four tables');
    assert.equal(ev.tables[0].left.country, 'KR');
    assert.equal(ev.tables[0].left.legendSlug, 'yasuo-unforgiven');
    assert.equal(ev.tables[0].right.name, 'Margaux');
    assert.equal(ev.tables[1].left.name, '', 'a junk row becomes an empty table, never a crash');
    assert.deepEqual(ev.casters, [{ name: 'Lena', role: 'Play-by-play', handle: '' }]);
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

  it('runs the showdown chain as cues: open, play, resolve, undo, close', () => {
    applyUpdate({ match: {
      left: { handCount: 2, hand: [{ cardId: 'SFD-045', cardName: 'Not So Fast', kind: 'reaction' }, { cardId: 'OGN-205', cardName: 'Yasuo, Windrider', kind: 'champion' }] },
      right: { handCount: 1, hand: [{ cardId: 'UNL-007', cardName: 'Smite', kind: 'action' }] },
    } });
    applyUpdate({ action: 'turn', op: 'side', side: 'right' });
    assert.equal(applyUpdate({ action: 'chain', op: 'open', battlefield: 'Altar to Unity', battlefieldCardId: 'OGN-275' }).ok, true);
    let sd = getState().preview.match.showdown;
    assert.equal(sd.active, true);
    assert.equal(sd.battlefield, 'Altar to Unity');
    assert.equal(sd.priority, 'left', 'the non-active player responds first');
    applyUpdate({ action: 'chain', op: 'play', side: 'right', index: 0 });
    applyUpdate({ action: 'chain', op: 'play', side: 'left', index: 0 });
    sd = getState().program.match.showdown;
    assert.equal(sd.chain.length, 2, 'both banks carry the chain');
    assert.deepEqual(sd.chain[1], { cardId: 'SFD-045', cardName: 'Not So Fast', kind: 'reaction', side: 'left' });
    assert.equal(sd.priority, 'right', 'priority passes to the other player after a play');
    assert.equal(getState().preview.match.left.hand[0].played, true);
    assert.equal(applyUpdate({ action: 'chain', op: 'play', side: 'left', index: 9 }).ok, false);
    applyUpdate({ action: 'chain', op: 'unplay' });
    assert.equal(getState().preview.match.showdown.chain.length, 1);
    assert.equal(getState().preview.match.left.hand[0].played, false);
    applyUpdate({ action: 'chain', op: 'play', side: 'left', index: 0 });
    applyUpdate({ action: 'chain', op: 'resolve' });
    const left = getState().preview.match.left;
    assert.equal(left.hand.length, 1, 'a resolved card leaves the hand');
    assert.equal(left.hand[0].cardId, 'OGN-205');
    assert.equal(left.handCount, 1);
    applyUpdate({ action: 'chain', op: 'close' });
    sd = getState().preview.match.showdown;
    assert.equal(sd.active, false);
    assert.equal(sd.chain.length, 0);
    assert.equal(getState().preview.match.right.hand.length, 0, 'closing resolves what was left on the chain');
    assert.equal(applyUpdate({ action: 'chain', op: 'dance' }).ok, false);
  });

  it('clears the experimental scenes with everything else on CLEAR', () => {
    applyUpdate({ scenes: { slate: { visible: true } } });
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.slate.visible, true);
    applyUpdate({ action: 'clear' });
    assert.equal(getState().program.scenes.slate.visible, false);
  });

  it('takes one graphic off air and leaves the rest of program up', () => {
    applyUpdate({ scenes: { slate: { visible: true }, scorebug: { visible: true } } });
    applyUpdate({ action: 'take' });
    assert.equal(applyUpdate({ action: 'off', scene: 'slate' }).ok, true);
    assert.equal(getState().program.scenes.slate.visible, false);
    assert.equal(getState().program.scenes.scorebug.visible, true, 'the other graphic stays on air');
    assert.equal(getState().preview.scenes.slate.visible, true, 'preview keeps it, so TAKE puts it back');
    assert.equal(applyUpdate({ action: 'off', scene: 'nope' }).ok, false);
    applyUpdate({ action: 'clear' });
  });
});
