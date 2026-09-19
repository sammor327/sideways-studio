import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, legendSteps } from '../../stage/art.js';
import { clockText, fitText, applyVisibility } from '../../stage/exp.js';
import { setClock } from '../../shared/clockcells.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

const shown = { thumb: {} };

// Eight hexes per side, numbered 1 to 8 toward the centre, lit up to the
// score; the 8 is the goal and takes the trim colour.
function renderHexes(el, score, animate) {
  if (el.children.length !== 8) {
    el.replaceChildren(...Array.from({ length: 8 }, (_, i) => {
      const n = 8 - i;
      const d = document.createElement('div');
      d.className = `hex${n === 8 ? ' goal' : ''}`;
      d.dataset.n = String(n);
      d.append(Object.assign(document.createElement('span'), { textContent: String(n) }));
      return d;
    }));
  }
  for (const hex of el.children) {
    const on = Number(hex.dataset.n) <= score;
    if (hex.classList.contains('on') !== on) {
      hex.classList.toggle('on', on);
      if (on && animate) bump(hex, '--bump');
    }
  }
}

function loadThumb(p, side) {
  const key = `${side.legendCardId || ''}|${side.legendSlug || ''}`;
  if (shown.thumb[p] === key) return;
  shown.thumb[p] = key;
  const img = $(`${p}thumb`);
  const steps = legendSteps(side);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

function renderSide(p, side, animate) {
  fitText($(`${p}name`), side.name, { size: 30, min: 20, run: 300 });
  setText($(`${p}country`), side.country || '');
  setText($(`${p}rec`), [side.record, side.legend ? side.legend.split(',')[0] : ''].filter(Boolean).join(' · '));
  renderHexes($(`${p}hex`), side.score, animate);
  if (setText($(`${p}wins`), side.gameWins) && animate) bump($(`${p}wins`), '--bump');
  loadThumb(p, side);
}

let timerState = null;
setInterval(() => {
  if (!root.classList.contains('off')) setClock($('clock'), clockText(timerState));
}, 250);

let shownVisible = null;

const params = initStage({
  scene: 'arenabug',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.arenabug;
    const animate = !first;

    renderSide('l', m.left, animate);
    renderSide('r', m.right, animate);
    setText($('gamesLabel'), `Games · Bo${m.seriesLength}`);
    setText($('roundTitle'), bank.event.roundTitle || ' ');
    setText($('roundSub'), bank.event.name || '');

    const logo = state.theme.logo || '';
    const logoEl = $('cornerLogo');
    if (logoEl.getAttribute('src') !== (logo || null)) {
      if (logo) logoEl.src = logo; else logoEl.removeAttribute('src');
    }
    logoEl.classList.toggle('hidden', !logo);
    setText($('cornerEvent'), bank.event.name || '');
    $('corner').classList.toggle('hidden', !scene.clock);
    timerState = m.timer || timerState;
    setClock($('clock'), clockText(timerState));

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
    void winsNeeded;
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
