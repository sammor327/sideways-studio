import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';

const $ = (id) => document.getElementById(id);
const pov = $('pov');
const inOut = new SeekClock(pov, '--t', 500);

// Design-space text metrics. The PSD draws all four name lines at 16px and
// the score at 32.06px inside a 255px frame whose usable run is 200px; Sam
// locked PSD-true sizes (Loop 5), so long names shrink to a floor of 11px
// and then take an ellipsis rather than overflowing the gold frame.
const BASE_SIZE = 16;
const MIN_SIZE = 11;
const BUDGET = 200;

// Measuring with canvas instead of layout keeps the fit off the reflow path
// and works the same in an occluded browser source, where nothing paints.
const gauge = document.createElement('canvas').getContext('2d');
// Bumped when the bundled face finishes loading: everything measured against
// the fallback metrics has to be measured again.
let fitGen = 0;

function measure(family, size, text) {
  gauge.font = `700 ${size}px ${family}`;
  return gauge.measureText(text).width;
}

// Set a line's text at the largest size that fits, ellipsising at the floor.
// The design is all caps, so the caps form is what gets written AND what gets
// measured: measuring the mixed-case name against a CSS text-transform is how
// a long legend name silently overflows the gold frame.
// Never throws: a measurement failure renders the plain name at PSD size.
function fitLine(el, rawText) {
  const key = `${rawText}|${fitGen}`;
  if (el.dataset.fit === key) return false;
  el.dataset.fit = key;
  // Kept so a late font load can re-fit from the original, not from the
  // ellipsised string this may already have rendered.
  el.dataset.raw = rawText;
  const text = rawText.toUpperCase();
  let size = BASE_SIZE;
  let out = text;
  try {
    const family = getComputedStyle(el).fontFamily;
    let width = measure(family, size, text);
    // Scaling down is only APPROXIMATELY linear: a fallback face rounds each
    // glyph advance, which on a 31-character CJK name left the first estimate
    // 4% wide. Converge instead of trusting one division.
    for (let i = 0; i < 6 && width > BUDGET && size > MIN_SIZE; i += 1) {
      size = Math.max(MIN_SIZE, (size * BUDGET) / width);
      width = measure(family, size, text);
    }
    if (width > BUDGET) {
      // At the floor and still too wide: trim to the longest run that fits.
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (measure(family, size, `${text.slice(0, mid)}…`) <= BUDGET) lo = mid;
        else hi = mid - 1;
      }
      out = `${text.slice(0, lo).trimEnd()}…`;
    }
  } catch {
    size = BASE_SIZE;
    out = text;
  }
  el.style.setProperty('--fs', size.toFixed(2));
  return setText(el, out);
}

// Image fallback chain (broadcast-line-handoff §3.7). Steps are tried in
// order; running out hides the image, which always leaves something rendered
// underneath (the slot's navy fill, or bare frame for the card slot).
// Never a broken img glyph on program output.
function chainLoad(img, steps, onShow) {
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

const shown = { card: {}, legend: {}, battlefield: {} };

// Featured card: full art, then the prefetched thumb, then nothing at all.
// An empty slot is the bare gold frame, never a placeholder box.
function loadCard(p, side) {
  const id = side.card?.cardId || '';
  if (shown.card[p] === id) return;
  shown.card[p] = id;
  const img = $(`${p}cardImg`);
  if (!id) {
    img.onerror = null;
    img.onload = null;
    img.className = 'art hidden';
    img.removeAttribute('src');
    return;
  }
  chainLoad(img, [
    { src: `/cardart/full/${id}.webp` },
    { src: `/cardart/thumb/${id}.webp` },
  ]);
}

// Legend strip: the legend card's own artwork, cropped inside the card frame
// so no border, badge or name bar reaches the strip (Sam, Loop 5), then the
// IGO hero cutout, then the Rift Registry icon cutout, then the navy fill the
// slot already carries. Vendetta legends that the RR index has not picked up
// yet have no cardId and start at the hero tier.
function loadLegend(p, side) {
  const key = `${side.legendCardId || ''}|${side.legendSlug || ''}`;
  if (shown.legend[p] === key) return;
  shown.legend[p] = key;
  const img = $(`${p}legendImg`);
  const steps = [];
  if (side.legendCardId) steps.push({ src: `/cardart/full/${side.legendCardId}.webp`, cls: 'crop-legend' });
  if (side.legendSlug) {
    steps.push({ src: `/legendart/hero/${side.legendSlug}.png`, cls: 'fit-contain' });
    steps.push({ src: `/legendart/icon/${side.legendSlug}.webp`, cls: 'fit-contain' });
  }
  chainLoad(img, steps);
}

// Battlefield strip: full art, then the thumb, cropped to the painting alone.
// Battlefield art is stored portrait, so both the rotation and the crop come
// from the loaded file's own dimensions, never a per-card flag.
function loadBattlefield(p, side) {
  const id = side.battlefieldCardId || '';
  if (shown.battlefield[p] === id) return;
  shown.battlefield[p] = id;
  const img = $(`${p}bfImg`);
  const steps = id ? [
    { src: `/cardart/full/${id}.webp` },
    { src: `/cardart/thumb/${id}.webp` },
  ] : [];
  chainLoad(img, steps, (el) => {
    el.classList.toggle('crop-battlefield', el.naturalHeight > el.naturalWidth);
  });
}

function renderSide(p, side, animate) {
  fitLine($(`${p}player`), side.name || '');
  fitLine($(`${p}legend`), side.legend || '');
  fitLine($(`${p}champion`), side.champion || '');
  fitLine($(`${p}battlefield`), side.battlefield || '');

  const digit = $(`${p}score`).querySelector('.digit');
  if (setText(digit, side.score) && animate) bump(digit, '--bump');

  loadCard(p, side);
  loadLegend(p, side);
  loadBattlefield(p, side);
}

let visibleNow = null;

const params = initStage({
  scene: 'pov',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.pov;

    renderSide('l', m.left, !first);
    renderSide('r', m.right, !first);
    $('lside').classList.toggle('gone', !scene.showLeft);
    $('rside').classList.toggle('gone', !scene.showRight);

    const visible = scene.visible;
    $('hiddenHint').classList.toggle('on',
      !params.transparent && !params.preview && !visible);
    if (visible === visibleNow) return;
    visibleNow = visible;
    if (first) {
      // Fresh loads, including an OBS "shutdown source when hidden" reload,
      // snap to the current state instead of replaying the entrance.
      pov.classList.toggle('off', !visible);
      inOut.seek(visible ? 1 : 0);
    } else if (visible) {
      pov.classList.remove('off');
      inOut.play({ from: 0, to: 1 });
    } else {
      inOut.play({ from: 1, to: 0 }).then(() => {
        if (!visibleNow) pov.classList.add('off');
      });
    }
  },
});

// Every fit is measured against whatever face is resolved at the time, so the
// bundled Beaufort arriving late has to invalidate all of them. document.fonts
// .ready alone is not enough: it is a one-shot that can resolve before the
// face has even been requested, which leaves long names sized for the fallback
// metrics and overflowing the frame. Ask for the face itself, and keep .ready
// as a second chance.
function refitLines() {
  fitGen += 1;
  for (const el of document.querySelectorAll('.line:not(.score)')) {
    if (el.dataset.raw !== undefined) fitLine(el, el.dataset.raw);
  }
}
if (document.fonts && document.fonts.load) {
  document.fonts.load(`700 ${BASE_SIZE}px "Beaufort for LOL"`)
    .catch(() => { /* face missing: the theme fallback still measures fine */ })
    .then(refitLines);
  document.fonts.ready.then(refitLines);
}

// ?debug=psd lays the PSD composite over the scene at half opacity so text
// baselines and slot edges can be checked against the designer file. The
// reference is a development asset and is not shipped: a missing file just
// removes the overlay.
if (new URLSearchParams(location.search).get('debug') === 'psd') {
  const ref = $('psdRef');
  ref.onerror = () => ref.remove();
  ref.onload = () => ref.classList.add('on');
  ref.src = './_psd-reference.png';
}

// Nothing on air before the first state is normal; only surface a diagnostic
// if the server still has not answered after a few seconds.
setTimeout(() => {
  if (visibleNow === null) $('diag').classList.add('on');
}, 4000);
