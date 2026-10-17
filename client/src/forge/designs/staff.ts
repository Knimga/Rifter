import type { Design } from '../core/types';
import { bipyr, blob, frustum } from '../core/primitives';
import { add, rotZ, type RGB, type Vec3 } from '../core/vec';
import { WEAPON_ROLL, weaponPalette } from './_weapon';

const GEMS = [[90, 220, 255], [255, 110, 150], [150, 255, 110], [200, 150, 255]] as const;

const design: Design = {
  id: 'weapon.staff',
  category: 'weapon',
  label: 'Staff',
  version: 1,
  fit: { kind: 'item', size: 0.8 },
  budget: 600,
  build(c) {
    const m = c.mesh;
    const { R, rf, ri } = c;
    const pal = weaponPalette(c); // material has no visual effect on staves
    const crystal = c.chance('crystal', 0.55);
    const { trim, wood } = pal;

    const Hs = rf(2.3, 3);
    const pts: Vec3[] = [[0, 0, 0]];
    for (let i = 1; i <= 3; i++) pts.push([rf(-0.05, 0.05), (Hs * i) / 3, rf(-0.05, 0.05)]);
    m.part('shaft');
    for (let i = 0; i < 3; i++) frustum(m, pts[i], pts[i + 1], 0.07, 0.062, 6, wood);
    for (let i = 1; i <= 3; i++) frustum(m, add(pts[i], [0, -0.04, 0]), add(pts[i], [0, 0.04, 0]), 0.09, 0.09, 6, trim);

    m.part('head');
    const top = pts[3];
    const gc: RGB = [...c.pick(GEMS)];
    const np = ri(3, 4);
    for (let i = 0; i < np; i++) {
      const a = (i / np) * 2 * Math.PI + rf(0, 0.4);
      const d: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      const q1 = add(top, [d[0] * 0.26, 0.16, d[2] * 0.26]);
      const q2 = add(q1, [d[0] * 0.1, 0.36, d[2] * 0.1]);
      const q3 = add(q2, [-d[0] * 0.2, 0.3, -d[2] * 0.2]);
      frustum(m, top, q1, 0.05, 0.042, 5, trim);
      frustum(m, q1, q2, 0.042, 0.034, 5, trim);
      frustum(m, q2, q3, 0.034, 0.012, 5, trim);
    }
    const cc: Vec3 = [top[0], top[1] + 0.52, top[2]];
    if (crystal) bipyr(m, cc, 0.2 * rf(0.9, 1.2), 0.5 * rf(0.9, 1.3), ri(5, 6), gc, { e: 0.75, j: 0.2 });
    else blob(m, cc, [0.26, 0.26, 0.26], 1, 0.12, gc, { e: 0.75 });
    for (let k = 0, n = ri(2, 4); k < n; k++) {
      const a = R() * 6.28;
      bipyr(m, [cc[0] + Math.cos(a) * 0.45, cc[1] + rf(-0.2, 0.4), cc[2] + Math.sin(a) * 0.45], 0.05, 0.13, 4, gc, { e: 0.85 });
    }
    m.anchor('grip', [0, Hs * 0.35, 0]);
    m.anchor('tip', cc);
    m.xfAll((p) => rotZ(p, WEAPON_ROLL));
    return crystal ? 'Crystal Staff' : 'Orb Staff';
  },
};
export default design;
