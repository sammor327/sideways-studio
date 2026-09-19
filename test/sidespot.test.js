// Sideboard card spotted and the battlefield results (2026-09-19): the spot
// cue and the sidespot scene's settings, each battlefield's game and result
// (recorded from the game wins by hand, or from a RiftAtlas series), and the
// sided-in cards the reader spots as they turn up in a hand.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createFeed, ingestFrame, gameView, livePatch, makeCardResolver, normName,
  seriesWinners, noteDecks, sidedIn, spotSideboardCards, spotActions, SIDEBOARD_MAX,
} from '../server/riftatlas-model.js';
import { DESIGNED, LOOK_SCENES, SCENE_LABELS } from '../web/shared/look.js';
import { SCENE_SOURCES } from '../web/shared/sources.js';
import { TILES } from '../web/shared/looktiles.js';

const FRAMES = JSON.parse(readFileSync(new URL('./fixtures/riftatlas-series.json', import.meta.url), 'utf8'));
function replay(frames = FRAMES) {
  const feed = createFeed();
  for (const f of frames) {
    ingestFrame(feed, f.msg, { room: f.room, now: f.at });
    noteDecks(feed);
  }
  return feed;
}
const resolveCard = makeCardResolver([]);
const legendOf = ({ name }) => ({ legend: name, legendSlug: '', legendCardId: '' });

let state;
let buildBank;
before(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ss-sidespot-test-'));
  process.env.SIDEWAYS_DATA_DIR = dir;
  // A save from before this round: pool entries with no game or result, and
  // no sidespot scene at all.
  const OLD = {
    match: { left: { name: 'A', battlefields: [{ name: 'Field', cardId: '', played: true }] }, right: { name: 'B' } },
    scenes: { sidespot: { visible: true, hold: 99, spot: { id: 'x', side: 'middle', cardId: '../x', at: 'soon' } } },
  };
  await writeFile(path.join(dir, 'event.json'), JSON.stringify({ version: 5, preview: OLD, program: OLD, theme: {} }));
  state = await import('../server/state.js');
  await state.initState();
  ({ buildBank } = state);
});
const banks = () => [state.getState().preview, state.getState().program];

describe('the sidespot graphic in the store', () => {
  it('cleans an older or hand-edited save into the new shape', () => {
    for (const bank of banks()) {
      const ss = bank.scenes.sidespot;
      assert.equal(ss.hold, 30, 'the hold is held to 3..30 seconds');
      assert.deepEqual(ss.spot, { id: 0, side: '', cardId: '', cardName: '', player: '', game: 0, turn: 0, at: 0 });
    }
    const fresh = buildBank({});
    assert.deepEqual(fresh.scenes.sidespot, { visible: false, hold: 8, spot: { id: 0, side: '', cardId: '', cardName: '', player: '', game: 0, turn: 0, at: 0 } });
  });

  it('takes its switch and hold through preview like any graphic', () => {
    state.applyUpdate({ scenes: { sidespot: { visible: false, hold: 1, spot: { id: 99 } } } });
    const ss = state.getState().preview.scenes.sidespot;
    assert.equal(ss.visible, false);
    assert.equal(ss.hold, 3);
    assert.equal(ss.spot.id, 0, 'a bank patch never writes the spot: that is the cue');
    state.applyUpdate({ scenes: { sidespot: { hold: 12, visible: true } } });
    assert.equal(state.getState().preview.scenes.sidespot.hold, 12);
    assert.equal(state.getState().program.scenes.sidespot.visible, true, 'program kept its own until TAKE');
  });

  it('spots a card on both banks at once, naming the player from preview', () => {
    state.applyUpdate({ match: { right: { name: 'Theo Brandt' } } });
    const before = Date.now();
    const r = state.applyUpdate({ action: 'spot', side: 'right', cardId: 'SFD-136', cardName: 'Hard Bargain', game: 2, turn: 5 });
    assert.equal(r.ok, true);
    for (const bank of banks()) {
      const spot = bank.scenes.sidespot.spot;
      assert.equal(spot.id, 1);
      assert.equal(spot.side, 'right');
      assert.equal(spot.cardId, 'SFD-136');
      assert.equal(spot.cardName, 'Hard Bargain');
      assert.equal(spot.player, 'Theo Brandt');
      assert.deepEqual([spot.game, spot.turn], [2, 5]);
      assert.ok(spot.at >= before);
    }
    assert.equal(state.getState().preview.scenes.sidespot.visible, true, 'a cue never switches a graphic');
  });

  it('flies the last one again under a new serial, and takes it down keeping it', () => {
    state.applyUpdate({ action: 'spot', op: 'again' });
    for (const bank of banks()) assert.equal(bank.scenes.sidespot.spot.id, 2);
    state.applyUpdate({ action: 'spot', op: 'hide' });
    for (const bank of banks()) {
      assert.equal(bank.scenes.sidespot.spot.at, 0);
      assert.equal(bank.scenes.sidespot.spot.cardName, 'Hard Bargain');
    }
    state.applyUpdate({ action: 'spot', op: 'again' });
    for (const bank of banks()) assert.ok(bank.scenes.sidespot.spot.at > 0);
  });

  it('refuses a spot with no side, no card or an unknown op', () => {
    assert.equal(state.applyUpdate({ action: 'spot', side: 'middle', cardName: 'X' }).ok, false);
    assert.equal(state.applyUpdate({ action: 'spot', side: 'left' }).ok, false);
    assert.equal(state.applyUpdate({ action: 'spot', op: 'twirl' }).ok, false);
    const r = state.applyUpdate({ action: 'spot', side: 'left', cardId: '../etc', cardName: 'Named Only', player: 'Someone' });
    assert.equal(r.ok, true);
    assert.equal(state.getState().program.scenes.sidespot.spot.cardId, '');
    assert.equal(state.getState().program.scenes.sidespot.spot.player, 'Someone');
  });

  it('is listed with the other graphics, with a look and a tile', () => {
    assert.ok(LOOK_SCENES.includes('sidespot'));
    assert.equal(SCENE_LABELS.sidespot, 'Sideboard card spotted');
    assert.ok(DESIGNED.sidespot);
    assert.ok(SCENE_SOURCES.some((s) => s.key === 'sidespot' && s.path === '/scenes/sidespot/?transparent=1'));
    assert.ok(TILES.some((t) => t.scene === 'sidespot'));
    for (const file of ['index.html', 'scene.js', 'scene.css']) {
      assert.ok(readFileSync(new URL(`../web/scenes/sidespot/${file}`, import.meta.url), 'utf8').length > 100);
    }
    for (const page of ['../web/output/index.html', '../web/monitor/index.html']) {
      assert.match(readFileSync(new URL(page, import.meta.url), 'utf8'), /sidespot/);
    }
  });
});

describe('each battlefield\'s game and result', () => {
  it('keeps a result only with its game, and a result means played', () => {
    const bank = buildBank({ match: { left: { battlefields: [
      { name: 'A', result: 'won', game: 2 },
      { name: 'B', result: 'maybe', game: 3, played: false },
      { name: 'C', result: 'lost', game: 9 },
    ] } } });
    assert.deepEqual(bank.match.left.battlefields, [
      { name: 'A', cardId: '', played: true, game: 2, result: 'won' },
      { name: 'B', cardId: '', played: false, game: 0, result: '' },
      { name: 'C', cardId: '', played: true, game: 5, result: 'lost' },
    ]);
  });

  const pool = (names) => names.map((name) => ({ name, cardId: '' }));
  const setup = () => {
    state.applyUpdate({ match: {
      seriesLength: 3,
      left: { gameWins: 0, battlefield: 'L1', battlefields: pool(['L1', 'L2', 'L3']) },
      right: { gameWins: 0, battlefield: 'R1', battlefields: pool(['R1', 'R2', 'R3']) },
    } });
  };
  const marks = (side) => state.getState().preview.match[side].battlefields.map((b) => [b.name, b.game, b.result]);

  it('marks both battlefields in play when one side\'s game wins go up by one', () => {
    setup();
    state.applyUpdate({ match: { left: { gameWins: 1 } } });
    assert.deepEqual(marks('left'), [['L1', 1, 'won'], ['L2', 0, ''], ['L3', 0, '']]);
    assert.deepEqual(marks('right'), [['R1', 1, 'lost'], ['R2', 0, ''], ['R3', 0, '']]);
    // Game 2 on new battlefields, won by the right.
    state.applyUpdate({ match: { left: { battlefield: 'L2' }, right: { battlefield: 'R3' } } });
    state.applyUpdate({ match: { right: { gameWins: 1 } } });
    assert.deepEqual(marks('left'), [['L1', 1, 'won'], ['L2', 2, 'lost'], ['L3', 0, '']]);
    assert.deepEqual(marks('right'), [['R1', 1, 'lost'], ['R2', 0, ''], ['R3', 2, 'won']]);
  });

  it('takes a game\'s marks back off when the wins go back down', () => {
    state.applyUpdate({ match: { right: { gameWins: 0 } } });
    assert.deepEqual(marks('left'), [['L1', 1, 'won'], ['L2', 0, ''], ['L3', 0, '']]);
    assert.deepEqual(marks('right'), [['R1', 1, 'lost'], ['R2', 0, ''], ['R3', 0, '']]);
    // The fix: the left won game 2 after all.
    state.applyUpdate({ match: { left: { gameWins: 2 } } });
    assert.deepEqual(marks('left').map((m) => m.slice(1)), [[1, 'won'], [2, 'won'], [0, '']]);
    assert.deepEqual(marks('right').map((m) => m.slice(1)), [[1, 'lost'], [0, ''], [2, 'lost']]);
  });

  it('leaves a side alone when the patch brings its battlefields, or the wins jump', () => {
    setup();
    state.applyUpdate({ match: { left: { gameWins: 1, battlefields: pool(['L1', 'L2', 'L3']) } } });
    assert.deepEqual(marks('left'), [['L1', 0, ''], ['L2', 0, ''], ['L3', 0, '']], 'what the patch brought stands');
    assert.deepEqual(marks('right'), [['R1', 1, 'lost'], ['R2', 0, ''], ['R3', 0, '']]);
    setup();
    state.applyUpdate({ match: { left: { gameWins: 1 }, right: { gameWins: 1 } } });
    assert.ok(state.getState().preview.match.left.battlefields.every((b) => !b.result), 'two games at once says nothing about which');
  });
});

describe('RiftAtlas: who won each game, on which battlefield', () => {
  it('reads each game\'s winner off the series\' rooms', () => {
    const feed = replay();
    assert.deepEqual(seriesWinners(feed, 'NXDZY'), { 1: 'plr_1023fdde', 2: 'plr_63900812' });
    const v = gameView(feed);
    assert.deepEqual(v.results, { 1: 'plr_1023fdde', 2: 'plr_63900812' });
    const [a, b] = v.players;
    assert.deepEqual(a.battlefieldGames.map((g) => [g.name, g.game, g.result, g.now]), [
      ['Sigil of the Storm', 1, 'won', false], ['Dragon Roost', 2, 'lost', false], ['Forgotten Monument', 3, '', true],
    ]);
    assert.deepEqual(b.battlefieldGames.map((g) => [g.name, g.game, g.result]), [
      ['Amateur Recital', 1, 'lost'], ['Sunken Temple', 2, 'won'], ['Risen Altar', 3, ''],
    ]);
  });

  it('leaves a game out when the reports disagree, and falls back on the wins stepping up', () => {
    const shells = FRAMES.filter((f) => f.msg.type === 'room_shell_sync').map((f) => structuredClone(f));
    const feed = createFeed();
    for (const f of shells) {
      if (f.room === 'QZGSU') f.msg.sessionDoc.pendingGameResult = { winnerByReporterPlayerId: { plr_1023fdde: 'plr_1023fdde', plr_63900812: 'plr_63900812' } };
      if (f.room === 'RHNQ8') delete f.msg.sessionDoc.pendingGameResult;
      ingestFrame(feed, f.msg, { room: f.room });
    }
    assert.deepEqual(seriesWinners(feed, 'NXDZY'), { 2: 'plr_63900812' });
  });

  it('puts the results on the pool it writes, on and between games', () => {
    const v = gameView(replay());
    const { patch } = livePatch(v, buildBank({}), { resolveCard, legendOf });
    assert.deepEqual(patch.match.left.battlefields.map((b) => [b.name, b.game, b.result, b.played]), [
      ['Sigil of the Storm', 1, 'won', true], ['Dragon Roost', 2, 'lost', true], ['Forgotten Monument', 0, '', true],
    ]);
    // Between games there is no battlefield in play, yet the pool Match data
    // holds still takes the decided games.
    const between = { ...v, players: v.players.map((p) => ({ ...p, battlefield: '', battlefieldGames: p.battlefieldGames.filter((g) => !g.now) })) };
    const bank = buildBank({ match: { left: { battlefields: [{ name: 'Sigil of the Storm' }, { name: 'Dragon Roost' }, { name: 'Unplayed' }] } } });
    const { patch: p2 } = livePatch(between, bank, { resolveCard, legendOf });
    assert.deepEqual(p2.match.left.battlefields.map((b) => [b.name, b.game, b.result]), [
      ['Sigil of the Storm', 1, 'won'], ['Dragon Roost', 2, 'lost'], ['Unplayed', 0, ''],
    ]);
    assert.equal(p2.match.left.battlefield, undefined);
  });
});

describe('RiftAtlas: sideboard cards', () => {
  const keyOf = (c) => normName(c.name);

  it('remembers the earliest starting deck of each series per player', () => {
    const feed = replay();
    assert.deepEqual([...feed.decks.keys()].sort(), ['series_c5f038f4|plr_1023fdde', 'series_c5f038f4|plr_63900812']);
    for (const d of feed.decks.values()) {
      assert.equal(d.game, 3);
      assert.equal(d.cards.reduce((t, c) => t + c.start, 0), 39);
    }
  });

  it('holds this game\'s deck against game 1\'s, when the reader saw it', () => {
    const feed = replay();
    const v = gameView(feed);
    const [a] = v.players;
    // Game 1 had one card fewer of the first card and none of the second.
    const [first, second] = a.deck.cards.filter((c) => c.start > 0);
    const game1 = a.deck.cards.map((c) => ({ ...c }))
      .map((c) => (c.name === first.name ? { ...c, start: c.start - 1 } : c))
      .filter((c) => c.name !== second.name);
    feed.decks.set(`series_c5f038f4|${a.id}`, { game: 1, cards: game1 });
    const sided = sidedIn(feed, v, { keyOf });
    assert.equal(sided[a.id].against, 'game 1');
    assert.deepEqual([...sided[a.id].extra], [[keyOf(first), 1], [keyOf(second), second.start]]);
    assert.equal(sided[v.players[1].id].against, '', 'nothing to hold the other player against');
  });

  it('holds it against the list in Match data otherwise, its sideboard naming the candidates', () => {
    const feed = replay();
    const v = gameView(feed);
    const [a] = v.players;
    const [first, second] = a.deck.cards.filter((c) => c.start > 0);
    const main = a.deck.cards.filter((c) => c.name !== first.name && c.name !== second.name).map((c) => ({ name: c.name, qty: c.start }));
    let sided = sidedIn(feed, v, { keyOf, lists: { [a.id]: { main, sideboard: [] } } });
    assert.equal(sided[a.id].against, 'list');
    assert.deepEqual([...sided[a.id].extra.keys()], [keyOf(first), keyOf(second)]);
    sided = sidedIn(feed, v, { keyOf, lists: { [a.id]: { main, sideboard: [{ name: second.name, qty: 2 }] } } });
    assert.deepEqual([...sided[a.id].extra.keys()], [keyOf(second)], 'a list with a sideboard only counts what it names');
    // A list that is not this deck at all: nothing counts.
    sided = sidedIn(feed, v, { keyOf, lists: { [a.id]: { main: [{ name: 'Something Else', qty: 40 }], sideboard: [] } } });
    assert.equal(sided[a.id].mismatch, true);
    assert.equal(sided[a.id].extra.size, 0);
    assert.ok(SIDEBOARD_MAX >= 8);
  });

  it('turns what it spotted into spot cues on the side each player feeds', () => {
    const v = gameView(replay());
    const [a, b] = v.players;
    const found = [{ playerId: b.id, turn: 6, name: 'Vilemaw', code: 'UNL-060A' }, { playerId: 'plr_nobody', turn: 6, name: 'X' }];
    const cards = makeCardResolver([{ cardId: 'UNL-060', cardName: 'Vilemaw' }]);
    // An unnamed side prints RiftAtlas's name; a named one keeps its own.
    assert.deepEqual(spotActions(found, v, [a, b], { left: { name: 'Aria V.' }, right: { name: 'PLAYER TWO' } }, cards), [
      { action: 'spot', side: 'right', cardId: 'UNL-060', cardName: 'Vilemaw', player: 'Bram Holt', game: 3, turn: 6 },
    ]);
    const swapped = spotActions(found, v, [b, a], { left: { name: 'Bram (TopDeck)' }, right: { name: 'Aria' } }, makeCardResolver([]));
    assert.deepEqual(swapped.map((c) => [c.side, c.player, c.cardId, c.cardName]), [['left', 'Bram (TopDeck)', '', 'Vilemaw']]);
  });

  it('has nothing sided in for game 1', () => {
    const feed = replay();
    const v = { ...gameView(feed), gameNumber: 1 };
    assert.deepEqual(sidedIn(feed, v, { keyOf }), {});
  });

  it('spots a sided-in card when it turns up in hand after turn 1, once a game', () => {
    const firstPatch = FRAMES.findIndex((f) => f.msg.type === 'authoritative_patch_commit');
    const feed = createFeed();
    const tracker = {};
    // Everything counts as sided in, so every card that arrives in a hand is
    // one the spotter should see.
    const all = (f) => Object.fromEntries((f.game ? f.game.state.players : []).map((p) => [p.id, { against: 'game 1', extra: { get: () => 1 } }]));
    for (const f of FRAMES.slice(0, firstPatch)) ingestFrame(feed, f.msg, { room: f.room, now: f.at });
    const handAtStart = new Set(feed.game.state.players.flatMap((p) => p.board.hand.map((c) => c.id)));
    assert.deepEqual(spotSideboardCards(feed, tracker, all(feed), { keyOf }), [], 'the first look only learns the hands');
    const spots = [];
    for (const f of FRAMES.slice(firstPatch)) {
      ingestFrame(feed, f.msg, { room: f.room, now: f.at });
      spots.push(...spotSideboardCards(feed, tracker, all(feed), { keyOf }));
    }
    assert.ok(spots.length > 0, 'the recorded game draws cards');
    const drawnIds = new Set(feed.game.state.players.flatMap((p) => p.board.hand.map((c) => c.id)));
    for (const s of spots) {
      assert.ok(s.turn > 1);
      assert.ok(s.name);
      assert.ok(['plr_1023fdde', 'plr_63900812'].includes(s.playerId));
    }
    const keys = spots.map((s) => `${s.playerId}|${keyOf(s)}`);
    assert.equal(new Set(keys).size, keys.length, 'each card once a game for each player');
    assert.ok([...drawnIds].some((id) => !handAtStart.has(id)));

    // The same game read again with the turn gate past it spots nothing, and
    // so does a card the player did not side in.
    const quiet = (sided, opts) => {
      const q = createFeed();
      const t = {};
      const out = [];
      for (const f of FRAMES) {
        ingestFrame(q, f.msg, { room: f.room, now: f.at });
        out.push(...spotSideboardCards(q, t, sided(q), { keyOf, ...opts }));
      }
      return out;
    };
    assert.deepEqual(quiet(all, { after: 99 }), []);
    assert.deepEqual(quiet(() => ({}), {}), []);
  });
});
