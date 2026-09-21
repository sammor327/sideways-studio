// The starred graphics, shared by the three places that show them: the
// Studio's Graphics card (where the star is clicked), the Look builder's
// tile stage and the Tournament platform's tile stage. A star clicked in the
// Studio moves the tile on the other two tabs, and the other way round.
//
// Which graphics are starred is one operator's convenience, kept in this
// browser like the folds, never in match state: it never reaches the wire.
// A second panel window keeps up through the storage event.
//
// Plain ESM with no dependencies, like look.js and looktiles.js, so the
// tests import it directly.

export const FAVORITES_KEY = 'sidewaysStudio.favorites';

// Scene keys only, no repeats, in the order they were starred.
export function cleanFavorites(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((key) => typeof key === 'string' && key))];
}

function read() {
  try {
    return cleanFavorites(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
  } catch {
    return []; // storage blocked or corrupt: nothing starred
  }
}

let current = read();

export const favorites = () => [...current];
export const isFavorite = (key) => current.includes(key);

const announce = () => window.dispatchEvent(new CustomEvent('sideways:favorites', { detail: [...current] }));

export function setFavorites(list) {
  current = cleanFavorites(list);
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(current)); } catch { /* this session only */ }
  announce();
}

// Returns whether the graphic is starred now.
export function toggleFavorite(key) {
  setFavorites(current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
  return isFavorite(key);
}

// Called back with the starred list now, and again whenever it changes.
export function onFavorites(fn) {
  window.addEventListener('sideways:favorites', (e) => fn(e.detail));
  fn(favorites());
}

// Another panel window starred something (storage fires in the other
// documents, never the one that wrote), or the operator cleared storage.
window.addEventListener('storage', (e) => {
  if (e.key !== null && e.key !== FAVORITES_KEY) return;
  const next = read();
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  announce();
});
