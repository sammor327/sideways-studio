import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, cardSteps, heroSteps } from '../../stage/art.js';
import { renderRunes, loadLegendDomains, legendDomains, applyVisibility } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 700);

const shown = { hero: {}, card: {} };

function loadHero(p, side) {
  const key = side.legendSlug || '';
  if (shown.hero[p] === key) return;
  shown.hero[p] = key;
  const img = $(`${p}hero`);
  const steps = heroSteps(side);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

// The two key cards: the legend card and the champion's card, from the side's
// own card ids (the spec: pulled from the assigned legend, never typed).
function loadCards(p, side) {
  const ids = [side.legendCardId || '', side.card && side.card.cardId ? side.card.cardId : ''];
  ids.forEach((id, i) => {
    const slot = `${p}${i}`;
    if (shown.card[slot] === id) return;
    shown.card[slot] = id;
    const img = $(`${p}card${i + 1}`);
    const steps = cardSteps(id);
    if (!steps.length) { clearArt(img); return; }
    chainLoad(img, steps);
  });
}

function renderMeta(el, side) {
  const bits = [];
  if (side.seed) bits.push(`<b>${side.seed} seed</b>`);
  if (side.record) bits.push(`Swiss ${side.record}`);
  if (side.seasonRecord) bits.push(`Season record ${side.seasonRecord}`);
  if (side.bestFinish) bits.push(`Best finish: ${side.bestFinish}`);
  const html = bits.join(' · ');
  if (el.dataset.html === html) return;
  el.dataset.html = html;
  el.innerHTML = html.replace(/<(?!\/?b>)/g, '&lt;');
}

function renderTags(el, side) {
  const tags = [side.pronouns, side.team].filter(Boolean);
  const key = tags.join('|');
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.replaceChildren(...tags.map((t) => Object.assign(document.createElement('span'), { className: 'k-chip ghost', textContent: t })));
}

function renderSide(p, side) {
  setText($(`${p}country`), side.country || '');
  setText($(`${p}name`), side.name || ' ');
  setText($(`${p}legend`), side.legend || '');
  renderRunes($(`${p}runes`), legendDomains(side));
  renderMeta($(`${p}meta`), side);
  renderTags($(`${p}tags`), side);
  loadHero(p, side);
  loadCards(p, side);
}

let lastState = null;
let shownVisible = null;

const params = initStage({
  scene: 'headtohead',
  onState(state, first) {
    lastState = state;
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.headtohead;

    renderSide('l', m.left);
    renderSide('r', m.right);
    setText($('roundLabel'), bank.event.roundTitle || bank.event.name || 'Feature match');
    setText($('bestOf'), `Best of ${m.seriesLength}`);
    const first_ = m.choseFirst;
    $('firstBox').classList.toggle('hidden', !first_);
    const who = first_ === 'left' ? m.left.name : m.right.name;
    const fb = $('firstText');
    const want = first_ ? `${first_}|${who}` : '';
    if (fb.dataset.want !== want) {
      fb.dataset.want = want;
      const arrow = Object.assign(document.createElement('span'), { className: 'arrow', textContent: first_ === 'left' ? '◀ ' : ' ▶' });
      const text = document.createTextNode(`${who || 'Player'} chose first`);
      fb.replaceChildren(...(first_ === 'left' ? [arrow, text] : [text, arrow]));
    }
    $('status').classList.toggle('hidden', !scene.status);
    setText($('statusText'), scene.status || '');

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

loadLegendDomains(() => {
  if (!lastState) return;
  const bank = sceneBank(lastState, params);
  renderRunes($('lrunes'), legendDomains(bank.match.left));
  renderRunes($('rrunes'), legendDomains(bank.match.right));
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
