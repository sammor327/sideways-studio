import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { clockText, applyVisibility } from '../../stage/exp.js';
import { setClock } from '../../shared/clockcells.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 500);

let countdownState = null;
setInterval(() => {
  if (!root.classList.contains('off')) setClock($('clock'), clockText(countdownState));
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

    // match: the two names with the round under them; round: the round
    // title with the event under it; custom: the operator's own line.
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
      sub = '';
    }
    setText($('main'), main);
    setText($('sub'), sub);
    countdownState = ev.countdown || countdownState;
    setClock($('clock'), clockText(countdownState));
    // A clock that was never set (0 counting up from 0) is noise, not a time.
    const c = ev.countdown || {};
    $('clock').classList.toggle('hidden', !(c.countdown > 0 || c.running || c.elapsed > 0));

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
