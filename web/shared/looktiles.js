// The look builder's tiles: every graphic, plus the variants worth judging a
// look on side by side, in the order the panel's Look builder tab lays them
// out (2026-09-18, Sam: "as many scenes as possible laid out").
//
// Shared by the panel (web/panel/lookbuilder.js builds the grid from it) and
// the stage (web/stage/stage.js reads ?tile= and draws that tile's graphic on
// its own, in its variant). Plain ESM with no browser or Node dependencies,
// like look.js, so the tests import it directly.

export const TILE_GROUPS = [
  { key: 'igo', label: 'In-game overlays' },
  { key: 'parts', label: 'Bugs, cards and plates' },
  { key: 'full', label: 'Full screen' },
];

// key: the tile's own id (the ?tile= value); scene: the graphic it draws;
// variant: the second line under the graphic's name; vary: the scene
// settings that variant sets over the bank's own.
export const TILES = [
  { key: 'igo1v1', scene: 'igo1v1', group: 'igo' },
  { key: 'igo2v2', scene: 'igo2v2', group: 'igo' },
  { key: 'igodual', scene: 'igodual', group: 'igo' },
  { key: 'igodual-hand', scene: 'igodual', group: 'igo', variant: 'Cards in hand', vary: { hand: true } },
  { key: 'igobars', scene: 'igobars', group: 'igo' },
  { key: 'igoportrait', scene: 'igoportrait', group: 'igo' },
  { key: 'igorows', scene: 'igorows', group: 'igo' },
  { key: 'igorows-bf', scene: 'igorows', group: 'igo', variant: 'Battlefields, all three', vary: { battlefields: 'all' } },
  { key: 'pov', scene: 'pov', group: 'igo' },

  { key: 'scorebug', scene: 'scorebug', group: 'parts' },
  { key: 'arenabug', scene: 'arenabug', group: 'parts' },
  { key: 'cardpopup', scene: 'cardpopup', group: 'parts' },
  { key: 'cardrow', scene: 'cardrow', group: 'parts' },
  { key: 'handfan', scene: 'handfan', group: 'parts' },
  { key: 'showdown', scene: 'showdown', group: 'parts', variant: 'Strip', vary: { mode: 'strip' } },
  { key: 'showdown-takeover', scene: 'showdown', group: 'parts', variant: 'Takeover', vary: { mode: 'takeover' } },
  { key: 'sponsor', scene: 'sponsor', group: 'parts' },
  { key: 'cornertag', scene: 'cornertag', group: 'parts' },
  { key: 'lowerthird', scene: 'lowerthird', group: 'parts', variant: 'Casters', vary: { mode: 'casters' } },
  { key: 'lowerthird-interview', scene: 'lowerthird', group: 'parts', variant: 'Interview', vary: { mode: 'interview' } },
  { key: 'lowerthird-coming', scene: 'lowerthird', group: 'parts', variant: 'Coming up', vary: { mode: 'coming' } },
  { key: 'result', scene: 'result', group: 'parts' },
  { key: 'matchup', scene: 'matchup', group: 'parts' },
  { key: 'sideboard', scene: 'sideboard', group: 'parts' },

  { key: 'slate', scene: 'slate', group: 'full', variant: 'Up next', vary: { mode: 'upnext' } },
  { key: 'slate-starting', scene: 'slate', group: 'full', variant: 'Starting soon', vary: { mode: 'starting' } },
  { key: 'slate-brb', scene: 'slate', group: 'full', variant: 'Be right back', vary: { mode: 'brb' } },
  { key: 'slate-thanks', scene: 'slate', group: 'full', variant: 'Thanks for watching', vary: { mode: 'thanks' } },
  { key: 'headtohead', scene: 'headtohead', group: 'full' },
  { key: 'profile', scene: 'profile', group: 'full' },
  { key: 'bracket', scene: 'bracket', group: 'full' },
  { key: 'standings', scene: 'standings', group: 'full' },
  { key: 'decklist', scene: 'decklist', group: 'full' },
  { key: 'decklists', scene: 'decklists', group: 'full' },
];

const BY_KEY = new Map(TILES.map((t) => [t.key, t]));
export const tileFor = (key) => BY_KEY.get(key) || null;

// One tile's bank: `bank` (the sample match or the preview bank) with only
// `scene` switched on, in the tile's variant when the tile draws that scene.
// Everything else off means nothing docks or stands down: the card popup
// does not give way to the dual columns' card slot, the sponsor plate does
// not dock into an overlay, the showdown strip does not hunt for a camera.
// Returns a copy; the bank passed in is never touched.
export function tileBank(bank, tileKey, scene) {
  const out = JSON.parse(JSON.stringify(bank));
  const tile = tileFor(tileKey);
  for (const key of Object.keys(out.scenes || {})) {
    out.scenes[key] = { ...out.scenes[key], visible: false };
  }
  if (out.scenes && out.scenes[scene]) {
    const vary = tile && tile.scene === scene && tile.vary ? tile.vary : {};
    out.scenes[scene] = { ...out.scenes[scene], ...vary, visible: true };
  }
  return out;
}
