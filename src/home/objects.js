import { prism3, flat, at } from '../lib/iso.js';
import { buildParts, LAYERS, SCREEN_FRONT, H as PH, W as PW } from '../phone/scene.js';
import { carcass, drawer, DRAWERS, MAX, W as CW, D as CD, HT as CH } from '../cabinet/scene.js';
import { atlas, restHeights, EXT, M as AM, PB } from '../atlas/scene.js';

/* The three objects drawn in SVG, each at rest and without its turntable, as a list of
   [class, d, name, opacity?] in paint order, from any P and T (perspective or not).
   Each also says how big it is in its own millimetres: r, its reach from its axis; z0
   and z1, its foot and its top; focus, the height a close look aims at.               */

/* ---- the phone, assembled ---- */
const parts = buildParts();
parts.forEach((p, n) => {
  p.n = n;
  const us = p.ring.map(q => q.u), vs = p.ring.map(q => q.v);
  p.cu = (Math.min(...us) + Math.max(...us)) / 2; p.cv = (Math.min(...vs) + Math.max(...vs)) / 2;
  p.cls = p.plane ? (p.mark ? (p.name === 'mic' ? 'dot' : 'mk') : p.fill ? 'fill' : 'sil ui') : 'sil';
});
const layerY = i => (LAYERS[i].ui ? SCREEN_FRONT + 0.02 * (i - 2) : 0);
const shift = (fr, dy) => ({ ...fr, o: [fr.o[0], fr.o[1] + dy, fr.o[2]] });
function phone(P, T) {
  const key = (x, y) => T[0] * x + T[1] * y;
  const groups = LAYERS.map((L, i) => ({ i, depth: key(0, layerY(i) + (L.ui ? 0 : L.y)), parts: [] }))
    .filter(G => G.i !== 1);                     // the components stay hidden inside the closed phone
  for (const G of groups) {
    for (const p of parts.filter(p => p.layer === G.i)) {
      const c = at(p.frame, p.cu, p.cv, (p.w0 + p.w1) / 2), w = p.frame.W;
      G.parts.push({ p, depth: (T[0] * w[0] + T[1] * w[1]) * (c[0] * w[0] + c[1] * w[1]) });
    }
    G.parts.sort((a, b) => a.depth - b.depth);
  }
  groups.sort((a, b) => a.depth - b.depth);
  const out = [];
  for (const G of groups) for (const { p } of G.parts) {
    const fr = shift(p.frame, layerY(G.i));
    if (p.plane) out.push([p.cls, flat(P, fr, p.ring, p.w0), `p${p.n}`]);
    else { const d = prism3(P, T, fr, p.ring, p.inner, p.w0, p.w1); out.push(['sil', d.sil, `p${p.n}`], ['cr', d.crease, `p${p.n}-cr`]); }
  }
  return out;
}

/* ---- the token cabinet, its drawers at their resting pulls ---- */
function cabinet(P, T) {
  const frontSeen = T[1] > 0;
  const body = carcass(P, T, frontSeen).map(([name, cls, d], i) => [cls, d, `c-${name}-${i}`]);
  const drawers = DRAWERS.flatMap((d, k) => drawer(P, T, d, d.rest * MAX, frontSeen).map((p, i) => [p.cls, p.d, `d${k}-${p.role}-${i}`]));
  return frontSeen ? body.concat(drawers) : drawers.concat(body);
}

/* ---- the spring atlas, standing still ---- */
const REST = restHeights();
const spring = (P, T) => atlas(P, T, REST, -1);

export const SVG_OBJECTS = {
  product: { draw: phone, r: Math.hypot(PW / 2, 4), z0: 0, z1: PH, focus: PH / 2 },
  system: { draw: cabinet, r: Math.hypot(CW / 2, CD / 2 + MAX * 0.6 + 4), z0: 0, z1: CH, focus: CH / 2 },
  motion: { draw: spring, r: Math.hypot(EXT / 2 + AM, EXT / 2 + AM), z0: 0, z1: PB + 18, focus: PB + 8 },
};
