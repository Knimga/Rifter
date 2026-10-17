import * as THREE from 'three';
import type { Model } from '../core/types';

// Shared materials: every model reuses these three, so draw calls stay at <= 3 per model.
const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
const unlit = new THREE.MeshBasicMaterial({ vertexColors: true });
const glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
export const sharedMaterials = { lit, unlit, glass };

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function sub(model: Model, idx: number[], withAlpha: boolean, boost = 1): THREE.BufferGeometry {
  const { positions, colors, alpha } = model.mesh;
  const pos = new Float32Array(idx.length * 9);
  const col = new Float32Array(idx.length * 9 * (withAlpha ? 4 / 3 : 1));
  const part = new Float32Array(idx.length * 3);
  idx.forEach((t, i) => {
    pos.set(positions.subarray(t * 9, t * 9 + 9), i * 9);
    for (let v = 0; v < 3; v++) {
      const o = withAlpha ? (i * 3 + v) * 4 : (i * 3 + v) * 3;
      for (let k = 0; k < 3; k++) col[o + k] = srgbToLinear(Math.min(1, colors[t * 9 + v * 3 + k] * boost));
      if (withAlpha) col[o + 3] = alpha[t];
      part[i * 3 + v] = model.mesh.part[t];
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, withAlpha ? 4 : 3));
  g.setAttribute('part', new THREE.BufferAttribute(part, 1)); // kept for future per-part animation
  g.computeVertexNormals(); // non-indexed => flat normals
  return g;
}

/**
 * Model -> Object3D. Origin/orientation conventions are the model's own (see core/facing.ts):
 * set group.rotation.y = yaw and group.position = (gx + .5, 0, gy + .5) for creatures.
 * Dispose with disposeObject() (materials are shared and never disposed).
 */
export function toThree(model: Model): THREE.Group {
  const { emissive, alpha, triCount } = model.mesh;
  const solid: number[] = [], glow: number[] = [], clear: number[] = [];
  for (let t = 0; t < triCount; t++) (emissive[t] >= 0.5 ? glow : alpha[t] < 0.99 ? clear : solid).push(t);
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
