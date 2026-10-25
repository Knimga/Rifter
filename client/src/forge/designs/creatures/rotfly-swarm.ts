import type { Design } from '../../core/types';
import { bipyr } from '../../core/primitives';
import type { RGB, Vec3 } from '../../core/vec';

// Identity: a hovering swarm of rotflies: a cloud of tiny sickly green motes, densest in the middle and thinning
// toward its edges, which reach the edges of its tile. Most motes are dim, a few glow; a faint green glow hangs in
// the middle of the swarm. No floor glow, no animation. Seeds vary where every mote is and how many there are.
const DIM: RGB[] = [[112, 138, 46], [134, 156, 58], [96, 118, 40]];
const BRIGHT: RGB[] = [[176, 214, 84], [198, 226, 110]];
const GLOW: RGB = [168, 208, 80];

/** Where the swarm's middle hovers, and how far it reaches up and down from there (its reach sideways is 0.5). */
const MID_Y = 0.5, HALF_H = 0.28;

const design: Design = {
  id: 'creature.rotfly-swarm',
  source: { table: 'enemies', key: 'rotfly-swarm' }, // data/units/enemies.ts › rotfly-swarm
  category: 'creature',
  label: 'Rotfly Swarm',
  // The radius is the limiting fit: the farthest mote reaches the tile's edge (0.5 from its center)
  fit: { kind: 'standing', height: 1.2, maxRadius: 0.5 },
  budget: 1000,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]); // under the swarm: this point goes to the tile center
    // The floor: one invisible face at y = 0, so the swarm hovers at MID_Y (with nothing on the floor)
    m.tri([-0.01, 0, 0], [0.01, 0, 0], [0, 0, 0.01], DIM[0], [0, -1, 0], { a: 0, j: 0 });

    m.part('torso', [0, MID_Y, 0]);
    // Motes: each in a random direction, its distance from the middle drawn so they thin out toward the edge
    // (u^0.6 of the way out: a little denser in the middle than an even spread, u^(1/3)). One always reaches the
    // edge sideways, so the swarm spans its tile.
    const n = ri(95, 115);
    for (let i = 0; i < n; i++) {
      let d: Vec3;
      do d = [rf(-1, 1), rf(-1, 1), rf(-1, 1)]; while (Math.hypot(d[0], d[1], d[2]) > 1 || Math.hypot(d[0], d[1], d[2]) < 0.05);
      const l = Math.hypot(d[0], d[1], d[2]);
      const out = i === 0 ? 1 : c.R() ** 0.6;
      const k = out / l;
      const p: Vec3 = i === 0 ? [Math.cos(rf(0, 6.28)) * 0.5, MID_Y, 0] : [d[0] * k * 0.5, MID_Y + d[1] * k * HALF_H, d[2] * k * 0.5];
      if (i === 0) p[2] = Math.sqrt(Math.max(0, 0.25 - p[0] * p[0])) * (c.chance(0.5) ? 1 : -1);
      const bright = c.chance(0.25);
      bipyr(m, p, rf(0.011, 0.017), rf(0.014, 0.022), 4, c.pick(bright ? BRIGHT : DIM), bright ? { e: 1 } : { e: 0.3, j: 0.2 });
    }
    // A faint glow in the middle of the swarm
    m.halo([0, MID_Y, 0], 0.288, GLOW); // 20% wider than first drawn (0.24)

    return 'Rotfly Swarm';
  },
};

export default design;
