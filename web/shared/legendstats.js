// The legend distribution (2026-09-19, Sam: "a legend distribution graphic
// to showcase the most played legends ... a pie chart on the left and a
// table on the right ... legend icon, legend name, % of that legend out of
// the total amount of legends, and finally their win rate").
//
// The numbers live here once, shared by the scene (the pie and the table),
// the panel (the paste editor and Count from standings), the Tournament
// platform's loader and the tests, so what the operator reads back and what
// airs come from the same arithmetic. Plain ESM with no browser or Node
// dependencies, like look.js.
//
// A row is one legend: { legend, legendSlug, legendCardId, players, share,
// wins, losses, winRate }. players is how many brought it; share is a
// percentage for a list that only has percentages (null otherwise, and the
// share is worked out from the players); wins and losses are its record
// against other legends; winRate is a typed percentage (null means work it
// out from the record).

// The slice colours: the data-viz reference palette's eight categorical
// hues in its fixed order, stepped for a dark surface. Run through that
// palette's validator against this graphic's panel (#10151d) and ground
// (#0a0d12): every neighbouring pair clears the colour-blind separation
// target and the normal-vision floor, and every slice clears 3:1 against
// the panel. The order is what makes it safe, so slices take the slots in
// order and never cycle; a ninth legend folds into Other instead.
export const SLICE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
// Other: a neutral grey (3.45:1 on the panel) that no slot resembles.
export const OTHER_COLOR = '#646c77';

// How many legends get a slice and a row of their own; the rest fold into
// Other. Eight is the palette's ceiling.
export const TOP_MIN = 3;
export const TOP_MAX = SLICE_COLORS.length;
export const TOP_DEFAULT = 8;

// A pie closes on itself, so its last slice also touches its first. With
// seven slices and nothing in Other, slot seven (violet) would sit against
// slot one (blue), a pair the validator fails even for full colour vision
// (a difference of 9.8 against a floor of 15), so the seventh slice takes
// slot eight (red), which clears both of its neighbours. Every other
// count's closing pair passes as it stands.
export function sliceColor(i, count, hasOther) {
  if (count === 7 && !hasOther && i === 6) return SLICE_COLORS[7];
  return SLICE_COLORS[i] || OTHER_COLOR;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const given = (v) => v !== null && v !== undefined && v !== '';
export const normLegend = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

// A row's win rate in percent: the typed one, else its record's wins over
// wins and losses. null when neither is known.
export function winRateOf(row) {
  if (!row) return null;
  if (given(row.winRate)) return num(row.winRate);
  const w = num(row.wins);
  const l = num(row.losses);
  return w + l > 0 ? (w / (w + l)) * 100 : null;
}

// "Kai'Sa, Daughter of the Void" -> the champion and the title, for the
// table's two lines. A name with no comma is all champion.
export function splitLegend(name) {
  const s = String(name || '').trim();
  const i = s.indexOf(',');
  return i < 0 ? { champion: s, title: '' } : { champion: s.slice(0, i).trim(), title: s.slice(i + 1).trim() };
}

// Everything the graphic draws: the shown legends in order of share (the
// pie clockwise from twelve o'clock, the table top down), then Other for the
// legends past `top` plus any players the rows do not account for. start and
// end are fractions of a full turn. total is the field size when counts are
// known (the event's own total if it is larger than the rows add up to).
export function legendSlices(stats, { top = TOP_DEFAULT } = {}) {
  const src = stats && Array.isArray(stats.rows) ? stats.rows : [];
  const rows = src.filter((r) => r && (num(r.players) > 0 || num(r.share) > 0));
  const counted = rows.reduce((sum, r) => sum + Math.max(0, num(r.players)), 0);
  const total = Math.max(num(stats && stats.total), counted);
  const items = rows.map((r) => ({
    legend: String(r.legend || ''),
    legendSlug: String(r.legendSlug || ''),
    legendCardId: String(r.legendCardId || ''),
    players: Math.max(0, num(r.players)),
    wins: Math.max(0, num(r.wins)),
    losses: Math.max(0, num(r.losses)),
    typedRate: given(r.winRate),
    winRate: winRateOf(r),
    share: num(r.share) > 0 ? num(r.share) : (total ? (num(r.players) / total) * 100 : 0),
  }));
  // Typed percentages that add up past 100 are read as proportions.
  const sum = items.reduce((s, x) => s + x.share, 0);
  if (sum > 100) for (const x of items) x.share = (x.share / sum) * 100;
  items.sort((a, b) => b.share - a.share || b.players - a.players || a.legend.localeCompare(b.legend));

  const n = Math.min(TOP_MAX, Math.max(TOP_MIN, Math.trunc(num(top)) || TOP_DEFAULT));
  const shown = items.slice(0, n);
  const folded = items.slice(n);
  const listed = items.reduce((s, x) => s + x.share, 0);
  const rest = items.length && listed < 99.95 ? 100 - listed : 0;
  const hasOther = folded.length > 0 || rest > 0;

  const slices = shown.map((x, i) => ({ ...x, other: false, color: sliceColor(i, shown.length, hasOther) }));
  if (hasOther) {
    // Other's record is the folded legends' records added up; a folded row
    // with only a typed percentage cannot be added, so then there is none.
    const w = folded.reduce((s, x) => s + x.wins, 0);
    const l = folded.reduce((s, x) => s + x.losses, 0);
    const summable = folded.length > 0 && !folded.some((x) => x.typedRate);
    slices.push({
      legend: 'Other legends', legendSlug: '', legendCardId: '',
      players: folded.reduce((s, x) => s + x.players, 0) + (total > counted ? total - counted : 0),
      wins: summable ? w : 0, losses: summable ? l : 0,
      typedRate: false, winRate: summable && w + l > 0 ? (w / (w + l)) * 100 : null,
      share: folded.reduce((s, x) => s + x.share, 0) + rest,
      other: true, legends: folded.length, unlisted: rest > 0, color: OTHER_COLOR,
    });
  }
  let at = 0;
  for (const s of slices) {
    s.start = at / 100;
    at += s.share;
    s.end = Math.min(1, at / 100);
  }
  if (slices.length) slices[slices.length - 1].end = 1;
  return { slices, total: counted ? total : 0, counted, legends: items.length, hasOther };
}

// One slice of a pie, as an SVG path: from and to are fractions of a turn,
// clockwise from twelve o'clock. A whole turn is two half arcs, since one
// arc cannot start and end on the same point.
export function slicePath(cx, cy, r, from, to) {
  const f = (x) => Math.round(x * 100) / 100;
  const at = (t) => [f(cx + r * Math.sin(t * 2 * Math.PI)), f(cy - r * Math.cos(t * 2 * Math.PI))];
  if (to - from >= 0.99999) {
    const [x0, y0] = at(0);
    const [x1, y1] = at(0.5);
    return `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1} A ${r} ${r} 0 1 1 ${x0} ${y0} Z`;
  }
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  return `M ${f(cx)} ${f(cy)} L ${x0} ${y0} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x1} ${y1} Z`;
}

// --- the panel's paste ---

// A legend typed by the operator, matched against the catalog the panel
// loads: the exact name, else the only legend whose champion that is, else
// the only legend whose name contains it. Two champions with two legends
// (Master Yi) match nothing on the champion alone, rather than a guess.
export function resolveLegend(catalog, text) {
  const q = normLegend(text);
  if (!q) return null;
  const list = Array.isArray(catalog) ? catalog : [];
  const pick = (hits) => (hits.length === 1 ? hits[0] : null);
  const hit = list.find((l) => normLegend(l.name) === q)
    || pick(list.filter((l) => normLegend(splitLegend(l.name).champion) === q))
    || pick(list.filter((l) => normLegend(l.name).startsWith(q)))
    || pick(list.filter((l) => normLegend(l.name).includes(q)));
  return hit ? { legend: hit.name, legendSlug: hit.slug || '', legendCardId: hit.cardId || '' } : null;
}

// Rows for the same legend (two lines naming it, one line per player)
// become one: counts and records add up.
export function mergeLegendRows(rows) {
  const out = new Map();
  for (const r of rows) {
    const key = r.legendSlug || normLegend(r.legend);
    const cur = out.get(key);
    if (!cur) { out.set(key, { ...r }); continue; }
    if (given(r.winRate) && given(cur.winRate) && cur.players + r.players > 0) {
      cur.winRate = Math.round(((cur.winRate * cur.players + r.winRate * r.players) / (cur.players + r.players)) * 10) / 10;
    } else if (!given(cur.winRate)) cur.winRate = r.winRate;
    cur.players += r.players;
    cur.wins += r.wins;
    cur.losses += r.losses;
    if (given(r.share)) cur.share = (num(cur.share) || 0) + num(r.share);
  }
  return [...out.values()];
}

// One line per legend: the legend, then how many played it, then its win
// rate. Pipes or tabs separate the fields, so a spreadsheet paste works as
// it is; without either the numbers are read off the end of the line.
//   Kai'Sa | 42 | 55.1      42 players, a 55.1% win rate
//   Jinx | 30 | 45-37       a record: wins and losses (a draw count may follow)
//   Viktor | 12.5%          a share, for a list that only has percentages
//   Viktor                  a legend alone is one player, so a column with
//                           one legend per player counts itself
export function parseLegendLines(text, resolve) {
  const rows = [];
  const bad = [];
  const unknown = [];
  for (const raw of String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 400)) {
    let parts;
    if (/[|\t]/.test(raw)) parts = raw.split(/\s*[|\t]\s*/);
    else {
      const m = raw.match(/^(.*?)((?:\s+(?:\d+(?:\.\d+)?%?|\d+-\d+(?:-\d+)?))*)$/);
      parts = [m[1], ...m[2].trim().split(/\s+/).filter(Boolean)];
    }
    const name = parts[0].trim();
    const size = (parts[1] || '').trim();
    const rate = (parts[2] || '').trim();
    if (!name) { bad.push(raw); continue; }
    const row = { legend: name.slice(0, 60), legendSlug: '', legendCardId: '', players: 0, share: null, wins: 0, losses: 0, winRate: null };
    if (!size) row.players = 1;
    else if (/^\d+$/.test(size)) row.players = Number(size);
    else if (/^\d+(\.\d+)?%?$/.test(size)) row.share = Math.min(100, Number(size.replace('%', '')));
    else { bad.push(raw); continue; }
    if (rate) {
      const rec = rate.match(/^(\d+)-(\d+)(?:-\d+)?$/);
      if (rec) { row.wins = Number(rec[1]); row.losses = Number(rec[2]); }
      else if (/^\d+(\.\d+)?%?$/.test(rate)) row.winRate = Math.min(100, Number(rate.replace('%', '')));
      else { bad.push(raw); continue; }
    }
    const hit = resolve ? resolve(name) : null;
    if (hit) Object.assign(row, hit);
    else unknown.push(name);
    rows.push(row);
  }
  return { rows: mergeLegendRows(rows), bad, unknown };
}

// The rows written back in the paste's own shape, so the editor shows what
// resolved: the catalog's full legend name, the count (or share), the
// record (or typed win rate).
export function legendsToText(rows) {
  return (rows || []).map((r) => {
    const size = r.players ? String(r.players) : given(r.share) ? `${r.share}%` : '';
    const rate = r.wins || r.losses ? `${r.wins}-${r.losses}` : given(r.winRate) ? String(r.winRate) : '';
    return [r.legend, size, rate].join(' | ').replace(/( \| )+$/, '');
  }).join('\n');
}

// Standings rows (Match data or the Tournament platform's) counted into
// legend rows: a player per row and that player's record. Their records
// include every match, mirrors and byes too, which the caller says in the
// graphic's foot note. Rows with no legend are skipped and counted.
export function legendsFromStandings(rows) {
  const out = [];
  let skipped = 0;
  for (const r of rows || []) {
    if (!r || (!r.legendSlug && !normLegend(r.legend))) { skipped += 1; continue; }
    const [w, l] = String(r.record || '').split('-').map((x) => Number(x));
    out.push({
      legend: String(r.legend || ''), legendSlug: String(r.legendSlug || ''), legendCardId: String(r.legendCardId || ''),
      players: 1, share: null, wins: Number.isFinite(w) ? w : 0, losses: Number.isFinite(l) ? l : 0, winRate: null,
    });
  }
  return { rows: mergeLegendRows(out), skipped };
}
