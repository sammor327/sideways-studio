// Deck editor: paste, check, fix, save, export. Prep work for an event, kept
// off the control panel so the panel stays a live surface.
//
// The textarea is the single source of truth. The structured view is a lens
// on the parse of that text, and its edits (quantity steppers, did-you-mean
// fixes) serialize back into the textarea through the canonical format, so
// the two can never disagree and an undo is always "fix the text". Name
// resolution comes from the server, cached here by the name as typed, so a
// quantity change never refetches.
import {
  checkLegality, deckNames, parseDecklist, serializeDecklist, RUNE_DOMAINS,
} from '/shared/decklist-format.js';
import { setOffline } from '/shared/offline.js';

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'sidewaysStudio.deckEditor.v1';

const EXAMPLE = `Legend: Diana, Scorn of the Moon
Champion: Diana, Lunari

Battlefields:
Rockfall Path
Veiled Temple
Abandoned Hall

Runes:
7 Chaos
5 Mind

Main:
3 Stupefy
3 Ravenbloom Student
3 Ride the Wind
3 Stacked Deck
3 Tideturner
3 Hwei, Brooding Painter
3 Moonfall
3 Patched Porobot
3 Temporal Breach
3 Swain, Visionary
2 Gust
2 Morbid Return
2 Fizz, Trickster
2 Star-Crossed
1 Eclipse

Sideboard:
2 Abandon
2 Kha'Zix, Mutating Horror
2 Ravenbloom Prefect
1 Decree of Insight
1 Vex, Apathetic
`;

let text = '';
let background = true;
let showSideboard = true;

// Resolution cache, keyed by the name exactly as typed.
const known = new Map();      // raw -> card info | null
const fixes = new Map();      // raw -> [suggested names]
let resolving = false;
let resolveError = null;
let resolveSeq = 0;

let exportAvailable = null;
let rendering = false;
let exportRun = null;
let library = { version: null, decks: [] };
let studio = null;

// --- draft persistence: a closed tab or a crash keeps the work ---------------

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!d) return;
    text = typeof d.text === 'string' ? d.text : '';
    background = d.background !== false;
    showSideboard = d.showSideboard !== false;
    $('saveName').value = typeof d.name === 'string' ? d.name : '';
  } catch { /* storage unavailable: start empty */ }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, background, showSideboard, name: $('saveName').value }));
  } catch { /* storage unavailable: the textarea still holds the work */ }
}

// --- small helpers -----------------------------------------------------------

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setStatusLine(id, message, tone = '') {
  const node = $(id);
  node.textContent = message;
  node.classList.toggle('bad', tone === 'bad');
  node.classList.toggle('good', tone === 'good');
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function currentDeck() {
  return parseDecklist(text);
}

const hasContent = (deck) => deck.main.length > 0 || Boolean(deck.legend);

function autoName(deck) {
  if (!deck.legend) return 'Untitled';
  const hit = known.get(deck.legend);
  return (hit ? hit.name : deck.legend).split(',')[0].trim() || 'Untitled';
}

function nameState(deck) {
  const names = deckNames(deck);
  return {
    names,
    pending: names.filter((n) => !known.has(n)),
    unresolved: names.filter((n) => known.get(n) === null),
  };
}

// --- the text: every change funnels through here -----------------------------

function setText(value, { fromTextarea = false } = {}) {
  text = value;
  if (!fromTextarea) $('text').value = value;
  saveDraft();
  renderEditor();
  scheduleResolve();
  schedulePreview();
}

// A structured edit: parse, change, write back the canonical text.
function update(fn) {
  const deck = currentDeck();
  fn(deck);
  setText(serializeDecklist(deck));
}

function rename(from, to) {
  update((d) => {
    if (d.legend === from) d.legend = to;
    if (d.champion === from) d.champion = to;
    d.battlefields = d.battlefields.map((b) => (b === from ? to : b));
    for (const list of [d.main, d.sideboard]) {
      for (const e of list) if (e.name === from) e.name = to;
    }
  });
}

// --- resolution --------------------------------------------------------------

let resolveTimer = null;
function scheduleResolve() {
  clearTimeout(resolveTimer);
  const { pending } = nameState(currentDeck());
  if (!pending.length) return;
  resolveTimer = setTimeout(resolveNow, 300);
}

// "Check for new sets" from inside the editor: the same sync the panel's
// Setup card runs, then every name is looked up again. The button reports
// progress in place so a slow venue connection is not mistaken for a hang.
let refreshing = false;
async function refreshCardDb(button) {
  if (refreshing) return;
  refreshing = true;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    const started = await (await fetch('/api/cards/sync', { method: 'POST' })).json();
    if (!started.ok) throw new Error(started.error || 'could not start');
    for (let i = 0; i < 600; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      const s = await (await fetch('/api/cards/status', { cache: 'no-store' })).json();
      if (s.progress.phase === 'idle') {
        // A failed check is not a fault for anyone but the person who runs the
        // card database: it is private, and everyone else's cards came with
        // the app and still work. Nothing to report to them (Sam, 2026-09-17).
        if (s.progress.lastError && !(s.indexed && s.library && s.library.bundled)) {
          throw new Error(s.progress.lastError);
        }
        break;
      }
      button.textContent = s.progress.total > 1 ? `Downloading ${s.progress.done} of ${s.progress.total}…` : 'Checking…';
    }
    known.clear();
    fixes.clear();
    await resolveNow();
  } catch (err) {
    alert(`Could not check for new sets: ${err.message}. Is the internet up?`);
  } finally {
    refreshing = false;
    button.disabled = false;
    button.textContent = label;
  }
}

// The preview keeps 16:9 inside whatever height the column leaves it, so the
// action row below it never drops off a 1080p window. A CSS aspect-ratio box
// yields to width, not height, hence the measurement here. In the small
// window layout (page scroll) the frame just runs full width.
const previewWrap = $('previewWrap');
const previewFrame = $('previewFrame');
function fitPreview() {
  const stacked = matchMedia('(max-width: 1200px), (max-height: 760px)').matches;
  if (stacked) {
    previewFrame.style.width = '';
    previewFrame.style.height = '';
    return;
  }
  const w = previewWrap.clientWidth;
  const h = previewWrap.clientHeight;
  if (!w || !h) return;
  const fw = Math.floor(Math.min(w, (h * 16) / 9));
  previewFrame.style.width = `${fw}px`;
  previewFrame.style.height = `${Math.floor((fw * 9) / 16)}px`;
}
window.addEventListener('resize', fitPreview);
if ('ResizeObserver' in window) new ResizeObserver(fitPreview).observe(previewWrap);
fitPreview();

async function resolveNow() {
  const seq = ++resolveSeq;
  const sent = text;
  resolving = true;
  resolveError = null;
  renderStatus();
  try {
    const res = await post('/api/decklist/parse', { list: sent });
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    const data = await res.json();
    for (const [raw, info] of Object.entries(data.resolved)) known.set(raw, info);
    for (const [raw, list] of Object.entries(data.suggestions)) fixes.set(raw, list);
  } catch (err) {
    resolveError = `Could not check names: ${err.message}.`;
  } finally {
    if (seq === resolveSeq) resolving = false;
  }
  renderEditor();
  // Typing during the round trip can leave newer names unchecked.
  if (text !== sent) scheduleResolve();
}

// --- rendering the editor ----------------------------------------------------

function renderStatus() {
  const deck = currentDeck();
  const { names, pending, unresolved } = nameState(deck);
  let message = 'Waiting for a list.';
  let tone = '';
  if (resolveError) { message = resolveError; tone = 'bad'; }
  else if (!names.length) message = 'Waiting for a list.';
  else if (unresolved.length) {
    message = `${plural(unresolved.length, 'name')} not in the card database: pick a fix below to unlock GENERATE PNG. `
      + 'Brand-new cards need "Check for new sets" in the control panel\'s Setup card.';
    tone = 'bad';
  } else if (pending.length || resolving) message = `Checking ${plural(pending.length || names.length, 'name')}…`;
  else { message = `All ${plural(names.length, 'name')} found.`; tone = 'good'; }
  setStatusLine('resolveStatus', message, tone);
}

function nameSpan(raw) {
  const span = document.createElement('span');
  const info = known.get(raw);
  span.className = 's-name';
  if (info === undefined) span.classList.add('pending');
  if (info === null) span.classList.add('bad');
  span.textContent = info ? info.name : raw;
  return span;
}

// Did-you-mean chips under an unresolved name; each rewrites the text.
function fixRow(raw) {
  if (known.get(raw) !== null) return null;
  const row = document.createElement('div');
  row.className = 'fixes';
  const options = fixes.get(raw) || [];
  if (!options.length) {
    const none = document.createElement('span');
    none.className = 'none';
    none.textContent = 'No close match in the card database. A card from a newer set?';
    const refresh = document.createElement('button');
    refresh.textContent = 'Check for new sets';
    refresh.title = 'Download the latest card list from Rift Registry, then check this list again';
    refresh.addEventListener('click', () => refreshCardDb(refresh));
    row.append(none, refresh);
  }
  for (const option of options) {
    const b = document.createElement('button');
    b.textContent = `→ ${option}`;
    b.title = `Replace "${raw}" with "${option}"`;
    b.addEventListener('click', () => rename(raw, option));
    row.append(b);
  }
  return row;
}

function labelRow(tag, raw) {
  const frag = document.createDocumentFragment();
  const row = document.createElement('div');
  row.className = 's-row';
  const t = document.createElement('span');
  t.className = 'tag';
  t.textContent = tag;
  row.append(t, nameSpan(raw));
  frag.append(row);
  const f = fixRow(raw);
  if (f) frag.append(f);
  return frag;
}

function sectionEl(title) {
  const sec = document.createElement('div');
  sec.className = 's-section';
  const label = document.createElement('div');
  label.className = 's-label';
  label.textContent = title;
  sec.append(label);
  return sec;
}

function qtyRow(section, entry) {
  const frag = document.createDocumentFragment();
  const row = document.createElement('div');
  row.className = 's-row';
  const step = document.createElement('span');
  step.className = 'step';
  const minus = document.createElement('button');
  minus.textContent = '−';
  minus.title = entry.qty <= 1 ? 'Remove this card' : 'One fewer';
  minus.addEventListener('click', () => update((d) => {
    const list = d[section];
    const e = list.find((x) => x.name === entry.name);
    if (!e) return;
    if (e.qty <= 1) d[section] = list.filter((x) => x !== e);
    else e.qty -= 1;
  }));
  const out = document.createElement('output');
  out.textContent = entry.qty;
  const plus = document.createElement('button');
  plus.textContent = '+';
  plus.title = 'One more';
  plus.addEventListener('click', () => update((d) => {
    const e = d[section].find((x) => x.name === entry.name);
    if (e) e.qty += 1;
  }));
  step.append(minus, out, plus);
  row.append(step, nameSpan(entry.name));
  frag.append(row);
  const f = fixRow(entry.name);
  if (f) frag.append(f);
  return frag;
}

function renderStructured(deck) {
  const box = $('structured');
  box.classList.toggle('hidden', !hasContent(deck));
  if (!hasContent(deck)) { box.replaceChildren(); return; }
  const parts = [];
  if (deck.legend || deck.champion) {
    const sec = sectionEl('Identity');
    if (deck.legend) sec.append(labelRow('LEGEND', deck.legend));
    if (deck.champion) sec.append(labelRow('CHAMPION', deck.champion));
    parts.push(sec);
  }
  if (deck.battlefields.length) {
    const sec = sectionEl(`Battlefields · ${deck.battlefields.length}`);
    deck.battlefields.forEach((b) => sec.append(labelRow('', b)));
    parts.push(sec);
  }
  if (deck.runes.length) {
    const sec = sectionEl(`Runes · ${deck.runes.reduce((t, [, n]) => t + n, 0)}`);
    const line = document.createElement('div');
    line.className = 'runes-line';
    for (const [domain, n] of deck.runes) {
      const s = document.createElement('span');
      s.textContent = `${n} ${domain}`;
      if (!RUNE_DOMAINS.some((d) => d.toLowerCase() === domain.toLowerCase())) s.className = 'bad';
      line.append(s);
    }
    sec.append(line);
    parts.push(sec);
  }
  for (const [section, title] of [['main', 'Main'], ['sideboard', 'Sideboard']]) {
    if (!deck[section].length) continue;
    const sec = sectionEl(`${title} · ${deck[section].reduce((t, e) => t + e.qty, 0)}`);
    for (const e of deck[section]) sec.append(qtyRow(section, e));
    parts.push(sec);
  }
  box.replaceChildren(...parts);
}

function renderWarnings(deck) {
  const warnings = [...deck.warnings, ...checkLegality(deck)];
  $('warnings').replaceChildren(...warnings.map((w) => {
    const li = document.createElement('li');
    li.textContent = w;
    return li;
  }));
}

function renderButtons(deck = currentDeck()) {
  const { pending, unresolved } = nameState(deck);
  const content = hasContent(deck);
  $('generate').disabled = !content || pending.length > 0 || unresolved.length > 0
    || rendering || Boolean(exportRun) || exportAvailable === false;
  $('generate').textContent = rendering ? 'RENDERING…' : 'GENERATE PNG';
  $('toPreview').disabled = !content;
  $('save').disabled = !content;
  $('copyUrl').disabled = !content;
  $('saveName').placeholder = `Save as: ${autoName(deck)}`;
  $('exportAll').disabled = !library.decks.length || Boolean(exportRun) || rendering || exportAvailable === false;
  $('exportCancel').classList.toggle('hidden', !exportRun);
}

function renderEditor() {
  const deck = currentDeck();
  renderStatus();
  renderStructured(deck);
  renderWarnings(deck);
  renderButtons(deck);
  renderLibrary();
}

// --- live preview: the scene itself, in an iframe, fed by postMessage --------

const frame = $('preview');
let frameReady = false;
let previewTimer = null;

function pushPreview() {
  if (!frameReady || !frame.contentWindow) return;
  frame.contentWindow.postMessage({ type: 'decklist:show', list: text, background, showSideboard }, location.origin);
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(pushPreview, 250);
}

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data || e.data.type !== 'decklist:ready') return;
  frameReady = true;
  pushPreview();
});
frame.addEventListener('load', () => { frameReady = true; pushPreview(); });
frame.src = '/scenes/decklist/?embed=1&transparent=1';

function applyDisplayToggles() {
  $('transparent').checked = !background;
  $('hideSideboard').checked = !showSideboard;
  $('previewFrame').classList.toggle('alpha', !background);
}

// --- actions -----------------------------------------------------------------

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function filenameFrom(disposition) {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
  if (m) { try { return decodeURIComponent(m[1]); } catch { /* fall through */ } }
  const plain = /filename="([^"]+)"/i.exec(disposition || '');
  return plain ? plain[1] : 'decklist-1920x1080.png';
}

async function renderPng(body) {
  const res = await post('/api/decklist/render', body);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error((err && err.error) || `the server answered ${res.status}`);
  }
  return {
    blob: await res.blob(),
    filename: filenameFrom(res.headers.get('content-disposition')),
    saved: decodeURIComponent(res.headers.get('x-output-path') || ''),
  };
}

$('generate').addEventListener('click', async () => {
  rendering = true;
  renderButtons();
  setStatusLine('actionStatus', 'Rendering the PNG. The first one of a session takes a few seconds while the hidden browser starts.');
  try {
    const out = await renderPng({ list: text, background, showSideboard, name: $('saveName').value.trim() });
    downloadBlob(out.blob, out.filename);
    setStatusLine('actionStatus', `Downloaded ${out.filename}${out.saved ? `, and saved to ${out.saved}` : ''}.`, 'good');
  } catch (err) {
    setStatusLine('actionStatus', `PNG export failed: ${err.message}.`, 'bad');
  } finally {
    rendering = false;
    renderButtons();
  }
});

async function sendToPreview(deck) {
  try {
    const res = await post('/api/update', { scenes: { decklist: {
      list: deck.list, background: deck.background, showSideboard: deck.showSideboard, deckName: deck.name,
    } } });
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    setStatusLine('actionStatus', `"${deck.name || 'This list'}" is in the control panel's preview. Switch the Decklist graphic on there and press TAKE to air it.`, 'good');
  } catch (err) {
    setStatusLine('actionStatus', `Could not load it into preview: ${err.message}.`, 'bad');
  }
}

$('toPreview').addEventListener('click', () => {
  sendToPreview({ list: text, background, showSideboard, name: $('saveName').value.trim() || autoName(currentDeck()) });
});

$('save').addEventListener('click', async () => {
  const name = $('saveName').value.trim() || autoName(currentDeck());
  const clash = library.decks.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (clash && clash.list !== text && !confirm(`Replace the saved deck "${clash.name}" with this list?`)) return;
  try {
    const res = await post('/api/decklist/library', { save: { name, list: text, background, showSideboard } });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    $('saveName').value = name;
    saveDraft();
    library = data.library;
    renderEditor();
    setStatusLine('actionStatus', `Saved as "${name}". It is one click away in the control panel's Decklist card.`, 'good');
  } catch (err) {
    setStatusLine('actionStatus', `Could not save: ${err.message}.`, 'bad');
  }
});

$('copyUrl').addEventListener('click', async () => {
  // The whole list rides in the URL, so this browser source needs neither
  // the panel nor the bus: it always shows this one deck.
  const params = new URLSearchParams({
    transparent: '1', bg: background ? '1' : '0', sideboard: showSideboard ? '1' : '0', list: text,
  });
  const url = `${location.origin}/scenes/decklist/?${params}`;
  try {
    await navigator.clipboard.writeText(url);
    setStatusLine('actionStatus', 'Stream URL copied. Add it to OBS or vMix as a 1920 × 1080 browser source.', 'good');
  } catch {
    window.prompt('Copy this browser-source URL (Ctrl+C):', url);
  }
});

$('saveName').addEventListener('input', () => { saveDraft(); renderLibrary(); });

$('text').addEventListener('input', () => setText($('text').value, { fromTextarea: true }));

$('transparent').addEventListener('change', () => {
  background = !$('transparent').checked;
  applyDisplayToggles();
  saveDraft();
  pushPreview();
});
$('hideSideboard').addEventListener('change', () => {
  showSideboard = !$('hideSideboard').checked;
  applyDisplayToggles();
  saveDraft();
  pushPreview();
});
$('playIntro').addEventListener('click', () => {
  if (frameReady) frame.contentWindow.postMessage({ type: 'decklist:intro' }, location.origin);
});

function confirmDiscard() {
  if (!text.trim() || library.decks.some((d) => d.list === text)) return true;
  return confirm('Replace the list in the editor? It has not been saved.');
}

$('loadExample').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  $('saveName').value = '';
  setText(EXAMPLE);
});
$('newDeck').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  $('saveName').value = '';
  setText('');
});

// --- saved decks -------------------------------------------------------------

async function loadLibrary() {
  try {
    const res = await fetch('/api/decklist/library', { cache: 'no-store' });
    if (res.ok) library = await res.json();
  } catch { /* retried on the next announcement or reconnect */ }
  renderEditor();
}

function filteredLibrary() {
  const f = $('libFilter').value.trim().toLowerCase();
  return library.decks.filter((d) => !f || d.name.toLowerCase().includes(f)
    || (d.player || '').toLowerCase().includes(f) || (d.event || '').toLowerCase().includes(f));
}

function renderLibrary() {
  const decks = filteredLibrary();
  const total = library.decks.length;
  $('libCount').textContent = total ? `${decks.length === total ? total : `${decks.length} of ${total}`}` : '';
  $('libHint').classList.toggle('hidden', total > 0);
  const editingName = ($('saveName').value.trim() || '').toLowerCase();
  const prev = studio && studio.preview.scenes.decklist;
  const air = studio && studio.program.scenes.decklist;
  $('libChips').replaceChildren(...decks.map((d) => {
    const chip = document.createElement('span');
    chip.className = 'lib-chip';
    chip.classList.toggle('editing', d.name.toLowerCase() === editingName);
    chip.classList.toggle('in-preview', Boolean(prev && prev.list === d.list));
    chip.classList.toggle('on-air', Boolean(air && air.visible && air.list === d.list));
    const name = document.createElement('button');
    name.className = 'chip-name';
    name.textContent = d.name;
    name.title = [d.player && `Player: ${d.player}`, d.event && `Event: ${d.event}`, 'Click to edit'].filter(Boolean).join('\n');
    name.addEventListener('click', () => {
      if (!confirmDiscard()) return;
      background = d.background;
      showSideboard = d.showSideboard;
      applyDisplayToggles();
      $('saveName').value = d.name;
      setText(d.list);
      pushPreview();
    });
    const send = document.createElement('button');
    send.className = 'chip-send';
    send.textContent = '▶';
    send.title = 'Load into the control panel\'s preview';
    send.addEventListener('click', () => sendToPreview(d));
    const del = document.createElement('button');
    del.className = 'chip-del';
    del.textContent = '×';
    del.title = `Delete "${d.name}"`;
    del.addEventListener('click', async () => {
      if (!confirm(`Delete the saved deck "${d.name}"?`)) return;
      await post('/api/decklist/library', { remove: d.name }).catch(() => {});
      loadLibrary();
    });
    chip.append(name, send, del);
    return chip;
  }));
}

$('libFilter').addEventListener('input', renderLibrary);

// A co-stream "Deck List Database" sheet: every deck column becomes a saved
// deck, with the same resolution report the editor gives a single paste.
$('csvFile').addEventListener('change', async () => {
  const file = $('csvFile').files[0];
  $('csvFile').value = '';
  if (!file) return;
  setStatusLine('libStatus', `Reading ${file.name}…`);
  let data;
  try {
    const res = await fetch('/api/decklist/csv', {
      method: 'POST', headers: { 'content-type': 'text/csv' }, body: await file.text(),
    });
    data = await res.json();
    if (!data.ok) throw new Error(data.error);
  } catch (err) {
    setStatusLine('libStatus', `Could not read that sheet: ${err.message}`, 'bad');
    return;
  }
  // Two columns named "Viktor" become "Viktor" and "Viktor 2".
  const seen = new Map();
  const decks = data.decks.map((d) => {
    const base = d.name.slice(0, 56);
    const count = (seen.get(base.toLowerCase()) || 0) + 1;
    seen.set(base.toLowerCase(), count);
    return { ...d, name: count === 1 ? base : `${base} ${count}` };
  });
  if (!decks.length) {
    setStatusLine('libStatus', 'That sheet has no deck columns with a name and a list.', 'bad');
    return;
  }
  const clashes = decks.filter((d) => library.decks.some((x) => x.name.toLowerCase() === d.name.toLowerCase()));
  if (!confirm(`Import ${plural(decks.length, 'deck')} from ${file.name} into saved decks?`
    + (clashes.length ? ` ${plural(clashes.length, 'saved deck')} with the same name will be replaced.` : ''))) {
    setStatusLine('libStatus', 'Import cancelled.');
    return;
  }
  try {
    const res = await post('/api/decklist/library', {
      import: decks.map((d) => ({ name: d.name, list: d.list, event: d.event, player: d.player, background: true, showSideboard: true })),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error);
    library = out.library;
  } catch (err) {
    setStatusLine('libStatus', `Import failed: ${err.message}`, 'bad');
    return;
  }
  const problems = decks.filter((d) => d.unresolved.length);
  setStatusLine('libStatus', `Imported ${plural(decks.length, 'deck')}.`
    + (problems.length ? ` ${plural(problems.length, 'deck')} name cards the database does not know; the report below lists them with the closest match.` : ' Every name was found.'),
  problems.length ? 'bad' : 'good');
  showReport(`Import report: ${file.name}`, decks);
  renderEditor();
});

function showReport(title, decks) {
  $('reportTitle').textContent = title;
  // Problems first: those are the ones someone has to look at.
  const ordered = [...decks].sort((a, b) => (b.unresolved.length - a.unresolved.length) || (b.warnings.length - a.warnings.length));
  $('reportList').replaceChildren(...ordered.map((d) => {
    const li = document.createElement('li');
    const head = document.createElement('span');
    head.className = d.unresolved.length ? 'bad' : 'ok';
    head.textContent = `${d.unresolved.length ? '✗' : '✓'} ${d.name}`;
    li.append(head);
    const who = [d.player, d.event].filter(Boolean).join(', ');
    li.append(` ${who ? `(${who}) ` : ''}${d.counts.main} main, ${d.counts.runes} runes`);
    for (const u of d.unresolved) {
      const line = document.createElement('div');
      line.className = 'bad';
      line.textContent = `   not found: "${u.name}"${u.closest ? `, closest: ${u.closest}` : ''}`;
      li.append(line);
    }
    for (const w of d.warnings) {
      const line = document.createElement('div');
      line.className = 'warn';
      line.textContent = `   ${w}`;
      li.append(line);
    }
    return li;
  }));
  $('report').classList.remove('hidden');
}
$('reportClose').addEventListener('click', () => $('report').classList.add('hidden'));

// Render every saved deck (or the filtered set) to PNG, one at a time, each
// with its own background and sideboard settings.
$('exportAll').addEventListener('click', async () => {
  const decks = filteredLibrary();
  if (!decks.length) return;
  if (!confirm(`Render ${plural(decks.length, 'saved deck')} to PNG? Files go to the app's data/decklist/batch folder and replace earlier exports of the same deck.`)) return;
  exportRun = { cancelled: false };
  renderButtons();
  const failed = [];
  let lastSaved = '';
  let done = 0;
  for (const d of decks) {
    if (exportRun.cancelled) break;
    setStatusLine('libStatus', `Exporting ${done + 1} of ${decks.length}: ${d.name}…`);
    try {
      const out = await renderPng({ list: d.list, background: d.background, showSideboard: d.showSideboard, name: d.name, batch: true });
      lastSaved = out.saved || lastSaved;
    } catch (err) {
      failed.push(`${d.name} (${err.message})`);
    }
    done += 1;
  }
  const cancelled = exportRun.cancelled;
  exportRun = null;
  const folder = lastSaved ? lastSaved.replace(/[\\/][^\\/]*$/, '') : 'data/decklist/batch';
  setStatusLine('libStatus', `${cancelled ? 'Stopped. ' : ''}Exported ${done - failed.length} of ${decks.length} to ${folder}.`
    + (failed.length ? ` Failed: ${failed.join('; ')}.` : ''), failed.length ? 'bad' : 'good');
  renderButtons();
});
$('exportCancel').addEventListener('click', () => { if (exportRun) exportRun.cancelled = true; });

// --- connection: status, library announcements, and the banks for chip marks -

function setConnected(ok) {
  $('statusDot').classList.toggle('ok', ok);
  $('statusText').textContent = ok ? 'connected' : 'disconnected';
  // The app is closed: saves, checks and exports all go through it, so the
  // page says so until the reconnect loop gets through.
  setOffline(!ok);
}

function connect() {
  let ws;
  try { ws = new WebSocket(`ws://${location.host}/ws`); } catch { setTimeout(connect, 2000); return; }
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') { studio = msg.state; renderLibrary(); }
      else if (msg.type === 'library' && msg.version !== library.version) loadLibrary();
    } catch { /* ignore malformed frames */ }
  };
  ws.onopen = () => { setConnected(true); loadLibrary(); };
  ws.onclose = () => { setConnected(false); setTimeout(connect, 1500); };
  ws.onerror = () => ws.close();
}

async function checkExport() {
  try {
    const data = await (await fetch('/api/decklist/export', { cache: 'no-store' })).json();
    exportAvailable = data.available;
  } catch { exportAvailable = null; }
  if (exportAvailable === false) {
    setStatusLine('actionStatus', 'PNG export needs Microsoft Edge or Google Chrome on this computer. Everything else works without it.', 'bad');
  }
  renderButtons();
}

loadDraft();
$('text').value = text;
applyDisplayToggles();
renderEditor();
scheduleResolve();
connect();
checkExport();
