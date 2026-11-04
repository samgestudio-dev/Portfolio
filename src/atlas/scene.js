import { rings, rrect, circ, prism3, poly, open, hull } from '../lib/iso.js';

/* The spring atlas, on Hairline's Terrain: a field of 9 × 9 rounded pillars on a plinth,
   each pillar one spring. Across, its stiffness k, from soft to stiff; back, its damping
   c, from little to much. At rest each pillar stands as tall as its spring takes to
   settle, so the field is a map of it: high where a spring rings on (soft, underdamped)
   and where it creeps in (stiff damping, overdamped), low along the valley between,
   where a spring is damped just enough. A dot on a lid down each column, and a dashed line
   on the bed, trace that valley's floor, critical damping (ζ = 1). Graduated marks round the rim say which way k and c
   grow. Plucked, every pillar answers by its own two numbers.
   Millimetres; x across the field (k), y back (c), z up.                             */

export const N = 9, CELL = 8.6, FOOT = 7.2, M = 6, EXT = N * CELL;
export const PB = 6;                                   // the plinth's height: it stands on the platter, clear of the studs
const BED = 1.2, ZB = PB - BED;                        // how far the bed is sunk under the rim; the bed's level
export const KS = [40, 60, 80, 100, 140, 180, 240, 320, 400];
export const CS = [2, 4, 6, 9, 12, 18, 24, 32, 40];
const X0 = -EXT / 2, Y0 = -EXT / 2;

// how long a spring takes to settle within 2%: by the rate its slowest part dies away,
// ζω while it rings (ζ < 1), ω(ζ − √(ζ² − 1)) once it only creeps (ζ ≥ 1)
export function settle(k, c) {
  const w = Math.sqrt(k), z = c / (2 * w);
  const rate = z < 1 ? z * w : w * (z - Math.sqrt(z * z - 1));
  return Math.log(50) / rate;
}
export const CELLS = [];
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const k = KS[i], c = CS[j], zeta = c / (2 * Math.sqrt(k)), s = settle(k, c);
  CELLS.push({ i, j, k, c, zeta, settle: s, cx: X0 + (i + 0.5) * CELL, cy: Y0 + (j + 0.5) * CELL });
}
const SMIN = Math.min(...CELLS.map(c => c.settle)), SMAX = Math.max(...CELLS.map(c => c.settle));
// a pillar's height at rest: its settling time, on a log scale (as a time scale is read)
CELLS.forEach(c => (c.h0 = 2.4 + 15 * Math.log(c.settle / SMIN) / Math.log(SMAX / SMIN)));
// along each column, the spring nearest critical damping: the valley's floor, dotted on its lid
const FLOOR = new Set();
for (let i = 0; i < N; i++) {
  let best = -1, d = Infinity;
  CELLS.forEach((c, n) => { if (c.i === i && Math.abs(Math.log(c.zeta)) < d) { d = Math.abs(Math.log(c.zeta)); best = n; } });
  FLOOR.add(best);
}
export const AMP = 8;                                  // how far a pluck lifts a pillar, mm
export const CAP = 1.2;                                // the ceiling stacked kicks bend into, in plucks

// a value's place along a scale of values (fractional index), for the critical line
const along = (vals, v) => {
  if (v <= vals[0]) return (v - vals[0]) / (vals[1] - vals[0]);
  for (let n = 0; n < vals.length - 1; n++) if (v <= vals[n + 1]) return n + (v - vals[n]) / (vals[n + 1] - vals[n]);
  return vals.length - 1 + (v - vals.at(-1)) / (vals.at(-1) - vals.at(-2));
};

const ZF = o => ({ o, U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] });
const O = [0, 0, 0];

/* Everything with the pillars at heights hs, as [class, d, name] in paint order. hot: −1 or a cell. */
export function atlas(P, T, hs, hot) {
  const out = [];
  // the plinth, its rim, and the bed sunk inside it
  const half = EXT / 2 + M;
  const [pr, pi] = rings(-half, -half, half, half, 10, 2.2, 6);
  const pl = prism3(P, T, ZF(O), pr, pi, 0, PB);
  out.push(['sil', pl.sil, 'plinth'], ['cr', pl.crease, 'plinth-cr']);
  const bed = rrect(-EXT / 2 - 2, -EXT / 2 - 2, EXT / 2 + 2, EXT / 2 + 2, 4.5, 6);
  out.push(['bed', poly(bed.map(q => P(q.u, q.v, ZB))), 'bed']);
  out.push(['cr', poly(bed.map(q => P(q.u, q.v, PB))), 'rim']);
  // graduated marks round the rim: dots that grow with k along the two edges across, ticks
  // that lengthen with c along the two edges back
  const rim = EXT / 2 + M / 2 + 0.5;
  let dots = '', ticks = '';
  for (let n = 0; n < N; n++) {
    const x = X0 + (n + 0.5) * CELL, r = 0.35 + n * 0.12;
    for (const sy of [-1, 1]) dots += poly(circ(x, sy * rim, r, 12).map(q => P(q.u, q.v, PB)));
    const y = Y0 + (n + 0.5) * CELL, L = 0.8 + n * 0.32;
    for (const sx of [-1, 1]) ticks += `M${P(sx * (rim - L / 2), y, PB).join(' ')}L${P(sx * (rim + L / 2), y, PB).join(' ')}`;
  }
  out.push(['dot', dots, 'k-marks'], ['mk', ticks, 'c-marks']);
  // critical damping, c = 2√k, traced on the bed: the floor of the valley
  const line = [];
  for (let n = 0; n <= 60; n++) {
    const k = KS[0] + (KS.at(-1) - KS[0]) * (n / 60), c = 2 * Math.sqrt(k);
    const fi = along(KS, k), fj = along(CS, c);
    if (fj < -0.5 || fj > N - 0.5) continue;
    line.push(P(X0 + (fi + 0.5) * CELL, Y0 + (fj + 0.5) * CELL, ZB));
  }
  out.push(['guide', open(line), 'critical']);

  // the pillars, far to near; the chosen one carries a 3 × 3 mark of dots on its lid
  const order = CELLS.map((c, n) => ({ c, n, key: T[0] * c.cx + T[1] * c.cy })).sort((a, b) => a.key - b.key);
  for (const { c, n } of order) {
    const h = Math.max(0.8, hs[n]), x0 = c.cx - FOOT / 2, y0 = c.cy - FOOT / 2;
    const [ring, inner] = rings(x0, y0, x0 + FOOT, y0 + FOOT, 2.2, 0.8, 4);
    const p = prism3(P, T, ZF(O), ring, inner, ZB, PB + h);
    out.push([n === hot ? 'sil hi' : 'sil', p.sil, `p${n}`], ['cr', p.crease, `p${n}-cr`]);
    if (FLOOR.has(n) && n !== hot) out.push(['dot', poly(circ(c.cx, c.cy, 0.6, 12).map(q => P(q.u, q.v, PB + h))), `p${n}-floor`]);
    if (n === hot) {
      let m = '';
      for (let a = 0; a < 9; a++) m += poly(circ(c.cx + ((a % 3) - 1) * 1.7, c.cy + (Math.floor(a / 3) - 1) * 1.7, a === 4 ? 0.6 : 0.42, 10).map(q => P(q.u, q.v, PB + h)));
      out.push(['dot hi-dot', m, `p${n}-mark`]);
    }
  }
  return out;
}

// a pillar's outline on screen at rest, for picking (rule 01): the hull of its foot and its lid
export function restHull(P, n) {
  const c = CELLS[n], f = FOOT / 2, pts = [];
  for (const z of [ZB, PB + c.h0]) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(P(c.cx + sx * f, c.cy + sy * f, z));
  return hull(pts);
}
export const PITCH = CELL;
export const EXTENT = { r: Math.hypot(EXT / 2 + M, EXT / 2 + M), top: PB + 18 + AMP * CAP + 2 };
export const restHeights = () => CELLS.map(c => c.h0);
