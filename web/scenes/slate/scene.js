import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps } from '../../stage/art.js';
import { clockText, applyVisibility } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

const MESSAGES = {
  starting: 'Starting soon',
  brb: 'Be right back',
  thanks: 'Thanks for watching',
};

// Hero art per table side, keyed so a state push that changes nothing about
// a slot never restarts its image load.
const heroKeys = new Map();
function heroImg(slotKey, side) {
  const img = document.createElement('img');
  img.className = 'art hidden';
  img.alt = '';
  img.draggable = false;
  const steps = heroSteps(side);
  if (steps.length) chainLoad(img, steps); else clearArt(img);
  heroKeys.set(slotKey, side.legendSlug || '');
  return img;
}

function playerBlock(side, right, slotKey) {
  const pl = document.createElement('div');
  pl.className = `pl${right ? ' r' : ''}`;
  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.append(heroImg(slotKey, side));
  const lines = document.createElement('div');
  lines.className = 'lines';
  const n = document.createElement('div');
  n.className = 'n';
  const chip = Object.assign(document.createElement('span'), { className: 'chip', textContent: side.country || '' });
  const nm = Object.assign(document.createElement('span'), { className: 'nm', textContent: side.name || ' ' });
  n.append(chip, nm);
  const l1 = Object.assign(document.createElement('div'), {
    className: 'l1',
    textContent: [side.record, side.seed && `${side.seed} seed`].filter(Boolean).join(' · '),
  });
  const l2 = Object.assign(document.createElement('div'), { className: 'l2', textContent: side.legend || '' });
  lines.append(n, l1, l2);
  pl.append(hero, lines);
  return pl;
}

let tablesKey = null;
function renderTables(tables) {
  const key = JSON.stringify(tables);
  if (key === tablesKey) return;
  tablesKey = key;
  $('tables').replaceChildren(...tables.map((t, i) => {
    const box = document.createElement('div');
    box.className = 'table';
    const tag = Object.assign(document.createElement('span'), { className: 'tag', textContent: t.label || `Table ${i + 1}` });
    const vs = document.createElement('div');
    vs.className = 'vs';
    vs.append(playerBlock(t.left, false, `${i}l`), Object.assign(document.createElement('div'), { className: 'vsmark', textContent: 'VS' }), playerBlock(t.right, true, `${i}r`));
    box.append(tag, vs);
    return box;
  }));
}

// One line per seed: "Name · 8-2-0 · Yasuo". The first segment is the name,
// the rest prints as the small line.
let seedsKey = null;
function renderSeeds(text) {
  if (text === seedsKey) return;
  seedsKey = text;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);
  $('seedsBlock').classList.toggle('hidden', lines.length === 0);
  $('seeds').replaceChildren(...lines.map((line, i) => {
    const [name, ...rest] = line.split(/\s*[·|,]\s*/);
    const s = document.createElement('div');
    s.className = 's';
    s.append(
      Object.assign(document.createElement('div'), { className: 'sd', textContent: String(i + 1) }),
      Object.assign(document.createElement('div'), { className: 'nm', textContent: name }),
      Object.assign(document.createElement('div'), { className: 'rc', textContent: rest.join(' · ') }),
    );
    return s;
  }));
}

let castersKey = null;
function renderCasters(casters) {
  const key = JSON.stringify(casters);
  if (key === castersKey) return;
  castersKey = key;
  $('castBox').classList.toggle('hidden', casters.length === 0);
  $('casters').replaceChildren(...casters.map((c) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      Object.assign(document.createElement('span'), { className: 'nm', textContent: c.name }),
      Object.assign(document.createElement('span'), { className: 'label', textContent: c.role || '' }),
    );
    return row;
  }));
}

let countdownState = null;
setInterval(() => {
  if (!root.classList.contains('off')) setText($('countdown'), clockText(countdownState));
}, 250);

let shownVisible = null;

const params = initStage({
  scene: 'slate',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.slate;
    const ev = bank.event;

    const upnext = scene.mode === 'upnext';
    root.classList.toggle('mode-upnext', upnext);
    root.classList.toggle('mode-message', !upnext);

    setText($('eyebrow'), ev.name || '');
    setText($('sub'), ev.roundTitle || '');
    renderTables(ev.tables || []);
    renderSeeds(ev.seeds || '');

    setText($('msgEyebrow'), ev.name || '');
    setText($('msgTitle'), scene.mode === 'custom' ? (scene.text || ' ') : (MESSAGES[scene.mode] || ' '));
    setText($('msgSub'), ev.roundTitle || '');

    renderCasters(ev.casters || []);
    $('countBox').classList.toggle('hidden', !scene.countdown);
    countdownState = ev.countdown || countdownState;
    setText($('countdown'), clockText(countdownState));

    const logo = state.theme.logo || '';
    const logoEl = $('footLogo');
    if (logoEl.getAttribute('src') !== (logo || null)) {
      if (logo) logoEl.src = logo; else logoEl.removeAttribute('src');
    }
    logoEl.classList.toggle('hidden', !logo);
    setText($('footEvent'), ev.name || '');

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
