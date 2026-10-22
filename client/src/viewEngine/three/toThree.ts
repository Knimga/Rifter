import * as THREE from 'three';
import type { Model, PartSpin, PartTurn } from '../../forge/core/types';
import { easeAnimation, type AnimationProgress } from '../../forge/core/animate';

/** How much brighter a glowing face is than its color (fully emissive faces, and the glow part of partly emissive ones). */
const GLOW_BOOST = 1.12;

/**
 * Partial glow for the lit materials: each vertex carries its face's emissive amount (`glow`, 0..0.5; faces
 * at 0.5 and up are drawn unlit instead). The face's color is lit at (1 - glow) of its strength and added
 * back unlit at glow × GLOW_BOOST, so e.g. a 0.3 face keeps some brightness on its shadowed side, like the
 * contact sheet shows (forge:sheet blends emissive the same way).
 */
function withPartialGlow<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n\tvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_pars_fragment>', '#include <color_pars_fragment>\nvarying float vGlow;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tvec3 glowColor = diffuseColor.rgb;\n\tdiffuseColor.rgb *= 1.0 - vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += glowColor * vGlow * ${GLOW_BOOST.toFixed(2)};`);
  };
  return material;
}

// Shared materials: every model reuses these three, so draw calls stay at <= 3 per model.
const lit = withPartialGlow(new THREE.MeshLambertMaterial({ vertexColors: true }));
const unlit = new THREE.MeshBasicMaterial({ vertexColors: true });
const glass = withPartialGlow(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
export const sharedMaterials = { lit, unlit, glass };

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/**
 * Geometry for the triangles `idx` (non-indexed, flat shaded). Faces are usually flat-colored, so each face's
 * color is converted to linear once and written to its three vertices; normals are each face's own.
 */
function sub(model: Model, idx: Uint32Array, withAlpha: boolean, boost = 1, origin: readonly number[] = [0, 0, 0]): THREE.BufferGeometry {
  const { positions: P, colors: C, alpha, emissive } = model.mesh;
  const n = idx.length;
  const stride = withAlpha ? 4 : 3;
  const pos = new Float32Array(n * 9);
  const nor = new Float32Array(n * 9);
  const glow = new Float32Array(n * 3); // each vertex: its face's emissive amount (partial glow, lit materials)
  const col = new Float32Array(n * 3 * stride);
  for (let i = 0; i < n; i++) {
    const s = idx[i] * 9, o = i * 9;
    for (let k = 0; k < 9; k++) pos[o + k] = P[s + k] - origin[k % 3];
    glow[i * 3] = glow[i * 3 + 1] = glow[i * 3 + 2] = Math.min(emissive[idx[i]], 0.5);
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
  geo.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  return geo;
}

/** Up to 3 meshes (solid, glowing, translucent) for the triangles `tris`, positioned relative to `origin`, added to `g`. */
function addMeshes(g: THREE.Object3D, model: Model, tris: number[], origin?: readonly number[]): void {
  const { emissive, alpha } = model.mesh;
  const solid: number[] = [], glow: number[] = [], clear: number[] = [];
  for (const t of tris) (emissive[t] >= 0.5 ? glow : alpha[t] < 0.99 ? clear : solid).push(t);
  if (solid.length) g.add(new THREE.Mesh(sub(model, Uint32Array.from(solid), false, 1, origin), lit));
  if (glow.length) g.add(new THREE.Mesh(sub(model, Uint32Array.from(glow), false, GLOW_BOOST, origin), unlit));
  if (clear.length) {
    const m = new THREE.Mesh(sub(model, Uint32Array.from(clear), true, 1, origin), glass);
    m.renderOrder = 1;
    g.add(m);
  }
}

/** A moving part's scene object (it spins, PartSpin, or animates, PartAnimation), and what posing it needs. */
interface PartObject {
  obj: THREE.Object3D;
  part: string;
  pivot: readonly number[];
  spin?: PartSpin;
  /** The animations that turn this part, with its turn in each. */
  turns: { animation: string; turn: PartTurn }[];
}

/**
 * Model -> Object3D. Origin/orientation conventions are the model's own (see core/facing.ts):
 * set group.rotation.y = yaw and group.position = (gx + .5, 0, gy + .5) for creatures.
 * Parts that move (model.motion, model.animations) get their own child group, posed by animateParts;
 * everything else is merged into at most 3 meshes. Dispose with disposeObject() (materials are shared and
 * never disposed).
 */
export function toThree(model: Model): THREE.Group {
  const { part, partNames, pivots, triCount } = model.mesh;
  const moving = [...new Set([
    ...(model.motion ?? []).map((s) => s.part),
    ...(model.animations ?? []).flatMap((a) => a.turns.map((t) => t.part)),
  ])].filter((p) => partNames.includes(p));
  const owner = (t: number) => moving.indexOf(partNames[part[t]]);
  const groups: number[][] = Array.from({ length: moving.length + 1 }, () => []);
  for (let t = 0; t < triCount; t++) groups[owner(t) + 1].push(t);

  const g = new THREE.Group();
  g.name = model.name;
  g.userData.model = { designId: model.designId, seed: model.seed, anchors: model.mesh.anchors, partNames, pivots };
  addMeshes(g, model, groups[0]);
  const parts: PartObject[] = moving.map((name, k) => {
    const pivot = pivots[name] ?? [0, 0, 0];
    const obj = new THREE.Group();
    obj.matrixAutoUpdate = false;
    obj.matrix.makeTranslation(pivot[0], pivot[1], pivot[2]);
    addMeshes(obj, model, groups[k + 1], pivot);
    g.add(obj);
    return {
      obj, part: name, pivot,
      spin: model.motion?.find((s) => s.part === name),
      turns: (model.animations ?? []).flatMap((a) => a.turns.filter((t) => t.part === name).map((turn) => ({ animation: a.name, turn }))),
    };
  });
  if (parts.length) g.userData.parts = parts;
  return g;
}

const partsOf = (o: THREE.Object3D) => (o.userData.parts as PartObject[] | undefined) ?? [];

/** True if the object (from toThree) has parts that keep moving (PartSpin), so its renderer should keep animating. */
export const hasSpinningParts = (o: THREE.Object3D): boolean => partsOf(o).some((p) => p.spin);

/** True if the object has parts its one-time animations (PartAnimation) move. */
export const hasAnimations = (o: THREE.Object3D): boolean => partsOf(o).some((p) => p.turns.length);

export type { AnimationProgress };

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4();

/**
 * Pose an object's moving parts: spinning parts (PartSpin) at time `sec`, and each one-time animation's
 * parts (PartAnimation) at its `progress`.
 */
export function animateParts(o: THREE.Object3D, sec: number, progress: AnimationProgress = {}): void {
  for (const { obj, pivot, spin, turns } of partsOf(o)) {
    obj.matrix.makeTranslation(pivot[0], pivot[1], pivot[2]);
    // Animation turns first (about the pivot), then any spin within that
    for (const { animation, turn } of turns) {
      const k = easeAnimation(progress[animation] ?? 0);
      if (k > 0) obj.matrix.multiply(m2.makeRotationAxis(AXES[turn.axis], (turn.angleDeg * Math.PI / 180) * k));
    }
    if (spin) {
      const f = spin.frame ?? [1, 1, 1];
      // pivot · frame · rotation · frame⁻¹: the spin happens in the part's round frame
      obj.matrix.multiply(m1.makeScale(f[0], f[1], f[2]));
      obj.matrix.multiply(m2.makeRotationAxis(AXES[spin.axis], 2 * Math.PI * spin.turnsPerSec * sec));
      obj.matrix.multiply(m1.makeScale(1 / f[0], 1 / f[1], 1 / f[2]));
    }
    obj.matrixWorldNeedsUpdate = true;
  }
}

export function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) c.geometry.dispose();
  });
}
