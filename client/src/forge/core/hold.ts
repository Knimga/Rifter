// Placing item models (weapons, shields) into a body model's hands, and merging them into one Model.
// Renderer-agnostic and game-data-free: callers decide which item goes where and how it is oriented
// (see src/forge/equip.ts). The result is an ordinary Model, so every renderer shows held gear as-is.
import type { MeshData, Model } from './types';
import { cross, dot, mul, norm, sub, type Vec3 } from './vec';

/** Right-handed orthonormal frame: `axis`, then `second` made perpendicular to it, then their cross product. */
function frame(axis: Vec3, second: Vec3): [Vec3, Vec3, Vec3] {
  const a = norm(axis);
  const b = norm(sub(second, mul(a, dot(second, a))));
  return [a, b, cross(a, b)];
}


/** Smallest and largest coordinate of a mesh's vertices along `dir` (measured from `origin`). */
export function extentAlong(mesh: MeshData, dir: Vec3, origin: Vec3 = [0, 0, 0]): [number, number] {
  const [dx, dy, dz] = norm(dir);
  const P = mesh.positions;
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < P.length; k += 3) {
    const t = (P[k] - origin[0]) * dx + (P[k + 1] - origin[1]) * dy + (P[k + 2] - origin[2]) * dz;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return [lo, hi];
}

/**
 * How an item sits in the body's space: the item's `itemAxis` turns onto `worldAxis`, its `itemSecond`
 * onto `worldSecond` (as near as perpendicularity allows), it is scaled by `scale`, and `itemPin`
 * (a point in item space, e.g. its grip) lands on `worldPin` (e.g. a hand anchor).
 */
export interface Placement {
  itemAxis: Vec3;
  itemSecond: Vec3;
  worldAxis: Vec3;
  worldSecond: Vec3;
  scale: number;
  itemPin: Vec3;
  worldPin: Vec3;
}

/** An item model placed into a body's space, ready to merge. */
export interface PlacedItem {
  /** Part name for the item's faces in the merged model (e.g. 'mainhand'). */
  part: string;
  mesh: MeshData;
  placement: Placement;
}

/** Item vertex positions moved into body space (a proper rotation + uniform scale, so faces keep their winding). */
function placePositions(mesh: MeshData, p: Placement): Float32Array {
  const [i0, i1, i2] = frame(p.itemAxis, p.itemSecond);
  const [w0, w1, w2] = frame(p.worldAxis, p.worldSecond);
  const P = mesh.positions, pin = p.itemPin, to = p.worldPin, s = p.scale;
  const out = new Float32Array(P.length);
  for (let k = 0; k < out.length; k += 3) {
    const dx = P[k] - pin[0], dy = P[k + 1] - pin[1], dz = P[k + 2] - pin[2];
    // Coordinates in the item's frame, then the same coordinates in the world frame
    const c0 = (dx * i0[0] + dy * i0[1] + dz * i0[2]) * s, c1 = (dx * i1[0] + dy * i1[1] + dz * i1[2]) * s, c2 = (dx * i2[0] + dy * i2[1] + dz * i2[2]) * s;
    for (let a = 0; a < 3; a++) out[k + a] = to[a] + (w0[a] * c0 + w1[a] * c1 + w2[a] * c2);
  }
  return out;
}

/** The body with each item placed and merged in. Anchors, pivots and name stay the body's. */
export function holdItems(body: Model, items: PlacedItem[]): Model {
  if (!items.length) return body;
  const meshes = [body.mesh, ...items.map((i) => i.mesh)];
  const positions = [body.mesh.positions, ...items.map((i) => placePositions(i.mesh, i.placement))];
  const tris = meshes.reduce((n, m) => n + m.triCount, 0);
  const cat = <T extends Float32Array | Uint8Array>(make: (n: number) => T, get: (m: MeshData, i: number) => ArrayLike<number>, per: number): T => {
    const out = make(tris * per);
    let at = 0;
    meshes.forEach((m, i) => {
      const src = get(m, i);
      out.set(src, at);
      at += src.length;
    });
    return out;
  };
  const partNames = [...body.mesh.partNames, ...items.map((i) => i.part)];
  const part = cat((n) => new Uint8Array(n), (m, i) => (i === 0 ? m.part : new Uint8Array(m.triCount).fill(body.mesh.partNames.length + i - 1)), 1);
  const all = cat((n) => new Float32Array(n), (_, i) => positions[i], 9);
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < all.length; k += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], all[k + a]);
      max[a] = Math.max(max[a], all[k + a]);
    }
  }
  return {
    ...body,
    mesh: {
      ...body.mesh,
      triCount: tris,
      positions: all,
      colors: cat((n) => new Float32Array(n), (m) => m.colors, 9),
      emissive: cat((n) => new Float32Array(n), (m) => m.emissive, 1),
      alpha: cat((n) => new Float32Array(n), (m) => m.alpha, 1),
      part,
      partNames,
      bounds: { min, max },
    },
  };
}
