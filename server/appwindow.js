// The app window: Sideways Studio as a program with a window, not a console.
//
// SPEC said "single portable exe, double-click it, no install, no admin
// rights", and that is still exactly what this is. What changed in 0.11.1 is
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
// How long the window may be gone before the app treats it as closed. The
// page reconnects every 1.2s, so this only ever expires on a window that is
// really not there any more; anything shorter would quit the app over a
// refresh or a renderer hiccup, in the middle of a show.
const GONE_GRACE_MS = 10_000;

const WIN32 = process.platform === 'win32';
const PROFILE_DIR = path.join(DATA_DIR, 'window');

let proc = null;
let windows = 0;        // live ?role=window sockets
let connected = false;  // the window has reported in at least once
let quitting = false;
let timer = null;
let goneTimer = null;
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
let consoleState = 'normal';   // normal | minimized | hidden

// Never the bare name: this process's PATH is whatever launched it, and a
// PowerShell that cannot be found would fail silently and leave the window,
// or the console, exactly where it was.
function psExe() {
  const system = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : null;
  return system && existsSync(system) ? system : 'powershell.exe';
}

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
  try {
    const child = spawn(psExe(),
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { stdio: 'ignore', windowsHide: false });
    // PowerShell missing or locked down just means the console stays where it
    // is, which is untidy but harmless. Never fatal.
    child.on('error', () => {});
  } catch { /* same */ }
}

// Out of the way while the window is on its way up, rather than straight to
// hidden. If the window never arrives there is a taskbar button to click in
// the meantime, and the seconds before it opens do not look like a program
// that flashed a black box and died.
export function minimizeConsole() {
  if (!WIN32 || consoleState !== 'normal') return;
  consoleState = 'minimized';
  setConsoleWindow(6, false);   // SW_MINIMIZE
}

// Called once the window is really on screen: from here the app IS the
// window, and a console in the taskbar is just something to close by mistake.
export function hideConsole() {
  if (!WIN32 || consoleState === 'hidden') return;
  consoleState = 'hidden';
  setConsoleWindow(0, false);   // SW_HIDE
}

// Every dead end calls this: no window on screen means the console comes
// back, so there is always something to read and something to close.
export function showConsole() {
  if (!WIN32 || consoleState === 'normal') return;
  consoleState = 'normal';
  setConsoleWindow(9, true);    // SW_RESTORE, and bring it forward
}

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
  const exe = browserForWindow();
  if (!exe) { fallback('no Edge or Chrome on this computer to draw the window with'); return; }
  const child = spawn(exe, launchArgs(url), { stdio: 'ignore', windowsHide: false, detached: false });
  proc = child;

  child.on('error', (err) => {
    if (child !== proc) return;
    proc = null;
    fallback(`the app window could not start (${err.message})`);
  });

  // Watching this process is the fast path, not the contract. Edge in
  // particular usually hands the window to a fresh process of its own and
  // lets the one we started exit within a second, so an exit here means very
  // little on its own: the window's socket is what says whether there is a
  // window (windowConnected / windowGone below).
  child.on('exit', () => {
    if (child !== proc) return;
    proc = null;
    if (quitting) return;
    if (connected && windows === 0) hooks.onQuit('the app window was closed');
  });
}

// Open the window and watch it. Resolves once it has been asked for; whether
// it worked arrives through the callbacks.
export async function startAppWindow({ url, onQuit, onFallback }) {
  hooks = { onQuit, onFallback };
  connected = false;
  windows = 0;
  quitting = false;
  await mkdir(PROFILE_DIR, { recursive: true }).catch(() => {});
  spawnWindow(url);
  timer = setTimeout(() => {
    if (!connected) fallback('the app window did not open');
  }, CONNECT_TIMEOUT_MS);
}

// Called when the window's page opens its WebSocket. Until that happens the
// window has not proved it is on screen, and the console stays one timeout
// away from coming back.
export function windowConnected() {
  windows += 1;
  clearTimeout(goneTimer);
  goneTimer = null;
  if (connected) return;
  connected = true;
  clearTimeout(timer);
  timer = null;
  hideConsole();
}

// ...and when it closes. A refresh, a renderer restart or a moment of sleep
// all land here and come back within a second or two; a window that is really
// gone does not, and closing the window has always been how this app is
// stopped.
export function windowGone() {
  windows = Math.max(0, windows - 1);
  if (quitting || !connected || windows > 0 || goneTimer) return;
  goneTimer = setTimeout(() => {
    goneTimer = null;
    if (!quitting && windows === 0) hooks.onQuit('the app window was closed');
  }, GONE_GRACE_MS);
}

// Closing it for our own reasons (quit, update handover): the exit handler
// above must not read that as the operator closing the window.
export function closeAppWindow() {
  quitting = true;
  clearTimeout(timer);
  clearTimeout(goneTimer);
  timer = null;
  goneTimer = null;
  const child = proc;
  proc = null;
  try {
    // A browser is a process tree; killing the one we spawned leaves the rest
    // of it holding the profile and the window on screen.
    if (child && child.exitCode === null) {
      if (WIN32) execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
      else child.kill();
    }
  } catch { /* it is going away either way */ }
  if (!WIN32) return;
  // And the window itself, which is usually no longer in that tree: Edge
  // hands it to a process of its own. The profile folder is ours alone, so
  // the command line that mentions it is the window and nothing else. This
  // matters most on an update restart, where a browser still holding the
  // profile would leave the new copy unable to draw.
  const profile = PROFILE_DIR.replace(/'/g, "''");
  const ps = "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' or Name='chrome.exe'\""
    + ` | Where-Object { $_.CommandLine -like '*${profile}*' }`
    + ' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
  try {
    execFile(psExe(), ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, () => {});
  } catch { /* the window outliving us by a moment is not worth failing over */ }
}

// A crash must not leave a window with nothing behind it.
process.on('exit', () => {
  if (proc && proc.exitCode === null) {
    quitting = true;
    try { proc.kill(); } catch { /* ignore */ }
  }
});
