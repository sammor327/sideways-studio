import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_RATIO, GRID_GAP, GRID_W, GRID_X, MARGIN, PILL_FONT, PILL_MIN_FONT, PILL_NAME_W, PLATE_W,
  RUNE_MIN_SCALE, STRIP_H, STRIP_TOP, TOP,
  fitScale, gridColumns, gridMetrics, introDelays, introSeconds, legendSlug, missFontSize,
  pillNameScale, runeRoom, runeScale, sideboardSlots, springAt,
} from '../web/scenes/decklist/layout.js';

describe('plate geometry', () => {
  it('matches the reference canvas', () => {
    assert.equal(GRID_W, 1233);
    assert.equal(STRIP_H, 156);
    assert.equal(GRID_X + GRID_W + MARGIN, PLATE_W);
    assert.equal(STRIP_TOP + STRIP_H + MARGIN, 1080);
  });

  it('keeps the designed six columns up to 18 distinct names', () => {
    for (const n of [0, 1, 15, 18]) assert.equal(gridColumns(n), 6);
  });

  it('adds columns instead of clipping longer decks', () => {
    assert.equal(gridColumns(19), 7);
    assert.equal(gridColumns(21), 7);
    assert.equal(gridColumns(22), 8);
    assert.equal(gridColumns(24), 8);
    assert.equal(gridColumns(40), 14);
  });

  it('fills exactly the grid width, in at most three rows, above the strip', () => {
    for (let n = 1; n <= 40; n += 1) {
      const g = gridMetrics(n);
      assert.ok(Math.abs(g.cols * g.cardW + (g.cols - 1) * GRID_GAP - GRID_W) < 1e-9, `width for ${n}`);
      const rows = Math.ceil(n / g.cols);
      assert.ok(rows <= 3, `rows for ${n}`);
      const bottom = TOP + rows * g.cardH + (rows - 1) * GRID_GAP;
      assert.ok(bottom <= STRIP_TOP, `grid bottom ${bottom} for ${n} names overlaps the strip`);
    }
  });

  it('sizes cards and quantities like the reference', () => {
    const g = gridMetrics(15);
    assert.ok(Math.abs(g.cardW - 193.8333) < 1e-3);
    assert.ok(Math.abs(g.cardH - g.cardW / CARD_RATIO) < 1e-9);
    assert.equal(g.qtySize, 78);
    assert.equal(missFontSize(92), 16);
    assert.ok(Math.abs(missFontSize(600) - 66) < 1e-9);
  });

  it('shows the ten-slot rack, growing for an oversized sideboard', () => {
    assert.equal(sideboardSlots(0), 10);
    assert.equal(sideboardSlots(5), 10);
    assert.equal(sideboardSlots(12), 12);
  });
});

describe('strip fitting', () => {
  // A bold digit at 78px is about 45 design pixels wide in the TES face.
  const digits = (n) => String(n).length * 45;

  it('leaves the rune counts what the fixed items do not take', () => {
    // rails, pills, champion and five gaps; the spacer collapses to nothing.
    assert.equal(runeRoom(false), 1856 - (36 + 330 + 36 + 104) - 5 * 8);
    // plus the sideboard rail, the ten-slot rack and three more gaps.
    assert.equal(runeRoom(true, 5), 258);
    assert.equal(runeRoom(true, 0), runeRoom(true, 10));
    // every extra slot costs a card and a gap.
    assert.equal(runeRoom(true, 12), 258 - 2 * (92 + 8));
  });

  it('keeps every split at full size without the rack', () => {
    for (const split of [[6, 6], [7, 5], [12], [10, 2], [4, 4, 4]]) {
      assert.equal(runeScale(split.map(digits), runeRoom(false)), 1, split.join('/'));
    }
  });

  it('shrinks a two-digit split beside the rack, and a third domain more', () => {
    const room = runeRoom(true, 5);
    const twelve = runeScale([digits(12)], room);
    const even = runeScale([6, 6].map(digits), room);
    const tenTwo = runeScale([10, 2].map(digits), room);
    const three = runeScale([4, 4, 4].map(digits), room);
    assert.equal(twelve, 1);
    assert.ok(even > 0.95 && even <= 1, `6/6 ${even}`);
    assert.ok(tenTwo < even && tenTwo > 0.75, `10/2 ${tenTwo}`);
    assert.ok(three < tenTwo && three > 0.55, `4/4/4 ${three}`);
    // 11/1 is as wide as 10/2: the fit is about digits, not values.
    assert.equal(runeScale([11, 1].map(digits), room), tenTwo);
  });

  it('lands the shrunken block inside the room, never below the floor', () => {
    const room = runeRoom(true, 5);
    const widths = [10, 2].map(digits);
    const s = runeScale(widths, room);
    const need = widths.reduce((w, d) => w + 66 + 10 + d, 0) + 20;
    assert.ok(need * s <= room, `${need * s} in ${room}`);
    assert.equal(runeScale([4, 4, 4].map(digits), runeRoom(true, 14)), RUNE_MIN_SCALE);
    assert.equal(runeScale([], 0), 1);
  });

  it('shrinks a battlefield name to its run, then stops at the floor', () => {
    assert.equal(PILL_NAME_W, 236);
    assert.equal(pillNameScale(200), 1);
    assert.equal(pillNameScale(230), 1);
    const long = pillNameScale(364); // "HEISHO, SHELL OF THE WORLD"
    assert.ok(long < 1 && long * 364 <= 236, `${long}`);
    assert.ok(long * PILL_FONT >= PILL_MIN_FONT);
    assert.equal(pillNameScale(2000) * PILL_FONT, PILL_MIN_FONT);
    // A gauge that could not measure reports 0: the designed size stands.
    assert.equal(pillNameScale(0), 1);
  });

  it('fits with slack, so a near miss still lands inside', () => {
    assert.equal(fitScale(100, 102, 0), 1);
    assert.ok(fitScale(100, 101, 0) < 1);
    assert.ok(Math.abs(fitScale(200, 100, 0) * 200 * 1.02 - 100) < 1e-9);
    assert.equal(fitScale(200, 10, 0.4), 0.4);
  });
});

describe('build-in timing', () => {
  it('schedules the reference delays', () => {
    const d = introDelays(15, 2);
    assert.equal(d.legend, 0);
    assert.deepEqual(d.cards.slice(0, 3), [12, 14, 16]);
    assert.equal(d.cards[14], 40);
    assert.equal(d.strip, 12 + 30 + 4);
    assert.deepEqual(d.runes, [56, 60]);
  });

  it('springs from 0 toward 1 without overshoot', () => {
    assert.equal(springAt(-1), 0);
    assert.equal(springAt(0), 0);
    let prev = 0;
    for (let t = 0.01; t < 2; t += 0.01) {
      const s = springAt(t);
      assert.ok(s >= prev && s < 1, `monotone below 1 at ${t}`);
      prev = s;
    }
    // Remotion's damping 200 spring is ~96% there at half a second.
    assert.ok(Math.abs(springAt(0.5) - 0.9596) < 1e-3);
  });

  it('runs long enough that the last rune lands, even on a long list', () => {
    for (const [main, runes] of [[15, 2], [25, 2], [30, 3], [40, 6]]) {
      const d = introDelays(main, runes);
      const lastStart = Math.max(...d.runes, d.strip) / 30;
      const end = introSeconds(main, runes);
      assert.ok(springAt(end - lastStart) > 0.999, `${main} names, ${runes} runes`);
    }
  });
});

describe('legendSlug', () => {
  it('names a plate after the legend given name', () => {
    assert.equal(legendSlug('Viktor, Herald of the Arcane'), 'viktor');
    assert.equal(legendSlug("Kai'Sa, Daughter of the Void"), 'kai-sa');
    assert.equal(legendSlug(''), 'decklist');
    assert.equal(legendSlug(null), 'decklist');
  });
});
