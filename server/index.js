// Sideways Studio — local broadcast graphics server.
// One process: static files for the panel + scenes, a small JSON API for
// state, and a WebSocket hub that pushes every state change to all outputs.
import http from 'node:http';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { APP_ROOT, APP_VERSION, DATA_DIR, WEB_DIR, isPackaged, readAsset } from './runtime.js';
import { runLaunchCheck, updateStatus, checkForUpdate, skipVersion, installLatest } from './updater.js';
import { initFonts, listFonts, downloadFont, fontsCss, fontFilePath } from './fonts.js';
import { getState, applyUpdate, onChange, setThemeLogo, initState } from './state.js';
import { initCardDb, cardDbStatus, syncCardDb, prefetchFullArt, searchCards, getArtFile } from './carddb.js';
import { initLegends, listLegends, listBattlefields, listChampionUnits, readHeroArt, readIconArt } from './legends.js';

const DATA_DIR_THEME = path.join(DATA_DIR, 'theme');
const LOGO_EXT = ['png', 'jpg', 'webp', 'svg'];
const LOGO_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
let logoFile = null;

const PORT = Number(process.env.SIDEWAYS_PORT || 4700);

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
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', state: getState() }));
});
onChange((state) => {
  const msg = JSON.stringify({ type: 'state', state });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
});

// Everything that has to happen before the first request, then listen. Kept
// as one function rather than top-level await so the same source compiles to
// the CommonJS bundle the packaged exe is built from.
async function start() {
  // Before anything else: if a newer build is out and the operator takes it,
  // this process hands over and never starts the server at all.
  if (await runLaunchCheck()) return;
  await initFonts();
  await initCardDb();
  await initLegends();
  await initState();
  try {
    logoFile = (await readdir(DATA_DIR_THEME)).find((f) => LOGO_EXT.includes(f.split('.').pop()) && f.startsWith('logo.')) || null;
  } catch { /* no theme dir yet */ }

  server.listen(PORT, '127.0.0.1', () => {
    const base = `http://localhost:${PORT}`;
    console.log('');
    console.log(`  SIDEWAYS STUDIO ${APP_VERSION}: Riftbound broadcast graphics`);
    console.log('  Built by Sam Morris / Turn\'em Sideways');
    console.log('');
    console.log(`  Control panel:    ${base}/panel/`);
    console.log('');
    console.log('  Browser sources, all 1920x1080 @ 60fps:');
    console.log(`    All graphics:   ${base}/output/`);
    console.log(`    Score bug:      ${base}/scenes/scorebug/?transparent=1`);
    console.log(`    Card popup:     ${base}/scenes/cardpopup/?transparent=1`);
    console.log(`    In-game 1v1:    ${base}/scenes/igo1v1/?transparent=1`);
    console.log(`    In-game 2v2:    ${base}/scenes/igo2v2/?transparent=1`);
    console.log(`    POV overlay:    ${base}/scenes/pov/?transparent=1`);
    if (isPackaged) {
      console.log('');
      console.log(`  Working folder:   ${APP_ROOT}`);
      console.log('  Card art and saved events are kept in the data folder beside this app.');
      console.log('');
      console.log('  Leave this window open while you stream. Close it to stop the graphics.');
    }
    console.log('');
    // Double-clicking the packaged app passes no arguments, so it opens the
    // panel unless told not to; from source --open is opt-in as before.
    const openPanel = isPackaged ? !process.argv.includes('--no-open') : process.argv.includes('--open');
    if (openPanel) {
      exec(`start "" "${base}/panel/"`);
    }
  });
}

start();
