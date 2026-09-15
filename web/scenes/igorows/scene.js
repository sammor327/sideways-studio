import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps } from '../../stage/art.js';
import { fitText, renderRunes, runeSrc, loadLegendDomains, legendDomains, applyVisibility, DOMAINS } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 550);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

const shown = { hero: {}, hand: {} };
let lastState = null;

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
  const fail = img.onerror;
  img.onerror = () => {
    fail();
    if (!img.getAttribute('src')) {
      chip.textContent = (side.legend || key)[0].toUpperCase();
      chip.classList.add('on');
    }
  };
}

function renderDots(el, seriesLength, gameWins, animate) {
  const slots = winsNeeded(seriesLength);
  if (el.children.length !== slots) {
    el.replaceChildren(...Array.from({ length: slots }, () => Object.assign(document.createElement('div'), { className: 'dot' })));
  }
  [...el.children].forEach((dot, i) => {
    const won = i < gameWins;
    if (dot.classList.contains('won') !== won) {
      dot.classList.toggle('won', won);
      if (animate) bump(dot, '--bump');
    }
  });
}

// One row per card: an art strip in lanes style, the name, then the energy
// cost and the power runes. A card on the chain greys out and says so.
// Rebuilt only when the list changes, so a score bump never restarts image
// loads.
function cardRow(c, lanes) {
  const row = document.createElement('div');
  row.className = `card${c.played ? ' played' : ''}${lanes ? ' with-art' : ''}`;
  if (lanes) {
    const img = document.createElement('img');
    img.className = 'strip';
    img.src = `/cardart/thumb/${c.cardId}.webp`;
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.classList.add('hidden');
    row.append(img);
  }
  const nm = document.createElement('span');
  nm.className = 'nm';
  nm.textContent = c.cardName || c.cardId;
  const cost = document.createElement('span');
  cost.className = 'cost';
  const e = document.createElement('span');
  e.className = 'e';
  e.textContent = c.energy === null || c.energy === undefined ? '' : String(c.energy);
  cost.append(e);
  for (const d of (c.domains || []).filter((x) => DOMAINS.includes(x))) {
    const img = document.createElement('img');
    img.className = 'rune';
    img.src = runeSrc(d);
    img.alt = d;
    img.draggable = false;
    img.onerror = () => img.classList.add('hidden');
    cost.append(img);
  }
  row.append(nm, cost);
  return row;
}

// Lanes: reactions, then actions, then everything else, each with its own
// header and count; the reactions lane carries the live rule.
const LANES = [
  ['reaction', 'Reactions', (c) => c.kind === 'reaction'],
  ['action', 'Actions', (c) => c.kind === 'action'],
  ['other', 'Units and gear', (c) => c.kind !== 'reaction' && c.kind !== 'action'],
];
function laneEls(list) {
  const out = [];
  for (const [cls, label, pick] of LANES) {
    const cards = list.filter(pick);
    if (!cards.length) continue;
    const lane = document.createElement('div');
    lane.className = `lane ${cls}`;
    const h = document.createElement('div');
    h.className = 'lh';
    h.append(
      Object.assign(document.createElement('span'), { className: 'label', textContent: label }),
      Object.assign(document.createElement('span'), { className: 'lcnt', textContent: String(cards.filter((c) => !c.played).length) }),
    );
    lane.append(h, ...cards.map((c) => cardRow(c, true)));
    out.push(lane);
  }
  return out;
}

function renderHand(p, side, on, lanes) {
  const block = $(`${p}handBlock`);
  const list = side.hand || [];
  const count = side.handCount > 0 ? side.handCount : list.length;
  const show = on && count > 0;
  block.classList.toggle('hidden', !show);
  setText($(`${p}handCount`), show ? String(count) : '');
  const key = `${lanes ? 'L' : 'F'}:` + list.map((c) => `${c.cardId}|${c.cardName}|${c.energy}|${(c.domains || []).join(',')}|${c.kind}|${c.played ? 1 : 0}`).join(';');
  if (shown.hand[p] === key) return;
  shown.hand[p] = key;
  $(`${p}hand`).replaceChildren(...(lanes ? laneEls(list) : list.map((c) => cardRow(c, false))));
}

function proLine(side) {
  return [side.pronouns, side.record].filter(Boolean).join(' · ');
}

function renderSide(p, side, m, animate) {
  fitText($(`${p}name`), side.name, { size: 34, min: 22, run: 380 });
  setText($(`${p}pro`), proLine(side));
  setText($(`${p}country`), side.country || '');
  if (setText($(`${p}pts`), side.score) && animate) bump($(`${p}pts`), '--bump');
  setText($(`${p}legend`), side.legend || ' ');
  setText($(`${p}champion`), [side.champion, side.archetype].filter(Boolean).join(' · '));
  renderRunes($(`${p}runes`), legendDomains(side));
  renderDots($(`${p}dots`), m.seriesLength, side.gameWins, animate);
  const holds = side.holds || '';
  $(`${p}holds`).classList.toggle('hidden', !holds);
  setText($(`${p}holdsText`), holds);
  loadHero(p, side);
}

let shownVisible = null;

const params = initStage({
  scene: 'igorows',
  onState(state, first) {
    lastState = state;
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.igorows;
    const animate = !first;

    root.classList.toggle('mode-webcam', scene.mode === 'webcam');
    root.classList.toggle('mode-legend', scene.mode !== 'webcam');
    root.classList.toggle('active-left', m.activeSide === 'left');
    root.classList.toggle('active-right', m.activeSide === 'right');

    renderSide('l', m.left, m, animate);
    renderSide('r', m.right, m, animate);
    root.classList.toggle('showdown', Boolean(scene.showdown));
    const lanes = scene.handStyle === 'lanes';
    renderHand('l', m.left, scene.hand, lanes);
    renderHand('r', m.right, scene.hand, lanes);

    const round = [bank.event.roundTitle, m.turn > 0 ? `Turn ${m.turn}` : ''].filter(Boolean).join(' · ');
    setText($('round'), round);

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

loadLegendDomains(() => {
  if (!lastState) return;
  const m = sceneBank(lastState, params).match;
  renderRunes($('lrunes'), legendDomains(m.left));
  renderRunes($('rrunes'), legendDomains(m.right));
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
