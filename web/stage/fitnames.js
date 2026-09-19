// No name is ever shortened with an ellipsis (Sam, 2026-09-18: "the name
// font just needs to be made smaller so we can fit the entire name no
// matter what"). Any single-line text box on a graphic (white-space nowrap,
// overflow clipped) whose text is wider than the box gets its font size
// scaled down until the whole text fits, measured by the browser (the
// box's scrollWidth against its clientWidth) rather than guessed from a
// character count. The designed size is the ceiling: a name that fits keeps
// it, and a shorter name later goes back up to it. A box that type alone
// cannot fit (cards or images overflowing it) is left as it was.
//
// Scenes need nothing: initStage installs it, and it reruns after every
// state, when a face finishes loading, when the DOM changes (async deck
// renders, art landing) and on resize. Ticking clocks are ignored.

const FLOOR = 0.2;       // never below a fifth of the designed size
const SHRINK = 0.985;    // a hair under the exact ratio, so rounding never leaves an ellipsis

const uPx = () => Math.min(innerWidth / 1920, innerHeight / 1080) || 1;

function candidates() {
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.dataset.fit === 'off' || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.overflowX === 'visible') continue;
    if (cs.whiteSpace !== 'nowrap' && cs.whiteSpace !== 'pre') continue;
    out.push(el);
  }
  return out;
}

function fitOne(el) {
  // Start from the designed size (or the scene's own inline size), undoing
  // only a size this module set.
  if (el.dataset.fitSize !== undefined) {
    if (el.style.fontSize === el.dataset.fitSize) el.style.fontSize = el.dataset.fitBase || '';
    delete el.dataset.fitSize;
    delete el.dataset.fitBase;
  }
  const box = el.clientWidth;
  if (!box || el.scrollWidth <= box) return;
  const base = parseFloat(getComputedStyle(el).fontSize);
  if (!base) return;
  const own = el.style.fontSize;
  const u = uPx();
  let px = base;
  for (let i = 0; i < 8 && el.scrollWidth > box && px > base * FLOOR; i += 1) {
    px = Math.max(base * FLOOR, px * (box / el.scrollWidth) * SHRINK);
    el.style.fontSize = `calc(${(px / u).toFixed(3)} * var(--u))`;
  }
  if (el.scrollWidth > box) {
    el.style.fontSize = own;
    return;
  }
  el.dataset.fitBase = own;
  el.dataset.fitSize = el.style.fontSize;
}

export function fitNames() {
  try {
    for (const el of candidates()) fitOne(el);
  } catch { /* a fit is a nicety; never break a graphic over it */ }
}

// One pass shortly after a burst of changes. A timer, not rAF: occluded
// browser sources freeze rAF.
let pending = null;
export function scheduleNameFit(ms = 30) {
  clearTimeout(pending);
  pending = setTimeout(fitNames, ms);
}

let installed = false;
export function installNameFit() {
  if (installed) return;
  installed = true;
  const clockOnly = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return Boolean(el && el.closest('.ck'));
  };
  new MutationObserver((records) => {
    if (records.every((r) => clockOnly(r.target))) return;
    scheduleNameFit();
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => scheduleNameFit());
  addEventListener('resize', () => scheduleNameFit(60));
}
