// Sideways Studio — local broadcast graphics server.
// One process: static files for the panel + scenes, a small JSON API for
// state, and a WebSocket hub that pushes every state change to all outputs.
import http from 'node:http';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { APP_ROOT, APP_VERSION, DATA_DIR, WEB_DIR, isPackaged, readAsset } from './runtime.js';
import { captureConsole, onLog, recentLog } from './log.js';
import {
  appWindowWanted, browserForWindow, closeAppWindow, minimizeConsole,
  startAppWindow, windowConnected, windowGone,
} from './appwindow.js';
import {
  runLaunchCheck, updateStatus, checkForUpdate, skipVersion, installLatest, onBeforeHandover,
} from './updater.js';
import { initFonts, listFonts, downloadFont, fontsCss, fontFilePath } from './fonts.js';
import { getState, applyUpdate, onChange, setThemeLogo, setThemeImage, initState, cleanMultiline } from './state.js';
import { LOOK_SCENES } from '../web/shared/look.js';
import { initCardDb, cardDbStatus, syncCardDb, autoRefreshCardDb, prefetchFullArt, searchCards, getArtFile } from './carddb.js';
import { initLegends, listLegends, listBattlefields, listChampionUnits, readHeroArt, readIconArt } from './legends.js';
import { buildDeck } from './decklist.js';
import { decksFromCsv, fileSlug } from './decklist-csv.js';
import { initLibrary, getLibrary, applyLibrary, onLibraryChange } from './decklibrary.js';
import { findBrowser, renderStill, shutdownStills } from './still.js';
import { legendSlug } from '../web/scenes/decklist/layout.js';
import { ALL_SOURCES, APP_PAGES, sourceUrls } from '../web/shared/sources.js';

// Before anything has anything to say: every console line the app prints is
// also the app window's console pane (server/log.js).
captureConsole();

const DATA_DIR_THEME = path.join(DATA_DIR, 'theme');
const LOGO_EXT = ['png', 'jpg', 'webp', 'svg'];
const LOGO_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
let logoFile = null;
// Background images for the look, one per slot: 'global' or a scene key.
const BG_SLOTS = ['global', ...LOOK_SCENES];
const bgFiles = new Map();

const portArg = process.argv.find((a) => a.startsWith('--port='));
const PORT = Number((portArg && portArg.slice('--port='.length)) || process.env.SIDEWAYS_PORT || 4700);

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

// Hand a URL or a folder to Windows, which gives it to the operator's own
// browser or to Explorer. windowsHide keeps cmd's console out of it, which
// matters now that the app's own console window is hidden behind the app
// window: a black flash would look like something went wrong.
const openExternal = (target) => exec(`start "" "${target}"`, { windowsHide: true });

// "20260911-142233", local time: keeps repeat exports of one deck from
// overwriting each other.
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(getState()));
    return;
  }

  if (url.pathname === '/api/update' && req.method === 'POST') {
    try {
      const result = applyUpdate(JSON.parse((await readBody(req)).toString('utf8')));
      res.writeHead(result.ok ? 200 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
    }
    return;
  }

  if (url.pathname === '/api/fonts' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ fonts: listFonts(), active: getState().theme.font }));
    return;
  }

  if (url.pathname === '/api/fonts/download' && req.method === 'POST') {
    try {
      const { family } = JSON.parse((await readBody(req)).toString('utf8'));
      const result = await downloadFont(String(family || ''));
      res.writeHead(result.ok ? 200 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
    }
    return;
  }

  if (url.pathname === '/theme/fonts.css' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
    res.end(await fontsCss());
    return;
  }

  const fontReq = url.pathname.match(/^\/theme\/fonts\/([a-z0-9-]{1,40})\/(f\d{1,2}\.woff2)$/);
  if (fontReq && req.method === 'GET') {
    const file = fontFilePath(fontReq[1], fontReq[2]);
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'max-age=86400' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('not found');
    }
    return;
  }

  // Logo upload: raw image body, extension via query, 2MB cap. The file lands
  // in data/theme/ and the theme state points at the served URL.
  if (url.pathname === '/api/theme/logo' && req.method === 'POST') {
    const ext = String(url.searchParams.get('ext') || '').toLowerCase();
    if (!LOGO_EXT.includes(ext)) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'logo must be png, jpg, webp, or svg' }));
      return;
    }
    try {
      const body = await readBody(req, 2 * 1024 * 1024);
      if (!body.length) throw new Error('empty upload');
      await mkdir(DATA_DIR_THEME, { recursive: true });
      if (logoFile && logoFile !== `logo.${ext}`) await rm(path.join(DATA_DIR_THEME, logoFile), { force: true });
      logoFile = `logo.${ext}`;
      await writeFile(path.join(DATA_DIR_THEME, logoFile), body);
      setThemeLogo(`/theme/logo?v=${Date.now()}`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (url.pathname === '/theme/logo' && req.method === 'GET') {
    if (!logoFile) { res.writeHead(404); res.end('no logo'); return; }
    try {
      const data = await readFile(path.join(DATA_DIR_THEME, logoFile));
      res.writeHead(200, { 'content-type': LOGO_MIME[logoFile.split('.').pop()], 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('no logo');
    }
    return;
  }

  // Background image upload for the look: one file per slot ('global' or a
  // scene key), same shape as the logo upload but 6MB, since a 1920x1080
  // photo is the point. The stored look points at the served URL and its
  // kind flips to image.
  if (url.pathname === '/api/theme/image' && req.method === 'POST') {
    const ext = String(url.searchParams.get('ext') || '').toLowerCase();
    const slot = String(url.searchParams.get('slot') || 'global');
    if (!LOGO_EXT.includes(ext) || !BG_SLOTS.includes(slot)) {
      sendJson(res, 400, { ok: false, error: 'background must be png, jpg, webp or svg, for a known graphic' });
      return;
    }
    try {
      const body = await readBody(req, 6 * 1024 * 1024);
      if (!body.length) throw new Error('empty upload');
      await mkdir(DATA_DIR_THEME, { recursive: true });
      const prev = bgFiles.get(slot);
      if (prev && prev !== `bg-${slot}.${ext}`) await rm(path.join(DATA_DIR_THEME, prev), { force: true });
      bgFiles.set(slot, `bg-${slot}.${ext}`);
      await writeFile(path.join(DATA_DIR_THEME, `bg-${slot}.${ext}`), body);
      setThemeImage(slot, `/theme/bg/${slot}?v=${Date.now()}`);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message });
    }
    return;
  }

  const bgReq = url.pathname.match(/^\/theme\/bg\/([a-z0-9]{1,20})$/);
  if (bgReq && req.method === 'GET') {
    const file = bgFiles.get(bgReq[1]);
    if (!file) { res.writeHead(404); res.end('no background'); return; }
    try {
      const data = await readFile(path.join(DATA_DIR_THEME, file));
      res.writeHead(200, { 'content-type': LOGO_MIME[file.split('.').pop()], 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('no background');
    }
    return;
  }

  // Decklist paste to resolved cards. The scene and the panel both post here
  // rather than each carrying a parser, so what the operator previews is
  // exactly what airs.
  if (url.pathname === '/api/decklist/parse' && req.method === 'POST') {
    try {
      const { list } = JSON.parse((await readBody(req)).toString('utf8'));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(buildDeck(typeof list === 'string' ? list : '')));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
    }
    return;
  }

  // Saved decklists (the event's prep). Kept out of the bussed state; see
  // server/decklibrary.js for why.
  if (url.pathname === '/api/decklist/library' && req.method === 'GET') {
    sendJson(res, 200, getLibrary());
    return;
  }
  if (url.pathname === '/api/decklist/library' && req.method === 'POST') {
    try {
      const result = applyLibrary(JSON.parse((await readBody(req, 4 * 1024 * 1024)).toString('utf8')));
      sendJson(res, result.ok ? 200 : 400, result);
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid JSON' });
    }
    return;
  }

  // A co-stream "Deck List Database" sheet, read into one entry per deck
  // column with the same resolution report the editor shows for a paste.
  if (url.pathname === '/api/decklist/csv' && req.method === 'POST') {
    try {
      const text = (await readBody(req, 8 * 1024 * 1024)).toString('utf8');
      const decks = decksFromCsv(text).map((d) => {
        const built = buildDeck(d.list);
        return {
          ...d,
          counts: built.counts,
          legend: built.legend ? built.legend.name : null,
          unresolved: built.unresolved.map((name) => ({ name, closest: (built.suggestions[name] || [])[0] || null })),
          warnings: built.warnings,
        };
      });
      sendJson(res, 200, { ok: true, decks });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message });
    }
    return;
  }

  if (url.pathname === '/api/decklist/export' && req.method === 'GET') {
    const browser = findBrowser();
    sendJson(res, 200, { available: Boolean(browser), browser: browser ? path.basename(browser) : null });
    return;
  }

  // PNG export. The still is the decklist scene itself, loaded by a headless
  // browser in still mode, so it is the broadcast plate pixel for pixel.
  if (url.pathname === '/api/decklist/render' && req.method === 'POST') {
    let body;
    try {
      body = JSON.parse((await readBody(req)).toString('utf8'));
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid JSON' });
      return;
    }
    const list = typeof body.list === 'string' ? cleanMultiline(body.list, 6000) : '';
    if (!list.trim()) {
      sendJson(res, 400, { ok: false, error: 'paste a decklist first' });
      return;
    }
    const background = body.background !== false;
    const showSideboard = body.showSideboard !== false;
    const params = new URLSearchParams({
      still: '1', transparent: '1', bg: background ? '1' : '0', sideboard: showSideboard ? '1' : '0', list,
    });
    try {
      const png = await renderStill(`http://127.0.0.1:${PORT}/scenes/decklist/?${params}`);
      const deck = buildDeck(list);
      const stem = (typeof body.name === 'string' && body.name.trim() ? fileSlug(body.name) : legendSlug(deck.legend && deck.legend.name))
        + (background ? '' : '-transparent') + (showSideboard ? '' : '-mainboard');
      let saved = '';
      if (body.save !== false) {
        // One-off exports are timestamped so a second Viktor never replaces
        // the first; "export all" overwrites, since re-running it is a refresh.
        const dir = path.join(DATA_DIR, 'decklist', body.batch ? 'batch' : '');
        const file = path.join(dir, body.batch ? `${stem}.png` : `${stem}-${stamp()}.png`);
        await mkdir(dir, { recursive: true });
        await writeFile(file, png);
        saved = file;
      }
      res.writeHead(200, {
        'content-type': 'image/png',
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="decklist-1920x1080.png"; filename*=UTF-8''${encodeURIComponent(`${stem}-1920x1080.png`)}`,
        'x-output-path': encodeURIComponent(saved),
      });
      res.end(png);
    } catch (err) {
      console.warn('decklist PNG export failed:', err.message);
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  // --- update channel ---

  if (url.pathname === '/api/update/status' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(updateStatus()));
    return;
  }

  if (url.pathname === '/api/update/check' && req.method === 'POST') {
    // An explicit check from the panel looks past a skipped version: the
    // operator asked, so answer honestly.
    await checkForUpdate({ ignoreSkipped: true });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(updateStatus()));
    return;
  }

  if (url.pathname === '/api/update/skip' && req.method === 'POST') {
    const version = updateStatus().version;
    if (version) await skipVersion(version);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(updateStatus()));
    return;
  }

  if (url.pathname === '/api/update/install' && req.method === 'POST') {
    // Reply first: installLatest hands over to the new binary and exits, so
    // anything written after this would never reach the panel.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, started: true }));
    installLatest();
    return;
  }

  // --- the app window ---

  // What the window needs to draw its header and its status rail. The source
  // list itself is not here: the window imports the same shared list the
  // console banner prints from (web/shared/sources.js).
  if (url.pathname === '/api/app/status' && req.method === 'GET') {
    sendJson(res, 200, {
      version: APP_VERSION,
      port: PORT,
      packaged: isPackaged,
      windowed: windowMode,
      dataDir: DATA_DIR,
      appRoot: APP_ROOT,
      exportBrowser: findBrowser() ? path.basename(findBrowser()) : null,
    });
    return;
  }

  // Opening anything happens here rather than in the window, because a link
  // clicked inside the window would open in the window's own browser profile,
  // which is not the operator's browser and dies with the app. An allowlist,
  // so the app window can only ever ask for its own pages, its own graphics,
  // or its data folder.
  if (url.pathname === '/api/app/open' && req.method === 'POST') {
    let target = '';
    try {
      target = String(JSON.parse((await readBody(req)).toString('utf8')).target || '');
    } catch { /* falls through to the unknown-target reply */ }
    if (target === 'data') {
      await mkdir(DATA_DIR, { recursive: true }).catch(() => {});
      openExternal(DATA_DIR);
      sendJson(res, 200, { ok: true, opened: DATA_DIR });
      return;
    }
    const page = APP_PAGES.find((p) => p.key === target);
    const source = ALL_SOURCES.find((s) => s.key === target);
    const hit = page || source;
    if (!hit) {
      sendJson(res, 400, { ok: false, error: 'unknown target' });
      return;
    }
    const opened = `http://localhost:${PORT}${hit.path}`;
    openExternal(opened);
    console.log(`  Opened ${hit.label.toLowerCase()} in your browser.`);
    sendJson(res, 200, { ok: true, opened });
    return;
  }

  // The window's Quit button. Closing the window does the same thing; this is
  // for the operator who would rather press a button that says what it does.
  if (url.pathname === '/api/app/quit' && req.method === 'POST') {
    sendJson(res, 200, { ok: true, stopping: true });
    setTimeout(() => quitApp('Quit from the app window'), 150);
    return;
  }

  if (url.pathname === '/api/cards/status' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(cardDbStatus()));
    return;
  }

  if (url.pathname === '/api/cards/search' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ indexed: cardDbStatus().indexed, results: searchCards(url.searchParams.get('q') || '') }));
    return;
  }

  // Downloads can take minutes on venue wifi, so both start async and return
  // immediately; the panel follows along via /api/cards/status polling.
  if (url.pathname === '/api/cards/sync' && req.method === 'POST') {
    const busy = cardDbStatus().progress.phase !== 'idle';
    if (!busy) syncCardDb();
    res.writeHead(busy ? 409 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(busy ? { ok: false, error: 'a download is already running' } : { ok: true, started: true }));
    return;
  }

  if (url.pathname === '/api/cards/prefetch-full' && req.method === 'POST') {
    const status = cardDbStatus();
    const busy = status.progress.phase !== 'idle';
    const err = busy ? 'a download is already running' : (!status.indexed ? 'download the card database first' : null);
    if (!err) prefetchFullArt();
    res.writeHead(err ? 409 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(err ? { ok: false, error: err } : { ok: true, started: true }));
    return;
  }

  if (url.pathname === '/api/legends' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ legends: listLegends() }));
    return;
  }

  if (url.pathname === '/api/battlefields' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ battlefields: listBattlefields() }));
    return;
  }

  if (url.pathname === '/api/champions' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ champions: listChampionUnits() }));
    return;
  }

  // Legend art: hero tier (local design PNGs) and icon tier (RR cutouts,
  // cached). Unknown slugs 404; scene fallback chains take it from there.
  const legendArt = url.pathname.match(/^\/legendart\/(hero|icon)\/([a-z0-9-]{1,60})\.(png|webp)$/);
  if (legendArt && req.method === 'GET') {
    const [, tier, slug] = legendArt;
    const data = tier === 'hero' ? await readHeroArt(slug) : await readIconArt(slug);
    if (!data) {
      res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end('no art');
      return;
    }
    res.writeHead(200, {
      'content-type': tier === 'hero' ? 'image/png' : 'image/webp',
      'cache-control': 'max-age=86400',
    });
    res.end(data);
    return;
  }

  // Art proxy: /cardart/<tier>/<cardId>.webp, cache-first with lazy fetch.
  // Ids resolve against the loaded index only; unknown ids 404 (the scenes'
  // fallback chains take it from there).
  const art = url.pathname.match(/^\/cardart\/(thumb|full)\/([A-Za-z0-9-]{1,16})\.webp$/);
  if (art && req.method === 'GET') {
    const file = await getArtFile(art[1], art[2]);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end('no art');
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'max-age=86400' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end('no art');
    }
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(302, { location: '/panel/' });
    res.end();
    return;
  }

  // Static files. The packaged build serves them from the assets embedded in
  // the exe; from source they come off disk, traversal-guarded. Directories
  // resolve to index.html.
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  // posix normalize collapses any ../ against the root, so an asset key can
  // never address anything that was not bundled under web/.
  const assetKey = `web${path.posix.normalize(rel)}`;
  const ext = path.extname(rel).toLowerCase();
  // Panel and scene code must never be served stale: a browser source that
  // kept an old module after the app was updated would air the old graphic
  // with no sign anything was wrong. Art and fonts keep their own caching.
  const headers = (contentType) => ({
    'content-type': contentType,
    ...(['.html', '.js', '.css'].includes(ext) ? { 'cache-control': 'no-store' } : {}),
  });

  const embedded = readAsset(assetKey);
  if (embedded) {
    res.writeHead(200, headers(MIME[ext] || 'application/octet-stream'));
    res.end(embedded);
    return;
  }
  if (isPackaged) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }

  const file = path.normalize(path.join(WEB_DIR, rel));
  if (!file.startsWith(WEB_DIR + path.sep)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, headers(MIME[ext] || 'application/octet-stream'));
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  ws.send(JSON.stringify({ type: 'state', state: getState() }));
  // The app window connects as ?role=window. That connection is how the
  // window proves it is on screen (server/appwindow.js is holding a timeout
  // until it does) and it is the only client that wants the console.
  if (new URL(req.url, 'http://app').searchParams.get('role') === 'window') {
    ws.isWindow = true;
    windowConnected();
    ws.on('close', windowGone);
    ws.send(JSON.stringify({ type: 'log', lines: recentLog() }));
  }
});
// Console lines, pushed to the window as they are printed.
onLog((entry) => {
  const msg = JSON.stringify({ type: 'log', lines: [entry] });
  for (const client of wss.clients) {
    if (client.isWindow && client.readyState === 1) client.send(msg);
  }
});
onChange((state) => {
  const msg = JSON.stringify({ type: 'state', state });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
});
// Library changes go out as a version number only; the panel and the deck
// editor fetch the list itself, and scenes ignore the message.
onLibraryChange((library) => {
  const msg = JSON.stringify({ type: 'library', version: library.version });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
});

// True once the app has decided to draw itself as a window rather than as a
// console. The API reports it, and the banner and the update flow both read
// differently when there is nobody looking at a console.
let windowMode = false;

// Stopping, for any of the three reasons there are: the window was closed,
// the window's Quit button, or the window never appeared and the operator
// closed the console instead (which Windows does for us).
let stopping = false;
async function quitApp(reason) {
  if (stopping) return;
  stopping = true;
  console.log(`  ${reason}. Sideways Studio is stopping.`);
  closeAppWindow();
  await shutdownStills().catch(() => {});
  server.close();
  // Sockets that a browser source is holding open would keep the process
  // alive well past the point the operator asked it to stop. The delay is
  // also what gives closeAppWindow's kill time to land.
  setTimeout(() => process.exit(0), 700).unref();
}

const banner = (base) => {
  console.log('');
  console.log(`  SIDEWAYS STUDIO ${APP_VERSION}: Riftbound broadcast graphics`);
  console.log('  Built by Sam Morris / Turn\'em Sideways');
  console.log('');
  console.log(`  Control panel:    ${base}/panel/`);
  console.log(`  Deck editor:      ${base}/decklist/`);
};

// The console-only listing. The app window shows the same list as a rail of
// copy buttons, from the same source (web/shared/sources.js), so this is
// printed when there is no window rather than always.
const bannerSources = (base) => {
  console.log('');
  console.log('  Browser sources, all 1920x1080 @ 60fps:');
  for (const s of sourceUrls(base)) console.log(`    ${`${s.label}:`.padEnd(36)}${s.url}`);
  if (isPackaged) {
    console.log('');
    console.log(`  Working folder:   ${APP_ROOT}`);
    console.log('  Card art and saved events are kept in the data folder beside this app.');
    console.log('');
    console.log('  Leave this window open while you stream. Close it to stop the graphics.');
  }
  console.log('');
};

// Everything that has to happen before the first request, then listen. Kept
// as one function rather than top-level await so the same source compiles to
// the CommonJS bundle the packaged exe is built from.
async function start() {
  // Decided first, because it changes what the next line is allowed to do: a
  // launch-time update prompt printed into a console nobody can see would sit
  // there waiting for a keystroke that can never arrive. In window mode the
  // window offers the update instead (/api/update/*), so the check here only
  // loads the answer for it.
  windowMode = appWindowWanted() && Boolean(browserForWindow());
  if (windowMode) minimizeConsole();
  // Before anything else: if a newer build is out and the operator takes it,
  // this process hands over and never starts the server at all.
  if (await runLaunchCheck({ prompt: !windowMode })) return;
  // The handover kills this process a moment later; the window has to go with
  // it, or the copy starting up finds the profile held and cannot draw.
  onBeforeHandover(closeAppWindow);
  await initFonts();
  await initCardDb();
  // Not awaited: a refresh must never hold up the graphics, and it fails
  // silently when the venue has no internet.
  if (autoRefreshCardDb()) console.log('  Checking Rift Registry for new sets in the background.');
  await initLegends();
  await initState();
  await initLibrary();
  try {
    const files = (await readdir(DATA_DIR_THEME)).filter((f) => LOGO_EXT.includes(f.split('.').pop()));
    logoFile = files.find((f) => f.startsWith('logo.')) || null;
    for (const f of files) {
      const m = f.match(/^bg-([a-z0-9]{1,20})\./);
      if (m && BG_SLOTS.includes(m[1])) bgFiles.set(m[1], f);
    }
  } catch { /* no theme dir yet */ }

  server.listen(PORT, '127.0.0.1', async () => {
    const base = `http://localhost:${PORT}`;
    banner(base);

    if (!windowMode) {
      bannerSources(base);
      // Double-clicking the packaged app passes no arguments, so it opens the
      // panel unless told not to; from source --open is opt-in as before.
      const openPanel = isPackaged ? !process.argv.includes('--no-open') : process.argv.includes('--open');
      if (openPanel) openExternal(`${base}/panel/`);
      return;
    }

    console.log('');
    console.log('  Opening the Sideways Studio window...');
    await startAppWindow({
      url: `${base}/window/`,
      onQuit: (reason) => quitApp(reason.charAt(0).toUpperCase() + reason.slice(1)),
      // No window on screen is not a reason to stop the show. The console is
      // already back by the time this runs (server/appwindow.js), so print
      // the operator everything they would have had without it and carry on.
      onFallback: (reason) => {
        windowMode = false;
        console.log('');
        console.log(`  ${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`);
        console.log('  Sideways Studio is running in this window instead.');
        bannerSources(base);
        openExternal(`${base}/panel/`);
      },
    });
  });
}

start();
