// Cloth armor shapes (Cloth series in ARMOR_SERIES): hood, robes, handwraps and shoes. Shared by every
// cloth armor design (e.g. apprentice-hood.ts); the series sets the colors (SERIES_PALETTE in _armor.ts).
// Items are built standing upright, front facing +z: that face is what the icon shows and what lies face-up as loot.
import type { Design } from '../core/types';
import { blob, box, frustum, loft } from '../core/primitives';
import { add, mulC, type RGB, type Vec3 } from '../core/vec';
import { armorEntry, band, ell, fanCap, footwearPair, glovePair, opening } from './_armor';

// ─── Hood (helm) ──────────────────────────────────────────────────────────────

export function hoodDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'helm');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.6 },
    budget: 400,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main: cloth, shadow, trim } = palette;

      // Cowl: lofted from crown to hem. Flat on the sides (narrow in x, deep in z), it narrows where the
      // cloth gathers under the chin, then hangs in soft folds that droop lowest at the front.
      m.part('cowl');
      const N = 12;
      const w = rf(0.36, 0.4); // half-width at the widest point
      const drop = rf(0.12, 0.18); // how far the front of the hem hangs below the back
      const folds = (k: number) => (p: Vec3, i: number): Vec3 => [p[0] * (1 + (i % 2 ? k : -k)), p[1], p[2] * (1 + (i % 2 ? k : -k))];
      const rings: Vec3[][] = [
        ell(0.92, 0.12, 0.14, N, 0, -0.06),
        ell(0.86, w * 0.8, 0.3, N, 0, -0.03),
        ell(0.68, w, 0.4, N),
        ell(0.45, w * 0.97, 0.39, N),
        ell(0.28, w * 0.82, 0.32, N, 0, 0.02).map(folds(0.05)), // gathered under the chin
        ell(0.1, w * 1.08, 0.36, N, 0, 0.05).map(folds(0.09)), // loose folds below
      ].map((r, k, all) => (k === all.length - 1 ? r.map((p): Vec3 => [p[0], p[1] - Math.max(0, p[2]) * drop * 2.5, p[2]]) : r));
      loft(m, rings, cloth, { caps: false });
      fanCap(m, rings[0], cloth, [0, 0.55, 0]); // crown
      fanCap(m, rings[rings.length - 1], shadow, [0, 0.55, 0]); // the dark inside, seen from below
      // Face opening: a linen-edged oval with a deep shadow inside, set into the flat front
      blob(m, [0, 0.56, 0.3], [w * 0.7, 0.27, 0.11], 1, 0, trim);
      blob(m, [0, 0.54, 0.33], [w * 0.55, 0.22, 0.1], 1, 0, shadow);
      return label;
    },
  };
}

// ─── Robes (chest) ────────────────────────────────────────────────────────────

export function robesDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'chest');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.85 },
    budget: 600,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main: cloth, shadow, trim, cord } = palette;

      // Body: narrow shoulders, a cinched waist, then a long skirt flaring to the hem
      m.part('body');
      const hem = rf(0.42, 0.48);
      loft(m, [ell(1.02, 0.2, 0.13), ell(0.94, 0.34, 0.18), ell(0.6, 0.27, 0.16), ell(0, hem, hem * 0.6)], cloth);
      band(m, 0.08, -0.01, hem * 0.88, hem * 0.53, hem * 1.03, hem * 0.62, trim); // hem edging
      // V neckline: a shadowed triangle on the chest, edged in linen
      const nz = 0.165;
      m.tri([-0.13, 1.0, nz + 0.01], [0, 0.78, nz + 0.03], [0.13, 1.0, nz + 0.01], trim, [0, 0.9, 0]);
      m.tri([-0.09, 0.99, nz + 0.02], [0, 0.83, nz + 0.04], [0.09, 0.99, nz + 0.02], shadow, [0, 0.9, 0]);

      // Bell sleeves hanging down and out, with linen cuffs
      m.part('sleeves');
      for (const sx of [-1, 1]) {
        const end: Vec3 = [sx * rf(0.5, 0.56), 0.4, 0];
        frustum(m, [sx * 0.28, 0.92, 0], end, 0.1, 0.16, 6, cloth);
        frustum(m, end, add(end, [sx * 0.03, -0.06, 0]), 0.165, 0.17, 6, trim, { caps: false });
        blob(m, add(end, [sx * 0.03, -0.065, 0]), [0.14, 0.01, 0.14], 0, 0, shadow); // inside of the cuff
      }

      // Rope sash at the waist, its knotted ends hanging to one side
      m.part('sash');
      band(m, 0.63, 0.56, 0.285, 0.17, 0.29, 0.175, cord);
      const kx = rf(0.08, 0.14);
      blob(m, [kx, 0.59, 0.17], [0.04, 0.035, 0.03], 0, 0.1, cord);
      for (const [dx, len] of [[-0.015, rf(0.2, 0.26)], [0.025, rf(0.15, 0.2)]] as const) {
        frustum(m, [kx + dx, 0.57, 0.18], [kx + dx * 2, 0.57 - len, 0.2], 0.014, 0.012, 4, cord);
      }
      return label;
    },
  };
}

// ─── Handwraps (gloves) ───────────────────────────────────────────────────────

export function handwrapsDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'gloves');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.65 },
    budget: 700,
    build(c) {
      const m = c.mesh;
      const { wrap, cord } = palette;
      const wrapDark: RGB = [wrap[0] * 0.8, wrap[1] * 0.8, wrap[2] * 0.78];

      // A pair of gloves made of wrapped linen: alternating light and dark bands are the windings
      glovePair(m, c, {
        palm: (k) => (k % 2 ? wrapDark : wrap),
        finger: (k) => (k % 2 ? wrap : wrapDark),
        thumb: (k) => (k ? wrap : wrapDark),
      }, () => {
        // Cuff: flaring a little past the wrist, tied with a cord where it meets the hand
        loft(m, [ell(0.02, 0.13, 0.06), ell(-0.13, 0.165, 0.085)], wrap, { caps: false });
        blob(m, [0, -0.13, 0], [0.155, 0.01, 0.078], 0, 0, mulC(wrap, 0.45)); // inside of the cuff
        band(m, 0.03, -0.01, 0.135, 0.065, 0.137, 0.067, cord);
      });
      return label;
    },
  };
}

// ─── Shoes (boots) ────────────────────────────────────────────────────────────

export function shoesDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'boots');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.6 },
    budget: 400,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main: cloth, shadow, sole, cord } = palette;

      // A pair of soft slippers in side profile, toes to the left; the second sits behind and a little
      // higher, so both read in the straight-on icon.
      const L = rf(0.58, 0.66);
      footwearPair(m, [0.2, 0.17, -0.12], () => {
        box(m, [-L * 0.03, 0.0175, 0], [L * 1.02, 0.035, 0.22], sole, 0.05);
        blob(m, [-L * 0.05, 0.12, 0], [L * 0.52, 0.13, 0.12], 1, 0.03, cloth, { floorY: 0.03 }); // foot
        frustum(m, [L * 0.22, 0.12, 0], [L * 0.25, 0.36, 0], 0.115, 0.13, 7, cloth); // ankle
        opening(m, [L * 0.25, 0.36, 0], 0.115, 0.115, shadow);
        loft(m, [ell(0.29, 0.13, 0.13, 8, L * 0.24), ell(0.26, 0.128, 0.128, 8, L * 0.24)], cord, { caps: false }); // tie
      });
      return label;
    },
  };
}
