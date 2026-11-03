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
        crest of the valley map). All in one ink and one width: the first three are
        measured as a distance to their boundary, so they are antialiased alike.
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
  varying vec3 vN; varying float vD; varying float vF;
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
    #else
    vF = 1.0;
    #endif
    gl_Position = projectionMatrix * mv;
  }`;
const idFrag = /* glsl */`
  uniform float uId; varying vec3 vN; varying float vD; varying float vF;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    gl_FragColor = vec4(n.xy, uId + clamp(vF, 0.0, 1.0) * 0.9, vD);
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
  uniform float uCrease, uDepth, uHot, uForm, uFormOn, uDebug, uWorldPx;
  uniform vec3 cPlate, cHi, cEdge, cMid, cLo;
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
    float sil = 0.0, occ = 0.0, cre = 0.0, hot = 0.0, frm = 0.0;
    float id = oid(c);
    vec3 nc = nrm(c);
    // Outline and contours, antialiased analytically and of one width at any angle.
    // Sixteen taps on a ring of radius R: the share f of taps across a boundary gives
    // the distance to it, d = R·cos(π·f) (exact for a straight edge), and the ink is a
    // band of the stroke's width with a one-pixel ramp.
    //   outline  centred on the boundary (half inside, half outside)
    //   contour  on the near side only, the way a pen follows the edge of the part in
    //            front, so it is never inked on both sides of a fold
    float R = 2.0 * uR + 1.5, nSil = 0.0, nOcc = 0.0;
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
        if (abs((cb ? oid(n) : id) - uHot) < 0.5) hot = 1.0;
        continue;
      }
      if (abs(id - oid(n)) > 0.5) { if (c.a < n.a) nOcc += 1.0; continue; }       // this solid in front of another
      if (n.a - (c.a + dot(slope, dir * R * uWorldPx)) > jump) nOcc += 1.0;        // this part in front of another
    }
    if (nSil > 0.0) sil = clamp(uR + 0.5 - R * cos(3.14159265 * min(nSil / 16.0, 0.5)), 0.0, 1.0);
    if (nOcc > 0.0) occ = clamp(2.0 * uR + 0.5 - R * cos(3.14159265 * min(nOcc / 16.0, 0.5)), 0.0, 1.0);

    // Creases: how far the surface turns across this pixel, read as the angle between
    // the normals one stroke either side, in eight directions. Only the crest of that
    // turn is inked (it must not be beaten one stroke further on either side), so a
    // rounded fold, which turns over a wide band, still draws as one stroke.
    if (!cb) {
      float rc = max(1.0, uR), best = 0.0;
      vec2 bdir = vec2(1.0, 0.0);
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.392699;
        vec2 dir = vec2(cos(a), sin(a));
        float t = turnAt(vUv, dir * rc * uTexel, id, jump);
        if (t > best) { best = t; bdir = dir; }
      }
      if (best > uCrease) {
        vec2 o = bdir * max(1.0, 2.0 * uR) * uTexel, d = bdir * rc * uTexel;
        float tp = turnAt(vUv + o, d, id, jump), tm = turnAt(vUv - o, d, id, jump);
        if (best >= tp && best >= tm) cre = smoothstep(uCrease, uCrease * 1.25, best);
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
    // one ink for every line: outline, contours, creases and muscle lines alike. Inside
    // lines give way within a stroke or two of the outline, so two lines never merge
    // into one twice as thick.
    float inner = max(max(cre, frm), occ) * (1.0 - step(0.5, nSil));
    vec3 col = cPlate;
    col = mix(col, cEdge, inner);
    col = mix(col, mix(cEdge, cHi, hot), sil);
    if (uDebug > 0.5 && !cb) col = mix(cPlate, cHi, clamp(V(vUv) * 8.0, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

const quadVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function createHairlinePass(renderer) {
  const opts = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const rt = new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: true });
  // the valley map is read between pixels (gradient, crest test), so it filters linearly
  const rtV = new THREE.WebGLRenderTarget(2, 2, { ...opts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const theme = { ...THEMES.light };
  const col = k => new THREE.Color(theme[k]);
  const shared = { tN: { value: rt.texture }, uTexel: { value: new THREE.Vector2() } };
  const valleyUniforms = { ...shared, uFormR: { value: 10 } };
  const uniforms = {
    ...shared, tV: { value: rtV.texture }, uR: { value: 1.5 },
    uCrease: { value: 0.12 }, uDepth: { value: 0.004 }, uHot: { value: -1 }, uWorldPx: { value: 0.001 },
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

  return {
    // form: true for a mesh that carries the baked _formnormal attribute
    material(id, { form = false } = {}) {
      return new THREE.ShaderMaterial({
        uniforms: { uId: { value: id } }, vertexShader: idVert, fragmentShader: idFrag, side: THREE.DoubleSide,
        defines: form ? { HAS_FORM: '' } : {},
      });
    },
    setSize(w, h, pixelRatio) {
      rt.setSize(w, h); rtV.setSize(w, h); ratio = pixelRatio;
      shared.uTexel.value.set(1 / w, 1 / h);
      uniforms.uR.value = strokeR();
      valleyUniforms.uFormR.value = 5 * ratio;      // ~5 CSS px: a muscle valley on screen
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
      Object.assign(theme, THEMES[name]);
      for (const k of ['plate', 'hi', 'edge', 'mid', 'lo']) uniforms['c' + k[0].toUpperCase() + k.slice(1)].value.set(theme[k]);
    },
    // world units per buffer pixel, so the depth plane can be extended across the ring
    setScale(worldPerPx) { uniforms.uWorldPx.value = worldPerPx; },
    render(scene, camera, hotId) {
      uniforms.uHot.value = hotId || -1;
      renderer.setClearColor(clear, 0);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(rtV); renderer.render(valleyScene, quadCam);
      renderer.setRenderTarget(null); renderer.render(lineScene, quadCam);
    },
  };
}
