// Saved decklists: the operator's prep for an event, pasted and checked in
// the deck editor before the show, then loaded into preview one click at a
// time during it.
//
// Deliberately NOT part of the bussed state: every state change is pushed to
// every open scene, and a hundred saved lists riding along on each score
// click would multiply that traffic for data no scene reads. The library has
// its own file and endpoint, and announces changes with a version number the
// panel and editor listen for over the same WebSocket.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './runtime.js';
import { cleanMultiline, cleanStr } from './state.js';

const FILE = path.join(DATA_DIR, 'decklists.json');
const MAX_DECKS = 300;

let library = { version: 0, decks: [] };
const listeners = new Set();
let saveChain = Promise.resolve();

function cleanDeck(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanStr(raw.name ?? '', 60);
  const list = cleanMultiline(raw.list ?? '', 6000);
  if (!name || !list.trim()) return null;
  return {
    name,
    list,
    background: raw.background !== false,
    showSideboard: raw.showSideboard !== false,
    event: cleanStr(raw.event ?? '', 80),
    player: cleanStr(raw.player ?? '', 60),
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt.slice(0, 40) : new Date().toISOString(),
  };
}

export async function initLibrary() {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8'));
    if (Array.isArray(raw.decks)) library.decks = raw.decks.map(cleanDeck).filter(Boolean).slice(0, MAX_DECKS);
  } catch {
    // First run or unreadable file: an empty library.
  }
}

export const getLibrary = () => library;

export function onLibraryChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  const snapshot = JSON.stringify({ decks: library.decks }, null, 2);
  // Serialised, and temp + rename, so a crash mid-write never leaves half a
  // library behind.
  saveChain = saveChain.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(FILE + '.part', snapshot);
    await rename(FILE + '.part', FILE);
  }).catch((err) => console.warn('deck library save failed:', err.message));
}

// Upsert by name, case-insensitively: "Viktor" saved twice is one deck.
function upsert(deck) {
  const i = library.decks.findIndex((d) => d.name.toLowerCase() === deck.name.toLowerCase());
  if (i >= 0) library.decks[i] = deck;
  else if (library.decks.length < MAX_DECKS) library.decks.push(deck);
  else return false;
  return true;
}

// Actions: { save: deck } | { remove: name } | { import: [deck, ...] }.
export function applyLibrary(patch) {
  if (!patch || typeof patch !== 'object') return { ok: false, error: 'invalid body' };
  let changed = 0;
  let error = null;

  if (patch.save !== undefined) {
    const deck = cleanDeck({ ...patch.save, savedAt: new Date().toISOString() });
    if (!deck) error = 'a saved deck needs a name and a list';
    else if (!upsert(deck)) error = `the library is full (${MAX_DECKS} decks)`;
    else changed += 1;
  } else if (patch.remove !== undefined) {
    const name = cleanStr(patch.remove, 60).toLowerCase();
    const before = library.decks.length;
    library.decks = library.decks.filter((d) => d.name.toLowerCase() !== name);
    changed = before - library.decks.length;
  } else if (Array.isArray(patch.import)) {
    for (const raw of patch.import.slice(0, MAX_DECKS)) {
      const deck = cleanDeck({ ...raw, savedAt: new Date().toISOString() });
      if (deck && upsert(deck)) changed += 1;
    }
  } else {
    return { ok: false, error: 'unknown library action' };
  }

  if (changed) {
    library.version += 1;
    persist();
    for (const fn of listeners) fn(library);
  }
  return error ? { ok: false, error, library } : { ok: true, changed, library };
}
