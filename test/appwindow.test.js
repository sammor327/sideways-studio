import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_SCENES, SCENE_LABELS } from '../web/shared/look.js';
import { ALL_SOURCES, APP_PAGES, OUTPUT_SOURCE, sourceUrls } from '../web/shared/sources.js';
import { captureConsole, onLog, recentLog } from '../server/log.js';
import { appWindowWanted } from '../server/appwindow.js';

describe('browser source list', () => {
  it('offers every graphic the look knows about, plus the one-source output', () => {
    assert.equal(ALL_SOURCES[0], OUTPUT_SOURCE);
    const keys = ALL_SOURCES.slice(1).map((s) => s.key);
    assert.deepEqual(keys, LOOK_SCENES);
    // A graphic that airs with no name in the rail is a graphic nobody adds.
    for (const s of ALL_SOURCES) assert.ok(s.label && s.label !== s.key, `${s.key} has no label`);
  });

  it('points each scene at its transparent browser source', () => {
    for (const s of ALL_SOURCES.slice(1)) {
      assert.equal(s.path, `/scenes/${s.key}/?transparent=1`);
      assert.equal(s.label, SCENE_LABELS[s.key]);
    }
    assert.equal(OUTPUT_SOURCE.path, '/output/');
  });

  it('builds absolute URLs against the running port', () => {
    const urls = sourceUrls('http://localhost:4700');
    assert.equal(urls[0].url, 'http://localhost:4700/output/');
    assert.ok(urls.every((u) => u.url.startsWith('http://localhost:4700/')));
    // The window and the banner open pages by key, so the keys must be unique
    // across both lists or an open would be ambiguous.
    const keys = [...ALL_SOURCES, ...APP_PAGES].map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('the console bus', () => {
  it('carries every console line to the window, one entry per line', () => {
    captureConsole();
    const seen = [];
    const off = onLog((entry) => seen.push(entry));
    try {
      console.log('  Control panel: %s', 'http://localhost:4700/panel/');
      console.warn('first\nsecond');
      console.error('broke');
    } finally {
      off();
    }
    assert.deepEqual(seen.map((e) => [e.level, e.text]), [
      ['info', '  Control panel: http://localhost:4700/panel/'],
      ['warn', 'first'],
      ['warn', 'second'],
      ['error', 'broke'],
    ]);
    // And they are kept, so a window that opens a second later still shows
    // the launch banner rather than an empty pane.
    const tail = recentLog().slice(-4);
    assert.deepEqual(tail.map((e) => e.text), seen.map((e) => e.text));
    assert.ok(tail.every((e) => typeof e.n === 'number' && typeof e.t === 'number'));
  });

  it('is capped, so a long download cannot grow without bound', () => {
    captureConsole();
    for (let i = 0; i < 600; i += 1) console.log(`line ${i}`);
    const lines = recentLog();
    assert.ok(lines.length <= 500, `kept ${lines.length} lines`);
    assert.equal(lines.at(-1).text, 'line 599');
  });
});

describe('appWindowWanted', () => {
  it('leaves the console alone when asked to', () => {
    assert.equal(appWindowWanted(['node', 'index.js', '--console']), false);
    assert.equal(appWindowWanted(['node', 'index.js', '--no-open']), false);
    // --console wins over --window: the flag that keeps a person informed is
    // never the one that loses.
    assert.equal(appWindowWanted(['node', 'index.js', '--window', '--console']), false);
  });

  it('opens the window when asked, and not by accident from source', () => {
    assert.equal(appWindowWanted(['node', 'index.js', '--window']), true);
    assert.equal(appWindowWanted(['node', 'index.js']), false);
  });
});
