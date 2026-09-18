import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sponsorDock, sponsorHost, sponsorSlot, sponsorWindowOpen, SPONSOR_DOCKS, FADE_MS } from '../web/shared/sponsor.js';

let applyUpdate;
let getState;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-sponsor-test-'));
  ({ applyUpdate, getState } = await import('../server/state.js'));
});

const bankWith = (on, sponsor = {}) => ({
  scenes: {
    ...Object.fromEntries(Object.keys(SPONSOR_DOCKS).map((k) => [k, { visible: on.includes(k) }])),
    sponsor: { position: 'auto', ...sponsor },
  },
});

describe('sponsor plate: docking', () => {
  it('docks into the overlay that is up, at 3:1', () => {
    const dock = sponsorDock(bankWith(['igo1v1']));
    assert.equal(dock.host, 'igo1v1');
    assert.equal(dock.x, SPONSOR_DOCKS.igo1v1.x);
    assert.equal(dock.h, Math.round(dock.w / 3));
  });
  it('prefers the frame-owning layout over the arena bug', () => {
    assert.equal(sponsorHost(bankWith(['arenabug', 'igorows'])), 'igorows');
  });
  it('falls back to the top right corner with nothing up, in its own look', () => {
    const dock = sponsorDock(bankWith([]));
    assert.equal(dock.host, '');
    assert.equal(dock.x, 1566);
    assert.equal(dock.y, 24);
  });
  it('a pinned corner wins over the overlay and drops the host look', () => {
    const dock = sponsorDock(bankWith(['igo1v1'], { position: 'bl' }));
    assert.equal(dock.host, '');
    assert.equal(dock.y, 946);
  });
  it('every dock stays inside the frame', () => {
    for (const [key, d] of Object.entries(SPONSOR_DOCKS)) {
      assert.ok(d.x >= 0 && d.x + d.w <= 1920, key);
      assert.ok(d.y >= 0 && d.y + Math.round(d.w / 3) <= 1080, key);
    }
  });
});

describe('sponsor plate: rotation and window', () => {
  it('walks the list on the wall clock and cross-fades', () => {
    assert.deepEqual(sponsorSlot(3, 10, 0), { index: 0, previous: 2, fade: 0 });
    assert.equal(sponsorSlot(3, 10, 10_000 + FADE_MS).index, 1);
    assert.equal(sponsorSlot(3, 10, 10_000 + FADE_MS).fade, 1);
    assert.equal(sponsorSlot(3, 10, 30_000).index, 0);
  });
  it('one sponsor never fades; none has no slot', () => {
    assert.deepEqual(sponsorSlot(1, 10, 12_345), { index: 0, previous: -1, fade: 1 });
    assert.equal(sponsorSlot(0, 10, 0).index, -1);
  });
  it('shows always at every=0, else the first N seconds of every M minutes', () => {
    assert.equal(sponsorWindowOpen(0, 20, 999_999), true);
    assert.equal(sponsorWindowOpen(5, 20, 5 * 60_000 + 19_000), true);
    assert.equal(sponsorWindowOpen(5, 20, 5 * 60_000 + 21_000), false);
  });
});

describe('sponsor plate: state', () => {
  it('cannot go on with no sponsor', () => {
    applyUpdate({ scenes: { sponsor: { visible: true } } });
    assert.equal(getState().preview.scenes.sponsor.visible, false);
  });
  it('keeps names and art the server wrote, drops anything else', () => {
    applyUpdate({ scenes: { sponsor: { visible: true, items: [
      { name: 'Rift Cave', image: '/theme/sponsor/0123456789ab.png' },
      { name: 'Bad path', image: '../../etc/passwd' },
      { name: '', image: 'http://evil.example/x.png' },
      null,
    ] } } });
    const cfg = getState().preview.scenes.sponsor;
    assert.equal(cfg.visible, true);
    assert.deepEqual(cfg.items, [
      { name: 'Rift Cave', image: '/theme/sponsor/0123456789ab.png' },
      { name: 'Bad path', image: '' },
    ]);
  });
  it('clamps the timings and ignores an unknown position', () => {
    applyUpdate({ scenes: { sponsor: { interval: 1, every: 999, duration: 1, position: 'middle' } } });
    const cfg = getState().preview.scenes.sponsor;
    assert.equal(cfg.interval, 3);
    assert.equal(cfg.every, 60);
    assert.equal(cfg.duration, 5);
    assert.equal(cfg.position, 'auto');
  });
  it('rows overlay pieces switch off one by one', () => {
    applyUpdate({ scenes: { igorows: { activeTurn: false, points: false, turnCounter: 'no' } } });
    const rw = getState().preview.scenes.igorows;
    assert.equal(rw.activeTurn, false);
    assert.equal(rw.points, false);
    assert.equal(rw.turnCounter, true);
    assert.equal(rw.hand, true);
  });
});
