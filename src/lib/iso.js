/* Hairline's drawing maths (packages/hairline/src/core/iso.ts, MIT © Lucas Marques),
   ported, and widened from prisms standing on the ground to prisms along any axis.

   World space is x/y on the ground and z up. The camera turns the ground by an azimuth,
   then squashes y by k = sin(elevation) and lifts z by cos(elevation). No perspective
   and no hidden-line removal: plates are filled with the ground colour and painted back
   to front, so a nearer one simply covers (rule 06).                                   */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rad = d => (d * Math.PI) / 180;
const r2 = n => Math.round(n * 100) / 100;

export const poly = pts => (pts.length < 2 ? '' : 'M' + pts.map(p => r2(p[0]) + ' ' + r2(p[1])).join('L') + 'Z');
export const open = pts => (pts.length < 2 ? '' : 'M' + pts.map(p => r2(p[0]) + ' ' + r2(p[1])).join('L'));
export const seg = (a, b) => `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;

/* ---- camera ---- */
export const Cam = (azDeg, k, S) => ({ az: rad(azDeg), k, S, ox: 0, oy: 0 });
export function proj(C) {
  const c = Math.cos(C.az), s = Math.sin(C.az), zf = Math.sqrt(1 - C.k * C.k);
  return (x, y, z) => {
    const X = x * c - y * s, Y = x * s + y * c;
    return [C.ox + C.S * X, C.oy + C.S * (Y * C.k - z * zf)];
  };
}
// the direction toward the viewer, in world space: what faces it is seen, nearer is larger
export function toward(C) {
  const c = Math.cos(C.az), s = Math.sin(C.az), zf = Math.sqrt(1 - C.k * C.k);
  return [s * zf, c * zf, C.k];
}

/* ---- rounded outlines: samples that carry their outward normal ---- */
export function rrect(u0, v0, u1, v1, r, n = 4) {
  r = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2));
  const out = [];
  for (const [cu, cv, a0] of [[u1 - r, v1 - r, 0], [u0 + r, v1 - r, 90], [u0 + r, v0 + r, 180], [u1 - r, v0 + r, 270]])
    for (let k = 0; k <= n; k++) {
      const a = rad(a0 + (90 * k) / n), ca = Math.cos(a), sa = Math.sin(a);
      out.push({ u: cu + r * ca, v: cv + r * sa, nu: ca, nv: sa });
    }
  return out;
}
export function circ(cu, cv, R, n = 48) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    out.push({ u: cu + R * ca, v: cv + R * sa, nu: ca, nv: sa });
  }
  return out;
}
// a rounded rect and its crease ring, inset by b; n samples a corner (more for a big round)
export const rings = (u0, v0, u1, v1, r, b, n = 4) => [rrect(u0, v0, u1, v1, r, n), rrect(u0 + b, v0 + b, u1 - b, v1 - b, Math.max(0.3, r - b), n)];

/* Convex hull (monotone chain). */
export function hull(input) {
  const pts = input.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const x = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length > 1 && x(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && x(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/* The one cyclic run of samples that pass keep, in ring order. */
export function run(ring, keep) {
  const n = ring.length;
  let s = -1;
  for (let i = 0; i < n; i++) if (keep(ring[i]) && !keep(ring[(i + n - 1) % n])) { s = i; break; }
  if (s < 0) return keep(ring[0]) ? ring.slice() : [];
  const out = [];
  for (let k = 0; k < n && keep(ring[(s + k) % n]); k++) out.push(ring[(s + k) % n]);
  return out;
}

/* ---- a prism along any axis ----
   frame: an origin o and three unit axes: U and V span the ring's plane, W is the axis.
   The silhouette is the hull of the two rings, so its corners along the axis are never
   drawn; the only inner line is the crease, the run of the inset ring on the cap that
   faces the viewer, on the side whose walls are seen.                                 */
export const at = (f, u, v, w) => [
  f.o[0] + f.U[0] * u + f.V[0] * v + f.W[0] * w,
  f.o[1] + f.U[1] * u + f.V[1] * v + f.W[1] * w,
  f.o[2] + f.U[2] * u + f.V[2] * v + f.W[2] * w,
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/* A light, for prints: while one is set, each prism also finds its walls that are seen
   but turned away from it (the run of the ring whose outward normal faces the viewer and
   not the light) and lays them in halftone: dots on a screen fixed to the picture, 45°,
   pitch apart, each as big as the wall is dark there (how far it turns from the light,
   deepening toward the wall's foot). Kept by its silhouette's path, for whoever draws it.
   L: a unit vector in the world toward the light; pitch in the picture's own units.     */
import { BLUE, BLUE_N } from './bluenoise.js';
let LIGHT = null, SHADES = null, PITCH = 4, MODE = 'am', DOT_R = 0.36;
// mode 'solid': the shadowed walls in plain ink; 'am': dots sized by tone, on a 45° screen;
// 'fm': one size, kept where a blue-noise rank is under the tone
export function setLight(L, { pitch = 4, mode = 'am', dotR = 0.36 } = {}) { LIGHT = L; PITCH = pitch; MODE = mode; DOT_R = dotR; SHADES = L ? new Map() : null; }
export const shadeOf = sil => SHADES?.get(sil) || '';
const R45 = Math.SQRT1_2;
const toGrid = p => (MODE === 'fm' ? [p[0] / PITCH, p[1] / PITCH] : [(p[0] + p[1]) * R45 / PITCH, (p[1] - p[0]) * R45 / PITCH]);
const fromGrid = (i, j) => (MODE === 'fm' ? [i * PITCH, j * PITCH] : [(i - j) * R45 * PITCH, (i + j) * R45 * PITCH]);
function halftone(quads) {
  let d = '';
  const done = new Set();
  for (const { pg, top, ax, dark } of quads) {
    const g = pg.map(toGrid), i0 = Math.floor(Math.min(...g.map(q => q[0]))), i1 = Math.ceil(Math.max(...g.map(q => q[0])));
    const j0 = Math.floor(Math.min(...g.map(q => q[1]))), j1 = Math.ceil(Math.max(...g.map(q => q[1])));
    const aa = ax[0] * ax[0] + ax[1] * ax[1] || 1;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * 100003 + j;
      if (done.has(k)) continue;
      const p = fromGrid(i + 0.5, j + 0.5);
      if (!inside(p, pg)) continue;
      done.add(k);
      const t = Math.max(0, Math.min(1, ((p[0] - top[0]) * ax[0] + (p[1] - top[1]) * ax[1]) / aa));
      const cover = Math.min(1, dark * (0.35 + 0.9 * t));
      if (cover < 0.03) continue;
      let r;
      if (MODE === 'fm') {
        const rank = BLUE[(((j % BLUE_N) + BLUE_N) % BLUE_N) * BLUE_N + (((i % BLUE_N) + BLUE_N) % BLUE_N)] / 256;
        if (rank >= Math.pow(cover, 0.7)) continue;
        r = DOT_R * PITCH;
      } else r = Math.sqrt(cover) * 0.78 * PITCH * 0.71;
      d += `M${r2(p[0] - r)} ${r2(p[1])}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0`;
    }
  }
  return d;
}
export function prism3(P, T, f, ring, inner, w0, w1) {
  const pr = w => ring.map(q => P(...at(f, q.u, q.v, w)));
  const sil = w0 === w1 ? poly(pr(w0)) : poly(hull(pr(w0).concat(pr(w1))));
  if (LIGHT && w0 !== w1) {
    const nrm = q => [f.U[0] * q.nu + f.V[0] * q.nv, f.U[1] * q.nu + f.V[1] * q.nv, f.U[2] * q.nu + f.V[2] * q.nv];
    const dark = q => { const n = nrm(q); return dot(n, T) > 0.02 && dot(n, LIGHT) < -0.04; };
    const r = run(ring, dark);
    if (r.length > 1) {
      // the cap the viewer sees is the wall's top edge; the other end, its foot
      const capHi = dot(f.W, T) >= 0, wt = capHi ? w1 : w0, wb = capHi ? w0 : w1;
      const quads = [];
      for (let k = 0; k < r.length - 1; k++) {
        const a = r[k], b = r[k + 1];
        const ta = P(...at(f, a.u, a.v, wt)), tb = P(...at(f, b.u, b.v, wt)), bb = P(...at(f, b.u, b.v, wb)), ba = P(...at(f, a.u, a.v, wb));
        const n = nrm({ nu: (a.nu + b.nu) / 2, nv: (a.nv + b.nv) / 2 }), l = Math.hypot(...n) || 1;
        quads.push({ pg: [ta, tb, bb, ba], top: ta, ax: [ba[0] - ta[0], ba[1] - ta[1]], dark: Math.min(1, -dot(n, LIGHT) / l / 0.7) });
      }
      const d = MODE === 'solid'
        ? poly(r.map(q => P(...at(f, q.u, q.v, wt))).concat(r.map(q => P(...at(f, q.u, q.v, wb))).reverse()))
        : halftone(quads);
      if (d) SHADES.set(sil, d);
    }
  }
  let crease = '';
  if (inner && w0 !== w1) {
    const cap = dot(f.W, T) >= 0 ? w1 : w0;
    const facing = q => f.U[0] * q.nu * T[0] + f.U[1] * q.nu * T[1] + f.U[2] * q.nu * T[2]
                      + f.V[0] * q.nv * T[0] + f.V[1] * q.nv * T[1] + f.V[2] * q.nv * T[2] >= -1e-6;
    crease = open(run(inner, facing).map(q => P(...at(f, q.u, q.v, cap))));
  }
  return { sil, crease };
}
// a ring on a plane, as a closed outline
export const flat = (P, f, ring, w) => poly(ring.map(q => P(...at(f, q.u, q.v, w))));
export const depthOf = (T, p) => dot(T, p);

/* Even-odd point in polygon. */
export function inside(pt, pg) {
  let c = false;
  for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
    const [xi, yi] = pg[i], [xj, yj] = pg[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
