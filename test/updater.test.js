import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, swapScript } from '../server/updater.js';

describe('update handover', () => {
  it('orders versions numerically and never trusts a malformed one', () => {
    assert.equal(isNewer('0.10.2', '0.9.9'), true);
    assert.equal(isNewer('v0.14.1', '0.14.0'), true);
    assert.equal(isNewer('0.14.0', '0.14.0'), false);
    assert.equal(isNewer('0.13.9', '0.14.0'), false);
    assert.equal(isNewer('latest', '0.14.0'), false);
    assert.equal(isNewer('1.2', '0.14.0'), false);
  });

  it('waits for the old process to be gone before it swaps, then forces it', () => {
    const s = swapScript({ exe: 'C:\\SS\\SidewaysStudio.exe', newExe: 'C:\\SS\\SidewaysStudio.exe.new', oldExe: 'C:\\SS\\SidewaysStudio.exe.old', pid: 4242 });
    const lines = s.split('\r\n');
    const at = (re) => lines.findIndex((l) => re.test(l));
    assert.ok(at(/tasklist \/fi "PID eq 4242"/) >= 0, 'polls the old pid');
    assert.ok(at(/taskkill \/pid 4242 \/t \/f/) >= 0, 'ends it by force after the wait');
    assert.ok(at(/^:swap$/) > at(/^:wait$/), 'the wait loop comes before the swap');
    assert.ok(at(/move \/y "C:\\SS\\SidewaysStudio.exe" "C:\\SS\\SidewaysStudio.exe.old"/) > at(/^:swap$/), 'nothing moves before the swap label');
    assert.ok(at(/^start "" "C:\\SS\\SidewaysStudio.exe"$/) > at(/move \/y "C:\\SS\\SidewaysStudio.exe.new"/), 'the new exe starts after it is in place');
    assert.match(lines[lines.length - 2], /del "%~f0"/, 'the script deletes itself last');
    assert.match(s, /if %tries% geq 40 goto force/, 'the wait is capped');
  });
});
