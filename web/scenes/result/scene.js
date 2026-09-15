import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 700);

let heroKey = null;
function loadHero(side) {
  const key = side.legendSlug || '';
  if (heroKey === key) return;
  heroKey = key;
  const img = $('hero');
  const steps = heroSteps(side);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

let shownVisible = null;

const params = initStage({
  scene: 'result',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.result;
    // The winner the operator set, or the side that took the series if
    // nobody set one: the strip can then fire straight off the game wins.
    const need = Math.ceil(m.seriesLength / 2);
    const winnerKey = m.result.winner || (m.left.gameWins >= need ? 'left' : (m.right.gameWins >= need ? 'right' : ''));
    const winner = winnerKey === 'right' ? m.right : m.left;

    setText($('lname'), m.left.name || ' ');
    setText($('rname'), m.right.name || ' ');
    setText($('lwins'), m.left.gameWins);
    setText($('rwins'), m.right.gameWins);

    setText($('round'), bank.event.roundTitle || bank.event.name || 'Feature match');
    setText($('games'), `Best of ${m.seriesLength}`);
    setText($('points'), winnerKey ? `${m.left.score} - ${m.right.score}` : '');
    setText($('winnerLabel'), winnerKey ? 'Match winner' : 'Result');
    setText($('country'), winnerKey ? (winner.country || '') : '');
    setText($('name'), winnerKey ? (winner.name || ' ') : 'No winner set');
    const adv = $('adv');
    const note = m.result.note || '';
    const legend = winnerKey ? (winner.legend || '') : '';
    const want = `${legend}|${note}`;
    if (adv.dataset.want !== want) {
      adv.dataset.want = want;
      adv.replaceChildren(...[
        legend ? document.createTextNode(legend + (note ? ' · ' : '')) : null,
        note ? Object.assign(document.createElement('b'), { textContent: note }) : null,
      ].filter(Boolean));
    }
    loadHero(winnerKey ? winner : {});

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
