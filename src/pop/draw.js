import { prism3, flat, at, seg, inside } from '../lib/iso.js';
import { buildParts, LAYERS, SCREEN_FRONT, H as PH, W as PW, R as PR } from '../phone/scene.js';
import { carcass, drawer, frontAt, DRAWERS, MAX, W as CW, D as CD, H as CH, FT } from '../cabinet/scene.js';
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
// where each layer stands: o[i] how far apart (0…1), e[i] mm more it is lifted (the gap the
// pointer opens over the layer it is on); a layer never falls behind the one under it
function layerYs(o, e) {
  const off = LAYERS.map((L, i) => L.p * o[i] * PHONE_GAP + (e?.[i] || 0));
  for (let i = 1; i < off.length; i++) off[i] = Math.max(off[i], off[i - 1]);
  return LAYERS.map((L, i) => off[i] + layerY(i));
}
// each layer's middle in the model, at rest (its parts' middles, averaged)
const LAYER_MID = LAYERS.map((L, i) => {
  const cs = parts.filter(p => p.layer === i).map(p => at(p.frame, p.cu, p.cv, (p.w0 + p.w1) / 2));
  return [0, 1, 2].map(k => cs.reduce((a, c) => a + c[k], 0) / (cs.length || 1));
});
// the layers' middles on the drawing where they stand now: for picking the one under the pointer
export const phoneMids = (P, o, e) => layerYs(o, e).map((y, i) => P(LAYER_MID[i][0], LAYER_MID[i][1] + y, LAYER_MID[i][2]));
export function phone(P, T, o, e, hot = -1) {
  const key = (x, y) => T[0] * x + T[1] * y;
  const ys = layerYs(o, e);
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
      const h = G.i === hot ? ' hot' : '';
      if (p.plane) out.push([p.cls + h, flat(P, fr, p.ring, p.w0), `p${p.n}`]);
      else { const d = prism3(P, T, fr, p.ring, p.inner, p.w0, p.w1); out.push(['sil' + h, d.sil, `p${p.n}`], ['cr', d.crease, `p${p.n}-cr`]); }
    }
  }
  return out;
}
const PHONE_REACH = Math.hypot(PW / 2, (LAYERS.at(-1).p + 4) * PHONE_GAP) + 2;

/* ---- the token cabinet: outs[k] mm, how far each drawer is out ---- */
export function cabinet(P, T, outs, hot = -1) {
  const frontSeen = T[1] > 0;
  const body = carcass(P, T, frontSeen).map(([name, cls, d], i) => [cls, d, `c-${name}-${i}`]);
  // the drawer the pointer is on: its front drawn in the heavier ink
  const drawers = DRAWERS.flatMap((d, k) => drawer(P, T, d, outs[k], frontSeen).map((p, i) => [p.cls + (k === hot && (p.role === 'front' || p.role === 'pull') ? ' hot' : ''), p.d, `d${k}-${p.role}-${i}`]));
  return frontSeen ? body.concat(drawers) : drawers.concat(body);
}
export const CABINET_REST = DRAWERS.map(d => d.rest * MAX);
export const CABINET_OUT = [0.75, 0.45, 1, 0.6].map(s => s * MAX);   // hovered: all four out, unevenly
export const CABINET_MAX = MAX;
// the drawer whose front holds the point, front-most first (rule 01: tested where each stands)
export function drawerAt(P, T, outs, pt) {
  const order = DRAWERS.map((d, k) => k);
  for (const k of order) if (inside(pt, frontAt(P, DRAWERS[k], outs[k]))) return k;
  return -1;
}

/* ---- the spring atlas: heights from the summed answers of its springs ---- */
export const ATLAS_REST = restHeights();
export { atlas, restHull, CELLS };

export const REACH = {
  product: { r: PHONE_REACH, z0: 0, z1: PH + 2 },
  system: { r: Math.hypot(CW / 2, CD / 2 + MAX + FT + 3.6) + 2, z0: 0, z1: CH + 4 },
  motion: { r: AEXT.r, z0: 0, z1: AEXT.top },
};
