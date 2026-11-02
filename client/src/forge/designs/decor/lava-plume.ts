// Model for Lava Plume (data/world/decorObjects.ts › lava-plume): obstacle, 1 tile, seen past. A mini volcano: a squat,
// gently sloped cone of crusted black rock rising from the floor to a ragged crater brimming with glowing lava, a few
// cooled clinkers on its flanks. Static.
// Placed, true size: its tile centered on the origin.
import type { Design } from '../../core/types';
import { bipyr, loft, wobbleRing } from '../../core/primitives';
import { mixC, mulC, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';
import { floorGlow } from '../_glow';

const ROCK: RGB = [40, 28, 24];
const CRUST: RGB = [62, 40, 32];
/** The crater's pool of molten lava. */
const MOLTEN: RGB = mixC([255, 104, 30], [255, 206, 104], 0.6);

const design: Design = {
  ...decorEntry('lava-plume'),
  category: 'decor',
  fit: { kind: 'placed', height: 0.75 },
  budget: 500,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);
    floorGlow(m, [150, 52, 18], 0.46, 0.46, 12);

    // The cone, squat and gently sloped: low, broad, a wide crater, its flanks easing up from the floor, a little lopsided
    const H = rf(0.38, 0.5), base = rf(0.42, 0.45), lip = rf(0.15, 0.19);
    const lean: Vec3 = [rf(-0.03, 0.03), 0, rf(-0.03, 0.03)];
    const steps = [0, 0.3, 0.6, 0.85, 1];
    const radius = (t: number) => base + (lip - base) * Math.pow(t, 0.65);
    const rings = steps.map((t) => wobbleRing([lean[0] * t, t * H, lean[2] * t], radius(t), radius(t), 9, 0.1, m.R));
    loft(m, rings, (p) => mixC(ROCK, CRUST, Math.min(1, p[1] / H)), { j: 0.16, caps: false, bandCenters: true });
    // The crater: its lip dipping into a pool of lava
    const rim = rings[rings.length - 1], pool: Vec3 = [lean[0], H - 0.05, lean[2]];
    for (let i = 0; i < rim.length; i++) m.tri(pool, rim[i], rim[(i + 1) % rim.length], MOLTEN, [pool[0], 0, pool[2]], { e: 0.95, j: 0.05 });
    // A few cooled clinkers on its flanks
    for (let k = 0, s = ri(2, 4); k < s; k++) {
      const t = rf(0.15, 0.6), a = rf(0, Math.PI * 2), r = radius(t);
      bipyr(m, [Math.cos(a) * r, t * H, Math.sin(a) * r], rf(0.03, 0.05), 0.05, 5, mulC(ROCK, 0.8), { j: 0.12 });
    }
    m.halo([lean[0], H + 0.05, lean[2]], 0.45, [255, 150, 70]);
    return this.label;
  },
};

export default design;
