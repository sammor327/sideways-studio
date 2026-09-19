// The trash (Riftbound's graveyard) as the trash graphic lists it (2026-09-19,
// Sam: "showcase what cards are in a player's graveyard, specifically
// highlighting any cards with Flow"). A card with [FLOW] can be played from
// the trash for its Flow cost and is then banished, so those are the cards in
// a trash that still matter, and they light up the way reactions and actions
// do in the hand lists.
//
// Pure, shared by the graphic, the panel and the tests.
import { groupHand } from './handlist.js';

export const TRASH_MAX = 60;
// Banishment (2026-09-19): the cards banished this game, listed under the
// trash on the same graphic.
export const BANISHED_MAX = 60;
export const FLOW_DOMAINS = ['Body', 'Calm', 'Chaos', 'Fury', 'Mind', 'Order'];

// The newest card first (the top of the pile), copies of a card on one row
// with a count, and with flowFirst the Flow cards ahead of the rest, each
// part still newest first.
export function trashRows(list, { flowFirst = true } = {}) {
  const rows = groupHand([...(Array.isArray(list) ? list : [])].reverse());
  if (!flowFirst) return rows;
  return [...rows.filter((r) => r.flow), ...rows.filter((r) => !r.flow)];
}

// The banished cards the way the graphic lists them: the newest first,
// copies of a card on one row. Nothing is lit: a banished card is out of
// the game.
export function banishedRows(list) {
  return groupHand([...(Array.isArray(list) ? list : [])].reverse().map((c) => (c && typeof c === 'object' ? { ...c, flow: null } : c)));
}

// How many cards a trash holds and how many of them have Flow.
export function trashCounts(list) {
  const cards = (Array.isArray(list) ? list : []).filter((c) => c && typeof c === 'object');
  return { cards: cards.length, flow: cards.filter((c) => c.flow).length };
}

// A Flow cost the way the card prints it: "4 and 1 Fury", "2", "1 and 2 Runes".
export function flowText(flow) {
  if (!flow || typeof flow !== 'object') return '';
  const parts = [];
  if (Number.isFinite(flow.energy)) parts.push(String(flow.energy));
  if (flow.power > 0) {
    const what = flow.domain || (flow.power === 1 ? 'Rune' : 'Runes');
    parts.push(`${flow.power} ${what}`);
  }
  return parts.join(' and ');
}
