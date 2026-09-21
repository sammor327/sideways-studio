// Side sheets' layout (2026-09-19): where the odds to draw and the trash stand
// in the game window and at what scale. Pure arithmetic, shared by the two
// scenes (through web/stage/sidesheet.js) and the tests. Heights are counted
// from the rows, never measured: a browser source that is not drawing reports
// no layout (the hand lists' rule).

export const SHEET_W = 460;
export const SHEET_PAD = 18;
export const HEAD_H = 72;
export const FOOT_H = 34;
const MARGIN = 24;
const GAP = 24;

// The sides a sheet graphic draws: one player's, or both players'.
export const sheetSides = (cfg) => (cfg && (cfg.side === 'left' || cfg.side === 'right') ? [cfg.side] : ['left', 'right']);

// Which sheets are up in a bank, and where each stands on its side: the odds
// against the window's edge, the trash beside them, further in, when both
// show the same player, so the two never land on top of each other. Both
// scenes read the same bank, so they agree without talking. `self` is the
// graphic asking, counted as up (a thumbnail draws itself switched off).
// `docked` is what the rows overlay's column is holding (shared/rowsdock.js):
// a side listed there is not on the game window at all, so it takes no slot.
const hasDeck = (side) => Boolean(side && (((side.deckLeft || []).length) || String(side.deckList || '').trim()));
export function sheetSlots(bank, self, docked = {}) {
  const scenes = (bank && bank.scenes) || {};
  const up = [];
  for (const key of ['odds', 'trash']) {
    const cfg = scenes[key];
    if (!cfg || !(cfg.visible || key === self)) continue;
    for (const side of sheetSides(cfg)) {
      if (key === 'odds' && !hasDeck(bank.match && bank.match[side])) continue;
      if ((docked[key] || []).includes(side)) continue;
      up.push([key, side]);
    }
  }
  const slot = {};
  const perSide = { left: 0, right: 0 };
  for (const [key, side] of up) slot[`${key}:${side}`] = perSide[side]++;
  return { slot: (key, side) => slot[`${key}:${side}`] || 0, count: Math.max(1, perSide.left + perSide.right) };
}

// Where each sheet goes and at what scale: against its own side of the window
// (or one sheet in, at slot 1), centred top to bottom, scaled down only when
// the window is too small for every sheet up across it.
export function placeSheets(win, heights, { slot = () => 0, count = Object.keys(heights).length } = {}) {
  const n = Math.max(1, count);
  const room = (win.w - 2 * MARGIN - GAP * (n - 1)) / n;
  const out = {};
  for (const key of Object.keys(heights)) {
    const h = heights[key];
    const scale = Math.max(0.4, Math.min(1, room / SHEET_W, (win.h - 2 * MARGIN) / h));
    const k = slot(key);
    const x = key === 'right'
      ? win.x + win.w - MARGIN - SHEET_W * scale - k * (SHEET_W * scale + GAP)
      : win.x + MARGIN + k * (SHEET_W * scale + GAP);
    const y = win.y + (win.h - h * scale) / 2;
    out[key] = { x, y, scale };
  }
  return out;
}

// The rows a sheet can show before its list scrolls, in a window this tall.
export function rowsThatFit(win, rowH) {
  return Math.max(3, Math.floor((win.h - 2 * MARGIN - HEAD_H - FOOT_H - 2 * SHEET_PAD - 4) / rowH));
}

// Padding, the 2px frame, the head, the rows and the foot line.
export const sheetHeight = (rows, rowH, foot) => 2 * SHEET_PAD + 4 + HEAD_H + rows * rowH + (foot ? FOOT_H : 0);
