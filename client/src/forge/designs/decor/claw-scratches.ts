// Model for Claw Scratches (data/world/decorObjects.ts › claw-scratches): wall clutter. Three or four big claw marks
// raked across the wall side by side, at any angle from steep to nearly flat: near-black grooves each edged with a pale
// scraped line, and grit fallen at the wall's foot.
// Placed, true size: its tile's center at the origin, the wall at z = -0.5 behind it, facing +z.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { blob } from '../../core/primitives';
import type { RGB, Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';

const GROOVE: RGB = [8, 7, 7];
const SCRAPE: RGB = [128, 118, 106];
const GRIT: RGB = [78, 72, 66];
/** The wall's plane. */
const W = -0.5;
/** How far across the tile a mark may reach (it stays on its own tile's wall). */
const EDGE = 0.45;

/** A flat stroke on the wall from (x0, y0) to (x1, y1), `w0` wide tapering to `w1`, `out` off the wall. */
function stroke(m: Mesh, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, out: number, col: RGB): void {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
  const z = W + out, behind: Vec3 = [x0, y0, W - 1];
  m.quad([x0 + nx * w0, y0 + ny * w0, z], [x1 + nx * w1, y1 + ny * w1, z], [x1 - nx * w1, y1 - ny * w1, z], [x0 - nx * w0, y0 - ny * w0, z], col, behind, { j: 0.04 });
}

const design: Design = {
  ...decorEntry('claw-scratches'),
  category: 'decor',
  fit: { kind: 'placed', height: 1.3 },
  budget: 300,
  build(c) {
    const m = c.mesh;
    const { rf, ri, chance } = c;
    m.anchor('feet', [0, 0, 0]);
    // Their way down the wall: from steep to nearly flat, raked to either side
    const tilt = rf(0.17, 1.22), side = chance(0.5) ? 1 : -1;
    const ux = Math.cos(tilt) * side, uy = -Math.sin(tilt); // along a mark (its start to its end)
    const px = -uy * side, py = ux * side; // across the marks, between them
    const n = ri(3, 4), len = rf(0.45, 0.6), gap = rf(0.1, 0.13);
    const cx = rf(-0.08, 0.08), cy = rf(0.6, 0.8);
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * gap, along = rf(-0.04, 0.04);
      const mx = cx + px * off + ux * along, my = cy + py * off + uy * along;
      // As long as the tile allows: shortened so both ends stay on it
      const half = Math.min((len / 2) * rf(0.85, 1.1), Math.abs(ux) > 1e-3 ? (EDGE - Math.abs(mx)) / Math.abs(ux) : Infinity);
      if (half < 0.08) continue;
      const sx = mx - ux * half, sy = my - uy * half, ex = mx + ux * half, ey = my + uy * half;
      stroke(m, sx, sy, ex, ey, 0.038, 0.008, 0.006, GROOVE);
      stroke(m, sx + px * 0.034, sy + py * 0.034, ex + px * 0.022, ey + py * 0.022, 0.008, 0.003, 0.007, SCRAPE);
    }
    // Grit at the wall's foot
    for (let k = 0, g = ri(3, 5); k < g; k++) {
      const r = rf(0.02, 0.045);
      blob(m, [cx + rf(-0.25, 0.25), r * 0.6, W + rf(0.05, 0.16)], [r, r * 0.7, r], 0, 0.25, GRIT, { j: 0.15, floorY: 0 });
    }
    return this.label;
  },
};

export default design;
