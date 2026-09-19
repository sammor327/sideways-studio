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
    decks: new Map(), // series|player -> the earliest starting deck seen (noteDecks)
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
        showdown: null,
      };
      feed.game.showdown = showdownFromState(feed.game.state);
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
      trackShowdown(g, (msg.patch && msg.patch.operations) || []);
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

// ---- Showdowns ---------------------------------------------------------------
//
// RiftAtlas runs a showdown as the room's `pendingBattlefieldConquerAssist`:
// {zone, attackerPlayerId, defenderPlayerId, stage, turnNumber}, set when a
// unit moves to a battlefield its player does not hold and cleared once the
// conquer (or the fight) is settled. stage says who has focus:
// attacker_focus, defender_response, then attacker_confirm_conquer. Cards
// played into it go on the chain (chainEntries, each by a player) and
// resolve off it again within seconds, so the cards of a showdown are
// collected here as they arrive; the chain alone would lose them. A reaction
// unit can also be played from hand straight to the contested battlefield,
// which counts as played too. A showdown is over when its conquer is settled
// and the chain is empty.

const isCard = (c) => c && typeof c === 'object' && !c.isPlaceholder && c.name;
const cardOf = (c) => ({ name: String(c.name), code: String(c.cardCode || ''), type: String(c.type || ''), keywords: Array.isArray(c.keywords) ? c.keywords.slice(0, 6) : [] });

const showdownKey = (p) => (p ? `${p.zone}|${p.turnNumber}|${p.attackerPlayerId}` : '');

function openShowdown(p) {
  return {
    key: showdownKey(p),
    zone: String(p.zone || ''),
    attackerId: String(p.attackerPlayerId || ''),
    defenderId: String(p.defenderPlayerId || ''),
    stage: String(p.stage || ''),
    plays: [],
    ended: false,
  };
}

function addPlay(sd, id, playerId, card, from) {
  if (!isCard(card) || sd.plays.some((x) => x.id === String(id))) return;
  sd.plays.push({ id: String(id), playerId: String(playerId || card.ownerPlayerId || ''), from: String(from || ''), ...cardOf(card) });
}

// A snapshot taken mid-showdown: the cards still on the chain are all that
// can be known of it.
function showdownFromState(state) {
  const p = state && state.pendingBattlefieldConquerAssist;
  if (!p) return null;
  const sd = openShowdown(p);
  for (const e of state.chainEntries || []) if (e) addPlay(sd, e.id, e.byPlayerId, e.card, e.fromZone);
  return sd;
}

// After each applied patch: a new showdown opens, the cards played into the
// open one are collected, and it closes once settled with the chain empty.
function trackShowdown(g, ops) {
  const st = g.state;
  const p = st.pendingBattlefieldConquerAssist || null;
  if (p && (!g.showdown || g.showdown.ended || g.showdown.key !== showdownKey(p))) g.showdown = openShowdown(p);
  const sd = g.showdown;
  if (!sd || sd.ended) return;
  if (p) sd.stage = String(p.stage || '');
  for (const op of ops) {
    if (op.op === 'chain_insert') {
      for (const e of op.entries || []) if (e) addPlay(sd, e.id, e.byPlayerId, e.card, e.fromZone);
    } else if (op.op === 'zone_move' && op.from && op.from.zone === 'hand' && op.to && op.to.zone === sd.zone) {
      const owner = (st.players || []).find((x) => x.id === op.to.playerId);
      const zone = owner && owner.board && Array.isArray(owner.board[sd.zone]) ? owner.board[sd.zone] : [];
      addPlay(sd, op.cardId, op.to.playerId, zone.find((c) => c.id === op.cardId), 'hand');
    }
  }
  if (!p && !(st.chainEntries || []).length) sd.ended = true;
}

// One unit's might the way the casting studio counts it: the might counter
// when the card carries one, else the card's printed might (RiftAtlas's own
// when it sends one, else the card index's), plus any temporary buff. null
// when it cannot be known.
export function unitMight(c, resolveCard) {
  let base = Number.isFinite(c.whiteCounter) ? Math.trunc(c.whiteCounter) : null;
  if (base === null && Number.isFinite(c.might)) base = c.might;
  if (base === null && resolveCard && isCard(c)) {
    const hit = resolveCard(cardOf(c));
    if (hit && Number.isFinite(hit.might)) base = hit.might;
  }
  if (base === null) return null;
  const buff = Number.isFinite(c.temporaryMightBuff) ? Math.max(0, Math.trunc(c.temporaryMightBuff)) : 0;
  return Math.max(0, base + buff);
}

// Each player's might at a battlefield: their units there, equipment that
// hangs off a unit left out, face-down cards counted as unknown.
function mightAt(state, zone, resolveCard) {
  const might = {};
  const unknown = {};
  for (const p of state.players || []) {
    let total = 0;
    let missing = 0;
    for (const c of (p.board && Array.isArray(p.board[zone]) ? p.board[zone] : [])) {
      if (!c || c.attachedToCardId) continue;
      if (!isCard(c)) { missing += 1; continue; }
      if (!/unit/i.test(String(c.type || ''))) continue;
      const m = unitMight(c, resolveCard);
      if (m === null) missing += 1; else total += m;
    }
    might[p.id] = total;
    unknown[p.id] = missing;
  }
  return { might, unknown };
}

// The open showdown as the view carries it; null when none is open.
function showdownView(g, players, resolveCard) {
  const sd = g && g.showdown;
  if (!sd || sd.ended) return null;
  const onChain = new Set((g.state.chainEntries || []).map((e) => String(e && e.id)));
  // Battlefield A is seat 0's pick, B seat 1's.
  const owner = players.find((p) => p.seat === ({ battlefieldA: 0, battlefieldB: 1 })[sd.zone]);
  const { might, unknown } = mightAt(g.state, sd.zone, resolveCard);
  return {
    key: sd.key,
    zone: sd.zone,
    battlefield: owner ? owner.battlefield : '',
    attackerId: sd.attackerId,
    defenderId: sd.defenderId,
    stage: sd.stage,
    priorityId: sd.stage === 'defender_response' ? sd.defenderId : (sd.stage ? sd.attackerId : ''),
    plays: sd.plays.map((x) => ({ ...x, onChain: onChain.has(x.id) })),
    defenderPlayed: sd.plays.some((x) => x.playerId === sd.defenderId),
    might,
    unknown,
  };
}

// ---- The view: what the panel shows and the patches are built from --------

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
export function gameView(feed, { now = Date.now(), resolveCard = null } = {}) {
  const room = currentRoom(feed);
  if (!room) return null;
  const shell = feed.shells.get(room) || null;
  const g = feed.game && feed.game.room === room ? feed.game : null;
  const st = g ? g.state : null;
  const wins = (shell && shell.winsByPlayerId) || {};
  const used = (shell && shell.usedBattlefieldsByPlayerId) || {};
  const format = String((shell && shell.matchFormat) || (st && st.matchFormat) || '').toLowerCase();

  const winners = seriesWinners(feed, room);
  const gameNo = Math.max(1, Math.trunc(Number(shell && shell.gameNumber) || 1));
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
        // Each battlefield this player has played this series, by game, with
        // whether they won that game once it is decided.
        battlefieldGames: fieldGames(used[p.id], selected, gameNo, winners, String(p.id)),
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
    // The series' decided games: game number -> the winner's player id.
    results: winners,
    phase: String((st && st.phase) || (shell && shell.phase) || ''),
    live: Boolean(g),
    stale: feed.stale,
    turn: st ? Math.max(0, Math.trunc(Number(st.turnNumber) || 0)) : 0,
    activePlayerId: st ? String(st.activeTurnPlayerId || '') : '',
    firstPlayerId: st ? String(st.firstPlayerId || '') : '',
    players,
    chain,
    showdown: g ? showdownView(g, players, resolveCard) : null,
    events: g ? cardEvents(g.log, players) : [],
  };
}

// Who won each decided game of the series a room belongs to, by game number:
// { 1: playerId, 2: playerId }. The players report each result on the
// game's own room (pendingGameResult.winnerByReporterPlayerId, each naming
// the winner), and that room's series wins then count the game. A game the
// two report differently is left out, as is one with no report whose winner
// the series wins do not show (one player's wins one up on the game
// before's room). The page walks every room of the series on its way to the
// live one, so the earlier games' rooms are there.
export function seriesWinners(feed, room) {
  const head = feed.shells.get(room);
  if (!head) return {};
  const series = head.seriesId || '';
  const byGame = new Map();
  for (const s of feed.shells.values()) {
    if (!s || (s.seriesId || '') !== series) continue;
    const n = Math.trunc(Number(s.gameNumber)) || 0;
    if (n > 0) byGame.set(n, s);
  }
  const winsOf = (s) => {
    const w = (s && s.winsByPlayerId) || {};
    return Object.fromEntries(Object.entries(w).map(([id, n]) => [id, Math.max(0, Math.trunc(Number(n)) || 0)]));
  };
  const out = {};
  for (const [n, s] of byGame) {
    const wins = winsOf(s);
    // Decided: the game's room counts it in the series wins.
    if (Object.values(wins).reduce((t, x) => t + x, 0) < n) continue;
    const reports = s.pendingGameResult && s.pendingGameResult.winnerByReporterPlayerId;
    const named = reports && typeof reports === 'object' ? [...new Set(Object.values(reports).filter(Boolean).map(String))] : [];
    if (named.length === 1 && Object.hasOwn(wins, named[0])) { out[n] = named[0]; continue; }
    if (named.length) continue;
    const before = n === 1 ? {} : (byGame.has(n - 1) ? winsOf(byGame.get(n - 1)) : null);
    if (!before) continue;
    const up = Object.keys(wins).filter((id) => wins[id] === (before[id] || 0) + 1);
    if (up.length === 1) out[n] = up[0];
  }
  return out;
}

// A player's battlefields by game: the ones the series lists as used, in the
// order they were played (game 1 first), then the one picked for the game in
// view. result is 'won' or 'lost' once that game is decided, else ''; now
// marks the game in view.
function fieldGames(usedList, selected, gameNo, winners, playerId) {
  const out = (Array.isArray(usedList) ? usedList : []).map((name, i) => ({ name: String(name), game: i + 1 }));
  if (selected && !out.some((g) => g.game === gameNo || normName(g.name) === normName(selected))) out.push({ name: selected, game: gameNo });
  return out.map((g) => ({
    ...g,
    result: winners[g.game] ? (winners[g.game] === playerId ? 'won' : 'lost') : '',
    now: g.game === gameNo,
  }));
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

// Whether a side already holds a pasted decklist. A list the operator has
// (pasted, or loaded from TopDeck) outranks RiftAtlas for everything a list
// says: the legend, the champion and the three battlefields (Sam,
// 2026-09-19). RiftAtlas still says which battlefield is in play.
const hasDeck = (side) => Boolean(side && typeof side.deckList === 'string' && side.deckList.trim());

// A Match data side from one RiftAtlas player. The live fields only: what
// the game itself says right now. Names are not in it (see identityPatch).
function liveSide(p, cur, resolveCard, legendOf) {
  const deck = hasDeck(cur);
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
  // With a list in Match data the legend and champion are the list's; an
  // empty field is still filled.
  if (p.legend && !(deck && cur.legend)) {
    const L = legendOf(p.legend);
    Object.assign(out, { legend: L.legend, legendSlug: L.legendSlug, legendCardId: L.legendCardId });
  }
  if (p.champion && !(deck && cur.champion)) out.champion = p.champion.name.slice(0, 40);
  if (p.battlefield) {
    const hit = resolveCard({ name: p.battlefield });
    out.battlefield = p.battlefield.slice(0, 40);
    out.battlefieldCardId = hit ? hit.cardId : '';
    // The pool: what Match data holds already (a decklist brings all three)
    // with the ones RiftAtlas has seen played marked. With no list it is
    // topped up with any RiftAtlas has seen that it lacks, up to the three a
    // player brings; a list's pool is the list's.
    const seen = [...new Set([...p.usedBattlefields, p.battlefield].filter(Boolean))];
    const playedNames = new Set(seen.map(normName));
    const pool = (Array.isArray(cur.battlefields) ? cur.battlefields : [])
      .map((e) => ({ ...e, played: e.played || playedNames.has(normName(e.name)) }));
    for (const name of deck && pool.length ? [] : seen) {
      if (pool.length >= 3) break;
      if (pool.some((e) => normName(e.name) === normName(name))) continue;
      const bf = resolveCard({ name });
      pool.push({ name: name.slice(0, 40), cardId: bf ? bf.cardId : '', played: true });
    }
    out.battlefields = markResults(pool, p.battlefieldGames || []);
  }
  // Between games no battlefield is in play yet, but the games decided so
  // far still mark the pool Match data holds.
  if (!p.battlefield && Array.isArray(cur.battlefields) && cur.battlefields.length && (p.battlefieldGames || []).some((g) => g.result)) {
    out.battlefields = markResults(cur.battlefields, p.battlefieldGames);
  }
  return out;
}

// The pool with RiftAtlas's word on each battlefield it saw played: a
// decided game's number and whether this player won it (the rows overlay's
// crown or red X). The battlefield of the game in play has no result yet, so
// any it held comes off; an earlier game RiftAtlas has no result for keeps
// what Match data says. Battlefields RiftAtlas never saw are left alone.
function markResults(pool, games) {
  return pool.map((e) => {
    const g = games.find((x) => normName(x.name) === normName(e.name));
    if (!g) return e;
    if (g.result) return { ...e, played: true, game: g.game, result: g.result };
    return g.now ? { ...e, played: true, game: 0, result: '' } : { ...e, played: true };
  });
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

// The open showdown as Match data holds one (match.showdown): where it is,
// who has focus, each side's might there, and every card played into it in
// play order, each marked resolved once it has left the chain. `sides` are
// the RiftAtlas players on the left and right, as livePatch put them.
export function showdownPatch(view, sides, resolveCard) {
  const sd = view.showdown;
  if (!sd) return null;
  const [l, r] = sides;
  const sideOf = (id) => (l && id === l.id ? 'left' : (r && id === r.id ? 'right' : ''));
  const bf = sd.battlefield ? resolveCard({ name: sd.battlefield }) : null;
  const chain = [];
  for (const x of sd.plays.slice(-12)) {
    const side = sideOf(x.playerId);
    if (!side) continue;
    const hit = resolveCard(x);
    chain.push(hit
      ? { cardId: hit.cardId, cardName: hit.cardName, energy: hit.energy ?? null, domains: hit.domains || [], side, resolved: !x.onChain }
      : { cardId: '', cardName: x.name, side, resolved: !x.onChain });
  }
  return {
    active: true,
    battlefield: sd.battlefield.slice(0, 40),
    battlefieldCardId: bf ? bf.cardId : '',
    priority: sideOf(sd.priorityId),
    chain,
    might: { left: l ? (sd.might[l.id] ?? null) : null, right: r ? (sd.might[r.id] ?? null) : null },
  };
}

// Names, legends and a decklist into preview, for a match nobody loaded from
// TopDeck: the operator presses Load players. It only fills what Match data
// lacks (Sam, 2026-09-19): a name already there stays, since TopDeck's
// names outrank RiftAtlas's display names, and so does a pasted list. A
// side still called PLAYER ONE / PLAYER TWO counts as unnamed.
const unnamed = (name) => !String(name || '').trim() || /^player (one|two)$/i.test(String(name).trim());
export function identityPatch(view, bank, { swap = false, resolveCard, legendOf }) {
  const [l, r] = orientation(view, bank, swap);
  const side = (p, cur) => {
    if (!p) return {};
    const out = {};
    if (unnamed(cur.name)) out.name = p.name.slice(0, 40);
    const deckList = deckText(p);
    if (deckList && !hasDeck(cur)) {
      out.deckList = deckList;
      out.deckName = p.legend ? p.legend.name.split(',')[0].slice(0, 60) : '';
    }
    return Object.assign(out, liveSide(p, cur, resolveCard, legendOf));
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

// ---- Sideboard cards (2026-09-19) ---------------------------------------------
//
// Sam: a "sideboard card spotted" graphic "for when a sideboard card is added
// to the hand after turn 1". A broadcast view never says which cards came out
// of a sideboard: every card in a deck reads source "mainDeck", and the
// registered list stays with RiftAtlas. What it does give is each game's
// starting deck (broadcastDecksByPlayerId, a startingCount per card), so a
// card is one the player sided in when this game's deck starts with more
// copies of it than the deck they began the series with: game 1's, when the
// reader saw it (noteDecks), else the main deck of their list in Match data.

// Every starting deck the feed sees, keeping the earliest game of each
// series per player (keyed series|player), so a later game can be held
// against game 1. Called after each frame; nothing to do most of the time.
export function noteDecks(feed) {
  const g = feed.game;
  if (!g || !g.state) return;
  if (!feed.decks) feed.decks = new Map();
  const shell = feed.shells.get(g.room);
  const game = Math.trunc(Number(shell && shell.gameNumber)) || 0;
  const decks = g.state.broadcastDecksByPlayerId;
  if (!game || !decks || typeof decks !== 'object') return;
  const series = String((shell && shell.seriesId) || g.room);
  for (const [id, d] of Object.entries(decks)) {
    const key = `${series}|${id}`;
    const had = feed.decks.get(key);
    if (had && had.game <= game) continue;
    const cards = (d && Array.isArray(d.cards) ? d.cards : [])
      .filter((e) => e && e.card && e.card.name)
      .map((e) => ({ ...cardOf(e.card), start: Math.max(0, Math.trunc(Number(e.startingCount) || 0)) }));
    if (cards.length) feed.decks.set(key, { game, cards });
  }
  // A long day of series: the newest few dozen are plenty.
  while (feed.decks.size > 64) feed.decks.delete(feed.decks.keys().next().value);
}

// What each player sided in for the game in view: { [playerId]: { against,
// extra } }, extra a Map of card key -> copies more than the baseline, and
// against says what that was ('game 1', 'list', 'game 2', or '' for
// nothing to hold it against). The baseline is game 1's deck when the reader
// saw it, else the list in Match data (lists[playerId] = { main, sideboard }
// as parseDecklist reads them; a list with a sideboard only counts the cards
// that sideboard names), else the earliest earlier game the reader saw.
// keyOf(card) gives a RiftAtlas card and a list line the same key (the
// reader passes the card index's name for both). Game 1 has nothing sided
// in, and a deck that differs from its baseline by more than a sideboard
// holds is being held against the wrong list: nothing counts then
// (mismatch).
export const SIDEBOARD_MAX = 10;
export function sidedIn(feed, view, { lists = {}, keyOf = (c) => normName(c.name) } = {}) {
  const out = {};
  if (!view || !view.live || view.gameNumber < 2) return out;
  const shell = feed.shells.get(view.room);
  const series = String((shell && shell.seriesId) || view.room);
  const tally = (entries, count) => {
    const m = new Map();
    for (const c of entries) {
      const k = keyOf(c);
      if (k) m.set(k, (m.get(k) || 0) + count(c));
    }
    return m;
  };
  for (const p of view.players) {
    if (!p.deck || !p.deck.cards.length) continue;
    const seen = feed.decks && feed.decks.get(`${series}|${p.id}`);
    const earlier = seen && seen.game < view.gameNumber ? seen : null;
    const list = lists[p.id] && Array.isArray(lists[p.id].main) && lists[p.id].main.length ? lists[p.id] : null;
    let base = null;
    let board = null;
    let against = '';
    if (earlier && (earlier.game === 1 || !list)) {
      base = tally(earlier.cards, (c) => c.start);
      against = `game ${earlier.game}`;
    } else if (list) {
      base = tally(list.main, (e) => Math.max(0, Math.trunc(Number(e.qty)) || 0));
      if (Array.isArray(list.sideboard) && list.sideboard.length) board = tally(list.sideboard, () => 1);
      against = 'list';
    }
    if (!base) { out[p.id] = { against: '', extra: new Map() }; continue; }
    const now = tally(p.deck.cards, (c) => c.start);
    const extra = new Map();
    for (const [k, n] of now) {
      const more = n - (base.get(k) || 0);
      if (more > 0 && (!board || board.has(k))) extra.set(k, more);
    }
    const total = [...extra.values()].reduce((t, n) => t + n, 0);
    out[p.id] = total > SIDEBOARD_MAX ? { against, extra: new Map(), mismatch: true } : { against, extra };
  }
  return out;
}

// The cards that have just turned up in a hand and are ones the player
// sided in (sided, from sidedIn), after turn `after`: [{ playerId, turn,
// name, code, ... }]. tracker is the caller's own, one per feed ({ room,
// seen, spotted, primed }). The first look at a room only learns what the
// hands hold already, so a reader that joins mid-game spots nothing it did
// not see arrive; a card is spotted once a game for each player.
export function spotSideboardCards(feed, tracker, sided, { keyOf = (c) => normName(c.name), after = 1 } = {}) {
  const g = feed.game;
  if (!g || !g.state) return [];
  if (tracker.room !== g.room) Object.assign(tracker, { room: g.room, seen: new Set(), spotted: new Set(), primed: false });
  const turn = Math.max(0, Math.trunc(Number(g.state.turnNumber) || 0));
  const out = [];
  for (const p of g.state.players || []) {
    const hand = p && p.board && Array.isArray(p.board.hand) ? p.board.hand : [];
    for (const c of hand) {
      if (!isCard(c) || !c.id || tracker.seen.has(c.id)) continue;
      tracker.seen.add(c.id);
      if (!tracker.primed || turn <= after) continue;
      const card = cardOf(c);
      const key = keyOf(card);
      const mine = sided[p.id];
      if (!key || !mine || !mine.extra.get(key)) continue;
      const once = `${p.id}|${key}`;
      if (tracker.spotted.has(once)) continue;
      tracker.spotted.add(once);
      out.push({ playerId: String(p.id), turn, ...card });
    }
  }
  tracker.primed = true;
  return out;
}

// The spot cues for the cards found, on the sides the players feed (sides:
// orientation's [left, right]): the card by the index's id when it
// resolves, and the name Match data prints for that side, or RiftAtlas's
// own while the side is unnamed.
export function spotActions(found, view, sides, match, resolveCard) {
  const [l, r] = sides;
  const out = [];
  for (const s of found) {
    const side = l && s.playerId === l.id ? 'left' : (r && s.playerId === r.id ? 'right' : '');
    if (!side) continue;
    const hit = resolveCard(s);
    const named = match[side].name;
    out.push({
      action: 'spot', side,
      cardId: hit ? hit.cardId : '', cardName: hit ? hit.cardName : s.name,
      player: unnamed(named) ? (side === 'left' ? l : r).name : named,
      game: view.gameNumber, turn: s.turn,
    });
  }
  return out;
}
