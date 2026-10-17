import type { Design } from '../core/types';
import { blob, box, frustum } from '../core/primitives';
import { rotZ, type RGB, type Vec3 } from '../core/vec';
import { WEAPON_ROLL, weaponPalette } from './_weapon';

const design: Design = {
  id: 'weapon.axe',
  category: 'weapon',
  label: 'Axe',
  version: 1,
  fit: { kind: 'item', size: 0.8 },
  budget: 500,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const pal = weaponPalette(c);
    const double = c.chance('double', 0.4);
    const { metal, edge, trim, leather, wood } = pal;

    const Hh = rf(2.3, 2.9);
    m.part('haft');
    frustum(m, [0, 0, 0], [0, Hh, 0], 0.065, 0.055, 6, wood);
    for (let k = 0; k < 5; k++) {
      const y = 0.15 + k * 0.17;
      frustum(m, [0, y, 0], [0, y + 0.09, 0], 0.077, 0.077, 6, leather);
    }
    blob(m, [0, -0.04, 0], [0.09, 0.09, 0.09], 0, 0.1, trim);
    frustum(m, [0, Hh - 0.02, 0], [0, Hh + 0.38, 0], 0.07, 0.01, 5, metal);

    m.part('head');
    const w = rf(0.75, 1.1), h = rf(0.75, 1.0), yb = Hh - h - 0.12, t = rf(0.085, 0.13), cf = rf(0.85, 1.2);
    const pts: [number, number, number][] = [
      [0, 0, t], [-0.45, -0.1, t * 0.9], [-1, -0.3 * cf, 0], [-0.86, 0.5, 0], [-1, 1 + 0.3 * cf, 0], [-0.45, 1.1, t * 0.9], [0, 1, t],
    ];
    const side = (sg: number) => {
      const P: Vec3[] = pts.map(([x, y, th]) => [sg * x * w, yb + y * h, th]);
      const O: [number, number] = [sg * -0.3 * w, yb + 0.5 * h];
      const tO = t * 1.35;
      const ctr: Vec3 = [O[0], O[1], 0];
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const isEdge = a[2] === 0 && b[2] === 0;
        const cc: RGB = isEdge ? edge : metal;
        m.tri([O[0], O[1], tO], a, b, cc, ctr);
        m.tri([O[0], O[1], -tO], [a[0], a[1], -a[2]], [b[0], b[1], -b[2]], cc, ctr);
        if (a[2] > 0 || b[2] > 0) m.quad(a, b, [b[0], b[1], -b[2]], [a[0], a[1], -a[2]], metal, ctr);
      }
    };
    side(-1);
    if (double) side(1);
    else box(m, [0.16, yb + h * 0.5, 0], [0.24, h * 0.55, 0.22], metal, 0.06);
    frustum(m, [0, yb - 0.06, 0], [0, yb + 0.02, 0], 0.1, 0.1, 6, trim);
    frustum(m, [0, yb + h - 0.02, 0], [0, yb + h + 0.06, 0], 0.1, 0.1, 6, trim);

    m.anchor('grip', [0, 0.45, 0]);
    m.anchor('tip', [0, Hh + 0.38, 0]);
    m.xfAll((p) => rotZ(p, WEAPON_ROLL));
    return `${pal.materialName} ${double ? 'Battleaxe' : 'Hand Axe'}`;
  },
};
export default design;
