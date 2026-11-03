/* The turntable model. One number, θ, is the truth: the mesh rotation, the
   read-out and the face index are all read from it, nothing animates on its own.

   drag    θ follows the hand; ω is measured from the last moves
   coast   released: ω decays by friction, e^(−F·t)
   settle  once ω drops under CAPTURE, a spring (k 100 · c 18 · m 1) pulls θ
           to the nearest quarter ahead of the motion — the detent
   rest    landed; after a pause the tour flicks it on to the next face        */

export const QUARTER = Math.PI / 2;
const FRICTION = 2.4;     // 1/s
const CAPTURE = 1.1;      // rad/s: below this the detent takes over
const K = 100, C = 18;    // Hairline's spring for a continuous value
const MAX_OMEGA = 28;     // a hard flick, clamped (rule 03)
const TOUR_PAUSE = 2.6;   // s at rest before the tour flicks on

export function createTurntable({ tour = true } = {}) {
  let theta = 0, omega = 0, target = 0, mode = 'rest', idle = 0, touched = false;
  const samples = [];

  const nearestAhead = () => Math.round((theta + omega * 0.18) / QUARTER) * QUARTER;

  return {
    get theta() { return theta; },
    // straight to a face, at rest: for still pictures
    jump(n) { theta = target = n * QUARTER; omega = 0; mode = 'rest'; idle = 0; },
    grab() { mode = 'drag'; samples.length = 0; touched = true; idle = 0; },
    drag(dθ, dt) {
      theta += dθ;
      samples.push(dθ / dt);
      if (samples.length > 4) samples.shift();
    },
    release() {
      const w = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
      omega = Math.max(-MAX_OMEGA, Math.min(MAX_OMEGA, w));
      mode = 'coast';
    },
    // A flick sized to travel n quarters: coast distance is (ω0 − capture) / F.
    flickBy(n) {
      const dir = Math.sign(n) || 1;
      omega = dir * (FRICTION * QUARTER * Math.abs(n) * 0.85 + CAPTURE);
      mode = 'coast'; idle = 0;
    },
    step(dt, holding) {
      if (holding) { idle = 0; return; }
      // fixed sub-steps keep the spring stable at any frame rate
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        if (mode === 'coast') {
          theta += omega * h;
          omega *= Math.exp(-FRICTION * h);
          if (Math.abs(omega) < CAPTURE) { mode = 'settle'; target = nearestAhead(); }
        } else if (mode === 'settle') {
          const a = -K * (theta - target) - C * omega;
          omega += a * h; theta += omega * h;
          if (Math.abs(theta - target) < 1e-4 && Math.abs(omega) < 1e-3) { theta = target; omega = 0; mode = 'rest'; }
        } else if (mode === 'rest') {
          idle += h;
          if (tour && idle > (touched ? TOUR_PAUSE * 2.5 : TOUR_PAUSE)) this.flickBy(1);
        }
      }
    },
    state() {
      const turns = theta / (Math.PI * 2);
      const deg = ((theta * 180 / Math.PI) % 360 + 360) % 360;
      const face = ((Math.round(theta / QUARTER) % 4) + 4) % 4 + 1;
      return { degrees: deg, omega, face, mode, turns };
    },
  };
}

/* A trackpad's two-finger swipe turns the platter as a hand on it would: the swipe is a
   drag (θ follows it, ω is measured from it), and when the events stop for a moment —
   fingers lifted and the system's own momentum spent — it is released to coast, and the
   detent catches it. Only a sideways swipe: one that is mostly vertical, or a pinch
   (ctrlKey), is left to the page. */
export function bindWheel(el, table, { onStart } = {}) {
  let active = false, last = 0, timer = 0;
  el.addEventListener('wheel', e => {
    if (e.ctrlKey) return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerWidth : 1;
    const dx = e.deltaX * k, dy = e.deltaY * k;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    e.preventDefault();
    const now = performance.now();
    if (!active) { active = true; table.grab(); onStart?.(); last = now - 16; }
    // fingers moving left scroll the content left (deltaX > 0): the platter's near edge goes with them
    table.drag((-dx / Math.min(window.innerWidth, 900)) * Math.PI * 1.2, Math.max(1, now - last) / 1000);
    last = now;
    clearTimeout(timer);
    timer = setTimeout(() => { active = false; table.release(); }, 80);
  }, { passive: false });
  return () => active;
}
