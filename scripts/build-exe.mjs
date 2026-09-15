// Build the portable Windows app: dist/SidewaysStudio.exe.
//
// SPEC: "Single portable Windows .exe. Double-click starts a localhost
// webserver, opens the control panel in the default browser, shows status.
// No install, no admin rights." That is what this produces: one file with the
// server, the panel, every scene and the legend hero art inside it. The only
// thing written outside the exe is a data folder beside it (card database,
// downloaded fonts, the event autosave).
//
// Pipeline: esbuild bundles the ESM server into one CommonJS file, Node's
// single-executable-application support turns that plus the assets into a
// blob, and postject injects the blob into a copy of node.exe.
//
// Run: npm run build:exe
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const DIST = path.join(ROOT, 'dist');
const EXE = path.join(DIST, 'SidewaysStudio.exe');

// Same default as server/legends.js: the hero cutouts ship inside the build
// (SPEC amendment 2026-08-10, official Riot project).
const HERO_DIR = process.env.SIDEWAYS_HERO_DIR
  || 'C:\\Users\\sammo\\source\\repos\\sammor327\\flipdeck\\overlaysoftware\\RESOURCES\\IGO-LEGENDS';

const VERSION = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;

// The secret that seals the card database inside every install (server/
// cardstore.js). Generated once into .carddb-key, which is gitignored, and
// then never changed: a different key makes every installed copy's cache
// unopenable, so it silently downloads the whole database again on upgrade.
// Losing the file costs exactly that one re-download, not an install.
async function cardStoreKey() {
  const file = path.join(ROOT, '.carddb-key');
  try {
    const existing = (await readFile(file, 'utf8')).trim();
    // Anything already there is used as it stands, short or not: regenerating
    // over the operator's own key would be the one unrecoverable mistake here.
    if (existing) return existing;
  } catch { /* first build on this machine */ }
  const key = randomBytes(48).toString('hex');
  await writeFile(file, key + NL);
  console.warn('      generated .carddb-key: the card-store secret for this build.');
  console.warn('      BACK IT UP. Every future release has to be built with the same key,');
  console.warn('      or upgrading installs discard their card cache and download it again.');
  return key;
}
// Where releases are published; must match server/updater.js.
const NL = String.fromCharCode(10);
const OWNER = 'sammor327';
const REPO = 'sideways-studio';

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full, base));
    else out.push({ full, rel: path.relative(base, full).split(path.sep).join('/') });
  }
  return out;
}

const step = (n, msg) => console.log(`[${n}/7] ${msg}`);

step(1, 'cleaning build output and drawing the icon');
await rm(BUILD, { recursive: true, force: true });
await rm(DIST, { recursive: true, force: true });
await mkdir(BUILD, { recursive: true });
await mkdir(DIST, { recursive: true });
// Generated here rather than from the npm script: the clean above would wipe
// an icon written before this ran.
const ICON = path.join(BUILD, 'sideways-studio.ico');
try {
  execFileSync('py', [path.join(ROOT, 'scripts', 'make-icon.py')], { stdio: 'inherit' });
} catch (err) {
  console.warn('      could not draw the icon:', err.message);
}

step(2, 'bundling the server to one CommonJS file');
await esbuild.build({
  entryPoints: [path.join(ROOT, 'server', 'index.js')],
  outfile: path.join(BUILD, 'bundle.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  // ws probes for these native speedups inside a try/catch and works without
  // them; leaving them external keeps the require in place so it fails the
  // way ws expects instead of breaking the build.
  external: ['bufferutil', 'utf-8-validate'],
  // The packaged build has to know its own version to compare against the
  // release channel; from source the same expression falls back to
  // package.json (server/runtime.js).
  define: {
    'process.env.SIDEWAYS_APP_VERSION': JSON.stringify(VERSION),
    // Baked in rather than read from the environment at runtime, so an
    // operator cannot hand the app a key of their own to read the store with.
    'process.env.SIDEWAYS_CARDDB_KEY': JSON.stringify(await cardStoreKey()),
  },
  legalComments: 'none',
  logLevel: 'warning',
});
console.log(`      bundle.cjs ${Math.round((await stat(path.join(BUILD, 'bundle.cjs'))).size / 1024)} KB`);

step(3, 'collecting assets');
const assets = {};
for (const f of await walk(path.join(ROOT, 'web'))) assets[`web/${f.rel}`] = f.full;
const webCount = Object.keys(assets).length;

let heroNames = [];
try {
  heroNames = (await readdir(HERO_DIR)).filter((f) => f.toLowerCase().endsWith('.png'));
  for (const name of heroNames) assets[`hero/${name}`] = path.join(HERO_DIR, name);
} catch {
  console.warn(`      WARNING: hero art folder unreadable (${HERO_DIR}).`);
  console.warn('      The build will work but legend holders fall back to icon cutouts.');
}
// A folder inside the exe cannot be listed, so ship the filenames with it.
const heroIndex = path.join(BUILD, 'hero-index.json');
await writeFile(heroIndex, JSON.stringify(heroNames));
assets['hero/_index.json'] = heroIndex;
console.log(`      ${webCount} web files, ${heroNames.length} hero images`);

step(4, 'generating the single-executable blob');
const seaConfig = path.join(BUILD, 'sea-config.json');
await writeFile(seaConfig, JSON.stringify({
  main: path.join(BUILD, 'bundle.cjs'),
  output: path.join(BUILD, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets,
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });
const blob = await readFile(path.join(BUILD, 'sea-prep.blob'));
console.log(`      blob ${Math.round(blob.length / 1024 / 1024 * 10) / 10} MB`);

step(5, 'copying the node runtime');
await cp(process.execPath, EXE);

// Icon and version info are stamped BEFORE the blob goes in: rcedit rewrites
// the PE resource table, which is where postject puts the payload on Windows,
// so doing it the other way round risks disturbing the injected app.
step(6, 'stamping icon and version info');
try {
  const { rcedit } = await import('rcedit');
  await rcedit(EXE, {
    icon: ICON,
    'version-string': {
      CompanyName: "Turn'em Sideways",
      ProductName: 'Sideways Studio',
      FileDescription: 'Sideways Studio: Riftbound broadcast graphics',
      LegalCopyright: "Built by Sam Morris / Turn'em Sideways",
      OriginalFilename: 'SidewaysStudio.exe',
    },
    'file-version': `${VERSION}.0`,
    'product-version': `${VERSION}.0`,
  });
  console.log('      icon and version info applied');
} catch (err) {
  console.warn('      could not stamp icon or version info:', err.message);
  console.warn('      the app still runs, it just keeps the Node icon.');
}

step(7, 'injecting the app into the runtime');
// The sentinel fuse is a per-build constant and it has changed between Node
// releases (Node 24 does not use the value in the older docs), so read it out
// of the runtime being packaged rather than hardcoding one.
const runtimeBytes = await readFile(EXE);
const fuseMatch = runtimeBytes.toString('latin1').match(/NODE_SEA_FUSE_[0-9a-f]{32}/);
if (!fuseMatch) throw new Error('no SEA sentinel fuse in this Node build; cannot package');
console.log(`      sentinel ${fuseMatch[0]}`);
const { inject } = require('postject');
await inject(EXE, 'NODE_SEA_BLOB', blob, { sentinelFuse: fuseMatch[0] });

// The update manifest that ships alongside the exe as a release asset. The
// app reads it from the release channel's "latest" URL, checks the version,
// and verifies this hash before it swaps anything in.
const exeBytes = await readFile(EXE);
const sha256 = createHash('sha256').update(exeBytes).digest('hex');
await writeFile(path.join(DIST, 'update.json'), JSON.stringify({
  version: VERSION,
  url: `https://github.com/${OWNER}/${REPO}/releases/download/v${VERSION}/SidewaysStudio.exe`,
  sha256,
  size: exeBytes.length,
  notes: '',
  required: false,
}, null, 2) + NL);
await writeFile(path.join(DIST, 'SidewaysStudio.exe.sha256'), `${sha256}  SidewaysStudio.exe${NL}`);

const size = exeBytes.length;
console.log('');
console.log(`  Built ${EXE}`);
console.log(`  version ${VERSION}, sha256 ${sha256.slice(0, 16)}...`);
console.log(`  ${Math.round(size / 1024 / 1024 * 10) / 10} MB, self-contained. Double-click it to run.`);
console.log('  It creates a "data" folder beside itself on first run.');
console.log('');
