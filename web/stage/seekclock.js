// Occlusion-proof animation clocks (broadcast-line-handoff §3.2).
// A hidden OBS/vMix browser source starves requestAnimationFrame to zero and
// freezes CSS animation timelines, so ALL motion here derives from wall-clock
// setInterval ticks writing CSS custom properties. JS computes the eased
// value; CSS only multiplies. Under timer throttling the failure mode is
// coarser animation, never frozen animation.
//
// Fail-open rule: every CSS read of a clock property must use var(--x, 1) so
// a clock that never started renders the SETTLED state, not an invisible one.

const TICK_MS = 40;

export function animEnabled() {
  if (new URLSearchParams(location.search).get('anim') === '0') return false;
  // CSS-side reduced-motion rules cannot neutralize JS-written properties,
  // so the check has to live here.
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

// Drives one custom property between two values over a duration.
// play() resolves when settled; a new play() call supersedes a running one.
export class SeekClock {
  constructor(el, prop, duration) {
    this.el = el;
    this.prop = prop;
    this.duration = duration;
    this.timer = null;
  }

  seek(v) {
    this.el.style.setProperty(this.prop, String(v));
  }

  play({ from = 0, to = 1 } = {}) {
    clearInterval(this.timer);
    if (!animEnabled()) {
      this.seek(to);
      return Promise.resolve();
    }
    const t0 = Date.now();
    this.seek(from);
    return new Promise((resolve) => {
      this.timer = setInterval(() => {
        const t = Math.min((Date.now() - t0) / this.duration, 1);
        this.seek(from + (to - from) * easeInOut(t));
        if (t >= 1) {
          clearInterval(this.timer);
          this.timer = null;
          resolve();
        }
      }, TICK_MS);
    });
  }
}

// One-shot 0 -> 1 -> 0 pulse for data-change micro-animations (score bumps,
// tick fills). The waveform is computed here so scene CSS stays a plain
// multiply — no CSS trig, which older OBS CEF builds lack.
export function bump(el, prop, duration = 450) {
  if (!animEnabled()) return;
  const key = `__bump_${prop}`;
  clearInterval(el[key]);
  const t0 = Date.now();
  el[key] = setInterval(() => {
    const t = Math.min((Date.now() - t0) / duration, 1);
    el.style.setProperty(prop, String(Math.sin(Math.PI * t)));
    if (t >= 1) {
      clearInterval(el[key]);
      el.style.setProperty(prop, '0');
    }
  }, TICK_MS);
}

// Ambient loop: cycles 0 -> 1 forever for background shimmer. One per
// (element, property); intentionally never cleared — it IS the ambient motion.
// Ambient ticks are deliberately slow (a browser source pays for every style
// write, and streamers run many sources), and opts.active lets a scene stop
// paying entirely while its graphic is hidden.
const loops = new Set();
export function startLoop(el, prop, period, { tickMs = 150, active } = {}) {
  const key = `${prop}@${period}`;
  if (loops.has(key)) return;
  loops.add(key);
  if (!animEnabled()) {
    el.style.setProperty(prop, '0');
    return;
  }
  const t0 = Date.now();
  setInterval(() => {
    if (active && !active()) return;
    el.style.setProperty(prop, String(((Date.now() - t0) % period) / period));
  }, tickMs);
}
