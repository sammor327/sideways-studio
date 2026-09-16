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

// --- cards in hand: the DOM both hand-list overlays draw ---
//
// The rows overlay and the dual columns build the same rows from the same
// hand entries; only the metrics differ, so the markup lives here and each
// scene's CSS sizes it for its own column.

// One row per card: an art strip in lanes style, the name, then the energy
// cost and the power runes. A card on the chain greys out and says so.
function cardRow(c, lanes) {
  const row = document.createElement('div');
  row.className = `card${c.played ? ' played' : ''}${lanes ? ' with-art' : ''}`;
  if (lanes) {
    const img = document.createElement('img');
    img.className = 'strip';
    img.src = `/cardart/thumb/${c.cardId}.webp`;
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.classList.add('hidden');
    row.append(img);
  }
  const nm = document.createElement('span');
  nm.className = 'nm';
  nm.textContent = c.cardName || c.cardId;
  const cost = document.createElement('span');
  cost.className = 'cost';
  const e = document.createElement('span');
  e.className = 'e';
  e.textContent = c.energy === null || c.energy === undefined ? '' : String(c.energy);
  cost.append(e);
  for (const d of (c.domains || []).filter((x) => DOMAINS.includes(x))) {
    const img = document.createElement('img');
    img.className = 'rune';
    img.src = runeSrc(d);
    img.alt = d;
    img.draggable = false;
    img.onerror = () => img.classList.add('hidden');
    cost.append(img);
  }
  row.append(nm, cost);
  return row;
}

// Lanes: reactions, then actions, then everything else, each with its own
// header and count; the reactions lane carries the live rule.
const LANES = [
  ['reaction', 'Reactions', (c) => c.kind === 'reaction'],
  ['action', 'Actions', (c) => c.kind === 'action'],
  ['other', 'Units and gear', (c) => c.kind !== 'reaction' && c.kind !== 'action'],
];
function laneEls(list, art) {
  const out = [];
  for (const [cls, label, pick] of LANES) {
    const cards = list.filter(pick);
    if (!cards.length) continue;
    const lane = document.createElement('div');
    lane.className = `lane ${cls}`;
    const h = document.createElement('div');
    h.className = 'lh';
    h.append(
      Object.assign(document.createElement('span'), { className: 'label', textContent: label }),
      Object.assign(document.createElement('span'), { className: 'lcnt', textContent: String(cards.filter((c) => !c.played).length) }),
    );
    lane.append(h, ...cards.map((c) => cardRow(c, art)));
    out.push(lane);
  }
  return out;
}

// How many cards a side is holding: the spotter's count when they gave one,
// otherwise the length of the list they typed.
export const handTotal = (side) => (side && side.handCount > 0 ? side.handCount : ((side && side.hand) || []).length);

// Whether one side's cards-in-hand block is up: the scene's switch, and a
// hand with something in it. A block that claims another graphic's space
// (the dual columns take the event block and the docked card) and that
// graphic have to agree on this, so both ask here.
export const handUp = (cfg, side) => Boolean(cfg && cfg.hand && handTotal(side) > 0);

// The rows one hand draws, flat or in lanes. Lanes carry an art strip per
// card where there is room for one: the dual columns' block is a third the
// height of the rows column's and asks for `art: false`, so the grouping
// survives in a box that the strips would have cost four cards.
export function handEls(list, lanes, { art = true } = {}) {
  return lanes ? laneEls(list, art) : list.map((c) => cardRow(c, false));
}

// Everything the rows depend on, in one string: a scene rebuilds only when
// this changes, so a score bump never restarts an image load.
export function handKey(list, lanes) {
  return `${lanes ? 'L' : 'F'}:` + list
    .map((c) => `${c.cardId}|${c.cardName}|${c.energy}|${(c.domains || []).join(',')}|${c.kind}|${c.played ? 1 : 0}`)
    .join(';');
}
