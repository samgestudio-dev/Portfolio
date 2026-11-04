import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createHairlinePass } from '../lib/hairline-pass.js';
import { view, place } from '../lib/persp.js';
import { hull, inside, circ, poly, seg, clamp, lerp } from '../lib/iso.js';
import { fillKeyed } from '../lib/keyed-fill.js';
import { SVG_OBJECTS } from './objects.js';

/* The home: four objects on a ring, seen in perspective, one for each way of making.

   One model drives everything (Kaero): ring, the ring's turn; the camera, as a focus, a
   distance, an azimuth, an elevation, a field of view and a lens shift; and for each
   object its own spin. At rest the ring drifts round and the camera takes in all four.
   Chosen, the ring brings that object to the front while the camera swoops down and in
   on it, holding it on the side of the screen it was nearer to, and the words come up on
   the other side. There it turns slowly; David is looked at in the face.

   Overview   drag or swipe turns the ring · click or tap an object · ← → a quarter ·
              Enter the one in front · 1–4 any of them
   Close      ← → or a sideways swipe: the next one along the ring · Esc, × All four,
              a click on empty ground, a swipe down, a scroll or pinch out, or Back:
              out again. Each close look has its own address (#art, #product, …).     */

const OBJECTS = [
  { id: 'art', num: '01', name: 'Art', title: 'Sculpture and installation', text: 'Form, material and space, made away from the screen.', href: './david.html' },
  { id: 'product', num: '02', name: 'Product', title: 'Interfaces people use', text: 'UI and UX case studies, from the first question to the last tap.', href: './phone.html' },
  { id: 'system', num: '03', name: 'System', title: 'Design systems and tokens', text: 'One source of truth that keeps design and code in step.', href: './cabinet.html' },
  { id: 'motion', num: '04', name: 'Motion', title: 'Motion and interaction', text: 'Timing, springs and rhythm: how a thing should move.', href: './atlas.html' },
];
const N = OBJECTS.length, QUARTER = Math.PI / 2, TAU = Math.PI * 2;
let RR = 215;                                // the ring's radius, mm: tighter on a phone, so the four come out bigger
const LIFT = 16;                             // how far each object floats over the ring
const SD = 168;                              // David's height, mm (his model is 1 tall)
// how each sits: its scale, and its turn so that at the front of the ring it shows the face
// it was designed to show (an iso object is drawn for a viewer at +x +y; David from +x −z)
const SIT = {
  art: { s: SD, base: -0.8, r: 0.2, z0: 0, z1: 1, face: 0.925, faceR: 0.085 },
  product: { s: 1.0, base: (-3 * Math.PI) / 4 },
  system: { s: 1.02, base: (-3 * Math.PI) / 4 },
  motion: { s: 1.2, base: (-3 * Math.PI) / 4 },
};
OBJECTS.forEach((o, i) => {
  o.i = i;
  Object.assign(o, SIT[o.id], SVG_OBJECTS[o.id] || {});
  o.spin = 0; o.spinV = 0; o.op = 1;
});

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };
const hit = document.getElementById('hit'), ringSvg = document.getElementById('ring'), ringG = mk('g', '', ringSvg);
const hint = document.getElementById('hint'), panel = document.getElementById('panel');

/* ---- layers: an SVG for each drawn object, a canvas for David ------------------- */
for (const o of OBJECTS) {
  if (o.id === 'art') continue;
  o.el = document.createElementNS(NS, 'svg'); o.el.setAttribute('class', 'layer'); o.el.setAttribute('aria-hidden', 'true');
  o.g = mk('g', '', o.el); ringSvg.after(o.el);
}
const art = OBJECTS[0];
art.el = document.createElement('canvas'); art.el.className = 'layer'; art.el.setAttribute('aria-hidden', 'true'); ringSvg.after(art.el);
for (const o of OBJECTS) {
  o.label = document.createElement('div'); o.label.className = 'label mono';
  o.label.innerHTML = `${o.num}<b>${o.name}</b>`; document.body.appendChild(o.label);
}

/* ---- David, in three.js, drawn by the Hairline pass onto a clear canvas ----------- */
const renderer = new THREE.WebGLRenderer({ canvas: art.el, antialias: false, alpha: true, premultipliedAlpha: false });
const pass = createHairlinePass(renderer, { transparent: true });
const scene3 = new THREE.Scene(), holder = new THREE.Group();
scene3.add(holder);
const cam3 = new THREE.PerspectiveCamera(30, 1, 0.02, 60);
let davidReady = false, looks = 0;
new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(window.DAVID_MODEL_URL || './models/david/david-mid.glb', gltf => {
  let geo;
  gltf.scene.traverse(m => { if (m.isMesh && !geo) { m.updateWorldMatrix(true, false); geo = m.geometry.clone().applyMatrix4(m.matrixWorld); } });
  if (!geo.attributes.normal) geo.computeVertexNormals();
  holder.add(new THREE.Mesh(geo, pass.material(1, { form: !!geo.attributes._formnormal })));
  // where his head is, in his own units: the middle of everything above the chin
  const pos = geo.attributes.position, top = geo.boundingBox ? geo.boundingBox.max.y : (geo.computeBoundingBox(), geo.boundingBox.max.y);
  let n = 0, x = 0, z = 0, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); if (y > top - 0.11) { x += pos.getX(k); z += pos.getZ(k); n++; y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  art.head = { x: x / n, z: z / n, y: (y0 + y1) / 2 - 0.012, r: 0.075 };
  davidReady = true; looks++;
});
const REACH_AT = 900;                         // buffer pixels to David's height at which his lines were tuned
let REACH_POW = 0.5, REACH_MAX = 3, REACH_FIX = 0;   // how much of the zoom the reach follows, its cap; ?reach=k fixes it
{ const m = location.search.match(/[?&]reach=([\d.]+)/); if (m) REACH_FIX = +m[1]; }
const pixelRatio = () => (window.devicePixelRatio >= 3 ? 2 : Math.min(window.devicePixelRatio * 1.5, 2.5));

/* ---- the model -------------------------------------------------------------- */
const ease = (() => {
  const bz = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (bz(m, 0.32, 0) < x) lo = m; else hi = m; } return bz((lo + hi) / 2, 0.72, 1); };
})();
let W = innerWidth, H = innerHeight;
const narrow = () => W <= 720;
let ring = 0.35, ringV = 0;                  // the ring's turn, and its speed
const DRIFT = reduced ? 0 : 0.07;            // rad/s while nobody is touching it
let sel = -1;                                // the object looked at, −1 for all four
let side = 1;                                // −1: the object on the left, the words on the right
let camT = null;                             // a camera move in flight: { from, t0, dur, swing }
let ringT = null;                            // a ring move in flight: { from, to, t0, dur }
let clock = 0, hot = -1;

// where the ring puts object i, and how it is turned
const angleOf = i => ring + i * QUARTER;
const centreOf = i => { const a = angleOf(i); return [RR * Math.sin(a), -RR * Math.cos(a), LIFT]; };
const yawOf = o => angleOf(o.i) + o.base + o.spin;

// the camera for all four: a little from above, the ring fitted between the header and the hint
function overviewCam() {
  const el = narrow() ? 0.62 : 0.46, fov = narrow() ? 40 : 38;
  const box = narrow() ? { x: W / 2, y: H * 0.5, w: W - 24, h: H * 0.62 } : { x: W / 2, y: H * 0.52, w: W - 96, h: H - 190 };
  const pts = [];
  for (const q of circ(0, 0, RR + 62, 48)) pts.push([q.u, q.v, 0], [q.u, q.v, LIFT + 175]);
  return fit({ F: [0, 0, 60], az: -Math.PI / 2, el, fov }, pts, box);
}
// the camera for a close look at o, once it stands at the front: low, near, to one side
function closeCam(o, sd) {
  const el = narrow() ? 0.2 : 0.14, fov = narrow() ? 28 : 24;
  const c = [0, -RR, LIFT];
  let pts, F;
  if (o.id === 'art') {
    // David's head, found on his mesh, turned with him: the face in the middle, a little
    // of the neck below
    const hd = o.head || { x: 0, z: 0, y: o.face, r: o.faceR };
    const yaw = o.base + o.spin, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const lx = hd.x * o.s, ly = -hd.z * o.s;                     // his (x, z) → the world's (x, −y)
    const hc = [c[0] + lx * cs - ly * sn, c[1] + lx * sn + ly * cs, LIFT + hd.y * o.s], rr = hd.r * o.s;
    F = hc;
    pts = circ(0, 0, rr, 24).flatMap(q => [[hc[0] + q.u, hc[1] + q.v, hc[2] - rr * 1.25], [hc[0] + q.u, hc[1] + q.v, hc[2] + rr]]);
  } else {
    const r = o.r * o.s, z0 = LIFT + o.z0 * o.s, z1 = LIFT + o.z1 * o.s;
    F = [c[0], c[1], (z0 + z1) / 2];
    pts = circ(0, 0, r, 32).flatMap(q => [[c[0] + q.u, c[1] + q.v, z0], [c[0] + q.u, c[1] + q.v, z1]]);
  }
  const box = narrow() ? { x: W / 2, y: H * 0.3, w: W * 0.82, h: H * 0.42 }
    : { x: W * (sd < 0 ? 0.3 : 0.7), y: H * 0.5, w: W * 0.4, h: H * 0.7 };
  return fit({ F, az: -Math.PI / 2, el, fov }, pts, box);
}
// the distance that fits pts in box, and the lens shift that centres them on it
function fit(c, pts, box) {
  let lo = 20, hi = 20000, V;
  for (let k = 0; k < 40; k++) {
    const D = Math.sqrt(lo * hi);
    V = view({ ...c, D, w: W, h: H });
    const ps = pts.map(p => V.P(...p)), xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
    const ok = Math.max(...xs) - Math.min(...xs) <= box.w && Math.max(...ys) - Math.min(...ys) <= box.h && Math.min(...pts.map(V.depth)) > 1;
    if (ok) hi = D; else lo = D;
  }
  V = view({ ...c, D: hi, w: W, h: H });
  const ps = pts.map(p => V.P(...p)), xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
  return { ...c, D: hi, shiftX: box.x - (Math.min(...xs) + Math.max(...xs)) / 2, shiftY: box.y - (Math.min(...ys) + Math.max(...ys)) / 2 };
}
const targetCam = () => (sel < 0 ? overviewCam() : closeCam(OBJECTS[sel], side));
function mixCam(a, b, t, swing) {
  return {
    F: a.F.map((v, k) => lerp(v, b.F[k], t)),
    D: Math.exp(lerp(Math.log(a.D), Math.log(b.D), t)),                       // distance in proportion, so the swoop does not crawl at the end
    az: lerp(a.az, b.az, t) + swing * Math.sin(Math.PI * t),                   // an arc, not a straight push
    el: lerp(a.el, b.el, t), fov: lerp(a.fov, b.fov, t),
    shiftX: lerp(a.shiftX, b.shiftX, t), shiftY: lerp(a.shiftY, b.shiftY, t),
  };
}
let cam = null;
function currentCam() {
  const tgt = targetCam();
  if (!camT) return tgt;
  const t = (clock - camT.t0) / camT.dur;
  if (t >= 1) { camT = null; return tgt; }
  return mixCam(camT.from, tgt, ease(t), camT.swing);
}
function moveCam(dur, swing = 0) { camT = { from: cam || targetCam(), t0: clock, dur: reduced ? 0.001 : dur, swing: reduced ? 0 : swing }; }
// turn the ring so object i comes to the front, by the shorter way
function ringTo(i, dur) {
  let to = -i * QUARTER;
  to += Math.round((ring - to) / TAU) * TAU;
  ringT = { from: ring, to, t0: clock, dur: reduced ? 0.001 : dur };
  ringV = 0;
}

/* ---- going in and out --------------------------------------------------------- */
function screenX(i) { if (!cam) cam = targetCam(); const V = view({ ...cam, w: W, h: H }); return V.P(...centreOf(i))[0]; }
function enter(i, from = 'pointer') {
  if (i === sel) return;
  const was = sel;
  // the side it is on now decides the side it keeps: whichever edge it is nearer to
  side = narrow() ? 1 : screenX(i) < W / 2 ? -1 : 1;
  sel = i;
  ringTo(i, was < 0 ? 1.5 : 1.0);
  moveCam(was < 0 ? 1.5 : 1.0, was < 0 ? -side * 0.22 : 0);
  OBJECTS[i].spinV = 0;
  showPanel(false);
  panelAt = clock + (was < 0 ? 1.05 : 0.6);
  if (location.hash !== '#' + OBJECTS[i].id) { pushed = true; location.hash = OBJECTS[i].id; }
  hot = -1;
}
function leave() {
  if (sel < 0) return;
  const o = OBJECTS[sel];
  sel = -1; ringT = null; ringV = 0;
  moveCam(1.15, side * 0.18);
  showPanel(false);
  o.spinBack = true;
  if (location.hash) {
    if (pushed) { pushed = false; history.back(); }
    else try { history.replaceState(null, '', location.pathname + location.search); } catch { location.hash = ''; }
  }
}
function step(d) { if (sel >= 0) enter((sel + d + N) % N, 'key'); }

/* ---- the words ---------------------------------------------------------------- */
let panelAt = Infinity, pushed = false;
function showPanel(on) {
  if (!on) { panel.classList.remove('on'); return; }
  const o = OBJECTS[sel];
  document.getElementById('p-num').textContent = `${o.num} · ${o.name}`;
  document.getElementById('p-title').textContent = o.title;
  document.getElementById('p-text').textContent = o.text;
  document.getElementById('p-link').href = o.href;
  document.getElementById('p-steps').textContent = narrow() ? 'swipe ← →' : '← →';
  panel.classList.toggle('left', side > 0);
  panel.classList.toggle('right', side < 0);
  panel.classList.add('on');
}
document.getElementById('p-back').addEventListener('click', () => leave());

/* ---- pointer: tested against fixed shapes round each object (rule 01) ---------- */
function shapeOf(o, V) {
  const c = centreOf(o.i), r = (o.id === 'art' ? o.r : o.r) * o.s, z0 = LIFT + o.z0 * o.s, z1 = LIFT + o.z1 * o.s;
  const ring = circ(0, 0, r, 20);
  return hull(ring.map(q => V.P(c[0] + q.u, c[1] + q.v, z0)).concat(ring.map(q => V.P(c[0] + q.u, c[1] + q.v, z1))));
}
function pick(x, y) {
  if (!cam) return -1;
  const V = view({ ...cam, w: W, h: H });
  const near = OBJECTS.map(o => ({ o, d: V.depth(centreOf(o.i)) })).filter(e => e.d > 30).sort((a, b) => a.d - b.d);
  for (const { o } of near) if (inside([x, y], shapeOf(o, V))) return o.i;
  return -1;
}
let down = null, dragging = false, lastX = 0, lastT = 0;
hit.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() }; dragging = false; lastX = e.clientX; lastT = down.t;
  hit.setPointerCapture(e.pointerId);
});
hit.addEventListener('pointermove', e => {
  if (down && !dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) { dragging = true; hit.classList.add('dragging'); hot = -1; }
  if (down && dragging) {
    if (sel < 0) {
      // the ring follows the hand: a drag across the screen is about a third of a turn
      const now = performance.now(), dθ = ((e.clientX - lastX) / Math.min(W, 1100)) * 2.2;
      ring += dθ; ringV = dθ / Math.max(0.008, (now - lastT) / 1000);
      lastX = e.clientX; lastT = now;
    }
    return;
  }
  if (e.pointerType === 'mouse' && sel < 0 && !down) {
    hot = pick(e.clientX, e.clientY);
    hit.classList.toggle('over', hot >= 0);
  }
});
const release = e => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y, wasDrag = dragging;
  down = null; dragging = false; hit.classList.remove('dragging');
  if (wasDrag) {
    if (sel < 0) { if (performance.now() - lastT > 90) ringV = 0; return; }
    // a close look: a sideways swipe goes along the ring, a swipe down goes back out
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    else if (dy > 60) leave();
    return;
  }
  if (sel < 0) { const i = pick(e.clientX, e.clientY); if (i >= 0) enter(i); }
  else if (pick(e.clientX, e.clientY) !== sel) leave();     // empty ground: back out
};
hit.addEventListener('pointerup', release);
hit.addEventListener('pointercancel', release);
hit.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !down) { hot = -1; hit.classList.remove('over'); } });
// trackpad and wheel: across turns the ring; in a close look, across steps along it and
// a scroll or pinch out goes back
let wheelAcc = 0, wheelX = 0, wheelQuiet = 0;
hit.addEventListener('wheel', e => {
  e.preventDefault();
  if (sel < 0) { ring += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : -e.deltaY) * 0.0022; ringV = 0; return; }
  if (clock < wheelQuiet) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { wheelX += e.deltaX; if (Math.abs(wheelX) > 80) { step(wheelX > 0 ? 1 : -1); wheelX = 0; wheelQuiet = clock + 0.9; } }
  else { wheelAcc += e.deltaY; if (wheelAcc > 90) { wheelAcc = 0; leave(); wheelQuiet = clock + 0.9; } else if (wheelAcc < -200) wheelAcc = -200; }
}, { passive: false });
addEventListener('keydown', e => {
  const k = e.key;
  if (sel < 0) {
    if (k === 'ArrowRight' || k === 'ArrowLeft') { const f = frontIndex(); ringTo((f + (k === 'ArrowRight' ? -1 : 1) + N) % N, 0.7); }
    else if (k === 'Enter' || k === ' ') enter(frontIndex(), 'key');
    else if (/^[1-4]$/.test(k)) enter(+k - 1, 'key');
    else return;
  } else {
    if (k === 'ArrowRight') step(1);
    else if (k === 'ArrowLeft') step(-1);
    else if (k === 'Escape' || k === 'Backspace') leave();
    else return;
  }
  e.preventDefault();
});
// the one nearest the front of the ring
function frontIndex() {
  let best = 0, bd = Infinity;
  OBJECTS.forEach(o => { const a = ((angleOf(o.i) % TAU) + TAU) % TAU, d = Math.min(a, TAU - a); if (d < bd) { bd = d; best = o.i; } });
  return best;
}
// the address follows the close look, so Back goes out again
addEventListener('hashchange', () => {
  const i = OBJECTS.findIndex(o => '#' + o.id === location.hash);
  if (i >= 0 && i !== sel) enter(i, 'hash');
  else if (i < 0 && sel >= 0) { pushed = false; leave(); }
});

/* ---- theme ------------------------------------------------------------------ */
const themeBtn = document.getElementById('theme');
const sysDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : sysDark.matches; };
function syncTheme() {
  const dark = isDark();
  themeBtn.setAttribute('aria-pressed', dark);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#131311' : '#f4f2eb';
  pass.setTheme(dark ? 'dark' : 'light'); looks++;
}
themeBtn.addEventListener('click', () => { document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'; syncTheme(); });
sysDark.addEventListener('change', syncTheme);
syncTheme();
pass.setLook({ detail: 0.5, stroke: 0.9, muscle: 0.5 });

function resize() {
  W = innerWidth; H = innerHeight;
  RR = narrow() ? 150 : 215;
  renderer.setPixelRatio(pixelRatio()); renderer.setSize(W, H, false);
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  pass.setSize(buf.x, buf.y, renderer.getPixelRatio());
  for (const o of OBJECTS) if (o.el.tagName === 'svg') o.el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  ringSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  hint.textContent = narrow() ? 'Swipe to turn · tap an object' : 'Drag to turn · choose an object';
  looks++;
}
addEventListener('resize', resize);
resize();

// ?at=id opens on that close look, ?ring=a sets the ring's turn: for still pictures
{
  const q = location.search, a = q.match(/[?&]at=(\w+)/), r = q.match(/[?&]ring=(-?[\d.]+)/);
  if (r) ring = +r[1];
  const ay = q.match(/[?&]artyaw=(-?[\d.]+)/); if (ay) OBJECTS[0].base = +ay[1];
  const i = OBJECTS.findIndex(o => '#' + o.id === location.hash || (a && o.id === a[1]));
  if (i >= 0) { sel = i; side = narrow() ? 1 : -1; ring = -i * QUARTER; panelAt = 0; }
}

/* ---- drawing ---------------------------------------------------------------- */
function drawRing(V) {
  const out = [];
  const pts = circ(0, 0, RR, 160).map(q => V.P(q.u, q.v, 0));
  out.push(['ring', poly(pts), 'ring']);
  // ticks round the ring, turning with it: a fine one every 5°, a longer one at each object
  let ticks = '', long = '';
  for (let k = 0; k < 72; k++) {
    const a = ring + (k / 72) * TAU, s = Math.sin(a), c = -Math.cos(a), at = k % 18 === 0;
    const r0 = RR - (at ? 7 : 2.5), r1 = RR + (at ? 7 : 2.5);
    const d = seg(V.P(s * r0, c * r0, 0), V.P(s * r1, c * r1, 0));
    if (at) long += d; else ticks += d;
  }
  out.push(['tick', ticks, 'ticks'], ['mk', long, 'marks']);
  // a dotted drop from each object to the ring: they float
  out.push(['guide', OBJECTS.map(o => { const c = centreOf(o.i); return seg(V.P(c[0], c[1], LIFT - 3), V.P(c[0], c[1], 0)); }).join(''), 'drops']);
  fillKeyed(ringG, out);
}
function drawDavid(V, o) {
  if (!davidReady) return;
  const c = centreOf(o.i), d = V.depth(c);
  // three.js space: David's own units (1 = his height), y up; world (x, y, z) → (x, z, −y)
  const t = p => new THREE.Vector3(p[0] / SD, p[2] / SD, -p[1] / SD);
  holder.position.copy(t(c)); holder.rotation.y = yawOf(o);
  cam3.position.copy(t(V.E)); cam3.up.set(0, 1, 0);
  cam3.lookAt(t([V.E[0] + V.f[0], V.E[1] + V.f[1], V.E[2] + V.f[2]]));
  cam3.fov = V.fov; cam3.aspect = W / H;
  cam3.setViewOffset(W, H, -V.shiftX, -V.shiftY, W, H);
  cam3.near = Math.max(0.01, d / SD - 1.2); cam3.far = d / SD + 2;
  cam3.updateProjectionMatrix();
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  const perPx = (2 * (d / SD) * Math.tan(((V.fov / 2) * Math.PI) / 180)) / buf.y;
  pass.setScale(perPx);
  // seen close, look for folds and valleys over the same stretch of marble as on his own
  // page (about 900 buffer pixels to his height there); seen small, as there
  pass.setReach(REACH_FIX || clamp(Math.pow(1 / perPx / REACH_AT, REACH_POW), 1, REACH_MAX));
  pass.setDepthBias(Math.max(0, d / SD - 0.8));
  pass.render(scene3, cam3, hot === o.i ? 1 : -1);
}
function draw() {
  const V = view({ ...cam, w: W, h: H });
  drawRing(V);
  const depth = OBJECTS.map(o => V.depth(centreOf(o.i)));
  const order = OBJECTS.map(o => o.i).sort((a, b) => depth[b] - depth[a]);   // far first
  order.forEach((i, k) => { OBJECTS[i].el.style.zIndex = 2 + k; });
  for (const o of OBJECTS) {
    const seen = depth[o.i] > o.r * o.s * 1.2 && o.op > 0.01;
    o.el.style.visibility = seen ? '' : 'hidden';
    o.el.style.opacity = o.op < 0.995 ? o.op.toFixed(3) : '';
    o.el.classList.toggle('hot', hot === o.i && sel < 0);
    if (!seen) continue;
    if (o.id === 'art') drawDavid(V, o);
    else { const { P, T } = place(V, { c: centreOf(o.i), s: o.s, yaw: yawOf(o) }); fillKeyed(o.g, o.draw(P, T)); }
    // its name on the ring, under its drop, fading toward the back and away in a close look
    // (just under the lowest point of its fixed outline, so it never lies on the drawing)
    const g = V.P(...centreOf(o.i).slice(0, 2), 0), low = Math.max(g[1], ...shapeOf(o, V).map(p => p[1]));
    const back = clamp((RR + centreOf(o.i)[1]) / (2 * RR), 0, 1);
    o.label.style.transform = `translate(${g[0].toFixed(1)}px, ${(low + 10).toFixed(1)}px) translate(-50%, 0)`;
    o.label.style.opacity = sel < 0 && !camT ? ((1 - 0.65 * back) * o.op).toFixed(2) : '0';
    o.label.classList.toggle('hot', hot === o.i);
  }
  hint.style.opacity = sel < 0 && !camT ? '1' : '0';
}

/* ---- loop ------------------------------------------------------------------- */
let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now; clock += dt;
  // the ring: carried to a chosen object, or drifting, or coasting after a throw
  if (ringT) {
    const t = (clock - ringT.t0) / ringT.dur;
    ring = lerp(ringT.from, ringT.to, ease(t));
    if (t >= 1) { ring = ringT.to; ringT = sel >= 0 ? { ...ringT, from: ringT.to, t0: -1e9 } : null; }
  } else if (sel < 0 && !dragging) {
    ringV += (DRIFT - ringV) * (1 - Math.exp(-dt * 1.6));
    ring += ringV * dt;
  }
  // each object's own turn: slow in a close look (David only sways, keeping his face),
  // and back to where it sits once the look is over
  // in a close look the others fade away, so only the chosen one and the ring are left
  for (const o of OBJECTS) o.op = lerp(o.op, sel < 0 || o.i === sel ? 1 : 0, 1 - Math.exp(-dt * (sel < 0 ? 3 : 5)));
  for (const o of OBJECTS) {
    if (o.i === sel && !reduced) {
      if (o.id === 'art') o.spin = lerp(o.spin, 0.45 * Math.sin(clock * 0.32), 1 - Math.exp(-dt * 2));
      else { o.spinV += (0.24 - o.spinV) * (1 - Math.exp(-dt * 1.2)); o.spin += o.spinV * dt; }
    } else if (o.spin !== 0) {
      const home = Math.round(o.spin / TAU) * TAU;
      o.spinV = 0; o.spin = lerp(o.spin, home, 1 - Math.exp(-dt * 3.5));
      if (Math.abs(o.spin - home) < 1e-3) o.spin = 0;
    }
  }
  cam = currentCam();
  if (sel >= 0 && clock >= panelAt) { panelAt = Infinity; showPanel(true); }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
