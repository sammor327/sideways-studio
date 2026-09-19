// Results ticker (2026-09-19, Sam: "an ongoing ticker that fits at the
// bottom of the screen, shows the ongoing results of pairings and matches
// ... name, legend icon, and the result of the game ... rotate and animate
// through them all"). The round's tables (event.pairings) along the bottom
// of the frame, or of the game area when an in-game overlay is up, a page
// at a time; every `hold` seconds each table rolls over to the next page's
// like a cube, one after another from the left (web/shared/ticker.js).
//
// With the Tournament platform keeping the pairings up to date on air, a
// result lands in place while its table is on show (and pulses once), and
// with only the unfinished tables showing, a table that finishes rolls away.
//
// State: event.pairings {rows, label} and scenes.ticker {show, per, hold,
// legends, dock, title}.
import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, animEnabled, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { resolveLook, lookVars } from '../../shared/look.js';
import {
  LABEL_W, holdMs, rollAt, tableResult, tablesPerPage, tickerLabel, tickerNote, tickerPages, tickerRows, tickerRun, tickerSlot, tickerSpot,
} from '../../shared/ticker.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const bar = $('bar');
const track = $('track');
const prog = $('prog');
const inOut = new SeekClock(root, '--t', 700);

// A table is never drawn wider than this: one table on a full-width bar
// sits in the middle instead of stretching its names a frame apart.
const SLOT_MAX = 960;
// The tables roll in this long after the bar starts wiping in.
const ENTER_DELAY = 260;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// --- one table ---

// The legend icon: Rift Registry's cutout (the icon tier), then the face
// crop the standings use, then the legend card's painting.
function iconSteps(p) {
  const steps = [];
  if (p.legendSlug) {
    steps.push({ src: `/legendart/icon/${p.legendSlug}.webp`, cls: 'icon-tier' });
    steps.push({ src: `/legendart/hero/${p.legendSlug}.png` });
  }
  if (p.legendCardId) steps.push({ src: `/cardart/thumb/${p.legendCardId}.webp`, cls: 'crop-legend' });
  return steps;
}

function icon(p) {
  const box = el('span', 'ic');
  const img = el('img', 'art hidden');
  img.alt = '';
  img.draggable = false;
  const steps = iconSteps(p);
  if (steps.length) chainLoad(img, steps); else { clearArt(img); box.classList.add('none'); }
  box.append(img);
  return box;
}

const SIDES = { l: 'left', r: 'right' };
const sideMark = (res, where) => (res.win ? (res.win === SIDES[where] ? 'won' : 'lost') : '');

function side(p, where, res) {
  const mark = sideMark(res, where);
  const cell = el('div', `pl ${where}${mark ? ` ${mark}` : ''}`);
  cell.append(icon(p), el('span', 'nm', p.name || 'TBD'));
  return cell;
}

// The games (the winner's in the accent, the loser's dimmed), VS before any
// are in, and the state under them: FINAL, DRAW or LIVE.
function middle(res) {
  const mid = el('div', `mid ${res.kind}`);
  const sc = el('div', 'sc');
  const g = (v, who) => el('span', `g${res.win ? (res.win === who ? ' w' : ' l') : ''}`, v);
  if (res.kind === 'vs') sc.textContent = 'VS';
  else if (!res.a && !res.b) sc.textContent = '–';
  else sc.append(g(res.a, 'left'), el('span', 'dash', '–'), g(res.b, 'right'));
  mid.append(sc, el('div', 'st', { final: 'Final', draw: 'Draw', live: 'Live' }[res.kind] || ''));
  return mid;
}

function tableEl(r) {
  const res = tableResult(r);
  const div = el('div', 'tbl');
  const tb = el('div', `tb${r.table ? '' : ' none'}`);
  tb.append(el('span', 'k', 'Table'), el('span', 'n', r.table ? String(r.table) : ''));
  div.append(tb, side(r.left || {}, 'l', res), middle(res), side(r.right || {}, 'r', res));
  return div;
}

// Which table a row is (its number and both names), what is drawn of it,
// and what its result says: a page turns when the tables change, a table
// is redrawn in place when only its data does, and pulses when its result
// does.
const idOf = (r) => (r ? `${r.table}|${(r.left && r.left.name) || ''}|${(r.right && r.right.name) || ''}` : '');
const artOf = (p) => `${(p && p.legendSlug) || ''}|${(p && p.legendCardId) || ''}`;
const resOf = (r) => (r ? JSON.stringify(tableResult(r)) : '');

// A table whose players and legends are unchanged keeps its icons (no
// reload, no flash) and swaps its marks and its result; anything else is
// drawn again.
function patchFace(face, before, after) {
  const box = face.firstElementChild;
  if (!box || !before || !after || artOf(before.left) !== artOf(after.left) || artOf(before.right) !== artOf(after.right)) {
    face.replaceChildren(...(after ? [tableEl(after)] : []));
    return face.querySelector('.mid');
  }
  const res = tableResult(after);
  for (const where of ['l', 'r']) {
    const cell = box.querySelector(`.pl.${where}`);
    const mark = sideMark(res, where);
    cell.className = `pl ${where}${mark ? ` ${mark}` : ''}`;
  }
  const mid = middle(res);
  box.querySelector('.mid').replaceWith(mid);
  return mid;
}

// --- the slots: one per table on a page, each a cube with two faces ---

let slots = [];
let layoutKey = '';

function buildSlots(count, width) {
  slots = Array.from({ length: count }, () => {
    const node = el('div', 'slot still');
    const a = el('div', 'face a');
    const b = el('div', 'face b');
    node.append(a, b);
    return { node, a, b };
  });
  track.replaceChildren(...slots.map((s) => s.node));
  root.style.setProperty('--sw', String(width));
}

// What the faces show now: the rows on the front faces, in slot order, and
// the beat (the wall clock in holds) they went up on.
let shownRows = [];
let shownBeat = null;
// A page turn in flight: { t0, rows }.
let turn = null;

let want = null;
let shownVisible = null;
const beatAt = (now) => Math.floor(now / holdMs(want ? want.hold : 0));

function paintNow(rows, now = Date.now()) {
  turn = null;
  slots.forEach((s, i) => {
    s.a.replaceChildren(...(rows[i] ? [tableEl(rows[i])] : []));
    s.b.replaceChildren();
    s.node.classList.add('still');
    s.node.style.setProperty('--p', '0');
  });
  shownRows = rows.slice(0, slots.length);
  shownBeat = beatAt(now);
}

function startTurn(rows, t0) {
  slots.forEach((s, i) => {
    s.b.replaceChildren(...(rows[i] ? [tableEl(rows[i])] : []));
    s.node.style.setProperty('--p', '0');
    s.node.classList.remove('still');
  });
  turn = { t0, rows: rows.slice(0, slots.length) };
  shownBeat = beatAt(Math.max(t0, Date.now()));
}

// The same tables with new numbers: redrawn in place, a result that changed
// on air pulsing once.
function refresh(rows, live) {
  rows.forEach((r, i) => {
    const before = shownRows[i];
    if (JSON.stringify(before) === JSON.stringify(r)) return;
    const mid = patchFace(slots[i].a, before, r);
    if (live && mid && resOf(before) !== resOf(r)) bump(mid, '--b', 700);
    shownRows[i] = r;
  });
}

function advanceTurn(now) {
  // The machine's clock set back past the turn's start (a time correction)
  // would hold the turn still until it caught up: begin it again instead.
  if (now < turn.t0 - ENTER_DELAY) turn.t0 = now;
  const elapsed = now - turn.t0;
  const anim = animEnabled();
  let done = true;
  slots.forEach((s, i) => {
    const p = anim ? rollAt(elapsed, i) : 1;
    if (p < 1) done = false;
    s.node.style.setProperty('--p', p.toFixed(4));
  });
  if (!done) return;
  // Landed: the new faces become the front ones, drawn flat again.
  slots.forEach((s) => {
    s.a.replaceChildren(...s.b.childNodes);
    s.b.replaceChildren();
    s.node.classList.add('still');
    s.node.style.setProperty('--p', '0');
  });
  shownRows = turn.rows;
  turn = null;
}

// --- the page up, from the wall clock ---

function pageNow(now) {
  const slot = tickerSlot(want.pages.length, want.hold, now);
  const [start, end] = want.pages[slot.index] || [0, 0];
  return { slot, rows: want.rows.slice(start, end) };
}

function tick() {
  if (!want || !slots.length) return;
  const now = Date.now();
  const { slot, rows } = pageNow(now);
  const live = Boolean(shownVisible) && !root.classList.contains('off');

  const turning = want.pages.length > 1 && animEnabled();
  prog.classList.toggle('hidden', !turning);
  if (turning) prog.style.setProperty('--pg', Math.min(1, slot.into / slot.period).toFixed(4));

  if (turn) {
    advanceTurn(now);
    return;
  }
  const ids = rows.map(idOf);
  const same = ids.length === shownRows.length && ids.every((id, i) => id === idOf(shownRows[i]));
  if (same) {
    refresh(rows, live);
    shownBeat = beatAt(now);
    return;
  }
  // Off air there is nothing to watch: the faces just follow.
  if (!live) {
    paintNow(rows, now);
    return;
  }
  // On the beat, the next page rolls in. Between beats the page only turns
  // early when a table on show has left the ticker's tables (it finished,
  // with only the unfinished ones showing); a count changing under a filter
  // moves which page the clock names, and that waits for the beat.
  if (beatAt(now) === shownBeat) {
    const byId = new Map(want.rows.map((r) => [idOf(r), r]));
    const kept = shownRows.map((r) => byId.get(idOf(r)));
    if (kept.every(Boolean)) {
      refresh(kept, live);
      return;
    }
  }
  startTurn(rows, now);
}

setInterval(tick, 40);

// --- the bar: its place, its look, its label ---

// The bar wears the look of the overlay it fits to, unless the ticker has
// its own look switched on under Look (the sponsor plate's rule).
let lookKey = '';
function applyHostLook(theme, host) {
  const own = theme && theme.scenes && theme.scenes.ticker && theme.scenes.ticker.enabled;
  const vars = lookVars(resolveLook(theme, own || !host ? 'ticker' : host));
  const key = JSON.stringify(vars);
  if (key === lookKey) return;
  lookKey = key;
  for (const [name, value] of Object.entries(vars)) bar.style.setProperty(name, value);
}

const params = initStage({
  scene: 'ticker',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const cfg = bank.scenes.ticker || {};
    const all = tickerRows(bank.event.pairings && bank.event.pairings.rows, 'all');
    const rows = tickerRows(all, cfg.show);

    const spot = tickerSpot(bank);
    for (const k of ['x', 'y', 'w', 'h']) bar.style.setProperty(`--${k}`, String(spot[k]));
    applyHostLook(state.theme, spot.host);

    const label = tickerLabel(cfg, bank.event);
    setText($('round'), label.round);
    setText($('title'), label.title);
    root.classList.toggle('no-legends', cfg.legends === false);

    // The note: a filter that leaves nothing, or (on a thumbnail only, since
    // the bar never airs empty) no pairings at all.
    const note = all.length ? tickerNote(cfg.show, all.length, rows.length) : 'No pairings loaded';
    setText($('note'), note);
    $('note').classList.toggle('on', Boolean(note));
    track.classList.toggle('hidden', Boolean(note));

    // As many slots as a page holds, sharing the run (the label box's slant
    // tucks under the first).
    const per = tablesPerPage(cfg.per, tickerRun(spot), rows.length);
    const width = Math.min(SLOT_MAX, Math.floor((spot.w - LABEL_W + 6) / per));
    const visible = params.force || (cfg.visible && all.length > 0);
    const coming = visible && !first && shownVisible === false;
    const nextLayout = `${per}|${width}`;
    const rebuilt = nextLayout !== layoutKey;
    if (rebuilt) {
      layoutKey = nextLayout;
      buildSlots(per, width);
      shownRows = [];
      turn = null;
    }
    want = { rows, pages: tickerPages(rows.length, per), hold: cfg.hold };

    const { rows: page } = pageNow(Date.now());
    if (coming || (rebuilt && !first && shownVisible)) {
      // Coming on air, or a page of a different size on air: the bar's
      // tables roll in from nothing.
      paintNow([]);
      startTurn(page, Date.now() + (coming ? ENTER_DELAY : 0));
    } else if (first || rebuilt || !shownVisible) {
      paintNow(page);
    }

    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !params.force && !cfg.visible);
    $('emptyHint').classList.toggle('on', !params.transparent && !params.force && Boolean(cfg.visible) && !all.length);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
    tick();
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
