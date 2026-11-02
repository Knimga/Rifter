// Model for Fallen Log (data/world/decorObjects.ts › fallen-log): ground clutter. A dark, rotting log lying across the
// tile, both ends broken off raggedly (an uneven rim, a rotten hollow inside it, a splinter or two), a branch stub,
// and moss grown over its top.
// Placed, true size: on its tile, the floor at y = 0.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { blob, frustum, loft, ringPts } from '../../core/primitives';
import { add, mul, mulC, norm, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';

const BARK: RGB = [42, 32, 24];
const ROT: RGB = [62, 46, 32];
const MOSS: RGB = [46, 62, 34];

/**
 * A broken end: a ring of the log at `at` (radius `r`, around the log's `axis`, as all its rings are, so they line up)
 * whose points each break off a little nearer or farther along `out` (the way out of the log: `axis` or its reverse),
 * so the rim is ragged; returns it. The hollow inside it and its splinters are added.
 */
function brokenEnd(m: Mesh, at: Vec3, axis: Vec3, out: Vec3, r: number, R: () => number): Vec3[] {
  const rim = ringPts(at, axis, r, 7).map((p) => add(p, mul(out, (R() - 0.5) * r * 0.9)));
  // The hollow: sunk into the log, dark rotten wood
  const core = add(at, mul(out, -r * 0.5));
  for (let i = 0; i < rim.length; i++) m.tri(core, rim[i], rim[(i + 1) % rim.length], mulC(ROT, 0.8 + R() * 0.3), add(core, mul(out, -1)), { j: 0.14 });
  // A splinter or two standing out of the rim
  for (let k = 0, n = 1 + Math.floor(R() * 2); k < n; k++) {
    const p = rim[Math.floor(R() * rim.length)];
    frustum(m, p, add(p, mul(out, r * (0.4 + R() * 0.6))), r * 0.14, 0.004, 3, mulC(BARK, 1.3), { j: 0.12 });
  }
  return rim;
}

const design: Design = {
  ...decorEntry('fallen-log'),
  category: 'decor',
  fit: { kind: 'placed', height: 0.35 },
  budget: 400,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);
    const r = rf(0.08, 0.12), a = rf(0, Math.PI);
    const dir: Vec3 = [Math.cos(a), 0, Math.sin(a)];
    // As long as the tile allows along its way (a little shorter: its ragged ends and splinters reach farther)
    const len = Math.min(0.78, (2 * (0.42 - r)) / Math.max(Math.abs(dir[0]), Math.abs(dir[2])));
    const p0 = add([0, r, 0], mul(dir, -len / 2)), p1 = add([0, r, 0], mul(dir, len / 2));
    // The trunk between its broken ends, a little narrower toward one
    const start = brokenEnd(m, p0, dir, mul(dir, -1), r, m.R);
    const end = brokenEnd(m, p1, dir, dir, r * 0.88, m.R);
    const mid = ringPts(add(p0, mul(dir, len / 2)), dir, r * 0.95, 7);
    loft(m, [start, mid, end], (p) => mulC(BARK, 0.9 + 0.2 * Math.sin(p[0] * 40 + p[2] * 30)), { caps: false, j: 0.16 });
    // A branch stub sticking up off one side
    const at = add(p0, mul(dir, len * rf(0.3, 0.7))), side = norm([-dir[2], 0.9, dir[0]]);
    frustum(m, add(at, mul(side, r * 0.7)), add(at, mul(side, r * 1.5)), r * 0.35, r * 0.22, 5, mulC(BARK, 1.1), { j: 0.14 });
    // Moss over its top
    for (let k = 0, n = ri(2, 4); k < n; k++) {
      const q = add(p0, mul(dir, len * rf(0.15, 0.85)));
      blob(m, [q[0], r * 1.85, q[2]], [r * 0.6, r * 0.25, r * 0.6], 0, 0.25, mulC(MOSS, rf(0.85, 1.15)), { j: 0.16 });
    }
    return this.label;
  },
};

export default design;
