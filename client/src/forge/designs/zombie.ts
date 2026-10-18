import type { Design } from '../core/types';
import { blob, box, frustum } from '../core/primitives';
import { hslRGB, mixC, mulC, type RGB, type Vec3 } from '../core/vec';

// Identity: grey-green rotting skin (hue locked to a narrow band), hunched, arms reaching.
// Seeds vary clothing color, build, a missing arm and whether the jaw hangs open.
const design: Design = {
  id: 'creature.zombie',
  source: { table: 'enemies', key: 'zombie' }, // data/enemies.ts › zombie
  category: 'creature',
  label: 'Zombie',
  fit: { kind: 'standing', height: 1.12, maxRadius: 0.56 }, // uniform scale: height is the limiting fit
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    const skinHue = ri(75, 115);
    const clothes = c.pick(['peasant', 'miner', 'noble', 'rags'] as const);
    const missingArm = c.chance(0.2);
    const bloated = c.chance(0.3);
    const skin = hslRGB(skinHue, rf(14, 26), rf(44, 52));
    const rot = mixC(skin, [70, 40, 50], 0.45);
    const cloth: RGB =
      clothes === 'peasant' ? [118, 92, 64] : clothes === 'miner' ? [72, 78, 92] : clothes === 'noble' ? [104, 40, 56] : [92, 86, 74];
    const trousers = mulC(cloth, 0.7);
    const hunch = rf(0.18, 0.3); // forward offset of the upper body
    const W = bloated ? 1.25 : rf(0.9, 1.05);
    m.anchor('feet', [0, 0, 0.07]); // middle of the shuffling stance: this point goes to the tile center

    // Legs: shuffling stance, one foot ahead
    for (const sx of [-1, 1]) {
      const x = sx * 0.17, step = sx > 0 ? 0.08 : -0.06;
      m.part(sx > 0 ? 'leg_l' : 'leg_r', [x, 0.95, 0]);
      frustum(m, [x, 0.95, 0], [x * 1.1, 0.12, step], 0.1, 0.075, 6, trousers);
      box(m, [x * 1.1, 0.05, step + 0.06], [0.14, 0.1, 0.26], mixC(skin, [40, 34, 30], 0.5), 0.2);
    }

    // Hunched torso: pelvis -> belly -> shoulders pushed forward, torn shirt over skin
    m.part('torso', [0, 1.0, 0]);
    const tc = (cen: Vec3, n: Vec3): RGB => (n[2] > 0.5 && Math.sin(cen[1] * 23 + cen[0] * 9) > 0.55 ? rot : cloth);
    frustum(m, [0, 0.92, 0], [0, 1.2, hunch * 0.4], 0.22 * W, 0.26 * W, 7, tc);
    frustum(m, [0, 1.2, hunch * 0.4], [0, 1.62, hunch], 0.26 * W, 0.24 * W, 7, tc);
    blob(m, [0, 1.66, hunch], [0.34 * W, 0.12, 0.2], 0, 0.15, cloth);

    // Head drooped forward, tilted, with sunken glowing eyes and a hanging jaw
    m.part('head', [0, 1.74, hunch]);
    const hx = rf(-0.05, 0.05), hy = 1.84, hz = hunch + 0.12;
    blob(m, [hx, hy, hz], [0.16, 0.17, 0.16], 1, 0.12, skin);
    for (const sx of [-1, 1]) blob(m, [hx + sx * 0.065, hy + 0.02, hz + 0.14], [0.03, 0.025, 0.015], 0, 0.1, [214, 255, 140], { e: 0.8 });
    box(m, [hx, hy - 0.13, hz + 0.08], [0.16, 0.06 + ri(0, 1) * 0.05, 0.12], rot, 0.2);

    // Arms reaching forward; the right arm (-x) may be a ragged stump
    for (const sx of [-1, 1]) {
      const sh: Vec3 = [sx * 0.32 * W, 1.62, hunch];
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      blob(m, sh, [0.1, 0.1, 0.1], 0, 0.2, cloth);
      if (sx < 0 && missingArm) {
        frustum(m, sh, [sh[0] * 1.05, 1.45, hunch + 0.08], 0.07, 0.06, 6, rot);
        continue;
      }
      const reach = rf(0.85, 1.0);
      const elbow: Vec3 = [sx * 0.34 * W, 1.5, hunch + 0.28 * reach];
      const hand: Vec3 = [sx * rf(0.24, 0.32), 1.46 + rf(-0.05, 0.05), hunch + 0.62 * reach];
      frustum(m, sh, elbow, 0.07, 0.06, 6, cloth);
      frustum(m, elbow, hand, 0.06, 0.05, 6, skin);
      box(m, hand, [0.1, 0.06, 0.14], skin, 0.25);
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', hand);
    }

    const adj = bloated ? 'Bloated' : missingArm ? 'Maimed' : 'Shambling';
    const who = clothes === 'noble' ? 'Noble' : clothes === 'miner' ? 'Miner' : clothes === 'peasant' ? 'Peasant' : 'Zombie';
    return who === 'Zombie' ? `${adj} Zombie` : `${adj} ${who} Zombie`;
  },
};
export default design;
