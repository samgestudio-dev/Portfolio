/* A perspective camera for the Hairline drawing, so objects drawn with iso.js (which only
   ever asks for P(x, y, z) → screen and T, the way toward the viewer) can stand together
   in one world and be seen in depth.

   World: x/y on the ground, z up, millimetres. The camera looks at a focus point F from a
   distance D, at an azimuth (the side it stands on, measured like a compass from +x
   toward +y) and an elevation; fov is vertical, in degrees. shift moves the picture on the
   screen without turning the camera (a lens shift), so a subject can sit to one side.     */

export function view({ F, D, az, el, fov, w, h, shiftX = 0, shiftY = 0 }) {
  const ce = Math.cos(el), se = Math.sin(el);
  const E = [F[0] + D * ce * Math.cos(az), F[1] + D * ce * Math.sin(az), F[2] + D * se];
  const f = norm([F[0] - E[0], F[1] - E[1], F[2] - E[2]]);
  const r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
  const focal = h / 2 / Math.tan(((fov / 2) * Math.PI) / 180);
  const cx = w / 2 + shiftX, cy = h / 2 + shiftY;
  const depth = p => (p[0] - E[0]) * f[0] + (p[1] - E[1]) * f[1] + (p[2] - E[2]) * f[2];
  const P = (x, y, z) => {
    const d = [x - E[0], y - E[1], z - E[2]];
    const zc = Math.max(1e-3, d[0] * f[0] + d[1] * f[1] + d[2] * f[2]);
    return [cx + (focal * (d[0] * r[0] + d[1] * r[1] + d[2] * r[2])) / zc, cy - (focal * (d[0] * u[0] + d[1] * u[1] + d[2] * u[2])) / zc];
  };
  return { E, f, r, u, focal, P, depth, w, h, fov, shiftX, shiftY };
}

/* An object placed in the world: its own drawing space (millimetres, z up) scaled by s,
   turned by yaw about z, and set down at c. Returns the P and T its scene functions take:
   P through the placement and the camera, T the way toward the eye in its own space.   */
export function place(V, { c, s = 1, yaw = 0 }) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const toWorld = (x, y, z) => [c[0] + s * (x * cs - y * sn), c[1] + s * (x * sn + y * cs), c[2] + s * z];
  const P = (x, y, z) => V.P(...toWorld(x, y, z));
  const t = norm([V.E[0] - c[0], V.E[1] - c[1], V.E[2] - c[2]]);
  // into the object's own frame: undo the yaw
  const T = [t[0] * cs + t[1] * sn, -t[0] * sn + t[1] * cs, t[2]];
  return { P, T, toWorld };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
