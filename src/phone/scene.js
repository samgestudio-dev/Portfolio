import { rings, rrect, circ } from '../lib/iso.js';
import { UI } from './ui.js';

/* The phone as Hairline solids: every part a rounded prism (a silhouette and one crease),
   or a flat plate. Proportions from Ranguel's iPhone Air (CC BY 4.0) and Apple's sizes:
   156.2 × 74.7 × 5.64 mm. Millimetres; world x/y on the platter, z up. The phone stands
   on its foot, its screen facing +y; to someone facing the screen, their right is +x.

   Five layers along y, back to front, one axis:
     body · components · display · interface layout · interface content               */

export const H = 156.2, W = 74.7, R = 12;
const Y_BACK = -2.82, Y_GLASS = 2.0, Y_FRONT = 2.82;      // back face, under the glass, the glass's face
export const SCREEN_FRONT = Y_FRONT;

// frames: U, V span a part's ring, W is its axis. fx (to the viewer's right) is world +x.
const FRONT = { U: [1, 0, 0], V: [0, 0, 1], W: [0, 1, 0] };         // a ring in (fx, z), along +y
const LEFT = { U: [0, 1, 0], V: [0, 0, 1], W: [-1, 0, 0] };         // the left side (fx −), outward
const RIGHT = { U: [0, -1, 0], V: [0, 0, 1], W: [1, 0, 0] };        // the right side (fx +), outward
const f = (F, o = [0, 0, 0]) => ({ o, ...F });

// y: where the layer sits through the body when assembled, which orders the painting
// span: how far the layer reaches through y (for an interface layer, from its own plane):
// its hit area is the phone's whole outline across that span
export const LAYERS = [
  { name: 'body', gap: 0, y: -1.2, span: [Y_BACK - 3.7, Y_GLASS] },
  { name: 'components', gap: 13, y: -0.1, span: [-1.6, 1.4] },
  { name: 'display', gap: 13, y: 2.41, span: [Y_GLASS, Y_FRONT] },
  { name: 'ui · layout', gap: 11, ui: true, y: 2.84, span: [0, 0] },
  { name: 'ui · content', gap: 9, ui: true, y: 2.86, span: [0, 0] },
];
export const OUTLINE = rrect(-W / 2, 0, W / 2, H, R, 8);
{ let p = 0; for (const L of LAYERS) { p += L.gap; L.p = p; } const mid = p / 2; for (const L of LAYERS) L.p -= mid; }

export function buildParts() {
  const parts = [];
  const solid = (layer, frame, [ring, inner], w0, w1, extra = {}) => parts.push({ layer, frame, ring, inner, w0, w1, ...extra });
  const plane = (layer, frame, ring, w, extra = {}) => parts.push({ layer, frame, ring, inner: null, w0: w, w1: w, plane: true, ...extra });

  /* body: back glass and titanium frame as one slab, the plateau across the top of the
     back, the 48 MP lens standing on it, the flash and the microphone, and the buttons:
     Action and volume on the left, the side button and Camera Control on the right */
  solid(0, f(FRONT), rings(-W / 2, 0, W / 2, H, R, 0.9, 8), Y_BACK, Y_GLASS, { name: 'body' });
  solid(0, f(FRONT), rings(-34.5, 128.6, 34.5, 152.3, 11.5, 0.8, 8), Y_BACK - 2.6, Y_BACK, { name: 'plateau' });
  solid(0, f(FRONT), [circ(21.8, 140.4, 7.6), circ(21.8, 140.4, 6.2)], Y_BACK - 3.7, Y_BACK - 2.6, { name: 'lens' });
  plane(0, f(FRONT), circ(21.8, 140.4, 4.2, 36), Y_BACK - 3.7, { name: 'lens glass', mark: true });
  solid(0, f(FRONT), [circ(-21.8, 140.4, 3.3, 32), null], Y_BACK - 3.0, Y_BACK - 2.6, { name: 'flash' });
  plane(0, f(FRONT), circ(-13.6, 140.4, 0.8, 16), Y_BACK - 2.6, { name: 'mic', mark: true });
  for (const [z0, z1] of [[121.8, 129.0], [102.3, 114.4], [88.0, 100.1]])
    solid(0, f(LEFT, [-W / 2 + 0.4, 0, 0]), rings(-1.1, z0, 1.1, z1, 1.1, 0.4), 0, 0.9, { name: 'button' });
  for (const [z0, z1] of [[92.3, 110.1], [42.1, 59.9]])
    solid(0, f(RIGHT, [W / 2 - 0.4, 0, 0]), rings(-1.1, z0, 1.1, z1, 1.1, 0.4), 0, 0.9, { name: 'button' });

  /* components: the board stacked under the plateau with the A19 Pro, the C1X modem and
     the N1 chip facing the display; the front camera; the metal-cased battery filling the
     rest; the Taptic Engine and the speaker at the foot */
  solid(1, f(FRONT), rings(-33, 129.5, 33, 152, 5, 0.6), -1.4, -0.6, { name: 'board' });
  solid(1, f(FRONT), rings(-10, 133, 4, 147, 1.6, 0.6), -0.6, 0.2, { name: 'A19 Pro' });
  solid(1, f(FRONT), rings(-29, 135, -17, 145, 1.3, 0.5), -0.6, 0.0, { name: 'C1X' });
  solid(1, f(FRONT), rings(6, 140, 13, 148, 1.1, 0.5), -0.6, -0.1, { name: 'N1' });
  solid(1, f(FRONT), [circ(7, 150.5, 2.6, 24), circ(7, 150.5, 1.8, 24)], -0.6, 1.4, { name: 'front camera' });
  solid(1, f(FRONT), rings(-33, 15.5, 33, 125, 4.5, 0.8, 6), -1.6, 1.4, { name: 'battery' });
  solid(1, f(FRONT), rings(-30, 4.5, -11, 13.5, 1.6, 0.6), -1.2, 1.2, { name: 'Taptic Engine' });
  solid(1, f(FRONT), rings(11, 4.5, 30, 13.5, 1.6, 0.6), -1.2, 1.2, { name: 'speaker' });

  /* display: the cover glass, its edge a crease */
  solid(2, f(FRONT), rings(-W / 2, 0, W / 2, H, R, 1.0, 8), Y_GLASS, Y_FRONT, { name: 'display' });

  /* the interface: flat plates on the glass, in iPhone points (420 × 912) */
  const k = (H - 3.6) / 912, x0 = -210 * k, top = H - 1.8;
  for (const el of UI) {
    const [a, b, c, d, r] = el.g;
    const ring = rrect(x0 + a * k, top - d * k, x0 + c * k, top - b * k, r * k, r > 30 ? 8 : 5);
    plane(3 + el.level, f(FRONT), ring, 0, { name: el.name, fill: !!el.fill, primary: !!el.primary });
  }
  return parts;
}

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
