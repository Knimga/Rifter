import type { Design } from '../../core/types';
import type { ColorFn } from '../../core/mesh';
import { blob, box, frustum, loft, tendril } from '../../core/primitives';
import { add, hslRGB, lerp3, mixC, mul, mulC, norm, rotY, sub, type RGB, type Vec3 } from '../../core/vec';

// Identity: a big, dusky blue troll, half again a goblin's height. Short bent legs under a long torso, the upper
// back curving over in a hunch that carries the shoulders forward, the head low and thrust out ahead of them; long
// bare arms hanging to the ground like a gorilla's, the left resting on its knuckles, the right holding a big
// knobbly wooden club across in front of it, its head on the ground. Tattered brown-grey rags over the whole
// torso; two tusks pointing up from its underbite, a grey tuft of hair on its crown.
// Seeds vary the build, the skin's blue, the rags' color and tatters, the tuft, and the club's knots.
const TUSK: RGB = [212, 200, 170];
const EYE: RGB = [240, 204, 24]; // unlit
const WOOD: RGB = [86, 60, 38];
const HAIR: RGB = [128, 128, 124];
const RAGS: readonly RGB[] = [[74, 62, 50], [64, 60, 56], [80, 66, 52], [58, 54, 50]];

/**
 * A torso ring at height `y`: `rx` wide, centered `cz` forward, reaching `front` ahead and `back` behind it, so the
 * back can bulge on its own (the hunch).
 */
const ring = (y: number, cz: number, rx: number, front: number, back: number, n = 12): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, s = Math.sin(a);
    return [Math.cos(a) * rx, y, cz + s * (s > 0 ? front : back)];
  });

const design: Design = {
  id: 'creature.troll',
  source: { table: 'enemies', key: 'troll' }, // data/units/enemies.ts › troll
  category: 'creature',
  label: 'Troll',
  fit: { kind: 'standing', height: 1.3, maxRadius: 0.75 }, // half again the Goblin Warrior's 0.86
  budget: 1300,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const skin = hslRGB(c.ri(206, 220), rf(12, 18), rf(31, 36)); // dusky: a dark, greyed blue
    const skinDark = mixC(skin, [24, 26, 34], 0.4);
    const rag = c.pick(RAGS);
    const W = rf(0.94, 1.08);
    m.anchor('feet', [0, 0, 0.16]); // between the feet and the knuckles ahead of them

    // Short legs, bent at the knee in a wide stance; big flat feet
    for (const sx of [-1, 1]) {
      const hip: Vec3 = [sx * 0.14 * W, 0.38, 0];
      const knee: Vec3 = [sx * 0.21 * W, 0.22, 0.07];
      const ankle: Vec3 = [sx * 0.22 * W, 0.06, 0];
      m.part(sx > 0 ? 'leg_l' : 'leg_r', hip);
      frustum(m, hip, knee, 0.1, 0.08, 6, skin);
      blob(m, knee, [0.08, 0.08, 0.08], 0, 0.15, skin);
      frustum(m, knee, ankle, 0.08, 0.065, 6, skin);
      box(m, add(ankle, [sx * 0.01, -0.03, 0.06]), [0.15, 0.07, 0.24], skinDark, 0.25);
    }

    // A long torso, its spine curving over in the upper back (the hunch is the torso's own outline: each ring
    // higher sits further forward, the upper ones deeper behind), carrying the shoulders forward. Rags over all of
    // it in worn patches (slow waves, so neighbouring faces agree), lighter on top where the light falls
    m.part('torso', [0, 0.4, 0]);
    const ph: Vec3 = [rf(0, 6.28), rf(0, 6.28), rf(0, 6.28)];
    const torsoColor: ColorFn = (cen, n) => {
      const wear = Math.sin(cen[0] * 9 + ph[0]) + Math.sin(cen[1] * 8 + ph[1]) + Math.sin(cen[2] * 10 + ph[2]);
      const base = mulC(rag, 1 + wear * 0.07);
      return n[1] > 0.45 ? mulC(base, 1.15) : base;
    };
    loft(m, [
      ring(0.34, 0, 0.21 * W, 0.14, 0.15),
      ring(0.52, 0.04, 0.25 * W, 0.19, 0.17),
      ring(0.7, 0.11, 0.28 * W, 0.19, 0.2),
      ring(0.86, 0.19, 0.31 * W, 0.16, 0.24),
      ring(0.98, 0.26, 0.31 * W, 0.14, 0.25),
      ring(1.07, 0.33, 0.27 * W, 0.11, 0.21),
      ring(1.13, 0.4, 0.15 * W, 0.07, 0.11),
    ], torsoColor, { j: 0.16 });
    frustum(m, [0, 0.44, 0.01], [0, 0.5, 0.02], 0.235 * W, 0.24 * W, 8, mulC(rag, 0.6)); // rope belt
    // Tatters hanging from the belt over the thighs, some longer
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rf(-0.15, 0.15), len = rf(0.12, 0.24);
      const at: Vec3 = [Math.cos(a) * 0.23 * W, 0.42 - len / 2, Math.sin(a) * 0.18 + 0.01];
      const s = m.faces.length;
      box(m, at, [0.1, len, 0.02], mulC(rag, rf(0.8, 1.1)), 0.3, { j: 0.2 });
      m.xf(s, (p) => add(at, rotY(sub(p, at), Math.PI / 2 - a))); // each strip faces out from the hips
    }

    // Head: low, thrust out ahead of the shoulders. A heavy brow over small dull eyes, a broad nose, a jutting
    // lower jaw with two tusks pointing up from its corners, small pointed ears
    const hc: Vec3 = [0, 0.98, 0.62];
    m.part('head', [0, 1.03, 0.44]);
    frustum(m, [0, 1.03, 0.42], hc, 0.11, 0.1, 6, skin); // neck
    blob(m, hc, [0.14, 0.13, 0.14], 1, 0.1, skin);
    box(m, add(hc, [0, 0.045, 0.1]), [0.2, 0.045, 0.07], skinDark, 0.15); // brow
    box(m, add(hc, [0, -0.08, 0.07]), [0.21, 0.08, 0.14], skinDark, 0.15); // jaw
    blob(m, add(hc, [0, -0.005, 0.14]), [0.04, 0.035, 0.04], 0, 0.2, skin); // nose
    for (const sx of [-1, 1]) {
      blob(m, add(hc, [sx * 0.05, 0.005, 0.135]), [0.026, 0.019, 0.012], 0, 0.05, EYE, { j: 0.05 });
      const root = add(hc, [sx * 0.075, -0.05, 0.13]);
      frustum(m, root, add(root, [sx * 0.03, 0.104, 0.06]), 0.02, 0.003, 4, TUSK, { j: 0.08 }); // tipped ~30deg forward
      frustum(m, add(hc, [sx * 0.11, 0.02, -0.02]), add(hc, [sx * 0.2, 0.06, -0.06]), 0.035, 0.004, 4, skinDark);
    }
    // A tuft of grey hair on the crown: a few three-sided spikes sweeping forward and curving down
    const tufts = c.ri(4, 6);
    for (let i = 0; i < tufts; i++) {
      const x = ((i / (tufts - 1)) * 2 - 1) * 0.06 + rf(-0.01, 0.01);
      tendril(m, add(hc, [x, 0.11, rf(-0.06, -0.02)]), [x * 1.5, 0.6, 1], rf(0.13, 0.17), 3, 0.03,
        mulC(HAIR, rf(0.85, 1.05)), { sides: 3, bend: (t) => [0, -t * t * 0.09, 0] });
    }

    // Long bare arms hanging to the ground, elbows out: the left on its knuckles, the right a little higher,
    // its fist around the club's handle
    const hands: Vec3[] = [];
    for (const sx of [-1, 1] as const) {
      const sh: Vec3 = [sx * 0.31 * W, 1.0, 0.33];
      const elbow: Vec3 = [sx * rf(0.45, 0.48) * W, 0.58, 0.38];
      const hand: Vec3 = sx > 0 ? [0.45 * W, 0.08, 0.5] : [-0.48 * W, 0.24, 0.48];
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      blob(m, sh, [0.13, 0.12, 0.13], 0, 0.15, skin);
      frustum(m, sh, elbow, 0.11, 0.085, 6, skin);
      blob(m, elbow, [0.085, 0.085, 0.085], 0, 0.15, skin);
      frustum(m, elbow, hand, 0.085, 0.085, 6, skin); // thick forearms, like an ape's
      blob(m, hand, [0.095, 0.085, 0.1], 0, 0.2, skinDark);
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', hand);
      hands.push(hand);
    }

    // Club: a thick wooden branch from the right fist, held in front of the body and pointing inward across it,
    // its swollen knobbly head resting on the ground (sideways to the camera, never toward it: style guide, "Camera")
    m.part('weapon', hands[0]);
    const grip = hands[0];
    const head = add(grip, rotY(sub([-0.86 * W, 0.13, 0.56], grip), (150 * Math.PI) / 180)); // turned 150deg in from the side
    const dir = norm(sub(head, grip));
    frustum(m, add(grip, mul(dir, -0.09)), lerp3(grip, head, 0.5), 0.042, 0.065, 6, WOOD, { j: 0.15 });
    frustum(m, lerp3(grip, head, 0.5), head, 0.065, 0.12, 7, WOOD, { j: 0.15 });
    blob(m, head, [0.13, 0.12, 0.13], 0, 0.2, mulC(WOOD, 1.1));
    const knots = c.ri(3, 5);
    for (let i = 0; i < knots; i++) {
      const t = rf(0.55, 1), a = rf(0, 6.28);
      const at = add(lerp3(grip, head, t), [0, Math.cos(a) * 0.09 * t, Math.sin(a) * 0.09 * t]);
      blob(m, at, [0.045, 0.045, 0.045], 0, 0.3, mulC(WOOD, rf(0.8, 1.05))); // knots
    }

    return 'Troll';
  },
};
export default design;
