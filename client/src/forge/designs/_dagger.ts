// Dagger shape (Daggers), shared by every dagger design (e.g. plain-dirk.ts). A short sword: it reuses the
// sword's blade, guard and grip builders at dagger proportions.
import type { Design } from '../core/types';
import { rotZ } from '../core/vec';
import { WEAPON_ROLL, weaponEntry } from './_weapon';
import { swordBlade, swordGrip, swordGuard } from './_sword';

export function daggerDesign(seriesId: string, version: number): Design {
  const { id, label, source, palette } = weaponEntry(seriesId, 'Daggers');
  return {
    id, label, source, version,
    category: 'weapon',
    // Smaller than swords (0.8): items are scaled to fill their fit size, so a dagger at 0.8 would be
    // stretched to sword length. This keeps it a short blade on the tile and in its icon.
    fit: { kind: 'item', size: 0.55 },
    budget: 400,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      // ---- parameters first, fixed order ----
      const guard = c.choice('guard', ['bar', 'hook']);
      const { metal, trim, leather } = palette;

      // Short, slim blade on a compact hilt
      const L = rf(1.0, 1.25), w = rf(0.12, 0.16), t = rf(0.045, 0.07);
      swordBlade(m, L, w, t, metal);
      const gw = w * rf(1.6, 2.1) + 0.05, gy = -0.04;
      swordGuard(m, guard, gw, gy, trim);
      const gl = rf(0.38, 0.45);
      swordGrip(m, gy, gl, 3, leather, trim);

      m.anchor('grip', [0, gy - 0.05 - gl / 2, 0]);
      m.anchor('tip', [0, L, 0]);
      m.xfAll((p) => rotZ(p, WEAPON_ROLL));
      return label;
    },
  };
}
