// Publish a release: build the exe, write the manifest, push it to GitHub.
//
// Every installed copy checks
//   https://github.com/<owner>/<repo>/releases/latest/download/update.json
// on launch, so publishing a release IS the update mechanism. Nothing else to
// keep in sync.
//
//   npm run release                          -- optional update
//   npm run release -- --notes "What changed"
//   npm run release -- --required            -- installs itself on an
//                                               unattended launch
//
// Bump the version in package.json first: a release whose version is not
// newer than what people are running is ignored by every client.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const EXE = path.join(DIST, 'SidewaysStudio.exe');
const MANIFEST = path.join(DIST, 'update.json');
const OWNER = 'sammor327';
const REPO = 'sideways-studio';
const SLUG = `${OWNER}/${REPO}`;

const args = process.argv.slice(2);
const required = args.includes('--required');
const notesIdx = args.indexOf('--notes');
const notes = notesIdx >= 0 ? (args[notesIdx + 1] || '') : '';
const skipBuild = args.includes('--no-build');

// execFileSync returns null when stdio is inherited, so do not assume a string.
const gh = (a, opts = {}) => (execFileSync('gh', a, { encoding: 'utf8', ...opts }) || '').trim();

const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const tag = `v${version}`;
console.log(`Releasing Sideways Studio ${tag}${required ? ' (required)' : ''}`);

// 1. The repo has to exist and be public, or nobody can download the update.
try {
  const info = JSON.parse(gh(['repo', 'view', SLUG, '--json', 'visibility,name']));
  if (info.visibility !== 'PUBLIC') {
    console.error(`\n  ${SLUG} is ${info.visibility}. Release assets on a private repo need a`);
    console.error('  credential to download, which the app does not carry. Make it public or');
    console.error('  move the update channel to your own host (SIDEWAYS_UPDATE_URL).');
    process.exit(1);
  }
} catch {
  console.error(`\n  ${SLUG} does not exist yet. Create it and push once:`);
  console.error(`\n    gh repo create ${SLUG} --public --source . --remote origin --push`);
  console.error('\n  Note what that publishes: the source tree, which includes the bundled');
  console.error('  Beaufort for LOL font and the baked scene plates derived from the design');
  console.error('  PSDs. The release asset itself also carries the 50 legend hero cutouts.');
  process.exit(1);
}

// 2. Refuse to reuse a tag: an installed copy compares versions, so shipping
//    new bytes under an old version would reach nobody.
try {
  gh(['release', 'view', tag, '--repo', SLUG, '--json', 'tagName'], { stdio: ['ignore', 'pipe', 'ignore'] });
  console.error(`\n  ${tag} is already released. Bump "version" in package.json first.`);
  process.exit(1);
} catch { /* not found is what we want */ }

// 3. Build.
if (!skipBuild) {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-exe.mjs')], { stdio: 'inherit' });
} else if (!existsSync(EXE)) {
  console.error('\n  --no-build was passed but dist/SidewaysStudio.exe is not there.');
  process.exit(1);
}

// 4. Fold this release's flags into the manifest the build just wrote.
const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
if (manifest.version !== version) {
  console.error(`\n  dist/update.json says ${manifest.version} but package.json says ${version}. Rebuild.`);
  process.exit(1);
}
manifest.notes = notes;
manifest.required = required;
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + String.fromCharCode(10));
console.log(`  manifest: ${manifest.version}, sha256 ${manifest.sha256.slice(0, 16)}...`);

// 5. Push the commit the exe was built from, and pin the tag to it. Without
//    --target GitHub tags whatever main is on the server, which is the
//    PREVIOUS release when the commit has not been pushed yet (v0.4.0 landed
//    on the 0.3.0 commit that way and had to be re-pointed by hand). A dirty
//    tree is refused for the same reason: the exe embeds the working files,
//    so a tag would name code that is not in it.
const git = (a) => (execFileSync('git', a, { encoding: 'utf8', cwd: ROOT }) || '').trim();
if (git(['status', '--porcelain']) && !args.includes('--allow-dirty')) {
  console.error('\n  The working tree has uncommitted changes. Commit them first (or pass --allow-dirty).');
  process.exit(1);
}
const head = git(['rev-parse', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
execFileSync('git', ['push', 'origin', branch], { stdio: 'inherit', cwd: ROOT });

// 6. Publish. update.json must be an asset on the release, because
//    /releases/latest/download/update.json is the URL every client polls.
gh([
  'release', 'create', tag,
  EXE, MANIFEST, path.join(DIST, 'SidewaysStudio.exe.sha256'),
  '--repo', SLUG,
  '--target', head,
  '--title', `Sideways Studio ${version}`,
  '--notes', notes || `Sideways Studio ${version}`,
], { stdio: 'inherit' });

console.log('');
console.log(`  Published ${tag}.`);
console.log(`  Every installed copy picks it up on its next launch:`);
console.log(`  https://github.com/${SLUG}/releases/latest/download/update.json`);
console.log('');
