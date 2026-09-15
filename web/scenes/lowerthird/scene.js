import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, legendSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

let legKey = null;
function loadLegend(side) {
  const key = `${side.legendCardId || ''}|${side.legendSlug || ''}`;
  if (legKey === key) return;
  legKey = key;
  const img = $('leg');
  const steps = legendSteps(side);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

// The credential line the operator did not type: seed, record, legend and
// best finish, whichever the side carries.
function autoCredential(side) {
  return [side.seed && `${side.seed} seed`, side.record, side.legend, side.bestFinish].filter(Boolean).join(' · ');
}

let shownVisible = null;

const params = initStage({
  scene: 'lowerthird',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.lowerthird;
    const m = bank.match;
    const ev = bank.event;
    const mode = ['casters', 'interview', 'coming'].includes(scene.mode) ? scene.mode : 'casters';
    for (const k of ['casters', 'interview', 'coming']) root.classList.toggle(`mode-${k}`, mode === k);

    const casters = ev.casters || [];
    for (const [i, p] of [[0, 'c1'], [1, 'c2']]) {
      const c = casters[i];
      $(`${p}name`).parentElement.classList.toggle('hidden', !c);
      setText($(`${p}name`), c ? c.name : ' ');
      setText($(`${p}role`), c ? (c.role || '') : '');
      setText($(`${p}handle`), c && c.handle ? (c.handle.startsWith('@') ? c.handle : `@${c.handle}`) : '');
    }
    setText($('midEvent'), ev.name || 'Sideways Studio');
    setText($('midRound'), ev.roundTitle || '');

    const side = scene.side === 'right' ? m.right : m.left;
    setText($('country'), side.country || '');
    setText($('name'), side.name || ' ');
    const cred = scene.credential || autoCredential(side);
    setText($('credKey'), scene.credential ? '' : (ev.roundTitle || ''));
    setText($('cred'), cred);
    loadLegend(side);

    setText($('comingRound'), ev.roundTitle || ev.name || '');
    const vs = $('comingVs');
    const want = `${m.left.name || 'Player one'}|${m.right.name || 'Player two'}`;
    if (vs.dataset.want !== want) {
      vs.dataset.want = want;
      vs.replaceChildren(
        document.createTextNode(m.left.name || 'Player one'),
        Object.assign(document.createElement('span'), { className: 'x', textContent: 'vs' }),
        document.createTextNode(m.right.name || 'Player two'),
      );
    }

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
