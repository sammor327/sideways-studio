// RiftAtlas live games (2026-09-19, Sam: "For sideways studio, we can use
// this: play.riftatlas.com/game/caster?room=QZGSU"). RiftAtlas is the online
// Riftbound simulator Convergence is played on; its casting studio is a page
// for accounts with the caster role that shows the whole game, hands
// included. riftatlas.js keeps a copy of that page open and hands every
// realtime frame the PAGE receives to this module. Nothing here talks to
// RiftAtlas; it is pure so the tests can replay recorded frames.
//
// The protocol, as the page itself reads it (undocumented, read from its
// client and verified against recorded games):
//
// - Each game of a series has its own room code; a room's shell doc names
//   the previous and next room, the series wins, the match format and the
//   players' public details. The page walks that chain to the live game on
//   its own, so frames from several rooms arrive in order.
// - In the live room, `authoritative_snapshot` carries the whole game
//   (`snapshot`), its log (`gameplayLog`) and the chess clock, and every
//   action after it is an `authoritative_patch_commit` whose `patch` is a
//   list of small operations against that snapshot. Each commit names the
//   sequence it builds on; a gap means the page resyncs, and it gets a new
//   snapshot, which this module simply takes.
// - Viewers flagged as a broadcast view get hands in the clear and each
//   deck as remaining counts (`broadcastDecksByPlayerId`); the deck itself
//   stays face down.

export const CASTER_URL = 'https://play.riftatlas.com/game/caster';
export const REALTIME_HOST = 'realtime.riftatlas-workers.com';

// "qzgsu", "QZGSU" or a caster link (?room=QZGSU): the room code, or ''.
// The page's own picker keeps up to 10 letters and digits.
export function parseRoomCode(input) {
  let s = String(input || '').trim();
  const m = s.match(/[?&]room=([^&#\s]+)/i);
  if (m) s = decodeURIComponent(m[1]);
  s = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length >= 3 && s.length <= 10 ? s : '';
}

export const casterUrl = (room) => `${CASTER_URL}?room=${encodeURIComponent(room)}`;

// The room a realtime socket belongs to: /parties/match/<ROOM>?...
export function socketRoom(url) {
  const m = String(url || '').match(/\/parties\/match\/([A-Za-z0-9]+)/);
  return m ? m[1].toUpperCase() : '';
}

export function createFeed() {
  return {
    shells: new Map(), // room code -> the room's shell doc
    shellOrder: [], // room codes in the order their shells arrived
    game: null, // { room, sequence, state, log, actionClock, clockAt }
    stale: false, // a patch could not be applied; waiting for a snapshot
    version: 0, // bumped on every change the view can see
    lastFrameAt: 0,
  };
}

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

// One frame the page received on a match socket. `room` is the socket's
// room; `now` stamps the chess clock. Returns true when the view changed.
export function ingestFrame(feed, data, { room = '', now = Date.now() } = {}) {
  let msg;
  try { msg = typeof data === 'string' ? JSON.parse(data) : data; } catch { return false; }
  if (!msg || typeof msg !== 'object') return false;
  feed.lastFrameAt = now;
  const id = String(msg.gameInstanceId || room || '').toUpperCase();

  switch (msg.type) {
    case 'room_shell_sync': {
      if (!id || !msg.sessionDoc) return false;
      feed.shells.set(id, msg.sessionDoc);
      feed.shellOrder = [...feed.shellOrder.filter((r) => r !== id), id];
      feed.version += 1;
      return true;
    }
    case 'authoritative_snapshot': {
      if (!id || !msg.snapshot) return false;
      feed.game = {
        room: id,
        sequence: Number(msg.sequence) || 0,
        state: clone(msg.snapshot),
        log: Array.isArray(msg.gameplayLog) ? clone(msg.gameplayLog) : [],
        actionClock: msg.actionClock ? clone(msg.actionClock) : null,
        clockAt: now,
      };
      feed.stale = false;
      feed.version += 1;
      return true;
    }
    case 'authoritative_patch_commit': {
      const g = feed.game;
      if (!g || g.room !== id) return false;
      const seq = Number(msg.sequence);
      if (seq <= g.sequence) return false; // already applied
      if (Number(msg.baseSequence) !== g.sequence || seq !== g.sequence + 1) {
        // A gap: the page notices the same one and asks for a fresh
        // snapshot; until it lands the view keeps the last good state.
        feed.stale = true;
        return false;
      }
      const next = { state: clone(g.state), log: g.log.slice(), actionClock: g.actionClock };
      try {
        applyOperations(next, (msg.patch && msg.patch.operations) || []);
      } catch {
        feed.stale = true;
        return false;
      }
      g.state = next.state;
      g.log = next.log;
      g.sequence = seq;
      if (msg.actionClock) { g.actionClock = clone(msg.actionClock); g.clockAt = now; } else if (next.actionClock !== g.actionClock) {
        g.actionClock = next.actionClock;
        g.clockAt = now;
      }
      feed.stale = false;
      feed.version += 1;
      return true;
    }
    case 'authoritative_resume_ack': {
      // The page picked up where it left off: nothing missed if the
      // sequence matches, a resync on its way if not.
      const g = feed.game;
      if (g && g.room === id && Number(msg.sequence) !== g.sequence) feed.stale = true;
      return false;
    }
    default:
      return false;
  }
}

// The page's patch operations, applied to our own copy. Every operation the
// client knows is here; an unknown one throws, which marks the feed stale
// until the next snapshot rather than guessing.
export function applyOperations(target, ops) {
  const room = target.state;
  const playerOf = (id) => {
    const p = (room.players || []).find((x) => x.id === id);
    if (!p) throw new Error(`unknown player ${id}`);
    return p;
  };
  const boardOf = (id) => {
    const p = playerOf(id);
    if (!p.board) throw new Error(`no board for ${id}`);
    return p.board;
  };
  const zoneOf = (board, zone) => {
    if (!Array.isArray(board[zone])) board[zone] = [];
    return board[zone];
  };
  const take = (zone, cardId) => {
    const i = zone.findIndex((c) => c.id === cardId);
    if (i < 0) throw new Error(`missing card ${cardId}`);
    return zone.splice(i, 1)[0];
  };
  const put = (zone, index, cards) => {
    if (!(index >= 0 && index <= zone.length)) throw new Error(`bad index ${index}`);
    zone.splice(index, 0, ...cards);
  };
  const find = (zone, cardId) => {
    const c = zone.find((x) => x.id === cardId);
    if (!c) throw new Error(`missing card ${cardId}`);
    return c;
  };

  for (const op of ops) {
    switch (op.op) {
      case 'set_room_fields': for (const [k, v] of Object.entries(op.fields || {})) room[k] = clone(v); break;
      case 'unset_room_fields': for (const k of op.fields || []) delete room[k]; break;
      case 'chain_insert': put(zoneOf(room, 'chainEntries'), op.index, clone(op.entries || [])); break;
      case 'chain_remove': {
        const gone = new Set(op.entryIds || []);
        room.chainEntries = (room.chainEntries || []).filter((e) => !gone.has(e.id));
        break;
      }
      case 'chain_replace': room.chainEntries = clone(op.entries || []); break;
      case 'set_session_fields': target.session = { ...(target.session || {}), ...clone(op.fields || {}) }; break;
      case 'unset_session_fields': for (const k of op.fields || []) if (target.session) delete target.session[k]; break;
      case 'set_player_fields': { const p = playerOf(op.playerId); for (const [k, v] of Object.entries(op.fields || {})) p[k] = clone(v); break; }
      case 'unset_player_fields': { const p = playerOf(op.playerId); for (const k of op.fields || []) delete p[k]; break; }
      case 'set_board_fields': { const b = boardOf(op.playerId); for (const [k, v] of Object.entries(op.fields || {})) b[k] = clone(v); break; }
      case 'unset_board_fields': { const b = boardOf(op.playerId); for (const k of op.fields || []) delete b[k]; break; }
      case 'zone_insert': put(zoneOf(boardOf(op.playerId), op.zone), op.index, clone(op.cards || [])); break;
      case 'zone_remove': { const z = zoneOf(boardOf(op.playerId), op.zone); for (const id of op.cardIds || []) take(z, id); break; }
      case 'zone_move': {
        const moved = take(zoneOf(boardOf(op.from.playerId), op.from.zone), op.cardId);
        // A move can carry the card's new face (a hidden card revealed).
        put(zoneOf(boardOf(op.to.playerId), op.to.zone), op.to.index, [op.card ? clone(op.card) : moved]);
        break;
      }
      case 'zone_reorder': {
        const b = boardOf(op.playerId);
        const z = zoneOf(b, op.zone);
        const ids = op.cardIds || [];
        if (z.length !== ids.length) throw new Error('reorder count mismatch');
        const byId = new Map(z.map((c) => [c.id, c]));
        b[op.zone] = ids.map((id) => {
          const c = byId.get(id);
          if (!c) throw new Error(`reorder missing ${id}`);
          byId.delete(id);
          return c;
        });
        break;
      }
      case 'zone_replace': boardOf(op.playerId)[op.zone] = clone(op.cards || []); break;
      case 'patch_card_fields': { const c = find(zoneOf(boardOf(op.playerId), op.zone), op.cardId); for (const [k, v] of Object.entries(op.fields || {})) c[k] = clone(v); break; }
      case 'unset_card_fields': { const c = find(zoneOf(boardOf(op.playerId), op.zone), op.cardId); for (const k of op.fields || []) delete c[k]; break; }
      case 'log_insert': put(target.log, op.index, clone(op.entries || [])); break;
      case 'log_remove': { const gone = new Set(op.entryIds || []); target.log = target.log.filter((e) => !gone.has(e.id)); break; }
      case 'log_replace': target.log = clone(op.entries || []); break;
      case 'set_action_clock': target.actionClock = clone(op.actionClock); break;
      case 'clear_action_clock': target.actionClock = null; break;
      default: throw new Error(`unknown operation ${op.op}`);
    }
  }
}

// ---- The view: what the panel shows and the patches are built from --------

const isCard = (c) => c && typeof c === 'object' && !c.isPlaceholder && c.name;
const cardOf = (c) => ({ name: String(c.name), code: String(c.cardCode || ''), type: String(c.type || ''), keywords: Array.isArray(c.keywords) ? c.keywords.slice(0, 6) : [] });
const FORMAT_LENGTH = { bo1: 1, bo3: 3, bo5: 5 };
const BOARD_ZONES = ['base', 'battlefieldA', 'battlefieldB', 'battlefieldC', 'champion', 'hand', 'trash', 'banished', 'legend'];

// The room the page is on now: the newest shell with no next room (the head
// of the series chain), else the newest shell, else the snapshot's room.
export function currentRoom(feed) {
  for (let i = feed.shellOrder.length - 1; i >= 0; i -= 1) {
    const r = feed.shellOrder[i];
    if (!feed.shells.get(r).nextRoomCode) return r;
  }
  return feed.shellOrder[feed.shellOrder.length - 1] || (feed.game ? feed.game.room : '');
}

// Everything the panel and the patches need, from the live game when the
// page is in it and from the shell alone before it starts (mulligans,
// sideboarding). null until the first frame of a room arrives.
export function gameView(feed, { now = Date.now() } = {}) {
  const room = currentRoom(feed);
  if (!room) return null;
  const shell = feed.shells.get(room) || null;
  const g = feed.game && feed.game.room === room ? feed.game : null;
  const st = g ? g.state : null;
  const wins = (shell && shell.winsByPlayerId) || {};
  const used = (shell && shell.usedBattlefieldsByPlayerId) || {};
  const format = String((shell && shell.matchFormat) || (st && st.matchFormat) || '').toLowerCase();

  const publicPlayers = (shell && Array.isArray(shell.publicPlayers)) ? shell.publicPlayers : [];
  const source = st && Array.isArray(st.players) && st.players.length ? st.players : publicPlayers;
  const players = source
    .map((p) => {
      const pub = publicPlayers.find((x) => x.id === p.id) || {};
      const b = p.board || null;
      const all = b ? BOARD_ZONES.flatMap((z) => (Array.isArray(b[z]) ? b[z] : [])) : [];
      const legendCard = b && Array.isArray(b.legend) ? b.legend.find(isCard) : null;
      // The chosen champion starts in the champion zone and keeps its source
      // wherever it goes after that.
      const champ = all.find((c) => isCard(c) && c.source === 'champion');
      const deck = st && st.broadcastDecksByPlayerId ? st.broadcastDecksByPlayerId[p.id] : null;
      const runes = b ? [...(b.runeArea || []), ...(b.runeDeck || [])] : [];
      const selected = String(p.selectedBattlefield || pub.selectedBattlefield || '');
      return {
        id: String(p.id),
        name: String(p.name || pub.name || ''),
        seat: Number.isFinite(p.seat) ? p.seat : (Number.isFinite(pub.seat) ? pub.seat : 0),
        wins: Math.max(0, Math.trunc(Number(wins[p.id]) || 0)),
        score: b ? Math.max(0, Math.trunc(Number(b.score) || 0)) : 0,
        legend: legendCard ? cardOf(legendCard) : null,
        champion: champ ? cardOf(champ) : null,
        battlefield: selected,
        usedBattlefields: Array.isArray(used[p.id]) ? used[p.id].map(String) : [],
        hand: b && Array.isArray(b.hand) ? b.hand.filter(isCard).map(cardOf) : [],
        handCount: b && Array.isArray(b.hand) ? b.hand.length : 0,
        trash: b && Array.isArray(b.trash) ? b.trash.filter(isCard).map(cardOf) : [],
        banished: b && Array.isArray(b.banished) ? b.banished.filter(isCard).map(cardOf) : [],
        deck: deck ? {
          left: Math.max(0, Math.trunc(Number(deck.total) || 0)),
          total: Math.max(0, Math.trunc(Number(deck.startingTotal) || 0)),
          cards: (Array.isArray(deck.cards) ? deck.cards : []).filter((e) => e && e.card && e.card.name).map((e) => ({
            ...cardOf(e.card), left: Math.max(0, Math.trunc(Number(e.count) || 0)), start: Math.max(0, Math.trunc(Number(e.startingCount) || 0)),
          })),
        } : null,
        runes: runes.filter(isCard).map((c) => String(c.name)),
        clockMs: clockFor(g, p.id, now),
      };
    })
    .sort((a, b) => a.seat - b.seat);

  const chain = st && Array.isArray(st.chainEntries) ? st.chainEntries.filter((e) => e && isCard(e.card)).map((e) => ({
    id: String(e.id), playerId: String(e.byPlayerId || e.card.ownerPlayerId || ''), ...cardOf(e.card),
  })) : [];

  // Settled: the page has reached the newest room of the series and, if a
  // game is on there, has its snapshot. Until then the view is a room the
  // page is passing through on the way (connecting mid-series walks game 1,
  // game 2, ...), and writing it would flash old points and empty hands.
  const settled = Boolean(shell) && !shell.nextRoomCode && (Boolean(g) || shell.phase !== 'in_game');

  return {
    room,
    settled,
    seriesId: String((shell && shell.seriesId) || ''),
    gameNumber: Math.max(1, Math.trunc(Number(shell && shell.gameNumber) || 1)),
    format,
    seriesLength: FORMAT_LENGTH[format] || 0,
    phase: String((st && st.phase) || (shell && shell.phase) || ''),
    live: Boolean(g),
    stale: feed.stale,
    turn: st ? Math.max(0, Math.trunc(Number(st.turnNumber) || 0)) : 0,
    activePlayerId: st ? String(st.activeTurnPlayerId || '') : '',
    firstPlayerId: st ? String(st.firstPlayerId || '') : '',
    players,
    chain,
    events: g ? cardEvents(g.log, players) : [],
  };
}

// Each player's chess clock, counting the running stretch for whoever it is
// running for. null when the room has no clock.
function clockFor(g, playerId, now) {
  const c = g && g.actionClock;
  if (!c || !c.totals || !Number.isFinite(c.totals[playerId])) return null;
  let ms = c.totals[playerId];
  const running = Array.isArray(c.activeTargets) && c.activeTargets.some((t) => t && t.playerId === playerId);
  if (running && Number.isFinite(c.runningSince) && Number.isFinite(c.serverNow)) {
    ms += Math.max(0, c.serverNow - c.runningSince) + Math.max(0, now - g.clockAt);
  }
  return Math.round(ms);
}

// The log's card events (what the casting studio's timeline lists), newest
// first: played, moved, revealed, trashed, chain_resolved.
export function cardEvents(log, players = [], limit = 40) {
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const out = [];
  for (const entry of log || []) {
    const events = Array.isArray(entry && entry.broadcastCardEvents) ? entry.broadcastCardEvents : [];
    events.forEach((e, i) => {
      if (!e || !e.card || !e.card.name) return;
      const playerId = String(entry.authorPlayerId || '');
      out.push({
        id: `${entry.id}:${i}`,
        at: Number(entry.at) || 0,
        kind: String(e.kind || ''),
        from: String(e.fromZone || ''),
        to: String(e.toZone || ''),
        playerId,
        playerName: nameOf.get(playerId) || String(entry.byPlayerName || ''),
        turn: Math.max(0, Math.trunc(Number(entry.turnNumber) || 0)),
        ...cardOf(e.card),
      });
    });
  }
  // The log is newest first already; a stable sort keeps same-moment events
  // in the log's own order.
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ---- Into Sideways Studio ---------------------------------------------------

export const normName = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

// Card codes RiftAtlas prints (OGN-160, UNL-060A for an alternate art,
// VEN-R04A for a rune printing) against the card index's ids (UNL-060,
// SFD-143a): the exact id, then case-blind, then the base number without its
// printing letter, then the name.
export function makeCardResolver(cards) {
  const byId = new Map();
  const byLower = new Map();
  const byBase = new Map();
  const byName = new Map();
  const base = (id) => String(id).toUpperCase().replace(/^([A-Z0-9]+-[A-Z]?\d+)[A-Z*]*$/, '$1');
  for (const c of cards || []) {
    if (!c || !c.cardId) continue;
    byId.set(c.cardId, c);
    if (!byLower.has(c.cardId.toLowerCase())) byLower.set(c.cardId.toLowerCase(), c);
    const b = base(c.cardId);
    // The plain printing wins the base slot over its alternate arts.
    if (!byBase.has(b) || c.cardId.toUpperCase() === b) byBase.set(b, c);
    const n = normName(c.cardName);
    if (n && !byName.has(n)) byName.set(n, c);
  }
  return ({ code = '', name = '' } = {}) => {
    const hit = (code && (byId.get(code) || byLower.get(code.toLowerCase()) || byBase.get(base(code))))
      || (name && byName.get(normName(name)));
    // A code match whose name disagrees is a different card on RiftAtlas's
    // side (reprints keep names); trust the name then.
    if (hit && name && normName(hit.cardName) !== normName(name)) return byName.get(normName(name)) || null;
    return hit || null;
  };
}

// Which RiftAtlas seat goes on which Sideways Studio side. Seat order
// (seat 0 on the left) unless the names already in Match data say the
// reverse; `swap` flips whatever that decided.
export function orientation(view, bank, swap = false) {
  const [a, b] = view.players;
  const sim = (x, y) => {
    const p = normName(x); const q = normName(y);
    if (!p || !q) return 0;
    if (p === q) return 3;
    return p.includes(q) || q.includes(p) ? 2 : 0;
  };
  const L = bank.match.left.name; const R = bank.match.right.name;
  const straight = sim(a && a.name, L) + sim(b && b.name, R);
  const crossed = sim(a && a.name, R) + sim(b && b.name, L);
  const auto = crossed > straight;
  return auto !== Boolean(swap) ? [b, a] : [a, b];
}

// A Match data side from one RiftAtlas player. The live fields only: what
// the game itself says right now. Names are not in it (see identityPatch).
function liveSide(p, cur, resolveCard, legendOf) {
  const out = {
    score: Math.min(8, p.score),
    gameWins: Math.min(3, p.wins),
    handCount: Math.min(20, p.handCount),
    // Cost and domains ride along, the way a card picked in the panel's
    // search does, so the hand overlays draw them.
    hand: p.hand.slice(0, 20).map((c) => {
      const hit = resolveCard(c);
      return hit ? { cardId: hit.cardId, cardName: hit.cardName, energy: hit.energy ?? null, domains: hit.domains || [] } : { cardId: '', cardName: c.name };
    }),
  };
  if (p.legend) {
    const L = legendOf(p.legend);
    Object.assign(out, { legend: L.legend, legendSlug: L.legendSlug, legendCardId: L.legendCardId });
  }
  if (p.champion) out.champion = p.champion.name.slice(0, 40);
  if (p.battlefield) {
    const hit = resolveCard({ name: p.battlefield });
    out.battlefield = p.battlefield.slice(0, 40);
    out.battlefieldCardId = hit ? hit.cardId : '';
    // The pool: what Match data holds already (a decklist brings all three)
    // with the ones RiftAtlas has seen played marked, topped up with any it
    // has seen that the pool lacks, up to the three a player brings.
    const seen = [...new Set([...p.usedBattlefields, p.battlefield].filter(Boolean))];
    const playedNames = new Set(seen.map(normName));
    const pool = (Array.isArray(cur.battlefields) ? cur.battlefields : [])
      .map((e) => ({ ...e, played: e.played || playedNames.has(normName(e.name)) }));
    for (const name of seen) {
      if (pool.length >= 3) break;
      if (pool.some((e) => normName(e.name) === normName(name))) continue;
      const bf = resolveCard({ name });
      pool.push({ name: name.slice(0, 40), cardId: bf ? bf.cardId : '', played: true });
    }
    out.battlefields = pool;
  }
  return out;
}

// The live patch for both sides, the series length and, while a game is on,
// the turn counter and whose turn it is. `bank` is the preview bank, for
// orientation and the battlefield pool.
export function livePatch(view, bank, { swap = false, resolveCard, legendOf }) {
  const [l, r] = orientation(view, bank, swap);
  const match = {};
  if (l) match.left = liveSide(l, bank.match.left, resolveCard, legendOf);
  if (r) match.right = liveSide(r, bank.match.right, resolveCard, legendOf);
  if (view.seriesLength) match.seriesLength = view.seriesLength;
  if (view.live) {
    match.turn = Math.min(99, view.turn);
    match.activeSide = view.activePlayerId && l && view.activePlayerId === l.id ? 'left'
      : (view.activePlayerId && r && view.activePlayerId === r.id ? 'right' : '');
  }
  return { patch: { match }, sides: [l || null, r || null] };
}

// Names, legends and a decklist into preview, for a match nobody loaded from
// TopDeck: the operator presses Load players. A side whose name changes
// drops the previous player's typed extras, the way a new TopDeck pairing
// does.
export const SIDE_EXTRAS_CLEARED = {
  record: '', seed: '', country: '', pronouns: '', archetype: '', team: '', store: '',
  seasonRecord: '', bestFinish: '', finishes: '', deckName: '', deckList: '',
};
export function identityPatch(view, bank, { swap = false, resolveCard, legendOf }) {
  const [l, r] = orientation(view, bank, swap);
  const side = (p, cur) => {
    if (!p) return {};
    const renamed = normName(cur.name) !== normName(p.name);
    const out = renamed ? { ...SIDE_EXTRAS_CLEARED, battlefields: [], card: { cardId: '', cardName: '' } } : {};
    out.name = p.name.slice(0, 40);
    const deckList = deckText(p);
    if (deckList && (renamed || !cur.deckList)) {
      out.deckList = deckList;
      out.deckName = p.legend ? p.legend.name.split(',')[0].slice(0, 60) : '';
    }
    return Object.assign(out, liveSide(p, renamed ? { battlefields: [] } : cur, resolveCard, legendOf));
  };
  const match = { left: side(l, bank.match.left), right: side(r, bank.match.right) };
  if (view.seriesLength) match.seriesLength = view.seriesLength;
  return { patch: { match }, names: [l ? l.name : '', r ? r.name : ''] };
}

// The player's list as RiftAtlas holds it, in the decklist paste format:
// legend, champion, the battlefields seen so far, runes and the main deck as
// it started this game. Empty until the game has a deck to read.
export function deckText(p) {
  if (!p.deck || !p.deck.cards.length) return '';
  const lines = [];
  if (p.legend) lines.push(`Legend: ${p.legend.name}`);
  if (p.champion) lines.push(`Champion: ${p.champion.name}`);
  const bfs = [...new Set([...p.usedBattlefields, p.battlefield].filter(Boolean))];
  if (bfs.length) lines.push('', 'Battlefields:', ...bfs);
  // The rune deck stays face down even to a broadcast view, so the split is
  // only known once all twelve runes are out; a partial split would be wrong.
  if (p.runes.length === 12) {
    const runeCounts = new Map();
    for (const name of p.runes) {
      const domain = name.replace(/\s+Rune$/i, '');
      runeCounts.set(domain, (runeCounts.get(domain) || 0) + 1);
    }
    lines.push('', 'Runes:', ...[...runeCounts].map(([d, n]) => `${n} ${d}`));
  }
  lines.push('', 'Main:', ...p.deck.cards.filter((c) => c.start > 0).map((c) => `${c.start} ${c.name}`));
  return lines.join('\n').trim();
}
