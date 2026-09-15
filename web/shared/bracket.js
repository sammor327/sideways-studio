// The bracket model: formats, seeding, feeds and progression.
//
// Shared by the server (validation of match ids), the bracket scene (layout
// and drawing) and the panel (the match list an operator clicks through).
// Plain ESM with no browser or Node dependencies, like the look model.
//
// A format is a list of matches. Each match names where its two players
// come from: a seed (the first round), the winner of another match, or the
// loser of another match (double elimination drops). Results are keyed by
// match id: { top, bottom, winner } with winner '' | 'top' | 'bottom'.
// buildBracket() resolves every slot from the seeded players and the
// results, so a scene or a test asks one function who is where.

// Seed pairings for the first round, 1-indexed seeds.
const SE8_PAIRS = [[1, 8], [4, 5], [2, 7], [3, 6]];
const SE16_PAIRS = [[1, 16], [8, 9], [4, 13], [5, 12], [2, 15], [7, 10], [3, 14], [6, 11]];

const seed = (n) => ({ seed: n });
const win = (id) => ({ winner: id });
const lose = (id) => ({ loser: id });

function single(pairs, rounds) {
  const matches = [];
  pairs.forEach(([a, b], i) => matches.push({ id: `W${i + 1}`, round: 0, top: seed(a), bottom: seed(b) }));
  let prev = pairs.length;
  let from = 1;
  for (let r = 1; r < rounds; r += 1) {
    const n = prev / 2;
    for (let i = 0; i < n; i += 1) {
      const id = r === rounds - 1 ? 'GF' : `W${from + prev + i}`;
      matches.push({ id, round: r, top: win(`W${from + i * 2}`), bottom: win(`W${from + i * 2 + 1}`) });
    }
    from += prev;
    prev = n;
  }
  return matches;
}

// Double elimination, 8 players (the standard drop pattern, crossed so a
// first-round pairing cannot meet again in the losers' second round).
function de8() {
  return [
    ...SE8_PAIRS.map(([a, b], i) => ({ id: `W${i + 1}`, round: 0, top: seed(a), bottom: seed(b) })),
    { id: 'W5', round: 1, top: win('W1'), bottom: win('W2') },
    { id: 'W6', round: 1, top: win('W3'), bottom: win('W4') },
    { id: 'W7', round: 2, top: win('W5'), bottom: win('W6'), label: 'Winners final' },
    { id: 'L1', round: 0, losers: true, top: lose('W1'), bottom: lose('W2') },
    { id: 'L2', round: 0, losers: true, top: lose('W3'), bottom: lose('W4') },
    { id: 'L3', round: 1, losers: true, top: lose('W6'), bottom: win('L1') },
    { id: 'L4', round: 1, losers: true, top: lose('W5'), bottom: win('L2') },
    { id: 'L5', round: 2, losers: true, top: win('L3'), bottom: win('L4') },
    { id: 'L6', round: 3, losers: true, top: lose('W7'), bottom: win('L5'), label: 'Losers final' },
    { id: 'GF', round: 3, top: win('W7'), bottom: win('L6'), label: 'Grand final' },
  ];
}

function de16() {
  const m = [
    ...SE16_PAIRS.map(([a, b], i) => ({ id: `W${i + 1}`, round: 0, top: seed(a), bottom: seed(b) })),
    { id: 'W9', round: 1, top: win('W1'), bottom: win('W2') },
    { id: 'W10', round: 1, top: win('W3'), bottom: win('W4') },
    { id: 'W11', round: 1, top: win('W5'), bottom: win('W6') },
    { id: 'W12', round: 1, top: win('W7'), bottom: win('W8') },
    { id: 'W13', round: 2, top: win('W9'), bottom: win('W10') },
    { id: 'W14', round: 2, top: win('W11'), bottom: win('W12') },
    { id: 'W15', round: 3, top: win('W13'), bottom: win('W14'), label: 'Winners final' },
    { id: 'L1', round: 0, losers: true, top: lose('W1'), bottom: lose('W2') },
    { id: 'L2', round: 0, losers: true, top: lose('W3'), bottom: lose('W4') },
    { id: 'L3', round: 0, losers: true, top: lose('W5'), bottom: lose('W6') },
    { id: 'L4', round: 0, losers: true, top: lose('W7'), bottom: lose('W8') },
    { id: 'L5', round: 1, losers: true, top: lose('W12'), bottom: win('L1') },
    { id: 'L6', round: 1, losers: true, top: lose('W11'), bottom: win('L2') },
    { id: 'L7', round: 1, losers: true, top: lose('W10'), bottom: win('L3') },
    { id: 'L8', round: 1, losers: true, top: lose('W9'), bottom: win('L4') },
    { id: 'L9', round: 2, losers: true, top: win('L5'), bottom: win('L6') },
    { id: 'L10', round: 2, losers: true, top: win('L7'), bottom: win('L8') },
    { id: 'L11', round: 3, losers: true, top: lose('W14'), bottom: win('L9') },
    { id: 'L12', round: 3, losers: true, top: lose('W13'), bottom: win('L10') },
    { id: 'L13', round: 4, losers: true, top: win('L11'), bottom: win('L12') },
    { id: 'L14', round: 5, losers: true, top: lose('W15'), bottom: win('L13'), label: 'Losers final' },
    { id: 'GF', round: 4, top: win('W15'), bottom: win('L14'), label: 'Grand final' },
  ];
  return m;
}

export const BRACKET_FORMATS = {
  se8: { name: 'Top 8, single elimination', players: 8, matches: single(SE8_PAIRS, 3), rounds: ['Quarterfinals', 'Semifinals', 'Grand final'] },
  se16: { name: 'Top 16, single elimination', players: 16, matches: single(SE16_PAIRS, 4), rounds: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Grand final'] },
  de8: { name: 'Top 8, double elimination', players: 8, matches: de8(), rounds: ['Winners round 1', 'Winners round 2', 'Winners final', 'Grand final'], losersRounds: ['Losers round 1', 'Losers round 2', 'Losers round 3', 'Losers final'] },
  de16: { name: 'Top 16, double elimination', players: 16, matches: de16(), rounds: ['Winners round 1', 'Winners round 2', 'Winners semifinals', 'Winners final', 'Grand final'], losersRounds: ['Losers round 1', 'Losers round 2', 'Losers round 3', 'Losers round 4', 'Losers round 5', 'Losers final'] },
};
export const BRACKET_FORMAT_KEYS = Object.keys(BRACKET_FORMATS);

export const MATCH_ID = /^(W\d{1,2}|L\d{1,2}|GF)$/;

// A match's own label: the round name plus its number within that round.
export function matchLabel(format, match) {
  const f = BRACKET_FORMATS[format];
  if (match.label) return match.label;
  const names = match.losers ? f.losersRounds : f.rounds;
  const peers = f.matches.filter((m) => Boolean(m.losers) === Boolean(match.losers) && m.round === match.round && !m.label);
  const n = peers.indexOf(match) + 1;
  return peers.length > 1 ? `${names[match.round]} ${n}` : names[match.round];
}

function emptyPlayer() {
  return { name: '', country: '', seed: '', record: '', legend: '', legendSlug: '', legendCardId: '' };
}

// Resolve every slot. Returns { format, matches: [{ id, round, losers, label,
// top, bottom, topScore, bottomScore, winner, state }], champion } where each
// slot is { player, placeholder, seedNo, out }. state is 'done' | 'live' |
// 'ready' | 'waiting'. A match is live when both players are known, no
// winner is set and at least one score is on the board.
export function buildBracket(format, players, results) {
  const f = BRACKET_FORMATS[format] || BRACKET_FORMATS.se8;
  const res = results && typeof results === 'object' ? results : {};
  const byId = new Map();
  const resolved = new Map();
  for (const m of f.matches) byId.set(m.id, m);

  const slotFor = (src) => {
    if (src.seed) {
      const p = players[src.seed - 1];
      return { player: p && p.name ? { ...emptyPlayer(), ...p, seed: p.seed || String(src.seed) } : null, placeholder: `Seed ${src.seed}`, seedNo: src.seed, out: false };
    }
    const from = resolved.get(src.winner || src.loser);
    if (!from) return { player: null, placeholder: '', seedNo: 0, out: false };
    const want = src.winner ? 'winner' : 'loser';
    const label = `${want === 'winner' ? 'Winner' : 'Loser'} ${src.winner || src.loser}`;
    if (!from.winner) return { player: null, placeholder: label, seedNo: 0, out: false, pending: true, names: [from.top.player, from.bottom.player].filter(Boolean).map((p) => p.name) };
    const winnerSlot = from.winner === 'top' ? from.top : from.bottom;
    const loserSlot = from.winner === 'top' ? from.bottom : from.top;
    const slot = want === 'winner' ? winnerSlot : loserSlot;
    return { player: slot.player, placeholder: label, seedNo: slot.seedNo, out: false };
  };

  const out = [];
  for (const m of f.matches) {
    const r = res[m.id] || {};
    const top = slotFor(m.top);
    const bottom = slotFor(m.bottom);
    const topScore = Number.isInteger(r.top) ? r.top : 0;
    const bottomScore = Number.isInteger(r.bottom) ? r.bottom : 0;
    const winner = (r.winner === 'top' || r.winner === 'bottom') && top.player && bottom.player ? r.winner : '';
    if (winner) {
      (winner === 'top' ? bottom : top).out = true;
    }
    const known = Boolean(top.player && bottom.player);
    const state = winner ? 'done' : (known && (topScore || bottomScore) ? 'live' : (known ? 'ready' : 'waiting'));
    const entry = { id: m.id, round: m.round, losers: Boolean(m.losers), label: matchLabel(format, m), top, bottom, topScore, bottomScore, winner, state };
    resolved.set(m.id, entry);
    out.push(entry);
  }
  const gf = resolved.get('GF');
  const champion = gf && gf.winner ? (gf.winner === 'top' ? gf.top.player : gf.bottom.player) : null;
  // In double elimination a player who lost in the losers bracket is out;
  // a winners-bracket loser is only out once they lose again. Mark it.
  const eliminated = new Set();
  for (const e of out) {
    if (!e.winner) continue;
    const loserSlot = e.winner === 'top' ? e.bottom : e.top;
    const isSE = !f.matches.some((m) => m.losers);
    if (loserSlot.player && (isSE || e.losers || e.id === 'GF')) eliminated.add(loserSlot.player.name);
  }
  return { format: BRACKET_FORMATS[format] ? format : 'se8', matches: out, champion, eliminated };
}

// Sanitize a results map: unknown ids and malformed entries drop.
export function cleanBracketResults(raw, format) {
  const f = BRACKET_FORMATS[format] || BRACKET_FORMATS.se8;
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const m of f.matches) {
    const r = raw[m.id];
    if (!r || typeof r !== 'object') continue;
    const clamp = (v) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.min(9, Math.max(0, n)) : 0; };
    const winner = r.winner === 'top' || r.winner === 'bottom' ? r.winner : '';
    const top = clamp(r.top);
    const bottom = clamp(r.bottom);
    if (!winner && !top && !bottom) continue;
    out[m.id] = { top, bottom, winner };
  }
  return out;
}
