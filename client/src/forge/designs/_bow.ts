// Bow shape (Bows), shared by every bow design (e.g. plain-shortbow.ts): a simple wooden D-bow with a
// wrapped grip and a straight string, drawn in the x-y plane so its outline reads face-on.
import type { Design } from '../core/types';
import type { Mesh } from '../core/mesh';
import { blob, frustum } from '../core/primitives';
import { rotZ, type RGB, type Vec3 } from '../core/vec';
import { WEAPON_ROLL, weaponEntry } from './_weapon';

export interface BowColors { wood: RGB; leather: RGB; trim: RGB; string: RGB }

/**
 * A D-bow `H` tall (limbs along y, centered on the origin), its limbs bowing out to -x by `depth` from a straight
 * string at x = 0, with a wrapped grip at the deepest point and nocks at the tips. The arrow line (string ->
 * grip) is -x. Returns the grip (at its center) and the top tip.
 */
export function bowShape(m: Mesh, H: number, depth: number, col: BowColors): { grip: Vec3; tip: Vec3 } {
  const grip = 0.2;
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
      frustum(m, limbPoint(sy, t0), limbPoint(sy, t1), 0.07 - 0.04 * t0, 0.07 - 0.04 * t1, 5, col.wood);
    }
    blob(m, limbPoint(sy, 1), [0.045, 0.045, 0.045], 0, 0.1, col.trim); // nock
  }

  m.part('grip');
  frustum(m, [-depth, -grip, 0], [-depth, grip, 0], 0.085, 0.085, 6, col.leather);
  for (const y of [-grip, grip - 0.04]) frustum(m, [-depth, y, 0], [-depth, y + 0.04, 0], 0.095, 0.095, 6, col.trim);

  m.part('string');
  frustum(m, limbPoint(-1, 1), limbPoint(1, 1), 0.014, 0.014, 3, col.string);
  return { grip: [-depth, 0, 0], tip: limbPoint(1, 1) };
}

export function bowDesign(seriesId: string): Design {
  const { id, label, source, palette } = weaponEntry(seriesId, 'Bows'); // the series' metal isn't used
  return {
    id, label, source,
    category: 'weapon',
    fit: { kind: 'item', size: 0.8 },
    budget: 500,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const H = rf(2.3, 2.6), depth = H * rf(0.17, 0.21);
      const { grip, tip } = bowShape(m, H, depth, palette);
      m.anchor('grip', grip);
      m.anchor('tip', tip);
      m.xfAll((p) => rotZ(p, WEAPON_ROLL));
      return label;
    },
  };
}
