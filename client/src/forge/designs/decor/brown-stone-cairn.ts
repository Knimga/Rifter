// Model for Brown Stone Cairn (data/world/decorObjects.ts › brown-stone-cairn): a geomancer's cairn on one tile. A few
// brown stones stacked upright, the biggest at the bottom, each flatter than it is wide and set a little off the one
// under it and tipped, so the stack barely balances; brown rubble lies scattered around its foot.
// Seeds vary the stones (how many, their size, shade, lean and tip) and the rubble.
// Placed, true size: its tile's center at the origin, the floor at y = 0.
import type { Design } from '../../core/types';
import { blob } from '../../core/primitives';
import { add, mulC, rotX, rotZ, sub, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';

/** The stones: rich, dark browns around Gorn's rock ([60, 38, 22]), a little lighter and darker. */
const STONES: RGB[] = [[66, 42, 24], [58, 37, 21], [76, 49, 28], [52, 33, 19]];
/** The rubble at its foot (Brown Rubble's stone). */
const RUBBLE: RGB = [78, 58, 50];

const design: Design = {
  ...decorEntry('brown-stone-cairn'),
  category: 'decor',
  fit: { kind: 'placed', height: 1.5 },
  budget: 800,
  build(c) {
    const m = c.mesh;
    const { rf, ri, pick } = c;
    m.anchor('feet', [0, 0, 0]);

    // The stack: each stone resting on the one under it, a little smaller, set off its middle and tipped (the off-set
    // drifting one way, then back, so the stack wavers but stays over its base)
    let y = 0, x = rf(-0.04, 0.04), z = rf(-0.04, 0.04);
    let r = rf(0.16, 0.19);
    const drift: Vec3 = [rf(-1, 1), 0, rf(-1, 1)];
    for (let k = 0, n = ri(3, 4); k < n; k++) {
      const h = r * rf(0.48, 0.62); // half its height: flat stones
      const center: Vec3 = [x, y + h * 0.92, z];
      const start = m.faces.length;
      blob(m, center, [r, h, r * rf(0.78, 0.95)], 1, 0.12, mulC(pick(STONES), rf(0.9, 1.1)), { j: 0.12, ...(k === 0 && { floorY: 0 }) });
      // Tipped a little about its own center (more the higher it sits: barely balanced)
      const tipX = rf(-0.14, 0.14) * (1 + k * 0.45), tipZ = rf(-0.14, 0.14) * (1 + k * 0.45);
      if (k > 0) m.xf(start, (p) => add(rotZ(rotX(sub(p, center), tipX), tipZ), center));
      y += h * 1.75;
      const off = r * rf(0.12, 0.28) * (k % 2 ? -1 : 1);
      x += drift[0] * off;
      z += drift[2] * off;
      r *= rf(0.78, 0.88);
    }

    // Rubble scattered around its foot, a couple of bigger chips among small grit
    for (let k = 0, n = ri(6, 9); k < n; k++) {
      const a = rf(0, Math.PI * 2), d = rf(0.2, 0.4), rr = k < 2 ? rf(0.035, 0.055) : rf(0.014, 0.03);
      blob(m, [Math.cos(a) * d, rr * 0.55, Math.sin(a) * d], [rr, rr * 0.7, rr * rf(0.7, 1)], 0, 0.3, mulC(RUBBLE, rf(0.8, 1.15)), { j: 0.16, floorY: 0 });
    }
    return this.label;
  },
};

export default design;
