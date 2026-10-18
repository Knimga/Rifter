import * as THREE from 'three';
import type { Model } from '../core/types';

// Shared materials: every model reuses these three, so draw calls stay at <= 3 per model.
const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
const unlit = new THREE.MeshBasicMaterial({ vertexColors: true });
const glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
export const sharedMaterials = { lit, unlit, glass };

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/**
 * Geometry for the triangles `idx` (non-indexed, flat shaded). Faces are flat-colored, so each face's
 * color is converted to linear once and written to its three vertices; normals are each face's own.
 */
function sub(model: Model, idx: Uint32Array, withAlpha: boolean, boost = 1): THREE.BufferGeometry {
  const { positions: P, colors: C, alpha } = model.mesh;
  const n = idx.length;
  const stride = withAlpha ? 4 : 3;
  const pos = new Float32Array(n * 9);
  const nor = new Float32Array(n * 9);
  const col = new Float32Array(n * 3 * stride);
  for (let i = 0; i < n; i++) {
    const s = idx[i] * 9, o = i * 9;
    for (let k = 0; k < 9; k++) pos[o + k] = P[s + k];
    // Face normal: (b - a) x (c - a), normalized
    const ux = P[s + 3] - P[s], uy = P[s + 4] - P[s + 1], uz = P[s + 5] - P[s + 2];
    const vx = P[s + 6] - P[s], vy = P[s + 7] - P[s + 1], vz = P[s + 8] - P[s + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const r = srgbToLinear(Math.min(1, C[s] * boost)), g = srgbToLinear(Math.min(1, C[s + 1] * boost)), b = srgbToLinear(Math.min(1, C[s + 2] * boost));
    for (let v = 0; v < 3; v++) {
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

/**
 * Model -> Object3D. Origin/orientation conventions are the model's own (see core/facing.ts):
 * set group.rotation.y = yaw and group.position = (gx + .5, 0, gy + .5) for creatures.
 * Dispose with disposeObject() (materials are shared and never disposed).
 */
export function toThree(model: Model): THREE.Group {
  const { emissive, alpha, triCount } = model.mesh;
  // Split triangles into solid / glowing / translucent (counts first, then fill typed arrays)
  const kind = new Uint8Array(triCount);
  const count = [0, 0, 0];
  for (let t = 0; t < triCount; t++) count[(kind[t] = emissive[t] >= 0.5 ? 1 : alpha[t] < 0.99 ? 2 : 0)]++;
  const lists = count.map((c) => new Uint32Array(c));
  const at = [0, 0, 0];
  for (let t = 0; t < triCount; t++) lists[kind[t]][at[kind[t]]++] = t;
  const [solid, glow, clear] = lists;

  const g = new THREE.Group();
  g.name = model.name;
  g.userData.model = { designId: model.designId, seed: model.seed, anchors: model.mesh.anchors, partNames: model.mesh.partNames, pivots: model.mesh.pivots };
  if (solid.length) g.add(new THREE.Mesh(sub(model, solid, false), lit));
  if (glow.length) g.add(new THREE.Mesh(sub(model, glow, false, 1.12), unlit));
  if (clear.length) {
    const m = new THREE.Mesh(sub(model, clear, true), glass);
    m.renderOrder = 1;
    g.add(m);
  }
  return g;
}

export function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) c.geometry.dispose();
  });
}
