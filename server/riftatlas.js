// The RiftAtlas live-game feed: the reader, its settings and its routes.
// What is read and how it maps onto Match data is in riftatlas-model.js.
//
// The reader is a copy of Edge (Chrome as the fallback, found the way the PNG
// export finds it) with its own profile in the data folder, signed in to
// RiftAtlas once by the operator. It opens the casting studio for a room and
// hands every realtime frame that PAGE receives to the model, through the
// DevTools protocol's network events. It sends RiftAtlas nothing of its own:
// the page does its own talking and this only listens, so the feed is exactly
// what a caster sees and needs nothing from RiftAtlas beyond the caster role.
//
// Signing in is its own step because Google refuses to sign anyone in to a
// browser started with the DevTools port open ("This browser or app may not
// be secure"). So Sign in opens a plain window on the same profile, and once
// the operator closes it the reader starts headless on the session RiftAtlas
// kept, with Google no longer involved. Nothing here ever sees a password or
// a token; they stay in that profile like in any browser.
//
// What the reader writes: the live fields (points, game wins, hands, the
// battlefield in play, legend, champion, turn and whose turn) land in both
// banks at once, like the clock, while the players on air are the players in
// preview; with a new pairing loaded into preview and not yet taken they wait
// in preview. Names only ever change on Load players.

import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { DATA_DIR } from './runtime.js';
import { applyUpdate, getState } from './state.js';
import { allCards } from './carddb.js';
import { listLegends } from './legends.js';
import { findBrowser } from './still.js';
import {
  CASTER_URL, REALTIME_HOST, parseRoomCode, casterUrl, socketRoom, createFeed, ingestFrame, gameView,
  makeCardResolver, livePatch, identityPatch, showdownPatch, orientation, normName,
} from './riftatlas-model.js';

const FILE = path.join(DATA_DIR, 'riftatlas.json');
const PROFILE = path.join(DATA_DIR, 'riftatlas');
const LAUNCH_TIMEOUT_MS = 30_000;
const PUSH_DELAY_MS = 120;
const CHECK_MS = 4_000;
// A reader that dies mid-show comes back on its own, a little slower each
// time so a machine that cannot run it is not hammered.
const RETRY_MS = [3_000, 10_000, 30_000, 60_000];
// A showdown the feed brought up stays this long after RiftAtlas settles
// it, so the final might and the last card get their moment on air.
const SHOWDOWN_HOLD_MS = 4_000;

let config = { room: '', live: true, follow: false, swap: false, show: false, showdown: true };
let status = { state: 'idle', message: 'Not connected.', account: '', version: 0 };
let feed = createFeed();
let reader = null; // { proc, ws, send, sessionId, sockets, closing }
let signin = null; // the sign-in window's process
let starting = null;
let retries = 0;
let retryTimer = null;
let checkTimer = null;
let pushTimer = null;
let pushed = { live: '', followId: '', showdownKey: '' };
let showdownTimer = null;
let saveChain = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setStatus(state, message, extra = {}) {
  status = { ...status, ...extra, state, message, version: status.version + 1 };
}

// ---- settings ---------------------------------------------------------------

async function save() {
  saveChain = saveChain.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(config, null, 2));
    await rename(tmp, FILE);
  }).catch(() => { /* the next save tries again */ });
  return saveChain;
}

// The room is remembered for the next show but not reconnected on launch: a
// room from yesterday would pour an old game into Match data on startup.
export async function initRiftAtlas() {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8'));
    config = {
      room: parseRoomCode(raw.room),
      live: raw.live !== false,
      follow: raw.follow === true,
      swap: raw.swap === true,
      show: raw.show === true,
      showdown: raw.showdown !== false,
    };
  } catch { /* first run */ }
}

// ---- the profile --------------------------------------------------------------

// Chromium holds <profile>/lockfile open while it runs; Windows refuses to
// open it again until it exits. Gone or openable means nothing is using it.
function profileInUse() {
  try {
    closeSync(openSync(path.join(PROFILE, 'lockfile'), 'r+'));
    return false;
  } catch (err) {
    return err.code === 'EBUSY' || err.code === 'EPERM';
  }
}

// The DevTools address: announced on stderr, and written to the profile's
// DevToolsActivePort as well, which still works if the browser relaunched
// itself and the stderr we hold belongs to a launcher that has gone.
function devtoolsUrl(proc) {
  const portFile = path.join(PROFILE, 'DevToolsActivePort');
  return new Promise((resolve, reject) => {
    let err = '';
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearInterval(poll); clearTimeout(timer); fn(v); } };
    proc.stderr.on('data', (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) finish(resolve, m[1]);
    });
    const poll = setInterval(() => {
      try {
        const [port, wsPath] = readFileSync(portFile, 'utf8').split(/\r?\n/);
        if (port && wsPath) finish(resolve, `ws://127.0.0.1:${port}${wsPath}`);
      } catch { /* not written yet */ }
    }, 250);
    const timer = setTimeout(() => finish(reject, new Error('The RiftAtlas reader did not start in time.')), LAUNCH_TIMEOUT_MS);
    proc.once('error', (e) => finish(reject, e));
  });
}

// ---- the reader -----------------------------------------------------------------

async function startReader() {
  if (reader) return reader;
  if (starting) return starting;
  starting = (async () => {
    if (!config.room) throw new Error('Type a RiftAtlas room code first.');
    if (signin) throw new Error('Close the RiftAtlas sign-in window first; the reader starts when it closes.');
    const exe = findBrowser();
    if (!exe) throw new Error('Reading RiftAtlas needs Microsoft Edge or Google Chrome on this computer.');
    if (profileInUse()) throw new Error('RiftAtlas is still open in a window on this profile. Close it, then connect again.');
    await mkdir(PROFILE, { recursive: true });
    rmSync(path.join(PROFILE, 'DevToolsActivePort'), { force: true });
    setStatus('starting', 'Starting the RiftAtlas reader.');

    const proc = spawn(exe, [
      '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`,
      ...(config.show ? ['--window-size=1600,1000'] : ['--headless=new']),
      '--no-first-run', '--no-default-browser-check',
      // Edge otherwise hands itself to a relaunched copy and this process
      // exits, taking the handle to the real browser with it.
      '--edge-skip-compat-layer-relaunch',
      // The page's own heartbeat must keep running behind other windows.
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-session-crashed-bubble', '--noerrdialogs', '--mute-audio',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: !config.show });

    let ws;
    try {
      const url = await devtoolsUrl(proc);
      ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('The RiftAtlas reader did not answer.')), LAUNCH_TIMEOUT_MS);
        ws.once('open', () => { clearTimeout(t); resolve(); });
        ws.once('error', (e) => { clearTimeout(t); reject(e); });
      });
    } catch (err) {
      try { if (ws) ws.terminate(); } catch { /* ignore */ }
      if (proc.exitCode === null) proc.kill();
      throw err;
    }

    let nextId = 0;
    const pending = new Map();
    const r = { proc, ws, sessionId: '', sockets: new Map(), closing: false, send: null };
    r.send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }), (e) => {
        if (e) { pending.delete(id); reject(e); }
      });
    });
    let firstPage;
    const pageReady = new Promise((resolve) => { firstPage = resolve; });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.id) {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
        return;
      }
      onEvent(r, msg, firstPage);
    });
    ws.on('close', () => {
      for (const p of pending.values()) p.reject(new Error('The RiftAtlas reader closed.'));
      pending.clear();
      onReaderGone(r);
    });
    reader = r;

    try {
      // Every page the browser opens is attached before it runs a line, with
      // the network events on, so no socket opens unseen.
      await r.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
      r.sessionId = await Promise.race([pageReady, sleep(LAUNCH_TIMEOUT_MS).then(() => '')]);
      if (!r.sessionId) throw new Error('The RiftAtlas reader opened no page.');
      if (!config.show) {
        // A headless browser says so in its user agent; the page is the same
        // page either way, so it gets the ordinary one.
        const v = await r.send('Browser.getVersion');
        await r.send('Network.setUserAgentOverride', { userAgent: String(v.userAgent).replace(/Headless/g, '') }, r.sessionId);
      }
      await openRoom(config.room);
    } catch (err) {
      // Half started is not started: nothing is left running.
      await stopReader();
      throw err;
    }
    clearInterval(checkTimer);
    checkTimer = setInterval(() => { checkPage().catch(() => {}); }, CHECK_MS);
    retries = 0;
    return r;
  })();
  try {
    return await starting;
  } catch (err) {
    setStatus('error', err.message || String(err));
    throw err;
  } finally {
    starting = null;
  }
}

async function onEvent(r, msg, firstPage) {
  const p = msg.params || {};
  switch (msg.method) {
    case 'Target.attachedToTarget': {
      if (p.targetInfo && p.targetInfo.type === 'page') {
        await r.send('Network.enable', {}, p.sessionId).catch(() => {});
        if (!r.sessionId) firstPage(p.sessionId);
      }
      await r.send('Runtime.runIfWaitingForDebugger', {}, p.sessionId).catch(() => {});
      return;
    }
    case 'Network.webSocketCreated':
      if (msg.sessionId === r.sessionId && String(p.url).includes(REALTIME_HOST) && socketRoom(p.url)) {
        r.sockets.set(p.requestId, socketRoom(p.url));
      }
      return;
    case 'Network.webSocketFrameReceived': {
      const room = r.sockets.get(p.requestId);
      if (room === undefined || r !== reader) return;
      if (ingestFrame(feed, p.response && p.response.payloadData, { room })) changed();
      return;
    }
    case 'Network.webSocketClosed':
      r.sockets.delete(p.requestId);
      return;
    case 'Target.detachedFromTarget':
    case 'Inspector.targetCrashed': {
      // The page itself went (closed, or its renderer crashed): start over
      // on a fresh one.
      const ours = msg.method === 'Inspector.targetCrashed' ? msg.sessionId === r.sessionId : p.sessionId === r.sessionId;
      if (ours && r === reader && !r.closing) {
        await stopReader();
        scheduleRetry('The RiftAtlas page closed; opening it again.');
      }
      return;
    }
    default:
  }
}

function onReaderGone(r) {
  if (r !== reader) return;
  reader = null;
  clearInterval(checkTimer);
  checkTimer = null;
  if (!r.closing) scheduleRetry('The RiftAtlas reader stopped; starting it again.');
}

function scheduleRetry(message) {
  clearTimeout(retryTimer);
  if (!config.room || signin) return;
  const wait = RETRY_MS[Math.min(retries, RETRY_MS.length - 1)];
  retries += 1;
  setStatus('error', message);
  retryTimer = setTimeout(() => { startReader().catch(() => scheduleRetry('The RiftAtlas reader could not start; trying again.')); }, wait);
  retryTimer.unref();
}

async function stopReader() {
  clearTimeout(retryTimer);
  clearInterval(checkTimer);
  checkTimer = null;
  const r = reader;
  reader = null;
  if (!r) return;
  r.closing = true;
  try { await Promise.race([r.send('Browser.close'), sleep(3000)]); } catch { /* already gone */ }
  try { r.ws.close(); } catch { /* ignore */ }
  if (r.proc.exitCode === null) {
    await Promise.race([new Promise((res) => r.proc.once('exit', res)), sleep(3000)]);
    if (r.proc.exitCode === null) r.proc.kill();
  }
}

// A new room is a new feed: nothing of the last game carries over.
async function openRoom(room) {
  closeShowdown();
  feed = createFeed();
  pushed = { live: '', followId: '', showdownKey: '' };
  // The last room's sockets close with the page; a frame still in flight
  // from one must not land in the new room's feed.
  if (reader) reader.sockets.clear();
  setStatus('loading', `Opening room ${room}.`);
  if (reader && reader.sessionId) await reader.send('Page.navigate', { url: casterUrl(room) }, reader.sessionId);
}

// What the page says about who is signed in, from Clerk (the sign-in service
// the page runs) and the page's own "access required" notice.
const PAGE_CHECK = `(() => {
  const c = window.Clerk;
  const u = c && c.user;
  const meta = (u && u.publicMetadata) || {};
  const text = document.body ? document.body.innerText.slice(0, 600) : '';
  return JSON.stringify({
    loaded: Boolean(c && c.loaded),
    signedIn: Boolean(u),
    name: u ? String(u.fullName || u.username || (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || '') : '',
    role: String(meta.role || ''),
    denied: /caster or admin access required/i.test(text),
  });
})()`;

async function checkPage() {
  const r = reader;
  if (!r || !r.sessionId || r.checking) return;
  // A page stuck in a long task answers late or never; one check at a time.
  r.checking = true;
  let res;
  try {
    res = await Promise.race([
      r.send('Runtime.evaluate', { expression: PAGE_CHECK, returnByValue: true }, r.sessionId),
      sleep(CHECK_MS).then(() => null),
    ]);
  } finally {
    r.checking = false;
  }
  let c;
  try { c = JSON.parse(res.result.value); } catch { return; }
  if (r !== reader) return;
  if (!c.loaded) return;
  if (!c.signedIn) {
    setStatus('signed-out', 'Not signed in to RiftAtlas. Press Sign in and sign in with the account that has caster access.', { account: '' });
    return;
  }
  if (c.denied && !feed.shellOrder.length) {
    setStatus('no-access', `Signed in as ${c.name || 'this account'}, which has no caster access on RiftAtlas.`, { account: c.name });
    return;
  }
  const view = gameView(feed);
  if (!view) setStatus('waiting', `Signed in as ${c.name || 'a caster'}. Waiting for room ${config.room}.`, { account: c.name });
  else if (status.state !== 'live' || status.account !== c.name) setStatus('live', liveLine(view), { account: c.name });
}

function liveLine(view) {
  if (feed.stale) return `Room ${view.room}: catching up with RiftAtlas.`;
  const game = `Game ${view.gameNumber}${view.seriesLength > 1 ? ` of ${view.seriesLength}` : ''}`;
  return view.live ? `Room ${view.room}, ${game}, turn ${view.turn}.` : `Room ${view.room}, ${game}: ${view.phase ? view.phase.replace(/_/g, ' ') : 'waiting'}.`;
}

// ---- sign in ------------------------------------------------------------------

async function openSignIn() {
  if (signin) return;
  const exe = findBrowser();
  if (!exe) throw new Error('Signing in to RiftAtlas needs Microsoft Edge or Google Chrome on this computer.');
  await stopReader();
  for (let i = 0; i < 25 && profileInUse(); i += 1) await sleep(200);
  if (profileInUse()) throw new Error('RiftAtlas is still open in a window on this profile. Close it first.');
  await mkdir(PROFILE, { recursive: true });
  const proc = spawn(exe, [
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
    '--edge-skip-compat-layer-relaunch', '--disable-session-crashed-bubble', '--new-window',
    config.room ? casterUrl(config.room) : CASTER_URL,
  ], { stdio: 'ignore' });
  signin = proc;
  setStatus('signin', 'Sign in to RiftAtlas in the window that opened, with the account that has caster access. Close that window once the casting studio shows; the reader starts on its own.');
  proc.once('error', () => { signin = null; setStatus('error', 'The sign-in window could not open.'); });
  proc.once('exit', async () => {
    // A launcher that handed the window to a relaunched copy exits at once,
    // so the window is closed when the profile is free, not when this exits.
    while (profileInUse()) await sleep(1000);
    signin = null;
    setStatus('idle', 'Signed-in window closed.');
    if (config.room) startReader().catch(() => {});
  });
}

// ---- into Sideways Studio ---------------------------------------------------------

let resolver = null;
let resolverSize = -1;
function helpers() {
  const cards = allCards();
  if (!resolver || resolverSize !== cards.length) {
    resolver = makeCardResolver(cards);
    resolverSize = cards.length;
  }
  const legends = listLegends();
  const byId = new Map(legends.filter((l) => l.cardId).map((l) => [l.cardId, l]));
  const byName = new Map(legends.map((l) => [normName(l.name), l]));
  const legendOf = ({ name, code }) => {
    const hit = resolver({ name, code });
    const l = (hit && byId.get(hit.cardId)) || byName.get(normName(name));
    return l ? { legend: l.name, legendSlug: l.slug, legendCardId: l.cardId || '' }
      : { legend: String(name).slice(0, 60), legendSlug: '', legendCardId: hit ? hit.cardId : '' };
  };
  return { resolveCard: resolver, legendOf };
}

// The players on air are the players in preview: live values may go straight
// to program. A new pairing in preview that has not been taken yet keeps them
// in preview until TAKE.
function sameOnAir(state) {
  const a = state.preview.match; const b = state.program.match;
  return normName(a.left.name) === normName(b.left.name) && normName(a.right.name) === normName(b.right.name);
}

function changed() {
  if (reader && ['loading', 'waiting', 'live'].includes(status.state)) {
    const view = gameView(feed);
    if (view) setStatus('live', liveLine(view));
  } else {
    status = { ...status, version: status.version + 1 };
  }
  if (!pushTimer) pushTimer = setTimeout(push, PUSH_DELAY_MS);
}

function push() {
  pushTimer = null;
  const h = helpers();
  const view = gameView(feed, { resolveCard: h.resolveCard });
  if (!view || !view.settled || view.players.length !== 2) return;
  const state = getState();
  if (config.live) {
    const { patch, sides } = livePatch(view, state.preview, { swap: config.swap, ...h });
    // Sam, 2026-09-19: a showdown comes up by itself once it has started AND
    // the defending player has answered with a card; one the attacker plays
    // into alone is left to the operator. It follows the showdown from then
    // on and closes a moment after RiftAtlas settles it.
    const sd = view.showdown;
    if (config.showdown && sd && (sd.defenderPlayed || pushed.showdownKey === sd.key)) {
      clearTimeout(showdownTimer);
      showdownTimer = null;
      pushed.showdownKey = sd.key;
      patch.match.showdown = showdownPatch(view, sides, h.resolveCard);
    } else if (pushed.showdownKey && !showdownTimer) {
      showdownTimer = setTimeout(closeShowdown, SHOWDOWN_HOLD_MS);
      showdownTimer.unref();
    }
    const key = JSON.stringify(patch);
    if (key !== pushed.live) {
      pushed.live = key;
      applyUpdate(sameOnAir(state) ? { action: 'live', match: patch.match } : patch);
    }
  }
  if (config.follow) {
    // The newest card played becomes the staged card popup, the way the
    // casting studio's own preview follows the latest card.
    const e = view.events.find((x) => x.kind === 'played');
    if (e && e.id !== pushed.followId) {
      const first = !pushed.followId;
      pushed.followId = e.id;
      // Switching follow on, or opening a room, does not restage an old card.
      if (!first) {
        const hit = h.resolveCard(e);
        applyUpdate({ scenes: { cardpopup: { visible: true, card: { cardId: hit ? hit.cardId : '', cardName: hit ? hit.cardName : e.name, cardType: hit ? hit.type || '' : '' } } } });
      }
    }
  }
}

// The showdown the feed brought up is over (or the feed is going): it
// closes the way the chain cue's close does, on air too while the players on
// air are the feed's.
function closeShowdown() {
  clearTimeout(showdownTimer);
  showdownTimer = null;
  if (!pushed.showdownKey) return;
  pushed.showdownKey = '';
  pushed.live = '';
  const match = { showdown: { active: false, chain: [], priority: '', battlefield: '', battlefieldCardId: '', might: { left: null, right: null } } };
  applyUpdate(sameOnAir(getState()) ? { action: 'live', match } : { match });
}

// What the panel draws: the view with card ids resolved for thumbnails, the
// sides as Match data will get them, and the recent cards.
function panelView() {
  const h = helpers();
  const view = gameView(feed, { resolveCard: h.resolveCard });
  if (!view) return null;
  const state = getState();
  const card = (c) => {
    if (!c) return null;
    const hit = h.resolveCard(c);
    return { name: c.name, cardId: hit ? hit.cardId : '', cardType: hit ? hit.type || '' : '', type: c.type || '' };
  };
  const [l, r] = view.players.length === 2 ? orientation(view, state.preview, config.swap) : view.players;
  // The name Match data holds for the side each player feeds: TopDeck's or
  // the operator's when there is one, RiftAtlas's display name otherwise.
  const matchName = (p) => {
    const cur = p && p === l ? state.preview.match.left.name : (p && p === r ? state.preview.match.right.name : '');
    return cur && !/^player (one|two)$/i.test(cur) ? cur : '';
  };
  const nameOf = (id) => {
    const p = view.players.find((x) => x.id === id);
    return p ? (matchName(p) || p.name) : '';
  };
  const side = (p) => (p ? {
    id: p.id, name: p.name, matchName: matchName(p), seat: p.seat, score: p.score, wins: p.wins,
    legend: card(p.legend), champion: card(p.champion),
    battlefield: p.battlefield ? card({ name: p.battlefield }) : null,
    hand: p.hand.map(card), handCount: p.handCount,
    deck: p.deck ? { left: p.deck.left, total: p.deck.total } : null,
    trash: p.trash.length, clockMs: p.clockMs,
    active: view.live && view.activePlayerId === p.id,
  } : null);
  return {
    room: view.room, settled: view.settled, gameNumber: view.gameNumber, seriesLength: view.seriesLength, phase: view.phase,
    live: view.live, stale: view.stale, turn: view.turn, players: view.players.length,
    left: side(l), right: side(r),
    chain: view.chain.map((c) => ({ ...card(c), playerId: c.playerId })),
    events: view.events.slice(0, 16).map((e) => ({
      id: e.id, at: e.at, kind: e.kind, from: e.from, to: e.to, playerName: nameOf(e.playerId) || e.playerName, turn: e.turn, ...card(e),
    })),
    showdown: view.showdown ? {
      battlefield: view.showdown.battlefield,
      attacker: nameOf(view.showdown.attackerId),
      defender: nameOf(view.showdown.defenderId),
      might: [l, r].map((p) => (p ? view.showdown.might[p.id] ?? null : null)),
      cards: view.showdown.plays.length,
      answered: view.showdown.defenderPlayed,
      up: pushed.showdownKey === view.showdown.key,
    } : null,
    onAir: sameOnAir(state),
  };
}

function publicState() {
  return { config: { ...config }, status, view: panelView(), running: Boolean(reader), signingIn: Boolean(signin) };
}

// ---- routes ---------------------------------------------------------------------

export async function handleRiftAtlas(req, res, url, { readBody, sendJson }) {
  if (url.pathname !== '/api/riftatlas' && !url.pathname.startsWith('/api/riftatlas/')) return false;
  const p = url.pathname;
  const body = async () => {
    try { return JSON.parse((await readBody(req, 16 * 1024)).toString('utf8')) || {}; } catch { return null; }
  };
  const answer = (err) => sendJson(res, err ? 400 : 200, err ? { ok: false, error: err.message || String(err), ...publicState() } : { ok: true, ...publicState() });

  if (p === '/api/riftatlas' && req.method === 'GET') {
    sendJson(res, 200, publicState());
    return true;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' });
    return true;
  }
  if (p === '/api/riftatlas/config') {
    const b = await body();
    if (!b) { sendJson(res, 400, { ok: false, error: 'invalid JSON' }); return true; }
    const restart = b.show !== undefined && Boolean(b.show) !== config.show;
    for (const k of ['live', 'follow', 'swap', 'show', 'showdown']) if (b[k] !== undefined) config[k] = Boolean(b[k]);
    // A showdown the feed brought up goes when what brought it up is off.
    if (!config.live || !config.showdown) closeShowdown();
    // Turning live or the side swap back on writes at once, not at the next move.
    pushed.live = '';
    if (b.follow) pushed.followId = '';
    await save();
    if (restart && reader) {
      await stopReader();
      startReader().catch(() => {});
    } else if (reader) {
      changed();
    }
    answer();
    return true;
  }
  if (p === '/api/riftatlas/connect') {
    const b = await body();
    const room = parseRoomCode(b && b.room);
    if (!room) { sendJson(res, 400, { ok: false, error: 'That does not look like a RiftAtlas room code (the letters after room= in the caster link).', ...publicState() }); return true; }
    config.room = room;
    await save();
    try {
      if (reader) await openRoom(room);
      else await startReader();
      answer();
    } catch (err) { answer(err); }
    return true;
  }
  if (p === '/api/riftatlas/disconnect') {
    closeShowdown();
    await stopReader();
    feed = createFeed();
    setStatus('idle', 'Not connected.');
    answer();
    return true;
  }
  if (p === '/api/riftatlas/signin') {
    try { await openSignIn(); answer(); } catch (err) { answer(err); }
    return true;
  }
  if (p === '/api/riftatlas/load') {
    const view = gameView(feed);
    if (!view || !view.settled || view.players.length !== 2) { sendJson(res, 400, { ok: false, error: view && !view.settled ? 'RiftAtlas is still opening the room; try again in a moment.' : 'No RiftAtlas game to load yet.', ...publicState() }); return true; }
    const { patch, names } = identityPatch(view, getState().preview, { swap: config.swap, ...helpers() });
    const result = applyUpdate(patch);
    pushed.live = '';
    sendJson(res, result.ok ? 200 : 400, { ok: result.ok, error: result.error, names, ...publicState() });
    return true;
  }
  sendJson(res, 404, { ok: false, error: 'not found' });
  return true;
}

// The app is stopping or handing over to an update: the reader goes with it.
export async function shutdownRiftAtlas() {
  await stopReader().catch(() => {});
}
process.on('exit', () => {
  if (reader && reader.proc.exitCode === null) reader.proc.kill();
});
