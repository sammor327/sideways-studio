// The matchup matrix from a Rift Registry event (2026-09-19, Sam: "a legend
// matchup matrix scene. Pull reference from rift registry"). Pure: no
// network, no files, no app state, so the tests drive it with fixtures;
// server/rrmatrix.js does the fetching and the routes.
//
// Rift Registry publishes every event it tracks as open data
// (riftregistry.com/llms.txt, "Data (JSON, no auth)", free to cite with
// attribution): an index of the events, and per event an export with the
// final standings (results.rows, each player's legend) and the round by
// round pairings (rounds.pairings_per_round). A match there is
//   { winner: { player_id }, loser: { player_id }, result: 'win' }  or
//   { player_a: { player_id }, player_b: { player_id }, result: 'draw' }.
// They are tallied the way the Tournament platform's are (web/shared/matrix.js
// tallyMatrix): mirrors, draws and byes (byes are not in the pairings) say
// nothing about one legend against another.

import { tallyMatrix } from '../web/shared/matrix.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-09-05" -> "Sep 5, 2026"; anything else as it came.
export function eventDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || !MONTHS[Number(m[2]) - 1]) return String(iso || '').slice(0, 20);
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// The index, newest first, without the events that have not happened yet
// (the index lists an upcoming event's stub before it is played). `today`
// is an ISO date, so the tests pin it.
export function eventList(index, today = new Date().toISOString().slice(0, 10)) {
  const events = index && Array.isArray(index.events) ? index.events : [];
  return events
    .filter((e) => e && typeof e.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(e.id))
    .filter((e) => !e.start_date || String(e.start_date).slice(0, 10) <= today)
    .map((e) => ({ id: e.id, name: String(e.name || e.id).slice(0, 80), date: String(e.start_date || '').slice(0, 10), generated: String(e.generated || '') }))
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : a.name.localeCompare(b.name)));
}

// One event's export tallied: every legend's record against every other.
export function eventMatrix(doc, legendOf) {
  const rows = doc && doc.results && Array.isArray(doc.results.rows) ? doc.results.rows : [];
  const legendBy = new Map();
  const players = [];
  let unknown = 0;
  for (const r of rows) {
    if (!r || r.player_id === undefined || r.player_id === null) continue;
    const L = r.legend ? legendOf(String(r.legend)) : null;
    if (L && (L.legendSlug || L.legend)) {
      legendBy.set(String(r.player_id), L);
      players.push(L);
    } else unknown += 1;
  }
  const rounds = doc && doc.rounds && Array.isArray(doc.rounds.pairings_per_round) ? doc.rounds.pairings_per_round : [];
  const idOf = (side) => (side && side.player_id !== undefined ? legendBy.get(String(side.player_id)) || null : null);
  const games = [];
  for (const round of rounds) {
    for (const m of (round && Array.isArray(round.matches) ? round.matches : [])) {
      if (!m || typeof m !== 'object') continue;
      if (m.result === 'draw') games.push({ a: idOf(m.player_a), b: idOf(m.player_b), result: 'd' });
      else if (m.winner && m.loser) games.push({ a: idOf(m.winner), b: idOf(m.loser), result: 'a' });
    }
  }
  const ev = (doc && doc.event) || {};
  return {
    ...tallyMatrix({ players, games }),
    players: players.length, unknown, rounds: rounds.length,
    name: String(ev.name || ev.id || '').slice(0, 80), date: String(ev.start_date || '').slice(0, 10), set: String(ev.set_format || '').slice(0, 30),
  };
}

const grouped = (n) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// The tally as a patch the store takes: the event's name as the graphic's
// title (it is not this event), its date and set as the label, how the
// numbers were counted as the note, and Rift Registry credited.
export function eventMatrixPatch(doc, legendOf) {
  const s = eventMatrix(doc, legendOf);
  if (!s.rounds) return { error: `Rift Registry has no round by round pairings for ${s.name || 'this event'}, so there are no matchups to count.` };
  if (!s.players) return { error: `Rift Registry lists no legends for ${s.name || 'this event'}'s players.` };
  if (!s.pairs.length) return { error: `${s.name || 'This event'} has no match between two different legends on Rift Registry.` };
  const label = [eventDate(s.date), s.set].filter(Boolean).join(' · ');
  const note = `Win rate across the row: ${grouped(s.matches)} match${s.matches === 1 ? '' : 'es'} between different legends; mirror matches, draws and byes left out.`;
  return {
    patch: { event: { matrix: { legends: s.legends, pairs: s.pairs, title: s.name, label, note, source: 'Rift Registry' } } },
    name: s.name, legends: s.legends.length, matches: s.matches, players: s.players, unknown: s.unknown, dropped: s.dropped,
  };
}
