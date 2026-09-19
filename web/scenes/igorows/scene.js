import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, cardSteps, heroSteps, battlefieldSteps, rotateIfPortrait } from '../../stage/art.js';
import { Slider, SwapSlot, loadArt } from '../../stage/slide.js';
import { clockText, fitText, renderRunes, loadLegendDomains, legendDomains, applyVisibility, handEls, handKey, handTotal, HandScroller } from '../../stage/exp.js';
import { setClock } from '../../shared/clockcells.js';
import { rowsDockCard } from '../../shared/carddock.js';

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

const logoSlide = new Slider($('logoWell'), '--lg', 450);
const handSlide = { l: new Slider($('lhandBlock'), '--hs', 450), r: new Slider($('rhandBlock'), '--hs', 450) };
const ruleSlide = new Slider(document.querySelector('#root .divider'), '--hs', 450);
const dock = new SwapSlot($('cardDock'), '--cd', 500, { key: (card) => card.cardId, fill: fillDock });
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

const shown = { hero: {}, hand: {} };
const scrollers = { l: new HandScroller($('lhandView'), $('lhand')), r: new HandScroller($('rhandView'), $('rhand')) };
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
  scrollers[p].restart();
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
// A player with no three typed still shows the one in play.
function bfEntries(side, mode) {
  const now = String(side.battlefield || '').toLowerCase();
  if (mode === 'one') {
    return side.battlefield ? [{ name: side.battlefield, cardId: side.battlefieldCardId || '', now: false, played: false }] : [];
  }
  const pool = (side.battlefields || []).map((b) => ({ ...b, now: Boolean(now) && b.name.toLowerCase() === now }));
  if (!pool.length && side.battlefield) return [{ name: side.battlefield, cardId: side.battlefieldCardId || '', now: true, played: true }];
  return pool;
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
    tile.className = `bft${b.now ? ' now' : ''}${b.played && !b.now ? ' played' : ''}`;
    const img = document.createElement('img');
    img.className = 'art hidden';
    img.alt = '';
    img.draggable = false;
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = b.name;
    tile.append(img, nm);
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

const params = initStage({
  scene: 'igorows',
  onState(state, first) {
    lastState = state;
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.igorows;
    const animate = !first;

    root.classList.toggle('mode-webcam', scene.mode === 'webcam');
    root.classList.toggle('mode-legend', scene.mode !== 'webcam');
    // Each piece of the game state is the operator's to switch off: the
    // active-turn mark, the points boxes, the turn in the round title.
    const activeOn = scene.activeTurn !== false;
    root.classList.toggle('active-left', activeOn && m.activeSide === 'left');
    root.classList.toggle('active-right', activeOn && m.activeSide === 'right');
    root.classList.toggle('no-points', scene.points === false);

    renderSide('l', m.left, m, animate);
    renderSide('r', m.right, m, animate);
    const bfMode = scene.battlefields || 'off';
    root.classList.toggle('bf-l', renderBattlefields('l', m.left, bfMode));
    root.classList.toggle('bf-r', renderBattlefields('r', m.right, bfMode));
    root.classList.toggle('showdown', Boolean(scene.showdown));
    const lanes = scene.handStyle === 'lanes';
    const art = scene.handArt !== false;
    const handL = Boolean(scene.hand) && handTotal(m.left) > 0;
    const handR = Boolean(scene.hand) && handTotal(m.right) > 0;
    renderHand('l', m.left, handL, lanes, art);
    renderHand('r', m.right, handR, lanes, art);

    const turnOn = scene.turnCounter !== false && m.turn > 0;
    const round = [bank.event.roundTitle, turnOn ? `Turn ${m.turn}` : ''].filter(Boolean).join(' · ');
    const logoHas = renderLogo(state, bank, scene, round);
    const card = rowsDockCard(bank);
    // The middle of the column holds one thing at a time: the docked card
    // while the card popup is on, else the hands while either player has
    // one listed, else the event logo. Whatever is leaving slides out
    // before the one coming in slides in, and the hands keep their lists up
    // to date while a card holds their place.
    const middle = card ? 'card' : (handL || handR ? 'hands' : (logoHas ? 'logo' : ''));
    const twoHands = middle === 'hands' && handL && handR;
    const out = Promise.all([
      middle !== 'card' && dock.set(null, first),
      middle !== 'hands' && handSlide.l.set(false, first),
      middle !== 'hands' && handSlide.r.set(false, first),
      !twoHands && ruleSlide.set(false, first),
      middle !== 'logo' && logoSlide.set(false, first),
    ]);
    if (middle === 'card') dock.set(card, first, out);
    if (middle === 'hands') {
      handSlide.l.set(handL, first, out);
      handSlide.r.set(handR, first, out);
      if (twoHands) ruleSlide.set(true, first, out);
    }
    if (middle === 'logo') logoSlide.set(true, first, out);

    $('clock').classList.toggle('hidden', scene.clock === false);
    timerState = m.timer || timerState;
    setClock($('clock'), clockText(timerState));

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
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
