import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps } from '../../stage/art.js';
import { artSteps } from '../../stage/decks.js';
import { clipToWindow, gameWindow } from '../../shared/gamewindow.js';
import { gameWinner, gamesToWin, victory } from '../../shared/victory.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const plate = $('plate');
// In is the build; out is a quick fade, so taking it off never plays the
// build backwards.
const inClock = new SeekClock(root, '--t', 700);
const outClock = new SeekClock(root, '--o', 400);

// The plate is designed 1200 x 280 and takes four fifths of the game window's
// width, down to nothing smaller than half. Everything inside is drawn in
// that design and scaled by one factor (--ps), so the plate keeps its shape
// in the portrait overlay's narrow window as well as the whole frame.
const DESIGN_W = 1200;
function place(win) {
  const w = Math.min(DESIGN_W, Math.max(win.w * 0.55, win.w - 220));
  const scale = Math.min(w / DESIGN_W, win.h / 420);
  plate.style.setProperty('--gx', String(win.x));
  plate.style.setProperty('--gy', String(win.y));
  plate.style.setProperty('--gw', String(win.w));
  plate.style.setProperty('--gh', String(win.h));
  plate.style.setProperty('--pw', (DESIGN_W * scale).toFixed(1));
  plate.style.setProperty('--ph', (280 * scale).toFixed(1));
  plate.style.setProperty('--ps', scale.toFixed(4));
}

let heroKey = null;
function loadHero(side) {
  const key = `${side.legendCardId || ''}|${side.legendSlug || ''}`;
  if (heroKey === key) return;
  heroKey = key;
  const img = $('hero');
  const steps = [...artSteps(side.legendCardId), ...heroSteps(side)];
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

// A pip for every game it takes to win, filled from the outside in: the left
// player's wins on the left, the right player's on the right, so the bar
// reads like the series does.
let pipKey = null;
function renderPips(match) {
  const need = gamesToWin(match);
  const l = Math.min(match.left.gameWins || 0, need);
  const r = Math.min(match.right.gameWins || 0, need);
  const key = `${need}|${l}|${r}`;
  if (pipKey === key) return;
  pipKey = key;
  const cells = [];
  for (let i = 0; i < need; i += 1) cells.push(i < l ? 'l' : '');
  for (let i = 0; i < need; i += 1) cells.push(need - 1 - i < r ? 'r' : '');
  $('pips').replaceChildren(...cells.map((cls) => {
    const s = document.createElement('span');
    if (cls) s.className = cls;
    return s;
  }));
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

const params = initStage({
  scene: 'gamewin',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const cfg = bank.scenes.gamewin;

    const win = gameWindow(bank);
    // Plays underneath the overlay, like the game intro: nothing of it
    // crosses the chrome.
    clipToWindow(root, win);
    place(win);

    const key = gameWinner(m, cfg.side);
    const v = victory(m, key);
    // The game that just FINISHED, which is the one the games add up to, not
    // the one coming next the way the game intro counts it. Pinned 1 to 5
    // under Graphic features when the operator would rather say.
    const played = (m.left.gameWins || 0) + (m.right.gameWins || 0);
    setText($('game'), `Game ${cfg.game > 0 ? cfg.game : Math.max(1, played)}`);
    setText($('bestOf'), v.bestOf);
    setText($('won'), v.won ? 'Game winner' : 'Game over');
    setText($('country'), v.won ? (v.winner.country || '') : '');
    setText($('name'), v.won ? (v.winner.name || ' ') : 'Level on games');
    setText($('legend'), v.won ? (v.winner.legend || '') : '');
    setText($('lwins'), m.left.gameWins || 0);
    setText($('rwins'), m.right.gameWins || 0);
    setText($('lshort'), m.left.name || ' ');
    setText($('rshort'), m.right.name || ' ');
    renderPips(m);
    loadHero(v.won ? v.winner : {});

    const visible = params.force || Boolean(cfg.visible);
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    setVisible(visible, first);
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
