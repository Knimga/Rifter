// Model for Leather Quiver (data/gear/offhands.ts › QUIVERS leather-quiver); the starting Worn Quiver borrows it.
// Exactly the quiver the Archer used to wear as part of its body: a brown leather quiver worn across the back,
// its mouth over the right shoulder, three arrows' fletchings showing, and its strap across the chest from the
// right shoulder to the left hip. Built where it sits on a body (body units: QUIVER_ON_BACK), and it marks its
// two ends ('quiver_bottom', 'quiver_top'), so equip.ts puts it back exactly there on whoever wears it.
import type { Design } from '../core/types';
import { box, frustum } from '../core/primitives';
import { add, type RGB } from '../core/vec';
import { QUIVER_ON_BACK, TORSO } from './_character';

const QUIVER: RGB = [104, 70, 44];
const STRAP: RGB = [62, 44, 32];
const SHAFT: RGB = [92, 70, 48];
const FLETCH: RGB = [214, 206, 188];

const design: Design = {
  id: 'offhand.leather-quiver',
  source: { table: 'offhands', key: 'leather-quiver' },
  category: 'offhand',
  label: 'Leather Quiver',
  fit: { kind: 'item', size: 0.6 },
  budget: 300,
  build(c) {
    const m = c.mesh;
    const { bottom, top } = QUIVER_ON_BACK;

    // Strap across the chest, from the right shoulder to the left hip
    m.part('quiver', [0, TORSO.chest, -0.14]);
    frustum(m, [-0.15, TORSO.shoulder + 0.02, 0.118], [0.16, TORSO.hip + 0.08, 0.112], 0.017, 0.017, 4, STRAP);
    // The quiver across the back, its mouth over the right shoulder, with arrow fletchings showing
    frustum(m, bottom, top, 0.052, 0.062, 7, QUIVER);
    frustum(m, top, add(top, [-0.01, 0.025, -0.002]), 0.068, 0.068, 7, STRAP, { caps: false }); // rim
    for (const [dx, dz] of [[-0.02, 0.012], [0.015, -0.01], [-0.005, -0.03]] as const) {
      const base = add(top, [dx, 0.02, dz]);
      frustum(m, base, add(base, [-0.025, 0.07, -0.004]), 0.008, 0.008, 3, SHAFT); // shaft
      box(m, add(base, [-0.03, 0.08, -0.004]), [0.012, 0.06, 0.034], FLETCH); // fletching
    }

    // Its two ends, where it lines up with a body's (equip.ts)
    m.anchor('quiver_bottom', bottom);
    m.anchor('quiver_top', top);
    return 'Leather Quiver';
  },
};

export default design;
