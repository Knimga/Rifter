// Hood shapes for creatures, shared by designs that wear one (sporemother.ts's cowl, goblin-shaman.ts's pointed
// hood). Files starting with "_" are NOT registered as designs.
import type { Mesh } from '../core/mesh';
import { add, lerp3, mul, norm, type RGB, type Vec3 } from '../core/vec';

/** One arch of a hood, front to back: its depth (z), half-width, top height and the height its sides come down to. */
export type HoodArch = [z: number, w: number, top: number, foot: number];

export interface ArchHoodLook {
  /** The arches, from the opening (first) back. */
  arches: readonly HoodArch[];
  /** The hood's middle (x). */
  x: number;
  /** How far the whole hood sits back from its arches (z). Default 0. */
  back?: number;
  /** The outside's color at a height (the top of an arch for its faces, its foot for the lips down its sides). */
  color: (y: number) => RGB;
  /** The inside's color. */
  lining: RGB;
  /** How pointed each arch's top is: 0 round (default), 1 a sharp peak. */
  pointed?: number;
}

const ARC = 10, THICK = 0.025;

/**
 * A hood: a run of arches from the opening around a face back over the head. A thick shell: the outside, a
 * darker lining, joined by lips along the opening and down its sides.
 */
export function archHood(m: Mesh, o: ArchHoodLook): void {
  const { arches, x, back = 0, color, lining, pointed = 0 } = o;
  /** How high step t (-90deg .. 0 at the top .. 90deg) rises, 0 .. 1: round, or peaked. */
  const rise = (t: number) => (pointed ? (1 - pointed) * Math.cos(t) + pointed * (1 - Math.abs(t) / (Math.PI / 2)) : Math.cos(t));
  /** A point of arch k, step i over it (0 = the left side's foot, ARC = the right's), `dr` in from the outside. */
  const arch = (k: number, i: number, dr = 0): Vec3 => {
    const [z, w, top, foot] = arches[k], t = (i / ARC - 0.5) * Math.PI; // -90deg (left foot) .. 0 (top) .. 90deg
    return [x - Math.sin(t) * (w - dr), foot + rise(t) * (top - foot - dr), z - back];
  };
  for (let k = 0; k < arches.length - 1; k++) {
    // The hood's axis between these two arches (low, at their feet): the outside faces away from it
    const axis: Vec3 = [x, (arches[k][3] + arches[k + 1][3]) / 2, (arches[k][0] + arches[k + 1][0]) / 2];
    for (let i = 0; i < ARC; i++) {
      m.quad(arch(k, i), arch(k, i + 1), arch(k + 1, i + 1), arch(k + 1, i), color(arches[k][2]), axis, { j: 0.16 });
      // The lining faces in, toward the head (oriented away from a point out past the outside)
      const mid = lerp3(arch(k, i), arch(k + 1, i + 1), 0.5), out = add(mid, mul(norm([mid[0] - axis[0], mid[1] - axis[1], 0]), 1));
      m.quad(arch(k, i, THICK), arch(k, i + 1, THICK), arch(k + 1, i + 1, THICK), arch(k + 1, i, THICK), lining, out, { j: 0.12 });
    }
    // Lips down its sides, at the feet of the arches
    for (const i of [0, ARC]) {
      const below = add(lerp3(arch(k, i), arch(k + 1, i), 0.5), [0, 1, 0]);
      m.quad(arch(k, i), arch(k + 1, i), arch(k + 1, i, THICK), arch(k, i, THICK), color(arches[k][3]), below, { j: 0.12 });
    }
  }
  // The lip along the opening (the first arch), facing forward
  for (let i = 0; i < ARC; i++) {
    const behind = add(lerp3(arch(0, i), arch(0, i + 1), 0.5), [0, 0, -1]);
    m.quad(arch(0, i), arch(0, i + 1), arch(0, i + 1, THICK), arch(0, i, THICK), color(arches[0][2]), behind, { j: 0.12 });
  }
}
