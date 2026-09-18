import { initStage, sceneBank, setText } from '../../stage/stage.js';
import { SeekClock, animEnabled } from '../../stage/seekclock.js';
import { applyVisibility, fitText } from '../../stage/exp.js';
import { resolveLook, lookVars } from '../../shared/look.js';
import { sponsorDock, sponsorSlot, sponsorWindowOpen } from '../../shared/sponsor.js';

const $ = (id) => document.getElementById(id);
const root = $('root');
const plate = $('plate');
const inOut = new SeekClock(root, '--t', 500);

let params = null;
let lastState = null;
let shownVisible = null;
let shownKey = '';
let lookKey = '';

// The plate wears the look of the overlay it docks into, unless the sponsor
// plate has its own look switched on under Look.
function applyHostLook(theme, host) {
  const own = theme && theme.scenes && theme.scenes.sponsor && theme.scenes.sponsor.enabled;
  const vars = lookVars(resolveLook(theme, own || !host ? 'sponsor' : host));
  const key = JSON.stringify(vars);
  if (key === lookKey) return;
  lookKey = key;
  for (const [name, value] of Object.entries(vars)) plate.style.setProperty(name, value);
}

// A sponsor without art is its name, shrunk to fit the plate it is on.
let nameRun = 300;
function nameEl(name) {
  const el = Object.assign(document.createElement('span'), { className: 'nm' });
  el.dataset.name = name;
  return el;
}
function fitNames() {
  for (const el of $('slides').querySelectorAll('.nm')) fitText(el, el.dataset.name, { size: 30, min: 14, run: nameRun });
}

function renderSlides(items, width) {
  nameRun = width - 28;
  const key = JSON.stringify([width, items.map((s) => [s.name, s.image])]);
  if (key === shownKey) return;
  shownKey = key;
  $('slides').replaceChildren(...items.map((s) => {
    const slide = document.createElement('div');
    slide.className = 'slide';
    if (s.image) {
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      // Art that will not load falls back to the sponsor's name.
      img.onerror = () => { img.remove(); slide.append(nameEl(s.name)); fitNames(); };
      img.src = s.image;
      slide.append(img);
    } else {
      slide.append(nameEl(s.name));
    }
    return slide;
  }));
  fitNames();
}

// Wall-clock driven: which sponsor is up, the cross-fade, and the on-air
// window. A timer rather than rAF, so an occluded source keeps time.
function tick() {
  if (!lastState) return;
  const cfg = sceneBank(lastState, params).scenes.sponsor;
  const items = cfg.items || [];
  const now = Date.now();
  const slot = sponsorSlot(items.length, cfg.interval, now);
  const fade = animEnabled() ? slot.fade : 1;
  [...$('slides').children].forEach((el, i) => {
    let a = 0;
    if (i === slot.index) a = fade;
    else if (i === slot.previous && fade < 1) a = 1 - fade;
    el.style.setProperty('--a', String(a));
  });
  const visible = params.force || (cfg.visible && items.length > 0 && sponsorWindowOpen(cfg.every, cfg.duration, now));
  $('hiddenHint').classList.toggle('on', !params.transparent && !params.preview && !visible);
  shownVisible = applyVisibility({ root, clock: inOut, visible, shown: shownVisible, first: shownVisible === null });
}

params = initStage({
  scene: 'sponsor',
  onState(state) {
    lastState = state;
    $('diag').classList.remove('on');
    const bank = sceneBank(state, params);
    const cfg = bank.scenes.sponsor;
    const dock = sponsorDock(bank);
    for (const k of ['x', 'y', 'w', 'h', 'radius']) plate.style.setProperty(`--${k}`, String(dock[k]));
    // The tag goes on the side of the plate nearest the frame centre.
    const above = dock.y + dock.h / 2 > 540;
    plate.classList.toggle('tag-above', above);
    plate.classList.toggle('tag-below', !above);
    applyHostLook(state.theme, dock.host);
    setText($('tag'), cfg.label || '');
    renderSlides(cfg.items || [], dock.w);
    tick();
  },
});

setInterval(tick, 50);
// A name fitted before the display face arrived is refitted once it has.
document.fonts.addEventListener('loadingdone', fitNames);

setTimeout(() => {
  if (shownVisible === null) $('diag').classList.add('on');
}, 4000);
