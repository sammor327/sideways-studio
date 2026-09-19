import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let applyUpdate;
let getState;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-live-test-'));
  ({ applyUpdate, getState } = await import('../server/state.js'));
});

describe('the live action (a game feed writing match data)', () => {
  it('lands the same match patch in preview and program at once', () => {
    const r = applyUpdate({ action: 'live', match: { turn: 7, activeSide: 'right', left: { score: 5, hand: [{ cardName: 'Vilemaw' }], handCount: 3 } } });
    assert.equal(r.ok, true);
    for (const bank of ['preview', 'program']) {
      const m = getState()[bank].match;
      assert.equal(m.turn, 7);
      assert.equal(m.activeSide, 'right');
      assert.equal(m.left.score, 5);
      assert.equal(m.left.handCount, 3);
      assert.deepEqual(m.left.hand.map((c) => c.cardName), ['Vilemaw']);
      assert.equal(m.left.hand[0].cardId, '', 'a card named without an id keeps an empty id');
    }
  });

  it('goes through the same whitelist as any edit', () => {
    applyUpdate({ action: 'live', match: { left: { score: 99, legendCardId: '../x' } } });
    for (const bank of ['preview', 'program']) {
      assert.equal(getState()[bank].match.left.score, 8);
      assert.equal(getState()[bank].match.left.legendCardId, '');
    }
  });

  it('carries match data only: graphics and the theme are not touched', () => {
    const before = getState().program.scenes.scorebug.visible;
    const r = applyUpdate({ action: 'live', match: { right: { score: 2 } }, scenes: { scorebug: { visible: !before } } });
    assert.equal(r.ok, true);
    assert.equal(getState().program.scenes.scorebug.visible, before);
    assert.equal(getState().preview.scenes.scorebug.visible, before);
  });

  it('refuses a body with no match data', () => {
    assert.equal(applyUpdate({ action: 'live' }).ok, false);
    assert.equal(applyUpdate({ action: 'live', match: 'x' }).ok, false);
  });
});

describe('the showdown a live feed writes (match.showdown)', () => {
  it('takes the showdown whole, cleaned: sides, resolved marks, might, the newest twelve', () => {
    const chain = [
      { cardName: 'Riposte', side: 'left', resolved: true },
      { cardName: 'No side', side: 'middle' },
      ...Array.from({ length: 13 }, (_, i) => ({ cardName: `Card ${i}`, side: 'right' })),
    ];
    const r = applyUpdate({ action: 'live', match: { showdown: { active: true, battlefield: 'Sunken Temple', priority: 'right', chain, might: { left: 9, right: 1200 } } } });
    assert.equal(r.ok, true);
    for (const bank of ['preview', 'program']) {
      const sd = getState()[bank].match.showdown;
      assert.equal(sd.active, true);
      assert.equal(sd.battlefield, 'Sunken Temple');
      assert.equal(sd.priority, 'right');
      assert.equal(sd.chain.length, 12);
      assert.equal(sd.chain[11].cardName, 'Card 12', 'the newest twelve');
      assert.ok(sd.chain.every((c) => ['left', 'right'].includes(c.side)));
      assert.ok(sd.chain.every((c) => c.cardId === ''), 'no card id stays empty');
      assert.deepEqual(sd.might, { left: 9, right: 999 });
    }
  });

  it("keeps the other side's might when one side is patched, and takes null for unknown", () => {
    applyUpdate({ action: 'live', match: { showdown: { might: { left: null } } } });
    assert.deepEqual(getState().preview.match.showdown.might, { left: null, right: 999 });
  });

  it('keeps what was done with each card on a feed stack, and nothing it does not know', () => {
    applyUpdate({ action: 'live', match: { showdown: { active: true, chain: [
      { cardName: 'Drawn', side: 'left', action: 'drew' },
      { cardName: 'Odd', side: 'right', action: 'teleported' },
      { cardName: 'Cue play', side: 'right' },
    ] } } });
    assert.deepEqual(getState().program.match.showdown.chain.map((c) => [c.cardName, c.action]), [['Drawn', 'drew'], ['Odd', ''], ['Cue play', '']]);
    applyUpdate({ action: 'chain', op: 'close' });
  });

  it('the chain cue closes it the way it always has, might included', () => {
    applyUpdate({ action: 'chain', op: 'close' });
    const sd = getState().preview.match.showdown;
    assert.equal(sd.active, false);
    assert.deepEqual(sd.chain, []);
    assert.deepEqual(sd.might, { left: null, right: null });
  });
});

describe('where an open showdown airs', () => {
  it("in the rows overlay's column while it is up with Showdown in the column on", async () => {
    const { rowsShowsShowdown } = await import('../web/shared/showdowndock.js');
    assert.equal(rowsShowsShowdown({ scenes: { igorows: { visible: true } } }), true, 'on by default');
    assert.equal(rowsShowsShowdown({ scenes: { igorows: { visible: true, showdownView: false } } }), false);
    assert.equal(rowsShowsShowdown({ scenes: { igorows: { visible: false, showdownView: true } } }), false);
    assert.equal(rowsShowsShowdown({ scenes: {} }), false);
    assert.equal(getState().preview.scenes.igorows.showdownView, true);
  });
});
