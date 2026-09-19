// The Tournament platform's model (2026-09-18, Sam, the night before
// Convergence #3): a TopDeck.gg event turned into rounds, tables, standings
// and a bracket, and each of those into the patch that loads it into
// preview. Pure: no network, no files, no app state, so the tests drive it
// with fixtures. server/platform.js does the fetching and the routes.
//
// Two TopDeck reads feed it, and they were cross-checked on Convergence #2
// (riftatlas-convergence-2): all 257 players came out identical on points,
// OMW, GW, OGW and legend, and both produce the same patches.
//  - The official API (topdeck.gg/docs/tournaments-v2): results, TopDeck's
//    own tiebreaks, legends and decks. It has no group field, and in a
//    pooled event (four groups of Swiss) the groups cannot be rebuilt from
//    the pairings until round three.
//  - The public page data that topdeck.gg/bracket/<id> reads (the event
//    document and the player list): no key, and it holds the group split.
//    Undocumented, so everything here reads it defensively.

import { BRACKET_FORMATS } from '../web/shared/bracket.js';

const n = (v) => Number(v) || 0;
// Both sources keep decklist line breaks as a literal backslash + n.
export const unescapeList = (s) => String(s || '').split('\\n').join('\n').trim();
export const normName = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

// "convergence-3", or any topdeck.gg link to it: /event/<id>, /bracket/<id>,
// /tournaments/<id>/standings.
export function parseEventId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const m = raw.match(/topdeck\.gg\/(?:event|bracket|tournaments)\/([A-Za-z0-9_-]+)/i);
  const id = m ? m[1] : raw.replace(/^\/+|\/+$/g, '');
  return /^[A-Za-z0-9_-]{1,120}$/.test(id) ? id : '';
}

// --- the public page data ---

// A Firestore REST document's typed values, flattened.
export function decodeFirestore(doc) {
  const decode = (v) => {
    const [k, x] = Object.entries(v || {})[0] || [];
    if (k === 'mapValue') return Object.fromEntries(Object.entries(x.fields || {}).map(([kk, vv]) => [kk, decode(vv)]));
    if (k === 'arrayValue') return (x.values || []).map(decode);
    if (k === 'integerValue' || k === 'doubleValue') return Number(x);
    return x;
  };
  return Object.fromEntries(Object.entries((doc && doc.fields) || {}).map(([k, v]) => [k, decode(v)]));
}

// The event document's keys, as read off Convergence #2:
//   E<n>:P1          entrant n -> player uid ('_x_' = a released seat)
//   E<n>:D:Drop<k>   drop stamps (Undrop<k> reverses one)
//   S<s>:C:Type      SCI check-in | POOL group split | GRP Swiss in groups | BRKT bracket
//   S<pool>:R0:T<g>  { Es } the entrants in group g
//   S<s>:R<r>:T<t>   { Es:[a,b], Wins:[wa,wb], Draws, End } (no End = still playing)
//   S<s>:R<r>:TB     { Es } the byes
export function buildFromFeed({ doc, players }) {
  const pdata = players || {};
  const entrants = new Map();
  for (const [k, v] of Object.entries(doc)) {
    const m = k.match(/^E(\d+):P1$/);
    if (!m) continue;
    const p = pdata[v] || null;
    entrants.set(m[1], {
      e: m[1], uid: String(v), released: v === '_x_',
      name: p ? String(p.name || '').trim() : '', pronouns: (p && p.pronouns) || '',
      leader: (p && p.leader) || '', decklist: unescapeList(p && p.decklist), group: 0, dropped: false,
    });
  }
  const drops = {};
  for (const k of Object.keys(doc)) {
    const m = k.match(/^E(\d+):D:(Drop|Undrop)\d+$/);
    if (m) drops[m[1]] = (drops[m[1]] || 0) + (m[2] === 'Drop' ? 1 : -1);
  }
  for (const [e, c] of Object.entries(drops)) if (entrants.has(e) && c > 0) entrants.get(e).dropped = true;

  const stages = {};
  for (const [k, v] of Object.entries(doc)) {
    const m = k.match(/^S(\d+):C:Type$/);
    if (m) stages[m[1]] = { type: String(v), rounds: {} };
  }
  for (const [k, v] of Object.entries(doc)) {
    const m = k.match(/^S(\d+):R(\d+):(T\d+|TB)$/);
    if (!m || !stages[m[1]] || !v || typeof v !== 'object') continue;
    const r = (stages[m[1]].rounds[m[2]] ||= { r: Number(m[2]), tables: [], byes: [] });
    const es = (Array.isArray(v.Es) ? v.Es : []).map(String);
    if (m[3] === 'TB') r.byes = es;
    else r.tables.push({ t: Number(m[3].slice(1)), es, winnerE: null, wins: (Array.isArray(v.Wins) ? v.Wins : [0, 0]).map(n), draws: n(v.Draws), done: Boolean(v.End), status: v.End ? 'done' : 'live' });
  }
  for (const st of Object.values(stages)) for (const r of Object.values(st.rounds)) r.tables.sort((a, b) => a.t - b.t);

  const all = Object.values(stages);
  const pool = all.find((s) => s.type === 'POOL');
  if (pool && pool.rounds[0]) for (const tb of pool.rounds[0].tables) for (const e of tb.es) if (entrants.has(e)) entrants.get(e).group = tb.t;
  const swiss = all.find((s) => s.type === 'GRP') || all.find((s) => /swiss/i.test(s.type)) || null;
  const bracket = all.find((s) => s.type === 'BRKT') || null;
  return {
    name: String(doc.Name || ''), status: '', source: 'page', entrants,
    swiss: swiss ? { rounds: swiss.rounds } : null, bracket: bracket ? { rounds: bracket.rounds } : null, official: null,
  };
}

// What the page data adds to an API read: the group split, pronouns, drops.
export function feedExtras(feedModel) {
  const groupOf = new Map(), pronouns = new Map(), dropped = new Set();
  for (const x of feedModel.entrants.values()) {
    if (x.released) continue;
    if (x.group) groupOf.set(x.uid, x.group);
    if (x.pronouns) pronouns.set(x.uid, x.pronouns);
    if (x.dropped) dropped.add(x.uid);
  }
  return { groupOf, pronouns, dropped };
}

// --- the official API ---

export function buildFromApi({ info, standings, rounds }, extras = {}) {
  const groupOf = extras.groupOf || new Map();
  const entrants = new Map();
  const add = (p) => {
    if (!p || !p.id) return;
    const x = entrants.get(p.id);
    if (x) {
      if (!x.leader && p.leader) x.leader = p.leader;
      if (!x.decklist && p.decklist) x.decklist = unescapeList(p.decklist);
      return;
    }
    entrants.set(p.id, {
      e: p.id, uid: p.id, released: false, name: String(p.name || '').trim(), leader: p.leader || '',
      decklist: unescapeList(p.decklist), pronouns: (extras.pronouns && extras.pronouns.get(p.id)) || '',
      group: groupOf.get(p.id) || 0, dropped: Boolean(extras.dropped && extras.dropped.has(p.id)),
    });
  };
  (standings || []).forEach(add);
  for (const r of rounds || []) for (const t of r.tables || []) (t.players || []).forEach(add);
  const table = (t) => {
    const es = (t.players || []).map((p) => p.id);
    const winnerE = t.winner_id && t.winner_id !== 'Draw' ? t.winner_id : null;
    const w = n(t.winner_games), l = n(t.loser_games);
    const done = t.status === 'Completed';
    return {
      t: Number(t.table), es, winnerE, wins: winnerE ? (winnerE === es[0] ? [w, l] : [l, w]) : [0, 0],
      draws: t.winner_id === 'Draw' ? 1 : 0, done, status: done ? 'done' : t.status === 'Pending' ? 'pending' : 'live',
    };
  };
  const round = (r, i) => ({
    r: i,
    tables: (r.tables || []).filter((t) => t.table !== 'Byes').map(table).sort((a, b) => a.t - b.t),
    byes: (((r.tables || []).find((t) => t.table === 'Byes') || {}).players || []).map((p) => p.id),
  });
  const swiss = { rounds: {} };
  const bracket = { rounds: {} };
  for (const r of (rounds || []).filter((x) => typeof x.round === 'number')) swiss.rounds[r.round] = round(r, r.round);
  (rounds || []).filter((x) => typeof x.round !== 'number')
    .map((r) => ({ r, size: Number((String(r.round).match(/\d+/) || [0])[0]) }))
    .sort((a, b) => b.size - a.size)
    .forEach(({ r }, i) => { bracket.rounds[i + 1] = round(r, i + 1); });
  const official = new Map((standings || []).map((s) => [s.id, { points: n(s.points), omw: n(s.opponentWinRate), gw: n(s.gameWinRate), ogw: n(s.opponentGameWinRate) }]));
  return {
    name: String((info && info.name) || ''), status: String((info && info.status) || ''), source: 'api', entrants,
    swiss: Object.keys(swiss.rounds).length ? swiss : null, bracket: Object.keys(bracket.rounds).length ? bracket : null, official,
  };
}

// --- standings ---

// Riftbound tiebreaks the way TopDeck prints them (checked against its API
// for every Convergence #2 player): an opponent's match and game win rates
// are floored at 0.33 (not 1/3) and averaged; a player's own game win rate
// is shown raw; a bye is a 2-0 win and not an opponent; a finished table
// with no games at all (a double no-show) counts for nobody.
export function standings(ev, { group = 0, throughRound = Infinity } = {}) {
  const st = new Map();
  const get = (e) => {
    if (!st.has(e)) st.set(e, { e, mw: 0, ml: 0, md: 0, gw: 0, gl: 0, gd: 0, opps: [] });
    return st.get(e);
  };
  const inGroup = (e) => !group || (ev.entrants.get(e) && ev.entrants.get(e).group === group);
  for (const e of ev.entrants.keys()) if (inGroup(e) && !ev.entrants.get(e).released) get(e);
  const rounds = Object.values((ev.swiss && ev.swiss.rounds) || {}).filter((r) => r.r <= throughRound).sort((a, b) => a.r - b.r);
  let played = 0;
  for (const r of rounds) {
    let any = false;
    for (const tb of r.tables) {
      if (!tb.done || tb.es.length !== 2) continue;
      const [a, b] = tb.es;
      const res = tb.winnerE ? (tb.winnerE === a ? 'a' : 'b')
        : tb.wins[0] > tb.wins[1] ? 'a' : tb.wins[1] > tb.wins[0] ? 'b' : (tb.draws || tb.wins[0]) ? 'd' : null;
      if (!res || !inGroup(a)) continue;
      any = true;
      const A = get(a), B = get(b);
      A.opps.push(b); B.opps.push(a);
      A.gw += tb.wins[0]; A.gl += tb.wins[1]; A.gd += tb.draws;
      B.gw += tb.wins[1]; B.gl += tb.wins[0]; B.gd += tb.draws;
      if (res === 'a') { A.mw++; B.ml++; } else if (res === 'b') { B.mw++; A.ml++; } else { A.md++; B.md++; }
    }
    for (const e of r.byes) {
      if (!inGroup(e) || !ev.entrants.has(e)) continue;
      const P = get(e); P.mw++; P.gw += 2; any = true;
    }
    if (any) played = r.r;
  }
  const FLOOR = 0.33;
  const pts = (s) => s.mw * 3 + s.md;
  const mwp = (s) => { const m = s.mw + s.ml + s.md; return m ? Math.max(FLOOR, pts(s) / (3 * m)) : FLOOR; };
  const gwRaw = (s) => { const g = s.gw + s.gl + s.gd; return g ? (s.gw * 3 + s.gd) / (3 * g) : 0; };
  const gwp = (s) => Math.max(FLOOR, gwRaw(s));
  const avg = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0);
  const rows = [...st.values()].map((s) => {
    const ent = ev.entrants.get(s.e);
    return {
      e: s.e, name: ent.name || 'Unknown player', leader: ent.leader, group: ent.group, dropped: ent.dropped,
      record: `${s.mw}-${s.ml}${s.md ? `-${s.md}` : ''}`, points: pts(s),
      omw: avg(s.opps.map((o) => mwp(get(o)))), gw: gwRaw(s), ogw: avg(s.opps.map((o) => gwp(get(o)))),
    };
  });
  // From the API, TopDeck's own numbers for the standings as they stand (a
  // drawn match carries no game counts there, so a recomputed GW% drifts).
  if (ev.official && throughRound === Infinity) {
    for (const r of rows) {
      const o = ev.official.get(r.e);
      if (o) Object.assign(r, o);
    }
  }
  rows.sort((a, b) => b.points - a.points || b.omw - a.omw || b.gw - a.gw || b.ogw - a.ogw || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { round: played, rows };
}

// --- rounds for the panel ---

const BRACKET_NAMES = { 16: 'Round of 32', 8: 'Round of 16', 4: 'Quarterfinals', 2: 'Semifinals', 1: 'Grand final' };
export function roundLabel(stage, r) {
  if (stage === 'bracket') return BRACKET_NAMES[r.tables.length] || `Top ${r.tables.length * 2}`;
  return `Round ${r.r}`;
}

export const groupsOf = (ev) => [...new Set([...ev.entrants.values()].map((x) => x.group))].filter(Boolean).sort((a, b) => a - b);

function stageRounds(ev) {
  const out = [];
  for (const stage of ['swiss', 'bracket']) {
    const st = ev[stage];
    if (!st) continue;
    for (const r of Object.values(st.rounds).sort((a, b) => a.r - b.r)) out.push({ stage, r });
  }
  return out;
}

export function findTable(ev, roundId, table) {
  const [stage, num] = String(roundId || '').split(':');
  const st = stage === 'bracket' ? ev.bracket : stage === 'swiss' ? ev.swiss : null;
  const r = st && st.rounds[num];
  const t = r && r.tables.find((x) => x.t === Number(table));
  return t ? { stage, r, t } : null;
}

// Each player's Swiss record going INTO a round (a bracket round: the whole Swiss).
function recordsBefore(ev, stage, r) {
  const through = stage === 'swiss' ? r.r - 1 : Infinity;
  const s = standings(ev, { throughRound: through });
  return new Map(s.rows.map((x) => [x.e, x.record]));
}

// Everything the panel's match picker lists, light enough to poll.
export function summarize(ev, legendOf) {
  const rounds = stageRounds(ev).map(({ stage, r }) => {
    const rec = recordsBefore(ev, stage, r);
    const player = (e) => {
      const ent = ev.entrants.get(e) || { name: 'Unknown player', leader: '' };
      const L = legendOf(ent.leader);
      return { name: ent.name, legend: L.legend, legendSlug: L.legendSlug, record: rec.get(e) || '', dropped: Boolean(ent.dropped) };
    };
    return {
      id: `${stage}:${r.r}`, stage, round: r.r, label: roundLabel(stage, r),
      done: r.tables.filter((t) => t.done).length,
      tables: r.tables.map((t) => ({
        table: t.t, group: stage === 'swiss' && ev.entrants.get(t.es[0]) ? ev.entrants.get(t.es[0]).group : 0,
        status: t.status, games: t.done || t.wins[0] || t.wins[1] ? t.wins : null, draw: Boolean(t.done && !t.winnerE && t.wins[0] === t.wins[1] && (t.draws || t.wins[0])),
        winner: t.done ? (t.winnerE ? t.es.indexOf(t.winnerE) : t.wins[0] > t.wins[1] ? 0 : t.wins[1] > t.wins[0] ? 1 : -1) : -1,
        players: t.es.map(player),
      })),
      byes: r.byes.map((e) => (ev.entrants.get(e) || {}).name).filter(Boolean),
    };
  });
  const decks = [...ev.entrants.values()].filter((x) => x.decklist).length;
  return {
    name: ev.name, status: ev.status, source: ev.source, players: [...ev.entrants.values()].filter((x) => !x.released).length,
    groups: groupsOf(ev), rounds, decks,
    bracketReady: Boolean(ev.bracket && Object.keys(ev.bracket.rounds).length),
  };
}

// --- patches: what a click loads into preview ---

const ordinal = (k) => `${k}${(k % 100 >= 11 && k % 100 <= 13) ? 'TH' : ['TH', 'ST', 'ND', 'RD'][k % 10] || 'TH'}`;
const pct1 = (x) => Math.round(x * 1000) / 10;

export function standingsPatch(ev, legendOf, { group = 0, cut = 4 } = {}) {
  const s = standings(ev, { group });
  const rows = s.rows.slice(0, 64).map((r) => ({
    name: r.name.slice(0, 40), record: r.record, ...legendOf(r.leader),
    points: r.points, omw: pct1(r.omw), gw: pct1(r.gw), ogw: pct1(r.ogw),
  }));
  const label = [group ? `Group ${group}` : '', s.round ? `after Round ${s.round}` : ''].filter(Boolean).join(' · ');
  return { patch: { event: { standings: { rows, cut, label } } }, round: s.round, count: rows.length, leader: rows[0] ? rows[0].name : '' };
}

// The bracket as TopDeck ran it: its first-round tables fill Sideways
// Studio's first-round matches in order (both feed the next round 1+2,
// 3+4, ...), and every later result is placed by who played, since TopDeck
// lists a table's two players in either order. Seeds stay blank so the
// graphic numbers the slots itself: Convergence #2's seeding did not follow
// the points, so there is no rule to reproduce.
export function bracketModel(ev) {
  const tdRounds = Object.values((ev.bracket && ev.bracket.rounds) || {}).sort((a, b) => a.r - b.r);
  if (!tdRounds.length) return { error: 'The bracket has not started on TopDeck yet.' };
  const r1 = tdRounds[0].tables;
  const format = r1.length === 8 ? 'se16' : r1.length === 4 ? 'se8' : null;
  if (!format) return { error: `The bracket opens with ${r1.length} tables; Sideways Studio draws a Top 8 or a Top 16.` };
  const f = BRACKET_FORMATS[format];
  const seedE = {};
  f.matches.filter((m) => m.round === 0).forEach((m, i) => {
    if (!r1[i]) return;
    seedE[m.top.seed] = r1[i].es[0];
    seedE[m.bottom.seed] = r1[i].es[1];
  });
  const winnerE = {};
  const results = {};
  const slots = {};
  for (const m of f.matches) {
    const topE = m.top.seed ? seedE[m.top.seed] : winnerE[m.top.winner];
    const botE = m.bottom.seed ? seedE[m.bottom.seed] : winnerE[m.bottom.winner];
    const tdR = tdRounds[m.round];
    if (!topE || !botE || !tdR) continue;
    const t = tdR.tables.find((x) => x.es.includes(topE) && x.es.includes(botE));
    if (!t) continue;
    slots[`${m.round + 1}:${t.t}`] = { id: m.id, topE, botE };
    const flip = t.es[0] !== topE;
    const top = flip ? t.wins[1] : t.wins[0];
    const bottom = flip ? t.wins[0] : t.wins[1];
    const winner = !t.done ? '' : t.winnerE ? (t.winnerE === topE ? 'top' : 'bottom') : top > bottom ? 'top' : bottom > top ? 'bottom' : '';
    if (winner) winnerE[m.id] = winner === 'top' ? topE : botE;
    if (winner || top || bottom) results[m.id] = { top, bottom, winner };
  }
  const seedOf = new Map(Object.entries(seedE).map(([s, e]) => [e, Number(s)]));
  return { format, seedE, results, slots, seedOf, players: f.players };
}

export function bracketPatch(ev, legendOf) {
  const b = bracketModel(ev);
  if (b.error) return b;
  const rec = recordsBefore(ev, 'bracket', null);
  const players = Array.from({ length: b.players }, (_, i) => {
    const ent = ev.entrants.get(b.seedE[i + 1]);
    return ent ? { name: ent.name.slice(0, 40), record: rec.get(ent.e) || '', seed: '', ...legendOf(ent.leader) } : { name: '' };
  });
  return { patch: { event: { bracket: { format: b.format, players, results: b.results } } }, format: b.format, results: Object.keys(b.results).length };
}

const SIDE_EXTRAS_CLEARED = {
  country: '', archetype: '', team: '', store: '', seasonRecord: '', bestFinish: '', finishes: '',
  hand: [], handCount: 0, handUnknown: 0, holds: '', battlefield: '', battlefieldCardId: '',
  card: { cardId: '', cardName: '' }, deckList: '', deckName: '', champion: '', battlefields: [],
};

// One table into the match: both players' identity, record going in,
// legend, pronouns and (once TopDeck shows decks) the list, champion and
// battlefields. A player who was not already on that side also loses the
// previous player's hand-typed extras (team, store, finishes, hand...), and
// a new pairing starts at 0 points and 0 games; reloading the pairing that
// is already up keeps whatever the operator has counted. A finished table
// brings its game score. `deckOf` resolves a list against the card library.
export function matchPatch(ev, legendOf, { round, table, swap = false, bank, deckOf }) {
  const found = findTable(ev, round, table);
  if (!found) return { error: 'That table is no longer on TopDeck. Refresh and pick again.' };
  const { stage, r, t } = found;
  if (t.es.length !== 2) return { error: 'That table does not have two players.' };
  const order = swap ? [t.es[1], t.es[0]] : [t.es[0], t.es[1]];
  const rec = recordsBefore(ev, stage, r);
  const seeds = stage === 'bracket' ? bracketModel(ev).seedOf : null;
  const cur = [bank.match.left, bank.match.right];
  const same = order.map((e, i) => normName(cur[i].name) === normName((ev.entrants.get(e) || {}).name));
  const newPairing = !(same[0] && same[1]);

  const side = (e, i) => {
    const ent = ev.entrants.get(e);
    const L = legendOf(ent.leader);
    const out = same[i] ? {} : { ...SIDE_EXTRAS_CLEARED, card: { cardId: '', cardName: '' }, hand: [], battlefields: [] };
    Object.assign(out, {
      name: ent.name.slice(0, 40), record: rec.get(e) || '',
      seed: seeds && seeds.get(e) ? ordinal(seeds.get(e)) : '',
    });
    // What TopDeck does not know yet (no deck submitted, event not started)
    // leaves a returning player's hand-typed value alone.
    if (ent.leader || !same[i]) Object.assign(out, { legend: L.legend, legendSlug: L.legendSlug, legendCardId: L.legendCardId });
    if (ent.pronouns || !same[i]) out.pronouns = (ent.pronouns || '').slice(0, 16);
    if (ent.decklist) {
      const deck = deckOf ? deckOf(ent.decklist) : null;
      out.deckList = ent.decklist;
      out.deckName = String(L.legend || '').split(',')[0];
      if (deck) {
        if (deck.champion) out.champion = deck.champion.name || deck.champion.raw || '';
        // A reload mid-match keeps the battlefields already marked played.
        const played = new Set(same[i] ? (cur[i].battlefields || []).filter((b) => b.played).map((b) => normName(b.name)) : []);
        out.battlefields = deck.battlefields.slice(0, 3).map((b) => ({ name: b.name || b.raw, cardId: b.cardId || '', played: played.has(normName(b.name || b.raw)) }));
        if (!out.legendCardId && deck.legend && deck.legend.cardId) out.legendCardId = deck.legend.cardId;
      }
    }
    if (newPairing) out.score = 0;
    if (t.done && (t.wins[0] || t.wins[1])) out.gameWins = Math.min(3, t.wins[t.es.indexOf(e)]);
    else if (newPairing) out.gameWins = 0;
    return out;
  };

  const group = stage === 'swiss' && ev.entrants.get(t.es[0]) ? ev.entrants.get(t.es[0]).group : 0;
  const roundTitle = [roundLabel(stage, r), group ? `Group ${group}` : ''].filter(Boolean).join(' · ');
  const patch = { match: { left: side(order[0], 0), right: side(order[1], 1) }, event: { roundTitle } };
  if (newPairing) patch.match.result = { winner: '', note: '' };
  if (newPairing) patch.match.choseFirst = '';
  if (!bank.event.name && ev.name) patch.event.name = ev.name.slice(0, 80);
  return {
    patch, newPairing, roundTitle, table: t.t, group,
    games: t.done && (t.wins[0] || t.wins[1]) ? [patch.match.left.gameWins, patch.match.right.gameWins] : null,
    names: [patch.match.left.name, patch.match.right.name],
    decks: [Boolean(patch.match.left.deckList), Boolean(patch.match.right.deckList)],
  };
}

// One table onto the up-next board (four at most, the board's own limit).
export function upNextPatch(ev, legendOf, { round, table, bank }) {
  const found = findTable(ev, round, table);
  if (!found) return { error: 'That table is no longer on TopDeck. Refresh and pick again.' };
  const { stage, r, t } = found;
  const rec = recordsBefore(ev, stage, r);
  const tside = (e) => {
    const ent = ev.entrants.get(e) || { name: '', leader: '' };
    return { name: ent.name.slice(0, 40), record: rec.get(e) || '', seed: '', ...legendOf(ent.leader) };
  };
  const label = `Table ${t.t}`;
  const entry = { label, left: tside(t.es[0]), right: tside(t.es[1]) };
  const tables = (bank.event.tables || []).filter((x) => !(x.label === label && normName(x.left && x.left.name) === normName(entry.left.name)));
  if (tables.length >= 4) return { error: 'Up next already lists four tables. Clear it first.' };
  return { patch: { event: { tables: [...tables, entry] } }, count: tables.length + 1 };
}

// --- the legend distribution (2026-09-19) ---

// Who won a finished table: 'a' or 'b' (its first or second player), 'd'
// for a draw, null for a table that counts for nobody (a double no-show).
// The same reading the standings above make.
function tableResult(tb) {
  if (tb.winnerE) return tb.winnerE === tb.es[0] ? 'a' : 'b';
  if (tb.wins[0] > tb.wins[1]) return 'a';
  if (tb.wins[1] > tb.wins[0]) return 'b';
  return (tb.draws || tb.wins[0]) ? 'd' : null;
}

// How many players brought each legend, and how each legend did against the
// others. Shares count every player TopDeck lists a legend for, dropped
// players included (they brought the deck); a player with no legend yet is
// left out and counted in `unknown`. A legend's record counts finished
// matches against a different legend: a mirror says nothing about a legend
// against the field, a draw is neither a win nor a loss, and a bye is not a
// match. The whole event counts every Swiss and bracket match; a group
// counts its own Swiss.
export function legendStats(ev, legendOf, { group = 0 } = {}) {
  const inGroup = (ent) => !group || ent.group === group;
  const keyOf = (ent) => {
    const L = legendOf(ent.leader);
    return { key: L.legendSlug || normName(L.legend), L };
  };
  const rows = new Map();
  let players = 0;
  let unknown = 0;
  for (const ent of ev.entrants.values()) {
    if (ent.released || !inGroup(ent)) continue;
    const { key, L } = ent.leader ? keyOf(ent) : { key: '' };
    if (!key) { unknown += 1; continue; }
    if (!rows.has(key)) rows.set(key, { legend: L.legend, legendSlug: L.legendSlug, legendCardId: L.legendCardId, players: 0, wins: 0, losses: 0 });
    rows.get(key).players += 1;
    players += 1;
  }
  let matches = 0;
  let mirrors = 0;
  let draws = 0;
  let through = 0;
  let cut = false;
  for (const stage of group ? ['swiss'] : ['swiss', 'bracket']) {
    for (const r of Object.values((ev[stage] && ev[stage].rounds) || {})) {
      for (const tb of r.tables) {
        if (!tb.done || tb.es.length !== 2) continue;
        const a = ev.entrants.get(tb.es[0]);
        const b = ev.entrants.get(tb.es[1]);
        if (!a || !b || !inGroup(a)) continue;
        const res = tableResult(tb);
        if (!res) continue;
        if (stage === 'swiss') through = Math.max(through, r.r); else cut = true;
        if (!a.leader || !b.leader) continue;
        const ka = keyOf(a).key;
        const kb = keyOf(b).key;
        if (!rows.has(ka) || !rows.has(kb)) continue;
        if (res === 'd') { draws += 1; continue; }
        if (ka === kb) { mirrors += 1; continue; }
        matches += 1;
        rows.get(res === 'a' ? ka : kb).wins += 1;
        rows.get(res === 'a' ? kb : ka).losses += 1;
      }
    }
  }
  const sorted = [...rows.values()].sort((x, y) => y.players - x.players || x.legend.localeCompare(y.legend));
  return { rows: sorted, players, unknown, matches, mirrors, draws, through, cut };
}

export function legendStatsPatch(ev, legendOf, { group = 0 } = {}) {
  const s = legendStats(ev, legendOf, { group });
  if (!s.players) {
    return { error: s.unknown
      ? `TopDeck lists no legends for ${group ? `group ${group}` : 'this event'} yet: it shows them once the event ends or the organizer allows it.`
      : 'There are no players to count yet.' };
  }
  const label = [
    group ? `Group ${group}` : '',
    s.through ? `after Round ${s.through}` : 'before Round 1',
    s.cut ? 'top cut included' : '',
  ].filter(Boolean).join(' · ');
  // The graphic prints the note under the win rates, so it says how they
  // were counted. Players with no legend only reach the operator's status
  // line: the graphic already names how many players it counts.
  const note = s.matches
    ? `Win rate: ${s.matches} match${s.matches === 1 ? '' : 'es'} between different legends; mirror matches, draws and byes left out.`
    : '';
  const rows = s.rows.slice(0, 64).map((r) => ({ ...r, share: null, winRate: null }));
  // The rows count every player with a legend, so the field is what they add
  // up to: total 0 also clears a field size typed for an earlier list.
  return {
    patch: { event: { legendStats: { rows, total: 0, label, note } } },
    players: s.players, legends: s.rows.length, matches: s.matches, unknown: s.unknown,
    lead: s.rows[0] ? s.rows[0].legend : '',
  };
}

// A whole round onto the pairings graphic (2026-09-19): every table of the
// round, or of one group in a pooled Swiss, in table order, each player with
// the record they took into the round and their legend, and each finished
// table with its games and who won. The byes of that round (and group) go
// with them. Loading a different round or group puts the graphic back on
// its first page; loading the same one again (fresh results) keeps the page
// that is up.
export const PAIRINGS_MAX = 128;
export function pairingsPatch(ev, legendOf, { round, group: wanted = 0, bank }) {
  const [stage, num] = String(round || '').split(':');
  const st = stage === 'bracket' ? ev.bracket : stage === 'swiss' ? ev.swiss : null;
  const r = st && st.rounds[num];
  if (!r) return { error: 'That round is no longer on TopDeck. Refresh and pick again.' };
  // Groups split the Swiss only; a bracket round is one field.
  const group = stage === 'swiss' ? wanted : 0;
  const groupOf = (e) => (stage === 'swiss' && ev.entrants.get(e) ? ev.entrants.get(e).group : 0);
  const tables = r.tables.filter((t) => !group || groupOf(t.es[0]) === group);
  if (!tables.length) return { error: group ? `Group ${group} has no tables in ${roundLabel(stage, r)}.` : `${roundLabel(stage, r)} has no tables yet.` };
  const rec = recordsBefore(ev, stage, r);
  const tside = (e) => {
    const ent = e && ev.entrants.get(e);
    return ent ? { name: ent.name.slice(0, 40), record: rec.get(e) || '', ...legendOf(ent.leader) } : { name: '' };
  };
  const rows = tables.slice(0, PAIRINGS_MAX).map((t) => {
    const winner = !t.done ? ''
      : t.winnerE ? (['left', 'right'][t.es.indexOf(t.winnerE)] || '')
        : t.wins[0] > t.wins[1] ? 'left' : t.wins[1] > t.wins[0] ? 'right' : (t.draws || t.wins[0]) ? 'draw' : '';
    return { table: t.t, left: tside(t.es[0]), right: tside(t.es[1]), status: t.status, score: [t.wins[0], t.wins[1]], winner };
  });
  const label = [roundLabel(stage, r), group ? `Group ${group}` : ''].filter(Boolean).join(' · ');
  const byes = (r.byes || []).filter((e) => !group || groupOf(e) === group)
    .map((e) => (ev.entrants.get(e) || {}).name).filter(Boolean).map((name) => name.slice(0, 40));
  const patch = { event: { pairings: { rows, label, byes } } };
  if (!bank || !bank.event.pairings || bank.event.pairings.label !== label) patch.scenes = { pairings: { page: 1 } };
  if (bank && !bank.event.name && ev.name) patch.event.name = ev.name.slice(0, 80);
  return {
    patch, label, count: rows.length, done: rows.filter((x) => x.status === 'done').length,
    byes: byes.length, dropped: Math.max(0, tables.length - PAIRINGS_MAX),
  };
}
