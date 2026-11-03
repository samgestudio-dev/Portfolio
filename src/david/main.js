import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createTurntable, QUARTER } from './turntable.js';
import { createHairlinePass } from './hairline-pass.js';

/* ---- stage ------------------------------------------------------------------ */
const canvas = document.getElementById('stage');
const readout = document.getElementById('readout');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
// supersample the strokes a little on 1–2× screens; a 3× phone is already dense enough at 2×
const pixelRatio = () => (window.devicePixelRatio >= 3 ? 2 : Math.min(window.devicePixelRatio * 1.5, 3));
renderer.setPixelRatio(pixelRatio());

const scene = new THREE.Scene();
let lookVersion = 0; // bumped whenever the picture must be redrawn without the turntable moving
const ID = { david: 1, platter: 2, base: 3 }; // David gets 1: the form value packed beside it keeps the most precision

// Hairline's camera: 45° azimuth, the 2:1 view (elevation atan ½).
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
const az = THREE.MathUtils.degToRad(45), el = Math.atan(0.5), dist = 6;
const target = new THREE.Vector3(0, 0.5, 0);
camera.position.set(Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
camera.lookAt(target);

const pass = createHairlinePass(renderer);
window.__lineStudy = { pass };   // for tuning from the console

/* ---- objects ---------------------------------------------------------------- */
// Everything spinning lives in `spin`; the base stays put.
const spin = new THREE.Group();
scene.add(spin);

const R = 0.34; // platter radius, in David-heights
const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.9, 0.06, 96), pass.material(ID.base));
base.position.y = -0.075;
scene.add(base);

const platter = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.035, 128), pass.material(ID.platter));
platter.position.y = -0.0175;
spin.add(platter);

// Four detents marked on the rim: small studs, one per quarter.
const studGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.012, 24);
for (let i = 0; i < 4; i++) {
  const s = new THREE.Mesh(studGeo, pass.material(ID.platter));
  const a = i * QUARTER + Math.PI / 4; // sits in front of a face, between the camera's axes
  s.position.set(Math.sin(a) * (R - 0.03), 0.006, Math.cos(a) * (R - 0.03));
  spin.add(s);
}

// Hit area: a fixed cylinder round David's rest pose, never the mesh on screen (Hairline rule 01).
const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 16), new THREE.MeshBasicMaterial());
hit.position.y = 0.5;
hit.updateMatrixWorld();

/* ---- frame the figure ------------------------------------------------------- */
// The most extreme points of the object, in the camera's view space: head, platter rim, base foot.
camera.updateMatrixWorld();
const extent = (() => {
  const pts = [new THREE.Vector3(0, 1.0, 0)];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R));
    pts.push(new THREE.Vector3(Math.sin(a) * R * 0.9, -0.105, Math.cos(a) * R * 0.9));
  }
  const box = new THREE.Box2(new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity));
  for (const p of pts) { p.applyMatrix4(camera.matrixWorldInverse); box.expandByPoint(new THREE.Vector2(p.x, p.y)); }
  return box;
})();

// Fit that box into the space between the header and the read-out stack.
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h, false);
  const top = 72, bottom = h - document.querySelector('.bottom').offsetHeight - 12;
  const availW = w - 32, availH = Math.max(120, bottom - top);
  const size = extent.getSize(new THREE.Vector2()), centre = extent.getCenter(new THREE.Vector2());
  const scale = Math.min(availW / size.x, availH / size.y) * 0.94; // px per world unit
  const pyc = (top + bottom) / 2;
  camera.left = centre.x - w / 2 / scale; camera.right = centre.x + w / 2 / scale;
  camera.top = centre.y + pyc / scale; camera.bottom = camera.top - h / scale;
  camera.updateProjectionMatrix();
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  pass.setSize(buf.x, buf.y, renderer.getPixelRatio());
  lookVersion++;
}
window.addEventListener('resize', resize);
resize();

/* ---- the model: one angle drives everything --------------------------------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const table = createTurntable({ tour: !reduced });
let slow = false;

/* ---- pointer ---------------------------------------------------------------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hot = 0, dragging = false, lastX = 0, lastT = 0;

function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(hit, false).length ? ID.david : 0;
}
canvas.addEventListener('pointerdown', e => {
  dragging = true; lastX = e.clientX; lastT = performance.now();
  canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging');
  table.grab();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' || dragging) hot = pick(e);
  if (!dragging) return;
  const now = performance.now();
  const dθ = ((e.clientX - lastX) / Math.min(window.innerWidth, 900)) * Math.PI * 1.2;
  table.drag(dθ, Math.max(1, now - lastT) / 1000);
  lastX = e.clientX; lastT = now;
});
const release = e => {
  if (!dragging) return;
  dragging = false; canvas.classList.remove('dragging');
  if (performance.now() - lastT > 80) table.drag(0, 0.08); // held still before letting go: no throw
  table.release();
  if (e.pointerType !== 'mouse') hot = 0;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { if (!dragging) hot = 0; });
canvas.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') { table.flickBy(1); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { table.flickBy(-1); e.preventDefault(); }
});

/* ---- controls --------------------------------------------------------------- */
const muscle = document.getElementById('muscle');
const detail = document.getElementById('detail');
const stroke = document.getElementById('stroke');
const slowBtn = document.getElementById('slow');
const contBtn = document.getElementById('continuous');
// the continuous-line rule: dashes joined into one smooth stroke, short bits hidden
let continuous = true;
const themeBtn = document.getElementById('theme');
const applyLook = () => (lookVersion++, pass.setLook({ detail: +detail.value, stroke: +stroke.value, muscle: +muscle.value }));
muscle.addEventListener('input', applyLook);
detail.addEventListener('input', applyLook);
stroke.addEventListener('input', applyLook);
contBtn.addEventListener('click', () => { continuous = !continuous; contBtn.setAttribute('aria-pressed', continuous); lookVersion++; });
slowBtn.addEventListener('click', () => { slow = !slow; slowBtn.setAttribute('aria-pressed', slow); });
// The page follows the system until the button sets a theme explicitly.
const sysDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : sysDark.matches;
};
function syncTheme() {
  const dark = isDark();
  themeBtn.setAttribute('aria-pressed', dark);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#131311' : '#f4f2eb';
  pass.setTheme(dark ? 'dark' : 'light');
  lookVersion++;
}
themeBtn.addEventListener('click', () => {
  document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
  syncTheme();
});
sysDark.addEventListener('change', syncTheme);
new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
syncTheme();
applyLook();

/* ---- load David ------------------------------------------------------------- */
// window.DAVID_MODEL_URL lets a host that cannot serve .glb hand over a blob: URL instead.
new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(window.DAVID_MODEL_URL || './models/david/david-mid.glb', gltf => {
  let geo;
  gltf.scene.traverse(o => { if (o.isMesh && !geo) { o.updateWorldMatrix(true, false); geo = o.geometry.clone().applyMatrix4(o.matrixWorld); } });
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const david = new THREE.Mesh(geo, pass.material(ID.david, { form: !!geo.attributes._formnormal }));
  spin.add(david);
  lookVersion++;
  document.getElementById('loading').remove();
}, undefined, err => { document.getElementById('loading').textContent = 'model failed to load'; console.error(err); });

/* ---- ink: the body's lines, joined and smoothed as vector strokes ---------------- */
const ink = document.getElementById('ink');
const ictx = ink.getContext('2d');
let strokes = null;
function sizeInk() {
  const d = Math.min(window.devicePixelRatio, 3);
  ink.width = Math.round(window.innerWidth * d); ink.height = Math.round(window.innerHeight * d);
  ictx.setTransform(d, 0, 0, d, 0, 0);
  strokes = null;
}
function drawInk(alpha) {
  ictx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (!strokes || alpha <= 0) return;
  const c = pass.colors();
  ictx.globalAlpha = alpha;
  ictx.lineCap = 'round'; ictx.lineJoin = 'round';
  ictx.lineWidth = +stroke.value;
  for (const [list, color] of [[strokes.crease, c.lo], [strokes.muscle, c.mid]]) {
    ictx.strokeStyle = color;
    ictx.beginPath();
    for (const p of list) {
      ictx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length - 1; i++) {
        ictx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
      }
      const l = p[p.length - 1];
      ictx.lineTo(l[0], l[1]);
    }
    ictx.stroke();
  }
  ictx.globalAlpha = 1;
}
window.addEventListener('resize', sizeInk);
sizeInk();

/* ---- loop ------------------------------------------------------------------- */
const fmt = (n, w) => String(Math.round(n)).padStart(w, '0');
let prev = performance.now(), lastText = '', lastKey = '';
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - prev) / 1000) * (slow ? 0.25 : 1);
  prev = now;
  table.step(dt, dragging);
  spin.rotation.y = table.theta;

  const s = table.state();
  const text = `θ ${fmt(s.degrees, 3)}° · ω ${s.omega.toFixed(2).padStart(5, ' ')} rad/s · face <b>${s.face}</b>/4 · ${s.mode}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }

  // draw only when something changed: the angle, the hover, the look, the size
  const sig = `${spin.rotation.y.toFixed(5)}|${lookVersion}`;
  const key = `${sig}|${hot}`;
  if (key !== lastKey) {
    const traced = pass.render(scene, camera, hot, { prune: continuous ? 1 : 0, sig });
    if (traced) strokes = traced;
    drawInk(continuous ? 1 : 0);
    lastKey = key;
  }
});
