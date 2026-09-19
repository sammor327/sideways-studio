import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, legendSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { lowerThirdPlace, clipInset } from '../../shared/anchor.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

const MODES = ['casters', 'interview', 'coming', 'custom'];
// The label box's word when the operator typed none.
const LABEL = { coming: 'Coming up', custom: 'Up next' };

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

// Where the bar sits (web/shared/anchor.js): 96px up from the frame's
// bottom, or along the bottom of the game area an in-game overlay leaves,
// centred on it (the interview bar from its left) and scaled down when it is
// wider than the room there, above the sponsor plate when that is in the
// way. Measured at the bar's own size, so it is placed again whenever its
// text or face changes; with an overlay up the bar comes in under the
// overlay's chrome (clip).
let lastBank = null;
let lastMode = 'casters';
let placed = '';
function place() {
  if (!lastBank) return;
  const bar = $(lastMode);
  const u = Math.min(innerWidth / 1920, innerHeight / 1080) || 1;
  if (!bar.offsetWidth) return; // off: nothing to measure, and nothing shows
  const at = lowerThirdPlace(lastBank, {
    w: bar.offsetWidth / u,
    h: bar.offsetHeight / u,
    align: lastMode === 'interview' ? 'left' : 'center',
  });
  const key = JSON.stringify([lastMode, at.x, at.bottom, at.scale, at.clip]);
  if (key === placed) return;
  placed = key;
  root.style.setProperty('--lx', String(at.x));
  root.style.setProperty('--lb', String(at.bottom));
  root.style.setProperty('--lk', at.scale.toFixed(4));
  root.style.clipPath = clipInset(at.clip);
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
    const mode = MODES.includes(scene.mode) ? scene.mode : 'casters';
    for (const k of MODES) root.classList.toggle(`mode-${k}`, mode === k);
    lastBank = bank;
    lastMode = mode;

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

    setText($('customMain'), scene.text || ' ');
    setText($('customSub'), scene.sub || '');
    // The label box of coming up and custom: its own word or the operator's,
    // and it can be switched off (2026-09-19, Sam).
    for (const k of ['coming', 'custom']) {
      setText($(`${k}Key`), scene.label || LABEL[k]);
      $(`${k}Key`).classList.toggle('hidden', scene.showLabel === false);
    }

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
    place();
  },
});

// A face that lands late, or a legend thumbnail that finishes loading,
// changes the bar's width: place it again while it is up.
document.fonts.addEventListener('loadingdone', place);
setInterval(() => { if (!root.classList.contains('off')) place(); }, 500);

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
