// Model for Bracket Fungus (data/world/decorObjects.ts › bracket-fungus): wall clutter. Shelf fungi growing out of the
// wall in a few overlapping tiers: flat half-discs with a banded top, a paler rim and a dark underside, ochre, rust or
// pale tan, with a few tiny glowing spores clinging under them.
// Placed, true size: its tile's center at the origin, the wall at z = -0.5 behind it, facing +z.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { bipyr } from '../../core/primitives';
import { mixC, mulC, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';

/** Shelf colors: ochre, rust, pale tan (one per cluster, each shelf varied from it). */
const SHELVES: RGB[] = [[134, 106, 64], [114, 72, 48], [146, 132, 98]];
const RIM: RGB = [196, 184, 150];
const SPORE: RGB = [206, 232, 112];
/** The wall's plane. */
const W = -0.5;

/**
 * One shelf: a half-disc jutting out of the wall from (x, y), `r` out, its top in two bands of `col` (darker toward
 * the wall), a pale rim and a dark underside, its outline wobbling by `jag`.
 */
function shelfFungus(m: Mesh, x: number, y: number, r: number, col: RGB, R: () => number): void {
  const n = 7, t = r * 0.22;
  const arc = Array.from({ length: n + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI, k = r * (0.85 + R() * 0.25);
    return [x + Math.sin(a) * k * 1.25, Math.cos(a) * k] as const; // wider along the wall than deep
  });
  const top = (k: number, dy: number) => arc.map(([ax, d]): Vec3 => [x + (ax - x) * k, y + dy, W + 0.004 + d * k]);
  const outer = top(1, 0), inner = top(0.55, t * 0.35), under = top(0.92, -t);
  const back: Vec3 = [x, y + t * 0.6, W + 0.004], backUnder: Vec3 = [x, y - t * 0.6, W + 0.004];
  const ctr: Vec3 = [x, y, W];
  for (let i = 0; i < n; i++) {
    // The top: a darker band by the wall, a lighter one outside it, then the rim's edge down to the underside
    m.tri(back, inner[i], inner[i + 1], mulC(col, 0.8), ctr, { j: 0.12 });
    m.quad(inner[i], outer[i], outer[i + 1], inner[i + 1], col, ctr, { j: 0.12 });
    m.quad(outer[i], under[i], under[i + 1], outer[i + 1], mixC(col, RIM, 0.55), ctr, { j: 0.1 });
    m.tri(backUnder, under[i + 1], under[i], mulC(col, 0.42), [x, y + 1, W], { j: 0.1 });
  }
}

const design: Design = {
  ...decorEntry('bracket-fungus'),
  category: 'decor',
  fit: { kind: 'placed', height: 1.4 },
  budget: 500,
  build(c) {
    const m = c.mesh;
    const { rf, ri, pick } = c;
    m.anchor('feet', [0, 0, 0]);
    const col = pick(SHELVES);
    const x0 = rf(-0.15, 0.15), y0 = rf(0.3, 0.7);
    const n = ri(3, 6);
    for (let k = 0; k < n; k++) shelfFungus(m, x0 + rf(-0.2, 0.2), y0 + k * rf(0.07, 0.12), rf(0.08, 0.15), mulC(col, rf(0.85, 1.1)), m.R);
    // A few spores glowing under the lowest shelves
    for (let k = 0, s = ri(1, 3); k < s; k++) bipyr(m, [x0 + rf(-0.2, 0.2), y0 - rf(0.04, 0.1), W + rf(0.04, 0.12)], 0.016, 0.03, 4, SPORE, { e: 0.85, j: 0.05 });
    return this.label;
  },
};

export default design;
