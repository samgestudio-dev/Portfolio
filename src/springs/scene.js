import { rings, circ, prism3, open } from '../lib/iso.js';

/* The spring rack: a plank, two posts and a beam, four coil springs hanging from it and
   a weight on each. Each spring is a pair of numbers, its stiffness k and its damping c
   (mass 1), and shows them as a spring would: a stiffer one has fewer, tighter coils and
   stretches less under its weight, so at rest the four hang at different heights. Pull
   one down and let go, and it answers as those numbers say.
   Millimetres; x along the beam, y across the plank, z up.                           */

export const SPRINGS = [
  { k: 60, c: 4, coils: 11, r: 5.2 },      // soft, and lively
  { k: 100, c: 18, coils: 8, r: 4.4 },     // Hairline's own spring
  { k: 300, c: 24, coils: 5, r: 3.4 },     // stiff, and quick
  { k: 40, c: 14, coils: 13, r: 5.8 },     // soft, and slow
].map((s, i) => ({ ...s, x: -42 + i * 28, zeta: s.c / (2 * Math.sqrt(s.k)), sag: 900 / s.k }));
export const L0 = 24, BEAM = 114, WR = 8, WH = 14;   // a spring's own length; the beam's underside; a weight's radius and height
const POST = 58, BASE = [64, 18, 8], TOP = BEAM + 8;

// how long a spring takes to come to rest (within 2% of a pull, and staying there)
export function settle(k, c) {
  let x = 1, v = 0, t = 0, last = 0;
  const h = 1 / 1000;
  for (; t < 6; t += h) { v += (-k * x - c * v) * h; x += v * h; if (Math.abs(x) > 0.02) last = t; }
  return last;
}
SPRINGS.forEach(s => (s.settle = settle(s.k, s.c)));

const ZF = o => ({ o, U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] });
const XF = o => ({ o, U: [0, 1, 0], V: [0, 0, 1], W: [1, 0, 0] });
const O = [0, 0, 0];

// where a spring's weight hangs (its top), pulled down by y mm
export const weightTop = (s, y) => BEAM - Math.max(6, L0 + s.sag + y);

/* Everything with the springs pulled by ys, as [class, d] in paint order. hot: −1 or a spring. */
export function rack(P, T, ys, hot) {
  const out = [];
  const push = (p, cls = 'sil') => { out.push([cls, p.sil]); if (p.crease) out.push(['cr', p.crease]); };
  const [br, bi] = rings(-BASE[0], -BASE[1], BASE[0], BASE[1], 4, 1.2, 6);
  push(prism3(P, T, ZF(O), br, bi, 0, BASE[2]));

  const key = x => T[0] * x;
  const posts = [-1, 1].map(sx => {
    const [pr, pi] = rings(sx * POST - 3, -3, sx * POST + 3, 3, 1.6, 0.6);
    const post = prism3(P, T, ZF(O), pr, pi, BASE[2], TOP);
    const [cr, ci] = rings(sx * POST - 4.2, -4.2, sx * POST + 4.2, 4.2, 4.2, 0.8, 6);
    const cap = prism3(P, T, ZF(O), cr, ci, TOP, TOP + 3.2);
    return { k: key(sx * POST), paths: [['sil', post.sil], ['cr', post.crease], ['sil', cap.sil], ['cr', cap.crease]] };
  }).sort((a, b) => a.k - b.k);
  out.push(...posts[0].paths);

  // the springs and their weights, far to near along the beam
  const hung = SPRINGS.map((s, i) => {
    const paths = [];
    const zt = BEAM, zb = weightTop(s, ys[i]) + 3.5, n = s.coils, steps = n * 20;
    // the coil: a helix from the beam to the weight's hook, its far half dim and its near half bright
    let back = [], front = [], cur = null, isFront = null;
    const flush = () => { if (cur && cur.length > 1) (isFront ? front : back).push(open(cur)); };
    for (let j = 0; j <= steps; j++) {
      const u = j / steps, a = Math.PI * 2 * n * u, z = zt - 2 - u * (zt - 2 - zb);
      const cx = Math.cos(a), cy = Math.sin(a), f = T[0] * cx + T[1] * cy >= 0;
      const p = P(s.x + s.r * cx, s.r * cy, z);
      if (f !== isFront) { if (cur) cur.push(p); flush(); cur = [p]; isFront = f; } else cur.push(p);
    }
    flush();
    // the leads: straight up to the beam, straight down to the hook
    const top = P(s.x + s.r, 0, zt - 2), bot = P(s.x + s.r * Math.cos(Math.PI * 2 * n), s.r * Math.sin(Math.PI * 2 * n), zb);
    paths.push(['coil-b', back.join('')]);
    // the weight: a cylinder with a crease, and the eye its spring hooks into
    const wz = weightTop(s, ys[i]);
    const [wr, wi] = [circ(s.x, 0, WR, 40), circ(s.x, 0, WR - 1.1, 40)];
    const w = prism3(P, T, ZF(O), wr, wi, wz - WH, wz);
    const [er, ei] = [circ(s.x, 0, 1.6, 14), circ(s.x, 0, 1.0, 14)];
    const eye = prism3(P, T, ZF(O), er, ei, wz, wz + 3.5);
    paths.push([i === hot ? 'sil hi' : 'sil', w.sil], ['cr', w.crease], ['sil', eye.sil], ['cr', eye.crease]);
    paths.push(['coil-f', front.join('') + `M${top[0]} ${top[1]}L${P(s.x + s.r, 0, zt)[0]} ${P(s.x + s.r, 0, zt)[1]}` + `M${bot[0]} ${bot[1]}L${P(s.x, 0, wz + 3.5)[0]} ${P(s.x, 0, wz + 3.5)[1]}`]);
    return { k: key(s.x), paths };
  }).sort((a, b) => a.k - b.k);
  for (const h of hung) out.push(...h.paths);

  // the beam over them, post face to post face, and the near post
  const [rr, ri] = rings(-3, BEAM, 3, BEAM + 6, 1.6, 0.6);
  push(prism3(P, T, XF(O), rr, ri, -POST + 3, POST - 3));
  out.push(...posts[1].paths);
  return out;
}

// for picking: each spring's hanging line at rest, on screen
export const restLine = (P, s) => [P(s.x, 0, BEAM), P(s.x, 0, weightTop(s, 0) - WH)];
export const EXTENT = { r: Math.hypot(BASE[0], BASE[1]), top: TOP + 3.2 };
