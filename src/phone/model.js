import * as THREE from 'three';
import { UI, UI_LEVELS } from './ui.js';

/* The phone, in the model's own units (metres) and axes: x across, y up, z through the
   body with the screen facing −z. The outside is Ranguel's iPhone Air (CC BY 4.0), as
   it came; the inside and the interface are built here, to Apple's and iFixit's layout:
   the logic board tucked under the camera plateau, a metal-cased battery filling the
   rest, the Taptic Engine and the speaker at the foot.

   Five layers, back to front, each one group that moves along z only: one axis.
     body · components · display · interface layout · interface content
   Ids are handed out in that order, so a layer is one run of ids and can be lit
   whole (Hairline rule 04: one highlight may cover the parts of one thing).          */

export const FRONT = -1;             // the screen faces −z
const SCREEN_Z = -0.0029;            // the glass's outer face
const PT = 0.0712 / 420;             // metres per iPhone point: the display is 71.2 mm wide
const UI_STEP = 0.00004;           // assembled, each interface plane sits 0.04 mm over its parent

// front-view x (to the viewer's right when the screen faces them) is the model's −x
const fx = x => -x;

function rrect(x0, y0, x1, y1, r, s = new THREE.Shape()) {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5);
  return s;
}
// a shape pulled through z from z0 by t (negative t goes toward the front)
function slab(shape, segments = 10) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: segments });
  return g;
}
// a box-like part from front-view coordinates, z0..z1 in model z
function block(pass, id, [x0, y0, x1, y1], r, z0, z1, opts) {
  const m = new THREE.Mesh(slab(rrect(fx(x1), y0, fx(x0), y1, r)), pass.material(id, opts));
  m.position.z = Math.min(z0, z1); m.scale.z = Math.abs(z1 - z0);
  return m;
}

export function buildPhone(pass, gltfScene, firstId) {
  let id = firstId;
  const air = new THREE.Group();
  const layers = [];
  const layer = (name, gap) => { const g = new THREE.Group(); air.add(g); const L = { name, group: g, gap, lo: id, hi: id, meshes: [] }; layers.push(L); return L; };
  const own = (L, obj) => { L.group.add(obj); obj.traverse(o => o.isMesh && L.meshes.push(o)); };
  const next = () => id++;

  // the model's nodes, by name, without the root's own quarter turn; the loader turns
  // spaces into underscores and drops '/', so names are matched loosely
  const key = n => n.replace(/[\s_\[\].:/]/g, '').toLowerCase();
  const nodes = {};
  gltfScene.traverse(o => { if (o.parent && o.parent.name === 'Phone') nodes[key(o.name)] = o; });
  // parts that sit inside a glass and would only flicker against it
  const drop = { Screen: ['Glass Tint', 'Display'] };
  // pid: an id to share with a part already taken, for marks too small to be a solid
  const take = (L, name, shared) => {
    const n = nodes[key(name)];
    if (!n) { console.warn('phone: no node', name); return; }
    const pid = shared ?? next();
    n.removeFromParent(); n.position.set(0, 0, 0); n.quaternion.identity(); n.scale.set(1, 1, 1);
    const kill = [];
    n.traverse(o => {
      if (!o.isMesh) return;
      if ((drop[name] || []).includes(o.material.name)) { kill.push(o); return; }
      // the logo is an inlay through the back glass: given the glass's own id it fills its
      // cut-out and draws nothing (rule 10: no marks that label)
      o.material = pass.material(pid); o.userData.id = pid;
    });
    kill.forEach(o => o.removeFromParent());
    own(L, n);
    return pid;
  };

  /* body: everything at the back, kept together: the back glass with its plateau, flash
     and microphone, the camera module standing in the plateau, the metal-cased battery,
     and the titanium frame with its buttons. Port, speaker holes and screw are drawn as
     part of the frame (rule 09: draw less). */
  const body = layer('body', 0);
  take(body, 'Back Glass'); take(body, 'Back Flash'); take(body, 'Back Mic mesh');
  take(body, 'Back Camera module');
  { const m = block(pass, next(), [-0.0335, -0.0635, 0.0335, 0.0465], 0.0045, -0.0016, 0.0016); m.userData.id = id - 1; own(body, m); }
  const band = take(body, 'Body');
  for (const n of ['USB C port', 'Speaker mesh', 'Screw']) take(body, n, band);
  for (const n of ['Button Action', 'Button Volume Up', 'Button Volume Down', 'Button Power On/Off', 'Camera Control']) take(body, n);

  /* components: one stacked board under the plateau, a cut-out where the camera passes,
     the A19 Pro, C1X modem and N1 chip facing the display, the front camera, and at the
     foot the Taptic Engine and the speaker */
  const parts = layer('components', 0.013);
  {
    const sh = rrect(fx(0.033), 0.0498, fx(-0.033), 0.0766, 0.006);
    sh.holes.push(rrect(fx(0.0302), 0.0554, fx(0.0134), 0.0722, 0.004));
    const m = new THREE.Mesh(slab(sh), pass.material(next()));
    m.position.z = 0.0005; m.scale.z = 0.0008; m.userData.id = id - 1;
    own(parts, m);
    const chips = [
      [[-0.012, 0.0555, 0.0025, 0.070], 0.0015, 0.0008],   // A19 Pro
      [[-0.0295, 0.0575, -0.0175, 0.0685], 0.0012, 0.0006], // C1X
      [[0.0045, 0.064, 0.0105, 0.0715], 0.001, 0.0005],    // N1
    ];
    for (const [rect, r, h] of chips) { const c = block(pass, next(), rect, r, 0.0005, 0.0005 - h); c.userData.id = id - 1; own(parts, c); }
    take(parts, 'Front Camera module');
    for (const rect of [[-0.031, -0.0755, -0.0115, -0.0665], [0.0115, -0.0755, 0.031, -0.0665]]) {
      const c = block(pass, next(), rect, 0.0016, -0.0013, 0.0013); c.userData.id = id - 1; own(parts, c);
    }
  }

  /* display: the glass */
  const disp = layer('display', 0.013);
  take(disp, 'Screen');

  /* the interface, one layer per depth of nesting */
  const uiLayers = UI_LEVELS.map((name, i) => layer(`ui · ${name}`, i === 0 ? 0.011 : 0.009));
  let primary = -1;
  const toLocal = (x, y) => new THREE.Vector2(fx((x - 210) * PT), (456 - y) * PT);
  // ids by level, so each layer of the interface is one run of ids
  for (const el of [...UI].sort((a, b) => a.level - b.level)) {
    const L = uiLayers[el.level], eid = next();
    const [x0, y0, x1, y1, r] = el.g, a = toLocal(x0, y1), b = toLocal(x1, y0);
    // flat: an interface has no thickness, so each element is a plane
    const g = new THREE.ShapeGeometry(rrect(Math.min(a.x, b.x), a.y, Math.max(a.x, b.x), b.y, r * PT), r > 30 ? 16 : 10);
    const m = new THREE.Mesh(g, pass.material(eid, { fill: !!el.fill }));
    m.userData = { id: eid, name: el.name };
    own(L, m);
    if (el.primary) primary = eid;
  }
  uiLayers.forEach(L => (L.ui = true));
  for (const L of layers) {
    const ids = L.meshes.map(m => m.userData.id);
    L.lo = Math.min(...ids); L.hi = Math.max(...ids);
  }

  // cumulative exploded position of each layer, measured toward the front, centred
  let p = 0;
  for (const L of layers) { p += L.gap; L.p = p; }
  const mid = p / 2;
  for (const L of layers) L.p -= mid;

  return { air, layers, primary, lastId: id - 1 };
}

// Where each layer stands: o in 0..1 (0 assembled, 1 apart, at its share of the even
// gap), f its share of the focus (−½ behind the chosen layer, +½ in front), k the gap
// scale. The focus opens a wide gap just in front of the chosen layer, so its face shows.
export const FOCUS = 0.04;   // m
export function offsetOf(L, o, f, k) { return (L.p * o + FOCUS * f) * k; }
export function pose(layers, o, f, k) {
  let uiZ = SCREEN_Z;
  layers.forEach((L, i) => {
    const off = FRONT * offsetOf(L, o[i], f[i], k);
    if (L.ui) { uiZ -= UI_STEP; L.group.position.z = uiZ + off; }
    else L.group.position.z = off;
  });
}

export const SCREEN_FRONT_Z = SCREEN_Z;
