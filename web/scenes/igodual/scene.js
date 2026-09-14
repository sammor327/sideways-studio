import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';
import {
  chainLoad, clearArt, cardSteps, legendSteps, heroSteps, battlefieldSteps, rotateIfPortrait,
} from '../../stage/art.js';

const $ = (id) => document.getElementById(id);
const dual = $('dual');
const inOut = new SeekClock(dual, '--t', 550);
const flip = new SeekClock($('cardSlot'), '--flip', 420);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

// What each slot currently shows, so a state push that changes nothing
// about a slot never restarts its image load.
const shown = { legend: {}, hero: {}, bf: {}, card: null };

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
  // Both tiers failing lands on the initial chip, never a broken image.
  const fail = img.onerror;
  img.onerror = () => {
    fail();
    if (!img.getAttribute('src')) {
      chip.textContent = (side.legend || key)[0].toUpperCase();
      chip.classList.add('on');
    }
  };
}

function loadBattlefield(p, side) {
  const id = side.battlefieldCardId || '';
  if (shown.bf[p] === id) return;
  shown.bf[p] = id;
  const img = $(`${p}bfImg`);
  if (!id) { clearArt(img); return; }
  chainLoad(img, battlefieldSteps(id), rotateIfPortrait);
}

// The docked featured card is the card popup's card while the popup is on;
// the popup itself stands down (see cardpopup/scene.js). Empty: the trim
// ring or the event logo, dimmed, never a blank box.
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
  if (!id) {
    clearArt(img);
    empty.classList.remove('hidden');
    return;
  }
  chainLoad(img, cardSteps(id), () => empty.classList.add('hidden'));
  img.onerror = ((next) => () => { next(); if (!img.getAttribute('src')) empty.classList.remove('hidden'); })(img.onerror);
  if (changed && animate) flip.play({ from: 0, to: 1 });
}

function renderPips(el, seriesLength, gameWins, animate) {
  const slots = winsNeeded(seriesLength);
  if (el.children.length !== slots) {
    el.replaceChildren(...Array.from({ length: slots }, () => {
      const d = document.createElement('div');
      d.className = 'pip';
      return d;
    }));
  }
  [...el.children].forEach((pip, i) => {
    const won = i < gameWins;
    if (pip.classList.contains('won') !== won) {
      pip.classList.toggle('won', won);
      if (animate) bump(pip, '--bump');
    }
  });
}

// 1 2 3 4 5 6 7 [8] 7 6 5 4 3 2 1. The left player's points light the pip
// at that number on the left run, the right player's on the right run; 8
// is the shared goal pip in the middle and lights for whoever reaches it.
const TRACK = [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1];
function renderTrack(el, left, right, animate) {
  if (el.children.length !== TRACK.length) {
    el.replaceChildren(...TRACK.map((n, i) => {
      const d = document.createElement('div');
      d.className = `tpip${n === 8 ? ' goal' : ''}`;
      d.textContent = String(n);
      d.dataset.side = i < 7 ? 'a' : (i > 7 ? 'b' : 'goal');
      d.dataset.n = String(n);
      return d;
    }));
  }
  [...el.children].forEach((pip) => {
    const n = Number(pip.dataset.n);
    const litA = (pip.dataset.side === 'a' && left === n) || (pip.dataset.side === 'goal' && left === 8);
    const litB = (pip.dataset.side === 'b' && right === n) || (pip.dataset.side === 'goal' && right === 8 && left !== 8);
    const was = pip.classList.contains('lit-a') || pip.classList.contains('lit-b');
    pip.classList.toggle('lit-a', litA);
    pip.classList.toggle('lit-b', litB && !litA);
    const now = litA || litB;
    if (now !== was && now && animate) bump(pip, '--bump');
  });
}

// --- clock: wall-clock arithmetic from the timer's three numbers, so every
// output shows the same time without a tick from the server ---

let timerState = { running: false, startedAt: 0, elapsed: 0, countdown: 0 };
function clockText() {
  const t = timerState;
  const total = t.elapsed + (t.running ? Date.now() - t.startedAt : 0);
  const ms = t.countdown > 0 ? Math.max(0, t.countdown - total) : total;
  // Minutes past the hour stay minutes (76:20), the way a round clock reads.
  const s = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
setInterval(() => {
  if (!dual.classList.contains('off')) setText($('clock'), clockText());
}, 250);

// The banner is 282px wide and the name is set at 30px caps; a long name
// shrinks to fit, to a floor of 20px, and only then takes an ellipsis.
// Measured on a canvas (never layout) so it works the same in an occluded
// browser source, and in caps because that is what renders.
const gauge = document.createElement('canvas').getContext('2d');
const NAME_SIZE = 30;
const NAME_MIN = 20;
const NAME_RUN = 282;
function fitName(el, raw) {
  const text = String(raw || ' ').toUpperCase();
  let size = NAME_SIZE;
  try {
    const family = getComputedStyle(el).fontFamily;
    const measure = (px) => {
      gauge.font = `800 ${px}px ${family}`;
      return gauge.measureText(text).width + text.length * 0.5;
    };
    let width = measure(size);
    for (let i = 0; i < 6 && width > NAME_RUN && size > NAME_MIN; i += 1) {
      size = Math.max(NAME_MIN, (size * NAME_RUN) / width);
      width = measure(size);
    }
  } catch {
    size = NAME_SIZE;
  }
  el.style.fontSize = `calc(${size.toFixed(2)} * var(--u))`;
  return setText(el, text);
}

function renderSide(p, side, m, animate) {
  if (fitName($(`${p}name`), side.name) && animate) bump($(`${p}name`), '--slide', 500);
  setText($(`${p}legend`), side.legend || ' ');
  setText($(`${p}champion`), side.champion || '');
  setText($(`${p}bf`), side.battlefield || '');
  setText($(`${p}seed`), side.seed || '');
  renderPips($(`${p}pips`), m.seriesLength, side.gameWins, animate);
  loadLegend(p, side);
  loadHero(p, side);
  loadBattlefield(p, side);
}

let shownVisible = null;

const params = initStage({
  scene: 'igodual',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.igodual;
    const animate = !first;

    dual.classList.toggle('mode-webcam', scene.mode === 'webcam');
    dual.classList.toggle('mode-legend', scene.mode !== 'webcam');

    renderSide('l', m.left, m, animate);
    renderSide('r', m.right, m, animate);

    $('track').classList.toggle('hidden', !scene.track);
    renderTrack($('track'), m.left.score, m.right.score, animate);

    // Event block: logo, event name, round title, clock.
    const logo = state.theme.logo || '';
    const logoEl = $('eventLogo');
    if (logoEl.getAttribute('src') !== (logo || null)) {
      if (logo) logoEl.src = logo; else logoEl.removeAttribute('src');
    }
    logoEl.classList.toggle('hidden', !logo);
    setText($('eventName'), bank.event.name || '');
    setText($('roundTitle'), bank.event.roundTitle || '');
    $('eventBlock').classList.toggle('hidden', !scene.eventBlock);
    $('clock').classList.toggle('hidden', !scene.clock);
    timerState = m.timer || timerState;
    setText($('clock'), clockText());

    $('cardSlot').classList.toggle('hidden', !scene.cardSlot);
    loadCard(bank, logo, animate);

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    if (visible === shownVisible) return;
    shownVisible = visible;
    if (first) {
      // Fresh loads, including an OBS "shutdown source when hidden" reload,
      // snap to the current state instead of replaying the entrance.
      dual.classList.toggle('off', !visible);
      inOut.seek(visible ? 1 : 0);
    } else if (visible) {
      dual.classList.remove('off');
      inOut.play({ from: 0, to: 1 });
    } else {
      inOut.play({ from: 1, to: 0 }).then(() => {
        if (!shownVisible) dual.classList.add('off');
      });
    }
  },
});

// Nothing on air before the first state is normal; only surface a diagnostic
// if the server still has not answered after a few seconds.
setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
