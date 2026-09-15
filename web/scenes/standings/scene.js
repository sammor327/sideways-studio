import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, legendSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

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

    setText($('sub'), [bank.event.name, bank.event.roundTitle && `after ${bank.event.roundTitle}`, st.cut ? `Top ${st.cut} cut` : ''].filter(Boolean).join(' · '));
    setText($('page'), pages > 1 ? `Page ${page} of ${pages}` : '');
    renderRows(rows, st.cut || 0, page);
    $('empty').classList.toggle('hidden', rows.length > 0);
    setText($('foot'), `Tiebreaks in order: match points, opponents' match win %, game win %, opponents' game win %.${st.cut ? ` Top ${st.cut} advance to the cut.` : ''}`);

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
