// Image loading shared by the overlays: fallback chains and art crops.
// (broadcast-line-handoff §3.7: every image slot gets a fallback chain and
// never shows a broken img glyph on program output.)

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

// Clear a slot: no handlers left to fire late, no src, hidden.
export function clearArt(img) {
  img.onerror = null;
  img.onload = null;
  img.className = 'art hidden';
  img.removeAttribute('src');
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

// A holder window in legend mode: the hero cutout fills it, the icon cutout
// is centered on the fill, and with no legend the fill stands alone.
export function heroSteps(side) {
  return side.legendSlug ? [
    { src: `/legendart/hero/${side.legendSlug}.png` },
    { src: `/legendart/icon/${side.legendSlug}.webp`, cls: 'icon-tier' },
  ] : [];
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
