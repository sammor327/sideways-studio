// Legend catalog: derived from the card index (type Legend), joined to two
// art tiers. Hero tier: the 261x242 IGO holder PNGs from the design
// resources (bundling Riot art is fine: official Riot project, Sam
// 2026-08-10). Icon tier: Rift Registry 256px alpha cutouts, proxied and
// cached like card art. Slugs follow RR's legend-slug convention
// (slugified card name: "Master Yi, Wuju Bladesman" -> master-yi-wuju-bladesman).
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { allCards } from './carddb.js';
import { DATA_DIR, isPackaged, readAsset, readAssetIndex } from './runtime.js';

// The packaged build carries the hero art inside the exe (SPEC amendment
// 2026-08-10: official Riot project, bundling Riot art is permitted), so the
// folder below only matters when running from source.
const HERO_DIR = process.env.SIDEWAYS_HERO_DIR
  || 'C:\\Users\\sammo\\source\\repos\\sammor327\\flipdeck\\overlaysoftware\\RESOURCES\\IGO-LEGENDS';
const ICON_DIR = path.join(DATA_DIR, 'carddb', 'legends');

const FETCH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  referer: 'https://riftregistry.com/',
};

export const slugify = (name) =>
  String(name).toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9 -]/g, '').trim().replace(/ +/g, '-');

// Champion key: the part of the card name before the comma, letters only.
// Hero filenames normalize the same way (MASTER YI1.png and MASTERYI2.png
// both key to MASTERYI; the trailing digit is the variant for champions with
// two legends).
const champKey = (s) => String(s).toUpperCase().replace(/[^A-Z]/g, '');

let heroByChamp = new Map();
const cachedIcons = new Set();

export async function initLegends() {
  await mkdir(ICON_DIR, { recursive: true });
  try {
    for (const f of await readdir(ICON_DIR)) {
      if (f.endsWith('.webp')) cachedIcons.add(f.slice(0, -5));
    }
  } catch { /* dir just created */ }
  heroByChamp = new Map();
  try {
    // A folder inside the exe cannot be listed, so the build writes an index
    // of the hero filenames next to the art it embedded.
    const names = readAssetIndex('hero/_index.json')
      || (await readdir(HERO_DIR)).filter((f) => f.toLowerCase().endsWith('.png'));
    for (const f of [...names].sort()) {
      const key = champKey(f.replace(/\d+\.png$/i, ''));
      if (!heroByChamp.has(key)) heroByChamp.set(key, []);
      heroByChamp.get(key).push(f);
    }
  } catch (err) {
    console.warn('hero art folder unreadable:', err.message);
  }
}

// Legends not yet in the Rift Registry index. Vendetta shipped 2026-07-31
// (tcgcsv group 24698); remove entries here as the RR index picks them up
// (dedupe below is by slug, so overlap is harmless).
const SUPPLEMENTAL_LEGENDS = [
  'Akali, Rogue Assassin',
  'Ambessa, Matriarch of War',
  'Jayce, Defender of Tomorrow',
  'Kennen, Heart of the Tempest',
  "Mel, Soul's Reflection",
  'Nasus, Curator of the Sands',
  'Renekton, Butcher of the Sands',
  'Shen, Eye of Twilight',
  'Zed, Master of Shadows',
];

// The catalog: every Legend card plus the supplemental set, with art
// availability. Champions with two legends get hero variants by catalog
// order (matches the 1/2 filename suffixes).
export function listLegends() {
  const indexed = allCards()
    .filter((c) => c.type === 'Legend')
    .sort((a, b) => a.cardId.localeCompare(b.cardId))
    .map((c) => ({ name: c.cardName, cardId: c.cardId, domains: c.domains || [] }));
  const seen = new Set(indexed.map((l) => slugify(l.name)));
  const extras = SUPPLEMENTAL_LEGENDS
    .filter((name) => !seen.has(slugify(name)))
    .map((name) => ({ name, cardId: null, domains: [] }));
  const variantIndex = new Map();
  return [...indexed, ...extras].map((l) => {
    const champion = champKey(l.name.split(',')[0]);
    const idx = variantIndex.get(champion) || 0;
    variantIndex.set(champion, idx + 1);
    const heroFiles = heroByChamp.get(champion) || [];
    return {
      slug: slugify(l.name),
      name: l.name,
      cardId: l.cardId,
      domains: l.domains || [],
      champion,
      heroFile: heroFiles[idx] || heroFiles[0] || null,
    };
  });
}

// Battlefield catalog for the panel's dropdowns (typos on air otherwise).
export function listBattlefields() {
  return listByType('Battlefield');
}

// Champion unit catalog. The POV overlay's CHAMPION line is labelled with
// Riftbound's Champion Unit glyph in the designer file, so it names a
// champion unit card, not the legend's first word (Sam, Loop 5). Picking one
// also stages it in that side's featured card slot.
export function listChampionUnits() {
  return listByType('Champion Unit');
}

function listByType(type) {
  return allCards()
    .filter((c) => c.type === type)
    .sort((a, b) => a.cardName.localeCompare(b.cardName))
    .map((c) => ({ cardId: c.cardId, cardName: c.cardName }));
}

const bySlug = () => new Map(listLegends().map((l) => [l.slug, l]));

// Hero art bytes: embedded in the exe, or read off disk when run from source.
export async function readHeroArt(slug) {
  const legend = bySlug().get(slug);
  if (!legend || !legend.heroFile) return null;
  const embedded = readAsset(`hero/${legend.heroFile}`);
  if (embedded) return embedded;
  if (isPackaged) return null;
  try {
    return await readFile(path.join(HERO_DIR, legend.heroFile));
  } catch {
    return null;
  }
}

// RR icon cutouts, cache-first with lazy fetch (same pattern as card art).
export async function readIconArt(slug) {
  if (!bySlug().has(slug)) return null;
  const file = path.join(ICON_DIR, `${slug}.webp`);
  if (cachedIcons.has(slug)) {
    try {
      return await readFile(file);
    } catch {
      cachedIcons.delete(slug);
    }
  }
  try {
    const res = await fetch(`https://riftregistry.com/data/legends/${slug}.webp`, { headers: FETCH_HEADERS });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const tmp = file + '.part';
    await writeFile(tmp, buf);
    await rename(tmp, file);
    cachedIcons.add(slug);
    return buf;
  } catch {
    return null;
  }
}
