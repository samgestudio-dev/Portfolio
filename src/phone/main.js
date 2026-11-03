import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createTurntable } from '../lib/turntable.js';
import { createHairlinePass } from '../lib/hairline-pass.js';
import { buildPlatter, platterExtent } from '../lib/platter.js';
import { buildPhone, pose, offsetOf } from './model.js';

/* Product · 02 — an iPhone Air on the turntable, taken apart along one axis.

   One model drives everything: θ (the turntable) and, per layer, two springs: o, how
   far apart it stands (0 assembled, 1 at the even gap), and f, its share of a wide gap
   that opens just in front of the chosen layer so its face shows. The meshes, the
   guides, the bright edge and the read-out are all read from those numbers.

   Hover    the phone comes apart; the layer under the pointer is chosen, takes the
            bright edge (rule 04), and the layers in front of it step aside. Changes reach
            each layer after |i − a| × 45 ms, spreading from the one touched (rule 02).
   Tap      does what hover does and holds it open; a tap off the phone closes.
   Drag     spins the turntable, as David's does.
   Keys     ← → turn a quarter · ↑ ↓ open and walk the layers · Esc closes.          */

const canvas = document.getElementById('stage');
const readout = document.getElementById('readout');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
const pixelRatio = () => (window.devicePixelRatio >= 3 ? 2 : Math.min(window.devicePixelRatio * 1.5, 3));
renderer.setPixelRatio(pixelRatio());

const scene = new THREE.Scene();
let lookVersion = 0;

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
const az = THREE.MathUtils.degToRad(45), el = Math.atan(0.5), dist = 6;
const target = new THREE.Vector3(0, 0.4, 0);
camera.position.set(Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
camera.lookAt(target);

// depths stored relative to the camera's distance, so half floats hold them to ~0.5 mm
// Hairline's line hierarchy on David's page colours; close lines merge into one
const pass = createHairlinePass(renderer, { depthBias: dist - 1, lines: 'hairline', merge: true });

/* ---- stage ------------------------------------------------------------------ */
const { base, spin, R } = buildPlatter(pass);
scene.add(base, spin);

const HEIGHT = 0.75;                      // the phone, in platter units (David is 1)
const S = HEIGHT / 0.16;                  // the model is in metres, 160 mm tall
const holder = new THREE.Group();         // model space → stage: a half turn so the screen faces +z, feet on the platter
holder.scale.set(-S, S, -S);
holder.position.y = 0.08 * S;
spin.add(holder);

/* ---- fit: the turntable and the phone at its widest, in any turn (rule 03) ----- */
camera.updateMatrixWorld();
const extent = (() => {
  const pts = platterExtent(R);
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * 0.3, HEIGHT + 0.01, Math.cos(a) * 0.3));
  }
  const box = new THREE.Box2(new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity));
  for (const p of pts) { p.applyMatrix4(camera.matrixWorldInverse); box.expandByPoint(new THREE.Vector2(p.x, p.y)); }
  return box;
})();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h, false);
  const top = 72, bottom = h - document.querySelector('.bottom').offsetHeight - 12;
  const availW = w - 32, availH = Math.max(120, bottom - top);
  const size = extent.getSize(new THREE.Vector2()), centre = extent.getCenter(new THREE.Vector2());
  const scale = Math.min(availW / size.x, availH / size.y) * 0.96;
  const pyc = (top + bottom) / 2;
  camera.left = centre.x - w / 2 / scale; camera.right = centre.x + w / 2 / scale;
  camera.top = centre.y + pyc / scale; camera.bottom = camera.top - h / scale;
  camera.updateProjectionMatrix();
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  pass.setSize(buf.x, buf.y, renderer.getPixelRatio());
  pass.setScale((camera.right - camera.left) / buf.x);
  lookVersion++;
}
window.addEventListener('resize', resize);
resize();

/* ---- the model -------------------------------------------------------------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const table = createTurntable({ tour: false });
let slow = false, gapK = 1;
let phone = null;                          // { layers, primary, guides }
const N = () => phone.layers.length;
const MIDDLE = 2;                          // the display: where an opening spreads from when nothing is chosen

const STEP = 0.045;                        // the stagger, s per layer
let clock = 0;
const springs = [];                        // per layer: { o, f, due: [[time, key, target]] }
let open = false, act = -1, pinned = false;
const sp = x => ({ x, v: 0, t: x });

// new targets for every layer, each arriving after its distance from `from`
function retarget(from) {
  for (let i = 0; i < N(); i++) {
    const at = clock + Math.abs(i - from) * STEP;
    const f = open && act >= 0 ? (i > act ? 0.5 : -0.5) : 0;
    springs[i].due = [[at, 'o', open ? 1 : 0], [at, 'f', f]];
  }
}
function setOpen(o, from) {
  if (!phone || o === open) return;
  open = o;
  if (!o) act = -1;
  retarget(from ?? (act >= 0 ? act : MIDDLE));
}
function setAct(a) {
  if (!phone || a === act) return;
  const was = act;
  act = a;
  retarget(a >= 0 ? a : was >= 0 ? was : MIDDLE);
}
function openOn(a) {
  if (!phone) return;
  if (open) { setAct(a); return; }
  open = true; act = a;
  retarget(a >= 0 ? a : MIDDLE);
}
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

/* ---- hit areas: fixed, never the mesh on screen (rule 01) --------------------- */
// a cylinder round the phone at rest; once it is open, one round the open stack
const hitRest = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, HEIGHT + 0.04, 24), new THREE.MeshBasicMaterial());
const hitOpen = new THREE.Mesh(new THREE.CylinderGeometry(R, R, HEIGHT + 0.06, 32), new THREE.MeshBasicMaterial());
for (const m of [hitRest, hitOpen]) { m.position.y = HEIGHT / 2; m.updateMatrixWorld(); }

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function aim(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
const overPhone = () => ray.intersectObject(open ? hitOpen : hitRest, false).length > 0;

// The layer picked is one that would be under the pointer once it is the chosen one:
// for each layer, pose the stack as it will stand with that layer chosen, and keep the
// layer if the ray meets it first. Never the pose on screen (rule 01), and a layer that
// moves out from under the pointer by being chosen is never picked, so nothing flickers.
// Of several, the one nearest the current choice holds.
function pickLayer() {
  if (!phone) return -1;
  const L = phone.layers, all = L.flatMap(l => l.meshes), ok = [];
  for (let c = 0; c < L.length; c++) {
    pose(L, L.map(() => 1), L.map((_, i) => (i > c ? 0.5 : -0.5)), gapK);
    holder.updateMatrixWorld(true);
    const hit = ray.intersectObjects(all, false)[0];
    if (hit && L[c].meshes.includes(hit.object)) ok.push(c);
  }
  // else whatever is under the pointer with the layers evenly apart: a pose that does not
  // depend on the choice, so it cannot flip either
  let even = -1;
  if (!ok.length) {
    pose(L, L.map(() => 1), L.map(() => 0), gapK);
    holder.updateMatrixWorld(true);
    const hit = ray.intersectObjects(all, false)[0];
    if (hit) even = L.findIndex(l => l.meshes.includes(hit.object));
  }
  pose(L, springs.map(s => s.o.x), springs.map(s => s.f.x), gapK);
  holder.updateMatrixWorld(true);
  if (!ok.length) return even >= 0 ? even : act;
  if (act < 0) return ok[ok.length - 1];
  return ok.reduce((b, c) => (Math.abs(c - act) < Math.abs(b - act) ? c : b));
}

/* ---- pointer ---------------------------------------------------------------- */
let dragging = false, lastX = 0, lastT = 0, downX = 0, downY = 0, moved = false, idle = 0, pointerIn = false;

function hover() {
  if (!phone) return;
  if (overPhone()) openOn(pickLayer());
  else if (!pinned) setOpen(false);
}

canvas.addEventListener('pointerdown', e => {
  dragging = true; moved = false; lastX = downX = e.clientX; downY = e.clientY; lastT = performance.now();
  canvas.setPointerCapture(e.pointerId);
  idle = 0; stopTour();
});
canvas.addEventListener('pointermove', e => {
  if (dragging) idle = 0;
  if (dragging && !moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) {
    moved = true; canvas.classList.add('dragging'); table.grab();
  }
  if (dragging && moved) {
    const now = performance.now();
    const dθ = ((e.clientX - lastX) / Math.min(window.innerWidth, 900)) * Math.PI * 1.2;
    table.drag(dθ, Math.max(1, now - lastT) / 1000);
    lastX = e.clientX; lastT = now;
    return;
  }
  // only the phone itself pauses the tour: the canvas fills the page, so a resting mouse
  // is always somewhere over it
  if (e.pointerType === 'mouse') {
    aim(e);
    pointerIn = overPhone();
    if (pointerIn || open) { stopTour(); hover(); }
  }
});
const release = e => {
  if (!dragging) return;
  dragging = false; canvas.classList.remove('dragging');
  if (moved) {
    if (performance.now() - lastT > 80) table.drag(0, 0.08); // held still before letting go: no throw
    table.release();
    return;
  }
  // a tap does what hover does, and holds it open; a tap off the phone closes
  aim(e);
  if (overPhone()) { pinned = true; hover(); } else { pinned = false; setOpen(false); }
  syncOpenBtn();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', e => {
  pointerIn = false;
  if (e.pointerType === 'mouse' && !dragging && !pinned) setOpen(false);
});
canvas.addEventListener('keydown', e => {
  if (!phone) return;
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') { table.flickBy(k === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') {
    // up walks toward the screen, down toward the back
    const start = act < 0 ? (k === 'ArrowUp' ? -1 : N()) : act;
    pinned = true;
    openOn(THREE.MathUtils.clamp(start + (k === 'ArrowUp' ? 1 : -1), 0, N() - 1));
    syncOpenBtn(); e.preventDefault();
  } else if (k === 'Escape') { pinned = false; setOpen(false); syncOpenBtn(); }
  else return;
  idle = 0; stopTour();
});

/* ---- controls --------------------------------------------------------------- */
const gapIn = document.getElementById('gap');
const stroke = document.getElementById('stroke');
const openBtn = document.getElementById('open');
const slowBtn = document.getElementById('slow');
const themeBtn = document.getElementById('theme');
const applyLook = () => {
  gapK = THREE.MathUtils.lerp(0.6, 1.2, +gapIn.value);   // at 1.2 the open stack still stands on the platter
  // only real folds are creases (rule 09: one crease, then draw less)
  pass.setLook({ detail: 0.25, stroke: +stroke.value, muscle: 0 });
  lookVersion++;
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
  pass.setTheme(dark ? 'dark' : 'light');
  lookVersion++;
}
themeBtn.addEventListener('click', () => { document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'; syncTheme(); });
sysDark.addEventListener('change', syncTheme);
new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
syncTheme();
applyLook();

/* ---- the tour: three stops that each show a different answer, then a leave ----- */
// open on the interface's content, walk back to the components, then the body; close; turn
const TOUR = [[1.6, () => openOn(4)], [3.6, () => setAct(1)], [5.6, () => setAct(0)],
  [7.4, () => setOpen(false)], [8.8, () => table.flickBy(1)]];
let tourT = 0, tourOn = !reduced, tourStep = 0;
function stopTour() { if (tourOn && tourStep > 0 && !pinned) setOpen(false); tourOn = false; tourT = 0; tourStep = 0; }
function stepTour(dt) {
  if (reduced || !phone) return;
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

/* ---- load ------------------------------------------------------------------- */
// window.PHONE_MODEL_URL lets a host that cannot serve .glb hand over a blob: URL instead.
new GLTFLoader().load(window.PHONE_MODEL_URL || './models/phone/iphone-air.glb', gltf => {
  const built = buildPhone(pass, gltf.scene, 10);
  holder.add(built.air);
  // dotted guides at the four corners, from the back glass through to the interface,
  // a millimetre inside the outline so the assembled body hides them
  const gx = 0.0385 - 0.0115 + 0.0115 * Math.SQRT1_2 - 0.0012, gy = 0.08 - 0.0115 + 0.0115 * Math.SQRT1_2 - 0.0012;
  const segs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => [new THREE.Vector3(sx * gx, sy * gy, 0), new THREE.Vector3(sx * gx, sy * gy, 1)]);
  const guides = pass.guides(segs);
  holder.add(guides);
  phone = { ...built, guides };
  if (/[?&]debug/.test(location.search)) window.__phone = phone;
  built.layers.forEach(() => springs.push({ o: sp(0), f: sp(0), due: [] }));
  // ?open&act=n opens on layer n at once, and ?turn=n turns n quarters: for still pictures
  const q = location.search, m = q.match(/[?&]act=(\d+)/), t = q.match(/[?&]turn=(\d+)/);
  if (/[?&]open/.test(q)) {
    pinned = true; tourOn = false; open = true; act = m ? +m[1] : -1; retarget(MIDDLE);
    springs.forEach(s => { s.due.forEach(([, k, v]) => { s[k].x = s[k].t = v; }); s.due = []; });
  }
  if (t) { tourOn = false; table.jump?.(+t[1]); }
  lookVersion++;
  document.getElementById('loading').remove();
}, undefined, err => { document.getElementById('loading').textContent = 'model failed to load'; console.error(err); });

/* ---- loop ------------------------------------------------------------------- */
const fmt = (n, w) => String(Math.round(n)).padStart(w, '0');
let prev = performance.now(), lastText = '', lastKey = '';
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - prev) / 1000) * (slow ? 0.25 : 1);
  prev = now; clock += dt;
  table.step(dt, dragging && moved);
  stepTour(dt);
  spin.rotation.y = table.theta;

  let sig = '';
  if (phone) {
    stepSprings(dt);
    const o = springs.map(s => s.o.x), f = springs.map(s => s.f.x);
    pose(phone.layers, o, f, gapK);
    // the guides run from the back glass to the front of the interface
    const first = phone.layers[0].group.position.z, last = phone.layers[N() - 1].group.position.z;
    phone.guides.position.z = first; phone.guides.scale.z = last - first;
    const mean = o.reduce((a, v) => a + v, 0) / o.length;
    pass.setGuideOpacity(THREE.MathUtils.smoothstep(mean, 0.15, 0.6));
    sig = o.map(v => v.toFixed(4)).join(',') + '|' + f.map(v => v.toFixed(4)).join(',');
  }

  const s = table.state();
  let part = 'rest';
  if (phone && act >= 0) {
    // a layer's number is its own: how far it stands from where it sits, + toward the screen
    const L = phone.layers[act], z = offsetOf(L, springs[act].o.x, springs[act].f.x, gapK) * 1000;
    part = `${String(act + 1).padStart(2, '0')}/${N()} ${L.name} · z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(1)} mm`;
  } else if (phone && open) part = 'apart';
  const text = `θ ${fmt(s.degrees, 3)}° · face <b>${s.face}</b>/4 · ${part}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }

  // one bright edge: the chosen layer, else the interface's primary button
  const hot = phone ? (act >= 0 ? [phone.layers[act].lo, phone.layers[act].hi] : phone.primary) : -1;
  const key = `${spin.rotation.y.toFixed(5)}|${lookVersion}|${sig}|${hot}`;
  if (key !== lastKey) { holder.updateMatrixWorld(true); pass.render(scene, camera, hot, scene); lastKey = key; }
});
