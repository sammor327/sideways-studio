import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { indexBodyProblem } from '../server/carddb.js';

// The card index is checked before it is parsed: a host in trouble answers
// HTTP 200 with a page, and that used to surface as "Unexpected token '<'"
// and "is the internet up?" while the internet was up (2026-09-16).
describe('index body check', () => {
  it('accepts a JSON list, with or without a BOM or leading whitespace', () => {
    assert.equal(indexBodyProblem(Buffer.from('[{"cardId":"OGN-001"}]'), 'application/json'), null);
    assert.equal(indexBodyProblem(Buffer.from('﻿  \n[{"cardId":"OGN-001"}]'), 'application/json; charset=utf-8'), null);
    assert.equal(indexBodyProblem(Buffer.from('{"cards":[]}'), ''), null, 'the shape check is the parser\'s job, not this one\'s');
  });

  it('names a web page for what it is, whatever the content type says', () => {
    const page = Buffer.from('<!DOCTYPE html><html><head><title>Just a moment</title></head></html>');
    const problem = indexBodyProblem(page, 'text/html; charset=utf-8');
    assert.match(problem, /web page instead of the card list/);
    assert.doesNotMatch(problem, /Unexpected token/);
    assert.match(indexBodyProblem(page, 'application/json'), /web page/, 'a mislabelled page is still a page');
    assert.equal(indexBodyProblem(Buffer.from('[1]'), 'text/html'), null, 'and the body decides: a JSON list under a wrong label is still the list');
  });

  it('reports an empty or foreign body in plain words', () => {
    assert.match(indexBodyProblem(Buffer.from(''), 'application/json'), /empty card list/);
    assert.match(indexBodyProblem(Buffer.from('oops'), 'text/plain'), /something other than the card list \(text\/plain\)/);
  });
});
