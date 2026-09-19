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
