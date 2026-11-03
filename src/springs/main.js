import { createTurntable, bindWheel } from '../lib/turntable.js';
import { Cam, proj, toward, prism3, hull, inside, circ, clamp } from '../lib/iso.js';
import { buildPlatter, PLATTER_R } from '../lib/platter-svg.js';
import { rack, restLine, SPRINGS, EXTENT } from './scene.js';

/* Motion · 01b — the spring rack, on the turntable: four springs, four pairs of k and c,
   a weight on each.

   One model drives everything (Kaero): θ, the turntable, and per spring y and its speed,
   the weight's pull below where it hangs. Each spring moves by its own numbers alone,
   a = −k·y − c·v (mass 1); the read-out is the chosen spring's numbers.

   Hover    picks the spring nearest the pointer (tested against where they hang at
            rest, rule 01); its weight takes the bright edge (rule 04).
   Pull     press a weight and drag down: it follows the hand, as far as 30 mm (rule 03);
            let go and it answers by its k and c.
   Tap      a weight plucks it, 24 mm. Pluck all, or space, plucks the four at once.
   Drag     anywhere else spins the turntable; a trackpad swipe too.                 */

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const readout = document.getElementById('readout');
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };
const N = SPRINGS.length;

/* ---- the frame (rule 03) ---------------------------------------------------- */
const C = Cam(45, 0.5, 1);
{
  const P = proj(C), pts = [];
  for (const [r, z] of [[PLATTER_R, 0], [PLATTER_R, -7.3], [PLATTER_R * 0.88, -20], [EXTENT.r, EXTENT.top]])
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
const baseG = mk('g', '', root), backG = mk('g', '', root), rackG = mk('g', '', root), frontG = mk('g', '', root);
function fill(g, list) {
  while (g.childElementCount < list.length) mk('path', '', g);
  while (g.childElementCount > list.length) g.lastChild.remove();
  list.forEach(([cls, d], i) => { const e = g.children[i]; if (e.getAttribute('class') !== cls) e.setAttribute('class', cls); if (e.getAttribute('d') !== d) e.setAttribute('d', d); });
}
function setAz() { C.az = (45 * Math.PI) / 180 - table.theta; }

/* ---- the model -------------------------------------------------------------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const table = createTurntable({ tour: false });
const state = SPRINGS.map(() => ({ y: 0, v: 0, held: false }));
const PULL = 30, PLUCK = 24;
let act = -1, slow = false;
function stepSprings(dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 480))), h = dt / n;
  SPRINGS.forEach((s, i) => {
    const w = state[i];
    if (w.held) return;
    if (reduced) { w.y = 0; w.v = 0; return; }
    for (let j = 0; j < n; j++) { w.v += (-s.k * w.y - s.c * w.v) * h; w.y += w.v * h; }
    // a soft spring may not be squeezed shut: it bottoms out on its coils
    if (w.y < -PULL) { w.y = -PULL; w.v = 0; }
    if (Math.abs(w.y) < 0.005 && Math.abs(w.v) < 0.01) { w.y = 0; w.v = 0; }
  });
}
const pluck = i => { state[i].y = PLUCK; state[i].v = 0; state[i].held = false; };
const pluckAll = () => SPRINGS.forEach((_, i) => pluck(i));

/* ---- pointer ---------------------------------------------------------------- */
function toView(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}
function overRack(pt) {
  setAz();
  const P = proj(C), ring = circ(0, 0, EXTENT.r + 4, 32);
  return inside(pt, hull(ring.map(q => P(q.u, q.v, 0)).concat(ring.map(q => P(q.u, q.v, EXTENT.top)))));
}
// the spring whose line at rest is nearest pt, and how near
function nearest(pt) {
  setAz();
  const P = proj(C);
  let best = -1, bd = Infinity;
  SPRINGS.forEach((s, i) => {
    const [a, b] = restLine(P, s), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const u = clamp(((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2, 0, 1.3);
    const d = Math.hypot(pt[0] - (a[0] + u * dx), pt[1] - (a[1] + u * dy));
    if (d < bd) { bd = d; best = i; }
  });
  return { i: best, d: bd };
}
const GRAB = 13;                                         // viewBox units: how near a weight counts as on it

let dragging = false, dragged = false, grabbed = -1, grabY = 0, lastX = 0, lastT = 0, downX = 0, downY = 0, idle = 0, pointerIn = false;
svg.addEventListener('pointerdown', e => {
  dragging = true; dragged = false; lastX = downX = e.clientX; downY = e.clientY; lastT = performance.now();
  svg.setPointerCapture(e.pointerId);
  idle = 0; stopTour();
  const pt = toView(e), n = nearest(pt);
  grabbed = overRack(pt) && n.d < GRAB ? n.i : -1;
  if (grabbed >= 0) { act = grabbed; grabY = pt[1]; state[grabbed].held = true; state[grabbed].v = 0; }
});
svg.addEventListener('pointermove', e => {
  if (dragging) idle = 0;
  if (dragging && grabbed >= 0) {
    // down the screen is down the spring: viewBox y per mm of z is cos 30°
    const pt = toView(e);
    if (Math.abs(pt[1] - grabY) > 1.5) dragged = true;
    state[grabbed].y = clamp((pt[1] - grabY) / Math.sqrt(0.75), 0, PULL);
    return;
  }
  if (dragging && !dragged && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) { dragged = true; svg.classList.add('dragging'); table.grab(); }
  if (dragging && dragged) {
    const now = performance.now();
    table.drag(((e.clientX - lastX) / Math.min(window.innerWidth, 900)) * Math.PI * 1.2, Math.max(1, now - lastT) / 1000);
    lastX = e.clientX; lastT = now;
    return;
  }
  if (e.pointerType === 'mouse') {
    const pt = toView(e);
    pointerIn = overRack(pt);
    if (pointerIn) { stopTour(); act = nearest(pt).i; } else act = -1;
  }
});
const release = () => {
  if (!dragging) return;
  dragging = false; svg.classList.remove('dragging');
  if (grabbed >= 0) {
    const w = state[grabbed];
    w.held = false;
    if (!dragged) pluck(grabbed);                       // a tap plucks it
    grabbed = -1;
    return;
  }
  if (dragged) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); }
};
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
svg.addEventListener('pointerleave', e => { pointerIn = false; if (e.pointerType === 'mouse' && !dragging) act = -1; });
bindWheel(svg, table, { onStart: () => { idle = 0; stopTour(); } });
svg.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') { table.flickBy(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { act = clamp((act < 0 ? (k === 'ArrowUp' ? -1 : N) : act) + (k === 'ArrowUp' ? 1 : -1), 0, N - 1); e.preventDefault(); }
  else if (k === ' ' || k === 'Enter') { if (act >= 0) pluck(act); else pluckAll(); e.preventDefault(); }
  else if (k === 'Escape') act = -1;
  else return;
  idle = 0; stopTour();
});

/* ---- controls --------------------------------------------------------------- */
const stroke = document.getElementById('stroke');
const allBtn = document.getElementById('pluck'), slowBtn = document.getElementById('slow'), themeBtn = document.getElementById('theme');
let look = 0;
const applyLook = () => { document.documentElement.style.setProperty('--hl-sw', stroke.value); look++; };
stroke.addEventListener('input', applyLook);
allBtn.addEventListener('click', () => { idle = 0; stopTour(); pluckAll(); });
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

/* ---- the tour: three stops that each show a different answer, then a leave ----- */
// the four plucked at once; the lively one alone; Hairline's own; back; turn
const TOUR = [[1.2, () => { act = -1; pluckAll(); }], [4.0, () => { act = 0; pluck(0); }], [6.6, () => { act = 1; pluck(1); }],
  [8.6, () => { act = -1; }], [9.6, () => table.flickBy(1)]];
let tourT = 0, tourOn = !reduced, tourStep = 0;
function stopTour() { if (tourOn && tourStep > 0) act = -1; tourOn = false; tourT = 0; tourStep = 0; }
function stepTour(dt) {
  if (reduced) return;
  if (!tourOn) {
    idle += dt;
    if (pointerIn) idle = 0;
    if (!dragging && idle > 8 && table.state().mode === 'rest' && state.every(w => w.y === 0)) { tourOn = true; tourT = 0; tourStep = 0; }
    return;
  }
  if (tourStep === TOUR.length) { if (table.state().mode === 'rest') { tourT = 0; tourStep = 0; } else return; }
  tourT += dt;
  while (tourStep < TOUR.length && tourT >= TOUR[tourStep][0]) TOUR[tourStep++][1]();
}

// ?act=n&pull=y holds spring n pulled y mm, ?turn=n turns n quarters: for still pictures
{
  const q = location.search, m = q.match(/[?&]act=(\d+)/), y = q.match(/[?&]pull=([\d.]+)/), tn = q.match(/[?&]turn=([\d.]+)/);
  if (m) { tourOn = false; act = +m[1]; }
  if (y && m) { state[+m[1]].y = +y[1]; state[+m[1]].held = true; }
  if (tn) { tourOn = false; table.jump(+tn[1]); }
}

/* ---- loop: rewritten only when something moved (rule 07) ------------------------ */
let prev = performance.now(), lastText = '', lastKey = '';
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000) * (slow ? 0.25 : 1);
  prev = now;
  table.step(dt, dragging && dragged && grabbed < 0);
  stepTour(dt);
  stepSprings(dt);
  const s = table.state();
  // the chosen spring's numbers: its k and c, its damping ratio, how long it takes to settle, and its pull now
  let part = 'rest';
  if (act >= 0) {
    const S = SPRINGS[act], y = state[act].y;
    part = `${String(act + 1).padStart(2, '0')}/${N} k ${S.k} · c ${S.c} · ζ ${S.zeta.toFixed(2)} · settle ${S.settle.toFixed(2)} s · y ${y > 0.05 ? '−' : y < -0.05 ? '+' : ' '}${Math.abs(y).toFixed(1)} mm`;
  }
  const text = `θ ${String(Math.round(s.degrees)).padStart(3, '0')}° · face <b>${s.face}</b>/4 · ${part}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }
  const ys = state.map(w => w.y);
  const key = `${table.theta.toFixed(5)}|${ys.map(v => v.toFixed(2))}|${act}|${look}`;
  if (key !== lastKey) {
    setAz();
    const P = proj(C), T = toward(C), k = (x, y) => T[0] * x + T[1] * y;
    const pl = [];
    for (const p of base.slice(0, 2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); pl.push(['sil', d.sil], ['cr', d.crease]); }
    fill(baseG, pl);
    const back = [], front = [];
    for (const p of base.slice(2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); (k(p.frame.o[0], p.frame.o[1]) < 0 ? back : front).push(['sil', d.sil], ['cr', d.crease]); }
    fill(backG, back); fill(frontG, front);
    fill(rackG, rack(P, T, ys, act));
    lastKey = key;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
