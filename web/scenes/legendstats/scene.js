import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, animEnabled } from '../../stage/seekclock.js';
import { chainLoad, clearArt } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { FocusBlend } from '../../stage/focusblend.js';
import {
  ROLL_SPEEDS, TABLE_ROW_PX, TABLE_VIEW_ROWS, legendSlices, otherTitle, rollAt, rollElapsed, sliceKey, slicePath, splitLegend, tableOverflow,
} from '../../shared/legendstats.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);
// The pie sweeps in on --p; the rows come in on --r and leave on --o, the
// standings' clocks (scene.css). Wall-clock seek clocks like --t, so an
// occluded browser source lands on the settled frame, never a half-drawn one.
const sweep = new SeekClock(root, '--p', 1100);
const rowsIn = new SeekClock(root, '--r', 900);
const rowsOut = new SeekClock(root, '--o', 380);
const ENTER_MS = 900;
const TURN_IN_MS = 720;
// The highlight: slices, icons and rows all move on one clock.
const focus = new FocusBlend(root, 450);

// The pie's own units (its SVG viewBox is 680 square): the centre, the
// radius, and the icon on a slice, 62% of the way out and as large as the
// slice has room for, or none under 40. A slice too thin for one still gets
// its icon while highlighted, further out where the neighbours are wider.
const C = 340;
const R = 336;
const MARK_AT = 0.62;
const MARK_MIN = 40;
const MARK_MAX = 104;
const THIN_AT = 0.8;
const THIN_SIZE = 84;
const SVG = 'http://www.w3.org/2000/svg';

const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A legend's face: the round icon cutout, then the holder art, then its
// card's painting. With none of them known the circle carries the
// champion's initial instead.
function portrait(s) {
  const steps = [];
  if (s.legendSlug) {
    steps.push({ src: `/legendart/icon/${s.legendSlug}.webp`, cls: 'tier-icon' });
    steps.push({ src: `/legendart/hero/${s.legendSlug}.png`, cls: 'tier-hero' });
  }
  if (s.legendCardId) steps.push({ src: `/cardart/thumb/${s.legendCardId}.webp`, cls: 'tier-card' });
  if (!steps.length) {
    return Object.assign(document.createElement('span'), { className: 'lt', textContent: splitLegend(s.legend).champion.slice(0, 1).toUpperCase() });
  }
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  clearArt(img);
  chainLoad(img, steps);
  return img;
}

// What is drawn, by slice key: the slice's path, its icon (when it has
// one) and its row. The highlight finds its elements here.
let drawn = new Map();

function paintPie(slices) {
  drawn = new Map();
  const paths = slices.map((s) => {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', slicePath(C, C, R, s.start, s.end));
    path.style.fill = s.color;
    // The unit vector through the slice's middle: the way it comes out.
    const mid = (s.start + s.end) / 2;
    path.style.setProperty('--ux', Math.sin(mid * 2 * Math.PI).toFixed(4));
    path.style.setProperty('--uy', (-Math.cos(mid * 2 * Math.PI)).toFixed(4));
    drawn.set(sliceKey(s), { path, mark: null, row: null });
    return path;
  });
  $('pie').replaceChildren(...paths);
  const marks = [];
  for (const s of slices) {
    const art = s.legendSlug || s.legendCardId;
    if (!s.other && !art) continue;
    const span = s.end - s.start;
    const mid = (s.start + s.end) / 2;
    let size;
    let rc;
    let thin = false;
    if (span > 0.999) {
      // One legend is the whole pie: its face in the middle.
      size = MARK_MAX * 1.5;
      rc = 0;
    } else {
      rc = R * MARK_AT;
      const room = Math.min(2 * rc * Math.sin(Math.min(span, 0.5) * Math.PI) * 0.72, (R - rc) * 1.5, MARK_MAX);
      if (room >= MARK_MIN) size = Math.round(room);
      else if (s.other) continue;
      else {
        thin = true;
        size = THIN_SIZE;
        rc = R * THIN_AT;
      }
    }
    const ux = Math.sin(mid * 2 * Math.PI);
    const uy = -Math.cos(mid * 2 * Math.PI);
    const mark = document.createElement('div');
    mark.className = `mark${thin ? ' thin' : ''}${s.other ? ' other' : ''}`;
    mark.style.setProperty('--x', (C + rc * ux - size / 2).toFixed(1));
    mark.style.setProperty('--y', (C + rc * uy - size / 2).toFixed(1));
    mark.style.setProperty('--sz', String(size));
    mark.style.setProperty('--a', mid.toFixed(4));
    mark.style.setProperty('--ux', ux.toFixed(4));
    mark.style.setProperty('--uy', uy.toFixed(4));
    mark.style.setProperty('--rc', rc.toFixed(1));
    // Other's circle counts the legends folded into it.
    if (s.other) mark.append(Object.assign(document.createElement('span'), { className: 'lt', textContent: s.legends ? `+${s.legends}` : '?' }));
    else mark.append(portrait(s));
    drawn.get(sliceKey(s)).mark = mark;
    marks.push(mark);
  }
  $('marks').replaceChildren(...marks);
}

function cell(cls, value, sub, none = false) {
  const td = document.createElement('div');
  td.className = cls;
  td.append(
    Object.assign(document.createElement('div'), { className: `v${none ? ' none' : ''}`, textContent: value }),
    Object.assign(document.createElement('div'), { className: 's', textContent: sub }),
  );
  return td;
}

// Each row's place down the box, 0 to 1: where its slice of the in and out
// clocks starts (scene.css). The rows come in one after another from the
// top of the box as it stands; rows above or below it take the first and
// last places.
function stagger(px) {
  const rows = [...$('rows').children];
  const first = Math.floor(px / TABLE_ROW_PX);
  const span = Math.max(1, Math.min(TABLE_VIEW_ROWS, rows.length) - 1);
  rows.forEach((row, i) => row.style.setProperty('--pos', String(Math.min(1, Math.max(0, (i - first) / span)))));
}

function paintRows(slices, showRate) {
  $('table').classList.toggle('no-rate', !showRate);
  $('view').style.setProperty('--vr', String(Math.max(1, Math.min(TABLE_VIEW_ROWS, slices.length))));
  $('rows').replaceChildren(...slices.map((s) => {
    const row = document.createElement('div');
    row.className = `row${s.other ? ' other' : ''}`;
    row.style.setProperty('--c', s.color);
    const ic = document.createElement('div');
    ic.className = 'ic';
    // Other's circle counts the legends folded into it; with none folded it
    // is players the list does not name.
    if (s.other) ic.append(Object.assign(document.createElement('span'), { className: 'lt', textContent: s.legends ? `+${s.legends}` : '?' }));
    else ic.append(portrait(s));
    const { champion, title } = s.other ? { champion: s.legend, title: otherTitle(s) } : splitLegend(s.legend);
    const name = document.createElement('div');
    name.className = 'name';
    name.append(
      Object.assign(document.createElement('div'), { className: 'ch', textContent: champion }),
      Object.assign(document.createElement('div'), { className: 'tt', textContent: title }),
    );
    const rate = s.winRate;
    row.append(
      ic,
      name,
      cell('num', pct(s.share), s.players ? plural(s.players, 'player') : ''),
      cell('num rate', rate === null ? '–' : pct(rate), s.wins || s.losses ? `${s.wins}-${s.losses}` : '', rate === null),
    );
    const d = drawn.get(sliceKey(s));
    if (d) d.row = row;
    return row;
  }));
}

// --- the highlight ---
//
// The keys the state highlights, and which of them are on the pie now. The
// newest one that is drawn is the row the table brings into view.
let focusKeys = [];
let focusRow = -1;

function findFocusRow() {
  const keys = [...drawn.keys()];
  const newest = [...focusKeys].reverse().find((k) => drawn.has(k));
  focusRow = newest ? keys.indexOf(newest) : -1;
}

function applyFocus(animate) {
  const lit = new Set(focusKeys.filter((k) => drawn.has(k)));
  const any = lit.size > 0;
  const poses = [];
  const keys = [...drawn.keys()];
  for (const [key, { path, mark, row }] of drawn) {
    const on = lit.has(key) ? 1 : 0;
    const off = any && !on ? 1 : 0;
    poses.push([path, { b: on, s: off }]);
    if (mark) poses.push([mark, { b: on, s: off }]);
    if (row) poses.push([row, { h: on, d: off }]);
  }
  // The slices in this move are drawn last, over their neighbours, and cast
  // their shadow; the rest keep the pie's order.
  const was = new Set([...drawn].filter(([, d]) => d.path.classList.contains('lit')).map(([k]) => k));
  const top = keys.filter((k) => lit.has(k) || (animate && was.has(k)));
  for (const [key, d] of drawn) {
    const on = top.includes(key);
    d.path.classList.toggle('lit', on);
    if (d.mark) d.mark.classList.toggle('lit', on);
  }
  if (top.length) $('pie').append(...keys.filter((k) => !top.includes(k)).map((k) => drawn.get(k).path), ...top.map((k) => drawn.get(k).path));
  findFocusRow();
  focus.move(poses, animate).then(() => {
    // Landed: a slice that went back to the pie stops casting its shadow.
    for (const [key, d] of drawn) {
      const on = lit.has(key);
      d.path.classList.toggle('lit', on);
      if (d.mark) d.mark.classList.toggle('lit', on);
    }
  });
}

// --- the roll ---
//
// Where the rows sit comes out of the roll's wall clock (the state's
// roll, legendstats.js rollAt), so every browser source agrees and one
// that reloads comes back where the others are. While the table is not
// rolling, a highlighted row is brought into the box instead. A change of
// either (a highlight, a pause, a restart, new rows) glides the rows from
// where they are to where they now belong rather than jumping.
const GLIDE_MS = 700;
const view = $('view');
const rowsEl = $('rows');
let roll = null;
let rollCfg = { speed: ROLL_SPEEDS.normal, loop: true };
let overflow = 0;
let offset = 0;
let glide = null;
let rollTimer = null;
let airing = false;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

function rollNow(now) {
  return rollAt(rollElapsed(roll, now), overflow, { ...rollCfg, jump: !animEnabled() });
}

function target(now) {
  if (!(overflow > 0)) return 0;
  const base = rollNow(now).offset;
  if ((roll && roll.state === 'play') || focusRow < 0) return base;
  // The newest highlighted row: kept where it is when the box shows it
  // clear of the faded edges, otherwise centred in the box.
  const box = TABLE_VIEW_ROWS * TABLE_ROW_PX;
  const top = focusRow * TABLE_ROW_PX;
  if (top >= base + 40 && top + TABLE_ROW_PX <= base + box - 40) return base;
  return Math.min(overflow, Math.max(0, top - (box - TABLE_ROW_PX) / 2));
}

function write(px) {
  offset = px;
  rowsEl.style.setProperty('--scroll', px.toFixed(1));
  view.style.setProperty('--ft', Math.min(1, px / 40).toFixed(3));
  view.style.setProperty('--fb', Math.min(1, Math.max(0, overflow - px) / 40).toFixed(3));
}

function tick() {
  clearTimeout(rollTimer);
  rollTimer = null;
  const now = Date.now();
  const to = target(now);
  let px = to;
  if (glide) {
    const k = Math.min(1, (now - glide.t0) / GLIDE_MS);
    px = glide.from + (to - glide.from) * ease(k);
    if (k >= 1) glide = null;
  }
  write(px);
  // Nothing to keep moving while the graphic is off air: it is worked out
  // afresh when it comes on.
  if (!airing || !(overflow > 0)) return;
  const at = rollNow(now);
  const rolling = roll && roll.state === 'play';
  const next = glide || (rolling && at.moving) ? 40 : rolling ? Math.min(500, at.next) : Infinity;
  if (next < Infinity) rollTimer = setTimeout(tick, Math.max(40, next));
}

// A new target: glide there from where the rows are, or land at once.
function steer(animate) {
  const to = target(Date.now());
  if (animate && animEnabled() && Math.abs(to - offset) > 1) glide = { from: offset, t0: Date.now() };
  else glide = null;
  tick();
}

// What the state asks for, and what the frame shows. They differ only while
// a turn plays: the turn paints whatever is wanted once the old rows have
// left, so a refresh or a second change mid-turn is never lost and never
// cuts the turn short.
let want = null;
let shownKey = null;
let shownEmpty = true;
let turning = false;
let turnToken = 0;

// The panel and the "no legend data yet" line swap here, with the content,
// never ahead of it: data arriving while the graphic is up must not bare an
// empty panel before its pie is drawn, and data going away must not cut to
// the line before the rows have left.
function paint() {
  if (!want || shownKey === want.key) return;
  overflow = tableOverflow(want.slices.length);
  glide = null;
  paintPie(want.slices);
  paintRows(want.slices, want.showRate);
  applyFocus(false);
  const at = target(Date.now());
  stagger(at);
  write(at);
  shownEmpty = !want.slices.length;
  $('empty').classList.toggle('hidden', !shownEmpty);
  $('panel').classList.toggle('hidden', shownEmpty);
  shownKey = want.key;
}

function settle() {
  turnToken += 1;
  turning = false;
  for (const clock of [sweep, rowsIn, rowsOut]) clock.stop();
  rowsOut.seek(0);
  rowsIn.seek(1);
  sweep.seek(1);
}

async function turnOver() {
  const token = ++turnToken;
  turning = true;
  while (want && shownKey !== want.key) {
    for (const clock of [sweep, rowsIn]) { clock.stop(); clock.seek(1); }
    const wasEmpty = shownEmpty;
    // With only the empty-state line up there is nothing to take out.
    if (!wasEmpty) {
      await rowsOut.play({ from: 0, to: 1 });
      if (token !== turnToken) return;
    }
    paint();
    tick();
    // Empty before and after (a switch flipped with no data yet): the line
    // stays as it is. Otherwise the new content comes in; the in clocks are
    // wound back in this same tick, so no frame shows it settled first.
    if (wasEmpty && shownEmpty) { rowsOut.seek(0); continue; }
    rowsIn.duration = TURN_IN_MS;
    const landed = Promise.all([sweep.play({ from: 0, to: 1 }), rowsIn.play({ from: 0, to: 1 })]);
    rowsOut.seek(0);
    await landed;
    if (token !== turnToken) return;
  }
  turning = false;
}

let shownVisible = null;

const params = initStage({
  scene: 'legendstats',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.legendstats;
    const stats = bank.event.legendStats || { rows: [] };
    const { slices, total, legends } = legendSlices(stats, { slices: scene.slices, top: scene.top });
    const showRate = scene.winRate !== false;
    const key = JSON.stringify([slices.map((s) => [s.legend, s.legendSlug, s.legendCardId, s.share, s.players, s.winRate, s.wins, s.losses, s.color, s.legends || 0, s.ones || false, s.unlisted || false]), showRate]);
    want = { slices, showRate, key };

    setText($('sub'), [bank.event.name, stats.label, total ? plural(total, 'player') : '', legends > 1 ? `${legends} legends` : ''].filter(Boolean).join(' · '));
    // The note says how the win rates were counted, so it goes with them.
    setText($('foot'), showRate ? stats.note || '' : '');

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);

    // The roll and the highlight as the state has them now.
    const focusChanged = JSON.stringify(scene.focus || []) !== JSON.stringify(focusKeys);
    const rollChanged = JSON.stringify([scene.roll, scene.speed, scene.loop]) !== JSON.stringify([roll, rollCfg.name, rollCfg.loop]);
    roll = scene.roll || null;
    rollCfg = { speed: ROLL_SPEEDS[scene.speed] || ROLL_SPEEDS.normal, name: scene.speed, loop: scene.loop !== false };
    focusKeys = Array.isArray(scene.focus) ? scene.focus : [];
    airing = visible;

    if (first || shownKey === null) {
      // The first frame: the data as it stands, settled.
      settle();
      paint();
      tick();
    } else if (visible && shownVisible !== true) {
      // Coming on: the pie sweeps round and the rows come in.
      settle();
      paint();
      if (focusChanged) applyFocus(false);
      steer(false);
      stagger(offset);
      rowsIn.duration = ENTER_MS;
      sweep.play({ from: 0, to: 1 });
      rowsIn.play({ from: 0, to: 1 });
    } else if (!visible) {
      // Off air (or fading out): a turn already playing finishes under the
      // fade; otherwise the frame just follows the state for next time.
      if (!turning) paint();
      if (focusChanged && !turning) applyFocus(false);
      tick();
    } else if (key !== shownKey && !turning) {
      // On air and the data changed (another group, the win rate switched):
      // the rows leave, the pie goes, both come back with the new numbers.
      turnOver();
    } else if (!turning) {
      if (focusChanged) applyFocus(true);
      if (focusChanged || rollChanged) steer(true);
    }

    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
