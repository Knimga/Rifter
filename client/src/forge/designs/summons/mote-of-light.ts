import type { Design } from '../../core/types';
import { blob } from '../../core/primitives';
import type { RGB, Vec3 } from '../../core/vec';
import { floorGlow } from '../_glow';

// Identity: the Mote of Light, a small floating point of light: a solid white core hovering at the Void Wisp's height,
// wrapped in layered glow (white-hot close in, yellow, then a wide warm-yellow bloom), with faint diffraction spikes
// crossing it up-down and left-right on screen (flares: they stay upright whatever way it faces), over a yellow pool
// of its own light on the floor. Seeds vary the core's and glows' sizes a little and the spikes' length.
const CORE: RGB = [255, 253, 240];
/** The glow's layers, inside out: hot and pale in the middle, yellower toward the edge. */
const GLOW_LAYERS: { r: number; c: RGB }[] = [
  { r: 0.0675, c: [255, 248, 214] },
  { r: 0.135, c: [255, 226, 120] },
  { r: 0.24, c: [255, 196, 64] },
];
/** The spikes, dimmer than the glow (additive: a dimmer color is a fainter streak), so they stay subtle in game. */
const SPIKE: RGB = [214, 194, 132];
const POOL: RGB = [255, 206, 80];

/** Where the core floats above the floor: the Void Wisp's FLOAT_Y. */
const FLOAT_Y = 0.6;
const CORE_R = 0.045;

const design: Design = {
  id: 'summon.mote-of-light',
  source: { table: 'summons', key: 'mote-of-light' }, // data/units/summons.ts › mote-of-light
  category: 'summon',
  label: 'Mote of Light',
  // Its own y = 0 is the floor and its top is the core's, so it is drawn at true size: the core at FLOAT_Y
  fit: { kind: 'standing', height: FLOAT_Y + CORE_R, maxRadius: 0.5, floor: 'origin' },
  budget: 300,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, 0]); // under the mote: this point goes to the tile center

    // A yellow pool on the floor under it, its light
    m.part('glow');
    floorGlow(m, POOL, 0.38, 0.38, 12);

    // The core: small, solid and white
    m.part('torso', [0, FLOAT_Y, 0]);
    const C: Vec3 = [0, FLOAT_Y, 0];
    const k = rf(0.92, 1.08);
    blob(m, C, [CORE_R * k, CORE_R * k, CORE_R * k], 1, 0.05, CORE, { e: 1, j: 0.04 });

    // Its glow, in layers (additive: they build up brightest in the middle)
    const g = rf(0.92, 1.08);
    for (const { r, c: col } of GLOW_LAYERS) m.halo(C, r * g, col);

    // Diffraction spikes: two thin streaks crossing on screen, up-down and left-right, faint
    const len = rf(0.3, 0.36);
    m.flare(C, len, 0.018, SPIKE);
    m.flare(C, 0.018, len * 0.85, SPIKE); // a little shorter upright: height reads shorter in the view

    return 'Mote of Light';
  },
};

export default design;
