import * as THREE from 'three';
import type { Model, PartGrow, PartSpin, PartTurn } from '../../forge/core/types';
import { easeAnimation, growScale, type AnimationProgress } from '../../forge/core/animate';

/** How much brighter a glowing face is than its color (fully emissive faces, and the glow part of partly emissive ones). */
const GLOW_BOOST = 1.12;

/**
 * Partial glow for the lit materials: each vertex carries its face's emissive amount (`glow`, 0..0.5; faces
 * at 0.5 and up are drawn unlit instead). The face's color is lit at (1 - glow) of its strength and added
 * back unlit at glow × GLOW_BOOST, so e.g. a 0.3 face keeps some brightness on its shadowed side, like the
 * contact sheet shows (forge:sheet blends emissive the same way).
 */
export function partialGlowShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute float glow;\nvarying float vGlow;')
    .replace('#include <color_vertex>', '#include <color_vertex>\n\tvGlow = glow;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <color_pars_fragment>', '#include <color_pars_fragment>\nvarying float vGlow;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n\tvec3 glowColor = diffuseColor.rgb;\n\tdiffuseColor.rgb *= 1.0 - vGlow;')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += glowColor * vGlow * ${GLOW_BOOST.toFixed(2)};`);
}

/**
 * Halos (MeshData.halos): each a quad turned to face the camera in the vertex shader (`haloCorner` -1..1 times
 * `haloRadius`, in view space), brought forward by its radius so the surface it sits on doesn't cut it, then
 * faded from its center (0.5 at the center, 0.16 at 40%, 0 at the edge) and
 * added to what is behind it. Depth-tested, so a body in front hides it.
 */
export function haloShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 haloCorner;\nattribute float haloRadius;\nvarying vec2 vHaloCorner;')
    .replace('#include <project_vertex>', `#include <project_vertex>
\tfloat haloScale = pow(abs(determinant(mat3(modelViewMatrix))), 1.0 / 3.0); // its overall scale, the same in every direction (a squashed spin frame stretches one axis)
\tmvPosition.xy += haloCorner * haloRadius * haloScale;
\tmvPosition.z += haloRadius * haloScale;
\tgl_Position = projectionMatrix * mvPosition;
\tvHaloCorner = haloCorner;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vHaloCorner;')
    .replace('#include <color_fragment>', `#include <color_fragment>
\tfloat haloD = length(vHaloCorner);
\tif (haloD > 1.0) discard;
\tdiffuseColor.a *= haloD < 0.4 ? mix(0.5, 0.16, haloD / 0.4) : mix(0.16, 0.0, (haloD - 0.4) / 0.6);`);
}

function withPartialGlow<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = partialGlowShader;
  return material;
}

/** The kinds of model material: lit (with partial glow), unlit (full glow), glass (lit, translucent), halo (additive glow). */
export const makeLit = () => new THREE.MeshLambertMaterial({ vertexColors: true });
export const makeUnlit = () => new THREE.MeshBasicMaterial({ vertexColors: true });
export const makeGlass = () => new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
export const makeHalo = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

// Shared materials: every model reuses these, so draw calls stay at <= 4 per model (3 meshes and its halos).
// (The map renderer swaps in fogged versions of them: viewEngine/three/fog.ts.)
const lit = withPartialGlow(makeLit());
const unlit = makeUnlit();
const glass = withPartialGlow(makeGlass());
const halo = makeHalo();
halo.onBeforeCompile = haloShader;
export const sharedMaterials = { lit, unlit, glass, halo };

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

/**
 * The halos (MeshData.halos) of the part `partIdx` as one mesh of quads, positioned relative to `origin`, added to `g`.
 * `fading`: the part fades (PartFade), so the mesh also keeps its halos' start colors (Halo.from) for animateParts.
 */
function addHalos(g: THREE.Object3D, model: Model, partIdx: (part: number) => boolean, origin: readonly number[] = [0, 0, 0], fading = false): void {
  const halos = model.mesh.halos.filter((h) => partIdx(h.part));
  if (!halos.length) return;
  // Two triangles per halo, each corner at its center (the shader moves it out to its corner)
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  const n = halos.length * 6;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), corner = new Float32Array(n * 2), radius = new Float32Array(n);
  halos.forEach((h, i) => {
    const c = h.c.map(srgbToLinear);
    CORNERS.forEach(([cx, cy], k) => {
      const v = i * 6 + k;
      for (let a = 0; a < 3; a++) { pos[v * 3 + a] = h.p[a] - origin[a]; col[v * 3 + a] = c[a]; }
      corner[v * 2] = cx; corner[v * 2 + 1] = cy;
      radius[v] = h.r;
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('haloCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('haloRadius', new THREE.BufferAttribute(radius, 1));
  const m = new THREE.Mesh(geo, halo);
  if (fading) {
    const from = new Float32Array(n * 3);
    halos.forEach((h, i) => {
      const c = (h.from ?? h.c).map(srgbToLinear);
      for (let k = 0; k < 6; k++) for (let a = 0; a < 3; a++) from[(i * 6 + k) * 3 + a] = c[a];
    });
    m.userData.fade = { from, to: col.slice() } satisfies FadeColors;
  }
  m.renderOrder = 2; // after the translucent faces
  m.frustumCulled = false; // its bounds are the halo centers only
  g.add(m);
}

/** A fading mesh's vertex colors at the fade's start and end (animateParts blends its color attribute between them). */
interface FadeColors {
  from: Float32Array;
  to: Float32Array;
}

/**
 * Up to 3 meshes (solid, glowing, translucent) for the triangles `tris`, positioned relative to `origin`, added to `g`.
 * `fading`: they belong to a fading part (PartFade), so each also keeps its start colors (MeshData.fromColors).
 */
function addMeshes(g: THREE.Object3D, model: Model, tris: number[], origin?: readonly number[], fading = false): void {
  const { emissive, alpha, fromColors } = model.mesh;
  const solid: number[] = [], glow: number[] = [], clear: number[] = [];
  for (const t of tris) (emissive[t] >= 0.5 ? glow : alpha[t] < 0.99 ? clear : solid).push(t);
  const fromModel = fading && fromColors ? { ...model, mesh: { ...model.mesh, colors: fromColors } } : null;
  const add = (list: number[], withAlpha: boolean, boost: number, material: THREE.Material, order = 0) => {
    if (!list.length) return;
    const idx = Uint32Array.from(list);
    const m = new THREE.Mesh(sub(model, idx, withAlpha, boost, origin), material);
    m.renderOrder = order;
    if (fromModel) {
      const to = (m.geometry.getAttribute('color').array as Float32Array).slice();
      const from = sub(fromModel, idx, withAlpha, boost, origin).getAttribute('color').array as Float32Array;
      m.userData.fade = { from, to } satisfies FadeColors;
    }
    g.add(m);
  };
  add(solid, false, 1, lit);
  add(glow, false, GLOW_BOOST, unlit);
  add(clear, true, 1, glass, 1);
}

/** A moving part's scene object (it spins, PartSpin, or animates, PartAnimation), and what posing it needs. */
interface PartObject {
  obj: THREE.Object3D;
  part: string;
  pivot: readonly number[];
  spin?: PartSpin;
  /** The animations that turn this part, with its turn in each. */
  turns: { animation: string; turn: PartTurn }[];
  /** The animations that grow this part (PartGrow). */
  grows: { animation: string; grow: PartGrow }[];
  /** The animations that fade this part's glow (PartFade), and its meshes' colors (with their last blend). */
  fades: { animation: string; meshes: { mesh: THREE.Mesh; colors: FadeColors }[]; k: number }[];
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
  const animations = model.animations ?? [];
  const fadingParts = new Set(animations.flatMap((a) => (a.fades ?? []).map((f) => f.part)));
  const moving = [...new Set([
    ...(model.motion ?? []).map((s) => s.part),
    ...animations.flatMap((a) => [...(a.turns ?? []), ...(a.grows ?? []), ...(a.fades ?? [])].map((t) => t.part)),
  ])].filter((p) => partNames.includes(p));
  const owner = (t: number) => moving.indexOf(partNames[part[t]]);
  const groups: number[][] = Array.from({ length: moving.length + 1 }, () => []);
  for (let t = 0; t < triCount; t++) groups[owner(t) + 1].push(t);

  const g = new THREE.Group();
  g.name = model.name;
  g.userData.model = { designId: model.designId, seed: model.seed, anchors: model.mesh.anchors, partNames, pivots };
  addMeshes(g, model, groups[0]);
  addHalos(g, model, (p) => !moving.includes(partNames[p]));
  const parts: PartObject[] = moving.map((name, k) => {
    const pivot = pivots[name] ?? [0, 0, 0];
    const obj = new THREE.Group();
    obj.matrixAutoUpdate = false;
    obj.matrix.makeTranslation(pivot[0], pivot[1], pivot[2]);
    const fading = fadingParts.has(name);
    addMeshes(obj, model, groups[k + 1], pivot, fading);
    addHalos(obj, model, (p) => partNames[p] === name, pivot, fading);
    g.add(obj);
    const fadeMeshes = obj.children.flatMap((c) => (c instanceof THREE.Mesh && c.userData.fade ? [{ mesh: c, colors: c.userData.fade as FadeColors }] : []));
    return {
      obj, part: name, pivot,
      spin: model.motion?.find((s) => s.part === name),
      turns: animations.flatMap((a) => (a.turns ?? []).filter((t) => t.part === name).map((turn) => ({ animation: a.name, turn }))),
      grows: animations.flatMap((a) => (a.grows ?? []).filter((t) => t.part === name).map((grow) => ({ animation: a.name, grow }))),
      fades: animations.filter((a) => (a.fades ?? []).some((t) => t.part === name)).map((a) => ({ animation: a.name, meshes: fadeMeshes, k: 1 })),
    };
  });
  if (parts.length) g.userData.parts = parts;
  return g;
}

const partsOf = (o: THREE.Object3D) => (o.userData.parts as PartObject[] | undefined) ?? [];

/** True if the object (from toThree) has parts that keep moving (PartSpin), so its renderer should keep animating. */
export const hasSpinningParts = (o: THREE.Object3D): boolean => partsOf(o).some((p) => p.spin);

/** True if the object has parts its one-time animations (PartAnimation) move. */
export const hasAnimations = (o: THREE.Object3D): boolean => partsOf(o).some((p) => p.turns.length || p.grows.length || p.fades.length);

export type { AnimationProgress };

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4();

/**
 * Pose an object's moving parts: spinning parts (PartSpin) at time `sec`, and each one-time animation's
 * parts (PartAnimation) at its `progress`: turned, grown, their glow faded.
 */
export function animateParts(o: THREE.Object3D, sec: number, progress: AnimationProgress = {}): void {
  for (const { obj, pivot, spin, turns, grows, fades } of partsOf(o)) {
    obj.matrix.makeTranslation(pivot[0], pivot[1], pivot[2]);
    // Animation turns first (about the pivot), then growth, then any spin within that
    for (const { animation, turn } of turns) {
      const k = easeAnimation(progress[animation] ?? 0);
      if (k > 0) obj.matrix.multiply(m2.makeRotationAxis(AXES[turn.axis], (turn.angleDeg * Math.PI / 180) * k));
    }
    // An animation not played (not in `progress`) changes nothing: see AnimationProgress
    for (const { animation, grow } of grows) {
      if (!(animation in progress)) continue;
      const k = Math.max(1e-4, growScale(progress[animation], grow)); // never a zero scale (a singular matrix)
      if (k < 1) obj.matrix.multiply(m1.makeScale(k, k, k));
    }
    // Fading glow: each mesh's colors blended from its start to its own (only when the blend changes)
    for (const fade of fades) {
      const k = fade.animation in progress ? easeAnimation(progress[fade.animation]) : 1; // not played: its own colors
      if (k === fade.k) continue;
      fade.k = k;
      for (const { mesh, colors } of fade.meshes) {
        const attr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        const out = attr.array as Float32Array;
        for (let i = 0; i < out.length; i++) out[i] = colors.from[i] + (colors.to[i] - colors.from[i]) * k;
        attr.needsUpdate = true;
      }
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
