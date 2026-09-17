import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupHand, scrollAt, scrollTravelMs, SCROLL_HOLD_MS } from '../web/shared/handlist.js';

describe('cards in hand as the overlays list them', () => {
  it('keeps the typed order and puts copies on one row with a count', () => {
    const hand = [
      { cardId: 'A', kind: 'unit' },
      { cardId: 'B', kind: 'reaction' },
      { cardId: 'A', kind: 'unit' },
      { cardId: 'C', kind: 'action' },
      { cardId: 'A', kind: 'unit' },
    ];
    const rows = groupHand(hand);
    assert.deepEqual(rows.map((r) => [r.cardId, r.qty]), [['A', 3], ['B', 1], ['C', 1]]);
    assert.equal(hand[0].qty, undefined, 'the hand it was given is left alone');
  });

  it('lists a copy on the chain apart from the copies still held', () => {
    const rows = groupHand([{ cardId: 'A' }, { cardId: 'A', played: true }, { cardId: 'A' }]);
    assert.deepEqual(rows.map((r) => [r.cardId, Boolean(r.played), r.qty]), [['A', false, 2], ['A', true, 1]]);
    assert.deepEqual(groupHand(null), []);
    assert.deepEqual(groupHand(['junk', null]), []);
  });

  it('holds at the top, travels down, holds at the bottom, travels back up', () => {
    const hold = SCROLL_HOLD_MS;
    const travel = 2000;
    const over = 300;
    assert.equal(hold, 5000);
    assert.equal(scrollAt(0, over, travel).offset, 0);
    assert.equal(scrollAt(hold - 1, over, travel).offset, 0);
    const down = scrollAt(hold + travel / 2, over, travel);
    assert.equal(down.moving, true);
    assert.equal(down.offset, 150);
    assert.equal(scrollAt(hold + travel, over, travel).offset, over);
    assert.equal(scrollAt(2 * hold + travel - 1, over, travel).offset, over);
    const up = scrollAt(2 * hold + travel + travel / 2, over, travel);
    assert.equal(up.moving, true);
    assert.equal(up.offset, 150);
    assert.equal(scrollAt(2 * (hold + travel), over, travel).offset, 0, 'round again from the top');
  });

  it('snaps between the holds with no travel, and rests when nothing overflows', () => {
    assert.equal(scrollAt(SCROLL_HOLD_MS + 1, 300, 0).offset, 300);
    assert.equal(scrollAt(2 * SCROLL_HOLD_MS + 1, 300, 0).offset, 0);
    assert.deepEqual(scrollAt(7000, 0, 1000), { offset: 0, moving: false, next: Infinity });
  });

  it('travels a third of the box a second, within one and eight seconds', () => {
    assert.equal(scrollTravelMs(300, 300), 3000);
    assert.equal(scrollTravelMs(10, 300), 1000);
    assert.equal(scrollTravelMs(5000, 300), 8000);
    assert.equal(scrollTravelMs(0, 300), 0);
  });
});
