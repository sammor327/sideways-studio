// Every isolated browser-source link opens something (2026-09-20, Sam: "the
// links for the graphics sometimes do not work, let's do a test for these
// and make sure that all isolated links work").
//
// The chain beside a graphic's name copies /scenes/<key>/?transparent=1 and
// the operator pastes it into OBS. Two ways that can fail, and an operator
// only ever sees the same blank source for both:
//   1. the page itself 404s (a key in the list with no folder), or
//   2. the page loads and one of the files it pulls in 404s, so the module
//      never runs and the graphic never paints.
// This walks every link the app hands out, follows everything each page
// pulls in (stylesheets, modules, their imports, all the way down) and
// resolves each one against web/ the way the server does.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SOURCES, APP_PAGES } from '../web/shared/sources.js';
import { LOOK_SCENES } from '../web/shared/look.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

// Routes the server answers itself, so there is no file behind them. Each
// one is a live handler in server/index.js, not a gap in the bundle.
const SERVED = [/^\/api\//, /^\/theme\//, /^\/cards\//, /^\/hero\//, /^\/legendfull\//, /^\/ws$/];

const exists = async (file) => { try { return (await stat(file)).isFile(); } catch { return false; } };

// The server's own mapping: a path ending in / is that folder's index.html,
// and everything is resolved under web/ with no way out of it.
function toFile(urlPath) {
  const rel = path.posix.normalize(urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath);
  return path.join(WEB, rel);
}

// Local references out of one page or module. Absolute (/stage/stage.css) or
// relative (./scene.js, ../../shared/look.js); anything with a scheme, a
// protocol-relative host or a bare fragment is somebody else's problem.
function refs(text, fromUrl, isHtml) {
  const out = new Set();
  const add = (raw) => {
    if (!raw) return;
    const v = raw.trim();
    if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//') || v.startsWith('#') || v.startsWith('data:')) return;
    const clean = v.split('#')[0].split('?')[0];
    if (!clean) return;
    out.add(new URL(clean, `http://x${fromUrl}`).pathname);
  };
  if (isHtml) {
    for (const m of text.matchAll(/\s(?:src|href)="([^"]+)"/g)) add(m[1]);
  } else {
    // Static imports and re-exports only: a computed import is data, not a
    // file this test can follow.
    for (const m of text.matchAll(/^\s*(?:import|export)[^'"\n]*?from\s*'([^']+)'/gm)) add(m[1]);
    for (const m of text.matchAll(/^\s*import\s*'([^']+)'/gm)) add(m[1]);
    for (const m of text.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) add(m[1]);
  }
  return [...out];
}

// Everything one link pulls in, breadth first. Returns the paths that are
// not there.
async function brokenFrom(startPath) {
  const seen = new Set();
  const missing = [];
  const queue = [{ url: startPath, from: '(the link itself)' }];
  while (queue.length) {
    const { url, from } = queue.shift();
    if (seen.has(url) || SERVED.some((re) => re.test(url))) continue;
    seen.add(url);
    const file = toFile(url);
    if (!await exists(file)) { missing.push(`${url} (pulled in by ${from})`); continue; }
    const ext = path.extname(url).toLowerCase() || (url.endsWith('/') ? '.html' : '');
    if (!['.html', '.js', '.css', ''].includes(ext)) continue;
    const text = await readFile(file, 'utf8');
    for (const ref of refs(text, url, ext === '.html')) queue.push({ url: ref, from: url });
  }
  return missing;
}

describe('the isolated browser-source links', () => {
  it('hands out one link per graphic the look can recolour, and no others', () => {
    const listed = ALL_SOURCES.filter((s) => s.key !== 'output').map((s) => s.key);
    assert.deepEqual([...listed].sort(), [...LOOK_SCENES].sort());
  });

  it('opens a real page, with every file it pulls in behind it', async () => {
    const broken = [];
    for (const source of [...ALL_SOURCES, ...APP_PAGES]) {
      const missing = await brokenFrom(source.path.split('?')[0].split('#')[0]);
      if (missing.length) broken.push(`${source.label} (${source.path}):\n    ${missing.join('\n    ')}`);
    }
    assert.deepEqual(broken, [], `these links open onto something missing:\n  ${broken.join('\n  ')}`);
  });

  it('gives every graphic its own folder with the three files a scene is made of', async () => {
    const missing = [];
    for (const key of LOOK_SCENES) {
      for (const file of ['index.html', 'scene.js', 'scene.css']) {
        if (!await exists(path.join(WEB, 'scenes', key, file))) missing.push(`scenes/${key}/${file}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  // The one-source page and the two monitors each keep their own list of
  // scene frames, in layer order. A graphic missing from one of them is the
  // other half of "the link does not work": the isolated link is fine and
  // the operator running a single source never sees the graphic at all.
  it('draws every graphic into the one-source page and the monitor', async () => {
    for (const page of ['output/index.html', 'monitor/index.html']) {
      const html = await readFile(path.join(WEB, page), 'utf8');
      const framed = new Set([...html.matchAll(/\/scenes\/([a-z0-9]+)\//g)].map((m) => m[1]));
      for (const [, list] of html.matchAll(/const SCENES = \[([\s\S]*?)\]/g)) {
        for (const m of list.matchAll(/'([a-z0-9]+)'/g)) framed.add(m[1]);
      }
      const absent = LOOK_SCENES.filter((key) => !framed.has(key));
      assert.deepEqual(absent, [], `${page} never loads ${absent.join(', ')}`);
    }
  });
});
