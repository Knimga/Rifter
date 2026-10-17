// Mace family shape (1h Maces, 2h Maces), shared by every mace design (e.g. plain-mace.ts, plain-maul.ts).
// One-handers are flanged or knobbed maces; two-handers are mauls with a heavy block head.
import type { Design } from '../core/types';
import type { Mesh } from '../core/mesh';
import { bipyr, blob, box, frustum } from '../core/primitives';
import { add, mulC, rotY, rotZ, type RGB } from '../core/vec';
import { WEAPON_ROLL, weaponEntry } from './_weapon';

/** Leather-wrapped grip at the bottom of a haft, with trim bands and a pommel. */
function haftGrip(m: Mesh, len: number, r: number, leather: RGB, trim: RGB): void {
  blob(m, [0, -0.05, 0], [r * 1.5, r * 1.5, r * 1.5], 0, 0.1, trim);
  frustum(m, [0, 0, 0], [0, len, 0], r * 1.15, r * 1.1, 6, leather);
  for (const y of [0.02, len - 0.04]) frustum(m, [0, y, 0], [0, y + 0.05, 0], r * 1.3, r * 1.3, 6, trim);
}

export function maceDesign(seriesId: string, weaponType: '1h Maces' | '2h Maces', version: number): Design {
  const { id, label, source, palette } = weaponEntry(seriesId, weaponType);
  const maul = weaponType === '2h Maces';
  return {
    id, label, source, version,
    category: 'weapon',
    fit: { kind: 'item', size: 0.8 },
    budget: 500,
    build(c) {
      const m = c.mesh;
      const { rf, ri } = c;
      // ---- parameters first, fixed order ----
      // Only one-handed maces choose a head style (per design, not per seed, so the draw order stays fixed)
      const head = maul ? 'block' : c.choice('head', ['flanged', 'knobbed']);
      const { metal, trim, leather, wood } = palette;
      const dark = mulC(metal, 0.7);

      // Haft: a maul's is long and stout
      const H = maul ? rf(2.9, 3.3) : rf(1.5, 1.8);
      const r = maul ? 0.07 : 0.06;
      m.part('haft');
      frustum(m, [0, 0, 0], [0, H, 0], r, r * 0.9, 6, wood);
      haftGrip(m, maul ? 0.9 : 0.5, r, leather, trim);

      m.part('head');
      if (head === 'block') {
        // Maul: a heavy iron block across the haft, banded near each end, with metal straps down the haft
        const hw = rf(0.85, 1.0), hh = rf(0.42, 0.52), hd = rf(0.4, 0.48);
        const cy = H + hh * 0.35;
        box(m, [0, cy, 0], [hw, hh, hd], metal, 0.04, { j: 0.1 });
        for (const sx of [-1, 1]) box(m, [sx * hw * 0.32, cy, 0], [0.08, hh * 1.06, hd * 1.06], dark, 0.02);
        for (const sx of [-1, 1]) box(m, [sx * (r + 0.015), H - 0.28, 0], [0.03, 0.55, 0.1], dark, 0.05);
      } else {
        // Mace: a metal collar and core cylinder at the top of the haft
        const top = H + 0.05;
        frustum(m, [0, H - 0.08, 0], [0, H + 0.02, 0], r * 1.6, r * 1.6, 6, trim);
        const S = 1.35; // head scale: big enough to read as a mace head at tile size
        frustum(m, [0, top, 0], [0, top + 0.42 * S, 0], 0.11 * S, 0.1 * S, 6, dark);
        if (head === 'flanged') {
          // Thin plates radiating around the core: a toothed outline from any side
          const n = ri(6, 7);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const s0 = m.faces.length;
            box(m, [0.15 * S, 0, 0], [0.16 * S, 0.38 * S, 0.035 * S], metal, 0.04, { j: 0.12 });
            m.xf(s0, (p) => add(rotY(p, a), [0, top + 0.21 * S, 0]));
          }
        } else {
          // Knobbed: a round head studded with short points
          blob(m, [0, top + 0.21 * S, 0], [0.2 * S, 0.22 * S, 0.2 * S], 1, 0.05, metal);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2, y = top + (0.21 + (i % 2 ? 0.08 : -0.08)) * S;
            bipyr(m, [Math.cos(a) * 0.2 * S, y, Math.sin(a) * 0.2 * S], 0.04 * S, 0.05 * S, 4, dark);
          }
        }
        blob(m, [0, top + 0.47 * S, 0], [0.06 * S, 0.06 * S, 0.06 * S], 0, 0.1, trim); // finial
      }

      m.anchor('grip', [0, (maul ? 0.9 : 0.5) / 2, 0]);
      m.anchor('tip', [0, H + 0.5, 0]);
      m.xfAll((p) => rotZ(p, WEAPON_ROLL));
      return label;
    },
  };
}
