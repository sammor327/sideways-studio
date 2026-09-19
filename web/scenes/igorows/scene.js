import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, heroSteps, battlefieldSteps, rotateIfPortrait } from '../../stage/art.js';
import { clockText, fitText, renderRunes, loadLegendDomains, legendDomains, applyVisibility, handEls, handKey, handTotal, HandScroller } from '../../stage/exp.js';
import { setClock } from '../../shared/clockcells.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 550);

// Something that slides in from the column's left edge and back out: the
// event logo and each player's hand. `set` returns when its move settles, so
// one slide can wait for another: the hands come in once the logo is out,
// the logo comes back once the hands are out. A move that is overtaken by
// the opposite one never settles, so nothing waiting on it fires late.
class Slider {
  constructor(el, prop, ms) {
    this.el = el;
    this.prop = prop;
    this.clock = new SeekClock(el, prop, ms);
    this.on = null;
  }

  now() {
    const v = parseFloat(this.el.style.getPropertyValue(this.prop));
    return Number.isFinite(v) ? v : (this.on ? 0 : 1);
  }

  set(show, first, wait = Promise.resolve()) {
    if (show === this.on) return Promise.resolve();
    this.on = show;
    if (first) {
      this.el.classList.toggle('gone', !show);
      this.clock.seek(show ? 1 : 0);
      return Promise.resolve();
    }
    if (show) {
      if (this.el.classList.contains('gone')) this.clock.seek(0);
      this.clock.stop();
      return wait.then(() => {
        if (!this.on) return new Promise(() => {});
        this.el.classList.remove('gone');
        return this.clock.play({ from: this.now(), to: 1 });
      });
    }
    return this.clock.play({ from: this.now(), to: 0 }).then(() => {
      if (!this.on) this.el.classList.add('gone');
    });
  }
}

const logoSlide = new Slider($('logoWell'), '--lg', 450);
const handSlide = { l: new Slider($('lhandBlock'), '--hs', 450), r: new Slider($('rhandBlock'), '--hs', 450) };
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
    const logoUp = renderLogo(state, bank, scene, round) && !handL && !handR;
    // The middle of the column holds one thing at a time: the outgoing
    // side slides out before the incoming side slides in.
    if (logoUp) {
      const out = Promise.all([handSlide.l.set(false, first), handSlide.r.set(false, first)]);
      logoSlide.set(true, first, out);
    } else {
      const out = logoSlide.set(false, first);
      handSlide.l.set(handL, first, out);
      handSlide.r.set(handR, first, out);
    }

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
