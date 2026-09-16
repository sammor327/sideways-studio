import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let applyUpdate;
let getState;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-cardrow-test-'));
  ({ applyUpdate, getState } = await import('../server/state.js'));
});

const card = (id, name, type = 'Unit') => ({ cardId: id, cardName: name, cardType: type });

describe('card row', () => {
  it('starts with four empty slots and stays off without a card', () => {
    const row = getState().preview.scenes.cardrow;
    assert.equal(row.cards.length, 4);
    assert.deepEqual(row.cards[0], { cardId: '', cardName: '', cardType: '' });
    assert.equal(row.focus, -1);
    applyUpdate({ scenes: { cardrow: { visible: true } } });
    assert.equal(getState().preview.scenes.cardrow.visible, false, 'a row with no card can never be on');
  });

  it('patches slots by position, null empties one, and a bad id drops the slot', () => {
    applyUpdate({ scenes: { cardrow: { visible: true, cards: [card('OGN-001', 'Ahri, Alluring', 'Unit'), undefined, card('OGN-003', 'Sunken Temple', 'Battlefield')] } } });
    let row = getState().preview.scenes.cardrow;
    assert.equal(row.visible, true);
    assert.equal(row.cards[0].cardName, 'Ahri, Alluring');
    assert.equal(row.cards[1].cardId, '', 'a hole leaves the slot alone');
    assert.equal(row.cards[2].cardType, 'Battlefield');
    // A slot changes without the others being sent.
    applyUpdate({ scenes: { cardrow: { cards: [undefined, card('OGN-002', 'Stupefy', 'Spell')] } } });
    row = getState().preview.scenes.cardrow;
    assert.equal(row.cards[0].cardId, 'OGN-001');
    assert.equal(row.cards[1].cardId, 'OGN-002');
    // null empties, and a card id outside the shape is dropped whole.
    applyUpdate({ scenes: { cardrow: { cards: [null, undefined, { cardId: '../x', cardName: 'Bad' }] } } });
    row = getState().preview.scenes.cardrow;
    assert.deepEqual(row.cards[0], { cardId: '', cardName: '', cardType: '' });
    assert.deepEqual(row.cards[2], { cardId: '', cardName: '', cardType: '' });
    assert.equal(row.cards.length, 4, 'a fifth card never appears');
  });

  it('switches off once the last card is emptied', () => {
    applyUpdate({ scenes: { cardrow: { cards: [null, null, null, null] } } });
    const row = getState().preview.scenes.cardrow;
    assert.equal(row.visible, false);
  });

  it('highlights a slot as a cue in both banks, clamped to the four slots', () => {
    applyUpdate({ scenes: { cardrow: { visible: true, cards: [card('OGN-001', 'Ahri, Alluring')] } } });
    applyUpdate({ action: 'take' });
    let r = applyUpdate({ action: 'focus', scene: 'cardrow', slot: 2 });
    assert.equal(r.ok, true);
    assert.equal(getState().preview.scenes.cardrow.focus, 2);
    assert.equal(getState().program.scenes.cardrow.focus, 2);
    applyUpdate({ action: 'focus', scene: 'cardrow', slot: 9 });
    assert.equal(getState().program.scenes.cardrow.focus, 3);
    applyUpdate({ action: 'focus', scene: 'cardrow', slot: -5 });
    assert.equal(getState().program.scenes.cardrow.focus, -1);
    r = applyUpdate({ action: 'focus', scene: 'scorebug' });
    assert.equal(r.ok, false);
  });
});

describe('decklist highlight', () => {
  it('is a cue in both banks, cleaned as a card id', () => {
    applyUpdate({ scenes: { decklist: { list: 'Legend: Ahri\nMain:\n3 Stupefy' } } });
    assert.equal(getState().preview.scenes.decklist.focus, '');
    applyUpdate({ action: 'focus', scene: 'decklist', cardId: 'OGN-002' });
    assert.equal(getState().preview.scenes.decklist.focus, 'OGN-002');
    assert.equal(getState().program.scenes.decklist.focus, 'OGN-002');
    applyUpdate({ action: 'focus', scene: 'decklist', cardId: '<script>' });
    assert.equal(getState().program.scenes.decklist.focus, '');
    // A bank patch may clear it too (the panel's Clear button does).
    applyUpdate({ action: 'focus', scene: 'decklist', cardId: 'OGN-002' });
    applyUpdate({ scenes: { decklist: { focus: '' } } });
    assert.equal(getState().preview.scenes.decklist.focus, '');
    assert.equal(getState().program.scenes.decklist.focus, 'OGN-002', 'a preview edit leaves program alone');
  });
});

describe('the two clears', () => {
  it('clearpreview empties preview and leaves program on air', () => {
    applyUpdate({ scenes: { scorebug: { visible: true }, cardrow: { visible: true, cards: [card('OGN-001', 'Ahri, Alluring')] } } });
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.scorebug.visible, true);
    const r = applyUpdate({ action: 'clearpreview' });
    assert.equal(r.ok, true);
    const s = getState();
    assert.equal(s.preview.scenes.scorebug.visible, false);
    assert.equal(s.preview.scenes.cardrow.visible, false);
    assert.equal(s.preview.scenes.cardrow.cards[0].cardId, 'OGN-001', 'data is kept');
    assert.equal(s.program.scenes.scorebug.visible, true, 'nothing on air changed');
    assert.equal(s.program.scenes.cardrow.visible, true);
  });

  it('clear empties program and leaves preview as it was', () => {
    applyUpdate({ scenes: { scorebug: { visible: true } } });
    applyUpdate({ action: 'clear' });
    const s = getState();
    assert.equal(s.program.scenes.scorebug.visible, false);
    assert.equal(s.program.scenes.cardrow.visible, false);
    assert.equal(s.preview.scenes.scorebug.visible, true);
  });
});
