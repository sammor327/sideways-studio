import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, bump } from '../../stage/seekclock.js';
import { chainLoad, clearArt, cardSteps, heroSteps, battlefieldSteps, rotateIfPortrait } from '../../stage/art.js';
import { applyVisibility } from '../../stage/exp.js';
import { rowsShowsShowdown } from '../../shared/showdowndock.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const inOut = new SeekClock(root, '--t', 600);

const shown = { chain: null, bchain: null, bf: null, hero: {}, hand: {} };

// The chain as card tiles in play order, the newest lifted and tagged.
// Rebuilt only when the chain changes, so priority flips never reload art.
function chainKey(chain) {
  return chain.map((c) => `${c.cardId}|${c.side}|${c.action || ''}|${c.resolved ? 1 : 0}`).join(';');
}
// A live feed's stack also carries what the defender did once focus passed
// (drew, discarded, moved...); only a card still on the chain resolves.
const ACTION_LABEL = {
  drew: 'Drew', discarded: 'Discarded', moved: 'Moved', trashed: 'Trashed', returned: 'To hand',
  banished: 'Banished', created: 'Created', milled: 'Milled', shuffled: 'To deck',
};
const stillOnChain = (c) => !c.resolved && (!c.action || c.action === 'played');
function cardTile(entry, i, last, big) {
  const cc = document.createElement('div');
  // A live feed keeps the cards that already resolved, dimmed (2026-09-19);
  // a card that was drawn, discarded or moved rather than played carries
  // that in the tag over it, so its name stays whole.
  const act = Boolean(entry.action) && entry.action !== 'played';
  cc.className = `cc ${entry.side}${i === last ? ' next' : ''}${entry.resolved ? ' resolved' : ''}${act ? ' act' : ''}`;
  const img = document.createElement('img');
  img.className = 'art hidden';
  img.alt = '';
  img.draggable = false;
  const steps = big ? cardSteps(entry.cardId) : [{ src: `/cardart/thumb/${entry.cardId}.webp` }, ...cardSteps(entry.cardId)];
  if (steps.length) chainLoad(img, steps); else clearArt(img);
  cc.append(
    img,
    Object.assign(document.createElement('span'), { className: 'tag', textContent: act ? ACTION_LABEL[entry.action] || entry.action : 'Resolves first' }),
    Object.assign(document.createElement('span'), { className: 'n', textContent: String(i + 1) }),
    Object.assign(document.createElement('span'), { className: 'nm', textContent: big ? `${entry.side === 'left' ? 'P1' : 'P2'} · ${entry.cardName || ''}` : (entry.cardName || '') }),
  );
  return cc;
}
function renderChain(el, chain, big, slot, animate) {
  const key = chainKey(chain);
  if (shown[slot] === key) return;
  const grew = shown[slot] !== null && chain.length > (shown[slot] ? shown[slot].split(';').length : 0);
  shown[slot] = key;
  if (!chain.length) {
    el.replaceChildren(Object.assign(document.createElement('span'), { className: 'chain-empty', textContent: 'Nothing on the chain yet' }));
    return;
  }
  // Lifted and tagged: the newest card still on the chain, which resolves first.
  const last = chain.findLastIndex(stillOnChain);
  const nodes = [];
  chain.forEach((entry, i) => {
    if (i > 0) {
      const a = document.createElement('div');
      a.className = 'arrow';
      if (big) a.append(Object.assign(document.createElement('small'), { textContent: 'then' }));
      a.append(document.createTextNode('→'));
      nodes.push(a);
    }
    nodes.push(cardTile(entry, i, last, big));
  });
  el.replaceChildren(...nodes);
  if (grew && animate) bump(nodes[nodes.length - 1], '--bump');
}

// The takeover band's small hands: known cards as thumbs, played ones
// greyed, unknown ones dashed.
function renderHand(p, side) {
  const cards = side.hand || [];
  const unknown = Math.max((side.handCount || 0) - cards.length, 0);
  const key = cards.map((c) => `${c.cardId}|${c.kind}|${c.played ? 1 : 0}`).join(';') + `#${unknown}`;
  const reactions = cards.filter((c) => c.kind === 'reaction' && !c.played).length;
  setText($(`${p}handLabel`), `${cards.length + unknown} in hand${reactions ? ` · ${reactions} reaction${reactions === 1 ? '' : 's'} left` : ''}`);
  if (shown.hand[p] === key) return;
  shown.hand[p] = key;
  const nodes = cards.map((c) => {
    const th = document.createElement('div');
    th.className = `th ${c.kind || ''}${c.played ? ' played' : ''}`.trim();
    const img = document.createElement('img');
    img.className = 'art hidden';
    img.alt = '';
    img.draggable = false;
    chainLoad(img, [{ src: `/cardart/thumb/${c.cardId}.webp` }]);
    th.append(img);
    return th;
  });
  for (let i = 0; i < Math.min(unknown, 20 - cards.length); i += 1) nodes.push(Object.assign(document.createElement('div'), { className: 'th unknown' }));
  // Past fourteen (two rows) the thumbs step down a size so a hand of
  // twenty still takes about two rows' height over the camera.
  $(`${p}hand`).classList.toggle('many', nodes.length > 14);
  $(`${p}hand`).replaceChildren(...nodes);
}

function loadHero(p, side) {
  const key = side.legendSlug || '';
  if (shown.hero[p] === key) return;
  shown.hero[p] = key;
  const img = $(`${p}hero`);
  const steps = heroSteps(side);
  if (!steps.length) { clearArt(img); return; }
  chainLoad(img, steps);
}

function loadBattlefield(id) {
  if (shown.bf === id) return;
  shown.bf = id;
  const img = $('bBfImg');
  if (!id) { clearArt(img); return; }
  chainLoad(img, battlefieldSteps(id), rotateIfPortrait);
}

// Which in-game overlay is on decides where the strip docks.
function dockFor(bank) {
  const sc = bank.scenes;
  if (sc.igodual && sc.igodual.visible) return 'dual';
  if (sc.igoportrait && sc.igoportrait.visible) return 'portrait';
  if (sc.igorows && sc.igorows.visible) return 'rows';
  return 'none';
}

let shownVisible = null;

const params = initStage({
  scene: 'showdown',
  onState(state, first) {
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const m = bank.match;
    const sd = m.showdown || { active: false, chain: [], priority: '', battlefield: '' };
    const scene = bank.scenes.showdown;
    const animate = !first;
    const chain = sd.chain || [];

    root.className = `showdown${root.classList.contains('off') ? ' off' : ''} mode-${scene.mode || 'strip'} dock-${dockFor(bank)}`
      + ` prio-${sd.priority || 'none'}${sd.priority ? '' : ' no-priority'}${scene.hands ? '' : ' no-hands'}`;

    const bfName = sd.battlefield || (sd.active ? 'Showdown' : '');
    const who = sd.priority ? m[sd.priority] : null;
    const live = chain.filter(stillOnChain).length;
    const count = live === chain.length ? `${chain.length} on the chain` : `${live} on the chain · ${chain.length} cards`;

    // Strip.
    setText($('sBf'), bfName);
    setText($('sCount'), count);
    setText($('sPrio'), who ? (who.name || '') : '');
    setText($('sPrioChip'), who ? (who.country || '') : '');
    renderChain($('sChain'), chain, false, 'chain', animate);

    // Takeover band.
    setText($('bTitle'), sd.battlefield ? `Showdown at ${sd.battlefield}` : 'Showdown');
    setText($('bSub'), [count, who ? `${who.name} to respond` : ''].filter(Boolean).join(' · '));
    loadBattlefield(sd.battlefieldCardId || '');
    renderChain($('bChain'), chain, true, 'bchain', animate);
    for (const [p, side] of [['l', m.left], ['r', m.right]]) {
      setText($(`${p}name`), side.name || ' ');
      setText($(`${p}country`), side.country || '');
      loadHero(p, side);
      renderHand(p, side);
    }

    // The scene shows only while a showdown is open (and not in the rows
    // overlay's column): switching it on with
    // nothing open airs nothing, never an empty strip.
    // While the rows overlay shows it in its column this graphic stands
    // down, so the showdown never airs twice.
    const visible = params.force || (scene.visible && sd.active && !rowsShowsShowdown(bank));
    $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
    shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first });
  },
});

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
