import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps } from '../../stage/art.js';
import { fitText, renderRunes, loadLegendDomains, legendDomains, applyVisibility, handEls, handKey, handTotal, HandScroller } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 550);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

const shown = { hero: {}, hand: {} };
const scrollers = { l: new HandScroller($('lhandView'), $('lhand')), r: new HandScroller($('rhandView'), $('rhand')) };
let lastState = null;

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

function renderDots(el, seriesLength, gameWins, animate) {
  const slots = winsNeeded(seriesLength);
  if (el.children.length !== slots) {
    el.replaceChildren(...Array.from({ length: slots }, () => Object.assign(document.createElement('div'), { className: 'dot' })));
  }
  [...el.children].forEach((dot, i) => {
    const won = i < gameWins;
    if (dot.classList.contains('won') !== won) {
      dot.classList.toggle('won', won);
      if (animate) bump(dot, '--bump');
    }
  });
}

// One player's cards in hand, always in the order they were typed; lanes
// mark each card's type on its row, and a hand too long for its share of
// the column scrolls through.
function renderHand(p, side, on, lanes, art) {
  const block = $(`${p}handBlock`);
  const list = side.hand || [];
  const show = on && handTotal(side) > 0;
  block.classList.toggle('hidden', !show);
  block.classList.toggle('typed', lanes);
  setText($(`${p}handCount`), show ? String(handTotal(side)) : '');
  const key = handKey(list, art);
  if (shown.hand[p] === key) return;
  shown.hand[p] = key;
  $(`${p}hand`).replaceChildren(...handEls(list, { art }));
  scrollers[p].restart();
}

function proLine(side) {
  return [side.pronouns, side.record].filter(Boolean).join(' · ');
}

function renderSide(p, side, m, animate) {
  fitText($(`${p}name`), side.name, { size: 34, min: 22, run: 380 });
  setText($(`${p}pro`), proLine(side));
  setText($(`${p}country`), side.country || '');
  if (setText($(`${p}pts`), side.score) && animate) bump($(`${p}pts`), '--bump');
  setText($(`${p}legend`), side.legend || ' ');
  setText($(`${p}champion`), [side.champion, side.archetype].filter(Boolean).join(' · '));
  renderRunes($(`${p}runes`), legendDomains(side));
  renderDots($(`${p}dots`), m.seriesLength, side.gameWins, animate);
  loadHero(p, side);
}

let shownVisible = null;

const params = initStage({
  scene: 'igorows',
  onState(state, first) {
    lastState = state;
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.igorows;
    const animate = !first;

    root.classList.toggle('mode-webcam', scene.mode === 'webcam');
    root.classList.toggle('mode-legend', scene.mode !== 'webcam');
    // Each piece of the game state is the operator's to switch off: the
    // active-turn mark, the points boxes, the turn in the round title.
    const activeOn = scene.activeTurn !== false;
    root.classList.toggle('active-left', activeOn && m.activeSide === 'left');
    root.classList.toggle('active-right', activeOn && m.activeSide === 'right');
    root.classList.toggle('no-points', scene.points === false);

    renderSide('l', m.left, m, animate);
    renderSide('r', m.right, m, animate);
    root.classList.toggle('showdown', Boolean(scene.showdown));
    const lanes = scene.handStyle === 'lanes';
    const art = scene.handArt !== false;
    renderHand('l', m.left, scene.hand, lanes, art);
    renderHand('r', m.right, scene.hand, lanes, art);

    const turnOn = scene.turnCounter !== false && m.turn > 0;
    const round = [bank.event.roundTitle, turnOn ? `Turn ${m.turn}` : ''].filter(Boolean).join(' · ');
    setText($('round'), round);

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

loadLegendDomains(() => {
  if (!lastState) return;
  const m = sceneBank(lastState, params).match;
  renderRunes($('lrunes'), legendDomains(m.left));
  renderRunes($('rrunes'), legendDomains(m.right));
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
