// What the middle of the rows overlay's column holds (2026-09-20), and which
// graphics stand down because the column is holding theirs.
//
// Sam: "can we create options to put the following into the left side of the
// in game overlay, rows where the hands live: 1. Trash 2. Odds to Draw
// 3. Sideboard Card Spotted. Treat this similar to how the card popup was
// generated." So this is the docked card's rule (web/shared/carddock.js)
// grown to the four graphics that can take that space.
//
// The middle of the column holds one thing at a time, in this order:
//
//   card       the card popup's card, docked          (cardDock)
//   spot       the card a player was spotted siding in (spotDock)
//   showdown   the open showdown, split between the players (showdownView)
//   lists      each player's half, the one their hand lists in: their trash
//              (trashDock), their draw odds (oddsDock), or their hand
//   logo       the event logo, which the scene puts back when nothing else
//              is up
//
// A graphic stands down only for what the column really shows. The trash set
// to both players, with player 1's half taken by their draw odds, still
// flies player 2's sheet in over the game; a spotted card that loses the
// middle to a docked card flies in over the game the way it always has.
// Nothing is lost for being outranked, and nothing airs twice.
//
// Pure, so the rows overlay, the three graphics, the side sheets' layout and
// the tests all read one plan.
import { dockCard } from './carddock.js';
import { handUp } from './handlist.js';
import { sheetSides } from './sidesheets.js';

// Each dock's switch on the rows overlay. All default to on: a dock is on
// unless its switch is off.
export const ROWS_DOCKS = {
  card: 'cardDock', spot: 'spotDock', showdown: 'showdownView', trash: 'trashDock', odds: 'oddsDock',
};

// What the sideboard spot graphic holds a card for when it carries no time
// of its own, in seconds (the store's default).
const SPOT_HOLD = 8;

const docks = (rows, what) => Boolean(rows) && rows[ROWS_DOCKS[what]] !== false;

// A sheet graphic that is on and lists this player.
const sheetUp = (cfg, key) => Boolean(cfg && cfg.visible) && sheetSides(cfg).includes(key);

// The odds need a deck: a live game's own count, else the player's list.
// Without one the odds graphic draws that player nothing, so the column
// leaves their half to the hand (the sheets' own rule, shared/sidesheets.js).
const hasDeck = (side) => Boolean(side && (((side.deckLeft || []).length) || String(side.deckList || '').trim()));

// When a spotted card's hold runs out; 0 for a spot with no moment of its own.
export function spotUntil(cfg) {
  const spot = (cfg && cfg.spot) || {};
  return spot.at ? spot.at + (Number(cfg.hold) || SPOT_HOLD) * 1000 : 0;
}

// The card a player was spotted siding in, while the graphic is on and the
// spot is still inside its hold. `pinned` holds it up for a still (the
// panel's picture, a look tile), the graphic's own rule.
export function spotNow(bank, { now = Date.now(), pinned = false } = {}) {
  const cfg = (bank && bank.scenes && bank.scenes.sidespot) || null;
  const spot = (cfg && cfg.spot) || {};
  const has = Boolean(spot.id && (spot.side === 'left' || spot.side === 'right') && (spot.cardId || spot.cardName));
  if (!cfg || !cfg.visible || !has) return null;
  return pinned || now < spotUntil(cfg) ? spot : null;
}

// The plan for the column's middle. It is worked out whether or not the rows
// overlay is on, so an overlay coming on is already holding the right thing
// (the docked card's rule); what the other graphics ask is `rowsDocks`.
export function rowsPlan(bank, { now = Date.now(), pinned = false } = {}) {
  const scenes = (bank && bank.scenes) || {};
  const match = (bank && bank.match) || {};
  const rows = scenes.igorows || {};
  const card = dockCard(bank, 'igorows');
  const spot = docks(rows, 'spot') ? spotNow(bank, { now, pinned }) : null;
  const showdown = docks(rows, 'showdown') && Boolean(match.showdown && match.showdown.active);
  // Each player's half: their trash first, then their draw odds, then the
  // hand. Two sheets asked for on one player cannot share the half, so the
  // trash takes it and the odds fly in over the game as they do without a
  // dock.
  const halves = { left: '', right: '' };
  for (const key of ['left', 'right']) {
    const side = match[key] || {};
    if (docks(rows, 'trash') && sheetUp(scenes.trash, key)) halves[key] = 'trash';
    else if (docks(rows, 'odds') && sheetUp(scenes.odds, key) && hasDeck(side)) halves[key] = 'odds';
    else if (handUp(rows, side)) halves[key] = 'hand';
  }
  const lists = Boolean(halves.left || halves.right);
  const middle = card ? 'card' : (spot ? 'spot' : (showdown ? 'showdown' : (lists ? 'lists' : '')));
  // Only the winner is in the middle: the halves empty when something else
  // has it, which is what slides the hands and the sheets out.
  if (middle !== 'lists') { halves.left = ''; halves.right = ''; }
  return { middle, card, spot: middle === 'spot' ? spot : null, halves, live: Boolean(rows.visible) };
}

const sidesWith = (halves, what) => ['left', 'right'].filter((key) => halves[key] === what);

// What the column is really holding for another graphic, so that graphic
// stands down: the sides of the trash and of the odds it lists, and whether
// it has the spotted card. Only while the rows overlay is itself on.
export function rowsDocks(bank, opts) {
  const plan = rowsPlan(bank, opts);
  if (!plan.live) return { trash: [], odds: [], spot: false };
  return {
    trash: sidesWith(plan.halves, 'trash'),
    odds: sidesWith(plan.halves, 'odds'),
    spot: plan.middle === 'spot',
  };
}
