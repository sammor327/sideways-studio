import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { legendSlices, slicePath, splitLegend } from '../../shared/legendstats.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);
// The pie sweeps in on --p; the rows come in on --r and leave on --o, the
// standings' clocks (scene.css). Wall-clock seek clocks like --t, so an
// occluded browser source lands on the settled frame, never a half-drawn one.
const sweep = new SeekClock(root, '--p', 1100);
const rowsIn = new SeekClock(root, '--r', 900);
const rowsOut = new SeekClock(root, '--o', 380);
const ENTER_MS = 900;
const TURN_IN_MS = 720;

// The pie's own units (its SVG viewBox is 680 square): the centre, the
// radius, and the icon on a slice, 62% of the way out and as large as the
// slice has room for, or none under 40.
const C = 340;
const R = 336;
const MARK_AT = 0.62;
const MARK_MIN = 40;
const MARK_MAX = 104;
const SVG = 'http://www.w3.org/2000/svg';

const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A legend's face: the round icon cutout, then the holder art, then its
// card's painting. With none of them known the circle carries the
// champion's initial instead.
function portrait(s) {
  const steps = [];
  if (s.legendSlug) {
    steps.push({ src: `/legendart/icon/${s.legendSlug}.webp`, cls: 'tier-icon' });
    steps.push({ src: `/legendart/hero/${s.legendSlug}.png`, cls: 'tier-hero' });
  }
  if (s.legendCardId) steps.push({ src: `/cardart/thumb/${s.legendCardId}.webp`, cls: 'tier-card' });
  if (!steps.length) {
    return Object.assign(document.createElement('span'), { className: 'lt', textContent: splitLegend(s.legend).champion.slice(0, 1).toUpperCase() });
  }
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  clearArt(img);
  chainLoad(img, steps);
  return img;
}

function paintPie(slices) {
  $('pie').replaceChildren(...slices.map((s) => {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', slicePath(C, C, R, s.start, s.end));
    path.style.fill = s.color;
    return path;
  }));
  const marks = [];
  for (const s of slices) {
    if (s.other || (!s.legendSlug && !s.legendCardId)) continue;
    const span = s.end - s.start;
    const mid = (s.start + s.end) / 2;
    let size;
    let x;
    let y;
    if (span > 0.999) {
      // One legend is the whole pie: its face in the middle.
      size = MARK_MAX * 1.5;
      x = C - size / 2;
      y = C - size / 2;
    } else {
      const rc = R * MARK_AT;
      const room = Math.min(2 * rc * Math.sin(Math.min(span, 0.5) * Math.PI) * 0.72, (R - rc) * 1.5, MARK_MAX);
      if (room < MARK_MIN) continue;
      size = Math.round(room);
      x = C + rc * Math.sin(mid * 2 * Math.PI) - size / 2;
      y = C - rc * Math.cos(mid * 2 * Math.PI) - size / 2;
    }
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.style.setProperty('--x', x.toFixed(1));
    mark.style.setProperty('--y', y.toFixed(1));
    mark.style.setProperty('--s', String(size));
    mark.style.setProperty('--a', mid.toFixed(4));
    mark.append(portrait(s));
    marks.push(mark);
  }
  $('marks').replaceChildren(...marks);
}

function cell(cls, value, sub, none = false) {
  const td = document.createElement('div');
  td.className = cls;
  td.append(
    Object.assign(document.createElement('div'), { className: `v${none ? ' none' : ''}`, textContent: value }),
    Object.assign(document.createElement('div'), { className: 's', textContent: sub }),
  );
  return td;
}

function paintRows(slices, showRate) {
  $('table').classList.toggle('no-rate', !showRate);
  const n = slices.length;
  $('rows').replaceChildren(...slices.map((s, i) => {
    const row = document.createElement('div');
    row.className = `row${s.other ? ' other' : ''}`;
    // The row's place down the table, 0 to 1: where its slice of the in and
    // out clocks starts (scene.css).
    row.style.setProperty('--pos', String(n > 1 ? i / (n - 1) : 0));
    row.style.setProperty('--c', s.color);
    const ic = document.createElement('div');
    ic.className = 'ic';
    // Other's circle counts the legends folded into it; with none folded it
    // is players the list does not name.
    if (s.other) ic.append(Object.assign(document.createElement('span'), { className: 'lt', textContent: s.legends ? `+${s.legends}` : '?' }));
    else ic.append(portrait(s));
    // Other names what it holds: the legends folded into it, the players
    // the list does not name (a field size larger than the lines), or both.
    const { champion, title } = s.other
      ? { champion: s.legend, title: s.legends ? `${plural(s.legends, 'more legend')}${s.unlisted ? ', plus players not listed' : ''}` : 'Players not listed' }
      : splitLegend(s.legend);
    const name = document.createElement('div');
    name.className = 'name';
    name.append(
      Object.assign(document.createElement('div'), { className: 'ch', textContent: champion }),
      Object.assign(document.createElement('div'), { className: 'tt', textContent: title }),
    );
    const rate = s.winRate;
    row.append(
      ic,
      name,
      cell('num', pct(s.share), s.players ? plural(s.players, 'player') : ''),
      cell('num rate', rate === null ? '–' : pct(rate), s.wins || s.losses ? `${s.wins}-${s.losses}` : '', rate === null),
    );
    return row;
  }));
}

// What the state asks for, and what the frame shows. They differ only while
// a turn plays: the turn paints whatever is wanted once the old rows have
// left, so a refresh or a second change mid-turn is never lost and never
// cuts the turn short.
let want = null;
let shownKey = null;
let turning = false;
let turnToken = 0;

function paint() {
  if (!want || shownKey === want.key) return;
  paintPie(want.slices);
  paintRows(want.slices, want.showRate);
  shownKey = want.key;
}

function settle() {
  turnToken += 1;
  turning = false;
  for (const clock of [sweep, rowsIn, rowsOut]) clock.stop();
  rowsOut.seek(0);
  rowsIn.seek(1);
  sweep.seek(1);
}

async function turnOver() {
  const token = ++turnToken;
  turning = true;
  while (want && shownKey !== want.key) {
    for (const clock of [sweep, rowsIn]) { clock.stop(); clock.seek(1); }
    await rowsOut.play({ from: 0, to: 1 });
    if (token !== turnToken) return;
    paint();
    rowsIn.duration = TURN_IN_MS;
    const landed = Promise.all([sweep.play({ from: 0, to: 1 }), rowsIn.play({ from: 0, to: 1 })]);
    rowsOut.seek(0);
    await landed;
    if (token !== turnToken) return;
  }
  turning = false;
}

let shownVisible = null;

const params = initStage({
  scene: 'legendstats',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.legendstats;
    const stats = bank.event.legendStats || { rows: [] };
    const { slices, total, legends } = legendSlices(stats, { top: scene.top });
    const showRate = scene.winRate !== false;
    const key = JSON.stringify([slices.map((s) => [s.legend, s.legendSlug, s.legendCardId, s.share, s.players, s.winRate, s.wins, s.losses, s.color, s.legends || 0, s.unlisted || false]), showRate]);
    want = { slices, showRate, key };

    setText($('sub'), [bank.event.name, stats.label, total ? plural(total, 'player') : '', legends > 1 ? `${legends} legends` : ''].filter(Boolean).join(' · '));
    // The note says how the win rates were counted, so it goes with them.
    setText($('foot'), showRate ? stats.note || '' : '');
    $('empty').classList.toggle('hidden', slices.length > 0);
    $('panel').classList.toggle('hidden', !slices.length);

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);

    if (first || shownKey === null) {
      // The first frame: the data as it stands, settled.
      settle();
      paint();
    } else if (visible && shownVisible !== true) {
      // Coming on: the pie sweeps round and the rows come in.
      settle();
      paint();
      rowsIn.duration = ENTER_MS;
      sweep.play({ from: 0, to: 1 });
      rowsIn.play({ from: 0, to: 1 });
    } else if (!visible) {
      // Off air (or fading out): a turn already playing finishes under the
      // fade; otherwise the frame just follows the state for next time.
      if (!turning) paint();
    } else if (key !== shownKey && !turning) {
      // On air and the data changed (another group, the win rate switched):
      // the rows leave, the pie goes, both come back with the new numbers.
      turnOver();
    }

    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
