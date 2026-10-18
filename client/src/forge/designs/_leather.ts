// Leather armor shapes (Light series in ARMOR_SERIES): cap, jerkin, gloves and boots. Shared by every
// leather armor design (e.g. leather-cap.ts); the series sets the colors (SERIES_PALETTE in _armor.ts).
// Items are built standing upright, front facing +z: that face is what the icon shows and what lies face-up as loot.
import type { Design } from '../core/types';
import { blob, box, frustum, loft } from '../core/primitives';
import { add, mulC, rotZ, type RGB, type Vec3 } from '../core/vec';
import { armorEntry, band, capDome, ell, footwearPair, glovePair, opening, panels } from './_armor';

// ─── Cap (helm) ───────────────────────────────────────────────────────────────

export function capDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'helm');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.55 },
    budget: 400,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main, trim, metal, cord } = palette;

      // Skullcap: a low dome sewn from eight panels in two shades
      m.part('dome');
      const r = rf(0.38, 0.41);
      capDome(m, r, panels(main, mulC(main, 0.86), 8), main, mulC(main, 0.6));

      // Thick leather rim around the brow, riveted at the front
      m.part('rim');
      band(m, 0.07, -0.05, r * 1.03, r * 1.08, r * 1.05, r * 1.1, trim);
      for (const a of [-0.55, 0, 0.55]) {
        blob(m, [Math.sin(a) * r * 1.06, 0.01, Math.cos(a) * r * 1.12], [0.025, 0.025, 0.02], 0, 0, metal);
      }

      // Ear flaps hanging at the sides, each with a tie cord
      m.part('flaps');
      for (const sx of [-1, 1]) {
        blob(m, [sx * r * 0.98, -0.13, 0.03], [0.06, 0.16, 0.12], 0, 0.05, main);
        frustum(m, [sx * r * 0.98, -0.27, 0.05], [sx * r * 0.94, -0.42, 0.07], 0.012, 0.01, 4, cord);
      }
      return label;
    },
  };
}

// ─── Jerkin (chest) ───────────────────────────────────────────────────────────

export function jerkinDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'chest');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.8 },
    budget: 700,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main, shadow, trim, cord, metal } = palette;

      // Body: a sleeveless, hip-length leather vest; broad at the shoulders, belted at the waist, with light pauldrons
      m.part('body');
      const hip = rf(0.34, 0.37);
      loft(m, [ell(1.0, 0.2, 0.13), ell(0.93, 0.37, 0.2), ell(0.72, 0.34, 0.2), ell(0.47, 0.3, 0.18), ell(0.12, hip, 0.2), ell(0, hip * 1.02, 0.21)], main);
      band(m, 0.97, 1.05, 0.215, 0.145, 0.205, 0.135, trim); // collar
      band(m, 0.07, -0.01, hip * 0.99, 0.2, hip * 1.04, 0.215, trim); // hem edging
      for (const sx of [-1, 1]) blob(m, [sx * 0.355, 0.79, 0], [0.025, 0.12, 0.1], 0, 0, shadow); // armholes

      // Laced front: a dark opening from the collar to the chest, crossed by pale laces
      m.part('lacing');
      box(m, [0, 0.8, 0.2], [0.05, 0.34, 0.012], shadow);
      for (const y of [0.92, 0.82, 0.72]) {
        frustum(m, [-0.055, y, 0.207], [0.055, y - 0.07, 0.207], 0.008, 0.008, 4, cord, { caps: false });
        frustum(m, [0.055, y, 0.207], [-0.055, y - 0.07, 0.207], 0.008, 0.008, 4, cord, { caps: false });
      }

      // Light pauldrons: two overlapping leather plates capping each shoulder, sloping down and out,
      // the lower one in darker leather, each held by a rivet
      m.part('pauldrons');
      for (const sx of [-1, 1]) {
        const plates: [Vec3, Vec3, RGB, number][] = [
          [[sx * 0.38, 0.88, 0], [0.16, 0.13, 0.2], main, 0.5],
          [[sx * 0.47, 0.77, 0], [0.12, 0.1, 0.18], trim, 0.8],
        ];
        for (const [ctr, r, col, tilt] of plates) {
          const s0 = m.faces.length;
          blob(m, [0, 0, 0], r, 1, 0.04, col, { floorY: 0 }); // a domed shell, open (flat) underneath
          blob(m, [0, r[1] * 0.85, r[2] * 0.55], [0.018, 0.018, 0.018], 0, 0, metal); // rivet
          m.xf(s0, (p) => add(rotZ(p, -sx * tilt), ctr));
        }
      }

      // Belt with an iron buckle
      m.part('belt');
      band(m, 0.5, 0.42, 0.305, 0.183, 0.31, 0.186, trim);
      box(m, [0.06, 0.46, 0.19], [0.085, 0.075, 0.02], metal);
      box(m, [0.06, 0.46, 0.2], [0.05, 0.04, 0.012], trim); // the strap showing through the buckle
      return label;
    },
  };
}

// ─── Gloves (gloves) ──────────────────────────────────────────────────────────

export function glovesDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'gloves');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.65 },
    budget: 700,
    build(c) {
      const m = c.mesh;
      const { main, shadow, trim, metal } = palette;
      const knuckle = mulC(main, 0.88);

      // A pair of leather gloves: solid leather, a darker band over the knuckles, and flared cuffs
      glovePair(m, c, {
        palm: () => main,
        finger: (k) => (k === 0 ? knuckle : main),
        thumb: () => main,
      }, () => {
        // Flared gauntlet cuff in darker leather, strapped and buckled at the wrist
        loft(m, [ell(0.03, 0.135, 0.062), ell(-0.17, 0.195, 0.1)], trim, { caps: false });
        opening(m, [0, -0.17, 0], 0.185, 0.095, shadow);
        band(m, 0.0, -0.05, 0.142, 0.07, 0.15, 0.074, mulC(trim, 0.8));
        box(m, [0, -0.025, 0.075], [0.05, 0.045, 0.012], metal);
      });
      return label;
    },
  };
}

// ─── Boots (boots) ────────────────────────────────────────────────────────────

export function bootsDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'boots');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.65 },
    budget: 600,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main, shadow, trim, sole, metal } = palette;

      // A pair of tall leather boots in side profile, toes to the left: a heeled sole, a shaft to mid-calf
      // with a folded-over top, and two buckled straps on the outside
      const L = rf(0.6, 0.66);
      const hx = L * 0.24; // the shaft stands over the heel
      footwearPair(m, [0.2, 0.2, -0.12], () => {
        box(m, [-L * 0.03, 0.025, 0], [L * 1.04, 0.05, 0.22], sole, 0.04);
        box(m, [L * 0.32, 0.04, 0], [0.16, 0.08, 0.21], sole); // heel
        blob(m, [-L * 0.06, 0.14, 0], [L * 0.5, 0.13, 0.12], 1, 0.03, main, { floorY: 0.05 }); // foot
        frustum(m, [hx, 0.12, 0], [hx + 0.02, 0.6, 0], 0.12, 0.13, 8, main); // shaft
        frustum(m, [hx + 0.02, 0.55, 0], [hx + 0.025, 0.68, 0], 0.145, 0.15, 8, trim); // folded top
        opening(m, [hx + 0.025, 0.68, 0], 0.14, 0.14, shadow);
        for (const y of [0.28, 0.44]) {
          loft(m, [ell(y + 0.025, 0.128, 0.128, 8, hx + 0.008), ell(y - 0.025, 0.126, 0.126, 8, hx + 0.008)], trim, { caps: false });
          box(m, [hx, y, 0.13], [0.06, 0.06, 0.015], metal); // buckle, on the side facing the viewer
        }
      });
      return label;
    },
  };
}
