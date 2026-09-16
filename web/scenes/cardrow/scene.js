// Card row: one to four cards side by side, each over its name plate, for
// "here are the three cards that matter" moments. A highlighted slot grows
// and lifts while the others shrink and dim, driven by the focus cue so an
// operator can step through the row on air without a TAKE per card.
//
// Motion contract (SPEC): --t is the in/out seek clock on the row; each slot
// carries --big (its own highlight, 0 to 1) and --small (someone else is
// highlighted, 0 to 1), all written by wall-clock seek clocks. CSS only
// multiplies, and every read is var(--x, default) so a clock that never ran
// renders the settled row.
import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';

const $ = (id) => document.getElementById(id);
const row = $('row');
const inOut = new SeekClock(row, '--t', 700);

// Riftbound scans are 744x1039 portrait.
const CARD_RATIO = 744 / 1039;
// Base card width by how many are up: one card is a feature, four are a
// line-up. The row centres them with a fixed gap; a highlight scales in
// place (transform), so the neighbours never reflow under it.
const WIDTHS = { 1: 520, 2: 470, 3: 430, 4: 380 };
const FOCUS_MS = 450;

let shown = null;
let slots = [];        // { pos, card, el, big, small, bigV, smallV }
let rowKey = '';
let focusPos = null;

// Fallback chain (broadcast-line-handoff §3.7): full art, then the prefetched
// thumb, then a named placeholder panel. Never a broken img on program.
function loadArt(slot) {
  const { card, el } = slot;
  const box = el.querySelector('.card-box');
  const img = el.querySelector('img');
  const fallback = el.querySelector('.card-fallback');
  setText(el.querySelector('.fallback-name'), card.cardName || 'No card');
  let tier = 'full';
  img.onload = () => {
    img.classList.remove('hidden');
    // Battlefields are landscape cards stored portrait: rotate on evidence
    // from the loaded file, never a hardcoded per-card flag (SPEC).
    box.classList.toggle('bf', card.cardType === 'Battlefield' && img.naturalHeight > img.naturalWidth);
  };
  img.onerror = () => {
    if (tier === 'full') {
      tier = 'thumb';
      img.src = `/cardart/thumb/${card.cardId}.webp`;
    } else {
      img.classList.add('hidden');
      img.removeAttribute('src');
      fallback.classList.add('on');
    }
  };
  img.src = `/cardart/full/${card.cardId}.webp`;
}

function slotEl(card, width) {
  const el = document.createElement('div');
  el.className = 'slot';
  el.style.setProperty('--w', width);
  el.style.setProperty('--h', width / CARD_RATIO);
  el.innerHTML = `
    <div class="card-box">
      <img alt="" draggable="false" class="hidden">
      <div class="card-fallback"><span class="fallback-name"></span></div>
    </div>
    <div class="name-plate">
      <span class="card-name"></span>
      <span class="card-type"></span>
    </div>`;
  setText(el.querySelector('.card-name'), card.cardName || 'No card');
  setText(el.querySelector('.card-type'), card.cardType || '');
  return el;
}

// Rebuild the row for a new set of cards. Positions are the panel's slot
// numbers (1 to 4), kept on each slot so the focus cue, which names a
// position, still finds its card when an earlier slot is empty.
function build(cards) {
  const up = cards.map((card, pos) => ({ card, pos })).filter((s) => s.card.cardId);
  const width = WIDTHS[Math.min(4, Math.max(1, up.length))];
  slots = up.map(({ card, pos }) => {
    const el = slotEl(card, width);
    const slot = {
      pos, card, el,
      big: new SeekClock(el, '--big', FOCUS_MS), small: new SeekClock(el, '--small', FOCUS_MS),
      bigV: 0, smallV: 0,
    };
    loadArt(slot);
    return slot;
  });
  row.replaceChildren(...slots.map((s) => s.el));
  row.dataset.count = String(slots.length);
}

// Move every slot's two clocks to where the focus says they belong: played
// when the row is up, snapped when it is not (nothing to watch settle).
function applyFocus(pos, animate) {
  focusPos = pos;
  const focused = slots.find((s) => s.pos === pos) || null;
  for (const s of slots) {
    const big = focused && s === focused ? 1 : 0;
    const small = focused && s !== focused ? 1 : 0;
    if (big !== s.bigV) {
      if (animate) s.big.play({ from: s.bigV, to: big }); else { s.big.stop(); s.big.seek(big); }
      s.bigV = big;
    }
    if (small !== s.smallV) {
      if (animate) s.small.play({ from: s.smallV, to: small }); else { s.small.stop(); s.small.seek(small); }
      s.smallV = small;
    }
  }
}

const params = initStage({
  scene: 'cardrow',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const cfg = bank.scenes.cardrow;
    const cards = Array.isArray(cfg.cards) ? cfg.cards : [];
    const key = cards.map((c) => `${c.cardId}|${c.cardName}|${c.cardType}`).join(',');
    const hasCards = cards.some((c) => c.cardId);
    const visible = (params.force || Boolean(cfg.visible)) && hasCards;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);

    const rebuilt = key !== rowKey;
    if (rebuilt) {
      rowKey = key;
      build(cards);
      // A fresh row starts with its highlight where the state says, no
      // grow-in of the highlighted card on top of the entrance.
      applyFocus(Number.isInteger(cfg.focus) ? cfg.focus : -1, false);
    } else if (cfg.focus !== focusPos) {
      applyFocus(Number.isInteger(cfg.focus) ? cfg.focus : -1, Boolean(shown) && !first);
    }

    if (visible === shown && !rebuilt) return;
    shown = visible;
    if (first) {
      // Fresh loads (including OBS "shutdown when hidden" reloads) snap to
      // the current state, no entrance replay.
      row.classList.toggle('off', !visible);
      inOut.seek(visible ? 1 : 0);
    } else if (visible) {
      // Entrance, including a re-entrance when the cards on air change.
      row.classList.remove('off');
      inOut.play({ from: 0, to: 1 });
    } else {
      inOut.play({ from: 1, to: 0 }).then(() => {
        if (!shown) row.classList.add('off');
      });
    }
  },
});

// Nothing on air before the first state is normal; only surface a diagnostic
// if the server still has not answered after a few seconds.
setTimeout(() => {
  if (shown === null) $('diag').classList.add('on');
}, 4000);
