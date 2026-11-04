/* The yellow line behind David, drawn the way a hand draws it: real strokes, not a pattern.
 *
 * His silhouette is rendered small (as the camera sees him, with a margin past the edges of the
 * picture), read back, and pushed outward by a distance field. Around the pushed-out outline go
 * the strokes of a marker, laid down with a seeded hand:
 *   - a zigzag scribble that swings in and out across a band behind him, with uneven swings,
 *     lifts of the pen and restarts, drawn twice by two hands of different weight;
 *   - a few loose outline loops further out, each running part of the way round, wobbling,
 *     overshooting where it starts and stops.
 * The strokes go on a 2D canvas, which is drawn behind him as a texture.
 *
 * The drawing is remade only when his outline changes (he turns, or the camera moves), at most
 * 24 times a second, each time with a new hand, so the line boils while he turns and holds
 * still when he does. */

const MAXG = 300;       // the silhouette's long side, in samples
const MARGIN = 0.12;    // how far past the picture's edges it is taken (fraction of each side)

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// a smooth wobble along the line: a few sines at random rates and phases
function wobble(R, n = 3) {
  const w = Array.from({ length: n }, (_, k) => ({ f: (0.6 + R() * 1.4) * (k + 1) * 0.004, p: R() * 6.283, a: 1 / (k + 1) }));
  const s = w.reduce((t, q) => t + q.a, 0);
  return x => w.reduce((t, q) => t + q.a * Math.sin(x * q.f + q.p), 0) / s;
}

export function createScribble(THREE, renderer) {
  const maskRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
  const maskScene = new THREE.Scene();
  const maskGroup = new THREE.Group(); maskScene.add(maskGroup);
  const maskMesh = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  maskGroup.add(maskMesh);
  const mcam = new THREE.PerspectiveCamera();

  const cv = document.createElement('canvas'); cv.width = cv.height = 4;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  const sheetScene = new THREE.Scene(); sheetScene.add(sheet);
  const sheetCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let buf = new Uint8Array(4), W = 1, H = 1;
  let lastKey = null, lastAt = -1e9, hand = 1, pending = false, outline = null, drawnOut = -1;

  function setGeometry(geo) { maskMesh.geometry = geo; }
  function resize(w, h) {
    W = Math.max(1, w); H = Math.max(1, h);
    // the strokes are drawn at half the picture's resolution: they are soft and thick
    cv.width = Math.max(1, Math.round(W / 2)); cv.height = Math.max(1, Math.round(H / 2));
    lastKey = null;
  }

  /* ---- his outline, pushed out: [{x,y,nx,ny}] in canvas px, and the band it can use ---- */
  function silhouette(cam, rotY) {
    const s = MAXG / Math.max(W, H) / (1 + 2 * MARGIN);
    const gw = Math.max(8, Math.round(W * (1 + 2 * MARGIN) * s)), gh = Math.max(8, Math.round(H * (1 + 2 * MARGIN) * s));
    mcam.copy(cam);
    mcam.setViewOffset(W, H, -MARGIN * W, -MARGIN * H, W * (1 + 2 * MARGIN), H * (1 + 2 * MARGIN));
    mcam.aspect = cam.aspect; // (setViewOffset sets it from W/H; the picture is framed with the camera's own)
    mcam.updateProjectionMatrix();
    maskGroup.rotation.y = rotY;
    maskRT.setSize(gw, gh);
    if (buf.length !== gw * gh * 4) buf = new Uint8Array(gw * gh * 4);
    const rt0 = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), ac = renderer.autoClear;
    renderer.setRenderTarget(maskRT); renderer.setClearColor(0x000000, 1); renderer.autoClear = true;
    renderer.render(maskScene, mcam);
    renderer.readRenderTargetPixels(maskRT, 0, 0, gw, gh, buf);
    renderer.setRenderTarget(rt0); renderer.setClearColor(cc, ca); renderer.autoClear = ac;

    // the distance (in samples) of every sample from him: 0 inside; a 3-4 chamfer, two passes
    const N = gw * gh, D = new Float32Array(N);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) D[y * gw + x] = buf[((gh - 1 - y) * gw + x) * 4] > 127 ? 0 : 1e6;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x; let d = D[i];
      if (x > 0) d = Math.min(d, D[i - 1] + 1);
      if (y > 0) { d = Math.min(d, D[i - gw] + 1); if (x > 0) d = Math.min(d, D[i - gw - 1] + 1.414); if (x < gw - 1) d = Math.min(d, D[i - gw + 1] + 1.414); }
      D[i] = d;
    }
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) {
      const i = y * gw + x; let d = D[i];
      if (x < gw - 1) d = Math.min(d, D[i + 1] + 1);
      if (y < gh - 1) { d = Math.min(d, D[i + gw] + 1); if (x < gw - 1) d = Math.min(d, D[i + gw + 1] + 1.414); if (x > 0) d = Math.min(d, D[i + gw - 1] + 1.414); }
      D[i] = d;
    }
    // the outline a little way out from him (rounds off his small gaps and fingers)
    const lvl = 1;
    const B = new Uint8Array(N);
    for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) B[y * gw + x] = D[y * gw + x] <= lvl ? 1 : 0;
    // trace its outer edge (Moore neighbours, clockwise on screen), from its topmost sample
    let st = -1; for (let i = 0; i < N; i++) if (B[i]) { st = i; break; }
    if (st < 0) return null;
    const dx = [1, 1, 0, -1, -1, -1, 0, 1], dy = [0, 1, 1, 1, 0, -1, -1, -1];
    let x = st % gw, y = (st / gw) | 0, dir = 0, n = 0;
    const sx = x, sy = y, P = [];
    do {
      P.push([x, y]);
      let ok = false;
      for (let k = 0; k < 8; k++) {
        const d = (dir + 5 + k) % 8, ax = x + dx[d], ay = y + dy[d];
        if (B[ay * gw + ax]) { x = ax; y = ay; dir = d; ok = true; break; }
      }
      if (!ok) break;
    } while (!(x === sx && y === sy) && ++n < 40000);
    if (P.length < 12) return null;
    // smooth it (it is a closed loop), then lay points along it evenly, ~1.5 samples apart
    let Q = P;
    for (let pass = 0; pass < 3; pass++) {
      const m = Q.length;
      Q = Q.map((_, i) => { let ax = 0, ay = 0; for (let k = -2; k <= 2; k++) { const q = Q[(i + k + m) % m]; ax += q[0]; ay += q[1]; } return [ax / 5, ay / 5]; });
    }
    const out = []; let acc = 0; const stepG = 1.5;
    for (let i = 0; i < Q.length; i++) {
      const a = Q[i], b = Q[(i + 1) % Q.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (acc <= l) { const t = l ? acc / l : 0; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); acc += stepG; }
      acc -= l;
    }
    // to canvas px; and each point's outward normal (the side the distance grows on)
    const k = cv.width / W / s; // canvas px per sample
    const ox = MARGIN * W * (cv.width / W), oy = MARGIN * H * (cv.height / H);
    const m = out.length, pts = new Array(m);
    let sgn = 0;
    for (let i = 0; i < m; i++) {
      const a = out[(i - 2 + m) % m], b = out[(i + 2) % m];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const p = out[i];
      pts[i] = { x: p[0] * k - ox, y: p[1] * k - oy, nx: -ty, ny: tx, g: p };
      if (i % 7 === 0) {
        const q1 = [Math.round(p[0] - ty * 4), Math.round(p[1] + tx * 4)], q2 = [Math.round(p[0] + ty * 4), Math.round(p[1] - tx * 4)];
        const d1 = D[Math.min(gh - 1, Math.max(0, q1[1])) * gw + Math.min(gw - 1, Math.max(0, q1[0]))], d2 = D[Math.min(gh - 1, Math.max(0, q2[1])) * gw + Math.min(gw - 1, Math.max(0, q2[0]))];
        sgn += d1 > d2 ? 1 : -1;
      }
    }
    if (sgn < 0) for (const p of pts) { p.nx = -p.nx; p.ny = -p.ny; }
    return pts;
  }

  /* ---- the strokes ---- */
  const YEL = ['#ffd200', '#ffe23a', '#ffcc00', '#fff06a'];
  function draw(out) {
    const w = cv.width, h = cv.height, u = h / 450; // u: 1 at a 900px-tall picture
    g.clearRect(0, 0, w, h);
    if (!outline || out <= 0) return;
    const L = outline, m = L.length, R = rng(hand * 7919 + 13);
    // drawn on from his crown downward as `out` runs 0 → 1
    const reach = -0.08 * h + out * 1.35 * h;
    const at = (i, off) => { const p = L[((i % m) + m) % m]; return [p.x + p.nx * off, p.y + p.ny * off]; };
    g.lineCap = 'round'; g.lineJoin = 'round';
    const stroke = (P, width, col) => {
      if (P.length < 2) return;
      // a Catmull-Rom curve through every point, so each swing reaches as far as the pen went
      g.strokeStyle = col; g.lineWidth = width; g.beginPath(); g.moveTo(P[0][0], P[0][1]);
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
        g.bezierCurveTo(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]);
      }
      g.stroke();
    };
    const visible = pt => pt[1] < reach + (R() - 0.5) * 30 * u && pt[0] > -60 * u && pt[0] < w + 60 * u && pt[1] > -60 * u && pt[1] < h + 60 * u;

    // the zigzag scribble: the pen swings between the inner and outer edges of a band while it
    // travels round him, each swing its own length and reach; now and then it lifts
    const scribble = (lo, hi, stepLo, stepHi, width, cols, lift) => {
      const wob = wobble(R), band = wobble(R, 2);
      let i = Math.floor(R() * m), travelled = 0, side = 0, run = [];
      const flush = () => { if (run.length > 1) stroke(run, width * (0.75 + R() * 0.5), cols[Math.floor(R() * cols.length)]); run = []; };
      const per = 1.5 * (cv.width / W) / (MAXG / Math.max(W, H) / (1 + 2 * MARGIN)); // canvas px between outline points
      while (travelled < m) {
        const adv = Math.max(1, Math.round(((stepLo + R() * (stepHi - stepLo)) * u) / per));
        i += adv; travelled += adv;
        const swell = 1 + 0.35 * band(i * 3);
        const off = side ? (hi * swell - R() * (hi - lo) * 0.45) * u : (lo + R() * (hi - lo) * 0.2) * u;
        const p = at(i, off + wob(i * 2) * 4 * u);
        side ^= 1;
        if (!visible(p)) { flush(); continue; }
        run.push(p);
        if (run.length > 40 && R() < lift) { flush(); i -= Math.round(adv * (1 + R() * 2)); travelled -= adv; } // lift, and start again a little back
      }
      flush();
    };
    // (each band starts under him, so the line runs right up to his edge)
    scribble(-8, 26, 7, 13, 6 * u, ['#ffd200', '#ffcf00'], 0.05);
    scribble(-6, 17, 5, 10, 3.4 * u, ['#ffe23a', '#ffd84a'], 0.08);
    scribble(4, 34, 10, 20, 2.2 * u, ['#fff06a', '#ffe23a'], 0.1);

    // the loose outline loops further out: each a single long line that runs part of the way round,
    // wobbling in and out, its ends overshooting
    for (let k = 0; k < 4; k++) {
      const wob = wobble(R, 3), off0 = (30 + R() * 10) * u, len = Math.floor(m * (0.35 + R() * 0.55)), i0 = Math.floor(R() * m);
      let run = [];
      for (let j = 0; j <= len; j += 3) {
        const tail = Math.min(j, len - j) / 30, sw = Math.min(1, tail);
        const p = at(i0 + j, off0 + wob((i0 + j) * 1.3) * 9 * u + (1 - sw) * 10 * u * (R() - 0.3));
        if (!visible(p)) { if (run.length > 1) stroke(run, (2.6 + R() * 1.6) * u, YEL[k % YEL.length]); run = []; continue; }
        run.push(p);
      }
      if (run.length > 1) stroke(run, (2.6 + R() * 1.6) * u, YEL[k % YEL.length]);
    }
    tex.needsUpdate = true;
  }

  // remake the outline when his shape on screen changed (at most 24 a second, each time with a
  // new hand); redraw the strokes when how much of the line shows changed
  function update(cam, rotY, out, now = performance.now()) {
    const e = cam.projectionMatrix.elements, wm = cam.matrixWorld.elements;
    const now5 = [rotY, e[0], e[5], e[8], e[9], wm[12], wm[13], wm[14], W, H];
    if (out <= 0) { if (drawnOut !== 0) { draw(0); drawnOut = 0; } pending = false; return; }
    // (a change too small to see is not a turn: the springs settle for a long time)
    const moved = !lastKey || now5.some((v, i) => Math.abs(v - lastKey[i]) > (i === 0 ? 0.0025 : i >= 8 ? 0.5 : 2e-4 * Math.max(1, Math.abs(lastKey[i]))));
    if (moved || !outline) {
      if (now - lastAt < 1000 / 24 && outline) { pending = true; }
      else {
        const first = !outline;
        outline = silhouette(cam, rotY); lastKey = now5; lastAt = now; pending = false;
        if (!first) hand++;
        draw(out); drawnOut = out; return;
      }
    } else pending = false;
    if (out !== drawnOut) { draw(out); drawnOut = out; }
  }
  // lay the strokes down behind whatever is drawn next
  function render() { renderer.render(sheetScene, sheetCam); }

  return { setGeometry, resize, update, render, isPending: () => pending, canvas: cv };
}
