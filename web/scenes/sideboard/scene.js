import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, legendSteps } from '../../stage/art.js';
import { artSteps, parseDeck } from '../../stage/decks.js';
import { clipToWindow, gameWindow } from '../../shared/gamewindow.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
// One property, two speeds: the fly in takes its time, the fly out does not.
const inClock = new SeekClock(root, '--t', 1300);
const outClock = new SeekClock(root, '--t', 500);

const INNER_PAD = 2 * 28 + 4;
const GAP = 16;
const HEAD_H = 22 + 60 + 18 + 26 + 4;
const MARGIN = 24;
const STACK_GAP = 20;

// One player's plate, built from the template into its own positioned box.
class Plate {
  constructor(p) {
    this.pos = $(`${p}pos`);
    this.pos.append($('plateTpl').content.cloneNode(true));
    this.part = (name) => this.pos.querySelector(`[data-part="${name}"]`);
    this.face = null;
    this.cardsKey = null;
  }

  fill(side, cards) {
    setText(this.part('name'), side.name || ' ');
    setText(this.part('country'), side.country || '');
    const total = cards.reduce((t, c) => t + (c.qty || 0), 0);
    setText(this.part('sub'), [side.legend, `${total} card${total === 1 ? '' : 's'}`].filter(Boolean).join(' · '));
    const faceKey = `${side.legendCardId}|${side.legendSlug}`;
    if (faceKey !== this.face) {
      this.face = faceKey;
      const steps = legendSteps(side);
      if (steps.length) chainLoad(this.part('face'), steps);
      else clearArt(this.part('face'));
    }
    const key = cards.map((c) => `${c.cardId}:${c.qty}`).join('|');
    if (key === this.cardsKey) return;
    this.cardsKey = key;
    this.part('cards').replaceChildren(...cards.map((c, i) => {
      const box = document.createElement('div');
      box.className = 'card';
      box.style.setProperty('--i', String(i));
      const img = document.createElement('img');
      img.className = 'art hidden';
      img.alt = '';
      img.draggable = false;
      const miss = document.createElement('div');
      miss.className = 'miss';
      miss.textContent = c.name;
      box.append(miss, img);
      if (c.cardId) chainLoad(img, artSteps(c.cardId), () => miss.remove());
      const qty = document.createElement('span');
      qty.className = 'qty';
      qty.textContent = String(c.qty);
      box.append(qty);
      return box;
    }));
  }

  place({ x, y, scale, width, cw, from, delay }) {
    const s = this.pos.style;
    s.setProperty('--gx', x.toFixed(1));
    s.setProperty('--gy', y.toFixed(1));
    s.setProperty('--gs', scale.toFixed(4));
    s.setProperty('--pw', String(width));
    s.setProperty('--cw', String(cw));
    s.setProperty('--d', String(delay));
    // Start fully off the frame edge on the player's side.
    const dx = from === 'left' ? -(x / scale + width + 60) : ((1920 - x) / scale + 60);
    s.setProperty('--dx', dx.toFixed(1));
  }
}

const plates = { left: new Plate('l'), right: new Plate('r') };

// The first answer snaps (a reloaded browser source must not replay the
// fly), whichever state it came from: parses can finish out of order.
let shownVisible = null;
function setVisible(visible) {
  if (visible === shownVisible) return;
  const first = shownVisible === null;
  shownVisible = visible;
  if (first) {
    root.classList.toggle('off', !visible);
    inClock.seek(visible ? 1 : 0);
    return;
  }
  if (visible) {
    outClock.stop();
    root.classList.remove('off');
    inClock.play({ from: 0, to: 1 });
  } else {
    inClock.stop();
    outClock.play({ from: 1, to: 0 }).then(() => { if (!shownVisible) root.classList.add('off'); });
  }
}

let renderToken = 0;

async function render(state) {
  const token = ++renderToken;
  const bank = sceneBank(state, params);
  const cfg = bank.scenes.sideboard || { visible: false, side: 'both' };
  const wanted = cfg.side === 'left' || cfg.side === 'right' ? [cfg.side] : ['left', 'right'];
  const decks = await Promise.all(wanted.map((key) => parseDeck(bank.match[key].deckList)));
  // A newer state arrived while this one's decks were parsing.
  if (token !== renderToken) return;

  // Only a player with a sideboard gets a plate.
  const up = wanted
    .map((key, i) => ({ key, side: bank.match[key], cards: (decks[i] && decks[i].sideboard) || [] }))
    .filter((p) => p.cards.length);
  for (const key of ['left', 'right']) plates[key].pos.classList.toggle('gone', !up.some((p) => p.key === key));
  // Plays underneath the overlay: the plates fly out from under its chrome.
  clipToWindow(root, gameWindow(bank));

  if (up.length) {
    // Both plates span the game window, one card size for both: as wide as
    // the longer sideboard allows across that width, as tall as the window
    // allows with both plates stacked, never past 260.
    const win = gameWindow(bank);
    const width = Math.max(600, win.w - 2 * MARGIN);
    const most = Math.max(...up.map((p) => p.cards.length));
    const byWidth = (width - INNER_PAD - GAP * (most - 1)) / most;
    const each = (win.h - 2 * MARGIN - STACK_GAP * (up.length - 1)) / up.length;
    const byHeight = (each - HEAD_H) * 0.716;
    const cw = Math.floor(Math.max(40, Math.min(byWidth, byHeight, 260)));
    const height = HEAD_H + cw / 0.716;
    const x = win.x + (win.w - width) / 2;
    if (up.length === 2) {
      // Player 1 against the top of the game window, player 2 the bottom.
      plates.left.place({ x, y: win.y + MARGIN, scale: 1, width, cw, from: 'left', delay: 0 });
      plates.right.place({ x, y: win.y + win.h - MARGIN - height, scale: 1, width, cw, from: 'right', delay: 0.12 });
    } else {
      plates[up[0].key].place({ x, y: win.y + (win.h - height) / 2, scale: 1, width, cw, from: up[0].key, delay: 0 });
    }
    for (const p of up) plates[p.key].fill(p.side, p.cards);
  }

  // Nothing to fly in without a sideboard: the graphic stays down until a
  // player's deck has one.
  const visible = (params.force || Boolean(cfg.visible)) && up.length > 0;
  $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
  setVisible(visible);
}

const params = initStage({
  scene: 'sideboard',
  onState(state) {
    $('diag').classList.remove('on');
    render(state);
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
