// Reaching Rift Registry from somebody else's machine (2026-09-20, Sam:
// "double check the ability to pull matchup matrix data will work on a
// computer that does not have direct ip bypass access to rift registry,
// similar to what we had to check with the card download").
//
// The card download had to be taught to ask the way a browser asks before it
// worked from an ordinary machine. The matchup matrix reads the same site,
// so it has to ask the same way, and there must be nothing in the request
// that only works here: no host the operator's machine has to resolve
// specially, no local build, no key, no cookie. This guards that from the
// source, so the two cannot drift apart on a later change; whether the site
// answers today is a live question a test cannot settle.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server');
const read = (name) => readFile(path.join(SERVER, name), 'utf8');

// The block of headers a module sends, as written.
function headers(src, name) {
  const m = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`));
  assert.ok(m, `${name} is not a plain object literal any more`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*'?([a-z-]+)'?:\s*'([^']*)',?\s*$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

describe('reaching Rift Registry', () => {
  it('asks for the matrix the same way the card download asks', async () => {
    const cards = headers(await read('carddb.js'), 'FETCH_HEADERS');
    const matrix = headers(await read('rrmatrix.js'), 'HEADERS');
    assert.ok(cards['user-agent'], 'the card download sends no browser user agent');
    assert.deepEqual(matrix, cards, 'the matrix and the card download disagree about how to ask');
  });

  it('reads the public site over https, with no host of its own', async () => {
    const src = await read('rrmatrix.js');
    assert.match(src, /'https:\/\/riftregistry\.com'/, 'the matrix no longer defaults to the public site');
    // Anything pinned to an address rather than the name would work here and
    // nowhere else.
    assert.doesNotMatch(src, /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, 'the matrix reaches an IP address directly');
    assert.doesNotMatch(src, /localhost|127\.0\.0\.1/, 'the matrix reaches a local copy');
    assert.doesNotMatch(src, /\bhttp:\/\//, 'the matrix reads over plain http');
  });

  it('sends nothing of this machine with the request', async () => {
    const src = await read('rrmatrix.js');
    for (const secret of ['cookie', 'authorization', 'x-api-key', 'token', 'CARDDB_KEY']) {
      assert.ok(!src.toLowerCase().includes(secret.toLowerCase()), `the matrix sends a ${secret}`);
    }
  });

  it('says which end failed, so an operator can tell a blocked request from an empty event', async () => {
    const src = await read('rrmatrix.js');
    for (const line of ['Could not reach Rift Registry', 'timed out', 'answered HTTP', 'not JSON']) {
      assert.ok(src.includes(line), `no message for "${line}"`);
    }
  });

  it('leaves the operator a way through with no internet at all', async () => {
    // The matrix can always be typed or pasted: the panel offers that beside
    // the event list, so a venue behind a filter is not stuck.
    const panel = await readFile(path.join(SERVER, '..', 'web', 'panel', 'index.html'), 'utf8');
    const row = panel.slice(panel.indexOf('data-scene="matrix"'));
    assert.match(row.slice(0, 1200), /[Pp]aste/, 'the matrix row never mentions pasting the numbers in');
  });
});
