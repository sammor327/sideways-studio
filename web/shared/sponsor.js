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
  pov: { x: 24, y: 300, w: 252, radius: 0, label: 'the POV overlay' }, // over the column, clear of a featured card
  arenabug: { x: 1566, y: 24, w: 330, radius: 10, label: 'the arena bug' },
};

// Which overlay the plate docks into when more than one is up: the layouts
// that own the frame first, the small bug last.
export const SPONSOR_HOSTS = ['igorows', 'igoportrait', 'igodual', 'igobars', 'igo2v2', 'igo1v1', 'pov', 'arenabug'];

// Docked corners (Sam, 2026-09-18: "the auto dock to overlay, but still
// give it choices"): per overlay, the spot nearest each frame corner that
// clears the overlay's own chrome by at least 16px, the tag included. Found
// by scanning transparent renders of each overlay with the sample match
// (hands, battlefields, featured card and pip track all up), so they sit
// snug against the chrome in the game area. The portrait pillars and the
// arena bug take a smaller plate here, so it fits beside their chrome.
// [x, y] per corner; the plate keeps the overlay's radius and look.
export const SPONSOR_CORNER_DOCKS = {
  igorows: { w: 300, tl: [346, 91], tr: [1596, 91], bl: [346, 889], br: [1596, 889] },
  igoportrait: { w: 330, tl: [562, 80], tr: [1028, 80], bl: [562, 946], br: [1028, 946] },
  igodual: { w: 280, tl: [366, 50], tr: [1274, 50], bl: [366, 962], br: [1274, 962] },
  igobars: { w: 330, tl: [24, 70], tr: [1566, 70], bl: [24, 900], br: [1566, 900] },
  igo2v2: { w: 360, tl: [26, 30], tr: [1130, 30], bl: [26, 932], br: [1130, 932] },
  igo1v1: { w: 272, tl: [24, 28], tr: [1336, 28], bl: [24, 962], br: [1336, 962] },
  pov: { w: 252, tl: [24, 24], tr: [1644, 24], bl: [298, 972], br: [1372, 972] },
  arenabug: { w: 270, tl: [40, 104], tr: [1626, 24], bl: [24, 966], br: [1626, 966] },
};

// Fixed corners for a show that wants the plate on the frame itself, with
// docking off. With docking off and Auto, the top right one. The same
// 330x110 plate, 24px off the frame edges, in the plate's own look.
export const SPONSOR_CORNERS = {
  tl: { x: 24, y: 24, w: 330, radius: 8, label: 'the top left corner' },
  tr: { x: 1566, y: 24, w: 330, radius: 8, label: 'the top right corner' },
  bl: { x: 24, y: 946, w: 330, radius: 8, label: 'the bottom left corner' },
  br: { x: 1566, y: 946, w: 330, radius: 8, label: 'the bottom right corner' },
};
export const SPONSOR_POSITIONS = ['auto', ...Object.keys(SPONSOR_CORNERS)];
const CORNER_WORDS = { tl: 'top left', tr: 'top right', bl: 'bottom left', br: 'bottom right' };

export const SPONSOR_MAX = 12;
export const FADE_MS = 500;

// The overlay the plate docks into in this bank, or '' for none.
export function sponsorHost(bank) {
  return SPONSOR_HOSTS.find((key) => bank.scenes[key] && bank.scenes[key].visible) || '';
}

// Where the plate sits: { host, x, y, w, h, radius, label }. host is the
// overlay whose look the plate takes ('' = the plate's own look). Docked
// (the default) with an overlay up: Auto is the overlay's own spot and a
// corner is that overlay's corner spot. With no overlay up, or docking off,
// the frame corner (Auto: top right).
export function sponsorDock(bank) {
  const cfg = bank.scenes.sponsor || {};
  const host = sponsorHost(bank);
  const corner = SPONSOR_CORNERS[cfg.position] ? cfg.position : '';
  if (cfg.dock !== false && host) {
    const set = corner && SPONSOR_CORNER_DOCKS[host];
    const base = SPONSOR_DOCKS[host];
    const dock = set
      ? { x: set[corner][0], y: set[corner][1], w: set.w, radius: base.radius, label: `${base.label}, ${CORNER_WORDS[corner]}` }
      : base;
    return { ...dock, h: Math.round(dock.w / 3), host };
  }
  const dock = SPONSOR_CORNERS[corner || 'tr'];
  return { ...dock, h: Math.round(dock.w / 3), host: '' };
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
