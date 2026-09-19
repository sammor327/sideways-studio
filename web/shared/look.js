// The look model: colours and backgrounds for every graphic.
//
// Shared by the server (validation, defaults, migration) and the scenes
// (resolution into CSS custom properties), so what the panel edits and what
// airs come from one definition. Plain ESM with no browser or Node
// dependencies; the server imports it like the decklist layout module.
//
// Three layers, resolved in order:
//   1. DESIGNED  each graphic's own designed colours (the PSD's gold and navy
//                for the POV, the TES grain and shards for the sidebars).
//   2. theme.look  the organizer's global look. Every field is optional: an
//                empty string means "keep the designed value", so a fresh
//                install airs the designed graphics untouched and a TO can
//                recolour one thing without restating the rest.
//   3. theme.scenes[key]  a per-graphic override with the same shape, applied
//                only while its `enabled` flag is on.
// Accent A and B keep living at theme.accentA/B (they predate this module and
// every scene reads them); a scene override may replace them.

export const LOOK_SCENES = ['scorebug', 'cardpopup', 'cardrow', 'igo1v1', 'igo2v2', 'igodual', 'igobars', 'pov', 'decklist',
  'igoportrait', 'igorows', 'arenabug', 'slate', 'handfan', 'showdown',
  'cornertag', 'lowerthird', 'headtohead', 'profile', 'bracket', 'standings', 'legendstats', 'result', 'sponsor',
  'matchup', 'sideboard', 'decklists', 'vscard', 'pairings', 'ongoing', 'matrix', 'odds', 'trash', 'sidespot', 'ticker'];

// The September 2026 graphics (from the five-game overlay scouting). They
// sat behind Setup's Experimental switch until 0.10.0; the panel now lists
// them with the rest, in its 1v1, 2v2 and Other folds.
export const EXPERIMENTAL_SCENES = ['igoportrait', 'igorows', 'arenabug', 'slate', 'handfan', 'showdown'];

export const SCENE_LABELS = {
  scorebug: 'Score bug',
  cardpopup: 'Card popup',
  cardrow: 'Card row',
  igo1v1: 'In-game overlay 1v1',
  igo2v2: 'In-game overlay 2v2',
  igodual: 'In-game overlay, dual columns',
  igobars: 'In-game overlay, 2v2 bars',
  pov: 'POV overlay',
  decklist: 'Decklist',
  igoportrait: 'In-game overlay, portrait pillars',
  igorows: 'In-game overlay, rows',
  arenabug: 'Arena score bug',
  slate: 'Slate',
  handfan: 'Hand fan',
  showdown: 'Showdown',
  cornertag: 'Corner tag',
  lowerthird: 'Lower third',
  headtohead: 'Match card',
  profile: 'Player profile',
  bracket: 'Bracket',
  standings: 'Standings',
  legendstats: 'Legend distribution',
  result: 'Result',
  sponsor: 'Sponsor plate',
  matchup: 'Game intro',
  sideboard: 'Sideboard fly-in',
  decklists: 'Decklists side by side',
  vscard: 'Head to head, VS',
  pairings: 'Pairings',
  ongoing: 'Ongoing matches',
  matrix: 'Matchup matrix',
  odds: 'Odds to draw',
  trash: 'Trash',
  sidespot: 'Sideboard card spotted',
  ticker: 'Results ticker',
};

// What paints the ground of a graphic (the sidebar, the columns, the plates,
// the decklist backdrop). 'shards' is the TES arrow art recoloured by the
// accents; 'plate' is the full-frame TES backdrop photo; 'arrows' is the
// Sideways Showdown head-to-head's ground (smoke plate and two clusters of
// glowing arrows, baked from HEAD2HEAD-PREPPED.psd by
// scripts/bake-showdown.py; its arrows keep their own BlueGreen, like the
// plate photo keeps its colours); 'image' is an upload; 'transparent' paints
// nothing so the feed shows through.
export const BG_KINDS = ['shards', 'solid', 'gradient', 'image', 'plate', 'arrows', 'transparent'];
export const BG_IMAGES = { plate: '/assets/decklist/background.jpg', arrows: '/assets/backgrounds/showdown.webp' };

export const COLOR_KEYS = ['ink', 'plate', 'frame', 'text', 'textMuted', 'trim'];
export const COLOR_LABELS = {
  ink: 'Ground',
  plate: 'Panels',
  frame: 'Frame',
  text: 'Text',
  textMuted: 'Secondary text',
  trim: 'Trim',
};
export const COLOR_HELP = {
  ink: 'The base colour behind everything: the sidebar, the columns, the plates.',
  plate: 'Holder boxes, name bars and other panels that sit on the ground.',
  frame: 'The border around the game window.',
  text: 'Player names and the main lines.',
  textMuted: 'Battlefield names and other secondary lines.',
  trim: 'Rules, pips and edge lines. Cleared, it uses the two accents as a gradient.',
};

export const ACCENTS = { accentA: '#11b6fb', accentB: '#1bef19' };

// Field shapes. Empty string = not set. Numbers are stored as numbers.
export function emptyLook() {
  return {
    accentA: '',
    accentB: '',
    colors: { ink: '', plate: '', frame: '', text: '', textMuted: '', trim: '' },
    background: { kind: '', color: '', color2: '', angle: '', image: '', grain: '', dim: '' },
  };
}

export function emptySceneLook() {
  return { enabled: false, ...emptyLook() };
}

// The designed values, one full set per graphic. The sidebars are the TES
// plates (near-black grain ground, black holder bodies, the accent gradient
// as trim over the shard art). The POV is the designer's navy and gold. The
// dual-column overlay is new and takes the TES palette on a slightly cooler
// ground so the columns read as one piece with the score bug. The 2v2 bars
// are modelled on the Singapore showmatch frame and keep its navy and gold,
// like the POV keeps the designer's.
const TES_GROUND = {
  colors: { ink: '#1c1c1c', plate: '#000000', frame: '#000000', text: '#ffffff', textMuted: '#d8dee4', trim: '' },
  background: { kind: 'shards', color: '#1c1c1c', color2: '#000000', angle: 160, image: '', grain: 60, dim: 0 },
};

export const DESIGNED = {
  igo1v1: TES_GROUND,
  igo2v2: TES_GROUND,
  igodual: {
    colors: { ink: '#12161b', plate: '#07090c', frame: '#000000', text: '#ffffff', textMuted: '#c9d2da', trim: '' },
    background: { kind: 'gradient', color: '#161b22', color2: '#07090c', angle: 170, image: '', grain: 45, dim: 0 },
  },
  igobars: {
    colors: { ink: '#10203f', plate: '#0a1428', frame: '#0a1428', text: '#ffffff', textMuted: '#c8d0dc', trim: '#c99c3e' },
    background: { kind: 'gradient', color: '#142a52', color2: '#0b1a36', angle: 180, image: '', grain: 30, dim: 0 },
  },
  pov: {
    colors: { ink: '#14273c', plate: '#0f0f0f', frame: '#000000', text: '#ffffff', textMuted: '#d8dee4', trim: '#c99c3e' },
    background: { kind: 'solid', color: '#14273c', color2: '#0b1727', angle: 180, image: '', grain: 55, dim: 0 },
  },
  scorebug: {
    colors: { ink: '#0c0f12', plate: '#0a0a0a', frame: '#000000', text: '#ffffff', textMuted: '#8b98a5', trim: '' },
    background: { kind: 'solid', color: '#0a0a0a', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  cardpopup: {
    colors: { ink: '#0c0f12', plate: '#0a0a0a', frame: '#000000', text: '#ffffff', textMuted: '#8b98a5', trim: '' },
    background: { kind: 'solid', color: '#0a0a0a', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  // The card row's ground, when its background is on: the TES arrow shards
  // in the event's accents over near-black, with grain. Not the plate photo:
  // its glowing arrow sits top left where the decklist's legend covers it,
  // and the row leaves that corner bare.
  cardrow: {
    colors: { ink: '#0d0d0d', plate: '#1c1c1c', frame: '#000000', text: '#ffffff', textMuted: '#d8dee4', trim: '' },
    background: { kind: 'shards', color: '#0d0d0d', color2: '#000000', angle: 180, image: '', grain: 45, dim: 62 },
  },
  decklist: {
    colors: { ink: '#0d0d0d', plate: '#1c1c1c', frame: '#000000', text: '#ffffff', textMuted: '#d8dee4', trim: '' },
    background: { kind: 'plate', color: '#0d0d0d', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  // The experimental set shares one cool near-black ground with the dual
  // columns so the four read as one family beside the score bug.
  igoportrait: {
    colors: { ink: '#10151d', plate: '#0a0d12', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'gradient', color: '#141a22', color2: '#0a0d12', angle: 180, image: '', grain: 40, dim: 0 },
  },
  igorows: {
    colors: { ink: '#10151d', plate: '#0a0d12', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'gradient', color: '#141a22', color2: '#0a0d12', angle: 180, image: '', grain: 40, dim: 0 },
  },
  arenabug: {
    colors: { ink: '#0a0d12', plate: '#0a0d12', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'solid', color: '#0a0d12', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  // The slate, the bracket and the standings stand on the Sideways Showdown
  // glowing arrows since 2026-09-19 (Sam: "use this on more graphics"),
  // darkened so small type over an arrow still reads; that plate carries its
  // own grain, so the procedural grain drops to a touch.
  slate: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'arrows', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 20, dim: 40 },
  },
  handfan: {
    colors: { ink: '#0a0d12', plate: '#0a0d12', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'solid', color: '#0a0d12', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  showdown: {
    colors: { ink: '#0a0d12', plate: '#0a0d12', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'solid', color: '#0a0d12', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  // The sponsor plate wears the look of the overlay it docks into; this is
  // its look with none up, or with its own override on.
  sponsor: {
    colors: { ink: '#0a0d12', plate: '#0a0d12', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'solid', color: '#0a0d12', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  // The starter kit: the overlays paint plates only; the match card and the
  // profile keep a gradient or solid ground of their own.
  cornertag: {
    colors: { ink: '#0a0d12', plate: '#0a0d12', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'solid', color: '#0a0d12', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  lowerthird: {
    colors: { ink: '#0a0d12', plate: '#0a0d12', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'solid', color: '#0a0d12', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  result: {
    colors: { ink: '#0a0d12', plate: '#0a0d12', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'solid', color: '#0a0d12', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  headtohead: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'solid', color: '#0a0d12', color2: '#000000', angle: 180, image: '', grain: 30, dim: 0 },
  },
  profile: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'gradient', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 45, dim: 0 },
  },
  bracket: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'arrows', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 20, dim: 40 },
  },
  standings: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'arrows', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 20, dim: 25 },
  },
  // The legend distribution (2026-09-19) stands on the standings' ground:
  // its pie and table sit on one panel, so the arrows frame them. The slice
  // colours are its own (web/shared/legendstats.js), checked against this
  // panel colour; a look that changes the panel keeps them.
  legendstats: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'arrows', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 20, dim: 30 },
  },
  // The pairings (2026-09-19) are the standings' sister sheet: the same ground.
  pairings: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'arrows', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 20, dim: 25 },
  },
  // The ongoing matches (2026-09-19) draw the pairings' tables: their ground.
  ongoing: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'arrows', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 20, dim: 25 },
  },
  // The matchup matrix (2026-09-19) stands on the legend distribution's
  // ground, its sister graphic: the grid sits on one panel the arrows
  // frame. Its tier colours are its own (web/shared/matrix.js), checked
  // against this panel colour; a look that changes the panel keeps them.
  matrix: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'arrows', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 20, dim: 30 },
  },
  // The results ticker (2026-09-19) is the slate's feature-tables strip on
  // its own: a plate only, in the slate's panel colours. Fitted to an
  // in-game overlay it wears that overlay's look instead (web/shared/ticker.js).
  ticker: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'solid', color: '#0a0d12', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  // The decks round (2026-09-18). The game intro's two pages and the side
  // by side decklists share the full screens' gradient ground; the sideboard
  // plate paints plates only, like the other overlays.
  matchup: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'gradient', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 45, dim: 0 },
  },
  sideboard: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'gradient', color: '#141a22', color2: '#0a0d12', angle: 180, image: '', grain: 30, dim: 0 },
  },
  decklists: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'gradient', color: '#142131', color2: '#0a0d12', angle: 160, image: '', grain: 45, dim: 0 },
  },
  // Sideboard card spotted (2026-09-19): the card and its name plate, which
  // takes the sideboard fly-in's plate ground.
  sidespot: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'gradient', color: '#141a22', color2: '#0a0d12', angle: 180, image: '', grain: 30, dim: 0 },
  },
  // The VS head to head (2026-09-19) stands on the Sideways Showdown ground
  // it was designed on; that plate carries its own grain.
  vscard: {
    colors: { ink: '#1c1c1c', plate: '#10151d', frame: '#26303c', text: '#ffffff', textMuted: '#c9d2da', trim: '' },
    background: { kind: 'arrows', color: '#1c1c1c', color2: '#000000', angle: 180, image: '', grain: 0, dim: 0 },
  },
  // The odds to draw and the trash (2026-09-19) are side sheets over the
  // game: plates only, on the sideboard fly-in's ground.
  odds: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'gradient', color: '#141a22', color2: '#0a0d12', angle: 180, image: '', grain: 30, dim: 0 },
  },
  trash: {
    colors: { ink: '#0a0d12', plate: '#10151d', frame: '#26303c', text: '#f3f6f9', textMuted: '#9aa7b6', trim: '' },
    background: { kind: 'gradient', color: '#141a22', color2: '#0a0d12', angle: 180, image: '', grain: 30, dim: 0 },
  },
};

// Ready-made looks the panel offers as one click. Each is a global look
// patch (the same optional-field shape), so applying one leaves the fields it
// does not name on their designed values.
export const PRESETS = [
  {
    key: 'tes',
    name: 'Turn\'em Sideways',
    hint: 'The default: BlueGreen accents over the grained TES plates.',
    look: { accentA: '#11b6fb', accentB: '#1bef19', colors: {}, background: {} },
  },
  {
    key: 'regional',
    name: 'Regional gold',
    hint: 'Navy columns with gold trim, the Regional Qualifier broadcast look.',
    look: {
      accentA: '#d9b25a', accentB: '#f1d27a',
      colors: { ink: '#0f1b30', plate: '#0a1222', frame: '#0a1222', text: '#ffffff', textMuted: '#c8d0dc', trim: '#c99c3e' },
      background: { kind: 'gradient', color: '#13224a', color2: '#070d1a', angle: 170, grain: 35, dim: 0 },
    },
  },
  {
    key: 'ember',
    name: 'Ember',
    hint: 'Charcoal ground, orange to red accents.',
    look: {
      accentA: '#ff7a1a', accentB: '#e8262b',
      colors: { ink: '#1a1412', plate: '#0c0908', frame: '#0c0908', text: '#ffffff', textMuted: '#e0c9bd', trim: '' },
      background: { kind: 'shards', color: '#1a1412', color2: '#000000', angle: 160, grain: 60, dim: 0 },
    },
  },
  {
    key: 'arctic',
    name: 'Arctic',
    hint: 'Deep teal ground, ice-white and cyan accents.',
    look: {
      accentA: '#8fe9ff', accentB: '#2fb8ff',
      colors: { ink: '#0b1f26', plate: '#06141a', frame: '#06141a', text: '#ffffff', textMuted: '#b9d9e2', trim: '' },
      background: { kind: 'gradient', color: '#0f2a33', color2: '#04100f', angle: 200, grain: 40, dim: 0 },
    },
  },
  {
    key: 'mono',
    name: 'Mono',
    hint: 'Black and white, no colour at all. For a sponsor takeover or a stark look.',
    look: {
      accentA: '#ffffff', accentB: '#9a9a9a',
      colors: { ink: '#111111', plate: '#000000', frame: '#000000', text: '#ffffff', textMuted: '#bdbdbd', trim: '#ffffff' },
      background: { kind: 'solid', color: '#111111', color2: '#000000', angle: 180, grain: 50, dim: 0 },
    },
  },
];

const HEX = /^#[0-9a-f]{6}$/;

export const isHex = (v) => typeof v === 'string' && HEX.test(v);

// Sanitize one look patch (global or scene) into the stored shape. Unknown
// keys drop, bad values fall back to the current stored value, '' clears.
// `current` is the stored object being patched; `allowImage` lets only the
// upload route (which passes the served URL) set a non-empty image.
export function cleanLookPatch(current, patch, { allowImage = false } = {}) {
  const out = current;
  if (!patch || typeof patch !== 'object') return out;
  const hexOrEmpty = (v, prev) => {
    if (v === '' || v === null) return '';
    const s = String(v).trim().toLowerCase();
    return HEX.test(s) ? s : prev;
  };
  const intOrEmpty = (v, prev, min, max) => {
    if (v === '' || v === null) return '';
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : prev;
  };
  if ('enabled' in out && patch.enabled !== undefined) out.enabled = Boolean(patch.enabled);
  if (patch.accentA !== undefined) out.accentA = hexOrEmpty(patch.accentA, out.accentA);
  if (patch.accentB !== undefined) out.accentB = hexOrEmpty(patch.accentB, out.accentB);
  if (patch.colors && typeof patch.colors === 'object') {
    for (const key of COLOR_KEYS) {
      if (patch.colors[key] !== undefined) out.colors[key] = hexOrEmpty(patch.colors[key], out.colors[key]);
    }
  }
  if (patch.background && typeof patch.background === 'object') {
    const b = patch.background;
    if (b.kind !== undefined) out.background.kind = b.kind === '' ? '' : (BG_KINDS.includes(b.kind) ? b.kind : out.background.kind);
    if (b.color !== undefined) out.background.color = hexOrEmpty(b.color, out.background.color);
    if (b.color2 !== undefined) out.background.color2 = hexOrEmpty(b.color2, out.background.color2);
    if (b.angle !== undefined) out.background.angle = intOrEmpty(b.angle, out.background.angle, 0, 360);
    if (b.grain !== undefined) out.background.grain = intOrEmpty(b.grain, out.background.grain, 0, 100);
    if (b.dim !== undefined) out.background.dim = intOrEmpty(b.dim, out.background.dim, 0, 100);
    if (b.image !== undefined) {
      if (b.image === '' || b.image === null) out.background.image = '';
      else if (allowImage && typeof b.image === 'string' && b.image.startsWith('/theme/bg/')) out.background.image = b.image;
    }
  }
  return out;
}

// Layer loaded (possibly older or partial) data over a fresh empty look.
export function mergeLook(raw, withEnabled = false) {
  const base = withEnabled ? emptySceneLook() : emptyLook();
  if (!raw || typeof raw !== 'object') return base;
  return cleanLookPatch(base, raw, { allowImage: true });
}

const set = (v) => v !== '' && v !== undefined && v !== null;

// The concrete look one scene should render: designed values, then the
// global look's set fields, then the scene's own override when enabled.
export function resolveLook(theme, scene) {
  const designed = DESIGNED[scene] || DESIGNED.igodual;
  const out = {
    accentA: (theme && isHex(theme.accentA)) ? theme.accentA : ACCENTS.accentA,
    accentB: (theme && isHex(theme.accentB)) ? theme.accentB : ACCENTS.accentB,
    colors: { ...designed.colors },
    background: { ...designed.background },
  };
  const layers = [];
  if (theme && theme.look) layers.push(theme.look);
  const own = theme && theme.scenes && theme.scenes[scene];
  if (own && own.enabled) layers.push(own);
  for (const layer of layers) {
    if (set(layer.accentA)) out.accentA = layer.accentA;
    if (set(layer.accentB)) out.accentB = layer.accentB;
    for (const key of COLOR_KEYS) {
      if (layer.colors && set(layer.colors[key])) out.colors[key] = layer.colors[key];
    }
    if (layer.background) {
      for (const key of Object.keys(out.background)) {
        if (set(layer.background[key])) out.background[key] = layer.background[key];
      }
    }
  }
  // An image background with no image behaves as the flat colour under it,
  // never as a broken picture.
  if (out.background.kind === 'image' && !out.background.image) out.background.kind = 'solid';
  return out;
}

// The CSS custom properties a resolved look becomes. Every scene reads these;
// the legacy --tes-blue / --tes-green stay as the accent aliases so older
// scene CSS keeps working.
export function lookVars(look) {
  const c = look.colors;
  const b = look.background;
  const trimGrad = c.trim ? c.trim : `linear-gradient(135deg, ${look.accentA}, ${look.accentB})`;
  const image = BG_IMAGES[b.kind] ? `url(${BG_IMAGES[b.kind]})`
    : (b.kind === 'image' && b.image ? `url("${b.image}")` : 'none');
  return {
    '--tes-blue': look.accentA,
    '--tes-green': look.accentB,
    '--tes-grad': `linear-gradient(135deg, ${look.accentA}, ${look.accentB})`,
    '--ss-accent-a': look.accentA,
    '--ss-accent-b': look.accentB,
    '--ss-ink': c.ink,
    '--ss-plate': c.plate,
    '--ss-frame': c.frame,
    '--ss-text': c.text,
    '--ss-text-muted': c.textMuted,
    '--ss-trim': c.trim || look.accentA,
    '--ss-trim-grad': trimGrad,
    '--ss-bg-color': b.color,
    '--ss-bg-color2': b.color2,
    '--ss-bg-angle': `${Number(b.angle) || 0}deg`,
    '--ss-bg-image': image,
    '--ss-grain': String((Number(b.grain) || 0) / 100),
    '--ss-dim': String((Number(b.dim) || 0) / 100),
  };
}
