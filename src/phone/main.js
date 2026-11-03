import { createTurntable } from '../lib/turntable.js';
import { Cam, proj, toward, prism3, flat, hull, inside, seg, circ, at, clamp, lerp } from '../lib/iso.js';
import { buildParts, buildPlatter, LAYERS, H, W, R, SCREEN_FRONT, PLATTER_R } from './scene.js';

/* Product · 02 — an iPhone Air on the turntable, taken apart along one axis, drawn the
   way Hairline draws: rounded solids as a silhouette and one crease, plates filled with
   the ground and painted back to front, in SVG with one stroke width.

   One model drives everything (Kaero): θ, the turntable, and per layer two springs: o,
   how far apart (0 assembled, 1 at the even gap), and f, its share of a wide gap that
   opens just in front of the chosen layer so its face shows. Every path, the guides,
   the bright edge and the read-out are read from those numbers.

   Hover    it comes apart; the layer under the pointer is chosen and takes the bright
            edge (rule 04); changes reach each layer after |i − a| × 45 ms (rule 02).
   Tap      does what hover does and holds it open; a tap off the phone closes.
   Drag     spins the turntable: friction, then a detent at the nearest quarter.
   Keys     ← → turn a quarter · ↑ ↓ open and walk the layers · Esc closes.          */

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const readout = document.getElementById('readout');
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };

/* ---- the frame: fitted to the open stack in any turn (rule 03) ------------------ */
const C = Cam(45, 0.5, 1);
const FOCUS = 40;                             // mm: the gap that opens in front of the chosen layer
const GAPK = [0.6, 1.2];
{
  // everything that can be drawn lies inside these circles, whatever the turn
  const reach = Math.hypot(W / 2, (LAYERS.at(-1).p + FOCUS / 2) * GAPK[1]) + 2;
  const P = proj(C), pts = [];
  for (const [r, z] of [[PLATTER_R, 0], [PLATTER_R, -7.3], [PLATTER_R * 0.88, -20], [reach, H + 2], [reach, 0]])
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

/* ---- the drawing: one group per part, made once, its paths rewritten when they move */
const root = mk('g', '', svg);
const stage = buildPlatter().map(p => ({ ...p, g: mk('g', '', root) }));
const parts = buildParts();
const groups = LAYERS.map((L, i) => ({ L, i, g: mk('g', '', root), guide: null, parts: [] }));
groups.forEach(G => G.g.setAttribute('data-layer', G.i));
for (const p of parts) {
  const G = groups[p.layer];
  p.g = mk('g', '', G.g);
  // the interface's outlines one step lighter than a solid's (mid, not edge) until chosen
  if (p.plane) p.sil = mk('path', p.mark ? (p.name === 'mic' ? 'dot' : 'mk') : p.fill ? 'fill' : 'sil ui', p.g);
  else { p.sil = mk('path', 'sil', p.g); p.cr = mk('path', 'cr', p.g); }
  // the centre of its ring, for the paint order
  const us = p.ring.map(q => q.u), vs = p.ring.map(q => q.v);
  p.cu = (Math.min(...us) + Math.max(...us)) / 2; p.cv = (Math.min(...vs) + Math.max(...vs)) / 2;
  G.parts.push(p);
}
for (const s of stage) { s.sil = mk('path', 'sil', s.g); s.cr = mk('path', 'cr', s.g); }
// guides: dotted drops at the four corners, from each layer to the next, put in before
// the nearer plate so that plate hides what lies behind it (rule 06)
const corner = R - R * Math.SQRT1_2 + 1.2;
const CORNERS = [[-W / 2 + corner, corner], [W / 2 - corner, corner], [-W / 2 + corner, H - corner], [W / 2 - corner, H - corner]];
for (const G of groups) G.guide = mk('path', 'guide', root);

/* ---- the model -------------------------------------------------------------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const table = createTurntable({ tour: false });
const N = LAYERS.length, MIDDLE = 2;
let slow = false, gapK = 1;
const STEP = 0.045;
let clock = 0;
const sp = x => ({ x, v: 0, t: x });
const springs = LAYERS.map(() => ({ o: sp(0), f: sp(0), due: [] }));
let open = false, act = -1, pinned = false;

function retarget(from) {
  for (let i = 0; i < N; i++) {
    const t = clock + Math.abs(i - from) * STEP;
    const fo = open && act >= 0 ? (i > act ? 0.5 : -0.5) : 0;
    springs[i].due = [[t, 'o', open ? 1 : 0], [t, 'f', fo]];
  }
}
function setOpen(o, from) { if (o === open) return; open = o; if (!o) act = -1; retarget(from ?? (act >= 0 ? act : MIDDLE)); }
function setAct(a) { if (a === act) return; const was = act; act = a; retarget(a >= 0 ? a : was >= 0 ? was : MIDDLE); }
function openOn(a) { if (open) { setAct(a); return; } open = true; act = a; retarget(a >= 0 ? a : MIDDLE); }
// k 100 · c 18 · m 1, in fixed sub-steps so it is stable at any frame rate
function stepSprings(dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
  for (const S of springs) {
    S.due = S.due.filter(([t, k, v]) => (clock >= t ? ((S[k].t = v), false) : true));
    for (const k of ['o', 'f']) {
      const s = S[k];
      if (reduced) { s.x = s.t; s.v = 0; continue; }
      for (let j = 0; j < n; j++) { s.v += (-100 * (s.x - s.t) - 18 * s.v) * h; s.x += s.v * h; }
      if (Math.abs(s.x - s.t) < 1e-4 && Math.abs(s.v) < 1e-3) { s.x = s.t; s.v = 0; }
    }
  }
}
// where a layer stands along y: its share of the even gap and of the focus gap. Layers
// never pass through each other: a layer that would fall behind the one under it is
// pushed along by it. The layers set off at staggered times, and without this one can
// slip behind the glass for a moment on its way and blink out.
const offsetOf = (i, o, f) => (LAYERS[i].p * o + FOCUS * f) * gapK;
function offsets(o, f) {
  const off = LAYERS.map((_, i) => offsetOf(i, o[i], f[i]));
  for (let i = 1; i < off.length; i++) off[i] = Math.max(off[i], off[i - 1]);
  return off;
}
const layerY = (i, off) => off + (LAYERS[i].ui ? SCREEN_FRONT + 0.02 * (i - 2) : 0);
const shift = (fr, dy) => ({ ...fr, o: [fr.o[0], fr.o[1] + dy, fr.o[2]] });

/* ---- drawing ---------------------------------------------------------------- */
// the turntable turns the camera, as Hairline's own does; the platter is round
function setAz() { C.az = (45 * Math.PI) / 180 + table.theta; }
function draw(o, f, hot) {
  setAz();
  const P = proj(C), T = toward(C), key = (x, y) => T[0] * x + T[1] * y;
  for (const s of stage) {
    const d = prism3(P, T, s.frame, s.ring, s.inner, s.w0, s.w1);
    s.sil.setAttribute('d', d.sil); s.cr.setAttribute('d', d.crease);
    s.depth = key(s.frame.o[0], s.frame.o[1]);
  }
  const off = offsets(o, f), ys = groups.map(G => layerY(G.i, off[G.i]));
  const apart = o.reduce((a, v) => a + v, 0) / N;
  for (const G of groups) {
    // the components hide inside the closed phone: drawn once it opens
    G.hidden = G.i === 1 && o[1] < 0.04;
    G.g.style.display = G.hidden ? 'none' : '';
    G.depth = key(0, ys[G.i] + (LAYERS[G.i].ui ? 0 : LAYERS[G.i].y));
    if (G.hidden) continue;
    for (const p of G.parts) {
      const fr = shift(p.frame, ys[G.i]);
      if (p.plane) p.sil.setAttribute('d', flat(P, fr, p.ring, p.w0));
      else { const d = prism3(P, T, fr, p.ring, p.inner, p.w0, p.w1); p.sil.setAttribute('d', d.sil); p.cr.setAttribute('d', d.crease); }
      // parts stack along their own axis (the plateau on the back, the lens on the
      // plateau, a button off a side): order them by how far along it they stand within
      // their layer, before the layer moves (its move along y would outweigh a button's
      // reach along x and paint the slab over the buttons)
      const c = at(p.frame, p.cu, p.cv, (p.w0 + p.w1) / 2), w = p.frame.W;
      p.depth = (T[0] * w[0] + T[1] * w[1]) * (c[0] * w[0] + c[1] * w[1]);
      p.sil.classList.toggle('hi', hot === G.i);
    }
    G.parts.sort((a, b) => a.depth - b.depth).forEach(p => G.g.appendChild(p.g));
  }
  // paint order: base and platter, then studs and layers far to near; each layer's guide
  // to the layer before it goes in just before it
  const items = [stage[0], stage[1], ...[...stage.slice(2), ...groups].sort((a, b) => a.depth - b.depth)];
  let prevY = null;
  for (const it of items) {
    if (it.guide) {
      const ok = apart > 0.05 && prevY !== null && !it.hidden;
      it.guide.setAttribute('d', ok ? CORNERS.map(([x, z]) => seg(P(x, prevY, z), P(x, ys[it.i], z))).join('') : '');
      it.guide.style.opacity = clamp((apart - 0.05) / 0.4, 0, 1);
      root.appendChild(it.guide);
      if (!it.hidden) prevY = ys[it.i];
    }
    root.appendChild(it.g);
  }
}

/* ---- pointer: in viewBox units, tested against fixed or target shapes (rule 01) --- */
function toView(e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}
// a cylinder round the phone at rest, round the open stack once it is open: the hull of
// two circles, the same at any turn
function overPhone(pt) {
  setAz();
  const P = proj(C), ring = circ(0, 0, open ? PLATTER_R : W / 2 + 6, 32);
  return inside(pt, hull(ring.map(q => P(q.u, q.v, 0)).concat(ring.map(q => P(q.u, q.v, H + 4)))));
}
// the frontmost layer under pt with the layers posed as (o, f)
function layerAt(pt, o, f) {
  setAz();
  const P = proj(C), T = toward(C);
  const off = offsets(o, f), ys = groups.map(G => layerY(G.i, off[G.i]));
  const yy = i => ys[i] + (LAYERS[i].ui ? 0 : LAYERS[i].y);
  const order = groups.map(G => G.i).sort((a, b) => T[1] * yy(b) - T[1] * yy(a));   // near first
  for (const i of order) {
    for (const p of groups[i].parts) {
      if (p.mark) continue;
      const fr = shift(p.frame, ys[i]);
      const ring0 = p.ring.map(q => P(...at(fr, q.u, q.v, p.w0)));
      const shape = p.plane ? ring0 : hull(ring0.concat(p.ring.map(q => P(...at(fr, q.u, q.v, p.w1)))));
      if (inside(pt, shape)) return i;
    }
  }
  return -1;
}
// A layer is picked only if it would still be under the pointer once chosen: pose the
// stack as it will stand with each layer chosen and keep the layers that pass, so a
// layer that moves out from under the pointer by being chosen is never picked.
function pickLayer(pt) {
  const ones = LAYERS.map(() => 1), ok = [];
  for (let c = 0; c < N; c++) if (layerAt(pt, ones, LAYERS.map((_, i) => (i > c ? 0.5 : -0.5))) === c) ok.push(c);
  if (!ok.length) { const e = layerAt(pt, ones, LAYERS.map(() => 0)); return e >= 0 ? e : act; }
  if (act < 0) return ok[ok.length - 1];
  return ok.reduce((b, c) => (Math.abs(c - act) < Math.abs(b - act) ? c : b));
}

let dragging = false, dragged = false, lastX = 0, lastT = 0, downX = 0, downY = 0, idle = 0, pointerIn = false;
function hover(pt) {
  if (overPhone(pt)) openOn(pickLayer(pt));
  else if (!pinned) setOpen(false);
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
  // only the phone pauses the tour: the drawing fills the page, so a resting mouse is
  // always somewhere over it
  if (e.pointerType === 'mouse') {
    const pt = toView(e);
    pointerIn = overPhone(pt);
    if (pointerIn || open) { stopTour(); hover(pt); }
  }
});
const release = e => {
  if (!dragging) return;
  dragging = false; svg.classList.remove('dragging');
  if (dragged) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); return; }
  const pt = toView(e);
  if (overPhone(pt)) { pinned = true; hover(pt); } else { pinned = false; setOpen(false); }
  syncOpenBtn();
};
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
svg.addEventListener('pointerleave', e => { pointerIn = false; if (e.pointerType === 'mouse' && !dragging && !pinned) setOpen(false); });
svg.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') { table.flickBy(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') {
    const start = act < 0 ? (k === 'ArrowUp' ? -1 : N) : act;
    pinned = true; openOn(clamp(start + (k === 'ArrowUp' ? 1 : -1), 0, N - 1)); syncOpenBtn(); e.preventDefault();
  } else if (k === 'Escape') { pinned = false; setOpen(false); syncOpenBtn(); }
  else return;
  idle = 0; stopTour();
});

/* ---- controls --------------------------------------------------------------- */
const gapIn = document.getElementById('gap'), stroke = document.getElementById('stroke');
const openBtn = document.getElementById('open'), slowBtn = document.getElementById('slow'), themeBtn = document.getElementById('theme');
let look = 0;
const applyLook = () => {
  gapK = lerp(GAPK[0], GAPK[1], +gapIn.value);
  document.documentElement.style.setProperty('--hl-sw', stroke.value);
  look++;
};
gapIn.addEventListener('input', applyLook);
stroke.addEventListener('input', applyLook);
function syncOpenBtn() { openBtn.setAttribute('aria-pressed', open && pinned); }
openBtn.addEventListener('click', () => {
  idle = 0; stopTour();
  if (open && pinned) { pinned = false; setOpen(false); } else { pinned = true; openOn(act); }
  syncOpenBtn();
});
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
// open on the interface's content, walk back to the components, then the body; close; turn
const TOUR = [[1.6, () => openOn(4)], [3.6, () => setAct(1)], [5.6, () => setAct(0)], [7.4, () => setOpen(false)], [8.8, () => table.flickBy(1)]];
let tourT = 0, tourOn = !reduced, tourStep = 0;
function stopTour() { if (tourOn && tourStep > 0 && !pinned) setOpen(false); tourOn = false; tourT = 0; tourStep = 0; }
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

// ?open&act=n opens on layer n at once, ?turn=n turns n quarters: for still pictures
{
  const q = location.search, m = q.match(/[?&]act=(\d+)/), t = q.match(/[?&]turn=([\d.]+)/);
  if (/[?&]open/.test(q)) {
    pinned = true; tourOn = false; open = true; act = m ? +m[1] : -1; retarget(MIDDLE);
    springs.forEach(s => { s.due.forEach(([, k, v]) => { s[k].x = s[k].t = v; }); s.due = []; });
  }
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
  stepSprings(dt);
  const o = springs.map(s => s.o.x), f = springs.map(s => s.f.x);

  const s = table.state();
  let part = 'rest';
  if (act >= 0) {
    // a layer's number is its own: how far it stands from where it sits, + toward the screen
    const z = offsets(o, f)[act];
    part = `${String(act + 1).padStart(2, '0')}/${N} ${LAYERS[act].name} · z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(1)} mm`;
  } else if (open) part = 'apart';
  const text = `θ ${fmt(s.degrees, 3)}° · face <b>${s.face}</b>/4 · ${part}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }

  // one bright edge: the chosen layer, and nothing at rest
  const hot = act;
  const key = `${table.theta.toFixed(5)}|${o.map(v => v.toFixed(4))}|${f.map(v => v.toFixed(4))}|${hot}|${look}`;
  if (key !== lastKey) { draw(o, f, hot); lastKey = key; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
