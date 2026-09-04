import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';

const $ = (id) => document.getElementById(id);
const deck = $('deck');
const inOut = new SeekClock(deck, '--t', 500);

// Six columns is the designed look (up to 18 distinct names in three rows);
// a longer deck adds columns and shrinks the cards rather than clipping.
const gridColumns = (distinct) => Math.max(6, Math.ceil(distinct / 3));

const RUNE_ICON = {
  body: 'Body', calm: 'Calm', chaos: 'Chaos',
  fury: 'Fury', mind: 'Mind', order: 'Order',
};

// The paste is the state; the server owns parsing and name resolution so the
// panel preview and the on-air plate can never disagree.
async function resolveList(list) {
  const res = await fetch('/api/decklist/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ list }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Card art with a fallback that always leaves something rendered: full art,
// then the prefetched thumb, then a named panel. Never a broken img on air.
function cardTile(card, extraClass = '') {
  const box = document.createElement('div');
  box.className = `card ${extraClass} ${card.qty > 1 ? '' : 'single'}`.trim();
  const fallback = document.createElement('div');
  fallback.className = 'fallback';
  fallback.textContent = card.name;
  const qty = document.createElement('span');
  qty.className = 'qty';
  qty.textContent = card.qty;
  if (card.cardId) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    let tier = 'full';
    img.onerror = () => {
      if (tier === 'full') {
        tier = 'thumb';
        img.src = `/cardart/thumb/${card.cardId}.webp`;
      } else {
        img.classList.add('hidden');
        box.classList.add('miss');
      }
    };
    img.src = `/cardart/full/${card.cardId}.webp`;
    box.append(img);
  } else {
    box.classList.add('miss');
  }
  box.append(fallback, qty);
  return box;
}

function renderDeck(d) {
  const legend = d.legend;
  setText($('legendName'), legend ? legend.name : 'No legend listed');
  setText($('championName'), d.champion ? d.champion.name : '');

  const art = $('legendArt');
  const legendId = legend && legend.cardId;
  if (art.dataset.card !== String(legendId || '')) {
    art.dataset.card = String(legendId || '');
    art.classList.add('hidden');
    if (legendId) {
      art.onload = () => art.classList.remove('hidden');
      art.onerror = () => art.classList.add('hidden');
      art.src = `/cardart/full/${legendId}.webp`;
    } else {
      art.removeAttribute('src');
    }
  }

  $('runes').replaceChildren(...d.runes.map(([domain, n]) => {
    const el = document.createElement('span');
    el.className = 'rune';
    const key = RUNE_ICON[String(domain).toLowerCase()];
    if (key) {
      const img = document.createElement('img');
      img.alt = '';
      img.onerror = () => img.classList.add('hidden');
      img.src = `/assets/runes/${key}.png`;
      el.append(img);
    }
    const count = document.createElement('span');
    count.textContent = n;
    el.append(count);
    return el;
  }));

  $('battlefields').replaceChildren(...d.battlefields.map((bf) => {
    const pill = document.createElement('div');
    pill.className = 'bf-pill';
    if (bf.cardId) {
      const img = document.createElement('img');
      img.alt = '';
      // Battlefield art is stored portrait (handoff rule); the rotation comes
      // from the loaded file's own dimensions, never a per-card flag.
      img.onload = () => img.classList.toggle('flat', img.naturalWidth >= img.naturalHeight);
      img.onerror = () => img.classList.add('hidden');
      img.src = `/cardart/full/${bf.cardId}.webp`;
      pill.append(img);
    }
    return pill;
  }));

  const grid = $('mainGrid');
  grid.style.setProperty('--cols', gridColumns(d.main.length));
  grid.replaceChildren(...d.main.map((c) => cardTile(c)));

  const showRack = d.sideboard.length > 0;
  $('rack').classList.toggle('hidden', !showRack);
  if (showRack) $('rackCards').replaceChildren(...d.sideboard.map((c) => cardTile(c)));
}

let visibleNow = null;
let shownList = null;

const params = initStage({
  onState(state, first) {
    $('diag').classList.remove('on');
    const scene = sceneBank(state, params).scenes.decklist;

    if (scene.list !== shownList) {
      shownList = scene.list;
      // Keep the plate that is up if the resolve fails: a failed fetch must
      // never blank a graphic that is already on air.
      resolveList(scene.list).then(renderDeck).catch(() => {});
    }
    $('rack').classList.toggle('hidden', !scene.showSideboard);

    const visible = scene.visible;
    $('hiddenHint').classList.toggle('on',
      !params.transparent && !params.preview && !visible);
    if (visible === visibleNow) return;
    visibleNow = visible;
    if (first) {
      // Fresh loads, including an OBS "shutdown source when hidden" reload,
      // snap to the current state instead of replaying the entrance.
      deck.classList.toggle('off', !visible);
      inOut.seek(visible ? 1 : 0);
    } else if (visible) {
      deck.classList.remove('off');
      inOut.play({ from: 0, to: 1 });
    } else {
      inOut.play({ from: 1, to: 0 }).then(() => {
        if (!visibleNow) deck.classList.add('off');
      });
    }
  },
});

setTimeout(() => {
  if (visibleNow === null) $('diag').classList.add('on');
}, 4000);
