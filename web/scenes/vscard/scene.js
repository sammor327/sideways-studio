import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, cardSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 1400);

// Each side's legend CARD, the whole printed card (full art, then the
// thumb), from the side's own card id: the one the legend picker and the
// Tournament platform fill. With none, the blank card names the legend.
const shown = {};
function loadCard(p, side) {
  const blank = $(`${p}blank`);
  setText($(`${p}blankText`), side.legend ? String(side.legend).split(',')[0] : '');
  const id = side.legendCardId || '';
  if (shown[p] === id) return;
  shown[p] = id;
  const img = $(`${p}card`);
  blank.classList.remove('hidden');
  const steps = cardSteps(id);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps, () => blank.classList.add('hidden'));
}

function setLogo(logo) {
  const img = $('logo');
  if ((img.getAttribute('src') || '') !== logo) {
    if (logo) img.src = logo; else img.removeAttribute('src');
  }
  img.classList.toggle('hidden', !logo);
}

let shownVisible = null;

const params = initStage({
  scene: 'vscard',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.vscard;

    // The upper name goes with the right card, the lower with the left.
    setText($('lname'), m.left.name || '');
    setText($('rname'), m.right.name || '');
    loadCard('l', m.left);
    loadCard('r', m.right);
    setText($('round'), bank.event.roundTitle || 'Feature match');
    setText($('eventName'), bank.event.name || '');
    setLogo(state.theme.logo || '');

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
