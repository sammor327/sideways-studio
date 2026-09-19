import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps } from '../../stage/art.js';
import { clockText, applyVisibility } from '../../stage/exp.js';
import { setClock } from '../../shared/clockcells.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

const MODES = ['upnext', 'starting', 'brb', 'thanks', 'custom'];

// Hero art per table side, keyed so a state push that changes nothing about
// a slot never restarts its image load.
const heroKeys = new Map();
function heroImg(slotKey, side) {
  const img = document.createElement('img');
  img.className = 'art hidden';
  img.alt = '';
  img.draggable = false;
  const steps = heroSteps(side);
  if (steps.length) chainLoad(img, steps); else clearArt(img);
  heroKeys.set(slotKey, side.legendSlug || '');
  return img;
}

function playerBlock(side, right, slotKey) {
  const pl = document.createElement('div');
  pl.className = `pl${right ? ' r' : ''}`;
  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.append(heroImg(slotKey, side));
  const lines = document.createElement('div');
  lines.className = 'lines';
  const n = document.createElement('div');
  n.className = 'n';
  const chip = Object.assign(document.createElement('span'), { className: 'chip', textContent: side.country || '' });
  const nm = Object.assign(document.createElement('span'), { className: 'nm', textContent: side.name || ' ' });
  n.append(chip, nm);
  const l1 = Object.assign(document.createElement('div'), {
    className: 'l1',
    textContent: [side.record, side.seed && `${side.seed} seed`].filter(Boolean).join(' · '),
  });
  const l2 = Object.assign(document.createElement('div'), { className: 'l2', textContent: side.legend || '' });
  lines.append(n, l1, l2);
  pl.append(hero, lines);
  return pl;
}

function vsBlock(left, right, keyPrefix) {
  return [playerBlock(left, false, `${keyPrefix}l`), Object.assign(document.createElement('div'), { className: 'vsmark', textContent: 'VS' }), playerBlock(right, true, `${keyPrefix}r`)];
}

let tablesKey = null;
function renderTables(tables) {
  const key = JSON.stringify(tables);
  if (key === tablesKey) return;
  tablesKey = key;
  $('tables').replaceChildren(...tables.map((t, i) => {
    const box = document.createElement('div');
    box.className = 'table';
    const tag = Object.assign(document.createElement('span'), { className: 'tag', textContent: t.label || `Table ${i + 1}` });
    const vs = document.createElement('div');
    vs.className = 'vs';
    vs.append(...vsBlock(t.left, t.right, String(i)));
    box.append(tag, vs);
    return box;
  }));
}

// One line per seed: "Name · 8-2-0 · Yasuo". The first segment is the name,
// the rest prints as the small line.
let seedsKey = null;
function renderSeeds(text) {
  if (text === seedsKey) return;
  seedsKey = text;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);
  $('seedsBlock').classList.toggle('hidden', lines.length === 0);
  $('seeds').replaceChildren(...lines.map((line, i) => {
    const [name, ...rest] = line.split(/\s*[·|,]\s*/);
    const s = document.createElement('div');
    s.className = 's';
    s.append(
      Object.assign(document.createElement('div'), { className: 'sd', textContent: String(i + 1) }),
      Object.assign(document.createElement('div'), { className: 'nm', textContent: name }),
      Object.assign(document.createElement('div'), { className: 'rc', textContent: rest.join(' · ') }),
    );
    return s;
  }));
}

let castersKey = null;
function renderCasters(casters) {
  const key = JSON.stringify(casters);
  if (key === castersKey) return;
  castersKey = key;
  $('castBox').classList.toggle('hidden', casters.length === 0);
  $('casters').replaceChildren(...casters.map((c) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      Object.assign(document.createElement('span'), { className: 'nm', textContent: c.name }),
      Object.assign(document.createElement('span'), { className: 'label', textContent: c.role || '' }),
    );
    return row;
  }));
}

// --- the hold (starting soon): schedule, format, first feature match, sponsors, ticker ---

let schedKey = null;
function renderSchedule(rows, now, on) {
  const key = JSON.stringify([rows, now, on]);
  if (key === schedKey) return;
  schedKey = key;
  $('sched').classList.toggle('hidden', !on || rows.length === 0);
  $('schedRows').replaceChildren(...rows.map((r, i) => {
    const row = document.createElement('div');
    row.className = `row${i < now ? ' done' : ''}${i === now ? ' now' : ''}`;
    row.append(
      Object.assign(document.createElement('span'), { className: 't', textContent: r.time || '' }),
      Object.assign(document.createElement('span'), { className: 'w', textContent: r.title }),
      Object.assign(document.createElement('span'), { className: 'st', textContent: i < now ? 'Done' : (i === now ? 'Up next' : '') }),
    );
    return row;
  }));
}

function renderSponsors(el, text) {
  const names = String(text || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const key = names.join('|');
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.replaceChildren(...names.map((n) => Object.assign(document.createElement('div'), { className: 'logo', textContent: n })));
  const box = el.closest('.panel');
  if (box) box.classList.toggle('hidden', names.length === 0);
}

const featureKeys = {};
function renderFeature(el, labelEl, label, tables, m, column) {
  // The first feature table, or the match sides when no table is listed.
  const t = tables[0];
  const pick = (s) => ({ name: s.name, country: s.country, record: s.record, seed: s.seed, legend: s.legend, legendSlug: s.legendSlug });
  const left = t ? t.left : pick(m.left);
  const right = t ? t.right : pick(m.right);
  const key = JSON.stringify([left, right, label, t && t.label]);
  if (featureKeys[el.id] === key) return;
  featureKeys[el.id] = key;
  const any = left.name || right.name;
  el.closest('.panel').classList.toggle('hidden', !any);
  setText(labelEl, t && t.label ? `${label} · ${t.label}` : label);
  if (column) el.replaceChildren(playerBlock(left, false, `${el.id}l`), playerBlock(right, false, `${el.id}r`));
  else el.replaceChildren(...vsBlock(left, right, el.id));
}

let tickerKey = null;
function renderTicker(tables, on) {
  const key = JSON.stringify([tables, on]);
  if (tickerKey === key) return;
  tickerKey = key;
  root.classList.toggle('has-ticker', on && tables.length > 0);
  $('tickerItems').replaceChildren(...tables.map((t, i) => {
    const it = document.createElement('div');
    it.className = 'it';
    it.append(
      Object.assign(document.createElement('span'), { className: 'tb', textContent: t.label || `T${i + 1}` }),
      Object.assign(document.createElement('span'), { className: 'nm', textContent: t.left.name }),
      Object.assign(document.createElement('span'), { className: 'rc', textContent: t.left.record || '' }),
      Object.assign(document.createElement('span'), { className: 'tb', textContent: 'vs' }),
      Object.assign(document.createElement('span'), { className: 'nm', textContent: t.right.name }),
      Object.assign(document.createElement('span'), { className: 'rc', textContent: t.right.record || '' }),
    );
    return it;
  }));
}

function renderCommands(text) {
  const el = $('cmds');
  const parts = String(text || '').split(/[,\s]+/).filter(Boolean);
  const key = parts.join('|');
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  $('cmdBox').classList.toggle('hidden', parts.length === 0);
  const nodes = [];
  parts.forEach((p, i) => {
    if (i) nodes.push(document.createTextNode(' · '));
    nodes.push(Object.assign(document.createElement('b'), { textContent: p }));
  });
  el.replaceChildren(...nodes);
}

let heroKey = null;
function loadThanksHero(side) {
  const key = side ? (side.legendSlug || '') : '';
  if (heroKey === key) return;
  heroKey = key;
  const img = $('thanksHero');
  const steps = side ? heroSteps(side) : [];
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

function setLogo(imgEl, markEl, logo) {
  if (imgEl.getAttribute('src') !== (logo || null)) {
    if (logo) imgEl.src = logo; else imgEl.removeAttribute('src');
  }
  imgEl.classList.toggle('hidden', !logo);
  if (markEl) markEl.classList.toggle('hidden', Boolean(logo));
}

let countdownState = null;
function paintClocks() {
  const text = clockText(countdownState);
  setClock($('countdown'), text);
  setClock($('holdClock'), text);
  setClock($('brbClock'), text);
}
setInterval(() => {
  if (!root.classList.contains('off')) paintClocks();
}, 250);

let shownVisible = null;

const params = initStage({
  scene: 'slate',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const scene = bank.scenes.slate;
    const ev = bank.event;
    const m = bank.match;
    const mode = MODES.includes(scene.mode) ? scene.mode : 'upnext';
    for (const k of MODES) root.classList.toggle(`mode-${k}`, mode === k);
    root.classList.toggle('mode-message', mode === 'custom');
    root.classList.toggle('no-camera', scene.camera === false);
    const logo = state.theme.logo || '';

    // Up next.
    setText($('eyebrow'), ev.name || '');
    setText($('sub'), ev.roundTitle || '');
    renderTables(ev.tables || []);
    renderSeeds(ev.seeds || '');

    // Starting soon.
    setLogo($('holdLogo'), $('holdMark'), logo);
    setText($('holdEvent'), ev.name || 'Sideways Studio');
    setText($('holdRound'), ev.roundTitle || '');
    const c = ev.countdown || {};
    const hasClock = scene.countdown && (c.countdown > 0 || c.running || c.elapsed > 0);
    $('holdClock').classList.toggle('hidden', !hasClock);
    setText($('holdClockLabel'), hasClock ? (ev.roundTitle ? `${ev.roundTitle} begins` : 'Stream begins') : '');
    renderSchedule(ev.schedule || [], Number.isInteger(ev.scheduleNow) ? ev.scheduleNow : -1, scene.schedule !== false);
    setText($('fmtText'), ev.format || '');
    $('fmtBox').classList.toggle('hidden', !ev.format);
    renderFeature($('holdVs'), $('holdNextLabel'), 'Feature match', ev.tables || [], m, false);
    renderSponsors($('holdSponsors'), ev.sponsors);
    renderTicker(ev.tables || [], scene.ticker !== false);

    // Be right back.
    setText($('camTag'), ev.name ? `Live from ${ev.name}` : '');
    renderFeature($('brbVs'), $('brbNextLabel'), 'Up next', ev.tables || [], m, true);
    renderCommands(ev.commands);
    setText($('brbMsg'), scene.text || ev.roundTitle || '');
    setText($('brbSub'), scene.text && ev.roundTitle ? ev.roundTitle : '');
    renderSponsors($('brbSponsors'), ev.sponsors);
    $('brbBar').classList.remove('hidden');

    // Thanks.
    setLogo($('thanksLogo'), $('thanksMark'), logo);
    setText($('thanksEvent'), ev.name || 'Sideways Studio');
    setText($('thanksRound'), ev.roundTitle || '');
    const champ = ev.champion === 'left' ? m.left : (ev.champion === 'right' ? m.right : null);
    setText($('thanksKey'), champ ? 'Your champion' : 'Thanks for watching');
    setText($('thanksName'), champ ? (champ.name || '') : '');
    setText($('thanksLegend'), champ ? [champ.country, champ.legend, champ.record].filter(Boolean).join(' · ') : '');
    loadThanksHero(champ);
    setText($('thanksLine'), scene.text || '');
    $('nextBox').classList.toggle('hidden', !ev.nextName);
    setText($('nextName'), ev.nextName || '');
    setText($('nextWhen'), ev.nextWhen || '');

    // Custom line.
    setText($('msgEyebrow'), ev.name || '');
    setText($('msgTitle'), scene.text || ' ');
    setText($('msgSub'), ev.roundTitle || '');

    renderCasters(ev.casters || []);
    $('countBox').classList.toggle('hidden', !scene.countdown);
    countdownState = ev.countdown || countdownState;
    paintClocks();

    setLogo($('footLogo'), null, logo);
    setText($('footEvent'), ev.name || '');

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
