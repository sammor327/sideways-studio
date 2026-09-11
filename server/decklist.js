// Decklist paste to a resolved deck. The text format itself (parse, serialize,
// legality) lives in web/shared/decklist-format.js so the deck editor runs the
// same parser in the browser; this module adds what needs the card index:
// name resolution, did-you-mean suggestions, and warming the art cache so a
// deck is renderable offline by the time it is cued.
//
// Every surface resolves through here (the scene, the panel summary, the deck
// editor, PNG export and the batch script all POST /api/decklist/parse), so
// what the operator checks is what airs. An unresolved name still renders as
// a named panel: a broadcast graphic must show something.
import { allCards, warmFullArt } from './carddb.js';
import { checkLegality, deckNames, parseDecklist } from '../web/shared/decklist-format.js';

// Match key: case, accents, punctuation and spacing all ignored, so
// "Diana - Scorn of the Moon", "Diana, Scorn of the Moon" and "dianascorn of
// the moon" agree. Printing qualifiers in brackets ("(Overnumbered)",
// "(Alternate Art)") are a printing, not a card, and drop out.
export function cardKey(name) {
  return String(name)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

// " - Starter" is how starter-deck lists name a printing, same spirit as the
// bracketed qualifiers above.
const stripPrinting = (name) => String(name).replace(/\s*-\s*starter\s*$/i, '');

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? diag : diag + 1;
      diag = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, cost);
    }
  }
  return prev[b.length];
}

// A resolver over one card list. Kept as a factory so the tests can hand it
// a fixture instead of the downloaded index.
export function createResolver(cards) {
  const index = new Map();
  for (const c of cards) {
    const key = cardKey(c.cardName);
    // First writer wins, so a bare name resolves to the original printing
    // rather than a later reprint.
    if (key && !index.has(key)) index.set(key, c);
  }

  // Exact key, then the printing-stripped key, then a UNIQUE prefix so "Ahri"
  // finds "Ahri, Alluring" only when it is the single candidate. Ambiguity
  // resolves to nothing rather than to a guess: the wrong card on air is
  // worse than a named gap.
  function lookup(name) {
    for (const key of [cardKey(name), cardKey(stripPrinting(name))]) {
      if (key && index.has(key)) return index.get(key);
    }
    const key = cardKey(stripPrinting(name));
    if (key.length < 3) return null;
    let hit = null;
    for (const [k, card] of index) {
      if (!k.startsWith(key)) continue;
      if (hit) return null;
      hit = card;
    }
    return hit;
  }

  // Did-you-mean for a miss: substring hits first (someone typed a partial
  // name), then edit distance over the same key the lookup matches on.
  // Anything further than a third of the query away is noise.
  function suggest(name, count = 3) {
    const q = cardKey(stripPrinting(name));
    if (!q) return [];
    const maxDistance = Math.max(3, Math.floor(q.length / 3));
    const scored = [];
    for (const [key, card] of index) {
      const contains = key.includes(q) || (key.length >= 4 && q.includes(key));
      const distance = levenshtein(q, key);
      if (!contains && distance > maxDistance) continue;
      scored.push({ name: card.cardName, score: contains ? Math.min(distance, 1) : distance });
    }
    return scored
      .sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
      .slice(0, count)
      .map((s) => s.name);
  }

  return { lookup, suggest, size: index.size };
}

let resolver = null;
let resolverCards = null;
function currentResolver() {
  const cards = allCards();
  // A re-sync swaps the array, so identity is the cache key.
  if (!resolver || resolverCards !== cards) {
    resolver = createResolver(cards);
    resolverCards = cards;
  }
  return resolver;
}

const cardInfo = (hit) => ({
  name: hit.cardName,
  cardId: hit.cardId,
  type: hit.type || '',
  energy: Number.isFinite(hit.energy) ? hit.energy : null,
  domains: hit.domains || [],
});

// One parse + resolve. `resolved` and `suggestions` are keyed by the name as
// typed, which is how the editor's structured view finds a row's result.
export function buildDeck(text, { resolverOverride } = {}) {
  const r = resolverOverride || currentResolver();
  const deck = parseDecklist(text);
  const resolved = {};
  const suggestions = {};
  for (const raw of deckNames(deck)) {
    const hit = r.lookup(raw);
    resolved[raw] = hit ? cardInfo(hit) : null;
    if (!hit) suggestions[raw] = r.suggest(raw);
  }

  const toCard = (raw, qty) => {
    const hit = resolved[raw];
    return hit
      ? { ...hit, raw, qty }
      : { name: raw, raw, qty, cardId: null, type: '', energy: null, domains: [] };
  };
  const main = deck.main.map((e) => toCard(e.name, e.qty));
  const sideboard = deck.sideboard.map((e) => toCard(e.name, e.qty));
  const unresolved = Object.keys(resolved).filter((raw) => !resolved[raw]);

  // Fetch full art for everything this deck shows, now, so it is on disk
  // before anyone cues the plate. Fire and forget: the scene's fallback chain
  // covers a card whose art is still on its way.
  if (!resolverOverride) {
    warmFullArt(Object.values(resolved).filter(Boolean).map((c) => c.cardId));
  }

  return {
    legend: deck.legend ? toCard(deck.legend, 1) : null,
    champion: deck.champion ? toCard(deck.champion, 1) : null,
    battlefields: deck.battlefields.map((b) => toCard(b, 1)),
    runes: deck.runes,
    main,
    sideboard,
    counts: {
      main: deck.main.reduce((t, e) => t + e.qty, 0),
      sideboard: deck.sideboard.reduce((t, e) => t + e.qty, 0),
      runes: deck.runes.reduce((t, [, n]) => t + n, 0),
      names: Object.keys(resolved).length,
      unresolved: unresolved.length,
    },
    resolved,
    suggestions,
    unresolved,
    warnings: [...deck.warnings, ...checkLegality(deck)],
  };
}
