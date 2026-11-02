// Model for Skull (data/world/decorObjects.ts › skull): ground clutter. A yellowed human skull lying on its side on the
// floor, its eye sockets and nose dark hollows, its upper teeth showing (its jaw long gone).
// Placed, true size: on its tile, the floor at y = 0, facing +z.
import type { Design } from '../../core/types';
import { blob, box } from '../../core/primitives';
import { add, mixC, rotX, rotZ, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';

const BONE: RGB = [182, 172, 146];
const GRIME: RGB = [104, 96, 80];
const HOLLOW: RGB = [24, 20, 18];

const design: Design = {
  ...decorEntry('skull'),
  category: 'decor',
  fit: { kind: 'placed', height: 0.25 },
  budget: 300,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, 0]);
    const col = mixC(BONE, GRIME, rf(0, 0.3));
    const s0 = m.faces.length;
    // Cranium, then the face below its front: brow, cheeks, teeth
    blob(m, [0, 0.085, -0.01], [0.075, 0.07, 0.09], 1, 0.06, col, { j: 0.08 });
    blob(m, [0, 0.055, 0.055], [0.06, 0.04, 0.04], 0, 0.08, col, { j: 0.08 });
    for (const s of [-1, 1]) blob(m, [s * 0.028, 0.07, 0.083], [0.019, 0.016, 0.012], 0, 0.1, HOLLOW, { j: 0.05 });
    blob(m, [0, 0.047, 0.088], [0.009, 0.013, 0.008], 0, 0.1, HOLLOW, { j: 0.05 });
    for (let k = -2; k <= 2; k++) box(m, [k * 0.011, 0.024, 0.082], [0.009, 0.014, 0.008], mixC(col, [220, 214, 196], 0.3), 0.1, { j: 0.06 });
    // Lying on its side, a temple to the floor (either side), so its face and sockets show from above; a little larger
    // than life, so it reads at the game's scale
    const tilt = rf(-0.2, 0.15), roll = (c.chance(0.5) ? 1 : -1) * rf(1.25, 1.5);
    m.xf(s0, (p) => add(rotZ(rotX(p, tilt), roll), [0, 0.012, 0] as Vec3).map((v) => v * 1.2) as Vec3);
    // Kept above the floor whatever the tip
    const low = Math.min(...m.faces.slice(s0).flatMap((f) => f.v.map((v) => v[1])));
    if (low < 0) m.xf(s0, (p) => [p[0], p[1] - low, p[2]]);
    return this.label;
  },
};

export default design;
