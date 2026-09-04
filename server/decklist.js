// Decklist paste to a resolved deck, ported from FlipDeck's
// src/lib/decks/parse.ts so the two tools read the same lists the same way.
//
// Tolerant on the way in (section headers in any casing, "3 X" / "3x X" /
// "X x3" / bare names, bullets, blank lines), and name RESOLUTION happens
// against the card index this app already carries, so the scene can draw real
// card art. An unresolved name still renders as a named panel: a broadcast
// graphic must show something.
import { allCards } from './carddb.js';

const SECTION_ALIASES = {
  legend: 'legend',
  champion: 'champion',
  battlefield: 'battlefields',
  battlefields: 'battlefields',
  rune: 'runes',
  runes: 'runes',
  'rune pool': 'runes',
  'rune deck': 'runes',
  main: 'main',
  deck: 'main',
  maindeck: 'main',
  'main deck': 'main',
  mainboard: 'main',
  side: 'sideboard',
  sideboard: 'sideboard',
  'side board': 'sideboard',
};

export const RUNE_DOMAINS = ['Body', 'Calm', 'Chaos', 'Fury', 'Mind', 'Order'];

// "Main Deck (40):" -> "main deck"; null when the line is not a header.
function headerOf(line) {
  const stripped = line
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\d:×x-]+$/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return SECTION_ALIASES[stripped] || null;
}

const isComment = (line) =>
  /^note\b/i.test(line) || /^deck name\b/i.test(line) || /^\[.*\]$/.test(line);

// "3 Stupefy" / "3x Stupefy" / "x3 Stupefy" / "Stupefy x3" / "Stupefy".
function entryOf(raw) {
  const line = raw.replace(/^[\s\-–—•*·]+/, '').trim();
  if (!line || isComment(line)) return null;
  let m = line.match(/^(?:x\s*)?(\d+)\s*[x×]?\s+(.+)$/i);
  if (m) return { name: m[2].trim(), qty: parseInt(m[1], 10) };
  m = line.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
  if (m) return { name: m[1].trim(), qty: parseInt(m[2], 10) };
  m = line.match(/^(.+?)\s+(\d+)$/);
  if (m && headerOf(m[1]) === 'runes') return null; // "Runes 12" is a header
  return { name: line, qty: 1 };
}

function push(list, entry, section, warnings) {
  const existing = list.find((e) => e.name.toLowerCase() === entry.name.toLowerCase());
  if (existing) {
    existing.qty += entry.qty;
    warnings.push(`"${entry.name}" appears twice in ${section}, merged into ${existing.qty} copies.`);
  } else {
    list.push({ ...entry });
  }
}

function applyLine(deck, section, line) {
  const entry = entryOf(line);
  if (!entry) return;
  if (section === 'legend') {
    if (deck.legend) deck.warnings.push(`More than one legend listed, keeping "${deck.legend}".`);
    else deck.legend = entry.name;
  } else if (section === 'champion') {
    if (deck.champion) deck.warnings.push(`More than one champion listed, keeping "${deck.champion}".`);
    else deck.champion = entry.name;
  } else if (section === 'battlefields') {
    if (deck.battlefields.some((b) => b.toLowerCase() === entry.name.toLowerCase())) {
      deck.warnings.push(`Battlefield "${entry.name}" listed twice, kept once.`);
    } else {
      deck.battlefields.push(entry.name);
    }
  } else if (section === 'runes') {
    // "6 Mind Rune" exports carry a redundant suffix; drop it so the domain
    // matches its icon and its legality check.
    const domain = entry.name.replace(/\s+runes?$/i, '');
    const existing = deck.runes.find(([d]) => d.toLowerCase() === domain.toLowerCase());
    if (existing) existing[1] += entry.qty;
    else deck.runes.push([domain, entry.qty]);
  } else if (section === 'main') {
    push(deck.main, entry, 'the main deck', deck.warnings);
  } else if (section === 'sideboard') {
    push(deck.sideboard, entry, 'the sideboard', deck.warnings);
  }
}

export function parseDecklist(text) {
  const deck = {
    legend: null, champion: null, battlefields: [], runes: [],
    main: [], sideboard: [], warnings: [],
  };
  let section = 'main';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // "Legend: Diana, Scorn of the Moon" - header and value on one line. The
    // inline reading wins, because headerOf strips trailing digits so
    // "Champion: X" would otherwise read as a bare header and drop the name.
    const inlineMatch = line.match(/^([A-Za-z ]+?)\s*:\s*(.+)$/);
    const inlineSection = inlineMatch ? headerOf(inlineMatch[1]) : null;
    if (inlineSection && inlineMatch) {
      section = inlineSection;
      applyLine(deck, section, inlineMatch[2].trim());
      continue;
    }
    const header = headerOf(line);
    if (header) { section = header; continue; }
    applyLine(deck, section, line);
  }
  return deck;
}

// Riftbound expectations, surfaced as warnings and never as blocks: brews and
// partial lists still have to render.
export function checkLegality(deck) {
  const out = [];
  const mainCards = deck.main.reduce((t, e) => t + e.qty, 0);
  const withChampion = mainCards + (deck.champion ? 1 : 0);
  if (mainCards > 0 && withChampion !== 40) {
    out.push(`Main deck is ${withChampion} cards${deck.champion ? ' counting the champion' : ''}, a legal deck plays 40.`);
  }
  for (const e of deck.main) {
    const championCopy = deck.champion && e.name.toLowerCase() === deck.champion.toLowerCase() ? 1 : 0;
    if (e.qty + championCopy > 3) out.push(`${e.qty + championCopy} copies of "${e.name}", the limit is 3.`);
  }
  for (const e of deck.sideboard) {
    if (e.qty > 3) out.push(`${e.qty} copies of "${e.name}" in the sideboard, the limit is 3.`);
  }
  const runeTotal = deck.runes.reduce((t, [, n]) => t + n, 0);
  if (deck.runes.length > 0 && runeTotal !== 12) out.push(`Rune pool is ${runeTotal}, a legal pool is 12.`);
  for (const [domain] of deck.runes) {
    if (!RUNE_DOMAINS.some((d) => d.toLowerCase() === domain.toLowerCase())) {
      out.push(`"${domain}" is not a rune domain (${RUNE_DOMAINS.join(', ')}).`);
    }
  }
  if (deck.battlefields.length > 0 && deck.battlefields.length !== 3) {
    out.push(`${deck.battlefields.length} battlefield${deck.battlefields.length === 1 ? '' : 's'} listed, decks play 3.`);
  }
  return out;
}

// --- name resolution against the local card index ---------------------------

const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

let index = null;
let indexedCount = -1;

function nameIndex() {
  const cards = allCards();
  if (index && indexedCount === cards.length) return index;
  index = new Map();
  for (const c of cards) {
    const key = norm(c.cardName);
    // First writer wins so the lowest cardId (the original printing) is the
    // one a bare name resolves to, rather than a later reprint.
    if (!index.has(key)) index.set(key, c);
  }
  indexedCount = cards.length;
  return index;
}

// Exact normalized name, then a unique prefix match so "Ahri" finds
// "Ahri, Alluring" only when it is the single candidate. Ambiguity resolves to
// nothing rather than to a guess: the wrong card on air is worse than a gap.
function resolveName(name) {
  const idx = nameIndex();
  const key = norm(name);
  if (!key) return null;
  const exact = idx.get(key);
  if (exact) return exact;
  const hits = [];
  for (const [k, card] of idx) {
    if (k.startsWith(key)) {
      hits.push(card);
      if (hits.length > 1) break;
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

const toCard = (name, qty) => {
  const hit = resolveName(name);
  return {
    name: hit ? hit.cardName : name,
    qty,
    cardId: hit ? hit.cardId : null,
    type: hit ? (hit.type || '') : '',
    energy: hit && Number.isFinite(hit.energy) ? hit.energy : null,
    domains: hit ? (hit.domains || []) : [],
  };
};

// One parse + resolve, which is what both the API route and the scene use.
export function buildDeck(text) {
  const deck = parseDecklist(text);
  const main = deck.main.map((e) => toCard(e.name, e.qty));
  const sideboard = deck.sideboard.map((e) => toCard(e.name, e.qty));
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
      unresolved: [...main, ...sideboard].filter((c) => !c.cardId).length,
    },
    warnings: [...deck.warnings, ...checkLegality(deck)],
  };
}
