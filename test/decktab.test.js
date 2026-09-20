// The Deck editor tab (2026-09-20). It was a page of its own until then, with
// its own header, its own socket and its own copy of every element id. Folded
// into the panel, the things that can now break silently are the wiring: an id
// the module looks up that is not on the page, an id the merge made ambiguous,
// and a link left pointing at the page that no longer exists.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_PAGES } from '../web/shared/sources.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

let panelHtml;
let panelJs;
let editorJs;
before(async () => {
  panelHtml = await readFile(path.join(WEB, 'panel', 'index.html'), 'utf8');
  panelJs = await readFile(path.join(WEB, 'panel', 'panel.js'), 'utf8');
  editorJs = await readFile(path.join(WEB, 'panel', 'deckeditor.js'), 'utf8');
});

const ids = (html) => [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

describe('the Deck editor tab', () => {
  it('is a tab beside the others, with a view of its own', () => {
    assert.match(panelHtml, /class="view-tab"[^>]*data-view="decks"/);
    assert.match(panelHtml, /<div class="deck-view"/);
    assert.match(panelHtml, /href="\.\/deckeditor\.css"/);
    // panel.js owns the socket and the library, so it has to hand both over.
    assert.match(panelJs, /import \{ deckLibrary, renderDeckEditor \} from '\.\/deckeditor\.js'/);
    assert.match(panelJs, /renderDeckEditor\(s\)/);
    assert.match(panelJs, /deckLibrary\(library\)/);
  });

  it('looks up only ids the panel page actually has', () => {
    const wanted = new Set([
      ...[...editorJs.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]),
      ...[...editorJs.matchAll(/setStatusLine\('([\w-]+)'/g)].map((m) => m[1]),
    ]);
    const onPage = new Set(ids(panelHtml));
    for (const id of wanted) assert.ok(onPage.has(id), `the Deck editor looks up #${id}, which is not on the panel page`);
  });

  it('leaves no id on the panel page twice', () => {
    // Two elements with one id is the merge's own failure mode: the module
    // would quietly drive whichever came first.
    const seen = new Map();
    for (const id of ids(panelHtml)) seen.set(id, (seen.get(id) || 0) + 1);
    const twice = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    assert.deepEqual(twice, []);
  });

  it('sends the old deck editor address to the tab', async () => {
    const page = APP_PAGES.find((p) => p.key === 'deckeditor');
    assert.equal(page.path, '/panel/#decks');
    // The page itself is gone, so the server redirect is the only way there.
    const folders = await readdir(WEB);
    assert.ok(!folders.includes('decklist'), 'web/decklist/ is back: the editor lives on the panel now');
    const server = await readFile(path.join(WEB, '..', 'server', 'index.js'), 'utf8');
    assert.match(server, /pathname === '\/decklist\/'[\s\S]{0,120}location: '\/panel\/#decks'/);
  });

  it('keeps every surface pointing at the tab, not the old page', async () => {
    const stale = [];
    const walk = async (dir) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { await walk(full); continue; }
        if (!/\.(js|html|css)$/.test(entry.name)) continue;
        const text = await readFile(full, 'utf8');
        // /api/decklist/, /scenes/decklist/ and /assets/decklist/ are other
        // things entirely; the dead link is the bare page.
        for (const m of text.matchAll(/['"(]\/decklist\/?['")]/g)) stale.push(`${path.relative(WEB, full)}: ${m[0]}`);
      }
    };
    await walk(WEB);
    assert.deepEqual(stale, []);
  });
});
