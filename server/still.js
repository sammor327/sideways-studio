// PNG stills of a scene, rendered by a headless copy of the browser Windows
// already has (Edge ships with every Windows 10/11 machine; Chrome is the
// fallback). Nothing is bundled: the exe stays the size it is, and the still
// is drawn by the SAME scene page the browser source airs, so an export can
// never drift from the broadcast graphic.
//
// Driven over the DevTools protocol with the ws client the server already
// depends on: size the viewport to exactly 1920x1080, clear the default
// white page background so transparent scenes come out as true alpha, load
// the scene in still mode, wait for it to say it is finished loading art, and
// capture. One browser is reused across a batch and closed after a short
// idle, and captures run one at a time.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const IDLE_CLOSE_MS = 20_000;
const LAUNCH_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 45_000;

const CANDIDATES = [
  process.env.SIDEWAYS_BROWSER,
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
].filter(Boolean);

export function findBrowser() {
  return CANDIDATES.find((p) => existsSync(p)) || null;
}

let browser = null; // { proc, ws, profile, send, closing }
let idleTimer = null;
let chain = Promise.resolve();

// A process that was killed outright (the batch script stopping its private
// copy, a closed console) never gets to delete its profile. Browsers here
// close after 20s idle, so any profile an hour old is an orphan.
let swept = false;
async function sweepStaleProfiles() {
  if (swept) return;
  swept = true;
  const tmp = os.tmpdir();
  for (const name of await readdir(tmp).catch(() => [])) {
    if (!name.startsWith('sideways-still-')) continue;
    const full = path.join(tmp, name);
    const info = await stat(full).catch(() => null);
    if (info && info.isDirectory() && Date.now() - info.mtimeMs > 60 * 60 * 1000) {
      await rm(full, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function launch() {
  const exe = findBrowser();
  if (!exe) throw new Error('PNG export needs Microsoft Edge or Google Chrome installed on this computer');
  await sweepStaleProfiles();
  // A throwaway profile: a separate browser instance that never touches, or
  // hands the job to, the operator's own open browser.
  const profile = await mkdtemp(path.join(os.tmpdir(), 'sideways-still-'));
  const proc = spawn(exe, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  // Until launch returns, nothing else holds the process or the profile, so a
  // start that fails part way has to clean both up here or they are orphaned.
  let ws;
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let err = '';
      const timer = setTimeout(() => reject(new Error('the headless browser did not start')), LAUNCH_TIMEOUT_MS);
      proc.stderr.on('data', (d) => {
        err += d;
        const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(timer); resolve(m[1]); }
      });
      proc.once('error', (e) => { clearTimeout(timer); reject(e); });
      proc.once('exit', (code) => { clearTimeout(timer); reject(new Error(`the headless browser exited (${code})`)); });
    });

    ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the headless browser did not answer')), LAUNCH_TIMEOUT_MS);
      ws.once('open', () => { clearTimeout(timer); resolve(); });
      ws.once('error', (e) => { clearTimeout(timer); reject(e); });
    });
  } catch (err) {
    try { if (ws) ws.terminate(); } catch { /* ignore */ }
    if (proc.exitCode === null) proc.kill();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
    throw err;
  }

  let nextId = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = msg.id && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  });
  const failAll = (why) => {
    for (const p of pending.values()) p.reject(new Error(why));
    pending.clear();
  };
  ws.on('close', () => { failAll('the headless browser connection closed'); if (browser && browser.ws === ws) browser = null; });
  proc.once('exit', () => { failAll('the headless browser exited'); if (browser && browser.proc === proc) browser = null; });

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }), (e) => {
      if (e) { pending.delete(id); reject(e); }
    });
  });
  return { proc, ws, profile, send };
}

async function closeBrowser() {
  const b = browser;
  browser = null;
  if (!b) return;
  try { await Promise.race([b.send('Browser.close'), new Promise((r) => setTimeout(r, 3000))]); } catch { /* already gone */ }
  try { b.ws.close(); } catch { /* ignore */ }
  if (b.proc.exitCode === null) {
    await Promise.race([new Promise((r) => b.proc.once('exit', r)), new Promise((r) => setTimeout(r, 3000))]);
    if (b.proc.exitCode === null) b.proc.kill();
  }
  // Only ever the temp profile this module made for itself.
  await rm(b.profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(url) {
  if (!browser) browser = await launch();
  const { send } = browser;
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  try {
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, sessionId);
    // Alpha 0: whatever the scene leaves unpainted stays transparent.
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, sessionId);
    await send('Page.navigate', { url }, sessionId);

    // The scene sets data-ready to "1" once every image has loaded or run out
    // of fallbacks, or to "error: ..." when it cannot draw the plate at all.
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let ready = '';
    while (Date.now() < deadline) {
      const r = await send('Runtime.evaluate', {
        expression: 'document.documentElement.dataset.ready || ""',
        returnByValue: true,
      }, sessionId);
      ready = r.result.value;
      if (ready) break;
      await sleep(120);
    }
    if (!ready) throw new Error('the scene did not finish loading in time');
    if (ready !== '1') throw new Error(ready.replace(/^error:\s*/, ''));

    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
      captureBeyondViewport: false,
    }, sessionId);
    return Buffer.from(shot.data, 'base64');
  } finally {
    await send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

// Serialised: two captures fighting over one headless browser helps nobody.
export function renderStill(url) {
  const job = chain.then(async () => {
    clearTimeout(idleTimer);
    try {
      return await capture(url);
    } catch (err) {
      // A browser in an unknown state is not worth reusing.
      await closeBrowser();
      throw err;
    } finally {
      idleTimer = setTimeout(() => { chain = chain.then(closeBrowser); }, IDLE_CLOSE_MS);
    }
  });
  chain = job.catch(() => {});
  return job;
}

export async function shutdownStills() {
  clearTimeout(idleTimer);
  await closeBrowser();
}

// Closing the app window must not leave a headless browser running.
process.on('exit', () => {
  if (browser && browser.proc.exitCode === null) browser.proc.kill();
});
