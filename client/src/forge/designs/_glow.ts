// A pool of light on the floor under a glowing model (rifts, the Burning Spirit): translucent rings, each
// fainter than the one inside it, so the pool fades out with no edge. Lies just above the floor (y = 0).
// Files starting with "_" are NOT registered as designs.
import type { Mesh } from '../core/mesh';
import type { RGB, Vec3 } from '../core/vec';

/** Opacity of the center disc, then of each ring outward. */
const ALPHA = [0.3, 0.22, 0.14, 0.07, 0.025];

/** A floor glow in `color`, an oval `rx` wide (x) and `rz` deep (z), with `segments` around. */
export function floorGlow(m: Mesh, color: RGB, rx: number, rz: number, segments = 16): void {
  const y = 0.004;
  const pt = (k: number, i: number): Vec3 => {
    const a = (i / segments) * 2 * Math.PI, r = k / ALPHA.length;
    return [Math.cos(a) * rx * r, y, Math.sin(a) * rz * r];
  };
  const below: Vec3 = [0, -1, 0]; // faces point up
  for (let i = 0; i < segments; i++) m.tri([0, y, 0], pt(1, i), pt(1, i + 1), color, below, { a: ALPHA[0], j: 0 });
  for (let k = 1; k < ALPHA.length; k++)
    for (let i = 0; i < segments; i++) m.quad(pt(k, i), pt(k, i + 1), pt(k + 1, i + 1), pt(k + 1, i), color, below, { a: ALPHA[k], j: 0 });
}
