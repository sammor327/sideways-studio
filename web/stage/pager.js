// Pages an operator turns by hand, animated: the standings' rows (2026-09-19,
// Sam: "animate between the pages and animate in"), shared with the
// pairings the same day.
//
// A scene hands over paint(want), which draws the page named by want.page,
// and calls the returned update(want, { first, visible, wasVisible }) on
// every state. Coming on, the page's rows come in one after another from the
// top (--r); a page change takes the old rows out the same way (--o) and
// brings the new page in, the next page from the right as the old one leaves
// to the left, the previous page the other way round. Wall-clock seek clocks
// like --t, so an occluded browser source lands on the settled page, never a
// half-drawn one. The scene's CSS turns --r, --o, each row's --pos (its place
// down the page, 0 to 1) and --in-dx / --out-dx (the travel in design
// pixels) into the rows' opacity and offset: see standings/scene.css.
import { SeekClock } from './seekclock.js';

export function createPager(root, paint, { enterMs = 1000, turnInMs = 720, outMs = 380 } = {}) {
  const rowsIn = new SeekClock(root, '--r', enterMs);
  const rowsOut = new SeekClock(root, '--o', outMs);

  // What the state asks for, and which page the frame shows. They differ only
  // while a page turn plays: the turn swaps in whatever is wanted once the old
  // rows have left, so a refresh or a second click mid-turn is never lost and
  // never cuts the turn short.
  let want = null;
  let shownPage = null;
  let turning = false;
  let turnToken = 0;

  function paintPage() {
    paint(want);
    shownPage = want.page;
  }

  function setTravel(dir) {
    root.style.setProperty('--in-dx', String(dir > 0 ? 72 : -72));
    root.style.setProperty('--out-dx', String(dir > 0 ? -72 : 72));
  }

  function settle() {
    turnToken += 1;
    turning = false;
    rowsOut.stop();
    rowsIn.stop();
    rowsOut.seek(0);
    rowsIn.seek(1);
  }

  async function turnPage() {
    const token = ++turnToken;
    turning = true;
    while (want && shownPage !== want.page) {
      setTravel(want.page > shownPage ? 1 : -1);
      rowsIn.stop();
      rowsIn.seek(1);
      await rowsOut.play({ from: 0, to: 1 });
      if (token !== turnToken) return;
      paintPage();
      rowsOut.seek(0);
      rowsIn.duration = turnInMs;
      await rowsIn.play({ from: 0, to: 1 });
      if (token !== turnToken) return;
    }
    // Numbers that changed on this page while its rows came in.
    if (want) paintPage();
    turning = false;
  }

  return function update(next, { first, visible, wasVisible }) {
    want = next;
    if (first || shownPage === null) {
      // The first frame: the page as it stands, settled.
      settle();
      paintPage();
    } else if (visible && wasVisible !== true) {
      // Coming on: the wanted page, its rows in one after another.
      settle();
      paintPage();
      setTravel(-1);
      rowsIn.duration = enterMs;
      rowsIn.play({ from: 0, to: 1 });
    } else if (!visible) {
      // Off air (or fading out): a turn already playing finishes under the
      // fade; otherwise the page just follows the state for next time.
      if (!turning) paintPage();
    } else if (want.page !== shownPage) {
      if (!turning) turnPage();
    } else if (!turning) {
      // Same page, new numbers (a refresh): straight in, no motion.
      paintPage();
    }
  };
}
