// Model for Stalagmite Cluster (data/world/decorObjects.ts › stalagmite-cluster): obstacle, 2 x 2 tiles, blocks sight.
// A tall cluster of stalagmites rising from a mound of flowstone: one or two great spires, smaller ones crowding around
// them, near-black rock wet and paler toward their tips, a few pale mineral flecks.
// Placed, true size: its four tiles centered on the origin.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { bipyr, blob, loft, wobbleRing } from '../../core/primitives';
import { mixC, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';

/** The Blind Caverns' own rock (its floor's color), a little darker at the foot; paler and wet toward the tips. */
const ROCK: RGB = [30, 31, 35];
const WET: RGB = [52, 54, 60];
const FLECK: RGB = [98, 106, 118];

/** A stalagmite at (x, z): `h` tall, `r` wide at its foot, kinking as it narrows to a point, paler toward its tip. */
function spire(m: Mesh, x: number, z: number, h: number, r: number, R: () => number): Vec3 {
  const kx = (R() - 0.5) * 0.12, kz = (R() - 0.5) * 0.12;
  const steps = [0, 0.25, 0.55, 0.82, 1];
  const rings = steps.map((t) => wobbleRing([x + kx * t * t * h, t * h, z + kz * t * t * h], r * (1 - t * 0.96), r * (1 - t * 0.96), 6, 0.18, R));
  loft(m, rings, (p) => mixC(ROCK, WET, Math.min(1, (p[1] / h) ** 1.5)), { j: 0.16, caps: false, bandCenters: true });
  return rings[rings.length - 1][0];
}

const design: Design = {
  ...decorEntry('stalagmite-cluster'),
  category: 'decor',
  fit: { kind: 'placed', height: 2.3 },
  budget: 1100,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);
    // The flowstone mound they rise from
    blob(m, [0, 0.04, 0], [0.82, 0.14, 0.82], 1, 0.12, ROCK, { j: 0.12, floorY: 0 });
    // One or two great spires near the middle, then smaller ones around them
    const big = ri(1, 2);
    for (let k = 0; k < big; k++) spire(m, rf(-0.25, 0.25), rf(-0.25, 0.25), rf(1.6, 2.1), rf(0.26, 0.33), m.R);
    for (let k = 0, n = ri(4, 7); k < n; k++) {
      const a = rf(0, Math.PI * 2), d = rf(0.35, 0.62), r = rf(0.1, 0.2);
      spire(m, Math.cos(a) * d, Math.sin(a) * d, rf(0.4, 1.2), r, m.R);
    }
    for (let k = 0, n = ri(3, 6); k < n; k++) bipyr(m, [rf(-0.5, 0.5), rf(0.05, 0.12), rf(-0.5, 0.5)], 0.02, 0.03, 4, FLECK, { j: 0.1 });
    return this.label;
  },
};

export default design;
