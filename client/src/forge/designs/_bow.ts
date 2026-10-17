// Bow shape (Bows), shared by every bow design (e.g. plain-shortbow.ts): a simple wooden D-bow with a
// wrapped grip and a straight string, drawn in the x-y plane so its outline reads face-on.
import type { Design } from '../core/types';
import { blob, frustum } from '../core/primitives';
import { rotZ, type Vec3 } from '../core/vec';
import { WEAPON_ROLL, weaponEntry } from './_weapon';

export function bowDesign(seriesId: string, version: number): Design {
  const { id, label, source, palette } = weaponEntry(seriesId, 'Bows'); // the series' metal isn't used
  return {
    id, label, source, version,
    category: 'weapon',
    fit: { kind: 'item', size: 0.8 },
    budget: 500,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { trim, leather, wood, string } = palette;

      // The limbs bow out to -x from a straight string at x = 0; the grip sits at the deepest point
      const H = rf(2.3, 2.6), depth = H * rf(0.17, 0.21), grip = 0.2;
      const STEPS = 6;
      const limbPoint = (sy: number, t: number): Vec3 => {
        // t = 0 at the grip, 1 at the tip
        const y = sy * (grip + t * (H / 2 - grip));
        return [-depth * (1 - t * t), y, 0];
      };

      m.part('limbs');
      for (const sy of [-1, 1]) {
        for (let i = 0; i < STEPS; i++) {
          const t0 = i / STEPS, t1 = (i + 1) / STEPS;
          frustum(m, limbPoint(sy, t0), limbPoint(sy, t1), 0.07 - 0.04 * t0, 0.07 - 0.04 * t1, 5, wood);
        }
        blob(m, limbPoint(sy, 1), [0.045, 0.045, 0.045], 0, 0.1, trim); // nock
      }

      m.part('grip');
      frustum(m, [-depth, -grip, 0], [-depth, grip, 0], 0.085, 0.085, 6, leather);
      for (const y of [-grip, grip - 0.04]) frustum(m, [-depth, y, 0], [-depth, y + 0.04, 0], 0.095, 0.095, 6, trim);

      m.part('string');
      frustum(m, limbPoint(-1, 1), limbPoint(1, 1), 0.014, 0.014, 3, string);

      m.anchor('grip', [-depth, 0, 0]);
      m.anchor('tip', limbPoint(1, 1));
      m.xfAll((p) => rotZ(p, WEAPON_ROLL));
      return label;
    },
  };
}
