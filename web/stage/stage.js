// Stage sync client shared by every scene.
// Contract (broadcast-line-handoff §3.5): version-gated repaints, full-state
// fetch on load and on every reconnect, keep the last good frame on any
// failure, 60s belt-and-braces resync. URL params own presentation only.
import { resolveLook, lookVars } from '../shared/look.js';

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
  if (params.transparent) document.documentElement.classList.add('transparent');
  document.documentElement.dataset.theme = params.theme;

  let version = -1;
  let first = true;

  function apply(state) {
    if (!state || !Number.isInteger(state.version) || state.version <= version) return;
    version = state.version;
    const wasFirst = first;
    first = false;
    applyTheme(state.theme, scene);
    onState(state, wasFirst);
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
