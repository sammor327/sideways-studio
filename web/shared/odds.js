// The odds to draw (2026-09-19, Sam: "an 'Odds to draw' sheet ... the odds
// that they'll draw cards in their deck, weighting it towards highest likely
// to draw"): which cards a player's main deck can still give them, and how
// likely each one is to turn up in their next draw or next few.
//
// Pure, shared by the odds graphic, the panel's deck tracker and the tests.
//
// Where the deck comes from, best first:
//   live  a game feed that counts every card left in the deck (RiftAtlas's
//         broadcast view does, card by card): exact, sideboarding included.
//   list  the player's own list (side.deckList) less every card seen to leave
//         the deck this game (side.drawn). The chosen champion starts in the
//         champion zone, so it is never in the deck to draw.
//
// A card in hand that nobody has named is still in the pool. To anyone
// watching, an unknown card in hand is as likely to be any unseen card as the
// top of the deck is, so the chance of a card turning up next is its unseen
// copies over every unseen card, and the next few draws are a random handful
// of the unseen cards. That is why a list-based pool can be a few cards
// bigger than the deck itself: the sheet says "not yet seen" then.

export const DRAWS_MAX = 5;
export const ROWS_CHOICES = [5, 8, 10, 12, 15];
export const ROWS_DEFAULT = 10;

// Cards match by name across the list, the hand, the trash and a live feed:
// the same card can arrive as different printings (an alternate art's id),
// and Riftbound reprints keep their names.
export const normName = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
export const cardKey = (c) => normName(c && (c.cardName || c.name || c.cardId));

// Copies per card key in a list of cards (hand or trash entries), or the n
// each entry of a drawn tally carries.
export function countBy(list, weight = () => 1) {
  const out = new Map();
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || typeof c !== 'object') continue;
    const key = cardKey(c);
    if (!key) continue;
    out.set(key, (out.get(key) || 0) + weight(c));
  }
  return out;
}

// Cards in hand nobody has named: the count less the cards listed, the same
// sum the panel and the hand overlays draw as unknown cards.
export const unknownInHand = (side) => Math.max(0, ((side && side.handCount) || 0) - (((side && side.hand) || []).length));

// Every card the side's main deck can still give it:
// { cards: [{ key, cardId, cardName, energy, domains, start, left }], total, source }.
// `deck` is the parsed list (the decklist parser's main and champion); a live
// deck on the side wins over it. Cards with none left stay in the list, at 0,
// so the panel's tracker can show them; `total` counts what is left.
export function drawPool(side, deck) {
  const live = side && Array.isArray(side.deckLeft) ? side.deckLeft : [];
  if (live.length) {
    const cards = live.map((c) => ({
      key: cardKey(c),
      cardId: c.cardId || '',
      cardName: c.cardName || '',
      energy: c.energy ?? null,
      domains: c.domains || [],
      start: null,
      left: Math.max(0, Math.trunc(Number(c.left)) || 0),
    }));
    return finish(cards, 'live');
  }
  const main = deck && Array.isArray(deck.main) ? deck.main : [];
  if (!main.length) return { cards: [], total: 0, source: '' };
  const seen = countBy(side && side.drawn, (d) => Math.max(0, Math.trunc(Number(d.n)) || 0));
  // A legal deck is 40 counting the chosen champion, which a list names on
  // its own Champion line. A list whose main already makes 40 with that
  // champion in it counted the chosen copy twice: one of them never shuffles.
  const championKey = deck.champion ? cardKey(deck.champion) : '';
  const mainTotal = main.reduce((t, e) => t + (Math.max(0, Math.trunc(e.qty)) || 0), 0);
  let chosenInMain = Boolean(championKey) && mainTotal >= 40 && main.some((e) => cardKey(e) === championKey);
  const byKey = new Map();
  for (const e of main) {
    const key = cardKey(e);
    if (!key) continue;
    let start = Math.max(0, Math.trunc(e.qty) || 0);
    if (chosenInMain && key === championKey && start > 0) {
      start -= 1;
      chosenInMain = false;
    }
    const cur = byKey.get(key);
    if (cur) { cur.start += start; continue; }
    byKey.set(key, {
      key,
      cardId: e.cardId || '',
      cardName: e.name || e.cardName || '',
      energy: Number.isFinite(e.energy) ? e.energy : null,
      domains: e.domains || [],
      start,
      left: 0,
    });
  }
  const cards = [...byKey.values()];
  for (const c of cards) c.left = Math.max(0, c.start - (seen.get(c.key) || 0));
  return finish(cards, 'list');
}

function finish(cards, source) {
  return { cards, total: cards.reduce((t, c) => t + c.left, 0), source };
}

// The chance of at least one of `left` copies among the next `draws` cards
// off a pool of `total`: one less the chance every draw misses them all.
export function drawChance(left, total, draws = 1) {
  if (!(left > 0) || !(total > 0)) return 0;
  if (left >= total) return 1;
  const n = Math.min(Math.max(1, Math.trunc(draws) || 1), total);
  if (n === 1) return left / total;
  let none = 1;
  for (let i = 0; i < n; i += 1) {
    const miss = total - left - i;
    if (miss <= 0) return 1;
    none *= miss / (total - i);
  }
  return Math.min(1, Math.max(0, 1 - none));
}

// The sheet: every card with a copy left, most likely first (a tie keeps the
// deck's own order), the first `rows` of them shown and the rest summed.
// weight is each row's chance against the most likely card's, for the bars.
export function oddsRows(pool, { draws = 1, rows = ROWS_DEFAULT } = {}) {
  const ranked = (pool && pool.cards ? pool.cards : [])
    .map((c, i) => ({ ...c, i, chance: drawChance(c.left, pool.total, draws) }))
    .filter((c) => c.left > 0)
    .sort((a, b) => b.chance - a.chance || a.i - b.i);
  const top = ranked.length ? ranked[0].chance : 0;
  const shown = ranked.slice(0, Math.max(1, rows)).map(({ i, ...c }) => ({ ...c, weight: top > 0 ? c.chance / top : 0 }));
  const rest = ranked.slice(shown.length);
  return {
    rows: shown,
    rest: { count: rest.length, copies: rest.reduce((t, c) => t + c.left, 0), best: rest.length ? rest[0].chance : 0 },
    total: pool ? pool.total : 0,
  };
}

// "12.5%", one decimal, "100%" for a sure thing, "<0.1%" for a sliver.
export function formatChance(p) {
  if (!(p > 0)) return '0%';
  if (p >= 0.9995) return '100%';
  if (p < 0.0005) return '<0.1%';
  return `${(p * 100).toFixed(1)}%`;
}

// The sheet's second line: how many cards the chances are out of. Exact when
// a live feed counts the deck or every card in hand is named; otherwise the
// pool holds the unnamed hand cards too, and says "not yet seen".
export function poolLine(pool, side) {
  if (!pool || !pool.source) return '';
  const unknown = pool.source === 'list' ? unknownInHand(side) : 0;
  const n = pool.total;
  if (unknown > 0) return `${n} card${n === 1 ? '' : 's'} not yet seen`;
  return `${n} card${n === 1 ? '' : 's'} in deck`;
}

export const drawsLabel = (draws) => (draws > 1 ? `Next ${draws} draws` : 'Next draw');
