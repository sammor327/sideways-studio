// Bulk-render decklist plates from a co-stream control panel's transposed
// "Deck List Database" CSV (decks as columns, list lines as rows).
//
//   npm run decklist:batch -- --csv="C:\...\Deck List Database.csv"
//   npm run decklist:batch -- --csv=... --list             inventory only, no render
//   npm run decklist:batch -- --csv=... --only=Viktor,AnuDiana
//   npm run decklist:batch -- --csv=... --transparent     alpha PNGs for compositing
//   npm run decklist:batch -- --csv=... --no-sideboard    main-board plates
//   npm run decklist:batch -- --csv=... --strict          skip decks with unresolved names
//   npm run decklist:batch -- --csv=... --resume          skip decks already rendered
//   npm run decklist:batch -- --csv=... --out=DIR         default data/decklist/batch
//
// Every plate goes through the running app's own PNG export, which is the
// decklist scene in a headless browser: the same renderer as the broadcast.
// If the app is not running on --port (default 4700), a private copy starts
// on a spare port for the run and stops afterwards.
//
// Unresolved names do NOT block by default: a batch should produce 99 good
// plates and one loud report line, not stop at the first typo in someone
// else's spreadsheet. The miss renders as a named panel and the report prints
// the closest card-database name so the sheet can be fixed and re-run.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decksFromCsv, uniqueSlugs } from '../server/decklist-csv.js';
import { checkLegality, parseDecklist } from '../web/shared/decklist-format.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const flag = (name) => argv.includes(`--${name}`);

const USAGE = 'usage: npm run decklist:batch -- --csv="path\\to\\sheet.csv" [--list] [--only=a,b] [--transparent] [--no-sideboard] [--strict] [--resume] [--out=DIR] [--port=4700]';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Up, and new enough to export PNGs (an older build still running would
// answer /api/state but not the export route).
async function reachable(base) {
  try {
    const res = await fetch(`${base}/api/decklist/export`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function post(base, route, body) {
  const res = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  return res;
}

async function main() {
  const csvPath = arg('csv');
  if (!csvPath) throw new Error(USAGE);
  const only = arg('only')
    ? new Set(arg('only').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
    : null;
  const transparent = flag('transparent');
  const noSideboard = flag('no-sideboard');
  const strict = flag('strict');
  const resume = flag('resume');
  const outDir = path.resolve(arg('out') || path.join(ROOT, 'data', 'decklist', 'batch'));

  const sheet = decksFromCsv(await readFile(csvPath, 'utf8'));
  const picked = sheet.filter((d) => !only || only.has(d.name.toLowerCase()));
  if (!picked.length) throw new Error(`no deck in the sheet matches --only=${[...(only || [])].join(',')}`);

  if (flag('list')) {
    console.log(`${picked.length} deck(s) in ${path.basename(csvPath)}:`);
    for (const d of picked) {
      const parsed = parseDecklist(d.list);
      const warnings = [...parsed.warnings, ...checkLegality(parsed)];
      const main = parsed.main.reduce((t, e) => t + e.qty, 0);
      console.log(`  ${d.name.padEnd(24)} ${d.event.padEnd(18)} ${String(main).padStart(2)} main, ${parsed.sideboard.length} side names`
        + (warnings.length ? `  [${warnings.length} warning(s)]` : ''));
    }
    return;
  }

  // The app that renders: the one already running, or a private copy.
  let base = `http://127.0.0.1:${Number(arg('port') || process.env.SIDEWAYS_PORT || 4700)}`;
  let child = null;
  if (!(await reachable(base))) {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    console.log(`starting a private Sideways Studio on port ${port} for this run…`);
    child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), `--port=${port}`], {
      cwd: ROOT, stdio: 'ignore', windowsHide: true,
    });
    const deadline = Date.now() + 30_000;
    while (!(await reachable(base))) {
      if (Date.now() > deadline || child.exitCode !== null) throw new Error('the app did not start');
      await new Promise((r) => setTimeout(r, 300));
    }
  } else {
    console.log(`using the Sideways Studio already running at ${base}`);
  }

  try {
    const exp = await (await fetch(`${base}/api/decklist/export`)).json();
    if (!exp.available) throw new Error('PNG export needs Microsoft Edge or Google Chrome installed');
    await mkdir(outDir, { recursive: true });

    const slugs = uniqueSlugs(picked.map((d) => d.name));
    const suffix = (transparent ? '-transparent' : '') + (noSideboard ? '-mainboard' : '');
    let rendered = 0;
    let skipped = 0;
    let failed = 0;

    for (const [i, entry] of picked.entries()) {
      const deck = await (await post(base, '/api/decklist/parse', { list: entry.list })).json();
      const flags = [
        ...deck.unresolved.map((n) => {
          const near = (deck.suggestions[n] || [])[0];
          return `unresolved "${n}"${near ? ` (closest: ${near})` : ''}`;
        }),
        ...deck.warnings,
      ];
      const report = () => { for (const f of flags) console.log(`    ! ${f}`); };

      if (strict && deck.unresolved.length) {
        skipped += 1;
        console.log(`\nx ${entry.name}: skipped (--strict)`);
        report();
        continue;
      }
      const output = path.join(outDir, `${slugs[i]}${suffix}.png`);
      if (resume && existsSync(output)) {
        skipped += 1;
        // Still worth the report: a resumed run is how the sheet gets re-checked.
        if (flags.length) { console.log(`\n- ${entry.name}: already rendered`); report(); }
        continue;
      }

      const res = await post(base, '/api/decklist/render', {
        list: entry.list, background: !transparent, showSideboard: !noSideboard, save: false,
      });
      if (!res.ok) {
        failed += 1;
        const err = await res.json().catch(() => ({}));
        console.log(`\nx ${entry.name}: render failed: ${err.error || res.status}`);
        report();
        continue;
      }
      await writeFile(output, Buffer.from(await res.arrayBuffer()));
      rendered += 1;
      console.log(`\nok ${entry.name} -> ${path.relative(ROOT, output)}`);
      report();
    }

    console.log(`\n${rendered} rendered, ${skipped} skipped, ${failed} failed -> ${outDir}`);
    if (failed) process.exitCode = 1;
  } finally {
    if (child && child.exitCode === null) child.kill();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
