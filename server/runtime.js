// Where the app finds its assets and where it keeps its data.
//
// Two modes, one code path:
//   from source (npm start) - assets are read off disk from web/ and the hero
//     art folder, and data lives inside the repo.
//   packaged (SidewaysStudio.exe) - every asset is embedded in the binary and
//     data lives in a folder beside the exe, so copying the one file to
//     another machine copies the whole app. SPEC: single portable exe, no
//     install, no admin rights.
import { readFileSync } from 'node:fs';
import path from 'node:path';

// getBuiltinModule keeps this synchronous and works both in this ESM source
// tree and in the CommonJS bundle the exe is compiled from.
const sea = process.getBuiltinModule ? process.getBuiltinModule('node:sea') : null;

export const isPackaged = Boolean(sea && sea.isSea && sea.isSea());

// Deliberately not import.meta.url: this module is also bundled to CommonJS,
// where import.meta does not exist. argv[1] is the resolved entry path.
const sourceRoot = () => path.resolve(path.dirname(process.argv[1] || '.'), '..');

// The exe writes beside itself; the source tree writes into the repo.
// SIDEWAYS_DATA_DIR (or --data-dir=) moves it, which is what lets a second
// copy run beside a live one without the two overwriting each other's
// autosave.
export const APP_ROOT = isPackaged ? path.dirname(process.execPath) : sourceRoot();
const dataArg = process.argv.find((a) => a.startsWith('--data-dir='));
export const DATA_DIR = dataArg
  ? path.resolve(dataArg.slice('--data-dir='.length))
  : process.env.SIDEWAYS_DATA_DIR
    ? path.resolve(process.env.SIDEWAYS_DATA_DIR)
    : path.join(APP_ROOT, 'data');
// Only meaningful from source: the packaged build serves web/ from assets.
export const WEB_DIR = isPackaged ? '' : path.join(sourceRoot(), 'web');

// The version this build reports and compares against the release channel.
// The packaged build has it substituted in as a literal by esbuild; from
// source it is read off package.json so `npm start` reports the truth too.
function sourceVersion() {
  // Two candidates because sourceRoot() leans on argv[1], which is absent
  // under `node -e` and friends. Reporting 0.0.0 by accident would make the
  // updater treat every release as newer, so this is worth being careful about.
  for (const root of [sourceRoot(), process.cwd()]) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
      if (pkg.name === 'sideways-studio' && typeof pkg.version === 'string') return pkg.version;
    } catch { /* try the next candidate */ }
  }
  return '0.0.0';
}
export const APP_VERSION = process.env.SIDEWAYS_APP_VERSION || sourceVersion();

// Embedded assets are addressed by their repo-relative path with forward
// slashes: "web/panel/index.html", "hero/AHRI1.png". Returns null when running
// from source so every caller falls through to the filesystem.
export function readAsset(key) {
  if (!isPackaged) return null;
  try {
    const raw = sea.getRawAsset(key);
    return raw ? Buffer.from(raw) : null;
  } catch {
    // getRawAsset throws for a key that was not bundled.
    return null;
  }
}

// The hero art folder cannot be listed inside the exe, so the build writes an
// index of its filenames alongside the art itself.
export function readAssetIndex(key) {
  const raw = readAsset(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}
