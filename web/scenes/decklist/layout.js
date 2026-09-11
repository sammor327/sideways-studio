// Decklist plate geometry and build-in timing, as pure numbers so the scene
// and the unit tests share one source. Every constant is a 1920x1080 design
// pixel from FlipDeck's src/remotion/decks/Plate.tsx (the reference render),
// multiplied by --u in CSS so the plate scales with the browser source.

export const PLATE_W = 1920;
export const PLATE_H = 1080;
// Riftbound card scans are 744x1039 portrait.
export const CARD_RATIO = 744 / 1039;

export const MARGIN = 32;
export const TOP = 40;
export const STRIP_TOP = 892;
export const STRIP_H = PLATE_H - STRIP_TOP - MARGIN; // 156

export const LEGEND_W = 600;
export const LEGEND_RADIUS = 28;
export const GRID_X = 655;
export const GRID_W = PLATE_W - GRID_X - MARGIN; // 1233
export const GRID_GAP = 14;
export const GRID_RADIUS = 12;

export const CHAMPION_W = 104;
export const SLOT_W = 92;
export const SLOT_GAP = 8;
export const SLOT_QTY = 30;
export const SMALL_RADIUS = 8;
export const PILL_W = 330;

// Six columns is the designed look (up to 18 distinct names in three rows); a
// longer deck adds columns and shrinks the cards rather than clipping.
export const gridColumns = (distinct) => Math.max(6, Math.ceil(distinct / 3));

// The designed ten-slot rack, or more when a sideboard needs them.
export const sideboardSlots = (distinct) => Math.max(10, distinct);

export function gridMetrics(distinct) {
  const cols = gridColumns(distinct);
  const cardW = (GRID_W - (cols - 1) * GRID_GAP) / cols;
  return { cols, cardW, cardH: cardW / CARD_RATIO, qtySize: Math.round(cardW * 0.4) };
}

// A missing-art panel keeps the card's shape and says what should be there.
export const missFontSize = (cardW) => Math.max(16, cardW * 0.11);

// --- build-in (live swaps only) ---
//
// 90 frames at 30fps in the reference. Delays are in FRAMES so they read
// against the brief; the scene converts to seconds and runs them on a
// wall-clock seek clock (never rAF: occluded browser sources starve it).
export const INTRO_FPS = 30;

export function introDelays(mainCount, runeCount) {
  // The strip enters after the last grid card starts.
  const strip = 12 + mainCount * 2 + 4;
  return {
    legend: 0,
    cards: Array.from({ length: mainCount }, (_, i) => 12 + i * 2),
    strip,
    runes: Array.from({ length: runeCount }, (_, i) => strip + 10 + i * 4),
  };
}

// Remotion's spring({ damping: 200 }) with its default mass 1 and stiffness
// 100. Remotion takes the critically damped branch for any damping ratio of 1
// or more, so the curve is the closed form 1 - e^(-w t)(1 + w t) with w = 10.
// No overshoot, and it never exactly reaches 1, which is why the scene
// removes the animated properties at the end instead of waiting for s === 1.
export function springAt(seconds) {
  if (seconds <= 0) return 0;
  return 1 - Math.exp(-10 * seconds) * (1 + 10 * seconds);
}

// How long the build-in runs: the latest-starting element plus the time the
// spring needs to land within 0.05% of rest. Computed rather than fixed at 90
// frames, because a long list pushes the runes past frame 90 and a fixed
// window would freeze them part-faded.
export const SETTLE_SECONDS = 1;
export function introSeconds(mainCount, runeCount) {
  const d = introDelays(mainCount, runeCount);
  const last = Math.max(d.legend, d.strip, ...d.cards, ...d.runes);
  return last / INTRO_FPS + SETTLE_SECONDS;
}

// File-name stem for a deck: the legend's given name, the way the plates are
// known ("Viktor, Herald of the Arcane" -> "viktor").
export function legendSlug(legendName) {
  const given = String(legendName || '').split(',')[0];
  return given.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'decklist';
}
