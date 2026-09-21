// Legend framing: the model the match card and the player profile resolve a
// legend's full cutout through, and the file the framer writes it back to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_FRAME, GRAPHICS, OFFSET_MAX, PLACEMENTS, SCALE_MAX, SCALE_MIN,
  autoScale, cleanEntry, cleanFrame, cleanFrames, frameFor, placementsOf,
} from '../web/shared/legendframe.js';
import { spliceFrames } from '../server/legendframes.js';

const MODULE_HEAD = ['// a comment that has to survive', 'export const HELPER = 1;', '// FRAMES-START'];
const MODULE_TAIL = ['// FRAMES-END', 'export const AFTER = 2;', ''];
const moduleWith = (...body) => [...MODULE_HEAD, ...body, ...MODULE_TAIL].join('\n');

test('a frame is clamped to what a slot can usefully show', () => {
  assert.deepEqual(cleanFrame({ scale: 1.25, x: -12.5, y: 8 }), { scale: 1.25, x: -12.5, y: 8 });
  assert.equal(cleanFrame({ scale: 99 }).scale, SCALE_MAX);
  assert.equal(cleanFrame({ scale: 0 }).scale, SCALE_MIN);
  assert.equal(cleanFrame({ x: 400 }).x, OFFSET_MAX);
  assert.equal(cleanFrame({ y: -400 }).y, -OFFSET_MAX);
});

test('an unreadable frame falls back to the default rather than reaching a scene', () => {
  assert.deepEqual(cleanFrame(null), DEFAULT_FRAME);
  assert.deepEqual(cleanFrame({ scale: 'wide', x: NaN, y: undefined }), DEFAULT_FRAME);
});

test('an entry keeps only the placements that exist', () => {
  const entry = cleanEntry({
    base: { scale: 1.2, x: 4, y: 0 },
    per: { profile: { scale: 1.4, x: 9, y: -3 }, nowhere: { scale: 2 } },
  });
  assert.deepEqual(entry.base, { scale: 1.2, x: 4, y: 0 });
  assert.deepEqual(Object.keys(entry.per), ['profile']);
});

// The match card was one placement until 0.55.0, mirrored in CSS. A table
// written then must keep meaning what it meant, on both sides.
test('a table from before the match card split keeps working, right side mirrored', () => {
  const entry = cleanEntry({ base: { scale: 1, x: 0, y: 0 }, per: { headtohead: { scale: 1.3, x: 12, y: -4 } } });
  assert.deepEqual(Object.keys(entry.per).sort(), ['headtoheadLeft', 'headtoheadRight']);
  assert.deepEqual(entry.per.headtoheadLeft, { scale: 1.3, x: 12, y: -4 });
  assert.deepEqual(entry.per.headtoheadRight, { scale: 1.3, x: -12, y: -4 });
});

test('an explicit side beats the migrated one', () => {
  const entry = cleanEntry({
    base: { scale: 1, x: 0, y: 0 },
    per: { headtohead: { scale: 1.3, x: 12, y: 0 }, headtoheadRight: { scale: 2, x: 5, y: 1 } },
  });
  assert.deepEqual(entry.per.headtoheadRight, { scale: 2, x: 5, y: 1 });
});

// Every legend slot has to sit inside its graphic's frame, or the framer draws
// a window that does not match what airs.
test('every placement sits inside its graphic at 1920x1080', () => {
  for (const [k, p] of Object.entries(PLACEMENTS)) {
    assert.ok(GRAPHICS[p.graphic], `${k} names a graphic that exists`);
    assert.ok(p.frameX >= 0 && p.frameX + p.w <= 1920, `${k} fits across the frame`);
    assert.ok(p.frameY >= 0 && p.frameY + p.h <= 1080, `${k} fits down the frame`);
    assert.ok(p.label && p.short && p.where && p.scrim && p.scrimNote, `${k} describes itself`);
  }
  for (const [k, g] of Object.entries(GRAPHICS)) {
    assert.ok(placementsOf(k).length, `${k} has at least one legend slot`);
    for (const f of g.furniture) {
      assert.ok(f.label && f.note, `${k} furniture describes itself`);
      assert.ok(['plate', 'card', 'camera'].includes(f.kind), `${k} furniture has a known kind`);
    }
  }
});

test('the table drops keys that are not legend slugs and sorts what is left', () => {
  const frames = cleanFrames({ zed: {}, 'master-yi-wuju-bladesman': {}, 'Bad Slug': {}, '../etc': {} });
  assert.deepEqual(Object.keys(frames), ['master-yi-wuju-bladesman', 'zed']);
});

test('a placement uses its own override, else the legend base, else nothing', () => {
  const frames = cleanFrames({
    ahri: { base: { scale: 1.1, x: 0, y: 0 }, per: { profile: { scale: 1.6, x: 12, y: 0 } } },
    zed: { base: { scale: 1.3, x: -6, y: 2 } },
  });
  assert.equal(frameFor(frames, 'ahri', 'profile').scale, 1.6);
  assert.equal(frameFor(frames, 'ahri', 'headtoheadLeft').scale, 1.1);
  assert.equal(frameFor(frames, 'zed', 'profile').x, -6);
  assert.equal(frameFor(frames, 'nobody', 'profile'), null);
  assert.equal(frameFor(frames, '', 'profile'), null);
});

// The untuned fallback. A cutout taller than its slot is already full height
// under CONTAIN; a wider one has to grow, which is what crops its sides.
test('autoscale stands a cutout full height in its slot', () => {
  const h2h = PLACEMENTS.headtoheadLeft;
  // Annie, 639x1480: far narrower than the 760x1080 side, so CONTAIN fits her
  // by height and nothing more is needed.
  assert.equal(autoScale(639, 1480, h2h.w, h2h.h), 1);
  // Darius, 1367x1080: wider than the side, so he grows until he is as tall as
  // it, which is the ratio between the two shapes.
  assert.equal(autoScale(1367, 1080, h2h.w, h2h.h), 1.8);
  // The same cutout in the wider profile column needs less of a lift.
  assert.equal(autoScale(1367, 1080, PLACEMENTS.profile.w, PLACEMENTS.profile.h), 1.24);
});

test('autoscale never divides by a size it does not have', () => {
  assert.equal(autoScale(0, 1080, 760, 1080), 1);
  assert.equal(autoScale(1367, 1080, 0, 0), 1);
  assert.equal(autoScale(NaN, NaN, 760, 1080), 1);
});

// The framer's Lock in rewrites only the generated span of the shared module,
// so the file keeps its documentation and the scenes keep importing it.
test('saving rewrites the baked table in place and leaves the module around it', () => {
  const before = moduleWith('export const FRAMES = {};');
  const frames = cleanFrames({
    ahri: { base: { scale: 1.2, x: 3, y: -4 } },
    zed: { base: { scale: 1, x: 0, y: 0 }, per: { profile: { scale: 1.5, x: 8, y: 0 } } },
  });
  const after = spliceFrames(before, frames);

  assert.match(after, /a comment that has to survive/);
  assert.match(after, /export const HELPER = 1;/);
  assert.match(after, /export const AFTER = 2;/);
  assert.match(after, /'ahri': \{ base: \{ scale: 1.2, x: 3, y: -4 \} \},/);
  assert.match(after, /'zed': \{ base: .*, per: \{ profile: \{ scale: 1.5, x: 8, y: 0 \} \} \},/);
  assert.equal(after.match(/FRAMES-START/g).length, 1);

  // Saving twice running does not nest the table or leave the last one behind.
  assert.equal(spliceFrames(after, frames), after);
  assert.match(spliceFrames(after, {}), /export const FRAMES = \{\};/);
});

test('a module whose markers have gone is refused rather than overwritten', () => {
  assert.equal(spliceFrames('export const FRAMES = {};\n', {}), null);
  assert.equal(spliceFrames('// FRAMES-END\n// FRAMES-START\n', {}), null);
});

test('what the framer writes parses back to what it was given', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lf-'));
  const file = path.join(dir, 'legendframe.js');
  const frames = cleanFrames({
    'master-yi-wuju-bladesman': { base: { scale: 1.35, x: -7.5, y: 2 } },
    ahri: { base: { scale: 1, x: 0, y: 0 }, per: { headtohead: { scale: 2.1, x: -3, y: 6 } } },
  });
  await writeFile(file, spliceFrames(moduleWith('export const FRAMES = {};'), frames));
  const reloaded = await import(`file:///${file.split(path.sep).join('/')}`);
  assert.deepEqual(cleanFrames(reloaded.FRAMES), frames);
});
