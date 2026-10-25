import type { Design } from '../../core/types';
import { bipyr, blob, frustum } from '../../core/primitives';
import { add, mul, norm, type RGB, type Vec3 } from '../../core/vec';

// Identity: a spore pod floating at about waist height, shaped like the Void Wisp (a faceted core bristling with
// spikes in every direction) but sickly: a pale yellow-green core glowing at its heart, and many long, thin
// needles, olive at the root, pale orange to pale yellow toward the points, a few tipped with glowing yellow.
// Little yellow and orange motes drift around it, slowly circling. No floor glow. Seeds vary the number, length
// and spread of the needles, how the pod is turned, and the motes.
const OLIVE: RGB = [112, 118, 58];
const SICKLY: RGB = [172, 188, 92];
const PALE_ORANGE: RGB = [226, 172, 112];
const PALE_YELLOW: RGB = [232, 220, 136];
const GLOW: RGB = [238, 232, 120];
const HEART: RGB = [196, 226, 100]; // the core's sickly yellow-green glow
const MOTES: RGB[] = [[255, 214, 80], [255, 160, 60]];

/** Where the pod's center floats above the floor. */
const FLOAT_Y = 0.55;
/** The pod's size: its core and needles are drawn at this scale. */
const SIZE = 0.8;

const design: Design = {
  id: 'creature.fungal-spore',
  source: { table: 'enemies', key: 'fungal-spore' }, // data/units/enemies.ts › fungal-spore
  category: 'creature',
  label: 'Fungal Spore',
  // Height from the floor to its top (a needle or a mote), so the pod floats at FLOAT_Y in game units
  fit: { kind: 'standing', height: 0.72, maxRadius: 0.45 }, // 10% smaller than first drawn
  budget: 1300,
  // The motes circle it slowly
  motion: [{ part: 'motes', axis: 'y', turnsPerSec: 0.08 }],
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]); // under the pod: this point goes to the tile center
    // The floor: one invisible face at y = 0, so the fit measures the float height from the floor (with no floor glow)
    m.tri([-0.01, 0, 0], [0.01, 0, 0], [0, 0, 0.01], OLIVE, [0, -1, 0], { a: 0, j: 0 });

    // Core: a pale yellow-green faceted pod, with a glowing heart showing between the needles
    m.part('torso', [0, FLOAT_Y, 0]);
    const C: Vec3 = [0, FLOAT_Y, 0];
    blob(m, C, [0.085 * SIZE, 0.08 * SIZE, 0.085 * SIZE], 1, 0.16, SICKLY, { j: 0.2 });
    blob(m, C, [0.1 * SIZE, 0.095 * SIZE, 0.1 * SIZE], 0, 0.12, HEART, { e: 1, a: 0.3, j: 0.05 });
    m.halo(C, 0.13, HEART);

    // Needles: many, spread evenly over the sphere (a Fibonacci spiral), jittered, the whole pod turned by the
    // seed. Three-sided and thin: an olive root, then pale orange or pale yellow to a fine point; some glow.
    const n = ri(40, 52);
    const turn = rf(0, Math.PI * 2), tilt = rf(-0.4, 0.4);
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.39996 + turn; // the golden angle
      let dir: Vec3 = [Math.cos(a) * r, y, Math.sin(a) * r];
      dir = norm([dir[0] + rf(-0.15, 0.15), dir[1] * Math.cos(tilt) + dir[2] * Math.sin(tilt) + rf(-0.15, 0.15), dir[2] * Math.cos(tilt) - dir[1] * Math.sin(tilt)]);
      // Longer sideways than up and down: what sticks out to the sides reads at full size under the camera
      const len = SIZE * rf(0.13, 0.2) * (1 + (1 - Math.abs(dir[1])) * 0.3);
      const root = add(C, mul(dir, 0.06 * SIZE));
      const mid = add(C, mul(dir, 0.06 * SIZE + len * 0.3));
      const tip = add(C, mul(dir, 0.06 * SIZE + len));
      const w = SIZE * rf(0.016, 0.022);
      frustum(m, root, mid, w, w * 0.75, 3, OLIVE, { j: 0.2 });
      frustum(m, mid, tip, w * 0.75, 0.002, 3, c.chance(0.25) ? GLOW : c.pick([PALE_ORANGE, PALE_YELLOW]), { j: 0.15, caps: false });
    }

    // Motes: little yellow and orange glowing specks drifting around it, each with a faint halo
    m.part('motes', [0, FLOAT_Y, 0]);
    for (let i = 0, k = ri(7, 11); i < k; i++) {
      const a = (i / k) * Math.PI * 2 + rf(-0.3, 0.3), d = rf(0.14, 0.24);
      const p: Vec3 = [Math.cos(a) * d, FLOAT_Y + rf(-0.16, 0.16), Math.sin(a) * d];
      const col = c.pick(MOTES);
      bipyr(m, p, rf(0.012, 0.018), rf(0.018, 0.026), 4, col, { e: 1 });
      m.halo(p, 0.05, col);
    }

    return 'Fungal Spore';
  },
};

export default design;
