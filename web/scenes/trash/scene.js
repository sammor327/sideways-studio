// Trash (2026-09-19): the cards in a player's trash, Riftbound's graveyard,
// newest first, on their side of the game window, or both players' at once.
// Cards with [FLOW] light up with their Flow cost and, with Flow first on,
// lead the list (web/shared/trash.js). The rows are the hand lists' rows.
// Under the trash, the player's banished cards (2026-09-19, Sam: "include
// what has been banished"), greyed, below a label row of their own.
import { initStage, sceneBank } from '../../stage/stage.js';
import { banishedRow, trashRow, trashSection } from '../../stage/exp.js';
import { gameWindow } from '../../shared/gamewindow.js';
import { banishedRows, trashCounts, trashRows } from '../../shared/trash.js';
import { rowsDocks } from '../../shared/rowsdock.js';
import { Sheet, SheetVisibility, placeSheets, sheetSlots, rowsThatFit, sheetHeight, sheetSides } from '../../stage/sidesheet.js';

const $ = (id) => document.getElementById(id);
const ROW_H = 44;
const FLOW_NOTE = 'Flow: play it from the trash for its Flow cost, then banish it';
const vis = new SheetVisibility($('root'));
// A still of the graphic draws the trash whatever the column is holding.
const NO_DOCKS = { trash: [], odds: [], spot: false };
const sheets = { left: new Sheet('left', 'Trash'), right: new Sheet('right', 'Trash') };

function emptyRow() {
  const row = document.createElement('div');
  row.className = 'empty';
  row.textContent = 'No cards in the trash yet';
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
  // The rows overlay's column can be listing this trash for one player or
  // both (web/shared/rowsdock.js). This graphic then leaves those players to
  // it and flies in only the rest, so no trash airs twice.
  const docks = params.force ? NO_DOCKS : rowsDocks(bank);
  const up = sheetSides(cfg).filter((key) => !docks.trash.includes(key)).map((key) => {
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
  const slots = sheetSlots(bank, 'trash', docks);
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
      ...(p.bRows.length ? [trashSection(p.banished.length), ...p.bRows.map((r) => banishedRow(r, art))] : []),
    ]);
    sheet.foot(p.foot);
    sheet.place(places[p.key], { height: p.height, viewRows: p.viewRows, rowH: ROW_H, delay: i * 0.12 });
  });

  // An empty trash still airs when asked for: "empty" is the answer then.
  // A trash the rows column has taken for every player it lists has nothing
  // left to fly in.
  const visible = (params.force || Boolean(cfg.visible)) && up.length > 0;
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
