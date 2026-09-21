// Odds to draw (2026-09-19): the cards a player's main deck can still give
// them, likeliest first, on their side of the game window, or both players'
// at once. The deck is a live feed's own count when there is one (RiftAtlas),
// else the player's list less the cards seen to leave it (web/shared/odds.js).
import { initStage, sceneBank } from '../../stage/stage.js';
import { parseDeck } from '../../stage/decks.js';
import { oddsRow } from '../../stage/exp.js';
import { gameWindow } from '../../shared/gamewindow.js';
import { ROWS_DEFAULT, drawPool, drawsLabel, formatChance, oddsRows, poolLine } from '../../shared/odds.js';
import { rowsDocks } from '../../shared/rowsdock.js';
import { Sheet, SheetVisibility, placeSheets, sheetSlots, sheetHeight, sheetSides } from '../../stage/sidesheet.js';

const $ = (id) => document.getElementById(id);
const ROW_H = 46;
const vis = new SheetVisibility($('root'));
// A still of the graphic draws the odds whatever the column is holding.
const NO_DOCKS = { trash: [], odds: [], spot: false };
const sheets = { left: new Sheet('left', 'Odds to draw'), right: new Sheet('right', 'Odds to draw') };

function restLine(rest) {
  if (!rest.count) return '';
  return `+ ${rest.count} more card${rest.count === 1 ? '' : 's'}, ${formatChance(rest.best)} or less each`;
}

let renderToken = 0;

async function render(state) {
  const token = ++renderToken;
  const bank = sceneBank(state, params);
  const cfg = bank.scenes.odds || { visible: false, side: 'left', draws: 1, rows: ROWS_DEFAULT, art: true };
  // The rows overlay's column can be listing these odds for one player or
  // both (web/shared/rowsdock.js); this graphic flies in only the rest.
  const docks = params.force ? NO_DOCKS : rowsDocks(bank);
  const wanted = sheetSides(cfg).filter((key) => !docks.odds.includes(key));
  // A live deck needs no list; otherwise the list is parsed the way every
  // other graphic reads a paste.
  const decks = await Promise.all(wanted.map((key) => {
    const side = bank.match[key];
    return (side.deckLeft || []).length ? null : parseDeck(side.deckList);
  }));
  // A newer state arrived while this one's decks were parsing.
  if (token !== renderToken) return;

  const draws = cfg.draws || 1;
  const art = cfg.art !== false;
  const up = [];
  wanted.forEach((key, i) => {
    const side = bank.match[key];
    const pool = drawPool(side, decks[i]);
    // Nothing left to draw from, or no deck known: no sheet for this side.
    if (!pool.total) return;
    const odds = oddsRows(pool, { draws, rows: cfg.rows || ROWS_DEFAULT });
    const foot = restLine(odds.rest);
    up.push({ key, side, pool, odds, foot, height: sheetHeight(odds.rows.length, ROW_H, Boolean(foot)) });
  });
  for (const key of ['left', 'right']) sheets[key].show(up.some((p) => p.key === key));

  const slots = sheetSlots(bank, 'odds', docks);
  const places = placeSheets(gameWindow(bank), Object.fromEntries(up.map((p) => [p.key, p.height])), {
    slot: (key) => slots.slot('odds', key), count: slots.count,
  });
  up.forEach((p, i) => {
    const sheet = sheets[p.key];
    sheet.head(p.side, [drawsLabel(draws), poolLine(p.pool, p.side)].filter(Boolean).join(' · '));
    const key = JSON.stringify([art, p.odds.rows.map((r) => [r.cardId, r.cardName, r.energy, (r.domains || []).join(','), r.left, r.chance, r.weight])]);
    sheet.rows(key, () => p.odds.rows.map((r) => oddsRow(r, art)));
    sheet.foot(p.foot);
    sheet.place(places[p.key], { height: p.height, viewRows: p.odds.rows.length, rowH: ROW_H, delay: i * 0.12 });
  });

  // Nothing to show without a deck: the graphic stays down until one is known.
  const visible = (params.force || Boolean(cfg.visible)) && up.length > 0;
  $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
  vis.set(visible);
}

const params = initStage({
  scene: 'odds',
  onState(state) {
    $('diag').classList.remove('on');
    render(state);
  },
});

setTimeout(() => {
  if (vis.shown === null) $('diag').classList.add('on');
}, 4000);
