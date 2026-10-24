import type { Design } from '../core/types';
import type { ColorFn } from '../core/mesh';
import { blob, box, frustum } from '../core/primitives';
import { hslRGB, mulC, norm, type RGB, type Vec3 } from '../core/vec';
import { mush } from './_fungal';

// The handoff's Gloomtoad (handoff/Fungal Forest Forge.html), copied as exactly as the forge allows: low, warty
// and wide, a pale belly, slit mouth, bulging eyes glowing yellow, hind legs folded along its flanks and forelegs
// braced in front, translucent glowing poison sacs and small mushrooms growing from its back.
// Seeds vary the skin's tone, the sacs' color (venom, gall, blight), the warts, the sacs and the mushrooms (count,
// size, place, cap palette).
// The one difference: the sacs' glow is 0.45, not the handoff's 0.55, since the game draws a face at 0.5 and up
// solid (unlit), and the sacs must stay see-through.

/** Cap palettes: name, top, gills (the handoff's CAPS). */
const CAPS: [string, RGB, RGB][] = [
  ['Ochre', [190, 138, 58], [226, 206, 150]],
  ['Bruise', [104, 66, 112], [190, 170, 200]],
  ['Ashen', [148, 144, 134], [220, 214, 200]],
  ['Rust', [152, 66, 42], [222, 190, 150]],
  ['Pale', [206, 196, 170], [170, 150, 120]],
];
const EYE: RGB = [255, 205, 70];

const design: Design = {
  id: 'creature.gloomtoad',
  source: { table: 'enemies', key: 'gloomtoad' }, // data/units/enemies.ts › gloomtoad
  category: 'creature',
  label: 'Gloomtoad',
  fit: { kind: 'standing', height: 0.75, maxRadius: 0.6 }, // low and wide: the splayed legs set its size
  budget: 2200,
  build(c) {
    const m = c.mesh;
    const { R, rf, ri, pick } = c;
    const skin = hslRGB(rf(60, 100), rf(18, 30), rf(20, 30)), belly = hslRGB(rf(55, 75), rf(25, 35), rf(42, 52)), wart = mulC(skin, rf(1.25, 1.6));
    const [sacName, sac] = pick([['Venom', [150, 230, 70]], ['Gall', [175, 110, 225]], ['Blight', [255, 170, 60]]] as [string, RGB][]);
    const [, capTop, capGill] = pick(CAPS);
    const col: ColorFn = (_, n) => (n[1] < -0.35 ? belly : skin);
    m.anchor('feet', [0, 0, 0.15]); // the middle of its stance, between the hind and the fore feet

    // Body, head, slit mouth
    m.part('torso', [0, 0.32, 0]);
    blob(m, [0, 0.32, 0], [0.62, 0.34, 0.55], 1, 0.1, col, { j: 0.14, floorY: 0.05 });
    blob(m, [0, 0.3, 0.5], [0.34, 0.2, 0.3], 1, 0.08, skin, { j: 0.14 });
    box(m, [0, 0.25, 0.79], [0.42, 0.025, 0.03], [14, 12, 10], 0.02);
    for (const sx of [-1, 1]) {
      // Bulging eyes, glowing yellow
      blob(m, [sx * 0.2, 0.5, 0.58], [0.08, 0.065, 0.07], 0, 0.08, skin);
      blob(m, [sx * 0.2, 0.52, 0.64], [0.045, 0.016, 0.02], 0, 0.05, EYE, { e: 0.9 });
      m.halo([sx * 0.2, 0.52, 0.66], 0.1, EYE);
      // Hind leg folded along the flank, foreleg braced in front, three toes on each
      m.part(sx > 0 ? 'leg_l' : 'leg_r', [sx * 0.5, 0.25, -0.2]);
      blob(m, [sx * 0.5, 0.25, -0.2], [0.22, 0.2, 0.3], 1, 0.1, skin, { j: 0.14, floorY: 0.04 });
      frustum(m, [sx * 0.52, 0.2, -0.05], [sx * 0.64, 0.07, 0.26], 0.1, 0.07, 6, skin, { j: 0.14 });
      m.part(sx > 0 ? 'arm_l' : 'arm_r', [sx * 0.38, 0.22, 0.4]);
      frustum(m, [sx * 0.38, 0.22, 0.4], [sx * 0.4, 0.05, 0.72], 0.09, 0.06, 6, skin, { j: 0.14 });
      for (const k of [-1, 0, 1]) {
        m.part(sx > 0 ? 'leg_l' : 'leg_r');
        frustum(m, [sx * 0.64, 0.05, 0.26], [sx * (0.7 + k * 0.04), 0.02, 0.46], 0.03, 0.008, 4, skin);
        m.part(sx > 0 ? 'arm_l' : 'arm_r');
        frustum(m, [sx * 0.4, 0.04, 0.72], [sx * (0.4 + k * 0.07), 0.02, 0.86], 0.028, 0.008, 4, skin);
      }
    }

    // Warts over the back
    m.part('torso');
    for (let i = 0, n = ri(14, 22); i < n; i++) {
      const d = norm([R() - 0.5, rf(0.35, 1), R() - 0.5]);
      blob(m, [d[0] * 0.6, 0.32 + d[1] * 0.33, d[2] * 0.53], [0.045, 0.03, 0.045], 0, 0.15, wart, { j: 0.2 });
    }
    /** The top of the back at (x, z). */
    const sy = (x: number, z: number) => 0.32 + 0.34 * Math.sqrt(Math.max(0, 1 - (x / 0.62) ** 2 - (z / 0.55) ** 2));
    // Poison sacs: translucent, glowing, each with a halo
    for (let i = 0, n = ri(2, 4); i < n; i++) {
      const x = rf(-0.38, 0.38), z = rf(-0.3, 0.1), r = rf(0.09, 0.15);
      const p: Vec3 = [x, sy(x, z) + r * 0.3, z];
      blob(m, p, [r, r, r], 1, 0.12, sac, { a: 0.65, e: 0.45, j: 0.12 });
      m.halo(p, r * 2.4, sac);
    }
    // Small mushrooms
    for (let i = 0, n = ri(3, 6); i < n; i++) {
      const x = rf(-0.4, 0.4), z = rf(-0.45, 0.1);
      mush(c, [x, sy(x, z) - 0.02, z], 0.05, rf(0.07, 0.11), mulC(capTop, rf(0.8, 1.1)), capGill, { lean: [rf(-0.3, 0.3), rf(-0.3, 0.3)] });
    }

    return `${sacName} Gloomtoad`;
  },
};

export default design;
