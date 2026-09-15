import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock } from '../../stage/seekclock.js';
import { chainLoad, clearArt, cardSteps } from '../../stage/art.js';
import { clockText, renderRunes, loadLegendDomains, legendDomains, applyVisibility } from '../../stage/exp.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

const BADGES = { reaction: 'Reaction', action: 'Action', unit: 'Unit', champion: 'Champion', gear: 'Gear', spell: 'Spell' };

// A hand is rebuilt only when its cards change, so a points click never
// restarts seven image loads. The key carries everything a card draws.
const handKey = (cards, unknown) => cards.map((c) => `${c.cardId}|${c.kind}|${c.played ? 1 : 0}`).join(';') + `#${unknown}`;
let fanKey = null;
let topKey = null;
let lastState = null;

function cardEl(c, small) {
  const fc = document.createElement('div');
  fc.className = `fc ${c.kind || ''}${c.played ? ' played' : ''}`.trim();
  const img = document.createElement('img');
  img.className = 'art hidden';
  img.alt = '';
  img.draggable = false;
  const steps = small ? [{ src: `/cardart/thumb/${c.cardId}.webp` }, ...cardSteps(c.cardId)] : cardSteps(c.cardId);
  if (steps.length) chainLoad(img, steps); else clearArt(img);
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = BADGES[c.kind] || '';
  fc.append(img, badge);
  return fc;
}

// Card width shrinks with the hand so twelve cards still fit between the
// two tags; the fan's rotation and lift come from each card's distance
// from the middle.
function renderFan(cards, unknown) {
  const key = handKey(cards, unknown);
  if (key === fanKey) return;
  fanKey = key;
  const fan = $('fan');
  if (!cards.length) {
    const empty = document.createElement('div');
    empty.className = 'fan-empty';
    empty.textContent = 'No cards entered';
    fan.replaceChildren(empty);
    return;
  }
  const n = cards.length;
  const cw = n <= 7 ? 190 : Math.max(120, Math.floor(1180 / n) + 30);
  fan.style.setProperty('--cw', String(cw));
  const mid = (n - 1) / 2;
  fan.replaceChildren(...cards.map((c, i) => {
    const el = cardEl(c, false);
    const d = i - mid;
    el.style.setProperty('--rot', (d * 4).toFixed(2));
    el.style.setProperty('--lift', (Math.abs(d) * Math.abs(d) * 2.2).toFixed(1));
    return el;
  }));
}

function renderTop(side, on) {
  const cards = side.hand || [];
  const unknown = Math.max(side.handUnknown || 0, (side.handCount || 0) - cards.length, 0);
  $('topfan').classList.toggle('hidden', !on);
  $('topLabel').classList.toggle('hidden', !on);
  const total = cards.length + unknown;
  setText($('topLabel'), on ? `${side.name || ''} · hand ${total}${cards.length ? ` · ${cards.length} known` : ''}` : '');
  const key = handKey(cards, unknown);
  if (key === topKey) return;
  topKey = key;
  const slots = cards.map((c) => cardEl(c, true));
  for (let i = 0; i < Math.min(unknown, 12); i += 1) {
    const u = document.createElement('div');
    u.className = 'fc unknown';
    slots.push(u);
  }
  $('topfan').replaceChildren(...slots);
}

let timerState = null;
setInterval(() => {
  if (!root.classList.contains('off')) setText($('clock'), clockText(timerState));
}, 250);

let shownVisible = null;

const params = initStage({
  scene: 'handfan',
  onState(state, first) {
    lastState = state;
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const scene = bank.scenes.handfan;
    const featured = scene.side === 'right' ? m.right : m.left;
    const other = scene.side === 'right' ? m.left : m.right;

    root.classList.toggle('showdown', Boolean(scene.showdown));

    setText($('name'), featured.name || ' ');
    setText($('country'), featured.country || '');
    setText($('legend'), featured.legend || '');
    renderRunes($('runes'), legendDomains(featured));
    const cards = featured.hand || [];
    const reactions = cards.filter((c) => c.kind === 'reaction' && !c.played).length;
    const total = Math.max(featured.handCount || 0, cards.length);
    setText($('count'), String(total));
    setText($('countLabel'), `cards in hand${reactions ? ` · ${reactions} reaction${reactions === 1 ? '' : 's'}` : ''}`);
    renderFan(cards, featured.handUnknown || 0);
    renderTop(other, Boolean(scene.opponent));

    setText($('round'), [bank.event.roundTitle, m.turn > 0 ? `Turn ${m.turn}` : ''].filter(Boolean).join(' · '));
    timerState = m.timer || timerState;
    setText($('clock'), clockText(timerState));

    const visible = params.force || scene.visible;
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

loadLegendDomains(() => {
  if (!lastState) return;
  const bank = sceneBank(lastState, params);
  const featured = bank.scenes.handfan.side === 'right' ? bank.match.right : bank.match.left;
  renderRunes($('runes'), legendDomains(featured));
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
