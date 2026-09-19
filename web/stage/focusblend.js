// One clock for a graphic's highlights (2026-09-19): the legend
// distribution's slices and rows, the standings' rows and the pairings'
// tables all grow, light up and dim on the scene's --fk, 0 to 1, a
// wall-clock seek clock like every other (stage/seekclock.js), so an
// occluded browser source lands on the settled pose.
//
// Each element carries its pose as pairs of custom properties, --<name>0
// (where it stood when the move began) and --<name>1 (where it is going),
// and the scene's CSS blends them:
//   calc(var(--b0, 0) + (var(--b1, 0) - var(--b0, 0)) * var(--fk, 1))
// A move first writes each element's pose on screen as its new start, so a
// second highlight mid-move carries on from where things are rather than
// jumping. A move must name every element that has a pose: one left out
// would replay its last move as the clock starts over.
import { SeekClock } from './seekclock.js';

export class FocusBlend {
  constructor(root, ms = 450) {
    this.root = root;
    this.clock = new SeekClock(root, '--fk', ms);
  }

  // Where the clock stands: the last value written, 1 when it never ran.
  at() {
    const v = parseFloat(this.root.style.getPropertyValue('--fk'));
    return Number.isFinite(v) ? v : 1;
  }

  // poses: [element, { name: value }] pairs. animate: play the move on the
  // clock; otherwise every element snaps to its pose. Resolves once the
  // move has landed (a move cut short by the next one never resolves).
  move(poses, animate) {
    const k = animate ? this.at() : 1;
    for (const [el, pose] of poses) {
      for (const [name, to] of Object.entries(pose)) {
        let from = to;
        if (animate) {
          const v0 = parseFloat(el.style.getPropertyValue(`--${name}0`)) || 0;
          const v1 = parseFloat(el.style.getPropertyValue(`--${name}1`)) || 0;
          from = v0 + (v1 - v0) * k;
        }
        el.style.setProperty(`--${name}0`, String(Math.round(from * 1000) / 1000));
        el.style.setProperty(`--${name}1`, String(to));
      }
    }
    if (animate) return this.clock.play({ from: 0, to: 1 });
    this.clock.stop();
    this.clock.seek(1);
    return Promise.resolve();
  }
}
