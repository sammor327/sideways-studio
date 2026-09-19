// Players' decks for the decks-round graphics (2026-09-18): the sideboard
// fly-in, the side by side decklists and the game intro read each side's own
// paste (side.deckList) and the champion catalog.
//
// Parsing goes through the server, as the decklist graphic's does, so every
// surface reads a paste the same way. Results are kept per paste text; a
// deck with an unresolved name is not kept, since the index may learn the
// card on the next set check.

const parsed = new Map();
const pending = new Map();

export function parseDeck(list) {
  const text = String(list || '');
  if (!text.trim()) return Promise.resolve(null);
  if (parsed.has(text)) return Promise.resolve(parsed.get(text));
  if (pending.has(text)) return pending.get(text);
  const job = fetch('/api/decklist/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ list: text }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((deck) => {
      if (deck && !deck.counts.unresolved) {
        parsed.set(text, deck);
        if (parsed.size > 12) parsed.delete(parsed.keys().next().value);
      }
      return deck;
    })
    .catch(() => null)
    .finally(() => pending.delete(text));
  pending.set(text, job);
  return job;
}

// Champion unit names to card ids, for a side whose champion line was typed
// or picked by name.
let champions = null;
let championsJob = null;
export function loadChampions() {
  if (champions) return Promise.resolve(champions);
  if (!championsJob) {
    championsJob = fetch('/api/champions', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { champions: [] }))
      .then((data) => {
        champions = new Map((data.champions || []).map((c) => [c.cardName.toLowerCase(), c.cardId]));
        return champions;
      })
      .catch(() => { championsJob = null; return new Map(); });
  }
  return championsJob;
}

// The champion card a side shows: the catalog's card for its champion line,
// else the featured card when it is that champion.
export function championCardId(side) {
  const name = String((side && side.champion) || '').trim();
  if (!name) return '';
  const hit = champions && champions.get(name.toLowerCase());
  if (hit) return hit;
  const card = side.card || {};
  return card.cardId && String(card.cardName || '').toLowerCase() === name.toLowerCase() ? card.cardId : '';
}

// Card art: full, then the prefetched thumb.
export const artSteps = (cardId) => (cardId ? [
  { src: `/cardart/full/${cardId}.webp` },
  { src: `/cardart/thumb/${cardId}.webp` },
] : []);
