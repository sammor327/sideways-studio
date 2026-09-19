// Sideboard card spotted (2026-09-19): scenes.sidespot.spot is the latest
// card spotted (the spot cue: the RiftAtlas reader when a card a player
// sided in turns up in their hand after turn 1, or the panel by hand).
// While the graphic is on air, each new spot flies in from its player's side
// of the game window and flies out again `hold` seconds after it was
// spotted; the spot's own moment (at) sets that, so every source, and a
// source that reloads mid-hold, agrees on when it goes.
import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, animEnabled, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, cardSteps } from '../../stage/art.js';
import { scheduleNameFit } from '../../stage/fitnames.js';
import { clipToWindow, gameWindow } from '../../shared/gamewindow.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const spotEl = $('spot');
const lift = $('lift');
// One property, two speeds: the fly in takes its time, the fly out does not.
const inClock = new SeekClock(lift, '--t', 900);
const outClock = new SeekClock(lift, '--t', 450);
const sweepClock = new SeekClock(lift, '--s', 1100);

// The design block: the 420 x 583 ringed card, the 16 gap and the plate.
const W = 420;
const H = 583 + 16 + 90;
const MARGIN = 40;

let lastState = null;
let shown = 0; // the id of the spot on screen, 0 for none
let started = false;
let outTimer = null;
let pulseTimer = null;
let token = 0;

// Against the game window's edge on the player's side, vertically centred,
// scaled down only when the window is too small for it.
function place(bank, side) {
  const win = gameWindow(bank);
  clipToWindow(root, win);
  const k = Math.max(0.4, Math.min(1, (win.h - 2 * MARGIN) / H, (win.w - 2 * MARGIN) / W));
  const left = side === 'left';
  const x = left ? win.x + MARGIN : win.x + win.w - MARGIN - W * k;
  const y = win.y + (win.h - H * k) / 2;
  // It starts fully outside the window, on its own side.
  const dx = left ? -((x - win.x) / k + W + 80) : ((win.x + win.w - x) / k + 80);
  const s = spotEl.style;
  s.setProperty('--x', x.toFixed(1));
  s.setProperty('--y', y.toFixed(1));
  s.setProperty('--k', k.toFixed(4));
  s.setProperty('--dx', dx.toFixed(1));
  s.setProperty('--ry', left ? '-38deg' : '38deg');
  spotEl.classList.toggle('from-left', left);
  spotEl.classList.toggle('from-right', !left);
}

// The card (full art, then the thumb, then its name on a panel) and the
// name under it: the one the spot was made with, else the side's own.
function fill(bank, spot) {
  const side = bank.match[spot.side] || {};
  setText($('who'), spot.player || side.name || '');
  const miss = $('cardMiss');
  setText(miss, spot.cardName || '');
  const img = $('cardArt');
  if (img.dataset.card === (spot.cardId || '')) return;
  img.dataset.card = spot.cardId || '';
  miss.classList.remove('gone');
  if (spot.cardId) chainLoad(img, cardSteps(spot.cardId), () => miss.classList.add('gone'));
  else clearArt(img);
}

// The glow breathes while a card is up; the waveform is worked out here so
// the CSS only multiplies.
function breathe(on) {
  clearInterval(pulseTimer);
  pulseTimer = null;
  if (!on || !animEnabled()) {
    lift.style.setProperty('--p', '0.5');
    return;
  }
  const t0 = Date.now();
  pulseTimer = setInterval(() => {
    const phase = ((Date.now() - t0) % 2400) / 2400;
    lift.style.setProperty('--p', (0.5 - 0.5 * Math.cos(2 * Math.PI * phase)).toFixed(3));
  }, 100);
}

async function flyIn(bank, spot, my) {
  place(bank, spot.side);
  fill(bank, spot);
  outClock.stop();
  sweepClock.seek(0);
  root.classList.remove('off');
  breathe(true);
  scheduleNameFit();
  await inClock.play({ from: 0, to: 1 });
  if (my !== token) return;
  bump(lift, '--b', 420);
  sweepClock.play({ from: 0, to: 1 });
}

async function flyOut(my) {
  inClock.stop();
  sweepClock.stop();
  await outClock.play({ from: 1, to: 0 });
  if (my !== token) return false;
  return true;
}

async function render(state, first) {
  lastState = state;
  const bank = sceneBank(state, params);
  const cfg = bank.scenes.sidespot || {};
  const spot = cfg.spot || {};
  const hasCard = Boolean(spot.id && (spot.side === 'left' || spot.side === 'right') && (spot.cardId || spot.cardName));
  const on = params.force || Boolean(cfg.visible);
  // The panel's picture and the look builder's tile hold the card up.
  const pinned = params.force || Boolean(params.tile);
  const until = spot.at ? spot.at + (Number(cfg.hold) || 8) * 1000 : 0;
  const live = on && hasCard && (pinned || Date.now() < until);
  $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !live);
  $('diag').classList.remove('on');

  clearTimeout(outTimer);
  if (live && !pinned) outTimer = setTimeout(() => { if (lastState) render(lastState, false); }, Math.max(0, until - Date.now()) + 30);

  const want = live ? spot.id : 0;
  // A fresh load (an OBS reload mid-hold included) snaps to where things
  // stand: no fly for a card that was already up.
  if (first || !started) {
    started = true;
    shown = want;
    if (want) {
      place(bank, spot.side);
      fill(bank, spot);
      root.classList.remove('off');
      inClock.seek(1);
      sweepClock.seek(1);
      breathe(true);
    } else {
      root.classList.add('off');
      inClock.seek(0);
      breathe(false);
    }
    return;
  }
  if (want === shown) {
    // Nothing new: the same card still up follows a name, a look or an
    // overlay change, and a fly already under way carries on.
    if (want) {
      place(bank, spot.side);
      fill(bank, spot);
    }
    return;
  }
  const my = ++token;
  const was = shown;
  shown = want;

  // Whatever is up goes first, then the new card comes in.
  if (was && !(await flyOut(my))) return;
  if (!want) {
    root.classList.add('off');
    breathe(false);
    return;
  }
  flyIn(bank, spot, my);
}

const params = initStage({
  scene: 'sidespot',
  onState(state, first) {
    render(state, first);
  },
});

// Nothing on air before the first state is normal; only surface a diagnostic
// if the server still has not answered after a few seconds.
setTimeout(() => {
  if (!started) $('diag').classList.add('on');
}, 4000);
