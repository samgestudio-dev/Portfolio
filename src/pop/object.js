import { createTurntable } from '../lib/turntable.js';
// three.js is for David alone, and the heaviest thing here: fetched after the page is up
let THREE;
const davidKit = () => Promise.all([import('three'), import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js'), import('../lib/hairline-pass.js')]);
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 700 }) : setTimeout(f, 120));
import { Cam, proj, toward, circ, inside, setLight, shadeOf } from '../lib/iso.js';
import { fillKeyed } from '../lib/keyed-fill.js';
import { phone, phoneMids, phoneLayerAt, cabinet, drawerAt, CABINET_REST, CABINET_OUT, CABINET_MAX, atlas, restHull, CELLS, ATLAS_REST, REACH } from './draw.js';
import { AMP, CAP } from '../atlas/scene.js';

/* One object on the pop page: it lives in a stage element (a comic panel, or the full
   page once opened), is drawn the Hairline way at Hairline's camera, and keeps the
   behaviour it has on its own page:

   art      David, turning slowly on his own; a drag turns him; hovered, he turns faster
   product  the phone; hovered, its five layers come apart along one axis
   system   the token cabinet; hovered, its drawers slide out one after another
   motion   the spring atlas; the pillar under the pointer is plucked, and entering
            sends a ring out across the field

   and, under a mouse, each answers where the pointer is: David turns his head toward it,
   the phone opens a gap at the layer under it and inks that layer, the cabinet pulls the
   drawer under it furthest. The strip's own movement gives every object a turn too.

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
export const PRINT = { on: false, threshold: 0.62, range: 0.4, dot: 3, mode: 'am', dotR: 0.36, form: 0.15, grain: 1, grainSize: 5, light: [0.7, 0.45, 0.32], blur: 6, hollow: 1.1 };   // off: David is drawn in lines (on: his shadows in fine halftone dots, lit from the upper right)
// ?light=x,y,z (view space) and ?form=k (how much of the model's own frontal shading is mixed in), for tuning
{ const m = location.search.match(/[?&]light=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/); if (m) PRINT.light = [+m[1], +m[2], +m[3]]; }
{ const m = location.search.match(/[?&]form=([\d.]+)/); if (m) PRINT.form = +m[1]; }
// ?dots=am,4.5 or ?dots=fm,3.5[,0.36]: the screen and its pitch in px (and the FM dot's size)
{ const m = location.search.match(/[?&]dots=(am|fm),([\d.]+)(?:,([\d.]+))?/); if (m) Object.assign(PRINT, { mode: m[1], dot: +m[2], ...(m[3] ? { dotR: +m[3] } : {}) }); }
// ?print=threshold,range,dot,hollow overrides, for tuning by eye
{ const m = location.search.match(/[?&]print=([\d.]+),([\d.]+),([\d.]+),([\d.]+)/); if (m) Object.assign(PRINT, { threshold: +m[1], range: +m[2], dot: +m[3], hollow: +m[4] }); }

export function createObject(kind, { onOpen, colors }) {
  const table = createTurntable({ tour: false });
  const o = { kind, table, hover: false, dirty: true, el: null, stage: null, open: false };
  let svg, g, canvas, renderer, pass, scene3, cam3, spinMesh, davidExtent, drift = 0, pxPerUnit = 1, dotPitch = 1.2;
  let head = null, zoom = 0, vw = 1, vh = 1, bufW = 1;
  

  /* ---- the drawing surface ---- */
  if (kind === 'art') {
    canvas = document.createElement('canvas');
    canvas.className = 'obj-canvas';
    o.el = canvas;
    idle(async () => {
      const [three, { GLTFLoader }, { MeshoptDecoder }, { createHairlinePass }] = await davidKit();
      THREE = three;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false });
      pass = createHairlinePass(renderer, { transparent: true });
      pass.setColors(colors.david);
      pass.setLook({ detail: 0.55, stroke: 1.6, muscle: 0.45 });
      scene3 = new THREE.Scene(); spinMesh = new THREE.Group(); scene3.add(spinMesh);
      cam3 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
      // a touch from below (about 5° up at him), as a statue is seen from the floor it stands on
      const az = Math.PI / 4, el = -0.085, dist = 6, target = new THREE.Vector3(0, 0.5, 0);
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
      resize();
      // (a page that carries the model inline may hand over a promise of its url instead)
      const url = await Promise.resolve(window.DAVID_MODEL_URL_P || window.DAVID_MODEL_URL || './models/david/david-mid.glb');
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, gltf => {
        let geo;
        gltf.scene.traverse(m => { if (m.isMesh && !geo) { m.updateWorldMatrix(true, false); geo = m.geometry.clone().applyMatrix4(m.matrixWorld); } });
        if (!geo.attributes.normal) geo.computeVertexNormals();
        spinMesh.add(new THREE.Mesh(geo, pass.material(1, { form: !!geo.attributes._formnormal })));
        // where his head is, in his own units: the middle of everything above the chin
        const pos = geo.attributes.position; geo.computeBoundingBox();
        const top = geo.boundingBox.max.y;
        let n = 0, x = 0, z = 0, y0 = Infinity, y1 = -Infinity;
        for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); if (y > top - 0.11) { x += pos.getX(k); z += pos.getZ(k); n++; y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
        head = { x: x / n, z: z / n, y: (y0 + y1) / 2 - 0.012, r: 0.075 };
        frameCam();
        o.dirty = true; o.loaded = true;
      });
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
  const lift = [0, 0, 0, 0, 0].map(() => sp(0));      // mm, the gap the pointer opens
  const look = sp(0);                                   // David's turn toward the pointer
  let hot = -1, spin = 0, spinV = 0;
  const dir = sp(1);                                    // which way David turns on his own: the strip's last way                    // the strip's movement turns them a little
  const LIFT = 6;
  const drawers = CABINET_REST.map(x => ({ ...sp(x), due: Infinity, to: x }));
  const answers = [], SUM = new Float64Array(CELLS.length);
  let lastCell = -1, clock = 0;
  const C_ = Cam(45, 0.5, 1);
  const setAz = () => { C_.az = (45 * Math.PI) / 180 - table.theta - drift - spin; };

  function setHover(on) {
    if (on === o.hover) return;
    o.hover = on;
    if (kind === 'product') {
      // from the middle layer out, 45 ms a layer (rule 02)
      layers.forEach((L, i) => { L.due = clock + Math.abs(i - 2) * 0.045; L.to = on ? 1 : 0; });
    } else if (kind === 'system') {
      // top drawer first going out, bottom first coming home
      drawers.forEach((d, k) => { d.due = clock + (on ? 3 - k : k) * 0.07; d.to = drawerTo(k, on); });
    } else if (kind === 'motion' && on) wave(0, 0);
    if (!on) setHot(-1);
    o.dirty = true;
  }
  const drawerTo = (k, on) => !on ? CABINET_REST[k] : hot < 0 ? CABINET_OUT[k] : k === hot ? CABINET_MAX : CABINET_OUT[k] * 0.45;
  function setHot(h) {
    if (h === hot) return;
    hot = h;
    if (kind === 'product') lift.forEach((L, i) => (L.t = h < 0 ? 0 : i > h ? LIFT : i === h ? LIFT / 2 : 0));
    if (kind === 'system' && o.hover) drawers.forEach((d, k) => { d.to = drawerTo(k, true); if (d.due === Infinity) d.t = d.to; });
    o.dirty = true;
  }
  // the pointer has left: everything it was answering goes home
  function away() { setHot(-1); look.t = 0; lastCell = -1; }
  // the strip moved by dpx: a turn that dies away, as a turntable nudged in passing
  function nudge(dpx) { if (reduced) return; spinV += dpx * 0.0016; if (Math.abs(dpx) > 0.5) dir.t = Math.sign(dpx); }
  // the drawing's shape, width over height: for moving it between stages without stretching
  function aspect() {
    if (svg) { const vb = svg.viewBox.baseVal; return vb.width / vb.height; }
    if (!davidExtent) return 0.42;          // his usual shape, until three.js is here
    const sz = davidExtent.getSize(new THREE.Vector2()); return sz.x / sz.y;
  }
  // the atlas: a kick is its own answer, and answers add (as ripples on water do)
  function kick(n, a) { if (!reduced) answers.push({ n, a, x: 0, v: 0, t: 0 }); }
  const waves = [];
  function wave(cx, cy) { if (!reduced) waves.push({ cx, cy, r: -1e-6 }); }

  function pointer(e) {
    if (kind === 'art') {
      // he turns his head toward the pointer, a little, through the spring
      const r = o.stage.getBoundingClientRect();
      look.t = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5)) * 0.9;
      return;
    }
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(g.getScreenCTM().inverse());
    setAz();
    const P = proj(C_), T = toward(C_);
    if (kind === 'product') {
      // the layer under the pointer as drawn (front-most where they overlap), once they stand
      // apart, tested where they are headed; and only taken if it would still be under the
      // pointer once its own gap had opened (else the gap moving would hand it straight back)
      const apart = layers.reduce((a, L) => a + L.to, 0) / layers.length;
      if (apart < 0.5) return setHot(-1);
      const o_ = layers.map(L => L.to), liftFor = h => lift.map((_, i) => (h < 0 ? 0 : i > h ? LIFT : i === h ? LIFT / 2 : 0));
      const k = phoneLayerAt(P, T, o_, liftFor(hot), [q.x, q.y]);
      if (k === hot) return;
      if (k < 0) return setHot(-1);
      if (phoneLayerAt(P, T, o_, liftFor(k), [q.x, q.y]) === k) setHot(k);
      return;
    }
    if (kind === 'system') {
      // the drawer whose front holds the pointer, tested where each is headed (rule 01)
      const k = drawerAt(P, T, drawers.map(d => d.to), [q.x, q.y]);
      if (k >= 0 || !o.hover) setHot(k);
      return;
    }
    // the pillar under the pointer, tested on the pillars at rest (rule 01)
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
    // every object turns slowly on its own, the way the strip last moved (David a little faster when hovered)
    if (!reduced) { if (dir.x !== dir.t || dir.v) spring(dir, dt); drift += dt * (kind === 'art' ? (o.hover ? 0.5 : 0.22) : 0.16) * dir.x; moved = true; }
    if (kind === 'art' && !reduced && (look.x !== look.t || look.v)) spring(look, dt);
    if (spinV) { spin += spinV * dt; spinV *= Math.exp(-2.6 * dt); if (Math.abs(spinV) < 1e-3) spinV = 0; moved = true; }
    if (kind === 'product') for (const L of lift) if (L.x !== L.t || L.v) { spring(L, dt); moved = true; }
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
    // the object turns under a pointer that has stopped: ask again what is under it, now and then
    if (moved && o._pt && o.hover && (kind === 'product' || kind === 'system') && (o._tick = (o._tick || 0) + 1) % 4 === 0) pointer(o._pt);
  }

  const knee = s => { const a = Math.abs(s); return a <= 1 ? s : Math.sign(s) * (1 + (CAP - 1) * Math.tanh((a - 1) / (CAP - 1))); };
  function draw() {
    if (!o.dirty || !o.stage) return;
    o.dirty = false;
    if (kind === 'art') {
      if (!pass) return;
      if (zoom > 0) frameCam();
      spinMesh.rotation.y = table.theta + drift + spin + look.x;
      pass.render(scene3, cam3, -1);
      return;
    }
    setAz();
    const P = proj(C_), T = toward(C_);
    // printed: one light from the upper left, in front, fixed to the viewer as a flash is;
    // every wall seen but turned from it is laid in ink, right after its own solid
    const c = Math.cos(C_.az), sn = Math.sin(C_.az), right = [c, -sn, 0];
    let L = norm3([-0.6 * right[0] + 0.5 * T[0], -0.6 * right[1] + 0.5 * T[1], 0.62 + 0.5 * T[2]]);
    if (kind === 'product') {
      // the phone's own light: nearly from the viewer, a little to the left, 40° up, so its
      // screen stays lit as it turns left until it is all but edge-on (about 85°), and only
      // then do its faces go into shadow
      const th = norm3([T[0], T[1], 0]), phi = (-12 * Math.PI) / 180, el = (40 * Math.PI) / 180;
      L = norm3([0, 1, 2].map(i => Math.cos(el) * (Math.cos(phi) * th[i] + Math.sin(phi) * right[i]) + (i === 2 ? Math.sin(el) : 0)));
    }
    setLight(L, { mode: 'sweep' });   // the phone, cabinet and atlas: the shadow's edge sweeps across each wall as it turns
    const list = kind === 'product' ? phone(P, T, layers.map(L => Math.max(0, L.x)), lift.map(L => L.x), hot)
      : kind === 'system' ? cabinet(P, T, drawers.map(d => Math.max(0, d.x)), hot)
      : atlas(P, T, CELLS.map((c, n) => ATLAS_REST[n] + AMP * knee(SUM[n])), -1);
    const out = [];
    for (const e of list) {
      out.push(e);
      // every solid that was drawn as a prism may have walls in shadow (the drawers' floors and
      // walls are drawn in a lighter line, but they are walls all the same)
      if (e[0] !== 'cr' && e[0] !== 'guide') { const sh = shadeOf(e[1]); if (sh) out.push(['shade', sh, e[2] + '-sh']); }
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
      pxPerUnit = k;
      // the shadows' dot screen: about 5 px a dot as seen opened, so a panel's is as fine for its size
      dotPitch = 5 / Math.max(0.1, Math.min((innerWidth > 900 ? innerWidth * 0.52 - 52 : innerWidth - 32) / vb.width, (innerWidth > 900 ? innerHeight - 132 : innerHeight * 0.46 - 64) / vb.height));
      // the grain belongs to the drawing, not the screen: tuned on the opened page (about
      // 2.6 px of wobble there) and scaled with the drawing, so a panel's smaller drawing
      // shakes as little, for its size, as the big one does
      const roomW = innerWidth > 900 ? innerWidth * 0.52 - 52 : innerWidth - 32, roomH = innerWidth > 900 ? innerHeight - 132 : innerHeight * 0.46 - 64;
      const kRoom = Math.max(0.1, Math.min(roomW / vb.width, roomH / vb.height));
      svg.querySelector('feTurbulence').setAttribute('baseFrequency', (0.55 / kRoom).toFixed(4));
      svg.querySelector('feDisplacementMap').setAttribute('scale', (2.6 / kRoom).toFixed(3));
    }
    if (!o.stage || kind !== 'art' || !renderer) { o.dirty = true; return; }
    // his canvas's own size (on his page it reaches past the stage), as laid out, transforms aside
    vw = Math.max(1, canvas.offsetWidth); vh = Math.max(1, canvas.offsetHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * 1.25;
    renderer.setPixelRatio(dpr); renderer.setSize(vw, vh, false);
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    pass.setSize(buf.x, buf.y, renderer.getPixelRatio());
    bufW = buf.x;
    // seen big, look for folds over a longer reach so his face keeps its lines
    pass.setReach(Math.min(3, Math.max(1, Math.sqrt(buf.y / 900))), 0.5);
    pass.setPrint(PRINT);
    frameCam();
  }
  /* David's framing, between all of him (zoom 0, as in his frame) and his head alone (zoom 1,
     as on his opened page): the middle and the size eased between the two; the head followed
     as he turns, since it is not on his axis */
  function frameCam() {
    if (!renderer || !davidExtent) return;
    const bs = davidExtent.getSize(new THREE.Vector2()), bc = davidExtent.getCenter(new THREE.Vector2());
    let cx = bc.x, cy = bc.y, sx = bs.x, sy = bs.y;
    if (zoom > 0 && head) {
      const a = table.theta + drift + spin + look.x, ca = Math.cos(a), sa = Math.sin(a);
      const hp = new THREE.Vector3(head.x * ca + head.z * sa, head.y, -head.x * sa + head.z * ca).applyMatrix4(cam3.matrixWorldInverse);
      const hs = head.r * 2.3, t = zoom;
      // the size eased on a log scale, so the push in feels even all the way
      sx = Math.exp(Math.log(sx) + (Math.log(hs) - Math.log(sx)) * t); sy = Math.exp(Math.log(sy) + (Math.log(hs) - Math.log(sy)) * t);
      // his head high on the page (its middle about 40% down), the bust running on below
      const s0 = Math.min(vw / sx, vh / sy) * 0.92, up = (0.5 - 0.4) * (vh / s0);
      cx += (hp.x - cx) * t; cy += (hp.y - up - cy) * t;
    }
    const s = Math.min(vw / sx, vh / sy) * 0.92;
    cam3.left = cx - vw / 2 / s; cam3.right = cx + vw / 2 / s; cam3.top = cy + vh / 2 / s; cam3.bottom = cy - vh / 2 / s;
    cam3.updateProjectionMatrix();
    pass.setScale((cam3.right - cam3.left) / bufW);
    o.dirty = true;
  }
  function setZoom(z) { if (kind !== 'art' || z === zoom) return; zoom = z; frameCam(); }

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
      if (e.pointerType === 'mouse' && !dragging) { setHover(true); pointer(e); o._pt = { clientX: e.clientX, clientY: e.clientY }; }
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
      const was = dragging, d0 = down; down = null; dragging = false; target.classList.remove('turning');
      if (was) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); return; }
      // a tap opens it; a finger that travelled (paging the strip on a phone) does not
      if (e.type === 'pointerup' && !o.open && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 10) onOpen?.(e);
    };
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { away(); o._pt = null; } });
  }

  // a still of the drawing as it stands: the SVG copied, David's canvas painted into a plain one
  // (read back in the same task it was rendered, while WebGL still holds the picture)
  function snapshot() {
    if (svg) return svg.cloneNode(true);
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height; c.className = canvas.className;
    if (pass) { o.dirty = true; draw(); c.getContext('2d').drawImage(canvas, 0, 0); }
    return c;
  }
  Object.assign(o, { step: dt => step(dt, { dragging }), draw, mount, resize, bind, setHover, wave, nudge, aspect, away, snapshot, setZoom });
  return o;
}
