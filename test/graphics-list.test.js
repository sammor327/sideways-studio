// The Graphics list's descriptions and its folds.
//
// 2026-09-20, Sam: "standardize the descriptions for the graphics to be
// directly underneath and to the left of the on/off button", then later the
// same day "the graphic descriptions need to be bumped up to directly
// underneath the title for the graphic". Every graphic in the list carries
// one line saying what it is, and the name and that line now share one cell
// so the line cannot drift away from the name when the row's picture is
// taller than both. This guards the markup, the CSS and the folds, so a
// graphic added later cannot land in the list without its line or outside a
// section.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOK_SCENES } from '../web/shared/look.js';

const PANEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'panel');

// A row is one block at eight spaces of indent, closed at the same indent.
const ROW = /^ {8}<div class="scene-row[^>]*data-scene="([^"]+)">\r?\n([\s\S]*?)^ {8}<\/div>/gm;
const TEXT = /<div class="scene-text">\r?\n\s*<div class="scene-name">([\s\S]*?)<\/div>\r?\n\s*(<p class="scene-note"[^>]*>([\s\S]*?)<\/p>)\r?\n\s*<\/div>/;
const TOGGLE = /<button id="[^"]+" class="scene-toggle">/;

const panelHtml = () => readFile(path.join(PANEL, 'index.html'), 'utf8');

async function rows() {
  const html = await panelHtml();
  const found = [...html.matchAll(ROW)].map(([, scene, body]) => ({ scene, body }));
  assert.ok(found.length > 30, `found ${found.length} graphics, expected the whole list`);
  return found;
}

describe('the graphics list', () => {
  it('gives every graphic a description, in one cell with its name', async () => {
    for (const { scene, body } of await rows()) {
      const cell = body.match(TEXT);
      assert.ok(cell, `${scene} has no name-and-description cell`);
      const text = cell[3].trim();
      assert.ok(text.length > 40, `${scene}'s description is too short to say anything: ${text}`);
      assert.ok(TOGGLE.test(body), `${scene} has no switch`);
    }
  });

  // The row's picture is 70px tall and a line of this copy is 15.5px, so four
  // lines (62px) is the budget that keeps the list reading down the pictures
  // rather than down the text. In the panel's narrowest real column, 183px at
  // a 1920 window, four lines is about 130 characters. The CSS clamp is what
  // actually holds the height; this keeps the copy inside it.
  it('says it in two sentences, short enough to sit beside the picture', async () => {
    for (const { scene, body } of await rows()) {
      const text = body.match(TEXT)[3].replace(/&rsaquo;/g, '›').trim();
      const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
      assert.ok(sentences.length <= 2, `${scene}'s description runs to ${sentences.length} sentences: ${text}`);
      assert.ok(text.length <= 130, `${scene}'s description is ${text.length} characters, over the 130 that fit beside the picture`);
    }
  });

  it('writes them in the house voice, with no em dashes', async () => {
    for (const { scene, body } of await rows()) {
      const text = body.match(TEXT)[3];
      assert.ok(!text.includes('—'), `${scene}'s description uses an em dash`);
      assert.match(text.trim(), /[.?]$/, `${scene}'s description does not end in a full stop`);
    }
  });

  it('keeps the name and its line in the column between the picture and the switch', async () => {
    const css = await readFile(path.join(PANEL, 'panel.css'), 'utf8');
    const cell = css.match(/\.scene-text \{([\s\S]*?)\}/);
    assert.ok(cell, 'no .scene-text rule');
    assert.match(cell[1], /grid-column: 2;/, 'the cell must not span the switch column');
    assert.match(cell[1], /flex-direction: column;/, 'the line must stack under the name');
    // The picture must not span both rows any more: that is what used to
    // push a short line away from its name.
    const thumb = css.match(/\.scene-thumb \{([\s\S]*?)\}/);
    assert.ok(thumb, 'no .scene-thumb rule');
    assert.doesNotMatch(thumb[1], /grid-row: 1 \/ span 2;/, 'the picture must not span the name and the line');
    // And the line is clamped to four lines, so it can never grow past the
    // picture beside it however narrow the panel gets.
    const clamp = css.match(/\.graphics-card \.scene-note \{([\s\S]*?)\}/);
    assert.ok(clamp, 'no .graphics-card .scene-note rule');
    assert.match(clamp[1], /-webkit-line-clamp: 4;/, 'the line must be clamped to four lines');
    assert.match(clamp[1], /overflow: hidden;/, 'the clamp needs overflow hidden to bite');
  });

  it('lists every graphic the look can recolour, each in exactly one section', async () => {
    const html = await panelHtml();
    const sections = [...html.matchAll(/<details class="scene-section[^"]*" data-group="([^"]+)">([\s\S]*?)<\/details>/g)];
    const home = new Map();
    for (const [, group, body] of sections) {
      for (const [, scene] of body.matchAll(/data-scene="([^"]+)"/g)) {
        assert.ok(!home.has(scene), `${scene} is listed twice: ${home.get(scene)} and ${group}`);
        home.set(scene, group);
      }
    }
    for (const key of LOOK_SCENES) assert.ok(home.has(key), `${key} airs but is in no section of the Graphics list`);
    // Favorites is filled at runtime by the star, never in the markup.
    assert.equal([...home.values()].filter((g) => g === 'favorites').length, 0);
  });
});
