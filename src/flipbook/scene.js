import { rings, rrect, circ, prism3, poly } from '../lib/iso.js';

/* A flipbook, fanned, as Hairline draws a tray of cards (its Riffle): twenty thin pages
   hinged on a spine, each a rounded plate with its thickness behind it, painted back to
   front. On each page one frame of the oldest exercise in animation: a ball bouncing
   from left to right, each bounce lower, squashed where it lands and stretched where it
   falls fastest. Fanned, the pages show the whole move at once; flipped, it plays.
   Millimetres; x along the spine, y across it (front +y), z up.                      */

export const N = 20;
export const W = 72, H = 54, ZS = 15;                 // a page's width and height; the spine's height
const TK = 0.6;                                        // a page's thickness

// the ball on page i: where it is on the page (u across, v up) and how squashed
export function ball(i) {
  const s = i / (N - 1);
  const u = 9 + s * (W - 18);
  // three bounces, each lower: the height is a run of arcs, falling to the ground at each landing
  const B = [0, 0.38, 0.7, 1], hs = [30, 17, 9];
  let k = 0; while (k < 2 && s > B[k + 1]) k++;
  const p = (s - B[k]) / (B[k + 1] - B[k]);            // 0..1 through bounce k
  const h = hs[k] * 4 * p * (1 - p);
  const ground = 8, r = 3.6;
  // squash on the ground, stretch where it moves fastest (low in the arc)
  const speed = Math.abs(1 - 2 * p), squash = h < 1.5 ? 0.72 : 1 + 0.18 * speed * speed;
  return { u, v: ground + r * (h < 1.5 ? 0.72 : 1) + h, rx: r / Math.sqrt(squash), ry: r * Math.sqrt(squash) };
}

// The pages for a thumb at f (0 … N): pages before it have fallen forward onto a pile,
// the page at it is in flight, and the rest stand fanned back behind the one about to go,
// spread just behind it and gathering toward the back, as a held flipbook does.
const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function pose(f) {
  return Array.from({ length: N }, (_, i) => {
    const pile = 84 - i * 0.7;                          // fallen forward, each a little above the last
    const behind = i - f;                               // how far behind the thumb
    const fan = -3 - 66 * (1 - Math.exp(-Math.max(0, behind) / 4.2));
    const x = f - i;                                    // 0 standing … 1 fallen
    return x >= 1 ? pile : x <= 0 ? fan : fan + (pile - fan) * ease(x);
  });
}
export const REST_F = 5.45;                             // at rest a page is caught in flight
export const REST = pose(REST_F);

const ZF = o => ({ o, U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] });
const XF = o => ({ o, U: [0, 1, 0], V: [0, 0, 1], W: [1, 0, 0] });
const O = [0, 0, 0];

/* Everything, with page i at angle angles[i] (degrees, + leans toward the front), as
   [class, d] in paint order. hot: −1 or a page. */
export function book(P, T, angles, hot) {
  const out = [];
  const push = (p, cls = 'sil') => { out.push([cls, p.sil]); if (p.crease) out.push(['cr', p.crease]); };
  // the stand: a block with the spine laid along its top, and the two binding screws
  const [br, bi] = rings(-42, -13, 42, 13, 5, 1.2, 6);
  push(prism3(P, T, ZF(O), br, bi, 0, 10));
  const [sr, si] = rings(-4.5, 10, 4.5, ZS + 3, 3.2, 0.7, 6);
  const spine = prism3(P, T, XF(O), sr, si, -39, 39);

  // a page at angle a: its corner points in the world
  const at = (a, u, v) => { const r = (a * Math.PI) / 180; return [u - W / 2, v * Math.sin(r), ZS + v * Math.cos(r)]; };
  const back = (a, u, v) => { const r = (a * Math.PI) / 180, p = at(a, u, v); return [p[0], p[1] - TK * Math.cos(r), p[2] + TK * Math.sin(r)]; };
  const outline = rrect(0, 0, W, H, 2.2, 3);
  const pages = angles.map((a, i) => {
    const r = (a * Math.PI) / 180, n = [0, Math.cos(r), -Math.sin(r)];          // the face's normal
    const facing = n[0] * T[0] + n[1] * T[1] + n[2] * T[2] > 0;
    const c = at(a, W / 2, H / 2);
    const paths = [
      ['lo', poly(outline.map(q => P(...back(a, q.u, q.v))))],
      [i === hot ? 'sil hi' : 'sil', poly(outline.map(q => P(...at(a, q.u, q.v))))],
    ];
    if (facing) {
      const b = ball(i);
      // the frame's ground line, and the ball
      paths.push(['cr', `M${P(...at(a, 6, 8)).join(' ')}L${P(...at(a, W - 6, 8)).join(' ')}`]);
      paths.push(['ball', poly(circ(0, 0, 1, 20).map(q => P(...at(a, b.u + q.u * b.rx, b.v + q.v * b.ry))))]);
    }
    return { a, k: T[0] * c[0] + T[1] * c[1] + T[2] * c[2], paths };
  });
  // the spine sits under the pages' hinge: the pages that lean away from the viewer are
  // behind it, the ones that lean toward them in front; each group far to near
  pages.sort((a, b) => a.k - b.k);
  const toward = T[1] >= 0 ? (a => a >= 0) : (a => a < 0);
  const lean = pages.map(p => p);
  for (const pg of lean) if (!toward(pg.a)) out.push(...pg.paths);
  push(spine); for (const sx of [-1, 1]) screw(sx);
  for (const pg of lean) if (toward(pg.a)) out.push(...pg.paths);
  function screw(sx) {
    const s = prism3(P, T, XF(O), circ(0, ZS - 1.5, 2.4, 16), circ(0, ZS - 1.5, 1.6, 16), sx > 0 ? 39 : -40.2, sx > 0 ? 40.2 : -39);
    out.push(['sil', s.sil], ['cr', s.crease]);
  }
  return out;
}

export const EXTENT = { r: Math.hypot(W / 2 + 2, H + 2), top: ZS + H + 2 };
