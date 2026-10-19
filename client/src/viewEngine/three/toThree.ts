import * as THREE from 'three';
import type { Model, PartSpin } from '../../forge/core/types';

// Shared materials: every model reuses these three, so draw calls stay at <= 3 per model.
const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
const unlit = new THREE.MeshBasicMaterial({ vertexColors: true });
const glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
export const sharedMaterials = { lit, unlit, glass };

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/**
 * Geometry for the triangles `idx` (non-indexed, flat shaded). Faces are usually flat-colored, so each face's
 * color is converted to linear once and written to its three vertices; normals are each face's own.
 */
function sub(model: Model, idx: Uint32Array, withAlpha: boolean, boost = 1, origin: readonly number[] = [0, 0, 0]): THREE.BufferGeometry {
  const { positions: P, colors: C, alpha } = model.mesh;
  const n = idx.length;
  const stride = withAlpha ? 4 : 3;
  const pos = new Float32Array(n * 9);
  const nor = new Float32Array(n * 9);
  const col = new Float32Array(n * 3 * stride);
  for (let i = 0; i < n; i++) {
    const s = idx[i] * 9, o = i * 9;
    for (let k = 0; k < 9; k++) pos[o + k] = P[s + k] - origin[k % 3];
    // Face normal: (b - a) x (c - a), normalized
    const ux = P[s + 3] - P[s], uy = P[s + 4] - P[s + 1], uz = P[s + 5] - P[s + 2];
    const vx = P[s + 6] - P[s], vy = P[s + 7] - P[s + 1], vz = P[s + 8] - P[s + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    // Colors: usually flat (converted once per face); a face with corner colors (FaceOpts.vc) converts each corner
    let r = 0, g = 0, b = 0;
    for (let v = 0; v < 3; v++) {
      const sv = s + v * 3;
      if (v === 0 || C[sv] !== C[sv - 3] || C[sv + 1] !== C[sv - 2] || C[sv + 2] !== C[sv - 1]) {
        r = srgbToLinear(Math.min(1, C[sv] * boost));
        g = srgbToLinear(Math.min(1, C[sv + 1] * boost));
        b = srgbToLinear(Math.min(1, C[sv + 2] * boost));
      }
      nor[o + v * 3] = nx; nor[o + v * 3 + 1] = ny; nor[o + v * 3 + 2] = nz;
      const c = (i * 3 + v) * stride;
      col[c] = r; col[c + 1] = g; col[c + 2] = b;
      if (withAlpha) col[c + 3] = alpha[idx[i]];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, stride));
  return geo;
}

/** Up to 3 meshes (solid, glowing, translucent) for the triangles `tris`, positioned relative to `origin`, added to `g`. */
function addMeshes(g: THREE.Object3D, model: Model, tris: number[], origin?: readonly number[]): void {
  const { emissive, alpha } = model.mesh;
  const solid: number[] = [], glow: number[] = [], clear: number[] = [];
  for (const t of tris) (emissive[t] >= 0.5 ? glow : alpha[t] < 0.99 ? clear : solid).push(t);
  if (solid.length) g.add(new THREE.Mesh(sub(model, Uint32Array.from(solid), false, 1, origin), lit));
  if (glow.length) g.add(new THREE.Mesh(sub(model, Uint32Array.from(glow), false, 1.12, origin), unlit));
  if (clear.length) {
    const m = new THREE.Mesh(sub(model, Uint32Array.from(clear), true, 1, origin), glass);
    m.renderOrder = 1;
    g.add(m);
  }
}

/** A spinning part's scene object, and what animateParts needs to turn it. */
interface SpinObject {
  obj: THREE.Object3D;
  spin: PartSpin;
  pivot: readonly number[];
}

/**
 * Model -> Object3D. Origin/orientation conventions are the model's own (see core/facing.ts):
 * set group.rotation.y = yaw and group.position = (gx + .5, 0, gy + .5) for creatures.
 * Parts in model.motion get their own child group (turned by animateParts); everything else is merged
 * into at most 3 meshes. Dispose with disposeObject() (materials are shared and never disposed).
 */
export function toThree(model: Model): THREE.Group {
  const { part, partNames, pivots, triCount } = model.mesh;
  const spins = (model.motion ?? []).filter((s) => partNames.includes(s.part));
  const owner = (t: number) => spins.findIndex((s) => partNames[part[t]] === s.part);
  const groups: number[][] = Array.from({ length: spins.length + 1 }, () => []);
  for (let t = 0; t < triCount; t++) groups[owner(t) + 1].push(t);

  const g = new THREE.Group();
  g.name = model.name;
  g.userData.model = { designId: model.designId, seed: model.seed, anchors: model.mesh.anchors, partNames, pivots };
  addMeshes(g, model, groups[0]);
  const moving: SpinObject[] = spins.map((spin, k) => {
    const pivot = pivots[spin.part] ?? [0, 0, 0];
    const obj = new THREE.Group();
    obj.matrixAutoUpdate = false;
    obj.matrix.makeTranslation(pivot[0], pivot[1], pivot[2]);
    addMeshes(obj, model, groups[k + 1], pivot);
    g.add(obj);
    return { obj, spin, pivot };
  });
  if (moving.length) g.userData.spins = moving;
  return g;
}

/** True if the object (from toThree) has moving parts, so its renderer should keep animating. */
export const isAnimated = (o: THREE.Object3D): boolean => !!(o.userData.spins as SpinObject[] | undefined)?.length;

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4();

/** Pose an object's moving parts (PartSpin) at time `sec`. */
export function animateParts(o: THREE.Object3D, sec: number): void {
  for (const { obj, spin, pivot } of (o.userData.spins as SpinObject[] | undefined) ?? []) {
    const f = spin.frame ?? [1, 1, 1];
    // pivot · frame · rotation · frame⁻¹: the spin happens in the part's round frame
    obj.matrix.makeTranslation(pivot[0], pivot[1], pivot[2]);
    obj.matrix.multiply(m1.makeScale(f[0], f[1], f[2]));
    obj.matrix.multiply(m2.makeRotationAxis(AXES[spin.axis], 2 * Math.PI * spin.turnsPerSec * sec));
    obj.matrix.multiply(m1.makeScale(1 / f[0], 1 / f[1], 1 / f[2]));
    obj.matrixWorldNeedsUpdate = true;
  }
}

export function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) c.geometry.dispose();
  });
}
