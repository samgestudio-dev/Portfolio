import { circ } from './iso.js';

/* The turntable: a fixed base, the platter and four detent studs, one per quarter. */
export const PLATTER_R = 71;
export function buildPlatter() {
  const Z = { U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] };
  const parts = [];
  parts.push({ stage: 'base', frame: { o: [0, 0, 0], ...Z }, ring: circ(0, 0, PLATTER_R * 0.88, 96), inner: circ(0, 0, PLATTER_R * 0.88 - 1, 96), w0: -20, w1: -7.3 });
  parts.push({ stage: 'platter', frame: { o: [0, 0, 0], ...Z }, ring: circ(0, 0, PLATTER_R, 128), inner: circ(0, 0, PLATTER_R - 1.2, 128), w0: -7.3, w1: 0 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, rr = PLATTER_R - 6;
    parts.push({ stage: 'stud', frame: { o: [Math.sin(a) * rr, Math.cos(a) * rr, 0], ...Z }, ring: circ(0, 0, 2.5, 20), inner: circ(0, 0, 1.9, 20), w0: 0, w1: 2.5 });
  }
  return parts;
}
