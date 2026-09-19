// The game window: where the table camera shows on each in-game overlay, so
// a graphic that plays over the game (the game intro, the sideboard fly-in,
// 2026-09-18) sits inside the overlay's frame instead of across its chrome.
// Sam: "works with the game overlay rows scene as well as other overlays".
//
// Shared by those scenes and the tests; pure, like sponsor.js. Rects are in
// 1920x1080 design pixels, measured off each overlay's own CSS.
export const GAME_WINDOWS = {
  igorows: { x: 330, y: 75, w: 1590, h: 930 },       // right of the column, between the bars
  igoportrait: { x: 545, y: 64, w: 830, h: 1016 },    // the portrait camera between the pillars
  igodual: { x: 350, y: 0, w: 1220, h: 1080 },        // between the two columns
  igobars: { x: 0, y: 145, w: 1920, h: 790 },         // clear of the clusters on both bars
  igo2v2: { x: 0, y: 0, w: 1508, h: 1080 },           // left of the 412px sidebar
  igo1v1: { x: 0, y: 0, w: 1615, h: 1080 },           // left of the 305px sidebar
  pov: { x: 297, y: 0, w: 1326, h: 1080 },            // between the two POV columns
};

// When more than one is up, the layouts that own the frame win, as the
// sponsor plate decides it.
export const GAME_HOSTS = ['igorows', 'igoportrait', 'igodual', 'igobars', 'igo2v2', 'igo1v1', 'pov'];

export const FULL_FRAME = { x: 0, y: 0, w: 1920, h: 1080 };

// The window a bank's overlay leaves for the game: { x, y, w, h, host }.
// No in-game overlay up means the whole frame.
export function gameWindow(bank) {
  const scenes = (bank && bank.scenes) || {};
  const host = GAME_HOSTS.find((key) => scenes[key] && scenes[key].visible) || '';
  return { ...(GAME_WINDOWS[host] || FULL_FRAME), host };
}

// Clip a full-stage graphic to a game window, so whatever moves in from
// outside it appears from under the overlay's chrome, whichever way the
// browser sources are layered (Sam, 2026-09-18: the game intro and the
// sideboard fly-in play underneath the overlays). The whole frame clips
// nothing. The element must fill the 1920x1080 stage.
export function clipToWindow(el, win) {
  const full = win.x <= 0 && win.y <= 0 && win.x + win.w >= 1920 && win.y + win.h >= 1080;
  el.style.clipPath = full ? '' : `inset(calc(${win.y} * var(--u)) calc(${1920 - win.x - win.w} * var(--u)) calc(${1080 - win.y - win.h} * var(--u)) calc(${win.x} * var(--u)))`;
}

// A dw x dh design centred in a window with a margin, scaled down to fit and
// never up past `max`: { scale, x, y } in design pixels.
export function fitInto(win, dw, dh, { margin = 24, max = 1 } = {}) {
  const scale = Math.max(0.1, Math.min((win.w - 2 * margin) / dw, (win.h - 2 * margin) / dh, max));
  return { scale, x: win.x + (win.w - dw * scale) / 2, y: win.y + (win.h - dh * scale) / 2 };
}

// The game being played: pinned (1 to 5), or counted from the game wins and
// held to the series length.
export function gameNumber(match, pinned = 0) {
  if (pinned > 0) return pinned;
  const played = ((match && match.left && match.left.gameWins) || 0) + ((match && match.right && match.right.gameWins) || 0);
  const length = (match && match.seriesLength) || 3;
  return Math.max(1, Math.min(length, played + 1));
}
