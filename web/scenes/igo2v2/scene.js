import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';

const $ = (id) => document.getElementById(id);
const igo = $('igo');
const inOut = new SeekClock(igo, '--t', 500);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);

let shown = null;
const heroShown = {};

// Same fallback chain as the 1v1: hero PNG, RR icon cutout, initial chip.
function loadHero(key, legendSlug, legendName) {
  const img = $(`hero-${key}`);
  const chip = $(`chip-${key}`);
  const slug = legendSlug || '';
  if (heroShown[key] === (slug || '(none)')) return;
  heroShown[key] = slug || '(none)';
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
      chip.textContent = (legendName || slug)[0].toUpperCase();
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

function renderTeam(prefix, side, seriesLength, animate) {
  setText($(`name-${prefix}1`), side.name || ' ');
  setText($(`name-${prefix}2`), side.name2 || ' ');
  setText($(`bf-${prefix}1`), side.battlefield || ' ');
  setText($(`bf-${prefix}2`), side.battlefield2 || ' ');
  setText($(prefix === 'g' ? 'gteam' : 'bteam'), side.teamName || ' ');
  renderTicks($(prefix === 'g' ? 'gticks' : 'bticks'), seriesLength, side.gameWins, animate);
  loadHero(`${prefix}1`, side.legendSlug, side.legend);
  loadHero(`${prefix}2`, side.legendSlug2, side.legend2);
}

const params = initStage({
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const igoState = bank.scenes.igo2v2;

    igo.classList.toggle('mode-webcam', igoState.mode === 'webcam');
    igo.classList.toggle('mode-legend', igoState.mode !== 'webcam');

    renderTeam('g', bank.match.left, bank.match.seriesLength, !first);
    renderTeam('b', bank.match.right, bank.match.seriesLength, !first);

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
