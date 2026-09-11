import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_RATIO, GRID_GAP, GRID_W, GRID_X, MARGIN, PLATE_W, STRIP_H, STRIP_TOP, TOP,
  gridColumns, gridMetrics, introDelays, introSeconds, legendSlug, missFontSize, sideboardSlots, springAt,
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
