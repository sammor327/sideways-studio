import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, fullSteps, markTier } from '../../stage/art.js';
import { renderRunes, loadLegendDomains, legendDomains, applyVisibility, runeSrc } from '../../stage/exp.js';
import { artSteps, parseDeck } from '../../stage/decks.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 700);

// The art column is 1100px of legend: the whole figure where one is baked,
// the hero crop otherwise.
let heroKey = null;
function loadHero(side) {
  const key = side.legendSlug || '';
  if (heroKey === key) return;
  heroKey = key;
  const img = $('hero');
  const steps = fullSteps(side);
  delete img.parentElement.dataset.tier;
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps, markTier);
}

// "Event · Result" per line; a line with no separator prints as the event.
let finKey = null;
function renderFinishes(text) {
  if (finKey === text) return;
  finKey = text;
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
  $('finBox').classList.toggle('hidden', lines.length === 0);
  $('finishes').replaceChildren(...lines.map((line) => {
    const [ev, ...rest] = line.split(/\s*[·|:-]\s*/);
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      Object.assign(document.createElement('span'), { textContent: ev }),
      Object.assign(document.createElement('b'), { textContent: rest.join(' ') }),
    );
    return row;
  }));
}

function renderTags(side) {
  const tags = [side.pronouns, side.team].filter(Boolean);
  const el = $('tags');
  const key = tags.join('|');
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.replaceChildren(...tags.map((t) => Object.assign(document.createElement('span'), { className: 'k-chip ghost', textContent: t })));
}

// --- the player's decklist (Sam, 2026-09-18) ---
//
// The main deck as a grid down the left, 700 wide (inside the ground's side
// box) in the room under the tightened details; each card as large as lets
// every card fit.
const DECK_W = 700;
const DECK_ROOM = 640 - 36 - 10;
const GAP = 10;
function gridWidth(n) {
  let best = 40;
  for (let cols = 3; cols <= 14; cols += 1) {
    const rows = Math.ceil(Math.max(1, n) / cols);
    const byWidth = (DECK_W - GAP * (cols - 1)) / cols;
    const byHeight = ((DECK_ROOM - GAP * (rows - 1)) / rows) * 0.716;
    best = Math.max(best, Math.floor(Math.min(byWidth, byHeight)));
  }
  return Math.min(best, 170);
}

function cardEl(c, w) {
  const box = document.createElement('div');
  box.className = 'cd';
  box.style.setProperty('--w', String(w));
  const miss = Object.assign(document.createElement('div'), { className: 'miss', textContent: c.name || '' });
  const img = Object.assign(document.createElement('img'), { className: 'art hidden', alt: '', draggable: false });
  box.append(miss, img);
  if (c.cardId) chainLoad(img, artSteps(c.cardId), () => miss.remove());
  box.append(Object.assign(document.createElement('span'), { className: 'qty', textContent: String(c.qty || 1) }));
  return box;
}

let deckKey = null;
let deckToken = 0;
async function renderDeck(side, on) {
  const token = ++deckToken;
  const deck = on ? await parseDeck(side.deckList) : null;
  if (token !== deckToken) return;
  const show = Boolean(deck && deck.main.length);
  root.classList.toggle('with-deck', show);
  const key = show ? JSON.stringify([side.deckList, side.deckName]) : '';
  if (key === deckKey) return;
  deckKey = key;
  if (!show) { $('deckGrid').replaceChildren(); return; }
  setText($('deckName'), side.deckName || (deck.legend ? deck.legend.name : ''));
  $('deckRunes').replaceChildren(...(deck.runes || []).map(([domain, count]) => {
    const rn = Object.assign(document.createElement('span'), { className: 'rn' });
    const img = Object.assign(document.createElement('img'), { src: runeSrc(domain), alt: domain });
    img.onerror = () => img.remove();
    rn.append(img, document.createTextNode(String(count)));
    return rn;
  }));
  const w = gridWidth(deck.main.length);
  $('deckGrid').replaceChildren(...deck.main.map((c) => cardEl(c, w)));
}

let lastState = null;
let shownVisible = null;

const params = initStage({
  scene: 'profile',
  onState(state, first) {
    lastState = state;
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.profile;
    const side = scene.side === 'right' ? bank.match.right : bank.match.left;

    setText($('eventName'), bank.event.name || 'Sideways Studio');
    setText($('roundTitle'), [bank.event.roundTitle, 'Player profile'].filter(Boolean).join(' · '));
    const logo = state.theme.logo || '';
    const logoEl = $('logo');
    if (logoEl.getAttribute('src') !== (logo || null)) { if (logo) logoEl.src = logo; else logoEl.removeAttribute('src'); }
    logoEl.classList.toggle('hidden', !logo);
    root.classList.toggle('no-camera', scene.camera === false);
    renderDeck(side, Boolean(scene.decklist));

    setText($('name'), side.name || ' ');
    setText($('legend'), side.legend || '');
    renderRunes($('runes'), legendDomains(side));
    setText($('country'), side.country || '');
    setText($('seed'), side.seed ? `${side.seed} seed` : '');
    renderTags(side);
    const tiles = [['statRecord', 'record', side.record], ['statSeason', 'seasonRecord', side.seasonRecord], ['statArchetype', 'archetype', side.archetype], ['statStore', 'store', side.store]];
    for (const [box, id, value] of tiles) {
      $(box).classList.toggle('hidden', !value);
      setText($(id), value || '');
    }
    renderFinishes(side.finishes);
    loadHero(side);

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

loadLegendDomains(() => {
  if (!lastState) return;
  const bank = sceneBank(lastState, params);
  const side = bank.scenes.profile.side === 'right' ? bank.match.right : bank.match.left;
  renderRunes($('runes'), legendDomains(side));
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
