import { createTurntable, bindWheel } from '../lib/turntable.js';
import { Cam, proj, toward, prism3, hull, inside, circ } from '../lib/iso.js';
import { buildPlatter, PLATTER_R } from '../lib/platter-svg.js';
import { fillKeyed } from '../lib/keyed-fill.js';
import { atlas, restHeights, restHull, CELLS, EXTENT, AMP, CAP, PB, KS, CS } from './scene.js';

/* Motion · 02 — a spring atlas on the turntable, after Hairline's Terrain.

   One model drives everything (Kaero): θ, the turntable, and for each of the 81 springs
   its stretch x and speed v. A pillar stands at its rest height (how long its spring
   takes to settle) plus AMP · x. Plucked, each spring is lifted and let go, and from
   then on obeys only its own two numbers: ẍ = −k x − c ẋ, in real time.

   Hover    the pillar under the pointer is lifted a little and let go; it takes the
            bright edge and the read-out gives its k · c · ζ · settle.
   Tap      sends a ring out across the field from where you tapped (rule 02: stagger
            by distance), kicking each spring as it passes; each region rings at its own
            rate and dies its own way. Tap again and again and the rings follow one
            another out, crossing and stacking. Space or Pluck all, out from the middle.
   Drag     spins the turntable; a trackpad swipe too. ← → a quarter turn.          */

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const readout = document.getElementById('readout');
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };

/* ---- the frame (rule 03) ---------------------------------------------------- */
const C = Cam(45, 0.5, 1);
{
  const P = proj(C), pts = [];
  for (const [r, z] of [[PLATTER_R, 0], [PLATTER_R, -7.3], [PLATTER_R * 0.88, -20], [EXTENT.r, EXTENT.top], [EXTENT.r, 0]])
    for (const q of circ(0, 0, r, 96)) pts.push(P(q.u, q.v, z));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 6;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  svg.setAttribute('viewBox', `${x0} ${y0} ${Math.max(...xs) - x0 + pad} ${Math.max(...ys) - y0 + pad}`);
}
function layout() {
  const top = 64, bottom = document.querySelector('.bottom').offsetHeight + 8;
  svg.style.top = top + 'px';
  svg.style.height = Math.max(160, window.innerHeight - top - bottom) + 'px';
}
window.addEventListener('resize', layout);
layout();

const root = mk('g', '', svg);
const base = buildPlatter();
const baseG = mk('g', '', root), backG = mk('g', '', root), fieldG = mk('g', '', root), frontG = mk('g', '', root);
function fill(g, list) {
  while (g.childElementCount < list.length) mk('path', '', g);
  while (g.childElementCount > list.length) g.lastChild.remove();
  list.forEach(([cls, d], i) => { const e = g.children[i]; if (e.getAttribute('class') !== cls) e.setAttribute('class', cls); if (e.getAttribute('d') !== d) e.setAttribute('d', d); });
}
function setAz() { C.az = (45 * Math.PI) / 180 - table.theta; }

/* ---- the model: 81 springs -------------------------------------------------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const table = createTurntable({ tour: false });
const NC = CELLS.length, REST = restHeights();
const X = new Float64Array(NC), V = new Float64Array(NC);
const LIFT = new Float64Array(NC).fill(-1);            // seconds into its lift; −1 free
const FROM = new Float64Array(NC), TO = new Float64Array(NC);
const LIFT_S = 0.14;                        // the lift itself: quick, then let go; how high kicks can stack
const ease = t => 1 - Math.pow(1 - t, 3);
let awake = 0;                                         // springs not yet still: the loop sleeps at 0 (rule 07)

// a kick: lift this spring by `amount` from wherever it is now, then let it go. Kicks add,
// so a spring caught mid-swing by a second wave is thrown again, not reset.
function kick(n, amount) {
  if (reduced) return;
  FROM[n] = X[n]; TO[n] = Math.min(CAP, X[n] + amount); LIFT[n] = 0; V[n] = 0;
}
const pluck = kick;
// Waves: each tap sends its own ring out across the field, at a steady speed (rule 02:
// stagger by distance). A spring is kicked as a ring passes it; rings cross and stack.
const SPEED = 150;                                     // mm a second
const waves = [];
const REACH = Math.hypot(EXTENT.r, EXTENT.r);
function pluckAll(cx = 0, cy = 0, amount = 1) {
  if (reduced) return;
  waves.push({ cx, cy, r: -1e-6, amount });
}
function stepWaves(dt) {
  for (let w = waves.length - 1; w >= 0; w--) {
    const wv = waves[w], r0 = wv.r, r1 = r0 + SPEED * dt;
    CELLS.forEach((c, n) => { const d = Math.hypot(c.cx - wv.cx, c.cy - wv.cy); if (d > r0 && d <= r1) kick(n, wv.amount); });
    wv.r = r1;
    if (r1 > REACH) waves.splice(w, 1);
  }
}
function stepSprings(dt) {
  stepWaves(dt);
  awake = waves.length ? 1 : 0;
  let live = 0;
  const sub = Math.max(1, Math.ceil(dt * 480)), h = dt / sub;
  for (let n = 0; n < NC; n++) {
    if (LIFT[n] >= 0) {
      LIFT[n] += dt;
      const t = Math.min(1, LIFT[n] / LIFT_S);
      X[n] = FROM[n] + (TO[n] - FROM[n]) * ease(t); V[n] = 0;
      if (t >= 1) LIFT[n] = -1;
      live++;
      continue;
    }
    if (X[n] === 0 && V[n] === 0) continue;
    const { k, c } = CELLS[n];
    let x = X[n], v = V[n];
    for (let s = 0; s < sub; s++) { v += (-k * x - c * v) * h; x += v * h; }
    if (Math.abs(x) < 0.002 && Math.abs(v) < 0.02) { x = 0; v = 0; } else live++;
    X[n] = x; V[n] = v;
  }
  ringing = live;
  awake = Math.max(awake, live);
}
let ringing = 0;
const heights = () => CELLS.map((c, n) => REST[n] + AMP * X[n]);

/* ---- pointer: tested against the pillars at rest (rule 01) -------------------- */
function toView(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}
let hulls = null, hullsAt = NaN;
function pick(pt) {
  if (hullsAt !== table.theta) {
    setAz();
    const P = proj(C), T = toward(C);
    const near = CELLS.map((c, n) => ({ n, key: T[0] * c.cx + T[1] * c.cy })).sort((a, b) => b.key - a.key);
    const half = EXTENT.r / Math.SQRT2, top = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) top.push(P(sx * half, sy * half, 0), P(sx * half, sy * half, PB + 18));
    hulls = { field: hull(top), cells: near.map(({ n }) => ({ n, shape: restHull(P, n) })) };
    hullsAt = table.theta;
  }
  if (!inside(pt, hulls.field)) return null;
  for (const { n, shape } of hulls.cells) if (inside(pt, shape)) return n;
  return -1;                                           // over the plinth, between pillars
}

let hot = -1, hover = -1, touchHotUntil = 0, clock = 0, slow = false, frozen = false;
let dragging = false, dragged = false, lastX = 0, lastT = 0, downX = 0, downY = 0, idle = 0;
svg.addEventListener('pointerdown', e => {
  dragging = true; dragged = false; lastX = downX = e.clientX; downY = e.clientY; lastT = performance.now();
  svg.setPointerCapture(e.pointerId);
  idle = 0; stopTour();
});
svg.addEventListener('pointermove', e => {
  if (dragging) idle = 0;
  if (dragging && !dragged && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) { dragged = true; svg.classList.add('dragging'); table.grab(); }
  if (dragging && dragged) {
    const now = performance.now();
    table.drag(((e.clientX - lastX) / Math.min(window.innerWidth, 900)) * Math.PI * 1.2, Math.max(1, now - lastT) / 1000);
    lastX = e.clientX; lastT = now;
    return;
  }
  if (e.pointerType !== 'mouse' || dragging || table.state().mode !== 'rest') return;
  const n = pick(toView(e));
  if (n === null) { hover = -1; hot = -1; return; }
  stopTour(); idle = 0;
  if (n >= 0 && n !== hover) { hover = hot = n; pluck(n, 0.45); }
});
const release = e => {
  if (!dragging) return;
  dragging = false; svg.classList.remove('dragging');
  if (dragged) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); return; }
  const n = pick(toView(e));
  if (n === null) return;
  if (n >= 0) { hot = n; if (e.pointerType !== 'mouse') touchHotUntil = clock + 2.4; pluckAll(CELLS[n].cx, CELLS[n].cy); }
  else pluckAll();
};
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !dragging) { hover = -1; hot = -1; } });
bindWheel(svg, table, { onStart: () => { idle = 0; stopTour(); hover = -1; hot = -1; } });
svg.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') { table.flickBy(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
  else if (k === ' ' || k === 'Enter') { pluckAll(); e.preventDefault(); }
  else if (k === 'Escape') hot = -1;
  else return;
  idle = 0; stopTour();
});

/* ---- controls --------------------------------------------------------------- */
const stroke = document.getElementById('stroke'), pluckBtn = document.getElementById('pluck');
const slowBtn = document.getElementById('slow'), themeBtn = document.getElementById('theme');
let look = 0;
const applyLook = () => { document.documentElement.style.setProperty('--hl-sw', stroke.value); look++; };
stroke.addEventListener('input', applyLook);
pluckBtn.addEventListener('click', () => { idle = 0; stopTour(); pluckAll(); });
slowBtn.addEventListener('click', () => { slow = !slow; slowBtn.setAttribute('aria-pressed', slow); });
const sysDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : sysDark.matches; };
function syncTheme() {
  const dark = isDark();
  themeBtn.setAttribute('aria-pressed', dark);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#131311' : '#f4f2eb';
}
themeBtn.addEventListener('click', () => { document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'; syncTheme(); });
sysDark.addEventListener('change', syncTheme);
syncTheme();
applyLook();

/* ---- the tour: the field, then three springs that each answer differently, then a leave */
const cell = (k, c) => KS.indexOf(k) + CS.indexOf(c) * KS.length;
const HAIRLINE = cell(100, 18), RINGS = cell(40, 2), CREEPS = cell(40, 40);
const show = n => () => { hot = n; pluck(n, 0.8); };
const TOUR = [[1.0, () => pluckAll()], [4.8, show(HAIRLINE)], [6.6, show(RINGS)], [9.6, show(CREEPS)], [12.0, () => (hot = -1)], [12.8, () => table.flickBy(1)]];
let tourT = 0, tourOn = !reduced, tourStep = 0;
function stopTour() { if (tourOn && tourStep > 0) hot = -1; tourOn = false; tourT = 0; tourStep = 0; }
function stepTour(dt) {
  if (reduced) return;
  if (!tourOn) {
    idle += dt;
    if (hover >= 0) idle = 0;
    if (!dragging && idle > 8 && awake === 0 && table.state().mode === 'rest') { tourOn = true; tourT = 0; tourStep = 0; }
    return;
  }
  if (tourStep === TOUR.length) { if (table.state().mode === 'rest') { tourT = 0; tourStep = 0; } else return; }
  tourT += dt;
  while (tourStep < TOUR.length && tourT >= TOUR[tourStep][0]) TOUR[tourStep++][1]();
}

// ?turn=n turns n quarters, ?hot=n chooses cell n, ?pluck=t shows the field t s after a pluck
{
  const q = location.search, t = q.match(/[?&]turn=([\d.]+)/), h = q.match(/[?&]hot=(\d+)/), p = q.match(/[?&]pluck=([\d.]+)/);
  if (t || h || p) tourOn = false;
  if (t) table.jump(+t[1]);
  if (h) hot = +h[1];
  if (p) { pluckAll(); for (let s = 0; s < +p[1]; s += 1 / 120) stepSprings(1 / 120); frozen = true; }
}

/* ---- loop: rewritten only when something moved (rule 07) ------------------------ */
let prev = performance.now(), lastText = '', lastKey = '';
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000) * (slow ? 0.25 : 1);
  prev = now; clock += dt;
  table.step(dt, dragging && dragged);
  stepTour(dt);
  if (!frozen) stepSprings(dt);
  if (touchHotUntil && clock > touchHotUntil) { touchHotUntil = 0; hot = -1; }
  const s = table.state(), c = CELLS[hot];
  const part = c ? `k ${c.k} · c ${c.c} · ζ ${c.zeta.toFixed(2)} · settle ${c.settle.toFixed(2)} s`
    : awake ? `ringing <b>${String(ringing).padStart(2, '0')}</b>/${NC}` : 'rest';
  const text = `θ ${String(Math.round(s.degrees)).padStart(3, '0')}° · face <b>${s.face}</b>/4 · ${part}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }
  const key = awake ? `${clock}` : `${table.theta.toFixed(5)}|${hot}|${look}`;
  if (key !== lastKey) {
    setAz();
    const P = proj(C), T = toward(C), k = (x, y) => T[0] * x + T[1] * y;
    const pl = [];
    for (const p of base.slice(0, 2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); pl.push(['sil', d.sil], ['cr', d.crease]); }
    fill(baseG, pl);
    const back = [], front = [];
    for (const p of base.slice(2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); (k(p.frame.o[0], p.frame.o[1]) < 0 ? back : front).push(['sil', d.sil], ['cr', d.crease]); }
    fill(backG, back); fill(frontG, front);
    fillKeyed(fieldG, atlas(P, T, heights(), hot));
    lastKey = key;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
