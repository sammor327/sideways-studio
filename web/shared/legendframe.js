// Legend framing: where each legend's full-figure cutout sits in the large
// placements.
//
// The full tier (scripts/bake-legend-full.py) trims each cutout to the figure,
// so the files have nothing in common but their subject: 49 legends spanning
// 0.432 (Annie, 639x1480) to 1.266 (Darius, 1367x1080). One CSS rule cannot
// frame that spread against a fixed slot, so each legend carries its own
// framing, tuned in the legend framer (/legendframe/).
//
// The model, in the slot's own coordinates:
//   the image is CONTAINed and stood on the slot's bottom edge, then
//   transformed about its feet:  translate(x%, y%) scale(scale)
// x and y are percentages of the SLOT, not of the figure, so a nudge means the
// same thing whatever the legend's shape, and x is always screen direction:
// positive moves right, in every placement. Scale grows the figure upward from
// the feet, the way a person gets taller.
//
// Untuned legends fall back to autoScale() below rather than to a flat 1, so a
// legend that has never been through the framer still stands full height in
// its slot instead of floating small at the bottom.
//
// A GRAPHIC is a whole 1920x1080 frame; a PLACEMENT is one slot on it that
// draws a legend. Both carry the geometry the framer needs to draw the real
// thing, so a window for another graphic is an entry here rather than new
// markup and new stylesheet rules.
//
// Plain ESM with no browser or Node dependencies: the scenes import it, the
// framer imports it, and the server imports it to validate what the framer
// saves (the same arrangement as web/shared/look.js).

const INK = '#0a0d12';

// The graphics a legend's full art appears on. Each is a whole 1920x1080
// frame, so the framer can draw the real thing: the legend slots live, and
// everything that sits over or beside them outlined in place. `furniture` is
// in FRAME pixels, straight off the scene's stylesheet.
export const GRAPHICS = {
  headtohead: {
    label: 'Match card',
    note: 'Opens a feature match. Two player sides with a centre column between them.',
    furniture: [
      { x: 760, y: 0, w: 400, h: 1080, kind: 'plate', label: 'Centre column', note: 'VS, the round and best-of, the points to win, and the status line. Solid ground: nothing of either legend shows through it.' },
      { x: 80, y: 400, w: 150, h: 210, kind: 'card', label: 'Legend card (left)', note: "The left player's legend card." },
      { x: 242, y: 400, w: 150, h: 210, kind: 'card', label: 'Champion card (left)', note: 'Hidden when that side has no champion card, so do not count on it to cover anything.' },
      { x: 80, y: 760, w: 620, h: 200, kind: 'plate', label: 'Name and legend (left)', note: 'The player name at 110px over the legend name and its runes. The biggest thing on the side: keep the head well above it.' },
      { x: 1528, y: 400, w: 150, h: 210, kind: 'card', label: 'Legend card (right)', note: "The right player's legend card." },
      { x: 1690, y: 400, w: 150, h: 210, kind: 'card', label: 'Champion card (right)', note: 'Hidden when that side has no champion card.' },
      { x: 1220, y: 760, w: 620, h: 200, kind: 'plate', label: 'Name and legend (right)', note: 'Right aligned on this side.' },
    ],
  },

  profile: {
    label: 'Player profile',
    note: 'One player before a top cut match, with their camera live in the corner.',
    furniture: [
      { x: 80, y: 90, w: 820, h: 810, kind: 'plate', label: 'Player card', note: 'Name, legend and runes, seed, four stat tiles and the top finishes. It overlaps the art column by 80px.' },
      { x: 1420, y: 690, w: 420, h: 300, kind: 'camera', label: 'Camera window', note: "Cut clean through to the player's camera feed while the camera switch is on: whatever of the legend is here is not on screen at all." },
    ],
  },
};

// One slot that draws a legend's full art, placed in its graphic's frame.
// Adding a slot on another graphic is one entry here plus that scene calling
// fullTierFramer with the key: the framer builds its window from this.
export const PLACEMENTS = {
  headtoheadLeft: {
    graphic: 'headtohead',
    label: 'Match card, left',
    short: 'Left',
    w: 760,
    h: 1080,
    frameX: 0,
    frameY: 0,
    where: 'The left player on the feature match card.',
    scrim: `linear-gradient(90deg, transparent, ${INK}) right / 220px 100% no-repeat,`
      + ` linear-gradient(180deg, rgba(10, 13, 18, 0.15), ${INK} 78%)`,
    scrimNote: 'Fades into the ground from about two thirds down, and into the centre column along its inner (right) edge.',
  },

  headtoheadRight: {
    graphic: 'headtohead',
    label: 'Match card, right',
    short: 'Right',
    w: 760,
    h: 1080,
    frameX: 1160,
    frameY: 0,
    where: 'The right player on the same card, framed on its own so the two sides do not have to agree.',
    scrim: `linear-gradient(270deg, transparent, ${INK}) left / 220px 100% no-repeat,`
      + ` linear-gradient(180deg, rgba(10, 13, 18, 0.15), ${INK} 78%)`,
    scrimNote: 'The same fades mirrored: the inner edge that goes dark is the LEFT one here.',
  },

  profile: {
    graphic: 'profile',
    label: 'Profile art column',
    short: 'Art column',
    w: 1100,
    h: 1080,
    frameX: 820,
    frameY: 0,
    where: 'The art column down the right of the player profile.',
    scrim: `linear-gradient(90deg, ${INK} 0%, rgba(10, 13, 18, 0.55) 40%, rgba(10, 13, 18, 0.15) 100%),`
      + ` linear-gradient(180deg, transparent 60%, ${INK})`,
    scrimNote: 'Washed to ink across its whole left half, under the player card, and faded out along the bottom. Only the right of it really reads, so most legends want pushing right.',
  },
};

export const GRAPHIC_KEYS = Object.keys(GRAPHICS);
export const placementsOf = (graphic) =>
  Object.keys(PLACEMENTS).filter((k) => PLACEMENTS[k].graphic === graphic);

export const PLACEMENT_KEYS = Object.keys(PLACEMENTS);

// Limits. Scale is capped where a 1100px-wide source starts to soften; the
// offsets are capped at a slot and a half, past which the figure has left.
export const SCALE_MIN = 0.4;
export const SCALE_MAX = 3;
export const OFFSET_MAX = 150;

export const DEFAULT_FRAME = { scale: 1, x: 0, y: 0 };

const clamp = (n, lo, hi) => (n < lo ? lo : (n > hi ? hi : n));
const round2 = (n) => Math.round(n * 100) / 100;

// One frame, sanitized. Anything unreadable falls back to the default rather
// than reaching a scene: a legend that airs mis-framed is a worse failure than
// one that airs untuned.
export function cleanFrame(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
  return {
    scale: round2(clamp(num(f.scale, DEFAULT_FRAME.scale), SCALE_MIN, SCALE_MAX)),
    x: round2(clamp(num(f.x, DEFAULT_FRAME.x), -OFFSET_MAX, OFFSET_MAX)),
    y: round2(clamp(num(f.y, DEFAULT_FRAME.y), -OFFSET_MAX, OFFSET_MAX)),
  };
}

export const sameFrame = (a, b) => a.scale === b.scale && a.x === b.x && a.y === b.y;

export const isDefaultFrame = (f) => sameFrame(f, DEFAULT_FRAME);

// The match card was one placement until 0.55.0, with the right side mirroring
// the left through CSS. A table written before that keeps working: its one
// headtohead override becomes both sides, the right one mirrored the way the
// stylesheet used to do it.
function migratePer(per) {
  if (!per || !per.headtohead) return per;
  const old = per.headtohead;
  const out = { ...per };
  delete out.headtohead;
  if (!out.headtoheadLeft) out.headtoheadLeft = old;
  if (!out.headtoheadRight) out.headtoheadRight = { ...old, x: -old.x };
  return out;
}

// One legend's entry: a base frame every placement uses, plus per-placement
// overrides for the placements that want their own. Most legends only ever
// need the base, which is what makes the framer quick.
export function cleanEntry(raw) {
  const e = raw && typeof raw === 'object' ? raw : {};
  const entry = { base: cleanFrame(e.base) };
  const per = migratePer(e.per && typeof e.per === 'object' ? e.per : null) || {};
  for (const key of PLACEMENT_KEYS) {
    if (per[key]) entry.per = { ...entry.per, [key]: cleanFrame(per[key]) };
  }
  return entry;
}

// The whole table, sanitized. Keys are legend slugs (server/legends.js's
// slugify), so an entry for a legend this build has never heard of is kept
// rather than dropped: art arrives before the card index does.
export function cleanFrames(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const slug of Object.keys(src).sort()) {
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) continue;
    out[slug] = cleanEntry(src[slug]);
  }
  return out;
}

// What a slot should use for a legend: its own override, else its base, else
// nothing (the caller autoscales).
export function frameFor(frames, slug, placement) {
  const entry = frames && slug ? frames[slug] : null;
  if (!entry) return null;
  if (entry.per && entry.per[placement]) return entry.per[placement];
  return entry.base;
}

// The scale that stands a figure exactly full height in its slot: 1 for a
// figure taller than the slot (CONTAIN already fits it by height), and the
// aspect ratio between them for a wider one, which crops its sides the way a
// broadcast frames a person rather than a poster.
export function autoScale(imgW, imgH, slotW, slotH) {
  if (!(imgW > 0 && imgH > 0 && slotW > 0 && slotH > 0)) return 1;
  const r = imgW / imgH;
  const R = slotW / slotH;
  return round2(Math.max(1, r / R));
}

// Put a frame on an element as the custom properties its CSS reads. Called
// with no frame it clears them, so the element falls back to the stylesheet's
// own defaults instead of keeping the last legend's numbers.
export function applyFrame(el, frame) {
  if (!el) return;
  if (!frame) {
    el.style.removeProperty('--lf-scale');
    el.style.removeProperty('--lf-x');
    el.style.removeProperty('--lf-y');
    return;
  }
  el.style.setProperty('--lf-scale', String(frame.scale));
  el.style.setProperty('--lf-x', String(frame.x));
  el.style.setProperty('--lf-y', String(frame.y));
}

// The baked table: the framing that ships with the app. The framer's Lock in
// writes it here when the app runs from source, and into the data folder's
// legend-frames.json otherwise, which the server layers on top of this when it
// serves this module. Everything below the marker is generated, so edit it
// there rather than by hand.
// FRAMES-START
export const FRAMES = {};
// FRAMES-END
