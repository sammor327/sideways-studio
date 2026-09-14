// Helpers shared by the experimental overlays (portrait pillars, rows, the
// arena bug, the slate): clock arithmetic, canvas-gauged text fitting, the
// domain rune glyphs and the legend catalog lookup the tiles use for them.
import { setText } from './stage.js';

// Wall-clock arithmetic from a timer's three numbers, the same as the dual
// overlay draws, so every output shows the same time without a server tick.
export function clockText(t) {
  if (!t) return '00:00';
  const total = t.elapsed + (t.running ? Date.now() - t.startedAt : 0);
  const ms = t.countdown > 0 ? Math.max(0, t.countdown - total) : total;
  const s = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// A line set at `size` px caps shrinks to fit `run` design pixels, to a
// floor of `min`, and only then takes an ellipsis. Measured on a canvas so
// it works the same in an occluded browser source. Returns true on change.
const gauge = document.createElement('canvas').getContext('2d');
export function fitText(el, raw, { size, min, run, weight = 800, upper = true }) {
  const text = upper ? String(raw || ' ').toUpperCase() : String(raw || ' ');
  let px = size;
  try {
    const family = getComputedStyle(el).fontFamily;
    const measure = (n) => {
      gauge.font = `${weight} ${n}px ${family}`;
      return gauge.measureText(text).width + text.length * 0.5;
    };
    let width = measure(px);
    for (let i = 0; i < 6 && width > run && px > min; i += 1) {
      px = Math.max(min, (px * run) / width);
      width = measure(px);
    }
  } catch {
    px = size;
  }
  el.style.fontSize = `calc(${px.toFixed(2)} * var(--u))`;
  return setText(el, text);
}

export const DOMAINS = ['Body', 'Calm', 'Chaos', 'Fury', 'Mind', 'Order'];
export const runeSrc = (domain) => `/assets/runes/${domain}.png`;

// Replace an element's children with one rune glyph per domain; no domains
// leaves it empty (and CSS hides an empty run).
export function renderRunes(el, domains) {
  const want = (domains || []).filter((d) => DOMAINS.includes(d)).join('|');
  if (el.dataset.runes === want) return;
  el.dataset.runes = want;
  el.replaceChildren(...(want ? want.split('|') : []).map((d) => {
    const img = document.createElement('img');
    img.className = 'rune';
    img.src = runeSrc(d);
    img.alt = d;
    img.draggable = false;
    img.onerror = () => img.classList.add('hidden');
    return img;
  }));
}

// The legend catalog carries each legend's two domains; a side only carries
// the legend's card id and slug, so the scenes look the domains up here.
// Loaded once, retried until the card database is in.
const byCardId = new Map();
const bySlug = new Map();
let loaded = false;
export async function loadLegendDomains(onReady) {
  try {
    const { legends } = await (await fetch('/api/legends', { cache: 'no-store' })).json();
    for (const l of legends) {
      if (l.cardId) byCardId.set(l.cardId, l.domains || []);
      if (l.slug) bySlug.set(l.slug, l.domains || []);
    }
    loaded = legends.length > 0;
    if (onReady) onReady();
  } catch {
    loaded = false;
  }
  if (!loaded) setTimeout(() => loadLegendDomains(onReady), 5000);
}
export function legendDomains(side) {
  return byCardId.get(side.legendCardId) || bySlug.get(side.legendSlug) || [];
}

// Standard show/hide of a scene root on --t: fresh loads snap, later state
// changes play the entrance or exit. Returns the new shown value.
export function applyVisibility({ root, clock, visible, shown, first }) {
  if (visible === shown) return shown;
  if (first) {
    root.classList.toggle('off', !visible);
    clock.seek(visible ? 1 : 0);
  } else if (visible) {
    root.classList.remove('off');
    clock.play({ from: 0, to: 1 });
  } else {
    clock.play({ from: 1, to: 0 }).then(() => {
      if (root.dataset.shown !== '1') root.classList.add('off');
    });
  }
  root.dataset.shown = visible ? '1' : '0';
  return visible;
}
