// Reader for a co-stream control panel's "Deck List Database" sheet, ported
// from FlipDeck's src/lib/decks/csv.ts. The sheet is TRANSPOSED: each deck is
// a COLUMN, with labelled rows for Deck Name / Event Name / Player Name at the
// top and the decklist below the "Deck Info" row, one paste-format line per
// cell ("Legend:", "3 Stupefy", "MainDeck:", "6 Mind Rune", ...).
//
// Pure: callers hand the file's TEXT in and get per-deck paste text back.
// Parsing and resolution stay with the decklist module like every other path
// into the plate.

// Minimal RFC 4180: quoted fields with commas, doubled quotes and newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  // Strip a BOM so the first header cell compares clean.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const labelRow = (rows, label) =>
  rows.find((r) => (r[0] ?? '').trim().toLowerCase() === label) ?? null;

// Every deck column in the sheet, skipping columns with no name or no list.
// The decklist body is the "Deck Info" row and everything below it.
export function decksFromCsv(text) {
  const rows = parseCsv(text);
  const names = labelRow(rows, 'deck name');
  if (!names) throw new Error('not a deck database CSV: no "Deck Name" row');
  const events = labelRow(rows, 'event name') ?? [];
  const players = labelRow(rows, 'player name') ?? [];
  const bodyStart = rows.findIndex((r) => (r[0] ?? '').trim().toLowerCase() === 'deck info');
  if (bodyStart < 0) throw new Error('not a deck database CSV: no "Deck Info" row');

  const out = [];
  for (let col = 1; col < names.length; col += 1) {
    const name = (names[col] ?? '').trim();
    if (!name) continue;
    const lines = rows
      .slice(bodyStart)
      .map((r) => (r[col] ?? '').trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    out.push({
      name,
      event: (events[col] ?? '').trim(),
      player: (players[col] ?? '').trim(),
      list: lines.join('\n'),
    });
  }
  return out;
}

// File-name stem that keeps Unicode letters: half of one real sheet's deck
// names are Chinese, and "学姐不爱我了.png" beats "deck-17.png".
export function fileSlug(name) {
  return String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'deck';
}

// Unique stems for a run: the second "Viktor" becomes "viktor-2".
export function uniqueSlugs(names) {
  const used = new Map();
  return names.map((n) => {
    const base = fileSlug(n);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}
