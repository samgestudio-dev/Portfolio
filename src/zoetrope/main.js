import { createTurntable, bindWheel } from '../lib/turntable.js';
import { Cam, proj, toward, prism3, hull, inside, circ, lerp } from '../lib/iso.js';
import { buildPlatter, PLATTER_R } from '../lib/platter-svg.js';
import { zoetrope, frameSeen, N, RO, Z_TOP, STEP } from './scene.js';

/* Motion · 01 — a zoetrope on the turntable: a slotted drum with a horse at a gallop on
   the strip inside.

   One model drives everything (Kaero): θ and ω, the turntable's angle and speed. The
   drum is drawn at θ itself while it turns slowly; once it turns faster than a frame
   every half second, the slots act as a shutter and it is drawn only where a slot
   lines up, θ snapped to the slot step. That is what a zoetrope does to the eye: each
   time a slot passes, the next frame stands where the last one stood, so the horse
   gallops in place, as fast as the drum turns. The read-out is frame and frame rate.

   Hover    a motor takes the drum up to the Speed (frames a second); the horse runs.
   Leave    the motor lets go: it coasts, the horse slows, the detent stops it on a frame.
   Drag     spins it by hand, as on the other objects; a trackpad swipe too.
   Tap      starts or stops the motor. Keys: space the motor, ← → a quarter turn.   */

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const readout = document.getElementById('readout');
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };

/* ---- the frame (rule 03): the platter, and the drum with its spindle ------------- */
const C = Cam(45, 0.5, 1);
{
  const P = proj(C), pts = [];
  for (const [r, z] of [[PLATTER_R, 0], [PLATTER_R, -7.3], [PLATTER_R * 0.88, -20], [RO, Z_TOP + 9]])
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
const P = proj(C), T = toward(C);                       // the camera holds still; the drum and platter turn
const base = buildPlatter();
const baseG = mk('g', '', root), studsBack = mk('g', '', root), drumG = mk('g', '', root), studsFront = mk('g', '', root);
function fill(g, list) {
  while (g.childElementCount < list.length) mk('path', '', g);
  while (g.childElementCount > list.length) g.lastChild.remove();
  list.forEach(([cls, d], i) => { const e = g.children[i]; if (e.getAttribute('class') !== cls) e.setAttribute('class', cls); if (e.getAttribute('d') !== d) e.setAttribute('d', d); });
}
{
  const list = [];
  for (const s of base.slice(0, 2)) { const d = prism3(P, T, s.frame, s.ring, s.inner, s.w0, s.w1); list.push(['sil', d.sil], ['cr', d.crease]); }
  fill(baseG, list);
}
// the studs ride the platter round: turned by θ about the middle
function studs(theta) {
  const back = [], front = [];
  for (const s of base.slice(2)) {
    const [x, y] = s.frame.o, c = Math.cos(theta), sn = Math.sin(theta);
    const o = [x * c - y * sn, x * sn + y * c, 0];
    const d = prism3(P, T, { ...s.frame, o }, s.ring, s.inner, s.w0, s.w1);
    (T[0] * o[0] + T[1] * o[1] < 0 ? back : front).push(['sil', d.sil], ['cr', d.crease]);
  }
  fill(studsBack, back); fill(studsFront, front);
}

/* ---- the model -------------------------------------------------------------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const table = createTurntable({ tour: false });
const SHUTTER = 2 * STEP;                               // rad/s: faster than two frames a second, the slots strobe
let slow = false, fps = 24, motor = false, pinned = false;
const omegaFor = f => (f * Math.PI * 2) / N;             // frames a second → rad/s
function setMotor(on) {
  motor = on;
  if (on) table.drive(omegaFor(fps)); else table.cut();
}
// the angle the drum is drawn at: itself, or held to the slots at speed
const drawn = (theta, omega) => (Math.abs(omega) > SHUTTER && !reduced ? Math.round(theta / STEP) * STEP : theta);

/* ---- pointer ---------------------------------------------------------------- */
function toView(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}
// a cylinder round the drum: the same at any turn (rule 01)
const ringR = circ(0, 0, RO + 4, 32);
const HIT = hull(ringR.map(q => P(q.u, q.v, 0)).concat(ringR.map(q => P(q.u, q.v, Z_TOP + 9))));
const overDrum = pt => inside(pt, HIT);

let dragging = false, dragged = false, lastX = 0, lastT = 0, downX = 0, downY = 0, idle = 0, pointerIn = false;
svg.addEventListener('pointerdown', e => {
  dragging = true; dragged = false; lastX = downX = e.clientX; downY = e.clientY; lastT = performance.now();
  svg.setPointerCapture(e.pointerId);
  idle = 0; stopTour();
});
svg.addEventListener('pointermove', e => {
  if (dragging) idle = 0;
  if (dragging && !dragged && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) { dragged = true; svg.classList.add('dragging'); motor = false; table.grab(); }
  if (dragging && dragged) {
    const now = performance.now();
    table.drag(((e.clientX - lastX) / Math.min(window.innerWidth, 900)) * Math.PI * 1.2, Math.max(1, now - lastT) / 1000);
    lastX = e.clientX; lastT = now;
    return;
  }
  if (e.pointerType === 'mouse') {
    const over = overDrum(toView(e));
    if (over !== pointerIn) { pointerIn = over; if (over) { stopTour(); setMotor(true); } else if (!pinned) setMotor(false); }
  }
});
const release = e => {
  if (!dragging) return;
  dragging = false; svg.classList.remove('dragging');
  if (dragged) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); return; }
  if (overDrum(toView(e))) { pinned = !motor || !pinned; setMotor(pinned || e.pointerType === 'mouse'); } else { pinned = false; setMotor(false); }
};
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !dragging && pointerIn) { pointerIn = false; if (!pinned) setMotor(false); } });
bindWheel(svg, table, { onStart: () => { idle = 0; stopTour(); motor = false; } });
svg.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') { motor = false; table.flickBy(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
  else if (k === ' ' || k === 'Enter') { pinned = !motor; setMotor(!motor); e.preventDefault(); }
  else if (k === 'Escape') { pinned = false; setMotor(false); }
  else return;
  idle = 0; stopTour();
});

/* ---- controls --------------------------------------------------------------- */
const speedIn = document.getElementById('speed'), stroke = document.getElementById('stroke');
const slowBtn = document.getElementById('slow'), themeBtn = document.getElementById('theme');
let look = 0;
const applyLook = () => {
  fps = Math.round(lerp(8, 36, +speedIn.value));
  if (motor) table.drive(omegaFor(fps));
  document.documentElement.style.setProperty('--hl-sw', stroke.value);
  look++;
};
speedIn.addEventListener('input', applyLook);
stroke.addEventListener('input', applyLook);
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

/* ---- the tour: slow, then full speed, then let it run down --------------------- */
const TOUR = [[1.2, () => table.drive(omegaFor(8))], [3.4, () => table.drive(omegaFor(fps))], [6.4, () => table.cut()]];
let tourT = 0, tourOn = !reduced, tourStep = 0;
function stopTour() { if (tourOn && tourStep > 0 && !pinned && !pointerIn) table.cut(); tourOn = false; tourT = 0; tourStep = 0; }
function stepTour(dt) {
  if (reduced) return;
  if (!tourOn) {
    idle += dt;
    if (pointerIn || motor) idle = 0;
    if (!dragging && idle > 8 && table.state().mode === 'rest') { tourOn = true; tourT = 0; tourStep = 0; }
    return;
  }
  if (tourStep === TOUR.length) { if (table.state().mode === 'rest') { tourT = 0; tourStep = 0; } return; }
  tourT += dt;
  while (tourStep < TOUR.length && tourT >= TOUR[tourStep][0]) TOUR[tourStep++][1]();
}

// ?run holds the motor on, ?turn=n turns n quarters: for still pictures
{
  const q = location.search, t = q.match(/[?&]turn=([\d.]+)/);
  if (/[?&]run/.test(q)) { tourOn = false; pinned = true; setMotor(true); }
  if (t) { tourOn = false; table.jump(+t[1]); }
}

/* ---- loop: rewritten only when the drawn angle or the look changes (rule 07) ---- */
let prev = performance.now(), lastText = '', lastKey = '';
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000) * (slow ? 0.25 : 1);
  prev = now;
  table.step(dt, dragging && dragged);
  stepTour(dt);
  const s = table.state(), th = -table.theta, phi = drawn(th, s.omega);   // the drum turns as −θ: a drag to the right carries its near edge right
  const f = Math.abs(s.omega) * N / (Math.PI * 2);
  // the read-out: the frame at the far wall's middle, and the rate the frames go by
  const text = `θ ${String(Math.round(s.degrees)).padStart(3, '0')}° · frame <b>${String(frameSeen(T, phi) + 1).padStart(2, '0')}</b>/${N} · ${f < 0.5 ? 'rest' : `${f.toFixed(0)} fps`}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }
  const key = `${phi.toFixed(5)}|${th.toFixed(4)}|${look}`;
  if (key !== lastKey) { studs(th); fill(drumG, zoetrope(P, T, phi)); lastKey = key; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
