// Stage sync client shared by every scene.
// Contract (broadcast-line-handoff §3.5): version-gated repaints, full-state
// fetch on load and on every reconnect, keep the last good frame on any
// failure, 60s belt-and-braces resync. URL params own presentation only.
import { resolveLook, lookVars } from '../shared/look.js';
import { tileBank } from '../shared/looktiles.js';
import { ensureFontFace } from '../shared/fontsheet.js';
import { installNameFit, scheduleNameFit } from './fitnames.js';

export function stageParams() {
  const p = new URLSearchParams(location.search);
  return {
    transparent: p.get('transparent') === '1',
    theme: p.get('theme') || 'tes',
    anim: p.get('anim') !== '0',
    // Bank selector: ?preview=1 renders the PREVIEW bank (what TAKE will put
    // on air); broadcast URLs render the PROGRAM bank. Never put ?preview=1
    // on a browser-source URL.
    preview: p.get('preview') === '1',
    // ?force=1 renders the scene as if switched on, whatever the bank says:
    // the panel's graphic thumbnails use it so an operator can see each
    // graphic with the current data before switching it on. Never on a
    // broadcast URL.
    force: p.get('force') === '1',
    // The panel's Look builder tiles: ?tile=<key> draws this graphic on its
    // own (every other graphic off, so nothing docks or stands down) in that
    // tile's variant (web/shared/looktiles.js), and ?sample=1 draws the
    // built-in sample match (server/sample.js) instead of the event's data,
    // so every graphic shows filled. The look stays live. Never on a
    // broadcast URL.
    tile: p.get('tile') || '',
    sample: p.get('sample') === '1',
  };
}

// Scenes render exactly one bank of the bus.
export function sceneBank(state, params) {
  return params.preview ? state.preview : state.program;
}

// The event look (accents, colours, background, display font) applies to
// every scene as root custom properties over the brand.css defaults. Each
// scene names itself so its own designed colours and any per-graphic
// override resolve (web/shared/look.js); the background kind is stamped on
// the root as data-bg for the shared ground layers (stage/ground.css).
// Fonts arrive via /theme/fonts.css (cached Google Fonts).
const FONT_FALLBACK = "'Segoe UI', 'Arial Narrow', Arial, sans-serif";
let lastVars = '';
function applyTheme(theme, scene) {
  if (!theme) return;
  const root = document.documentElement.style;
  const look = resolveLook(theme, scene);
  const vars = lookVars(look);
  const key = JSON.stringify(vars);
  // A style write per property per state push is not free in a browser
  // source; skip the lot when nothing about the look changed.
  if (key !== lastVars) {
    lastVars = key;
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
    document.documentElement.dataset.bg = look.background.kind;
  }
  if (theme.font) root.setProperty('--tes-font', `'${theme.font}', ${FONT_FALLBACK}`);
  else root.removeProperty('--tes-font');
  // A font saved after this page loaded is not in its fonts sheet yet.
  ensureFontFace(theme.font);
  // Lets a scene prefer a locally installed brand face under the default
  // theme while still yielding to a font the organizer picked.
  document.documentElement.classList.toggle('theme-font', Boolean(theme.font));
}

// The look one scene renders right now, for scenes that need more than the
// custom properties (the decklist waits on its backdrop image, for one).
export function currentLook(state, scene) {
  return resolveLook(state.theme, scene);
}

export function initStage({ scene = 'igodual', onState }) {
  const params = stageParams();
  installNameFit();
  if (params.transparent) document.documentElement.classList.add('transparent');
  document.documentElement.dataset.theme = params.theme;

  let version = -1;
  let first = true;

  // A tile's sample match arrives once per load; a state that lands before
  // it is held and applied when it does. A failed fetch falls back to the
  // event's own data rather than drawing nothing.
  let sample = params.sample ? null : false;
  let held = null;
  if (params.sample) {
    fetch('/api/sample', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { sample = data && data.bank ? data.bank : false; })
      .catch(() => { sample = false; })
      .finally(() => {
        const s = held;
        held = null;
        if (s) apply(s);
      });
  }

  // What this scene draws: the state itself, or for a look builder tile the
  // tile's bank in both slots. The sample keeps the event's own name when
  // one is set, so the organizer judges the look on their own title.
  function view(state) {
    if (!params.tile && !params.sample) return state;
    if (sample === null) return null;
    const own = sceneBank(state, params);
    let base = own;
    if (sample) {
      base = sample;
      if (own && own.event && own.event.name) base = { ...sample, event: { ...sample.event, name: own.event.name } };
    }
    const bank = tileBank(base, params.tile, scene);
    return { ...state, preview: bank, program: bank };
  }

  function apply(state) {
    if (!state || !Number.isInteger(state.version) || state.version <= version) return;
    const shown = view(state);
    if (!shown) { held = state; return; }
    version = state.version;
    const wasFirst = first;
    first = false;
    applyTheme(shown.theme, scene);
    onState(shown, wasFirst);
    // Names shrink to fit instead of ending in an ellipsis (fitnames.js).
    scheduleNameFit();
    if (wasFirst && scene !== 'decklist') markReadyWhenLoaded();
  }

  // A still renderer (server/still.js) waits for data-ready on the root.
  // The decklist sets its own once its plate is built; every other scene is
  // ready once its images have loaded or given up, capped so a missing art
  // file never holds a capture. Harmless on air: nothing reads it there.
  function markReadyWhenLoaded() {
    const deadline = Date.now() + 4000;
    const poll = () => {
      const imgs = [...document.images].filter((i) => i.getAttribute('src'));
      const settled = imgs.every((i) => i.complete);
      if (settled || Date.now() > deadline) {
        // One more beat so a fallback chain that just advanced can load.
        setTimeout(() => { document.documentElement.dataset.ready = '1'; }, 350);
        return;
      }
      setTimeout(poll, 100);
    };
    setTimeout(poll, 200);
  }

  async function fullFetch() {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (res.ok) apply(await res.json());
    } catch {
      // Keep the last good frame; a failed poll must never blank the output.
    }
  }

  function connect() {
    let ws;
    try {
      ws = new WebSocket(`ws://${location.host}/ws`);
    } catch {
      setTimeout(connect, 2000);
      return;
    }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'state') apply(msg.state);
      } catch { /* ignore malformed frames */ }
    };
    // Reconnects can miss pushes, so every open re-syncs from the source of truth.
    ws.onopen = fullFetch;
    ws.onclose = () => setTimeout(connect, 1200 + Math.random() * 1800);
    ws.onerror = () => ws.close();
  }

  fullFetch();
  connect();
  setInterval(fullFetch, 60_000);

  return params;
}

// Update an element's text only when it changed; returns true when it did,
// so callers can attach data-change micro-animations to real changes only.
export function setText(el, value) {
  const v = String(value);
  if (el.textContent === v) return false;
  el.textContent = v;
  return true;
}
