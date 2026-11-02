// Loose rubble (ground clutter: DECOR_OBJECTS with placement 'ground'): every rubble's shape, each in its own stone.
// Files starting with "_" are NOT registered as designs.
import type { Design } from '../core/types';
import { blob } from '../core/primitives';
import { mulC, type RGB } from '../core/vec';
import { decorEntry } from './_decor';

/**
 * A rubble design (`objectId`: its DECOR_OBJECTS entry): a scatter of broken stones in `stone`, a couple of larger
 * chunks among small grit, grouped around a spot off the tile's center, lying low on the floor. Placed, true size: on
 * its tile, the floor at y = 0.
 */
export function rubbleDesign(objectId: string, stone: RGB): Design {
  return {
    ...decorEntry(objectId),
    category: 'decor',
    fit: { kind: 'placed', height: 0.2 },
    budget: 400,
    build(c) {
      const m = c.mesh;
      const { rf, ri } = c;
      m.anchor('feet', [0, 0, 0]);
      // Grouped around a spot off the tile's center, the biggest first
      const gx = rf(-0.15, 0.15), gz = rf(-0.15, 0.15);
      for (let k = 0, n = ri(5, 9); k < n; k++) {
        const r = k < 2 ? rf(0.06, 0.1) : rf(0.02, 0.05);
        const spread = 0.12 + k * 0.025, a = rf(0, Math.PI * 2);
        blob(m, [gx + Math.cos(a) * spread * rf(0.3, 1), r * 0.55, gz + Math.sin(a) * spread * rf(0.3, 1)], [r, r * 0.7, r * rf(0.7, 1)], 0, 0.3,
          mulC(stone, rf(0.8, 1.15)), { j: 0.16, floorY: 0 });
      }
      return this.label;
    },
  };
}
