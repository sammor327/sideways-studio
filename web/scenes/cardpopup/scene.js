import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';

const $ = (id) => document.getElementById(id);
const popup = $('popup');
const inOut = new SeekClock(popup, '--t', 700);

// URL owns presentation: ?side=left mirrors the popup.
if (new URLSearchParams(location.search).get('side') === 'left') {
  document.querySelector('.stage').classList.add('side-left');
}

let shown = null;
let currentId = null;

// Fallback chain (broadcast-line-handoff §3.7): full art, then the prefetched
// thumb, then a named placeholder panel. Never a broken img on program.
function loadArt(card) {
  const img = $('cardArt');
  const fallback = $('cardFallback');
  setText($('fallbackName'), card.cardName || 'No card');
  fallback.classList.remove('on');
  img.classList.add('hidden');
  popup.classList.remove('bf');
  if (!card.cardId) {
    img.removeAttribute('src');
    fallback.classList.add('on');
    return;
  }
  let tier = 'full';
  img.onload = () => {
    img.classList.remove('hidden');
    // Battlefields are landscape cards stored portrait: rotate on evidence
    // from the loaded file, never a hardcoded per-card flag (SPEC).
    popup.classList.toggle('bf',
      card.cardType === 'Battlefield' && img.naturalHeight > img.naturalWidth);
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

function renderCard(card) {
  setText($('cardName'), card.cardName || 'No card staged');
  setText($('cardType'), card.cardType || '');
  if (card.cardId !== currentId) {
    currentId = card.cardId;
    loadArt(card);
  }
}

const params = initStage({
  scene: 'cardpopup',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const cp = bank.scenes.cardpopup;
    const card = cp.card;
    // The dual-column overlay docks this same card bottom right while it is
    // on with its card slot enabled, and the portrait pillars dock it in the
    // right pillar, so the popup stands down rather than airing the card
    // twice.
    const dual = bank.scenes.igodual;
    const pillars = bank.scenes.igoportrait;
    const docked = Boolean((dual && dual.visible && dual.cardSlot) || (pillars && pillars.visible && pillars.cardWell));
    const visible = params.force || (cp.visible && !docked);
    $('hiddenHint').classList.toggle('on',
      !params.transparent && !params.preview && !visible);

    const cardChanged = card.cardId !== currentId;
    renderCard(card);

    if (visible === shown && !cardChanged) return;
    shown = visible;
    if (first) {
      // Fresh loads (including OBS "shutdown when hidden" reloads) snap to
      // the current state, no entrance replay.
      popup.classList.toggle('off', !visible);
      inOut.seek(visible ? 1 : 0);
    } else if (visible) {
      // Entrance, including a re-fly-in when SHOW commits a new card.
      popup.classList.remove('off');
      inOut.play({ from: 0, to: 1 });
    } else {
      inOut.play({ from: 1, to: 0 }).then(() => {
        if (!shown) popup.classList.add('off');
      });
    }
  },
});

// Nothing on air before the first state is normal; only surface a diagnostic
// if the server still has not answered after a few seconds.
setTimeout(() => {
  if (shown === null) $('diag').classList.add('on');
}, 4000);
