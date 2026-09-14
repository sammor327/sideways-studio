import {
  COLOR_HELP, COLOR_KEYS, COLOR_LABELS, DESIGNED, LOOK_SCENES, PRESETS, SCENE_LABELS, resolveLook,
} from '../shared/look.js';
import { setOffline } from '../shared/offline.js';

const $ = (id) => document.getElementById(id);
const winsNeeded = (seriesLength) => Math.ceil(seriesLength / 2);
const SIDES = [['l', 'left'], ['r', 'right']];

let state = null;

async function post(patch) {
  try {
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    setStatus(false);
  }
}

function setStatus(ok) {
  $('statusDot').classList.toggle('ok', ok);
  $('statusText').textContent = ok ? 'connected' : 'disconnected';
  // Disconnected means the app is closed: nothing here can work, so the page
  // says so over the whole surface until the reconnect loop gets through. An
  // update restart is the one planned outage, and gets the softer line.
  setOffline(!ok, { restarting: !ok && updateInfo?.phase === 'ready' });
}

// --- field focus: light up what a graphic draws, dim the rest ---
//
// Every graphic reads the same match data (the score bug and the POV print the
// same points, the IGOs and the POV the same legend), so the panel keeps one
// field per fact and this map says which graphic draws which. Dimmed fields
// stay editable: the next graphic's data can go in while another one is up.
const SCENE_FIELDS = {
  scorebug: ['seriesLength', 'name', 'score', 'gameWins'],
  igo1v1: ['seriesLength', 'name', 'gameWins', 'legend', 'battlefield'],
  igo2v2: ['seriesLength', 'teamName', 'name', 'name2', 'gameWins',
    'legend', 'legend2', 'battlefield', 'battlefield2'],
  igodual: ['seriesLength', 'name', 'score', 'gameWins', 'seed', 'legend', 'legendText',
    'battlefield', 'champion', 'championText', 'eventName', 'roundTitle', 'timer'],
  igobars: ['name', 'name2', 'score', 'legend', 'legendText', 'legend2',
    'champion', 'championText', 'champion2'],
  pov: ['name', 'score', 'legend', 'legendText', 'battlefield',
    'champion', 'championText', 'card'],
};
const SCENE_NAMES = {
  scorebug: 'the score bug',
  igo1v1: 'the 1v1 overlay',
  igo2v2: 'the 2v2 overlay',
  igodual: 'the dual-column overlay',
  igobars: 'the 2v2 bars overlay',
  pov: 'the POV overlay',
};
const FOCUS_KEY = 'sidewaysStudio.fieldFocus';

// 'preview' follows whatever is switched on in the preview bank; a scene key
// pins one graphic. Per-browser convenience only, so storage may be missing.
let focus = 'preview';
try {
  const saved = localStorage.getItem(FOCUS_KEY);
  if (saved === 'preview' || Object.hasOwn(SCENE_FIELDS, saved)) focus = saved;
} catch { /* storage blocked: start on 'preview' */ }

// Whether one graphic, set up the way preview has it, draws one field on one
// side. Webcam holders are windows for camera sources, so they draw no legend
// art, and a hidden POV column takes all of its text and art with it.
function sceneDraws(scene, field, side, bank) {
  if (!SCENE_FIELDS[scene].includes(field)) return false;
  const cfg = bank.scenes[scene];
  // The dual overlay and the 2v2 bars still name the legend on their tiles
  // in webcam mode; the sidebars draw nothing for it then.
  if (cfg.mode === 'webcam' && !['igodual', 'igobars'].includes(scene) && (field === 'legend' || field === 'legend2')) return false;
  if (scene === 'pov' && side && !(side === 'left' ? cfg.showLeft : cfg.showRight)) return false;
  if (scene === 'igodual') {
    if (!cfg.eventBlock && ['eventName', 'roundTitle', 'timer'].includes(field)) return false;
    if (!cfg.clock && field === 'timer') return false;
  }
  return true;
}

function focusScenes(bank) {
  if (focus !== 'preview') return [focus];
  return Object.keys(SCENE_FIELDS).filter((key) => bank.scenes[key].visible);
}

function listNames(keys) {
  const names = keys.map((key) => SCENE_NAMES[key]);
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function focusHint(bank, scenes) {
  if (!scenes.length) {
    return 'Nothing switched on in preview uses match data, so every field is lit.';
  }
  const lines = [focus === 'preview'
    ? `Lit fields show on ${listNames(scenes)}, switched on in preview. Dimmed ones still edit.`
    : `Lit fields show on ${SCENE_NAMES[focus]}. Dimmed ones still edit.`];
  for (const key of scenes) {
    const cfg = bank.scenes[key];
    if (cfg.mode === 'webcam') {
      lines.push(`${capitalise(SCENE_NAMES[key])} is on webcam cutouts, so it shows no legend art.`);
    }
    if (key === 'pov' && !cfg.showLeft && !cfg.showRight) lines.push('Both POV columns are hidden.');
    else if (key === 'pov' && !cfg.showLeft) lines.push('The POV left column is hidden.');
    else if (key === 'pov' && !cfg.showRight) lines.push('The POV right column is hidden.');
  }
  return lines.join(' ');
}

function applyFocus() {
  if (!state) return;
  const bank = state.preview;
  const scenes = focusScenes(bank);
  // Nothing to measure against: preview has no match-data graphic on.
  const lightAll = scenes.length === 0;
  const sideLit = { left: false, right: false };
  for (const row of document.querySelectorAll('.field-row')) {
    const { field } = row.dataset;
    let rowLit = false;
    for (const cell of row.querySelectorAll('.cell')) {
      const side = cell.dataset.side || null;
      const lit = lightAll || scenes.some((key) => sceneDraws(key, field, side, bank));
      cell.classList.toggle('dim', !lit);
      rowLit = rowLit || lit;
      if (lit && side) sideLit[side] = true;
    }
    row.classList.toggle('dim-row', !rowLit);
  }
  for (const section of document.querySelectorAll('.field-section')) {
    const anyLit = section.querySelector('.field-row:not(.dim-row)');
    section.querySelector('.section-label').classList.toggle('dim', !anyLit);
  }
  for (const head of document.querySelectorAll('.grid-head .side-label')) {
    head.classList.toggle('dim', !lightAll && !sideLit[head.dataset.side]);
  }
  for (const chip of document.querySelectorAll('.focus-chip')) {
    const on = chip.dataset.focus === focus;
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', String(on));
  }
  $('focusHint').textContent = focusHint(bank, scenes);
}

for (const chip of document.querySelectorAll('.focus-chip')) {
  chip.addEventListener('click', () => {
    focus = chip.dataset.focus;
    try { localStorage.setItem(FOCUS_KEY, focus); } catch { /* per-session only */ }
    applyFocus();
  });
}

// The label column says which graphics draw each row, so the map above is
// readable without picking every chip in turn.
for (const row of document.querySelectorAll('.field-row')) {
  const users = Object.keys(SCENE_FIELDS).filter((key) => SCENE_FIELDS[key].includes(row.dataset.field));
  const label = row.querySelector('.row-label');
  const drawn = `Shown on ${listNames(users)}.`;
  label.title = label.title ? `${label.title} ${drawn}` : drawn;
}

// --- rendering ---

function renderScenes(s) {
  const sbPrev = s.preview.scenes.scorebug.visible;
  const sbAir = s.program.scenes.scorebug.visible;
  const sb = $('toggleScorebug');
  sb.textContent = sbPrev ? 'ON' : 'OFF';
  sb.classList.toggle('on', sbPrev);
  $('scorebugOnAir').classList.toggle('hidden', !sbAir);

  const igoPrev = s.preview.scenes.igo1v1;
  const igoBtn = $('toggleIgo');
  igoBtn.textContent = igoPrev.visible ? 'ON' : 'OFF';
  igoBtn.classList.toggle('on', igoPrev.visible);
  $('igoOnAir').classList.toggle('hidden', !s.program.scenes.igo1v1.visible);
  if (document.activeElement !== $('igoMode')) $('igoMode').value = igoPrev.mode;

  const igo2Prev = s.preview.scenes.igo2v2;
  const igo2Btn = $('toggleIgo2');
  igo2Btn.textContent = igo2Prev.visible ? 'ON' : 'OFF';
  igo2Btn.classList.toggle('on', igo2Prev.visible);
  $('igo2OnAir').classList.toggle('hidden', !s.program.scenes.igo2v2.visible);
  if (document.activeElement !== $('igo2Mode')) $('igo2Mode').value = igo2Prev.mode;

  const dualPrev = s.preview.scenes.igodual;
  const dualBtn = $('toggleIgoDual');
  dualBtn.textContent = dualPrev.visible ? 'ON' : 'OFF';
  dualBtn.classList.toggle('on', dualPrev.visible);
  $('igoDualOnAir').classList.toggle('hidden', !s.program.scenes.igodual.visible);
  if (document.activeElement !== $('igoDualMode')) $('igoDualMode').value = dualPrev.mode;
  for (const [id, flag] of [['igoDualTrack', 'track'], ['igoDualEvent', 'eventBlock'], ['igoDualClock', 'clock'], ['igoDualCard', 'cardSlot']]) {
    if (document.activeElement !== $(id)) $(id).checked = dualPrev[flag];
  }

  const barsPrev = s.preview.scenes.igobars;
  const barsBtn = $('toggleIgoBars');
  barsBtn.textContent = barsPrev.visible ? 'ON' : 'OFF';
  barsBtn.classList.toggle('on', barsPrev.visible);
  $('igoBarsOnAir').classList.toggle('hidden', !s.program.scenes.igobars.visible);
  if (document.activeElement !== $('igoBarsMode')) $('igoBarsMode').value = barsPrev.mode;

  const povPrev = s.preview.scenes.pov;
  const povBtn = $('togglePov');
  povBtn.textContent = povPrev.visible ? 'ON' : 'OFF';
  povBtn.classList.toggle('on', povPrev.visible);
  $('povOnAir').classList.toggle('hidden', !s.program.scenes.pov.visible);
  for (const [id, flag] of [['povShowLeft', povPrev.showLeft], ['povShowRight', povPrev.showRight]]) {
    if (document.activeElement !== $(id)) $(id).checked = flag;
  }

  const dk = s.preview.scenes.decklist;
  const dkBtn = $('toggleDeck');
  dkBtn.textContent = dk.visible ? 'ON' : 'OFF';
  dkBtn.classList.toggle('on', dk.visible);
  dkBtn.disabled = !dk.list.trim();
  $('deckOnAir').classList.toggle('hidden', !s.program.scenes.decklist.visible);
  if (document.activeElement !== $('deckList')) $('deckList').value = dk.list;
  // Summarise a list that arrived from state (a reload, or the other panel),
  // not just one the operator is typing.
  if (dk.list !== summarisedList) {
    summarisedList = dk.list;
    summariseDeck(dk.list);
  }
  if (document.activeElement !== $('deckSideboard')) $('deckSideboard').checked = dk.showSideboard;
  if (document.activeElement !== $('deckBackground')) $('deckBackground').checked = dk.background !== false;
  renderDeckLibrary();

  const cp = s.preview.scenes.cardpopup;
  const cpAir = s.program.scenes.cardpopup.visible;
  const cardBtn = $('toggleCard');
  cardBtn.textContent = cp.visible ? 'ON' : 'OFF';
  cardBtn.classList.toggle('on', cp.visible);
  cardBtn.disabled = !cp.card.cardId;
  $('cardOnAir').classList.toggle('hidden', !cpAir);

  const thumb = $('stagedThumb');
  if (cp.card.cardId) {
    $('stagedName').textContent = cp.card.cardName;
    $('stagedType').textContent = cp.card.cardType;
    const src = `/cardart/thumb/${cp.card.cardId}.webp`;
    if (thumb.getAttribute('src') !== src) {
      thumb.onerror = () => thumb.classList.add('hidden');
      thumb.onload = () => thumb.classList.remove('hidden');
      thumb.src = src;
    }
  } else {
    $('stagedName').textContent = 'Nothing staged';
    $('stagedType').textContent = '';
    thumb.classList.add('hidden');
    thumb.removeAttribute('src');
  }
}

// A side's featured card: thumbnail beside the search box, and a Clear that is
// only live when there is something to clear.
function renderFeaturedCard(p, card) {
  const thumb = $(`${p}cardThumb`);
  $(`${p}cardClear`).disabled = !card.cardId;
  if (!card.cardId) {
    thumb.classList.add('hidden');
    thumb.removeAttribute('src');
    return;
  }
  const src = `/cardart/thumb/${card.cardId}.webp`;
  if (thumb.getAttribute('src') !== src) {
    thumb.onerror = () => thumb.classList.add('hidden');
    thumb.onload = () => thumb.classList.remove('hidden');
    thumb.src = src;
  }
}

// --- the look: colours and backgrounds, global or per graphic ---
//
// Scope 'global' edits theme.look (and the top-level accents); a scene key
// edits that graphic's own override, which only counts while "own look" is
// on. Every colour control shows the value that would air for the scope and
// a clear button that drops it back to the designed colour. Nothing here is
// cued: the look is setup, like the logo, and airs as it is edited.

let lookScope = 'global';
const LOOK_KEY = 'sidewaysStudio.lookScope';
try {
  const saved = localStorage.getItem(LOOK_KEY);
  if (saved === 'global' || LOOK_SCENES.includes(saved)) lookScope = saved;
} catch { /* per-session only */ }

$('lookScope').replaceChildren(
  Object.assign(document.createElement('option'), { value: 'global', textContent: 'All graphics' }),
  ...LOOK_SCENES.map((key) => Object.assign(document.createElement('option'), { value: key, textContent: SCENE_LABELS[key] })),
);
$('lookScope').value = lookScope;
$('lookScope').addEventListener('change', () => {
  lookScope = $('lookScope').value;
  try { localStorage.setItem(LOOK_KEY, lookScope); } catch { /* ignore */ }
  if (state) renderLook(state.theme);
});

// Where a patch for the current scope lands.
function lookPatch(fields) {
  if (lookScope === 'global') {
    const { accentA, accentB, ...rest } = fields;
    const theme = { look: rest };
    if (accentA !== undefined) theme.accentA = accentA;
    if (accentB !== undefined) theme.accentB = accentB;
    return { theme };
  }
  return { theme: { scenes: { [lookScope]: fields } } };
}

// The stored (possibly empty) fields for the scope, and the values that air.
function scopeStored(t) {
  return lookScope === 'global' ? t.look : t.scenes[lookScope];
}
function scopeEffective(t) {
  // For "all graphics" the preview colour is what an unthemed graphic shows:
  // the dual overlay's designed set, since it is the most complete.
  return resolveLook(t, lookScope === 'global' ? 'igodual' : lookScope);
}

const COLOR_ROWS = [
  ['accentA', 'Accent 1', 'Player 1 side, the first colour of the accent gradient.'],
  ['accentB', 'Accent 2', 'Player 2 side, the second colour of the accent gradient.'],
  ...COLOR_KEYS.map((key) => [key, COLOR_LABELS[key], COLOR_HELP[key]]),
];
$('lookColors').replaceChildren(...COLOR_ROWS.map(([key, label, help]) => {
  const row = document.createElement('div');
  row.className = 'look-color';
  row.dataset.key = key;
  row.title = help;
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'color';
  input.id = `look-${key}`;
  input.setAttribute('aria-label', label);
  const clear = document.createElement('button');
  clear.className = 'clear-x';
  clear.textContent = '\u00d7';
  clear.title = 'Back to the designed colour';
  clear.setAttribute('aria-label', `Clear ${label}`);
  row.append(name, input, clear);
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => post(lookPatch(colorField(key, input.value))), 120);
  });
  clear.addEventListener('click', () => post(lookPatch(colorField(key, ''))));
  return row;
}));
function colorField(key, value) {
  return key === 'accentA' || key === 'accentB' ? { [key]: value } : { colors: { [key]: value } };
}

$('presetRow').replaceChildren(...PRESETS.map((preset) => {
  const btn = document.createElement('button');
  btn.className = 'preset';
  btn.textContent = preset.name;
  btn.title = preset.hint;
  btn.addEventListener('click', () => {
    // A preset restates every colour it names and clears the rest, so two
    // presets in a row never blend.
    const fields = {
      accentA: preset.look.accentA || '',
      accentB: preset.look.accentB || '',
      colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, (preset.look.colors || {})[k] || ''])),
      background: {
        kind: '', color: '', color2: '', angle: '', grain: '', dim: '',
        ...(preset.look.background || {}),
      },
    };
    if (lookScope !== 'global') fields.enabled = true;
    post(lookPatch(fields));
  });
  return btn;
}));

$('lookOwn').addEventListener('change', () => {
  if (lookScope === 'global') return;
  const on = $('lookOwn').checked;
  const fields = { enabled: on };
  // Switching a graphic to its own look starts it from what it shows now, so
  // nothing jumps on air.
  if (on && state) {
    const eff = resolveLook(state.theme, lookScope);
    fields.accentA = eff.accentA;
    fields.accentB = eff.accentB;
    fields.colors = { ...eff.colors };
    // The image stays whatever this graphic's own upload is; a copied URL
    // would be refused by the sanitizer anyway.
    const { image, ...background } = eff.background;
    fields.background = background;
  }
  post(lookPatch(fields));
});

$('bgKind').addEventListener('change', () => post(lookPatch({ background: { kind: $('bgKind').value } })));
for (const [id, key] of [['bgColor', 'color'], ['bgColor2', 'color2']]) {
  let timer = null;
  $(id).addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => post(lookPatch({ background: { [key]: $(id).value } })), 120);
  });
}
for (const [id, key] of [['bgAngle', 'angle'], ['bgGrain', 'grain'], ['bgDim', 'dim']]) {
  let timer = null;
  $(id).addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => post(lookPatch({ background: { [key]: Number($(id).value) } })), 100);
  });
}

// --- upload guidance ---
//
// The server caps the logo at 2 MB and a background at 6 MB and refuses
// anything else with a one-line error, so the checks here exist to say so
// BEFORE a 40 MB photo is sent, and to warn (not block) when an image is
// smaller than the surface it will be stretched over. Sizes below are the
// design pixels each surface paints at on a 1920x1080 output.
const MB = 1024 * 1024;
const LOGO_RULE = { label: 'logo', maxBytes: 2 * MB, min: [720, 440] };
// Backgrounds are cover-fit: scaled to fill the surface and cropped, so
// the useful advice is the surface's shape, not just its size.
const BG_SURFACES = {
  global: { size: [1920, 1080], text: '1920 × 1080 covers everything: the decklist uses all of it, and the sidebars and columns show its middle. For a columns-only look use a portrait image, about 700 × 1080.' },
  decklist: { size: [1920, 1080], text: 'Full frame, 1920 × 1080.' },
  igodual: { size: [700, 1080], text: 'Each column is 350 × 1080 and shows the same image, scaled to fill and cropped, so a portrait image (about 700 × 1080) works best; a landscape photo shows only a narrow slice.' },
  igo1v1: { size: [610, 1080], text: 'The sidebar is a 305 × 1080 strip on the right; a portrait image (about 610 × 1080) works best. Landscape photos show their middle.' },
  igobars: { size: [1920, 108], text: 'Paints the two bars, full-width strips 1920 × 54 along the top and bottom edges; a wide, quiet texture works best. The tiles hanging off them keep the Panels colour.' },
  igo2v2: { size: [820, 1080], text: 'The sidebar is a 412 × 1080 strip on the right; a portrait image (about 820 × 1080) works best. Landscape photos show their middle.' },
  pov: { size: [528, 622], text: 'Paints the navy panels inside each 264 × 311 column frame, so a small image (about 528 × 622) is enough; detail will not read at that size.' },
  scorebug: { size: [1040, 128], text: 'Paints the two name plates, wide strips about 520 × 64 each; a wide, quiet texture works best.' },
  cardpopup: { size: [1240, 120], text: 'Paints the name plate under the card, a strip up to 620 × 60; a wide, quiet texture works best.' },
};
function bgAdvice(scope) {
  const s = BG_SURFACES[scope] || BG_SURFACES.global;
  return `PNG, JPG or WebP under 6 MB. ${s.text}`;
}

// Read the pixel size of an image file; null when it cannot be read (an
// SVG, or a browser without createImageBitmap), which skips the warning.
async function imageSize(file) {
  if (!('createImageBitmap' in window) || /svg/i.test(file.type)) return null;
  try {
    const bmp = await createImageBitmap(file);
    const size = [bmp.width, bmp.height];
    bmp.close();
    return size;
  } catch {
    return null;
  }
}

// True when the upload should go ahead.
async function checkUpload(file, rule) {
  if (file.size > rule.maxBytes) {
    alert(`That ${rule.label} is ${(file.size / MB).toFixed(1)} MB; the limit is ${rule.maxBytes / MB} MB. Export it smaller (a JPG or WebP at the recommended size is usually well under 1 MB).`);
    return false;
  }
  const size = await imageSize(file);
  if (size && (size[0] < rule.min[0] * 0.75 || size[1] < rule.min[1] * 0.75)) {
    return confirm(`That ${rule.label} is ${size[0]} × ${size[1]}, smaller than the recommended ${rule.min[0]} × ${rule.min[1]}, so it may look soft on air. Upload it anyway?`);
  }
  return true;
}

$('bgFile').addEventListener('change', async () => {
  const file = $('bgFile').files[0];
  if (!file) return;
  const surface = BG_SURFACES[lookScope] || BG_SURFACES.global;
  if (!(await checkUpload(file, { label: 'background', maxBytes: 6 * MB, min: surface.size }))) {
    $('bgFile').value = '';
    return;
  }
  const ext = file.name.split('.').pop().toLowerCase().replace('jpeg', 'jpg');
  const res = await fetch(`/api/theme/image?slot=${encodeURIComponent(lookScope)}&ext=${encodeURIComponent(ext)}`, {
    method: 'POST',
    body: await file.arrayBuffer(),
  }).then((r) => r.json()).catch(() => ({ ok: false, error: 'upload failed' }));
  if (!res.ok) alert(`Background upload failed: ${res.error}`);
  else if (lookScope !== 'global') post(lookPatch({ enabled: true }));
  $('bgFile').value = '';
});
$('bgRemove').addEventListener('click', () => post(lookPatch({ background: { image: '', kind: '' } })));

function renderLook(t) {
  const stored = scopeStored(t);
  const eff = scopeEffective(t);
  const global = lookScope === 'global';
  $('lookOwnRow').classList.toggle('hidden', global);
  $('lookGlobalOnly').classList.toggle('hidden', !global);
  if (!global && document.activeElement !== $('lookOwn')) $('lookOwn').checked = Boolean(stored.enabled);
  // A scene without its own look shows the inherited values, dimmed, so the
  // operator sees what it airs and where the values come from.
  const inert = !global && !stored.enabled;
  $('lookColors').classList.toggle('inert', inert);
  $('presetRow').classList.toggle('inert', false);
  document.querySelector('.look-bg').classList.toggle('inert', inert);

  for (const row of document.querySelectorAll('.look-color')) {
    const key = row.dataset.key;
    const input = row.querySelector('input');
    const isAccent = key === 'accentA' || key === 'accentB';
    const storedValue = isAccent ? (global ? t[key] : stored[key]) : stored.colors[key];
    const effective = isAccent ? eff[key] : (eff.colors[key] || eff.accentA);
    if (document.activeElement !== input) input.value = effective;
    row.classList.toggle('is-set', Boolean(storedValue));
    row.querySelector('button').disabled = !storedValue || (global && isAccent);
  }

  const b = stored.background;
  const ebg = eff.background;
  if (document.activeElement !== $('bgKind')) $('bgKind').value = b.kind || '';
  const kind = ebg.kind;
  $('bgColorRow').classList.toggle('hidden', kind === 'transparent');
  $('bgColor2Row').classList.toggle('hidden', kind !== 'gradient');
  $('bgAngleRow').classList.toggle('hidden', kind !== 'gradient');
  $('bgImageRow').classList.toggle('hidden', !(b.kind === 'image' || b.image));
  $('bgHint').classList.toggle('hidden', !(b.kind === 'image' || b.image));
  for (const [id, key] of [['bgColor', 'color'], ['bgColor2', 'color2']]) {
    if (document.activeElement !== $(id)) $(id).value = ebg[key];
  }
  for (const [id, key] of [['bgAngle', 'angle'], ['bgGrain', 'grain'], ['bgDim', 'dim']]) {
    if (document.activeElement !== $(id)) $(id).value = String(ebg[key]);
  }
  const bgPreview = $('bgPreview');
  if (b.image) {
    let img = bgPreview.querySelector('img');
    if (!img) { bgPreview.replaceChildren(); img = document.createElement('img'); bgPreview.appendChild(img); }
    if (img.getAttribute('src') !== b.image) img.src = b.image;
  } else {
    bgPreview.replaceChildren(Object.assign(document.createElement('span'), { className: 'muted', textContent: 'No image' }));
  }
  $('bgRemove').disabled = !b.image;
  $('bgHint').textContent = bgAdvice(lookScope);
  $('themeReset').textContent = global ? 'Reset to designed look' : `Reset ${SCENE_LABELS[lookScope]}`;

  $('fontSelect').value = t.font || '';
  const preview = $('logoPreview');
  if (t.logo) {
    let img = preview.querySelector('img');
    if (!img) {
      preview.replaceChildren();
      img = document.createElement('img');
      preview.appendChild(img);
    }
    if (img.getAttribute('src') !== t.logo) img.src = t.logo;
  } else {
    preview.replaceChildren(Object.assign(document.createElement('span'), { className: 'muted', textContent: 'No logo' }));
  }
  $('logoRemove').disabled = !t.logo;
}

// Never clobber a field the operator is typing in.
const setIfIdle = (id, value) => {
  const el = $(id);
  if (document.activeElement !== el) el.value = value;
};

function render(s) {
  state = s;
  const m = s.preview.match;
  for (const [p, side] of SIDES) {
    const sd = m[side];
    setIfIdle(`${p}name`, sd.name);
    setIfIdle(`${p}score`, String(sd.score));
    $(`${p}winsOut`).textContent = sd.gameWins;
    // The legend picker and its "shown as" line are one field: the picker
    // fills it, the line edits the text without moving the art.
    setIfIdle(`${p}legend`, sd.legend || '');
    setIfIdle(`${p}legendText`, sd.legend || '');
    setIfIdle(`${p}bf`, sd.battlefield || '');
    setIfIdle(`${p}champion`, sd.champion || '');
    setIfIdle(`${p}championText`, sd.champion || '');
    setIfIdle(`${p}card`, sd.card.cardName || '');
    renderFeaturedCard(p, sd.card);
    setIfIdle(`${p}team`, sd.teamName || '');
    setIfIdle(`${p}name2`, sd.name2 || '');
    setIfIdle(`${p}legend2`, sd.legend2 || '');
    setIfIdle(`${p}champion2`, sd.champion2 || '');
    setIfIdle(`${p}bf2`, sd.battlefield2 || '');
    setIfIdle(`${p}seed`, sd.seed || '');
  }
  $('seriesLength').value = String(m.seriesLength);
  setIfIdle('eventName', s.preview.event.name || '');
  setIfIdle('roundTitle', s.preview.event.roundTitle || '');
  renderClock(m.timer);

  renderScenes(s);
  renderLook(s.theme);
  applyFocus();

  // The TAKE button lights up whenever preview differs from what is on air.
  const pending = JSON.stringify(s.preview) !== JSON.stringify(s.program);
  $('takeBtn').classList.toggle('pending', pending);
}

// --- bus controls ---

$('takeBtn').addEventListener('click', () => post({ action: 'take' }));
$('clearBtn').addEventListener('click', () => post({ action: 'clear' }));

// --- match data (all edits land in the preview bank) ---

function paintCounter(side, field, value) {
  const p = side === 'left' ? 'l' : 'r';
  if (field === 'score') setIfIdle(`${p}score`, String(value));
  else $(`${p}winsOut`).textContent = value;
}

for (const btn of document.querySelectorAll('.counter button')) {
  btn.addEventListener('click', () => {
    if (!state) return;
    const { side, field, step } = btn.dataset;
    // Optimistic: mutate the local copy immediately so rapid clicks stack
    // instead of re-sending the same stale value.
    const m = state.preview.match;
    const max = field === 'score' ? 8 : winsNeeded(m.seriesLength);
    const next = Math.min(max, Math.max(0, m[side][field] + Number(step)));
    m[side][field] = next;
    paintCounter(side, field, next);
    post({ match: { [side]: { [field]: next } } });
  });
}

// Direct score entry, for jumping to a number instead of stepping to it.
for (const [p, side] of SIDES) {
  const el = $(`${p}score`);
  const commit = () => {
    const raw = el.value.trim();
    const parsed = Math.trunc(Number(raw));
    // Unparseable input puts back the number that is on the graphic. Zeroing a
    // live score because someone fat-fingered a letter is not a recovery.
    const current = state ? state.preview.match[side].score : 0;
    const next = raw !== '' && Number.isFinite(parsed)
      ? Math.min(8, Math.max(0, parsed))
      : current;
    el.value = String(next);
    if (state) state.preview.match[side].score = next;
    post({ match: { [side]: { score: next } } });
  };
  el.addEventListener('change', commit);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); el.blur(); } });
}

// Debounced text fields, one timer per input so parallel edits never cancel
// each other. The two "shown as" lines write the same field their picker does.
for (const [p, side] of SIDES) {
  for (const [id, field] of [
    [`${p}name`, 'name'], [`${p}name2`, 'name2'], [`${p}team`, 'teamName'],
    [`${p}legendText`, 'legend'], [`${p}championText`, 'champion'], [`${p}seed`, 'seed'],
  ]) {
    const el = $(id);
    let timer = null;
    const flush = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      post({ match: { [side]: { [field]: el.value } } });
    };
    el.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    });
    // Leaving the field sends the edit at once. Otherwise a counter click
    // inside the debounce window repaints this now-idle field from the older
    // state, and the timer then posts that instead of what was typed.
    el.addEventListener('blur', flush);
  }
}

$('seriesLength').addEventListener('change', () => {
  post({ match: { seriesLength: Number($('seriesLength').value) } });
});

$('resetMatch').addEventListener('click', () => {
  if (!confirm('Reset match in preview? Scores and game wins go to zero and all graphics switch off. Press TAKE afterward to put the reset on air.')) return;
  post({
    match: {
      left: { score: 0, gameWins: 0 },
      right: { score: 0, gameWins: 0 },
    },
    scenes: {
      scorebug: { visible: false }, cardpopup: { visible: false },
      igo1v1: { visible: false }, igo2v2: { visible: false }, igodual: { visible: false }, igobars: { visible: false },
      pov: { visible: false },
    },
  });
});

// Swap sides moves the whole side, so every graphic follows at once instead
// of one disagreeing with another.
const SWAP_FIELDS = [
  'name', 'legend', 'legendSlug', 'legendCardId', 'battlefield', 'battlefieldCardId',
  'champion', 'name2', 'legend2', 'legendSlug2', 'legendCardId2', 'battlefield2', 'teamName',
  'champion2', 'score', 'gameWins', 'seed',
];
$('swapSides').addEventListener('click', () => {
  if (!state) return;
  const m = state.preview.match;
  const copy = (side) => {
    const out = { card: { ...m[side].card } };
    for (const field of SWAP_FIELDS) out[field] = m[side][field];
    return out;
  };
  post({ match: { left: copy('right'), right: copy('left') } });
});

// --- scene toggles (preview bank; TAKE commits) ---

$('toggleScorebug').addEventListener('click', () => {
  if (!state) return;
  post({ scenes: { scorebug: { visible: !state.preview.scenes.scorebug.visible } } });
});

$('toggleCard').addEventListener('click', () => {
  if (!state) return;
  const cp = state.preview.scenes.cardpopup;
  if (cp.card.cardId) post({ scenes: { cardpopup: { visible: !cp.visible } } });
});

// The IGOs and the POV overlay all live on the screen edges and would draw
// over each other, so switching one on switches the others off in preview.
const EDGE_SCENES = ['igo1v1', 'igo2v2', 'igodual', 'igobars', 'pov'];
function toggleEdgeScene(key) {
  if (!state) return;
  const next = !state.preview.scenes[key].visible;
  const scenes = { [key]: { visible: next } };
  if (next) {
    for (const other of EDGE_SCENES) {
      if (other !== key) scenes[other] = { visible: false };
    }
  }
  post({ scenes });
}
$('toggleIgo').addEventListener('click', () => toggleEdgeScene('igo1v1'));
$('toggleIgo2').addEventListener('click', () => toggleEdgeScene('igo2v2'));
$('toggleIgoDual').addEventListener('click', () => toggleEdgeScene('igodual'));
$('toggleIgoBars').addEventListener('click', () => toggleEdgeScene('igobars'));
$('togglePov').addEventListener('click', () => toggleEdgeScene('pov'));

$('igoDualMode').addEventListener('change', () => {
  post({ scenes: { igodual: { mode: $('igoDualMode').value } } });
});
for (const [id, flag] of [['igoDualTrack', 'track'], ['igoDualEvent', 'eventBlock'], ['igoDualClock', 'clock'], ['igoDualCard', 'cardSlot']]) {
  $(id).addEventListener('change', () => post({ scenes: { igodual: { [flag]: $(id).checked } } }));
}
$('igoBarsMode').addEventListener('change', () => {
  post({ scenes: { igobars: { mode: $('igoBarsMode').value } } });
});

// --- event fields and the round clock ---

for (const [id, field] of [['eventName', 'name'], ['roundTitle', 'roundTitle']]) {
  const el = $(id);
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    post({ event: { [field]: el.value } });
  };
  el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); });
  el.addEventListener('blur', flush);
}

// The clock is a cue: start, pause, reset and set act on both banks, so the
// overlay on air follows without a TAKE. The panel shows the same arithmetic
// the scene draws.
let clockState = { running: false, startedAt: 0, elapsed: 0, countdown: 0 };
function clockText(t) {
  const total = t.elapsed + (t.running ? Date.now() - t.startedAt : 0);
  const ms = t.countdown > 0 ? Math.max(0, t.countdown - total) : total;
  const s = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
function renderClock(t) {
  if (!t) return;
  clockState = t;
  $('clockOut').textContent = clockText(t);
  $('clockStart').textContent = t.running ? 'Pause' : 'Start';
  $('clockStart').classList.toggle('on', t.running);
  if (document.activeElement !== $('clockMinutes')) $('clockMinutes').value = String(Math.round(t.countdown / 60000));
}
setInterval(() => { if (clockState.running) $('clockOut').textContent = clockText(clockState); }, 500);
$('clockStart').addEventListener('click', () => post({ action: 'timer', op: clockState.running ? 'pause' : 'start' }));
$('clockReset').addEventListener('click', () => post({ action: 'timer', op: 'reset' }));
$('clockSet').addEventListener('click', () => {
  const minutes = Math.max(0, Math.min(600, Math.trunc(Number($('clockMinutes').value)) || 0));
  post({ action: 'timer', op: 'set', minutes });
});
$('clockMinutes').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('clockSet').click(); });

$('igoMode').addEventListener('change', () => {
  post({ scenes: { igo1v1: { mode: $('igoMode').value } } });
});
$('igo2Mode').addEventListener('change', () => {
  post({ scenes: { igo2v2: { mode: $('igo2Mode').value } } });
});

$('povShowLeft').addEventListener('change', () => post({ scenes: { pov: { showLeft: $('povShowLeft').checked } } }));
$('povShowRight').addEventListener('change', () => post({ scenes: { pov: { showRight: $('povShowRight').checked } } }));

$('povReset').addEventListener('click', () => {
  post({
    match: {
      left: { champion: '', card: { cardId: '', cardName: '' } },
      right: { champion: '', card: { cardId: '', cardName: '' } },
    },
  });
  for (const id of ['lcard', 'rcard', 'lchampion', 'rchampion', 'lchampionText', 'rchampionText']) $(id).value = '';
});

// --- catalog pickers: type-ahead dropdowns over legends and battlefields ---

let legendCatalog = [];
let battlefieldCatalog = [];
let championCatalog = [];
// The battlefield and champion catalogs are derived from the card index, so
// on a machine that has not downloaded the card database yet they come back
// empty with HTTP 200. That is not an error to retry on, but the pickers are
// dead until it changes, so the database poller calls this again once the
// index lands rather than waiting for the operator to reload the panel.
let catalogsReady = false;
async function loadCatalogs() {
  try {
    legendCatalog = (await (await fetch('/api/legends', { cache: 'no-store' })).json()).legends;
    battlefieldCatalog = (await (await fetch('/api/battlefields', { cache: 'no-store' })).json()).battlefields;
    championCatalog = (await (await fetch('/api/champions', { cache: 'no-store' })).json()).champions;
    catalogsReady = battlefieldCatalog.length > 0 && championCatalog.length > 0;
  } catch {
    catalogsReady = false;
    setTimeout(loadCatalogs, 3000);
  }
}
loadCatalogs();

// The data panel scrolls, and its lowest pickers sit near the bottom of the
// window: a list with no room below opens upward instead of off the card.
function placeList(input, list) {
  const box = input.closest('.card');
  if (!box) return;
  const frame = box.getBoundingClientRect();
  const at = input.getBoundingClientRect();
  const below = frame.bottom - at.bottom;
  list.classList.toggle('up', below < 270 && at.top - frame.top > below);
}

// Generic wiring: filter a catalog as the operator types, click or Enter
// picks, clearing the field clears the assignment. Leaving the field without
// picking puts back what is actually assigned, so a half-typed search never
// reads as the data that will air.
function wirePicker(inputId, listId, { search, renderItem, onPick, onClear, current }) {
  const input = $(inputId);
  const list = $(listId);
  const close = () => { list.classList.remove('open'); list.replaceChildren(); };
  const pick = (item) => {
    onPick(item);
    input.value = renderItem(item).label;
    close();
  };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { onClear(); close(); return; }
    const hits = search(q).slice(0, 8);
    list.replaceChildren(...hits.map((item) => {
      const { label, icon } = renderItem(item);
      const li = document.createElement('li');
      if (icon) {
        const img = document.createElement('img');
        img.src = icon;
        img.alt = '';
        img.onerror = () => img.classList.add('hidden');
        li.append(img);
      }
      const meta = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = label;
      meta.append(name);
      li.append(meta);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(item); });
      return li;
    }));
    placeList(input, list);
    list.classList.toggle('open', hits.length > 0);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim().toLowerCase();
      // Every catalog entry contains the empty string, so without this an
      // Enter pressed just to dismiss the field would assign the catalog's
      // first legend or champion: wrong name, wrong art, no confirmation.
      // Nothing typed means nothing picked.
      if (!q) { close(); return; }
      const hit = search(q)[0];
      if (hit) pick(hit);
    }
    if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(() => {
    close();
    if (document.activeElement !== input && state) input.value = current();
  }, 150));
}

// idField is the card id the legend art resolves against on the POV, the
// dual columns and the 2v2 bars (the sidebars draw hero cutouts by slug).
for (const [p, side] of SIDES) {
  for (const [inputId, nameField, slugField, idField] of [
    [`${p}legend`, 'legend', 'legendSlug', 'legendCardId'],
    [`${p}legend2`, 'legend2', 'legendSlug2', 'legendCardId2'],
  ]) {
    wirePicker(inputId, `${inputId}Results`, {
      search: (q) => legendCatalog.filter((l) => l.name.toLowerCase().includes(q)),
      renderItem: (l) => ({ label: l.name, icon: `/legendart/icon/${l.slug}.webp` }),
      onPick: (l) => post({ match: { [side]: {
        [nameField]: l.name,
        [slugField]: l.slug,
        ...(idField ? { [idField]: l.cardId || '' } : {}),
      } } }),
      onClear: () => post({ match: { [side]: {
        [nameField]: '',
        [slugField]: '',
        ...(idField ? { [idField]: '' } : {}),
      } } }),
      current: () => state.preview.match[side][nameField] || '',
    });
  }

  for (const [inputId, field, idField] of [
    [`${p}bf`, 'battlefield', 'battlefieldCardId'],
    [`${p}bf2`, 'battlefield2', null],
  ]) {
    wirePicker(inputId, `${inputId}Results`, {
      search: (q) => battlefieldCatalog.filter((b) => b.cardName.toLowerCase().includes(q)),
      renderItem: (b) => ({ label: b.cardName, icon: `/cardart/thumb/${b.cardId}.webp` }),
      onPick: (b) => post({ match: { [side]: {
        [field]: b.cardName,
        ...(idField ? { [idField]: b.cardId } : {}),
      } } }),
      onClear: () => post({ match: { [side]: {
        [field]: '',
        ...(idField ? { [idField]: '' } : {}),
      } } }),
      current: () => state.preview.match[side][field] || '',
    });
  }

  // Champion unit picker. The POV overlay's CHAMPION line carries Riftbound's
  // Champion Unit glyph in the designer file, so it names a champion unit
  // card; picking one also stages it as that side's featured card (Sam, Loop 5).
  wirePicker(`${p}champion`, `${p}championResults`, {
    search: (q) => championCatalog.filter((c) => c.cardName.toLowerCase().includes(q)),
    renderItem: (c) => ({ label: c.cardName, icon: `/cardart/thumb/${c.cardId}.webp` }),
    onPick: (c) => post({ match: { [side]: {
      champion: c.cardName,
      card: { cardId: c.cardId, cardName: c.cardName },
    } } }),
    // Clearing the search clears the line only: a card the operator picked by
    // hand is never wiped by a stray backspace here.
    onClear: () => post({ match: { [side]: { champion: '' } } }),
    current: () => state.preview.match[side].champion || '',
  });

  // The teammate's champion line, for the 2v2 bars' second tile. A line
  // only: the featured card stays the first player's.
  wirePicker(`${p}champion2`, `${p}champion2Results`, {
    search: (q) => championCatalog.filter((c) => c.cardName.toLowerCase().includes(q)),
    renderItem: (c) => ({ label: c.cardName, icon: `/cardart/thumb/${c.cardId}.webp` }),
    onPick: (c) => post({ match: { [side]: { champion2: c.cardName } } }),
    onClear: () => post({ match: { [side]: { champion2: '' } } }),
    current: () => state.preview.match[side].champion2 || '',
  });
}

// Featured card search: any card, one independent search per side. The card
// catalog is too big to ship to the panel, so this goes through the server's
// ranked search, like the card popup does.
function wireCardSearch(p, side) {
  const input = $(`${p}card`);
  const list = $(`${p}cardResults`);
  let timer = null;
  let hits = [];
  const close = () => { list.classList.remove('open'); list.replaceChildren(); };
  const stage = (card) => {
    post({ match: { [side]: { card: { cardId: card.cardId, cardName: card.cardName } } } });
    input.value = card.cardName;
    hits = [];
    close();
  };
  const draw = () => {
    list.replaceChildren(...hits.map((card) => {
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.src = `/cardart/thumb/${card.cardId}.webp`;
      img.alt = '';
      img.onerror = () => img.classList.add('hidden');
      const meta = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = card.cardName;
      const sub = document.createElement('span');
      sub.textContent = [card.cardType, card.cardId].filter(Boolean).join(' · ');
      meta.append(name, sub);
      li.append(img, meta);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); stage(card); });
      return li;
    }));
    placeList(input, list);
    list.classList.toggle('open', hits.length > 0);
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { hits = []; draw(); return; }
    timer = setTimeout(async () => {
      try {
        const data = await (await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`)).json();
        hits = data.indexed ? data.results : [];
        draw();
      } catch { /* the server comes back; the next keystroke searches again */ }
    }, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && hits.length) stage(hits[0]);
    if (e.key === 'Escape') { hits = []; draw(); }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    close();
    if (document.activeElement !== input && state) input.value = state.preview.match[side].card.cardName || '';
  }, 150));

  $(`${p}cardClear`).addEventListener('click', () => {
    post({ match: { [side]: { card: { cardId: '', cardName: '' } } } });
    input.value = '';
  });
}
for (const [p, side] of SIDES) wireCardSearch(p, side);

// --- browser source URLs: always visible, copy failure never silent ---

$('outputUrl').value = `${location.origin}/output/`;
$('scorebugUrl').value = `${location.origin}/scenes/scorebug/?transparent=1`;
$('cardpopupUrl').value = `${location.origin}/scenes/cardpopup/?transparent=1`;
$('igoUrl').value = `${location.origin}/scenes/igo1v1/?transparent=1`;
$('igo2Url').value = `${location.origin}/scenes/igo2v2/?transparent=1`;
$('igoDualUrl').value = `${location.origin}/scenes/igodual/?transparent=1`;
$('igoBarsUrl').value = `${location.origin}/scenes/igobars/?transparent=1`;
$('povUrl').value = `${location.origin}/scenes/pov/?transparent=1`;
$('decklistUrl').value = `${location.origin}/scenes/decklist/?transparent=1`;

for (const input of document.querySelectorAll('.url-input')) {
  input.addEventListener('focus', () => input.select());
}
for (const btn of document.querySelectorAll('button[data-copy]')) {
  btn.addEventListener('click', async () => {
    const input = $(btn.dataset.copy);
    try {
      await navigator.clipboard.writeText(input.value);
      btn.textContent = 'Copied!';
    } catch {
      // Clipboard can be unavailable (unfocused document, some embeds):
      // select the text and tell the operator what to press.
      input.focus();
      input.select();
      btn.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
  });
}

// --- card search and staging ---

let searchTimer = null;
let results = [];

function renderResults() {
  const list = $('cardResults');
  list.replaceChildren(...results.map((c, i) => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = `/cardart/thumb/${c.cardId}.webp`;
    img.alt = '';
    img.onerror = () => img.classList.add('hidden');
    const meta = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = c.cardName;
    const sub = document.createElement('span');
    sub.textContent = [c.cardType, c.cardId].filter(Boolean).join(' · ');
    meta.append(name, sub);
    li.append(img, meta);
    li.tabIndex = 0;
    li.addEventListener('click', () => stageCard(i));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') stageCard(i); });
    return li;
  }));
  list.classList.toggle('open', results.length > 0);
}

function stageCard(i) {
  const c = results[i];
  if (!c) return;
  // Staging switches the popup on in preview so a single TAKE airs it.
  post({ scenes: { cardpopup: { visible: true, card: { cardId: c.cardId, cardName: c.cardName, cardType: c.cardType } } } });
  results = [];
  renderResults();
  $('cardSearch').value = c.cardName;
}

$('cardSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = $('cardSearch').value.trim();
  if (q.length < 2) { results = []; renderResults(); return; }
  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.indexed) {
        results = [];
        renderResults();
        $('dbStatus').textContent = 'Download the card database in Setup to search cards.';
        return;
      }
      results = data.results;
      renderResults();
    } catch { /* server will come back; search again on next keystroke */ }
  }, 200);
});

// Enter stages the top result: fewest clicks for a solo operator.
$('cardSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && results.length) stageCard(0);
  if (e.key === 'Escape') { results = []; renderResults(); }
});

// --- theme controls ---

async function loadFontList() {
  try {
    const data = await (await fetch('/api/fonts', { cache: 'no-store' })).json();
    const sel = $('fontSelect');
    const current = state?.theme.font || data.active || '';
    sel.replaceChildren(
      Object.assign(document.createElement('option'), { value: '', textContent: 'TES default' }),
      ...data.fonts.map((f) => Object.assign(document.createElement('option'), {
        value: f.family,
        textContent: f.cached ? f.family : `${f.family} (downloads on pick)`,
      })),
    );
    for (const opt of sel.options) {
      if (opt.value) opt.style.fontFamily = `'${opt.value}', sans-serif`;
    }
    sel.value = current;
  } catch { /* retried next poll */ }
}

$('fontSelect').addEventListener('change', async () => {
  const family = $('fontSelect').value;
  if (!family) { post({ theme: { font: '' } }); return; }
  $('fontStatus').textContent = `Getting ${family} ready…`;
  try {
    const res = await (await fetch('/api/fonts/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ family }),
    })).json();
    if (!res.ok) {
      $('fontStatus').textContent = `Could not download ${family}: ${res.error}. Is the internet up?`;
      $('fontSelect').value = state?.theme.font || '';
      return;
    }
    post({ theme: { font: family } });
    $('fontStatus').textContent = `${family} is saved on this computer and works offline.`;
    loadFontList();
  } catch {
    $('fontStatus').textContent = 'Font download failed. Check the connection and try again.';
  }
});

$('logoFile').addEventListener('change', async () => {
  const file = $('logoFile').files[0];
  if (!file) return;
  if (!(await checkUpload(file, LOGO_RULE))) {
    $('logoFile').value = '';
    return;
  }
  const ext = file.name.split('.').pop().toLowerCase().replace('jpeg', 'jpg');
  const res = await fetch(`/api/theme/logo?ext=${encodeURIComponent(ext)}`, {
    method: 'POST',
    body: await file.arrayBuffer(),
  }).then((r) => r.json()).catch(() => ({ ok: false, error: 'upload failed' }));
  if (!res.ok) alert(`Logo upload failed: ${res.error}`);
  $('logoFile').value = '';
});

$('logoRemove').addEventListener('click', () => post({ theme: { logo: '' } }));

$('themeReset').addEventListener('click', () => {
  const cleared = {
    accentA: '', accentB: '',
    colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, ''])),
    background: { kind: '', color: '', color2: '', angle: '', grain: '', dim: '', image: '' },
  };
  if (lookScope === 'global') {
    post({ theme: { accentA: '#11b6fb', accentB: '#1bef19', font: '', logo: '', look: cleared } });
  } else {
    post({ theme: { scenes: { [lookScope]: { ...cleared, enabled: false } } } });
  }
});

// --- card database status and downloads ---

let dbPollTimer = null;

function describeDb(s) {
  if (s.progress.phase === 'index') return 'Downloading the card index…';
  if (s.progress.phase === 'thumbs') return `Downloading card thumbnails: ${s.progress.done} of ${s.progress.total}`;
  if (s.progress.phase === 'full') return `Downloading full card art: ${s.progress.done} of ${s.progress.total}`;
  if (!s.indexed) return 'Not downloaded yet. Card search needs the database: press "Download card database".';
  const bits = [`${s.cardCount} cards`, `${s.thumbsCached} thumbnails saved`];
  if (s.fullCached) bits.push(`${s.fullCached} full art files saved`);
  let text = bits.join(', ') + '.';
  if (s.indexUpdatedAt) {
    const days = Math.floor((Date.now() - Date.parse(s.indexUpdatedAt)) / 86400000);
    text += days < 1 ? ' Card list checked today.' : ` Card list from ${days === 1 ? 'yesterday' : `${days} days ago`}; it refreshes on launch when online.`;
  }
  if (s.progress.lastError) text += ` Last download problem: ${s.progress.lastError}`;
  else if (s.progress.errors) text += ` ${s.progress.errors} files failed last run, run the download again to retry.`;
  return text;
}

async function pollDbStatus() {
  try {
    const s = await (await fetch('/api/cards/status', { cache: 'no-store' })).json();
    // A finished first-run download is what fills the catalogs the pickers read.
    if (s.indexed && !catalogsReady) loadCatalogs();
    $('dbStatus').textContent = describeDb(s);
    const busy = s.progress.phase !== 'idle';
    $('dbSync').disabled = busy;
    $('dbSync').textContent = s.indexed ? 'Check for new sets' : 'Download card database';
    $('dbPrefetchFull').disabled = busy || !s.indexed;
    $('dbProgressWrap').classList.toggle('hidden', !busy || !s.progress.total);
    if (busy && s.progress.total) {
      $('dbProgress').style.width = `${Math.round((s.progress.done / s.progress.total) * 100)}%`;
    }
    clearTimeout(dbPollTimer);
    dbPollTimer = setTimeout(pollDbStatus, busy ? 700 : 5000);
  } catch {
    clearTimeout(dbPollTimer);
    dbPollTimer = setTimeout(pollDbStatus, 3000);
  }
}

$('dbSync').addEventListener('click', async () => {
  await fetch('/api/cards/sync', { method: 'POST' });
  pollDbStatus();
});
$('dbPrefetchFull').addEventListener('click', async () => {
  await fetch('/api/cards/prefetch-full', { method: 'POST' });
  pollDbStatus();
});

pollDbStatus();
loadFontList();

// --- decklist ---
//
// The server owns parsing and name resolution, so the count the operator reads
// here is the same one the plate draws.

let deckTimer = null;
let summarisedList = null;

async function summariseDeck(list) {
  if (!list.trim()) { $('deckSummary').textContent = 'Nothing pasted yet.'; return; }
  try {
    const d = await (await fetch('/api/decklist/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ list }),
    })).json();
    const bits = [`${d.counts.main} main`];
    if (d.counts.sideboard) bits.push(`${d.counts.sideboard} sideboard`);
    if (d.counts.runes) bits.push(`${d.counts.runes} runes`);
    if (d.counts.unresolved) bits.push(`${d.counts.unresolved} not in the card database`);
    $('deckSummary').textContent = bits.join(', ') + '.'
      + (d.warnings.length ? ' ' + d.warnings[0] : '');
  } catch {
    $('deckSummary').textContent = 'Could not read that list.';
  }
}

$('deckList').addEventListener('input', () => {
  clearTimeout(deckTimer);
  const list = $('deckList').value;
  deckTimer = setTimeout(() => {
    // A hand-edited list is no longer the saved deck it may have started as.
    post({ scenes: { decklist: { list, deckName: '' } } });
    summariseDeck(list);
  }, 400);
});

$('deckSideboard').addEventListener('change', () => {
  post({ scenes: { decklist: { showSideboard: $('deckSideboard').checked } } });
});

$('deckBackground').addEventListener('change', () => {
  post({ scenes: { decklist: { background: $('deckBackground').checked } } });
});

$('deckClear').addEventListener('click', () => {
  if (!confirm('Clear the decklist in preview?')) return;
  $('deckList').value = '';
  post({ scenes: { decklist: { list: '', visible: false, deckName: '' } } });
  summariseDeck('');
});

$('deckReplay').addEventListener('click', () => {
  post({ action: 'replay', scene: 'decklist' });
});

// --- saved decks ---
//
// The library is prepared in the deck editor; here each saved deck is one
// click away from preview. Loading never touches program: TAKE airs it, and
// the plate builds in on the swap. The library is not part of the bussed
// state, so it is fetched on its own and refetched when the server announces
// a change.

let library = { version: null, decks: [] };

async function loadDeckLibrary() {
  try {
    const res = await fetch('/api/decklist/library', { cache: 'no-store' });
    if (res.ok) library = await res.json();
    renderDeckLibrary();
  } catch { /* the next announcement or reconnect retries */ }
}

// What a bank's decklist is called: the saved deck it came from, else the
// legend line of the list itself, else a plain description.
function deckLabel(sc) {
  if (!sc.list.trim()) return null;
  if (sc.deckName) return sc.deckName;
  const legend = sc.list.match(/^\s*legend\s*:\s*(.+)$/im);
  return legend ? legend[1].trim() : 'Pasted list';
}

function renderDeckLibrary() {
  if (!state) return;
  const prev = state.preview.scenes.decklist;
  const air = state.program.scenes.decklist;
  $('deckPrevName').textContent = deckLabel(prev) || 'Nothing loaded';
  $('deckAirName').textContent = air.visible && air.list.trim() ? deckLabel(air) : 'Nothing on air';

  const filter = $('deckFilter').value.trim().toLowerCase();
  $('deckFilter').classList.toggle('hidden', library.decks.length < 10);
  const shown = library.decks.filter((d) => !filter || d.name.toLowerCase().includes(filter)
    || (d.player || '').toLowerCase().includes(filter));
  $('deckLibHint').classList.toggle('hidden', library.decks.length > 0);
  $('deckChips').replaceChildren(...shown.map((d) => {
    const chip = document.createElement('span');
    chip.className = 'deck-chip';
    // Matched on the list itself, so an edited copy no longer claims the name.
    chip.classList.toggle('in-preview', prev.list === d.list);
    chip.classList.toggle('on-air', air.visible && air.list === d.list);
    const load = document.createElement('button');
    load.className = 'chip-load';
    load.textContent = d.name;
    load.title = [d.player && `Player: ${d.player}`, d.event && `Event: ${d.event}`, 'Click to load into preview']
      .filter(Boolean).join('\n');
    load.addEventListener('click', () => {
      post({ scenes: { decklist: {
        list: d.list, background: d.background, showSideboard: d.showSideboard, deckName: d.name,
      } } });
    });
    const del = document.createElement('button');
    del.className = 'chip-del';
    del.textContent = '×';
    del.title = `Delete "${d.name}" from the saved decks`;
    del.addEventListener('click', async () => {
      if (!confirm(`Delete the saved deck "${d.name}"? Preview and program keep what they show.`)) return;
      await fetch('/api/decklist/library', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ remove: d.name }),
      }).catch(() => {});
      loadDeckLibrary();
    });
    chip.append(load, del);
    return chip;
  }));
}

$('deckFilter').addEventListener('input', renderDeckLibrary);
loadDeckLibrary();

$('toggleDeck').addEventListener('click', () => {
  if (!state) return;
  post({ scenes: { decklist: { visible: !state.preview.scenes.decklist.visible } } });
});

// --- update channel ---
//
// The launch prompt in the app's own window is the main path; this banner is
// the second chance, so a skipped update can be taken between matches instead
// of waiting for the next restart. Polling is slow on purpose: the answer
// only changes when a release is published.

const NEWLINE = String.fromCharCode(10);
let updateInfo = null;
let updatePollTimer = null;

function renderUpdate(u) {
  updateInfo = u;
  $('versionLine').textContent = `Sideways Studio ${u.currentVersion}`
    + (u.phase === 'disabled' ? ' (running from source, updates are off)' : '');
  $('updateCheck').disabled = u.phase === 'disabled' || u.phase === 'checking';

  const busy = u.phase === 'downloading' || u.phase === 'verifying' || u.phase === 'ready';
  const show = u.phase === 'available' || busy || u.phase === 'error';
  $('updateBar').classList.toggle('hidden', !show);
  if (!show) return;

  if (u.phase === 'error') {
    $('updateHeadline').textContent = 'Update failed';
    $('updateNotes').textContent = u.error || '';
    $('updateProgress').textContent = '';
  } else if (busy) {
    $('updateHeadline').textContent = u.phase === 'ready'
      ? 'Update ready, restarting'
      : `Downloading ${u.version}`;
    $('updateNotes').textContent = u.phase === 'ready'
      ? 'The app closes and reopens on its own. Your browser sources reconnect.'
      : '';
    $('updateProgress').textContent = u.phase === 'verifying' ? 'checking the download' : `${u.progress}%`;
  } else {
    $('updateHeadline').textContent = u.required
      ? `Required update: ${u.currentVersion} to ${u.version}`
      : `Update available: ${u.currentVersion} to ${u.version}`;
    $('updateNotes').textContent = (u.notes || '').split(NEWLINE)[0];
    $('updateProgress').textContent = '';
  }
  $('updateInstall').disabled = busy;
  $('updateInstall').textContent = u.phase === 'error' ? 'Try again' : 'Install and restart';
  // A required release has no skip: that is the point of marking one.
  $('updateSkip').classList.toggle('hidden', busy || u.required || u.phase === 'error');
}

async function pollUpdate(interval = 300000) {
  try {
    renderUpdate(await (await fetch('/api/update/status', { cache: 'no-store' })).json());
  } catch { /* the app may be restarting into the new version */ }
  clearTimeout(updatePollTimer);
  const fast = updateInfo && ['downloading', 'verifying', 'checking'].includes(updateInfo.phase);
  updatePollTimer = setTimeout(() => pollUpdate(interval), fast ? 500 : interval);
}

$('updateCheck').addEventListener('click', async () => {
  $('updateCheck').disabled = true;
  $('updateCheck').textContent = 'Checking…';
  try {
    const u = await (await fetch('/api/update/check', { method: 'POST' })).json();
    renderUpdate(u);
    if (u.phase === 'uptodate') $('versionLine').textContent = `Sideways Studio ${u.currentVersion}, up to date`;
    else if (u.error) $('versionLine').textContent = `Sideways Studio ${u.currentVersion}, could not reach the update server`;
  } catch { /* leave the line as it was */ }
  $('updateCheck').textContent = 'Check for updates';
  $('updateCheck').disabled = false;
  pollUpdate();
});

$('updateInstall').addEventListener('click', async () => {
  if (!confirm('Install the update now? The graphics stop while the app restarts, so do this between matches.')) return;
  $('updateInstall').disabled = true;
  await fetch('/api/update/install', { method: 'POST' }).catch(() => {});
  pollUpdate();
});

$('updateSkip').addEventListener('click', async () => {
  await fetch('/api/update/skip', { method: 'POST' }).catch(() => {});
  pollUpdate();
});

pollUpdate();

// --- sync: same contract as the stage client ---

let version = -1;

function apply(s) {
  if (!s || !Number.isInteger(s.version) || s.version <= version) return;
  version = s.version;
  render(s);
}

async function fullFetch() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (res.ok) { apply(await res.json()); setStatus(true); }
  } catch {
    setStatus(false);
  }
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') apply(msg.state);
      else if (msg.type === 'library' && msg.version !== library.version) loadDeckLibrary();
    } catch { /* ignore */ }
  };
  ws.onopen = () => { setStatus(true); fullFetch(); loadDeckLibrary(); };
  ws.onclose = () => { setStatus(false); setTimeout(connect, 1500); };
  ws.onerror = () => ws.close();
}

fullFetch();
connect();
