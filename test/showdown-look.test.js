// The Sideways Showdown round (2026-09-19): the glowing-arrows ground from
// HEAD2HEAD-PREPPED.psd as a background any graphic can wear, and the VS
// head to head built from the same PSD.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BG_IMAGES, BG_KINDS, DESIGNED, LOOK_SCENES, SCENE_LABELS, cleanLookPatch, emptyLook, emptySceneLook, lookVars, resolveLook,
} from '../web/shared/look.js';
import { SCENE_SOURCES } from '../web/shared/sources.js';
import { TILES } from '../web/shared/looktiles.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

const theme = () => ({
  accentA: '#11b6fb', accentB: '#1bef19', font: '', logo: '',
  look: emptyLook(),
  scenes: Object.fromEntries(LOOK_SCENES.map((k) => [k, emptySceneLook()])),
});

let applyUpdate;
let getState;
before(async () => {
  process.env.SIDEWAYS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'ss-showdown-test-'));
  ({ applyUpdate, getState } = await import('../server/state.js'));
});

describe('the glowing arrows background', () => {
  it('is a background kind the look accepts and paints from the baked plate', async () => {
    assert.ok(BG_KINDS.includes('arrows'));
    const look = emptyLook();
    cleanLookPatch(look, { background: { kind: 'arrows' } });
    assert.equal(look.background.kind, 'arrows');
    const t = theme();
    t.look.background.kind = 'arrows';
    assert.equal(lookVars(resolveLook(t, 'igodual'))['--ss-bg-image'], `url(${BG_IMAGES.arrows})`);
    // The file the look points at ships in web/.
    assert.ok((await stat(path.join(WEB, BG_IMAGES.arrows))).size > 50_000);
    // The plate photo still paints the plate.
    assert.equal(lookVars(resolveLook(theme(), 'decklist'))['--ss-bg-image'], 'url(/assets/decklist/background.jpg)');
  });

  it('is the designed ground of the VS card, the slate, the bracket and the standings', () => {
    for (const scene of ['vscard', 'slate', 'bracket', 'standings']) {
      assert.equal(resolveLook(theme(), scene).background.kind, 'arrows', scene);
    }
    // Darkened where small type sits over an arrow; the VS card as designed.
    assert.equal(DESIGNED.vscard.background.dim, 0);
    assert.ok(DESIGNED.slate.background.dim > 0 && DESIGNED.bracket.background.dim > 0);
    // A graphic's own look can still take it off.
    const t = theme();
    t.scenes.standings.enabled = true;
    t.scenes.standings.background.kind = 'gradient';
    assert.equal(resolveLook(t, 'standings').background.kind, 'gradient');
  });
});

describe('the VS head to head', () => {
  it('is a graphic with a label, a source, a look-builder tile and its VS glyph', async () => {
    assert.ok(LOOK_SCENES.includes('vscard'));
    assert.equal(SCENE_LABELS.vscard, 'Head to head, VS');
    assert.ok(SCENE_SOURCES.some((s) => s.key === 'vscard' && s.path === '/scenes/vscard/?transparent=1'));
    assert.ok(TILES.some((t) => t.scene === 'vscard'));
    for (const file of ['scenes/vscard/index.html', 'scenes/vscard/scene.js', 'scenes/vscard/scene.css', 'scenes/vscard/vs.webp']) {
      assert.ok((await stat(path.join(WEB, file))).size > 0, file);
    }
  });

  it('starts off, whitelists its switch and airs through TAKE', () => {
    assert.deepEqual(getState().preview.scenes.vscard, { visible: false });
    applyUpdate({ scenes: { vscard: { visible: true, bogus: 1 } } });
    assert.deepEqual(getState().preview.scenes.vscard, { visible: true });
    assert.equal(getState().program.scenes.vscard.visible, false);
    applyUpdate({ action: 'take' });
    assert.equal(getState().program.scenes.vscard.visible, true);
  });
});
