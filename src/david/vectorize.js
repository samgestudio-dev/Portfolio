/* Raster lines → smooth vector strokes, for the resting frame.

   The GPU draws the body's interior lines pixel by pixel, so a groove that fades in and
   out comes back as a row of dashes. When the turntable rests, those pixels are read back
   and redrawn as strokes:

   1. thin    the mask to a one-pixel skeleton (Zhang–Suen), on a grid of CSS pixels
   2. trace   the skeleton into polylines, breaking at junctions
   3. join    ends that are close and point at each other, so dashes become one line
   4. drop    whatever is still shorter than minLen
   5. smooth  resample and relax each polyline, so it draws as one clean curve

   Coordinates come back in CSS pixels, origin top-left, ready for a 2D canvas.
   It runs every frame the picture changes, so buffers are reused and every scan after
   the first stays inside the box the lines occupy.                                       */

const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

// Buffers live across frames: the line pass runs every frame the turntable moves.
let cache = { n: 0 };
function buffers(n) {
  if (cache.n !== n) cache = { n, g: [new Uint8Array(n), new Uint8Array(n)], seen: new Uint8Array(n) };
  return cache;
}

/* mask: RGBA bytes, one pixel per CSS pixel, bottom row first (a WebGL read-back).
   specs: one entry per channel to trace, e.g. [{ channel: 0, minLen: 16, gap: 14 }].
   One scan of the mask fills a grid per channel; everything after stays in the box the
   lines occupy.                                                                         */
export function traceAll(mask, w, h, specs) {
  const n = w * h, { g, seen } = buffers(n);
  const box = specs.map(() => [w, -1, h, -1]);
  g[0].fill(0); g[1].fill(0);
  const m32 = new Uint32Array(mask.buffer, mask.byteOffset, n);   // little-endian: r = low byte
  for (let i = 0; i < n; i++) {
    const v = m32[i];
    if ((v & 0xffff) === 0) continue;
    const x = i % w, y = (i / w) | 0;
    for (let k = 0; k < specs.length; k++) {
      if (((v >> (8 * specs[k].channel)) & 0xff) < 128) continue;
      g[k][i] = 1;
      const b = box[k];
      if (x < b[0]) b[0] = x; if (x > b[1]) b[1] = x; if (y < b[2]) b[2] = y; if (y > b[3]) b[3] = y;
    }
  }
  return specs.map((spec, k) => box[k][1] < 0 ? [] : traceGrid(g[k], seen, w, h, box[k], spec));
}

function traceGrid(g, seen, gw, gh, [x0, x1, y0, y1], { minLen = 16, gap = 12, maxTurn = 50 } = {}) {
  const f = 1, ratio = 1, h = gh;
  thin(g, gw, gh, x0, x1, y0, y1);
  for (let y = y0; y <= y1; y++) seen.fill(0, y * gw + x0, y * gw + x1 + 1);

  // 2. trace
  const at = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && g[y * gw + x] === 1;
  const degree = (x, y) => {
    let c = 0;
    for (let k = 0; k < 8; k++) if (at(x + N8[k][0], y + N8[k][1])) c++;
    return c;
  };
  const lines = [];
  const walk = (x, y) => {
    const pts = [[x, y]];
    if (degree(x, y) < 3) seen[y * gw + x] = 1;
    for (;;) {
      let next = null;
      for (const [dx, dy] of N8) {
        const nx = x + dx, ny = y + dy;
        if (!at(nx, ny) || seen[ny * gw + nx]) continue;
        if (pts.length > 1 && nx === pts[pts.length - 2][0] && ny === pts[pts.length - 2][1]) continue;
        next = [nx, ny];
        if (dx === 0 || dy === 0) break;           // prefer straight steps over diagonals
      }
      if (!next) break;
      [x, y] = next;
      pts.push([x, y]);
      if (degree(x, y) >= 3) break;                // stop at a junction, leave it open for others
      seen[y * gw + x] = 1;
    }
    return pts;
  };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    if (g[y * gw + x] && !seen[y * gw + x] && degree(x, y) === 1) lines.push(walk(x, y));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)      // loops and leftovers
    if (g[y * gw + x] && !seen[y * gw + x] && degree(x, y) < 3) lines.push(walk(x, y));

  // grid → CSS px, flipped (the read-back starts at the bottom row)
  let polys = lines.filter(l => l.length > 1).map(l => l.map(([x, y]) => [(x + 0.5) * f / ratio, (h - (y + 0.5) * f) / ratio]));

  // 3. join ends that are near and aligned
  const cosTurn = Math.cos(maxTurn * Math.PI / 180);
  for (let pass = 0; pass < 4; pass++) {
    const ends = [];
    polys.forEach((p, i) => { if (p.length >= 2) { ends.push({ i, head: true, ...endOf(p, true) }); ends.push({ i, head: false, ...endOf(p, false) }); } });
    const pairs = [];
    for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) {
      const A = ends[a], B = ends[b];
      if (A.i === B.i) continue;
      const dx = B.p[0] - A.p[0], dy = B.p[1] - A.p[1], d = Math.hypot(dx, dy);
      if (d > gap) continue;
      const ux = d > 1e-6 ? dx / d : A.t[0], uy = d > 1e-6 ? dy / d : A.t[1];
      const ca = A.t[0] * ux + A.t[1] * uy;          // A's end points toward B
      const cb = -(B.t[0] * ux + B.t[1] * uy);       // B's end points back toward A
      if (d > 2 && (ca < cosTurn || cb < cosTurn)) continue;
      const tt = -(A.t[0] * B.t[0] + A.t[1] * B.t[1]); // the two ends continue each other
      if (tt < cosTurn) continue;
      pairs.push({ A, B, score: d * (3 - ca - cb - tt) });
    }
    if (!pairs.length) break;
    pairs.sort((x, y) => x.score - y.score);
    const used = new Set(), owner = polys.map((_, i) => i), merged = polys.slice();
    const root = i => { while (owner[i] !== i) i = owner[i]; return i; };
    let joined = 0;
    for (const { A, B } of pairs) {
      const ka = A.i + (A.head ? 'h' : 't'), kb = B.i + (B.head ? 'h' : 't');
      if (used.has(ka) || used.has(kb)) continue;
      const ra = root(A.i), rb = root(B.i);
      if (ra === rb) continue;
      // orient: ...A-end] + [B-end...
      let pa = merged[ra], pb = merged[rb];
      if (A.head) pa = pa.slice().reverse();
      if (!B.head) pb = pb.slice().reverse();
      if (!sameEnd(pa[pa.length - 1], A.p) || !sameEnd(pb[0], B.p)) continue;   // that end was already used
      merged[ra] = pa.concat(pb); merged[rb] = null; owner[rb] = ra;
      used.add(ka); used.add(kb); joined++;
    }
    polys = merged.filter(Boolean);
    if (!joined) break;
  }

  // 4. drop the short, 5. smooth the rest
  return polys.filter(p => length(p) >= minLen).map(smooth);
}

function endOf(p, head) {
  const n = p.length, k = Math.min(6, n - 1);
  const e = head ? p[0] : p[n - 1], q = head ? p[k] : p[n - 1 - k];
  const dx = e[0] - q[0], dy = e[1] - q[1], d = Math.hypot(dx, dy) || 1;
  return { p: e, t: [dx / d, dy / d] };              // tangent pointing out of the line
}
const sameEnd = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const length = p => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };

function smooth(p) {
  // resample every 2 CSS px
  const step = 2, out = [p[0]];
  let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1], [x1, y1] = p[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    let t = step - carry;
    while (t <= d) { out.push([x0 + (x1 - x0) * t / d, y0 + (y1 - y0) * t / d]); t += step; }
    carry = d - (t - step);
  }
  out.push(p[p.length - 1]);
  // relax, ends fixed
  for (let it = 0; it < 6; it++)
    for (let i = 1; i < out.length - 1; i++)
      out[i] = [0.25 * out[i - 1][0] + 0.5 * out[i][0] + 0.25 * out[i + 1][0], 0.25 * out[i - 1][1] + 0.5 * out[i][1] + 0.25 * out[i + 1][1]];
  return out;
}

// Zhang–Suen thinning, in place, visiting only pixels that are on
function thin(g, w, h, x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1) {
  let on = [];
  for (let y = y0; y <= y1; y++) for (let x = x0, i = y * w + x0; x <= x1; x++, i++) if (g[i]) on.push(i);
  const P = (i, dx, dy) => { const x = i % w + dx, y = ((i / w) | 0) + dy; return x >= 0 && y >= 0 && x < w && y < h ? g[y * w + x] : 0; };
  for (let changed = true, iter = 0; changed && iter < 30; iter++) {
    changed = false;
    for (const sub of [0, 1]) {
      const kill = [];
      for (const i of on) {
        if (!g[i]) continue;
        const p2 = P(i, 0, -1), p3 = P(i, 1, -1), p4 = P(i, 1, 0), p5 = P(i, 1, 1), p6 = P(i, 0, 1), p7 = P(i, -1, 1), p8 = P(i, -1, 0), p9 = P(i, -1, -1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0; for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
        if (A !== 1) continue;
        if (sub === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
        kill.push(i);
      }
      for (const i of kill) g[i] = 0;
      if (kill.length) changed = true;
    }
    on = on.filter(i => g[i]);
  }
}
