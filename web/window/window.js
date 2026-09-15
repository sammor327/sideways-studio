// The app window.
//
// Everything here is the same local API the control panel uses; this page is
// the one the operator meets first. Three jobs: say what the app is doing
// (status rail, console), hand over the URLs OBS needs (source rail), and get
// out of the way of the control panel (the big button).
//
// The console pane is the app's stdout, bussed over the WebSocket as
// ?role=window. That connection doubles as the window reporting for duty:
// until it lands the server is holding a timeout, and if it never lands the
// console window comes back so the operator is not left with nothing.
import { ALL_SOURCES } from '../shared/sources.js';

const $ = (id) => document.getElementById(id);
const BASE = location.origin;
const MAX_LOG_LINES = 500;

let appStatus = { version: '', port: 0, dataDir: '' };
let installing = false;

const post = async (path, body) => {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'the app is not answering' };
  }
};

const getJson = async (path) => {
  try {
    return await (await fetch(path, { cache: 'no-store' })).json();
  } catch {
    return null;
  }
};

// --- opening things ---------------------------------------------------------

// Never a plain link: a link clicked in here opens inside this window's own
// browser profile, which is not the operator's browser and closes with the
// app. The server hands the URL to Windows instead.
const open = (target) => post('/api/app/open', { target });

for (const btn of document.querySelectorAll('[data-open]')) {
  btn.addEventListener('click', () => open(btn.dataset.open));
}
$('openData').addEventListener('click', () => open('data'));

// --- browser sources --------------------------------------------------------

function renderSources() {
  const list = $('sourceList');
  list.replaceChildren(...ALL_SOURCES.map((source) => {
    const li = document.createElement('li');
    const url = `${BASE}${source.path}`;

    const label = document.createElement('span');
    label.className = 'src-label';
    label.textContent = source.label;

    const input = document.createElement('input');
    input.className = 'src-url';
    input.readOnly = true;
    input.value = url;

    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        copy.textContent = 'Copied!';
      } catch {
        // Clipboard can be refused while the window is not focused: select the
        // text and say what to press instead.
        input.focus();
        input.select();
        copy.textContent = 'Ctrl+C';
      }
      setTimeout(() => { copy.textContent = 'Copy'; }, 1400);
    });

    const show = document.createElement('button');
    show.textContent = 'Open';
    show.title = 'Open this graphic in your browser to check it';
    show.addEventListener('click', () => open(source.key));

    const line = document.createElement('div');
    line.className = 'src-line';
    line.append(input, copy, show);
    li.append(label, line);
    return li;
  }));
}

// --- console ----------------------------------------------------------------

const logEl = $('log');
const follow = $('follow');
const stamp = (t) => new Date(t).toLocaleTimeString([], { hour12: false });

let lastStamp = '';

function appendLines(lines) {
  if (!lines || !lines.length) return;
  const frag = document.createDocumentFragment();
  for (const entry of lines) {
    const li = document.createElement('li');
    li.className = entry.level + (entry.text.trim() ? '' : ' blank');
    if (entry.text.trim()) {
      const at = stamp(entry.t);
      const time = document.createElement('time');
      // A banner arrives as twenty lines in the same second; printing the
      // clock twenty times reads as noise and buries the text.
      time.textContent = at === lastStamp ? '' : at;
      lastStamp = at;
      const text = document.createElement('span');
      text.textContent = entry.text;
      li.append(time, text);
    }
    frag.append(li);
  }
  logEl.append(frag);
  while (logEl.childElementCount > MAX_LOG_LINES) logEl.firstElementChild.remove();
  if (follow.checked) logEl.scrollTop = logEl.scrollHeight;
}

// Scrolling up is the operator reading something; do not yank them back down.
// Only their own scrolling counts: the pane also moves when the update bar
// appears or the window is resized, and following the log should not quietly
// switch itself off because the layout shifted.
let userScrolling = false;
let userScrollTimer = null;
const markUserScroll = () => {
  userScrolling = true;
  clearTimeout(userScrollTimer);
  userScrollTimer = setTimeout(() => { userScrolling = false; }, 1500);
};
for (const evt of ['wheel', 'mousedown', 'keydown', 'touchstart']) {
  logEl.addEventListener(evt, markUserScroll, { passive: true });
}
logEl.addEventListener('scroll', () => {
  const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 24;
  if (atBottom) follow.checked = true;
  else if (userScrolling) follow.checked = false;
});

$('copyLog').addEventListener('click', async () => {
  const text = [...logEl.children].map((li) => li.textContent).join('\n');
  const btn = $('copyLog');
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied!';
  } catch {
    btn.textContent = 'Could not copy';
  }
  setTimeout(() => { btn.textContent = 'Copy log'; }, 1400);
});

// --- card database ----------------------------------------------------------

const PHASE_LABEL = {
  index: 'Reading the set list',
  thumb: 'Downloading card art',
  full: 'Downloading full-size art',
};

async function pollCards() {
  const s = await getJson('/api/cards/status');
  let next = 15_000;
  if (s) {
    const busy = s.progress.phase !== 'idle';
    $('cardMain').textContent = s.indexed ? `${s.cardCount.toLocaleString()} cards` : 'Not downloaded';
    $('cardSub').textContent = busy
      ? `${PHASE_LABEL[s.progress.phase] || s.progress.phase} ${s.progress.done}/${s.progress.total}`
      : (s.indexed ? `${s.thumbsCached.toLocaleString()} card images saved here` : 'Needed for card art and names');
    $('cardProgressWrap').classList.toggle('hidden', !busy);
    if (busy && s.progress.total) {
      $('cardProgress').style.width = `${Math.round((s.progress.done / s.progress.total) * 100)}%`;
    }
    $('cardSync').classList.toggle('hidden', busy);
    $('cardSync').textContent = s.indexed ? 'Check for new sets' : 'Download';
    if (busy) next = 700;
  }
  setTimeout(pollCards, next);
}

$('cardSync').addEventListener('click', async () => {
  $('cardSync').classList.add('hidden');
  await post('/api/cards/sync');
});

// --- updates ----------------------------------------------------------------

const IN_FLIGHT = ['downloading', 'verifying', 'ready'];

function renderUpdate(s) {
  if (!s) return;
  const bar = $('updateBar');
  const offer = s.phase === 'available' && s.version;

  $('versionMain').textContent = `Sideways Studio ${s.currentVersion}`;
  $('versionSub').textContent = {
    disabled: 'Updates are off when running from source',
    checking: 'Checking for updates…',
    uptodate: 'Up to date',
    available: `${s.version} is available`,
    error: s.error ? `Check failed: ${s.error}` : 'Check failed',
  }[s.phase] || (IN_FLIGHT.includes(s.phase) ? `Installing ${s.version}…` : 'Up to date');

  bar.classList.toggle('hidden', !offer);
  if (offer) {
    $('updateHeadline').textContent = `Update available: ${s.currentVersion} to ${s.version}`;
    $('updateNotes').textContent = s.notes ? s.notes.split('\n')[0] : '';
    $('updateSkip').classList.toggle('hidden', Boolean(s.required));
    $('updateLater').classList.toggle('hidden', Boolean(s.required));
  }

  // A required release is Sam's lever for an urgent fix: it installs itself,
  // the same as the console prompt's timeout used to, and the window says so
  // rather than doing it behind a silent progress bar.
  if (offer && s.required && !installing) startInstall(true);

  if (IN_FLIGHT.includes(s.phase) && installing) {
    $('curtainProgress').style.width = `${s.progress || 0}%`;
    $('curtainHeadline').textContent = s.phase === 'ready' ? 'Restarting' : `Updating to ${s.version}`;
    $('curtainHint').textContent = s.phase === 'ready'
      ? 'The app closes and reopens on its own.'
      : 'Downloading the new version. Your graphics keep running until it restarts.';
  }
  if (s.phase === 'error' && installing) {
    installing = false;
    $('curtain').classList.add('hidden');
  }
}

async function startInstall(required) {
  installing = true;
  $('updateBar').classList.add('hidden');
  $('curtainHeadline').textContent = required ? 'Required update' : 'Updating';
  $('curtainHint').textContent = 'Downloading the new version…';
  $('curtainProgress').style.width = '0%';
  $('curtainProgressWrap').classList.remove('hidden');
  $('curtain').classList.remove('hidden');
  await post('/api/update/install');
}

$('updateInstall').addEventListener('click', () => startInstall(false));
$('updateLater').addEventListener('click', () => $('updateBar').classList.add('hidden'));
$('updateSkip').addEventListener('click', async () => renderUpdate(await post('/api/update/skip')));
$('updateCheck').addEventListener('click', async () => {
  $('versionSub').textContent = 'Checking for updates…';
  renderUpdate(await post('/api/update/check'));
});

async function pollUpdate() {
  const s = await getJson('/api/update/status');
  renderUpdate(s);
  setTimeout(pollUpdate, s && (IN_FLIGHT.includes(s.phase) || s.phase === 'checking') ? 500 : 30_000);
}

// --- the legend of the launch ----------------------------------------------

// Decoration, and the first thing that proves the card data is really there.
// No art, no chip: never a broken image in the hero.
async function drawLegend() {
  const data = await getJson('/api/legends');
  const withArt = (data && data.legends || []).filter((l) => l.heroFile);
  if (!withArt.length) return;
  const legend = withArt[Math.floor(Math.random() * withArt.length)];
  const img = $('legendArt');
  img.addEventListener('load', () => {
    $('legendName').textContent = legend.name.split(',')[0];
    $('legendChip').classList.remove('hidden');
  });
  img.addEventListener('error', () => $('legendChip').classList.add('hidden'));
  img.alt = legend.name;
  img.src = `/legendart/hero/${legend.slug}.png`;
}

// --- quitting ---------------------------------------------------------------

$('quit').addEventListener('click', async () => {
  $('curtainHeadline').textContent = 'Stopping';
  $('curtainHint').textContent = 'The graphics stop and this window closes.';
  $('curtain').classList.remove('hidden');
  await post('/api/app/quit');
});

// --- opening the panel at launch -------------------------------------------

// Remembered in this window's own profile, which the app keeps in its data
// folder, so it survives an update the same way the event autosave does.
const AUTO_KEY = 'sideways.window.autoPanel';
const auto = $('autoPanel');
auto.checked = localStorage.getItem(AUTO_KEY) === '1';
auto.addEventListener('change', () => localStorage.setItem(AUTO_KEY, auto.checked ? '1' : '0'));

// --- connection -------------------------------------------------------------

// A window with no app behind it can only happen if the app crashed: quitting
// and closing both take the window with them. Say so rather than sitting
// there looking like a working app, but not before an update restart has had
// time to come back.
const STOPPED_AFTER_MS = 20_000;
let stoppedTimer = null;

function setLive(ok) {
  $('liveDot').classList.toggle('ok', ok);
  $('liveText').textContent = ok ? `Running on localhost:${appStatus.port}` : 'Not connected';
  $('serverSub').textContent = ok ? 'Serving graphics on this computer' : 'The app is not answering';
  if (ok) {
    clearTimeout(stoppedTimer);
    stoppedTimer = null;
    if (!installing) $('curtain').classList.add('hidden');
    return;
  }
  if (stoppedTimer || installing) return;
  stoppedTimer = setTimeout(() => {
    stoppedTimer = null;
    $('curtainHeadline').textContent = 'Sideways Studio has stopped';
    $('curtainHint').textContent = 'Nothing is running behind this window. You can close it, and start the app again when you need the graphics.';
    $('curtainProgressWrap').classList.add('hidden');
    $('curtain').classList.remove('hidden');
  }, STOPPED_AFTER_MS);
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws?role=window`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'log') appendLines(msg.lines);
    } catch { /* ignore */ }
  };
  ws.onopen = () => {
    setLive(true);
    // A reconnect means the app restarted under us (an update): the console
    // it sends back is the new process's, so start the pane again rather than
    // stacking two launches on top of each other.
    logEl.replaceChildren();
    lastStamp = '';
  };
  ws.onclose = () => { setLive(false); setTimeout(connect, 1200); };
  ws.onerror = () => ws.close();
}

async function init() {
  renderSources();
  const status = await getJson('/api/app/status');
  if (status) {
    appStatus = status;
    $('serverMain').textContent = `localhost:${status.port}`;
    $('dataPath').textContent = status.dataDir;
    $('dataPath').title = status.dataDir;
    $('versionMain').textContent = `Sideways Studio ${status.version}`;
    $('footVersion').textContent = `Sideways Studio ${status.version} · built by Sam Morris / Turn'em Sideways`;
    document.title = `Sideways Studio ${status.version}`;
  }
  connect();
  pollCards();
  pollUpdate();
  drawLegend();
  if (auto.checked) open('panel');
}

init();
