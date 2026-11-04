import * as THREE from 'three';

/* Hairline look for real meshes, in three passes.

   1. G-buffer. Every mesh writes its view-space normal (xy), its object id plus a
      shading value, and its depth into one half-float target. The shading value is
      n·l of a second, smoother "form" normal (baked offline from the 1.2M-triangle
      scan: a Gaussian plane fit over a ~6 cm ball), under a light just above the eye.
      Muscles survive in that normal; pores, chisel marks and scan noise do not.
   2. Valleys. For every pixel of the figure, how strongly it is a valley of that
      shading, read at two widths: the image-space suggestive contours of DeCarlo et
      al. (2003). That is where the form turns away: the edge of a pectoral, the
      grooves of the rectus abdominis, the deltoid.
   3. Lines. Compare each pixel with its neighbours one stroke away and draw, in
      Hairline's hierarchy:
        the silhouette against the plate (hi when it is chosen), an occluding
        contour inside the figure (another solid, or one part in front of another by
        more than ~2 cm once the surface's own slope is taken out), a crease (the
        surface turns by more than the Detail angle), and the muscle lines (the
        crest of the valley map). One width for all, measured as a distance to the
        boundary so they are antialiased alike; Hairline's inks: edge outside, mid in.
      Everything else is the plate colour, so solids stay opaque (rule 06) and the
      stroke is the only highlight (rule 04).                                       */

// Hairline's own palette (@lucasmarkes/hairline LIGHT / DARK): edge for the silhouette,
// mid for every stroke inside it, hi for what is chosen. The plate is the page colour,
// as Hairline asks when the background is not its white or #08090a.
const THEMES = {
  light: { plate: '#f4f2eb', hi: '#232327', edge: '#a4a4ac', mid: '#c3c3c9', lo: '#e0e0e4' },
  dark:  { plate: '#131311', hi: '#d0d6e0', edge: '#5b5d64', mid: '#3e3e44', lo: '#29292d' },
};
// Hairline exactly, plates included: for a page whose ground is Hairline's own
const HAIRLINE = {
  light: { plate: '#ffffff', hi: '#232327', edge: '#a4a4ac', mid: '#c3c3c9', lo: '#e0e0e4' },
  dark:  { plate: '#08090a', hi: '#d0d6e0', edge: '#5b5d64', mid: '#3e3e44', lo: '#29292d' },
};

const idVert = /* glsl */`
  #ifdef HAS_FORM
  attribute vec3 _formnormal;
  #endif
  uniform float uDepthBias;
  varying vec3 vN; varying float vD; varying float vF;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vD = -mv.z - uDepthBias;   // a bias keeps the depth small, where half floats are fine
    #ifdef HAS_FORM
    vec3 fn = normalize(normalMatrix * normalize(_formnormal));
    vF = max(0.0, dot(fn, normalize(vec3(-0.15, 0.3, 1.0))));   // n·l, the light just above the eye
    // the body only: hair and face keep their own lines, the rock base is not anatomy
    float body = smoothstep(0.07, 0.1, position.y) * (1.0 - smoothstep(0.84, 0.865, position.y));
    vF = mix(1.0, vF, body);
    #else
    vF = 1.0;
    #endif
    gl_Position = projectionMatrix * mv;
  }`;
const idFrag = /* glsl */`
  uniform float uId, uFill; varying vec3 vN; varying float vD; varying float vF;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    // the fraction beside the id: the form shading, or 0.45 for a skeleton fill
    gl_FragColor = vec4(n.xy, uId + (uFill > 0.5 ? 0.45 : clamp(vF, 0.0, 1.0) * 0.9), vD);
  }`;

const common = /* glsl */`
  uniform sampler2D tN; uniform vec2 uTexel;
  varying vec2 vUv;
  float oid(vec4 s) { return floor(s.b + 0.002); }
  float shade(vec4 s) { return (s.b - oid(s)) / 0.9; }
`;

// pass 2: suggestive-contour strength of the form shading, on the figure (id 1) only.
// DeCarlo et al.'s image-space test: clearly darker than the brightest pixel around it,
// and darker than few of its neighbours. Off the figure counts as dark (n·v has fallen
// to 0 at the silhouette), so the band just inside the outline is not taken for a valley.
const valleyFrag = /* glsl */`
  ${common}
  uniform float uFormR;
  void main() {
    vec4 c = texture2D(tN, vUv);
    float d = 0.0;
    if (c.a > 0.0 && oid(c) < 1.5) {
      float f = shade(c);
      for (int k = 0; k < 2; k++) {
        float R = uFormR * (k == 0 ? 1.0 : 2.0);
        float fmax = f, darker = 0.0;
        for (int i = 0; i < 16; i++) {
          float a = float(i) * 0.392699 + (i >= 8 ? 0.19635 : 0.0);
          vec4 s = texture2D(tN, vUv + vec2(cos(a), sin(a)) * R * (i >= 8 ? 1.0 : 0.5) * uTexel);
          float v = (s.a <= 0.0 || oid(s) > 1.5) ? 0.0 : shade(s);
          fmax = max(fmax, v);
          darker += v < f ? 1.0 : 0.0;
        }
        d = max(d, (fmax - f) * (k == 0 ? 1.0 : 0.7) * (1.0 - smoothstep(0.06, 0.25, darker / 16.0)));
      }
    }
    gl_FragColor = vec4(d, 0.0, 0.0, 1.0);
  }`;

const lineFrag = /* glsl */`
  ${common}
  uniform sampler2D tV; uniform float uR;
  uniform float uCrease, uDepth, uHotLo, uHotHi, uForm, uFormOn, uDebug, uWorldPx, uReach, uCrest;
  uniform vec3 cPlate, cHi, cEdge, cMid, cLo;
  uniform float uHair, uMerge, uAlpha;
  uniform float uPrint, uPrintT, uGrain, uGrainR, uPrintBlur, uHollow; uniform vec3 uLight;
  // grain for the screen print: a hash per pixel, and value noise for blotchy edges
  float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y); }
  bool isFill(vec4 s) { float i = oid(s), f = s.b - i; return s.a > 0.0 && i > 1.5 && f > 0.3 && f < 0.6; }
  bool isHot(float i) { return i > uHotLo - 0.5 && i < uHotHi + 0.5; }
  vec3 nrm(vec4 s) { return vec3(s.xy, sqrt(max(0.0, 1.0 - dot(s.xy, s.xy)))); }
  // the valley map, lightly blurred so speckle does not become a crest of its own
  float V(vec2 uv) {
    vec2 o = vec2(uR * 0.9) * uTexel;
    return 0.4 * texture2D(tV, uv).r + 0.15 * (texture2D(tV, uv + vec2(o.x, 0.0)).r + texture2D(tV, uv - vec2(o.x, 0.0)).r
                                             + texture2D(tV, uv + vec2(0.0, o.y)).r + texture2D(tV, uv - vec2(0.0, o.y)).r);
  }
  // the turn of the surface across uv: 1 − cos of the angle between the normals at uv ± d,
  // or 0 when either side is off this solid or across a fold (that is a contour's job)
  float turnAt(vec2 uv, vec2 d, float id, float jump) {
    vec4 a = texture2D(tN, uv + d), b = texture2D(tN, uv - d);
    if (a.a <= 0.0 || b.a <= 0.0 || abs(oid(a) - id) > 0.5 || abs(oid(b) - id) > 0.5) return 0.0;
    if (abs(a.a - b.a) > 2.0 * jump) return 0.0;
    return 1.0 - dot(nrm(a), nrm(b));
  }
  void main() {
    vec4 c = texture2D(tN, vUv);
    bool cb = c.a <= 0.0;
    float sil = 0.0, occ = 0.0, cre = 0.0, hot = 0.0, hotIn = 0.0, frm = 0.0;
    float silOwn = 0.0, partOwn = 0.0;   // Hairline style: an outline whose owner is a solid, not a skeleton fill
    bool cFill = isFill(c);
    float id = oid(c);
    vec3 nc = nrm(c);
    // Outline and contours, antialiased analytically and of one width at any angle.
    // Sixteen taps on a ring of radius R: the share f of taps across a boundary gives
    // the distance to it, d = R·cos(π·f) (exact for a straight edge), and the ink is a
    // band of the stroke's width with a one-pixel ramp.
    //   outline  centred on the boundary (half inside, half outside)
    //   part     where two parts meet, centred the same way
    //   contour  one part of a solid in front of another: on the near side only, the
    //            way a pen follows the edge of the part in front, never on both sides
    float R = 2.0 * uR + 1.5, nSil = 0.0, nOcc = 0.0, nPart = 0.0;
    // the depth slope of the surface at this pixel, from its normal (orthographic eye):
    // a smooth surface lands on this plane; a fold in front of another part does not
    vec2 slope = nc.xy / max(nc.z, 0.25);
    // near the outline the surface is seen edge-on and the plane guess fails: ask for a
    // bigger jump there (2 cm facing the eye, up to 8 cm edge-on)
    float jump = uDepth * mix(4.0, 1.0, smoothstep(0.25, 0.6, nc.z));
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 0.392699;
      vec2 dir = vec2(cos(a), sin(a));
      vec4 n = texture2D(tN, vUv + dir * R * uTexel);
      bool nb = n.a <= 0.0;
      if (cb && nb) continue;
      if (cb != nb) {
        nSil += 1.0;
        if (isHot(cb ? oid(n) : id)) hot = 1.0;
        if (!(cb ? isFill(n) : cFill)) silOwn = 1.0;
        continue;
      }
      // the chosen part's whole outline is bright, also where it lies over another part:
      // the side that is nearer owns the line
      bool near = n.a > c.a;
      if (abs(id - oid(n)) > 0.5) {                                               // two parts meet: always a line
        nPart += 1.0;
        if (near ? isHot(id) : isHot(oid(n))) hotIn = 1.0;
        if (!(near ? cFill : isFill(n))) partOwn = 1.0;
        continue;
      }
      if (n.a - (c.a + dot(slope, dir * R * uWorldPx)) > jump) { nOcc += 1.0; if (isHot(id)) hotIn = 1.0; } // this part in front of another
    }
    if (nSil > 0.0) sil = clamp(uR + 0.5 - R * cos(3.14159265 * min(nSil / 16.0, 0.5)), 0.0, 1.0);
    if (nOcc > 0.0) occ = clamp(2.0 * uR + 0.5 - R * cos(3.14159265 * min(nOcc / 16.0, 0.5)), 0.0, 1.0);
    // where two parts meet (platter rim, platter on base, David's rock on the platter) the
    // line is centred like the outline and never gives way: it holds at any Detail
    float part = nPart > 0.0 ? clamp(uR + 0.5 - R * cos(3.14159265 * min(nPart / 16.0, 0.5)), 0.0, 1.0) : 0.0;

    // Creases: how far the surface turns across this pixel, read as the angle between
    // the normals either side of it, in eight directions, at two reaches: far enough
    // (rf) to catch a rounded fold such as a foot meeting the rock, and near (rn) to put
    // the line on the fold's sharpest point. Only the crest is inked (not beaten one
    // stroke further on either side), so any fold draws as one stroke.
    if (!cb) {
      float rf = max(2.0, 1.5 * uR) * uReach, rn = 1.0, best = 0.0;
      vec2 bdir = vec2(1.0, 0.0);
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.392699;
        vec2 dir = vec2(cos(a), sin(a));
        float t = turnAt(vUv, dir * rf * uTexel, id, jump);
        if (t > best) { best = t; bdir = dir; }
      }
      if (best > uCrease) {
        vec2 o = bdir * max(1.0, 2.0 * uR) * uCrest * uTexel, df = bdir * rf * uTexel, dn = bdir * rn * uTexel;
        float here = best + 0.5 * turnAt(vUv, dn, id, jump);
        float tp = turnAt(vUv + o, df, id, jump) + 0.5 * turnAt(vUv + o, dn, id, jump);
        float tm = turnAt(vUv - o, df, id, jump) + 0.5 * turnAt(vUv - o, dn, id, jump);
        // with the merge pass the whole fold band goes through: the merge draws one
        // stroke at its middle, which a one-pixel crest cannot give it along a slant
        if ((here >= tp && here >= tm) || uMerge > 0.5) cre = smoothstep(uCrease, uCrease * 1.25, best);
      }
    }
    if (!cb) {
      // muscle lines: keep only the crest of the valley map, across its gradient
      float v = V(vUv);
      if (uFormOn > 0.5 && v > uForm) {
        float step = max(1.0, uR * 1.5);
        vec2 dx = vec2(step, 0.0) * uTexel, dy = vec2(0.0, step) * uTexel;
        vec2 g = vec2(V(vUv + dx) - V(vUv - dx), V(vUv + dy) - V(vUv - dy));
        float gl = length(g);
        vec2 dir = gl > 1e-6 ? g / gl : vec2(1.0, 0.0);
        vec2 o = dir * max(1.0, uR * 2.0) * uTexel;            // a crest band one stroke wide, like the outline
        if (v >= V(vUv + o) && v >= V(vUv - o)) frm = smoothstep(uForm, uForm * 1.5, v);
      }
    }
    // Hairline's hierarchy: the silhouette in edge, every line inside it in mid, and hi
    // for what the pointer chose. Inside lines give way within a stroke or two of the
    // outline, so two lines never merge into one twice as thick.
    float inner = max(max(cre, frm), occ) * (1.0 - step(0.5, nSil));
    // a skeleton fill (the leaves of an interface) sits in lo, Hairline's colour for an
    // unlit dot; every other surface is the plate
    float fr = cb ? 0.0 : c.b - id;
    vec3 col = (id > 1.5 && fr > 0.3 && fr < 0.6) ? cLo : cPlate;
    float ink = 0.0;   // how much of this pixel is line: the merge pass reads it
    if (uHair > 0.5) {
      // Hairline's hierarchy: every solid has its silhouette in edge, where it meets the
      // plate and where it lies over another solid; its creases in lo; a skeleton fill has
      // no stroke of its own, like Hairline's dots; the chosen thing's outline is hi
      col = mix(col, cLo, max(cre, frm) * (1.0 - step(0.5, nSil)));
      float own = max(part, occ * (1.0 - step(0.5, nSil)));
      col = mix(col, mix(mix(cLo, cEdge, max(partOwn, occ > 0.0 && !cFill ? 1.0 : 0.0)), cHi, hotIn), own);
      col = mix(col, mix(mix(cLo, cEdge, silOwn), cHi, hot), sil);
      float creI = max(cre, frm) * (1.0 - step(0.5, nSil));
      ink = max(max(creI, own), sil);
      if (uMerge > 0.5) {
        // the merge pass wants each line's own colour, not its blend with the plate
        vec3 lc = cLo; float b = creI;
        if (own >= b) { lc = mix(mix(cLo, cEdge, max(partOwn, occ > 0.0 && !cFill ? 1.0 : 0.0)), cHi, hotIn); b = own; }
        if (sil >= b) lc = mix(mix(cLo, cEdge, silOwn), cHi, hot);
        col = lc;
      }
    } else {
      col = mix(col, cMid, inner);
      col = mix(col, mix(cMid, cHi, hotIn), max(part, occ * hotIn));
      col = mix(col, mix(cEdge, cHi, hot), sil);
      ink = max(max(inner, part), sil);
    }
    // Print: a silkscreen of a photograph, as Warhol printed his Marilyn. The light is
    // thresholded into two tones, plate where it is lit and ink where it is not, with no
    // tone between; the threshold is shaken by grain, so the edge of each black mass is
    // ragged, and the hollows (the valley map: eyes, lips, the folds of the hair) print
    // black too. The outline stays; the drawn folds give way to the masses.
    if (uPrint > 0.5 && !cb) {
      vec2 px = vUv / uTexel;
      // the light on the form, not on every facet: normals averaged over a few pixels
      // (on this solid only), half and half with the model's own smooth form shading
      vec3 na = nc; float wn = 1.0;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5236;
        for (int r = 1; r <= 2; r++) {
          vec4 s = texture2D(tN, vUv + vec2(cos(a), sin(a)) * uPrintBlur * float(r) * 0.5 * uTexel);
          if (s.a > 0.0 && abs(oid(s) - id) < 0.5) { na += nrm(s); wn += 1.0; }
        }
      }
      na = normalize(na / wn);
      float lit = 0.6 * (dot(na, normalize(uLight)) * 0.5 + 0.5) + 0.4 * shade(c);
      // the edge of a mass shaken by grain, coarse more than fine, so it is ragged, not speckled
      float jit = (vnoise(px / uGrainR) - 0.5) * 0.16 + (vnoise(px / (uGrainR * 0.3)) - 0.5) * 0.07;
      float ink = step(lit, uPrintT + jit * uGrain);
      // and the deep hollows only: the eyes, the lips, the nostrils, the deepest folds
      float hollow = smoothstep(uForm * uHollow, uForm * uHollow * 1.4, V(vUv) + (vnoise(px / uGrainR) - 0.5) * uForm * 0.4 * uGrain);
      ink = max(ink, step(0.5, hollow));
      col = mix(cPlate, cEdge, ink);
      col = mix(col, cEdge, max(sil, occ * (1.0 - step(0.5, nSil))));
    }
    if (uDebug > 0.5 && !cb) col = mix(cPlate, cHi, clamp(V(vUv) * 8.0, 0.0, 1.0));
    gl_FragColor = vec4(col, uMerge > 0.5 ? ink : 1.0);   // the merge pass reads ink from alpha
    // transparent: off the solids only the outline's own ink is painted, so the picture
    // can lie over other drawings (straight alpha: the renderer is not premultiplied)
    if (uAlpha > 0.5 && cb) gl_FragColor = vec4(uHair > 0.5 ? mix(mix(cLo, cEdge, silOwn), cHi, hot) : mix(cEdge, cHi, hot), sil);
    #include <colorspace_fragment>
  }`;

// pass 4 (merge): lines closer together than a gap become one line of one width.
// Every pixel measures, along four axes, the run of ink through it, bridging gaps of
// plate up to uGap pixels between strokes; across the axis where that run is narrowest
// (across the lines), only the run's middle stroke-width is inked. One line passes
// through unchanged; two or three lines a hair apart become one, at the middle.
const mergeFrag = /* glsl */`
  uniform sampler2D tL, tN; uniform vec2 uTexel; uniform float uR, uGap;
  uniform vec3 cPlate, cLo;
  varying vec2 vUv;
  float oid(vec4 s) { return floor(s.b + 0.002); }
  const int K = 14;
  void main() {
    vec4 g = texture2D(tN, vUv);
    float gid = oid(g), gf = g.b - gid;
    vec3 base = (g.a > 0.0 && gid > 1.5 && gf > 0.3 && gf < 0.6) ? cLo : cPlate;
    vec4 c = texture2D(tL, vUv);
    float bestW = 1e9, bestO = 0.0; vec3 bestC = c.rgb; bool found = false;
    for (int a = 0; a < 4; a++) {
      vec2 d = a == 0 ? vec2(1.0, 0.0) : a == 1 ? vec2(0.0, 1.0) : a == 2 ? vec2(1.0, 1.0) : vec2(1.0, -1.0);
      float L = a < 2 ? 1.0 : 1.41421356;
      // the run of ink through this pixel along the axis, bridging gaps up to uGap:
      // its amount (Σ ink, the width) and its centre (the ink-weighted mean position)
      float sw = c.a, sk = 0.0, strong = c.a; vec3 col = c.rgb;
      float near0 = c.a > 0.02 ? 0.0 : -1.0, near1 = near0;
      for (int sd = 0; sd < 2; sd++) {
        float sg = sd == 0 ? 1.0 : -1.0, gap = 0.0, first = c.a > 0.02 ? 0.0 : -1.0;
        for (int k = 1; k <= K; k++) {
          vec4 s = texture2D(tL, vUv + d * (sg * float(k)) * uTexel);
          if (s.a > 0.02) {
            sw += s.a; sk += s.a * sg * float(k); gap = 0.0;
            if (first < 0.0) first = float(k);
            if (s.a > strong) { strong = s.a; col = s.rgb; }
          } else {
            gap += L;
            if (gap > uGap) break;
          }
        }
        if (sd == 0) near0 = first; else near1 = first;
      }
      if (sw < 0.6) continue;   // too little ink for a line: fold noise, not a stroke
      // off the ink, a pixel belongs to a run only between two strokes no further apart than the gap
      if (c.a <= 0.02 && (near0 < 0.0 || near1 < 0.0 || (near0 + near1 - 1.0) * L > uGap)) continue;
      float W = sw * L, o = sk / sw * L;
      if (W < bestW) { bestW = W; bestO = o; bestC = col; found = true; }
    }
    float cov = found ? clamp(uR + 0.5 - abs(bestO), 0.0, 1.0) : 0.0;
    gl_FragColor = vec4(mix(base, bestC, cov), 1.0);
    #include <colorspace_fragment>
  }`;

const quadVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Dashed guides, the way an exploded drawing runs a dotted line from one layer to the
// next: screen-space strips one stroke wide, in mid, hidden wherever a surface of the
// G-buffer lies in front of them (rule 06: a plate hides the guides behind it).
const guideVert = /* glsl */`
  attribute vec3 aB; attribute vec2 aSide;
  uniform vec2 uRes; uniform float uR, uDepthBias;
  varying float vAlong; varying float vAcross; varying float vD;
  void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
    vec4 here = aSide.y < 0.5 ? a : b;
    vec2 d = (b.xy - a.xy) * uRes * 0.5;
    float len = max(length(d), 1e-4);
    vec2 nrm = vec2(-d.y, d.x) / len;
    float w = uR + 1.0;
    vAlong = aSide.y * len; vAcross = aSide.x * w;
    vec4 mv = modelViewMatrix * vec4(aSide.y < 0.5 ? position : aB, 1.0);
    vD = -mv.z - uDepthBias;
    gl_Position = here + vec4(nrm * aSide.x * w / (uRes * 0.5) * here.w, 0.0, 0.0);
  }`;
const guideFrag = /* glsl */`
  uniform sampler2D tN; uniform vec2 uRes; uniform float uR, uDash, uOpacity;
  uniform vec3 cMid;
  varying float vAlong; varying float vAcross; varying float vD;
  void main() {
    vec4 s = texture2D(tN, gl_FragCoord.xy / uRes);
    if (s.a > 0.0 && s.a < vD - 0.002) discard;               // behind a plate
    float on = step(mod(vAlong, uDash * 4.0), uDash * 1.4);    // a dotted run, 1 on : 3 off
    float a = clamp(uR + 0.5 - abs(vAcross), 0.0, 1.0) * on * uOpacity;
    if (a <= 0.0) discard;
    gl_FragColor = vec4(cMid, a);
    #include <colorspace_fragment>
  }`;

// style 'hairline': Hairline's own palette and line hierarchy (see the line pass)
// lines: 'hairline' for Hairline's line hierarchy · palette: 'hairline' for its plates too
// merge: lines closer than a gap are drawn as one, so every line has one width
// transparent: the ground is left clear (for a canvas made with alpha, not premultiplied)
export function createHairlinePass(renderer, { depthBias = 0, lines = 'study', palette = 'study', merge = false, transparent = false } = {}) {
  const PALETTES = palette === 'hairline' ? HAIRLINE : THEMES;
  const style = lines;
  const opts = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const rt = new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: true });
  // the valley map is read between pixels (gradient, crest test), so it filters linearly
  const rtV = new THREE.WebGLRenderTarget(2, 2, { ...opts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const theme = { ...PALETTES.light };
  const col = k => new THREE.Color(theme[k]);
  const shared = { tN: { value: rt.texture }, uTexel: { value: new THREE.Vector2() } };
  const valleyUniforms = { ...shared, uFormR: { value: 10 } };
  const uniforms = {
    ...shared, tV: { value: rtV.texture }, uR: { value: 1.5 },
    uCrease: { value: 0.12 }, uDepth: { value: 0.004 }, uHotLo: { value: -1 }, uHotHi: { value: -1 }, uWorldPx: { value: 0.001 },
    uForm: { value: 0.02 }, uFormOn: { value: 1 }, uReach: { value: 1 }, uCrest: { value: 1 }, uHair: { value: style === 'hairline' ? 1 : 0 }, uMerge: { value: merge ? 1 : 0 }, uAlpha: { value: transparent ? 1 : 0 },
    uPrint: { value: 0 }, uPrintT: { value: 0.3 }, uGrain: { value: 1 }, uGrainR: { value: 6 }, uPrintBlur: { value: 6 }, uHollow: { value: 2.5 }, uLight: { value: new THREE.Vector3(-0.5, 0.55, 0.7) },
    uDebug: { value: /[?&]debug=form/.test(location.search) ? 1 : 0 },
    cPlate: { value: col('plate') }, cHi: { value: col('hi') }, cEdge: { value: col('edge') },
    cMid: { value: col('mid') }, cLo: { value: col('lo') },
  };
  const quad = (fragmentShader, u) => {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: u, vertexShader: quadVert, fragmentShader, depthTest: false, depthWrite: false,
    })));
    return s;
  };
  const valleyScene = quad(valleyFrag, valleyUniforms);
  const lineScene = quad(lineFrag, uniforms);
  const rtL = new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: false });
  const mergeUniforms = { tL: { value: rtL.texture }, tN: shared.tN, uTexel: shared.uTexel, uR: uniforms.uR, uGap: { value: 4 }, cPlate: uniforms.cPlate, cLo: uniforms.cLo };
  const mergeScene = quad(mergeFrag, mergeUniforms);
  const biasU = { value: depthBias };
  const guideUniforms = {
    tN: shared.tN, uRes: { value: new THREE.Vector2(2, 2) }, uR: uniforms.uR, uDepthBias: biasU,
    uDash: { value: 2 }, uOpacity: { value: 1 }, cMid: uniforms.cMid,
  };
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let ratio = 1, strokePx = 1, reach = 1;
  const clear = new THREE.Color(0, 0, 0);
  const strokeR = () => Math.max(0.75, strokePx * ratio * 0.5);

  return {
    // form: true for a mesh that carries the baked _formnormal attribute
    // fill: true for a skeleton leaf, painted lo instead of the plate
    material(id, { form = false, fill = false } = {}) {
      return new THREE.ShaderMaterial({
        uniforms: { uId: { value: id }, uFill: { value: fill ? 1 : 0 }, uDepthBias: biasU },
        vertexShader: idVert, fragmentShader: idFrag, side: THREE.DoubleSide,
        defines: form ? { HAS_FORM: '' } : {},
      });
    },
    setSize(w, h, pixelRatio) {
      rt.setSize(w, h); rtV.setSize(w, h); rtL.setSize(w, h); ratio = pixelRatio;
      shared.uTexel.value.set(1 / w, 1 / h);
      guideUniforms.uRes.value.set(w, h);
      guideUniforms.uDash.value = 1.4 * pixelRatio;
      uniforms.uR.value = strokeR();
      valleyUniforms.uFormR.value = 5 * ratio * reach;      // ~5 CSS px: a muscle valley on screen
    },
    // detail: the turn that counts as a crease, 60° at 0 down to 18° at 1
    // muscle 0: no muscle lines; 1: every clear valley
    setLook({ detail, stroke, muscle }) {
      strokePx = stroke;
      uniforms.uR.value = strokeR();
      uniforms.uCrease.value = 1 - Math.cos(THREE.MathUtils.degToRad(THREE.MathUtils.lerp(60, 18, detail)));
      uniforms.uForm.value = THREE.MathUtils.lerp(0.09, 0.03, muscle);
      uniforms.uFormOn.value = muscle > 0.001 ? 1 : 0;
    },
    setTheme(name) {
      Object.assign(theme, PALETTES[name]);
      for (const k of ['plate', 'hi', 'edge', 'mid', 'lo']) uniforms['c' + k[0].toUpperCase() + k.slice(1)].value.set(theme[k]);
    },
    // the silkscreen look: on, the threshold of light below which it prints black, how much
    // grain shakes that edge and how coarse (px), and the light (view space: x right, y up, z to the eye)
    // blur: over how many px the light is read (the masses' smoothness); hollow: how deep a
    // valley must be, in multiples of the muscle threshold, to print black
    setPrint({ on = true, threshold = 0.3, grain = 1, grainSize = 6, light = [-0.5, 0.55, 0.7], blur = 6, hollow = 2.5 } = {}) {
      uniforms.uPrint.value = on ? 1 : 0; uniforms.uPrintT.value = threshold; uniforms.uGrain.value = grain;
      uniforms.uGrainR.value = grainSize * ratio; uniforms.uLight.value.set(...light);
      uniforms.uPrintBlur.value = blur * ratio; uniforms.uHollow.value = hollow;
    },
    // any five inks of one's own: { plate, hi, edge, mid, lo }
    setColors(c) {
      Object.assign(theme, c);
      for (const k of ['plate', 'hi', 'edge', 'mid', 'lo']) uniforms['c' + k[0].toUpperCase() + k.slice(1)].value.set(theme[k]);
    },
    // world units per buffer pixel, so the depth plane can be extended across the ring
    setScale(worldPerPx) { uniforms.uWorldPx.value = worldPerPx; },
    // reach: how far, in multiples of the usual few pixels, a fold or a valley is looked
    // for. Seen close, the same fold spans many more pixels and turns too little across a
    // few of them to show: a longer reach measures it over the same stretch of surface.
    // crest: how far either side a fold's crest is checked, as a power of the reach
    setReach(k, crest = 0.5) { reach = k; uniforms.uReach.value = k; uniforms.uCrest.value = Math.pow(k, crest); valleyUniforms.uFormR.value = 5 * ratio * reach; },
    // depth: how far behind (in the scene's units) a part must lie for its edge to be a contour
    setDepth(v) { uniforms.uDepth.value = v; },
    // view depth subtracted before it is stored, so half floats stay precise far from the eye
    setDepthBias(v) { biasU.value = v; },
    // segments: [[a, b], ...] in the parent's space; returns a mesh to add to the scene
    // graph (for its transform) and to pass to render as the overlay
    guides(segments) {
      const n = segments.length, pos = new Float32Array(n * 12), bb = new Float32Array(n * 12), side = new Float32Array(n * 8), idx = [];
      segments.forEach(([a, b], i) => {
        for (let k = 0; k < 4; k++) {
          pos.set([a.x, a.y, a.z], (i * 4 + k) * 3); bb.set([b.x, b.y, b.z], (i * 4 + k) * 3);
          side.set([k % 2 ? 1 : -1, k < 2 ? 0 : 1], (i * 4 + k) * 2);
        }
        const o = i * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aB', new THREE.BufferAttribute(bb, 3));
      g.setAttribute('aSide', new THREE.BufferAttribute(side, 2));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        uniforms: guideUniforms, vertexShader: guideVert, fragmentShader: guideFrag,
        transparent: true, depthTest: false, depthWrite: false,
      }));
      m.frustumCulled = false;
      m.layers.set(1);   // kept out of the G-buffer
      return m;
    },
    setGuideOpacity(a) { guideUniforms.uOpacity.value = a; },
    // hot: an id, or [lo, hi], a run of ids that is one thing
    render(scene, camera, hot, overlay) {
      const [lo, hi] = Array.isArray(hot) ? hot : [hot || -1, hot || -1];
      uniforms.uHotLo.value = lo; uniforms.uHotHi.value = hi;
      renderer.setClearColor(clear, 0);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(rtV); renderer.render(valleyScene, quadCam);
      if (merge) {
        // lines whose middles are closer than ~3½ CSS px become one
        mergeUniforms.uGap.value = Math.max(2, 3.5 * ratio - 2 * uniforms.uR.value);
        renderer.setRenderTarget(rtL); renderer.render(lineScene, quadCam);
        renderer.setRenderTarget(null); renderer.render(mergeScene, quadCam);
      } else { renderer.setRenderTarget(null); renderer.render(lineScene, quadCam); }
      if (overlay && guideUniforms.uOpacity.value > 0.001) {
        const ac = renderer.autoClear, mask = camera.layers.mask;
        renderer.autoClear = false; camera.layers.set(1);
        renderer.render(overlay, camera);
        camera.layers.mask = mask; renderer.autoClear = ac;
      }
    },
  };
}
