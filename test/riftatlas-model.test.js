import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import {
  parseRoomCode, casterUrl, socketRoom, createFeed, ingestFrame, applyOperations, gameView, currentRoom,
  makeCardResolver, orientation, livePatch, identityPatch, deckText, showdownPatch, unitMight,
} from '../server/riftatlas-model.js';
import { buildBank } from '../server/state.js';
import { parseDecklist } from '../web/shared/decklist-format.js';

// One recorded best-of-three (display names replaced): the shells of all
// three rooms, the live room's snapshot, every patch after it, and a second
// snapshot the page took after a reload at the same sequence.
const FRAMES = JSON.parse(readFileSync(new URL('./fixtures/riftatlas-series.json', import.meta.url), 'utf8'));

function replay(frames = FRAMES) {
  const feed = createFeed();
  for (const f of frames) ingestFrame(feed, f.msg, { room: f.room, now: f.at });
  return feed;
}

test('room codes come from a code or a caster link', () => {
  assert.equal(parseRoomCode('qzgsu'), 'QZGSU');
  assert.equal(parseRoomCode(' QZGSU '), 'QZGSU');
  assert.equal(parseRoomCode('https://play.riftatlas.com/game/caster?room=QZGSU'), 'QZGSU');
  assert.equal(parseRoomCode('https://play.riftatlas.com/game/caster?room=nxdzy&output=match'), 'NXDZY');
  assert.equal(parseRoomCode('ab'), '');
  assert.equal(parseRoomCode(''), '');
  assert.equal(casterUrl('QZGSU'), 'https://play.riftatlas.com/game/caster?room=QZGSU');
  assert.equal(socketRoom('wss://realtime.riftatlas-workers.com/parties/match/RHNQ8?_pk=x&roomCode=RHNQ8'), 'RHNQ8');
  assert.equal(socketRoom('wss://realtime.riftatlas-workers.com/parties/account/ABC'), '');
});

test('every recorded patch applies, and the result is RiftAtlas\'s own later snapshot', () => {
  const second = FRAMES.map((f, i) => [f, i]).filter(([f]) => f.msg.type === 'authoritative_snapshot')[1];
  assert.ok(second, 'the fixture ends on a second snapshot');
  const [snap, at] = second;
  const feed = replay(FRAMES.slice(0, at));
  assert.equal(feed.stale, false);
  assert.equal(feed.game.room, snap.msg.gameInstanceId);
  assert.equal(feed.game.sequence, snap.msg.sequence);
  assert.ok(isDeepStrictEqual(feed.game.state, snap.msg.snapshot), 'state matches the snapshot');
  assert.ok(isDeepStrictEqual(feed.game.log, snap.msg.gameplayLog), 'log matches the snapshot');
});

test('a missed patch marks the feed stale until the next snapshot', () => {
  const firstPatch = FRAMES.findIndex((f) => f.msg.type === 'authoritative_patch_commit');
  const gap = FRAMES.filter((_, i) => i !== firstPatch);
  const feed = createFeed();
  let wentStale = false;
  for (const f of gap) {
    ingestFrame(feed, f.msg, { room: f.room, now: f.at });
    if (feed.stale) wentStale = true;
  }
  assert.ok(wentStale);
  // The fixture's last frame is a snapshot: stale clears on it.
  assert.equal(feed.stale, false);
});

test('an unknown operation throws rather than guessing', () => {
  assert.throws(() => applyOperations({ state: { players: [] }, log: [] }, [{ op: 'teleport_card' }]), /unknown operation/);
});

test('the view: the head of the series chain, the live game in it', () => {
  const feed = replay();
  assert.equal(currentRoom(feed), 'NXDZY');
  const v = gameView(feed, { now: FRAMES[FRAMES.length - 1].at });
  assert.equal(v.room, 'NXDZY');
  assert.equal(v.settled, true);
  assert.equal(v.live, true);
  assert.equal(v.gameNumber, 3);
  assert.equal(v.seriesLength, 3);
  assert.deepEqual(v.players.map((p) => p.name), ['Aria Vance', 'Bram Holt']);
  assert.deepEqual(v.players.map((p) => p.wins), [1, 1]);
  const [a, b] = v.players;
  assert.equal(a.legend.name, 'Master Yi, Wuju Bladesman');
  assert.equal(a.legend.code, 'OGS-019');
  assert.equal(b.legend.name, 'Fiora, Grand Duelist');
  assert.equal(a.battlefield, 'Forgotten Monument');
  assert.deepEqual(a.usedBattlefields.slice(0, 2), ['Sigil of the Storm', 'Dragon Roost']);
  for (const p of v.players) {
    assert.equal(p.hand.length, p.handCount, 'a broadcast view sees every card in hand');
    assert.ok(p.deck.total === 39 && p.deck.left <= 39);
    assert.equal(p.deck.cards.reduce((t, c) => t + c.left, 0), p.deck.left, 'the counts add up to what is left');
  }
  assert.ok(v.turn > 0);
  assert.ok(v.players.some((p) => p.id === v.activePlayerId));
  assert.ok(v.events.length > 0);
  assert.ok(v.events.every((e, i, all) => i === 0 || all[i - 1].at >= e.at), 'newest first');
});

test('not settled while the page is still walking the chain', () => {
  // Only the first room's shell: it names a next room, so the page is not
  // there yet and nothing should be written.
  const first = FRAMES.find((f) => f.msg.type === 'room_shell_sync');
  const feed = createFeed();
  ingestFrame(feed, first.msg, { room: first.room });
  const v = gameView(feed);
  assert.ok(v.room);
  assert.equal(v.settled, false);
});

const CARDS = [
  { cardId: 'UNL-060', cardName: 'Vilemaw', type: 'Unit' },
  { cardId: 'OGN-160', cardName: 'Dazzling Aurora', type: 'Gear' },
  { cardId: 'SFD-143', cardName: 'Sample Card', type: 'Spell' },
  { cardId: 'SFD-143a', cardName: 'Sample Card', type: 'Spell' },
  { cardId: 'SFD-209', cardName: 'Forgotten Monument', type: 'Battlefield' },
  { cardId: 'OGS-019', cardName: 'Master Yi, Wuju Bladesman', type: 'Legend' },
];

test('card codes resolve: exact, any case, alternate art, then by name', () => {
  const r = makeCardResolver(CARDS);
  assert.equal(r({ code: 'OGN-160', name: 'Dazzling Aurora' }).cardId, 'OGN-160');
  assert.equal(r({ code: 'ogn-160', name: 'Dazzling Aurora' }).cardId, 'OGN-160');
  assert.equal(r({ code: 'UNL-060A', name: 'Vilemaw' }).cardId, 'UNL-060');
  assert.equal(r({ code: 'SFD-143A', name: 'Sample Card' }).cardId, 'SFD-143a', 'the same printing letter, any case');
  assert.equal(r({ code: 'SFD-143B', name: 'Sample Card' }).cardId, 'SFD-143', 'an unknown printing falls back to the plain card');
  assert.equal(r({ name: 'Forgotten Monument' }).cardId, 'SFD-209');
  assert.equal(r({ code: 'ZZZ-001', name: 'Nothing' }), null);
  // A code that belongs to a different card on this side is trusted less than the name.
  assert.equal(r({ code: 'OGN-160', name: 'Vilemaw' }).cardId, 'UNL-060');
});

const legendOf = ({ name }) => ({ legend: name, legendSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), legendCardId: '' });
const resolveCard = makeCardResolver(CARDS);

test('sides follow seat order unless Match data names them the other way round', () => {
  const v = gameView(replay());
  const bank = buildBank({});
  assert.deepEqual(orientation(v, bank).map((p) => p.name), ['Aria Vance', 'Bram Holt']);
  const crossed = buildBank({ match: { left: { name: 'Bram' }, right: { name: 'Aria Vance' } } });
  assert.deepEqual(orientation(v, crossed).map((p) => p.name), ['Bram Holt', 'Aria Vance']);
  assert.deepEqual(orientation(v, crossed, true).map((p) => p.name), ['Aria Vance', 'Bram Holt'], 'swap flips whatever was decided');
});

test('the live patch: points, wins, hands, battlefields, turn, never names', () => {
  const v = gameView(replay());
  const bank = buildBank({});
  const { patch } = livePatch(v, bank, { resolveCard, legendOf });
  const { left, right } = patch.match;
  assert.equal(left.name, undefined);
  assert.equal(right.name, undefined);
  assert.equal(left.score, v.players[0].score);
  assert.equal(left.gameWins, 1);
  assert.equal(left.handCount, v.players[0].handCount);
  assert.equal(left.hand.length, v.players[0].hand.length);
  assert.equal(left.legend, 'Master Yi, Wuju Bladesman');
  assert.equal(left.battlefield, 'Forgotten Monument');
  assert.equal(left.battlefieldCardId, 'SFD-209');
  // An empty pool fills with the battlefields seen so far, all played.
  assert.deepEqual(left.battlefields.map((b) => b.name), ['Sigil of the Storm', 'Dragon Roost', 'Forgotten Monument']);
  assert.ok(left.battlefields.every((b) => b.played));
  assert.equal(patch.match.seriesLength, 3);
  assert.equal(patch.match.turn, v.turn);
  assert.equal(patch.match.activeSide, v.activePlayerId === v.players[0].id ? 'left' : 'right');
});

test('a pool from a decklist keeps its three, gaining played marks only', () => {
  const v = gameView(replay());
  const pool = [
    { name: 'Forgotten Monument', cardId: 'SFD-209', played: false },
    { name: 'Dragon Roost', cardId: '', played: false },
    { name: 'Some Other Field', cardId: '', played: false },
  ];
  const bank = buildBank({ match: { left: { battlefields: pool } } });
  const { patch } = livePatch(v, bank, { resolveCard, legendOf });
  assert.deepEqual(patch.match.left.battlefields.map((b) => [b.name, b.played]), [
    ['Forgotten Monument', true], ['Dragon Roost', true], ['Some Other Field', false],
  ]);
});

test('Load players fills unnamed sides and empty decks, and leaves the rest', () => {
  const v = gameView(replay());
  // Sam: TopDeck's names outrank RiftAtlas's display names.
  const bank = buildBank({ match: { left: { name: 'Aria V. (TopDeck)', record: '3-1-0' } } });
  const { patch, names } = identityPatch(v, bank, { resolveCard, legendOf });
  assert.deepEqual(names, ['Aria Vance', 'Bram Holt']);
  assert.equal(patch.match.left.name, undefined, 'a name already there stays');
  assert.equal(patch.match.left.record, undefined, 'and so does its record');
  assert.equal(patch.match.right.name, 'Bram Holt', 'PLAYER TWO counts as unnamed');
  const deck = parseDecklist(patch.match.left.deckList);
  assert.equal(deck.legend, 'Master Yi, Wuju Bladesman');
  assert.equal(deck.main.reduce((t, e) => t + e.qty, 0), v.players[0].deck.total);
  assert.ok(deck.battlefields.includes('Forgotten Monument'));
});

test('a pasted decklist outranks RiftAtlas for legend, champion and the pool', () => {
  const v = gameView(replay());
  const pasted = 'Legend: Pasted Legend\nChampion: Pasted Champion\n\nMain:\n3 X';
  const pool = [{ name: 'Field Nobody Played', cardId: '', played: false }];
  const bank = buildBank({ match: { left: { deckList: pasted, legend: 'Pasted Legend', champion: 'Pasted Champion', battlefields: pool } } });
  const { patch } = livePatch(v, bank, { resolveCard, legendOf });
  assert.equal(patch.match.left.legend, undefined);
  assert.equal(patch.match.left.champion, undefined);
  assert.deepEqual(patch.match.left.battlefields.map((b) => b.name), ['Field Nobody Played'], "no top-up of a list's pool");
  assert.equal(patch.match.left.battlefield, 'Forgotten Monument', "the battlefield in play is still the game's");
  assert.equal(patch.match.right.legend, 'Fiora, Grand Duelist', 'a side with no list still follows RiftAtlas');
  // Load players never replaces a list that is there.
  const { patch: id } = identityPatch(v, bank, { resolveCard, legendOf });
  assert.equal(id.match.left.deckList, undefined);
  assert.ok(id.match.right.deckList);
  // With a list but an empty legend field, RiftAtlas still fills the field.
  const empty = buildBank({ match: { left: { deckList: pasted } } });
  assert.equal(livePatch(v, empty, { resolveCard, legendOf }).patch.match.left.legend, 'Master Yi, Wuju Bladesman');
});

test('the deck paste leaves runes out until all twelve are face up', () => {
  const p = { legend: { name: 'L' }, champion: null, usedBattlefields: [], battlefield: '', deck: { cards: [{ name: 'X', start: 3 }] }, runes: ['Body Rune', 'Calm Rune'] };
  assert.doesNotMatch(deckText(p), /Runes:/);
  p.runes = [...Array(7).fill('Body Rune'), ...Array(5).fill('Calm Rune')];
  assert.match(deckText(p), /Runes:\n7 Body\n5 Calm/);
});

// ---- showdowns ---------------------------------------------------------------

const ROOM = 'SDTEST';
const card = (id, name, type, extra = {}) => ({ id, name, type, cardCode: '', source: 'mainDeck', exhausted: false, isPlaceholder: false, ...extra });
const MIGHTS = [
  { cardId: 'T-1', cardName: 'Big Unit', type: 'Unit', might: 3 },
  { cardId: 'T-2', cardName: 'Small Unit', type: 'Unit', might: 2 },
  { cardId: 'T-3', cardName: 'Quick Spell', type: 'Spell' },
  { cardId: 'T-4', cardName: 'Answer Spell', type: 'Spell' },
  { cardId: 'T-5', cardName: 'Field Two', type: 'Battlefield' },
];
const sdResolve = makeCardResolver(MIGHTS);
function sdFeed() {
  const feed = createFeed();
  const pub = [{ id: 'a', name: 'Ann', seat: 0, selectedBattlefield: 'Field One' }, { id: 'b', name: 'Bob', seat: 1, selectedBattlefield: 'Field Two' }];
  ingestFrame(feed, { type: 'room_shell_sync', gameInstanceId: ROOM, sessionDoc: { roomCode: ROOM, phase: 'in_game', matchFormat: 'bo3', gameNumber: 1, publicPlayers: pub, winsByPlayerId: {} } });
  const board = (units) => ({ hand: [], base: [], trash: [], banished: [], battlefieldA: [], battlefieldB: units, battlefieldC: [], champion: [], legend: [], deck: [], runeArea: [], runeDeck: [], score: 0 });
  ingestFrame(feed, { type: 'authoritative_snapshot', gameInstanceId: ROOM, sequence: 1, gameplayLog: [], snapshot: {
    roomCode: ROOM, phase: 'in_game', turnNumber: 5, activeTurnPlayerId: 'a', chainEntries: [],
    players: [
      { ...pub[0], board: board([card('a1', 'Big Unit', 'unit', { temporaryMightBuff: 2 }), card('a2', 'Small Unit', 'unit', { whiteCounter: 6 }), card('a3', 'Some Gear', 'gear', { attachedToCardId: 'a1' })]) },
      { ...pub[1], board: board([card('b1', 'Small Unit', 'unit'), { id: '__hidden_zone__:b:battlefieldB:0', name: '', isPlaceholder: true }]) },
    ],
  } });
  let seq = 1;
  const patch = (...operations) => {
    ingestFrame(feed, { type: 'authoritative_patch_commit', gameInstanceId: ROOM, baseSequence: seq, sequence: seq + 1, patch: { operations } });
    seq += 1;
  };
  return { feed, patch };
}
const entry = (id, name, by) => ({ id, byPlayerId: by, fromZone: 'hand', card: card(`c-${id}`, name, 'spell', { ownerPlayerId: by }) });
const pending = (stage) => ({ op: 'set_room_fields', fields: { pendingBattlefieldConquerAssist: { zone: 'battlefieldB', attackerPlayerId: 'a', defenderPlayerId: 'b', stage, turnNumber: 5 } } });

test('might counts the way the casting studio does', () => {
  assert.equal(unitMight(card('x', 'Big Unit', 'unit'), sdResolve), 3, 'printed might from the card index');
  assert.equal(unitMight(card('x', 'Big Unit', 'unit', { temporaryMightBuff: 2 }), sdResolve), 5, 'plus a temporary buff');
  assert.equal(unitMight(card('x', 'Big Unit', 'unit', { whiteCounter: 7, temporaryMightBuff: 1 }), sdResolve), 8, 'a might counter replaces the printed might');
  assert.equal(unitMight(card('x', 'Nobody Knows', 'unit'), sdResolve), null);
});

test('a showdown: opened by a move, answered by the defender, settled and gone', () => {
  const { feed, patch } = sdFeed();
  assert.equal(gameView(feed, { resolveCard: sdResolve }).showdown, null);

  patch(pending('attacker_focus'));
  let v = gameView(feed, { resolveCard: sdResolve });
  assert.equal(v.showdown.battlefield, 'Field Two', "battlefield B is seat 1's pick");
  assert.deepEqual(v.showdown.might, { a: 11, b: 2 }, 'Big Unit 3+2, Small Unit counter 6, the gear left out; a face-down card is unknown');
  assert.deepEqual(v.showdown.unknown, { a: 0, b: 1 });
  assert.equal(v.showdown.priorityId, 'a');

  patch({ op: 'chain_insert', index: 0, entries: [entry('e1', 'Quick Spell', 'a')] });
  v = gameView(feed, { resolveCard: sdResolve });
  assert.equal(v.showdown.defenderPlayed, false, 'the attacker alone is not an answer');

  patch(pending('defender_response'), { op: 'chain_insert', index: 1, entries: [entry('e2', 'Answer Spell', 'b')] });
  v = gameView(feed, { resolveCard: sdResolve });
  assert.equal(v.showdown.defenderPlayed, true);
  assert.equal(v.showdown.priorityId, 'b');

  // The answer resolves off the chain but stays one of the showdown's cards.
  patch({ op: 'chain_remove', entryIds: ['e2'] });
  v = gameView(feed, { resolveCard: sdResolve });
  assert.deepEqual(v.showdown.plays.map((x) => [x.name, x.playerId, x.onChain]), [['Quick Spell', 'a', true], ['Answer Spell', 'b', false]]);

  const sd = showdownPatch(v, [v.players[0], v.players[1]], sdResolve);
  assert.equal(sd.active, true);
  assert.equal(sd.battlefield, 'Field Two');
  assert.equal(sd.battlefieldCardId, 'T-5');
  assert.equal(sd.priority, 'right');
  assert.deepEqual(sd.might, { left: 11, right: 2 });
  assert.deepEqual(sd.chain.map((c) => [c.cardName, c.side, c.resolved, c.cardId]), [['Quick Spell', 'left', false, 'T-3'], ['Answer Spell', 'right', true, 'T-4']]);

  // Settled with the chain empty: over.
  patch({ op: 'unset_room_fields', fields: ['pendingBattlefieldConquerAssist'] });
  assert.ok(gameView(feed, { resolveCard: sdResolve }).showdown, 'still on while a card is on the chain');
  patch({ op: 'chain_remove', entryIds: ['e1'] });
  assert.equal(gameView(feed, { resolveCard: sdResolve }).showdown, null);
});

test('a reaction unit played from hand to the contested battlefield counts as played', () => {
  const { feed, patch } = sdFeed();
  patch(pending('defender_response'));
  feed.game.state.players[1].board.hand.push(card('h1', 'Big Unit', 'unit', { ownerPlayerId: 'b' }));
  patch({ op: 'zone_move', cardId: 'h1', from: { playerId: 'b', zone: 'hand' }, to: { playerId: 'b', zone: 'battlefieldB', index: 0 } });
  const v = gameView(feed, { resolveCard: sdResolve });
  assert.equal(v.showdown.defenderPlayed, true);
  assert.deepEqual(v.showdown.plays.map((x) => [x.name, x.playerId]), [['Big Unit', 'b']]);
  assert.equal(v.showdown.might.b, 5, 'and its might joins the side at once');
});

test('a snapshot taken mid-showdown keeps what is still on the chain', () => {
  const { feed, patch } = sdFeed();
  patch(pending('defender_response'), { op: 'chain_insert', index: 0, entries: [entry('e9', 'Answer Spell', 'b')] });
  const fresh = createFeed();
  for (const r of feed.shellOrder) ingestFrame(fresh, { type: 'room_shell_sync', gameInstanceId: r, sessionDoc: feed.shells.get(r) });
  ingestFrame(fresh, { type: 'authoritative_snapshot', gameInstanceId: ROOM, sequence: 9, gameplayLog: [], snapshot: structuredClone(feed.game.state) });
  const v = gameView(fresh, { resolveCard: sdResolve });
  assert.equal(v.showdown.defenderPlayed, true);
  assert.deepEqual(v.showdown.plays.map((x) => x.name), ['Answer Spell']);
});
