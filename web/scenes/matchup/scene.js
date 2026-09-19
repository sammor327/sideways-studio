import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps, rotateIfPortrait } from '../../stage/art.js';
import { artSteps, championCardId, loadChampions } from '../../stage/decks.js';
import { fitInto, gameNumber, gameWindow } from '../../shared/gamewindow.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const book = $('book');
// In is the whole build (the book opens, then its parts arrive in turn);
// out is a quick fade, so taking it off never waits on the build backwards.
const inClock = new SeekClock(root, '--t', 1800);
const outClock = new SeekClock(root, '--o', 400);

const shown = {};
function load(img, key, steps, onShow) {
  if (shown[img.id] === key) return;
  shown[img.id] = key;
  if (img.parentElement) delete img.parentElement.dataset.tier;
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps, onShow);
}

// The legend card's painting (full art, then the thumb), in the same crop
// for both players; the hero cutout only for a legend picked without a card.
const legendArt = (side) => [
  ...(side.legendCardId ? [
    { src: `/cardart/full/${side.legendCardId}.webp`, cls: 'crop-legend' },
    { src: `/cardart/thumb/${side.legendCardId}.webp`, cls: 'crop-legend' },
  ] : []),
  ...heroSteps(side),
];

function renderSide(p, side) {
  setText($(`${p}name`), side.name || ' ');
  setText($(`${p}country`), side.country || '');
  setText($(`${p}legend`), side.legend || '');
  load($(`${p}hero`), `${side.legendCardId || ''}|${side.legendSlug || ''}`, legendArt(side));
  const champ = championCardId(side);
  $(`${p}champSlot`).classList.toggle('empty', !champ);
  load($(`${p}champ`), champ, artSteps(champ));
  const bf = side.battlefieldCardId || '';
  $(`${p}bfSlot`).classList.toggle('empty', !bf);
  load($(`${p}bf`), bf, artSteps(bf), rotateIfPortrait);
}

let shownVisible = null;
function setVisible(visible, first) {
  if (visible === shownVisible) return;
  shownVisible = visible;
  if (first) {
    root.classList.toggle('off', !visible);
    inClock.seek(1);
    outClock.seek(1);
    return;
  }
  if (visible) {
    outClock.stop();
    outClock.seek(1);
    root.classList.remove('off');
    inClock.play({ from: 0, to: 1 });
  } else {
    inClock.stop();
    outClock.play({ from: 1, to: 0 }).then(() => {
      if (shownVisible) return;
      root.classList.add('off');
      outClock.seek(1);
    });
  }
}

let lastState = null;

function render(state, first) {
  const bank = sceneBank(state, params);
  const m = bank.match;
  const cfg = bank.scenes.matchup || { visible: false, game: 0 };

  const fit = fitInto(gameWindow(bank), 1600, 900, { margin: 20, max: 1.1 });
  book.style.setProperty('--gx', fit.x.toFixed(1));
  book.style.setProperty('--gy', fit.y.toFixed(1));
  book.style.setProperty('--gs', fit.scale.toFixed(4));

  setText($('roundTitle'), bank.event.roundTitle || 'Feature match');
  setText($('eventName'), bank.event.name || '');
  setText($('gameTitle'), `Game ${gameNumber(m, cfg.game)}`);
  const wins = (m.left.gameWins || 0) + (m.right.gameWins || 0);
  setText($('series'), `Best of ${m.seriesLength}${wins ? ` · ${m.left.gameWins} - ${m.right.gameWins}` : ''}`);
  renderSide('l', m.left);
  renderSide('r', m.right);

  const visible = params.force || Boolean(cfg.visible);
  $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
  setVisible(visible, first);
}

const params = initStage({
  scene: 'matchup',
  onState(state, first) {
    lastState = state;
    $('diag').classList.remove('on');
    render(state, first);
  },
});

// The champion cards resolve by name through the catalog, which arrives
// after the first state.
loadChampions().then(() => { if (lastState) render(lastState, false); });

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
