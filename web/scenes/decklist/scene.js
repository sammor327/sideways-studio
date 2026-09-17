// Decklist plate scene. ONE renderer for every surface: the broadcast source,
// the panel's preview and program monitors, the deck editor's live preview,
// a standalone ?list= source, and PNG export (a headless browser loading this
// page with ?still=1). Nothing else draws the plate, so none of them can
// drift from what airs.
//
// Where the deck comes from:
//   default      server state over the stage sync client (program, or the
//                preview bank with ?preview=1)
//   ?list=...    a fixed deck carried in the URL (&bg=0 drops the backdrop,
//                &sideboard=0 the rack); add &still=1 for export
//   ?embed=1     the deck editor posts decks in with postMessage
import { initStage, sceneBank } from '../../stage/stage.js';
import { SeekClock, animEnabled } from '../../stage/seekclock.js';
import { RUNE_DOMAINS } from '../../shared/decklist-format.js';
import * as L from './layout.js';

const $ = (id) => document.getElementById(id);
const deckEl = $('deck');
const plateHost = $('plateHost');
const backdrop = $('backdrop');
const fade = new SeekClock(deckEl, '--t', 500);

const query = new URLSearchParams(location.search);
const MODE = query.has('list') ? 'url' : query.get('embed') === '1' ? 'embed' : 'state';
const STILL = query.get('still') === '1';

const DOMAIN_COLOR = {
  body: '#e0603a', calm: '#3ddc84', chaos: '#b06cff',
  fury: '#e8484f', mind: '#3aa7e0', order: '#e8c23a',
};
const RUNE_ICON = Object.fromEntries(RUNE_DOMAINS.map((d) => [d.toLowerCase(), d]));

// A canvas gauge measures text in the plate's own face, so names and counts
// can be fitted while the plate is still off screen with nothing laid out.
// A gauge that cannot measure reports zero: the text then keeps its designed
// size, which is the pre-fit look, never a blank.
const gauge = document.createElement('canvas').getContext('2d');
function textWidth(text, px, tracking = 0) {
  try {
    gauge.font = `800 ${px}px ${getComputedStyle(deckEl).fontFamily}`;
    return gauge.measureText(text).width + text.length * tracking;
  } catch {
    return 0;
  }
}

// The gauge reads whatever face the page has, so a theme font has to be in
// before anything is measured: instant when it is installed, one small fetch
// from this server otherwise, and never more than a moment's hold on a cue.
async function fontsIn() {
  try {
    const family = getComputedStyle(deckEl).fontFamily;
    await Promise.race([document.fonts.load(`800 ${L.RUNE_FONT}px ${family}`), sleep(400)]);
  } catch { /* measured with the face the page fell back to */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const markReady = (value) => { document.documentElement.dataset.ready = value; };

// --- name resolution ---------------------------------------------------------
// The server owns resolution, so the panel summary, the editor and the plate
// read the same answer. Results are kept per list, so flipping back to a deck
// already shown swaps instantly with no round trip.

const resolved = new Map();
async function resolveList(list) {
  if (resolved.has(list)) return resolved.get(list);
  const res = await fetch('/api/decklist/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ list }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const deck = await res.json();
  // Only a deck with every name found is worth keeping: an unresolved name
  // may be a card the index learns about on the next "check for new sets".
  if (!deck.counts.unresolved) {
    resolved.set(list, deck);
    if (resolved.size > 24) resolved.delete(resolved.keys().next().value);
  }
  return deck;
}

// --- building the plate ------------------------------------------------------

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// Art chain for one card: full art, then the prefetched thumb, then the
// named panel. Resolves once the chain has landed somewhere, which is what
// still mode waits on before it lets the capture happen.
function loadArt(img, cardId, box, onLoad) {
  return new Promise((resolve) => {
    let tier = 'full';
    img.onload = () => { if (onLoad) onLoad(); resolve(); };
    img.onerror = () => {
      if (tier === 'full') {
        tier = 'thumb';
        img.src = `/cardart/thumb/${cardId}.webp`;
      } else {
        box.classList.add('missing');
        resolve();
      }
    };
    img.src = `/cardart/full/${cardId}.webp`;
  });
}

function cardEl(card, width, radius, qtySize, pending) {
  const box = el('div', 'card');
  box.style.setProperty('--w', width);
  box.style.setProperty('--h', width / L.CARD_RATIO);
  box.style.setProperty('--r', radius);
  box.style.setProperty('--mf', L.missFontSize(width));
  // The highlight finds its card by id, so the same card in the main deck
  // and the sideboard both lift.
  if (card.cardId) box.dataset.cardId = card.cardId;
  if (card.cardId) {
    const img = el('img');
    img.alt = '';
    img.draggable = false;
    box.append(img);
    pending.push(loadArt(img, card.cardId, box));
  } else {
    box.classList.add('missing');
  }
  const miss = el('div', 'miss');
  miss.textContent = card.name;
  box.append(miss);
  if (qtySize) {
    const qty = el('span', 'qty');
    qty.style.setProperty('--q', qtySize);
    qty.textContent = card.qty;
    box.append(qty);
  }
  return box;
}

function railEl(label) {
  return el('div', `rail rail-${label}`);
}

function spacerEl(width) {
  const s = el('div', 'spacer');
  s.style.width = `calc(${width} * var(--u))`;
  return s;
}

// Battlefield row: art sliver plus name in an accent-bordered pill; an
// unlisted slot is an empty outline.
function pillEl(card, pending) {
  const pill = el('div', card ? 'pill' : 'pill empty');
  if (!card) return pill;
  if (card.cardId) pill.dataset.cardId = card.cardId;
  const art = el('div', 'pill-art');
  if (card.cardId) {
    const img = el('img');
    img.alt = '';
    img.draggable = false;
    art.append(img);
    // Orientation comes from the loaded file itself, never a per-card flag.
    pending.push(loadArt(img, card.cardId, art, () => {
      img.classList.toggle('flat', img.naturalWidth >= img.naturalHeight);
    }));
  } else {
    art.classList.add('missing');
  }
  const name = el('div', 'pill-name');
  name.textContent = card.name.toUpperCase();
  // A long name shrinks to its run before it is allowed to clip.
  const fit = L.pillNameScale(textWidth(name.textContent, L.PILL_FONT, L.PILL_TRACKING));
  if (fit < 1) name.style.setProperty('--fit', fit.toFixed(3));
  pill.append(art, name);
  return pill;
}

function runeDot(domain) {
  const dot = el('div', 'rune-dot');
  dot.style.backgroundColor = DOMAIN_COLOR[String(domain).toLowerCase()] || '#898781';
  return dot;
}

function runeEl(domain, count, pending) {
  const row = el('div', 'rune');
  const icon = RUNE_ICON[String(domain).toLowerCase()];
  if (icon) {
    const img = el('img');
    img.alt = '';
    img.draggable = false;
    pending.push(new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = () => { img.replaceWith(runeDot(domain)); resolve(); };
    }));
    img.src = `/assets/runes/${icon}.png`;
    row.append(img);
  } else {
    row.append(runeDot(domain));
  }
  const n = el('div', 'rune-n');
  n.textContent = count;
  row.append(n);
  return row;
}

// The whole plate as a detached tree. Images start loading the moment their
// src is set, so the tree can finish loading before it goes on screen.
function buildPlate(deck, content) {
  const pending = [];
  const plate = el('div', 'plate');
  const delays = L.introDelays(deck.main.length, deck.runes.length);
  const anim = (node, kind, delay) => {
    node.dataset.anim = kind;
    node.dataset.delay = delay;
    return node;
  };

  if (deck.legend) {
    const legend = anim(el('div', 'legend'), 'slide', delays.legend);
    legend.append(cardEl(deck.legend, L.LEGEND_W, L.LEGEND_RADIUS, 0, pending));
    plate.append(legend);
  } else {
    const empty = el('div', 'legend-empty');
    empty.textContent = 'no legend listed';
    plate.append(empty);
  }

  const g = L.gridMetrics(deck.main.length);
  const grid = el('div', 'grid');
  grid.style.setProperty('--cols', g.cols);
  grid.style.setProperty('--cw', g.cardW);
  deck.main.forEach((card, i) => {
    const cell = anim(el('div', 'cell'), 'pop', delays.cards[i]);
    cell.append(cardEl(card, g.cardW, L.GRID_RADIUS, g.qtySize, pending));
    grid.append(cell);
  });
  plate.append(grid);

  const strip = anim(el('div', 'strip'), 'rise', delays.strip);
  strip.append(railEl('battlefields'));
  const bfCol = el('div', 'bf-col');
  // Three pills always; an illegal fourth still shows up rather than vanishing.
  const bfs = [0, 1, 2].map((i) => deck.battlefields[i] || null).concat(deck.battlefields.slice(3));
  for (const bf of bfs) bfCol.append(pillEl(bf, pending));
  strip.append(bfCol, spacerEl(4), railEl('champion'));
  strip.append(deck.champion
    ? cardEl(deck.champion, L.CHAMPION_W, L.SMALL_RADIUS, 0, pending)
    : el('div', 'champ-empty'));
  if (content.showSideboard) {
    strip.append(spacerEl(26), railEl('sideboard'));
    const rack = el('div', 'rack');
    const slots = L.sideboardSlots(deck.sideboard.length);
    for (let i = 0; i < slots; i += 1) {
      const card = deck.sideboard[i];
      rack.append(card ? cardEl(card, L.SLOT_W, L.SMALL_RADIUS, L.SLOT_QTY, pending) : el('div', 'slot-empty'));
    }
    strip.append(rack);
  }
  const runes = el('div', 'runes');
  deck.runes.forEach(([domain, count], i) => {
    const wrap = anim(el('div', 'rune-wrap'), 'pop', delays.runes[i]);
    wrap.append(runeEl(domain, count, pending));
    runes.append(wrap);
  });
  // Counts that would run past the strip (10/2, 11/1, a third domain beside
  // a full rack) shrink the whole block instead of leaving the plate.
  const rs = L.runeScale(
    deck.runes.map(([, count]) => textWidth(String(count), L.RUNE_FONT)),
    L.runeRoom(content.showSideboard, deck.sideboard.length),
  );
  if (rs < 1) runes.style.setProperty('--rs', rs.toFixed(3));
  strip.append(runes);
  plate.append(strip);
  return { plate, pending };
}

// The backdrop is painted by CSS from the look, so "loaded" means the image
// the look names (if any) has arrived. Read it off the resolved custom
// property rather than the state, so URL mode and state mode agree.
function backdropSettled() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--ss-bg-image').trim();
  const m = raw.match(/^url\(["']?(.+?)["']?\)$/);
  if (!m) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = m[1];
    if (img.complete) resolve();
  });
}

function setBackground(on) {
  backdrop.classList.toggle('hidden', !on);
  deckEl.classList.toggle('with-bg', on);
}

// --- build-in ----------------------------------------------------------------
// Legend slides in, grid cards cascade, the strip rises, rune counts pop last:
// FlipDeck's 90-frame intro, each element on its own spring. Driven by a
// wall-clock interval that writes --s per element (never rAF, which a hidden
// OBS source starves), and removed entirely at the end so the settled plate
// is exactly the still.

let intro = null;

function stopIntro() {
  if (!intro) return;
  clearInterval(intro.timer);
  intro.plate.classList.remove('animating');
  for (const it of intro.items) it.node.style.removeProperty('--s');
  intro = null;
}

function playIntro(plate) {
  stopIntro();
  if (!plate || STILL || !animEnabled()) return;
  const items = [...plate.querySelectorAll('[data-anim]')].map((node) => ({
    node, delay: Number(node.dataset.delay) / L.INTRO_FPS, last: -1,
  }));
  const end = Math.max(0, ...items.map((it) => it.delay)) + L.SETTLE_SECONDS;
  // Everything starts hidden in the same task that turns the intro on, so no
  // frame ever paints the settled plate first.
  for (const it of items) it.node.style.setProperty('--s', '0');
  plate.classList.add('animating');
  const t0 = Date.now();
  const tick = () => {
    const t = (Date.now() - t0) / 1000;
    if (t >= end) { stopIntro(); return; }
    for (const it of items) {
      const s = Math.round(L.springAt(t - it.delay) * 10000) / 10000;
      if (s !== it.last) {
        it.node.style.setProperty('--s', String(s));
        it.last = s;
      }
    }
  };
  intro = { plate, items, timer: setInterval(tick, 16) };
}

// --- showing a deck ----------------------------------------------------------

let shown = null;   // the content whose plate is mounted
let showToken = 0;

const contentOf = (src) => ({
  list: String(src.list || ''),
  background: src.background !== false,
  showSideboard: src.showSideboard !== false,
});
const sameContent = (a, b) => Boolean(a && b)
  && a.list === b.list && a.background === b.background && a.showSideboard === b.showSideboard;

// Resolve, build off screen, wait for the art (capped, so a slow download
// never holds a cue), then swap in. Returns how it went; on any failure the
// plate already up stays up, because a failed fetch must never blank a
// graphic that is on air.
async function show(content, { animate = false, capMs = 1500 } = {}) {
  const token = ++showToken;
  if (!content.list.trim()) {
    stopIntro();
    plateHost.replaceChildren();
    setBackground(content.background);
    shown = content;
    return 'empty';
  }
  let deck;
  try {
    deck = await resolveList(content.list);
  } catch {
    return 'failed';
  }
  await fontsIn();
  if (token !== showToken) return 'stale';
  const { plate, pending } = buildPlate(deck, content);
  if (content.background) pending.push(backdropSettled());
  const all = Promise.all(pending);
  await (capMs ? Promise.race([all, sleep(capMs)]) : all);
  if (token !== showToken) return 'stale';
  stopIntro();
  setBackground(content.background);
  plateHost.replaceChildren(plate);
  shown = content;
  if (animate) playIntro(plate);
  // A new plate carries no highlight marks: put the wanted one back.
  syncFocus(false);
  return 'shown';
}

// --- highlight: one card lifted out of the plate --------------------------
// The focus cue names a card id. That card scales up around its own centre,
// lifts, and takes a glow; everything else on the plate (and the backdrop)
// blurs and darkens. One seek clock, --k on the deck root, drives all of it
// (0 = plain plate, 1 = highlight settled), so a change plays out and in on
// wall-clock ticks like every other move here. The lifted card is measured
// on screen so its scaled box is shifted back inside the frame when it sits
// on an edge: a top-row card grows downward rather than off the top.

const FOCUS_LIFT = 26;
const FOCUS_PAD = 12;
let focusId = '';        // the card the state wants highlighted
let focusedEl = null;    // the element highlighted now
let focusToken = 0;
const focusClock = new SeekClock(deckEl, '--k', 380);

function focusGeometry(target) {
  const stage = deckEl.getBoundingClientRect();
  const u = stage.width / L.PLATE_W || 1;
  const r = target.getBoundingClientRect();
  const w = r.width / u;
  const h = r.height / u;
  // Small cards grow more than big ones, to about the same size on screen;
  // the legend, already the biggest thing on the plate, only nudges up.
  const fs = target.classList.contains('pill') ? 1.35 : Math.min(2.8, Math.max(1.06, 330 / w));
  const cx = (r.left - stage.left) / u + w / 2;
  const cy = (r.top - stage.top) / u + h / 2 - FOCUS_LIFT;
  const hw = (w * fs) / 2;
  const hh = (h * fs) / 2;
  let fx = 0;
  let fy = 0;
  if (cx - hw < FOCUS_PAD) fx = FOCUS_PAD - (cx - hw);
  else if (cx + hw > L.PLATE_W - FOCUS_PAD) fx = (L.PLATE_W - FOCUS_PAD) - (cx + hw);
  if (cy - hh < FOCUS_PAD) fy = FOCUS_PAD - (cy - hh);
  else if (cy + hh > L.PLATE_H - FOCUS_PAD) fy = (L.PLATE_H - FOCUS_PAD) - (cy + hh);
  return { fs, fx, fy };
}

function clearFocusMarks() {
  for (const node of deckEl.querySelectorAll('.dim, .focus-path, .focus')) node.classList.remove('dim', 'focus-path', 'focus');
  backdrop.classList.remove('dim');
  const plate = plateHost.firstChild;
  if (plate) plate.classList.remove('focusing');
}

// Everything on the plate dims except the path down to the target, which is
// raised above its neighbours so the grown card overlaps them, not the
// other way round.
function markFocus(plate, target) {
  const dimExcept = (container) => {
    for (const child of container.children) {
      if (child.contains(target)) {
        child.classList.add('focus-path');
        if (child !== target) dimExcept(child);
      } else {
        child.classList.add('dim');
      }
    }
  };
  dimExcept(plate);
  backdrop.classList.add('dim');
  const g = focusGeometry(target);
  target.style.setProperty('--fs', g.fs.toFixed(3));
  target.style.setProperty('--fx', g.fx.toFixed(1));
  target.style.setProperty('--fy', g.fy.toFixed(1));
  target.classList.add('focus');
  plate.classList.add('focusing');
}

// Bring the plate in line with focusId. The geometry is measured on screen,
// so this does nothing while the deck is hidden; every path that shows the
// deck calls it again. A change while a highlight is up plays the old one
// out, then the new one in.
async function syncFocus(animate) {
  const plate = plateHost.firstChild;
  if (!plate || deckEl.classList.contains('off')) return;
  const target = focusId ? plate.querySelector(`[data-card-id="${CSS.escape(focusId)}"]`) : null;
  if (target === focusedEl && (target || !backdrop.classList.contains('dim'))) return;
  const token = ++focusToken;
  const anim = animate && animEnabled();
  if (focusedEl && focusedEl.isConnected && anim) {
    await focusClock.play({ from: 1, to: 0 });
    if (token !== focusToken) return;
  }
  focusClock.stop();
  focusClock.seek(0);
  clearFocusMarks();
  focusedEl = target;
  if (!target) return;
  markFocus(plate, target);
  if (anim) focusClock.play({ from: 0, to: 1 });
  else focusClock.seek(1);
}

// --- mode: server state (the broadcast source and the panel monitors) -------

function runStateMode() {
  let visibleNow = null;
  let target = null;
  let lastReplay = null;
  let params = null;

  function enter(content) {
    fade.stop();
    fade.seek(1);
    if (sameContent(shown, content) && plateHost.firstChild) {
      deckEl.classList.remove('off');
      playIntro(plateHost.firstChild);
      syncFocus(false);
      return;
    }
    // Hold the reveal until the new plate is built, so the old deck never
    // flashes up first.
    deckEl.classList.add('off');
    show(content, { animate: true }).then((result) => {
      if (!visibleNow) return;
      deckEl.classList.remove('off');
      if (result === 'failed') playIntro(plateHost.firstChild);
      syncFocus(false);
    });
  }

  function leave() {
    stopIntro();
    fade.play({ from: 1, to: 0 }).then(() => {
      if (visibleNow) return;
      deckEl.classList.add('off');
      // A deck changed while this one faded out: bring the hidden plate up to
      // date so the next entrance has nothing to wait for.
      if (target && !sameContent(shown, target)) show(target);
    });
  }

  params = initStage({
    onState(state, first) {
      $('diag').classList.remove('on');
      const sc = sceneBank(state, params).scenes.decklist;
      const content = contentOf(sc);
      const visible = (params.force || Boolean(sc.visible)) && content.list.trim() !== '';
      $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);

      const listChanged = !target || content.list !== target.list;
      const changed = !sameContent(content, target);
      // The replay cue only means something on air.
      const replay = !first && !params.preview && lastReplay !== null && sc.replay !== lastReplay;
      lastReplay = sc.replay;
      target = content;
      // The highlight is a cue in both banks; a change while the plate is up
      // plays out and in, and any path that (re)shows the plate applies it.
      // focusOn off keeps the card but shows the plain plate, so the panel
      // can flick the highlight without losing its place.
      const wantFocus = typeof sc.focus === 'string' && sc.focusOn !== false ? sc.focus : '';
      const focusChanged = wantFocus !== focusId;
      focusId = wantFocus;
      if (focusChanged && !first && visibleNow && !changed) syncFocus(true);

      if (first) {
        // Fresh loads, including an OBS "shutdown source when hidden" reload,
        // snap to the current state instead of replaying the entrance.
        visibleNow = visible;
        fade.seek(visible ? 1 : 0);
        show(content).then(() => {
          if (!visibleNow) return;
          deckEl.classList.remove('off');
          syncFocus(false);
        });
        return;
      }

      if (!visible) {
        if (visibleNow) {
          visibleNow = false;
          leave();
        } else if (changed && !fade.timer) {
          show(content);
        }
        return;
      }

      if (!visibleNow) {
        visibleNow = true;
        enter(content);
        return;
      }

      // Already on screen. A new deck builds in (on air; the preview monitor
      // just settles, since it re-renders on every edit); a settings change
      // settles in place; the replay cue rebuilds the plate that is up.
      if (listChanged) show(content, { animate: !params.preview });
      else if (changed) show(content);
      else if (replay) playIntro(plateHost.firstChild);
    },
  });

  setTimeout(() => {
    if (visibleNow === null) $('diag').classList.add('on');
  }, 4000);
}

// --- mode: a fixed deck from the URL (standalone source and PNG export) -----

function runUrlMode() {
  const content = {
    list: query.get('list') || '',
    background: query.get('bg') !== '0',
    showSideboard: query.get('sideboard') !== '0',
  };
  // Theme (accent colour, font) still comes from the server; the deck does not.
  let themed;
  const themeReady = new Promise((resolve) => { themed = resolve; });
  initStage({ scene: 'decklist', onState: () => themed() });
  setTimeout(themed, 3000);

  if (!content.list.trim()) {
    $('diag').textContent = 'Sideways Studio: this decklist URL carries no list.';
    $('diag').classList.add('on');
    markReady('error: the URL carries no decklist');
    return;
  }

  (async () => {
    if (STILL) await themeReady;
    fade.seek(1);
    const result = await show(content, { capMs: STILL ? 0 : 1500 });
    deckEl.classList.remove('off');
    if (!STILL) return;
    if (result !== 'shown') {
      markReady('error: the server could not read this decklist');
      return;
    }
    await document.fonts.ready;
    await sleep(80);
    markReady('1');
  })();
}

// --- mode: the deck editor's live preview ------------------------------------

function runEmbedMode() {
  initStage({ scene: 'decklist', onState: () => {} });
  fade.seek(1);
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'decklist:show') {
      show(contentOf(e.data), { capMs: 800 }).then(() => deckEl.classList.remove('off'));
    } else if (e.data.type === 'decklist:intro') {
      playIntro(plateHost.firstChild);
    }
  });
  if (window.parent !== window) window.parent.postMessage({ type: 'decklist:ready' }, location.origin);
}

if (MODE === 'url') runUrlMode();
else if (MODE === 'embed') runEmbedMode();
else runStateMode();
