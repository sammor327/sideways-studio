import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump, startLoop } from '../../stage/seekclock.js';

const $ = (id) => document.getElementById(id);
const bug = $('bug');
const inOut = new SeekClock(bug, '--t', 700);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

let shown = null;

function renderTicks(el, seriesLength, gameWins, animate) {
  const slots = winsNeeded(seriesLength);
  if (el.children.length !== slots) {
    el.replaceChildren(...Array.from({ length: slots }, () => {
      const d = document.createElement('div');
      d.className = 'tick';
      return d;
    }));
  }
  [...el.children].forEach((tick, i) => {
    const won = i < gameWins;
    if (tick.classList.contains('won') !== won) {
      tick.classList.toggle('won', won);
      if (animate) bump(tick, '--bump');
    }
  });
}

function renderSide(prefix, side, seriesLength, animate) {
  setText($(`${prefix}name`), side.name || ' ');
  if (setText($(`${prefix}score`), side.score) && animate) {
    bump($(`${prefix}score`), '--bump');
  }
  renderTicks($(`${prefix}ticks`), seriesLength, side.gameWins, animate);
}

const params = initStage({
  scene: 'scorebug',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    // Data-change animations only on real changes after the first paint.
    renderSide('l', m.left, m.seriesLength, !first);
    renderSide('r', m.right, m.seriesLength, !first);

    // A plain browser open (no transparent, no preview) explains a hidden bug
    // instead of showing an empty page. The broadcast URL stays clean.
    const visible = params.force || bank.scenes.scorebug.visible;
    $('hiddenHint').classList.toggle('on',
      !params.transparent && !params.preview && !visible);
    if (visible === shown) return;
    shown = visible;
    if (first) {
      // Fresh load (including OBS "shutdown when hidden" reloads): snap to
      // the current state, no entrance animation replay.
      bug.classList.toggle('off', !visible);
      inOut.seek(visible ? 1 : 0);
    } else if (visible) {
      bug.classList.remove('off');
      inOut.play({ from: 0, to: 1 });
    } else {
      inOut.play({ from: 1, to: 0 }).then(() => {
        if (!shown) bug.classList.add('off');
      });
    }
  },
});

// Ambient shimmer pauses while the bug is hidden: a browser source should
// cost nothing when it shows nothing.
startLoop(document.documentElement, '--loop', 6000, {
  active: () => !bug.classList.contains('off'),
});

// Nothing on air before the first state is normal; only surface a diagnostic
// if the server still has not answered after a few seconds.
setTimeout(() => {
  if (shown === null) $('diag').classList.add('on');
}, 4000);
