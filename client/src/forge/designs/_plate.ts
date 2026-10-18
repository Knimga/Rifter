// Plate armor shapes (Heavy series in ARMOR_SERIES): helm, breastplate, gauntlets and sabatons. Shared by
// every plate armor design (e.g. iron-helm.ts); the series sets the colors (SERIES_PALETTE in _armor.ts).
// Smooth plates with brighter rolled edges, overlapping lames where the wearer bends, rivets and dark openings.
// Items are built standing upright, front facing +z: that face is what the icon shows and what lies face-up as loot.
import type { Design } from '../core/types';
import { blob, box, frustum, loft } from '../core/primitives';
import { add, mulC, rotZ, type RGB, type Vec3 } from '../core/vec';
import { armorEntry, band, ell, fanCap, footwearPair, glovePair, opening } from './_armor';

/** A small domed rivet head. */
function rivet(m: Parameters<typeof blob>[0], c: Vec3, col: RGB): void {
  blob(m, c, [0.018, 0.018, 0.014], 0, 0, col);
}

// ─── Helm (helm) ──────────────────────────────────────────────────────────────

export function helmDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'helm');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.6, groundPitchDeg: -55 }, // as loot it rests tipped back, not flat: the open underside stays out of view
    budget: 500,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main, shadow, trim, metal } = palette;

      // A closed great helm: straight sides rising to a rounded top, deeper front-to-back than wide
      m.part('shell');
      const w = rf(0.29, 0.31);
      const rings = [ell(0, w, 0.33, 10), ell(0.45, w * 1.03, 0.34, 10), ell(0.6, w * 0.95, 0.32, 10), ell(0.72, w * 0.72, 0.25, 10), ell(0.79, w * 0.32, 0.12, 10)];
      loft(m, rings, main, { caps: false });
      fanCap(m, rings[rings.length - 1], main, [0, 0.4, 0]);
      fanCap(m, rings[0], mulC(main, 0.45), [0, 0.4, 0]); // the inside, seen from below (lying as loot, it faces the camera)
      band(m, 0.05, -0.01, w * 1.02, 0.335, w * 1.03, 0.34, trim); // rolled bottom edge

      // Face: a dark eye slit across the front, a raised ridge down the middle, and breathing holes
      m.part('face');
      for (const sx of [-1, 1]) box(m, [sx * 0.1, 0.5, 0.3], [0.15, 0.035, 0.09], shadow);
      box(m, [0, 0.38, 0.335], [0.035, 0.66, 0.03], trim);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) box(m, [0.09 + i * 0.045, 0.24 - j * 0.07, 0.315], [0.018, 0.03, 0.04], shadow);
      for (const sx of [-1, 1]) rivet(m, [sx * w * 0.86, 0.1, 0.18], metal); // where the chin strap fastens
      return label;
    },
  };
}

// ─── Breastplate (chest) ──────────────────────────────────────────────────────

export function breastplateDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'chest');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.8 },
    budget: 600,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main, shadow, trim, cord, metal } = palette;

      // Cuirass: a shaped plate swelling forward at the chest and narrowing to the waist
      m.part('cuirass');
      const chest = rf(0.24, 0.26);
      loft(m, [ell(0.97, 0.2, 0.13), ell(0.9, 0.36, 0.2), ell(0.64, 0.34, chest, 8, 0, 0.03), ell(0.36, 0.29, 0.19), ell(0.22, 0.31, 0.2)], main);
      band(m, 1.0, 0.95, 0.205, 0.135, 0.21, 0.14, trim); // rolled neck edge
      box(m, [0, 0.58, 0.272], [0.03, 0.62, 0.03], trim); // center ridge
      for (const sx of [-1, 1]) blob(m, [sx * 0.345, 0.76, 0], [0.025, 0.12, 0.1], 0, 0, shadow); // armholes

      // Leather straps over the shoulders, buckled at the front
      for (const sx of [-1, 1]) {
        box(m, [sx * 0.23, 0.93, 0.08], [0.07, 0.06, 0.18], cord);
        box(m, [sx * 0.23, 0.87, 0.19], [0.05, 0.04, 0.02], metal);
      }

      // Faulds: three overlapping lames hanging from the waist, each flaring a little more, riveted at the sides
      m.part('faulds');
      const lames: [number, number, number][] = [[0.24, 0.31, 0.2], [0.15, 0.33, 0.215], [0.06, 0.35, 0.23]];
      lames.forEach(([y, rx, rz], i) => {
        band(m, y, y - 0.1, rx, rz, rx + 0.025, rz + 0.012, i % 2 ? mulC(main, 0.9) : main);
        band(m, y - 0.085, y - 0.105, rx + 0.022, rz + 0.011, rx + 0.026, rz + 0.013, trim);
        for (const sx of [-1, 1]) rivet(m, [sx * (rx - 0.05), y - 0.05, rz * 0.82 + 0.03], metal);
      });
      return label;
    },
  };
}

// ─── Gauntlets (gloves) ───────────────────────────────────────────────────────

export function gauntletsDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'gloves');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.7 },
    budget: 900,
    build(c) {
      const m = c.mesh;
      const { main, shadow, trim } = palette;
      const lame = mulC(main, 0.84);

      // A pair of plate gauntlets: articulated finger and hand plates in alternating shades, a ridged knuckle
      // plate, and a flared bell cuff with a rolled edge
      glovePair(m, c, {
        palm: (k) => (k % 2 ? lame : main),
        finger: (k) => (k % 2 ? lame : main),
        thumb: (k) => (k ? main : lame),
      }, (sx) => {
        // Knuckle plate, following the slope of the knuckles
        const s0 = m.faces.length;
        box(m, [0, 0, 0], [0.3, 0.06, 0.035], trim);
        const ctr: Vec3 = [0, 0.33, 0.055];
        m.xf(s0, (p) => add(rotZ(p, Math.atan(0.1 * sx)), ctr));

        // Bell cuff
        loft(m, [ell(0.04, 0.135, 0.064, 10), ell(-0.22, 0.2, 0.11, 10)], main, { caps: false });
        band(m, -0.2, -0.235, 0.195, 0.108, 0.205, 0.113, trim);
        opening(m, [0, -0.23, 0], 0.19, 0.1, shadow);
      });
      return label;
    },
  };
}

// ─── Sabatons (boots) ─────────────────────────────────────────────────────────

export function sabatonsDesign(seriesId: string): Design {
  const { id, label, source, palette } = armorEntry(seriesId, 'boots');
  return {
    id, label, source,
    category: 'armor',
    fit: { kind: 'item', size: 0.65 },
    budget: 700,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      const { main, shadow, trim, cord, sole, metal } = palette;
      const lame = mulC(main, 0.86);

      // A pair of plate sabatons in side profile, toes to the left: an arched shell of overlapping lames
      // stepping down from the heel to a pointed toe, over a dark sole; plates up the lower leg ending in a strapped brace
      const L = rf(0.62, 0.68);
      const hx = L * 0.24;
      /** Half-ring arching over the foot at x: from the floor on one side, over the top, to the other side. */
      const arch = (x: number, h: number, w: number): Vec3[] => {
        const p: Vec3[] = [];
        for (let i = 0; i <= 6; i++) {
          const t = (i / 6) * Math.PI;
          p.push([x, 0.04 + Math.sin(t) * h, Math.cos(t) * w]);
        }
        return p;
      };
      // Lames from heel to toe: [x, height, half-width]; each starts a little proud of the last (the lip)
      const lames: [number, number, number][] = [[hx + 0.12, 0.24, 0.13], [L * 0.05, 0.23, 0.13], [-L * 0.12, 0.19, 0.125], [-L * 0.28, 0.14, 0.11], [-L * 0.42, 0.09, 0.09]];
      footwearPair(m, [0.2, 0.14, -0.12], () => {
        box(m, [-L * 0.08, 0.02, 0], [L * 1.06, 0.04, 0.2], sole);
        for (let i = 0; i < lames.length - 1; i++) {
          const [x0, h0, w0] = lames[i], [x1, h1, w1] = lames[i + 1];
          loft(m, [arch(x0, h0 * 1.05, w0 * 1.05), arch(x1, h1, w1)], i % 2 ? lame : main, { caps: false });
          rivet(m, [(x0 + x1) / 2, 0.04 + (h0 + h1) * 0.25, (w0 + w1) * 0.5 * 0.86], metal);
        }
        frustum(m, [-L * 0.42, 0.075, 0], [-L * 0.62, 0.05, 0], 0.085, 0.014, 6, main); // pointed toe cap
        // Ankle: three stacked, slightly overlapping plates rising up the lower leg
        const ax = hx + 0.01;
        ([[0.15, 0.31, 0.125, main], [0.29, 0.45, 0.132, lame], [0.43, 0.58, 0.138, main]] as const).forEach(([y0, y1, r, col]) => {
          frustum(m, [ax, y0, 0], [ax, y1, 0], r, r + 0.003, 10, col, { caps: false });
        });
        // Brace at the top: a thick rolled band, with a buckled leather strap just below it
        loft(m, [ell(0.65, 0.15, 0.15, 10, ax), ell(0.57, 0.153, 0.153, 10, ax)], trim);
        opening(m, [ax, 0.652, 0], 0.13, 0.13, shadow);
        loft(m, [ell(0.53, 0.145, 0.145, 10, ax), ell(0.49, 0.145, 0.145, 10, ax)], cord, { caps: false });
        box(m, [ax, 0.51, 0.148], [0.055, 0.055, 0.015], metal);
      });
      return label;
    },
  };
}
