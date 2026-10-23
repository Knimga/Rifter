import type { Design } from '../core/types';
import { blob, frustum } from '../core/primitives';
import { add, mul, norm, type RGB, type Vec3 } from '../core/vec';
import { floorGlow } from '../designs/_glow';

// Identity: the Occultist's Void Wisp, a small crystalline star of black and violet floating at about waist height
// (a character's, CHARACTER_HEIGHT 1.12) over a faint violet pool of its own light. A dark faceted core,
// glowing violet at its heart, bristling with sharp crystal spikes in every direction: black at the root,
// violet toward the points, a few tipped with glowing violet. Seeds vary the number, length and spread of the
// spikes and how the star is turned, so no two read the same.
const BLACK: RGB = [20, 14, 30];
const DARK: RGB = [58, 34, 92];
const VIOLET: RGB = [138, 76, 214];
const GLOW: RGB = [206, 148, 255];

/** Where the star's center floats above the floor. */
const FLOAT_Y = 0.6;
/** The star's size: every part of it (core and spikes) is drawn at this scale. */
const SIZE = 0.8; // 20% smaller than first drawn

const design: Design = {
  id: 'summon.void-wisp',
  source: { table: 'summons', key: 'void-wisp' }, // data/units/summons.ts › void-wisp
  category: 'summon',
  label: 'Void Wisp',
  // Height from the floor (the glow pool) to the top spike, so the star floats at FLOAT_Y in game units
  fit: { kind: 'standing', height: 0.8, maxRadius: 0.5 },
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]); // under the star: this point goes to the tile center

    // A faint violet pool on the floor under it: its light, and what keeps it floating at the right height
    m.part('glow');
    floorGlow(m, [150, 90, 230], 0.42, 0.42, 12);

    // Core: a dark faceted crystal ball, with a glowing violet heart showing between the spikes
    m.part('torso', [0, FLOAT_Y, 0]);
    const C: Vec3 = [0, FLOAT_Y, 0];
    blob(m, C, [0.08 * SIZE, 0.08 * SIZE, 0.08 * SIZE], 1, 0.18, BLACK, { j: 0.2 });
    blob(m, C, [0.095 * SIZE, 0.095 * SIZE, 0.095 * SIZE], 0, 0.12, GLOW, { e: 1, a: 0.55, j: 0.05 });

    // Spikes: spread evenly over the sphere (a Fibonacci spiral), jittered, the whole star turned by the seed.
    // Four-sided (crystalline), each a black root and a violet point; some points glow.
    const n = ri(8, 10);
    const turn = rf(0, Math.PI * 2), tilt = rf(-0.4, 0.4);
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.39996 + turn; // the golden angle
      let dir: Vec3 = [Math.cos(a) * r, y, Math.sin(a) * r];
      dir = norm([dir[0] + rf(-0.15, 0.15), dir[1] * Math.cos(tilt) + dir[2] * Math.sin(tilt) + rf(-0.15, 0.15), dir[2] * Math.cos(tilt) - dir[1] * Math.sin(tilt)]);
      // Longer sideways than up and down: what sticks out to the sides reads at full size under the camera
      const len = SIZE * 0.8 * rf(0.2, 0.3) * (1 + (1 - Math.abs(dir[1])) * 0.35);
      const root = add(C, mul(dir, 0.05 * SIZE));
      const mid = add(C, mul(dir, 0.05 * SIZE + len * 0.45));
      const tip = add(C, mul(dir, 0.05 * SIZE + len));
      const w = SIZE * 0.8 * rf(0.075, 0.095);
      frustum(m, root, mid, w, w * 0.7, 4, BLACK, { j: 0.2 });
      frustum(m, mid, tip, w * 0.7, 0.003, 4, c.chance(0.35) ? GLOW : c.pick([VIOLET, DARK]), { e: 0, j: 0.15, caps: false });
    }

    return 'Void Wisp';
  },
};

export default design;
