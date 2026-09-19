import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cardKey, drawChance, drawPool, formatChance, oddsRows, poolLine, unknownInHand,
} from '../web/shared/odds.js';
import { banishedRows, flowText, trashCounts, trashRows } from '../web/shared/trash.js';
import { SHEET_W, placeSheets, rowsThatFit, sheetHeight, sheetSlots } from '../web/shared/sidesheets.js';
import { parseFlow } from '../server/carddb.js';
import {
  createFeed, gameView, ingestFrame, livePatch, makeCardResolver,
} from '../server/riftatlas-model.js';

let applyUpdate;
let getState;
let buildBank;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-odds-test-'));
  ({ applyUpdate, getState, buildBank } = await import('../server/state.js'));
});

const main = (entries) => ({ main: entries.map(([qty, name, energy = null]) => ({ name, cardId: '', qty, energy, domains: [] })), champion: null });

describe('the odds to draw', () => {
  it('is copies over cards for the next draw, and at least one in several', () => {
    assert.equal(drawChance(3, 30, 1), 0.1);
    assert.equal(drawChance(0, 30, 1), 0);
    assert.equal(drawChance(3, 0, 1), 0);
    assert.equal(drawChance(5, 5, 1), 1);
    // Two draws: one less both missing, 27/30 * 26/29.
    assert.ok(Math.abs(drawChance(3, 30, 2) - (1 - (27 / 30) * (26 / 29))) < 1e-12);
    // More draws than misses: certain.
    assert.equal(drawChance(2, 3, 2), 1);
    assert.equal(drawChance(1, 3, 9), 1, 'draws past the pool are the whole pool');
  });

  it('takes the list less the cards seen, by name, printings together', () => {
    const deck = main([[3, 'Stupefy', 2], [2, 'Gust', 1], [1, 'Eclipse', 5]]);
    const side = { drawn: [{ cardId: 'X-1', cardName: 'Stupefy', n: 1 }, { cardId: 'X-1a', cardName: 'stupefy', n: 1 }, { cardName: 'Eclipse', n: 4 }] };
    const pool = drawPool(side, deck);
    assert.equal(pool.source, 'list');
    assert.deepEqual(pool.cards.map((c) => [c.cardName, c.start, c.left]), [['Stupefy', 3, 1], ['Gust', 2, 2], ['Eclipse', 1, 0]]);
    assert.equal(pool.total, 3);
    assert.equal(cardKey({ cardName: 'Kai\'Sa, Survivor' }), 'kaisasurvivor');
  });

  it('leaves the chosen champion out when a 40-card main lists it too', () => {
    const deck = { main: [{ name: 'Diana, Lunari', qty: 3 }, { name: 'Filler', qty: 37 }], champion: { name: 'Diana, Lunari' } };
    assert.deepEqual(drawPool({}, deck).cards.map((c) => c.start), [2, 37]);
    // A 39-card main is the usual paste: the Champion line is the chosen copy.
    const usual = { main: [{ name: 'Diana, Lunari', qty: 2 }, { name: 'Filler', qty: 37 }], champion: { name: 'Diana, Lunari' } };
    assert.deepEqual(drawPool({}, usual).cards.map((c) => c.start), [2, 37]);
  });

  it('prefers a live deck over the list, whatever the tally says', () => {
    const side = { deckLeft: [{ cardId: 'A-1', cardName: 'Alpha', left: 2 }, { cardName: 'Beta', left: 0 }], drawn: [{ cardName: 'Alpha', n: 3 }] };
    const pool = drawPool(side, main([[3, 'Alpha']]));
    assert.equal(pool.source, 'live');
    assert.equal(pool.total, 2);
    assert.deepEqual(drawPool({}, null), { cards: [], total: 0, source: '' });
  });

  it('ranks the likeliest first, keeps the deck order in a tie, and sums the rest', () => {
    const deck = main([[1, 'One'], [3, 'ThreeA'], [2, 'Two'], [3, 'ThreeB'], [1, 'OneB']]);
    const out = oddsRows(drawPool({}, deck), { draws: 1, rows: 3 });
    assert.deepEqual(out.rows.map((r) => r.cardName), ['ThreeA', 'ThreeB', 'Two']);
    assert.equal(out.rows[0].chance, 0.3);
    assert.equal(out.rows[0].weight, 1);
    assert.ok(Math.abs(out.rows[2].weight - 2 / 3) < 1e-12);
    assert.deepEqual(out.rest, { count: 2, copies: 2, best: 0.1 });
    assert.equal(out.total, 10);
    // A card with none left never makes the sheet.
    const gone = oddsRows(drawPool({ drawn: [{ cardName: 'ThreeA', n: 3 }] }, deck), { rows: 10 });
    assert.ok(!gone.rows.some((r) => r.cardName === 'ThreeA'));
  });

  it('prints chances to one decimal and says what they are out of', () => {
    assert.equal(formatChance(0.1), '10.0%');
    assert.equal(formatChance(1 / 39), '2.6%');
    assert.equal(formatChance(1), '100%');
    assert.equal(formatChance(0.0001), '<0.1%');
    assert.equal(formatChance(0), '0%');
    const pool = { source: 'list', total: 32 };
    assert.equal(poolLine(pool, { handCount: 5, hand: [{}, {}] }), '32 cards not yet seen');
    assert.equal(poolLine(pool, { handCount: 2, hand: [{}, {}] }), '32 cards in deck');
    assert.equal(poolLine({ source: 'live', total: 1 }, { handCount: 5 }), '1 card in deck');
    assert.equal(unknownInHand({ handCount: 1, hand: [{}, {}] }), 0);
  });
});

describe('the trash as the graphic lists it', () => {
  const trash = [
    { cardId: 'A', cardName: 'Alpha' },
    { cardId: 'F', cardName: 'Flowy', flow: { energy: 4, power: 1, domain: 'Fury' } },
    { cardId: 'B', cardName: 'Beta' },
    { cardId: 'A', cardName: 'Alpha' },
  ];

  it('lists the newest first with copies on one row, Flow cards first when asked', () => {
    assert.deepEqual(trashRows(trash, { flowFirst: false }).map((r) => [r.cardName, r.qty]), [['Alpha', 2], ['Beta', 1], ['Flowy', 1]]);
    assert.deepEqual(trashRows(trash).map((r) => r.cardName), ['Flowy', 'Alpha', 'Beta']);
    assert.deepEqual(trashCounts(trash), { cards: 4, flow: 1 });
    assert.deepEqual(trashRows(null), []);
  });

  it('lists the banished cards newest first, copies together, none of them lit', () => {
    const banished = [
      { cardId: 'F', cardName: 'Flowy', flow: { energy: 4, power: 1, domain: 'Fury' } },
      { cardId: 'A', cardName: 'Alpha' },
      { cardId: 'F', cardName: 'Flowy', flow: { energy: 4, power: 1, domain: 'Fury' } },
    ];
    assert.deepEqual(banishedRows(banished).map((r) => [r.cardName, r.qty, r.flow]), [['Flowy', 2, null], ['Alpha', 1, null]]);
    assert.equal(banished[0].flow.energy, 4, 'the list it was given is left alone');
    assert.deepEqual(banishedRows(undefined), []);
  });

  it('reads a Flow cost the way the card prints it', () => {
    assert.deepEqual(parseFlow('Kill a gear. [FLOW 4 and 1 Fury] (You may play this from your trash...)'), { energy: 4, power: 1, domain: 'Fury' });
    assert.deepEqual(parseFlow('[FLOW 1 and 2 Runes] (You may'), { energy: 1, power: 2, domain: '' });
    assert.deepEqual(parseFlow('Draw 1. [FLOW 2] (You may'), { energy: 2, power: 0, domain: '' });
    assert.equal(parseFlow('give a spell in your trash [FLOW] equal to its cost'), null, 'a bare [FLOW] names the keyword, it is no cost');
    assert.equal(parseFlow(''), null);
    assert.equal(flowText({ energy: 4, power: 1, domain: 'Fury' }), '4 and 1 Fury');
    assert.equal(flowText({ energy: 1, power: 2, domain: '' }), '1 and 2 Runes');
    assert.equal(flowText({ energy: 2, power: 0, domain: '' }), '2');
    assert.equal(flowText(null), '');
  });
});

describe('where the side sheets stand', () => {
  const win = { x: 330, y: 75, w: 1590, h: 930 };
  const bank = (odds, trash, decks = { left: true, right: true }) => ({
    scenes: { odds: { visible: false, side: 'left', ...odds }, trash: { visible: false, side: 'left', ...trash } },
    match: { left: { deckList: decks.left ? '3 Stupefy' : '', deckLeft: [] }, right: { deckList: decks.right ? '3 Stupefy' : '', deckLeft: [] } },
  });

  it('puts player 1 against the left edge and player 2 against the right', () => {
    const at = placeSheets(win, { left: 600, right: 600 });
    assert.equal(at.left.x, 354);
    assert.equal(at.right.x, 330 + 1590 - 24 - SHEET_W);
    assert.equal(at.left.scale, 1);
    assert.equal(at.left.y, 75 + (930 - 600) / 2);
  });

  it('stands the trash beside the odds when both show the same player', () => {
    const b = bank({ visible: true, side: 'left' }, { visible: true, side: 'left' });
    const odds = sheetSlots(b, 'odds');
    const trash = sheetSlots(b, 'trash');
    assert.equal(odds.slot('odds', 'left'), 0);
    assert.equal(trash.slot('trash', 'left'), 1);
    assert.equal(odds.count, 2);
    const o = placeSheets(win, { left: 600 }, { slot: (k) => odds.slot('odds', k), count: odds.count });
    const t = placeSheets(win, { left: 400 }, { slot: (k) => trash.slot('trash', k), count: trash.count });
    assert.ok(t.left.x >= o.left.x + SHEET_W * o.left.scale, 'the trash starts where the odds end');
    // Different players: each against its own edge.
    const apart = sheetSlots(bank({ visible: true, side: 'left' }, { visible: true, side: 'right' }), 'trash');
    assert.equal(apart.slot('trash', 'right'), 0);
    // Odds with no deck for that player draw nothing, so the trash keeps the edge.
    const noDeck = sheetSlots(bank({ visible: true, side: 'left' }, { visible: true, side: 'left' }, { left: false, right: true }), 'trash');
    assert.equal(noDeck.slot('trash', 'left'), 0);
  });

  it('shrinks every sheet alike when four share the window, and to fit a short one', () => {
    const b = bank({ visible: true, side: 'both' }, { visible: true, side: 'both' });
    const s = sheetSlots(b, 'trash');
    assert.equal(s.count, 4);
    const at = placeSheets(win, { left: 500, right: 500 }, { slot: (k) => s.slot('trash', k), count: s.count });
    assert.ok(at.left.scale < 1 && Math.abs(at.left.scale - at.right.scale) < 1e-9);
    const short = placeSheets({ x: 0, y: 145, w: 1920, h: 790 }, { left: sheetHeight(15, 46, true) });
    assert.ok(short.left.scale < 1 && short.left.y >= 145, 'a tall sheet scales into a short window');
    assert.equal(rowsThatFit({ h: 1016 }, 44), 18);
  });
});

describe('the trash and the drawn tally in the store', () => {
  const card = (name, extra = {}) => ({ cardId: '', cardName: name, ...extra });
  const tally = (side) => Object.fromEntries(getState().preview.match[side].drawn.map((d) => [d.cardName, d.n]));

  it('keeps the trash cleaned, its Flow cost with it, the newest sixty', () => {
    applyUpdate({ match: { right: { trash: [
      card('Brittle Steel', { flow: { energy: 4, power: 1, domain: 'Fury', junk: 1 } }),
      card('Plain', { flow: { energy: null, power: 0 } }),
      card('Bad Domain', { flow: { energy: 3, power: 2, domain: 'Wood' } }),
      null, 'junk', { cardName: '' },
    ] } } });
    const t = getState().preview.match.right.trash;
    assert.deepEqual(t.map((c) => [c.cardName, c.flow]), [
      ['Brittle Steel', { energy: 4, power: 1, domain: 'Fury' }],
      ['Plain', null],
      ['Bad Domain', { energy: 3, power: 2, domain: '' }],
    ]);
    assert.equal('played' in t[0], false);
    applyUpdate({ match: { right: { trash: Array.from({ length: 70 }, (_, i) => card(`C${i}`)), drawn: [] } } });
    const long = getState().preview.match.right.trash;
    assert.equal(long.length, 60);
    assert.equal(long[0].cardName, 'C10', 'the oldest go first');
    applyUpdate({ match: { right: { trash: [], drawn: [] } } });
  });

  it('counts a card drawn when it reaches the hand, and never gives it back', () => {
    applyUpdate({ match: { left: { hand: [], trash: [], drawn: [] } } });
    applyUpdate({ match: { left: { hand: [card('Stupefy')] } } });
    assert.deepEqual(tally('left'), { Stupefy: 1 });
    // Played to the board: off the hand, still out of the deck.
    applyUpdate({ match: { left: { hand: [] } } });
    assert.deepEqual(tally('left'), { Stupefy: 1 });
    // A second copy drawn while the first is on the board.
    applyUpdate({ match: { left: { hand: [card('Stupefy')] } } });
    assert.deepEqual(tally('left'), { Stupefy: 2 });
    // Marking a card played changes nothing.
    applyUpdate({ match: { left: { hand: [card('Stupefy', { played: true })] } } });
    assert.deepEqual(tally('left'), { Stupefy: 2 });
  });

  it('tells a card dying off the board, a discard and a burn apart', () => {
    applyUpdate({ match: { left: { hand: [], trash: [], drawn: [] } } });
    applyUpdate({ match: { left: { hand: [card('Unit'), card('Spell')] } } });
    assert.deepEqual(tally('left'), { Unit: 1, Spell: 1 });
    // The unit is played (off the hand) and later dies: it was out already.
    applyUpdate({ match: { left: { hand: [card('Spell')] } } });
    applyUpdate({ match: { left: { trash: [card('Unit')] } } });
    assert.deepEqual(tally('left'), { Unit: 1, Spell: 1 });
    // The spell is discarded: hand to trash in one edit.
    applyUpdate({ match: { left: { hand: [], trash: [card('Unit'), card('Spell')] } } });
    assert.deepEqual(tally('left'), { Unit: 1, Spell: 1 });
    // Two cards burned off the top of the deck: straight to the trash.
    applyUpdate({ match: { left: { trash: [card('Unit'), card('Spell'), card('Unit'), card('Fresh')] } } });
    assert.deepEqual(tally('left'), { Unit: 2, Spell: 1, Fresh: 1 });
  });

  it('keeps the banished cards, without Flow, and counts them out of the deck', () => {
    applyUpdate({ match: { left: { hand: [], trash: [], banished: [], drawn: [] } } });
    applyUpdate({ match: { left: { trash: [card('Brittle Steel', { flow: { energy: 4, power: 1, domain: 'Fury' } })] } } });
    assert.deepEqual(tally('left'), { 'Brittle Steel': 1 }, 'burned straight into the trash');
    // Played from the trash for its Flow cost, then banished: one edit, a move.
    applyUpdate({ match: { left: { trash: [], banished: [card('Brittle Steel', { flow: { energy: 4, power: 1, domain: 'Fury' } })] } } });
    const left = getState().preview.match.left;
    assert.deepEqual(left.banished.map((c) => [c.cardName, c.flow]), [['Brittle Steel', null]], 'nothing plays a card out of banishment');
    assert.deepEqual(tally('left'), { 'Brittle Steel': 1 });
    // A card banished straight off the deck counts; one banished off the
    // board after it was drawn does not count again.
    applyUpdate({ match: { left: { hand: [card('Unit')] } } });
    applyUpdate({ match: { left: { hand: [] } } });
    applyUpdate({ match: { left: { banished: [card('Brittle Steel'), card('Unit'), card('Fresh')] } } });
    assert.deepEqual(tally('left'), { 'Brittle Steel': 1, Unit: 1, Fresh: 1 });
    applyUpdate({ match: { left: { banished: Array.from({ length: 70 }, (_, i) => card(`B${i}`)), drawn: [] } } });
    assert.equal(getState().preview.match.left.banished.length, 60);
    assert.equal(getState().preview.match.left.banished[0].cardName, 'B10', 'the oldest go first');
    applyUpdate({ match: { left: { banished: [null, 'junk', { cardName: '' }], drawn: [] } } });
    assert.deepEqual(getState().preview.match.left.banished, []);
  });

  it('takes a tally that comes with the patch as it is', () => {
    applyUpdate({ match: { left: { hand: [card('A'), card('B')], drawn: [{ cardName: 'Z', n: 2 }, { cardName: 'Z', n: 1 }, { cardName: 'Q', n: 0 }, { n: 1 }] } } });
    assert.deepEqual(tally('left'), { Z: 3 });
    applyUpdate({ match: { left: { drawn: [{ cardName: 'Big', n: 99 }] } } });
    assert.deepEqual(tally('left'), { Big: 12 });
  });

  it('keeps a live deck with its counts', () => {
    applyUpdate({ match: { right: { deckLeft: [{ cardId: 'A-1', cardName: 'Alpha', energy: 2, left: 3 }, { cardName: 'Beta', left: 40 }, { cardName: '' }] } } });
    const d = getState().preview.match.right.deckLeft;
    assert.deepEqual(d.map((c) => [c.cardName, c.left, c.energy]), [['Alpha', 3, 2], ['Beta', 12, null]]);
    applyUpdate({ match: { right: { deckLeft: [] } } });
  });

  it('sends a resolved spell to the trash and leaves a unit on the board', () => {
    applyUpdate({ match: { left: { hand: [], trash: [], drawn: [] }, right: { hand: [], trash: [], drawn: [] } } });
    applyUpdate({ match: {
      left: { handCount: 2, hand: [card('Not So Fast', { cardId: 'SFD-045', kind: 'reaction', energy: 2 }), card('Yasuo', { cardId: 'OGN-205', kind: 'champion' })] },
      right: { handCount: 1, hand: [card('Smite', { cardId: 'UNL-007', kind: 'action' })] },
    } });
    applyUpdate({ action: 'chain', op: 'open', battlefield: 'Somewhere' });
    applyUpdate({ action: 'chain', op: 'play', side: 'left', index: 1 });
    applyUpdate({ action: 'chain', op: 'resolve' });
    assert.deepEqual(getState().preview.match.left.trash, [], 'a champion resolves onto the board');
    applyUpdate({ action: 'chain', op: 'play', side: 'left', index: 0 });
    applyUpdate({ action: 'chain', op: 'play', side: 'right', index: 0 });
    applyUpdate({ action: 'chain', op: 'resolve' });
    for (const bank of ['preview', 'program']) {
      assert.deepEqual(getState()[bank].match.right.trash.map((c) => c.cardName), ['Smite'], `${bank}: the top resolves into its owner's trash`);
    }
    applyUpdate({ action: 'chain', op: 'close' });
    const left = getState().preview.match.left;
    assert.deepEqual(left.trash.map((c) => [c.cardName, c.energy]), [['Not So Fast', 2]], 'closing resolves the rest');
    assert.equal(left.hand.length, 0);
    assert.deepEqual(tally('left'), { 'Not So Fast': 1, Yasuo: 1 }, 'the chain never touches the tally');
  });

  it('whitelists the odds and trash graphics', () => {
    const bank = buildBank({});
    assert.deepEqual(bank.scenes.odds, { visible: false, side: 'left', draws: 1, rows: 10, art: true });
    assert.deepEqual(bank.scenes.trash, { visible: false, side: 'left', art: true, flowFirst: true, banished: true });
    assert.deepEqual(bank.match.left.banished, []);
    assert.deepEqual(bank.match.left.trash, []);
    applyUpdate({ scenes: { odds: { visible: true, side: 'both', draws: 3, rows: 12, art: false, extra: 1 }, trash: { visible: true, side: 'right', art: false, flowFirst: false, banished: false } } });
    let sc = getState().preview.scenes;
    assert.deepEqual(sc.odds, { visible: true, side: 'both', draws: 3, rows: 12, art: false });
    assert.deepEqual(sc.trash, { visible: true, side: 'right', art: false, flowFirst: false, banished: false });
    applyUpdate({ scenes: { odds: { side: 'middle', draws: 99, rows: 7 }, trash: { side: 'up' } } });
    sc = getState().preview.scenes;
    assert.equal(sc.odds.side, 'both');
    assert.equal(sc.odds.draws, 5);
    assert.equal(sc.odds.rows, 12, 'rows only takes the listed choices');
    assert.equal(sc.trash.side, 'right');
    applyUpdate({ action: 'take' });
    applyUpdate({ action: 'clear' });
    assert.equal(getState().program.scenes.odds.visible, false);
    assert.equal(getState().program.scenes.trash.visible, false);
  });
});

describe('a RiftAtlas game fills the trash and the deck', () => {
  const FRAMES = JSON.parse(readFileSync(new URL('./fixtures/riftatlas-series.json', import.meta.url), 'utf8'));
  const CARDS = [
    { cardId: 'OGN-043', cardName: 'Charm', energy: 1, domains: ['Calm'] },
    { cardId: 'UNL-118', cardName: 'Elder Dragon', energy: 8, domains: ['Fury'] },
  ];
  const legendOf = ({ name }) => ({ legend: name, legendSlug: '', legendCardId: '' });

  it('writes each side\'s trash, every card left in its deck and the copies gone', () => {
    const feed = createFeed();
    for (const f of FRAMES) ingestFrame(feed, f.msg, { room: f.room, now: f.at });
    const v = gameView(feed);
    const { patch } = livePatch(v, buildBank({}), { resolveCard: makeCardResolver(CARDS), legendOf });
    const left = patch.match.left;
    const p = v.players[0];
    assert.deepEqual(left.trash.map((c) => c.cardName), p.trash.map((c) => c.name));
    assert.deepEqual(left.banished.map((c) => c.cardName), p.banished.map((c) => c.name), 'the banished cards come along too');
    assert.equal(left.trash[0].cardId, 'OGN-043', 'resolved against the index where it can be');
    assert.equal(left.deckLeft.reduce((t, c) => t + c.left, 0), p.deck.left);
    assert.equal(left.drawn.reduce((t, d) => t + d.n, 0), p.deck.total - p.deck.left);
    // Into the store: the odds read the live deck, exact.
    applyUpdate({ action: 'live', match: patch.match });
    const side = getState().program.match.left;
    const pool = drawPool(side, null);
    assert.equal(pool.source, 'live');
    assert.equal(pool.total, p.deck.left);
    assert.equal(poolLine(pool, side), `${p.deck.left} cards in deck`);
  });
});
