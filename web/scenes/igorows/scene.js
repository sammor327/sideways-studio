import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, animEnabled, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, cardSteps, heroSteps, battlefieldSteps, rotateIfPortrait } from '../../stage/art.js';
import { Slider, SwapSlot, loadArt } from '../../stage/slide.js';
import {
  clockText, fitText, renderRunes, loadLegendDomains, legendDomains, applyVisibility,
  handEls, handKey, handTotal, HandScroller, banishedRow, oddsRow, trashRow, trashSection,
} from '../../stage/exp.js';
import { parseDeck } from '../../stage/decks.js';
import { setClock } from '../../shared/clockcells.js';
import { rowsPlan, spotUntil } from '../../shared/rowsdock.js';
import { ROWS_DEFAULT, drawPool, drawsLabel, formatChance, oddsRows } from '../../shared/odds.js';
import { banishedRows, trashCounts, trashRows } from '../../shared/trash.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 550);

// --- the docked featured card (2026-09-19) ---
//
// Sam: an overlay version of the card popup that animates out the hand or
// the event logo and animates the card in over the column. It is the card
// popup's own card, shown while the popup is on in this bank and Dock
// featured card is (shared/carddock.js; the popup stands down meanwhile),
// in the middle of the column where the hands and the logo take turns, with
// its name and type under it. It comes in from the column's edge with the
// popup's turn once whatever held the middle is out; a new card slides the
// old one out first; a card on its way out keeps its art until it is off
// the column, as a hand does (stage/slide.js does the taking of turns).
//
// The art gets a moment to load out of sight before the card moves in, so
// it never arrives as an empty frame, but never more than ART_WAIT_MS: a
// slow file lands where the card already is.
const ART_WAIT_MS = 1200;

// Name, type and art for the docked card, through the popup's fallback
// chain (full art, the thumb, a named panel).
function fillDock(card) {
  const dockEl = $('cardDock');
  const fallback = $('dockFallback');
  setText($('dockName'), card.cardName || '');
  setText($('dockType'), card.cardType || '');
  setText($('dockFallbackName'), card.cardName || 'No card');
  fallback.classList.remove('on');
  dockEl.classList.remove('bf');
  return loadArt($('dockArt'), cardSteps(card.cardId), {
    cap: ART_WAIT_MS,
    // Battlefields are landscape cards stored portrait: turned on the
    // loaded file's evidence, as the popup does, never a per-card flag.
    onShow: (img) => dockEl.classList.toggle('bf', card.cardType === 'Battlefield' && img.naturalHeight > img.naturalWidth),
    onFail: () => fallback.classList.add('on'),
  });
}

// --- the trash, the odds to draw and a spotted sideboard card (2026-09-20) ---
//
// Sam: "can we create options to put the following into the left side of the
// in game overlay, rows where the hands live: 1. Trash 2. Odds to Draw
// 3. Sideboard Card Spotted. Treat this similar to how the card popup was
// generated." So they dock the way the popup's card does, each behind its own
// switch: a spotted card takes the whole middle the way a featured card does,
// and the two sheets take the half their player's hand lists in, one at a
// time. web/shared/rowsdock.js works out which, and the graphic whose content
// the column is really showing stands down, so nothing airs twice and nothing
// is lost for being outranked.
const SIDES = [['l', 'left'], ['r', 'right']];
const LISTS = ['hand', 'trash', 'odds'];

// The spotted card, through the same fallback chain as the docked card. Its
// player's name is written on every state, so a rename lands without a fly.
function fillSpot(spot) {
  const fallback = $('spotFallback');
  setText($('spotFallbackName'), spot.cardName || 'No card');
  fallback.classList.remove('on');
  return loadArt($('spotArt'), cardSteps(spot.cardId), {
    cap: ART_WAIT_MS,
    onFail: () => fallback.classList.add('on'),
  });
}

const logoSlide = new Slider($('logoWell'), '--lg', 450);
const listSlide = Object.fromEntries(SIDES.map(([p]) => [p,
  Object.fromEntries(LISTS.map((what) => [what, new Slider($(`${p}${what}Block`), '--hs', 450)]))]));
const ruleSlide = new Slider(document.querySelector('#root .divider'), '--hs', 450);
const dock = new SwapSlot($('cardDock'), '--cd', 500, { key: (card) => card.cardId, fill: fillDock });
const spotSlot = new SwapSlot($('spotDock'), '--cd', 500, { key: (spot) => spot.id, fill: fillSpot });
const sdSlide = new Slider($('sdView'), '--sv', 450);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

// --- the active player's legend glows (2026-09-19) ---
//
// Sam: the legends glow when it is their turn, a very slow pulse. The glow
// fades in over the legend of the player whose turn it is and out of the
// other's as the turn passes; the Active turn switch takes it off with the
// rest of the mark. The pulse runs off the wall clock like all motion here,
// so an occluded source never freezes it and every copy of the overlay
// breathes together; the waveform is worked out here so the CSS only
// multiplies. With motion off (anim=0, reduced motion) the glow holds at its
// brightest. Nothing is written while no glow can show: a browser source
// showing nothing should cost nothing.
const BREATH_MS = 6000;
const glowSlide = { l: new Slider($('lglow'), '--on', 800), r: new Slider($('rglow'), '--on', 800) };
// The glow behind a docked sideboard card breathes on the same waveform; the
// legends' own glow is off in webcam mode, where there are no legends.
let spotUp = false;
if (animEnabled()) {
  setInterval(() => {
    if (root.classList.contains('off')) return;
    const legends = !root.classList.contains('mode-webcam') && (glowSlide.l.on || glowSlide.r.on);
    if (!legends && !spotUp) return;
    const phase = (Date.now() % BREATH_MS) / BREATH_MS;
    root.style.setProperty('--breath', (0.5 - 0.5 * Math.cos(2 * Math.PI * phase)).toFixed(3));
  }, 100);
}

const shown = { hero: {}, hand: {}, trash: {}, odds: {}, sd: {} };
const scrollers = Object.fromEntries(SIDES.map(([p]) => [p,
  Object.fromEntries(LISTS.map((what) => [what, new HandScroller($(`${p}${what}View`), $(`${p}${what}`))]))]));
const sdFans = { l: $('lsdFan'), r: $('rsdFan') };
let lastState = null;

function loadHero(p, side) {
  const key = side.legendSlug || '';
  if (shown.hero[p] === key) return;
  shown.hero[p] = key;
  const img = $(`${p}hero`);
  const chip = $(`${p}chip`);
  chip.classList.remove('on');
  const steps = heroSteps(side);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
  const fail = img.onerror;
  img.onerror = () => {
    fail();
    if (!img.getAttribute('src')) {
      chip.textContent = (side.legend || key)[0].toUpperCase();
      chip.classList.add('on');
    }
  };
}

function renderDots(el, seriesLength, gameWins, animate) {
  const slots = winsNeeded(seriesLength);
  if (el.children.length !== slots) {
    el.replaceChildren(...Array.from({ length: slots }, () => Object.assign(document.createElement('div'), { className: 'dot' })));
  }
  [...el.children].forEach((dot, i) => {
    const won = i < gameWins;
    if (dot.classList.contains('won') !== won) {
      dot.classList.toggle('won', won);
      if (animate) bump(dot, '--bump');
    }
  });
}

// One player's cards in hand, always in the order they were typed; lanes
// mark each card's type on its row, and a hand too long for its share of
// the column scrolls through. Showing and hiding is the slider's (onState);
// a hand on its way out keeps its last cards until it is off the column.
function renderHand(p, side, show, lanes, art) {
  const block = $(`${p}handBlock`);
  const list = side.hand || [];
  block.classList.toggle('typed', lanes);
  if (!show) return;
  setText($(`${p}handCount`), String(handTotal(side)));
  const key = handKey(list, art);
  if (shown.hand[p] === key) return;
  shown.hand[p] = key;
  $(`${p}hand`).replaceChildren(...handEls(list, { art }));
  scrollers[p].hand.restart();
}

// The line a list puts up when it has nothing, and the odds' last row.
function noteRow(text) {
  const row = document.createElement('div');
  row.className = 'empty';
  row.textContent = text;
  return row;
}

// Everything a list's rows are drawn from, in one string, so a score bump
// never rebuilds them (the hands' rule).
const cardsKey = (list) => list.map((c) => `${c.cardId}|${c.cardName}|${c.energy}|${(c.domains || []).join(',')}|${c.flow ? 1 : 0}`).join(';');

// One player's trash in their half of the column: the trash graphic's own
// list (web/shared/trash.js), newest first, the Flow cards lit and, with Flow
// first on, ahead of the rest, the banished cards under a label row. Art
// follows the trash graphic's own switch, not the hands'.
function renderTrash(p, side, show, cfg) {
  if (!show) return;
  const art = cfg.art !== false;
  const flowFirst = cfg.flowFirst !== false;
  const list = side.trash || [];
  const banished = cfg.banished !== false ? (side.banished || []) : [];
  const counts = trashCounts(list);
  setText($(`${p}trashCount`), String(counts.cards));
  setText($(`${p}trashSub`), [
    counts.flow ? `${counts.flow} with Flow` : '',
    banished.length ? `${banished.length} banished` : '',
  ].filter(Boolean).join(' · '));
  const key = `${art ? 'A' : 'N'}${flowFirst ? 'F' : ''}:${cardsKey(list)}#${cardsKey(banished)}`;
  if (shown.trash[p] === key) return;
  shown.trash[p] = key;
  const rows = trashRows(list, { flowFirst });
  const bRows = banishedRows(banished);
  $(`${p}trash`).replaceChildren(
    ...(rows.length ? rows.map((r) => trashRow(r, art)) : [noteRow('No cards in the trash yet')]),
    ...(bRows.length ? [trashSection(banished.length), ...bRows.map((r) => banishedRow(r, art))] : []),
  );
  scrollers[p].trash.restart();
}

// The decks the odds are worked out from. A live game counts the deck itself;
// otherwise the player's list is parsed by the server, once per list, and the
// half fills when the answer lands (the champion catalog's rule).
const decks = new Map();
const parsing = new Set();
function drawPoolFor(side) {
  if ((side.deckLeft || []).length) return drawPool(side, null);
  const text = String(side.deckList || '');
  if (!text.trim()) return null;
  if (!decks.has(text)) {
    if (!parsing.has(text)) {
      parsing.add(text);
      parseDeck(text).then((deck) => {
        parsing.delete(text);
        if (decks.size > 8) decks.delete(decks.keys().next().value);
        decks.set(text, deck || null);
        if (lastState) render(lastState, false);
      });
    }
    return null;
  }
  const deck = decks.get(text);
  return deck ? drawPool(side, deck) : null;
}

// One player's odds to draw in their half: the odds graphic's own rows
// (web/shared/odds.js), likeliest first, as many as that graphic lists, the
// rest summed on a last row. While a list is still being read the half keeps
// the rows it has rather than blinking empty.
function renderOdds(p, side, show, cfg) {
  if (!show) return;
  const art = cfg.art !== false;
  const draws = cfg.draws || 1;
  const pool = drawPoolFor(side);
  setText($(`${p}oddsSub`), drawsLabel(draws));
  setText($(`${p}oddsCount`), pool ? String(pool.total) : '');
  if (!pool) return;
  const odds = oddsRows(pool, { draws, rows: cfg.rows || ROWS_DEFAULT });
  const key = `${art ? 'A' : 'N'}:${odds.rows.map((r) => `${r.cardId}|${r.cardName}|${r.left}|${r.chance.toFixed(5)}|${r.weight.toFixed(4)}`).join(';')}+${odds.rest.count}`;
  if (shown.odds[p] === key) return;
  shown.odds[p] = key;
  $(`${p}odds`).replaceChildren(
    ...(odds.rows.length ? odds.rows.map((r) => oddsRow(r, art)) : [noteRow('Nothing left to draw')]),
    ...(odds.rest.count ? [noteRow(`+ ${odds.rest.count} more card${odds.rest.count === 1 ? '' : 's'}, ${formatChance(odds.rest.best)} or less each`)] : []),
  );
  scrollers[p].odds.restart();
}

// --- the showdown in the column (2026-09-19) ---
//
// Sam: a version of the showdown like the cards in hand, split between the
// players, with each one's total might and the stack of cards they played.
// match.showdown carries it (a live feed fills it, the chain cue otherwise):
// each half heads with that side's might, the side ahead in the accent
// colour and the side with focus marked, over the cards that side played
// into the showdown, newest first, a card that has resolved dimmed. The
// halves scroll a long stack the way the hands do.
// Each half's stack as physical cards (2026-09-19, Sam: "show the physical
// cards that are added onto the chain"): oldest to newest from left to
// right, the newest on top, spread across the half and overlapping more as
// the stack grows. Sized from the fan's own box, which the battlefield
// strips change, by measuring it: no layout feature an older browser source
// might lack.
function layoutFan(fan) {
  const cards = [...fan.querySelectorAll('.pc')];
  const w = fan.clientWidth;
  const h = fan.clientHeight;
  if (!cards.length || !w || !h) return;
  const ch = Math.min(h, Math.floor((w * 1039) / 744));
  const cw = Math.round((ch * 744) / 1039);
  const step = cards.length > 1 ? Math.min(cw * 0.66, (w - cw) / (cards.length - 1)) : 0;
  cards.forEach((c, i) => {
    c.style.width = `${cw}px`;
    c.style.height = `${ch}px`;
    c.style.left = `${Math.round(i * step)}px`;
    c.style.zIndex = String(i + 1);
  });
}
// The fans come into being inside a hidden block and resize with the
// strips and the window, so they lay out again whenever their box changes.
if (typeof ResizeObserver === 'function') {
  const watch = new ResizeObserver((entries) => { for (const e of entries) layoutFan(e.target); });
  watch.observe(sdFans.l);
  watch.observe(sdFans.r);
}
window.addEventListener('resize', () => { layoutFan(sdFans.l); layoutFan(sdFans.r); });

// What each card on the stack is there for: its action, or for a card that
// went onto the chain whether it is still there.
const STACK_LABEL = {
  drew: 'Drew', discarded: 'Discarded', moved: 'Moved', trashed: 'Trashed', returned: 'To hand',
  banished: 'Banished', created: 'Created', milled: 'Milled', shuffled: 'To deck',
};
const stackLabel = (c) => (c.action && c.action !== 'played'
  ? STACK_LABEL[c.action] || c.action
  : (c.resolved ? 'Resolved' : 'On the chain'));

function physicalCard(c) {
  const el = document.createElement('div');
  el.className = 'pc';
  const img = document.createElement('img');
  img.className = 'art hidden';
  img.alt = '';
  img.draggable = false;
  const name = document.createElement('span');
  name.className = 'pc-name';
  name.textContent = c.cardName || '';
  const tag = document.createElement('span');
  tag.className = 'pc-tag';
  el.append(img, name, tag);
  const steps = c.cardId ? cardSteps(c.cardId) : [];
  if (steps.length) chainLoad(img, steps, () => el.classList.add('has-art')); else clearArt(img);
  return el;
}

const fanCards = { l: [], r: [] };
let sdBgId = null;

function renderShowdown(m, show, art, animate) {
  if (!show) return;
  const sd = m.showdown || {};
  setText($('sdBf'), sd.battlefield || '');
  // The contested battlefield's art behind the whole showdown, turned the
  // right way up when the file is stored on its side (2026-09-19).
  const bfId = sd.battlefieldCardId || '';
  if (bfId !== sdBgId) {
    sdBgId = bfId;
    if (bfId) chainLoad($('sdBgArt'), battlefieldSteps(bfId), rotateIfPortrait); else clearArt($('sdBgArt'));
    $('sdView').classList.toggle('has-bg', Boolean(bfId));
  }
  const might = sd.might || {};
  const known = Number.isFinite(might.left) && Number.isFinite(might.right);
  for (const [p, s, o] of [['l', 'left', 'right'], ['r', 'right', 'left']]) {
    const v = might[s];
    // Might when a live feed knows it; a showdown run by hand has none.
    setText($(`${p}sdLabel`), Number.isFinite(v) ? 'Might' : 'Cards played');
    if (setText($(`${p}might`), Number.isFinite(v) ? String(v) : '') && animate) bump($(`${p}might`), '--bump');
    $(`${p}sd`).classList.toggle('lead', known && v > might[o]);
    $(`${p}sd`).classList.toggle('has-focus', sd.priority === s);
    const cards = (sd.chain || []).filter((c) => c.side === s);
    const key = cards.map((c) => `${c.cardId}|${c.cardName}|${c.action || ''}|${c.resolved ? 1 : 0}`).join(';');
    if (shown.sd[p] === key) continue;
    const grew = shown.sd[p] !== undefined && cards.length > fanCards[p].length;
    shown.sd[p] = key;
    // A card already in its place keeps its element (and its loaded art);
    // only what changed is new.
    const prev = fanCards[p];
    const next = cards.map((c, i) => {
      const k = `${c.cardId}|${c.cardName}`;
      const el = prev[i] && prev[i].k === k ? prev[i].el : physicalCard(c);
      el.classList.toggle('resolved', Boolean(c.resolved));
      el.querySelector('.pc-tag').textContent = stackLabel(c);
      return { k, el };
    });
    fanCards[p] = next;
    if (!next.length) {
      sdFans[p].replaceChildren(Object.assign(document.createElement('div'), { className: 'sd-none', textContent: 'Nothing played yet' }));
      continue;
    }
    sdFans[p].replaceChildren(...next.map((x) => x.el));
    layoutFan(sdFans[p]);
    if (grew && animate) bump(next[next.length - 1].el, '--bump');
  }
}

function proLine(side) {
  return [side.pronouns, side.record].filter(Boolean).join(' · ');
}

function renderSide(p, side, m, animate) {
  fitText($(`${p}name`), side.name, { size: 34, min: 22, run: 380 });
  setText($(`${p}pro`), proLine(side));
  setText($(`${p}country`), side.country || '');
  if (setText($(`${p}pts`), side.score) && animate) bump($(`${p}pts`), '--bump');
  setText($(`${p}legend`), side.legend || ' ');
  setText($(`${p}champion`), [side.champion, side.archetype].filter(Boolean).join(' · '));
  renderRunes($(`${p}runes`), legendDomains(side));
  renderDots($(`${p}dots`), m.seriesLength, side.gameWins, animate);
  loadHero(p, side);
}

// --- battlefields (2026-09-18) ---
//
// A strip of its own beside each player's camera. "all" is the three the
// player brought in the order typed, the one in play marked with an arrow
// and the ones played before greyed; "one" is the battlefield in play alone.
// A player with no three typed still shows the one in play. A battlefield
// whose game is decided (2026-09-19, Sam) carries its mark instead of the
// grey: a crown with the game's number where the player won, in colour; a
// red X with the number, tinted red, where they lost.
function bfEntries(side, mode) {
  const now = String(side.battlefield || '').toLowerCase();
  const pool = (side.battlefields || []).map((b) => ({ ...b, now: Boolean(now) && b.name.toLowerCase() === now }));
  if (mode === 'one') {
    if (!side.battlefield) return [];
    const mine = pool.find((b) => b.now) || {};
    return [{ name: side.battlefield, cardId: side.battlefieldCardId || '', now: false, played: false, game: mine.game || 0, result: mine.result || '' }];
  }
  if (!pool.length && side.battlefield) return [{ name: side.battlefield, cardId: side.battlefieldCardId || '', now: true, played: true }];
  return pool;
}

const RESULTS = ['won', 'lost'];

// The name, with the result's mark before it once the game is decided.
function bfName(b) {
  const nm = document.createElement('span');
  nm.className = 'nm';
  if (!RESULTS.includes(b.result)) {
    nm.textContent = b.name;
    return nm;
  }
  const mark = document.createElement('span');
  mark.className = `res ${b.result === 'won' ? 'crown' : 'cross'}`;
  const shape = document.createElement('span');
  shape.className = 'shape';
  const game = document.createElement('span');
  game.className = 'g';
  game.textContent = b.game ? String(b.game) : '';
  mark.append(shape, game);
  const text = document.createElement('span');
  text.className = 't';
  text.textContent = b.name;
  nm.append(mark, text);
  return nm;
}

const bfShown = { l: null, r: null };
function renderBattlefields(p, side, mode) {
  const box = $(`${p}bfs`);
  const list = mode === 'one' || mode === 'all' ? bfEntries(side, mode) : [];
  const key = JSON.stringify([mode, list]);
  if (bfShown[p] === key) return list.length > 0;
  bfShown[p] = key;
  box.classList.toggle('gone', !list.length);
  box.classList.toggle('one', mode === 'one');
  box.replaceChildren(...list.map((b) => {
    const tile = document.createElement('div');
    const result = RESULTS.includes(b.result) ? b.result : '';
    tile.className = `bft${b.now ? ' now' : ''}${b.played && !b.now && !result ? ' played' : ''}${result ? ` ${result}` : ''}`;
    const img = document.createElement('img');
    img.className = 'art hidden';
    img.alt = '';
    img.draggable = false;
    tile.append(img, bfName(b));
    if (b.cardId) chainLoad(img, battlefieldSteps(b.cardId), rotateIfPortrait);
    return tile;
  }));
  return list.length > 0;
}

// The event logo: the theme logo, or the event name when none is uploaded,
// with the round title and turn under it. The logo answers to its own
// switch; the round shows either way.
function renderLogo(state, bank, scene, round) {
  const logo = state.theme.logo || '';
  const logoOn = scene.eventLogo !== false;
  const img = $('eventLogo');
  if (img.getAttribute('src') !== (logo || null)) {
    if (logo) img.src = logo; else img.removeAttribute('src');
  }
  img.classList.toggle('hidden', !logoOn || !logo);
  setText($('eventName'), logoOn && !logo ? (bank.event.name || '') : '');
  setText($('round'), round);
  return (logoOn && Boolean(logo || bank.event.name)) || Boolean(round);
}

let timerState = null;
setInterval(() => {
  if (!root.classList.contains('off')) setClock($('clock'), clockText(timerState));
}, 250);

let shownVisible = null;
let spotTimer = null;

function render(state, first) {
  $('diag').classList.remove('on');
  const bank = sceneBank(state, params);
  const m = bank.match;
  const scene = bank.scenes.igorows;
  // The docked sheets keep their own graphic's settings: its art, its Flow
  // order, how many rows of odds and over how many draws.
  const trashCfg = bank.scenes.trash || {};
  const oddsCfg = bank.scenes.odds || {};
  const animate = !first;

  root.classList.toggle('mode-webcam', scene.mode === 'webcam');
  root.classList.toggle('mode-legend', scene.mode !== 'webcam');
  // Each piece of the game state is the operator's to switch off: the
  // active-turn mark, the points boxes, the turn in the round title.
  const activeOn = scene.activeTurn !== false;
  root.classList.toggle('active-left', activeOn && m.activeSide === 'left');
  root.classList.toggle('active-right', activeOn && m.activeSide === 'right');
  glowSlide.l.set(activeOn && m.activeSide === 'left', first);
  glowSlide.r.set(activeOn && m.activeSide === 'right', first);
  root.classList.toggle('no-points', scene.points === false);

  renderSide('l', m.left, m, animate);
  renderSide('r', m.right, m, animate);
  const bfMode = scene.battlefields || 'off';
  root.classList.toggle('bf-l', renderBattlefields('l', m.left, bfMode));
  root.classList.toggle('bf-r', renderBattlefields('r', m.right, bfMode));
  // The showdown pill and the lit reactions: the operator's switch, or a
  // showdown that is really open.
  const sdOpen = Boolean(m.showdown && m.showdown.active);
  root.classList.toggle('showdown', Boolean(scene.showdown) || sdOpen);
  const lanes = scene.handStyle === 'lanes';
  const art = scene.handArt !== false;

  const turnOn = scene.turnCounter !== false && m.turn > 0;
  const round = [bank.event.roundTitle, turnOn ? `Turn ${m.turn}` : ''].filter(Boolean).join(' · ');
  const logoHas = renderLogo(state, bank, scene, round);
  // The middle of the column holds one thing at a time: the card popup's
  // card, a card a player was spotted siding in, the open showdown, the
  // players' lists (each half its player's trash, their odds to draw or
  // their cards in hand) or the event logo. web/shared/rowsdock.js decides,
  // and the graphic whose content the column shows stands down. Whatever is
  // leaving slides out before the one coming in slides in.
  const plan = rowsPlan(bank);
  const halves = plan.halves;
  renderShowdown(m, plan.middle === 'showdown', art, animate);
  renderHand('l', m.left, halves.left === 'hand', lanes, art);
  renderHand('r', m.right, halves.right === 'hand', lanes, art);
  for (const [p, key] of SIDES) {
    renderTrash(p, m[key], halves[key] === 'trash', trashCfg);
    renderOdds(p, m[key], halves[key] === 'odds', oddsCfg);
  }
  spotUp = plan.middle === 'spot';
  if (plan.spot) setText($('spotWho'), plan.spot.player || (m[plan.spot.side] || {}).name || '');
  const middle = plan.middle || (logoHas ? 'logo' : '');
  const twoLists = middle === 'lists' && Boolean(halves.left) && Boolean(halves.right);
  const out = Promise.all([
    middle !== 'card' && dock.set(null, first),
    middle !== 'spot' && spotSlot.set(null, first),
    ...SIDES.flatMap(([p, key]) => LISTS.map((what) => halves[key] !== what && listSlide[p][what].set(false, first))),
    !twoLists && ruleSlide.set(false, first),
    middle !== 'logo' && logoSlide.set(false, first),
    middle !== 'showdown' && sdSlide.set(false, first),
  ]);
  if (middle === 'card') dock.set(plan.card, first, out);
  if (middle === 'spot') spotSlot.set(plan.spot, first, out);
  if (middle === 'lists') {
    for (const [p, key] of SIDES) if (halves[key]) listSlide[p][halves[key]].set(true, first, out);
    if (twoLists) ruleSlide.set(true, first, out);
  }
  if (middle === 'logo') logoSlide.set(true, first, out);
  if (middle === 'showdown') sdSlide.set(true, first, out);

  // A spotted card's hold runs out at a moment, which no state push
  // announces: the column looks again for itself, and the card goes.
  clearTimeout(spotTimer);
  const until = plan.spot ? spotUntil(bank.scenes.sidespot) : 0;
  if (until) spotTimer = setTimeout(() => { if (lastState) render(lastState, false); }, Math.max(0, until - Date.now()) + 30);

  $('clock').classList.toggle('hidden', scene.clock === false);
  timerState = m.timer || timerState;
  setClock($('clock'), clockText(timerState));

  const visible = params.force || scene.visible;
  $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
  shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
}

const params = initStage({
  scene: 'igorows',
  onState(state, first) {
    lastState = state;
    render(state, first);
  },
});

loadLegendDomains(() => {
  if (!lastState) return;
  const m = sceneBank(lastState, params).match;
  renderRunes($('lrunes'), legendDomains(m.left));
  renderRunes($('rrunes'), legendDomains(m.right));
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
