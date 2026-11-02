// Model for Scattered Bones (data/world/decorObjects.ts › scattered-bones): ground clutter. A few old long bones lying
// every which way, knobbed at both ends, in yellowed ivory, and sometimes a curved rib among them.
// Placed, true size: on its tile, the floor at y = 0.
import type { Design } from '../../core/types';
import { blob, frustum, tube } from '../../core/primitives';
import { mixC, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';

const BONE: RGB = [176, 166, 140];
const GRIME: RGB = [104, 96, 80];

const design: Design = {
  ...decorEntry('scattered-bones'),
  category: 'decor',
  fit: { kind: 'placed', height: 0.2 },
  budget: 650,
  build(c) {
    const m = c.mesh;
    const { rf, ri, chance } = c;
    m.anchor('feet', [0, 0, 0]);
    for (let k = 0, n = ri(3, 5); k < n; k++) {
      const col = mixC(BONE, GRIME, rf(0, 0.35));
      const a = rf(0, Math.PI), len = rf(0.16, 0.28), r = rf(0.016, 0.024);
      const cx = rf(-0.28, 0.28), cz = rf(-0.28, 0.28), dx = (Math.cos(a) * len) / 2, dz = (Math.sin(a) * len) / 2;
      const p0: Vec3 = [cx - dx, r * 1.5, cz - dz], p1: Vec3 = [cx + dx, r * 1.5, cz + dz];
      frustum(m, p0, p1, r, r * 0.9, 5, col, { j: 0.1 });
      // Knobbed ends, each a pair of lumps
      for (const p of [p0, p1])
        for (const s of [-1, 1]) blob(m, [p[0] - Math.sin(a) * s * r * 0.7, r * 1.5, p[2] + Math.cos(a) * s * r * 0.7], [r * 1.2, r * 1.3, r * 1.2], 0, 0.15, col, { j: 0.1, floorY: 0 });
    }
    // A rib, curved, lying on its side
    if (chance(0.6)) {
      const a = rf(0, Math.PI * 2), cx = rf(-0.2, 0.2), cz = rf(-0.2, 0.2), R = rf(0.1, 0.14);
      const pts: Vec3[] = Array.from({ length: 5 }, (_, i) => {
        const t = a + (i / 4) * 1.6;
        return [cx + Math.cos(t) * R, 0.014, cz + Math.sin(t) * R];
      });
      tube(m, pts, 0.013, 0.008, 4, mixC(BONE, GRIME, rf(0, 0.3)), { j: 0.1 });
    }
    return this.label;
  },
};

export default design;
