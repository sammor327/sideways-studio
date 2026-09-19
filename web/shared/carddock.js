// Where the card popup's card airs in one bank: on its own over the feed, or
// docked inside the in-game overlay that is up with its dock switched on.
// While an overlay docks the card the popup stands down, so the card never
// airs twice, and the overlay shows it only while it is the one docking it.
// Pure, so the scenes and the tests read the same rule.
//
//   igorows      the middle of the rows column (Dock featured card,
//                cardDock): the hands or the event logo slide out and the
//                card slides in, and they come back when the card goes.
//   igodual      the bottom-right slot (cardSlot): the card frame or player
//                2's cards in hand slide out and the card slides in, the
//                same way (2026-09-19; the hand used to keep the slot and
//                the popup flew instead).
//   igoportrait  the right pillar's well (cardWell).

// Each overlay's dock switch. All three default to on; a dock is on unless
// its switch is off.
const DOCK_SWITCH = { igorows: 'cardDock', igodual: 'cardSlot', igoportrait: 'cardWell' };
const HOSTS = Object.keys(DOCK_SWITCH);

const docks = (cfg, host) => Boolean(cfg) && cfg[DOCK_SWITCH[host]] !== false;

export function cardDockHost(bank) {
  const scenes = (bank && bank.scenes) || {};
  return HOSTS.find((host) => scenes[host] && scenes[host].visible && docks(scenes[host], host)) || '';
}

// The card `host` shows in its dock: the popup's card while the popup is on
// and the host's dock switch is, else null. The host's own on and off is
// left to its in and out, so a card staged while it is off is already in
// place when it comes on.
export function dockCard(bank, host) {
  const scenes = (bank && bank.scenes) || {};
  const cp = scenes.cardpopup;
  if (!DOCK_SWITCH[host] || !docks(scenes[host], host)) return null;
  if (!cp || !cp.visible || !cp.card || !cp.card.cardId) return null;
  return cp.card;
}

export const rowsDockCard = (bank) => dockCard(bank, 'igorows');
