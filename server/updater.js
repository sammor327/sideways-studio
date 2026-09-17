// Self-update for the packaged app.
//
// Every launch asks the release channel whether there is a newer build. The
// rule that shapes all of this: NEVER block the show. The check has a short
// timeout, any failure is silent, and an unanswered prompt starts the version
// already installed. A release can be marked `required` in the manifest, and
// only those install themselves when nobody answers (Sam's call).
//
// The manifest lives at a fixed URL that always points at the newest release,
// so there is no API to rate-limit and nothing to keep in sync by hand:
//   https://github.com/<owner>/<repo>/releases/latest/download/update.json
//
// Trust model: the manifest is fetched over HTTPS and carries the SHA-256 of
// the exe, which is verified before anything is swapped in. That stops a
// corrupted or truncated download and a swapped asset. It does NOT stop a
// compromised release channel; only code signing would, and the build is not
// signed yet (roadmap Part 15).
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT, APP_VERSION, DATA_DIR, isPackaged } from './runtime.js';

const OWNER = 'sammor327';
const REPO = 'sideways-studio';
export const MANIFEST_URL = process.env.SIDEWAYS_UPDATE_URL
  || `https://github.com/${OWNER}/${REPO}/releases/latest/download/update.json`;

// Only these hosts may serve an executable we are about to run: a manifest
// pointing anywhere else is treated as broken, not followed. The manifest's
// own host is trusted too, so pointing SIDEWAYS_UPDATE_URL at another channel
// (an R2 bucket, say) works without a code change.
const DOWNLOAD_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);
try {
  DOWNLOAD_HOSTS.add(new URL(MANIFEST_URL).hostname);
} catch { /* a malformed override just leaves the defaults */ }

// Plain http is only ever acceptable against a loopback channel, which is how
// the update flow gets tested without publishing anything.
const isLoopback = (host) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

const CHECK_TIMEOUT_MS = 5000;
const PROMPT_SECONDS = 15;

const STATE_FILE = path.join(DATA_DIR, 'update-state.json');
const EXE = process.execPath;
const NEW_EXE = `${EXE}.new`;
const OLD_EXE = `${EXE}.old`;

// What the panel polls. `phase` is idle | checking | available | downloading |
// verifying | ready | error | uptodate | disabled.
const status = {
  phase: isPackaged ? 'idle' : 'disabled',
  currentVersion: APP_VERSION,
  version: null,
  notes: '',
  required: false,
  progress: 0,
  error: null,
  skipped: null,
};

export function updateStatus() {
  return { ...status, manifestUrl: MANIFEST_URL };
}

// "0.10.2" > "0.9.9". Anything unparseable sorts as older so a malformed
// manifest can never trigger an update.
export function isNewer(candidate, current) {
  const parse = (v) => String(v).trim().replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10));
  const a = parse(candidate);
  const b = parse(current);
  if (a.length < 3 || a.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeState(next) {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(next, null, 2));
  } catch { /* a read-only folder must not stop the app starting */ }
}

// The most recent usable manifest, so the panel's Install button does not have
// to round-trip the release channel again.
let lastManifest = null;
export const getManifest = () => lastManifest;

// A previous update left the replaced binary behind; it is unlocked now.
export async function cleanupOldBinary() {
  await rm(OLD_EXE, { force: true }).catch(() => {});
  await rm(NEW_EXE, { force: true }).catch(() => {});
}

function validManifest(m) {
  if (!m || typeof m !== 'object') return null;
  if (typeof m.version !== 'string' || typeof m.url !== 'string') return null;
  if (typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(m.sha256)) return null;
  let url;
  try {
    url = new URL(m.url);
  } catch {
    return null;
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname));
  if (!secure || !DOWNLOAD_HOSTS.has(url.hostname)) return null;
  return {
    version: m.version.trim().replace(/^v/, ''),
    url: m.url,
    sha256: m.sha256.toLowerCase(),
    size: Number.isFinite(m.size) ? m.size : 0,
    notes: typeof m.notes === 'string' ? m.notes.slice(0, 500) : '',
    required: m.required === true,
  };
}

// Returns the manifest when a newer build exists, otherwise null. Never
// throws: no network, no DNS, a 404 before the first release, a garbage
// manifest, all just mean "carry on with what is installed".
export async function checkForUpdate({ ignoreSkipped = false } = {}) {
  if (!isPackaged) return null;
  status.phase = 'checking';
  status.error = null;
  try {
    const res = await fetch(MANIFEST_URL, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = validManifest(await res.json());
    if (!manifest) throw new Error('unusable manifest');
    if (!isNewer(manifest.version, APP_VERSION)) {
      status.phase = 'uptodate';
      return null;
    }
    const saved = await readState();
    status.skipped = saved.skippedVersion || null;
    if (!ignoreSkipped && !manifest.required && saved.skippedVersion === manifest.version) {
      status.phase = 'uptodate';
      return null;
    }
    lastManifest = manifest;
    Object.assign(status, {
      phase: 'available',
      version: manifest.version,
      notes: manifest.notes,
      required: manifest.required,
    });
    return manifest;
  } catch (err) {
    status.phase = 'idle';
    status.error = err.message;
    return null;
  }
}

export async function skipVersion(version) {
  await writeState({ ...(await readState()), skippedVersion: version });
  status.skipped = version;
  status.phase = 'uptodate';
}

// Download beside the exe, hash it, and only then put it in place.
export async function downloadUpdate(manifest) {
  status.phase = 'downloading';
  status.progress = 0;
  status.error = null;
  try {
    const res = await fetch(manifest.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || manifest.size || 0;
    const hash = createHash('sha256');
    const chunks = [];
    let seen = 0;
    for await (const chunk of res.body) {
      chunks.push(chunk);
      hash.update(chunk);
      seen += chunk.length;
      if (total) status.progress = Math.min(99, Math.round((seen / total) * 100));
    }
    status.phase = 'verifying';
    const digest = hash.digest('hex');
    if (digest !== manifest.sha256) {
      throw new Error(`checksum mismatch (expected ${manifest.sha256.slice(0, 12)}, got ${digest.slice(0, 12)})`);
    }
    await rm(NEW_EXE, { force: true }).catch(() => {});
    await writeFile(NEW_EXE, Buffer.concat(chunks));
    status.phase = 'ready';
    status.progress = 100;
    return true;
  } catch (err) {
    status.phase = 'error';
    status.error = err.message;
    return false;
  }
}

// Windows will not let a running exe be deleted, but it will let it be
// renamed, so the handover is: rename the running file out of the way, move
// the new one into its place, start it. A tiny batch file does that after we
// have exited, then deletes itself.
//
// "After we have exited" is checked, not assumed (2026-09-16): the script
// waits for this process id to be gone before it swaps anything, up to
// about 40 seconds, and then ends it by force, so the new copy never starts
// while the old one still holds the port and the window. The new copy also
// checks for a running copy on its own (server/index.js claimPort), so the
// two guards back each other up.
export function swapScript({ exe = EXE, newExe = NEW_EXE, oldExe = OLD_EXE, pid = process.pid } = {}) {
  return [
    '@echo off',
    'set /a tries=0',
    ':wait',
    `tasklist /fi "PID eq ${pid}" 2>nul | find "${pid}" >nul`,
    'if errorlevel 1 goto swap',
    'set /a tries+=1',
    'if %tries% geq 40 goto force',
    'ping -n 2 127.0.0.1 >nul',
    'goto wait',
    ':force',
    `taskkill /pid ${pid} /t /f >nul 2>&1`,
    'ping -n 2 127.0.0.1 >nul',
    ':swap',
    `move /y "${exe}" "${oldExe}" >nul 2>&1`,
    `move /y "${newExe}" "${exe}" >nul 2>&1`,
    `if not exist "${exe}" move /y "${oldExe}" "${exe}" >nul 2>&1`,
    `start "" "${exe}"`,
    '(goto) 2>nul & del "%~f0"',
    '',
  ].join('\r\n');
}

export async function swapAndRestart() {
  const script = path.join(APP_ROOT, 'sideways-update.cmd');
  const cmd = swapScript();
  await writeFile(script, cmd);
  spawn('cmd.exe', ['/c', script], {
    cwd: APP_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

// One keystroke, with a visible countdown. Resolves to the default if nobody
// answers or if there is no console to answer on (output redirected, launched
// by a service). Never leaves the app waiting forever.
//
// Hardened after a packaged 0.1.0 installed a NON-required 0.2.0 twice with
// nobody at the keyboard, in a console window that had just been created and
// taken focus. It could not be reproduced with stdout redirected, where the
// countdown times out and starts the installed version correctly, so the
// cause was never pinned down; a stray key event reaching a brand new console
// is the best explanation. Rather than trust that diagnosis, consent is now
// narrow: an exact single-byte y, ignored for the first moment after the
// prompt appears, and the caller additionally refuses to install a
// non-required release unless the answer really came from a keystroke.
const IGNORE_INPUT_MS = 800;

function askWithCountdown(options, seconds, fallback) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      resolve({ answer: fallback, fromKey: false });
      return;
    }
    const openedAt = Date.now();
    let left = seconds;
    let done = false;
    const draw = () => process.stdout.write(`\r  ${options}  starting in ${String(left).padStart(2)}s `);
    const finish = (answer, fromKey) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      stdin.removeListener('data', onData);
      try { stdin.setRawMode(false); } catch { /* console already gone */ }
      stdin.pause();
      process.stdout.write('\r' + ' '.repeat(72) + '\r');
      resolve({ answer, fromKey });
    };
    const onData = (buf) => {
      if (buf[0] === 3) { finish('quit', true); return; }        // ctrl-c always wins
      // Anything that arrives as the console is still being set up is noise,
      // not an answer.
      if (Date.now() - openedAt < IGNORE_INPUT_MS) return;
      // Exactly one byte: a real single keypress, not a pasted or synthesised
      // buffer that happens to contain the letter.
      if (buf.length !== 1) return;
      const code = buf[0];
      if (code === 0x79 || code === 0x59) finish('update', true);        // y / Y
      else if (code === 0x6e || code === 0x4e || code === 13) finish('later', true);  // n / N / enter
      else if (code === 0x73 || code === 0x53) finish('skip', true);     // s / S
    };
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) finish(fallback, false);
      else draw();
    }, 1000);
    try {
      stdin.setRawMode(true);
    } catch {
      // No usable console input: do not sit here waiting for a key that can
      // never arrive.
      resolve({ answer: fallback, fromKey: false });
      return;
    }
    stdin.resume();
    stdin.on('data', onData);
    draw();
  });
}

// The launch-time flow. Returns true when the app is handing over to an
// updated copy and should stop starting up.
//
// `prompt: false` is the app window's launch (0.11.1): there is no console
// for a countdown to appear in and no keyboard pointed at it, so the check
// only loads the answer and the window offers it a second later, with
// buttons. Required releases install from there rather than from a timeout.
export async function runLaunchCheck({ prompt = true } = {}) {
  if (!isPackaged) return false;
  if (process.argv.includes('--skip-update') || process.env.SIDEWAYS_NO_UPDATE === '1') return false;

  await cleanupOldBinary();
  const manifest = await checkForUpdate();
  if (!manifest) return false;
  if (!prompt) {
    console.log(`  Update available: ${APP_VERSION} to ${manifest.version}${manifest.required ? '  (required)' : ''}`);
    return false;
  }

  console.log('');
  console.log(`  Update available: ${APP_VERSION} to ${manifest.version}${manifest.required ? '  (required)' : ''}`);
  if (manifest.notes) {
    for (const line of manifest.notes.split('\n').slice(0, 4)) console.log(`    ${line}`);
  }
  const asked = manifest.required
    ? await askWithCountdown('[Y] update now   [N] not this time', PROMPT_SECONDS, 'update')
    : await askWithCountdown('[Y] update now   [N] not now   [S] skip this version', PROMPT_SECONDS, 'later');

  // The structural guarantee: an optional release can only ever install from a
  // real keystroke. However stdin behaves, an unattended machine starts the
  // version it already has.
  let answer = asked.answer;
  if (answer === 'update' && !asked.fromKey && !manifest.required) answer = 'later';

  if (answer === 'quit') process.exit(0);
  if (answer === 'skip') {
    await skipVersion(manifest.version);
    console.log(`  Skipping ${manifest.version}. It will not be offered again.`);
    return false;
  }
  if (answer !== 'update') {
    console.log('  Starting the installed version.');
    return false;
  }

  console.log(`  Downloading ${manifest.version}...`);
  let lastShown = -1;
  const ticker = setInterval(() => {
    if (status.progress !== lastShown) {
      lastShown = status.progress;
      process.stdout.write(`\r  ${status.phase} ${status.progress}%   `);
    }
  }, 250);
  const ok = await downloadUpdate(manifest);
  clearInterval(ticker);
  process.stdout.write('\r' + ' '.repeat(40) + '\r');

  if (!ok) {
    console.log(`  Update failed: ${status.error}`);
    console.log('  Starting the installed version instead.');
    return false;
  }
  console.log('  Update ready. Restarting into the new version...');
  await swapAndRestart();
  return true;
}

// Whatever has to be taken down before this process makes way for the new
// one: since 0.11.1 that is the app window, which would otherwise still be
// holding its browser profile when the new copy tries to draw its own.
let handoverHook = null;
export function onBeforeHandover(fn) { handoverHook = fn; }

// Panel-triggered install: same download, then hand over. The reply goes out
// before the process exits so the panel can say what is happening.
export async function installLatest() {
  const manifest = lastManifest || await checkForUpdate({ ignoreSkipped: true });
  if (!manifest) return { ok: false, error: 'no update available' };
  const ok = await downloadUpdate(manifest);
  if (!ok) return { ok: false, error: status.error };
  await swapAndRestart();
  if (handoverHook) {
    try { handoverHook(); } catch { /* the restart matters more */ }
  }
  setTimeout(() => process.exit(0), 600);
  return { ok: true, version: manifest.version };
}
