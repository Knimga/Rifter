// Model for Smoldering Embers (data/world/decorObjects.ts › smoldering-embers): ground clutter. A few lumps of charcoal
// in a ring of reddish ash (blending with the Firelands floor), cracked through with glowing orange, a couple of sparks hanging above them and a faint warm
// glow on the floor.
// Placed, true size: on its tile, the floor at y = 0.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { bipyr, crackedBlob } from '../../core/primitives';
import { mulC, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';
import { floorGlow } from '../_glow';

const CHAR: RGB = [40, 26, 22];
const EMBER: RGB = [255, 110, 32];
const SPARK: RGB = [255, 196, 96];
/** Reddish, like the Firelands floor it lies on. */
const ASH: RGB = [80, 50, 42];

/** A flat ragged ring of ash on the floor. */
function ash(m: Mesh, x: number, z: number, r: number, R: () => number): void {
  const n = 9, pts: Vec3[] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, k = r * (0.7 + R() * 0.5);
    return [x + Math.cos(a) * k, 0.003, z + Math.sin(a) * k];
  });
  for (let i = 0; i < n; i++) m.tri([x, 0.003, z], pts[i], pts[(i + 1) % n], mulC(ASH, 0.8 + R() * 0.3), [x, -1, z], { j: 0.08 });
}

const design: Design = {
  ...decorEntry('smoldering-embers'),
  category: 'decor',
  fit: { kind: 'placed', height: 0.4 },
  budget: 500,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);
    floorGlow(m, [150, 54, 20], 0.32, 0.32, 12);
    ash(m, 0, 0, rf(0.2, 0.26), m.R);
    for (let k = 0, n = ri(3, 5); k < n; k++) {
      const a = rf(0, Math.PI * 2), d = rf(0, 0.13), r = rf(0.035, 0.07);
      crackedBlob(m, [Math.cos(a) * d, r * 0.5, Math.sin(a) * d], [r, r * 0.65, r * rf(0.7, 1)], 0, 0.3, CHAR, EMBER, rf(0.2, 0.35));
    }
    for (let k = 0, n = ri(1, 3); k < n; k++) bipyr(m, [rf(-0.1, 0.1), rf(0.14, 0.3), rf(-0.1, 0.1)], 0.012, 0.024, 4, SPARK, { e: 1, j: 0.04 });
    m.halo([0, 0.08, 0], 0.3, [255, 120, 50]);
    return this.label;
  },
};

export default design;
