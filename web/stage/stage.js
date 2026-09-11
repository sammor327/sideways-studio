// Stage sync client shared by every scene.
// Contract (broadcast-line-handoff §3.5): version-gated repaints, full-state
// fetch on load and on every reconnect, keep the last good frame on any
// failure, 60s belt-and-braces resync. URL params own presentation only.

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

// Event theme (accent colors, display font) applies to every scene; inline
// root properties override the brand.css defaults, and clearing them falls
// back to TES. Fonts arrive via /theme/fonts.css (cached Google Fonts).
const FONT_FALLBACK = "'Segoe UI', 'Arial Narrow', Arial, sans-serif";
function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement.style;
  if (theme.accentA) root.setProperty('--tes-blue', theme.accentA);
  if (theme.accentB) root.setProperty('--tes-green', theme.accentB);
  if (theme.font) root.setProperty('--tes-font', `'${theme.font}', ${FONT_FALLBACK}`);
  else root.removeProperty('--tes-font');
  // Lets a scene prefer a locally installed brand face under the default
  // theme while still yielding to a font the organizer picked.
  document.documentElement.classList.toggle('theme-font', Boolean(theme.font));
}

export function initStage({ onState }) {
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
    applyTheme(state.theme);
    onState(state, wasFirst);
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
