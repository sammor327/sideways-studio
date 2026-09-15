// The app window: Sideways Studio as a program with a window, not a console.
//
// SPEC said "single portable exe, double-click it, no install, no admin
// rights", and that is still exactly what this is. What changed in 0.11.0 is
// the face it shows: instead of a raw console window the operator has to be
// told not to close, the app opens its own window, and the console that used
// to be the whole experience lives inside that window as a log pane.
//
// How, without bundling a browser and tripling the download: the machine
// already has Chromium. Edge ships with Windows and is what the PNG export
// already drives headless (server/still.js). Started with --app= and its own
// profile folder it is a plain window with no tab strip, no address bar and
// no other pages in it, showing a page this app serves. It looks and behaves
// like an app window because as far as the operator can tell it is one.
//
// The console window Windows gives a console-subsystem exe is hidden rather
// than removed, because it is the safety net. Every path that ends with no
// app window on screen brings it back with an explanation, so the app can
// never end up running invisibly with nobody able to stop it.
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, isPackaged } from './runtime.js';
import { findBrowser } from './still.js';

// A venue PC coming out of a cold boot can take a while to get a browser on
// screen, and giving up early would drop the operator into a console they did
// not ask for.
const CONNECT_TIMEOUT_MS = 30_000;
// A browser that exits this fast never drew anything: it handed our window to
// another instance holding the same profile (the moment after an update
// restart), or it could not start at all.
const INSTANT_EXIT_MS = 4000;
const RETRY_DELAY_MS = 1500;

const WIN32 = process.platform === 'win32';
const PROFILE_DIR = path.join(DATA_DIR, 'window');

let proc = null;
let connected = false;
let quitting = false;
let timer = null;
let attempts = 0;
let hooks = { onQuit: () => {}, onFallback: () => {} };

// The window is the packaged app's normal face. From source the console is
// the right place to be, since that is where you are developing, so there it
// is opt-in with --window. --console and --no-open force the old behaviour
// either way.
export function appWindowWanted(argv = process.argv) {
  if (argv.includes('--console') || argv.includes('--no-open')) return false;
  if (argv.includes('--window')) return true;
  return isPackaged && WIN32;
}

export const browserForWindow = () => findBrowser();

// --- the console window Windows hands a console-subsystem exe ---------------

// Hiding it takes two Win32 calls and no native module: a PowerShell child
// inherits this process's console, so GetConsoleWindow() there returns THIS
// window's handle. Deliberately not windowsHide, which would give the child a
// console of its own and hide the wrong window.
let consoleHidden = false;

function setConsoleWindow(showCmd, foreground) {
  if (!WIN32) return;
  const member = '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();'
    + ' [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);'
    + ' [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);';
  const ps = [
    `$t = Add-Type -MemberDefinition '${member}' -Name Win -Namespace SidewaysStudio -PassThru`,
    '$h = $t::GetConsoleWindow()',
    `if ($h -ne [IntPtr]::Zero) { [void]$t::ShowWindow($h, ${showCmd})`
      + `${foreground ? '; [void]$t::SetForegroundWindow($h)' : ''} }`,
  ].join('; ');
  const system = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : null;
  try {
    const child = spawn(system && existsSync(system) ? system : 'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { stdio: 'ignore', windowsHide: false });
    // PowerShell missing or locked down just means the console stays where it
    // is, which is untidy but harmless. Never fatal.
    child.on('error', () => {});
  } catch { /* same */ }
}

export function hideConsole() {
  if (!WIN32 || consoleHidden) return;
  consoleHidden = true;
  setConsoleWindow(0, false);   // SW_HIDE
}

// Every dead end calls this: no window on screen means the console comes
// back, so there is always something to read and something to close.
export function showConsole() {
  if (!WIN32 || !consoleHidden) return;
  consoleHidden = false;
  setConsoleWindow(5, true);    // SW_SHOW, and bring it forward
}

export const isConsoleHidden = () => consoleHidden;

// --- the window itself ------------------------------------------------------

const launchArgs = (url) => [
  `--app=${url}`,
  `--user-data-dir=${PROFILE_DIR}`,
  '--window-size=1280,860',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--disable-features=Translate,TranslateUI,MediaRouter',
  // The window is closed by killing it (a browser on Windows has no clean
  // signal to send), and the next launch must not open behind a "did not shut
  // down correctly" bubble.
  '--disable-session-crashed-bubble',
  '--noerrdialogs',
];

function fallback(reason) {
  clearTimeout(timer);
  timer = null;
  showConsole();
  hooks.onFallback(reason);
}

function spawnWindow(url) {
  attempts += 1;
  const startedAt = Date.now();
  const exe = browserForWindow();
  if (!exe) { fallback('no Edge or Chrome on this computer to draw the window with'); return; }
  const child = spawn(exe, launchArgs(url), { stdio: 'ignore', windowsHide: false, detached: false });
  proc = child;

  child.on('error', (err) => {
    if (child !== proc) return;
    proc = null;
    fallback(`the app window could not start (${err.message})`);
  });

  child.on('exit', () => {
    if (child !== proc) return;
    proc = null;
    if (quitting) return;
    if (connected) {
      // The operator closed the window. That is the app's quit, the same way
      // closing the console window always was.
      hooks.onQuit('the app window was closed');
      return;
    }
    if (Date.now() - startedAt < INSTANT_EXIT_MS && attempts < 2) {
      // Nearly always the profile still being held by the copy we are
      // replacing during an update restart. Give it a moment and ask again.
      setTimeout(() => { if (!quitting && !connected) spawnWindow(url); }, RETRY_DELAY_MS);
      return;
    }
    fallback('the app window closed before it finished loading');
  });
}

// Open the window and watch it. Resolves once it has been asked for; whether
// it worked arrives through the callbacks.
export async function startAppWindow({ url, onQuit, onFallback }) {
  hooks = { onQuit, onFallback };
  connected = false;
  quitting = false;
  attempts = 0;
  await mkdir(PROFILE_DIR, { recursive: true }).catch(() => {});
  spawnWindow(url);
  timer = setTimeout(() => {
    if (!connected) fallback('the app window did not open');
  }, CONNECT_TIMEOUT_MS);
}

// Called when the window's page reports in over the WebSocket. Until that
// happens the window has not proved it is on screen, and the console stays
// one timeout away from coming back.
export function windowConnected() {
  if (connected) return;
  connected = true;
  clearTimeout(timer);
  timer = null;
}

export const hasAppWindow = () => Boolean(proc);

// Closing it for our own reasons (quit, update handover): the exit handler
// above must not read that as the operator closing the window.
export function closeAppWindow() {
  quitting = true;
  clearTimeout(timer);
  timer = null;
  const child = proc;
  proc = null;
  if (!child || child.exitCode !== null) return;
  try {
    // A browser is a process tree; killing the one we spawned leaves the rest
    // of it holding the profile and the window on screen.
    if (WIN32) execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {});
    else child.kill();
  } catch { /* it is going away either way */ }
}

// A crash must not leave a window with nothing behind it.
process.on('exit', () => {
  if (proc && proc.exitCode === null) {
    quitting = true;
    try { proc.kill(); } catch { /* ignore */ }
  }
});
