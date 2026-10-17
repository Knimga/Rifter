// Wand shape (Wands): a short, one-handed rod with a simple pale crystal at the tip. Shared by every
// wand design (e.g. plain-wand.ts). Deliberately unlike the staff: no prongs, no long shaft.
import type { Design } from '../core/types';
import { bipyr, blob, frustum } from '../core/primitives';
import { mixC, rotZ, type RGB } from '../core/vec';
import { PALE_CRYSTALS, WEAPON_ROLL, weaponEntry } from './_weapon';

export function wandDesign(seriesId: string, version: number): Design {
  const { id, label, source, palette } = weaponEntry(seriesId, 'Wands'); // the series' metal isn't used
  return {
    id, label, source, version,
    category: 'weapon',
    // Smaller than other weapons (0.8): items are scaled to fill their fit size, so a wand at 0.8 would
    // be stretched to staff length. This keeps it a short, one-handed rod on the tile and in its icon.
    fit: { kind: 'item', size: 0.5 },
    budget: 300,
    build(c) {
      const m = c.mesh;
      const { rf, ri } = c;
      const { trim, wood, leather } = palette;

      // Short tapered rod: a wrapped handle, then a slimmer wooden length up to a small collar
      // Stubby proportions (thick for its length) so it reads as a hand-held rod, not a staff or a spear
      const L = rf(0.95, 1.1);
      const handle = L * rf(0.36, 0.42);
      m.part('rod');
      blob(m, [0, -0.04, 0], [0.085, 0.085, 0.085], 0, 0.1, trim); // pommel
      frustum(m, [0, 0, 0], [0, handle, 0], 0.075, 0.07, 6, leather);
      frustum(m, [0, handle, 0], [0, handle + 0.06, 0], 0.088, 0.088, 6, trim);
      frustum(m, [0, handle + 0.06, 0], [0, L, 0], 0.065, 0.05, 6, wood);
      frustum(m, [0, L - 0.02, 0], [0, L + 0.07, 0], 0.075, 0.09, 6, trim); // collar holding the crystal

      // One simple pale crystal, lit (not glowing)
      m.part('head');
      const crystal: RGB = mixC([...c.pick(PALE_CRYSTALS)], [235, 235, 238], rf(0, 0.25));
      const tip: [number, number, number] = [0, L + 0.07 + 0.11, 0];
      bipyr(m, tip, 0.11 * rf(0.9, 1.15), 0.2 * rf(0.9, 1.15), ri(5, 6), crystal, { e: 0.25, j: 0.12 });

      m.anchor('grip', [0, handle / 2, 0]);
      m.anchor('tip', tip);
      m.xfAll((p) => rotZ(p, WEAPON_ROLL));
      return label;
    },
  };
}
