// Ongoing matches (2026-09-19, Sam: "a graphic that shows ongoing
// matches"): the tables of the round still being played, for the stretch
// at the end of a round when the stream waits on the last few. It draws the
// same tables as the pairings (event.pairings: loaded by the Tournament
// platform tab or typed under Match data > Pairings) and leaves out every
// table that has finished, so with the platform keeping the pairings up to
// date a table leaves the board on air the moment its result is in.
//
// The fewer tables are left, the bigger they are drawn: up to 12 in one
// column whose rows grow to fill it (--k, up to 1.9 times the pairings'
// size), more than that in the pairings' two columns, grown up to 1.25
// times while they leave room, 32 a page. Each table
// reads across like a pairing: its number, the player (legend portrait,
// name, record going in and legend), VS or the games so far, the opponent.
// The pages turn and come in the way the standings' do (web/stage/pager.js).
//
// State: event.pairings {rows, label} and scenes.ongoing {page, legends}.
import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, portraitSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { createPager } from '../../stage/pager.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

const PER_PAGE = 32;
// One column up to this many tables, two after. Either way the rows share
// ROWS_H design pixels (the pairings' 16 rows of 51), each at most K_ONE
// (one column) or K_TWO (two, where half the width has to hold a name)
// times a pairing row. 12 is where one column would drop below two.
const ONE_COLUMN = 12;
const ROWS_H = 816;
const ROW_H = 51;
const K_ONE = 1.9;
const K_TWO = 1.25;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// A table still to finish: no result in. Typed tables carry no state until
// "= 2-1" closes them, which sets both.
const unfinished = (r) => r.status !== 'done' && !r.winner;

function portrait(p) {
  const box = el('span', 'pt');
  const img = el('img', 'art hidden');
  img.alt = '';
  img.draggable = false;
  const steps = portraitSteps(p);
  if (steps.length) chainLoad(img, steps); else { clearArt(img); box.classList.add('none'); }
  box.append(img);
  return box;
}

function side(p, where, { legends, records }) {
  const cell = el('div', `pl ${where}`);
  if (legends) cell.append(portrait(p));
  const id = el('div', 'id');
  const top = el('div', 'top');
  top.append(el('span', 'k-chip', p.country || ''), el('span', 'nm', p.name || 'TBD'));
  const sub = el('div', 'sub');
  if (records && p.record) sub.append(el('span', 'rec', p.record));
  if (legends && p.legend) sub.append(el('span', 'lg', p.legend));
  id.append(top, sub);
  cell.append(id);
  return cell;
}

// VS, or the games so far when the platform has them mid-match.
function middle(r) {
  const mid = el('div', 'mid');
  const [a, b] = r.score || [0, 0];
  if (a || b) {
    mid.classList.add('score');
    mid.append(el('span', 'g', String(a)), el('span', 'dash', '–'), el('span', 'g', String(b)));
  } else {
    mid.classList.add('vs');
    mid.textContent = 'VS';
  }
  return mid;
}

function row(r, i, count, want) {
  const div = el('div', 'row');
  div.style.setProperty('--pos', String(count > 1 ? i / (count - 1) : 0));
  div.append(el('div', 'tb', r.table ? String(r.table) : ''), side(r.left || {}, 'l', want), middle(r), side(r.right || {}, 'r', want));
  return div;
}

let rowsKey = null;
function renderRows(want) {
  const { rows, page, legends, records } = want;
  const start = (page - 1) * PER_PAGE;
  const slice = rows.slice(start, start + PER_PAGE);
  const key = JSON.stringify([slice, page, legends, records]);
  if (rowsKey === key) return;
  rowsKey = key;
  const one = slice.length <= ONE_COLUMN;
  // Two columns: half the page down each, the left one taking the odd table.
  const half = one ? slice.length : Math.ceil(slice.length / 2);
  const k = Math.max(1, Math.min(one ? K_ONE : K_TWO, ROWS_H / (Math.max(1, half) * ROW_H)));
  root.style.setProperty('--k', k.toFixed(3));
  $('cols').classList.toggle('one', one);
  const a = slice.slice(0, half);
  const b = slice.slice(half);
  $('rowsA').replaceChildren(...a.map((r, i) => row(r, i, a.length, want)));
  $('rowsB').replaceChildren(...b.map((r, i) => row(r, i, b.length, want)));
  $('colB').classList.toggle('hidden', !b.length);
  root.classList.toggle('no-legends', !legends);
}

const showPage = createPager(root, (want) => {
  renderRows(want);
  setText($('page'), want.pages > 1 ? `Page ${want.page} of ${want.pages}` : '');
});

let shownVisible = null;

const params = initStage({
  scene: 'ongoing',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.ongoing || {};
    const pr = bank.event.pairings || { rows: [], label: '' };
    const all = pr.rows || [];
    const rows = all.filter(unfinished);
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    const page = Math.min(pages, Math.max(1, scene.page || 1));
    const round = pr.label || bank.event.roundTitle;

    const playing = rows.length && all.length
      ? (rows.length === all.length ? `${rows.length} table${rows.length === 1 ? '' : 's'} playing` : `${rows.length} of ${all.length} tables still playing`)
      : '';
    setText($('sub'), [bank.event.name, round, playing].filter(Boolean).join(' · '));
    // Nothing loaded, or every table finished: one line in the frame's box.
    setText($('empty'), all.length
      ? `Every table${round ? ` in ${round}` : ''} has finished.`
      : 'No pairings yet. Load a round from the Tournament platform tab, or type the tables under Match data › Pairings in the control panel.');
    $('empty').classList.toggle('hidden', rows.length > 0);
    $('cols').classList.toggle('hidden', !rows.length);
    const done = all.length - rows.length;
    setText($('foot'), done && rows.length ? `${done} of ${all.length} table${all.length === 1 ? '' : 's'} finished` : '');

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);

    // Records going in, unless every one is 0-0 (a first round).
    const records = rows.some((r) => [r.left, r.right].some((p) => p && p.record && !/^0-0(-0)?$/.test(p.record)));
    showPage({ rows, page, pages, legends: scene.legends !== false, records }, { first, visible, wasVisible: shownVisible });
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
