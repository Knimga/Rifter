// Crossbow shape (Crossbows), shared by every crossbow design (e.g. plain-crossbow.ts): seen from above,
// a wooden stock with an iron prod across the front and the string drawn back to the nut.
import type { Design } from '../core/types';
import { box, frustum } from '../core/primitives';
import { mulC, rotZ, type Vec3 } from '../core/vec';
import { WEAPON_ROLL, weaponEntry } from './_weapon';

export function crossbowDesign(seriesId: string): Design {
  const { id, label, source, palette } = weaponEntry(seriesId, 'Crossbows');
  return {
    id, label, source,
    category: 'weapon',
    fit: { kind: 'item', size: 0.8 },
    budget: 500,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { metal, trim, wood, string } = palette;

      // Stock: a broad butt, then a narrower tiller running up to the prod
      const Ls = rf(1.9, 2.2);
      m.part('stock');
      box(m, [0, 0.22, 0], [0.26, 0.44, 0.2], wood, 0.06);
      box(m, [0, (0.44 + Ls) / 2, 0], [0.15, Ls - 0.44, 0.16], wood, 0.04);
      box(m, [0, Ls - 0.06, 0], [0.2, 0.14, 0.2], mulC(metal, 0.8), 0.04); // iron nose holding the prod

      // Prod: two iron arms sweeping slightly back from the nose
      const yP = Ls - 0.08, span = rf(0.8, 0.95), sweep = rf(0.14, 0.22);
      const prodPoint = (sx: number, t: number): Vec3 => [sx * span * t, yP - sweep * t * t, 0];
      m.part('prod');
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const t0 = i / 4, t1 = (i + 1) / 4;
          frustum(m, prodPoint(sx, t0), prodPoint(sx, t1), 0.055 - 0.025 * t0, 0.055 - 0.025 * t1, 5, metal);
        }
      }

      // String drawn back from both prod tips to the nut on the stock
      const nut: Vec3 = [0, Ls * 0.52, 0];
      m.part('string');
      for (const sx of [-1, 1]) frustum(m, prodPoint(sx, 1), nut, 0.014, 0.014, 3, string);
      box(m, nut, [0.18, 0.06, 0.18], trim, 0.05);

      m.anchor('grip', [0, 0.5, 0]);
      m.anchor('tip', [0, Ls + 0.1, 0]);
      m.xfAll((p) => rotZ(p, WEAPON_ROLL));
      return label;
    },
  };
}
