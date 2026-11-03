import { rings, circ, prism3, seg } from '../lib/iso.js';

/* The spacing chart, as an object: an animator's chart of in-betweens made into an abacus.
   A plank with a ruler of even time along its front edge, two posts, four rods across.
   On each rod eleven thin beads sit where one easing puts a thing at t = 0, 0.1 … 1, so
   their spacing is the curve: even for linear, gathered at both ends for ease-in-out,
   gathered at the end for Hairline's ease-out, past the end and back for a spring. A
   larger bead on each rod is now: where that easing has the thing at time t.
   Millimetres; x along the rods, y across the plank, z up.                           */

export const X0 = -46, X1 = 40;                        // where t = 0 and x = 1 sit on a rod
const POST = 58, BASE = [64, 18, 8], TOP = 104;
export const RODS_Z = [30, 48, 66, 84];

const bezier = (x1, y1, x2, y2) => {
  const b = (t, a, c) => 3 * a * t * (1 - t) ** 2 + 3 * c * t * t * (1 - t) + t ** 3;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1; for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (b(m, x1, x2) < x) lo = m; else hi = m; } return b((lo + hi) / 2, y1, y2); };
};
// a spring of k 170 · c 14 · m 1 over a second: it passes the end by about an eighth and comes back
const spring = (() => {
  const k = 170, c = 14, w = Math.sqrt(k), z = c / (2 * w), wd = w * Math.sqrt(1 - z * z);
  return t => (t <= 0 ? 0 : 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t)));
})();

export const EASES = [
  { name: 'linear', f: t => t, note: 'linear' },
  { name: 'ease-in-out', f: bezier(0.42, 0, 0.58, 1), note: '(.42, 0, .58, 1)' },
  { name: 'hairline', f: bezier(0.32, 0.72, 0, 1), note: '(.32, .72, 0, 1)' },
  { name: 'spring', f: spring, note: 'k 170 · c 14' },
];
export const xAt = (e, t) => X0 + EASES[e].f(t) * (X1 - X0);

const ZF = o => ({ o, U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] });     // ring on the ground, along z
const XF = o => ({ o, U: [0, 1, 0], V: [0, 0, 1], W: [1, 0, 0] });     // ring in y–z, along x
const O = [0, 0, 0];

/* Everything at the current t, as [class, d] in paint order. hot: the chosen rod or −1. */
export function chart(P, T, t, hot) {
  const out = [];
  const push = (p, cls = 'sil') => { out.push([cls, p.sil]); if (p.crease) out.push(['cr', p.crease]); };
  // the plank, and its ruler: even steps of time, the long ones at 0, ½ and 1
  const [br, bi] = rings(-BASE[0], -BASE[1], BASE[0], BASE[1], 4, 1.2, 6);
  push(prism3(P, T, ZF(O), br, bi, 0, BASE[2]));
  const yR = T[1] >= 0 ? BASE[1] - 4 : -BASE[1] + 4;    // along the edge the viewer sees
  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const x = X0 + (i / 10) * (X1 - X0), long = i % 5 === 0 ? 3.2 : 1.8;
    ticks += seg(P(x, yR, BASE[2]), P(x, yR - Math.sign(yR) * long, BASE[2]));
  }
  ticks += seg(P(X0, yR, BASE[2]), P(X1, yR, BASE[2]));
  out.push(['mk', ticks]);

  // the parts that stand on the plank, far to near along x: posts, rods, beads
  const items = [];
  const key = x => T[0] * x;
  for (const sx of [-1, 1]) {
    const [pr, pi] = rings(sx * POST - 3, -3, sx * POST + 3, 3, 1.6, 0.6);
    const post = prism3(P, T, ZF(O), pr, pi, BASE[2], TOP);
    const [cr, ci] = rings(sx * POST - 4.2, -4.2, sx * POST + 4.2, 4.2, 4.2, 0.8, 6);
    const cap = prism3(P, T, ZF(O), cr, ci, TOP, TOP + 3.2);
    items.push({ k: key(sx * POST) + (sx * T[0] > 0 ? 1e3 : -1e3), paths: [['sil', post.sil], ['cr', post.crease], ['sil', cap.sil], ['cr', cap.crease]] });
  }
  RODS_Z.forEach((z, e) => {
    const rod = prism3(P, T, XF([0, 0, 0]), circ(0, z, 1.1, 14), null, -POST + 3, POST - 3);   // post face to post face
    items.push({ k: -999 + e * 0.01, paths: [['sil', rod.sil]] });
    // the chart: eleven thin beads at t = 0, 0.1 … 1
    for (let i = 0; i <= 10; i++) {
      const x = xAt(e, i / 10);
      const b = prism3(P, T, XF(O), circ(0, z, 2.7, 18), circ(0, z, 2.0, 18), x - 0.7, x + 0.7);
      items.push({ k: key(x), paths: [['sil', b.sil], ['cr', b.crease]] });
    }
    // now: the bead at t
    const x = xAt(e, t);
    const nb = prism3(P, T, XF(O), circ(0, z, 4.6, 24), circ(0, z, 3.6, 24), x - 2.3, x + 2.3);
    items.push({ k: key(x) + 0.5, paths: [[e === hot ? 'sil hi' : 'sil', nb.sil], ['cr', nb.crease]] });
  });
  items.sort((a, b) => a.k - b.k);
  for (const it of items) out.push(...it.paths);
  return out;
}

// for picking: each rod as a segment on screen, and where along it t = 0 and x = 1 fall
export const rodOnScreen = (P, e) => ({ a: P(X0, 0, RODS_Z[e]), b: P(X1, 0, RODS_Z[e]), l: P(-POST, 0, RODS_Z[e]), r: P(POST, 0, RODS_Z[e]) });
export const EXTENT = { r: Math.hypot(BASE[0], BASE[1]), top: TOP + 3.2 };
