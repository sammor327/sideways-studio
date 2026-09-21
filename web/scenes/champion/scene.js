import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps } from '../../stage/art.js';
import { artSteps, parseDeck } from '../../stage/decks.js';
import { matchWinner, victory } from '../../shared/victory.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inClock = new SeekClock(root, '--t', 1000);
const outClock = new SeekClock(root, '--o', 400);

const shown = {};
function load(img, key, steps) {
  if (shown[img.id] === key) return;
  shown[img.id] = key;
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

// The widest card that fits a whole main deck into the column's own width in
// the rows it has room for. Held between 34 and 78 design pixels: smaller
// than 34 and a card is a smudge, wider than 78 and forty cards will not fit
// under a name.
function cardWidth(n, colW, rows) {
  const cols = Math.ceil(Math.max(1, n) / Math.max(1, rows));
  return Math.max(34, Math.min(78, Math.floor((colW - 5 * (cols - 1)) / cols)));
}

// One player's main deck as pictures, counts badged. A deck that has not been
// typed says so rather than leaving a hole.
function renderDeck(box, deck, colW) {
  const cards = deck ? deck.main || [] : [];
  const key = `${colW}|${cards.map((c) => `${c.cardId || c.name}x${c.qty}`).join(',')}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (!cards.length) {
    box.replaceChildren(el('div', 'none', deck ? 'No main deck in this list.' : 'No decklist typed for this player.'));
    return;
  }
  const w = cardWidth(cards.length, colW, 4);
  box.style.setProperty('--cw', String(w));
  box.replaceChildren(...cards.map((c) => {
    const cd = el('div', 'cd');
    // The name holds the slot until the art lands, so a card the index does
    // not know still says what it is instead of leaving a black box.
    const miss = el('div', 'miss', c.name || '');
    const img = el('img', 'art hidden');
    img.alt = '';
    img.draggable = false;
    cd.append(miss, img);
    if (c.cardId) chainLoad(img, artSteps(c.cardId), () => miss.remove());
    if (c.qty > 1) cd.append(el('span', 'qty', `x${c.qty}`));
    return cd;
  }));
}

// The record and store line under a name: whatever the operator filled in,
// the empty ones left out rather than printed as gaps.
const metaLine = (side) => [side.record, side.seasonRecord, side.store]
  .map((s) => String(s || '').trim())
  .filter(Boolean)
  .join(' · ');

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

// The column each deck grid has to fit: the pair inset 70 a side, less the
// 96 rule between them and the block's own 22 of padding a side.
const COLUMN = Math.floor((1920 - 140 - 96) / 2) - 44;

function render(state, first) {
  const bank = sceneBank(state, params);
  const m = bank.match;
  const cfg = bank.scenes.champion;
  // The final is the match that is loaded: the winner is the champion and
  // the other seat is the runner up.
  const v = victory(m, matchWinner(m, cfg.side));

  setText($('title'), cfg.title || 'Champion');
  setText($('event'), bank.event.name || bank.event.roundTitle || '');
  setText($('finalScore'), v.won ? v.games : '');

  for (const [p, side, rank] of [['win', v.won ? v.winner : {}, 'Champion'], ['up', v.won ? v.loser : {}, 'Runner up']]) {
    setText($(`${p}Country`), side.country || '');
    setText($(`${p}Name`), side.name || (v.won ? ' ' : (rank === 'Champion' ? 'No winner set' : ' ')));
    setText($(`${p}Legend`), side.legend || '');
    setText($(`${p}Meta`), metaLine(side));
    load($(`${p}Card`), `${side.legendCardId || ''}|${side.legendSlug || ''}`, [...artSteps(side.legendCardId), ...heroSteps(side)]);
  }

  const decks = Boolean(cfg.decks);
  root.classList.toggle('with-decks', decks);
  $('winDeck').classList.toggle('hidden', !decks);
  $('upDeck').classList.toggle('hidden', !decks);
  if (decks) {
    for (const [p, side] of [['win', v.won ? v.winner : {}], ['up', v.won ? v.loser : {}]]) {
      const list = side.deckList || '';
      if (!list.trim()) { renderDeck($(`${p}Deck`), null, COLUMN); continue; }
      // parseDeck caches by paste text, so this is one fetch per list and a
      // straight answer every state after.
      parseDeck(list).then((deck) => renderDeck($(`${p}Deck`), deck, COLUMN));
    }
  }

  const visible = params.force || Boolean(cfg.visible);
  $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
  setVisible(visible, first);
}

const params = initStage({
  scene: 'champion',
  onState(state, first) {
    $('diag').classList.remove('on');
    render(state, first);
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
