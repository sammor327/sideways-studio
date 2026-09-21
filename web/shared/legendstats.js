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
// wins, losses, winRate, cut, cutWins, cutLosses, cutRate }. players is how
// many brought it; share is a percentage for a list that only has
// percentages (null otherwise, and the share is worked out from the
// players); wins and losses are its record against other legends; winRate is
// a typed percentage (null means work it out from the record).
//
// The top cut (2026-09-20, Sam: "an option to toggle top cut legend
// distribution to showcase the win rate after the groups stage"): cut is how
// many of that legend's players made the cut, cutWins and cutLosses their
// record, cutRate a typed percentage for it. A row with no cut numbers is a
// legend nobody got through with.

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

// --- the top cut (2026-09-20) ---
//
// Sam: "an option to toggle 'top cut' legend distribution to showcase the
// win rate after the groups stage of a tournament. If there is no group
// stage, show the top 10% of the swiss stage."
//
// With the toggle on the graphic is about the players who got through: the
// legends they brought, what share of the cut each one is, how many of the
// legend's players converted, and how those players have done. The pie
// becomes two rings, the cut inside the field it came out of (the scene),
// so a legend whose inner arc is wider than its outer one punched above its
// weight. A legend nobody got through with leaves the rings and the table:
// it is in the field's ring only, inside Other.
export const CUT_PERCENT = 10;
// Is there a cut to show? The toggle stays off until a source fills one.
export const hasCut = (stats) => (stats && Array.isArray(stats.rows) ? stats.rows : []).some((r) => r && num(r.cut) > 0);
// The headline in the middle of the rings: how many made the cut, out of how
// many, and what share of the field that is.
export function cutTotals(stats) {
  const rows = stats && Array.isArray(stats.rows) ? stats.rows : [];
  const field = Math.max(num(stats && stats.total), rows.reduce((s, r) => s + Math.max(0, num(r && r.players)), 0));
  const cut = Math.max(num(stats && stats.cutTotal), rows.reduce((s, r) => s + Math.max(0, num(r && r.cut)), 0));
  return { cut, field, conversion: field ? (cut / field) * 100 : null };
}

// How many legends get a slice and a row of their own in the Top mode; the
// rest fold into Other. Eight is the palette's ceiling.
export const TOP_MIN = 3;
export const TOP_MAX = SLICE_COLORS.length;
export const TOP_DEFAULT = 8;

// Which legends get a slice of their own (2026-09-19, Sam: "show all legends
// (except for the 1 ofs) on the pie chart"):
//   multi  every legend two or more players brought (the default); the
//          legends one player brought fold into Other
//   all    every legend
//   top    the largest `top` of them, the graphic as it first shipped
// Past the eighth, a legend's slice is Other's grey: the palette has eight
// colours that stay apart, and a ninth would only look like one of them. Its
// face on the slice (where it fits), its row in the table and the highlight
// name it instead.
export const SLICE_MODES = ['multi', 'all', 'top'];
export const SLICES_DEFAULT = 'multi';

// A pie closes on itself, so its last slice also touches its first. With
// seven slices and nothing in Other, slot seven (violet) would sit against
// slot one (blue), a pair the validator fails even for full colour vision
// (a difference of 9.8 against a floor of 15), so the seventh slice takes
// slot eight (red), which clears both of its neighbours. Every other
// count's closing pair passes as it stands. A slice past the eighth is
// Other's grey, which clears red, blue and violet (17 and more).
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
// legends folded away (past `top`, or brought by one player) plus any
// players the rows do not account for. start and end are fractions of a
// full turn. total is the field size when counts are known (the event's own
// total if it is larger than the rows add up to).
//
// With `cut` on and a cut to show, every number is the cut's: only the
// legends someone got through with are listed, their share is their share of
// the cut, their record is the cut players' record, and `conversion` is how
// many of the legend's own players made it. Each slice keeps the field it
// came out of in fieldPlayers, fieldShare and fieldStart/fieldEnd, so the
// scene can draw the cut inside the whole field as two rings; there Other
// holds everything else in the field, the legends that did not convert
// included. With `cut` off the two agree and the graphic draws the one pie.
export function legendSlices(stats, { slices: mode = 'top', top = TOP_DEFAULT, cut = false } = {}) {
  const src = stats && Array.isArray(stats.rows) ? stats.rows : [];
  const onCut = Boolean(cut) && hasCut(stats);
  const rows = src.filter((r) => r && (num(r.players) > 0 || num(r.share) > 0));
  const counted = rows.reduce((sum, r) => sum + Math.max(0, num(r.players)), 0);
  const total = Math.max(num(stats && stats.total), counted);
  const cutCounted = rows.reduce((sum, r) => sum + Math.max(0, num(r.cut)), 0);
  const cutTotal = Math.max(num(stats && stats.cutTotal), cutCounted);
  const all = rows.map((r) => {
    const players = Math.max(0, num(r.players));
    // A legend cannot get more players through than it brought.
    const made = players ? Math.min(players, Math.max(0, num(r.cut))) : Math.max(0, num(r.cut));
    return {
      legend: String(r.legend || ''),
      legendSlug: String(r.legendSlug || ''),
      legendCardId: String(r.legendCardId || ''),
      players,
      wins: Math.max(0, num(r.wins)),
      losses: Math.max(0, num(r.losses)),
      typedRate: given(r.winRate),
      winRate: winRateOf(r),
      share: num(r.share) > 0 ? num(r.share) : (total ? (players / total) * 100 : 0),
      cut: made,
      cutWins: Math.max(0, num(r.cutWins)),
      cutLosses: Math.max(0, num(r.cutLosses)),
      cutTyped: given(r.cutRate),
      cutRate: winRateOf({ winRate: r.cutRate, wins: r.cutWins, losses: r.cutLosses }),
      cutShare: cutTotal ? (made / cutTotal) * 100 : 0,
    };
  });
  // Typed percentages that add up past 100 are read as proportions.
  const sum = all.reduce((s, x) => s + x.share, 0);
  if (sum > 100) for (const x of all) x.share = (x.share / sum) * 100;
  // The cut's view: its counts, shares, records and win rates in the places
  // the pie and the table read, the field kept beside them.
  const items = all
    .filter((x) => !onCut || x.cut > 0)
    .map((x) => ({
      ...x,
      fieldPlayers: x.players,
      fieldShare: x.share,
      conversion: onCut && x.players ? (x.cut / x.players) * 100 : null,
      ...(onCut ? {
        players: x.cut, share: x.cutShare, wins: x.cutWins, losses: x.cutLosses,
        typedRate: x.cutTyped, winRate: x.cutRate,
      } : {}),
    }));
  items.sort((a, b) => b.share - a.share || b.players - a.players || a.legend.localeCompare(b.legend));

  let shown = items;
  let folded = [];
  let ones = false;
  if (mode === 'multi' && onCut) {
    // In the cut every legend keeps its slice. A cut is small, so a legend
    // that got one player through is a real slice of it (one of a top
    // thirty-two is three per cent), not the sliver a one-off is in a field
    // of hundreds. Trimming the cut is what Top 3 to Top 8 are for.
  } else if (mode === 'multi') {
    // A legend one player brought folds into Other. A row with no count (a
    // typed share) keeps its slice: how many brought it is not known. With
    // every legend brought once there would be nothing left to draw, so
    // then every legend keeps its slice.
    const kept = items.filter((x) => x.players !== 1);
    if (kept.length) {
      folded = items.filter((x) => x.players === 1);
      shown = kept;
      ones = folded.length > 0;
    }
  } else if (mode !== 'all') {
    const n = Math.min(TOP_MAX, Math.max(TOP_MIN, Math.trunc(num(top)) || TOP_DEFAULT));
    shown = items.slice(0, n);
    folded = items.slice(n);
  }
  const listed = items.reduce((s, x) => s + x.share, 0);
  const rest = items.length && listed < 99.95 ? 100 - listed : 0;
  // In the cut the legends nobody got through with are Other's too, on the
  // field's ring, so the rings close on the same field.
  const missed = onCut ? all.length - items.length : 0;
  const hasOther = folded.length > 0 || rest > 0 || missed > 0;

  const slices = shown.map((x, i) => ({ ...x, other: false, color: sliceColor(i, shown.length, hasOther) }));
  if (hasOther) {
    // Other's record is the folded legends' records added up; a folded row
    // with only a typed percentage cannot be added, so then there is none.
    const w = folded.reduce((s, x) => s + x.wins, 0);
    const l = folded.reduce((s, x) => s + x.losses, 0);
    const summable = folded.length > 0 && !folded.some((x) => x.typedRate);
    const seat = onCut ? cutTotal : total;
    const seen = onCut ? cutCounted : counted;
    const fieldShown = shown.reduce((s, x) => s + x.fieldShare, 0);
    const fieldSeen = shown.reduce((s, x) => s + x.fieldPlayers, 0);
    slices.push({
      legend: 'Other legends', legendSlug: '', legendCardId: '',
      players: folded.reduce((s, x) => s + x.players, 0) + (seat > seen ? seat - seen : 0),
      wins: summable ? w : 0, losses: summable ? l : 0,
      typedRate: false, winRate: summable && w + l > 0 ? (w / (w + l)) * 100 : null,
      share: folded.reduce((s, x) => s + x.share, 0) + rest,
      // On the field's ring Other is everything the listed legends are not,
      // so that ring closes on the whole field.
      fieldPlayers: onCut ? Math.max(0, total - fieldSeen) : folded.reduce((s, x) => s + x.fieldPlayers, 0) + (total > counted ? total - counted : 0),
      fieldShare: onCut ? Math.max(0, 100 - fieldShown) : folded.reduce((s, x) => s + x.fieldShare, 0) + rest,
      conversion: null,
      other: true, legends: folded.length, ones, unlisted: rest > 0, missed,
      color: OTHER_COLOR,
    });
  }
  let at = 0;
  let fieldAt = 0;
  for (const s of slices) {
    s.start = at / 100;
    at += s.share;
    s.end = Math.min(1, at / 100);
    s.fieldStart = fieldAt / 100;
    fieldAt += s.fieldShare;
    s.fieldEnd = Math.min(1, fieldAt / 100);
  }
  if (slices.length) {
    slices[slices.length - 1].end = 1;
    slices[slices.length - 1].fieldEnd = 1;
  }
  return {
    slices, total: counted ? total : 0, counted, legends: items.length, hasOther,
    cut: onCut, cutTotal: cutCounted ? cutTotal : 0,
  };
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

// One arc of a ring, as an SVG path: the same turn as slicePath, between
// two radii rather than in to the centre (2026-09-20, the top cut's two
// rings). A whole ring is the two circles, the inner one drawn the other
// way round so it cuts the hole.
export function ringPath(cx, cy, r, ri, from, to) {
  const f = (x) => Math.round(x * 100) / 100;
  const at = (rad, t) => [f(cx + rad * Math.sin(t * 2 * Math.PI)), f(cy - rad * Math.cos(t * 2 * Math.PI))];
  if (to - from >= 0.99999) {
    const [ax, ay] = at(r, 0);
    const [bx, by] = at(r, 0.5);
    const [cx0, cy0] = at(ri, 0);
    const [dx, dy] = at(ri, 0.5);
    return `M ${ax} ${ay} A ${r} ${r} 0 1 1 ${bx} ${by} A ${r} ${r} 0 1 1 ${ax} ${ay} Z `
      + `M ${cx0} ${cy0} A ${ri} ${ri} 0 1 0 ${dx} ${dy} A ${ri} ${ri} 0 1 0 ${cx0} ${cy0} Z`;
  }
  const big = to - from > 0.5 ? 1 : 0;
  const [x0, y0] = at(r, from);
  const [x1, y1] = at(r, to);
  const [x2, y2] = at(ri, to);
  const [x3, y3] = at(ri, from);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${big} 1 ${x1} ${y1} L ${x2} ${y2} A ${ri} ${ri} 0 ${big} 0 ${x3} ${y3} Z`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The line under Other's name in the table: what it holds. The legends
// folded into it (brought by one player each, or past the ones shown), the
// players the list does not name (a field size larger than the lines), or
// both. In the cut it also holds the legends nobody got through with, which
// are on the field's ring only.
export function otherTitle(s) {
  if (!s || !s.other) return '';
  const held = s.legends ? (s.ones ? `${plural(s.legends, 'legend')} with one player each` : plural(s.legends, 'more legend')) : '';
  // In the cut the legends nobody got through with are the story of this
  // row, and its circle already counts the ones folded into it, so that is
  // all it says: the cut's table has a narrower name column.
  const parts = s.missed ? [`${plural(s.missed, 'legend')} missed the cut`] : [held].filter(Boolean);
  if (!parts.length) return 'Players not listed';
  return s.unlisted ? `${parts.join(', ')}, plus players not listed` : parts.join(', ');
}

// --- highlighting a legend (2026-09-19) ---
//
// Sam: "the operator can highlight specific legends in the pie chart and
// that slice grows", like the card row's and the decklist's highlight. A
// highlight names a slice by a key that outlives a reload of the numbers:
// the legend's slug, else its name squeezed (a typed legend the catalog did
// not know), and 'other' for Other. scenes.legendstats.focus holds the
// highlighted keys, the newest last.
export const FOCUS_OTHER = 'other';
export function sliceKey(s) {
  if (!s) return '';
  if (s.other) return FOCUS_OTHER;
  return s.legendSlug || `n:${normLegend(s.legend)}`;
}

// --- the table's roll (2026-09-19) ---
//
// Sam: "make it so the table naturally animates down to show the full
// length", and "the operator can start, stop/restart, pause the
// animation". A table longer than its box rolls: a hold at the top, down at
// a reading pace (easing into and out of it), a hold at the bottom, then,
// with Loop on, back up briskly and round again; with Loop off it stays at
// the bottom until it is started again.
//
// scenes.legendstats.roll is { state, at, done }: state 'play', 'pause',
// 'stop' (back at the top) or 'hold' (paused by a highlight, which picks up
// again when the highlight clears); at is when it last started playing, in
// ms since the epoch on the server's clock, which on a localhost app is
// every browser source's clock too; done is the time it had played before
// that. Every browser source works the same place out of the wall clock, so
// one that reloads mid-roll comes back where the others are.
export const ROLL_STATES = ['stop', 'play', 'pause', 'hold'];
export const ROLL_OPS = ['start', 'pause', 'stop', 'restart'];
// The table's rows and its box (the scene's CSS reads these through
// --rh and the box height): nine rows show at once, the rest roll.
export const TABLE_ROW_PX = 80;
export const TABLE_VIEW_ROWS = 9;
export const tableOverflow = (rows) => Math.max(0, (Math.trunc(num(rows)) - TABLE_VIEW_ROWS) * TABLE_ROW_PX);
// Design pixels a second: normal moves a row of the table on every 1.3 s.
export const ROLL_SPEEDS = { slow: 36, normal: 60, fast: 100 };
export const ROLL_SPEED_DEFAULT = 'normal';
export const ROLL_HOLD_MS = 5000;
export const ROLL_RAMP_MS = 700;

// How long the roll has played at `now`.
export function rollElapsed(roll, now = Date.now()) {
  if (!roll || typeof roll !== 'object') return 0;
  const done = Math.max(0, num(roll.done));
  return roll.state === 'play' ? done + Math.max(0, now - num(roll.at)) : done;
}

// One trip of `distance` pixels at `speed` a second, easing up to speed
// over ROLL_RAMP_MS and down again at the end (a short trip never reaches
// full speed): how long it takes, and how far along it is at t ms. A speed
// of Infinity is a jump.
function trip(distance, speed) {
  if (!(speed < Infinity)) return { total: 0, at: () => distance };
  const a = speed / 1000 / ROLL_RAMP_MS;
  const ramp = Math.min(ROLL_RAMP_MS, Math.sqrt(distance / a));
  const peak = a * ramp;
  const cruise = (distance - a * ramp * ramp) / peak;
  const total = 2 * ramp + cruise;
  return {
    total,
    at(t) {
      if (t <= 0) return 0;
      if (t >= total) return distance;
      if (t < ramp) return (a * t * t) / 2;
      if (t < ramp + cruise) return (a * ramp * ramp) / 2 + peak * (t - ramp);
      const left = total - t;
      return distance - (a * left * left) / 2;
    },
  };
}

// Where the rows sit `elapsed` ms into the roll of a table `overflow` pixels
// longer than its box. offset is how far the rows have moved up (0 is the
// top, overflow has the last row at the foot of the box); moving says they
// are on their way; next is how soon they move again (Infinity once a pass
// without Loop is over); end says that pass is over. The way back up takes
// at most three seconds. jump: travel instantly (animation switched off).
export function rollAt(elapsed, overflow, { speed = ROLL_SPEEDS.normal, loop = true, hold = ROLL_HOLD_MS, jump = false } = {}) {
  if (!(overflow > 0)) return { offset: 0, moving: false, next: Infinity, end: false };
  const down = trip(overflow, jump ? Infinity : speed);
  const t = Math.max(0, elapsed);
  if (!loop && t >= hold + down.total) return { offset: overflow, moving: false, next: Infinity, end: true };
  const back = trip(overflow, jump ? Infinity : Math.max(speed * 4, overflow / 2.3));
  const period = 2 * hold + down.total + back.total;
  const p = t % period;
  if (p < hold) return { offset: 0, moving: false, next: hold - p, end: false };
  if (p < hold + down.total) return { offset: down.at(p - hold), moving: true, next: 0, end: false };
  if (p < 2 * hold + down.total) return { offset: overflow, moving: false, next: 2 * hold + down.total - p, end: false };
  return { offset: overflow - back.at(p - 2 * hold - down.total), moving: true, next: 0, end: false };
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
    if (!given(cur.cutRate)) cur.cutRate = r.cutRate ?? null;
    cur.players += r.players;
    cur.wins += r.wins;
    cur.losses += r.losses;
    cur.cut = num(cur.cut) + num(r.cut);
    cur.cutWins = num(cur.cutWins) + num(r.cutWins);
    cur.cutLosses = num(cur.cutLosses) + num(r.cutLosses);
    if (given(r.share)) cur.share = (num(cur.share) || 0) + num(r.share);
  }
  return [...out.values()];
}

// One line per legend: the legend, then how many played it, then its win
// rate, then the same two for the top cut. Pipes or tabs separate the
// fields, so a spreadsheet paste works as it is; without either the numbers
// are read off the end of the line.
//   Kai'Sa | 42 | 55.1      42 players, a 55.1% win rate
//   Jinx | 30 | 45-37       a record: wins and losses (a draw count may follow)
//   Viktor | 12.5%          a share, for a list that only has percentages
//   Viktor                  a legend alone is one player, so a column with
//                           one legend per player counts itself
//   Jinx | 30 | 45-37 | 4 | 9-3
//                           4 of those 30 made the top cut, 9-3 between them
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
    const made = (parts[3] || '').trim();
    const cutRate = (parts[4] || '').trim();
    if (!name) { bad.push(raw); continue; }
    const row = { legend: name.slice(0, 60), legendSlug: '', legendCardId: '', players: 0, share: null, wins: 0, losses: 0, winRate: null, cut: 0, cutWins: 0, cutLosses: 0, cutRate: null };
    if (!size) row.players = 1;
    else if (/^\d+$/.test(size)) row.players = Number(size);
    else if (/^\d+(\.\d+)?%?$/.test(size)) row.share = Math.min(100, Number(size.replace('%', '')));
    else { bad.push(raw); continue; }
    // The win rate, then the same two fields again for the top cut.
    let broken = false;
    for (const [text2, into] of [[rate, ''], [cutRate, 'cut']]) {
      if (!text2) continue;
      const rec = text2.match(/^(\d+)-(\d+)(?:-\d+)?$/);
      if (rec) {
        row[into ? 'cutWins' : 'wins'] = Number(rec[1]);
        row[into ? 'cutLosses' : 'losses'] = Number(rec[2]);
      } else if (/^\d+(\.\d+)?%?$/.test(text2)) {
        row[into ? 'cutRate' : 'winRate'] = Math.min(100, Number(text2.replace('%', '')));
      } else { broken = true; break; }
    }
    if (broken) { bad.push(raw); continue; }
    if (made) {
      if (/^\d+$/.test(made)) row.cut = Number(made);
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
// record (or typed win rate), then the top cut's count and record when
// there are any.
export function legendsToText(rows) {
  const list = rows || [];
  const anyCut = list.some((r) => num(r.cut) > 0);
  return list.map((r) => {
    const size = r.players ? String(r.players) : given(r.share) ? `${r.share}%` : '';
    const rate = r.wins || r.losses ? `${r.wins}-${r.losses}` : given(r.winRate) ? String(r.winRate) : '';
    const made = anyCut ? String(num(r.cut) || 0) : '';
    const cutRate = r.cutWins || r.cutLosses ? `${r.cutWins}-${r.cutLosses}` : given(r.cutRate) ? String(r.cutRate) : '';
    return [r.legend, size, rate, made, cutRate].join(' | ').replace(/( \| )+$/, '');
  }).join('\n');
}

// Which standings rows made the top cut (2026-09-20): the top `percent` of
// them, group by group when the rows carry one (a pooled event cuts out of
// each group), at least one player a group and never the whole field. The
// rows come in the order the standings put them, so the cut is the top of
// each list; a dropped player is still counted where they finished.
export function cutFromStandings(rows, { percent = CUT_PERCENT } = {}) {
  const list = (rows || []).filter(Boolean);
  const groups = new Map();
  for (const r of list) {
    const key = String(r.group || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const made = new Set();
  for (const part of groups.values()) {
    const n = Math.min(part.length - 1, Math.max(1, Math.round((part.length * percent) / 100)));
    for (const r of part.slice(0, Math.max(0, n))) made.add(r);
  }
  return made;
}

// Standings rows (Match data or the Tournament platform's) counted into
// legend rows: a player per row and that player's record. Their records
// include every match, mirrors and byes too, which the caller says in the
// graphic's foot note. Rows with no legend are skipped and counted. With
// `cut` on, the top of the standings (cutFromStandings) also fills each
// legend's cut count and the cut players' records.
export function legendsFromStandings(rows, { cut = false, percent = CUT_PERCENT } = {}) {
  const out = [];
  let skipped = 0;
  const made = cut ? cutFromStandings(rows, { percent }) : new Set();
  for (const r of rows || []) {
    if (!r || (!r.legendSlug && !normLegend(r.legend))) { skipped += 1; continue; }
    const [w, l] = String(r.record || '').split('-').map((x) => Number(x));
    const wins = Number.isFinite(w) ? w : 0;
    const losses = Number.isFinite(l) ? l : 0;
    const through = made.has(r);
    out.push({
      legend: String(r.legend || ''), legendSlug: String(r.legendSlug || ''), legendCardId: String(r.legendCardId || ''),
      players: 1, share: null, wins, losses, winRate: null,
      cut: through ? 1 : 0, cutWins: through ? wins : 0, cutLosses: through ? losses : 0, cutRate: null,
    });
  }
  return { rows: mergeLegendRows(out), skipped, cut: made.size };
}
