import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps, rotateIfPortrait } from '../../stage/art.js';
import { artSteps, championCardId, loadChampions } from '../../stage/decks.js';
import { clipToWindow, fillWindow, gameNumber, gameWindow } from '../../shared/gamewindow.js';

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

// The legend card itself (2026-09-20, Sam: "for the game intro, can we just
// use the legend's card art instead of the full art?"): the whole card in
// the window, the way the champion and the battlefield show theirs under it,
// full art then the thumb. The hero cutout is still the answer for a legend
// picked without a card.
const legendArt = (side) => [...artSteps(side.legendCardId), ...heroSteps(side)];

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

  // The book takes the whole game window (2026-09-20): the two pages divide
  // its width and the sheet inside each is scaled to its height, so on the
  // rows overlay the intro fills the game area edge to edge. 580 is the name
  // bar, the widest fixed block on a page.
  const win = gameWindow(bank);
  const fit = fillWindow(win, 900, 580);
  // Plays underneath the overlay: nothing of it crosses the chrome.
  clipToWindow(root, win);
  book.style.setProperty('--gx', String(win.x));
  book.style.setProperty('--gy', String(win.y));
  book.style.setProperty('--gw', String(win.w));
  book.style.setProperty('--gh', String(win.h));
  book.style.setProperty('--bs', fit.scale.toFixed(4));

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
