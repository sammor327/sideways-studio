// Side sheets (2026-09-19): the odds to draw and the trash. One player's cards
// on a plate at that player's side of the game window of whichever in-game
// overlay is up (web/shared/gamewindow.js), player 1 against its left edge and
// player 2 against its right, or both at once. The plate flies in from its own
// frame edge, its rows rise in after it, and a list longer than the plate
// holds plays the hand lists' hold / scroll / hold cycle.
//
// Heights are counted from the rows, never measured: a browser source that is
// not drawing reports no layout (the hand lists' rule).
import { SeekClock } from './seekclock.js';
import { chainLoad, clearArt, legendSteps } from './art.js';
import { HandScroller } from './exp.js';
import { setText } from './stage.js';
import { SHEET_W } from '../shared/sidesheets.js';

// The layout arithmetic lives in web/shared/sidesheets.js, where the tests
// can reach it; the scenes import it from here.
export { SHEET_W, placeSheets, rowsThatFit, sheetHeight, sheetSlots, sheetSides } from '../shared/sidesheets.js';

// One player's sheet, built from the page's #sheetTpl into its own box.
export class Sheet {
  constructor(key, tag) {
    this.key = key;
    this.pos = document.getElementById(`${key === 'left' ? 'l' : 'r'}pos`);
    this.pos.append(document.getElementById('sheetTpl').content.cloneNode(true));
    this.part = (name) => this.pos.querySelector(`[data-part="${name}"]`);
    setText(this.part('tag'), tag);
    this.face = null;
    this.rowsKey = null;
    this.scroller = new HandScroller(this.part('view'), this.part('list'));
  }

  show(on) {
    this.pos.classList.toggle('gone', !on);
  }

  head(side, sub) {
    setText(this.part('name'), side.name || ' ');
    setText(this.part('country'), side.country || '');
    setText(this.part('sub'), sub);
    const faceKey = `${side.legendCardId}|${side.legendSlug}`;
    if (faceKey !== this.face) {
      this.face = faceKey;
      const steps = legendSteps(side);
      if (steps.length) chainLoad(this.part('face'), steps);
      else clearArt(this.part('face'));
    }
  }

  // The rows, rebuilt only when `key` changes, so a score bump never restarts
  // an image load; a new list starts its scroll back at the top.
  rows(key, build) {
    if (key === this.rowsKey) return;
    this.rowsKey = key;
    const rows = build();
    rows.forEach((row, i) => row.style.setProperty('--i', String(i)));
    this.part('list').replaceChildren(...rows);
    this.scroller.restart();
  }

  foot(text) {
    setText(this.part('foot'), text);
    this.part('foot').classList.toggle('gone', !text);
  }

  place({ x, y, scale }, { height, viewRows, rowH, delay }) {
    const s = this.pos.style;
    s.setProperty('--gx', x.toFixed(1));
    s.setProperty('--gy', y.toFixed(1));
    s.setProperty('--gs', scale.toFixed(4));
    s.setProperty('--ph', String(height));
    s.setProperty('--vr', String(viewRows));
    s.setProperty('--rh', String(rowH));
    s.setProperty('--d', String(delay));
    // Start fully off the frame edge on the player's side.
    const dx = this.key === 'left' ? -(x / scale + SHEET_W + 60) : ((1920 - x) / scale + 60);
    s.setProperty('--dx', dx.toFixed(1));
  }
}

// Show and hide on --t: the first answer snaps (a reloaded browser source must
// not replay the fly), later ones play in (slower) or out (quicker).
export class SheetVisibility {
  constructor(root) {
    this.root = root;
    this.inClock = new SeekClock(root, '--t', 1100);
    this.outClock = new SeekClock(root, '--t', 450);
    this.shown = null;
  }

  set(visible) {
    if (visible === this.shown) return;
    const first = this.shown === null;
    this.shown = visible;
    if (first) {
      this.root.classList.toggle('off', !visible);
      this.inClock.seek(visible ? 1 : 0);
      return;
    }
    if (visible) {
      this.outClock.stop();
      this.root.classList.remove('off');
      this.inClock.play({ from: 0, to: 1 });
    } else {
      this.inClock.stop();
      this.outClock.play({ from: 1, to: 0 }).then(() => { if (!this.shown) this.root.classList.add('off'); });
    }
  }
}
