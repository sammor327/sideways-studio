import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, legendSteps } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { BRACKET_FORMATS, buildBracket } from '../../shared/bracket.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 700);

// Layout per format: slot height and width, the x of each column, where the
// winners and (for double elimination) losers trees start, and the gap
// between matches in the first round. Everything else derives.
const LAYOUT = {
  se8: { sh: 64, w: 340, cols: [80, 540, 1000], champX: 1460, top: 190, gap: 34 },
  se16: { sh: 42, w: 270, cols: [80, 430, 780, 1130], champX: 1480, top: 160, gap: 12 },
  de8: { sh: 40, w: 250, cols: [80, 400, 720, 1040, 1360], champX: 1640, top: 200, gap: 14, lgap: 96 },
  de16: { sh: 28, w: 200, cols: [80, 320, 560, 800, 1040, 1280, 1520], champX: 1700, top: 164, gap: 5, lgap: 52 },
};

const px = (n) => `calc(${n} * var(--u))`;
const mid = (y, sh) => y + sh + 2;
const between = (y1, y2, sh) => (mid(y1, sh) + mid(y2, sh)) / 2 - (sh + 2);

// Positions for every match of a format: {id: {x, y}}; wires as [x1,y1,x2,y2,on].
function layout(format, built) {
  const L = LAYOUT[format];
  const f = BRACKET_FORMATS[format];
  const sh = L.sh;
  const mh = sh * 2 + 4;
  const pos = {};
  const byRound = (losers) => {
    const rounds = [];
    for (const m of built.matches) {
      if (Boolean(m.losers) !== losers || m.id === 'GF') continue;
      (rounds[m.round] = rounds[m.round] || []).push(m);
    }
    return rounds;
  };
  const place = (rounds, top, colOf) => {
    rounds.forEach((matches, r) => {
      matches.forEach((m, i) => {
        let y;
        if (r === 0) y = top + i * (mh + L.gap);
        else if (matches.length === rounds[r - 1].length) y = pos[rounds[r - 1][i].id].y;
        else y = between(pos[rounds[r - 1][i * 2].id].y, pos[rounds[r - 1][i * 2 + 1].id].y, sh);
        pos[m.id] = { x: L.cols[colOf(r)], y };
      });
    });
  };
  const winners = byRound(false);
  place(winners, L.top, (r) => r);
  let lastY = L.top + (winners[0].length - 1) * (mh + L.gap) + mh;
  const losers = byRound(true);
  if (losers.length) {
    const ltop = lastY + L.lgap;
    place(losers, ltop, (r) => r);
    lastY = ltop + (losers[0].length - 1) * (mh + L.gap) + mh;
  }
  const gf = built.matches.find((m) => m.id === 'GF');
  if (gf) {
    const wf = winners[winners.length - 1][0];
    if (losers.length) {
      const lf = losers[losers.length - 1][0];
      pos.GF = { x: L.cols[Math.max(winners.length, losers.length)], y: (mid(pos[wf.id].y, sh) + mid(pos[lf.id].y, sh)) / 2 - (sh + 2) };
    } else {
      pos.GF = { x: L.cols[winners.length], y: pos[wf.id].y };
    }
  }
  // Wires: from each match to the match its winner feeds.
  const wires = [];
  for (const m of f.matches) {
    for (const src of [m.top, m.bottom]) {
      if (!src.winner) continue;
      const from = pos[src.winner];
      const to = pos[m.id];
      if (!from || !to) continue;
      const done = built.matches.find((b) => b.id === src.winner);
      wires.push([from.x + L.w, mid(from.y, sh), to.x, mid(to.y, sh), Boolean(done && done.winner)]);
    }
  }
  return { L, pos, wires, winners, losers, lastY };
}

const thumbKeys = new Map();
function thumb(id, player, sh) {
  const el = document.createElement('div');
  el.className = 'k-thumb';
  if (sh < 40 || !player) { el.classList.add('hidden'); return el; }
  const img = document.createElement('img');
  img.className = 'art hidden';
  img.alt = '';
  img.draggable = false;
  const steps = legendSteps(player);
  if (steps.length) chainLoad(img, steps); else clearArt(img);
  el.append(img);
  thumbKeys.set(id, `${player.legendCardId || ''}|${player.legendSlug || ''}`);
  return el;
}

function slotEl(id, slot, score, cls, sh, small) {
  const s = document.createElement('div');
  const p = slot.player;
  s.className = `s ${cls}${p ? '' : ' tbd'}${small ? ' small' : ''}`;
  s.style.setProperty('--sh', String(sh));
  const sd = Object.assign(document.createElement('span'), { className: 'sd', textContent: p ? (p.seed || (slot.seedNo || '')) : '' });
  const who = document.createElement('div');
  who.className = 'who';
  const chip = Object.assign(document.createElement('span'), { className: 'k-chip', textContent: p && sh >= 40 ? (p.country || '') : '' });
  const nm = Object.assign(document.createElement('span'), { className: 'nm', textContent: p ? p.name : (slot.placeholder || 'TBD') });
  who.append(chip, nm);
  if (p && p.legend && sh >= 44) who.append(Object.assign(document.createElement('div'), { className: 'lg', textContent: p.legend.split(',')[0] }));
  s.append(sd, thumb(`${id}-${cls}`, p, sh), who);
  if (score !== null) s.append(Object.assign(document.createElement('div'), { className: 'sc', textContent: String(score) }));
  return s;
}

let treeKey = null;
function renderTree(format, built) {
  const key = JSON.stringify([format, built.matches.map((m) => [m.id, m.top.player && m.top.player.name, m.bottom.player && m.bottom.player.name, m.topScore, m.bottomScore, m.winner, m.state, m.top.player && m.top.player.legendSlug, m.bottom.player && m.bottom.player.legendSlug])]);
  if (treeKey === key) return;
  treeKey = key;
  const { L, pos, wires, winners, losers, lastY } = layout(format, built);
  const f = BRACKET_FORMATS[format];
  const nodes = [];
  const label = (text, x, y, sec) => {
    const el = document.createElement('div');
    el.className = `rl${sec ? ' sec' : ''}`;
    el.style.left = px(x); el.style.top = px(y);
    el.innerHTML = '';
    const b = Object.assign(document.createElement('b'), { textContent: text });
    el.append(b);
    return el;
  };
  const roundLabel = (rounds, names, best) => {
    rounds.forEach((matches, r) => {
      const first = pos[matches[0].id];
      const el = label(names[r] || '', first.x, first.y - 24, false);
      el.append(document.createTextNode(` · ${best}`));
      nodes.push(el);
    });
  };
  const bestOf = (m) => `Bo${m.id === 'GF' ? Math.max(3, 5) : 3}`;
  roundLabel(winners, f.rounds, 'Bo3');
  if (losers.length) {
    roundLabel(losers, f.losersRounds, 'Bo3');
    nodes.push(label('Winners bracket', 80, L.top - 56, true));
    const lo = label('Losers bracket', 80, pos[losers[0][0].id].y - 56, true);
    lo.append(document.createTextNode(' · drop from winners, one more loss and out'));
    nodes.push(lo);
  }
  for (const m of built.matches) {
    const p = pos[m.id];
    if (!p) continue;
    const box = document.createElement('div');
    box.className = 'm';
    box.style.left = px(p.x); box.style.top = px(p.y); box.style.width = px(L.w); box.style.height = px(L.sh * 2 + 4);
    const cls = (slot, which) => {
      if (m.winner === which) return 'win';
      if (m.winner) return 'out';
      if (m.state === 'live') return 'live';
      return slot.player && built.eliminated.has(slot.player.name) ? 'out' : '';
    };
    const showScore = m.state !== 'waiting';
    const small = L.sh < 40;
    box.append(
      Object.assign(slotEl(m.id, m.top, showScore ? m.topScore : null, `top ${cls(m.top, 'top')}`, L.sh, small)),
      Object.assign(slotEl(m.id, m.bottom, showScore ? m.bottomScore : null, `bot ${cls(m.bottom, 'bottom')}`, L.sh, small)),
    );
    if (m.id === 'GF') {
      const gl = label(m.label, p.x, p.y - 24, false);
      gl.append(document.createTextNode(` · Bo${bestOf(m).slice(2)}${losers.length ? ' · losers side must win twice' : ''}`));
      nodes.push(gl);
    }
    nodes.push(box);
  }
  $('tree').replaceChildren(...nodes);
  // Connectors.
  const svg = $('wire');
  svg.replaceChildren(...wires.map(([x1, y1, x2, y2, on]) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const mx = (x1 + x2) / 2;
    path.setAttribute('d', `M${x1},${y1} H${mx} V${y2} H${x2}`);
    if (on) path.classList.add('on');
    return path;
  }));
  // The champion slot to the right of the grand final.
  const gf = pos.GF;
  const champ = $('champ');
  if (gf) {
    champ.style.left = px(L.champX);
    champ.style.top = px(mid(gf.y, L.sh) - 80);
    champ.style.width = px(Math.min(L.w, 1920 - L.champX - 40));
    champ.classList.remove('hidden');
  }
  // A last wire from the grand final to the champion.
  if (gf) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${gf.x + L.w},${mid(gf.y, L.sh)} H${L.champX + 40}`);
    if (built.champion) path.classList.add('on');
    svg.append(path);
  }
}

function footLine(built) {
  const done = built.matches.filter((m) => m.winner);
  const live = built.matches.filter((m) => m.state === 'live');
  const bits = [];
  const last = done[done.length - 1];
  if (last) {
    const w = last.winner === 'top' ? last.top.player : last.bottom.player;
    bits.push(`${last.label} complete · <b>${w ? w.name : ''} advances</b>`);
  }
  for (const m of live.slice(0, 2)) bits.push(`${m.label} live, ${m.topScore}-${m.bottomScore}`);
  if (!bits.length) bits.push('Bracket set · play begins shortly');
  return bits.join(' · ');
}

let shownVisible = null;

const params = initStage({
  scene: 'bracket',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.bracket;
    const b = bank.event.bracket || { format: 'se8', players: [], results: {} };
    const format = BRACKET_FORMATS[b.format] ? b.format : 'se8';
    const built = buildBracket(format, b.players || [], b.results || {});

    setText($('title'), format.endsWith('16') ? 'Top 16' : 'Top 8');
    setText($('sub'), [bank.event.name, format.startsWith('de') ? 'Double elimination' : 'Single elimination'].filter(Boolean).join(' · '));
    renderTree(format, built);
    setText($('champName'), built.champion ? built.champion.name : 'To be decided');
    $('champ').classList.toggle('won', Boolean(built.champion));
    const foot = $('foot');
    const line = footLine(built);
    if (foot.dataset.line !== line) { foot.dataset.line = line; foot.innerHTML = line.replace(/<(?!\/?b>)/g, '&lt;'); }

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
