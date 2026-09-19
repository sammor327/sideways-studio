import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cardDockHost, dockCard, rowsDockCard } from '../web/shared/carddock.js';

// Banks come from the store's own defaults and whitelist, so the rule is
// tested against the shape the scenes really receive.
let buildBank;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-carddock-test-'));
  ({ buildBank } = await import('../server/state.js'));
});

const CARD = { cardId: 'OGN-030', cardName: 'Jinx, Demolitionist', cardType: 'Champion Unit' };
const withPopup = (scenes, match) => buildBank({ scenes: { cardpopup: { visible: true, card: CARD }, ...scenes }, ...(match ? { match } : {}) });
const HANDS = { left: { hand: [{ cardId: 'OGN-076', cardName: 'Yasuo, Remorseful' }] }, right: { handCount: 5 } };

describe('where the card popup\'s card airs', () => {
  it('flies on its own while no overlay docks it', () => {
    assert.equal(cardDockHost(withPopup({})), '');
    assert.equal(cardDockHost(withPopup({ igo1v1: { visible: true } })), '', 'the 1v1 overlay has no dock');
  });

  it('docks into the rows column by default, and not with the switch off', () => {
    assert.equal(cardDockHost(withPopup({ igorows: { visible: true } })), 'igorows');
    assert.equal(cardDockHost(withPopup({ igorows: { visible: true, cardDock: false } })), '');
    assert.equal(cardDockHost(withPopup({ igorows: { visible: false } })), '', 'a rows overlay that is off docks nothing');
  });

  it('keeps the rows dock through listed hands: the card takes the middle from them', () => {
    const bank = withPopup({ igorows: { visible: true, hand: true } }, HANDS);
    assert.equal(cardDockHost(bank), 'igorows');
    assert.deepEqual(rowsDockCard(bank), bank.scenes.cardpopup.card);
  });

  it('docks into the dual columns\' slot, player 2\'s listed hand included', () => {
    assert.equal(cardDockHost(withPopup({ igodual: { visible: true } })), 'igodual');
    assert.equal(cardDockHost(withPopup({ igodual: { visible: true, cardSlot: false } })), '');
    const handUp = withPopup({ igodual: { visible: true, hand: true } }, HANDS);
    assert.equal(cardDockHost(handUp), 'igodual', 'the card takes the slot from the hand, which slides out for it');
    assert.deepEqual(dockCard(handUp, 'igodual'), handUp.scenes.cardpopup.card);
  });

  it('docks into the portrait pillars\' well while it is on', () => {
    assert.equal(cardDockHost(withPopup({ igoportrait: { visible: true } })), 'igoportrait');
    assert.equal(cardDockHost(withPopup({ igoportrait: { visible: true, cardWell: false } })), '');
  });
});

describe('the card an overlay\'s dock shows', () => {
  it('is the popup\'s card while the popup is on', () => {
    assert.deepEqual(rowsDockCard(withPopup({})), withPopup({}).scenes.cardpopup.card);
    assert.equal(rowsDockCard(buildBank({ scenes: { cardpopup: { card: CARD } } })), null, 'a staged card that is not on stays out');
    assert.equal(rowsDockCard(withPopup({ igorows: { cardDock: false } })), null);
    assert.equal(dockCard(withPopup({ igodual: { cardSlot: false } }), 'igodual'), null);
  });

  it('is ready before the overlay comes on, so it arrives with the card in place', () => {
    const bank = withPopup({ igorows: { visible: false }, igodual: { visible: false } });
    assert.equal(rowsDockCard(bank).cardId, 'OGN-030');
    assert.equal(dockCard(bank, 'igodual').cardId, 'OGN-030');
    assert.equal(cardDockHost(bank), '', 'meanwhile the popup flies');
  });

  it('never reads a bank without the shape, or an overlay with no dock', () => {
    assert.equal(rowsDockCard(null), null);
    assert.equal(rowsDockCard({ scenes: {} }), null);
    assert.equal(dockCard(withPopup({}), 'igo1v1'), null);
    assert.equal(cardDockHost({}), '');
  });
});
