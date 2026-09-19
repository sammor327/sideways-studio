// Things that take turns in one place on an overlay (2026-09-19): the
// middle of the rows column (the event logo, the hands, a docked card) and
// the bottom of the dual columns (the event block or player 1's hand; the
// card frame, player 2's hand or a docked card). Whatever is there slides
// out before the next one slides in. Every move runs on a SeekClock, so an
// occluded browser source never freezes one; the scene's CSS turns each
// clock into its slide (0 out, 1 in, every read var(--x, 1)) and hides
// `.gone`.
import { SeekClock } from './seekclock.js';
import { chainLoad } from './art.js';

// What a move overtaken by the next one hands to anything waiting on it: a
// promise that never settles, so nothing fires late.
export const never = () => new Promise(() => {});

// Something that slides out of its place and back in: an event logo or
// block, a player's hand, the rule between two hands. `set` returns the
// move, so one slide can wait for another: the hands come in once the logo
// is out, the logo comes back once the hands are out. Asked again for the
// way it is already going, it hands back the move under way rather than a
// settled one, so a later state push never lets the next thing in early.
// A move overtaken by the opposite one never settles; one called off before
// its turn came (or while still at 0) has nothing to slide and settles at
// once.
export class Slider {
  constructor(el, prop, ms) {
    this.el = el;
    this.prop = prop;
    this.clock = new SeekClock(el, prop, ms);
    this.on = null;
    this.moving = Promise.resolve();
  }

  now() {
    const v = parseFloat(this.el.style.getPropertyValue(this.prop));
    return Number.isFinite(v) ? v : (this.on ? 0 : 1);
  }

  set(show, first, wait = Promise.resolve()) {
    if (show === this.on) return this.moving;
    this.on = show;
    if (first) {
      this.el.classList.toggle('gone', !show);
      this.clock.seek(show ? 1 : 0);
      return (this.moving = Promise.resolve());
    }
    if (show) {
      if (this.el.classList.contains('gone')) this.clock.seek(0);
      this.clock.stop();
      return (this.moving = wait.then(() => {
        if (!this.on) return never();
        this.el.classList.remove('gone');
        return this.clock.play({ from: this.now(), to: 1 });
      }));
    }
    if (this.el.classList.contains('gone') || this.now() <= 0) {
      this.clock.stop();
      this.clock.seek(0);
      this.el.classList.add('gone');
      return (this.moving = Promise.resolve());
    }
    return (this.moving = this.clock.play({ from: this.now(), to: 0 }).then(() => {
      if (!this.on) this.el.classList.add('gone');
    }));
  }
}

// A place whose content changes: a docked card, the next card, or on the
// dual columns the empty card frame. `set(item)` slides out whatever is
// showing when it is not `item`, has the scene fill `item` in out of sight
// (`fill` settles once its art is up), and slides it in once `wait` has
// settled as well; `set(null)` slides it out and leaves it gone. An item
// asked back while it is on its way out turns round where it stands, and
// an item leaving keeps its content until it is out of sight. `key` names
// an item, so the same card asked for twice is one move.
export class SwapSlot {
  constructor(el, prop, ms, { fill, key = (item) => item.key }) {
    this.el = el;
    this.prop = prop;
    this.clock = new SeekClock(el, prop, ms);
    this.fill = fill;
    this.key = key;
    this.want = undefined; // key of the item wanted, null for none
    this.have = null; // key of the item the content is of
    this.gen = 0;
    this.moving = Promise.resolve();
  }

  now() {
    const v = parseFloat(this.el.style.getPropertyValue(this.prop));
    return Number.isFinite(v) ? v : 0;
  }

  gone() {
    return this.el.classList.contains('gone');
  }

  fillWith(item, k) {
    this.have = k;
    return this.fill(item);
  }

  // Returns the move, like Slider.set: settled once the item is fully in or
  // the place is empty, never if the next move overtakes it.
  set(item, first, wait = Promise.resolve()) {
    const k = item ? String(this.key(item)) : null;
    if (k === this.want) return this.moving;
    this.want = k;
    const gen = ++this.gen;
    const live = () => gen === this.gen;
    this.clock.stop();
    if (first) {
      if (item) this.fillWith(item, k);
      this.el.classList.toggle('gone', !item);
      this.clock.seek(item ? 1 : 0);
      return (this.moving = Promise.resolve());
    }
    if (item && k === this.have && !this.gone()) {
      return (this.moving = this.clock.play({ from: this.now(), to: 1 }));
    }
    const out = this.gone() || this.now() <= 0 ? Promise.resolve() : this.clock.play({ from: this.now(), to: 0 });
    const cleared = out.then(() => {
      if (!live()) return never();
      this.el.classList.add('gone');
      return undefined;
    });
    if (!item) return (this.moving = cleared);
    return (this.moving = cleared
      .then(() => (live() ? Promise.all([wait, k === this.have ? null : this.fillWith(item, k)]) : never()))
      .then(() => {
        if (!live()) return never();
        this.el.classList.remove('gone');
        return this.clock.play({ from: 0, to: 1 });
      }));
  }
}

// Art into `img` through the chain `steps` (art.js), settling once the
// image is up or the chain has run out, or after `cap` ms, whichever comes
// first. A file that lands after the cap still shows; it just holds nothing
// up. onShow and onFail run whenever the image lands or the chain runs out,
// cap or no cap.
export function loadArt(img, steps, { cap = 1200, onShow, onFail } = {}) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, cap);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    chainLoad(img, steps, () => {
      if (onShow) onShow(img);
      done();
    });
    if (!steps.length) {
      if (onFail) onFail(img);
      done();
      return;
    }
    const next = img.onerror;
    img.onerror = () => {
      next();
      if (!img.getAttribute('src')) {
        if (onFail) onFail(img);
        done();
      }
    };
  });
}
