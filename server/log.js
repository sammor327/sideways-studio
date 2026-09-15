// The app's console, as data.
//
// Sideways Studio used to BE a console window: everything the operator could
// learn about the running app was printed to stdout, and the window had to
// stay open because closing it stopped the graphics. The app window (0.11.1)
// keeps that log, it just renders it inside the app instead of leaving a raw
// terminal on the taskbar. So console.log stays the way the server talks, and
// this module is the bus that carries those lines to the window.
//
// Everything still goes to stdout as well: run the app with --console, or
// from source, and the old behaviour is exactly what it was.
import { format } from 'node:util';

// Enough to cover a launch plus a long card-art download; the window shows
// the tail and the operator can copy the lot.
const MAX_LINES = 500;

const lines = [];
const listeners = new Set();
let seq = 0;

// Held before anything is patched so a listener that logs cannot recurse.
const real = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function push(level, text) {
  // A multi-line message becomes one entry per line: the window renders a
  // list, not a text blob, and a 14-line banner should scroll as 14 lines.
  for (const raw of String(text).split('\n')) {
    seq += 1;
    const entry = { n: seq, t: Date.now(), level, text: raw.replace(/\s+$/, '') };
    lines.push(entry);
    if (lines.length > MAX_LINES) lines.shift();
    for (const fn of listeners) {
      try { fn(entry); } catch { /* a broken listener must not break logging */ }
    }
  }
}

// Route console through the bus. Idempotent: calling it twice would otherwise
// double every line.
let captured = false;
export function captureConsole() {
  if (captured) return;
  captured = true;
  console.log = (...args) => { real.log(...args); push('info', format(...args)); };
  console.warn = (...args) => { real.warn(...args); push('warn', format(...args)); };
  console.error = (...args) => { real.error(...args); push('error', format(...args)); };
}

// What a window that has just opened gets, so the launch banner is there
// rather than an empty console.
export const recentLog = () => lines.slice();

export function onLog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
