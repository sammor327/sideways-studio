import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BG_KINDS, DESIGNED, LOOK_SCENES, PRESETS, cleanLookPatch, emptyLook, emptySceneLook, lookVars, mergeLook, resolveLook,
} from '../web/shared/look.js';

const theme = (extra = {}) => ({
  accentA: '#11b6fb', accentB: '#1bef19', font: '', logo: '',
  look: emptyLook(),
  scenes: Object.fromEntries(LOOK_SCENES.map((k) => [k, emptySceneLook()])),
  ...extra,
});

describe('resolveLook', () => {
  it('airs each graphic designed when nothing is set', () => {
    const t = theme();
    for (const scene of LOOK_SCENES) {
      const look = resolveLook(t, scene);
      assert.deepEqual(look.colors, DESIGNED[scene].colors);
      assert.deepEqual(look.background, DESIGNED[scene].background);
      assert.equal(look.accentA, '#11b6fb');
    }
    // The POV keeps its gold and navy, the sidebars their TES grain.
    assert.equal(resolveLook(t, 'pov').colors.trim, '#c99c3e');
    assert.equal(resolveLook(t, 'igo1v1').background.kind, 'shards');
  });

  it('lets the global look recolour one thing and leave the rest designed', () => {
    const t = theme();
    t.look.colors.ink = '#123456';
    const pov = resolveLook(t, 'pov');
    assert.equal(pov.colors.ink, '#123456');
    assert.equal(pov.colors.trim, '#c99c3e');
    assert.equal(resolveLook(t, 'scorebug').colors.ink, '#123456');
  });

  it('applies a scene override only while it is enabled', () => {
    const t = theme();
    t.look.colors.text = '#aaaaaa';
    t.scenes.igodual.colors.text = '#bbbbbb';
    t.scenes.igodual.background.kind = 'gradient';
    assert.equal(resolveLook(t, 'igodual').colors.text, '#aaaaaa');
    t.scenes.igodual.enabled = true;
    assert.equal(resolveLook(t, 'igodual').colors.text, '#bbbbbb');
    assert.equal(resolveLook(t, 'igodual').background.kind, 'gradient');
    // Other scenes are untouched by it.
    assert.equal(resolveLook(t, 'igo1v1').colors.text, '#aaaaaa');
  });

  it('never resolves to an image background with no image', () => {
    const t = theme();
    t.look.background.kind = 'image';
    assert.equal(resolveLook(t, 'igo1v1').background.kind, 'solid');
    t.look.background.image = '/theme/bg/global?v=1';
    assert.equal(resolveLook(t, 'igo1v1').background.kind, 'image');
  });

  it('falls back to the TES accents when the theme carries bad ones', () => {
    const look = resolveLook({ accentA: 'red', accentB: null }, 'scorebug');
    assert.equal(look.accentA, '#11b6fb');
    assert.equal(look.accentB, '#1bef19');
  });
});

describe('cleanLookPatch', () => {
  it('accepts hex, clears on empty, and refuses anything else', () => {
    const look = emptyLook();
    cleanLookPatch(look, { colors: { ink: '#ABCDEF', text: 'white' }, accentA: '#00ff00' });
    assert.equal(look.colors.ink, '#abcdef');
    assert.equal(look.colors.text, '');
    assert.equal(look.accentA, '#00ff00');
    cleanLookPatch(look, { colors: { ink: '' } });
    assert.equal(look.colors.ink, '');
  });

  it('clamps numbers and validates the background kind', () => {
    const look = emptyLook();
    cleanLookPatch(look, { background: { kind: 'plaid', angle: 720, grain: -5, dim: 40.6 } });
    assert.equal(look.background.kind, '');
    assert.equal(look.background.angle, 360);
    assert.equal(look.background.grain, 0);
    assert.equal(look.background.dim, 41);
    for (const kind of BG_KINDS) {
      cleanLookPatch(look, { background: { kind } });
      assert.equal(look.background.kind, kind);
    }
  });

  it('only lets the upload route set an image, and anyone clear it', () => {
    const look = emptyLook();
    cleanLookPatch(look, { background: { image: '/theme/bg/global?v=1' } });
    assert.equal(look.background.image, '');
    cleanLookPatch(look, { background: { image: 'https://evil.example/x.png' } }, { allowImage: true });
    assert.equal(look.background.image, '');
    cleanLookPatch(look, { background: { image: '/theme/bg/global?v=1' } }, { allowImage: true });
    assert.equal(look.background.image, '/theme/bg/global?v=1');
    cleanLookPatch(look, { background: { image: '' } });
    assert.equal(look.background.image, '');
  });

  it('drops unknown keys and keeps the enabled flag to scene looks', () => {
    const scene = emptySceneLook();
    cleanLookPatch(scene, { enabled: 1, nonsense: true, colors: { pink: '#ff00ff' } });
    assert.equal(scene.enabled, true);
    assert.equal('nonsense' in scene, false);
    assert.equal('pink' in scene.colors, false);
    const look = emptyLook();
    cleanLookPatch(look, { enabled: true });
    assert.equal('enabled' in look, false);
  });
});

describe('mergeLook', () => {
  it('layers an older or partial save over the full shape', () => {
    const merged = mergeLook({ colors: { ink: '#101010' }, background: { kind: 'solid', image: '/theme/bg/global?v=2' } });
    assert.equal(merged.colors.ink, '#101010');
    assert.equal(merged.colors.trim, '');
    assert.equal(merged.background.image, '/theme/bg/global?v=2');
    assert.equal(mergeLook(undefined).background.kind, '');
    assert.equal(mergeLook({ enabled: true }, true).enabled, true);
  });
});

describe('lookVars', () => {
  it('turns a resolved look into the custom properties the scenes read', () => {
    const vars = lookVars(resolveLook(theme(), 'igo1v1'));
    assert.equal(vars['--ss-ink'], '#1c1c1c');
    assert.equal(vars['--ss-trim'], '#11b6fb');
    assert.match(vars['--ss-trim-grad'], /^linear-gradient\(135deg, #11b6fb, #1bef19\)$/);
    assert.equal(vars['--ss-bg-image'], 'none');
    assert.equal(vars['--ss-grain'], '0.6');
    assert.equal(vars['--ss-bg-angle'], '160deg');
    const plate = lookVars(resolveLook(theme(), 'decklist'));
    assert.equal(plate['--ss-bg-image'], 'url(/assets/decklist/background.jpg)');
  });

  it('uses a solid trim colour for both the flat and gradient reads', () => {
    const vars = lookVars(resolveLook(theme(), 'pov'));
    assert.equal(vars['--ss-trim'], '#c99c3e');
    assert.equal(vars['--ss-trim-grad'], '#c99c3e');
  });
});

describe('presets', () => {
  it('are valid look patches that the sanitizer keeps whole', () => {
    for (const preset of PRESETS) {
      const look = emptyLook();
      cleanLookPatch(look, preset.look);
      if (preset.look.accentA) assert.equal(look.accentA, preset.look.accentA);
      for (const [k, v] of Object.entries(preset.look.colors || {})) assert.equal(look.colors[k], v);
      for (const [k, v] of Object.entries(preset.look.background || {})) assert.equal(look.background[k], v);
    }
  });
});
