// Model for Mushroom Cluster (data/world/decorObjects.ts › mushroom-cluster): ground clutter. A clump of three to six
// small mushrooms of the Fungal Forest on pale stalks, leaning apart, their caps in one muted hue (violet, ochre or
// moss), one tall, the rest short, a faint glow hanging over them (yellow, orange or green).
// Placed, true size: on its tile, the floor at y = 0.
import type { Design } from '../../core/types';
import { mulC, type RGB } from '../../core/vec';
import { decorEntry } from '../_decor';
import { mush } from '../_fungal';

/** Cap colors (one per clump): bruise violet, ochre, moss. */
const CAPS: RGB[] = [[112, 70, 104], [144, 106, 62], [92, 108, 66]];
const GILL: RGB = [188, 170, 140];
/** The faint glow over a clump (one per clump): spore yellow, ember orange, lichen green; dim, so it stays subtle. */
const GLOWS: RGB[] = [[150, 140, 50], [160, 90, 34], [90, 150, 56]];

const design: Design = {
  ...decorEntry('mushroom-cluster'),
  category: 'decor',
  fit: { kind: 'placed', height: 0.4 },
  budget: 600,
  build(c) {
    const m = c.mesh;
    const { rf, ri, pick } = c;
    m.anchor('feet', [0, 0, 0]);
    const cap = pick(CAPS);
    const gx = rf(-0.12, 0.12), gz = rf(-0.12, 0.12);
    for (let k = 0, n = ri(3, 6); k < n; k++) {
      const a = rf(0, Math.PI * 2), d = k === 0 ? 0 : rf(0.05, 0.16);
      const h = k === 0 ? rf(0.16, 0.24) : rf(0.05, 0.12), r = k === 0 ? rf(0.07, 0.1) : rf(0.035, 0.065);
      // Leaning out from the clump's middle
      mush(c, [gx + Math.cos(a) * d, 0, gz + Math.sin(a) * d], h, r, mulC(cap, rf(0.85, 1.1)), GILL,
        { lean: [Math.cos(a) * d * 1.6, Math.sin(a) * d * 1.6], sides: 6, spots: k === 0 ? ri(0, 3) : 0 });
    }
    m.halo([gx, 0.14, gz], 0.28, pick(GLOWS));
    return this.label;
  },
};

export default design;
