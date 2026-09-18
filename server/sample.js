// The sample match (2026-09-18, the Look builder): one bank with every
// graphic's data filled in, which the look builder's tiles draw in place of
// the event's own data (?sample=1 on a scene, web/stage/stage.js). Without
// it an organizer building a look before the event has any data would judge
// it on empty columns and blank plates.
//
// The people are made up. The cards are real: named here and resolved
// against the card index when asked for, so art shows on any install that
// carries the bundled library, and a name the index does not know prints
// without art rather than failing. The bank goes through the store's own
// whitelist (buildBank), so it always has the current shape and only values
// an edit could have set.
import { allCards, kindOf } from './carddb.js';
import { createResolver } from './decklist.js';
import { listLegends } from './legends.js';
import { buildBank } from './state.js';

// One of FlipDeck's transcribed guide decks (src/lib/decks/decklists.ts),
// so the decklist tile shows a real list.
const DECKLIST = [
  'Legend: Diana, Scorn of the Moon',
  'Champion: Diana, Lunari',
  'Battlefields:',
  '1 Rockfall Path',
  '1 Veiled Temple',
  '1 Abandoned Hall',
  'Runes:',
  '7 Chaos Rune',
  '5 Mind Rune',
  'Main:',
  '3 Stupefy',
  '3 Ravenbloom Student',
  '3 Ride the Wind',
  '3 Stacked Deck',
  '3 Tideturner',
  '3 Hwei, Brooding Painter',
  '3 Moonfall',
  '3 Patched Porobot',
  '3 Temporal Breach',
  '3 Swain, Visionary',
  '2 Gust',
  '2 Morbid Return',
  '2 Fizz, Trickster',
  '2 Star-Crossed',
  '1 Eclipse',
  'Sideboard:',
  '2 Abandon',
  "2 Kha'Zix, Mutating Horror",
  '2 Ravenbloom Prefect',
  '1 Decree of Insight',
  '1 Vex, Apathetic',
].join('\n');

// The eight in the top cut, by seed. The match on the tiles is the first
// semifinal: seed 1 (Mara) against seed 4 (Theo).
const PLAYERS = [
  { seed: 1, name: 'Mara Quill', country: 'US', record: '7-1-0', legend: 'diana-scorn-of-the-moon' },
  { seed: 2, name: 'Soren Pike', country: 'DE', record: '7-1-0', legend: 'viktor-herald-of-the-arcane' },
  { seed: 3, name: 'Felix Moreau', country: 'FR', record: '6-1-1', legend: 'jinx-loose-cannon' },
  { seed: 4, name: 'Theo Brandt', country: 'GB', record: '6-2-0', legend: 'draven-glorious-executioner' },
  { seed: 5, name: 'Iris Calloway', country: 'CA', record: '6-2-0', legend: 'leona-radiant-dawn' },
  { seed: 6, name: 'Ines Ortiz', country: 'ES', record: '6-2-0', legend: 'sett-the-boss' },
  { seed: 7, name: 'Nadia Frost', country: 'SE', record: '5-2-1', legend: 'ahri-nine-tailed-fox' },
  { seed: 8, name: 'Rowan Hale', country: 'AU', record: '5-2-1', legend: 'teemo-swift-scout' },
];
// The rest of the Swiss, for the standings pages.
const FIELD = [
  { name: 'Caleb Ruiz', country: 'MX', record: '5-3-0', legend: 'volibear-relentless-storm' },
  { name: 'Yuki Tanaka', country: 'JP', record: '5-3-0', legend: 'lux-lady-of-luminosity' },
  { name: 'Omar Haddad', country: 'AE', record: '5-3-0', legend: 'kaisa-daughter-of-the-void' },
  { name: 'Grace Lin', country: 'TW', record: '4-3-1', legend: 'lee-sin-blind-monk' },
  { name: 'Milo Sato', country: 'US', record: '4-4-0', legend: 'yasuo-unforgiven' },
  { name: 'Hana Kovac', country: 'HR', record: '4-4-0', legend: 'miss-fortune-bounty-hunter' },
  { name: 'Declan Shaw', country: 'IE', record: '4-4-0', legend: 'darius-hand-of-noxus' },
  { name: 'Zoe Mercer', country: 'NZ', record: '3-4-1', legend: 'garen-might-of-demacia' },
];

let cached = null;
let cachedFrom = null;

// The bank, rebuilt only when the card index changes (a set check swaps the
// array, so its identity is the cache key). Callers get their own copy.
export function sampleBank() {
  const cards = allCards();
  if (!cached || cachedFrom !== cards) {
    cached = build(cards);
    cachedFrom = cards;
  }
  return JSON.parse(JSON.stringify(cached));
}

function build(cards) {
  const resolver = createResolver(cards);
  const card = (name) => {
    const hit = resolver.lookup(name);
    return hit ? { cardId: hit.cardId, cardName: hit.cardName, cardType: hit.type || '' } : { cardId: '', cardName: name, cardType: '' };
  };
  const handCard = (name, played = false) => {
    const hit = resolver.lookup(name);
    if (!hit) return { cardId: '', cardName: name, played };
    return {
      cardId: hit.cardId,
      cardName: hit.cardName,
      energy: Number.isFinite(hit.energy) ? hit.energy : null,
      domains: hit.domains || [],
      played,
    };
  };
  const legends = new Map(listLegends().map((l) => [l.slug, l]));
  const legend = (slug) => {
    const l = legends.get(slug);
    return l ? { legend: l.name, legendSlug: l.slug, legendCardId: l.cardId || '' } : { legend: '', legendSlug: '', legendCardId: '' };
  };
  const tableSide = (p) => ({
    name: p.name, country: p.country, record: p.record,
    seed: p.seed ? ordinal(p.seed) : '',
    ...legend(p.legend),
  });
  const bySeed = (n) => PLAYERS.find((p) => p.seed === n);

  const diana = legend('diana-scorn-of-the-moon');
  const draven = legend('draven-glorious-executioner');
  const ahri = legend('ahri-nine-tailed-fox');
  const jinx = legend('jinx-loose-cannon');

  const bank = buildBank({
    event: {
      name: 'Sideways Open',
      roundTitle: 'Top 8: Semifinal',
      tables: [
        { label: 'Table 1', left: tableSide(bySeed(1)), right: tableSide(bySeed(4)) },
        { label: 'Table 2', left: tableSide(bySeed(2)), right: tableSide(bySeed(3)) },
      ],
      casters: [
        { name: 'Avery Stone', role: 'Play-by-play', handle: '@averycasts' },
        { name: 'Jordan Reyes', role: 'Analyst', handle: '@jreyesTCG' },
      ],
      schedule: [
        { time: '9:00', title: 'Check-in' },
        { time: '10:00', title: 'Swiss rounds 1-4' },
        { time: '13:00', title: 'Lunch break' },
        { time: '14:00', title: 'Swiss rounds 5-8' },
        { time: '18:00', title: 'Top 8' },
        { time: '21:00', title: 'Grand final' },
      ],
      scheduleNow: 4,
      format: 'Eight rounds of best-of-three Swiss, then a single-elimination top 8.',
      commands: '!bracket  !decks  !discord',
      sponsors: 'Your sponsor here',
      nextName: 'Sideways Open #2',
      nextWhen: 'Next month',
      champion: 'left',
      bracket: {
        format: 'se8',
        players: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => tableSide(bySeed(n))),
        // Quarterfinals done, the second semifinal done, the first on air.
        results: {
          W1: { top: 2, bottom: 0, winner: 'top' },
          W2: { top: 2, bottom: 1, winner: 'top' },
          W3: { top: 1, bottom: 2, winner: 'bottom' },
          W4: { top: 2, bottom: 1, winner: 'top' },
          W6: { top: 0, bottom: 2, winner: 'bottom' },
        },
      },
      standings: {
        cut: 8,
        rows: [...PLAYERS, ...FIELD].map((p) => {
          const [w, l, d] = p.record.split('-').map(Number);
          return {
            ...tableSide({ ...p, seed: 0 }),
            points: w * 3 + d,
            omw: 62 - l * 2.5 + (p.seed ? 8 - p.seed : 0) * 0.4,
            gw: 70 - l * 4,
            ogw: 58 - l * 1.5,
          };
        }),
      },
    },
    match: {
      seriesLength: 3,
      activeSide: 'left',
      turn: 7,
      choseFirst: 'left',
      result: { winner: 'left', note: 'Advances to the grand final' },
      left: {
        name: 'Mara Quill', record: '7-1-0', country: 'US', pronouns: 'she/her', seed: '1ST',
        archetype: 'Diana Control', team: 'Moonlit Rift', store: 'Card Haven',
        seasonRecord: '31-9-2', bestFinish: 'Regional Qualifier: Top 8',
        finishes: 'Regional Qualifier: Top 8\nStore Championship: 1st\nNexus Night: 1st',
        ...diana,
        battlefield: 'Veiled Temple', battlefieldCardId: card('Veiled Temple').cardId,
        champion: 'Diana, Lunari', card: card('Diana, Lunari'),
        name2: 'Nadia Frost', ...prefix2(ahri), battlefield2: "Targon's Peak",
        champion2: 'Ahri, Alluring', teamName: 'Moonlit Rift',
        score: 5, gameWins: 1, handCount: 6,
        hand: [handCard('Stupefy'), handCard('Ride the Wind'), handCard('Gust'), handCard('Moonfall'), handCard('Tideturner')],
      },
      right: {
        name: 'Theo Brandt', record: '6-2-0', country: 'GB', pronouns: 'he/him', seed: '4TH',
        archetype: 'Draven Aggro', team: 'Axe Throwers', store: 'The Rift Shop',
        seasonRecord: '27-11-1', bestFinish: 'Regional Qualifier: Top 16',
        finishes: 'Regional Qualifier: Top 16\nStore Championship: 2nd',
        ...draven,
        battlefield: "Reaver's Row", battlefieldCardId: card("Reaver's Row").cardId,
        champion: 'Draven, Showboat', card: card('Draven, Showboat'),
        name2: 'Felix Moreau', ...prefix2(jinx), battlefield2: 'Zaun Warrens',
        champion2: 'Jinx, Demolitionist', teamName: 'Axe Throwers',
        score: 3, gameWins: 0, handCount: 4,
        hand: [handCard('Falling Star'), handCard('Rebuke'), handCard('Spinning Axe', true)],
      },
    },
    scenes: {
      cardpopup: { card: card('Moonfall') },
      cardrow: { cards: [card('Moonfall'), card('Stupefy'), card('Ride the Wind'), card('Swain, Visionary')] },
      decklist: { list: DECKLIST, deckName: 'Diana' },
      sponsor: { items: [{ name: 'Your sponsor' }, { name: 'Card Haven' }], label: 'Presented by' },
      slate: { text: 'Back after the break' },
      lowerthird: { side: 'left', credential: 'Regional Qualifier top 8, the only undefeated Diana' },
      headtohead: { status: 'Semifinal: best of three' },
      profile: { side: 'left' },
      handfan: { side: 'left', opponent: true },
    },
  });

  // The cues' own state, which no bank patch carries: the round clock (23:14
  // into a 50 minute round, paused so every tile shows the same time), the
  // slate's countdown, and a showdown open on Theo's battlefield with a card
  // from each side on the chain.
  bank.match.timer = { running: false, startedAt: 0, elapsed: (23 * 60 + 14) * 1000, countdown: 50 * 60 * 1000 };
  bank.event.countdown = { running: false, startedAt: 0, elapsed: 0, countdown: 5 * 60 * 1000 };
  const chainCard = (name, side) => {
    const c = card(name);
    return { cardId: c.cardId, cardName: c.cardName, kind: c.cardId ? kindOf(c.cardId) : '', side };
  };
  bank.match.showdown = {
    active: true,
    battlefield: "Reaver's Row",
    battlefieldCardId: card("Reaver's Row").cardId,
    priority: 'left',
    chain: [chainCard('Falling Star', 'right'), chainCard('Stupefy', 'left')],
  };
  return bank;
}

// A legend's fields for the teammate slot on a 2v2 side.
function prefix2(l) {
  return { legend2: l.legend, legendSlug2: l.legendSlug, legendCardId2: l.legendCardId };
}

function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' }[n % 10] || 'TH');
  return `${n}${suffix}`;
}
