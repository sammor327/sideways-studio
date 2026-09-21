import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, fullSteps, heroSteps } from '../../stage/art.js';
import { artSteps } from '../../stage/decks.js';
import { matchWinner, victory } from '../../shared/victory.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inClock = new SeekClock(root, '--t', 900);
const outClock = new SeekClock(root, '--o', 400);

const shown = {};
function load(img, key, steps) {
  if (shown[img.id] === key) return;
  shown[img.id] = key;
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
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

// "beat THEO BRANDT 2 - 1": one line rather than a second name plate, so
// the frame stays the winner's.
function renderBeat(v) {
  const el = $('beat');
  const loser = v.won ? (v.loser.name || '') : '';
  const want = `${loser}|${v.games}`;
  if (el.dataset.want === want) return;
  el.dataset.want = want;
  if (!loser) { el.replaceChildren(); return; }
  el.replaceChildren(
    document.createTextNode('beat '),
    Object.assign(document.createElement('b'), { textContent: loser }),
    document.createTextNode(` ${v.games}`),
  );
}

const params = initStage({
  scene: 'matchwin',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const cfg = bank.scenes.matchwin;
    const v = victory(m, matchWinner(m, cfg.side));

    setText($('round'), bank.event.roundTitle || 'Feature match');
    setText($('event'), bank.event.name || '');
    setText($('country'), v.won ? (v.winner.country || '') : '');
    setText($('name'), v.won ? (v.winner.name || ' ') : 'No winner yet');
    setText($('legend'), v.won ? (v.winner.legend || '') : '');
    setText($('games'), v.games);
    setText($('points'), v.points);
    setText($('bestOf'), v.bestOf);
    // The line the operator types under Match card and result: where the
    // winner goes next. The result strip prints the same one.
    setText($('adv'), v.won ? (m.result.note || '') : '');
    renderBeat(v);

    // The legend's full figure behind, its card in the crest: the two
    // pictures of a legend this app keeps, each in the place it suits.
    const side = v.won ? v.winner : {};
    const key = `${side.legendCardId || ''}|${side.legendSlug || ''}`;
    load($('figure'), key, [...fullSteps(side), ...heroSteps(side)]);
    load($('legendCard'), key, [...artSteps(side.legendCardId), ...heroSteps(side)]);

    const visible = params.force || Boolean(cfg.visible);
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    setVisible(visible, first);
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
