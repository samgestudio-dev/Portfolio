import * as THREE from 'three';

/* Hairline look for real meshes, in two passes.

   1. Every mesh writes its view-space normal (xy), an object id and its depth
      into one half-float target. Nothing is shaded.
   2. A full-screen pass compares each pixel with eight neighbours one stroke
      away and draws three weights of line, Hairline's hierarchy:
        edge  the silhouette against the plate (or `hi` when it is chosen)
        mid   an occluding contour inside the figure: a depth jump
        lo    a crease: the normal turns sharply
      Everything else is the plate colour, so solids stay opaque (rule 06) and
      the stroke is the only highlight (rule 04).                              */

const THEMES = {
  light: { plate: '#f4f2eb', hi: '#bc422c', edge: '#4a463e', mid: '#8f887b', lo: '#c4bdb0' },
  dark:  { plate: '#131311', hi: '#e0674f', edge: '#d8d4c8', mid: '#7d796f', lo: '#3f3d37' },
};

const idVert = /* glsl */`
  varying vec3 vN; varying float vD;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vD = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const idFrag = /* glsl */`
  uniform float uId; varying vec3 vN; varying float vD;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    gl_FragColor = vec4(n.xy, uId, vD);
  }`;

const lineFrag = /* glsl */`
  uniform sampler2D tN; uniform vec2 uTexel; uniform float uR;
  uniform float uCrease, uDepth, uHot;
  uniform vec3 cPlate, cHi, cEdge, cMid, cLo;
  varying vec2 vUv;
  vec3 nrm(vec4 s) { return vec3(s.xy, sqrt(max(0.0, 1.0 - dot(s.xy, s.xy)))); }
  void main() {
    vec4 c = texture2D(tN, vUv);
    bool cb = c.a <= 0.0;
    float sil = 0.0, occ = 0.0, cre = 0.0, hot = 0.0;
    vec3 nc = nrm(c);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec4 n = texture2D(tN, vUv + vec2(cos(a), sin(a)) * uR * uTexel);
      bool nb = n.a <= 0.0;
      if (cb && nb) continue;
      if (cb != nb) {
        sil = 1.0;
        float id = cb ? n.b : c.b;
        if (abs(id - uHot) < 0.5) hot = 1.0;
        continue;
      }
      if (abs(c.b - n.b) > 0.5) { occ = 1.0; continue; }         // two solids touching
      occ = max(occ, smoothstep(uDepth, uDepth * 1.8, abs(c.a - n.a)));
    }
    // creases are read closer in, so they stay a thin line instead of a grey patch
    if (!cb) for (int i = 0; i < 4; i++) {
      float a = float(i) * 1.570796 + 0.392699;
      vec4 n = texture2D(tN, vUv + vec2(cos(a), sin(a)) * max(0.75, uR * 0.55) * uTexel);
      if (n.a <= 0.0 || abs(c.b - n.b) > 0.5) continue;
      cre = max(cre, smoothstep(uCrease, uCrease * 1.6, 1.0 - dot(nc, nrm(n))));
    }
    vec3 col = cPlate;
    col = mix(col, cLo, cre);
    col = mix(col, cMid, occ);
    col = mix(col, mix(cEdge, cHi, hot), sil);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export function createHairlinePass(renderer) {
  const rt = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
  });
  const theme = { ...THEMES.light };
  const col = k => new THREE.Color(theme[k]);
  const uniforms = {
    tN: { value: rt.texture }, uTexel: { value: new THREE.Vector2() }, uR: { value: 1.5 },
    uCrease: { value: 0.12 }, uDepth: { value: 0.012 }, uHot: { value: -1 },
    cPlate: { value: col('plate') }, cHi: { value: col('hi') }, cEdge: { value: col('edge') },
    cMid: { value: col('mid') }, cLo: { value: col('lo') },
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms, fragmentShader: lineFrag, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  }));
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let ratio = 1, strokePx = 1;
  const clear = new THREE.Color(0, 0, 0);

  return {
    material(id) {
      return new THREE.ShaderMaterial({ uniforms: { uId: { value: id } }, vertexShader: idVert, fragmentShader: idFrag, side: THREE.DoubleSide });
    },
    setSize(w, h, pixelRatio) {
      rt.setSize(w, h); ratio = pixelRatio;
      uniforms.uTexel.value.set(1 / w, 1 / h);
      uniforms.uR.value = Math.max(0.75, strokePx * ratio * 0.5);
    },
    // detail 0 → only the deepest creases; 1 → every curl of the hair
    setLook({ detail, stroke }) {
      strokePx = stroke;
      uniforms.uR.value = Math.max(0.75, strokePx * ratio * 0.5);
      uniforms.uCrease.value = THREE.MathUtils.lerp(0.32, 0.035, detail);
    },
    setTheme(name) {
      Object.assign(theme, THEMES[name]);
      for (const k of ['plate', 'hi', 'edge', 'mid', 'lo']) uniforms['c' + k[0].toUpperCase() + k.slice(1)].value.set(theme[k]);
    },
    render(scene, camera, hotId) {
      uniforms.uHot.value = hotId || -1;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(clear, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
    },
  };
}
