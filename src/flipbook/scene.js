import { rings, rrect, circ, prism3, poly } from '../lib/iso.js';

/* A flipbook, held up and fanned, as Hairline draws a tray of cards (its Riffle): twenty
   thin pages bound along a spine that stands upright, each a rounded plate with its
   thickness behind it, painted back to front. The book floats over the platter; a
   dotted drop from its spine says where it would stand. On each page one frame of the
   oldest exercise in animation: a ball bouncing across, each bounce lower, squashed
   where it lands and stretched where it falls fastest. Fanned, the pages show the whole
   move at once; flipped, it plays.
   Millimetres; x/y on the ground, z up. A page is s up its spine and w out from it.  */

export const N = 20;
export const HS = 54, WS = 72;                         // a page: its height along the spine, its width out from it
export const ZB = 20;                                  // the book's foot, above the platter
const TK = 0.6;                                        // a page's thickness
const TURN = -42;                                      // how the book stands on the platter: the page about to go faces the camera at rest

// the ball on page i: across the page (w), up it (s), and how squashed
export function ball(i) {
  const t = i / (N - 1);
  const w = 12 + t * (WS - 22);
  const B = [0, 0.38, 0.7, 1], hs = [26, 15, 8];
  let k = 0; while (k < 2 && t > B[k + 1]) k++;
  const p = (t - B[k]) / (B[k + 1] - B[k]);
  const h = hs[k] * 4 * p * (1 - p);
  const ground = 7, r = 3.4, down = h < 1.5;
  const speed = Math.abs(1 - 2 * p), sq = down ? 0.72 : 1 + 0.18 * speed * speed;
  return { w, s: ground + r * (down ? 0.72 : 1) + h, rw: r / Math.sqrt(sq), rs: r * Math.sqrt(sq) };
}

// The pages for a thumb at f (0 … N): pages before it have fallen forward onto a pile,
// the page at it is in flight, and the rest stand fanned back behind the one about to go,
// spread just behind it and gathering toward the back, as a held flipbook does.
const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function pose(f) {
  return Array.from({ length: N }, (_, i) => {
    const pile = 52 - i * 0.9;                          // fallen over to the front cover's side, each a little short of the last
    const behind = i - f;                               // how far behind the thumb
    const fan = -3 - 66 * (1 - Math.exp(-Math.max(0, behind) / 4.2));
    const x = f - i;                                    // 0 standing … 1 fallen
    return x >= 1 ? pile : x <= 0 ? fan : fan + (pile - fan) * ease(x);
  });
}
export const REST_F = 5.45;                             // at rest a page is caught in flight
export const REST = pose(REST_F);

const ZF = o => ({ o, U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] });

/* Everything, with page i at angle angles[i] about the spine (degrees; 0 points along +x,
   + turns toward +y), as [class, d, name] in paint order. hot: −1 or a page. */
export function book(P, T, angles, hot) {
  const out = [];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // a page at angle a: a point s up it and w out from the spine, on its face or its back
  const at = (a, s, w, back = 0) => {
    const r = ((a + TURN) * Math.PI) / 180, c = Math.cos(r), n = Math.sin(r);
    return [c * w + n * back, n * w - c * back, ZB + s];
  };
  const outline = rrect(0, 0, WS, HS, 2.4, 3);           // u = w, v = s
  const items = angles.map((a, i) => {
    const r = ((a + TURN) * Math.PI) / 180, nrm = [-Math.sin(r), Math.cos(r), 0];
    const facing = dot3(nrm, T) > 0;
    const paths = [
      ['lo', poly(outline.map(q => P(...at(a, q.v, q.u, TK)))), `pg${i}-back`],
      [i === hot ? 'sil hi' : 'sil', poly(outline.map(q => P(...at(a, q.v, q.u)))), `pg${i}`],
    ];
    if (facing) {
      const b = ball(i);
      paths.push(['cr', `M${P(...at(a, 7, 7)).join(' ')}L${P(...at(a, 7, WS - 6)).join(' ')}`, `pg${i}-ground`]);
      paths.push(['ball', poly(circ(0, 0, 1, 20).map(q => P(...at(a, b.s + q.v * b.rs, b.w + q.u * b.rw)))), `pg${i}-ball`]);
    }
    return { k: dot3(T, at(a, HS / 2, WS / 2)), paths };
  });
  // the spine: a bar up the binding, a screw at each end, among the pages by depth
  const [sr, si] = rings(-3.4, -3.4, 3.4, 3.4, 3.4, 0.8, 6);
  const sp = prism3(P, T, ZF([0, 0, 0]), sr, si, ZB - 2, ZB + HS + 2);
  const caps = [ZB - 4, ZB + HS + 2].map(z0 => prism3(P, T, ZF([0, 0, 0]), circ(0, 0, 4.4, 20), circ(0, 0, 3.4, 20), z0, z0 + 2));
  items.push({ k: dot3(T, [0, 0, ZB + HS / 2]), paths: [['sil', caps[0].sil, 'cap0'], ['cr', caps[0].crease, 'cap0-cr'], ['sil', sp.sil, 'spine'], ['cr', sp.crease, 'spine-cr'], ['sil', caps[1].sil, 'cap1'], ['cr', caps[1].crease, 'cap1-cr']] });
  items.sort((p, q) => p.k - q.k);
  // a dotted drop from the spine's foot to the platter: the book floats
  out.push(['guide', `M${P(0, 0, ZB - 4).join(' ')}L${P(0, 0, 0).join(' ')}`, 'drop']);
  for (const it of items) out.push(...it.paths);
  return out;
}

export const EXTENT = { r: WS + 3, top: ZB + HS + 4 };
