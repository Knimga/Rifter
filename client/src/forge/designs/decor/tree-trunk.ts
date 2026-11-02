// Model for Tree Trunk (data/world/decorObjects.ts › tree-trunk): obstacle, 1 tile, blocks sight. The trunk of a giant
// tree of the Fungal Forest, gnarled and dark, rising taller than anything around it to a splintered break, roots
// clawing over its tile, moss at its foot and shelf fungi up its side with a few glowing spores.
// Placed, true size: its tile centered on the origin.
import type { Design } from '../../core/types';
import { bipyr, blob, frustum, loft, tendril, wobbleRing } from '../../core/primitives';
import { mulC, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';
import { shelf } from '../_fungal';

const BARK: RGB = [58, 50, 44];
const SPLINTER: RGB = [104, 88, 66];
const MOSS: RGB = [58, 80, 42];
const FUNGUS: RGB = [146, 120, 80];
const SPORE: RGB = [206, 232, 112];
/** How tall the trunk stands to its break. */
const H = 2.1;

const design: Design = {
  ...decorEntry('tree-trunk'),
  category: 'decor',
  fit: { kind: 'placed', height: 2.4 },
  budget: 1100,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);
    const bark = mulC(BARK, rf(0.9, 1.1));
    // The trunk: wide at its foot, narrowing a little, wandering as it rises
    const lean: Vec3 = [rf(-0.03, 0.03), 0, rf(-0.03, 0.03)];
    const rings = [0, 0.12, 0.5, 1.0, 1.5, H].map((y, i) => {
      const r = i === 0 ? 0.33 : i === 1 ? 0.29 : 0.27 - (y / H) * 0.05;
      return wobbleRing([lean[0] * y, y, lean[2] * y], r, r, 9, 0.12, m.R);
    });
    loft(m, rings, (p) => mulC(bark, 0.85 + 0.25 * (p[1] / H)), { j: 0.16, caps: false, bandCenters: true });
    // Its top: a dark hollow core and splinters standing up around the break
    const top = rings[rings.length - 1], tc: Vec3 = [lean[0] * H, H - 0.05, lean[2] * H];
    for (let i = 0; i < top.length; i++) m.tri(tc, top[i], top[(i + 1) % top.length], mulC(SPLINTER, 0.45), [tc[0], 0, tc[2]], { j: 0.1 });
    for (let i = 0; i < top.length; i += ri(1, 2)) {
      const p = top[i];
      frustum(m, [p[0] * 0.9, H - 0.02, p[2] * 0.9], [p[0] * 0.85, H + rf(0.08, 0.25), p[2] * 0.85], rf(0.035, 0.055), 0.005, 4, SPLINTER, { j: 0.12 });
    }
    // Roots clawing out over the tile
    for (let k = 0, n = ri(4, 6); k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rf(-0.3, 0.3);
      tendril(m, [Math.cos(a) * 0.2, 0.14, Math.sin(a) * 0.2], [Math.cos(a), -0.3, Math.sin(a)], rf(0.2, 0.27), 3, 0.08, bark,
        { sides: 4, bend: (t) => [0, Math.sin(t * Math.PI) * 0.03, 0] });
    }
    // Moss at its foot, shelf fungi up its side
    for (let k = 0, n = ri(2, 4); k < n; k++) {
      const a = rf(0, Math.PI * 2);
      blob(m, [Math.cos(a) * 0.3, rf(0.04, 0.3), Math.sin(a) * 0.3], [0.09, 0.07, 0.09], 0, 0.25, mulC(MOSS, rf(0.85, 1.15)), { j: 0.16, floorY: 0 });
    }
    for (let k = 0, n = ri(2, 4); k < n; k++) {
      const a = rf(0, Math.PI * 2), y = rf(0.5, 1.6), r = rf(0.06, 0.09), at: Vec3 = [Math.cos(a) * (0.27 + r * 0.7), y, Math.sin(a) * (0.27 + r * 0.7)];
      shelf(c, at, -a, r, mulC(FUNGUS, rf(0.85, 1.1)));
      if (k === 0) bipyr(m, [at[0], y - 0.05, at[2]], 0.015, 0.028, 4, SPORE, { e: 0.85, j: 0.05 });
    }
    return this.label;
  },
};

export default design;
