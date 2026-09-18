// The sponsor plate: one 3:1 plate that rotates through the event's sponsors
// and docks into whichever in-game overlay is up (Sam, 2026-09-18: "modular
// based on the current in game overlay"; covering some gameplay is fine).
//
// Shared by the scene (where to draw, which sponsor is up, whether the plate
// is in its on-air window) and the panel (which overlay it will dock into),
// and pure so the tests can run it: every answer is a function of the bank
// and the wall clock, so the preview monitor, the program source and a
// second copy of either always agree on the sponsor that is up.

// Where the plate docks on each overlay, in 1920x1080 design pixels. h is
// always w / 3. radius follows the host's own panels, and each dock sits on
// something the show can spare: the logo panel of the two sidebar overlays,
// the event block of the dual columns and the pillars, a dead corner of the
// full-width layouts, the space over the POV column.
export const SPONSOR_DOCKS = {
  igorows: { x: 1596, y: 91, w: 300, radius: 6, label: 'the rows overlay' },
  igoportrait: { x: 48, y: 730, w: 450, radius: 4, label: 'the portrait pillars' },
  igodual: { x: 34, y: 700, w: 280, radius: 0, label: 'the dual columns' },
  igobars: { x: 1566, y: 70, w: 330, radius: 0, label: 'the 2v2 bars' },
  igo2v2: { x: 1540, y: 480, w: 360, radius: 10, label: 'the 2v2 sidebar' },
  igo1v1: { x: 1640, y: 492, w: 272, radius: 10, label: 'the 1v1 sidebar' },
  pov: { x: 24, y: 652, w: 252, radius: 0, label: 'the POV overlay' },
  arenabug: { x: 1566, y: 24, w: 330, radius: 10, label: 'the arena bug' },
};

// Which overlay the plate docks into when more than one is up: the layouts
// that own the frame first, the small bug last.
export const SPONSOR_HOSTS = ['igorows', 'igoportrait', 'igodual', 'igobars', 'igo2v2', 'igo1v1', 'pov', 'arenabug'];

// Fixed corners for a show that wants the plate somewhere else. With no
// in-game overlay up, auto uses the top right one. The same 330x110 plate,
// 24px off the frame edges.
export const SPONSOR_CORNERS = {
  tl: { x: 24, y: 24, w: 330, radius: 8, label: 'the top left corner' },
  tr: { x: 1566, y: 24, w: 330, radius: 8, label: 'the top right corner' },
  bl: { x: 24, y: 946, w: 330, radius: 8, label: 'the bottom left corner' },
  br: { x: 1566, y: 946, w: 330, radius: 8, label: 'the bottom right corner' },
};
export const SPONSOR_POSITIONS = ['auto', ...Object.keys(SPONSOR_CORNERS)];

export const SPONSOR_MAX = 12;
export const FADE_MS = 500;

// The overlay the plate docks into in this bank, or '' for none.
export function sponsorHost(bank) {
  return SPONSOR_HOSTS.find((key) => bank.scenes[key] && bank.scenes[key].visible) || '';
}

// Where the plate sits: { host, x, y, w, h, radius, label }. host is the
// overlay whose look the plate takes ('' = the plate's own look).
export function sponsorDock(bank) {
  const cfg = bank.scenes.sponsor || {};
  const host = sponsorHost(bank);
  const corner = SPONSOR_CORNERS[cfg.position];
  const dock = corner || SPONSOR_DOCKS[host] || SPONSOR_CORNERS.tr;
  return { ...dock, h: Math.round(dock.w / 3), host: corner ? '' : host };
}

// Which sponsor is up at wall-clock ms `now`, and how far into its slot:
// { index, previous, fade } where fade runs 0 -> 1 over the first FADE_MS of
// a slot while the previous sponsor fades out under it.
export function sponsorSlot(count, intervalSec, now) {
  if (count <= 0) return { index: -1, previous: -1, fade: 1 };
  if (count === 1) return { index: 0, previous: -1, fade: 1 };
  const period = Math.max(1, intervalSec) * 1000;
  const k = Math.floor(now / period);
  const into = now - k * period;
  return { index: k % count, previous: (k - 1 + count) % count, fade: Math.min(into / FADE_MS, 1) };
}

// Whether the plate is inside its on-air window: always, when everyMin is 0;
// otherwise the first forSec seconds of every everyMin minutes.
export function sponsorWindowOpen(everyMin, forSec, now) {
  if (!(everyMin > 0)) return true;
  const period = everyMin * 60_000;
  return now % period < Math.min(forSec * 1000, period);
}
