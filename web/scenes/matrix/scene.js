import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { FocusBlend } from '../../stage/focusblend.js';
import { TIERS, focusAt, matrixCounts, matrixFoot, matrixView, pctRound, splitLegend } from '../../shared/matrix.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);
// The grid comes in on --r and leaves on --o (scene.css), wall-clock seek
// clocks like --t, so an occluded browser source lands on the settled
// frame, never a half-drawn one.
const rowsIn = new SeekClock(root, '--r', 1100);
const rowsOut = new SeekClock(root, '--o', 380);
const ENTER_MS = 1100;
const TURN_IN_MS = 820;
// The highlight: heads, cells and the readout all move on one clock.
const focus = new FocusBlend(root, 450);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const record = (c) => `${c.wins}-${c.losses}${c.draws ? `-${c.draws}` : ''}`;
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// The key's five tiers, once: they never change.
$('tiers').replaceChildren(...TIERS.map((t) => {
  const sw = el('span', 'sw');
  sw.style.setProperty('--c', t.color);
  sw.append(el('i'), t.label);
  return sw;
}));

// --- the metrics ---
//
// The panel is 1760 x 850 design pixels; the key and the readout take its
// bottom strip. Everything else follows the number of legends: the cells
// share what is left (at most 220 x 120), the type follows the cells, and a
// grid of ten or more takes narrower heads to give the cells the room.
const PANEL_W = 1760;
const PANEL_H = 850;
const TOP = 30;
const KEY_H = 70;
function metrics(n, { overall, records }) {
  const big = n > 9;
  const rowHeadW = big ? 300 : 340;
  const colHeadH = big ? 100 : 120;
  const gap = n > 10 ? 5 : 6;
  const ow = overall ? (big ? 150 : 168) : 0;
  const og = overall ? 22 : 0;
  const availW = PANEL_W - 80 - rowHeadW - ow - og;
  const availH = PANEL_H - TOP - colHeadH - KEY_H - 16;
  const cw = Math.min(220, Math.floor((availW - gap * (n - 1)) / n));
  const ch = Math.min(120, Math.floor((availH - gap * (n - 1)) / n));
  const gw = rowHeadW + n * cw + (n - 1) * gap + og + ow;
  const gh = colHeadH + n * ch + (n - 1) * gap;
  return {
    rowHeadW, colHeadH, gap, ow, og, cw, ch, gw, gh,
    gx: Math.round((PANEL_W - gw) / 2),
    gy: Math.round(TOP + Math.max(0, (PANEL_H - TOP - KEY_H - 16 - gh) / 2)),
    // The win rate, the record under it, the faces and the names.
    pf: Math.round(Math.min(ch * (records ? 0.42 : 0.52), cw * (records ? 0.27 : 0.32), records ? 36 : 44)),
    sf: Math.max(11, Math.round(Math.min(ch * 0.42, cw * 0.27, 36) * 0.45)),
    fsRow: Math.min(ch - 10, 60),
    fsCol: Math.min(cw - 18, colHeadH - 44, 64),
    rf: Math.round(Math.min(28, Math.max(16, ch * 0.34))),
    tf: ch >= 60 ? 13 : 0,
    cf: Math.round(Math.min(16, Math.max(12, cw * 0.13))),
  };
}

// A legend's face: the round icon cutout, then the holder art, then its
// card's painting. With none of them known the circle carries the
// champion's initial instead.
function face(l, size) {
  const box = el('div', 'face');
  box.style.setProperty('--fs', String(size));
  const steps = [];
  if (l.legendSlug) {
    steps.push({ src: `/legendart/icon/${l.legendSlug}.webp`, cls: 'tier-icon' });
    steps.push({ src: `/legendart/hero/${l.legendSlug}.png`, cls: 'tier-hero' });
  }
  if (l.legendCardId) steps.push({ src: `/cardart/thumb/${l.legendCardId}.webp`, cls: 'tier-card' });
  if (!steps.length) {
    box.append(el('span', 'lt', splitLegend(l.legend).champion.slice(0, 1).toUpperCase()));
    return box;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  clearArt(img);
  chainLoad(img, steps);
  box.append(img);
  return box;
}

function place(node, { x, y, w, h, pos }) {
  node.style.setProperty('--x', String(x));
  node.style.setProperty('--y', String(y));
  node.style.setProperty('--w', String(w));
  node.style.setProperty('--hh', String(h));
  node.style.setProperty('--pos', String(Math.round(pos * 1000) / 1000));
  return node;
}

// What is drawn, for the highlight to find: the heads by axis index, the
// cells by row and column, the Overall cells by row.
let drawn = { rows: [], cols: [], cells: [], overall: [], view: null };

function paintGrid(view, opts) {
  const n = view.axis.length;
  const m = metrics(n, opts);
  const grid = $('grid');
  grid.classList.toggle('no-records', !opts.records);
  for (const [k, v] of Object.entries({ gx: m.gx, gy: m.gy, gw: m.gw, gh: m.gh, pf: m.pf, sf: m.sf, rf: m.rf, tf: m.tf || 13, cf: m.cf })) {
    grid.style.setProperty(`--${k}`, String(v));
  }
  const span = Math.max(1, n - 1);
  const colX = (j) => m.rowHeadW + j * (m.cw + m.gap);
  const rowY = (i) => m.colHeadH + i * (m.ch + m.gap);
  const ox = m.rowHeadW + n * (m.cw + m.gap) - m.gap + m.og;
  // Two legends of one champion (Master Yi) would read alike on the axes,
  // so theirs carry the title too.
  const champs = view.axis.map((l) => splitLegend(l.legend).champion.toLowerCase());
  const twin = (i) => champs.filter((c) => c === champs[i]).length > 1;
  const out = [];
  drawn = { rows: [], cols: [], cells: [], overall: [], view };

  view.axis.forEach((l, j) => {
    const { champion, title } = splitLegend(l.legend);
    const head = place(el('div', 'colhead'), { x: colX(j), y: 0, w: m.cw, h: m.colHeadH, pos: (j / span) * 0.3 });
    head.append(face(l, m.fsCol), el('div', 'nm', twin(j) && title ? title : champion));
    head.title = l.legend;
    drawn.cols.push(head);
    out.push(head);
  });
  if (opts.overall) out.push(place(el('div', 'ohead', 'Overall'), { x: ox, y: 0, w: m.ow, h: m.colHeadH, pos: 0.3 }));

  view.axis.forEach((l, i) => {
    const { champion, title } = splitLegend(l.legend);
    const head = place(el('div', 'rowhead'), { x: 0, y: rowY(i), w: m.rowHeadW, h: m.ch, pos: (i / span) * 0.45 });
    const name = el('div', 'name');
    name.append(
      el('div', 'ch', twin(i) && title && !m.tf ? `${champion}, ${title}` : champion),
      el('div', 'tt', m.tf ? title : ''),
    );
    head.append(face(l, m.fsRow), name);
    drawn.rows.push(head);
    out.push(head);
    const row = [];
    view.cells[i].forEach((c, j) => {
      const cell = place(el('div', 'cell'), { x: colX(j), y: rowY(i), w: m.cw, h: m.ch, pos: (i + j) / (2 * span) });
      if (c.self) cell.classList.add('self');
      else if (c.shown) {
        cell.classList.add(`t-${c.tier}`);
        const v = el('div', 'v', String(pctRound(c.pct)));
        v.append(el('small', '', '%'));
        cell.append(v, el('div', 's', record(c)));
      } else {
        cell.classList.add('thin');
        cell.append(el('div', 'v', c.total || c.draws ? record(c) : '–'));
      }
      row.push(cell);
      out.push(cell);
    });
    drawn.cells.push(row);
    if (opts.overall) {
      const o = view.overall[i];
      const cell = place(el('div', 'ocell'), { x: ox, y: rowY(i), w: m.ow, h: m.ch, pos: Math.min(1, (i + n) / (2 * span)) });
      if (o.pct !== null) {
        cell.classList.add(`t-${o.tier}`);
        const v = el('div', 'v', String(pctRound(o.pct)));
        v.append(el('small', '', '%'));
        cell.append(v, el('div', 's', record(o)));
      } else {
        cell.classList.add('thin');
        cell.append(el('div', 'v', '–'));
      }
      drawn.overall.push(cell);
      out.push(cell);
    }
  });
  if (opts.overall) out.push(place(el('div', 'orule'), { x: ox - m.og / 2, y: m.colHeadH, w: 1, h: n * m.ch + (n - 1) * m.gap, pos: 0.5 }));
  grid.replaceChildren(...out);

  // The key: the bare cell's swatch only when the grid has one.
  $('keyThin').classList.toggle('hidden', !view.blank);
  setText($('keyThinText'), `Under ${plural(view.minMatches, 'match', 'matches')}`);
}

// --- the highlight ---
//
// A legend's row, its column, or the cell where they cross (the same
// legend twice lights its row and its column). What is lit rings up and
// the rest dims; the crossing cell lifts and grows. The readout under the
// grid says it in words.
let focusKeys = { row: '', col: '' };
// The highlight the frame shows, apart from the one the state asks for: a
// highlight that arrives while the grid turns over waits for the turn and
// is put up as it lands, never dropped.
let appliedFocus = '';

function readout(view, r, c) {
  const box = $('readout');
  const champ = (i) => splitLegend(view.axis[i].legend).champion;
  let lead = '';
  let more = '';
  if (r >= 0 && c >= 0 && r !== c) {
    const cell = view.cells[r][c];
    lead = `${champ(r)} vs ${champ(c)}`;
    more = cell.shown ? `${pctRound(cell.pct)}% · ${record(cell)}` : cell.total || cell.draws ? `${record(cell)} · too few to call` : 'no matches yet';
  } else if (r >= 0 || c >= 0) {
    const i = r >= 0 ? r : c;
    const o = view.overall[i];
    lead = view.axis[i].legend;
    more = r >= 0 ? (o.pct === null ? 'no decided matches' : `${pctRound(o.pct)}% overall · ${record(o)}`) : 'down the column: each legend against it';
  }
  if (lead) box.replaceChildren(lead, el('span', 'm', more));
}

function applyFocus(animate) {
  const view = drawn.view;
  appliedFocus = JSON.stringify(focusKeys);
  if (!view) return;
  const { r, c } = focusAt(view, focusKeys);
  const cross = r >= 0 && c >= 0 && r !== c;
  const any = r >= 0 || c >= 0;
  const inRow = (i) => (r >= 0 && i === r) || (!cross && c >= 0 && r === c && i === c);
  const inCol = (j) => (c >= 0 && j === c) || (!cross && r >= 0 && r === c && j === r);
  const poses = [];
  const pose = (node, lit, z = 0) => poses.push([node, { h: lit ? 1 : 0, d: any && !lit ? 1 : 0, ...(z !== null ? { z } : {}) }]);
  drawn.rows.forEach((node, i) => pose(node, i === r || (i === c && r === c), null));
  drawn.cols.forEach((node, j) => pose(node, j === c || (j === r && r === c), null));
  drawn.cells.forEach((row, i) => row.forEach((node, j) => {
    const here = cross ? i === r && j === c : inRow(i) || inCol(j);
    pose(node, here, cross && i === r && j === c ? 1 : 0);
    node.classList.toggle('lift', cross && i === r && j === c);
  }));
  drawn.overall.forEach((node, i) => pose(node, !cross && inRow(i) && r >= 0, 0));
  for (const node of $('grid').querySelectorAll('.ohead, .orule')) pose(node, false, null);
  poses.push([$('readout'), { h: any ? 1 : 0 }]);
  if (any) readout(view, r, c);
  focus.move(poses, animate);
}

// --- painting and turning over ---
//
// What the state asks for, and what the frame shows. They differ only while
// a turn plays: the turn paints whatever is wanted once the old grid has
// left, so a refresh or a second change mid-turn is never lost and never
// cuts the turn short.
let want = null;
let shownKey = null;
let shownEmpty = true;
let turning = false;
let turnToken = 0;

// The panel and the "no matchups yet" line swap here, with the content,
// never ahead of it (the legend distribution's rule).
function paint() {
  if (!want || shownKey === want.key) return;
  const empty = want.view.axis.length < 2;
  if (!empty) {
    paintGrid(want.view, want.opts);
    applyFocus(false);
  } else {
    $('grid').replaceChildren();
    drawn = { rows: [], cols: [], cells: [], overall: [], view: null };
  }
  shownEmpty = empty;
  $('empty').classList.toggle('hidden', !empty);
  $('panel').classList.toggle('hidden', empty);
  shownKey = want.key;
}

function settle() {
  turnToken += 1;
  turning = false;
  rowsIn.stop();
  rowsOut.stop();
  rowsOut.seek(0);
  rowsIn.seek(1);
}

async function turnOver() {
  const token = ++turnToken;
  turning = true;
  while (want && shownKey !== want.key) {
    rowsIn.stop();
    rowsIn.seek(1);
    const wasEmpty = shownEmpty;
    if (!wasEmpty) {
      await rowsOut.play({ from: 0, to: 1 });
      if (token !== turnToken) return;
    }
    paint();
    if (wasEmpty && shownEmpty) { rowsOut.seek(0); continue; }
    rowsIn.duration = TURN_IN_MS;
    const landed = rowsIn.play({ from: 0, to: 1 });
    rowsOut.seek(0);
    await landed;
    if (token !== turnToken) return;
  }
  turning = false;
  if (JSON.stringify(focusKeys) !== appliedFocus) applyFocus(true);
}

let shownVisible = null;

const params = initStage({
  scene: 'matrix',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.matrix;
    const data = bank.event.matrix || { legends: [], pairs: [] };
    const opts = { overall: scene.overall !== false, records: scene.records !== false };
    const view = matrixView(data, { size: scene.size, pick: scene.pick, minMatches: scene.minMatches });
    const key = JSON.stringify([
      view.axis.map((l) => [l.key, l.legend, l.legendCardId]),
      view.cells.map((row) => row.map((c) => (c.self ? 0 : [c.wins, c.losses, c.draws, c.shown]))),
      view.overall.map((o) => [o.wins, o.losses, o.draws]),
      opts, view.minMatches,
    ]);
    want = { view, opts, key };

    // With no grid to describe, the label and the note describe nothing:
    // only the event's name stays up.
    const some = view.axis.length >= 2;
    setText($('sub'), [some && data.title ? data.title : bank.event.name, some ? data.label : '', matrixCounts(view, { matches: !data.note })].filter(Boolean).join(' · '));
    setText($('foot'), some ? matrixFoot(data) : '');

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);

    focusKeys = { row: (scene.focus && scene.focus.row) || '', col: (scene.focus && scene.focus.col) || '' };
    const focusChanged = JSON.stringify(focusKeys) !== appliedFocus;

    if (first || shownKey === null) {
      // The first frame: the data as it stands, settled.
      settle();
      paint();
    } else if (visible && shownVisible !== true) {
      // Coming on: the grid comes in from the top left corner.
      settle();
      paint();
      if (focusChanged) applyFocus(false);
      rowsIn.duration = ENTER_MS;
      rowsIn.play({ from: 0, to: 1 });
    } else if (!visible) {
      // Off air (or fading out): a turn already playing finishes under the
      // fade; otherwise the frame just follows the state for next time.
      if (!turning) paint();
      if (focusChanged && !turning) applyFocus(false);
    } else if (key !== shownKey && !turning) {
      // On air and the data changed: the grid leaves and comes back with
      // the new numbers.
      turnOver();
    } else if (!turning && focusChanged) {
      applyFocus(true);
    }

    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
