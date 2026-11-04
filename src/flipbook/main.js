import { createTurntable, bindWheel } from '../lib/turntable.js';
import { Cam, proj, toward, prism3, hull, inside, circ, clamp } from '../lib/iso.js';
import { buildPlatter, PLATTER_R } from '../lib/platter-svg.js';
import { fillKeyed } from '../lib/keyed-fill.js';
import { book, pose, REST_F, N, EXTENT } from './scene.js';

/* Motion · 01 — a flipbook held up over the turntable, fanned.

   One model drives everything (Kaero): θ, the turntable, and f, where the thumb is in
   the book (0 … 20). Every page's angle comes from f: the ones before it have fallen
   over onto the pile, the one at it is in flight, the rest stand fanned behind. The
   read-out is the frame showing and its time.

   Hover    the pointer's place across the book is the thumb (a spring, k 100 · c 18):
            the pages fall one after another; the page showing takes the bright edge.
   Tap      flips the twenty through in real time, at the Duration, and the ball
            bounces; then the book goes back to rest. Space or Play do the same.
   Drag     elsewhere spins the turntable; a trackpad swipe too. ← → a quarter turn. */

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const readout = document.getElementById('readout');
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };

/* ---- the frame (rule 03) ---------------------------------------------------- */
const C = Cam(45, 0.5, 1);
{
  const P = proj(C), pts = [];
  for (const [r, z] of [[PLATTER_R, 0], [PLATTER_R, -7.3], [PLATTER_R * 0.88, -20], [EXTENT.r, EXTENT.top], [EXTENT.r, 16]])
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
const baseG = mk('g', '', root), backG = mk('g', '', root), bookG = mk('g', '', root), frontG = mk('g', '', root);
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
const thumb = { x: REST_F, v: 0, t: REST_F };
let playing = false, holdUntil = 0, clock = 0, duration = 1.6, slow = false, over = false;
function stepThumb(dt) {
  if (playing) {
    thumb.x = Math.min(N, thumb.x + (N * dt) / duration); thumb.t = thumb.x; thumb.v = 0;
    if (thumb.x >= N) { playing = false; holdUntil = clock + 0.8; thumb.t = REST_F; }
    return;
  }
  if (holdUntil > clock) return;
  const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
  for (let i = 0; i < n; i++) { thumb.v += (-100 * (thumb.x - thumb.t) - 18 * thumb.v) * h; thumb.x += thumb.v * h; }
  if (reduced) { thumb.x = thumb.t; thumb.v = 0; }
}
function play() { playing = true; thumb.x = 0; thumb.v = 0; holdUntil = 0; }
// the page showing: the first that has not fallen
const showing = f => clamp(Math.floor(f + 1e-6), 0, N - 1);

/* ---- pointer: tested against fixed shapes (rule 01) --------------------------- */
function toView(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}
// a cylinder round the book, the same at any turn; across it, left to right, the thumb
function region() {
  setAz();
  const P = proj(C), ring = circ(0, 0, EXTENT.r, 32);
  const pts = ring.map(q => P(q.u, q.v, 16)).concat(ring.map(q => P(q.u, q.v, EXTENT.top)));
  const xs = pts.map(p => p[0]);
  return { shape: hull(pts), x0: Math.min(...xs), x1: Math.max(...xs) };
}
function aim(pt) {
  const r = region();
  if (!inside(pt, r.shape)) return null;
  const u = (pt[0] - r.x0) / (r.x1 - r.x0);
  return clamp((u - 0.12) / 0.76, 0, 1) * N;           // a margin at each side reaches the ends
}

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
  if (e.pointerType === 'mouse') {
    const f = aim(toView(e));
    over = f !== null;
    if (over) { stopTour(); if (!playing) { thumb.t = f; holdUntil = 0; } }
    else if (!playing) thumb.t = REST_F;
  }
});
const release = e => {
  if (!dragging) return;
  dragging = false; svg.classList.remove('dragging');
  if (dragged) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); return; }
  if (aim(toView(e)) !== null) play();
};
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
svg.addEventListener('pointerleave', e => { over = false; if (e.pointerType === 'mouse' && !dragging && !playing) thumb.t = REST_F; });
bindWheel(svg, table, { onStart: () => { idle = 0; stopTour(); } });
svg.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') { table.flickBy(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
  else if (k === ' ' || k === 'Enter') { play(); e.preventDefault(); }
  else if (k === 'Escape') { playing = false; thumb.t = REST_F; }
  else return;
  idle = 0; stopTour();
});

/* ---- controls --------------------------------------------------------------- */
const durIn = document.getElementById('duration'), stroke = document.getElementById('stroke');
const playBtn = document.getElementById('play'), slowBtn = document.getElementById('slow'), themeBtn = document.getElementById('theme');
let look = 0;
const applyLook = () => { duration = +durIn.value; document.documentElement.style.setProperty('--hl-sw', stroke.value); look++; };
durIn.addEventListener('input', applyLook);
stroke.addEventListener('input', applyLook);
playBtn.addEventListener('click', () => { idle = 0; stopTour(); play(); });
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
// flip it through; the thumb early; late; back to rest; turn a quarter
const TOUR = [[1.2, () => play()], [4.4, () => (thumb.t = 3)], [6.0, () => (thumb.t = 15)], [7.8, () => (thumb.t = REST_F)], [9.0, () => table.flickBy(1)]];
let tourT = 0, tourOn = !reduced, tourStep = 0;
function stopTour() { if (tourOn && tourStep > 0 && !playing) thumb.t = REST_F; tourOn = false; tourT = 0; tourStep = 0; }
function stepTour(dt) {
  if (reduced) return;
  if (!tourOn) {
    idle += dt;
    if (over || playing) idle = 0;
    if (!dragging && idle > 8 && table.state().mode === 'rest') { tourOn = true; tourT = 0; tourStep = 0; }
    return;
  }
  if (tourStep === TOUR.length) { if (table.state().mode === 'rest') { tourT = 0; tourStep = 0; } else return; }
  tourT += dt;
  while (tourStep < TOUR.length && tourT >= TOUR[tourStep][0]) TOUR[tourStep++][1]();
}

// ?f=n holds the thumb at n, ?turn=n turns n quarters: for still pictures
{
  const q = location.search, f = q.match(/[?&]f=([\d.]+)/), t = q.match(/[?&]turn=([\d.]+)/);
  if (f) { tourOn = false; thumb.x = thumb.t = +f[1]; }
  if (t) { tourOn = false; table.jump(+t[1]); }
}

/* ---- loop: rewritten only when something moved (rule 07) ------------------------ */
let prev = performance.now(), lastText = '', lastKey = '';
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000) * (slow ? 0.25 : 1);
  prev = now; clock += dt;
  table.step(dt, dragging && dragged);
  stepTour(dt);
  stepThumb(dt);
  const s = table.state(), f = clamp(thumb.x, 0, N);
  const page = showing(f), lit = over || playing ? page : -1;
  // the frame showing, and when it falls in the move at this Duration
  const part = over || playing ? `frame ${String(page + 1).padStart(2, '0')}/${N} · ${((page / (N - 1)) * duration).toFixed(2)} s` : 'rest';
  const text = `θ ${String(Math.round(s.degrees)).padStart(3, '0')}° · face <b>${s.face}</b>/4 · ${part}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }
  const key = `${table.theta.toFixed(5)}|${f.toFixed(4)}|${lit}|${look}`;
  if (key !== lastKey) {
    setAz();
    const P = proj(C), T = toward(C), k = (x, y) => T[0] * x + T[1] * y;
    const pl = [];
    for (const p of base.slice(0, 2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); pl.push(['sil', d.sil], ['cr', d.crease]); }
    fill(baseG, pl);
    const back = [], front = [];
    for (const p of base.slice(2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); (k(p.frame.o[0], p.frame.o[1]) < 0 ? back : front).push(['sil', d.sil], ['cr', d.crease]); }
    fill(backG, back); fill(frontG, front);
    fillKeyed(bookG, book(P, T, pose(f), lit));
    lastKey = key;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
