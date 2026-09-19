// Highlights on the between-games sheets (2026-09-19, Sam: "highlight and
// feature specific standings on the standings graphic as well as highlight
// and enlarge (similar to the card row feature) certain pairings", and the
// legends on the legend distribution's pie). Plain ESM shared by the store
// (server/state.js, which applies the focus cue), the scenes and the panel,
// so every one of them names a highlighted row the same way.
//
// A highlight names what it highlights, never where it sits: a standings row
// by its player (the rows re-sort as results come in), a pairings table by
// its number (the Tournament platform's feed rewrites the rows as tables
// finish), a legend by its slice key (web/shared/legendstats.js). Each
// graphic keeps up to FOCUS_MAX of them, the newest last.
import { STANDINGS_PER_PAGE, standingsView } from './standings.js';

export const FOCUS_MAX = 8;
export const PAIRINGS_PER_PAGE = 32;

// A player as the standings highlight knows them: the name with case and
// spacing ironed out, and nothing else changed, so a name in any script
// keeps its letters.
export const playerKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 40);

// The highlight list after one press. on: true adds the key (moving it to
// the newest place), false takes it out, undefined flips it; only makes it
// the one highlight (the step arrows); clear empties the list.
export function nextFocus(list, key, { on, only = false, clear = false } = {}) {
  const now = Array.isArray(list) ? list.filter((k) => k !== key) : [];
  if (clear) return [];
  if (!key) return now;
  if (only) return [key];
  const add = on === undefined ? !(list || []).includes(key) : Boolean(on);
  return add ? [...now, key].slice(-FOCUS_MAX) : now;
}

// Where a player sits on the standings: their group and the page of it, so
// highlighting a player turns the graphic to them. null when no row is
// theirs.
export function standingsPlaceOf(standings, key) {
  const rows = (standings && standings.rows) || [];
  const row = rows.find((r) => r && playerKey(r.name) === key);
  if (!row) return null;
  const group = row.group || '';
  const view = standingsView(standings, { group, page: 1 });
  const i = view.rows.indexOf(row);
  return { group, page: Math.min(view.pages, Math.floor(i / STANDINGS_PER_PAGE) + 1) };
}

// The pairings page a table is on, or null when no row has that number.
export function pairingsPageOf(rows, table) {
  const i = (rows || []).findIndex((r) => r && r.table === table);
  return i < 0 ? null : Math.floor(i / PAIRINGS_PER_PAGE) + 1;
}
