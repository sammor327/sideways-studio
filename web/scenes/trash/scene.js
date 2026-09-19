// Trash (2026-09-19): the cards in a player's trash, Riftbound's graveyard,
// newest first, on their side of the game window, or both players' at once.
// Cards with [FLOW] light up with their Flow cost and, with Flow first on,
// lead the list (web/shared/trash.js). The rows are the hand lists' rows.
// Under the trash, the player's banished cards (2026-09-19, Sam: "include
// what has been banished"), greyed, below a label row of their own.
import { initStage, sceneBank } from '../../stage/stage.js';
import { DOMAINS, cardRow, runeSrc } from '../../stage/exp.js';
import { gameWindow } from '../../shared/gamewindow.js';
import { banishedRows, trashCounts, trashRows } from '../../shared/trash.js';
import { Sheet, SheetVisibility, placeSheets, sheetSlots, rowsThatFit, sheetHeight, sheetSides } from '../../stage/sidesheet.js';

const $ = (id) => document.getElementById(id);
const ROW_H = 44;
const FLOW_NOTE = 'Flow: play it from the trash for its Flow cost, then banish it';
const vis = new SheetVisibility($('root'));
const sheets = { left: new Sheet('left', 'Trash'), right: new Sheet('right', 'Trash') };

// The Flow cost as the card prints it: the energy, then a rune per power of
// its domain, or a plain gem per rune of any domain.
function flowTag(flow) {
  const tag = document.createElement('span');
  tag.className = 'flow-tag';
  const label = document.createElement('b');
  label.textContent = 'Flow';
  tag.append(label);
  if (Number.isFinite(flow.energy)) {
    const e = document.createElement('span');
    e.className = 'e';
    e.textContent = String(flow.energy);
    tag.append(e);
  }
  for (let i = 0; i < Math.min(flow.power || 0, 4); i += 1) {
    if (DOMAINS.includes(flow.domain)) {
      const img = document.createElement('img');
      img.className = 'rune';
      img.src = runeSrc(flow.domain);
      img.alt = flow.domain;
      img.draggable = false;
      img.onerror = () => img.classList.add('hidden');
      tag.append(img);
    } else {
      const gem = document.createElement('span');
      gem.className = 'any';
      tag.append(gem);
    }
  }
  return tag;
}

function trashRow(r, art) {
  const row = cardRow(r, art);
  if (r.flow) {
    row.classList.add('flow');
    row.querySelector('.cost').replaceChildren(flowTag(r.flow));
  }
  return row;
}

function emptyRow() {
  const row = document.createElement('div');
  row.className = 'empty';
  row.textContent = 'No cards in the trash yet';
  return row;
}

// The label between the trash and the banished cards: a row of the list,
// so it scrolls and rises in with them.
function sectionRow(count) {
  const row = document.createElement('div');
  row.className = 'card section';
  const label = document.createElement('span');
  label.textContent = 'Banished';
  const n = document.createElement('b');
  n.textContent = String(count);
  row.append(label, n);
  return row;
}

// A banished card: the hand lists' row, greyed, with its printed cost.
function banishedRow(r, art) {
  const row = cardRow(r, art);
  row.classList.add('banished');
  return row;
}

function subLine({ cards, flow }, banished) {
  const parts = [cards ? `${cards} card${cards === 1 ? '' : 's'}` : 'Empty'];
  if (flow) parts.push(`${flow} with Flow`);
  if (banished) parts.push(`${banished} banished`);
  return parts.join(' · ');
}

function render(state) {
  const bank = sceneBank(state, params);
  const cfg = bank.scenes.trash || { visible: false, side: 'left', art: true, flowFirst: true, banished: true };
  const art = cfg.art !== false;
  const showBanished = cfg.banished !== false;
  const win = gameWindow(bank);
  const fit = rowsThatFit(win, ROW_H);
  const up = sheetSides(cfg).map((key) => {
    const side = bank.match[key];
    const trash = side.trash || [];
    const rows = trashRows(trash, { flowFirst: cfg.flowFirst !== false });
    const counts = trashCounts(trash);
    const banished = showBanished ? (side.banished || []) : [];
    const bRows = banishedRows(banished);
    // The trash's rows (or the line saying it is empty), then the label and
    // the banished cards when there are any.
    const total = Math.max(1, rows.length) + (bRows.length ? 1 + bRows.length : 0);
    const viewRows = Math.max(1, Math.min(total, fit));
    const foot = counts.flow ? FLOW_NOTE : '';
    return { key, side, trash, rows, counts, banished, bRows, viewRows, foot, height: sheetHeight(viewRows, ROW_H, Boolean(foot)) };
  });
  for (const key of ['left', 'right']) sheets[key].show(up.some((p) => p.key === key));

  // Beside the odds sheet, not on it, when both show the same player.
  const slots = sheetSlots(bank, 'trash');
  const places = placeSheets(win, Object.fromEntries(up.map((p) => [p.key, p.height])), {
    slot: (key) => slots.slot('trash', key), count: slots.count,
  });
  up.forEach((p, i) => {
    const sheet = sheets[p.key];
    sheet.head(p.side, subLine(p.counts, p.banished.length));
    const cardKeyOf = (c) => [c.cardId, c.cardName, c.energy, (c.domains || []).join(','), c.flow];
    const key = JSON.stringify([art, cfg.flowFirst !== false, p.trash.map(cardKeyOf), p.banished.map(cardKeyOf)]);
    sheet.rows(key, () => [
      ...(p.rows.length ? p.rows.map((r) => trashRow(r, art)) : [emptyRow()]),
      ...(p.bRows.length ? [sectionRow(p.banished.length), ...p.bRows.map((r) => banishedRow(r, art))] : []),
    ]);
    sheet.foot(p.foot);
    sheet.place(places[p.key], { height: p.height, viewRows: p.viewRows, rowH: ROW_H, delay: i * 0.12 });
  });

  // An empty trash still airs when asked for: "empty" is the answer then.
  const visible = params.force || Boolean(cfg.visible);
  $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
  vis.set(visible);
}

const params = initStage({
  scene: 'trash',
  onState(state) {
    $('diag').classList.remove('on');
    render(state);
  },
});

setTimeout(() => {
  if (vis.shown === null) $('diag').classList.add('on');
}, 4000);
