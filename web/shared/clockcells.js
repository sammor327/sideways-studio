// Clocks set in fixed cells (2026-09-18, Sam: "make the timer a monospaced
// font so it doesn't push things as the time changes").
//
// font-variant-numeric: tabular-nums was already on most clocks and did not
// do it: the heavy Segoe UI weights they are set in ignore tabular figures,
// so on the rows overlay "11:11" drew 12px narrower than "00:00" and shoved
// the bar beside it every second. Swapping in a code font would fix the width
// but look wrong on air. So every digit sits in a cell as wide as the widest
// digit of the clock's OWN font, measured on a canvas: the clock is
// monospaced in whatever face the look uses (an organizer's font included)
// and never changes width as it ticks. Colons keep their natural width,
// which never changes either.
//
// The cells carry their own inline style, so the panel and every scene use
// this without a stylesheet. The element's text stays the plain time
// ("12:34"), so anything reading textContent still sees it.

const DIGITS = '0123456789';
const CELL = 'display:inline-block;width:var(--ck-digit,0.62em);text-align:center';

const gauge = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
const widths = new Map();
const live = new Set();

// A web font that finishes loading changes every measurement made before it.
if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => {
    widths.clear();
    for (const el of live) {
      if (el.isConnected) sizeCells(el);
      else live.delete(el);
    }
  });
}

function digitWidth(el) {
  const cs = getComputedStyle(el);
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const spacing = parseFloat(cs.letterSpacing) || 0;
  const key = `${font}|${spacing}`;
  if (!widths.has(key)) {
    let widest = 0;
    if (gauge) {
      gauge.font = font;
      for (const d of DIGITS) widest = Math.max(widest, gauge.measureText(d).width);
    }
    // Letter spacing trails every glyph inside its cell, so the cell keeps it.
    widths.set(key, widest ? widest + spacing : 0);
  }
  return widths.get(key);
}

function sizeCells(el) {
  const w = digitWidth(el);
  const value = w ? `${w.toFixed(2)}px` : '0.62em';
  if (el.style.getPropertyValue('--ck-digit') !== value) el.style.setProperty('--ck-digit', value);
}

function cell(ch) {
  const span = document.createElement('span');
  span.textContent = ch;
  if (DIGITS.includes(ch)) span.style.cssText = CELL;
  return span;
}

// Set a clock's time. One inline wrapper holds the cells, so a clock whose
// box is a flex or grid container still centres a single item. Returns true
// when the time changed, like setText.
export function setClock(el, text) {
  if (!el) return false;
  const value = String(text);
  live.add(el);
  sizeCells(el);
  let wrap = el.firstElementChild;
  if (!wrap || !wrap.classList.contains('ck') || el.childNodes.length !== 1) {
    wrap = document.createElement('span');
    wrap.className = 'ck';
    wrap.style.whiteSpace = 'nowrap';
    el.replaceChildren(wrap);
  }
  if (el.dataset.clock === value && wrap.childElementCount === value.length) return false;
  const chars = [...value];
  const cells = wrap.children;
  if (cells.length !== chars.length) {
    wrap.replaceChildren(...chars.map(cell));
  } else {
    chars.forEach((ch, i) => {
      if (cells[i].textContent === ch) return;
      // A digit swapping for a mark (or back) needs the other kind of cell.
      if (DIGITS.includes(ch) === DIGITS.includes(cells[i].textContent)) cells[i].textContent = ch;
      else cells[i].replaceWith(cell(ch));
    });
  }
  el.dataset.clock = value;
  return true;
}
