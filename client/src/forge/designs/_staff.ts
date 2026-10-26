// Staff shape (Staves), shared by every staff design (e.g. plain-staff.ts). Wands have their own shape (_wand.ts).
import type { Design } from '../core/types';
import { bipyr, frustum, tube } from '../core/primitives';
import { add, mixC, rotZ, type RGB, type Vec3 } from '../core/vec';
import { PALE_CRYSTALS, WEAPON_ROLL, weaponEntry } from './_weapon';

/** Head size, relative to the shaft: the prongs and the crystal they cradle, together. */
const HEAD = 0.55;

export function staffDesign(seriesId: string): Design {
  const k = HEAD;
  const { id, label, source, palette } = weaponEntry(seriesId, 'Staves'); // the series' metal isn't used
  return {
    id, label, source,
    category: 'weapon',
    fit: { kind: 'item', size: 0.8 },
    budget: 600,
    build(c) {
      const m = c.mesh;
      const { rf, ri } = c;
      const { trim, wood } = palette;

      // Long wooden shaft with three gently wandering segments and trim rings at the joints
      const Hs = rf(2.3, 3) * 1.35;
      const pts: Vec3[] = [[0, 0, 0]];
      for (let i = 1; i <= 3; i++) pts.push([rf(-0.05, 0.05), (Hs * i) / 3, rf(-0.05, 0.05)]);
      m.part('shaft');
      tube(m, pts, 0.07, 0.062, 6, wood, { perSegment: true });
      for (let i = 1; i <= 3; i++) frustum(m, add(pts[i], [0, -0.04, 0]), add(pts[i], [0, 0.04, 0]), 0.09, 0.09, 6, trim);

      // Head: curling prongs cradling a single pale crystal (no floating shards)
      m.part('head');
      const top = pts[3];
      const crystal: RGB = mixC([...c.pick(PALE_CRYSTALS)], [235, 235, 238], rf(0, 0.25));
      const np = ri(3, 4);
      for (let i = 0; i < np; i++) {
        const a = (i / np) * 2 * Math.PI + rf(0, 0.4);
        const d: Vec3 = [Math.cos(a), 0, Math.sin(a)];
        const q1 = add(top, [d[0] * 0.26 * k, 0.16 * k, d[2] * 0.26 * k]);
        const q2 = add(q1, [d[0] * 0.1 * k, 0.36 * k, d[2] * 0.1 * k]);
        const q3 = add(q2, [-d[0] * 0.2 * k, 0.3 * k, -d[2] * 0.2 * k]);
        frustum(m, top, q1, 0.05 * k, 0.042 * k, 5, trim);
        frustum(m, q1, q2, 0.042 * k, 0.034 * k, 5, trim);
        frustum(m, q2, q3, 0.034 * k, 0.012 * k, 5, trim);
      }
      const cc: Vec3 = [top[0], top[1] + 0.52 * k, top[2]];
      // Lit (not glowing): a soft, washed-out crystal, still faceted
      bipyr(m, cc, 0.2 * k * rf(0.9, 1.2), 0.5 * k * rf(0.9, 1.3), ri(5, 6), crystal, { e: 0.25, j: 0.12 });

      m.anchor('grip', [0, Hs * 0.35, 0]);
      m.anchor('tip', cc);
      m.xfAll((p) => rotZ(p, WEAPON_ROLL));
      return label;
    },
  };
}
