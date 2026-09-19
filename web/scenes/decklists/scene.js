import { initStage, sceneBank } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, legendSteps, rotateIfPortrait } from '../../stage/art.js';
import { applyVisibility, runeSrc } from '../../stage/exp.js';
import { artSteps, parseDeck } from '../../stage/decks.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 900);

const HALF_W = 900;
const HALF_H = 1000; // 1080 less 40 top and bottom: no header band
const GAP = 10;
const RATIO = 0.716;
const FIXED_H = 112 + 16 + 125 + 16; // player, gap, strip, gap
const LABEL_H = 22;
const SIDE_W = 84;

// The largest card width that fits every main deck card in the room left:
// for each column count, the width is held by whichever runs out first, the
// half's width or the room's height.
function gridWidth(n, roomH) {
  let best = 40;
  for (let cols = 3; cols <= 14; cols += 1) {
    const rows = Math.ceil(Math.max(1, n) / cols);
    const byWidth = (HALF_W - GAP * (cols - 1)) / cols;
    const byHeight = ((roomH - GAP * (rows - 1)) / rows) * RATIO;
    best = Math.max(best, Math.floor(Math.min(byWidth, byHeight)));
  }
  return Math.min(best, 150);
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

// One card: art over its name (shown until the art lands), a count badge.
function cardEl(c, w, i, { land = false, qty = true } = {}) {
  const box = el('div', land ? 'cd land' : 'cd');
  box.style.setProperty('--w', String(w));
  box.style.setProperty('--i', String(i));
  const miss = el('div', 'miss', c.name || '');
  const img = el('img', 'art hidden');
  img.alt = '';
  img.draggable = false;
  box.append(miss, img);
  if (c.cardId) {
    chainLoad(img, artSteps(c.cardId), (shown) => {
      miss.remove();
      if (land) rotateIfPortrait(shown);
    });
  }
  if (qty && c.qty > 1) box.append(el('span', 'qty', String(c.qty)));
  else if (qty && c.qty === 1) box.append(el('span', 'qty', '1'));
  return box;
}

function buildHalf(half, side, deck, sideboards) {
  const who = el('div', 'who');
  const thumb = el('div', 'k-thumb');
  const face = el('img', 'art hidden');
  face.alt = '';
  face.draggable = false;
  thumb.append(face);
  const legendCard = deck && deck.legend && deck.legend.cardId;
  if (legendCard) chainLoad(face, [{ src: `/cardart/full/${legendCard}.webp`, cls: 'crop-legend' }, ...legendSteps(side)]);
  else if (legendSteps(side).length) chainLoad(face, legendSteps(side));
  else clearArt(face);
  const id = el('div', 'id');
  const nm = el('div', 'nm');
  if (side.country) nm.append(el('span', 'k-chip', side.country));
  nm.append(el('span', 'n', side.name || ' '));
  id.append(nm, el('div', 'lg', (deck && deck.legend && deck.legend.name) || side.legend || ''));
  id.append(el('div', 'meta', [side.deckName, side.record].filter(Boolean).join(' · ')));
  const runes = el('div', 'runes');
  for (const [domain, count] of (deck && deck.runes) || []) {
    const rn = el('div', 'rn');
    const img = el('img');
    img.src = runeSrc(domain);
    img.alt = domain;
    img.onerror = () => img.remove();
    rn.append(img, document.createTextNode(String(count)));
    runes.append(rn);
  }
  who.append(thumb, id, runes);
  if (half.classList.contains('r')) who.style.flexDirection = 'row';

  if (!deck) {
    half.replaceChildren(who, el('div', 'none', side.name ? `No decklist for ${side.name}` : 'No decklist loaded'));
    return;
  }

  const strip = el('div', 'strip');
  if (deck.champion) {
    const grp = el('div', 'grp');
    grp.append(el('span', 'k-label', 'Champion'), cardEl(deck.champion, 74, 0, { qty: false }));
    strip.append(grp);
  }
  if (deck.battlefields.length) {
    const grp = el('div', 'grp');
    const row = el('div', 'row');
    deck.battlefields.forEach((b, i) => row.append(cardEl(b, 103, i + 1, { land: true, qty: false })));
    grp.append(el('span', 'k-label', 'Battlefields'), row);
    strip.append(grp);
  }

  const sb = sideboards ? deck.sideboard : [];
  const sideH = sb.length ? LABEL_H + (Math.min(SIDE_W, Math.floor((HALF_W - GAP * (sb.length - 1)) / sb.length)) / RATIO) + 16 : 0;
  const room = HALF_H - FIXED_H - LABEL_H - sideH;
  const w = gridWidth(deck.main.length, room);
  const main = el('div', 'main');
  const grid = el('div', 'grid');
  deck.main.forEach((c, i) => grid.append(cardEl(c, w, i + 4)));
  main.append(el('span', 'k-label', 'Main deck'), grid);

  const parts = [who, strip, main];
  if (sb.length) {
    const sw = Math.min(SIDE_W, Math.floor((HALF_W - GAP * (sb.length - 1)) / sb.length));
    const side = el('div', 'side');
    const row = el('div', 'row');
    sb.forEach((c, i) => row.append(cardEl(c, sw, i + 4 + deck.main.length)));
    const total = sb.reduce((t, c) => t + (c.qty || 0), 0);
    side.append(el('span', 'k-label', `Sideboard · ${total}`), row);
    parts.push(side);
  }
  half.replaceChildren(...parts);
}

const built = { l: null, r: null };
let renderToken = 0;
let shownVisible = null;

async function render(state, first) {
  const token = ++renderToken;
  const bank = sceneBank(state, params);
  const cfg = bank.scenes.decklists || { visible: false, sideboards: true };
  const m = bank.match;
  const [ldeck, rdeck] = await Promise.all([parseDeck(m.left.deckList), parseDeck(m.right.deckList)]);
  if (token !== renderToken) return;

  for (const [p, side, deck] of [['l', m.left, ldeck], ['r', m.right, rdeck]]) {
    const key = JSON.stringify([side.name, side.country, side.legend, side.legendSlug, side.legendCardId, side.deckName, side.record, side.deckList, Boolean(deck), cfg.sideboards]);
    if (built[p] === key) continue;
    built[p] = key;
    buildHalf($(`${p}half`), side, deck, cfg.sideboards !== false);
  }

  const visible = params.force || Boolean(cfg.visible);
  $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
  shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first: first || shownVisible === null });
}

let firstSeen = true;
const params = initStage({
  scene: 'decklists',
  onState(state) {
    $('diag').classList.remove('on');
    const first = firstSeen;
    firstSeen = false;
    render(state, first);
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
