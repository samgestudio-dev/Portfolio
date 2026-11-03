import * as THREE from 'three';
import { QUARTER } from './turntable.js';

/* The turntable every object stands on: a fixed base (a side and a top, so its rim is a
   line) and a platter that spins (its top, edge and bottom are separate parts, so the
   rim always draws), with four detent studs, one per quarter. */
export const PLATTER_IDS = { platterTop: 2, platterSide: 3, baseSide: 4, baseTop: 5, stud: 6 };

export function buildPlatter(pass, { R = 0.34, ids = PLATTER_IDS } = {}) {
  const base = new THREE.Group(), spin = new THREE.Group();
  const baseSide = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.9, 0.06, 96, 1, true), pass.material(ids.baseSide));
  baseSide.position.y = -0.075;
  const baseTop = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 96).rotateX(-Math.PI / 2), pass.material(ids.baseTop));
  baseTop.position.y = -0.045;
  base.add(baseSide, baseTop);

  const platterSide = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.035, 128, 1, true), pass.material(ids.platterSide));
  platterSide.position.y = -0.0175;
  const platterTop = new THREE.Mesh(new THREE.CircleGeometry(R, 128).rotateX(-Math.PI / 2), pass.material(ids.platterTop));
  const platterBottom = new THREE.Mesh(new THREE.CircleGeometry(R, 128).rotateX(Math.PI / 2), pass.material(ids.platterSide));
  platterBottom.position.y = -0.035;
  spin.add(platterSide, platterTop, platterBottom);

  const studGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.012, 24);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(studGeo, pass.material(ids.stud));
    const a = i * QUARTER + Math.PI / 4; // in front of a face, between the camera's axes
    s.position.set(Math.sin(a) * (R - 0.03), 0.006, Math.cos(a) * (R - 0.03));
    spin.add(s);
  }
  return { base, spin, R };
}

// Points that bound the turntable in any pose: the platter rim and the base's foot.
export function platterExtent(R) {
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R));
    pts.push(new THREE.Vector3(Math.sin(a) * R * 0.9, -0.105, Math.cos(a) * R * 0.9));
  }
  return pts;
}
