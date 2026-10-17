import type { Design } from '../core/types';
import { blob, box, frustum, loft } from '../core/primitives';
import { add, mulC, rotZ, type Vec3 } from '../core/vec';
import { WEAPON_ROLL, weaponPalette } from './_weapon';

const design: Design = {
  id: 'weapon.sword',
  category: 'weapon',
  label: 'Sword',
  version: 1,
  fit: { kind: 'item', size: 0.8 },
  budget: 500,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const pal = weaponPalette(c); // draws 'material'
    const guard = c.choice('guard', ['bar', 'wing', 'hook']);
    const { metal, trim, leather } = pal;

    const L = rf(1.9, 2.7), w = rf(0.14, 0.26), t = rf(0.05, 0.085);
    const hex = (y: number, ww: number, tt: number): Vec3[] => [
      [-ww, y, 0], [-ww * 0.45, y, tt], [ww * 0.45, y, tt], [ww, y, 0], [ww * 0.45, y, -tt], [-ww * 0.45, y, -tt],
    ];
    const prof = [[0, 1, 1], [0.5, 0.97, 1], [0.8, 0.82, 0.9], [0.93, 0.45, 0.6], [1, 0, 0]];
    m.part('blade');
    loft(m, prof.map(([f, sw, st]) => hex(f * L, w * sw, t * st)), metal, { j: 0.1 });
    box(m, [0, L * 0.46, 0], [0.045, L * 0.72, t * 2.5], mulC(metal, 0.45), 0, { j: 0.05 });

    m.part('guard');
    const gw = w * rf(2.2, 3.2) + 0.1, gy = -0.04;
    box(m, [0, gy, 0], [gw * 2, 0.1, 0.2], trim, 0.05);
    if (guard === 'wing')
      for (const sx of [-1, 1]) {
        const s0 = m.faces.length;
        box(m, [0, 0, 0], [0.28, 0.08, 0.16], trim, 0.05);
        m.xf(s0, (p) => add(rotZ(p, sx * 0.5), [sx * (gw + 0.08), gy + 0.06, 0]));
      }
    if (guard === 'hook') for (const sx of [-1, 1]) box(m, [sx * (gw + 0.02), gy + 0.12, 0], [0.09, 0.28, 0.16], trim, 0.05);
    m.part('grip');
    const gl = rf(0.5, 0.7);
    frustum(m, [0, gy - 0.05, 0], [0, gy - 0.05 - gl, 0], 0.06, 0.055, 6, leather);
    for (let k = 0; k < 4; k++) {
      const y = gy - 0.1 - (k * gl) / 4;
      frustum(m, [0, y, 0], [0, y - 0.04, 0], 0.072, 0.072, 6, trim);
    }
    blob(m, [0, gy - 0.05 - gl - 0.07, 0], [0.1, 0.1, 0.1], 0, 0.1, trim);

    m.anchor('grip', [0, gy - 0.05 - gl / 2, 0]);
    m.anchor('tip', [0, L, 0]);
    m.xfAll((p) => rotZ(p, WEAPON_ROLL));

    const kind = L < 2.1 ? 'Shortsword' : w < 0.17 ? 'Rapier' : w < 0.22 ? 'Longsword' : 'Broadsword';
    return `${pal.materialName} ${kind}`;
  },
};
export default design;
