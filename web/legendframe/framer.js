// Legend framer: place every legend's full-figure cutout in the two large
// placements, then lock the table into web/shared/legendframe.js.
//
// The point of the tool is speed: 49 legends, two placements each, and the
// only way that gets done is if a legend takes seconds. So the placements are
// direct-manipulation (drag to move, wheel to resize, double-click for auto),
// the two of them are linked by default so one adjustment frames both, and the
// rail moves under Ctrl+arrows without leaving the art. Work is kept in this
// browser as you go; Lock in is what writes the file the scenes read.
import {
  OFFSET_MAX, PLACEMENTS, PLACEMENT_KEYS, SCALE_MAX, SCALE_MIN,
  applyFrame, autoScale, cleanFrame, cleanFrames, frameFor,
} from '../shared/legendframe.js';

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'sidewaysStudio.legendFrames.draft';

const els = {
  headtohead: { fit: $('fitH2h'), frame: $('frameH2h'), img: $('imgH2h') },
  profile: { fit: $('fitProfile'), frame: $('frameProfile'), img: $('imgProfile') },
};

let legends = [];       // every legend that has a full cutout
let frames = {};        // the working table
let saved = {};         // what the file holds, for the dirty mark
let canSave = false;
let current = null;     // the selected slug
let linked = true;
const natural = new Map(); // slug -> { w, h }, filled as each cutout loads

const key = (o) => JSON.stringify(o);
const dirty = () => key(frames) !== key(saved);
const entryDirty = (slug) => key(frames[slug] || null) !== key(saved[slug] || null);

// --- the frame behind a placement -------------------------------------------

// The cutout's own size, which is what the untuned scale is worked out from.
// A decoded image knows it whether or not its load event has been seen yet, so
// this asks the elements as well as the map: a frame seeded before the event
// arrived would be seeded from the wrong scale, and nothing afterwards would
// say so.
const srcSlug = (img) => {
  if (!img.src) return null;
  const file = new URL(img.src).pathname.split('/').pop();
  return decodeURIComponent(file).replace(/\.webp$/, '');
};

function naturalOf(slug) {
  const known = natural.get(slug);
  if (known) return known;
  for (const placement of PLACEMENT_KEYS) {
    const img = els[placement].img;
    if (img.naturalWidth && srcSlug(img) === slug) {
      const size = { w: img.naturalWidth, h: img.naturalHeight };
      natural.set(slug, size);
      return size;
    }
  }
  return null;
}

// What a placement is showing: the legend's tuned frame, or the same autoscale
// the scene would fall back to. With the size still unknown scale 1 stands in,
// and the stage re-renders once the cutout arrives.
function effective(slug, placement) {
  const tuned = frameFor(frames, slug, placement);
  if (tuned) return tuned;
  const nat = naturalOf(slug);
  const slot = PLACEMENTS[placement];
  return { scale: nat ? autoScale(nat.w, nat.h, slot.w, slot.h) : 1, x: 0, y: 0 };
}

const isFramed = (slug) => Boolean(frames[slug]);

function ensureEntry(slug, seedPlacement) {
  if (!frames[slug]) frames[slug] = { base: effective(slug, seedPlacement) };
  return frames[slug];
}

// Move a placement. Linked, the change becomes the frame both placements use;
// unlinked, only this placement's own override moves.
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

// Back to untuned: the scenes' autoscale, and the rail's dot goes out.
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
  canSave = Boolean(frameRes.canSave);
  frames = readDraft() || structuredClone(saved);

  $('statusDot').classList.toggle('ok', true);
  $('statusText').textContent = `${legends.length} legends with full art`;
  $('saveNote').textContent = canSave
    ? 'Lock in writes the table into web/shared/legendframe.js, which the match card and the profile read.'
    : 'This is a packaged build, where web/ lives inside the exe: framing can only be locked in when the app runs from source.';
  $('saveBtn').disabled = !canSave;

  renderList();
  select(legends.length ? legends[0].slug : null);
}

// The draft survives a reload, so a framing session is never lost to a stray
// refresh. It is only ever this browser's copy; the file is what ships.
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
  for (const placement of PLACEMENT_KEYS) {
    const img = els[placement].img;
    if (!legend) { img.classList.add('hidden'); img.removeAttribute('src'); continue; }
    img.classList.remove('hidden');
    img.src = `/legendart/full/${slug}.webp`;
  }
  renderList();
  render();
  const row = $('legendList').querySelector('li.on');
  if (row) row.scrollIntoView({ block: 'nearest' });
}

// --- the placements ---------------------------------------------------------

function render() {
  for (const placement of PLACEMENT_KEYS) {
    const { frame, img } = els[placement];
    applyFrame(img, current ? effective(current, placement) : null);
    frame.classList.toggle('flipped', placement === 'headtohead' && $('flip').checked);
    frame.style.setProperty('--lf-flip', placement === 'headtohead' && $('flip').checked ? '-1' : '1');
    frame.classList.toggle('guides-on', $('guides').checked);
    frame.querySelector('.ghosts').classList.toggle('off', !$('furniture').checked);
  }
  renderControls();
  renderList();
}

// Scale each placement to the room it has been given, so both are on screen
// whole and at their true shape whatever the window is. Every term is floored:
// the drag maths divides by this scale, so a window too narrow to measure (or
// a first call before the page has been laid out) must still leave a stage
// that can be dragged rather than one turned inside out by a negative one.
const GAP = 14;
const CAPTION = 22;
const MIN_K = 0.05;

function fitStages() {
  const row = document.querySelector('.stage-row');
  const totalDesignW = PLACEMENT_KEYS.reduce((n, p) => n + PLACEMENTS[p].w, 0);
  const byHeight = Math.max(160, row.clientHeight - CAPTION) / 1080;
  const byWidth = Math.max(240, row.clientWidth - GAP) / totalDesignW;
  const k = Math.max(MIN_K, Math.min(byHeight, byWidth));
  for (const placement of PLACEMENT_KEYS) {
    const { fit, frame } = els[placement];
    const slot = PLACEMENTS[placement];
    frame.style.setProperty('--k', String(k));
    fit.style.width = `${Math.round(slot.w * k)}px`;
    fit.style.height = `${Math.round(slot.h * k)}px`;
  }
}

// Drag, wheel and keys on a placement. The frame is drawn at --k, and the
// offsets are percentages of the placement, so a pointer move converts once:
// screen px -> design px -> percent. A flipped match card moves the other way,
// because that is what the operator is looking at.
function wireStage(placement) {
  const { fit, frame } = els[placement];
  const slot = PLACEMENTS[placement];
  fit.tabIndex = 0;

  const flipOf = () => (placement === 'headtohead' && $('flip').checked ? -1 : 1);
  const scaleOf = () => Number(frame.style.getPropertyValue('--k')) || 1;

  let drag = null;
  fit.addEventListener('pointerdown', (e) => {
    // Nothing to drag, and nothing to seed a frame from, until the cutout has
    // decoded: its size is what an untuned scale is worked out from.
    if (!current || e.button !== 0 || !naturalOf(current)) return;
    const start = effective(current, placement);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start };
    fit.setPointerCapture(e.pointerId);
    fit.classList.add('dragging');
    fit.focus();
    e.preventDefault();
  });
  fit.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const k = scaleOf();
    const dx = ((e.clientX - drag.x) / k / slot.w) * 100 * flipOf();
    const dy = ((e.clientY - drag.y) / k / slot.h) * 100;
    setFrame(current, placement, { x: drag.start.x + dx, y: drag.start.y + dy });
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag = null;
    fit.classList.remove('dragging');
  };
  fit.addEventListener('pointerup', endDrag);
  fit.addEventListener('pointercancel', endDrag);

  fit.addEventListener('wheel', (e) => {
    if (!current) return;
    e.preventDefault();
    const cur = effective(current, placement);
    setFrame(current, placement, { scale: cur.scale * (1 - Math.sign(e.deltaY) * 0.03) });
  }, { passive: false });

  fit.addEventListener('dblclick', () => { if (current) resetFrame(current); });

  fit.addEventListener('keydown', (e) => {
    if (!current || e.ctrlKey || e.metaKey) return;
    const cur = effective(current, placement);
    const stepBy = e.shiftKey ? 2 : 0.5;
    const nudge = {
      ArrowLeft: { x: cur.x - stepBy * flipOf() },
      ArrowRight: { x: cur.x + stepBy * flipOf() },
      ArrowUp: { y: cur.y - stepBy },
      ArrowDown: { y: cur.y + stepBy },
      '[': { scale: cur.scale - 0.02 },
      ']': { scale: cur.scale + 0.02 },
    }[e.key];
    if (nudge) { e.preventDefault(); setFrame(current, placement, nudge); return; }
    if (e.key === '0') { e.preventDefault(); resetFrame(current); }
  });
}

// --- the controls -----------------------------------------------------------

const CTLS = [
  { k: 'scale', label: 'Size', min: SCALE_MIN, max: SCALE_MAX, step: 0.01 },
  { k: 'x', label: 'X', min: -OFFSET_MAX, max: OFFSET_MAX, step: 0.5 },
  { k: 'y', label: 'Y', min: -OFFSET_MAX, max: OFFSET_MAX, step: 0.5 },
];

function renderControls() {
  const sets = linked
    ? [{ placement: PLACEMENT_KEYS[0], title: 'Both placements' }]
    : PLACEMENT_KEYS.map((p) => ({ placement: p, title: PLACEMENTS[p].label }));
  $('frameSets').replaceChildren(...sets.map(({ placement, title }) => {
    const box = document.createElement('div');
    box.className = 'frame-set';
    box.append(Object.assign(document.createElement('h3'), { textContent: title }));
    const frame = current ? effective(current, placement) : { scale: 1, x: 0, y: 0 };
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
      label.htmlFor = range.id = `ctl-${placement}-${ctl.k}`;
      const write = (v) => setFrame(current, placement, { [ctl.k]: Number(v) });
      range.oninput = () => write(range.value);
      num.onchange = () => write(num.value);
      row.append(label, range, num);
      box.append(row);
    }
    return box;
  }));

  const framed = current && isFramed(current);
  $('frameSource').textContent = !current ? ''
    : (framed
      ? 'Framed by hand.'
      : 'Not framed yet: each placement is standing this legend full height on its own, the scenes’ fallback. The first adjustment sets one frame for both.');
  $('autoBtn').disabled = !framed;
  $('copyBtn').disabled = !current || !previousFramed();
  $('saveBtn').textContent = dirty() ? 'Lock in' : 'Locked in';
  $('saveBtn').disabled = !canSave || !dirty();
}

// The legend above this one in the rail that has a frame to copy: framing a
// run of legends with the same pose is then one click each.
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
      $('saveNote').textContent = out.reason === 'packaged'
        ? 'Not locked in: a packaged build cannot write web/shared/legendframe.js. Run the app from source to lock framing in.'
        : `Not locked in: ${out.reason || out.error || 'the server refused it'}.`;
      renderControls();
      return;
    }
    saved = cleanFrames(out.frames);
    frames = structuredClone(saved);
    saveDraft();
    $('saveNote').textContent = `Locked in: ${Object.keys(saved).length} legends written to web/shared/legendframe.js.`;
  } catch (err) {
    $('saveNote').textContent = `Not locked in: ${err.message}.`;
  }
  render();
}

// --- wiring -----------------------------------------------------------------

PLACEMENT_KEYS.forEach(wireStage);

// A cutout's own size decides the untuned scale, so the stages re-render once
// it is known. The size is recorded against the legend the file is OF, not
// whichever one is selected when it lands: walking the rail quickly leaves
// loads in flight, and one of them finishing late must not hand its
// measurements to the legend that has taken its place.
for (const placement of PLACEMENT_KEYS) {
  els[placement].img.addEventListener('load', (e) => {
    const img = e.currentTarget;
    const slug = srcSlug(img);
    if (!slug || !img.naturalWidth) return;
    natural.set(slug, { w: img.naturalWidth, h: img.naturalHeight });
    if (slug === current) render();
  });
}

$('filter').oninput = () => { renderList(); };
$('flip').onchange = render;
$('guides').onchange = render;
$('furniture').onchange = render;

// Unlinking hands each placement the frame it is already showing, so nothing
// moves at the moment the switch flips; relinking keeps the base.
$('link').onchange = () => {
  linked = $('link').checked;
  if (current && frames[current]) {
    const entry = frames[current];
    if (!linked) {
      entry.per = Object.fromEntries(PLACEMENT_KEYS.map((p) => [p, effective(current, p)]));
    } else {
      delete entry.per;
    }
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

// Ctrl + arrows walk the rail from anywhere, so a framing run never needs the
// mouse to leave the art.
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

window.addEventListener('resize', fitStages);
new ResizeObserver(fitStages).observe(document.querySelector('.stage-row'));

await load();
fitStages();
