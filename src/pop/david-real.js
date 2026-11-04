/* David, close up, in layers: the same mesh drawn three more ways over his line drawing, each
   with its own strength so a transition can bring them in one after another:

   real     the statue as photographed: white marble under one hard key light from the upper
            left in front, a soft fill, black-and-white (the reference print)
   paint    what was put on him: cyan paint at his eye with a drip, a pink spray at his neck with
            two drips, a yellow smiley on each side of his chest. Painted in his own coordinates,
            so they turn with him and are hidden by him as the real thing would be
   outline  a loud yellow graffiti line around him, a little outside his outline, thick and
            uneven, scrubbed on in streaks (an inverted hull, its push along the normals noisy)

   The real layer (with the paint and outline in it) is rendered to its own picture and laid
   over the line drawing at `real`; the line drawing is skipped once it is fully covered.      */

const GLSL_NOISE = /* glsl */ `
  float h3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }`;

// where the paint goes, in his own units (found by picking on the rendered statue)
export const PAINT = {
  eye: [-0.0385, 0.9284, 0.0286], eyeR: 0.016, eyeDrip: 0.065,
  pink: [-0.0938, 0.8264, -0.0113], pinkR: 0.026, pinkDrip: 0.16,
  smileL: [-0.1327, 0.7414, 0.0214], smileLN: [-0.411, 0.228, 0.883],
  smileR: [-0.0199, 0.7409, 0.0405], smileRN: [-0.068, 0.311, 0.948], smileSize: 0.0175,
};

export function createRealLayers(THREE, renderer, geo) {
  const L = { real: 0, paint: 0, outline: 0 };
  const scene = new THREE.Scene(), group = new THREE.Group();
  scene.add(group);

  // light, fixed to the camera as a photographer's would be: key upper left in front, fill low right
  // (as in the photograph: the key high on the right in front, so his left side, the underside
  // of his chest and his jaw fall into deep shadow; a weak fill from the left keeps those grey;
  // a rim from behind on the left cuts his dark side from the ground; a little sky over all)
  const rig = new THREE.Group();
  const key = new THREE.DirectionalLight(0xffffff, 4.2); key.position.set(1.3, 2.1, 1.5);
  const fill = new THREE.DirectionalLight(0xffffff, 0.28); fill.position.set(-1.8, 0.1, 1.0);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1); rim.position.set(-1.6, 0.9, -1.4);
  for (const l of [key, fill, rim]) { l.target.position.set(0, 0, -1); rig.add(l, l.target); }
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.002;
  Object.assign(key.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 12 });
  scene.add(rig, new THREE.HemisphereLight(0xffffff, 0x0c0c0c, 0.16));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // its own camera: a perspective one, looking up at him as a photographer would
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 40);
  scene.add(cam);

  // the marble, with the paint laid on by where on him a point is
  const U = {
    uPaint: { value: 0 },
    uEye: { value: new THREE.Vector3(...PAINT.eye) }, uEyeR: { value: PAINT.eyeR }, uEyeDrip: { value: PAINT.eyeDrip },
    uPink: { value: new THREE.Vector3(...PAINT.pink) }, uPinkR: { value: PAINT.pinkR }, uPinkDrip: { value: PAINT.pinkDrip },
    uSmL: { value: new THREE.Vector3(...PAINT.smileL) }, uSmR: { value: new THREE.Vector3(...PAINT.smileR) },
    uSmNL: { value: new THREE.Vector3(...PAINT.smileLN).normalize() }, uSmNR: { value: new THREE.Vector3(...PAINT.smileRN).normalize() }, uSmS: { value: PAINT.smileSize },
  };
  const marble = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.5, metalness: 0 });
  marble.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position; vNormalObj = normal;')
      .replace('varying vec3 vP;', 'varying vec3 vP; varying vec3 vNormalObj;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vP; varying vec3 vNormalObj;
        uniform float uPaint, uEyeR, uEyeDrip, uPinkR, uPinkDrip, uSmS;
        uniform vec3 uEye, uPink, uSmL, uSmR, uSmNL, uSmNR;
        ${GLSL_NOISE}
        // a spray of paint: a soft-edged blob, speckled at its rim, and drips running down
        // (drips run down the surface in front of where the paint hit: across, along the surface's
        // horizontal tangent there; in depth, within a band in front of and behind that point)
        float spray(vec3 p, vec3 c, vec3 nh, float r, float drip, float seed) {
          float n = n3(p * 900.0 + seed) * 0.55 + n3(p * 260.0 + seed) * 0.45;
          float d = length(p - c);
          float blob = 1.0 - smoothstep(r * 0.55, r * (1.05 + 0.35 * n), d);
          float specks = step(0.8, n3(p * 1800.0 + seed)) * (1.0 - smoothstep(r, r * 1.9, d));
          float a = max(blob, specks * 0.9);
          vec3 u = normalize(cross(vec3(0.0, 1.0, 0.0), nh));
          float across = dot(p - c, u), depth = dot(p - c, nh), below = c.y - p.y;
          if (depth > -0.025 && depth < 0.08) for (int k = 0; k < 2; k++) {
            float off = (float(k) - 0.5) * r * 0.9 + (seed - 2.0) * 0.001;
            float len = drip * (0.55 + 0.45 * fract(seed * 1.37 + float(k) * 0.61));
            float w = r * 0.085 * (1.0 - 0.4 * clamp(below / len, 0.0, 1.0)) * (0.8 + 0.4 * n3(p * 500.0));
            float line = (1.0 - smoothstep(w, w * 1.35, abs(across - off))) * step(0.0, below) * step(below, len);
            float bead = 1.0 - smoothstep(w * 1.25, w * 1.7, length(vec2(across - off, below - len)));
            a = max(a, max(line, bead));
          }
          return a;
        }
        // a smiley sticker: a yellow disc on the surface, its eyes and its smile in black
        vec4 smiley(vec3 p, vec3 c, vec3 nrm, float s) {
          // (stuck on straight: across level, up upright, whatever the chest's own tilt)
          vec3 nh = normalize(vec3(nrm.x, 0.0, nrm.z));
          vec3 u = normalize(cross(vec3(0.0, 1.0, 0.0), nh)), v = vec3(0.0, 1.0, 0.0);
          vec3 d = p - c; float h = dot(d, nrm);
          vec2 q = vec2(dot(d, u), dot(d, v)) / s;
          float r = length(q);
          if (r > 1.0 || abs(h) > s * 0.45) return vec4(0.0);
          vec3 col = vec3(0.96, 0.80, 0.12) * (0.92 + 0.08 * n3(p * 700.0));
          float ink = 0.0;
          ink = max(ink, 1.0 - smoothstep(0.1, 0.13, length((q - vec2(-0.33, 0.25)) * vec2(1.0, 0.62))));
          ink = max(ink, 1.0 - smoothstep(0.1, 0.13, length((q - vec2(0.33, 0.25)) * vec2(1.0, 0.62))));
          float arc = abs(length(q - vec2(0.0, 0.08)) - 0.56);
          ink = max(ink, (1.0 - smoothstep(0.045, 0.075, arc)) * step(q.y, -0.02));
          ink = max(ink, smoothstep(0.93, 0.97, r) * 0.6);
          return vec4(mix(col, vec3(0.06), ink), 1.0 - smoothstep(0.97, 1.0, r));
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // the stone: weathered marble, not plastic — a mottle, a fine grit, faint veins, and the
          // grime that gathers where it faces down
          float mott = n3(vP * 60.0) * 0.6 + n3(vP * 170.0) * 0.4;
          float grit = n3(vP * 1400.0);
          float vein = 1.0 - smoothstep(0.0, 0.035, abs(n3(vP * vec3(22.0, 9.0, 22.0)) - 0.5));
          float down = clamp(-vNormalObj.y, 0.0, 1.0);
          diffuseColor.rgb *= (0.8 + 0.22 * mott) * (0.9 + 0.12 * grit) * (1.0 - 0.12 * vein) * (1.0 - 0.28 * down);
        }
        {
          float pa = uPaint;
          // paint comes on in a sweep, each patch its own moment, never all at once
          float ae = spray(vP, uEye, normalize(vec3(-0.35, 0.0, 0.94)), uEyeR, uEyeDrip, 1.0) * smoothstep(0.0, 0.55, pa);
          float ap = spray(vP, uPink, normalize(vec3(-0.76, 0.0, 0.65)), uPinkR, uPinkDrip, 3.0) * smoothstep(0.2, 0.75, pa);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.08, 0.55, 0.95), vec3(0.2, 0.8, 1.0), n3(vP * 400.0)), min(1.0, ae * 1.2) * 0.9);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.22, 0.66), min(1.0, ap * 1.25) * 0.9);
          vec4 sl = smiley(vP, uSmL, uSmNL, uSmS), sr = smiley(vP, uSmR, uSmNR, uSmS);
          diffuseColor.rgb = mix(diffuseColor.rgb, sl.rgb, sl.a * smoothstep(0.45, 0.9, pa) * 0.9);
          diffuseColor.rgb = mix(diffuseColor.rgb, sr.rgb, sr.a * smoothstep(0.55, 1.0, pa) * 0.9);
        }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        // printed like the photograph: a firmer curve, and a grain on the picture itself
        gl_FragColor.rgb = clamp((gl_FragColor.rgb - 0.45) * 1.3 + 0.45, 0.0, 1.0);
        gl_FragColor.rgb *= 0.93 + 0.1 * h3(vec3(gl_FragCoord.xy, 0.0));`);
  };
  const statue = new THREE.Mesh(geo, marble);
  statue.castShadow = statue.receiveShadow = true;

  // the yellow line around him, standing off his outline as a painted line does: his shape
  // pushed out along its normals twice — the outer in yellow, then the inner punched back to
  // nothing (the page shows through) — and he over both. Two strands, a heavy one close and a
  // thin one further out, wavering and skipping, drawn on from his crown down, and redrawn
  // 24 times a second with a new hand, as a line boils in drawn animation.
  // (No face culling: the scanned mesh is not consistently wound.)
  const OU = { uOut: { value: 0 }, uBoil: { value: 0 } };
  const strand = (gap, width, seed, wild) => {
    const VS = outer => /* glsl */ `
      uniform float uOut, uBoil; varying vec3 vP;
      ${GLSL_NOISE}
      void main() {
        vP = position;
        vec3 q = position + vec3(uBoil * 0.731, uBoil * 0.377, uBoil * 0.513) + ${seed.toFixed(1)};
        float g = ${gap} * (0.45 + 1.1 * n3(q * 24.0) + ${wild} * (n3(q * 90.0) - 0.5));
        float w = ${outer ? `g + ${width} * (0.35 + 1.3 * n3(q * 57.0) + 0.6 * (n3(q * 170.0) - 0.5))` : 'g'};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * max(0.0, w) * smoothstep(0.0, 0.3, uOut), 1.0);
      }`;
    const outer = new THREE.ShaderMaterial({
      uniforms: OU, side: THREE.DoubleSide, depthWrite: false, depthTest: false,
      vertexShader: VS(true),
      fragmentShader: /* glsl */ `
        uniform float uOut, uBoil; varying vec3 vP;
        ${GLSL_NOISE}
        void main() {
          vec3 q = vP + vec3(uBoil * 0.731, uBoil * 0.377, uBoil * 0.513) + ${seed.toFixed(1)};
          if (vP.y < 1.03 - uOut * 0.65 - n3(q * 30.0) * 0.05) discard;    // drawn on from the top down
          if (n3(q * 40.0) < ${(0.14 + wild * 0.12).toFixed(3)}) discard;   // where the marker skipped
          float st = n3(vec3(gl_FragCoord.xy * vec2(0.08, 0.3), uBoil) + vP * 5.0);
          gl_FragColor = vec4(mix(vec3(1.0, 0.84, 0.0), vec3(1.0, 0.95, 0.28), st), 1.0);
        }`,
    });
    const inner = new THREE.ShaderMaterial({
      uniforms: OU, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.NoBlending,
      vertexShader: VS(false), fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
    });
    return [new THREE.Mesh(geo, outer), new THREE.Mesh(geo, inner)];
  };
  // painted outermost first, each punched before the next goes on
  const strands = [...strand(0.0175, 0.0032, 7.0, 0.6), ...strand(0.0085, 0.0062, 1.0, 0.35)];
  strands.forEach((m, k) => (m.renderOrder = -10 + k));
  const hull = new THREE.Group(); hull.add(...strands);
  group.add(hull, statue);

  // the picture the real layer is drawn to, and the sheet it is laid over the line drawing with
  const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
  const quadMat = new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function setLayers(v) {
    for (const k of ['real', 'paint', 'outline']) if (k in v) L[k] = v[k];
    U.uPaint.value = L.paint;
    OU.uOut.value = L.outline;
    statue.visible = hull.visible = L.real > 0;
    hull.visible = L.outline > 0;
  }
  function resize(w, h) { rt.setSize(Math.max(1, w), Math.max(1, h)); }
  // after the line drawing (or instead of it): the real layer, over it at L.real
  // place the perspective camera to see what an orthographic one (oc) frames, at the depth of
  // point z (view space), widening from nearly flat (fov ~2°) to fov as k runs 0 → 1: a dolly
  // zoom, the near parts of him growing as it comes
  function frame(oc, z, k, fov = 38) {
    const f = 2 + (fov - 2) * k, hgt = oc.top - oc.bottom, d = hgt / 2 / Math.tan((f * Math.PI) / 360);
    const mid = new THREE.Vector3((oc.left + oc.right) / 2, (oc.top + oc.bottom) / 2, z).applyMatrix4(oc.matrixWorld);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(oc.quaternion);
    cam.position.copy(mid).addScaledVector(back, d); cam.quaternion.copy(oc.quaternion);
    cam.fov = f; cam.aspect = (oc.right - oc.left) / hgt; cam.near = Math.max(0.005, d - 2); cam.far = d + 2;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }
  function render(_oc, rotY, drewLine) {
    if (L.real <= 0) return;
    group.rotation.y = rotY;
    rig.position.set(0, 0.6, 0); rig.quaternion.copy(cam.quaternion);
    const ac = renderer.autoClear, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    if (L.real >= 0.999 || !drewLine) {
      renderer.setRenderTarget(null); renderer.autoClear = !drewLine;
      if (!drewLine) renderer.clear();
      renderer.render(scene, cam);
    } else {
      renderer.setRenderTarget(rt); renderer.autoClear = true; renderer.render(scene, cam);
      renderer.setRenderTarget(null); renderer.autoClear = false;
      quadMat.opacity = L.real; renderer.render(quadScene, quadCam);
    }
    renderer.autoClear = ac; renderer.setClearColor(cc, ca);
  }
  // the point on him under a point of the picture (−1…1 each way), in his own units
  const ray = new THREE.Raycaster();
  function pick(nx, ny, _oc, rotY) {
    group.rotation.y = rotY; group.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(nx, ny), cam);
    const hit = ray.intersectObject(statue, false)[0];
    if (!hit) return null;
    const p = statue.worldToLocal(hit.point.clone());
    const n = hit.face.normal.clone();
    return { p: p.toArray().map(v => +v.toFixed(4)), n: n.toArray().map(v => +v.toFixed(3)) };
  }
  // a finer mesh of the same statue (same units), when it arrives
  function setGeometry(g) { statue.geometry = g; for (const m of strands) m.geometry = g; }
  // the line's hand for frame k (24 a second)
  function setBoil(k) { OU.uBoil.value = k % 97; }
  return { setLayers, resize, render, pick, frame, setGeometry, setBoil, layers: L, uniforms: U, camera: cam };
}
