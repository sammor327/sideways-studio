// The two tile stages' groups: the Look builder's ("In-game overlays",
// "Bugs, cards and plates", "Full screen") and the Tournament platform's
// ("In-game overlays", "Match graphics", "Event graphics"). Each group folds
// from its heading, so an operator who only runs the rows overlay never
// scrolls past thirty tiles to reach the standings.
//
// Above them sits Favorites: the graphics starred in the Studio's Graphics
// card. A starred tile MOVES into Favorites rather than being copied, the
// way the Studio's rows do, so there is one picture per graphic wherever it
// sits. A stage only holds the tiles it lays out, so a star on a graphic
// this stage does not draw simply does not show here.
//
// Which groups are folded is one operator's convenience, kept in this
// browser like the stars themselves, never in match state.

import { onFavorites } from './favorites.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const FAVORITES_GROUP = 'favorites';

// grid: the scrolling box the groups go in.
// groups: [{ key, label, note, tiles: [tile, ...] }] in the order they list.
// makeCard(tile): the stage's own tile, returning an entry with a .card.
// store: the localStorage key the folded groups are kept under.
// reset(entry): called after a tile's card has been moved between groups.
//   Moving an iframe reloads it, so the stage drops the frame and lets its
//   observer load a fresh one, with the loading state showing.
// onLayout(): called after anything folds or moves, to re-measure and
//   re-observe: a folded group's tiles have no size and never intersect.
export function buildTileStage(grid, groups, makeCard, {
  store,
  emptyText = 'Nothing starred yet. Click the star beside a graphic’s name in the Studio to keep it here.',
  reset = () => {},
  onLayout = () => {},
} = {}) {
  const entries = [];
  const boxes = new Map();

  let folded = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(store) || '[]');
    if (Array.isArray(saved)) folded = new Set(saved.filter((k) => typeof k === 'string'));
  } catch { /* storage blocked or corrupt: every group starts open */ }
  const remember = () => {
    try { localStorage.setItem(store, JSON.stringify([...folded])); } catch { /* this session only */ }
  };

  function addGroup({ key, label, note }) {
    const box = el('details', 'look-group');
    box.dataset.group = key;
    box.open = !folded.has(key);
    const head = el('summary', 'look-group-head');
    const title = el('h3', 'look-group-title');
    title.append(el('span', 'look-group-label', label));
    if (note) title.append(el('span', 'look-group-note', note));
    const count = el('span', 'look-group-count', '');
    head.append(title, count);
    const wrap = el('div', 'look-group-grid');
    box.append(head, wrap);
    grid.append(box);
    box.addEventListener('toggle', () => {
      if (box.open) folded.delete(key); else folded.add(key);
      remember();
      onLayout();
    });
    const handle = { key, box, wrap, count };
    boxes.set(key, handle);
    return handle;
  }

  // Favorites first, so what the operator asked to keep at hand is at hand.
  const favBox = addGroup({ key: FAVORITES_GROUP, label: 'Favorites', note: 'the graphics you starred' });
  favBox.box.classList.add('look-group-fav');
  const favEmpty = el('p', 'hint tile-fav-empty', emptyText);
  favBox.wrap.after(favEmpty);

  // Where each tile was laid out, so an unstarred one goes back in its place.
  const home = new Map();
  for (const group of groups) {
    if (!group.tiles.length) continue;
    const handle = addGroup(group);
    group.tiles.forEach((tile, order) => {
      const entry = makeCard(tile, handle);
      entry.card.dataset.tile = tile.key;
      entries.push(entry);
      handle.wrap.append(entry.card);
      home.set(tile.key, { entry, wrap: handle.wrap, group: handle, order });
    });
  }

  function counts() {
    for (const handle of boxes.values()) {
      const n = handle.wrap.querySelectorAll('.look-tile').length;
      handle.count.textContent = String(n);
    }
    favEmpty.classList.toggle('hidden', favBox.wrap.querySelector('.look-tile') !== null);
  }

  // A tile is starred when the graphic it draws is: every variant of a
  // starred graphic comes along, so "Lower third" brings all four.
  function place(starred) {
    const want = new Set(starred);
    let moved = false;
    for (const key of starred) {
      for (const [, spot] of home) {
        if (spot.entry.tile.scene !== key) continue;
        if (spot.entry.card.parentElement === favBox.wrap) continue;
        favBox.wrap.append(spot.entry.card);
        reset(spot.entry);
        moved = true;
      }
    }
    for (const [, spot] of home) {
      if (want.has(spot.entry.tile.scene)) continue;
      if (spot.entry.card.parentElement === spot.wrap) continue;
      // Back home, ahead of the first neighbour laid out after it.
      const next = [...spot.wrap.querySelectorAll('.look-tile')]
        .find((card) => home.get(card.dataset.tile) && home.get(card.dataset.tile).order > spot.order);
      spot.wrap.insertBefore(spot.entry.card, next || null);
      reset(spot.entry);
      moved = true;
    }
    counts();
    // Favorites is the one group that opens itself: it holds what the
    // operator asked to keep at hand.
    if (moved && favBox.wrap.querySelector('.look-tile')) favBox.box.open = true;
    onLayout();
  }

  onFavorites(place);
  counts();

  return {
    entries,
    group: (key) => boxes.get(key) || null,
    // A jump button opens the group it jumps to: scrolling to a folded
    // heading would show nothing.
    reveal(key) {
      const handle = boxes.get(key);
      if (!handle) return;
      handle.box.open = true;
      handle.box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    // The group a tile sits in now, folded or not: used to open the group
    // holding a tile the stage wants to show.
    openFor(entry) {
      const box = entry.card.closest('details.look-group');
      if (box && !box.open) box.open = true;
    },
    // True while the tile is laid out and its group is open, so the stage
    // does not wait on an intersection that cannot happen.
    shown: (entry) => Boolean(entry.card.closest('details.look-group[open]')),
  };
}
