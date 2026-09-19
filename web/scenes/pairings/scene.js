// Pairings (2026-09-19, Sam: "a pairing graphic to review all the current
// matches for the round"): every table of a round, 32 a page in two columns
// of 16, the standings' sister sheet. Each table reads across: its number,
// the player (legend portrait, name, record going in and legend), the result
// or VS, and the opponent mirrored. The pages turn and come in the way the
// standings' do (web/stage/pager.js).
//
// State: event.pairings {rows, label, byes} (loaded by the Tournament
// platform tab, or typed under Match data > Pairings) and scenes.pairings
// {page, legends, results}.
import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, portraitSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { createPager } from '../../stage/pager.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

const PER_PAGE = 32;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

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

// One player: portrait, then the name over "record · legend". The opponent's
// side is the same markup mirrored by its CSS (row-reverse, right aligned).
function side(p, where, { legends, records }, mark) {
  const cell = el('div', `pl ${where}${mark ? ` ${mark}` : ''}`);
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

// The middle of a table: the games once it is finished (the winner's number
// in the accent), a draw, or VS while it is being played.
function middle(r, results) {
  const mid = el('div', 'mid');
  if (results && r.status === 'done') {
    if (r.winner === 'draw') {
      mid.classList.add('draw');
      mid.textContent = 'Draw';
    } else if (r.winner && (r.score[0] || r.score[1])) {
      mid.classList.add('score');
      mid.append(
        el('span', `g${r.winner === 'left' ? ' w' : ''}`, String(r.score[0])),
        el('span', 'dash', '–'),
        el('span', `g${r.winner === 'right' ? ' w' : ''}`, String(r.score[1])),
      );
    } else if (r.winner) {
      // A win with no games reported (a no-show, a concession): W and L in
      // the same places the games would take.
      mid.classList.add('score');
      mid.append(
        el('span', `g${r.winner === 'left' ? ' w' : ''}`, r.winner === 'left' ? 'W' : 'L'),
        el('span', 'dash', '–'),
        el('span', `g${r.winner === 'right' ? ' w' : ''}`, r.winner === 'right' ? 'W' : 'L'),
      );
    } else {
      mid.classList.add('vs');
      mid.textContent = '–';
    }
  } else {
    mid.classList.add('vs');
    mid.textContent = 'VS';
  }
  return mid;
}

function row(r, i, count, want) {
  const done = want.results && r.status === 'done' && (r.winner === 'left' || r.winner === 'right');
  const div = el('div', `row${done ? ' done' : ''}`);
  // Place down its column, 0 to 1: both columns come in together.
  div.style.setProperty('--pos', String(count > 1 ? i / (count - 1) : 0));
  div.append(
    el('div', 'tb', r.table ? String(r.table) : ''),
    side(r.left, 'l', want, done ? (r.winner === 'left' ? 'won' : 'lost') : ''),
    middle(r, want.results),
    side(r.right, 'r', want, done ? (r.winner === 'right' ? 'won' : 'lost') : ''),
  );
  return div;
}

let rowsKey = null;
function renderRows(want) {
  const { rows, page, legends, results, records } = want;
  const start = (page - 1) * PER_PAGE;
  const slice = rows.slice(start, start + PER_PAGE);
  const key = JSON.stringify([slice, page, legends, results, records]);
  if (rowsKey === key) return;
  rowsKey = key;
  // Half the page down each column, the left one taking the odd table.
  const half = Math.ceil(slice.length / 2);
  const a = slice.slice(0, half);
  const b = slice.slice(half);
  $('rowsA').replaceChildren(...a.map((r, i) => row(r, i, a.length, want)));
  $('rowsB').replaceChildren(...b.map((r, i) => row(r, i, b.length, want)));
  $('colB').classList.toggle('hidden', !b.length);
  root.classList.toggle('no-legends', !legends);
  const anyDone = results && slice.some((r) => r.status === 'done');
  for (const m of root.querySelectorAll('.ch .c-m')) m.textContent = anyDone ? 'Result' : '';
}

const showPage = createPager(root, (want) => {
  renderRows(want);
  setText($('page'), want.pages > 1 ? `Page ${want.page} of ${want.pages}` : '');
});

let shownVisible = null;

const params = initStage({
  scene: 'pairings',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.pairings || {};
    const pr = bank.event.pairings || { rows: [], label: '', byes: [] };
    const rows = pr.rows || [];
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    const page = Math.min(pages, Math.max(1, scene.page || 1));
    const results = scene.results !== false;

    const count = rows.length ? `${rows.length} table${rows.length === 1 ? '' : 's'}` : '';
    setText($('sub'), [bank.event.name, pr.label || bank.event.roundTitle, count].filter(Boolean).join(' · '));
    $('empty').classList.toggle('hidden', rows.length > 0);
    $('cols').classList.toggle('hidden', !rows.length);
    const done = rows.filter((r) => r.status === 'done').length;
    const byes = pr.byes || [];
    setText($('foot'), [
      results && done ? `${done} of ${rows.length} table${rows.length === 1 ? '' : 's'} finished` : '',
      byes.length ? `Bye${byes.length === 1 ? '' : 's'}: ${byes.join(', ')}` : '',
    ].filter(Boolean).join(' · '));

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);

    // Records going in, unless every one is 0-0 (a first round), where they
    // would only repeat the same noise down both columns.
    const records = rows.some((r) => [r.left, r.right].some((p) => p && p.record && !/^0-0(-0)?$/.test(p.record)));
    showPage({ rows, page, pages, legends: scene.legends !== false, results, records }, { first, visible, wasVisible: shownVisible });
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
