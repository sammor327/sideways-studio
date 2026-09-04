import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';

const $ = (id) => document.getElementById(id);
const igo = $('igo');
const inOut = new SeekClock(igo, '--t', 500);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

let shown = null;
const heroShown = { g: null, b: null };

// Holder art fallback chain: hero PNG (261x242, exact fit), then the RR icon
// cutout centered on the dark fill, then a legend-initial chip. No legend
// assigned = clean dark fill, never a broken image.
function loadHero(prefix, side) {
  const img = $(`${prefix}hero`);
  const chip = $(`${prefix}chip`);
  const slug = side.legendSlug || '';
  const key = slug || '(none)';
  if (heroShown[prefix] === key) return;
  heroShown[prefix] = key;
  chip.classList.remove('on');
  img.classList.add('hidden');
  img.classList.remove('icon-tier');
  if (!slug) { img.removeAttribute('src'); return; }
  let tier = 'hero';
  img.onload = () => img.classList.remove('hidden');
  img.onerror = () => {
    if (tier === 'hero') {
      tier = 'icon';
      img.classList.add('icon-tier');
      img.src = `/legendart/icon/${slug}.webp`;
    } else {
      img.classList.add('hidden');
      img.removeAttribute('src');
      chip.textContent = (side.legend || slug)[0].toUpperCase();
      chip.classList.add('on');
    }
  };
  img.src = `/legendart/hero/${slug}.png`;
}

function renderTicks(el, seriesLength, gameWins, animate) {
  const slots = winsNeeded(seriesLength);
  el.classList.toggle('slots-3', slots === 3);
  if (el.children.length !== slots) {
    el.replaceChildren(...Array.from({ length: slots }, () => {
      const d = document.createElement('div');
      d.className = 'tick';
      return d;
    }));
  }
  [...el.children].forEach((tick, i) => {
    const won = i < gameWins;
    if (tick.classList.contains('won') !== won) {
      tick.classList.toggle('won', won);
      if (animate) bump(tick, '--bump');
    }
  });
}

const params = initStage({
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const igoState = bank.scenes.igo1v1;

    igo.classList.toggle('mode-webcam', igoState.mode === 'webcam');
    igo.classList.toggle('mode-legend', igoState.mode !== 'webcam');

    setText($('gname'), m.left.name || ' ');
    setText($('gbf'), m.left.battlefield || ' ');
    renderTicks($('gticks'), m.seriesLength, m.left.gameWins, !first);
    loadHero('g', m.left);

    setText($('bname'), m.right.name || ' ');
    setText($('bbf'), m.right.battlefield || ' ');
    renderTicks($('bticks'), m.seriesLength, m.right.gameWins, !first);
    loadHero('b', m.right);

    // Event logo inside the center panel; the panel itself stays either way.
    const logo = state.theme.logo || '';
    const custom = $('logoCustom');
    if (custom.getAttribute('src') !== logo) {
      if (logo) custom.src = logo;
      else custom.removeAttribute('src');
    }

    const visible = igoState.visible;
    $('hiddenHint').classList.toggle('on',
      !params.transparent && !params.preview && !visible);
    if (visible === shown) return;
    shown = visible;
    if (first) {
      igo.classList.toggle('off', !visible);
      inOut.seek(visible ? 1 : 0);
    } else if (visible) {
      igo.classList.remove('off');
      inOut.play({ from: 0, to: 1 });
    } else {
      inOut.play({ from: 1, to: 0 }).then(() => {
        if (!shown) igo.classList.add('off');
      });
    }
  },
});

setTimeout(() => {
  if (shown === null) $('diag').classList.add('on');
}, 4000);
