// Axe family shape, shared by every axe design (one design per data entry, e.g. plain-hatchet.ts).
import type { Design } from '../core/types';
import { blob, box, frustum } from '../core/primitives';
import { rotZ, type Vec3 } from '../core/vec';
import { WEAPON_ROLL, weaponEntry } from './_weapon';

/** Width of the honed strip along an axe's cutting edge, as a fraction of the way from edge to head center. */
const EDGE_BAND = 0.13;
const lerp = (p: Vec3, q: Vec3, f: number): Vec3 => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];

/**
 * A two-hander's blades: how far they reach out from the haft (a multiplier on the base reach) and how far
 * the cutting edge bows out at mid-height (a fraction of the reach). The bow adds to the reach.
 */
const BATTLEAXE_REACH = 0.38;
const BATTLEAXE_EDGE_BOW = 0.45;

/**
 * `bladeLength` scales how far the head runs along the haft (its height), e.g. 0.8 = 20% shorter blades.
 * The haft, the blades' reach and everything random stay the same.
 */
export function axeDesign(seriesId: string, weaponType: '1h Axes' | '2h Axes', { bladeLength = 1 }: { bladeLength?: number } = {}): Design {
  const { id, label, source, palette } = weaponEntry(seriesId, weaponType);
  const twoHanded = weaponType === '2h Axes';
  return {
    id, label, source,
    category: 'weapon',
    fit: { kind: 'item', size: 0.8 },
    budget: 500,
    build(c) {
      const m = c.mesh;
      const { rf } = c;
      // Two-handers are always double-bladed; one-handers always single-bladed (no param either way)
      const double = twoHanded;
      const { metal, edge, trim, leather, wood } = palette;

      // A two-hander has a long haft and a bigger head
      const Hh = twoHanded ? rf(3.0, 3.5) : rf(1.6, 1.9);
      m.part('haft');
      frustum(m, [0, 0, 0], [0, Hh, 0], 0.065, 0.055, 6, wood);
      const wraps = twoHanded ? 5 : 3;
      for (let k = 0; k < wraps; k++) {
        const y = 0.15 + k * 0.17;
        frustum(m, [0, y, 0], [0, y + 0.09, 0], 0.077, 0.077, 6, leather);
      }
      blob(m, [0, -0.04, 0], [0.09, 0.09, 0.09], 0, 0.1, trim);
      frustum(m, [0, Hh - 0.02, 0], [0, Hh + 0.38, 0], 0.07, 0.01, 5, metal);

      m.part('head');
      const w = twoHanded ? rf(0.85, 1.1) * BATTLEAXE_REACH : rf(0.6, 0.8);
      const h = (twoHanded ? rf(0.8, 1.0) : rf(0.6, 0.75)) * bladeLength;
      const yb = Hh - h - 0.12, t = rf(0.085, 0.13), cf = rf(0.85, 1.2);
      // Head outline around the haft: the cutting edge (z = 0 points) bows OUTWARD in a convex arc
      // between the two blade tips, bulging furthest at mid-height.
      const bulge = rf(0.1, 0.16);
      // The cutting edge, from the lower blade tip to the upper one (z = 0 marks edge points)
      const lo = -0.3 * cf, hi = 1 + 0.3 * cf;
      // A one-hander's edge bows gently through 5 points; a two-hander's narrower blades get a deeper,
      // smooth arc through 7 points so they still read as a proper axe.
      const edgePts: [number, number, number][] = twoHanded
        ? Array.from({ length: 7 }, (_, i): [number, number, number] => {
            const f = i / 6; // a smooth convex arc: deepest at mid-height, meeting the tips
            return [-1 - (BATTLEAXE_EDGE_BOW + bulge * 0.5) * Math.sin(f * Math.PI), lo + (hi - lo) * f, 0];
          })
        : [[-1, lo, 0], [-1 - bulge * 0.7, 0.12, 0], [-1 - bulge, 0.5, 0], [-1 - bulge * 0.7, 0.88, 0], [-1, hi, 0]];
      const pts: [number, number, number][] = [
        [0, 0, t], [-0.45, -0.1, t * 0.9],
        ...edgePts,
        [-0.45, 1.1, t * 0.9], [0, 1, t],
      ];
      const side = (sg: number) => {
        const P: Vec3[] = pts.map(([x, y, th]) => [sg * x * w, yb + y * h, th]);
        const O: [number, number] = [sg * -0.3 * w, yb + 0.5 * h];
        const tO = t * 1.35;
        const ctr: Vec3 = [O[0], O[1], 0];
        for (let i = 0; i < P.length; i++) {
          const a = P[i], b = P[(i + 1) % P.length];
          const isEdge = a[2] === 0 && b[2] === 0;
          for (const s of [1, -1]) {
            // One face (front s = 1, back s = -1): a fan triangle from the head's center to this outline segment
            const A: Vec3 = [a[0], a[1], s * a[2]], B: Vec3 = [b[0], b[1], s * b[2]], Oc: Vec3 = [O[0], O[1], s * tO];
            if (!isEdge) {
              m.tri(Oc, A, B, metal, ctr);
              continue;
            }
            // Cutting edge: only a thin strip along the outline is honed (light); the rest is plain metal
            const A2 = lerp(A, Oc, EDGE_BAND), B2 = lerp(B, Oc, EDGE_BAND);
            m.quad(A, B, B2, A2, edge, ctr);
            m.tri(Oc, A2, B2, metal, ctr);
          }
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
      return label;
    },
  };
}
