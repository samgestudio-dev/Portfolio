import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createTurntable } from '../lib/turntable.js';
import { createHairlinePass } from '../lib/hairline-pass.js';
import { Cam, proj, toward, circ, inside, setLight, shadeOf } from '../lib/iso.js';
import { fillKeyed } from '../lib/keyed-fill.js';
import { phone, cabinet, CABINET_REST, CABINET_OUT, atlas, restHull, CELLS, ATLAS_REST, REACH } from './draw.js';
import { AMP, CAP } from '../atlas/scene.js';

/* One object on the pop page: it lives in a stage element (a comic panel, or the full
   page once opened), is drawn the Hairline way at Hairline's camera, and keeps the
   behaviour it has on its own page:

   art      David, turning slowly on his own; a drag turns him; hovered, he turns faster
   product  the phone; hovered, its five layers come apart along one axis
   system   the token cabinet; hovered, its drawers slide out one after another
   motion   the spring atlas; the pillar under the pointer is plucked, and entering
            sends a ring out across the field

   One model each (Kaero): θ, a turntable, and the object's own springs. The loop
   draws only when something moved (rule 07).                                        */

const NS = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const K = 100, C = 18;                          // Hairline's spring
function spring(s, dt) {
  const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  for (let i = 0; i < n; i++) { s.v += (-K * (s.x - s.t) - C * s.v) * h; s.x += s.v * h; }
  if (Math.abs(s.x - s.t) < 1e-4 && Math.abs(s.v) < 1e-3) { s.x = s.t; s.v = 0; return false; }
  return true;
}
const sp = x => ({ x, v: 0, t: x });
const norm3 = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
// David's silkscreen: the light (view space) from the upper left, a little in front
export const PRINT = { on: true, threshold: 0.5, grain: 1, grainSize: 5, light: [-0.62, 0.5, 0.6], blur: 6, hollow: 1.5 };   // about 19% of him in ink, as much as Warhol's Marilyn
// ?print=threshold,blur,hollow overrides, for tuning by eye
{ const m = location.search.match(/[?&]print=([\d.]+),([\d.]+),([\d.]+)/); if (m) Object.assign(PRINT, { threshold: +m[1], blur: +m[2], hollow: +m[3] }); }

export function createObject(kind, { onOpen, colors }) {
  const table = createTurntable({ tour: false });
  const o = { kind, table, hover: false, dirty: true, el: null, stage: null, open: false };
  let svg, g, canvas, renderer, pass, scene3, cam3, spinMesh, davidExtent, drift = 0;

  /* ---- the drawing surface ---- */
  if (kind === 'art') {
    canvas = document.createElement('canvas');
    canvas.className = 'obj-canvas';
    o.el = canvas;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false });
    pass = createHairlinePass(renderer, { transparent: true });
    pass.setColors(colors.david);
    pass.setLook({ detail: 0.55, stroke: 1.6, muscle: 0.45 });
    scene3 = new THREE.Scene(); spinMesh = new THREE.Group(); scene3.add(spinMesh);
    cam3 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    const az = Math.PI / 4, el = Math.atan(0.5), dist = 6, target = new THREE.Vector3(0, 0.5, 0);
    cam3.position.set(Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    cam3.lookAt(target); cam3.updateMatrixWorld();
    // the frame: his head, his rock, at any turn (rule 03)
    const box = new THREE.Box2(new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity));
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      for (const [r, y] of [[0.17, 1.0], [0.2, 0.0], [0.14, 0.55]]) {
        const p = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r).applyMatrix4(cam3.matrixWorldInverse);
        box.expandByPoint(new THREE.Vector2(p.x, p.y));
      }
    }
    davidExtent = box;
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(window.DAVID_MODEL_URL || './models/david/david-mid.glb', gltf => {
      let geo;
      gltf.scene.traverse(m => { if (m.isMesh && !geo) { m.updateWorldMatrix(true, false); geo = m.geometry.clone().applyMatrix4(m.matrixWorld); } });
      if (!geo.attributes.normal) geo.computeVertexNormals();
      spinMesh.add(new THREE.Mesh(geo, pass.material(1, { form: !!geo.attributes._formnormal })));
      o.dirty = true;
    });
  } else {
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'obj-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // the print's grain, its own per object: sized in screen pixels, so it stays as fine
    // seen big as seen small (an SVG filter counts in the drawing's own units)
    const fid = `print-${kind}`;
    svg.insertAdjacentHTML('afterbegin', `<defs><filter id="${fid}" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" numOctaves="2" seed="7" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`);
    g = document.createElementNS(NS, 'g'); svg.appendChild(g);
    g.setAttribute('filter', `url(#${fid})`);
    o.el = svg;
    // the frame: the object's whole reach at any turn, so it never has to be refitted
    const R = REACH[kind], P = proj(Cam(45, 0.5, 1)), pts = [];
    for (const z of [R.z0, R.z1]) for (const q of circ(0, 0, R.r, 64)) pts.push(P(q.u, q.v, z));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 4;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
    svg.setAttribute('viewBox', `${x0} ${y0} ${Math.max(...xs) - x0 + pad} ${Math.max(...ys) - y0 + pad}`);
  }

  /* ---- each object's own springs ---- */
  const layers = [0, 0, 0, 0, 0].map(() => ({ ...sp(0), due: Infinity, to: 0 }));
  const drawers = CABINET_REST.map(x => ({ ...sp(x), due: Infinity, to: x }));
  const answers = [], SUM = new Float64Array(CELLS.length);
  let lastCell = -1, clock = 0;
  const C_ = Cam(45, 0.5, 1);
  const setAz = () => { C_.az = (45 * Math.PI) / 180 - table.theta - drift; };

  function setHover(on) {
    if (on === o.hover) return;
    o.hover = on;
    if (kind === 'product') {
      // from the middle layer out, 45 ms a layer (rule 02)
      layers.forEach((L, i) => { L.due = clock + Math.abs(i - 2) * 0.045; L.to = on ? 1 : 0; });
    } else if (kind === 'system') {
      // top drawer first going out, bottom first coming home
      drawers.forEach((d, k) => { d.due = clock + (on ? 3 - k : k) * 0.07; d.to = on ? CABINET_OUT[k] : CABINET_REST[k]; });
    } else if (kind === 'motion' && on) wave(0, 0);
    o.dirty = true;
  }
  // the atlas: a kick is its own answer, and answers add (as ripples on water do)
  function kick(n, a) { if (!reduced) answers.push({ n, a, x: 0, v: 0, t: 0 }); }
  const waves = [];
  function wave(cx, cy) { if (!reduced) waves.push({ cx, cy, r: -1e-6 }); }

  function pointer(e) {
    if (kind !== 'motion' || !svg) return;
    // the pillar under the pointer, tested on the pillars at rest (rule 01)
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(g.getScreenCTM().inverse());
    setAz();
    const P = proj(C_), T = toward(C_);
    const near = CELLS.map((c, n) => ({ n, k: T[0] * c.cx + T[1] * c.cy })).sort((a, b) => b.k - a.k);
    for (const { n } of near) if (inside([q.x, q.y], restHull(P, n))) { if (n !== lastCell) { lastCell = n; kick(n, 0.55); } return; }
  }

  /* ---- time ---- */
  function step(dt, { dragging }) {
    clock += dt;
    table.step(dt, dragging);
    let moved = false;
    const th = table.theta;
    if (o._th !== th) { o._th = th; moved = true; }
    if (kind === 'art' && !reduced) { drift += dt * (o.hover ? 0.9 : 0.22); moved = true; }
    if (kind === 'product') for (const L of layers) { if (clock >= L.due) { L.t = L.to; L.due = Infinity; } if (L.x !== L.t || L.v) { spring(L, dt); moved = true; } }
    if (kind === 'system') for (const d of drawers) { if (clock >= d.due) { d.t = d.to; d.due = Infinity; } if (d.x !== d.t || d.v) { spring(d, dt); moved = true; } }
    if (kind === 'motion' && (answers.length || waves.length)) {
      for (let w = waves.length - 1; w >= 0; w--) {
        const wv = waves[w], r1 = wv.r + 150 * dt;
        CELLS.forEach((c, n) => { const d = Math.hypot(c.cx - wv.cx, c.cy - wv.cy); if (d > wv.r && d <= r1) kick(n, 0.8); });
        wv.r = r1; if (r1 > 140) waves.splice(w, 1);
      }
      SUM.fill(0);
      const n = Math.max(1, Math.ceil(dt * 480)), h = dt / n;
      for (let q = answers.length - 1; q >= 0; q--) {
        const A = answers[q];
        if (A.t < 0.14) { A.t += dt; const t = Math.min(1, A.t / 0.14); A.x = A.a * (1 - (1 - t) ** 3); A.v = 0; }
        else {
          const { k, c } = CELLS[A.n];
          for (let s = 0; s < n; s++) { A.v += (-k * A.x - c * A.v) * h; A.x += A.v * h; }
          if (Math.abs(A.x) < 0.002 && Math.abs(A.v) < 0.02) { answers.splice(q, 1); continue; }
        }
        SUM[A.n] += A.x;
      }
      moved = true;
    }
    if (moved) o.dirty = true;
  }

  const knee = s => { const a = Math.abs(s); return a <= 1 ? s : Math.sign(s) * (1 + (CAP - 1) * Math.tanh((a - 1) / (CAP - 1))); };
  function draw() {
    if (!o.dirty || !o.stage) return;
    o.dirty = false;
    if (kind === 'art') {
      spinMesh.rotation.y = table.theta + drift;
      pass.render(scene3, cam3, -1);
      return;
    }
    setAz();
    const P = proj(C_), T = toward(C_);
    // printed: one light from the upper left, in front, fixed to the viewer as a flash is;
    // every wall seen but turned from it is laid in ink, right after its own solid
    const c = Math.cos(C_.az), sn = Math.sin(C_.az), right = [c, -sn, 0];
    const L = norm3([-0.6 * right[0] + 0.5 * T[0], -0.6 * right[1] + 0.5 * T[1], 0.62 + 0.5 * T[2]]);
    setLight(L);
    const list = kind === 'product' ? phone(P, T, layers.map(L => Math.max(0, L.x)))
      : kind === 'system' ? cabinet(P, T, drawers.map(d => Math.max(0, d.x)))
      : atlas(P, T, CELLS.map((c, n) => ATLAS_REST[n] + AMP * knee(SUM[n])), -1);
    const out = [];
    for (const e of list) {
      out.push(e);
      if (e[0] === 'sil' || e[0] === 'sil hi') { const sh = shadeOf(e[1]); if (sh) out.push(['shade', sh, e[2] + '-sh']); }
    }
    setLight(null);
    fillKeyed(g, out);
  }

  /* ---- where it lives: a panel, or the opened page ---- */
  function mount(stage) {
    o.stage = stage;
    stage.appendChild(o.el);
    resize();
  }
  function resize() {
    if (svg && o.stage) {
      const vb = svg.viewBox.baseVal, r = o.stage.getBoundingClientRect();
      const k = Math.min(r.width / vb.width, r.height / vb.height) || 1;     // screen px per drawing unit
      svg.querySelector('feTurbulence').setAttribute('baseFrequency', (0.55 / k).toFixed(4));
      svg.querySelector('feDisplacementMap').setAttribute('scale', (2.6 / k).toFixed(3));
    }
    if (!o.stage || kind !== 'art') { o.dirty = true; return; }
    const r = o.stage.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * 1.25;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    const size = davidExtent.getSize(new THREE.Vector2()), c = davidExtent.getCenter(new THREE.Vector2());
    const s = Math.min(w / size.x, h / size.y) * 0.92;
    cam3.left = c.x - w / 2 / s; cam3.right = c.x + w / 2 / s; cam3.top = c.y + h / 2 / s; cam3.bottom = c.y - h / 2 / s;
    cam3.updateProjectionMatrix();
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    pass.setSize(buf.x, buf.y, renderer.getPixelRatio());
    pass.setScale((cam3.right - cam3.left) / buf.x);
    // seen big, look for folds over a longer reach so his face keeps its lines
    pass.setReach(Math.min(3, Math.max(1, Math.sqrt(buf.y / 900))), 0.5);
    pass.setPrint(PRINT);
    o.dirty = true;
  }

  /* ---- hands: drag turns it, a tap opens it ---- */
  let down = null, dragging = false, lastX = 0, lastT = 0;
  function bind(target) {
    // one surface can host several objects in turn (the opened room): only the one in it answers
    target.addEventListener('pointerdown', e => {
      if (e.button || !target.contains(o.el)) return;
      down = { x: e.clientX, y: e.clientY }; dragging = false; lastX = e.clientX; lastT = performance.now();
    });
    target.addEventListener('pointermove', e => {
      if (!target.contains(o.el)) return;
      if (e.pointerType === 'mouse') { setHover(true); pointer(e); }
      if (!down) return;
      if (!dragging && Math.abs(e.clientX - down.x) > 8 && Math.abs(e.clientX - down.x) > Math.abs(e.clientY - down.y)) {
        dragging = true; table.grab(); target.setPointerCapture(e.pointerId); target.classList.add('turning');
      }
      if (dragging) {
        const now = performance.now();
        table.drag(((e.clientX - lastX) / 600) * Math.PI, Math.max(1, now - lastT) / 1000);
        lastX = e.clientX; lastT = now; e.preventDefault();
      }
    });
    const up = e => {
      if (!down) return;
      const was = dragging; down = null; dragging = false; target.classList.remove('turning');
      if (was) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); return; }
      if (e.type === 'pointerup' && !o.open) onOpen?.(e);
    };
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !o.open) { setHover(false); lastCell = -1; } });
  }

  Object.assign(o, { step: dt => step(dt, { dragging }), draw, mount, resize, bind, setHover, wave });
  return o;
}
