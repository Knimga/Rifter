// Torches: every wall torch's shape (wall clutter: DECOR_OBJECTS with placement 'wall'), each torch its own flame, and
// the burning head every torch shares (torchHead: the Floor Torch's too).
// Files starting with "_" are NOT registered as designs.
import type { Design } from '../core/types';
import type { Mesh } from '../core/mesh';
import { blob, box, frustum, tendril } from '../core/primitives';
import { add, mulC, type RGB, type Vec3 } from '../core/vec';
import { DECOR_IRON, decorEntry } from './_decor';

export const TORCH_WOOD: RGB = [74, 52, 34];
const PITCH: RGB = [36, 28, 24];
/** The wall's plane (a placed design's tile's back edge). */
const W = -0.5;

/** A torch's flame: its tongues, its hotter core and the halo around it. */
export interface TorchFlame {
  tongue: RGB;
  core: RGB;
  halo: RGB;
}

/** The seeded draws a torch's flame uses (the build context's). */
interface Rolls {
  rf: (a: number, b: number) => number;
  ri: (a: number, b: number) => number;
}

/**
 * A torch's burning head at `head` (the top of its wooden shaft): wrapped in pitch, burning with `flame`: tongues
 * around a core, all lit from within, and a halo. Static (no flicker).
 */
export function torchHead(m: Mesh, c: Rolls, head: Vec3, flame: TorchFlame): void {
  const { rf, ri } = c;
  blob(m, head, [0.04, 0.05, 0.04], 0, 0.15, PITCH, { j: 0.1 });
  const base = add(head, [0, 0.03, 0]);
  for (let k = 0, n = ri(4, 5); k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rf(0, 0.6);
    tendril(m, add(base, [Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025]), [Math.cos(a) * 0.25, 1, Math.sin(a) * 0.25], rf(0.13, 0.2), 2, 0.032, flame.tongue, { e: 0.9, j: 0.06 });
  }
  tendril(m, base, [rf(-0.1, 0.1), 1, 0.05], rf(0.17, 0.22), 2, 0.03, flame.core, { e: 1, j: 0.04 });
  m.halo(add(base, [0, 0.1, 0.02]), 0.5, flame.halo);
}

/**
 * A wall torch design (`objectId`: its DECOR_OBJECTS entry): an iron plate on the wall with an arm holding a cup, a
 * wooden torch leaning out of it, its pitch-wrapped head burning with `flame`: tongues around a core, and a halo.
 * Static (no flicker). Placed, true size: its tile's center at the origin, the wall at z = -0.5 behind it, facing +z.
 */
export function wallTorchDesign(objectId: string, flame: TorchFlame): Design {
  return {
    ...decorEntry(objectId),
    category: 'decor',
    fit: { kind: 'placed', height: 1.5 },
    budget: 400,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      m.anchor('feet', [0, 0, 0]);
      const x = rf(-0.22, 0.22), y = rf(0.86, 0.98);

      // The bracket: a plate on the wall, an arm out to a cup
      box(m, [x, y, W + 0.02], [0.11, 0.2, 0.04], DECOR_IRON, 0.05, { j: 0.08 });
      frustum(m, [x, y - 0.03, W + 0.04], [x, y + 0.02, W + 0.19], 0.018, 0.016, 4, mulC(DECOR_IRON, 0.9));
      frustum(m, [x, y, W + 0.2], [x, y + 0.07, W + 0.22], 0.03, 0.045, 6, DECOR_IRON, { j: 0.1 });

      // The torch, leaning out of the cup, its head burning
      const head: Vec3 = [x, y + 0.24, W + 0.27];
      frustum(m, [x, y - 0.06, W + 0.17], head, 0.022, 0.026, 5, TORCH_WOOD, { j: 0.12 });
      torchHead(m, c, head, flame);
      return this.label;
    },
  };
}
