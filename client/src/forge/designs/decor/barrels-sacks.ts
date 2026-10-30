// Model for Barrels & Sacks (data/world/decorObjects.ts › barrels-and-sacks): three wooden barrels of the Merchant's
// Cart's dark wood, lidded and iron-hooped, two at the back and one at the front right, with three rectangular
// grain sacks among them: one lying flat at the front left, one stacked across it, one standing and leaning back
// against the barrels between them. Some sacks carry a faded painted stripe (by seed).
// Built facing +z (the sacks' side), on one tile.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { frustum, loft } from '../../core/primitives';
import { add, mulC, rotX, rotY, type RGB, type Vec3 } from '../../core/vec';
import { DARK_WOOD, DARK_WOOD_SHADE, barrel, decorEntry } from '../_decor';

const BURLAP: RGB = [108, 90, 63];
const BURLAP_DARK: RGB = [92, 77, 53];
/** A sack's faded stripe, if it has one. */
const STRIPE: RGB[] = [[112, 46, 40], [54, 62, 96]];

/** Barrels: belly radius, and each one's spot and height (the tallest sets the model's top). */
const BR = 0.14;
// Touching: their centers a belly's width apart, in a triangle at the back right
const BARRELS: { at: Vec3; h: number }[] = [
  { at: [0, 0, -0.22], h: 0.44 },
  { at: [2 * BR, 0, -0.22], h: 0.41 },
  { at: [BR, 0, -0.22 + Math.sqrt(3) * BR], h: 0.39 },
];
/** A grain sack: its length, width and thickness. */
const SL = 0.42, SW = 0.26, ST = 0.13;

/**
 * A rectangular grain sack built standing at the origin: its length up y (0 to SL), its width along x, its
 * thickness along z; full in the middle, pinched at the bottom and flattened at the top seam, whose corners stick
 * out as ears. `stripe`: a painted band around it.
 */
function grainSack(m: Mesh, col: RGB, stripe: RGB | null): void {
  const ring = (y: number, w: number, t: number): Vec3[] =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      return [(SW / 2) * w * Math.sign(c) * Math.abs(c) ** 0.5, y, (ST / 2) * t * Math.sign(s) * Math.abs(s) ** 0.5];
    });
  // The stripe is its own band of faces, between two rings
  const S0 = SL * 0.52, S1 = SL * 0.66;
  const paint = (cen: Vec3): RGB => (stripe && cen[1] > S0 && cen[1] < S1 ? stripe : col);
  loft(m, [
    ring(0, 0.86, 0.55), ring(SL * 0.1, 0.98, 0.95), ring(S0, 1, 1), ring(S1, 1, 0.97), ring(SL * 0.88, 0.98, 0.75), ring(SL, 0.96, 0.18),
  ], paint, { j: 0.16 });
  for (const s of [-1, 1]) frustum(m, [s * SW * 0.44, SL * 0.97, 0], [s * SW * 0.56, SL * 1.04, 0], 0.022, 0.006, 4, mulC(col, 0.85), { j: 0.1 });
}

const design: Design = {
  ...decorEntry('barrels-and-sacks'),
  category: 'decor',
  // Built at its true size: the tallest barrel's lid is the top
  fit: { kind: 'standing', height: BARRELS[0].h + 0.006, maxRadius: 0.6 },
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf, chance, pick } = c;
    m.anchor('feet', [0, 0, 0]);

    for (const b of BARRELS) barrel(m, b.at, b.h, BR, mulC(DARK_WOOD, rf(0.94, 1.06)), { lid: DARK_WOOD_SHADE });

    /** A sack, built standing, then turned by `place` into its spot. */
    const sack = (place: (p: Vec3) => Vec3) => {
      const from = m.faces.length;
      grainSack(m, mulC(chance(0.5) ? BURLAP : BURLAP_DARK, rf(0.94, 1.06)), chance(0.45) ? pick(STRIPE) : null);
      m.xf(from, place);
    };
    // Lying flat: its length along x, its width along z, its thickness up
    const lying = (p: Vec3): Vec3 => [p[1] - SL / 2, p[2] + ST / 2, p[0]];
    // The flat one at the front left, clear of the front barrel, and one thrown across it
    const yaw0 = rf(-0.2, 0.2), yaw1 = rf(0.9, 1.3), top: Vec3 = [-0.2 + rf(-0.02, 0.02), ST * 0.92, 0.22];
    sack((p) => add(rotY(lying(p), yaw0), [-0.22, 0, 0.26]));
    sack((p) => add(rotY(lying(p), yaw1), top));
    // Standing at the back barrel's left, leaning in against it: its foot out from the barrel, its back toward it
    const lean = rf(0.22, 0.32), turn = -1.28 + rf(-0.12, 0.12);
    const toBarrel: Vec3 = [-Math.sin(turn), 0, -Math.cos(turn)];
    const foot = add(BARRELS[0].at, [-toBarrel[0] * 0.285, 0, -toBarrel[2] * 0.285]);
    sack((p) => add(rotY(rotX(p, -lean), turn), foot));

    return 'Barrels & Sacks';
  },
};
export default design;
