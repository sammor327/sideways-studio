// Legend framing store: serves the table to the framer, and writes it back
// when the framer locks it in.
//
// The scenes get their framing by importing web/shared/legendframe.js, not by
// fetching it. That is deliberate: a scene must never wait on a request to
// know how to frame a legend, or a match card would air with the figure in the
// wrong place for a frame and jump once the answer landed.
//
// Locking in therefore has to change what that module says, and inside a
// packaged exe web/ is sealed. So the module is not served off disk: this file
// serves it with the saved table spliced into it, and the save itself goes to
// legend-frames.json in the DATA folder, which is writable wherever the app is
// running. A framing session in the installed app takes effect as soon as each
// browser source reloads, with no rebuild and no reinstall.
//
// Running from source it ALSO writes the table back into the module itself, so
// the framing can be committed and shipped to everyone else. That is the only
// difference between the two, and it is the one that should differ: one is an
// operator framing their own copy, the other is Sam framing the release.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FRAMES, cleanFrames } from '../web/shared/legendframe.js';
import { DATA_DIR, WEB_DIR, isPackaged, readAsset } from './runtime.js';

const SOURCE_FILE = WEB_DIR ? path.join(WEB_DIR, 'shared', 'legendframe.js') : '';
const DATA_FILE = path.join(DATA_DIR, 'legend-frames.json');
const ASSET_KEY = 'web/shared/legendframe.js';
const START = '// FRAMES-START';
const END = '// FRAMES-END';

// The import is a snapshot of what shipped. The saved table layers on top of
// it, so a legend framed on this machine wins over the baked one and a legend
// nobody has touched keeps whatever the release decided.
let current = cleanFrames(FRAMES);

export const legendFrames = () => current;

// Framing can always be locked in now. What differs is whether it also reaches
// the repo: only a source build can rewrite the module itself.
export const canSaveFrames = () => true;
export const canBakeFrames = () => !isPackaged && Boolean(SOURCE_FILE);

export async function initLegendFrames() {
  try {
    const saved = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    const frames = cleanFrames(saved && saved.frames ? saved.frames : saved);
    current = { ...current, ...frames };
    const n = Object.keys(frames).length;
    if (n) console.log(`  Legend framing:   ${n} legend${n === 1 ? '' : 's'} framed on this machine.`);
  } catch {
    // No file yet, or it is unreadable: the baked table stands on its own.
  }
}

// Pretty-print the table the way a hand-written module would look: one legend
// per line, sorted, so a diff of a framing session reads as the legends that
// actually moved.
export function renderFrames(frames) {
  const lines = Object.keys(frames).map((slug) => {
    const entry = frames[slug];
    const parts = [`base: ${renderFrame(entry.base)}`];
    if (entry.per) {
      const per = Object.keys(entry.per).map((k) => `${k}: ${renderFrame(entry.per[k])}`);
      parts.push(`per: { ${per.join(', ')} }`);
    }
    return `  '${slug}': { ${parts.join(', ')} },`;
  });
  return lines.length ? `export const FRAMES = {\n${lines.join('\n')}\n};` : 'export const FRAMES = {};';
}

const renderFrame = (f) => `{ scale: ${f.scale}, x: ${f.x}, y: ${f.y} }`;

// Put a table into a copy of the module, replacing only the generated span so
// the documentation and the helpers around it survive. Returns null when the
// markers are gone, which is the one case where writing would destroy the file
// rather than update it.
export function spliceFrames(src, frames) {
  const from = src.indexOf(START);
  const to = src.indexOf(END);
  if (from < 0 || to < 0 || to < from) return null;
  return `${src.slice(0, from + START.length)}\n${renderFrames(frames)}\n${src.slice(to)}`;
}

// The module as the scenes and the framer should receive it: what shipped,
// with this machine's framing spliced in. Falls back to the unmodified source
// if the markers ever go missing, because a scene with stale framing is a far
// smaller failure than a scene with no art module at all.
export async function legendFrameModule() {
  const src = (readAsset(ASSET_KEY) || (SOURCE_FILE ? await readFile(SOURCE_FILE) : null));
  if (!src) return null;
  const text = src.toString('utf8');
  return spliceFrames(text, current) || text;
}

export async function saveFrames(raw) {
  const frames = cleanFrames(raw);
  await mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  await writeFile(DATA_FILE, `${JSON.stringify({ frames }, null, 2)}\n`);
  current = frames;

  // From source, bake it into the module too, so it can be committed.
  let baked = false;
  if (canBakeFrames()) {
    const next = spliceFrames(await readFile(SOURCE_FILE, 'utf8'), frames);
    if (next !== null) {
      await writeFile(SOURCE_FILE, next);
      baked = true;
    }
  }
  return { ok: true, saved: true, baked, frames };
}
