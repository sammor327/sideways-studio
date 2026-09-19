import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, cardSteps, legendSteps, heroSteps } from '../../stage/art.js';
import { clockText, fitText, renderRunes, loadLegendDomains, legendDomains, applyVisibility } from '../../stage/exp.js';
import { setClock } from '../../shared/clockcells.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 550);
const flip = new SeekClock(document.querySelector('.card-well'), '--flip', 420);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

const shown = { legend: {}, hero: {}, card: null };
let lastState = null;

function loadLegend(p, side) {
  const key = `${side.legendCardId || ''}|${side.legendSlug || ''}`;
  if (shown.legend[p] === key) return;
  shown.legend[p] = key;
  const img = $(`${p}legendImg`);
  const steps = legendSteps(side);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

function loadHero(p, side) {
  const key = side.legendSlug || '';
  if (shown.hero[p] === key) return;
  shown.hero[p] = key;
  const img = $(`${p}hero`);
  const chip = $(`${p}chip`);
  chip.classList.remove('on');
  const steps = heroSteps(side);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
  const fail = img.onerror;
  img.onerror = () => {
    fail();
    if (!img.getAttribute('src')) {
      chip.textContent = (side.legend || key)[0].toUpperCase();
      chip.classList.add('on');
    }
  };
}

// The docked card is the popup's card while the popup is on; the popup
// stands down (cardpopup/scene.js). Empty: the logo or a trim ring.
function loadCard(bank, logo, animate) {
  const cp = bank.scenes.cardpopup;
  const id = cp.visible ? (cp.card.cardId || '') : '';
  const img = $('slotImg');
  const empty = $('slotEmpty');
  const slotLogo = $('slotLogo');
  const mark = $('slotMark');
  if (slotLogo.getAttribute('src') !== (logo || null)) {
    if (logo) slotLogo.src = logo; else slotLogo.removeAttribute('src');
  }
  slotLogo.classList.toggle('hidden', !logo);
  mark.classList.toggle('hidden', Boolean(logo));
  if (shown.card === id) return;
  const changed = shown.card !== null;
  shown.card = id;
  if (!id) { clearArt(img); empty.classList.remove('hidden'); return; }
  chainLoad(img, cardSteps(id), () => empty.classList.add('hidden'));
  img.onerror = ((next) => () => { next(); if (!img.getAttribute('src')) empty.classList.remove('hidden'); })(img.onerror);
  if (changed && animate) flip.play({ from: 0, to: 1 });
}

function renderPips(el, seriesLength, gameWins, animate) {
  const slots = winsNeeded(seriesLength);
  if (el.children.length !== slots) {
    el.replaceChildren(...Array.from({ length: slots }, () => Object.assign(document.createElement('div'), { className: 'pip' })));
  }
  [...el.children].forEach((pip, i) => {
    const won = i < gameWins;
    if (pip.classList.contains('won') !== won) {
      pip.classList.toggle('won', won);
      if (animate) bump(pip, '--bump');
    }
  });
}

function metaLine(side) {
  return [side.record, side.seed && `${side.seed} seed`].filter(Boolean).join(' · ');
}

function renderSide(p, side, m, active, animate) {
  if (fitText($(`${p}name`), side.name, { size: 42, min: 26, run: 420 }) && animate) bump($(`${p}name`), '--slide', 500);
  setText($(`${p}meta`), metaLine(side));
  setText($(`${p}country`), side.country || '');
  $(`${p}pillar`).classList.toggle('active', active);
  setText($(`${p}legend`), side.legend || ' ');
  setText($(`${p}champion`), side.champion || '');
  renderRunes($(`${p}runes`), legendDomains(side));
  setText($(`${p}arche`), side.archetype ? `Archetype · ${side.archetype}` : '');
  setText($(`${p}hand`), side.handCount > 0 ? `Hand · ${side.handCount}` : '');
  renderPips($(`${p}pips`), m.seriesLength, side.gameWins, animate);
  if (setText($(`${p}pts`), side.score) && animate) bump($(`${p}pts`), '--bump');
  loadLegend(p, side);
  loadHero(p, side);
}

let timerState = null;
setInterval(() => {
  if (!root.classList.contains('off')) setClock($('tbClock'), clockText(timerState));
}, 250);

let shownVisible = null;

const params = initStage({
  scene: 'igoportrait',
  onState(state, first) {
    lastState = state;
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.igoportrait;
    const animate = !first;

    root.classList.toggle('mode-webcam', scene.mode === 'webcam');
    root.classList.toggle('mode-legend', scene.mode !== 'webcam');
    root.classList.toggle('handcam', Boolean(scene.handCam));
    root.classList.toggle('cardwell', Boolean(scene.cardWell));
    $('topBar').classList.toggle('hidden', !scene.topBar);

    renderSide('l', m.left, m, m.activeSide === 'left', animate);
    renderSide('r', m.right, m, m.activeSide === 'right', animate);
    $('lead').className = `lead ${m.activeSide || ''}`;

    const round = [bank.event.roundTitle, m.turn > 0 ? `Turn ${m.turn}` : ''].filter(Boolean).join(' · ');
    setText($('tbRound'), round);
    timerState = m.timer || timerState;
    setClock($('tbClock'), clockText(timerState));

    const logo = state.theme.logo || '';
    const logoEl = $('eventLogo');
    if (logoEl.getAttribute('src') !== (logo || null)) {
      if (logo) logoEl.src = logo; else logoEl.removeAttribute('src');
    }
    logoEl.classList.toggle('hidden', !logo);
    setText($('eventName'), bank.event.name || '');
    setText($('roundBig'), bank.event.roundTitle || '');
    const left = bank.event.roundsRemaining;
    setText($('roundsLeft'), left > 0 ? `${left} round${left === 1 ? '' : 's'} remaining` : '');

    loadCard(bank, logo, animate);

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

// The rune glyphs need the legend catalog; repaint once it lands.
loadLegendDomains(() => {
  if (!lastState) return;
  const m = sceneBank(lastState, params).match;
  renderRunes($('lrunes'), legendDomains(m.left));
  renderRunes($('rrunes'), legendDomains(m.right));
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
