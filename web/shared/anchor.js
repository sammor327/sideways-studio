// Where the corner tag and the lower third sit (2026-09-19, Sam: "make the
// Lower Thirds and corner tags anchored for the in game overlays"). With an
// in-game overlay up in the same bank and the graphic's Anchor switch on
// (`dock`, the default), the tag sits in the top right corner of the game
// area that overlay leaves and the lower third along the bottom of it,
// centred on it and scaled down when the bar is wider than the room there.
// With no overlay up, or the switch off, both keep their frame places: the
// tag 60px in from the top right, the lower third 96px up from the bottom.
// Either way neither sits on the sponsor plate while that is on: the tag
// drops below it, the lower third rises above it.
//
// Shared by the two scenes (where to draw), the panel (what they anchor
// to) and the tests; pure, like sponsor.js. Every spot is in 1920x1080
// design pixels and was found, not eyeballed: transparent renders of each
// overlay with the sample match (hands, battlefields, the featured card and
// the pip track up), their chrome grown by 16px, searched for the spot
// nearest the top right corner that takes a 760 x 66 tag (the widest the
// tag draws, so a shorter one fits too) and for the lowest band 110 tall,
// at most 96px up from the bottom, with a clear run through the middle of
// the game area.
import { GAME_WINDOWS } from './gamewindow.js';
import { SPONSOR_DOCKS, SPONSOR_HOSTS, sponsorDock } from './sponsor.js';

// The corner tag's top right corner on each overlay: its right edge and top.
export const TAG_ANCHORS = {
  igorows: { right: 1896, top: 91 },     // under the top bar
  igoportrait: { right: 1359, top: 80 }, // in the portrait camera, under its top bar
  igodual: { right: 1554, top: 66 },     // between the columns, under the pip track
  igobars: { right: 1896, top: 161 },    // under the top bar's player cluster
  igo2v2: { right: 1490, top: 30 },      // left of the sidebar
  igo1v1: { right: 1608, top: 27 },      // left of the sidebar
  pov: { right: 1896, top: 24 },         // the corner: the POV columns sit lower
  arenabug: { right: 1896, top: 24 },    // the corner: the bug sits at the bottom
};
export const TAG_FRAME = { right: 1860, top: 48 };

// The lower third's run on each overlay (the span the bar centres in and
// may not outgrow) and the bar's bottom edge.
export const LT_ANCHORS = {
  igorows: { left: 346, right: 1896, bottom: 981 },   // right of the column, over the bottom bar
  igoportrait: { left: 561, right: 1359, bottom: 984 }, // between the pillars
  igodual: { left: 366, right: 1554, bottom: 984 },   // between the columns
  igobars: { left: 24, right: 1896, bottom: 893 },    // over the bottom cluster and its score badge
  igo2v2: { left: 24, right: 1490, bottom: 984 },     // left of the sidebar
  igo1v1: { left: 24, right: 1612, bottom: 984 },     // left of the sidebar
  pov: { left: 297, right: 1623, bottom: 984 },       // between the POV columns
  arenabug: { left: 24, right: 1896, bottom: 844 },   // over the arena bug
};
export const LT_FRAME = { left: 24, right: 1896, bottom: 984 };

// The interview bar hangs from the left of its run, but never nearer the
// frame edge than the frame lower third's own 80px.
export const LT_SAFE_LEFT = 80;
// A bar is never shrunk below half its size, however narrow the room.
export const LT_MIN_SCALE = 0.5;
// The tag's widest (its max-width) and tallest (two lines), and the lower
// third's tallest bar: what the spots above were searched with.
export const TAG_MAX_W = 760;
export const TAG_H = 66;
export const LT_H = 110;

// The game area each overlay leaves, which the tag and the bar come in
// under: they slide in from outside it, so what would cross the overlay's
// chrome on the way is cut at its edge. The arena bug leaves everything
// above its top edge.
export const ANCHOR_WINDOWS = { ...GAME_WINDOWS, arenabug: { x: 0, y: 0, w: 1920, h: 860 } };

const GAP = 12;          // between the tag or the bar and the sponsor plate
const SPONSOR_TAG = 24;  // the plate's own tag strip ("Presented by"), toward the frame centre

// Which overlay a graphic anchors to in this bank: the first one up, in the
// sponsor plate's order (the layouts that own the frame first, the small
// arena bug last), or '' for none.
export function anchorHost(bank) {
  const scenes = (bank && bank.scenes) || {};
  return SPONSOR_HOSTS.find((key) => scenes[key] && scenes[key].visible) || '';
}

// The overlay's name for the panel ("the rows overlay").
export const anchorLabel = (host) => (SPONSOR_DOCKS[host] ? SPONSOR_DOCKS[host].label : '');

// The sponsor plate's footprint in this bank while it is on (its tag strip
// included), or null. On means switched on with a sponsor to show; the
// plate's every-M-minutes window is left out, so nothing moves each time
// the plate comes and goes.
export function sponsorBox(bank) {
  const cfg = bank && bank.scenes && bank.scenes.sponsor;
  if (!cfg || !cfg.visible || !Array.isArray(cfg.items) || !cfg.items.length) return null;
  const { x, y, w, h } = sponsorDock(bank);
  if (!cfg.label) return { x, y, w, h };
  return y + h / 2 > 540
    ? { x, y: y - SPONSOR_TAG, w, h: h + SPONSOR_TAG }
    : { x, y, w, h: h + SPONSOR_TAG };
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, win) => a.x >= win.x && a.y >= win.y && a.x + a.w <= win.x + win.w && a.y + a.h <= win.y + win.h;

// The window a graphic at `box` comes in under on `host`, or null (no
// overlay, or the graphic sits outside the overlay's game area, like the
// tag in the POV overlay's free top right corner).
function clipFor(host, box) {
  const win = host ? ANCHOR_WINDOWS[host] : null;
  return win && inside(box, win) ? win : null;
}

const anchored = (bank, scene) => {
  const cfg = (bank && bank.scenes && bank.scenes[scene]) || {};
  return cfg.dock !== false ? anchorHost(bank) : '';
};

// Where the corner tag sits, for a tag `w` x `h` design pixels (the widest
// and tallest it draws when not given): { host, right, top, clip }. host is
// the overlay it anchors to ('' = the frame).
export function tagPlace(bank, { w = TAG_MAX_W, h = TAG_H } = {}) {
  const host = anchored(bank, 'cornertag');
  const { right, top: at } = host ? TAG_ANCHORS[host] : TAG_FRAME;
  let top = at;
  const sp = sponsorBox(bank);
  if (sp && overlaps({ x: right - w, y: top, w, h }, sp)) top = sp.y + sp.h + GAP;
  return { host, right, top, clip: clipFor(host, { x: right - w, y: top, w, h }) };
}

// Where the lower third's bar sits, for a bar `w` x `h` design pixels at
// its own size: { host, x, bottom, scale, clip }. A centred bar (casters,
// coming up, custom) has x at its centre; align 'left' (the interview) puts
// x at its left edge. scale shrinks a bar wider than its run, around its
// bottom centre (bottom left for the interview).
export function lowerThirdPlace(bank, { w = 0, h = LT_H, align = 'center' } = {}) {
  const host = anchored(bank, 'lowerthird');
  const run = host ? LT_ANCHORS[host] : LT_FRAME;
  const left = align === 'left' ? Math.max(run.left, LT_SAFE_LEFT) : run.left;
  const room = run.right - left;
  const scale = w > room ? Math.max(LT_MIN_SCALE, room / w) : 1;
  const x = align === 'left' ? left : (run.left + run.right) / 2;
  const bw = w * scale;
  const bh = h * scale;
  const boxAt = (bottom) => ({ x: align === 'left' ? x : x - bw / 2, y: bottom - bh, w: bw, h: bh });
  let bottom = run.bottom;
  const sp = sponsorBox(bank);
  if (sp && overlaps(boxAt(bottom), sp)) bottom = sp.y - GAP;
  return { host, x, bottom, scale, clip: clipFor(host, boxAt(bottom)) };
}

// A graphic's clip for the stage root: an inset() in design units, or ''
// for none.
export function clipInset(win) {
  if (!win) return '';
  return `inset(calc(${win.y} * var(--u)) calc(${1920 - win.x - win.w} * var(--u)) calc(${1080 - win.y - win.h} * var(--u)) calc(${win.x} * var(--u)))`;
}
