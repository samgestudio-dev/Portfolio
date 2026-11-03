import { createTurntable, bindWheel } from '../lib/turntable.js';
import { Cam, proj, toward, prism3, hull, inside, circ, clamp } from '../lib/iso.js';
import { buildPlatter, PLATTER_R } from '../lib/platter-svg.js';
import { chart, rodOnScreen, EASES, RODS_Z, EXTENT, X0, X1 } from './scene.js';

/* Motion · 01 — the spacing chart, on the turntable: four rods, four easings, the beads
   on each where its easing has a thing at every tenth of the time.

   One model drives everything (Kaero): θ, the turntable, and t, the time. Each rod's
   large bead stands at its easing of t, so the four part as t runs: the lesson is the
   gap between them. The read-out is the chosen rod's numbers: its name, t and x.

   Hover    the pointer's place along the rods is the time (a spring: k 100 · c 18), its
            height picks a rod, whose bead takes the bright edge (rule 04).
   Tap      plays the time from 0 to 1 in a second, in real time: the four beads move as
            their easings move. Space does the same.
   Drag     spins the turntable; a trackpad swipe too. ← → turn a quarter.           */

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const readout = document.getElementById('readout');
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };

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

/* ---- the drawing ------------------------------------------------------------- */
const root = mk('g', '', svg);
const base = buildPlatter();
const baseG = mk('g', '', root), backG = mk('g', '', root), chartG = mk('g', '', root), frontG = mk('g', '', root);
function fill(g, list) {
  while (g.childElementCount < list.length) mk('path', '', g);
  while (g.childElementCount > list.length) g.lastChild.remove();
  list.forEach(([cls, d], i) => { const e = g.children[i]; if (e.getAttribute('class') !== cls) e.setAttribute('class', cls); if (e.getAttribute('d') !== d) e.setAttribute('d', d); });
}
// the turntable turns the camera, the other way to the platter (a drag right carries the near edge right)
function setAz() { C.az = (45 * Math.PI) / 180 - table.theta; }

/* ---- the model -------------------------------------------------------------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const table = createTurntable({ tour: false });
const REST_T = 0.5;
const time = { x: REST_T, v: 0, t: REST_T };            // the spring on t, for a pointer that scrubs
let act = -1, playing = false, playFrom = 0, slow = false, speed = 1;
function stepTime(dt) {
  if (playing) {
    time.x = Math.min(1, time.x + dt / speed); time.t = time.x; time.v = 0;
    if (time.x >= 1) { playing = false; holdUntil = clock + 0.9; }
    return;
  }
  if (holdUntil > clock) return;
  const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
  for (let i = 0; i < n; i++) { time.v += (-100 * (time.x - time.t) - 18 * time.v) * h; time.x += time.v * h; }
  if (reduced) { time.x = time.t; time.v = 0; }
}
let clock = 0, holdUntil = 0;
function play() { playing = true; time.x = 0; time.v = 0; holdUntil = 0; }

/* ---- pointer: tested against the rods where they stand, which never move (rule 01) --- */
function toView(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}
function overChart(pt) {
  setAz();
  const P = proj(C), ring = circ(0, 0, EXTENT.r + 4, 32);
  return inside(pt, hull(ring.map(q => P(q.u, q.v, 0)).concat(ring.map(q => P(q.u, q.v, EXTENT.top)))));
}
// the rod nearest the pointer on screen, and the time under it along that rod
function aim(pt) {
  setAz();
  const P = proj(C);
  let best = 0, bd = Infinity, bt = REST_T;
  EASES.forEach((_, e) => {
    const { a, b } = rodOnScreen(P, e), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const u = L2 < 1 ? 0.5 : ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2;
    const q = [a[0] + clamp(u, 0, 1) * dx, a[1] + clamp(u, 0, 1) * dy], d = Math.hypot(pt[0] - q[0], pt[1] - q[1]);
    if (d < bd) { bd = d; best = e; bt = clamp(u, 0, 1); }
  });
  return { rod: best, t: bt };
}

let dragging = false, dragged = false, lastX = 0, lastT = 0, downX = 0, downY = 0, idle = 0, pointerIn = false;
function hover(pt) {
  if (overChart(pt)) { const a = aim(pt); act = a.rod; if (!playing) { time.t = a.t; holdUntil = 0; } }
  else { act = -1; if (!playing) time.t = REST_T; }
}
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
  if (e.pointerType === 'mouse') {
    const pt = toView(e);
    pointerIn = overChart(pt);
    if (pointerIn || act >= 0) { stopTour(); hover(pt); }
  }
});
const release = e => {
  if (!dragging) return;
  dragging = false; svg.classList.remove('dragging');
  if (dragged) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); return; }
  const pt = toView(e);
  if (overChart(pt)) { act = aim(pt).rod; play(); }
};
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
svg.addEventListener('pointerleave', e => { pointerIn = false; if (e.pointerType === 'mouse' && !dragging) { act = -1; if (!playing) time.t = REST_T; } });
bindWheel(svg, table, { onStart: () => { idle = 0; stopTour(); } });
svg.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') { table.flickBy(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { act = clamp((act < 0 ? (k === 'ArrowUp' ? -1 : EASES.length) : act) + (k === 'ArrowUp' ? 1 : -1), 0, EASES.length - 1); e.preventDefault(); }
  else if (k === ' ' || k === 'Enter') { if (act < 0) act = 2; play(); e.preventDefault(); }
  else if (k === 'Escape') { act = -1; time.t = REST_T; }
  else return;
  idle = 0; stopTour();
});

/* ---- controls --------------------------------------------------------------- */
const durIn = document.getElementById('duration'), stroke = document.getElementById('stroke');
const playBtn = document.getElementById('play'), slowBtn = document.getElementById('slow'), themeBtn = document.getElementById('theme');
let look = 0;
const applyLook = () => { speed = +durIn.value; document.documentElement.style.setProperty('--hl-sw', stroke.value); look++; };
durIn.addEventListener('input', applyLook);
stroke.addEventListener('input', applyLook);
playBtn.addEventListener('click', () => { idle = 0; stopTour(); if (act < 0) act = 2; play(); });
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
// Hairline's ease played through; early on the linear rod; late on the spring; back; turn
const TOUR = [[1.2, () => { act = 2; play(); }], [3.4, () => { act = 0; time.t = 0.2; }], [5.0, () => { act = 3; time.t = 0.85; }],
  [6.8, () => { act = -1; time.t = REST_T; }], [8.2, () => table.flickBy(1)]];
let tourT = 0, tourOn = !reduced, tourStep = 0;
function stopTour() { if (tourOn && tourStep > 0) { act = -1; time.t = REST_T; } tourOn = false; tourT = 0; tourStep = 0; }
function stepTour(dt) {
  if (reduced) return;
  if (!tourOn) {
    idle += dt;
    if (pointerIn) idle = 0;
    if (!dragging && idle > 8 && table.state().mode === 'rest') { tourOn = true; tourT = 0; tourStep = 0; }
    return;
  }
  if (tourStep === TOUR.length) { if (table.state().mode === 'rest') { tourT = 0; tourStep = 0; } else return; }
  tourT += dt;
  while (tourStep < TOUR.length && tourT >= TOUR[tourStep][0]) TOUR[tourStep++][1]();
}

// ?act=n&t=0.3 holds a rod and a time, ?turn=n turns n quarters: for still pictures
{
  const q = location.search, m = q.match(/[?&]act=(\d+)/), tt = q.match(/[?&]t=([\d.]+)/), tn = q.match(/[?&]turn=([\d.]+)/);
  if (m) { tourOn = false; act = +m[1]; }
  if (tt) { tourOn = false; time.x = time.t = +tt[1]; }
  if (tn) { tourOn = false; table.jump(+tn[1]); }
}

/* ---- loop: rewritten only when something moved (rule 07) ------------------------ */
let prev = performance.now(), lastText = '', lastKey = '';
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000) * (slow ? 0.25 : 1);
  prev = now; clock += dt;
  table.step(dt, dragging && dragged);
  stepTour(dt);
  stepTime(dt);
  const s = table.state(), t = clamp(time.x, 0, 1);
  // the chosen rod's numbers: its easing, the time, and how far along the thing is
  let part = 'rest';
  if (act >= 0) { const E = EASES[act]; part = `${String(act + 1).padStart(2, '0')}/4 ${E.name} · t ${t.toFixed(2)} · x ${Math.round(E.f(t) * 100)}%`; }
  const text = `θ ${String(Math.round(s.degrees)).padStart(3, '0')}° · face <b>${s.face}</b>/4 · ${part}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }
  const key = `${table.theta.toFixed(5)}|${t.toFixed(4)}|${act}|${look}`;
  if (key !== lastKey) {
    setAz();
    const P = proj(C), T = toward(C), k = (x, y) => T[0] * x + T[1] * y;
    const pl = [];
    for (const p of base.slice(0, 2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); pl.push(['sil', d.sil], ['cr', d.crease]); }
    fill(baseG, pl);
    const back = [], front = [];
    for (const p of base.slice(2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); (k(p.frame.o[0], p.frame.o[1]) < 0 ? back : front).push(['sil', d.sil], ['cr', d.crease]); }
    fill(backG, back); fill(frontG, front);
    fill(chartG, chart(P, T, t, act));
    lastKey = key;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
