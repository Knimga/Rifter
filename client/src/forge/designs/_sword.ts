// Sword family shape, shared by every sword design (one design per data entry, e.g. plain-gladius.ts).
// The blade / guard / grip builders are also used by daggers (_dagger.ts).
import type { Design } from '../core/types';
import type { Mesh } from '../core/mesh';
import { blob, box, frustum, loft } from '../core/primitives';
import { add, mulC, rotZ, type RGB, type Vec3 } from '../core/vec';
import { WEAPON_ROLL, weaponEntry } from './_weapon';

/** Double-edged blade from y = 0 to the point at y = L, with a darker fuller down the middle. */
export function swordBlade(m: Mesh, L: number, w: number, t: number, metal: RGB): void {
  const hex = (y: number, ww: number, tt: number): Vec3[] => [
    [-ww, y, 0], [-ww * 0.45, y, tt], [ww * 0.45, y, tt], [ww, y, 0], [ww * 0.45, y, -tt], [-ww * 0.45, y, -tt],
  ];
  const prof = [[0, 1, 1], [0.5, 0.97, 1], [0.8, 0.82, 0.9], [0.93, 0.45, 0.6], [1, 0, 0]];
  m.part('blade');
  loft(m, prof.map(([f, sw, st]) => hex(f * L, w * sw, t * st)), metal, { j: 0.1 });
  box(m, [0, L * 0.46, 0], [0.045, L * 0.72, t * 2.5], mulC(metal, 0.45), 0, { j: 0.05 });
}

/** Cross-guard at height gy, half-width gw: a bar, optionally with angled wings or upturned hooks. */
export function swordGuard(m: Mesh, style: 'bar' | 'wing' | 'hook', gw: number, gy: number, trim: RGB): void {
  m.part('guard');
  box(m, [0, gy, 0], [gw * 2, 0.1, 0.2], trim, 0.05);
  if (style === 'wing')
    for (const sx of [-1, 1]) {
      const s0 = m.faces.length;
      box(m, [0, 0, 0], [0.28, 0.08, 0.16], trim, 0.05);
      m.xf(s0, (p) => add(rotZ(p, sx * 0.5), [sx * (gw + 0.08), gy + 0.06, 0]));
    }
  if (style === 'hook') for (const sx of [-1, 1]) box(m, [sx * (gw + 0.02), gy + 0.12, 0], [0.09, 0.28, 0.16], trim, 0.05);
}

/** Leather grip of length gl hanging below the guard at gy, with `wraps` trim bands and a round pommel. */
export function swordGrip(m: Mesh, gy: number, gl: number, wraps: number, leather: RGB, trim: RGB): void {
  m.part('grip');
  frustum(m, [0, gy - 0.05, 0], [0, gy - 0.05 - gl, 0], 0.06, 0.055, 6, leather);
  for (let k = 0; k < wraps; k++) {
    const y = gy - 0.1 - (k * gl) / wraps;
    frustum(m, [0, y, 0], [0, y - 0.04, 0], 0.072, 0.072, 6, trim);
  }
  blob(m, [0, gy - 0.05 - gl - 0.07, 0], [0.1, 0.1, 0.1], 0, 0.1, trim);
}

export function swordDesign(seriesId: string, weaponType: '1h Swords' | '2h Swords', version: number): Design {
  const { id, label, source, palette } = weaponEntry(seriesId, weaponType);
  const twoHanded = weaponType === '2h Swords';
  return {
    id, label, source, version,
    category: 'weapon',
    fit: { kind: 'item', size: 0.8 },
    budget: 500,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      // ---- parameters first, fixed order ----
      const guard = c.choice('guard', ['bar', 'wing', 'hook']);
      const { metal, trim, leather } = palette;

      // A two-hander has a much longer, broader blade (long relative to its hilt, so it reads clearly
      // apart from the one-hander) and a grip long enough for two hands
      const L = twoHanded ? rf(3.4, 3.9) : rf(1.7, 2.1);
      const w = twoHanded ? rf(0.19, 0.26) : rf(0.14, 0.2);
      const t = rf(0.05, 0.085);
      swordBlade(m, L, w, t, metal);

      // Guard half-width. A two-hander's is capped lower: a very wide guard makes its long blade look short.
      const gw = w * (twoHanded ? rf(2.0, 2.5) : rf(2.2, 3.2)) + 0.1, gy = -0.04;
      swordGuard(m, guard, gw, gy, trim);

      const gl = twoHanded ? rf(0.8, 1.0) : rf(0.45, 0.55);
      swordGrip(m, gy, gl, twoHanded ? 7 : 4, leather, trim);

      m.anchor('grip', [0, gy - 0.05 - gl / 2, 0]);
      m.anchor('tip', [0, L, 0]);
      m.xfAll((p) => rotZ(p, WEAPON_ROLL));
      return label;
    },
  };
}
