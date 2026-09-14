import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, legendSteps, heroSteps } from '../../stage/art.js';

const $ = (id) => document.getElementById(id);
const bars = $('bars');
const inOut = new SeekClock(bars, '--t', 550);

// What each slot currently shows, so a state push that changes nothing
// about a slot never restarts its image load.
const shown = { legend: {}, hero: {} };

// One teammate, in the shape the shared art helpers read (a side). The
// second player's fields are the flat *2 fields on the same side.
function mate(side, n) {
  return n === 1
    ? { name: side.name, legend: side.legend, legendSlug: side.legendSlug, legendCardId: side.legendCardId, champion: side.champion }
    : { name: side.name2, legend: side.legend2, legendSlug: side.legendSlug2, legendCardId: side.legendCardId2, champion: side.champion2 };
}

function loadLegend(key, m) {
  const want = `${m.legendCardId || ''}|${m.legendSlug || ''}`;
  if (shown.legend[key] === want) return;
  shown.legend[key] = want;
  const img = $(`${key}legendImg`);
  const steps = legendSteps(m);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

function loadHero(key, m) {
  const want = m.legendSlug || '';
  if (shown.hero[key] === want) return;
  shown.hero[key] = want;
  const img = $(`${key}hero`);
  const chip = $(`${key}chip`);
  chip.classList.remove('on');
  const steps = heroSteps(m);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
  // Both tiers failing lands on the initial chip, never a broken image.
  const fail = img.onerror;
  img.onerror = () => {
    fail();
    if (!img.getAttribute('src')) {
      chip.textContent = (m.legend || want)[0].toUpperCase();
      chip.classList.add('on');
    }
  };
}

// A name runs from the bar's corner to the cluster, 440px, set at 26px
// caps; a long name shrinks to fit, to a floor of 18px, and only then takes
// an ellipsis. Measured on a canvas (never layout) so it works the same in
// an occluded browser source, and in caps because that is what renders.
const gauge = document.createElement('canvas').getContext('2d');
const NAME_SIZE = 26;
const NAME_MIN = 18;
const NAME_RUN = 440;
function fitName(el, raw) {
  const text = String(raw || ' ').toUpperCase();
  let size = NAME_SIZE;
  try {
    const family = getComputedStyle(el).fontFamily;
    const measure = (px) => {
      gauge.font = `800 ${px}px ${family}`;
      return gauge.measureText(text).width + text.length * 3;
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

function renderBar(p, side, animate) {
  for (const n of [1, 2]) {
    const m = mate(side, n);
    const key = `${p}${n}`;
    if (fitName($(`${key}name`), m.name) && animate) bump($(`${key}name`), '--slide', 500);
    setText($(`${key}legend`), m.legend || ' ');
    setText($(`${key}champ`), m.champion || '');
    loadLegend(key, m);
    loadHero(key, m);
  }
  if (setText($(`${p}score`), String(side.score)) && animate) bump($(`${p}score`), '--bump');
}

let shownVisible = null;

const params = initStage({
  scene: 'igobars',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.igobars;
    const animate = !first;

    bars.classList.toggle('mode-webcam', scene.mode === 'webcam');
    bars.classList.toggle('mode-legend', scene.mode !== 'webcam');

    // Team 1 (the P1 side) takes the top bar, team 2 the bottom.
    renderBar('t', m.left, animate);
    renderBar('b', m.right, animate);

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    if (visible === shownVisible) return;
    shownVisible = visible;
    if (first) {
      // Fresh loads, including an OBS "shutdown source when hidden" reload,
      // snap to the current state instead of replaying the entrance.
      bars.classList.toggle('off', !visible);
      inOut.seek(visible ? 1 : 0);
    } else if (visible) {
      bars.classList.remove('off');
      inOut.play({ from: 0, to: 1 });
    } else {
      inOut.play({ from: 1, to: 0 }).then(() => {
        if (!shownVisible) bars.classList.add('off');
      });
    }
  },
});

// Nothing on air before the first state is normal; only surface a diagnostic
// if the server still has not answered after a few seconds.
setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
