// Theme fonts: a curated set of broadcast-suitable Google Fonts, downloaded
// on pick and cached under data/theme/fonts/ so venues work offline after
// setup (same pattern as card art). We rewrite Google's css2 response to
// point at locally cached woff2 files and serve the lot as /theme/fonts.css;
// every cached family is included so the panel's picker can preview them.
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './runtime.js';

const FONT_DIR = path.join(DATA_DIR, 'theme', 'fonts');

// A modern browser UA so Google serves woff2 (older UAs get ttf/eot).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Condensed and display faces carry names and scores; the sans faces cover
// body text. All are open-license Google Fonts.
const CURATED = [
  'Anton', 'Archivo Black', 'Barlow Condensed', 'Bebas Neue', 'Chivo',
  'Exo 2', 'Inter', 'Kanit', 'Lexend', 'Manrope', 'Montserrat', 'Oswald',
  'Outfit', 'Rajdhani', 'Roboto Condensed', 'Rubik', 'Russo One',
  'Saira Condensed', 'Sora', 'Space Grotesk', 'Teko', 'Titillium Web',
  'Work Sans',
];

const slugOf = (family) => family.toLowerCase().replace(/ /g, '-');
const cssFile = (family) => path.join(FONT_DIR, `${slugOf(family)}.css`);

let cachedSlugs = new Set();

export async function initFonts() {
  await mkdir(FONT_DIR, { recursive: true });
  try {
    cachedSlugs = new Set(
      (await readdir(FONT_DIR)).filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4)),
    );
  } catch { /* dir just created */ }
}

export function isCuratedFont(family) {
  return CURATED.includes(family);
}

export function listFonts() {
  return CURATED.map((family) => ({ family, cached: cachedSlugs.has(slugOf(family)) }));
}

export async function downloadFont(family) {
  if (!isCuratedFont(family)) return { ok: false, error: 'unknown font' };
  if (cachedSlugs.has(slugOf(family))) return { ok: true, cached: true };
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;700&display=swap`;
    const res = await fetch(cssUrl, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for font css`);
    let css = await res.text();

    const slug = slugOf(family);
    const dir = path.join(FONT_DIR, slug);
    await mkdir(dir, { recursive: true });
    const urls = [...new Set(css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g) || [])]
      .map((m) => m.slice(4, -1));
    if (!urls.length) throw new Error('no font files in css');
    let i = 0;
    for (const url of urls) {
      const fres = await fetch(url, { headers: { 'user-agent': UA } });
      if (!fres.ok) throw new Error(`HTTP ${fres.status} for font file`);
      const name = `f${i++}.woff2`;
      await writeFile(path.join(dir, name), Buffer.from(await fres.arrayBuffer()));
      css = css.split(url).join(`/theme/fonts/${slug}/${name}`);
    }
    await writeFile(cssFile(family), css);
    cachedSlugs.add(slug);
    return { ok: true, cached: false };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Every cached family's css in one sheet, served at /theme/fonts.css.
export async function fontsCss() {
  const parts = [];
  for (const slug of [...cachedSlugs].sort()) {
    try {
      parts.push(await readFile(path.join(FONT_DIR, `${slug}.css`), 'utf8'));
    } catch { /* skip unreadable */ }
  }
  return parts.join('\n');
}

// Guarded resolver for /theme/fonts/<slug>/<file> requests.
export function fontFilePath(slug, file) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug) || !/^f\d{1,2}\.woff2$/.test(file)) return null;
  return path.join(FONT_DIR, slug, file);
}
