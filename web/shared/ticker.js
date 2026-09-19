// The results ticker (2026-09-19, Sam: "an ongoing ticker that fits at the
// bottom of the screen, shows the ongoing results of pairings and matches.
// I want it to showcase name, legend icon, and the result of the game and
// fit at the bottom of the screen similar to the slate's feature tables and
// rotate and animate through them all").
//
// A bar the height of the slate's feature-tables strip: a label box (the
// round over "Results"), then a page of the round's tables (event.pairings,
// the same rows the pairings and the ongoing matches draw). Each table reads
// across like a pairing: its number, the player's legend icon and name, the
// games (the winner's in the accent) or VS while it is played, the opponent
// mirrored. Every `hold` seconds the page turns, each table rolling over to
// the next one like a cube, one after another from the left.
//
// With no in-game overlay up the bar runs along the bottom of the frame.
// With one up (and the Fit switch on, the default) it runs along the bottom
// of the game area that overlay leaves, as wide as it, so it never covers
// the overlay's own chrome: every overlay has something at the bottom of
// the frame (the dual columns' event block, the rows' bottom bar, the arena
// bug, the POV columns).
//
// Shared by the scene (where the bar sits, which tables, which page is up),
// the panel (what the operator is told) and the tests; pure, like
// sponsor.js. Every answer is a function of the bank and the wall clock, so
// the program source, the preview monitor and a thumbnail agree on the page
// that is up.
import { GAME_HOSTS, GAME_WINDOWS } from './gamewindow.js';

// The bar, in 1920x1080 design pixels: the slate's ticker height, and the
// label box at its left.
export const TICKER_H = 74;
export const LABEL_W = 220;

// The game area each in-game overlay leaves (gamewindow.js), and the arena
// bug's: the frame above the bug, 16px clear of its pip track (the bug's top
// edge is at 860).
export const TICKER_WINDOWS = { ...GAME_WINDOWS, arenabug: { x: 0, y: 0, w: 1920, h: 844 } };
// Which overlay the bar fits to when more than one is up: the layouts that
// own the frame first, the arena bug last (the sponsor plate's order).
export const TICKER_HOSTS = [...GAME_HOSTS, 'arenabug'];
const FRAME = { x: 0, y: 0, w: 1920, h: 1080 };

export function tickerHost(bank) {
  const scenes = (bank && bank.scenes) || {};
  return TICKER_HOSTS.find((key) => scenes[key] && scenes[key].visible) || '';
}

// Where the bar sits: { host, x, y, w, h }. host is the overlay it fits to
// and takes its look from ('' = the frame, in the ticker's own look).
export function tickerSpot(bank) {
  const cfg = (bank && bank.scenes && bank.scenes.ticker) || {};
  const host = cfg.dock === false ? '' : tickerHost(bank);
  const win = TICKER_WINDOWS[host] || FRAME;
  return { host, x: win.x, y: win.y + win.h - TICKER_H, w: win.w, h: TICKER_H };
}

// The width the tables share: the bar less its label box.
export const tickerRun = (spot) => Math.max(0, spot.w - LABEL_W);

// The bar's footprint while it is up in this bank (switched on, with tables
// to show; with none it never airs), or null. The lower third rises above
// it (web/shared/anchor.js).
export function tickerBox(bank) {
  const cfg = bank && bank.scenes && bank.scenes.ticker;
  if (!cfg || !cfg.visible) return null;
  const rows = bank.event && bank.event.pairings && bank.event.pairings.rows;
  if (!tickerRows(rows, 'all').length) return null;
  const { x, y, w, h } = tickerSpot(bank);
  return { x, y, w, h };
}

// Which tables: every one, the ones still being played, or the finished
// ones. A table is finished once its result is in (a typed "= 2-1" sets a
// winner with no state). Rows with no name at all are left out.
export const TICKER_SHOWS = ['all', 'playing', 'done'];
export const tableDone = (r) => r.status === 'done' || Boolean(r.winner);
export function tickerRows(rows, show) {
  const named = (Array.isArray(rows) ? rows : []).filter((r) => r && ((r.left && r.left.name) || (r.right && r.right.name)));
  if (show === 'playing') return named.filter((r) => !tableDone(r));
  if (show === 'done') return named.filter(tableDone);
  return named;
}

// What the middle of a table says: { kind, a, b, win }. kind is 'final'
// (a and b the games each side won, or W and L for a win with no games
// reported, win the side that took it), 'draw', 'live' (the games so far,
// mid-match) or 'vs' (nothing in yet). A finished table with no winner
// named (both dropped, say) is final with no games.
export function tableResult(r) {
  const score = Array.isArray(r.score) ? r.score : [];
  const a = Number(score[0]) || 0;
  const b = Number(score[1]) || 0;
  const games = a > 0 || b > 0;
  if (tableDone(r)) {
    if (r.winner === 'draw') return { kind: 'draw', a: games ? String(a) : '', b: games ? String(b) : '', win: '' };
    if (r.winner === 'left' || r.winner === 'right') {
      if (games) return { kind: 'final', a: String(a), b: String(b), win: r.winner };
      return { kind: 'final', a: r.winner === 'left' ? 'W' : 'L', b: r.winner === 'right' ? 'W' : 'L', win: r.winner };
    }
    return { kind: 'final', a: '', b: '', win: '' };
  }
  if (games) return { kind: 'live', a: String(a), b: String(b), win: '' };
  return { kind: 'vs', a: '', b: '', win: '' };
}

// Tables a page: the operator's number (1 to 4), or with 0 as many as the
// run takes at SLOT_MIN each (the width a table needs for a ten-letter
// name a side at full size), never more than there are tables.
export const TICKER_PER_MAX = 4;
export const SLOT_MIN = 620;
export function tablesPerPage(per, run, count) {
  const n = Number(per) >= 1
    ? Math.min(Math.trunc(Number(per)), TICKER_PER_MAX)
    : Math.max(1, Math.min(TICKER_PER_MAX, Math.floor(run / SLOT_MIN)));
  return Math.max(1, Math.min(n, count || 1));
}

// The pages: `count` tables in as few pages of at most `per` as it takes,
// as even as they go (seven at three a page are 3, 2, 2, never 3, 3, 1).
// Each page is [start, end) into the rows.
export function tickerPages(count, per) {
  if (!(count > 0)) return [];
  const pages = Math.ceil(count / Math.max(1, per));
  const base = Math.floor(count / pages);
  const extra = count % pages;
  const out = [];
  let start = 0;
  for (let i = 0; i < pages; i += 1) {
    const n = base + (i < extra ? 1 : 0);
    out.push([start, start + n]);
    start += n;
  }
  return out;
}

// Seconds a page holds.
export const HOLD_MIN = 3;
export const HOLD_MAX = 30;
export const HOLD_DEFAULT = 6;
export const holdMs = (sec) => Math.max(HOLD_MIN, Math.min(HOLD_MAX, Math.trunc(Number(sec)) || HOLD_DEFAULT)) * 1000;

// Which page is up at wall-clock ms `now`: { index, into, period }, into
// being how long it has been up. The pages turn on the same beat in every
// copy of the source; a single page never turns.
export function tickerSlot(pages, holdSec, now) {
  const period = holdMs(holdSec);
  if (!(pages > 1)) return { index: 0, into: 0, period };
  const k = Math.floor(now / period);
  return { index: ((k % pages) + pages) % pages, into: now - k * period, period };
}

// The turn: each table rolls over in ROLL_MS, the next one STAGGER_MS after
// the one before it. Progress 0 to 1 of table `i`, `elapsed` ms after the
// turn began, eased at both ends.
export const ROLL_MS = 620;
export const STAGGER_MS = 120;
export function rollAt(elapsed, i) {
  const t = Math.min(1, Math.max(0, (elapsed - i * STAGGER_MS) / ROLL_MS));
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}
export const rollTotal = (slots) => ROLL_MS + Math.max(0, slots - 1) * STAGGER_MS;

// The label box: its word (the operator's, else "Results", or "Still
// playing" while only the unfinished tables show) and the round over it
// (the pairings' own label, else the round title).
export function tickerLabel(cfg, event) {
  const c = cfg || {};
  const ev = event || {};
  const title = c.title || (c.show === 'playing' ? 'Still playing' : 'Results');
  const round = (ev.pairings && ev.pairings.label) || ev.roundTitle || '';
  return { title, round };
}

// The line the bar shows when its filter leaves no table but the round has
// some: everything finished, or nothing yet.
export function tickerNote(show, total, shown) {
  if (!total || shown) return '';
  if (show === 'playing') return 'Every table has finished';
  if (show === 'done') return 'Results come in as tables finish';
  return '';
}

// Everything the panel says about the ticker as a bank has it: how many
// tables it turns through, how many at a time, how many pages and how long
// a full turn takes, and what it fits to.
export function tickerPlan(bank) {
  const cfg = (bank && bank.scenes && bank.scenes.ticker) || {};
  const all = (bank && bank.event && bank.event.pairings && bank.event.pairings.rows) || [];
  const rows = tickerRows(all, cfg.show);
  const spot = tickerSpot(bank);
  const per = tablesPerPage(cfg.per, tickerRun(spot), rows.length);
  const pages = tickerPages(rows.length, per).length;
  return { total: tickerRows(all, 'all').length, tables: rows.length, per, pages, cycleMs: pages * holdMs(cfg.hold), host: spot.host };
}
