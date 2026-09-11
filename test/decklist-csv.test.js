import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decksFromCsv, fileSlug, parseCsv, uniqueSlugs } from '../server/decklist-csv.js';

describe('parseCsv', () => {
  it('handles quoted fields with commas, escaped quotes and CRLF', () => {
    assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\nd,,f\n'), [
      ['a', 'b, c', 'say "hi"'],
      ['d', '', 'f'],
    ]);
  });

  it('keeps newlines inside a quoted field', () => {
    assert.deepEqual(parseCsv('"one\ntwo",x'), [['one\ntwo', 'x']]);
  });

  it('strips a leading BOM', () => {
    assert.deepEqual(parseCsv('﻿x,y'), [['x', 'y']]);
  });
});

describe('decksFromCsv', () => {
  // The control panel sheet's shape: decks are COLUMNS, list lines are rows.
  const SHEET = [
    ',,',
    'Deck Name,Viktor,,Anu Diana',
    'Event Name,Vegas,,Internal',
    'Player Name,Viktor,,Anu',
    'Deck Info,Legend:,,Legend:',
    ',"1 Viktor, Herald of the Arcane",,"1 Diana, Scorn of the Moon"',
    ',MainDeck:,,MainDeck:',
    ',3 Stupefy,,3 Moonfall',
    ',Runes:,,',
    ',6 Mind Rune,,',
  ].join('\n');

  it('extracts one deck per named column, skipping empty columns', () => {
    const decks = decksFromCsv(SHEET);
    assert.deepEqual(decks.map((d) => d.name), ['Viktor', 'Anu Diana']);
    assert.equal(decks[0].event, 'Vegas');
    assert.equal(decks[0].player, 'Viktor');
    assert.equal(decks[0].list,
      ['Legend:', '1 Viktor, Herald of the Arcane', 'MainDeck:', '3 Stupefy', 'Runes:', '6 Mind Rune'].join('\n'));
    assert.ok(decks[1].list.includes('3 Moonfall'));
  });

  it('refuses a CSV without the sheet label rows', () => {
    assert.throws(() => decksFromCsv('a,b\nc,d'), /Deck Name/);
    assert.throws(() => decksFromCsv('Deck Name,A\nx,y'), /Deck Info/);
  });
});

describe('file slugs', () => {
  it('keeps Unicode letters and drops punctuation', () => {
    assert.equal(fileSlug('学姐不爱我了'), '学姐不爱我了');
    assert.equal(fileSlug("Kai'Sa / Aggro!"), 'kai-sa-aggro');
    assert.equal(fileSlug('...'), 'deck');
    assert.ok(!/[\\/:*?"<>|]/.test(fileSlug('a/b\\c:d*e?f"g<h>i|j')));
  });

  it('suffixes repeated names in run order', () => {
    assert.deepEqual(uniqueSlugs(['Viktor', 'Diana', 'viktor', 'Viktor']), ['viktor', 'diana', 'viktor-2', 'viktor-3']);
  });
});
