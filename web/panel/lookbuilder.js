// The Look builder tab (2026-09-18, Sam): "a dedicated look building
// section ... as a separate tab at the top", with the look controls down
// the side the way Match data sits in the Studio and "as many scenes as
// possible laid out" beside them, to see how each change alters them.
//
// The controls are the Studio's old Look card, moved (same element ids, so
// panel.js still wires and paints them). This module owns the tabs and the
// right-hand grid: every graphic as a live tile, a scene page in an iframe
// with ?tile= (that graphic on its own, in the tile's variant) and by
// default ?sample=1 (the built-in sample match, so nothing is judged empty);
// web/stage/stage.js reads both. Tiles load as they scroll into view and
// unload when the Studio tab comes back, so the builder costs nothing
// during a show. A click on a tile points the controls at that graphic.

import { TILES, TILE_GROUPS } from '../shared/looktiles.js';
import { LOOK_SCENES, SCENE_LABELS, resolveLook } from '../shared/look.js';
import { FAVORITES_GROUP, buildTileStage } from '../shared/tilegroups.js';

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// --- per-browser preferences: which data, what sits behind, how big ---

const PREFS_KEY = 'sidewaysStudio.lookBuilder';
const CHOICES = {
  data: ['sample', 'preview'],
  backdrop: ['checker', 'dark', 'light', 'table'],
  size: ['s', 'm', 'l'],
};
const prefs = { data: 'sample', backdrop: 'checker', size: 'm' };
try {
  const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  for (const [key, options] of Object.entries(CHOICES)) {
    if (saved && options.includes(saved[key])) prefs[key] = saved[key];
  }
} catch { /* storage blocked or corrupt: the defaults */ }
const savePrefs = () => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* this session only */ }
};

const tileUrl = (t) => `/scenes/${t.scene}/?transparent=1&preview=1&force=1&anim=0&tile=${encodeURIComponent(t.key)}`
  + (prefs.data === 'sample' ? '&sample=1' : '');

const nameOf = (t) => SCENE_LABELS[t.scene] || t.scene;
const scopeValue = () => ($('lookScope') && $('lookScope').value) || 'global';

// --- the tabs ---

let view = 'studio';

// The footer's first line is the Studio's rule (edits land in preview, TAKE
// airs them), which is exactly wrong for the look: say so on this tab.
const footLine = document.querySelector('footer p');
const footLead = footLine && footLine.firstChild && footLine.firstChild.nodeType === Node.TEXT_NODE ? footLine.firstChild : null;
const STUDIO_FOOT = footLead ? footLead.nodeValue : '';
const LOOK_FOOT = STUDIO_FOOT.replace(/^[^·]*·/, 'Look edits are not cued: they air at once on every graphic that is up. ·');

// The header's tabs, in order: the Studio, this builder, and the Tournament
// platform (platform.js, which listens for 'sideways:view').
const VIEWS = [...document.querySelectorAll('.view-tab')].map((tab) => tab.dataset.view);
const viewFromHash = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'studio');

function setView(next, { remember = true } = {}) {
  view = VIEWS.includes(next) ? next : 'studio';
  document.body.dataset.view = view;
  if (footLead) footLead.nodeValue = view === 'look' ? LOOK_FOOT : STUDIO_FOOT;
  for (const tab of document.querySelectorAll('.view-tab')) {
    const on = tab.dataset.view === view;
    tab.classList.toggle('on', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
  }
  // The hash keeps the tab across a reload without adding history steps.
  if (remember) {
    const url = view === 'studio' ? `${location.pathname}${location.search}` : `#${view}`;
    history.replaceState(null, '', url);
  }
  window.dispatchEvent(new CustomEvent('sideways:view', { detail: view }));
  if (view === 'look') {
    applyPrefs();
    measureTiles();
    observeTiles();
    paint();
  } else {
    closeZoom();
    unloadTiles();
  }
}

for (const tab of document.querySelectorAll('.view-tab')) {
  tab.addEventListener('click', () => setView(tab.dataset.view));
  // Left and right move between the tabs, the usual tablist keys.
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const next = VIEWS[(VIEWS.indexOf(view) + step + VIEWS.length) % VIEWS.length];
    setView(next);
    document.querySelector(`.view-tab[data-view="${next}"]`).focus();
  });
}
window.addEventListener('hashchange', () => setView(viewFromHash(), { remember: false }));

// --- the grid ---

const grid = $('lookTiles');

function newFrame() {
  const frame = el('iframe');
  frame.title = '';
  frame.tabIndex = -1;
  frame.setAttribute('allowtransparency', 'true');
  frame.setAttribute('aria-hidden', 'true');
  return frame;
}

function makeTile(t) {
  const card = el('article', 'look-tile');
  card.dataset.scene = t.scene;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  const frameBox = el('div', 'tile-frame');
  const frame = newFrame();
  frameBox.append(frame, el('span', 'tile-loading', 'Loading'));
  const meta = el('div', 'tile-meta');
  const names = el('div', 'tile-names');
  names.append(el('span', 'tile-name', nameOf(t)));
  if (t.variant) names.append(el('span', 'tile-variant', t.variant));
  const actions = el('div', 'tile-actions');
  const own = el('span', 'tile-own', 'Own look');
  own.title = 'This graphic keeps its own look: edits for all graphics do not reach it.';
  const zoom = el('button', 'tile-zoom', '⤢');
  zoom.type = 'button';
  zoom.title = `Enlarge ${nameOf(t)}${t.variant ? `, ${t.variant}` : ''}`;
  zoom.setAttribute('aria-label', zoom.title);
  actions.append(own, zoom);
  meta.append(names, actions);
  card.append(frameBox, meta);

  const entry = { tile: t, card, frameBox, frame, loaded: false };
  card.addEventListener('click', (e) => {
    if (e.target.closest('.tile-zoom')) return;
    pickScope(t.scene);
  });
  card.addEventListener('dblclick', (e) => {
    if (e.target.closest('.tile-zoom')) return;
    openZoom(tiles.indexOf(entry));
  });
  card.addEventListener('keydown', (e) => {
    if (e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickScope(t.scene); }
  });
  zoom.addEventListener('click', () => openZoom(tiles.indexOf(entry)));
  return entry;
}

// Each group folds from its heading, and the graphics starred in the Studio
// gather in Favorites above them (web/shared/tilegroups.js). The stage lays
// its tiles out as it is built, before the loader below exists, so nothing
// is asked to load until the rest of this module is wired.
let wired = false;
const stage = buildTileStage(
  grid,
  TILE_GROUPS.map((g) => ({ ...g, tiles: TILES.filter((t) => t.group === g.key) })),
  makeTile,
  {
    store: 'sidewaysStudio.lookGroups',
    emptyText: 'Nothing starred yet. Click the star beside a graphic’s name in the Studio’s Graphics card to keep it here.',
    // A moved card carries its iframe, which reloads it: drop the frame and
    // let the observer load a fresh one with the loading state showing.
    reset: (entry) => unloadTile(entry),
    onLayout: () => { measureTiles(); if (wired && view === 'look') observeTiles(); },
  },
);
const tiles = stage.entries;

// Every tile is the same width (one grid track size for all the groups), so
// one measurement scales them all. The first one with a size: a folded
// group's tiles have none to measure.
function measureTiles() {
  for (const box of grid.querySelectorAll('.tile-frame')) {
    if (!box.clientWidth) continue;
    grid.style.setProperty('--tile-scale', String(box.clientWidth / 1920));
    return;
  }
}
new ResizeObserver(measureTiles).observe(grid);

for (const group of [{ key: FAVORITES_GROUP, label: 'Favorites' }, ...TILE_GROUPS]) {
  const jump = el('button', 'look-jump-btn', group.label);
  jump.type = 'button';
  jump.title = `Open ${group.label} and scroll to it`;
  jump.addEventListener('click', () => stage.reveal(group.key));
  $('lookJump').append(jump);
}

function loadTile(entry) {
  const want = tileUrl(entry.tile);
  if (entry.frame.getAttribute('src') === want) return;
  entry.card.classList.remove('loaded');
  entry.frame.addEventListener('load', () => entry.card.classList.add('loaded'), { once: true });
  entry.frame.src = want;
  entry.loaded = true;
}

// A fresh element rather than about:blank: dropping the document is what
// frees its memory and its connection to the server.
function unloadTile(entry) {
  if (!entry.loaded) return;
  const fresh = newFrame();
  entry.frame.replaceWith(fresh);
  entry.frame = fresh;
  entry.loaded = false;
  entry.card.classList.remove('loaded');
}

const nearby = new IntersectionObserver((seen) => {
  if (view !== 'look') return;
  for (const s of seen) {
    if (!s.isIntersecting) continue;
    const entry = tiles.find((x) => x.card === s.target);
    if (entry) loadTile(entry);
  }
}, { root: grid, rootMargin: '400px 0px' });

function observeTiles() {
  for (const entry of tiles) {
    nearby.unobserve(entry.card);
    nearby.observe(entry.card);
  }
}
wired = true;

function unloadTiles() {
  for (const entry of tiles) unloadTile(entry);
}

// --- the toolbar ---

function applyPrefs() {
  for (const [key, options] of Object.entries(CHOICES)) {
    for (const btn of document.querySelectorAll(`[data-lb-${key}]`)) {
      const on = btn.getAttribute(`data-lb-${key}`) === prefs[key];
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const value of options) {
      grid.classList.toggle(`${key}-${value}`, prefs[key] === value);
      zoomBox.classList.toggle(`${key}-${value}`, prefs[key] === value);
    }
  }
}

for (const key of Object.keys(CHOICES)) {
  for (const btn of document.querySelectorAll(`[data-lb-${key}]`)) {
    btn.addEventListener('click', () => {
      const value = btn.getAttribute(`data-lb-${key}`);
      if (prefs[key] === value) return;
      prefs[key] = value;
      savePrefs();
      applyPrefs();
      // A different data source is a different page: reload what is up.
      if (key === 'data') {
        for (const entry of tiles) if (entry.loaded) loadTile(entry);
        if (zoomAt >= 0) showZoom(zoomAt);
      }
    });
  }
}

// --- scope: which graphics the controls on the left edit ---

// Through the scope select itself, so panel.js's own change handler does
// the switching and the controls repaint the way they always have.
function pickScope(key) {
  const sel = $('lookScope');
  if (!sel || sel.value === key) return;
  sel.value = key;
  sel.dispatchEvent(new Event('change'));
}
$('lookScope').addEventListener('change', () => {
  paint();
  const tile = tiles.find((x) => x.tile.scene === scopeValue());
  if (!tile || view !== 'look') return;
  // The graphic being edited may sit in a folded group: open it, or the
  // scroll lands on a heading with nothing under it.
  stage.openFor(tile);
  tile.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
$('lookAllGraphics').addEventListener('click', () => pickScope('global'));

let last = null;

// Which tiles an edit made now would reach, the badges, and the line at the
// top of the controls saying what they edit.
function paint() {
  if (!last || !last.theme) return;
  const theme = last.theme;
  const scope = scopeValue();
  const own = (key) => Boolean(theme.scenes && theme.scenes[key] && theme.scenes[key].enabled);
  for (const entry of tiles) {
    const key = entry.tile.scene;
    const reached = scope === 'global' ? !own(key) : scope === key;
    entry.card.classList.toggle('own', own(key));
    entry.card.classList.toggle('selected', scope === key);
    entry.card.classList.toggle('unreached', !reached);
    entry.card.title = scope === key
      ? `${nameOf(entry.tile)}: the controls on the left edit this graphic`
      : `Edit the look of ${nameOf(entry.tile)} on its own`;
  }
  const line = $('lookScopeLine');
  const all = scope === 'global';
  $('lookAllGraphics').classList.toggle('hidden', all);
  if (all) {
    const kept = LOOK_SCENES.filter(own);
    line.textContent = kept.length
      ? `Editing the look for all graphics. It reaches ${LOOK_SCENES.length - kept.length} of ${LOOK_SCENES.length}; ${kept.length} keep${kept.length === 1 ? 's' : ''} ${kept.length === 1 ? 'its' : 'their'} own look (faded on the right). Click a graphic to edit it on its own.`
      : 'Editing the look for all graphics: every graphic on the right follows it. Click a graphic to edit it on its own.';
  } else if (own(scope)) {
    line.textContent = `Editing ${SCENE_LABELS[scope] || scope} on its own. Nothing else changes.`;
  } else {
    line.textContent = `${SCENE_LABELS[scope] || scope} follows the look for all graphics. Tick Own look to give it colours and a background of its own.`;
  }
}

// A tile flashes when what it draws with changes, so an edit shows where
// it landed. The first paint only records.
const signatures = new Map();
function lookSignature(theme, key) {
  return JSON.stringify([resolveLook(theme, key), theme.font || '', theme.logo || '']);
}

function flash(card) {
  card.classList.remove('changed');
  void card.offsetWidth;
  card.classList.add('changed');
  clearTimeout(card.flashTimer);
  card.flashTimer = setTimeout(() => card.classList.remove('changed'), 1400);
}

// Called by panel.js after every state render.
export function renderLookBuilder(s) {
  last = s;
  if (!s || !s.theme) return;
  const changed = new Set();
  for (const key of new Set(tiles.map((x) => x.tile.scene))) {
    const sig = lookSignature(s.theme, key);
    if (signatures.has(key) && signatures.get(key) !== sig) changed.add(key);
    signatures.set(key, sig);
  }
  if (view === 'look') {
    for (const entry of tiles) if (changed.has(entry.tile.scene)) flash(entry.card);
    paint();
  }
}

// --- enlarge: one graphic big, stepping through the grid ---

const zoomRoot = el('div', 'look-zoom');
zoomRoot.hidden = true;
const zoomBox = el('div', 'zoom-box');
zoomBox.setAttribute('role', 'dialog');
zoomBox.setAttribute('aria-modal', 'true');
zoomBox.setAttribute('aria-labelledby', 'lookZoomTitle');
const zoomHead = el('div', 'zoom-head');
const zoomTitle = el('strong', 'zoom-title');
zoomTitle.id = 'lookZoomTitle';
const zoomVariant = el('span', 'zoom-variant');
const zoomActions = el('div', 'zoom-actions');
const zoomBtn = (label, title, fn) => {
  const b = el('button', '', label);
  b.type = 'button';
  b.title = title;
  b.addEventListener('click', fn);
  zoomActions.append(b);
  return b;
};
zoomBtn('‹ Previous', 'Previous graphic (Left arrow)', () => stepZoom(-1));
zoomBtn('Next ›', 'Next graphic (Right arrow)', () => stepZoom(1));
const zoomEdit = zoomBtn('Edit this graphic', 'Point the look controls at this graphic', () => {
  if (zoomAt >= 0) pickScope(tiles[zoomAt].tile.scene);
});
zoomBtn('Close', 'Close (Esc)', () => closeZoom());
zoomHead.append(zoomTitle, zoomVariant, zoomActions);
const zoomFrameBox = el('div', 'zoom-frame');
let zoomFrame = newFrame();
zoomFrameBox.append(zoomFrame);
zoomBox.append(zoomHead, zoomFrameBox);
zoomRoot.append(zoomBox);
document.body.append(zoomRoot);
zoomRoot.addEventListener('click', (e) => { if (e.target === zoomRoot) closeZoom(); });

new ResizeObserver(() => {
  if (zoomFrameBox.clientWidth) zoomFrameBox.style.setProperty('--zoom-scale', String(zoomFrameBox.clientWidth / 1920));
}).observe(zoomFrameBox);

let zoomAt = -1;
function showZoom(i) {
  zoomAt = (i + tiles.length) % tiles.length;
  const t = tiles[zoomAt].tile;
  zoomTitle.textContent = nameOf(t);
  zoomVariant.textContent = t.variant || '';
  zoomEdit.disabled = scopeValue() === t.scene;
  const want = tileUrl(t);
  if (zoomFrame.getAttribute('src') !== want) zoomFrame.src = want;
}
function openZoom(i) {
  zoomRoot.hidden = false;
  showZoom(i);
  zoomActions.querySelector('button').focus();
}
function stepZoom(dir) {
  if (zoomAt >= 0) showZoom(zoomAt + dir);
}
function closeZoom() {
  if (zoomRoot.hidden) return;
  zoomRoot.hidden = true;
  const back = zoomAt >= 0 ? tiles[zoomAt].card : null;
  zoomAt = -1;
  const fresh = newFrame();
  zoomFrame.replaceWith(fresh);
  zoomFrame = fresh;
  if (back && view === 'look') back.focus();
}
document.addEventListener('keydown', (e) => {
  if (zoomRoot.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeZoom(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); stepZoom(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); stepZoom(1); }
});
$('lookScope').addEventListener('change', () => {
  if (zoomAt >= 0) zoomEdit.disabled = scopeValue() === tiles[zoomAt].tile.scene;
});

setView(viewFromHash(), { remember: false });
