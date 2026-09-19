import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { clockText, applyVisibility } from '../../stage/exp.js';
import { setClock } from '../../shared/clockcells.js';
import { tagPlace, clipInset } from '../../shared/anchor.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 500);

// Where the tag sits (web/shared/anchor.js): the frame's top right, or the
// top right corner of the game area an in-game overlay leaves, below the
// sponsor plate when that is there. Measured at its drawn size; while it is
// off, with nothing to measure, the widest and tallest it draws stand in.
// With an overlay up the tag comes in under the overlay's chrome (clip).
let lastBank = null;
let placed = '';
function place() {
  if (!lastBank) return;
  const tag = $('tag');
  const u = Math.min(innerWidth / 1920, innerHeight / 1080) || 1;
  const at = tagPlace(lastBank, tag.offsetWidth ? { w: tag.offsetWidth / u, h: tag.offsetHeight / u } : undefined);
  const key = JSON.stringify([at.right, at.top, at.clip]);
  if (key === placed) return;
  placed = key;
  root.style.setProperty('--tr', String(at.right));
  root.style.setProperty('--tt', String(at.top));
  root.style.clipPath = clipInset(at.clip);
}

let countdownState = null;
setInterval(() => {
  if (root.classList.contains('off')) return;
  setClock($('clock'), clockText(countdownState));
  // A face that lands late changes the tag's width.
  place();
}, 250);

let shownVisible = null;

const params = initStage({
  scene: 'cornertag',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.cornertag;
    const m = bank.match;
    const ev = bank.event;
    lastBank = bank;

    // match: the two names with the round under them; round: the round
    // title with the event under it; custom: the operator's own two lines.
    let main = '';
    let sub = '';
    if (scene.mode === 'match') {
      main = [m.left.name, m.right.name].filter(Boolean).join(' vs ') || ev.roundTitle || ' ';
      sub = m.left.name && m.right.name ? (ev.roundTitle || '') : '';
    } else if (scene.mode === 'round') {
      main = ev.roundTitle || ev.name || ' ';
      sub = ev.roundTitle ? (ev.name || '') : '';
    } else {
      main = scene.text || ' ';
      sub = scene.sub || '';
    }
    setText($('main'), main);
    setText($('sub'), sub);
    // The label box: "Up next", or the operator's own word, and it can be
    // switched off (2026-09-19, Sam: "ability to toggle the up next").
    setText($('key'), scene.label || 'Up next');
    $('key').classList.toggle('hidden', scene.showLabel === false);
    countdownState = ev.countdown || countdownState;
    setClock($('clock'), clockText(countdownState));
    // A clock that was never set (0 counting up from 0) is noise, not a time;
    // the Clock switch takes it off whatever it holds.
    const c = ev.countdown || {};
    $('clock').classList.toggle('hidden', scene.clock === false || !(c.countdown > 0 || c.running || c.elapsed > 0));

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
    place();
  },
});

document.fonts.addEventListener('loadingdone', place);

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
