// Hide armor shapes (Medium series in ARMOR_SERIES): skullcap, hauberk, gauntlets and boots. Shared by
// every hide armor design (e.g. hide-skullcap.ts); the series sets the colors (SERIES_PALETTE in _armor.ts).
// Rough and rustic: rawhide panels, sinew stitching, patched spots, bone toggles and dark fur trim.
// Items are built standing upright, front facing +z: that face is what the icon shows and what lies face-up as loot.
import type { Design } from '../core/types';
import { blob, box, frustum, loft } from '../core/primitives';
import { add, mulC, type Vec3 } from '../core/vec';
import { armorEntry, band, capDome, ell, footwearPair, fur, glovePair, panels } from './_armor';

/** A bone toggle: a short horizontal peg, as hide armor's fastening. */
function toggle(m: Parameters<typeof frustum>[0], c: Vec3, len: number, col: [number, number, number]): void {
  frustum(m, add(c, [-len / 2, 0, 0]), add(c, [len / 2, 0, 0]), 0.018, 0.016, 5, col);
}

// ─── Skullcap (helm) ──────────────────────────────────────────────────────────

export function skullcapDesign(seriesId: string, version: number): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'helm');
  return {
    id, label, source, version,
    category: 'armor',
    fit: { kind: 'item', size: 0.55 },
    budget: 400,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main, cord, fur: furCol } = palette;

      // A low rawhide dome of four rough panels, its front seam sewn with crude sinew stitches
      m.part('dome');
      const r = rf(0.38, 0.41);
      capDome(m, r, panels(main, mulC(main, 0.86), 4), main, mulC(main, 0.6));
      for (const [y, k] of [[0.12, 1.02], [0.22, 0.95], [0.32, 0.8]] as const) {
        frustum(m, [-0.04, y, r * k + 0.004], [0.04, y + 0.015, r * k + 0.004], 0.01, 0.01, 4, cord);
      }

      // A thick ring of dark fur tufts around the brim
      m.part('fur');
      for (let i = 0; i < 10; i++) {
        const t = (i / 10) * Math.PI * 2;
        fur(m, [Math.cos(t) * r * 1.02, 0.04, Math.sin(t) * r * 1.07], [0.12, 0.085, 0.12], furCol, 0);
      }
      return label;
    },
  };
}

// ─── Hauberk (chest) ──────────────────────────────────────────────────────────

export function hauberkDesign(seriesId: string, version: number): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'chest');
  return {
    id, label, source, version,
    category: 'armor',
    fit: { kind: 'item', size: 0.85 },
    budget: 700,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main, trim, metal, fur: furCol } = palette;
      const hem = rf(0.39, 0.42);

      // Body: a long hide tunic to mid-thigh, with short sleeves; patched in two places
      m.part('body');
      loft(m, [ell(1.0, 0.2, 0.13), ell(0.93, 0.38, 0.21), ell(0.7, 0.34, 0.2), ell(0.48, 0.31, 0.19), ell(0.15, 0.37, 0.22), ell(-0.1, hem, 0.23)], main);
      box(m, [-0.14, 0.7, 0.198], [0.11, 0.09, 0.012], mulC(main, 0.82), 0.25);
      box(m, [0.15, 0.24, 0.212], [0.1, 0.08, 0.012], mulC(main, 1.1), 0.25);
      for (const sx of [-1, 1]) {
        const end: Vec3 = [sx * 0.5, 0.62, 0];
        frustum(m, [sx * 0.3, 0.9, 0], end, 0.12, 0.11, 6, main);
        frustum(m, end, add(end, [sx * 0.02, -0.04, 0]), 0.116, 0.118, 6, trim, { caps: false });
      }

      // Ragged hem: tabs of hide hanging below the front edge
      m.part('hem');
      for (let i = -3; i <= 3; i++) {
        const x = i * 0.105, z = 0.23 * Math.sqrt(Math.max(0, 1 - (x / hem) ** 2)) + 0.006;
        const len = 0.1 + ((i * 7 + 3) % 4) * 0.02; // uneven lengths
        m.tri([x - 0.05, -0.08, z], [x + 0.05, -0.08, z], [x, -0.08 - len, z], mulC(main, 0.92), [0, -0.1, 0]);
      }

      // Rawhide belt fastened with a bone toggle
      m.part('belt');
      band(m, 0.5, 0.43, 0.315, 0.192, 0.32, 0.196, trim);
      toggle(m, [0, 0.465, 0.205], 0.1, metal);

      // A mantle of dark fur over the shoulders and around the neck
      m.part('fur');
      for (let i = 0; i < 9; i++) {
        const t = (i / 9) * Math.PI * 2;
        fur(m, [Math.cos(t) * 0.28, 0.97, Math.sin(t) * 0.17], [0.12, 0.08, 0.1], furCol, 0);
      }
      return label;
    },
  };
}

// ─── Gauntlets (gloves) ───────────────────────────────────────────────────────

export function gauntletsDesign(seriesId: string, version: number): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'gloves');
  return {
    id, label, source, version,
    category: 'armor',
    fit: { kind: 'item', size: 0.7 },
    budget: 900,
    build(c) {
      const m = c.mesh;
      const { main, trim, fur: furCol } = palette;
      const knuckle = mulC(main, 0.86);

      // A pair of heavy hide gloves whose long cuffs run up the forearm like bracers, bound with hide
      // strips and lined with fur at the open end
      glovePair(m, c, {
        palm: () => main,
        finger: (k) => (k === 0 ? knuckle : main),
        thumb: () => main,
      }, () => {
        const len = 0.3;
        const rx = (y: number) => 0.14 + (-y / len) * 0.025, rz = (y: number) => 0.066 + (-y / len) * 0.022;
        loft(m, [ell(0.03, rx(0.03), rz(0.03)), ell(-len, rx(-len), rz(-len))], mulC(main, 0.92), { caps: false });
        for (const y of [-0.05, -0.14, -0.23]) {
          band(m, y + 0.022, y - 0.022, rx(y) + 0.006, rz(y) + 0.005, rx(y) + 0.007, rz(y) + 0.006, trim);
        }
        fur(m, [0, -len, 0], [0.2, 0.05, 0.115], furCol);
      });
      return label;
    },
  };
}

// ─── Boots (boots) ────────────────────────────────────────────────────────────

export function bootsDesign(seriesId: string, version: number): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'boots');
  return {
    id, label, source, version,
    category: 'armor',
    fit: { kind: 'item', size: 0.65 },
    budget: 600,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main, trim, sole, metal, fur: furCol } = palette;

      // A pair of rugged hide boots in side profile, toes to the left: a broad, lumpy foot on a thick sole,
      // a shaft to mid-calf bound with two hide strips (bone toggles facing the viewer), and fur at the top
      const L = rf(0.6, 0.66);
      const hx = L * 0.24; // the shaft stands over the heel
      footwearPair(m, [0.2, 0.18, -0.12], () => {
        box(m, [-L * 0.03, 0.03, 0], [L * 1.06, 0.06, 0.24], sole, 0.08);
        blob(m, [-L * 0.06, 0.15, 0], [L * 0.52, 0.14, 0.13], 1, 0.06, main, { floorY: 0.055 }); // foot
        frustum(m, [hx, 0.12, 0], [hx + 0.02, 0.52, 0], 0.13, 0.14, 8, main); // shaft
        for (const y of [0.24, 0.4]) {
          const r = 0.13 + ((y - 0.12) / 0.4) * 0.01 + 0.008;
          loft(m, [ell(y + 0.03, r, r, 8, hx + 0.01), ell(y - 0.03, r, r, 8, hx + 0.01)], trim, { caps: false });
          toggle(m, [hx + 0.01, y, r + 0.015], 0.07, metal);
        }
        fur(m, [hx + 0.02, 0.54, 0], [0.18, 0.08, 0.17], furCol);
      });
      return label;
    },
  };
}
