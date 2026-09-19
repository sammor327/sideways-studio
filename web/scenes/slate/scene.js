// Slate: the full-frame holds, every screen one layout (2026-09-19 rework,
// Sam: "make it look consistent and develop it based off of the key
// learnings and make the toggles work"). The head across the top, the
// screen's own column on the left, the rail on the right (break clock, a
// side panel turning through the event's details, sponsors), the feature
// tables or the foot along the bottom. web/shared/slate.js decides what each
// screen shows and which switches it reads; this file draws it.
//
// State: scenes.slate {mode, text / brbText / thanksText (each screen's own
// line), countdown, schedule, panel, sponsors, ticker, camera, every,
// clockLabel} over event.* (tables, seeds, casters,
// schedule + scheduleNow, format, commands, sponsors, nextName/nextWhen,
// champion, countdown), match.* (the fallback match, best of, who chose
// first) and the sponsor plate's logos.
import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, animEnabled } from '../../stage/seekclock.js';
import { chainLoad, clearArt, fullSteps, heroSteps } from '../../stage/art.js';
import { clockText, applyVisibility } from '../../stage/exp.js';
import { setClock } from '../../shared/clockcells.js';
import {
  SLATE_MODES, clockLabelOf, clockSet, commandList, nextMatch, nextThing, seedLines, slateBand, slateLine, slateMode,
  SLATE_SPONSORS_ROW, slatePages, slateScreen, slateSlot, slateSponsors, slateSub, slateTitle,
} from '../../shared/slate.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Draw a block again only when what it shows changed, so a state push that
// leaves it alone never reloads its art.
const drawn = new Map();
function changed(id, value) {
  const key = JSON.stringify(value);
  if (drawn.get(id) === key) return false;
  drawn.set(id, key);
  return true;
}

// --- a player, a table ---

function artImg(steps) {
  const img = el('img', 'art hidden');
  img.alt = '';
  img.draggable = false;
  if (steps.length) chainLoad(img, steps); else clearArt(img);
  return img;
}

function player(side, right) {
  const pl = el('div', `pl${right ? ' r' : ''}`);
  const hero = el('div', 'hero');
  hero.append(artImg(heroSteps(side)));
  const n = el('div', 'n');
  n.append(el('span', 'k-chip', side.country || ''), el('span', 'nm', side.name || 'TBD'));
  const lines = el('div', 'lines');
  lines.append(
    n,
    el('div', 'l1', [side.record, side.seed && `${side.seed} seed`].filter(Boolean).join(' · ')),
    el('div', 'l2', side.legend || ''),
  );
  pl.append(hero, lines);
  return pl;
}

function versus(t) {
  const vs = el('div', 'vs');
  vs.append(player(t.left, false), el('div', 'vsmark', 'VS'), player(t.right, true));
  return vs;
}

function tableCard(t) {
  const card = el('div', 'card tcard');
  card.append(el('span', 'tag', t.label || ''), versus(t));
  return card;
}

const named = (t) => t && ((t.left && t.left.name) || (t.right && t.right.name));

// --- up next ---

// The feature tables: one or two side by side in a card each, three or four
// in two columns with the players stacked. With none typed, the match in
// Match data stands in, so the screen is never blank.
function renderUpnext(bank) {
  const tables = (bank.event.tables || []).filter(named).map((t, i) => ({ ...t, label: t.label || `Table ${i + 1}` }));
  const fallback = nextMatch(bank);
  const list = tables.length ? tables : (fallback ? [fallback] : []);
  if (changed('tables', list)) {
    const box = $('tables');
    const n = list.length;
    box.className = `tables${n >= 3 ? ' grid stacked' : ''}`;
    box.style.setProperty('--k', n <= 1 ? '1.4' : (n === 2 ? '1.15' : '0.78'));
    box.replaceChildren(...list.map(tableCard));
  }
  $('tablesEmpty').classList.toggle('hidden', list.length > 0);
  const seeds = seedLines(bank.event.seeds);
  $('seedsBlock').classList.toggle('hidden', seeds.length === 0);
  if (changed('seeds', seeds)) {
    $('seeds').replaceChildren(...seeds.map((s, i) => {
      const box = el('div', 'seed');
      box.append(el('div', 'sd', String(i + 1)), el('div', 'nm', s.name), el('div', 'rc', s.rest.join(' · ')));
      return box;
    }));
  }
}

// --- the schedule, in three sizes (the hold, its own screen, the rail) ---

function scheduleRows(rows, now) {
  return rows.map(({ r, i }) => {
    const row = el('div', `row${i < now ? ' done' : ''}${i === now ? ' now' : ''}`);
    row.append(el('span', 't', r.time || ''), el('span', 'w', r.title || ''), el('span', 'st', i < now ? 'Done' : (i === now ? 'Up next' : '')));
    return row;
  });
}
const scheduleNow = (ev) => (Number.isInteger(ev.scheduleNow) ? ev.scheduleNow : -1);
const indexed = (rows) => rows.map((r, i) => ({ r, i }));

function renderSchedule(target, ev) {
  const rows = ev.schedule || [];
  const now = scheduleNow(ev);
  if (changed(target, [rows, now])) $(target).replaceChildren(...scheduleRows(indexed(rows), now));
}

// --- starting soon ---

function renderStarting(bank, cfg, mode) {
  const ev = bank.event;
  const clockOn = cfg.countdown !== false && clockSet(ev.countdown);
  const next = nextThing(ev);
  $('heroClock').classList.toggle('noclock', !clockOn);
  $('heroClock').classList.toggle('hidden', !clockOn && !next);
  setText($('heroLabel'), clockLabelOf(mode, cfg));
  setText($('heroNext'), next);
  $('holdSched').classList.toggle('hidden', cfg.schedule === false || !(ev.schedule || []).length);
  renderSchedule('holdRows', ev);
}

// --- be right back ---

function renderBrb(bank, cfg) {
  const ev = bank.event;
  const text = slateLine(cfg, 'brb');
  setText($('camTag'), ev.name ? `Live from ${ev.name}` : '');
  setText($('brbLine'), text);
  // Camera off: the operator's line large, the match coming up under it
  // (or, with neither, the next thing named).
  const match = nextMatch(bank);
  setText($('brbBig'), text || (match ? '' : nextThing(ev)));
  $('brbBig').style.setProperty('--ms', String(messageSize(text || nextThing(ev))));
  $('brbMatch').classList.toggle('hidden', !match);
  if (changed('brbMatch', match)) {
    $('brbMatch').style.setProperty('--k', '1.15');
    $('brbMatch').replaceChildren(...(match ? [tableCard(match)] : []));
  }
}

// --- thanks ---

function renderThanks(bank, cfg) {
  const ev = bank.event;
  const m = bank.match;
  const champ = ev.champion === 'left' ? m.left : (ev.champion === 'right' ? m.right : null);
  $('champ').classList.toggle('hidden', !champ);
  $('thanksBig').classList.toggle('hidden', Boolean(champ));
  setText($('champName'), champ ? champ.name || '' : '');
  if (changed('champLine', champ ? [champ.country, champ.legend, champ.record] : null)) {
    const line = $('champLine');
    line.replaceChildren();
    if (champ) {
      const words = [champ.legend, champ.record].filter(Boolean).join(' · ');
      line.append(el('span', 'k-chip', champ.country || ''), el('span', '', words));
    }
  }
  // The champion's whole figure behind the right of the column.
  const slug = champ ? champ.legendSlug || '' : '';
  $('thanksArt').classList.toggle('on', Boolean(slug));
  if (changed('thanksArt', slug)) {
    const img = $('thanksHero');
    const steps = champ ? fullSteps(champ) : [];
    if (steps.length) chainLoad(img, steps); else clearArt(img);
  }
  setText($('thanksLine'), slateLine(cfg, 'thanks'));
  $('nextBox').classList.toggle('hidden', !ev.nextName);
  setText($('nextName'), ev.nextName || '');
  setText($('nextWhen'), ev.nextWhen || '');
}

// --- custom ---

// The line's size steps down as it grows, so a short line is a headline and
// a long one still fits the column in three or four lines.
function messageSize(text) {
  const n = String(text || '').length;
  if (n <= 24) return 110;
  if (n <= 48) return 92;
  if (n <= 80) return 76;
  return 62;
}

function renderCustom(bank, cfg) {
  const text = slateLine(cfg, 'custom') || nextThing(bank.event);
  setText($('customMsg'), text);
  $('customMsg').style.setProperty('--ms', String(messageSize(text)));
  document.querySelector('.scr.custom .trim').classList.toggle('hidden', !text);
}

// --- today's schedule ---

function renderDay(bank) {
  const rows = bank.event.schedule || [];
  $('daySched').classList.toggle('hidden', rows.length === 0);
  $('dayEmpty').classList.toggle('hidden', rows.length > 0);
  renderSchedule('dayRows', bank.event);
}

// --- format ---

function renderFormat(bank) {
  const ev = bank.event;
  const m = bank.match;
  const facts = [
    { l: 'Each match', v: m.seriesLength > 1 ? `Best of ${m.seriesLength}` : 'One game', s: m.seriesLength > 1 ? `First to ${Math.ceil(m.seriesLength / 2)} games wins the match` : '' },
    { l: 'Each game', v: 'First to 8', s: 'points wins the game' },
  ];
  if (m.choseFirst === 'left' || m.choseFirst === 'right') {
    facts.push({ l: 'Game one', v: m[m.choseFirst].name || 'Player', s: 'chose first' });
  }
  if (changed('facts', facts)) {
    $('facts').style.setProperty('--fc', String(facts.length));
    $('facts').replaceChildren(...facts.map((f) => {
      const card = el('div', 'card fact');
      card.append(el('span', 'label', f.l), el('div', 'v', f.v), el('div', 's', f.s));
      return card;
    }));
  }
  setText($('fmtBig'), ev.format || '');
}

// --- the rail ---

// The side panel's pages: what each says, and how it is drawn.
function pageData(key, bank) {
  const ev = bank.event;
  switch (key) {
    case 'next': return nextMatch(bank);
    case 'schedule': return [ev.schedule || [], scheduleNow(ev)];
    case 'standings': return seedLines(ev.seeds);
    case 'format': return ev.format || '';
    case 'desk': return ev.casters || [];
    case 'commands': return commandList(ev.commands);
    case 'nextEvent': return [ev.nextName || '', ev.nextWhen || ''];
    default: return null;
  }
}

// The rail's schedule keeps six rows in view around the block up next.
const RAIL_ROWS = 6;

function buildPage(key, d) {
  const page = el('div', `page ${key}`);
  switch (key) {
    case 'next': {
      page.classList.add('stacked');
      page.style.setProperty('--k', '0.62');
      page.append(el('span', 'label', d.label ? `Up next · ${d.label}` : 'Up next'), versus(d));
      break;
    }
    case 'schedule': {
      const [rows, now] = d;
      const start = Math.max(0, Math.min(rows.length - RAIL_ROWS, now - 1));
      const box = el('div', 'sched');
      const list = el('div', 'rows');
      list.append(...scheduleRows(indexed(rows).slice(start, start + RAIL_ROWS), now));
      box.append(list);
      page.append(el('span', 'label', "Today's schedule"), box);
      break;
    }
    case 'standings': {
      const list = el('div', 'list');
      list.append(...d.map((s, i) => {
        const row = el('div', 'rowl');
        row.append(el('span', 'rk', String(i + 1)), el('span', 'nm', s.name), el('span', 'rc', s.rest.join(' · ')));
        return row;
      }));
      page.append(el('span', 'label', 'Standings'), list);
      break;
    }
    case 'format':
      page.append(el('span', 'label', 'Format'), el('div', 'txt', d));
      break;
    case 'desk': {
      const desk = el('div', 'desk');
      desk.append(...d.map((c) => {
        const row = el('div', 'row');
        const who = el('div', 'who');
        who.append(el('span', 'nm', c.name), el('span', 'hd', c.handle || ''));
        row.append(who, el('span', 'label', c.role || ''));
        return row;
      }));
      page.append(el('span', 'label', 'On the desk'), desk);
      break;
    }
    case 'commands': {
      const cmds = el('div', 'cmds');
      cmds.append(...d.map((c) => el('b', '', c)));
      page.append(el('span', 'label', 'Chat commands'), cmds);
      break;
    }
    case 'nextEvent':
      page.append(el('span', 'label', 'Next event'), el('div', 'ev', d[0]), el('div', 'when', d[1]));
      break;
    default:
  }
  return page;
}

let pageEls = [];
let dotEls = [];
let every = 15;
let sponsorEls = [];
let sponsorEvery = 8;

function renderRail(bank, cfg, mode) {
  const ev = bank.event;
  // The clock card, on the screens that count a break down; the hold
  // carries its clock as the hero instead.
  const clockOn = mode !== 'starting' && slateScreen(mode).switches.includes('countdown')
    && cfg.countdown !== false && clockSet(ev.countdown);
  $('clockCard').classList.toggle('hidden', !clockOn);
  setText($('clockLabel'), clockLabelOf(mode, cfg));
  setText($('clockNext'), nextThing(ev));

  every = cfg.every;
  const pages = slatePages(bank, mode).map((key) => [key, pageData(key, bank)]);
  $('infoCard').classList.toggle('hidden', pages.length === 0);
  if (changed('pages', pages)) {
    pageEls = pages.map(([key, d]) => buildPage(key, d));
    $('pages').replaceChildren(...pageEls);
    dotEls = pageEls.length > 1 ? pageEls.map(() => el('i')) : [];
    $('dots').replaceChildren(...dotEls);
    $('prog').classList.toggle('hidden', pageEls.length < 2);
  }

  const sponsors = cfg.sponsors === false ? [] : slateSponsors(bank);
  $('sponsCard').classList.toggle('hidden', sponsors.length === 0);
  sponsorEvery = (bank.scenes.sponsor && bank.scenes.sponsor.interval) || 8;
  if (changed('sponsors', sponsors)) {
    sponsorEls = [];
    for (let i = 0; i < sponsors.length; i += SLATE_SPONSORS_ROW) {
      const group = el('div', 'lgroup');
      const row = sponsors.slice(i, i + SLATE_SPONSORS_ROW);
      group.style.setProperty('--sc', String(Math.max(1, Math.min(SLATE_SPONSORS_ROW, sponsors.length))));
      group.append(...row.map(logo));
      sponsorEls.push(group);
    }
    $('logos').replaceChildren(...sponsorEls);
  }
}

// One sponsor: the uploaded logo, or the name in a box when there is none or
// it will not load.
function logo(s) {
  const box = el('div', 'lg');
  const asName = () => {
    box.className = 'lg name';
    box.replaceChildren(el('span', '', s.name || 'Sponsor'));
  };
  if (!s.image) { asName(); return box; }
  box.classList.add('img');
  const img = el('img');
  img.alt = s.name || '';
  img.draggable = false;
  img.onerror = asName;
  img.src = s.image;
  box.append(img);
  return box;
}

// --- the band: the feature tables, a page of two at a time ---

const BAND_HOLD = 6;
const BAND_RUN = 1686;
const BAND_SLOT_MAX = 840;
let bandPages = [];

// Rift Registry's icon cutout, then the face crop, then the card's painting.
function iconSteps(p) {
  const steps = [];
  if (p.legendSlug) {
    steps.push({ src: `/legendart/icon/${p.legendSlug}.webp`, cls: 'icon-tier' });
    steps.push({ src: `/legendart/hero/${p.legendSlug}.png` });
  }
  if (p.legendCardId) steps.push({ src: `/cardart/thumb/${p.legendCardId}.webp`, cls: 'crop-legend' });
  return steps;
}

function bandSide(p, where) {
  const cell = el('div', `bt-pl ${where}`);
  const steps = iconSteps(p);
  const ic = el('span', `bt-ic${steps.length ? '' : ' none'}`);
  ic.append(artImg(steps));
  cell.append(ic, el('span', 'nm', p.name || 'TBD'), el('span', 'rc', p.record || ''));
  return cell;
}

function bandTable(t, i) {
  const div = el('div', 'bt');
  const tb = el('div', 'bt-tb');
  tb.append(el('span', 'k', 'Table'), el('span', 'n', (/\d+/.exec(t.label || '') || [])[0] || String(i + 1)));
  div.append(tb, bandSide(t.left || {}, 'l'), el('div', 'bt-mid', 'VS'), bandSide(t.right || {}, 'r'));
  return div;
}

function renderBand(bank, mode) {
  const on = slateBand(bank, mode);
  root.classList.toggle('has-band', on);
  setText($('bandRound'), bank.event.roundTitle || '');
  const tables = on ? (bank.event.tables || []).filter(named) : [];
  if (!changed('band', tables)) return;
  const per = Math.min(2, tables.length);
  const sw = per ? Math.min(BAND_SLOT_MAX, Math.floor(BAND_RUN / per)) : 0;
  bandPages = [];
  for (let i = 0; i < tables.length; i += per) {
    const page = el('div', 'bpage');
    page.style.setProperty('--sw', String(sw));
    page.append(...tables.slice(i, i + per).map((t, j) => bandTable(t, i + j)));
    bandPages.push(page);
  }
  $('bandTrack').replaceChildren(...bandPages);
}

// --- the wall clock: the pages' turns and the clocks ---

function turn(els, slot, anim) {
  els.forEach((node, i) => {
    let a = 0;
    if (i === slot.index) a = anim ? slot.fade : 1;
    else if (i === slot.previous && anim && slot.fade < 1) a = 1 - slot.fade;
    node.style.setProperty('--a', String(a));
  });
}

// The side panel's height follows the page on show, eased from the last
// one's while they cross, in design pixels (layout reads work in an occluded
// browser source; only animation frames stop).
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
function fitPages(slot, anim) {
  const cur = pageEls[slot.index];
  const u = root.clientWidth / 1920;
  if (!cur || !u) return;
  const hc = cur.offsetHeight / u;
  const prev = pageEls[slot.previous];
  const hp = prev && anim && slot.fade < 1 ? prev.offsetHeight / u : hc;
  const h = hp + (hc - hp) * ease(anim ? slot.fade : 1);
  $('pages').style.setProperty('--ph', `calc(${h.toFixed(1)} * var(--u))`);
}

function tick() {
  const now = Date.now();
  const anim = animEnabled();
  const slot = slateSlot(pageEls.length, every, now);
  turn(pageEls, slot, anim);
  fitPages(slot, anim);
  dotEls.forEach((d, i) => d.classList.toggle('on', i === slot.index));
  $('prog').style.setProperty('--pg', String(anim ? slot.into || 0 : 1));
  turn(bandPages, slateSlot(bandPages.length, BAND_HOLD, now), anim);
  turn(sponsorEls, slateSlot(sponsorEls.length, sponsorEvery, now), anim);
}

let countdownState = null;
function paintClocks() {
  const text = clockText(countdownState);
  setClock($('clockDigits'), text);
  setClock($('heroDigits'), text);
}

setInterval(() => {
  if (root.classList.contains('off')) return;
  tick();
}, 50);
setInterval(() => {
  if (!root.classList.contains('off')) paintClocks();
}, 250);

function setLogo(img, logo) {
  if (img.getAttribute('src') !== (logo || null)) {
    if (logo) img.src = logo; else img.removeAttribute('src');
  }
  img.classList.toggle('hidden', !logo);
}

let shownVisible = null;

const params = initStage({
  scene: 'slate',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const cfg = bank.scenes.slate;
    const ev = bank.event;
    const mode = slateMode(cfg.mode);
    for (const k of SLATE_MODES) root.classList.toggle(`mode-${k}`, mode === k);
    root.classList.toggle('no-camera', cfg.camera === false);

    setText($('title'), slateTitle(mode, ev));
    setText($('sub'), slateSub(mode, ev));
    setLogo($('logo'), state.theme.logo || '');

    // Only the screen on show is drawn; the rest catch up when picked.
    if (mode === 'upnext') renderUpnext(bank);
    if (mode === 'starting') renderStarting(bank, cfg, mode);
    if (mode === 'brb') renderBrb(bank, cfg);
    if (mode === 'thanks') renderThanks(bank, cfg);
    if (mode === 'custom') renderCustom(bank, cfg);
    if (mode === 'schedule') renderDay(bank);
    if (mode === 'format') renderFormat(bank);
    renderRail(bank, cfg, mode);
    renderBand(bank, mode);

    countdownState = ev.countdown || countdownState;
    paintClocks();
    tick();

    const visible = params.force || cfg.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
