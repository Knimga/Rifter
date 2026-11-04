// Model for Floor Torch (data/world/decorObjects.ts › floor-torch): a free-standing torch on one tile. A thin iron pole
// reaching from the floor up to a cup at about a character's head height, held upright by a tripod of three short
// splayed feet at its foot; a wooden torch stands in the cup, its pitch-wrapped head burning with an ordinary orange
// flame (the Wall Torch's: _torch.ts torchHead), the flame just above head height. Static (no flicker).
// Placed, true size: its tile's center at the origin, the floor at y = 0.
import type { Design } from '../../core/types';
import { frustum } from '../../core/primitives';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { mulC, type Vec3 } from '../../core/vec';
import { DECOR_IRON, decorEntry } from '../_decor';
import { TORCH_WOOD, torchHead } from '../_torch';

/** The cup's height: a little under a character's head, so the flame burns at about head height. */
const CUP_Y = CHARACTER_HEIGHT - 0.1;

const design: Design = {
  ...decorEntry('floor-torch'),
  category: 'decor',
  fit: { kind: 'placed', height: 1.5 },
  budget: 360,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, 0]);

    // The tripod: three short feet splaying out from low on the pole to the floor, a little foot pad on each
    const knee = 0.2, spread = 0.15, turn = rf(0, Math.PI * 2);
    for (let k = 0; k < 3; k++) {
      const a = turn + (k / 3) * Math.PI * 2;
      const foot: Vec3 = [Math.cos(a) * spread, 0.012, Math.sin(a) * spread];
      frustum(m, [0, knee, 0], foot, 0.015, 0.013, 4, DECOR_IRON, { j: 0.08 });
      frustum(m, [foot[0], 0, foot[2]], [foot[0], 0.016, foot[2]], 0.022, 0.018, 5, mulC(DECOR_IRON, 0.85));
    }
    // The pole, from the floor up to the cup, a collar where the tripod meets it
    frustum(m, [0, 0, 0], [0, CUP_Y, 0], 0.02, 0.017, 5, DECOR_IRON, { j: 0.06 });
    frustum(m, [0, knee - 0.02, 0], [0, knee + 0.03, 0], 0.024, 0.024, 6, mulC(DECOR_IRON, 0.9));
    // The cup: a small iron bowl the torch stands in
    frustum(m, [0, CUP_Y, 0], [0, CUP_Y + 0.07, 0], 0.028, 0.046, 6, DECOR_IRON, { j: 0.08 });

    // The torch: a short wooden shaft standing in the cup, its head burning
    const head: Vec3 = [rf(-0.01, 0.01), CUP_Y + 0.18, rf(-0.01, 0.01)];
    frustum(m, [0, CUP_Y + 0.02, 0], head, 0.022, 0.026, 5, TORCH_WOOD, { j: 0.12 });
    torchHead(m, c, head, { tongue: [255, 128, 36], core: [255, 214, 120], halo: [255, 170, 80] });
    return this.label;
  },
};

export default design;
