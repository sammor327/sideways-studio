// Image loading shared by the overlays: fallback chains and art crops.
// (broadcast-line-handoff §3.7: every image slot gets a fallback chain and
// never shows a broken img glyph on program output.)
import { DEFAULT_FRAME, FRAMES, PLACEMENTS, applyFrame, autoScale, frameFor } from '../shared/legendframe.js';

// Try each step's src in order; on the first that loads, show the image with
// that step's class. Running out hides the image, leaving whatever the slot
// paints underneath.
export function chainLoad(img, steps, onShow) {
  let i = 0;
  const next = () => {
    if (i >= steps.length) {
      img.className = 'art hidden';
      img.removeAttribute('src');
      return;
    }
    const step = steps[i];
    i += 1;
    img.className = `art hidden ${step.cls || ''}`.trim();
    img.src = step.src;
  };
  img.onerror = next;
  img.onload = () => {
    img.classList.remove('hidden');
    if (onShow) onShow(img);
  };
  next();
}

// Clear a slot: no handlers left to fire late, no src, hidden, and no framing
// left over to move the next legend that lands here.
export function clearArt(img) {
  img.onerror = null;
  img.onload = null;
  img.className = 'art hidden';
  img.removeAttribute('src');
  applyFrame(img, null);
}

// The featured card: full art, then the prefetched thumb.
export function cardSteps(cardId) {
  return cardId ? [
    { src: `/cardart/full/${cardId}.webp` },
    { src: `/cardart/thumb/${cardId}.webp` },
  ] : [];
}

// A legend strip: the legend card's own painting (cropped by the scene's CSS
// via the crop class), then the hero cutout, then the icon cutout.
export function legendSteps(side) {
  const steps = [];
  if (side.legendCardId) steps.push({ src: `/cardart/full/${side.legendCardId}.webp`, cls: 'crop-legend' });
  if (side.legendSlug) {
    steps.push({ src: `/legendart/hero/${side.legendSlug}.png`, cls: 'fit-contain' });
    steps.push({ src: `/legendart/icon/${side.legendSlug}.webp`, cls: 'fit-contain' });
  }
  return steps;
}

// A legend portrait in a small slot beside a player's name (the standings
// and the pairings, 2026-09-19): the face crop the holder windows use, then
// the legend card's painting, then the icon cutout on the slot's fill.
export function portraitSteps(side) {
  const steps = [];
  if (side.legendSlug) steps.push({ src: `/legendart/hero/${side.legendSlug}.png` });
  if (side.legendCardId) {
    steps.push({ src: `/cardart/full/${side.legendCardId}.webp`, cls: 'crop-legend' });
    steps.push({ src: `/cardart/thumb/${side.legendCardId}.webp`, cls: 'crop-legend' });
  }
  if (side.legendSlug) steps.push({ src: `/legendart/icon/${side.legendSlug}.webp`, cls: 'icon-tier' });
  return steps;
}

// A holder window in legend mode: the hero cutout fills it, the icon cutout
// is centered on the fill, and with no legend the fill stands alone.
export function heroSteps(side) {
  return side.legendSlug ? [
    { src: `/legendart/hero/${side.legendSlug}.png` },
    { src: `/legendart/icon/${side.legendSlug}.webp`, cls: 'icon-tier' },
  ] : [];
}

// A large legend placement (the match card's sides, the profile's art
// column): the whole figure, transparent and sharp at a thousand pixels, then
// the hero crop and the icon as above for a legend with no full art yet.
export function fullSteps(side) {
  return side.legendSlug ? [
    { src: `/legendart/full/${side.legendSlug}.webp`, cls: 'full-tier' },
    ...heroSteps(side),
  ] : [];
}

// Which tier a slot ended up showing, on the slot itself, so its CSS can
// drop the backing fill behind a transparent figure.
export function markTier(img) {
  const tier = img.classList.contains('full-tier') ? 'full' : (img.classList.contains('icon-tier') ? 'icon' : 'hero');
  if (img.parentElement) img.parentElement.dataset.tier = tier;
}

// The onShow for a large legend placement: mark the tier, and when the full
// cutout is what loaded, put that legend's framing on it (web/shared/
// legendframe.js). A legend nobody has framed yet gets the scale that stands
// it full height in the slot, so it reads as a decision rather than as art
// that missed. The other tiers carry no framing: the hero crop and the icon
// are already sized for their slot by the scene's own CSS.
export function fullTierFramer(slug, placement) {
  return (img) => {
    markTier(img);
    if (!img.classList.contains('full-tier')) { applyFrame(img, null); return; }
    const slot = PLACEMENTS[placement];
    const tuned = frameFor(FRAMES, slug, placement);
    applyFrame(img, tuned || {
      ...DEFAULT_FRAME,
      scale: autoScale(img.naturalWidth, img.naturalHeight, slot.w, slot.h),
    });
  };
}

// A battlefield strip: full art, then the thumb. Battlefield art is stored
// portrait, so the crop-and-rotate is decided by the loaded file's own
// dimensions, never a per-card flag.
export function battlefieldSteps(cardId) {
  return cardSteps(cardId);
}

export function rotateIfPortrait(img) {
  img.classList.toggle('crop-battlefield', img.naturalHeight > img.naturalWidth);
}
