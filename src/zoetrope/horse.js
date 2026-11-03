/* A horse at a gallop, as flat shapes in profile, for one frame of the strip. Built here
   from rounded parts and a gait, not traced from anything: a barrel with a deep chest
   and a round rump that bob and pitch once a stride; a neck that tapers to the poll and
   a head that tapers to the muzzle, nodding against the stride; ears; a tail that
   streams; four legs, forearm or gaskin then cannon then hoof, the hind pair a little
   apart in time and the fore pair half a stride on, the knee folding back on the fore
   and the hock forward on the hind. Units are millimetres on the strip: x forward, y up,
   the hooves' ground at y = 0.                                                         */

const TAU = Math.PI * 2;
const rot = (a, [x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

// a tapered capsule from p (w0 wide) to q (w1 wide)
function capsule(p, q, w0, w1 = w0) {
  const a = Math.atan2(q[1] - p[1], q[0] - p[0]), out = [];
  for (let k = 0; k <= 6; k++) { const t = a + Math.PI / 2 + (k / 6) * Math.PI; out.push([p[0] + (w0 / 2) * Math.cos(t), p[1] + (w0 / 2) * Math.sin(t)]); }
  for (let k = 0; k <= 6; k++) { const t = a - Math.PI / 2 + (k / 6) * Math.PI; out.push([q[0] + (w1 / 2) * Math.cos(t), q[1] + (w1 / 2) * Math.sin(t)]); }
  return out;
}
function ellipse(c, rx, ry, a = 0, n = 22) {
  const out = [];
  for (let k = 0; k < n; k++) { const t = (k / n) * TAU; out.push(add(c, rot(a, [rx * Math.cos(t), ry * Math.sin(t)]))); }
  return out;
}

const LEGS = [
  { fore: false, off: 0.0, at: [-5.4, -1.6] }, { fore: false, off: 0.11, at: [-5.0, -1.8] },
  { fore: true, off: 0.5, at: [5.0, -2.2] }, { fore: true, off: 0.61, at: [5.4, -2.0] },
];

export function horse(t) {
  const bob = 0.8 * Math.sin(TAU * t), pitch = 0.08 * Math.sin(TAU * t + 1.1);
  const c = [0, 10.2 + bob];
  const B = p => add(c, rot(pitch, p));                 // a point on the body, as it bobs and pitches
  const shapes = [];
  // legs first, so the body's edge runs over their tops
  for (const L of LEGS) {
    const q = (t + L.off) % 1, s = Math.sin(TAU * q);
    const top = B(L.at);
    const a1 = (L.fore ? 0.6 : 0.55) * s + (L.fore ? 0.08 : -0.1);
    const bend = Math.max(0, Math.sin(TAU * q + 0.8));
    const a2 = L.fore ? a1 - 1.3 * bend : a1 + 1.05 * bend;
    const joint = add(top, [4.5 * Math.sin(a1), -4.5 * Math.cos(a1)]);
    const fet = add(joint, [4.3 * Math.sin(a2), -4.3 * Math.cos(a2)]);
    const hoof = add(fet, [0.9 * Math.sin(a2 + (L.fore ? 0.5 : 0.35)), -0.9 * Math.cos(a2 + (L.fore ? 0.5 : 0.35))]);
    shapes.push(capsule(top, joint, 2.6, 1.5), capsule(joint, fet, 1.25, 1.0), capsule(fet, hoof, 1.5, 1.6));
  }
  // barrel, chest, rump
  shapes.push(ellipse(c, 6.8, 3.1, pitch), ellipse(B([5.4, 0.2]), 2.9, 3.4, pitch), ellipse(B([-5.4, 0.6]), 3.1, 3.2, pitch));
  // neck and head, nodding against the stride
  const nod = 0.5 * Math.sin(TAU * t + 2.2);
  const n0 = B([5.4, 1.2]), poll = B([10.2, 5.0 + nod]);
  shapes.push(capsule(n0, poll, 5.0, 2.4));
  const muzzle = add(poll, rot(-1.2 + 0.1 * nod, [4.3, 0]));
  shapes.push(capsule(poll, muzzle, 2.9, 1.6));
  shapes.push(capsule(add(poll, [-0.3, 0.6]), add(poll, [-0.6, 2.1]), 0.9, 0.5));
  // the tail, streaming back from the croup
  const t0 = B([-8.0, 1.8]);
  shapes.push(capsule(t0, add(t0, [-2.6, -0.4 + 0.5 * Math.sin(TAU * t)]), 1.8, 1.4), capsule(add(t0, [-2.6, -0.4 + 0.5 * Math.sin(TAU * t)]), add(t0, [-5.2, -2.6 + 1.0 * Math.sin(TAU * t + 0.5)]), 1.4, 0.7));
  return shapes;
}
