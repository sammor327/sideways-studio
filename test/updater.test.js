import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isNewer, swapScript, finishUpdate, finishUpdatePid, startCommandLine, FINISH_UPDATE_FLAG,
} from '../server/updater.js';

describe('update handover', () => {
  it('orders versions numerically and never trusts a malformed one', () => {
    assert.equal(isNewer('0.10.2', '0.9.9'), true);
    assert.equal(isNewer('v0.14.1', '0.14.0'), true);
    assert.equal(isNewer('0.14.0', '0.14.0'), false);
    assert.equal(isNewer('0.13.9', '0.14.0'), false);
    assert.equal(isNewer('latest', '0.14.0'), false);
    assert.equal(isNewer('1.2', '0.14.0'), false);
  });

  it('knows a handover launch by its flag, and only then', () => {
    assert.equal(finishUpdatePid(['exe', 'exe']), null);
    assert.equal(finishUpdatePid(['exe', 'exe', '--port=4700']), null);
    assert.equal(finishUpdatePid(['exe', 'exe', `${FINISH_UPDATE_FLAG}4242`]), 4242);
    assert.equal(finishUpdatePid(['exe', 'exe', `${FINISH_UPDATE_FLAG}nope`]), 0, 'a handover with no usable pid still swaps');
  });

  it('swaps the new exe in, keeps the old one aside and starts the result', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ss-handover-'));
    try {
      const exe = path.join(dir, 'SidewaysStudio.exe');
      await writeFile(exe, 'old');
      await writeFile(`${exe}.new`, 'new');
      await writeFile(`${exe}.old`, 'leftover from an earlier update');
      const launched = [];
      const swapped = await finishUpdate({ pid: 0, exe, newExe: `${exe}.new`, oldExe: `${exe}.old`, launch: async (p) => { launched.push(p); } });
      assert.equal(swapped, true);
      assert.equal(await readFile(exe, 'utf8'), 'new');
      assert.equal(await readFile(`${exe}.old`, 'utf8'), 'old');
      assert.equal(existsSync(`${exe}.new`), false);
      assert.deepEqual(launched, [exe]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('with nothing downloaded, starts the installed exe untouched', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ss-handover-'));
    try {
      const exe = path.join(dir, 'SidewaysStudio.exe');
      await writeFile(exe, 'old');
      const launched = [];
      const swapped = await finishUpdate({ pid: 0, exe, newExe: `${exe}.new`, oldExe: `${exe}.old`, launch: async (p) => { launched.push(p); } });
      assert.equal(swapped, false);
      assert.equal(await readFile(exe, 'utf8'), 'old');
      assert.deepEqual(launched, [exe]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('waits for the old process, but not past the cap', async () => {
    const started = Date.now();
    // This test process is certainly running, so only the cap ends the wait.
    await finishUpdate({ pid: process.pid, exe: path.join(os.tmpdir(), 'ss-no-such.exe'), waitMs: 600, launch: async () => {} });
    assert.ok(Date.now() - started >= 550, 'waited while the pid was alive');
  });

  it('starts the new version with cmd\'s built-in start, quoted for a path with spaces', () => {
    assert.equal(startCommandLine('C:\\Stream Kit\\SidewaysStudio.exe'), '"start "" "C:\\Stream Kit\\SidewaysStudio.exe""');
  });

  it('keeps the batch fallback free of console programs that read a pipe', () => {
    const s = swapScript({ exe: 'C:\\SS\\SidewaysStudio.exe', newExe: 'C:\\SS\\SidewaysStudio.exe.new', oldExe: 'C:\\SS\\SidewaysStudio.exe.old' });
    const lines = s.split('\r\n');
    const at = (re) => lines.findIndex((l) => re.test(l));
    assert.equal(/\|/.test(s), false, 'no pipes: the find "<pid>" hang');
    assert.equal(/tasklist|find /.test(s), false);
    assert.ok(at(/move \/y "C:\\SS\\SidewaysStudio.exe" "C:\\SS\\SidewaysStudio.exe.old"/) > at(/^ping /), 'waits before it moves anything');
    assert.ok(at(/^start "" "C:\\SS\\SidewaysStudio.exe"$/) > at(/move \/y "C:\\SS\\SidewaysStudio.exe.new"/), 'the new exe starts after it is in place');
    assert.match(lines[lines.length - 2], /del "%~f0"/, 'the script deletes itself last');
  });
});
