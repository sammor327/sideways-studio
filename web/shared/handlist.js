// Cards in hand as the rows overlay and the dual columns list them: the hand
// in the order the spotter typed it, copies of a card on one row with a
// count, and the hold / scroll / hold cycle a list longer than its box plays.
// Pure arithmetic, shared by the scenes (stage/exp.js) and the tests.

// One row per card, in the order each card first appears. A copy on the
// chain is its own row, apart from the copies still held, so a played copy
// greys out while the rest keep reading as in hand.
export function groupHand(list) {
  const rows = [];
  const at = new Map();
  for (const c of list || []) {
    if (!c || typeof c !== 'object') continue;
    const key = `${c.cardId || c.cardName || ''}|${c.played ? 1 : 0}`;
    const row = at.get(key);
    if (row) {
      row.qty += 1;
      continue;
    }
    const fresh = { ...c, qty: 1 };
    at.set(key, fresh);
    rows.push(fresh);
  }
  return rows;
}

// Five seconds at the top, and again at the bottom.
export const SCROLL_HOLD_MS = 5000;

// One trip from top to bottom: a third of the box a second, so a list one
// box too long travels in three seconds, never quicker than one second or
// slower than eight. Rounded to quarter seconds so a pixel of difference in
// a measurement never moves the cycle.
export function scrollTravelMs(overflow, view) {
  if (!(overflow > 0) || !(view > 0)) return 0;
  const ms = Math.min(8000, Math.max(1000, (overflow / view) * 3000));
  return Math.round(ms / 250) * 250;
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

// Where the list sits `elapsed` ms into its cycle: hold at the top, travel
// down, hold at the bottom, travel back up, round again. offset 0 is the
// top and `overflow` the bottom; `moving` and `next` (ms until the hold
// ends) tell the caller how soon it needs to look again. A travel of 0
// snaps between the two holds, for sources with animation switched off.
export function scrollAt(elapsed, overflow, travel, hold = SCROLL_HOLD_MS) {
  if (!(overflow > 0)) return { offset: 0, moving: false, next: Infinity };
  const period = 2 * (hold + travel);
  const p = ((elapsed % period) + period) % period;
  if (p < hold) return { offset: 0, moving: false, next: hold - p };
  if (p < hold + travel) return { offset: overflow * ease((p - hold) / travel), moving: true, next: 0 };
  if (p < 2 * hold + travel) return { offset: overflow, moving: false, next: 2 * hold + travel - p };
  return { offset: overflow * (1 - ease((p - 2 * hold - travel) / travel)), moving: true, next: 0 };
}
