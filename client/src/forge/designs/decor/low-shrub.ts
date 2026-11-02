// Model for Low Shrub (data/world/decorObjects.ts › low-shrub): ground clutter. A low, scraggly bush of dark olive
// leaf clumps, a few bare twigs poking out of it.
// Placed, true size: on its tile, the floor at y = 0.
import type { Design } from '../../core/types';
import { blob, tendril } from '../../core/primitives';
import { mulC, type RGB } from '../../core/vec';
import { decorEntry } from '../_decor';

const LEAVES: RGB[] = [[56, 72, 40], [46, 60, 36], [68, 80, 46]];
const TWIG: RGB = [66, 52, 40];

const design: Design = {
  ...decorEntry('low-shrub'),
  category: 'decor',
  fit: { kind: 'placed', height: 0.45 },
  budget: 500,
  build(c) {
    const m = c.mesh;
    const { rf, ri, pick } = c;
    m.anchor('feet', [0, 0, 0]);
    const gx = rf(-0.1, 0.1), gz = rf(-0.1, 0.1);
    for (let k = 0, n = ri(5, 8); k < n; k++) {
      const a = rf(0, Math.PI * 2), d = rf(0, 0.18), r = rf(0.08, 0.13);
      blob(m, [gx + Math.cos(a) * d, r * rf(0.7, 1.4), gz + Math.sin(a) * d], [r, r * 0.8, r], 0, 0.3, mulC(pick(LEAVES), rf(0.85, 1.1)), { j: 0.18, floorY: 0 });
    }
    // Bare twigs poking out
    for (let k = 0, n = ri(2, 4); k < n; k++) {
      const a = rf(0, Math.PI * 2);
      tendril(m, [gx, 0.08, gz], [Math.cos(a), rf(0.6, 1.2), Math.sin(a)], rf(0.22, 0.3), 2, 0.012, TWIG, { sides: 3 });
    }
    return this.label;
  },
};

export default design;
