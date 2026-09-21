// Legend framer: place every legend's full-figure cutout on every graphic that
// draws it, then lock the table in.
//
// One window per graphic, drawn at its real 1920x1080 with the legend slots
// live and everything that sits over or beside them outlined in place, so what
// is framed here is what airs. Every window is built from
// web/shared/legendframe.js: a slot on another graphic is an entry there, not
// markup here.
//
// The point of the tool is still speed. 49 legends times three slots only gets
// done if a legend takes seconds, so the slots share one frame until they are
// unlinked, direct manipulation does the placing, and Ctrl with the arrow keys
// walks the rail without leaving the art.
import {
  GRAPHICS, GRAPHIC_KEYS, OFFSET_MAX, PLACEMENTS, PLACEMENT_KEYS, SCALE_MAX, SCALE_MIN,
  applyFrame, autoScale, cleanFrame, cleanFrames, frameFor, placementsOf,
} from '../shared/legendframe.js';

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'sidewaysStudio.legendFrames.draft';
const FRAME_W = 1920;
const FRAME_H = 1080;

let legends = [];       // every legend that has a full cutout
let frames = {};        // the working table
let saved = {};         // what the server holds, for the dirty mark
let canBake = false;    // a source build, which can write the table into the repo
let current = null;     // the selected slug
let graphic = GRAPHIC_KEYS[0];
let slot = PLACEMENT_KEYS[0]; // which slot the controls edit
let linked = true;
const natural = new Map();    // slug -> { w, h }
const slotEls = new Map();    // placement -> { slot, art, img }

const key = (o) => JSON.stringify(o);
const dirty = () => key(frames) !== key(saved);
const entryDirty = (slug) => key(frames[slug] || null) !== key(saved[slug] || null);

// --- the frame behind a slot ------------------------------------------------

// The cutout's own size, which the untuned scale is worked out from. A decoded
// image knows it whether or not its load event has been seen yet, so this asks
// the elements as well as the map: a frame seeded before the event arrived
// would be seeded from the wrong scale, and nothing afterwards would say so.
const srcSlug = (img) => {
  if (!img.src) return null;
  return decodeURIComponent(new URL(img.src).pathname.split('/').pop()).replace(/\.webp$/, '');
};

function naturalOf(slug) {
  const known = natural.get(slug);
  if (known) return known;
  for (const [, els] of slotEls) {
    if (els.img.naturalWidth && srcSlug(els.img) === slug) {
      const size = { w: els.img.naturalWidth, h: els.img.naturalHeight };
      natural.set(slug, size);
      return size;
    }
  }
  return null;
}

// What a slot is showing: the legend's tuned frame, or the same autoscale the
// scene would fall back to.
function effective(slug, placement) {
  const tuned = frameFor(frames, slug, placement);
  if (tuned) return tuned;
  const nat = naturalOf(slug);
  const p = PLACEMENTS[placement];
  return { scale: nat ? autoScale(nat.w, nat.h, p.w, p.h) : 1, x: 0, y: 0 };
}

const isFramed = (slug) => Boolean(frames[slug]);

function ensureEntry(slug, seed) {
  if (!frames[slug]) frames[slug] = { base: effective(slug, seed) };
  return frames[slug];
}

// Move a slot. Linked, the change becomes the frame every slot uses; unlinked,
// only this slot's own override moves.
function setFrame(slug, placement, patch) {
  const entry = ensureEntry(slug, placement);
  if (linked) {
    entry.base = cleanFrame({ ...effective(slug, placement), ...patch });
    delete entry.per;
  } else {
    const from = entry.per && entry.per[placement] ? entry.per[placement] : entry.base;
    entry.per = { ...(entry.per || {}), [placement]: cleanFrame({ ...from, ...patch }) };
  }
  saveDraft();
  render();
}

function resetFrame(slug) {
  delete frames[slug];
  saveDraft();
  render();
}

// --- data -------------------------------------------------------------------

async function load() {
  const [legendRes, frameRes] = await Promise.all([
    fetch('/api/legends').then((r) => r.json()),
    fetch('/api/legendframes').then((r) => r.json()),
  ]);
  legends = (legendRes.legends || []).filter((l) => l.fullFile);
  saved = cleanFrames(frameRes.frames);
  canBake = Boolean(frameRes.canBake);
  frames = readDraft() || structuredClone(saved);

  $('statusDot').classList.add('ok');
  $('statusText').textContent = `${legends.length} legends with full art`;
  setSaveNote();

  buildTabs();
  buildStage();
  renderList();
  select(legends.length ? legends[0].slug : null);
}

function setSaveNote(extra) {
  $('saveNote').textContent = extra || (canBake
    ? 'Lock in saves the framing for this copy and bakes it into web/shared/legendframe.js so it can be committed and shipped.'
    : 'Lock in saves the framing into this app’s data folder and every graphic picks it up the next time its browser source loads. It survives updates.');
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(frames));
  } catch { /* private window, or full: the session just stops surviving reloads */ }
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? cleanFrames(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// --- the rail ---------------------------------------------------------------

function renderList() {
  const filter = $('filter').value.trim().toLowerCase();
  const rows = legends.filter((l) => !filter || l.name.toLowerCase().includes(filter));
  $('legendList').replaceChildren(...rows.map((l) => {
    const li = document.createElement('li');
    li.dataset.slug = l.slug;
    li.setAttribute('role', 'option');
    li.classList.toggle('on', l.slug === current);
    li.classList.toggle('framed', isFramed(l.slug));
    li.classList.toggle('dirty', entryDirty(l.slug));
    li.setAttribute('aria-selected', String(l.slug === current));
    li.append(
      Object.assign(document.createElement('span'), { className: 'dot' }),
      Object.assign(document.createElement('span'), { className: 'nm', textContent: l.name }),
    );
    li.onclick = () => select(l.slug);
    return li;
  }));
  const framed = legends.filter((l) => isFramed(l.slug)).length;
  $('railCount').textContent = `${framed} of ${legends.length} framed${dirty() ? ' · not locked in' : ''}`;
}

const visibleSlugs = () => [...$('legendList').children].map((li) => li.dataset.slug);

function step(delta) {
  const list = visibleSlugs();
  if (!list.length) return;
  const at = list.indexOf(current);
  select(list[Math.min(list.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta))]);
}

function select(slug) {
  current = slug;
  const legend = legends.find((l) => l.slug === slug);
  $('nowName').textContent = legend ? legend.name : 'No legend has full art yet';
  for (const [, els] of slotEls) {
    if (!legend) { els.img.classList.add('hidden'); els.img.removeAttribute('src'); continue; }
    els.img.classList.remove('hidden');
    els.img.src = `/legendart/full/${slug}.webp`;
  }
  renderList();
  render();
  const row = $('legendList').querySelector('li.on');
  if (row) row.scrollIntoView({ block: 'nearest' });
}

// --- the graphic window -----------------------------------------------------

function buildTabs() {
  $('graphicTabs').replaceChildren(...GRAPHIC_KEYS.map((g) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.textContent = GRAPHICS[g].label;
    b.classList.toggle('on', g === graphic);
    b.onclick = () => {
      graphic = g;
      if (PLACEMENTS[slot].graphic !== g) slot = placementsOf(g)[0];
      buildTabs();
      buildStage();
      render();
      fitStage();
    };
    return b;
  }));
}

// The whole frame, from the model: this graphic's legend slots, the fades over
// them, and its furniture on top.
function buildStage() {
  slotEls.clear();
  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.id = 'frame';

  for (const placement of placementsOf(graphic)) {
    const p = PLACEMENTS[placement];
    const el = document.createElement('div');
    el.className = 'slot';
    el.dataset.placement = placement;
    el.tabIndex = 0;
    Object.assign(el.style, {
      left: `${p.frameX}px`, top: `${p.frameY}px`, width: `${p.w}px`, height: `${p.h}px`,
    });
    const art = document.createElement('div');
    art.className = 'art';
    const img = document.createElement('img');
    img.alt = '';
    art.append(img);
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.style.background = p.scrim;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = p.short;
    el.append(art, scrim, tag);
    frame.append(el);
    slotEls.set(placement, { slot: el, art, img });
    wireSlot(placement, el);
    img.addEventListener('load', onArtLoad);
  }

  for (const f of GRAPHICS[graphic].furniture) {
    const el = document.createElement('div');
    el.className = `furn ${f.kind}`;
    Object.assign(el.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
    el.append(Object.assign(document.createElement('span'), { className: 'lab', textContent: f.label }));
    frame.append(el);
  }

  frame.append(Object.assign(document.createElement('div'), { className: 'guides' }));

  const fit = document.createElement('div');
  fit.className = 'fit';
  fit.id = 'fit';
  fit.append(frame);
  $('stageWrap').replaceChildren(fit);
  $('graphicNote').textContent = GRAPHICS[graphic].note;

  if (current) for (const [, els] of slotEls) els.img.src = `/legendart/full/${current}.webp`;
  renderKey();
  renderSlotPick();
}

// A cutout's size decides the untuned scale, so the window re-renders once it
// is known. The size is recorded against the legend the file is OF, not
// whichever is selected when it lands: walking the rail leaves loads in flight,
// and one finishing late must not hand its measurements to its successor.
function onArtLoad(e) {
  const img = e.currentTarget;
  const slug = srcSlug(img);
  if (!slug || !img.naturalWidth) return;
  natural.set(slug, { w: img.naturalWidth, h: img.naturalHeight });
  if (slug === current) render();
}

function render() {
  for (const [placement, els] of slotEls) {
    applyFrame(els.img, current ? effective(current, placement) : null);
    els.slot.classList.toggle('on', placement === slot);
  }
  const frame = $('frame');
  if (frame) {
    frame.classList.toggle('guides-on', $('guides').checked);
    frame.classList.toggle('no-furniture', !$('furniture').checked);
    frame.classList.toggle('no-scrims', !$('scrims').checked);
  }
  renderControls();
  renderList();
}

// Scale the frame to the room it has. Every term is floored: the drag maths
// divides by this scale, so a window too small to measure (or a first call
// before the page is laid out) must still leave a frame that can be dragged
// rather than one turned inside out by a negative one.
function fitStage() {
  const wrap = $('stageWrap');
  const fit = $('fit');
  if (!wrap || !fit) return;
  const k = Math.max(0.05, Math.min(
    Math.max(160, wrap.clientHeight) / FRAME_H,
    Math.max(320, wrap.clientWidth) / FRAME_W,
  ));
  fit.firstElementChild.style.setProperty('--k', String(k));
  fit.style.width = `${Math.round(FRAME_W * k)}px`;
  fit.style.height = `${Math.round(FRAME_H * k)}px`;
}

const scaleOf = () => Number($('frame').style.getPropertyValue('--k')) || 1;

// Drag, wheel and keys on one slot. The frame is drawn at --k and the offsets
// are percentages of the SLOT, so a pointer move converts once: screen px ->
// design px -> percent of that slot.
function wireSlot(placement, el) {
  const p = PLACEMENTS[placement];
  let drag = null;

  const pick = () => { slot = placement; renderSlotPick(); render(); };

  el.addEventListener('pointerdown', (e) => {
    pick();
    // Nothing to drag, and nothing to seed a frame from, until the cutout has
    // decoded: its size is what an untuned scale is worked out from.
    if (!current || e.button !== 0 || !naturalOf(current)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: effective(current, placement) };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    el.focus();
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const k = scaleOf();
    setFrame(current, placement, {
      x: drag.start.x + ((e.clientX - drag.x) / k / p.w) * 100,
      y: drag.start.y + ((e.clientY - drag.y) / k / p.h) * 100,
    });
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag = null;
    el.classList.remove('dragging');
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  el.addEventListener('wheel', (e) => {
    if (!current) return;
    e.preventDefault();
    pick();
    setFrame(current, placement, {
      scale: effective(current, placement).scale * (1 - Math.sign(e.deltaY) * 0.03),
    });
  }, { passive: false });

  el.addEventListener('dblclick', () => { if (current) resetFrame(current); });

  el.addEventListener('keydown', (e) => {
    if (!current || e.ctrlKey || e.metaKey) return;
    const cur = effective(current, placement);
    const by = e.shiftKey ? 2 : 0.5;
    const nudge = {
      ArrowLeft: { x: cur.x - by },
      ArrowRight: { x: cur.x + by },
      ArrowUp: { y: cur.y - by },
      ArrowDown: { y: cur.y + by },
      '[': { scale: cur.scale - 0.02 },
      ']': { scale: cur.scale + 0.02 },
    }[e.key];
    if (nudge) { e.preventDefault(); pick(); setFrame(current, placement, nudge); return; }
    if (e.key === '0') { e.preventDefault(); resetFrame(current); }
  });
}

// --- the controls -----------------------------------------------------------

const CTLS = [
  { k: 'scale', label: 'Size', min: SCALE_MIN, max: SCALE_MAX, step: 0.01 },
  { k: 'x', label: 'X', min: -OFFSET_MAX, max: OFFSET_MAX, step: 0.5 },
  { k: 'y', label: 'Y', min: -OFFSET_MAX, max: OFFSET_MAX, step: 0.5 },
];

function renderSlotPick() {
  const sel = $('slotPick');
  sel.replaceChildren(...PLACEMENT_KEYS.map((p) => Object.assign(document.createElement('option'), {
    value: p, textContent: PLACEMENTS[p].label, selected: p === slot,
  })));
  $('slotWhere').textContent = PLACEMENTS[slot].where;
}

function renderControls() {
  const box = document.createElement('div');
  box.className = 'frame-set';
  const frame = current ? effective(current, slot) : { scale: 1, x: 0, y: 0 };
  for (const ctl of CTLS) {
    const row = document.createElement('div');
    row.className = 'ctl';
    const label = Object.assign(document.createElement('label'), { textContent: ctl.label });
    const range = Object.assign(document.createElement('input'), {
      type: 'range', min: ctl.min, max: ctl.max, step: ctl.step, value: frame[ctl.k], disabled: !current,
    });
    const num = Object.assign(document.createElement('input'), {
      type: 'number', min: ctl.min, max: ctl.max, step: ctl.step, value: frame[ctl.k], disabled: !current,
    });
    label.htmlFor = range.id = `ctl-${ctl.k}`;
    const write = (v) => setFrame(current, slot, { [ctl.k]: Number(v) });
    range.oninput = () => write(range.value);
    num.onchange = () => write(num.value);
    row.append(label, range, num);
    box.append(row);
  }
  $('frameSets').replaceChildren(box);

  const framed = current && isFramed(current);
  $('frameSource').textContent = !current ? ''
    : (framed
      ? (linked ? 'Framed by hand, one frame for every slot.' : 'Framed by hand, each slot on its own.')
      : 'Not framed yet: every slot is standing this legend full height on its own, the scenes’ fallback.');
  $('autoBtn').disabled = !framed;
  $('copyBtn').disabled = !current || !previousFramed();
  $('saveBtn').textContent = dirty() ? 'Lock in' : 'Locked in';
  $('saveBtn').disabled = !dirty();
}

// What the boxes and the fades on this graphic mean. Built from the model, so
// a new graphic explains itself.
function renderKey() {
  const items = [
    { kind: 'slot', label: 'Legend slot', note: 'Where this legend’s full art is drawn. Drag inside it to place the figure; the blue rim is the slot being edited.' },
    ...GRAPHICS[graphic].furniture.map((f) => ({ kind: f.kind, label: f.label, note: f.note })),
    ...placementsOf(graphic).map((p) => ({
      kind: 'fade', label: `Fades over ${PLACEMENTS[p].short.toLowerCase()}`, note: PLACEMENTS[p].scrimNote,
    })),
  ];
  $('keyList').replaceChildren(...items.map((it) => {
    const row = document.createElement('div');
    row.className = 'key-item';
    row.append(
      Object.assign(document.createElement('span'), { className: `key-swatch ${it.kind}` }),
      Object.assign(document.createElement('span'), { innerHTML: '' }),
    );
    const text = row.lastElementChild;
    text.append(
      Object.assign(document.createElement('b'), { textContent: it.label }),
      document.createTextNode(it.note),
    );
    return row;
  }));
}

// The legend above this one in the rail that has a frame to copy: framing a run
// of legends with the same pose is then one click each.
function previousFramed() {
  const list = visibleSlugs();
  for (let i = list.indexOf(current) - 1; i >= 0; i -= 1) {
    if (frames[list[i]]) return list[i];
  }
  return null;
}

// --- locking in -------------------------------------------------------------

async function lockIn() {
  $('saveBtn').disabled = true;
  try {
    const res = await fetch('/api/legendframes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ frames }),
    });
    const out = await res.json();
    if (!out.ok) {
      setSaveNote(`Not locked in: ${out.reason || out.error || 'the server refused it'}.`);
      renderControls();
      return;
    }
    saved = cleanFrames(out.frames);
    frames = structuredClone(saved);
    saveDraft();
    const n = Object.keys(saved).length;
    setSaveNote(out.baked
      ? `Locked in: ${n} legends saved and baked into web/shared/legendframe.js, ready to commit.`
      : `Locked in: ${n} legends saved. Reload each graphic’s browser source to see it, or restart the app.`);
  } catch (err) {
    setSaveNote(`Not locked in: ${err.message}.`);
  }
  render();
}

// --- wiring -----------------------------------------------------------------

$('filter').oninput = renderList;
$('guides').onchange = render;
$('furniture').onchange = render;
$('scrims').onchange = render;
$('slotPick').onchange = () => { slot = $('slotPick').value; graphicFor(slot); render(); };

// Picking a slot on another graphic turns to that graphic, so the controls and
// the window can never be showing different things.
function graphicFor(placement) {
  const g = PLACEMENTS[placement].graphic;
  if (g === graphic) { renderSlotPick(); return; }
  graphic = g;
  buildTabs();
  buildStage();
  fitStage();
}

// Unlinking hands every slot the frame it is already showing, so nothing moves
// at the moment the switch flips; relinking keeps the base.
$('link').onchange = () => {
  linked = $('link').checked;
  if (current && frames[current]) {
    const entry = frames[current];
    if (!linked) entry.per = Object.fromEntries(PLACEMENT_KEYS.map((p) => [p, effective(current, p)]));
    else delete entry.per;
    saveDraft();
  }
  render();
};

$('autoBtn').onclick = () => { if (current) resetFrame(current); };
$('copyBtn').onclick = () => {
  const from = previousFramed();
  if (!from || !current) return;
  frames[current] = structuredClone(frames[from]);
  saveDraft();
  render();
};
$('saveBtn').onclick = lockIn;

window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
});

window.addEventListener('beforeunload', (e) => {
  if (!dirty()) return;
  e.preventDefault();
  e.returnValue = '';
});

window.addEventListener('resize', fitStage);
new ResizeObserver(fitStage).observe($('stageWrap'));

await load();
fitStage();
