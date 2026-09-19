import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, legendSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);
// The rows (2026-09-19, Sam: "animate between the pages and animate in"):
// --r brings the shown page's rows in one after another from the top, --o
// takes them out the same way. Wall-clock seek clocks like --t, so an
// occluded browser source lands on the settled page, never a half-drawn one.
const rowsIn = new SeekClock(root, '--r', 1000);
const rowsOut = new SeekClock(root, '--o', 380);
const ENTER_MS = 1000;
const TURN_IN_MS = 720;

const PER_PAGE = 20;

function cell(cls, text) {
  const td = document.createElement('td');
  td.className = cls;
  td.textContent = text;
  return td;
}

let rowsKey = null;
function renderRows(rows, cut, page) {
  const start = (page - 1) * PER_PAGE;
  const slice = rows.slice(start, start + PER_PAGE);
  const key = JSON.stringify([slice, cut, page]);
  if (rowsKey === key) return;
  rowsKey = key;
  $('rows').replaceChildren(...slice.map((r, i) => {
    const rank = start + i + 1;
    const tr = document.createElement('tr');
    tr.className = (cut && rank > cut ? 'outc' : 'in') + (cut && rank === cut ? ' cut' : '');
    // The row's place down the page, 0 to 1: where its slice of the in and
    // out clocks starts (scene.css).
    tr.style.setProperty('--pos', String(slice.length > 1 ? i / (slice.length - 1) : 0));
    const pl = document.createElement('td');
    pl.className = 'pl';
    const th = document.createElement('div');
    th.className = 'k-thumb';
    const img = document.createElement('img');
    img.className = 'art hidden';
    img.alt = '';
    img.draggable = false;
    const steps = legendSteps(r);
    if (steps.length) chainLoad(img, steps); else clearArt(img);
    th.append(img);
    pl.append(th, Object.assign(document.createElement('span'), { className: 'k-chip', textContent: r.country || '' }), document.createTextNode(r.name));
    tr.append(
      cell('rk', String(rank)),
      pl,
      cell('lg', r.legend || ''),
      cell('n', r.record || ''),
      cell('n', String(r.points || 0)),
      cell('tb', r.omw ? r.omw.toFixed(1) : ''),
      cell('tb', r.gw ? r.gw.toFixed(1) : ''),
      cell('tb', r.ogw ? r.ogw.toFixed(1) : ''),
    );
    return tr;
  }));
}

// What the state asks for, and which page the frame shows. They differ only
// while a page turn plays: the turn swaps in whatever is wanted once the old
// rows have left, so a refresh or a second click mid-turn is never lost and
// never cuts the turn short.
let want = null;
let shownPage = null;
let turning = false;
let turnToken = 0;

function paintPage() {
  const { rows, cut, page, pages } = want;
  renderRows(rows, cut, page);
  setText($('page'), pages > 1 ? `Page ${page} of ${pages}` : '');
  shownPage = page;
}

// The side the rows travel: the next page comes in from the right as the
// old one leaves to the left, the previous page the other way round.
function setTravel(dir) {
  root.style.setProperty('--in-dx', String(dir > 0 ? 72 : -72));
  root.style.setProperty('--out-dx', String(dir > 0 ? -72 : 72));
}

function settle() {
  turnToken += 1;
  turning = false;
  rowsOut.stop();
  rowsIn.stop();
  rowsOut.seek(0);
  rowsIn.seek(1);
}

async function turnPage() {
  const token = ++turnToken;
  turning = true;
  while (want && shownPage !== want.page) {
    setTravel(want.page > shownPage ? 1 : -1);
    rowsIn.stop();
    rowsIn.seek(1);
    await rowsOut.play({ from: 0, to: 1 });
    if (token !== turnToken) return;
    paintPage();
    rowsOut.seek(0);
    rowsIn.duration = TURN_IN_MS;
    await rowsIn.play({ from: 0, to: 1 });
    if (token !== turnToken) return;
  }
  // Numbers that changed on this page while its rows came in.
  if (want) paintPage();
  turning = false;
}

let shownVisible = null;

const params = initStage({
  scene: 'standings',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.standings;
    const st = bank.event.standings || { rows: [], cut: 8 };
    const rows = st.rows || [];
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    const page = Math.min(pages, Math.max(1, scene.page || 1));
    want = { rows, cut: st.cut || 0, page, pages };

    // The standings' own label (the Tournament platform writes "Group 2 ·
    // after Round 3") wins over the match's round title, which may already be
    // the next round.
    const when = st.label || (bank.event.roundTitle && `after ${bank.event.roundTitle}`);
    setText($('sub'), [bank.event.name, when, st.cut ? `Top ${st.cut} cut` : ''].filter(Boolean).join(' · '));
    $('empty').classList.toggle('hidden', rows.length > 0);
    setText($('foot'), `Tiebreaks in order: match points, opponents' match win %, game win %, opponents' game win %.${st.cut ? ` Top ${st.cut} advance to the cut.` : ''}`);

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);

    if (first || shownPage === null) {
      // The first frame: the page as it stands, settled.
      settle();
      paintPage();
    } else if (visible && shownVisible !== true) {
      // Coming on: the wanted page, its rows in one after another.
      settle();
      paintPage();
      setTravel(-1);
      rowsIn.duration = ENTER_MS;
      rowsIn.play({ from: 0, to: 1 });
    } else if (!visible) {
      // Off air (or fading out): a turn already playing finishes under the
      // fade; otherwise the page just follows the state for next time.
      if (!turning) paintPage();
    } else if (page !== shownPage) {
      if (!turning) turnPage();
    } else if (!turning) {
      // Same page, new numbers (a refresh): straight in, no motion.
      paintPage();
    }

    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
