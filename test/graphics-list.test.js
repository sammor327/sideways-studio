// The Graphics list's descriptions (2026-09-20, Sam: "standardize the
// descriptions for the graphics to be directly underneath and to the left of
// the on/off button"). Every graphic in the list carries one line saying what
// it is, in the same place on every row: after the switch in the markup, in
// the name's own column in the CSS. This guards both, so a graphic added later
// cannot land in the list without its line.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PANEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'panel');

// A row is one block at eight spaces of indent, closed at the same indent.
const ROW = /^ {8}<div class="scene-row[^>]*data-scene="([^"]+)">\r?\n([\s\S]*?)^ {8}<\/div>/gm;
const NOTE = /<p class="scene-note"[^>]*>([\s\S]*?)<\/p>/;
const TOGGLE = /<button id="[^"]+" class="scene-toggle">/;

async function rows() {
  const html = await readFile(path.join(PANEL, 'index.html'), 'utf8');
  const found = [...html.matchAll(ROW)].map(([, scene, body]) => ({ scene, body }));
  assert.ok(found.length > 30, `found ${found.length} graphics, expected the whole list`);
  return found;
}

describe('the graphics list', () => {
  it('gives every graphic a description, under its name and before its switch in the markup', async () => {
    for (const { scene, body } of await rows()) {
      const note = body.match(NOTE);
      assert.ok(note, `${scene} has no description`);
      const text = note[1].trim();
      assert.ok(text.length > 40, `${scene}'s description is too short to say anything: ${text}`);
      const toggle = body.match(TOGGLE);
      assert.ok(toggle, `${scene} has no switch`);
      assert.ok(toggle.index < note.index, `${scene}'s description comes before its switch`);
    }
  });

  it('writes them in the house voice, with no em dashes', async () => {
    for (const { scene, body } of await rows()) {
      const text = body.match(NOTE)[1];
      assert.ok(!text.includes('—'), `${scene}'s description uses an em dash`);
      assert.match(text.trim(), /[.?]$/, `${scene}'s description does not end in a full stop`);
    }
  });

  it('keeps the description in the name\'s column, so it stops at the switch', async () => {
    const css = await readFile(path.join(PANEL, 'panel.css'), 'utf8');
    const rule = css.match(/\.scene-note \{([\s\S]*?)\}/);
    assert.ok(rule, 'no .scene-note rule');
    assert.match(rule[1], /grid-column: 2;/, 'the description must not span the switch column');
  });
});
