import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import {
  parseRoomCode, casterUrl, socketRoom, createFeed, ingestFrame, applyOperations, gameView, currentRoom,
  makeCardResolver, orientation, livePatch, identityPatch, deckText,
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

test('Load players names both sides and brings each deck as a paste', () => {
  const v = gameView(replay());
  const bank = buildBank({ match: { left: { name: 'Someone Else', record: '3-1-0' } } });
  const { patch, names } = identityPatch(v, bank, { resolveCard, legendOf });
  assert.deepEqual(names, ['Aria Vance', 'Bram Holt']);
  assert.equal(patch.match.left.name, 'Aria Vance');
  assert.equal(patch.match.left.record, '', 'a new player does not inherit the last one\'s record');
  const deck = parseDecklist(patch.match.left.deckList);
  assert.equal(deck.legend, 'Master Yi, Wuju Bladesman');
  assert.equal(deck.main.reduce((t, e) => t + e.qty, 0), v.players[0].deck.total);
  assert.ok(deck.battlefields.includes('Forgotten Monument'));
});

test('the deck paste leaves runes out until all twelve are face up', () => {
  const p = { legend: { name: 'L' }, champion: null, usedBattlefields: [], battlefield: '', deck: { cards: [{ name: 'X', start: 3 }] }, runes: ['Body Rune', 'Calm Rune'] };
  assert.doesNotMatch(deckText(p), /Runes:/);
  p.runes = [...Array(7).fill('Body Rune'), ...Array(5).fill('Calm Rune')];
  assert.match(deckText(p), /Runes:\n7 Body\n5 Calm/);
});
