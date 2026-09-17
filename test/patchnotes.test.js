import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions, parseChangelog, sectionFor, sectionText } from '../web/shared/patchnotes.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('patch notes', () => {
  it('parses sections, bullets and paragraphs, newest first', () => {
    const md = [
      '# Notes', 'intro text that belongs to no version',
      '## 0.9.0 (2026-09-14)', '- old thing',
      '## v0.10.0', 'A paragraph.', '* starred bullet', '  - indented bullet', '', '### not a version heading',
    ].join('\n');
    const s = parseChangelog(md);
    assert.deepEqual(s.map((x) => x.version), ['0.10.0', '0.9.0']);
    assert.equal(s[0].date, '');
    assert.deepEqual(s[0].bullets, ['starred bullet', 'indented bullet']);
    assert.deepEqual(s[0].paragraphs, ['A paragraph.']);
    assert.equal(s[1].date, '2026-09-14');
    assert.equal(sectionText(s[0]), 'A paragraph.\n- starred bullet\n- indented bullet');
    assert.equal(sectionFor(s, '0.9.0').bullets[0], 'old thing');
    assert.equal(sectionFor(s, '1.0.0'), null);
  });

  it('orders versions numerically, not as strings', () => {
    assert.ok(compareVersions('0.10.0', '0.9.1') > 0);
    assert.ok(compareVersions('0.9.1', '0.9.10') < 0);
    assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  });

  it('has a section for the version in package.json', async () => {
    const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
    const sections = parseChangelog(await readFile(path.join(ROOT, 'CHANGELOG.md'), 'utf8'));
    const mine = sectionFor(sections, version);
    assert.ok(mine, `CHANGELOG.md has no "## ${version}" section; write the notes before releasing`);
    assert.ok(mine.bullets.length + mine.paragraphs.length > 0, 'the section is empty');
  });
});
