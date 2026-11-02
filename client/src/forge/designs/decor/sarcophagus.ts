// Model for Sarcophagus (data/world/decorObjects.ts › sarcophagus): obstacle, 1 x 2 tiles, low enough to see over. A
// dark stone coffin on a plinth, its sides banded with a carved line, its heavy bevelled lid raised along its middle;
// on some the lid has been pushed a little askew.
// Placed, true size: its two tiles centered on the origin, along z (its foot toward +z).
import type { Design } from '../../core/types';
import { box } from '../../core/primitives';
import { add, mulC, rotY, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';

const STONE: RGB = [46, 45, 53];
const DARK: RGB = [30, 29, 36];
const LID: RGB = [52, 51, 59];

const design: Design = {
  ...decorEntry('sarcophagus'),
  category: 'decor',
  fit: { kind: 'placed', height: 0.75 },
  budget: 400,
  build(c) {
    const m = c.mesh;
    const { rf, chance } = c;
    m.anchor('feet', [0, 0, 0]);
    const stone = mulC(STONE, rf(0.9, 1.08));
    // Plinth, coffin, and a carved band around its sides
    box(m, [0, 0.06, 0], [0.84, 0.12, 1.84], DARK, 0.01, { j: 0.08 });
    box(m, [0, 0.31, 0], [0.7, 0.38, 1.66], stone, 0.012, { j: 0.1 });
    box(m, [0, 0.33, 0], [0.72, 0.035, 1.68], mulC(DARK, 0.8), 0, { j: 0.06 });
    // The lid: a slab with a raised ridge down its middle
    const s0 = m.faces.length;
    box(m, [0, 0.54, 0], [0.78, 0.08, 1.76], LID, 0.01, { j: 0.08 });
    box(m, [0, 0.6, 0], [0.5, 0.05, 1.46], mulC(LID, 1.05), 0.01, { j: 0.08 });
    // Askew: slid and turned a little off the coffin
    if (chance(0.3)) {
      const turn = rf(-0.07, 0.07), slide: Vec3 = [rf(-0.02, 0.02), 0, rf(-0.05, 0.05)];
      m.xf(s0, (p) => add(rotY(p, turn), slide));
    }
    return this.label;
  },
};

export default design;
