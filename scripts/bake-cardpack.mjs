// Bake the card library into the two packs that ship with the app.
//
//   npm run bake:cards              fill in whatever is missing, then seal
//   npm run bake:cards -- --offline seal what is already on this disk
//
// Run on a machine that can reach Rift Registry, which in practice means
// Sam's. Everyone else's copy of the app cannot: the site is private, so
// "Download card database" answers them with a sign-in page and the app has
// no cards at all. That is what these packs are for (server/cardlibrary.js).
//
// Writes packs/ at the repo root:
//   cards-bundle.pack  index + thumbnails + legend cutouts, goes in the exe
//   cards-full.pack    full art, published as a release asset
//   library.json       what an installed copy reads to find the full pack
//
// The downloading is the app's own: this drives server/carddb.js rather than
// keeping a second copy of the fetch rules (browser UA, Referer, which
// origins are allowed) that could drift from the one that ships.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCardDb, allCards, cardDbStatus, syncCardDb, prefetchFullArt, artSourceUrl } from '../server/carddb.js';
import { initLegends, listLegends, readIconArt } from '../server/legends.js';
import { readIndex, readBlob } from '../server/cardstore.js';
import { writePack, sealedSize } from '../server/cardpack.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = path.join(ROOT, 'packs');
const OWNER = 'sammor327';
const REPO = 'sideways-studio';
const NL = String.fromCharCode(10);

const offline = process.argv.includes('--offline');
const mb = (n) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
const step = (n, msg) => console.log(`[${n}/5] ${msg}`);

// The key every release is sealed with. Read, never generated: the build
// script owns creating it, and a bake that invented its own would produce
// packs no shipped build can open.
const secret = (await readFile(path.join(ROOT, '.carddb-key'), 'utf8').catch(() => '')).trim();
if (!secret) {
  console.error(`${NL}  .carddb-key is not there, so these packs would be sealed with a key`);
  console.error('  no release can open. Run npm run build:exe once to generate it,');
  console.error('  then bake. See docs/CARD-STORE.md.');
  process.exit(1);
}

// Progress from the app's own downloader, which runs async and reports through
// the status object the panel polls.
async function follow(label, run) {
  const job = run();
  let last = '';
  for (;;) {
    const { progress } = cardDbStatus();
    if (progress.total) {
      const line = `      ${label}: ${progress.done} of ${progress.total}`;
      if (line !== last) {
        process.stdout.write(`\r${line}   `);
        last = line;
      }
    }
    const done = await Promise.race([job.then(() => true), new Promise((r) => setTimeout(() => r(false), 400))]);
    if (done) break;
  }
  if (last) process.stdout.write(NL);
  return job;
}

step(1, 'reading the card database on this machine');
await initCardDb();

if (!offline) {
  step(2, 'refreshing the index and thumbnails from Rift Registry');
  const r = await follow('thumbnails', () => syncCardDb());
  if (!r.ok) {
    console.warn(`      could not refresh: ${r.error}`);
    console.warn('      baking what is already on this disk instead.');
  }
} else {
  step(2, 'skipping the refresh (--offline)');
}

await initLegends();
const legends = listLegends();

if (!offline) {
  step(3, 'filling in full art and legend cutouts');
  const full = await follow('full art', () => prefetchFullArt());
  if (!full.ok) console.warn(`      full art: ${full.error}`);
  else if (full.errors) console.warn(`      ${full.errors} full art files could not be fetched; they are left out of the pack.`);
  // Cutouts are fetched one at a time by the legend route, which caches them
  // in the store on the way past. A miss is not fatal: the scenes fall back to
  // the hero art that already ships inside the exe.
  let icons = 0;
  for (const l of legends) if (await readIconArt(l.slug)) icons += 1;
  console.log(`      ${icons} of ${legends.length} legend cutouts`);
} else {
  step(3, 'skipping the fill (--offline)');
}

step(4, 'collecting what is on disk');
const index = await readIndex();
if (!index) {
  console.error(`${NL}  There is no card index on this machine to bake. Run it online once.`);
  process.exit(1);
}
const cards = allCards();
const bundle = [{ kind: 'index', id: 'cards', bytes: index }];
const full = [];
let missingThumb = 0;
let missingFull = 0;
for (const card of cards) {
  const thumb = await readBlob('thumb', card.cardId);
  if (thumb) bundle.push({ kind: 'thumb', id: card.cardId, bytes: thumb });
  else if (artSourceUrl(card, 'thumb')) missingThumb += 1;
  const art = await readBlob('full', card.cardId);
  if (art) full.push({ kind: 'full', id: card.cardId, bytes: art });
  else if (artSourceUrl(card, 'full')) missingFull += 1;
}
for (const l of legends) {
  // Through the legend route rather than straight off the store, so a cutout
  // that came from an earlier bake's pack is carried into this one instead of
  // being silently dropped.
  const icon = await readIconArt(l.slug);
  if (icon) bundle.push({ kind: 'legend', id: l.slug, bytes: icon });
}
const bundleBytes = bundle.reduce((n, e) => n + sealedSize(e.bytes.length), 0);
const fullBytes = full.reduce((n, e) => n + sealedSize(e.bytes.length), 0);
console.log(`      ${cards.length} cards, ${bundle.length - 1} bundled files (${mb(bundleBytes)}), ${full.length} full art (${mb(fullBytes)})`);
if (missingThumb || missingFull) {
  console.warn(`      ${missingThumb} thumbnails and ${missingFull} full art files have a source but are not on this disk.`);
  console.warn('      They will be missing from the build; run this again with a connection to fill them in.');
}

// The pack's content digest: what it holds, not when it was made. Two bakes
// over the same art produce the same id, which is how a release skips
// re-uploading 80 MB and how an installed copy knows it already has the art.
function contentId(entries) {
  const h = createHash('sha256');
  for (const e of [...entries].sort((a, b) => `${a.kind}/${a.id}`.localeCompare(`${b.kind}/${b.id}`))) {
    h.update(`${e.kind}/${e.id}:`).update(createHash('sha256').update(e.bytes).digest('hex')).update(NL);
  }
  return h.digest('hex');
}

step(5, 'sealing the packs');
await mkdir(PACKS, { recursive: true });
const built = new Date().toISOString();
const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const bundleSize = await writePack(path.join(PACKS, 'cards-bundle.pack'), bundle, {
  built, version, cards: cards.length, id: contentId(bundle),
}, secret);
// No timestamp in the full pack's own metadata, deliberately: it makes the
// file byte-identical across rebakes of unchanged art, so its checksum is
// stable and nobody downloads 80 MB twice for the same pictures.
const fullId = contentId(full);
const fullSize = await writePack(path.join(PACKS, 'cards-full.pack'), full, { cards: full.length, id: fullId }, secret);
const fullSha = createHash('sha256').update(await readFile(path.join(PACKS, 'cards-full.pack'))).digest('hex');

// What the manifest says about the pack itself. Deliberately no URL: a bake
// happens before the version it ships in is decided, and naming a release here
// published v0.19.0 with a manifest pointing at a v0.18.1 asset that does not
// exist. scripts/build-exe.mjs stamps the URL, the way it does for update.json.
await writeFile(path.join(PACKS, 'library.json'), JSON.stringify({
  sha256: fullSha,
  size: fullSize,
  id: fullId,
  built,
  cards: full.length,
}, null, 2) + NL);

console.log('');
console.log(`  packs/cards-bundle.pack  ${mb(bundleSize)}  index, ${bundle.filter((e) => e.kind === 'thumb').length} thumbnails, ${bundle.filter((e) => e.kind === 'legend').length} cutouts`);
console.log(`  packs/cards-full.pack    ${mb(fullSize)}  ${full.length} full art files`);
console.log(`  packs/library.json       sha256 ${fullSha.slice(0, 16)}...`);
console.log('');
console.log('  npm run build:exe puts the bundle inside the app; npm run release publishes the rest.');
console.log('');
process.exit(0);
