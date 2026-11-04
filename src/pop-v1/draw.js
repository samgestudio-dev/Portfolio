import { prism3, flat, at, seg } from '../lib/iso.js';
import { buildParts, LAYERS, SCREEN_FRONT, H as PH, W as PW, R as PR } from '../phone/scene.js';
import { carcass, drawer, DRAWERS, MAX, W as CW, D as CD, H as CH, FT } from '../cabinet/scene.js';
import { atlas, restHeights, restHull, CELLS, EXTENT as AEXT } from '../atlas/scene.js';

/* The three SVG objects for the pop page, each able to move the way its own page does,
   as lists of [class, d, name, opacity?] in paint order (for fillKeyed). Each also gives
   its reach, the cylinder anything it draws stays inside at any turn (rule 03).        */

/* ---- the phone: five layers along one axis, o[i] ∈ 0…1 how far apart ---- */
const parts = buildParts();
parts.forEach((p, n) => {
  p.n = n;
  const us = p.ring.map(q => q.u), vs = p.ring.map(q => q.v);
  p.cu = (Math.min(...us) + Math.max(...us)) / 2; p.cv = (Math.min(...vs) + Math.max(...vs)) / 2;
  p.cls = p.plane ? (p.mark ? (p.name === 'mic' ? 'dot' : 'mk') : p.fill ? 'fill' : 'sil ui') : 'sil';
});
const layerY = i => (LAYERS[i].ui ? SCREEN_FRONT + 0.02 * (i - 2) : 0);
const shift = (fr, dy) => ({ ...fr, o: [fr.o[0], fr.o[1] + dy, fr.o[2]] });
const corner = PR - PR * Math.SQRT1_2 + 1.2;
const CORNERS = [[-PW / 2 + corner, corner], [PW / 2 - corner, corner], [-PW / 2 + corner, PH - corner], [PW / 2 - corner, PH - corner]];
export const PHONE_GAP = 1.15;
export function phone(P, T, o) {
  const key = (x, y) => T[0] * x + T[1] * y;
  // where each layer stands; a layer never falls behind the one under it (no passing through)
  const off = LAYERS.map((L, i) => L.p * o[i] * PHONE_GAP);
  for (let i = 1; i < off.length; i++) off[i] = Math.max(off[i], off[i - 1]);
  const ys = LAYERS.map((L, i) => off[i] + layerY(i));
  const apart = o.reduce((a, v) => a + v, 0) / o.length;
  const groups = LAYERS.map((L, i) => ({ i, depth: key(0, ys[i] + (L.ui ? 0 : L.y)), parts: [] }))
    .filter(G => !(G.i === 1 && o[1] < 0.04));            // the components hide inside the closed phone
  for (const G of groups) {
    for (const p of parts.filter(p => p.layer === G.i)) {
      const c = at(p.frame, p.cu, p.cv, (p.w0 + p.w1) / 2), w = p.frame.W;
      G.parts.push({ p, depth: (T[0] * w[0] + T[1] * w[1]) * (c[0] * w[0] + c[1] * w[1]) });
    }
    G.parts.sort((a, b) => a.depth - b.depth);
  }
  groups.sort((a, b) => a.depth - b.depth);
  const out = [];
  let prevY = null;
  for (const G of groups) {
    // dotted drops at the four corners from the layer behind: the axis they part along
    if (prevY !== null) out.push(['guide', apart > 0.05 ? CORNERS.map(([x, z]) => seg(P(x, prevY, z), P(x, ys[G.i], z))).join('') : '', `g${G.i}`, Math.min(1, Math.max(0, (apart - 0.05) / 0.4))]);
    prevY = ys[G.i];
    for (const { p } of G.parts) {
      const fr = shift(p.frame, ys[G.i]);
      if (p.plane) out.push([p.cls, flat(P, fr, p.ring, p.w0), `p${p.n}`]);
      else { const d = prism3(P, T, fr, p.ring, p.inner, p.w0, p.w1); out.push(['sil', d.sil, `p${p.n}`], ['cr', d.crease, `p${p.n}-cr`]); }
    }
  }
  return out;
}
const PHONE_REACH = Math.hypot(PW / 2, (LAYERS.at(-1).p + 4) * PHONE_GAP) + 2;

/* ---- the token cabinet: outs[k] mm, how far each drawer is out ---- */
export function cabinet(P, T, outs) {
  const frontSeen = T[1] > 0;
  const body = carcass(P, T, frontSeen).map(([name, cls, d], i) => [cls, d, `c-${name}-${i}`]);
  const drawers = DRAWERS.flatMap((d, k) => drawer(P, T, d, outs[k], frontSeen).map((p, i) => [p.cls, p.d, `d${k}-${p.role}-${i}`]));
  return frontSeen ? body.concat(drawers) : drawers.concat(body);
}
export const CABINET_REST = DRAWERS.map(d => d.rest * MAX);
export const CABINET_OUT = [0.75, 0.45, 1, 0.6].map(s => s * MAX);   // hovered: all four out, unevenly

/* ---- the spring atlas: heights from the summed answers of its springs ---- */
export const ATLAS_REST = restHeights();
export { atlas, restHull, CELLS };

export const REACH = {
  product: { r: PHONE_REACH, z0: 0, z1: PH + 2 },
  system: { r: Math.hypot(CW / 2, CD / 2 + MAX + FT + 3.6) + 2, z0: 0, z1: CH + 4 },
  motion: { r: AEXT.r, z0: 0, z1: AEXT.top },
};
