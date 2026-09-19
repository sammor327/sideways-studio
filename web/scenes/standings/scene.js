import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, portraitSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { createPager } from '../../stage/pager.js';
import { FocusBlend } from '../../stage/focusblend.js';
import { scheduleNameFit } from '../../stage/fitnames.js';
import { STANDINGS_PAGES, STANDINGS_PER_PAGE as PER_PAGE, standingsView } from '../../shared/standings.js';
import { playerKey } from '../../shared/focus.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);
const focus = new FocusBlend(root, 450);

// The columns, with and without the legends (2026-09-19, Sam: "show the
// legend portrait next to them and the legend name to the right", with a
// switch for an event whose legends are not known). Widths in design pixels;
// the player column (0) takes what the others leave, so a long name shrinks
// to fit it rather than pushing the numbers across.
const COLUMNS = {
  on: [['rk', 96, 'Rank'], ['pl', 0, 'Player'], ['lg', 400, 'Legend'], ['n', 120, 'Record'], ['n', 120, 'Points'],
    ['tb', 124, 'OMW%'], ['tb', 124, 'GW%'], ['tb', 124, 'OGW%']],
  off: [['rk', 96, 'Rank'], ['pl', 0, 'Player'], ['n', 170, 'Record'], ['n', 170, 'Points'],
    ['tb', 150, 'OMW%'], ['tb', 150, 'GW%'], ['tb', 150, 'OGW%']],
};

let headKey = null;
function renderHead(legends) {
  const key = legends ? 'on' : 'off';
  if (headKey === key) return;
  headKey = key;
  $('cols').replaceChildren(...COLUMNS[key].map(([, w]) => {
    const col = document.createElement('col');
    if (w) col.style.width = `calc(${w} * var(--u))`;
    return col;
  }));
  $('head').replaceChildren(...COLUMNS[key].map(([cls, , label]) => Object.assign(document.createElement('th'), { className: cls, textContent: label })));
}

function cell(cls, text) {
  const td = document.createElement('td');
  td.className = cls;
  td.textContent = text;
  return td;
}

// The legend's face beside the name. A row with no legend keeps the slot,
// drawn faint, so the names stay in line.
function portrait(r) {
  const box = document.createElement('span');
  box.className = 'pt';
  const img = document.createElement('img');
  img.className = 'art hidden';
  img.alt = '';
  img.draggable = false;
  const steps = portraitSteps(r);
  if (steps.length) chainLoad(img, steps); else { clearArt(img); box.classList.add('none'); }
  box.append(img);
  return box;
}

let rowsKey = null;
function renderRows({ rows, cut, page, legends, points }) {
  const start = (page - 1) * PER_PAGE;
  const slice = rows.slice(start, start + PER_PAGE);
  const key = JSON.stringify([slice, cut, page, legends, points]);
  if (rowsKey === key) return;
  rowsKey = key;
  $('rows').replaceChildren(...slice.map((r, i) => {
    const rank = start + i + 1;
    const tr = document.createElement('tr');
    tr.className = (cut && rank > cut ? 'outc' : 'in') + (cut && rank === cut ? ' cut' : '');
    tr.dataset.key = playerKey(r.name);
    // The row's place down the page, 0 to 1: where its slice of the in and
    // out clocks starts (scene.css).
    tr.style.setProperty('--pos', String(slice.length > 1 ? i / (slice.length - 1) : 0));
    const pl = document.createElement('td');
    pl.className = 'pl';
    const who = document.createElement('div');
    who.className = 'who';
    if (legends) who.append(portrait(r));
    who.append(
      Object.assign(document.createElement('span'), { className: 'k-chip', textContent: r.country || '' }),
      Object.assign(document.createElement('span'), { className: 'nm', textContent: r.name }),
    );
    pl.append(who);
    tr.append(cell('rk', String(rank)), pl);
    if (legends) tr.append(cell('lg', r.legend || ''));
    tr.append(
      cell('n', r.record || ''),
      // A list with no points at all (ranked by record) leaves the column
      // empty rather than a row of zeros.
      cell('n', points ? String(r.points || 0) : ''),
      cell('tb', r.omw ? r.omw.toFixed(1) : ''),
      cell('tb', r.gw ? r.gw.toFixed(1) : ''),
      cell('tb', r.ogw ? r.ogw.toFixed(1) : ''),
    );
    return tr;
  }));
  // New rows take their highlight as they are drawn, no move.
  poseRows(false);
}

// --- the highlight (2026-09-19, Sam: "highlight and feature specific
// standings") ---
//
// The players highlighted (scenes.standings.focus, by web/shared/focus.js
// playerKey). Each of their rows on the page gains FEATURE_PX and a size
// of type while the other rows dim; if the page would then outgrow the
// room under the heading, the other rows give the difference up between
// them. Highlighting a player on another page or group turns the graphic
// to them (the store does that), so their row is always on the page.
const ROW_PX = 39;
const FEATURE_PX = 12;
const PAGE_PX = ROW_PX * PER_PAGE + 30;
let focusKeys = [];

function poseRows(animate) {
  const rows = [...$('rows').children];
  const lit = new Set(focusKeys);
  const on = rows.filter((tr) => lit.has(tr.dataset.key));
  const spare = Math.max(0, rows.length * ROW_PX + on.length * FEATURE_PX - PAGE_PX);
  const give = on.length && on.length < rows.length ? spare / (rows.length - on.length) : 0;
  const moved = focus.move(rows.map((tr) => {
    const me = lit.has(tr.dataset.key);
    return [tr, { h: me ? 1 : 0, d: on.length && !me ? 1 : 0, x: me ? FEATURE_PX : on.length ? -give : 0 }];
  }), animate);
  // Grown type may no longer fit its column: fit the names again once the
  // rows have landed (stage/fitnames.js only reruns on DOM changes).
  moved.then(() => scheduleNameFit());
}

// The page turns and the entrance: web/stage/pager.js. The group's name and
// the lines about it change with the rows, so a change of group reads as
// one turn.
const showPage = createPager(root, (want) => {
  renderHead(want.legends);
  renderRows(want);
  setText($('page'), want.pages > 1 ? `Page ${want.page} of ${want.pages}` : '');
  setText($('grp'), want.group);
  $('grp').classList.toggle('hidden', !want.group);
  setText($('sub'), want.sub);
  setText($('foot'), want.foot);
});

let shownVisible = null;

const params = initStage({
  scene: 'standings',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.standings;
    const st = bank.event.standings || { rows: [], cut: 8 };
    // One group at a time when the rows carry groups (web/shared/standings.js).
    const view = standingsView(st, scene);
    const { rows, pages, page } = view;
    const grouped = view.groups.length > 1;
    const points = rows.some((r) => r.points > 0);

    // The standings' own label (the Tournament platform writes "after Round
    // 3") wins over the match's round title, which may already be the next
    // round.
    const when = st.label || (bank.event.roundTitle && `after ${bank.event.roundTitle}`);
    const sub = [bank.event.name, when, st.cut ? `Top ${st.cut} cut` : ''].filter(Boolean).join(' · ');
    $('empty').classList.toggle('hidden', rows.length > 0);
    // A list without points was ranked by record (server/state.js
    // sortStandings), so the tiebreak line would not be true of it.
    const foot = (points ? "Tiebreaks in order: match points, opponents' match win %, game win %, opponents' game win %." : 'Ranked by record.')
      + (st.cut ? ` Top ${st.cut}${grouped ? ' of each group' : ''} advance to the cut.` : '');

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);

    const keys = Array.isArray(scene.focus) ? scene.focus : [];
    const focusChanged = JSON.stringify(keys) !== JSON.stringify(focusKeys);
    focusKeys = keys;
    showPage({
      rows, cut: st.cut || 0, page, pages, legends: scene.legends !== false, points,
      group: view.group, sub, foot, place: view.index * (STANDINGS_PAGES + 1) + page,
    }, { first, visible, wasVisible: shownVisible });
    // A highlight on the page up: the rows move to it where they stand (a
    // page turning to the player poses its new rows as it draws them).
    if (focusChanged) poseRows(Boolean(visible && shownVisible && !first));
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
