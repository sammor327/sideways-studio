// Legend framing: where each legend's full-figure cutout sits in the large
// placements.
//
// The full tier (scripts/bake-legend-full.py) trims each cutout to the figure,
// so the files have nothing in common but their subject: 49 legends spanning
// 0.432 (Annie, 639x1480) to 1.266 (Darius, 1367x1080). One CSS rule cannot
// frame that spread against a fixed slot, so each legend carries its own
// framing, tuned once in the legend framer (/legendframe/) and baked into the
// FRAMES table below.
//
// The model, in the slot's own coordinates:
//   the image is CONTAINed and stood on the slot's bottom edge, then
//   transformed about its feet:  translate(x%, y%) scale(scale)
// x and y are percentages of the SLOT, not of the figure, so a nudge means the
// same thing whatever the legend's shape. Scale grows the figure upward from
// the feet, the way a person gets taller.
//
// Untuned legends fall back to autoScale() below rather than to a flat 1, so a
// legend that has never been through the framer still stands full height in
// its slot instead of floating small at the bottom.
//
// Plain ESM with no browser or Node dependencies: the scenes import it, the
// framer imports it, and the server imports it to validate what the framer
// saves (the same arrangement as web/shared/look.js).

// The full-tier placements, in design pixels. A placement's aspect is what
// decides the autoscale, so the numbers here must track the scenes' CSS.
export const PLACEMENTS = {
  headtohead: { label: 'Match card side', w: 760, h: 1080 },
  profile: { label: 'Profile art column', w: 1100, h: 1080 },
};

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

// One legend's entry: a base frame both placements use, plus per-placement
// overrides for the legends whose two slots genuinely want different framing.
// Most legends only ever need the base, which is what makes the framer quick.
export function cleanEntry(raw) {
  const e = raw && typeof raw === 'object' ? raw : {};
  const entry = { base: cleanFrame(e.base) };
  const per = e.per && typeof e.per === 'object' ? e.per : {};
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

// The baked table. Written by the legend framer's Lock in
// (POST /api/legendframes); everything below the marker is generated, so edit
// it there rather than by hand.
// FRAMES-START
export const FRAMES = {};
// FRAMES-END
