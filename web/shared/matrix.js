// The matchup matrix (2026-09-19, Sam: "a legend matchup matrix scene. Pull
// reference from rift registry").
//
// Rift Registry's matchup matrix is the reference: the grid on its event
// analysis page and the one on its broadcast stage. Rows are "your legend",
// columns the opponent's, and a cell is the row legend's win rate against
// the column legend with its record under it. The axes are one list (Rift
// Registry links them, so the grid is always square), the most played
// legends open it, the diagonal (mirror matches) carries no number, a cell
// with fewer than a minimum number of matches stays blank (Rift Registry's
// "Min matches", 5 by default), and an Overall column closes each row.
//
// Where it departs from Rift Registry, on purpose:
//  - A win rate is wins over wins and losses, draws left out (Rift Registry
//    counts a draw as half a win). That is how the legend distribution
//    counts, so its win rate and this graphic's Overall column agree for
//    the same event.
//  - The five colour tiers are symmetric about 50. Rift Registry's even
//    band is 48 to 54, so a 53 and its mirror, the 47 on the other side of
//    the grid, landed in different tiers. Here a cell and its mirror always
//    sit in mirrored tiers.
//  - The colours are the data-viz reference's diverging pair stepped for
//    this dark panel, blue for the row legend ahead and a warm orange for it
//    behind, not green and red, which a red-green colour-blind viewer cannot
//    tell apart. Checked with that palette's validator: each arm is a valid
//    ordinal ramp against the panel (#10151d), every pair of the five stays
//    at least 8 apart under protanopia and deuteranopia (OKLab x100), and
//    white text clears 4.9:1 on every one of them.
//
// The numbers live here once, shared by the scene, the panel (the paste
// editor and the highlight grid), the Tournament platform's and Rift
// Registry's loaders and the tests, so what the operator reads back and what
// airs come from the same arithmetic. Plain ESM with no browser or Node
// dependencies, like look.js.
//
// event.matrix = { legends, pairs, title, label, note, source }
//   legends[i] = { legend, legendSlug, legendCardId, players, wins, losses, draws }
//     players: how many brought it (0 when not known); wins, losses, draws:
//     its record against every OTHER legend, the Overall column, which can
//     count opponents that are not in the list.
//   pairs[k] = { a, b, wins, losses, draws }, a < b, indexes into legends:
//     legends[a]'s record against legends[b]; b's is the same the other way.
//   title: the event the numbers are from when it is not this one (a Rift
//   Registry event), printed in place of this event's name; label: the rest
//   of the sub line ("after Round 6 · top cut included"); note: how the
//   numbers were counted (the foot line); source: whose numbers they are,
//   credited on the graphic ("Rift Registry", "TopDeck.gg"), empty for typed
//   ones.

export const LEGENDS_MAX = 40;
export const PAIRS_MAX = (LEGENDS_MAX * (LEGENDS_MAX - 1)) / 2;
// How many legends the grid shows across and down: the most played `size`,
// or the legends picked by hand (at most SIZE_MAX).
export const SIZE_MIN = 4;
export const SIZE_MAX = 12;
export const SIZE_DEFAULT = 8;
export const MIN_MATCHES_DEFAULT = 5;
export const MIN_MATCHES_MAX = 50;

// The tiers, left to right as the key under the grid reads, on the win rate
// rounded to a whole percent (the number the cell prints), so the colour
// always agrees with the printed number.
export const TIERS = [
  { key: 'dn2', color: '#b53e02', label: '40% or less' },
  { key: 'dn1', color: '#8a2e02', label: '41–45%' },
  { key: 'even', color: '#2c2c2a', label: '46–54%' },
  { key: 'up1', color: '#184f95', label: '55–59%' },
  { key: 'up2', color: '#256abf', label: '60% or more' },
];
export const TIER_COLORS = Object.fromEntries(TIERS.map((t) => [t.key, t.color]));

// A win rate as the cell prints it, a whole percent, rounded half away from
// 50: 54.5 prints 55 and its mirror, 45.5, prints 45, so a cell and its
// mirror always add up to 100 (Math.round alone would print 55 and 46).
export function pctRound(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(Number(pct))) return null;
  const x = Number(pct);
  return x >= 50 ? Math.round(x) : 100 - Math.round(100 - x);
}

export function tierOf(pct) {
  const p = pctRound(pct);
  if (p === null) return '';
  if (p >= 60) return 'up2';
  if (p >= 55) return 'up1';
  if (p > 45) return 'even';
  if (p > 40) return 'dn1';
  return 'dn2';
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const count = (v) => Math.max(0, Math.trunc(num(v)));

// Wins over wins and losses, in percent; null with neither.
export const winPct = (wins, losses) => {
  const w = count(wins);
  const l = count(losses);
  return w + l > 0 ? (w / (w + l)) * 100 : null;
};

export const normLegend = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

// A legend's key, the one the legend distribution's highlight uses: its
// slug, else its name squeezed (a typed legend the catalog did not know).
export const legendKey = (l) => (l ? l.legendSlug || (normLegend(l.legend) ? `n:${normLegend(l.legend)}` : '') : '');

// "Kai'Sa, Daughter of the Void" -> the champion and the title.
export function splitLegend(name) {
  const s = String(name || '').trim();
  const i = s.indexOf(',');
  return i < 0 ? { champion: s, title: '' } : { champion: s.slice(0, i).trim(), title: s.slice(i + 1).trim() };
}

// --- cleaning (the store's whitelist, shared so the tests hold it too) ---

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const slugOf = (v) => {
  const s = str(v, 60);
  return /^[a-z0-9-]*$/.test(s) ? s : '';
};
const cardIdOf = (v) => {
  const s = str(v, 16);
  return /^[A-Za-z0-9-]*$/.test(s) ? s : '';
};
const CAP = 999999;
const clampCount = (v) => Math.min(CAP, count(v));

// Legends and pairs as the store keeps them: at most LEGENDS_MAX legends,
// each named, one entry per legend (a repeat's numbers are added to the
// first), pairs pointing at two different legends that exist, a < b, one
// entry per pair (repeats added up), and none with no matches at all.
export function cleanMatrix(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const legends = [];
  const at = new Map();
  const moved = new Map();
  (Array.isArray(src.legends) ? src.legends : []).forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    const legend = str(r.legend, 60);
    const legendSlug = slugOf(r.legendSlug);
    if (!legend && !legendSlug) return;
    const row = {
      legend, legendSlug, legendCardId: cardIdOf(r.legendCardId),
      players: clampCount(r.players), wins: clampCount(r.wins), losses: clampCount(r.losses), draws: clampCount(r.draws),
    };
    const key = legendKey(row);
    if (at.has(key)) {
      const cur = legends[at.get(key)];
      for (const k of ['players', 'wins', 'losses', 'draws']) cur[k] = Math.min(CAP, cur[k] + row[k]);
      moved.set(i, at.get(key));
      return;
    }
    if (legends.length >= LEGENDS_MAX) return;
    at.set(key, legends.length);
    moved.set(i, legends.length);
    legends.push(row);
  });
  const pairs = new Map();
  for (const p of (Array.isArray(src.pairs) ? src.pairs : []).slice(0, PAIRS_MAX * 2)) {
    if (!p || typeof p !== 'object') continue;
    const ra = Number(p.a);
    const rb = Number(p.b);
    if (!Number.isInteger(ra) || !Number.isInteger(rb) || !moved.has(ra) || !moved.has(rb)) continue;
    let a = moved.get(ra);
    let b = moved.get(rb);
    if (a === b) continue;
    let wins = clampCount(p.wins);
    let losses = clampCount(p.losses);
    const draws = clampCount(p.draws);
    if (a > b) { [a, b] = [b, a]; [wins, losses] = [losses, wins]; }
    if (!wins && !losses && !draws) continue;
    const key = `${a}|${b}`;
    const cur = pairs.get(key);
    if (cur) {
      cur.wins = Math.min(CAP, cur.wins + wins);
      cur.losses = Math.min(CAP, cur.losses + losses);
      cur.draws = Math.min(CAP, cur.draws + draws);
    } else pairs.set(key, { a, b, wins, losses, draws });
  }
  return { legends, pairs: [...pairs.values()].sort((x, y) => x.a - y.a || x.b - y.b) };
}

// The highlight: a legend's row, its column, or both (the cell where they
// cross; the same legend twice is its row and its column). Keys as
// legendKey makes them.
const FOCUS_KEY = /^(?:[a-z0-9-]{1,60}|n:[a-z0-9]{1,60})$/;
export function cleanKey(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  return FOCUS_KEY.test(key) ? key : '';
}
export function cleanFocus(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  return { row: cleanKey(f.row), col: cleanKey(f.col) };
}
// The legends picked by hand for the axes: no repeats, at most SIZE_MAX.
export function cleanPick(raw) {
  return Array.isArray(raw) ? [...new Set(raw.map(cleanKey).filter(Boolean))].slice(0, SIZE_MAX) : [];
}

// --- the view: what the graphic draws ---

// Most played first: players, then matches against other legends, then the
// name.
const played = (l) => l.wins + l.losses + l.draws;
function rank(list) {
  return [...list].sort((x, y) => y.players - x.players || played(y) - played(x) || x.legend.localeCompare(y.legend));
}

// Everything the grid shows. axis: the legends across the top and down the
// side, most played first (the ones picked by hand when at least two of
// them are in the data). cells[r][c]: row legend axis[r] against column
// legend axis[c]: its record, total, win rate (null with no decided match),
// whether it is shown (at least minMatches matches and a decided one) and
// its tier; the diagonal is `self`. A cell's matches are the decided ones,
// wins and losses, the ones its win rate stands on; draws print in the
// record but count for neither. overall[r]: the row legend against every
// other legend. legends: how many the data holds; matches: every decided
// match between two different legends in it (each counted once); blank:
// cells off the diagonal left blank for too few matches (with at least one).
export function matrixView(matrix, { size = SIZE_DEFAULT, pick = [], minMatches = MIN_MATCHES_DEFAULT } = {}) {
  const { legends, pairs } = cleanMatrix(matrix);
  const all = legends.map((l, i) => ({ ...l, i, key: legendKey(l) }));
  const ranked = rank(all);
  const n = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.trunc(num(size)) || SIZE_DEFAULT));
  const want = new Set(cleanPick(pick));
  const chosen = ranked.filter((l) => want.has(l.key));
  const picked = chosen.length >= 2;
  const axis = picked ? chosen : ranked.slice(0, n);
  const min = Math.min(MIN_MATCHES_MAX, Math.max(1, Math.trunc(num(minMatches)) || MIN_MATCHES_DEFAULT));

  const rec = new Map();
  for (const p of pairs) {
    rec.set(`${p.a}|${p.b}`, { wins: p.wins, losses: p.losses, draws: p.draws });
    rec.set(`${p.b}|${p.a}`, { wins: p.losses, losses: p.wins, draws: p.draws });
  }
  let blank = 0;
  const cells = axis.map((row) => axis.map((col) => {
    if (row.i === col.i) return { self: true, wins: 0, losses: 0, draws: 0, total: 0, pct: null, shown: false, tier: '' };
    const r = rec.get(`${row.i}|${col.i}`) || { wins: 0, losses: 0, draws: 0 };
    const total = r.wins + r.losses;
    const pct = winPct(r.wins, r.losses);
    const shown = total >= min;
    if (!shown && total + r.draws > 0) blank += 1;
    return { self: false, ...r, total, pct, shown, tier: shown ? tierOf(pct) : '' };
  }));
  const overall = axis.map((l) => {
    const pct = winPct(l.wins, l.losses);
    return { wins: l.wins, losses: l.losses, draws: l.draws, total: l.wins + l.losses, pct, tier: pct === null ? '' : tierOf(pct) };
  });
  const matches = pairs.reduce((s, p) => s + p.wins + p.losses, 0);
  return {
    axis, cells, overall, picked, minMatches: min,
    legends: legends.length, matches, blank,
    missing: [...want].filter((k) => !all.some((l) => l.key === k)),
  };
}

// The cell a highlight names, as axis indexes: row r, column c, either -1.
export function focusAt(view, focus) {
  const f = cleanFocus(focus);
  const find = (key) => (key ? view.axis.findIndex((l) => l.key === key) : -1);
  return { r: find(f.row), c: find(f.col) };
}

// --- tallying games (the Tournament platform's and Rift Registry's) ---
//
// players: one legend identity ({ legend, legendSlug, legendCardId }) per
// player who brought one, for the counts. games: { a, b, result }, a and b
// legend identities, result 'a' or 'b' (who won) or 'd' (a draw). A mirror
// match says nothing about one legend against another, so it is counted
// aside; so is a game with a side whose legend is not known (unknownGames).
export function tallyMatrix({ players = [], games = [] } = {}) {
  const rows = new Map();
  const get = (id) => {
    const key = legendKey(id);
    if (!key) return null;
    if (!rows.has(key)) {
      rows.set(key, {
        legend: str(id.legend, 60), legendSlug: slugOf(id.legendSlug), legendCardId: cardIdOf(id.legendCardId),
        players: 0, wins: 0, losses: 0, draws: 0, vs: new Map(),
      });
    }
    return rows.get(key);
  };
  for (const p of players) {
    const r = p && get(p);
    if (r) r.players += 1;
  }
  let matches = 0;
  let mirrors = 0;
  let draws = 0;
  let unknownGames = 0;
  for (const g of games) {
    const A = g && g.a && get(g.a);
    const B = g && g.b && get(g.b);
    if (!A || !B || !['a', 'b', 'd'].includes(g.result)) { unknownGames += 1; continue; }
    if (A === B) { mirrors += 1; continue; }
    const vsA = A.vs.get(B) || { wins: 0, losses: 0, draws: 0 };
    A.vs.set(B, vsA);
    if (g.result === 'd') {
      draws += 1;
      A.draws += 1; B.draws += 1; vsA.draws += 1;
    } else {
      matches += 1;
      const aWon = g.result === 'a';
      A[aWon ? 'wins' : 'losses'] += 1;
      B[aWon ? 'losses' : 'wins'] += 1;
      vsA[aWon ? 'wins' : 'losses'] += 1;
    }
  }
  const list = rank([...rows.values()]).slice(0, LEGENDS_MAX);
  const index = new Map(list.map((r, i) => [r, i]));
  const pairs = [];
  for (const r of list) {
    for (const [o, v] of r.vs) {
      if (!index.has(o)) continue;
      const a = index.get(r);
      const b = index.get(o);
      pairs.push(a < b ? { a, b, ...v } : { a: b, b: a, wins: v.losses, losses: v.wins, draws: v.draws });
    }
  }
  const legends = list.map(({ vs, ...l }) => l);
  const clean = cleanMatrix({ legends, pairs });
  return { ...clean, matches, mirrors, draws, unknownGames, dropped: Math.max(0, rows.size - list.length) };
}

// --- the panel's paste ---
//
// One matchup per line: the row legend, the column legend, then the row
// legend's record against it (wins-losses, a draw count may follow).
//   Kai'Sa vs Jinx | 12-8
//   Kai'Sa | Jinx | 12-8-1        pipes or tabs, as a spreadsheet pastes
//   Viktor vs Draven 6-9
// A second line for the same two legends adds to the first, either way
// round. A legend line gives a legend what matchup lines cannot: how many
// played it, and its record against every other legend (the Overall
// column) when that counts more than the matchups listed, as a loaded
// event's does (its legends also played legends left off the list):
//   Kai'Sa, Daughter of the Void | 42 players | 74-63-2 overall
// Without one, a legend's players are not known (the grid ranks it by its
// matches) and its Overall column adds up its typed matchups. The editor
// writes data back with these lines where they carry something
// (matrixToText), so editing one matchup of a loaded event loses nothing
// the lines do not show (review, 2026-09-19: it used to zero every
// legend's players and re-rank the grid).
const RECORD = /^(\d{1,6})\s*[-\u2013]\s*(\d{1,6})(?:\s*[-\u2013]\s*(\d{1,6}))?$/;
const VS = /\s+(?:vs\.?|v\.?|versus)\s+/i;
const PLAYERS = /^(\d{1,6})(?:\s+players?)?$/i;
const overallOf = (s) => {
  const m = String(s).match(/^(.*?)\s+overall$/i);
  return m ? m[1].trim().match(RECORD) : null;
};
export function parseMatchupLines(text, resolve) {
  const legends = [];
  const at = new Map();
  const pairs = [];
  const overall = new Map();
  const bad = [];
  const unknown = [];
  const legendOf = (name) => {
    const typed = str(name, 60);
    const hit = resolve ? resolve(typed) : null;
    const id = hit ? { legend: hit.legend, legendSlug: hit.legendSlug || '', legendCardId: hit.legendCardId || '' } : { legend: typed, legendSlug: '', legendCardId: '' };
    if (!hit && !unknown.includes(typed)) unknown.push(typed);
    const key = legendKey(id);
    if (!at.has(key)) {
      at.set(key, legends.length);
      legends.push({ ...id, players: 0, wins: 0, losses: 0, draws: 0 });
    }
    return at.get(key);
  };
  for (const raw of String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 800)) {
    let left;
    let right;
    let record;
    const parts = /[|\t]/.test(raw) ? raw.split(/\s*[|\t]\s*/).filter(Boolean) : null;
    // A legend line: the legend, then its players, its overall record, or
    // both, in either order.
    if (parts && parts.length >= 2 && parts.length <= 3 && !VS.test(` ${parts[0]} `)
      && parts.slice(1).every((x) => PLAYERS.test(x) || overallOf(x))) {
      if (!normLegend(parts[0])) { bad.push(raw); continue; }
      const i = legendOf(parts[0]);
      for (const x of parts.slice(1)) {
        const n = x.match(PLAYERS);
        if (n) legends[i].players = Number(n[1]);
        else {
          const o = overallOf(x);
          overall.set(i, { wins: Number(o[1]), losses: Number(o[2]), draws: Number(o[3] || 0) });
        }
      }
      continue;
    }
    if (parts && parts.length === 3) [left, right, record] = parts;
    else {
      const body = parts && parts.length === 2 ? parts.join(' ') : raw;
      const m = body.match(/^(.*?)[\s:]+(\d{1,6}\s*[-\u2013]\s*\d{1,6}(?:\s*[-\u2013]\s*\d{1,6})?)$/);
      const names = m ? m[1].replace(/[:|]\s*$/, '').split(VS) : [];
      if (names.length === 2) [left, right, record] = [names[0], names[1], m[2]];
    }
    const rec = String(record || '').trim().match(RECORD);
    if (!left || !right || !rec || !normLegend(left) || !normLegend(right)) { bad.push(raw); continue; }
    const a = legendOf(left);
    const b = legendOf(right);
    if (a === b) { bad.push(raw); continue; }
    pairs.push({ a, b, wins: Number(rec[1]), losses: Number(rec[2]), draws: Number(rec[3] || 0) });
  }
  // The Overall column: a legend line's own record, else every typed
  // matchup, each side's own way round.
  for (const [i, sum] of pairSums(legends.length, pairs).entries()) Object.assign(legends[i], overall.get(i) || sum);
  const clean = cleanMatrix({ legends, pairs });
  return { ...clean, bad, unknown, over: legends.length > LEGENDS_MAX };
}

// Each legend's matchups added up, its own way round.
function pairSums(n, pairs) {
  const sums = Array.from({ length: n }, () => ({ wins: 0, losses: 0, draws: 0 }));
  for (const p of pairs) {
    const A = sums[p.a];
    const B = sums[p.b];
    A.wins += p.wins; A.losses += p.losses; A.draws += p.draws;
    B.wins += p.losses; B.losses += p.wins; B.draws += p.draws;
  }
  return sums;
}

const recordText = (r) => `${r.wins}-${r.losses}${r.draws ? `-${r.draws}` : ''}`;

// The data written back in the paste's shape, most played legend first, so
// the editor shows what resolved: a legend line for each legend with
// players or an overall record its matchups do not add up to, then one
// line per pair with full legend names.
export function matrixToText(matrix) {
  const { legends, pairs } = cleanMatrix(matrix);
  const order = rank(legends.map((l, i) => ({ ...l, i })));
  const place = new Map(order.map((l, k) => [l.i, k]));
  const sums = pairSums(legends.length, pairs);
  const heads = order.map((l) => {
    const s = sums[l.i];
    const own = l.wins !== s.wins || l.losses !== s.losses || l.draws !== s.draws;
    if (!l.players && !own) return '';
    return [l.legend, l.players ? plural(l.players, 'player') : '', own ? `${recordText(l)} overall` : ''].filter(Boolean).join(' | ');
  }).filter(Boolean);
  const lines = pairs.map((p) => {
    const flip = place.get(p.a) > place.get(p.b);
    const [x, y, w, l] = flip ? [p.b, p.a, p.losses, p.wins] : [p.a, p.b, p.wins, p.losses];
    return { k: [place.get(x), place.get(y)], text: `${legends[x].legend} vs ${legends[y].legend} | ${recordText({ wins: w, losses: l, draws: p.draws })}` };
  });
  lines.sort((u, v) => u.k[0] - v.k[0] || u.k[1] - v.k[1]);
  return [...heads, ...(heads.length && lines.length ? [''] : []), ...lines.map((x) => x.text)].join('\n');
}

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
// "1,234"
const grouped = (n) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// The foot line: how the numbers were counted and whose numbers they are
// (Rift Registry asks to be credited by name and address). The cells left
// bare for too few matches are the key's to explain.
export function matrixFoot(matrix) {
  const parts = [];
  if (matrix && matrix.note) parts.push(matrix.note);
  const src = matrix && matrix.source ? String(matrix.source) : '';
  if (src) parts.push(`Data: ${src === 'Rift Registry' ? 'Rift Registry, riftregistry.com' : src}`);
  return parts.join(' · ');
}

// The sub line's counts: which legends the grid shows ("the 8 most played
// legends"), after the number of matches when asked (data with no note of
// its own: a loader's note already gives the event's exact count, which
// can be larger than the grid's data holds).
export function matrixCounts(view, { matches = true } = {}) {
  if (!view || !view.axis.length) return '';
  const n = view.axis.length;
  return [
    matches && view.matches ? `${grouped(view.matches)} ${view.matches === 1 ? 'match' : 'matches'}` : '',
    !view.picked && n < view.legends ? `the ${n} most played legends` : plural(n, 'legend'),
  ].filter(Boolean).join(' · ');
}
