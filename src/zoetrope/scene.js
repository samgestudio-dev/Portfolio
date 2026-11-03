import { poly, circ, hull, prism3, rings } from '../lib/iso.js';
import { horse } from './horse.js';

/* The zoetrope, drawn as Hairline draws: a drum open at the top, on a hub, with a spindle
   up its middle; a band of slots round the top of its wall, and inside it a strip of
   twelve frames of a horse at a gallop. Millimetres; x/y on the ground, z up.

   Paint order, back to front: the hub, the floor, the far half of the wall as seen from
   inside (with its slots, the strip, the horses), the spindle, the near half of the wall
   with its slots cut through, the rim. The near half hides what is behind it except
   through its slots and over its top.                                               */

export const N = 12;                                   // frames, and slots
export const RO = 58, RI = 56, Z_FLOOR = 8, Z_TOP = 58, HUB = 6;
const SLOT = [36, 54], SLOT_W = 1.7;                   // the slot band, and a slot's half width in mm
const STRIP = [11, 32], GROUND = 13;                   // the strip on the inner wall, and the hooves' ground on it
export const STEP = (Math.PI * 2) / N;

// frame k sits at angle +k·step on the drum, and the drum turns the other way (−θ, so a
// drag to the right carries its near edge right): a turn of one step brings frame k to
// where k − 1 was, and seen through the slots at speed the horse gallops forward in place
const frameAngle = k => k * STEP;
const FRAMES = Array.from({ length: N }, (_, k) => horse(k / N));

const ring = (P, r, z, a0, a1, n, phi) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n + phi; out.push(P(r * Math.cos(a), r * Math.sin(a), z)); }
  return out;
};

/* Everything, for the drum turned by phi, as a list of [class, d], back to front. */
export function zoetrope(P, T, phi) {
  const out = [];
  const view = Math.atan2(T[1], T[0]);                  // the direction toward the viewer, on the ground
  const near0 = view - Math.PI / 2, far0 = view + Math.PI / 2;
  const Z = { U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] };

  // the hub under the drum, and the drum's floor
  const [hr, hi] = rings(-14, -14, 14, 14, 14, 1, 12);
  const hub = prism3(P, T, { o: [0, 0, 0], ...Z }, hr, hi, 0, HUB);
  out.push(['sil', hub.sil]);
  out.push(['plate', poly(ring(P, RI, Z_FLOOR, 0, Math.PI * 2, 96, 0))]);

  // the far half of the wall, its inside: a band from the floor to the top
  const farTop = ring(P, RI, Z_TOP, far0, far0 + Math.PI, 64, 0), farFloor = ring(P, RI, Z_FLOOR, far0, far0 + Math.PI, 64, 0);
  out.push(['plate', poly(farTop.concat(farFloor.slice().reverse()))]);
  out.push(['cr', 'M' + farFloor.map(p => p.join(' ')).join('L')]);               // where the wall meets the floor
  // relative to the drum: an angle a on the drum is at a + phi in the world
  const onFar = a => { const w = a + phi, d = Math.cos(w - view); return d < -0.05; };   // faces the viewer from inside
  // the strip's edges along the far wall, and the frames between them
  out.push(['cr', poly([...ring(P, RI - 0.05, STRIP[1], far0, far0 + Math.PI, 64, 0), ...ring(P, RI - 0.05, STRIP[0], far0, far0 + Math.PI, 64, 0).reverse()])]);
  for (let k = 0; k < N; k++) {
    const a = frameAngle(k) + STEP / 2;
    if (!onFar(a)) continue;
    const w = a + phi, x = (RI - 0.05) * Math.cos(w), y = (RI - 0.05) * Math.sin(w);
    out.push(['cr', 'M' + P(x, y, STRIP[0]).join(' ') + 'L' + P(x, y, STRIP[1]).join(' ')]);
  }
  // the slots on the far wall: holes, the ground showing through
  for (let k = 0; k < N; k++) {
    const a = frameAngle(k) + STEP / 2;
    if (!onFar(a)) continue;
    const da = SLOT_W / RI, q = [...ring(P, RI, SLOT[1], a - da, a + da, 2, phi), ...ring(P, RI, SLOT[0], a - da, a + da, 2, phi).reverse()];
    out.push(['slot', poly(q)]);
  }
  // the horses, on the far wall, facing the way the drum turns
  for (let k = 0; k < N; k++) {
    const a = frameAngle(k);
    if (!onFar(a)) continue;
    for (const shape of FRAMES[k]) {
      const pts = shape.map(([sx, sy]) => {
        const w = a + phi - sx / RI;                    // along the wall; seen from inside, forward is −a
        return P((RI - 0.1) * Math.cos(w), (RI - 0.1) * Math.sin(w), GROUND + sy);
      });
      out.push(['horse', poly(pts)]);
    }
  }

  // the spindle up the middle, and its knob
  const [sr] = rings(-2.2, -2.2, 2.2, 2.2, 2.2, 0.5, 6);
  const sp = prism3(P, T, { o: [0, 0, 0], ...Z }, sr, null, Z_FLOOR, Z_TOP + 6);
  out.push(['sil', sp.sil]);
  const [kr, ki] = rings(-4, -4, 4, 4, 4, 0.8, 8);
  const kn = prism3(P, T, { o: [0, 0, 0], ...Z }, kr, ki, Z_TOP + 6, Z_TOP + 9);
  out.push(['sil', kn.sil], ['cr', kn.crease]);

  // the near half of the wall, outside, with its slots cut through (even–odd)
  const nearTop = ring(P, RO, Z_TOP, near0, near0 + Math.PI, 64, 0), nearBot = ring(P, RO, HUB, near0, near0 + Math.PI, 64, 0);
  let d = poly(nearTop.concat(nearBot.reverse()));
  const holes = [];
  for (let k = 0; k < N; k++) {
    const a = frameAngle(k) + STEP / 2, w = a + phi;
    if (Math.cos(w - view) < 0.08) continue;
    const da = SLOT_W / RO;
    holes.push(poly([...ring(P, RO, SLOT[1], a - da, a + da, 2, phi), ...ring(P, RO, SLOT[0], a - da, a + da, 2, phi).reverse()]));
  }
  out.push(['wall', d + holes.join('')]);
  out.push(['slot-edge', holes.join('')]);
  // the drum's outline, and its rim: a ring between the outer and inner circles at the top
  out.push(['sil nf', poly(hull([...ring(P, RO, Z_TOP, 0, Math.PI * 2, 96, 0), ...ring(P, RO, HUB, 0, Math.PI * 2, 96, 0)]))]);
  out.push(['rim', poly(ring(P, RO, Z_TOP, 0, Math.PI * 2, 96, 0)) + poly(ring(P, RI, Z_TOP, 0, Math.PI * 2, 96, 0))]);
  return out;
}

// which frame the viewer sees at the far wall's middle, for the drum turned by phi
export function frameSeen(T, phi) {
  const view = Math.atan2(T[1], T[0]) + Math.PI;
  let best = 0, bd = Infinity;
  for (let k = 0; k < N; k++) { const d = Math.abs(Math.atan2(Math.sin(frameAngle(k) + phi - view), Math.cos(frameAngle(k) + phi - view))); if (d < bd) { bd = d; best = k; } }
  return best;
}
export { circ };
