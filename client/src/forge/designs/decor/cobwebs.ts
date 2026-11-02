// Model for Cobwebs (data/world/decorObjects.ts › cobwebs): wall clutter. One or two old webs strung tight in the corner
// where the wall meets the floor: pale threads radiating from a hub at uneven angles, ringed once, with no sheet between
// them; and now and then a loose strand hanging higher up the wall.
// Placed, true size: its tile's center at the origin, the wall at z = -0.5 behind it, facing +z.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { tube } from '../../core/primitives';
import { lerp3, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';

const THREAD: RGB = [172, 172, 180];
/** The wall's plane. */
const W = -0.5;

/**
 * A web across the corner, in the slanted plane from the wall at height `h` down to the floor `d` out, `w` wide around
 * x = `x0`: a hub, spokes at uneven angles from it (turned as a whole by `turn`), and a ring through them.
 */
function web(m: Mesh, x0: number, w: number, h: number, d: number, turn: number, R: () => number): void {
  // A point of the plane: s across it (-1..1), t up it (0 at the floor, 1 at the wall)
  const at = (s: number, t: number): Vec3 => {
    const tt = Math.max(0.02, Math.min(0.98, t));
    return [x0 + s * (w / 2), tt * h, W + 0.006 + (1 - tt) * d];
  };
  const hub = at(R() * 0.3 - 0.15, 0.45 + R() * 0.15);
  const n = 5 + Math.floor(R() * 3);
  const spokes = Array.from({ length: n }, (_, i) => {
    const a = turn + (i / n) * Math.PI * 2 + (R() - 0.5) * 0.7, l = 0.7 + R() * 0.3;
    return at(Math.cos(a) * l, 0.5 + Math.sin(a) * l * 0.5);
  });
  for (const s of spokes) tube(m, [hub, s], 0.006, 0.005, 3, THREAD, { caps: false, j: 0.05 });
  tube(m, [...spokes, spokes[0]].map((s) => lerp3(hub, s, 0.45 + R() * 0.2)), 0.005, 0.005, 3, THREAD, { caps: false, j: 0.05 });
}

const design: Design = {
  ...decorEntry('cobwebs'),
  category: 'decor',
  fit: { kind: 'placed', height: 1.3 },
  budget: 400,
  build(c) {
    const m = c.mesh;
    const { rf, ri, chance } = c;
    m.anchor('feet', [0, 0, 0]);
    const n = ri(1, 2);
    for (let k = 0; k < n; k++) {
      web(m, n === 1 ? rf(-0.15, 0.15) : (k ? 1 : -1) * rf(0.12, 0.2), rf(0.3, 0.45), rf(0.28, 0.45), rf(0.1, 0.17), rf(0, Math.PI * 2), m.R);
    }
    // A loose strand higher up the wall
    if (chance(0.5)) {
      const x = rf(-0.35, 0.35), y = rf(0.8, 1.15);
      tube(m, [[x, y, W + 0.006], [x + rf(-0.05, 0.05), y - rf(0.18, 0.3), W + 0.02]], 0.006, 0.005, 3, THREAD, { caps: false });
    }
    return this.label;
  },
};

export default design;
