import * as THREE from 'three';
import { traceStrokes } from './vectorize.js';

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
        edge  the silhouette against the plate (or hi when it is chosen)
        mid   an occluding contour inside the figure (a depth jump), and the
              muscle lines: the crest of the valley map only (non-maximum
              suppression across it), so each is one stroke wide, like the outline
        lo    a crease: the normal turns sharply
      Everything else is the plate colour, so solids stay opaque (rule 06) and the
      stroke is the only highlight (rule 04).                                       */

const THEMES = {
  light: { plate: '#f4f2eb', hi: '#bc422c', edge: '#4a463e', mid: '#8f887b', lo: '#c4bdb0' },
  dark:  { plate: '#131311', hi: '#e0674f', edge: '#d8d4c8', mid: '#7d796f', lo: '#3f3d37' },
};

const idVert = /* glsl */`
  #ifdef HAS_FORM
  attribute vec3 _formnormal;
  #endif
  varying vec3 vN; varying float vD; varying float vF; varying float vB;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vD = -mv.z;
    #ifdef HAS_FORM
    vec3 fn = normalize(normalMatrix * normalize(_formnormal));
    vF = max(0.0, dot(fn, normalize(vec3(-0.15, 0.3, 1.0))));   // n·l, the light just above the eye
    // the body only: hair and face keep their own lines, the rock base is not anatomy
    float body = smoothstep(0.07, 0.1, position.y) * (1.0 - smoothstep(0.84, 0.865, position.y));
    vF = mix(1.0, vF, body);
    vB = body;
    #else
    vF = 1.0; vB = 0.0;
    #endif
    gl_Position = projectionMatrix * mv;
  }`;
const idFrag = /* glsl */`
  uniform float uId; varying vec3 vN; varying float vD; varying float vF; varying float vB;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    #ifdef BODY_PASS
    gl_FragColor = vec4(vB, 0.0, 0.0, 1.0);          // where the body is, for pruning short lines
    #else
    gl_FragColor = vec4(n.xy, uId + clamp(vF, 0.0, 1.0) * 0.9, vD);
    #endif
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
  uniform sampler2D tV, tB; uniform float uR, uPrune, uMask;
  uniform float uCrease, uDepth, uHot, uForm, uFormOn, uDebug;
  uniform vec3 cPlate, cHi, cEdge, cMid, cLo;
  vec3 nrm(vec4 s) { return vec3(s.xy, sqrt(max(0.0, 1.0 - dot(s.xy, s.xy)))); }
  // the valley map, lightly blurred so speckle does not become a crest of its own
  float V(vec2 uv) {
    vec2 o = vec2(uR * 0.9) * uTexel;
    return 0.4 * texture2D(tV, uv).r + 0.15 * (texture2D(tV, uv + vec2(o.x, 0.0)).r + texture2D(tV, uv - vec2(o.x, 0.0)).r
                                             + texture2D(tV, uv + vec2(0.0, o.y)).r + texture2D(tV, uv - vec2(0.0, o.y)).r);
  }
  void main() {
    vec4 c = texture2D(tN, vUv);
    bool cb = c.a <= 0.0;
    float sil = 0.0, occ = 0.0, cre = 0.0, hot = 0.0, frm = 0.0;
    float id = oid(c);
    vec3 nc = nrm(c);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec4 n = texture2D(tN, vUv + vec2(cos(a), sin(a)) * uR * uTexel);
      bool nb = n.a <= 0.0;
      if (cb && nb) continue;
      if (cb != nb) {
        sil = 1.0;
        if (abs((cb ? oid(n) : id) - uHot) < 0.5) hot = 1.0;
        continue;
      }
      if (abs(id - oid(n)) > 0.5) { occ = 1.0; continue; }        // two solids touching
      occ = max(occ, smoothstep(uDepth, uDepth * 1.8, abs(c.a - n.a)));
    }
    if (!cb) {
      // creases are read closer in, so they stay a thin line instead of a grey patch
      for (int i = 0; i < 4; i++) {
        float a = float(i) * 1.570796 + 0.392699;
        vec4 n = texture2D(tN, vUv + vec2(cos(a), sin(a)) * max(0.75, uR * 0.55) * uTexel);
        if (n.a <= 0.0 || abs(id - oid(n)) > 0.5) continue;
        cre = max(cre, smoothstep(uCrease, uCrease * 1.6, 1.0 - dot(nc, nrm(n))));
      }
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
    // at rest the body's interior lines (muscle lines, creases) are read back, joined and
    // redrawn as smooth vector strokes; here they fade out under them. The outline,
    // contours, hair and face always stay on the GPU.
    float body = step(0.5, texture2D(tB, vUv).r);
    if (uMask > 0.5) {
      gl_FragColor = vec4(step(0.5, frm) * body, step(0.5, cre) * body, 0.0, 1.0);
      return;
    }
    frm *= 1.0 - uPrune * body; cre *= 1.0 - uPrune * body;
    vec3 col = cPlate;
    col = mix(col, cLo, cre);
    col = mix(col, cMid, frm);
    col = mix(col, cMid, occ);
    col = mix(col, mix(cEdge, cHi, hot), sil);
    if (uDebug > 0.5 && !cb) col = mix(cPlate, cHi, clamp(V(vUv) * 8.0, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

const quadVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function createHairlinePass(renderer) {
  const opts = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const rt = new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: true });
  const rtB = new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: true });   // body mask
  const rtM = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }); // prunable lines, read back
  let maskBuf = null, pruneSig = '', strokes = { muscle: [], crease: [] };
  // the valley map is read between pixels (gradient, crest test), so it filters linearly
  const rtV = new THREE.WebGLRenderTarget(2, 2, { ...opts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const theme = { ...THEMES.light };
  const col = k => new THREE.Color(theme[k]);
  const shared = { tN: { value: rt.texture }, uTexel: { value: new THREE.Vector2() } };
  const valleyUniforms = { ...shared, uFormR: { value: 10 } };
  const uniforms = {
    ...shared, tV: { value: rtV.texture }, tB: { value: rtB.texture },
    uPrune: { value: 0 }, uMask: { value: 0 }, uR: { value: 1.5 },
    uCrease: { value: 0.12 }, uDepth: { value: 0.012 }, uHot: { value: -1 },
    uForm: { value: 0.02 }, uFormOn: { value: 1 },
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
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let ratio = 1, strokePx = 1;
  const clear = new THREE.Color(0, 0, 0);
  const strokeR = () => Math.max(0.75, strokePx * ratio * 0.5);

  // Read back the body's interior lines and turn them into joined, smoothed strokes.
  // Runs once per resting pose (see render's sig).
  function traceInterior(scene, camera) {
    const swapped = [];
    scene.traverse(o => { if (o.isMesh && o.material.userData.body) { swapped.push([o, o.material]); o.material = o.material.userData.body; } });
    renderer.setRenderTarget(rtB); renderer.clear(); renderer.render(scene, camera);
    for (const [o, m] of swapped) o.material = m;
    uniforms.uMask.value = 1;
    renderer.setRenderTarget(rtM); renderer.render(lineScene, quadCam);
    uniforms.uMask.value = 0;
    const w = rtM.width, h = rtM.height;
    renderer.readRenderTargetPixels(rtM, 0, 0, w, h, maskBuf);
    strokes = {
      muscle: traceStrokes(maskBuf, 0, w, h, ratio, { minLen: 16, gap: 14 }),
      crease: traceStrokes(maskBuf, 1, w, h, ratio, { minLen: 12, gap: 8 }),
    };
  }

  return {
    // form: true for a mesh that carries the baked _formnormal attribute
    material(id, { form = false } = {}) {
      const make = body => new THREE.ShaderMaterial({
        uniforms: { uId: { value: id } }, vertexShader: idVert, fragmentShader: idFrag, side: THREE.DoubleSide,
        defines: { ...(form ? { HAS_FORM: '' } : {}), ...(body ? { BODY_PASS: '' } : {}) },
      });
      const m = make(false);
      m.userData.body = make(true);                  // swapped in for the body-mask pass
      return m;
    },
    setSize(w, h, pixelRatio) {
      rt.setSize(w, h); rtV.setSize(w, h); rtB.setSize(w, h); rtM.setSize(w, h); ratio = pixelRatio;
      maskBuf = new Uint8Array(w * h * 4); pruneSig = '';
      shared.uTexel.value.set(1 / w, 1 / h);
      uniforms.uR.value = strokeR();
      valleyUniforms.uFormR.value = 5 * ratio;      // ~5 CSS px: a muscle valley on screen
    },
    // detail 0: only the deepest creases; 1: every curl of the hair
    // muscle 0: no muscle lines; 1: every clear valley
    setLook({ detail, stroke, muscle }) {
      strokePx = stroke;
      uniforms.uR.value = strokeR();
      uniforms.uCrease.value = THREE.MathUtils.lerp(0.32, 0.035, detail);
      uniforms.uForm.value = THREE.MathUtils.lerp(0.09, 0.03, muscle);
      uniforms.uFormOn.value = muscle > 0.001 ? 1 : 0;
    },
    colors() { return { ...theme }; },
    setTheme(name) {
      Object.assign(theme, THEMES[name]);
      for (const k of ['plate', 'hi', 'edge', 'mid', 'lo']) uniforms['c' + k[0].toUpperCase() + k.slice(1)].value.set(theme[k]);
    },
    // prune: 0 draws every line on the GPU (moving); 1 hands the body's interior lines to
    // the vector strokes (at rest). sig names the frame (angle + look) so the read-back runs
    // once per resting pose. Returns the strokes when they were just traced, else null.
    render(scene, camera, hotId, { prune = 0, sig = '' } = {}) {
      uniforms.uHot.value = hotId || -1;
      renderer.setClearColor(clear, 0);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(rtV); renderer.render(valleyScene, quadCam);
      let traced = null;
      if (prune > 0 && sig !== pruneSig) { traceInterior(scene, camera); pruneSig = sig; traced = strokes; }
      uniforms.uPrune.value = prune;
      renderer.setRenderTarget(null); renderer.render(lineScene, quadCam);
      return traced;
    },
  };
}
