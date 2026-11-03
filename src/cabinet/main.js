import { createTurntable, bindWheel } from '../lib/turntable.js';
import { Cam, proj, toward, prism3, hull, inside, circ, clamp, lerp } from '../lib/iso.js';
import { buildPlatter, PLATTER_R } from '../lib/platter-svg.js';
import { DRAWERS, COUNT, W, D, HT as H, FT, MAX, carcass, drawer, frontAt } from './scene.js';

/* System · 03 — a cabinet of design tokens on the turntable, two drawers pulled half out.

   One model drives everything (Kaero): θ, the turntable, and per drawer how far it is
   out. Every path, the bright edge and the read-out are read from those numbers.

   Hover    the drawer under the pointer slides all the way out and the others close
            (a 700 ms ease, staggered from it by 45 ms a drawer: rules 08 and 02); its
            front takes the bright edge (rule 04). Leaving puts the cabinet back to rest.
   Tap      does what hover does; a tap off the cabinet puts it back.
   Drag     spins the turntable: friction, then a detent at the nearest quarter. A
            trackpad's sideways swipe does the same.
   Keys     ← → turn a quarter · ↑ ↓ walk the drawers · Esc puts it back.              */

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const readout = document.getElementById('readout');
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };
const N = DRAWERS.length;

/* ---- the frame: fitted to the farthest pull in any turn (rule 03) --------------- */
const C = Cam(45, 0.5, 1);
const PULLK = [0.65, 1.15];
{
  const reach = Math.hypot(W / 2, D / 2 + MAX * PULLK[1] + FT + 3.6) + 2;
  const P = proj(C), pts = [];
  for (const [r, z] of [[PLATTER_R, 0], [PLATTER_R, -7.3], [PLATTER_R * 0.88, -20], [reach, H], [reach, 0], [Math.hypot(W / 2 + 1.5, D / 2 + 1.5), H]])
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

/* ---- the drawing: groups made once, their paths rewritten when something moves --- */
const root = mk('g', '', svg);
const stage = buildPlatter().map(p => ({ ...p, g: mk('g', '', root) }));
for (const s of stage) { s.sil = mk('path', 'sil', s.g); s.cr = mk('path', 'cr', s.g); }
const bodyG = mk('g', '', root);
const drawerG = DRAWERS.map(() => mk('g', '', root));
// write a list of [class, d] into a group, reusing its paths
function fill(g, list) {
  while (g.childElementCount < list.length) mk('path', '', g);
  while (g.childElementCount > list.length) g.lastChild.remove();
  list.forEach(([cls, d], i) => { const e = g.children[i]; if (e.getAttribute('class') !== cls) e.setAttribute('class', cls); if (e.getAttribute('d') !== d) e.setAttribute('d', d); });
}

/* ---- the model -------------------------------------------------------------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const table = createTurntable({ tour: false });
let slow = false, pullK = 1, clock = 0, act = -1, pinned = false;
// a choice is a 700 ms ease-out on (.32, .72, 0, 1) — Hairline's tween
const ease = (() => {
  const bz = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (bz(m, 0.32, 0) < x) lo = m; else hi = m; } return bz((lo + hi) / 2, 0.72, 1); };
})();
const STEP = 0.045, DUR = 0.7;
// how far each drawer is out, as a share of the pull: at rest, the cabinet's own pose
const target = k => (act < 0 ? DRAWERS[k].rest : k === act ? 1 : 0);
const tw = DRAWERS.map((d, k) => ({ from: d.rest, to: d.rest, t0: -9 }));
const shareNow = k => { const w = tw[k]; return w.from + (w.to - w.from) * (reduced ? 1 : ease((clock - w.t0) / DUR)); };
function choose(a) {
  if (a === act) return;
  const from = a >= 0 ? a : act;
  act = a;
  tw.forEach((w, k) => { const cur = shareNow(k); w.from = cur; w.to = target(k); w.t0 = clock + Math.abs(k - from) * STEP; });
}
const outMM = k => shareNow(k) * MAX * pullK;

/* ---- drawing ---------------------------------------------------------------- */
// the turntable turns the camera; the other way to the platter, so a drag to the right
// carries the near edge right, as on the other objects
function setAz() { C.az = (45 * Math.PI) / 180 - table.theta; }
function draw() {
  setAz();
  const P = proj(C), T = toward(C), frontSeen = T[1] > 0;
  for (const s of stage) { const d = prism3(P, T, s.frame, s.ring, s.inner, s.w0, s.w1); s.sil.setAttribute('d', d.sil); s.cr.setAttribute('d', d.crease); }
  // studs by their depth round the platter; the cabinet sits in the middle
  const key = (x, y) => T[0] * x + T[1] * y;
  const studs = stage.slice(2).sort((a, b) => key(a.frame.o[0], a.frame.o[1]) - key(b.frame.o[0], b.frame.o[1]));
  fill(bodyG, carcass(P, T, frontSeen).map(([, cls, d]) => [cls, d]));
  DRAWERS.forEach((d, k) => {
    const parts = drawer(P, T, d, outMM(k), frontSeen);
    fill(drawerG[k], parts.map(p => [p.role === 'front' && k === act ? 'sil hi' : p.cls, p.d]));
  });
  // paint order: base, platter, the studs behind, then: when the fronts are seen, the
  // carcass and the drawers bottom to top (the camera looks down, so a lower drawer never
  // covers a higher one); when the back is seen, the drawers first, the carcass over them
  const behind = studs.filter(s => key(s.frame.o[0], s.frame.o[1]) < 0), before = studs.filter(s => !behind.includes(s));
  const order = [stage[0].g, stage[1].g, ...behind.map(s => s.g)];
  if (frontSeen) order.push(bodyG, ...drawerG); else order.push(...drawerG, bodyG);
  order.push(...before.map(s => s.g));
  for (const g of order) root.appendChild(g);
}

/* ---- pointer: tested against fixed shapes and the rest pose (rule 01) ------------ */
function toView(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}
// a cylinder round the cabinet, and round its farthest pull once a drawer is chosen
function overCabinet(pt) {
  setAz();
  const P = proj(C), r = act >= 0 ? Math.hypot(W / 2, D / 2 + MAX * pullK + FT) : Math.hypot(W / 2, D / 2 + FT) + 4;
  const ring = circ(0, 0, r, 32);
  return inside(pt, hull(ring.map(q => P(q.u, q.v, 0)).concat(ring.map(q => P(q.u, q.v, H)))));
}
// the drawer under pt: first on each front where it stands at rest, top down (a higher
// drawer covers a lower one); off every front, the drawer nearest in height
function pick(pt) {
  setAz();
  const P = proj(C);
  for (let k = N - 1; k >= 0; k--) if (inside(pt, frontAt(P, DRAWERS[k], DRAWERS[k].rest * MAX * pullK))) return k;
  let best = 0, bd = Infinity;
  DRAWERS.forEach((d, k) => { const c = P(0, D / 2, (d.z0 + d.z1) / 2); const dy = Math.abs(c[1] - pt[1]); if (dy < bd) { bd = dy; best = k; } });
  return best;
}

let dragging = false, dragged = false, lastX = 0, lastT = 0, downX = 0, downY = 0, idle = 0, pointerIn = false;
function hover(pt) { if (overCabinet(pt)) choose(pick(pt)); else if (!pinned) choose(-1); }
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
  // only the cabinet pauses the tour: the drawing fills the page
  if (e.pointerType === 'mouse') {
    const pt = toView(e);
    pointerIn = overCabinet(pt);
    if (pointerIn || act >= 0) { stopTour(); hover(pt); }
  }
});
const release = e => {
  if (!dragging) return;
  dragging = false; svg.classList.remove('dragging');
  if (dragged) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); return; }
  const pt = toView(e);
  if (overCabinet(pt)) { pinned = true; hover(pt); } else { pinned = false; choose(-1); }
};
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
svg.addEventListener('pointerleave', e => { pointerIn = false; if (e.pointerType === 'mouse' && !dragging && !pinned) choose(-1); });
bindWheel(svg, table, { onStart: () => { idle = 0; stopTour(); } });
svg.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') { table.flickBy(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') {
    const start = act < 0 ? (k === 'ArrowUp' ? -1 : N) : act;
    pinned = true; choose(clamp(start + (k === 'ArrowUp' ? 1 : -1), 0, N - 1)); e.preventDefault();
  } else if (k === 'Escape') { pinned = false; choose(-1); }
  else return;
  idle = 0; stopTour();
});

/* ---- controls --------------------------------------------------------------- */
const pullIn = document.getElementById('pull'), stroke = document.getElementById('stroke');
const slowBtn = document.getElementById('slow'), themeBtn = document.getElementById('theme');
let look = 0;
const applyLook = () => { pullK = lerp(PULLK[0], PULLK[1], +pullIn.value); document.documentElement.style.setProperty('--hl-sw', stroke.value); look++; };
pullIn.addEventListener('input', applyLook);
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

/* ---- the tour: three stops that each show a different answer, then a leave ----- */
// the color cards, the spacing scale, the radius tiles; back to rest; turn a quarter
const TOUR = [[1.4, () => choose(3)], [3.2, () => choose(1)], [5.0, () => choose(0)], [6.8, () => choose(-1)], [8.2, () => table.flickBy(1)]];
let tourT = 0, tourOn = !reduced, tourStep = 0;
function stopTour() { if (tourOn && tourStep > 0 && !pinned) choose(-1); tourOn = false; tourT = 0; tourStep = 0; }
function stepTour(dt) {
  if (reduced) return;
  if (!tourOn) {
    idle += dt;
    if (pointerIn) idle = 0;
    if (!dragging && !pinned && idle > 8 && table.state().mode === 'rest') { tourOn = true; tourT = 0; tourStep = 0; }
    return;
  }
  if (tourStep === TOUR.length) { if (table.state().mode === 'rest') { tourT = 0; tourStep = 0; } else return; }
  tourT += dt;
  while (tourStep < TOUR.length && tourT >= TOUR[tourStep][0]) TOUR[tourStep++][1]();
}

// ?act=n opens drawer n at once, ?turn=n turns n quarters: for still pictures
{
  const q = location.search, m = q.match(/[?&]act=(\d+)/), t = q.match(/[?&]turn=([\d.]+)/);
  if (m) { pinned = true; tourOn = false; act = +m[1]; tw.forEach((w, k) => { w.from = w.to = target(k); }); }
  if (t) { tourOn = false; table.jump(+t[1]); }
}

/* ---- loop: one frame loop; paths are rewritten only when something moved (rule 07) */
const fmt = (n, w) => String(Math.round(n)).padStart(w, '0');
let prev = performance.now(), lastText = '', lastKey = '';
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000) * (slow ? 0.25 : 1);
  prev = now; clock += dt;
  table.step(dt, dragging && dragged);
  stepTour(dt);
  const s = table.state();
  // a drawer's numbers are its own: which, how many tokens it holds, how far it is out
  const part = act >= 0 ? `${String(act + 1).padStart(2, '0')}/${N} ${DRAWERS[act].name} · ${COUNT[DRAWERS[act].name]} tokens · out ${outMM(act).toFixed(0)} mm` : 'rest';
  const text = `θ ${fmt(s.degrees, 3)}° · face <b>${s.face}</b>/4 · ${part}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }
  const key = `${table.theta.toFixed(5)}|${DRAWERS.map((_, k) => outMM(k).toFixed(2))}|${act}|${look}`;
  if (key !== lastKey) { draw(); lastKey = key; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
