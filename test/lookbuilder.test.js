import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LOOK_SCENES } from '../web/shared/look.js';
import { SLATE_MODES } from '../server/state.js';
import { TILES, TILE_GROUPS, tileBank, tileFor } from '../web/shared/looktiles.js';

let sampleBank;
let buildBank;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-lookbuilder-test-'));
  ({ sampleBank } = await import('../server/sample.js'));
  ({ buildBank } = await import('../server/state.js'));
});

describe('look builder tiles', () => {
  it('lays out every graphic the look reaches, each tile once, in a known group', () => {
    const keys = TILES.map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length);
    const groups = new Set(TILE_GROUPS.map((g) => g.key));
    for (const t of TILES) {
      assert.ok(groups.has(t.group), `${t.key} is in an unknown group`);
      assert.ok(LOOK_SCENES.includes(t.scene), `${t.key} draws a scene the look model does not know`);
    }
    for (const scene of LOOK_SCENES) {
      assert.ok(TILES.some((t) => t.scene === scene), `${scene} has no tile`);
    }
  });

  it('tells apart the tiles that share a graphic', () => {
    // One of them may be the plain graphic with no second line.
    const seen = {};
    for (const t of TILES) {
      const variants = (seen[t.scene] ||= new Set());
      assert.ok(!variants.has(t.variant || ''), `${t.key} repeats another ${t.scene} tile's variant`);
      variants.add(t.variant || '');
    }
    for (const t of TILES.filter((x) => x.scene === 'slate')) {
      assert.ok(SLATE_MODES.includes(t.vary.mode), `${t.key} sets a slate mode the store refuses`);
    }
  });

  it('switches on only the tile\'s own graphic, in its variant, without touching the bank', () => {
    const bank = buildBank({ scenes: { igodual: { visible: true, hand: false } } });
    bank.scenes.scorebug.visible = true;
    const before = JSON.stringify(bank);
    const out = tileBank(bank, 'igodual-hand', 'igodual');
    assert.equal(JSON.stringify(bank), before);
    assert.equal(out.scenes.igodual.visible, true);
    assert.equal(out.scenes.igodual.hand, true);
    for (const [key, sc] of Object.entries(out.scenes)) {
      if (key !== 'igodual') assert.equal(sc.visible, false, `${key} left on`);
    }
  });

  it('ignores a variant meant for another graphic and an unknown tile', () => {
    const bank = buildBank({});
    const wrong = tileBank(bank, 'slate-brb', 'lowerthird');
    assert.equal(wrong.scenes.lowerthird.visible, true);
    assert.equal(wrong.scenes.lowerthird.mode, 'casters');
    assert.equal(wrong.scenes.slate.mode, 'upnext');
    const none = tileBank(bank, 'nope', 'scorebug');
    assert.equal(none.scenes.scorebug.visible, true);
    assert.equal(tileFor('nope'), null);
  });
});

describe('sample match', () => {
  it('fills every scene the store knows and leaves them all off', () => {
    const bank = sampleBank();
    const fresh = buildBank({});
    assert.deepEqual(Object.keys(bank.scenes).sort(), Object.keys(fresh.scenes).sort());
    for (const [key, sc] of Object.entries(bank.scenes)) assert.equal(sc.visible, false, `${key} is on`);
    assert.equal(bank.match.left.name, 'Mara Quill');
    assert.equal(bank.match.right.name, 'Theo Brandt');
    assert.ok(bank.scenes.decklist.list.includes('Legend: Diana, Scorn of the Moon'));
    assert.equal(bank.event.bracket.players.length, 8);
    assert.equal(bank.event.standings.rows.length, 16);
    assert.ok(bank.match.showdown.active);
    assert.equal(bank.match.showdown.chain.length, 2);
    assert.ok(bank.scenes.sponsor.items.length > 0);
  });

  it('prints names without art when the card index has not loaded', () => {
    // No card database in a test run: nothing resolves, nothing fails.
    const bank = sampleBank();
    assert.equal(bank.scenes.cardpopup.card.cardId, '');
    assert.equal(bank.scenes.cardpopup.card.cardName, 'Moonfall');
    assert.equal(bank.match.left.hand.length, 5);
    assert.ok(bank.match.left.hand.every((c) => c.cardName));
  });

  it('hands each caller its own copy', () => {
    const a = sampleBank();
    a.match.left.name = 'Changed';
    assert.equal(sampleBank().match.left.name, 'Mara Quill');
  });
});
