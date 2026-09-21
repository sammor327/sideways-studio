// What the middle of the rows overlay's column holds (2026-09-20), and which
// graphics stand down for it: the plan in web/shared/rowsdock.js, read
// against banks the store itself built, so the rule is tested on the shape
// the scenes really receive.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rowsDocks, rowsPlan, spotNow, spotUntil } from '../web/shared/rowsdock.js';
import { sheetSlots } from '../web/shared/sidesheets.js';

let buildBank;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-rowsdock-test-'));
  ({ buildBank } = await import('../server/state.js'));
});

const CARD = { cardId: 'OGN-030', cardName: 'Jinx, Demolitionist', cardType: 'Champion Unit' };
const HANDS = {
  left: { hand: [{ cardId: 'OGN-076', cardName: 'Yasuo, Remorseful' }] },
  right: { handCount: 5 },
};
const DECKS = { left: { deckList: '3 Stupefy\n37 Filler' }, right: { deckList: '40 Filler' } };
const TRASH = { left: { trash: [{ cardId: 'OGN-011', cardName: 'Stupefy' }] }, right: { trash: [] } };

// Match patches laid over each other a side at a time, so a trash never
// takes a listed hand's place in the patch itself.
const match = (...parts) => parts.reduce((out, part) => {
  for (const [key, val] of Object.entries(part)) {
    out[key] = key === 'left' || key === 'right' ? { ...out[key], ...val } : val;
  }
  return out;
}, {});

// The spot cue writes the scene's spot; a bank patch never does, so the tests
// stage one the way the cue leaves it.
function withSpot(bank, at = Date.now(), extra = {}) {
  bank.scenes.sidespot.spot = {
    id: 3, side: 'right', cardId: 'SFD-136', cardName: 'Hard Bargain', player: 'Theo Brandt', game: 2, turn: 5, at, ...extra,
  };
  return bank;
}

const rows = (cfg = {}) => ({ igorows: { visible: true, ...cfg } });

describe('what the rows column holds', () => {
  it('holds the event logo with nothing else up, and the hands once they are listed', () => {
    assert.equal(rowsPlan(buildBank({ scenes: rows() })).middle, '');
    const hands = rowsPlan(buildBank({ scenes: rows(), match: HANDS }));
    assert.equal(hands.middle, 'lists');
    assert.deepEqual(hands.halves, { left: 'hand', right: 'hand' });
    const off = rowsPlan(buildBank({ scenes: rows({ hand: false }), match: HANDS }));
    assert.equal(off.middle, '', 'cards in hand switched off leaves the middle to the logo');
  });

  it('gives a player their trash in the half their hand lists in', () => {
    const bank = buildBank({ scenes: { ...rows(), trash: { visible: true, side: 'left' } }, match: match(HANDS, TRASH) });
    const plan = rowsPlan(bank);
    assert.equal(plan.middle, 'lists');
    assert.deepEqual(plan.halves, { left: 'trash', right: 'hand' });
    assert.deepEqual(rowsDocks(bank).trash, ['left'], 'the trash graphic stands down for player 1 only');
  });

  it('gives a player their odds to draw, and only with a deck to read', () => {
    const on = buildBank({ scenes: { ...rows(), odds: { visible: true, side: 'both' } }, match: match(HANDS, DECKS) });
    assert.deepEqual(rowsPlan(on).halves, { left: 'odds', right: 'odds' });
    assert.deepEqual(rowsDocks(on).odds, ['left', 'right']);
    const noDeck = buildBank({ scenes: { ...rows(), odds: { visible: true, side: 'both' } }, match: HANDS });
    assert.deepEqual(rowsPlan(noDeck).halves, { left: 'hand', right: 'hand' }, 'no deck, no odds: the hand keeps the half');
    assert.deepEqual(rowsDocks(noDeck).odds, []);
    // A live game counts the deck itself, with no list typed.
    const live = buildBank({ scenes: { ...rows(), odds: { visible: true, side: 'left' } }, match: { left: { deckLeft: [{ cardName: 'Stupefy', left: 3 }] } } });
    assert.equal(rowsPlan(live).halves.left, 'odds');
  });

  it('gives one player one sheet: the trash takes the half, the odds fly in over the game', () => {
    const bank = buildBank({
      scenes: { ...rows(), trash: { visible: true, side: 'left' }, odds: { visible: true, side: 'both' } },
      match: match(HANDS, DECKS, TRASH),
    });
    assert.deepEqual(rowsPlan(bank).halves, { left: 'trash', right: 'odds' });
    const docks = rowsDocks(bank);
    assert.deepEqual(docks.trash, ['left']);
    assert.deepEqual(docks.odds, ['right'], 'player 1\'s odds were not docked, so that sheet still airs');
  });

  it('answers to each dock\'s own switch', () => {
    const fields = match(HANDS, DECKS, TRASH);
    const scenes = { trash: { visible: true, side: 'left' }, odds: { visible: true, side: 'right' } };
    const off = buildBank({ scenes: { ...rows({ trashDock: false, oddsDock: false }), ...scenes }, match: fields });
    assert.deepEqual(rowsPlan(off).halves, { left: 'hand', right: 'hand' });
    assert.deepEqual(rowsDocks(off), { trash: [], odds: [], spot: false });
    const on = buildBank({ scenes: { ...rows(), ...scenes }, match: fields });
    assert.deepEqual(rowsPlan(on).halves, { left: 'trash', right: 'odds' }, 'both docks are on unless switched off');
  });

  it('holds a spotted sideboard card for its hold, then lets it go', () => {
    const now = Date.now();
    const bank = withSpot(buildBank({ scenes: { ...rows(), sidespot: { visible: true, hold: 8 } }, match: HANDS }), now);
    assert.equal(rowsPlan(bank, { now }).middle, 'spot');
    assert.equal(rowsDocks(bank, { now }).spot, true);
    assert.equal(spotUntil(bank.scenes.sidespot), now + 8000);
    const later = { now: now + 8001 };
    assert.equal(rowsPlan(bank, later).middle, 'lists', 'the hold runs out and the hands come back');
    assert.equal(rowsDocks(bank, later).spot, false, 'and the graphic has its card back');
    // A still of the graphic keeps the card up whatever the clock says.
    assert.equal(spotNow(bank, { ...later, pinned: true }).id, 3);
    const noDock = withSpot(buildBank({ scenes: { ...rows({ spotDock: false }), sidespot: { visible: true } } }), now);
    assert.equal(rowsPlan(noDock, { now }).middle, '');
    assert.equal(rowsDocks(noDock, { now }).spot, false);
  });

  it('takes them in order: the popup\'s card, the spot, the showdown, then the lists', () => {
    const now = Date.now();
    const base = {
      scenes: {
        ...rows(),
        cardpopup: { visible: true, card: CARD },
        sidespot: { visible: true },
        trash: { visible: true, side: 'both' },
      },
      match: match(HANDS, TRASH, { showdown: { active: true } }),
    };
    const all = withSpot(buildBank(base), now);
    assert.equal(rowsPlan(all, { now }).middle, 'card');
    assert.deepEqual(rowsDocks(all, { now }), { trash: [], odds: [], spot: false },
      'everything the column is not showing flies in over the game as it always has');

    const noCard = withSpot(buildBank({ ...base, scenes: { ...base.scenes, cardpopup: { visible: false, card: CARD } } }), now);
    assert.equal(rowsPlan(noCard, { now }).middle, 'spot');
    const noSpot = buildBank({ ...base, scenes: { ...base.scenes, cardpopup: { visible: false }, sidespot: { visible: false } } });
    assert.equal(rowsPlan(noSpot, { now }).middle, 'showdown');
    assert.deepEqual(rowsDocks(noSpot, { now }).trash, [], 'the showdown has the middle, so the trash keeps its own sheets');
    const noShowdown = buildBank({ ...base, scenes: { ...base.scenes, cardpopup: { visible: false }, sidespot: { visible: false } }, match: match(HANDS, TRASH) });
    assert.equal(rowsPlan(noShowdown, { now }).middle, 'lists');
    assert.deepEqual(rowsDocks(noShowdown, { now }).trash, ['left', 'right']);
  });

  it('fills the column before the overlay comes on, and docks nothing while it is off', () => {
    const bank = buildBank({
      scenes: { igorows: { visible: false }, trash: { visible: true, side: 'left' }, cardpopup: { visible: true, card: CARD } },
      match: match(HANDS, TRASH),
    });
    assert.equal(rowsPlan(bank).middle, 'card', 'the column is already holding the card when it comes on');
    assert.equal(rowsPlan(bank).live, false);
    assert.deepEqual(rowsDocks(bank), { trash: [], odds: [], spot: false }, 'an overlay that is off stands nothing down');
  });

  it('never reads a bank without the shape', () => {
    assert.equal(rowsPlan(null).middle, '');
    assert.deepEqual(rowsPlan({}).halves, { left: '', right: '' });
    assert.deepEqual(rowsDocks({ scenes: {} }), { trash: [], odds: [], spot: false });
    assert.equal(spotNow(null), null);
    assert.equal(spotUntil(null), 0);
    assert.equal(spotUntil({ spot: { at: 0 } }), 0);
  });
});

describe('the sheets on the game window, beside a docked one', () => {
  it('leaves no gap for a side the column has taken', () => {
    const bank = buildBank({
      scenes: { ...rows(), trash: { visible: true, side: 'both' }, odds: { visible: true, side: 'both' } },
      match: match(DECKS, TRASH),
    });
    const docks = rowsDocks(bank);
    assert.deepEqual(docks.trash, ['left', 'right'], 'the column lists both players\' trash');
    // Four sheets without the dock; the two odds sheets alone with it, each
    // against its own edge rather than one slot in.
    assert.equal(sheetSlots(bank, 'odds').count, 4);
    const slots = sheetSlots(bank, 'odds', docks);
    assert.equal(slots.count, 2);
    assert.equal(slots.slot('odds', 'left'), 0);
    assert.equal(slots.slot('odds', 'right'), 0);
  });
});
