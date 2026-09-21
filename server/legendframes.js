// Legend framing store: serves the baked table to the framer and writes it
// back when the framer locks it in.
//
// The table lives in web/shared/legendframe.js, which the scenes import
// statically. That is deliberate: a scene must never wait on a fetch to know
// how to frame a legend, or a match card would air with the figure in the
// wrong place for the first frame and jump once the answer landed. The cost is
// that saving means rewriting a source file, so Lock in only works when the
// app runs from source. In a packaged exe web/ lives inside the binary and the
// framer says so rather than pretending to save.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FRAMES, cleanFrames } from '../web/shared/legendframe.js';
import { WEB_DIR, isPackaged } from './runtime.js';

const FILE = WEB_DIR ? path.join(WEB_DIR, 'shared', 'legendframe.js') : '';
const START = '// FRAMES-START';
const END = '// FRAMES-END';

// The import is a snapshot: Node will not re-read the module after a save, so
// the saved table is held here and served from then on.
let current = cleanFrames(FRAMES);

export const legendFrames = () => current;

export const canSaveFrames = () => !isPackaged && Boolean(FILE);

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
// the documentation and the helpers around it survive every save. Returns null
// when the markers are gone, which is the one case where writing would destroy
// the file rather than update it.
export function spliceFrames(src, frames) {
  const from = src.indexOf(START);
  const to = src.indexOf(END);
  if (from < 0 || to < 0 || to < from) return null;
  return `${src.slice(0, from + START.length)}\n${renderFrames(frames)}\n${src.slice(to)}`;
}

export async function saveFrames(raw) {
  const frames = cleanFrames(raw);
  if (!canSaveFrames()) {
    current = frames;
    return { ok: false, saved: false, reason: 'packaged', frames };
  }
  const next = spliceFrames(await readFile(FILE, 'utf8'), frames);
  if (next === null) return { ok: false, saved: false, reason: 'markers', frames: current };
  await writeFile(FILE, next);
  current = frames;
  return { ok: true, saved: true, frames };
}
