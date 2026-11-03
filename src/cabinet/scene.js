import { rings, rrect, prism3, flat } from '../lib/iso.js';

/* The token cabinet, as Hairline draws a cabinet (its Drawer figure): a plinth set back
   under a carcass, and drawers each built from a floor, two walls, its outline, a front
   with a card holder and a bar pull. Only the part of a drawer that is out of the carcass
   is drawn; what it holds is cut at the carcass's face.

   Millimetres; x across, y through the cabinet with the fronts facing +y, z up. Four
   drawers, bottom to top, each holding index cards, one card a token, and each kind of
   token told by its cards' shape (rule 10):
     radius  cards whose top corners round from square to a half circle
     space   cards set apart by the spacing scale: the gaps are the tokens
     type    cards that step up in height, a type scale
     color   cards with index tabs stepping across, a swatch deck
   Cards stand up because the camera looks down at 30°: a drawer's front hides its floor
   for some 40 mm behind it, and only what stands up shows over it.                  */

export const W = 84, D = 56, Z0 = 6, M = 3, PITCH = 28, G = 1.6, FT = 3;
const TW = 1.3, IN = 3.2, LOW = 2.2, HIGH = 3.6;   // a wall's thickness; the box's inset and its gaps under and over
export const ZB = Z0 + M, H = ZB + 4 * PITCH + M;
export const MAX = 36;                       // mm a drawer comes out when chosen, at the slider's middle
const X0 = -W / 2 + M + IN, X1 = W / 2 - M - IN;
const YC = D / 2;                            // the carcass's face

export const DRAWERS = [
  { name: 'radius', rest: 0.35 },
  { name: 'space', rest: 0 },
  { name: 'type', rest: 0.6 },
  { name: 'color', rest: 0 },
].map((d, k) => {
  const z0 = ZB + k * PITCH + G / 2;
  return { ...d, k, z0, z1: z0 + PITCH - G };
});

const ZF = o => ({ o, U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] });    // a ring on the ground, along z
const YF = o => ({ o, U: [1, 0, 0], V: [0, 0, 1], W: [0, 1, 0] });    // a ring standing in x–z, along y
const O = [0, 0, 0];

/* What each drawer holds: cards, by how far back from the inside of the front they
   stand (d), how tall (top, under the drawer's rim), their top corners' round, and a tab. */
const CARD = 0.8;
const HOLD = {
  radius: [0, 2, 4, 7, 11].map((r, i) => ({ d: 3 + i * 4.5, top: 0, r })),
  space: [0, 2, 6, 12, 20, 32].map(d => ({ d: 3 + d, top: 0, r: 1 })),
  type: [-8, -6.2, -4.4, -2.6, -0.8, 1].map((t, i) => ({ d: 3 + i * 4.2, top: t, r: 1 })),
  color: Array.from({ length: 7 }, (_, i) => ({ d: 3 + i * 4.2, top: -1.5, r: 1, tab: i })),
};
export const COUNT = Object.fromEntries(Object.entries(HOLD).map(([k, v]) => [k, v.length]));

/* The carcass: plinth, body, and the openings on its face (seen above a drawer that is out). */
export function carcass(P, T, frontSeen) {
  const out = [];
  const [pr, pi] = rings(-W / 2 + 3, -D / 2 + 3, W / 2 - 3, D / 2 - 3, 2.4, 1);
  const pl = prism3(P, T, ZF(O), pr, pi, 0, Z0);
  const [cr, ci] = rings(-W / 2, -D / 2, W / 2, D / 2, 3, 1.4);
  const bo = prism3(P, T, ZF(O), cr, ci, Z0, H);
  out.push(['plinth', 'sil', pl.sil], ['plinth', 'cr', pl.crease], ['body', 'sil', bo.sil], ['body', 'cr', bo.crease]);
  if (frontSeen) for (const d of DRAWERS)
    out.push(['opening', 'cr', flat(P, YF(O), rrect(X0 - 0.8, d.z0 + LOW - 0.8, X1 + 0.8, d.z1 - HIGH + 1.4, 0.8, 2), YC)]);
  return out;
}

/* One drawer pulled out by o mm: its paths, in paint order for the side the viewer sees.
   Each entry: [role, class, d]. role 'front' carries the drawer's bright edge. */
export function drawer(P, T, d, o, frontSeen) {
  const zb = d.z0 + LOW, zt = d.z1 - HIGH, yb = YC + o, yf = yb + FT;
  const parts = [];
  const box = (a, c, z0, z1, r, cls, role = 'box') => {
    if (yb - YC < 0.3) return;
    const ring = rrect(a, YC, c, yb, r, 3);
    parts.push({ role, cls, d: prism3(P, T, ZF(O), ring, null, z0, z1).sil, depth: T[0] * (a + c) / 2 + T[1] * (YC + yb) / 2 });
  };
  const floor = () => box(X0, X1, zb, zb + TW, 0.6, 'lo');
  const walls = [[X0, X0 + TW], [X1 - TW, X1]].map(([a, c]) => ({ a, c, k: T[0] * (a + c) / 2 }));
  walls.sort((p, q) => p.k - q.k);

  // what it holds: cards standing across the drawer, those still inside the carcass not drawn
  const held = [];
  const cw = X1 - X0 - 4, tw = cw / 5;
  for (const it of HOLD[d.name]) {
    const y = yb - it.d;
    if (y - CARD < YC) continue;
    const top = zt - 2 + it.top, fr = YF([0, y - CARD, 0]), paths = [];
    if (it.tab !== undefined) {
      const tx = X0 + 2 + (it.tab % 4) * (cw - tw) / 3;
      paths.push(['sil', prism3(P, T, fr, rrect(tx, top - 2, tx + tw, top + 4, 1.2, 3), null, 0, CARD).sil]);
    }
    paths.push(['sil', prism3(P, T, fr, rrect(X0 + 2, zb + TW, X1 - 2, top, it.r, it.r > 4 ? 8 : 3), null, 0, CARD).sil]);
    held.push({ depth: T[1] * y, paths });
  }
  held.sort((p, q) => p.depth - q.depth);

  floor();
  box(walls[0].a, walls[0].c, zb + TW, zt, 0.5, 'lo');
  for (const h of held) for (const [cls, dd] of h.paths) parts.push({ role: 'held', cls, d: dd });
  box(walls[1].a, walls[1].c, zb + TW, zt, 0.5, 'lo');
  box(X0, X1, zb, zt, 0.8, 'sil nf', 'outline');

  // the front, its card holder and its pull
  const face = rrect(-W / 2 + M, d.z0, W / 2 - M, d.z1, 1.6, 4), faceIn = rrect(-W / 2 + M + 1, d.z0 + 1, W / 2 - M - 1, d.z1 - 1, 1, 4);
  const fr = prism3(P, T, YF(O), face, faceIn, yb, yf);
  parts.push({ role: 'front', cls: 'sil', d: fr.sil }, { role: 'front-cr', cls: 'cr', d: fr.crease });
  const zp = (d.z0 + d.z1) / 2 - 3;
  if (frontSeen) parts.push({ role: 'holder', cls: 'mk', d: flat(P, YF(O), rrect(-9, zp + 4.5, 9, zp + 10, 1, 2), yf) });
  const [br, bi] = rings(-10, zp - 1.3, 10, zp + 1.3, 1.3, 0.6);
  const pu = prism3(P, T, YF(O), br, bi, yf, yf + 2.6);
  parts.push({ role: 'pull', cls: 'sil', d: pu.sil }, { role: 'pull-cr', cls: 'cr', d: pu.crease });

  return frontSeen ? parts : parts.reverse();
}

// the front of drawer d where it stands when out by o: for picking (rule 01)
export const frontAt = (P, d, o) => rrect(-W / 2 + M, d.z0, W / 2 - M, d.z1, 1.6, 2).map(q => P(q.u, YC + o + FT, q.v));
