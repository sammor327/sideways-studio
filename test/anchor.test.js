import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorHost, anchorLabel, sponsorBox, tagPlace, lowerThirdPlace, clipInset,
  TAG_ANCHORS, TAG_FRAME, LT_ANCHORS, LT_FRAME, LT_SAFE_LEFT, LT_MIN_SCALE, ANCHOR_WINDOWS, TAG_MAX_W, TAG_H,
} from '../web/shared/anchor.js';
import { SPONSOR_HOSTS } from '../web/shared/sponsor.js';

// A bank with these overlays up and the given tag, lower third and sponsor
// settings.
const bankWith = (on, { tag = {}, lt = {}, sponsor = null } = {}) => ({
  scenes: {
    ...Object.fromEntries(SPONSOR_HOSTS.map((k) => [k, { visible: on.includes(k) }])),
    cornertag: { visible: true, dock: true, ...tag },
    lowerthird: { visible: true, dock: true, ...lt },
    sponsor: sponsor ? { visible: true, items: [{ name: 'Card Haven' }], position: 'auto', dock: true, label: '', ...sponsor } : { visible: false, items: [] },
  },
});
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const tagBox = (at, w = TAG_MAX_W, h = TAG_H) => ({ x: at.right - w, y: at.top, w, h });
const barBox = (at, w, h, align = 'center') => {
  const bw = w * at.scale;
  const bh = h * at.scale;
  return { x: align === 'left' ? at.x : at.x - bw / 2, y: at.bottom - bh, w: bw, h: bh };
};

describe('anchoring: which overlay', () => {
  it('anchors to the overlay that is up, the frame-owning layouts before the arena bug', () => {
    assert.equal(anchorHost(bankWith([])), '');
    assert.equal(anchorHost(bankWith(['igo1v1'])), 'igo1v1');
    assert.equal(anchorHost(bankWith(['arenabug', 'igorows'])), 'igorows');
    assert.equal(anchorLabel('igodual'), 'the dual columns');
    assert.equal(anchorLabel(''), '');
  });
  it('has a tag spot and a lower third run for every overlay the sponsor plate docks into', () => {
    for (const host of SPONSOR_HOSTS) {
      assert.ok(TAG_ANCHORS[host], `${host} has no tag spot`);
      assert.ok(LT_ANCHORS[host], `${host} has no lower third run`);
      assert.ok(ANCHOR_WINDOWS[host], `${host} has no window`);
    }
  });
});

describe('anchoring: the corner tag', () => {
  it('keeps its frame place with nothing up, and with its switch off', () => {
    assert.deepEqual(tagPlace(bankWith([])), { host: '', right: TAG_FRAME.right, top: TAG_FRAME.top, clip: null });
    const off = tagPlace(bankWith(['igorows'], { tag: { dock: false } }));
    assert.equal(off.host, '');
    assert.equal(off.right, TAG_FRAME.right);
  });
  it('sits in the overlay\'s game area, inside its window, the widest tag included', () => {
    for (const host of SPONSOR_HOSTS) {
      const at = tagPlace(bankWith([host]));
      assert.equal(at.host, host);
      assert.equal(at.right, TAG_ANCHORS[host].right);
      assert.equal(at.top, TAG_ANCHORS[host].top);
      const box = tagBox(at);
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 1920, `${host}: the widest tag leaves the frame`);
    }
    // The dual columns: between them, so it comes in under the right column.
    const dual = tagPlace(bankWith(['igodual']));
    assert.ok(dual.right <= 1570 - 16);
    assert.deepEqual(dual.clip, ANCHOR_WINDOWS.igodual);
  });
  it('is not clipped where it sits outside the overlay\'s game area (the POV overlay\'s free corner)', () => {
    assert.equal(tagPlace(bankWith(['pov'])).clip, null);
  });
  it('drops below the sponsor plate when the plate is up in its corner, tag strip included', () => {
    for (const host of ['igorows', 'igobars', 'arenabug']) {
      // Each of these docks the plate top right by default.
      const plain = tagPlace(bankWith([host], { sponsor: {} }));
      const sp = sponsorBox(bankWith([host], { sponsor: {} }));
      assert.ok(!overlap(tagBox(plain), sp), `${host}: tag on the sponsor plate`);
      assert.equal(plain.top, sp.y + sp.h + 12);
      const labelled = tagPlace(bankWith([host], { sponsor: { label: 'Presented by' } }));
      assert.equal(labelled.top, plain.top + 24, `${host}: the plate's tag strip`);
    }
    // Frame corners too: undocked tag, plate pinned top right.
    const frame = tagPlace(bankWith([], { sponsor: { position: 'tr' } }));
    assert.ok(!overlap(tagBox(frame), sponsorBox(bankWith([], { sponsor: { position: 'tr' } }))));
  });
  it('stays put when the plate is elsewhere, off, or has no sponsor', () => {
    const left = tagPlace(bankWith(['igorows'], { sponsor: { position: 'bl' } }));
    assert.equal(left.top, TAG_ANCHORS.igorows.top);
    const bank = bankWith(['igorows'], { sponsor: {} });
    bank.scenes.sponsor.visible = false;
    assert.equal(tagPlace(bank).top, TAG_ANCHORS.igorows.top);
    bank.scenes.sponsor = { visible: true, items: [] };
    assert.equal(tagPlace(bank).top, TAG_ANCHORS.igorows.top);
  });
  it('measures the tag it has: a short tag clears a plate a long one would hit', () => {
    // The plate pinned top left of the frame: under the widest tag's left
    // end, clear of a 300px tag.
    const bank = bankWith([], { tag: { dock: false }, sponsor: { position: 'tl', dock: false } });
    const plate = sponsorBox(bank);
    const wide = tagPlace(bank, { w: 1860 - plate.x - 10, h: 60 });
    const short = tagPlace(bank, { w: 300, h: 60 });
    assert.ok(wide.top > TAG_FRAME.top);
    assert.equal(short.top, TAG_FRAME.top);
  });
});

describe('anchoring: the lower third', () => {
  it('keeps its frame place with nothing up: centred, 96px up', () => {
    const at = lowerThirdPlace(bankWith([]), { w: 1100, h: 96 });
    assert.deepEqual(at, { host: '', x: 960, bottom: 984, scale: 1, clip: null });
    const interview = lowerThirdPlace(bankWith([]), { w: 544, h: 103, align: 'left' });
    assert.equal(interview.x, LT_SAFE_LEFT);
  });
  it('centres on the overlay\'s game area, inside its run and window', () => {
    for (const host of SPONSOR_HOSTS) {
      const run = LT_ANCHORS[host];
      const at = lowerThirdPlace(bankWith([host]), { w: 700, h: 100 });
      assert.equal(at.host, host);
      assert.equal(at.x, (run.left + run.right) / 2);
      assert.equal(at.bottom, run.bottom);
      const box = barBox(at, 700, 100);
      assert.ok(box.x >= run.left && box.x + box.w <= run.right, `${host}: the bar leaves its run`);
      assert.ok(at.clip, `${host}: no window to come in under`);
    }
    // The rows overlay: right of the column, over the bottom bar.
    const rows = lowerThirdPlace(bankWith(['igorows']), { w: 1100, h: 96 });
    assert.ok(rows.x > 960 && rows.bottom <= 1005 - 16);
  });
  it('scales a bar wider than the room down around its bottom centre, never below the floor', () => {
    const run = LT_ANCHORS.igoportrait;
    const at = lowerThirdPlace(bankWith(['igoportrait']), { w: 1108, h: 96 });
    assert.ok(Math.abs(at.scale - (run.right - run.left) / 1108) < 1e-9);
    const box = barBox(at, 1108, 96);
    assert.ok(Math.abs(box.x - run.left) < 1e-6 && Math.abs(box.x + box.w - run.right) < 1e-6);
    assert.equal(lowerThirdPlace(bankWith(['igoportrait']), { w: 5000, h: 96 }).scale, LT_MIN_SCALE);
    assert.equal(lowerThirdPlace(bankWith(['igorows']), { w: 1108, h: 96 }).scale, 1);
  });
  it('hangs the interview bar from the run\'s left edge, never nearer the frame edge than 80px', () => {
    assert.equal(lowerThirdPlace(bankWith(['igorows']), { w: 544, h: 103, align: 'left' }).x, LT_ANCHORS.igorows.left);
    assert.equal(lowerThirdPlace(bankWith(['igo1v1']), { w: 544, h: 103, align: 'left' }).x, LT_SAFE_LEFT);
  });
  it('rises above the sponsor plate in a bottom corner, and only when the bar would hit it', () => {
    const bank = bankWith(['igorows'], { sponsor: { position: 'bl', label: 'Presented by' } });
    const sp = sponsorBox(bank);
    const wide = lowerThirdPlace(bank, { w: 1500, h: 96 });
    assert.ok(!overlap(barBox(wide, 1500, 96), sp));
    assert.equal(wide.bottom, sp.y - 12);
    // A short bar centred on the rows' game area clears a plate at its left.
    const short = lowerThirdPlace(bank, { w: 600, h: 96 });
    assert.equal(short.bottom, LT_ANCHORS.igorows.bottom);
  });
  it('keeps its frame place with its switch off, whatever is up', () => {
    const at = lowerThirdPlace(bankWith(['igobars'], { lt: { dock: false } }), { w: 1100, h: 96 });
    assert.equal(at.host, '');
    assert.equal(at.bottom, LT_FRAME.bottom);
    assert.equal(at.clip, null);
  });
});

describe('anchoring: the clip', () => {
  it('is an inset in design units, or nothing', () => {
    assert.equal(clipInset(null), '');
    assert.equal(
      clipInset({ x: 350, y: 0, w: 1220, h: 1080 }),
      'inset(calc(0 * var(--u)) calc(350 * var(--u)) calc(0 * var(--u)) calc(350 * var(--u)))',
    );
  });
});
